import { isKing } from './king.js';
import { cleanCounts, myReaction } from './reactions.js';
import { friendshipStatus } from './friends.js';
import {
  summarizeRatings,
  levelForXp,
  tierByScore,
  REWARDS,
  gemPriceFor,
  normalizeLayout,
  permissionsOf,
  activePowers,
  stripPremiumLayout,
  PREMIUM_PROFILE,
  themeAllowed,
  DEFAULT_APP_THEME,
} from '@chatlol/shared';
import { db, now, today } from '../db.js';
import { presence } from './presence.js';

export const DEFAULT_SETTINGS = {
  pushEnabled: true,
  emailDigest: false,
  dmFrom: 'everyone',
  showOnline: true,
  safeMode: true,
  hapticsEnabled: true,
  soundEnabled: true,
  darkMode: 'system',
  appTheme: { preset: 'sunset', custom: null },
  breakReminderMins: 0,
  showAIPersonas: true,
  // Privacy
  whoCanComment: 'everyone', // everyone | following
  wallFrom: 'everyone', // everyone | following | nobody
  friendRequestsFrom: 'everyone', // everyone | friends_of_friends | nobody
  profileVisibility: 'everyone', // everyone | members (signed-in only)
  showGender: true,
  showCity: true,
  showInRoulette: true,
  ghostMode: false, // hide yourself from lounge presence
  // Notifications by kind
  notifyRatings: true,
  notifyComments: true,
  notifyFollows: true,
  notifyDms: true,
  notifyMentions: true,
  notifyLive: true,
  notifyArena: true,
  // Experience
  autoplayMusic: true, // play other people's profile songs automatically
  reduceMotion: false,
  celebrateBirthday: true, // system birthday post + follower notifications on your birthday
};

/** Empty profile customisation. */
export const DEFAULT_PROFILE = {
  song: null,
  background: { kind: 'preset', value: 'sunset' },
  accent: '#ff5e00',
  headline: '',
  coverUrl: null,
};

/** A complete user document with defaults; pass the fields you know. */
export function newUser(fields) {
  return {
    email: null,
    passwordHash: null,
    bio: '',
    pronouns: '',
    city: '',
    interests: [],
    xp: 0,
    sparks: 250,
    gems: 0,
    streakDays: 0,
    lastDropDay: null,
    lastDailyClaim: null,
    comboCount: 0,
    badges: [],
    cosmetics: { frame: null, flair: null, theme: null, banner: null },
    settings: { ...DEFAULT_SETTINGS },
    isAi: false,
    personaId: null,
    gender: null,
    role: 'user', // user | mod | admin
    profile: { ...DEFAULT_PROFILE },
    moderation: { status: 'active', until: null, reason: null },
    emailVerifiedAt: null,
    deletedAt: null,
    ...fields,
    handleLower: fields.handle.toLowerCase(),
  };
}

const statsCache = new Map();
const STATS_TTL = 20_000;

export function invalidateStats(userId) {
  statsCache.delete(userId);
}

async function stats(userId) {
  const c = statsCache.get(userId);
  if (c && Date.now() - c.at < STATS_TTL) return c;
  const [r = { r1: 0, r2: 0, r3: 0, r4: 0, r5: 0 }] = await db.posts
    .aggregate([
      { $match: { authorId: userId, hidden: false } },
      {
        $group: {
          _id: null,
          r1: { $sum: '$r1' },
          r2: { $sum: '$r2' },
          r3: { $sum: '$r3' },
          r4: { $sum: '$r4' },
          r5: { $sum: '$r5' },
        },
      },
    ])
    .toArray();
  const n = r.r1 + r.r2 + r.r3 + r.r4 + r.r5;
  const avg = n ? (r.r1 + 2 * r.r2 + 3 * r.r3 + 4 * r.r4 + 5 * r.r5) / n : 0;
  const followees = await db.follows.distinct('followeeId', { followerId: userId });
  const [followers, friends] = await Promise.all([
    db.follows.countDocuments({ followeeId: userId }),
    db.friendships.countDocuments({ $or: [{ a: userId }, { b: userId }] }),
  ]);
  if (statsCache.size > 20_000) statsCache.clear();
  const s = {
    vibeAvg: Math.round(avg * 100) / 100,
    ratingsReceived: n,
    friends,
    followers,
    following: followees.length,
    at: Date.now(),
  };
  statsCache.set(userId, s);
  return s;
}

