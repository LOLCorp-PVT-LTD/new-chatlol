import { Router } from 'express';
import { z } from 'zod';
import { db, now, newId, escapeRegex } from '../db.js';
import { optionalAuth, requireAuth, uid } from '../lib/auth.js';
import { HttpError, parse, rateLimit } from '../lib/http.js';
import { reviewReport } from '../lib/aiModeration.js';
import { userPublic, serializePosts, invalidateStats, withLayout, DEFAULT_SETTINGS } from '../lib/serialize.js';
import { notify } from '../lib/rewards.js';
import { presence } from '../lib/presence.js';
import { profileRatingSummary, recordProfileView } from './profile.js';

export const usersRouter = Router();

usersRouter.get('/users', optionalAuth, async (req, res) => {
  const p = parse(
    z.object({
      q: z.string().max(60).optional(),
      interest: z.string().max(30).optional(),
      online: z.coerce.number().optional(),
      sort: z.enum(['vibe', 'new', 'level', 'streak']).optional(),
      cursor: z.coerce.number().optional(),
      gender: z.enum(['male', 'female']).optional(),
    }),
    req.query,
  );
  const filter = { deletedAt: null, 'moderation.status': { $ne: 'banned' } };
  if (p.gender) {
    filter.gender = p.gender;
    filter['settings.showGender'] = { $ne: false };
  }
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
  let items = await Promise.all(rows.slice(0, 24).map((r) => userPublic(r, req.userId)));
  if (p.sort === 'vibe' || !p.sort) items.sort((a, b) => b.vibeAvg - a.vibeAvg || b.xp - a.xp);
  // Boosted members (staff-granted) lead the first page of any search they match.
  if (!offset) {
    const boosted = await db.users
      .find({ ...filter, 'boost.until': { $gt: now() } })
      .sort({ 'boost.until': -1 })
      .limit(6)
      .toArray();
    const top = await Promise.all(boosted.map((r) => userPublic(r, req.userId)));
    const ids = new Set(top.map((u) => u.id));
    items = [...top, ...items.filter((u) => !ids.has(u.id))].slice(0, 24);
  }
  res.json({ items, nextCursor: rows.length > 24 && !p.online ? String(offset + 24) : null });
});

usersRouter.get('/users/:handle', optionalAuth, async (req, res) => {
  const u = await db.users.findOne({ handleLower: String(req.params.handle).toLowerCase(), deletedAt: null });
  if (!u) throw new HttpError(404, 'No one here by that name');
  if ({ ...DEFAULT_SETTINGS, ...u.settings }.profileVisibility === 'members' && !req.userId)
    throw new HttpError(401, `Sign in to see @${u.handle}'s profile`, 'members_only');
  if (req.userId && (await db.blocks.findOne({ blockerId: u._id, blockedId: req.userId })))
    throw new HttpError(404, 'No one here by that name');
  const [posts, ratings, wallCount, photoCount] = await Promise.all([
    db.posts
      .find({ authorId: u._id, hidden: false, inFeed: { $ne: false } })
      .sort({ createdAt: -1 })
      .limit(30)
      .toArray(),
    profileRatingSummary(u._id, req.userId),
    db.wallNotes.countDocuments({ profileId: u._id, hidden: { $ne: true } }),
    db.posts.countDocuments({ authorId: u._id, hidden: false, mediaUrl: { $ne: null } }),
  ]);
  void recordProfileView(u._id, req.userId).catch(() => {});
  res.json({
    user: withLayout(await userPublic(u, req.userId), u),
    posts: await serializePosts(posts, req.userId),
    profileRatings: ratings,
    wallCount,
    photoCount,
  });
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
      title: mutual ? `@${meRow.handle} followed you back` : `@${meRow.handle} started following you`,
      body: mutual ? 'You follow each other now.' : 'Follow back, or send a friend request.',
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
      targetType: z.enum(['post', 'user', 'comment', 'message', 'thread', 'reply', 'stream', 'shout', 'wall']),
      targetId: z.string().max(64),
      reason: z.string().min(1).max(500),
    }),
    req.body,
  );
  await rateLimit(`report:${uid(req)}`, 20);
  // Whose content it is, so admins see every report against a person in one place.
  const COL = { post: 'posts', comment: 'comments', message: 'messages', thread: 'threads', reply: 'replies', stream: 'streams', shout: 'shouts', wall: 'wallNotes' };
  const owner =
    b.targetType === 'user'
      ? b.targetId
      : ((await db[COL[b.targetType]].findOne({ _id: b.targetId }, { projection: { authorId: 1, hostId: 1 } }).catch(() => null)) ?? {});
  const report = {
    targetUserId: typeof owner === 'string' ? owner : (owner.authorId ?? owner.hostId ?? null),
    _id: newId(),
    reporterId: uid(req),
    targetType: b.targetType,
    targetId: b.targetId,
    reason: b.reason,
    status: 'reviewing',
    createdAt: now(),
  };
  await db.reports.insertOne(report);
  // SafeShield reviews it right away; anything it can't settle lands in the admin queue.
  void reviewReport(report);
  // Auto-hide posts that collect several distinct reports until a human reviews them.
  if (b.targetType === 'post') {
    const n = (await db.reports.distinct('reporterId', { targetType: 'post', targetId: b.targetId })).length;
    if (n >= 3) await db.posts.updateOne({ _id: b.targetId }, { $set: { hidden: true } });
  }
  res.json({ ok: true });
});
