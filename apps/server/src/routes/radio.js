import { Router } from 'express';
import { z } from 'zod';
import { can } from '@chatlol/shared';
import { db } from '../db.js';
import { optionalAuth, requireAuth, uid } from '../lib/auth.js';
import { HttpError, parse, rateLimit } from '../lib/http.js';
import { assertCanPost } from '../lib/enforcement.js';
import { track } from '../lib/activity.js';
import { advance, getStation, removeFromQueue, suggest, vote } from '../lib/radio.js';

/**
 * Radio stations: /radio/shouts (the shoutbox) and /radio/lounge/:id (lounges with the radio switched on).
 * Hosts (the lounge's owner, or staff with the Lounges permission) can skip songs and clear the queue.
 */
export const radioRouter = Router();

async function station(req) {
  if (req.params.kind === 'shouts') return { key: 'shouts', ownerId: null };
  if (req.params.kind !== 'lounge' || !req.params.id) throw new HttpError(404, 'No such station');
  const l = await db.lounges.findOne({ _id: String(req.params.id) }, { projection: { radio: 1, ownerId: 1 } });
  if (!l || !l.radio) throw new HttpError(404, 'This lounge has no radio');
  return { key: `lounge:${l._id}`, ownerId: l.ownerId ?? null };
}
async function isHost(req, st) {
  const me = req.userId;
  if (!me) return false;
  if (st.ownerId && st.ownerId === me) return true;
  return can(await db.users.findOne({ _id: me }, { projection: { role: 1, perms: 1 } }), 'lounges');
}
const paths = (p) => [`/radio/:kind${p}`, `/radio/:kind/:id${p}`];

radioRouter.get(paths(''), optionalAuth, async (req, res) => {
  const st = await station(req);
  res.json({ ...(await getStation(st.key, req.userId)), host: await isHost(req, st) });
});

radioRouter.post(paths('/suggest'), requireAuth, async (req, res) => {
  const me = uid(req);
  await rateLimit(`radio:suggest:${me}`, 6);
  await assertCanPost(me);
  const st = await station(req);
  const { youtubeId } = parse(z.object({ youtubeId: z.string().regex(/^[A-Za-z0-9_-]{11}$/) }), req.body);
  track(me, 'radio');
  res.json(await suggest(st.key, me, youtubeId));
});

radioRouter.post(paths('/vote'), requireAuth, async (req, res) => {
  const me = uid(req);
  await rateLimit(`radio:vote:${me}`, 30);
  const st = await station(req);
  const { itemId } = parse(z.object({ itemId: z.string().max(40) }), req.body);
  res.json(await vote(st.key, me, itemId));
});

radioRouter.delete(paths('/queue/:itemId'), requireAuth, async (req, res) => {
  const st = await station(req);
  res.json(await removeFromQueue(st.key, uid(req), String(req.params.itemId), await isHost(req, st)));
});

radioRouter.post(paths('/skip'), requireAuth, async (req, res) => {
  const st = await station(req);
  if (!(await isHost(req, st))) throw new HttpError(403, 'Only the host can skip songs');
  await advance(st.key, { force: true });
  res.json(await getStation(st.key, req.userId));
});

/**
 * A listener's player says the song finished. Only counts near the real end (so nobody can skip by faking it);
 * mostly needed for songs whose length the server doesn't know (no YouTube API key).
 */
radioRouter.post(paths('/ended'), optionalAuth, async (req, res) => {
  const st = await station(req);
  const { trackId } = parse(z.object({ trackId: z.string().max(20) }), req.body);
  const cur = await getStation(st.key, req.userId);
  const n = cur.now;
  if (n && n.track.id === trackId) {
    const played = (Date.now() - Date.parse(n.startedAt)) / 1000;
    if (played >= (n.track.duration ? n.track.duration - 5 : 30)) await advance(st.key, { ifTrackId: trackId, force: true });
  }
  res.json({ ok: true });
});
