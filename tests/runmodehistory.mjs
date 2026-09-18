/* runmodehistory.mjs — the session editor has to read what the record actually
 * carries, not the one field that happens to be newest.
 *
 * RULE 4: every number here is synthetic. None of it is Joel's data.
 *
 * The reported bug: every older session opens its editor saying Locked In is
 * Off and Priority is Off, including sessions that plainly were not. The cause
 * is that rec.lockedInRun / rec.priorityRun only started being written when the
 * switches shipped; before that the truth lived in rec.lockedInPct (the rate
 * that actually paid the bonus) and rec.priorityVerified.
 *
 * The nastier half is the no-op guard: setSessionRunMode compared the request
 * against !!rec.lockedInRun, so asking it to turn Locked In OFF on a record
 * that never had the boolean was "already off" and returned without touching
 * the 25% that was really being paid. The switch looked broken because it was.
 *
 * Also checked here: a conflict that never resolves must not be reported as
 * one that resolves on its own.
 */
import { launch, openApp, makeReporter } from './harness.mjs';

const PORT = process.argv[2] || 8998;
const R = makeReporter('runmodehistory.mjs');
const browser = await launch();
try {
  const { ctx, page, problems } = await openApp(browser, PORT, { settleMs: 5000 });

  R.eq('the reader is exposed', await page.evaluate(() => typeof window.sessionLockedInState), 'function');
  R.eq('the priority reader is exposed', await page.evaluate(() => typeof window.sessionPriorityState), 'function');

  /* ---- 1. reading a legacy record ------------------------------------- */
  const reads = await page.evaluate(() => {
    const L = window.sessionLockedInState, P = window.sessionPriorityState;
    return {
      legacyRate:      L({ lockedInPct: 25 }),
      legacyZeroRate:  L({ lockedInPct: 0 }),
      breakdownOnly:   L({ xpBreakdown: { lockedInPct: 40 } }),
      explicitOff:     L({ lockedInRun: false, lockedInPct: 25 }),
      explicitOn:      L({ lockedInRun: true,  lockedInPct: 25 }),
      nothing:         L({ minutes: 60 }),
      prVerified:      P({ priorityVerified: true }),
      prVerifiedFalse: P({ priorityVerified: false }),
      prExplicitOff:   P({ priorityRun: false, priorityVerified: true }),
      prNothing:       P({ minutes: 60 })
    };
  });
  R.check('a stamped rate of 25% reads as Locked In ON',
    reads.legacyRate.on === true && reads.legacyRate.known === true && reads.legacyRate.pct === 25,
    JSON.stringify(reads.legacyRate));
  R.check('a stamped rate of 0% reads as OFF, and as known',
    reads.legacyZeroRate.on === false && reads.legacyZeroRate.known === true,
    JSON.stringify(reads.legacyZeroRate));
  R.check('a rate stamped only in the XP breakdown still counts',
    reads.breakdownOnly.on === true && reads.breakdownOnly.pct === 40,
    JSON.stringify(reads.breakdownOnly));
  R.check('an explicit false beats a leftover rate — turning it off must stick',
    reads.explicitOff.on === false && reads.explicitOff.known === true,
    JSON.stringify(reads.explicitOff));
  R.check('an explicit true is honoured', reads.explicitOn.on === true, JSON.stringify(reads.explicitOn));
  R.check('a record with no evidence reports UNKNOWN, not "off"',
    reads.nothing.on === false && reads.nothing.known === false,
    JSON.stringify(reads.nothing));
  R.check('priorityVerified true reads as Priority ON',
    reads.prVerified.on === true && reads.prVerified.known === true, JSON.stringify(reads.prVerified));
  R.check('priorityVerified false reads as OFF and known',
    reads.prVerifiedFalse.on === false && reads.prVerifiedFalse.known === true, JSON.stringify(reads.prVerifiedFalse));
  R.check('an explicit priorityRun false wins over a stale verified flag',
    reads.prExplicitOff.on === false, JSON.stringify(reads.prExplicitOff));
  R.check('no priority evidence reports UNKNOWN',
    reads.prNothing.on === false && reads.prNothing.known === false, JSON.stringify(reads.prNothing));

  /* ---- 2. the no-op guard, which is what he actually hit --------------- */
  const setup = await page.evaluate(async () => {
    const s = window.state;
    s.tasks = [{ id:'t_hist', name:'History', totalFocusMin:0, sessions:0, dailyMin:{}, lastUsedAt: Date.now() }];
    s.activeTaskId = 't_hist';
    s.sessionsLog = []; s.history = {}; s.totalFocusMin = 0; s.completedFocusSessions = 0;
    s.hero.level = 30; s.hero.xp = 200;
    s.settings.lockedInXpPct = 25;
    const r = await window.applyTaskTimeAdjustment('t_hist', 139, { surface:'test' });
    if (!r || !r.ok) return { err:'ledger add failed' };
    const rec = s.sessionsLog.filter(x=>x.type==='focus'&&x.taskId==='t_hist')[0];
    /* Make it look exactly like his 2026-09-15 20:16 record: a rate was
       applied and stamped, and neither boolean was ever written. */
    delete rec.lockedInRun; delete rec.priorityRun;
    rec.lockedInPct = 25;
    rec.priorityVerified = true;
    rec.xp = window.sessionEditXpPreview(rec, rec.minutes|0).xpAfter|0;
    return { id: rec.id, minutes: rec.minutes|0, xp: rec.xp|0 };
  });
  R.check('legacy-shaped fixture built', !setup.err, setup.err || `${setup.minutes}m worth ${setup.xp} XP`);

  const shown = await page.evaluate((id) => {
    const rec = window.state.sessionsLog.find(r=>r&&r.id===id);
    return { li: window.sessionLockedInState(rec), pr: window.sessionPriorityState(rec) };
  }, setup.id);
  R.check('the editor would now show Locked In ON for it', shown.li.on === true, JSON.stringify(shown.li));
  R.check('and Priority ON', shown.pr.on === true, JSON.stringify(shown.pr));

  const lifetime = () => page.evaluate((id) => {
    const xpForLevel = lv => Math.floor(100 * Math.pow(lv, 1.35));
    const s = window.state;
    let t = 0; for (let i = 1; i < (s.hero.level|0); i++) t += xpForLevel(i);
    const rec = s.sessionsLog.find(r=>r&&r.id===id) || {};
    return { lifetimeXp: t + (s.hero.xp|0), recXp: rec.xp|0, pct: rec.lockedInPct|0,
             lockedIn: window.sessionLockedInState(rec).on };
  }, setup.id);

  const before = await lifetime();
  const expectedOff = await page.evaluate((id) => {
    const rec = window.state.sessionsLog.find(r=>r&&r.id===id);
    const probe = { ...rec, lockedInRun:false, lockedInPct:0 };
    const info = window.sessionEditXpPreview(probe, rec.minutes|0);
    return info.willReward ? info.xpAfter|0 : 0;
  }, setup.id);

  const off = await page.evaluate(async (id) =>
    await window.setSessionRunMode(id, { lockedIn:false }), setup.id);
  const after = await lifetime();

  R.check('turning Locked In off on a legacy record is NOT reported as a no-op',
    !!(off && off.ok && !off.noChange), JSON.stringify(off));
  R.eq('the session is now flagged off', after.lockedIn, false);
  R.eq('its stamped rate is cleared', after.pct, 0);
  R.eq('its XP drops to the un-bonused figure', after.recXp, expectedOff);
  R.check('the bonus really came off the session', after.recXp < before.recXp,
    `${before.recXp} -> ${after.recXp}`);
  R.eq('and the hero lost exactly that much', before.lifetimeXp - after.lifetimeXp,
    before.recXp - after.recXp);

  /* Doing it a second time is now genuinely a no-op. */
  const again = await page.evaluate(async (id) =>
    await window.setSessionRunMode(id, { lockedIn:false }), setup.id);
  const afterAgain = await lifetime();
  R.check('repeating it is a no-op', !!(again && again.ok && again.noChange), JSON.stringify(again));
  R.eq('and nothing moved the second time', afterAgain.lifetimeXp, after.lifetimeXp);

  /* ---- 3. stop calling a permanent stop a self-healing race ------------ */
  const said = await page.evaluate(() => {
    const d = window.describeSyncFailure;
    return {
      accounting: d('Cloud accounting conflict in hero XP. Sync stopped before changing any data.'),
      race: d('supabase push 409: {"code":"409"}'),
      revision: d('Cloud update was not accepted at revision 23521; local progress is safe and queued'),
      size: d('supabase push 400: {"code":"23514","players_data_size_chk"}')
    };
  });
  R.check('an accounting conflict is no longer called a save race',
    !/winning the race/i.test(said.accounting), said.accounting);
  R.check('and is no longer promised to settle on its own',
    !/settles on its own/i.test(said.accounting), said.accounting);
  R.check('it says the totals disagree', /totals disagree/i.test(said.accounting), said.accounting);
  R.check('a real 409 still reads as a save race',
    /winning the race/i.test(said.race), said.race);
  R.check('a give-up-after-retries message is described honestly',
    !/settles on its own/i.test(said.revision), said.revision);
  R.check('the row-size explanation is untouched',
    /too large for one cloud row/i.test(said.size), said.size);

  R.check('no console errors throughout', problems.length === 0, problems.slice(0,3).join(' | '));
  await ctx.close();
} finally {
  await browser.close();
}

R.finish();
