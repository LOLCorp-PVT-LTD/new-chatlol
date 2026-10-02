import { config } from '../config.js';
import { putImage, readImage, sniffImage } from '../lib/storage.js';

/**
 * Minimal client for NVIDIA NIM's OpenAI-compatible API (https://integrate.api.nvidia.com/v1).
 * Each API key has its own token bucket so we stay inside the free per-key rate limit; more keys, more requests.
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

// ——— Keys: each has its own per-minute allowance; requests go to whichever key has room ———
const keys = config.nim.apiKeys.map((key) => ({ key, limiter: new Limiter(Math.max(1, config.nim.rpm)), restUntil: 0, dead: false }));
const tail = (k) => `…${k.key.slice(-4)}`;

export const nimEnabled = () => keys.some((k) => !k.dead);

/** The key with the most room right now (resting and rejected keys skipped). */
function pickKey() {
  const now = Date.now();
  const usable = keys.filter((k) => !k.dead && k.restUntil < now);
  if (!usable.length) return null;
  usable.forEach((k) => k.limiter.refill());
  return usable.reduce((a, b) => (b.limiter.tokens - b.limiter.queue.length > a.limiter.tokens - a.limiter.queue.length ? b : a));
}

/**
 * POSTs to NIM with the best key. 429 rests that key for a minute and tries another; 401/403 sets the key aside
 * (logged once). Returns the Response, or null if no key could be used.
 */
