import { Router } from 'express';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { REWARDS } from '@chatlol/shared';
import { db, newId, now, json, type Row } from '../db';
import { optionalAuth, requireAuth, uid } from '../lib/auth';
import { HttpError, parse, rateLimit } from '../lib/http';
import {
  serializeThread, serializeReply, serializeMessage, serializeNotification, authorCache, userPublic, DEFAULT_SETTINGS, type AuthorFn,
} from '../lib/serialize';
import { grant, notify } from '../lib/rewards';
import { assertClean } from '../lib/moderation';
import { bus } from '../lib/events';
import { io, room } from '../lib/io';
import { presence } from '../lib/presence';
import { shared } from '../lib/shared';

export const socialRouter = Router();

// ——— Shouts / Forums ———
socialRouter.get('/shouts/boards', async (_req, res) => {
  const boards = await db.all<Row>('SELECT b.*, (SELECT COUNT(*) FROM threads t WHERE t.board_id = b.id) AS threads FROM boards b ORDER BY position');
  res.json({ boards: boards.map((b) => ({ id: b.id, name: b.name, emoji: b.emoji, threads: b.threads })) });
});

socialRouter.get('/shouts', optionalAuth, async (req, res) => {
  const p = parse(z.object({ board: z.string().optional(), sort: z.enum(['hot', 'new', 'top']).default('hot'), cursor: z.coerce.number().optional() }), req.query);
  const offset = p.cursor ?? 0;
  const where = p.board ? 'WHERE board_id = ?' : '';
  const args = p.board ? [p.board] : [];
  let rows: Row[];
  if (p.sort === 'hot') {
    // Hot = (votes + 2×replies) decayed by hours since last activity; scored in JS over recent candidates.
    const cand = await db.all<Row>(`SELECT * FROM threads ${where} ORDER BY last_activity_at DESC LIMIT 300`, ...args);
    const t = Date.now();
    const hot = (r: Row) => (r.pinned ? 1e9 : 0) + (r.upvotes + r.reply_count * 2 + 1) / ((t - Date.parse(r.last_activity_at)) / 3_600_000 + 2);
    rows = cand.sort((a, b) => hot(b) - hot(a)).slice(offset, offset + 21);
  } else {
    rows = await db.all<Row>(`SELECT * FROM threads ${where} ORDER BY ${p.sort === 'new' ? 'pinned DESC, created_at DESC' : 'upvotes DESC'} LIMIT 21 OFFSET ?`, ...args, offset);
  }
  const author = authorCache(req.userId);
  res.json({ items: await Promise.all(rows.slice(0, 20).map((r) => serializeThread(r, req.userId, author))), nextCursor: rows.length > 20 ? String(offset + 20) : null });
});

socialRouter.get('/shouts/:id', optionalAuth, async (req, res) => {
  const t = await db.one<Row>('SELECT * FROM threads WHERE id = ?', String(req.params.id));
  if (!t) throw new HttpError(404, 'Thread not found');
  const author = authorCache(req.userId);
  const replies = await db.all<Row>('SELECT * FROM replies WHERE thread_id = ? ORDER BY created_at ASC LIMIT 300', t.id);
  res.json({ thread: await serializeThread(t, req.userId, author), replies: await Promise.all(replies.map((r) => serializeReply(r, author))) });
});

export async function insertThread(authorId: string, board: string, title: string, body: string) {
  if (!(await db.one('SELECT 1 AS x FROM boards WHERE id = ?', board))) throw new HttpError(404, 'Board not found');
  const id = newId('t');
  const t = now();
  await db.run('INSERT INTO threads (id, board_id, author_id, title, body, last_activity_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', id, board, authorId, title, body, t, t);
  bus.emitEvent('thread:created', { threadId: id, authorId });
  return (await db.one<Row>('SELECT * FROM threads WHERE id = ?', id))!;
}

export async function insertReply(threadId: string, authorId: string, body: string) {
  const t = await db.one<Row>('SELECT * FROM threads WHERE id = ?', threadId);
  if (!t) throw new HttpError(404, 'Thread not found');
  const id = newId('r');
  await db.run('INSERT INTO replies (id, thread_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)', id, threadId, authorId, body, now());
  await db.run('UPDATE threads SET reply_count = reply_count + 1, last_activity_at = ? WHERE id = ?', now(), threadId);
  if (t.author_id !== authorId) {
    const a = (await db.one<Row>('SELECT display_name FROM users WHERE id = ?', authorId))!;
    await notify(t.author_id, { kind: 'comment', actorId: authorId, link: `/shouts/${threadId}`, title: `${a.display_name} replied to your shout`, body: body.slice(0, 120) });
  }
  bus.emitEvent('thread:replied', { threadId, replyId: id, authorId });
  return (await db.one<Row>('SELECT * FROM replies WHERE id = ?', id))!;
}

