import { Router } from 'express';
import { z } from 'zod';
import {
  PROFILE_BACKGROUNDS,
  PREMIUM_PLANS,
  SHOWCASE_TYPES,
  WALL_MOODS,
  isApplePreviewUrl,
  layoutText,
  normalizeLayout,
  parseSpotify,
  premiumPlan,
  summarizeRatings,
  tierByScore,
} from '@chatlol/shared';
import { db, newId, now, today } from '../db.js';
import { config } from '../config.js';
import { optionalAuth, requireAuth, uid } from '../lib/auth.js';
import { HttpError, parse, rateLimit } from '../lib/http.js';
import { authorCache, invalidateStats, isPremium, serializePosts, teaserAvatar, userPrivate, DEFAULT_SETTINGS } from '../lib/serialize.js';
import { serializeShout } from './shouts.js';
import { emitWallet, notify } from '../lib/rewards.js';
import { assertClean, classify } from '../lib/moderation.js';
import { assertCanPost } from '../lib/enforcement.js';
import { screen } from '../lib/aiModeration.js';

export const profileRouter = Router();

// ——— Spotify (profile songs) ———
/** Track metadata from Spotify's public oEmbed endpoint — works without API keys. */
export async function resolveSpotify(input) {
  const ref = parseSpotify(input);
  if (!ref) return null;
  const url = `https://open.spotify.com/${ref.type}/${ref.id}`;
  try {
    const r = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(6000) });
    if (r.ok) {
      const j = await r.json();
      return { ...ref, title: String(j.title ?? '').slice(0, 120), artist: '', artUrl: j.thumbnail_url ?? null };
    }
  } catch {
    /* offline: keep the bare reference, the embed still plays */
  }
  return { ...ref, title: '', artist: '', artUrl: null };
}

let spotifyToken = { value: '', exp: 0 };
async function spotifyAccessToken() {
  if (spotifyToken.exp > Date.now() + 60_000) return spotifyToken.value;
  const auth = Buffer.from(`${config.spotify.clientId}:${config.spotify.clientSecret}`).toString('base64');
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!r.ok) throw new HttpError(502, 'Spotify is unavailable right now');
  const j = await r.json();
  spotifyToken = { value: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return spotifyToken.value;
}

/**
 * In-app song search. Uses Spotify when SPOTIFY_CLIENT_ID/SECRET are set (full songs via the Spotify player);
 * otherwise Apple Music's public search, which needs no keys (30-second previews).
 */
