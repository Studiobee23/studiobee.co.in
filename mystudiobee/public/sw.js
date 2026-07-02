// mystudiobee/public/sw.js
const CACHE = "msb-v1";
const SHELL = ["/", "/clock", "/login"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
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
  // Only cache GET requests; let API/POST requests pass through
  if (e.request.method !== "GET") return;
  // Don't cache Supabase or external API calls
  if (e.request.url.includes("supabase.co")) return;

  e.respondWith(
    caches.match(e.request).then((cached) => cached ?? fetch(e.request))
  );
});
