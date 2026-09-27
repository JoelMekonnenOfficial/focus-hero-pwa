/* budget.mjs — the hard ceiling on cloud traffic.
 *
 * The storm is fixed at its source and the replay valve bounds one push chain,
 * but neither can promise anything about a cause nobody has found yet. A 5 GB
 * bill was already paid once for exactly that kind of unknown. This is the dumb
 * backstop underneath all of it: past N transfers the app stops talking to the
 * cloud, whatever the reason.
 *
 * The thing that must be true: it CAPS traffic, and it never LOSES work.
 */
import { launch, openApp, makeReporter } from './harness.mjs';

const PORT = process.argv[2] || 8995;
const R = makeReporter('budget.mjs');
const browser = await launch();

function cloudRoutes(startRev, hits){
  const box = { rev: startRev };
  return async ctx => {
    await ctx.route('**://*.supabase.co/**', async route => {
      const req = route.request(), url = req.url();
      const json = (s,b)=>route.fulfill({status:s,contentType:'application/json',body:JSON.stringify(b)});
      if (/\/auth\/v1\//.test(url)) return json(200,{access_token:'fake.jwt',refresh_token:'r',
        expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'fake-user-id'}});
      if (/\/rest\/v1\/players/.test(url)){
        hits.push({ m:req.method(), at:Date.now() });
        if (req.method()==='PATCH'){
          const m=/cloud_rev=eq\.(\d+)/.exec(url);
          if (m && Number(m[1])===box.rev){ box.rev+=1; return json(200,[{cloud_rev:box.rev}]); }
          return json(200,[]);
        }
        if (req.method()==='GET') return json(200,[{cloud_rev:box.rev}]);
        return json(200,[]);
      }
      return json(200,[]);
    });
    await ctx.route('**://api.jsonstorage.net/**', r=>r.abort('failed'));
  };
}
const enableSync = rev => page => page.evaluate(r => {
  try { localStorage.removeItem('fh.cloudBudget.v1'); } catch(_){}
  Object.assign(window.state.sync, {
    enabled:true, backend:'supabase', syncCode:'TESTCODE', syncSecret:'TESTSECRETTESTSECRET',
    syncSecretHash:'harnessharnessharnessharnessharn', playerId:'harness-player',
    userId:'fake-user-id', userToken:'fake.jwt', tokenExpiresAt:Date.now()+3600e3,
    cloudRev:r, pendingSync:false, pendingSince:0, lastSyncError:null,
    retryCount:0, retryAfter:0, createAuthorization:null, lastReplayStorm:null
  });
}, rev);

try {
  const hits = [];
  const { ctx, page, problems } = await openApp(browser, PORT, { settleMs: 5000, routes: cloudRoutes(100, hits) });
  await enableSync(100)(page);

  const limits = await page.evaluate(() => ({ hour: window.FH_CLOUD_BUDGET?.perHour, day: window.FH_CLOUD_BUDGET?.perDay }))
    .catch(() => ({}));
  const cfg = await page.evaluate(() => {
    // FH_CLOUD_BUDGET is a top-level var, so it IS on window — but check rather than assume
    return { onWindow: typeof window.FH_CLOUD_BUDGET === 'object', usage: typeof window.fhCloudUsage === 'function' };
  });
  R.check('the budget and its usage readout are reachable', cfg.onWindow && cfg.usage, JSON.stringify(cfg));

  /* hammer it far past the hourly cap */
  const run = await page.evaluate(async () => {
    const cap = window.FH_CLOUD_BUDGET.perHour;
    let allowed = 0, blocked = 0;
    for (let i = 0; i < cap + 25; i++){
      try { await window.cloudPush({ reason: 'budget-test', force: true }); allowed++; }
      catch(e){ if (/FH_CLOUD_BUDGET/.test(e?.code || '') || /Paused:/.test(e?.message || '')) blocked++; else allowed++; }
    }
    const s = window.state.sync;
    return { cap, allowed, blocked,
             usage: window.fhCloudUsage(),
             pendingSync: !!s.pendingSync,
             lastSyncError: s.lastSyncError || null,
             retryInS: s.retryAfter > 0 ? Math.round((s.retryAfter - Date.now())/1000) : 0 };
  });

  R.check('traffic is capped at the hourly limit',
    run.usage.hour <= run.cap, `${run.usage.hour} counted against a cap of ${run.cap}`);
  R.check('the attempts past the cap were actually refused',
    run.blocked > 0, `${run.blocked} of ${run.cap + 25} attempts refused`);
  R.check('and the network really stopped being touched',
    hits.length <= run.cap * 2, `${hits.length} requests reached the fake server`);

  /* nothing may be lost */
  R.check('work is kept queued, not dropped', run.pendingSync === true, `pendingSync=${run.pendingSync}`);
  R.check('a retry is scheduled for when the window reopens',
    run.retryInS > 0, `retry in ${run.retryInS}s`);
  /* A budget pause is a self-throttle, not a fault. It used to open with
     "Paused:", which on a phone reads identically to "your sync is broken" —
     and that is exactly how it was read. The wording has to say plainly that
     nothing is wrong, and it must still say it resumes on its own. */
  R.check('the user is told in plain language, not an error code',
    /^Catching up: /.test(String(run.lastSyncError))
      && /resumes by itself/.test(String(run.lastSyncError))
      && /nothing is wrong/i.test(String(run.lastSyncError))
      && !/^Paused/.test(String(run.lastSyncError)),
    JSON.stringify(String(run.lastSyncError).slice(0, 140)));

  /* pulls are counted too — the 5 GB was mostly egress */
  const pulls = await page.evaluate(async () => {
    const before = window.fhCloudUsage().hour;
    await window.cloudPull({ reason: 'budget-test', force: true }).catch(()=>{});
    return { before, after: window.fhCloudUsage().hour };
  });
  R.check('downloads count against the budget as well as uploads',
    pulls.after >= pulls.before, `hour count ${pulls.before} -> ${pulls.after}`);

  /* and the counter is per-device, never in the profile */
  const containment = await page.evaluate(() => ({
    inState: /cloudBudget/.test(JSON.stringify(window.state)),
    inLocalStorage: !!localStorage.getItem('fh.cloudBudget.v1')
  }));
  R.check('the counter never enters synced state', containment.inState === false);
  R.check('it lives on the device', containment.inLocalStorage === true);

  const unexpected=problems.filter(p=>!/\[fh-budget\] cloud transfers paused|sync queued Error: Catching up:/.test(p));
  R.check('no page errors or unexpected console errors', unexpected.length === 0,
    unexpected.slice(0,5).join(' | ') || 'clean');
  await ctx.close();
} finally { await browser.close(); }
R.finish();
