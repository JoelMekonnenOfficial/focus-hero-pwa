/* ================================================================
 * Life XP — Immersive session presentation v1
 *
 * Presentation-only guarantees:
 * - Reuses the one existing #timer-display node; it never clones a clock.
 * - Uses the app's existing renderTimer cadence; it creates no interval/RAF.
 * - Seeds each visual phase once from authoritative elapsed milliseconds;
 *   ordinary renders never advance CSS a second time.
 * - Reads player state but only writes the two explicit Settings booleans.
 * - Never reads/writes browser storage, accounting, rewards, tasks, history,
 *   sync identity, cloud rows, or recovery material.
 * ================================================================ */
(function installFocusHeroImmersive(global) {
  "use strict";

  if (global.FH_IMMERSIVE_SESSION) return;

  var VERSION = "1.1.2";
  var STYLE_ID = "fh-immersive-session-v1-css";
  var STAGE_ID = "fh-immersive-stage";
  var FOCUS_AURA_ID = "fh-focus-aura";
  var SETTINGS_ID = "fh-immersive-settings";
  var IMMERSIVE_KEY = "fhImmersiveLandscape";
  var AURA_KEY = "fhAuraEffects";          /* legacy single switch, still honoured */
  var GLOW_KEY = "fhAuraGlow";             /* the soft bloom around hero and scene */
  var RINGS_KEY = "fhAuraRings";           /* the spinning ring and its pulse waves */
  var settingWriteBusy = false;
  var timerAnchor = null;
  var timerHome = null;
  var stage = null;
  var avatarSignature = "";
  var visualSessionKey = "";
  var immersiveWasActive = false;
  var motionQuery = null;

  var CSS = [
    "#section-focus{isolation:isolate}",
    "#section-focus> :not(#" + FOCUS_AURA_ID + "){position:relative;z-index:1}",
    "#" + FOCUS_AURA_ID + "{position:absolute;z-index:0;inset:0;overflow:hidden;pointer-events:none;opacity:0;visibility:hidden;contain:paint;transition:opacity .35s ease}",
    "#" + FOCUS_AURA_ID + " span{position:absolute;display:block;pointer-events:none;will-change:transform,opacity}",
    "#" + FOCUS_AURA_ID + " .fh-focus-aura-bloom{inset:8% 10%;border-radius:50%;background:radial-gradient(ellipse at 50% 48%,rgba(var(--accent-rgb,126,224,200),.36) 0,rgba(var(--accent-rgb,126,224,200),.16) 23%,transparent 62%);opacity:.78;animation:fh-immersive-breathe 5.6s ease-in-out infinite}",
    "#" + FOCUS_AURA_ID + " .fh-focus-aura-ring{left:16%;top:13%;width:68%;aspect-ratio:1;border:2px solid rgba(var(--accent-rgb,126,224,200),.5);border-radius:50%;box-shadow:0 0 28px rgba(var(--accent-rgb,126,224,200),.33),inset 0 0 28px rgba(var(--accent-rgb,126,224,200),.2);opacity:.34;animation:fh-immersive-wave 4.8s cubic-bezier(.2,.6,.2,1) infinite}",
    "#" + FOCUS_AURA_ID + " .fh-focus-aura-sweep{inset:5%;border-radius:50%;background:conic-gradient(from 0deg,transparent 0 12%,rgba(var(--accent-rgb,126,224,200),.68) 15%,transparent 19% 45%,rgba(var(--accent-2-rgb,167,139,250),.5) 49%,transparent 54% 100%);-webkit-mask:radial-gradient(circle,transparent 0 49%,#000 51% 54%,transparent 56%);mask:radial-gradient(circle,transparent 0 49%,#000 51% 54%,transparent 56%);opacity:.18;animation:fh-immersive-spin 18s linear infinite}",
    "html[data-fh-aura-effects=on][data-fh-session-running=\"1\"][data-fh-session-presentation=clock] #" + FOCUS_AURA_ID + "{opacity:1;visibility:visible}",
    "html[data-fh-aura-glow=off][data-fh-aura-rings=off] #" + FOCUS_AURA_ID + "{display:none!important}",
    "html[data-fh-aura-glow=off] #" + FOCUS_AURA_ID + " .fh-focus-aura-bloom{display:none}",
    "html[data-fh-aura-rings=off] #" + FOCUS_AURA_ID + " .fh-focus-aura-ring,html[data-fh-aura-rings=off] #" + FOCUS_AURA_ID + " .fh-focus-aura-sweep{display:none}",
    "#" + STAGE_ID + "{--fh-session-delay:0s;--fh-avatar-delay:0s;--fh-scene-rgb:126,224,200;--fh-scene-bright:#9ff7e2;--fh-scene-secondary-rgb:167,139,250;position:relative;isolation:isolate;overflow:hidden;contain:paint;",
    "  width:100%;min-height:310px;max-height:460px;aspect-ratio:16/7;margin:12px 0 10px;",
    "  border:1px solid rgba(var(--fh-scene-rgb),.58);border-radius:22px;",
    "  background:#07101e;color:var(--ink,#f4f7ff);box-shadow:0 22px 64px rgba(2,8,23,.52),0 0 42px rgba(var(--fh-scene-rgb),.2)}",
    "#" + STAGE_ID + "::before{content:\"\";position:absolute;z-index:5;inset:0;pointer-events:none;border-radius:inherit;box-shadow:inset 0 0 0 1px rgba(255,255,255,.07),inset 0 0 34px rgba(var(--fh-scene-rgb),.15)}",
    "#" + STAGE_ID + "[hidden]{display:none!important}",
    "#" + STAGE_ID + "[data-landscape=travel]{--fh-scene-rgb:56,189,248;--fh-scene-bright:#bae6fd;--fh-scene-secondary-rgb:250,204,21}",
    "#" + STAGE_ID + "[data-landscape=loot]{--fh-scene-rgb:192,132,252;--fh-scene-bright:#f0abfc;--fh-scene-secondary-rgb:251,191,36}",
    "#" + STAGE_ID + "[data-landscape=fight]{--fh-scene-rgb:251,113,133;--fh-scene-bright:#fecdd3;--fh-scene-secondary-rgb:249,115,22}",
    "#" + STAGE_ID + "[data-landscape=rest]{--fh-scene-rgb:103,232,249;--fh-scene-bright:#cffafe;--fh-scene-secondary-rgb:167,139,250}",
    "#" + STAGE_ID + "[data-landscape=idle]{--fh-scene-rgb:129,140,248;--fh-scene-bright:#c7d2fe;--fh-scene-secondary-rgb:45,212,191}",
    "#" + STAGE_ID + "[data-started=\"1\"]{cursor:pointer;-webkit-tap-highlight-color:transparent}",
    "#" + STAGE_ID + "[data-started=\"1\"]:focus-visible{outline:2px solid rgba(var(--fh-scene-rgb),.9);outline-offset:2px}",
    "#" + STAGE_ID + "[data-started=\"0\"] .fh-immersive-environment{filter:saturate(.82) brightness(.94)}",
    "#" + STAGE_ID + "[data-started=\"0\"] .fh-immersive-status{opacity:.72}",
    "#" + STAGE_ID + " .fh-immersive-environment,#" + STAGE_ID + " .fh-immersive-aura-field,#" + STAGE_ID + " .fh-immersive-rune-ring,#" + STAGE_ID + " .fh-immersive-wave,#" + STAGE_ID + " .fh-immersive-sparks,#" + STAGE_ID + " .fh-immersive-ground{",
    "  position:absolute;inset:0;pointer-events:none}",
    "#" + STAGE_ID + " .fh-immersive-environment{z-index:-6;background:linear-gradient(180deg,#172554 0%,#1e3a5f 58%,#15271f 58%,#08120d 100%)}",
    "#" + STAGE_ID + " .fh-immersive-environment::before,#" + STAGE_ID + " .fh-immersive-environment::after{",
    "  content:\"\";position:absolute;inset:auto 0 17% 0;height:38%;opacity:.62;",
    "  background:repeating-linear-gradient(105deg,transparent 0 12%,rgba(2,6,23,.58) 12.5% 14%,transparent 14.5% 22%);",
    "  background-size:180px 100%;animation:fh-immersive-drift 18s linear infinite;animation-delay:var(--fh-session-delay)}",
    "#" + STAGE_ID + " .fh-immersive-environment::after{inset:auto 0 8% 0;height:24%;opacity:.34;animation-duration:11s;animation-direction:reverse}",
    "#" + STAGE_ID + "[data-landscape=travel] .fh-immersive-environment{background:linear-gradient(180deg,#16264d 0%,#315c7d 54%,#6f8157 55%,#14241b 100%)}",
    "#" + STAGE_ID + "[data-landscape=loot] .fh-immersive-environment{background:radial-gradient(circle at 75% 31%,rgba(245,196,81,.25),transparent 18%),linear-gradient(180deg,#231548,#52356b 55%,#342a20 56%,#100c0c 100%)}",
    "#" + STAGE_ID + "[data-landscape=fight] .fh-immersive-environment{background:radial-gradient(circle at 70% 30%,rgba(248,113,113,.18),transparent 21%),linear-gradient(180deg,#271632,#58303c 54%,#3a241e 55%,#120b0d 100%)}",
    "#" + STAGE_ID + "[data-landscape=rest] .fh-immersive-environment{background:radial-gradient(circle at 78% 24%,rgba(196,181,253,.22),transparent 16%),linear-gradient(180deg,#101836,#263b5a 55%,#18352f 56%,#091714 100%)}",
    "#" + STAGE_ID + "[data-landscape=idle] .fh-immersive-environment{background:linear-gradient(180deg,#16213d 0%,#30435e 56%,#2d4339 57%,#101914 100%)}",
    "#" + STAGE_ID + " .fh-immersive-aura-field{z-index:-5;inset:0;opacity:.92;background:radial-gradient(circle at 27% 68%,rgba(var(--fh-scene-rgb),.7) 0,rgba(var(--fh-scene-rgb),.23) 18%,transparent 39%),radial-gradient(circle at 78% 30%,rgba(var(--fh-scene-secondary-rgb),.42) 0,transparent 31%),radial-gradient(ellipse at 50% 100%,rgba(var(--fh-scene-rgb),.3),transparent 53%);mix-blend-mode:screen;animation:fh-immersive-breathe 5.6s ease-in-out infinite;animation-delay:var(--fh-session-delay);will-change:transform,opacity}",
    "#" + STAGE_ID + " .fh-immersive-rune-ring{z-index:-3;left:2%;top:auto;bottom:-42%;width:64%;height:auto;aspect-ratio:1;border-radius:50%;background:conic-gradient(from 0deg,transparent 0 7%,rgba(var(--fh-scene-rgb),.82) 8% 9%,transparent 10% 23%,rgba(var(--fh-scene-secondary-rgb),.78) 24% 25%,transparent 26% 48%,rgba(var(--fh-scene-rgb),.66) 49% 51%,transparent 52% 75%,rgba(var(--fh-scene-secondary-rgb),.72) 76% 77%,transparent 78%);-webkit-mask:radial-gradient(circle,transparent 0 55%,#000 56% 59%,transparent 60%);mask:radial-gradient(circle,transparent 0 55%,#000 56% 59%,transparent 60%);opacity:.78;animation:fh-immersive-spin 22s linear infinite;animation-delay:var(--fh-session-delay);will-change:transform}",
    "#" + STAGE_ID + " .fh-immersive-wave{z-index:-2;inset:auto auto 4% 8%;width:47%;height:auto;aspect-ratio:1;border:2px solid rgba(var(--fh-scene-rgb),.72);border-radius:50%;box-shadow:0 0 24px rgba(var(--fh-scene-rgb),.42),inset 0 0 24px rgba(var(--fh-scene-rgb),.25);animation:fh-immersive-wave 4.8s cubic-bezier(.2,.65,.2,1) infinite;animation-delay:var(--fh-session-delay);will-change:transform,opacity}",
    "#" + STAGE_ID + " .fh-immersive-wave.fh-immersive-wave-two{animation-delay:calc(var(--fh-session-delay) - 2.4s);border-color:rgba(var(--fh-scene-secondary-rgb),.64);box-shadow:0 0 22px rgba(var(--fh-scene-secondary-rgb),.32),inset 0 0 22px rgba(var(--fh-scene-secondary-rgb),.2)}",
    "#" + STAGE_ID + " .fh-immersive-sparks{z-index:-1;inset:4%;opacity:.68;background-image:radial-gradient(circle,rgba(255,255,255,.9) 0 1px,transparent 1.7px),radial-gradient(circle,rgba(var(--fh-scene-rgb),.9) 0 1.4px,transparent 2px),radial-gradient(circle,rgba(var(--fh-scene-secondary-rgb),.82) 0 1px,transparent 1.8px);background-size:73px 61px,97px 83px,131px 107px;background-position:9px 3px,31px 17px,71px 43px;animation:fh-immersive-spark-drift 12s linear infinite;animation-delay:var(--fh-session-delay);will-change:transform,opacity}",
    "#" + STAGE_ID + " .fh-immersive-ground{z-index:0;inset:auto 0 0;height:44%;background:linear-gradient(180deg,transparent,rgba(2,6,23,.84))}",
    "#" + STAGE_ID + " .fh-immersive-layout{position:relative;z-index:1;height:100%;min-height:inherit;display:grid;grid-template-columns:minmax(180px,1.16fr) minmax(180px,.84fr);align-items:end;gap:clamp(10px,3vw,36px);padding:clamp(16px,3.4vw,38px)}",
    "#" + STAGE_ID + " .fh-immersive-avatar{position:relative;align-self:stretch;display:grid;place-items:end center;min-width:0;filter:drop-shadow(0 16px 18px rgba(0,0,0,.46))}",
    "#" + STAGE_ID + " .fh-immersive-avatar::before{content:\"\";position:absolute;z-index:0;left:8%;right:8%;bottom:1%;height:45%;border-radius:50%;background:radial-gradient(ellipse,rgba(var(--fh-scene-rgb),.48),transparent 68%);opacity:.88;animation:fh-immersive-breathe 4.4s ease-in-out infinite;animation-delay:var(--fh-avatar-delay);will-change:transform,opacity}",
    "#" + STAGE_ID + " .fh-immersive-avatar svg{position:relative;z-index:1;display:block;width:min(100%,330px);height:100%;max-height:350px;min-height:174px;overflow:visible;image-rendering:pixelated}",
    "#" + STAGE_ID + " .fh-immersive-avatar .fh-pixel-avatar .fhpx-hero,#" + STAGE_ID + " .fh-immersive-avatar .fh-pixel-avatar .fhpx-mount,#" + STAGE_ID + " .fh-immersive-avatar .fh-pixel-avatar .fhpx-pet,#" + STAGE_ID + " .fh-immersive-avatar .fh-pixel-avatar .fhpx-weapon,#" + STAGE_ID + " .fh-immersive-avatar .fh-pixel-avatar .fhpx-fx{animation-delay:var(--fh-avatar-delay)!important}",
    "#" + STAGE_ID + "[data-running=\"0\"] .fh-immersive-environment::before,#" + STAGE_ID + "[data-running=\"0\"] .fh-immersive-environment::after,#" + STAGE_ID + "[data-running=\"0\"] .fh-immersive-aura-field,#" + STAGE_ID + "[data-running=\"0\"] .fh-immersive-rune-ring,#" + STAGE_ID + "[data-running=\"0\"] .fh-immersive-wave,#" + STAGE_ID + "[data-running=\"0\"] .fh-immersive-sparks,#" + STAGE_ID + "[data-running=\"0\"] .fh-immersive-avatar::before,#" + STAGE_ID + "[data-running=\"0\"] .fh-immersive-avatar .fh-pixel-avatar *{animation-play-state:paused!important}",
    "#" + STAGE_ID + " .fh-immersive-hud{position:relative;align-self:center;min-width:0;padding:clamp(15px,2.5vw,27px);border:1px solid rgba(var(--fh-scene-rgb),.33);border-radius:18px;background:linear-gradient(145deg,rgba(5,10,24,.82),rgba(10,16,36,.64));-webkit-backdrop-filter:blur(13px);backdrop-filter:blur(13px);box-shadow:0 16px 38px rgba(0,0,0,.34),0 0 28px rgba(var(--fh-scene-rgb),.12)}",
    "#" + STAGE_ID + " .fh-immersive-kicker{font-size:.68rem;font-weight:850;letter-spacing:.17em;text-transform:uppercase;color:rgba(255,255,255,.68)}",
    "#" + STAGE_ID + " .fh-immersive-action{margin:5px 0 2px;font-size:clamp(1.35rem,3.7vw,2.65rem);line-height:1.02;letter-spacing:-.025em;color:#fff;text-shadow:0 0 20px rgba(var(--fh-scene-rgb),.3)}",
    "#" + STAGE_ID + " .fh-immersive-task{min-height:1.3em;margin:0 0 10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.78rem;color:rgba(255,255,255,.68)}",
    "#" + STAGE_ID + " .fh-immersive-clock-slot{position:relative;display:inline-flex;align-items:center;gap:9px;width:max-content;max-width:100%;min-height:44px;padding:5px 9px;border:1px solid rgba(var(--fh-scene-rgb),.24);border-radius:999px;background:rgba(2,6,23,.38);box-shadow:inset 0 0 18px rgba(var(--fh-scene-rgb),.08)}",
    "#" + STAGE_ID + " #timer-display{width:auto;min-width:44px;margin:0;padding:4px 0;justify-content:center;font-size:clamp(.95rem,2.2vw,1.3rem);line-height:1;font-variant-numeric:tabular-nums;color:rgba(255,255,255,.82);text-shadow:none;cursor:pointer;touch-action:manipulation;animation:none!important}",
    "#" + STAGE_ID + " .fh-immersive-status{display:inline-flex;align-items:center;min-height:26px;padding:4px 9px;border:1px solid rgba(255,255,255,.14);border-radius:999px;font-size:.66rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:rgba(255,255,255,.76)}",
    "#" + STAGE_ID + "[data-running=\"1\"] .fh-immersive-status::before{content:\"\";width:6px;height:6px;margin-right:6px;border-radius:50%;background:var(--fh-scene-bright);box-shadow:0 0 12px rgba(var(--fh-scene-rgb),.8);animation:fh-immersive-pulse 2.8s ease-in-out infinite;animation-delay:var(--fh-session-delay)}",
    "html[data-fh-aura-effects=off] #" + STAGE_ID + "{box-shadow:none}",
    "html[data-fh-aura-glow=off] #" + STAGE_ID + " .fh-immersive-aura-field,html[data-fh-aura-glow=off] #" + STAGE_ID + " .fh-immersive-sparks,html[data-fh-aura-glow=off] #" + STAGE_ID + " .fh-immersive-avatar::before{display:none}",
    "html[data-fh-aura-rings=off] #" + STAGE_ID + " .fh-immersive-rune-ring,html[data-fh-aura-rings=off] #" + STAGE_ID + " .fh-immersive-wave{display:none}",
    "html[data-fh-aura-effects=off] #" + STAGE_ID + " .fh-immersive-status::before{box-shadow:none;animation:none}",
    "html[data-fh-aura-effects=off] .hero-card .avatar::before,html[data-fh-aura-effects=off] .hero-card .avatar::after{content:none!important;animation:none!important;filter:none!important;box-shadow:none!important}",
    "html[data-fh-aura-effects=off] .hero-card .avatar .fh-aura,html[data-fh-aura-effects=off] .hero-card .avatar .fhpx-fx{animation:none!important;filter:none!important;opacity:.12!important}",
    "@keyframes fh-immersive-drift{from{background-position:0 0}to{background-position:180px 0}}",
    "@keyframes fh-immersive-breathe{0%,100%{opacity:.62;transform:scale(.94)}50%{opacity:1;transform:scale(1.055)}}",
    "@keyframes fh-immersive-spin{to{transform:rotate(360deg)}}",
    "@keyframes fh-immersive-wave{0%{opacity:.7;transform:scale(.5)}70%{opacity:.15}100%{opacity:0;transform:scale(1.42)}}",
    "@keyframes fh-immersive-spark-drift{0%{transform:translate3d(0,8px,0);opacity:.42}50%{opacity:.82}100%{transform:translate3d(0,-36px,0);opacity:.42}}",
    "@keyframes fh-immersive-pulse{0%,100%{opacity:.48;transform:scale(.82)}50%{opacity:1;transform:scale(1.14)}}",
    "@media(max-width:680px){#" + STAGE_ID + "{min-height:292px;max-height:none;aspect-ratio:4/3;border-radius:18px}",
    "  #" + STAGE_ID + " .fh-immersive-layout{grid-template-columns:minmax(0,1.16fr) minmax(132px,.84fr);gap:6px;padding:13px 11px}",
    "  #" + STAGE_ID + " .fh-immersive-avatar svg{width:115%;max-width:none;min-height:164px;transform:translateX(-3%)}",
    "  #" + STAGE_ID + " .fh-immersive-hud{padding:13px 11px;border-radius:15px}",
    "  #" + STAGE_ID + " .fh-immersive-clock-slot{align-items:center;gap:6px;padding:4px 7px}",
    "  #" + STAGE_ID + " #timer-display{min-height:44px;display:flex;align-items:center;font-size:clamp(.88rem,4.2vw,1.12rem)}",
    "  #" + STAGE_ID + " .fh-immersive-status{padding:4px 7px;font-size:.58rem}",
    "  #" + STAGE_ID + " .fh-immersive-task{max-width:38vw}#" + STAGE_ID + " .fh-immersive-rune-ring{left:-9%;bottom:-21%;width:78%}#" + STAGE_ID + " .fh-immersive-wave{left:2%;bottom:8%;width:62%}}",
    "@media(orientation:landscape) and (max-height:560px){#" + STAGE_ID + "{min-height:184px;max-height:74vh;aspect-ratio:16/6;margin-block:8px}",
    "  #" + STAGE_ID + " .fh-immersive-layout{padding:10px 18px;grid-template-columns:1fr .82fr}",
    "  #" + STAGE_ID + " .fh-immersive-avatar svg{min-height:135px;max-height:70vh}",
    "  #" + STAGE_ID + " .fh-immersive-hud{padding:10px 15px}",
    "  #" + STAGE_ID + " .fh-immersive-task{margin-bottom:5px}}",
    "@media(prefers-reduced-motion:reduce){#" + FOCUS_AURA_ID + ",#" + FOCUS_AURA_ID + " *,#" + STAGE_ID + " *,#" + STAGE_ID + " *::before,#" + STAGE_ID + " *::after{animation:none!important;transition:none!important}",
    "  #" + FOCUS_AURA_ID + " .fh-focus-aura-bloom{opacity:.86;transform:none}#" + FOCUS_AURA_ID + " .fh-focus-aura-ring{opacity:.48;transform:scale(.86)}#" + STAGE_ID + " .fh-immersive-aura-field{opacity:.72;transform:none}#" + STAGE_ID + " .fh-immersive-rune-ring{opacity:.42;transform:none}#" + STAGE_ID + " .fh-immersive-wave{opacity:.22;transform:scale(.9)}#" + STAGE_ID + " .fh-immersive-sparks{opacity:.36;transform:none}#" + STAGE_ID + " .fh-immersive-status::before{opacity:.72;transform:none}}"
  ].join("\n");

  function getState() {
    try { return global.state && typeof global.state === "object" ? global.state : null; }
    catch (_) { return null; }
  }

  function setting(name, fallback) {
    var s = getState();
    var cfg = s && s.settings && typeof s.settings === "object" ? s.settings : null;
    return cfg && typeof cfg[name] === "boolean" ? cfg[name] : fallback;
  }

  /* The immersive presentation is the product default. An explicit saved
     false still selects the classic clock, while an older profile with no
     preference gets the requested landscape without a migration write. */
  function immersiveEnabled() { return setting(IMMERSIVE_KEY, true); }
  function auraEnabled() { return setting(AURA_KEY, true); }
  /* The glow and the rings were one switch, so turning off a ring you found
     distracting also killed the glow you liked. They are two effects and are
     now two settings. Neither has a stored value on an existing profile, so
     both inherit whatever the old combined switch was set to - nobody's
     screen changes on upgrade, and from then on they move independently. */
  function glowEnabled() { return setting(GLOW_KEY, auraEnabled()); }
  function ringsEnabled() { return setting(RINGS_KEY, auraEnabled()); }

  function reducedMotion() {
    return !!(motionQuery && motionQuery.matches);
  }

  function injectCss() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function makeFocusAura(card) {
    var aura = document.getElementById(FOCUS_AURA_ID);
    if (aura) return aura;
    if (!card) return null;
    aura = document.createElement("div");
    aura.id = FOCUS_AURA_ID;
    aura.setAttribute("aria-hidden", "true");
    aura.innerHTML = [
      '<span class="fh-focus-aura-bloom"></span>',
      '<span class="fh-focus-aura-ring"></span>',
      '<span class="fh-focus-aura-sweep"></span>'
    ].join("");
    card.insertBefore(aura, card.firstChild);
    return aura;
  }

  function makeStage() {
    if (stage && stage.isConnected) return stage;
    var card = document.getElementById("section-focus");
    var timer = document.getElementById("timer-display");
    if (!card || !timer || !timer.parentNode) return null;
    makeFocusAura(card);

    timerHome = timer.parentNode;
    if (!timerAnchor || !timerAnchor.isConnected) {
      timerAnchor = document.createComment("focus-hero-immersive-timer-home");
      timerHome.insertBefore(timerAnchor, timer);
    }

    stage = document.createElement("section");
    stage.id = STAGE_ID;
    stage.hidden = true;
    stage.setAttribute("role", "group");
    stage.setAttribute("aria-label", "Immersive focus session");
    stage.setAttribute("aria-hidden", "true");
    stage.innerHTML = [
      '<div class="fh-immersive-environment" aria-hidden="true"></div>',
      '<div class="fh-immersive-aura-field" aria-hidden="true"></div>',
      '<div class="fh-immersive-rune-ring" aria-hidden="true"></div>',
      '<div class="fh-immersive-wave fh-immersive-wave-one" aria-hidden="true"></div>',
      '<div class="fh-immersive-wave fh-immersive-wave-two" aria-hidden="true"></div>',
      '<div class="fh-immersive-sparks" aria-hidden="true"></div>',
      '<div class="fh-immersive-ground" aria-hidden="true"></div>',
      '<div class="fh-immersive-layout">',
      '  <div class="fh-immersive-avatar" aria-hidden="true"></div>',
      '  <div class="fh-immersive-hud">',
      '    <div class="fh-immersive-kicker">Session in motion</div>',
      '    <h3 class="fh-immersive-action" aria-live="polite" aria-atomic="true">Focus</h3>',
      '    <p class="fh-immersive-task"></p>',
      '    <div class="fh-immersive-clock-slot"></div>',
      '    <span class="fh-immersive-status">Paused</span>',
      '  </div>',
      '</div>'
    ].join("");
    timerHome.insertBefore(stage, timer);
    return stage;
  }

  /* ------------------------------------------------------------------
     TAP THE SCENE TO PAUSE

     Tapping the clock already paused a session, and it still does inside the
     landscape - but in there the clock is shrunk into the corner of the HUD
     card, a target barely over a finger wide. The gesture existed and was
     effectively unreachable, which is indistinguishable from missing.

     The whole scene is the target now. It routes to the same start/pause
     button as every other control, so there is exactly one place that starts
     and stops a session. It only ever pauses or resumes: a stray tap on a
     resting landscape will not start a session you did not ask for.
     ------------------------------------------------------------------ */
  function wireStageTap(view) {
    if (!view || view.__fhStageTap) return;
    view.__fhStageTap = true;
    var downX = 0, downY = 0, downT = 0;

    view.addEventListener("pointerdown", function (e) {
      downX = e.clientX; downY = e.clientY; downT = Date.now();
    });

    view.addEventListener("click", function (e) {
      if (e.button && e.button !== 0) return;
      if (view.dataset.started !== "1") return;          /* never starts a session */
      /* The clock carries its own handler; let it own its own taps. */
      if (e.target && e.target.closest && e.target.closest("#timer-display")) return;
      if (e.target && e.target.closest && e.target.closest("button,a,select,input")) return;
      if (Math.abs(e.clientX - downX) > 8 || Math.abs(e.clientY - downY) > 8) return;
      if (Date.now() - downT > 700) return;              /* long-press, not a tap */
      var sel = global.getSelection && global.getSelection();
      if (sel && String(sel).length > 0 && !sel.isCollapsed) return;
      var btn = document.getElementById("btn-start");
      if (!btn) return;
      e.preventDefault();
      btn.click();
    });

    view.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      if (view.dataset.started !== "1") return;
      var btn = document.getElementById("btn-start");
      if (!btn) return;
      e.preventDefault();
      btn.click();
    });
  }

  function moveTimerIntoStage() {
    var view = makeStage();
    var timer = document.getElementById("timer-display");
    var slot = view && view.querySelector(".fh-immersive-clock-slot");
    if (timer && slot && timer.parentNode !== slot) slot.insertBefore(timer, slot.firstChild);
  }

  function restoreTimer() {
    var timer = document.getElementById("timer-display");
    if (!timer || !timerHome || !timerAnchor || !timerAnchor.isConnected) return;
    var reference = stage && stage.parentNode === timerHome ? stage : timerAnchor.nextSibling;
    if (timer.parentNode === timerHome && timer.nextSibling === reference) return;
    timerHome.insertBefore(timer, reference);
  }

  function timerMetrics(s, stamp) {
    var timer = s && s.timer && typeof s.timer === "object" ? s.timer : {};
    var mode = String(timer.mode || "");
    var elapsed = 0;
    var remaining = 0;
    if (mode === "stopwatch") {
      if (typeof global.stopwatchElapsedMs === "function") {
        elapsed = Number(global.stopwatchElapsedMs(timer, stamp)) || 0;
      } else {
        elapsed = Number(timer.swAccumulatedMs) || 0;
        if (timer.running && timer.swStartedAt) elapsed += Math.max(0, stamp - Number(timer.swStartedAt));
      }
    } else if (mode === "focus") {
      var planned = typeof global.focusPlannedMs === "function"
        ? Number(global.focusPlannedMs()) || 0
        : Number(timer.plannedMs) || 0;
      remaining = timer.running
        ? Math.max(0, Number(timer.endAt || 0) - stamp)
        : Math.max(0, Number(timer.msLeft) || 0);
      elapsed = Math.max(0, Math.min(planned, planned - remaining));
    }
    var started = mode === "stopwatch"
      ? !!(timer.running || elapsed > 0 || timer.swSessionStartedAt || (timer.runDetails && timer.runDetails.startedAt))
      : mode === "focus" && !!(timer.running || elapsed > 0 || (timer.runDetails && timer.runDetails.startedAt));
    return { mode:mode, elapsedMs:Math.max(0, elapsed), remainingMs:remaining, started:started, running:!!timer.running };
  }

  function actionSpec(s) {
    var spec = null;
    if (typeof global.currentAdventureSpec === "function") {
      try { spec = global.currentAdventureSpec(); } catch (_) {}
    }
    var id = String((spec && spec.id) || (s && s.adventure && s.adventure.action) || "Rest");
    var scene = String((spec && spec.scene) || id).toLowerCase();
    var landscape = scene === "travelling" ? "travel"
      : (scene === "looting" || scene === "crafting") ? "loot"
      : (scene === "fighting" || scene === "hunting") ? "fight"
      : (scene === "resting" || scene === "meditating") ? "rest"
      : "idle";
    return {
      id:id,
      label:String((spec && spec.label) || (id === "Idle" ? "Stand Still" : id)),
      scene:scene,
      landscape:landscape
    };
  }

  function safeSignature(value) {
    try { return JSON.stringify(value); } catch (_) { return String(Date.now()); }
  }

  function visualRunKey(s, metrics) {
    var timer = s && s.timer && typeof s.timer === "object" ? s.timer : {};
    var detailStart = timer.runDetails && Number(timer.runDetails.startedAt);
    var start = metrics.mode === "stopwatch"
      ? Number(timer.swSessionStartedAt || timer.swStartedAt || detailStart || 0)
      : Number(detailStart || (timer.endAt && (Number(timer.endAt) - Number(timer.plannedMs || 0))) || 0);
    return [metrics.mode, Number.isFinite(start) ? start : 0, String(timer.activeTaskId || s.activeTaskId || "")].join(":");
  }

  function phaseDelay(elapsedMs) {
    var safe = Number(elapsedMs);
    if (!Number.isFinite(safe) || safe < 0) safe = 0;
    return "-" + (safe / 1000).toFixed(3) + "s";
  }

  function seedSessionPhase(view, key, elapsedMs) {
    if (visualSessionKey === key && immersiveWasActive) return;
    visualSessionKey = key;
    view.dataset.phaseSeedMs = String(Math.round(Math.max(0, Number(elapsedMs) || 0)));
    view.style.setProperty("--fh-session-delay", phaseDelay(elapsedMs));
  }

  function renderAvatar(view, s, spec, running, elapsedMs) {
    var host = view.querySelector(".fh-immersive-avatar");
    if (!host || typeof global.renderPixelHeroSvg !== "function") return;
    var hero = s && s.hero && typeof s.hero === "object" ? s.hero : {};
    var nextSignature = safeSignature([
      spec.id, spec.scene, running,
      hero.cls || "", hero.appearanceUpdatedAt || 0,
      hero.appearance || null, hero.equipped || null,
      s.fitness || null, Math.floor(Date.now() / 86400000)
    ]);
    if (nextSignature === avatarSignature && host.firstElementChild) return;
    /* A newly inserted SVG starts a new CSS timeline, so seed it with the
       current authoritative phase exactly once. Updating this value on every
       250ms render would add elapsed time on top of CSS time and visibly run
       Travel/Hunt/Loot animations at roughly double speed. */
    host.style.setProperty("--fh-avatar-delay", phaseDelay(elapsedMs));
    host.dataset.phaseSeedMs = String(Math.round(Math.max(0, Number(elapsedMs) || 0)));
    /* No painted sky here - the immersive landscape behind the hero is the
       backdrop, and the sprite's own opaque box used to cover it. */
    host.innerHTML = global.renderPixelHeroSvg({ scene:spec.scene, action:spec.id, running:running, home:true, backdrop:false });
    avatarSignature = nextSignature;
  }

  function currentTaskLabel() {
    var label = document.getElementById("active-task-label");
    var text = label ? String(label.textContent || "").trim() : "";
    return text || "Focused session";
  }

  /* VISUAL_CLOCK_BEGIN — deliberately contains no timer/ticker creation. */
  function renderImmersiveSession(stamp) {
    var s = getState();
    var root = document.documentElement;
    root.dataset.fhAuraEffects = (glowEnabled() || ringsEnabled()) ? "on" : "off";
    root.dataset.fhAuraGlow = glowEnabled() ? "on" : "off";
    root.dataset.fhAuraRings = ringsEnabled() ? "on" : "off";
    root.dataset.fhImmersiveEnabled = immersiveEnabled() ? "1" : "0";
    root.dataset.fhReducedMotion = reducedMotion() ? "1" : "0";
    if (!s) return false;

    var metrics = timerMetrics(s, Number(stamp) || Date.now());
    /* The landscape is the resting state of this screen, not a thing that
       appears once a session is underway. Turning the setting on and then
       being shown a bare clock until you press start reads as the setting
       having failed. So: enabled means visible, and `started` only decides
       what is happening inside the scene - a hero standing ready, or a hero
       mid-action with the aura lit. */
    var active = immersiveEnabled();
    root.dataset.fhSessionPresentation = active ? "landscape" : "clock";
    root.dataset.fhSessionRunning = metrics.running ? "1" : "0";
    root.dataset.fhSessionStarted = metrics.started ? "1" : "0";
    var view = makeStage();
    if (!view) return false;

    if (!active) {
      restoreTimer();
      view.hidden = true;
      view.setAttribute("aria-hidden", "true");
      immersiveWasActive = false;
      avatarSignature = "";
      return false;
    }

    moveTimerIntoStage();
    var spec = actionSpec(s);
    seedSessionPhase(view, visualRunKey(s, metrics), metrics.elapsedMs);
    view.hidden = false;
    view.setAttribute("aria-hidden", "false");
    view.dataset.landscape = spec.landscape;
    view.dataset.action = spec.id.toLowerCase();
    view.dataset.running = metrics.running ? "1" : "0";
    view.dataset.started = metrics.started ? "1" : "0";
    wireStageTap(view);
    if (metrics.started) {
      view.setAttribute("role", "button");
      view.setAttribute("tabindex", "0");
      view.setAttribute("title", metrics.running ? "Tap the scene to pause" : "Tap the scene to resume");
      view.setAttribute("aria-label", metrics.running ? "Pause the session" : "Resume the session");
    } else {
      view.removeAttribute("role");
      view.removeAttribute("tabindex");
      view.removeAttribute("title");
      view.setAttribute("aria-label", "Immersive focus scene");
    }
    view.dataset.elapsedMs = String(Math.round(metrics.elapsedMs));
    var action = view.querySelector(".fh-immersive-action");
    var task = view.querySelector(".fh-immersive-task");
    var status = view.querySelector(".fh-immersive-status");
    if (action && action.textContent !== spec.label) action.textContent = spec.label;
    var taskText = currentTaskLabel();
    if (task && task.textContent !== taskText) task.textContent = taskText;
    if (status) status.textContent = !metrics.started ? "Ready" : (metrics.running ? "Active" : "Paused");
    /* The eyebrow must not claim a session is under way while the hero is
       standing at the start line - this line is now on screen all the time. */
    var kicker = view.querySelector(".fh-immersive-kicker");
    var kickerText = !metrics.started ? "Ready when you are" : (metrics.running ? "Session in motion" : "Session paused");
    if (kicker && kicker.textContent !== kickerText) kicker.textContent = kickerText;
    renderAvatar(view, s, spec, metrics.running, metrics.elapsedMs);
    immersiveWasActive = true;
    return true;
  }
  /* VISUAL_CLOCK_END */

  function syncControls() {
    var immersive = document.getElementById("fh-toggle-immersive-landscape");
    var glow = document.getElementById("fh-toggle-aura-glow");
    var rings = document.getElementById("fh-toggle-aura-rings");
    if (immersive) immersive.setAttribute("aria-checked", immersiveEnabled() ? "true" : "false");
    if (glow) glow.setAttribute("aria-checked", glowEnabled() ? "true" : "false");
    if (rings) rings.setAttribute("aria-checked", ringsEnabled() ? "true" : "false");
    [immersive, glow, rings].forEach(function (button) {
      if (!button) return;
      button.disabled = settingWriteBusy;
      button.setAttribute("aria-busy", settingWriteBusy ? "true" : "false");
    });
  }

  function restoreSetting(cfg, name, prior) {
    if (prior.had) cfg[name] = prior.value;
    else delete cfg[name];
  }

  async function writeSetting(name, value) {
    if (settingWriteBusy) return false;
    var s = getState();
    if (!s) return false;
    if (!s.settings || typeof s.settings !== "object" || Array.isArray(s.settings)) return false;
    var cfg = s.settings;
    var prior = { had:Object.prototype.hasOwnProperty.call(cfg, name), value:cfg[name] };
    settingWriteBusy = true;
    cfg[name] = !!value;
    syncControls();
    renderImmersiveSession();
    try {
      var saved;
      if (typeof global.saveStateDurable === "function") {
        saved = await global.saveStateDurable({ source:"immersive-presentation-setting", suppressMilestoneAnnouncement:true });
      } else if (typeof global.saveState === "function") {
        saved = global.saveState({ source:"immersive-presentation-setting", suppressMilestoneAnnouncement:true });
      } else {
        throw new Error("Life XP save service is unavailable.");
      }
      if (saved === false) throw new Error("Life XP did not accept the presentation setting save.");
      return true;
    } catch (error) {
      restoreSetting(cfg, name, prior);
      renderImmersiveSession();
      if (typeof global.toast === "function") global.toast("Setting was not changed because the save did not complete.", "warn");
      return false;
    } finally {
      settingWriteBusy = false;
      syncControls();
    }
  }

  function makeToggle(id, label, title, name, fallback) {
    var row = document.createElement("div");
    row.className = "form-row";
    var text = document.createElement("label");
    text.textContent = label;
    text.title = title;
    text.setAttribute("for", id);
    var value = document.createElement("div");
    value.className = "val";
    var button = document.createElement("button");
    button.type = "button";
    button.className = "toggle";
    button.id = id;
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-checked", setting(name, fallback) ? "true" : "false");
    button.addEventListener("click", function () {
      void writeSetting(name, button.getAttribute("aria-checked") !== "true");
    });
    value.appendChild(button);
    row.append(text, value);
    return row;
  }

  function injectSettings() {
    var modal = document.querySelector("#settings-modal .modal");
    if (!modal || document.getElementById(SETTINGS_ID)) return false;
    var wrap = document.createElement("div");
    wrap.id = SETTINGS_ID;
    var hr = document.createElement("hr");
    var heading = document.createElement("h4");
    heading.style.cssText = "margin:.25rem 0 .25rem;font-size:.82rem;color:var(--ink-dim);text-transform:uppercase;letter-spacing:.1em";
    heading.textContent = "Session presentation";
    wrap.append(hr, heading);
    wrap.appendChild(makeToggle(
      "fh-toggle-immersive-landscape",
      "Immersive landscape",
      "Show the character scene on the focus screen, with the same live timer minimized into it. It stands ready before you start and animates your selected action during a session. Turn this off for the regular clock layout.",
      IMMERSIVE_KEY,
      true
    ));
    wrap.appendChild(makeToggle(
      "fh-toggle-aura-glow",
      "Aura glow",
      "The soft coloured bloom around your hero and through the scene, and the drifting sparks. Independent of the ring pulse. Reduced-motion preferences are always respected.",
      GLOW_KEY,
      auraEnabled()
    ));
    wrap.appendChild(makeToggle(
      "fh-toggle-aura-rings",
      "Ring pulse",
      "The rotating rune ring and the pulse waves that travel out from it. Independent of the aura glow. Reduced-motion preferences are always respected.",
      RINGS_KEY,
      auraEnabled()
    ));
    var ui11 = document.getElementById("fh11-settings-block");
    if (ui11 && ui11.parentNode === modal) ui11.insertAdjacentElement("afterend", wrap);
    else modal.appendChild(wrap);
    syncControls();
    return true;
  }

  function hook(name) {
    var original = global[name];
    if (typeof original !== "function") return false;
    if (original.__fhImmersiveV1) return true;
    var wrapped = function () {
      var out = original.apply(this, arguments);
      try { renderImmersiveSession(); } catch (error) { console.warn("[Life XP immersive] render", error); }
      return out;
    };
    wrapped.__fhImmersiveV1 = true;
    wrapped.__fhImmersiveOriginal = original;
    global[name] = wrapped;
    return true;
  }

  function onMotionPreferenceChange() {
    renderImmersiveSession();
  }

  function start() {
    injectCss();
    motionQuery = typeof global.matchMedia === "function" ? global.matchMedia("(prefers-reduced-motion: reduce)") : null;
    if (motionQuery) {
      if (typeof motionQuery.addEventListener === "function") motionQuery.addEventListener("change", onMotionPreferenceChange);
      else if (typeof motionQuery.addListener === "function") motionQuery.addListener(onMotionPreferenceChange);
    }
    makeStage();
    injectSettings();
    (function waitForPresentationHooks(tries) {
      var timerHooked = hook("renderTimer");
      hook("renderAvatar");
      injectSettings();
      renderImmersiveSession();
      if (!timerHooked && tries > 0) setTimeout(function () { waitForPresentationHooks(tries - 1); }, 200);
    })(30);
  }

  global.FH_IMMERSIVE_SESSION = Object.freeze({
    version:VERSION,
    render:renderImmersiveSession,
    settings:function () { return { immersiveLandscape:immersiveEnabled(), auraEffects:auraEnabled() }; },
    setImmersive:function (enabled) { return writeSetting(IMMERSIVE_KEY, !!enabled); },
    setAuraEffects:function (enabled) { return writeSetting(AURA_KEY, !!enabled); },
    stage:function () { return stage; }
  });

  if (typeof global.FH_onPrimaryReady === "function") global.FH_onPrimaryReady(start);
  else if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once:true });
  else start();
})(window);

/* asset content-type refresh — v10.32.0 */
