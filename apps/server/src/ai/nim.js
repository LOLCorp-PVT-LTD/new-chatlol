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
/**
 * Candidate free chat models. NVIDIA's /models lists ids that 404 when called, so refreshModels() probes each one
 * with a tiny real request and only keeps those that answer. Fast models get most traffic (latency weighting).
 */
const CANDIDATES = [
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'meta/llama-3.3-70b-instruct',
  'meta/llama-3.1-8b-instruct',
  'meta/llama-4-scout-17b-16e-instruct',
  'meta/llama-4-maverick-17b-128e-instruct',
  'meta/llama-3.2-3b-instruct',
  'mistralai/mistral-small-3.1-24b-instruct-2503',
  'mistralai/mistral-small-24b-instruct',
  'google/gemma-3-27b-it',
  'qwen/qwen2.5-7b-instruct',
  'qwen/qwen3-235b-a22b',
  'microsoft/phi-4-mini-instruct',
  'nvidia/llama-3.1-nemotron-nano-8b-v1',
  'nvidia/nemotron-3-nano-30b-a3b',
  'nvidia/nemotron-3-super-120b-a12b',
  'nvidia/llama-3.3-nemotron-super-49b-v1.5',
  'nvidia/llama-3.1-nemotron-ultra-253b-v1',
  'deepseek-ai/deepseek-v4-flash',
  'deepseek-ai/deepseek-v4-pro',
  'deepseek-ai/deepseek-v3.2',
  'deepseek-ai/deepseek-v3.1',
  'moonshotai/kimi-k2.6',
  'moonshotai/kimi-k2-thinking',
  'minimaxai/minimax-m3',
  'minimaxai/minimax-m2.1',
  'z-ai/glm5',
  'z-ai/glm4.7',
  'thinkingmachines/inkling',
];
const MAX_POOL = Math.max(4, Number(process.env.NIM_MAX_POOL ?? 24));

/** Chat models in a catalogue we'd rather not use for quick social replies (slow reasoning, code, huge, non-chat). */
const NOT_CHAT =
  /vision|-vl|embed|guard|safety|reward|coder|code|405b|deepseek-r1|qwq|reason|math|translat|parse|retriev|rerank|nemotron-(super|ultra)/i;

// ——— Registry: what we learned about each model, saved (via setModelStore) so a restart begins from known-good models ———
const registry = new Map(); // id → { status: 'ok' | 'dead', latencyMs, okAt, checkedAt, fails, reason }
let store = null;
let saveTimer = null;
/** Sticky model: the last one that answered. Used first until it fails, then the fastest working one takes over. */
let current = null;
function persist() {
  if (!store) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => store.save({ models: Object.fromEntries(registry), current }).catch((e) => console.warn('[nim] saving model registry failed:', e.message)), 500);
  saveTimer.unref?.();
}
function note(model, patch) {
  registry.set(model, { fails: 0, ...registry.get(model), ...patch, checkedAt: Date.now() });
}

let pool = [...config.nim.models];
let chatModel = config.nim.chatModel;
let visionModel = config.nim.visionModel;
const dead = new Set(); // 404 / 410: retired or unknown
const resting = new Map(); // model → resting until (5xx, timeouts)
const latency = new Map(); // model → smoothed response time in ms

const usableModel = (m) => !!m && !dead.has(m) && (resting.get(m) ?? 0) < Date.now();
export const activeModels = () => ({ pool: pool.filter(usableModel), chatModel: usableModel(chatModel) ? chatModel : null, visionModel, current: usableModel(current) ? current : null });

/** Fastest healthy model not in `skip` (models never timed yet count as 1.5 s). */
const fastest = (skip = new Set()) =>
  pool.filter((m) => usableModel(m) && !skip.has(m)).sort((x, y) => (latency.get(x) ?? 1500) - (latency.get(y) ?? 1500))[0] ?? null;

/** First working model from NIM_PREFERRED_MODELS (not in `skip`). */
const preferredModel = (skip = new Set()) => config.nim.preferred.find((m) => usableModel(m) && !skip.has(m)) ?? null;
/** Next model to try after a failure: preferred ones first, then the fastest. */
const nextModel = (skip) => preferredModel(skip) ?? fastest(skip);

/** An explicitly requested model if it works, else the sticky model, else a preferred one, else the fastest. */
function pickModel(preferred) {
  if (preferred && preferred === config.nim.chatModel) preferred = usableModel(chatModel) ? chatModel : null;
  if (usableModel(preferred)) return preferred;
  if (usableModel(current)) return current;
  return nextModel();
}

