/* Life XP - service worker.
 *
 * Update strategy:
 *   - App HTML and executable modules: one verified, immutable build bundle.
 *   - Static assets (icons, manifest): cache-first.
 *   - On install (v10.12.1+): precache, then skipWaiting() immediately. The old
 *     FH_ACTIVATE_SAFE handshake could never succeed across a version change and
 *     parked every update in "waiting" forever; the page - not the worker - owns
 *     the decision to reload, so taking control here is safe.
 *   - Every executable and app document is required before activation. Missing
 *     or mismatched code leaves the previous complete worker active.
 *   - On activate: preserve all prior caches, claim clients, broadcast the build.
 *   - Only non-executable static assets may refresh in the background.
 *   - FH_WHICH_BUILD: the page can ask the live worker which build it is, so an
 *     outdated page can detect itself rather than waiting for an edge-triggered
 *     controllerchange it may have missed.
 *
 * BUILD_ID is the cache namespace. Bumping it forces a fresh precache. It's
 * deliberately invisible to users — the only place a version-looking string
 * lives is in the cache name in DevTools.
 *
 * v10.49.0: stops the upload storm at its source. The v10.43 payload measurement wrote
 * lastPayloadBytes/lastPayloadAt into synced state AFTER the upload bytes were captured, so
 * every push reported 'local changed during upload' and replayed forever. Moved to
 * localStorage (per-device, like lastCloudReconcileAt). Also stops the replay valve falling
 * through to markCloudSynced, which was clearing the pending flag it had just set.
 * v10.50.0: adds 12 themes across bright, calm, bold and rich-dark ranges, a per-theme
 * emoji wallpaper layer with an intensity slider, optional drifting motion that pauses
 * off-screen and never touches state, and five clock styles.
 * v10.51.0: one effects bus with a real volume slider, softer tick and chime voices
 * (the tick was a 900Hz square wave), optional button-click sounds, and the loot drop
 * sound split off the drop-animation flag so it can be silenced on its own.
 * v10.52.0: FIXES v10.50.0. The wallpaper layer raised the app above itself with a
 * body>* rule, which rewrote position:fixed to position:relative on all twelve modals -
 * Settings would not open and Skills rendered as a void. The layers now sit at
 * z-index:-1 and nothing restyles body's children.
 * v10.53.0: settings rows relaid out. .form-row is `1fr auto`, so the volume row's
 * slider + readout + Test button crushed its label into a column of single words.
 * v10.54.0: the Theme button now opens a real Theme panel with a swatch grid for every
 * theme, background style and clock style - they were buried in Settings and the button
 * only cycled a hardcoded list that reached none of the newer themes. Backgrounds are
 * now Plain / Gradient / Pattern, with gradient the default.
 * v10.55.0: a real Theme panel (swatch grid, background style, clock style) behind the
 * Theme button, Plain/Gradient/Pattern backgrounds with gradient the default, and a new
 * synthesised sound set - wooden click, struck bell for session end, drum on start, coin
 * on loot - each with its own on/off under one volume.
 * v10.56.0: effects volume now has real headroom (limiter after the bus, ceiling well
 * above unity) because 100% was only reaching a third of full scale; drifting motion
 * works on gradient backgrounds again, not only on Pattern; and five neutral mid-tone
 * themes including a dimmer Aquarium Dusk.
 * v10.57.0: the drifting fish were at z-index:-1, behind every card - measured at zero
 * visible pixels. They now sit in front of the page furniture and behind modals. Adds
 * five pale low-saturation themes (12-25% vs Aquarium's 49%), Seaglass being Aquarium
 * with the colour taken out.
 * v10.58.0: scenes are their own axis. 16 of them (Space, Rain, Snowfall, Fireflies,
 * Embers, Forest, Desert and the rest), pickable with ANY theme instead of being welded
 * to one palette, and they drift on any background style including plain colour.
 * v10.59.0: the scene layer is anchored to the DOCUMENT instead of the viewport, so
 * drifters stay where they are on the page when you scroll instead of travelling with
 * the screen. Drifters are spread down the whole page rather than the first screen.
 * v10.60.0: a hard ceiling on cloud traffic - 40 transfers an hour, 250 a day, counting
 * downloads as well as uploads. Past the limit the app stops talking to the cloud, says
 * so in plain words, and keeps the work queued. Worst case is ~344 MB a month against
 * a 5 GB allowance; the old storm rate was ~1.9 GB a day.
 * v10.10.3: repairs partial iPhone stopwatch suspension, checkpoints running timers before freeze,
 * and stages service-worker activation without reloading active or legacy sessions.
 * v10.10.2: adds opt-in immersive landscapes and aura effects, automatic Hardcore day checks,
 * monotonic stopwatch timing, and durable multi-clock lifecycle fixes.
 * v10.10.1: serializes mobile startup with protected primary commits, treats normal peer-tab
 * conflicts as a safe pause, bounds routine Supabase egress, and converges Skill folders.
 * v10.10.0: moves the authoritative save to a verified IndexedDB head/previous chain,
 * preserves exact legacy bootstrap evidence, adds recovery-first repair, refreshed identity,
 * complete item/mount/clothing models, Stand Still, and bounded workout Recovery Pause.
 * v10.9.12: keeps large pre-deletion recovery copies out of localStorage, compacts Skills,
 * adds deterministic visible gear models and opt-in Hardcore mode, and preserves a complete offline bundle.
 * v10.9.11: hardens reset intent and snapshot relocation, restores cold snapshots to Recovery Center,
 * fixes Battle Report deletion cleanup, and seals the complete offline asset bundle.
 * v10.9.9: adds explicit, verified, no-upload cloud-profile adoption for first-time desktop sync.
 * v10.9.8: adds per-session Workout Mode and restores saved presentation settings before first paint.
 * v10.9.7: keeps exact replacement session-scoped, adds derived workout conditioning and a phone-safe Recovery Center exit.
 * v10.9.5: adds compatibility-safe diverse avatar styles, exact tone swatches, distinct hair/face/build geometry, and retains earlier complete offline caches.
 * v10.9.4: retires the legacy character renderer for a deterministic pixel hero, adds real distinct session-visual layouts, and retains earlier complete offline caches.
 * v10.9.3: exact-total and relative editing across every time surface,
 * session-backed reversals with pause/change detail, live-parity loot gates,
 * idempotent manual sessions, read-only integrity checks, selectable clean
 * session visuals, and conflict-safe cloud projection from session evidence.
 * Source review only; no live player data was opened or changed.
 * v10.9.2: atomic accounting rollback, deterministic policy-v3 reward and
 * mount receipts, storage-indeterminate lockout, and isolated durable/domain
 * ledger hardening. Source review only; deployment remains blocked.
 * v10.9.1: due-diligence safety hardening, fail-closed recovery, deletion
 * tombstones, noncombat target chests, and fail-closed character-renderer/Forge behavior.
 * v10.9.0: complete presentation shells, authored equipment/mount coverage,
 * deterministic loot-purpose actions, salvage tombstones, visible loadout
 * utility, and a rebuilt World command interface.
 * v10.8.0: shared Priority cancellation, milestone artifact gallery, explicit
 * resource routes, selected-zone optional combat, and safe relative eyelid rig.
 * v10.7.0: resilient offline queue/recovery ring, exact edited-session loot,
 * organized progression views, and integrity-hardened Expedition farming.
 * v10.6.2: Trophy Room artifact grid exposes list/listitem semantics.
 * v10.6.1: queued, top-safe achievement banners + unique named/slogan-bearing
 * milestone artifacts; all presentation-only with no player-data schema change.
 * v10.6.0: permanent 1,000-hour rings + Trophy Room; achievement banners now
 * sit below browser/app chrome and use unmistakably celebratory mythic colors.
 * v10.5.1: durable pending claims survive offline reload/update boundaries;
 * the battle card returns and manual reward corrections include eggs/targets.
 *
 * v10.4.7: recovery stays available from Settings, while the old oversized
 * runtime-injected bottom-nav link is retired. The recovery page remains
 * precached and the data guard remains active.
 *
 * v10.4.0: injects data-guard.js — IndexedDB snapshot ring + wipe alarm.
 * v10.3.4 fix: rewrap redirected responses for navigations (iOS strict).
 * v10.3.3 fix: re-fetching a navigate-mode Request with a RequestInit throws
 * in Chrome/Safari, which silently forced every launch onto the cache
 * fallback (and skipped injection). Fetch by URL string instead, and inject
 * into cache-served HTML too.
 */
