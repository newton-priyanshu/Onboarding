/**
 * NST BLR · AARAMBH — Offline-first service worker (audit finding R2)
 *
 * Strategy:
 *  - Precache the app shell (index.html + core assets) on install.
 *  - Navigations: network-first, falling back to the cached shell offline.
 *  - Static assets: stale-while-revalidate so updates land on next visit.
 *  - Never intercept Supabase API / auth requests (cross-origin anyway).
 *
 * NOTE: assets are Vite-hashed (immutable), so versioning via cache name is
 * enough — old caches are purged on activate.
 */
const CACHE_NAME = 'nst-aarambh-v1';
const PRECACHE_URLS = ['/', '/index.html', '/manifest.json', '/icons.svg'];

self.addEventListener('install', (event) => {
  // addAll rejects the whole install if ANY url 404s (which would silently
  // brick offline support) — precache each URL independently instead.
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url))))
      .then((results) => {
        results.forEach((r, i) => {
          if (r.status === 'rejected') {
            console.warn(`[SW] precache failed for ${PRECACHE_URLS[i]}:`, r.reason);
          }
        });
        self.skipWaiting();
      }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Only handle same-origin requests — leave Supabase API/auth alone.
  if (url.origin !== self.location.origin) return;

  // Navigations: network-first with offline fallback to the app shell.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(() => caches.match('/index.html')),
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
