import { Router } from 'express';
import { db } from '../db.js';
import { optionalAuth, requireAuth, uid } from '../lib/auth.js';
import { HttpError, rateLimit } from '../lib/http.js';
import { authorCache } from '../lib/serialize.js';
import { acceptFriendRequest, cancelFriendRequest, declineFriendRequest, friendsFilter, otherOf, sendFriendRequest, unfriend } from '../lib/friends.js';

export const friendsRouter = Router();
const target = (req) => String(req.params.id);

/** Your incoming and sent friend requests. */
friendsRouter.get('/friend-requests', requireAuth, async (req, res) => {
  const me = uid(req);
  const author = authorCache(me);
  const [incoming, outgoing] = await Promise.all([
    db.friendRequests.find({ toId: me, status: 'pending' }).sort({ createdAt: -1 }).limit(200).toArray(),
    db.friendRequests.find({ fromId: me, status: 'pending' }).sort({ createdAt: -1 }).limit(200).toArray(),
  ]);
  const people = async (rows, key) => (await Promise.all(rows.map(async (r) => ({ user: await author(r[key]), at: r.createdAt })))).filter((x) => x.user.handle !== 'deleted');
  res.json({ incoming: await people(incoming, 'fromId'), outgoing: await people(outgoing, 'toId') });
});

/** Someone's friends (yours by default), newest first. */
friendsRouter.get('/friends', optionalAuth, async (req, res) => {
  const userId = typeof req.query.user === 'string' && req.query.user ? req.query.user : req.userId;
  if (!userId) throw new HttpError(401, 'Sign in to see your friends');
  const before = typeof req.query.before === 'string' ? req.query.before : '9999';
  const rows = await db.friendships.find({ ...friendsFilter(userId), since: { $lt: before } }).sort({ since: -1 }).limit(61).toArray();
  const author = authorCache(req.userId);
  const items = (await Promise.all(rows.slice(0, 60).map(async (f) => ({ user: await author(otherOf(f, userId)), since: f.since })))).filter((x) => x.user.handle !== 'deleted');
  res.json({ items, nextCursor: rows.length > 60 ? rows[59].since : null });
});

friendsRouter.post('/users/:id/friend-request', requireAuth, async (req, res) => {
  const me = uid(req);
  await rateLimit(`friendreq:${me}`, 40);
  res.json({ friendship: await sendFriendRequest(me, target(req)) });
});
friendsRouter.delete('/users/:id/friend-request', requireAuth, async (req, res) => {
  res.json({ friendship: await cancelFriendRequest(uid(req), target(req)) });
});
friendsRouter.post('/users/:id/friend-request/accept', requireAuth, async (req, res) => {
  res.json({ friendship: await acceptFriendRequest(uid(req), target(req)) });
});
friendsRouter.post('/users/:id/friend-request/decline', requireAuth, async (req, res) => {
  res.json({ friendship: await declineFriendRequest(uid(req), target(req)) });
});
friendsRouter.delete('/users/:id/friend', requireAuth, async (req, res) => {
  res.json({ friendship: await unfriend(uid(req), target(req)) });
});
