import { Router } from 'express';
import { z } from 'zod';
import type { VibeScore } from '@chatlol/shared';
import { REWARDS, summarizeRatings, tierByScore, comboMultiplier, ROULETTE_BASE_SPARKS, ROULETTE_BASE_XP } from '@chatlol/shared';
import { db, newId, now, type Row } from '../db';
import { optionalAuth, requireAuth, uid } from '../lib/auth';
import { HttpError, parse, rateLimit } from '../lib/http';
import { serializePost, serializePosts, serializeComment, authorCache, invalidateStats, userPublic } from '../lib/serialize';
import { grant, notify, progressRatingQuest, recordDropStreak, ticker } from '../lib/rewards';
import { assertClean } from '../lib/moderation';
import { bus } from '../lib/events';
import { io, room } from '../lib/io';
import { ensureDrop } from '../lib/drops';

export const postsRouter = Router();

const PAGE = 12;
const TOTAL = '(r1 + r2 + r3 + r4 + r5)';
const WEIGHTED = '(r1 + 2*r2 + 3*r3 + 4*r4 + 5*r5)';
const extractTags = (s: string) => [...new Set((s.match(/#[\p{L}\p{N}_]{2,30}/gu) ?? []).map((t) => t.slice(1).toLowerCase()))].slice(0, 8);

function blockedClause(viewerId?: string) {
  return viewerId
    ? { sql: ' AND p.author_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = ?) AND p.author_id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id = ?)', args: [viewerId, viewerId] }
    : { sql: '', args: [] as string[] };
}

postsRouter.get('/feed', optionalAuth, async (req, res) => {
  const p = parse(z.object({ tab: z.enum(['foryou', 'following', 'top']).default('foryou'), cursor: z.string().optional(), tag: z.string().max(40).optional() }), req.query);
  const viewer = req.userId;
  const bl = blockedClause(viewer);
  const cursor = p.cursor ?? '9999';
  const tagSql = p.tag ? ' AND p.tags LIKE ?' : '';
  const tagArgs = p.tag ? [`%"${p.tag.toLowerCase()}"%`] : [];

  if (p.tab === 'following' && viewer) {
    const rows = await db.all<Row>(
      `SELECT p.* FROM posts p WHERE p.hidden = 0 AND p.created_at < ? AND (p.author_id IN (SELECT followee_id FROM follows WHERE follower_id = ?) OR p.author_id = ?)${bl.sql}${tagSql}
       ORDER BY p.created_at DESC LIMIT ?`, cursor, viewer, viewer, ...bl.args, ...tagArgs, PAGE + 1);
    return res.json({ items: await serializePosts(rows.slice(0, PAGE), viewer), nextCursor: rows.length > PAGE ? rows[PAGE - 1].created_at : null });
  }

  if (p.tab === 'top') {
    const offset = Number(p.cursor ?? 0) || 0;
    // Bayesian-ish: average shrunk toward 0 for posts with few votes.
    const rows = await db.all<Row>(
      `SELECT * FROM (
         SELECT p.*, ${WEIGHTED} * 1.0 / (CASE WHEN ${TOTAL} > 0 THEN ${TOTAL} ELSE 1 END) AS avg_score, ${TOTAL} AS n
         FROM posts p WHERE p.hidden = 0 AND p.created_at > ?${bl.sql}${tagSql}
       ) t ORDER BY avg_score * (1 - 1.0 / (n + 2)) DESC, n DESC LIMIT ? OFFSET ?`,
      new Date(Date.now() - 2 * 86_400_000).toISOString(), ...bl.args, ...tagArgs, PAGE + 1, offset);
    return res.json({ items: await serializePosts(rows.slice(0, PAGE), viewer), nextCursor: rows.length > PAGE ? String(offset + PAGE) : null });
  }

  // "For You": recency blended with engagement and a boost for people you follow.
  const candidates = await db.all<Row>(
    `SELECT p.*, ${TOTAL} AS n, (r4 + 2*r5) AS heat,
       ${viewer ? '(SELECT COUNT(*) FROM follows WHERE follower_id = ? AND followee_id = p.author_id)' : '0'} AS followed
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
  res.json({ items: await serializePosts(page, viewer), nextCursor: candidates.length > PAGE ? oldest : null });
});

postsRouter.get('/posts/:id', optionalAuth, async (req, res) => {
  const row = await db.one<Row>('SELECT * FROM posts WHERE id = ? AND hidden = 0', String(req.params.id));
  if (!row) throw new HttpError(404, 'That post vanished');
  const author = authorCache(req.userId);
  const comments = await db.all<Row>('SELECT * FROM comments WHERE post_id = ? ORDER BY created_at ASC LIMIT 200', row.id);
  res.json({ post: await serializePost(row, req.userId, author), comments: await Promise.all(comments.map((c) => serializeComment(c, author))) });
});

const createSchema = z.object({
  kind: z.enum(['photo', 'text', 'battle']).default('text'),
  body: z.string().max(1000).default(''),
  mediaUrl: z.string().url().max(600).nullable().optional(),
  tags: z.array(z.string().max(30)).max(8).optional(),
  battle: z.array(z.object({ label: z.string().min(1).max(60), mediaUrl: z.string().url().max(600).optional() })).min(2).max(4).optional(),
  soundtrack: z.string().max(80).nullable().optional(),
});

export async function insertPost(authorId: string, b: z.infer<typeof createSchema> & { dropId?: string | null; kindOverride?: string }) {
  const id = newId('p');
  const kind = b.kindOverride ?? (b.battle ? 'battle' : b.mediaUrl ? 'photo' : b.kind);
  const tags = [...new Set([...(b.tags ?? []).map((t) => t.replace(/^#/, '').toLowerCase()), ...extractTags(b.body)])].slice(0, 8);
  await db.tx(async () => {
    await db.run(
      'INSERT INTO posts (id, author_id, kind, body, media_url, tags, drop_id, soundtrack, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id, authorId, kind, b.body, b.mediaUrl ?? null, JSON.stringify(tags), b.dropId ?? null, b.soundtrack ?? null, now());
    for (const [i, o] of (b.battle ?? []).entries()) {
      await db.run('INSERT INTO battle_options (id, post_id, label, media_url, votes, position) VALUES (?, ?, ?, ?, 0, ?)', newId('bo'), id, o.label, o.mediaUrl ?? null, i);
    }
  });
  const row = (await db.one<Row>('SELECT * FROM posts WHERE id = ?', id))!;
  io()?.to(room.global).emit('feed:new', await serializePost(row, null));
  bus.emitEvent('post:created', { postId: id, authorId });
  return row;
}

postsRouter.post('/posts', requireAuth, async (req, res) => {
  const me = uid(req);
  await rateLimit(`post:${me}`, 6);
  const b = parse(createSchema, req.body);
  if (!b.body.trim() && !b.mediaUrl && !b.battle) throw new HttpError(400, 'Say something or add a photo');
  assertClean(b.body + ' ' + (b.battle?.map((o) => o.label).join(' ') ?? ''));
  const row = await insertPost(me, b);
  const reward = await grant(me, REWARDS.post.sparks, REWARDS.post.xp, 'Posted a vibe ✨');
  res.status(201).json({ post: await serializePost(row, me), reward });
});

postsRouter.delete('/posts/:id', requireAuth, async (req, res) => {
  const r = await db.run('DELETE FROM posts WHERE id = ? AND author_id = ?', String(req.params.id), uid(req));
  if (!r.changes) throw new HttpError(404, 'Not your post');
  invalidateStats(uid(req));
  res.json({ ok: true });
});

/** Applies a rating; returns the previous community summary (for blind-consensus matching) and whether it was new. */
export async function applyRating(postId: string, userId: string, score: VibeScore) {
  const post = await db.one<Row>('SELECT * FROM posts WHERE id = ? AND hidden = 0', postId);
  if (!post) throw new HttpError(404, 'That post vanished');
  if (post.author_id === userId) throw new HttpError(400, "You can't rate your own vibe (nice try 😏)");
  const before = summarizeRatings([post.r1, post.r2, post.r3, post.r4, post.r5]);
  const isNew = await db.tx(async () => {
    const prev = await db.one<Row>('SELECT score FROM ratings WHERE post_id = ? AND user_id = ?', postId, userId);
    if (prev) {
      if (prev.score === score) return false;
      await db.run(`UPDATE posts SET r${prev.score} = r${prev.score} - 1 WHERE id = ?`, postId);
      await db.run('UPDATE ratings SET score = ?, created_at = ? WHERE post_id = ? AND user_id = ?', score, now(), postId, userId);
    } else {
      // ON CONFLICT guards against a double-tap race inserting twice.
      const ins = await db.run('INSERT INTO ratings (post_id, user_id, score, created_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING', postId, userId, score, now());
      if (!ins.changes) return false;
    }
    await db.run(`UPDATE posts SET r${score} = r${score} + 1 WHERE id = ?`, postId);
    return !prev;
  });
  invalidateStats(post.author_id);
  if (isNew && score >= 4) {
    const rater = (await db.one<Row>('SELECT * FROM users WHERE id = ?', userId))!;
    const t = tierByScore(score);
    await notify(post.author_id, {
      kind: 'rating', actorId: userId, link: `/p/${postId}`,
      title: `${rater.display_name} rated your ${post.kind === 'drop' ? 'drop' : 'photo'} ${t.label} ${t.emoji}`,
      body: post.body ? `“${post.body.slice(0, 80)}”` : 'Your vibe is climbing.',
    });
    if (score === 5) {
      await grant(post.author_id, REWARDS.receiveGodTier.sparks, REWARDS.receiveGodTier.xp, 'Someone crowned you God Tier 👑');
      const author = await db.one<Row>('SELECT handle FROM users WHERE id = ?', post.author_id);
      void ticker(`${rater.display_name} crowned @${author?.handle} God Tier 👑`, userId);
    }
  }
  return { before, isNew, post: (await db.one<Row>('SELECT * FROM posts WHERE id = ?', postId))! };
}

async function ratingReward(me: string) {
  let reward = await grant(me, REWARDS.rate.sparks, REWARDS.rate.xp, 'Rated a vibe');
  const quest = await progressRatingQuest(me);
  if (quest) reward = { ...quest, sparks: quest.sparks + reward.sparks, xp: quest.xp + reward.xp };
  return reward;
}

postsRouter.post('/posts/:id/rate', requireAuth, async (req, res) => {
  const me = uid(req);
  await rateLimit(`rate:${me}`, 90);
  const { score } = parse(z.object({ score: z.number().int().min(1).max(5) }), req.body);
  const r = await applyRating(String(req.params.id), me, score as VibeScore);
  const reward = r.isNew ? await ratingReward(me) : null;
  res.json({ post: await serializePost(r.post, me), reward });
});

postsRouter.post('/posts/:id/react', requireAuth, async (req, res) => {
  const me = uid(req);
  const { kind } = parse(z.object({ kind: z.enum(['fire', 'heart', 'lol', 'wow', 'hundred']).nullable() }), req.body);
  const post = await db.one<Row>('SELECT * FROM posts WHERE id = ?', String(req.params.id));
  if (!post) throw new HttpError(404, 'That post vanished');
  if (kind) {
    await db.run('INSERT INTO reactions (post_id, user_id, kind) VALUES (?, ?, ?) ON CONFLICT (post_id, user_id) DO UPDATE SET kind = excluded.kind', post.id, me, kind);
  } else {
    await db.run('DELETE FROM reactions WHERE post_id = ? AND user_id = ?', post.id, me);
  }
  res.json({ post: await serializePost(post, me) });
});

postsRouter.post('/posts/:id/battle', requireAuth, async (req, res) => {
  const me = uid(req);
  const postId = String(req.params.id);
  const { optionId } = parse(z.object({ optionId: z.string() }), req.body);
  const opt = await db.one<Row>('SELECT * FROM battle_options WHERE id = ? AND post_id = ?', optionId, postId);
  if (!opt) throw new HttpError(404, 'Option not found');
  const isNew = await db.tx(async () => {
    const prev = await db.one<Row>('SELECT option_id FROM battle_votes WHERE post_id = ? AND user_id = ?', postId, me);
    if (prev?.option_id === optionId) return false;
    if (prev) await db.run('UPDATE battle_options SET votes = votes - 1 WHERE id = ?', prev.option_id);
    await db.run('INSERT INTO battle_votes (post_id, user_id, option_id) VALUES (?, ?, ?) ON CONFLICT (post_id, user_id) DO UPDATE SET option_id = excluded.option_id', postId, me, optionId);
    await db.run('UPDATE battle_options SET votes = votes + 1 WHERE id = ?', optionId);
    return !prev;
  });
  if (isNew) await grant(me, REWARDS.rate.sparks, REWARDS.rate.xp, 'Voted in a battle');
  res.json({ post: await serializePost((await db.one<Row>('SELECT * FROM posts WHERE id = ?', postId))!, me) });
});

export async function insertComment(postId: string, authorId: string, body: string) {
  const post = await db.one<Row>('SELECT * FROM posts WHERE id = ? AND hidden = 0', postId);
  if (!post) throw new HttpError(404, 'That post vanished');
  const id = newId('c');
  await db.run('INSERT INTO comments (id, post_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)', id, postId, authorId, body, now());
  await db.run('UPDATE posts SET comment_count = comment_count + 1 WHERE id = ?', postId);
  if (post.author_id !== authorId) {
    const a = (await db.one<Row>('SELECT display_name FROM users WHERE id = ?', authorId))!;
    await notify(post.author_id, { kind: 'comment', actorId: authorId, link: `/p/${postId}`, title: `${a.display_name} commented`, body: body.slice(0, 120) });
  }
  bus.emitEvent('comment:created', { postId, commentId: id, authorId });
  return (await db.one<Row>('SELECT * FROM comments WHERE id = ?', id))!;
}

postsRouter.post('/posts/:id/comments', requireAuth, async (req, res) => {
  const me = uid(req);
  await rateLimit(`comment:${me}`, 20);
  const { body } = parse(z.object({ body: z.string().trim().min(1).max(500) }), req.body);
  assertClean(body);
  const row = await insertComment(String(req.params.id), me, body);
  const reward = await grant(me, REWARDS.comment.sparks, REWARDS.comment.xp, 'Dropped a comment');
  res.status(201).json({ comment: await serializeComment(row), reward });
});

postsRouter.get('/trending', optionalAuth, async (req, res) => {
  const since = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const counts = new Map<string, number>();
  for (const r of await db.all<Row>(`SELECT tags, (${TOTAL} + comment_count) AS e FROM posts WHERE hidden = 0 AND created_at > ?`, since)) {
    for (const t of JSON.parse(r.tags) as string[]) counts.set(t, (counts.get(t) ?? 0) + 1 + r.e);
  }
  const tags = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([tag, count]) => ({ tag, count: count * 37 }));
  const rows = await db.all<Row>(
    `SELECT * FROM (
       SELECT p.author_id, SUM(${WEIGHTED}) * 1.0 / SUM(${TOTAL}) AS avg_score, SUM(${TOTAL}) AS n
       FROM posts p JOIN users u ON u.id = p.author_id
       WHERE p.created_at > ? AND p.hidden = 0 AND u.deleted_at IS NULL
       GROUP BY p.author_id HAVING SUM(${TOTAL}) >= 3
     ) t ORDER BY avg_score DESC, n DESC LIMIT 5`, since);
  const author = authorCache(req.userId);
  const top = await Promise.all(rows.map(async (r, i) => ({ rank: i + 1, user: await author(r.author_id), score: Math.round(((r.avg_score - 1) / 4) * 100) / 10 })));
  res.json({ tags, top });
});

// ——— Daily Sunset Drops ———
postsRouter.get('/drops/today', optionalAuth, async (req, res) => {
  const d = await ensureDrop();
  const entries = await db.all<Row>('SELECT * FROM posts WHERE drop_id = ? AND hidden = 0 ORDER BY (r4 + 2*r5) DESC, created_at DESC LIMIT 40', d.id);
  const count = (await db.one<Row>('SELECT COUNT(*) AS n FROM posts WHERE drop_id = ?', d.id))!.n;
  const mine = req.userId ? await db.one<Row>('SELECT id FROM posts WHERE drop_id = ? AND author_id = ?', d.id, req.userId) : undefined;
  res.json({
    drop: { id: d.id, prompt: d.prompt, emoji: d.emoji, startsAt: d.starts_at, endsAt: d.ends_at, entries: count, myEntryId: mine?.id ?? null },
    entries: await serializePosts(entries, req.userId),
  });
});

postsRouter.post('/drops/today', requireAuth, async (req, res) => {
  const me = uid(req);
  await rateLimit(`drop:${me}`, 5);
  const b = parse(z.object({ body: z.string().max(500).default(''), mediaUrl: z.string().url().max(600).nullable(), soundtrack: z.string().max(80).nullable().optional() }), req.body);
  const d = await ensureDrop();
  if (await db.one('SELECT 1 AS x FROM posts WHERE drop_id = ? AND author_id = ?', d.id, me)) throw new HttpError(409, 'You already dropped today — come back tomorrow! 🌅');
  if (!b.mediaUrl) throw new HttpError(400, 'Drops need a photo');
  assertClean(b.body);
  const row = await insertPost(me, { kind: 'photo', body: b.body, mediaUrl: b.mediaUrl, soundtrack: b.soundtrack ?? null, dropId: d.id, kindOverride: 'drop' });
  const { streak, milestone } = await recordDropStreak(me);
  let reward = await grant(me, REWARDS.drop.sparks, REWARDS.drop.xp, `Sunset Drop locked in — ${streak} day streak 🔥`);
  if (milestone) {
    const m = REWARDS.streakMilestone(milestone);
    const r2 = await grant(me, m.sparks, m.xp, `${milestone}-day streak milestone!`);
    reward = { ...reward, sparks: reward.sparks + r2.sparks, xp: reward.xp + r2.xp, levelUp: r2.levelUp ?? reward.levelUp };
    const h = await db.one<Row>('SELECT handle FROM users WHERE id = ?', me);
    void ticker(`@${h?.handle} hit a ${milestone}-day Sunset streak 🔥`, me);
  }
  res.status(201).json({ post: await serializePost(row, me), reward });
});

// ——— Vibe Roulette (blind consensus) ———
postsRouter.get('/roulette/next', requireAuth, async (req, res) => {
  const me = uid(req);
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const row = await db.one<Row>(
    `SELECT p.* FROM posts p WHERE p.hidden = 0 AND p.kind IN ('photo', 'drop') AND p.media_url IS NOT NULL
       AND p.author_id != ? AND p.created_at > ?
       AND NOT EXISTS (SELECT 1 FROM ratings r WHERE r.post_id = p.id AND r.user_id = ?)
       AND p.author_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = ?)
       AND ${TOTAL} >= 2
     ORDER BY RANDOM() LIMIT 1`, me, since, me, me);
  if (!row) return res.json(null);
  const rated = (await db.one<Row>('SELECT COUNT(*) AS n FROM ratings WHERE user_id = ?', me))!.n;
  const post = await serializePost(row, me);
  // Blind: hide the consensus until the vote is locked in.
  post.ratings = { ...post.ratings, dist: [0, 0, 0, 0, 0], avg: 0, consensusPct: 0, tier: 'chill' };
  res.json({ post, queuePosition: rated + 1 });
});

postsRouter.post('/roulette/vote', requireAuth, async (req, res) => {
  const me = uid(req);
  await rateLimit(`rate:${me}`, 90);
  const b = parse(z.object({ postId: z.string(), score: z.number().int().min(1).max(5) }), req.body);
  if (await db.one('SELECT 1 AS x FROM ratings WHERE post_id = ? AND user_id = ?', b.postId, me)) throw new HttpError(409, 'Already rated that one');
  const r = await applyRating(b.postId, me, b.score as VibeScore);
  if (!r.isNew) throw new HttpError(409, 'Already rated that one');
  const match = r.before.count > 0 && tierByScore(b.score).key === r.before.tier;
  const user = (await db.one<Row>('SELECT combo_count FROM users WHERE id = ?', me))!;
  const combo = match ? user.combo_count + 1 : 0;
  await db.run('UPDATE users SET combo_count = ? WHERE id = ?', combo, me);
  const mult = match ? comboMultiplier(combo) : 1;
  const sparks = match ? Math.round(ROULETTE_BASE_SPARKS * mult) : REWARDS.rate.sparks;
  const xp = match ? Math.round(ROULETTE_BASE_XP * mult) : REWARDS.rate.xp;
  let reward = await grant(me, sparks, xp, match ? `Consensus match! ${combo}x combo` : 'Vibe locked in');
  const quest = await progressRatingQuest(me);
  if (quest) reward = { ...quest, sparks: quest.sparks + reward.sparks, xp: quest.xp + reward.xp };
  const after = summarizeRatings([r.post.r1, r.post.r2, r.post.r3, r.post.r4, r.post.r5]);
  res.json({ match, communityTier: r.before.tier, consensusPct: r.before.consensusPct, sparksEarned: sparks, xpEarned: xp, comboCount: combo, multiplier: mult, ratings: after, reward });
});

export { userPublic };
