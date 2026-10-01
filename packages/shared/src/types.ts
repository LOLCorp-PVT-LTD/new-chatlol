export type ID = string;
export type ISODate = string;

/** 1 = Meh, 2 = Chill, 3 = Drippy, 4 = Fire, 5 = God Tier */
export type VibeScore = 1 | 2 | 3 | 4 | 5;
export type ReactionKind = 'fire' | 'heart' | 'lol' | 'wow' | 'hundred';

export interface Cosmetics {
  frame: string | null; // avatar ring id
  flair: string | null; // name flair id
  theme: string | null; // profile theme id
  banner: string | null;
}

export interface UserPublic {
  id: ID;
  handle: string;
  displayName: string;
  avatarUrl: string;
  bio: string;
  pronouns: string;
  city: string;
  interests: string[];
  level: number;
  xp: number;
  vibeAvg: number; // 0..5 average received rating
  vibeTier: TierKey;
  ratingsReceived: number;
  streakDays: number;
  friendsCount: number;
  followersCount: number;
  followingCount: number;
  online: boolean;
  lastSeenAt: ISODate;
  badges: string[];
  cosmetics: Cosmetics;
  /** AI personas are always disclosed to viewers via this flag. */
  isAI: boolean;
  isFollowing?: boolean;
  createdAt: ISODate;
}

export interface UserPrivate extends UserPublic {
  email: string;
  emailVerified: boolean;
  /** Earned currency: Roulette, Drops, Arena, gifts. Never sold. */
  sparks: number;
  /** Premium currency bought with real money. Cosmetics only — can't be staked or gambled. */
  gems: number;
  dailyGoal: { done: number; target: number };
  comboCount: number;
  settings: UserSettings;
}

export interface UserSettings {
  pushEnabled: boolean;
  emailDigest: boolean;
  dmFrom: 'everyone' | 'following' | 'nobody';
  showOnline: boolean;
  safeMode: boolean; // stricter moderation filter
  hapticsEnabled: boolean;
  soundEnabled: boolean;
  darkMode: 'system' | 'light' | 'dark';
  breakReminderMins: number; // 0 = off
  showAIPersonas: boolean;
}

export type TierKey = 'meh' | 'chill' | 'drippy' | 'fire' | 'god';

export interface RatingSummary {
  count: number;
  avg: number;
  dist: [number, number, number, number, number];
  tier: TierKey;
  consensusPct: number; // % of votes in the modal tier
}

export interface BattleOption { id: ID; label: string; mediaUrl?: string; votes: number }

export type PostKind = 'photo' | 'text' | 'battle' | 'drop' | 'roulette';

export interface Post {
  id: ID;
  author: UserPublic;
  kind: PostKind;
  body: string;
  mediaUrl: string | null;
  tags: string[];
  dropId: ID | null;
  battle: BattleOption[] | null;
  ratings: RatingSummary;
  reactions: Record<ReactionKind, number>;
  commentCount: number;
  myRating: VibeScore | null;
  myReaction: ReactionKind | null;
  myBattleVote: ID | null;
  soundtrack: string | null;
  createdAt: ISODate;
}

export interface Comment {
  id: ID;
  postId: ID;
  author: UserPublic;
  body: string;
  rating: VibeScore | null;
  createdAt: ISODate;
}

export interface Drop {
  id: ID; // YYYY-MM-DD
  prompt: string;
  emoji: string;
  startsAt: ISODate;
  endsAt: ISODate;
  entries: number;
  myEntryId: ID | null;
}

export interface HotTake {
  id: ID;
  category: string;
  statement: string;
  imageUrl: string | null;
  agreePool: number;
  disagreePool: number;
  agreeCount: number;
  disagreeCount: number;
  endsAt: ISODate;
  resolved: boolean;
  outcome: 'agree' | 'disagree' | null;
  myStake: { side: 'agree' | 'disagree'; amount: number } | null;
  author: UserPublic | null;
}

export interface ShoutThread {
  id: ID;
  board: string;
  title: string;
  body: string;
  author: UserPublic;
  upvotes: number;
  replyCount: number;
  pinned: boolean;
  myVote: 1 | -1 | 0;
  lastActivityAt: ISODate;
  createdAt: ISODate;
}

export interface ShoutReply {
  id: ID;
  threadId: ID;
  author: UserPublic;
  body: string;
  upvotes: number;
  createdAt: ISODate;
}

export interface Lounge {
  id: ID;
  name: string;
  emoji: string;
  topic: string;
  nowPlaying: string;
  coverUrl: string;
  onlineCount: number;
  memberPreview: UserPublic[];
  isLive: boolean;
}

export interface ChatMessage {
  id: ID;
  roomId: ID; // lounge id or conversation id
  author: UserPublic;
  body: string;
  mediaUrl: string | null;
  kind: 'text' | 'image' | 'gift' | 'system' | 'voice';
  replyToId: ID | null;
  reactions: Record<string, number>;
  createdAt: ISODate;
}

export interface Conversation {
  id: ID;
  members: UserPublic[];
  lastMessage: ChatMessage | null;
  unread: number;
  updatedAt: ISODate;
}

export interface NotificationItem {
  id: ID;
  kind: 'rating' | 'gift' | 'invite' | 'consensus' | 'drop' | 'follow' | 'comment' | 'dm' | 'arena' | 'level' | 'system';
  title: string;
  body: string;
  actor: UserPublic | null;
  link: string | null;
  read: boolean;
  createdAt: ISODate;
}

export type StoreItemKind = 'frame' | 'flair' | 'theme' | 'banner' | 'gift' | 'crate' | 'boost' | 'streak_freeze';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface StoreItem {
  id: ID;
  kind: StoreItemKind;
  name: string;
  description: string;
  price: number; // in Sparks
  /** Price in Gems, or null when the item can only be bought with earned Sparks (e.g. loot crates). */
  gemPrice: number | null;
  rarity: Rarity;
  emoji: string;
  preview: string; // css gradient / color / image url
  owned?: boolean;
  equipped?: boolean;
  limited?: boolean;
}

export interface LiveStream {
  id: ID;
  /** True while the host is broadcasting camera video over WebRTC. */
  video: boolean;
  maxViewers: number;
  host: UserPublic;
  title: string;
  category: string;
  coverUrl: string;
  viewers: number;
  giftsTotal: number;
  startedAt: ISODate;
  topGifters: { user: UserPublic; amount: number }[];
}

export interface LeaderboardEntry { rank: number; user: UserPublic; score: number }

export interface RouletteCard {
  post: Post;
  queuePosition: number;
}

export interface RouletteResult {
  match: boolean;
  communityTier: TierKey;
  consensusPct: number;
  sparksEarned: number;
  xpEarned: number;
  comboCount: number;
  multiplier: number;
  ratings: RatingSummary;
}

export interface RewardEvent {
  sparks: number;
  xp: number;
  reason: string;
  levelUp?: { from: number; to: number } | null;
  questCompleted?: string | null;
}

export interface AuthResponse { token: string; user: UserPrivate }

export interface Page<T> { items: T[]; nextCursor: string | null }

export interface GemPack { id: string; gems: number; bonus: number; usd: number; label: string; best?: boolean }

export interface IceConfig { iceServers: { urls: string | string[]; username?: string; credential?: string }[]; ttl: number; maxViewers: number }

/** WebRTC signalling payloads relayed by the server between host and viewers. */
export interface RtcSignal {
  streamId: ID;
  /** socket id of the peer this signal is for / from */
  peer: string;
  description?: { type: 'offer' | 'answer'; sdp: string };
  candidate?: { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null } | null;
}
