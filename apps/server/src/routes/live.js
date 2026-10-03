import { Router } from 'express';
import { z } from 'zod';
import { GIFTS } from '@chatlol/shared';
import { db, newId, now } from '../db.js';
import { optionalAuth, requireAuth, uid } from '../lib/auth.js';
import { HttpError, parse, rateLimit } from '../lib/http.js';
import { serializeMessage, authorCache, userPublic } from '../lib/serialize.js';
import { grant, emitWallet, notify } from '../lib/rewards.js';
import { assertClean } from '../lib/moderation.js';
import { io, room } from '../lib/io.js';
import { bus } from '../lib/events.js';
import { shared } from '../lib/shared.js';
import { iceConfig } from '../lib/turn.js';
import { assertLevel } from '../lib/progression.js';
import { config } from '../config.js';
import { recentMessages } from './social.js';

export const liveRouter = Router();

export const streamKeys = {
  watchers: (id) => `stream:watchers:${id}`, // sockets in the room (chat audience)
  rtcViewers: (id) => `stream:rtc:${id}`, // sockets receiving video (capped)
  host: (id) => `stream:host:${id}`, // host's socket id while broadcasting
};

export async function serializeStream(s, author) {
  const [top, real, ambient] = await Promise.all([
    db.streamGifts
      .aggregate([
        { $match: { streamId: s._id } },
        { $group: { _id: '$userId', amount: { $sum: '$amount' } } },
        { $sort: { amount: -1 } },
        { $limit: 3 },
      ])
      .toArray(),
    shared().scard(streamKeys.watchers(s._id)),
    // AI personas that chatted recently count as viewers too (they're labeled AI in chat).
    db.messages
      .distinct('authorId', { roomType: 'stream', roomId: s._id, createdAt: { $gt: new Date(Date.now() - 10 * 60_000).toISOString() } })
      .then((ids) => ids.length),
  ]);
  return {
    id: s._id,
    host: await author(s.hostId),
    title: s.title,
    category: s.category,
    coverUrl: s.coverUrl,
    video: !!s.video,
    maxViewers: config.rtc.maxViewers,
    viewers: Math.max(real, ambient),
    giftsTotal: s.giftsTotal,
    startedAt: s.startedAt,
    topGifters: await Promise.all(top.map(async (t) => ({ user: await author(t._id), amount: t.amount }))),
  };
}

/** Stores a stream chat line and returns it serialized (callers emit it to the room). */
export async function insertStreamMessage(streamId, authorId, body, kind = 'text', sticker = null) {
  const doc = {
    _id: newId(),
    roomType: 'stream',
    roomId: streamId,
    authorId,
    body,
    mediaUrl: null,
    kind: sticker ? 'sticker' : kind,
    sticker,
    replyToId: null,
    createdAt: now(),
  };
  await db.messages.insertOne(doc);
  return serializeMessage(doc);
}

liveRouter.get('/rtc/ice', requireAuth, (req, res) => {
  res.json(iceConfig(uid(req)));
});

liveRouter.get('/live', optionalAuth, async (req, res) => {
  const author = authorCache(req.userId);
  const rows = await db.streams.find({ endedAt: null }).sort({ giftsTotal: -1, startedAt: -1 }).limit(30).toArray();
  const streams = await Promise.all(rows.map((s) => serializeStream(s, author)));
  res.json({ streams: streams.sort((a, b) => b.viewers - a.viewers) });
});

liveRouter.get('/live/:id', optionalAuth, async (req, res) => {
  const s = await db.streams.findOne({ _id: String(req.params.id) });
  if (!s) throw new HttpError(404, 'Stream ended');
  const author = authorCache(req.userId);
  const chat = (await recentMessages('stream', s._id, 50)).reverse();
  res.json({ stream: await serializeStream(s, author), chat: await Promise.all(chat.map((m) => serializeMessage(m, author))) });
});

