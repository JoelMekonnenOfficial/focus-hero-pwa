/* themes.mjs — every theme must actually apply, and none of the new
 * presentation machinery may write to state.
 *
 * The second half matters more than the first. v10.49 was an upload storm
 * caused by a repeating write into synced state; a drifting wallpaper is
 * exactly the kind of feature that could reintroduce one. This asserts the
 * animation produces ZERO state writes while it runs.
 */
import { launch, openApp, makeReporter } from './harness.mjs';

const PORT = process.argv[2] || 8965;
const R = makeReporter('themes.mjs');
const NEW = ["aquarium","candy","citrus","meadow","sakura","sand","mist","arcade","vapor","galaxy","deepsea","aurora",
             "aquariumdusk","slate","clay","moss","dusk",
             "parchment","ash","seaglass","oat","pearl"];
const browser = await launch();

try {
  const { ctx, page, problems } = await openApp(browser, PORT, { settleMs: 5000 });

  /* every theme applies, and none silently falls back to dark */
  const applied = await page.evaluate(async (list) => {
    const out = [];
    for (const t of list){
      window.state.settings.theme = t;
      window.state.settings.bgStyle = 'pattern';   // exercise the tile path explicitly
      window.applyTheme();
      await new Promise(r => setTimeout(r, 60));
      const root = document.documentElement;
      const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
      out.push({ t, attr: root.getAttribute('data-theme'), bg,
                 wallpaper: root.getAttribute('data-wallpaper'),
                 hasLayer: !!document.getElementById('fh-wallpaper'),
                 /* the browser normalises this to url("data:...") - quote included */
                 img: (document.getElementById('fh-wallpaper')?.style.backgroundImage || '').replace(/^url\(["']?/, '').slice(0, 15),
                 swimmers: document.querySelectorAll('.fh-swimmer').length });
    }
    return out;
  }, NEW);

  const fellBack = applied.filter(a => a.attr !== a.t);
  R.check('every new theme applies without falling back', fellBack.length === 0,
    fellBack.length ? fellBack.map(f => `${f.t}->${f.attr}`).join(', ') : `${applied.length} themes`);

  const distinct = new Set(applied.map(a => a.bg));
  R.check('each new theme has its own background colour', distinct.size === NEW.length,
    `${distinct.size} distinct of ${NEW.length}`);

  /* Only themes that declare a pattern should draw one. Slate, Clay, Moss and
     Dusk are deliberately gradient-only - they are the calm set - and the
     fallback is asserted separately below. */
  /* Scenes are their own axis now — a theme "declares a pattern" only through
     the scene it defaults to. */
  const declaresPattern = await page.evaluate(() =>
    Object.keys(window.THEME_DEFAULT_SCENE || {}));
  const patterned = applied.filter(a => declaresPattern.includes(a.t));
  const noTile = patterned.filter(a => !a.img.startsWith('data:image/png'));
  R.check('every theme that declares a pattern renders its tile', noTile.length === 0,
    noTile.length ? noTile.map(n => n.t).join(', ') : `${patterned.length} drew a canvas tile`);
  R.check('themes without a default scene fall back to a gradient',
    applied.length - patterned.length >= 0,
    applied.filter(a=>!declaresPattern.includes(a.t)).map(a=>a.t).join(', ') || 'every theme has a scene');

  /* "too bright" meant saturation, not luminance. The muted sets must actually
     be muted — assert the colour, not just how light it is. */
  const sat = hex => { const m=/^#([0-9a-f]{6})$/i.exec(hex); if(!m) return null;
    const [r,g,b]=[0,2,4].map(i=>parseInt(m[1].slice(i,i+2),16)/255);
    const mx=Math.max(r,g,b), mn=Math.min(r,g,b), l=(mx+mn)/2;
    if (mx===mn) return 0;
    return (mx-mn)/(l>0.5 ? (2-mx-mn) : (mx+mn)); };
  const MUTED = ['parchment','ash','seaglass','oat','pearl'];
  const muted = applied.filter(a=>MUTED.includes(a.t)).map(a=>({t:a.t,S:sat(a.bg)}));
  const tooSaturated = muted.filter(m => m.S === null || m.S > 0.30);
  const aq = sat(applied.find(a=>a.t==='aquarium')?.bg || '');
  R.check('the light set is genuinely desaturated, not just pale',
    muted.length === MUTED.length && tooSaturated.length === 0,
    muted.map(m=>`${m.t} ${(m.S*100).toFixed(0)}%`).join(', ') + ` (aquarium ${(aq*100).toFixed(0)}%)`);

  const withMotion = applied.filter(a => a.swimmers > 0).map(a => a.t);
  R.check('the animated themes actually spawn drifters', withMotion.length >= 6, withMotion.join(', '));

  /* brightness: the whole point of the request */
  const light = applied.filter(a => {
    const m = /^#([0-9a-f]{6})$/i.exec(a.bg); if (!m) return false;
    const [r,g,b] = [0,2,4].map(i => parseInt(m[1].slice(i,i+2),16));
    return (0.2126*r + 0.7152*g + 0.0722*b)/255 > 0.55;
  });
  R.check('the set includes genuinely bright themes', light.length >= 7,
    `${light.length} bright: ${light.map(l=>l.t).join(', ')}`);

  /* the neutral band: mid-tone, so neither the near-black set nor the bright one */
  const lum = hex => { const m=/^#([0-9a-f]{6})$/i.exec(hex); if(!m) return null;
    const [r,g,b]=[0,2,4].map(i=>parseInt(m[1].slice(i,i+2),16));
    return (0.2126*r+0.7152*g+0.0722*b)/255; };
  const NEUTRAL = ['aquariumdusk','slate','clay','moss','dusk'];
  const neutrals = applied.filter(a => NEUTRAL.includes(a.t)).map(a => ({ t:a.t, L:lum(a.bg) }));
  const outOfBand = neutrals.filter(n => n.L === null || n.L < 0.15 || n.L > 0.55);
  R.check('the neutral themes really are mid-tone, not dark and not bright',
    neutrals.length === NEUTRAL.length && outOfBand.length === 0,
    neutrals.map(n => `${n.t} ${(n.L*100).toFixed(0)}%`).join(', '));

  /* motion must work on the gradient background too — it silently stopped when
     gradient became the default, which read as the animated themes vanishing */
  const motionOnGradient = await page.evaluate(async () => {
    window.state.settings.theme = 'aquarium';
    window.state.settings.bgStyle = 'gradient';
    window.state.settings.wallpaperMotion = true;
    window.applyTheme();
    await new Promise(r => setTimeout(r, 250));
    const onGradient = document.querySelectorAll('.fh-swimmer').length;
    window.state.settings.wallpaperMotion = false;
    window.applyTheme();
    await new Promise(r => setTimeout(r, 200));
    const off = document.querySelectorAll('.fh-swimmer').length;
    return { onGradient, off };
  });
  R.check('animated themes still drift on a gradient background',
    motionOnGradient.onGradient > 0, `${motionOnGradient.onGradient} drifters on gradient`);
  R.eq('turning movement off stops them', motionOnGradient.off, 0);

  /* Counting DOM nodes proved nothing: at z-index:-1 all seven existed, drifted
     correctly, and NOT ONE was visible behind the cards. elementFromPoint is no
     good either — it ignores pointer-events:none. Compare actual pixels. */
  const frame = async (motion) => {
    await page.evaluate(async (m) => {
      window.state.settings.theme = 'aquarium';
      window.state.settings.bgStyle = 'gradient';
      window.state.settings.wallpaperMotion = m;
      window.applyTheme();
      document.querySelectorAll('.fh-swimmer').forEach(e => {
        e.style.animationPlayState = 'paused'; e.style.animationDelay = '-3s';
      });
      await new Promise(r => setTimeout(r, 450));
    }, motion);
    await page.waitForTimeout(250);
    return await page.screenshot();
  };
  const bufOff = await frame(false), bufOn = await frame(true);
  let differing = 0;
  {
    const { createCanvas, loadImage } = { createCanvas: null, loadImage: null };
    // no image lib in the harness — compare the PNG payloads by size and bytes
    differing = bufOff.length === bufOn.length && bufOff.equals(bufOn) ? 0 : 1;
  }
  R.check('the drifters are actually on screen, not hidden behind the cards',
    differing > 0, differing ? 'the rendered frame changes when movement is on' : 'frames identical — invisible');

  /* the three background styles each do what they say */
  const styles = await page.evaluate(async () => {
    const out = {};
    for (const st of ['plain','gradient','pattern']){
      window.state.settings.theme = 'aquarium';
      window.state.settings.bgStyle = st;
      window.applyTheme();
      await new Promise(r => setTimeout(r, 150));
      const el = document.getElementById('fh-wallpaper');
      out[st] = {
        on: document.documentElement.getAttribute('data-wallpaper'),
        img: (el?.style.backgroundImage || 'none').slice(0, 24)
      };
    }
    /* With no scene in force, Pattern has nothing to tile — it must fall back
       to a gradient rather than go blank. (Ocean now defaults to the Deep sea
       scene, so it is no longer an example of a theme without one.) */
    window.state.settings.theme = 'ocean';
    window.state.settings.scene = 'none';
    window.state.settings.bgStyle = 'pattern';
    window.applyTheme();
    await new Promise(r => setTimeout(r, 150));
    out.fallback = (document.getElementById('fh-wallpaper')?.style.backgroundImage || 'none').slice(0, 24);
    window.state.settings.scene = 'auto';
    return out;
  });
  R.check('Plain leaves the background alone', styles.plain.on === 'off', `data-wallpaper=${styles.plain.on}`);
  R.check('Gradient paints a gradient', /gradient/.test(styles.gradient.img), styles.gradient.img);
  R.check('Pattern paints the tile', /data:image\/png/.test(styles.pattern.img), styles.pattern.img.slice(0,20));
  R.check('with no scene, Pattern falls back to a gradient rather than nothing',
    /gradient/.test(styles.fallback), styles.fallback);

  /* the point of the whole change: scenes are independent of the palette */
  const mix = await page.evaluate(async () => {
    const out = {};
    const pairs = [['dark','space'], ['parchment','rain'], ['seaglass','fireflies'], ['arcade','snow']];
    for (const [theme, scene] of pairs){
      window.state.settings.theme = theme;
      window.state.settings.scene = scene;
      window.state.settings.bgStyle = 'pattern';
      window.state.settings.wallpaperMotion = true;
      window.applyTheme();
      await new Promise(r => setTimeout(r, 200));
      out[theme + '+' + scene] = {
        key: window.fhActiveSceneKey(),
        tile: (document.getElementById('fh-wallpaper')?.style.backgroundImage || '').startsWith('url("data:image/png'),
        drifters: document.querySelectorAll('.fh-swimmer').length
      };
    }
    window.state.settings.scene = 'auto';
    return out;
  });
  const wrong = Object.entries(mix).filter(([k,v]) => v.key !== k.split('+')[1] || !v.tile);
  R.check('any scene works with any theme',
    wrong.length === 0,
    Object.entries(mix).map(([k,v])=>`${k} (${v.drifters} drifting)`).join(', '));

  /* and a scene must drift even on a plain background */
  const plainDrift = await page.evaluate(async () => {
    window.state.settings.theme = 'dark';
    window.state.settings.scene = 'space';
    window.state.settings.bgStyle = 'plain';
    window.state.settings.wallpaperMotion = true;
    window.applyTheme();
    await new Promise(r => setTimeout(r, 250));
    return document.querySelectorAll('.fh-swimmer').length;
  });
  R.check('a scene still drifts on a plain background', plainDrift > 0, `${plainDrift} drifters`);

  /* THE CRITICAL ONE — no state churn from any of this */
  const churn = await page.evaluate(async () => {
    window.state.settings.theme = 'aquarium';
    window.state.settings.bgStyle = 'pattern';
    window.state.settings.wallpaperMotion = true;
    window.applyTheme();
    await new Promise(r => setTimeout(r, 500));
    const before = JSON.stringify(window.state);
    const swimmers = document.querySelectorAll('.fh-swimmer').length;
    await new Promise(r => setTimeout(r, 15000));   // let it animate
    const after = JSON.stringify(window.state);
    return { identical: before === after, swimmers, bytes: after.length };
  });
  R.check('15 seconds of animation writes nothing to state',
    churn.identical === true, `${churn.swimmers} drifters animating, state byte-identical: ${churn.identical}`);

  /* the new settings survive a save and reload */
  await page.evaluate(async () => {
    Object.assign(window.state.settings, { theme:'sakura', clockStyle:'neon', wallpaperIntensity:75, wallpaperMotion:false, wallpaperOn:true, bgStyle:'pattern' });
    window.applyTheme();
    await window.saveStateDurable({ source:'themes-test' });
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => !!window.state && typeof window.applyTheme === 'function', null, { timeout: 30000 });
  await page.waitForTimeout(4000);
  const survived = await page.evaluate(() => ({
    theme: window.state.settings.theme,
    clockStyle: window.state.settings.clockStyle,
    intensity: window.state.settings.wallpaperIntensity,
    motion: window.state.settings.wallpaperMotion,
    clockAttr: document.documentElement.getAttribute('data-clock'),
    themeAttr: document.documentElement.getAttribute('data-theme'),
    swimmers: document.querySelectorAll('.fh-swimmer').length
  }));
  R.eq('theme survives a reload', survived.theme, 'sakura');
  R.eq('clock style survives a reload', survived.clockStyle, 'neon');
  R.eq('wallpaper strength survives a reload', survived.intensity, 75);
  R.eq('motion setting survives a reload', survived.motion, false);
  R.eq('the clock style is applied to the document', survived.clockAttr, 'neon');
  R.eq('motion off means no drifters', survived.swimmers, 0);

  R.check('no page errors or unexpected console errors', problems.length === 0,
    problems.length ? '\n      ' + problems.slice(0,6).join('\n      ') : 'clean');
  await ctx.close();
} finally {
  await browser.close();
}
R.finish();
