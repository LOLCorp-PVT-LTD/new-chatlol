import { Server } from 'socket.io';
import { db, newId, now } from './db.js';
import { authenticate } from './lib/auth.js';
import { setIo, room } from './lib/io.js';
import { presence } from './lib/presence.js';
import { serializeMessage } from './lib/serialize.js';
import { localCheck } from './lib/moderation.js';
import { insertLoungeMessage, loungeKey } from './routes/social.js';
import { streamKeys, endStream } from './routes/live.js';
import { bus } from './lib/events.js';
import { shared, redisClient, duplicateRedis } from './lib/shared.js';
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
    const safe =
      (fn) =>
      (...a) => {
        fn(...a).catch((e) => console.warn('[socket]', e.message));
      };

    // ——— Lounges ———
    socket.on(
      'lounge:join',
      safe(async (loungeId, ack) => {
        if (typeof loungeId !== 'string' || !(await db.one('SELECT 1 AS x FROM lounges WHERE id = ?', loungeId))) return;
        socket.join(room.lounge(loungeId));
        joinedLounges.add(loungeId);
        if (userId) {
          await shared().sadd(loungeKey(loungeId), userId);
          io.to(room.lounge(loungeId)).emit('lounge:presence', { loungeId, onlineCount: await shared().scard(loungeKey(loungeId)) });
        }
        const rows = (
          await db.all(`SELECT * FROM messages WHERE room_type = 'lounge' AND room_id = ? ORDER BY created_at DESC LIMIT 60`, loungeId)
        ).reverse();
        ack?.(await Promise.all(rows.map((m) => serializeMessage(m))));
      }),
    );

    const leaveLounge = async (loungeId) => {
      socket.leave(room.lounge(loungeId));
      joinedLounges.delete(loungeId);
      if (userId) {
        await shared().srem(loungeKey(loungeId), userId);
        io.to(room.lounge(loungeId)).emit('lounge:presence', {
          loungeId,
          onlineCount: await shared().scard(loungeKey(loungeId)),
          left: userId,
        });
      }
    };
    socket.on('lounge:leave', safe(leaveLounge));

    socket.on(
      'lounge:send',
      safe(async ({ loungeId, body, replyToId }) => {
        if (!userId || !joinedLounges.has(loungeId) || !allowChat()) return;
        const text = String(body ?? '')
          .trim()
          .slice(0, 500);
        if (!text || !localCheck(text).ok) return;
        await insertLoungeMessage(loungeId, userId, text, replyToId ?? null);
      }),
    );

    // ——— DMs ———
    socket.on(
      'dm:typing',
      safe(async ({ conversationId, typing }) => {
        if (!userId) return;
        if (typing && Date.now() - (typingAt.get(conversationId) ?? 0) < 1500) return;
        typingAt.set(conversationId, Date.now());
        const members = await db.all('SELECT user_id FROM conversation_members WHERE conversation_id = ?', conversationId);
        if (!members.some((m) => m.user_id === userId)) return;
        for (const m of members)
          if (m.user_id !== userId) io.to(room.user(m.user_id)).emit('dm:typing', { conversationId, userId, typing: !!typing });
      }),
    );

    socket.on(
      'dm:read',
      safe(async ({ conversationId }) => {
        if (!userId) return;
        const at = now();
        const r = await db.run(
          'UPDATE conversation_members SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?',
          at,
          conversationId,
          userId,
        );
        if (!r.changes) return;
        for (const m of await db.all(
          'SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id != ?',
          conversationId,
          userId,
        )) {
          io.to(room.user(m.user_id)).emit('dm:read', { conversationId, userId, at });
        }
      }),
    );

    // ——— Live streams: chat audience ———
    const viewersChanged = async (streamId) => {
      io.to(room.stream(streamId)).emit('stream:viewers', { streamId, viewers: await shared().scard(streamKeys.watchers(streamId)) });
    };
    socket.on(
      'stream:join',
      safe(async (streamId) => {
        if (typeof streamId !== 'string' || !(await db.one('SELECT 1 AS x FROM streams WHERE id = ? AND ended_at IS NULL', streamId)))
          return;
        socket.join(room.stream(streamId));
        joinedStreams.add(streamId);
        await shared().sadd(streamKeys.watchers(streamId), socket.id);
        await viewersChanged(streamId);
      }),
    );

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
      safe(async ({ streamId, body }) => {
        if (!userId || !joinedStreams.has(streamId) || !allowChat()) return;
        const text = String(body ?? '')
          .trim()
          .slice(0, 300);
        if (!text || !localCheck(text).ok) return;
        const id = newId('m');
        await db.run(
          `INSERT INTO messages (id, room_type, room_id, author_id, body, created_at) VALUES (?, 'stream', ?, ?, ?, ?)`,
          id,
          streamId,
          userId,
          text,
          now(),
        );
        io.to(room.stream(streamId)).emit('stream:chat', await serializeMessage(await db.one('SELECT * FROM messages WHERE id = ?', id)));
        bus.emitEvent('stream:chat', { streamId, messageId: id, authorId: userId });
      }),
    );

    // ——— Live video: WebRTC mesh signalling (media flows peer-to-peer / via your TURN) ———
    socket.on(
      'rtc:host',
      safe(async (streamId, ack) => {
        const s = userId ? await db.one('SELECT * FROM streams WHERE id = ? AND ended_at IS NULL', streamId) : undefined;
        if (!s || s.host_id !== userId) return ack?.({ ok: false, error: 'Not your stream' });
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
        if (typeof streamId !== 'string' || !joinedStreams.has(streamId)) return ack?.({ ok: false, reason: 'offline' });
        const s = await db.one('SELECT video FROM streams WHERE id = ? AND ended_at IS NULL', streamId);
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
          await db.run('UPDATE users SET last_seen_at = ? WHERE id = ?', now(), userId);
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
