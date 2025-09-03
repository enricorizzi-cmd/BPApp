/* BPApp – push-sw.js (Service Worker per Web Push)
   Copia locale nel backend come fallback in deploy monorepo con root=backend.
*/
/* global self, clients */
self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  clients.claim();
});

self.addEventListener('push', (event) => {
  try{
    const data = event.data ? event.data.json() : {};
    const title = data.title || 'Battle Plan';
    const body = data.body || 'Hai una nuova notifica';
    const tag = data.tag || 'bp-tag';
    const url = data.url || '/';

    event.waitUntil(
      self.registration.showNotification(title, {
        body,
        tag,
        data: { url },
        icon: data.icon || '/favicon.ico',
        badge: data.badge || '/favicon.ico'
      })
    );
  }catch(_){
    // fallback generico
    event.waitUntil(
      self.registration.showNotification('Battle Plan', {
        body: 'Hai una nuova notifica',
        tag: 'bp-tag-fallback'
      })
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification && event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});

