import { useSyncExternalStore } from 'react';
import type { NotificationItem, RewardEvent, UserPrivate, UserPublic } from '@chatlol/shared';

export interface Toast { id: number; kind: 'reward' | 'info' | 'error'; title: string; body?: string; sparks?: number; xp?: number }
export interface TickerItem { id: string; text: string; actor: UserPublic | null; at: string }

export interface SessionState {
  ready: boolean;
  token: string | null;
  user: UserPrivate | null;
  toasts: Toast[];
  notifications: NotificationItem[];
  unread: number;
  unreadDms: number;
  ticker: TickerItem[];
  typing: Record<string, string | null>;
  levelUp: RewardEvent['levelUp'];
  locked: boolean;
}

let state: SessionState = {
  ready: false, token: null, user: null, toasts: [], notifications: [], unread: 0, unreadDms: 0, ticker: [], typing: {}, levelUp: null, locked: false,
};
const listeners = new Set<() => void>();

export const session = {
  get: () => state,
  set(patch: Partial<SessionState> | ((s: SessionState) => Partial<SessionState>)) {
    state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
    listeners.forEach((l) => l());
  },
  patchUser(patch: Partial<UserPrivate>) {
    if (state.user) session.set({ user: { ...state.user, ...patch } });
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

/** Selector hook — re-renders only when the selected slice changes. */
export function useSession<T>(sel: (s: SessionState) => T): T {
  return useSyncExternalStore(session.subscribe, () => sel(state), () => sel(state));
}
