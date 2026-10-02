import { config } from '../config.js';
import { putImage, readImage, sniffImage } from '../lib/storage.js';

/**
 * Minimal client for NVIDIA NIM's OpenAI-compatible API (https://integrate.api.nvidia.com/v1).
 * Requests go through a shared token bucket so we stay inside free-tier rate limits.
 */
class Limiter {
  tokens;
  last = Date.now();
  queue = [];
  constructor(perMinute) {
    this.perMinute = perMinute;
    this.tokens = perMinute;
  }
  refill() {
    const t = Date.now();
    this.tokens = Math.min(this.perMinute, this.tokens + ((t - this.last) / 60_000) * this.perMinute);
    this.last = t;
  }
  /** Resolves when a slot is free. Rejects immediately if the queue is backed up (caller falls back). */
  take(maxQueue = 20) {
    this.refill();
    if (this.tokens >= 1 && !this.queue.length) {
      this.tokens -= 1;
      return Promise.resolve();
    }
    if (this.queue.length >= maxQueue) return Promise.reject(new Error('nim queue full'));
    return new Promise((resolve) => {
      this.queue.push(resolve);
      if (this.queue.length === 1) this.drain();
    });
  }
  drain() {
    const tick = () => {
      this.refill();
      while (this.tokens >= 1 && this.queue.length) {
        this.tokens -= 1;
        this.queue.shift()();
      }
      if (this.queue.length) setTimeout(tick, Math.ceil(60_000 / this.perMinute));
    };
    setTimeout(tick, Math.ceil(60_000 / this.perMinute));
  }
}

const limiter = new Limiter(Math.max(1, config.nim.rpm));
const failures = new Map(); // model → unhealthy-until timestamp

export const nimEnabled = () => !!config.nim.apiKey;

function pickModel(preferred) {
  const healthy = config.nim.models.filter((m) => (failures.get(m) ?? 0) < Date.now());
  if (preferred && (failures.get(preferred) ?? 0) < Date.now()) return preferred;
  return healthy[Math.floor(Math.random() * healthy.length)] ?? config.nim.models[0];
}

/** Chat completion. On a failed or empty answer it retries on other healthy models (`opts.retries`, default 1). */
export async function nimChat(messages, opts = {}) {
  if (!nimEnabled()) return null;
  const tried = new Set();
  for (let attempt = 0; attempt <= (opts.retries ?? 1); attempt++) {
    const model = attempt === 0 ? pickModel(opts.model) : pickModel(config.nim.models.find((m) => !tried.has(m)));
    if (tried.has(model)) break;
    tried.add(model);
    const out = await chatOnce(model, messages, opts);
    if (out) return out;
  }
  return null;
}

async function chatOnce(model, messages, opts) {
  try {
    await limiter.take();
    const res = await fetch(`${config.nim.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.nim.apiKey}`, Accept: 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: opts.maxTokens ?? 120,
        temperature: opts.temperature ?? 0.9,
        top_p: 0.95,
        stream: false,
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) {
      if (res.status === 404 || res.status === 400 || res.status >= 500) failures.set(model, Date.now() + 10 * 60_000);
      console.warn(`[nim] ${model} → ${res.status}`);
      return null;
    }
    const data = await res.json();
    return cleanText(data.choices?.[0]?.message?.content ?? '') || null;
  } catch (e) {
    console.warn('[nim] chat failed:', e.message);
    return null;
  }
}

/** Describe / react to an image with a vision model. Local uploads are inlined as base64. */
export async function nimVision(prompt, imageUrl, system) {
  if (!nimEnabled() || !config.nim.visionModel) return null;
  try {
    const buf = await readImage(imageUrl, 180_000); // NIM inline image limit; larger images fall back to text-only
    const type = buf && sniffImage(buf);
    if (!buf || !type) return null;
    const src = `data:${type.mime};base64,${buf.toString('base64')}`;
    await limiter.take();
    const res = await fetch(`${config.nim.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.nim.apiKey}` },
      body: JSON.stringify({
        model: config.nim.visionModel,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: `${prompt} <img src="${src}" />` },
        ],
        max_tokens: 100,
        temperature: 0.8,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return cleanText(data.choices?.[0]?.message?.content ?? '') || null;
  } catch {
    return null;
  }
}

/** Generates a photo with a NIM visual model (FLUX.1-schnell by default) and stores it in uploads. */
export async function nimImage(prompt) {
  if (!nimEnabled() || !config.nim.imageUrl) return null;
  try {
    await limiter.take(5);
    const res = await fetch(config.nim.imageUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.nim.apiKey}`, Accept: 'application/json' },
      body: JSON.stringify({
        prompt: `${prompt}, candid smartphone photo, natural warm lighting, realistic, no text, no watermark`,
        width: 768,
        height: 960,
        steps: 4,
        seed: Math.floor(Math.random() * 1e9),
        cfg_scale: 0,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      console.warn('[nim] image', res.status);
      return null;
    }
    const data = await res.json();
    const art = data.artifacts?.[0];
    const b64 = art?.base64 ?? data.image;
    if (!b64 || art?.finishReason === 'CONTENT_FILTERED') return null;
    return await putImage(Buffer.from(b64, 'base64'), 'ai');
  } catch (e) {
    console.warn('[nim] image failed:', e.message);
    return null;
  }
}

/** Strips model artefacts: surrounding quotes, "Name:" prefixes, <think> blocks, trailing hashtags spam. */
export function cleanText(s) {
  return s
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/^\s*(["'“])(.*)\1\s*$/s, '$2')
    .replace(/^\s*@?[\w.]+:\s*/, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n') // keep line breaks: DMs send each line as its own text bubble
    .trim()
    .slice(0, 400);
}
