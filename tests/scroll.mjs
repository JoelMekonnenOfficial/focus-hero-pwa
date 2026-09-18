/* scroll.mjs — the scene must belong to the PAGE, not to the screen.
 *
 * With position:fixed the drifters travelled down the page with you as you
 * scrolled, so the whole scene appeared to slide around. Anchored to the
 * document, a drifter's position relative to the page must not change when you
 * scroll — only its position relative to the viewport does.
 */
import { launch, openApp, makeReporter } from './harness.mjs';
const PORT = process.argv[2] || 8993;
const R = makeReporter('scroll.mjs');
const browser = await launch();
try {
  const { ctx, page, problems } = await openApp(browser, PORT, { settleMs: 5000 });
  await page.setViewportSize({ width: 430, height: 820 });

  const out = await page.evaluate(async () => {
    window.state.settings.theme = 'aquarium';
    window.state.settings.scene = 'aquarium';
    window.state.settings.bgStyle = 'gradient';
    window.state.settings.wallpaperMotion = true;
    window.applyTheme();
    await new Promise(r => setTimeout(r, 400));
    // freeze so scrolling is the only variable
    document.querySelectorAll('.fh-swimmer').forEach(e => { e.style.animationPlayState = 'paused'; });
    const layer = document.getElementById('fh-wallpaper-motion');
    const read = () => [...document.querySelectorAll('.fh-swimmer')].map(e => {
      const r = e.getBoundingClientRect();
      return { viewport: Math.round(r.top), page: Math.round(r.top + window.scrollY) };
    });
    window.scrollTo(0, 0);
    await new Promise(r => setTimeout(r, 150));
    const before = read();
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const target = Math.min(600, Math.max(0, maxScroll));
    /* The layout settles for a beat after the first scroll, so ask twice and
       then measure what ACTUALLY happened rather than what was requested — a
       scroll that silently did not happen would make every assertion here
       pass for free. */
    window.scrollTo(0, target);
    await new Promise(r => setTimeout(r, 350));
    window.scrollTo(0, target);
    await new Promise(r => setTimeout(r, 450));
    const actuallyScrolled = Math.round(window.scrollY);
    const after = read();
    window.scrollTo(0, 0);
    return {
      layerPosition: getComputedStyle(layer).position,
      layerHeight: layer.getBoundingClientRect().height,
      docHeight: document.documentElement.scrollHeight,
      scrolled: actuallyScrolled,
      requested: target,
      pageDrift: before.map((b, i) => Math.abs(b.page - (after[i]?.page ?? 1e9))),
      viewportMoved: before.map((b, i) => b.viewport - (after[i]?.viewport ?? 0)),
      count: before.length
    };
  });

  R.eq('the scene layer is anchored to the document, not the viewport', out.layerPosition, 'absolute');
  R.check('the layer spans the whole page, not one screen',
    out.layerHeight >= out.docHeight - 4, `layer ${Math.round(out.layerHeight)}px vs document ${out.docHeight}px`);
  R.check('there is something to measure', out.count > 0, `${out.count} drifters`);
  R.check('the page genuinely scrolled — otherwise the rest proves nothing',
    out.scrolled > 100, `scrolled ${out.scrolled}px of ${out.requested}px requested`);

  const worstPageDrift = Math.max(...out.pageDrift, 0);
  R.check('a drifter keeps its place on the page while you scroll',
    worstPageDrift <= 2, `worst movement relative to the page: ${worstPageDrift}px`);

  const moved = out.viewportMoved.filter(v => Math.abs(v - out.scrolled) <= 2).length;
  R.check('and it scrolls out of view like the rest of the page',
    moved === out.count,
    `${moved}/${out.count} moved by exactly the ${out.scrolled}px scrolled`);

  R.check('no page errors or unexpected console errors', problems.length === 0,
    problems.length ? '\n      ' + problems.slice(0,5).join('\n      ') : 'clean');
  await ctx.close();
} finally { await browser.close(); }
R.finish();