socialRouter.post('/shouts', requireAuth, async (req, res) => {
  const me = uid(req);
  await rateLimit(`thread:${me}`, 3);
  const b = parse(z.object({ board: z.string(), title: z.string().trim().min(4).max(120), body: z.string().trim().min(1).max(4000) }), req.body);
  assertClean(`${b.title} ${b.body}`);
  const row = await insertThread(me, b.board, b.title, b.body);
  const reward = await grant(me, REWARDS.post.sparks, REWARDS.post.xp, 'Started a shout 📣');
  res.status(201).json({ thread: await serializeThread(row, me), reward });
});

socialRouter.post('/shouts/:id/replies', requireAuth, async (req, res) => {
  const me = uid(req);
  await rateLimit(`reply:${me}`, 20);
  const { body } = parse(z.object({ body: z.string().trim().min(1).max(2000) }), req.body);
  assertClean(body);
  const row = await insertReply(String(req.params.id), me, body);
  await grant(me, REWARDS.comment.sparks, REWARDS.comment.xp, 'Replied to a shout');
  res.status(201).json({ reply: await serializeReply(row) });
});

socialRouter.post('/shouts/:id/vote', requireAuth, async (req, res) => {
  const me = uid(req);
  const threadId = String(req.params.id);
  const { v } = parse(z.object({ v: z.union([z.literal(1), z.literal(-1), z.literal(0)]) }), req.body);
  if (!(await db.one('SELECT 1 AS x FROM threads WHERE id = ?', threadId))) throw new HttpError(404, 'Thread not found');
  await db.tx(async () => {
    const prev = (await db.one<Row>('SELECT v FROM thread_votes WHERE thread_id = ? AND user_id = ?', threadId, me))?.v ?? 0;
    if (v === 0) await db.run('DELETE FROM thread_votes WHERE thread_id = ? AND user_id = ?', threadId, me);
    else await db.run('INSERT INTO thread_votes (thread_id, user_id, v) VALUES (?, ?, ?) ON CONFLICT (thread_id, user_id) DO UPDATE SET v = excluded.v', threadId, me, v);
    await db.run('UPDATE threads SET upvotes = upvotes + ? WHERE id = ?', v - prev, threadId);
  });
  res.json({ thread: await serializeThread((await db.one<Row>('SELECT * FROM threads WHERE id = ?', threadId))!, me) });
});

// ——— Lounges ———
export const loungeKey = (id: string) => `lounge:online:${id}`;

export async function serializeLounge(l: Row, author: AuthorFn) {
  const ids = await shared().smembers(loungeKey(l.id));
  const recent = (await db.all<Row>(
    `SELECT author_id, MAX(created_at) AS last FROM messages WHERE room_type = 'lounge' AND room_id = ? GROUP BY author_id ORDER BY last DESC LIMIT 12`, l.id,
  )).map((r) => r.author_id as string);
  const recentOnline = (await Promise.all(recent.map(async (id) => ((await presence.isOnline(id)) ? id : null)))).filter(Boolean) as string[];
  const previewIds = [...new Set([...ids, ...recent])].slice(0, 5);
  const active = new Set([...ids, ...recentOnline]);
  return {
    id: l.id, name: l.name, emoji: l.emoji, topic: l.topic, nowPlaying: l.now_playing, coverUrl: l.cover_url,
    onlineCount: active.size, memberPreview: await Promise.all(previewIds.map(author)), isLive: active.size > 0,
  };
}

socialRouter.get('/lounges', optionalAuth, async (req, res) => {
  const author = authorCache(req.userId);
  const lounges = await Promise.all((await db.all<Row>('SELECT * FROM lounges ORDER BY position')).map((l) => serializeLounge(l, author)));
  res.json({ lounges: lounges.sort((a, b) => b.onlineCount - a.onlineCount) });
});

socialRouter.get('/lounges/:id', optionalAuth, async (req, res) => {
  const l = await db.one<Row>('SELECT * FROM lounges WHERE id = ?', String(req.params.id));
  if (!l) throw new HttpError(404, 'Lounge not found');
  const author = authorCache(req.userId);
  const rows = (await db.all<Row>(`SELECT * FROM messages WHERE room_type = 'lounge' AND room_id = ? ORDER BY created_at DESC LIMIT 60`, l.id)).reverse();
  res.json({ lounge: await serializeLounge(l, author), messages: await Promise.all(rows.map((m) => serializeMessage(m, author))) });
});

