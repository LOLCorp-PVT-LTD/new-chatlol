import type {
  UserPublic, UserPrivate, Post, Comment, ChatMessage, HotTake, ShoutThread, ShoutReply, NotificationItem,
  StoreItem, UserSettings, Cosmetics, BattleOption, ReactionKind, VibeScore,
} from '@chatlol/shared';
import { summarizeRatings, levelForXp, tierByScore, REWARDS, gemPriceFor } from '@chatlol/shared';
import { db, json, today, type Row } from '../db';
import { presence } from './presence';

export const DEFAULT_SETTINGS: UserSettings = {
  pushEnabled: true,
  emailDigest: false,
  dmFrom: 'everyone',
  showOnline: true,
  safeMode: true,
  hapticsEnabled: true,
  soundEnabled: true,
  darkMode: 'system',
  breakReminderMins: 0,
  showAIPersonas: true,
};

interface Stats { vibeAvg: number; ratingsReceived: number; friends: number; followers: number; following: number; at: number }
const statsCache = new Map<string, Stats>();
const STATS_TTL = 20_000;

export function invalidateStats(userId: string) { statsCache.delete(userId); }

async function stats(userId: string): Promise<Stats> {
  const c = statsCache.get(userId);
  if (c && Date.now() - c.at < STATS_TTL) return c;
  const r = (await db.one<Row>(
    `SELECT COALESCE(SUM(r1),0) AS r1, COALESCE(SUM(r2),0) AS r2, COALESCE(SUM(r3),0) AS r3, COALESCE(SUM(r4),0) AS r4, COALESCE(SUM(r5),0) AS r5
     FROM posts WHERE author_id = ? AND hidden = 0`, userId))!;
  const n = r.r1 + r.r2 + r.r3 + r.r4 + r.r5;
  const avg = n ? (r.r1 + 2 * r.r2 + 3 * r.r3 + 4 * r.r4 + 5 * r.r5) / n : 0;
  const f = (await db.one<Row>(
    `SELECT
      (SELECT COUNT(*) FROM follows WHERE followee_id = ?) AS followers,
      (SELECT COUNT(*) FROM follows WHERE follower_id = ?) AS following,
      (SELECT COUNT(*) FROM follows a JOIN follows b ON a.followee_id = b.follower_id AND b.followee_id = a.follower_id WHERE a.follower_id = ?) AS friends`,
    userId, userId, userId))!;
  if (statsCache.size > 20_000) statsCache.clear();
  const s = { vibeAvg: Math.round(avg * 100) / 100, ratingsReceived: n, friends: f.friends, followers: f.followers, following: f.following, at: Date.now() };
  statsCache.set(userId, s);
  return s;
}

export async function userPublic(row: Row, viewerId?: string | null): Promise<UserPublic> {
  const s = await stats(row.id);
  const settings = { ...DEFAULT_SETTINGS, ...json<Partial<UserSettings>>(row.settings, {}) };
  const out: UserPublic = {
    id: row.id,
    handle: row.handle,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    bio: row.bio,
    pronouns: row.pronouns,
    city: row.city,
    interests: json<string[]>(row.interests, []),
    level: levelForXp(row.xp),
    xp: row.xp,
    vibeAvg: s.vibeAvg,
    vibeTier: s.ratingsReceived ? tierByScore(s.vibeAvg).key : 'chill',
    ratingsReceived: s.ratingsReceived,
    streakDays: effectiveStreak(row),
    friendsCount: s.friends,
    followersCount: s.followers,
    followingCount: s.following,
    online: settings.showOnline && (await presence.isOnline(row.id)),
    lastSeenAt: row.last_seen_at,
    badges: json<string[]>(row.badges, []),
    cosmetics: json<Cosmetics>(row.cosmetics, { frame: null, flair: null, theme: null, banner: null }),
    isAI: !!row.is_ai,
    createdAt: row.created_at,
  };
  if (viewerId && viewerId !== row.id) {
    out.isFollowing = !!(await db.one('SELECT 1 AS x FROM follows WHERE follower_id = ? AND followee_id = ?', viewerId, row.id));
  }
  return out;
}

