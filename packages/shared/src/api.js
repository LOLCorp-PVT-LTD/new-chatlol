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
    /** Reactions on comments, forum replies, wall notes and chat messages. */
    reactTo: (type, id, kind) => req('POST', `/react/${type}/${id}`, { kind }),
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
    youtubeResolve: (url) => req('GET', `/youtube/resolve${q({ url })}`),
    festival: () => req('GET', '/festival'),
    // clans
    clans: (query, sort) => req('GET', `/clans${q({ q: query, sort })}`),
    clan: (id) => req('GET', `/clans/${id}`),
    createClan: (b) => req('POST', '/clans', b),
    updateClan: (id, b) => req('PATCH', `/clans/${id}`, b),
    disbandClan: (id) => req('DELETE', `/clans/${id}`),
    joinClan: (id, message) => req('POST', `/clans/${id}/join`, { message }),
    leaveClan: (id) => req('POST', `/clans/${id}/leave`),
    updateClanRoles: (id, roles) => req('PUT', `/clans/${id}/roles`, { roles }),
    clanRequest: (id, userId, verdict) => req('POST', `/clans/${id}/requests/${userId}/${verdict}`),
    clanInvite: (id, userId) => req('POST', `/clans/${id}/invite`, { userId }),
    clanRole: (id, userId, role) => req('POST', `/clans/${id}/members/${userId}/role`, { role }),
    clanKick: (id, userId) => req('POST', `/clans/${id}/members/${userId}/kick`),
    clanDonate: (id, sparks) => req('POST', `/clans/${id}/donate`, { sparks }),
    clanLounge: (id) => req('POST', `/clans/${id}/lounge`),
    declareWar: (id, opponentId, stake, mode, hours) => req('POST', `/clans/${id}/wars`, { opponentId, stake, mode, hours }),
    clanLeaderboard: (board) => req('GET', `/clan-leaderboards${q({ board })}`),
    clanLiveEvent: () => req('GET', '/clan-live-event'),
    startClanLiveEvent: (key, hours) => req('POST', '/clan-live-event', { key, hours }),
    prestigeClan: (id) => req('POST', `/clans/${id}/prestige`),
    buyClanCosmetic: (id, key) => req('POST', `/clans/${id}/cosmetics/${key}`),
    equipClanCosmetic: (id, kind, key) => req('POST', `/clans/${id}/equip`, { kind, key }),
    alliances: () => req('GET', '/alliances'),
    createAlliance: (clanId, name, emoji) => req('POST', '/alliances', { clanId, name, emoji }),
    inviteToAlliance: (id, clanId) => req('POST', `/alliances/${id}/invite`, { clanId }),
    answerAlliance: (id, clanId, accept) => req('POST', `/alliances/${id}/join`, { clanId, accept }),
    leaveAlliance: (id, clanId) => req('POST', `/alliances/${id}/leave`, { clanId }),
    setClanRival: (id, clanId) => req('POST', `/clans/${id}/rival`, { clanId }),
    answerWar: (warId, verdict) => req('POST', `/clan-wars/${warId}/${verdict}`),
    clanWars: () => req('GET', '/clan-wars'),
    clanTerritories: () => req('GET', '/clan-territories'),
    buildClanHq: (id, key) => req('POST', `/clans/${id}/hq/${key}`),
    joinSiege: (id, territory) => req('POST', `/clans/${id}/siege`, { territory }),
    searchGames: (query) => req('GET', `/games-catalog/search${q({ q: query })}`),
    // radio: station = 'shouts' or 'lounge:<id>'
    radio: (station) => req('GET', `/radio/${station.replace(':', '/')}`),
    radioSuggest: (station, youtubeId) => req('POST', `/radio/${station.replace(':', '/')}/suggest`, { youtubeId }),
    radioVote: (station, itemId) => req('POST', `/radio/${station.replace(':', '/')}/vote`, { itemId }),
    radioRemove: (station, itemId) => req('DELETE', `/radio/${station.replace(':', '/')}/queue/${itemId}`),
    radioSkip: (station) => req('POST', `/radio/${station.replace(':', '/')}/skip`),
    radioEnded: (station, trackId) => req('POST', `/radio/${station.replace(':', '/')}/ended`, { trackId }),
    festivalQuiz: (answers) => req('POST', '/festival/quiz', { answers }),
    adminFestivals: () => req('GET', '/admin/festivals'),
    adminSetFestivals: (disabled) => req('PUT', '/admin/festivals', { disabled }),

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
      removeContent: (type, id, reason) => req('POST', '/admin/content/remove', { type, id, reason }),
      modlog: () => req('GET', '/admin/modlog'),
      personas: () => req('GET', '/admin/personas'),
      updatePersona: (id, b) => req('PATCH', `/admin/personas/${id}`, b),
      generatePersonas: (b) => req('POST', '/admin/personas/generate', b),
      setPerms: (id, perms) => req('POST', `/admin/users/${id}/perms`, { perms }),
      wallet: (id, b) => req('POST', `/admin/users/${id}/wallet`, b),
      items: () => req('GET', '/admin/items'),
      giveItem: (id, key, qty = 1) => req('POST', `/admin/users/${id}/items`, { key, qty }),
      boost: (id, hours) => req('POST', `/admin/users/${id}/boost`, { hours }),
      levelGates: () => req('GET', '/admin/level-gates'),
      oversight: () => req('GET', '/admin/oversight'),
      dismissFinding: (id) => req('POST', `/admin/oversight/${id}/dismiss`),
      reinstateStaff: (userId) => req('POST', `/admin/oversight/reinstate/${userId}`),
      ads: () => req('GET', '/admin/ads'),
      saveAds: (b) => req('PUT', '/admin/ads', b),
      tournaments: () => req('GET', '/admin/tournaments'),
      createTournament: (b) => req('POST', '/admin/tournaments', b),
      updateTournament: (id, b) => req('PATCH', `/admin/tournaments/${id}`, b),
      cancelTournament: (id) => req('POST', `/admin/tournaments/${id}/cancel`),
      finishTournament: (id) => req('POST', `/admin/tournaments/${id}/finish`),
      markCashPaid: (id, place) => req('POST', `/admin/tournaments/${id}/cash/${place}/paid`),
      editProfile: (id, b) => req('PATCH', `/admin/users/${id}/profile`, b),
      userContent: (id, kind, before) => req('GET', `/admin/users/${id}/content${q({ kind, before })}`),
      userActivity: (id) => req('GET', `/admin/users/${id}/activity`),
      features: () => req('GET', '/admin/features'),
      arenas: () => req('GET', '/admin/arenas'),
      setWagers: (gemsGold) => req('PUT', '/admin/arenas/wagers', { gemsGold }),
      setLevelGates: (values) => req('PUT', '/admin/level-gates', values),
      terminate: (id, reason) => req('POST', `/admin/users/${id}/terminate`, { reason }),
      payments: (p = {}) => req('GET', `/admin/payments${q(p)}`),
      refund: (id) => req('POST', `/admin/payments/${id}/refund`),
    },

    // lounges
    lounges: () => req('GET', '/lounges'),
    lounge: (id) => req('GET', `/lounges/${id}`),
    createLounge: (b) => req('POST', '/lounges', b),
    updateLounge: (id, b) => req('PATCH', `/lounges/${id}`, b),
    deleteLounge: (id, reason) => req('DELETE', `/lounges/${id}`, { reason }),

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
    usePower: (key) => req('POST', `/store/${key}/use`),
    unlockTheme: (key) => req('POST', `/me/themes/${key}/unlock`),
    changeHandle: (handle) => req('POST', '/me/handle', { handle }),
    referral: () => req('GET', '/me/referral'),
    acceptTerms: () => req('POST', '/me/accept-terms'),
    inviteByEmail: (emails) => req('POST', '/me/referral/invite', { emails }),
    exchange: (to, amount) => req('POST', '/wallet/exchange', { to, amount }),
    useTicket: (key, targetId, loungeId) => req('POST', `/tickets/${key}/use`, { targetId, loungeId }),
    king: () => req('GET', '/king'),
    games: () => req('GET', '/games'),
    gamesLeaderboard: (game) => req('GET', `/games/leaderboard${q({ game })}`),
    arcade: () => req('GET', '/arcade'),
    ads: () => req('GET', '/ads'),
    tournaments: () => req('GET', '/tournaments'),
    tournament: (id) => req('GET', `/tournaments/${id}`),
    joinTournament: (id) => req('POST', `/tournaments/${id}/join`),
    arcadeStart: (game) => req('POST', `/arcade/${game}/start`),
    arcadeFinish: (runId, inputs) => req('POST', `/arcade/runs/${runId}/finish`, { inputs }),
    arcadeLeaderboard: (game, period) => req('GET', `/arcade/${game}/leaderboard${q({ period })}`),
    arenas: () => req('GET', '/arenas'),
    arena: (id, code) => req('GET', `/arenas/${id}${code ? `?code=${encodeURIComponent(code)}` : ''}`),
    createArena: (b) => req('POST', '/arenas', b),
    joinArena: (id, code) => req('POST', `/arenas/${id}/join`, { code }),
    joinArenaByCode: (code) => req('POST', '/arenas/join-code', { code }),
    leaveArena: (id) => req('POST', `/arenas/${id}/leave`),
    inviteToArena: (id, userIds) => req('POST', `/arenas/${id}/invite`, { userIds }),
    startArena: (id) => req('POST', `/arenas/${id}/start`),
    arenaMove: (id, action) => req('POST', `/arenas/${id}/move`, { action }),

    // live
    streams: () => req('GET', '/live'),
    stream: (id) => req('GET', `/live/${id}`),
    goLive: (b) => req('POST', '/live', b),
    adminTestEmail: (to) => req('POST', '/admin/integrations/test-email', { to }),
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
