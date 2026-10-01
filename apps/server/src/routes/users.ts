import { Router } from 'express';
import { z } from 'zod';
import { db, now, json, newId, type Row } from '../db';
import { optionalAuth, requireAuth, uid } from '../lib/auth';
import { HttpError, parse } from '../lib/http';
import { userPublic, serializePosts, invalidateStats, DEFAULT_SETTINGS } from '../lib/serialize';
import { notify } from '../lib/rewards';
import { presence } from '../lib/presence';

export const usersRouter = Router();

usersRouter.get('/users', optionalAuth, async (req, res) => {
  const p = parse(
    z.object({ q: z.string().max(60).optional(), interest: z.string().max(30).optional(), online: z.coerce.number().optional(), sort: z.enum(['vibe', 'new', 'level', 'streak']).optional(), cursor: z.coerce.number().optional() }),
    req.query,
  );
  const where = ['deleted_at IS NULL'];
  const args: (string | number)[] = [];
  if (p.q) {
    where.push('(LOWER(handle) LIKE ? OR LOWER(display_name) LIKE ? OR LOWER(city) LIKE ?)');
    const like = `%${p.q.toLowerCase()}%`;
    args.push(like, like, like);
  }
  if (p.interest) { where.push('interests LIKE ?'); args.push(`%"${p.interest}"%`); }
  if (req.userId) { where.push('id != ?', 'id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = ?)'); args.push(req.userId, req.userId); }
  const viewer = req.userId ? await db.one<Row>('SELECT settings FROM users WHERE id = ?', req.userId) : null;
  if (viewer && !{ ...DEFAULT_SETTINGS, ...json(viewer.settings, {}) }.showAIPersonas) where.push('is_ai = 0');
  const order = { vibe: 'xp DESC', new: 'created_at DESC', level: 'xp DESC', streak: 'streak_days DESC' }[p.sort ?? 'vibe'];
  const offset = p.cursor ?? 0;
  let rows = await db.all<Row>(`SELECT * FROM users WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT 200 OFFSET ?`, ...args, offset);
  if (p.online) {
    const flags = await Promise.all(rows.map((r) => presence.isOnline(r.id)));
    rows = rows.filter((_, i) => flags[i]);
  }
  const items = await Promise.all(rows.slice(0, 24).map((r) => userPublic(r, req.userId)));
  if (p.sort === 'vibe' || !p.sort) items.sort((a, b) => b.vibeAvg - a.vibeAvg || b.xp - a.xp);
  res.json({ items, nextCursor: rows.length > 24 && !p.online ? String(offset + 24) : null });
});

usersRouter.get('/users/:handle', optionalAuth, async (req, res) => {
  const row = await db.one<Row>('SELECT * FROM users WHERE LOWER(handle) = LOWER(?) AND deleted_at IS NULL', String(req.params.handle));
  if (!row) throw new HttpError(404, 'No one here by that name');
  const posts = await db.all<Row>('SELECT * FROM posts WHERE author_id = ? AND hidden = 0 ORDER BY created_at DESC LIMIT 30', row.id);
  res.json({ user: await userPublic(row, req.userId), posts: await serializePosts(posts, req.userId) });
});

usersRouter.post('/users/:id/follow', requireAuth, async (req, res) => {
  const me = uid(req);
  const target = await db.one<Row>('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL', String(req.params.id));
  if (!target || target.id === me) throw new HttpError(404, 'User not found');
  const existing = await db.one('SELECT 1 AS x FROM follows WHERE follower_id = ? AND followee_id = ?', me, target.id);
  if (existing) await db.run('DELETE FROM follows WHERE follower_id = ? AND followee_id = ?', me, target.id);
  else {
    await db.run('INSERT INTO follows (follower_id, followee_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING', me, target.id, now());
    const meRow = (await db.one<Row>('SELECT handle FROM users WHERE id = ?', me))!;
    const mutual = await db.one('SELECT 1 AS x FROM follows WHERE follower_id = ? AND followee_id = ?', target.id, me);
    await notify(target.id, {
      kind: 'follow', actorId: me, link: `/u/${meRow.handle}`,
      title: mutual ? `You and @${meRow.handle} are now friends 🤝` : `@${meRow.handle} started following you`,
      body: mutual ? 'Say hi in DMs!' : 'Follow back to become friends.',
    });
  }
  invalidateStats(me);
  invalidateStats(target.id);
  res.json({ following: !existing });
});

usersRouter.post('/users/:id/block', requireAuth, async (req, res) => {
  const me = uid(req);
  const other = String(req.params.id);
  if (other === me) throw new HttpError(400, "You can't block yourself");
  await db.run('INSERT INTO blocks (blocker_id, blocked_id) VALUES (?, ?) ON CONFLICT DO NOTHING', me, other);
  await db.run('DELETE FROM follows WHERE (follower_id = ? AND followee_id = ?) OR (follower_id = ? AND followee_id = ?)', me, other, other, me);
  res.json({ ok: true });
});

usersRouter.post('/reports', requireAuth, async (req, res) => {
  const b = parse(z.object({ targetType: z.enum(['post', 'user', 'comment', 'message', 'thread', 'stream']), targetId: z.string().max(64), reason: z.string().min(1).max(500) }), req.body);
  await db.run('INSERT INTO reports (id, reporter_id, target_type, target_id, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)', newId('rep'), uid(req), b.targetType, b.targetId, b.reason, now());
  // Auto-hide posts that collect several distinct reports until a human reviews them.
  if (b.targetType === 'post') {
    const n = (await db.one<Row>(`SELECT COUNT(DISTINCT reporter_id) AS n FROM reports WHERE target_type = 'post' AND target_id = ?`, b.targetId))!.n;
    if (n >= 3) await db.run('UPDATE posts SET hidden = 1 WHERE id = ?', b.targetId);
  }
  res.json({ ok: true });
});
