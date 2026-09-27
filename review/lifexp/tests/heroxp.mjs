/* heroxp.mjs — an XP reduction has to survive the merge too.
 *
 * RULE 4: every number here is synthetic. None of it is Joel's data.
 *
 * The failure this exists to stop: minutes, skills and coins can all come
 * through a merge correctly while the hero quietly snaps back. Hero XP is
 * decided by a different path — higher level wins wholesale, then a
 * re-derivation from the session ledger that only ran when the two devices'
 * XP bases already matched, and did NOTHING when they did not. No error, no
 * trace: the reduction was simply gone after the first sync.
 *
 * So the assertions are about the hero specifically, and the diagnostic is
 * checked too, because "it worked" and "it worked for the right reason" are
 * different claims.
 */
import { launch, openApp, makeReporter } from './harness.mjs';

const PORT = process.argv[2] || 8998;
const R = makeReporter('heroxp.mjs');
const browser = await launch();

const LIFETIME = `(function(lv,xp){var f=function(l){return Math.floor(100*Math.pow(l,1.35));};
  var t=0; for(var i=1;i<lv;i++) t+=f(i); return t+(xp|0); })`;

try {
  const { ctx, page, problems } = await openApp(browser, PORT, { settleMs: 5000 });

  R.eq('the merge exposes its hero decision', await page.evaluate(() => typeof window.fhMergeDiag), 'function');

  /* A profile with session-backed XP, then a session-backed reduction —
     exactly the shape of removing hours from a skill you keep. */
  const built = await page.evaluate(async (LT) => {
    const lifetime = eval(LT);
    const s = window.state;
    s.tasks = [{ id:'t_hero', name:'Hero', totalFocusMin:0, sessions:0, dailyMin:{}, lastUsedAt: Date.now() }];
    s.activeTaskId = 't_hero';
    s.sessionsLog = []; s.history = {}; s.totalFocusMin = 0; s.completedFocusSessions = 0;
    s.sessionHistory = {}; s.focusReductions = { version:1, entries:[] }; s.taskTombstones = {};
    s.hero.level = 40; s.hero.xp = 500;
    /* Big enough that the removal crosses a level boundary: the wholesale
       "higher level wins" rule only engages when the two devices disagree
       about the LEVEL, so a fixture that stays inside one level would never
       exercise the path this suite exists to cover. */
    for (let i = 0; i < 10; i++){
      const r = await window.applyTaskTimeAdjustment('t_hero', 1440, { surface:'test' });
      if (!r || !r.ok) return { err:'ledger add failed' };
    }
    const remote = JSON.parse(JSON.stringify(s));          /* the other device, before */
    window.__remote = remote;
    const before = { lifetimeXp: lifetime(s.hero.level|0, s.hero.xp|0), level: s.hero.level|0 };
    /* take 600 minutes off across the sessions — XP falls with them */
    const res = await window.applyTaskTimeAdjustment('t_hero', -9000,
      { surface:'test', bulkRemoval:true, spread:true });
    const after = { lifetimeXp: lifetime(s.hero.level|0, s.hero.xp|0), level: s.hero.level|0 };
    return { err:null, ok: !!(res && res.ok), before, after,
             xpRemoved: before.lifetimeXp - after.lifetimeXp,
             minutes: s.totalFocusMin|0 };
  }, LIFETIME);

  R.check('fixture built', !built.err && built.ok, built.err || `${built.minutes}m left`);
  R.check('the removal actually took XP off the hero', built.xpRemoved > 0,
    `${built.before.lifetimeXp} → ${built.after.lifetimeXp} (−${built.xpRemoved})`);
  R.check('and it was enough to change the level', built.after.level < built.before.level,
    `Lv ${built.before.level} → ${built.after.level}`);

  /* The merge against the other device, which still has the old hero. */
  const merged = await page.evaluate((LT) => {
    const lifetime = eval(LT);
    try {
      localStorage.removeItem('fh.mergeHeroDiag.v1');
      const out = window.mergeRemoteState(JSON.parse(JSON.stringify(window.state)), window.__remote);
      const diag = window.fhMergeDiag();
      return { ok:true, level: out.hero.level|0, xp: out.hero.xp|0,
               lifetimeXp: lifetime(out.hero.level|0, out.hero.xp|0),
               minutes: out.totalFocusMin|0,
               diag: diag[diag.length-1] || null };
    } catch(e){ return { ok:false, code:e.code||null, label:e.accountingLabel||null }; }
  }, LIFETIME);

  R.check('the merge completes', merged.ok, JSON.stringify(merged));
  R.eq('the hero keeps the reduced XP', merged.lifetimeXp, built.after.lifetimeXp);
  R.eq('and the reduced level', merged.level, built.after.level);
  R.check('the reduction was NOT handed back by the other device',
    merged.lifetimeXp < built.before.lifetimeXp,
    `${merged.lifetimeXp} vs the other device's ${built.before.lifetimeXp}`);
  R.eq('the minutes came through too', merged.minutes, built.minutes);

  /* It has to have worked for the right reason, not by luck. */
  R.check('the hero decision was actually applied, not skipped',
    !!(merged.diag && merged.diag.applied === true), JSON.stringify(merged.diag));
  R.check('and it applied because the two bases agreed',
    !!(merged.diag && merged.diag.leftXpBase === merged.diag.rightXpBase),
    merged.diag ? `${merged.diag.leftXpBase} vs ${merged.diag.rightXpBase}` : 'no diagnostic');

  /* Merging repeatedly must not keep taking XP off. */
  const stable = await page.evaluate((LT) => {
    const lifetime = eval(LT);
    const once = window.mergeRemoteState(JSON.parse(JSON.stringify(window.state)), window.__remote);
    const twice = window.mergeRemoteState(JSON.parse(JSON.stringify(once)), JSON.parse(JSON.stringify(once)));
    const thrice = window.mergeRemoteState(JSON.parse(JSON.stringify(twice)), window.__remote);
    return { once: lifetime(once.hero.level|0, once.hero.xp|0),
             twice: lifetime(twice.hero.level|0, twice.hero.xp|0),
             thrice: lifetime(thrice.hero.level|0, thrice.hero.xp|0) };
  }, LIFETIME);
  R.eq('merging again changes nothing', stable.twice, stable.once);
  R.eq('nor a third time against the old device', stable.thrice, stable.once);

  /* An UNTRACKED XP reduction — no session records to explain it — travels on
     the receipt instead, the same way untracked minutes do. */
  const untracked = await page.evaluate((LT) => {
    const lifetime = eval(LT);
    const s = window.state;
    const remote = JSON.parse(JSON.stringify(s));
    const before = lifetime(s.hero.level|0, s.hero.xp|0);
    window.removeXpQuiet(5000);                       /* nothing in the ledger explains this */
    const after = lifetime(s.hero.level|0, s.hero.xp|0);
    const naive = (()=>{ try { const o = window.mergeRemoteState(JSON.parse(JSON.stringify(s)), remote);
      return lifetime(o.hero.level|0, o.hero.xp|0); } catch(e){ return 'threw:'+(e.code||e.message); } })();
    window.fhRecordFocusReduction(s, { id:'xp_only', at: Date.now(), source:'test',
      label:'untracked xp', xp: before - after });
    const withReceipt = (()=>{ try { const o = window.mergeRemoteState(JSON.parse(JSON.stringify(s)), remote);
      return lifetime(o.hero.level|0, o.hero.xp|0); } catch(e){ return 'threw:'+(e.code||e.message); } })();
    return { before, after, naive, withReceipt };
  }, LIFETIME);

  R.check('without a receipt an untracked XP cut is handed back (the bug)',
    untracked.naive === untracked.before,
    `${untracked.after} became ${untracked.naive}`);
  R.check('with a receipt it survives',
    untracked.withReceipt === untracked.after,
    `${untracked.after} stayed ${untracked.withReceipt}`);

  /* ===== THE TWO REGRESSIONS THAT SHIPPED =====
     1. Compensation keyed on whether a device CARRIED the receipt. A receipt
        is synced, so as soon as it landed on the other copy both sides
        compensated by zero and the un-reduced value won.
     2. Compensation keyed on the two bases differing by EXACTLY the receipt
        amount. Any XP earned meanwhile from outside the session ledger shifts
        the gap: observed live at 75,432 against a receipt of 75,600.

     Both are covered below, and both fail against their own predecessor. */
  const register = await page.evaluate((LT) => {
    const lifetime = eval(LT);
    const f = l => Math.floor(100 * Math.pow(l, 1.35));
    const setLifetime = (hero, total) => { let l=1, acc=0;
      while (true){ const need=f(l); if (acc+need>total) return {...hero, level:l, xp:total-acc}; acc+=need; l++; if(l>999) return hero; } };
    /* A device that has APPLIED the reduction holds the reduced value — a
       fixture claiming "applied" while holding the un-reduced number is not a
       state the app can produce, and asserting on it tests nothing real. */
    const mk = (applied, extraXp) => {
      const snap = JSON.parse(JSON.stringify(window.state));
      snap.focusReductions = { version:1, entries:[
        { id:'r_xp', at: Date.now(), source:'test', label:'x', xp: 5000 } ] };
      snap.focusReductionsApplied = { version:1, ids: applied ? ['r_xp'] : [] };
      let t = 0; for (let i=1;i<(snap.hero.level|0);i++) t += f(i);
      const total = t + (snap.hero.xp|0) - (applied ? 5000 : 0) + (extraXp || 0);
      snap.hero = setLifetime(snap.hero, total);
      return snap;
    };
    const base = lifetime(window.state.hero.level|0, window.state.hero.xp|0);
    /* the reduced device */
    const reduced = mk(true, 0);
    const run = (remote, label) => {
      try {
        const out = window.mergeRemoteState(JSON.parse(JSON.stringify(reduced)), remote);
        const d = window.fhMergeDiag();
        return { label, ok:true, lifetime: lifetime(out.hero.level|0, out.hero.xp|0),
                 owedR: d[d.length-1] ? d[d.length-1].owedR : null,
                 applied: ((out.focusReductionsApplied||{}).ids||[]).slice() };
      } catch(e){ return { label, ok:false, err: e.code || e.message }; }
    };
    return {
      base, reducedLifetime: base - 5000,
      /* the other device carries the receipt but has NOT applied it */
      carriesNotApplied: run(mk(false, 0), 'carries-not-applied'),
      /* same, plus 168 XP earned meanwhile from outside the ledger */
      withDrift: run(mk(false, 168), 'drifted'),
      /* both have applied it — must not subtract twice */
      bothApplied: run(mk(true, 0), 'both-applied')
    };
  }, LIFETIME);

  R.check('a device that carries the receipt but has not applied it is compensated',
    register.carriesNotApplied.ok && register.carriesNotApplied.owedR === 5000,
    JSON.stringify(register.carriesNotApplied));
  R.eq('and the reduced value wins', register.carriesNotApplied.lifetime, register.reducedLifetime);
  R.check('the merged result records the reduction as applied',
    (register.carriesNotApplied.applied || []).indexOf('r_xp') !== -1,
    JSON.stringify(register.carriesNotApplied.applied));

  /* This is the live failure: the gap was 75,432, not 75,600. */
  R.check('drift from XP earned outside the ledger does not break it',
    register.withDrift.ok, JSON.stringify(register.withDrift));
  R.eq('the reduction still comes off, and the extra XP is kept',
    register.withDrift.lifetime, register.reducedLifetime + 168);

  R.eq('when both have applied it, nothing is subtracted again',
    register.bothApplied.lifetime, register.reducedLifetime);

  /* Applying pending reductions on this device is a one-shot. */
  const pending = await page.evaluate((LT) => {
    const lifetime = eval(LT);
    const s = window.state;
    const before = lifetime(s.hero.level|0, s.hero.xp|0);
    s.focusReductions = { version:1, entries:[
      { id:'pending_one', at: Date.now(), source:'test', label:'x', xp: 3000 } ] };
    s.focusReductionsApplied = { version:1, ids: [] };
    const first = window.fhApplyPendingFocusReductions('test');
    const afterFirst = lifetime(s.hero.level|0, s.hero.xp|0);
    const second = window.fhApplyPendingFocusReductions('test');
    const afterSecond = lifetime(s.hero.level|0, s.hero.xp|0);
    return { before, first, afterFirst, second, afterSecond,
             ids: ((s.focusReductionsApplied||{}).ids||[]).slice() };
  }, LIFETIME);
  R.eq('an unapplied reduction is performed once', pending.before - pending.afterFirst, 3000);
  R.eq('and records itself as applied', pending.ids.length, 1);
  R.eq('running it again does nothing', pending.afterSecond, pending.afterFirst);
  R.eq('and reports nothing to do', pending.second.applied, 0);

  /* Writing a receipt must not then re-apply it on the next boot. */
  const selfMark = await page.evaluate((LT) => {
    const lifetime = eval(LT);
    const s = window.state;
    s.focusReductions = { version:1, entries:[] };
    s.focusReductionsApplied = { version:1, ids: [] };
    window.fhRecordFocusReduction(s, { id:'fresh', at: Date.now(), source:'test', label:'x', xp: 2500 });
    const before = lifetime(s.hero.level|0, s.hero.xp|0);
    const res = window.fhApplyPendingFocusReductions('test');
    return { marked: ((s.focusReductionsApplied||{}).ids||[]).indexOf('fresh') !== -1,
             applied: res.applied, moved: before - lifetime(s.hero.level|0, s.hero.xp|0) };
  }, LIFETIME);
  R.check('writing a receipt marks it applied on the writing device', selfMark.marked);
  R.eq('so it is not performed a second time', selfMark.applied, 0);
  R.eq('and no XP moves', selfMark.moved, 0);

  R.check('no console errors throughout', problems.length === 0, problems.slice(0,3).join(' | '));
  await ctx.close();
} finally {
  await browser.close();
}
R.finish();
