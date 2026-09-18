/* forceupdate.mjs — a page that cannot update itself must be able to be fixed.
 *
 * RULE 4: every number here is synthetic. None of it is Joel's data.
 *
 * An installed iOS PWA does not reliably re-navigate when it is closed and
 * reopened; the system restores the suspended web view. So the page keeps
 * running the build it was showing when it was put away, while the newer
 * worker sits underneath it — and the app told its owner to close and reopen
 * the app, which is the one thing that could not work. He did it four times.
 *
 * What has to hold: there is a path that clears the two things which can pin a
 * stale build, it reloads at a URL no cache can answer, and it does not touch
 * a single byte of the profile.
 */
import { launch, openApp, makeReporter } from './harness.mjs';

const PORT = process.argv[2] || 8998;
const R = makeReporter('forceupdate.mjs');
const browser = await launch();
try {
  const { ctx, page, problems } = await openApp(browser, PORT, { settleMs: 5000 });

  R.eq('the force-update path exists',
    await page.evaluate(() => typeof window.fhForceUpdateNow), 'function');
  R.eq('and the cache-busting reload exists',
    await page.evaluate(() => typeof window.fhHardReloadFresh), 'function');

  /* The URL it navigates to must be one no cache can answer. location.replace
     cannot be redefined in Chromium, so this lets the navigation actually
     happen and reads where it landed — which is the stronger check anyway. */
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.evaluate(() => window.fhHardReloadFresh())
  ]);
  const landed = page.url();
  R.check('it reloads at a URL carrying a cache-busting marker',
    /[?&]fresh=\d{10,}/.test(landed), landed);
  R.check('and stays on the app path', /focus|index|:\d+\/?(\?|$)/.test(landed), landed);

  await page.waitForTimeout(4000);
  /* The marker must not survive into the address bar once the build is live —
     otherwise it becomes what the browser remembers as the app's URL. */
  const afterBoot = await page.evaluate(() => location.search);
  R.check('and the marker is stripped once the app has booted',
    !/fresh=/.test(afterBoot), afterBoot || '(empty)');

  /* THE POINT: it must clear the stale layer and NOTHING else. */
  const cleared = await page.evaluate(async () => {
    const before = {
      localStorageKeys: localStorage.length,
      totalFocusMin: window.state.totalFocusMin,
      sessions: (window.state.sessionsLog || []).length,
      syncEnabled: !!window.state.sync.enabled
    };
    /* Stand in caches and registrations we can observe. */
    const deleted = [], unregistered = [];
    /* window.caches is a getter-only global; a plain assignment is silently
       dropped and the stub never takes, which makes the test pass vacuously. */
    const realCaches = window.caches;
    Object.defineProperty(window, 'caches', { configurable:true, value: {
      keys: async () => ['focus-hero-old-build', 'focus-hero-older-build', 'some-other-app-cache'],
      delete: async (k) => { deleted.push(k); return true; }
    }});
    const realSW = navigator.serviceWorker;
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistrations: async () => [
        { unregister: async () => { unregistered.push('a'); return true; } },
        { unregister: async () => { unregistered.push('b'); return true; } }
      ] }
    });
    /* fhHardReloadFresh is a top-level function declaration, so it IS a
       window property and reassigning it rebinds the identifier the caller
       resolves. That lets the clear run for real without navigating away. */
    let navigated = false;
    const realReload = window.fhHardReloadFresh;
    window.fhHardReloadFresh = () => { navigated = true; };

    await window.fhForceUpdateNow();

    window.fhHardReloadFresh = realReload;
    try { Object.defineProperty(navigator, 'serviceWorker', { configurable:true, value: realSW }); } catch(_){}
    Object.defineProperty(window, 'caches', { configurable:true, value: realCaches });

    return { before, deleted, unregistered, navigated, after: {
      localStorageKeys: localStorage.length,
      totalFocusMin: window.state.totalFocusMin,
      sessions: (window.state.sessionsLog || []).length,
      syncEnabled: !!window.state.sync.enabled
    }};
  });

  R.eq('every service worker registration is removed', cleared.unregistered.length, 2);
  R.eq('every Life XP cache is deleted', cleared.deleted.length, 2);
  R.check('and only Life XP caches — someone else’s stay put',
    !cleared.deleted.includes('some-other-app-cache'), cleared.deleted.join(','));
  R.check('then it reloads fresh', cleared.navigated === true, String(cleared.navigated));

  R.eq('the profile’s minutes are untouched',
    cleared.after.totalFocusMin, cleared.before.totalFocusMin);
  R.eq('its sessions are untouched', cleared.after.sessions, cleared.before.sessions);
  R.eq('the sync connection is untouched', cleared.after.syncEnabled, cleared.before.syncEnabled);
  R.check('and localStorage is not wiped', cleared.after.localStorageKeys >= cleared.before.localStorageKeys - 1,
    `${cleared.before.localStorageKeys} -> ${cleared.after.localStorageKeys}`);

  /* The standalone escape page has to be reachable and must not be precached. */
  const reset = await page.evaluate(async () => {
    const r = await fetch('/reset-sw.html', { cache:'no-store' });
    const t = await r.text();
    return { status: r.status, hasUnregister: /unregister\(\)/.test(t),
             hasCacheDelete: /caches\.delete/.test(t),
             onlyOurCaches: /\^focus-hero-/.test(t),
             redirects: /location\.replace/.test(t),
             touchesIdb: /indexedDB|localStorage\.clear/.test(t) };
  });
  R.eq('the standalone rescue page is served', reset.status, 200);
  R.check('it unregisters the worker', reset.hasUnregister);
  R.check('it clears the caches', reset.hasCacheDelete);
  R.check('only Life XP ones', reset.onlyOurCaches);
  R.check('and sends you back into the app', reset.redirects);
  R.check('it never touches the stored profile', !reset.touchesIdb, String(reset.touchesIdb));

  const precached = await page.evaluate(async () => {
    const t = await (await fetch('/sw.js', { cache:'no-store' })).text();
    const block = t.split('const PRECACHE = [')[1].split('];')[0];
    return /reset-sw\.html/.test(block);
  });
  R.check('and it is deliberately NOT precached, so it is always fetched fresh',
    precached === false, 'in PRECACHE: ' + precached);


  /* ---- THE ONE THAT ACTUALLY HAD THE PHONE ---------------------------------
     manifest.start_url pointed at ./focus-hero.html — a hand-made copy of
     index.html that was never kept in step. Every iOS home-screen install
     launched that file, so it launched whatever build the copy was frozen at:
     10.62.5, still, two days and four releases later. Reinstalling could not
     fix it, clearing caches could not fix it, force-quitting could not fix it,
     because the server genuinely was serving those bytes at that path. The
     phone was innocent every time it was blamed. */
  const mirror = await page.evaluate(async () => {
    const grab = async (u) => {
      const r = await fetch(u, { cache:'no-store' });
      const t = await r.text();
      return { status:r.status, bytes:t.length,
               build: (t.match(/data-build-id="([^"]+)"/) || [])[1] || '(none)' };
    };
    const mf = await (await fetch('/manifest.webmanifest', { cache:'no-store' })).json();
    return { startUrl: mf.start_url, root: await grab('/index.html'),
             legacy: await grab('/focus-hero.html'), start: await grab(mf.start_url || '/') };
  });
  R.check('the legacy mirror is served at all', mirror.legacy.status === 200, String(mirror.legacy.status));
  R.eq('and is byte-for-byte the same size as the real page', mirror.legacy.bytes, mirror.root.bytes);
  R.eq('declaring the SAME build — not a frozen one', mirror.legacy.build, mirror.root.build);
  R.check('the app start URL is the root, not the mirror',
    /\.\/?$|index\.html$/.test(String(mirror.startUrl)), String(mirror.startUrl));
  R.eq('and whatever it points at is the current build', mirror.start.build, mirror.root.build);

  R.check('no console errors throughout', problems.length === 0, problems.slice(0,3).join(' | '));
  await ctx.close();
} finally {
  await browser.close();
}

R.finish();