export async function insertLoungeMessage(loungeId: string, authorId: string, body: string, replyToId: string | null = null) {
  const id = newId('m');
  await db.run(`INSERT INTO messages (id, room_type, room_id, author_id, body, reply_to_id, created_at) VALUES (?, 'lounge', ?, ?, ?, ?, ?)`, id, loungeId, authorId, body, replyToId, now());
  const msg = await serializeMessage((await db.one<Row>('SELECT * FROM messages WHERE id = ?', id))!);
  io()?.to(room.lounge(loungeId)).emit('lounge:message', msg);
  bus.emitEvent('lounge:sent', { loungeId, messageId: id, authorId });
  return msg;
}

// ——— Direct messages ———
async function conversationFor(viewerId: string, c: Row) {
  const author = authorCache(viewerId);
  const members = await db.all<Row>('SELECT user_id, last_read_at FROM conversation_members WHERE conversation_id = ?', c.id);
  const mine = members.find((m) => m.user_id === viewerId);
  const last = await db.one<Row>(`SELECT * FROM messages WHERE room_type = 'dm' AND room_id = ? ORDER BY created_at DESC LIMIT 1`, c.id);
  const unread = (await db.one<Row>(
    `SELECT COUNT(*) AS n FROM messages WHERE room_type = 'dm' AND room_id = ? AND author_id != ? AND created_at > ?`, c.id, viewerId, mine?.last_read_at ?? ''))!.n;
  return {
    id: c.id,
    members: await Promise.all(members.filter((m) => m.user_id !== viewerId).map((m) => author(m.user_id))),
    lastMessage: last ? await serializeMessage(last, author) : null,
    unread,
    updatedAt: c.updated_at,
  };
}

socialRouter.get('/conversations', requireAuth, async (req, res) => {
  const me = uid(req);
  const rows = await db.all<Row>(
    'SELECT c.* FROM conversations c JOIN conversation_members m ON m.conversation_id = c.id WHERE m.user_id = ? ORDER BY c.updated_at DESC LIMIT 100', me);
  res.json({ conversations: await Promise.all(rows.map((c) => conversationFor(me, c))) });
});

/** 1:1 conversations get a deterministic id, so two simultaneous "message" taps can't create duplicates. */
export async function getOrCreateDm(a: string, b: string) {
  const existing = await db.one<Row>(
    `SELECT c.* FROM conversations c
     WHERE (SELECT COUNT(*) FROM conversation_members WHERE conversation_id = c.id) = 2
       AND EXISTS (SELECT 1 FROM conversation_members WHERE conversation_id = c.id AND user_id = ?)
       AND EXISTS (SELECT 1 FROM conversation_members WHERE conversation_id = c.id AND user_id = ?)`, a, b);
  if (existing) return existing;
  const id = `dm_${createHash('sha1').update([a, b].sort().join('|')).digest('hex').slice(0, 24)}`;
  const t = now();
  await db.tx(async () => {
    await db.run('INSERT INTO conversations (id, updated_at) VALUES (?, ?) ON CONFLICT DO NOTHING', id, t);
    await db.run('INSERT INTO conversation_members (conversation_id, user_id, last_read_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING', id, a, t);
    await db.run('INSERT INTO conversation_members (conversation_id, user_id, last_read_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING', id, b, t);
  });
  return (await db.one<Row>('SELECT * FROM conversations WHERE id = ?', id))!;
}

socialRouter.post('/conversations', requireAuth, async (req, res) => {
  const me = uid(req);
  const { userId } = parse(z.object({ userId: z.string() }), req.body);
  const other = await db.one<Row>('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL', userId);
  if (!other || other.id === me) throw new HttpError(404, 'User not found');
  if (await db.one('SELECT 1 AS x FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)', me, userId, userId, me)) {
    throw new HttpError(403, "You can't message this person");
  }
  const s = { ...DEFAULT_SETTINGS, ...json(other.settings, {}) };
  const followsMe = await db.one('SELECT 1 AS x FROM follows WHERE follower_id = ? AND followee_id = ?', other.id, me);
  if (s.dmFrom === 'nobody' || (s.dmFrom === 'following' && !followsMe)) throw new HttpError(403, `@${other.handle} isn't taking new DMs right now`);
  res.json({ conversation: await conversationFor(me, await getOrCreateDm(me, other.id)) });
});

async function assertMember(convId: string, userId: string) {
  if (!(await db.one('SELECT 1 AS x FROM conversation_members WHERE conversation_id = ? AND user_id = ?', convId, userId))) throw new HttpError(404, 'Conversation not found');
}

