/* Focus Hero - service worker.
 *
 * Update strategy:
 *   - HTML: NETWORK-FIRST (always try the network; fall back to cache only when
 *     offline). This means every launch picks up the latest deployed HTML — no
 *     more stale cached HTML serving an older version of the app to the user
 *     after a deploy.
 *   - Static assets (icons, manifest): cache-first.
 *   - On install: skipWaiting() so the new SW takes over without ceremony.
 *   - On activate: clients.claim() + broadcast "SW_UPDATED" to existing tabs;
 *     the page decides whether to reload now (no active session) or later.
 *
 * BUILD_ID is the cache namespace. Bumping it forces a fresh precache. It's
 * deliberately invisible to users — the only place a version-looking string
 * lives is in the cache name in DevTools.
 *
 * v10.3.2-recovery: adds ./recover.html (standalone data-recovery page) and
 * injects a "🚑 Recover" item into the app's bottom nav at serve time. The
 * injection is wrapped in try/catch and falls back to the ORIGINAL response
 * if the nav markup isn't found — it can never break the app. No app code
 * or user data is touched by this worker.
 */
const BUILD_ID    = "fh-2026-07-10-v10-3-2-recovery";
const CACHE_NAME  = `focus-hero-${BUILD_ID}`;
const PRECACHE = [
  "./",
  "./focus-hero.html",
  "./recover.html",
  "./focus-hero-logo.svg",
  "./loot-rework.js",
  "./character-rebuild.js",
  "./world-depth.js",
  "./shop-rework.js",
  "./character-v86-fix.js",
  "./eggs.js",
  "./v8.6.3-patch.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./three.min.js",
  "./fh3d.js"
];

/* ---- v10.3.2 recovery-link injection ------------------------------------ */
const RECOVER_LINK = '<a href="./recover.html" data-nav-recover style="display:flex;flex-direction:column;align-items:center;gap:2px;text-decoration:none;color:inherit;font-size:inherit"><span>\u{1F691}</span><b>Recover</b></a>';
const NAV_BTN_RE = /(<button[^>]*data-nav-action="all-tasks"[\s\S]{0,200}?<\/button>)/;

function isAppDocPath(pathname){
  return pathname === "/" || pathname === "/index.html" || pathname === "/focus-hero.html";
}

async function withRecoverLink(resp){
  try {
    const ct = (resp.headers.get("content-type") || "");
    if (!ct.includes("text/html")) return resp;
    const text = await resp.clone().text();
    if (text.includes("data-nav-recover")) return resp;           // already present
    if (!NAV_BTN_RE.test(text)) return resp;                       // markup changed — do nothing
    const injected = text.replace(NAV_BTN_RE, "$1" + RECOVER_LINK);
    const headers = new Headers(resp.headers);
    headers.delete("content-length");
    return new Response(injected, { status: resp.status, statusText: resp.statusText, headers });
  } catch (_) {
    return resp; // any failure: serve the untouched original
  }
}
/* -------------------------------------------------------------------------- */

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
    // Tell existing pages a new version is live; they decide whether to reload.
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      try { c.postMessage({ type: "SW_UPDATED", buildId: BUILD_ID }); } catch (_) {}
    }
  })());
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Never intercept cloud sync traffic.
  if (/supabase\.co$/i.test(url.hostname) || /api\.jsonstorage\.net$/i.test(url.hostname)) return;

  // Only handle same-origin requests.
  if (url.origin !== self.location.origin) return;

  const isHTML = req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html");

  if (isHTML) {
    // NETWORK-FIRST for HTML. Always try fresh first; only fall back to cache
    // when the network is unreachable. This is the fix for "app won't open
    // after an update" — there is no scenario where a stale cached HTML wins.
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const injectHere = isAppDocPath(url.pathname);
      try {
        let fresh = await fetch(req, { cache: "no-store" });
        if (fresh && fresh.ok) {
          if (injectHere) fresh = await withRecoverLink(fresh);
          // Mirror under both keys so the next offline launch works regardless
          // of whether the request was for "/" or "/focus-hero.html".
          if (injectHere) {
            try { cache.put("./focus-hero.html", fresh.clone()); } catch (_) {}
            try { cache.put("./", fresh.clone()); } catch (_) {}
          } else {
            try { cache.put(req, fresh.clone()); } catch (_) {}
          }
          return fresh;
        }
        return fresh; // non-ok response — still return it
      } catch (_) {
        // Offline. Fall back to whichever cached HTML we have.
        const cached = await cache.match(req, { ignoreSearch:true })
          || (injectHere && (await cache.match("./focus-hero.html") || await cache.match("./")))
          || null;
        return cached || new Response("Offline", { status: 503 });
      }
    })());
    return;
  }

  // Cache-first for static assets (icons, manifest, etc.).
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    /* ignoreSearch: versioned URLs (fh3d.js?v=...) must still hit the
       precached asset when offline - without this, 3D was network-only. */
    const cached = await cache.match(req, { ignoreSearch:true });
    if (cached) return cached;
    try {
      const resp = await fetch(req);
      if (resp && resp.ok && resp.type === "basic") cache.put(req, resp.clone());
      return resp;
    } catch (e) {
      return new Response("", { status: 504 });
    }
  })());
});

self.addEventListener("message", event => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
  if (event.data && event.data.type === "SHOW_NOTIFICATION") {
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
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if ("focus" in c) { return c.focus(); }
    }
    if (self.clients.openWindow) {
      return self.clients.openWindow("./focus-hero.html");
    }
  })());
});
