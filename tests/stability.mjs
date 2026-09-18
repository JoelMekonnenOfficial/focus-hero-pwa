/* stability.mjs — the combinations a real person actually hits.
 * 24 themes x 6 primary layouts, plus the clock styles, watching for thrown
 * errors and for anything that silently falls back. Cheap insurance before a
 * week of daily use.
 */
import { launch, openApp, makeReporter } from './harness.mjs';
import { readFileSync } from 'node:fs';

/* VALID_THEMES, PRIMARY_LAYOUTS and CLOCK_STYLES are top-level `const`, so they
 * are NOT window properties (§11). Read them out of the source rather than
 * asking the page for them - a test that reads `undefined` here would loop zero
 * times and report a pass. */
const SRC = readFileSync(new URL('../starmax/index.html', import.meta.url), 'utf8');
const listOf = name => {
  const m = new RegExp('const ' + name + '\\s*=\\s*\\[([^\\]]*)\\]').exec(SRC);
  if (!m) throw new Error('could not read ' + name + ' from source');
  return m[1].split(',').map(x => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
};
const THEMES = listOf('VALID_THEMES'), LAYOUTS = listOf('PRIMARY_LAYOUTS'), CLOCKS = listOf('CLOCK_STYLES');
const PORT = process.argv[2] || 8967;
const R = makeReporter('stability.mjs');
const browser = await launch();
try {
  const { ctx, page, problems } = await openApp(browser, PORT, { settleMs: 5000 });
  const res = await page.evaluate(async ({ themes, layouts, clocks }) => {
    const bad = [], thrown = [];
    for (const t of themes){
      for (const l of layouts){
        try {
          window.state.settings.theme = t;
          window.state.settings.layout = l;
          window.applyTheme();
          if (typeof window.setLayout === 'function') window.setLayout(l);
          await new Promise(r=>setTimeout(r,12));
          const root = document.documentElement;
          const applied = root.getAttribute('data-theme');
          const want = t === 'auto' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light':'dark') : t;
          if (applied !== want) bad.push(`${t}/${l} -> ${applied}`);
          if (!document.getElementById('app')?.children.length) bad.push(`${t}/${l} empty app`);
        } catch(e){ thrown.push(`${t}/${l}: ${e.message}`); }
      }
    }
    for (const c of clocks){
      try { window.state.settings.clockStyle = c; window.applyClockStyle();
        if (document.documentElement.getAttribute('data-clock') !== c) bad.push(`clock ${c}`);
      } catch(e){ thrown.push(`clock ${c}: ${e.message}`); }
    }
    return { combos: themes.length*layouts.length, bad, thrown, themes: themes.length, layouts: layouts.length };
  }, { themes: THEMES, layouts: LAYOUTS, clocks: CLOCKS });
  R.check('every theme x layout combination renders',
    res.bad.length === 0, res.bad.length ? res.bad.slice(0,6).join(' | ') : `${res.combos} combinations (${res.themes} themes x ${res.layouts} layouts)`);
  R.check('nothing throws while switching', res.thrown.length === 0,
    res.thrown.length ? res.thrown.slice(0,5).join(' | ') : 'clean');
  R.check('no page errors or unexpected console errors', problems.length === 0,
    problems.length ? '\n      ' + problems.slice(0,8).join('\n      ') : 'clean');
  await ctx.close();
} finally { await browser.close(); }
R.finish();
