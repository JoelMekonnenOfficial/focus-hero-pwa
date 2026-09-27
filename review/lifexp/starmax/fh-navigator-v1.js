/* ==========================================================================
   Life XP — DESKTOP LAYOUT & PROGRESSION NAVIGATOR         fh-navigator-v1.js

   TWO PROBLEMS, ONE FILE.

   1. THE PROGRESSION MENU WAS A SCROLL AWAY.
      Standing, Hardcore, Loot, Forge, the Store - twenty destinations - all
      lived behind a tab strip 1,400px down the page. Every trip to any of them
      began with a scroll, and there was no way to go straight to one.

      Now there is a Progression button in the top bar, next to the other
      global actions where a thing you use constantly belongs. It opens every
      destination at once, typed-to-filter, and going to one switches the tab,
      brings the card into view and marks it - from anywhere on the page, at
      any scroll position. The keyboard route is P.

   2. THE DASHBOARD WASTED MOST OF ITS RIGHT-HAND SIDE.
      The Hero card is tall - portrait, bars, gear, incubator - about 950px.
      Skills sat beside it in a row that Hero had stretched to 950px, so the
      right-hand column held one 116px card and 836px of nothing, and every
      other card was pushed below the fold by dead space.

      The fix is to stop treating the page as rows of unrelated cards and treat
      it as three rails, which is how this kind of screen wants to be read:

          HERO            SESSION              OBJECTIVES
          who you are     what you are doing   what you owe
          (left)          (centre)             (right)

      Skills, Quests, Daily Challenges and the Log stack down the right rail
      and fill the space Hero's height was already paying for. Nothing is
      invented, nothing is removed - the same cards, in an order that means
      something, with the dead space gone.

   Only the `dashboard` layout is touched. The other ten are left exactly as
   they are, so anyone who preferred one still has it.
   ========================================================================== */
