/* Network first for pages; no personal data or Firebase responses are cached. */
const OFFLINE_CACHE = "todo-app-offline-v1";
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(OFFLINE_CACHE)
    .then((cache) => cache.add("./offline.html"))
    .then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith("todo-app-offline-") && key !== OFFLINE_CACHE)
        .map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(
    () => caches.match("./offline.html")
  ));
});
