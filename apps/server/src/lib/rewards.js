import { PREMIUM_GEM_DROP, gemDropFor, hasPower, levelForXp, levelTitle, REWARDS, STREAK_MILESTONES } from '@chatlol/shared';
import { db, newId, now, today } from '../db.js';
import { io, room } from './io.js';
import { sendPush } from './push.js';
import { serializeNotification, DEFAULT_SETTINGS, userPublic, isPremium } from './serialize.js';
import { presence } from './presence.js';
import { itemIdFor } from './ids.js';

export async function bumpCounter(userId, key, by = 1) {
  const day = today();
  const r = await db.dailyCounters.findOneAndUpdate(
    { userId, day, key },
    { $inc: { n: by }, $setOnInsert: { at: new Date() } },
    { upsert: true, returnDocument: 'after' },
  );
  return r.n;
}

/**
 * Pays Sparks / XP. Rewards are doubled by a running Spark Surge / XP Surge; pass `{ boost: false }` for
 * payouts that aren't rewards (winnings, refunds).
 */
export async function grant(userId, sparks, xp, reason, emit = true, { boost = true } = {}) {
  const before = await db.users.findOne({ _id: userId }, { projection: { xp: 1, sparks: 1, isAi: 1, powers: 1, premium: 1 } });
  if (!before) return { sparks: 0, xp: 0, reason };
  let boosted = false;
  if (boost && sparks > 0 && hasPower(before, 'boost_2x')) (sparks *= 2), (boosted = true);
  if (boost && xp > 0 && hasPower(before, 'xp_surge')) (xp *= 2), (boosted = true);
  // Sparks never go below zero.
  await db.users.updateOne({ _id: userId }, [
    { $set: { sparks: { $max: [0, { $add: ['$sparks', sparks] }] }, xp: { $add: ['$xp', xp] } } },
  ]);
  // Premium: a chance of bonus Gems on every Spark reward (not on winnings or refunds).
  let gems = 0;
  if (boost && sparks > 0 && !before.isAi && before.premium?.until > now() && Math.random() < PREMIUM_GEM_DROP.chance) {
    gems = gemDropFor(sparks);
    await db.users.updateOne({ _id: userId }, { $inc: { gems } });
  }
  const from = levelForXp(before.xp);
  const to = levelForXp(before.xp + xp);
  const ev = { sparks, xp, gems, reason, boosted, levelUp: to > from ? { from, to } : null };
  if (to > from && !before.isAi) {
    void import('./referrals.js').then((m) => m.maybePayReferral(userId)).catch(() => {});
    await db.users.updateOne({ _id: userId }, { $inc: { sparks: to * 10 } });
    await notify(userId, {
      kind: 'level',
      title: `Level ${to} unlocked! 🎉`,
      body: `You're now a ${levelTitle(to)}. +${to * 10} bonus Sparks.`,
      link: '/locker',
    });
  }
  if (emit && !before.isAi) await emitWallet(userId, ev);
  return ev;
}

export async function emitWallet(userId, ev) {
  const u = await db.users.findOne({ _id: userId }, { projection: { sparks: 1, gems: 1, gold: 1, xp: 1 } });
  if (!u) return;
  io()
    ?.to(room.user(userId))
    .emit('wallet', { sparks: u.sparks, gems: u.gems ?? 0, gold: u.gold ?? 0, xp: u.xp, level: levelForXp(u.xp) });
  if (ev && (ev.sparks || ev.xp)) io()?.to(room.user(userId)).emit('reward', ev);
}

/** Records the rating quest & returns an extra reward if it just completed. */
export async function progressRatingQuest(userId) {
  const n = await bumpCounter(userId, 'rate');
  const q = REWARDS.questDailyOracle;
  if (n === q.target) {
    const r = await grant(userId, q.sparks, q.xp, 'Daily Oracle quest complete! 🔮');
    r.questCompleted = 'daily_oracle';
    return r;
  }
  return null;
}

export async function recordDropStreak(userId) {
  const u = await db.users.findOne({ _id: userId }, { projection: { streakDays: 1, lastDropDay: 1, badges: 1 } });
  const t = today();
  const y = today(new Date(Date.now() - 86_400_000));
  if (u.lastDropDay === t) return { streak: u.streakDays, milestone: null };
  let streak = u.lastDropDay === y ? u.streakDays + 1 : 1;
  // Streak freeze: consumes one if you missed exactly one day.
  const dby = today(new Date(Date.now() - 2 * 86_400_000));
  if (u.lastDropDay === dby) {
    const used = await db.inventory.updateOne({ userId, itemId: itemIdFor('streak_freeze'), qty: { $gt: 0 } }, { $inc: { qty: -1 } });
    if (used.modifiedCount) streak = u.streakDays + 1;
  }
  const milestone = STREAK_MILESTONES.includes(streak) ? streak : null;
  await db.users.updateOne(
    { _id: userId },
    { $set: { streakDays: streak, lastDropDay: t }, ...(milestone ? { $addToSet: { badges: `streak_${milestone}` } } : {}) },
  );
  return { streak, milestone };
}

/** Which setting switches each notification kind off. Kinds not listed (system, level, gift…) always arrive. */
const KIND_SETTING = {
  rating: 'notifyRatings',
  profile_rating: 'notifyRatings',
  profile_view: 'notifyRatings',
  comment: 'notifyComments',
  wall: 'notifyComments',
  follow: 'notifyFollows',
  friend_request: 'notifyFollows',
  friend_accepted: 'notifyFollows',
  birthday: 'notifyFollows',
  dm: 'notifyDms',
  mention: 'notifyMentions',
  invite: 'notifyLive',
  arena: 'notifyArena',
};

/**
 * Sends an in-app notification (+ push when offline).
 * `anonTitle`: the wording free members see ("Someone rated your photo…"). Premium members see who it was.
 * Actions by AI personas are never anonymised, so the "who was it?" teaser is only ever about real people.
 */
export async function notify(userId, n) {
  const target = await db.users.findOne({ _id: userId }, { projection: { isAi: 1, settings: 1, premium: 1 } });
  if (!target || target.isAi) return;
  const settings = { ...DEFAULT_SETTINGS, ...target.settings };
  if (KIND_SETTING[n.kind] && settings[KIND_SETTING[n.kind]] === false) return;
  if (n.actorId && (await db.blocks.findOne({ blockerId: userId, blockedId: n.actorId }))) return;
  const actorIsAi = n.actorId ? !!(await db.users.findOne({ _id: n.actorId }, { projection: { isAi: 1 } }))?.isAi : false;
  const doc = {
    _id: newId(),
    userId,
    kind: n.kind,
    title: n.title,
    anonTitle: actorIsAi ? null : (n.anonTitle ?? null),
    body: n.body,
    actorId: n.actorId ?? null,
    link: n.link ?? null,
    read: false,
    createdAt: now(),
  };
  await db.notifications.insertOne(doc);
  const premium = isPremium(target);
  io()
    ?.to(room.user(userId))
    .emit('notification', await serializeNotification(doc, undefined, premium));
  // Only push when the user isn't connected anywhere, so we never double-notify.
  if (settings.pushEnabled && !(await presence.isConnectedAnywhere(userId))) {
    void sendPush(userId, doc.anonTitle && !premium ? doc.anonTitle : n.title, n.body, { link: n.link });
  }
}

export async function ticker(text, actorId) {
  const actor = actorId ? await db.users.findOne({ _id: actorId }) : null;
  io()
    ?.to(room.global)
    .emit('ticker', { id: newId(), text, actor: actor ? await userPublic(actor) : null, at: now() });
}