socialRouter.get('/conversations/:id/messages', requireAuth, async (req, res) => {
  const me = uid(req);
  const convId = String(req.params.id);
  await assertMember(convId, me);
  const before = typeof req.query.before === 'string' ? req.query.before : '9999';
  const author = authorCache(me);
  const rows = (await db.all<Row>(`SELECT * FROM messages WHERE room_type = 'dm' AND room_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT 50`, convId, before)).reverse();
  await db.run('UPDATE conversation_members SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?', now(), convId, me);
  res.json({ messages: await Promise.all(rows.map((m) => serializeMessage(m, author))), conversation: await conversationFor(me, (await db.one<Row>('SELECT * FROM conversations WHERE id = ?', convId))!) });
});

export async function insertDm(convId: string, authorId: string, body: string, kind = 'text', mediaUrl: string | null = null) {
  const id = newId('m');
  const t = now();
  await db.run(`INSERT INTO messages (id, room_type, room_id, author_id, body, media_url, kind, created_at) VALUES (?, 'dm', ?, ?, ?, ?, ?, ?)`, id, convId, authorId, body, mediaUrl, kind, t);
  await db.run('UPDATE conversations SET updated_at = ? WHERE id = ?', t, convId);
  await db.run('UPDATE conversation_members SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?', t, convId, authorId);
  const msg = await serializeMessage((await db.one<Row>('SELECT * FROM messages WHERE id = ?', id))!);
  for (const o of await db.all<Row>('SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id != ?', convId, authorId)) {
    io()?.to(room.user(o.user_id)).emit('dm:message', msg);
    await notify(o.user_id, { kind: 'dm', actorId: authorId, link: `/messages/${convId}`, title: msg.author.displayName, body: kind === 'image' ? '📷 Photo' : body.slice(0, 140) });
  }
  io()?.to(room.user(authorId)).emit('dm:message', msg);
  bus.emitEvent('dm:sent', { conversationId: convId, messageId: id, authorId });
  return msg;
}

socialRouter.post('/conversations/:id/messages', requireAuth, async (req, res) => {
  const me = uid(req);
  const convId = String(req.params.id);
  await rateLimit(`dm:${me}`, 40);
  await assertMember(convId, me);
  const b = parse(z.object({ body: z.string().max(2000).default(''), mediaUrl: z.string().url().max(600).nullable().optional(), kind: z.enum(['text', 'image', 'voice']).default('text') }), req.body);
  if (!b.body.trim() && !b.mediaUrl) throw new HttpError(400, 'Empty message');
  assertClean(b.body);
  res.status(201).json({ message: await insertDm(convId, me, b.body, b.mediaUrl ? (b.kind === 'text' ? 'image' : b.kind) : 'text', b.mediaUrl ?? null) });
});

// ——— Notifications ———
socialRouter.get('/notifications', requireAuth, async (req, res) => {
  const me = uid(req);
  const author = authorCache(me);
  const rows = await db.all<Row>('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 60', me);
  const unread = (await db.one<Row>('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0', me))!.n;
  res.json({ items: await Promise.all(rows.map((n) => serializeNotification(n, author))), unread });
});

socialRouter.post('/notifications/read', requireAuth, async (req, res) => {
  await db.run('UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0', uid(req));
  res.json({ ok: true });
});

// ——— Leaderboards ———
socialRouter.get('/leaderboard', optionalAuth, async (req, res) => {
  const kind = req.query.kind === 'streak' ? 'streak' : req.query.kind === 'xp' ? 'xp' : 'vibe';
  let rows: Row[];
  if (kind === 'vibe') {
    rows = await db.all<Row>(
      `SELECT * FROM (
         SELECT p.author_id AS id, SUM(r1 + 2*r2 + 3*r3 + 4*r4 + 5*r5) * 1.0 / SUM(r1+r2+r3+r4+r5) AS score
         FROM posts p JOIN users u ON u.id = p.author_id
         WHERE p.hidden = 0 AND u.deleted_at IS NULL
         GROUP BY p.author_id HAVING SUM(r1+r2+r3+r4+r5) >= 5
       ) t ORDER BY score DESC LIMIT 100`);
    rows.forEach((r) => (r.score = Math.round(((r.score - 1) / 4) * 100) / 10));
  } else {
    rows = await db.all<Row>(`SELECT id, ${kind === 'xp' ? 'xp' : 'streak_days'} AS score FROM users WHERE deleted_at IS NULL ORDER BY score DESC LIMIT 100`);
  }
  const author = authorCache(req.userId);
  res.json({ entries: await Promise.all(rows.map(async (r, i) => ({ rank: i + 1, user: await author(r.id), score: r.score }))) });
});

export { userPublic };
