import { config } from '../config.js';
import { db, isDuplicateKey } from '../db.js';

/**
 * Cross-instance shared state (rate limits, cooldowns, presence, lounge/stream state, the worker lease).
 *  - MongoDB (default): a `kv` collection with a TTL index — works across any number of API instances,
 *    no extra service to run.
 *  - Redis: used instead when REDIS_URL is set (lower latency for very busy deployments).
 *  - Memory: SHARED_STATE=memory, single process only (unit tests).
 * Only the small set of primitives the app needs.
 */

class MemoryState {
  kv = new Map();
  sets = new Map();
  hashes = new Map();
  alive(k) {
    const e = this.kv.get(k);
    if (e && e.exp && e.exp < Date.now()) {
      this.kv.delete(k);
      return undefined;
    }
    return e;
  }
  async incr(key, ttlSec) {
    const e = this.alive(key);
    const n = (e ? Number(e.v) : 0) + 1;
    this.kv.set(key, { v: String(n), exp: e?.exp || (ttlSec ? Date.now() + ttlSec * 1000 : 0) });
    return n;
  }
  async hincr(key, field, by) {
    const h = this.hashes.get(key) ?? new Map();
    const n = (h.get(field) ?? 0) + by;
    h.set(field, n);
    this.hashes.set(key, h);
    return n;
  }
  async get(key) {
    return this.alive(key)?.v ?? null;
  }
  async set(key, value, ttlSec) {
    this.kv.set(key, { v: value, exp: ttlSec ? Date.now() + ttlSec * 1000 : 0 });
  }
  async setNx(key, value, ttlMs) {
    if (this.alive(key)) return false;
    this.kv.set(key, { v: value, exp: Date.now() + ttlMs });
    return true;
  }
  async del(key) {
    this.kv.delete(key);
  }
  async exists(keys) {
    return keys.map((k) => !!this.alive(k));
  }
  async sadd(key, m) {
    const s = this.sets.get(key) ?? new Set();
    s.add(m);
    this.sets.set(key, s);
  }
  async srem(key, m) {
    this.sets.get(key)?.delete(m);
  }
  async smembers(key) {
    return [...(this.sets.get(key) ?? [])];
  }
  async scard(key) {
    return this.sets.get(key)?.size ?? 0;
  }
}

/** Keys that haven't expired yet (the TTL monitor only sweeps once a minute, so reads check too). */
const live = () => ({ $or: [{ exp: null }, { exp: { $gt: new Date() } }] });
const expiry = (ms) => (ms ? new Date(Date.now() + ms) : null);
/** Hash field names become document paths, so keep them path-safe. */
const field = (f) => String(f).replace(/[.$]/g, '_');

class MongoState {
  /** The raw collection: shared state must never join (or roll back with) a request's transaction. */
  get kv() {
    return db.kv.raw;
  }
  /** Runs an upsert keyed on _id; if an expired copy of the key is still there, clears it and retries once. */
  async fresh(key, op) {
    try {
      return await op();
    } catch (e) {
      if (!isDuplicateKey(e)) throw e;
      await this.kv.deleteOne({ _id: key, exp: { $ne: null, $lte: new Date() } });
      return op();
    }
  }
  async incr(key, ttlSec) {
    const doc = await this.fresh(key, () =>
      this.kv.findOneAndUpdate(
        { _id: key, ...live() },
        { $inc: { n: 1 }, $setOnInsert: { exp: expiry(ttlSec * 1000) } },
        { upsert: true, returnDocument: 'after' },
      ),
    );
    return doc.n;
  }
  async hincr(key, f, by) {
    const doc = await this.kv.findOneAndUpdate(
      { _id: key },
      { $inc: { [`h.${field(f)}`]: by }, $setOnInsert: { exp: null } },
      { upsert: true, returnDocument: 'after' },
    );
    return doc.h[field(f)];
  }
  async get(key) {
    const doc = await this.kv.findOne({ _id: key, ...live() });
    if (!doc) return null;
    return doc.v ?? (doc.n != null ? String(doc.n) : null);
  }
  async set(key, value, ttlSec) {
    await this.kv.replaceOne({ _id: key }, { v: value, exp: expiry(ttlSec * 1000) }, { upsert: true });
  }
  async setNx(key, value, ttlMs) {
    try {
      await this.fresh(key, () => this.kv.insertOne({ _id: key, v: value, exp: expiry(ttlMs) }));
      return true;
    } catch (e) {
      if (isDuplicateKey(e)) return false; // someone holds it
      throw e;
    }
  }
  async del(key) {
    await this.kv.deleteOne({ _id: key });
  }
  async exists(keys) {
    if (!keys.length) return [];
    const found = new Set(await this.kv.distinct('_id', { _id: { $in: keys }, ...live() }));
    return keys.map((k) => found.has(k));
  }
  async sadd(key, m) {
    await this.kv.updateOne({ _id: key }, { $addToSet: { m }, $setOnInsert: { exp: null } }, { upsert: true });
  }
  async srem(key, m) {
    await this.kv.updateOne({ _id: key }, { $pull: { m } });
  }
  async smembers(key) {
    return (await this.kv.findOne({ _id: key }, { projection: { m: 1 } }))?.m ?? [];
  }
  async scard(key) {
    return (await this.smembers(key)).length;
  }
}