/** A streak survives until the end of the day after the last drop. */
export function effectiveStreak(row: Row) {
  if (!row.last_drop_day) return 0;
  const yesterday = today(new Date(Date.now() - 86_400_000));
  return row.last_drop_day >= yesterday ? row.streak_days : 0;
}

export async function userPrivate(row: Row): Promise<UserPrivate> {
  const done = (await db.one<Row>('SELECT n FROM daily_counters WHERE user_id = ? AND day = ? AND key = ?', row.id, today(), 'rate'))?.n ?? 0;
  return {
    ...(await userPublic(row)),
    online: true,
    email: row.email ?? '',
    emailVerified: !!row.email_verified_at,
    sparks: row.sparks,
    gems: row.gems ?? 0,
    dailyGoal: { done: Math.min(done, REWARDS.questDailyOracle.target), target: REWARDS.questDailyOracle.target },
    comboCount: row.combo_count,
    settings: { ...DEFAULT_SETTINGS, ...json<Partial<UserSettings>>(row.settings, {}) },
  };
}

export const userById = (id: string) => db.one<Row>('SELECT * FROM users WHERE id = ?', id);

export type AuthorFn = (id: string) => Promise<UserPublic>;

/** Per-request cache so a feed page doesn't re-query the same author 20 times. */
export function authorCache(viewerId?: string | null): AuthorFn {
  const m = new Map<string, Promise<UserPublic>>();
  return (id: string) => {
    let u = m.get(id);
    if (!u) {
      u = userById(id).then((row) => (row ? userPublic(row, viewerId) : ghostUser(id)));
      m.set(id, u);
    }
    return u;
  };
}

function ghostUser(id: string): UserPublic {
  return {
    id, handle: 'deleted', displayName: 'Deleted user', avatarUrl: '', bio: '', pronouns: '', city: '', interests: [],
    level: 1, xp: 0, vibeAvg: 0, vibeTier: 'chill', ratingsReceived: 0, streakDays: 0, friendsCount: 0, followersCount: 0,
    followingCount: 0, online: false, lastSeenAt: new Date(0).toISOString(), badges: [],
    cosmetics: { frame: null, flair: null, theme: null, banner: null }, isAI: false, createdAt: new Date(0).toISOString(),
  };
}

export async function serializePost(row: Row, viewerId: string | null | undefined, author = authorCache(viewerId)): Promise<Post> {
  const dist: [number, number, number, number, number] = [row.r1, row.r2, row.r3, row.r4, row.r5];
  const reactions: Record<ReactionKind, number> = { fire: 0, heart: 0, lol: 0, wow: 0, hundred: 0 };
  const [reactRows, battleRows, mine] = await Promise.all([
    db.all<Row>('SELECT kind, COUNT(*) AS n FROM reactions WHERE post_id = ? GROUP BY kind', row.id),
    row.kind === 'battle' ? db.all<Row>('SELECT * FROM battle_options WHERE post_id = ? ORDER BY position', row.id) : Promise.resolve(null),
    viewerId
      ? Promise.all([
          db.one<Row>('SELECT score FROM ratings WHERE post_id = ? AND user_id = ?', row.id, viewerId),
          db.one<Row>('SELECT kind FROM reactions WHERE post_id = ? AND user_id = ?', row.id, viewerId),
          db.one<Row>('SELECT option_id FROM battle_votes WHERE post_id = ? AND user_id = ?', row.id, viewerId),
        ])
      : Promise.resolve([undefined, undefined, undefined] as const),
  ]);
  for (const r of reactRows) reactions[r.kind as ReactionKind] = r.n;
  const battle: BattleOption[] | null = battleRows?.map((o) => ({ id: o.id, label: o.label, mediaUrl: o.media_url ?? undefined, votes: o.votes })) ?? null;
  return {
    id: row.id,
    author: await author(row.author_id),
    kind: row.kind,
    body: row.body,
    mediaUrl: row.media_url,
    tags: json<string[]>(row.tags, []),
    dropId: row.drop_id,
    battle,
    ratings: summarizeRatings(dist),
    reactions,
    commentCount: row.comment_count,
    myRating: (mine[0]?.score ?? null) as VibeScore | null,
    myReaction: (mine[1]?.kind ?? null) as ReactionKind | null,
    myBattleVote: mine[2]?.option_id ?? null,
    soundtrack: row.soundtrack,
    createdAt: row.created_at,
  };
}

