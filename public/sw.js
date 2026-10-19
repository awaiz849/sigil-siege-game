// Service worker: cache-first for the big files that never change (MediaPipe wasm + loader + hand
// model, 3D models), so repeat visits load them from this device instead of the network. The HTTP
// cache alone is not enough: browsers may evict or skip a 7.6 MB entry like the hand model.
// The files have fixed names: bump CACHE whenever one of them changes, so old copies are dropped.
const CACHE = 'sigil-assets-v1';
const CACHED_PATHS = /\/(mediapipe|models)\//;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith('sigil-assets-') && key !== CACHE) await caches.delete(key);
      }
      await self.clients.claim(); // control the open page right away (no reload needed)
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || !CACHED_PATHS.test(url.pathname)) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      const res = await fetch(req);
      // Keep a copy (full 200 responses only), while the page reads the original.
      if (res.status === 200) event.waitUntil(cache.put(req, res.clone()));
      return res;
    })(),
  );
});
