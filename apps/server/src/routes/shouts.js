import { Router } from 'express';
import { z } from 'zod';
import { REACTIONS, SHOUT_COOLDOWN_SEC, SHOUT_MAX, SHOUT_MOODS } from '@chatlol/shared';
import { db, newId, now } from '../db.js';
import { assertEmojiOwned, resolveSticker, stickerInput } from '../lib/stickers.js';
import { optionalAuth, requireAuth, uid } from '../lib/auth.js';
import { HttpError, parse } from '../lib/http.js';
import { authorCache } from '../lib/serialize.js';
import { grant, notify } from '../lib/rewards.js';
import { assertClean } from '../lib/moderation.js';
import { assertCanPost } from '../lib/enforcement.js';
import { screen } from '../lib/aiModeration.js';
import { bus } from '../lib/events.js';
import { io, room } from '../lib/io.js';
import { shared } from '../lib/shared.js';

/**
 * The Global Shoutbox: one live notice board for the whole app. A shout is just a message (no title),
 * one every 45 seconds per person. People react, tag others with @handle, and reply by posting a shout
 * that quotes the original.
 */
export const shoutsRouter = Router();

const REACTION_KEYS = REACTIONS.map((r) => r.key);
const emptyReactions = () => Object.fromEntries(REACTION_KEYS.map((k) => [k, 0]));

export async function serializeShout(s, viewerId, author = authorCache(viewerId)) {
  const [mine, replyTo] = await Promise.all([
    viewerId ? db.shoutReactions.findOne({ shoutId: s._id, userId: viewerId }) : null,
    s.replyToId ? db.shouts.findOne({ _id: s.replyToId }) : null,
  ]);
  return {
    id: s._id,
    author: await author(s.authorId),
    body: s.body,
    sticker: s.sticker ?? null,
    mood: s.mood ?? null,
    mentions: s.mentionHandles ?? [],
    replyTo: replyTo
      ? { id: replyTo._id, author: await author(replyTo.authorId), body: replyTo.hidden ? '🛡️ removed' : replyTo.body.slice(0, 100) }
      : null,
    replyCount: s.replyCount ?? 0,
    reactions: { ...emptyReactions(), ...s.reactions },
    myReaction: mine?.kind ?? null,
    createdAt: s.createdAt,
  };
}

shoutsRouter.get('/shouts', optionalAuth, async (req, res) => {
  const p = parse(
    z.object({ before: z.string().optional(), mood: z.enum(SHOUT_MOODS.map((m) => m.key)).optional(), replyTo: z.string().optional() }),
    req.query,
  );
  const filter = { hidden: { $ne: true }, createdAt: { $lt: p.before ?? '9999' } };
  if (p.mood) filter.mood = p.mood;
  if (p.replyTo) filter.replyToId = p.replyTo;
  if (req.userId) {
    const blocked = await db.blocks.distinct('blockedId', { blockerId: req.userId });
    if (blocked.length) filter.authorId = { $nin: blocked };
  }
  const rows = await db.shouts.find(filter).sort({ createdAt: -1 }).limit(41).toArray();
  const author = authorCache(req.userId);
  const cooldown = req.userId ? await shoutCooldown(req.userId) : 0;
  res.json({
    items: await Promise.all(rows.slice(0, 40).map((s) => serializeShout(s, req.userId, author))),
    nextCursor: rows.length > 40 ? rows[39].createdAt : null,
    nextShoutAt: cooldown ? new Date(Date.now() + cooldown * 1000).toISOString() : null,
  });
});

/** Seconds until this user can shout again (0 = now). */
async function shoutCooldown(userId) {
  const last = await db.shouts.findOne({ authorId: userId }, { sort: { createdAt: -1 }, projection: { createdAt: 1 } });
  if (!last) return 0;
  return Math.max(0, Math.ceil(SHOUT_COOLDOWN_SEC - (Date.now() - Date.parse(last.createdAt)) / 1000));
}

/** Resolves @handles in the text (up to 5) to users. */
async function resolveMentions(body, authorId) {
  const handles = [...new Set((body.match(/@([a-zA-Z0-9_.]{3,20})/g) ?? []).map((h) => h.slice(1).replace(/\.$/, '').toLowerCase()))].slice(
    0,
    5,
  );
  if (!handles.length) return [];
  return (await db.users.find({ handleLower: { $in: handles }, deletedAt: null }, { projection: { handle: 1 } }).toArray()).filter(
    (u) => u._id !== authorId,
  );
}

export async function insertShout(authorId, { body, mood = null, replyToId = null, sticker = null }) {
  const replyTo = replyToId ? await db.shouts.findOne({ _id: replyToId, hidden: { $ne: true } }) : null;
  if (replyToId && !replyTo) throw new HttpError(404, 'That shout is gone');
  const mentioned = await resolveMentions(body, authorId);
  const shout = {
    _id: newId(),
    authorId,
    body,
    sticker,
    mood,
    replyToId: replyTo?._id ?? null,
    mentions: mentioned.map((u) => u._id),
    mentionHandles: mentioned.map((u) => u.handle),
    reactions: emptyReactions(),
    replyCount: 0,
    hidden: false,
    createdAt: now(),
  };
  await db.shouts.insertOne(shout);
  if (replyTo) await db.shouts.updateOne({ _id: replyTo._id }, { $inc: { replyCount: 1 } });
  const a = await db.users.findOne({ _id: authorId }, { projection: { displayName: 1 } });
  for (const u of mentioned) {
    await notify(u._id, {
      kind: 'mention',
      actorId: authorId,
      link: `/shouts?focus=${shout._id}`,
      title: `${a.displayName} mentioned you in a shout 📣`,
      anonTitle: 'Someone mentioned you in a shout 📣',
      body: body.slice(0, 120),
    });
  }
  if (replyTo && replyTo.authorId !== authorId && !shout.mentions.includes(replyTo.authorId)) {
    await notify(replyTo.authorId, {
      kind: 'mention',
      actorId: authorId,
      link: `/shouts?focus=${shout._id}`,
      title: `${a.displayName} replied to your shout`,
      body: body.slice(0, 120),
    });
  }
  io()
    ?.to(room.global)
    .emit('shout:new', await serializeShout(shout, null));
  bus.emitEvent('shout:created', { shoutId: shout._id, authorId, mentions: shout.mentions, replyToAuthorId: replyTo?.authorId ?? null });
  return shout;
}

