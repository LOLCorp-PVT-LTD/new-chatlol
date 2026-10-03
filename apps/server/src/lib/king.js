import { KING } from '@chatlol/shared';
import { db, now } from '../db.js';

/** The reigning King of ChatLOL ({ userId, since, until }) or null. Cached briefly: every profile card asks. */
let cache = null;
let cachedAt = 0;
export async function getKing() {
  if (!cache || Date.now() - cachedAt > 15_000) {
    cache = (await db.settings.findOne({ _id: 'king' })) ?? { userId: null };
    cachedAt = Date.now();
  }
  return cache.userId && cache.until > now() ? cache : null;
}
export const isKing = async (userId) => !!userId && (await getKing())?.userId === userId;

/**
 * Crowns `userId`. The same King buying again extends the reign; anyone else takes the throne.
 * Returns the previous King's id when someone was dethroned.
 */
export async function crown(userId) {
  const current = await getKing();
  const extend = current?.userId === userId;
  const from = extend ? Date.parse(current.until) : Date.now();
  const until = new Date(from + KING.reignDays * 86_400_000).toISOString();
  await db.settings.updateOne({ _id: 'king' }, { $set: { userId, since: extend ? current.since : now(), until } }, { upsert: true });
  cache = null;
  await db.users.updateOne({ _id: userId }, { $addToSet: { badges: 'king' } });
  if (current && !extend) await db.users.updateOne({ _id: current.userId }, { $addToSet: { badges: 'former_king' } });
  return { until, dethroned: current && !extend ? current.userId : null };
}
