/* latestart.mjs — midnight is not the end of a late-started day.
 *
 * RULE 4: every number here is synthetic. None of it is Joel's data.
 *
 * The reported failure: a late start of 10:00 AM, and at 12:0x AM the next
 * calendar day every Hardcore bar read "0m of 240m today" — with ten hours of
 * that window still to run. The minutes were never lost (the audit judges a
 * day by its window, not the calendar), but the panel asked dayKey() for
 * "today" and dayKey() is the calendar date, so it had already moved on to a
 * day whose window does not open until 10:00 AM.
 *
 * RULE 2: the fixture has to span the real boundary. A test that only checks
 * 11 PM would pass against the broken build, because the bug only appears
 * after the date flips. Every assertion below is anchored to a clock time and
 * the clock is moved across midnight on purpose.
 */
import { launch, openApp, makeReporter } from './harness.mjs';

const PORT = process.argv[2] || 8998;
const R = makeReporter('latestart.mjs');
const browser = await launch();
try {
  const { ctx, page, problems } = await openApp(browser, PORT, { settleMs: 5000 });

  const api = await page.evaluate(() => ({
    hardcore: typeof window.FH_HARDCORE,
    activeDay: !!(window.FH_HARDCORE && typeof window.FH_HARDCORE.activeDay === 'function'),
    windowFor: !!(window.FH_HARDCORE && typeof window.FH_HARDCORE.windowFor === 'function')
  }));
  R.eq('the hardcore module is present', api.hardcore, 'object');
  R.check('it reports the day it considers active', api.activeDay && api.windowFor);

  /* Declare a 10:00 AM late start on a fixed date, then ask what each moment
     of the clock belongs to. Times are passed in rather than faked globally,
     so nothing else in the app has its clock moved underneath it. */
  const probe = await page.evaluate(() => {
    /* Yesterday and today, taken from the app's own calendar rather than
       written in. hcActiveDay() reads dayKey(), which builds `new Date()` and
       therefore ignores a faked Date.now - so a hard-coded pair only lines up
       on the one date it was written on. This suite went red at midnight for
       exactly that reason, with nothing wrong in the app. */
    const NEXT = window.FH_HARDCORE.calendarDay();
    const DAY  = window.fhDayShift(NEXT, -1);
    const s = window.state;
    s.lateStarts = { [DAY]: { startMin: 600, declaredAt: Date.parse(DAY + 'T10:00:00') } };
    const w = window.dayWindowFor(DAY);
    const wNext = window.dayWindowFor(NEXT);
    const at = (iso) => Date.parse(iso);
    return {
      day: DAY, next: NEXT,
      window: { from: new Date(w.fromMs).toISOString(), to: new Date(w.toMs).toISOString(),
                hours: Math.round(w.hours * 10) / 10, late: !!w.late },
      nextWindow: { from: new Date(wNext.fromMs).toISOString(), hours: Math.round(wNext.hours * 10) / 10,
                    carried: !!wNext.carried },
      /* the three moments that matter */
      beforeMidnight: at(DAY + 'T23:30:00'),
      afterMidnight:  at(NEXT + 'T00:20:00'),
      afterHandover:  at(NEXT + 'T10:30:00'),
      windowFrom: w.fromMs, windowTo: w.toMs, nextFrom: wNext.fromMs
    };
  });

  R.check('a 10:00 AM late start really does run a full 24 hours',
    probe.window.hours === 24 && probe.window.late,
    `${probe.window.from} → ${probe.window.to} (${probe.window.hours}h)`);
  R.check('and the next day does not open until that window closes',
    probe.nextFrom === probe.windowTo,
    `window closes ${probe.window.to}, next opens ${probe.nextWindow.from}`);

  /* THE BUG: 12:20 AM is inside the declared window, so it belongs to the
     15th — not to the 16th, whose window has not opened. */
  R.check('12:20 AM is still inside the declared window',
    probe.afterMidnight >= probe.windowFrom && probe.afterMidnight < probe.windowTo,
    `${new Date(probe.afterMidnight).toISOString()}`);
  R.check('and the 16th has not started yet at that moment',
    probe.afterMidnight < probe.nextFrom);

  /* Now the thing that was actually wrong: which day the panel calls today. */
  const days = await page.evaluate((p) => {
    const H = window.FH_HARDCORE;
    const orig = Date.now;
    const ask = (ms) => { try { Date.now = () => ms; return H.activeDay(); } finally { Date.now = orig; } };
    return { before: ask(p.beforeMidnight), after: ask(p.afterMidnight), handover: ask(p.afterHandover) };
  }, probe);

  R.eq('at 11:30 PM the active day is the late-started day', days.before, probe.day);
  R.eq('at 12:20 AM it is STILL that day, not the new calendar date', days.after, probe.day);
  R.eq('and once 10:00 AM passes, the new day takes over', days.handover, probe.next);

  /* With no late start anywhere, nothing about ordinary days may change. */
  const ordinary = await page.evaluate(() => {
    window.state.lateStarts = {};
    const H = window.FH_HARDCORE;
    return { active: H.activeDay(), calendar: H.calendarDay(), differs: H.activeDayDiffers() };
  });
  R.eq('without a late start the active day is just today', ordinary.active, ordinary.calendar);
  R.eq('and nothing reports a divergence', ordinary.differs, false);

  /* The minutes themselves were never the problem — prove they are credited
     to the window's owner, so the bar has something to show. */
  const credited = await page.evaluate((p) => {
    const s = window.state;
    s.lateStarts = { [p.day]: { startMin: 600, declaredAt: Date.parse(p.day + 'T10:00:00') } };
    s.history = s.history && typeof s.history === 'object' ? s.history : {};
    s.history[p.day] = 150;                       /* work done during the window */
    const H = window.FH_HARDCORE;
    const orig = Date.now;
    let active;
    try { Date.now = () => p.afterMidnight; active = H.activeDay(); } finally { Date.now = orig; }
    return { active, minutesOnActive: s.history[active] | 0, minutesOnCalendar: s.history[p.next] | 0 };
  }, probe);
  R.eq('the active day is the one holding the minutes', credited.active, probe.day);
  R.check('and it has them', credited.minutesOnActive === 150,
    `${credited.minutesOnActive}m on the active day, ${credited.minutesOnCalendar}m on the calendar date`);

  R.check('no console errors throughout', problems.length === 0, problems.slice(0,3).join(' | '));
  await ctx.close();
} finally {
  await browser.close();
}
R.finish();
