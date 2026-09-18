/* sync.mjs — the upload storm, and the valve that bounds it.
 *
 * §12 named this as the one piece of v10.48.0 that shipped without a test.
 *
 * The storm: persistPushReceipt() decides "did local state change during the
 * upload?" by comparing JSON.stringify(state) against the bytes it uploaded.
 * The v10.43 payload measurement wrote state.sync.lastPayloadAt = Date.now()
 * AFTER those bytes were captured, so the answer was always yes, and each
 * replay stamped a fresh timestamp that guaranteed the next answer too.
 *
 * RULE 2: the bound here is CLOUD_PUSH_REPLAY_CAP = 6 replays. The churn
 * fixture below drives 12 genuine state changes — more than the cap — so the
 * valve's ceiling is actually exercised rather than assumed.
 *
 * RULE 4: every number in this file is synthetic. No part of it reads, writes
 * or resembles Joel's profile, and nothing here may ever be quoted as his data.
 *
 * usage: node tests/sync.mjs [port]
 */
import { launch, openApp, makeReporter } from './harness.mjs';

const PORT = process.argv[2] || 8962;
const R = makeReporter('sync.mjs');
const browser = await launch();

/* A fake players table that honours the compare-and-set the real one does. */
function cloudRoutes(startRev, patches, delayMs = 0){
  const box = { rev: startRev };
  const wait = () => delayMs ? new Promise(r => setTimeout(r, delayMs)) : null;
  return async ctx => {
    await ctx.route('**://*.supabase.co/**', async route => {
      const req = route.request(), url = req.url();
      const json = (s, b) => route.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });
      if (/\/auth\/v1\//.test(url)) return json(200, {
        access_token: 'fake.jwt.token', refresh_token: 'fake.refresh',
        expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600, user: { id: 'fake-user-id' }
      });
      if (/\/rest\/v1\/players/.test(url)){
        if (req.method() === 'PATCH'){
          const m = /cloud_rev=eq\.(\d+)/.exec(url);
          patches.push({ at: Date.now(), sentRev: m ? Number(m[1]) : -1 });
          await wait();   // a real upload takes time; without it nothing can change mid-flight
          if (m && Number(m[1]) === box.rev){ box.rev += 1; return json(200, [{ cloud_rev: box.rev }]); }
          return json(200, []);
        }
        if (req.method() === 'GET') return json(200, [{ cloud_rev: box.rev }]);
        return json(200, []);
      }
      return json(200, []);
    });
    await ctx.route('**://api.jsonstorage.net/**', r => r.abort('failed'));
  };
}

const enableSync = rev => page => page.evaluate(r => {
  Object.assign(window.state.sync, {
    enabled: true, backend: 'supabase',
    syncCode: 'TESTCODE', syncSecret: 'TESTSECRETTESTSECRET',
    syncSecretHash: 'harnessharnessharnessharnessharn',
    playerId: 'harness-player', userId: 'fake-user-id',
    userToken: 'fake.jwt.token', tokenExpiresAt: Date.now() + 3600e3,
    cloudRev: r, pendingSync: false, pendingSince: 0,
    lastSyncError: null, retryCount: 0, retryAfter: 0,
    createAuthorization: null, lastReplayStorm: null
  });
}, rev);

