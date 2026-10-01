import { config } from '../config.js';

/**
 * Cross-instance shared state. Backed by Redis when REDIS_URL is set (multi-instance deploys),
 * otherwise by process memory (single instance / dev / tests). Only the small set of primitives
 * the app needs.
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

/** Connects to Redis if configured. Returns the client (also used for the Socket.IO adapter). */
export async function initShared() {
  if (!config.redisUrl) return null;
  const { default: Redis } = await import('ioredis');
  redis = new Redis(config.redisUrl, { maxRetriesPerRequest: 3, lazyConnect: false });
  state = new RedisState(redis);
  return redis;
}

/** For tests: inject a client (e.g. ioredis-mock). */
export function useRedisClient(client) {
  redis = client;
  state = new RedisState(client);
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
