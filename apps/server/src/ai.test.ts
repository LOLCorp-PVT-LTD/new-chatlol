import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// A fake NVIDIA NIM endpoint (OpenAI-compatible chat + FLUX image) so the engine can be tested offline.
const calls: { path: string; body: any; auth?: string }[] = [];
const nim: Server = createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const body = JSON.parse(raw || '{}');
    calls.push({ path: req.url!, body, auth: req.headers.authorization });
    res.setHeader('Content-Type', 'application/json');
    if (req.url!.includes('genai')) return res.end(JSON.stringify({ artifacts: [{ base64: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)]).toString("base64"), finishReason: 'SUCCESS' }] }));
    if (body.model?.includes('safety')) return res.end(JSON.stringify({ choices: [{ message: { content: '{"User Safety": "safe"}' } }] }));
    res.end(JSON.stringify({ choices: [{ message: { content: '"@mia.goldenhour: portra 400 is such a vibe, what camera?"' } }] }));
  });
});
await new Promise<void>((r) => nim.listen(0, r));
const nimUrl = `http://127.0.0.1:${(nim.address() as AddressInfo).port}`;

process.env.DATABASE_PATH = ':memory:';
process.env.UPLOAD_DIR = join(tmpdir(), 'chatlol-ai-test');
process.env.NVIDIA_API_KEY = 'nvapi-test';
process.env.NIM_BASE_URL = `${nimUrl}/v1`;
process.env.NIM_IMAGE_URL = `${nimUrl}/genai/flux`;
process.env.NIM_SAFETY_MODEL = 'nvidia/llama-3.1-nemoguard-8b-content-safety';
process.env.NIM_MODELS = 'meta/llama-3.1-8b-instruct';

const { nimChat, nimImage, cleanText } = await import('./ai/nim');
const { deepCheck } = await import('./lib/moderation');
const { systemPrompt, PERSONAS } = await import('./ai/personas');

before(() => {});
after(() => nim.close());

test('nimChat calls the OpenAI-compatible endpoint with the API key and cleans output', async () => {
  const out = await nimChat([{ role: 'user', content: 'hi' }]);
  assert.equal(out, 'portra 400 is such a vibe, what camera?');
  const call = calls.find((c) => c.path === '/v1/chat/completions');
  assert.equal(call?.auth, 'Bearer nvapi-test');
  assert.equal(call?.body.model, 'meta/llama-3.1-8b-instruct');
});

test('nimImage stores the generated image and returns a public URL', async () => {
  const url = await nimImage('sunset desk setup');
  assert.match(url ?? '', /\/uploads\/ai_[a-z0-9]+\.jpg$/);
});

test('NemoGuard safety check parses verdicts', async () => {
  assert.equal(await deepCheck('hello there'), true);
});

test('persona prompt always requires honesty about being AI', () => {
  const p = systemPrompt(PERSONAS[0], 'ctx');
  assert.match(p, /AI persona/);
  assert.match(p, /say yes plainly/);
  assert.match(p, /Never ask for money/);
});

test('cleanText strips think blocks, quotes and name prefixes', () => {
  assert.equal(cleanText('<think>hmm</think> "Mia: love this"'), 'love this');
});
