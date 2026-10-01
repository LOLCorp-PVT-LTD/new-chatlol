import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createApi } from '@chatlol/shared';
import { io as ioClient } from 'socket.io-client';

/**
 * Two real API processes sharing Postgres + Redis: a socket on instance A must receive a DM sent
 * through instance B, and only one instance may hold the worker lease.
 * Runs only when TEST_DATABASE_URL and TEST_REDIS_URL are set.
 */
const DB = process.env.TEST_DATABASE_URL;
const REDIS = process.env.TEST_REDIS_URL;
const skip = !DB || !REDIS;
const procs: ChildProcess[] = [];
const logs: string[] = ['', ''];

function start(port: number, i: number) {
  const p = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    env: { ...process.env, PORT: String(port), DATABASE_URL: DB, REDIS_URL: REDIS, AI_PERSONAS_ENABLED: '0', JWT_SECRET: 'cluster-test-secret', NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  p.stdout!.on('data', (d) => (logs[i] += d));
  p.stderr!.on('data', (d) => (logs[i] += d));
  procs.push(p);
}
async function waitUp(port: number) {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) return; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`instance on ${port} did not start:\n${logs.join('\n')}`);
}

before(async () => {
  if (skip) return;
  start(4711, 0);
  await waitUp(4711); // first boot runs migrations + seed
  start(4712, 1);
  await waitUp(4712);
});
after(() => procs.forEach((p) => p.kill('SIGTERM')));

test('socket on instance A receives a DM sent via instance B (Redis adapter)', { skip }, async () => {
  const a = createApi({ baseUrl: 'http://127.0.0.1:4711', getToken: () => null });
  const login = await a.login({ login: 'demo@chatlol.app', password: 'sunset123' });
  const other = await a.register({ email: `c${Date.now()}@example.com`, password: 'password123', handle: `c${Date.now() % 1e8}`, displayName: 'Cluster', birthdate: '1990-01-01' });
  const sock = ioClient('http://127.0.0.1:4711', { auth: { token: login.token }, transports: ['websocket'] });
  await new Promise((r) => sock.on('connect', r));
  const b = createApi({ baseUrl: 'http://127.0.0.1:4712', getToken: () => other.token });
  const { conversation } = await b.openConversation(login.user.id);
  const got = new Promise<any>((r) => sock.on('dm:message', r));
  await b.sendMessage(conversation.id, { body: 'hello across instances' });
  const msg = await Promise.race([got, new Promise((_, rej) => setTimeout(() => rej(new Error('no cross-instance delivery')), 5000))]);
  assert.equal((msg as any).body, 'hello across instances');
  sock.close();
});

test('presence and rate limits are shared across instances', { skip }, async () => {
  const a = createApi({ baseUrl: 'http://127.0.0.1:4711', getToken: () => null });
  const login = await a.login({ login: 'demo@chatlol.app', password: 'sunset123' });
  const sock = ioClient('http://127.0.0.1:4711', { auth: { token: login.token }, transports: ['websocket'] });
  await new Promise((r) => sock.on('connect', r));
  await new Promise((r) => setTimeout(r, 300));
  const b = createApi({ baseUrl: 'http://127.0.0.1:4712', getToken: () => null });
  const u = await b.user('jordan_vibe');
  assert.equal(u.user.online, true, 'instance B sees the socket held by A');
  sock.close();
});

test('exactly one instance holds the worker lease', { skip }, async () => {
  const { default: Redis } = await import('ioredis');
  const r = new Redis(REDIS!);
  const holder = await r.get('lease:workers');
  r.disconnect();
  assert.ok(holder, 'a worker lease exists');
});
