// Service worker for "Я шагаю. Казань" PWA.
// App shell cached for offline; Supabase data is cached opportunistically (offline pack).
const CACHE = "yashagayu-v2";
const SHELL = [
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = e.request.url;
  // Supabase REST reads: network-first, fall back to cache (offline pack).
  if (url.includes("/rest/v1/")) {
    e.respondWith(
      fetch(e.request).then((r) => {
        const copy = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return r;
      }).catch(() => caches.match(e.request))
    );
    return;
  }
  // Never cache the AI function or auth.
  if (url.includes("/functions/v1/") || url.includes("/auth/")) return;
  // App shell + fonts + map lib: cache-first.
  e.respondWith(caches.match(e.request).then((c) => c || fetch(e.request)));
});
