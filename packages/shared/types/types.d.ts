export type ID = string;
export type ISODate = string;
/** 1 = Meh, 2 = Chill, 3 = Drippy, 4 = Fire, 5 = God Tier */
export type VibeScore = 1 | 2 | 3 | 4 | 5;
export type ReactionKind = 'fire' | 'heart' | 'lol' | 'wow' | 'hundred';
export interface Cosmetics {
    frame: string | null;
    flair: string | null;
    theme: string | null;
    banner: string | null;
    /** Vault cover (designed art) and profile button style. */
    cover?: string | null;
    button?: string | null;
}
export interface UserPublic {
    id: ID;
    handle: string;
    displayName: string;
    avatarUrl: string;
    bio: string;
    pronouns: string;
    city: string;
    /** null when the member hides it (Settings → Privacy). */
    gender: import('./profile').Gender | null;
    profile: ProfileCustomization;
    interests: string[];
    level: number;
    xp: number;
    vibeAvg: number;
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
    /** ChatLOL Premium member (crown badge). */
    premium: boolean;
    /** Featured by staff: shown first in Browse Members and more often in Rate & Meet. */
    boosted?: boolean;
    /** The reigning King of ChatLOL (golden crown). */
    isKing?: boolean;
    isFollowing?: boolean;
    /** How you stand with them (only on other people). */
    friendship?: Friendship | null;
    createdAt: ISODate;
}
export interface UserPrivate extends UserPublic {
    email: string;
    emailVerified: boolean;
    /** Earned currency: Roulette, Drops, Arena, gifts. Never sold. */
    sparks: number;
    /** Premium currency bought with real money (or exchanged from Sparks). */
    gems: number;
    /** Top currency, exchanged from Gems: buys tickets and the King's crown. */
    gold: number;
    /** Paid themes unlocked with Gold (kept even without Premium). */
    unlockedThemes: string[];
    /** False when the current Terms / Guidelines haven't been accepted yet. */
    termsAccepted: boolean;
    dailyGoal: {
        done: number;
        target: number;
    };
    comboCount: number;
    settings: UserSettings;
    role: 'user' | 'mod' | 'admin';
    /** Staff permissions (role defaults + grants). Empty for members. */
    perms: import('./permissions').Permission[];
    premiumUntil: ISODate | null;
    /** Power-ups running right now: key → when it ends. */
    powers: Partial<Record<import('./progression').PowerKey, ISODate>>;
    /** Days in a row with a check-in. */
    loginStreak: number;
    /** When earned progress was last reset for inactivity. */
    progressResetAt: ISODate | null;
    moderation: { status: import('./profile').ModStatus; until: ISODate | null; reason: string | null };
}
export interface ProfileSong {
    /** Where it plays from: a Spotify embed, or an Apple Music 30-second preview (used when Spotify search isn't set up). */
    source?: 'spotify' | 'apple';
    type: import('./profile').SpotifyKind;
    id: string;
    title: string;
    artist: string;
    artUrl: string | null;
    /** Apple previews only. */
    previewUrl?: string | null;
    linkUrl?: string | null;
}
export interface ProfileCustomization {
    song: ProfileSong | null;
    background: { kind: 'preset' | 'image' | 'color'; value: string };
    accent: string;
    headline: string;
    coverUrl: string | null;
    /** Present on full profiles (GET /users/:handle) and your own account; not on authors embedded in feeds. */
    layout?: import('./profileLayout').ProfileLayout;
}
export interface UserSettings {
    pushEnabled: boolean;
    emailDigest: boolean;
    dmFrom: 'everyone' | 'following' | 'nobody';
    showOnline: boolean;
    safeMode: boolean;
    hapticsEnabled: boolean;
    soundEnabled: boolean;
    darkMode: 'system' | 'light' | 'dark';
    /** App colours (theme), the same on every device. */
    appTheme: import('./themes').AppThemeSetting;
    breakReminderMins: number;
    showAIPersonas: boolean;
    whoCanComment: 'everyone' | 'following';
    wallFrom: 'everyone' | 'following' | 'nobody';
    friendRequestsFrom: 'everyone' | 'friends_of_friends' | 'nobody';
    profileVisibility: 'everyone' | 'members';
    showGender: boolean;
    showCity: boolean;
    showInRoulette: boolean;
    ghostMode: boolean;
    notifyRatings: boolean;
    notifyComments: boolean;
    notifyFollows: boolean;
    notifyDms: boolean;
    notifyMentions: boolean;
    notifyLive: boolean;
    notifyArena: boolean;
    autoplayMusic: boolean;
    reduceMotion: boolean;
    celebrateBirthday: boolean;
}
export type TierKey = 'meh' | 'chill' | 'drippy' | 'fire' | 'god';
export interface RatingSummary {
    count: number;
    avg: number;
    dist: [number, number, number, number, number];
    tier: TierKey;
    consensusPct: number;
}
export interface BattleOption {
    id: ID;
    label: string;
    mediaUrl?: string;
    votes: number;
}
export type PostKind = 'photo' | 'text' | 'battle' | 'drop' | 'roulette' | 'birthday';
export interface Post {
    /** Removed by staff: shown as a “removed by Admin for <reason>” card. */
    removed?: { by: string; reason: string; at: string } | null;
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
    album: string | null;
    inFeed: boolean;
    /** Generated by ChatLOL (e.g. birthday posts), not written by the author. */
    system: boolean;
    createdAt: ISODate;
}
export interface Comment {
    /** Removed by staff: shown as a “removed by Admin for <reason>” card. */
    removed?: { by: string; reason: string; at: string } | null;
    id: ID;
    postId: ID;
    author: UserPublic;
    body: string;
    sticker: import('./stickers').Sticker | null;
    rating: VibeScore | null;
    /** Emoji reaction counts, and the viewer's own reaction. */
    reactions: Partial<Record<ReactionKind, number>>;
    myReaction: ReactionKind | null;
    createdAt: ISODate;
}
export interface Drop {
    id: ID;
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
    myStake: {
        side: 'agree' | 'disagree';
        amount: number;
    } | null;
    author: UserPublic | null;
}
export interface ShoutThread {
    /** Removed by staff: shown as a “removed by Admin for <reason>” card. */
    removed?: { by: string; reason: string; at: string } | null;
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
    /** Removed by staff: shown as a “removed by Admin for <reason>” card. */
    removed?: { by: string; reason: string; at: string } | null;
    id: ID;
    threadId: ID;
    author: UserPublic;
    body: string;
    upvotes: number;
    /** Emoji reaction counts, and the viewer's own reaction. */
    reactions: Partial<Record<ReactionKind, number>>;
    myReaction: ReactionKind | null;
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
    /** Removed by staff: shown as a “removed by Admin for <reason>” card. */
    removed?: { by: string; reason: string; at: string } | null;
    id: ID;
    roomId: ID;
    author: UserPublic;
    body: string;
    mediaUrl: string | null;
    kind: 'text' | 'image' | 'gift' | 'system' | 'voice' | 'sticker';
    sticker?: import('./stickers').Sticker | null;
    replyToId: ID | null;
    reactions: Partial<Record<ReactionKind, number>>;
    myReaction?: ReactionKind | null;
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
    kind: 'rating' | 'gift' | 'invite' | 'consensus' | 'drop' | 'follow' | 'comment' | 'dm' | 'arena' | 'level' | 'system' | 'mention' | 'profile_view' | 'profile_rating' | 'wall' | 'birthday';
    title: string;
    body: string;
    actor: UserPublic | null;
    /** True when the actor is hidden from a non-Premium member ("Someone…"). */
    anonymous: boolean;
    /** Random stranger photo to show blurred in place of the hidden actor. */
    teaserAvatar: string | null;
    link: string | null;
    read: boolean;
    createdAt: ISODate;
}
export type StoreItemKind = 'frame' | 'flair' | 'theme' | 'banner' | 'gift' | 'crate' | 'boost' | 'streak_freeze' | 'stickers' | 'emojis' | 'unlock' | 'power' | 'ticket' | 'king' | 'cover' | 'button' | 'font';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export interface StoreItem {
    id: ID;
    kind: StoreItemKind;
    name: string;
    description: string;
    price: number;
    /** Price in Gems, or null when the item can only be bought with earned Sparks (e.g. loot crates). */
    gemPrice: number | null;
    /** Gold-only items (tickets, the King's crown): their Gold price. */
    goldPrice: number | null;
    /** Rare cosmetics can also be bought with Gold. */
    goldAltPrice?: number | null;
    rarity: Rarity;
    emoji: string;
    preview: string;
    owned?: boolean;
    equipped?: boolean;
    limited?: boolean;
    /** How many you hold (stackable items like power-ups). */
    qty?: number;
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
    topGifters: {
        user: UserPublic;
        amount: number;
    }[];
}
export interface LeaderboardEntry {
    rank: number;
    user: UserPublic;
    score: number;
}
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
    levelUp?: {
        from: number;
        to: number;
    } | null;
    questCompleted?: string | null;
    /** Bonus Gems that dropped (Premium members). */
    gems?: number;
    /** Doubled by a running Spark Surge / XP Surge. */
    boosted?: boolean;
    /** Set on the daily check-in reward. */
    loginStreak?: number;
}
export interface AuthResponse {
    token: string;
    user: UserPrivate;
}
export interface Page<T> {
    items: T[];
    nextCursor: string | null;
}
export interface GemPack {
    id: string;
    gems: number;
    bonus: number;
    usd: number;
    label: string;
    best?: boolean;
}
export interface IceConfig {
    iceServers: {
        urls: string | string[];
        username?: string;
        credential?: string;
    }[];
    /** 'relay' sends all media through TURN so peers never learn each other's IP addresses. */
    iceTransportPolicy: 'all' | 'relay';
    ttl: number;
    maxViewers: number;
}
/** WebRTC signalling payloads relayed by the server between host and viewers. */
export interface RtcSignal {
    streamId: ID;
    /** socket id of the peer this signal is for / from */
    peer: string;
    description?: {
        type: 'offer' | 'answer';
        sdp: string;
    };
    candidate?: {
        candidate: string;
        sdpMid?: string | null;
        sdpMLineIndex?: number | null;
    } | null;
}