export const serializePosts = (rows: Row[], viewerId?: string | null) => {
  const author = authorCache(viewerId);
  return Promise.all(rows.map((r) => serializePost(r, viewerId, author)));
};

export async function serializeComment(row: Row, author = authorCache()): Promise<Comment> {
  const rating = (await db.one<Row>('SELECT score FROM ratings WHERE post_id = ? AND user_id = ?', row.post_id, row.author_id))?.score ?? null;
  return { id: row.id, postId: row.post_id, author: await author(row.author_id), body: row.body, rating, createdAt: row.created_at };
}

export async function serializeMessage(row: Row, author = authorCache()): Promise<ChatMessage> {
  return {
    id: row.id, roomId: row.room_id, author: await author(row.author_id), body: row.body, mediaUrl: row.media_url,
    kind: row.kind, replyToId: row.reply_to_id, reactions: {}, createdAt: row.created_at,
  };
}

export async function serializeTake(row: Row, viewerId?: string | null, author = authorCache(viewerId)): Promise<HotTake> {
  const stake = viewerId ? await db.one<Row>('SELECT side, amount FROM stakes WHERE take_id = ? AND user_id = ?', row.id, viewerId) : undefined;
  return {
    id: row.id, category: row.category, statement: row.statement, imageUrl: row.image_url,
    agreePool: row.agree_pool, disagreePool: row.disagree_pool, agreeCount: row.agree_count, disagreeCount: row.disagree_count,
    endsAt: row.ends_at, resolved: !!row.resolved, outcome: row.outcome,
    myStake: stake ? { side: stake.side, amount: stake.amount } : null,
    author: row.author_id ? await author(row.author_id) : null,
  };
}

export async function serializeThread(row: Row, viewerId?: string | null, author = authorCache(viewerId)): Promise<ShoutThread> {
  const v = viewerId ? (await db.one<Row>('SELECT v FROM thread_votes WHERE thread_id = ? AND user_id = ?', row.id, viewerId))?.v ?? 0 : 0;
  return {
    id: row.id, board: row.board_id, title: row.title, body: row.body, author: await author(row.author_id), upvotes: row.upvotes,
    replyCount: row.reply_count, pinned: !!row.pinned, myVote: v, lastActivityAt: row.last_activity_at, createdAt: row.created_at,
  };
}

export async function serializeReply(row: Row, author = authorCache()): Promise<ShoutReply> {
  return { id: row.id, threadId: row.thread_id, author: await author(row.author_id), body: row.body, upvotes: row.upvotes, createdAt: row.created_at };
}

export async function serializeNotification(row: Row, author = authorCache()): Promise<NotificationItem> {
  return {
    id: row.id, kind: row.kind, title: row.title, body: row.body, actor: row.actor_id ? await author(row.actor_id) : null,
    link: row.link, read: !!row.read, createdAt: row.created_at,
  };
}

export function serializeStoreItem(row: Row, owned?: boolean, equipped?: boolean): StoreItem {
  return {
    id: row.id, kind: row.kind, name: row.name, description: row.description, price: row.price, gemPrice: gemPriceFor(row.kind, row.price),
    rarity: row.rarity, emoji: row.emoji, preview: row.preview, limited: !!row.limited, owned, equipped,
  };
}