const BUILD_ID    = "fh-2026-09-27-v10-64-0-clock-world-rank";
const BUNDLE_HASH = "259fe42ce0aead3ecdb00022b722cdec642676d31fb029d65fc6a16199f4bbf4";
const CACHE_NAME  = `focus-hero-${BUILD_ID}-${BUNDLE_HASH}`;
/* BEGIN MODULE INTEGRITY */
const MODULE_INTEGRITY = {
  "character-rebuild.js": "sha384-x7gU180N3kuOyC44K/Qp54wzDZTIt6o/xVGc36LWu/EjVl6hodUMaFZzggIffASK",
  "character-v86-fix.js": "sha384-//2lVFcbHu4KaDjc2+3ohQpWXmZPzw4heoIptCyhDOmrQML3JDUnqIdJvNxjJR/x",
  "data-guard.js": "sha384-gralA8fxCiPEkJzyjElVA+coPMvEhmFsQye4ijOKkNVpt+B/DJ06QLj4/5VbrpBS",
  "eggs.js": "sha384-WRy85tY5jB73PSsli1gyF/D9Q8WQGRwCScLSHi8k1sHun0n6GJNHY4enlohQM0Ou",
  "fh-cosmetic-clothing-v13.js": "sha384-VAApH+AEmm/ZS8QXHyor+UyVxxFj6CKNYqGMqTyPTk7PdH/OS0nZ+lI3WHshMYVS",
  "fh-gameplay-controls-v13.js": "sha384-ik+yeDUaEF9qIHmYfpmUs8VInl0Tm6Je9g7doAXTdSRWoAi5AOxE4ZaKW8cnZqMl",
  "fh-hardcore-v12.js": "sha384-brzSDNShiruh3LE/jDtOiazaK+VGLzKUrDZLbmQNFk+768LzRejRb4a3opXmHYN6",
  "fh-identity-v13.js": "sha384-MAYX6ulFH+mHWhf8ukbtrUQeUw3k0ZXH/z46YwvhvU+7XQT37C6kj7QP1f/HCxng",
  "fh-models-v12.js": "sha384-ogQnT7y+qfJIRv9DEnTuwxUdSBhualSAJmP5XzighgKjeFhBX/I8Ot1Bq01CPeWm",
  "fh-navigator-v1.js": "sha384-REu9WwBw4h1sZhOauBBL/ZZ73QlELwiTYp0l4f715d1+tpQukrfLere+SqS1Vedy",
  "fh-primary-store-v13.js": "sha384-6Izjzvv3OzLlF7j6gaKXEAae6ex5cVmejWMxkMDReJssmkYp2y3Yk7LWYPSHchTo",
  "fh-rank-v1.js": "sha384-kxq1jL5hD+Jnd8w5J2mstb4KFf2udyyelvtmqDQeQZ1QdZoqjc2GivcUzz8e7CGP",
  "fh-storage-relief.js": "sha384-2I6W3SyY4YJeu2zZGO5LpNzdcUOFPVOgy5PS/hcO790y+qhIaQ1A2QD0u8XwHbvw",
  "fh-sync-doctor-v1.js": "sha384-CUul7H+zW3FVlqcOr5Maqe5M7JYoCmfwE/U5TodvZwTkt92Azef4w+/CmnlzvQ1t",
  "fh-theater-v1.js": "sha384-sINesCJ+dsaF14OkysPDv+Faume1YDsAlvCrliO6jZK5r1hMw5wiXLC8Ioi5i3BI",
  "focus-economy.js": "sha384-+AWFFShJcYxp6FNMSyRIV7y9UxCfZHLaTvEsqdRyQD11ZNl7xk8jT3PYpTGblh99",
  "focus-hero-immersive-v1.js": "sha384-lNLnx/16nDrzfoY2PPlSiYQF1GkyZPCQmb66AQ/YvlRiEgHWrOcSecrriqiI3z9F",
  "focus-hero-ui-v11.js": "sha384-6UL9zvj89GRdJLi/aNLl0hbKynoEKvvioGz2ywHPYiPQ0zGBZfTOOD+AID3jpcnM",
  "game-shells.js": "sha384-WLEnqLSNJBxaiQtIl51AlWszBf9v6UTxroagZtdExs2v2EEu3lgLH+K/exT/Ynrg",
  "gear-utility.js": "sha384-5wr5Japtyg1xcF4ZoUlvXC+DCBYBEQAFJYtc3k4L86MoVPSm/JCC7C/OFaX1EHib",
  "loot-purpose-actions.js": "sha384-RwF7kfAdNgvSfHQOgI/g9j7/TJeRH3iUQigqcomhxLom/d2ef7gBxcWSre1bRFrp",
  "loot-rework-v1012.js": "sha384-RsvFS5JqwHskwbh2fztT0rw4pCnKor2Q4z4ImmmEGQB04jJED/pHoZI5T/GNcMNI",
  "pixel-avatar.js": "sha384-k288VLKM/NJvs69WPwp7Ft+mYXcD7bvKjz5AyoyMb4ZCBDIMTgpO7XLMdgr5dACE",
  "progression-hub.js": "sha384-GnCSkKkChKfdIdG/2WTUkdprDzRa4rODZU4XPNeeXylDOvQFEGNfar81FhMj1wQv",
  "shop-rework.js": "sha384-3dGBjMbaVb4tjjmW8RoLRQs5ZTaqKPmqcrNxvJGNHh/xL9UO2l7aI1AjthQtcLFP",
  "v8.6.3-patch.js": "sha384-Ehhf4nNmiq4PI+/bYSy2ypkHjcFKaZKdcQ6RqMKiCL4ENRmfmQyfyqQWvyV9ys4W",
  "world-depth.js": "sha384-zIvKsTf22SP4/M2w7hdCxJmNsX1i7XkHmmNfSniEqB+UxNqMWHtPbsESl4e2M1DB"
};
/* END MODULE INTEGRITY */
const PRECACHE = [
  "./",
  "./focus-hero.html",
  "./recover.html",
  "./fh-primary-store-v13.js",
  "./data-guard.js",
  "./focus-economy.js",
  "./loot-purpose-actions.js",
  "./gear-utility.js",
  "./progression-hub.js",
  "./game-shells.js",
  "./focus-hero-logo.svg",
  "./starmax-logo.svg",
  "./lifexp-logo.svg",
  "./lifexp-icon.svg",
  "./fh-gameplay-controls-v13.js",
  "./fh-cosmetic-clothing-v13.js",
  "./fh-identity-v13.js",
  "./loot-rework-v1012.js",
  "./character-rebuild.js",
  "./world-depth.js",
  "./fh-models-v12.js",
  "./shop-rework.js",
  "./character-v86-fix.js",
  "./eggs.js",
  "./v8.6.3-patch.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-192-v13.png",
  "./icon-512-v13.png",
  "./icon-192-lm.png",
  "./icon-512-lm.png",
  "./icon-192-lifexp.png",
  "./icon-512-lifexp.png",
  "./pixel-avatar.js",
  "./fh-storage-relief.js",
  "./focus-hero-ui-v11.js",
  "./focus-hero-immersive-v1.js",
  "./fh-hardcore-v12.js",
  "./fh-rank-v1.js",
  "./fh-navigator-v1.js",
  "./fh-theater-v1.js",
  "./fh-sync-doctor-v1.js"
];

