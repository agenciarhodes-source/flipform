self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== 'SHOW_LEAD_NOTIFICATION') return;

  const payload = event.data.notification || {};
  const title = typeof payload.title === 'string' && payload.title
    ? payload.title
    : 'Novo lead no FlipForm';
  const href = payload.data && typeof payload.data.href === 'string'
    ? payload.data.href
    : '/leads';
  const tag = typeof payload.tag === 'string' && payload.tag
    ? payload.tag
    : `flipform-lead-${Date.now()}`;

  event.waitUntil((async () => {
    try {
      await self.registration.showNotification(title, {
        body: typeof payload.body === 'string' ? payload.body : 'Você recebeu um novo lead.',
        icon: typeof payload.icon === 'string' ? payload.icon : '/icon.svg',
        badge: typeof payload.badge === 'string' ? payload.badge : '/icon.svg',
        tag,
        silent: false,
        requireInteraction: payload.requireInteraction !== false,
        renotify: payload.renotify !== false,
        timestamp: Number.isFinite(payload.timestamp) ? payload.timestamp : Date.now(),
        data: { href },
      });
      if (event.ports && event.ports[0]) event.ports[0].postMessage({ ok: true, tag });
    } catch {
      if (event.ports && event.ports[0]) event.ports[0].postMessage({ ok: false, tag });
    }
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const href = event.notification.data && event.notification.data.href
    ? event.notification.data.href
    : '/leads';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          if ('navigate' in client) {
            client.navigate(href);
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(href);
      return undefined;
    }),
  );
});
