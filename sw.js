/* CrownNet — service worker: принимает push-уведомления, когда сайт закрыт, и открывает нужную страницу по нажатию. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('fetch', () => { /* нужен браузеру, чтобы разрешить установку приложения */ });
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil((async () => {
    // если сайт сейчас открыт и виден — человек и так всё видит внутри страницы
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (wins.some(w => w.visibilityState === 'visible' && w.focused) && d.tag !== 'call') return;
    await self.registration.showNotification(d.title || 'CrownNet', {
      body: d.body || '', icon: 'assets/icons/icon-192.png', badge: 'assets/icons/badge.png',
      tag: d.tag || undefined, renotify: !!d.tag, requireInteraction: d.tag === 'call',
      data: { url: d.url || 'index.html' }
    });
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || 'index.html', self.registration.scope).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) { if (w.url.startsWith(self.registration.scope)) { try { await w.navigate(url); } catch (x) { /* ок */ } return w.focus(); } }
    return self.clients.openWindow(url);
  })());
});