class RedisState {
  constructor(r) {
    this.r = r;
  }
  async incr(key, ttlSec) {
    const n = await this.r.incr(key);
    if (n === 1 && ttlSec) await this.r.expire(key, ttlSec);
    return n;
  }
  hincr(key, field, by) {
    return this.r.hincrby(key, field, by);
  }
  get(key) {
    return this.r.get(key);
  }
  async set(key, value, ttlSec) {
    ttlSec ? await this.r.set(key, value, 'EX', ttlSec) : await this.r.set(key, value);
  }
  async setNx(key, value, ttlMs) {
    return (await this.r.set(key, value, 'PX', ttlMs, 'NX')) === 'OK';
  }
  async del(key) {
    await this.r.del(key);
  }
  async exists(keys) {
    if (!keys.length) return [];
    const p = this.r.pipeline();
    keys.forEach((k) => p.exists(k));
    const res = (await p.exec()) ?? [];
    return res.map(([, v]) => v === 1);
  }
  async sadd(key, m) {
    await this.r.sadd(key, m);
  }
  async srem(key, m) {
    await this.r.srem(key, m);
  }
  smembers(key) {
    return this.r.smembers(key);
  }
  scard(key) {
    return this.r.scard(key);
  }
}

let state = new MemoryState();
let redis = null;
let backend = 'memory';

/**
 * Picks the shared-state backend: Redis if REDIS_URL is set, else MongoDB (call after initDb),
 * or memory when SHARED_STATE=memory. Returns the Redis client when Redis is used.
 */
export async function initShared() {
  if (config.sharedState === 'memory') return null;
  if (config.redisUrl) {
    const { default: Redis } = await import('ioredis');
    redis = new Redis(config.redisUrl, { maxRetriesPerRequest: 3, lazyConnect: false });
    state = new RedisState(redis);
    backend = 'redis';
    return redis;
  }
  state = new MongoState();
  backend = 'mongodb';
  return null;
}
/** 'mongodb' | 'redis' | 'memory' */
export const sharedBackend = () => backend;
/** For tests: use the MongoDB-backed state. */
export function useMongoState() {
  state = new MongoState();
  backend = 'mongodb';
}

/** For tests: inject a client (e.g. ioredis-mock). */
export function useRedisClient(client) {
  redis = client;
  state = new RedisState(client);
  backend = 'redis';
}
export const redisClient = () => redis;

const extra = [];
/** A second connection (pub/sub needs its own). Tracked so shutdown can close it. */
export function duplicateRedis() {
  const d = redis.duplicate();
  extra.push(d);
  return d;
}
export async function closeShared() {
  for (const c of [...extra, ...(redis ? [redis] : [])]) c.disconnect();
  extra.length = 0;
}
export const shared = () => state;
