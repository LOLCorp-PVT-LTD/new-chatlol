import { levelForXp, levelTitle, REWARDS, STREAK_MILESTONES } from '@chatlol/shared';
import { db, newId, now, today } from '../db.js';
import { io, room } from './io.js';
import { sendPush } from './push.js';
import { serializeNotification, DEFAULT_SETTINGS, userPublic } from './serialize.js';
import { presence } from './presence.js';

export async function bumpCounter(userId, key, by = 1) {
  const day = today();
  const r = await db.dailyCounters.findOneAndUpdate(
    { _id: `${userId}:${day}:${key}` },
    { $inc: { n: by }, $setOnInsert: { userId, day, key, at: new Date() } },
    { upsert: true, returnDocument: 'after' },
  );
  return r.n;
}

export async function grant(userId, sparks, xp, reason, emit = true) {
  const before = await db.users.findOne({ _id: userId }, { projection: { xp: 1, sparks: 1, isAi: 1 } });
  if (!before) return { sparks: 0, xp: 0, reason };
  // Sparks never go below zero.
  await db.users.updateOne({ _id: userId }, [
    { $set: { sparks: { $max: [0, { $add: ['$sparks', sparks] }] }, xp: { $add: ['$xp', xp] } } },
  ]);
  const from = levelForXp(before.xp);
  const to = levelForXp(before.xp + xp);
  const ev = { sparks, xp, reason, levelUp: to > from ? { from, to } : null };
  if (to > from && !before.isAi) {
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
  const u = await db.users.findOne({ _id: userId }, { projection: { sparks: 1, gems: 1, xp: 1 } });
  if (!u) return;
  io()
    ?.to(room.user(userId))
    .emit('wallet', { sparks: u.sparks, gems: u.gems ?? 0, xp: u.xp, level: levelForXp(u.xp) });
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
    const used = await db.inventory.updateOne({ userId, itemId: 'streak_freeze', qty: { $gt: 0 } }, { $inc: { qty: -1 } });
    if (used.modifiedCount) streak = u.streakDays + 1;
  }
  const milestone = STREAK_MILESTONES.includes(streak) ? streak : null;
  await db.users.updateOne(
    { _id: userId },
    { $set: { streakDays: streak, lastDropDay: t }, ...(milestone ? { $addToSet: { badges: `streak_${milestone}` } } : {}) },
  );
  return { streak, milestone };
}

export async function notify(userId, n) {
  const target = await db.users.findOne({ _id: userId }, { projection: { isAi: 1, settings: 1 } });
  if (!target || target.isAi) return;
  if (n.actorId && (await db.blocks.findOne({ blockerId: userId, blockedId: n.actorId }))) return;
  const doc = {
    _id: newId('ntf'),
    userId,
    kind: n.kind,
    title: n.title,
    body: n.body,
    actorId: n.actorId ?? null,
    link: n.link ?? null,
    read: false,
    createdAt: now(),
  };
  await db.notifications.insertOne(doc);
  io()
    ?.to(room.user(userId))
    .emit('notification', await serializeNotification(doc));
  const settings = { ...DEFAULT_SETTINGS, ...target.settings };
  // Only push when the user isn't connected anywhere, so we never double-notify.
  if (settings.pushEnabled && !(await presence.isConnectedAnywhere(userId))) {
    void sendPush(userId, n.title, n.body, { link: n.link });
  }
}

export async function ticker(text, actorId) {
  const actor = actorId ? await db.users.findOne({ _id: actorId }) : null;
  io()
    ?.to(room.global)
    .emit('ticker', { id: newId('tk'), text, actor: actor ? await userPublic(actor) : null, at: now() });
}
