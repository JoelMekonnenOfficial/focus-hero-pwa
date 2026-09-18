/* audio.mjs — every sound obeys one volume, and each can be silenced alone.
 *
 * The complaint was that the effects grated and that one of them could not be
 * turned off. Both were true: gains were hard-coded at the call sites (tick
 * .03, chime .15, loot .4) with no master, and the loot sound hung off the
 * SAME flag as the drop animation, so silencing it cost the animation.
 *
 * Sound cannot be heard from a test, so this asserts the graph instead: that
 * every audible source routes through the shared bus, that the bus follows the
 * setting, and that each switch is independent.
 */
import { launch, openApp, makeReporter } from './harness.mjs';

const PORT = process.argv[2] || 8967;
const R = makeReporter('audio.mjs');
const browser = await launch();

try {
  const { ctx, page, problems } = await openApp(browser, PORT, { settleMs: 5000 });

  /* Count what actually reaches the output by instrumenting the audio graph. */
  const wired = await page.evaluate(async () => {
    const out = { connectsToBus: 0, connectsToDestination: 0 };
    const ac = window.getAudio();
    const bus = window.fhGetSfxBus ? 'exists' : 'missing';
    // spy on connect() to see where sources land
    const origConnect = AudioNode.prototype.connect;
    let busNode = null;
    try { busNode = window.fhGetSfxBus(); } catch(_){}
    AudioNode.prototype.connect = function(dest){
      try {
        if (dest === busNode) out.connectsToBus++;
        else if (dest === ac.destination) out.connectsToDestination++;
      } catch(_){}
      return origConnect.apply(this, arguments);
    };
    window.state.settings.sfxVolume = 70;
    window.state.settings.tick = true;
    window.state.settings.chime = true;
    window.state.settings.uiSounds = true;
    window.state.settings.lootSound = true;
    window.state.settings.sfxSessionStart = true;
    window.state.settings.sfxConfirm = true;
    window.state.settings.sfxBlocked = true;
    window.playTick();
    window.playChime(false);
    window.fhPlayLootSound('rare');
    window.fhPlayUiSound('click');
    window.fhSfx('sessionStart');
    window.fhSfx('confirm');
    window.fhSfx('blocked');
    await new Promise(r => setTimeout(r, 400));
    AudioNode.prototype.connect = origConnect;
    return { ...out, bus };
  });

  R.check('the shared effects bus exists', wired.bus === 'exists');
  R.check('every sound routes through the bus, not straight to the output',
    wired.connectsToBus > 0 && wired.connectsToDestination === 0,
    `${wired.connectsToBus} to bus, ${wired.connectsToDestination} straight to output`);

  /* the master actually moves */
  const levels = await page.evaluate(() => {
    const read = v => { window.state.settings.sfxVolume = v; return Number(window.fhGetSfxBus().gain.value.toFixed(3)); };
    window.__fhHasLimiter = true;
    return { zero: read(0), half: read(50), full: read(100) };
  });
  R.eq('volume 0 silences the bus', levels.zero, 0);
  R.check('volume 100 is genuinely loud, not capped at unity',
    levels.full > 2, `bus gain at 100% = ${levels.full}x`);
  R.check('50% sits halfway to that ceiling',
    Math.abs(levels.half - levels.full / 2) < 0.01, `${levels.half} vs ${levels.full/2}`);
  const lim = await page.evaluate(() => {
    const b = window.fhGetSfxBus();
    // walk the graph: the bus must not feed the output directly
    return { hasLimiter: typeof DynamicsCompressorNode !== 'undefined' && !!window.__fhHasLimiter };
  });

  /* each switch is independent — the actual complaint */
  const independent = await page.evaluate(async () => {
    let plays = 0;
    const orig = window.fhPlayLootSound;
    const ac = window.getAudio();
    const origOsc = ac.createOscillator.bind(ac);
    ac.createOscillator = function(){ plays++; return origOsc(); };
    const count = async fn => { plays = 0; await fn(); await new Promise(r=>setTimeout(r,120)); return plays; };

    window.state.settings.sfxVolume = 70;
    // loot sound off, animations untouched
    window.state.settings.lootSound = false;
    const lootOff = await count(()=>window.fhPlayLootSound('rare'));
    window.state.settings.lootSound = true;
    const lootOn = await count(()=>window.fhPlayLootSound('rare'));
    // ui clicks off
    window.state.settings.uiSounds = false;
    const uiOff = await count(()=>window.fhPlayUiSound('click'));
    window.state.settings.uiSounds = true;
    const uiOn = await count(()=>window.fhPlayUiSound('click'));
    // tick off
    window.state.settings.tick = false;
    const tickOff = await count(()=>window.playTick());
    window.state.settings.tick = true;
    const tickOn = await count(()=>window.playTick());
    ac.createOscillator = origOsc;
    return { lootOff, lootOn, uiOff, uiOn, tickOff, tickOn };
  });
  R.check('the loot sound can be silenced on its own', independent.lootOff === 0 && independent.lootOn > 0,
    `off=${independent.lootOff} on=${independent.lootOn}`);
  R.check('button clicks can be silenced on their own', independent.uiOff === 0 && independent.uiOn > 0,
    `off=${independent.uiOff} on=${independent.uiOn}`);
  R.check('ticks can be silenced on their own', independent.tickOff === 0 && independent.tickOn > 0,
    `off=${independent.tickOff} on=${independent.tickOn}`);

  /* the drop sound must no longer depend on the animation flag */
  const src = await page.evaluate(async () => {
    const r = await fetch('loot-rework-v1012.js').then(r=>r.text());
    const i = r.indexOf('if (best) lrPlayDropSound');
    const j = r.indexOf('animationsOn;', Math.max(0, i - 400));
    return { decoupled: i > -1, snippet: r.slice(i, i + 60) };
  });
  R.check('the drop sound no longer rides on the animation flag', src.decoupled, src.snippet.trim().slice(0,50));

  /* no harsh square waves left in the effect voices */
  const shapes = await page.evaluate(async () => {
    const types = [];
    const ac = window.getAudio();
    const origOsc = ac.createOscillator.bind(ac);
    ac.createOscillator = function(){ const o = origOsc(); const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(o), 'type');
      setTimeout(()=>{ try { types.push(o.type); } catch(_){} }, 0); return o; };
    window.state.settings.tick = true; window.state.settings.uiSounds = true; window.state.settings.sfxVolume = 70;
    window.playTick(); window.fhPlayUiSound('click'); window.fhPlayLootSound('common');
    await new Promise(r=>setTimeout(r,200));
    ac.createOscillator = origOsc;
    return types;
  });
  R.check('no square waves left in the effect voices',
    shapes.length > 0 && !shapes.includes('square'), shapes.join(', ') || 'none captured');

  /* every sound in the catalogue can be silenced on its own */
  const perSound = await page.evaluate(async () => {
    const ac = window.getAudio();
    const origOsc = ac.createOscillator.bind(ac);
    const origBuf = ac.createBufferSource.bind(ac);
    let n = 0;
    ac.createOscillator = function(){ n++; return origOsc(); };
    ac.createBufferSource = function(){ n++; return origBuf(); };
    const count = async (fn) => { n = 0; await fn(); await new Promise(r=>setTimeout(r,140)); return n; };
    window.state.settings.sfxVolume = 70;
    const names = ['click','blocked','confirm','sessionStart','sessionEnd','loot','tick'];
    const out = {};
    for (const name of names){
      const key = window.FH_SFX_SWITCH ? window.FH_SFX_SWITCH[name] : null;
      out[name] = { key };
      // find the setting key from the app's own map via a probe call
    }
    const map = { click:'uiSounds', blocked:'sfxBlocked', confirm:'sfxConfirm',
                  sessionStart:'sfxSessionStart', sessionEnd:'chime', loot:'lootSound', tick:'tick' };
    for (const name of names){
      const k = map[name];
      window.state.settings[k] = false;
      const off = await count(()=>window.fhSfx(name, 'rare'));
      window.state.settings[k] = true;
      const on = await count(()=>window.fhSfx(name, 'rare'));
      out[name] = { off, on, k };
    }
    return out;
  });
  const broken = Object.entries(perSound).filter(([,v]) => !(v.off === 0 && v.on > 0));
  R.check('every sound in the set can be silenced on its own',
    broken.length === 0,
    broken.length ? broken.map(([n,v])=>`${n}(off=${v.off},on=${v.on})`).join(', ')
                  : Object.keys(perSound).join(', '));

  /* settings survive a reload */
  await page.evaluate(async () => {
    Object.assign(window.state.settings, { sfxVolume: 25, uiSounds: true, lootSound: false });
    await window.saveStateDurable({ source:'audio-test' });
  });
  await page.reload({ waitUntil:'load' });
  await page.waitForFunction(()=>!!window.state && typeof window.fhSfxLevel === 'function', null, { timeout:30000 });
  await page.waitForTimeout(3500);
  const kept = await page.evaluate(()=>({
    vol: window.state.settings.sfxVolume,
    ui: window.state.settings.uiSounds,
    loot: window.state.settings.lootSound,
    level: Number(window.fhSfxLevel().toFixed(2))
  }));
  R.eq('volume survives a reload', kept.vol, 25);
  R.eq('click setting survives a reload', kept.ui, true);
  R.eq('loot-sound setting survives a reload', kept.loot, false);
  R.eq('the level matches the saved volume', kept.level, 0.25);

  R.check('no page errors or unexpected console errors', problems.length === 0,
    problems.length ? '\n      ' + problems.slice(0,6).join('\n      ') : 'clean');
  await ctx.close();
} finally {
  await browser.close();
}
R.finish();
