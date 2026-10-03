import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

// A fake NVIDIA NIM: per-key behaviour (ok / rejected / rate limited) and per-model behaviour (ok / retired).
const calls = [];
const catalogueGone = new Set();
const keyMode = { 'nvapi-a': 'ok', 'nvapi-b': 'ok', 'nvapi-c': 'ok' };
const catalogue = [
  'meta/llama-3.3-70b-instruct',
  'qwen/qwen2.5-7b-instruct',
  'google/gemma-3-27b-it',
  'nvidia/llama-3.1-nemoguard-8b-content-safety',
  'nvidia/nv-embedqa-e5-v5',
];
const nim = createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const key = (req.headers.authorization ?? '').replace('Bearer ', '');
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/v1/models') return res.end(JSON.stringify({ data: catalogue.map((id) => ({ id })) }));
    const body = JSON.parse(raw || '{}');
    calls.push({ key, model: body.model });
    if (keyMode[key] === 'rejected') return res.writeHead(401).end('{}');
    if (keyMode[key] === 'limited') return res.writeHead(429).end('{}');
    if (body.model === 'google/gemma-2-9b-it' || catalogueGone.has(body.model)) return res.writeHead(404).end('{}');
    if (body.model === 'meta/llama-3.1-8b-instruct') return res.writeHead(410).end('{}');
    if (body.model === 'acme/thinker' && !body.chat_template_kwargs) return res.end(JSON.stringify({ choices: [{ message: { content: null, reasoning_content: 'hmm let me think' } }] }));
    res.end(JSON.stringify({ choices: [{ message: { content: `hi from ${body.model}` } }] }));
  });
});
await new Promise((r) => nim.listen(0, r));
process.env.NVIDIA_API_KEYS = 'nvapi-a, nvapi-b';
process.env.NVIDIA_API_KEY = 'nvapi-c';
process.env.NIM_BASE_URL = `http://127.0.0.1:${nim.address().port}/v1`;
process.env.NIM_MODELS = 'meta/llama-3.1-8b-instruct,google/gemma-2-9b-it,meta/llama-3.3-70b-instruct';
process.env.NIM_CHAT_MODEL = 'meta/llama-3.1-8b-instruct';
process.env.NIM_RPM = '20';
process.env.NIM_PROBE_GAP_MS = '0';
process.env.NIM_PREFERRED_MODELS = '';
const { nimChat, refreshModels, activeModels } = await import('./ai/nim.js');
after(() => nim.close());
const ask = () => nimChat([{ role: 'user', content: 'hey' }], { retries: 3 });

test('retired models (404 / 410) are dropped for good and the next model answers', async () => {
  const out = await nimChat([{ role: 'user', content: 'hey' }], { model: 'meta/llama-3.1-8b-instruct', retries: 3 });
  assert.match(out, /^hi from /);
  assert.ok(!activeModels().pool.includes('meta/llama-3.1-8b-instruct'));
  calls.length = 0;
  for (let i = 0; i < 4; i++) await ask();
  assert.ok(!calls.some((c) => c.model === 'meta/llama-3.1-8b-instruct'), 'the 410 model is never called again');
  assert.ok(calls.filter((c) => c.model === 'google/gemma-2-9b-it').length <= 1, 'the 404 model is tried at most once, then dropped');
});

test('several keys: requests spread over them, so the per-minute allowance adds up', async () => {
  calls.length = 0;
  const t = Date.now();
  // Each request goes to the key with the most room left, so a burst spreads across keys instead of queuing on one.
  const outs = await Promise.all([ask(), ask(), ask()]);
  assert.ok(outs.every(Boolean));
  assert.ok(Date.now() - t < 2000, 'no waiting while any key has room');
  assert.ok(new Set(calls.map((c) => c.key)).size >= 2, 'more than one key used');
});

test('a rejected key is set aside for good, a rate-limited key rests, the others carry on', async () => {
  keyMode['nvapi-a'] = 'rejected';
  keyMode['nvapi-b'] = 'limited';
  calls.length = 0;
  const outs = [];
  for (let i = 0; i < 6; i++) outs.push(await nimChat([{ role: 'user', content: `hey ${i}` }], { model: 'meta/llama-3.3-70b-instruct' }));
  assert.ok(
    outs.every((o) => o === 'hi from meta/llama-3.3-70b-instruct'),
    'every request still answered (by key c)',
  );
  const firstA = calls.findIndex((c) => c.key === 'nvapi-a');
  assert.ok(firstA >= 0, 'the rejected key was tried');
  assert.ok(!calls.slice(firstA + 1).some((c) => c.key === 'nvapi-a'), 'and never used again');
  const lastB = calls.map((c) => c.key).lastIndexOf('nvapi-b');
  assert.ok(calls.filter((c) => c.key === 'nvapi-b').length <= 1, 'the rate-limited key rests after its 429');
  assert.ok(lastB === -1 || lastB < calls.length - 1);
});