const NO_COSMETICS = { frame: null, flair: null, theme: null, banner: null };

export async function userPublic(u, viewerId) {
  const s = await stats(u._id);
  const settings = { ...DEFAULT_SETTINGS, ...u.settings };
  const profile = { ...DEFAULT_PROFILE, ...u.profile };
  const out = {
    id: u._id,
    handle: u.handle,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl,
    bio: u.bio ?? '',
    pronouns: u.pronouns ?? '',
    city: settings.showCity ? (u.city ?? '') : '',
    gender: settings.showGender ? (u.gender ?? null) : null,
    // Premium looks only show while Premium is active.
    profile: {
      song: isPremium(u) ? profile.song : null,
      background:
        isPremium(u) || !PREMIUM_PROFILE.backgroundKinds.includes(profile.background?.kind) ? profile.background : DEFAULT_PROFILE.background,
      accent: profile.accent,
      headline: profile.headline,
      coverUrl: profile.coverUrl,
    },
    interests: u.interests ?? [],
    level: levelForXp(u.xp),
    xp: u.xp,
    vibeAvg: s.vibeAvg,
    vibeTier: s.ratingsReceived ? tierByScore(s.vibeAvg).key : 'chill',
    ratingsReceived: s.ratingsReceived,
    streakDays: effectiveStreak(u),
    friendsCount: s.friends,
    followersCount: s.followers,
    followingCount: s.following,
    online: settings.showOnline && (await presence.isOnline(u._id)),
    lastSeenAt: u.lastSeenAt,
    badges: u.badges ?? [],
    cosmetics: { ...NO_COSMETICS, ...u.cosmetics },
    isAI: !!u.isAi,
    premium: isPremium(u),
    boosted: !!(u.boost?.until && u.boost.until > now()),
    isKing: await isKing(u._id),
    createdAt: u.createdAt,
  };
  if (viewerId && viewerId !== u._id) {
    out.isFollowing = !!(await db.follows.findOne({ followerId: viewerId, followeeId: u._id }));
    out.friendship = await friendshipStatus(viewerId, u._id);
  }
  return out;
}

/** A streak survives until the end of the day after the last drop. */
export function effectiveStreak(u) {
  if (!u.lastDropDay) return 0;
  const yesterday = today(new Date(Date.now() - 86_400_000));
  return u.lastDropDay >= yesterday ? u.streakDays : 0;
}

/** Adds the profile page layout — only where a whole profile is shown, so feeds don't carry it on every author. */
export function withLayout(pub, u) {
  const layout = normalizeLayout(u.profile?.layout);
  return { ...pub, profile: { ...pub.profile, layout: isPremium(u) ? layout : stripPremiumLayout(layout).layout } };
}

export async function userPrivate(u) {
  const done = (await db.dailyCounters.findOne({ userId: u._id, day: today(), key: 'rate' }))?.n ?? 0;
  return {
    ...withLayout(await userPublic(u), u),
    online: true,
    email: u.email ?? '',
    emailVerified: !!u.emailVerifiedAt,
    sparks: u.sparks,
    gems: u.gems ?? 0,
    gold: u.gold ?? 0,
    dailyGoal: { done: Math.min(done, REWARDS.questDailyOracle.target), target: REWARDS.questDailyOracle.target },
    comboCount: u.comboCount ?? 0,
    settings: { ...DEFAULT_SETTINGS, ...u.settings, appTheme: effectiveTheme(u) },
    unlockedThemes: u.unlockedThemes ?? [],
    gender: u.gender ?? null,
    city: u.city ?? '',
    role: u.role ?? 'user',
    perms: permissionsOf(u),
    premiumUntil: isPremium(u) ? u.premium.until : null,
    powers: activePowers(u),
    loginStreak: u.loginStreak ?? 0,
    progressResetAt: u.progressResetAt ?? null,
    moderation: { status: 'active', until: null, reason: null, ...u.moderation },
  };
}

