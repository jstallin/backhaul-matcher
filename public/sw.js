// Haul Monitor Service Worker
// Minimal SW — satisfies Chrome's PWA installability requirements.
// Network-first: always tries the network, no aggressive caching.

const CACHE_NAME = 'haul-monitor-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Clean up old caches on activate
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests to same origin
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith(self.location.origin)) return;

  // Network-first: try network, fall back to cache for offline
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful navigation responses for offline fallback
        if (response.ok && event.request.mode === 'navigate') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
