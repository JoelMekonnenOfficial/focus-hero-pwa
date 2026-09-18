/* boot.mjs — the app comes up clean on a fresh profile.
 * usage: node tests/boot.mjs [port]
 */
import { launch, openApp, makeReporter } from './harness.mjs';

const PORT = process.argv[2] || 8960;
const R = makeReporter('boot.mjs');
const browser = await launch();

try {
  const { page, problems, consoleAll } = await openApp(browser, PORT);

  const probe = await page.evaluate(() => ({
    version: document.documentElement.getAttribute('data-app-version'),
    title: document.title,
    appChildren: document.getElementById('app')?.children.length ?? -1,
    hasState: !!window.state,
    hasHistory: !!window.state && typeof window.state.history === 'object',
    syncEnabled: !!window.state?.sync?.enabled,
    saveOk: (() => { try { return window.saveState._lastPrimarySave?.ok !== false; } catch(_) { return null; } })(),
    /* §8: top-level const is NOT a window property. These are function
       declarations and must be reachable; if one goes missing the module
       wiring has silently changed. */
    fns: ['saveState','renderAll','renderSyncStatus','scheduleCloudAfterDurableCommit',
          'cloudPush','applyTaskTimeAdjustment','createTask']
      .filter(k => typeof window[k] !== 'function')
  }));

  R.eq('data-app-version present', typeof probe.version, 'string');
  R.check('title names Life XP', /Life XP/.test(probe.title), probe.title);
  R.check('#app rendered children', probe.appChildren > 0, `children=${probe.appChildren}`);
  R.check('state hydrated', probe.hasState);
  R.check('state.history is an object (the minutes authority)', probe.hasHistory);
  R.check('fresh profile starts with sync off', probe.syncEnabled === false, `syncEnabled=${probe.syncEnabled}`);
  R.check('no durable save failure at boot', probe.saveOk !== false, `saveOk=${probe.saveOk}`);
  R.check('all expected globals are functions', probe.fns.length === 0, probe.fns.length ? `missing: ${probe.fns.join(', ')}` : 'all present');
  R.check('no page errors or unexpected console errors', problems.length === 0,
    problems.length ? '\n      ' + problems.slice(0, 10).join('\n      ') : `${consoleAll.length} benign lines`);
} finally {
  await browser.close();
}

R.finish();
