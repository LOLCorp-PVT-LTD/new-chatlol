import { shared } from './shared';

/**
 * Who is online. Humans: one `online:{id}` key per user with a TTL refreshed while any instance holds
 * one of their sockets. AI personas: members of the `presence:ai` set (driven by their awake schedule).
 */
const TTL = 75;
const local = new Map<string, number>(); // sockets held by *this* instance
const cache = new Map<string, { v: boolean; at: number }>();
let aiAwake = new Set<string>();
let aiAt = 0;

setInterval(() => { for (const id of local.keys()) void shared().set(`online:${id}`, '1', TTL); }, 30_000).unref();

async function aiSet() {
  if (Date.now() - aiAt > 5_000) { aiAwake = new Set(await shared().smembers('presence:ai')); aiAt = Date.now(); }
  return aiAwake;
}

export const presence = {
  /** Returns true if this is the user's first socket across the cluster. */
  async connect(userId: string) {
    local.set(userId, (local.get(userId) ?? 0) + 1);
    await shared().set(`online:${userId}`, '1', TTL);
    cache.delete(userId);
    return (await shared().hincr('presence:count', userId, 1)) === 1;
  },
  /** Returns true if the user has no sockets left anywhere. */
  async disconnect(userId: string) {
    const n = (local.get(userId) ?? 1) - 1;
    if (n <= 0) local.delete(userId); else local.set(userId, n);
    const global = await shared().hincr('presence:count', userId, -1);
    if (global <= 0) {
      await shared().hincr('presence:count', userId, -global); // clamp at 0
      await shared().del(`online:${userId}`);
      cache.delete(userId);
      return true;
    }
    return false;
  },
  async setAiAwake(userId: string, awake: boolean) {
    awake ? await shared().sadd('presence:ai', userId) : await shared().srem('presence:ai', userId);
    aiAt = 0;
  },
  async isOnline(userId: string) {
    const c = cache.get(userId);
    if (c && Date.now() - c.at < 5_000) return c.v;
    const v = (await aiSet()).has(userId) || (await shared().exists([`online:${userId}`]))[0];
    cache.set(userId, { v, at: Date.now() });
    return v;
  },
  /** Humans with a socket on this instance (used to avoid double-notifying via push). */
  isLocallyConnected: (userId: string) => local.has(userId),
  async isConnectedAnywhere(userId: string) { return (await shared().exists([`online:${userId}`]))[0]; },
  async count() { return (await shared().scard('presence:ai')) + local.size; },
};
