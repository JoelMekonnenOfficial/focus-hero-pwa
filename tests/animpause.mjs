/* animpause.mjs — nothing animates while Life XP is off-screen.
 *
 * Visibility is driven through CDP's Emulation.setPageVisibilityOverride, so
 * document.visibilityState really does flip and the browser's own behaviour is
 * what gets measured. (page.bringToFront() is NOT enough: a backgrounded tab
 * in this headless build keeps reporting "visible", which silently turns every
 * assertion below into a no-op.)
 *
 * The negative control matters as much as the pause: the focus timer, autosave
 * and cloud poll must keep running when the app is backgrounded. A "pause
 * everything" that also stopped the timer would be a far worse bug than the
 * battery drain it fixes.
 */
import { launch, openApp, makeReporter } from './harness.mjs';

const PORT = process.argv[2] || 8998;
const R = makeReporter('animpause.mjs');
const browser = await launch();
try {
  const { ctx, page, problems } = await openApp(browser, PORT, { settleMs: 5000 });
  const cdp = await ctx.newCDPSession(page);
  /* Prefer a real browser-driven visibility change. This headless build does
     not expose Emulation.setPageVisibilityOverride, and a background tab here
     keeps reporting "visible", so fall back to overriding the two properties
     the spec defines and firing the real event. That still exercises the whole
     controller and the CSS switch; what it cannot prove is Chromium's own
     throttling, which is not this app's code anyway. `visibilityPath` is
     printed so the run says which one it used rather than implying the
     stronger check always happened. */
  let visibilityPath = 'cdp';
  try { await cdp.send('Emulation.setPageVisibilityOverride', { visibility: 'visible' }); }
  catch(_){ visibilityPath = 'property-override'; }
  if (visibilityPath === 'property-override'){
    await page.addInitScript(() => {});
    await page.evaluate(() => {
      let hidden = false;
      Object.defineProperty(document, 'hidden', { configurable:true, get: () => hidden });
      Object.defineProperty(document, 'visibilityState', { configurable:true, get: () => hidden ? 'hidden' : 'visible' });
      window.__setHidden = (v) => { hidden = !!v; document.dispatchEvent(new Event('visibilitychange')); };
    });
  }
  const setVisible = async (visible) => {
    if (visibilityPath === 'cdp'){
      await cdp.send('Emulation.setPageVisibilityOverride', { visibility: visible ? 'visible' : 'hidden' });
    } else {
      await page.evaluate(v => window.__setHidden(!v), visible);
    }
  };
  console.log(`  ..    visibility driven by: ${visibilityPath}`);

  /* Plenty moving before anything is measured. */
  const visible = await page.evaluate(() => {
    try { document.documentElement.setAttribute('data-wallpaper','on'); } catch(_){}
    if (typeof window.fhApplyScene === 'function'){ try { window.fhApplyScene(); } catch(_){} }
    return window.fhAnimationDiag();
  });
  R.check('the app has animations running while it is on screen',
    visible.runningAnimations > 0, `${visible.runningAnimations} running`);
  R.eq('no off-screen attribute while visible', visible.attr, null);
  R.check('the presentation ticker is running while visible', visible.presentationTicker === true);
  const baselinePaused = visible.pausedAnimations;

  /* A real focus session, started the way the app starts one. */
  const started = await page.evaluate(() => {
    const s = window.state;
    if (!s.tasks.length) s.tasks = [{ id:'t_x', name:'Focus', totalFocusMin:0, sessions:0, dailyMin:{} }];
    s.activeTaskId = s.tasks[0].id;
    s.timer.mode = 'focus';
    s.timer.remaining = 3600;
    s.timer.running = false;
    window.startTimer();
    /* A running focus timer counts down from timer.endAt; timer.remaining is
       only rewritten when it pauses or completes, so reading that field would
       report "no progress" no matter what the app did. */
    return { running: !!s.timer.running, left: Math.round((s.timer.endAt - Date.now())/1000) };
  });
  R.check('a focus session is running for the negative control', started.running,
    `${started.left}s left`);

  /* Off screen, for real. */
  await setVisible(false);
  await page.waitForTimeout(3500);

  const hidden = await page.evaluate(() => ({
    diag: window.fhAnimationDiag(),
    visibility: document.visibilityState,
    timer: { running: !!(window.state.timer && window.state.timer.running),
             left: Math.round(((window.state.timer||{}).endAt - Date.now())/1000) }
  }));
  R.eq('the browser really reports the app as hidden', hidden.visibility, 'hidden');
  R.check('the app noticed it went off-screen', hidden.diag.offscreen === true);
  R.eq('the off-screen attribute is set', hidden.diag.attr, '1');
  R.eq('not one animation is still running', hidden.diag.runningAnimations, 0);
  R.check('and they are paused rather than removed',
    hidden.diag.pausedAnimations > baselinePaused,
    `${baselinePaused} → ${hidden.diag.pausedAnimations} paused`);
  R.eq('the once-a-second re-render is stopped', hidden.diag.presentationTicker, false);
  R.eq('the avatar burst loop is stopped', hidden.diag.burstTicker, false);
  R.eq('no transient canvas was left behind', hidden.diag.transientCanvases, 0);

  /* NEGATIVE CONTROL — the things that must keep running. */
  R.check('the focus timer is still running in the background', hidden.timer.running === true);
  R.check('and it is still counting down',
    hidden.timer.left < started.left,
    `${started.left}s → ${hidden.timer.left}s left`);

  /* Back on screen. */
  await setVisible(true);
  await page.waitForTimeout(2500);
  const back = await page.evaluate(() => window.fhAnimationDiag());
  R.check('animations resume when the app comes back',
    back.runningAnimations >= visible.runningAnimations,
    `${back.runningAnimations} running`);
  R.eq('the off-screen attribute is cleared', back.attr, null);
  R.eq('the presentation ticker restarts', back.presentationTicker, true);
  R.check('nothing is left stuck paused that was not paused before',
    back.pausedAnimations <= baselinePaused,
    `baseline ${baselinePaused}, now ${back.pausedAnimations}`);

  /* Hiding twice must not double-stop or leak a second ticker. */
  const repeat = await page.evaluate(() => {
    window.fhSetOffscreen(true);
    window.fhSetOffscreen(true);
    const mid = window.fhAnimationDiag();
    window.fhSetOffscreen(false);
    window.fhSetOffscreen(false);
    return { mid, end: window.fhAnimationDiag() };
  });
  R.check('setting off-screen twice is idempotent',
    repeat.mid.presentationTicker === false && repeat.end.presentationTicker === true,
    JSON.stringify({ mid: repeat.mid.presentationTicker, end: repeat.end.presentationTicker }));
  R.eq('and leaves the attribute correct at the end', repeat.end.attr, null);

  R.check('no console errors throughout', problems.length === 0, problems.slice(0,3).join(' | '));
  await ctx.close();
} finally {
  await browser.close();
}
R.finish();
