/*
 * GALLO PWA service worker (PRD-070 RF-022).
 *
 * MVP scope: static-asset caching only — NO offline navigation, NO request
 * queue, NO data caching. Those are Fase 2 concerns. We deliberately avoid
 * caching navigation/HTML requests so the SPA shell is never served stale.
 */

/*
 * Bumped v1 → v2 to purge poisoned entries (see below). The `activate` handler
 * deletes every cache whose key !== CACHE_VERSION, so shipping a new version
 * string is what heals already-broken clients: they cannot fix themselves by
 * reloading, because the poisoned entry is served cache-first.
 *
 * ALWAYS bump this when changing the caching rules below.
 */
const CACHE_VERSION = "gallo-static-v2";
const CACHEABLE_DESTINATIONS = new Set(["style", "script", "image", "font"]);

/**
 * Content types that may be stored for a given request destination.
 *
 * This guard is the fix for a cache-poisoning bug that could lock a user out
 * of the app permanently, surviving hard reloads:
 *
 *   1. `vercel.json` rewrites every unmatched path to /index.html, so a request
 *      for a chunk that no longer exists answers **200 with HTML**, not 404.
 *   2. After a deploy, an open tab still references the previous build's hashed
 *      chunks — which are exactly those now-missing paths.
 *   3. The old check was `response.ok`, and 200 is "ok", so the HTML shell was
 *      written into the cache under a .js URL.
 *   4. Every later load hit `cache.match()` first and got HTML for a script,
 *      failing strict MIME checking: "Expected a JavaScript-or-Wasm module
 *      script but the server responded with a MIME type of text/html".
 *
 * Reloading could not clear it: the entry is served before the network is ever
 * consulted, and the cache has no expiry. Only clearing site data helped.
 */
const ALLOWED_CONTENT_TYPES = {
  script: ["javascript", "ecmascript"],
  style: ["text/css"],
  font: ["font/", "application/font", "application/vnd.ms-fontobject"],
  image: ["image/"],
};

/** True when the response body actually matches what the request asked for. */
function isCacheableResponse(request, response) {
  if (!response.ok || response.type !== "basic") return false;

  // A rewritten fallback is an SPA navigation result, never a real asset.
  if (response.redirected) return false;

  const allowed = ALLOWED_CONTENT_TYPES[request.destination];
  if (!allowed) return false;

  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  // No content-type at all: refuse rather than guess.
  if (!contentType) return false;

  return allowed.some((token) => contentType.includes(token));
}

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

      // Defence in depth: a poisoned entry from an older worker must never be
      // served, even if it somehow outlives the version purge above.
      if (cached && isCacheableResponse(request, cached)) return cached;
      if (cached) await cache.delete(request);

      try {
        const response = await fetch(request);
        if (isCacheableResponse(request, response)) {
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
