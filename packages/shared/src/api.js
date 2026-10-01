export class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Framework-agnostic typed client used by the Vue web app, React Native and desktop. */
export function createApi(opts) {
  const f = opts.fetchImpl ?? fetch;
  async function req(method, path, body) {
    const token = await opts.getToken();
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    const res = await f(`${opts.baseUrl.replace(/\/$/, '')}/api${path}`, {
      method,
      headers: {
        ...(isForm || body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
    if (res.status === 401) opts.onUnauthorized?.();
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw new ApiError(res.status, data?.error ?? res.statusText, data?.code);
    return data;
  }
  const q = (params) => {
    const s = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join('&');
    return s ? `?${s}` : '';
  };

  return {
    // auth
    register: (b) => req('POST', '/auth/register', b),
    login: (b) => req('POST', '/auth/login', b),
    verifyEmail: (token) => req('POST', '/auth/verify', { token }),
    resendVerification: () => req('POST', '/auth/verify/resend'),
    forgotPassword: (email) => req('POST', '/auth/password/forgot', { email }),
    resetPassword: (token, password) => req('POST', '/auth/password/reset', { token, password }),
    changePassword: (current, password) => req('POST', '/auth/password/change', { current, password }),
    me: () => req('GET', '/me'),
    updateMe: (b) => req('PATCH', '/me', b),
    updateSettings: (b) => req('PATCH', '/me/settings', b),
    equip: (b) => req('POST', '/me/equip', b),
    registerPushToken: (b) => req('POST', '/me/push-token', b),
    deleteAccount: () => req('DELETE', '/me'),

    // upload
    upload: (form) => req('POST', '/upload', form),

    // users
    user: (handle) => req('GET', `/users/${handle}`),
    members: (p = {}) => req('GET', `/users${q(p)}`),
    follow: (id) => req('POST', `/users/${id}/follow`),
    block: (id) => req('POST', `/users/${id}/block`),
    report: (b) => req('POST', '/reports', b),

    // feed
    feed: (p = {}) => req('GET', `/feed${q(p)}`),
    post: (id) => req('GET', `/posts/${id}`),
    createPost: (b) => req('POST', '/posts', b),
    deletePost: (id) => req('DELETE', `/posts/${id}`),
    rate: (id, score) => req('POST', `/posts/${id}/rate`, { score }),
    react: (id, kind) => req('POST', `/posts/${id}/react`, { kind }),
    voteBattle: (id, optionId) => req('POST', `/posts/${id}/battle`, { optionId }),
    comment: (id, body) => req('POST', `/posts/${id}/comments`, { body }),
    trending: () => req('GET', '/trending'),

    // drops
    drop: () => req('GET', '/drops/today'),
    submitDrop: (b) => req('POST', '/drops/today', b),

    // roulette
    rouletteNext: () => req('GET', '/roulette/next'),
    rouletteVote: (postId, score) => req('POST', '/roulette/vote', { postId, score }),

    // arena
    hotTakes: () => req('GET', '/arena'),
    stake: (id, side, amount) => req('POST', `/arena/${id}/stake`, { side, amount }),
    proposeTake: (b) => req('POST', '/arena', b),

    // shouts / forums
    boards: () => req('GET', '/shouts/boards'),
    threads: (p = {}) => req('GET', `/shouts${q(p)}`),
    thread: (id) => req('GET', `/shouts/${id}`),
    createThread: (b) => req('POST', '/shouts', b),
    replyThread: (id, body) => req('POST', `/shouts/${id}/replies`, { body }),
    voteThread: (id, v) => req('POST', `/shouts/${id}/vote`, { v }),

    // lounges
    lounges: () => req('GET', '/lounges'),
    lounge: (id) => req('GET', `/lounges/${id}`),

    // messages
    conversations: () => req('GET', '/conversations'),
    openConversation: (userId) => req('POST', '/conversations', { userId }),
    messages: (id, before) => req('GET', `/conversations/${id}/messages${q({ before })}`),
    sendMessage: (id, b) => req('POST', `/conversations/${id}/messages`, b),

    // notifications
    notifications: () => req('GET', '/notifications'),
    markNotificationsRead: () => req('POST', '/notifications/read'),

    // store
    store: () => req('GET', '/store'),
    buy: (id, currency = 'sparks') => req('POST', `/store/${id}/buy`, { currency }),
    inventory: () => req('GET', '/store/inventory'),
    claimDaily: () => req('POST', '/store/daily'),

    // live
    streams: () => req('GET', '/live'),
    stream: (id) => req('GET', `/live/${id}`),
    goLive: (b) => req('POST', '/live', b),
    iceServers: () => req('GET', '/rtc/ice'),
    endLive: (id) => req('DELETE', `/live/${id}`),
    sendGift: (id, giftId) => req('POST', `/live/${id}/gift`, { giftId }),

    // payments (Gems)
    gemPacks: () => req('GET', '/payments/packs'),
    stripeCheckout: (packId, returnUrl) => req('POST', '/payments/stripe/checkout', { packId, returnUrl }),
    purchaseHistory: () => req('GET', '/payments/history'),

    // leaderboards
    leaderboard: (kind = 'vibe') => req('GET', `/leaderboard${q({ kind })}`),
  };
}
