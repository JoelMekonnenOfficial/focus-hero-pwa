/* ================================================================
 * Life XP — COSMETIC CLOTHING CATALOG (v13 candidate, 2026-08-17)
 *
 * A passive, source-only catalog for pixel-avatar clothing. The module:
 *   - owns no player state and never touches storage, cloud, recovery or DOM;
 *   - returns immutable descriptors and deterministic 64x64 SVG fragments;
 *   - treats "none" and "default" as explicit, safe no-overlay choices;
 *   - rejects unknown IDs instead of rendering attacker-controlled markup.
 *
 * Future host integration (intentionally NOT performed here):
 *   1. Load this file before pixel-avatar.js.
 *   2. In FHPixelAvatar.render(), after geometry `g` is calculated:
 *        var outfitArt = global.FH_COSMETIC_CLOTHING.renderOverlay(
 *          spec.appearance && spec.appearance.outfit,
 *          { geometry:g }
 *        );
 *      Insert `outfitArt` immediately after `bodyArt` and before
 *      conditioning/class/face pixels inside the existing fhpx-hero group.
 *   3. On a user selection, call planSelection(currentAppearance, id).
 *      Build a new candidate state with plan.appearance, commit that candidate
 *      through the durable transactional save boundary, and update the live UI
 *      only after that commit succeeds. On failure, keep the prior appearance.
 *
 * This file deliberately does not create `appearance.outfit`, choose a default
 * for existing saves, install listeners, or mutate a live avatar.
 * ================================================================ */
