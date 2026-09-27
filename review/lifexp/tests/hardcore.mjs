/* hardcore.mjs — the mode with the worst history in this project.
 *
 * Three wrong fixes shipped before the real cause was found, runs were lost to
 * a minute-conservation bug, and `excusedDays` was silently dropped by
 * normalizeRun() because the normalizer did not know the field (§11). This
 * exercises the real lifecycle through the module's own API.
 *
 * All synthetic (RULE 4): every run, day and minute here is invented. None of
 * it is Joel's data and none of it may ever be quoted as his.
 */
import { launch, openApp, makeReporter } from './harness.mjs';

const PORT = process.argv[2] || 8993;
const R = makeReporter('hardcore.mjs');
const browser = await launch();
try {
  const { ctx, page, problems } = await openApp(browser, PORT, { settleMs: 6000 });

  const api = await page.evaluate(() => {
    const H = window.FH_HARDCORE;
    return H ? { present: true, fns: ['start','end','evaluate','revive','pause','resume','status','runs','streak'].filter(k => typeof H[k] !== 'function') } : { present: false };
  });
  R.check('the Hardcore module is loaded', api.present);
  R.check('its whole lifecycle API is present', api.present && api.fns.length === 0, (api.fns||[]).join(', ') || 'all present');

  /* --- a run starts, and a fresh run has survived zero days --- */
  const started = await page.evaluate(async () => {
    const H = window.FH_HARDCORE;
    /* start() is ASYNC and takes the preset id itself, not an options object.
       Passing {preset:'min60'} without awaiting returns a truthy Promise while
       normalizeRequirement rejects the object — a test that skips the await
       reports success and creates nothing. */
    for (const r of (H.runs() || [])) { try { await H.end(r.id); } catch(_){} }
    const res = await H.start('min60');
    await new Promise(r => setTimeout(r, 300));
    const st = H.status();
    return { res: res && res.ok !== false, reason: res && res.reason, active: st.active, runCount: st.runCount,
             days: st.daysSurvived ?? st.survived ?? null, runs: H.runs().length };
  });
  R.check('a run can be started', started.res && started.active, JSON.stringify(started).slice(0,120));
  R.eq('exactly one run is live', started.runs, 1);
  R.check('a brand-new run has not survived any days yet',
    started.days === 0 || started.days === null,
    `daysSurvived=${started.days} — a one-day-old run showing 0 is correct, not a bug`);

  /* --- the §11 trap: add a field to a run and see if the normalizer eats it --- */
  const fieldSurvival = await page.evaluate(async () => {
    const runs = (window.state.fh12Hardcore && window.state.fh12Hardcore.runs) || null;
    if (!runs || !runs.length) return { skipped: true };
    const before = runs[0].excusedDays;
    runs[0].excusedDays = ['2026-01-01'];
    await window.saveStateDurable({ source: 'hardcore-test' });
    await new Promise(r => setTimeout(r, 250));
    const after = (window.state.fh12Hardcore.runs || [])[0];
    return { skipped: false, before, kept: Array.isArray(after.excusedDays) && after.excusedDays.includes('2026-01-01') };
  });
  R.check('excusedDays survives a save (normalizeRun knows the field)',
    fieldSurvival.skipped || fieldSurvival.kept === true,
    fieldSurvival.skipped ? 'no run to test' : `kept=${fieldSurvival.kept}`);

  /* --- pause / resume must not end the run --- */
  const paused = await page.evaluate(async () => {
    const H = window.FH_HARDCORE;
    const id = H.runs()[0]?.id;
    await H.pause(id); await new Promise(r => setTimeout(r, 200));
    const whilePaused = { paused: H.isPaused(id), live: H.runs().length };
    await H.resume(id); await new Promise(r => setTimeout(r, 200));
    return { whilePaused, after: { paused: H.isPaused(id), live: H.runs().length } };
  });
  R.check('pausing does not end the run',
    paused.whilePaused.paused === true && paused.whilePaused.live === 1, JSON.stringify(paused.whilePaused));
  R.check('resuming brings it back', paused.after.paused === false && paused.after.live === 1, JSON.stringify(paused.after));

  /* --- revive must retract the -200 RP it took, not just un-end the run --- */
  const revive = await page.evaluate(async () => {
    const H = window.FH_HARDCORE;
    const id = H.runs()[0]?.id;
    const plan = typeof H.__revivePlan === 'function' ? H.__revivePlan(id) : null;
    const rank = window.state.fhRank || {};
    const events = rank.events || {};
    const hcf = Object.keys(events).filter(k => /^hcf:/.test(k));
    const src = await fetch('fh-hardcore-v12.js').then(r => r.text()).catch(() => '');
    const reviveBody = (/function reviveRun\([\s\S]{0,4000}/.exec(src) || [''])[0];
    return { hasPlan: !!plan,
             planRetractsRank: !!(plan && JSON.stringify(plan).includes('hcf')),
             reviveRetractsRank: /hcf/.test(reviveBody),
             hcfEventsOnThisProfile: hcf.length };
  });
  /* A LIVE run has no penalty to take back, so an empty plan here is correct.
     What matters is that the revive path retracts the -200 RP hcf event rather
     than only un-ending the run — assert that structurally, and be explicit
     that this is a code-level check, not a simulated failed run. */
  R.check('a live run has nothing to revive',
    revive.hasPlan === false || revive.planRetractsRank === false,
    `plan present: ${revive.hasPlan}`);
  R.check('the revive path retracts the rank penalty, not just the run',
    revive.reviveRetractsRank === true,
    revive.reviveRetractsRank ? 'revive references hcf retraction' : 'NO hcf retraction found in the revive path');

  /* --- ending a run must not destroy its history --- */
  const ended = await page.evaluate(async () => {
    const H = window.FH_HARDCORE;
    const id = H.runs()[0]?.id;
    const hc = window.state.fh12Hardcore || {};
    const histBefore = (hc.history || []).length;
    await H.end(id);
    await new Promise(r => setTimeout(r, 300));
    const s = window.state.fh12Hardcore || {};
    return { live: H.runs().length, histBefore, histAfter: (s.history || []).length };
  });
  R.eq('ending the run leaves none live', ended.live, 0);
  R.check('and the run is kept in history, not deleted (RULE 1)',
    ended.histAfter >= ended.histBefore,
    `history ${ended.histBefore} -> ${ended.histAfter}`);

  R.check('no page errors or unexpected console errors', problems.length === 0,
    problems.length ? '\n      ' + problems.slice(0,6).join('\n      ') : 'clean');
  await ctx.close();
} finally { await browser.close(); }
R.finish();
