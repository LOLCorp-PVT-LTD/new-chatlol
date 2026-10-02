import { api } from './api';

/**
 * Web Push: the browser's own, free push service (Chrome, Edge, Firefox, Safari 16.4+ — on iPhone once the site is
 * added to the Home Screen). The server signs messages with its VAPID key; public/sw.js shows them.
 */
export type WebPushState = 'unsupported' | 'blocked' | 'off' | 'on';

export const webPushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

async function registration() {
  return (await navigator.serviceWorker.getRegistration('/')) ?? navigator.serviceWorker.register('/sw.js');
}
const toKey = (b64: string) => {
  const raw = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export async function webPushState(): Promise<WebPushState> {
  if (!webPushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  const reg = await navigator.serviceWorker.getRegistration('/');
  return (await reg?.pushManager.getSubscription()) && Notification.permission === 'granted' ? 'on' : 'off';
}

/** Asks permission (must run from a click) and subscribes this browser. */
export async function enableWebPush(): Promise<WebPushState> {
  if (!webPushSupported()) return 'unsupported';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm === 'denied' ? 'blocked' : 'off';
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const { publicKey } = await api.webPushKey();
  let sub = await reg.pushManager.getSubscription();
  // A subscription made with a different key can't receive our messages: replace it.
  const current = sub?.options.applicationServerKey;
  if (sub && current && btoa(String.fromCharCode(...new Uint8Array(current))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') !== publicKey) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) });
  await api.saveWebPush(sub.toJSON() as Parameters<typeof api.saveWebPush>[0]);
  return 'on';
}

export async function disableWebPush(): Promise<WebPushState> {
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await api.removeWebPush(sub.endpoint).catch(() => {});
    await sub.unsubscribe();
  }
  return 'off';
}

/** After signing in: if this browser already allowed notifications, make sure the server has its subscription. */
export async function syncWebPush() {
  if (!webPushSupported() || Notification.permission !== 'granted') return;
  const sub = await (await navigator.serviceWorker.getRegistration('/'))?.pushManager.getSubscription();
  if (sub) await api.saveWebPush(sub.toJSON() as Parameters<typeof api.saveWebPush>[0]).catch(() => {});
}
