/* ================================================================
 * Life XP — ITEM MODELS  (v12, 2026-08-17)
 *
 * THE PROBLEM THIS FIXES
 * Character art was never driven by what you actually own:
 *
 *   crWeaponSvg(klass)   - a six-case switch on your CLASS. A rusty
 *                          dagger and a mythic Void blade drew the
 *                          identical shape, and only if your class
 *                          happened to be a sword class.
 *   crMountBadgeSvg(id)  - a 14px circle containing an EMOJI. Every
 *                          mount rendered as the same bubble.
 *   helmet / armor       - never rendered from the equipped item at
 *                          all; driven by species/class presets.
 *
 * So grinding 1500 hours for a mythic mount changed one character
 * of text. That is what "do the damn job right" was about.
 *
 * THE APPROACH
 * Every equippable item gets a real drawn model, generated from the
 * item itself:
 *
 *   SHAPE  <- the item's name, matched to a form vocabulary
 *             (dagger, sword, greatsword, staff, bow, quill, tome,
 *              crown, helm, apparel, tools, and distinct mount families)
 *   COLOUR <- the item's RARITY, on a shared metal/gem ramp
 *   DETAIL <- rarity again: higher tiers gain trim, gems, glow and
 *             motion that lower tiers do not get
 *
 * Nothing is stored. Art is generated from the item id at render
 * time, so adding items costs zero bytes in the save. This is the
 * rule that keeps the storage problem from coming back through the
 * art system: NEVER put generated art in state.
 *
 * Mounts are drawn as an actual animal the hero sits on, sized and
 * silhouetted per family, replacing the emoji badge entirely.
 * ================================================================ */
