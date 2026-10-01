import { Router } from 'express';
import { z } from 'zod';
import { db, now, newId, escapeRegex } from '../db.js';
import { optionalAuth, requireAuth, uid } from '../lib/auth.js';
import { HttpError, parse } from '../lib/http.js';
import { userPublic, serializePosts, invalidateStats, DEFAULT_SETTINGS } from '../lib/serialize.js';
import { notify } from '../lib/rewards.js';
import { presence } from '../lib/presence.js';

export const usersRouter = Router();

usersRouter.get('/users', optionalAuth, async (req, res) => {
  const p = parse(
    z.object({
      q: z.string().max(60).optional(),
      interest: z.string().max(30).optional(),
      online: z.coerce.number().optional(),
      sort: z.enum(['vibe', 'new', 'level', 'streak']).optional(),
      cursor: z.coerce.number().optional(),
    }),
    req.query,
  );
  const filter = { deletedAt: null };
  if (p.q) {
    const re = new RegExp(escapeRegex(p.q), 'i');
    filter.$or = [{ handle: re }, { displayName: re }, { city: re }];
  }
  if (p.interest) filter.interests = p.interest;
  if (req.userId) {
    const blocked = await db.blocks.distinct('blockedId', { blockerId: req.userId });
    filter._id = { $nin: [req.userId, ...blocked] };
  }
  const viewer = req.userId ? await db.users.findOne({ _id: req.userId }, { projection: { settings: 1 } }) : null;
  if (viewer && !{ ...DEFAULT_SETTINGS, ...viewer.settings }.showAIPersonas) filter.isAi = false;
  const sort = { vibe: { xp: -1 }, new: { createdAt: -1 }, level: { xp: -1 }, streak: { streakDays: -1 } }[p.sort ?? 'vibe'];
  const offset = p.cursor ?? 0;
  let rows = await db.users
    .find(filter)
    .sort({ ...sort, _id: 1 })
    .skip(offset)
    .limit(200)
    .toArray();
  if (p.online) {
    const flags = await Promise.all(rows.map((r) => presence.isOnline(r._id)));
    rows = rows.filter((_, i) => flags[i]);
  }
  const items = await Promise.all(rows.slice(0, 24).map((r) => userPublic(r, req.userId)));
  if (p.sort === 'vibe' || !p.sort) items.sort((a, b) => b.vibeAvg - a.vibeAvg || b.xp - a.xp);
  res.json({ items, nextCursor: rows.length > 24 && !p.online ? String(offset + 24) : null });
});

usersRouter.get('/users/:handle', optionalAuth, async (req, res) => {
  const u = await db.users.findOne({ handleLower: String(req.params.handle).toLowerCase(), deletedAt: null });
  if (!u) throw new HttpError(404, 'No one here by that name');
  const posts = await db.posts.find({ authorId: u._id, hidden: false }).sort({ createdAt: -1 }).limit(30).toArray();
  res.json({ user: await userPublic(u, req.userId), posts: await serializePosts(posts, req.userId) });
});

usersRouter.post('/users/:id/follow', requireAuth, async (req, res) => {
  const me = uid(req);
  const target = await db.users.findOne({ _id: String(req.params.id), deletedAt: null });
  if (!target || target._id === me) throw new HttpError(404, 'User not found');
  const existing = (await db.follows.deleteOne({ followerId: me, followeeId: target._id })).deletedCount > 0;
  if (!existing) {
    await db.follows.insertIfMissing({ followerId: me, followeeId: target._id }, { createdAt: now() });
    const meRow = await db.users.findOne({ _id: me }, { projection: { handle: 1 } });
    const mutual = await db.follows.findOne({ followerId: target._id, followeeId: me });
    await notify(target._id, {
      kind: 'follow',
      actorId: me,
      link: `/u/${meRow.handle}`,
      title: mutual ? `You and @${meRow.handle} are now friends 🤝` : `@${meRow.handle} started following you`,
      body: mutual ? 'Say hi in DMs!' : 'Follow back to become friends.',
    });
  }
  invalidateStats(me);
  invalidateStats(target._id);
  res.json({ following: !existing });
});

usersRouter.post('/users/:id/block', requireAuth, async (req, res) => {
  const me = uid(req);
  const other = String(req.params.id);
  if (other === me) throw new HttpError(400, "You can't block yourself");
  await db.blocks.insertIfMissing({ blockerId: me, blockedId: other }, { createdAt: now() });
  await db.follows.deleteMany({
    $or: [
      { followerId: me, followeeId: other },
      { followerId: other, followeeId: me },
    ],
  });
  invalidateStats(me);
  invalidateStats(other);
  res.json({ ok: true });
});

usersRouter.post('/reports', requireAuth, async (req, res) => {
  const b = parse(
    z.object({
      targetType: z.enum(['post', 'user', 'comment', 'message', 'thread', 'stream']),
      targetId: z.string().max(64),
      reason: z.string().min(1).max(500),
    }),
    req.body,
  );
  await db.reports.insertOne({
    _id: newId('rep'),
    reporterId: uid(req),
    targetType: b.targetType,
    targetId: b.targetId,
    reason: b.reason,
    createdAt: now(),
  });
  // Auto-hide posts that collect several distinct reports until a human reviews them.
  if (b.targetType === 'post') {
    const n = (await db.reports.distinct('reporterId', { targetType: 'post', targetId: b.targetId })).length;
    if (n >= 3) await db.posts.updateOne({ _id: b.targetId }, { $set: { hidden: true } });
  }
  res.json({ ok: true });
});
