/* ================================================================
 * Focus Hero v8.6.0 - CHARACTER FIX + HERO CARD OVERRIDE
 *
 * Critical fixes that v8.4 missed:
 *
 * 1. The v8.4 character system ONLY patched the modal-preview function
 *    (characterPortraitSvg). The HERO CARD avatar was still rendered
 *    by the v7.9 detailed-knight pixelAvatarSvg() - which is why
 *    Joel said "same robot looking motherfucker" even after picking
 *    Orc or Demon. This file overrides pixelAvatarSvg too so the
 *    Hero card visibly transforms when species/class change.
 *
 * 2. The v8.4 SVG didn't make species DRAMATIC enough. This file
 *    adds species-specific scale/silhouette logic so a Dwarf is
 *    clearly SHORT AND STOCKY, an Orc is BULKY/BROAD, a Goblin is
 *    SMALL AND WIRY, an Elf is SLENDER AND TALL, etc.
 *
 * 3. Class outfits get a visible weapon prop + outfit overlay that
 *    actually changes when class changes (not just the emblem badge).
 *
 * Loaded AFTER character-rebuild.js. Pure additive override - data
 * model unchanged. No migration required for this file alone.
 * ================================================================ */

(function(){
  "use strict";

  /* Lazy access to v8.4 helpers and constants */
  function _CR_SPECIES(){ return window.CR_SPECIES || {}; }
  function _CR_CLASSES(){ return window.CR_CLASSES || {}; }
  function _CR_HAIR_COLORS(){ return window.CR_HAIR_COLORS || {}; }
  function _CR_EYE_COLORS(){ return window.CR_EYE_COLORS || {}; }

  /* Color helpers */
  function lighten(hex, amt){ var c=hexToRgb(hex); return rgbToHex({r:Math.round(c.r+(255-c.r)*amt),g:Math.round(c.g+(255-c.g)*amt),b:Math.round(c.b+(255-c.b)*amt)}); }
  function darken(hex, amt){ var c=hexToRgb(hex); return rgbToHex({r:Math.round(c.r*(1-amt)),g:Math.round(c.g*(1-amt)),b:Math.round(c.b*(1-amt))}); }
  function hexToRgb(h){ h=String(h||"#000000").replace("#",""); if(h.length===3)h=h.split("").map(function(c){return c+c;}).join(""); return {r:parseInt(h.slice(0,2),16)||0,g:parseInt(h.slice(2,4),16)||0,b:parseInt(h.slice(4,6),16)||0}; }
  function rgbToHex(c){ var t=function(n){var s=Math.max(0,Math.min(255,n|0)).toString(16);return s.length<2?"0"+s:s;}; return "#"+t(c.r)+t(c.g)+t(c.b); }

  /* SPECIES SCALE PROFILES - dramatic differences */
  var V86_SPECIES_PROFILES = {
    human:           { heightScale:1.00, widthScale:1.00, headScale:1.00, postureY:0,   stockiness:1.0 },
    elf:             { heightScale:1.08, widthScale:0.88, headScale:0.95, postureY:-4,  stockiness:0.85 },
    dwarf:           { heightScale:0.72, widthScale:1.25, headScale:1.20, postureY:14,  stockiness:1.45 },
    orc:             { heightScale:1.15, widthScale:1.30, headScale:1.10, postureY:-2,  stockiness:1.50 },
    goblin:          { heightScale:0.60, widthScale:0.80, headScale:1.15, postureY:22,  stockiness:0.85 },
    beastfolk_cat:   { heightScale:1.02, widthScale:1.00, headScale:1.05, postureY:0,   stockiness:1.0 },
    beastfolk_wolf:  { heightScale:1.08, widthScale:1.05, headScale:1.05, postureY:-2,  stockiness:1.10 },
    beastfolk_lizard:{ heightScale:1.05, widthScale:1.00, headScale:1.00, postureY:-1,  stockiness:1.0 },
    undead:          { heightScale:1.03, widthScale:0.92, headScale:1.05, postureY:2,   stockiness:0.85 },
    demon:           { heightScale:1.12, widthScale:1.15, headScale:1.08, postureY:-3,  stockiness:1.25 },
    fae:             { heightScale:0.92, widthScale:0.82, headScale:0.90, postureY:6,   stockiness:0.80 }
  };

  /* CLASS WEAPON + OUTFIT OVERLAYS (more elaborate than the v8.4 ones) */
  var V86_CLASS_OVERLAYS = {
    warrior: { weaponName:"greatsword", shield:true, helm:"open", accent:"red" },
    mage:    { weaponName:"crystal_staff", shield:false, helm:"hood", accent:"violet" },
    rogue:   { weaponName:"twin_daggers", shield:false, helm:"hood", accent:"green" },
    ranger:  { weaponName:"longbow", shield:false, helm:"none", accent:"forest" },
    cleric:  { weaponName:"holy_mace", shield:true, helm:"halo", accent:"gold" },
    bard:    { weaponName:"lute", shield:false, helm:"feather", accent:"pink" },
    druid:   { weaponName:"nature_staff", shield:false, helm:"antlers", accent:"earth" },
    knight:  { weaponName:"sword_shield", shield:true, helm:"plumed", accent:"blue" },
    monk:    { weaponName:"focus_wraps", shield:false, helm:"none", accent:"gold" },
    alchemist:{ weaponName:"catalyst_flask", shield:false, helm:"goggles", accent:"teal" },
    sentinel:{ weaponName:"tower_shield", shield:true, helm:"plumed", accent:"cyan" },
    shadowmancer:{ weaponName:"eclipse_sickle", shield:false, helm:"hood", accent:"violet" },
    /* v8.8: bard wasn't in v86 overlays — silently rendered as warrior. */
    bard:    { weaponName:"lute",         shield:false, helm:"feather", accent:"violet" }
  };

  /* ===========================================================
   * DRAMATIC v8.6 CHARACTER PORTRAIT
   * Used by both the Hero card avatar AND the modal preview.
   * =========================================================== */
  function v86CharacterSvg(appearance, opts){
    opts = opts || {};
    var a = appearance || {};
    var SPECIES = _CR_SPECIES();
    var CLASSES = _CR_CLASSES();
    var HAIR_COLORS = _CR_HAIR_COLORS();
    var EYE_COLORS = _CR_EYE_COLORS();
    var speciesKey = a.species || a.race || "human";
    var species = SPECIES[speciesKey] || SPECIES.human;
    var profile = V86_SPECIES_PROFILES[speciesKey] || V86_SPECIES_PROFILES.human;
    var classKey = a.classKey || a.cls || "warrior";
    var klass = CLASSES[classKey] || CLASSES.warrior;
    var overlay = V86_CLASS_OVERLAYS[classKey] || V86_CLASS_OVERLAYS.warrior;
    var skinIdx = Math.max(0, Math.min((species.skinTones || ["#F6D7C3"]).length - 1, a.skinIdx|0));
    var skin = (species.skinTones || ["#F6D7C3"])[skinIdx];
    var hairColor = HAIR_COLORS[a.hairColor] || "#3D2417";
    var eyeColor = EYE_COLORS[a.eyeColor] || "#D89A2F";
    var hairStyle = a.hair || "short";
    var faceFx = a.face || "calm";
    var scene = opts.scene || "resting";
    var running = !!opts.running;

    var cw = 100; // canvas center X
    var groundY = 205;
    var hs = profile.heightScale;
    var ws = profile.widthScale;
    var hScale = profile.headScale;
    var posture = profile.postureY;
    var stocky = profile.stockiness;

    // Body proportions, species-scaled
    var headRadiusX = 22 * hScale * ws;
    var headRadiusY = 26 * hScale * hs;
    var headCenterY = (78 + posture) * hs + (1 - hs) * 90; // head moves DOWN for short species
    var neckY = headCenterY + headRadiusY * 0.95;
    var shoulderY = neckY + 12 * hs;
    var torsoHalfW = 22 * ws * stocky;
    var torsoBottomHalfW = 20 * ws * stocky;
    var waistY = shoulderY + 52 * hs;
    var legBottomY = groundY;
    var legTopY = waistY;

    return '<svg class="v86-portrait fh79" data-species="' + escSpa(speciesKey) + '" data-class="' + escSpa(classKey) + '" data-scene="' + escSpa(scene) + '" viewBox="0 0 200 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="' + (species.label || speciesKey) + ' ' + (klass.label || classKey) + '">' +
      '<defs>' +
        '<linearGradient id="v86bg-' + classKey + '" x2="0" y2="1">' +
          '<stop stop-color="' + lighten(klass.primary || "#465E80", 0.15) + '" stop-opacity="0.45"/>' +
          '<stop offset="1" stop-color="' + darken(klass.primary || "#465E80", 0.55) + '" stop-opacity="0.7"/>' +
        '</linearGradient>' +
        '<radialGradient id="v86faeglow" cx="0.5" cy="0.35" r="0.55"><stop stop-color="#F5E6FF" stop-opacity="0.7"/><stop offset="1" stop-color="#F5E6FF" stop-opacity="0"/></radialGradient>' +
      '</defs>' +
      '<rect width="200" height="220" rx="12" fill="#0E1325"/>' +
      '<rect width="200" height="220" rx="12" fill="url(#v86bg-' + classKey + ')"/>' +
      // Floor ellipse — bigger for stocky, smaller for tall
      '<ellipse cx="100" cy="' + groundY + '" rx="' + (52 * ws * stocky) + '" ry="7" fill="#03060F" opacity="0.78"/>' +
      // Fae glow halo
      (species.trait === "glow" ? '<circle cx="100" cy="' + (headCenterY - 6) + '" r="' + (54 * hScale) + '" fill="url(#v86faeglow)"/>' : "") +

      // ----- LEGS -----
      v86LegsSvg(klass, overlay, waistY, legBottomY, ws, stocky, cw) +

      // ----- TORSO + CLASS OUTFIT -----
      v86TorsoOutfitSvg(klass, overlay, species, skin, shoulderY, waistY, torsoHalfW, torsoBottomHalfW, cw) +

      // ----- CAPE / CLOAK -----
      v86CapeSvg(klass, overlay, shoulderY, groundY, ws, cw) +

      // ----- ARMS + HANDS -----
      v86ArmsSvg(klass, overlay, skin, shoulderY, waistY, torsoHalfW, ws, hs, stocky, cw) +

      // ----- HEAD + FACIAL FEATURES -----
      v86HeadSvg(species, profile, skin, headCenterY, headRadiusX, headRadiusY, cw) +
      v86SpeciesFeaturesSvg(species, profile, skin, headCenterY, headRadiusX, headRadiusY, cw) +
      v86FaceSvg(species, profile, skin, eyeColor, faceFx, headCenterY, headRadiusX, headRadiusY, cw) +
      v86HairSvg(hairStyle, hairColor, species, profile, headCenterY, headRadiusX, headRadiusY, cw) +
      v86HelmSvg(overlay, klass, headCenterY, headRadiusX, headRadiusY, cw) +

      // ----- WEAPON (in right hand) -----
      v86WeaponSvg(klass, overlay, shoulderY, ws, hs, cw) +

      // ----- CLASS EMBLEM (chest center) -----
      v86EmblemSvg(klass, shoulderY, waistY, cw) +
    '</svg>';
  }

  function escSpa(s){ return String(s||"").replace(/[<>"'&]/g, ""); }

  /* ----- LEGS ----- */
  function v86LegsSvg(klass, overlay, waistY, legBottomY, ws, stocky, cw){
    var p = klass.primary, s = klass.secondary;
    var legW = 8 * ws * stocky;
    var feetW = 11 * ws * stocky;
    var crotchY = waistY + 4;
    var pantsColor = (klass.outfit === "plate" || klass.outfit === "leather") ? "#3a2d22" : darken(p, 0.4);
    var bootColor = "#1A0F0B";
    var leftX = cw - 7 * ws * stocky, rightX = cw + 7 * ws * stocky;
    return '<g class="v86-legs">' +
      // left leg
      '<rect x="' + (leftX - legW/2) + '" y="' + crotchY + '" width="' + legW + '" height="' + (legBottomY - crotchY - 6) + '" rx="3" fill="' + pantsColor + '" stroke="#0B0814" stroke-width="1.5"/>' +
      // right leg
      '<rect x="' + (rightX - legW/2) + '" y="' + crotchY + '" width="' + legW + '" height="' + (legBottomY - crotchY - 6) + '" rx="3" fill="' + pantsColor + '" stroke="#0B0814" stroke-width="1.5"/>' +
      // left boot
      '<ellipse cx="' + leftX + '" cy="' + (legBottomY - 2) + '" rx="' + (feetW/2) + '" ry="4" fill="' + bootColor + '" stroke="#0B0814" stroke-width="1.4"/>' +
      // right boot
      '<ellipse cx="' + rightX + '" cy="' + (legBottomY - 2) + '" rx="' + (feetW/2) + '" ry="4" fill="' + bootColor + '" stroke="#0B0814" stroke-width="1.4"/>' +
    '</g>';
  }

  /* ----- TORSO + OUTFIT (class-specific) ----- */
  function v86TorsoOutfitSvg(klass, overlay, species, skin, shoulderY, waistY, halfW, halfWBottom, cw){
    var p = klass.primary, s = klass.secondary;
    var ymid = (shoulderY + waistY) / 2;
    // First: skin under-layer
    var torsoPath = 'M' + (cw - halfW) + ' ' + shoulderY +
                    ' Q' + cw + ' ' + (shoulderY - 4) + ' ' + (cw + halfW) + ' ' + shoulderY +
                    ' L' + (cw + halfWBottom + 2) + ' ' + waistY +
                    ' Q' + cw + ' ' + (waistY + 6) + ' ' + (cw - halfWBottom - 2) + ' ' + waistY + ' Z';
    var skinUnder = '<path d="' + torsoPath + '" fill="' + skin + '" stroke="#0B0814" stroke-width="1.4"/>';
    var outfit = "";
    if (klass.outfit === "plate"){
      // Plate: chest plate + bands
      outfit = '<path d="' + torsoPath + '" fill="' + p + '" stroke="#0B0814" stroke-width="2"/>' +
        // chest highlight
        '<path d="M' + (cw - halfW + 4) + ' ' + (shoulderY + 4) + ' Q' + cw + ' ' + (shoulderY + 1) + ' ' + (cw + halfW - 4) + ' ' + (shoulderY + 4) + ' L' + (cw + halfW - 6) + ' ' + (ymid - 4) + ' L' + (cw - halfW + 6) + ' ' + (ymid - 4) + ' Z" fill="' + lighten(p, 0.30) + '" opacity="0.55"/>' +
        // pauldrons
        '<ellipse cx="' + (cw - halfW) + '" cy="' + (shoulderY + 1) + '" rx="12" ry="10" fill="' + p + '" stroke="#0B0814" stroke-width="2"/>' +
        '<ellipse cx="' + (cw + halfW) + '" cy="' + (shoulderY + 1) + '" rx="12" ry="10" fill="' + p + '" stroke="#0B0814" stroke-width="2"/>' +
        // pauldron trim
        '<path d="M' + (cw - halfW - 6) + ' ' + (shoulderY - 1) + ' Q' + (cw - halfW) + ' ' + (shoulderY - 8) + ' ' + (cw - halfW + 6) + ' ' + (shoulderY - 1) + '" fill="none" stroke="' + s + '" stroke-width="2.5"/>' +
        '<path d="M' + (cw + halfW - 6) + ' ' + (shoulderY - 1) + ' Q' + (cw + halfW) + ' ' + (shoulderY - 8) + ' ' + (cw + halfW + 6) + ' ' + (shoulderY - 1) + '" fill="none" stroke="' + s + '" stroke-width="2.5"/>' +
        // belt
        '<rect x="' + (cw - halfWBottom - 4) + '" y="' + (waistY - 8) + '" width="' + (halfWBottom * 2 + 8) + '" height="9" fill="#3D2C1C" stroke="#0B0814" stroke-width="1.5"/>' +
        '<rect x="' + (cw - 7) + '" y="' + (waistY - 7) + '" width="14" height="7" fill="' + s + '" stroke="#0B0814" stroke-width="1.2"/>';
    } else if (klass.outfit === "robe"){
      // Long robe extending to ground
      outfit = '<path d="M' + (cw - halfW) + ' ' + shoulderY +
        ' Q' + cw + ' ' + (shoulderY - 4) + ' ' + (cw + halfW) + ' ' + shoulderY +
        ' L' + (cw + halfWBottom + 10) + ' ' + (waistY + 30) +
        ' Q' + cw + ' ' + (waistY + 40) + ' ' + (cw - halfWBottom - 10) + ' ' + (waistY + 30) +
        ' Z" fill="' + p + '" stroke="#0B0814" stroke-width="2"/>' +
        // gold band down center
        '<path d="M' + (cw - 5) + ' ' + shoulderY + ' L' + (cw + 5) + ' ' + shoulderY + ' L' + (cw + 7) + ' ' + (waistY + 30) + ' L' + (cw - 7) + ' ' + (waistY + 30) + ' Z" fill="' + s + '" stroke="#0B0814" stroke-width="1.4"/>' +
        // sash
        '<path d="M' + (cw - halfW + 2) + ' ' + (waistY - 3) + ' Q' + cw + ' ' + (waistY + 4) + ' ' + (cw + halfW - 2) + ' ' + (waistY - 3) + ' L' + (cw + halfW - 2) + ' ' + (waistY + 8) + ' Q' + cw + ' ' + (waistY + 14) + ' ' + (cw - halfW + 2) + ' ' + (waistY + 8) + ' Z" fill="' + darken(p, 0.35) + '" stroke="#0B0814" stroke-width="1.4"/>';
    } else if (klass.outfit === "leather"){
      outfit = '<path d="' + torsoPath + '" fill="' + p + '" stroke="#0B0814" stroke-width="2"/>' +
        // diagonal straps
        '<path d="M' + (cw - halfW + 6) + ' ' + (shoulderY + 6) + ' L' + (cw + halfWBottom - 4) + ' ' + (waistY - 4) + '" stroke="' + darken(p, 0.45) + '" stroke-width="3"/>' +
        '<path d="M' + (cw + halfW - 6) + ' ' + (shoulderY + 6) + ' L' + (cw - halfWBottom + 4) + ' ' + (waistY - 4) + '" stroke="' + darken(p, 0.45) + '" stroke-width="3"/>' +
        // buckles
        '<rect x="' + (cw - halfWBottom + 2) + '" y="' + (waistY - 10) + '" width="6" height="5" fill="' + s + '" stroke="#0B0814" stroke-width="1.2"/>' +
        '<rect x="' + (cw + halfWBottom - 8) + '" y="' + (waistY - 10) + '" width="6" height="5" fill="' + s + '" stroke="#0B0814" stroke-width="1.2"/>' +
        // belt
        '<rect x="' + (cw - halfWBottom - 4) + '" y="' + (waistY - 4) + '" width="' + (halfWBottom * 2 + 8) + '" height="7" fill="#3D2C1C" stroke="#0B0814" stroke-width="1.5"/>';
    } else if (klass.outfit === "motley"){
      // Two-color panels
      outfit = '<path d="' + torsoPath + '" fill="' + p + '" stroke="#0B0814" stroke-width="2"/>' +
        '<path d="M' + cw + ' ' + shoulderY + ' L' + cw + ' ' + waistY + '" stroke="#0B0814" stroke-width="1.5"/>' +
        '<path d="M' + cw + ' ' + shoulderY +
          ' Q' + (cw + halfW / 2) + ' ' + (shoulderY - 2) + ' ' + (cw + halfW) + ' ' + shoulderY +
          ' L' + (cw + halfWBottom + 2) + ' ' + waistY +
          ' Q' + cw + ' ' + (waistY + 6) + ' ' + cw + ' ' + waistY + ' Z" fill="' + s + '" opacity="0.95"/>' +
        // buttons (alternating)
        '<circle cx="' + (cw - 8) + '" cy="' + (shoulderY + 18) + '" r="2.5" fill="' + s + '"/>' +
        '<circle cx="' + (cw - 8) + '" cy="' + (shoulderY + 32) + '" r="2.5" fill="' + s + '"/>' +
        '<circle cx="' + (cw + 8) + '" cy="' + (shoulderY + 18) + '" r="2.5" fill="' + p + '"/>' +
        '<circle cx="' + (cw + 8) + '" cy="' + (shoulderY + 32) + '" r="2.5" fill="' + p + '"/>';
    } else if (klass.outfit === "woven"){
      // Long druidic robe + vine wraps + leaf accents
      outfit = '<path d="M' + (cw - halfW) + ' ' + shoulderY +
        ' Q' + cw + ' ' + (shoulderY - 4) + ' ' + (cw + halfW) + ' ' + shoulderY +
        ' L' + (cw + halfWBottom + 8) + ' ' + (waistY + 30) +
        ' Q' + cw + ' ' + (waistY + 40) + ' ' + (cw - halfWBottom - 8) + ' ' + (waistY + 30) +
        ' Z" fill="' + p + '" stroke="#0B0814" stroke-width="2"/>' +
        // vine wraps
        '<path d="M' + (cw - halfW + 4) + ' ' + (shoulderY + 14) + ' Q' + cw + ' ' + (shoulderY + 20) + ' ' + (cw + halfW - 4) + ' ' + (shoulderY + 14) +
              ' M' + (cw - halfW + 5) + ' ' + (waistY + 0) + ' Q' + cw + ' ' + (waistY + 6) + ' ' + (cw + halfW - 5) + ' ' + (waistY + 0) +
              ' M' + (cw - halfWBottom + 0) + ' ' + (waistY + 22) + ' Q' + cw + ' ' + (waistY + 30) + ' ' + (cw + halfWBottom - 0) + ' ' + (waistY + 22) + '" stroke="' + s + '" stroke-width="1.6" fill="none"/>' +
        // leaves
        '<path d="M' + (cw - 16) + ' ' + (shoulderY + 28) + ' Q' + (cw - 12) + ' ' + (shoulderY + 22) + ' ' + (cw - 8) + ' ' + (shoulderY + 28) + ' Q' + (cw - 12) + ' ' + (shoulderY + 34) + ' ' + (cw - 16) + ' ' + (shoulderY + 28) + ' Z" fill="' + s + '"/>' +
        '<path d="M' + (cw + 8) + ' ' + (shoulderY + 46) + ' Q' + (cw + 12) + ' ' + (shoulderY + 40) + ' ' + (cw + 16) + ' ' + (shoulderY + 46) + ' Q' + (cw + 12) + ' ' + (shoulderY + 52) + ' ' + (cw + 8) + ' ' + (shoulderY + 46) + ' Z" fill="' + s + '"/>';
    } else {
      // Fallback: simple tunic
      outfit = '<path d="' + torsoPath + '" fill="' + p + '" stroke="#0B0814" stroke-width="2"/>';
    }
    return '<g class="v86-torso">' + skinUnder + outfit + '</g>';
  }

  /* ----- CAPE ----- */
  function v86CapeSvg(klass, overlay, shoulderY, groundY, ws, cw){
    if (klass.outfit === "motley" || klass.outfit === "robe") return ""; // skip
    var capeColor = darken(klass.primary || "#465E80", 0.45);
    return '<g class="v86-cape" opacity="0.88">' +
      '<path d="M' + (cw - 18 * ws) + ' ' + (shoulderY - 4) +
              ' Q' + cw + ' ' + (shoulderY - 8) + ' ' + (cw + 18 * ws) + ' ' + (shoulderY - 4) +
              ' L' + (cw + 28 * ws) + ' ' + (groundY - 8) +
              ' Q' + cw + ' ' + groundY + ' ' + (cw - 28 * ws) + ' ' + (groundY - 8) +
              ' Z" fill="' + capeColor + '" stroke="#0B0814" stroke-width="1.4"/>' +
      // Center stitch
      '<path d="M' + cw + ' ' + (shoulderY - 4) + ' L' + cw + ' ' + (groundY - 4) + '" stroke="' + darken(capeColor, 0.4) + '" stroke-width="1.5" opacity="0.5"/>' +
    '</g>';
  }

  /* ----- ARMS ----- */
  function v86ArmsSvg(klass, overlay, skin, shoulderY, waistY, halfW, ws, hs, stocky, cw){
    var leftShX = cw - halfW + 2, rightShX = cw + halfW - 2;
    var handY = waistY + 8;
    var leftHandX = leftShX - 14 * ws;
    var rightHandX = rightShX + 14 * ws;
    var sleeveColor = klass.outfit === "robe" ? klass.primary : klass.outfit === "plate" ? klass.primary : skin;
    var armPath = function(shoulderX, handX){
      return 'M' + shoulderX + ' ' + (shoulderY + 2) +
             ' Q' + ((shoulderX + handX) / 2 - 4) + ' ' + (shoulderY + 22) + ' ' + handX + ' ' + handY +
             ' L' + (handX + 6) + ' ' + (handY - 2) +
             ' Q' + ((shoulderX + handX) / 2 + 2) + ' ' + (shoulderY + 18) + ' ' + (shoulderX + 4) + ' ' + (shoulderY + 4) +
             ' Z';
    };
    return '<g class="v86-arms">' +
      '<path d="' + armPath(leftShX, leftHandX) + '" fill="' + sleeveColor + '" stroke="#0B0814" stroke-width="1.4"/>' +
      '<path d="' + armPath(rightShX, rightHandX) + '" fill="' + sleeveColor + '" stroke="#0B0814" stroke-width="1.4"/>' +
      // hands (skin tone)
      '<circle cx="' + leftHandX + '" cy="' + handY + '" r="' + (5 * stocky) + '" fill="' + skin + '" stroke="#0B0814" stroke-width="1.4"/>' +
      '<circle cx="' + rightHandX + '" cy="' + handY + '" r="' + (5 * stocky) + '" fill="' + skin + '" stroke="#0B0814" stroke-width="1.4"/>' +
    '</g>';
  }

  /* ----- HEAD ----- */
  function v86HeadSvg(species, profile, skin, cy, rx, ry, cw){
    return '<g class="v86-head">' +
      '<ellipse cx="' + cw + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="' + skin + '" stroke="#0B0814" stroke-width="1.5"/>' +
      // forehead highlight
      '<path d="M' + (cw - rx * 0.6) + ' ' + (cy - ry * 0.3) + ' Q' + cw + ' ' + (cy - ry * 0.85) + ' ' + (cw + rx * 0.6) + ' ' + (cy - ry * 0.3) + ' Q' + cw + ' ' + (cy - ry * 0.45) + ' ' + (cw - rx * 0.6) + ' ' + (cy - ry * 0.3) + ' Z" fill="' + lighten(skin, 0.18) + '" opacity="0.5"/>' +
    '</g>';
  }

  function v86SpeciesFeaturesSvg(species, profile, skin, cy, rx, ry, cw){
    var out = "";
    var earY = cy + 2;
    var ear = species.earShape || "round";
    var trait = species.trait || "none";
    if (ear === "round"){
      out += '<ellipse cx="' + (cw - rx + 2) + '" cy="' + earY + '" rx="5" ry="7" fill="' + skin + '" stroke="#0B0814" stroke-width="1.2"/>';
      out += '<ellipse cx="' + (cw + rx - 2) + '" cy="' + earY + '" rx="5" ry="7" fill="' + skin + '" stroke="#0B0814" stroke-width="1.2"/>';
    } else if (ear === "pointed_long"){
      // Bigger, more dramatic elf-pointed ears
      out += '<path d="M' + (cw - rx - 2) + ' ' + (earY + 6) + ' L' + (cw - rx - 18) + ' ' + (earY - 18) + ' L' + (cw - rx + 5) + ' ' + (earY) + ' Z" fill="' + skin + '" stroke="#0B0814" stroke-width="1.3"/>';
      out += '<path d="M' + (cw + rx + 2) + ' ' + (earY + 6) + ' L' + (cw + rx + 18) + ' ' + (earY - 18) + ' L' + (cw + rx - 5) + ' ' + (earY) + ' Z" fill="' + skin + '" stroke="#0B0814" stroke-width="1.3"/>';
    } else if (ear === "pointed_back"){
      out += '<path d="M' + (cw - rx + 2) + ' ' + earY + ' L' + (cw - rx - 14) + ' ' + (earY + 6) + ' L' + (cw - rx + 2) + ' ' + (earY + 12) + ' Z" fill="' + skin + '" stroke="#0B0814" stroke-width="1.2"/>';
      out += '<path d="M' + (cw + rx - 2) + ' ' + earY + ' L' + (cw + rx + 14) + ' ' + (earY + 6) + ' L' + (cw + rx - 2) + ' ' + (earY + 12) + ' Z" fill="' + skin + '" stroke="#0B0814" stroke-width="1.2"/>';
    } else if (ear === "pointed_huge"){
      // Goblin: huge sweeping ears
      out += '<path d="M' + (cw - rx + 2) + ' ' + (earY - 4) + ' L' + (cw - rx - 24) + ' ' + (earY - 22) + ' L' + (cw - rx + 6) + ' ' + (earY + 4) + ' Z" fill="' + skin + '" stroke="#0B0814" stroke-width="1.3"/>';
      out += '<path d="M' + (cw + rx - 2) + ' ' + (earY - 4) + ' L' + (cw + rx + 24) + ' ' + (earY - 22) + ' L' + (cw + rx - 6) + ' ' + (earY + 4) + ' Z" fill="' + skin + '" stroke="#0B0814" stroke-width="1.3"/>';
    } else if (ear === "cat"){
      out += '<path d="M' + (cw - rx + 8) + ' ' + (cy - ry + 4) + ' L' + (cw - rx + 14) + ' ' + (cy - ry - 12) + ' L' + (cw - rx + 22) + ' ' + (cy - ry + 4) + ' Z" fill="' + skin + '" stroke="#0B0814" stroke-width="1.2"/>';
      out += '<path d="M' + (cw + rx - 22) + ' ' + (cy - ry + 4) + ' L' + (cw + rx - 14) + ' ' + (cy - ry - 12) + ' L' + (cw + rx - 8) + ' ' + (cy - ry + 4) + ' Z" fill="' + skin + '" stroke="#0B0814" stroke-width="1.2"/>';
      out += '<path d="M' + (cw - rx + 12) + ' ' + (cy - ry + 0) + ' L' + (cw - rx + 14) + ' ' + (cy - ry - 6) + ' L' + (cw - rx + 18) + ' ' + (cy - ry + 2) + ' Z" fill="' + darken(skin, 0.35) + '"/>';
      out += '<path d="M' + (cw + rx - 18) + ' ' + (cy - ry + 2) + ' L' + (cw + rx - 14) + ' ' + (cy - ry - 6) + ' L' + (cw + rx - 12) + ' ' + (cy - ry + 0) + ' Z" fill="' + darken(skin, 0.35) + '"/>';
    } else if (ear === "wolf"){
      out += '<path d="M' + (cw - rx + 4) + ' ' + (cy - ry + 4) + ' L' + (cw - rx + 8) + ' ' + (cy - ry - 16) + ' L' + (cw - rx + 18) + ' ' + (cy - ry + 6) + ' Z" fill="' + skin + '" stroke="#0B0814" stroke-width="1.2"/>';
      out += '<path d="M' + (cw + rx - 18) + ' ' + (cy - ry + 6) + ' L' + (cw + rx - 8) + ' ' + (cy - ry - 16) + ' L' + (cw + rx - 4) + ' ' + (cy - ry + 4) + ' Z" fill="' + skin + '" stroke="#0B0814" stroke-width="1.2"/>';
    } else if (ear === "frill"){
      // Lizard: spiky frill
      out += '<path d="M' + (cw - rx + 2) + ' ' + (cy - 6) + ' L' + (cw - rx - 10) + ' ' + (cy - 14) + ' L' + (cw - rx) + ' ' + (cy - 4) + ' L' + (cw - rx - 12) + ' ' + cy + ' L' + (cw - rx + 2) + ' ' + (cy + 6) + ' Z" fill="' + skin + '" stroke="#0B0814" stroke-width="1.2"/>';
      out += '<path d="M' + (cw + rx - 2) + ' ' + (cy - 6) + ' L' + (cw + rx + 10) + ' ' + (cy - 14) + ' L' + (cw + rx) + ' ' + (cy - 4) + ' L' + (cw + rx + 12) + ' ' + cy + ' L' + (cw + rx - 2) + ' ' + (cy + 6) + ' Z" fill="' + skin + '" stroke="#0B0814" stroke-width="1.2"/>';
    }
    // Horns - demon
    if (trait === "horns"){
      out += '<path d="M' + (cw - rx + 6) + ' ' + (cy - ry + 4) + ' Q' + (cw - rx + 2) + ' ' + (cy - ry - 18) + ' ' + (cw - rx + 16) + ' ' + (cy - ry - 24) + ' Q' + (cw - rx + 14) + ' ' + (cy - ry - 8) + ' ' + (cw - rx + 18) + ' ' + (cy - ry + 6) + ' Z" fill="#2A1010" stroke="#0B0814" stroke-width="1.3"/>';
      out += '<path d="M' + (cw + rx - 6) + ' ' + (cy - ry + 4) + ' Q' + (cw + rx - 2) + ' ' + (cy - ry - 18) + ' ' + (cw + rx - 16) + ' ' + (cy - ry - 24) + ' Q' + (cw + rx - 14) + ' ' + (cy - ry - 8) + ' ' + (cw + rx - 18) + ' ' + (cy - ry + 6) + ' Z" fill="#2A1010" stroke="#0B0814" stroke-width="1.3"/>';
    }
    // Tusks - orc
    if (trait === "tusks"){
      out += '<path d="M' + (cw - 9) + ' ' + (cy + ry - 8) + ' L' + (cw - 11) + ' ' + (cy + ry + 4) + ' L' + (cw - 6) + ' ' + (cy + ry + 4) + ' Z" fill="#F2EAD0" stroke="#0B0814" stroke-width="0.9"/>';
      out += '<path d="M' + (cw + 9) + ' ' + (cy + ry - 8) + ' L' + (cw + 11) + ' ' + (cy + ry + 4) + ' L' + (cw + 6) + ' ' + (cy + ry + 4) + ' Z" fill="#F2EAD0" stroke="#0B0814" stroke-width="0.9"/>';
    }
    // Snaggle tooth - goblin
    if (trait === "snaggle"){
      out += '<path d="M' + (cw + 1) + ' ' + (cy + ry - 6) + ' L' + cw + ' ' + (cy + ry + 2) + ' L' + (cw + 4) + ' ' + (cy + ry - 2) + ' Z" fill="#F2EAD0" stroke="#0B0814" stroke-width="0.8"/>';
    }
    // Beard - dwarf
    if (trait === "beard"){
      out += '<path d="M' + (cw - rx + 8) + ' ' + (cy + ry - 4) + ' Q' + cw + ' ' + (cy + ry + 30) + ' ' + (cw + rx - 8) + ' ' + (cy + ry - 4) + ' Q' + (cw + rx - 14) + ' ' + (cy + ry + 18) + ' ' + cw + ' ' + (cy + ry + 22) + ' Q' + (cw - rx + 14) + ' ' + (cy + ry + 18) + ' ' + (cw - rx + 8) + ' ' + (cy + ry - 4) + ' Z" fill="' + darken(skin, 0.55) + '" stroke="#0B0814" stroke-width="1.3"/>';
    }
    // Muzzles
    if (trait === "muzzle_cat"){
      out += '<ellipse cx="' + cw + '" cy="' + (cy + ry * 0.42) + '" rx="11" ry="7" fill="' + lighten(skin, 0.12) + '" stroke="#0B0814" stroke-width="1.1"/>';
      out += '<path d="M' + (cw - 3) + ' ' + (cy + ry * 0.42 + 2) + ' L' + cw + ' ' + (cy + ry * 0.42 + 7) + ' L' + (cw + 3) + ' ' + (cy + ry * 0.42 + 2) + ' Z" fill="#2A1A12"/>';
      out += '<line x1="' + (cw - 22) + '" y1="' + (cy + ry * 0.42 + 1) + '" x2="' + (cw - 9) + '" y2="' + (cy + ry * 0.42 + 2) + '" stroke="#000" stroke-width="0.7"/>';
      out += '<line x1="' + (cw - 22) + '" y1="' + (cy + ry * 0.42 + 5) + '" x2="' + (cw - 9) + '" y2="' + (cy + ry * 0.42 + 4) + '" stroke="#000" stroke-width="0.7"/>';
      out += '<line x1="' + (cw + 9) + '" y1="' + (cy + ry * 0.42 + 2) + '" x2="' + (cw + 22) + '" y2="' + (cy + ry * 0.42 + 1) + '" stroke="#000" stroke-width="0.7"/>';
      out += '<line x1="' + (cw + 9) + '" y1="' + (cy + ry * 0.42 + 4) + '" x2="' + (cw + 22) + '" y2="' + (cy + ry * 0.42 + 5) + '" stroke="#000" stroke-width="0.7"/>';
    }
    if (trait === "muzzle_wolf"){
      out += '<path d="M' + (cw - 13) + ' ' + (cy + ry * 0.32) + ' Q' + cw + ' ' + (cy + ry * 0.22) + ' ' + (cw + 13) + ' ' + (cy + ry * 0.32) + ' L' + (cw + 10) + ' ' + (cy + ry * 0.6) + ' Q' + cw + ' ' + (cy + ry * 0.66) + ' ' + (cw - 10) + ' ' + (cy + ry * 0.6) + ' Z" fill="' + lighten(skin, 0.1) + '" stroke="#0B0814" stroke-width="1.1"/>';
      out += '<ellipse cx="' + cw + '" cy="' + (cy + ry * 0.32) + '" rx="4" ry="3" fill="#1A1410"/>';
    }
    if (trait === "snout_lizard"){
      out += '<path d="M' + (cw - 10) + ' ' + (cy + ry * 0.32) + ' Q' + cw + ' ' + (cy + ry * 0.18) + ' ' + (cw + 10) + ' ' + (cy + ry * 0.32) + ' L' + (cw + 8) + ' ' + (cy + ry * 0.55) + ' Q' + cw + ' ' + (cy + ry * 0.62) + ' ' + (cw - 8) + ' ' + (cy + ry * 0.55) + ' Z" fill="' + lighten(skin, 0.12) + '" stroke="#0B0814" stroke-width="1.1"/>';
      out += '<circle cx="' + (cw - 4) + '" cy="' + (cy + ry * 0.32) + '" r="1.5" fill="#000"/>';
      out += '<circle cx="' + (cw + 4) + '" cy="' + (cy + ry * 0.32) + '" r="1.5" fill="#000"/>';
    }
    return out;
  }

  function v86FaceSvg(species, profile, skin, eyeColor, faceFx, cy, rx, ry, cw){
    var trait = species.trait || "none";
    if (trait === "snout_lizard" || trait === "muzzle_wolf") return "";
    var eyeY = cy - ry * 0.08;
    var eyeOffX = rx * 0.45;
    var out = "";
    // Eyes
    out += '<ellipse cx="' + (cw - eyeOffX) + '" cy="' + eyeY + '" rx="5" ry="3.5" fill="#FFF" stroke="#0B0814" stroke-width="1"/>';
    out += '<ellipse cx="' + (cw + eyeOffX) + '" cy="' + eyeY + '" rx="5" ry="3.5" fill="#FFF" stroke="#0B0814" stroke-width="1"/>';
    out += '<circle cx="' + (cw - eyeOffX) + '" cy="' + (eyeY + 0.5) + '" r="2.5" fill="' + eyeColor + '"/>';
    out += '<circle cx="' + (cw + eyeOffX) + '" cy="' + (eyeY + 0.5) + '" r="2.5" fill="' + eyeColor + '"/>';
    out += '<circle cx="' + (cw - eyeOffX) + '" cy="' + (eyeY - 0.5) + '" r="1" fill="#000"/>';
    out += '<circle cx="' + (cw + eyeOffX) + '" cy="' + (eyeY - 0.5) + '" r="1" fill="#000"/>';
    // Sunken (undead)
    if (trait === "sunken"){
      out += '<path d="M' + (cw - eyeOffX - 7) + ' ' + (eyeY - 2) + ' Q' + (cw - eyeOffX) + ' ' + (eyeY + 4) + ' ' + (cw - eyeOffX + 7) + ' ' + (eyeY - 2) + '" stroke="#1F1F2A" stroke-width="2.4" fill="none" opacity="0.7"/>';
      out += '<path d="M' + (cw + eyeOffX - 7) + ' ' + (eyeY - 2) + ' Q' + (cw + eyeOffX) + ' ' + (eyeY + 4) + ' ' + (cw + eyeOffX + 7) + ' ' + (eyeY - 2) + '" stroke="#1F1F2A" stroke-width="2.4" fill="none" opacity="0.7"/>';
    }
    // Brows
    out += '<path d="M' + (cw - eyeOffX - 7) + ' ' + (eyeY - 7) + ' Q' + (cw - eyeOffX) + ' ' + (eyeY - 9) + ' ' + (cw - eyeOffX + 7) + ' ' + (eyeY - 7) + '" stroke="#1A1410" stroke-width="2" fill="none"/>';
    out += '<path d="M' + (cw + eyeOffX - 7) + ' ' + (eyeY - 7) + ' Q' + (cw + eyeOffX) + ' ' + (eyeY - 9) + ' ' + (cw + eyeOffX + 7) + ' ' + (eyeY - 7) + '" stroke="#1A1410" stroke-width="2" fill="none"/>';
    // Mouth
    if (trait !== "muzzle_cat"){
      var mouthY = cy + ry * 0.45;
      if (faceFx === "smile"){
        out += '<path d="M' + (cw - 7) + ' ' + mouthY + ' Q' + cw + ' ' + (mouthY + 5) + ' ' + (cw + 7) + ' ' + mouthY + '" stroke="#3A1F1F" stroke-width="1.4" fill="none"/>';
      } else if (faceFx === "warpaint"){
        out += '<path d="M' + (cw - eyeOffX - 7) + ' ' + (cy + 4) + ' L' + (cw - eyeOffX - 1) + ' ' + (cy + 16) + '" stroke="#A23B3B" stroke-width="2" opacity="0.85"/>';
        out += '<path d="M' + (cw + eyeOffX + 7) + ' ' + (cy + 4) + ' L' + (cw + eyeOffX + 1) + ' ' + (cy + 16) + '" stroke="#A23B3B" stroke-width="2" opacity="0.85"/>';
        out += '<line x1="' + (cw - 6) + '" y1="' + mouthY + '" x2="' + (cw + 6) + '" y2="' + mouthY + '" stroke="#3A1F1F" stroke-width="1.4"/>';
      } else if (faceFx === "scar"){
        out += '<path d="M' + (cw - 3) + ' ' + (cy - ry * 0.2) + ' L' + (cw + 2) + ' ' + (cy + 4) + '" stroke="#7A2F2F" stroke-width="1.2"/>';
        out += '<line x1="' + (cw - 6) + '" y1="' + mouthY + '" x2="' + (cw + 6) + '" y2="' + mouthY + '" stroke="#3A1F1F" stroke-width="1.4"/>';
      } else {
        out += '<line x1="' + (cw - 6) + '" y1="' + mouthY + '" x2="' + (cw + 6) + '" y2="' + mouthY + '" stroke="#3A1F1F" stroke-width="1.4"/>';
      }
    }
    return out;
  }

  function v86HairSvg(style, color, species, profile, cy, rx, ry, cw){
    if (style === "bald") return "";
    var topY = cy - ry * 0.92;
    var sideY = cy - ry * 0.3;
    var hairCovers = function(){
      return '<path d="M' + (cw - rx + 2) + ' ' + sideY + ' Q' + cw + ' ' + (topY - 4) + ' ' + (cw + rx - 2) + ' ' + sideY + ' Q' + (cw + rx - 2) + ' ' + (cy - ry * 0.05) + ' ' + (cw + rx - 8) + ' ' + (cy - ry * 0.15) + ' Q' + cw + ' ' + (cy - ry * 0.55) + ' ' + (cw - rx + 8) + ' ' + (cy - ry * 0.15) + ' Q' + (cw - rx + 2) + ' ' + (cy - ry * 0.05) + ' ' + (cw - rx + 2) + ' ' + sideY + ' Z" fill="' + color + '" stroke="#0B0814" stroke-width="1.2"/>';
    };
    switch(style){
      case "buzz":
        return '<g class="v86-hair"><path d="M' + (cw - rx + 4) + ' ' + (cy - ry * 0.55) + ' Q' + cw + ' ' + (topY) + ' ' + (cw + rx - 4) + ' ' + (cy - ry * 0.55) + ' L' + (cw + rx - 6) + ' ' + (cy - ry * 0.35) + ' Q' + cw + ' ' + (cy - ry * 0.55) + ' ' + (cw - rx + 6) + ' ' + (cy - ry * 0.35) + ' Z" fill="' + color + '" stroke="#0B0814" stroke-width="1.2"/></g>';
      case "ponytail":
        return '<g class="v86-hair">' + hairCovers() +
          '<path d="M' + (cw + rx - 2) + ' ' + (sideY + 6) + ' Q' + (cw + rx + 18) + ' ' + (cy + 20) + ' ' + (cw + rx + 4) + ' ' + (cy + 50) + ' L' + (cw + rx - 4) + ' ' + (cy + 46) + ' Q' + (cw + rx + 6) + ' ' + (cy + 16) + ' ' + (cw + rx - 8) + ' ' + sideY + ' Z" fill="' + color + '" stroke="#0B0814" stroke-width="1.2"/>' +
          '</g>';
      case "long_straight":
        return '<g class="v86-hair">' + hairCovers() +
          '<path d="M' + (cw - rx) + ' ' + (cy - ry * 0.05) + ' L' + (cw - rx - 4) + ' ' + (cy + ry + 14) + ' L' + (cw - rx + 6) + ' ' + (cy + ry + 14) + ' L' + (cw - rx + 8) + ' ' + (cy + ry * 0.2) + ' Z" fill="' + color + '" stroke="#0B0814" stroke-width="1.2"/>' +
          '<path d="M' + (cw + rx) + ' ' + (cy - ry * 0.05) + ' L' + (cw + rx + 4) + ' ' + (cy + ry + 14) + ' L' + (cw + rx - 6) + ' ' + (cy + ry + 14) + ' L' + (cw + rx - 8) + ' ' + (cy + ry * 0.2) + ' Z" fill="' + color + '" stroke="#0B0814" stroke-width="1.2"/>' +
          '</g>';
      case "long_curly":
        return '<g class="v86-hair">' + hairCovers() +
          '<g fill="' + color + '" stroke="#0B0814" stroke-width="1">' +
            '<circle cx="' + (cw - rx + 2) + '" cy="' + (cy + ry * 0.4) + '" r="9"/>' +
            '<circle cx="' + (cw - rx + 6) + '" cy="' + (cy + ry + 4) + '" r="9"/>' +
            '<circle cx="' + (cw + rx - 2) + '" cy="' + (cy + ry * 0.4) + '" r="9"/>' +
            '<circle cx="' + (cw + rx - 6) + '" cy="' + (cy + ry + 4) + '" r="9"/>' +
          '</g>' +
          '</g>';
      case "braids":
        return '<g class="v86-hair">' + hairCovers() +
          '<path d="M' + (cw - rx + 2) + ' ' + (cy + 6) + ' Q' + (cw - rx - 4) + ' ' + (cy + 30) + ' ' + (cw - rx + 2) + ' ' + (cy + ry + 8) + ' L' + (cw - rx + 8) + ' ' + (cy + ry + 8) + ' Q' + (cw - rx + 2) + ' ' + (cy + 30) + ' ' + (cw - rx + 8) + ' ' + (cy + 6) + ' Z" fill="' + color + '" stroke="#0B0814" stroke-width="1.2"/>' +
          '<path d="M' + (cw + rx - 2) + ' ' + (cy + 6) + ' Q' + (cw + rx + 4) + ' ' + (cy + 30) + ' ' + (cw + rx - 2) + ' ' + (cy + ry + 8) + ' L' + (cw + rx - 8) + ' ' + (cy + ry + 8) + ' Q' + (cw + rx - 2) + ' ' + (cy + 30) + ' ' + (cw + rx - 8) + ' ' + (cy + 6) + ' Z" fill="' + color + '" stroke="#0B0814" stroke-width="1.2"/>' +
          '</g>';
      case "mohawk":
        return '<g class="v86-hair"><path d="M' + (cw - 8) + ' ' + (cy - ry * 0.4) + ' Q' + cw + ' ' + (topY - 16) + ' ' + (cw + 8) + ' ' + (cy - ry * 0.4) + ' L' + (cw + 6) + ' ' + (cy - ry * 0.3) + ' Q' + cw + ' ' + (cy - ry * 0.7) + ' ' + (cw - 6) + ' ' + (cy - ry * 0.3) + ' Z" fill="' + color + '" stroke="#0B0814" stroke-width="1.2"/></g>';
      case "spiked":
        return '<g class="v86-hair">' + hairCovers() +
          '<g fill="' + color + '" stroke="#0B0814" stroke-width="1.2">' +
            '<path d="M' + (cw - 12) + ' ' + (cy - ry * 0.55) + ' L' + (cw - 14) + ' ' + (topY - 12) + ' L' + (cw - 4) + ' ' + (cy - ry * 0.6) + ' Z"/>' +
            '<path d="M' + cw + ' ' + (cy - ry * 0.65) + ' L' + cw + ' ' + (topY - 16) + ' L' + (cw + 8) + ' ' + (cy - ry * 0.6) + ' Z"/>' +
            '<path d="M' + (cw + 12) + ' ' + (cy - ry * 0.55) + ' L' + (cw + 14) + ' ' + (topY - 12) + ' L' + (cw + 4) + ' ' + (cy - ry * 0.65) + ' Z"/>' +
          '</g></g>';
      case "wavy":
      case "curly":
      case "crop":
      case "topknot":
      case "dreadlocks":
      case "short":
      default:
        return '<g class="v86-hair">' + hairCovers() + '</g>';
    }
  }

  function v86HelmSvg(overlay, klass, cy, rx, ry, cw){
    if (overlay.helm === "halo"){
      // Cleric halo
      return '<g class="v86-helm"><ellipse cx="' + cw + '" cy="' + (cy - ry - 4) + '" rx="' + (rx + 8) + '" ry="6" fill="none" stroke="' + klass.secondary + '" stroke-width="2.5" opacity="0.85"/></g>';
    } else if (overlay.helm === "plumed"){
      // Knight plumed helm — partial visor
      return '<g class="v86-helm"><path d="M' + (cw - rx + 4) + ' ' + (cy - ry * 0.5) + ' Q' + cw + ' ' + (cy - ry * 1.1) + ' ' + (cw + rx - 4) + ' ' + (cy - ry * 0.5) + ' L' + (cw + rx - 8) + ' ' + (cy - ry * 0.2) + ' L' + (cw - rx + 8) + ' ' + (cy - ry * 0.2) + ' Z" fill="' + klass.primary + '" stroke="#0B0814" stroke-width="1.4" opacity="0.85"/>' +
      // plume
      '<path d="M' + cw + ' ' + (cy - ry - 4) + ' Q' + (cw + 16) + ' ' + (cy - ry - 24) + ' ' + (cw + 8) + ' ' + (cy - ry - 4) + ' Z" fill="' + klass.secondary + '"/></g>';
    } else if (overlay.helm === "antlers"){
      // Druid antlers
      return '<g class="v86-helm">' +
        '<path d="M' + (cw - 8) + ' ' + (cy - ry + 2) + ' L' + (cw - 14) + ' ' + (cy - ry - 22) + ' M' + (cw - 14) + ' ' + (cy - ry - 16) + ' L' + (cw - 20) + ' ' + (cy - ry - 22) + ' M' + (cw - 14) + ' ' + (cy - ry - 10) + ' L' + (cw - 22) + ' ' + (cy - ry - 14) + '" stroke="' + klass.secondary + '" stroke-width="2.5" fill="none"/>' +
        '<path d="M' + (cw + 8) + ' ' + (cy - ry + 2) + ' L' + (cw + 14) + ' ' + (cy - ry - 22) + ' M' + (cw + 14) + ' ' + (cy - ry - 16) + ' L' + (cw + 20) + ' ' + (cy - ry - 22) + ' M' + (cw + 14) + ' ' + (cy - ry - 10) + ' L' + (cw + 22) + ' ' + (cy - ry - 14) + '" stroke="' + klass.secondary + '" stroke-width="2.5" fill="none"/>' +
        '</g>';
    } else if (overlay.helm === "hood"){
      // Rogue/Mage hood
      return '<g class="v86-helm"><path d="M' + (cw - rx - 4) + ' ' + (cy - ry * 0.2) + ' Q' + cw + ' ' + (cy - ry - 12) + ' ' + (cw + rx + 4) + ' ' + (cy - ry * 0.2) + ' L' + (cw + rx) + ' ' + (cy + ry * 0.1) + ' Q' + cw + ' ' + (cy - ry * 0.5) + ' ' + (cw - rx) + ' ' + (cy + ry * 0.1) + ' Z" fill="' + darken(klass.primary, 0.35) + '" stroke="#0B0814" stroke-width="1.4" opacity="0.92"/></g>';
    } else if (overlay.helm === "goggles"){
      return '<g class="v86-helm"><circle cx="' + (cw - rx * 0.38) + '" cy="' + (cy - ry * 0.05) + '" r="6" fill="none" stroke="' + klass.secondary + '" stroke-width="2.2"/>' +
        '<circle cx="' + (cw + rx * 0.38) + '" cy="' + (cy - ry * 0.05) + '" r="6" fill="none" stroke="' + klass.secondary + '" stroke-width="2.2"/>' +
        '<path d="M' + (cw - rx * 0.18) + ' ' + (cy - ry * 0.05) + ' H' + (cw + rx * 0.18) + '" stroke="' + klass.secondary + '" stroke-width="2"/>' +
        '<path d="M' + (cw - rx - 2) + ' ' + (cy - ry * 0.12) + ' Q' + cw + ' ' + (cy - ry * 0.55) + ' ' + (cw + rx + 2) + ' ' + (cy - ry * 0.12) + '" fill="none" stroke="#0B0814" stroke-width="1.4"/></g>';
    } else if (overlay.helm === "feather"){
      // Bard feathered cap
      return '<g class="v86-helm"><path d="M' + (cw - rx + 4) + ' ' + (cy - ry * 0.45) + ' Q' + cw + ' ' + (cy - ry - 6) + ' ' + (cw + rx - 4) + ' ' + (cy - ry * 0.45) + ' L' + (cw + rx - 6) + ' ' + (cy - ry * 0.15) + ' L' + (cw - rx + 6) + ' ' + (cy - ry * 0.15) + ' Z" fill="' + klass.primary + '" stroke="#0B0814" stroke-width="1.3"/>' +
        '<path d="M' + (cw + rx - 6) + ' ' + (cy - ry * 0.45) + ' Q' + (cw + rx + 10) + ' ' + (cy - ry - 20) + ' ' + (cw + rx + 14) + ' ' + (cy - ry * 0.3) + ' Q' + (cw + rx + 4) + ' ' + (cy - ry - 8) + ' ' + (cw + rx - 6) + ' ' + (cy - ry * 0.45) + ' Z" fill="' + klass.secondary + '" stroke="#0B0814" stroke-width="1.1"/>' +
        '</g>';
    }
    return "";
  }

  function v86WeaponSvg(klass, overlay, shoulderY, ws, hs, cw){
    // Right-hand weapon position
    var rhX = cw + 28 * ws;
    var hY = shoulderY + 22 * hs;
    switch (overlay.weaponName){
      case "greatsword":
        return '<g class="v86-weapon"><path d="M' + (rhX - 2) + ' ' + (hY - 60) + ' L' + (rhX + 2) + ' ' + (hY - 60) + ' L' + (rhX + 3) + ' ' + hY + ' L' + (rhX - 3) + ' ' + hY + ' Z" fill="#D6DAE3" stroke="#0B0814" stroke-width="1.5"/>' +
          '<rect x="' + (rhX - 8) + '" y="' + hY + '" width="16" height="4" fill="' + klass.secondary + '" stroke="#0B0814" stroke-width="1.2"/>' +
          '<rect x="' + (rhX - 1.5) + '" y="' + (hY + 4) + '" width="3" height="14" fill="#3A2410" stroke="#0B0814" stroke-width="1"/></g>';
      case "crystal_staff":
        return '<g class="v86-weapon"><line x1="' + rhX + '" y1="' + (hY - 4) + '" x2="' + rhX + '" y2="' + (hY + 60) + '" stroke="#5C3A1B" stroke-width="3.5"/>' +
          '<polygon points="' + rhX + ',' + (hY - 22) + ' ' + (rhX + 8) + ',' + (hY - 8) + ' ' + rhX + ',' + (hY + 4) + ' ' + (rhX - 8) + ',' + (hY - 8) + '" fill="' + klass.secondary + '" stroke="#0B0814" stroke-width="1.2"/>' +
          '<polygon points="' + rhX + ',' + (hY - 18) + ' ' + (rhX + 5) + ',' + (hY - 8) + ' ' + rhX + ',' + (hY) + ' ' + (rhX - 5) + ',' + (hY - 8) + '" fill="#FFFFFF" opacity="0.5"/></g>';
      case "twin_daggers":
        return '<g class="v86-weapon"><path d="M' + (rhX - 1) + ' ' + hY + ' L' + (rhX + 1) + ' ' + hY + ' L' + (rhX + 2) + ' ' + (hY + 22) + ' L' + (rhX - 2) + ' ' + (hY + 22) + ' Z" fill="#D6DAE3" stroke="#0B0814" stroke-width="1.2"/>' +
          '<rect x="' + (rhX - 5) + '" y="' + (hY + 22) + '" width="10" height="3" fill="#3A2410"/>' +
          '<path d="M' + (cw - 28 * ws - 1) + ' ' + hY + ' L' + (cw - 28 * ws + 1) + ' ' + hY + ' L' + (cw - 28 * ws + 2) + ' ' + (hY + 22) + ' L' + (cw - 28 * ws - 2) + ' ' + (hY + 22) + ' Z" fill="#D6DAE3" stroke="#0B0814" stroke-width="1.2"/>' +
          '<rect x="' + (cw - 28 * ws - 5) + '" y="' + (hY + 22) + '" width="10" height="3" fill="#3A2410"/></g>';
      case "longbow":
        return '<g class="v86-weapon"><path d="M' + (cw - 30 * ws) + ' ' + (shoulderY - 14) + ' Q' + (cw - 42 * ws) + ' ' + (shoulderY + 32) + ' ' + (cw - 30 * ws) + ' ' + (shoulderY + 78) + '" stroke="#5C3A1B" stroke-width="3.5" fill="none"/>' +
          '<line x1="' + (cw - 30 * ws) + '" y1="' + (shoulderY - 14) + '" x2="' + (cw - 30 * ws) + '" y2="' + (shoulderY + 78) + '" stroke="#D6DAE3" stroke-width="1" stroke-dasharray="3 2"/></g>';
      case "holy_mace":
        return '<g class="v86-weapon"><line x1="' + rhX + '" y1="' + (hY - 4) + '" x2="' + rhX + '" y2="' + (hY + 60) + '" stroke="#5C3A1B" stroke-width="3.5"/>' +
          '<circle cx="' + rhX + '" cy="' + (hY - 14) + '" r="9" fill="' + klass.secondary + '" stroke="#0B0814" stroke-width="1.4"/>' +
          '<path d="M' + (rhX - 6) + ' ' + (hY - 20) + ' L' + (rhX + 6) + ' ' + (hY - 20) + ' M' + (rhX - 6) + ' ' + (hY - 8) + ' L' + (rhX + 6) + ' ' + (hY - 8) + ' M' + rhX + ' ' + (hY - 22) + ' L' + rhX + ' ' + (hY - 6) + '" stroke="' + darken(klass.secondary, 0.4) + '" stroke-width="1"/></g>';
      case "lute":
        return '<g class="v86-weapon"><ellipse cx="' + (cw - 32 * ws) + '" cy="' + (shoulderY + 56) + '" rx="14" ry="11" fill="#A2774A" stroke="#0B0814" stroke-width="1.3"/>' +
          '<rect x="' + (cw - 33 * ws) + '" y="' + (shoulderY + 24) + '" width="2" height="32" fill="#5C3A1B"/></g>';
      case "nature_staff":
        return '<g class="v86-weapon"><line x1="' + rhX + '" y1="' + (hY - 4) + '" x2="' + rhX + '" y2="' + (hY + 64) + '" stroke="#5C3A1B" stroke-width="3.5"/>' +
          '<path d="M' + (rhX - 8) + ' ' + (hY - 8) + ' Q' + rhX + ' ' + (hY - 24) + ' ' + (rhX + 8) + ' ' + (hY - 8) + ' M' + rhX + ' ' + (hY - 22) + ' L' + rhX + ' ' + (hY - 8) + '" stroke="' + klass.secondary + '" stroke-width="2" fill="none"/>' +
          '<path d="M' + (rhX - 4) + ' ' + (hY - 14) + ' Q' + (rhX - 8) + ' ' + (hY - 20) + ' ' + (rhX - 4) + ' ' + (hY - 22) + ' Q' + rhX + ' ' + (hY - 18) + ' ' + (rhX - 4) + ' ' + (hY - 14) + ' Z" fill="' + klass.secondary + '"/></g>';
      case "sword_shield":
        return '<g class="v86-weapon">' +
          '<rect x="' + (rhX - 1.5) + '" y="' + (hY - 40) + '" width="3" height="48" fill="#D6DAE3" stroke="#0B0814" stroke-width="1.2"/>' +
          '<rect x="' + (rhX - 6) + '" y="' + (hY + 8) + '" width="12" height="3" fill="' + klass.secondary + '"/>' +
          '<rect x="' + (rhX - 1) + '" y="' + (hY + 11) + '" width="2" height="9" fill="#3A2410"/>' +
          // Shield in left hand
          '<path d="M' + (cw - 28 * ws - 8) + ' ' + (shoulderY + 14) + ' L' + (cw - 28 * ws + 8) + ' ' + (shoulderY + 14) + ' L' + (cw - 28 * ws + 6) + ' ' + (shoulderY + 38) + ' L' + (cw - 28 * ws) + ' ' + (shoulderY + 48) + ' L' + (cw - 28 * ws - 6) + ' ' + (shoulderY + 38) + ' Z" fill="' + klass.primary + '" stroke="#0B0814" stroke-width="1.5"/>' +
          '<circle cx="' + (cw - 28 * ws) + '" cy="' + (shoulderY + 28) + '" r="4" fill="' + klass.secondary + '"/></g>';
      case "focus_wraps":
        return '<g class="v86-weapon"><circle cx="' + rhX + '" cy="' + (hY + 16) + '" r="8" fill="' + klass.secondary + '" stroke="#0B0814" stroke-width="1.2"/>' +
          '<circle cx="' + (cw - 28 * ws) + '" cy="' + (hY + 18) + '" r="8" fill="' + klass.secondary + '" stroke="#0B0814" stroke-width="1.2"/>' +
          '<path d="M' + (rhX - 9) + ' ' + (hY + 16) + ' H' + (rhX + 9) + ' M' + (cw - 28 * ws - 9) + ' ' + (hY + 18) + ' H' + (cw - 28 * ws + 9) + '" stroke="#fff" stroke-width="1.4" opacity=".6"/></g>';
      case "catalyst_flask":
        return '<g class="v86-weapon"><line x1="' + rhX + '" y1="' + (hY - 2) + '" x2="' + rhX + '" y2="' + (hY + 40) + '" stroke="#5C3A1B" stroke-width="3"/>' +
          '<path d="M' + (rhX - 9) + ' ' + (hY + 34) + ' L' + (rhX + 9) + ' ' + (hY + 34) + ' L' + (rhX + 13) + ' ' + (hY + 50) + ' Q' + rhX + ' ' + (hY + 60) + ' ' + (rhX - 13) + ' ' + (hY + 50) + ' Z" fill="' + klass.secondary + '" stroke="#0B0814" stroke-width="1.3"/>' +
          '<circle cx="' + (rhX + 2) + '" cy="' + (hY + 46) + '" r="4" fill="#fff" opacity=".55"/></g>';
      case "tower_shield":
        return '<g class="v86-weapon"><path d="M' + (cw - 30 * ws - 12) + ' ' + (shoulderY + 6) + ' H' + (cw - 30 * ws + 12) + ' V' + (shoulderY + 52) + ' Q' + (cw - 30 * ws) + ' ' + (shoulderY + 68) + ' ' + (cw - 30 * ws - 12) + ' ' + (shoulderY + 52) + ' Z" fill="' + klass.primary + '" stroke="#0B0814" stroke-width="1.6"/>' +
          '<path d="M' + (cw - 30 * ws) + ' ' + (shoulderY + 10) + ' V' + (shoulderY + 56) + ' M' + (cw - 30 * ws - 8) + ' ' + (shoulderY + 28) + ' H' + (cw - 30 * ws + 8) + '" stroke="' + klass.secondary + '" stroke-width="2"/>' +
          '<rect x="' + (rhX - 1.5) + '" y="' + (hY - 36) + '" width="3" height="52" fill="#D6DAE3" stroke="#0B0814" stroke-width="1.1"/></g>';
      case "eclipse_sickle":
        return '<g class="v86-weapon"><line x1="' + rhX + '" y1="' + (hY - 2) + '" x2="' + rhX + '" y2="' + (hY + 52) + '" stroke="#3A2410" stroke-width="3.2"/>' +
          '<path d="M' + rhX + ' ' + (hY - 12) + ' Q' + (rhX + 24) + ' ' + (hY - 12) + ' ' + (rhX + 17) + ' ' + (hY + 10) + ' Q' + (rhX + 9) + ' ' + (hY - 2) + ' ' + rhX + ' ' + (hY - 2) + ' Z" fill="#D6DAE3" stroke="#0B0814" stroke-width="1.4"/>' +
          '<circle cx="' + (rhX + 10) + '" cy="' + (hY - 2) + '" r="3" fill="' + klass.secondary + '"/></g>';
      default:
        return "";
    }
  }

  function v86EmblemSvg(klass, shoulderY, waistY, cw){
    var midY = (shoulderY + waistY) / 2 + 4;
    var s = klass.secondary || "#F6CB6E";
    return '<g class="v86-emblem"><circle cx="' + cw + '" cy="' + midY + '" r="8" fill="#0E1325" stroke="' + s + '" stroke-width="1.5"/><circle cx="' + cw + '" cy="' + midY + '" r="4" fill="' + s + '" opacity="0.85"/></g>';
  }

  /* ===========================================================
   * OVERRIDE pixelAvatarSvg (Hero card avatar) AND
   * characterPortraitSvg (modal preview) to use v86.
   * =========================================================== */
  function v86InstallOverrides(){
    var tries = 0;
    var doInstall = function(){
      tries++;
      if (typeof window.pixelAvatarSvg !== "function" || typeof window.characterPortraitSvg !== "function"){
        if (tries < 80) setTimeout(doInstall, 120);
        return;
      }
      if (window.pixelAvatarSvg._v86) return;
      var origPixel = window.pixelAvatarSvg;
      window.pixelAvatarSvg = function(clsName, action, scene, p, eq){
        try {
          var a = (window.state && window.state.hero && window.state.hero.appearance) || {};
          return v86CharacterSvg(a, { scene: scene, running: !!(window.state && window.state.timer && window.state.timer.running) });
        } catch(e){
          console.warn("v86 pixelAvatar override threw:", e);
          return origPixel.apply(this, arguments);
        }
      };
      window.pixelAvatarSvg._v86 = true;
      var origPortrait = window.characterPortraitSvg;
      window.characterPortraitSvg = function(palette, eq){
        try {
          var a = (window.state && window.state.hero && window.state.hero.appearance) || {};
          return v86CharacterSvg(a, { scene: "resting", running: false });
        } catch(e){
          console.warn("v86 portrait override threw:", e);
          return origPortrait.apply(this, arguments);
        }
      };
      window.characterPortraitSvg._v86 = true;

      // Force a re-render so the Hero card immediately reflects the new avatar
      try {
        if (typeof window.renderAvatar === "function") window.renderAvatar();
        if (typeof window.renderCharacterPanel === "function") window.renderCharacterPanel();
      } catch(_){}

      // Also wire setHeroAppearance to re-render the Hero card avatar
      if (typeof window.setHeroAppearance === "function" && !window.setHeroAppearance._v86){
        var origSetApp = window.setHeroAppearance;
        window.setHeroAppearance = function(group, value){
          var r = origSetApp.apply(this, arguments);
          // Mirror race -> species and cls -> classKey for v8.4 compat
          if (window.state && window.state.hero && window.state.hero.appearance){
            if (group === "race") window.state.hero.appearance.species = value;
          }
          try { if (typeof window.renderAvatar === "function") window.renderAvatar(); } catch(_){}
          return r;
        };
        window.setHeroAppearance._v86 = true;
      }
    };
    doInstall();
  }

  /* Public boot */
  function v86Boot(){
    v86InstallOverrides();
  }

  if (typeof document !== "undefined"){
    if (document.readyState === "loading"){
      document.addEventListener("DOMContentLoaded", v86Boot, { once: true });
    } else {
      setTimeout(v86Boot, 0);
    }
  }

  window.v86CharacterSvg = v86CharacterSvg;
  window.V86_SPECIES_PROFILES = V86_SPECIES_PROFILES;
  window.V86_CLASS_OVERLAYS = V86_CLASS_OVERLAYS;

  window.__v86SmokeTests = function(){
    var results = [];
    var add = function(name, ok, msg){ results.push({name:name, ok:!!ok, msg:msg||""}); };
    add("species profiles: 11 species defined", Object.keys(V86_SPECIES_PROFILES).length === 11);
    add("species: dwarf is short and stocky", V86_SPECIES_PROFILES.dwarf.heightScale < 0.8 && V86_SPECIES_PROFILES.dwarf.stockiness > 1.3);
    add("species: orc is tall and bulky", V86_SPECIES_PROFILES.orc.heightScale > 1.1 && V86_SPECIES_PROFILES.orc.widthScale > 1.2);
    add("species: goblin is small", V86_SPECIES_PROFILES.goblin.heightScale < 0.65);
    add("species: elf is slender", V86_SPECIES_PROFILES.elf.heightScale > 1.05 && V86_SPECIES_PROFILES.elf.stockiness < 0.9);
    add("class overlays: 12 classes", Object.keys(V86_CLASS_OVERLAYS).length === 12);
    add("class: warrior has shield + greatsword", V86_CLASS_OVERLAYS.warrior.shield === true && V86_CLASS_OVERLAYS.warrior.weaponName === "greatsword");
    add("class: mage has crystal staff + hood", V86_CLASS_OVERLAYS.mage.weaponName === "crystal_staff" && V86_CLASS_OVERLAYS.mage.helm === "hood");
    add("class: druid has antlers", V86_CLASS_OVERLAYS.druid.helm === "antlers");
    add("class: cleric has halo", V86_CLASS_OVERLAYS.cleric.helm === "halo");
    // SVG generation
    var svg1 = v86CharacterSvg({species:"orc", classKey:"warrior", hair:"mohawk", hairColor:"raven", eyeColor:"crimson", skinIdx:1});
    var svg2 = v86CharacterSvg({species:"elf", classKey:"mage", hair:"long_straight", hairColor:"silver", eyeColor:"violet", skinIdx:0});
    add("svg: generates for orc warrior", svg1.indexOf("<svg") >= 0 && svg1.indexOf("data-species=\"orc\"") >= 0 && svg1.indexOf("data-class=\"warrior\"") >= 0);
    add("svg: generates for elf mage", svg2.indexOf("<svg") >= 0 && svg2.indexOf("data-species=\"elf\"") >= 0 && svg2.indexOf("data-class=\"mage\"") >= 0);
    add("svg: orc and elf SVGs differ substantially", svg1.length > 500 && svg2.length > 500 && svg1 !== svg2);
    return results;
  };
})();
