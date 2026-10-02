import { Router } from 'express';
import { db } from '../db.js';
import { optionalAuth } from '../lib/auth.js';
import { authorCache, serializePost, serializePosts, serializeTake, serializeThread } from '../lib/serialize.js';
import { presence } from '../lib/presence.js';
import { ensureDrop } from '../lib/drops.js';
import { serializeStream } from './live.js';
import { serializeLounge } from './social.js';
import { serializeShout } from './shouts.js';
import { birthdayKey, birthdaysToday } from '../lib/birthdays.js';

/** The home dashboard: one request with a slice of every section (each links to its full page in the clients). */
export const homeRouter = Router();

const TOTAL = { $add: ['$r1', '$r2', '$r3', '$r4', '$r5'] };
const WEIGHTED = {
  $add: ['$r1', { $multiply: [2, '$r2'] }, { $multiply: [3, '$r3'] }, { $multiply: [4, '$r4'] }, { $multiply: [5, '$r5'] }],
};

/** Authors with the best average rating over posts since `since`, at least `min` votes. */
async function topRated(since, min, limit) {
  return db.posts
    .aggregate([
      { $match: { hidden: false, ...(since ? { createdAt: { $gt: since } } : {}) } },
      { $group: { _id: '$authorId', w: { $sum: WEIGHTED }, n: { $sum: TOTAL } } },
      { $match: { n: { $gte: min } } },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'u',
          pipeline: [{ $project: { deletedAt: 1, moderation: 1 } }],
        },
      },
      { $match: { 'u.deletedAt': null, 'u.moderation.status': { $ne: 'banned' } } },
      { $addFields: { avg: { $divide: ['$w', '$n'] } } },
      { $sort: { avg: -1, n: -1 } },
      { $limit: limit },
    ])
    .toArray();
}

homeRouter.get('/home', optionalAuth, async (req, res) => {
  const viewer = req.userId;
  const author = authorCache(viewer);
  const week = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const blocked = viewer ? await db.blocks.distinct('blockedId', { blockerId: viewer }) : [];
  const optedOut = await db.users.distinct('_id', { 'settings.showInRoulette': false });

  const [birthdays, popular, fame, threads, streams, shouts, drop, takes, lounges, newest, rateCandidates, members] = await Promise.all([
    birthdaysToday(),
    topRated(week, 3, 12),
    topRated(null, 5, 5),
    db.threads
      .find({ hidden: { $ne: true } })
      .sort({ lastActivityAt: -1 })
      .limit(30)
      .toArray(),
    db.streams.find({ endedAt: null }).sort({ giftsTotal: -1, startedAt: -1 }).limit(4).toArray(),
    db.shouts
      .find({ hidden: { $ne: true }, authorId: { $nin: blocked } })
      .sort({ createdAt: -1 })
      .limit(6)
      .toArray(),
    ensureDrop(),
    db.hotTakes.find({ resolved: false }).sort({ agreePool: -1 }).limit(3).toArray(),
    db.lounges.find({}).sort({ position: 1 }).toArray(),
    db.users
      .find({ deletedAt: null, isAi: false, 'moderation.status': { $ne: 'banned' } })
      .sort({ createdAt: -1 })
      .limit(8)
      .toArray(),
    // Rate & Meet: recent photos the viewer hasn't rated yet.
    db.posts
      .aggregate([
        {
          $match: {
            hidden: false,
            inFeed: { $ne: false },
            mediaUrl: { $ne: null },
            kind: { $in: ['photo', 'drop'] },
            authorId: { $nin: [viewer, ...blocked, ...optedOut].filter(Boolean) },
            createdAt: { $gt: week },
          },
        },
        { $sample: { size: 12 } },
      ])
      .toArray(),
    db.users.countDocuments({ deletedAt: null }),
  ]);

  // Popular members: best-rated this week, online people first.
  const popularUsers = await Promise.all(popular.map((p) => author(p._id)));
  popularUsers.sort((a, b) => Number(b.online) - Number(a.online));

  const ratedIds = viewer
    ? new Set(await db.ratings.distinct('postId', { userId: viewer, postId: { $in: rateCandidates.map((p) => p._id) } }))
    : new Set();
  const rateNext = rateCandidates.find((p) => !ratedIds.has(p._id)) ?? null;

  const hot = (t) => (t.upvotes + t.replyCount * 2 + 1) / ((Date.now() - Date.parse(t.lastActivityAt)) / 3_600_000 + 2);
  const dropEntries = await db.posts.find({ dropId: drop._id, hidden: false }).sort({ r5: -1, createdAt: -1 }).limit(6).toArray();
  const loungeCards = await Promise.all(lounges.map((l) => serializeLounge(l, author)));
  const year = new Date().getUTCFullYear();
  const birthdayPosts = new Map(
    (await db.posts.find({ systemKey: { $in: birthdays.map((u) => birthdayKey(u._id, year)) } }, { projection: { systemKey: 1 } }).toArray()).map((p) => [p.systemKey, p._id]),
  );

  res.json({
    stats: { members, online: await presence.count() },
    popularMembers: popularUsers.slice(0, 10),
    rate: rateNext ? await serializePost(rateNext, viewer, author) : null,
    forums: await Promise.all(
      threads
        .sort((a, b) => hot(b) - hot(a))
        .slice(0, 5)
        .map((t) => serializeThread(t, viewer, author)),
    ),
    streams: await Promise.all(streams.map((s) => serializeStream(s, author))),
    hallOfFame: await Promise.all(
      fame.map(async (f, i) => ({ rank: i + 1, user: await author(f._id), score: Math.round(((f.avg - 1) / 4) * 100) / 10 })),
    ),
    shouts: await Promise.all(shouts.map((s) => serializeShout(s, viewer, author))),
    drop: { id: drop._id, prompt: drop.prompt, emoji: drop.emoji, endsAt: drop.endsAt, entries: await serializePosts(dropEntries, viewer) },
    arena: await Promise.all(takes.map((t) => serializeTake(t, viewer, author))),
    lounges: loungeCards.sort((a, b) => b.onlineCount - a.onlineCount).slice(0, 4),
    newMembers: await Promise.all(newest.map((u) => author(u._id))),
    birthdays: await Promise.all(
      birthdays
        .filter((u) => !blocked.includes(u._id))
        .map(async (u) => ({ user: await author(u._id), postId: birthdayPosts.get(birthdayKey(u._id, new Date().getUTCFullYear())) ?? null })),
    ),
  });
});
