import type {
  AuthResponse, ChatMessage, Comment, Conversation, Drop, HotTake, LeaderboardEntry, LiveStream, Lounge,
  NotificationItem, Page, Post, ReactionKind, RewardEvent, RouletteCard, RouletteResult, ShoutReply, ShoutThread,
  StoreItem, UserPrivate, UserPublic, UserSettings, VibeScore, Cosmetics, ID,
} from './types';

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}

export interface ApiClientOptions {
  baseUrl: string;
  getToken: () => string | null | undefined | Promise<string | null | undefined>;
  onUnauthorized?: () => void;
  fetchImpl?: typeof fetch;
}

export type WithReward<T> = T & { reward?: RewardEvent | null };

/** Framework-agnostic typed client used by the Vue web app, React Native and desktop. */
export function createApi(opts: ApiClientOptions) {
  const f = opts.fetchImpl ?? fetch;
  async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await opts.getToken();
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    const res = await f(`${opts.baseUrl.replace(/\/$/, '')}/api${path}`, {
      method,
      headers: {
        ...(isForm || body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    });
    if (res.status === 401) opts.onUnauthorized?.();
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw new ApiError(res.status, data?.error ?? res.statusText, data?.code);
    return data as T;
  }
  const q = (params: Record<string, string | number | null | undefined>) => {
    const s = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
    return s ? `?${s}` : '';
  };

  return {
    // auth
    register: (b: { email: string; password: string; handle: string; displayName: string; birthdate: string; interests?: string[] }) =>
      req<AuthResponse>('POST', '/auth/register', b),
    login: (b: { login: string; password: string }) => req<AuthResponse>('POST', '/auth/login', b),
    me: () => req<WithReward<{ user: UserPrivate }>>('GET', '/me'),
    updateMe: (b: Partial<Pick<UserPrivate, 'displayName' | 'bio' | 'pronouns' | 'city' | 'interests' | 'avatarUrl'>>) =>
      req<{ user: UserPrivate }>('PATCH', '/me', b),
    updateSettings: (b: Partial<UserSettings>) => req<{ user: UserPrivate }>('PATCH', '/me/settings', b),
    equip: (b: Partial<Cosmetics>) => req<{ user: UserPrivate }>('POST', '/me/equip', b),
    registerPushToken: (b: { token: string; platform: string }) => req<{ ok: true }>('POST', '/me/push-token', b),
    deleteAccount: () => req<{ ok: true }>('DELETE', '/me'),

    // upload
    upload: (form: FormData) => req<{ url: string }>('POST', '/upload', form),

    // users
    user: (handle: string) => req<{ user: UserPublic; posts: Post[] }>('GET', `/users/${handle}`),
    members: (p: { q?: string; interest?: string; online?: 1 | 0; sort?: string; cursor?: string } = {}) =>
      req<Page<UserPublic>>('GET', `/users${q(p)}`),
    follow: (id: ID) => req<{ following: boolean }>('POST', `/users/${id}/follow`),
    block: (id: ID) => req<{ ok: true }>('POST', `/users/${id}/block`),
    report: (b: { targetType: string; targetId: ID; reason: string }) => req<{ ok: true }>('POST', '/reports', b),

    // feed
    feed: (p: { tab?: 'foryou' | 'following' | 'top'; cursor?: string; tag?: string } = {}) =>
      req<Page<Post>>('GET', `/feed${q(p)}`),
    post: (id: ID) => req<{ post: Post; comments: Comment[] }>('GET', `/posts/${id}`),
    createPost: (b: { kind?: Post['kind']; body: string; mediaUrl?: string | null; tags?: string[]; battle?: { label: string; mediaUrl?: string }[]; dropId?: ID | null; soundtrack?: string | null }) =>
      req<WithReward<{ post: Post }>>('POST', '/posts', b),
    deletePost: (id: ID) => req<{ ok: true }>('DELETE', `/posts/${id}`),
    rate: (id: ID, score: VibeScore) => req<WithReward<{ post: Post }>>('POST', `/posts/${id}/rate`, { score }),
    react: (id: ID, kind: ReactionKind | null) => req<{ post: Post }>('POST', `/posts/${id}/react`, { kind }),
    voteBattle: (id: ID, optionId: ID) => req<{ post: Post }>('POST', `/posts/${id}/battle`, { optionId }),
    comment: (id: ID, body: string) => req<WithReward<{ comment: Comment }>>('POST', `/posts/${id}/comments`, { body }),
    trending: () => req<{ tags: { tag: string; count: number }[]; top: LeaderboardEntry[] }>('GET', '/trending'),

    // drops
    drop: () => req<{ drop: Drop; entries: Post[] }>('GET', '/drops/today'),
    submitDrop: (b: { body: string; mediaUrl: string | null; soundtrack?: string | null }) =>
      req<WithReward<{ post: Post }>>('POST', '/drops/today', b),

    // roulette
    rouletteNext: () => req<RouletteCard | null>('GET', '/roulette/next'),
    rouletteVote: (postId: ID, score: VibeScore) =>
      req<WithReward<RouletteResult>>('POST', '/roulette/vote', { postId, score }),

    // arena
    hotTakes: () => req<{ takes: HotTake[]; pool: number; myStaked: number }>('GET', '/arena'),
    stake: (id: ID, side: 'agree' | 'disagree', amount: number) =>
      req<{ take: HotTake; sparks: number }>('POST', `/arena/${id}/stake`, { side, amount }),
    proposeTake: (b: { category: string; statement: string }) => req<{ take: HotTake }>('POST', '/arena', b),

    // shouts / forums
    boards: () => req<{ boards: { id: string; name: string; emoji: string; threads: number }[] }>('GET', '/shouts/boards'),
    threads: (p: { board?: string; sort?: 'hot' | 'new' | 'top'; cursor?: string } = {}) =>
      req<Page<ShoutThread>>('GET', `/shouts${q(p)}`),
    thread: (id: ID) => req<{ thread: ShoutThread; replies: ShoutReply[] }>('GET', `/shouts/${id}`),
    createThread: (b: { board: string; title: string; body: string }) => req<WithReward<{ thread: ShoutThread }>>('POST', '/shouts', b),
    replyThread: (id: ID, body: string) => req<{ reply: ShoutReply }>('POST', `/shouts/${id}/replies`, { body }),
    voteThread: (id: ID, v: 1 | -1 | 0) => req<{ thread: ShoutThread }>('POST', `/shouts/${id}/vote`, { v }),

    // lounges
    lounges: () => req<{ lounges: Lounge[] }>('GET', '/lounges'),
    lounge: (id: ID) => req<{ lounge: Lounge; messages: ChatMessage[] }>('GET', `/lounges/${id}`),

    // messages
    conversations: () => req<{ conversations: Conversation[] }>('GET', '/conversations'),
    openConversation: (userId: ID) => req<{ conversation: Conversation }>('POST', '/conversations', { userId }),
    messages: (id: ID, before?: string) => req<{ messages: ChatMessage[]; conversation: Conversation }>('GET', `/conversations/${id}/messages${q({ before })}`),
    sendMessage: (id: ID, b: { body: string; mediaUrl?: string | null; kind?: ChatMessage['kind'] }) =>
      req<{ message: ChatMessage }>('POST', `/conversations/${id}/messages`, b),

    // notifications
    notifications: () => req<{ items: NotificationItem[]; unread: number }>('GET', '/notifications'),
    markNotificationsRead: () => req<{ ok: true }>('POST', '/notifications/read'),

    // store
    store: () => req<{ items: StoreItem[]; sparks: number; crateOdds: Record<string, number> }>('GET', '/store'),
    buy: (id: ID) => req<WithReward<{ item: StoreItem; sparks: number; won?: StoreItem | null }>>('POST', `/store/${id}/buy`),
    inventory: () => req<{ items: StoreItem[] }>('GET', '/store/inventory'),
    claimDaily: () => req<WithReward<{ claimed: boolean; nextAt: string }>>('POST', '/store/daily'),

    // live
    streams: () => req<{ streams: LiveStream[] }>('GET', '/live'),
    stream: (id: ID) => req<{ stream: LiveStream; chat: ChatMessage[] }>('GET', `/live/${id}`),
    goLive: (b: { title: string; category: string }) => req<{ stream: LiveStream }>('POST', '/live', b),
    endLive: (id: ID) => req<{ ok: true }>('DELETE', `/live/${id}`),
    sendGift: (id: ID, giftId: string) => req<{ sparks: number }>('POST', `/live/${id}/gift`, { giftId }),

    // leaderboards
    leaderboard: (kind: 'vibe' | 'streak' | 'xp' = 'vibe') => req<{ entries: LeaderboardEntry[] }>('GET', `/leaderboard${q({ kind })}`),
  };
}

export type Api = ReturnType<typeof createApi>;
