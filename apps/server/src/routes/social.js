import { Router } from 'express';
import { z } from 'zod';
import { DM_SPARK_COST, LOUNGE_LIMIT, REWARDS, can, hasPower } from '@chatlol/shared';
import { db, newId, now, isDuplicateKey, isObjectIdHex } from '../db.js';
import { assertEmojiOwned, resolveSticker, stickerInput, stickerPreview } from '../lib/stickers.js';
import { optionalAuth, requireAuth, uid } from '../lib/auth.js';
import { HttpError, parse, rateLimit } from '../lib/http.js';
import { postLimit } from '../lib/limits.js';
import {
  serializeThread,
  serializeReply,
  serializeMessage,
  serializeNotification,
  authorCache,
  userPublic,
  DEFAULT_SETTINGS,
  isPremium,
} from '../lib/serialize.js';
import { grant, notify, emitWallet } from '../lib/rewards.js';
import { assertLevel } from '../lib/progression.js';
import { areFriends } from '../lib/friends.js';
import { assertClean } from '../lib/moderation.js';
import { assertCanPost } from '../lib/enforcement.js';
import { screen } from '../lib/aiModeration.js';
import { bus } from '../lib/events.js';
import { io, room } from '../lib/io.js';
import { presence } from '../lib/presence.js';
import { shared } from '../lib/shared.js';
import { track } from '../lib/activity.js';

export const socialRouter = Router();

/** Lounges and boards can be addressed by id or by their readable slug (old links, persona configs). */
const byIdOrSlug = (v) => (isObjectIdHex(String(v)) ? { _id: String(v) } : { slug: String(v) });

// ——— Forums ———
socialRouter.get('/forums/boards', async (_req, res) => {
  const [boards, counts] = await Promise.all([
    db.boards.find({}).sort({ position: 1 }).toArray(),
    db.threads.aggregate([{ $match: { hidden: { $ne: true } } }, { $group: { _id: '$boardId', n: { $sum: 1 } } }]).toArray(),
  ]);
  const n = new Map(counts.map((c) => [c._id, c.n]));
  res.json({ boards: boards.map((b) => ({ id: b._id, slug: b.slug, name: b.name, emoji: b.emoji, threads: n.get(b._id) ?? 0 })) });
});

socialRouter.get('/forums', optionalAuth, async (req, res) => {
  const p = parse(
    z.object({ board: z.string().optional(), sort: z.enum(['hot', 'new', 'top']).default('hot'), cursor: z.coerce.number().optional() }),
    req.query,
  );
  const offset = p.cursor ?? 0;
  const board = p.board ? await db.boards.findOne(byIdOrSlug(p.board), { projection: { _id: 1 } }) : null;
  const filter = { hidden: { $ne: true }, ...(p.board ? { boardId: board?._id ?? null } : {}) };
  let rows;
  if (p.sort === 'hot') {
    // Hot = (votes + 2×replies) decayed by hours since last activity; scored in JS over recent candidates.
    const cand = await db.threads.find(filter).sort({ lastActivityAt: -1 }).limit(300).toArray();
    const t = Date.now();
    const hot = (r) => (r.pinned ? 1e9 : 0) + (r.upvotes + r.replyCount * 2 + 1) / ((t - Date.parse(r.lastActivityAt)) / 3_600_000 + 2);
    rows = cand.sort((a, b) => hot(b) - hot(a)).slice(offset, offset + 21);
  } else {
    rows = await db.threads
      .find(filter)
      .sort(p.sort === 'new' ? { pinned: -1, createdAt: -1 } : { upvotes: -1, _id: 1 })
      .skip(offset)
      .limit(21)
      .toArray();
  }
  const author = authorCache(req.userId);
  res.json({
    items: await Promise.all(rows.slice(0, 20).map((r) => serializeThread(r, req.userId, author))),
    nextCursor: rows.length > 20 ? String(offset + 20) : null,
  });
});

