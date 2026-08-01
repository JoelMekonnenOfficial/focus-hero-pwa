(function installFocusHeroGameShells(global) {
  "use strict";

  /*
   * Presentation shells only.
   *
   * A shell may change typography, chrome, navigation placement, panel shape,
   * color, and texture. It must never branch gameplay, duplicate app content,
   * or maintain a second copy of player state. The only persisted value is the
   * user's display preference at state.settings.gameShell.
   */
  const SHELLS = Object.freeze({
    arcane: Object.freeze({
      label: "Arcane Command",
      short: "Arcane",
      description: "A ceremonial command chamber with gilded framing, deep violet glass, and a spellbook-inspired interface.",
      tone: "Mythic command"
    }),
    frontier: Object.freeze({
      label: "Frontier Craft",
      short: "Frontier",
      description: "A tactile workshop built from timber, stone, field notes, and chunky game-like controls.",
      tone: "Crafted adventure"
    }),
    tactical: Object.freeze({
      label: "Tactical Ops",
      short: "Tactical",
      description: "A precise mission console with squared HUD panels, signal green, amber status marks, and dense navigation.",
      tone: "Mission control"
    }),
    classic: Object.freeze({
      label: "Modern Focus",
      short: "Modern",
      description: "The familiar clean Focus Hero presentation, retained as a calm neutral option.",
      tone: "Clean focus"
    })
  });

  /* Preserve the familiar presentation until the player explicitly chooses a
     different shell. An upgrade must not silently restyle an existing app. */
  const DEFAULT_SHELL = "classic";
  const STYLE_ID = "fh-game-shell-styles";
  const CHOOSER_ID = "fh-game-shell-chooser";

  const SHELL_CSS = String.raw`
/* -------------------------------------------------------------
   Focus Hero presentation shells
   Scope: visual presentation only; gameplay content remains shared.
   ------------------------------------------------------------- */

/* Settings chooser */
.fh-shell-settings{
  display:block;
  margin:16px 0;
  padding:14px;
  border:1px solid var(--border-strong);
  border-radius:16px;
  background:color-mix(in srgb,var(--panel-2) 84%,transparent);
}
.fh-shell-settings legend{
  padding:0 7px;
  color:var(--ink);
  font-size:.82rem;
  font-weight:800;
  letter-spacing:.07em;
  text-transform:uppercase;
}
.fh-shell-settings__intro{
  max-width:68ch;
  margin:0 0 12px;
  color:var(--ink-dim);
  font-size:.78rem;
  line-height:1.5;
}
.fh-shell-options{
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:9px;
}
.fh-shell-choice{
  position:relative;
  display:grid;
  grid-template-columns:62px minmax(0,1fr);
  gap:10px;
  min-height:94px;
  padding:9px;
  border:1px solid var(--border);
  border-radius:13px;
  background:color-mix(in srgb,var(--panel) 72%,transparent);
  color:var(--ink);
  cursor:pointer;
  overflow:hidden;
}
.fh-shell-choice:hover{
  border-color:color-mix(in srgb,var(--accent) 58%,var(--border));
  background:color-mix(in srgb,var(--accent) 8%,var(--panel));
}
.fh-shell-choice:has(input:checked),
.fh-shell-choice[data-active="true"]{
  border-color:var(--accent);
  box-shadow:0 0 0 2px color-mix(in srgb,var(--accent) 22%,transparent);
}
.fh-shell-choice input{
  position:absolute;
  inline-size:1px;
  block-size:1px;
  margin:0;
  opacity:.001;
}
.fh-shell-choice input:focus-visible + .fh-shell-preview{
  outline:3px solid var(--accent);
  outline-offset:2px;
}
.fh-shell-choice__copy{
  align-self:center;
  min-width:0;
}
.fh-shell-choice__copy strong{
  display:block;
  margin-bottom:3px;
  font-size:.8rem;
  line-height:1.2;
}
.fh-shell-choice__copy span{
  display:block;
  color:var(--ink-dim);
  font-size:.67rem;
  line-height:1.35;
}
.fh-shell-preview{
  position:relative;
  display:grid;
  grid-template-columns:1fr .55fr;
  grid-template-rows:12px 1fr 10px;
  gap:4px;
  align-self:stretch;
  min-height:72px;
  padding:6px;
  border:1px solid rgba(255,255,255,.22);
  background:#10172a;
  overflow:hidden;
}
.fh-shell-preview::before,
.fh-shell-preview::after{
  content:"";
  display:block;
  background:currentColor;
  opacity:.84;
}
.fh-shell-preview::before{grid-column:1/-1}
.fh-shell-preview::after{grid-column:1/-1;opacity:.44}
.fh-shell-preview__panel{
  border:1px solid currentColor;
  background:color-mix(in srgb,currentColor 12%,transparent);
}
.fh-shell-preview__panel:last-child{opacity:.65}
.fh-shell-preview[data-preview="arcane"]{
  color:#e5c779;
  border-radius:11px 11px 3px 3px;
  background:
    radial-gradient(circle at 50% 25%,rgba(128,95,222,.6),transparent 42%),
    linear-gradient(155deg,#17122f,#080715);
  box-shadow:inset 0 0 0 1px rgba(229,199,121,.25);
}
.fh-shell-preview[data-preview="frontier"]{
  color:#e6c07b;
  border:3px solid #604123;
  border-radius:2px;
  background:
    repeating-linear-gradient(0deg,rgba(255,255,255,.025) 0 4px,rgba(0,0,0,.05) 4px 8px),
    #31452a;
  box-shadow:inset 0 0 0 2px #aa7742;
}
.fh-shell-preview[data-preview="tactical"]{
  color:#8bf1b2;
  border-radius:0;
  background:
    linear-gradient(rgba(80,234,151,.08) 1px,transparent 1px),
    linear-gradient(90deg,rgba(80,234,151,.08) 1px,transparent 1px),
    #07100f;
  background-size:8px 8px;
  clip-path:polygon(0 0,92% 0,100% 14%,100% 100%,8% 100%,0 86%);
}
.fh-shell-preview[data-preview="classic"]{
  color:#73dfca;
  border-radius:12px;
  background:linear-gradient(145deg,#14263d,#091321);
}

/* ---------- ARCANE COMMAND ---------- */
html[data-game-shell="arcane"]{
  color-scheme:dark;
  --bg:#080714!important;
  --bg-2:#110d24!important;
  --panel:rgba(24,18,50,.94)!important;
  --panel-2:rgba(39,29,72,.92)!important;
  --ink:#fff8e8!important;
  --ink-dim:#c9bddb!important;
  --ink-mute:#8e82aa!important;
  --accent:#e5c779!important;
  --accent-2:#9d7bec!important;
  --good:#78d6b0!important;
  --warn:#efbd61!important;
  --bad:#ee728e!important;
  --border:rgba(226,203,139,.17)!important;
  --border-strong:rgba(226,203,139,.38)!important;
  --shadow:0 24px 65px rgba(0,0,10,.58)!important;
  --radius:14px!important;
  --font:Georgia,"Times New Roman",serif!important;
  --mono:"Cascadia Mono","SFMono-Regular",Consolas,monospace!important;
  --accent-rgb:229,199,121!important;
  --accent-2-rgb:157,123,236!important;
}
html[data-game-shell="arcane"] body{
  letter-spacing:.012em;
  background:
    radial-gradient(circle at 50% -12%,rgba(151,103,235,.35),transparent 34rem),
    radial-gradient(circle at 8% 28%,rgba(64,118,157,.18),transparent 29rem),
    radial-gradient(circle at 92% 72%,rgba(178,120,63,.13),transparent 31rem),
    linear-gradient(155deg,#05040e 0%,#100b23 48%,#080713 100%)!important;
}
html[data-game-shell="arcane"] body::before{
  opacity:.48!important;
  background:
    radial-gradient(circle,rgba(255,240,190,.32) 0 1px,transparent 1.6px) 0 0/47px 47px,
    radial-gradient(circle,rgba(163,126,237,.25) 0 1px,transparent 1.6px) 19px 13px/61px 61px,
    linear-gradient(115deg,transparent 0 46%,rgba(229,199,121,.025) 47% 48%,transparent 49% 100%)!important;
  mask-image:linear-gradient(180deg,black,rgba(0,0,0,.3) 72%,transparent)!important;
}
html[data-game-shell="arcane"] .app{
  max-width:1440px;
  gap:18px;
  padding-top:21px;
}
html[data-game-shell="arcane"] header.topbar{
  border:1px solid rgba(229,199,121,.42)!important;
  border-radius:30px 30px 12px 12px!important;
  background:
    linear-gradient(90deg,rgba(229,199,121,.07),transparent 25% 75%,rgba(229,199,121,.07)),
    rgba(15,10,34,.94)!important;
  box-shadow:
    inset 0 0 0 1px rgba(157,123,236,.16),
    0 18px 55px rgba(0,0,10,.58)!important;
}
html[data-game-shell="arcane"] header.topbar::before,
html[data-game-shell="arcane"] header.topbar::after{
  content:"";
  position:absolute;
  top:50%;
  width:38px;
  height:1px;
  background:linear-gradient(90deg,transparent,#e5c779);
  opacity:.65;
  pointer-events:none;
}
html[data-game-shell="arcane"] header.topbar::before{left:-25px}
html[data-game-shell="arcane"] header.topbar::after{right:-25px;transform:rotate(180deg)}
html[data-game-shell="arcane"] .brand .logo{
  border:1px solid rgba(255,238,179,.7)!important;
  border-radius:50%!important;
  background:
    radial-gradient(circle at 35% 30%,#fff0ad 0 7%,transparent 8%),
    conic-gradient(from 15deg,#744ec2,#e5c779,#744ec2,#39236f,#e5c779)!important;
  box-shadow:0 0 0 4px rgba(229,199,121,.1),0 0 34px rgba(157,123,236,.34)!important;
}
html[data-game-shell="arcane"] .brand .logo img{border-radius:50%!important}
html[data-game-shell="arcane"] .brand h1{
  font-variant:small-caps;
  font-size:1.25rem;
  letter-spacing:.08em;
}
html[data-game-shell="arcane"] .brand .sub{
  font-family:var(--mono);
  letter-spacing:.035em;
}
html[data-game-shell="arcane"] .card,
html[data-game-shell="arcane"] .modal,
html[data-game-shell="arcane"] .sw-laps,
html[data-game-shell="arcane"] .battle-log,
html[data-game-shell="arcane"] .toast,
html[data-game-shell="arcane"] .task-switch-item{
  position:relative;
  border:1px solid rgba(229,199,121,.31)!important;
  border-radius:14px 14px 7px 7px!important;
  background:
    linear-gradient(135deg,rgba(229,199,121,.055),transparent 30%),
    radial-gradient(circle at 100% 0,rgba(157,123,236,.13),transparent 38%),
    rgba(22,16,46,.95)!important;
  box-shadow:
    inset 0 0 0 1px rgba(157,123,236,.11),
    inset 0 -16px 40px rgba(5,2,16,.18),
    0 22px 60px rgba(0,0,10,.43)!important;
}
html[data-game-shell="arcane"] .card::before,
html[data-game-shell="arcane"] .modal::before{
  content:"";
  position:absolute;
  inset:7px;
  border:1px solid rgba(229,199,121,.08);
  border-radius:9px 9px 4px 4px;
  pointer-events:none;
}
html[data-game-shell="arcane"] .card h2{
  padding-bottom:9px;
  border-bottom:1px solid rgba(229,199,121,.17);
  color:#fff1bd!important;
  font-family:Georgia,"Times New Roman",serif!important;
  font-size:.84rem;
  font-variant:small-caps;
  letter-spacing:.14em;
}
html[data-game-shell="arcane"] .card h2::before{
  content:"";
  display:block!important;
  width:8px;
  height:8px;
  border:1px solid #e5c779;
  background:rgba(157,123,236,.45);
  transform:rotate(45deg);
  box-shadow:0 0 12px rgba(157,123,236,.65);
}
html[data-game-shell="arcane"] button,
html[data-game-shell="arcane"] .settings-action-link{
  border:1px solid rgba(229,199,121,.31)!important;
  border-radius:999px!important;
  background:
    linear-gradient(180deg,rgba(255,255,255,.055),transparent),
    rgba(42,29,75,.72)!important;
  color:#f6eddb!important;
  font-family:Georgia,"Times New Roman",serif!important;
  letter-spacing:.025em;
}
html[data-game-shell="arcane"] button:hover,
html[data-game-shell="arcane"] .settings-action-link:hover{
  border-color:#e5c779!important;
  background:
    linear-gradient(180deg,rgba(229,199,121,.16),transparent),
    rgba(58,38,96,.9)!important;
  box-shadow:0 0 22px rgba(157,123,236,.18)!important;
}
html[data-game-shell="arcane"] button.primary{
  border-color:#f7df9a!important;
  background:linear-gradient(135deg,#f0d486,#b88d3f)!important;
  color:#211329!important;
  box-shadow:0 8px 25px rgba(211,173,83,.22)!important;
}
html[data-game-shell="arcane"] input[type="text"],
html[data-game-shell="arcane"] input[type="number"],
html[data-game-shell="arcane"] input[type="password"],
html[data-game-shell="arcane"] textarea,
html[data-game-shell="arcane"] select{
  border-color:rgba(229,199,121,.28)!important;
  border-radius:7px!important;
  background:rgba(7,5,18,.64)!important;
  color:#fff8e8!important;
  font-family:var(--mono)!important;
}
html[data-game-shell="arcane"] .timer-card{
  background:
    radial-gradient(circle at 50% 31%,rgba(157,123,236,.28),transparent 31%),
    repeating-radial-gradient(circle at 50% 31%,transparent 0 42px,rgba(229,199,121,.035) 43px 44px),
    rgba(22,16,46,.96)!important;
}
html[data-game-shell="arcane"] .timer-display{
  color:#fff0b9!important;
  text-shadow:0 0 28px rgba(157,123,236,.54),0 12px 45px rgba(0,0,0,.5)!important;
}
html[data-game-shell="arcane"] .tabs{
  padding:5px;
  border:1px solid rgba(229,199,121,.14);
  border-radius:999px;
  background:rgba(5,3,16,.25);
}
html[data-game-shell="arcane"] .app-nav{
  width:min(670px,calc(100vw - 20px))!important;
  padding:8px!important;
  border:1px solid rgba(229,199,121,.48)!important;
  border-radius:30px 30px 12px 12px!important;
  background:
    linear-gradient(90deg,rgba(229,199,121,.07),transparent 30% 70%,rgba(229,199,121,.07)),
    rgba(14,9,32,.96)!important;
  box-shadow:inset 0 0 0 1px rgba(157,123,236,.15),0 18px 60px rgba(0,0,8,.62)!important;
}
html[data-game-shell="arcane"] .app-nav::before{
  content:"ARCANE PATH";
  position:absolute;
  left:50%;
  top:-16px;
  transform:translateX(-50%);
  padding:2px 12px;
  border:1px solid rgba(229,199,121,.36);
  border-radius:999px;
  background:#100b23;
  color:#cbb873;
  font:700 .56rem/1.4 var(--mono);
  letter-spacing:.18em;
}
html[data-game-shell="arcane"] .app-nav button{
  border-radius:999px!important;
  color:#bdb1d0!important;
}
html[data-game-shell="arcane"] .app-nav button[aria-current="page"]{
  color:#fff1bd!important;
  background:linear-gradient(135deg,rgba(229,199,121,.16),rgba(157,123,236,.19))!important;
  box-shadow:inset 0 0 0 1px rgba(229,199,121,.17)!important;
}

/* ---------- FRONTIER CRAFT ---------- */
html[data-game-shell="frontier"]{
  color-scheme:dark;
  --bg:#172117!important;
  --bg-2:#28301d!important;
  --panel:#303629!important;
  --panel-2:#3d4432!important;
  --ink:#fff0cf!important;
  --ink-dim:#d3c096!important;
  --ink-mute:#9d8c69!important;
  --accent:#e0ad58!important;
  --accent-2:#79a867!important;
  --good:#8fc67a!important;
  --warn:#efb751!important;
  --bad:#db7062!important;
  --border:rgba(222,184,112,.25)!important;
  --border-strong:rgba(222,184,112,.56)!important;
  --shadow:8px 10px 0 rgba(9,13,8,.35),0 22px 50px rgba(3,7,3,.34)!important;
  --radius:2px!important;
  --font:"Trebuchet MS","Segoe UI",sans-serif!important;
  --mono:"Cascadia Mono",Consolas,monospace!important;
  --accent-rgb:224,173,88!important;
  --accent-2-rgb:121,168,103!important;
}
html[data-game-shell="frontier"] body{
  letter-spacing:.006em;
  background:
    linear-gradient(rgba(32,49,28,.88),rgba(25,31,20,.93)),
    repeating-linear-gradient(90deg,transparent 0 46px,rgba(255,255,255,.025) 47px 48px),
    repeating-linear-gradient(0deg,#36412d 0 31px,#2a3525 32px 63px)!important;
}
html[data-game-shell="frontier"] body::before{
  opacity:.44!important;
  background:
    repeating-linear-gradient(0deg,transparent 0 30px,rgba(0,0,0,.15) 31px 32px),
    repeating-linear-gradient(90deg,transparent 0 63px,rgba(0,0,0,.11) 64px 66px),
    repeating-linear-gradient(135deg,rgba(255,232,184,.025) 0 2px,transparent 2px 10px)!important;
  mask-image:none!important;
}
html[data-game-shell="frontier"] .app{
  max-width:1510px;
  gap:15px;
}
html[data-game-shell="frontier"] header.topbar{
  border:4px solid #6d4a27!important;
  border-radius:3px!important;
  background:
    repeating-linear-gradient(0deg,rgba(255,255,255,.025) 0 3px,rgba(0,0,0,.035) 4px 7px),
    #4b3522!important;
  box-shadow:
    inset 0 0 0 2px #b17b3f,
    inset 0 0 0 5px rgba(36,22,11,.38),
    7px 8px 0 rgba(8,11,7,.34)!important;
}
html[data-game-shell="frontier"] header.topbar::after{
  content:"FIELD WORKBENCH";
  position:absolute;
  right:16px;
  bottom:-12px;
  padding:2px 8px;
  border:2px solid #61401e;
  background:#d0a05a;
  color:#2a2115;
  font:800 .57rem/1.3 var(--mono);
  letter-spacing:.1em;
}
html[data-game-shell="frontier"] .brand .logo{
  border:3px solid #4a3018!important;
  border-radius:2px!important;
  background:
    linear-gradient(45deg,transparent 41%,rgba(255,255,255,.18) 42% 49%,transparent 50%),
    #6b944e!important;
  box-shadow:inset 0 0 0 2px #a8c579,4px 4px 0 rgba(20,24,14,.5)!important;
}
html[data-game-shell="frontier"] .brand .logo img{border-radius:0!important}
html[data-game-shell="frontier"] .brand h1{
  font-size:1.15rem;
  font-weight:900;
  letter-spacing:.035em;
  text-shadow:2px 2px 0 #2c1d13;
}
html[data-game-shell="frontier"] .brand .sub{
  color:#e4ca91!important;
  font-family:var(--mono);
}
html[data-game-shell="frontier"] .card,
html[data-game-shell="frontier"] .modal,
html[data-game-shell="frontier"] .sw-laps,
html[data-game-shell="frontier"] .battle-log,
html[data-game-shell="frontier"] .toast,
html[data-game-shell="frontier"] .task-switch-item{
  position:relative;
  border:3px solid #6c6350!important;
  border-radius:3px!important;
  background:
    repeating-linear-gradient(135deg,rgba(255,255,255,.018) 0 4px,rgba(0,0,0,.02) 5px 9px),
    #343a2e!important;
  box-shadow:
    inset 0 0 0 2px rgba(205,192,157,.13),
    8px 9px 0 rgba(10,14,8,.32),
    0 22px 45px rgba(5,9,4,.24)!important;
}
html[data-game-shell="frontier"] .card::before,
html[data-game-shell="frontier"] .modal::before{
  content:"";
  position:absolute;
  left:7px;
  right:7px;
  top:7px;
  height:3px;
  background:repeating-linear-gradient(90deg,#756a54 0 22px,transparent 23px 29px);
  opacity:.58;
  pointer-events:none;
}
html[data-game-shell="frontier"] .card h2{
  margin:2px -4px 13px;
  padding:7px 10px;
  border-left:5px solid #d4a457;
  border-bottom:2px solid #1c231a;
  background:#414832;
  color:#ffe5ab!important;
  font-size:.79rem;
  font-weight:900;
  letter-spacing:.08em;
  text-shadow:1px 2px 0 rgba(0,0,0,.55);
}
html[data-game-shell="frontier"] button,
html[data-game-shell="frontier"] .settings-action-link{
  border:3px solid #5d442a!important;
  border-radius:2px!important;
  background:
    linear-gradient(180deg,rgba(255,255,255,.08),transparent 30%),
    #725033!important;
  color:#ffedc6!important;
  font-family:"Trebuchet MS","Segoe UI",sans-serif!important;
  font-weight:900!important;
  text-shadow:1px 1px 0 rgba(0,0,0,.55);
  box-shadow:inset 0 0 0 1px #9a744a,3px 4px 0 rgba(17,17,10,.48)!important;
}
html[data-game-shell="frontier"] button:hover,
html[data-game-shell="frontier"] .settings-action-link:hover{
  border-color:#d0a05a!important;
  background:#7d5a38!important;
  transform:translate(-1px,-1px);
}
html[data-game-shell="frontier"] button:active{
  transform:translate(2px,2px)!important;
  box-shadow:inset 0 0 0 1px #9a744a,1px 1px 0 rgba(17,17,10,.48)!important;
}
html[data-game-shell="frontier"] button.primary{
  border-color:#39532d!important;
  background:#6f994f!important;
  color:#fff4ce!important;
  box-shadow:inset 0 0 0 1px #9fc57d,3px 4px 0 rgba(17,17,10,.48)!important;
}
html[data-game-shell="frontier"] input[type="text"],
html[data-game-shell="frontier"] input[type="number"],
html[data-game-shell="frontier"] input[type="password"],
html[data-game-shell="frontier"] textarea,
html[data-game-shell="frontier"] select{
  border:3px solid #5d5546!important;
  border-radius:2px!important;
  background:#252b23!important;
  color:#fff0cf!important;
  box-shadow:inset 2px 2px 0 rgba(0,0,0,.4)!important;
}
html[data-game-shell="frontier"] .timer-card{
  background:
    radial-gradient(circle at 50% 28%,rgba(160,196,112,.13),transparent 34%),
    repeating-linear-gradient(135deg,rgba(255,255,255,.018) 0 4px,rgba(0,0,0,.02) 5px 9px),
    #30382b!important;
}
html[data-game-shell="frontier"] .timer-display{
  color:#ffe2a0!important;
  text-shadow:3px 4px 0 #1c2118,0 0 24px rgba(220,170,80,.16)!important;
}
html[data-game-shell="frontier"] .progress,
html[data-game-shell="frontier"] .bar{
  height:12px!important;
  border:2px solid #171d14!important;
  border-radius:1px!important;
  background:#22291f!important;
}
html[data-game-shell="frontier"] .pill,
html[data-game-shell="frontier"] .level-badge,
html[data-game-shell="frontier"] .store-boost{
  border:2px solid #635842!important;
  border-radius:2px!important;
  background:#454a37!important;
}
html[data-game-shell="frontier"] .tabs{
  gap:4px;
  padding:6px;
  border:3px solid #5b4a30;
  border-radius:2px;
  background:#2a2f25;
}
html[data-game-shell="frontier"] .app-nav{
  border:4px solid #5e3d20!important;
  border-radius:3px!important;
  background:
    repeating-linear-gradient(0deg,rgba(255,255,255,.025) 0 3px,rgba(0,0,0,.035) 4px 7px),
    #4c3420!important;
  box-shadow:inset 0 0 0 2px #9d6a37,7px 8px 0 rgba(7,10,6,.42)!important;
}
html[data-game-shell="frontier"] .app-nav button{
  border:1px solid transparent!important;
  border-radius:2px!important;
  background:transparent!important;
  box-shadow:none!important;
  color:#d7c39a!important;
  text-shadow:1px 1px 0 #24170d;
}
html[data-game-shell="frontier"] .app-nav button[aria-current="page"]{
  border-color:#cf9c51!important;
  background:#6f4e2f!important;
  color:#fff1c7!important;
  box-shadow:inset 0 0 0 1px #9e7647!important;
}

/* ---------- TACTICAL OPS ---------- */
html[data-game-shell="tactical"]{
  color-scheme:dark;
  --bg:#050a09!important;
  --bg-2:#091311!important;
  --panel:rgba(9,19,17,.96)!important;
  --panel-2:rgba(13,29,25,.96)!important;
  --ink:#d9fbe5!important;
  --ink-dim:#91bca0!important;
  --ink-mute:#597b65!important;
  --accent:#52e694!important;
  --accent-2:#f2a23e!important;
  --good:#62e99c!important;
  --warn:#f2a23e!important;
  --bad:#ff5f65!important;
  --border:rgba(86,221,143,.19)!important;
  --border-strong:rgba(86,221,143,.42)!important;
  --shadow:0 18px 42px rgba(0,0,0,.55)!important;
  --radius:0!important;
  --font:Bahnschrift,"Arial Narrow","Segoe UI",sans-serif!important;
  --mono:"Cascadia Mono","SFMono-Regular",Consolas,monospace!important;
  --accent-rgb:82,230,148!important;
  --accent-2-rgb:242,162,62!important;
}
html[data-game-shell="tactical"] body{
  font-stretch:condensed;
  letter-spacing:.018em;
  background:
    linear-gradient(rgba(4,9,8,.78),rgba(4,9,8,.94)),
    linear-gradient(rgba(82,230,148,.1) 1px,transparent 1px),
    linear-gradient(90deg,rgba(82,230,148,.1) 1px,transparent 1px),
    #050a09!important;
  background-size:auto,34px 34px,34px 34px,auto!important;
}
html[data-game-shell="tactical"] body::before{
  opacity:.38!important;
  background:
    repeating-linear-gradient(0deg,transparent 0 3px,rgba(123,255,178,.035) 4px),
    linear-gradient(90deg,rgba(82,230,148,.12),transparent 18%,transparent 82%,rgba(242,162,62,.09))!important;
  mask-image:none!important;
}
html[data-game-shell="tactical"] .app{
  max-width:1540px;
  gap:12px;
  padding-top:15px;
}
html[data-game-shell="tactical"] header.topbar{
  min-height:76px;
  border:1px solid rgba(82,230,148,.48)!important;
  border-left:5px solid #52e694!important;
  border-radius:0!important;
  background:
    linear-gradient(90deg,rgba(82,230,148,.07),transparent 28%),
    rgba(6,15,13,.97)!important;
  box-shadow:inset 0 -1px 0 rgba(82,230,148,.12),0 16px 40px rgba(0,0,0,.48)!important;
  clip-path:polygon(0 0,98% 0,100% 28%,100% 100%,2% 100%,0 72%);
}
html[data-game-shell="tactical"] header.topbar::after{
  content:"OPS // SYSTEM READY";
  position:absolute;
  right:18px;
  bottom:5px;
  color:#f2a23e;
  font:700 .55rem/1.3 var(--mono);
  letter-spacing:.16em;
}
html[data-game-shell="tactical"] .brand .logo{
  border:1px solid #52e694!important;
  border-radius:0!important;
  background:
    linear-gradient(135deg,transparent 0 42%,rgba(82,230,148,.4) 43% 48%,transparent 49%),
    #0b211a!important;
  box-shadow:inset 0 0 0 3px #07110f,0 0 24px rgba(82,230,148,.18)!important;
  clip-path:polygon(0 0,78% 0,100% 22%,100% 100%,22% 100%,0 78%);
}
html[data-game-shell="tactical"] .brand .logo img{border-radius:0!important}
html[data-game-shell="tactical"] .brand h1{
  font-family:Bahnschrift,"Arial Narrow",sans-serif!important;
  font-size:1.12rem;
  font-weight:800;
  letter-spacing:.16em;
  text-transform:uppercase;
}
html[data-game-shell="tactical"] .brand .sub{
  color:#78a98a!important;
  font-family:var(--mono);
  font-size:.67rem;
  letter-spacing:.055em;
  text-transform:uppercase;
}
html[data-game-shell="tactical"] .card,
html[data-game-shell="tactical"] .modal,
html[data-game-shell="tactical"] .sw-laps,
html[data-game-shell="tactical"] .battle-log,
html[data-game-shell="tactical"] .toast,
html[data-game-shell="tactical"] .task-switch-item{
  position:relative;
  border:1px solid rgba(82,230,148,.27)!important;
  border-left:3px solid rgba(82,230,148,.66)!important;
  border-radius:0!important;
  background:
    linear-gradient(135deg,rgba(82,230,148,.045),transparent 32%),
    rgba(8,18,16,.97)!important;
  box-shadow:inset 0 0 0 1px rgba(82,230,148,.035),0 18px 42px rgba(0,0,0,.38)!important;
  clip-path:polygon(0 0,96% 0,100% 18px,100% 100%,18px 100%,0 calc(100% - 18px));
}
html[data-game-shell="tactical"] .card::before,
html[data-game-shell="tactical"] .modal::before{
  content:"";
  position:absolute;
  right:10px;
  top:8px;
  width:28px;
  height:3px;
  background:repeating-linear-gradient(90deg,#52e694 0 5px,transparent 5px 8px);
  opacity:.6;
  pointer-events:none;
}
html[data-game-shell="tactical"] .card h2{
  min-height:29px;
  margin:-2px 0 12px;
  padding:5px 36px 6px 9px;
  border-bottom:1px solid rgba(82,230,148,.22);
  background:linear-gradient(90deg,rgba(82,230,148,.09),transparent 65%);
  color:#a9f9c9!important;
  font-family:Bahnschrift,"Arial Narrow",sans-serif!important;
  font-size:.73rem;
  font-weight:800;
  letter-spacing:.17em;
  text-transform:uppercase;
}
html[data-game-shell="tactical"] .card h2::before{
  content:"";
  display:block!important;
  width:7px;
  height:7px;
  border:1px solid #f2a23e;
  background:rgba(242,162,62,.2);
}
html[data-game-shell="tactical"] button,
html[data-game-shell="tactical"] .settings-action-link{
  border:1px solid rgba(82,230,148,.32)!important;
  border-radius:0!important;
  background:rgba(12,34,28,.82)!important;
  color:#b9f5ce!important;
  font-family:Bahnschrift,"Arial Narrow",sans-serif!important;
  font-weight:750!important;
  letter-spacing:.075em;
  text-transform:uppercase;
  clip-path:polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,8px 100%,0 calc(100% - 8px));
}
html[data-game-shell="tactical"] button:hover,
html[data-game-shell="tactical"] .settings-action-link:hover{
  border-color:#52e694!important;
  background:rgba(28,72,57,.78)!important;
  box-shadow:inset 3px 0 0 #f2a23e!important;
}
html[data-game-shell="tactical"] button.primary{
  border-color:#52e694!important;
  background:#173f31!important;
  color:#dcffe9!important;
  box-shadow:inset 4px 0 0 #52e694!important;
}
html[data-game-shell="tactical"] input[type="text"],
html[data-game-shell="tactical"] input[type="number"],
html[data-game-shell="tactical"] input[type="password"],
html[data-game-shell="tactical"] textarea,
html[data-game-shell="tactical"] select{
  border:1px solid rgba(82,230,148,.29)!important;
  border-radius:0!important;
  background:#07110f!important;
  color:#d9fbe5!important;
  font-family:var(--mono)!important;
}
html[data-game-shell="tactical"] .timer-card{
  background:
    linear-gradient(rgba(82,230,148,.045) 1px,transparent 1px),
    linear-gradient(90deg,rgba(82,230,148,.045) 1px,transparent 1px),
    radial-gradient(circle at 50% 36%,rgba(82,230,148,.09),transparent 38%),
    #07100e!important;
  background-size:22px 22px,22px 22px,auto,auto!important;
}
html[data-game-shell="tactical"] .timer-display{
  color:#8ff3b7!important;
  font-family:"Cascadia Mono",Consolas,monospace!important;
  font-weight:300!important;
  letter-spacing:-.07em!important;
  text-shadow:0 0 22px rgba(82,230,148,.27)!important;
}
html[data-game-shell="tactical"] .progress,
html[data-game-shell="tactical"] .bar{
  height:6px!important;
  border-radius:0!important;
  background:#020605!important;
  box-shadow:0 0 0 1px rgba(82,230,148,.18)!important;
}
html[data-game-shell="tactical"] .pill,
html[data-game-shell="tactical"] .level-badge,
html[data-game-shell="tactical"] .store-boost{
  border-radius:0!important;
  background:rgba(82,230,148,.055)!important;
  font-family:var(--mono)!important;
  text-transform:uppercase;
}
html[data-game-shell="tactical"] .tabs{
  gap:2px;
  padding:3px;
  border:1px solid rgba(82,230,148,.2);
  border-radius:0;
  background:#050b0a;
}
html[data-game-shell="tactical"] .app-nav{
  border:1px solid rgba(82,230,148,.5)!important;
  border-radius:0!important;
  background:
    linear-gradient(90deg,rgba(82,230,148,.07),transparent),
    rgba(4,12,10,.98)!important;
  box-shadow:inset 3px 0 0 rgba(242,162,62,.75),0 18px 50px rgba(0,0,0,.62)!important;
  clip-path:polygon(0 0,calc(100% - 14px) 0,100% 14px,100% 100%,14px 100%,0 calc(100% - 14px));
}
html[data-game-shell="tactical"] .app-nav button{
  border:0!important;
  border-radius:0!important;
  background:transparent!important;
  box-shadow:none!important;
  color:#709780!important;
  font-family:var(--mono)!important;
  text-transform:uppercase!important;
  clip-path:none;
}
html[data-game-shell="tactical"] .app-nav button[aria-current="page"]{
  border-left:3px solid #52e694!important;
  background:linear-gradient(90deg,rgba(82,230,148,.18),transparent)!important;
  color:#c9ffdc!important;
}

/* The base dashboard hides quick navigation from 861px upward.
   Frontier and Tactical own their navigation architecture at those widths. */
html[data-game-shell="frontier"] .app-nav,
html[data-game-shell="tactical"] .app-nav{
  display:flex!important;
  position:fixed!important;
}

/* Desktop navigation architectures are intentionally different. */
@media (min-width:980px){
  html[data-game-shell="frontier"] .app{
    padding-left:158px!important;
  }
  html[data-game-shell="frontier"] .app-nav{
    left:14px!important;
    right:auto!important;
    top:112px!important;
    bottom:auto!important;
    transform:none!important;
    width:126px!important;
    max-height:calc(100vh - 130px);
    padding:8px!important;
    flex-direction:column;
    overflow:auto;
  }
  html[data-game-shell="frontier"] .app-nav::before{
    content:"TRAIL MAP";
    padding:6px 4px 8px;
    border-bottom:2px solid #9d6a37;
    color:#f0cc87;
    font:800 .6rem/1.2 var(--mono);
    letter-spacing:.12em;
    text-align:center;
  }
  html[data-game-shell="frontier"] .app-nav button{
    width:100%;
    min-height:58px;
  }
  html[data-game-shell="tactical"] .app{
    padding-right:166px!important;
  }
  html[data-game-shell="tactical"] .app-nav{
    left:auto!important;
    right:14px!important;
    top:111px!important;
    bottom:auto!important;
    transform:none!important;
    width:138px!important;
    max-height:calc(100vh - 129px);
    padding:7px!important;
    flex-direction:column;
    overflow:auto;
  }
  html[data-game-shell="tactical"] .app-nav::before{
    content:"NAV // 01";
    padding:6px 5px 8px;
    border-bottom:1px solid rgba(82,230,148,.3);
    color:#f2a23e;
    font:700 .58rem/1.2 var(--mono);
    letter-spacing:.16em;
  }
  html[data-game-shell="tactical"] .app-nav button{
    width:100%;
    min-height:54px;
    grid-template-columns:25px 1fr;
    text-align:left;
  }
  html[data-game-shell="tactical"] .app-nav button b{
    justify-self:start;
    font-size:.61rem;
  }
}

/* Shared shell-responsive rules. */
@media (max-width:979px){
  html[data-game-shell="frontier"] .app,
  html[data-game-shell="tactical"] .app{
    padding-left:12px!important;
    padding-right:12px!important;
  }
  html[data-game-shell="frontier"] .app-nav,
  html[data-game-shell="tactical"] .app-nav{
    left:50%!important;
    right:auto!important;
    top:auto!important;
    bottom:calc(env(safe-area-inset-bottom,0px) + 9px)!important;
    transform:translateX(-50%)!important;
    width:min(620px,calc(100vw - 18px))!important;
    max-height:none;
    padding:6px!important;
    flex-direction:row;
    overflow:visible;
  }
  html[data-game-shell="frontier"] .app-nav::before,
  html[data-game-shell="tactical"] .app-nav::before{
    display:none;
  }
  html[data-game-shell="tactical"] .app-nav button{
    display:grid;
    grid-template-columns:1fr;
    text-align:center;
  }
  html[data-game-shell="tactical"] .app-nav button b{justify-self:center}
}
@media (max-width:720px){
  .fh-shell-options{grid-template-columns:1fr}
  html[data-game-shell="arcane"] header.topbar::before,
  html[data-game-shell="arcane"] header.topbar::after{display:none}
  html[data-game-shell="arcane"] .app,
  html[data-game-shell="frontier"] .app,
  html[data-game-shell="tactical"] .app{
    gap:10px;
  }
  html[data-game-shell="frontier"] header.topbar::after,
  html[data-game-shell="tactical"] header.topbar::after{display:none}
  html[data-game-shell="frontier"] .card,
  html[data-game-shell="frontier"] .modal{box-shadow:4px 5px 0 rgba(10,14,8,.32)!important}
  html[data-game-shell="tactical"] header.topbar,
  html[data-game-shell="tactical"] .card,
  html[data-game-shell="tactical"] .modal{clip-path:none}
}
@media (max-width:460px){
  .fh-shell-settings{padding:11px}
  .fh-shell-choice{
    grid-template-columns:56px minmax(0,1fr);
    min-height:88px;
  }
  html[data-game-shell="arcane"] .app-nav::before{display:none}
  html[data-game-shell="arcane"] .app-nav{border-radius:17px 17px 7px 7px!important}
}
@media (prefers-reduced-motion:reduce){
  .fh-shell-choice,
  html[data-game-shell] .card,
  html[data-game-shell] button,
  html[data-game-shell] .app-nav{
    animation:none!important;
    transition:none!important;
  }
}
`;

  function normalizeShell(value) {
    return Object.prototype.hasOwnProperty.call(SHELLS, value) ? value : DEFAULT_SHELL;
  }

  function applyToRoot(root, value) {
    const shell = normalizeShell(value);
    if (root && typeof root.setAttribute === "function") {
      root.setAttribute("data-game-shell", shell);
      root.setAttribute("data-game-shell-label", SHELLS[shell].label);
    }
    return shell;
  }

  function currentStateShell() {
    try {
      if (typeof state !== "undefined" && state && state.settings) {
        return normalizeShell(state.settings.gameShell);
      }
    } catch (_) {}
    return DEFAULT_SHELL;
  }

  function persistShell(shell) {
    try {
      if (typeof state === "undefined" || !state || !state.settings) return false;
      if (state.settings.gameShell === shell) return true;
      state.settings.gameShell = shell;
      if (typeof saveState === "function") return saveState() !== false;
      return true;
    } catch (error) {
      console.warn("Focus Hero shell preference could not be saved", error);
      return false;
    }
  }

  function syncChooser(shell) {
    if (typeof document === "undefined") return;
    document.querySelectorAll('input[name="fh-game-shell"]').forEach((input) => {
      const active = input.value === shell;
      input.checked = active;
      const choice = input.closest(".fh-shell-choice");
      if (choice) choice.dataset.active = active ? "true" : "false";
    });
    const status = document.getElementById("fh-game-shell-status");
    if (status) status.textContent = `${SHELLS[shell].label} selected.`;
  }

  function setShell(value, options) {
    const opts = Object.assign({ persist: false, announce: false }, options || {});
    const shell = applyToRoot(
      typeof document === "undefined" ? null : document.documentElement,
      value
    );
    syncChooser(shell);
    if (opts.persist) persistShell(shell);

    if (typeof document !== "undefined" && typeof CustomEvent === "function") {
      document.dispatchEvent(new CustomEvent("focushero:shellchange", {
        detail: { shell, presentationOnly: true }
      }));
    }
    if (opts.announce) {
      try {
        if (typeof toast === "function") toast(`Presentation: ${SHELLS[shell].label}`, "info");
      } catch (_) {}
    }
    return shell;
  }

  function injectStyles() {
    if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.setAttribute("data-presentation-only", "true");
    style.textContent = SHELL_CSS;
    document.head.appendChild(style);
  }

  function makePreview(shell) {
    const preview = document.createElement("span");
    preview.className = "fh-shell-preview";
    preview.dataset.preview = shell;
    preview.setAttribute("aria-hidden", "true");
    const panelA = document.createElement("span");
    const panelB = document.createElement("span");
    panelA.className = "fh-shell-preview__panel";
    panelB.className = "fh-shell-preview__panel";
    preview.append(panelA, panelB);
    return preview;
  }

  function makeChoice(shell, selected) {
    const info = SHELLS[shell];
    const label = document.createElement("label");
    label.className = "fh-shell-choice";
    label.dataset.shellOption = shell;
    label.dataset.active = selected ? "true" : "false";

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "fh-game-shell";
    input.value = shell;
    input.checked = selected;
    input.setAttribute("aria-label", `${info.label}: ${info.description}`);
    input.addEventListener("change", () => {
      if (input.checked) setShell(shell, { persist: true, announce: true });
    });

    const copy = document.createElement("span");
    copy.className = "fh-shell-choice__copy";
    const title = document.createElement("strong");
    title.textContent = info.label;
    const description = document.createElement("span");
    description.textContent = info.description;
    copy.append(title, description);

    label.append(input, makePreview(shell), copy);
    return label;
  }

  function injectChooser() {
    if (typeof document === "undefined") return null;
    const existing = document.getElementById(CHOOSER_ID);
    if (existing) {
      syncChooser(currentStateShell());
      return existing;
    }

    const modal = document.querySelector("#settings-modal .modal");
    if (!modal) return null;

    const fieldset = document.createElement("fieldset");
    fieldset.id = CHOOSER_ID;
    fieldset.className = "fh-shell-settings";
    fieldset.setAttribute("data-display-setting", "game-shell");

    const legend = document.createElement("legend");
    legend.textContent = "Game presentation";
    const intro = document.createElement("p");
    intro.className = "fh-shell-settings__intro";
    intro.id = "fh-game-shell-help";
    intro.textContent = "Switch the entire visual language without changing your hero, inventory, sessions, rewards, totals, or cloud progress.";

    const options = document.createElement("div");
    options.className = "fh-shell-options";
    options.setAttribute("role", "radiogroup");
    options.setAttribute("aria-describedby", intro.id);

    const selected = currentStateShell();
    Object.keys(SHELLS).forEach((shell) => options.appendChild(makeChoice(shell, shell === selected)));

    const status = document.createElement("p");
    status.id = "fh-game-shell-status";
    status.className = "sr-only";
    status.setAttribute("aria-live", "polite");
    status.textContent = `${SHELLS[selected].label} selected.`;

    fieldset.append(legend, intro, options, status);

    const layoutControl = document.getElementById("cfg-layout");
    const layoutRow = layoutControl && layoutControl.closest(".form-row");
    if (layoutRow && layoutRow.parentNode) {
      layoutRow.insertAdjacentElement("afterend", fieldset);
    } else {
      modal.appendChild(fieldset);
    }
    return fieldset;
  }

  function init() {
    injectStyles();
    setShell(currentStateShell(), { persist: false, announce: false });
    injectChooser();
  }

  global.FHGameShells = Object.freeze({
    shells: SHELLS,
    defaultShell: DEFAULT_SHELL,
    normalizeShell,
    applyToRoot,
    setShell,
    init,
    styleText: SHELL_CSS
  });

  if (typeof document === "undefined") return;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})(typeof window !== "undefined" ? window : globalThis);
