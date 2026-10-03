import type { Friendship, Showcase, Shout, WallNote, ProfileRatings, Insights, HomeData, AdminUser, AdminPayment, ProfileSong, AuthResponse, ChatMessage, Comment, Conversation, Drop, HotTake, LeaderboardEntry, LiveStream, Lounge, NotificationItem, Page, Post, ReactionKind, RewardEvent, RouletteCard, RouletteResult, ShoutReply, ShoutThread, StoreItem, UserPrivate, UserPublic, UserSettings, VibeScore, Cosmetics, ID, GemPack, IceConfig } from './types';
export declare class ApiError extends Error {
    status: number;
    code?: string | undefined;
    constructor(status: number, message: string, code?: string | undefined);
}
export interface ApiClientOptions {
    baseUrl: string;
    getToken: () => string | null | undefined | Promise<string | null | undefined>;
    onUnauthorized?: () => void;
    fetchImpl?: typeof fetch;
}
export type WithReward<T> = T & {
    reward?: RewardEvent | null;
};
/** Framework-agnostic typed client used by the Vue web app, React Native and desktop. */
export declare function createApi(opts: ApiClientOptions): {
    register: (b: {
        email: string;
        password: string;
        handle: string;
        displayName: string;
        birthdate: string;
        gender: import('./profile').Gender;
        interests?: string[];
        /** Referral code from an invite link. */
        ref?: string;
        acceptTerms?: string;
    }) => Promise<AuthResponse>;
    login: (b: {
        login: string;
        password: string;
    }) => Promise<AuthResponse>;
    verifyEmail: (token: string) => Promise<{
        ok: true;
    }>;
    resendVerification: () => Promise<{
        ok: true;
        alreadyVerified?: boolean;
    }>;
    forgotPassword: (email: string) => Promise<{
        ok: true;
    }>;
    resetPassword: (token: string, password: string) => Promise<AuthResponse>;
    changePassword: (current: string, password: string) => Promise<AuthResponse>;
    me: () => Promise<WithReward<{
        user: UserPrivate;
    }>>;
    updateMe: (b: Partial<Pick<UserPrivate, "displayName" | "bio" | "pronouns" | "city" | "interests" | "avatarUrl">>) => Promise<{
        user: UserPrivate;
    }>;
    updateSettings: (b: Partial<UserSettings>) => Promise<{
        user: UserPrivate;
    }>;
    equip: (b: Partial<Cosmetics>) => Promise<{
        user: UserPrivate;
    }>;
    /** A phone's native push token: APNs on iOS, FCM on Android. */
    registerPushToken: (b: { token: string; platform: 'ios' | 'android' }) => Promise<{ ok: true }>;
    webPushKey: () => Promise<{ publicKey: string }>;
    stickers: () => Promise<import('./stickers').StickerCatalog>;
    giphySearch: (q: string, offset?: number) => Promise<{ enabled: boolean; results: import('./stickers').GiphySticker[]; next?: number | null }>;
    saveWebPush: (subscription: { endpoint: string; expirationTime?: number | null; keys: { p256dh: string; auth: string } }) => Promise<{ ok: true }>;
    removeWebPush: (endpoint: string) => Promise<{ ok: true }>;
    deleteAccount: () => Promise<{
        ok: true;
    }>;
    upload: (form: FormData) => Promise<{
        url: string;
    }>;
    user: (handle: string) => Promise<{
        user: UserPublic;
        posts: Post[];
        profileRatings: ProfileRatings;
        wallCount: number;
        photoCount: number;
    }>;
    members: (p?: {
        q?: string;
        interest?: string;
        online?: 1 | 0;
        gender?: 'male' | 'female';
        sort?: string;
        cursor?: string;
    }) => Promise<Page<UserPublic>>;
    friendRequests: () => Promise<{ incoming: { user: UserPublic; at: string }[]; outgoing: { user: UserPublic; at: string }[] }>;
    friends: (userId?: ID, before?: string) => Promise<{ items: { user: UserPublic; since: string }[]; nextCursor: string | null }>;
    addFriend: (id: ID) => Promise<{ friendship: Friendship }>;
    cancelFriendRequest: (id: ID) => Promise<{ friendship: Friendship }>;
    acceptFriend: (id: ID) => Promise<{ friendship: Friendship }>;
    declineFriend: (id: ID) => Promise<{ friendship: Friendship }>;
    unfriend: (id: ID) => Promise<{ friendship: Friendship }>;
    follow: (id: ID) => Promise<{
        following: boolean;
    }>;
    block: (id: ID) => Promise<{
        ok: true;
    }>;
    report: (b: {
        targetType: string;
        targetId: ID;
        reason: string;
    }) => Promise<{
        ok: true;
    }>;
    feed: (p?: {
        tab?: "foryou" | "following" | "top";
        cursor?: string;
        tag?: string;
    }) => Promise<Page<Post>>;
    post: (id: ID) => Promise<{
        post: Post;
        comments: Comment[];
    }>;
    createPost: (b: {
        kind?: Post["kind"];
        body: string;
        mediaUrl?: string | null;
        tags?: string[];
        battle?: {
            label: string;
            mediaUrl?: string;
        }[];
        dropId?: ID | null;
        soundtrack?: string | null;
        album?: string | null;
        inFeed?: boolean;
    }) => Promise<WithReward<{
        post: Post;
    }>>;
    deletePost: (id: ID) => Promise<{
        ok: true;
    }>;
    rate: (id: ID, score: VibeScore) => Promise<WithReward<{
        post: Post;
    }>>;
    react: (id: ID, kind: ReactionKind | null) => Promise<{
        post: Post;
    }>;
    voteBattle: (id: ID, optionId: ID) => Promise<{
        post: Post;
    }>;
    comment: (id: ID, body: string, sticker?: import('./stickers').StickerInput | null) => Promise<WithReward<{
        comment: Comment;
    }>>;
    trending: () => Promise<{
        tags: {
            tag: string;
            count: number;
        }[];
        top: LeaderboardEntry[];
    }>;
    drop: () => Promise<{
        drop: Drop;
        entries: Post[];
    }>;
    submitDrop: (b: {
        body: string;
        mediaUrl: string | null;
        soundtrack?: string | null;
    }) => Promise<WithReward<{
        post: Post;
    }>>;
    rouletteNext: () => Promise<RouletteCard | null>;
    rouletteVote: (postId: ID, score: VibeScore) => Promise<WithReward<RouletteResult>>;
    hotTakes: () => Promise<{
        takes: HotTake[];
        pool: number;
        myStaked: number;
    }>;
    stake: (id: ID, side: "agree" | "disagree", amount: number) => Promise<{
        take: HotTake;
        sparks: number;
    }>;
    proposeTake: (b: {
        category: string;
        statement: string;
    }) => Promise<{
        take: HotTake;
    }>;
    boards: () => Promise<{
        boards: {
            id: string;
            name: string;
            emoji: string;
            threads: number;
        }[];
    }>;
    threads: (p?: {
        board?: string;
        sort?: "hot" | "new" | "top";
        cursor?: string;
    }) => Promise<Page<ShoutThread>>;
    thread: (id: ID) => Promise<{
        thread: ShoutThread;
        replies: ShoutReply[];
    }>;
    createThread: (b: {
        board: string;
        title: string;
        body: string;
    }) => Promise<WithReward<{
        thread: ShoutThread;
    }>>;
    replyThread: (id: ID, body: string) => Promise<{
        reply: ShoutReply;
    }>;
    voteThread: (id: ID, v: 1 | -1 | 0) => Promise<{
        thread: ShoutThread;
    }>;
    lounges: () => Promise<{
        lounges: Lounge[];
    }>;
    lounge: (id: ID) => Promise<{
        lounge: Lounge;
        messages: ChatMessage[];
    }>;
    conversations: () => Promise<{
        conversations: Conversation[];
    }>;
    openConversation: (userId: ID) => Promise<{
        conversation: Conversation;
    }>;
    messages: (id: ID, before?: string) => Promise<{
        messages: ChatMessage[];
        conversation: Conversation;
    }>;
    sendMessage: (id: ID, b: {
        body: string;
        sticker?: import('./stickers').StickerInput | null;
        mediaUrl?: string | null;
        kind?: ChatMessage["kind"];
    }) => Promise<{
        message: ChatMessage;
    }>;
    notifications: () => Promise<{
        items: NotificationItem[];
        unread: number;
    }>;
    markNotificationsRead: () => Promise<{
        ok: true;
    }>;
    store: () => Promise<{
        items: StoreItem[];
        sparks: number;
        gems: number;
        gold: number;
        crateOdds: Record<string, number>;
        exchange: { sparksPerGem: number; gemsPerGold: number };
    }>;
    buy: (id: ID, currency?: "sparks" | "gems" | "gold") => Promise<WithReward<{
        item: StoreItem;
        sparks: number;
        gems: number;
        gold: number;
        won?: StoreItem | null;
    }>>;
    inventory: () => Promise<{
        items: StoreItem[];
    }>;
    usePower: (key: import('./progression').PowerKey) => Promise<{
        used: { key: string; until: string };
        powers: Partial<Record<import('./progression').PowerKey, string>>;
    }>;
    unlockTheme: (key: import('./themes').AppThemeKey) => Promise<{ user: UserPrivate }>;
    changeHandle: (handle: string) => Promise<{ user: UserPrivate }>;
    referral: () => Promise<{ code: string; link: string; joined: number; paid: number; goldEarned: number; friends: { id: ID; displayName: string; handle: string; avatarUrl: string; paid: boolean; joinedAt: string }[] }>;
    inviteByEmail: (emails: string[]) => Promise<{ sent: number }>;
    acceptTerms: () => Promise<{ user: UserPrivate }>;
    exchange: (to: 'gems' | 'gold', amount: number) => Promise<{ sparks: number; gems: number; gold: number }>;
    useTicket: (key: import('./progression').TicketKey, targetId: ID, loungeId?: ID) => Promise<{ used: string; free: boolean; target: { id: ID; handle: string } }>;
    gamesLeaderboard: (game?: string) => Promise<{ game: string | null; entries: { rank: number; user: UserPublic; wins: number; played: number }[] }>;
    ads: () => Promise<{ slots: Record<string, Omit<{ enabled: boolean; mode: 'sandboxed' | 'direct'; code: string; imageUrl: string | null; linkUrl: string | null; height: number | null; every: number | null }, 'enabled'>> }>;
    tournaments: () => Promise<{ tournaments: import('./games').Tournament[] }>;
    tournament: (id: ID) => Promise<{ tournament: import('./games').Tournament }>;
    joinTournament: (id: ID) => Promise<{ tournament: import('./games').Tournament }>;
    arcade: () => Promise<{ games: { key: string; name: string; emoji: string; desc: string; myBest: number | null; top: { rank: number; user: UserPublic; score: number; at: string }[] }[]; sparksPerDay: number }>;
    arcadeStart: (game: string) => Promise<{ runId: string; seed: number }>;
    arcadeFinish: (runId: string, inputs: [number, string][]) => Promise<{ score: number; best: number; newBest: boolean; rank: number; rejected: boolean; reward: RewardEvent | null }>;
    arcadeLeaderboard: (game: string, period?: 'day' | 'week' | 'all') => Promise<{ period: string; entries: { rank: number; user: UserPublic; score: number; at: string }[] }>;
    games: () => Promise<{ games: import('./games').GameInfo[]; currencies: import('./games').StakeCurrency[]; stakeLimits: Record<string, number>; rakePct: number }>;
    arenas: () => Promise<{ arenas: import('./games').Arena[] }>;
    arena: (id: ID, code?: string) => Promise<{ arena: import('./games').Arena }>;
    createArena: (b: { name: string; game: import('./games').GameKey; visibility: 'public' | 'private'; stake: { currency: import('./games').StakeCurrency; amount: number } }) => Promise<{ arena: import('./games').Arena }>;
    joinArena: (id: ID, code?: string) => Promise<{ arena: import('./games').Arena }>;
    joinArenaByCode: (code: string) => Promise<{ arena: import('./games').Arena }>;
    leaveArena: (id: ID) => Promise<{ arena: import('./games').Arena }>;
    inviteToArena: (id: ID, userIds: ID[]) => Promise<{ arena: import('./games').Arena }>;
    startArena: (id: ID) => Promise<{ arena: import('./games').Arena }>;
    arenaMove: (id: ID, action: Record<string, unknown>) => Promise<{ arena: import('./games').Arena }>;
    king: () => Promise<{ king: { user: UserPublic; since: string; until: string } | null }>;
    claimDaily: () => Promise<WithReward<{
        claimed: boolean;
        nextAt: string;
    }>>;
    streams: () => Promise<{
        streams: LiveStream[];
    }>;
    stream: (id: ID) => Promise<{
        stream: LiveStream;
        chat: ChatMessage[];
    }>;
    goLive: (b: {
        title: string;
        category: string;
        video?: boolean;
    }) => Promise<{
        stream: LiveStream;
    }>;
    iceServers: () => Promise<IceConfig>;
    endLive: (id: ID) => Promise<{
        ok: true;
    }>;
    sendGift: (id: ID, giftId: string) => Promise<{
        sparks: number;
    }>;
    gemPacks: () => Promise<{
        packs: GemPack[];
        premiumPlans: import('./profile').PremiumPlan[];
        stripe: boolean;
        iap: boolean;
    }>;
    stripeCheckout: (packId: string, returnUrl?: string) => Promise<{
        url: string;
    }>;
    purchaseHistory: () => Promise<{
        purchases: {
            id: string;
            provider: string;
            product_id: string;
            gems: number;
            amount_cents: number | null;
            currency: string | null;
            status: string;
            created_at: string;
        }[];
    }>;
    leaderboard: (kind?: "vibe" | "streak" | "xp") => Promise<{
        entries: LeaderboardEntry[];
    }>;
    shouts: (p?: { before?: string; mood?: string; replyTo?: ID }) => Promise<{ items: Shout[]; nextCursor: string | null; nextShoutAt: string | null }>;
    shout: (b: { body: string; mood?: string | null; replyToId?: ID | null; sticker?: import('./stickers').StickerInput | null }) => Promise<WithReward<{ shout: Shout; nextShoutAt: string }>>;
    reactTo: (type: 'comment' | 'reply' | 'wall' | 'message', id: ID, kind: ReactionKind | null) => Promise<{ reactions: Partial<Record<ReactionKind, number>>; myReaction: ReactionKind | null }>;
    reactShout: (id: ID, kind: ReactionKind | null) => Promise<{ shout: Shout }>;
    deleteShout: (id: ID) => Promise<{ ok: true }>;
    shoutTrends: () => Promise<{ tags: { tag: string; count: number }[]; top: { rank: number; user: UserPublic; shouts: number; reps: number }[] }>;
    home: () => Promise<HomeData>;
    updateProfile: (b: {
        gender?: import('./profile').Gender;
        headline?: string;
        accent?: string;
        coverUrl?: string | null;
        background?: { kind: 'preset' | 'image' | 'color'; value: string };
        song?: string | ProfileSong | null;
    }) => Promise<{ user: UserPrivate }>;
    changeEmail: (email: string, password: string) => Promise<{ user: UserPrivate }>;
    gallery: (userId: ID, album?: string) => Promise<{ albums: string[]; photos: Post[] }>;
    rateProfile: (userId: ID, score: VibeScore) => Promise<{ ratings: ProfileRatings }>;
    wall: (userId: ID) => Promise<{ notes: WallNote[] }>;
    postWall: (userId: ID, b: { body: string; mood?: string | null; sticker?: import('./stickers').StickerInput | null }) => Promise<{ note: WallNote }>;
    deleteWallNote: (id: ID) => Promise<{ ok: true }>;
    insights: () => Promise<Insights>;
    spotifySearch: (q: string) => Promise<{ enabled: boolean; source?: 'spotify' | 'apple'; tracks: ProfileSong[] }>;
    /** Spotify when the server has Spotify keys, otherwise Apple Music previews (no keys needed). */
    songSearch: (q: string) => Promise<{ enabled: boolean; source: 'spotify' | 'apple'; tracks: ProfileSong[] }>;
    updateLayout: (layout: import('./profileLayout').ProfileLayout) => Promise<{ user: UserPrivate; layout: import('./profileLayout').ProfileLayout; premiumRemoved: string[] }>;
    showcase: (userId: ID, types: import('./profileLayout').SectionType[], limit?: number) => Promise<Showcase>;
    spotifyResolve: (url: string) => Promise<{ song: ProfileSong }>;
    premium: () => Promise<{ plans: import('./profile').PremiumPlan[]; premiumUntil: string | null; sparks: number; stripe: boolean; iap: boolean }>;
    buyPremium: (planId: string) => Promise<{ premiumUntil: string; user: UserPrivate }>;
    admin: {
        overview: () => Promise<{
            counts: Record<'users' | 'newToday' | 'ai' | 'online' | 'postsToday' | 'shoutsToday' | 'openReports' | 'openFlags' | 'premium' | 'banned' | 'suspended', number>;
            revenue30d: { currency: string; cents: number; purchases: number }[];
            integrations: Record<string, boolean | string | null>;
        }>;
        users: (p?: { q?: string; status?: string; role?: string; ai?: '0' | '1'; staff?: '1'; cursor?: string }) => Promise<Page<AdminUser>>;
        user: (id: ID) => Promise<{
            user: AdminUser;
            events: { id: ID; kind: string; reason: string; category: string | null; until: string | null; by: string; severe: boolean; cleared: boolean; createdAt: string }[];
            reports: { id: ID; targetType: string; targetId: ID; reason: string; status: string; against: boolean; createdAt: string }[];
            recent: { type: string; id: ID; text: string; mediaUrl?: string | null; room?: string; hidden: boolean; createdAt: string }[];
        }>;
        action: (id: ID, b: { action: string; minutes?: number; reason: string }) => Promise<{ user: AdminUser }>;
        setRole: (id: ID, role: 'user' | 'mod' | 'admin') => Promise<{ user: AdminUser }>;
        grantPremium: (id: ID, days: number) => Promise<{ user: AdminUser }>;
        reports: (status?: 'open' | 'closed' | 'all') => Promise<{
            items: { id: ID; targetType: string; targetId: ID; reason: string; status: string; resolvedBy: string | null; reporter: UserPublic; target: UserPublic | null; content: { text: string; mediaUrl: string | null; removed: boolean } | null; createdAt: string }[];
        }>;
        resolveReport: (id: ID, b: { status: 'actioned' | 'dismissed'; removeContent?: boolean }) => Promise<{ ok: true }>;
        flags: (status?: 'open' | 'all') => Promise<{
            items: { id: ID; user: UserPublic; reason: string; category: string | null; priority: string; status: string; excerpt: string | null; ref: { type: string; id: ID } | null; createdAt: string }[];
        }>;
        resolveFlag: (id: ID, status: 'resolved' | 'dismissed') => Promise<{ ok: true }>;
        removeContent: (type: string, id: ID, reason?: string) => Promise<{ ok: true }>;
        editProfile: (id: ID, b: { displayName?: string; handle?: string; bio?: string; pronouns?: string; city?: string; headline?: string; removeAvatar?: boolean; removeCover?: boolean; removeBackground?: boolean; removeSong?: boolean; reason?: string }) => Promise<{ user: AdminUser }>;
        userContent: (id: ID, kind: 'posts' | 'photos' | 'shouts' | 'comments' | 'threads' | 'replies' | 'wall' | 'messages', before?: string) => Promise<{
            items: { type: string; id: ID; text: string; title: string | null; mediaUrl: string | null; where: string | null; hidden: boolean; removed: { by: string; reason: string } | null; reactions: Record<string, number> | null; createdAt: string }[];
            nextBefore: string | null;
        }>;
        userActivity: (id: ID) => Promise<{
            features: { feature: string; total: number; days: number; last: string }[];
            progression: { level: number; xp: number; loginStreak: number; lastDailyClaim: string | null; lastSeenAt: string; progressResetAt: string | null; powers: Record<string, string>; unlockedThemes: string[]; handleHistory: { from: string; at: string }[]; gameStats: { played: number; wins: number } };
            inventory: { key?: string; name?: string; emoji?: string; kind?: string; qty: number; via: string | null; acquiredAt: string }[];
            arenas: { id: ID; name: string; game: string; status: string; stake: { currency: string; amount: number }; payout: number; createdAt: string }[];
            tickets: { against: { kind: string; reason: string; at: string }[]; used: { kind: string; targetId: ID; at: string }[] };
        }>;
        features: () => Promise<{ week: { feature: string; uses: number; users: number; today: number }[]; month: { feature: string; uses: number; users: number; today: number }[] }>;
        modlog: () => Promise<{ items: { id: ID; user: UserPublic; kind: string; reason: string; until: string | null; by: string; createdAt: string }[] }>;
        personas: () => Promise<{ items: { id: ID; handle: string; displayName: string; avatarUrl: string; dmFrom: 'everyone' | 'following' | 'nobody'; active: boolean; generated: boolean }[] }>;
        updatePersona: (id: ID, b: { dmFrom?: 'everyone' | 'following' | 'nobody'; active?: boolean }) => Promise<{ ok: true }>;
        generatePersonas: (b: { count: number; hint?: string }) => Promise<{ started: true }>;
        setPerms: (id: ID, perms: import('./permissions').Permission[]) => Promise<{ user: AdminUser }>;
        wallet: (id: ID, b: { sparks?: number; gems?: number; gold?: number; reason?: string }) => Promise<{ user: AdminUser }>;
        items: () => Promise<{ items: { key: string; name: string; kind: string; emoji: string | null; rarity: string | null; price: number; goldPrice: number | null; preview: string | null; description: string }[] }>;
        giveItem: (id: ID, key: string, qty?: number) => Promise<{ ok: true }>;
        boost: (id: ID, hours: number) => Promise<{ user: AdminUser }>;
        arenas: () => Promise<{ gemsGold: boolean; items: { id: string; name: string; game: string; status: string; hostId: string; playerIds: string[]; stake: { currency: string; amount: number }; payouts: { userId: string; amount: number }[]; outcome: unknown; createdAt: string; endedAt: string | null }[] }>;
        setWagers: (gemsGold: boolean) => Promise<{ gemsGold: boolean }>;
        ads: () => Promise<{ enabled: boolean; premiumAdFree: boolean; slots: Record<string, { enabled: boolean; mode: 'sandboxed' | 'direct'; code: string; imageUrl: string | null; linkUrl: string | null; height: number | null; every: number | null }>; available: { key: string; label: string; size: string; every?: number }[] }>;
        saveAds: (b: { enabled: boolean; premiumAdFree: boolean; slots: Record<string, { enabled: boolean; mode: 'sandboxed' | 'direct'; code: string; imageUrl: string | null; linkUrl: string | null; height: number | null; every: number | null }> }) => Promise<{ enabled: boolean; premiumAdFree: boolean; slots: Record<string, { enabled: boolean; mode: 'sandboxed' | 'direct'; code: string; imageUrl: string | null; linkUrl: string | null; height: number | null; every: number | null }>; available: { key: string; label: string; size: string; every?: number }[] }>;
        tournaments: () => Promise<{ tournaments: (import('./games').Tournament & { cancelled: boolean; cashToPay: { place: number; userId: string; prize: import('./games').TournamentPrize }[] })[] }>;
        createTournament: (b: import('./games').TournamentInput) => Promise<{ tournament: import('./games').Tournament }>;
        updateTournament: (id: ID, b: Partial<import('./games').TournamentInput>) => Promise<{ tournament: import('./games').Tournament }>;
        cancelTournament: (id: ID) => Promise<{ ok: true }>;
        finishTournament: (id: ID) => Promise<{ ok: true }>;
        markCashPaid: (id: ID, place: number) => Promise<{ ok: true }>;
        levelGates: () => Promise<{ gates: import('./progression').LevelGate[]; values: Record<string, number> }>;
        setLevelGates: (values: Record<string, number>) => Promise<{ gates: import('./progression').LevelGate[]; values: Record<string, number> }>;
        terminate: (id: ID, reason: string) => Promise<{ user: AdminUser }>;
        payments: (p?: { status?: string; provider?: string; user?: string; days?: number; cursor?: string }) => Promise<{
            items: AdminPayment[];
            totals: { currency: string; status: string; cents: number; count: number }[];
            byProduct: { productId: string; cents: number; count: number }[];
            nextCursor: string | null;
        }>;
        refund: (id: ID) => Promise<{ ok: true; moneyBack: boolean }>;
    };
};
export type Api = ReturnType<typeof createApi>;
