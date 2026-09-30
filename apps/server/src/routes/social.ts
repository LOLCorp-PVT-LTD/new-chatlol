import { Router } from 'express';
import { z } from 'zod';
import { db, newId, now, type Row } from '../db';
import { optionalAuth, requireAuth, uid } from '../lib/auth';
import { HttpError, parse, rateLimit } from '../lib/http';
import {
  serializeThread, serializeReply, serializeMessage, serializeNotification, authorCache, userPublic, DEFAULT_SETTINGS,
} from '../lib/serialize';
import { grant, notify } from '../lib/rewards';
import { assertClean } from '../lib/moderation';
import { bus } from '../lib/events';
import { io, room } from '../lib/io';
import { presence } from '../lib/presence';
import { json } from '../db';
import { REWARDS } from '@chatlol/shared';

export const socialRouter = Router();

// ——— Shouts / Forums ———
socialRouter.get('/shouts/boards', (_req, res) => {
  const boards = db.all<Row>('SELECT b.*, (SELECT COUNT(*) FROM threads t WHERE t.board_id = b.id) threads FROM boards b ORDER BY position');
  res.json({ boards: boards.map((b) => ({ id: b.id, name: b.name, emoji: b.emoji, threads: b.threads })) });
});

socialRouter.get('/shouts', optionalAuth, (req, res) => {
  const p = parse(z.object({ board: z.string().optional(), sort: z.enum(['hot', 'new', 'top']).default('hot'), cursor: z.coerce.number().optional() }), req.query);
  const offset = p.cursor ?? 0;
  const order = {
    hot: `pinned DESC, (upvotes + reply_count * 2 + 1) / ((julianday('now') - julianday(last_activity_at)) * 24 + 2) DESC`,
    new: 'pinned DESC, created_at DESC',
    top: 'upvotes DESC',
  }[p.sort];
  const rows = db.all<Row>(
    `SELECT * FROM threads ${p.board ? 'WHERE board_id = ?' : ''} ORDER BY ${order} LIMIT 21 OFFSET ?`,
    ...(p.board ? [p.board] : []), offset);
  const author = authorCache(req.userId);
  res.json({ items: rows.slice(0, 20).map((r) => serializeThread(r, req.userId, author)), nextCursor: rows.length > 20 ? String(offset + 20) : null });
});

socialRouter.get('/shouts/:id', optionalAuth, (req, res) => {
  const t = db.one<Row>('SELECT * FROM threads WHERE id = ?', String(req.params.id));
  if (!t) throw new HttpError(404, 'Thread not found');
  const author = authorCache(req.userId);
  const replies = db.all<Row>('SELECT * FROM replies WHERE thread_id = ? ORDER BY created_at ASC LIMIT 300', t.id).map((r) => serializeReply(r, author));
  res.json({ thread: serializeThread(t, req.userId, author), replies });
});

export function insertThread(authorId: string, board: string, title: string, body: string) {
  if (!db.one('SELECT 1 FROM boards WHERE id = ?', board)) throw new HttpError(404, 'Board not found');
  const id = newId('t');
  const t = now();
  db.run('INSERT INTO threads (id, board_id, author_id, title, body, last_activity_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', id, board, authorId, title, body, t, t);
  bus.emitEvent('thread:created', { threadId: id, authorId });
  return db.one<Row>('SELECT * FROM threads WHERE id = ?', id)!;
}

export function insertReply(threadId: string, authorId: string, body: string) {
  const t = db.one<Row>('SELECT * FROM threads WHERE id = ?', threadId);
  if (!t) throw new HttpError(404, 'Thread not found');
  const id = newId('r');
  db.run('INSERT INTO replies (id, thread_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)', id, threadId, authorId, body, now());
  db.run('UPDATE threads SET reply_count = reply_count + 1, last_activity_at = ? WHERE id = ?', now(), threadId);
  if (t.author_id !== authorId) {
    const a = db.one<Row>('SELECT display_name FROM users WHERE id = ?', authorId)!;
    notify(t.author_id, { kind: 'comment', actorId: authorId, link: `/shouts/${threadId}`, title: `${a.display_name} replied to your shout`, body: body.slice(0, 120) });
  }
  bus.emitEvent('thread:replied', { threadId, replyId: id, authorId });
  return db.one<Row>('SELECT * FROM replies WHERE id = ?', id)!;
}