/* Required code must arrive together. Cosmetic assets remain best-effort. */
const PRECACHE_CRITICAL = new Set(PRECACHE.filter(asset=>asset==="./" || asset.endsWith(".html") || asset.endsWith(".js")));
let precacheSkipped = [];
async function verifiedModuleBody(name,body){
  const expected=MODULE_INTEGRITY[name.replace(/^\.\//,"")];
  if(!expected)return;
  const bytes=new Uint8Array(await crypto.subtle.digest("SHA-384",body));
  const actual="sha384-"+btoa(String.fromCharCode(...bytes));
  if(actual!==expected)throw new Error("App module belongs to another release: "+name);
}

function isAppDocPath(pathname){
  return pathname === "/" || pathname === "/index.html" || pathname === "/focus-hero.html"
      || pathname === "/index" || pathname === "/focus-hero";
}

/* v10.3.4: iOS Safari rejects redirected responses served to navigations
   ("response served by service worker has redirections") — Cloudflare
   pretty-URLs redirect /recover.html -> /recover. Rewrap the final response
   so the redirected flag is cleared. */
async function unredirect(resp){
  try {
    if (!resp || !resp.redirected) return resp;
    const body = await resp.clone().blob();
    const headers = new Headers(resp.headers);
    headers.delete("content-length");
    return new Response(body, { status: resp.status, statusText: resp.statusText, headers });
  } catch(_) { return resp; }
}

const GUARD_TAG = '<script src="./data-guard.js" defer><\/script>';
async function withDataGuard(resp){
  try {
    const ct = (resp.headers.get("content-type") || "");
    if (!ct.includes("text/html")) return resp;
    const text = await resp.clone().text();
    let out = text;
    /* v10.4.0: inject the data-guard layer (rolling snapshots + wipe alarm). */
    if (!out.includes("data-guard.js") && out.includes("</body>")){
      out = out.replace("</body>", GUARD_TAG.replace("<\\/script>", "</scr" + "ipt>") + "</body>");
    }
    if (out === text) return resp;
    const headers = new Headers(resp.headers);
    headers.delete("content-length");
    return new Response(out, { status: resp.status, statusText: resp.statusText, headers });
  } catch (_) {
    return resp; // any failure: serve the untouched original
  }
}
/* -------------------------------------------------------------------------- */

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      const settled = await Promise.allSettled(PRECACHE.map(async asset => {
        const requestUrl = new URL(asset, self.registration.scope).href;
        const response = await fetch(requestUrl, { cache:"no-store", credentials:"same-origin" });
        if (!response || !response.ok) throw new Error(`Precache failed for ${asset}: ${response && response.status}`);
        const contentType = (response.headers.get("content-type") || "").toLowerCase();
        const expectsHtml = asset === "./" || /\.html$/i.test(asset);
        if (expectsHtml && !contentType.includes("text/html")) throw new Error(`Precache received non-HTML for ${asset}`);
        if (!expectsHtml && contentType.includes("text/html")) throw new Error(`Precache received HTML fallback for ${asset}`);
        /* Fully read each response here. Holding several unread bodies while
           waiting for every fetch can exhaust the browser's per-origin
           connection pool and deadlock installation on mobile/Chromium. */
        const body = await response.arrayBuffer();
        await verifiedModuleBody(asset,body);
        if(asset==="./" || asset==="./focus-hero.html"){
          const page=new TextDecoder().decode(body);
          const identified=/data-build-id="([^"]+)"/.exec(page);
          if(!identified || identified[1]!==BUILD_ID)throw new Error("App page belongs to another release");
        }
        const headers = new Headers(response.headers);
        headers.delete("content-length");
        return [requestUrl, new Response(body, {
          status:response.status, statusText:response.statusText, headers
        })];
      }));
      const fetched = [];
      const skipped = [];
      settled.forEach((r, i) => {
        if (r.status === "fulfilled") { fetched.push(r.value); return; }
        const asset = PRECACHE[i];
        if (PRECACHE_CRITICAL.has(asset)) {
          throw new Error(`Precache failed for required asset ${asset}: ${r.reason && r.reason.message}`);
        }
        skipped.push(asset);
      });
      precacheSkipped = skipped;
      if (skipped.length) {
        console.warn("[fh-sw] install continuing without", skipped.join(", "));
      }
      await Promise.all(fetched.map(([request, response]) => cache.put(request, response)));
      /* v10.12.1: take over as soon as the new cache is complete.
         The previous release waited for an explicit FH_ACTIVATE_SAFE
         handshake from the page instead. That handshake could never
         succeed: the page can only send its OWN build id, the waiting
         worker only accepted its own, and across an update those two
         are different by definition. Every update therefore installed,
         parked in "waiting" forever, and never took control - which is
         exactly what stranded v10.12.0 on every device.

         Activating here is safe because the page, not the worker, owns
         the decision to reload. On controllerchange a page with a live
         session shows "Update ready - refresh after your session" and
         stays put; only an idle page reloads itself. The original
         concern was the v10.10.2 page, which misread a running
         stopwatch as idle - that build is long superseded, and leaving
         updates permanently undeliverable is the larger hazard. */
      await self.skipWaiting();
    } catch (error) {
      // Keep any prior complete cache intact. A failed new install never clears recovery/offline assets.
      throw error;
    }
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    // Preserve all existing cache namespaces. This update never deletes them.
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
    // App pages stay with their bundle; standalone pages use the network.
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const injectHere = isAppDocPath(url.pathname);
      // App HTML and executable modules belong to this verified bundle. A new
      // worker installs the next bundle; a network page must not mix them.
      if(injectHere){
        const bundled=await cache.match("./focus-hero.html") || await cache.match("./");
        if(bundled)return withDataGuard(await unredirect(bundled));
      }
      try {
        /* v10.3.3: fetch by URL string — see header comment. */
        let fresh = await fetch(req.url, { cache: "no-store", credentials: "same-origin" });
        if (fresh && fresh.ok) {
          if(injectHere){
            const page=await fresh.clone().text();
            if(/data-build-id="([^"]+)"/.exec(page)?.[1]!==BUILD_ID)
              throw new Error("App page belongs to another release");
          }
          fresh = await unredirect(fresh);
          if (injectHere) fresh = await withDataGuard(fresh);
          // Mirror under both keys so the next offline launch works regardless
          // of whether the request was for "/" or "/focus-hero.html".
          if (injectHere) {
            try { await cache.put("./focus-hero.html", fresh.clone()); } catch (_) {}
            try { await cache.put("./", fresh.clone()); } catch (_) {}
          } else {
            try { await cache.put(req, fresh.clone()); } catch (_) {}
          }
          return fresh;
        }
        const cached = await cache.match(req, { ignoreSearch:true })
          || (injectHere && (await cache.match("./focus-hero.html") || await cache.match("./")))
          || null;
        if (cached && injectHere) return withDataGuard(await unredirect(cached));
        if (cached) return unredirect(cached);
        return fresh;
      } catch (_) {
        // Offline. Fall back to whichever cached HTML we have.
        const cached = await cache.match(req, { ignoreSearch:true })
          || (injectHere && (await cache.match("./focus-hero.html") || await cache.match("./")))
          || null;
        if (cached && injectHere) return withDataGuard(await unredirect(cached)); // guard cache-served HTML too
        if (cached) return unredirect(cached);
        return new Response("Offline", { status: 503 });
      }
    })());
    return;
  }

  // Cache-first for static assets (icons, manifest, etc.).
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    /* ignoreSearch: versioned URLs (pixel renderer.js?v=...) must still hit the
       precached asset when offline, preserving a complete offline shell. */
    const cached = await cache.match(req, { ignoreSearch:true });
    if (cached) {
      if(url.pathname.endsWith(".js"))return cached;
      // Icons and other non-executable assets may refresh independently.
      event.waitUntil((async () => {
        try {
          const fresh = await fetch(req.url, { cache:"no-store", credentials:"same-origin" });
          if (fresh && fresh.ok && fresh.type === "basic") {
            const ct = (fresh.headers.get("content-type") || "").toLowerCase();
            /* Never overwrite a real asset with Cloudflare's SPA HTML fallback. */
            if (!ct.includes("text/html")) await cache.put(req, fresh.clone());
          }
        } catch (_) {}
      })());
      return cached;
    }
    try {
      const resp = await fetch(req);
      if(resp && resp.ok && url.pathname.endsWith(".js"))await verifiedModuleBody(url.pathname.split("/").pop(),await resp.clone().arrayBuffer());
      if (resp && resp.ok && resp.type === "basic") await cache.put(req, resp.clone());
      return resp;
    } catch (e) {
      return new Response("", { status: 504 });
    }
  })());
});