socialRouter.get('/forums/:id', optionalAuth, async (req, res) => {
  const t = await db.threads.findOne({ _id: String(req.params.id), hidden: { $ne: true } });
  if (!t) throw new HttpError(404, 'Thread not found');
  const author = authorCache(req.userId);
  const replies = await db.replies
    .find({ threadId: t._id, hidden: { $ne: true } })
    .sort({ createdAt: 1 })
    .limit(300)
    .toArray();
  res.json({
    thread: await serializeThread(t, req.userId, author),
    replies: await Promise.all(replies.map((r) => serializeReply(r, author))),
  });
});

export async function insertThread(authorId, boardIdOrSlug, title, body) {
  const b = await db.boards.findOne(byIdOrSlug(boardIdOrSlug), { projection: { _id: 1 } });
  if (!b) throw new HttpError(404, 'Board not found');
  const board = b._id;
  const t = now();
  const thread = {
    _id: newId(),
    boardId: board,
    authorId,
    title,
    body,
    upvotes: 0,
    replyCount: 0,
    pinned: false,
    lastActivityAt: t,
    createdAt: t,
  };
  await db.threads.insertOne(thread);
  bus.emitEvent('thread:created', { threadId: thread._id, authorId });
  return thread;
}

export async function insertReply(threadId, authorId, body) {
  const t = await db.threads.findOne({ _id: threadId });
  if (!t) throw new HttpError(404, 'Thread not found');
  const reply = { _id: newId(), threadId, authorId, body, upvotes: 0, createdAt: now() };
  await db.replies.insertOne(reply);
  await db.threads.updateOne({ _id: threadId }, { $inc: { replyCount: 1 }, $set: { lastActivityAt: now() } });
  if (t.authorId !== authorId) {
    const a = await db.users.findOne({ _id: authorId }, { projection: { displayName: 1 } });
    await notify(t.authorId, {
      kind: 'comment',
      actorId: authorId,
      link: `/forums/${threadId}`,
      title: `${a.displayName} replied to your thread`,
      body: body.slice(0, 120),
    });
  }
  bus.emitEvent('thread:replied', { threadId, replyId: reply._id, authorId });
  return reply;
}

socialRouter.post('/forums', requireAuth, async (req, res) => {
  const me = uid(req);
  await postLimit(me, 'thread', 3);
  const b = parse(
    z.object({ board: z.string(), title: z.string().trim().min(4).max(120), body: z.string().trim().min(1).max(4000) }),
    req.body,
  );
  await assertCanPost(me);
  await assertLevel(me, 'forum');
  assertClean(`${b.title} ${b.body}`);
  await assertEmojiOwned(me, b.title, b.body);
  const row = await insertThread(me, b.board, b.title, b.body);
  screen({ userId: me, text: `${b.title}\n${b.body}`, ref: { type: 'thread', id: row._id } });
  const reward = await grant(me, REWARDS.post.sparks, REWARDS.post.xp, 'Started a forum thread 📣');
  track(me, 'forum');
  res.status(201).json({ thread: await serializeThread(row, me), reward });
});

socialRouter.post('/forums/:id/replies', requireAuth, async (req, res) => {
  const me = uid(req);
  await postLimit(me, 'reply', 20);
  const { body } = parse(z.object({ body: z.string().trim().min(1).max(2000) }), req.body);
  await assertCanPost(me);
  await assertLevel(me, 'forum');
  assertClean(body);
  await assertEmojiOwned(me, body);
  const row = await insertReply(String(req.params.id), me, body);
  screen({ userId: me, text: body, ref: { type: 'reply', id: row._id } });
  await grant(me, REWARDS.comment.sparks, REWARDS.comment.xp, 'Replied in the forums');
  track(me, 'forum');
  res.status(201).json({ reply: await serializeReply(row) });
});