export interface Shout {
    /** Removed by staff: shown as a “removed by Admin for <reason>” card. */
    removed?: { by: string; reason: string; at: string } | null;
    id: ID;
    author: UserPublic;
    body: string;
    sticker: import('./stickers').Sticker | null;
    mood: import('./profile').ShoutMood | null;
    mentions: string[];
    replyTo: { id: ID; author: UserPublic; body: string } | null;
    replyCount: number;
    reactions: Record<ReactionKind, number>;
    myReaction: ReactionKind | null;
    createdAt: ISODate;
}
export interface WallNote {
    /** Removed by staff: shown as a “removed by Admin for <reason>” card. */
    removed?: { by: string; reason: string; at: string } | null;
    id: ID;
    profileId: ID;
    author: UserPublic;
    body: string;
    sticker: import('./stickers').Sticker | null;
    mood: import('./profile').WallMood | null;
    /** Emoji reaction counts, and the viewer's own reaction. */
    reactions: Partial<Record<ReactionKind, number>>;
    myReaction: ReactionKind | null;
    createdAt: ISODate;
}
export interface ProfileRatings extends RatingSummary {
    myRating: VibeScore | null;
}
/** Someone who did something; `user` is null (with a blurred teaser photo) for non-Premium members. */
export interface InsightActor {
    user: UserPublic | null;
    teaserAvatar: string | null;
}
export interface Insights {
    premium: boolean;
    viewCount: number;
    ratings: ProfileRatings;
    views: (InsightActor & { at: ISODate })[];
    raters: (InsightActor & { score: VibeScore; at: ISODate })[];
    mentions: (InsightActor & { shoutId: ID; body: string | null; at: ISODate })[];
}
export interface HomeData {
    stats: { members: number; online: number };
    /** Richest members (wealth in Sparks, Gems and Gold valued at the exchange rate). */
    royalty: { rank: number; user: UserPublic; sparks: number; gems: number; gold: number; worth: number }[];
    popularMembers: UserPublic[];
    rate: Post | null;
    forums: ShoutThread[];
    streams: LiveStream[];
    hallOfFame: LeaderboardEntry[];
    shouts: Shout[];
    drop: { id: ID; prompt: string; emoji: string; endsAt: ISODate; entries: Post[] };
    arena: HotTake[];
    lounges: Lounge[];
    newMembers: UserPublic[];
    birthdays: { user: UserPublic; postId: ID }[];
}
export interface AdminUser extends UserPublic {
    email: string | null;
    emailVerified: boolean;
    role: 'user' | 'mod' | 'admin';
    birthdate: string;
    sparks: number;
    gems: number;
    gold: number;
    premiumUntil: ISODate | null;
    standing: { status: import('./profile').ModStatus; until: ISODate | null; reason: string | null };
    strikes30d: number;
    reportsAgainst: number;
    deleted: boolean;
    /** Permissions granted on top of the role. */
    perms: import('./permissions').Permission[];
    /** Everything they can do (role defaults + grants). */
    allPerms: import('./permissions').Permission[];
    boostUntil: ISODate | null;
}

export interface AdminPayment {
    id: ID;
    user: UserPublic;
    provider: string;
    productId: string;
    gems: number;
    premiumDays: number;
    amountCents: number | null;
    currency: string | null;
    status: 'completed' | 'refunded' | 'pending' | 'failed';
    providerTxId: string | null;
    createdAt: ISODate;
}

/** Data for a profile's list sections (GET /users/:id/showcase). Only the requested kinds are present. */
export interface Showcase {
    friends?: UserPublic[];
    followers?: UserPublic[];
    following?: UserPublic[];
    shouts?: Shout[];
    photos?: Post[];
    topPhotos?: Post[];
    threads?: { id: ID; boardId: string; boardName: string; title: string; replyCount: number; upvotes: number; createdAt: ISODate }[];
}

/** none · outgoing (you sent a request) · incoming (they sent you one) · friends */
export type Friendship = 'none' | 'outgoing' | 'incoming' | 'friends';