(function installFocusHeroCosmeticClothing(global) {
  "use strict";

  if (global.FH_COSMETIC_CLOTHING) return;

  var VERSION = "fh-cosmetic-clothing-1.0.0";
  var DEFAULT_ID = "none";
  var CATEGORIES = Object.freeze([
    "streetwear", "athletic", "formal", "workwear", "fantasy", "casual"
  ]);

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { deepFreeze(value[key]); });
    return Object.freeze(value);
  }

  function outfit(id, label, category, description, cut, sleeves, lower, colors) {
    return deepFreeze({
      id:id,
      label:label,
      category:category,
      description:description,
      cut:cut,
      sleeves:sleeves,
      lower:lower,
      colors:{
        primary:colors[0],
        secondary:colors[1],
        accent:colors[2],
        trim:colors[3]
      },
      pixelCompatible:true
    });
  }

  var NONE = deepFreeze({
    id:"none",
    label:"Default Gear",
    category:"default",
    description:"Use the avatar's equipped gear and class palette without a clothing overlay.",
    cut:"none",
    sleeves:"none",
    lower:"none",
    colors:{ primary:"#000000", secondary:"#000000", accent:"#000000", trim:"#000000" },
    pixelCompatible:true
  });

  /* The designs are style choices, never tied to race, skin tone, gender,
   * class, or body type. Every design is available to every avatar. */
  var DESIGNS = deepFreeze([
    outfit("skyline_bomber", "Skyline Bomber", "streetwear",
      "Cropped bomber with bright skyline piping and zip pockets.",
      "bomber", "long", "tapered", ["#172033", "#314761", "#31C7D5", "#E8F5F7"]),
    outfit("indigo_layers", "Indigo Layers", "streetwear",
      "Denim-inspired overshirt with a layered tee and square pockets.",
      "overshirt", "cuffed", "straight", ["#27496B", "#8FB2C9", "#F2C078", "#172A3D"]),
    outfit("metro_hoodie", "Metro Hoodie", "streetwear",
      "Roomy hoodie, drawcord pixels, front pouch and tapered joggers.",
      "hoodie", "long", "jogger", ["#4B2C6F", "#8060A8", "#5DE1C4", "#21152F"]),

    outfit("sprint_circuit", "Sprint Circuit", "athletic",
      "Full track set with continuous side stripes and fitted cuffs.",
      "track", "long", "jogger", ["#123B4A", "#1D6B75", "#F0C84B", "#E7FAF7"]),
    outfit("court_warmup", "Court Warmup", "athletic",
      "Layered court jersey, block chest mark and movement-ready shorts.",
      "jersey", "short", "shorts", ["#7E2639", "#D75265", "#F5D17A", "#FFF2E1"]),
    outfit("endurance_shell", "Endurance Shell", "athletic",
      "Weather shell with reflective chevrons and a narrow running cut.",
      "shell", "cuffed", "tapered", ["#284243", "#4F7770", "#E77B42", "#D7FFF4"]),

    outfit("midnight_tailoring", "Midnight Tailoring", "formal",
      "Sharp two-button suit with contrast shirt, lapels and slim trousers.",
      "suit", "long", "trousers", ["#18243A", "#F0E9DC", "#A87A42", "#07111F"]),
    outfit("gala_waistcoat", "Gala Waistcoat", "formal",
      "Light shirt, fitted waistcoat, pocket accent and formal trousers.",
      "waistcoat", "long", "trousers", ["#5C294F", "#E9DFD0", "#D5A84B", "#26152B"]),

    outfit("field_mechanic", "Field Mechanic", "workwear",
      "Durable coverall with shoulder yoke, utility seams and reinforced knees.",
      "coverall", "long", "utility", ["#264A4A", "#4B7771", "#E9A23B", "#142D30"]),
    outfit("canvas_carpenter", "Canvas Carpenter", "workwear",
      "Rolled work shirt, twin pockets, canvas trousers and knee panels.",
      "workshirt", "rolled", "utility", ["#7A5938", "#B98B59", "#53A6A6", "#38291F"]),
    outfit("studio_apron", "Studio Apron", "workwear",
      "Practical studio apron over a contrast shirt with a divided tool pocket.",
      "apron", "short", "straight", ["#243B53", "#D6C3A5", "#E56B6F", "#101B29"]),

    outfit("rune_wayfarer", "Rune Wayfarer", "fantasy",
      "Travel tunic with a wrapped waist, asymmetric rune line and boots.",
      "tunic", "long", "wrapped", ["#31594B", "#67927D", "#E0BD61", "#172A24"]),
    outfit("guild_scholar", "Guild Scholar", "fantasy",
      "Layered scholar robe with broad cuffs, a clasp and geometric hem marks.",
      "robe", "wide", "robe", ["#34406B", "#8B96C6", "#E6C76A", "#181D35"]),
    outfit("sky_corsair", "Sky Corsair", "fantasy",
      "High-collar adventurer shirt, fitted vest, diagonal sash and tall boots.",
      "corsair", "cuffed", "boots", ["#6E3340", "#E0C9A8", "#45B8B0", "#291821"]),

    outfit("weekend_knit", "Weekend Knit", "casual",
      "Soft color-block knit with subtle weave pixels and relaxed trousers.",
      "knit", "long", "straight", ["#8B4E58", "#C98282", "#F1C27D", "#3A2730"]),
    outfit("lakeside_layers", "Lakeside Layers", "casual",
      "Easy layered tee with a wave stripe, rolled sleeves and casual shorts.",
      "layered_tee", "rolled", "shorts", ["#28706A", "#D7E7DD", "#F2A65A", "#143937"])
  ]);

  var CATALOG = deepFreeze([NONE].concat(DESIGNS));
  var BY_ID = {};
  CATALOG.forEach(function (entry) { BY_ID[entry.id] = entry; });
  deepFreeze(BY_ID);

  var BASE_GEOMETRY = deepFreeze({
    compact_cozy:{
      torsoX:22, torsoY:30, torsoW:20, torsoH:14,
      leftArmX:16, rightArmX:42, armY:31, armW:6, armH:11,
      leftLegX:23, rightLegX:34, legY:43, legW:7, legH:9,
      leftFootX:20, rightFootX:33, footY:51, footW:11, footH:4
    },
    quest_classic:{
      torsoX:23, torsoY:28, torsoW:18, torsoH:17,
      leftArmX:18, rightArmX:41, armY:30, armW:5, armH:14,
      leftLegX:24, rightLegX:34, legY:44, legW:6, legH:10,
      leftFootX:22, rightFootX:34, footY:52, footW:8, footH:3
    },
    arcade_guardian:{
      torsoX:24, torsoY:31, torsoW:16, torsoH:11,
      leftArmX:17, rightArmX:40, armY:33, armW:7, armH:9,
      leftLegX:24, rightLegX:34, legY:41, legW:6, legH:9,
      leftFootX:19, rightFootX:33, footY:48, footW:12, footH:7
    },
    vanguard_heavy:{
      torsoX:19, torsoY:29, torsoW:26, torsoH:16,
      leftArmX:13, rightArmX:45, armY:29, armW:7, armH:14,
      leftLegX:21, rightLegX:34, legY:44, legW:9, legH:9,
      leftFootX:18, rightFootX:33, footY:51, footW:13, footH:4
    }
  });
  var GEOMETRY_KEYS = Object.freeze([
    "torsoX", "torsoY", "torsoW", "torsoH",
    "leftArmX", "rightArmX", "armY", "armW", "armH",
    "leftLegX", "rightLegX", "legY", "legW", "legH",
    "leftFootX", "rightFootX", "footY", "footW", "footH"
  ]);

  function token(value) {
    return String(value == null ? "" : value).trim().toLowerCase().replace(/[\s-]+/g, "_");
  }

  function validateSelectedId(value) {
    var requested = token(value || DEFAULT_ID);
    var canonical = requested === "default" ? DEFAULT_ID : requested;
    if (Object.prototype.hasOwnProperty.call(BY_ID, canonical)) {
      return deepFreeze({ ok:true, id:canonical, requested:requested });
    }
    return deepFreeze({ ok:false, id:DEFAULT_ID, requested:requested, reason:"unknown_outfit" });
  }

  function clonePlain(value) {
    var out = {};
    if (!value || typeof value !== "object" || Array.isArray(value)) return out;
    Object.keys(value).forEach(function (key) { out[key] = value[key]; });
    return out;
  }

  function planSelection(appearance, selectedId) {
    var validation = validateSelectedId(selectedId);
    if (!validation.ok) return deepFreeze({ ok:false, id:DEFAULT_ID, reason:validation.reason });
    var before = clonePlain(appearance);
    var next = clonePlain(before);
    next.outfit = validation.id;
    return deepFreeze({
      ok:true,
      id:validation.id,
      changed:before.outfit !== validation.id,
      before:before,
      appearance:next
    });
  }

  function integer(value, fallback, minimum, maximum) {
    var number = Number(value);
    if (!Number.isFinite(number)) number = fallback;
    number = Math.round(number);
    return Math.max(minimum, Math.min(maximum, number));
  }

  function geometryFor(options) {
    var source = options && typeof options === "object" ? options : {};
    var preset = token(source.preset || source.visualStyle || source.pixelStyle || "compact_cozy");
    if (!Object.prototype.hasOwnProperty.call(BASE_GEOMETRY, preset)) preset = "compact_cozy";
    var base = BASE_GEOMETRY[preset];
    var supplied = source.geometry && typeof source.geometry === "object" && !Array.isArray(source.geometry)
      ? source.geometry : {};
    var g = {};
    GEOMETRY_KEYS.forEach(function (key) {
      var isSize = /W$|H$/.test(key);
      g[key] = integer(supplied[key], base[key], isSize ? 1 : 0, isSize ? 64 : 63);
    });

    /* When the host does not pass its already-computed geometry, mirror the
     * current avatar body's torso/stance adjustments closely enough for
     * standalone previews. The authoritative integration should pass `g`. */
    if (!source.geometry) {
      var body = token(source.body || "balanced");
      var bodyDelta = body === "round" ? 3 : (body === "broad" ? 2 : (body === "compact" ? -1 : (body === "lean" ? -2 : 0)));
      g.torsoX -= bodyDelta;
      g.torsoW += bodyDelta * 2;
      g.leftArmX -= bodyDelta;
      g.rightArmX += bodyDelta;
      g.leftLegX -= bodyDelta > 0 ? 1 : (bodyDelta < 0 ? -1 : 0);
      g.rightLegX += bodyDelta > 0 ? 1 : (bodyDelta < 0 ? -1 : 0);

      var conditioning = token(source.conditioning || "neutral");
      var torsoDelta = conditioning === "out_of_shape" ? 4
        : (conditioning === "deconditioning" || conditioning === "athletic" ? 2
          : (conditioning === "active" || conditioning === "fit" ? 1 : 0));
      var armDelta = conditioning === "out_of_shape" || conditioning === "athletic" ? 4
        : (conditioning === "fit" ? 3
          : (conditioning === "active" || conditioning === "deconditioning" ? 2
            : (conditioning === "building" ? 1 : 0)));
      var stanceDelta = conditioning === "athletic" ? 2
        : (conditioning === "active" || conditioning === "fit" || conditioning === "out_of_shape" ? 1 : 0);
      g.torsoX -= torsoDelta;
      g.torsoW += torsoDelta * 2;
      g.leftArmX -= armDelta;
      g.rightArmX += armDelta;
      g.leftLegX -= stanceDelta;
      g.rightLegX += stanceDelta;
      if (conditioning === "building" || conditioning === "active" || conditioning === "fit" || conditioning === "athletic") {
        g.torsoY -= 1;
        g.torsoH += 1;
        g.armY -= 1;
      } else if (conditioning === "deconditioning") {
        g.torsoH += 1;
      } else if (conditioning === "out_of_shape") {
        g.torsoH += 2;
        g.legY += 1;
        g.legH = Math.max(5, g.legH - 1);
      }
    }
    return g;
  }

  function rect(x, y, width, height, fill, className) {
    x = integer(x, 0, 0, 63);
    y = integer(y, 0, 0, 63);
    width = integer(width, 0, 0, 64);
    height = integer(height, 0, 0, 64);
    width = Math.min(width, 64 - x);
    height = Math.min(height, 64 - y);
    if (width < 1 || height < 1) return "";
    var classPart = className ? " class=\"" + className + "\"" : "";
    return "<rect" + classPart + " x=\"" + x + "\" y=\"" + y
      + "\" width=\"" + width + "\" height=\"" + height
      + "\" fill=\"" + fill + "\"/>";
  }

  function sleevePixels(entry, g, c) {
    var length = entry.sleeves === "short" ? Math.max(3, Math.floor(g.armH * 0.42))
      : (entry.sleeves === "rolled" || entry.sleeves === "cuffed" ? Math.max(4, Math.floor(g.armH * 0.68)) : g.armH - 2);
    var inset = entry.sleeves === "wide" ? 0 : 1;
    var width = Math.max(2, g.armW - inset);
    var art = rect(g.leftArmX + inset, g.armY + 1, width, length, c.primary, "fhpx-outfit-sleeve")
      + rect(g.rightArmX, g.armY + 1, width, length, c.primary, "fhpx-outfit-sleeve");
    if (entry.sleeves === "rolled" || entry.sleeves === "cuffed" || entry.sleeves === "wide") {
      art += rect(g.leftArmX + inset, g.armY + length - 1, width, 2, c.accent, "fhpx-outfit-cuff")
        + rect(g.rightArmX, g.armY + length - 1, width, 2, c.accent, "fhpx-outfit-cuff");
    }
    return art;
  }

  function lowerPixels(entry, g, c) {
    var art = "";
    var leftInset = entry.lower === "tapered" || entry.lower === "jogger" ? 2 : 1;
    var rightInset = entry.lower === "tapered" || entry.lower === "jogger" ? 1 : 0;
    var legHeight = entry.lower === "shorts" ? Math.max(3, Math.floor(g.legH * 0.48)) : g.legH - 1;
    if (entry.lower === "robe") {
      art += rect(g.torsoX + 1, g.torsoY + Math.max(5, g.torsoH - 5), Math.max(2, g.torsoW - 2),
        Math.max(4, g.legY + g.legH - (g.torsoY + g.torsoH - 5)), c.secondary, "fhpx-outfit-robe")
        + rect(g.torsoX + 3, g.legY + 1, 2, Math.max(2, g.legH - 2), c.accent, "fhpx-outfit-robe-mark")
        + rect(g.torsoX + g.torsoW - 5, g.legY + 2, 2, Math.max(2, g.legH - 3), c.accent, "fhpx-outfit-robe-mark");
    } else {
      art += rect(g.leftLegX + leftInset, g.legY, Math.max(2, g.legW - leftInset - 1), legHeight, c.secondary, "fhpx-outfit-lower")
        + rect(g.rightLegX + rightInset, g.legY, Math.max(2, g.legW - rightInset - 1), legHeight, c.secondary, "fhpx-outfit-lower");
    }
    if (entry.lower === "utility") {
      art += rect(g.leftLegX + 1, g.legY + 2, Math.max(2, g.legW - 2), 2, c.accent, "fhpx-outfit-knee")
        + rect(g.rightLegX + 1, g.legY + 2, Math.max(2, g.legW - 2), 2, c.accent, "fhpx-outfit-knee");
    } else if (entry.lower === "wrapped") {
      art += rect(g.torsoX, g.torsoY + g.torsoH - 3, g.torsoW, 2, c.accent, "fhpx-outfit-wrap");
    } else if (entry.lower === "jogger") {
      art += rect(g.leftLegX + 1, g.legY + g.legH - 2, Math.max(2, g.legW - 2), 2, c.trim, "fhpx-outfit-ankle")
        + rect(g.rightLegX + 1, g.legY + g.legH - 2, Math.max(2, g.legW - 2), 2, c.trim, "fhpx-outfit-ankle");
    }
    var bootColor = entry.lower === "boots" ? c.primary : c.trim;
    var bootHeight = entry.lower === "boots" ? Math.max(2, Math.floor(g.legH * 0.45)) : 1;
    if (entry.lower === "boots") {
      art += rect(g.leftLegX + 1, g.legY + g.legH - bootHeight, Math.max(2, g.legW - 2), bootHeight, bootColor, "fhpx-outfit-boot")
        + rect(g.rightLegX + 1, g.legY + g.legH - bootHeight, Math.max(2, g.legW - 2), bootHeight, bootColor, "fhpx-outfit-boot");
    }
    art += rect(g.leftFootX + 1, g.footY, Math.max(2, g.footW - 2), Math.max(1, g.footH - 1), bootColor, "fhpx-outfit-shoe")
      + rect(g.rightFootX + 1, g.footY, Math.max(2, g.footW - 2), Math.max(1, g.footH - 1), bootColor, "fhpx-outfit-shoe");
    return art;
  }

  function torsoPixels(entry, g, c) {
    var x = g.torsoX, y = g.torsoY, w = g.torsoW, h = g.torsoH;
    var cx = x + Math.floor(w / 2);
    var art = rect(x, y + 1, w, Math.max(2, h - 2), c.primary, "fhpx-outfit-top");

    if (entry.cut === "bomber") {
      art += rect(x, y + 1, w, 3, c.secondary, "fhpx-outfit-yoke")
        + rect(cx, y + 2, 1, Math.max(3, h - 4), c.trim, "fhpx-outfit-zip")
        + rect(x + 2, y + h - 5, 4, 2, c.accent, "fhpx-outfit-pocket")
        + rect(x + w - 6, y + h - 5, 4, 2, c.accent, "fhpx-outfit-pocket");
    } else if (entry.cut === "overshirt") {
      art += rect(x + 1, y + 2, w - 2, 3, c.secondary, "fhpx-outfit-layer")
        + rect(cx, y + 1, 2, h - 2, c.trim, "fhpx-outfit-placket")
        + rect(x + 2, y + 6, 5, 4, c.accent, "fhpx-outfit-pocket")
        + rect(x + w - 7, y + 6, 5, 4, c.accent, "fhpx-outfit-pocket");
    } else if (entry.cut === "hoodie") {
      art += rect(x + 2, y, w - 4, 4, c.secondary, "fhpx-outfit-hood")
        + rect(cx - 3, y + 3, 1, 4, c.accent, "fhpx-outfit-cord")
        + rect(cx + 2, y + 3, 1, 4, c.accent, "fhpx-outfit-cord")
        + rect(cx - 5, y + h - 6, 10, 4, c.trim, "fhpx-outfit-pouch");
    } else if (entry.cut === "track") {
      art += rect(x + 1, y + 1, 2, h - 2, c.accent, "fhpx-outfit-stripe")
        + rect(x + w - 3, y + 1, 2, h - 2, c.accent, "fhpx-outfit-stripe")
        + rect(cx, y + 1, 1, h - 2, c.trim, "fhpx-outfit-zip");
    } else if (entry.cut === "jersey") {
      art += rect(x + 1, y + 1, w - 2, 3, c.secondary, "fhpx-outfit-shoulder")
        + rect(cx - 3, y + 5, 6, 2, c.accent, "fhpx-outfit-number")
        + rect(cx - 1, y + 7, 2, 4, c.accent, "fhpx-outfit-number");
    } else if (entry.cut === "shell") {
      art += rect(x + 1, y + 2, w - 2, 2, c.secondary, "fhpx-outfit-shell-band")
        + rect(x + 3, y + 5, Math.max(2, Math.floor(w / 2) - 3), 2, c.accent, "fhpx-outfit-chevron")
        + rect(cx, y + 7, Math.max(2, Math.floor(w / 2) - 2), 2, c.accent, "fhpx-outfit-chevron");
    } else if (entry.cut === "suit") {
      art += rect(cx - 3, y + 1, 6, h - 2, c.secondary, "fhpx-outfit-shirt")
        + rect(x + 2, y + 1, 5, 6, c.primary, "fhpx-outfit-lapel")
        + rect(x + w - 7, y + 1, 5, 6, c.primary, "fhpx-outfit-lapel")
        + rect(cx - 1, y + 3, 2, 6, c.accent, "fhpx-outfit-tie")
        + rect(cx - 1, y + h - 5, 2, 2, c.trim, "fhpx-outfit-button");
    } else if (entry.cut === "waistcoat") {
      art = rect(x, y + 1, w, h - 2, c.secondary, "fhpx-outfit-shirt")
        + rect(x + 3, y + 2, Math.max(3, w - 6), h - 4, c.primary, "fhpx-outfit-vest")
        + rect(cx, y + 4, 1, h - 7, c.accent, "fhpx-outfit-buttons")
        + rect(x + w - 6, y + 6, 3, 1, c.trim, "fhpx-outfit-pocket");
    } else if (entry.cut === "coverall") {
      art += rect(x, y + 1, w, 4, c.secondary, "fhpx-outfit-yoke")
        + rect(cx, y + 1, 2, h - 2, c.accent, "fhpx-outfit-zip")
        + rect(x + 2, y + 6, 5, 4, c.trim, "fhpx-outfit-pocket");
    } else if (entry.cut === "workshirt") {
      art += rect(x + 1, y + 1, w - 2, 3, c.secondary, "fhpx-outfit-yoke")
        + rect(x + 2, y + 5, 5, 4, c.accent, "fhpx-outfit-pocket")
        + rect(x + w - 7, y + 5, 5, 4, c.accent, "fhpx-outfit-pocket")
        + rect(cx, y + 4, 1, h - 5, c.trim, "fhpx-outfit-placket");
    } else if (entry.cut === "apron") {
      art = rect(x, y + 1, w, h - 2, c.secondary, "fhpx-outfit-shirt")
        + rect(x + 3, y + 3, w - 6, h - 4, c.primary, "fhpx-outfit-apron")
        + rect(x + 2, y + 1, 2, 5, c.accent, "fhpx-outfit-strap")
        + rect(x + w - 4, y + 1, 2, 5, c.accent, "fhpx-outfit-strap")
        + rect(cx - 4, y + h - 6, 8, 3, c.trim, "fhpx-outfit-pocket");
    } else if (entry.cut === "tunic") {
      art += rect(x + 1, y + 2, w - 2, 2, c.secondary, "fhpx-outfit-collar")
        + rect(cx - 1, y + 4, 2, 5, c.accent, "fhpx-outfit-rune")
        + rect(cx + 1, y + 7, 3, 2, c.accent, "fhpx-outfit-rune")
        + rect(x, y + h - 4, w, 3, c.trim, "fhpx-outfit-wrap");
    } else if (entry.cut === "robe") {
      art += rect(x, y + 1, w, 3, c.secondary, "fhpx-outfit-mantle")
        + rect(cx - 2, y + 3, 4, 4, c.accent, "fhpx-outfit-clasp")
        + rect(cx, y + 7, 1, h - 8, c.trim, "fhpx-outfit-seam");
    } else if (entry.cut === "corsair") {
      art = rect(x, y + 1, w, h - 2, c.secondary, "fhpx-outfit-shirt")
        + rect(x + 2, y + 2, w - 4, h - 5, c.primary, "fhpx-outfit-vest")
        + rect(x + 1, y + 5, w - 2, 3, c.accent, "fhpx-outfit-sash")
        + rect(x + w - 5, y, 4, 4, c.trim, "fhpx-outfit-collar");
    } else if (entry.cut === "knit") {
      art += rect(x, y + 3, w, 2, c.secondary, "fhpx-outfit-knit")
        + rect(x, y + 7, w, 2, c.accent, "fhpx-outfit-knit")
        + rect(x + 2, y + 1, 2, h - 2, c.trim, "fhpx-outfit-weave")
        + rect(x + w - 4, y + 1, 2, h - 2, c.trim, "fhpx-outfit-weave");
    } else if (entry.cut === "layered_tee") {
      art = rect(x, y + 1, w, h - 2, c.secondary, "fhpx-outfit-underlayer")
        + rect(x + 1, y + 1, w - 2, h - 5, c.primary, "fhpx-outfit-tee")
        + rect(x + 2, y + 5, Math.max(2, Math.floor(w / 2) - 2), 2, c.accent, "fhpx-outfit-wave")
        + rect(cx, y + 7, Math.max(2, Math.floor(w / 2) - 2), 2, c.accent, "fhpx-outfit-wave");
    }
    return art;
  }

  function renderOverlay(selectedId, options) {
    var validation = validateSelectedId(selectedId);
    if (!validation.ok || validation.id === DEFAULT_ID) return "";
    var entry = BY_ID[validation.id];
    var g = geometryFor(options);
    var c = entry.colors;
    var art = torsoPixels(entry, g, c) + sleevePixels(entry, g, c) + lowerPixels(entry, g, c);
    return "<g class=\"fhpx-cosmetic-outfit\" data-outfit=\"" + entry.id
      + "\" data-category=\"" + entry.category + "\">" + art + "</g>";
  }

  var api = deepFreeze({
    version:VERSION,
    defaultId:DEFAULT_ID,
    categories:CATEGORIES,
    catalog:CATALOG,
    designCount:DESIGNS.length,
    list:function () { return CATALOG; },
    get:function (selectedId) {
      var validation = validateSelectedId(selectedId);
      return validation.ok ? BY_ID[validation.id] : null;
    },
    isValidId:function (selectedId) { return validateSelectedId(selectedId).ok; },
    validateSelectedId:validateSelectedId,
    planSelection:planSelection,
    renderOverlay:renderOverlay
  });

  global.FH_COSMETIC_CLOTHING = api;
})(typeof window !== "undefined" ? window : globalThis);

/* asset content-type refresh — v10.32.0 */
