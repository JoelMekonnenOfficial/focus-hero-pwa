/* Focus Hero v5.5 — service worker (real)
 *
 * Network-first for HTML so updates land immediately when online.
 * skipWaiting + clients.claim so a new SW takes over without a full app close.
 *
 * v5.5 bump: fh-v5-7 — code-review pass on top of v5.4.1.
 * CRITICAL FIX: the v5.4.1 sw-v5.js shipped truncated mid-statement in the
 * periodicsync handler (parse error → SW never registered → live site had no
 * offline cache, no update toast, no alive-ping). This file restores the
 * complete handler body and is byte-checked at deploy time (node -c sw-v5.js).
 * Other v5.5 changes are inside focus-hero.html (controllerchange reload,
 * interval cleanup on pagehide, PBKDF2 iter-from-blob on decrypt, +touch
 * targets, +viewport-clamped popovers).
 *
 * This file lives at ./sw-v5.js. The legacy ./sw.js URL hosts a one-shot
 * kill-switch that uninstalls the old worker on stuck devices. Newly-loaded
 * pages register THIS file directly.
 */
const CACHE_VERSION = "fh-v7-5";
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
  // Always go to the network for SW files themselves so a new SW is noticed promptly.
  const isSW = /\/sw(-v\d+)?\.js(\?|$)/.test(url.pathname);

  if (isHTML || isSW){
    // network-first for HTML and the SW: always try fresh, fall back to cache when offline.
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        // Bypass HTTP cache so the browser revalidates with the origin/CDN.
        const resp = await fetch(req, { cache: "no-store" });
        if (resp && resp.ok && isHTML){
          // Mirror the latest HTML into cache for offline.
          cache.put("./focus-hero.html", resp.clone());
        }
        return resp;
      } catch (e){
        if (!isHTML) throw e;
        const cached = await cache.match("./focus-hero.html") || await cache.match("./") || await cache.match(req);
        return cached || new Response("Offline", { status: 503 });
      }
    })());
    return;
  }

  // cache-first for other same-origin assets (icons, manifest, etc.)
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

/* ================================================================
 * v5: Periodic Background Sync — fires roughly every ~5 min when the
 * PWA is INSTALLED but the tab is closed. Updates a "last seen alive"
 * cache marker and broadcasts ALIVE_PING to any open clients so the
 * in-app state mirror can refresh.
 *
 * Note: Periodic Sync is a Chromium-only API and only fires when the
 * site has the periodic-background-sync permission AND the user has
 * installed the PWA. On platforms where it's not supported, this is
 * a silent no-op (the page will still register on every load — the
 * registration just resolves to nothing).
 *
 * Intentionally minimal: we only broadcast a timestamp. We don't
 * touch the user's data — adventure progress / focus minutes are
 * always written from the live tab.
 * ================================================================ */
self.addEventListener("periodicsync", event => {
  if (event.tag !== "fh-alive") return;
  event.waitUntil((async () => {
    const at = Date.now();
    try {
      const cache = await caches.open(CACHE_NAME);
      // Persist a tiny marker into the cache for diagnostics.
      await cache.put("./__last_alive", new Response(JSON.stringify({ at }), { headers: { "content-type":"application/json" }}));
    } catch(_){}
    // Broadcast to any open clients so the in-memory state.lastSeenAliveAt updates.
    try {
      const all = await self.clients.matchAll({ type:"window", includeUncontrolled:true });
      for (const c of all){ try { c.postMessage({ type:"ALIVE_PING", at }); } catch(_){} }
    } catch(_){}
  })());
});
