/* storm2.mjs — reproduce the upload storm against a fake cloud.
 *
 * §7a measured the symptom on his row (~45 revisions per 90s, totals never
 * moving) and shipped a valve, but the trigger was still unknown. His screen
 * now names it: all six replay reasons are "push-reported", i.e. cloudPushOnce
 * itself returned replayRequired. That comes from exactly one place --
 * persistPushReceipt() -- which has TWO terms, and the label does not say which.
 *
 * So: stand up a fake players table that accepts the compare-and-set, run ONE
 * cloudPush, and count the uploads. Nothing here touches Joel's data or his
 * real cloud; every request is intercepted.
 */
import { launch, openApp } from './harness.mjs';

const PORT = process.argv[2] || 8962;
const browser = await launch();

let rev = 100;                 // pretend the row already exists at revision 100
const patches = [];

const { page } = await openApp(browser, PORT, {
  settleMs: 5000,
  routes: async ctx => {
    await ctx.route('**://*.supabase.co/**', async route => {
      const req = route.request();
      const url = req.url();
      const json = (status, body) => route.fulfill({
        status, contentType: 'application/json', body: JSON.stringify(body)
      });

      if (/\/auth\/v1\//.test(url)){
        return json(200, {
          access_token: 'fake.jwt.token', refresh_token: 'fake.refresh',
          expires_in: 3600, expires_at: Math.floor(Date.now()/1000) + 3600,
          user: { id: 'fake-user-id' }
        });
      }
      if (/\/rest\/v1\/players/.test(url)){
        if (req.method() === 'PATCH'){
          const m = /cloud_rev=eq\.(\d+)/.exec(url);
          const sent = m ? Number(m[1]) : -1;
          patches.push({ at: Date.now(), sentRev: sent, serverRev: rev });
          if (sent === rev){ rev += 1; return json(200, [{ cloud_rev: rev }]); }
          return json(200, []);                       // CAS miss
        }
        if (req.method() === 'GET') return json(200, [{ cloud_rev: rev }]);
        return json(200, []);
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    await ctx.route('**://api.jsonstorage.net/**', r => r.abort('failed'));
  }
});

await page.evaluate(r => {
  Object.assign(window.state.sync, {
    enabled: true, backend: 'supabase',
    syncCode: 'TESTCODE', syncSecret: 'TESTSECRETTESTSECRET',
    syncSecretHash: 'harnessharnessharnessharnessharn',
    playerId: 'harness-player', userId: 'fake-user-id',
    userToken: 'fake.jwt.token', tokenExpiresAt: Date.now() + 3600e3,
    cloudRev: r, pendingSync: false, pendingSince: 0,
    lastSyncError: null, retryCount: 0, retryAfter: 0, createAuthorization: null
  });
}, rev);

const t0 = Date.now();
const result = await page.evaluate(async () => {
  let err = null;
  try { await window.cloudPush({ reason: 'storm-probe' }); }
  catch(e){ err = String(e && e.message || e).slice(0, 200); }
  const s = window.state.sync;
  return {
    err,
    cloudRev: s.cloudRev,
    pendingSync: !!s.pendingSync,
    lastSyncError: s.lastSyncError || null,
    lastReplayStorm: s.lastReplayStorm || null
  };
});

console.log('ONE cloudPush({reason:"storm-probe"}) produced:');
console.log('  uploads (PATCH requests):', patches.length);
if (patches.length > 1){
  const gaps = patches.slice(1).map((p,i) => p.at - patches[i].at);
  console.log('  gaps between uploads (ms):', gaps.join(', '));
}
console.log('  server revision moved:', 100, '->', rev, `(+${rev-100})`);
console.log('  wall time:', Date.now() - t0, 'ms');
console.log('  final state:', JSON.stringify(result, null, 2));
const probe = await page.evaluate(() => window.__probe || []);
console.log('\n  WHICH TERM FIRED, per upload:');
probe.forEach((r,i) => {
  const t = o => Object.entries(o||{}).filter(([,v])=>v).map(([k])=>k).join('+') || 'none';
  console.log(`   #${i+1}  pre-receipt: ${t(r.pre)}   post-receipt: ${t(r.post)}`);
  if (r.preMoved && r.preMoved.length) console.log(`        PRE  diff (state vs uploaded bytes): ${JSON.stringify(r.preMoved).slice(0,600)}`);
  if (r.watermarkVsDurable !== undefined) console.log(`        uploadWatermark.raw === primaryLastDurableRaw ? ${r.watermarkVsDurable}`);
  if (r.movedKeys && r.movedKeys.length) console.log(`        POST diff: ${JSON.stringify(r.movedKeys).slice(0,400)}`);
});
await browser.close();
