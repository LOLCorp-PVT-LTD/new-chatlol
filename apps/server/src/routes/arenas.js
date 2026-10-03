import { Router } from 'express';
import { z } from 'zod';
import { GAMES, GAME_KEYS, ARENA_RAKE_PCT } from '@chatlol/shared';
import { db } from '../db.js';
import { optionalAuth, requireAuth, uid } from '../lib/auth.js';
import { HttpError, parse, rateLimit } from '../lib/http.js';
import { authorCache } from '../lib/serialize.js';
import { assertClean } from '../lib/moderation.js';
import { assertLevel } from '../lib/progression.js';
import {
  STAKE_LIMITS,
  arenaView,
  canSee,
  createArena,
  gemGoldWagers,
  inviteToArena,
  joinArena,
  leaveArena,
  playMove,
  startArena,
} from '../lib/arenas.js';
import { track } from '../lib/activity.js';

export const arenasRouter = Router();

const withPlayers = async (a, viewerId) => {
  const author = authorCache(viewerId);
  const v = arenaView(a, viewerId);
  return { ...v, players: await Promise.all(a.playerIds.map(author)), host: await author(a.hostId) };
};
async function load(req) {
  const a = await db.arenas.findOne({ _id: String(req.params.id) });
  if (!a) throw new HttpError(404, 'Arena not found');
  return a;
}

/** Game catalogue + wager rules, for the create form. */
arenasRouter.get('/games', async (_req, res) => {
  res.json({
    games: Object.values(GAMES).map(({ key, name, emoji, min, max, desc, turnSeconds }) => ({ key, name, emoji, min, max, desc, turnSeconds })),
    currencies: (await gemGoldWagers()) ? ['none', 'sparks', 'gems', 'gold'] : ['none', 'sparks'],
    stakeLimits: STAKE_LIMITS,
    rakePct: ARENA_RAKE_PCT,
  });
});

/** Lobby: open public arenas, plus the ones you're in or invited to. */
arenasRouter.get('/arenas', optionalAuth, async (req, res) => {
  const me = req.userId;
  const [open, mine] = await Promise.all([
    db.arenas.find({ status: { $in: ['lobby', 'playing'] }, visibility: 'public' }).sort({ createdAt: -1 }).limit(40).toArray(),
    me
      ? db.arenas
          .find({ status: { $in: ['lobby', 'playing'] }, $or: [{ playerIds: me }, { invitedIds: me }] })
          .sort({ createdAt: -1 })
          .limit(40)
          .toArray()
      : [],
  ]);
  const seen = new Set();
  const all = [...mine, ...open].filter((a) => !seen.has(a._id) && seen.add(a._id));
  res.json({ arenas: await Promise.all(all.map((a) => withPlayers(a, me))) });
});

arenasRouter.post('/arenas', requireAuth, async (req, res) => {
  const me = uid(req);
  await rateLimit(`arena:create:${me}`, 10);
  await assertLevel(me, 'arena');
  const b = parse(
    z.object({
      name: z.string().trim().min(2).max(40),
      game: z.enum(GAME_KEYS),
      visibility: z.enum(['public', 'private']).default('public'),
      stake: z
        .object({ currency: z.enum(['none', 'sparks', 'gems', 'gold']), amount: z.number().int().min(0).default(0) })
        .default({ currency: 'none', amount: 0 }),
    }),
    req.body,
  );
  assertClean(b.name);
  const a = await createArena(me, b);
  track(me, 'arena_create');
  res.status(201).json({ arena: await withPlayers(a, me) });
});

arenasRouter.get('/arenas/:id', optionalAuth, async (req, res) => {
  const a = await load(req);
  if (!canSee(a, req.userId, String(req.query.code ?? ''))) throw new HttpError(403, 'This arena is invite-only', 'arena_private');
  res.json({ arena: await withPlayers(a, req.userId) });
});

/** Join by id (public / invited) or by the 6-character code. */
arenasRouter.post('/arenas/:id/join', requireAuth, async (req, res) => {
  const me = uid(req);
  const { code } = parse(z.object({ code: z.string().max(12).optional() }), req.body ?? {});
  res.json({ arena: await withPlayers(await joinArena(await load(req), me, code), me) });
});
arenasRouter.post('/arenas/join-code', requireAuth, async (req, res) => {
  const me = uid(req);
  const { code } = parse(z.object({ code: z.string().trim().min(4).max(12) }), req.body);
  const a = await db.arenas.findOne({ code: code.toUpperCase() });
  if (!a) throw new HttpError(404, 'No arena with that code');
  res.json({ arena: await withPlayers(await joinArena(a, me, code), me) });
});

arenasRouter.post('/arenas/:id/leave', requireAuth, async (req, res) => {
  const me = uid(req);
  res.json({ arena: await withPlayers(await leaveArena(await load(req), me), me) });
});

arenasRouter.post('/arenas/:id/invite', requireAuth, async (req, res) => {
  const me = uid(req);
  await rateLimit(`arena:invite:${me}`, 30);
  const { userIds } = parse(z.object({ userIds: z.array(z.string()).min(1).max(20) }), req.body);
  res.json({ arena: await withPlayers(await inviteToArena(await load(req), me, userIds), me) });
});

arenasRouter.post('/arenas/:id/start', requireAuth, async (req, res) => {
  const me = uid(req);
  const started = await startArena(await load(req), me);
  for (const p of started.playerIds) track(p, 'arena_play');
  res.json({ arena: await withPlayers(started, me) });
});

arenasRouter.post('/arenas/:id/move', requireAuth, async (req, res) => {
  const me = uid(req);
  await rateLimit(`arena:move:${me}`, 120);
  const { action } = parse(z.object({ action: z.record(z.string(), z.any()) }), req.body);
  res.json({ arena: await withPlayers(await playMove(await load(req), me, action), me) });
});
