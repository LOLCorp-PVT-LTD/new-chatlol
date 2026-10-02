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
    webPushKey: () => req('GET', '/push/web-key'),
    stickers: () => req('GET', '/stickers'),
    giphySearch: (query, offset = 0) => req('GET', `/stickers/giphy${q({ q: query, offset })}`),
    saveWebPush: (subscription) => req('POST', '/me/web-push', subscription),
    removeWebPush: (endpoint) => req('DELETE', '/me/web-push', { endpoint }),
    deleteAccount: () => req('DELETE', '/me'),

    // upload
    upload: (form) => req('POST', '/upload', form),

    // users
    user: (handle) => req('GET', `/users/${handle}`),
    members: (p = {}) => req('GET', `/users${q(p)}`),
    follow: (id) => req('POST', `/users/${id}/follow`),
    friendRequests: () => req('GET', '/friend-requests'),
    friends: (userId, before) => req('GET', `/friends${q({ user: userId, before })}`),
    addFriend: (id) => req('POST', `/users/${id}/friend-request`),
    cancelFriendRequest: (id) => req('DELETE', `/users/${id}/friend-request`),
    acceptFriend: (id) => req('POST', `/users/${id}/friend-request/accept`),
    declineFriend: (id) => req('POST', `/users/${id}/friend-request/decline`),
    unfriend: (id) => req('DELETE', `/users/${id}/friend`),
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
    comment: (id, body, sticker = null) => req('POST', `/posts/${id}/comments`, { body, sticker }),
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

    // forums
    boards: () => req('GET', '/forums/boards'),
    threads: (p = {}) => req('GET', `/forums${q(p)}`),
    thread: (id) => req('GET', `/forums/${id}`),
    createThread: (b) => req('POST', '/forums', b),
    replyThread: (id, body) => req('POST', `/forums/${id}/replies`, { body }),
    voteThread: (id, v) => req('POST', `/forums/${id}/vote`, { v }),

    // shoutbox (global live notice board)
    shouts: (p = {}) => req('GET', `/shouts${q(p)}`),
    shout: (b) => req('POST', '/shouts', b),
    reactShout: (id, kind) => req('POST', `/shouts/${id}/react`, { kind }),
    deleteShout: (id) => req('DELETE', `/shouts/${id}`),
    shoutTrends: () => req('GET', '/shouts/trending'),

    // home dashboard
    home: () => req('GET', '/home'),

    // profiles
    updateProfile: (b) => req('PATCH', '/me/profile', b),
    changeEmail: (email, password) => req('POST', '/me/email', { email, password }),
    gallery: (userId, album) => req('GET', `/users/${userId}/gallery${q({ album })}`),
    rateProfile: (userId, score) => req('POST', `/users/${userId}/rate`, { score }),
    wall: (userId) => req('GET', `/users/${userId}/wall`),
    postWall: (userId, b) => req('POST', `/users/${userId}/wall`, b),
    deleteWallNote: (id) => req('DELETE', `/wall/${id}`),
    insights: () => req('GET', '/me/insights'),
    spotifySearch: (query) => req('GET', `/songs/search${q({ q: query })}`),
    songSearch: (query) => req('GET', `/songs/search${q({ q: query })}`),
    updateLayout: (layout) => req('PUT', '/me/profile/layout', layout),
    showcase: (userId, types, limit) => req('GET', `/users/${userId}/showcase${q({ types: types.join(','), limit })}`),
    spotifyResolve: (url) => req('GET', `/spotify/resolve${q({ url })}`),

    // premium
    premium: () => req('GET', '/premium'),
    buyPremium: (planId) => req('POST', '/premium/buy', { planId }),

    // admin panel
    admin: {
      overview: () => req('GET', '/admin/overview'),
      users: (p = {}) => req('GET', `/admin/users${q(p)}`),
      user: (id) => req('GET', `/admin/users/${id}`),
      action: (id, b) => req('POST', `/admin/users/${id}/action`, b),
      setRole: (id, role) => req('POST', `/admin/users/${id}/role`, { role }),
      grantPremium: (id, days) => req('POST', `/admin/users/${id}/premium`, { days }),
      reports: (status) => req('GET', `/admin/reports${q({ status })}`),
      resolveReport: (id, b) => req('POST', `/admin/reports/${id}`, b),
      flags: (status) => req('GET', `/admin/flags${q({ status })}`),
      resolveFlag: (id, status) => req('POST', `/admin/flags/${id}`, { status }),
      removeContent: (type, id) => req('POST', '/admin/content/remove', { type, id }),
      modlog: () => req('GET', '/admin/modlog'),
      personas: () => req('GET', '/admin/personas'),
      updatePersona: (id, b) => req('PATCH', `/admin/personas/${id}`, b),
    },

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
