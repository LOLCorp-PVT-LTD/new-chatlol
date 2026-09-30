import { Router } from 'express';
import { z } from 'zod';
import { db, now, type Row } from '../db';
import { optionalAuth, requireAuth, uid } from '../lib/auth';
import { HttpError, parse } from '../lib/http';
import { userPublic, serializePost, authorCache, invalidateStats, DEFAULT_SETTINGS } from '../lib/serialize';
import { notify } from '../lib/rewards';
import { presence } from '../lib/presence';
import { json, newId } from '../db';

export const usersRouter = Router();

usersRouter.get('/users', optionalAuth, (req, res) => {
  const p = parse(
    z.object({ q: z.string().max(60).optional(), interest: z.string().max(30).optional(), online: z.coerce.number().optional(), sort: z.enum(['vibe', 'new', 'level', 'streak']).optional(), cursor: z.coerce.number().optional() }),
    req.query,
  );
  const where = ['deleted_at IS NULL'];
  const args: (string | number)[] = [];
  if (p.q) { where.push('(handle LIKE ? OR display_name LIKE ? OR city LIKE ?)'); args.push(`%${p.q}%`, `%${p.q}%`, `%${p.q}%`); }
  if (p.interest) { where.push('interests LIKE ?'); args.push(`%"${p.interest}"%`); }
  if (req.userId) { where.push('id != ?', 'id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = ?)'); args.push(req.userId, req.userId); }
  const viewer = req.userId ? db.one<Row>('SELECT settings FROM users WHERE id = ?', req.userId) : null;
  if (viewer && !{ ...DEFAULT_SETTINGS, ...json(viewer.settings, {}) }.showAIPersonas) where.push('is_ai = 0');
  const order = { vibe: 'xp DESC', new: 'created_at DESC', level: 'xp DESC', streak: 'streak_days DESC' }[p.sort ?? 'vibe'];
  const offset = p.cursor ?? 0;
  let rows = db.all<Row>(`SELECT * FROM users WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT 200 OFFSET ?`, ...args, offset);
  if (p.online) rows = rows.filter((r) => presence.isOnline(r.id));
  const page = rows.slice(0, 24);
  const items = page.map((r) => userPublic(r, req.userId));
  if (p.sort === 'vibe' || !p.sort) items.sort((a, b) => b.vibeAvg - a.vibeAvg || b.xp - a.xp);
  res.json({ items, nextCursor: rows.length > 24 && !p.online ? String(offset + 24) : null });
});

usersRouter.get('/users/:handle', optionalAuth, (req, res) => {
  const row = db.one<Row>('SELECT * FROM users WHERE handle = ? AND deleted_at IS NULL', String(req.params.handle));
  if (!row) throw new HttpError(404, 'No one here by that name');
  const author = authorCache(req.userId);
  const posts = db.all<Row>('SELECT * FROM posts WHERE author_id = ? AND hidden = 0 ORDER BY created_at DESC LIMIT 30', row.id)
    .map((p) => serializePost(p, req.userId, author));
  res.json({ user: userPublic(row, req.userId), posts });
});

usersRouter.post('/users/:id/follow', requireAuth, (req, res) => {
  const me = uid(req);
  const target = db.one<Row>('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL', String(req.params.id));
  if (!target || target.id === me) throw new HttpError(404, 'User not found');
  const existing = db.one('SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?', me, target.id);
  if (existing) db.run('DELETE FROM follows WHERE follower_id = ? AND followee_id = ?', me, target.id);
  else {
    db.run('INSERT INTO follows VALUES (?, ?, ?)', me, target.id, now());
    const meRow = db.one<Row>('SELECT handle FROM users WHERE id = ?', me)!;
    const mutual = db.one('SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?', target.id, me);
    notify(target.id, {
      kind: 'follow', actorId: me, link: `/u/${meRow.handle}`,
      title: mutual ? `You and @${meRow.handle} are now friends 🤝` : `@${meRow.handle} started following you`,
      body: mutual ? 'Say hi in DMs!' : 'Follow back to become friends.',
    });
  }
  invalidateStats(me);
  invalidateStats(target.id);
  res.json({ following: !existing });
});

usersRouter.post('/users/:id/block', requireAuth, (req, res) => {
  const me = uid(req);
  if (String(req.params.id) === me) throw new HttpError(400, "You can't block yourself");
  db.run('INSERT OR IGNORE INTO blocks VALUES (?, ?)', me, String(req.params.id));
  db.run('DELETE FROM follows WHERE (follower_id = ? AND followee_id = ?) OR (follower_id = ? AND followee_id = ?)', me, String(req.params.id), String(req.params.id), me);
  res.json({ ok: true });
});

usersRouter.post('/reports', requireAuth, (req, res) => {
  const b = parse(z.object({ targetType: z.enum(['post', 'user', 'comment', 'message', 'thread', 'stream']), targetId: z.string().max(64), reason: z.string().min(1).max(500) }), req.body);
  db.run('INSERT INTO reports VALUES (?, ?, ?, ?, ?, ?)', newId('rep'), uid(req), b.targetType, b.targetId, b.reason, now());
  // Auto-hide posts that collect several distinct reports until a human reviews them.
  if (b.targetType === 'post') {
    const n = db.one<Row>(`SELECT COUNT(DISTINCT reporter_id) n FROM reports WHERE target_type = 'post' AND target_id = ?`, b.targetId)!.n;
    if (n >= 3) db.run('UPDATE posts SET hidden = 1 WHERE id = ?', b.targetId);
  }
  res.json({ ok: true });
});