socialRouter.post('/forums/:id/vote', requireAuth, async (req, res) => {
  const me = uid(req);
  const threadId = String(req.params.id);
  const { v } = parse(z.object({ v: z.union([z.literal(1), z.literal(-1), z.literal(0)]) }), req.body);
  if (!(await db.threads.findOne({ _id: threadId }))) throw new HttpError(404, 'Thread not found');
  await db.tx(async () => {
    const prev =
      v === 0
        ? await db.threadVotes.findOneAndDelete({ threadId, userId: me })
        : await db.threadVotes.findOneAndUpdate({ threadId, userId: me }, { $set: { v } }, { upsert: true, returnDocument: 'before' });
    const delta = v - (prev?.v ?? 0);
    if (delta) await db.threads.updateOne({ _id: threadId }, { $inc: { upvotes: delta } });
  });
  res.json({ thread: await serializeThread(await db.threads.findOne({ _id: threadId }), me) });
});

// ——— Lounges ———
export const loungeKey = (id) => `lounge:online:${id}`;

const recentMessages = (roomType, roomId, limit, extra = {}) =>
  db.messages
    .find({ roomType, roomId, ...extra })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

/** `viewer`: the signed-in user's record (for canManage), if any. */
export async function serializeLounge(l, author, viewer = null) {
  const ids = await shared().smembers(loungeKey(l._id));
  const recent = (
    await db.messages
      .aggregate([
        { $match: { roomType: 'lounge', roomId: l._id } },
        { $sort: { createdAt: -1 } },
        { $limit: 200 },
        { $group: { _id: '$authorId', last: { $max: '$createdAt' } } },
        { $sort: { last: -1 } },
        { $limit: 12 },
      ])
      .toArray()
  ).map((r) => r._id);
  const recentOnline = (await Promise.all(recent.map(async (id) => ((await presence.isOnline(id)) ? id : null)))).filter(Boolean);
  const previewIds = [...new Set([...ids, ...recent])].slice(0, 5);
  const active = new Set([...ids, ...recentOnline]);
  return {
    id: l._id,
    slug: l.slug,
    name: l.name,
    emoji: l.emoji,
    topic: l.topic,
    nowPlaying: l.nowPlaying,
    coverUrl: l.coverUrl,
    onlineCount: active.size,
    memberPreview: await Promise.all(previewIds.map(author)),
    isLive: active.size > 0,
    owner: l.ownerId ? await author(l.ownerId) : null,
    festival: l.festival ?? null,
    radio: !!l.radio,
    expiresAt: l.expiresAt ?? null,
    canManage: !!viewer && (l.ownerId === viewer._id || can(viewer, 'lounges')),
  };
}

const viewerOf = (req) => (req.userId ? db.users.findOne({ _id: req.userId }, { projection: { role: 1, perms: 1 } }) : null);
/** Seasonal lounges close when their festival ends. */
const openLounges = () => ({ $or: [{ expiresAt: null }, { expiresAt: { $exists: false } }, { expiresAt: { $gt: now() } }] });

socialRouter.get('/lounges', optionalAuth, async (req, res) => {
  const author = authorCache(req.userId);
  const viewer = await viewerOf(req);
  const rows = await db.lounges.find(openLounges()).sort({ position: 1 }).toArray();
  const lounges = await Promise.all(rows.map((l) => serializeLounge(l, author, viewer)));
  // Festival lounges first while they're on, then the busiest.
  res.json({ lounges: lounges.sort((a, b) => Number(!!b.festival) - Number(!!a.festival) || b.onlineCount - a.onlineCount) });
});

socialRouter.get('/lounges/:id', optionalAuth, async (req, res) => {
  const l = await db.lounges.findOne(byIdOrSlug(req.params.id));
  if (!l) throw new HttpError(404, 'Lounge not found');
  const author = authorCache(req.userId);
  const rows = (await recentMessages('lounge', l._id, 60)).reverse();
  res.json({ lounge: await serializeLounge(l, author, await viewerOf(req)), messages: await Promise.all(rows.map((m) => serializeMessage(m, author))) });
});

