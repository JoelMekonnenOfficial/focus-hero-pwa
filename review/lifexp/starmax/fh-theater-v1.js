/* ==========================================================================
   Life XP — IMMERSIVE THEATRE                                fh-theater-v1.js

   WHAT WAS WRONG.

   "Immersive landscape" was not a mode. It was a slightly larger box inside
   the ordinary dashboard, and the dashboard carried on around it: the top bar,
   the layout switcher, Skills, Quests - and, on the left, the Hero card
   showing THE SAME CHARACTER AGAIN, forty pixels away from the big one. Two
   copies of you on one screen, neither of them the point.

   Nothing about that is immersive. The word promises the screen becomes the
   session; what it delivered was one card wearing a nicer background.

   WHAT THIS DOES INSTEAD.

   Two changes, and they are separate on purpose.

   1. THE DUPLICATE IS GONE. Whenever the scene is on screen, the Hero card
      drops its portrait - just the portrait. Name, class, level, bars and gear
      all stay, because those are information; the second little picture of the
      character you are already watching is not. One character, one screen.

   2. THEATRE MODE. The scene can take the whole viewport: no top bar, no
      cards, no chrome, just the world, your character and the clock. It opens
      by itself when you turn a phone sideways - which is what "immersive
      landscape" should always have meant - and can be opened deliberately
      anywhere else from the button on the scene. Escape, the close button, or
      rotating back leaves it.

   HOW, AND WHY THIS WAY.

   None of the scene is rebuilt. The existing stage already knows how to draw
   the world, run the aura, hold the clock and take a tap to pause, and all of
   that was hard-won. Theatre MOVES that element to the top of the document and
   restyles it, then puts it back exactly where it was on exit. So every
   setting you already have - aura glow, aura rings, tap to pause - keeps
   working in theatre without a second implementation to keep in sync.

   The element is genuinely relocated rather than just given position:fixed,
   because a fixed child of a card is at the mercy of any transform or filter
   on an ancestor, and this app has plenty of both. Moving it removes the
   question entirely.
   ========================================================================== */
