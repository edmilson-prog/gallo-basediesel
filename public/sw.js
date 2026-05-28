/*
 * GALLO PWA service worker (PRD-070 RF-022).
 *
 * MVP scope: static-asset caching only — NO offline navigation, NO request
 * queue, NO data caching. Those are Fase 2 concerns. We deliberately avoid
 * caching navigation/HTML requests so the SPA shell is never served stale.
 */
const CACHE_VERSION = "gallo-static-v1";
const CACHEABLE_DESTINATIONS = new Set(["style", "script", "image", "font"]);

self.addEventListener("install", (event) => {
  // Activate the new worker as soon as it finishes installing.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Never intercept navigations/HTML — always go to network for the app shell.
  if (request.mode === "navigate") return;
  if (!CACHEABLE_DESTINATIONS.has(request.destination)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok && response.type === "basic") {
          cache.put(request, response.clone());
        }
        return response;
      } catch (err) {
        // Offline with no cache hit: let the request fail naturally.
        throw err;
      }
    })(),
  );
});
