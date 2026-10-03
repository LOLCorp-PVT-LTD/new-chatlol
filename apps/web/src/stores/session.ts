import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import type { NotificationItem, RewardEvent, UserPrivate, UserPublic, ChatMessage } from '@chatlol/shared';
import { levelForXp } from '@chatlol/shared';
import { loadAds } from '../lib/ads';
import { api, tokenStore, setUnauthorizedHandler } from '../lib/api';
import { getSocket, reconnectSocket, type AppSocket } from '../lib/socket';
import { syncWebPush } from '../lib/webPush';
import { ding, buzz, confetti, fxPrefs } from '../lib/fx';

export interface ToastAction { label: string; primary?: boolean; run: () => Promise<unknown> | void }
export interface Toast { id: number; kind: 'reward' | 'info' | 'error' | 'level'; title: string; body?: string; sparks?: number; xp?: number; avatarUrl?: string | null; actions?: ToastAction[] }
export interface TickerItem { id: string; text: string; actor: UserPublic | null; at: string }

export const useSession = defineStore('session', () => {
  const user = ref<UserPrivate | null>(null);
  const ready = ref(false);
  const toasts = ref<Toast[]>([]);
  const notifications = ref<NotificationItem[]>([]);
  const unread = ref(0);
  const unreadDms = ref(0);
  const ticker = ref<TickerItem[]>([]);
  const levelUp = ref<{ from: number; to: number } | null>(null);
  const typing = ref<Record<string, string | null>>({}); // conversationId → userId typing
  const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const dmListeners = new Set<(m: ChatMessage) => void>();
  let socket: AppSocket | null = null;
  let toastId = 0;

  const isAuthed = computed(() => !!user.value);

  const recent = new Map<string, number>();
  function dismissToast(id: number) {
    toasts.value = toasts.value.filter((x) => x.id !== id);
  }
  /** Accept / Decline buttons for request and invitation notifications. */
  function requestActions(a: NonNullable<NotificationItem['action']>, link: string | null): ToastAction[] {
    const go = (path: string | null) => path && void import('../router').then(({ router }) => router.push(path));
    const done = (msg: string, p: Promise<unknown>, after?: () => void) =>
      p.then(() => (toast({ kind: 'info', title: msg }), after?.())).catch((e: Error) => toast({ kind: 'error', title: e.message }));
    switch (a.type) {
      case 'friend_request':
        return [
          { label: 'Accept', primary: true, run: () => done('🤝 You’re now friends!', api.acceptFriend(a.id)) },
          { label: 'Decline', run: () => done('Request declined', api.declineFriend(a.id)) },
        ];
      case 'arena_invite':
        return [
          { label: 'Join game', primary: true, run: () => done('🎮 You’re in!', api.joinArena(a.id), () => go(`/arenas/${a.id}`)) },
          { label: 'Not now', run: () => {} },
        ];
      case 'clan_invite':
        return [
          { label: 'Join clan', primary: true, run: () => done('🏰 Welcome to the clan!', api.joinClan(a.id), () => go(`/clans/${a.id}`)) },
          { label: 'Decline', run: () => {} },
        ];
      case 'clan_request': {
        const [clanId, userId] = a.id.split(':');
        return [
          { label: 'Accept', primary: true, run: () => done('Accepted into the clan', api.clanRequest(clanId, userId, 'accept')) },
          { label: 'Decline', run: () => done('Request declined', api.clanRequest(clanId, userId, 'decline')) },
        ];
      }
      case 'clan_war':
        return [
          { label: 'Accept war', primary: true, run: () => done('⚔️ War on!', api.answerWar(a.id, 'accept'), () => go(link)) },
          { label: 'Decline', run: () => done('Challenge declined', api.answerWar(a.id, 'decline')) },
        ];
      default:
        return [];
    }
  }

  function toast(t: Omit<Toast, 'id'>, ms = 6500) {
    // HTTP responses and the socket can both report the same reward — show it once.
    const key = `${t.kind}:${t.title}`;
    if (Date.now() - (recent.get(key) ?? 0) < 2500) return;
    recent.set(key, Date.now());
    const id = ++toastId;
    toasts.value.push({ ...t, id });
    // Toasts stay up long enough to read (6.5s at least); the ✕ closes one early.
    setTimeout(() => dismissToast(id), Math.max(ms, 6500));
  }

  function reward(r?: RewardEvent | null) {
    if (!r || (!r.sparks && !r.xp)) return;
    toast({ kind: 'reward', title: r.reason, sparks: r.sparks, xp: r.xp });
    ding(r.questCompleted ? 'level' : 'reward');
    buzz(15);
    if (r.levelUp) {
      levelUp.value = r.levelUp;
      confetti();
      ding('level');
    }
  }

  let pushSyncedFor = '';
  function applyUser(u: UserPrivate) {
    user.value = u;
    // Signed in on a browser that already allows notifications: make sure the server knows this subscription.
    if (pushSyncedFor !== u.id) {
      pushSyncedFor = u.id;
      void syncWebPush();
    }
    fxPrefs.sound = u.settings.soundEnabled;
    fxPrefs.haptics = u.settings.hapticsEnabled;
    fxPrefs.motion = !u.settings.reduceMotion;
  }

  function wireSocket() {
    socket?.removeAllListeners();
    socket = user.value ? reconnectSocket() : getSocket();
    socket.on('wallet', (w) => {
      if (!user.value) return;
      const before = user.value.level;
      Object.assign(user.value, { sparks: w.sparks, gems: w.gems, gold: w.gold, xp: w.xp, level: w.level });
      if (w.level > before && !levelUp.value) levelUp.value = { from: before, to: w.level };
    });
    socket.on('reward', (r) => { if (r.reason !== 'rate') toast({ kind: 'reward', title: r.reason, sparks: r.sparks, xp: r.xp }, 2600); });
    socket.on('toast', (t) => toast(t));
    socket.on('notification', (n) => {
      notifications.value.unshift(n);
      if (n.kind !== 'dm') unread.value++;
      // Sounds: DMs have their own chime (below); requests a rising call; everything else a soft bell.
      if (n.kind !== 'dm') ding(n.action ? 'request' : 'notify');
      if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        new Notification(n.title, { body: n.body, icon: n.actor?.avatarUrl || '/icon-192.png', tag: n.id });
      }
      if (n.kind !== 'dm') {
        const actions = n.action ? requestActions(n.action, n.link) : undefined;
        // Requests stay up longer so there's time to answer them.
        toast({ kind: 'info', title: n.title, body: n.body, avatarUrl: n.actor?.avatarUrl ?? null, actions }, actions ? 15000 : 6500);
      }
    });
    socket.on('dm:message', (m) => {
      if (m.author.id !== user.value?.id) {
        unreadDms.value++;
        // A chime unless you're looking at that very conversation.
        if (document.hidden || !location.pathname.endsWith(`/messages/${m.roomId}`)) ding('message');
        if (typing.value[m.roomId] === m.author.id) (clearTimeout(typingTimers.get(m.roomId)), (typing.value = { ...typing.value, [m.roomId]: null }));
      }
      dmListeners.forEach((fn) => fn(m));
    });
    // "typing…" lasts 4 s after the last keystroke signal, and clears at once on "stopped" or when their message lands.
    socket.on('dm:typing', ({ conversationId, userId, typing: t }) => {
      clearTimeout(typingTimers.get(conversationId));
      typing.value = { ...typing.value, [conversationId]: t ? userId : null };
      if (t) typingTimers.set(conversationId, setTimeout(() => (typing.value = { ...typing.value, [conversationId]: null }), 4000));
    });
    socket.on('ticker', (t) => { ticker.value = [t, ...ticker.value].slice(0, 12); });
    // LOLShield / moderator actions take effect immediately.
    socket.on('moderation', (m) => {
      if (m.action === 'suspend' || m.action === 'ban') {
        toast({ kind: 'error', title: m.action === 'ban' ? 'Your account was terminated' : 'Your account was suspended', body: m.reason ?? undefined }, 8000);
        logout();
        return;
      }
      if (m.action === 'mute') toast({ kind: 'error', title: '🔇 You’ve been muted', body: m.reason ?? undefined }, 6000);
      void refresh();
    });
  }

  function onDm(fn: (m: ChatMessage) => void) {
    dmListeners.add(fn);
    return () => dmListeners.delete(fn);
  }

  async function boot() {
    setUnauthorizedHandler(() => { if (user.value) logout(); });
    if (tokenStore.get()) {
      try {
        const r = await api.me();
        applyUser(r.user);
        setTimeout(() => reward(r.reward), 800);
        void loadNotifications();
      } catch { tokenStore.set(null); }
    }
    wireSocket();
    ready.value = true;
  }

  async function loadNotifications() {
    const [n, c] = await Promise.all([api.notifications(), api.conversations()]);
    notifications.value = n.items;
    unread.value = n.items.filter((x) => !x.read && x.kind !== 'dm').length;
    unreadDms.value = c.conversations.reduce((a, x) => a + x.unread, 0);
  }

  async function login(loginId: string, password: string) {
    const r = await api.login({ login: loginId, password });
    tokenStore.set(r.token);
    applyUser(r.user);
    void loadAds(true);
    wireSocket();
    const me = await api.me();
    applyUser(me.user);
    reward(me.reward);
    void loadNotifications();
  }

  /** Signs in with a token from register / password reset. */
  async function adoptSession(t: string) {
    tokenStore.set(t);
    wireSocket();
    const me = await api.me();
    applyUser(me.user);
    reward(me.reward);
    void loadNotifications();
  }

  async function register(b: Parameters<typeof api.register>[0]) {
    const r = await api.register(b);
    tokenStore.set(r.token);
    applyUser(r.user);
    void loadAds(true);
    wireSocket();
    const me = await api.me();
    applyUser(me.user);
    reward(me.reward);
    void loadNotifications();
  }

  function logout() {
    void loadAds(true);
    tokenStore.set(null);
    user.value = null;
    notifications.value = [];
    wireSocket();
  }

  async function refresh() {
    if (!user.value) return;
    applyUser((await api.me()).user);
  }

  function spend(n: number) {
    if (user.value) user.value.sparks -= n;
  }

  // Keep level in sync if xp changes locally.
  watch(() => user.value?.xp, (xp) => { if (user.value && xp !== undefined) user.value.level = levelForXp(xp); });

  return {
    user, ready, isAuthed, toasts, dismissToast, notifications, unread, unreadDms, ticker, levelUp, typing,
    boot, login, register, logout, adoptSession, refresh, reward, toast, applyUser, spend, onDm, loadNotifications,
    socket: () => socket ?? getSocket(),
  };
});