/** Remember the model that just answered (saved, so it survives restarts). */
function stick(model) {
  if (model === current) return;
  console.log(`[nim] now using ${model}${current ? ` (was ${current})` : ''}`);
  current = model;
  persist();
}

function retire(model, status) {
  if (dead.has(model)) return;
  dead.add(model);
  note(model, { status: 'dead', reason: `HTTP ${status} while chatting`, fails: (registry.get(model)?.fails ?? 0) + 1 });
  persist();
  console.warn(
    `[nim] ${model} → ${status}: NVIDIA no longer serves it; dropped. Using ${pool.filter(usableModel).join(', ') || 'no models!'}`,
  );
}

/** Turns thinking off: chat-template switches (Nemotron 3, Qwen3, GLM, DeepSeek V3.1+) plus Nemotron's "/no_think" prompt tag. */
const NO_THINK = { chat_template_kwargs: { enable_thinking: false, thinking: false } };
const noThinkMessages = (messages) =>
  messages[0]?.role === 'system'
    ? [{ ...messages[0], content: `/no_think\n${messages[0].content}` }, ...messages.slice(1)]
    : [{ role: 'system', content: '/no_think' }, ...messages];

const PROBE_MESSAGES = [
  { role: 'system', content: 'You are Mia, 24, a film photographer in Seattle. Text like a real person: warm, casual, lowercase, one or two short sentences. Never explain your reasoning.' },
  { role: 'user', content: 'hey whats up' },
];

/**
 * Tiny real request. Returns { ok: true } | { ok: false, dead, reasoning, reason }
 * (dead = retire it; otherwise inconclusive). noThink sends the thinking-off switches. Skips the limiter on purpose.
 */
