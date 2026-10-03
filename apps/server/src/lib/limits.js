import { SHOUT_COOLDOWN_SEC, hasPower } from '@chatlol/shared';
import { db } from '../db.js';
import { rateLimit } from './http.js';

/**
 * Posting limits that power-ups can lift. Overdrive multiplies the per-minute caps by 5; Shout Storm cuts the shout
 * wait from SHOUT_COOLDOWN_SEC to a few seconds (a small floor stays, so nobody can flood the shoutbox by script).
 */
export const OVERDRIVE_SCALE = 5;
export const STORM_COOLDOWN_SEC = 3;

const powersOf = (userId) => db.users.findOne({ _id: userId }, { projection: { powers: 1 } });

export async function postLimit(userId, key, perMinute) {
  const u = await powersOf(userId);
  await rateLimit(`${key}:${userId}`, hasPower(u, 'overdrive') ? perMinute * OVERDRIVE_SCALE : perMinute);
}

/** Seconds between shouts for this member right now. */
export async function shoutGap(userId) {
  return hasPower(await powersOf(userId), 'shout_storm') ? STORM_COOLDOWN_SEC : SHOUT_COOLDOWN_SEC;
}
