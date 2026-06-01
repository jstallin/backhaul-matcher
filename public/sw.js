// Haul Monitor — self-unregistering service worker (issue #34).
// The PWA is disabled for now (browser-only access). This SW exists solely to
// remove any previously-installed worker: browsers re-fetch the registered SW
// script on their normal update check, get this version, and it unregisters
// itself + purges caches. Once we're confident no installs remain, this file
// (and public/manifest.json) can be deleted. To re-enable the PWA, restore the
// network-first worker and the registration in app.html.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.registration.unregister();
    const clients = await self.clients.matchAll();
    clients.forEach((client) => client.navigate(client.url));
  })());
});
