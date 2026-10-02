import { db, now } from '../db.js';
import { HttpError } from './http.js';
import { DEFAULT_SETTINGS, invalidateStats } from './serialize.js';
import { notify } from './rewards.js';
import { bus } from './events.js';

/**
 * Friends: a request (friendRequests: { fromId, toId, status: pending | accepted | declined }) that, once accepted,
 * becomes a friendship (friendships: { a, b } with a < b, so each pair is stored once). Accepting also makes both
 * people follow each other. Following is separate: you can follow someone without being friends.
 */
export const pairOf = (x, y) => (x < y ? { a: x, b: y } : { a: y, b: x });
export const friendsFilter = (userId) => ({ $or: [{ a: userId }, { b: userId }] });
export const otherOf = (f, userId) => (f.a === userId ? f.b : f.a);

export async function areFriends(x, y) {
  return !!(await db.friendships.findOne(pairOf(x, y)));
}

/** How `viewerId` stands with `userId`: friends, request sent (outgoing), request received (incoming) or none. */
export async function friendshipStatus(viewerId, userId) {
  if (!viewerId || viewerId === userId) return null;
  if (await areFriends(viewerId, userId)) return 'friends';
  const [out, inc] = await Promise.all([
    db.friendRequests.findOne({ fromId: viewerId, toId: userId, status: 'pending' }, { projection: { _id: 1 } }),
    db.friendRequests.findOne({ fromId: userId, toId: viewerId, status: 'pending' }, { projection: { _id: 1 } }),
  ]);
  return out ? 'outgoing' : inc ? 'incoming' : 'none';
}

async function blockedBetween(x, y) {
  return !!(await db.blocks.findOne({
    $or: [
      { blockerId: x, blockedId: y },
      { blockerId: y, blockedId: x },
    ],
  }));
}

async function becomeFriends(x, y) {
  await db.friendships.insertIfMissing(pairOf(x, y), { since: now() });
  // Friends follow each other.
  await Promise.all([
    db.follows.insertIfMissing({ followerId: x, followeeId: y }, { createdAt: now() }),
    db.follows.insertIfMissing({ followerId: y, followeeId: x }, { createdAt: now() }),
  ]);
  invalidateStats(x);
  invalidateStats(y);
}

/** Sends a friend request. If they had already asked you, you simply become friends. Returns the new status. */
export async function sendFriendRequest(me, targetId) {
  if (me === targetId) throw new HttpError(400, 'That’s you 🙂');
  const target = await db.users.findOne({ _id: targetId, deletedAt: null }, { projection: { handle: 1, settings: 1 } });
  if (!target || (await blockedBetween(me, targetId))) throw new HttpError(404, 'User not found');
  if (await areFriends(me, targetId)) return 'friends';
  const theirs = await db.friendRequests.findOne({ fromId: targetId, toId: me, status: 'pending' });
  if (theirs) {
    await acceptFriendRequest(me, targetId);
    return 'friends';
  }
  const from = { ...DEFAULT_SETTINGS, ...target.settings }.friendRequestsFrom;
  if (from === 'nobody') throw new HttpError(403, `@${target.handle} isn’t taking friend requests`, 'requests_closed');
  if (from === 'friends_of_friends') {
    const mine = (await db.friendships.find(friendsFilter(me)).toArray()).map((f) => otherOf(f, me));
    const shared = mine.length ? await db.friendships.findOne({ $or: [{ a: targetId, b: { $in: mine } }, { b: targetId, a: { $in: mine } }] }) : null;
    if (!shared) throw new HttpError(403, `@${target.handle} only takes requests from friends of friends`, 'requests_fof');
  }
  const r = await db.friendRequests.updateOne(
    { fromId: me, toId: targetId },
    { $set: { status: 'pending', createdAt: now(), respondedAt: null } },
    { upsert: true },
  );
  if (r.upsertedCount || r.modifiedCount) {
    const meRow = await db.users.findOne({ _id: me }, { projection: { handle: 1, displayName: 1 } });
    await notify(targetId, {
      kind: 'friend_request',
      actorId: me,
      link: '/friends',
      title: `${meRow.displayName} sent you a friend request 🤝`,
      body: 'Accept it to become friends.',
    });
    bus.emitEvent('friend:requested', { fromId: me, toId: targetId });
  }
  return 'outgoing';
}

/** Accepts the request `fromId` sent to `me`. */
export async function acceptFriendRequest(me, fromId) {
  const req = await db.friendRequests.findOneAndUpdate(
    { fromId, toId: me, status: 'pending' },
    { $set: { status: 'accepted', respondedAt: now() } },
  );
  if (!req) throw new HttpError(404, 'That friend request is gone');
  await becomeFriends(me, fromId);
  // A request the other way (if any) is settled too.
  await db.friendRequests.updateOne({ fromId: me, toId: fromId, status: 'pending' }, { $set: { status: 'accepted', respondedAt: now() } });
  const meRow = await db.users.findOne({ _id: me }, { projection: { handle: 1, displayName: 1 } });
  await notify(fromId, {
    kind: 'friend_accepted',
    actorId: me,
    link: `/u/${meRow.handle}`,
    title: `You and ${meRow.displayName} are now friends 🤝`,
    body: 'Say hi in DMs!',
  });
  return 'friends';
}

/** Declines quietly (the sender isn't told). */
export async function declineFriendRequest(me, fromId) {
  const r = await db.friendRequests.updateOne({ fromId, toId: me, status: 'pending' }, { $set: { status: 'declined', respondedAt: now() } });
  if (!r.matchedCount) throw new HttpError(404, 'That friend request is gone');
  return 'none';
}

export async function cancelFriendRequest(me, toId) {
  await db.friendRequests.deleteOne({ fromId: me, toId, status: 'pending' });
  return 'none';
}

export async function unfriend(me, otherId) {
  await db.friendships.deleteOne(pairOf(me, otherId));
  invalidateStats(me);
  invalidateStats(otherId);
  return 'none';
}

/** One-time: people who already followed each other become friends (friends used to mean mutual follows). */
export async function backfillFriendships() {
  if ((await db.friendships.countDocuments({})) > 0) return 0;
  const pairs = await db.follows.raw
    .aggregate([
      { $lookup: { from: 'follows', let: { a: '$followerId', b: '$followeeId' }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$followerId', '$$b'] }, { $eq: ['$followeeId', '$$a'] }] } } }], as: 'back' } },
      { $match: { 'back.0': { $exists: true }, $expr: { $lt: ['$followerId', '$followeeId'] } } },
      { $project: { _id: 0, a: '$followerId', b: '$followeeId' } },
    ])
    .toArray();
  if (pairs.length) await db.friendships.raw.insertMany(pairs.map((p) => ({ ...p, since: now() })), { ordered: false }).catch(() => {});
  return pairs.length;
}
