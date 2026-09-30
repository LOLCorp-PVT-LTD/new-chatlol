import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { db, newId, now, type Row } from './db';
import { verifyToken } from './lib/auth';
import { setIo, room, type IO } from './lib/io';
import { presence } from './lib/presence';
import { serializeMessage } from './lib/serialize';
import { localCheck } from './lib/moderation';
import { insertLoungeMessage, loungeOnline } from './routes/social';
import { streamViewers } from './routes/store';
import { bus } from './lib/events';
import { config } from './config';

export function attachRealtime(server: HttpServer) {
  const io: IO = new Server(server, { cors: { origin: config.corsOrigins, credentials: true }, pingInterval: 20_000 });
  setIo(io);

  io.use((socket, next) => {
    const token = (socket.handshake.auth as { token?: string })?.token;
    const userId = verifyToken(token);
    // Anonymous sockets may watch the public ticker/feed but can't chat.
    socket.data.userId = userId && db.one('SELECT 1 FROM users WHERE id = ? AND deleted_at IS NULL', userId) ? userId : null;
    next();
  });

  io.on('connection', (socket) => {
    const userId: string | null = socket.data.userId;
    const joinedLounges = new Set<string>();
    const joinedStreams = new Set<string>();
    socket.join(room.global);
    if (userId) {
      socket.join(room.user(userId));
      if (presence.connect(userId)) io.to(room.global).emit('presence', { userId, online: true });
    }

    const typingLimiter = new Map<string, number>();
    const chatLimiter = { n: 0, at: Date.now() };
    const allowChat = () => {
      if (Date.now() - chatLimiter.at > 10_000) Object.assign(chatLimiter, { n: 0, at: Date.now() });
      return ++chatLimiter.n <= 12;
    };

    socket.on('lounge:join', (loungeId, ack) => {
      if (!db.one('SELECT 1 FROM lounges WHERE id = ?', loungeId)) return;
      socket.join(room.lounge(loungeId));
      joinedLounges.add(loungeId);
      if (userId) {
        const set = loungeOnline.get(loungeId) ?? new Set();
        set.add(userId);
        loungeOnline.set(loungeId, set);
        io.to(room.lounge(loungeId)).emit('lounge:presence', { loungeId, onlineCount: set.size });
      }
      const history = db.all<Row>(`SELECT * FROM messages WHERE room_type = 'lounge' AND room_id = ? ORDER BY created_at DESC LIMIT 60`, loungeId)
        .reverse().map((m) => serializeMessage(m));
      ack?.(history);
    });

    const leaveLounge = (loungeId: string) => {
      socket.leave(room.lounge(loungeId));
      joinedLounges.delete(loungeId);
      if (userId) {
        const set = loungeOnline.get(loungeId);
        set?.delete(userId);
        io.to(room.lounge(loungeId)).emit('lounge:presence', { loungeId, onlineCount: set?.size ?? 0, left: userId });
      }
    };
    socket.on('lounge:leave', leaveLounge);

    socket.on('lounge:send', ({ loungeId, body, replyToId }) => {
      if (!userId || !joinedLounges.has(loungeId) || !allowChat()) return;
      const text = String(body ?? '').trim().slice(0, 500);
      if (!text || !localCheck(text).ok) return;
      insertLoungeMessage(loungeId, userId, text, replyToId ?? null);
    });

    socket.on('dm:typing', ({ conversationId, typing }) => {
      if (!userId) return;
      const last = typingLimiter.get(conversationId) ?? 0;
      if (typing && Date.now() - last < 1500) return;
      typingLimiter.set(conversationId, Date.now());
      const members = db.all<Row>('SELECT user_id FROM conversation_members WHERE conversation_id = ?', conversationId);
      if (!members.some((m) => m.user_id === userId)) return;
      for (const m of members) if (m.user_id !== userId) io.to(room.user(m.user_id)).emit('dm:typing', { conversationId, userId, typing: !!typing });
    });

    socket.on('dm:read', ({ conversationId }) => {
      if (!userId) return;
      const at = now();
      const r = db.run('UPDATE conversation_members SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?', at, conversationId, userId);
      if (!r.changes) return;
      for (const m of db.all<Row>('SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id != ?', conversationId, userId)) {
        io.to(room.user(m.user_id)).emit('dm:read', { conversationId, userId, at });
      }
    });

    socket.on('stream:join', (streamId) => {
      if (!db.one('SELECT 1 FROM streams WHERE id = ? AND ended_at IS NULL', streamId)) return;
      socket.join(room.stream(streamId));
      joinedStreams.add(streamId);
      const set = streamViewers.get(streamId) ?? new Set();
      set.add(socket.id);
      streamViewers.set(streamId, set);
      io.to(room.stream(streamId)).emit('stream:viewers', { streamId, viewers: set.size });
    });
    const leaveStream = (streamId: string) => {
      socket.leave(room.stream(streamId));
      joinedStreams.delete(streamId);
      const set = streamViewers.get(streamId);
      set?.delete(socket.id);
      io.to(room.stream(streamId)).emit('stream:viewers', { streamId, viewers: set?.size ?? 0 });
    };
    socket.on('stream:leave', leaveStream);

    socket.on('stream:chat', ({ streamId, body }) => {
      if (!userId || !joinedStreams.has(streamId) || !allowChat()) return;
      const text = String(body ?? '').trim().slice(0, 300);
      if (!text || !localCheck(text).ok) return;
      const id = newId('m');
      db.run(`INSERT INTO messages (id, room_type, room_id, author_id, body, created_at) VALUES (?, 'stream', ?, ?, ?, ?)`, id, streamId, userId, text, now());
      io.to(room.stream(streamId)).emit('stream:chat', serializeMessage(db.one<Row>('SELECT * FROM messages WHERE id = ?', id)!));
      bus.emitEvent('stream:chat', { streamId, messageId: id, authorId: userId });
    });

    socket.on('disconnect', () => {
      joinedLounges.forEach(leaveLounge);
      joinedStreams.forEach(leaveStream);
      if (userId && presence.disconnect(userId)) {
        db.run('UPDATE users SET last_seen_at = ? WHERE id = ?', now(), userId);
        io.to(room.global).emit('presence', { userId, online: false });
      }
    });
  });

  return io;
}
