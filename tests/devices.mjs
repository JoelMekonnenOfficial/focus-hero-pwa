/* devices.mjs — it has to work on the phone AND the desktop.
 *
 * Every suite so far ran at one width. He uses Life XP on an iPhone and in
 * Opera on a computer, so a layout that only holds together at 1280px is half
 * a product. Checks the things that actually break across widths: content
 * escaping the viewport, panels that stop covering the screen, and controls
 * too small to hit with a thumb.
 */
import { launch, openApp, makeReporter } from './harness.mjs';
import { readFileSync } from 'node:fs';

const PORT = process.argv[2] || 8993;
const SRC = readFileSync(new URL('../starmax/index.html', import.meta.url),'utf8');
const MODALS = [...SRC.matchAll(/class="modal-backdrop" id="([a-z-]+)"/g)].map(m=>m[1]);
const SIZES = [
  { name:'iPhone portrait', w:390, h:844, touch:true },
  { name:'iPhone small',    w:360, h:780, touch:true },
  { name:'tablet',          w:820, h:1180, touch:true },
  { name:'desktop',         w:1440, h:900, touch:false }
];

const R = makeReporter('devices.mjs');
const browser = await launch();
try {
  const { ctx, page, problems } = await openApp(browser, PORT, { settleMs: 5000 });

  for (const s of SIZES){
    await page.setViewportSize({ width: s.w, height: s.h });
    await page.waitForTimeout(500);
    const out = await page.evaluate(async (ids) => {
      const de = document.documentElement;
      // horizontal overflow is the classic phone break
      const overflow = Math.max(0, de.scrollWidth - de.clientWidth);
      const wide = [...document.querySelectorAll('body *')].filter(e => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.right > de.clientWidth + 2;
      }).slice(0,3).map(e => e.id || (e.className||'').toString().slice(0,24) || e.tagName);
      // every panel must still cover the screen at this size
      const badModals = [];
      for (const id of ids){
        window.openModal(id);
        await new Promise(r => setTimeout(r, 25));
        const el = document.getElementById(id);
        const r = el.getBoundingClientRect();
        if (getComputedStyle(el).position !== 'fixed' ||
            r.width < window.innerWidth - 2 || r.height < window.innerHeight - 2) badModals.push(id);
        window.closeModal(id);
      }
      await new Promise(r => setTimeout(r, 40));
      // tap targets
      const small = [...document.querySelectorAll('button, .toggle, select')]
        .filter(e => { const r = e.getBoundingClientRect();
                       return r.width > 0 && r.height > 0 && (r.height < 24 || r.width < 24); })
        .slice(0,4).map(e => e.id || (e.textContent||'').trim().slice(0,18) || e.tagName);
      return { overflow, wide, badModals, small,
               appChildren: document.getElementById('app')?.children.length ?? -1 };
    }, MODALS);

    R.check(`${s.name} (${s.w}px): no horizontal overflow`,
      out.overflow <= 1, out.overflow ? `${out.overflow}px, widest: ${out.wide.join(', ')}` : 'clean');
    R.check(`${s.name}: every panel still covers the screen`,
      out.badModals.length === 0, out.badModals.join(', ') || `${MODALS.length} panels ok`);
    R.check(`${s.name}: the app renders`, out.appChildren > 0, `${out.appChildren} children`);
    if (s.touch){
      R.check(`${s.name}: no controls too small to tap`,
        out.small.length === 0, out.small.join(', ') || 'all >= 24px');
    }
  }

  R.check('no page errors or unexpected console errors across all sizes', problems.length === 0,
    problems.length ? '\n      ' + problems.slice(0,6).join('\n      ') : 'clean');
  await ctx.close();
} finally { await browser.close(); }
R.finish();