export async function searchSongs(q) {
  if (config.spotify.clientId && config.spotify.clientSecret) {
    const r = await fetch(`https://api.spotify.com/v1/search?type=track&limit=12&q=${encodeURIComponent(q)}`, {
      headers: { Authorization: `Bearer ${await spotifyAccessToken()}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new HttpError(502, 'Spotify search failed');
    const j = await r.json();
    return {
      source: 'spotify',
      tracks: (j.tracks?.items ?? []).map((t) => ({
        source: 'spotify',
        type: 'track',
        id: t.id,
        title: t.name,
        artist: t.artists.map((a) => a.name).join(', '),
        artUrl: t.album?.images?.at(-1)?.url ?? t.album?.images?.[0]?.url ?? null,
      })),
    };
  }
  let r;
  try {
    r = await fetch(`https://itunes.apple.com/search?media=music&entity=song&limit=15&term=${encodeURIComponent(q)}`, {
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new HttpError(502, 'Song search is unavailable right now');
  }
  if (!r.ok) throw new HttpError(502, 'Song search is unavailable right now');
  const j = await r.json();
  return {
    source: 'apple',
    tracks: (j.results ?? [])
      .filter((t) => t.trackId && isApplePreviewUrl(t.previewUrl))
      .map((t) => ({
        source: 'apple',
        type: 'track',
        id: String(t.trackId),
        title: String(t.trackName ?? '').slice(0, 120),
        artist: String(t.artistName ?? '').slice(0, 120),
        artUrl: t.artworkUrl100 ? String(t.artworkUrl100).replace('100x100', '300x300') : null,
        previewUrl: t.previewUrl,
        linkUrl: t.trackViewUrl ?? null,
      })),
  };
}

async function songSearchRoute(req, res) {
  await rateLimit(`songs:${uid(req)}`, 30);
  const q = String(req.query.q ?? '')
    .trim()
    .slice(0, 100);
  if (!q) return res.json({ enabled: true, source: config.spotify.clientId ? 'spotify' : 'apple', tracks: [] });
  res.json({ enabled: true, ...(await searchSongs(q)) });
}
profileRouter.get('/songs/search', requireAuth, songSearchRoute);
profileRouter.get('/spotify/search', requireAuth, songSearchRoute); // older app builds

profileRouter.get('/spotify/resolve', requireAuth, async (req, res) => {
  const song = await resolveSpotify(String(req.query.url ?? ''));
  if (!song) throw new HttpError(400, 'Paste a Spotify link to a song, album or playlist');
  res.json({ song });
});

// ——— Profile customisation ———
const HEX = /^#[0-9a-fA-F]{6}$/;
profileRouter.patch('/me/profile', requireAuth, async (req, res) => {
  const id = uid(req);
  const b = parse(
    z.object({
      gender: z.enum(['male', 'female']).optional(),
      headline: z.string().trim().max(80).optional(),
      accent: z.string().regex(HEX).optional(),
      coverUrl: z.string().url().max(600).nullable().optional(),
      background: z
        .object({ kind: z.enum(['preset', 'image', 'color']), value: z.string().max(600) })
        .refine(
          (bg) =>
            bg.kind === 'preset'
              ? PROFILE_BACKGROUNDS.some((p) => p.key === bg.value)
              : bg.kind === 'color'
                ? HEX.test(bg.value)
                : /^https?:\/\//.test(bg.value),
          'invalid background',
        )
        .optional(),
      /** Spotify link/URI, a picked search result, or null to remove the song. */
      song: z
        .union([
          z.string().max(300),
          z.object({
            source: z.enum(['spotify', 'apple']).optional(),
            type: z.string(),
            id: z.string().max(40),
            title: z.string().max(120).optional(),
            artist: z.string().max(120).optional(),
            artUrl: z.string().url().max(600).nullable().optional(),
            previewUrl: z.string().url().max(600).nullable().optional(),
            linkUrl: z.string().url().max(600).nullable().optional(),
          }),
          z.null(),
        ])
        .optional(),
    }),
    req.body,
  );
  if (b.headline) assertClean(b.headline);
  const set = {};
  if (b.gender) set.gender = b.gender;
  if (b.headline !== undefined) set['profile.headline'] = b.headline;
  if (b.accent) set['profile.accent'] = b.accent;
  if (b.coverUrl !== undefined) set['profile.coverUrl'] = b.coverUrl;
  if (b.background) set['profile.background'] = b.background;
  if (b.song !== undefined) {
    if (b.song === null) set['profile.song'] = null;
    else if (typeof b.song === 'object' && b.song.source === 'apple') {
      if (!/^\d{1,20}$/.test(b.song.id) || !isApplePreviewUrl(b.song.previewUrl)) throw new HttpError(400, 'That song can’t be played');
      const link = b.song.linkUrl && /^https:\/\/music\.apple\.com\//.test(b.song.linkUrl) ? b.song.linkUrl : null;
      set['profile.song'] = {
        source: 'apple',
        type: 'track',
        id: b.song.id,
        title: b.song.title ?? '',
        artist: b.song.artist ?? '',
        artUrl: b.song.artUrl ?? null,
        previewUrl: b.song.previewUrl,
        linkUrl: link,
      };
    } else {
      const ref = typeof b.song === 'string' ? await resolveSpotify(b.song) : parseSpotify(`spotify:${b.song.type}:${b.song.id}`) && b.song;
      if (!ref) throw new HttpError(400, 'That isn’t a Spotify link');
      set['profile.song'] = { source: 'spotify', type: ref.type, id: ref.id, title: ref.title ?? '', artist: ref.artist ?? '', artUrl: ref.artUrl ?? null };
    }
  }
  if (Object.keys(set).length) await db.users.updateOne({ _id: id }, { $set: set });
  invalidateStats(id);
  res.json({ user: await userPrivate(await db.users.findOne({ _id: id })) });
});

// ——— Profile page layout (the drag-and-drop builder) ———
profileRouter.put('/me/profile/layout', requireAuth, async (req, res) => {
  const id = uid(req);
  await rateLimit(`layout:${id}`, 30);
  if (!req.body || typeof req.body !== 'object' || !Array.isArray(req.body.sections)) throw new HttpError(400, 'Send a layout with sections');
  const layout = normalizeLayout(req.body);
  // Text boxes, quotes and links are public, so they get the full check (threats, scams, NemoGuard), not just the word list.
  const text = layoutText(layout);
  if (text) {
    assertClean(text);
    const verdict = await classify(text);
    if (!verdict.safe || verdict.severe) throw new HttpError(422, 'SafeShield caught something on your page — keep it kind 🧡', 'moderation_layout');
  }
  await db.users.updateOne({ _id: id }, { $set: { 'profile.layout': layout } });
  res.json({ user: await userPrivate(await db.users.findOne({ _id: id })), layout });
});

/**
 * Everything the profile's list sections need, in one request: friends (mutual follows), followers,
 * following, recent shouts, latest and top-rated photos, forum threads. `types` picks which; `limit` caps each.
 */
profileRouter.get('/users/:id/showcase', optionalAuth, async (req, res) => {
  const profileId = String(req.params.id);
  const types = String(req.query.types ?? '')
    .split(',')
    .filter((t) => SHOWCASE_TYPES.includes(t));
  const limit = Math.min(24, Math.max(1, Number(req.query.limit) || 12));
  const owner = await db.users.findOne({ _id: profileId, deletedAt: null }, { projection: { _id: 1 } });
  if (!owner) throw new HttpError(404, 'User not found');
  if (req.userId && (await db.blocks.findOne({ blockerId: profileId, blockedId: req.userId }))) throw new HttpError(404, 'User not found');
  const author = authorCache(req.userId);
  const people = async (ids) => (await Promise.all(ids.map(author))).filter((u) => u.handle !== 'deleted');
  const out = {};
  const want = (t) => types.includes(t);
  const photoFilter = { authorId: profileId, hidden: false, mediaUrl: { $ne: null }, kind: { $in: ['photo', 'drop'] } };
  await Promise.all([
    want('followers') &&
      db.follows
        .find({ followeeId: profileId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray()
        .then(async (rows) => (out.followers = await people(rows.map((r) => r.followerId)))),
    (want('following') || want('friends')) &&
      (async () => {
        const followees = await db.follows.distinct('followeeId', { followerId: profileId });
        if (want('following')) {
          const rows = await db.follows.find({ followerId: profileId }).sort({ createdAt: -1 }).limit(limit).toArray();
          out.following = await people(rows.map((r) => r.followeeId));
        }
        if (want('friends')) {
          const rows = followees.length
            ? await db.follows
                .find({ followerId: { $in: followees }, followeeId: profileId })
                .sort({ createdAt: -1 })
                .limit(limit)
                .toArray()
            : [];
          out.friends = await people(rows.map((r) => r.followerId));
        }
      })(),
    want('shouts') &&
      db.shouts
        .find({ authorId: profileId, hidden: { $ne: true } })
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray()
        .then(async (rows) => (out.shouts = await Promise.all(rows.map((r) => serializeShout(r, req.userId, author))))),
    want('photos') &&
      db.posts
        .find(photoFilter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray()
        .then(async (rows) => (out.photos = await serializePosts(rows, req.userId))),
    want('topPhotos') &&
      db.posts
        .aggregate([
          { $match: { ...photoFilter, $expr: { $gt: [{ $add: ['$r1', '$r2', '$r3', '$r4', '$r5'] }, 0] } } },
          {
            $addFields: {
              _n: { $add: ['$r1', '$r2', '$r3', '$r4', '$r5'] },
              _sum: { $add: ['$r1', { $multiply: ['$r2', 2] }, { $multiply: ['$r3', 3] }, { $multiply: ['$r4', 4] }, { $multiply: ['$r5', 5] }] },
            },
          },
          { $addFields: { _avg: { $divide: ['$_sum', '$_n'] } } },
          { $sort: { _avg: -1, _n: -1, createdAt: -1 } },
          { $limit: limit },
          { $project: { _n: 0, _sum: 0, _avg: 0 } },
        ])
        .toArray()
        .then(async (rows) => (out.topPhotos = await serializePosts(rows, req.userId))),
    want('threads') &&
      db.threads
        .find({ authorId: profileId, hidden: { $ne: true } })
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray()
        .then(async (rows) => {
          const boards = new Map((await db.boards.find({ _id: { $in: rows.map((t) => t.boardId) } }).toArray()).map((b) => [b._id, b]));
          out.threads = rows.map((t) => ({
              id: t._id,
              boardId: t.boardId,
              boardName: boards.get(t.boardId)?.name ?? '',
              title: t.title,
              replyCount: t.replyCount ?? 0,
              upvotes: t.upvotes ?? 0,
              createdAt: t.createdAt,
            }));
        }),
  ]);
  res.json(out);
});

// ——— Gallery ———
profileRouter.get('/users/:id/gallery', optionalAuth, async (req, res) => {
  const album = typeof req.query.album === 'string' && req.query.album ? req.query.album : null;
  const filter = { authorId: String(req.params.id), hidden: false, mediaUrl: { $ne: null }, kind: { $in: ['photo', 'drop'] } };
  const [rows, albums] = await Promise.all([
    db.posts
      .find(album ? { ...filter, album } : filter)
      .sort({ createdAt: -1 })
      .limit(60)
      .toArray(),
    db.posts.distinct('album', { ...filter, album: { $ne: null } }),
  ]);
  res.json({ albums, photos: await serializePosts(rows, req.userId) });
});

// ——— Profile ratings ———
export async function profileRatingSummary(profileId, viewerId) {
  const agg = await db.profileRatings.aggregate([{ $match: { profileId } }, { $group: { _id: '$score', n: { $sum: 1 } } }]).toArray();
  const dist = [1, 2, 3, 4, 5].map((s) => agg.find((a) => a._id === s)?.n ?? 0);
  const mine = viewerId ? await db.profileRatings.findOne({ profileId, userId: viewerId }) : null;
  return { ...summarizeRatings(dist), myRating: mine?.score ?? null };
}

profileRouter.post('/users/:id/rate', requireAuth, async (req, res) => {
  const me = uid(req);
  const profileId = String(req.params.id);
  await rateLimit(`profile-rate:${me}`, 60);
  const { score } = parse(z.object({ score: z.number().int().min(1).max(5) }), req.body);
  if (profileId === me) throw new HttpError(400, "You can't rate your own profile");
  const target = await db.users.findOne({ _id: profileId, deletedAt: null }, { projection: { _id: 1 } });
  if (!target) throw new HttpError(404, 'User not found');
  const prev = await db.profileRatings.findOneAndUpdate(
    { profileId, userId: me },
    { $set: { score, createdAt: now() } },
    { upsert: true, returnDocument: 'before' },
  );
  if (!prev && score >= 3) {
    const rater = await db.users.findOne({ _id: me }, { projection: { displayName: 1 } });
    const t = tierByScore(score);
    await notify(profileId, {
      kind: 'profile_rating',
      actorId: me,
      link: '/insights',
      title: `${rater.displayName} rated your profile ${t.label} ${t.emoji}`,
      anonTitle: `Someone rated your profile ${t.label} ${t.emoji}`,
      body: 'Tap to see your profile vibe.',
    });
  }
  res.json({ ratings: await profileRatingSummary(profileId, me) });
});

/** Records a profile view (once per viewer per day) and tells the owner. AI personas never "view" profiles. */
export async function recordProfileView(profileId, viewerId) {
  if (!viewerId || viewerId === profileId) return;
  const day = today();
  const fresh = await db.profileViews.insertIfMissing({ profileId, viewerId, day }, { at: now() });
  if (!fresh) {
    await db.profileViews.updateOne({ profileId, viewerId, day }, { $set: { at: now() } });
    return;
  }
  const viewer = await db.users.findOne({ _id: viewerId }, { projection: { displayName: 1 } });
  await notify(profileId, {
    kind: 'profile_view',
    actorId: viewerId,
    link: '/insights',
    title: `${viewer.displayName} viewed your profile 👀`,
    anonTitle: 'Someone viewed your profile 👀',
    body: 'Curious who? Check your insights.',
  });
}

// ——— Wall (guest notes) ———
const serializeNote = async (n, author) => ({
  id: n._id,
  profileId: n.profileId,
  author: await author(n.authorId),
  body: n.body,
  mood: n.mood ?? null,
  createdAt: n.createdAt,
});

profileRouter.get('/users/:id/wall', optionalAuth, async (req, res) => {
  const author = authorCache(req.userId);
  const rows = await db.wallNotes
    .find({ profileId: String(req.params.id), hidden: { $ne: true } })
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray();
  res.json({ notes: await Promise.all(rows.map((n) => serializeNote(n, author))) });
});

profileRouter.post('/users/:id/wall', requireAuth, async (req, res) => {
  const me = uid(req);
  const profileId = String(req.params.id);
  await rateLimit(`wall:${me}`, 6);
  const b = parse(
    z.object({
      body: z.string().trim().min(1).max(280),
      mood: z
        .enum(WALL_MOODS.map((m) => m.key))
        .nullable()
        .optional(),
    }),
    req.body,
  );
  const owner = await db.users.findOne({ _id: profileId, deletedAt: null });
  if (!owner) throw new HttpError(404, 'User not found');
  if (
    await db.blocks.findOne({
      $or: [
        { blockerId: profileId, blockedId: me },
        { blockerId: me, blockedId: profileId },
      ],
    })
  )
    throw new HttpError(403, "You can't post on this wall");
  const s = { ...DEFAULT_SETTINGS, ...owner.settings };
  if (profileId !== me) {
    if (s.wallFrom === 'nobody') throw new HttpError(403, `@${owner.handle}'s wall is closed`);
    if (s.wallFrom === 'following' && !(await db.follows.findOne({ followerId: profileId, followeeId: me })))
      throw new HttpError(403, `Only people @${owner.handle} follows can post on their wall`);
  }
  await assertCanPost(me);
  assertClean(b.body);
  const note = { _id: newId(), profileId, authorId: me, body: b.body, mood: b.mood ?? null, createdAt: now() };
  await db.wallNotes.insertOne(note);
  screen({ userId: me, text: b.body, ref: { type: 'wall', id: note._id }, targetId: profileId });
  if (profileId !== me) {
    const a = await db.users.findOne({ _id: me }, { projection: { displayName: 1, handle: 1 } });
    await notify(profileId, {
      kind: 'wall',
      actorId: me,
      link: `/u/${owner.handle}`,
      title: `${a.displayName} left a note on your wall`,
      body: b.body.slice(0, 120),
    });
  }
  res.status(201).json({ note: await serializeNote(note, authorCache(me)) });
});

profileRouter.delete('/wall/:id', requireAuth, async (req, res) => {
  const me = uid(req);
  const r = await db.wallNotes.deleteOne({ _id: String(req.params.id), $or: [{ authorId: me }, { profileId: me }] });
  if (!r.deletedCount) throw new HttpError(404, 'Note not found');
  res.json({ ok: true });
});

// ——— Insights: who viewed / rated / mentioned you (names are a Premium perk) ———
profileRouter.get('/me/insights', requireAuth, async (req, res) => {
  const me = uid(req);
  const premium = isPremium(await db.users.findOne({ _id: me }, { projection: { premium: 1 } }));
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [views, raters, mentions, viewCount, ratings] = await Promise.all([
    db.profileViews
      .find({ profileId: me, at: { $gt: since } })
      .sort({ at: -1 })
      .limit(50)
      .toArray(),
    db.profileRatings.find({ profileId: me }).sort({ createdAt: -1 }).limit(50).toArray(),
    db.shouts
      .find({ mentions: me, hidden: { $ne: true } })
      .sort({ createdAt: -1 })
      .limit(30)
      .toArray(),
    db.profileViews.countDocuments({ profileId: me, at: { $gt: since } }),
    profileRatingSummary(me),
  ]);
  const author = authorCache(me);
  const who = async (userId, key) =>
    premium ? { user: await author(userId), teaserAvatar: null } : { user: null, teaserAvatar: teaserAvatar(key) };
  res.json({
    premium,
    viewCount,
    ratings,
    views: await Promise.all(views.map(async (v) => ({ ...(await who(v.viewerId, `${v.viewerId}${v.day}`)), at: v.at }))),
    raters: await Promise.all(raters.map(async (r) => ({ ...(await who(r.userId, r.userId)), score: r.score, at: r.createdAt }))),
    mentions: await Promise.all(
      mentions.map(async (m) => ({ ...(await who(m.authorId, m._id)), shoutId: m._id, body: premium ? m.body : null, at: m.createdAt })),
    ),
  });
});

// ——— Premium ———
profileRouter.get('/premium', optionalAuth, async (req, res) => {
  const u = req.userId ? await db.users.findOne({ _id: req.userId }, { projection: { premium: 1, sparks: 1 } }) : null;
  res.json({
    plans: PREMIUM_PLANS,
    premiumUntil: isPremium(u) ? u.premium.until : null,
    sparks: u?.sparks ?? 0,
    stripe: !!config.payments.stripeSecretKey,
    iap: !!config.payments.revenueCatWebhookAuth,
  });
});

/** Extends (or starts) Premium by a plan's days. */
export async function extendPremium(userId, days) {
  const u = await db.users.findOne({ _id: userId }, { projection: { premium: 1 } });
  const from = isPremium(u) ? Date.parse(u.premium.until) : Date.now();
  const until = new Date(from + days * 86_400_000).toISOString();
  await db.users.updateOne({ _id: userId }, { $set: { 'premium.until': until } });
  return until;
}

profileRouter.post('/premium/buy', requireAuth, async (req, res) => {
  const me = uid(req);
  await rateLimit(`premium:${me}`, 10);
  const { planId } = parse(z.object({ planId: z.string() }), req.body);
  const plan = premiumPlan(planId);
  if (!plan) throw new HttpError(404, 'Unknown plan');
  const until = await db.tx(async () => {
    const paid = await db.users.updateOne({ _id: me, sparks: { $gte: plan.sparks } }, { $inc: { sparks: -plan.sparks } });
    if (!paid.modifiedCount)
      throw new HttpError(402, `Premium ${plan.label} costs ${plan.sparks.toLocaleString()} Sparks`, 'insufficient_sparks');
    return extendPremium(me, plan.days);
  });
  await emitWallet(me);
  await notify(me, {
    kind: 'system',
    title: 'Welcome to Premium 👑',
    body: `${plan.label} active until ${new Date(until).toDateString()}.`,
    link: '/insights',
  });
  res.json({ premiumUntil: until, user: await userPrivate(await db.users.findOne({ _id: me })) });
});
