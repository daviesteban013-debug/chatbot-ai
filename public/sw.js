/* Cache only this explicit set of public files. Never cache auth, CRM or API data. */
const CACHE_PREFIX = "jarvis-public-";
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const PUBLIC_FILES = ["/offline.html", "/icons/jarvis-192.png", "/icons/jarvis-512.png", "/icons/jarvis-maskable-512.png"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(PUBLIC_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    // Network responses remain network-only, including session cookies and redirects.
    event.respondWith(fetch(request).catch(async () => {
      const cached = await caches.match("/offline.html", { cacheName: CACHE_NAME });
      return cached ?? new Response("Sin conexión. Vuelve a abrir Jarvis cuando tengas internet.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }));
  } else if (PUBLIC_FILES.includes(url.pathname) && !url.search) {
    event.respondWith(caches.match(url.pathname, { cacheName: CACHE_NAME }).then(cached => cached ?? fetch(request)));
  }
});