/** The theme a member actually gets: custom colours are gone, and a locked theme (Premium ran out) falls back to Sunset. */
function effectiveTheme(u) {
  const t = u.settings?.appTheme;
  return t && themeAllowed(t.preset, { premium: isPremium(u), unlocked: u.unlockedThemes ?? [] }) ? { preset: t.preset, custom: null } : DEFAULT_APP_THEME;
}

export const userById = (id) => db.users.findOne({ _id: id });

/** Per-request cache so a feed page doesn't re-query the same author 20 times. */
export function authorCache(viewerId) {
  const m = new Map();
  const get = (id) => {
    let u = m.get(id);
    if (!u) {
      u = userById(id).then((row) => (row ? userPublic(row, viewerId) : ghostUser(id)));
      m.set(id, u);
    }
    return u;
  };
  get.viewerId = viewerId; // lets serializers add the viewer's own reaction
  return get;
}

function ghostUser(id) {
  return {
    id,
    handle: 'deleted',
    displayName: 'Deleted user',
    avatarUrl: '',
    bio: '',
    pronouns: '',
    city: '',
    interests: [],
    level: 1,
    xp: 0,
    vibeAvg: 0,
    vibeTier: 'chill',
    ratingsReceived: 0,
    streakDays: 0,
    friendsCount: 0,
    followersCount: 0,
    followingCount: 0,
    online: false,
    lastSeenAt: new Date(0).toISOString(),
    badges: [],
    cosmetics: { frame: null, flair: null, theme: null, banner: null },
    isAI: false,
    createdAt: new Date(0).toISOString(),
  };
}

export async function serializePost(p, viewerId, author = authorCache(viewerId)) {
  const dist = [p.r1, p.r2, p.r3, p.r4, p.r5];
  const reactions = { fire: 0, heart: 0, lol: 0, wow: 0, hundred: 0 };
  const [reactRows, mine] = await Promise.all([
    db.reactions.aggregate([{ $match: { postId: p._id } }, { $group: { _id: '$kind', n: { $sum: 1 } } }]).toArray(),
    viewerId
      ? Promise.all([
          db.ratings.findOne({ postId: p._id, userId: viewerId }),
          db.reactions.findOne({ postId: p._id, userId: viewerId }),
          p.kind === 'battle' ? db.battleVotes.findOne({ postId: p._id, userId: viewerId }) : null,
        ])
      : [null, null, null],
  ]);
  for (const r of reactRows) reactions[r._id] = r.n;
  const battle = p.battle?.map((o) => ({ id: o.id, label: o.label, mediaUrl: o.mediaUrl ?? undefined, votes: o.votes })) ?? null;
  return {
    id: p._id,
    author: await author(p.authorId),
    kind: p.kind,
    body: p.body,
    mediaUrl: p.mediaUrl ?? null,
    tags: p.tags ?? [],
    dropId: p.dropId ?? null,
    battle,
    ratings: summarizeRatings(dist),
    reactions,
    commentCount: p.commentCount,
    myRating: mine[0]?.score ?? null,
    myReaction: mine[1]?.kind ?? null,
    myBattleVote: mine[2]?.optionId ?? null,
    soundtrack: p.soundtrack ?? null,
    system: !!p.system,
    album: p.album ?? null,
    inFeed: p.inFeed !== false,
    createdAt: p.createdAt,
  };
}

export const serializePosts = (rows, viewerId) => {
  const author = authorCache(viewerId);
  return Promise.all(rows.map((r) => serializePost(r, viewerId, author)));
};

export async function serializeComment(c, author = authorCache()) {
  const rating = (await db.ratings.findOne({ postId: c.postId, userId: c.authorId }))?.score ?? null;
  return {
    id: c._id,
    postId: c.postId,
    author: await author(c.authorId),
    body: c.body,
    sticker: c.sticker ?? null,
    rating,
    reactions: cleanCounts(c.reactions),
    myReaction: await myReaction('comment', c._id, author.viewerId),
    createdAt: c.createdAt,
  };
}