self.addEventListener("message", event => {
  /* v10.16.0: level-triggered version check. controllerchange/SW_UPDATED are
     edge-triggered - a page that was uncontrolled at the moment the new worker
     activated never hears about it and has no way to know it is outdated. This
     lets the page ask, at any time, which build is actually live. */
  if (event.data && event.data.type === "FH_WHICH_BUILD") {
    const reply = { type: "FH_BUILD_ID", buildId: BUILD_ID, precacheSkipped: precacheSkipped.slice() };
    try {
      if (event.ports && event.ports[0]) { event.ports[0].postMessage(reply); return; }
    } catch (_) {}
    try { event.source && event.source.postMessage(reply); } catch (_) {}
    return;
  }

  /* Only fixed page code sends this build-bound structured request after its
     active-session guard passes. Never honor the legacy bare string: an older
     page can send it while a stopwatch is running. */
  /* Accept the structured request from any page build, not just a page
     whose build id equals this worker's - that equality is what deadlocked
     updates. The legacy bare-string message is still ignored, so only page
     code that has already cleared its own active-session guard can ask. */
  if (event.data && event.data.type === "FH_ACTIVATE_SAFE" && typeof event.data.buildId === "string" && event.data.buildId) {
    event.waitUntil((async()=>{
      /* A second window may still be running the old v10.10.2 stopwatch guard,
         which cannot identify its own active stopwatch. Unknown/extra clients
         therefore make activation wait. Once only the fixed requesting window
         remains, taking control cannot reload a hidden legacy session. */
      const windows = await self.clients.matchAll({ type:"window", includeUncontrolled:true });
      if (windows.length !== 1) return;
      await self.skipWaiting();
    })());
  }
  if (event.data && event.data.type === "SHOW_NOTIFICATION") {
    const { title, body } = event.data;
    self.registration.showNotification(title || "Life XP", {
      body: body || "",
      icon: "./icon-192-lifexp.png",
      badge: "./icon-192-lifexp.png",
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

/* asset content-type refresh — v10.32.0 */
