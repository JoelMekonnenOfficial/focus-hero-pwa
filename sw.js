/* Focus Hero v7 - service worker
 * versioned cache + stale-while-revalidate for HTML, skipWaiting + clients.claim.
 * v7 bump: fh-v7-1 - ships real 8-bit pixel art, equippable gear, and expanded analytics.
 */
const CACHE_VERSION = "fh-v7-1";
const CACHE_NAME = `focus-hero-${CACHE_VERSION}`;
const PRECACHE = [
  "./",
  "./focus-hero.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.all(PRECACHE.map(u => cache.add(u).catch(err => console.warn("precache miss", u, err))))
    )
  );
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Never intercept cloud sync traffic.
  if (/supabase\.co$/i.test(url.hostname) || /api\.jsonstorage\.net$/i.test(url.hostname)) return;

  // Only handle same-origin requests for cache.
  if (url.origin !== self.location.origin) return;

  const isHTML = req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html");

  if (isHTML){
    // stale-while-revalidate for HTML: return cache fast, update in background.
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match("./focus-hero.html") || await cache.match("./");
      const networkPromise = fetch(req).then(resp => {
        if (resp && resp.ok){ cache.put("./focus-hero.html", resp.clone()); }
        return resp;
      }).catch(()=>null);
      return cached || (await networkPromise) || new Response("Offline", {status:503});
    })());
    return;
  }

  // cache-first for other same-origin assets
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    if (cached) return cached;
    try {
      const resp = await fetch(req);
      if (resp && resp.ok && resp.type === "basic") cache.put(req, resp.clone());
      return resp;
    } catch(e){
      return new Response("", {status:504});
    }
  })());
});

self.addEventListener("message", event => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
  if (event.data && event.data.type === "SHOW_NOTIFICATION"){
    const { title, body } = event.data;
    self.registration.showNotification(title || "Focus Hero", {
      body: body || "",
      icon: "./icon-192.png",
      badge: "./icon-192.png",
      tag: "focus-hero-session",
      silent: false,
      data: { url: self.location.origin + "/focus-hero.html" }
    });
  }
});

// Bring the installed PWA to front when the notification is clicked.
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type:"window", includeUncontrolled:true });
    for (const c of all){
      if ("focus" in c){ return c.focus(); }
    }
    if (self.clients.openWindow){
      return self.clients.openWindow("./focus-hero.html");
    }
  })());
});