// ——— Making and managing lounges ———
// Members from level 10 (Settings → level gates) can open their own: 1 at a time, 3 with Premium. Owners edit and
// delete theirs; staff with the Lounges permission can manage any (deleting someone else's needs a reason, logged).
const loungeBody = z.object({
  name: z.string().trim().min(3).max(40),
  emoji: z.string().trim().min(1).max(8),
  topic: z.string().trim().max(120).default(''),
  nowPlaying: z.string().trim().max(80).default(''),
  coverUrl: z.string().url().max(600).nullable().optional(),
  /** Live radio in this lounge (everyone hears the same song; listeners vote on what's next). */
  radio: z.boolean().optional(),
});
const slugify = (name) =>
  name.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').slice(0, 32) || 'lounge';

socialRouter.post('/lounges', requireAuth, async (req, res) => {
  const me = uid(req);
  await rateLimit(`lounge:create:${me}`, 3);
  const b = parse(loungeBody, req.body);
  assertClean(`${b.name} ${b.topic} ${b.nowPlaying}`);
  const u = await db.users.findOne({ _id: me }, { projection: { role: 1, perms: 1, premium: 1 } });
  const staff = can(u, 'lounges');
  if (!staff) {
    await assertLevel(me, 'lounge');
    const limit = isPremium(u) ? LOUNGE_LIMIT.premium : LOUNGE_LIMIT.member;
    if ((await db.lounges.countDocuments({ ownerId: me })) >= limit)
      throw new HttpError(409, `You can have ${limit} lounge${limit === 1 ? '' : 's'} at a time${isPremium(u) ? '' : ' — 3 with Premium 👑'}`, 'lounge_limit');
  }
  let slug = slugify(b.name);
  if (await db.lounges.findOne({ slug })) slug = `${slug}-${newId().slice(-5)}`;
  const last = await db.lounges.find({}).sort({ position: -1 }).limit(1).toArray();
  const doc = {
    _id: newId(), slug, name: b.name, emoji: b.emoji, topic: b.topic, nowPlaying: b.nowPlaying,
    coverUrl: b.coverUrl || `https://picsum.photos/seed/${slug}/800/500`,
    ownerId: staff && req.body.official ? null : me, position: (last[0]?.position ?? 0) + 1, createdAt: now(), radio: b.radio ?? true,
  };
  await db.lounges.insertOne(doc);
  track(me, 'lounge');
  res.status(201).json({ lounge: await serializeLounge(doc, authorCache(me), u) });
});

async function manageable(req) {
  const me = uid(req);
  const l = await db.lounges.findOne(byIdOrSlug(req.params.id));
  if (!l) throw new HttpError(404, 'Lounge not found');
  const u = await db.users.findOne({ _id: me }, { projection: { role: 1, perms: 1 } });
  const owner = l.ownerId === me;
  if (!owner && !can(u, 'lounges')) throw new HttpError(403, 'Only the lounge’s owner or staff can change it');
  return { me, l, u, owner };
}

socialRouter.patch('/lounges/:id', requireAuth, async (req, res) => {
  const { me, l, u } = await manageable(req);
  const b = parse(loungeBody.partial(), req.body);
  assertClean(`${b.name ?? ''} ${b.topic ?? ''} ${b.nowPlaying ?? ''}`);
  const set = Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined));
  if (Object.keys(set).length) await db.lounges.updateOne({ _id: l._id }, { $set: set });
  const fresh = await db.lounges.findOne({ _id: l._id });
  io()?.to(room.lounge(l._id)).emit('lounge:updated', await serializeLounge(fresh, authorCache(me), null));
  res.json({ lounge: await serializeLounge(fresh, authorCache(me), u) });
});

