import { AppState, Platform } from 'react-native';
import type { RewardEvent } from '@chatlol/shared';
import { api, tokenStore } from './api';
import { session, type Toast } from './store';
import { getSocket, resetSocket } from './socket';
import { haptic, localNotify, registerForPush, setBadge } from './native';
import { initPurchases, resetPurchases } from './purchases';

let toastId = 0;
const recent = new Map<string, number>();

export function toast(t: Omit<Toast, 'id'>, ms = 3000) {
  const key = `${t.kind}:${t.title}`;
  if (Date.now() - (recent.get(key) ?? 0) < 2500) return;
  recent.set(key, Date.now());
  const id = ++toastId;
  session.set((s) => ({ toasts: [...s.toasts, { ...t, id }].slice(-3) }));
  setTimeout(() => session.set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), ms);
}

export function reward(r?: RewardEvent | null) {
  if (!r || (!r.sparks && !r.xp)) return;
  toast({ kind: 'reward', title: r.reason, sparks: r.sparks, xp: r.xp });
  haptic.success();
  if (r.levelUp) session.set({ levelUp: r.levelUp });
}

export function errorToast(e: unknown) {
  haptic.error();
  toast({ kind: 'error', title: (e as Error).message ?? 'Something went wrong' });
}

function wireSocket() {
  const sock = resetSocket();
  sock.on('wallet', (w) => session.patchUser({ sparks: w.sparks, gems: w.gems, xp: w.xp, level: w.level }));
  sock.on('reward', (r) => { if (r.reason !== 'rate') toast({ kind: 'reward', title: r.reason, sparks: r.sparks, xp: r.xp }); });
  sock.on('notification', (n) => {
    session.set((s) => ({ notifications: [n, ...s.notifications].slice(0, 80), unread: n.kind === 'dm' ? s.unread : s.unread + 1 }));
    if (AppState.currentState !== 'active' || Platform.OS === 'web') localNotify(n.title, n.body, n.link);
    else if (n.kind !== 'dm') toast({ kind: 'info', title: n.title, body: n.body });
    syncBadge();
  });
  sock.on('dm:message', (m) => {
    if (m.author.id !== session.get().user?.id) session.set((s) => ({ unreadDms: s.unreadDms + 1 }));
    syncBadge();
  });
  sock.on('dm:typing', ({ conversationId, userId, typing }) => session.set((s) => ({ typing: { ...s.typing, [conversationId]: typing ? userId : null } })));
  sock.on('ticker', (t) => session.set((s) => ({ ticker: [t, ...s.ticker].slice(0, 12) })));
}

export function syncBadge() {
  const s = session.get();
  setBadge(s.unread + s.unreadDms);
}

export async function loadNotifications() {
  const [n, c] = await Promise.all([api.notifications(), api.conversations()]);
  session.set({
    notifications: n.items,
    unread: n.items.filter((x) => !x.read && x.kind !== 'dm').length,
    unreadDms: c.conversations.reduce((a, x) => a + x.unread, 0),
  });
  syncBadge();
}

async function afterAuth(token: string) {
  await tokenStore.save(token);
  const me = await api.me();
  session.set({ user: me.user, locked: false });
  wireSocket();
  setTimeout(() => reward(me.reward), 600);
  void loadNotifications();
  void registerForPush();
  void initPurchases(me.user.id).catch((e) => console.warn('purchases init failed', e));
}

/** Adopts a session token issued by password reset / change. */
export const adoptSession = (token: string) => afterAuth(token);

export async function boot() {
  const token = await tokenStore.load();
  if (token) {
    session.set({ token });
    try {
      await afterAuth(token);
    } catch {
      await tokenStore.save(null);
    }
  }
  if (!session.get().user) getSocket();
  session.set({ ready: true });
}

export async function login(loginId: string, password: string) {
  const r = await api.login({ login: loginId, password });
  await afterAuth(r.token);
}

export async function register(b: Parameters<typeof api.register>[0]) {
  const r = await api.register(b);
  await afterAuth(r.token);
}

export async function logout() {
  await resetPurchases();
  await tokenStore.save(null);
  session.set({ user: null, notifications: [], unread: 0, unreadDms: 0 });
  setBadge(0);
  resetSocket();
}

export async function refreshMe() {
  if (!session.get().user) return;
  session.set({ user: (await api.me()).user });
}
