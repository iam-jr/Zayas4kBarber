const CACHE = "z4k-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./css/style.css",
  "./app.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

// Install: precache
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: limpiar caches viejas
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE)
            .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: cache-first con fallback a network
self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request)
        .then(networkRes => {
          // Solo cachear GET
          if (event.request.method === "GET") {
            caches.open(CACHE).then(cache => {
              cache.put(event.request, networkRes.clone());
            }).catch(()=>{});
          }
          return networkRes;
        })
        .catch(err => {
          // Fallback solo para navegadores / HTML
          if (event.request.headers.get("accept")?.includes("text/html")) {
            return caches.match("./index.html");
          }
        });
    })
  );
});
