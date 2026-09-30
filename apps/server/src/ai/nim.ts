import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { config } from '../config';
import { newId } from '../db';

export interface ChatMsg { role: 'system' | 'user' | 'assistant'; content: string }

/**
 * Minimal client for NVIDIA NIM's OpenAI-compatible API (https://integrate.api.nvidia.com/v1).
 * Requests go through a shared token bucket so we stay inside free-tier rate limits.
 */
class Limiter {
  private tokens: number;
  private last = Date.now();
  private queue: (() => void)[] = [];
  constructor(private perMinute: number) { this.tokens = perMinute; }
  private refill() {
    const t = Date.now();
    this.tokens = Math.min(this.perMinute, this.tokens + ((t - this.last) / 60_000) * this.perMinute);
    this.last = t;
  }
  /** Resolves when a slot is free. Rejects immediately if the queue is backed up (caller falls back). */
  take(maxQueue = 20): Promise<void> {
    this.refill();
    if (this.tokens >= 1 && !this.queue.length) { this.tokens -= 1; return Promise.resolve(); }
    if (this.queue.length >= maxQueue) return Promise.reject(new Error('nim queue full'));
    return new Promise((resolve) => {
      this.queue.push(resolve);
      if (this.queue.length === 1) this.drain();
    });
  }
  private drain() {
    const tick = () => {
      this.refill();
      while (this.tokens >= 1 && this.queue.length) { this.tokens -= 1; this.queue.shift()!(); }
      if (this.queue.length) setTimeout(tick, Math.ceil(60_000 / this.perMinute));
    };
    setTimeout(tick, Math.ceil(60_000 / this.perMinute));
  }
}

const limiter = new Limiter(Math.max(1, config.nim.rpm));
const failures = new Map<string, number>(); // model → unhealthy-until timestamp

export const nimEnabled = () => !!config.nim.apiKey;

function pickModel(preferred?: string) {
  const healthy = config.nim.models.filter((m) => (failures.get(m) ?? 0) < Date.now());
  if (preferred && healthy.includes(preferred)) return preferred;
  return healthy[Math.floor(Math.random() * healthy.length)] ?? config.nim.models[0];
}

export async function nimChat(messages: ChatMsg[], opts: { model?: string; maxTokens?: number; temperature?: number } = {}): Promise<string | null> {
  if (!nimEnabled()) return null;
  const model = pickModel(opts.model);
  try {
    await limiter.take();
    const res = await fetch(`${config.nim.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.nim.apiKey}`, Accept: 'application/json' },
      body: JSON.stringify({ model, messages, max_tokens: opts.maxTokens ?? 120, temperature: opts.temperature ?? 0.9, top_p: 0.95, stream: false }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) {
      if (res.status === 404 || res.status === 400 || res.status >= 500) failures.set(model, Date.now() + 10 * 60_000);
      console.warn(`[nim] ${model} → ${res.status}`);
      return null;
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return cleanText(data.choices?.[0]?.message?.content ?? '') || null;
  } catch (e) {
    console.warn('[nim] chat failed:', (e as Error).message);
    return null;
  }
}

/** Describe / react to an image with a vision model. Local uploads are inlined as base64. */
export async function nimVision(prompt: string, imageUrl: string, system: string): Promise<string | null> {
  if (!nimEnabled() || !config.nim.visionModel) return null;
  try {
    let src = imageUrl;
    if (imageUrl.startsWith(`${config.publicUrl}/uploads/`)) {
      const buf = await readFile(join(config.uploadDir, basename(imageUrl)));
      if (buf.length > 180_000) return null; // NIM inline image limit; larger images fall back to text-only
      const ext = imageUrl.split('.').pop()?.toLowerCase() === 'png' ? 'png' : 'jpeg';
      src = `data:image/${ext};base64,${buf.toString('base64')}`;
    }
    await limiter.take();
    const res = await fetch(`${config.nim.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.nim.apiKey}` },
      body: JSON.stringify({
        model: config.nim.visionModel,
        messages: [{ role: 'system', content: system }, { role: 'user', content: `${prompt} <img src="${src}" />` }],
        max_tokens: 100, temperature: 0.8,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return cleanText(data.choices?.[0]?.message?.content ?? '') || null;
  } catch {
    return null;
  }
}

/** Generates a photo with a NIM visual model (FLUX.1-schnell by default) and stores it in uploads. */
export async function nimImage(prompt: string): Promise<string | null> {
  if (!nimEnabled() || !config.nim.imageUrl) return null;
  try {
    await limiter.take(5);
    const res = await fetch(config.nim.imageUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.nim.apiKey}`, Accept: 'application/json' },
      body: JSON.stringify({
        prompt: `${prompt}, candid smartphone photo, natural warm lighting, realistic, no text, no watermark`,
        width: 768, height: 960, steps: 4, seed: Math.floor(Math.random() * 1e9), cfg_scale: 0,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) { console.warn('[nim] image', res.status); return null; }
    const data = (await res.json()) as { artifacts?: { base64?: string; finishReason?: string }[]; image?: string };
    const art = data.artifacts?.[0];
    const b64 = art?.base64 ?? data.image;
    if (!b64 || art?.finishReason === 'CONTENT_FILTERED') return null;
    const name = `${newId('ai')}.jpg`;
    await mkdir(config.uploadDir, { recursive: true });
    await writeFile(join(config.uploadDir, name), Buffer.from(b64, 'base64'));
    return `${config.publicUrl}/uploads/${name}`;
  } catch (e) {
    console.warn('[nim] image failed:', (e as Error).message);
    return null;
  }
}

/** Strips model artefacts: surrounding quotes, "Name:" prefixes, <think> blocks, trailing hashtags spam. */
export function cleanText(s: string) {
  return s
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/^\s*(["'“])(.*)\1\s*$/s, '$2')
    .replace(/^\s*@?[\w.]+:\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400);
}
