/* audit.mjs — due-diligence pass over a realistic session of play.
 *
 * Not a unit test: this drives the app the way a person does and checks that
 * the accounting invariants the handoff cares about still hold afterwards, and
 * that nothing leaks or throws along the way.
 */
import { launch, openApp, makeReporter } from './harness.mjs';
import { readFileSync } from 'node:fs';

const PORT = process.argv[2] || 8976;
const SRC = readFileSync('/home/claude/starmax/index.html','utf8');
const listOf = n => {
  const m = new RegExp('const '+n+'\\s*=\\s*\\[([^\\]]*)\\]').exec(SRC);
  return m ? m[1].split(',').map(x=>x.trim().replace(/^["']|["']$/g,'')).filter(Boolean) : [];
};
const MODALS = [...SRC.matchAll(/class="modal-backdrop" id="([a-z-]+)"/g)].map(m=>m[1]);

const R = makeReporter('audit.mjs');
const browser = await launch();
let rejections = 0;
try {
  const { ctx, page, problems } = await openApp(browser, PORT, { settleMs: 6000 });
  page.on('pageerror', () => rejections++);

  /* --- a realistic run: make a skill, log time, edit it, replay it --- */
  const acct = await page.evaluate(async () => {
    /* todayKey is a top-level const, so it is NOT on window (§8) - and the
       app's day boundary shifts for a late start, so guessing the date here
       would be wrong anyway. Diff the ledger instead and let the app say
       which day it used. */
    const snapshot = () => JSON.stringify(window.state.history || {});
    const histBefore = JSON.parse(snapshot());
    const before = {
      total: window.state.totalFocusMin|0,
      sessions: window.state.completedFocusSessions|0
    };
    const t = window.createTask({ name:'audit-skill' });
    const id = t?.id ?? window.state.tasks[window.state.tasks.length-1].id;
    await window.applyTaskTimeAdjustment(id, 45, { operationId:'audit_a', surface:'audit' });
    await window.applyTaskTimeAdjustment(id, 30, { operationId:'audit_b', surface:'audit' });
    await window.applyTaskTimeAdjustment(id, 45, { operationId:'audit_a', surface:'audit' }); // replay
    const histAfter = window.state.history || {};
    let dayDelta = 0, touched = [];
    for (const k of new Set([...Object.keys(histBefore), ...Object.keys(histAfter)])){
      const d = (histAfter[k]|0) - (histBefore[k]|0);
      if (d !== 0){ dayDelta += d; touched.push(k); }
    }
    const after = {
      total: window.state.totalFocusMin|0,
      dayDelta, touched,
      sessions: window.state.completedFocusSessions|0
    };
    const logged = (window.state.sessionsLog||[])
      .filter(r=>r && /^audit_/.test(r.manualOperationId||''))
      .reduce((n,r)=>n+(r.minutes|0),0);
    return { before, after, logged, taskId:id };
  });
  R.eq('minutes land exactly once (75, not 120)', acct.after.total - acct.before.total, 75);
  R.eq('the day ledger agrees with the total', acct.after.dayDelta, 75);
  R.eq('the minutes landed on exactly one day', acct.after.touched.length, 1);
  R.eq('the session log agrees too', acct.logged, 75);
  R.eq('a replayed operation adds no session', acct.after.sessions - acct.before.sessions, 2);

  /* --- every modal opens and closes cleanly in sequence --- */
  const modalRun = await page.evaluate(async (ids) => {
    let errs = [];
    for (const id of ids){
      try { window.openModal(id); await new Promise(r=>setTimeout(r,25)); window.closeModal(id); }
      catch(e){ errs.push(id+': '+e.message); }
    }
    const stillOpen = ids.filter(id => { const el=document.getElementById(id); return el && !el.hidden; });
    return { errs, stillOpen };
  }, MODALS);
  R.check('every panel opens and closes without error', modalRun.errs.length===0, modalRun.errs.join(' | ')||`${MODALS.length} panels`);
  R.check('no panel is left open', modalRun.stillOpen.length===0, modalRun.stillOpen.join(', ')||'all closed');

  /* --- timer leak check across heavy navigation --- */
  const leaks = await page.evaluate(async (args) => {
    let live = 0;
    const oi = window.setInterval, ci = window.clearInterval;
    window.setInterval = function(){ live++; return oi.apply(this, arguments); };
    window.clearInterval = function(){ live--; return ci.apply(this, arguments); };
    const start = live;
    for (let pass=0; pass<3; pass++){
      for (const t of args.themes.slice(0,8)){ window.state.settings.theme=t; window.applyTheme(); }
      for (const l of args.layouts){ if (typeof window.setLayout==='function') window.setLayout(l); }
      for (const id of args.modals.slice(0,5)){ window.openModal(id); window.closeModal(id); }
      await new Promise(r=>setTimeout(r,20));
    }
    window.setInterval = oi; window.clearInterval = ci;
    return { net: live - start };
  }, { themes: listOf('VALID_THEMES'), layouts: listOf('PRIMARY_LAYOUTS'), modals: MODALS });
  R.check('heavy navigation leaks no repeating timers', leaks.net <= 0, `net new intervals: ${leaks.net}`);

  /* --- state must be durable and self-consistent after all that --- */
  const integrity = await page.evaluate(async () => {
    await window.saveStateDurable({ source:'audit' });
    await new Promise(r=>setTimeout(r,200));
    const s = window.state;
    const histSum = Object.values(s.history||{}).reduce((a,b)=>a+(b|0),0);
    const negatives = Object.entries(s.history||{}).filter(([,v])=>(v|0)<0).map(([k])=>k);
    const taskSum = (s.tasks||[]).reduce((a,t)=>a+(t.totalFocusMin|0),0);
    return {
      saveOk: window.saveState._lastPrimarySave?.ok !== false,
      histSum, total: s.totalFocusMin|0, taskSum,
      negatives,
      badDays: Object.keys(s.history||{}).filter(k=>!/^\d{4}-\d{2}-\d{2}$/.test(k))
    };
  });
  R.check('the durable save succeeded', integrity.saveOk === true);
  R.eq('day ledger sums to the lifetime total', integrity.histSum, integrity.total);
  R.check('no negative minutes on any day', integrity.negatives.length===0, integrity.negatives.join(', ')||'none');
  R.check('every history key is a real date', integrity.badDays.length===0, integrity.badDays.join(', ')||'all valid');

  /* --- and it all survives a reload --- */
  await page.reload({ waitUntil:'load' });
  await page.waitForFunction(()=>!!window.state && typeof window.saveState==='function', null, { timeout:30000 });
  await page.waitForTimeout(4500);
  const after = await page.evaluate((id)=>{
    const t=(window.state.tasks||[]).find(x=>x.id===id);
    return { total: window.state.totalFocusMin|0, task: t?.totalFocusMin|0, theme: window.state.settings.theme };
  }, acct.taskId);
  R.eq('the lifetime total survives a reload', after.total, acct.after.total);
  R.eq('the skill total survives a reload', after.task, 75);

  R.check('no unhandled page errors during the whole run', rejections===0, `${rejections} page errors`);
  R.check('no unexpected console errors', problems.length===0,
    problems.length ? '\n      '+problems.slice(0,8).join('\n      ') : 'clean');
  await ctx.close();
} finally { await browser.close(); }
R.finish();