export async function startStream(hostId, title, category, video, coverUrl) {
  await db.streams.updateMany({ hostId, endedAt: null }, { $set: { endedAt: now() } });
  const host = await db.users.findOne({ _id: hostId });
  const stream = {
    _id: newId(),
    hostId,
    title,
    category,
    coverUrl: coverUrl ?? host.avatarUrl,
    giftsTotal: 0,
    video: !!video,
    startedAt: now(),
    endedAt: null,
  };
  await db.streams.insertOne(stream);
  bus.emitEvent('stream:started', { streamId: stream._id, hostId });
  for (const f of await db.follows
    .find({ followeeId: hostId }, { projection: { followerId: 1 } })
    .limit(500)
    .toArray()) {
    await notify(f.followerId, {
      kind: 'invite',
      actorId: hostId,
      link: `/live/${stream._id}`,
      title: `${host.displayName} is LIVE 🔴`,
      body: title,
    });
  }
  return stream;
}

liveRouter.post('/live', requireAuth, async (req, res) => {
  const me = uid(req);
  await rateLimit(`golive:${me}`, 3);
  const b = parse(
    z.object({ title: z.string().trim().min(3).max(80), category: z.string().min(2).max(24), video: z.boolean().default(true) }),
    req.body,
  );
  const u = await db.users.findOne({ _id: me }, { projection: { emailVerifiedAt: 1 } });
  if (!u.emailVerifiedAt) throw new HttpError(403, 'Verify your email to go live', 'email_unverified');
  await assertLevel(me, 'live');
  assertClean(b.title);
  res.status(201).json({ stream: await serializeStream(await startStream(me, b.title, b.category, b.video), authorCache(me)) });
});

export async function endStream(id, hostId) {
  const r = await db.streams.updateOne({ _id: id, hostId, endedAt: null }, { $set: { endedAt: now() } });
  if (r.modifiedCount) {
    await shared().del(streamKeys.host(id));
    io()?.to(room.stream(id)).emit('stream:ended', { streamId: id });
  }
  return r.modifiedCount > 0;
}

liveRouter.delete('/live/:id', requireAuth, async (req, res) => {
  await endStream(String(req.params.id), uid(req));
  res.json({ ok: true });
});

export async function sendGift(streamId, fromId, giftId) {
  const gift = GIFTS.find((g) => g.id === giftId);
  if (!gift) throw new HttpError(404, 'Gift not found');
  const s = await db.streams.findOne({ _id: streamId, endedAt: null });
  if (!s) throw new HttpError(404, 'Stream ended');
  if (s.hostId === fromId) throw new HttpError(400, "You can't gift yourself");
  await db.tx(async () => {
    const paid = await db.users.updateOne({ _id: fromId, sparks: { $gte: gift.price } }, { $inc: { sparks: -gift.price } });
    if (!paid.modifiedCount) throw new HttpError(402, 'Not enough Sparks', 'insufficient_sparks');
    // Creators keep 70% of gifted Sparks.
    await db.users.updateOne({ _id: s.hostId }, { $inc: { sparks: Math.floor(gift.price * 0.7) } });
    await db.streams.updateOne({ _id: streamId }, { $inc: { giftsTotal: gift.price } });
    await db.streamGifts.insertOne({ streamId, userId: fromId, amount: gift.price, createdAt: now() });
  });
  const from = await userPublic(await db.users.findOne({ _id: fromId }));
  io()?.to(room.stream(streamId)).emit('stream:gift', { streamId, from, giftId, emoji: gift.emoji, amount: gift.price });
  const msg = await insertStreamMessage(streamId, fromId, `sent ${gift.name} ${gift.emoji}`, 'gift');
  io()?.to(room.stream(streamId)).emit('stream:chat', msg);
  await notify(s.hostId, {
    kind: 'gift',
    actorId: fromId,
    link: `/live/${streamId}`,
    title: `${from.displayName} sent you ${gift.name} ${gift.emoji}`,
    body: `+${Math.floor(gift.price * 0.7)} Sparks`,
  });
  await emitWallet(fromId);
  await emitWallet(s.hostId);
}

liveRouter.post('/live/:id/gift', requireAuth, async (req, res) => {
  const me = uid(req);
  await rateLimit(`gift:${me}`, 60);
  const { giftId } = parse(z.object({ giftId: z.string() }), req.body);
  await sendGift(String(req.params.id), me, giftId);
  await grant(me, 0, 5, 'Sent a gift');
  res.json({ sparks: (await db.users.findOne({ _id: me }, { projection: { sparks: 1 } })).sparks });
});
