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
import { config } from '../config.js';

export const liveRouter = Router();

export const streamKeys = {
  watchers: (id) => `stream:watchers:${id}`, // sockets in the room (chat audience)
  rtcViewers: (id) => `stream:rtc:${id}`, // sockets receiving video (capped)
  host: (id) => `stream:host:${id}`, // host's socket id while broadcasting
};

export async function serializeStream(s, author) {
  const top = await db.all(
    'SELECT user_id, SUM(amount) AS amount FROM stream_gifts WHERE stream_id = ? GROUP BY user_id ORDER BY amount DESC LIMIT 3',
    s.id,
  );
  const real = await shared().scard(streamKeys.watchers(s.id));
  // AI personas that chatted recently count as viewers too (they're labeled AI in chat).
  const ambient = (
    await db.one(
      `SELECT COUNT(DISTINCT author_id) AS n FROM messages WHERE room_type = 'stream' AND room_id = ? AND created_at > ?`,
      s.id,
      new Date(Date.now() - 10 * 60_000).toISOString(),
    )
  ).n;
  return {
    id: s.id,
    host: await author(s.host_id),
    title: s.title,
    category: s.category,
    coverUrl: s.cover_url,
    video: !!s.video,
    maxViewers: config.rtc.maxViewers,
    viewers: Math.max(real, ambient),
    giftsTotal: s.gifts_total,
    startedAt: s.started_at,
    topGifters: await Promise.all(top.map(async (t) => ({ user: await author(t.user_id), amount: t.amount }))),
  };
}

liveRouter.get('/rtc/ice', requireAuth, (req, res) => {
  res.json(iceConfig(uid(req)));
});

liveRouter.get('/live', optionalAuth, async (req, res) => {
  const author = authorCache(req.userId);
  const rows = await db.all('SELECT * FROM streams WHERE ended_at IS NULL ORDER BY gifts_total DESC, started_at DESC LIMIT 30');
  const streams = await Promise.all(rows.map((s) => serializeStream(s, author)));
  res.json({ streams: streams.sort((a, b) => b.viewers - a.viewers) });
});

liveRouter.get('/live/:id', optionalAuth, async (req, res) => {
  const s = await db.one('SELECT * FROM streams WHERE id = ?', String(req.params.id));
  if (!s) throw new HttpError(404, 'Stream ended');
  const author = authorCache(req.userId);
  const chat = (
    await db.all(`SELECT * FROM messages WHERE room_type = 'stream' AND room_id = ? ORDER BY created_at DESC LIMIT 50`, s.id)
  ).reverse();
  res.json({ stream: await serializeStream(s, author), chat: await Promise.all(chat.map((m) => serializeMessage(m, author))) });
});

export async function startStream(hostId, title, category, video, coverUrl) {
  await db.run('UPDATE streams SET ended_at = ? WHERE host_id = ? AND ended_at IS NULL', now(), hostId);
  const id = newId('live');
  const host = await db.one('SELECT * FROM users WHERE id = ?', hostId);
  await db.run(
    'INSERT INTO streams (id, host_id, title, category, cover_url, started_at, video) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id,
    hostId,
    title,
    category,
    coverUrl ?? host.avatar_url,
    now(),
    video ? 1 : 0,
  );
  bus.emitEvent('stream:started', { streamId: id, hostId });
  for (const f of await db.all('SELECT follower_id FROM follows WHERE followee_id = ? LIMIT 500', hostId)) {
    await notify(f.follower_id, {
      kind: 'invite',
      actorId: hostId,
      link: `/live/${id}`,
      title: `${host.display_name} is LIVE 🔴`,
      body: title,
    });
  }
  return await db.one('SELECT * FROM streams WHERE id = ?', id);
}

