/* scenes.mjs — the scene catalogue, which is now independent of the palette.
 *
 * A scene is a tile plus an optional drift. Because they are data, a typo in
 * one emoji list would ship a blank background that nobody notices until they
 * pick that scene. So: render every one, and check it actually paints.
 */
import { launch, openApp, makeReporter } from './harness.mjs';

const PORT = process.argv[2] || 8990;
const R = makeReporter('scenes.mjs');
const browser = await launch();
try {
  const { ctx, page, problems } = await openApp(browser, PORT, { settleMs: 5000 });
  const keys = await page.evaluate(() => Object.keys(window.SCENES || {}));
  R.check('the scene catalogue is exposed and populated', keys.length >= 12, `${keys.length} scenes`);

  const res = await page.evaluate(async (ks) => {
    const out = [];
    for (const k of ks){
      window.state.settings.theme = 'dark';          // same palette for all of them
      window.state.settings.scene = k;
      window.state.settings.bgStyle = 'pattern';
      window.state.settings.wallpaperMotion = true;
      window.applyTheme();
      await new Promise(r => setTimeout(r, 140));
      const img = document.getElementById('fh-wallpaper')?.style.backgroundImage || '';
      out.push({ k,
        tile: img.startsWith('url("data:image/png'),
        bytes: img.length,
        drifters: document.querySelectorAll('.fh-swimmer').length,
        animated: !!window.SCENES[k].motion,
        label: window.SCENES[k].label,
        resolved: window.fhActiveSceneKey() });
    }
    window.state.settings.scene = 'auto';
    return out;
  }, keys);

  const blank = res.filter(r => !r.tile || r.bytes < 2000);
  R.check('every scene paints a real tile', blank.length === 0,
    blank.length ? blank.map(b => b.k).join(', ') : `${res.length} tiles, smallest ${Math.min(...res.map(r=>r.bytes))}B`);

  const noDrift = res.filter(r => r.animated && r.drifters === 0);
  R.check('every animated scene actually spawns drifters', noDrift.length === 0,
    noDrift.length ? noDrift.map(n => n.k).join(', ') : `${res.filter(r=>r.animated).length} animated scenes`);

  const misresolved = res.filter(r => r.resolved !== r.k);
  R.check('an explicit scene choice is honoured exactly', misresolved.length === 0,
    misresolved.map(m => `${m.k}->${m.resolved}`).join(', ') || 'all exact');

  const unlabelled = res.filter(r => !r.label || !r.label.trim());
  R.check('every scene has a name for the picker', unlabelled.length === 0,
    unlabelled.map(u => u.k).join(', ') || 'all named');

  /* the picker must offer all of them plus Auto and None */
  const opts = await page.evaluate(async () => {
    window.openModal('theme-modal');
    await new Promise(r => setTimeout(r, 200));
    const sel = document.getElementById('cfg-scene');
    const values = sel ? [...sel.options].map(o => o.value) : [];
    window.closeModal('theme-modal');
    return values;
  });
  R.check('the picker lists Auto, None and every scene',
    opts.includes('auto') && opts.includes('none') && keys.every(k => opts.includes(k)),
    `${opts.length} options`);

  /* defaults must still resolve for every theme that claims one */
  const defaults = await page.evaluate(() => {
    const map = window.THEME_DEFAULT_SCENE || {};
    return Object.entries(map).filter(([, s]) => !window.SCENES[s]).map(([t, s]) => `${t}->${s}`);
  });
  R.check('every theme default points at a scene that exists', defaults.length === 0,
    defaults.join(', ') || 'all valid');

  R.check('no page errors or unexpected console errors', problems.length === 0,
    problems.length ? '\n      ' + problems.slice(0,6).join('\n      ') : 'clean');
  await ctx.close();
} finally { await browser.close(); }
R.finish();