test("NVIDIA's catalogue: retired models dropped, fast free chat models added, non-chat models ignored", async () => {
  const r = await refreshModels();
  assert.ok(r);
  assert.deepEqual(r.removed.sort(), ['google/gemma-2-9b-it', 'meta/llama-3.1-8b-instruct']);
  assert.ok(r.pool.includes('meta/llama-3.3-70b-instruct'));
  assert.ok(r.pool.includes('qwen/qwen2.5-7b-instruct') && r.pool.includes('google/gemma-3-27b-it'), 'fast free models added');
  assert.ok(!r.pool.some((m) => /embed|guard/.test(m)), 'no embedding or safety models in the chat pool');
  assert.equal(r.chatModel, 'meta/llama-3.3-70b-instruct', 'the retired chat model is replaced');
});

test('reasoning leaks are detected, think tags stripped', async () => {
  const { looksLikeReasoning, cleanText } = await import('./ai/nim.js');
  assert.ok(looksLikeReasoning('The user is sending various messages, some repetitive ("Hello"). I need to respond as Mia Chen, 24'));
  assert.ok(looksLikeReasoning("Okay, so I need to respond as Mia. My texting style is lowercase"));
  assert.ok(!looksLikeReasoning('hey you 🧡 whatcha shooting this week?'));
  assert.ok(!looksLikeReasoning('lol the user interface on my old canon is a mess'));
  assert.equal(cleanText('long thinking here</think>hey you'), 'hey you');
  assert.equal(cleanText('<think>hmm</think>hey you'), 'hey you');
});

test('model registry: saved to the store, restored on boot, new catalogue models picked up', async () => {
  const { setModelStore } = await import('./ai/nim.js');
  const saves = [];
  let disk = { 'meta/llama-3.3-70b-instruct': { status: 'ok', latencyMs: 300 }, 'old/retired-model': { status: 'dead', fails: 2 } };
  const r1 = await setModelStore({ load: async () => disk, save: async (x) => saves.push(x) });
  assert.ok(r1.usable >= 1, 'working models restored from the saved registry');
  assert.ok(activeModels().pool.includes('meta/llama-3.3-70b-instruct'));
  assert.ok(!activeModels().pool.includes('old/retired-model'), 'saved-as-dead models are not used');
  catalogue.push('acme/brand-new-chat-model'); // a release that appeared since last time
  const r = await refreshModels();
  assert.ok(r.added.includes('acme/brand-new-chat-model'), 'new catalogue model discovered and probed');
  assert.ok(r.pool.includes('acme/brand-new-chat-model'));
  await new Promise((res) => setTimeout(res, 700));
  const last = saves.at(-1);
  assert.equal(last.models['acme/brand-new-chat-model'].status, 'ok');
  assert.equal(last.models['meta/llama-3.3-70b-instruct'].status, 'ok');
  assert.ok(last.current, 'sticky model saved');
});

test('a thinking-only model is re-probed with thinking off, kept, and chatted with thinking off', async () => {
  catalogue.push('acme/thinker');
  const r = await refreshModels();
  assert.ok(r.pool.includes('acme/thinker'));
  calls.length = 0;
  const out = await nimChat([{ role: 'system', content: 'be mia' }, { role: 'user', content: 'hey' }], { model: 'acme/thinker' });
  assert.equal(out, 'hi from acme/thinker');
});

test('sticky: the model that answered is used until it fails, then the next one sticks', async () => {
  const first = await ask();
  const sticky = activeModels().current;
  assert.ok(sticky && first === `hi from ${sticky}`);
  calls.length = 0;
  for (let i = 0; i < 5; i++) await ask();
  assert.ok(calls.every((c) => c.model === sticky), 'every request went to the sticky model');
  catalogueGone.add(sticky); // NVIDIA retires it
  const out = await ask();
  const next = activeModels().current;
  assert.ok(next && next !== sticky && out === `hi from ${next}`, 'switched to another model');
  calls.length = 0;
  for (let i = 0; i < 3; i++) await ask();
  assert.ok(calls.every((c) => c.model === next), 'and sticks to the new one');
});

test('preferred model is used first after a refresh / restart, and again once it recovers', async () => {
  const { config } = await import('./config.js');
  const { setModelStore } = await import('./ai/nim.js');
  config.nim.preferred = ['qwen/qwen2.5-7b-instruct'];
  const r = await refreshModels();
  assert.equal(r.current, 'qwen/qwen2.5-7b-instruct');
  calls.length = 0;
  await ask();
  assert.equal(calls[0].model, 'qwen/qwen2.5-7b-instruct');
  // restart: the saved sticky model is something else, but the preferred one is used first
  await setModelStore({ load: async () => ({ models: { 'qwen/qwen2.5-7b-instruct': { status: 'ok' } }, current: 'google/gemma-3-27b-it' }), save: async () => {} });
  assert.equal(activeModels().current, 'qwen/qwen2.5-7b-instruct');
  config.nim.preferred = [];
});
