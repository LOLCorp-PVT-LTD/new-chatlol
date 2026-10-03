import { REACTION_KEYS } from '@chatlol/shared';
import { db, newId, now } from '../db.js';
import { HttpError } from './http.js';
import { io, room } from './io.js';

/**
 * Emoji reactions on comments, forum replies, wall notes and chat messages (posts and shouts have their own).
 * One reaction per person per item; counts live on the item (`reactions.<kind>`) so lists stay cheap.
 */
export const REACTABLE = { comment: 'comments', reply: 'replies', wall: 'wallNotes', message: 'messages' };

/** The viewer's reaction on one item (null when signed out or not reacted). */
export async function myReaction(type, targetId, viewerId) {
  if (!viewerId) return null;
  return (await db.contentReactions.findOne({ type, targetId, userId: viewerId }))?.kind ?? null;
}

/** Sets (or with `kind` null, removes) the user's reaction. Returns the item's new counts and the user's reaction. */
export async function react(type, targetId, userId, kind) {
  const col = REACTABLE[type];
  if (!col) throw new HttpError(404, 'Can’t react to that');
  if (kind !== null && !REACTION_KEYS.includes(kind)) throw new HttpError(400, 'Unknown reaction');
  const item = await db[col].findOne({ _id: targetId }, { projection: { _id: 1, roomId: 1 } });
  if (!item) throw new HttpError(404, 'Not found');
  if (type === 'message' && !(await canSeeRoom(item.roomId, userId))) throw new HttpError(404, 'Not found');
  const prev = await db.contentReactions.findOne({ type, targetId, userId });
  if (prev?.kind === kind) return counts(col, targetId, kind);
  if (kind) {
    await db.contentReactions.updateOne(
      { type, targetId, userId },
      { $set: { kind, at: now() }, $setOnInsert: { _id: newId() } },
      { upsert: true },
    );
  } else await db.contentReactions.deleteOne({ type, targetId, userId });
  const inc = {};
  if (prev?.kind) inc[`reactions.${prev.kind}`] = -1;
  if (kind) inc[`reactions.${kind}`] = (inc[`reactions.${kind}`] ?? 0) + 1;
  await db[col].updateOne({ _id: targetId }, { $inc: inc });
  const out = await counts(col, targetId, kind);
  // Live counts for chat rooms: everyone in the lounge / conversation sees the reaction land.
  if (type === 'message') {
    const ev = { id: targetId, roomId: item.roomId, reactions: out.reactions };
    const conv = await db.conversations.findOne({ _id: item.roomId }, { projection: { members: 1 } });
    if (conv) for (const m of conv.members) io()?.to(room.user(m.userId)).emit('message:reactions', ev);
    else io()?.to(room.lounge(item.roomId)).to(room.stream(item.roomId)).emit('message:reactions', ev);
  }
  return out;
}

async function counts(col, targetId, mine) {
  const doc = await db[col].findOne({ _id: targetId }, { projection: { reactions: 1 } });
  return { reactions: cleanCounts(doc?.reactions), myReaction: mine };
}
export const cleanCounts = (r) => Object.fromEntries(Object.entries(r ?? {}).filter(([, n]) => n > 0));

/** Lounge messages are public; DMs only for members. */
async function canSeeRoom(roomId, userId) {
  if (await db.lounges.findOne({ _id: roomId }, { projection: { _id: 1 } })) return true;
  if (await db.streams.findOne({ _id: roomId }, { projection: { _id: 1 } })) return true;
  return !!(await db.conversations.findOne({ _id: roomId, 'members.userId': userId }, { projection: { _id: 1 } }));
}
