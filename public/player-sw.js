// Player service worker: keeps the slideshow's photos on the TV itself.
// - Gallery images (immutable URLs) are served from the cache first, so restarts are
//   instant and the slideshow keeps going if the Wi-Fi drops.
// - The page and its scripts are refreshed in the background (stale-while-revalidate)
//   so the player also boots offline.
// - After every playlist change the player sends the URLs it still needs; everything
//   else is deleted, so old nights don't pile up on the TV.
const MEDIA = 'gusto-media-v1';
const SHELL = 'gusto-shell-v1';
const GALLERY = '/storage/v1/object/public/gallery/albums/';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.pathname.includes(GALLERY)) {
    event.respondWith(
      caches.open(MEDIA).then(async (cache) => {
        const hit = await cache.match(request.url);
        if (hit) return hit;
        const res = await fetch(request);
        // Only real (CORS, non-opaque) responses: opaque ones bloat storage quota.
        if (res.ok && res.type === 'cors') cache.put(request.url, res.clone());
        return res;
      }),
    );
    return;
  }

  const sameOrigin = url.origin === self.location.origin;
  const isShell = sameOrigin && (request.mode === 'navigate' || url.pathname.startsWith('/assets/'));
  if (isShell) {
    event.respondWith(
      caches.open(SHELL).then(async (cache) => {
        const key = request.mode === 'navigate' ? '/index.html' : request.url;
        const hit = await cache.match(key);
        const fresh = fetch(request)
          .then((res) => {
            if (res.ok) cache.put(key, res.clone());
            return res;
          })
          .catch(() => hit);
        return hit && request.mode !== 'navigate' ? hit : fresh.then((res) => res || hit);
      }),
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'keep') return;
  const keep = new Set(event.data.urls);
  event.waitUntil(
    caches.open(MEDIA).then(async (cache) => {
      const keys = await cache.keys();
      await Promise.all(keys.filter((r) => !keep.has(r.url)).map((r) => cache.delete(r)));
    }),
  );
});