socialRouter.post('/shouts', requireAuth, (req, res) => {
  const me = uid(req);
  rateLimit(`thread:${me}`, 3);
  const b = parse(z.object({ board: z.string(), title: z.string().trim().min(4).max(120), body: z.string().trim().min(1).max(4000) }), req.body);
  assertClean(`${b.title} ${b.body}`);
  const row = insertThread(me, b.board, b.title, b.body);
  const reward = grant(me, REWARDS.post.sparks, REWARDS.post.xp, 'Started a shout 📣');
  res.status(201).json({ thread: serializeThread(row, me), reward });
});

socialRouter.post('/shouts/:id/replies', requireAuth, (req, res) => {
  const me = uid(req);
  rateLimit(`reply:${me}`, 20);
  const { body } = parse(z.object({ body: z.string().trim().min(1).max(2000) }), req.body);
  assertClean(body);
  const row = insertReply(String(req.params.id), me, body);
  grant(me, REWARDS.comment.sparks, REWARDS.comment.xp, 'Replied to a shout');
  res.status(201).json({ reply: serializeReply(row) });
});

socialRouter.post('/shouts/:id/vote', requireAuth, (req, res) => {
  const me = uid(req);
  const { v } = parse(z.object({ v: z.union([z.literal(1), z.literal(-1), z.literal(0)]) }), req.body);
  const prev = db.one<Row>('SELECT v FROM thread_votes WHERE thread_id = ? AND user_id = ?', String(req.params.id), me)?.v ?? 0;
  db.tx(() => {
    if (v === 0) db.run('DELETE FROM thread_votes WHERE thread_id = ? AND user_id = ?', String(req.params.id), me);
    else db.run('INSERT OR REPLACE INTO thread_votes VALUES (?, ?, ?)', String(req.params.id), me, v);
    db.run('UPDATE threads SET upvotes = upvotes + ? WHERE id = ?', v - prev, String(req.params.id));
  });
  const t = db.one<Row>('SELECT * FROM threads WHERE id = ?', String(req.params.id));
  if (!t) throw new HttpError(404, 'Thread not found');
  res.json({ thread: serializeThread(t, me) });
});

// ——— Lounges ———
export const loungeOnline = new Map<string, Set<string>>();

export function serializeLounge(l: Row, viewerId?: string | null) {
  const ids = [...(loungeOnline.get(l.id) ?? new Set<string>())];
  const recent = db.all<Row>(
    `SELECT DISTINCT author_id FROM messages WHERE room_type = 'lounge' AND room_id = ? ORDER BY created_at DESC LIMIT 12`, l.id,
  ).map((r) => r.author_id as string);
  const previewIds = [...new Set([...ids, ...recent])].slice(0, 5);
  const author = authorCache(viewerId);
  const active = new Set([...ids, ...recent.filter((id) => presence.isOnline(id))]);
  return {
    id: l.id, name: l.name, emoji: l.emoji, topic: l.topic, nowPlaying: l.now_playing, coverUrl: l.cover_url,
    onlineCount: active.size, memberPreview: previewIds.map(author), isLive: active.size > 0,
  };
}

socialRouter.get('/lounges', optionalAuth, (req, res) => {
  const rows = db.all<Row>('SELECT * FROM lounges ORDER BY position');
  res.json({ lounges: rows.map((l) => serializeLounge(l, req.userId)).sort((a, b) => b.onlineCount - a.onlineCount) });
});

socialRouter.get('/lounges/:id', optionalAuth, (req, res) => {
  const l = db.one<Row>('SELECT * FROM lounges WHERE id = ?', String(req.params.id));
  if (!l) throw new HttpError(404, 'Lounge not found');
  const author = authorCache(req.userId);
  const messages = db.all<Row>(`SELECT * FROM messages WHERE room_type = 'lounge' AND room_id = ? ORDER BY created_at DESC LIMIT 60`, l.id)
    .reverse().map((m) => serializeMessage(m, author));
  res.json({ lounge: serializeLounge(l, req.userId), messages });
});

