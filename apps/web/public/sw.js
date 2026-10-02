// Minimal offline shell cache for the ChatLOL PWA.
const CACHE = 'chatlol-v2';
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/favicon.png', '/brand/wordmark.webp', '/brand/mascot.webp', '/manifest.webmanifest']))); self.skipWaiting(); });
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api') || url.pathname.startsWith('/socket.io')) return;
  if (e.request.mode === 'navigate') e.respondWith(fetch(e.request).catch(() => caches.match('/')));
});

// ——— Web Push: notifications from ChatLOL while the site is closed ———
self.addEventListener('push', (e) => {
  let msg = {};
  try { msg = e.data ? e.data.json() : {}; } catch { msg = { title: 'ChatLOL', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(msg.title || 'ChatLOL', {
    body: msg.body || '',
    icon: '/icon-192.png',
    badge: '/favicon-32.png',
    tag: msg.link || undefined,
    data: { link: msg.link || '/' },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const link = (e.notification.data && e.notification.data.link) || '/';
  e.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const tab = tabs.find((c) => new URL(c.url).origin === self.location.origin);
    if (tab) { await tab.focus(); tab.postMessage({ type: 'open', link }); return; }
    await self.clients.openWindow(link);
  })());
});
