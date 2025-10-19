/* BPApp — push-sw.js (PWA + Push)
   - Web Push notifications
   - Offline caching (app shell)
*/
/* eslint-disable no-unused-vars, no-undef */

const BP_SW_VERSION = 'bp-sw-v1';
const CACHE_PAGE = `${BP_SW_VERSION}-pages`;
const CACHE_ASSETS = `${BP_SW_VERSION}-assets`;
const OFFLINE_URL = '/offline.html';

// Try to precache minimal shell without failing install if an item is missing
async function precache() {
  const cache = await caches.open(CACHE_PAGE);
  const urls = ['/', '/index.html', OFFLINE_URL];
  for (const url of urls) {
    try { await cache.add(new Request(url, { cache: 'reload' })); } catch(_) { /* ignore */ }
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    await precache();
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // cleanup old caches
    const keys = await caches.keys();
    await Promise.all(keys.map(k => k.startsWith('bp-sw-') && k !== CACHE_PAGE && k !== CACHE_ASSETS ? caches.delete(k) : false));
    await self.clients.claim();
  })());
});

// Fetch strategy
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET') return; // ignore non-GET

  // Navigation requests: network-first, fallback to cached index/offline
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_PAGE);
        cache.put('/index.html', fresh.clone());
        return fresh;
      } catch (_) {
        const cache = await caches.open(CACHE_PAGE);
        const cached = await cache.match('/index.html') || await cache.match(OFFLINE_URL);
        return cached || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
    })());
    return;
  }

  // Static assets: stale-while-revalidate
  const isStatic = (
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/lib/') ||
    url.pathname.startsWith('/css/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/favicon.ico' ||
    url.pathname === '/manifest.webmanifest'
  ) || /\.(?:js|css|png|jpg|jpeg|webp|svg|ico|woff2?)$/i.test(url.pathname);

  if (isStatic) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_ASSETS);
      const cached = await cache.match(req);
      const fetchPromise = fetch(req).then((resp) => {
        if (resp && resp.status === 200) cache.put(req, resp.clone());
        return resp;
      }).catch(() => undefined);
      return cached || fetchPromise || new Response('Offline asset', { status: 503 });
    })());
    return;
  }
});

// Web Push
self.addEventListener('push', (event) => {
  try{
    const data = event.data ? event.data.json() : {};
    
    // SOLO notifiche con contenuto valido - NO fallback generici
    if (!data.body || data.body.trim() === '') {
      console.warn('[ServiceWorker] Received empty notification, ignoring');
      return;
    }
    
    const title = data.title || 'Battle Plan';
    const body = data.body;
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
  }catch(error){
    console.error('[ServiceWorker] Error processing notification:', error);
    // Non mostrare notifiche generiche - solo notifiche specifiche
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification && event.notification.close && event.notification.close();
  const targetUrl = (event.notification && event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) { if (client.focus) return client.focus(); }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});

