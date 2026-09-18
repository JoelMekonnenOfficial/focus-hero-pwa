/* quietalarms.mjs — the app must stop shouting about things that are fine.
 *
 * RULE 4: every number here is synthetic. None of it is Joel's data.
 *
 * Two false alarms, both measured on a real device this afternoon:
 *
 *   1. "Cloud sync has been failing for 44 minutes. Your other devices are not
 *      seeing this progress." The cause was the daily transfer cap — a budget
 *      the app sets for itself. Nothing was failing. And the cap was being
 *      spent by background revision checks, which read a couple of hundred
 *      bytes and were billed as if they were 267 KB profile downloads. Three
 *      devices checking every ten minutes is 432 a day against a ceiling of
 *      250, so the cap was unreachable-by-design: hit every afternoon, forever.
 *
 *   2. "This page is running an older version. Close and reopen the app to
 *      finish updating." ×4, on a page that was running the NEWER version.
 *      HTML is network-first, so during a deploy the page arrives new while
 *      the old worker is briefly still in charge — and the app read that
 *      backwards.
 */
import { launch, openApp, makeReporter } from './harness.mjs';

const PORT = process.argv[2] || 8998;
const R = makeReporter('quietalarms.mjs');
const browser = await launch();
try {
  const { ctx, page, problems } = await openApp(browser, PORT, { settleMs: 5000 });

  /* ---- 1. a peek is not a download --------------------------------------- */
  const api = await page.evaluate(() => ({
    budget: typeof window.FH_CLOUD_BUDGET === 'object' ? window.FH_CLOUD_BUDGET : null,
    usage: typeof window.fhCloudUsage
  }));
  R.check('the budget separates peeks from full transfers',
    !!(api.budget && api.budget.peekPerDay > api.budget.perDay),
    JSON.stringify(api.budget));
  R.check('and the peek ceiling clears three devices checking every 10 minutes',
    !!(api.budget && api.budget.peekPerDay >= 3 * 144),
    `peekPerDay=${api.budget && api.budget.peekPerDay}, need >= 432`);

  const pools = await page.evaluate(() => {
    localStorage.removeItem(window.FH_CLOUD_BUDGET.key);
    const out = {};
    for (let i = 0; i < 500; i++) window.fhCloudBudgetCount('peek');
    out.afterPeeks = window.fhCloudUsage();
    out.fullStillAllowed = window.fhCloudBudgetBlock('push');
    for (let i = 0; i < 5; i++) window.fhCloudBudgetCount('pull');
    out.afterPulls = window.fhCloudUsage();
    return out;
  });
  R.eq('500 background checks are recorded as peeks', pools.afterPeeks.peekDay, 500);
  R.eq('and cost the full-transfer pool nothing', pools.afterPeeks.day, 0);
  R.check('so a real save is still allowed after 500 checks',
    pools.fullStillAllowed === null, String(pools.fullStillAllowed));
  R.eq('full transfers are counted in their own pool', pools.afterPulls.day, 5);

  const ceiling = await page.evaluate(() => {
    localStorage.removeItem(window.FH_CLOUD_BUDGET.key);
    const out = {};
    for (let i = 0; i < window.FH_CLOUD_BUDGET.perDay; i++) window.fhCloudBudgetCount('pull');
    out.fullBlocked = window.fhCloudBudgetBlock('push');
    out.peekStillOk = window.fhCloudBudgetBlock('peek');
    localStorage.removeItem(window.FH_CLOUD_BUDGET.key);
    return out;
  });
  R.check('the daily ceiling that protects the quota is unchanged and still bites',
    typeof ceiling.fullBlocked === 'string' && /Catching up/.test(ceiling.fullBlocked),
    String(ceiling.fullBlocked));
  R.check('but exhausting it does not stop the cheap checks',
    ceiling.peekStillOk === null, String(ceiling.peekStillOk));

  /* ---- 2. a deliberate pause is not an outage ---------------------------- */
  const worded = await page.evaluate(() => {
    const s = window.state;
    const note = 'Catching up: 250 cloud transfers today is more than expected, so Life XP paused to protect your cloud usage. Nothing is lost and nothing is wrong - it resumes by itself.';
    s.sync.enabled = true;
    /* The panel reports "generate a sync code" ahead of everything else when
       there is none, so the fixture needs one to reach the status branch at
       all. Synthetic, like every other value in this file. */
    s.sync.syncCode = 'TEST-CODE-0000';
    s.sync.lastSyncError = note;
    s.sync.pendingSync = true;
    s.sync.pendingSince = Date.now() - 44 * 60000;
    const th = window.fhSyncThrottled();
    const described = window.describeSyncFailure(note);
    window.renderSyncStatus();
    const panel = document.querySelector('#sync-status');
    return { throttled: !!th, described, panelText: panel ? panel.textContent : '',
             panelState: panel ? panel.dataset.state : '' };
  });
  R.check('a budget pause is recognised as deliberate', worded.throttled, JSON.stringify(worded.throttled));
  R.check('its own wording is passed through untouched',
    /Catching up/.test(worded.described) && !/winning the race/.test(worded.described), worded.described);
  R.check('the panel does NOT say sync has been failing',
    !/failing/i.test(worded.panelText), worded.panelText);
  R.check('nor that other devices are not seeing the progress',
    !/not seeing/i.test(worded.panelText), worded.panelText);
  R.check('it says it is a short break and everything is saved',
    /short break/i.test(worded.panelText) && /saved/i.test(worded.panelText), worded.panelText);
  R.check('and it is not flagged as a stale/error state',
    worded.panelState !== 'stale', worded.panelState);


  /* ---- 4. fixing the accounting must release what it already stopped ----- */
  const migrated = await page.evaluate(() => {
    const key = window.FH_CLOUD_BUDGET.key;
    /* A ledger in the OLD shape: no peek array, full of entries that were
       really cheap checks, and a 24-hour block it earned under that rule. */
    const old = { t: [], blockedUntil: Date.now() + 20 * 3600000,
                  note: 'Catching up: 250 cloud transfers today is more than expected.' };
    for (let i = 0; i < 250; i++) old.t.push(Date.now() - i * 60000);
    localStorage.setItem(key, JSON.stringify(old));
    const usage = window.fhCloudUsage();
    const allowed = window.fhCloudBudgetBlock('push');
    const stored = JSON.parse(localStorage.getItem(key) || 'null');
    return { day: usage.day, blockedUntil: usage.blockedUntil, allowed,
             hasPeekArray: Array.isArray(stored && stored.p) };
  });
  R.eq('a pre-split ledger is discarded, not carried forward', migrated.day, 0);
  R.eq('and the pause it created goes with it', migrated.blockedUntil, 0);
  R.check('so the device can sync again immediately', migrated.allowed === null, String(migrated.allowed));
  R.check('and the ledger is rewritten in the new shape', migrated.hasPeekArray);

  /* A ledger already in the new shape must be left completely alone. */
  const preserved = await page.evaluate(() => {
    const key = window.FH_CLOUD_BUDGET.key;
    const now = Date.now();
    localStorage.setItem(key, JSON.stringify({ t: [now - 1000, now - 2000], p: [now - 500], blockedUntil: 0, note: '' }));
    const u = window.fhCloudUsage();
    return { day: u.day, peekDay: u.peekDay };
  });
  R.eq('an up-to-date ledger keeps its full transfers', preserved.day, 2);
  R.eq('and its peeks', preserved.peekDay, 1);

  /* The owner can end a pause they did not really cause. */
  const resumed = await page.evaluate(() => {
    const key = window.FH_CLOUD_BUDGET.key;
    const now = Date.now();
    const t = []; for (let i = 0; i < 260; i++) t.push(now - i * 60000);
    localStorage.setItem(key, JSON.stringify({ t, p: [], blockedUntil: now + 20 * 3600000, note: 'Catching up: paused.' }));
    window.state.sync.lastSyncError = 'Catching up: 250 cloud transfers today is more than expected.';
    const blockedBefore = window.fhCloudBudgetBlock('push');
    const ok = window.fhBudgetResumeNow();
    const blockedAfter = window.fhCloudBudgetBlock('push');
    const ledgerKept = window.fhCloudUsage().day;
    /* And the override must expire on its own rather than becoming permanent. */
    const stored = JSON.parse(localStorage.getItem(key));
    stored.graceUntil = Date.now() - 1000;
    localStorage.setItem(key, JSON.stringify(stored));
    const blockedAfterGrace = window.fhCloudBudgetBlock('push');
    localStorage.removeItem(key);
    return { blockedBefore: typeof blockedBefore === 'string', ok,
             blockedAfter: typeof blockedAfter === 'string', ledgerKept,
             blockedAfterGrace: typeof blockedAfterGrace === 'string',
             err: window.state.sync.lastSyncError };
  });
  R.check('a paused device is genuinely blocked first', resumed.blockedBefore);
  R.check('the owner can release it', resumed.ok === true);
  R.check('and it syncs immediately afterwards', resumed.blockedAfter === false);
  R.eq('the ledger itself is NOT wiped — a real runaway still re-pauses', resumed.ledgerKept, 260);
  R.check('and the pause message is cleared', !resumed.err, String(resumed.err));
  R.check('the override expires by itself — it is a window, not a switch',
    resumed.blockedAfterGrace === true, String(resumed.blockedAfterGrace));

  /* A REAL outage must still be reported as one. */
  const realOutage = await page.evaluate(() => {
    const s = window.state;
    s.sync.lastSyncError = 'Failed to fetch';
    s.sync.pendingSince = Date.now() - 44 * 60000;
    const th = window.fhSyncThrottled();
    window.renderSyncStatus();
    const panel = document.querySelector('#sync-status');
    return { throttled: !!th, text: panel ? panel.textContent : '', state: panel ? panel.dataset.state : '' };
  });
  R.eq('a genuine outage is not mistaken for a pause', realOutage.throttled, false);
  R.check('and is still reported plainly', /not reaching the cloud/i.test(realOutage.text), realOutage.text);

  /* ---- 3. which way round is the version mismatch ------------------------ */
  const cmp = await page.evaluate(() => {
    const C = window.fhBuildCompare;
    const older = 'fh-2026-09-16-v10-62-5-applied-register';
    const newer = 'fh-2026-09-17-v10-63-1-quiet-alarms';
    return {
      pageNewer: C(newer, older),
      pageOlder: C(older, newer),
      same: C(newer, newer),
      sameDayVersionBump: C('fh-2026-09-17-v10-63-1-x', 'fh-2026-09-17-v10-63-0-y'),
      unknown: C('garbage', 'also-garbage'),
      oneUnknown: C(newer, 'garbage')
    };
  });
  R.eq('a newer page is detected as newer', cmp.pageNewer, 1);
  R.eq('an older page is detected as older', cmp.pageOlder, -1);
  R.eq('identical builds compare equal', cmp.same, 0);
  R.eq('a same-day version bump is ordered by version', cmp.sameDayVersionBump, 1);
  R.eq('two unparseable ids compare equal rather than guessing', cmp.unknown, 0);
  R.eq('one unparseable id also refuses to guess', cmp.oneUnknown, 0);

  R.check('the once-per-build suppression is exposed',
    await page.evaluate(() => typeof window.fhStaleNoticeSeen === 'function' &&
                               typeof window.fhMarkStaleNotice === 'function'));
  const suppress = await page.evaluate(() => {
    const id = 'fh-2026-09-17-v10-63-1-quiet-alarms';
    localStorage.removeItem('fh.staleNotice.v1');
    const before = window.fhStaleNoticeSeen(id);
    window.fhMarkStaleNotice(id);
    const after = window.fhStaleNoticeSeen(id);
    const other = window.fhStaleNoticeSeen('fh-2026-09-18-v10-64-0-x');
    localStorage.removeItem('fh.staleNotice.v1');
    return { before, after, other };
  });
  R.eq('the first notice for a build is allowed', suppress.before, false);
  R.eq('the second is suppressed — no more stacks of four', suppress.after, true);
  R.eq('but a genuinely new build can still speak up', suppress.other, false);

  /* The budget's own "paused" warning is this suite deliberately exhausting
     the ceiling, not a defect. Named rather than filtered silently. */
  const real = problems.filter(t => !/\[fh-budget\] cloud transfers paused|\[fh-sync\] stuck for/.test(t));
  R.check('no console errors beyond the budget warning this suite provokes',
    real.length === 0, real.slice(0,3).join(' | '));
  await ctx.close();
} finally {
  await browser.close();
}
