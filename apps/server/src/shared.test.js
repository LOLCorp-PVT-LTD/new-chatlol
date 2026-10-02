import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { useTestMongo } from './testDb.js';

/** The MongoDB-backed shared state and cluster event bus (what replaces Redis when REDIS_URL isn't set). */
const mongo = await useTestMongo('shared');
const { initDb, db } = await import('./db.js');
const { useMongoState, shared, sharedBackend } = await import('./lib/shared.js');
const { bus } = await import('./lib/events.js');

before(async () => {
  await initDb();
  useMongoState();
});
after(async () => {
  await bus.close();
  await db.dropDatabase({ reindex: false });
  await db.close();
  await mongo.stop();
});

test('counters, expiry and rate-limit windows', async () => {
  assert.equal(sharedBackend(), 'mongodb');
  const s = shared();
  assert.equal(await s.incr('rl:a', 60), 1);
  assert.equal(await s.incr('rl:a', 60), 2);
  assert.equal(await s.get('rl:a'), '2');
  // An expired counter starts over even before MongoDB's TTL sweep removes it.
  await db.kv.raw.updateOne({ _id: 'rl:a' }, { $set: { exp: new Date(Date.now() - 1000) } });
  assert.equal(await s.get('rl:a'), null);
  assert.equal(await s.incr('rl:a', 60), 1);
  // Concurrent increments from many requests all count.
  const n = await Promise.all(Array.from({ length: 20 }, () => s.incr('rl:b', 60)));
  assert.deepEqual([...n].sort((x, y) => x - y), Array.from({ length: 20 }, (_, i) => i + 1));
});

test('setNx is a lock: one winner, free again once expired', async () => {
  const s = shared();
  const wins = await Promise.all(Array.from({ length: 10 }, (_, i) => s.setNx('lease:x', `i${i}`, 60_000)));
  assert.equal(wins.filter(Boolean).length, 1);
  assert.equal(await s.setNx('lease:x', 'late', 60_000), false);
  await db.kv.raw.updateOne({ _id: 'lease:x' }, { $set: { exp: new Date(Date.now() - 1) } });
  assert.equal(await s.setNx('lease:x', 'next', 60_000), true);
  assert.equal(await s.get('lease:x'), 'next');
  await s.set('k', 'v', 0);
  assert.deepEqual(await s.exists(['k', 'nope', 'lease:x']), [true, false, true]);
  await s.del('k');
  assert.equal(await s.get('k'), null);
});

test('sets and hash counters (presence, lounges, stream viewers)', async () => {
  const s = shared();
  await s.sadd('lounge:1', 'u1');
  await s.sadd('lounge:1', 'u2');
  await s.sadd('lounge:1', 'u1');
  assert.equal(await s.scard('lounge:1'), 2);
  await s.srem('lounge:1', 'u1');
  assert.deepEqual(await s.smembers('lounge:1'), ['u2']);
  assert.equal(await s.hincr('presence:count', 'u_1', 1), 1);
  assert.equal(await s.hincr('presence:count', 'u_1', 1), 2);
  assert.equal(await s.hincr('presence:count', 'u_1', -2), 0);
});

test('domain events reach listeners through a change stream', async (t) => {
  if (!db.transactions) return t.skip('needs a replica set');
  await bus.listenCluster();
  await new Promise((r) => setTimeout(r, 300)); // let the change stream open
  const got = new Promise((r) => bus.onEvent('test:ping', r));
  bus.emitEvent('test:ping', { hello: 'cluster' });
  const p = await Promise.race([got, new Promise((_, rej) => setTimeout(() => rej(new Error('event not delivered')), 5000))]);
  assert.deepEqual(p, { hello: 'cluster' });
});
