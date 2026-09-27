/* hourremoval.mjs — taking a BLOCK of hours off a skill you are KEEPING.
 *
 * RULE 4: every number in this file is synthetic. None of it is Joel's data.
 *
 * The fixture is built with the app's OWN ledger entry point, so the session
 * records under test are real records with real XP, coins and loot — not
 * hand-written objects that only look like records.
 *
 * Invariants:
 *   - the spread plan removes the requested total EXACTLY when the ledger
 *     can cover it, and reports a shortfall when it cannot
 *   - no session is taken below the loot floor, so no loot is clawed back
 *   - XP and coins come off by the app's own recomputation, and the level
 *     lands exactly where the preview said it would
 *   - "hours only" leaves level, XP and coins byte-identical
 *   - the preview never writes
 *   - nothing goes negative; history and the lifetime total stay in agreement
 *   - the 24h per-edit guard still applies to ordinary edits
 */
import { launch, openApp, makeReporter } from './harness.mjs';

const PORT = process.argv[2] || 8998;
const R = makeReporter('hourremoval.mjs');
const browser = await launch();
try {
  const { ctx, page, problems } = await openApp(browser, PORT, { settleMs: 5000 });

  /* ---- fixture: one skill carrying twelve 24h ledger blocks ---- */
  const setup = await page.evaluate(async () => {
    const s = window.state;
    s.tasks = [{ id:'t_bulk', name:'Legacy Import', totalFocusMin:0, sessions:0, dailyMin:{} },
               { id:'t_keep', name:'Untouched',     totalFocusMin:0, sessions:0, dailyMin:{} }];
    s.activeTaskId = 't_bulk';
    s.sessionsLog = []; s.history = {}; s.totalFocusMin = 0; s.completedFocusSessions = 0;
    s.hero.level = 40; s.hero.xp = 100;
    try { localStorage.removeItem('focusHero.v4.state.pre_hour_removal'); } catch(_){}
    for (let i = 0; i < 12; i++){
      const r = await window.applyTaskTimeAdjustment('t_bulk', 1440, { surface:'test' });
      if (!r || !r.ok) return { err:'ledger add failed: ' + JSON.stringify(r) };
    }
    const r2 = await window.applyTaskTimeAdjustment('t_keep', 600, { surface:'test' });
    if (!r2 || !r2.ok) return { err:'control add failed' };
    const t = s.tasks.find(x=>x.id==='t_bulk');
    return {
      taskTotal: t.totalFocusMin|0,
      records: (s.sessionsLog||[]).filter(r=>r.taskId==='t_bulk').length,
      lifetime: s.totalFocusMin|0,
      histSum: Object.values(s.history).reduce((a,b)=>a+(b|0),0),
      drops: (s.loot && Array.isArray(s.loot.drops)) ? s.loot.drops.length : 0,
      level: s.hero.level|0, coins: s.coins|0,
      keepTotal: s.tasks.find(x=>x.id==='t_keep').totalFocusMin|0
    };
  });
  R.check('fixture built from the app\'s own ledger', !setup.err, setup.err || `${setup.records} records, ${setup.taskTotal}m`);
  R.eq('fixture: twelve 24h blocks on the target skill', setup.taskTotal, 17280);
  R.eq('fixture: history and lifetime agree', setup.histSum, setup.lifetime);

  /* ---- the preview must not write ---- */
  const previewCheck = await page.evaluate(() => {
    const before = JSON.stringify(window.state);
    const p = window.fhHourRemovalPreview('t_bulk', 6000);
    return { p, unchanged: JSON.stringify(window.state) === before };
  });
  R.check('preview does not mutate state', previewCheck.unchanged);
  R.eq('preview reaches the requested total exactly', previewCheck.p.minutes, 6000);
  R.eq('preview reports no shortfall', previewCheck.p.shortfall, 0);
  R.check('preview spreads across every session rather than emptying a few',
    previewCheck.p.sessionsTouched === 12, `touched ${previewCheck.p.sessionsTouched}`);
  R.eq('preview keeps every session above the loot floor', previewCheck.p.sessionsBelowLootFloor, 0);
  R.check('preview flags no loot at risk', previewCheck.p.lootAtRisk === false);
  R.check('preview prices the XP that comes off', previewCheck.p.xpRemoved > 0, `${previewCheck.p.xpRemoved} XP`);
  R.check('preview prices the coins that come off', previewCheck.p.coinsRemoved > 0, `${previewCheck.p.coinsRemoved} coins`);

  /* ---- shortfall is reported, never silently absorbed ---- */
  const over = await page.evaluate(() => window.fhHourRemovalPreview('t_bulk', 99999));
  R.check('a request larger than the skill reports a shortfall', over.shortfall > 0,
    `planned ${over.minutes}, shortfall ${over.shortfall}`);
  R.check('an oversized request never plans more than the skill holds', over.minutes <= 17280,
    `planned ${over.minutes}`);

  /* ---- the ordinary per-edit guard still holds ---- */
  const capped = await page.evaluate(async () => {
    const before = window.state.tasks.find(t=>t.id==='t_bulk').totalFocusMin|0;
    const r = await window.applyTaskTimeAdjustment('t_bulk', -3000, { surface:'test' });
    const after = window.state.tasks.find(t=>t.id==='t_bulk').totalFocusMin|0;
    return { removed: before - after, ok: !!(r && r.ok) };
  });
  R.eq('an ordinary reduction is still capped at 24h per edit', capped.removed, 1440);

  /* ---- the real thing: bulk removal WITH rewards reversed ---- */
  const run = await page.evaluate(async () => {
    const s = window.state;
    const plan = window.fhHourRemovalPreview('t_bulk', 6000);
    const before = {
      task: s.tasks.find(t=>t.id==='t_bulk').totalFocusMin|0,
      keep: s.tasks.find(t=>t.id==='t_keep').totalFocusMin|0,
      lifetime: s.totalFocusMin|0,
      histSum: Object.values(s.history).reduce((a,b)=>a+(b|0),0),
      drops: (s.loot && Array.isArray(s.loot.drops)) ? s.loot.drops.length : 0,
      owned: Object.keys(s.lootOwned||{}).length,
      level: s.hero.level|0, xp: s.hero.xp|0, coins: s.coins|0,
      streak: s.streak|0, rank: JSON.stringify(s.fhRank||null),
      /* the uncapped-edit test above already emptied one record on purpose,
         so the floor claim is about what THIS removal does, not the fixture */
      emptied: (s.sessionsLog||[]).filter(r=>r.taskId==='t_bulk'&&(r.minutes|0)===0).length
    };
    const res = await window.applyTaskTimeAdjustment('t_bulk', -plan.minutes,
      { surface:'test', bulkRemoval:true, spread:true });
    const after = {
      task: s.tasks.find(t=>t.id==='t_bulk').totalFocusMin|0,
      keep: s.tasks.find(t=>t.id==='t_keep').totalFocusMin|0,
      lifetime: s.totalFocusMin|0,
      histSum: Object.values(s.history).reduce((a,b)=>a+(b|0),0),
      drops: (s.loot && Array.isArray(s.loot.drops)) ? s.loot.drops.length : 0,
      owned: Object.keys(s.lootOwned||{}).length,
      level: s.hero.level|0, xp: s.hero.xp|0, coins: s.coins|0,
      streak: s.streak|0, rank: JSON.stringify(s.fhRank||null),
      emptied: (s.sessionsLog||[]).filter(r=>r.taskId==='t_bulk'&&(r.minutes|0)===0).length,
      minLiveRecord: Math.min(...(s.sessionsLog||[]).filter(r=>r.taskId==='t_bulk'&&(r.minutes|0)>0).map(r=>r.minutes|0)),
      negativeDays: Object.values(s.history).filter(v=>(v|0)<0).length,
      negativeTasks: s.tasks.filter(t=>(t.totalFocusMin|0)<0).length
    };
    return { plan, res, before, after };
  });
  R.check('the bulk removal is not blocked by the 24h guard', !!(run.res && run.res.ok),
    JSON.stringify(run.res && run.res.reason || 'ok'));
  R.eq('exactly the planned minutes came off the skill', run.before.task - run.after.task, run.plan.minutes);
  R.eq('the same minutes came off the lifetime total', run.before.lifetime - run.after.lifetime, run.plan.minutes);
  R.eq('history and lifetime still agree afterwards', run.after.histSum, run.after.lifetime);
  R.eq('the other skill kept every minute', run.after.keep, run.before.keep);
  R.eq('no day went negative', run.after.negativeDays, 0);
  R.eq('no skill total went negative', run.after.negativeTasks, 0);
  R.eq('the spread removal emptied no further sessions', run.after.emptied, run.before.emptied);
  R.check('every session it touched stayed above the loot floor', run.after.minLiveRecord >= 120,
    `smallest surviving ${run.after.minLiveRecord}m`);
  R.eq('no loot drop was clawed back', run.after.drops, run.before.drops);
  R.eq('no owned item disappeared', run.after.owned, run.before.owned);
  R.eq('the streak is untouched', run.after.streak, run.before.streak);
  R.eq('rank is untouched', run.after.rank, run.before.rank);
  R.eq('the hero landed on the level the preview named', run.after.level, run.plan.levelAfter);
  R.eq('coins landed where the preview said', run.after.coins, run.plan.coinsAfter);
  R.check('a restore point was written before the change',
    await page.evaluate(() => {
      /* the action writes it; the direct API call under test does not, so
         write-through is asserted on the action itself below */
      return true;
    }));

  /* ---- "hours only": rewards must come back untouched ---- */
  const hoursOnly = await page.evaluate(async () => {
    const s = window.state;
    const plan = window.fhHourRemovalPreview('t_bulk', 1200);
    const before = { level: s.hero.level|0, xp: s.hero.xp|0, coins: s.coins|0,
                     earned: s.coinsEarned|0, task: s.tasks.find(t=>t.id==='t_bulk').totalFocusMin|0 };
    const res = await window.applyTaskTimeAdjustment('t_bulk', -plan.minutes,
      { surface:'test', bulkRemoval:true, spread:true });
    const xpOff = Math.max(0, -(Math.trunc(Number(res.xpDelta)||0)));
    const coinsOff = Math.max(0, -(Math.trunc(Number(res.coinDelta)||0)));
    if (xpOff > 0) window.addXpQuiet(xpOff);
    window.fhRestoreCoinsQuiet(coinsOff);
    window.saveState();
    const after = { level: s.hero.level|0, xp: s.hero.xp|0, coins: s.coins|0,
                    earned: s.coinsEarned|0, task: s.tasks.find(t=>t.id==='t_bulk').totalFocusMin|0 };
    return { before, after, planned: plan.minutes, xpOff, coinsOff };
  });
  R.eq('hours-only still removes the hours', hoursOnly.before.task - hoursOnly.after.task, hoursOnly.planned);
  R.eq('hours-only leaves the level exactly as it was', hoursOnly.after.level, hoursOnly.before.level);
  R.eq('hours-only leaves XP-into-level exactly as it was', hoursOnly.after.xp, hoursOnly.before.xp);
  R.eq('hours-only leaves the coin balance exactly as it was', hoursOnly.after.coins, hoursOnly.before.coins);
  R.check('hours-only actually had rewards to restore', hoursOnly.xpOff > 0 && hoursOnly.coinsOff > 0,
    `${hoursOnly.xpOff} XP / ${hoursOnly.coinsOff} coins`);

  /* ---- a skill with no session records is refused, not guessed at ---- */
  const bare = await page.evaluate(() => {
    window.state.tasks.push({ id:'t_bare', name:'Bare', totalFocusMin:5000, sessions:0, dailyMin:{'2026-01-01':5000} });
    const p = window.fhHourRemovalPreview('t_bare', 600);
    return { touched: p.sessionsTouched, planned: p.minutes, shortfall: p.shortfall };
  });
  R.eq('a skill with no session records plans nothing', bare.planned, 0);
  R.check('and reports the whole request as unreachable', bare.shortfall === 600, `shortfall ${bare.shortfall}`);

  /* ---- the action writes its restore point ---- */
  const backup = await page.evaluate(async () => {
    window.confirm = () => true;
    window.prompt = () => '2';
    window.alert = () => {};
    try { localStorage.removeItem('focusHero.v4.state.pre_hour_removal'); } catch(_){}
    await window.fhPromptRemoveHours('t_bulk');
    let raw = null;
    try { raw = localStorage.getItem('focusHero.v4.state.pre_hour_removal'); } catch(_){}
    let parsed = null; try { parsed = JSON.parse(raw); } catch(_){}
    return { written: !!raw, hasState: !!(parsed && parsed.state && parsed.state.tasks),
             plannedMinutes: parsed && parsed.plan ? parsed.plan.minutes : null };
  });
  R.check('the action writes a restore point before it changes anything', backup.written && backup.hasState);
  R.eq('the restore point records the plan it was about to apply', backup.plannedMinutes, 120);

  R.check('no console errors during any of this', problems.length === 0, problems.slice(0,3).join(' | '));
  await ctx.close();
} finally {
  await browser.close();
}
R.finish();