async function nimPost(url, body, { timeout = 25_000, maxQueue = 20 } = {}) {
  for (let attempt = 0; attempt < Math.max(1, keys.length); attempt++) {
    const k = pickKey();
    if (!k) return null;
    try {
      await k.limiter.take(maxQueue);
    } catch {
      return null; // every key is busy and the queue is full: the caller falls back
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${k.key}`, Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    });
    if (res.status === 429) {
      k.restUntil = Date.now() + 60_000;
      console.warn(`[nim] key ${tail(k)} hit its rate limit; resting it for a minute`);
      continue;
    }
    if (res.status === 401 || res.status === 403) {
      k.dead = true;
      console.warn(`[nim] key ${tail(k)} was rejected (${res.status}); not using it again until restart`);
      continue;
    }
    return res;
  }
  return null;
}
export { nimPost };

// ——— Models: retired ones drop out, fast ones get most of the traffic ———
/** Fast, free chat models to fall back on when the configured ones are retired (first match in NVIDIA's catalogue wins). */
const FAST_MODELS = [
  'meta/llama-3.3-70b-instruct',
  'meta/llama-4-scout-17b-16e-instruct',
  'meta/llama-4-maverick-17b-128e-instruct',
  'mistralai/mistral-small-3.1-24b-instruct-2503',
  'mistralai/mistral-small-24b-instruct',
  'google/gemma-3-27b-it',
  'google/gemma-3-12b-it',
  'qwen/qwen2.5-7b-instruct',
  'microsoft/phi-4-mini-instruct',
  'nvidia/llama-3.1-nemotron-nano-8b-v1',
  'meta/llama-3.2-3b-instruct',
];
const VISION_MODELS = [
  'meta/llama-4-scout-17b-16e-instruct',
  'meta/llama-4-maverick-17b-128e-instruct',
  'meta/llama-3.2-90b-vision-instruct',
  'meta/llama-3.2-11b-vision-instruct',
];
/** Chat models in a catalogue we'd rather not use for quick social replies (slow reasoning, code, huge, non-chat). */
const NOT_CHAT =
  /vision|-vl|embed|guard|safety|reward|coder|code|405b|deepseek-r1|qwq|reason|math|translat|parse|retriev|rerank|nemotron-(super|ultra)/i;

let pool = [...config.nim.models];
let chatModel = config.nim.chatModel;
let visionModel = config.nim.visionModel;
const dead = new Set(); // 404 / 410: retired or unknown
const resting = new Map(); // model → resting until (5xx, timeouts)
const latency = new Map(); // model → smoothed response time in ms

const usableModel = (m) => !!m && !dead.has(m) && (resting.get(m) ?? 0) < Date.now();
export const activeModels = () => ({ pool: pool.filter(usableModel), chatModel: usableModel(chatModel) ? chatModel : null, visionModel });

/** Weighted towards faster models (weight 1/latency²); models never timed yet get a fair middle estimate. */
function pickModel(preferred) {
  if (preferred && preferred === config.nim.chatModel) preferred = chatModel;
  if (usableModel(preferred)) return preferred;
  const healthy = pool.filter(usableModel);
  if (!healthy.length) return null;
  const w = healthy.map((m) => 1 / (latency.get(m) ?? 1500) ** 2);
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < healthy.length; i++) if ((r -= w[i]) <= 0) return healthy[i];
  return healthy.at(-1);
}

function retire(model, status) {
  if (dead.has(model)) return;
  dead.add(model);
  console.warn(
    `[nim] ${model} → ${status}: NVIDIA no longer serves it; dropped. Using ${pool.filter(usableModel).join(', ') || 'no models!'}`,
  );
}

/**
 * Checks NVIDIA's live catalogue: drops models it no longer lists and, if fewer than 4 are left, adds fast free
 * ones. Runs at startup and every 6 hours. Keeps the current list if the catalogue can't be read.
 */
export async function refreshModels() {
  const k = keys.find((x) => !x.dead);
  if (!k) return null;
  try {
    const res = await fetch(`${config.nim.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${k.key}` },
      signal: AbortSignal.timeout(10_000),
    });
    const ids = new Set((res.ok ? ((await res.json())?.data ?? []) : []).map((m) => m?.id).filter(Boolean));
    if (!ids.size) return null;
    const removed = pool.filter((m) => !ids.has(m));
    const kept = pool.filter((m) => ids.has(m));
    const extra = [...FAST_MODELS, ...[...ids].filter((m) => /instruct|-it$|chat/i.test(m) && !NOT_CHAT.test(m)).sort()].filter(
      (m) => ids.has(m) && !kept.includes(m) && !NOT_CHAT.test(m),
    );
    pool = [...kept, ...extra.slice(0, Math.max(0, 4 - kept.length))];
    if (!ids.has(chatModel)) chatModel = pool[0] ?? chatModel;
    if (visionModel && !ids.has(visionModel)) visionModel = VISION_MODELS.find((m) => ids.has(m)) ?? '';
    for (const m of removed) dead.add(m);
    return { pool, chatModel, visionModel, removed };
  } catch {
    return null;
  }
}

/** Chat completion. On a failed or empty answer it retries on other healthy models (`opts.retries`, default 1). */
export async function nimChat(messages, opts = {}) {
  if (!nimEnabled()) return null;
  const tried = new Set();
  for (let attempt = 0; attempt <= (opts.retries ?? 1); attempt++) {
    const model = attempt === 0 ? pickModel(opts.model) : pickModel(pool.find((m) => !tried.has(m) && usableModel(m)));
    if (!model || tried.has(model)) break;
    tried.add(model);
    const out = await chatOnce(model, messages, opts);
    if (out) return out;
  }
  return null;
}

async function chatOnce(model, messages, opts) {
  const started = Date.now();
  try {
    const res = await nimPost(`${config.nim.baseUrl}/chat/completions`, {
      model,
      messages,
      max_tokens: opts.maxTokens ?? 120,
      temperature: opts.temperature ?? 0.9,
      top_p: 0.95,
      stream: false,
    });
    if (!res) return null;
    if (!res.ok) {
      if (res.status === 404 || res.status === 410) retire(model, res.status);
      else {
        if (res.status === 400 || res.status >= 500) resting.set(model, Date.now() + 10 * 60_000);
        console.warn(`[nim] ${model} → ${res.status}`);
      }
      return null;
    }
    const data = await res.json();
    const ms = Date.now() - started;
    latency.set(model, Math.round((latency.get(model) ?? ms) * 0.7 + ms * 0.3));
    return cleanText(data.choices?.[0]?.message?.content ?? '') || null;
  } catch (e) {
    resting.set(model, Date.now() + 2 * 60_000); // timed out: give it a short rest
    console.warn(`[nim] ${model} failed: ${e.message}`);
    return null;
  }
}

/** Describe / react to an image with a vision model. Local uploads are inlined as base64. */
export async function nimVision(prompt, imageUrl, system) {
  if (!nimEnabled() || !visionModel) return null;
  try {
    const buf = await readImage(imageUrl, 180_000); // NIM inline image limit; larger images fall back to text-only
    const type = buf && sniffImage(buf);
    if (!buf || !type) return null;
    const src = `data:${type.mime};base64,${buf.toString('base64')}`;
    const model = visionModel;
    const res = await nimPost(
      `${config.nim.baseUrl}/chat/completions`,
      {
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: `${prompt} <img src="${src}" />` },
        ],
        max_tokens: 100,
        temperature: 0.8,
      },
      { timeout: 30_000 },
    );
    if (res && (res.status === 404 || res.status === 410)) {
      console.warn(`[nim] vision model ${model} → ${res.status}: retired; photo reactions use text only until a replacement is found`);
      visionModel = '';
    }
    if (!res?.ok) return null;
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
    const res = await nimPost(
      config.nim.imageUrl,
      {
        prompt: `${prompt}, candid smartphone photo, natural warm lighting, realistic, no text, no watermark`,
        width: 768,
        height: 960,
        steps: 4,
        seed: Math.floor(Math.random() * 1e9),
        cfg_scale: 0,
      },
      { timeout: 60_000, maxQueue: 5 },
    );
    if (!res?.ok) {
      if (res) console.warn('[nim] image', res.status);
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