socialRouter.delete('/lounges/:id', requireAuth, async (req, res) => {
  const { me, l, owner } = await manageable(req);
  const reason = String(req.body?.reason ?? '').trim().slice(0, 300);
  if (!owner && l.ownerId && reason.length < 5) throw new HttpError(400, 'Give a reason for deleting someone else’s lounge');
  await db.lounges.deleteOne({ _id: l._id });
  await db.messages.deleteMany({ roomType: 'lounge', roomId: l._id });
  io()?.to(room.lounge(l._id)).emit('lounge:deleted', { loungeId: l._id });
  if (!owner) {
    const { audit } = await import('./admin.js');
    await audit(l.ownerId ?? me, 'lounge_deleted', `Lounge “${l.name}” deleted${reason ? `: ${reason}` : ''}`, me, { review: { reason } });
    if (l.ownerId) await notify(l.ownerId, { kind: 'system', title: `Your lounge “${l.name}” was removed`, body: reason || 'Removed by the ChatLOL team', link: '/lounges' });
  }
  res.json({ ok: true });
});

export { recentMessages };

export async function insertLoungeMessage(loungeId, authorId, body, replyToId = null, sticker = null) {
  const doc = {
    _id: newId(),
    roomType: 'lounge',
    roomId: loungeId,
    authorId,
    body,
    mediaUrl: null,
    kind: sticker ? 'sticker' : 'text',
    sticker,
    replyToId,
    createdAt: now(),
  };
  await db.messages.insertOne(doc);
  const msg = await serializeMessage(doc);
  io()?.to(room.lounge(loungeId)).emit('lounge:message', msg);
  bus.emitEvent('lounge:sent', { loungeId, messageId: doc._id, authorId });
  return msg;
}

// ——— Direct messages ———
// A conversation document embeds its members: { _id, pairKey, members: [{ userId, lastReadAt }], updatedAt }.
async function conversationFor(viewerId, c) {
  const author = authorCache(viewerId);
  const mine = c.members.find((m) => m.userId === viewerId);
  const [[last], unread] = await Promise.all([
    recentMessages('dm', c._id, 1),
    db.messages.countDocuments({ roomType: 'dm', roomId: c._id, authorId: { $ne: viewerId }, createdAt: { $gt: mine?.lastReadAt ?? '' } }),
  ]);
  return {
    id: c._id,
    members: await Promise.all(c.members.filter((m) => m.userId !== viewerId).map((m) => author(m.userId))),
    lastMessage: last ? await serializeMessage(last, author) : null,
    unread,
    updatedAt: c.updatedAt,
  };
}

socialRouter.get('/conversations', requireAuth, async (req, res) => {
  const me = uid(req);
  const rows = await db.conversations.find({ 'members.userId': me }).sort({ updatedAt: -1 }).limit(100).toArray();
  res.json({ conversations: await Promise.all(rows.map((c) => conversationFor(me, c))) });
});

/** 1:1 conversations have a unique pairKey, so two simultaneous "message" taps can't create duplicates. */
export async function getOrCreateDm(a, b) {
  const pairKey = [a, b].sort().join('|');
  const t = now();
  const upsert = () =>
    db.conversations.findOneAndUpdate(
      { pairKey },
      {
        $setOnInsert: {
          members: [
            { userId: a, lastReadAt: t },
            { userId: b, lastReadAt: t },
          ],
          updatedAt: t,
        },
      },
      { upsert: true, returnDocument: 'after' },
    );
  try {
    return await upsert();
  } catch (e) {
    if (isDuplicateKey(e)) return await upsert(); // lost a race with the other tap; now it exists
    throw e;
  }
}

socialRouter.post('/conversations', requireAuth, async (req, res) => {
  const me = uid(req);
  const { userId } = parse(z.object({ userId: z.string() }), req.body);
  const other = await db.users.findOne({ _id: userId, deletedAt: null });
  if (!other || other._id === me) throw new HttpError(404, 'User not found');
  if (
    await db.blocks.findOne({
      $or: [
        { blockerId: me, blockedId: userId },
        { blockerId: userId, blockedId: me },
      ],
    })
  ) {
    throw new HttpError(403, "You can't message this person");
  }
  const s = { ...DEFAULT_SETTINGS, ...other.settings };
  const followsMe = await db.follows.findOne({ followerId: other._id, followeeId: me });
  if (s.dmFrom === 'nobody' || (s.dmFrom === 'following' && !followsMe))
    throw new HttpError(403, `@${other.handle} isn't taking new DMs right now`);
  // New conversations with people who aren't friends need a minimum level. AI personas and existing chats are exempt.
  if (!other.isAi && !(await areFriends(me, other._id)) && !(await db.conversations.findOne({ pairKey: [me, other._id].sort().join('|') })))
    await assertLevel(me, 'dm');
  res.json({ conversation: await conversationFor(me, await getOrCreateDm(me, other._id)) });
});

