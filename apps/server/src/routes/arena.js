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

/** A new Hot Take document, open for `hours`. */
export function newTake({ hours, ...fields }) {
  return {
    imageUrl: null,
    agreePool: 0,
    disagreePool: 0,
    agreeCount: 0,
    disagreeCount: 0,
    endsAt: new Date(Date.now() + hours * 3_600_000).toISOString(),
    resolved: false,
    outcome: null,
    createdAt: now(),
    ...fields,
  };
}

arenaRouter.get('/arena', optionalAuth, async (req, res) => {
  const author = authorCache(req.userId);
  const rows = await db.hotTakes
    .aggregate([
      { $match: { $or: [{ resolved: false }, { endsAt: { $gt: new Date(Date.now() - 86_400_000).toISOString() } }] } },
      { $addFields: { pool: { $add: ['$agreePool', '$disagreePool'] } } },
      { $sort: { resolved: 1, pool: -1 } },
      { $limit: 30 },
    ])
    .toArray();
  const takes = await Promise.all(rows.map((t) => serializeTake(t, req.userId, author)));
  const [open] = await db.hotTakes
    .aggregate([{ $match: { resolved: false } }, { $group: { _id: null, n: { $sum: { $add: ['$agreePool', '$disagreePool'] } } } }])
    .toArray();
  let myStaked = 0;
  if (req.userId) {
    const stakes = await db.stakes.find({ userId: req.userId }).toArray();
    const live = new Set(await db.hotTakes.distinct('_id', { _id: { $in: stakes.map((x) => x.takeId) }, resolved: false }));
    myStaked = stakes.filter((x) => live.has(x.takeId)).reduce((n, x) => n + x.amount, 0);
  }
  const pool = open?.n ?? 0;
  res.json({ takes, pool, myStaked });
});

/** Stakes are paid only in earned Sparks — purchased Gems can never enter a pool. */
export async function placeStake(userId, takeId, side, amount) {
  return db.tx(async () => {
    const take = await db.hotTakes.findOne({ _id: takeId });
    if (!take || take.resolved || take.endsAt < now()) throw new HttpError(409, 'This take is locked');
    const placed = await db.stakes.insertIfMissing({ takeId, userId }, { side, amount, createdAt: now() });
    if (!placed) throw new HttpError(409, "You've already picked a side");
    const paid = await db.users.updateOne({ _id: userId, sparks: { $gte: amount } }, { $inc: { sparks: -amount } });
    if (!paid.modifiedCount) {
      if (!db.transactions) await db.stakes.deleteOne({ takeId, userId }); // no transaction to roll back for us
      throw new HttpError(402, 'Not enough Sparks — earn more in Roulette or Drops', 'insufficient_sparks');
    }
    return await db.hotTakes.findOneAndUpdate(
      { _id: takeId },
      { $inc: { [`${side}Pool`]: amount, [`${side}Count`]: 1 } },
      { returnDocument: 'after' },
    );
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
  res.json({ take: await serializeTake(take, me), sparks: (await db.users.findOne({ _id: me })).sparks });
});

arenaRouter.post('/arena', requireAuth, async (req, res) => {
  const me = uid(req);
  await rateLimit(`propose:${me}`, 2);
  const b = parse(z.object({ category: z.string().min(2).max(20), statement: z.string().min(10).max(160) }), req.body);
  assertClean(b.statement);
  const take = newTake({ _id: newId(), authorId: me, category: b.category.toUpperCase(), statement: b.statement, hours: 12 });
  await db.hotTakes.insertOne(take);
  res.status(201).json({ take: await serializeTake(take, me) });
});

/**
 * Takes resolve by crowd majority (by head-count, not Sparks — so whales can't buy outcomes).
 * Winners split the pool proportionally minus a small rake that burns Sparks out of the economy.
 * The conditional UPDATE means exactly one instance pays out, even with several running.
 */
export async function resolveExpiredTakes() {
  const due = await db.hotTakes.find({ resolved: false, endsAt: { $lte: now() } }).toArray();
  for (const t of due) {
    const outcome =
      t.agreeCount === t.disagreeCount
        ? t.agreePool >= t.disagreePool
          ? 'agree'
          : 'disagree'
        : t.agreeCount > t.disagreeCount
          ? 'agree'
          : 'disagree';
    const winPool = outcome === 'agree' ? t.agreePool : t.disagreePool;
    const total = (t.agreePool + t.disagreePool) * (1 - ARENA_RAKE);
    const results = await db.tx(async () => {
      const claimed = await db.hotTakes.updateOne({ _id: t._id, resolved: false }, { $set: { resolved: true, outcome } });
      if (!claimed.modifiedCount) return [];
      const out = [];
      for (const s of await db.stakes.find({ takeId: t._id }).toArray()) {
        const won = s.side === outcome;
        const payout = won && winPool ? Math.floor((s.amount / winPool) * total) : 0;
        if (payout) await grant(s.userId, payout, 25, 'Hot Take win 🏆', false);
        out.push({ userId: s.userId, won, payout });
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
