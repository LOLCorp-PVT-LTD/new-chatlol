import { Router } from 'express';
import { z } from 'zod';
import { ARENA_MAX_STAKE, ARENA_MIN_STAKE, ARENA_RAKE } from '@chatlol/shared';
import { db, newId, now } from '../db.js';
import { optionalAuth, requireAuth, uid } from '../lib/auth.js';
import { HttpError, parse, rateLimit } from '../lib/http.js';
import { serializeTake, authorCache } from '../lib/serialize.js';
import { grant, notify, emitWallet } from '../lib/rewards.js';
import { assertClean } from '../lib/moderation.js';

export const arenaRouter = Router();

arenaRouter.get('/arena', optionalAuth, async (req, res) => {
  const author = authorCache(req.userId);
  const rows = await db.all(
    `SELECT * FROM hot_takes WHERE resolved = 0 OR ends_at > ? ORDER BY resolved ASC, (agree_pool + disagree_pool) DESC LIMIT 30`,
    new Date(Date.now() - 86_400_000).toISOString(),
  );
  const takes = await Promise.all(rows.map((t) => serializeTake(t, req.userId, author)));
  const pool = (await db.one('SELECT COALESCE(SUM(agree_pool + disagree_pool), 0) AS n FROM hot_takes WHERE resolved = 0')).n;
  const myStaked = req.userId
    ? (
        await db.one(
          'SELECT COALESCE(SUM(s.amount), 0) AS n FROM stakes s JOIN hot_takes t ON t.id = s.take_id WHERE s.user_id = ? AND t.resolved = 0',
          req.userId,
        )
      ).n
    : 0;
  res.json({ takes, pool, myStaked });
});

/** Stakes are paid only in earned Sparks — purchased Gems can never enter a pool. */
export async function placeStake(userId, takeId, side, amount) {
  return db.tx(async () => {
    const take = await db.one('SELECT * FROM hot_takes WHERE id = ?', takeId);
    if (!take || take.resolved || take.ends_at < now()) throw new HttpError(409, 'This take is locked');
    const ins = await db.run(
      'INSERT INTO stakes (take_id, user_id, side, amount) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING',
      takeId,
      userId,
      side,
      amount,
    );
    if (!ins.changes) throw new HttpError(409, "You've already picked a side");
    const paid = await db.run('UPDATE users SET sparks = sparks - ? WHERE id = ? AND sparks >= ?', amount, userId, amount);
    if (!paid.changes) throw new HttpError(402, 'Not enough Sparks — earn more in Roulette or Drops', 'insufficient_sparks');
    await db.run(`UPDATE hot_takes SET ${side}_pool = ${side}_pool + ?, ${side}_count = ${side}_count + 1 WHERE id = ?`, amount, takeId);
    return await db.one('SELECT * FROM hot_takes WHERE id = ?', takeId);
  });
}

arenaRouter.post('/arena/:id/stake', requireAuth, async (req, res) => {
  const me = uid(req);
  await rateLimit(`stake:${me}`, 30);
  const b = parse(
    z.object({ side: z.enum(['agree', 'disagree']), amount: z.number().int().min(ARENA_MIN_STAKE).max(ARENA_MAX_STAKE) }),
    req.body,
  );
  const take = await placeStake(me, String(req.params.id), b.side, b.amount);
  await emitWallet(me);
  res.json({ take: await serializeTake(take, me), sparks: (await db.one('SELECT sparks FROM users WHERE id = ?', me)).sparks });
});

arenaRouter.post('/arena', requireAuth, async (req, res) => {
  const me = uid(req);
  await rateLimit(`propose:${me}`, 2);
  const b = parse(z.object({ category: z.string().min(2).max(20), statement: z.string().min(10).max(160) }), req.body);
  assertClean(b.statement);
  const id = newId('ht');
  await db.run(
    'INSERT INTO hot_takes (id, author_id, category, statement, ends_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    id,
    me,
    b.category.toUpperCase(),
    b.statement,
    new Date(Date.now() + 12 * 3_600_000).toISOString(),
    now(),
  );
  res.status(201).json({ take: await serializeTake(await db.one('SELECT * FROM hot_takes WHERE id = ?', id), me) });
});

/**
 * Takes resolve by crowd majority (by head-count, not Sparks — so whales can't buy outcomes).
 * Winners split the pool proportionally minus a small rake that burns Sparks out of the economy.
 * The conditional UPDATE means exactly one instance pays out, even with several running.
 */
export async function resolveExpiredTakes() {
  const due = await db.all('SELECT * FROM hot_takes WHERE resolved = 0 AND ends_at <= ?', now());
  for (const t of due) {
    const outcome =
      t.agree_count === t.disagree_count
        ? t.agree_pool >= t.disagree_pool
          ? 'agree'
          : 'disagree'
        : t.agree_count > t.disagree_count
          ? 'agree'
          : 'disagree';
    const winPool = outcome === 'agree' ? t.agree_pool : t.disagree_pool;
    const total = (t.agree_pool + t.disagree_pool) * (1 - ARENA_RAKE);
    const results = await db.tx(async () => {
      const claimed = await db.run('UPDATE hot_takes SET resolved = 1, outcome = ? WHERE id = ? AND resolved = 0', outcome, t.id);
      if (!claimed.changes) return [];
      const out = [];
      for (const s of await db.all('SELECT * FROM stakes WHERE take_id = ?', t.id)) {
        const won = s.side === outcome;
        const payout = won && winPool ? Math.floor((s.amount / winPool) * total) : 0;
        if (payout) await grant(s.user_id, payout, 25, 'Hot Take win 🏆', false);
        out.push({ userId: s.user_id, won, payout });
      }
      return out;
    });
    for (const r of results) {
      await notify(r.userId, {
        kind: 'arena',
        link: '/arena',
        title: r.won ? `You called it! +${r.payout} Sparks 🏆` : 'The crowd went the other way 😅',
        body: `“${t.statement.slice(0, 80)}” — ${outcome.toUpperCase()} won.`,
      });
      await emitWallet(r.userId);
    }
  }
  return due.length;
}
