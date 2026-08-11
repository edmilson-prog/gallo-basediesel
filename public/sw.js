/*
 * GALLO PWA service worker (PRD-070 RF-022).
 *
 * MVP scope: static-asset caching only — NO offline navigation, NO request
 * queue, NO data caching. Those are Fase 2 concerns. We deliberately avoid
 * caching navigation/HTML requests so the SPA shell is never served stale.
 *
 * Plus the two Web Push handlers (PRD-145 RF-004), added for the atendimento
 * PWA at /atendimento. They are additive: one worker serves both installable
 * apps on this origin, because it is registered at the root scope.
 */

/*
 * Bumped v1 → v2 to purge poisoned entries (see below). The `activate` handler
 * deletes every cache whose key !== CACHE_VERSION, so shipping a new version
 * string is what heals already-broken clients: they cannot fix themselves by
 * reloading, because the poisoned entry is served cache-first.
 *
 * ALWAYS bump this when changing the caching rules below.
 */
const CACHE_VERSION = "gallo-static-v3";
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

/* ── Web Push (PRD-145 RF-004) ─────────────────────────────────────────────
 *
 * The payload is minted by the `push-dispatch` Edge Function and stays under
 * 3KB. `data.url` is an in-app path, never an absolute URL: `notificationclick`
 * focuses an already-open tab of this origin when it finds one, and a stale
 * absolute host would defeat that match after a domain change.
 */

const PUSH_DEFAULT_TITLE = "GALLO Atendimento";
const PUSH_ICON = "/atendimento-icon-192.png";
// A badge is drawn as a silhouette from the alpha channel: a full-colour image
// comes out as a solid blob, which is why this one is white-on-transparent.
const PUSH_BADGE = "/atendimento-badge-96.png";
const PUSH_FALLBACK_URL = "/atendimento";

function readPushPayload(event) {
  if (!event.data) return {};
  try {
    return event.data.json();
  } catch {
    // A provider test push (or a malformed payload) arrives as plain text.
    return { body: event.data.text() };
  }
}

self.addEventListener("push", (event) => {
  const payload = readPushPayload(event);
  const title = payload.title || PUSH_DEFAULT_TITLE;
  const url =
    typeof payload.url === "string" && payload.url.startsWith("/")
      ? payload.url
      : PUSH_FALLBACK_URL;

  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      icon: PUSH_ICON,
      badge: PUSH_BADGE,
      // Collapse repeated notifications from the same conversation into one
      // line instead of stacking a wall of them on the lock screen.
      tag: payload.tag || url,
      renotify: Boolean(payload.tag),
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || PUSH_FALLBACK_URL;

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of clientList) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        await client.focus();
        // `navigate` is unavailable on some engines; focusing is the part that
        // matters, so a failure here must not reject the whole handler.
        if ("navigate" in client) {
          try {
            await client.navigate(target);
          } catch {
            /* focused tab keeps its current route */
          }
        }
        return;
      }

      await self.clients.openWindow(target);
    })(),
  );
});