(function(){
  "use strict";
  if (window.FH_NAV) return;

  /* Destinations are read from the live tab strip rather than listed here, so
     a tab added later shows up in the menu on its own instead of quietly
     going missing. Only the icon and grouping are editorial. */
  var META = {
    standing:    { icon:"🎖", group:"Standing" },
    hardcore:    { icon:"💀", group:"Standing" },
    targets:     { icon:"🎯", group:"Standing" },
    "quests-v85":{ icon:"📜", group:"Standing" },
    ach:         { icon:"🏆", group:"Standing" },
    trophies:    { icon:"🗿", group:"Standing" },
    loot:        { icon:"⚔", group:"Collection" },
    mounts:      { icon:"🐎", group:"Collection" },
    pets:        { icon:"🐾", group:"Collection" },
    stable:      { icon:"🏠", group:"Collection" },
    vault:       { icon:"🔒", group:"Collection" },
    drops:       { icon:"🎁", group:"Collection" },
    bestiary:    { icon:"📖", group:"Collection" },
    forge:       { icon:"🔨", group:"Economy" },
    store:       { icon:"🛒", group:"Economy" },
    expedition:  { icon:"🌾", group:"Economy" },
    world:       { icon:"🗺", group:"Economy" },
    ledger:      { icon:"🧾", group:"Records" },
    sessions:    { icon:"⏱", group:"Records" },
    heat:        { icon:"🔥", group:"Records" }
  };
  var GROUP_ORDER = ["Standing", "Collection", "Economy", "Records", "More"];

  var CSS_ID = "fh-nav-css";
  var CSS = [
    /* ---------- topbar button ---------- */
    '#fh-nav-btn{position:relative}',
    '#fh-nav-btn[aria-expanded="true"]{background:rgba(var(--accent-rgb,125,211,252),.18);',
    '  border-color:rgba(var(--accent-rgb,125,211,252),.5)}',

    /* ---------- popover ---------- */
    '.fh-nav-pop{position:fixed;z-index:240;width:min(560px,calc(100vw - 28px));',
    '  max-height:min(70vh,620px);display:flex;flex-direction:column;',
    '  background:var(--panel,#141829);border:1px solid var(--border-strong,rgba(255,255,255,.18));',
    '  border-radius:16px;box-shadow:0 22px 60px rgba(0,0,0,.6);overflow:hidden}',
    '.fh-nav-head{padding:10px 12px;border-bottom:1px solid var(--border,rgba(255,255,255,.1));',
    '  display:flex;gap:9px;align-items:center;flex:0 0 auto}',
    '.fh-nav-head input{flex:1;padding:8px 11px;border-radius:10px;font:inherit;font-size:.88rem;',
    '  border:1px solid var(--border,rgba(255,255,255,.16));',
    '  background:var(--panel-2,rgba(255,255,255,.05));color:inherit}',
    '.fh-nav-head input:focus{outline:2px solid rgba(var(--accent-rgb,125,211,252),.55);outline-offset:1px}',
    '.fh-nav-hint{font-size:.68rem;opacity:.45;white-space:nowrap}',
    '.fh-nav-body{overflow:auto;padding:8px 10px 12px;flex:1 1 auto}',
    '.fh-nav-group{margin-top:10px}',
    '.fh-nav-group:first-child{margin-top:2px}',
    '.fh-nav-group>h5{margin:0 0 6px 4px;font-size:.66rem;letter-spacing:.16em;',
    '  text-transform:uppercase;opacity:.45;font-weight:600}',
    '.fh-nav-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(158px,1fr));gap:6px}',
    '.fh-nav-item{display:flex;align-items:center;gap:9px;padding:9px 11px;border-radius:11px;',
    '  cursor:pointer;text-align:left;font:inherit;font-size:.84rem;color:inherit;',
    '  border:1px solid var(--border,rgba(255,255,255,.1));',
    '  background:var(--panel-2,rgba(255,255,255,.04))}',
    '.fh-nav-item:hover,.fh-nav-item.cursor{background:rgba(var(--accent-rgb,125,211,252),.16);',
    '  border-color:rgba(var(--accent-rgb,125,211,252),.5)}',
    '.fh-nav-item .ic{font-size:1.02rem;line-height:1;flex:0 0 auto}',
    '.fh-nav-item.on{border-color:rgba(var(--accent-rgb,125,211,252),.55);font-weight:600}',
    '.fh-nav-empty{padding:18px 6px;opacity:.5;font-size:.84rem}',

    /* ---------- the card you were sent to, briefly marked ---------- */
    '@keyframes fhNavFlash{0%{box-shadow:0 0 0 0 rgba(var(--accent-rgb,125,211,252),.55)}',
    '  100%{box-shadow:0 0 0 16px rgba(var(--accent-rgb,125,211,252),0)}}',
    '.fh-nav-landed{animation:fhNavFlash 900ms ease-out 1}',

    /* ================= DASHBOARD: three rails =================

       The doubled attribute - [data-layout="dashboard"][data-layout] - is not
       a typo. Another module injects its own layout stylesheet at boot, and it
       lands after this one in the cascade, so an equally specific rule here
       silently loses. Matching the attribute twice raises specificity by one
       and settles it, which is a good deal less brittle than !important and
       leaves the other ten layouts untouched. */
    '@media (min-width:1100px){',
    '  html[data-layout="dashboard"][data-layout] .hero-card{grid-column:1/4;grid-row:2 / span 4;align-self:start}',
    '  html[data-layout="dashboard"][data-layout] .timer-card{grid-column:4/10;grid-row:2 / span 4;align-self:start}',
    '  html[data-layout="dashboard"][data-layout] [aria-labelledby="tasks-heading"]{grid-column:10/13;grid-row:2;align-self:start}',
    '  html[data-layout="dashboard"][data-layout] [aria-labelledby="quest-heading"]{grid-column:10/13;grid-row:3;align-self:start}',
    '  html[data-layout="dashboard"][data-layout] [aria-labelledby="daily-heading"]{grid-column:10/13;grid-row:4;align-self:start}',
    '  html[data-layout="dashboard"][data-layout] [aria-labelledby="log-heading"]{grid-column:10/13;grid-row:5;align-self:start}',
    '  html[data-layout="dashboard"][data-layout] [aria-labelledby="tabs-heading"]{grid-column:1/13;grid-row:6}',
    '}'
  ].join("\n");

  function ensureCss(){
    if (document.getElementById(CSS_ID)) return;
    var el = document.createElement("style");
    el.id = CSS_ID; el.textContent = CSS;
    document.head.appendChild(el);
  }

  function esc(v){
    return String(v == null ? "" : v).replace(/[&<>"']/g, function(c){
      return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c];
    });
  }

  function tabButtons(){
    return Array.prototype.slice.call(
      document.querySelectorAll(".tabs button[role='tab'][data-tab]"));
  }

  function destinations(){
    return tabButtons().map(function(btn){
      var key = btn.dataset.tab;
      var meta = META[key] || {};
      return {
        key: key,
        label: (btn.textContent || key).trim(),
        icon: meta.icon || "◆",
        group: meta.group || "More",
        current: btn.getAttribute("aria-pressed") === "true"
      };
    });
  }

  /* ------------------------------------------------------------------ go */

  var pop = null;

  function goTo(key){
    var btn = document.querySelector(".tabs button[role='tab'][data-tab='" + key + "']");
    if (!btn) return false;
    close();

    /* The panel-switching layouts (deck, dock, split) show one card at a time.
       Scrolling would do nothing there - the card is not hidden below the
       fold, it is not mounted - so the panel has to be switched instead. */
    var root = document.documentElement;
    if (root.hasAttribute("data-active-panel")){
      root.setAttribute("data-active-panel", "section-progress");
      var navBtn = document.querySelector(".app-nav button[data-nav-target='section-progress']");
      if (navBtn){
        document.querySelectorAll(".app-nav button[aria-current]").forEach(function(b){
          b.removeAttribute("aria-current");
        });
        navBtn.setAttribute("aria-current", "page");
      }
    }

    btn.click();

    var card = document.getElementById("section-progress") ||
               document.querySelector("[aria-labelledby='tabs-heading']");
    if (card){
      try { card.scrollIntoView({ behavior:"smooth", block:"start" }); }
      catch(_){ card.scrollIntoView(); }
      card.classList.remove("fh-nav-landed");
      void card.offsetWidth;                 /* restart the animation */
      card.classList.add("fh-nav-landed");
      setTimeout(function(){ card.classList.remove("fh-nav-landed"); }, 1000);
    }
    return true;
  }

  /* --------------------------------------------------------------- popover */

  function close(){
    if (!pop) return;
    var btn = document.getElementById("fh-nav-btn");
    if (btn) btn.setAttribute("aria-expanded", "false");
    if (pop.parentNode) pop.parentNode.removeChild(pop);
    pop = null;
    document.removeEventListener("pointerdown", onAway, true);
    document.removeEventListener("keydown", onKeys, true);
  }

  function onAway(e){
    var btn = document.getElementById("fh-nav-btn");
    if (pop && !pop.contains(e.target) && e.target !== btn && !(btn && btn.contains(e.target))) close();
  }

  function visibleItems(){
    return pop ? Array.prototype.slice.call(pop.querySelectorAll(".fh-nav-item")) : [];
  }

  function moveCursor(step){
    var items = visibleItems();
    if (!items.length) return;
    var at = items.findIndex(function(el){ return el.classList.contains("cursor"); });
    var next = at < 0 ? 0 : (at + step + items.length) % items.length;
    items.forEach(function(el){ el.classList.remove("cursor"); });
    items[next].classList.add("cursor");
    try { items[next].scrollIntoView({ block:"nearest" }); } catch(_){}
  }

  function onKeys(e){
    if (!pop) return;
    if (e.key === "Escape"){ e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key === "ArrowDown"){ e.preventDefault(); moveCursor(1); return; }
    if (e.key === "ArrowUp"){ e.preventDefault(); moveCursor(-1); return; }
    if (e.key === "Enter"){
      var cur = pop.querySelector(".fh-nav-item.cursor") || visibleItems()[0];
      if (cur){ e.preventDefault(); goTo(cur.dataset.key); }
    }
  }

  function paint(filter){
    var body = pop.querySelector(".fh-nav-body");
    var q = String(filter || "").trim().toLowerCase();
    var rows = destinations().filter(function(d){
      return !q || d.label.toLowerCase().indexOf(q) >= 0 || d.key.indexOf(q) >= 0;
    });
    if (!rows.length){
      body.innerHTML = '<div class="fh-nav-empty">Nothing matches that.</div>';
      return;
    }
    var byGroup = {};
    rows.forEach(function(d){ (byGroup[d.group] = byGroup[d.group] || []).push(d); });
    var html = [];
    GROUP_ORDER.forEach(function(g){
      if (!byGroup[g]) return;
      html.push('<div class="fh-nav-group"><h5>', esc(g), '</h5><div class="fh-nav-grid">');
      byGroup[g].forEach(function(d){
        html.push('<button type="button" class="fh-nav-item', d.current ? ' on' : '',
                  '" data-key="', esc(d.key), '">',
                  '<span class="ic" aria-hidden="true">', esc(d.icon), '</span>',
                  '<span>', esc(d.label), '</span></button>');
      });
      html.push('</div></div>');
    });
    body.innerHTML = html.join("");
    var first = body.querySelector(".fh-nav-item");
    if (q && first) first.classList.add("cursor");
    body.querySelectorAll(".fh-nav-item").forEach(function(el){
      el.addEventListener("click", function(){ goTo(el.dataset.key); });
    });
  }

  function open(){
    ensureCss();
    if (pop){ close(); return; }
    var btn = document.getElementById("fh-nav-btn");
    pop = document.createElement("div");
    pop.className = "fh-nav-pop";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", "Go to progression");
    pop.innerHTML =
      '<div class="fh-nav-head">' +
        '<input type="text" placeholder="Go to… (Standing, Forge, Loot)" aria-label="Filter destinations">' +
        '<span class="fh-nav-hint">↵ go · esc close</span>' +
      '</div><div class="fh-nav-body"></div>';
    document.body.appendChild(pop);
    paint("");

    var input = pop.querySelector("input");
    input.addEventListener("input", function(){ paint(input.value); });

    /* Anchor under the button, then pull back inside the viewport. */
    var r = btn ? btn.getBoundingClientRect() : { bottom: 60, left: 40, width: 0 };
    pop.style.top = Math.min(r.bottom + 8, window.innerHeight - pop.offsetHeight - 12) + "px";
    pop.style.left = Math.max(12, Math.min(r.left, window.innerWidth - pop.offsetWidth - 12)) + "px";

    if (btn) btn.setAttribute("aria-expanded", "true");
    try { input.focus(); } catch(_){}
    setTimeout(function(){
      document.addEventListener("pointerdown", onAway, true);
      document.addEventListener("keydown", onKeys, true);
    }, 0);
  }

  /* ------------------------------------------------------------- install */

  function installButton(){
    if (document.getElementById("fh-nav-btn")) return true;
    var actions = document.querySelector("header.topbar .actions");
    if (!actions) return false;
    var btn = document.createElement("button");
    btn.id = "fh-nav-btn";
    btn.type = "button";
    btn.title = "Progression — Standing, Hardcore, Loot, Forge… (P)";
    btn.setAttribute("aria-label", "Open progression menu");
    btn.setAttribute("aria-haspopup", "dialog");
    btn.setAttribute("aria-expanded", "false");
    btn.textContent = "Progression";
    btn.addEventListener("click", function(e){ e.preventDefault(); open(); });
    var before = document.getElementById("btn-variants");
    if (before) actions.insertBefore(btn, before); else actions.appendChild(btn);
    return true;
  }

  /* P opens the menu. It is a navigation key - it shows you a thing, it never
     changes a session - so it sits in the safe group with Settings and Theme,
     and it is listed in Settings alongside every other shortcut. */
  function registerShortcut(){
    var table = window.SHORTCUT_TABLE;
    if (!Array.isArray(table)) return;
    if (table.some(function(row){ return row && row.keys === "P"; })) return;
    table.push({ keys:"P", what:"Open the progression menu", group:"safe" });
    if (typeof window.renderShortcutList === "function"){
      try { window.renderShortcutList(); } catch(_){}
    }
  }

  function onKeydown(e){
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var t = e.target || {};
    var tag = (t.tagName || "").toUpperCase();
    if (/INPUT|TEXTAREA|SELECT/.test(tag) || t.isContentEditable) return;
    if (String(e.key).toLowerCase() !== "p") return;
    /* Honour the master shortcut switch, exactly like every other key. */
    var s = window.state;
    if (s && s.settings && s.settings.fhShortcuts === false) return;
    var modalOpen = Array.prototype.some.call(
      document.querySelectorAll(".modal-backdrop"), function(m){ return !m.hidden; });
    if (modalOpen) return;
    e.preventDefault();
    open();
  }

  function boot(){
    ensureCss();
    if (!installButton()){ setTimeout(boot, 500); return; }
    registerShortcut();
    document.addEventListener("keydown", onKeydown);
    window.addEventListener("resize", function(){ if (pop) close(); });
  }

  window.FH_NAV = Object.freeze({
    open: open, close: close, goTo: goTo,
    destinations: destinations,
    isOpen: function(){ return !!pop; }
  });

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", function(){ setTimeout(boot, 500); });
  } else {
    setTimeout(boot, 500);
  }
})();

/* asset content-type refresh — v10.32.0 */