(function () {
  "use strict";

  if (window.FH_MODELS) return;

  /* ---------- rarity ramp ------------------------------------- */

  var RARITY = {
    common:    { metal:"#9AA4B2", dark:"#5C6673", gem:"#B8C2CF", glow:0,   trim:0 },
    uncommon:  { metal:"#7FC98B", dark:"#3E7A47", gem:"#A8E6B4", glow:0, trim:1 },
    rare:      { metal:"#6FA8FF", dark:"#2F5DA8", gem:"#A9CCFF", glow:.18, trim:1 },
    epic:      { metal:"#C08BFF", dark:"#6B3FA8", gem:"#E0C2FF", glow:.28, trim:2 },
    legendary: { metal:"#FFC64A", dark:"#A87317", gem:"#FFE9A8", glow:.40, trim:3 },
    mythic:    { metal:"#FF8AD8", dark:"#A83C86", gem:"#FFD1F0", glow:.55, trim:4 },
    cursed:    { metal:"#B34A55", dark:"#4B121C", gem:"#FF8793", glow:.32, trim:2 },
    artifact:  { metal:"#E5E9FF", dark:"#59628C", gem:"#FFFFFF", glow:.62, trim:4 }
  };
  function pal(r) { return RARITY[String(r || "common").toLowerCase()] || RARITY.common; }

  function esc(s) { return String(s == null ? "" : s).replace(/[<>&"]/g, function (c) {
    return { "<":"&lt;", ">":"&gt;", "&":"&amp;", '"':"&quot;" }[c]; }); }

  /* Deterministic per-item jitter so two items of the same form and
     rarity still differ slightly. No randomness — same item always
     draws identically. */
  function hash(str) {
    var h = 2166136261;
    str = String(str || "");
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h;
  }
  function jitter(id, span) { return (hash(id) % (span * 2 + 1)) - span; }

  /* ---------- form vocabulary --------------------------------- */

  var WEAPON_FORMS = [
    [/boomerang/i,                                        "boomerang"],
    [/dualblade|dual blade/i,                             "dualblade"],
    [/greatsword|claymore|zwei/i,                         "greatsword"],
    [/dagger|knife|shiv|kris|dirk/i,                    "dagger"],
    [/sword|blade|sabre|saber|katana|scimitar|falchion/i,"sword"],
    [/staff|rod|wand|cane|sceptre|scepter/i,            "staff"],
    [/bow|longbow|shortbow/i,                            "bow"],
    [/axe|hatchet|cleaver/i,                             "axe"],
    [/hammer|maul|mace|club|cudgel/i,                    "mace"],
    [/pick|mattock/i,                                    "pickaxe"],
    [/trident/i,                                         "trident"],
    [/spear|lance|pike|glaive|halberd/i,                 "spear"],
    [/gauntlet|wraps|fist|knuckle/i,                     "fist"],
    [/flask|vial|bottle/i,                               "flask"],
    [/drum|tambour/i,                                    "drum"],
    [/quill|pen|stylus/i,                                "quill"],
    [/tome|book|codex|grimoire|manual/i,                 "tome"],
    [/lute|harp|flute|horn/i,                            "lute"],
    [/orb|sphere|crystal|prism/i,                        "orb"]
  ];
  var HELM_FORMS = [
    [/crown|diadem|circlet|tiara/i,   "crown"],
    [/halo/i,                         "halo"],
    [/\beye\b|watcher/i,             "eye"],
    [/spectacle|glasses|goggle|lens/i,"spectacles"],
    [/hood|cowl|veil/i,               "hood"],
    [/cap|hat|beret/i,                "cap"],
    [/tome|book|codex|grimoire|manual/i,"tomehat"],
    [/helm|helmet|visor|casque/i,     "helm"]
  ];
  var ARMOR_FORMS = [
    [/aegis|buckler|bulwark|ward|shield/i,    "shield"],
    [/pauldron|shoulder/i,                    "pauldron"],
    [/plate|moonplate|cuirass|breastplate/i, "plate"],
    [/robe|gown|vestment/i,                  "robe"],
    [/coat|jacket|runner/i,                   "coat"],
    [/tunic|shirt|padded/i,                  "tunic"],
    [/vest|jerkin|studded|harness/i,         "vest"],
    [/cloak|cape|mantle/i,                   "cloak"],
    [/boot|greave|sabaton|trail|sandal/i,    "boots"]
  ];
  var MOUNT_FAMILIES = [
    [/croc|alligator|gator/i,                    "crocodile"],
    [/raptor|dinosaur/i,                         "raptor"],
    [/rhino|rhinoceros/i,                        "rhino"],
    [/shark|reef/i,                              "shark"],
    [/moth|butterfly/i,                          "moth"],
    [/seraph|angel|\bwings?\b/i,                 "seraph"],
    [/kitsune|\bfox\b/i,                         "kitsune"],
    [/wolf|hound|warg|fenrir/i,                  "wolf"],
    [/griffin|gryphon|eagle|hawk|falcon/i,       "griffin"],
    [/dragon|wyrm|wyvern|drake/i,                "dragon"],
    [/stag|deer|elk|hart/i,                      "stag"],
    [/unicorn|pegasus|alicorn/i,                 "unicorn"],
    [/panther|tiger|\blion(?:ess)?\b|\bcat\b|lynx|cheetah|sabertooth/i, "feline"],
    [/skiff|void|ship|barge|glider|orbit/i,      "skiff"],
    [/mule|donkey|pony|pack/i,                   "pony"],
    [/bear|ursine/i,                             "bear"],
    [/spider|beetle|scarab/i,                    "arachnid"],
    [/serpent|snake|naga/i,                      "serpent"],
    [/ram|goat|ibex/i,                           "ram"],
    [/boar|hog|pig/i,                            "boar"],
    [/horse|steed|stallion|mustang|arabian|palomino|pinto|thoroughbred|charger|friesian|andalusian|shire|clydesdale|akhal|lipizzaner/i, "horse"]
  ];

  /* The 114-entry Stable roster supplies an authoritative family. Keep that
     family ahead of free-text inference: substring guessing once classified
     "Black Stallion" as a cat because `stallion` contains `lion`. Rules below
     only refine anatomy *inside* the declared family. A known family therefore
     never falls through to an unrelated horse model. */
  var DECLARED_MOUNT_RULES = {
    horse:     { fallback:"horse", rules:[[/pony|mule|donkey/i,"pony"]] },
    wolf:      { fallback:"wolf", rules:[] },
    cat:       { fallback:"feline", rules:[] },
    bear:      { fallback:"bear", rules:[] },
    bird:      { fallback:"griffin", rules:[] },
    reptile:   { fallback:"crocodile", rules:[[/raptor/i,"raptor"],[/tortoise|turtle/i,"tortoise"]] },
    dragon:    { fallback:"dragon", rules:[] },
    mythical:  { fallback:"unicorn", rules:[[/kitsune|fox/i,"kitsune"],[/griffin|gryphon|hippogriff|roc/i,"griffin"],[/manticore|sphinx/i,"feline"],[/kirin|dragon|drake|wyrm|wyvern/i,"dragon"]] },
    forest:    { fallback:"stag", rules:[[/boar|hog/i,"boar"],[/ram|goat|ibex/i,"ram"]] },
    cattle:    { fallback:"bovine", rules:[[/rhino/i,"rhino"],[/mule|llama|alpaca/i,"bovine"]] },
    undead:    { fallback:"undead", rules:[[/wolf|hound/i,"wolf"],[/drake|dragon|wyrm/i,"dragon"]] },
    elemental: { fallback:"elemental", rules:[[/lizard|iguana|croc/i,"crocodile"],[/stag|deer|elk/i,"stag"],[/wyrm|dragon|drake/i,"dragon"],[/serpent|snake/i,"serpent"],[/mammoth/i,"mammoth"]] },
    insect:    { fallback:"arachnid", rules:[[/moth|butterfly/i,"moth"]] },
    aquatic:   { fallback:"shark", rules:[[/serpent|snake/i,"serpent"],[/hippocampus|seahorse/i,"hippocampus"],[/otter/i,"aquatic_critter"],[/jelly|ray|manta/i,"ray"]] },
    small:     { fallback:"critter", rules:[[/goat|ibex|ram/i,"ram"]] }
  };

  function resolveMountForm(item) {
    item = normalizeItem(item);
    var declared = String(item.family || "").toLowerCase();
    var cfg = DECLARED_MOUNT_RULES[declared];
    if (cfg) {
      for (var i = 0; i < cfg.rules.length; i++) {
        if (cfg.rules[i][0].test(item.name + " " + item.id)) {
          return { form:cfg.rules[i][1], explicit:true, resolution:"declared-name", declaredFamily:declared };
        }
      }
      return { form:cfg.fallback, explicit:true, resolution:"declared-family", declaredFamily:declared };
    }
    var matched = formMatch(item.name + " " + item.id, MOUNT_FAMILIES, "horse");
    return {
      form:matched.form,
      explicit:matched.explicit,
      resolution:matched.explicit ? "name" : "fallback",
      declaredFamily:""
    };
  }

  var PET_FORMS = [
    [/owl|watcher/i,                    "owl"],
    [/phoenix|firebird/i,               "phoenix"],
    [/wyrmling|dragon|drake|wyrm/i,     "wyrmling"],
    [/fox|kit|badger|panda|otter/i,     "critter"],
    [/mouse|rat|vole/i,                 "mouse"],
    [/cat|lynx|panther/i,               "cat"],
    [/hound|dog|wolf|pup/i,             "hound"],
    [/turtle|tortoise/i,                "turtle"],
    [/falcon|hawk|parrot|bird|raven/i,  "bird"],
    [/scorpion|spider|beetle/i,         "scorpion"],
    [/mote|sprite|wisp|familiar|jelly/i,"wisp"]
  ];

  function formOf(name, table, fallback) {
    var n = String(name || "");
    for (var i = 0; i < table.length; i++) if (table[i][0].test(n)) return table[i][1];
    return fallback;
  }

  function formMatch(name, table, fallback) {
    var n = String(name || "");
    for (var i = 0; i < table.length; i++) {
      if (table[i][0].test(n)) return { form:table[i][1], explicit:true };
    }
    return { form:fallback, explicit:false };
  }

  /* ---------- shared drawing helpers -------------------------- */

  /* Rotate a hex colour's hue by `deg` so items of the same rarity
     still read as individuals. Pure maths, no allocation of art. */
  function shiftHue(hex, deg) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
    if (!m) return hex;
    var n = parseInt(m[1], 16), r = (n >> 16) & 255, g2 = (n >> 8) & 255, b = n & 255;
    r /= 255; g2 /= 255; b /= 255;
    var mx = Math.max(r, g2, b), mn = Math.min(r, g2, b), d = mx - mn;
    var hh = 0, s2 = mx === 0 ? 0 : d / mx, v = mx;
    if (d !== 0) {
      if (mx === r) hh = ((g2 - b) / d) % 6;
      else if (mx === g2) hh = (b - r) / d + 2;
      else hh = (r - g2) / d + 4;
      hh *= 60; if (hh < 0) hh += 360;
    }
    hh = (hh + deg + 360) % 360;
    var c = v * s2, x = c * (1 - Math.abs(((hh / 60) % 2) - 1)), mm = v - c, rr, gg, bb;
    if (hh < 60) { rr = c; gg = x; bb = 0; } else if (hh < 120) { rr = x; gg = c; bb = 0; }
    else if (hh < 180) { rr = 0; gg = c; bb = x; } else if (hh < 240) { rr = 0; gg = x; bb = c; }
    else if (hh < 300) { rr = x; gg = 0; bb = c; } else { rr = c; gg = 0; bb = x; }
    function q(z) { return ("0" + Math.round((z + mm) * 255).toString(16)).slice(-2); }
    return "#" + q(rr) + q(gg) + q(bb);
  }

  function text(value, fallback) {
    var out = String(value == null ? (fallback || "") : value);
    return out.slice(0, 256);
  }

  /* Accept both resolved inventory objects and the string ids used by older
     Life XP saves. This creates a short render-only value; it never writes
     a resolved model, SVG, cache, or migration field back into player state. */
  function normalizeItem(item) {
    if (typeof item === "string" || typeof item === "number") {
      var primitive = text(item, "item");
      return { id: primitive, name: primitive, rarity: "common", family: "" };
    }
    item = item && typeof item === "object" ? item : {};
    var id = text(item.lootId || item.id || item.name, "item");
    return {
      id: id,
      name: text(item.name || item.lootId || item.id, id),
      rarity: text(item.tier || item.rarity, "common").toLowerCase(),
      family: text(item.family, "")
    };
  }

  function itemPalette(item) {
    var base = pal(item.rarity);
    var turn = ((hash(item.id || item.name) >>> 5) % 21) - 10;
    return {
      metal: shiftHue(base.metal, turn),
      dark: shiftHue(base.dark, Math.round(turn / 2)),
      gem: shiftHue(base.gem, -turn),
      glow: base.glow,
      trim: base.trim
    };
  }

  function glowFilter(id, amount) {
    if (!amount) return "";
    return '<filter id="' + id + '" x="-60%" y="-60%" width="220%" height="220%">' +
      '<feGaussianBlur stdDeviation="' + (1.4 + amount * 3).toFixed(2) + '" result="b"/>' +
      '<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>';
  }
  function gemStud(x, y, r, p) {
    return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + p.gem +
           '" stroke="' + p.dark + '" stroke-width="0.6"/>';
  }

  /* ---------- WEAPONS ----------------------------------------- */

  function weaponSvg(item) {
    var p = itemPalette(item), form = formOf(item.name, WEAPON_FORMS, "sword");
    var gid = "wg" + hash(item.id || item.name);
    var j = jitter(item.id || item.name, 2);
    var g = [], f = glowFilter(gid, p.glow);
    var fx = p.glow ? ' filter="url(#' + gid + ')"' : "";

    function hilt(cx, y) {
      return '<rect x="' + (cx - 7) + '" y="' + y + '" width="14" height="4" rx="1.5" fill="' + p.dark + '"/>' +
             '<rect x="' + (cx - 1.6) + '" y="' + (y + 4) + '" width="3.2" height="11" rx="1.4" fill="#4A3320"/>' +
             (p.trim >= 2 ? gemStud(cx, y + 2, 1.8, p) : "");
    }

    switch (form) {
      case "dualblade":
        g.push('<path d="M142 ' + (126 + j) + ' l-4 10 l20 42 l7 -4 l-20 -42 Z" fill="' + p.metal +
               '" stroke="' + p.dark + '" stroke-width="1.2"/>');
        g.push('<path d="M162 ' + (126 - j) + ' l4 10 l-20 42 l-7 -4 l20 -42 Z" fill="' + p.gem +
               '" stroke="' + p.dark + '" stroke-width="1.2"/>');
        g.push(hilt(142, 174)); g.push(hilt(162, 174));
        break;
      case "greatsword":
        g.push('<path d="M150 ' + (86 + j) + ' L145 100 L145 176 L157 176 L157 100 Z" fill="' + p.metal +
               '" stroke="' + p.dark + '" stroke-width="1.4"/>');
        g.push('<path d="M151 ' + (92 + j) + ' L151 174" stroke="' + p.gem + '" stroke-width="1.1" opacity=".75"/>');
        g.push(hilt(151, 176));
        break;
      case "dagger":
        g.push('<path d="M151 ' + (140 + j) + ' L147 152 L147 176 L155 176 L155 152 Z" fill="' + p.metal +
               '" stroke="' + p.dark + '" stroke-width="1.2"/>');
        g.push(hilt(151, 176));
        break;
      case "staff":
        g.push('<line x1="152" y1="' + (108 + j) + '" x2="152" y2="200" stroke="' + p.dark +
               '" stroke-width="3.4" stroke-linecap="round"/>');
        g.push('<circle cx="152" cy="' + (102 + j) + '" r="7.5" fill="' + p.gem + '" stroke="' + p.dark + '" stroke-width="1.3"/>');
        if (p.trim >= 2) g.push('<circle cx="152" cy="' + (102 + j) + '" r="3" fill="#fff" opacity=".8"/>');
        break;
      case "bow":
        g.push('<path d="M46 ' + (120 + j) + ' Q34 164 46 208" stroke="' + p.metal +
               '" stroke-width="3.4" fill="none" stroke-linecap="round"/>');
        g.push('<line x1="46" y1="' + (120 + j) + '" x2="46" y2="208" stroke="' + p.gem +
               '" stroke-width="1" opacity=".85"/>');
        if (p.trim >= 2) g.push(gemStud(41, 164, 2.2, p));
        break;
      case "axe":
        g.push('<line x1="151" y1="118" x2="151" y2="196" stroke="#4A3320" stroke-width="3.4"/>');
        g.push('<path d="M151 ' + (118 + j) + ' q20 6 20 22 q-20 4 -20 -4 Z" fill="' + p.metal +
               '" stroke="' + p.dark + '" stroke-width="1.3"/>');
        break;
      case "mace":
        g.push('<line x1="151" y1="126" x2="151" y2="198" stroke="#4A3320" stroke-width="3.4"/>');
        g.push('<circle cx="151" cy="' + (120 + j) + '" r="9" fill="' + p.metal + '" stroke="' + p.dark + '" stroke-width="1.4"/>');
        if (p.trim >= 1) g.push(gemStud(151, 120, 2.6, p));
        break;
      case "pickaxe":
        g.push('<line x1="151" y1="126" x2="151" y2="199" stroke="#4A3320" stroke-width="3.4"/>');
        g.push('<path d="M128 ' + (124 + j) + ' q23 -15 46 0 l-3 5 q-20 -9 -40 0 Z" fill="' + p.metal +
               '" stroke="' + p.dark + '" stroke-width="1.3"/>');
        if (p.trim >= 2) g.push(gemStud(151, 125 + j, 2.2, p));
        break;
      case "trident":
        g.push('<line x1="151" y1="111" x2="151" y2="204" stroke="#4A3320" stroke-width="3"/>');
        g.push('<path d="M139 ' + (102 + j) + ' v14 q0 7 12 10 q12 -3 12 -10 v-14 M151 ' +
               (96 + j) + ' v29" stroke="' + p.metal + '" stroke-width="3" fill="none" stroke-linecap="round"/>');
        g.push('<path d="M136 ' + (102 + j) + ' l3 -8 l3 8 M148 ' + (96 + j) + ' l3 -8 l3 8 M160 ' +
               (102 + j) + ' l3 -8 l3 8" fill="' + p.gem + '" stroke="' + p.dark + '" stroke-width="1"/>');
        break;
      case "spear":
        g.push('<line x1="151" y1="104" x2="151" y2="204" stroke="#4A3320" stroke-width="3"/>');
        g.push('<path d="M151 ' + (92 + j) + ' l6 16 l-12 0 Z" fill="' + p.metal + '" stroke="' + p.dark + '" stroke-width="1.2"/>');
        break;
      case "fist":
        g.push('<path d="M79 ' + (126 + j) + ' l11 -5 l9 8 l-4 16 l-13 1 l-7 -9 Z" fill="' + p.metal +
               '" stroke="' + p.dark + '" stroke-width="1.4"/>');
        g.push('<path d="M117 ' + (126 - j) + ' l10 -5 l11 8 l-2 15 l-14 2 l-8 -9 Z" fill="' + p.metal +
               '" stroke="' + p.dark + '" stroke-width="1.4"/>');
        g.push('<path d="M81 131 h13 M120 131 h13" stroke="' + p.gem + '" stroke-width="2"/>');
        break;
      case "flask":
        g.push('<path d="M147 ' + (138 + j) + ' v13 l-9 18 q-4 10 8 13 h12 q12 -3 8 -13 l-9 -18 v-13 Z" fill="' +
               p.gem + '" stroke="' + p.dark + '" stroke-width="1.4" opacity=".94"/>');
        g.push('<rect x="145" y="' + (134 + j) + '" width="14" height="6" rx="2" fill="' + p.metal +
               '" stroke="' + p.dark + '" stroke-width="1"/>');
        g.push('<circle cx="148" cy="170" r="2" fill="#fff" opacity=".75"/>');
        break;
      case "drum":
        g.push('<ellipse cx="151" cy="151" rx="17" ry="7" fill="' + p.gem + '" stroke="' + p.dark + '" stroke-width="1.3"/>');
        g.push('<path d="M134 151 v28 q17 9 34 0 v-28" fill="' + p.metal + '" stroke="' + p.dark + '" stroke-width="1.3"/>');
        g.push('<path d="M137 156 l28 20 M165 156 l-28 20" stroke="' + p.dark + '" stroke-width="1.2" opacity=".8"/>');
        g.push('<line x1="128" y1="135" x2="146" y2="154" stroke="#4A3320" stroke-width="2.4"/>');
        break;
      case "boomerang":
        g.push('<path d="M139 ' + (142 + j) + ' q22 -20 39 -3 l-8 8 q-10 -8 -18 2 q10 8 16 18 l-10 5 q-8 -16 -25 -19 Z" fill="' +
               p.metal + '" stroke="' + p.dark + '" stroke-width="1.4"/>');
        if (p.trim >= 2) g.push('<path d="M145 147 q16 -10 26 -3" stroke="' + p.gem + '" stroke-width="2" fill="none"/>');
        break;
      case "quill":
        g.push('<path d="M158 ' + (126 + j) + ' q-16 26 -12 48 q14 -10 18 -30 Z" fill="' + p.gem +
               '" stroke="' + p.dark + '" stroke-width="1.1"/>');
        g.push('<line x1="146" y1="174" x2="152" y2="160" stroke="' + p.dark + '" stroke-width="1.6"/>');
        break;
      case "tome":
        g.push('<rect x="140" y="' + (150 + j) + '" width="24" height="18" rx="2" fill="' + p.metal +
               '" stroke="' + p.dark + '" stroke-width="1.3"/>');
        g.push('<line x1="152" y1="' + (150 + j) + '" x2="152" y2="' + (168 + j) + '" stroke="' + p.dark + '" stroke-width="1.2"/>');
        if (p.trim >= 2) g.push(gemStud(152, 159 + j, 2.2, p));
        break;
      case "lute":
        g.push('<ellipse cx="48" cy="176" rx="15" ry="12" fill="' + p.metal + '" stroke="' + p.dark + '" stroke-width="1.3"/>');
        g.push('<rect x="45" y="148" width="3" height="28" fill="' + p.dark + '"/>');
        break;
      case "orb":
        g.push('<circle cx="150" cy="' + (150 + j) + '" r="9" fill="' + p.gem + '" stroke="' + p.dark + '" stroke-width="1.3" opacity=".95"/>');
        g.push('<circle cx="147" cy="' + (147 + j) + '" r="3" fill="#fff" opacity=".7"/>');
        break;
      default: /* sword */
        g.push('<path d="M151 ' + (104 + j) + ' L146 116 L146 176 L156 176 L156 116 Z" fill="' + p.metal +
               '" stroke="' + p.dark + '" stroke-width="1.3"/>');
        g.push('<line x1="151" y1="118" x2="151" y2="174" stroke="' + p.gem + '" stroke-width="1" opacity=".7"/>');
        g.push(hilt(151, 176));
    }
    return '<g class="fh-item fh-weapon" data-form="' + form + '" data-rarity="' + esc(item.rarity) + '">' +
           f + '<g' + fx + '>' + g.join("") + '</g></g>';
  }

  /* ---------- HELMETS ----------------------------------------- */

  function helmetSvg(item) {
    var p = itemPalette(item), form = formOf(item.name, HELM_FORMS, "helm");
    var gid = "hg" + hash(item.id || item.name);
    var f = glowFilter(gid, p.glow), fx = p.glow ? ' filter="url(#' + gid + ')"' : "";
    var g = [];
    switch (form) {
      case "crown":
        g.push('<path d="M86 62 L92 46 L100 58 L108 42 L116 58 L124 46 L130 62 Z" fill="' + p.metal +
               '" stroke="' + p.dark + '" stroke-width="1.3"/>');
        g.push('<rect x="86" y="62" width="44" height="6" rx="2" fill="' + p.dark + '"/>');
        if (p.trim >= 3) { g.push(gemStud(108, 54, 3, p)); g.push(gemStud(94, 58, 2, p)); g.push(gemStud(122, 58, 2, p)); }
        break;
      case "halo":
        g.push('<ellipse cx="108" cy="49" rx="27" ry="8" fill="none" stroke="' + p.gem + '" stroke-width="4" opacity=".92"/>');
        g.push('<ellipse cx="108" cy="49" rx="20" ry="4" fill="none" stroke="#fff" stroke-width="1.3" opacity=".72"/>');
        break;
      case "eye":
        g.push('<path d="M82 64 q26 -23 52 0 q-26 23 -52 0 Z" fill="' + p.metal + '" stroke="' + p.dark + '" stroke-width="1.4"/>');
        g.push('<circle cx="108" cy="64" r="10" fill="' + p.gem + '" stroke="' + p.dark + '" stroke-width="1.2"/>');
        g.push('<circle cx="108" cy="64" r="4" fill="#11151f"/><circle cx="105" cy="61" r="2" fill="#fff" opacity=".8"/>');
        break;
      case "spectacles":
        g.push('<circle cx="99" cy="76" r="7" fill="none" stroke="' + p.metal + '" stroke-width="2"/>');
        g.push('<circle cx="117" cy="76" r="7" fill="none" stroke="' + p.metal + '" stroke-width="2"/>');
        g.push('<line x1="106" y1="76" x2="110" y2="76" stroke="' + p.metal + '" stroke-width="2"/>');
        break;
      case "hood":
        g.push('<path d="M84 74 q24 -34 48 0 q-6 -14 -24 -16 q-18 2 -24 16 Z" fill="' + p.metal +
               '" stroke="' + p.dark + '" stroke-width="1.3"/>');
        break;
      case "cap":
        g.push('<path d="M88 66 q20 -20 40 0 Z" fill="' + p.metal + '" stroke="' + p.dark + '" stroke-width="1.2"/>');
        g.push('<rect x="86" y="66" width="44" height="5" rx="2" fill="' + p.dark + '"/>');
        break;
      case "tomehat":
        g.push('<rect x="90" y="52" width="36" height="14" rx="2" fill="' + p.metal + '" stroke="' + p.dark + '" stroke-width="1.2"/>');
        g.push('<rect x="84" y="66" width="48" height="5" rx="2" fill="' + p.dark + '"/>');
        break;
      default: /* helm */
        g.push('<path d="M86 72 q22 -30 44 0 l0 10 l-44 0 Z" fill="' + p.metal + '" stroke="' + p.dark + '" stroke-width="1.3"/>');
        g.push('<rect x="104" y="58" width="8" height="24" rx="2" fill="' + p.dark + '" opacity=".85"/>');
        if (p.trim >= 2) g.push(gemStud(108, 62, 2.4, p));
    }
    return '<g class="fh-item fh-helmet" data-form="' + form + '" data-rarity="' + esc(item.rarity) + '">' +
           f + '<g' + fx + '>' + g.join("") + '</g></g>';
  }

  /* ---------- ARMOR ------------------------------------------- */

  function armorSvg(item) {
    var p = itemPalette(item), form = formOf(item.name, ARMOR_FORMS, "vest");
    var gid = "ag" + hash(item.id || item.name);
    var f = glowFilter(gid, p.glow), fx = p.glow ? ' filter="url(#' + gid + ')"' : "";
    var g = [];
    switch (form) {
      case "shield":
        g.push('<path d="M73 100 q18 -7 36 0 v21 q-3 25 -18 34 q-15 -9 -18 -34 Z" fill="' + p.metal +
               '" stroke="' + p.dark + '" stroke-width="1.5"/>');
        g.push('<path d="M91 101 v47 M77 117 h28" stroke="' + p.gem + '" stroke-width="2" opacity=".82"/>');
        if (p.trim >= 2) g.push(gemStud(91, 117, 3, p));
        break;
      case "pauldron":
        g.push('<path d="M78 97 q13 -14 27 0 l-5 13 l-24 -2 Z" fill="' + p.metal + '" stroke="' + p.dark + '" stroke-width="1.3"/>');
        g.push('<path d="M111 97 q13 -14 27 0 l2 11 l-24 2 Z" fill="' + p.metal + '" stroke="' + p.dark + '" stroke-width="1.3"/>');
        g.push('<path d="M87 98 l8 -7 M121 98 l8 -7" stroke="' + p.gem + '" stroke-width="2"/>');
        break;
      case "plate":
        g.push('<path d="M88 96 l20 -8 l20 8 l-4 44 l-32 0 Z" fill="' + p.metal + '" stroke="' + p.dark + '" stroke-width="1.4"/>');
        g.push('<path d="M108 90 l0 50" stroke="' + p.dark + '" stroke-width="1.2" opacity=".7"/>');
        g.push('<path d="M92 108 l32 0" stroke="' + p.dark + '" stroke-width="1" opacity=".5"/>');
        if (p.trim >= 2) g.push(gemStud(108, 104, 3, p));
        break;
      case "robe":
        g.push('<path d="M90 96 l18 -8 l18 8 l6 56 l-48 0 Z" fill="' + p.metal + '" stroke="' + p.dark + '" stroke-width="1.3"/>');
        g.push('<path d="M108 90 l0 60" stroke="' + p.gem + '" stroke-width="1.4" opacity=".6"/>');
        break;
      case "coat":
        g.push('<path d="M88 96 l20 -8 l20 8 l5 55 l-19 0 l-6 -25 l-6 25 l-19 0 Z" fill="' + p.metal +
               '" stroke="' + p.dark + '" stroke-width="1.3"/>');
        g.push('<path d="M108 90 v36 M97 96 l11 16 l11 -16" stroke="' + p.gem + '" stroke-width="1.5" fill="none"/>');
        g.push('<circle cx="102" cy="119" r="1.7" fill="' + p.dark + '"/><circle cx="114" cy="119" r="1.7" fill="' + p.dark + '"/>');
        break;
      case "tunic":
        g.push('<path d="M90 96 l18 -7 l18 7 l-3 42 l-30 0 Z" fill="' + p.metal + '" stroke="' + p.dark + '" stroke-width="1.2"/>');
        break;
      case "cloak":
        g.push('<path d="M84 92 q24 -10 48 0 l8 62 l-64 0 Z" fill="' + p.metal + '" stroke="' + p.dark + '" stroke-width="1.3" opacity=".95"/>');
        break;
      case "boots":
        g.push('<path d="M94 150 l0 16 l-8 0 l0 6 l20 0 l0 -22 Z" fill="' + p.metal + '" stroke="' + p.dark + '" stroke-width="1.2"/>');
        g.push('<path d="M114 150 l0 16 l8 0 l0 6 l-20 0 l0 -22 Z" fill="' + p.metal + '" stroke="' + p.dark + '" stroke-width="1.2"/>');
        break;
      default: /* vest */
        g.push('<path d="M90 96 l18 -7 l18 7 l-3 40 l-30 0 Z" fill="' + p.metal + '" stroke="' + p.dark + '" stroke-width="1.2"/>');
        g.push('<circle cx="100" cy="108" r="1.8" fill="' + p.dark + '"/>');
        g.push('<circle cx="116" cy="108" r="1.8" fill="' + p.dark + '"/>');
        g.push('<circle cx="100" cy="120" r="1.8" fill="' + p.dark + '"/>');
        g.push('<circle cx="116" cy="120" r="1.8" fill="' + p.dark + '"/>');
    }
    return '<g class="fh-item fh-armor" data-form="' + form + '" data-rarity="' + esc(item.rarity) + '">' +
           f + '<g' + fx + '>' + g.join("") + '</g></g>';
  }

  /* ---------- MOUNTS ------------------------------------------ */
  /* Drawn beneath the hero as a real animal, not a badge. */

  /* ---------- MOUNTS ------------------------------------------
   * Built from a shared quadruped skeleton with per-family
   * anatomy, so a wolf reads as a wolf and a dragon as a dragon
   * at portrait size. Every part is a parameter, not a blob:
   *
   *   body   length / depth / slung height
   *   neck   length / angle
   *   head   muzzle shape and size
   *   crown  ears, horns, antlers or a beak
   *   back   wings or spines
   *   tail   brush, whip, plume or fan
   *   legs   count, thickness, hoof or paw
   * ---------------------------------------------------------- */

  var MOUNT_ANATOMY = {
    horse:    { bl:52, bd:17, neck:26, nAng:-34, head:"muzzle", crown:"ears",    tail:"hair",  legs:"hoof", mane:1 },
    pony:     { bl:44, bd:16, neck:19, nAng:-30, head:"muzzle", crown:"ears",    tail:"hair",  legs:"hoof", mane:1 },
    unicorn:  { bl:52, bd:16, neck:28, nAng:-40, head:"muzzle", crown:"horn",    tail:"plume", legs:"hoof", mane:1 },
    stag:     { bl:48, bd:15, neck:26, nAng:-42, head:"muzzle", crown:"antler",  tail:"tuft",  legs:"hoof", mane:0 },
    ram:      { bl:44, bd:18, neck:16, nAng:-24, head:"blunt",  crown:"curl",    tail:"tuft",  legs:"hoof", mane:0 },
    boar:     { bl:44, bd:20, neck:12, nAng:-14, head:"snout",  crown:"tusk",    tail:"whip",  legs:"hoof", mane:0 },
    wolf:     { bl:50, bd:15, neck:16, nAng:-20, head:"snout",  crown:"perk",    tail:"brush", legs:"paw",  mane:0 },
    feline:   { bl:52, bd:14, neck:14, nAng:-16, head:"round",  crown:"perk",    tail:"whip",  legs:"paw",  mane:0 },
    bear:     { bl:48, bd:22, neck:12, nAng:-16, head:"round",  crown:"round",   tail:"stub",  legs:"paw",  mane:0 },
    griffin:  { bl:48, bd:16, neck:22, nAng:-38, head:"beak",   crown:"crest",   tail:"plume", legs:"paw",  wing:"feather" },
    dragon:   { bl:56, bd:19, neck:26, nAng:-32, head:"snout",  crown:"spine",   tail:"spade", legs:"paw",  wing:"membrane" },
    crocodile:{ bl:62, bd:12, neck:12, nAng:-5,  head:"snout",  crown:"spine",   tail:"long",  legs:"paw",  mane:0 },
    tortoise: { bl:52, bd:18, neck:11, nAng:-7,  head:"round",  crown:"none",    tail:"stub",  legs:"paw",  mane:0, shell:1 },
    raptor:   { bl:43, bd:14, neck:27, nAng:-48, head:"snout",  crown:"crest",   tail:"long",  legs:"paw",  mane:0 },
    rhino:    { bl:58, bd:22, neck:13, nAng:-12, head:"blunt",  crown:"rhino",   tail:"tuft",  legs:"hoof", mane:0 },
    bovine:   { bl:55, bd:21, neck:14, nAng:-15, head:"blunt",  crown:"curl",    tail:"tuft",  legs:"hoof", mane:0 },
    mammoth:  { bl:58, bd:24, neck:13, nAng:-14, head:"blunt",  crown:"tusk",    tail:"tuft",  legs:"hoof", mane:1 },
    kitsune:  { bl:48, bd:14, neck:17, nAng:-24, head:"snout",  crown:"perk",    tail:"fan",   legs:"paw",  mane:0 },
    critter:  { bl:38, bd:15, neck:10, nAng:-18, head:"round",  crown:"perk",    tail:"stub",  legs:"paw",  mane:0 },
    undead:   { bl:51, bd:16, neck:24, nAng:-34, head:"muzzle", crown:"ears",    tail:"whip",  legs:"hoof", mane:0, bones:1 },
    elemental:{ bl:53, bd:17, neck:23, nAng:-31, head:"muzzle", crown:"spine",   tail:"spade", legs:"hoof", mane:1, runes:1 },
    moth:     { bl:30, bd:10, neck:9,  nAng:-18, head:"round",  crown:"antenna", tail:"none",  legs:"none", wing:"moth" },
    seraph:   { bl:0,  bd:0,  neck:0,  nAng:0,   head:"none",   crown:"none",    tail:"none",  legs:"none", wingOnly:1 },
    shark:    { bl:0,  bd:0,  neck:0,  nAng:0,   head:"none",   crown:"none",    tail:"none",  legs:"none", aquatic:1 },
    ray:      { bl:0,  bd:0,  neck:0,  nAng:0,   head:"none",   crown:"none",    tail:"none",  legs:"none", ray:1 },
    hippocampus:{bl:42,bd:14, neck:25, nAng:-42, head:"muzzle", crown:"crest",   tail:"coil",  legs:"none", mane:1 },
    aquatic_critter:{bl:42,bd:15,neck:12,nAng:-18,head:"round", crown:"perk",    tail:"long",  legs:"paw",  mane:0 },
    serpent:  { bl:60, bd:13, neck:22, nAng:-46, head:"round",  crown:"none",    tail:"coil",  legs:"none", mane:0 },
    arachnid: { bl:38, bd:20, neck:0,  nAng:0,   head:"none",   crown:"none",    tail:"none",  legs:"eight",mane:0 },
    skiff:    { bl:0,  bd:0,  neck:0,  nAng:0,   head:"none",   crown:"none",    tail:"none",  legs:"none", hull:1 }
  };

  function mountSvg(item) {
    var p = itemPalette(item);
    var resolution = resolveMountForm(item);
    var fam = resolution.form;
    var A = MOUNT_ANATOMY[fam] || MOUNT_ANATOMY.horse;
    var key = item.id || item.name;
    var h = hash(key);
    var gid = "mg" + h;
    var f = glowFilter(gid, p.glow), fx = p.glow ? ' filter="url(#' + gid + ')"' : "";

    var coat = shiftHue(p.metal, ((h >>> 3) % 25) - 12);
    var dark = shiftHue(p.dark, ((h >>> 7) % 17) - 8);
    var mark = h % 4;
    var stretch = 1 + (((h >>> 11) % 7) - 3) / 100;

    var CX = 108, GY = 214;                       // ground line
    var bl = A.bl * stretch, bd = A.bd;
    var bx = CX - bl / 2, by = GY - 34 - bd;      // body box
    var g = [];

    /* ----- hull-only mounts (skiff) ----- */
    if (A.hull) {
      g.push('<path d="M' + (CX - 46) + ' ' + (GY - 26) + ' q46 -20 92 0 q-10 20 -46 20 q-36 0 -46 -20 Z" fill="' + coat + '" stroke="' + dark + '" stroke-width="1.6"/>');
      g.push('<path d="M' + (CX - 34) + ' ' + (GY - 30) + ' q34 -12 68 0" stroke="' + p.gem + '" stroke-width="2" fill="none" opacity=".8"/>');
      g.push('<ellipse cx="' + CX + '" cy="' + (GY + 4) + '" rx="44" ry="6" fill="' + p.gem + '" opacity=".40"/>');
      g.push('<ellipse cx="' + CX + '" cy="' + (GY + 12) + '" rx="30" ry="4" fill="' + p.gem + '" opacity=".22"/>');
      return wrap(g);
    }

    /* ----- silhouette-only flying and aquatic mounts ---------- */
    if (A.wingOnly) {
      g.push('<path d="M108 194 q-34 -50 -70 -36 q14 12 27 30 q-17 -9 -29 2 q25 24 66 18 Z" fill="' + coat +
             '" stroke="' + dark + '" stroke-width="1.5"/>');
      g.push('<path d="M108 194 q34 -50 70 -36 q-14 12 -27 30 q17 -9 29 2 q-25 24 -66 18 Z" fill="' + coat +
             '" stroke="' + dark + '" stroke-width="1.5"/>');
      g.push('<path d="M52 171 q33 13 56 31 M164 171 q-33 13 -56 31" stroke="' + p.gem + '" stroke-width="2" fill="none" opacity=".78"/>');
      g.push('<ellipse cx="108" cy="157" rx="22" ry="7" fill="none" stroke="' + p.gem + '" stroke-width="3"/>');
      return wrap(g);
    }
    if (A.aquatic) {
      g.push('<path d="M54 190 q35 -28 83 -9 l22 -16 l-4 22 l12 16 l-30 -5 q-47 22 -83 -8 Z" fill="' + coat +
             '" stroke="' + dark + '" stroke-width="1.6"/>');
      g.push('<path d="M102 181 l18 -23 l8 29 Z" fill="' + p.gem + '" stroke="' + dark + '" stroke-width="1.2"/>');
      g.push('<path d="M63 188 l-15 -8 l6 13 Z" fill="' + p.gem + '"/><circle cx="73" cy="186" r="2" fill="#11151f"/>');
      g.push('<path d="M69 197 q16 7 31 0" stroke="#fff" stroke-width="1" fill="none" opacity=".55"/>');
      g.push('<ellipse cx="108" cy="216" rx="50" ry="5" fill="' + p.gem + '" opacity=".24"/>');
      return wrap(g);
    }
    if (A.ray) {
      g.push('<path d="M50 192 q26 -34 58 -10 q32 -24 58 10 q-18 18 -53 7 l-5 24 l-6 -24 q-34 11 -52 -7 Z" fill="' + coat +
             '" stroke="' + dark + '" stroke-width="1.6"/>');
      g.push('<path d="M75 190 q33 -14 66 0" stroke="' + p.gem + '" stroke-width="2" fill="none" opacity=".75"/>');
      g.push('<circle cx="103" cy="187" r="1.8" fill="#11151f"/><circle cx="113" cy="187" r="1.8" fill="#11151f"/>');
      g.push('<ellipse cx="108" cy="218" rx="48" ry="5" fill="' + p.gem + '" opacity=".22"/>');
      return wrap(g);
    }

    /* ----- legs ----- */
    function leg(x, top, w, kind) {
      var out = '<rect x="' + (x - w / 2) + '" y="' + top + '" width="' + w + '" height="' + (GY - top) + '" rx="' + (w / 2) + '" fill="' + dark + '"/>';
      if (kind === "hoof") out += '<rect x="' + (x - w / 2 - 0.6) + '" y="' + (GY - 4) + '" width="' + (w + 1.2) + '" height="4" rx="1.4" fill="' + shiftHue(dark, -6) + '"/>';
      if (kind === "paw")  out += '<ellipse cx="' + x + '" cy="' + (GY - 1) + '" rx="' + (w / 2 + 1.4) + '" ry="2.6" fill="' + shiftHue(dark, -6) + '"/>';
      return out;
    }
    if (A.legs === "eight") {
      for (var i = 0; i < 4; i++) {
        var sp = 10 + i * 5;
        g.push('<path d="M' + (CX - 14) + ' ' + (by + bd) + ' q-' + sp + ' ' + (6 + i * 3) + ' -' + (sp + 6) + ' ' + (26 - i * 2) + '" stroke="' + dark + '" stroke-width="2.6" fill="none" stroke-linecap="round"/>');
        g.push('<path d="M' + (CX + 14) + ' ' + (by + bd) + ' q' + sp + ' ' + (6 + i * 3) + ' ' + (sp + 6) + ' ' + (26 - i * 2) + '" stroke="' + dark + '" stroke-width="2.6" fill="none" stroke-linecap="round"/>');
      }
    } else if (A.legs !== "none") {
      var lw = A.bd >= 20 ? 8 : 6.5, top = by + bd - 2;
      g.push(leg(bx + 8, top, lw, A.legs));
      g.push(leg(bx + 18, top, lw, A.legs));
      g.push(leg(bx + bl - 18, top, lw, A.legs));
      g.push(leg(bx + bl - 8, top, lw, A.legs));
    }

    /* ----- tail ----- */
    var tx = bx + 2, ty = by + 4;
    if (A.tail === "brush") g.push('<path d="M' + tx + ' ' + ty + ' q-18 4 -22 18 q10 -2 18 -10 Z" fill="' + coat + '" stroke="' + dark + '" stroke-width="1.1"/>');
    else if (A.tail === "hair") g.push('<path d="M' + tx + ' ' + ty + ' q-14 10 -12 26 q8 -8 14 -22 Z" fill="' + shiftHue(coat, -8) + '" stroke="' + dark + '" stroke-width="1"/>');
    else if (A.tail === "plume") { g.push('<path d="M' + tx + ' ' + ty + ' q-20 2 -24 -12 q14 2 22 6 Z" fill="' + p.gem + '" stroke="' + dark + '" stroke-width="1"/>');
                                   g.push('<path d="M' + tx + ' ' + (ty + 4) + ' q-18 6 -20 -2" stroke="' + p.gem + '" stroke-width="2" fill="none"/>'); }
    else if (A.tail === "whip") g.push('<path d="M' + tx + ' ' + ty + ' q-16 -2 -18 -14" stroke="' + dark + '" stroke-width="2.6" fill="none" stroke-linecap="round"/>');
    else if (A.tail === "tuft") g.push('<path d="M' + tx + ' ' + ty + ' q-9 2 -10 10 q6 -1 10 -5 Z" fill="' + coat + '" stroke="' + dark + '" stroke-width="1"/>');
    else if (A.tail === "spade") { g.push('<path d="M' + tx + ' ' + (ty + 2) + ' q-22 6 -30 -6" stroke="' + coat + '" stroke-width="5" fill="none" stroke-linecap="round"/>');
                                   g.push('<path d="M' + (tx - 30) + ' ' + (ty - 4) + ' l-9 -5 l1 10 Z" fill="' + p.gem + '" stroke="' + dark + '" stroke-width="1"/>'); }
    else if (A.tail === "stub") g.push('<circle cx="' + (tx - 3) + '" cy="' + ty + '" r="4" fill="' + coat + '" stroke="' + dark + '" stroke-width="1"/>');
    else if (A.tail === "coil") g.push('<path d="M' + tx + ' ' + (ty + 6) + ' q-26 12 -14 22 q10 8 22 -2" stroke="' + coat + '" stroke-width="9" fill="none" stroke-linecap="round"/>');
    else if (A.tail === "long") g.push('<path d="M' + tx + ' ' + (ty + 5) + ' q-29 3 -38 19 q17 1 39 -9 Z" fill="' + coat + '" stroke="' + dark + '" stroke-width="1.2"/>');
    else if (A.tail === "fan") {
      for (var tf = 0; tf < 3; tf++) g.push('<path d="M' + tx + ' ' + (ty + 5) + ' q-' + (20 + tf * 5) + ' ' + (-12 + tf * 11) + ' -' + (31 + tf * 3) + ' ' + (-3 + tf * 12) + ' q15 4 31 8 Z" fill="' + (tf === 1 ? p.gem : coat) + '" stroke="' + dark + '" stroke-width="1" opacity=".92"/>');
    }

    /* ----- body ----- */
    g.push('<rect x="' + bx + '" y="' + by + '" width="' + bl + '" height="' + bd + '" rx="' + (bd / 2) + '" fill="' + coat + '" stroke="' + dark + '" stroke-width="1.5"/>');
    if (A.shell) {
      g.push('<ellipse cx="' + CX + '" cy="' + (by + bd / 2) + '" rx="' + (bl * .42) + '" ry="' + (bd * .72) + '" fill="' + p.gem + '" stroke="' + dark + '" stroke-width="1.2" opacity=".9"/>');
      g.push('<path d="M' + (CX - 16) + ' ' + (by + bd / 2) + ' h32 M' + CX + ' ' + (by + 1) + ' v' + (bd - 2) + '" stroke="' + dark + '" stroke-width="1" opacity=".65"/>');
    }
    if (A.bones) {
      g.push('<path d="M' + (bx + 10) + ' ' + (by + 4) + ' h' + (bl - 20) + ' M' + (bx + 16) + ' ' + (by + 2) + ' v' + (bd - 4) + ' M' + (bx + bl - 16) + ' ' + (by + 2) + ' v' + (bd - 4) + '" stroke="#F2ECD8" stroke-width="2" opacity=".82"/>');
    }
    if (A.runes) {
      g.push('<path d="M' + (CX - 12) + ' ' + (by + 4) + ' l5 8 l5 -8 l5 8 l5 -8" stroke="' + p.gem + '" stroke-width="1.8" fill="none"/>');
    }

    /* ----- wings (behind is fine at this size) ----- */
    if (A.wing === "feather") {
      g.push('<path d="M' + (CX - 6) + ' ' + (by + 2) + ' q-26 -30 -50 -22 q10 26 44 30 Z" fill="' + p.gem + '" stroke="' + dark + '" stroke-width="1.2" opacity=".95"/>');
      g.push('<path d="M' + (CX - 10) + ' ' + (by + 4) + ' q-20 -16 -34 -14" stroke="' + dark + '" stroke-width="1" fill="none" opacity=".6"/>');
    } else if (A.wing === "membrane") {
      g.push('<path d="M' + (CX - 4) + ' ' + (by + 1) + ' q-24 -36 -52 -30 q6 16 20 26 q-14 -2 -20 4 q18 10 52 6 Z" fill="' + p.gem + '" stroke="' + dark + '" stroke-width="1.3" opacity=".92"/>');
    } else if (A.wing === "moth") {
      g.push('<path d="M' + (CX - 4) + ' ' + (by + 5) + ' q-28 -36 -53 -17 q7 13 22 19 q-16 5 -17 19 q29 5 51 -15 Z" fill="' + p.gem + '" stroke="' + dark + '" stroke-width="1.2" opacity=".92"/>');
      g.push('<path d="M' + (CX + 4) + ' ' + (by + 5) + ' q28 -36 53 -17 q-7 13 -22 19 q16 5 17 19 q-29 5 -51 -15 Z" fill="' + coat + '" stroke="' + dark + '" stroke-width="1.2" opacity=".92"/>');
      g.push('<circle cx="' + (CX - 34) + '" cy="' + (by - 2) + '" r="5" fill="' + coat + '" opacity=".72"/><circle cx="' + (CX + 34) + '" cy="' + (by - 2) + '" r="5" fill="' + p.gem + '" opacity=".72"/>');
    }

    /* ----- neck + head ----- */
    if (A.neck > 0) {
      var rad = A.nAng * Math.PI / 180;
      var nx0 = bx + bl - 8, ny0 = by + 3;
      var nx1 = nx0 + Math.cos(rad) * A.neck * -1 * -1, ny1 = ny0 + Math.sin(rad) * A.neck;
      nx1 = nx0 + Math.abs(Math.cos(rad)) * A.neck * 0.55;
      g.push('<path d="M' + nx0 + ' ' + (ny0 + 6) + ' L' + (nx0 + 2) + ' ' + ny0 + ' L' + (nx1 + 6) + ' ' + ny1 + ' L' + (nx1 + 1) + ' ' + (ny1 + 9) + ' Z" fill="' + coat + '" stroke="' + dark + '" stroke-width="1.4"/>');
      if (A.mane) g.push('<path d="M' + (nx0 + 1) + ' ' + (ny0 - 1) + ' Q' + ((nx0 + nx1) / 2 + 5) + ' ' + ((ny0 + ny1) / 2 - 6) + ' ' + (nx1 + 5) + ' ' + (ny1 - 2) + '" stroke="' + shiftHue(coat, -14) + '" stroke-width="4" fill="none" stroke-linecap="round"/>');

      var hx = nx1 + 5, hy = ny1 + 1;
      if (A.head === "muzzle") {
        g.push('<path d="M' + hx + ' ' + (hy - 5) + ' q13 0 15 6 q1 7 -8 8 q-9 0 -11 -6 Z" fill="' + coat + '" stroke="' + dark + '" stroke-width="1.3"/>');
      } else if (A.head === "snout") {
        g.push('<path d="M' + hx + ' ' + (hy - 6) + ' q16 1 18 7 q-1 7 -10 7 q-10 0 -12 -7 Z" fill="' + coat + '" stroke="' + dark + '" stroke-width="1.3"/>');
      } else if (A.head === "round") {
        g.push('<circle cx="' + (hx + 6) + '" cy="' + (hy + 1) + '" r="8.5" fill="' + coat + '" stroke="' + dark + '" stroke-width="1.3"/>');
      } else if (A.head === "blunt") {
        g.push('<rect x="' + hx + '" y="' + (hy - 6) + '" width="16" height="13" rx="5" fill="' + coat + '" stroke="' + dark + '" stroke-width="1.3"/>');
      } else if (A.head === "beak") {
        g.push('<circle cx="' + (hx + 5) + '" cy="' + hy + '" r="8" fill="' + shiftHue(coat, 10) + '" stroke="' + dark + '" stroke-width="1.3"/>');
        g.push('<path d="M' + (hx + 12) + ' ' + (hy - 2) + ' l9 3 l-9 4 Z" fill="' + p.gem + '" stroke="' + dark + '" stroke-width="1"/>');
      }
      /* eye */
      g.push('<circle cx="' + (hx + 6) + '" cy="' + (hy - 1) + '" r="1.5" fill="#11151f"/>');

      /* crown: ears / horns / antlers / spines */
      var cxh = hx + 4, cyh = hy - 7;
      if (A.crown === "ears")   g.push('<path d="M' + cxh + ' ' + cyh + ' l-1 -8 l6 5 Z M' + (cxh + 8) + ' ' + cyh + ' l1 -8 l-6 5 Z" fill="' + coat + '" stroke="' + dark + '" stroke-width="1"/>');
      else if (A.crown === "perk") g.push('<path d="M' + cxh + ' ' + (cyh + 1) + ' l0 -9 l7 6 Z M' + (cxh + 9) + ' ' + (cyh + 1) + ' l0 -9 l-7 6 Z" fill="' + coat + '" stroke="' + dark + '" stroke-width="1"/>');
      else if (A.crown === "horn")  g.push('<path d="M' + (cxh + 5) + ' ' + cyh + ' l3 -20 l4 20 Z" fill="' + p.gem + '" stroke="' + dark + '" stroke-width="1.1"/>');
      else if (A.crown === "antler") {
        g.push('<path d="M' + (cxh + 2) + ' ' + cyh + ' l-3 -16 m0 0 l-7 5 m7 -5 l6 -6" stroke="' + p.gem + '" stroke-width="2.2" fill="none" stroke-linecap="round"/>');
        g.push('<path d="M' + (cxh + 9) + ' ' + cyh + ' l4 -15 m0 0 l7 4 m-7 -4 l-5 -7" stroke="' + p.gem + '" stroke-width="2.2" fill="none" stroke-linecap="round"/>');
      }
      else if (A.crown === "curl")  g.push('<path d="M' + cxh + ' ' + cyh + ' q-11 -2 -9 7 q2 7 9 5" stroke="' + p.gem + '" stroke-width="3.2" fill="none" stroke-linecap="round"/>');
      else if (A.crown === "tusk")  g.push('<path d="M' + (cxh + 12) + ' ' + (cyh + 10) + ' q5 -1 5 -7" stroke="#F2ECD8" stroke-width="2.4" fill="none" stroke-linecap="round"/>');
      else if (A.crown === "rhino") g.push('<path d="M' + (cxh + 10) + ' ' + (cyh + 8) + ' l12 -8 l-7 13 Z" fill="' + p.gem + '" stroke="' + dark + '" stroke-width="1.2"/>');
      else if (A.crown === "antenna") g.push('<path d="M' + (cxh + 3) + ' ' + cyh + ' q-7 -11 -13 -7 M' + (cxh + 8) + ' ' + cyh + ' q7 -11 13 -7" stroke="' + p.gem + '" stroke-width="1.7" fill="none" stroke-linecap="round"/>');
      else if (A.crown === "crest") g.push('<path d="M' + (cxh + 2) + ' ' + cyh + ' l2 -9 l4 6 l3 -8 l2 11 Z" fill="' + p.gem + '" stroke="' + dark + '" stroke-width="1"/>');
      else if (A.crown === "spine") {
        for (var sN = 0; sN < 4; sN++) {
          var sx = bx + bl - 20 - sN * 11;
          g.push('<path d="M' + sx + ' ' + (by + 1) + ' l4 -8 l4 8 Z" fill="' + p.gem + '" stroke="' + dark + '" stroke-width="0.9"/>');
        }
      }
    }

    /* ----- markings ----- */
    if (mark === 1) g.push('<ellipse cx="' + (bx + bl * 0.72) + '" cy="' + (by + bd * 0.5) + '" rx="6" ry="4" fill="#FFFFFF" opacity=".26"/>');
    else if (mark === 2) { g.push('<rect x="' + (bx + 5) + '" y="' + (GY - 9) + '" width="7" height="8" rx="2" fill="#FFFFFF" opacity=".55"/>');
                           g.push('<rect x="' + (bx + bl - 12) + '" y="' + (GY - 9) + '" width="7" height="8" rx="2" fill="#FFFFFF" opacity=".55"/>'); }
    else if (mark === 3) { g.push('<circle cx="' + (bx + bl * 0.4) + '" cy="' + (by + 6) + '" r="2.6" fill="#FFFFFF" opacity=".22"/>');
                           g.push('<circle cx="' + (bx + bl * 0.6) + '" cy="' + (by + bd - 5) + '" r="2.2" fill="#FFFFFF" opacity=".2"/>'); }

    function wrap(parts) {
      return '<g class="fh-item fh-mount" data-family="' + fam + '" data-rarity="' + esc(item.rarity) +
             '" data-mount-resolution="' + resolution.resolution + '" data-declared-family="' + esc(resolution.declaredFamily) +
             '" data-mark="' + mark + '">' + f + '<g' + fx + '>' + parts.join("") + '</g></g>';
    }
    return wrap(g);
  }

  /* ---------- PETS -------------------------------------------- */

  function petSvg(item) {
    var p = itemPalette(item), form = formOf(item.name, PET_FORMS, "critter");
    var gid = "pg" + hash(item.id || item.name);
    var f = glowFilter(gid, p.glow), fx = p.glow ? ' filter="url(#' + gid + ')"' : "";
    var j = jitter(item.id || item.name, 2);
    var g = [], bx = 58, by = 194 + j;

    switch (form) {
      case "owl":
        g.push('<ellipse cx="' + bx + '" cy="' + by + '" rx="11" ry="13" fill="' + p.metal + '" stroke="' + p.dark + '" stroke-width="1.2"/>');
        g.push('<circle cx="' + (bx - 4) + '" cy="' + (by - 5) + '" r="3.2" fill="#fff"/><circle cx="' + (bx + 4) + '" cy="' + (by - 5) + '" r="3.2" fill="#fff"/>');
        g.push('<circle cx="' + (bx - 4) + '" cy="' + (by - 5) + '" r="1.4" fill="' + p.dark + '"/><circle cx="' + (bx + 4) + '" cy="' + (by - 5) + '" r="1.4" fill="' + p.dark + '"/>');
        g.push('<path d="M' + (bx - 2) + ' ' + (by - 1) + ' l2 3 l2 -3 Z" fill="' + p.gem + '"/>');
        g.push('<path d="M' + (bx - 9) + ' ' + (by - 12) + ' l4 -6 l3 6 Z M' + (bx + 9) + ' ' + (by - 12) + ' l-4 -6 l-3 6 Z" fill="' + p.dark + '"/>');
        break;
      case "phoenix":
        g.push('<ellipse cx="' + bx + '" cy="' + by + '" rx="9" ry="11" fill="' + p.metal + '" stroke="' + p.dark + '" stroke-width="1.2"/>');
        g.push('<path d="M' + (bx - 8) + ' ' + (by - 4) + ' q-14 -12 -18 -2 q10 6 18 8 Z" fill="' + p.gem + '" stroke="' + p.dark + '" stroke-width="1"/>');
        g.push('<path d="M' + (bx + 8) + ' ' + (by - 4) + ' q14 -12 18 -2 q-10 6 -18 8 Z" fill="' + p.gem + '" stroke="' + p.dark + '" stroke-width="1"/>');
        g.push('<path d="M' + bx + ' ' + (by - 13) + ' l3 -8 l3 8 Z" fill="' + p.gem + '"/>');
        break;
      case "wyrmling":
        g.push('<ellipse cx="' + bx + '" cy="' + by + '" rx="13" ry="9" fill="' + p.metal + '" stroke="' + p.dark + '" stroke-width="1.2"/>');
        g.push('<circle cx="' + (bx + 11) + '" cy="' + (by - 5) + '" r="6" fill="' + p.metal + '" stroke="' + p.dark + '" stroke-width="1.1"/>');
        g.push('<path d="M' + (bx - 4) + ' ' + (by - 9) + ' q-10 -14 -18 -8 q6 12 18 12 Z" fill="' + p.gem + '" stroke="' + p.dark + '" stroke-width="1"/>');
        g.push('<path d="M' + (bx - 13) + ' ' + by + ' q-10 4 -12 10" stroke="' + p.dark + '" stroke-width="2.2" fill="none"/>');
        break;
      case "mouse":
        g.push('<ellipse cx="' + bx + '" cy="' + (by + 3) + '" rx="9" ry="7" fill="' + p.metal + '" stroke="' + p.dark + '" stroke-width="1.1"/>');
        g.push('<circle cx="' + (bx + 8) + '" cy="' + (by - 1) + '" r="4.5" fill="' + p.metal + '" stroke="' + p.dark + '" stroke-width="1"/>');
        g.push('<circle cx="' + (bx + 5) + '" cy="' + (by - 6) + '" r="3" fill="' + p.gem + '" stroke="' + p.dark + '" stroke-width="0.8"/>');
        g.push('<path d="M' + (bx - 9) + ' ' + (by + 4) + ' q-9 2 -11 8" stroke="' + p.dark + '" stroke-width="1.6" fill="none"/>');
        break;
      case "cat":
        g.push('<ellipse cx="' + bx + '" cy="' + (by + 2) + '" rx="11" ry="8" fill="' + p.metal + '" stroke="' + p.dark + '" stroke-width="1.1"/>');
        g.push('<circle cx="' + (bx + 9) + '" cy="' + (by - 4) + '" r="5.5" fill="' + p.metal + '" stroke="' + p.dark + '" stroke-width="1"/>');
        g.push('<path d="M' + (bx + 5) + ' ' + (by - 9) + ' l1 -5 l4 3 Z M' + (bx + 13) + ' ' + (by - 9) + ' l-1 -5 l-4 3 Z" fill="' + p.dark + '"/>');
        g.push('<path d="M' + (bx - 11) + ' ' + (by + 1) + ' q-10 -6 -8 -14" stroke="' + p.dark + '" stroke-width="2" fill="none"/>');
        break;
      case "hound":
        g.push('<ellipse cx="' + bx + '" cy="' + (by + 2) + '" rx="12" ry="8" fill="' + p.metal + '" stroke="' + p.dark + '" stroke-width="1.1"/>');
        g.push('<circle cx="' + (bx + 10) + '" cy="' + (by - 4) + '" r="6" fill="' + p.metal + '" stroke="' + p.dark + '" stroke-width="1"/>');
        g.push('<path d="M' + (bx + 6) + ' ' + (by - 9) + ' q-4 8 2 9" fill="' + p.dark + '" opacity=".8"/>');
        g.push('<rect x="' + (bx - 8) + '" y="' + (by + 8) + '" width="4" height="8" rx="2" fill="' + p.dark + '"/>');
        g.push('<rect x="' + (bx + 4) + '" y="' + (by + 8) + '" width="4" height="8" rx="2" fill="' + p.dark + '"/>');
        break;
      case "turtle":
        g.push('<ellipse cx="' + bx + '" cy="' + (by + 2) + '" rx="13" ry="9" fill="' + p.metal + '" stroke="' + p.dark + '" stroke-width="1.3"/>');
        g.push('<path d="M' + (bx - 6) + ' ' + (by - 2) + ' l6 -4 l6 4 l-3 6 l-6 0 Z" fill="' + p.gem + '" stroke="' + p.dark + '" stroke-width="0.8"/>');
        g.push('<circle cx="' + (bx + 13) + '" cy="' + (by + 3) + '" r="4" fill="' + p.metal + '" stroke="' + p.dark + '" stroke-width="1"/>');
        break;
      case "bird":
        g.push('<ellipse cx="' + bx + '" cy="' + by + '" rx="8" ry="10" fill="' + p.metal + '" stroke="' + p.dark + '" stroke-width="1.1"/>');
        g.push('<circle cx="' + (bx + 2) + '" cy="' + (by - 10) + '" r="5" fill="' + p.metal + '" stroke="' + p.dark + '" stroke-width="1"/>');
        g.push('<path d="M' + (bx + 7) + ' ' + (by - 10) + ' l6 2 l-6 2 Z" fill="' + p.gem + '"/>');
        g.push('<path d="M' + (bx - 7) + ' ' + (by - 2) + ' q-12 4 -14 12 q10 -2 15 -6 Z" fill="' + p.gem + '" stroke="' + p.dark + '" stroke-width="0.9"/>');
        break;
      case "scorpion":
        g.push('<ellipse cx="' + bx + '" cy="' + (by + 3) + '" rx="10" ry="6" fill="' + p.metal + '" stroke="' + p.dark + '" stroke-width="1.1"/>');
        g.push('<path d="M' + (bx + 9) + ' ' + (by + 1) + ' q10 -4 9 -12 q-2 -5 -6 -2" stroke="' + p.dark + '" stroke-width="2.2" fill="none"/>');
        g.push('<path d="M' + (bx - 9) + ' ' + (by + 1) + ' l-7 -4 M' + (bx - 9) + ' ' + (by + 5) + ' l-7 4" stroke="' + p.dark + '" stroke-width="1.8"/>');
        break;
      case "wisp":
        g.push('<circle cx="' + bx + '" cy="' + by + '" r="8" fill="' + p.gem + '" opacity=".9"/>');
        g.push('<circle cx="' + bx + '" cy="' + by + '" r="4" fill="#fff" opacity=".85"/>');
        g.push('<circle cx="' + (bx - 11) + '" cy="' + (by - 7) + '" r="2.2" fill="' + p.gem + '" opacity=".7"/>');
        g.push('<circle cx="' + (bx + 11) + '" cy="' + (by + 5) + '" r="1.8" fill="' + p.gem + '" opacity=".6"/>');
        break;
      default: /* critter */
        g.push('<ellipse cx="' + bx + '" cy="' + (by + 2) + '" rx="11" ry="8" fill="' + p.metal + '" stroke="' + p.dark + '" stroke-width="1.1"/>');
        g.push('<circle cx="' + (bx + 9) + '" cy="' + (by - 4) + '" r="5.5" fill="' + p.metal + '" stroke="' + p.dark + '" stroke-width="1"/>');
        g.push('<circle cx="' + (bx + 11) + '" cy="' + (by - 5) + '" r="1.3" fill="' + p.dark + '"/>');
        g.push('<path d="M' + (bx - 11) + ' ' + (by + 1) + ' q-11 -4 -10 -11" stroke="' + p.metal + '" stroke-width="3" fill="none"/>');
        if (p.trim >= 2) g.push(gemStud(bx, by + 2, 2, p));
    }
    return '<g class="fh-item fh-pet" data-form="' + form + '" data-rarity="' + esc(item.rarity) + '">' +
           f + '<g' + fx + '>' + g.join("") + '</g></g>';
  }

  /* ---------- NON-EQUIPPABLE ITEM THUMBNAILS ------------------
   * Utility loot is real game content too. It does not belong on the hero's
   * body, but native emoji was still its only visual representation. These
   * small, self-contained SVG thumbnails cover every active none/accessory,
   * relic, charm, key, reagent, boost, and mystery-box entry. Like equipped
   * models, they are render-only and deterministic; nothing is persisted. */

  var CONTENT_FORMS = [
    [/mystery box/i,                              "chest"],
    [/copper coin/i,                              "coin"],
    [/hourglass/i,                                "hourglass"],
    [/lantern/i,                                  "lantern"],
    [/compass/i,                                  "compass"],
    [/journal|scroll/i,                           "scroll"],
    [/candle/i,                                   "candle"],
    [/golden apple/i,                             "apple"],
    [/worldseed/i,                                "seed"],
    [/rose petal/i,                               "flower"],
    [/spindleroot/i,                              "root"],
    [/calming herb|glowmoss/i,                    "herb"],
    [/mana potion|focus tonic|energy draught|frost vial/i, "bottle"],
    [/calm tea|hearty mead/i,                     "cup"],
    [/seer'?s orb/i,                              "orb"],
    [/targeter'?s ring/i,                         "ring"],
    [/amulet of drive/i,                          "amulet"],
    [/key of worlds|\bkey\b/i,                   "key"],
    [/lost throne shard/i,                        "throne"],
    [/cosmic fragment/i,                          "fragment"],
    [/timekeeper'?s spark|stardust/i,             "spark"],
    [/focus stone/i,                              "stone"],
    [/festival charm/i,                           "festival"],
    [/hamsa/i,                                    "hamsa"],
    [/reliquary/i,                                "reliquary"],
    [/luck prism|deep work catalyst/i,            "crystal"],
    [/steady focus boost/i,                       "focus"],
    [/(?:greater )?xp boost/i,                    "bolt"],
    [/owl'?s eye|dragon eye|evil eye|newt eye|eye of the universe/i, "eye"],
    [/hunter'?s horn|unicorn horn/i,              "horn"],
    [/moonlit chalice/i,                          "chalice"],
    [/void anchor/i,                              "anchor"],
    [/charted star|star mark/i,                   "star"],
    [/phoenix heart|dragon heart/i,               "heart"],
    [/four-leaf clover/i,                         "clover"],
    [/rabbit'?s foot/i,                           "paw"],
    [/horseshoe/i,                                "horseshoe"],
    [/dreamcatcher/i,                             "dreamcatcher"],
    [/focus bead/i,                               "bead"],
    [/phoenix egg/i,                              "egg"],
    [/hawk feather/i,                             "feather"],
    [/wolf fang/i,                                "fang"],
    [/drake scale/i,                              "scale"],
    [/orc blood/i,                                "drop"],
    [/void essence/i,                             "essence"]
  ];

  function normalizeContentItem(kind, item) {
    if (Array.isArray(item)) {
      var rowName = text(item[1], "item");
      return {
        id:rowName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""),
        name:rowName,
        rarity:text(item[2], "common").toLowerCase(),
        kind:text(kind || item[4], "content").toLowerCase()
      };
    }
    item = item && typeof item === "object" ? item : {};
    var normalized = normalizeItem(item);
    return {
      id:normalized.id,
      name:normalized.name,
      rarity:normalized.rarity,
      kind:text(kind || item.worldCatalog || item.slot || item.category, "content").toLowerCase()
    };
  }

  function contentDescriptor(kind, item) {
    var normalized = normalizeContentItem(kind, item);
    var matched = formMatch(normalized.name, CONTENT_FORMS, "token");
    return {
      kind:normalized.kind,
      id:normalized.id,
      name:normalized.name,
      rarity:normalized.rarity,
      supported:true,
      explicit:matched.explicit,
      form:matched.form,
      wearable:false,
      resolution:matched.explicit ? "name" : "fallback"
    };
  }

  function auditContentCatalog(rows) {
    var report = { total:0, supported:0, explicit:0, gaps:[] };
    (Array.isArray(rows) ? rows : []).forEach(function (entry) {
      var kind = "", item = entry;
      if (entry && typeof entry === "object" && !Array.isArray(entry) && own(entry, "item")) {
        kind = entry.kind || "";
        item = entry.item;
      } else if (Array.isArray(entry)) {
        kind = entry[4] || "";
      } else if (entry && typeof entry === "object") {
        kind = entry.worldCatalog || entry.slot || entry.category || "";
      }
      var descriptor = contentDescriptor(kind, item);
      report.total++;
      if (descriptor.supported) report.supported++;
      if (descriptor.explicit) report.explicit++;
      else report.gaps.push(descriptor);
    });
    return report;
  }

  function own(value, key) {
    return !!value && Object.prototype.hasOwnProperty.call(value, key);
  }

  function contentThumbnail(kind, item) {
    var normalized = normalizeContentItem(kind, item);
    var descriptor = contentDescriptor(kind, normalized);
    if (!descriptor.explicit) return "";
    var p = itemPalette(normalized), h = hash(normalized.id || normalized.name);
    var a = shiftHue(p.metal, ((h >>> 3) % 31) - 15);
    var b = shiftHue(p.gem, ((h >>> 8) % 25) - 12);
    var d = p.dark, g = [];
    function line(path, width) { return '<path d="' + path + '" fill="none" stroke="' + d + '" stroke-width="' + (width || 3) + '" stroke-linecap="round" stroke-linejoin="round"/>'; }
    switch (descriptor.form) {
      case "chest": g.push('<path d="M12 27 q2 -16 20 -16 q18 0 20 16 Z" fill="' + a + '" stroke="' + d + '" stroke-width="3"/><rect x="10" y="27" width="44" height="27" rx="4" fill="' + a + '" stroke="' + d + '" stroke-width="3"/><path d="M10 35 h44 M20 27 v27 M44 27 v27" stroke="' + b + '" stroke-width="3"/><rect x="27" y="32" width="10" height="13" rx="2" fill="' + b + '" stroke="' + d + '" stroke-width="2"/>'); break;
      case "coin": g.push('<circle cx="32" cy="32" r="17" fill="' + a + '" stroke="' + d + '" stroke-width="3"/><circle cx="32" cy="32" r="10" fill="none" stroke="' + b + '" stroke-width="2"/><path d="M32 23 v18 M27 27 h8 q4 0 4 4 q0 4 -4 4 h-7 q-4 0 -4 4 q0 3 4 3 h9" fill="none" stroke="' + d + '" stroke-width="2"/>'); break;
      case "scroll": g.push('<path d="M18 13 q-6 4 0 9 v29 q6 -4 12 0 h20 V17 q-7 -5 -13 0 q-7 -5 -19 -4 Z" fill="' + a + '" stroke="' + d + '" stroke-width="3"/>' + line("M25 27 h18 M25 34 h15 M25 41 h12",2)); break;
      case "candle": g.push('<path d="M32 8 q10 10 0 18 q-10 -8 0 -18 Z" fill="' + b + '" stroke="' + d + '" stroke-width="2"/><rect x="23" y="24" width="18" height="29" rx="4" fill="' + a + '" stroke="' + d + '" stroke-width="3"/><path d="M24 34 q5 5 10 0 q4 -4 7 0" fill="none" stroke="' + b + '" stroke-width="3"/>'); break;
      case "herb": g.push(line("M31 52 Q31 29 32 14",3) + '<path d="M31 34 q-16 -16 -18 -1 q8 9 18 7 M32 26 q15 -16 18 -1 q-8 9 -18 7 M31 43 q-13 -11 -16 1 q7 8 16 5" fill="' + a + '" stroke="' + d + '" stroke-width="2"/>'); break;
      case "apple": g.push('<path d="M32 21 q17 -8 20 9 q2 20 -20 25 q-22 -5 -20 -25 q3 -17 20 -9 Z" fill="' + a + '" stroke="' + d + '" stroke-width="3"/>' + line("M32 22 q-2 -10 5 -15",3) + '<path d="M37 11 q9 -4 12 3 q-8 5 -12 -3 Z" fill="' + b + '" stroke="' + d + '" stroke-width="2"/>'); break;
      case "bottle": g.push('<path d="M26 9 h12 v12 l8 11 q8 17 -7 22 H25 q-15 -5 -7 -22 l8 -11 Z" fill="' + a + '" stroke="' + d + '" stroke-width="3"/><path d="M19 39 q13 -7 26 0 v8 q-13 9 -26 0 Z" fill="' + b + '" opacity=".85"/><rect x="24" y="7" width="16" height="6" rx="2" fill="' + d + '"/>'); break;
      case "cup": g.push('<path d="M16 21 h31 l-4 27 q-11 9 -23 0 Z" fill="' + a + '" stroke="' + d + '" stroke-width="3"/><path d="M47 27 q13 -2 10 11 q-2 8 -12 5" fill="none" stroke="' + d + '" stroke-width="4"/>' + line("M24 15 q-4 -5 0 -9 M33 15 q-4 -5 0 -9 M42 15 q-4 -5 0 -9",2)); break;
      case "orb": g.push('<circle cx="32" cy="29" r="18" fill="' + b + '" stroke="' + d + '" stroke-width="3"/><circle cx="26" cy="23" r="5" fill="#fff" opacity=".7"/><path d="M17 53 q15 -12 30 0 Z" fill="' + a + '" stroke="' + d + '" stroke-width="3"/>'); break;
      case "ring": g.push('<circle cx="32" cy="37" r="15" fill="none" stroke="' + a + '" stroke-width="7"/><path d="M24 21 l8 -12 l8 12 l-8 8 Z" fill="' + b + '" stroke="' + d + '" stroke-width="2"/>'); break;
      case "amulet": g.push(line("M14 13 q18 34 36 0",3) + '<path d="M32 27 l12 12 l-12 16 l-12 -16 Z" fill="' + b + '" stroke="' + d + '" stroke-width="3"/><circle cx="32" cy="40" r="4" fill="' + a + '"/>'); break;
      case "key": g.push('<circle cx="21" cy="22" r="10" fill="none" stroke="' + a + '" stroke-width="6"/>' + line("M28 29 l24 24 M42 43 l7 -7 M47 48 l7 -7",5)); break;
      case "fragment": g.push('<path d="M31 7 l17 17 l-8 31 l-20 -5 l-7 -24 Z" fill="' + a + '" stroke="' + d + '" stroke-width="3"/><path d="M31 7 l1 38 l16 -21 M13 26 l19 19" fill="none" stroke="' + b + '" stroke-width="2"/>'); break;
      case "spark": g.push('<path d="M32 5 l6 19 l18 -7 l-11 16 l14 10 l-20 -1 l-2 18 l-8 -17 l-18 8 l10 -17 l-15 -9 l20 1 Z" fill="' + b + '" stroke="' + d + '" stroke-width="2"/>'); break;
      case "stone": g.push('<path d="M15 47 l5 -28 l18 -10 l14 17 l-4 25 l-21 6 Z" fill="' + a + '" stroke="' + d + '" stroke-width="3"/><path d="M20 19 l17 12 l15 -5 M37 31 l-10 26" fill="none" stroke="' + b + '" stroke-width="2"/>'); break;
      case "compass": g.push('<circle cx="32" cy="32" r="23" fill="' + a + '" stroke="' + d + '" stroke-width="3"/><circle cx="32" cy="32" r="16" fill="none" stroke="' + b + '" stroke-width="2"/><path d="M38 17 l-3 18 l-9 12 l3 -18 Z" fill="' + b + '" stroke="' + d + '" stroke-width="2"/>'); break;
      case "festival": g.push('<circle cx="32" cy="32" r="17" fill="none" stroke="' + a + '" stroke-width="5"/>' + line("M32 5 v12 M32 47 v12 M5 32 h12 M47 32 h12 M13 13 l9 9 M42 42 l9 9 M51 13 l-9 9 M22 42 l-9 9",2)); break;
      case "hamsa": g.push('<path d="M20 54 q-8 -9 -4 -22 l3 -14 q2 -5 6 0 v11 l1 -19 q1 -6 6 0 v18 l2 -19 q2 -5 6 0 v20 l3 -15 q2 -5 6 0 l-1 23 q-2 15 -14 20 Z" fill="' + a + '" stroke="' + d + '" stroke-width="3"/><path d="M25 37 q7 -10 14 0 q-7 10 -14 0 Z" fill="' + b + '" stroke="' + d + '" stroke-width="2"/>'); break;
      case "reliquary": g.push('<path d="M18 22 h28 v31 H18 Z" fill="' + a + '" stroke="' + d + '" stroke-width="3"/><path d="M15 22 l8 -11 h18 l8 11 Z" fill="' + b + '" stroke="' + d + '" stroke-width="3"/><circle cx="32" cy="36" r="7" fill="' + b + '" stroke="' + d + '" stroke-width="2"/>'); break;
      case "crystal": g.push('<path d="M32 6 l18 17 l-8 31 H22 l-8 -31 Z" fill="' + b + '" stroke="' + d + '" stroke-width="3"/><path d="M14 23 h36 M32 6 L22 54 M32 6 l10 48" fill="none" stroke="#fff" stroke-width="1.5" opacity=".65"/>'); break;
      case "focus": g.push('<circle cx="32" cy="32" r="22" fill="none" stroke="' + a + '" stroke-width="5"/><circle cx="32" cy="32" r="11" fill="none" stroke="' + b + '" stroke-width="4"/><circle cx="32" cy="32" r="4" fill="' + d + '"/>'); break;
      case "bolt": g.push('<path d="M37 5 L15 36 h14 l-3 23 l23 -34 H35 Z" fill="' + b + '" stroke="' + d + '" stroke-width="3"/>'); break;
      case "lantern": g.push('<path d="M22 18 q10 -15 20 0" fill="none" stroke="' + d + '" stroke-width="3"/><rect x="18" y="18" width="28" height="34" rx="5" fill="' + a + '" stroke="' + d + '" stroke-width="3"/><path d="M24 25 h16 v20 H24 Z" fill="' + b + '" opacity=".9"/><path d="M17 18 h30 M17 52 h30" stroke="' + d + '" stroke-width="3"/>'); break;
      case "hourglass": g.push('<path d="M18 10 h28 M18 54 h28 M21 12 q0 14 11 20 q-11 6 -11 20 M43 12 q0 14 -11 20 q11 6 11 20" fill="none" stroke="' + d + '" stroke-width="4"/><path d="M25 19 h14 l-7 10 Z M25 47 h14 l-7 -10 Z" fill="' + b + '"/>'); break;
      case "seed": g.push('<path d="M32 54 V28" stroke="' + d + '" stroke-width="3"/><path d="M32 34 q-17 -16 -20 0 q10 9 20 5 M32 28 q16 -17 20 -1 q-9 9 -20 7" fill="' + a + '" stroke="' + d + '" stroke-width="2"/><ellipse cx="32" cy="53" rx="10" ry="6" fill="' + b + '" stroke="' + d + '" stroke-width="2"/>'); break;
      case "flower": g.push('<circle cx="32" cy="27" r="6" fill="' + b + '"/>' + [0,72,144,216,288].map(function (deg) { var rad=deg*Math.PI/180,x=(32+Math.cos(rad)*11).toFixed(2),y=(27+Math.sin(rad)*11).toFixed(2); return '<ellipse cx="'+x+'" cy="'+y+'" rx="6" ry="9" fill="'+a+'" transform="rotate('+(deg+90)+' '+x+' '+y+')" stroke="'+d+'" stroke-width="1.5"/>'; }).join("") + line("M32 38 v19 M32 45 q-10 -8 -14 1",3)); break;
      case "root": g.push('<path d="M21 14 q11 -8 22 0 l-4 22 q-7 16 -7 23 q-2 -13 -8 -21 Z" fill="' + a + '" stroke="' + d + '" stroke-width="3"/>' + line("M27 37 l-10 15 M35 37 l10 15 M31 42 l-2 14",3)); break;
      case "eye": g.push('<path d="M8 32 q24 -25 48 0 q-24 25 -48 0 Z" fill="' + a + '" stroke="' + d + '" stroke-width="3"/><circle cx="32" cy="32" r="10" fill="' + b + '" stroke="' + d + '" stroke-width="2"/><circle cx="32" cy="32" r="4" fill="' + d + '"/>'); break;
      case "horn": g.push('<path d="M14 47 q27 7 38 -31 q-15 15 -31 11 q6 13 -7 20 Z" fill="' + a + '" stroke="' + d + '" stroke-width="3"/><circle cx="14" cy="47" r="7" fill="' + b + '" stroke="' + d + '" stroke-width="2"/>'); break;
      case "chalice": g.push('<path d="M16 12 h32 q-2 20 -16 24 q-14 -4 -16 -24 Z" fill="' + a + '" stroke="' + d + '" stroke-width="3"/><path d="M32 36 v13 M20 54 h24" stroke="' + d + '" stroke-width="4"/><path d="M20 20 h24" stroke="' + b + '" stroke-width="4"/>'); break;
      case "anchor": g.push('<path d="M32 10 v36 M21 18 h22" stroke="' + d + '" stroke-width="5"/><circle cx="32" cy="10" r="6" fill="none" stroke="' + a + '" stroke-width="4"/><path d="M13 36 q3 20 19 20 q16 0 19 -20 l-8 6 M13 36 l8 6" fill="none" stroke="' + a + '" stroke-width="5"/>'); break;
      case "star": g.push('<path d="M32 5 l7 18 l20 1 l-15 13 l5 20 l-17 -11 l-17 11 l5 -20 l-15 -13 l20 -1 Z" fill="' + b + '" stroke="' + d + '" stroke-width="2.5"/>'); break;
      case "heart": g.push('<path d="M32 55 C4 38 9 14 22 13 q8 0 10 8 q2 -8 10 -8 c13 1 18 25 -10 42 Z" fill="' + a + '" stroke="' + d + '" stroke-width="3"/><path d="M32 47 q-4 -14 7 -24" fill="none" stroke="' + b + '" stroke-width="3"/>'); break;
      case "throne": g.push('<path d="M17 11 h30 v23 l-5 20 H22 l-5 -20 Z" fill="' + a + '" stroke="' + d + '" stroke-width="3"/><path d="M23 11 l9 10 l9 -10 M18 37 h28 M22 54 l-5 5 M42 54 l5 5" fill="none" stroke="' + b + '" stroke-width="3"/>'); break;
      case "clover": g.push('<circle cx="25" cy="25" r="10" fill="' + a + '" stroke="' + d + '" stroke-width="2"/><circle cx="39" cy="25" r="10" fill="' + a + '" stroke="' + d + '" stroke-width="2"/><circle cx="25" cy="39" r="10" fill="' + a + '" stroke="' + d + '" stroke-width="2"/><circle cx="39" cy="39" r="10" fill="' + a + '" stroke="' + d + '" stroke-width="2"/>' + line("M32 42 q-2 10 -10 16",3)); break;
      case "paw": g.push('<ellipse cx="32" cy="39" rx="15" ry="13" fill="' + a + '" stroke="' + d + '" stroke-width="3"/>' + [[17,22],[27,16],[38,16],[48,23]].map(function(q){return '<circle cx="'+q[0]+'" cy="'+q[1]+'" r="6" fill="'+b+'" stroke="'+d+'" stroke-width="2"/>';}).join("")); break;
      case "horseshoe": g.push('<path d="M17 12 v24 q0 18 15 18 q15 0 15 -18 V12 h-9 v24 q0 9 -6 9 q-6 0 -6 -9 V12 Z" fill="' + a + '" stroke="' + d + '" stroke-width="3"/><circle cx="21" cy="21" r="2" fill="' + b + '"/><circle cx="43" cy="21" r="2" fill="' + b + '"/>'); break;
      case "dreamcatcher": g.push('<circle cx="32" cy="27" r="18" fill="none" stroke="' + a + '" stroke-width="4"/>' + line("M17 21 l30 12 M17 33 l30 -12 M24 12 l16 30 M40 12 l-16 30 M23 44 l-5 14 M32 45 v14 M41 44 l5 14",2)); break;
      case "bead": g.push('<circle cx="32" cy="32" r="21" fill="none" stroke="' + d + '" stroke-width="2"/>' + [0,45,90,135,180,225,270,315].map(function(deg){var r=deg*Math.PI/180;return '<circle cx="'+(32+Math.cos(r)*20).toFixed(2)+'" cy="'+(32+Math.sin(r)*20).toFixed(2)+'" r="5" fill="'+(deg%90?b:a)+'" stroke="'+d+'" stroke-width="1.5"/>';}).join("") + '<path d="M32 48 l6 12 h-12 Z" fill="' + b + '"/>'); break;
      case "egg": g.push('<path d="M32 7 q17 15 17 32 q0 17 -17 17 q-17 0 -17 -17 q0 -17 17 -32 Z" fill="' + a + '" stroke="' + d + '" stroke-width="3"/><path d="M21 34 l8 -7 l7 8 l7 -7" fill="none" stroke="' + b + '" stroke-width="3"/>'); break;
      case "feather": g.push('<path d="M12 53 Q19 13 51 8 Q48 42 12 53 Z" fill="' + a + '" stroke="' + d + '" stroke-width="3"/>' + line("M13 52 L45 15 M24 40 l-8 -2 M31 32 l-8 -5 M38 24 l8 1",2)); break;
      case "fang": g.push('<path d="M20 8 q21 8 24 2 q-2 33 -19 47 q3 -28 -5 -49 Z" fill="' + a + '" stroke="' + d + '" stroke-width="3"/>'); break;
      case "scale": g.push('<path d="M32 7 q20 15 20 32 q-8 17 -20 19 q-12 -2 -20 -19 q0 -17 20 -32 Z" fill="' + a + '" stroke="' + d + '" stroke-width="3"/><path d="M20 27 q12 10 24 0 M17 39 q15 11 30 0" fill="none" stroke="' + b + '" stroke-width="3"/>'); break;
      case "drop": g.push('<path d="M32 6 q19 24 19 35 q0 16 -19 16 q-19 0 -19 -16 q0 -11 19 -35 Z" fill="' + a + '" stroke="' + d + '" stroke-width="3"/><circle cx="25" cy="39" r="5" fill="#fff" opacity=".55"/>'); break;
      case "essence": g.push('<path d="M32 5 q7 13 18 19 q10 17 -3 28 q-15 12 -30 0 q-13 -11 -3 -28 q11 -6 18 -19 Z" fill="' + b + '" stroke="' + d + '" stroke-width="3"/><path d="M22 32 q10 -12 20 0 q-10 12 -20 0 Z" fill="' + a + '"/>'); break;
      default: return "";
    }
    var mark = [];
    var points = [[8,8],[56,8],[8,56],[56,56],[32,4],[4,32],[60,32],[32,60]];
    for (var i = 0; i < points.length; i++) if ((h >>> i) & 1) {
      mark.push('<rect x="' + (points[i][0] - 1.5) + '" y="' + (points[i][1] - 1.5) + '" width="3" height="3" rx=".8" fill="' + b + '"/>');
    }
    return '<svg class="fh-content-thumbnail" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="' + esc(normalized.name) +
      '" data-content-kind="' + esc(normalized.kind) + '" data-content-id="' + esc(normalized.id) + '" data-form="' + descriptor.form +
      '" data-rarity="' + esc(normalized.rarity) + '"><title>' + esc(normalized.name) + '</title><rect x="2" y="2" width="60" height="60" rx="14" fill="' +
      shiftHue(d, -4) + '" opacity=".18"/><g class="fh-content-model">' + g.join("") + '</g><g class="fh-content-identity">' + mark.join("") + '</g></svg>';
  }

  var BY_SLOT = { weapon: weaponSvg, helmet: helmetSvg, armor: armorSvg, mount: mountSvg, pet: petSvg };
  var FORMS_BY_SLOT = {
    weapon:{ table:WEAPON_FORMS, fallback:"sword" },
    helmet:{ table:HELM_FORMS, fallback:"helm" },
    armor:{ table:ARMOR_FORMS, fallback:"vest" },
    mount:{ table:MOUNT_FAMILIES, fallback:"horse" },
    pet:{ table:PET_FORMS, fallback:"critter" }
  };

  /* Public, pure coverage descriptor. Release tests feed the canonical loot
     table through this function so a newly-added real item cannot silently
     inherit an unrelated fallback silhouette. `explicit` is deliberately
     separate from render support: unknown legacy items still render safely,
     while current catalog gaps fail the coverage test. */
  function modelDescriptor(slot, item) {
    var cfg = FORMS_BY_SLOT[String(slot || "")];
    var normalized = normalizeItem(item);
    if (!cfg) return {
      slot:String(slot || ""), id:normalized.id, name:normalized.name,
      rarity:normalized.rarity, supported:false, explicit:false, form:"none"
    };
    var matched = slot === "mount"
      ? resolveMountForm(normalized)
      : formMatch(normalized.name, cfg.table, cfg.fallback);
    return {
      slot:String(slot), id:normalized.id, name:normalized.name,
      rarity:normalized.rarity, supported:true, explicit:matched.explicit,
      form:matched.form, wearable:slot === "helmet" || slot === "armor",
      resolution:matched.resolution || (matched.explicit ? "name" : "fallback"),
      declaredFamily:matched.declaredFamily || ""
    };
  }

  function auditCatalog(rows) {
    var report = { total:0, supported:0, explicit:0, gaps:[] };
    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      var slot, item;
      if (Array.isArray(row)) {
        slot = String(row[4] || "none");
        item = { id:text(row[1], "item").toLowerCase().replace(/[^a-z0-9]+/g, "_"), name:row[1], rarity:row[2] };
      } else {
        row = row && typeof row === "object" ? row : {};
        slot = String(row.slot || row.type || "none");
        item = row;
      }
      if (!FORMS_BY_SLOT[slot]) return;
      report.total++;
      var descriptor = modelDescriptor(slot, item);
      if (descriptor.supported) report.supported++;
      if (descriptor.explicit) report.explicit++;
      else report.gaps.push(descriptor);
    });
    return report;
  }

  function auditMountCatalog(rows) {
    var report = { total:0, supported:0, explicit:0, semantic:0, gaps:[] };
    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      if (!row || typeof row !== "object" || Array.isArray(row)) return;
      report.total++;
      var descriptor = modelDescriptor("mount", row);
      if (descriptor.supported) report.supported++;
      if (descriptor.explicit) report.explicit++;
      if (descriptor.explicit && descriptor.resolution !== "fallback") report.semantic++;
      else report.gaps.push(descriptor);
    });
    return report;
  }

  function itemSvg(slot, item) {
    if (!item) return "";
    var fn = BY_SLOT[slot];
    if (!fn) return "";
    try {
      item = normalizeItem(item);
      return fn(item);
    } catch (e) { return ""; }
  }

  /* Layer order: mount behind, then armor, helmet, weapon, pet. */
  var Z = ["mount", "armor", "helmet", "weapon", "pet"];

  function equippedLayers(equipped) {
    var out = [];
    Z.forEach(function (slot) {
      var it = equipped && equipped[slot];
      if (!it) return;
      out.push(itemSvg(slot, it));
    });
    return out.join("");
  }

  /* Pure adapter for the active 64x64 pixel renderer. The generated models
     were authored on a 216-unit portrait grid, which scales cleanly into the
     existing pixel viewBox. This function only transforms an SVG string; it
     does not inspect player state, touch the DOM, or install a renderer hook.
     Core calls it after FHPixelAvatar.render(spec), keeping initialization
     passive and the integration reversible in one line. */
  function insertInsideGroup(svg, className, content) {
    if (!content) return svg;
    var marker = '<g class="' + className;
    var start = svg.indexOf(marker);
    if (start < 0) return svg;
    var openEnd = svg.indexOf(">", start);
    if (openEnd < 0) return svg;
    var depth = 1;
    var tags = /<g\b[^>]*>|<\/g>/g;
    tags.lastIndex = openEnd + 1;
    var match;
    while ((match = tags.exec(svg))) {
      if (match[0].slice(0, 3) === "<g") depth++;
      else depth--;
      if (depth === 0) return svg.slice(0, match.index) + content + svg.slice(match.index);
    }
    return svg;
  }

  /* Every part of the hero - body, worn gear, weapon, mount and companion -
     is now drawn by the pixel renderer from one shared skeleton. This adapter
     used to paste catalogue item art over the top of that, which is what put
     a sword beside the hero instead of in their hand, a chest stamp that fit
     nobody, and a rider astride an animal too small to reach the ground. It
     is kept as a pass-through so any caller still wired to it keeps working;
     the catalogue itself is unchanged and still supplies inventory art,
     colours, families and tiers. */
  function decoratePixelAvatar(svg) {
    return String(svg || "");
  }


  /* ------------------------------------------------------------------
     FITTING MODELS TO THE BODY

     These models were authored on their own 216-unit portrait grid and were
     previously dropped onto the hero's 64x64 canvas with nothing but a
     uniform scale - no placement at all. The result was a weapon standing
     beside the hero rather than held, a helmet that missed the head, and a
     pet parked wherever its own artwork happened to sit. Nothing tied a
     model to the body it belonged to.

     Rather than hand-place every item in a catalog that keeps growing, this
     measures what was actually drawn (getBBox on the real node) and maps
     that box onto a joint the pixel renderer publishes in data-anchors. An
     item added tomorrow lands correctly without anyone editing a table.

     It must run after the SVG is in the document, because an element that
     has never been laid out has no box to measure.
     ------------------------------------------------------------------ */
  window.FH_MODELS = {
    itemSvg: itemSvg,
    equippedLayers: equippedLayers,
    decoratePixelAvatar: decoratePixelAvatar,
    modelDescriptor: modelDescriptor,
    auditCatalog: auditCatalog,
    mountDescriptor: function (item) { return modelDescriptor("mount", item); },
    auditMountCatalog: auditMountCatalog,
    contentDescriptor: contentDescriptor,
    contentThumbnail: contentThumbnail,
    auditContentCatalog: auditContentCatalog,
    rarityPalette: function (r) { return JSON.parse(JSON.stringify(pal(r))); },
    formOf: {
      weapon: function (n) { return formOf(n, WEAPON_FORMS, "sword"); },
      helmet: function (n) { return formOf(n, HELM_FORMS, "helm"); },
      armor:  function (n) { return formOf(n, ARMOR_FORMS, "vest"); },
      mount:  function (n, family) { return resolveMountForm({ id:n, name:n, family:family || "" }).form; },
      pet:    function (n) { return formOf(n, PET_FORMS, "critter"); }
    },
    /* Preview sheet used by tests and by the Character screen. */
    preview: function (slot, name, rarity) {
      return '<svg viewBox="0 0 216 232" width="108" height="116" xmlns="http://www.w3.org/2000/svg">' +
        itemSvg(slot, { id: name, name: name, rarity: rarity }) + '</svg>';
    }
  };
})();

/* asset content-type refresh — v10.32.0 */