export function insertLoungeMessage(loungeId: string, authorId: string, body: string, replyToId: string | null = null) {
  const id = newId('m');
  db.run(`INSERT INTO messages (id, room_type, room_id, author_id, body, reply_to_id, created_at) VALUES (?, 'lounge', ?, ?, ?, ?, ?)`, id, loungeId, authorId, body, replyToId, now());
  const msg = serializeMessage(db.one<Row>('SELECT * FROM messages WHERE id = ?', id)!);
  io()?.to(room.lounge(loungeId)).emit('lounge:message', msg);
  bus.emitEvent('lounge:sent', { loungeId, messageId: id, authorId });
  return msg;
}

// ——— Direct messages ———
function conversationFor(viewerId: string, c: Row) {
  const author = authorCache(viewerId);
  const members = db.all<Row>('SELECT user_id, last_read_at FROM conversation_members WHERE conversation_id = ?', c.id);
  const mine = members.find((m) => m.user_id === viewerId);
  const last = db.one<Row>(`SELECT * FROM messages WHERE room_type = 'dm' AND room_id = ? ORDER BY created_at DESC LIMIT 1`, c.id);
  const unread = db.one<Row>(
    `SELECT COUNT(*) n FROM messages WHERE room_type = 'dm' AND room_id = ? AND author_id != ? AND created_at > ?`, c.id, viewerId, mine?.last_read_at ?? '')!.n;
  return {
    id: c.id,
    members: members.filter((m) => m.user_id !== viewerId).map((m) => author(m.user_id)),
    lastMessage: last ? serializeMessage(last, author) : null,
    unread,
    updatedAt: c.updated_at,
  };
}

socialRouter.get('/conversations', requireAuth, (req, res) => {
  const me = uid(req);
  const rows = db.all<Row>(
    'SELECT c.* FROM conversations c JOIN conversation_members m ON m.conversation_id = c.id WHERE m.user_id = ? ORDER BY c.updated_at DESC LIMIT 100', me);
  res.json({ conversations: rows.map((c) => conversationFor(me, c)) });
});

export function getOrCreateDm(a: string, b: string) {
  const existing = db.one<Row>(
    `SELECT c.* FROM conversations c
     WHERE (SELECT COUNT(*) FROM conversation_members WHERE conversation_id = c.id) = 2
       AND EXISTS (SELECT 1 FROM conversation_members WHERE conversation_id = c.id AND user_id = ?)
       AND EXISTS (SELECT 1 FROM conversation_members WHERE conversation_id = c.id AND user_id = ?)`, a, b);
  if (existing) return existing;
  const id = newId('dm');
  const t = now();
  db.tx(() => {
    db.run('INSERT INTO conversations VALUES (?, ?)', id, t);
    db.run('INSERT INTO conversation_members VALUES (?, ?, ?)', id, a, t);
    db.run('INSERT INTO conversation_members VALUES (?, ?, ?)', id, b, t);
  });
  return db.one<Row>('SELECT * FROM conversations WHERE id = ?', id)!;
}

socialRouter.post('/conversations', requireAuth, (req, res) => {
  const me = uid(req);
  const { userId } = parse(z.object({ userId: z.string() }), req.body);
  const other = db.one<Row>('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL', userId);
  if (!other || other.id === me) throw new HttpError(404, 'User not found');
  if (db.one('SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)', me, userId, userId, me)) {
    throw new HttpError(403, "You can't message this person");
  }
  const s = { ...DEFAULT_SETTINGS, ...json(other.settings, {}) };
  const followsMe = db.one('SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?', other.id, me);
  if (s.dmFrom === 'nobody' || (s.dmFrom === 'following' && !followsMe)) throw new HttpError(403, `@${other.handle} isn't taking new DMs right now`);
  res.json({ conversation: conversationFor(me, getOrCreateDm(me, other.id)) });
});

function assertMember(convId: string, userId: string) {
  if (!db.one('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?', convId, userId)) throw new HttpError(404, 'Conversation not found');
}

socialRouter.get('/conversations/:id/messages', requireAuth, (req, res) => {
  const me = uid(req);
  assertMember(String(req.params.id), me);
  const before = typeof req.query.before === 'string' ? req.query.before : '9999';
  const author = authorCache(me);
  const messages = db.all<Row>(`SELECT * FROM messages WHERE room_type = 'dm' AND room_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT 50`, String(req.params.id), before)
    .reverse().map((m) => serializeMessage(m, author));
  db.run('UPDATE conversation_members SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?', now(), String(req.params.id), me);
  res.json({ messages, conversation: conversationFor(me, db.one<Row>('SELECT * FROM conversations WHERE id = ?', String(req.params.id))!) });
});

