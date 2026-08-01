/* Focus Hero pixel avatar renderer.
 * Pure presentation: accepts a plain specification and returns deterministic
 * SVG. It never reads or writes application state, storage, or the network.
 */
(function installFocusHeroPixelAvatar(global) {
  "use strict";

  var VERSION = "fh-pixel-avatar-1.2.0";
  var STYLE_ID = "fh-pixel-avatar-styles";
  var DEFAULT_PRESET = "compact_cozy";
  var PRESET_IDS = Object.freeze([
    "compact_cozy", "quest_classic", "arcade_guardian", "vanguard_heavy"
  ]);
  var PRESET_SET = {
    compact_cozy: true,
    quest_classic: true,
    arcade_guardian: true,
    vanguard_heavy: true
  };
  var SCENES = {
    resting: true, travelling: true, fighting: true, hunting: true,
    looting: true, crafting: true, meditating: true, studio: true
  };
  var CLASS_PALETTES = {
    warrior:      ["#A23B3B", "#E16A5B", "#51222A", "#F6CB6E"],
    mage:         ["#5B4FCF", "#9A8CFF", "#29205F", "#A8C0FF"],
    rogue:        ["#2C3E55", "#55718E", "#15202D", "#7DB48C"],
    ranger:       ["#3F6B3A", "#72A35E", "#203B24", "#C2B280"],
    cleric:       ["#D8C994", "#FFF2C7", "#6E6038", "#D4B45C"],
    bard:         ["#C04A7E", "#EE83AF", "#60253F", "#F8C8DC"],
    druid:        ["#5E8B3F", "#93BD68", "#2D4924", "#C8A36A"],
    knight:       ["#465E80", "#8CA4C4", "#202F48", "#E5E7EB"],
    monk:         ["#F97316", "#FDBA74", "#7C2D12", "#FED7AA"],
    alchemist:    ["#14B8A6", "#75E5D7", "#115E59", "#FDE047"],
    sentinel:     ["#0284C7", "#7DD3FC", "#0C4A6E", "#FCD34D"],
    shadowmancer: ["#7C3AED", "#C4B5FD", "#2E1065", "#F472B6"]
  };
  var RACE_SKINS = {
    human: "#D99B73", elf: "#F0D5BC", dwarf: "#D49D71", orc: "#5C8550",
    goblin: "#86A852", beastfolk_cat: "#C49560", beastfolk_wolf: "#7A6D58",
    beastfolk_lizard: "#3F8556", undead: "#9CA0A0", demon: "#7A1F1F",
    fae: "#E5C5F7"
  };
  var TIER_COLORS = {
    common: "#A8A29E", uncommon: "#34D399", rare: "#22D3EE",
    epic: "#C084FC", legendary: "#FBBF24", mythic: "#F472B6"
  };
  var HAIR_SET = {
    short:true, buzz:true, crop:true, wavy:true, curly:true,
    coily:true, afro:true, short_afro:true, full_afro:true, coils:true,
    taper_fade:true, low_fade:true, high_fade:true, waves:true, waves_360:true,
    braids:true, box_braids:true, cornrows:true, twists:true, two_strand_twists:true,
    locs_short:true, short_locs:true, dreadlocks:true, long_locs:true,
    ponytail:true, topknot:true, bantu_knots:true, long_straight:true, long_curly:true,
    mohawk:true, spiked:true, bald:true
  };
  var HAIR_ALIASES = {
    shaved: "buzz",
    long: "long_straight"
  };
  var FACE_SHAPES = {
    oval: true, round: true, square: true, heart: true,
    long: true, angular: true, diamond: true
  };
  var EYE_SHAPES = {
    focused: true, round: true, sharp: true, wide: true, sleepy: true
  };

  var STYLE_TEXT = [
    "svg.fh-pixel-avatar{display:block;width:100%;height:100%;overflow:visible;image-rendering:pixelated;shape-rendering:crispEdges}",
    ".fh-pixel-avatar .fhpx-hero,.fh-pixel-avatar .fhpx-mount,.fh-pixel-avatar .fhpx-pet,.fh-pixel-avatar .fhpx-weapon,.fh-pixel-avatar .fhpx-fx{transform-box:view-box}",
    ".fh-pixel-avatar .fhpx-hero{transform-origin:var(--fhpx-hero-ox,32px) var(--fhpx-hero-oy,51px);animation:fhpx-idle 3.2s steps(2,end) infinite}",
    ".fh-pixel-avatar .fhpx-pet{transform-origin:52px 53px;animation:fhpx-pet 2.8s steps(2,end) infinite}",
    ".fh-pixel-avatar .fhpx-scene-fx{display:none}",
    ".fh-pixel-avatar[data-scene=travelling] .fhpx-travel{display:inline}",
    ".fh-pixel-avatar[data-scene=fighting] .fhpx-fight{display:inline}",
    ".fh-pixel-avatar[data-scene=hunting] .fhpx-hunt{display:inline}",
    ".fh-pixel-avatar[data-scene=looting] .fhpx-loot{display:inline}",
    ".fh-pixel-avatar[data-scene=crafting] .fhpx-craft{display:inline}",
    ".fh-pixel-avatar[data-scene=meditating] .fhpx-meditate{display:inline}",
    ".fh-pixel-avatar[data-scene=travelling] .fhpx-hero,.fh-pixel-avatar[data-scene=travelling] .fhpx-mount{animation:fhpx-travel 1.2s steps(2,end) infinite}",
    ".fh-pixel-avatar[data-scene=fighting] .fhpx-hero{animation:fhpx-lunge 1.4s steps(3,end) infinite}",
    ".fh-pixel-avatar[data-scene=fighting] .fhpx-weapon{transform-origin:var(--fhpx-weapon-ox,45px) var(--fhpx-weapon-oy,35px);animation:fhpx-swing 1.4s steps(3,end) infinite}",
    ".fh-pixel-avatar[data-scene=hunting] .fhpx-hero{animation:fhpx-stalk 2.4s steps(2,end) infinite}",
    ".fh-pixel-avatar[data-scene=looting] .fhpx-hero{animation:fhpx-search 1.8s steps(2,end) infinite}",
    ".fh-pixel-avatar[data-scene=crafting] .fhpx-weapon{transform-origin:var(--fhpx-weapon-ox,45px) var(--fhpx-weapon-oy,35px);animation:fhpx-craft 1.25s steps(3,end) infinite}",
    ".fh-pixel-avatar[data-running=1][data-scene=travelling] .fhpx-hero,.fh-pixel-avatar[data-running=1][data-scene=travelling] .fhpx-mount{animation-duration:.65s}",
    ".fh-pixel-avatar[data-running=1][data-scene=fighting] .fhpx-hero,.fh-pixel-avatar[data-running=1][data-scene=fighting] .fhpx-weapon{animation-duration:.8s}",
    "@keyframes fhpx-idle{0%,100%{transform:translate(0,0)}50%{transform:translate(0,-1px)}}",
    "@keyframes fhpx-pet{0%,100%{transform:translate(0,0)}50%{transform:translate(0,-1px)}}",
    "@keyframes fhpx-travel{0%,100%{transform:translate(0,0)}50%{transform:translate(0,-2px)}}",
    "@keyframes fhpx-lunge{0%,100%{transform:translate(0,0)}45%{transform:translate(3px,0)}65%{transform:translate(1px,0)}}",
    "@keyframes fhpx-swing{0%,100%{transform:rotate(0)}45%{transform:rotate(-18deg)}65%{transform:rotate(10deg)}}",
    "@keyframes fhpx-stalk{0%,100%{transform:translate(0,0)}50%{transform:translate(-1px,1px)}}",
    "@keyframes fhpx-search{0%,100%{transform:translate(0,0)}50%{transform:translate(1px,2px)}}",
    "@keyframes fhpx-craft{0%,100%{transform:rotate(0)}45%{transform:rotate(-22deg)}65%{transform:rotate(12deg)}}",
    "@keyframes fhpx-float{0%,100%{transform:translate(0,0)}50%{transform:translate(0,-2px)}}",
    "@media (prefers-reduced-motion:reduce){.fh-pixel-avatar *{animation:none!important;transition:none!important}}"
  ].join("");

  function safeKey(value, fallback) {
    var out = String(value == null ? "" : value)
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 64);
    return out || fallback;
  }

  function escapeMarkup(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
      return character === "&" ? "&amp;"
        : character === "<" ? "&lt;"
        : character === ">" ? "&gt;"
        : character === "\"" ? "&quot;"
        : "&#39;";
    });
  }

  function safeColor(value, fallback) {
    var color = String(value || "").trim();
    return /^(?:#[0-9a-f]{3}|#[0-9a-f]{6}|#[0-9a-f]{8})$/i.test(color) ? color : fallback;
  }

  function itemId(item) {
    if (!item) return "none";
    if (typeof item === "string") return safeKey(item, "item");
    return safeKey(item.id || item.lootId || item.name, "item");
  }

  function itemTier(item) {
    var tier = safeKey(item && item.tier, "common");
    return TIER_COLORS[tier] ? tier : "common";
  }

  function rect(x, y, width, height, fill, className) {
    var classPart = className ? " class=\"" + escapeMarkup(className) + "\"" : "";
    return "<rect" + classPart + " x=\"" + x + "\" y=\"" + y
      + "\" width=\"" + width + "\" height=\"" + height
      + "\" fill=\"" + safeColor(fill, "#000000") + "\"/>";
  }

  function cloneGeometry(source) {
    var out = {};
    Object.keys(source).forEach(function (key) { out[key] = source[key]; });
    return out;
  }

  var GEOMETRY = {
    compact_cozy: {
      headX: 22, headY: 17, headW: 20, headH: 14,
      torsoX: 22, torsoY: 30, torsoW: 20, torsoH: 14,
      cloakX: 20, cloakY: 29, cloakW: 24, cloakH: 18,
      leftArmX: 16, rightArmX: 42, armY: 31, armW: 6, armH: 11,
      leftLegX: 23, rightLegX: 34, legY: 43, legW: 7, legH: 9,
      leftFootX: 20, rightFootX: 33, footY: 51, footW: 11, footH: 4
    },
    quest_classic: {
      headX: 24, headY: 14, headW: 16, headH: 14,
      torsoX: 23, torsoY: 28, torsoW: 18, torsoH: 17,
      cloakX: 21, cloakY: 28, cloakW: 22, cloakH: 19,
      leftArmX: 18, rightArmX: 41, armY: 30, armW: 5, armH: 14,
      leftLegX: 24, rightLegX: 34, legY: 44, legW: 6, legH: 10,
      leftFootX: 22, rightFootX: 34, footY: 52, footW: 8, footH: 3
    },
    arcade_guardian: {
      headX: 20, headY: 15, headW: 24, headH: 17,
      torsoX: 24, torsoY: 31, torsoW: 16, torsoH: 11,
      cloakX: 22, cloakY: 30, cloakW: 20, cloakH: 14,
      leftArmX: 17, rightArmX: 40, armY: 33, armW: 7, armH: 9,
      leftLegX: 24, rightLegX: 34, legY: 41, legW: 6, legH: 9,
      leftFootX: 19, rightFootX: 33, footY: 48, footW: 12, footH: 7
    },
    vanguard_heavy: {
      headX: 25, headY: 18, headW: 14, headH: 11,
      torsoX: 19, torsoY: 29, torsoW: 26, torsoH: 16,
      cloakX: 17, cloakY: 28, cloakW: 30, cloakH: 19,
      leftArmX: 13, rightArmX: 45, armY: 29, armW: 7, armH: 14,
      leftLegX: 21, rightLegX: 34, legY: 44, legW: 9, legH: 9,
      leftFootX: 18, rightFootX: 33, footY: 51, footW: 13, footH: 4
    }
  };

  function presetId(value) {
    var id = safeKey(value, DEFAULT_PRESET);
    return PRESET_SET[id] ? id : DEFAULT_PRESET;
  }

  function normalizedFaceShape(value) {
    var id = safeKey(value, "oval");
    return FACE_SHAPES[id] ? id : "oval";
  }

  function normalizedEyeShape(value) {
    var id = safeKey(value, "focused");
    return EYE_SHAPES[id] ? id : "focused";
  }

  function normalizedHair(value) {
    var requested = safeKey(value, "short");
    var canonical = HAIR_ALIASES[requested] || requested;
    if (!HAIR_SET[canonical]) {
      requested = "short";
      canonical = "short";
    }
    return { requested: requested, canonical: canonical };
  }

  function geometryFor(style, body, faceShape) {
    var g = cloneGeometry(GEOMETRY[style]);
    var delta = body === "round" ? 3 : (body === "broad" ? 2 : (body === "compact" ? -1 : (body === "lean" ? -2 : 0)));
    g.torsoX -= delta;
    g.torsoW += delta * 2;
    g.cloakX -= delta;
    g.cloakW += delta * 2;
    g.leftArmX -= delta;
    g.rightArmX += delta;
    g.leftLegX -= delta > 0 ? 1 : (delta < 0 ? -1 : 0);
    g.rightLegX += delta > 0 ? 1 : (delta < 0 ? -1 : 0);
    if (faceShape === "round") {
      g.headX -= 1;
      g.headW += 2;
      g.headH -= 1;
    } else if (faceShape === "long") {
      g.headX += 1;
      g.headW -= 2;
      g.headY -= 1;
      g.headH += 2;
    } else if (faceShape === "diamond") {
      g.headX -= 1;
      g.headW += 2;
    }
    g.markX = Math.floor(g.torsoX + g.torsoW / 2) - 4;
    g.markY = g.torsoY + 3;
    g.weaponX = Math.min(52, g.rightArmX + g.armW + 1);
    g.weaponTop = Math.max(12, g.headY + 2);
    g.weaponBottom = Math.min(51, g.armY + g.armH + 5);
    g.heroOriginX = 32;
    g.heroOriginY = g.footY;
    g.weaponOriginX = g.weaponX + 1;
    g.weaponOriginY = g.armY + 6;
    return g;
  }

  function classMark(classKey, g, accent, highlight) {
    var x = g.markX;
    var y = g.markY;
    var art;
    if (classKey === "mage" || classKey === "shadowmancer") {
      art = rect(x + 1, y + 2, 6, 2, accent) + rect(x + 3, y, 2, 7, highlight);
    } else if (classKey === "ranger" || classKey === "druid") {
      art = rect(x + 1, y + 1, 2, 6, accent) + rect(x + 3, y, 4, 2, highlight)
        + rect(x + 3, y + 5, 4, 2, accent);
    } else if (classKey === "rogue") {
      art = rect(x + 1, y + 1, 6, 2, highlight) + rect(x + 3, y + 3, 2, 5, accent);
    } else if (classKey === "alchemist") {
      art = rect(x + 2, y, 4, 2, highlight) + rect(x + 1, y + 2, 6, 6, accent)
        + rect(x + 3, y + 3, 2, 2, "#E0FFFF");
    } else if (classKey === "bard") {
      art = rect(x + 2, y, 4, 8, accent) + rect(x, y + 2, 8, 2, highlight);
    } else if (classKey === "monk") {
      art = rect(x + 1, y + 2, 6, 2, accent) + rect(x + 3, y, 2, 7, highlight);
    } else {
      art = rect(x + 1, y, 6, 6, accent) + rect(x + 3, y + 2, 2, 6, highlight);
    }
    return "<g class=\"fhpx-class-mark\" data-class-mark=\"" + escapeMarkup(classKey) + "\">"
      + art + "</g>";
  }

  function bodyPixels(style, g, outline, armor, armorHigh, armorDark, cloak, skin) {
    var art = "";
    if (style === "compact_cozy") {
      art += rect(g.headX - 3, g.headY + 7, g.headW + 6, 9, outline)
        + rect(g.headX - 1, g.headY + 8, g.headW + 2, 8, cloak);
      art += rect(g.cloakX, g.cloakY, g.cloakW, g.cloakH, outline)
        + rect(g.cloakX + 2, g.cloakY + 1, g.cloakW - 4, g.cloakH - 2, cloak);
      art += rect(g.torsoX - 2, g.torsoY, g.torsoW + 4, g.torsoH, outline)
        + rect(g.torsoX, g.torsoY + 1, g.torsoW, g.torsoH - 2, armor)
        + rect(g.torsoX, g.torsoY + 1, g.torsoW, 3, armorHigh)
        + rect(g.torsoX + 2, g.torsoY + 8, g.torsoW - 4, 2, armorDark);
      art += rect(g.leftArmX, g.armY, g.armW, g.armH, outline)
        + rect(g.leftArmX + 2, g.armY + 1, g.armW - 2, g.armH - 3, armor)
        + rect(g.rightArmX, g.armY, g.armW, g.armH, outline)
        + rect(g.rightArmX, g.armY + 1, g.armW - 2, g.armH - 3, armor)
        + rect(g.leftArmX + 1, g.armY + g.armH - 3, 4, 4, skin)
        + rect(g.rightArmX + 1, g.armY + g.armH - 3, 4, 4, skin);
      art += rect(g.leftLegX, g.legY, g.legW, g.legH, outline)
        + rect(g.leftLegX + 2, g.legY, g.legW - 3, g.legH - 1, armorDark)
        + rect(g.rightLegX, g.legY, g.legW, g.legH, outline)
        + rect(g.rightLegX + 1, g.legY, g.legW - 3, g.legH - 1, armorDark)
        + rect(g.leftFootX, g.footY, g.footW, g.footH, outline)
        + rect(g.leftFootX + 2, g.footY, g.footW - 3, 2, armorHigh)
        + rect(g.rightFootX, g.footY, g.footW, g.footH, outline)
        + rect(g.rightFootX + 1, g.footY, g.footW - 3, 2, armorHigh);
    } else if (style === "quest_classic") {
      art += rect(g.cloakX, g.cloakY, g.cloakW, g.cloakH, outline)
        + rect(g.cloakX + 2, g.cloakY + 1, g.cloakW - 5, g.cloakH - 2, cloak)
        + rect(g.cloakX + g.cloakW - 5, g.cloakY + 5, 4, g.cloakH - 6, armorDark);
      art += rect(g.torsoX - 2, g.torsoY, g.torsoW + 4, g.torsoH, outline)
        + rect(g.torsoX, g.torsoY + 1, g.torsoW, g.torsoH - 2, armor)
        + rect(g.torsoX, g.torsoY + 1, g.torsoW, 3, armorHigh)
        + rect(g.torsoX + 1, g.torsoY + 12, g.torsoW - 2, 3, armorDark)
        + rect(g.torsoX - 3, g.torsoY + 1, 5, 5, armorHigh);
      art += rect(g.leftArmX, g.armY, g.armW, g.armH, outline)
        + rect(g.leftArmX + 2, g.armY + 1, g.armW - 2, g.armH - 3, armor)
        + rect(g.rightArmX, g.armY, g.armW, g.armH, outline)
        + rect(g.rightArmX, g.armY + 1, g.armW - 2, g.armH - 3, armor)
        + rect(g.leftArmX + 1, g.armY + g.armH - 3, 4, 4, skin)
        + rect(g.rightArmX, g.armY + g.armH - 3, 4, 4, skin);
      art += rect(g.leftLegX, g.legY, g.legW, g.legH, outline)
        + rect(g.leftLegX + 2, g.legY, g.legW - 3, g.legH - 2, armorDark)
        + rect(g.rightLegX, g.legY, g.legW, g.legH, outline)
        + rect(g.rightLegX + 1, g.legY, g.legW - 3, g.legH - 2, armorDark)
        + rect(g.leftFootX, g.footY, g.footW, g.footH, outline)
        + rect(g.rightFootX, g.footY, g.footW, g.footH, outline);
    } else if (style === "arcade_guardian") {
      art += rect(g.cloakX, g.cloakY, g.cloakW, g.cloakH, outline)
        + rect(g.cloakX + 2, g.cloakY + 1, g.cloakW - 4, g.cloakH - 2, cloak);
      art += rect(g.torsoX - 2, g.torsoY, g.torsoW + 4, g.torsoH, outline)
        + rect(g.torsoX, g.torsoY + 1, g.torsoW, g.torsoH - 2, armor)
        + rect(g.torsoX + 2, g.torsoY + 1, g.torsoW - 4, 3, armorHigh)
        + rect(g.torsoX + 1, g.torsoY + 8, g.torsoW - 2, 2, armorDark);
      art += rect(g.leftArmX, g.armY, g.armW, g.armH - 2, outline)
        + rect(g.leftArmX + 2, g.armY + 1, g.armW - 3, g.armH - 4, armor)
        + rect(g.rightArmX, g.armY, g.armW, g.armH - 2, outline)
        + rect(g.rightArmX + 1, g.armY + 1, g.armW - 3, g.armH - 4, armor)
        + rect(g.leftArmX - 1, g.armY + 5, 8, 7, outline)
        + rect(g.leftArmX + 1, g.armY + 6, 5, 5, skin)
        + rect(g.rightArmX, g.armY + 5, 8, 7, outline)
        + rect(g.rightArmX + 1, g.armY + 6, 5, 5, skin);
      art += rect(g.leftLegX, g.legY, g.legW, g.legH, outline)
        + rect(g.leftLegX + 2, g.legY, g.legW - 3, g.legH - 1, armorDark)
        + rect(g.rightLegX, g.legY, g.legW, g.legH, outline)
        + rect(g.rightLegX + 1, g.legY, g.legW - 3, g.legH - 1, armorDark)
        + rect(g.leftFootX, g.footY, g.footW, g.footH, outline)
        + rect(g.leftFootX + 2, g.footY + 1, g.footW - 3, 3, armorHigh)
        + rect(g.rightFootX, g.footY, g.footW, g.footH, outline)
        + rect(g.rightFootX + 1, g.footY + 1, g.footW - 3, 3, armorHigh);
    } else {
      art += rect(g.cloakX, g.cloakY, g.cloakW, g.cloakH, outline)
        + rect(g.cloakX + 2, g.cloakY + 1, g.cloakW - 4, g.cloakH - 2, cloak);
      art += rect(g.torsoX - 3, g.torsoY, g.torsoW + 6, 8, outline)
        + rect(g.torsoX - 1, g.torsoY + 1, g.torsoW + 2, 6, armorHigh)
        + rect(g.torsoX - 1, g.torsoY + 6, g.torsoW + 2, g.torsoH - 6, outline)
        + rect(g.torsoX + 1, g.torsoY + 7, g.torsoW - 2, g.torsoH - 8, armor)
        + rect(g.torsoX + 2, g.torsoY + 12, g.torsoW - 4, 3, armorDark);
      art += rect(g.leftArmX, g.armY, g.armW, g.armH, outline)
        + rect(g.leftArmX + 2, g.armY + 2, g.armW - 2, g.armH - 5, armor)
        + rect(g.rightArmX, g.armY, g.armW, g.armH, outline)
        + rect(g.rightArmX, g.armY + 2, g.armW - 2, g.armH - 5, armor)
        + rect(g.leftArmX - 2, g.armY + 8, 9, 6, outline)
        + rect(g.leftArmX, g.armY + 9, 5, 4, skin)
        + rect(g.rightArmX, g.armY + 8, 9, 6, outline)
        + rect(g.rightArmX + 2, g.armY + 9, 5, 4, skin);
      art += rect(g.leftLegX, g.legY, g.legW, g.legH, outline)
        + rect(g.leftLegX + 2, g.legY, g.legW - 3, g.legH - 1, armorDark)
        + rect(g.rightLegX, g.legY, g.legW, g.legH, outline)
        + rect(g.rightLegX + 1, g.legY, g.legW - 3, g.legH - 1, armorDark)
        + rect(g.leftFootX, g.footY, g.footW, g.footH, outline)
        + rect(g.rightFootX, g.footY, g.footW, g.footH, outline);
    }
    return "<g class=\"fhpx-body\" data-silhouette=\"" + style + "\">" + art + "</g>";
  }

  function faceBasePixels(g, faceShape, outline, skin) {
    var x = g.headX;
    var y = g.headY;
    var w = g.headW;
    var h = g.headH;
    if (faceShape === "square") {
      return rect(x, y, w, h, outline) + rect(x + 2, y + 2, w - 4, h - 4, skin);
    }
    if (faceShape === "round") {
      return rect(x + 2, y, w - 4, 2, outline)
        + rect(x, y + 2, w, h - 4, outline)
        + rect(x + 2, y + h - 2, w - 4, 2, outline)
        + rect(x + 3, y + 2, w - 6, h - 4, skin)
        + rect(x + 2, y + 4, w - 4, h - 8, skin);
    }
    if (faceShape === "heart") {
      var half = Math.floor(w / 2);
      return rect(x + 1, y + 1, half - 1, 3, outline)
        + rect(x + half, y + 1, half - 1, 3, outline)
        + rect(x, y + 3, w, h - 6, outline)
        + rect(x + 3, y + h - 3, w - 6, 3, outline)
        + rect(x + 2, y + 3, w - 4, h - 7, skin)
        + rect(x + 4, y + h - 4, w - 8, 2, skin);
    }
    if (faceShape === "angular") {
      return rect(x + 2, y, w - 4, 2, outline)
        + rect(x, y + 2, w, h - 6, outline)
        + rect(x + 2, y + h - 4, w - 4, 2, outline)
        + rect(x + 4, y + h - 2, w - 8, 2, outline)
        + rect(x + 2, y + 2, w - 4, h - 7, skin)
        + rect(x + 4, y + h - 5, w - 8, 3, skin);
    }
    if (faceShape === "diamond") {
      return rect(x + 4, y, w - 8, 2, outline)
        + rect(x + 2, y + 2, w - 4, 3, outline)
        + rect(x, y + 5, w, h - 9, outline)
        + rect(x + 3, y + h - 4, w - 6, 2, outline)
        + rect(x + 5, y + h - 2, w - 10, 2, outline)
        + rect(x + 3, y + 3, w - 6, h - 8, skin);
    }
    return rect(x + 3, y, w - 6, 2, outline)
      + rect(x + 1, y + 2, w - 2, h - 4, outline)
      + rect(x + 3, y + h - 2, w - 6, 2, outline)
      + rect(x + 3, y + 2, w - 6, h - 4, skin)
      + rect(x + 2, y + 4, w - 4, h - 8, skin);
  }

  function eyePixels(g, eyeShape, eye, outline) {
    var y = g.headY + Math.floor(g.headH * 0.48);
    var lx = g.headX + Math.max(4, Math.floor(g.headW * 0.27));
    var rx = g.headX + g.headW - Math.max(6, Math.floor(g.headW * 0.31));
    var art;
    if (eyeShape === "round") {
      art = rect(lx, y - 1, 3, 3, eye) + rect(lx + 1, y, 1, 1, outline)
        + rect(rx, y - 1, 3, 3, eye) + rect(rx + 1, y, 1, 1, outline);
    } else if (eyeShape === "sharp") {
      art = rect(lx - 1, y, 4, 1, eye) + rect(lx + 2, y + 1, 1, 1, outline)
        + rect(rx, y, 4, 1, eye) + rect(rx, y + 1, 1, 1, outline);
    } else if (eyeShape === "wide") {
      art = rect(lx - 1, y - 1, 4, 2, eye) + rect(lx, y, 2, 1, outline)
        + rect(rx, y - 1, 4, 2, eye) + rect(rx + 1, y, 2, 1, outline);
    } else if (eyeShape === "sleepy") {
      art = rect(lx - 1, y + 1, 4, 1, eye) + rect(lx, y, 3, 1, outline)
        + rect(rx, y + 1, 4, 1, eye) + rect(rx + 1, y, 3, 1, outline);
    } else {
      art = rect(lx, y, 2, 2, eye) + rect(rx, y, 2, 2, eye)
        + rect(lx - 1, y - 2, 3, 1, outline) + rect(rx, y - 2, 3, 1, outline);
    }
    return "<g class=\"fhpx-eyes\" data-eye-shape=\"" + eyeShape + "\">" + art + "</g>";
  }

  function expressionPixels(g, faceStyle, outline, armorDark) {
    var cx = Math.floor(g.headX + g.headW / 2);
    var y = g.headY + g.headH - 4;
    if (faceStyle === "scar") {
      return rect(cx + 3, g.headY + 4, 1, 2, "#9A4839")
        + rect(cx + 2, g.headY + 6, 1, 2, "#9A4839")
        + rect(cx + 1, g.headY + 8, 1, 2, "#9A4839");
    }
    if (faceStyle === "warpaint") {
      return rect(g.headX + 3, y - 2, 4, 2, "#B91C1C")
        + rect(g.headX + g.headW - 7, y - 2, 4, 2, "#B91C1C");
    }
    if (faceStyle === "smile") {
      return rect(cx - 4, y - 1, 2, 1, armorDark)
        + rect(cx - 2, y, 4, 1, armorDark)
        + rect(cx + 2, y - 1, 2, 1, armorDark);
    }
    return rect(cx - 2, y, 4, 1, outline);
  }

  function raceFeatures(race, g, skin, hair, accent, outline) {
    var x = g.headX;
    var y = g.headY;
    var w = g.headW;
    var h = g.headH;
    var art = "";
    if (race === "elf" || race === "fae") {
      art += rect(x - 4, y + 5, 5, 3, skin) + rect(x + w - 1, y + 5, 5, 3, skin);
      if (race === "fae") {
        art += rect(g.torsoX - 5, g.torsoY + 1, 3, 9, accent)
          + rect(g.torsoX + g.torsoW + 2, g.torsoY + 1, 3, 9, accent);
      }
    } else if (race === "orc") {
      art += rect(x - 2, y + 5, 4, 3, skin) + rect(x + w - 2, y + 5, 4, 3, skin)
        + rect(x + 3, y + h - 2, 2, 3, "#F3E7C3")
        + rect(x + w - 5, y + h - 2, 2, 3, "#F3E7C3");
    } else if (race === "goblin") {
      art += rect(x - 7, y + 4, 8, 4, skin) + rect(x + w - 1, y + 4, 8, 4, skin);
    } else if (race === "demon") {
      art += rect(x + 1, y - 4, 4, 6, hair) + rect(x + w - 5, y - 4, 4, 6, hair)
        + rect(x, y - 6, 3, 3, accent) + rect(x + w - 3, y - 6, 3, 3, accent);
    } else if (race === "beastfolk_cat" || race === "beastfolk_wolf") {
      art += rect(x + 1, y - 3, 5, 6, skin) + rect(x + w - 6, y - 3, 5, 6, skin)
        + rect(Math.floor(x + w / 2) - 3, y + h - 5, 6, 4, skin)
        + rect(Math.floor(x + w / 2) - 1, y + h - 4, 2, 2, outline);
    } else if (race === "beastfolk_lizard") {
      art += rect(x, y + 1, 3, 10, accent) + rect(x + w - 3, y + 1, 3, 10, accent)
        + rect(Math.floor(x + w / 2) - 3, y + h - 5, 8, 5, skin);
    } else if (race === "undead") {
      art += rect(x + 4, y + 5, 3, 3, "#27313B")
        + rect(x + w - 7, y + 5, 3, 3, "#27313B");
    } else if (race === "dwarf") {
      art += rect(x + 3, y + h - 4, w - 6, 8, hair)
        + rect(Math.floor(x + w / 2) - 2, y + h + 3, 4, 4, hair);
    }
    return "<g class=\"fhpx-race-features\" data-race-art=\"" + race + "\">" + art + "</g>";
  }

  function hairPixels(hairInfo, g, color) {
    var id = hairInfo.canonical;
    var x = g.headX;
    var y = g.headY;
    var w = g.headW;
    var h = g.headH;
    var c = Math.floor(x + w / 2);
    var art = "";
    var i;
    if (id === "short") {
      art = rect(x + 2, y, w - 4, 3, color)
        + rect(x + 1, y + 2, 3, 4, color)
        + rect(x + w - 4, y + 2, 3, 3, color);
    } else if (id === "buzz") {
      art = rect(x + 3, y + 1, w - 6, 1, color)
        + rect(x + 2, y + 2, 2, 2, color)
        + rect(x + w - 4, y + 2, 2, 2, color);
    } else if (id === "crop") {
      art = rect(x + 1, y, w - 2, 3, color)
        + rect(x + 2, y + 3, Math.max(5, Math.floor(w * 0.55)), 2, color)
        + rect(x + w - 3, y + 2, 2, 3, color);
    } else if (id === "wavy") {
      art = rect(x + 1, y + 1, 5, 3, color)
        + rect(c - 4, y - 1, 7, 3, color)
        + rect(c + 2, y, Math.max(4, x + w - c - 3), 3, color)
        + rect(x, y + 3, 3, 4, color);
    } else if (id === "curly") {
      art = rect(x, y, 4, 4, color) + rect(x + 4, y - 2, 4, 4, color)
        + rect(c - 2, y, 4, 4, color) + rect(x + w - 8, y - 2, 4, 4, color)
        + rect(x + w - 4, y, 4, 4, color) + rect(x + 1, y + 4, 3, 4, color);
    } else if (id === "coily") {
      for (i = 0; i < Math.max(4, Math.floor((w - 2) / 3)); i += 1) {
        art += rect(x + 1 + i * 3, y + (i % 2 ? -2 : 0), 2, 2, color);
      }
      art += rect(x, y + 3, 3, 4, color) + rect(x + w - 3, y + 3, 3, 4, color);
    } else if (id === "afro") {
      art = rect(x - 3, y - 4, w + 6, 6, color)
        + rect(x - 5, y, w + 10, 7, color)
        + rect(x - 3, y + 6, 4, 6, color)
        + rect(x + w - 1, y + 6, 4, 6, color);
    } else if (id === "short_afro") {
      art = rect(x - 1, y - 3, w + 2, 4, color)
        + rect(x - 3, y, w + 6, 5, color)
        + rect(x - 1, y + 4, 3, 4, color)
        + rect(x + w - 2, y + 4, 3, 4, color);
    } else if (id === "full_afro") {
      art = rect(x - 4, y - 7, w + 8, 5, color)
        + rect(x - 7, y - 3, w + 14, 8, color)
        + rect(x - 6, y + 4, 6, 8, color)
        + rect(x + w, y + 4, 6, 8, color);
    } else if (id === "coils") {
      for (i = 0; i < Math.max(5, Math.floor(w / 3)); i += 1) {
        art += rect(x + i * 3, y - 3 - (i % 3), 3, 3, color);
      }
      art += rect(x - 2, y + 1, 3, 6, color) + rect(x + w - 1, y + 2, 3, 5, color);
    } else if (id === "taper_fade") {
      art = rect(x + 3, y - 4, w - 6, 6, color)
        + rect(x + 2, y + 1, w - 4, 3, color)
        + rect(x + 1, y + 4, 2, 3, color)
        + rect(x + w - 3, y + 4, 2, 2, color);
    } else if (id === "low_fade") {
      art = rect(x + 2, y - 1, w - 4, 3, color)
        + rect(x + 1, y + 2, 2, 5, color)
        + rect(x + w - 3, y + 2, 2, 5, color)
        + rect(x + 4, y + 3, w - 8, 1, color);
    } else if (id === "high_fade") {
      art = rect(x + 4, y - 5, w - 8, 6, color)
        + rect(x + 2, y, w - 4, 3, color)
        + rect(x + 1, y + 4, 2, 2, color)
        + rect(x + w - 3, y + 4, 2, 2, color);
    } else if (id === "waves") {
      art = rect(x + 2, y, w - 4, 2, color)
        + rect(x + 3, y + 2, Math.max(3, Math.floor((w - 7) / 2)), 1, color)
        + rect(c, y + 3, Math.max(3, x + w - c - 4), 1, color)
        + rect(x + 1, y + 4, 2, 2, color);
    } else if (id === "waves_360") {
      art = rect(x + 1, y, w - 2, 2, color)
        + rect(x + 2, y + 3, 5, 1, color)
        + rect(x + 8, y + 2, 5, 1, color)
        + rect(x + w - 7, y + 4, 5, 1, color)
        + rect(x, y + 5, 2, 2, color);
    } else if (id === "braids") {
      art = rect(x + 1, y, w - 2, 4, color)
        + rect(x - 2, y + 2, 3, h + 7, color)
        + rect(x + w - 1, y + 2, 3, h + 7, color)
        + rect(x - 3, y + h + 7, 5, 2, color)
        + rect(x + w - 2, y + h + 7, 5, 2, color);
    } else if (id === "box_braids") {
      art = rect(x + 1, y, w - 2, 4, color);
      for (i = 0; i < 4; i += 1) {
        art += rect(x - 3 + i * 3, y + 3 + (i % 2), 2, h + 9 - i, color)
          + rect(x + w - 3 + i * 2, y + 4 + ((i + 1) % 2), 2, h + 7 - i, color);
      }
    } else if (id === "cornrows") {
      art = rect(x + 1, y, w - 2, 2, color);
      for (i = 0; i < 4; i += 1) {
        art += rect(x + 2 + i * Math.max(2, Math.floor((w - 5) / 4)), y - 2, 2, 7 + (i % 2), color);
      }
    } else if (id === "twists") {
      art = rect(x + 2, y, w - 4, 3, color);
      for (i = 0; i < 3; i += 1) {
        art += rect(x - 1, y + 3 + i * 5, 3, 3, color)
          + rect(x + w - 2, y + 5 + i * 5, 3, 3, color);
      }
    } else if (id === "two_strand_twists") {
      art = rect(x + 2, y, w - 4, 3, color);
      for (i = 0; i < 4; i += 1) {
        art += rect(x - 2 + (i % 2), y + 3 + i * 4, 2, 3, color)
          + rect(x + w, y + 4 + i * 4, 2, 3, color);
      }
    } else if (id === "locs_short") {
      art = rect(x + 1, y, w - 2, 4, color)
        + rect(x - 1, y + 3, 2, 8, color)
        + rect(x + 3, y + 3, 2, 7, color)
        + rect(x + w - 5, y + 3, 2, 7, color)
        + rect(x + w - 1, y + 3, 2, 8, color);
    } else if (id === "short_locs") {
      art = rect(x + 1, y - 1, w - 2, 4, color)
        + rect(x - 2, y + 3, 2, 10, color)
        + rect(x + 2, y + 2, 2, 8, color)
        + rect(c, y + 3, 2, 11, color)
        + rect(x + w - 4, y + 2, 2, 9, color)
        + rect(x + w, y + 3, 2, 8, color);
    } else if (id === "dreadlocks") {
      art = rect(x + 1, y, w - 2, 4, color)
        + rect(x - 2, y + 2, 3, h + 10, color)
        + rect(x + 3, y + 3, 2, h + 7, color)
        + rect(x + w - 5, y + 3, 2, h + 7, color)
        + rect(x + w - 1, y + 2, 3, h + 10, color);
    } else if (id === "long_locs") {
      art = rect(x, y - 1, w, 5, color);
      for (i = 0; i < 6; i += 1) {
        art += rect(x - 3 + i * 4, y + 3 + (i % 2), 2, h + 13 - (i % 3), color);
      }
      art += rect(x + w - 1, y + 4, 3, h + 12, color);
    } else if (id === "ponytail") {
      art = rect(x + 1, y, w - 2, 4, color)
        + rect(x + w - 1, y + 2, 4, 11, color)
        + rect(x + w + 1, y + 12, 4, 7, color);
    } else if (id === "topknot") {
      art = rect(x + 3, y, w - 6, 3, color)
        + rect(c - 1, y - 3, 2, 4, color)
        + rect(c - 4, y - 6, 8, 4, color);
    } else if (id === "bantu_knots") {
      art = rect(x + 2, y + 1, w - 4, 2, color)
        + rect(x + 2, y - 4, 4, 4, color)
        + rect(c - 2, y - 6, 4, 4, color)
        + rect(x + w - 6, y - 4, 4, 4, color);
    } else if (id === "long_straight") {
      art = rect(x + 1, y, w - 2, 4, color)
        + rect(x - 2, y + 2, 4, h + 10, color)
        + rect(x + w - 2, y + 2, 4, h + 10, color)
        + rect(x + 1, y + h + 8, w - 2, 3, color);
    } else if (id === "long_curly") {
      art = rect(x, y - 2, 5, 5, color) + rect(c - 3, y - 3, 6, 5, color)
        + rect(x + w - 5, y - 2, 5, 5, color);
      for (i = 0; i < 4; i += 1) {
        art += rect(x - 2 + (i % 2), y + 3 + i * 5, 4, 4, color)
          + rect(x + w - 2 - (i % 2), y + 3 + i * 5, 4, 4, color);
      }
    } else if (id === "mohawk") {
      art = rect(c - 2, y - 6, 4, 8, color) + rect(c - 4, y - 2, 8, 4, color);
    } else if (id === "spiked") {
      art = rect(x + 1, y + 1, w - 2, 3, color)
        + rect(x + 2, y - 4, 2, 5, color)
        + rect(c - 1, y - 6, 3, 7, color)
        + rect(x + w - 5, y - 3, 3, 4, color);
    }
    return "<g class=\"fhpx-hair\" data-hair-art=\"" + id + "\">" + art + "</g>";
  }

  function helmetPixels(helmet, g, outline, armor, armorHigh, eye, tierColor) {
    if (!helmet) return "";
    var id = itemId(helmet);
    var x = g.headX - 2;
    var y = g.headY - 2;
    var w = g.headW + 4;
    return "<g class=\"fhpx-slot-helmet\" data-item=\"" + escapeMarkup(id) + "\">"
      + rect(x, y, w, 10, outline)
      + rect(x + 2, y + 1, w - 4, 7, armorHigh)
      + rect(g.headX + 1, y + 7, g.headW - 2, 3, armor)
      + rect(g.headX + 3, y + 8, 3, 1, eye)
      + rect(g.headX + g.headW - 6, y + 8, 3, 1, eye)
      + rect(Math.floor(g.headX + g.headW / 2) - 1, y - 2, 3, 4, tierColor)
      + "</g>";
  }

  function crestPixels(helmet, helmStyle, g, accent) {
    if (helmet || helmStyle !== "crest") return "";
    var c = Math.floor(g.headX + g.headW / 2);
    return rect(c - 2, g.headY - 5, 4, 6, accent)
      + rect(c - 4, g.headY - 2, 8, 2, accent);
  }

  function armorBadgePixels(bodyArmor, g, tierColor) {
    if (!bodyArmor) return "";
    var id = itemId(bodyArmor);
    return "<g class=\"fhpx-slot-armor\" data-item=\"" + escapeMarkup(id) + "\">"
      + rect(g.torsoX - 1, g.torsoY + 3, 2, Math.max(5, g.torsoH - 7), tierColor)
      + rect(g.torsoX + g.torsoW - 1, g.torsoY + 3, 2, Math.max(5, g.torsoH - 7), tierColor)
      + "</g>";
  }

  function mountPixels(mount, outline, accent) {
    if (!mount) return "";
    var family = safeKey(mount.family || mount.type || mount.id, "equine");
    var colors = Array.isArray(mount.colors) ? mount.colors : [];
    var body = safeColor(colors[0], "#6B5640");
    var high = safeColor(colors[1], "#B99062");
    var trim = safeColor(colors[2], accent);
    var pixels = "";
    if (/bird|dragon/.test(family)) {
      pixels += rect(11, 42, 42, 8, outline) + rect(13, 43, 36, 6, body);
      pixels += rect(7, 38, 13, 3, high) + rect(44, 38, 13, 3, high);
      pixels += rect(47, 39, 7, 7, body) + rect(52, 40, 3, 2, trim);
      pixels += rect(17, 50, 4, 7, outline) + rect(43, 50, 4, 7, outline);
    } else if (/elemental|aquatic|skiff|void/.test(family)) {
      pixels += rect(9, 46, 46, 5, outline) + rect(13, 44, 38, 5, body);
      pixels += rect(20, 42, 24, 3, high) + rect(27, 49, 10, 3, trim);
      pixels += rect(15, 53, 4, 2, accent) + rect(45, 53, 4, 2, accent);
    } else {
      pixels += rect(9, 42, 44, 9, outline) + rect(11, 43, 38, 7, body);
      pixels += rect(45, 37, 8, 10, outline) + rect(47, 38, 7, 8, high);
      pixels += rect(51, 39, 4, 2, trim);
      pixels += rect(13, 50, 5, 9, outline) + rect(25, 50, 5, 8, outline);
      pixels += rect(39, 50, 5, 8, outline) + rect(48, 49, 5, 10, outline);
    }
    return "<g class=\"fhpx-mount\" data-mount-family=\"" + escapeMarkup(family)
      + "\">" + pixels + "</g>";
  }

  function weaponPixels(weapon, classKey, g, outline, metal, accent) {
    if (!weapon) return "";
    var identity = itemId(weapon);
    var hint = identity + " " + safeKey(weapon.name, "") + " " + classKey;
    var x = g.weaponX;
    var top = g.weaponTop;
    var bottom = g.weaponBottom;
    var shaftH = Math.max(16, bottom - top);
    var pixels = "";
    if (/staff|wand|orb|mage|druid/.test(hint)) {
      pixels = rect(x, top + 4, 3, shaftH, outline) + rect(x + 1, top + 5, 1, shaftH - 3, "#7A4B2A")
        + rect(x - 2, top, 7, 6, outline) + rect(x, top + 1, 3, 3, accent);
    } else if (/bow|ranger/.test(hint)) {
      pixels = rect(x + 1, top + 2, 2, shaftH, metal) + rect(x - 1, top + 4, 2, 3, accent)
        + rect(x - 1, bottom - 3, 2, 3, accent) + rect(x + 3, top + 5, 1, shaftH - 6, outline);
    } else if (/hammer|mace|pick|axe/.test(hint)) {
      pixels = rect(x, top + 8, 3, shaftH - 4, "#7A4B2A") + rect(x - 4, top + 3, 11, 7, outline)
        + rect(x - 2, top + 5, 7, 3, metal);
    } else if (/dagger|dual|rogue/.test(hint)) {
      pixels = rect(x, top + 11, 3, 14, outline) + rect(x + 1, top + 8, 2, 10, metal)
        + rect(x - 2, top + 17, 8, 2, accent);
    } else if (/flask|alchemist/.test(hint)) {
      pixels = rect(x - 1, top + 11, 6, 11, outline) + rect(x + 1, top + 9, 2, 4, metal)
        + rect(x, top + 15, 4, 5, accent);
    } else {
      pixels = rect(x, top + 4, 3, shaftH, outline) + rect(x + 1, top + 1, 2, shaftH - 3, metal)
        + rect(x - 2, bottom - 7, 9, 3, accent);
    }
    return "<g class=\"fhpx-weapon fhpx-slot-weapon\" data-item=\""
      + escapeMarkup(identity) + "\">" + pixels + "</g>";
  }

  function petPixels(pet, outline, accent) {
    if (!pet) return "";
    var identity = itemId(pet);
    return "<g class=\"fhpx-pet fhpx-slot-pet\" data-item=\"" + escapeMarkup(identity) + "\">"
      + rect(49, 45, 10, 10, outline) + rect(51, 46, 6, 7, accent)
      + rect(50, 43, 3, 4, outline) + rect(55, 43, 3, 4, outline)
      + rect(52, 48, 1, 1, "#FFFFFF") + rect(55, 48, 1, 1, "#FFFFFF")
      + rect(53, 52, 2, 1, outline) + "</g>";
  }

  function scenePixels(outline, accent) {
    return "<g class=\"fhpx-scene-fx fhpx-travel\">"
      + rect(2, 39, 12, 2, accent) + rect(50, 34, 12, 2, accent) + "</g>"
      + "<g class=\"fhpx-scene-fx fhpx-fight fhpx-fx\">"
      + rect(52, 27, 8, 18, outline) + rect(54, 29, 4, 13, "#7F1D1D")
      + rect(49, 25, 2, 2, accent) + rect(47, 28, 2, 2, accent) + "</g>"
      + "<g class=\"fhpx-scene-fx fhpx-hunt\">"
      + rect(52, 42, 8, 5, outline) + rect(54, 40, 4, 3, "#B99062")
      + rect(58, 38, 2, 3, "#B99062") + "</g>"
      + "<g class=\"fhpx-scene-fx fhpx-loot\">"
      + rect(48, 44, 12, 9, outline) + rect(50, 45, 8, 6, "#8B5A2B")
      + rect(53, 46, 2, 3, accent) + "</g>"
      + "<g class=\"fhpx-scene-fx fhpx-craft\">"
      + rect(48, 43, 13, 4, outline) + rect(51, 47, 7, 7, outline)
      + rect(47, 39, 2, 2, accent) + "</g>"
      + "<g class=\"fhpx-scene-fx fhpx-meditate fhpx-fx\">"
      + rect(24, 8, 16, 2, accent) + rect(21, 10, 3, 2, accent)
      + rect(40, 10, 3, 2, accent) + "</g>";
  }

  function render(input) {
    var spec = input && typeof input === "object" ? input : {};
    var traits = spec.traits && typeof spec.traits === "object" ? spec.traits : {};
    var equipped = spec.equipped && typeof spec.equipped === "object" ? spec.equipped : {};
    var classKey = safeKey(spec.cls || spec.classKey || spec.className, "knight");
    var race = safeKey(traits.race || traits.species || spec.race, "human");
    var body = safeKey(traits.body, "balanced");
    if (body !== "compact" && body !== "broad" && body !== "lean" && body !== "round") body = "balanced";
    var hairInfo = normalizedHair(traits.hair || spec.hair);
    var helmStyle = safeKey(traits.helm, "open");
    var faceStyle = safeKey(traits.face, "calm");
    var faceShape = normalizedFaceShape(traits.faceShape || spec.faceShape);
    var eyeShape = normalizedEyeShape(traits.eyeShape || spec.eyeShape);
    var style = presetId(spec.visualStyle || spec.pixelStyle);
    var scene = safeKey(spec.scene, "resting");
    if (!SCENES[scene]) scene = "resting";
    var action = safeKey(spec.action, scene);
    var base = CLASS_PALETTES[classKey] || CLASS_PALETTES.knight;
    var palette = Array.isArray(spec.palette) ? spec.palette : [];
    var colors = spec.colors && typeof spec.colors === "object" ? spec.colors : {};
    var outline = "#08111F";
    var armor = safeColor(colors.armorMid || palette[0], base[0]);
    var armorHigh = safeColor(colors.armorHigh || palette[1], base[1]);
    var armorDark = safeColor(colors.armorDark || palette[2], base[2]);
    var accent = safeColor(colors.accent || palette[3], base[3]);
    var skin = safeColor(colors.skin, RACE_SKINS[race] || RACE_SKINS.human);
    var hair = safeColor(colors.hair, race === "undead" ? "#454952" : "#3D2417");
    var eye = safeColor(colors.eye, race === "demon" ? "#FDE047" : "#7DD3FC");
    var cloak = safeColor(colors.cloak, armorDark);
    var weapon = equipped.weapon || null;
    var helmet = equipped.helmet || null;
    var bodyArmor = equipped.armor || null;
    var pet = equipped.pet || null;
    var mount = spec.mount || equipped.mount || null;
    var weaponId = itemId(weapon);
    var helmetId = itemId(helmet);
    var armorId = itemId(bodyArmor);
    var mountId = itemId(mount);
    var petId = itemId(pet);
    var tier = itemTier(weapon || helmet || bodyArmor || mount || pet);
    var tierColor = TIER_COLORS[tier];
    var g = geometryFor(style, body, faceShape);
    var mountedShift = mount ? -8 : 0;
    var label = escapeMarkup(spec.className || classKey) + " pixel hero";

    var background = rect(0, 0, 64, 64, "#07111F")
      + rect(0, 45, 64, 19, armorDark)
      + rect(5, 8, 2, 2, accent) + rect(56, 13, 1, 1, armorHigh)
      + rect(11, 18, 1, 1, accent) + rect(48, 6, 2, 1, armorHigh)
      + rect(3, 56, 58, 3, outline) + rect(9, 53, 46, 3, "#111827");
    var mountArt = mountPixels(mount, outline, accent);
    var bodyArt = bodyPixels(style, g, outline, armor, armorHigh, armorDark, cloak, skin);
    var classArt = classMark(classKey, g, accent, armorHigh);
    var faceArt = "<g class=\"fhpx-face\" data-face-shape=\"" + faceShape + "\">"
      + faceBasePixels(g, faceShape, outline, skin)
      + eyePixels(g, eyeShape, eye, outline)
      + expressionPixels(g, faceStyle, outline, armorDark)
      + "</g>";
    var raceArt = raceFeatures(race, g, skin, hair, accent, outline);
    var hairArt = hairPixels(hairInfo, g, hair);
    var crestArt = crestPixels(helmet, helmStyle, g, accent);
    var helmetArt = helmetPixels(helmet, g, outline, armor, armorHigh, eye, tierColor);
    var armorBadge = armorBadgePixels(bodyArmor, g, tierColor);
    var hero = "<g class=\"fhpx-hero\" transform=\"translate(0 " + mountedShift + ")\">"
      + bodyArt + classArt + armorBadge + faceArt + raceArt + hairArt + crestArt
      + helmetArt + weaponPixels(
        weapon, classKey, g, outline,
        safeColor(weapon && weapon.metal, armorHigh),
        safeColor(weapon && weapon.gem, accent)
      ) + "</g>";
    var petArt = petPixels(pet, outline, safeColor(pet && pet.gem, tierColor));
    var sceneArt = scenePixels(outline, accent);
    var rootStyle = "image-rendering:pixelated;shape-rendering:crispEdges"
      + ";--fhpx-hero-ox:" + g.heroOriginX + "px;--fhpx-hero-oy:" + g.heroOriginY + "px"
      + ";--fhpx-weapon-ox:" + g.weaponOriginX + "px;--fhpx-weapon-oy:" + g.weaponOriginY + "px";

    return "<svg class=\"fh-pixel-avatar\" data-avatar-version=\"pixel-v1\" data-pixel-style=\""
      + style + "\" data-class=\"" + escapeMarkup(classKey) + "\" data-race=\"" + escapeMarkup(race)
      + "\" data-body=\"" + escapeMarkup(body) + "\" data-hair=\"" + escapeMarkup(hairInfo.requested)
      + "\" data-face-shape=\"" + faceShape + "\" data-eye-shape=\"" + eyeShape
      + "\" data-helm-style=\"" + escapeMarkup(helmStyle) + "\" data-face=\"" + escapeMarkup(faceStyle)
      + "\" data-scene=\"" + escapeMarkup(scene) + "\" data-action=\""
      + escapeMarkup(action) + "\" data-running=\"" + (spec.running ? "1" : "0")
      + "\" data-weapon=\"" + escapeMarkup(weaponId) + "\" data-helmet=\""
      + escapeMarkup(helmetId) + "\" data-armor=\"" + escapeMarkup(armorId)
      + "\" data-mount=\"" + escapeMarkup(mountId) + "\" data-pet=\""
      + escapeMarkup(petId) + "\" data-mounted=\"" + (mount ? "1" : "0")
      + "\" viewBox=\"0 0 64 64\" xmlns=\"http://www.w3.org/2000/svg\" role=\"img\""
      + " focusable=\"false\" aria-label=\"" + label
      + "\" shape-rendering=\"crispEdges\" style=\"" + rootStyle + "\">"
      + "<title>" + escapeMarkup(spec.className || classKey) + " pixel hero</title>"
      + background + sceneArt + mountArt + hero + petArt + "</svg>";
  }

  function installStyles(documentRef) {
    var doc = documentRef || (global && global.document);
    if (!doc || typeof doc.createElement !== "function"
      || typeof doc.getElementById !== "function") return false;
    if (doc.getElementById(STYLE_ID)) return true;
    var target = doc.head || doc.documentElement;
    if (!target || typeof target.appendChild !== "function") return false;
    var style = doc.createElement("style");
    style.id = STYLE_ID;
    style.type = "text/css";
    style.textContent = STYLE_TEXT;
    target.appendChild(style);
    return true;
  }

  var api = Object.freeze({
    version: VERSION,
    styleId: STYLE_ID,
    styles: STYLE_TEXT,
    presetIds: PRESET_IDS,
    defaultPreset: DEFAULT_PRESET,
    render: render,
    installStyles: installStyles
  });

  global.FHPixelAvatar = api;
  installStyles();
})(typeof window !== "undefined" ? window : globalThis);
