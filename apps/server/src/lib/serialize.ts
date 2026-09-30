import type {
  UserPublic, UserPrivate, Post, Comment, ChatMessage, HotTake, ShoutThread, ShoutReply, NotificationItem,
  StoreItem, UserSettings, Cosmetics, BattleOption, ReactionKind, VibeScore,
} from '@chatlol/shared';
import { summarizeRatings, levelForXp, tierByScore, REWARDS } from '@chatlol/shared';
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

function stats(userId: string): Stats {
  const c = statsCache.get(userId);
  if (c && Date.now() - c.at < STATS_TTL) return c;
  const r = db.one<Row>(
    `SELECT COALESCE(SUM(r1),0) r1, COALESCE(SUM(r2),0) r2, COALESCE(SUM(r3),0) r3, COALESCE(SUM(r4),0) r4, COALESCE(SUM(r5),0) r5
     FROM posts WHERE author_id = ? AND hidden = 0`, userId)!;
  const n = r.r1 + r.r2 + r.r3 + r.r4 + r.r5;
  const avg = n ? (r.r1 + 2 * r.r2 + 3 * r.r3 + 4 * r.r4 + 5 * r.r5) / n : 0;
  const f = db.one<Row>(
    `SELECT
      (SELECT COUNT(*) FROM follows WHERE followee_id = ?) followers,
      (SELECT COUNT(*) FROM follows WHERE follower_id = ?) following,
      (SELECT COUNT(*) FROM follows a JOIN follows b ON a.followee_id = b.follower_id AND b.followee_id = a.follower_id WHERE a.follower_id = ?) friends`,
    userId, userId, userId)!;
  const s = { vibeAvg: Math.round(avg * 100) / 100, ratingsReceived: n, friends: f.friends, followers: f.followers, following: f.following, at: Date.now() };
  statsCache.set(userId, s);
  return s;
}

export function userPublic(row: Row, viewerId?: string | null): UserPublic {
  const s = stats(row.id);
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
    online: settings.showOnline && presence.isOnline(row.id),
    lastSeenAt: row.last_seen_at,
    badges: json<string[]>(row.badges, []),
    cosmetics: json<Cosmetics>(row.cosmetics, { frame: null, flair: null, theme: null, banner: null }),
    isAI: !!row.is_ai,
    createdAt: row.created_at,
  };
  if (viewerId && viewerId !== row.id) {
    out.isFollowing = !!db.one('SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?', viewerId, row.id);
  }
  return out;
}

/** A streak survives until the end of the day after the last drop. */
export function effectiveStreak(row: Row) {
  if (!row.last_drop_day) return 0;
  const yesterday = today(new Date(Date.now() - 86_400_000));
  return row.last_drop_day >= yesterday ? row.streak_days : 0;
}

export function userPrivate(row: Row): UserPrivate {
  const done = db.one<Row>('SELECT n FROM daily_counters WHERE user_id = ? AND day = ? AND key = ?', row.id, today(), 'rate')?.n ?? 0;
  return {
    ...userPublic(row),
    online: true,
    email: row.email ?? '',
    sparks: row.sparks,
    dailyGoal: { done: Math.min(done, REWARDS.questDailyOracle.target), target: REWARDS.questDailyOracle.target },
    comboCount: row.combo_count,
    settings: { ...DEFAULT_SETTINGS, ...json<Partial<UserSettings>>(row.settings, {}) },
  };
}

export function userById(id: string) {
  return db.one<Row>('SELECT * FROM users WHERE id = ?', id);
}