liveRouter.post('/live', requireAuth, async (req, res) => {
  const me = uid(req);
  await rateLimit(`golive:${me}`, 3);
  const b = parse(
    z.object({ title: z.string().trim().min(3).max(80), category: z.string().min(2).max(24), video: z.boolean().default(true) }),
    req.body,
  );
  const u = await db.one('SELECT email_verified_at FROM users WHERE id = ?', me);
  if (!u.email_verified_at) throw new HttpError(403, 'Verify your email to go live', 'email_unverified');
  assertClean(b.title);
  res.status(201).json({ stream: await serializeStream(await startStream(me, b.title, b.category, b.video), authorCache(me)) });
});

export async function endStream(id, hostId) {
  const r = await db.run('UPDATE streams SET ended_at = ? WHERE id = ? AND host_id = ? AND ended_at IS NULL', now(), id, hostId);
  if (r.changes) {
    await shared().del(streamKeys.host(id));
    io()?.to(room.stream(id)).emit('stream:ended', { streamId: id });
  }
  return r.changes > 0;
}

liveRouter.delete('/live/:id', requireAuth, async (req, res) => {
  await endStream(String(req.params.id), uid(req));
  res.json({ ok: true });
});

export async function sendGift(streamId, fromId, giftId) {
  const gift = GIFTS.find((g) => g.id === giftId);
  if (!gift) throw new HttpError(404, 'Gift not found');
  const s = await db.one('SELECT * FROM streams WHERE id = ? AND ended_at IS NULL', streamId);
  if (!s) throw new HttpError(404, 'Stream ended');
  if (s.host_id === fromId) throw new HttpError(400, "You can't gift yourself");
  await db.tx(async () => {
    const paid = await db.run('UPDATE users SET sparks = sparks - ? WHERE id = ? AND sparks >= ?', gift.price, fromId, gift.price);
    if (!paid.changes) throw new HttpError(402, 'Not enough Sparks', 'insufficient_sparks');
    // Creators keep 70% of gifted Sparks.
    await db.run('UPDATE users SET sparks = sparks + ? WHERE id = ?', Math.floor(gift.price * 0.7), s.host_id);
    await db.run('UPDATE streams SET gifts_total = gifts_total + ? WHERE id = ?', gift.price, streamId);
    await db.run(
      'INSERT INTO stream_gifts (stream_id, user_id, amount, created_at) VALUES (?, ?, ?, ?)',
      streamId,
      fromId,
      gift.price,
      now(),
    );
  });
  const from = await userPublic(await db.one('SELECT * FROM users WHERE id = ?', fromId));
  io()?.to(room.stream(streamId)).emit('stream:gift', { streamId, from, giftId, emoji: gift.emoji, amount: gift.price });
  const mid = newId('m');
  await db.run(
    `INSERT INTO messages (id, room_type, room_id, author_id, body, kind, created_at) VALUES (?, 'stream', ?, ?, ?, 'gift', ?)`,
    mid,
    streamId,
    fromId,
    `sent ${gift.name} ${gift.emoji}`,
    now(),
  );
  io()
    ?.to(room.stream(streamId))
    .emit('stream:chat', await serializeMessage(await db.one('SELECT * FROM messages WHERE id = ?', mid)));
  await notify(s.host_id, {
    kind: 'gift',
    actorId: fromId,
    link: `/live/${streamId}`,
    title: `${from.displayName} sent you ${gift.name} ${gift.emoji}`,
    body: `+${Math.floor(gift.price * 0.7)} Sparks`,
  });
  await emitWallet(fromId);
  await emitWallet(s.host_id);
}

liveRouter.post('/live/:id/gift', requireAuth, async (req, res) => {
  const me = uid(req);
  await rateLimit(`gift:${me}`, 60);
  const { giftId } = parse(z.object({ giftId: z.string() }), req.body);
  await sendGift(String(req.params.id), me, giftId);
  await grant(me, 0, 5, 'Sent a gift');
  res.json({ sparks: (await db.one('SELECT sparks FROM users WHERE id = ?', me)).sparks });
});