async function memberConversation(convId, userId) {
  const c = await db.conversations.findOne({ _id: convId, 'members.userId': userId });
  if (!c) throw new HttpError(404, 'Conversation not found');
  return c;
}

/** Marks a conversation read up to `at` for one member. Returns false if they aren't a member. */
export async function markRead(convId, userId, at = now()) {
  const r = await db.conversations.updateOne({ _id: convId, 'members.userId': userId }, { $set: { 'members.$.lastReadAt': at } });
  return r.matchedCount > 0;
}

socialRouter.get('/conversations/:id/messages', requireAuth, async (req, res) => {
  const me = uid(req);
  const convId = String(req.params.id);
  const conv = await memberConversation(convId, me);
  const before = typeof req.query.before === 'string' ? req.query.before : '9999';
  const author = authorCache(me);
  // Everything this needs runs at once; marking it read doesn't hold up the response.
  const [rows, conversation] = await Promise.all([
    recentMessages('dm', convId, 50, { createdAt: { $lt: before } }).then((r) => r.reverse()),
    conversationFor(me, conv),
    markRead(convId, me),
  ]);
  res.json({
    messages: await Promise.all(rows.map((m) => serializeMessage(m, author))),
    conversation: { ...conversation, unread: 0 },
  });
});

export async function insertDm(convId, authorId, body, kind = 'text', mediaUrl = null, sticker = null) {
  const t = now();
  const doc = { _id: newId(), roomType: 'dm', roomId: convId, authorId, body, mediaUrl, kind: sticker ? 'sticker' : kind, sticker, replyToId: null, createdAt: t };
  await db.messages.insertOne(doc);
  const c = await db.conversations.findOneAndUpdate(
    { _id: convId, 'members.userId': authorId },
    { $set: { updatedAt: t, 'members.$.lastReadAt': t } },
    { returnDocument: 'after' },
  );
  const msg = await serializeMessage(doc);
  for (const o of c?.members ?? []) {
    if (o.userId === authorId) continue;
    io()?.to(room.user(o.userId)).emit('dm:message', msg);
    await notify(o.userId, {
      kind: 'dm',
      actorId: authorId,
      link: `/messages/${convId}`,
      title: msg.author.displayName,
      body: sticker && !body ? stickerPreview(sticker) : kind === 'image' ? '📷 Photo' : body.slice(0, 140),
    });
  }
  io()?.to(room.user(authorId)).emit('dm:message', msg);
  bus.emitEvent('dm:sent', { conversationId: convId, messageId: doc._id, authorId });
  return msg;
}

