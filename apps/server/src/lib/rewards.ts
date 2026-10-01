import type { NotificationItem, RewardEvent } from '@chatlol/shared';
import { levelForXp, levelTitle, REWARDS, STREAK_MILESTONES } from '@chatlol/shared';
import { db, newId, now, today, json, type Row } from '../db';
import { io, room } from './io';
import { sendPush } from './push';
import { serializeNotification, DEFAULT_SETTINGS, userPublic } from './serialize';
import { presence } from './presence';

export async function bumpCounter(userId: string, key: string, by = 1) {
  await db.run(
    `INSERT INTO daily_counters (user_id, day, key, n) VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id, day, key) DO UPDATE SET n = daily_counters.n + excluded.n`,
    userId, today(), key, by);
  return (await db.one<Row>('SELECT n FROM daily_counters WHERE user_id = ? AND day = ? AND key = ?', userId, today(), key))!.n as number;
}

export async function grant(userId: string, sparks: number, xp: number, reason: string, emit = true): Promise<RewardEvent> {
  const before = await db.one<Row>('SELECT xp, is_ai FROM users WHERE id = ?', userId);
  if (!before) return { sparks: 0, xp: 0, reason };
  await db.run('UPDATE users SET sparks = CASE WHEN sparks + ? < 0 THEN 0 ELSE sparks + ? END, xp = xp + ? WHERE id = ?', sparks, sparks, xp, userId);
  const from = levelForXp(before.xp);
  const to = levelForXp(before.xp + xp);
  const ev: RewardEvent = { sparks, xp, reason, levelUp: to > from ? { from, to } : null };
  if (to > from && !before.is_ai) {
    await db.run('UPDATE users SET sparks = sparks + ? WHERE id = ?', to * 10, userId);
    await notify(userId, { kind: 'level', title: `Level ${to} unlocked! 🎉`, body: `You're now a ${levelTitle(to)}. +${to * 10} bonus Sparks.`, link: '/locker' });
  }
  if (emit && !before.is_ai) await emitWallet(userId, ev);
  return ev;
}

export async function emitWallet(userId: string, ev?: RewardEvent) {
  const u = await db.one<Row>('SELECT sparks, gems, xp FROM users WHERE id = ?', userId);
  if (!u) return;
  io()?.to(room.user(userId)).emit('wallet', { sparks: u.sparks, gems: u.gems, xp: u.xp, level: levelForXp(u.xp) });
  if (ev && (ev.sparks || ev.xp)) io()?.to(room.user(userId)).emit('reward', ev);
}

/** Records the rating quest & returns an extra reward if it just completed. */
export async function progressRatingQuest(userId: string): Promise<RewardEvent | null> {
  const n = await bumpCounter(userId, 'rate');
  const q = REWARDS.questDailyOracle;
  if (n === q.target) {
    const r = await grant(userId, q.sparks, q.xp, 'Daily Oracle quest complete! 🔮');
    r.questCompleted = 'daily_oracle';
    return r;
  }
  return null;
}

export async function recordDropStreak(userId: string): Promise<{ streak: number; milestone: number | null }> {
  const u = (await db.one<Row>('SELECT streak_days, last_drop_day, badges FROM users WHERE id = ?', userId))!;
  const t = today();
  const y = today(new Date(Date.now() - 86_400_000));
  if (u.last_drop_day === t) return { streak: u.streak_days, milestone: null };
  let streak = u.last_drop_day === y ? u.streak_days + 1 : 1;
  // Streak freeze: consumes one if you missed exactly one day.
  const dby = today(new Date(Date.now() - 2 * 86_400_000));
  if (u.last_drop_day === dby) {
    const used = await db.run(`UPDATE inventory SET qty = qty - 1 WHERE user_id = ? AND item_id = 'streak_freeze' AND qty > 0`, userId);
    if (used.changes) streak = u.streak_days + 1;
  }
  await db.run('UPDATE users SET streak_days = ?, last_drop_day = ? WHERE id = ?', streak, t, userId);
  const milestone = STREAK_MILESTONES.includes(streak) ? streak : null;
  if (milestone) {
    const badges = json<string[]>(u.badges, []);
    const b = `streak_${milestone}`;
    if (!badges.includes(b)) await db.run('UPDATE users SET badges = ? WHERE id = ?', JSON.stringify([...badges, b]), userId);
  }
  return { streak, milestone };
}

export async function notify(
  userId: string,
  n: { kind: NotificationItem['kind']; title: string; body: string; actorId?: string | null; link?: string | null },
) {
  const target = await db.one<Row>('SELECT is_ai, settings FROM users WHERE id = ?', userId);
  if (!target || target.is_ai) return;
  if (n.actorId && (await db.one('SELECT 1 AS x FROM blocks WHERE blocker_id = ? AND blocked_id = ?', userId, n.actorId))) return;
  const id = newId('ntf');
  await db.run(
    'INSERT INTO notifications (id, user_id, kind, title, body, actor_id, link, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    id, userId, n.kind, n.title, n.body, n.actorId ?? null, n.link ?? null, now());
  const row = (await db.one<Row>('SELECT * FROM notifications WHERE id = ?', id))!;
  io()?.to(room.user(userId)).emit('notification', await serializeNotification(row));
  const settings = { ...DEFAULT_SETTINGS, ...json(target.settings, {}) };
  // Only push when the user isn't connected anywhere, so we never double-notify.
  if (settings.pushEnabled && !(await presence.isConnectedAnywhere(userId))) {
    void sendPush(userId, n.title, n.body, { link: n.link });
  }
}

export async function ticker(text: string, actorId: string | null) {
  const actor = actorId ? await db.one<Row>('SELECT * FROM users WHERE id = ?', actorId) : null;
  io()?.to(room.global).emit('ticker', { id: newId('tk'), text, actor: actor ? await userPublic(actor) : null, at: now() });
}
