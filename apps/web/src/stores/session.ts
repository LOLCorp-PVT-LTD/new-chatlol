import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import type { NotificationItem, RewardEvent, UserPrivate, UserPublic, ChatMessage } from '@chatlol/shared';
import { levelForXp } from '@chatlol/shared';
import { api, tokenStore, setUnauthorizedHandler } from '../lib/api';
import { getSocket, reconnectSocket, type AppSocket } from '../lib/socket';
import { syncWebPush } from '../lib/webPush';
import { ding, buzz, confetti, fxPrefs } from '../lib/fx';

export interface Toast { id: number; kind: 'reward' | 'info' | 'error' | 'level'; title: string; body?: string; sparks?: number; xp?: number }
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
  const dmListeners = new Set<(m: ChatMessage) => void>();
  let socket: AppSocket | null = null;
  let toastId = 0;

  const isAuthed = computed(() => !!user.value);

  const recent = new Map<string, number>();
  function toast(t: Omit<Toast, 'id'>, ms = 3200) {
    // HTTP responses and the socket can both report the same reward — show it once.
    const key = `${t.kind}:${t.title}`;
    if (Date.now() - (recent.get(key) ?? 0) < 2500) return;
    recent.set(key, Date.now());
    const id = ++toastId;
    toasts.value.push({ ...t, id });
    setTimeout(() => (toasts.value = toasts.value.filter((x) => x.id !== id)), ms);
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
      if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        new Notification(n.title, { body: n.body, icon: n.actor?.avatarUrl || '/icon-192.png', tag: n.id });
      } else if (n.kind !== 'dm') {
        toast({ kind: 'info', title: n.title, body: n.body });
      }
    });
    socket.on('dm:message', (m) => {
      if (m.author.id !== user.value?.id) unreadDms.value++;
      dmListeners.forEach((fn) => fn(m));
    });
    socket.on('dm:typing', ({ conversationId, userId, typing: t }) => { typing.value = { ...typing.value, [conversationId]: t ? userId : null }; });
    socket.on('ticker', (t) => { ticker.value = [t, ...ticker.value].slice(0, 12); });
    // SafeShield / moderator actions take effect immediately.
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
    wireSocket();
    const me = await api.me();
    applyUser(me.user);
    reward(me.reward);
    void loadNotifications();
  }

  function logout() {
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
    user, ready, isAuthed, toasts, notifications, unread, unreadDms, ticker, levelUp, typing,
    boot, login, register, logout, adoptSession, refresh, reward, toast, applyUser, spend, onDm, loadNotifications,
    socket: () => socket ?? getSocket(),
  };
});
