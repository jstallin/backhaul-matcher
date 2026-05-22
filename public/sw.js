// Haul Monitor Service Worker
// Minimal SW — satisfies Chrome's PWA installability requirements.
// Network-first: always tries the network, no aggressive caching.

// Haul Monitor Service Worker
// Minimal SW — satisfies PWA installability. No caching of app shell;
// navigation always goes to the network so deployments are picked up immediately.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Purge all caches from previous versions
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Pass all requests straight to the network — no caching.
  // This ensures users always get the latest deployment.
});
