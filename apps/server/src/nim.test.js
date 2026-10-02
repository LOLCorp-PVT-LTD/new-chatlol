import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

// A fake NVIDIA NIM: per-key behaviour (ok / rejected / rate limited) and per-model behaviour (ok / retired).
const calls = [];
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
    if (body.model === 'google/gemma-2-9b-it') return res.writeHead(404).end('{}');
    if (body.model === 'meta/llama-3.1-8b-instruct') return res.writeHead(410).end('{}');
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
