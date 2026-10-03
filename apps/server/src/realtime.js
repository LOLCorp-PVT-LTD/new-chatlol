import { Server } from 'socket.io';
import { db, now } from './db.js';
import { authenticate } from './lib/auth.js';
import { setIo, room } from './lib/io.js';
import { presence } from './lib/presence.js';
import { authorCache, serializeMessage } from './lib/serialize.js';
import { localCheck } from './lib/moderation.js';
import { canPost } from './lib/enforcement.js';
import { screen } from './lib/aiModeration.js';
import { insertLoungeMessage, loungeKey, markRead, recentMessages } from './routes/social.js';
import { streamKeys, endStream, insertStreamMessage } from './routes/live.js';
import { kickKey } from './lib/tickets.js';
import { bus } from './lib/events.js';
import { assertEmojiOwned, resolveSticker, stickerInput } from './lib/stickers.js';
import { shared, redisClient, duplicateRedis, sharedBackend } from './lib/shared.js';
import { config } from './config.js';

export async function attachRealtime(server) {
  const io = new Server(server, {
    cors: { origin: config.corsOrigins, credentials: true },
    pingInterval: 20_000,
    maxHttpBufferSize: 256 * 1024,
  });
  const redis = redisClient();
  if (redis) {
    // Fan events out across every API instance.
    const { createAdapter } = await import('@socket.io/redis-adapter');
    io.adapter(createAdapter(redis, duplicateRedis()));
  } else if (sharedBackend() === 'mongodb' && db.transactions) {
    // No Redis: fan events out through MongoDB (change streams on a replica set, e.g. Atlas).
    const { createAdapter } = await import('@socket.io/mongo-adapter');
    io.adapter(createAdapter(db.socketEvents.raw, { addCreatedAtField: true }));
  }
  setIo(io);

  io.use(async (socket, next) => {
    try {
      // Anonymous sockets may watch the public ticker/feed but can't chat.
      socket.data.userId = await authenticate(socket.handshake.auth?.token);
      next();
    } catch (e) {
      next(e);
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId;
    const joinedLounges = new Set();
    const joinedStreams = new Set();
    const hosting = new Set();
    const watchingVideo = new Set();
    socket.join(room.global);
    if (userId) socket.join(room.user(userId));

    const chat = { n: 0, at: Date.now() };
    const allowChat = () => {
      if (Date.now() - chat.at > 10_000) Object.assign(chat, { n: 0, at: Date.now() });
      return ++chat.n <= 12;
    };
    const signals = { n: 0, at: Date.now() };
    const allowSignal = () => {
      if (Date.now() - signals.at > 10_000) Object.assign(signals, { n: 0, at: Date.now() });
      return ++signals.n <= 400; // ICE candidates arrive in bursts
    };
    const typingAt = new Map();
    /** Stickers and custom emoji in socket chat: invalid or locked ones tell the sender why and send nothing. */
    const chatSticker = async (input) => {
      if (!input) return null;
      const parsed = stickerInput.safeParse(input);
      if (!parsed.success) return null;
      try {
        return await resolveSticker(userId, parsed.data);
      } catch (e) {
        socket.emit('toast', { kind: 'error', title: e.message });
        return null;
      }
    };
    const emojiOk = async (text) => {
      try {
        await assertEmojiOwned(userId, text);
        return true;
      } catch (e) {
        socket.emit('toast', { kind: 'error', title: e.message });
        return false;
      }
    };
    const safe =
      (fn) =>
      (...a) => {
        fn(...a).catch((e) => console.warn('[socket]', e.message));
      };

    // ——— Lounges ———
    socket.on(
      'lounge:join',
      safe(async (loungeId, ack) => {
        if (typeof loungeId !== 'string' || !(await db.lounges.findOne({ _id: loungeId }))) return;
        // Kicked with a Kick Ticket: locked out of this lounge for a while.
        if (userId && (await shared().get(kickKey(loungeId, userId)))) return ack?.({ kicked: true });
        socket.join(room.lounge(loungeId));
        joinedLounges.add(loungeId);
        // Ghost mode (Settings → Privacy): read the room without showing up in its presence list.
        const ghost = userId && (await db.users.findOne({ _id: userId }, { projection: { 'settings.ghostMode': 1 } }))?.settings?.ghostMode;
        if (userId && !ghost) {
          // Another tab of the same member is already here: no second "joined" line.
          const wasHere = (await shared().smembers(loungeKey(loungeId))).includes(userId);
          await shared().sadd(loungeKey(loungeId), userId);
          const joined = wasHere ? undefined : await authorCache(userId)(userId);
          io.to(room.lounge(loungeId)).emit('lounge:presence', { loungeId, onlineCount: await shared().scard(loungeKey(loungeId)), joined });
        }
        // Who's in the room right now (ghosts excluded).
        const ids = (await shared().smembers(loungeKey(loungeId))).slice(0, 100);
        const author = authorCache(userId);
        socket.emit('lounge:members', { loungeId, members: await Promise.all(ids.map((id) => author(id))) });
        const rows = (await recentMessages('lounge', loungeId, 60)).reverse();
        ack?.(await Promise.all(rows.map((m) => serializeMessage(m, authorCache(userId)))));
      }),
    );

    const leaveLounge = async (loungeId) => {
      socket.leave(room.lounge(loungeId));
      joinedLounges.delete(loungeId);
      if (userId && (await shared().smembers(loungeKey(loungeId))).includes(userId)) {
        // Still here in another tab: stay listed and say nothing.
        const others = await io
          .in(room.lounge(loungeId))
          .fetchSockets()
          .then((list) => list.some((x) => x.id !== socket.id && x.data.userId === userId))
          .catch(() => false);
        if (others) return;
        await shared().srem(loungeKey(loungeId), userId);
        io.to(room.lounge(loungeId)).emit('lounge:presence', {
          loungeId,
          onlineCount: await shared().scard(loungeKey(loungeId)),
          left: await authorCache(userId)(userId),
        });
      }
    };
    socket.on('lounge:leave', safe(leaveLounge));

    socket.on(
      'lounge:send',
      safe(async ({ loungeId, body, replyToId, sticker }) => {
        if (!userId || !joinedLounges.has(loungeId) || !allowChat()) return;
        if (await shared().get(kickKey(loungeId, userId))) return void leaveLounge(loungeId);
        const text = String(body ?? '')
          .trim()
          .slice(0, 500);
        const st = await chatSticker(sticker);
        if ((!text && !st) || !localCheck(text).ok || !(await canPost(userId))) return;
        if (!(await emojiOk(text))) return;
        const msg = await insertLoungeMessage(loungeId, userId, text, replyToId ?? null, st);
        if (text) screen({ userId, text, ref: { type: 'message', id: msg.id } });
      }),
    );

    // ——— DMs ———
    socket.on(
      'dm:typing',
      safe(async ({ conversationId, typing }) => {
        if (!userId) return;
        if (typing && Date.now() - (typingAt.get(conversationId) ?? 0) < 1500) return;
        typingAt.set(conversationId, Date.now());
        if (typeof conversationId !== 'string') return;
        const c = await db.conversations.findOne({ _id: conversationId, 'members.userId': userId }, { projection: { members: 1 } });
        for (const m of c?.members ?? [])
          if (m.userId !== userId) io.to(room.user(m.userId)).emit('dm:typing', { conversationId, userId, typing: !!typing });
      }),
    );

    socket.on(
      'dm:read',
      safe(async ({ conversationId }) => {
        if (!userId) return;
        if (typeof conversationId !== 'string') return;
        const at = now();
        if (!(await markRead(conversationId, userId, at))) return;
        const c = await db.conversations.findOne({ _id: conversationId }, { projection: { members: 1 } });
        for (const m of c?.members ?? []) {
          if (m.userId !== userId) io.to(room.user(m.userId)).emit('dm:read', { conversationId, userId, at });
        }
      }),
    );

    // ——— Live streams: chat audience ———
    const viewersChanged = async (streamId) => {
      io.to(room.stream(streamId)).emit('stream:viewers', { streamId, viewers: await shared().scard(streamKeys.watchers(streamId)) });
    };
    const joinStream = async (streamId) => {
      if (typeof streamId !== 'string') return false;
      if (joinedStreams.has(streamId)) return true;
      if (!(await db.streams.findOne({ _id: streamId, endedAt: null }))) return false;
      socket.join(room.stream(streamId));
      joinedStreams.add(streamId);
      await shared().sadd(streamKeys.watchers(streamId), socket.id);
      await viewersChanged(streamId);
      return true;
    };
    socket.on('stream:join', safe(joinStream));

    // ——— Game arenas: live updates (clients refetch their own view on 'arena:update') ———
    socket.on(
      'arena:watch',
      safe(async (arenaId) => {
        if (typeof arenaId !== 'string') return;
        const a = await db.arenas.findOne({ _id: arenaId }, { projection: { visibility: 1, playerIds: 1, invitedIds: 1 } });
        if (a && (a.visibility === 'public' || a.playerIds.includes(userId) || a.invitedIds.includes(userId))) socket.join(room.arena(arenaId));
      }),
    );
    socket.on('arena:unwatch', (arenaId) => typeof arenaId === 'string' && socket.leave(room.arena(arenaId)));

    const leaveStream = async (streamId) => {
      await stopWatching(streamId);
      socket.leave(room.stream(streamId));
      joinedStreams.delete(streamId);
      await shared().srem(streamKeys.watchers(streamId), socket.id);
      await viewersChanged(streamId);
    };
    socket.on('stream:leave', safe(leaveStream));

    socket.on(
      'stream:chat',
      safe(async ({ streamId, body, sticker }) => {
        if (!userId || !joinedStreams.has(streamId) || !allowChat()) return;
        const text = String(body ?? '')
          .trim()
          .slice(0, 300);
        const st = await chatSticker(sticker);
        if ((!text && !st) || !localCheck(text).ok || !(await canPost(userId))) return;
        if (!(await emojiOk(text))) return;
        const msg = await insertStreamMessage(streamId, userId, text, 'text', st);
        if (text) screen({ userId, text, ref: { type: 'message', id: msg.id } });
        io.to(room.stream(streamId)).emit('stream:chat', msg);
        bus.emitEvent('stream:chat', { streamId, messageId: msg.id, authorId: userId });
      }),
    );

    // ——— Live video: WebRTC mesh signalling (media flows peer-to-peer / via your TURN) ———
    socket.on(
      'rtc:host',
      safe(async (streamId, ack) => {
        const s = userId && typeof streamId === 'string' ? await db.streams.findOne({ _id: streamId, endedAt: null }) : null;
        if (!s || s.hostId !== userId) return ack?.({ ok: false, error: 'Not your stream' });
        await shared().set(streamKeys.host(streamId), socket.id, 12 * 3600);
        await shared().del(streamKeys.rtcViewers(streamId));
        hosting.add(streamId);
        socket.join(room.stream(streamId));
        joinedStreams.add(streamId);
        socket.to(room.stream(streamId)).emit('rtc:host-ready', { streamId });
        ack?.({ ok: true });
      }),
    );

    socket.on(
      'rtc:watch',
      safe(async (streamId, ack) => {
        // Join here too: 'stream:join' is emitted just before and runs concurrently, so it may not have finished yet.
        if (!(await joinStream(streamId))) return ack?.({ ok: false, reason: 'offline' });
        const s = await db.streams.findOne({ _id: streamId, endedAt: null }, { projection: { video: 1 } });
        if (!s?.video) return ack?.({ ok: false, reason: 'no-video' });
        const host = await shared().get(streamKeys.host(streamId));
        if (!host) return ack?.({ ok: false, reason: 'offline' });
        if (!watchingVideo.has(streamId) && (await shared().scard(streamKeys.rtcViewers(streamId))) >= config.rtc.maxViewers) {
          return ack?.({ ok: false, reason: 'full' });
        }
        await shared().sadd(streamKeys.rtcViewers(streamId), socket.id);
        watchingVideo.add(streamId);
        io.to(host).emit('rtc:viewer-joined', { streamId, peer: socket.id });
        ack?.({ ok: true });
      }),
    );

    const stopWatching = async (streamId) => {
      if (!watchingVideo.delete(streamId)) return;
      await shared().srem(streamKeys.rtcViewers(streamId), socket.id);
      const host = await shared().get(streamKeys.host(streamId));
      if (host) io.to(host).emit('rtc:peer-left', { streamId, peer: socket.id });
    };
    socket.on('rtc:unwatch', safe(stopWatching));

    /** Relays SDP/ICE only between a stream's host and its admitted viewers. */
    socket.on(
      'rtc:signal',
      safe(async (sig) => {
        if (!sig || typeof sig.streamId !== 'string' || typeof sig.peer !== 'string' || !allowSignal()) return;
        const host = await shared().get(streamKeys.host(sig.streamId));
        if (!host) return;
        const fromHost = host === socket.id;
        const allowed = fromHost
          ? (await shared().smembers(streamKeys.rtcViewers(sig.streamId))).includes(sig.peer)
          : sig.peer === host && watchingVideo.has(sig.streamId);
        if (!allowed) return;
        const payload = {
          streamId: sig.streamId,
          peer: socket.id,
          description:
            sig.description && typeof sig.description.sdp === 'string' && sig.description.sdp.length < 100_000
              ? { type: sig.description.type === 'answer' ? 'answer' : 'offer', sdp: sig.description.sdp }
              : undefined,
          candidate:
            sig.candidate && typeof sig.candidate.candidate === 'string' && sig.candidate.candidate.length < 2000
              ? sig.candidate
              : undefined,
        };
        io.to(sig.peer).emit('rtc:signal', payload);
      }),
    );

    socket.on(
      'disconnect',
      safe(async () => {
        for (const id of [...joinedLounges]) await leaveLounge(id);
        for (const id of [...joinedStreams]) await leaveStream(id);
        for (const id of hosting) {
          if ((await shared().get(streamKeys.host(id))) === socket.id) {
            await shared().del(streamKeys.host(id));
            io.to(room.stream(id)).emit('rtc:peer-left', { streamId: id, peer: socket.id });
            // Give the host 60s to reconnect (app switch, network blip) before ending the stream.
            setTimeout(() => {
              void (async () => {
                if (!(await shared().get(streamKeys.host(id))) && userId) await endStream(id, userId);
              })().catch(() => {});
            }, 60_000).unref();
          }
        }
        if (userId && (await presence.disconnect(userId))) {
          await db.users.updateOne({ _id: userId }, { $set: { lastSeenAt: now() } });
          io.to(room.global).emit('presence', { userId, online: false });
        }
      }),
    );

    // Handlers are registered synchronously above so no early client event is missed.
    if (userId) {
      void presence
        .connect(userId)
        .then((first) => {
          if (first) io.to(room.global).emit('presence', { userId, online: true });
        })
        .catch(() => {});
    }
  });

  return io;
}
