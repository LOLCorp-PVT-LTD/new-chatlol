import type { AuthResponse, ChatMessage, Comment, Conversation, Drop, HotTake, LeaderboardEntry, LiveStream, Lounge, NotificationItem, Page, Post, ReactionKind, RewardEvent, RouletteCard, RouletteResult, ShoutReply, ShoutThread, StoreItem, UserPrivate, UserPublic, UserSettings, VibeScore, Cosmetics, ID, GemPack, IceConfig } from './types';
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
        interests?: string[];
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
    registerPushToken: (b: {
        token: string;
        platform: string;
    }) => Promise<{
        ok: true;
    }>;
    deleteAccount: () => Promise<{
        ok: true;
    }>;
    upload: (form: FormData) => Promise<{
        url: string;
    }>;
    user: (handle: string) => Promise<{
        user: UserPublic;
        posts: Post[];
    }>;
    members: (p?: {
        q?: string;
        interest?: string;
        online?: 1 | 0;
        sort?: string;
        cursor?: string;
    }) => Promise<Page<UserPublic>>;
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
    comment: (id: ID, body: string) => Promise<WithReward<{
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
        crateOdds: Record<string, number>;
    }>;
    buy: (id: ID, currency?: "sparks" | "gems") => Promise<WithReward<{
        item: StoreItem;
        sparks: number;
        gems: number;
        won?: StoreItem | null;
    }>>;
    inventory: () => Promise<{
        items: StoreItem[];
    }>;
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
};
export type Api = ReturnType<typeof createApi>;
