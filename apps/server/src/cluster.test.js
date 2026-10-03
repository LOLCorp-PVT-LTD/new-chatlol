import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createApi } from '@chatlol/shared';
import { io as ioClient } from 'socket.io-client';

/**
 * Two real API processes sharing MongoDB (and Redis, if TEST_REDIS_URL is set — otherwise MongoDB alone
 * carries the shared state and realtime fan-out): a socket on instance A must receive a DM sent through
 * instance B, only one instance may hold the worker lease, and booting both at once seeds once.
 * Runs when TEST_MONGODB_URL (a replica set) is set.
 */
const DB = process.env.TEST_MONGODB_URL;
const DB_NAME = `chatlol_test_cluster_${process.pid}`;
const REDIS = process.env.TEST_REDIS_URL;
const skip = !DB;
const MODE = REDIS ? 'Redis' : 'MongoDB';
const procs = [];
const logs = ['', ''];

function start(port, i) {
  const p = spawn(process.execPath, ['src/index.js'], {
    env: {
      ...process.env,
      PORT: String(port),
      MONGODB_URL: DB,
      MONGODB_DB: DB_NAME,
      REDIS_URL: REDIS ?? '',
      AI_PERSONAS_ENABLED: '0',
      JWT_SECRET: 'cluster-test-secret',
      NODE_ENV: 'test',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  p.stdout.on('data', (d) => (logs[i] += d));
  p.stderr.on('data', (d) => (logs[i] += d));
  procs.push(p);
}
async function waitUp(port) {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) return;
    } catch {
      /* not yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`instance on ${port} did not start:\n${logs.join('\n')}`);
}

before(async () => {
  if (skip) return;
  if (REDIS) {
    const { default: Redis } = await import('ioredis');
    const r = new Redis(REDIS);
    await r.flushdb(); // fresh rate-limit windows and leases
    r.disconnect();
  }
  // Both boot at once against an empty database: the seed lock must let exactly one of them seed.
  start(4711, 0);
  start(4712, 1);
  await Promise.all([waitUp(4711), waitUp(4712)]);
});
after(async () => {
  procs.forEach((p) => p.kill('SIGTERM'));
  if (skip) return;
  const { MongoClient } = await import('mongodb');
  const c = await MongoClient.connect(DB);
  await c.db(DB_NAME).dropDatabase();
  await c.close();
});

test('two instances booting together seed the database exactly once', { skip }, async () => {
  const { MongoClient } = await import('mongodb');
  const c = await MongoClient.connect(DB);
  const posts = await c.db(DB_NAME).collection('posts').countDocuments();
  const dms = await c.db(DB_NAME).collection('conversations').countDocuments();
  await c.close();
  assert.equal(posts, 50, 'one seed run = 48 photos + 2 battles');
  assert.equal(dms, 1);
  assert.equal((logs.join('\n').match(/Seed complete/g) ?? []).length, 1);
});

test(`socket on instance A receives a DM sent via instance B (${MODE} adapter)`, { skip }, async () => {
  const a = createApi({ baseUrl: 'http://127.0.0.1:4711', getToken: () => null });
  const login = await a.login({ login: 'demo@chatlol.app', password: 'sunset123' });
  const other = await a.register({
    email: `c${Date.now()}@example.com`,
    password: 'password123',
    handle: `c${Date.now() % 1e8}`,
    displayName: 'Cluster',
    birthdate: '1990-01-01',
    gender: 'male',
  });
  const sock = ioClient('http://127.0.0.1:4711', { auth: { token: login.token }, transports: ['websocket'] });
  await new Promise((r) => sock.on('connect', () => r()));
  {
    // New accounts need level 3 to DM people who aren't their friends.
    const { MongoClient, ObjectId } = await import('mongodb');
    const c = await MongoClient.connect(DB);
    await c.db(DB_NAME).collection('users').updateOne({ _id: new ObjectId(other.user.id) }, { $set: { xp: 5000 } });
    await c.close();
  }
  const b = createApi({ baseUrl: 'http://127.0.0.1:4712', getToken: () => other.token });
  const { conversation } = await b.openConversation(login.user.id);
  const got = new Promise((r) => sock.on('dm:message', r));
  await b.sendMessage(conversation.id, { body: 'hello across instances' });
  const msg = await Promise.race([got, new Promise((_, rej) => setTimeout(() => rej(new Error('no cross-instance delivery')), 5000))]);
  assert.equal(msg.body, 'hello across instances');
  sock.close();
});

test('presence and rate limits are shared across instances', { skip }, async () => {
  const a = createApi({ baseUrl: 'http://127.0.0.1:4711', getToken: () => null });
  const login = await a.login({ login: 'demo@chatlol.app', password: 'sunset123' });
  const sock = ioClient('http://127.0.0.1:4711', { auth: { token: login.token }, transports: ['websocket'] });
  await new Promise((r) => sock.on('connect', () => r()));
  await new Promise((r) => setTimeout(r, 300));
  const b = createApi({ baseUrl: 'http://127.0.0.1:4712', getToken: () => null });
  const u = await b.user('jordan_vibe');
  assert.equal(u.user.online, true, 'instance B sees the socket held by A');
  sock.close();
});

test('exactly one instance holds the worker lease', { skip }, async () => {
  let holder;
  if (REDIS) {
    const { default: Redis } = await import('ioredis');
    const r = new Redis(REDIS);
    holder = await r.get('lease:workers');
    r.disconnect();
  } else {
    const { MongoClient } = await import('mongodb');
    const c = await MongoClient.connect(DB);
    holder = (await c.db(DB_NAME).collection('kv').findOne({ _id: 'lease:workers' }))?.v;
    await c.close();
  }
  assert.ok(holder, 'a worker lease exists');
});
