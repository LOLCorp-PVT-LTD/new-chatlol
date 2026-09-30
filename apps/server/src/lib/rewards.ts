import type { NotificationItem, RewardEvent } from '@chatlol/shared';
import { levelForXp, levelTitle, REWARDS, STREAK_MILESTONES } from '@chatlol/shared';
import { db, newId, now, today, json, type Row } from '../db';
import { io, room } from './io';
import { sendPush } from './push';
import { serializeNotification, DEFAULT_SETTINGS, userPublic } from './serialize';
import { presence } from './presence';

export function bumpCounter(userId: string, key: string, by = 1) {
  db.run(
    `INSERT INTO daily_counters (user_id, day, key, n) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, day, key) DO UPDATE SET n = n + excluded.n`,
    userId, today(), key, by);
  return db.one<Row>('SELECT n FROM daily_counters WHERE user_id = ? AND day = ? AND key = ?', userId, today(), key)!.n as number;
}

export function grant(userId: string, sparks: number, xp: number, reason: string, emit = true): RewardEvent {
  const before = db.one<Row>('SELECT xp, is_ai FROM users WHERE id = ?', userId);
  if (!before) return { sparks: 0, xp: 0, reason };
  db.run('UPDATE users SET sparks = MAX(0, sparks + ?), xp = xp + ? WHERE id = ?', sparks, xp, userId);
  const from = levelForXp(before.xp);
  const to = levelForXp(before.xp + xp);
  const ev: RewardEvent = { sparks, xp, reason, levelUp: to > from ? { from, to } : null };
  if (to > from && !before.is_ai) {
    notify(userId, { kind: 'level', title: `Level ${to} unlocked! 🎉`, body: `You're now a ${levelTitle(to)}. +${to * 10} bonus Sparks.`, link: '/locker' });
    db.run('UPDATE users SET sparks = sparks + ? WHERE id = ?', to * 10, userId);
  }
  if (emit && !before.is_ai) emitWallet(userId, ev);
  return ev;
}

export function emitWallet(userId: string, ev?: RewardEvent) {
  const u = db.one<Row>('SELECT sparks, xp FROM users WHERE id = ?', userId);
  if (!u) return;
  io()?.to(room.user(userId)).emit('wallet', { sparks: u.sparks, xp: u.xp, level: levelForXp(u.xp) });
  if (ev && (ev.sparks || ev.xp)) io()?.to(room.user(userId)).emit('reward', ev);
}

/** Records the rating quest & returns an extra reward if it just completed. */
export function progressRatingQuest(userId: string): RewardEvent | null {
  const n = bumpCounter(userId, 'rate');
  const q = REWARDS.questDailyOracle;
  if (n === q.target) {
    const r = grant(userId, q.sparks, q.xp, 'Daily Oracle quest complete! 🔮');
    r.questCompleted = 'daily_oracle';
    return r;
  }
  return null;
}

export function recordDropStreak(userId: string): { streak: number; milestone: number | null } {
  const u = db.one<Row>('SELECT streak_days, last_drop_day FROM users WHERE id = ?', userId)!;
  const t = today();
  const y = today(new Date(Date.now() - 86_400_000));
  if (u.last_drop_day === t) return { streak: u.streak_days, milestone: null };
  let streak = u.last_drop_day === y ? u.streak_days + 1 : 1;
  // Streak freeze: consumes one if you missed exactly one day.
  const dby = today(new Date(Date.now() - 2 * 86_400_000));
  if (u.last_drop_day === dby) {
    const freeze = db.one<Row>(`SELECT qty FROM inventory WHERE user_id = ? AND item_id = 'streak_freeze'`, userId);
    if (freeze && freeze.qty > 0) {
      db.run(`UPDATE inventory SET qty = qty - 1 WHERE user_id = ? AND item_id = 'streak_freeze'`, userId);
      streak = u.streak_days + 1;
    }
  }
  db.run('UPDATE users SET streak_days = ?, last_drop_day = ? WHERE id = ?', streak, t, userId);
  const milestone = STREAK_MILESTONES.includes(streak) ? streak : null;
  if (milestone) {
    const badges = json<string[]>(db.one<Row>('SELECT badges FROM users WHERE id = ?', userId)!.badges, []);
    const b = `streak_${milestone}`;
    if (!badges.includes(b)) db.run('UPDATE users SET badges = ? WHERE id = ?', JSON.stringify([...badges, b]), userId);
  }
  return { streak, milestone };
}

export function notify(
  userId: string,
  n: { kind: NotificationItem['kind']; title: string; body: string; actorId?: string | null; link?: string | null },
) {
  const target = db.one<Row>('SELECT is_ai, settings FROM users WHERE id = ?', userId);
  if (!target || target.is_ai) return;
  if (n.actorId && db.one('SELECT 1 FROM blocks WHERE blocker_id = ? AND blocked_id = ?', userId, n.actorId)) return;
  const id = newId('ntf');
  db.run(
    'INSERT INTO notifications (id, user_id, kind, title, body, actor_id, link, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    id, userId, n.kind, n.title, n.body, n.actorId ?? null, n.link ?? null, now());
  const row = db.one<Row>('SELECT * FROM notifications WHERE id = ?', id)!;
  io()?.to(room.user(userId)).emit('notification', serializeNotification(row));
  const settings = { ...DEFAULT_SETTINGS, ...json(target.settings, {}) };
  // Only push when the user isn't actively connected, so we never double-notify.
  if (settings.pushEnabled && !presence.humansOnline().includes(userId)) {
    void sendPush(userId, n.title, n.body, { link: n.link });
  }
}

export function ticker(text: string, actorId: string | null) {
  const actor = actorId ? db.one<Row>('SELECT * FROM users WHERE id = ?', actorId) : null;
  io()?.to(room.global).emit('ticker', { id: newId('tk'), text, actor: actor ? userPublic(actor) : null, at: now() });
}
