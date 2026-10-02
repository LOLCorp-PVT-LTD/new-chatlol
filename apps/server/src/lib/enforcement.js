import { STRIKE_LADDER, STRIKE_WINDOW_DAYS } from '@chatlol/shared';
import { db, newId, now } from '../db.js';
import { HttpError } from './http.js';
import { io, room } from './io.js';

/**
 * Account standing: active → muted (can read, can't post or chat) → suspended (can't sign in until a date)
 * → banned (terminated, permanent). Strikes from SafeShield or moderators escalate along STRIKE_LADDER.
 */

/** The standing that applies right now (an expired mute or suspension counts as active). */
export function standing(u) {
  const m = u?.moderation ?? {};
  if (m.status === 'banned') return { status: 'banned', until: null, reason: m.reason ?? null };
  if ((m.status === 'suspended' || m.status === 'muted') && m.until && m.until > now())
    return { status: m.status, until: m.until, reason: m.reason ?? null };
  return { status: 'active', until: null, reason: null };
}

const fmt = (iso) => new Date(iso).toUTCString().replace(':00 GMT', ' UTC');

/** Throws for terminated or currently suspended accounts (used at login and on every authenticated request). */
export function assertNotBanned(u) {
  const s = standing(u);
  if (s.status === 'banned')
    throw new HttpError(
      403,
      `This account was terminated for breaking the Community Guidelines.${s.reason ? ` Reason: ${s.reason}` : ''}`,
      'account_banned',
    );
  if (s.status === 'suspended')
    throw new HttpError(
      403,
      `This account is suspended until ${fmt(s.until)}.${s.reason ? ` Reason: ${s.reason}` : ''}`,
      'account_suspended',
    );
}

/** Throws if the user may not post, comment, shout or chat right now. */
export async function assertCanPost(userId) {
  const u = await db.users.findOne({ _id: userId }, { projection: { moderation: 1 } });
  assertNotBanned(u);
  const s = standing(u);
  if (s.status === 'muted')
    throw new HttpError(403, `You're muted until ${fmt(s.until)} — you can still read and rate. ${s.reason ?? ''}`.trim(), 'muted');
}
/** Same check for socket handlers, which drop the event instead of throwing. */
export async function canPost(userId) {
  try {
    await assertCanPost(userId);
    return true;
  } catch {
    return false;
  }
}

const ACTION_COPY = {
  warn: (r) => ['SafeShield warning ⚠️', `Heads up: ${r}. Repeat it and you'll be muted.`],
  mute: (r, until) => ['You’ve been muted 🔇', `${r}. You can post again ${fmt(until)}.`],
  suspend: (r, until) => ['Account suspended', `${r}. Suspended until ${fmt(until)}.`],
  ban: (r) => ['Account terminated', r],
  unmute: () => ['You can post again ✅', 'Your mute was lifted.'],
  unsuspend: () => ['Suspension lifted ✅', 'Welcome back.'],
  unban: () => ['Account restored ✅', 'Your account was restored by a moderator.'],
};

/**
 * Applies a moderation action and records it. `by` is 'ai' (SafeShield) or a moderator's user id.
 * actions: warn | mute | suspend | ban | unmute | unsuspend | unban | strike_clear
 */
export async function applyAction(
  userId,
  { action, minutes = 0, reason = 'Community Guidelines violation', by = 'ai', category = null, ref = null },
) {
  const until = minutes ? new Date(Date.now() + minutes * 60_000).toISOString() : null;
  const set = {
    mute: { moderation: { status: 'muted', until, reason } },
    suspend: { moderation: { status: 'suspended', until, reason } },
    ban: { moderation: { status: 'banned', until: null, reason } },
    unmute: { moderation: { status: 'active', until: null, reason: null } },
    unsuspend: { moderation: { status: 'active', until: null, reason: null } },
    unban: { moderation: { status: 'active', until: null, reason: null } },
  }[action];
  if (set) await db.users.updateOne({ _id: userId }, { $set: set });
  if (action === 'strike_clear')
    await db.modEvents.updateMany({ userId, kind: 'strike', cleared: { $ne: true } }, { $set: { cleared: true } });
  await db.modEvents.insertOne({ _id: newId(), userId, kind: action, minutes, until, reason, category, ref, byUserId: by, createdAt: now() });

  const copy = ACTION_COPY[action]?.(reason, until);
  if (copy) {
    // Imported lazily: rewards.js imports this module's callers.
    const { notify } = await import('./rewards.js');
    await notify(userId, { kind: 'system', title: copy[0], body: copy[1], link: '/settings' });
  }
  io()?.to(room.user(userId)).emit('moderation', { action, until, reason });
  if (action === 'suspend' || action === 'ban') io()?.in(room.user(userId)).disconnectSockets(true);
}

/**
 * Records a strike and escalates. Severe violations (threats, exploitation, criminal activity) skip the ladder:
 * immediate 30-day suspension and a flag so a human moderator can decide on termination.
 */
export async function addStrike(userId, { reason, category = null, ref = null, severe = false, by = 'ai' }) {
  const u = await db.users.findOne({ _id: userId }, { projection: { isAi: 1, role: 1 } });
  if (!u || u.isAi) return null;
  await db.modEvents.insertOne({ _id: newId(), userId, kind: 'strike', reason, category, ref, byUserId: by, severe, createdAt: now() });
  if (severe) {
    await applyAction(userId, { action: 'suspend', minutes: 30 * 24 * 60, reason, by, category, ref });
    await flag({ userId, reason: `Severe: ${reason}`, category, ref, priority: 'high' });
    return 'suspend';
  }
  const since = new Date(Date.now() - STRIKE_WINDOW_DAYS * 86_400_000).toISOString();
  const strikes = await db.modEvents.countDocuments({ userId, kind: 'strike', cleared: { $ne: true }, createdAt: { $gt: since } });
  const step = [...STRIKE_LADDER].reverse().find((s) => strikes >= s.strikes);
  if (!step) return null;
  await applyAction(userId, { action: step.action, minutes: step.minutes, reason, by, category, ref });
  // Five or more strikes in the window: put it in front of a human for a possible termination.
  if (strikes >= 5)
    await flag({
      userId,
      reason: `${strikes} strikes in ${STRIKE_WINDOW_DAYS} days — review for termination`,
      category,
      ref,
      priority: 'high',
    });
  return step.action;
}

/** Adds an item to the admin review queue. */
export async function flag({ userId, reason, category = null, ref = null, priority = 'normal', excerpt = null }) {
  await db.modFlags.insertOne({ _id: newId(), userId, reason, category, ref, excerpt, priority, status: 'open', createdAt: now() });
}
