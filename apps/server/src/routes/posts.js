import { Router } from 'express';
import { z } from 'zod';

import { REWARDS, summarizeRatings, tierByScore, comboMultiplier, ROULETTE_BASE_SPARKS, ROULETTE_BASE_XP } from '@chatlol/shared';
import { db, newId, now, isDuplicateKey } from '../db.js';
import { optionalAuth, requireAuth, uid } from '../lib/auth.js';
import { HttpError, parse, rateLimit } from '../lib/http.js';
import { serializePost, serializePosts, serializeComment, authorCache, invalidateStats, userPublic } from '../lib/serialize.js';
import { grant, notify, progressRatingQuest, recordDropStreak, ticker } from '../lib/rewards.js';
import { assertClean } from '../lib/moderation.js';
import { assertCanPost } from '../lib/enforcement.js';
import { screen } from '../lib/aiModeration.js';
import { bus } from '../lib/events.js';
import { io, room } from '../lib/io.js';
import { ensureDrop } from '../lib/drops.js';

export const postsRouter = Router();

const PAGE = 12;
const extractTags = (s) => [...new Set((s.match(/#[\p{L}\p{N}_]{2,30}/gu) ?? []).map((t) => t.slice(1).toLowerCase()))].slice(0, 8);

// Aggregation expressions over a post's rating buckets.
const TOTAL = { $add: ['$r1', '$r2', '$r3', '$r4', '$r5'] };
const WEIGHTED = {
  $add: ['$r1', { $multiply: [2, '$r2'] }, { $multiply: [3, '$r3'] }, { $multiply: [4, '$r4'] }, { $multiply: [5, '$r5'] }],
};
const HEAT = { $add: ['$r4', { $multiply: [2, '$r5'] }] };

/** Author ids the viewer must not see: people they blocked and people who blocked them. */
async function hiddenAuthors(viewerId) {
  if (!viewerId) return [];
  const [blocked, blockedBy] = await Promise.all([
    db.blocks.distinct('blockedId', { blockerId: viewerId }),
    db.blocks.distinct('blockerId', { blockedId: viewerId }),
  ]);
  return [...blocked, ...blockedBy];
}

postsRouter.get('/feed', optionalAuth, async (req, res) => {
  const p = parse(
    z.object({
      tab: z.enum(['foryou', 'following', 'top']).default('foryou'),
      cursor: z.string().optional(),
      tag: z.string().max(40).optional(),
    }),
    req.query,
  );
  const viewer = req.userId;
  const hidden = await hiddenAuthors(viewer);
  const cursor = p.cursor ?? '9999';
  // Gallery-only photos (inFeed: false) live on profiles, not in the feed.
  const base = { hidden: false, inFeed: { $ne: false }, ...(p.tag ? { tags: p.tag.toLowerCase() } : {}) };
  const notHidden = hidden.length ? { $nin: hidden } : undefined;

  if (p.tab === 'following' && viewer) {
    const followees = await db.follows.distinct('followeeId', { followerId: viewer });
    const authors = [...followees, viewer].filter((id) => !hidden.includes(id));
    const rows = await db.posts
      .find({ ...base, createdAt: { $lt: cursor }, authorId: { $in: authors } })
      .sort({ createdAt: -1 })
      .limit(PAGE + 1)
      .toArray();
    return res.json({
      items: await serializePosts(rows.slice(0, PAGE), viewer),
      nextCursor: rows.length > PAGE ? rows[PAGE - 1].createdAt : null,
    });
  }

  if (p.tab === 'top') {
    const offset = Number(p.cursor ?? 0) || 0;
    // Bayesian-ish: average shrunk toward 0 for posts with few votes.
    const rows = await db.posts
      .aggregate([
        {
          $match: {
            ...base,
            createdAt: { $gt: new Date(Date.now() - 2 * 86_400_000).toISOString() },
            ...(notHidden ? { authorId: notHidden } : {}),
          },
        },
        { $addFields: { _n: TOTAL } },
        {
          $addFields: {
            _score: {
              $multiply: [{ $divide: [WEIGHTED, { $max: ['$_n', 1] }] }, { $subtract: [1, { $divide: [1, { $add: ['$_n', 2] }] }] }],
            },
          },
        },
        { $sort: { _score: -1, _n: -1, _id: 1 } },
        { $skip: offset },
        { $limit: PAGE + 1 },
        { $project: { _score: 0, _n: 0 } },
      ])
      .toArray();
    return res.json({
      items: await serializePosts(rows.slice(0, PAGE), viewer),
      nextCursor: rows.length > PAGE ? String(offset + PAGE) : null,
    });
  }

  // "For You" / news feed: strictly newest first, so a new post is always at the top and pagination never skips any.
  const rows = await db.posts
    .find({ ...base, createdAt: { $lt: cursor }, ...(notHidden ? { authorId: notHidden } : {}) })
    .sort({ createdAt: -1, _id: -1 })
    .limit(PAGE + 1)
    .toArray();
  res.json({
    items: await serializePosts(rows.slice(0, PAGE), viewer),
    nextCursor: rows.length > PAGE ? rows[PAGE - 1].createdAt : null,
  });
});

postsRouter.get('/posts/:id', optionalAuth, async (req, res) => {
  const post = await db.posts.findOne({ _id: String(req.params.id), hidden: false });
  if (!post) throw new HttpError(404, 'That post vanished');
  const author = authorCache(req.userId);
  const comments = await db.comments
    .find({ postId: post._id, hidden: { $ne: true } })
    .sort({ createdAt: 1 })
    .limit(200)
    .toArray();
  res.json({
    post: await serializePost(post, req.userId, author),
    comments: await Promise.all(comments.map((c) => serializeComment(c, author))),
  });
});

const createSchema = z.object({
  kind: z.enum(['photo', 'text', 'battle']).default('text'),
  body: z.string().max(1000).default(''),
  mediaUrl: z.string().url().max(600).nullable().optional(),
  tags: z.array(z.string().max(30)).max(8).optional(),
  battle: z
    .array(z.object({ label: z.string().min(1).max(60), mediaUrl: z.string().url().max(600).optional() }))
    .min(2)
    .max(4)
    .optional(),
  soundtrack: z.string().max(80).nullable().optional(),
  /** Gallery album on the author's profile (photos only). */
  album: z.string().trim().max(30).nullable().optional(),
  /** false = add to the profile gallery without posting to the news feed. */
  inFeed: z.boolean().optional(),
});

export async function insertPost(authorId, b) {
  const kind = b.kindOverride ?? (b.battle ? 'battle' : b.mediaUrl ? 'photo' : b.kind);
  const tags = [...new Set([...(b.tags ?? []).map((t) => t.replace(/^#/, '').toLowerCase()), ...extractTags(b.body)])].slice(0, 8);
  // Battle options live inside the post document.
  const post = {
    _id: newId('p'),
    authorId,
    kind,
    body: b.body,
    mediaUrl: b.mediaUrl ?? null,
    tags,
    dropId: b.dropId ?? null,
    soundtrack: b.soundtrack ?? null,
    album: b.mediaUrl ? (b.album ?? null) : null,
    inFeed: b.mediaUrl ? b.inFeed !== false : true,
    battle: b.battle ? b.battle.map((o) => ({ id: newId('bo'), label: o.label, mediaUrl: o.mediaUrl ?? null, votes: 0 })) : null,
    r1: 0,
    r2: 0,
    r3: 0,
    r4: 0,
    r5: 0,
    commentCount: 0,
    hidden: false,
    createdAt: now(),
  };
  await db.posts.insertOne(post);
  if (post.inFeed)
    io()
      ?.to(room.global)
      .emit('feed:new', await serializePost(post, null));
  bus.emitEvent('post:created', { postId: post._id, authorId });
  return post;
}

postsRouter.post('/posts', requireAuth, async (req, res) => {
  const me = uid(req);
  await rateLimit(`post:${me}`, 6);
  const b = parse(createSchema, req.body);
  if (!b.body.trim() && !b.mediaUrl && !b.battle) throw new HttpError(400, 'Say something or add a photo');
  await assertCanPost(me);
  const text = b.body + ' ' + (b.battle?.map((o) => o.label).join(' ') ?? '');
  assertClean(text);
  const row = await insertPost(me, b);
  screen({ userId: me, text, ref: { type: 'post', id: row._id } });
  const reward = await grant(me, REWARDS.post.sparks, REWARDS.post.xp, 'Posted a vibe ✨');
  res.status(201).json({ post: await serializePost(row, me), reward });
});

postsRouter.delete('/posts/:id', requireAuth, async (req, res) => {
  const id = String(req.params.id);
  const r = await db.posts.deleteOne({ _id: id, authorId: uid(req) });
  if (!r.deletedCount) throw new HttpError(404, 'Not your post');
  await Promise.all([
    db.comments.deleteMany({ postId: id }),
    db.ratings.deleteMany({ postId: id }),
    db.reactions.deleteMany({ postId: id }),
    db.battleVotes.deleteMany({ postId: id }),
  ]);
  invalidateStats(uid(req));
  res.json({ ok: true });
});

/** Applies a rating; returns the previous community summary (for blind-consensus matching) and whether it was new. */
export async function applyRating(postId, userId, score) {
  const post = await db.posts.findOne({ _id: postId, hidden: false });
  if (!post) throw new HttpError(404, 'That post vanished');
  if (post.authorId === userId) throw new HttpError(400, "You can't rate your own vibe (nice try 😏)");
  if (post.kind === 'birthday') throw new HttpError(400, 'Birthday posts are for wishes, not ratings 🎂');
  const before = summarizeRatings([post.r1, post.r2, post.r3, post.r4, post.r5]);
  const isNew = await db.tx(async () => {
    // Swap the score atomically and learn the previous one; the unique (postId, userId) index stops double-tap races.
    let prev;
    try {
      prev = await db.ratings.findOneAndUpdate(
        { postId, userId },
        { $set: { score, createdAt: now() } },
        { upsert: true, returnDocument: 'before' },
      );
    } catch (e) {
      if (isDuplicateKey(e)) return false;
      throw e;
    }
    if (prev?.score === score) return false;
    await db.posts.updateOne({ _id: postId }, { $inc: { [`r${score}`]: 1, ...(prev ? { [`r${prev.score}`]: -1 } : {}) } });
    return !prev;
  });
  invalidateStats(post.authorId);
  if (isNew && score >= 4) {
    const rater = await db.users.findOne({ _id: userId });
    const t = tierByScore(score);
    await notify(post.authorId, {
      kind: 'rating',
      actorId: userId,
      link: `/p/${postId}`,
      title: `${rater.displayName} rated your ${post.kind === 'drop' ? 'drop' : 'photo'} ${t.label} ${t.emoji}`,
      anonTitle: `Someone rated your ${post.kind === 'drop' ? 'drop' : 'photo'} ${t.label} ${t.emoji}`,
      body: post.body ? `“${post.body.slice(0, 80)}”` : 'Your vibe is climbing.',
    });
    if (score === 5) {
      await grant(post.authorId, REWARDS.receiveGodTier.sparks, REWARDS.receiveGodTier.xp, 'Someone crowned you God Tier 👑');
      const author = await db.users.findOne({ _id: post.authorId }, { projection: { handle: 1 } });
      void ticker(`${rater.displayName} crowned @${author?.handle} God Tier 👑`, userId);
    }
  }
  return { before, isNew, post: await db.posts.findOne({ _id: postId }) };
}

async function ratingReward(me) {
  let reward = await grant(me, REWARDS.rate.sparks, REWARDS.rate.xp, 'Rated a vibe');
  const quest = await progressRatingQuest(me);
  if (quest) reward = { ...quest, sparks: quest.sparks + reward.sparks, xp: quest.xp + reward.xp };
  return reward;
}

postsRouter.post('/posts/:id/rate', requireAuth, async (req, res) => {
  const me = uid(req);
  await rateLimit(`rate:${me}`, 90);
  const { score } = parse(z.object({ score: z.number().int().min(1).max(5) }), req.body);
  const r = await applyRating(String(req.params.id), me, score);
  const reward = r.isNew ? await ratingReward(me) : null;
  res.json({ post: await serializePost(r.post, me), reward });
});

postsRouter.post('/posts/:id/react', requireAuth, async (req, res) => {
  const me = uid(req);
  const { kind } = parse(z.object({ kind: z.enum(['fire', 'heart', 'lol', 'wow', 'hundred']).nullable() }), req.body);
  const post = await db.posts.findOne({ _id: String(req.params.id) });
  if (!post) throw new HttpError(404, 'That post vanished');
  if (kind) await db.reactions.updateOne({ postId: post._id, userId: me }, { $set: { kind } }, { upsert: true });
  else await db.reactions.deleteOne({ postId: post._id, userId: me });
  res.json({ post: await serializePost(post, me) });
});

postsRouter.post('/posts/:id/battle', requireAuth, async (req, res) => {
  const me = uid(req);
  const postId = String(req.params.id);
  const { optionId } = parse(z.object({ optionId: z.string() }), req.body);
  if (!(await db.posts.findOne({ _id: postId, 'battle.id': optionId }))) throw new HttpError(404, 'Option not found');
  const isNew = await db.tx(async () => {
    let prev;
    try {
      prev = await db.battleVotes.findOneAndUpdate(
        { postId, userId: me },
        { $set: { optionId } },
        { upsert: true, returnDocument: 'before' },
      );
    } catch (e) {
      if (isDuplicateKey(e)) return false;
      throw e;
    }
    if (prev?.optionId === optionId) return false;
    const inc = { [`battle.$[pick].votes`]: 1, ...(prev ? { [`battle.$[old].votes`]: -1 } : {}) };
    const arrayFilters = [{ 'pick.id': optionId }, ...(prev ? [{ 'old.id': prev.optionId }] : [])];
    await db.posts.updateOne({ _id: postId }, { $inc: inc }, { arrayFilters });
    return !prev;
  });
  if (isNew) await grant(me, REWARDS.rate.sparks, REWARDS.rate.xp, 'Voted in a battle');
  res.json({ post: await serializePost(await db.posts.findOne({ _id: postId }), me) });
});

export async function insertComment(postId, authorId, body) {
  const post = await db.posts.findOne({ _id: postId, hidden: false });
  if (!post) throw new HttpError(404, 'That post vanished');
  if (post.authorId !== authorId) {
    const owner = await db.users.findOne({ _id: post.authorId }, { projection: { 'settings.whoCanComment': 1, handle: 1 } });
    if (owner?.settings?.whoCanComment === 'following' && !(await db.follows.findOne({ followerId: post.authorId, followeeId: authorId })))
      throw new HttpError(403, `Only people @${owner.handle} follows can comment`, 'comments_restricted');
    if (
      await db.blocks.findOne({
        $or: [
          { blockerId: post.authorId, blockedId: authorId },
          { blockerId: authorId, blockedId: post.authorId },
        ],
      })
    )
      throw new HttpError(403, "You can't comment here");
  }
  const comment = { _id: newId('c'), postId, authorId, body, createdAt: now() };
  await db.comments.insertOne(comment);
  await db.posts.updateOne({ _id: postId }, { $inc: { commentCount: 1 } });
  if (post.authorId !== authorId) {
    const a = await db.users.findOne({ _id: authorId }, { projection: { displayName: 1 } });
    await notify(post.authorId, {
      kind: 'comment',
      actorId: authorId,
      link: `/p/${postId}`,
      title: post.kind === 'birthday' ? `${a.displayName} left you a birthday wish 🎂` : `${a.displayName} commented`,
      body: body.slice(0, 120),
    });
  }
  bus.emitEvent('comment:created', { postId, commentId: comment._id, authorId });
  return comment;
}

postsRouter.post('/posts/:id/comments', requireAuth, async (req, res) => {
  const me = uid(req);
  await rateLimit(`comment:${me}`, 20);
  const { body } = parse(z.object({ body: z.string().trim().min(1).max(500) }), req.body);
  await assertCanPost(me);
  assertClean(body);
  const row = await insertComment(String(req.params.id), me, body);
  screen({ userId: me, text: body, ref: { type: 'comment', id: row._id } });
  const reward = await grant(me, REWARDS.comment.sparks, REWARDS.comment.xp, 'Dropped a comment');
  res.status(201).json({ comment: await serializeComment(row), reward });
});

postsRouter.get('/trending', optionalAuth, async (req, res) => {
  const since = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const tagRows = await db.posts
    .aggregate([
      { $match: { hidden: false, createdAt: { $gt: since }, 'tags.0': { $exists: true } } },
      { $project: { tags: 1, e: { $add: [TOTAL, '$commentCount', 1] } } },
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: '$e' } } },
      { $sort: { count: -1, _id: 1 } },
      { $limit: 10 },
    ])
    .toArray();
  const tags = tagRows.map((r) => ({ tag: r._id, count: r.count * 37 }));
  const rows = await db.posts
    .aggregate([
      { $match: { hidden: false, createdAt: { $gt: since } } },
      { $group: { _id: '$authorId', w: { $sum: WEIGHTED }, n: { $sum: TOTAL } } },
      { $match: { n: { $gte: 3 } } },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u', pipeline: [{ $project: { deletedAt: 1 } }] } },
      { $match: { 'u.deletedAt': null } },
      { $addFields: { avg: { $divide: ['$w', '$n'] } } },
      { $sort: { avg: -1, n: -1 } },
      { $limit: 5 },
    ])
    .toArray();
  const author = authorCache(req.userId);
  const top = await Promise.all(
    rows.map(async (r, i) => ({ rank: i + 1, user: await author(r._id), score: Math.round(((r.avg - 1) / 4) * 100) / 10 })),
  );
  res.json({ tags, top });
});

// ——— Daily Sunset Drops ———
postsRouter.get('/drops/today', optionalAuth, async (req, res) => {
  const d = await ensureDrop();
  const entries = await db.posts
    .aggregate([
      { $match: { dropId: d._id, hidden: false } },
      { $addFields: { _heat: HEAT } },
      { $sort: { _heat: -1, createdAt: -1 } },
      { $limit: 40 },
      { $project: { _heat: 0 } },
    ])
    .toArray();
  const count = await db.posts.countDocuments({ dropId: d._id });
  const mine = req.userId ? await db.posts.findOne({ dropId: d._id, authorId: req.userId }, { projection: { _id: 1 } }) : null;
  res.json({
    drop: {
      id: d._id,
      prompt: d.prompt,
      emoji: d.emoji,
      startsAt: d.startsAt,
      endsAt: d.endsAt,
      entries: count,
      myEntryId: mine?._id ?? null,
    },
    entries: await serializePosts(entries, req.userId),
  });
});

postsRouter.post('/drops/today', requireAuth, async (req, res) => {
  const me = uid(req);
  await rateLimit(`drop:${me}`, 5);
  const b = parse(
    z.object({
      body: z.string().max(500).default(''),
      mediaUrl: z.string().url().max(600).nullable(),
      soundtrack: z.string().max(80).nullable().optional(),
    }),
    req.body,
  );
  const d = await ensureDrop();
  if (await db.posts.findOne({ dropId: d._id, authorId: me }))
    throw new HttpError(409, 'You already dropped today — come back tomorrow! 🌅');
  if (!b.mediaUrl) throw new HttpError(400, 'Drops need a photo');
  await assertCanPost(me);
  assertClean(b.body);
  const row = await insertPost(me, {
    kind: 'photo',
    body: b.body,
    mediaUrl: b.mediaUrl,
    soundtrack: b.soundtrack ?? null,
    dropId: d._id,
    kindOverride: 'drop',
  });
  const { streak, milestone } = await recordDropStreak(me);
  let reward = await grant(me, REWARDS.drop.sparks, REWARDS.drop.xp, `Sunset Drop locked in — ${streak} day streak 🔥`);
  if (milestone) {
    const m = REWARDS.streakMilestone(milestone);
    const r2 = await grant(me, m.sparks, m.xp, `${milestone}-day streak milestone!`);
    reward = { ...reward, sparks: reward.sparks + r2.sparks, xp: reward.xp + r2.xp, levelUp: r2.levelUp ?? reward.levelUp };
    const h = await db.users.findOne({ _id: me }, { projection: { handle: 1 } });
    void ticker(`@${h?.handle} hit a ${milestone}-day Sunset streak 🔥`, me);
  }
  res.status(201).json({ post: await serializePost(row, me), reward });
});

// ——— Vibe Roulette (blind consensus) ———
postsRouter.get('/roulette/next', requireAuth, async (req, res) => {
  const me = uid(req);
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  // A rating is always newer than its post, so ratings since `since` cover every candidate this viewer rated.
  const [hidden, rated, ratedIds, optedOut] = await Promise.all([
    hiddenAuthors(me),
    db.ratings.countDocuments({ userId: me }),
    db.ratings.distinct('postId', { userId: me, createdAt: { $gt: since } }),
    db.users.distinct('_id', { 'settings.showInRoulette': false }),
  ]);
  const [row] = await db.posts
    .aggregate([
      {
        $match: {
          _id: { $nin: ratedIds },
          hidden: false,
          kind: { $in: ['photo', 'drop'] },
          mediaUrl: { $ne: null },
          authorId: { $nin: [me, ...hidden, ...optedOut] },
          createdAt: { $gt: since },
        },
      },
      { $match: { $expr: { $gte: [TOTAL, 2] } } },
      { $sample: { size: 1 } },
    ])
    .toArray();
  if (!row) return res.json(null);
  const post = await serializePost(row, me);
  // Blind: hide the consensus until the vote is locked in.
  post.ratings = { ...post.ratings, dist: [0, 0, 0, 0, 0], avg: 0, consensusPct: 0, tier: 'chill' };
  res.json({ post, queuePosition: rated + 1 });
});

postsRouter.post('/roulette/vote', requireAuth, async (req, res) => {
  const me = uid(req);
  await rateLimit(`rate:${me}`, 90);
  const b = parse(z.object({ postId: z.string(), score: z.number().int().min(1).max(5) }), req.body);
  if (await db.ratings.findOne({ postId: b.postId, userId: me })) throw new HttpError(409, 'Already rated that one');
  const r = await applyRating(b.postId, me, b.score);
  if (!r.isNew) throw new HttpError(409, 'Already rated that one');
  const match = r.before.count > 0 && tierByScore(b.score).key === r.before.tier;
  const user = match
    ? await db.users.findOneAndUpdate({ _id: me }, { $inc: { comboCount: 1 } }, { returnDocument: 'after' })
    : await db.users.findOneAndUpdate({ _id: me }, { $set: { comboCount: 0 } }, { returnDocument: 'after' });
  const combo = user.comboCount;
  const mult = match ? comboMultiplier(combo) : 1;
  const sparks = match ? Math.round(ROULETTE_BASE_SPARKS * mult) : REWARDS.rate.sparks;
  const xp = match ? Math.round(ROULETTE_BASE_XP * mult) : REWARDS.rate.xp;
  let reward = await grant(me, sparks, xp, match ? `Consensus match! ${combo}x combo` : 'Vibe locked in');
  const quest = await progressRatingQuest(me);
  if (quest) reward = { ...quest, sparks: quest.sparks + reward.sparks, xp: quest.xp + reward.xp };
  const after = summarizeRatings([r.post.r1, r.post.r2, r.post.r3, r.post.r4, r.post.r5]);
  res.json({
    match,
    communityTier: r.before.tier,
    consensusPct: r.before.consensusPct,
    sparksEarned: sparks,
    xpEarned: xp,
    comboCount: combo,
    multiplier: mult,
    ratings: after,
    reward,
  });
});

export { userPublic };
