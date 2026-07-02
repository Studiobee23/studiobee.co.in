// mystudiobee/public/sw.js
const CACHE = "msb-v1";

self.addEventListener("install", (e) => {
  // Only cache static assets at install time — no auth-sensitive HTML
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll([])).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  if (e.request.url.includes("supabase.co")) return;
  // Network-only for HTML navigation (auth-sensitive — never cache)
  if (e.request.mode === "navigate") return;
  // Cache-first only for immutable Next.js static assets
  if (!e.request.url.includes("/_next/static/")) return;
  e.respondWith(
    caches.match(e.request).then((cached) => cached ?? fetch(e.request))
  );
});
