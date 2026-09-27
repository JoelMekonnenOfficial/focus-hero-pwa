/* guardreduce.mjs — a deliberate removal is not a wipe.
 *
 * RULE 4: every number here is synthetic. None of it is Joel's data.
 *
 * The data guard compares the live profile against protected snapshots and
 * shouts "Your data looks wiped" when minutes fall by more than max(120, 5%).
 * That is correct for an actual wipe and wrong for a removal the user asked
 * for twice and confirmed. The reduction receipt is what tells them apart.
 *
 * The falsifiability checks matter most here: strip the receipt and the alarm
 * must come back, and a loss the receipt does not cover must still be flagged.
 * A guard that stopped firing would be far worse than one that over-fires.
 */
import { launch, openApp, makeReporter } from './harness.mjs';

const PORT = process.argv[2] || 8998;
const R = makeReporter('guardreduce.mjs');
const browser = await launch();
try {
  const { ctx, page, problems } = await openApp(browser, PORT, { settleMs: 6000 });

  const has = await page.evaluate(() => !!(window.__fhGuardTest && window.__fhGuardTest.anomalyReasons));
  R.check('the data guard exposes its comparison for testing', has);

  /* guard copy: 10,000 minutes. live copy: 4,000. A 6,000-minute drop, far
     past the threshold, so it is unambiguously "alarm" territory. */
  const base = await page.evaluate(() => {
    const G = window.__fhGuardTest;
    const mk = (minutes, receipts) => G.summarize({
      totalFocusMin: minutes, history: { '2026-01-01': minutes },
      hero: { level: 10 }, coinsEarned: 500, coinsSpent: 100,
      sessionsLog: [], tasks: [],
      focusReductions: { version: 1, entries: receipts || [] }
    });
    const guard = mk(10000, []);
    const bare  = mk(4000, []);
    const withReceipt = mk(4000, [
      { id: 'r1', at: Date.now(), total: 2000, trackedTotal: 4000 }
    ]);
    const tooSmall = mk(4000, [
      { id: 'r2', at: Date.now(), total: 100, trackedTotal: 0 }
    ]);
    const exact = mk(4000, [
      { id: 'r3', at: Date.now(), total: 6000, trackedTotal: 0 }
    ]);
    const alsoInGuard = G.summarize({
      totalFocusMin: 10000, history: { '2026-01-01': 10000 },
      hero: { level: 10 }, coinsEarned: 500, coinsSpent: 100,
      sessionsLog: [], tasks: [],
      focusReductions: { version: 1, entries: [{ id:'r1', at: Date.now(), total:2000, trackedTotal:4000 }] }
    });
    return {
      bare: G.anomalyReasons(bare, guard),
      withReceipt: G.anomalyReasons(withReceipt, guard),
      tooSmall: G.anomalyReasons(tooSmall, guard),
      exact: G.anomalyReasons(exact, guard),
      alreadyKnown: G.anomalyReasons(withReceipt, alsoInGuard)
    };
  });

  R.check('a 6,000 minute drop with no receipt still raises the wipe alarm',
    base.bare.includes('focus-minutes-regression'), JSON.stringify(base.bare));
  R.check('the same drop with a receipt that covers it does not',
    !base.withReceipt.includes('focus-minutes-regression'), JSON.stringify(base.withReceipt));
  R.check('tracked and untracked minutes both count as explanation',
    !base.exact.includes('focus-minutes-regression'), JSON.stringify(base.exact));
  R.check('a receipt too small to explain the loss does not silence the alarm',
    base.tooSmall.includes('focus-minutes-regression'), JSON.stringify(base.tooSmall));
  R.check('a receipt the guard copy already carries explains nothing new',
    base.alreadyKnown.includes('focus-minutes-regression'), JSON.stringify(base.alreadyKnown));

  /* ---- the backfill: reconstruct a receipt from a before-snapshot ---- */
  const backfill = await page.evaluate(async () => {
    const s = window.state;
    s.tasks = [{ id:'t_live', name:'Live', totalFocusMin:0, sessions:0, dailyMin:{}, lastUsedAt: Date.now() },
               { id:'t_ghost', name:'Ghost', totalFocusMin:0, sessions:0, dailyMin:{}, lastUsedAt: 1 }];
    s.sessionsLog = []; s.history = {}; s.totalFocusMin = 0; s.completedFocusSessions = 0;
    s.focusReductions = { version:1, entries:[] }; s.taskTombstones = {};
    for (let i = 0; i < 2; i++){
      const r = await window.applyTaskTimeAdjustment('t_live', 600, { surface:'test' });
      if (!r || !r.ok) return { err:'ledger add failed' };
    }
    const ghost = s.tasks.find(t=>t.id==='t_ghost');
    ghost.dailyMin['2026-01-05'] = 500; ghost.totalFocusMin = 500; ghost.sessions = 1;
    s.history['2026-01-05'] = (s.history['2026-01-05']||0) + 500;
    s.totalFocusMin += 500; s.completedFocusSessions += 1;

    const before = JSON.parse(JSON.stringify(s));

    /* one session-backed reduction… */
    const rec = s.sessionsLog.filter(r=>r.taskId==='t_live'&&r.type==='focus')[0];
    await window.applySessionEdit(rec.id, (rec.minutes|0) - 200, { surface:'test' });
    /* …and one untracked one */
    window.fhRemoveSkillLoggedTime(s.tasks.find(t=>t.id==='t_ghost'));
    window.deleteTask('t_ghost', { confirmMsg:false });

    const auto = (s.focusReductions.entries||[]).length;
    s.focusReductions = { version:1, entries:[] };          /* forget them */
    const plan = window.fhReductionBackfillPlan(before, s);
    const done = window.fhBackfillReductionReceipt(before, { id:'bf1', label:'test' });
    return { auto, plan, entries: s.focusReductions.entries.length,
             receipt: s.focusReductions.entries[0] || null,
             liveTotal: s.totalFocusMin|0, beforeTotal: before.totalFocusMin|0,
             merged: (()=>{ try {
               const out = window.mergeRemoteState(JSON.parse(JSON.stringify(s)), before);
               return { ok:true, total: out.totalFocusMin|0 };
             } catch(e){ return { ok:false, code:e.code||null, label:e.accountingLabel||null }; } })(),
             guard: (()=>{ const G=window.__fhGuardTest;
               return G.anomalyReasons(G.summarize(s), G.summarize(before)); })() };
  });

  R.check('backfill fixture built', !backfill.err, backfill.err || '');
  R.eq('the snapshot diff finds the session-backed minutes', backfill.plan.trackedTotal, 200);
  R.eq('and the untracked minutes separately', backfill.plan.total, 500);
  R.eq('together they account for the whole drop', backfill.plan.unexplained, 0);
  R.eq('the drop it is explaining is the real one',
    backfill.beforeTotal - backfill.liveTotal, backfill.plan.trackedTotal + backfill.plan.total);
  R.eq('one receipt is written', backfill.entries, 1);
  R.eq('it records the untracked part for the merge', backfill.receipt && backfill.receipt.total, 500);
  R.eq('and the tracked part for the guard', backfill.receipt && backfill.receipt.trackedTotal, 200);
  R.check('the reconstructed receipt satisfies the merge',
    backfill.merged.ok && backfill.merged.total === backfill.liveTotal,
    JSON.stringify(backfill.merged));
  R.check('and the data guard stops calling it a wipe',
    !backfill.guard.includes('focus-minutes-regression'), JSON.stringify(backfill.guard));

  /* ---- the session-count trap ----
     A legacy import record carries no sessionCountApplied, so the ledger
     counts it as zero sessions. Editing it down GRANTS it credit: the ledger
     gains a session while completedFocusSessions falls because of an unrelated
     untracked deletion. A backfill that diffed the raw totals produced a
     receipt that was short by exactly the granted credits, and sync still
     refused with "Cloud accounting conflict in completed session count".
     This is that case, which is the shape of Joel's real profile. */
  const trap = await page.evaluate(async () => {
    const s = window.state;
    s.tasks = [{ id:'t_import', name:'Import', totalFocusMin:0, sessions:0, dailyMin:{}, lastUsedAt: Date.now() },
               { id:'t_bare2', name:'Bare', totalFocusMin:0, sessions:0, dailyMin:{}, lastUsedAt: 1 }];
    s.sessionsLog = []; s.history = {}; s.totalFocusMin = 0; s.completedFocusSessions = 0;
    s.sessionHistory = {}; s.focusReductions = { version:1, entries:[] }; s.taskTombstones = {};
    /* three legacy import rows, exactly as a bulk import leaves them */
    const day = '2026-07-21';
    for (let i = 0; i < 3; i++){
      s.sessionsLog.push({ id:'legacy_'+i, type:'focus', source:'ledger', at: Date.now()-i*1000,
        minutes: 600, originalMinutes: 600, taskId:'t_import', taskName:'Import',
        localDay: day, dayKey: day, action:'Fight', xp: 1000, coins: 100, rewarded:true,
        comboPriorCount:0, streakBefore:0, streakForCalc:0, updatedAt: Date.now()-i*1000 });
      s.history[day] = (s.history[day]||0) + 600;
      s.totalFocusMin += 600;
    }
    const imp = s.tasks.find(t=>t.id==='t_import');
    imp.totalFocusMin = 1800; imp.dailyMin[day] = 1800; imp.sessions = 0;
    s.sessionHistory[day] = 0;
    /* A real profile's action minutes agree with its ledger; without this the
       fixture starts with a -1800 base that no receipt should ever paper over. */
    s.adventure = s.adventure || {}; s.adventure.actionMin = s.adventure.actionMin || {};
    s.adventure.actionMin.Fight = 1800;
    /* an untracked skill with real session counts on its row */
    const bare = s.tasks.find(t=>t.id==='t_bare2');
    bare.dailyMin['2026-02-02'] = 300; bare.totalFocusMin = 300; bare.sessions = 9;
    s.history['2026-02-02'] = 300; s.totalFocusMin += 300; s.completedFocusSessions = 9;
    await window.saveStateDurable({ source:'trap-fixture' });
    const before = JSON.parse(JSON.stringify(s));

    /* edit one import row down — this is what grants it count credit */
    await window.applySessionEdit('legacy_0', 200, { surface:'test' });
    /* and delete the untracked skill's hours */
    window.fhRemoveSkillLoggedTime(bare);
    window.deleteTask('t_bare2', { confirmMsg:false });

    s.focusReductions = { version:1, entries:[] };          /* forget the auto receipts */
    const naive = (before.completedFocusSessions|0) - (s.completedFocusSessions|0);
    const plan = window.fhReductionBackfillPlan(before, s);
    window.fhBackfillReductionReceipt(before, { id:'trap', label:'trap' });
    let merged;
    try { const out = window.mergeRemoteState(JSON.parse(JSON.stringify(s)), before);
          merged = { ok:true, total: out.totalFocusMin|0, sessions: out.completedFocusSessions|0 }; }
    catch(e){ merged = { ok:false, code:e.code||null, label:e.accountingLabel||null }; }
    return { naive, planSessions: plan.sessions, planTotal: plan.total,
             liveSessions: s.completedFocusSessions|0, liveTotal: s.totalFocusMin|0, merged };
  });
  R.check('the trap fixture grants credit the naive diff would miss',
    trap.planSessions !== trap.naive,
    `raw total difference ${trap.naive}, real untracked reduction ${trap.planSessions}`);
  R.check('the merge accepts the reconstructed receipt', trap.merged.ok, JSON.stringify(trap.merged));
  R.eq('and keeps the reduced session count', trap.merged.sessions, trap.liveSessions);
  R.eq('and the reduced minutes', trap.merged.total, trap.liveTotal);

  R.check('no console errors throughout', problems.length === 0, problems.slice(0,3).join(' | '));
  await ctx.close();
} finally {
  await browser.close();
}
R.finish();
