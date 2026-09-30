import { Router } from 'express';
import { z } from 'zod';
import { ARENA_MAX_STAKE, ARENA_MIN_STAKE, ARENA_RAKE } from '@chatlol/shared';
import { db, newId, now, type Row } from '../db';
import { optionalAuth, requireAuth, uid } from '../lib/auth';
import { HttpError, parse, rateLimit } from '../lib/http';
import { serializeTake, authorCache } from '../lib/serialize';
import { grant, notify, emitWallet } from '../lib/rewards';
import { assertClean } from '../lib/moderation';

export const arenaRouter = Router();

arenaRouter.get('/arena', optionalAuth, (req, res) => {
  resolveExpiredTakes();
  const author = authorCache(req.userId);
  const takes = db.all<Row>(
    `SELECT * FROM hot_takes WHERE resolved = 0 OR ends_at > ? ORDER BY resolved ASC, (agree_pool + disagree_pool) DESC LIMIT 30`,
    new Date(Date.now() - 86_400_000).toISOString(),
  ).map((t) => serializeTake(t, req.userId, author));
  const pool = db.one<Row>('SELECT COALESCE(SUM(agree_pool + disagree_pool), 0) n FROM hot_takes WHERE resolved = 0')!.n;
  const myStaked = req.userId
    ? db.one<Row>('SELECT COALESCE(SUM(s.amount), 0) n FROM stakes s JOIN hot_takes t ON t.id = s.take_id WHERE s.user_id = ? AND t.resolved = 0', req.userId)!.n
    : 0;
  res.json({ takes, pool, myStaked });
});

export function placeStake(userId: string, takeId: string, side: 'agree' | 'disagree', amount: number) {
  return db.tx(() => {
    const take = db.one<Row>('SELECT * FROM hot_takes WHERE id = ?', takeId);
    if (!take || take.resolved || take.ends_at < now()) throw new HttpError(409, 'This take is locked');
    if (db.one('SELECT 1 FROM stakes WHERE take_id = ? AND user_id = ?', takeId, userId)) throw new HttpError(409, "You've already picked a side");
    const u = db.one<Row>('SELECT sparks FROM users WHERE id = ?', userId)!;
    if (u.sparks < amount) throw new HttpError(402, 'Not enough Sparks — earn more in Roulette or Drops', 'insufficient_sparks');
    db.run('UPDATE users SET sparks = sparks - ? WHERE id = ?', amount, userId);
    db.run('INSERT INTO stakes VALUES (?, ?, ?, ?)', takeId, userId, side, amount);
    db.run(`UPDATE hot_takes SET ${side}_pool = ${side}_pool + ?, ${side}_count = ${side}_count + 1 WHERE id = ?`, amount, takeId);
    return db.one<Row>('SELECT * FROM hot_takes WHERE id = ?', takeId)!;
  });
}

arenaRouter.post('/arena/:id/stake', requireAuth, (req, res) => {
  const me = uid(req);
  rateLimit(`stake:${me}`, 30);
  const b = parse(z.object({ side: z.enum(['agree', 'disagree']), amount: z.number().int().min(ARENA_MIN_STAKE).max(ARENA_MAX_STAKE) }), req.body);
  const take = placeStake(me, String(req.params.id), b.side, b.amount);
  emitWallet(me);
  res.json({ take: serializeTake(take, me), sparks: db.one<Row>('SELECT sparks FROM users WHERE id = ?', me)!.sparks });
});

arenaRouter.post('/arena', requireAuth, (req, res) => {
  const me = uid(req);
  rateLimit(`propose:${me}`, 2);
  const b = parse(z.object({ category: z.string().min(2).max(20), statement: z.string().min(10).max(160) }), req.body);
  assertClean(b.statement);
  const id = newId('ht');
  db.run(
    'INSERT INTO hot_takes (id, author_id, category, statement, ends_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    id, me, b.category.toUpperCase(), b.statement, new Date(Date.now() + 12 * 3_600_000).toISOString(), now());
  res.status(201).json({ take: serializeTake(db.one<Row>('SELECT * FROM hot_takes WHERE id = ?', id)!, me) });
});

/**
 * Takes resolve by crowd majority (by head-count, not Sparks — so whales can't buy outcomes).
 * Winners split the pool proportionally minus a small rake that burns Sparks out of the economy.
 */
export function resolveExpiredTakes() {
  const due = db.all<Row>('SELECT * FROM hot_takes WHERE resolved = 0 AND ends_at <= ?', now());
  for (const t of due) {
    const outcome = t.agree_count === t.disagree_count ? (t.agree_pool >= t.disagree_pool ? 'agree' : 'disagree') : t.agree_count > t.disagree_count ? 'agree' : 'disagree';
    const winPool = outcome === 'agree' ? t.agree_pool : t.disagree_pool;
    const total = (t.agree_pool + t.disagree_pool) * (1 - ARENA_RAKE);
    db.tx(() => {
      db.run('UPDATE hot_takes SET resolved = 1, outcome = ? WHERE id = ?', outcome, t.id);
      for (const s of db.all<Row>('SELECT * FROM stakes WHERE take_id = ?', t.id)) {
        const won = s.side === outcome;
        const payout = won && winPool ? Math.floor((s.amount / winPool) * total) : 0;
        if (payout) grant(s.user_id, payout, 25, 'Hot Take win 🏆', false);
        notify(s.user_id, {
          kind: 'arena', link: '/arena',
          title: won ? `You called it! +${payout} Sparks 🏆` : 'The crowd went the other way 😅',
          body: `“${t.statement.slice(0, 80)}” — ${outcome.toUpperCase()} won.`,
        });
      }
    });
  }
  return due.length;
}
