// Kept at the historical /sw.min.js URL so cache-first Chirpy installations can
// update. This worker has no fetch handler and never stores new site resources.
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    try {
      const home = new URL('/', self.location.origin).href;
      for (const name of await caches.keys()) {
        if (/^chirpy-\d+$/.test(name)) {
          const cache = await caches.open(name);
          if (await cache.match(home)) await caches.delete(name);
        } else if (['praxis-room-video-v1', 'praxis-room-video-catalog-v1'].includes(name)) {
          await caches.delete(name);
        }
      }
    } catch { /* Restricted storage must not prevent the replacement from activating. */ }
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'praxis-retirement-status') {
    event.ports[0]?.postMessage({ type: 'praxis-retirement-ready', version: 1 });
  }
});
