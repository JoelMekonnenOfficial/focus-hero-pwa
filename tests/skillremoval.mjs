/* skillremoval.mjs — deleting a skill AND the hours it logged.
 *
 * This is the operation that destroyed data once before, so it is tested
 * against a fixture built to look like the real case: a skill whose minutes
 * are spread over many days, mixed in with other skills' minutes on the same
 * days. RULE 4: everything here is synthetic. No figure in this file is Joel's.
 *
 * The invariants that matter:
 *   - minutes come off EXACTLY, day by day, from the skill's own ledger
 *   - other skills' minutes on those same days are untouched
 *   - nothing goes negative, ever
 *   - XP, coins, loot, streak and rank are not touched
 *   - a backup exists before anything changes
 *   - the lifetime total and the day ledger stay in agreement
 */
import { launch, openApp, makeReporter } from './harness.mjs';

const PORT = process.argv[2] || 8998;
const R = makeReporter('skillremoval.mjs');
const browser = await launch();
try {
  const { ctx, page, problems } = await openApp(browser, PORT, { settleMs: 5000 });

  const setup = await page.evaluate(async () => {
    const s = window.state;
    /* 40 days: the target skill on 25 of them, another skill on all 40, so
       every affected day also carries minutes that must survive. */
    s.history = {}; s.tasks = []; s.totalFocusMin = 0; s.completedFocusSessions = 0;
    const day = i => new Date(Date.UTC(2026, 4, 1 + i)).toISOString().slice(0,10);
    const target = { id:'t_target', name:'Rest', totalFocusMin:0, sessions:25, dailyMin:{} };
    const other  = { id:'t_other',  name:'Study', totalFocusMin:0, sessions:40, dailyMin:{} };
    for (let i = 0; i < 40; i++){
      const d = day(i);
      const otherMin = 60 + (i % 7) * 10;
      other.dailyMin[d] = otherMin; other.totalFocusMin += otherMin;
      let targetMin = 0;
      if (i < 25){ targetMin = 30 + (i % 5) * 20; target.dailyMin[d] = targetMin; target.totalFocusMin += targetMin; }
      s.history[d] = otherMin + targetMin;
      s.totalFocusMin += otherMin + targetMin;
    }
    s.completedFocusSessions = 65;
    s.tasks = [target, other];
    s.hero = s.hero || {}; s.hero.xp = 5000; s.hero.level = 20;
    s.coins = 1234; s.streak = 40; s.longestStreak = 40;
    s.lootOwned = new Array(10).fill(0).map((_,i)=>({ id:'l'+i }));
    try { localStorage.removeItem('focusHero.v4.state.pre_skill_time_removal'); } catch(_){}
    await window.saveStateDurable({ source:'skillremoval-test' });
    return { totalBefore: s.totalFocusMin, targetTotal: target.totalFocusMin,
             otherTotal: other.totalFocusMin, days: Object.keys(s.history).length,
             histSumBefore: Object.values(s.history).reduce((a,b)=>a+b,0) };
  });
  R.check('fixture built: target skill spread over many days, mixed with another',
    setup.targetTotal > 0 && setup.otherTotal > 0,
    `${setup.days} days, target ${setup.targetTotal}m, other ${setup.otherTotal}m`);
  R.eq('the fixture starts self-consistent', setup.histSumBefore, setup.totalBefore);

  /* the plan must be derived from the skill's own ledger, not a guess */
  const plan = await page.evaluate(() => {
    const t = window.state.tasks.find(x=>x.id==='t_target');
    const p = window.fhSkillTimeFootprint(t);
    return { minutes:p.minutes, days:p.days.length, covers:p.ledgerCoversTotal, emptied:p.daysEmptied.length };
  });
  R.eq('the plan matches the skill total exactly', plan.minutes, setup.targetTotal);
  R.check('the per-day ledger accounts for the whole total', plan.covers === true);
  R.check('it knows which days would empty', plan.emptied === 0, `${plan.emptied} would empty`);

  /* run it */
  const after = await page.evaluate(async () => {
    const before = {
      xp: window.state.hero.xp, coins: window.state.coins, streak: window.state.streak,
      loot: window.state.lootOwned.length, sessions: window.state.completedFocusSessions
    };
    window.deleteTask('t_target', { confirmMsg:false, alsoRemoveTime:true });
    await new Promise(r => setTimeout(r, 400));
    const s = window.state;
    const other = s.tasks.find(x=>x.id==='t_other');
    const histSum = Object.values(s.history).reduce((a,b)=>a+(b|0),0);
    const negatives = Object.entries(s.history).filter(([,v])=>(v|0)<0).map(([k])=>k);
    let otherIntact = true;
    for (const [d,m] of Object.entries(other.dailyMin)){ if ((s.history[d]|0) < (m|0)) otherIntact = false; }
    let backup = null;
    try { backup = JSON.parse(localStorage.getItem('focusHero.v4.state.pre_skill_time_removal')||'null'); } catch(_){}
    return {
      before,
      totalAfter: s.totalFocusMin, histSum, negatives,
      taskGone: !s.tasks.some(t=>t.id==='t_target'),
      tombstoned: !!(s.taskTombstones && s.taskTombstones['t_target']),
      otherIntact, otherTotal: other.totalFocusMin,
      xp: s.hero.xp, coins: s.coins, streak: s.streak, loot: s.lootOwned.length,
      sessions: s.completedFocusSessions,
      backupHasState: !!(backup && backup.state && backup.state.totalFocusMin)
    };
  });

  R.check('the skill is gone', after.taskGone);
  R.check('and tombstoned, so sync cannot hand it back', after.tombstoned);
  R.eq('the lifetime total dropped by exactly the skill total',
    setup.totalBefore - after.totalAfter, setup.targetTotal);
  R.eq('the day ledger still sums to the lifetime total', after.histSum, after.totalAfter);
  R.check('no day went negative', after.negatives.length === 0, after.negatives.join(', ') || 'none');
  R.check('the other skill kept every one of its minutes', after.otherIntact === true);
  R.eq('the other skill total is untouched', after.otherTotal, setup.otherTotal);
  R.eq('XP untouched', after.xp, after.before.xp);
  R.eq('coins untouched', after.coins, after.before.coins);
  R.eq('loot untouched', after.loot, after.before.loot);
  R.eq('streak untouched', after.streak, after.before.streak);
  R.eq('session count dropped by the skill\'s own count', after.before.sessions - after.sessions, 25);
  R.check('a full backup was written before anything changed', after.backupHasState === true);

  /* and the default is still to KEEP the hours */
  const keep = await page.evaluate(async () => {
    const s = window.state;
    const t = { id:'t_keep', name:'Keeper', totalFocusMin:120, sessions:2, dailyMin:{ '2026-07-01':120 } };
    s.tasks.push(t); s.history['2026-07-01'] = 120; s.totalFocusMin += 120;
    const before = s.totalFocusMin;
    window.deleteTask('t_keep', { confirmMsg:false });     // no alsoRemoveTime
    await new Promise(r => setTimeout(r, 250));
    return { gone: !s.tasks.some(x=>x.id==='t_keep'), totalBefore: before, totalAfter: s.totalFocusMin };
  });
  R.check('deleting without the option still keeps the hours',
    keep.gone && keep.totalAfter === keep.totalBefore,
    `total ${keep.totalBefore} -> ${keep.totalAfter}`);

  R.check('no page errors or unexpected console errors', problems.length === 0,
    problems.length ? '\n      ' + problems.slice(0,6).join('\n      ') : 'clean');
  await ctx.close();
} finally { await browser.close(); }
R.finish();
