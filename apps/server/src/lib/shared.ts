import { config } from '../config';

/**
 * Cross-instance shared state. Backed by Redis when REDIS_URL is set (multi-instance deploys),
 * otherwise by process memory (single instance / dev / tests). Only the small set of primitives
 * the app needs.
 */
export interface SharedState {
  incr(key: string, ttlSec?: number): Promise<number>;
  hincr(key: string, field: string, by: number): Promise<number>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec?: number): Promise<void>;
  setNx(key: string, value: string, ttlMs: number): Promise<boolean>;
  del(key: string): Promise<void>;
  exists(keys: string[]): Promise<boolean[]>;
  sadd(key: string, member: string): Promise<void>;
  srem(key: string, member: string): Promise<void>;
  smembers(key: string): Promise<string[]>;
  scard(key: string): Promise<number>;
}

class MemoryState implements SharedState {
  private kv = new Map<string, { v: string; exp: number }>();
  private sets = new Map<string, Set<string>>();
  private hashes = new Map<string, Map<string, number>>();
  private alive(k: string) {
    const e = this.kv.get(k);
    if (e && e.exp && e.exp < Date.now()) { this.kv.delete(k); return undefined; }
    return e;
  }
  async incr(key: string, ttlSec?: number) {
    const e = this.alive(key);
    const n = (e ? Number(e.v) : 0) + 1;
    this.kv.set(key, { v: String(n), exp: e?.exp || (ttlSec ? Date.now() + ttlSec * 1000 : 0) });
    return n;
  }
  async hincr(key: string, field: string, by: number) {
    const h = this.hashes.get(key) ?? new Map();
    const n = (h.get(field) ?? 0) + by;
    h.set(field, n);
    this.hashes.set(key, h);
    return n;
  }
  async get(key: string) { return this.alive(key)?.v ?? null; }
  async set(key: string, value: string, ttlSec?: number) { this.kv.set(key, { v: value, exp: ttlSec ? Date.now() + ttlSec * 1000 : 0 }); }
  async setNx(key: string, value: string, ttlMs: number) {
    if (this.alive(key)) return false;
    this.kv.set(key, { v: value, exp: Date.now() + ttlMs });
    return true;
  }
  async del(key: string) { this.kv.delete(key); }
  async exists(keys: string[]) { return keys.map((k) => !!this.alive(k)); }
  async sadd(key: string, m: string) { const s = this.sets.get(key) ?? new Set(); s.add(m); this.sets.set(key, s); }
  async srem(key: string, m: string) { this.sets.get(key)?.delete(m); }
  async smembers(key: string) { return [...(this.sets.get(key) ?? [])]; }
  async scard(key: string) { return this.sets.get(key)?.size ?? 0; }
}

type RedisLike = import('ioredis').default;

class RedisState implements SharedState {
  constructor(private r: RedisLike) {}
  async incr(key: string, ttlSec?: number) {
    const n = await this.r.incr(key);
    if (n === 1 && ttlSec) await this.r.expire(key, ttlSec);
    return n;
  }
  hincr(key: string, field: string, by: number) { return this.r.hincrby(key, field, by); }
  get(key: string) { return this.r.get(key); }
  async set(key: string, value: string, ttlSec?: number) { ttlSec ? await this.r.set(key, value, 'EX', ttlSec) : await this.r.set(key, value); }
  async setNx(key: string, value: string, ttlMs: number) { return (await this.r.set(key, value, 'PX', ttlMs, 'NX')) === 'OK'; }
  async del(key: string) { await this.r.del(key); }
  async exists(keys: string[]) {
    if (!keys.length) return [];
    const p = this.r.pipeline();
    keys.forEach((k) => p.exists(k));
    const res = (await p.exec()) ?? [];
    return res.map(([, v]) => v === 1);
  }
  async sadd(key: string, m: string) { await this.r.sadd(key, m); }
  async srem(key: string, m: string) { await this.r.srem(key, m); }
  smembers(key: string) { return this.r.smembers(key); }
  scard(key: string) { return this.r.scard(key); }
}

let state: SharedState = new MemoryState();
let redis: RedisLike | null = null;

/** Connects to Redis if configured. Returns the client (also used for the Socket.IO adapter). */
export async function initShared(): Promise<RedisLike | null> {
  if (!config.redisUrl) return null;
  const { default: Redis } = await import('ioredis');
  redis = new Redis(config.redisUrl, { maxRetriesPerRequest: 3, lazyConnect: false });
  state = new RedisState(redis);
  return redis;
}

/** For tests: inject a client (e.g. ioredis-mock). */
export function useRedisClient(client: RedisLike) { redis = client; state = new RedisState(client); }
export const redisClient = () => redis;

const extra: RedisLike[] = [];
/** A second connection (pub/sub needs its own). Tracked so shutdown can close it. */
export function duplicateRedis() {
  const d = redis!.duplicate();
  extra.push(d);
  return d;
}
export async function closeShared() {
  for (const c of [...extra, ...(redis ? [redis] : [])]) c.disconnect();
  extra.length = 0;
}
export const shared = (): SharedState => state;