export function insertDm(convId: string, authorId: string, body: string, kind = 'text', mediaUrl: string | null = null) {
  const id = newId('m');
  const t = now();
  db.run(`INSERT INTO messages (id, room_type, room_id, author_id, body, media_url, kind, created_at) VALUES (?, 'dm', ?, ?, ?, ?, ?, ?)`, id, convId, authorId, body, mediaUrl, kind, t);
  db.run('UPDATE conversations SET updated_at = ? WHERE id = ?', t, convId);
  db.run('UPDATE conversation_members SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?', t, convId, authorId);
  const msg = serializeMessage(db.one<Row>('SELECT * FROM messages WHERE id = ?', id)!);
  const others = db.all<Row>('SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id != ?', convId, authorId);
  for (const o of others) {
    io()?.to(room.user(o.user_id)).emit('dm:message', msg);
    notify(o.user_id, { kind: 'dm', actorId: authorId, link: `/messages/${convId}`, title: msg.author.displayName, body: kind === 'image' ? '📷 Photo' : body.slice(0, 140) });
  }
  io()?.to(room.user(authorId)).emit('dm:message', msg);
  bus.emitEvent('dm:sent', { conversationId: convId, messageId: id, authorId });
  return msg;
}

socialRouter.post('/conversations/:id/messages', requireAuth, (req, res) => {
  const me = uid(req);
  rateLimit(`dm:${me}`, 40);
  assertMember(String(req.params.id), me);
  const b = parse(z.object({ body: z.string().max(2000).default(''), mediaUrl: z.string().url().max(600).nullable().optional(), kind: z.enum(['text', 'image', 'voice']).default('text') }), req.body);
  if (!b.body.trim() && !b.mediaUrl) throw new HttpError(400, 'Empty message');
  assertClean(b.body);
  res.status(201).json({ message: insertDm(String(req.params.id), me, b.body, b.mediaUrl ? (b.kind === 'text' ? 'image' : b.kind) : 'text', b.mediaUrl ?? null) });
});

// ——— Notifications ———
socialRouter.get('/notifications', requireAuth, (req, res) => {
  const me = uid(req);
  const author = authorCache(me);
  const items = db.all<Row>('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 60', me).map((n) => serializeNotification(n, author));
  const unread = db.one<Row>('SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND read = 0', me)!.n;
  res.json({ items, unread });
});

socialRouter.post('/notifications/read', requireAuth, (req, res) => {
  db.run('UPDATE notifications SET read = 1 WHERE user_id = ?', uid(req));
  res.json({ ok: true });
});

// ——— Leaderboards ———
socialRouter.get('/leaderboard', optionalAuth, (req, res) => {
  const kind = req.query.kind === 'streak' ? 'streak' : req.query.kind === 'xp' ? 'xp' : 'vibe';
  let rows: Row[];
  if (kind === 'vibe') {
    rows = db.all<Row>(
      `SELECT u.*, SUM(r1 + 2*r2 + 3*r3 + 4*r4 + 5*r5) * 1.0 / MAX(1, SUM(r1+r2+r3+r4+r5)) AS score, SUM(r1+r2+r3+r4+r5) n
       FROM users u JOIN posts p ON p.author_id = u.id AND p.hidden = 0 WHERE u.deleted_at IS NULL
       GROUP BY u.id HAVING n >= 5 ORDER BY score DESC LIMIT 100`);
    rows.forEach((r) => (r.score = Math.round(((r.score - 1) / 4) * 100) / 10));
  } else {
    rows = db.all<Row>(`SELECT u.*, ${kind === 'xp' ? 'xp' : 'streak_days'} AS score FROM users u WHERE deleted_at IS NULL ORDER BY score DESC LIMIT 100`);
  }
  const author = authorCache(req.userId);
  res.json({ entries: rows.map((r, i) => ({ rank: i + 1, user: author(r.id), score: r.score })) });
});

export { userPublic };