(function(){
  "use strict";
  if (window.FH_THEATER) return;

  var STAGE_ID = "fh-immersive-stage";
  var CSS_ID = "fh-theater-css";
  var ROOT_ATTR = "data-fh-theater";

  /* A phone or tablet held sideways. Deliberately keyed on height rather than
     width: a desktop window is always "landscape" and must never be taken over
     without being asked. */
  var LANDSCAPE_QUERY = "(orientation:landscape) and (max-height:620px)";

  var CSS = [
    /* ---------- 1. no more twin characters ---------- */
    /* The scene is the character now. The card keeps everything that is
       information and loses the redundant picture. */
    'html[data-fh-scene-live="1"] .hero-card .avatar{display:none!important}',
    'html[data-fh-scene-live="1"] .hero-card .avatar-wrap{display:none!important}',

    /* ---------- 2. the button that opens theatre ---------- */
    '#' + STAGE_ID + '{position:relative}',
    '.fh-theater-open{position:absolute;top:10px;right:10px;z-index:6;',
    '  width:34px;height:34px;display:grid;place-items:center;cursor:pointer;',
    '  border-radius:10px;font-size:15px;line-height:1;color:rgba(255,255,255,.82);',
    '  border:1px solid rgba(255,255,255,.2);background:rgba(2,6,23,.5);',
    '  -webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);opacity:.55;',
    '  transition:opacity .18s ease,background .18s ease}',
    '#' + STAGE_ID + ':hover .fh-theater-open{opacity:1}',
    /* Once you are in theatre the button that opens it is nonsense, and it
       sits exactly where the exit lives. */
    '#' + STAGE_ID + '.fh-theater .fh-theater-open{display:none!important}',
    '.fh-theater-open:hover{opacity:1;background:rgba(2,6,23,.78)}',
    '.fh-theater-open:focus-visible{opacity:1;outline:2px solid rgba(255,255,255,.7);outline-offset:2px}',

    /* ---------- 3. theatre ---------- */
    'html[' + ROOT_ATTR + '="1"]{overflow:hidden!important}',
    'html[' + ROOT_ATTR + '="1"] body{overflow:hidden!important}',
    '#' + STAGE_ID + '.fh-theater{position:fixed!important;inset:0!important;z-index:9000!important;',
    '  width:100vw!important;height:100vh!important;height:100dvh!important;',
    '  max-width:none!important;max-height:none!important;min-height:0!important;',
    '  aspect-ratio:auto!important;margin:0!important;border-radius:0!important;',
    '  border:0!important;box-shadow:none!important}',
    /* Give the scene the room it just gained. */
    '#' + STAGE_ID + '.fh-theater .fh-immersive-layout{padding:clamp(18px,4vh,54px) clamp(20px,5vw,72px);',
    '  grid-template-columns:minmax(0,1.25fr) minmax(220px,.75fr);gap:clamp(14px,4vw,52px)}',
    '#' + STAGE_ID + '.fh-theater .fh-immersive-avatar svg{width:min(100%,560px)!important;',
    '  max-height:min(72vh,620px)!important;min-height:0!important}',
    '#' + STAGE_ID + '.fh-theater .fh-immersive-action{font-size:clamp(2rem,6.4vw,4.6rem)}',
    '#' + STAGE_ID + '.fh-theater .fh-immersive-kicker{font-size:clamp(.7rem,1.5vw,.9rem)}',
    '#' + STAGE_ID + '.fh-theater .fh-immersive-task{font-size:clamp(.82rem,1.7vw,1.05rem)}',
    '#' + STAGE_ID + '.fh-theater #timer-display{font-size:clamp(1.5rem,4.6vw,3rem)!important}',
    '#' + STAGE_ID + '.fh-theater .fh-immersive-clock-slot{padding:8px 16px;gap:14px}',
    '#' + STAGE_ID + '.fh-theater .fh-immersive-hud{padding:clamp(18px,3vw,34px);border-radius:22px}',
    /* Short sideways phones: stack nothing, just tighten. */
    '@media (orientation:landscape) and (max-height:620px){',
    '  #' + STAGE_ID + '.fh-theater .fh-immersive-layout{padding:12px 22px;gap:16px;',
    '    grid-template-columns:minmax(0,1.2fr) minmax(180px,.8fr)}',
    '  #' + STAGE_ID + '.fh-theater .fh-immersive-avatar svg{max-height:74vh!important}',
    '  #' + STAGE_ID + '.fh-theater .fh-immersive-action{font-size:clamp(1.6rem,5.4vh,2.8rem)}',
    '  #' + STAGE_ID + '.fh-theater #timer-display{font-size:clamp(1.2rem,5vh,2rem)!important}}',
    /* Portrait phones in theatre: the HUD goes under the character. */
    '@media (orientation:portrait){',
    '  #' + STAGE_ID + '.fh-theater .fh-immersive-layout{grid-template-columns:1fr;',
    '    grid-template-rows:1fr auto;align-items:center;gap:14px}',
    '  #' + STAGE_ID + '.fh-theater .fh-immersive-avatar svg{max-height:52vh!important}}',

    /* ---------- 4. leaving ---------- */
    '.fh-theater-exit{position:fixed;top:max(12px,env(safe-area-inset-top));',
    '  right:max(12px,env(safe-area-inset-right));z-index:9010;',
    '  display:inline-flex;align-items:center;gap:8px;padding:9px 14px;cursor:pointer;',
    '  border-radius:999px;font:inherit;font-size:.78rem;font-weight:600;',
    '  color:rgba(255,255,255,.9);border:1px solid rgba(255,255,255,.22);',
    '  background:rgba(2,6,23,.55);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);',
    '  opacity:.32;transition:opacity .2s ease}',
    '.fh-theater-exit:hover,.fh-theater-exit:focus-visible{opacity:1}',
    'html[' + ROOT_ATTR + '="1"][data-fh-theater-idle="1"] .fh-theater-exit{opacity:.12}',
    '@media (hover:none){.fh-theater-exit{opacity:.62}}'
  ].join("\n");

  function ensureCss(){
    if (document.getElementById(CSS_ID)) return;
    var el = document.createElement("style");
    el.id = CSS_ID; el.textContent = CSS;
    document.head.appendChild(el);
  }

  function stage(){ return document.getElementById(STAGE_ID); }

  function immersiveOn(){
    try {
      var s = window.state;
      var v = s && s.settings ? s.settings.fhImmersiveLandscape : undefined;
      return typeof v === "boolean" ? v : true;
    } catch(_){ return true; }
  }

  /* --------------------------------------------------- the duplicate rule */

  /* Flag the document whenever a scene is actually on screen, so the CSS above
     can retire the Hero card's portrait. Driven by observation rather than by
     the setting, because the stage can be absent for reasons the setting does
     not know about. */
  function syncSceneFlag(){
    var el = stage();
    /* Measured, not inferred. offsetParent is null for a position:fixed
       element, so using it here quietly dropped the flag the moment theatre
       opened - and the Hero portrait came back, hidden behind the overlay but
       still there, which is the exact duplicate this is meant to remove. */
    var live = false;
    if (el && el.isConnected){
      var r = el.getBoundingClientRect();
      live = r.width > 0 && r.height > 0;
    }
    if (live) document.documentElement.setAttribute("data-fh-scene-live", "1");
    else document.documentElement.removeAttribute("data-fh-scene-live");

    /* Turning immersive off, or losing the stage entirely, must also take
       theatre down with it - otherwise the setting says "off" while the
       screen is still showing it. */
    if (isOpen() && (!el || !el.isConnected || !immersiveOn())) close();
  }

  /* ------------------------------------------------------------- theatre */

  var home = null;        /* where the stage lives when not in theatre */
  var exitBtn = null;
  var auto = false;       /* did the orientation open this, or did you? */
  var idleTimer = null;

  function nudgeIdle(){
    document.documentElement.removeAttribute("data-fh-theater-idle");
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(function(){
      if (isOpen()) document.documentElement.setAttribute("data-fh-theater-idle", "1");
    }, 2600);
  }

  function isOpen(){ return document.documentElement.getAttribute(ROOT_ATTR) === "1"; }

  function open(byOrientation){
    var el = stage();
    if (!el || isOpen()) return false;
    ensureCss();

    /* Remember the exact slot so exit is a true restore, not a guess. */
    home = { parent: el.parentNode, next: el.nextSibling };
    document.body.appendChild(el);
    el.classList.add("fh-theater");
    document.documentElement.setAttribute(ROOT_ATTR, "1");
    auto = !!byOrientation;

    if (!exitBtn){
      exitBtn = document.createElement("button");
      exitBtn.type = "button";
      exitBtn.className = "fh-theater-exit";
      exitBtn.innerHTML = '<span aria-hidden="true">✕</span><span>Exit</span>';
      exitBtn.setAttribute("aria-label", "Leave theatre mode");
      exitBtn.addEventListener("click", function(e){ e.preventDefault(); e.stopPropagation(); close(); });
    }
    document.body.appendChild(exitBtn);

    document.addEventListener("keydown", onKey, true);
    ["pointermove","pointerdown","keydown"].forEach(function(t){
      document.addEventListener(t, nudgeIdle, true);
    });
    nudgeIdle();
    syncSceneFlag();
    try { window.dispatchEvent(new Event("resize")); } catch(_){}
    return true;
  }

  function close(){
    var el = stage();
    if (!isOpen()) return false;
    if (el){
      el.classList.remove("fh-theater");
      /* Put it back where it came from. If the page has been re-rendered and
         the old slot is gone, fall back to the timer card rather than leaving
         the scene stranded on the body. */
      if (home && home.parent && home.parent.isConnected){
        if (home.next && home.next.parentNode === home.parent) home.parent.insertBefore(el, home.next);
        else home.parent.appendChild(el);
      } else {
        var card = document.getElementById("section-focus");
        var timer = document.getElementById("timer-display");
        if (card && timer && timer.parentNode) timer.parentNode.insertBefore(el, timer);
        else if (card) card.appendChild(el);
      }
    }
    home = null;
    document.documentElement.removeAttribute(ROOT_ATTR);
    document.documentElement.removeAttribute("data-fh-theater-idle");
    if (exitBtn && exitBtn.parentNode) exitBtn.parentNode.removeChild(exitBtn);
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
    document.removeEventListener("keydown", onKey, true);
    ["pointermove","pointerdown","keydown"].forEach(function(t){
      document.removeEventListener(t, nudgeIdle, true);
    });
    auto = false;
    syncSceneFlag();
    try { window.dispatchEvent(new Event("resize")); } catch(_){}
    return true;
  }

  function toggle(){ return isOpen() ? close() : open(false); }

  function onKey(e){
    if (e.key !== "Escape") return;
    /* Only claim Escape if no dialog is open - a modal's own close comes
       first, exactly as it does everywhere else in the app. */
    var modalOpen = Array.prototype.some.call(
      document.querySelectorAll(".modal-backdrop"), function(m){ return !m.hidden; });
    if (modalOpen) return;
    e.preventDefault(); e.stopPropagation();
    close();
  }

  /* ----------------------------------------------- orientation behaviour */

  var mq = null;

  function onOrientation(){
    if (!mq) return;
    if (mq.matches){
      /* Sideways phone, immersive turned on: this is the thing the setting
         has always been named after, so it finally does it. */
      if (immersiveOn() && stage() && !isOpen()) open(true);
    } else if (isOpen() && auto){
      /* Rotating back leaves - but only if rotating is what opened it. A
         theatre you opened on purpose stays open. */
      close();
    }
  }

  /* ------------------------------------------------------------- install */

  function installButton(){
    var el = stage();
    if (!el) return false;
    if (el.querySelector(".fh-theater-open")) return true;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "fh-theater-open";
    btn.innerHTML = '<span aria-hidden="true">⛶</span>';
    btn.title = "Theatre mode — the session, full screen";
    btn.setAttribute("aria-label", "Theatre mode");
    /* The stage itself listens for taps to pause; this button must not be
       mistaken for one. */
    btn.addEventListener("pointerdown", function(e){ e.stopPropagation(); });
    btn.addEventListener("click", function(e){ e.preventDefault(); e.stopPropagation(); open(false); });
    el.appendChild(btn);
    return true;
  }

  function boot(){
    ensureCss();
    syncSceneFlag();
    installButton();

    /* The stage is created, destroyed and re-created by the render cycle, so
       the button and the duplicate-portrait flag are re-applied whenever the
       document changes rather than once at startup. */
    try {
      new MutationObserver(function(){
        syncSceneFlag();
        installButton();
      }).observe(document.body, { childList:true, subtree:true });
    } catch(_){}

    try {
      mq = window.matchMedia(LANDSCAPE_QUERY);
      if (mq.addEventListener) mq.addEventListener("change", onOrientation);
      else if (mq.addListener) mq.addListener(onOrientation);
      onOrientation();
    } catch(_){}
  }

  window.FH_THEATER = Object.freeze({
    open: function(){ return open(false); },
    close: close,
    toggle: toggle,
    isOpen: isOpen,
    landscapeQuery: LANDSCAPE_QUERY,
    __sync: syncSceneFlag
  });

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", function(){ setTimeout(boot, 900); });
  } else {
    setTimeout(boot, 900);
  }
})();

/* asset content-type refresh — v10.32.0 */
