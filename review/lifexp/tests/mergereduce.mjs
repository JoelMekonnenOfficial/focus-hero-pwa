/* mergereduce.mjs — a deliberate reduction has to survive the merge.
 *
 * RULE 4: every number here is synthetic. None of it is Joel's data.
 *
 * The bug: removing untracked time (a skill whose sessions were pruned) lowers
 * this device's total with nothing in the session ledger to explain it. The
 * projection compares the two devices' untracked "bases", sees them disagree,
 * and stops sync with FH_SYNC_ACCOUNTING_CONFLICT. The removal can never reach
 * the other device, and sync stays broken until the minutes are put back.
 *
 * Test 1 proves that, against a state with the receipt stripped out, so this
 * suite is falsifiable in both directions rather than only asserting success.
 */
import { launch, openApp, makeReporter } from './harness.mjs';

const PORT = process.argv[2] || 8998;
const R = makeReporter('mergereduce.mjs');
const browser = await launch();
try {
  const { ctx, page, problems } = await openApp(browser, PORT, { settleMs: 5000 });

  /* Fixture: a profile with real ledger-backed sessions on one skill, plus a
     second skill holding untracked minutes with no records behind them. */
  const built = await page.evaluate(async () => {
    const s = window.state;
    s.tasks = [{ id:'t_live', name:'Live', totalFocusMin:0, sessions:0, dailyMin:{}, lastUsedAt: Date.now() },
               { id:'t_ghost', name:'Ghost', totalFocusMin:0, sessions:0, dailyMin:{}, lastUsedAt: 1 }];
    s.sessionsLog = []; s.history = {}; s.totalFocusMin = 0; s.completedFocusSessions = 0;
    s.focusReductions = { version:1, entries:[] };
    s.taskTombstones = {};
    for (let i = 0; i < 3; i++){
      const r = await window.applyTaskTimeAdjustment('t_live', 600, { surface:'test' });
      if (!r || !r.ok) return { err:'ledger add failed' };
    }
    /* untracked: straight into the ledgers, no session records at all */
    const ghost = s.tasks.find(t=>t.id==='t_ghost');
    const days = ['2026-01-05','2026-01-06','2026-01-07'];
    for (const d of days){
      ghost.dailyMin[d] = 400; ghost.totalFocusMin += 400;
      s.history[d] = (s.history[d]||0) + 400; s.totalFocusMin += 400;
    }
    ghost.sessions = 3; s.completedFocusSessions += 3;
    await window.saveStateDurable({ source:'mergereduce-fixture' });
    window.__remote = JSON.parse(JSON.stringify(s));   /* the other device, before the removal */
    return { total: s.totalFocusMin|0, ghost: ghost.totalFocusMin|0,
             tracked: s.sessionsLog.filter(r=>r.type==='focus').length };
  });
  R.check('fixture built', !built.err, built.err || `${built.total}m total, ghost ${built.ghost}m, ${built.tracked} records`);
  R.eq('fixture: 1800 tracked + 1200 untracked', built.total, 3000);

  /* delete the untracked skill and erase its hours — the real operation */
  const removed = await page.evaluate(() => {
    const s = window.state;
    const t = s.tasks.find(x=>x.id==='t_ghost');
    const res = window.fhRemoveSkillLoggedTime(t);
    window.deleteTask('t_ghost', { confirmMsg:false });
    return { res, total: s.totalFocusMin|0, sessions: s.completedFocusSessions|0,
             receipts: (s.focusReductions.entries||[]).length,
             receipt: (s.focusReductions.entries||[])[0] || null,
             gone: !s.tasks.find(x=>x.id==='t_ghost') };
  });
  R.eq('the untracked hours came off locally', removed.total, 1800);
  R.check('the skill is gone', removed.gone);
  R.eq('exactly one reduction receipt was written', removed.receipts, 1);
  R.eq('the receipt records the minutes removed', removed.receipt && removed.receipt.total, 1200);
  R.check('the receipt names the days it took them from',
    removed.receipt && Object.keys(removed.receipt.history||{}).length === 3,
    JSON.stringify(removed.receipt && removed.receipt.history));

  /* 1. WITHOUT the receipt this is the shipped failure — sync stops dead */
  const withoutReceipt = await page.evaluate(() => {
    const local = JSON.parse(JSON.stringify(window.state));
    local.focusReductions = { version:1, entries:[] };     /* strip it */
    try {
      const out = window.mergeRemoteState(local, window.__remote);
      return { threw:false, total: out.totalFocusMin|0, day: (out.history||{})['2026-01-05']|0 };
    } catch(e){ return { threw:true, code:e.code||null, label:e.accountingLabel||null }; }
  });
  /* Two shapes of the same bug, depending on whether anything else in the
     session ledger also moved: a hard FH_SYNC_ACCOUNTING_CONFLICT that stops
     sync, or a silent fall back to the higher number. Either way the removal
     does not survive, which is what the receipt exists to fix. */
  R.check('without a receipt the reduction is lost (this is the bug)',
    withoutReceipt.threw ? withoutReceipt.code === 'FH_SYNC_ACCOUNTING_CONFLICT'
                         : withoutReceipt.total === 3000,
    JSON.stringify(withoutReceipt));

  /* 2. WITH the receipt it merges, and keeps the reduction */
  const merged = await page.evaluate(() => {
    const local = JSON.parse(JSON.stringify(window.state));
    try {
      const out = window.mergeRemoteState(local, window.__remote);
      return { ok:true, total: out.totalFocusMin|0, sessions: out.completedFocusSessions|0,
               ghost: !!out.tasks.find(t=>t.id==='t_ghost'),
               d5: (out.history||{})['2026-01-05']|0,
               live: (out.tasks.find(t=>t.id==='t_live')||{}).totalFocusMin|0,
               receipts: ((out.focusReductions||{}).entries||[]).length };
    } catch(e){ return { ok:false, code:e.code||null, label:e.accountingLabel||null, msg:String(e.message).slice(0,120) }; }
  });
  R.check('with a receipt the merge completes', merged.ok, JSON.stringify(merged));
  R.eq('the merged total keeps the reduction', merged.total, 1800);
  R.eq('the reduced day stays reduced', merged.d5, 0);
  R.check('the deleted skill does not come back', merged.ghost === false);
  R.eq('the other skill keeps every tracked minute', merged.live, 1800);
  R.eq('the receipt travels in the merged state', merged.receipts, 1);

  /* 3. idempotent — merging again, and with the receipt on both sides */
  const twice = await page.evaluate(() => {
    const local = JSON.parse(JSON.stringify(window.state));
    const once = window.mergeRemoteState(local, window.__remote);
    const remoteNow = JSON.parse(JSON.stringify(once));      /* other device has now synced */
    const again = window.mergeRemoteState(JSON.parse(JSON.stringify(once)), remoteNow);
    const third = window.mergeRemoteState(JSON.parse(JSON.stringify(again)), remoteNow);
    return { once: once.totalFocusMin|0, again: again.totalFocusMin|0, third: third.totalFocusMin|0,
             receipts: ((third.focusReductions||{}).entries||[]).length };
  });
  R.eq('a second merge subtracts nothing further', twice.again, twice.once);
  R.eq('nor a third', twice.third, twice.once);
  R.eq('the receipt is not duplicated by round trips', twice.receipts, 1);

  /* 4. order does not matter — both devices reach the same number */
  const order = await page.evaluate(() => {
    const a = window.mergeRemoteState(JSON.parse(JSON.stringify(window.state)), window.__remote);
    const b = window.mergeRemoteState(JSON.parse(JSON.stringify(window.__remote)), JSON.parse(JSON.stringify(window.state)));
    return { a: a.totalFocusMin|0, b: b.totalFocusMin|0 };
  });
  R.eq('merging in the other direction agrees', order.b, order.a);

  /* 5. time the other device logged meanwhile is NOT eaten by the receipt */
  const withNewWork = await page.evaluate(() => {
    /* Real new work on the other device is a SESSION, not a bare number in
       history. Clone one of the remote's own ledger records so the minutes
       are explained by evidence, exactly as a live session would be. */
    const remote = JSON.parse(JSON.stringify(window.__remote));
    const seed = (remote.sessionsLog||[]).find(r=>r&&r.type==='focus'&&r.taskId==='t_live');
    const day = '2026-03-03';
    const rec = JSON.parse(JSON.stringify(seed));
    rec.id = 'ledger_remote_new_work'; rec.at = Date.now(); rec.updatedAt = rec.at;
    rec.minutes = 90; rec.originalMinutes = 90; rec.localDay = day; rec.dayKey = day;
    rec.manualOperationId = 'remote_new_work';
    remote.sessionsLog.push(rec);
    remote.totalFocusMin = (remote.totalFocusMin|0) + 90;
    remote.history[day] = (remote.history[day]|0) + 90;
    remote.completedFocusSessions = (remote.completedFocusSessions|0) + 1;
    remote.sessionHistory = remote.sessionHistory || {};
    remote.sessionHistory[day] = (remote.sessionHistory[day]|0) + 1;
    remote.adventure = remote.adventure || {}; remote.adventure.actionMin = remote.adventure.actionMin || {};
    const act = String(rec.action||'Travel');
    remote.adventure.actionMin[act] = (remote.adventure.actionMin[act]|0) + 90;
    const rt = remote.tasks.find(t=>t.id==='t_live');
    rt.totalFocusMin = (rt.totalFocusMin|0) + 90;
    rt.sessions = (rt.sessions|0) + 1;
    rt.dailyMin[day] = (rt.dailyMin[day]|0) + 90;
    try {
      const out = window.mergeRemoteState(JSON.parse(JSON.stringify(window.state)), remote);
      return { ok:true, total: out.totalFocusMin|0, newDay:(out.history||{})[day]|0,
               live:(out.tasks.find(t=>t.id==='t_live')||{}).totalFocusMin|0 };
    } catch(e){ return { ok:false, code:e.code||null, label:e.accountingLabel||null }; }
  });
  R.check('a merge with new remote work still completes', withNewWork.ok, JSON.stringify(withNewWork));
  R.eq('the other device\'s new session lands on the day', withNewWork.newDay, 90);
  R.eq('the skill keeps its own minutes plus the new ones', withNewWork.live, 1890);
  R.eq('and the lifetime total is the reduced one plus the new work', withNewWork.total, 1890);

  /* 6. a receipt can never drive a value below zero */
  const floor = await page.evaluate(() => {
    const local = JSON.parse(JSON.stringify(window.state));
    local.focusReductions.entries[0].total = 99999;
    local.focusReductions.entries[0].id = 'oversized';
    try { const out = window.mergeRemoteState(local, window.__remote); return { ok:true, total: out.totalFocusMin|0 }; }
    catch(e){ return { ok:false, code:e.code||null }; }
  });
  R.check('an oversized receipt cannot make a total negative',
    !floor.ok || floor.total >= 0, JSON.stringify(floor));

  /* 7. session-backed reductions still need no receipt at all */
  const tracked = await page.evaluate(async () => {
    const s = window.state;
    const before = s.totalFocusMin|0;
    const remote = JSON.parse(JSON.stringify(s));
    const rec = (s.sessionsLog||[]).filter(r=>r.taskId==='t_live'&&r.type==='focus')[0];
    await window.applySessionEdit(rec.id, (rec.minutes|0) - 120, { surface:'test' });
    const local = JSON.parse(JSON.stringify(s));
    const priorReceipts = (local.focusReductions.entries||[]).length;
    try {
      const out = window.mergeRemoteState(local, remote);
      return { ok:true, before, after: out.totalFocusMin|0, receipts:(local.focusReductions.entries||[]).length, priorReceipts };
    } catch(e){ return { ok:false, code:e.code||null, label:e.accountingLabel||null }; }
  });
  R.check('editing a session down still merges cleanly', tracked.ok, JSON.stringify(tracked));
  R.eq('and the edit carries across', tracked.before - tracked.after, 120);
  R.eq('no receipt was written for ledger-backed time', tracked.receipts, tracked.priorReceipts);

  R.check('no console errors throughout', problems.length === 0, problems.slice(0,3).join(' | '));
  await ctx.close();
} finally {
  await browser.close();
}
R.finish();
