import { Router } from 'express';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { ARCADE, ARCADE_KEYS, GAME_KEYS, replayArcade } from '@chatlol/shared';
import { db, newId, now, today } from '../db.js';
import { optionalAuth, requireAuth, uid } from '../lib/auth.js';
import { HttpError, parse, rateLimit } from '../lib/http.js';
import { authorCache } from '../lib/serialize.js';
import { bumpCounter, grant } from '../lib/rewards.js';
import { track } from '../lib/activity.js';

/**
 * Arcade: single-player games with leaderboards. A run starts on the server (which picks the seed); when it ends
 * the client sends its recorded inputs and the server replays the game to get the score — a posted number is
 * never trusted. Runs can't finish faster than real time. Good runs earn a few Sparks (capped per day).
 */
export const arcadeRouter = Router();
const SPARKS_PER_DAY = 100;
const sparksFor = { snake: (s) => s / 10, flight: (s) => s, 2048: (s) => s / 200, tower: (s) => s / 20 };

arcadeRouter.post('/arcade/:game/start', requireAuth, async (req, res) => {
  const me = uid(req);
  const game = String(req.params.game);
  if (!ARCADE[game]) throw new HttpError(404, 'Unknown game');
  await rateLimit(`arcade:${me}`, 60);
  const run = { _id: newId(), userId: me, game, seed: randomInt(2 ** 31), status: 'running', score: null, startedAt: now() };
  await db.arcadeRuns.insertOne(run);
  res.status(201).json({ runId: run._id, seed: run.seed });
});

arcadeRouter.post('/arcade/runs/:id/finish', requireAuth, async (req, res) => {
  const me = uid(req);
  const { inputs } = parse(
    z.object({ inputs: z.array(z.tuple([z.number().int().min(0), z.string().max(8)])).max(30_000) }),
    req.body,
  );
  const run = await db.arcadeRuns.findOne({ _id: String(req.params.id), userId: me });
  if (!run) throw new HttpError(404, 'Run not found');
  if (run.status !== 'running') throw new HttpError(409, 'That run is already scored');
  for (let i = 1; i < inputs.length; i++) if (inputs[i][0] < inputs[i - 1][0]) throw new HttpError(400, 'Inputs out of order');
  const r = replayArcade(run.game, run.seed, inputs);
  const tickMs = ARCADE[run.game].TICK_MS;
  const elapsed = Date.now() - Date.parse(run.startedAt);
  // Can't play faster than real time (2048 is turn-based: at most ~20 moves a second).
  const minMs = tickMs ? r.ticks * tickMs * 0.9 : r.ticks * 50;
  const suspicious = elapsed + 3000 < minMs;
  const score = suspicious ? 0 : r.score;
  const prevBest = (await db.arcadeRuns.find({ userId: me, game: run.game, status: 'done' }).sort({ score: -1 }).limit(1).toArray())[0]?.score ?? 0;
  await db.arcadeRuns.updateOne({ _id: run._id }, { $set: { status: suspicious ? 'rejected' : 'done', score, durationMs: elapsed, finishedAt: now() } });
  track(me, 'arcade');
  let reward = null;
  if (score > 0) {
    const want = Math.floor(sparksFor[run.game](score));
    const used = (await db.dailyCounters.findOne({ userId: me, day: today(), key: 'arcade_sparks' }))?.n ?? 0;
    const give = Math.max(0, Math.min(want, SPARKS_PER_DAY - used));
    if (give) {
      await bumpCounter(me, 'arcade_sparks', give);
      reward = await grant(me, give, Math.min(30, give), `${ARCADE[run.game].name}: ${score.toLocaleString()} points`);
    }
  }
  const better = await db.arcadeRuns.distinct('userId', { game: run.game, status: 'done', score: { $gt: Math.max(score, prevBest) } });
  res.json({ score, best: Math.max(score, prevBest), newBest: score > prevBest, rank: better.length + 1, rejected: suspicious, reward });
});

/** Top scores: each member's best run. `period`: all | week | day. */
async function arcadeTop(game, period, viewerId, limit = 50) {
  const since = period === 'day' ? 1 : period === 'week' ? 7 : null;
  const match = { game, status: 'done', ...(since ? { finishedAt: { $gt: new Date(Date.now() - since * 86_400_000).toISOString() } } : {}) };
  const rows = await db.arcadeRuns
    .aggregate([{ $match: match }, { $sort: { score: -1 } }, { $group: { _id: '$userId', score: { $first: '$score' }, at: { $first: '$finishedAt' } } }, { $sort: { score: -1, at: 1 } }, { $limit: limit }])
    .toArray();
  const author = authorCache(viewerId);
  return Promise.all(rows.map(async (r, i) => ({ rank: i + 1, user: await author(String(r._id)), score: r.score, at: r.at })));
}

arcadeRouter.get('/arcade', optionalAuth, async (req, res) => {
  const games = await Promise.all(
    ARCADE_KEYS.map(async (k) => {
      const g = ARCADE[k];
      const mine = req.userId ? (await db.arcadeRuns.find({ userId: req.userId, game: k, status: 'done' }).sort({ score: -1 }).limit(1).toArray())[0] : null;
      return { key: k, name: g.name, emoji: g.emoji, desc: g.desc, myBest: mine?.score ?? null, top: await arcadeTop(k, 'all', req.userId, 3) };
    }),
  );
  res.json({ games, sparksPerDay: SPARKS_PER_DAY });
});

arcadeRouter.get('/arcade/:game/leaderboard', optionalAuth, async (req, res) => {
  const game = String(req.params.game);
  if (!ARCADE[game]) throw new HttpError(404, 'Unknown game');
  const period = ['day', 'week', 'all'].includes(String(req.query.period)) ? String(req.query.period) : 'all';
  res.json({ period, entries: await arcadeTop(game, period, req.userId) });
});

/** Arena leaderboards: most wins overall or in one game. */
arcadeRouter.get('/games/leaderboard', optionalAuth, async (req, res) => {
  const game = GAME_KEYS.includes(String(req.query.game)) ? String(req.query.game) : null;
  const field = game ? `gameStats.byGame.${game}.wins` : 'gameStats.wins';
  const rows = await db.users
    .find({ [field]: { $gt: 0 }, deletedAt: null }, { projection: { _id: 1, gameStats: 1 } })
    .sort({ [field]: -1 })
    .limit(50)
    .toArray();
  const author = authorCache(req.userId);
  res.json({
    game,
    entries: await Promise.all(
      rows.map(async (u, i) => {
        const st = game ? (u.gameStats?.byGame?.[game] ?? {}) : (u.gameStats ?? {});
        return { rank: i + 1, user: await author(u._id), wins: st.wins ?? 0, played: st.played ?? 0 };
      }),
    ),
  });
});
