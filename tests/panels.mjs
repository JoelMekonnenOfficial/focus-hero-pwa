/* panels.mjs — every modal actually opens, on top, as an overlay.
 *
 * THIS TEST EXISTS BECAUSE I SHIPPED A BUILD WITHOUT IT.
 *
 * v10.50.0 added a decorative wallpaper layer and raised the app above it with
 *
 *     body>*:not(#fh-wallpaper):not(#fh-wallpaper-motion){position:relative;z-index:1}
 *
 * Every modal in this app is a direct child of <body>, so that rewrote
 * `position:fixed` to `position:relative` on all twelve. They stopped being
 * overlays and rendered as ordinary blocks in the page flow. Settings would not
 * open; Skills was an empty void. Every existing suite passed, because none of
 * them had ever opened a panel.
 *
 * So: open each one, and assert it is FIXED, on top, full-viewport and actually
 * hit-testable at its centre - not merely present in the DOM.
 */
import { launch, openApp, makeReporter } from './harness.mjs';
import { readFileSync } from 'node:fs';

const PORT = process.argv[2] || 8969;
const SRC = readFileSync('/home/claude/starmax/index.html', 'utf8');
const MODALS = [...SRC.matchAll(/class="modal-backdrop" id="([a-z-]+)"/g)].map(m => m[1]);

const R = makeReporter('panels.mjs');
const browser = await launch();
try {
  const { ctx, page, problems } = await openApp(browser, PORT, { settleMs: 5000 });
  R.check('found the modals in the markup', MODALS.length >= 10, `${MODALS.length}: ${MODALS.slice(0,4).join(', ')}…`);

  const results = await page.evaluate(async (ids) => {
    const out = [];
    for (const id of ids){
      const el = document.getElementById(id);
      if (!el){ out.push({ id, missing:true }); continue; }
      try { window.openModal(id); } catch(e){ out.push({ id, threw:String(e.message).slice(0,60) }); continue; }
      await new Promise(r => setTimeout(r, 40));
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const cx = Math.round(r.left + r.width/2), cy = Math.round(r.top + r.height/2);
      const hit = document.elementFromPoint(cx, cy);
      out.push({
        id,
        hidden: el.hidden,
        position: cs.position,
        z: Number(cs.zIndex) || 0,
        coversViewport: r.width >= window.innerWidth - 2 && r.height >= window.innerHeight - 2,
        hitInside: !!(hit && (hit === el || el.contains(hit)))
      });
      try { window.closeModal(id); } catch(_){}
      await new Promise(r => setTimeout(r, 20));
    }
    return out;
  }, MODALS);

  const missing = results.filter(r => r.missing || r.threw);
  R.check('every modal opens without throwing', missing.length === 0,
    missing.length ? missing.map(m => m.id + (m.threw ? ':' + m.threw : ' missing')).join(' | ') : `${results.length} opened`);

  const notFixed = results.filter(r => !r.missing && !r.threw && r.position !== 'fixed');
  R.check('every modal is a fixed overlay', notFixed.length === 0,
    notFixed.length ? notFixed.map(m => `${m.id}=${m.position}`).join(', ') : 'all fixed');

  const lowZ = results.filter(r => !r.missing && !r.threw && r.z < 10);
  R.check('every modal sits above the page', lowZ.length === 0,
    lowZ.length ? lowZ.map(m => `${m.id} z=${m.z}`).join(', ') : 'all above z=10');

  const notCovering = results.filter(r => !r.missing && !r.threw && !r.coversViewport);
  R.check('every modal covers the viewport', notCovering.length === 0,
    notCovering.length ? notCovering.map(m => m.id).join(', ') : 'all full-screen');

  const notHittable = results.filter(r => !r.missing && !r.threw && !r.hitInside);
  R.check('every modal is actually on top at its centre', notHittable.length === 0,
    notHittable.length ? notHittable.map(m => m.id).join(', ') : 'nothing covering them');

  /* A closed modal must take up NO room in the page.
     In the broken build all twelve were in-flow blocks with a dark
     rgba(2,5,4,.76) backdrop, so the document grew by thousands of pixels of
     near-black. Jumping to Skills landed you inside that - the "black void". */
  const flow = await page.evaluate((ids) => {
    ids.forEach(id => { try { window.closeModal(id); } catch(_){} });
    const laidOut = ids.filter(id => {
      const el = document.getElementById(id);
      if (!el) return false;
      const cs = getComputedStyle(el);
      return cs.display !== 'none' && cs.position !== 'fixed';
    });
    return { laidOut, docHeight: document.documentElement.scrollHeight, viewport: window.innerHeight };
  }, MODALS);
  R.check('a closed modal takes up no space in the page',
    flow.laidOut.length === 0,
    flow.laidOut.length ? flow.laidOut.join(', ') : `page is ${flow.docHeight}px, ${(flow.docHeight/flow.viewport).toFixed(1)} screens`);
  R.check('the page is not absurdly tall',
    flow.docHeight < flow.viewport * 12, `${flow.docHeight}px vs ${flow.viewport}px viewport`);

  /* and the wallpaper must still be behind, not on top of, the app */
  const layering = await page.evaluate(async () => {
    window.state.settings.theme = 'aquarium';
    window.state.settings.wallpaperOn = true;
    window.applyTheme();
    await new Promise(r => setTimeout(r, 200));
    const wp = document.getElementById('fh-wallpaper');
    const mid = document.elementFromPoint(Math.round(innerWidth/2), Math.round(innerHeight/2));
    window.openModal('settings-modal');
    await new Promise(r => setTimeout(r, 60));
    const overModal = document.elementFromPoint(Math.round(innerWidth/2), Math.round(innerHeight/2));
    const modal = document.getElementById('settings-modal');
    const onTop = !!(overModal && (overModal === modal || modal.contains(overModal)));
    window.closeModal('settings-modal');
    return { wpZ: getComputedStyle(wp).zIndex, wpBlocksPage: mid === wp, modalOnTopOfWallpaper: onTop };
  });
  R.eq('the wallpaper sits behind everything', layering.wpZ, '-1');
  R.check('the wallpaper never intercepts the page', layering.wpBlocksPage === false);
  R.check('a modal opens above the wallpaper', layering.modalOnTopOfWallpaper === true);

  R.check('no page errors or unexpected console errors', problems.length === 0,
    problems.length ? '\n      ' + problems.slice(0,6).join('\n      ') : 'clean');
  await ctx.close();
} finally { await browser.close(); }
R.finish();
