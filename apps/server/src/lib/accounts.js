import { db, now } from '../db.js';
import { io, room } from './io.js';

/**
 * Closes an account for good: soft-deletes it, scrubs personal data, hides its posts and drops its follows, push
 * tokens and friendships. Used for "delete my account" and for staff terminations.
 */
export async function closeAccount(id, { terminated = false, reason = null } = {}) {
  await db.tx(async () => {
    await db.users.updateOne(
      { _id: id },
      {
        $set: {
          deletedAt: now(),
          email: null,
          passwordHash: null,
          handle: `deleted_${id}`,
          handleLower: `deleted_${id}`,
          displayName: 'Deleted user',
          bio: '',
          avatarUrl: '',
          boost: null,
          ...(terminated ? { moderation: { status: 'banned', until: null, reason } } : {}),
        },
      },
    );
    await db.pushTokens.deleteMany({ userId: id });
    await db.posts.updateMany({ authorId: id }, { $set: { hidden: true } });
    await db.follows.deleteMany({ $or: [{ followerId: id }, { followeeId: id }] });
    await db.friendships.deleteMany({ $or: [{ a: id }, { b: id }] });
    await db.friendRequests.deleteMany({ $or: [{ fromId: id }, { toId: id }] });
  });
  io()?.in(room.user(id)).disconnectSockets(true);
}
