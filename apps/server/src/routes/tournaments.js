import { Router } from 'express';
import { z } from 'zod';
import { ARCADE_KEYS, GAME_KEYS } from '@chatlol/shared';
import { db, newId, now } from '../db.js';
import { optionalAuth, requireAuth, requirePerm, uid } from '../lib/auth.js';
import { HttpError, parse } from '../lib/http.js';
import { authorCache } from '../lib/serialize.js';
import { cancelTournament, finishTournament, joinTournament, prizeText, standings, status } from '../lib/tournaments.js';
import { track } from '../lib/activity.js';

export const tournamentsRouter = Router();

async function view(t, viewerId, withBoard = false) {
  const author = authorCache(viewerId);
  const entrants = await db.tournamentEntries.countDocuments({ tournamentId: t._id });
  const mine = viewerId ? await db.tournamentEntries.findOne({ tournamentId: t._id, userId: viewerId }) : null;
  return {
    id: t._id,
    title: t.title,
    description: t.description,
    bannerUrl: t.bannerUrl,
    kind: t.kind,
    game: t.game,
    minLevel: t.minLevel,
    entryGold: t.entryGold,
    maxEntrants: t.maxEntrants ?? null,
    prizes: t.prizes.map((p, i) => ({ place: i + 1, ...p, text: prizeText(p) })),
    startsAt: t.startsAt,
    endsAt: t.endsAt,
    featured: !!t.featured,
    status: status(t),
    entrants,
    joined: !!mine,
    myScore: mine?.score ?? null,
    board: withBoard
      ? await Promise.all((await standings(t._id, 50)).map(async (e, i) => ({ rank: i + 1, user: await author(e.userId), score: e.score })))
      : undefined,
    results: t.results ? await Promise.all(t.results.map(async (r) => ({ ...r, user: await author(r.userId), cashStatus: undefined }))) : null,
  };
}

/** Live, upcoming and recently ended tournaments; `featured` ones also act as banners on the home page. */
tournamentsRouter.get('/tournaments', optionalAuth, async (req, res) => {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const rows = await db.tournaments.find({ cancelled: { $ne: true }, endsAt: { $gt: since } }).sort({ startsAt: 1 }).limit(50).toArray();
  res.json({ tournaments: await Promise.all(rows.map((t) => view(t, req.userId))) });
});

tournamentsRouter.get('/tournaments/:id', optionalAuth, async (req, res) => {
  const t = await db.tournaments.findOne({ _id: String(req.params.id) });
  if (!t || t.cancelled) throw new HttpError(404, 'Tournament not found');
  res.json({ tournament: await view(t, req.userId, true) });
});

tournamentsRouter.post('/tournaments/:id/join', requireAuth, async (req, res) => {
  const me = uid(req);
  const t = await db.tournaments.findOne({ _id: String(req.params.id) });
  if (!t || t.cancelled) throw new HttpError(404, 'Tournament not found');
  await joinTournament(t, me);
  track(me, 'tournament');
  res.json({ tournament: await view(await db.tournaments.findOne({ _id: t._id }), me, true) });
});

// ——— Admin ———
const prize = z.object({
  gold: z.number().int().min(0).max(100_000).optional(),
  gems: z.number().int().min(0).max(1_000_000).optional(),
  sparks: z.number().int().min(0).max(10_000_000).optional(),
  premiumDays: z.number().int().min(0).max(365).optional(),
  item: z.string().max(60).optional(),
  cash: z.string().trim().max(60).optional(),
});
const body = z.object({
  title: z.string().trim().min(3).max(80),
  description: z.string().trim().max(1000).default(''),
  bannerUrl: z.string().url().max(600).nullable().default(null),
  kind: z.enum(['arcade', 'arena']),
  game: z.string(),
  minLevel: z.number().int().min(1).max(100).default(15),
  entryGold: z.number().int().min(0).max(100_000).default(0),
  maxEntrants: z.number().int().min(2).max(100_000).nullable().default(null),
  prizes: z.array(prize).min(1).max(20),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  featured: z.boolean().default(true),
});
function validate(b) {
  if (b.kind === 'arcade' ? !ARCADE_KEYS.includes(b.game) : !GAME_KEYS.includes(b.game)) throw new HttpError(400, 'Pick a game');
  if (b.endsAt <= b.startsAt) throw new HttpError(400, 'It has to end after it starts');
  // Paid-in contests can't pay out real money (that would make it gambling); cash prizes need free entry.
  if (b.entryGold > 0 && b.prizes.some((p) => p.cash)) throw new HttpError(400, 'Cash prizes are only allowed when entry is free', 'cash_needs_free_entry');
}

tournamentsRouter.get('/admin/tournaments', requireAuth, requirePerm('tournaments'), async (req, res) => {
  const rows = await db.tournaments.find({}).sort({ startsAt: -1 }).limit(100).toArray();
  res.json({ tournaments: await Promise.all(rows.map(async (t) => ({ ...(await view(t, uid(req))), cancelled: !!t.cancelled, cashToPay: (t.results ?? []).filter((r) => r.cashStatus === 'to_pay') }))) });
});
tournamentsRouter.post('/admin/tournaments', requireAuth, requirePerm('tournaments'), async (req, res) => {
  const b = parse(body, req.body);
  validate(b);
  const t = { _id: newId(), ...b, createdByUserId: uid(req), createdAt: now(), finishedAt: null, cancelled: false };
  await db.tournaments.insertOne(t);
  await db.modEvents.insertOne({ _id: newId(), userId: uid(req), kind: 'tournament', reason: `Created tournament “${b.title}”`, byUserId: uid(req), createdAt: now() });
  res.status(201).json({ tournament: await view(t, uid(req)) });
});
tournamentsRouter.patch('/admin/tournaments/:id', requireAuth, requirePerm('tournaments'), async (req, res) => {
  const t = await db.tournaments.findOne({ _id: String(req.params.id) });
  if (!t) throw new HttpError(404, 'Tournament not found');
  const b = parse(body.partial(), req.body);
  const next = { ...t, ...b };
  validate(next);
  if (status(t) !== 'upcoming' && (b.kind || b.game || b.entryGold !== undefined)) throw new HttpError(409, 'Game and entry can’t change once it has started');
  await db.tournaments.updateOne({ _id: t._id }, { $set: b });
  res.json({ tournament: await view(await db.tournaments.findOne({ _id: t._id }), uid(req)) });
});
tournamentsRouter.post('/admin/tournaments/:id/cancel', requireAuth, requirePerm('tournaments'), async (req, res) => {
  const t = await db.tournaments.findOne({ _id: String(req.params.id) });
  if (!t || t.finishedAt) throw new HttpError(409, 'Already finished');
  await cancelTournament(t);
  res.json({ ok: true });
});
tournamentsRouter.post('/admin/tournaments/:id/finish', requireAuth, requirePerm('tournaments'), async (req, res) => {
  const t = await db.tournaments.findOne({ _id: String(req.params.id) });
  if (!t) throw new HttpError(404, 'Tournament not found');
  await finishTournament(t);
  res.json({ ok: true });
});
/** Mark a cash prize as paid (after paying it outside the app). */
tournamentsRouter.post('/admin/tournaments/:id/cash/:place/paid', requireAuth, requirePerm('tournaments'), async (req, res) => {
  const place = Number(req.params.place);
  await db.tournaments.updateOne({ _id: String(req.params.id), 'results.place': place }, { $set: { 'results.$.cashStatus': 'paid', 'results.$.paidByUserId': uid(req), 'results.$.paidAt': now() } });
  res.json({ ok: true });
});