shoutsRouter.post('/shouts', requireAuth, async (req, res) => {
  const me = uid(req);
  const b = parse(
    z.object({
      body: z.string().trim().max(SHOUT_MAX).default(''),
      sticker: stickerInput,
      mood: z
        .enum(SHOUT_MOODS.map((m) => m.key))
        .nullable()
        .optional(),
      replyToId: z.string().max(40).nullable().optional(),
    }),
    req.body,
  );
  if (!b.body && !b.sticker) throw new HttpError(400, 'Write something or pick a sticker');
  await assertCanPost(me);
  assertClean(b.body);
  await assertEmojiOwned(me, b.body);
  const sticker = await resolveSticker(me, b.sticker);
  // One shout every 45 seconds, enforced cluster-wide.
  if (!(await shared().setNx(`shout:cd:${me}`, '1', SHOUT_COOLDOWN_SEC * 1000))) {
    const wait = Math.max(1, await shoutCooldown(me));
    throw new HttpError(429, `Next shout in ${wait}s ⏳`, 'shout_cooldown');
  }
  const shout = await insertShout(me, { body: b.body, mood: b.mood ?? null, replyToId: b.replyToId ?? null, sticker });
  if (b.body) screen({ userId: me, text: b.body, ref: { type: 'shout', id: shout._id }, targetId: shout.mentions[0] ?? null });
  const reward = await grant(me, 2, 5, 'Shouted 📣');
  res.status(201).json({
    shout: await serializeShout(shout, me),
    nextShoutAt: new Date(Date.now() + SHOUT_COOLDOWN_SEC * 1000).toISOString(),
    reward,
  });
});

export async function reactToShout(shoutId, userId, kind) {
  const shout = await db.shouts.findOne({ _id: shoutId, hidden: { $ne: true } });
  if (!shout) throw new HttpError(404, 'That shout is gone');
  const prev = kind
    ? await db.shoutReactions.findOneAndUpdate({ shoutId, userId }, { $set: { kind } }, { upsert: true, returnDocument: 'before' })
    : await db.shoutReactions.findOneAndDelete({ shoutId, userId });
  const inc = {};
  if (prev?.kind && prev.kind !== kind) inc[`reactions.${prev.kind}`] = -1;
  if (kind && prev?.kind !== kind) inc[`reactions.${kind}`] = 1;
  const updated = Object.keys(inc) ? await db.shouts.findOneAndUpdate({ _id: shoutId }, { $inc: inc }, { returnDocument: 'after' }) : shout;
  io()
    ?.to(room.global)
    .emit('shout:reactions', { id: shoutId, reactions: { ...emptyReactions(), ...updated.reactions } });
  return updated;
}

shoutsRouter.post('/shouts/:id/react', requireAuth, async (req, res) => {
  const me = uid(req);
  const { kind } = parse(z.object({ kind: z.enum(REACTION_KEYS).nullable() }), req.body);
  const s = await reactToShout(String(req.params.id), me, kind);
  res.json({ shout: await serializeShout(s, me) });
});

shoutsRouter.delete('/shouts/:id', requireAuth, async (req, res) => {
  const me = uid(req);
  const isMod = !!req.userPerms?.includes('reports');
  const r = await db.shouts.updateOne({ _id: String(req.params.id), ...(isMod ? {} : { authorId: me }) }, { $set: { hidden: true } });
  if (!r.matchedCount) throw new HttpError(404, 'Not your shout');
  io()
    ?.to(room.global)
    .emit('content:removed', { type: 'shout', id: String(req.params.id) });
  res.json({ ok: true });
});

/** Sidebar: trending #tags in shouts and today's top shouters. */
shoutsRouter.get('/shouts/trending', optionalAuth, async (req, res) => {
  const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const [tags, top] = await Promise.all([
    db.shouts
      .aggregate([
        { $match: { hidden: { $ne: true }, createdAt: { $gt: since } } },
        { $project: { tags: { $regexFindAll: { input: '$body', regex: /#([A-Za-z0-9_]{2,30})/ } } } },
        { $unwind: '$tags' },
        { $group: { _id: { $toLower: { $arrayElemAt: ['$tags.captures', 0] } }, n: { $sum: 1 } } },
        { $sort: { n: -1 } },
        { $limit: 6 },
      ])
      .toArray(),
    db.shouts
      .aggregate([
        { $match: { hidden: { $ne: true }, createdAt: { $gt: since } } },
        {
          $group: {
            _id: '$authorId',
            shouts: { $sum: 1 },
            reps: { $sum: { $add: ['$reactions.fire', '$reactions.heart', '$reactions.lol', '$reactions.wow', '$reactions.hundred'] } },
          },
        },
        { $sort: { reps: -1, shouts: -1 } },
        { $limit: 5 },
      ])
      .toArray(),
  ]);
  const author = authorCache(req.userId);
  res.json({
    tags: tags.map((t) => ({ tag: t._id, count: t.n })),
    top: await Promise.all(top.map(async (t, i) => ({ rank: i + 1, user: await author(t._id), shouts: t.shouts, reps: t.reps }))),
  });
});
