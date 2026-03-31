/* Offline shell: populate cache from network, serve cached same-origin GETs when offline */
const CACHE = "worktools-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.add("/").catch(() => cache.add("/index.html").catch(() => undefined)),
    ),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(
        () =>
          caches.match(request).then((hit) => {
            if (hit) return hit;
            if (request.mode === "navigate") {
              return caches.match("/index.html").then((fallback) => fallback ?? Response.error());
            }
            return Response.error();
          }),
      ),
  );
});
