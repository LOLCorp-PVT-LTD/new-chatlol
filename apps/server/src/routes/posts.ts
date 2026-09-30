import { Router } from 'express';
import { z } from 'zod';
import type { VibeScore } from '@chatlol/shared';
import { REWARDS, summarizeRatings, tierByScore, comboMultiplier, ROULETTE_BASE_SPARKS, ROULETTE_BASE_XP } from '@chatlol/shared';
import { db, newId, now, type Row } from '../db';
import { optionalAuth, requireAuth, uid } from '../lib/auth';
import { HttpError, parse, rateLimit } from '../lib/http';
import { serializePost, serializeComment, authorCache, invalidateStats, userPublic } from '../lib/serialize';
import { grant, notify, progressRatingQuest, recordDropStreak, ticker } from '../lib/rewards';
import { assertClean } from '../lib/moderation';
import { bus } from '../lib/events';
import { io, room } from '../lib/io';
import { ensureDrop } from '../lib/drops';

export const postsRouter = Router();

const PAGE = 12;
const extractTags = (s: string) => [...new Set((s.match(/#[\p{L}\p{N}_]{2,30}/gu) ?? []).map((t) => t.slice(1).toLowerCase()))].slice(0, 8);

function blockedClause(viewerId?: string) {
  return viewerId
    ? { sql: ' AND p.author_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = ?) AND p.author_id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id = ?)', args: [viewerId, viewerId] }
    : { sql: '', args: [] as string[] };
}

postsRouter.get('/feed', optionalAuth, (req, res) => {
  const p = parse(z.object({ tab: z.enum(['foryou', 'following', 'top']).default('foryou'), cursor: z.string().optional(), tag: z.string().max(40).optional() }), req.query);
  const viewer = req.userId;
  const bl = blockedClause(viewer);
  const cursor = p.cursor ?? '9999';
  let rows: Row[];
  const tagSql = p.tag ? ' AND p.tags LIKE ?' : '';
  const tagArgs = p.tag ? [`%"${p.tag.toLowerCase()}"%`] : [];
  if (p.tab === 'following' && viewer) {
    rows = db.all<Row>(
      `SELECT p.* FROM posts p WHERE p.hidden = 0 AND p.created_at < ? AND (p.author_id IN (SELECT followee_id FROM follows WHERE follower_id = ?) OR p.author_id = ?)${bl.sql}${tagSql}
       ORDER BY p.created_at DESC LIMIT ?`, cursor, viewer, viewer, ...bl.args, ...tagArgs, PAGE + 1);
  } else if (p.tab === 'top') {
    const offset = Number(p.cursor ?? 0) || 0;
    rows = db.all<Row>(
      `SELECT p.*, (r1 + 2*r2 + 3*r3 + 4*r4 + 5*r5) * 1.0 / MAX(1, r1+r2+r3+r4+r5) AS avg, (r1+r2+r3+r4+r5) AS n
       FROM posts p WHERE p.hidden = 0 AND p.created_at > ?${bl.sql}${tagSql}
       ORDER BY (avg * (1 - 1.0 / (n + 2))) DESC, n DESC LIMIT ? OFFSET ?`,
      new Date(Date.now() - 2 * 86_400_000).toISOString(), ...bl.args, ...tagArgs, PAGE + 1, offset);
    const items = rows.slice(0, PAGE).map((r) => serializePost(r, viewer));
    return res.json({ items, nextCursor: rows.length > PAGE ? String(offset + PAGE) : null });
  } else {
    // "For You": recency blended with engagement and a boost for people you follow.
    const candidates = db.all<Row>(
      `SELECT p.*, (r1+r2+r3+r4+r5) AS n, (r4 + 2*r5) AS heat,
         ${viewer ? '(SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = p.author_id)' : '0'} AS followed
       FROM posts p WHERE p.hidden = 0 AND p.created_at < ?${bl.sql}${tagSql}
       ORDER BY p.created_at DESC LIMIT 80`,
      ...(viewer ? [viewer] : []), cursor, ...bl.args, ...tagArgs);
    const t = Date.now();
    const score = (r: Row) => {
      const ageH = (t - Date.parse(r.created_at)) / 3_600_000;
      return (1 + r.heat * 0.6 + r.n * 0.2 + r.comment_count * 0.8 + (r.followed ? 6 : 0)) / Math.pow(ageH + 2, 1.35);
    };
    const page = candidates.slice(0, PAGE * 2).sort((a, b) => score(b) - score(a)).slice(0, PAGE);
    const oldest = page.reduce((m, r) => (r.created_at < m ? r.created_at : m), cursor);
    const items = page.map((r) => serializePost(r, viewer));
    return res.json({ items, nextCursor: candidates.length > PAGE ? oldest : null });
  }
  const items = rows.slice(0, PAGE).map((r) => serializePost(r, viewer));
  res.json({ items, nextCursor: rows.length > PAGE ? rows[PAGE - 1].created_at : null });
});

postsRouter.get('/posts/:id', optionalAuth, (req, res) => {
  const row = db.one<Row>('SELECT * FROM posts WHERE id = ? AND hidden = 0', String(req.params.id));
  if (!row) throw new HttpError(404, 'That post vanished');
  const author = authorCache(req.userId);
  const comments = db.all<Row>('SELECT * FROM comments WHERE post_id = ? ORDER BY created_at ASC LIMIT 200', row.id).map((c) => serializeComment(c, author));
  res.json({ post: serializePost(row, req.userId, author), comments });
});

const createSchema = z.object({
  kind: z.enum(['photo', 'text', 'battle']).default('text'),
  body: z.string().max(1000).default(''),
  mediaUrl: z.string().url().max(600).nullable().optional(),
  tags: z.array(z.string().max(30)).max(8).optional(),
  battle: z.array(z.object({ label: z.string().min(1).max(60), mediaUrl: z.string().url().max(600).optional() })).min(2).max(4).optional(),
  soundtrack: z.string().max(80).nullable().optional(),
});

export function insertPost(authorId: string, b: z.infer<typeof createSchema> & { dropId?: string | null; kindOverride?: string }) {
  const id = newId('p');
  const kind = b.kindOverride ?? (b.battle ? 'battle' : b.mediaUrl ? 'photo' : b.kind);
  const tags = [...new Set([...(b.tags ?? []).map((t) => t.replace(/^#/, '').toLowerCase()), ...extractTags(b.body)])].slice(0, 8);
  db.tx(() => {
    db.run(
      'INSERT INTO posts (id, author_id, kind, body, media_url, tags, drop_id, soundtrack, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id, authorId, kind, b.body, b.mediaUrl ?? null, JSON.stringify(tags), b.dropId ?? null, b.soundtrack ?? null, now());
    b.battle?.forEach((o, i) => db.run('INSERT INTO battle_options VALUES (?, ?, ?, ?, 0, ?)', newId('bo'), id, o.label, o.mediaUrl ?? null, i));
  });
  const row = db.one<Row>('SELECT * FROM posts WHERE id = ?', id)!;
  io()?.to(room.global).emit('feed:new', serializePost(row, null));
  bus.emitEvent('post:created', { postId: id, authorId });
  return row;
}

postsRouter.post('/posts', requireAuth, (req, res) => {
  const me = uid(req);
  rateLimit(`post:${me}`, 6);
  const b = parse(createSchema, req.body);
  if (!b.body.trim() && !b.mediaUrl && !b.battle) throw new HttpError(400, 'Say something or add a photo');
  assertClean(b.body + ' ' + (b.battle?.map((o) => o.label).join(' ') ?? ''));
  const row = insertPost(me, b);
  const reward = grant(me, REWARDS.post.sparks, REWARDS.post.xp, 'Posted a vibe ✨');
  res.status(201).json({ post: serializePost(row, me), reward });
});

postsRouter.delete('/posts/:id', requireAuth, (req, res) => {
  const r = db.run('DELETE FROM posts WHERE id = ? AND author_id = ?', String(req.params.id), uid(req));
  if (!r.changes) throw new HttpError(404, 'Not your post');
  invalidateStats(uid(req));
  res.json({ ok: true });
});

/** Applies a rating; returns the previous community summary (for blind-consensus matching) and whether it was new. */
export function applyRating(postId: string, userId: string, score: VibeScore) {
  const post = db.one<Row>('SELECT * FROM posts WHERE id = ? AND hidden = 0', postId);
  if (!post) throw new HttpError(404, 'That post vanished');
  if (post.author_id === userId) throw new HttpError(400, "You can't rate your own vibe (nice try 😏)");
  const before = summarizeRatings([post.r1, post.r2, post.r3, post.r4, post.r5]);
  const prev = db.one<Row>('SELECT score FROM ratings WHERE post_id = ? AND user_id = ?', postId, userId);
  db.tx(() => {
    if (prev) {
      db.run(`UPDATE posts SET r${prev.score} = r${prev.score} - 1 WHERE id = ?`, postId);
      db.run('UPDATE ratings SET score = ?, created_at = ? WHERE post_id = ? AND user_id = ?', score, now(), postId, userId);
    } else {
      db.run('INSERT INTO ratings VALUES (?, ?, ?, ?)', postId, userId, score, now());
    }
    db.run(`UPDATE posts SET r${score} = r${score} + 1 WHERE id = ?`, postId);
  });
  invalidateStats(post.author_id);
  if (!prev && score >= 4) {
    const rater = db.one<Row>('SELECT * FROM users WHERE id = ?', userId)!;
    const t = tierByScore(score);
    notify(post.author_id, {
      kind: 'rating', actorId: userId, link: `/p/${postId}`,
      title: `${rater.display_name} rated your ${post.kind === 'drop' ? 'drop' : 'photo'} ${t.label} ${t.emoji}`,
      body: post.body ? `“${post.body.slice(0, 80)}”` : 'Your vibe is climbing.',
    });
    if (score === 5) {
      grant(post.author_id, REWARDS.receiveGodTier.sparks, REWARDS.receiveGodTier.xp, 'Someone crowned you God Tier 👑');
      ticker(`${rater.display_name} crowned @${db.one<Row>('SELECT handle FROM users WHERE id = ?', post.author_id)!.handle} God Tier 👑`, userId);
    }
  }
  return { before, isNew: !prev, post: db.one<Row>('SELECT * FROM posts WHERE id = ?', postId)! };
}

postsRouter.post('/posts/:id/rate', requireAuth, (req, res) => {
  const me = uid(req);
  rateLimit(`rate:${me}`, 90);
  const { score } = parse(z.object({ score: z.number().int().min(1).max(5) }), req.body);
  const r = applyRating(String(req.params.id), me, score as VibeScore);
  let reward = null;
  if (r.isNew) {
    reward = grant(me, REWARDS.rate.sparks, REWARDS.rate.xp, 'Rated a vibe');
    const quest = progressRatingQuest(me);
    if (quest) reward = { ...quest, sparks: quest.sparks + reward.sparks, xp: quest.xp + reward.xp };
  }
  res.json({ post: serializePost(r.post, me), reward });
});

postsRouter.post('/posts/:id/react', requireAuth, (req, res) => {
  const me = uid(req);
  const { kind } = parse(z.object({ kind: z.enum(['fire', 'heart', 'lol', 'wow', 'hundred']).nullable() }), req.body);
  const post = db.one<Row>('SELECT * FROM posts WHERE id = ?', String(req.params.id));
  if (!post) throw new HttpError(404, 'That post vanished');
  if (kind) db.run('INSERT OR REPLACE INTO reactions VALUES (?, ?, ?)', post.id, me, kind);
  else db.run('DELETE FROM reactions WHERE post_id = ? AND user_id = ?', post.id, me);
  res.json({ post: serializePost(post, me) });
});

postsRouter.post('/posts/:id/battle', requireAuth, (req, res) => {
  const me = uid(req);
  const { optionId } = parse(z.object({ optionId: z.string() }), req.body);
  const opt = db.one<Row>('SELECT * FROM battle_options WHERE id = ? AND post_id = ?', optionId, String(req.params.id));
  if (!opt) throw new HttpError(404, 'Option not found');
  const prev = db.one<Row>('SELECT option_id FROM battle_votes WHERE post_id = ? AND user_id = ?', String(req.params.id), me);
  db.tx(() => {
    if (prev) db.run('UPDATE battle_options SET votes = votes - 1 WHERE id = ?', prev.option_id);
    db.run('INSERT OR REPLACE INTO battle_votes VALUES (?, ?, ?)', String(req.params.id), me, optionId);
    db.run('UPDATE battle_options SET votes = votes + 1 WHERE id = ?', optionId);
  });
  if (!prev) grant(me, REWARDS.rate.sparks, REWARDS.rate.xp, 'Voted in a battle');
  res.json({ post: serializePost(db.one<Row>('SELECT * FROM posts WHERE id = ?', String(req.params.id))!, me) });
});

export function insertComment(postId: string, authorId: string, body: string) {
  const post = db.one<Row>('SELECT * FROM posts WHERE id = ? AND hidden = 0', postId);
  if (!post) throw new HttpError(404, 'That post vanished');
  const id = newId('c');
  db.run('INSERT INTO comments VALUES (?, ?, ?, ?, ?)', id, postId, authorId, body, now());
  db.run('UPDATE posts SET comment_count = comment_count + 1 WHERE id = ?', postId);
  if (post.author_id !== authorId) {
    const a = db.one<Row>('SELECT display_name FROM users WHERE id = ?', authorId)!;
    notify(post.author_id, { kind: 'comment', actorId: authorId, link: `/p/${postId}`, title: `${a.display_name} commented`, body: body.slice(0, 120) });
  }
  bus.emitEvent('comment:created', { postId, commentId: id, authorId });
  return db.one<Row>('SELECT * FROM comments WHERE id = ?', id)!;
}

postsRouter.post('/posts/:id/comments', requireAuth, (req, res) => {
  const me = uid(req);
  rateLimit(`comment:${me}`, 20);
  const { body } = parse(z.object({ body: z.string().trim().min(1).max(500) }), req.body);
  assertClean(body);
  const row = insertComment(String(req.params.id), me, body);
  const reward = grant(me, REWARDS.comment.sparks, REWARDS.comment.xp, 'Dropped a comment');
  res.status(201).json({ comment: serializeComment(row), reward });
});

postsRouter.get('/trending', optionalAuth, (req, res) => {
  const since = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const counts = new Map<string, number>();
  for (const r of db.all<Row>('SELECT tags, (r1+r2+r3+r4+r5+comment_count) AS e FROM posts WHERE hidden = 0 AND created_at > ?', since)) {
    for (const t of JSON.parse(r.tags) as string[]) counts.set(t, (counts.get(t) ?? 0) + 1 + r.e);
  }
  const tags = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([tag, count]) => ({ tag, count: count * 37 }));
  const top = db.all<Row>(
    `SELECT u.*, SUM(r1 + 2*r2 + 3*r3 + 4*r4 + 5*r5) * 1.0 / MAX(1, SUM(r1+r2+r3+r4+r5)) AS avg, SUM(r1+r2+r3+r4+r5) AS n
     FROM posts p JOIN users u ON u.id = p.author_id WHERE p.created_at > ? AND p.hidden = 0 AND u.deleted_at IS NULL
     GROUP BY u.id HAVING n >= 3 ORDER BY avg DESC, n DESC LIMIT 5`, since)
    .map((u, i) => ({ rank: i + 1, user: userPublic(u, req.userId), score: Math.round(((u.avg - 1) / 4) * 100) / 10 }));
  res.json({ tags, top });
});

// ——— Daily Sunset Drops ———
postsRouter.get('/drops/today', optionalAuth, (req, res) => {
  const d = ensureDrop();
  const author = authorCache(req.userId);
  const entries = db.all<Row>('SELECT * FROM posts WHERE drop_id = ? AND hidden = 0 ORDER BY (r4 + 2*r5) DESC, created_at DESC LIMIT 40', d.id)
    .map((p) => serializePost(p, req.userId, author));
  const count = db.one<Row>('SELECT COUNT(*) n FROM posts WHERE drop_id = ?', d.id)!.n;
  const mine = req.userId ? db.one<Row>('SELECT id FROM posts WHERE drop_id = ? AND author_id = ?', d.id, req.userId) : undefined;
  res.json({
    drop: { id: d.id, prompt: d.prompt, emoji: d.emoji, startsAt: d.starts_at, endsAt: d.ends_at, entries: count, myEntryId: mine?.id ?? null },
    entries,
  });
});

postsRouter.post('/drops/today', requireAuth, (req, res) => {
  const me = uid(req);
  const b = parse(z.object({ body: z.string().max(500).default(''), mediaUrl: z.string().url().max(600).nullable(), soundtrack: z.string().max(80).nullable().optional() }), req.body);
  const d = ensureDrop();
  if (db.one('SELECT 1 FROM posts WHERE drop_id = ? AND author_id = ?', d.id, me)) throw new HttpError(409, "You already dropped today — come back tomorrow! 🌅");
  if (!b.mediaUrl) throw new HttpError(400, 'Drops need a photo');
  assertClean(b.body);
  const row = insertPost(me, { kind: 'photo', body: b.body, mediaUrl: b.mediaUrl, soundtrack: b.soundtrack ?? null, dropId: d.id, kindOverride: 'drop' });
  const { streak, milestone } = recordDropStreak(me);
  let reward = grant(me, REWARDS.drop.sparks, REWARDS.drop.xp, `Sunset Drop locked in — ${streak} day streak 🔥`);
  if (milestone) {
    const m = REWARDS.streakMilestone(milestone);
    const r2 = grant(me, m.sparks, m.xp, `${milestone}-day streak milestone!`);
    reward = { ...reward, sparks: reward.sparks + r2.sparks, xp: reward.xp + r2.xp, levelUp: r2.levelUp ?? reward.levelUp };
    ticker(`@${db.one<Row>('SELECT handle FROM users WHERE id = ?', me)!.handle} hit a ${milestone}-day Sunset streak 🔥`, me);
  }
  res.status(201).json({ post: serializePost(row, me), reward });
});

// ——— Vibe Roulette (blind consensus) ———
postsRouter.get('/roulette/next', requireAuth, (req, res) => {
  const me = uid(req);
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const rows = db.all<Row>(
    `SELECT p.* FROM posts p WHERE p.hidden = 0 AND p.kind IN ('photo', 'drop') AND p.media_url IS NOT NULL
       AND p.author_id != ? AND p.created_at > ?
       AND NOT EXISTS (SELECT 1 FROM ratings r WHERE r.post_id = p.id AND r.user_id = ?)
       AND p.author_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = ?)
       AND (r1+r2+r3+r4+r5) >= 2
     ORDER BY RANDOM() LIMIT 1`, me, since, me, me);
  if (!rows.length) return res.json(null);
  const rated = db.one<Row>('SELECT COUNT(*) n FROM ratings WHERE user_id = ?', me)!.n;
  const post = serializePost(rows[0], me);
  // Blind: hide the consensus until the vote is locked in.
  post.ratings = { ...post.ratings, dist: [0, 0, 0, 0, 0], avg: 0, consensusPct: 0, tier: 'chill' };
  res.json({ post, queuePosition: rated + 1 });
});

postsRouter.post('/roulette/vote', requireAuth, (req, res) => {
  const me = uid(req);
  rateLimit(`rate:${me}`, 90);
  const b = parse(z.object({ postId: z.string(), score: z.number().int().min(1).max(5) }), req.body);
  const r = applyRating(b.postId, me, b.score as VibeScore);
  if (!r.isNew) throw new HttpError(409, 'Already rated that one');
  const match = r.before.count > 0 && tierByScore(b.score).key === r.before.tier;
  const user = db.one<Row>('SELECT combo_count FROM users WHERE id = ?', me)!;
  const combo = match ? user.combo_count + 1 : 0;
  db.run('UPDATE users SET combo_count = ? WHERE id = ?', combo, me);
  const mult = match ? comboMultiplier(combo) : 1;
  const sparks = match ? Math.round(ROULETTE_BASE_SPARKS * mult) : REWARDS.rate.sparks;
  const xp = match ? Math.round(ROULETTE_BASE_XP * mult) : REWARDS.rate.xp;
  let reward = grant(me, sparks, xp, match ? `Consensus match! ${combo}x combo` : 'Vibe locked in');
  const quest = progressRatingQuest(me);
  if (quest) reward = { ...quest, sparks: quest.sparks + reward.sparks, xp: quest.xp + reward.xp };
  const after = summarizeRatings([r.post.r1, r.post.r2, r.post.r3, r.post.r4, r.post.r5]);
  res.json({ match, communityTier: r.before.tier, consensusPct: r.before.consensusPct, sparksEarned: sparks, xpEarned: xp, comboCount: combo, multiplier: mult, ratings: after, reward });
});
