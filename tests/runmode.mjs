/* runmode.mjs — Locked In / Priority on a session already in the history.
 *
 * RULE 4: every number here is synthetic. None of it is Joel's data.
 *
 * What has to hold:
 *   - the controls actually exist in the session editor (they did not before;
 *     that is the reported bug)
 *   - turning Locked In on pays exactly the bonus the app's own formula says,
 *     no more, and turning it off takes exactly that back
 *   - it is reversible: on → off returns the hero to where it started
 *   - Priority changes no XP at all, matching a live run
 *   - nothing else moves: minutes, coins, loot, streak, task totals
 */
import { launch, openApp, makeReporter } from './harness.mjs';

const PORT = process.argv[2] || 8998;
const R = makeReporter('runmode.mjs');
const browser = await launch();
try {
  const { ctx, page, problems } = await openApp(browser, PORT, { settleMs: 5000 });

  const markup = await page.evaluate(() => ({
    lockedIn: !!document.querySelector('#btn-session-lockedin'),
    priority: !!document.querySelector('#btn-session-priority'),
    workout: !!document.querySelector('#btn-session-workout'),
    command: typeof window.setSessionRunMode
  }));
  R.check('the session editor has a Locked In control', markup.lockedIn);
  R.check('the session editor has a Priority control', markup.priority);
  R.check('the existing Workout control is still there', markup.workout);
  R.eq('the command is callable', markup.command, 'function');

  const setup = await page.evaluate(async () => {
    const s = window.state;
    s.tasks = [{ id:'t_run', name:'Run Mode', totalFocusMin:0, sessions:0, dailyMin:{}, lastUsedAt: Date.now() }];
    s.activeTaskId = 't_run';
    s.sessionsLog = []; s.history = {}; s.totalFocusMin = 0; s.completedFocusSessions = 0;
    s.hero.level = 30; s.hero.xp = 200;
    s.settings.lockedInXpPct = 25;
    const r = await window.applyTaskTimeAdjustment('t_run', 600, { surface:'test' });
    if (!r || !r.ok) return { err:'ledger add failed' };
    const rec = s.sessionsLog.filter(x=>x.type==='focus'&&x.taskId==='t_run')[0];
    return { id: rec.id, minutes: rec.minutes|0, xp: rec.xp|0,
             lockedIn: !!rec.lockedInRun, priority: !!rec.priorityRun };
  });
  R.check('fixture built', !setup.err, setup.err || `${setup.minutes}m worth ${setup.xp} XP`);
  R.eq('the session starts without Locked In', setup.lockedIn, false);

  /* Section 8: totalXpForLevel is a top-level `const` arrow, so it is NOT a
     window property. Reading window.totalXpForLevel returns undefined and the
     assertion would throw rather than measure. The curve is reproduced here
     from the app's own definition instead. */
  const snap = () => page.evaluate((id) => {
    const xpForLevel = lv => Math.floor(100 * Math.pow(lv, 1.35));
    const lifetimeXpOf = (lv, xp) => { let t = 0; for (let i = 1; i < lv; i++) t += xpForLevel(i); return t + (xp|0); };
    const s = window.state;
    const rec = s.sessionsLog.find(r=>r&&r.id===id) || {};
    const t = s.tasks.find(x=>x.id==='t_run') || {};
    return { recXp: rec.xp|0, lockedIn: !!rec.lockedInRun, pct: rec.lockedInPct|0,
             priority: !!rec.priorityRun, minutes: rec.minutes|0,
             heroLevel: s.hero.level|0, heroXp: s.hero.xp|0,
             lifetimeXp: lifetimeXpOf(s.hero.level|0, s.hero.xp|0),
             coins: s.coins|0, coinsEarned: s.coinsEarned|0,
             taskTotal: t.totalFocusMin|0, lifetime: s.totalFocusMin|0,
             streak: s.streak|0, loot: Object.keys(s.lootOwned||{}).length };
  }, setup.id);

  const before = await snap();

  /* What the app's own formula says the bonus is worth, computed independently
     of the command under test. */
  const expected = await page.evaluate((id) => {
    const rec = window.state.sessionsLog.find(r=>r&&r.id===id);
    const probe = { ...rec, lockedInRun:true, lockedInPct: window.lockedInPctNow(true) };
    const info = window.sessionEditXpPreview(probe, rec.minutes|0);
    return { xpAfter: info.willReward ? info.xpAfter|0 : 0, pct: window.lockedInPctNow(true) };
  }, setup.id);

  const on = await page.evaluate(async (id) => await window.setSessionRunMode(id, { lockedIn:true }), setup.id);
  const afterOn = await snap();

  R.check('turning Locked In on succeeds', !!(on && on.ok), JSON.stringify(on));
  R.eq('the session is flagged Locked In', afterOn.lockedIn, true);
  R.eq('it stamps the rate in force today', afterOn.pct, expected.pct);
  R.eq('the session is now worth exactly what the formula says', afterOn.recXp, expected.xpAfter);
  R.eq('the hero gained exactly that difference',
    afterOn.lifetimeXp - before.lifetimeXp, expected.xpAfter - before.recXp);
  R.eq('the reported delta matches what actually moved', on.xpDelta, expected.xpAfter - before.recXp);

  /* Nothing but XP may move. */
  R.eq('session minutes unchanged', afterOn.minutes, before.minutes);
  R.eq('task total unchanged', afterOn.taskTotal, before.taskTotal);
  R.eq('lifetime minutes unchanged', afterOn.lifetime, before.lifetime);
  R.eq('coins unchanged', afterOn.coins, before.coins);
  R.eq('coins earned unchanged', afterOn.coinsEarned, before.coinsEarned);
  R.eq('loot unchanged', afterOn.loot, before.loot);
  R.eq('streak unchanged', afterOn.streak, before.streak);

  /* Reversible. */
  const off = await page.evaluate(async (id) => await window.setSessionRunMode(id, { lockedIn:false }), setup.id);
  const afterOff = await snap();
  R.check('turning it back off succeeds', !!(off && off.ok), JSON.stringify(off));
  R.eq('the session is back to its original XP', afterOff.recXp, before.recXp);
  R.eq('and the hero is back exactly where it started', afterOff.lifetimeXp, before.lifetimeXp);
  R.eq('the level is back too', afterOff.heroLevel, before.heroLevel);

  /* Priority pays nothing. */
  const pr = await page.evaluate(async (id) => await window.setSessionRunMode(id, { priority:true }), setup.id);
  const afterPr = await snap();
  R.check('marking Priority succeeds', !!(pr && pr.ok), JSON.stringify(pr));
  R.eq('Priority is recorded', afterPr.priority, true);
  R.eq('Priority pays no XP', afterPr.lifetimeXp, before.lifetimeXp);
  R.eq('and moves no coins', afterPr.coins, before.coins);

  /* Setting the same value twice changes nothing. */
  const again = await page.evaluate(async (id) => await window.setSessionRunMode(id, { priority:true }), setup.id);
  const afterAgain = await snap();
  R.check('re-applying the same flag is a no-op', !!(again && again.ok && again.noChange), JSON.stringify(again));
  R.eq('and moves no XP', afterAgain.lifetimeXp, afterPr.lifetimeXp);

  /* A time-only skill never earns, so the control must refuse rather than mint. */
  const timeOnly = await page.evaluate(async (id) => {
    window.setTaskTimeOnly('t_run', true);
    const res = await window.setSessionRunMode(id, { lockedIn:true });
    const xpForLevel = lv => Math.floor(100 * Math.pow(lv, 1.35));
    let t = 0; for (let i = 1; i < (window.state.hero.level|0); i++) t += xpForLevel(i);
    const lifetime = t + (window.state.hero.xp|0);
    window.setTaskTimeOnly('t_run', false);
    return { res, lifetime };
  }, setup.id);
  R.check('a time-only skill refuses the Locked In bonus',
    timeOnly.res && timeOnly.res.ok === false && timeOnly.res.reason === 'time_only',
    JSON.stringify(timeOnly.res));
  R.eq('and no XP was minted by the attempt', timeOnly.lifetime, afterPr.lifetimeXp);

  R.check('no console errors throughout', problems.length === 0, problems.slice(0,3).join(' | '));
  await ctx.close();
} finally {
  await browser.close();
}
R.finish();