/** Per-request cache so a feed page doesn't re-query the same author 20 times. */
export function authorCache(viewerId?: string | null) {
  const m = new Map<string, UserPublic>();
  return (id: string) => {
    let u = m.get(id);
    if (!u) {
      const row = userById(id);
      u = row ? userPublic(row, viewerId) : ghostUser(id);
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

export function serializePost(row: Row, viewerId: string | null | undefined, author = authorCache(viewerId)): Post {
  const dist: [number, number, number, number, number] = [row.r1, row.r2, row.r3, row.r4, row.r5];
  const reactions: Record<ReactionKind, number> = { fire: 0, heart: 0, lol: 0, wow: 0, hundred: 0 };
  for (const r of db.all<Row>('SELECT kind, COUNT(*) n FROM reactions WHERE post_id = ? GROUP BY kind', row.id)) {
    reactions[r.kind as ReactionKind] = r.n;
  }
  let battle: BattleOption[] | null = null;
  if (row.kind === 'battle') {
    battle = db.all<Row>('SELECT * FROM battle_options WHERE post_id = ? ORDER BY position', row.id)
      .map((o) => ({ id: o.id, label: o.label, mediaUrl: o.media_url ?? undefined, votes: o.votes }));
  }
  const mine = viewerId
    ? {
        rating: db.one<Row>('SELECT score FROM ratings WHERE post_id = ? AND user_id = ?', row.id, viewerId)?.score ?? null,
        reaction: db.one<Row>('SELECT kind FROM reactions WHERE post_id = ? AND user_id = ?', row.id, viewerId)?.kind ?? null,
        battle: db.one<Row>('SELECT option_id FROM battle_votes WHERE post_id = ? AND user_id = ?', row.id, viewerId)?.option_id ?? null,
      }
    : { rating: null, reaction: null, battle: null };
  return {
    id: row.id,
    author: author(row.author_id),
    kind: row.kind,
    body: row.body,
    mediaUrl: row.media_url,
    tags: json<string[]>(row.tags, []),
    dropId: row.drop_id,
    battle,
    ratings: summarizeRatings(dist),
    reactions,
    commentCount: row.comment_count,
    myRating: mine.rating as VibeScore | null,
    myReaction: mine.reaction as ReactionKind | null,
    myBattleVote: mine.battle,
    soundtrack: row.soundtrack,
    createdAt: row.created_at,
  };
}

export function serializeComment(row: Row, author = authorCache()): Comment {
  const rating = db.one<Row>('SELECT score FROM ratings WHERE post_id = ? AND user_id = ?', row.post_id, row.author_id)?.score ?? null;
  return { id: row.id, postId: row.post_id, author: author(row.author_id), body: row.body, rating, createdAt: row.created_at };
}

export function serializeMessage(row: Row, author = authorCache()): ChatMessage {
  return {
    id: row.id, roomId: row.room_id, author: author(row.author_id), body: row.body, mediaUrl: row.media_url,
    kind: row.kind, replyToId: row.reply_to_id, reactions: {}, createdAt: row.created_at,
  };
}

export function serializeTake(row: Row, viewerId?: string | null, author = authorCache(viewerId)): HotTake {
  const stake = viewerId ? db.one<Row>('SELECT side, amount FROM stakes WHERE take_id = ? AND user_id = ?', row.id, viewerId) : undefined;
  return {
    id: row.id, category: row.category, statement: row.statement, imageUrl: row.image_url,
    agreePool: row.agree_pool, disagreePool: row.disagree_pool, agreeCount: row.agree_count, disagreeCount: row.disagree_count,
    endsAt: row.ends_at, resolved: !!row.resolved, outcome: row.outcome,
    myStake: stake ? { side: stake.side, amount: stake.amount } : null,
    author: row.author_id ? author(row.author_id) : null,
  };
}

export function serializeThread(row: Row, viewerId?: string | null, author = authorCache(viewerId)): ShoutThread {
  const v = viewerId ? db.one<Row>('SELECT v FROM thread_votes WHERE thread_id = ? AND user_id = ?', row.id, viewerId)?.v ?? 0 : 0;
  return {
    id: row.id, board: row.board_id, title: row.title, body: row.body, author: author(row.author_id), upvotes: row.upvotes,
    replyCount: row.reply_count, pinned: !!row.pinned, myVote: v, lastActivityAt: row.last_activity_at, createdAt: row.created_at,
  };
}

export function serializeReply(row: Row, author = authorCache()): ShoutReply {
  return { id: row.id, threadId: row.thread_id, author: author(row.author_id), body: row.body, upvotes: row.upvotes, createdAt: row.created_at };
}

export function serializeNotification(row: Row, author = authorCache()): NotificationItem {
  return {
    id: row.id, kind: row.kind, title: row.title, body: row.body, actor: row.actor_id ? author(row.actor_id) : null,
    link: row.link, read: !!row.read, createdAt: row.created_at,
  };
}

export function serializeStoreItem(row: Row, owned?: boolean, equipped?: boolean): StoreItem {
  return {
    id: row.id, kind: row.kind, name: row.name, description: row.description, price: row.price, rarity: row.rarity,
    emoji: row.emoji, preview: row.preview, limited: !!row.limited, owned, equipped,
  };
}