socialRouter.post('/conversations/:id/messages', requireAuth, async (req, res) => {
  const me = uid(req);
  const convId = String(req.params.id);
  await rateLimit(`dm:${me}`, 40);
  const conv = await memberConversation(convId, me);
  const b = parse(
    z.object({
      body: z.string().max(2000).default(''),
      mediaUrl: z.string().url().max(600).nullable().optional(),
      kind: z.enum(['text', 'image', 'voice']).default('text'),
      sticker: stickerInput,
    }),
    req.body,
  );
  if (!b.body.trim() && !b.mediaUrl && !b.sticker) throw new HttpError(400, 'Empty message');
  await assertCanPost(me);
  assertClean(b.body);
  await assertEmojiOwned(me, b.body);
  const sticker = await resolveSticker(me, b.sticker);
  const otherId = conv.members.find((m) => m.userId !== me)?.userId ?? null;
  if (
    otherId &&
    (await db.blocks.findOne({
      $or: [
        { blockerId: me, blockedId: otherId },
        { blockerId: otherId, blockedId: me },
      ],
    }))
  )
    throw new HttpError(403, "You can't message this person");
  // DMs to real people cost Sparks (Premium members, Free Talk power-ups and chats with AI personas are free).
  const [sender, other] = await Promise.all([
    db.users.findOne({ _id: me }, { projection: { premium: 1, powers: 1 } }),
    otherId ? db.users.findOne({ _id: otherId }, { projection: { isAi: 1 } }) : null,
  ]);
  if (other && !other.isAi && !isPremium(sender) && !hasPower(sender, 'free_talk')) {
    const paid = await db.users.updateOne({ _id: me, sparks: { $gte: DM_SPARK_COST } }, { $inc: { sparks: -DM_SPARK_COST } });
    if (!paid.modifiedCount)
      throw new HttpError(402, `Messages cost ${DM_SPARK_COST} Sparks — earn more, or go Premium to message free`, 'insufficient_sparks');
    void emitWallet(me);
  }
  const message = await insertDm(convId, me, b.body, b.mediaUrl ? (b.kind === 'text' ? 'image' : b.kind) : 'text', b.mediaUrl ?? null, sticker);
  screen({ userId: me, text: b.body, ref: { type: 'message', id: message.id }, targetId: otherId });
  track(me, 'dm');
  res.status(201).json({ message });
});

// ——— Notifications ———
socialRouter.get('/notifications', requireAuth, async (req, res) => {
  const me = uid(req);
  const author = authorCache(me);
  const [rows, unread] = await Promise.all([
    db.notifications.find({ userId: me }).sort({ createdAt: -1 }).limit(60).toArray(),
    db.notifications.countDocuments({ userId: me, read: false }),
  ]);
  const premium = isPremium(await db.users.findOne({ _id: me }, { projection: { premium: 1 } }));
  res.json({ items: await Promise.all(rows.map((n) => serializeNotification(n, author, premium))), unread });
});

socialRouter.post('/notifications/read', requireAuth, async (req, res) => {
  await db.notifications.updateMany({ userId: uid(req), read: false }, { $set: { read: true } });
  res.json({ ok: true });
});

// ——— Leaderboards ———
socialRouter.get('/leaderboard', optionalAuth, async (req, res) => {
  const kind = req.query.kind === 'streak' ? 'streak' : req.query.kind === 'xp' ? 'xp' : 'vibe';
  let rows;
  if (kind === 'vibe') {
    rows = await db.posts
      .aggregate([
        { $match: { hidden: false } },
        {
          $group: {
            _id: '$authorId',
            w: {
              $sum: {
                $add: ['$r1', { $multiply: [2, '$r2'] }, { $multiply: [3, '$r3'] }, { $multiply: [4, '$r4'] }, { $multiply: [5, '$r5'] }],
              },
            },
            n: { $sum: { $add: ['$r1', '$r2', '$r3', '$r4', '$r5'] } },
          },
        },
        { $match: { n: { $gte: 5 } } },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u', pipeline: [{ $project: { deletedAt: 1 } }] } },
        { $match: { 'u.deletedAt': null } },
        { $project: { score: { $divide: ['$w', '$n'] } } },
        { $sort: { score: -1 } },
        { $limit: 100 },
      ])
      .toArray();
    rows.forEach((r) => (r.score = Math.round(((r.score - 1) / 4) * 100) / 10));
  } else {
    const field = kind === 'xp' ? 'xp' : 'streakDays';
    rows = (
      await db.users
        .find({ deletedAt: null }, { projection: { [field]: 1 } })
        .sort({ [field]: -1, _id: 1 })
        .limit(100)
        .toArray()
    ).map((u) => ({ _id: u._id, score: u[field] }));
  }
  const author = authorCache(req.userId);
  res.json({ entries: await Promise.all(rows.map(async (r, i) => ({ rank: i + 1, user: await author(r._id), score: r.score }))) });
});

export { userPublic };