export async function serializeMessage(m, author = authorCache()) {
  return {
    id: m._id,
    roomId: m.roomId,
    author: await author(m.authorId),
    body: m.body,
    mediaUrl: m.mediaUrl ?? null,
    kind: m.kind ?? 'text',
    sticker: m.sticker ?? null,
    replyToId: m.replyToId ?? null,
    reactions: cleanCounts(m.reactions),
    myReaction: await myReaction('message', m._id, author.viewerId),
    createdAt: m.createdAt,
  };
}

export async function serializeTake(t, viewerId, author = authorCache(viewerId)) {
  const stake = viewerId ? await db.stakes.findOne({ takeId: t._id, userId: viewerId }) : null;
  return {
    id: t._id,
    category: t.category,
    statement: t.statement,
    imageUrl: t.imageUrl ?? null,
    agreePool: t.agreePool,
    disagreePool: t.disagreePool,
    agreeCount: t.agreeCount,
    disagreeCount: t.disagreeCount,
    endsAt: t.endsAt,
    resolved: !!t.resolved,
    outcome: t.outcome ?? null,
    myStake: stake ? { side: stake.side, amount: stake.amount } : null,
    author: t.authorId ? await author(t.authorId) : null,
  };
}

export async function serializeThread(t, viewerId, author = authorCache(viewerId)) {
  const v = viewerId ? ((await db.threadVotes.findOne({ threadId: t._id, userId: viewerId }))?.v ?? 0) : 0;
  return {
    id: t._id,
    board: t.boardId,
    title: t.title,
    body: t.body,
    author: await author(t.authorId),
    upvotes: t.upvotes,
    replyCount: t.replyCount,
    pinned: !!t.pinned,
    myVote: v,
    lastActivityAt: t.lastActivityAt,
    createdAt: t.createdAt,
  };
}

export async function serializeReply(r, author = authorCache()) {
  return {
    id: r._id,
    threadId: r.threadId,
    author: await author(r.authorId),
    body: r.body,
    upvotes: r.upvotes,
    reactions: cleanCounts(r.reactions),
    myReaction: await myReaction('reply', r._id, author.viewerId),
    createdAt: r.createdAt,
  };
}

export const isPremium = (u) => !!u?.premium?.until && u.premium.until > new Date().toISOString();

/** A stable, random-looking stranger photo for "Someone…" teasers (shown blurred by the clients). */
export const teaserAvatar = (seed) =>
  `https://i.pravatar.cc/120?img=${(Math.abs([...String(seed)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % 70) + 1}`;

export async function serializeNotification(n, author = authorCache(), viewerPremium = true) {
  const anonymous = !!n.anonTitle && !viewerPremium;
  return {
    id: n._id,
    kind: n.kind,
    title: anonymous ? n.anonTitle : n.title,
    body: n.body,
    actor: n.actorId && !anonymous ? await author(n.actorId) : null,
    anonymous,
    teaserAvatar: anonymous ? teaserAvatar(n._id) : null,
    link: anonymous && n.kind === 'profile_view' ? '/premium' : (n.link ?? null),
    read: !!n.read,
    createdAt: n.createdAt,
  };
}

export function serializeStoreItem(i, owned, equipped, qty) {
  return {
    // Store items are addressed by their key (frame_sunset…), which is also what cosmetics store.
    id: i.key,
    kind: i.kind,
    name: i.name,
    description: i.description,
    price: i.price,
    gemPrice: i.goldPrice ? null : gemPriceFor(i.kind, i.price),
    /** Gold-only items (tickets, the King's crown) have a Gold price and no Sparks / Gem price. */
    goldPrice: i.goldPrice ?? null,
    rarity: i.rarity,
    emoji: i.emoji,
    preview: i.preview,
    limited: !!i.limited,
    owned,
    equipped,
    qty: qty ?? (owned ? 1 : 0),
  };
}
