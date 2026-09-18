/*
 * Life XP visual identity v13
 *
 * Presentation only. This module never reads or writes player state, browser
 * storage, cloud data, or network resources. Every icon is an original,
 * deterministic inline SVG drawn on the same 24 x 24 grid.
 */
(function (global) {
  "use strict";

  var document = global && global.document;
  var NS = "fh-identity-v13";

  var ICONS = Object.freeze({
    focus:'<circle cx="12" cy="12" r="7.5"/><path d="M12 4.5V2.8M19.5 12h1.7M12 19.5v1.7M4.5 12H2.8"/><path d="M12 8.2v4l2.8 1.7"/><circle class="fh-icon-core" cx="12" cy="12" r="1.15"/>',
    skills:'<path d="M5 5.5h11.5a2 2 0 0 1 2 2v11H7a2 2 0 0 1-2-2z"/><path d="M8 2.8h9.5a2 2 0 0 1 2 2v10.7M8.2 9.2l1.5 1.5 3-3M8.2 14.8h6.5"/>',
    hero:'<path d="M7.2 9.4V7.1L12 3.2l4.8 3.9v2.3"/><path d="M7.2 9.4c0 4 1.9 6.7 4.8 8.2 2.9-1.5 4.8-4.2 4.8-8.2L12 7.2z"/><path d="M9.3 19.2 12 21l2.7-1.8"/>',
    rewards:'<path d="M4 9.2h16v10.5H4zM3 6.3h18v3H3zM12 6.3v13.4M8.2 3.4c1.7 0 3.8 2.9 3.8 2.9S8.5 6.7 7 5.8c-1.3-.8-.5-2.4 1.2-2.4ZM15.8 3.4c-1.7 0-3.8 2.9-3.8 2.9s3.5.4 5-.5c1.3-.8.5-2.4-1.2-2.4Z"/>',
    log:'<path d="M6 3.5h12v17H6zM9 3.5v-1M15 3.5v-1M9 8h6M9 12h6M9 16h4"/><circle class="fh-icon-core" cx="7.6" cy="8" r=".55"/><circle class="fh-icon-core" cx="7.6" cy="12" r=".55"/><circle class="fh-icon-core" cx="7.6" cy="16" r=".55"/>',
    sessions:'<path d="M5 4v16M19 4v16M5 8h14M5 16h14"/><circle cx="12" cy="12" r="2.3"/><path d="M12 10.6v1.7l1.2.8"/>',
    menu:'<rect x="3.5" y="3.5" width="6" height="6" rx="1.2"/><rect x="14.5" y="3.5" width="6" height="6" rx="1.2"/><rect x="3.5" y="14.5" width="6" height="6" rx="1.2"/><rect x="14.5" y="14.5" width="6" height="6" rx="1.2"/>',
    targets:'<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.6"/><circle class="fh-icon-core" cx="12" cy="12" r="1.25"/><path d="m15.3 8.7 4.8-4.8M16.9 4h3.2v3.2"/>',
    expedition:'<circle cx="12" cy="12" r="8.7"/><path d="m14.9 9.1-1.6 4.2-4.2 1.6 1.6-4.2z"/><circle class="fh-icon-core" cx="12" cy="12" r=".8"/>',
    loot:'<path d="M5.2 9h13.6l-1 10.5H6.2zM4 6.2h16V9H4zM8 6.2c0-2.4 1.4-3.6 4-3.6s4 1.2 4 3.6M12 9v10.5"/>',
    challenges:'<path d="M6 21V3.2M6.2 4h10.6l-2.4 3.3 2.4 3.3H6.2"/><path d="m9.2 15.5 1.7 1.7 4-4"/>',
    world:'<circle cx="12" cy="12" r="8.7"/><path d="M3.5 12h17M12 3.3c2.4 2.4 3.5 5.3 3.5 8.7S14.4 18.3 12 20.7M12 3.3C9.6 5.7 8.5 8.6 8.5 12s1.1 6.3 3.5 8.7"/>',
    vault:'<path d="M4 20V8.2a8 8 0 0 1 16 0V20z"/><circle cx="12" cy="12.2" r="4.2"/><path d="M12 9.4v5.6M9.2 12.2h5.6"/><circle class="fh-icon-core" cx="12" cy="12.2" r=".8"/>',
    stable:'<path d="M7 4.2c-2.1 1.7-3.2 4.1-3.2 7.2 0 4.8 3.2 8.3 8.2 8.3s8.2-3.5 8.2-8.3c0-3.1-1.1-5.5-3.2-7.2v5.1c0 3.2-1.9 5.3-5 5.3S7 12.5 7 9.3z"/><path d="M7 4.2h3M14 4.2h3"/>',
    mounts:'<path d="M5 16.5c1.3-4.2 3.5-7.2 7-9l4.5 1.2 2.2 3.6-2 1.8-2.2-1.7-2.5 1.1-1.8 3z"/><path d="M7 16.5v3M15.8 15.2v4.3M11.8 7.7l-.8-3.2 3.1 2.5"/>',
    pets:'<path d="M7.2 12.2c2.4-2.8 7.2-2.8 9.6 0 2.8 3.2.3 6.7-4.8 6.7s-7.6-3.5-4.8-6.7Z"/><circle cx="6.1" cy="7.8" r="2"/><circle cx="10.1" cy="5.5" r="2"/><circle cx="17.9" cy="7.8" r="2"/><circle cx="13.9" cy="5.5" r="2"/>',
    drops:'<path d="M12 2.8c3.1 4.2 6.4 7.9 6.4 11.5A6.4 6.4 0 0 1 5.6 14.3C5.6 10.7 8.9 7 12 2.8Z"/><path d="M9 15.2c.5 1.2 1.5 1.8 3 1.8"/>',
    forge:'<path d="M4 16.5h16l-2.2 3.2H6.2zM6.4 12.4h11.2l-2.2 4.1H8.6z"/><path d="m9 9 5-5 2 2-5 5M14.3 3.7l2.1-1.1 2 2-1.1 2.1"/>',
    trophies:'<path d="M8 3.5h8v4.8c0 3.1-1.4 5.2-4 6.2-2.6-1-4-3.1-4-6.2zM9.2 20.5h5.6M12 14.5v6M8 6H4.2v1.7c0 2.3 1.3 3.6 4.3 3.7M16 6h3.8v1.7c0 2.3-1.3 3.6-4.3 3.7"/>',
    achievements:'<circle cx="12" cy="9" r="6.2"/><path d="m8.6 14.1-1 7 4.4-2.7 4.4 2.7-1-7"/><path d="m12 5.3 1 2 2.2.3-1.6 1.6.4 2.2-2-1-2 1 .4-2.2-1.6-1.6 2.2-.3z"/>',
    store:'<path d="M4 9.3h16v11H4zM3 5h18l-1 4.3H4zM8 9.3v11M16 9.3v11M8 14h8"/>',
    ledger:'<path d="M5 4.2h11.5A2.5 2.5 0 0 1 19 6.7v13.1H7.5A2.5 2.5 0 0 1 5 17.3z"/><path d="M8 4.2v15.6M11 8h5M11 12h5M11 16h3"/>',
    heatmap:'<rect x="3.5" y="3.5" width="4" height="4" rx=".7"/><rect x="10" y="3.5" width="4" height="4" rx=".7"/><rect x="16.5" y="3.5" width="4" height="4" rx=".7"/><rect x="3.5" y="10" width="4" height="4" rx=".7"/><rect x="10" y="10" width="4" height="4" rx=".7"/><rect x="16.5" y="10" width="4" height="4" rx=".7"/><rect x="3.5" y="16.5" width="4" height="4" rx=".7"/><rect x="10" y="16.5" width="4" height="4" rx=".7"/><rect x="16.5" y="16.5" width="4" height="4" rx=".7"/>',
    check:'<path d="m5 12.3 4.1 4.1L19.2 6.3"/>',
    coin:'<circle cx="12" cy="12" r="8.5"/><path d="M14.8 8.5c-.7-.6-1.6-.9-2.7-.9-1.5 0-2.7.7-2.7 1.8 0 2.8 5.5 1.2 5.5 4 0 1.2-1.2 2-2.9 2-1.2 0-2.3-.4-3.1-1.1M12 5.7v12.6"/>',
    lock:'<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v2.4"/>',
    trash:'<path d="M6 7h12l-1 13H7zM4.5 7h15M9 7V4h6v3M10 10.5v6M14 10.5v6"/>',
    targetSupply:'<path d="M4.5 8.5h15v11h-15zM3.5 6h17v2.5h-17zM8 6c0-2 1.3-3 4-3s4 1 4 3M12 8.5v11"/><path class="fh-icon-accent" d="M8.5 13h7"/>',
    targetRoyal:'<path d="M4.5 9h15v10.5h-15zM3.5 6.5h17V9h-17zM12 9v10.5"/><path class="fh-icon-accent" d="m7.5 6.5 1.2-3 3.3 2 3.3-2 1.2 3"/><circle class="fh-icon-core" cx="12" cy="14" r="1.2"/>',
    targetLegendary:'<path d="M4 9h16v10.5H4zM3 6.5h18V9H3zM12 9v10.5"/><path class="fh-icon-accent" d="M12 2.5 13.2 5l2.8.4-2 2 .5 2.8-2.5-1.3-2.5 1.3.5-2.8-2-2 2.8-.4z"/>',
    history:'<path d="M4 5h11M4 10h9M4 15h7M4 20h5"/><path d="M17.5 11.5v4l2.7 1.6"/><path d="M14.6 9.7a5.2 5.2 0 1 1-1.2 6.1"/>'
  });

  var NAV_ICONS = Object.freeze({
    "section-focus":"focus",
    "section-tasks":"skills",
    "section-hero":"hero",
    "section-progress":"rewards",
    "section-log":"log"
  });

  var ACTION_ICONS = Object.freeze({ sessions:"sessions", "all-tasks":"menu" });

  var TAB_ICONS = Object.freeze({
    targets:"targets", expedition:"expedition", loot:"loot", "quests-v85":"challenges",
    world:"world", vault:"vault", stable:"stable", mounts:"mounts", pets:"pets",
    drops:"drops", forge:"forge", trophies:"trophies", ach:"achievements", store:"store",
    ledger:"ledger", sessions:"sessions", heat:"heatmap"
  });

  function icon(name, className) {
    var paths = ICONS[name];
    if (!paths) throw new Error("Unknown Life XP icon: " + name);
    var classes = "fh-icon" + (className ? " " + className : "");
    return '<svg class="' + classes + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">' + paths + '</svg>';
  }

  function brandMark(className) {
    var classes = "fh-brand-mark" + (className ? " " + className : "");
    return '<svg class="' + classes + '" viewBox="0 0 64 64" aria-hidden="true" focusable="false">' +
      '<path class="fh-brand-ring" d="M32 5 49 14.5 59 32 49 49.5 32 59 15 49.5 5 32 15 14.5Z"/>' +
      '<path class="fh-brand-lens" d="M12 32c5.5-9.7 12.2-14.5 20-14.5S46.5 22.3 52 32c-5.5 9.7-12.2 14.5-20 14.5S17.5 41.7 12 32Z"/>' +
      '<path class="fh-brand-core" d="M32 21 39 32 32 43 25 32Z"/>' +
      '<circle class="fh-brand-spark" cx="32" cy="32" r="2.8"/>' +
      '</svg>';
  }

  var CSS = [
    '.fh-icon{display:inline-block;width:1em;height:1em;flex:0 0 auto;overflow:visible;color:currentColor;vertical-align:-.14em}',
    '.fh-icon .fh-icon-core{fill:currentColor;stroke:none}',
    '.fh-icon .fh-icon-accent{stroke:var(--fh-gold,#f3c969)}',
    '.fh-brand-mark{display:block;width:100%;height:100%}',
    '.fh-brand-ring{fill:none;stroke:#56ddc1;stroke-width:3;stroke-linejoin:round}',
    '.fh-brand-lens{fill:#0b2029;stroke:#f3c969;stroke-width:3;stroke-linejoin:round}',
    '.fh-brand-core{fill:#56ddc1}',
    '.fh-brand-spark{fill:#fff2bd}',
    '.brand .logo{background:#07131c!important;box-shadow:0 9px 28px rgba(17,190,160,.18)!important}',
    '.brand .logo img{object-fit:cover}',
    '.app-nav button>span.fh-nav-icon{display:grid;place-items:center;width:24px;height:24px;font-size:24px;line-height:1}',
    '.app-nav .fh-nav-icon .fh-icon{width:22px;height:22px;stroke-width:1.65}',
    '.app-nav button[aria-current="page"] .fh-nav-icon{color:var(--accent-2,#56ddc1)}',
    '.tabs button>.fh-tab-icon{display:inline-grid;place-items:center;margin-right:.36rem;vertical-align:-.12rem}',
    '.tabs button>.fh-tab-icon .fh-icon{width:1rem;height:1rem;stroke-width:1.8}',
    '.fh-identity-inline-icon{display:inline-grid;place-items:center;width:1.08em;height:1.08em;margin-right:.35em;vertical-align:-.16em}',
    '.fh-identity-inline-icon .fh-icon{width:100%;height:100%}',
    '#coin-hud .fh-identity-inline-icon{color:#f3c969;margin-right:.28rem}',
    '#tab-targets .fht-card{--fh-target-a:var(--accent,#56ddc1);--fh-target-b:var(--accent-2,#7aa7ff);position:relative;overflow:hidden;border:1px solid color-mix(in srgb,var(--fh-target-a) 30%,var(--border,rgba(255,255,255,.12)));border-radius:22px;padding:16px;background:radial-gradient(circle at 100% 0,color-mix(in srgb,var(--fh-target-a) 13%,transparent),transparent 38%),linear-gradient(145deg,rgba(255,255,255,.045),rgba(255,255,255,.012)),var(--panel-2,#101820)}',
    '#tab-targets .fht-card:before{content:"";position:absolute;inset:0 0 auto;height:2px;background:linear-gradient(90deg,transparent,var(--fh-target-a),#f3c969,transparent);opacity:.72}',
    '#tab-targets .fht-card>h3.fh-target-heading{display:grid;grid-template-columns:44px minmax(0,1fr);align-items:center;gap:11px;margin:0 0 14px}',
    '.fh-target-heading-icon{display:grid;place-items:center;width:44px;height:44px;border:1px solid color-mix(in srgb,var(--fh-target-a) 42%,transparent);border-radius:14px;color:var(--fh-target-a);background:color-mix(in srgb,var(--fh-target-a) 10%,transparent)}',
    '.fh-target-heading-icon .fh-icon{width:25px;height:25px}',
    '.fh-target-heading-copy{display:grid;gap:2px;min-width:0}',
    '.fh-target-heading-copy strong{font-size:.98rem;color:var(--ink,#f7fbff);letter-spacing:.01em}',
    '.fh-target-heading-copy small{font-size:.67rem;line-height:1.35;color:var(--ink-dim,#9aa6b2);font-weight:500}',
    '#tab-targets .fht-row{margin:10px 0;padding:11px 12px;border:1px solid rgba(255,255,255,.07);border-radius:15px;background:rgba(0,0,0,.13)}',
    '#tab-targets .fht-head{align-items:baseline;gap:10px}',
    '#tab-targets .fht-head b{font-size:.78rem;letter-spacing:.045em;text-transform:uppercase}',
    '#tab-targets .fht-track{height:9px;margin:11px 0 10px;border-radius:999px;overflow:visible;background:rgba(0,0,0,.32);box-shadow:inset 0 0 0 1px rgba(255,255,255,.05)}',
    '#tab-targets .fht-fill{border-radius:999px;background:linear-gradient(90deg,var(--fh-target-a),var(--fh-target-b),#f3c969);box-shadow:0 0 16px color-mix(in srgb,var(--fh-target-a) 28%,transparent)}',
    '#tab-targets .fht-mark{display:grid;place-items:center;top:-5px;width:19px;height:19px;margin-left:-9.5px;padding:0;border-radius:50%;font-size:0;background:var(--panel,#101820);border:2px solid color-mix(in srgb,var(--ink-dim,#9aa) 58%,transparent);box-shadow:0 3px 10px rgba(0,0,0,.26)}',
    '#tab-targets .fht-mark.done{color:#07131c;background:#56ddc1;border-color:#b9ffef}',
    '#tab-targets .fht-mark .fh-icon{width:12px;height:12px;stroke-width:2.6}',
    '#tab-targets .fht-tiers{gap:6px}',
    '#tab-targets .fht-tier{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border:1px solid rgba(255,255,255,.07);border-radius:999px;background:rgba(255,255,255,.035)}',
    '#tab-targets .fht-tier.done{color:#aef8e7;border-color:rgba(86,221,193,.34);background:rgba(86,221,193,.09)}',
    '#tab-targets .fht-tier .fh-icon{width:11px;height:11px;stroke-width:2.4}',
    '#tab-targets .fht-chests{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:9px 0 13px}',
    '#tab-targets .fht-chest{position:relative;min-height:118px;padding:11px 9px;border:1px solid rgba(255,255,255,.09);border-radius:16px;background:linear-gradient(155deg,rgba(255,255,255,.05),rgba(255,255,255,.012));text-align:left}',
    '#tab-targets .fht-chest:after{content:"";position:absolute;inset:auto 10px 0;height:2px;border-radius:2px;background:var(--fh-tier-color,#73808c);opacity:.62}',
    '#tab-targets .fht-chest[data-fh-target-tier="supply"]{--fh-tier-color:#7dd3b0}',
    '#tab-targets .fht-chest[data-fh-target-tier="royal"]{--fh-tier-color:#78a9ff}',
    '#tab-targets .fht-chest[data-fh-target-tier="legendary"]{--fh-tier-color:#f3c969}',
    '#tab-targets .fht-chest.opened{border-color:color-mix(in srgb,#56ddc1 48%,transparent);background:linear-gradient(155deg,rgba(86,221,193,.13),rgba(86,221,193,.025))}',
    '#tab-targets .fht-chest.ready{border-color:color-mix(in srgb,#f3c969 56%,transparent);background:linear-gradient(155deg,rgba(243,201,105,.13),rgba(243,201,105,.025));box-shadow:0 10px 28px rgba(0,0,0,.16)}',
    '#tab-targets .fht-chest .sym{display:grid;place-items:center;width:38px;height:38px;margin:0 0 7px;border:1px solid color-mix(in srgb,var(--fh-tier-color) 45%,transparent);border-radius:12px;color:var(--fh-tier-color);background:color-mix(in srgb,var(--fh-tier-color) 10%,transparent)}',
    '#tab-targets .fht-chest .sym .fh-icon{width:24px;height:24px;stroke-width:1.65}',
    '#tab-targets .fht-chest b{margin-top:0;font-size:.72rem;line-height:1.28;white-space:normal}',
    '#tab-targets .fht-chest span:not(.sym){font-size:.61rem;line-height:1.35}',
    '#tab-targets .fht-note{margin-top:4px;padding:10px 11px;border-left:2px solid color-mix(in srgb,var(--fh-target-a) 58%,transparent);border-radius:0 10px 10px 0;background:rgba(0,0,0,.11);line-height:1.45}',
    '#tab-targets .fht-view-switch{display:flex;gap:6px;padding:4px;margin:0 0 12px;border:1px solid rgba(255,255,255,.07);border-radius:13px;background:rgba(0,0,0,.13)}',
    '#tab-targets .fht-view-switch button{display:flex;align-items:center;justify-content:center;gap:6px;min-height:38px;flex:1;border-radius:9px}',
    '#tab-targets .fht-view-switch .fh-icon{width:15px;height:15px}',
    '#toasts .fh-target-toast-icon{display:inline-grid;place-items:center;width:24px;height:24px;margin-right:8px;color:#f3c969;vertical-align:middle}',
    '#toasts .fh-target-toast-icon .fh-icon{width:22px;height:22px}',
    '@media(max-width:560px){#tab-targets .fht-card{padding:13px;border-radius:18px}#tab-targets .fht-chests{grid-template-columns:1fr}#tab-targets .fht-chest{display:grid;grid-template-columns:40px minmax(0,1fr);grid-template-rows:auto auto;column-gap:10px;min-height:0;text-align:left}#tab-targets .fht-chest .sym{grid-row:1/3;margin:0}#tab-targets .fht-chest b{align-self:end}#tab-targets .fht-chest span:not(.sym){align-self:start}}',
    '@media(max-width:360px){html .app-nav button{padding:.32rem .08rem}html .app-nav button b{max-width:100%;overflow:hidden;font-size:.52rem;line-height:1.05;letter-spacing:-.015em;text-overflow:clip;white-space:nowrap}html .character-tabs button{padding:.45rem .08rem;font-size:.6rem;line-height:1.15;overflow-wrap:normal;word-break:keep-all;hyphens:none}html .sr-hud{grid-template-columns:minmax(0,1fr)}html .stable-header{grid-template-columns:minmax(0,1fr);gap:9px}html .stable-collected{display:flex;align-items:baseline;gap:6px;text-align:left}html .stable-collected b{display:inline;font-size:1.1rem}html .stable-progress-tiers{gap:2px;font-size:.55rem}}',
    '@media(prefers-reduced-motion:reduce){#tab-targets .fht-fill{transition:none}}'
  ].join("");

  function ensureStyle() {
    if (!document || document.getElementById(NS + "-style")) return;
    var style = document.createElement("style");
    style.id = NS + "-style";
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  function iconSlot(className, iconName) {
    var span = document.createElement("span");
    span.className = className;
    span.setAttribute("aria-hidden", "true");
    span.innerHTML = icon(iconName);
    return span;
  }

  function decorateButton(button, iconName, slotClass) {
    if (!button || !iconName) return false;
    var slot = button.querySelector(":scope > ." + slotClass);
    if (!slot) {
      slot = iconSlot(slotClass, iconName);
      button.insertBefore(slot, button.firstChild);
    } else if (slot.dataset.fhIcon !== iconName) {
      slot.innerHTML = icon(iconName);
    }
    slot.dataset.fhIcon = iconName;
    return true;
  }

  function decorateNavigation() {
    if (!document) return 0;
    var count = 0;
    Object.keys(NAV_ICONS).forEach(function (target) {
      var button = document.querySelector('.app-nav [data-nav-target="' + target + '"]');
      if (!button) return;
      var old = button.querySelector(":scope > span:not(.fh-nav-icon)");
      if (old) old.remove();
      if (target === "section-tasks") {
        var label = button.querySelector(":scope > b");
        if (label) label.textContent = "Skills";
      }
      if (decorateButton(button, NAV_ICONS[target], "fh-nav-icon")) count++;
    });
    Object.keys(ACTION_ICONS).forEach(function (action) {
      var button = document.querySelector('.app-nav [data-nav-action="' + action + '"]');
      if (!button) return;
      var old = button.querySelector(":scope > span:not(.fh-nav-icon)");
      if (old) old.remove();
      if (decorateButton(button, ACTION_ICONS[action], "fh-nav-icon")) count++;
    });
    return count;
  }

  function decorateProgressTabs() {
    if (!document) return 0;
    var count = 0;
    Object.keys(TAB_ICONS).forEach(function (tab) {
      var button = document.querySelector('.tabs [data-tab="' + tab + '"]');
      if (decorateButton(button, TAB_ICONS[tab], "fh-tab-icon")) count++;
    });
    return count;
  }

  function removeKnownPrefix(node, prefix) {
    if (!node) return;
    Array.prototype.some.call(node.childNodes, function (child) {
      if (child.nodeType !== 3) return false;
      if (child.nodeValue.indexOf(prefix) < 0) return false;
      child.nodeValue = child.nodeValue.replace(prefix, "").replace(/^\s+/, "");
      return true;
    });
  }

  function decorateChrome() {
    if (!document) return 0;
    var count = 0;
    var coin = document.getElementById("coin-hud");
    if (coin && !coin.querySelector(":scope > .fh-identity-inline-icon")) {
      removeKnownPrefix(coin, "\ud83e\ude99");
      coin.insertBefore(iconSlot("fh-identity-inline-icon", "coin"), coin.firstChild);
      count++;
    }
    var lockToggle = document.getElementById("tog-gamemode");
    var lockLabel = lockToggle && lockToggle.closest(".form-row") && lockToggle.closest(".form-row").querySelector("label");
    if (lockLabel && !lockLabel.querySelector(":scope > .fh-identity-inline-icon")) {
      removeKnownPrefix(lockLabel, "\ud83d\udd12");
      lockLabel.insertBefore(iconSlot("fh-identity-inline-icon", "lock"), lockLabel.firstChild);
      count++;
    }
    ["btn-session-edit-delete", "xp-edit-delete"].forEach(function (id) {
      var button = document.getElementById(id);
      if (!button || button.querySelector(":scope > .fh-identity-inline-icon")) return;
      removeKnownPrefix(button, "\ud83d\uddd1");
      removeKnownPrefix(button, "\ufe0f");
      button.insertBefore(iconSlot("fh-identity-inline-icon", "trash"), button.firstChild);
      count++;
    });
    return count;
  }

  function targetTier(card, index) {
    var title = (card.getAttribute("title") || "").toLowerCase();
    if (title.indexOf("legendary") >= 0) return "legendary";
    if (title.indexOf("royal") >= 0) return "royal";
    if (title.indexOf("supply") >= 0) return "supply";
    return ["supply", "royal", "legendary"][index % 3];
  }

  function decorateTargetHeading(panel) {
    var headings = panel.querySelectorAll(".fht-card > h3");
    Array.prototype.forEach.call(headings, function (heading) {
      if (heading.dataset.fhIdentity === "heading") return;
      heading.className = (heading.className ? heading.className + " " : "") + "fh-target-heading";
      heading.dataset.fhIdentity = "heading";
      heading.innerHTML = '<span class="fh-target-heading-icon" aria-hidden="true">' + icon("targets") + '</span><span class="fh-target-heading-copy"><strong>Focus Targets</strong><small>Adaptive daily and weekly milestones with automatic XP and loot</small></span>';
    });
  }

  function decorateTargetCards(panel) {
    var cards = panel.querySelectorAll(".fht-chest");
    Array.prototype.forEach.call(cards, function (card, index) {
      var tier = targetTier(card, index);
      card.dataset.fhTargetTier = tier;
      var symbol = card.querySelector(":scope > .sym");
      if (!symbol || symbol.dataset.fhIdentity === tier) return;
      symbol.dataset.fhIdentity = tier;
      symbol.innerHTML = icon(tier === "legendary" ? "targetLegendary" : tier === "royal" ? "targetRoyal" : "targetSupply");
    });
  }

  function decorateTargetProgress(panel) {
    var rows = panel.querySelectorAll(".fht-row");
    Array.prototype.forEach.call(rows, function (row) {
      Array.prototype.forEach.call(row.querySelectorAll(".fht-mark"), function (mark, index) {
        mark.dataset.fhTargetTier = ["supply", "royal", "legendary"][index] || "supply";
        if (mark.classList.contains("done") && !mark.querySelector(":scope > svg.fh-icon")) mark.innerHTML = icon("check");
        else if (mark.querySelector("svg")) mark.textContent = "";
      });
      Array.prototype.forEach.call(row.querySelectorAll(".fht-tier"), function (tier) {
        if (!tier.classList.contains("done")) return;
        Array.prototype.forEach.call(tier.childNodes, function (child) {
          if (child.nodeType === 3) child.nodeValue = child.nodeValue.replace(/\s*\u2713\s*$/, "");
        });
        if (!tier.querySelector(":scope > .fh-icon")) tier.insertAdjacentHTML("beforeend", icon("check"));
      });
    });
  }

  function decorateTargetSwitch(panel) {
    Array.prototype.forEach.call(panel.querySelectorAll(".fht-view-switch [data-target-view]"), function (button) {
      decorateButton(button, button.dataset.targetView === "history" ? "history" : "targets", "fh-tab-icon");
    });
    Array.prototype.forEach.call(panel.querySelectorAll("[data-fht-open]"), function (button) {
      decorateButton(button, "targets", "fh-tab-icon");
    });
  }

  function decorateTargets() {
    if (!document) return 0;
    var panel = document.getElementById("fht-tab-panel");
    if (!panel) return 0;
    decorateTargetHeading(panel);
    decorateTargetCards(panel);
    decorateTargetProgress(panel);
    decorateTargetSwitch(panel);
    panel.dataset.fhIdentity = NS;
    return panel.querySelectorAll(".fh-icon").length;
  }

  function decorateTargetToasts() {
    if (!document) return 0;
    var count = 0;
    Array.prototype.forEach.call(document.querySelectorAll("#toasts > *"), function (toast) {
      var message = toast.textContent || "";
      if (message.indexOf("Chest opened!") < 0 || toast.querySelector(":scope > .fh-target-toast-icon")) return;
      var tier = message.indexOf("Legendary") >= 0 ? "legendary" : message.indexOf("Royal") >= 0 ? "royal" : "supply";
      removeKnownPrefix(toast, "\ud83e\uddf0");
      removeKnownPrefix(toast, "\ud83c\udf81");
      removeKnownPrefix(toast, "\ud83d\udc8e");
      toast.insertBefore(iconSlot("fh-target-toast-icon", tier === "legendary" ? "targetLegendary" : tier === "royal" ? "targetRoyal" : "targetSupply"), toast.firstChild);
      count++;
    });
    return count;
  }

  function refresh() {
    ensureStyle();
    return {
      navigation:decorateNavigation(),
      tabs:decorateProgressTabs(),
      chrome:decorateChrome(),
      targetIcons:decorateTargets(),
      targetToasts:decorateTargetToasts()
    };
  }

  var observer = null;
  var toastObserver = null;
  var refreshQueued = false;
  function watchTargets() {
    if (!document || !global.MutationObserver) return;
    if (!observer) {
      var panel = document.getElementById("fht-tab-panel");
      if (panel) {
        observer = new global.MutationObserver(function () {
          if (refreshQueued) return;
          refreshQueued = true;
          Promise.resolve().then(function () {
            refreshQueued = false;
            decorateTargets();
          });
        });
        observer.observe(panel, { childList:true });
      }
    }
    if (!toastObserver) {
      var toasts = document.getElementById("toasts");
      if (toasts) {
        toastObserver = new global.MutationObserver(function () {
          Promise.resolve().then(function () { decorateTargetToasts(); });
        });
        toastObserver.observe(toasts, { childList:true });
      }
    }
  }

  function install() {
    refresh();
    watchTargets();
  }

  var API = Object.freeze({
    version:"13.0.0",
    icons:ICONS,
    icon:icon,
    brandMark:brandMark,
    refresh:refresh,
    install:install,
    decorateTargets:decorateTargets
  });
  global.FH_IDENTITY = API;

  if (document) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once:true });
    else global.setTimeout(install, 0);
    global.addEventListener("load", function () { refresh(); watchTargets(); }, { once:true });
  }
})(typeof window !== "undefined" ? window : globalThis);

/* asset content-type refresh — v10.32.0 */
