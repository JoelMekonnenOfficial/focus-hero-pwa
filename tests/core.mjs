/* core.mjs — the accounting invariants that matter most in this codebase.
 *
 * §8: state.history[day] is the authority for minutes. sessionsLog is a
 * prunable working list. A minute must be counted ONCE, by exactly ONE day,
 * and must survive a reload. Switching any of this to sessionsLog is what
 * killed live runs before.
 *
 * usage: node tests/core.mjs [port]
 */
import { launch, openApp, makeReporter } from './harness.mjs';

const PORT = process.argv[2] || 8960;
const R = makeReporter('core.mjs');
const browser = await launch();

try {
  const { ctx, page, problems } = await openApp(browser, PORT);

  const before = await page.evaluate(() => {
    const t = window.createTask({ name: 'harness-task' });
    window.saveState();
    const day = Object.keys(window.state.history || {});
    return {
      taskId: t?.id ?? window.state.tasks[window.state.tasks.length - 1]?.id,
      totalFocusMin: window.state.totalFocusMin | 0,
      historyDays: day.length,
      logLen: (window.state.sessionsLog || []).length,
      completed: window.state.completedFocusSessions | 0
    };
  });
  R.check('createTask produced a task id', !!before.taskId, `id=${before.taskId}`);

  /* --- one logged block of time lands exactly once --- */
  const OP = 'harness_op_fixed_1';
  /* The shipped function is wrapped (index.html:22339, focus-economy.js:291)
     and the real caller awaits it. A test that forgets to await measures a
     Promise and reports nothing useful. */
  const add = await page.evaluate(async ({ taskId, OP }) => {
    const res = await window.applyTaskTimeAdjustment(taskId, 90, { operationId: OP, surface: 'harness' });
    const day = window.todayKey ? window.todayKey() : Object.keys(window.state.history).pop();
    const task = window.state.tasks.find(t => t.id === taskId);
    return {
      res,
      day,
      historyDay: window.state.history[day] | 0,
      totalFocusMin: window.state.totalFocusMin | 0,
      taskTotal: task?.totalFocusMin | 0,
      logLen: (window.state.sessionsLog || []).length,
      completed: window.state.completedFocusSessions | 0,
      minutesInLogForOp: (window.state.sessionsLog || [])
        .filter(r => r && r.manualOperationId === OP)
        .reduce((n, r) => n + (r.minutes | 0), 0)
    };
  }, { taskId: before.taskId, OP });

  R.check('adjustment reported ok', add.res?.ok === true, JSON.stringify(add.res?.reason ?? add.res?.ok));
  R.eq('state.history[today] gained exactly 90', add.historyDay, 90);
  R.eq('state.totalFocusMin gained exactly 90', add.totalFocusMin, before.totalFocusMin + 90);
  R.eq('task.totalFocusMin gained exactly 90', add.taskTotal, 90);
  R.eq('exactly one session record carries the 90', add.minutesInLogForOp, 90);
  R.eq('sessionsLog grew by exactly one', add.logLen, before.logLen + 1);
  R.eq('completed session count grew by exactly one', add.completed, before.completed + 1);

  /* --- replaying the same operationId must not double-count --- */
  const replay = await page.evaluate(async ({ taskId, OP }) => {
    const res = await window.applyTaskTimeAdjustment(taskId, 90, { operationId: OP, surface: 'harness' });
    const day = window.todayKey ? window.todayKey() : Object.keys(window.state.history).pop();
    return {
      res,
      historyDay: window.state.history[day] | 0,
      totalFocusMin: window.state.totalFocusMin | 0,
      logLen: (window.state.sessionsLog || []).length
    };
  }, { taskId: before.taskId, OP });

  R.check('replay is recognised as a duplicate', replay.res?.duplicate === true, JSON.stringify(replay.res));
  R.eq('replay did not move state.history', replay.historyDay, 90);
  R.eq('replay did not move totalFocusMin', replay.totalFocusMin, add.totalFocusMin);
  R.eq('replay did not append a session record', replay.logLen, add.logLen);

  /* --- it has to still be there after a reload (same context, so
         localStorage AND IndexedDB persist — that is the point) --- */
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => !!window.state && typeof window.saveState === 'function', null, { timeout: 30000 });
  await page.waitForTimeout(4000);

  const after = await page.evaluate(({ taskId }) => {
    const day = window.todayKey ? window.todayKey() : Object.keys(window.state.history).pop();
    const task = window.state.tasks.find(t => t.id === taskId);
    return {
      historyDay: window.state.history[day] | 0,
      totalFocusMin: window.state.totalFocusMin | 0,
      taskTotal: task?.totalFocusMin | 0
    };
  }, { taskId: before.taskId });

  R.eq('history survived reload', after.historyDay, 90);
  R.eq('totalFocusMin survived reload', after.totalFocusMin, add.totalFocusMin);
  R.eq('task total survived reload', after.taskTotal, 90);

  R.check('no page errors or unexpected console errors', problems.length === 0,
    problems.length ? '\n      ' + problems.slice(0, 10).join('\n      ') : 'clean');

  await ctx.close();
} finally {
  await browser.close();
}

R.finish();