try {
  /* ---- 1. a quiet push uploads exactly once ---- */
  {
    const patches = [];
    const { ctx, page, problems } = await openApp(browser, PORT, { settleMs: 5000, routes: cloudRoutes(100, patches) });
    await enableSync(100)(page);
    const out = await page.evaluate(async () => {
      let err = null;
      try { await window.cloudPush({ reason: 'test-quiet' }); } catch(e){ err = String(e?.message || e).slice(0,160); }
      const s = window.state.sync;
      return { err, cloudRev: s.cloudRev, pendingSync: !!s.pendingSync,
               lastSyncError: s.lastSyncError || null, storm: s.lastReplayStorm || null };
    });

    R.eq('a quiet push uploads exactly once', patches.length, 1);
    R.eq('the cloud revision advances by exactly one', out.cloudRev, 101);
    R.check('the push reports no error', out.err === null, String(out.err));
    R.check('nothing is left pending', out.pendingSync === false, `pendingSync=${out.pendingSync}`);
    R.check('no replay storm is recorded', out.storm === null, JSON.stringify(out.storm));
    R.check('no sync error is shown to the user', out.lastSyncError === null, String(out.lastSyncError));
    R.check('no page errors or unexpected console errors', problems.length === 0,
      problems.length ? '\n      ' + problems.slice(0,6).join('\n      ') : 'clean');
    await ctx.close();
  }

  /* ---- 2. the payload measurement stays off the profile ---- */
  {
    const patches = [];
    const { ctx, page } = await openApp(browser, PORT, { settleMs: 5000, routes: cloudRoutes(200, patches) });
    await enableSync(200)(page);
    const m = await page.evaluate(async () => {
      await window.cloudPush({ reason: 'test-measure' }).catch(() => {});
      let stored = null;
      try { stored = JSON.parse(localStorage.getItem('fh.lastPayload.v1') || 'null'); } catch(_){}
      return {
        stored,
        inState: /lastPayloadAt/.test(JSON.stringify(window.state)),
        panelReads: (window.fhLastPayloadMeasurement?.() || {}).bytes || 0
      };
    });
    R.check('the upload weight is measured and kept on the device',
      !!(m.stored && m.stored.bytes > 0), JSON.stringify(m.stored));
    R.check('it is NOT written into the synced profile',
      m.inState === false, `state contains lastPayloadAt: ${m.inState}`);
    R.check('the sync panel can still read it', m.panelReads > 0, `${m.panelReads} bytes`);
    await ctx.close();
  }

  /* ---- 3. the valve still bounds a genuine storm ----
     Prove the fix did not simply disable the replay loop. Mutate state on a
     timer during the push so local really is moving, and drive more changes
     than the cap so the ceiling itself is exercised (Rule 2). */
  {
    const patches = [];
    const { ctx, page } = await openApp(browser, PORT, { settleMs: 5000, routes: cloudRoutes(300, patches, 250) });
    await enableSync(300)(page);
    const out = await page.evaluate(async () => {
      let ticks = 0;
      const churn = setInterval(() => { window.state.hero.churnProbe = ++ticks; }, 20);
      let err = null;
      try { await window.cloudPush({ reason: 'test-churn' }); } catch(e){ err = String(e?.message || e).slice(0,200); }
      clearInterval(churn);
      const s = window.state.sync;
      return { ticks, err, storm: s.lastReplayStorm || null, lastSyncError: s.lastSyncError || null,
               pendingSync: !!s.pendingSync, retryAfter: Number(s.retryAfter || 0) };
    });

    R.check('the churn fixture drove more changes than the cap',
      out.ticks > 6, `${out.ticks} state changes vs cap 6`);
    R.check('replays are bounded, not unlimited',
      patches.length <= 7, `${patches.length} uploads`);
    R.check('the cap is recorded with its reasons',
      !!(out.storm && out.storm.replays >= 1), JSON.stringify(out.storm && {replays: out.storm.replays, reasons: out.storm.reasons?.slice(0,3)}));
    R.check('backoff spaced the uploads out',
      patches.length < 2 || (patches[patches.length-1].at - patches[0].at) > 500,
      patches.length > 1 ? `${patches[patches.length-1].at - patches[0].at}ms across ${patches.length}` : 'n/a');
    R.check('nothing is lost — it stays queued for retry',
      out.pendingSync === true, `pendingSync=${out.pendingSync}`);
    R.check('the user still sees why it paused',
      /Upload paused/.test(String(out.lastSyncError)), JSON.stringify(String(out.lastSyncError).slice(0,90)));
    R.check('the promised retry is actually scheduled',
      out.retryAfter > Date.now(), `retryAfter in ${Math.round((out.retryAfter - Date.now())/1000)}s`);
    await ctx.close();
  }

  /* ---- 4. an idle app with sync on uploads nothing ---- */
  {
    const patches = [];
    const { ctx, page } = await openApp(browser, PORT, { settleMs: 5000, routes: cloudRoutes(400, patches) });
    await enableSync(400)(page);
    await page.waitForTimeout(12000);
    R.eq('12 idle seconds produce zero uploads', patches.length, 0);
    await ctx.close();
  }
} finally {
  await browser.close();
}

R.finish();