async function probe(key, model, { noThink = false, timeout = 45_000 } = {}) {
  const started = Date.now();
  try {
    const res = await fetch(`${config.nim.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, Accept: 'application/json' },
      body: JSON.stringify({
        model,
        messages: noThink ? noThinkMessages(PROBE_MESSAGES) : PROBE_MESSAGES,
        max_tokens: 200,
        temperature: 0.8,
        stream: false,
        ...(noThink ? NO_THINK : {}),
      }),
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) {
      const body = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160);
      return { ok: false, dead: res.status === 404 || res.status === 410, reason: `HTTP ${res.status} ${body}` };
    }
    const msg = (await res.json())?.choices?.[0]?.message ?? {};
    const text = cleanText(msg.content ?? '');
    if (!text) {
      const reasoning = !!(msg.reasoning_content || msg.reasoning);
      return { ok: false, dead: true, reasoning, reason: reasoning ? 'reasoning model: no answer within 200 tokens' : 'empty reply' };
    }
    if (looksLikeReasoning(text)) return { ok: false, dead: true, reasoning: true, reason: `leaks its reasoning as the reply: "${text.slice(0, 70)}…"` };
    const ms = Date.now() - started;
    latency.set(model, Math.round((latency.get(model) ?? ms) * 0.5 + ms * 0.5));
    return { ok: true };
  } catch (e) {
    return { ok: false, dead: false, reason: `${e.name}: ${e.message}` };
  }
}

/** Probe; a model that only thinks gets a second try with thinking switched off (remembered as noThink). */
async function probeModel(key, model, opts) {
  const r = await probe(key, model, opts);
  if (r.ok || !r.reasoning) return { ...r, noThink: false };
  const r2 = await probe(key, model, { ...opts, noThink: true });
  return r2.ok ? { ...r2, noThink: true } : r;
}

const sleep = (ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());
const PROBE_GAP_MS = Number(process.env.NIM_PROBE_GAP_MS ?? 1500);
/** Catalogue ids that are never chat models (embeddings, safety, vision-only, speech, bio…). */
const NEVER =
  /embed|rerank|guard|safety|reward|parse|retriev|clip|vila|diffusion|flux|stable|vision|-vl\b|ocr|translate|riva|tts|asr|bge|paligemma|neva|kosmos|fuyu|cosmos|genmol|molmim|alphafold|deplot|cuopt|sdxl|segment|audio|speech|whisper|parakeet|canary/i;

const fixChatModel = () => {
  if (!pool.includes(chatModel)) chatModel = pool.find((m) => /llama-3\.3-70b|gpt-oss-120b/.test(m)) ?? pool[0] ?? chatModel;
};

/**
 * Plug in a place to keep the registry (MongoDB). Loads what was saved last time so the pool is usable instantly,
 * before the first catalogue check finishes. store = { load(): Promise<object>, save(object): Promise }.
 */
export async function setModelStore(s) {
  store = s;
  try {
    const raw = (await s.load()) ?? {};
    const saved = raw.models ?? raw; // older saves were the bare model map
    for (const [id, r] of Object.entries(saved)) registry.set(id, r);
    current = preferredModel() ?? raw.current ?? null; // restart: preferred model first, else where we left off
    const ok = [...registry].filter(([, r]) => r.status === 'ok').sort((a, b) => (a[1].latencyMs ?? 1e9) - (b[1].latencyMs ?? 1e9));
    for (const [id, r] of registry) {
      if (r.status === 'ok' && r.latencyMs) latency.set(id, r.latencyMs);
      if (r.status === 'dead') dead.add(id);
    }
    if (ok.length) {
      pool = ok.map(([id]) => id).slice(0, MAX_POOL);
      fixChatModel();
    }
    return { saved: registry.size, usable: ok.length };
  } catch (e) {
    console.warn('[nim] loading saved models failed:', e.message);
    return null;
  }
}

/**
 * Checks NVIDIA's live catalogue and probes models with a real request: the configured ones, models saved as
 * working, built-in CANDIDATES, models never seen before (new releases are picked up automatically) and models
 * saved as dead (so a model that comes back is re-added). Results are saved. Runs at startup and every 6 hours.
 * Keeps the current list if the catalogue can't be read.
 */
export async function refreshModels() {
  const k = pickKey() ?? keys.find((x) => !x.dead);
  if (!k) return null;
  try {
    const res = await fetch(`${config.nim.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${k.key}` },
      signal: AbortSignal.timeout(10_000),
    });
    const ids = new Set((res.ok ? ((await res.json())?.data ?? []) : []).map((m) => m?.id).filter(Boolean));
    if (!ids.size) return null;
    const known = new Set(registry.keys());
    const removed = pool.filter((m) => !ids.has(m));
    const kept = pool.filter((m) => ids.has(m));
    const saved = (st) => [...registry].filter(([id, r]) => r.status === st && ids.has(id)).map(([id]) => id);
    const fresh = [...ids].filter((m) => !known.has(m) && !NEVER.test(m)).sort();
    const dynamic = [...ids].filter((m) => /instruct|-it$|chat/i.test(m) && !NOT_CHAT.test(m) && !NEVER.test(m)).sort();
    const order = [
      ...new Set([...config.nim.preferred.filter((m) => ids.has(m)), ...kept, ...saved('ok'), ...CANDIDATES.filter((m) => ids.has(m)), ...FAST_MODELS.filter((m) => ids.has(m)), ...fresh, ...dynamic, ...saved('dead')]),
    ].slice(0, 90);

    const good = [];
    const added = [];
    const retryLater = [];
    const accept = (m, r) => {
      if (r.ok) {
        good.push(m);
        dead.delete(m);
        resting.delete(m);
        if (!known.has(m)) added.push(m);
        note(m, { status: 'ok', latencyMs: latency.get(m), okAt: Date.now(), fails: 0, reason: '', noThink: r.noThink });
        if (r.noThink) console.log(`[nim] ${m} works with thinking switched off`);
        pool = [...new Set([...good, ...pool.filter(usableModel)])].slice(0, MAX_POOL); // usable right away, not after the whole scan
        return true;
      }
      if (r.dead) {
        if (registry.get(m)?.status !== 'dead') console.warn(`[nim] ${m} dropped: ${r.reason}`);
        dead.add(m);
        note(m, { status: 'dead', reason: r.reason, fails: (registry.get(m)?.fails ?? 0) + 1 });
        return true;
      }
      return false;
    };
    for (let i = 0; i < order.length; i += 4) {
      if (i) await sleep(PROBE_GAP_MS); // stay under the free per-minute limit
      const batch = order.slice(i, i + 4);
      const out = await Promise.all(batch.map((m) => probeModel(k.key, m)));
      batch.forEach((m, j) => {
        if (!accept(m, out[j])) retryLater.push(m);
      });
    }
    // Timeouts / 429 / 5xx: one more try each, one at a time with a longer timeout (big models are slow under load)
    for (const m of retryLater) {
      await sleep(PROBE_GAP_MS);
      const r = await probeModel(k.key, m, { timeout: 90_000 });
      if (accept(m, r)) continue;
      console.warn(`[nim] ${m} probe inconclusive twice (${r.reason})${kept.includes(m) ? '; keeping it' : '; will retry next refresh'}`);
      if (kept.includes(m)) good.push(m);
    }
    for (const m of removed) {
      dead.add(m);
      note(m, { status: 'dead', reason: 'no longer in NVIDIA catalogue' });
    }
    if (good.length) pool = good.slice(0, MAX_POOL);
    fixChatModel();
    // A preferred model that works wins (it also takes back over once it recovers); otherwise keep the sticky one if it still works
    const pref = preferredModel();
    if (pref) stick(pref);
    else if (!usableModel(current) || !pool.includes(current)) {
      const f = fastest();
      if (f) stick(f);
      else current = null;
    }
    if (visionModel && !ids.has(visionModel)) visionModel = VISION_MODELS.find((m) => ids.has(m)) ?? '';
    persist();
    return { pool, chatModel, visionModel, removed, added, current };
  } catch {
    return null;
  }
}

/** Chat completion. On a failed or empty answer it retries on other healthy models (`opts.retries`, default 1). */
export async function nimChat(messages, opts = {}) {
  if (!nimEnabled()) return null;
  const tried = new Set();
  for (let attempt = 0; attempt <= (opts.retries ?? 1); attempt++) {
    const model = attempt === 0 ? pickModel(opts.model) : nextModel(tried);
    if (!model || tried.has(model)) break;
    tried.add(model);
    const out = await chatOnce(model, messages, opts);
    if (out) {
      stick(model);
      return out;
    }
    if (model === current) current = null; // failed: the next model that answers becomes the sticky one
  }
  return null;
}

async function chatOnce(model, messages, opts) {
  const started = Date.now();
  try {
    const noThink = !!registry.get(model)?.noThink;
    const res = await nimPost(`${config.nim.baseUrl}/chat/completions`, {
      model,
      messages: noThink ? noThinkMessages(messages) : messages,
      max_tokens: opts.maxTokens ?? 120,
      temperature: opts.temperature ?? 0.9,
      top_p: 0.95,
      stream: false,
      ...(noThink ? NO_THINK : {}),
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
    const text = cleanText(data.choices?.[0]?.message?.content ?? '');
    if (looksLikeReasoning(text)) {
      strike(model);
      return null; // nimChat retries on another model
    }
    return text || null;
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
    .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '')
    .replace(/^[\s\S]*<\/think(?:ing)?>/i, '') // closing tag with no opener: everything before it is thinking
    .replace(/<think(?:ing)?>[\s\S]*$/i, '') // never closed: all thinking, no answer
    .replace(/^\s*(["'“])(.*)\1\s*$/s, '$2')
    .replace(/^\s*@?[\w.]+:\s*/, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n') // keep line breaks: DMs send each line as its own text bubble
    .trim()
    .slice(0, 400);
}

/**
 * True when a reply is the model's chain-of-thought / instructions talking to itself instead of a message
 * ("The user is sending… I need to respond as Mia…"). Such replies are discarded and the model is struck.
 */
const LEAK_START =
  /^\s*(?:okay|ok|alright|so|hmm|wait)?[,.:\s]*(?:the user(?:'s| is| has| wants| said| seems| sent)|user (?:is|has|wants|said|seems|sent)|i (?:need|should|must|have|will|am going|'ll|want|think i) (?:to )?(?:respond|reply|write|craft|answer|stay|keep|be |say|figure|look|check|consider|think)|let me (?:think|see|respond|reply|craft|write|analy)|we (?:need|should|must) (?:to )?(?:respond|reply|write|answer)|my (?:response|reply|answer|task)|(?:first|looking at|analy[sz]ing|breaking down|considering|thinking about) |(?:the )?(?:persona|system prompt|instructions?|guidelines?) (?:say|says|is|are|state|tell))/i;
const LEAK_ANYWHERE = /\b(?:i need to respond as|my texting style (?:is|should)|as (?:the )?persona|stay in character|the system prompt|i should respond as|respond in character|my (?:reply|response) should)\b/i;
export const looksLikeReasoning = (t) => !!t && (LEAK_START.test(t) || LEAK_ANYWHERE.test(t));

const strikes = new Map(); // model → leak count
function strike(model) {
  const n = (strikes.get(model) ?? 0) + 1;
  strikes.set(model, n);
  resting.set(model, Date.now() + Math.min(n, 6) * 30 * 60_000); // 30 min per strike, up to 3 h
  console.warn(`[nim] ${model} leaked its reasoning instead of replying (strike ${n}); resting it ${Math.min(n, 6) * 30} min`);
}
