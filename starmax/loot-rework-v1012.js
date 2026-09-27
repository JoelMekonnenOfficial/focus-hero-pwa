/* ================================================================
 * Life XP — v8.x LOOT REWORK
 *
 * Companion to index.html / focus-hero.html. This file holds the
 * gain / customize / use systems for the loot rework. It is split
 * out of the main inline script because the inline script grew
 * past the in-tool edit ceiling — splitting was the most reliable
 * way to ship the rework without truncating the rest of the app.
 *
 * Loading: index.html includes this with a plain <script src> tag
 * AFTER the main inline <script>. All functions go on the global
 * (window) so the inline script's wire-ins resolve them at event
 * time. The inline script always wraps these references in
 * `typeof lrSessionEndLootPipeline === "function"` to gracefully
 * fall back to the legacy rollLoot() if this file fails to load.
 *
 * Design contract: loot-rework-design.md
 * Migration: additive only — DATA_VERSION 10 → 11. Every existing
 * field in user state stays bit-identical.
 * ================================================================ */

(function(){
  "use strict";

  /* LR_RARITIES and LR_DROP_LOG_CAP are owned by THIS file (the inline
     script no longer needs them inline — it just uses string literals
     directly in the migration block). Declared as plain vars below so
     they are always trustworthy regardless of what window proxies return. */
  var LR_RARITIES = ["common","uncommon","rare","epic","legendary","mythic"];
  var LR_DROP_LOG_CAP = 200;
  var LR_BATTLE_REPORT_CAP = 30;
  var LR_SESSION_REWARD_POLICY_VERSION = 4;
  var LR_SESSION_REWARD_DETAIL_CAP = 64;
  var LR_SESSION_REWARD_TOMBSTONE_CAP = 2048;
  var LR_SESSION_REWARD_STORAGE_BYTE_CAP = 512 * 1024;
  if (typeof window !== "undefined"){
    try { window.LR_RARITIES = LR_RARITIES; } catch(_){}
    try { window.LR_DROP_LOG_CAP = LR_DROP_LOG_CAP; } catch(_){}
    try { window.LR_BATTLE_REPORT_CAP = LR_BATTLE_REPORT_CAP; } catch(_){}
  }

  /* Per-source rarity weight rows — every row sums to exactly 1.0.
     Asserted by smoke test #loot.weights.sum. */
  var LR_SOURCE_WEIGHTS = {
    Fight:    { common:0.450, uncommon:0.300, rare:0.150, epic:0.070, legendary:0.025, mythic:0.005 },
    Hunt:     { common:0.500, uncommon:0.280, rare:0.140, epic:0.060, legendary:0.015, mythic:0.005 },
    Loot:     { common:0.400, uncommon:0.300, rare:0.180, epic:0.090, legendary:0.025, mythic:0.005 },
    Craft:    { common:0.550, uncommon:0.300, rare:0.100, epic:0.040, legendary:0.008, mythic:0.002 },
    Travel:   { common:0.600, uncommon:0.280, rare:0.090, epic:0.025, legendary:0.004, mythic:0.001 },
    Rest:     { common:0.700, uncommon:0.250, rare:0.040, epic:0.009, legendary:0.001, mythic:0.000 },
    Meditate: { common:0.500, uncommon:0.300, rare:0.150, epic:0.040, legendary:0.009, mythic:0.001 }
  };

  /* Soft-pity thresholds (sessions without a drop of that rarity). */
  var LR_PITY_THRESHOLD = { common:Infinity, uncommon:Infinity, rare:8, epic:25, legendary:60, mythic:150 };

  /* Source tags per LOOT_TABLE id. Items not listed default to
     ["Fight","Hunt","Loot"]. */
  var LR_SOURCE_OVERRIDES = {
    copper_coin:        ["Loot","Travel","Fight","Hunt"],
    scroll_of_focus:    ["Loot","Travel","Meditate"],
    candle_of_clarity:  ["Loot","Meditate","Rest"],
    calming_herb:       ["Hunt","Loot","Travel"],
    mana_potion:        ["Craft","Loot","Hunt"],
    golden_apple:       ["Hunt","Loot"],
    seer_s_orb:         ["Loot","Meditate"],
    whetstone_blade:    ["Fight","Loot","Craft"],
    tome_of_tomorrow:   ["Loot","Meditate","Craft"],
    trail_boots:        ["Loot","Travel","Hunt"],
    targeter_s_ring:    ["Loot","Hunt","Craft"],
    dualblade:          ["Fight","Craft"],
    amulet_of_drive:    ["Loot","Meditate","Craft"],
    moonplate_vest:     ["Fight","Loot","Craft"],
    wolf_reins:         ["Hunt","Loot","Travel"],
    study_owl:          ["Loot","Meditate","Hunt"],
    clockwork_fox:      ["Loot","Hunt","Craft"],
    crown_of_flow:      ["Fight","Loot"],
    unicorn_sigil:      ["Loot","Travel"],
    griffin_saddle:     ["Hunt","Travel"],
    astral_stag_tack:   ["Loot","Travel"],
    ember_wyrmling:     ["Fight","Loot"],
    wind_familiar:      ["Loot","Meditate"],
    key_of_worlds:      ["Loot","Meditate"],
    cosmic_fragment:    ["Loot","Meditate","Fight","Hunt"],
    void_skiff:         ["Loot","Travel"],
    phase_panther_reins:["Loot","Travel"],
    star_mote:          ["Loot","Meditate"],
    orbit_sprite:       ["Loot","Meditate"],
    timekeeper_s_spark: ["Loot","Meditate","Fight","Hunt"],
    rusty_dagger:["Fight","Hunt","Craft"], cloth_cap:["Loot","Rest","Travel"], padded_tunic:["Craft","Rest","Loot"], old_pony:["Travel","Hunt"], field_mouse:["Loot","Meditate","Hunt"], focus_stone:["Meditate","Rest","Loot"],
    iron_shortsword:["Fight","Craft","Hunt"], leather_helm:["Loot","Travel","Hunt"], studded_vest:["Craft","Fight","Rest"], pack_mule:["Travel","Loot","Hunt"], alley_cat:["Loot","Meditate","Travel"], focus_tonic:["Meditate","Rest","Craft"],
    scholar_s_quill:["Meditate","Loot","Craft"], scholar_s_spectacles:["Meditate","Loot","Rest"], scholar_s_robe:["Meditate","Craft","Loot"],
    prospector_s_pick:["Loot","Travel","Hunt"], lucky_hood:["Loot","Travel","Fight"], pacer_s_drum:["Travel","Rest","Fight"],
    sure_foot_ram:["Travel","Hunt","Loot"], trash_panda:["Loot","Hunt","Travel"],
    runed_warhammer:["Fight","Craft","Hunt"], helm_of_resolve:["Fight","Meditate","Loot"], coinweave_vest:["Loot","Craft","Travel"], endurance_crown:["Rest","Travel","Meditate"], trailguard_greaves:["Travel","Rest","Fight"], tiger_mount:["Hunt","Travel","Fight"], falcon_companion:["Hunt","Loot","Meditate"], pathfinder_s_compass:["Travel","Loot","Hunt"],
    sword_of_momentum:["Fight","Hunt","Loot"], midas_gauntlet:["Loot","Travel","Craft"], aegis_of_flow:["Fight","Rest","Meditate"], lion_of_resolve:["Hunt","Travel","Fight"], phoenix_chick:["Meditate","Loot","Hunt"],
    chronoblade:["Fight","Meditate","Loot"], eye_of_eternity:["Meditate","Loot","Fight"], astral_dragon:["Travel","Hunt","Loot"], celestial_phoenix:["Meditate","Loot","Hunt"], halo_of_mastery:["Meditate","Fight","Loot"],
    oak_cudgel:["Fight","Craft","Hunt"], worn_sandals:["Travel","Rest","Craft"], pond_turtle:["Rest","Loot","Meditate"], calm_tea:["Rest","Meditate","Loot"],
    apprentice_hammer:["Craft","Fight","Hunt"], bard_s_lute:["Meditate","Loot","Rest"], hide_helm:["Hunt","Craft","Travel"], faithful_hound:["Hunt","Loot","Travel"], energy_draught:["Rest","Craft","Travel"],
    boomerang_blade:["Hunt","Fight","Travel"], climber_s_harness:["Travel","Hunt","Rest"], badger_kit:["Hunt","Loot","Meditate"], steppe_horse:["Travel","Hunt","Loot"], golden_scepter:["Loot","Craft","Travel"], hearty_mead:["Rest","Loot","Travel"],
    berserker_s_axe:["Fight","Hunt","Craft"], warhelm:["Fight","Craft","Hunt"], crown_of_coins:["Loot","Travel","Fight"], velvet_mantle:["Loot","Craft","Rest"], war_croc:["Hunt","Travel","Fight"], scorpion_familiar:["Hunt","Fight","Meditate"], frost_vial:["Craft","Meditate","Rest"], festival_charm:["Loot","Travel","Rest"],
    bloodplate:["Fight","Hunt","Craft"], starcaller_staff:["Meditate","Loot","Fight"], seraph_wings:["Travel","Meditate","Loot"], frost_wyrmling:["Hunt","Loot","Travel"], hamsa_charm:["Loot","Meditate","Travel"],
    voidblade:["Fight","Meditate","Loot"], bulwark_eternal:["Fight","Craft","Rest"], eternal_stag:["Travel","Hunt","Meditate"], trident_of_tides:["Fight","Travel","Loot"], solar_phoenix:["Meditate","Loot","Hunt"]
  };

  /* Affix definitions — 12 stat lines that can roll on gear. */
  var LR_AFFIX_DEFS = {
    xpPct:      { retired:true, label:"Retired XP perk (inactive)",           minor:[2,4],  major:[5,9],  grand:[10,15], kind:"util" },
    coinPct:    { retired:true, label:"Retired coin perk (inactive)",        minor:[2,4],  major:[5,9],  grand:[10,15], kind:"util" },
    energySave: { retired:true, label:"Retired energy perk (inactive)",   minor:[1,1],  major:[2,2],  grand:[3,3],   kind:"util" },
    dmgPhys:    { label:"+{n} Physical Damage", minor:[3,5], major:[6,10], grand:[11,16], kind:"offense" },
    travelSpeedPct:{ label:"+{n}% Travel route speed", fixedOnly:true },
    critPct:    { label:"+{n}% Crit",         minor:[3,5],  major:[6,10], grand:[11,16], kind:"offense" },
    dmgFire:    { label:"+{n} Fire Damage",   minor:[4,7],  major:[8,14], grand:[15,22], kind:"elem" },
    dmgFrost:   { label:"+{n} Frost Damage",  minor:[4,7],  major:[8,14], grand:[15,22], kind:"elem" },
    dmgPoison:  { label:"+{n} Poison Damage", minor:[4,7],  major:[8,14], grand:[15,22], kind:"elem" },
    dmgArcane:  { label:"+{n} Arcane Damage", minor:[4,7],  major:[8,14], grand:[15,22], kind:"elem" },
    resPhys:    { label:"+{n} Phys Resist",   minor:[3,5],  major:[6,10], grand:[11,16], kind:"defense" },
    resElem:    { label:"+{n} Elem Resist",   minor:[3,5],  major:[6,10], grand:[11,16], kind:"defense" },
    dodgePct:   { label:"+{n}% Dodge",        minor:[2,4],  major:[5,7],  grand:[8,12],  kind:"defense" },
    lifesteal:  { label:"+{n}% Lifesteal",    minor:[2,4],  major:[5,7],  grand:[8,10],  kind:"offense" }
  };

  var LR_RARITY_CAPS = {
    common:    { affixes:1, sockets:0, maxLevel:5  },
    uncommon:  { affixes:1, sockets:0, maxLevel:8  },
    rare:      { affixes:2, sockets:1, maxLevel:12 },
    epic:      { affixes:2, sockets:2, maxLevel:15 },
    legendary: { affixes:3, sockets:2, maxLevel:20 },
    mythic:    { affixes:3, sockets:3, maxLevel:25 }
  };

  var LR_REROLL_DUST = { common:5, uncommon:10, rare:25, epic:60, legendary:150, mythic:400 };

  var LR_SALVAGE_YIELD = {
    common:    { dust:1,   shards:0,  essence:0,  gemChance:0.00 },
    uncommon:  { dust:3,   shards:1,  essence:0,  gemChance:0.00 },
    rare:      { dust:8,   shards:3,  essence:0,  gemChance:0.10 },
    epic:      { dust:20,  shards:8,  essence:1,  gemChance:0.25 },
    legendary: { dust:60,  shards:25, essence:5,  gemChance:0.60 },
    mythic:    { dust:200, shards:80, essence:20, gemChance:1.00 }
  };

  var LR_GEM_DEFS = {
    gem_fire:    { name:"Ruby",     sym:"🔴", affixId:"dmgFire",   value:6 },
    gem_frost:   { name:"Sapphire", sym:"🔵", affixId:"dmgFrost",  value:6 },
    gem_arcane:  { name:"Topaz",    sym:"🟣", affixId:"dmgArcane", value:6 },
    gem_poison:  { name:"Emerald",  sym:"🟢", affixId:"dmgPoison", value:6 },
    gem_resPhys: { name:"Onyx",     sym:"⬛", affixId:"resPhys",   value:6 },
    gem_resElem: { name:"Pearl",    sym:"⚪", affixId:"resElem",   value:6 },
    gem_xp:      { name:"Citrine",  sym:"🟡", affixId:"critPct",   value:3 },
    gem_coin:    { name:"Sunstone", sym:"🟠", affixId:"resPhys",   value:3 }
  };

  var LR_DYE_DEFS = {
    dye_crimson:  { name:"Crimson",  color:"#DC2626" },
    dye_azure:    { name:"Azure",    color:"#0EA5E9" },
    dye_emerald:  { name:"Emerald",  color:"#10B981" },
    dye_violet:   { name:"Violet",   color:"#7C3AED" },
    dye_gold:     { name:"Gold",     color:"#F59E0B" },
    dye_silver:   { name:"Silver",   color:"#9CA3AF" },
    dye_void:     { name:"Void",     color:"#111827" },
    dye_solar:    { name:"Solar",    color:"#FBBF24" },
    dye_lunar:    { name:"Lunar",    color:"#A3A3A3" },
    dye_blossom:  { name:"Blossom",  color:"#F472B6" },
    dye_obsidian: { name:"Obsidian", color:"#0F172A" },
    dye_aurora:   { name:"Aurora",   color:"#86EFAC" }
  };

  var LR_CONSUMABLE_DEFS = {
    cons_heal_small: { name:"Healing Potion", sym:"🧪", effect:{ kind:"heal",  value:25 } },
    cons_heal_large: { name:"Greater Heal",   sym:"🍷", effect:{ kind:"heal",  value:60 } },
    cons_fire_bomb:  { name:"Fire Bomb",      sym:"💣", effect:{ kind:"bomb",  damageType:"dmgFire",   value:50 } },
    cons_frost_bomb: { name:"Frost Bomb",     sym:"❄️", effect:{ kind:"bomb",  damageType:"dmgFrost",  value:50 } },
    cons_iron:       { name:"Iron Tonic",     sym:"🛡️", effect:{ kind:"buff",  affix:"resPhys",        value:30 } },
    cons_lucky:      { name:"Lucky Charm",    sym:"🍀", effect:{ kind:"luck",  rerolls:1 } }
  };

  var LR_MONSTER_TRAITS = {
    slime:        { tags:["ooze"],            weak:["dmgFire"],   resist:["dmgPoison"],          dmg:6,  acc:0.80 },
    rat:          { tags:["beast"],           weak:["dmgArcane"], resist:[],                     dmg:4,  acc:0.90 },
    scrub_raider: { tags:["humanoid"],        weak:["dmgFrost"],  resist:[],                     dmg:8,  acc:0.85 },
    wolf:         { tags:["beast"],           weak:["dmgFire"],   resist:[],                     dmg:12, acc:0.90 },
    bandit:       { tags:["humanoid"],        weak:["dmgArcane"], resist:["dmgPhys"],            dmg:14, acc:0.85 },
    wraith:       { tags:["undead"],          weak:["dmgArcane"], resist:["dmgFrost"],           dmg:16, acc:0.88 },
    bog_brute:    { tags:["ogre"],            weak:["dmgFrost"],  resist:["dmgPhys"],            dmg:22, acc:0.75 },
    hag:          { tags:["humanoid"],        weak:["dmgFire"],   resist:["dmgArcane"],          dmg:20, acc:0.88 },
    drake:        { tags:["dragon"],          weak:["dmgFrost"],  resist:["dmgFire"],            dmg:28, acc:0.90 },
    minotaur:     { tags:["beast"],           weak:["dmgPoison"], resist:["dmgPhys"],            dmg:36, acc:0.85 },
    revenant:     { tags:["undead"],          weak:["dmgFire"],   resist:["dmgFrost","dmgPoison"], dmg:40, acc:0.85 },
    griffin:      { tags:["beast"],           weak:["dmgArcane"], resist:[],                     dmg:42, acc:0.95 },
    dragon:       { tags:["dragon","boss"],   weak:["dmgFrost"],  resist:["dmgFire","dmgPhys"],  dmg:55, acc:0.92, boss:true },
    lich:         { tags:["undead","boss"],   weak:["dmgFire"],   resist:["dmgFrost","dmgArcane"], dmg:62, acc:0.90, boss:true },
    voidhorror:   { tags:["eldritch","boss"], weak:["dmgArcane"], resist:["dmgFire","dmgFrost","dmgPoison"], dmg:80, acc:0.95, boss:true }
  };

  /* Per-monster drop weights. Pool that beats the source-aware default
     table 65% of the time when this enemy is involved in the drop. */
  var LR_MONSTER_DROPS = {
    slime:        { copper_coin:4, calming_herb:3, scroll_of_focus:2 },
    rat:          { copper_coin:5, scroll_of_focus:2 },
    scrub_raider: { whetstone_blade:1, copper_coin:3, candle_of_clarity:2 },
    wolf:         { trail_boots:2, copper_coin:3, mana_potion:2 },
    bandit:       { whetstone_blade:2, dualblade:1, copper_coin:4 },
    wraith:       { seer_s_orb:3, tome_of_tomorrow:2 },
    bog_brute:    { moonplate_vest:1, golden_apple:2, mana_potion:3 },
    hag:          { seer_s_orb:2, tome_of_tomorrow:3, mana_potion:2 },
    drake:        { ember_wyrmling:1, dualblade:2, crown_of_flow:1 },
    minotaur:     { dualblade:3, moonplate_vest:2, amulet_of_drive:2 },
    revenant:     { tome_of_tomorrow:2, amulet_of_drive:2, key_of_worlds:1 },
    griffin:      { griffin_saddle:1, wolf_reins:2, study_owl:2 },
    dragon:       { ember_wyrmling:3, crown_of_flow:2, unicorn_sigil:1, cosmic_fragment:1 },
    lich:         { key_of_worlds:2, crown_of_flow:1, cosmic_fragment:1, void_skiff:1 },
    voidhorror:   { cosmic_fragment:5, timekeeper_s_spark:1, void_skiff:2, star_mote:1, orbit_sprite:1 }
  };

  var LR_OUTCOME_BIAS = { clean:1.20, solid:1.00, battered:0.55, whiff:0.00 };

  function lrEncountersForMinutes(min){
    if (min >= 120) return 5;
    if (min >= 90)  return 4;
    if (min >= 50)  return 3;
    if (min >= 25)  return 2;
    return 1;
  }

  function lrBaselineAffix(templateId){
    var fx = window.GEAR_EFFECTS && window.GEAR_EFFECTS[templateId];
    if (!fx) return null;
    var keys = ["dmgPhys","resPhys","resElem","critPct","travelSpeedPct"];
    for (var i=0;i<keys.length;i++) if (fx[keys[i]]) return {id:keys[i],tier:"major",value:fx[keys[i]],fixed:true};
    return null;
  }

  /* Resolve common globals defensively — the inline script defines all of
     these, but if something has gone wrong we want to fail safely, not
     crash the whole app. */
  function _state(){ return window.state; }
  function _LOOT_TABLE(){ return window.LOOT_TABLE; }
  function _MONSTERS(){ return window.MONSTERS; }
  function _EQUIP_SLOTS(){ return window.EQUIP_SLOTS; }
  function _lootId(item){ return window.lootId ? window.lootId(item) : (item && item[1] ? String(item[1]).toLowerCase().replace(/[^a-z0-9]+/g,"_") : ""); }
  function _lootById(id){ return window.lootById ? window.lootById(id) : null; }
  function _lootSlot(item){ return window.lootSlot ? window.lootSlot(item) : (item ? item[4] : "none"); }
  function _isEquippableSlot(slot){ return window.isEquippableSlot ? window.isEquippableSlot(slot) : (window.EQUIP_SLOTS||[]).indexOf(slot) >= 0; }
  function lrInstanceSlot(instance){
    var template = instance && _lootById(instance.lootId);
    return template ? _lootSlot(template) : "none";
  }
  function lrInstanceSupportsForgeMutation(instance){
    return !!instance && _isEquippableSlot(lrInstanceSlot(instance));
  }
  function _allowedRaritiesForMinutes(minutes){
    if (typeof window.allowedRaritiesForMinutes === "function") return window.allowedRaritiesForMinutes(minutes);
    var out = new Set(LR_RARITIES); return out;
  }
  function _now(){ return window.now ? window.now() : Date.now(); }
  function _uid(){ return window.uid ? window.uid() : (Math.random().toString(36).slice(2,10) + Date.now().toString(36).slice(-4)); }
  function _saveState(){ try { window.saveState && window.saveState(); } catch(_){} }
  function _toast(msg, kind, actions){ try { window.toast && window.toast(msg, kind || "info", actions); } catch(_){} }
  function _escapeHtml(s){ return window.escapeHtml ? window.escapeHtml(s) : String(s||"").replace(/[&<>"']/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[c]; }); }

  /* ---------- PURE ITEM VISUAL ADAPTER ------------------------
     Model rendering is intentionally detached from inventory and save logic.
     Stable mounts retain their complete catalog descriptor (especially their
     declared family); ordinary loot rows are normalized into a render-only
     object. Missing artwork uses a local geometric mark, never native emoji. */
  function lrTemplateVisualItem(template){
    if (Array.isArray(template)){
      var slot = _lootSlot(template);
      var id = _lootId(template);
      if (slot === "mount" && typeof window.crResolveMount === "function"){
        var stable = window.crResolveMount(id) || window.crResolveMount({ id:id, name:template[1] });
        if (stable) return stable;
      }
      return { id:id, name:template[1], rarity:template[2], tier:template[2], slot:slot };
    }
    template = template && typeof template === "object" ? template : {};
    if ((template.slot === "mount" || template.category === "mount") && typeof window.crResolveMount === "function"){
      var resolved = window.crResolveMount(template.lootId || template.id || template.name);
      if (!resolved && template.name) resolved = window.crResolveMount({ id:template.id, name:template.name });
      if (resolved) return resolved;
    }
    return {
      id:template.lootId || template.id || template.name || "item",
      name:template.name || template.lootId || template.id || "Item",
      rarity:template.rarity || template.tier || "common",
      tier:template.tier || template.rarity || "common",
      family:template.family || "", slot:template.slot || "none",
      category:template.category || "", worldCatalog:template.worldCatalog || ""
    };
  }

  function lrFallbackItemArt(item, surface){
    var label = _escapeHtml((item && item.name) || "Item");
    return '<svg class="fh-loot-item-model fh-loot-item-model-' + _escapeHtml(surface || "card") + '" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="' + label + '">' +
      '<title>' + label + '</title><rect x="5" y="5" width="54" height="54" rx="14" fill="#111827" stroke="#475569" stroke-width="3"/>' +
      '<path d="M17 42 25 20l8 12 7-17 8 27Z" fill="#22D3EE" fill-opacity=".26" stroke="#67E8F9" stroke-width="3" stroke-linejoin="round"/>' +
      '<circle cx="32" cy="45" r="4" fill="#F3C969"/></svg>';
  }

  function lrItemArtHtml(template, surface){
    var visual = lrTemplateVisualItem(template);
    var slot = Array.isArray(template) ? _lootSlot(template) : String((template && template.slot) || visual.slot || "none");
    var art = "";
    try {
      if (window.FH_MODELS){
        if (["weapon","helmet","armor","mount","pet"].indexOf(slot) >= 0
            && typeof window.FH_MODELS.itemSvg === "function"){
          var inner = window.FH_MODELS.itemSvg(slot, visual);
          if (inner) art = '<svg class="fh-loot-item-model" viewBox="0 0 216 216" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="' + _escapeHtml(visual.name) + '"><title>' + _escapeHtml(visual.name) + '</title>' + inner + '</svg>';
        } else if (typeof window.FH_MODELS.contentThumbnail === "function"){
          var kind = Array.isArray(template) ? slot : ((template && (template.worldCatalog || template.slot || template.category)) || slot);
          art = window.FH_MODELS.contentThumbnail(kind, template || visual);
        }
      }
    } catch(_){ art = ""; }
    if (!art) art = lrFallbackItemArt(visual, surface);
    var size = surface === "inspector" ? 88
      : (surface === "collection" ? 64 : (surface === "forge" ? 56 : 48));
    art = art.replace(/^<svg\b/, '<svg style="display:block;width:' + size + 'px;height:' + size + 'px;max-width:100%"');
    return '<span class="fh-loot-item-art fh-loot-item-art-' + _escapeHtml(surface || "card") + '" aria-hidden="true" style="display:grid;place-items:center;width:100%;min-height:' + size + 'px">' + art + '</span>';
  }
  function _deepClone(o){ return window.deepClone ? window.deepClone(o) : JSON.parse(JSON.stringify(o)); }
  function _recordEncounter(id){ try { window.recordEncounter && window.recordEncounter(id, { silent:true }); } catch(_){} }

  /* ---------- helpers ---------- */

  function lrEnsureShape(s){
    s = s || _state();
    if (!s) return s;
    if (!s.lootInstances || typeof s.lootInstances !== "object" || Array.isArray(s.lootInstances)) s.lootInstances = {};
    if (!s.loot || typeof s.loot !== "object" || Array.isArray(s.loot)){
      s.loot = { drops:[], pity:{common:0,uncommon:0,rare:0,epic:0,legendary:0,mythic:0},
                 materials:{dust:0,shards:0,essence:0}, dyesOwned:{}, gemsOwned:{},
                 consumables:{}, loadout:{slot1:null,slot2:null,slot3:null}, loadoutUpdatedAt:0,
                 instanceTombstones:{}, sessionRewardReceipts:{}, sessionRewardReceiptTombstones:{} };
    } else {
      if (!Array.isArray(s.loot.drops)) s.loot.drops = [];
      if (!s.loot.pity) s.loot.pity = { common:0, uncommon:0, rare:0, epic:0, legendary:0, mythic:0 };
      if (!s.loot.materials) s.loot.materials = { dust:0, shards:0, essence:0 };
      if (!s.loot.dyesOwned) s.loot.dyesOwned = {};
      if (!s.loot.gemsOwned) s.loot.gemsOwned = {};
      if (!s.loot.consumables) s.loot.consumables = {};
      if (!s.loot.loadout) s.loot.loadout = { slot1:null, slot2:null, slot3:null };
      if (typeof s.loot.loadoutUpdatedAt !== "number") s.loot.loadoutUpdatedAt = 0;
      if (!s.loot.instanceTombstones || typeof s.loot.instanceTombstones !== "object" || Array.isArray(s.loot.instanceTombstones)) s.loot.instanceTombstones = {};
      /* A completed session is an immutable reward boundary.  This receipt is
         deliberately local state only for now: the durable event ledger owns
         cross-device ordering.  It prevents an in-process/retry replay from
         applying the same session's loot, pity, combat and consumable effects
         twice while that integration is being built. */
      if (!s.loot.sessionRewardReceipts || typeof s.loot.sessionRewardReceipts !== "object" || Array.isArray(s.loot.sessionRewardReceipts)) s.loot.sessionRewardReceipts = {};
      if (!s.loot.sessionRewardReceiptTombstones || typeof s.loot.sessionRewardReceiptTombstones !== "object" || Array.isArray(s.loot.sessionRewardReceiptTombstones)) s.loot.sessionRewardReceiptTombstones = {};
    }
    if (!s.lootRework || typeof s.lootRework !== "object") s.lootRework = { version:1, flags:{ animationsOn:true, showDropLog:true, autoSalvageCommonDupes:false, autoSalvageDupes:true } };
    if (s.lootRework && s.lootRework.flags && typeof s.lootRework.flags.autoSalvageDupes === "undefined") s.lootRework.flags.autoSalvageDupes = true; /* v9: default dupe->materials on */
    return s;
  }

  function lrSeededRng(seed){
    var a = (((seed|0) || 1) >>> 0);
    return function(){
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function lrHashStr(str){
    var h = 2166136261 >>> 0;
    for (var i=0; i<str.length; i++){
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }
  function lrStableId(prefix, seed){
    seed = String(seed || "");
    var left = lrHashStr(seed).toString(36).padStart(7, "0");
    var right = lrHashStr("focus-hero|" + seed).toString(36).padStart(7, "0");
    return String(prefix || "lr") + "_" + left + right;
  }

  function lrSha256Hex(input){
    var text = String(input === undefined || input === null ? "" : input);
    var bytes = [];
    for (var i=0; i<text.length; i++){
      var code = text.charCodeAt(i);
      if (code >= 0xD800 && code <= 0xDBFF && i + 1 < text.length){
        var low = text.charCodeAt(i + 1);
        if (low >= 0xDC00 && low <= 0xDFFF){
          code = 0x10000 + ((code - 0xD800) << 10) + (low - 0xDC00);
          i++;
        }
      }
      if (code < 0x80) bytes.push(code);
      else if (code < 0x800){
        bytes.push(0xC0 | (code >>> 6), 0x80 | (code & 0x3F));
      } else if (code < 0x10000){
        bytes.push(0xE0 | (code >>> 12), 0x80 | ((code >>> 6) & 0x3F), 0x80 | (code & 0x3F));
      } else {
        bytes.push(0xF0 | (code >>> 18), 0x80 | ((code >>> 12) & 0x3F),
          0x80 | ((code >>> 6) & 0x3F), 0x80 | (code & 0x3F));
      }
    }
    var bitLength = bytes.length * 8;
    bytes.push(0x80);
    while ((bytes.length % 64) !== 56) bytes.push(0);
    var high = Math.floor(bitLength / 0x100000000);
    var lowBits = bitLength >>> 0;
    for (var hb=3; hb>=0; hb--) bytes.push((high >>> (hb * 8)) & 0xFF);
    for (var lb=3; lb>=0; lb--) bytes.push((lowBits >>> (lb * 8)) & 0xFF);
    var h = [
      0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,
      0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19
    ];
    var k = [
      0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
      0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
      0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
      0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
      0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
      0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
      0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
      0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
    ];
    var rotr = function(value, bits){ return (value >>> bits) | (value << (32 - bits)); };
    var w = new Array(64);
    for (var offset=0; offset<bytes.length; offset+=64){
      for (var wi=0; wi<16; wi++){
        var pos = offset + wi * 4;
        w[wi] = ((bytes[pos] << 24) | (bytes[pos+1] << 16) | (bytes[pos+2] << 8) | bytes[pos+3]) >>> 0;
      }
      for (var wx=16; wx<64; wx++){
        var s0 = rotr(w[wx-15],7) ^ rotr(w[wx-15],18) ^ (w[wx-15] >>> 3);
        var s1 = rotr(w[wx-2],17) ^ rotr(w[wx-2],19) ^ (w[wx-2] >>> 10);
        w[wx] = (w[wx-16] + s0 + w[wx-7] + s1) >>> 0;
      }
      var a=h[0], b=h[1], c=h[2], d=h[3], e=h[4], f=h[5], g=h[6], hh=h[7];
      for (var round=0; round<64; round++){
        var sum1 = rotr(e,6) ^ rotr(e,11) ^ rotr(e,25);
        var choose = (e & f) ^ ((~e) & g);
        var temp1 = (hh + sum1 + choose + k[round] + w[round]) >>> 0;
        var sum0 = rotr(a,2) ^ rotr(a,13) ^ rotr(a,22);
        var majority = (a & b) ^ (a & c) ^ (b & c);
        var temp2 = (sum0 + majority) >>> 0;
        hh=g; g=f; f=e; e=(d+temp1)>>>0; d=c; c=b; b=a; a=(temp1+temp2)>>>0;
      }
      h[0]=(h[0]+a)>>>0; h[1]=(h[1]+b)>>>0; h[2]=(h[2]+c)>>>0; h[3]=(h[3]+d)>>>0;
      h[4]=(h[4]+e)>>>0; h[5]=(h[5]+f)>>>0; h[6]=(h[6]+g)>>>0; h[7]=(h[7]+hh)>>>0;
    }
    return h.map(function(value){ return value.toString(16).padStart(8, "0"); }).join("");
  }

  function lrCanonicalRewardValue(value){
    if (value === null) return null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "string" || typeof value === "boolean") return value;
    if (Array.isArray(value)){
      return value.map(function(item){
        return item === undefined || typeof item === "function" ? null : lrCanonicalRewardValue(item);
      });
    }
    if (typeof value !== "object") return null;
    var out = {};
    Object.keys(value).sort().forEach(function(key){
      var item = value[key];
      if (item === undefined || typeof item === "function") return;
      out[key] = lrCanonicalRewardValue(item);
    });
    return out;
  }

  function lrRewardContentCommitment(snapshot){
    return "sha256:" + lrSha256Hex(JSON.stringify(lrCanonicalRewardValue(snapshot)));
  }

  function lrLegacyRewardContentCommitment(snapshot){
    return lrStableId("reward", JSON.stringify(lrCanonicalRewardValue(snapshot)));
  }

  function lrRewardSemanticCommitment(sessionId, action, minutes, policyVersion){
    return "sha256:" + lrSha256Hex(JSON.stringify(lrCanonicalRewardValue({
      policyVersion:Math.max(1, policyVersion|0),
      sessionId:String(sessionId || ""),
      action:String(action || ""),
      minutes:Math.max(0, minutes|0)
    })));
  }

  function lrStripRewardAuditFields(value){
    if (value === null || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map(lrStripRewardAuditFields);
    var out = {};
    Object.keys(value).sort().forEach(function(key){
      if (key === "at" || key === "createdAt" || key === "updatedAt" ||
          key === "firstSeenAt" || key === "lastEncounteredAt" ||
          key === "currentZoneUpdatedAt") return;
      out[key] = lrStripRewardAuditFields(value[key]);
    });
    return out;
  }

  function lrRewardCounterSnapshot(s){
    s = s || {};
    var loot = s.loot || {};
    var achievements = {};
    Object.keys(s.achievements || {}).sort().forEach(function(key){
      if (s.achievements[key]) achievements[key] = true;
    });
    return {
      pity:lrCanonicalRewardValue(loot.pity || {}),
      materials:lrCanonicalRewardValue(loot.materials || {}),
      consumables:lrCanonicalRewardValue(loot.consumables || {}),
      lootOwned:lrCanonicalRewardValue(s.lootOwned || {}),
      gemsOwned:lrCanonicalRewardValue(loot.gemsOwned || {}),
      instanceTombstones:lrCanonicalRewardValue(loot.instanceTombstones || {}),
      mountFamilies:lrCanonicalRewardValue(loot.mountFamilies || {}),
      mountProgress:Math.max(0, Number(loot.mountProgress) || 0),
      bestiary:lrCanonicalRewardValue(lrStripRewardAuditFields(s.bestiary || {})),
      world:lrCanonicalRewardValue(lrStripRewardAuditFields(s.world || {})),
      achievements:achievements,
      heroHp:Number(s.hero && s.hero.hp) || 0,
      crystalShards:Number(s.crystalShards) || 0,
      crystalShardsEarned:Number(s.crystalShardsEarned) || 0
    };
  }

  function lrNumericMapDelta(before, after){
    before = before || {};
    after = after || {};
    var delta = {};
    Array.from(new Set(Object.keys(before).concat(Object.keys(after)))).sort().forEach(function(key){
      var difference = (Number(after[key]) || 0) - (Number(before[key]) || 0);
      if (difference) delta[key] = difference;
    });
    return delta;
  }

  function lrRewardObjectPatch(before, after){
    var beforeFlat = {}, afterFlat = {};
    var flatten = function(value, prefix, target){
      if (value !== null && typeof value === "object" && !Array.isArray(value)){
        var keys = Object.keys(value).sort();
        if (keys.length){
          keys.forEach(function(key){ flatten(value[key], prefix ? prefix + "." + key : key, target); });
          return;
        }
      }
      target[prefix] = lrCanonicalRewardValue(value);
    };
    flatten(before || {}, "", beforeFlat);
    flatten(after || {}, "", afterFlat);
    var set = {}, remove = [];
    Array.from(new Set(Object.keys(beforeFlat).concat(Object.keys(afterFlat)))).sort().forEach(function(path){
      var beforeHas = Object.prototype.hasOwnProperty.call(beforeFlat, path);
      var afterHas = Object.prototype.hasOwnProperty.call(afterFlat, path);
      if (!afterHas){ remove.push(path); return; }
      if (!beforeHas || JSON.stringify(beforeFlat[path]) !== JSON.stringify(afterFlat[path])){
        set[path] = afterFlat[path];
      }
    });
    return { set:set, remove:remove };
  }

  function lrRewardDropContent(drop){
    var out = lrCanonicalRewardValue(_deepClone(drop || {}));
    /* Wall-clock values are replica-local audit metadata, not reward
       identity. Keep the roll, rarity, item and stable IDs immutable. */
    delete out.at;
    delete out.updatedAt;
    return out;
  }

  function lrRewardInstanceContent(instance){
    if (!instance) return null;
    var out = lrCanonicalRewardValue(_deepClone(instance));
    delete out.createdAt;
    delete out.updatedAt;
    return out;
  }

  function lrRewardBossContent(boss){
    if (!boss) return null;
    var out = lrCanonicalRewardValue({
      eligible:!!boss.eligible,
      duplicate:!!boss.duplicate,
      receipt:boss.receipt ? _deepClone(boss.receipt) : null
    });
    if (out.receipt && typeof out.receipt === "object") delete out.receipt.at;
    return out;
  }

  function lrBuildSessionRewardSnapshot(s, result, meta, before){
    var after = lrRewardCounterSnapshot(s);
    var drops = (result.drops || []).map(function(drop){
      var iid = drop && drop.iid ? String(drop.iid) : "";
      return {
        drop:lrRewardDropContent(drop),
        instance:iid && s.lootInstances && s.lootInstances[iid]
          ? lrRewardInstanceContent(s.lootInstances[iid]) : null
      };
    });
    return lrCanonicalRewardValue({
      schemaVersion:LR_SESSION_REWARD_POLICY_VERSION,
      sessionId:String(meta.sessionId || ""),
      action:String(meta.action || ""),
      minutes:Math.max(0, meta.minutes|0),
      legacyItemId:result.legacyItem ? _lootId(result.legacyItem) : null,
      zoneId:result.zoneId || null,
      boss:lrRewardBossContent(result.boss),
      drops:drops,
      consumed:_deepClone(result.consumed || []),
      effects:{
        pity:lrNumericMapDelta(before.pity, after.pity),
        materials:lrNumericMapDelta(before.materials, after.materials),
        consumables:lrNumericMapDelta(before.consumables, after.consumables),
        lootOwned:lrNumericMapDelta(before.lootOwned, after.lootOwned),
        gemsOwned:lrNumericMapDelta(before.gemsOwned, after.gemsOwned),
        instanceTombstones:lrRewardObjectPatch(before.instanceTombstones, after.instanceTombstones),
        mountFamilies:lrRewardObjectPatch(before.mountFamilies, after.mountFamilies),
        mountProgress:(Number(after.mountProgress)||0) - (Number(before.mountProgress)||0),
        bestiary:lrRewardObjectPatch(before.bestiary, after.bestiary),
        world:lrRewardObjectPatch(before.world, after.world),
        achievements:lrRewardObjectPatch(before.achievements, after.achievements),
        heroHp:(Number(after.heroHp)||0) - (Number(before.heroHp)||0),
        crystalShards:(Number(after.crystalShards)||0) - (Number(before.crystalShards)||0),
        crystalShardsEarned:(Number(after.crystalShardsEarned)||0) - (Number(before.crystalShardsEarned)||0)
      }
    });
  }

  function lrRewardReceiptSessionId(sessionId){
    var value = String(sessionId === undefined || sessionId === null ? "" : sessionId);
    if (!value || value.length > 200) throw new Error("Invalid session reward receipt id");
    return value;
  }

  function lrValidateRewardSnapshotSchema(sessionId, snapshot, policyVersion){
    if (policyVersion < 3) return;
    if (Object.prototype.hasOwnProperty.call(snapshot, "encounters")){
      throw new Error("Verbose encounter history is forbidden in session reward receipt " + sessionId);
    }
    if (!Array.isArray(snapshot.drops) || !Array.isArray(snapshot.consumed) ||
        !snapshot.effects || typeof snapshot.effects !== "object" || Array.isArray(snapshot.effects)){
      throw new Error("Session reward receipt effect schema is incomplete for " + sessionId);
    }
    var required = [
      "pity","materials","consumables","lootOwned","gemsOwned",
      "instanceTombstones","mountFamilies","mountProgress","bestiary","world","achievements",
      "heroHp","crystalShards","crystalShardsEarned"
    ];
    required.forEach(function(key){
      if (!Object.prototype.hasOwnProperty.call(snapshot.effects, key)){
        throw new Error("Session reward receipt effect schema omits " + key + " for " + sessionId);
      }
    });
    ["instanceTombstones","mountFamilies","bestiary","world","achievements"].forEach(function(key){
      var patch = snapshot.effects[key];
      if (!patch || typeof patch !== "object" || Array.isArray(patch) ||
          !patch.set || typeof patch.set !== "object" || Array.isArray(patch.set) ||
          !Array.isArray(patch.remove)){
        throw new Error("Session reward receipt patch is invalid for " + key + " in " + sessionId);
      }
    });
    snapshot.drops.forEach(function(row){
      if (!row || typeof row !== "object" || !row.drop || typeof row.drop !== "object" ||
          !Object.prototype.hasOwnProperty.call(row, "instance")){
        throw new Error("Session reward receipt drop schema is invalid for " + sessionId);
      }
    });
    if (snapshot.boss && Object.prototype.hasOwnProperty.call(snapshot.boss, "encounter")){
      throw new Error("Verbose boss encounter history is forbidden in session reward receipt " + sessionId);
    }
  }

  function lrNormalizeSessionRewardReceipt(sessionId, raw){
    sessionId = lrRewardReceiptSessionId(sessionId);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)){
      throw new Error("Invalid session reward receipt for " + sessionId);
    }
    var policyVersion = Number(raw.policyVersion);
    if (!Number.isInteger(policyVersion) || (policyVersion !== 1 && policyVersion !== 2 && policyVersion !== 3 && policyVersion !== LR_SESSION_REWARD_POLICY_VERSION)){
      throw new Error("Unsupported session reward receipt policy for " + sessionId);
    }
    if (!raw.rewardSnapshot || typeof raw.rewardSnapshot !== "object" || Array.isArray(raw.rewardSnapshot)){
      throw new Error("Session reward receipt snapshot is missing for " + sessionId);
    }
    if (typeof raw.contentCommitment !== "string" || !raw.contentCommitment){
      throw new Error("Session reward receipt commitment is missing for " + sessionId);
    }
    var snapshot = lrCanonicalRewardValue(_deepClone(raw.rewardSnapshot));
    var schemaVersion = Number(snapshot.schemaVersion);
    if (!Number.isInteger(schemaVersion) || schemaVersion !== policyVersion ||
        String(snapshot.sessionId || "") !== sessionId){
      throw new Error("Session reward receipt snapshot mismatch for " + sessionId);
    }
    lrValidateRewardSnapshotSchema(sessionId, snapshot, policyVersion);
    var action = String(snapshot.action || "");
    var minutes = Math.max(0, snapshot.minutes|0);
    if (raw.action !== undefined && String(raw.action || "") !== action){
      throw new Error("Session reward receipt action mismatch for " + sessionId);
    }
    if (raw.minutes !== undefined && Math.max(0, raw.minutes|0) !== minutes){
      throw new Error("Session reward receipt minutes mismatch for " + sessionId);
    }
    var expectedContent = policyVersion === 1
      ? lrLegacyRewardContentCommitment(snapshot)
      : lrRewardContentCommitment(snapshot);
    if (raw.contentCommitment !== expectedContent){
      throw new Error("Session reward receipt content mismatch for " + sessionId);
    }
    var expectedSemantic = lrRewardSemanticCommitment(sessionId, action, minutes, policyVersion);
    if (policyVersion >= 3 &&
        (typeof raw.semanticCommitment !== "string" || raw.semanticCommitment !== expectedSemantic)){
      throw new Error("Session reward receipt semantic commitment mismatch for " + sessionId);
    }
    if (raw.semanticCommitment !== undefined && String(raw.semanticCommitment) !== expectedSemantic){
      throw new Error("Session reward receipt semantic commitment mismatch for " + sessionId);
    }
    var normalized = lrCanonicalRewardValue(_deepClone(raw));
    normalized.at = Math.max(0, Math.trunc(Number(raw.at) || 0));
    normalized.policyVersion = policyVersion;
    normalized.semanticCommitment = expectedSemantic;
    normalized.contentCommitment = expectedContent;
    normalized.rewardSnapshot = snapshot;
    return normalized;
  }

  function lrNormalizeSessionRewardTombstone(sessionId, raw){
    sessionId = lrRewardReceiptSessionId(sessionId);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)){
      throw new Error("Invalid session reward tombstone for " + sessionId);
    }
    var policyVersion = Number(raw.policyVersion);
    if (!Number.isInteger(policyVersion) || (policyVersion !== 1 && policyVersion !== 2 && policyVersion !== 3 && policyVersion !== LR_SESSION_REWARD_POLICY_VERSION)){
      throw new Error("Unsupported session reward tombstone policy for " + sessionId);
    }
    if (typeof raw.semanticCommitment !== "string" || !/^sha256:[0-9a-f]{64}$/.test(raw.semanticCommitment)){
      throw new Error("Session reward tombstone semantic proof is missing for " + sessionId);
    }
    var validContent = policyVersion === 1
      ? /^reward_[a-z0-9]{14}$/.test(String(raw.contentCommitment || ""))
      : /^sha256:[0-9a-f]{64}$/.test(String(raw.contentCommitment || ""));
    if (!validContent){
      throw new Error("Session reward tombstone content proof is missing for " + sessionId);
    }
    return lrCanonicalRewardValue({
      policyVersion:policyVersion,
      semanticCommitment:String(raw.semanticCommitment),
      contentCommitment:String(raw.contentCommitment)
    });
  }

  function lrRewardTombstoneFromReceipt(sessionId, receipt){
    var normalized = lrNormalizeSessionRewardReceipt(sessionId, receipt);
    return lrNormalizeSessionRewardTombstone(sessionId, {
      policyVersion:normalized.policyVersion,
      semanticCommitment:normalized.semanticCommitment,
      contentCommitment:normalized.contentCommitment
    });
  }

  function lrSessionRewardStorageBytes(receipts, tombstones){
    return JSON.stringify({ receipts:receipts || {}, tombstones:tombstones || {} }).length;
  }

  function lrCompactSessionRewardReceiptState(s){
    s = lrEnsureShape(s || _state());
    var rawReceipts = s.loot.sessionRewardReceipts || {};
    var rawTombstones = s.loot.sessionRewardReceiptTombstones || {};
    var receipts = {}, tombstones = {};
    Object.keys(rawTombstones).sort().forEach(function(sessionId){
      tombstones[sessionId] = lrNormalizeSessionRewardTombstone(sessionId, rawTombstones[sessionId]);
    });
    Object.keys(rawReceipts).sort().forEach(function(sessionId){
      var receipt = lrNormalizeSessionRewardReceipt(sessionId, rawReceipts[sessionId]);
      var proof = lrRewardTombstoneFromReceipt(sessionId, receipt);
      if (tombstones[sessionId] &&
          JSON.stringify(tombstones[sessionId]) !== JSON.stringify(proof)){
        throw new Error("Conflicting session reward evidence for " + sessionId);
      }
      tombstones[sessionId] = proof;
      receipts[sessionId] = receipt;
    });
    if (Object.keys(tombstones).length > LR_SESSION_REWARD_TOMBSTONE_CAP){
      throw new Error("Session reward proof capacity exhausted; durable ledger integration required");
    }
    var tombstoneBytes = lrSessionRewardStorageBytes({}, tombstones);
    if (tombstoneBytes > LR_SESSION_REWARD_STORAGE_BYTE_CAP){
      throw new Error("Session reward proof byte capacity exhausted; durable ledger integration required");
    }
    var detailIds = Object.keys(receipts).sort(function(a,b){
      var byTime = (Number(receipts[b].at)||0) - (Number(receipts[a].at)||0);
      return byTime || a.localeCompare(b);
    });
    while (detailIds.length > LR_SESSION_REWARD_DETAIL_CAP){
      delete receipts[detailIds.pop()];
    }
    while (detailIds.length && lrSessionRewardStorageBytes(receipts, tombstones) > LR_SESSION_REWARD_STORAGE_BYTE_CAP){
      delete receipts[detailIds.pop()];
    }
    if (lrSessionRewardStorageBytes(receipts, tombstones) > LR_SESSION_REWARD_STORAGE_BYTE_CAP){
      throw new Error("Session reward receipt byte capacity exhausted; durable ledger integration required");
    }
    s.loot.sessionRewardReceipts = lrCanonicalRewardValue(receipts);
    s.loot.sessionRewardReceiptTombstones = lrCanonicalRewardValue(tombstones);
    return {
      receipts:s.loot.sessionRewardReceipts,
      tombstones:s.loot.sessionRewardReceiptTombstones,
      detailCount:Object.keys(receipts).length,
      proofCount:Object.keys(tombstones).length,
      bytes:lrSessionRewardStorageBytes(receipts, tombstones)
    };
  }

  function lrValidateSessionRewardReceiptState(loot){
    try {
      if (!loot || typeof loot !== "object" || Array.isArray(loot)) return { ok:false, reason:"invalid_loot" };
      var holder = { loot:{
        sessionRewardReceipts:_deepClone(loot.sessionRewardReceipts || {}),
        sessionRewardReceiptTombstones:_deepClone(loot.sessionRewardReceiptTombstones || {})
      }};
      var stats = lrCompactSessionRewardReceiptState(holder);
      if (Object.keys(loot.sessionRewardReceipts || {}).length !== stats.detailCount){
        return { ok:false, reason:"detail_retention_exceeded" };
      }
      if (Object.keys(loot.sessionRewardReceiptTombstones || {}).length !== stats.proofCount){
        return { ok:false, reason:"proof_missing" };
      }
      return { ok:true, receipts:stats.receipts, tombstones:stats.tombstones, bytes:stats.bytes };
    } catch (error){
      return { ok:false, reason:String(error && error.message || error) };
    }
  }

  function lrRewardReceiptEvidenceMap(loot){
    if (!loot || typeof loot !== "object" || Array.isArray(loot)){
      throw new Error("Invalid session reward receipt state");
    }
    /* A pre-v2 LKG can legitimately predate the compact proof map. Derive a
       proof only from a fully validated detailed receipt; never invent a
       missing content commitment. Current live state remains subject to the
       stricter validator above, which requires every proof to be persisted. */
    var holder = { loot:{
      sessionRewardReceipts:_deepClone(loot.sessionRewardReceipts || {}),
      sessionRewardReceiptTombstones:_deepClone(loot.sessionRewardReceiptTombstones || {})
    }};
    return _deepClone(lrCompactSessionRewardReceiptState(holder).tombstones);
  }

  /* ------------------------------------------------------------------
     SHARED-KEY REWARD RECEIPTS  (v10.12)

     Per-session receipt ids (sw_*, ledger*) are unique to one event on one
     device, so if two devices ever disagree about one, something is wrong
     and refusing the merge is correct. That guarantee is kept.

     Daily target receipts are different by construction. Their id is
     "target_<name>_<date>" - derived from the target and the calendar day,
     not from a unique event - so BOTH devices mint the same id whenever
     both play that day. The reward itself is rolled locally, so the two
     payloads legitimately differ. That is not corruption; it is two
     devices independently claiming the same once-per-day reward.

     The old code treated that as a conflict and threw, which aborted the
     entire sync. Two devices that both played on the same day could then
     never reconcile again - they simply stopped syncing, with no message
     explaining why.

     Resolution: keep exactly ONE side's receipt, chosen by a pure function
     of the two values so that both devices independently arrive at the
     same choice without talking to each other. Earliest claim wins; ties
     break on canonical content. The receipt and its tombstone are kept as
     a matched pair, because the tombstone carries the commitment hashes
     that must agree with the receipt it describes.

     Exactly one receipt survives, so the reward can never be paid twice,
     and no session minutes are involved either way - those come from the
     session records, which union normally.
  ------------------------------------------------------------------ */
  function lrIsSharedKeyReceiptId(sessionId){
    return /^target_/.test(String(sessionId == null ? "" : sessionId));
  }

  function lrSharedKeyReceiptRank(receipt, tombstone){
    var at = Number(receipt && receipt.at) || 0;
    return {
      at: at > 0 ? at : Number.MAX_SAFE_INTEGER,
      body: JSON.stringify(receipt || null) + "|" + JSON.stringify(tombstone || null)
    };
  }

  function lrPickSharedKeyReceipt(leftReceipt, rightReceipt, leftTomb, rightTomb){
    if (!leftReceipt && !rightReceipt){
      return { receipt:null, tombstone: leftTomb || rightTomb || null };
    }
    if (!leftReceipt)  return { receipt: rightReceipt, tombstone: rightTomb || leftTomb || null };
    if (!rightReceipt) return { receipt: leftReceipt,  tombstone: leftTomb  || rightTomb || null };
    var a = lrSharedKeyReceiptRank(leftReceipt, leftTomb);
    var b = lrSharedKeyReceiptRank(rightReceipt, rightTomb);
    var takeLeft = a.at !== b.at ? a.at < b.at : a.body <= b.body;
    return takeLeft
      ? { receipt: leftReceipt,  tombstone: leftTomb  || rightTomb || null }
      : { receipt: rightReceipt, tombstone: rightTomb || leftTomb  || null };
  }

  function lrMergeSessionRewardReceiptStores(localLoot, remoteLoot){
    var left = { loot:{
      sessionRewardReceipts:_deepClone(localLoot && localLoot.sessionRewardReceipts || {}),
      sessionRewardReceiptTombstones:_deepClone(localLoot && localLoot.sessionRewardReceiptTombstones || {})
    }};
    var right = { loot:{
      sessionRewardReceipts:_deepClone(remoteLoot && remoteLoot.sessionRewardReceipts || {}),
      sessionRewardReceiptTombstones:_deepClone(remoteLoot && remoteLoot.sessionRewardReceiptTombstones || {})
    }};
    var l = lrCompactSessionRewardReceiptState(left);
    var r = lrCompactSessionRewardReceiptState(right);
    var merged = { loot:{ sessionRewardReceipts:{}, sessionRewardReceiptTombstones:{} } };
    new Set(Object.keys(l.tombstones).concat(Object.keys(r.tombstones))).forEach(function(sessionId){
      var a = l.tombstones[sessionId], b = r.tombstones[sessionId];
      var ar = l.receipts[sessionId], br = r.receipts[sessionId];

      var tombstonesDiffer = !!(a && b && JSON.stringify(a) !== JSON.stringify(b));
      var receiptsDiffer = false;
      if (ar && br){
        var la = _deepClone(ar), lb = _deepClone(br);
        la.at = 0; lb.at = 0;
        receiptsDiffer = JSON.stringify(lrCanonicalRewardValue(la)) !== JSON.stringify(lrCanonicalRewardValue(lb));
      }

      if (tombstonesDiffer || receiptsDiffer){
        if (!lrIsSharedKeyReceiptId(sessionId)){
          throw new Error("Conflicting session reward receipt for " + sessionId + "; merge refused");
        }
        var picked = lrPickSharedKeyReceipt(ar, br, a, b);
        if (picked.tombstone) merged.loot.sessionRewardReceiptTombstones[sessionId] = _deepClone(picked.tombstone);
        if (picked.receipt)   merged.loot.sessionRewardReceipts[sessionId] = _deepClone(picked.receipt);
        return;
      }

      merged.loot.sessionRewardReceiptTombstones[sessionId] = _deepClone(a || b);
      if (ar && br){
        var times = [Number(ar.at)||0, Number(br.at)||0].filter(function(value){ return value > 0; });
        var chosen = _deepClone(ar);
        chosen.at = times.length ? Math.min.apply(Math, times) : 0;
        merged.loot.sessionRewardReceipts[sessionId] = chosen;
      } else if (ar || br){
        merged.loot.sessionRewardReceipts[sessionId] = _deepClone(ar || br);
      }
    });
    return lrCompactSessionRewardReceiptState(merged);
  }

  function lrAssertSessionRewardCapacity(s, sessionId, action, minutes){
    sessionId = lrRewardReceiptSessionId(sessionId);
    s = s || _state();
    if (!s || !s.loot || typeof s.loot !== "object" || Array.isArray(s.loot)){
      throw new Error("Session reward capacity check requires shaped loot state");
    }
    /* Preflight is deliberately clone-only. A rejected helper/direct call
       must not normalize legacy details or evict retained detail before the
       enclosing accounting transaction has committed successfully. */
    var holder = { loot:{
      sessionRewardReceipts:_deepClone(s.loot.sessionRewardReceipts || {}),
      sessionRewardReceiptTombstones:_deepClone(s.loot.sessionRewardReceiptTombstones || {})
    }};
    var compact = lrCompactSessionRewardReceiptState(holder);
    if (compact.tombstones[sessionId]) return compact;
    if (compact.proofCount >= LR_SESSION_REWARD_TOMBSTONE_CAP){
      throw new Error("Session reward proof capacity exhausted; reward refused until durable ledger integration");
    }
    var probe = _deepClone(compact.tombstones);
    probe[sessionId] = {
      policyVersion:LR_SESSION_REWARD_POLICY_VERSION,
      semanticCommitment:lrRewardSemanticCommitment(sessionId, action, minutes, LR_SESSION_REWARD_POLICY_VERSION),
      contentCommitment:"sha256:" + "0".repeat(64)
    };
    if (lrSessionRewardStorageBytes({}, probe) > LR_SESSION_REWARD_STORAGE_BYTE_CAP){
      throw new Error("Session reward proof byte capacity exhausted; reward refused until durable ledger integration");
    }
    return compact;
  }

  function lrTemplateSources(templateId){
    return LR_SOURCE_OVERRIDES[templateId] || ["Fight","Hunt","Loot"];
  }

  function lrPityMultiplier(rarity, count){
    var th = LR_PITY_THRESHOLD[rarity];
    if (!isFinite(th) || count < th) return 1.0;
    return 1.0 + Math.min(0.6, (count - th) / (th * 0.5) * 0.6);
  }

  function lrRarityWeightsForAction(action, pityCounts){
    action = (window.FH_GAMEPLAY_CONTROLS && typeof window.FH_GAMEPLAY_CONTROLS.rewardSourceForAction === "function")
      ? window.FH_GAMEPLAY_CONTROLS.rewardSourceForAction(action)
      : action;
    var base = LR_SOURCE_WEIGHTS[action] || LR_SOURCE_WEIGHTS.Fight;
    var out = {};
    var sum = 0;
    for (var i=0; i<LR_RARITIES.length; i++){
      var r = LR_RARITIES[i];
      var w = (base[r] || 0) * lrPityMultiplier(r, (pityCounts && pityCounts[r]) || 0);
      out[r] = w; sum += w;
    }
    if (sum <= 0) return Object.assign({}, base);
    for (var j=0; j<LR_RARITIES.length; j++) out[LR_RARITIES[j]] = out[LR_RARITIES[j]] / sum;
    return out;
  }

  function lrEligibleTemplates(action, minutes, sourceState, zoneId){
    action = (window.FH_GAMEPLAY_CONTROLS && typeof window.FH_GAMEPLAY_CONTROLS.rewardSourceForAction === "function")
      ? window.FH_GAMEPLAY_CONTROLS.rewardSourceForAction(action)
      : action;
    var allowed = _allowedRaritiesForMinutes(minutes);
    var TABLE = _LOOT_TABLE() || [];
    var source = sourceState || _state() || {};
    var region = typeof window.wdGearForZone === "function" ? window.wdGearForZone(zoneId || source.world && source.world.currentZone) : null;
    return TABLE.filter(function(it){
      if (!allowed.has(it[2])) return false;
      if (_isEquippableSlot(_lootSlot(it))) {
        if (action !== "Fight") return false;
        return !region || region.indexOf(_lootId(it)) >= 0;
      }
      if (action === "Fight") return false;
      var sources = lrTemplateSources(_lootId(it));
      return sources.indexOf(action) >= 0;
    });
  }

  function lrPickTemplateInRarity(action, rarity, minutes, rng, sourceState, zoneId){
    var eligible = lrEligibleTemplates(action, minutes, sourceState, zoneId).filter(function(it){ return it[2] === rarity; });
    if (!eligible.length) return null;
    /* v9 dedup: don't hand back an item you already own until the rarity pool is
       exhausted. Draw only from UNOWNED eligible templates; once you own them all,
       fall back to the full pool (those dupes get auto-converted to materials in
       lrCommitDrop). Hearthstone-style "no dupes until the set is complete". */
    var owned = ((sourceState || _state() || {}).lootOwned) || {};
    var unowned = eligible.filter(function(it){ return !((owned[_lootId(it)]|0) > 0); });
    var pool = unowned.length ? unowned : eligible;
    var total = 0;
    for (var i=0; i<pool.length; i++) total += (pool[i][3] || 1);
    var roll = rng() * total;
    for (var j=0; j<pool.length; j++){
      roll -= (pool[j][3] || 1);
      if (roll <= 0) return pool[j];
    }
    return pool[pool.length - 1];
  }

  function lrRollAffix(rng, excludeIds){
    rng = rng || Math.random;
    var candidates = Object.keys(LR_AFFIX_DEFS).filter(function(k){ return !LR_AFFIX_DEFS[k].retired && !LR_AFFIX_DEFS[k].fixedOnly && (!excludeIds || !excludeIds.has(k)); });
    if (!candidates.length) return null;
    var id = candidates[Math.floor(rng() * candidates.length)];
    var def = LR_AFFIX_DEFS[id];
    var r = rng();
    var tier = r < 0.6 ? "minor" : r < 0.9 ? "major" : "grand";
    var range = def[tier];
    var lo = range[0], hi = range[1];
    var value = Math.floor(lo + rng() * (hi - lo + 1));
    return { id:id, tier:tier, value:value, fixed:false };
  }

  function lrMintInstance(template, opts){
    opts = opts || {};
    var rng = opts.rng || Math.random;
    var tier = template[2];
    var templateId = _lootId(template);
    var caps = LR_RARITY_CAPS[tier] || LR_RARITY_CAPS.common;
    var baseline = lrBaselineAffix(templateId);
    var affixes = [];
    if (baseline) affixes.push(JSON.parse(JSON.stringify(baseline)));
    var additional = Math.max(0, caps.affixes - (baseline ? 1 : 0));
    var exclude = new Set(baseline ? [baseline.id] : []);
    for (var i=0; i<additional; i++){
      var a = lrRollAffix(rng, exclude);
      if (a){ affixes.push(a); exclude.add(a.id); }
    }
    var sockets = [];
    for (var k=0; k<caps.sockets; k++) sockets.push({ gemId:null });
    var createdAt = _now();
    return {
      iid: opts.iid || _uid(),
      lootId: templateId,
      tier: tier,
      level: 0,
      affixes: affixes,
      sockets: sockets,
      dyeId: null,
      createdAt: createdAt,
      updatedAt: createdAt,
      source: opts.source || { kind:"drop" },
      locked: false
    };
  }

  function lrInstanceStats(instance){
    if (!instance) return {};
    var out = {};
    var mult = 1 + (instance.level|0) * 0.08;
    var affs = instance.affixes || [];
    for (var i=0; i<affs.length; i++){
      var a = affs[i];
      if (!a || (LR_AFFIX_DEFS[a.id] && LR_AFFIX_DEFS[a.id].retired)) continue;
      out[a.id] = (out[a.id] || 0) + Math.max(1, Math.floor(a.value * mult));
    }
    var socks = instance.sockets || [];
    for (var j=0; j<socks.length; j++){
      var s = socks[j];
      if (s && s.gemId){
        var g = LR_GEM_DEFS[s.gemId];
        if (g) out[g.affixId] = (out[g.affixId] || 0) + g.value;
      }
    }
    return out;
  }

  function lrEquippedStats(hero, sourceState){
    var s = sourceState || _state();
    hero = hero || (s && s.hero);
    var totals = {};
    if (!hero || !hero.equipped) return totals;
    var slots = _EQUIP_SLOTS() || [];
    for (var i=0; i<slots.length; i++){
      var slot = slots[i];
      var slotEq = hero.equipped[slot];
      if (!slotEq) continue;
      var inst = null;
      if (slotEq.instanceId && s.lootInstances) inst = s.lootInstances[slotEq.instanceId];
      if (!inst){
        var tmpl = _lootById(slotEq.lootId);
        if (!tmpl) continue;
        var baseline = lrBaselineAffix(slotEq.lootId);
        inst = { affixes: baseline ? [baseline] : [], sockets:[], level:0 };
      }
      var st = lrInstanceStats(inst);
      for (var k in st){ if (Object.prototype.hasOwnProperty.call(st,k)) totals[k] = (totals[k] || 0) + st[k]; }
    }
    return totals;
  }

  /* ---------- customization ---------- */

  function lrRerollAffix(s, iid, affixIndex, opts){
    s = lrEnsureShape(s || _state());
    opts = opts || {};
    var inst = s.lootInstances[iid];
    if (!inst) return { ok:false, reason:"unknown_instance" };
    if (!lrInstanceSupportsForgeMutation(inst)) return { ok:false, reason:"unsupported_slot", slot:lrInstanceSlot(inst) };
    if (inst.locked) return { ok:false, reason:"locked" };
    var a = inst.affixes && inst.affixes[affixIndex];
    if (!a) return { ok:false, reason:"unknown_affix" };
    if (a.fixed) return { ok:false, reason:"fixed_affix" };
    var cost = LR_REROLL_DUST[inst.tier] || 5;
    var dust = (s.loot.materials.dust|0);
    if (dust < cost) return { ok:false, reason:"insufficient_dust", need:cost, have:dust };
    var exclude = new Set(inst.affixes.map(function(x){ return x.id; }).filter(function(_, idx){ return idx !== affixIndex; }));
    var next = lrRollAffix(opts.rng || Math.random, exclude);
    if (!next) return { ok:false, reason:"no_pool" };
    var before = JSON.parse(JSON.stringify(a));
    inst.affixes[affixIndex] = next;
    inst.updatedAt = _now();
    s.loot.materials.dust = dust - cost;
    return { ok:true, before:before, after:next, costPaid:cost };
  }

  function lrUpgradeInstance(s, iid){
    s = lrEnsureShape(s || _state());
    var inst = s.lootInstances[iid];
    if (!inst) return { ok:false, reason:"unknown_instance" };
    if (!lrInstanceSupportsForgeMutation(inst)) return { ok:false, reason:"unsupported_slot", slot:lrInstanceSlot(inst) };
    var caps = LR_RARITY_CAPS[inst.tier] || LR_RARITY_CAPS.common;
    if (inst.level >= caps.maxLevel) return { ok:false, reason:"max_level", cap:caps.maxLevel };
    var nextLevel = inst.level + 1;
    var shardsCost = nextLevel * 10;
    var coinCost   = nextLevel * 25;
    var haveShards = s.loot.materials.shards|0;
    var haveCoins  = s.coins|0;
    if (haveShards < shardsCost) return { ok:false, reason:"insufficient_shards", need:shardsCost, have:haveShards };
    if (haveCoins  < coinCost)   return { ok:false, reason:"insufficient_coins",  need:coinCost,   have:haveCoins };
    inst.level = nextLevel;
    inst.updatedAt = _now();
    s.loot.materials.shards = haveShards - shardsCost;
    s.coins = haveCoins - coinCost;
    s.coinsSpent = (s.coinsSpent|0) + coinCost;
    return { ok:true, level:nextLevel, shardsPaid:shardsCost, coinsPaid:coinCost };
  }

  function lrSocketGem(s, iid, socketIdx, gemId){
    s = lrEnsureShape(s || _state());
    var inst = s.lootInstances[iid];
    if (!inst) return { ok:false, reason:"unknown_instance" };
    if (!lrInstanceSupportsForgeMutation(inst)) return { ok:false, reason:"unsupported_slot", slot:lrInstanceSlot(inst) };
    if (inst.locked) return { ok:false, reason:"locked" };
    if (socketIdx < 0 || socketIdx >= inst.sockets.length) return { ok:false, reason:"no_socket" };
    if (inst.sockets[socketIdx].gemId) return { ok:false, reason:"socket_full" };
    if (!LR_GEM_DEFS[gemId]) return { ok:false, reason:"unknown_gem" };
    var owned = s.loot.gemsOwned[gemId]|0;
    if (owned <= 0) return { ok:false, reason:"no_gem_owned" };
    s.loot.gemsOwned[gemId] = owned - 1;
    inst.sockets[socketIdx] = { gemId:gemId };
    inst.updatedAt = _now();
    return { ok:true, gemId:gemId, socketIdx:socketIdx };
  }

  function lrUnsocketGem(s, iid, socketIdx){
    s = lrEnsureShape(s || _state());
    var inst = s.lootInstances[iid];
    if (!inst) return { ok:false, reason:"unknown_instance" };
    if (!lrInstanceSupportsForgeMutation(inst)) return { ok:false, reason:"unsupported_slot", slot:lrInstanceSlot(inst) };
    if (inst.locked) return { ok:false, reason:"locked" };
    if (socketIdx < 0 || socketIdx >= inst.sockets.length) return { ok:false, reason:"no_socket" };
    var g = inst.sockets[socketIdx].gemId;
    if (!g) return { ok:false, reason:"empty_socket" };
    inst.sockets[socketIdx] = { gemId:null };
    inst.updatedAt = _now();
    return { ok:true, destroyed:g };
  }

  function lrApplyDye(s, iid, dyeId){
    s = lrEnsureShape(s || _state());
    var inst = s.lootInstances[iid];
    if (!inst) return { ok:false, reason:"unknown_instance" };
    if (!lrInstanceSupportsForgeMutation(inst)) return { ok:false, reason:"unsupported_slot", slot:lrInstanceSlot(inst) };
    if (dyeId !== null && !LR_DYE_DEFS[dyeId]) return { ok:false, reason:"unknown_dye" };
    if (dyeId !== null && !(s.loot.dyesOwned[dyeId]|0)) return { ok:false, reason:"no_dye_owned" };
    inst.dyeId = dyeId;
    inst.updatedAt = _now();
    return { ok:true, dyeId:dyeId };
  }

  function lrSalvageInstance(s, iid, opts){
    s = lrEnsureShape(s || _state());
    opts = opts || {};
    var rng = opts.rng || Math.random;
    var inst = s.lootInstances[iid];
    if (!inst) return { ok:false, reason:"unknown_instance" };
    if (inst.locked) return { ok:false, reason:"locked" };
    var yieldRow = LR_SALVAGE_YIELD[inst.tier] || LR_SALVAGE_YIELD.common;
    s.loot.materials.dust    = (s.loot.materials.dust|0)    + yieldRow.dust;
    s.loot.materials.shards  = (s.loot.materials.shards|0)  + yieldRow.shards;
    s.loot.materials.essence = (s.loot.materials.essence|0) + yieldRow.essence;
    var gemDropped = null;
    if (yieldRow.gemChance > 0 && rng() < yieldRow.gemChance){
      var gemIds = Object.keys(LR_GEM_DEFS);
      gemDropped = gemIds[Math.floor(rng() * gemIds.length)];
      s.loot.gemsOwned[gemDropped] = (s.loot.gemsOwned[gemDropped]|0) + 1;
    }
    if (s.hero && s.hero.equipped){
      var slots = _EQUIP_SLOTS() || [];
      for (var i=0; i<slots.length; i++){
        var slot = slots[i];
        if (s.hero.equipped[slot] && s.hero.equipped[slot].instanceId === iid){
          s.hero.equipped[slot] = null;
        }
      }
    }
    s.loot.instanceTombstones[iid] = Math.max(
      Number(s.loot.instanceTombstones[iid]) || 0,
      Number(inst.updatedAt) || 0,
      Number(inst.createdAt) || 0,
      Number(opts.tombstoneAt) || _now()
    );
    delete s.lootInstances[iid];
    return { ok:true, yield:yieldRow, gemDropped:gemDropped };
  }

  function lrToggleLock(s, iid){
    s = lrEnsureShape(s || _state());
    var inst = s.lootInstances[iid];
    if (!inst) return { ok:false, reason:"unknown_instance" };
    inst.locked = !inst.locked;
    inst.updatedAt = _now();
    return { ok:true, locked:inst.locked };
  }

  /* ---------- combat ---------- */

  function lrWorldEnemyRow(enemy, zoneId){
    if (Array.isArray(enemy)) return enemy;
    if (!enemy || typeof enemy !== "object") return null;
    var row = [
      enemy.tier || "t1",
      String(enemy.id || "focus_wisp"),
      enemy.sym || "✦",
      enemy.name || "Focus Wisp",
      Math.max(1, enemy.level|0),
      Math.max(1, enemy.hp|0),
      []
    ];
    row.__lrTraits = {
      tags:Array.isArray(enemy.tags) ? enemy.tags.slice() : [],
      weak:Array.isArray(enemy.weak) ? enemy.weak.slice() : [],
      resist:Array.isArray(enemy.resist) ? enemy.resist.slice() : [],
      dmg:Math.max(1, enemy.dmg|0),
      acc:Number(enemy.acc) > 0 ? Number(enemy.acc) : 0.85,
      boss:!!enemy.boss
    };
    row.__lrZone = String(zoneId || (Array.isArray(enemy.biomes) && enemy.biomes[0]) || "verdant_vale");
    return row;
  }

  function lrEnemyIsBoss(enemyRow){
    if (!enemyRow) return false;
    if (enemyRow.__lrTraits && enemyRow.__lrTraits.boss) return true;
    var traits = LR_MONSTER_TRAITS[enemyRow[1]];
    return !!(traits && traits.boss);
  }

  function lrZoneEnemyRows(zoneId){
    if (!zoneId || typeof window.wdEnemiesForZone !== "function") return [];
    var worldEnemies = window.wdEnemiesForZone(zoneId) || [];
    return worldEnemies.map(function(enemy){ return lrWorldEnemyRow(enemy, zoneId); }).filter(Boolean);
  }

  function lrPickEnemy(level, rng, zoneId){
    rng = rng || Math.random;
    var zoneRows = lrZoneEnemyRows(zoneId).filter(function(enemy){ return !lrEnemyIsBoss(enemy); });
    var MS = zoneRows.length
      ? zoneRows
      : (_MONSTERS() || []).filter(function(enemy){ return !lrEnemyIsBoss(enemy); });
    var lv = Math.max(1, level|0);
    var candidates = MS.filter(function(m){ return m[4] <= lv + 5 && m[4] >= lv - 30; });
    var pool = candidates.length ? candidates : MS.slice(0,3);
    if (!pool.length){
      var fallback = ["t1","focus_wisp","✦","Focus Wisp",1,3,["common"]];
      fallback.__lrTraits = { tags:["spirit"], weak:[], resist:[], dmg:3, acc:0.8, boss:false };
      fallback.__lrZone = String(zoneId || "verdant_vale");
      return fallback;
    }
    var total = 0;
    var weights = pool.map(function(m){
      var dist = Math.abs(m[4] - lv);
      var w = 1 / (1 + dist * 0.4);
      if (m[4] > lv) w *= 0.5;
      if (m[0] === "t5" && lv < m[4]) w *= 0.25;
      total += w;
      return w;
    });
    var roll = rng() * total;
    for (var i=0; i<pool.length; i++){
      roll -= weights[i];
      if (roll <= 0) return pool[i];
    }
    return pool[0];
  }

  function lrPickBossEnemy(level, rng, zoneId){
    rng = rng || Math.random;
    if (typeof window.wdPickBoss === "function"){
      var worldBoss = window.wdPickBoss(Math.max(1, level|0), zoneId, rng);
      var worldRow = lrWorldEnemyRow(worldBoss, zoneId);
      if (worldRow) return worldRow;
    }
    var legacyBosses = (_MONSTERS() || []).filter(lrEnemyIsBoss);
    if (legacyBosses.length) return legacyBosses[Math.floor(rng() * legacyBosses.length)];
    var fallback = ["t5","focus_colossus","◆","Focus Colossus",Math.max(1,level|0),60,["epic"]];
    fallback.__lrTraits = { tags:["boss"], weak:[], resist:[], dmg:40, acc:0.9, boss:true };
    fallback.__lrZone = String(zoneId || "verdant_vale");
    return fallback;
  }

  function lrResolveEncounter(ctx, encounterIdx, rng){
    rng = rng || Math.random;
    var enemyRow = ctx.enemyOverride || lrPickEnemy(ctx.heroLevel, rng, ctx.zoneId);
    var enemyId = enemyRow[1];
    var traits = enemyRow.__lrTraits || LR_MONSTER_TRAITS[enemyId] || { tags:[], weak:[], resist:[], dmg:10, acc:0.85 };
    var stats = ctx.heroStats || {};
    /* Physical damage used to be rolled and displayed on gear but ignored by
       the encounter formula. Keep the level baseline, then route the equipped
       weapon's capped physical power through the same deterministic combat. */
    var baseAtk = 8 + Math.floor((ctx.heroLevel || 1) * 1.5) + Math.max(0, stats.dmgPhys || 0);
    var atkByType = {
      dmgFire:   stats.dmgFire   || 0,
      dmgFrost:  stats.dmgFrost  || 0,
      dmgArcane: stats.dmgArcane || 0,
      dmgPoison: stats.dmgPoison || 0
    };
    var primary = "dmgPhys", primaryAmt = 0;
    var types = ["dmgFire","dmgFrost","dmgArcane","dmgPoison"];
    for (var ti=0; ti<types.length; ti++){
      var tt = types[ti];
      if (atkByType[tt] > primaryAmt){ primary = tt; primaryAmt = atkByType[tt]; }
    }
    var heroHP = Math.max(5, Math.min(100, (ctx.heroHP|0) || 100));
    var enemyHPMax = Math.max(5, Math.round(enemyRow[5] * (1 + 0.04 * ((ctx.heroLevel||1) - enemyRow[4]))));
    var enemyHP = enemyHPMax;
    var heroHPStart = heroHP;
    var critChance = Math.min(60, stats.critPct || 0);
    var dodgeChance = Math.min(50, stats.dodgePct || 0);
    var defense = Math.min(80, (stats.resPhys || 0) + (stats.resElem || 0) * 0.5);
    var lifesteal = Math.min(20, stats.lifesteal || 0);
    var log = [];
    for (var round=1; round<=4 && enemyHP > 0 && heroHP > 0; round++){
      var weakness = traits.weak.indexOf(primary) >= 0 ? 1.5 : 1.0;
      var resist   = traits.resist.indexOf(primary) >= 0 ? 0.5 : 1.0;
      var crit     = rng() < critChance/100 ? 1.8 : 1.0;
      var dealt = Math.max(1, Math.round((baseAtk + primaryAmt) * weakness * resist * crit));
      enemyHP -= dealt;
      var entry = { round:round, hero:dealt, weak:weakness>1, resist:resist<1, crit:crit>1, enemyAfter:Math.max(0,enemyHP) };
      log.push(entry);
      if (enemyHP <= 0) break;
      var dodged = rng() < dodgeChance/100;
      if (!dodged){
        var incoming = Math.max(1, Math.round(traits.dmg * (1 - defense/100) * (1/Math.max(0.3, traits.acc))));
        heroHP -= incoming;
        entry.enemy = incoming; entry.dodged = false;
      } else {
        entry.enemy = 0; entry.dodged = true;
      }
    }
    var outcome;
    var killed = false;
    if (enemyHP <= 0){
      killed = true;
      if (log.length <= 2 && heroHPStart - heroHP < 10) outcome = "clean";
      else if (log.length <= 3 && heroHP >= heroHPStart * 0.5) outcome = "solid";
      else outcome = "battered";
    } else if (heroHP <= 0){
      outcome = "whiff";
      heroHP = 1;
    } else {
      outcome = "battered";
    }
    if (outcome === "clean" && lifesteal > 0){
      var restored = Math.round((heroHPStart - heroHP) * (lifesteal/100));
      heroHP = Math.min(100, heroHP + restored);
    }
    return {
      encounterIdx: encounterIdx,
      enemy: { id:enemyId, sym:enemyRow[2], name:enemyRow[3], level:enemyRow[4], hpMax:enemyHPMax,
               tier:enemyRow[0], weak:traits.weak, resist:traits.resist, boss:!!traits.boss,
               zoneId:enemyRow.__lrZone || ctx.zoneId || null },
      heroHPStart: heroHPStart, heroHPEnd: heroHP,
      primary: primary, primaryAmt: primaryAmt, baseAtk: baseAtk,
      rounds: log,
      outcome: outcome, killed: killed
    };
  }

  function lrRollDropForEncounter(s, action, minutes, enemyRow, outcome, rng, utilityCtx){
    s = lrEnsureShape(s || _state());
    rng = rng || Math.random;
    var zoneId = utilityCtx && utilityCtx.zoneId || (s.world && s.world.currentZone) || "verdant_vale";
    var bias = LR_OUTCOME_BIAS[outcome] || 1.0;
    if (bias <= 0) return null;
    var weights = lrRarityWeightsForAction(action, s.loot.pity);
    var biased = {};
    var sum = 0;
    for (var i=0; i<LR_RARITIES.length; i++){
      var r = LR_RARITIES[i];
      var m = (r === "common") ? 1.0 : bias;
      biased[r] = weights[r] * m;
      sum += biased[r];
    }
    var gearUtility = null;
    if ((!utilityCtx || utilityCtx.enabled !== false) && typeof window.fhGearUtilityAdjustRarityWeights === "function"){
      try {
        gearUtility = window.fhGearUtilityAdjustRarityWeights(biased, s, {
          action:action,
          minutes:minutes,
          sessionId:utilityCtx && utilityCtx.sessionId || null
        });
        if (gearUtility && gearUtility.weights) biased = gearUtility.weights;
      } catch (_) { gearUtility = null; }
    }
    sum = 0;
    for (var gi=0; gi<LR_RARITIES.length; gi++) sum += Math.max(0, biased[LR_RARITIES[gi]] || 0);
    if (sum > 0) for (var j=0; j<LR_RARITIES.length; j++) biased[LR_RARITIES[j]] /= sum;
    var allowed = _allowedRaritiesForMinutes(minutes);
    var regional = action === "Fight" ? lrEligibleTemplates(action, minutes, s, zoneId) : null;
    var sum2 = 0;
    for (var k=0; k<LR_RARITIES.length; k++){
      var rr = LR_RARITIES[k];
      if (!allowed.has(rr) || (regional && !regional.some(function(item){ return item[2] === rr; }))) biased[rr] = 0;
      sum2 += biased[rr];
    }
    if (sum2 <= 0) return null;
    for (var l=0; l<LR_RARITIES.length; l++) biased[LR_RARITIES[l]] /= sum2;
    var roll = rng();
    var rarity = "common";
    var cum = 0;
    var ratio = 0;
    for (var n=0; n<LR_RARITIES.length; n++){
      var rn = LR_RARITIES[n];
      cum += biased[rn];
      if (roll <= cum){ rarity = rn; ratio = biased[rn]; break; }
    }
    var template = null;
    var fromMonsterTable = false;
    if (enemyRow && LR_MONSTER_DROPS[enemyRow[1]] && rng() < 0.65){
      var pool = LR_MONSTER_DROPS[enemyRow[1]];
      var matching = Object.keys(pool).filter(function(id){
        var t = _lootById(id);
        return t && t[2] === rarity && lrEligibleTemplates(action, minutes, s, zoneId).indexOf(t) >= 0;
      });
      var ownedMap = (s.lootOwned) || {};
      var matchingUnowned = matching.filter(function(id){ return !((ownedMap[id]|0) > 0); });
      if (matchingUnowned.length) matching = matchingUnowned;
      if (matching.length){
        var total = 0;
        for (var x=0; x<matching.length; x++) total += pool[matching[x]];
        var rPick = rng() * total;
        for (var y=0; y<matching.length; y++){
          rPick -= pool[matching[y]];
          if (rPick <= 0){ template = _lootById(matching[y]); fromMonsterTable = true; break; }
        }
      }
    }
    if (!template) template = lrPickTemplateInRarity(action, rarity, minutes, rng, s, zoneId);
    if (!template) return null;
    return {
      rarity: rarity, template: template,
      odds: {
        ratio:ratio,
        rolled:roll,
        gearUtilityPct:gearUtility ? (gearUtility.qualityBiasPct|0) : 0,
        gearUtilitySources:gearUtility && Array.isArray(gearUtility.sources) ? gearUtility.sources.slice(0,5) : []
      },
      pity: { tier:rarity, sinceLast:s.loot.pity[rarity]|0, bumped:lrPityMultiplier(rarity, s.loot.pity[rarity]) > 1 },
      fromMonsterTable: fromMonsterTable
    };
  }

  function lrCommitDrop(s, drop, ctx){
    s = lrEnsureShape(s || _state());
    ctx = ctx || {};
    var template = drop.template;
    var templateId = _lootId(template);
    var __wasOwned = ((s.lootOwned[templateId]|0) > 0); /* v9: owned before this drop => duplicate */
    var instance = lrMintInstance(template, {
      rng:ctx.rng,
      iid:ctx.instanceId || null,
      source:{ kind:ctx.sourceKind||"drop", action:ctx.action, enemyId:ctx.enemyId, zoneId:ctx.zoneId || null }
    });
    s.lootInstances[instance.iid] = instance;
    s.lootOwned[templateId] = (s.lootOwned[templateId]|0) + 1;
    var idx = LR_RARITIES.indexOf(drop.rarity);
    if (idx >= 0){
      for (var i=0; i<=idx; i++){
        s.loot.pity[LR_RARITIES[i]] = 0;
      }
    }
    for (var j=idx+1; j<LR_RARITIES.length; j++){
      s.loot.pity[LR_RARITIES[j]] = (s.loot.pity[LR_RARITIES[j]]|0) + 1;
    }
    if (ctx.enemyId && s.bestiary && s.bestiary[ctx.enemyId]){
      var ent = s.bestiary[ctx.enemyId];
      if (!ent.drops || typeof ent.drops !== "object") ent.drops = {};
      ent.drops[templateId] = (ent.drops[templateId]|0) + 1;
      ent.lastEncounteredAt = _now();
    }
    var entry = {
      id: ctx.dropId || _uid(), at: _now(),
      sessionId: ctx.sessionId || null,
      iid: instance.iid,
      templateId: templateId,
      rarity: drop.rarity,
      sourceAction: ctx.action,
      enemyId: ctx.enemyId || null,
      zoneId: ctx.zoneId || null,
      odds: {
        rolled: drop.odds.rolled,
        total: 1,
        ratio: drop.odds.ratio,
        gearUtilityPct:drop.odds.gearUtilityPct|0,
        gearUtilitySources:Array.isArray(drop.odds.gearUtilitySources) ? drop.odds.gearUtilitySources.slice(0,5) : []
      },
      pity: drop.pity,
      fromMonsterTable: !!drop.fromMonsterTable,
      outcome: ctx.outcome || null,
      earnedAtMinutes: Math.max(0, ctx.earnedAtMinutes|0),
      rewardOrdinal: Math.max(0, ctx.rewardOrdinal|0)
    };
    if (ctx.editEntitlementId){
      entry.editEntitlementId = String(ctx.editEntitlementId);
      entry.editThreshold = Math.max(0, ctx.editThreshold|0);
    }
    s.loot.drops.push(entry);
    if (s.loot.drops.length > LR_DROP_LOG_CAP) s.loot.drops.shift();
    var flags = (s.lootRework && s.lootRework.flags) || {};
    /* v9: a drop you ALREADY own is a duplicate (rarity pool exhausted -- see
       lrPickTemplateInRarity). Auto-convert it to materials so dupes still feel
       rewarding instead of "the same item again". Opt-out via flag; default on. */
    if (!ctx.disableAutoSalvage && __wasOwned && flags.autoSalvageDupes !== false){
      var __sv = lrSalvageInstance(s, instance.iid, {
        rng:ctx.rng,
        tombstoneAt:Number.MAX_SAFE_INTEGER - lrHashStr(String(ctx.sessionId || "") + "|" + instance.iid)
      });
      if (__sv && __sv.ok){
        entry.autoSalvaged = true; entry.dupeConverted = true;
        var __y = __sv.yield || {};
        entry.autoSalvageYield = { dust:__y.dust|0, shards:__y.shards|0, essence:__y.essence|0, gemId:__sv.gemDropped||null };
        var __tname = (template[1] || templateId);
        var __bits = [];
        if (__y.dust)    __bits.push("+"+__y.dust+" dust");
        if (__y.shards)  __bits.push("+"+__y.shards+" Forge Shards");
        if (__y.essence) __bits.push("+"+__y.essence+" essence");
        if (__sv.gemDropped && LR_GEM_DEFS[__sv.gemDropped]) __bits.push("+"+LR_GEM_DEFS[__sv.gemDropped].sym+" "+LR_GEM_DEFS[__sv.gemDropped].name);
        try { _toast("♻️ Duplicate "+__tname+" -> "+(__bits.join(", ")||"materials"), "info"); } catch(_){}
      }
    } else if (!ctx.disableAutoSalvage && flags.autoSalvageCommonDupes && drop.rarity === "common"){
      var dupes = 0;
      var keys = Object.keys(s.lootInstances);
      for (var k=0; k<keys.length; k++){
        var it = s.lootInstances[keys[k]];
        if (it.lootId === templateId) dupes++;
      }
      if (dupes >= 4){
        var __commonSalvage = lrSalvageInstance(s, instance.iid, {
          rng:ctx.rng,
          tombstoneAt:Number.MAX_SAFE_INTEGER - lrHashStr(String(ctx.sessionId || "") + "|" + instance.iid)
        });
        entry.autoSalvaged = true;
        if (__commonSalvage && __commonSalvage.ok){ var __cy=__commonSalvage.yield||{}; entry.autoSalvageYield={dust:__cy.dust|0,shards:__cy.shards|0,essence:__cy.essence|0,gemId:__commonSalvage.gemDropped||null}; }
      }
    }
    return entry;
  }

  /* Session-history edit loot is an entitlement at a newly crossed minute
     wall, not a fresh live session. Roll exactly once with the same rarity
     weights/template pools as a normal session, but use a stable
     session+threshold seed and keep the drop on the canonical session id so
     an edit-down can reverse the exact item. Auto-salvage is disabled only for
     these reversible entitlements; otherwise materials could not be clawed
     back exactly after the source item had already been converted. */
  function lrGrantEditThresholdEntitlement(s, opts){
    s = lrEnsureShape(s || _state());
    opts = opts || {};
    var sessionId = String(opts.sessionId || "");
    var threshold = Math.max(0, opts.threshold|0);
    var minutes = Math.max(0, opts.minutes|0);
    var action = opts.action || "Loot";
    if (!sessionId || !threshold || minutes < threshold){
      return { ok:false, reason:"invalid_entitlement" };
    }
    var entitlementId = sessionId + "|loot-threshold|" + threshold;
    var rng = lrSeededRng(lrHashStr(entitlementId));
    var allowed = Array.from(_allowedRaritiesForMinutes(minutes));
    /* Historical edit entitlements are bound to their original minute wall.
       Current equipment must not retroactively change or farm that roll. */
    var drop = lrRollDropForEncounter(s, action, minutes, null, "solid", rng, { enabled:false });
    if (!drop){
      return { ok:true, entitlementId:entitlementId, threshold:threshold,
        minutes:minutes, eligibleRarities:allowed, entry:null, instance:null };
    }
    var entry = lrCommitDrop(s, drop, {
      sessionId:sessionId, action:action, enemyId:null, zoneId:zoneId, outcome:"solid", rng:rng,
      sourceKind:"session-edit-threshold", editEntitlementId:entitlementId,
      editThreshold:threshold, earnedAtMinutes:threshold, rewardOrdinal:Math.max(0,[5,25,50,90,120].indexOf(threshold)), disableAutoSalvage:true,
      instanceId:lrStableId("iid", entitlementId + "|instance"),
      dropId:lrStableId("drop", entitlementId + "|drop")
    });
    var instance = entry && entry.iid && s.lootInstances[entry.iid]
      ? _deepClone(s.lootInstances[entry.iid]) : null;
    return { ok:true, entitlementId:entitlementId, threshold:threshold,
      minutes:minutes, eligibleRarities:allowed, entry:entry, instance:instance };
  }

  function lrRunSessionCombat(s, opts){
    s = lrEnsureShape(s || _state());
    opts = opts || {};
    var action = opts.action || "Fight";
    var minutes = Math.max(0, opts.minutes|0);
    var sessionId = opts.sessionId || ("sess_" + _now());
    var rng = opts.rng || lrSeededRng(lrHashStr(sessionId));
    var heroStats = lrEquippedStats(s.hero, s);
    if (typeof window.fhGearUtilityCombatStats === "function"){
      try {
        heroStats = window.fhGearUtilityCombatStats(heroStats, s, {
          action:action,
          minutes:minutes,
          sessionId:sessionId
        }) || heroStats;
      } catch (_) {}
    }
    var heroLevel = (s.hero && s.hero.level)|0 || 1;
    var baseHP = (s.hero && s.hero.hp)|0 || 100;
    /* v9.8: only the Fight action runs the combat/encounter engine. Hunt is a
       quiet tracking source for hunt-tagged loot, not a mandatory animal fight. */
    var combatActions = { Fight:true };
    var isCombat = !!combatActions[action];
    var zoneId = String(opts.zoneId || (s.world && s.world.currentZone) || "verdant_vale");
    if (window.WD_ZONES && !window.WD_ZONES[zoneId]) throw new Error("Unknown session world");
    var journeyKey = "session:" + String(sessionId);
    if (s.world && s.world.journeySessionRewards && Object.prototype.hasOwnProperty.call(s.world.journeySessionRewards, journeyKey)) {
      return {encounters:[],drops:[],consumed:[],zoneId:zoneId,duplicate:true,boss:null};
    }
    var bossEligible = isCombat && (
      typeof window.wdShouldSpawnBoss === "function"
        ? window.wdShouldSpawnBoss(minutes, action)
        : minutes >= 90
    );
    var priorBossReceipt = bossEligible && typeof window.wdBossReceiptForSession === "function"
      ? window.wdBossReceiptForSession(s, sessionId)
      : null;
    if (priorBossReceipt){
      return {
        encounters:[], drops:[], consumed:[], zoneId:zoneId, duplicate:true,
        boss:{ eligible:true, duplicate:true, receipt:priorBossReceipt }
      };
    }
    var encounters = [];
    var drops = [];
    var runningHP = baseHP;
    var consumedLog = [];
    var bonusRerolls = 0;
    var buffResPhys = 0;
    if (isCombat && s.loot && s.loot.loadout){
      var slotKeys = ["slot1","slot2","slot3"];
      for (var sk=0; sk<slotKeys.length; sk++){
        var sn = slotKeys[sk];
        var consId = s.loot.loadout[sn];
        if (!consId) continue;
        var def = LR_CONSUMABLE_DEFS[consId];
        if (!def) continue;
        var owned = s.loot.consumables[consId]|0;
        if (owned <= 0) continue;
        if (def.effect.kind === "buff"){
          if (def.effect.affix === "resPhys") buffResPhys += def.effect.value;
          s.loot.consumables[consId] = owned - 1;
          consumedLog.push({ id:consId, slot:sn });
        } else if (def.effect.kind === "luck"){
          bonusRerolls += def.effect.rerolls;
          s.loot.consumables[consId] = owned - 1;
          consumedLog.push({ id:consId, slot:sn });
        }
      }
    }
    if (buffResPhys){
      heroStats.resPhys = (heroStats.resPhys|0) + buffResPhys;
    }
    var N = isCombat ? lrEncountersForMinutes(minutes) : 0;
    var bossEncounter = null;
    for (var i=0; i<N; i++){
      if (i > 0 && runningHP < 40 && s.loot && s.loot.loadout){
        var slotKeys2 = ["slot1","slot2","slot3"];
        for (var sk2=0; sk2<slotKeys2.length; sk2++){
          var snh = slotKeys2[sk2];
          var consIdH = s.loot.loadout[snh];
          if (!consIdH) continue;
          var defH = LR_CONSUMABLE_DEFS[consIdH];
          if (!defH || defH.effect.kind !== "heal") continue;
          var ownedH = s.loot.consumables[consIdH]|0;
          if (ownedH <= 0) continue;
          runningHP = Math.min(100, runningHP + defH.effect.value);
          s.loot.consumables[consIdH] = ownedH - 1;
          consumedLog.push({ id:consIdH, slot:snh, at:i });
          break;
        }
      }
      var bombBonus = null;
      if (s.loot && s.loot.loadout){
        var slotKeys3 = ["slot1","slot2","slot3"];
        for (var sk3=0; sk3<slotKeys3.length; sk3++){
          var snb = slotKeys3[sk3];
          var consIdB = s.loot.loadout[snb];
          if (!consIdB) continue;
          var defB = LR_CONSUMABLE_DEFS[consIdB];
          if (!defB || defB.effect.kind !== "bomb") continue;
          var ownedB = s.loot.consumables[consIdB]|0;
          if (ownedB <= 0) continue;
          bombBonus = defB.effect;
          s.loot.consumables[consIdB] = ownedB - 1;
          consumedLog.push({ id:consIdB, slot:snb, at:i });
          break;
        }
      }
      var encCtx = { heroStats:Object.assign({}, heroStats), heroLevel:heroLevel, heroHP:runningHP, zoneId:zoneId };
      encCtx.enemyOverride = bossEligible && i === N - 1
        ? lrPickBossEnemy(heroLevel, rng, zoneId)
        : lrPickEnemy(heroLevel, rng, zoneId);
      if (bombBonus){
        encCtx.heroStats[bombBonus.damageType] = (encCtx.heroStats[bombBonus.damageType] || 0) + bombBonus.value;
      }
      var enc = lrResolveEncounter(encCtx, i, rng);
      if (enc.enemy && enc.enemy.boss) bossEncounter = enc;
      runningHP = enc.heroHPEnd;
      encounters.push(enc);
      _recordEncounter(enc.enemy.id);
      if (enc.killed){
        (function tryRoll(rerollsLeft){
          var MS = _MONSTERS() || [];
          var enemyRow = null;
          for (var mi=0; mi<MS.length; mi++) if (MS[mi][1] === enc.enemy.id) { enemyRow = MS[mi]; break; }
          var d = lrRollDropForEncounter(s, action, minutes, enemyRow, enc.outcome, rng, {
            enabled:true,
            zoneId:zoneId,
            sessionId:sessionId
          });
          if (d){
            var ordinal = drops.length;
            var idBase = String(sessionId) + "|drop|" + ordinal;
            var e = lrCommitDrop(s, d, {
              sessionId:sessionId, action:action, enemyId:enc.enemy.id, zoneId:zoneId,
              outcome:enc.outcome, rng:rng,
              instanceId:lrStableId("iid", idBase + "|instance"),
              dropId:lrStableId("drop", idBase + "|entry"),
              earnedAtMinutes:[5,25,50,90,120][i] || 120, rewardOrdinal:i
            });
            drops.push(e);
          } else if (rerollsLeft > 0){
            tryRoll(rerollsLeft - 1);
          }
        })(bonusRerolls);
        bonusRerolls = 0;
      }
    }
    if (!isCombat && minutes > 0){
      var d = lrRollDropForEncounter(s, action, minutes, null, "solid", rng, {
        enabled:true,
        zoneId:zoneId,
        sessionId:sessionId
      });
      if (d){
        var ordinal = drops.length;
        var idBase = String(sessionId) + "|drop|" + ordinal;
        var e = lrCommitDrop(s, d, {
          sessionId:sessionId, action:action, enemyId:null, outcome:"solid",
          rng:rng,
          instanceId:lrStableId("iid", idBase + "|instance"),
          dropId:lrStableId("drop", idBase + "|entry"),
          earnedAtMinutes:5, rewardOrdinal:0
        });
        drops.push(e);
      }
    }
    if (s.hero && isCombat){
      s.hero.hp = Math.max(1, Math.min(100, runningHP));
    }
    var bossResult = null;
    if (bossEligible && bossEncounter){
      if (typeof window.wdRecordBossOutcome === "function"){
        var recorded = window.wdRecordBossOutcome(s, {
          sessionId:sessionId,
          action:action,
          minutes:minutes,
          zoneId:zoneId,
          bossId:bossEncounter.enemy.id,
          tier:bossEncounter.enemy.tier,
          defeated:!!bossEncounter.killed
        });
        bossResult = {
          eligible:true,
          duplicate:!!(recorded && recorded.duplicate),
          receipt:recorded && recorded.receipt || null,
          encounter:bossEncounter
        };
        if (recorded && recorded.receipt && recorded.receipt.shardsAwarded > 0){
          _toast("Boss defeated: " + bossEncounter.enemy.name + " · +" + recorded.receipt.shardsAwarded + " World Shards", "good");
        }
      } else {
        bossResult = { eligible:true, duplicate:false, receipt:null, encounter:bossEncounter };
      }
    }
    var journey = typeof window.wdRecordJourneySession === "function" ? window.wdRecordJourneySession(s,{
      sessionId:sessionId,action:action,minutes:minutes,zoneId:zoneId,encounters:encounters
    }) : null;
    if (journey && journey.unlockedZone) _toast("Route complete: " + window.WD_ZONES[journey.unlockedZone].label + " unlocked", "good");
    return { encounters:encounters, drops:drops, consumed:consumedLog, zoneId:zoneId, boss:bossResult, journey:journey, duplicate:false };
  }

  /* ---------- audio + visual ---------- */

  var _lrAudio = null;
  function lrEnsureAudio(){
    if (_lrAudio) return _lrAudio;
    try {
      var sampleRate = 8000;
      var length = Math.floor(sampleRate * 0.18);
      var data = new Uint8Array(44 + length);
      var writeStr = function(offset, s){ for (var i=0;i<s.length;i++) data[offset+i] = s.charCodeAt(i); };
      writeStr(0, "RIFF");
      data[4]=length+36;data[5]=0;data[6]=0;data[7]=0;
      writeStr(8, "WAVEfmt ");
      data[16]=16;data[20]=1;data[22]=1;data[24]=sampleRate&0xff;data[25]=(sampleRate>>8)&0xff;
      data[28]=sampleRate&0xff;data[29]=(sampleRate>>8)&0xff;
      data[32]=1;data[34]=8;
      writeStr(36, "data");
      data[40]=length&0xff;data[41]=(length>>8)&0xff;
      for (var i=0;i<length;i++){
        var t = i/sampleRate;
        var env = Math.exp(-t*8);
        var v = Math.sin(2*Math.PI*440*t) * env;
        data[44+i] = 128 + Math.round(v * 90);
      }
      var blob = new Blob([data], { type:"audio/wav" });
      _lrAudio = new Audio(URL.createObjectURL(blob));
      _lrAudio.volume = 0.4;
    } catch(e){ _lrAudio = null; }
    return _lrAudio;
  }
  function lrPlayDropSound(rarity){
    /* v10.51.0: the app now owns one effects bus and one volume. Use it when
       it is there so this sound obeys the slider and its own on/off switch -
       previously the ONLY way to silence it was to turn off drop animations
       as well, because both hung off the same flag. The old path stays as a
       fallback for a page that somehow loads this module alone. */
    try {
      if (typeof window.fhPlayLootSound === "function"){ window.fhPlayLootSound(rarity); return; }
    } catch(e){}
    try {
      var a = lrEnsureAudio();
      if (typeof window.fhSfxLevel === "function" && a) a.volume = 0.4 * window.fhSfxLevel();
      if (!a) return;
      var rates = { common:0.9, uncommon:1.0, rare:1.15, epic:1.3, legendary:1.5, mythic:1.7 };
      a.playbackRate = rates[rarity] || 1.0;
      a.currentTime = 0;
      var p = a.play();
      if (p && p.catch) p.catch(function(){});
    } catch(e) {}
  }

  /* ---------- session-end loot pipeline ---------- */

  function lrSessionEndLootPipeline(action, minutes, sessionId, options){
    options = options || {};
    var s = lrEnsureShape(_state());
    if (!s || !s.loot || !s.loot.drops){
      var legacy = window.rollLoot ? window.rollLoot(minutes) : null;
      return { legacyItem: legacy, drops:[], encounters:[] };
    }
    var receiptKey = sessionId ? String(sessionId) : "";
    var priorReceipt = receiptKey && s.loot.sessionRewardReceipts && s.loot.sessionRewardReceipts[receiptKey];
    var priorProof = receiptKey && s.loot.sessionRewardReceiptTombstones && s.loot.sessionRewardReceiptTombstones[receiptKey];
    if (priorReceipt){
      var requestedAction = String(action || "");
      var requestedMinutes = Math.max(0, minutes|0);
      var normalizedPrior = lrNormalizeSessionRewardReceipt(receiptKey, priorReceipt);
      var priorSnapshot = normalizedPrior.rewardSnapshot;
      if (String(priorSnapshot.action || "") !== requestedAction ||
          Math.max(0, priorSnapshot.minutes|0) !== requestedMinutes){
        throw new Error("Session reward receipt semantic mismatch for " + receiptKey + "; retry refused");
      }
      var derivedProof = lrRewardTombstoneFromReceipt(receiptKey, normalizedPrior);
      if (priorProof && JSON.stringify(lrNormalizeSessionRewardTombstone(receiptKey, priorProof)) !== JSON.stringify(derivedProof)){
        throw new Error("Session reward receipt proof mismatch for " + receiptKey + "; retry refused");
      }
      s.loot.sessionRewardReceipts[receiptKey] = normalizedPrior;
      s.loot.sessionRewardReceiptTombstones[receiptKey] = derivedProof;
      lrCompactSessionRewardReceiptState(s);
      return {
        legacyItem:null, drops:[], encounters:[], consumed:[],
        boss:priorSnapshot.boss || null, zoneId:priorSnapshot.zoneId || null, duplicate:true,
        rewardSnapshot:_deepClone(priorSnapshot)
      };
    }
    if (priorProof){
      var normalizedProof = lrNormalizeSessionRewardTombstone(receiptKey, priorProof);
      var expectedSemantic = lrRewardSemanticCommitment(
        receiptKey, String(action || ""), Math.max(0, minutes|0), normalizedProof.policyVersion
      );
      if (normalizedProof.semanticCommitment !== expectedSemantic){
        throw new Error("Session reward receipt semantic mismatch for " + receiptKey + "; retry refused");
      }
      return {
        legacyItem:null, drops:[], encounters:[], consumed:[],
        boss:null, zoneId:null, duplicate:true, rewardSnapshot:null
      };
    }
    if (receiptKey) lrAssertSessionRewardCapacity(s, receiptKey, action, minutes);
    var rewardBefore = lrRewardCounterSnapshot(s);
    var out = lrRunSessionCombat(s, { action:action, minutes:minutes, sessionId:sessionId, zoneId:options.zoneId });
    if (out.duplicate){
      return {
        legacyItem:null, drops:[], encounters:[], consumed:[],
        boss:out.boss || null, zoneId:out.zoneId, duplicate:true
      };
    }
    var best = null;
    for (var i=0; i<out.drops.length; i++){
      var d = out.drops[i];
      var idx = LR_RARITIES.indexOf(d.rarity);
      if (best === null || idx > LR_RARITIES.indexOf(best.rarity)) best = d;
    }
    var legacyItem = best ? _lootById(best.templateId) : null;
    for (var k=0; k<out.drops.length; k++){
      var dk = out.drops[k];
      if (typeof window.unlockAchievementsByRarity === "function") window.unlockAchievementsByRarity(dk.rarity);
      var tmpl = _lootById(dk.templateId);
      if (tmpl && !dk.autoSalvaged){
        var enemyName = dk.enemyId || "enemy";
        var actionTxt = (typeof window.equipToastAction === "function") ? window.equipToastAction(tmpl) : null;
        _toast("✨ NEW! " + tmpl[0] + " " + tmpl[1] + " (" + dk.rarity + ")" + (dk.fromMonsterTable ? " — from " + enemyName : ""), "good", actionTxt ? [actionTxt] : []);
        if (["rare","epic","legendary","mythic"].indexOf(dk.rarity) >= 0 && typeof window.logLine === "function"){
          window.logLine("Loot: " + tmpl[1] + " (" + dk.rarity + ")" + (dk.pity && dk.pity.bumped ? " · pity bump" : ""));
        }
      }
    }
    try {
      var anim = s.lootRework && s.lootRework.flags && s.lootRework.flags.animationsOn;
      /* v10.51.0: the sound no longer rides on the animation flag. It has its
         own switch and the shared volume, so "keep the animation, lose the
         noise" is finally expressible. */
      if (best) lrPlayDropSound(best.rarity);
      if (best && anim){
        /* v8.7.0: particle confetti burst on rare+ drops */
        if (typeof window.fhConfettiBurst === "function" &&
            ["rare","epic","legendary","mythic","cursed","artifact"].indexOf(best.rarity) >= 0){
          try { window.fhConfettiBurst(best.rarity); } catch(_){}
        }
        if (best.rarity === "legendary" || best.rarity === "mythic"){
          try {
            document.body && document.body.classList && document.body.classList.add("lr-screen-shake");
            setTimeout(function(){ try { document.body.classList.remove("lr-screen-shake"); } catch(_){} }, 280);
          } catch(_){}
        }
      }
    } catch(e){}
    /* v8.6.5 Loot Fix 2: tick pity ONCE per qualifying session even when no
       drop fires (or only a low-tier drop fires). Without this, chase-rarity
       pity (epic/legendary/mythic) effectively never advances at typical
       Pomodoro session lengths, because lrCommitDrop only advances pity for
       rarities ABOVE the dropped rarity — and most sessions drop nothing or
       just common/uncommon. */
    if (s && s.loot && s.loot.pity){
      var topIdx = -1;
      for (var pi=0; pi<out.drops.length; pi++){
        var pii = LR_RARITIES.indexOf(out.drops[pi].rarity);
        if (pii > topIdx) topIdx = pii;
      }
      /* Advance pity for everything ABOVE the top dropped rarity (or all rarities if no drop). */
      for (var pj=topIdx+1; pj<LR_RARITIES.length; pj++){
        var rk = LR_RARITIES[pj];
        s.loot.pity[rk] = (s.loot.pity[rk]|0) + 1;
      }
    }
    var result = {
      legacyItem:legacyItem, drops:out.drops, encounters:out.encounters, consumed:out.consumed, sessionId:receiptKey,
      boss:out.boss || null, zoneId:out.zoneId, duplicate:false
    };
    if (receiptKey){
      if (typeof window.crApplySessionMountRewards === "function"){
        var mountOutcome = window.crApplySessionMountRewards(s, {
          action:String(action || ""),
          minutes:Math.max(0, minutes|0),
          sessionId:receiptKey,
          rng:lrSeededRng(lrHashStr(receiptKey + "|mount-reward-policy-v1"))
        });
        result.mountGrants = (mountOutcome.grants || []).map(function(grant){
          if (grant && grant.entry) result.drops.push(grant.entry);
          return {
            reason:grant && grant.entry && grant.entry.mountReason || null,
            mount:grant && grant.mount ? _deepClone(grant.mount) : null,
            iid:grant && grant.instance && grant.instance.iid || null,
            dropId:grant && grant.entry && grant.entry.id || null
          };
        });
      }
      var rewardSnapshot = lrBuildSessionRewardSnapshot(s, result, {
        sessionId:receiptKey, action:action, minutes:minutes
      }, rewardBefore);
      var semanticCommitment = lrRewardSemanticCommitment(
        receiptKey, String(action || ""), Math.max(0, minutes|0), LR_SESSION_REWARD_POLICY_VERSION
      );
      var contentCommitment = lrRewardContentCommitment(rewardSnapshot);
      s.loot.sessionRewardReceipts[receiptKey] = {
        at:_now(),
        policyVersion:LR_SESSION_REWARD_POLICY_VERSION,
        semanticCommitment:semanticCommitment,
        rewardSnapshot:rewardSnapshot,
        contentCommitment:contentCommitment
      };
      s.loot.sessionRewardReceiptTombstones[receiptKey] = {
        policyVersion:LR_SESSION_REWARD_POLICY_VERSION,
        semanticCommitment:semanticCommitment,
        contentCommitment:contentCommitment
      };
      lrCompactSessionRewardReceiptState(s);
    }
    return result;
  }

  function lrAffixLabel(a){
    if (!a) return "";
    var def = LR_AFFIX_DEFS[a.id];
    if (!def) return a.id + " +" + a.value;
    return def.label.replace("{n}", String(a.value));
  }

  function lrTimeAgo(ts){
    if (!ts) return "—";
    var s = Math.max(0, Math.floor((_now()-ts)/1000));
    if (s < 60) return s + "s ago";
    if (s < 3600) return Math.floor(s/60) + "m ago";
    if (s < 86400) return Math.floor(s/3600) + "h ago";
    return Math.floor(s/86400) + "d ago";
  }

  function lrEnsureInstanceForSlot(slot){
    var s = lrEnsureShape(_state());
    if (window.ensureEquippedShape) window.ensureEquippedShape();
    var eq = s.hero.equipped[slot];
    if (!eq) return null;
    if (eq.instanceId && s.lootInstances[eq.instanceId]) return s.lootInstances[eq.instanceId];
    var template = _lootById(eq.lootId);
    if (!template) return null;
    var inst = lrMintInstance(template, { source:{ kind:"starter" } });
    s.lootInstances[inst.iid] = inst;
    s.hero.equipped[slot] = { lootId: inst.lootId, tier: inst.tier, instanceId: inst.iid };
    _saveState();
    return inst;
  }

  /* ---------- UI: drops list, forge panel, inspector, battle report ---------- */

  function lrPityMeterHtml(s){
    try{
      var rows=[["rare","Rare","#22d3ee"],["epic","Epic","#c084fc"],["legendary","Legendary","#f59e0b"]];
      var pity=(s.loot&&s.loot.pity)||{};
      var html='<div class="fh-pity-wrap"><div style="font-size:.68rem;color:#9aa3b2;letter-spacing:.04em">LUCK METER \u2014 the longer you go without a drop, the better your odds get</div>';
      for(var i=0;i<rows.length;i++){
        var k=rows[i][0], lbl=rows[i][1], col=rows[i][2];
        var th=LR_PITY_THRESHOLD[k]; if(!isFinite(th)) continue;
        var cnt=(pity[k]|0);
        var pct=Math.max(0,Math.min(100,Math.round(cnt/th*100)));
        var boosted=cnt>=th;
        html+='<div class="fh-pity"><span class="lbl">'+lbl+'</span>'+
          '<span class="track"><span class="fill" style="width:'+pct+'%;background:'+col+(boosted?(';box-shadow:0 0 8px '+col):'')+'"></span></span>'+
          '<span class="pct">'+(boosted?'BOOST':(pct+'%'))+'</span></div>';
      }
      html+='</div>';
      return html;
    }catch(_){ return ""; }
  }
  function renderDropsPanel(){
    var host = document.getElementById("drops-list");
    if (!host) return;
    var s = lrEnsureShape(_state());
    if (!s) return;
    var pityHtml = lrPityMeterHtml(s);
    try {
      var __owned = Object.keys((s.lootOwned)||{}).length;
      var __total = (window.LOOT_TABLE||[]).length;
      var __pct = __total ? Math.round(__owned/__total*100) : 0;
      pityHtml = '<div style="font-size:.76rem;color:#cbd5e1;margin:2px 0 8px;font-weight:700">Collection: ' + __owned + '/' + __total + ' found (' + __pct + '%)</div>' + pityHtml;
    } catch(_){}
    var drops = Array.isArray(s.loot.drops) ? s.loot.drops.slice().reverse() : [];
    if (!drops.length){
      host.innerHTML = pityHtml + '<div class="fh-empty">No drops yet — finish a focus session to earn your first loot.</div>';
      return;
    }
    var MS = _MONSTERS() || [];
    var rows = drops.slice(0, LR_BATTLE_REPORT_CAP).map(function(entry){
      var tmpl = _lootById(entry.templateId);
      var art = tmpl ? lrItemArtHtml(tmpl, "drop") : lrFallbackItemArt({ name:entry.templateId }, "drop");
      var name = tmpl ? tmpl[1] : entry.templateId;
      var odds = entry.odds && entry.odds.ratio
        ? "1 in " + Math.max(1, Math.round(1 / Math.max(1e-6, entry.odds.ratio)))
        : "—";
      var action = entry.sourceAction || "Focus";
      var enemyId = entry.enemyId;
      var enemyName = null;
      if (enemyId){
        for (var mi=0; mi<MS.length; mi++){ if (MS[mi][1] === enemyId){ enemyName = MS[mi][3]; break; } }
        if (!enemyName) enemyName = enemyId;
      }
      var ago = lrTimeAgo(entry.at);
      var pityTh = LR_PITY_THRESHOLD[entry.rarity];
      var pityTxt = entry.pity ? ('<span' + (entry.pity.bumped?' class="pity-bump"':'') + '>' + entry.pity.sinceLast + '/' + (pityTh===Infinity?"—":pityTh) + '</span>' + (entry.pity.bumped?" pity":"")) : "";
      var monBadge = entry.fromMonsterTable ? (" · from " + _escapeHtml(enemyName||"enemy")) : (enemyName ? (" · vs " + _escapeHtml(enemyName)) : "");
      return '<div class="drop-row rar-' + entry.rarity + '">' +
        '<div class="drop-sym">' + art + '</div>' +
        '<div>' +
        '<div class="drop-name">' + _escapeHtml(name) + ' <span class="muted" style="font-weight:400">· ' + entry.rarity + '</span></div>' +
        '<div class="drop-meta">' + _escapeHtml(ago) + ' · ' + _escapeHtml(action) + monBadge + '</div>' +
        '</div>' +
        '<div class="drop-odds">' + odds + '<br><span class="muted" style="font-size:.7rem">' + pityTxt + '</span></div>' +
        '</div>';
    }).join("");
    host.innerHTML = pityHtml + rows;
  }

  function lrGearUtilityPanelHtml(s){
    if (typeof window.fhGearUtilitySummary !== "function"){
      return '<section class="forge-resource-guide" aria-label="Loadout utility unavailable"><b>Loadout utility</b><span>The read-only utility summary is unavailable. Existing gear effects remain unchanged.</span></section>';
    }
    try {
      var action = typeof window.currentAdventureActionId === "function"
        ? window.currentAdventureActionId()
        : String((s.adventure && s.adventure.action) || "Loot");
      var summary = window.fhGearUtilitySummary(s, { action:action });
      var rows = (summary.rows || []).map(function(row){
        return '<span style="display:inline-flex;padding:4px 7px;border:1px solid rgba(255,255,255,.13);border-radius:999px;background:rgba(8,15,27,.42);font-size:.72rem">' + _escapeHtml(row) + '</span>';
      }).join("");
      var planned = (summary.plannedRows || []).map(function(row){
        return '<span style="display:block;color:#fde68a;font-size:.68rem;line-height:1.35">' + _escapeHtml(row) + '</span>';
      }).join("");
      var sources = (summary.sources || []).map(function(source){
        var meta = [source.tier, source.role].filter(Boolean).join(" / ");
        var pieces = (source.pieces || []).map(function(piece){
          return '<span style="display:block;color:#cbd5e1;font-size:.7rem;line-height:1.35">' + _escapeHtml(piece) + '</span>';
        }).join("");
        var plannedPieces = (source.plannedPieces || []).map(function(piece){
          return '<span style="display:block;color:#fde68a;font-size:.66rem;line-height:1.35">' + _escapeHtml(piece) + '</span>';
        }).join("");
        return '<div style="padding:7px 8px;border:1px solid rgba(255,255,255,.1);border-radius:9px;background:rgba(2,6,14,.28)">' +
          '<b style="display:block;font-size:.76rem">' + _escapeHtml(source.name || source.id || "Source") + '</b>' +
          (meta ? '<span style="display:block;color:#94a3b8;font-size:.65rem;text-transform:capitalize;margin:2px 0 4px">' + _escapeHtml(meta) + '</span>' : '') +
          (pieces || '<span style="display:block;color:#94a3b8;font-size:.7rem">No active stat routed.</span>') +
          plannedPieces +
        '</div>';
      }).join("");
      return '<section class="forge-resource-guide" aria-label="Active loadout utility" style="gap:8px">' +
        '<b>Loadout utility / ' + _escapeHtml(summary.headline) + '</b>' +
        '<span>Current action: <strong>' + _escapeHtml(action) + '</strong>. Totals below are active now. Equipment improves combat and mounted Travel speed. It never changes XP, coins, session energy cost, loot quality, harvest yields, or recorded focus minutes.</span>' +
        '<div style="display:flex;flex-wrap:wrap;gap:5px">' + (rows || '<span class="muted">Equip gameplay gear to activate utility.</span>') + '</div>' +
        (planned ? '<div style="padding:6px 7px;border-left:3px solid #f59e0b;background:rgba(245,158,11,.08)"><b style="display:block;font-size:.68rem;color:#fde68a">Planned - not active</b>' + planned + '</div>' : '') +
        '<details' + (sources ? ' open' : '') + ' style="width:100%"><summary style="cursor:pointer;font-size:.74rem;font-weight:800;color:#e2e8f0">Exact item, mount, and set sources</summary>' +
          '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:6px;margin-top:7px">' + (sources || '<span class="muted">No active sources.</span>') + '</div>' +
        '</details>' +
      '</section>';
    } catch (_) {
      return '<section class="forge-resource-guide" aria-label="Loadout utility unavailable"><b>Loadout utility</b><span>The read-only utility summary could not be rendered. No rewards or inventory were changed.</span></section>';
    }
  }

  function lrPurposeEntries(){
    if (typeof window.fhLootPurposeRegistry !== "function") return [];
    try { return window.fhLootPurposeRegistry({ includeDormant:false }) || []; }
    catch (_) { return []; }
  }

  function lrUtilityOptionsHtml(s, slot, entries){
    var current = s.loot && s.loot.loadout ? s.loot.loadout[slot] : null;
    var wanted = slot === "charm" ? "charm" : "relic";
    var options = '<option value="">— none —</option>';
    var sawCurrent = !current;
    entries.filter(function(entry){
      return entry && entry.action === "utility_loadout" && entry.loadoutKind === wanted;
    }).sort(function(a,b){
      return String(a.name || a.id).localeCompare(String(b.name || b.id));
    }).forEach(function(entry){
      var owned = Math.max(0, (s.lootOwned && s.lootOwned[entry.id])|0);
      if (owned <= 0 && current !== entry.id) return;
      var valid = true;
      if (typeof window.fhLootPurposeValidateLoadoutChoice === "function"){
        try { valid = !!window.fhLootPurposeValidateLoadoutChoice(s, slot, entry.id).ok; }
        catch (_) { valid = false; }
      }
      if (current === entry.id) sawCurrent = true;
      options += '<option value="' + _escapeHtml(entry.id) + '"' +
        (current === entry.id ? ' selected' : '') +
        (!valid && current !== entry.id ? ' disabled' : '') + '>' +
        _escapeHtml(entry.name || entry.id) + ' ×' + owned + ' · ' +
        _escapeHtml(entry.effectSummary || entry.purpose || "utility") +
        '</option>';
    });
    if (current && !sawCurrent){
      options += '<option value="' + _escapeHtml(current) + '" selected disabled>' +
        _escapeHtml(current) + ' · unavailable; choose none to remove</option>';
    }
    return options;
  }

  function lrReforgeTargetToken(iid, affixIndex){
    return encodeURIComponent(String(iid || "")) + "|" + Math.max(0, affixIndex|0);
  }

  function lrParseReforgeTarget(token){
    var parts = String(token || "").split("|");
    if (parts.length !== 2) return null;
    var index = Number(parts[1]);
    if (!Number.isInteger(index) || index < 0) return null;
    try { return { iid:decodeURIComponent(parts[0]), affixIndex:index }; }
    catch (_) { return null; }
  }

  function lrPreviewPurposeReforge(s, token, reagentId){
    var target = lrParseReforgeTarget(token);
    if (!target || !reagentId || typeof window.fhLootPurposeReforgeAffix !== "function"){
      return { ok:false, reason:"choose_item_affix_and_recipe" };
    }
    try {
      var draft = _deepClone(s);
      return window.fhLootPurposeReforgeAffix(
        draft,
        target.iid,
        target.affixIndex,
        reagentId,
        { updatedAt:_now() }
      );
    } catch (_) {
      return { ok:false, reason:"preview_unavailable" };
    }
  }

  function lrLootPurposeControlsHtml(s, instances){
    var entries = lrPurposeEntries();
    if (!entries.length){
      return '<section class="forge-section"><h4>Keys, recipes, and utility loadout</h4><div class="muted">The deterministic loot-purpose controls are unavailable. No inventory was changed.</div></section>';
    }

    var utilityHtml =
      '<div class="forge-loadout" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr))">' +
        '<label style="display:grid;gap:4px;font-size:.72rem"><b>Charm</b><select data-fh-utility-slot="charm">' + lrUtilityOptionsHtml(s, "charm", entries) + '</select></label>' +
        '<label style="display:grid;gap:4px;font-size:.72rem"><b>Relic I</b><select data-fh-utility-slot="relic1">' + lrUtilityOptionsHtml(s, "relic1", entries) + '</select></label>' +
        '<label style="display:grid;gap:4px;font-size:.72rem"><b>Relic II</b><select data-fh-utility-slot="relic2">' + lrUtilityOptionsHtml(s, "relic2", entries) + '</select></label>' +
      '</div>' +
      '<div class="muted" style="font-size:.72rem;margin-top:6px">Only selected items apply. Effects support optional Fight encounters. They never increase earnings, loot quality, harvest yields, or recorded minutes.</div>';

    var keyRows = entries.filter(function(entry){
      return entry && entry.kind === "key" && entry.action === "open_key_chest" &&
        Math.max(0, (s.lootOwned && s.lootOwned[entry.id])|0) > 0;
    }).sort(function(a,b){
      return String(a.name || a.id).localeCompare(String(b.name || b.id));
    }).map(function(entry){
      var available = typeof window.fhLootPurposeKeyAvailability === "function"
        ? window.fhLootPurposeKeyAvailability(s, entry.id)
        : { owned:(s.lootOwned && s.lootOwned[entry.id])|0, used:0, available:0 };
      var plan = available.available > 0 && typeof window.fhLootPurposePlanKeyChest === "function"
        ? window.fhLootPurposePlanKeyChest(s, entry.id)
        : null;
      var preview = plan && plan.ok
        ? _escapeHtml(plan.itemName) + ' · ' + _escapeHtml(plan.rewardTier) + ' ' + _escapeHtml(plan.itemSlot)
        : (available.available > 0 ? 'No safe active reward pool' : 'All owned copies opened');
      return '<div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;padding:8px;border:1px solid rgba(255,255,255,.1);border-radius:10px;background:rgba(2,6,14,.25)">' +
        '<div><b style="display:block;font-size:.76rem">' + _escapeHtml(entry.name || entry.id) + '</b>' +
          '<span style="display:block;color:#94a3b8;font-size:.66rem">Owned ' + available.owned + ' · opened ' + available.used + ' · available ' + available.available + '</span>' +
          '<span style="display:block;color:#cbd5e1;font-size:.68rem;margin-top:3px">Exact next reward: ' + preview + '</span></div>' +
        '<button type="button" data-fh-open-key="' + _escapeHtml(entry.id) + '"' +
          (!(plan && plan.ok && available.available > 0) ? ' disabled' : '') + '>Open</button>' +
      '</div>';
    }).join("");

    var reagents = entries.filter(function(entry){
      return entry && entry.kind === "reagent" && entry.action === "reforge_affix" &&
        Math.max(0, (s.lootOwned && s.lootOwned[entry.id])|0) > 0;
    }).sort(function(a,b){
      return String(a.name || a.id).localeCompare(String(b.name || b.id));
    });
    var targets = [];
    (instances || []).forEach(function(inst){
      if (!inst || inst.locked) return;
      (Array.isArray(inst.affixes) ? inst.affixes : []).forEach(function(affix, index){
        if (!affix || affix.fixed) return;
        var tmpl = _lootById(inst.lootId);
        targets.push({
          token:lrReforgeTargetToken(inst.iid, index),
          label:(tmpl ? tmpl[1] : inst.lootId) + " · " + lrAffixLabel(affix)
        });
      });
    });
    var targetOptions = targets.map(function(target){
      return '<option value="' + _escapeHtml(target.token) + '">' + _escapeHtml(target.label) + '</option>';
    }).join("");
    var reagentOptions = reagents.map(function(entry){
      return '<option value="' + _escapeHtml(entry.id) + '">' +
        _escapeHtml(entry.name || entry.id) + ' · ' + _escapeHtml(entry.affixId || "recipe") +
        '</option>';
    }).join("");
    var reforgeHtml;
    if (!reagents.length){
      reforgeHtml = '<div class="muted" style="font-size:.74rem">No reagent recipe unlocked. Each supported reagent is purchased once, then remains a reusable recipe.</div>';
    } else if (!targets.length){
      reforgeHtml = '<div class="muted" style="font-size:.74rem">No unlocked gear has a non-fixed affix available for reforging.</div>';
    } else {
      reforgeHtml =
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(185px,1fr));gap:7px">' +
          '<label style="display:grid;gap:4px;font-size:.7rem"><b>Item + affix</b><select data-fh-reforge-target>' + targetOptions + '</select></label>' +
          '<label style="display:grid;gap:4px;font-size:.7rem"><b>Unlocked recipe</b><select data-fh-reforge-reagent>' + reagentOptions + '</select></label>' +
        '</div>' +
        '<div data-fh-reforge-preview style="margin-top:7px;padding:7px 8px;border-left:3px solid #22d3ee;background:rgba(34,211,238,.07);font-size:.7rem;color:#cbd5e1">Calculating exact result…</div>' +
        '<button type="button" data-fh-apply-reforge style="margin-top:7px">Apply deterministic reforge</button>' +
        '<div class="muted" style="font-size:.68rem;margin-top:5px">The reagent is a reusable recipe unlock and is never consumed. Arcane Dust uses the same rarity cost as a normal reroll.</div>';
    }

    return '<section class="forge-section" aria-label="Keys, recipes, and utility loadout">' +
      '<h4>Utility Loadout</h4>' + utilityHtml +
      '<h4 style="margin-top:14px">Key Chests</h4>' +
      (keyRows || '<div class="muted" style="font-size:.74rem">No usable keys owned. Every key shows its exact deterministic reward before opening.</div>') +
      '<h4 style="margin-top:14px">Reagent Reforge</h4>' + reforgeHtml +
    '</section>';
  }

  function lrUpdatePurposeReforgePreview(host, s){
    var target = host.querySelector("[data-fh-reforge-target]");
    var reagent = host.querySelector("[data-fh-reforge-reagent]");
    var previewHost = host.querySelector("[data-fh-reforge-preview]");
    var apply = host.querySelector("[data-fh-apply-reforge]");
    if (!target || !reagent || !previewHost || !apply) return;
    var preview = lrPreviewPurposeReforge(s, target.value, reagent.value);
    apply.disabled = !preview.ok;
    if (!preview.ok){
      previewHost.textContent = "Unavailable: " + String(preview.reason || "unknown reason").replace(/_/g, " ") + ".";
      apply.textContent = "Apply deterministic reforge";
      return;
    }
    previewHost.textContent = "Exact result: " + lrAffixLabel(preview.after) +
      " · cost " + preview.costPaid + " Arcane Dust · reagent kept.";
    apply.textContent = "Apply exact result (" + preview.costPaid + " Dust)";
  }

  function lrLootPurposeGuideHtml(s){
    if (typeof window.fhGearUtilityContentAudit !== "function") return "";
    try {
      var audit = window.fhGearUtilityContentAudit(s);
      var categories = (audit.categories || []).map(function(category){
        var statuses = [];
        if (category.ready) statuses.push('<span style="color:#86efac">Ready ' + category.ready + '</span>');
        if (category.dormant) statuses.push('<span style="color:#fde68a">Dormant / unavailable ' + category.dormant + '</span>');
        if (category.deadEnds) statuses.push('<span style="color:#fca5a5">Obtainable dead ends ' + category.deadEnds + '</span>');
        return '<div style="padding:7px 8px;border:1px solid rgba(255,255,255,.1);border-radius:9px;background:rgba(2,6,14,.25)">' +
          '<b style="display:block;font-size:.75rem">' + _escapeHtml(category.label || category.category) + '</b>' +
          '<span style="display:block;color:#94a3b8;font-size:.67rem;line-height:1.35;margin:2px 0 4px">' + _escapeHtml(category.purpose || "") + '</span>' +
          '<span style="display:flex;flex-wrap:wrap;gap:4px 8px;font-size:.64rem;font-weight:800">' + statuses.join("") + '</span>' +
        '</div>';
      }).join("");
      var deadNames = (audit.deadEnds || []).map(function(item){ return item.name; })
        .filter(function(name,idx,list){ return list.indexOf(name) === idx; });
      return '<section class="forge-resource-guide" aria-label="Loot purpose guide" style="gap:7px">' +
        '<b>Loot purpose guide</b>' +
        '<span><strong style="color:#86efac">Ready</strong> means a visible action works now. <strong style="color:#fde68a">Dormant / unavailable</strong> means acquisition is deliberately suppressed until a complete consumer ships. <strong style="color:#fca5a5">Obtainable dead ends</strong> should remain zero.</span>' +
        '<details style="width:100%"><summary style="cursor:pointer;font-size:.74rem;font-weight:800;color:#e2e8f0">Purpose by loot category</summary>' +
          '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:6px;margin-top:7px">' + categories + '</div>' +
          (deadNames.length ? '<p style="margin:5px 0 0;color:#fca5a5;font-size:.68rem">Obtainable dead ends: ' + _escapeHtml(deadNames.join(", ")) + '.</p>' : '<p style="margin:6px 0 0;color:#86efac;font-size:.68rem">No registered obtainable loot type is left without a purpose.</p>') +
        '</details>' +
      '</section>';
    } catch (_) {
      return '<section class="forge-resource-guide" aria-label="Loot purpose guide unavailable"><b>Loot purpose guide</b><span>Purpose status could not be read. No unwired item is being presented as usable.</span></section>';
    }
  }

  function renderForgePanel(){
    var host = document.getElementById("forge-panel");
    if (!host) return;
    var s = lrEnsureShape(_state());
    if (!s) return;
    var mat = s.loot.materials || { dust:0, shards:0, essence:0 };
    var instances = Object.keys(s.lootInstances || {}).map(function(k){ return s.lootInstances[k]; });
    instances.sort(function(a,b){
      return (LR_RARITIES.indexOf(b.tier) - LR_RARITIES.indexOf(a.tier))
          || (b.level - a.level)
          || (b.createdAt - a.createdAt);
    });
    var matsHtml = '<div class="forge-mats">' +
      '<div class="forge-mat"><b>' + (mat.dust|0) + '</b><div class="mat-name">Arcane Dust</div><small>Common+ salvage · rerolls</small></div>' +
      '<div class="forge-mat"><b>' + (mat.shards|0) + '</b><div class="mat-name">Forge Shards</div><small>Uncommon+ salvage · upgrades</small></div>' +
      '<div class="forge-mat"><b>' + (mat.essence|0) + '</b><div class="mat-name">Mythic Essence</div><small>Epic+ salvage · high-tier crafting</small></div>' +
      '</div>' +
      '<div class="forge-resource-guide"><b>Forge resources are separate from World Shards.</b><span>Salvage unwanted gear below, or craft a Forge Kit in Expedition for 8 Arcane Dust and 1 Forge Shard. World Shards come from Challenges and never pay Forge costs.</span><div><button type="button" data-lr-open-expedition>Open Expedition</button><button type="button" data-lr-open-challenges>Open Challenges</button></div></div>';
    var equippedIids = new Set();
    var slots = _EQUIP_SLOTS() || [];
    for (var i=0; i<slots.length; i++){
      var eq = s.hero.equipped && s.hero.equipped[slots[i]];
      if (eq && eq.instanceId) equippedIids.add(eq.instanceId);
    }
    var instancesHtml;
    if (!instances.length){
      instancesHtml = '<div class="muted" style="font-size:.85rem">No customizable instances yet. Earn drops or hit "Customize" on an equipped item to mint a starter instance.</div>';
    } else {
      instancesHtml = '<div class="forge-instances">' + instances.map(function(inst){
        var tmpl = _lootById(inst.lootId);
        var art = tmpl ? lrItemArtHtml(tmpl, "forge") : lrFallbackItemArt({ name:inst.lootId }, "forge");
        var name = tmpl ? tmpl[1] : inst.lootId;
        var affs = (inst.affixes || []).map(function(a){ return '<span class="fi-aff">' + _escapeHtml(lrAffixLabel(a)) + '</span>'; }).join("");
        var equippedCls = equippedIids.has(inst.iid) ? " equipped" : "";
        var lockedCls = inst.locked ? " locked" : "";
        return '<button type="button" class="forge-instance rar-' + inst.tier + equippedCls + lockedCls + '" data-lr-iid="' + _escapeHtml(inst.iid) + '">' +
          '<div class="forge-instance-art">' + art + '</div>' +
          '<div class="fi-name">' + _escapeHtml(name) + '</div>' +
          '<div class="fi-meta">' + inst.tier + ' · +' + inst.level + ' · ' + inst.affixes.length + ' affix · ' + inst.sockets.length + ' socket</div>' +
          '<div class="fi-affixes">' + affs + '</div>' +
          '</button>';
      }).join("") + '</div>';
    }
    var consInv = Object.keys(LR_CONSUMABLE_DEFS).map(function(id){
      var owned = s.loot.consumables[id]|0;
      if (owned <= 0) return "";
      var def = LR_CONSUMABLE_DEFS[id];
      return '<div class="forge-cons-cell">' + def.sym + ' ' + _escapeHtml(def.name) + ' ×' + owned + '</div>';
    }).filter(Boolean).join("");
    var optionFor = function(slot){
      var cur = s.loot.loadout ? s.loot.loadout[slot] : null;
      var opts = '<option value="">— none —</option>';
      Object.keys(LR_CONSUMABLE_DEFS).forEach(function(id){
        var owned = s.loot.consumables[id]|0;
        var def = LR_CONSUMABLE_DEFS[id];
        var disabled = owned <= 0 && cur !== id;
        opts += '<option value="' + id + '" ' + (cur===id?"selected":"") + ' ' + (disabled?"disabled":"") + '>' + def.sym + ' ' + _escapeHtml(def.name) + ' (×' + owned + ')</option>';
      });
      return opts;
    };
    var dyesHtml = Object.keys(LR_DYE_DEFS).filter(function(k){ return (s.loot.dyesOwned[k]|0) > 0; }).map(function(k){
      var d = LR_DYE_DEFS[k];
      return '<span class="li-dye" title="' + _escapeHtml(d.name) + ' ×' + (s.loot.dyesOwned[k]|0) + '" style="background:' + d.color + '"></span>';
    }).join("");
    var gemsHtml = Object.keys(LR_GEM_DEFS).filter(function(k){ return (s.loot.gemsOwned[k]|0) > 0; }).map(function(k){
      var g = LR_GEM_DEFS[k];
      return '<div class="forge-cons-cell">' + g.sym + ' ' + _escapeHtml(g.name) + ' ×' + (s.loot.gemsOwned[k]|0) + '</div>';
    }).join("") || '<div class="muted" style="font-size:.78rem">No gems yet — salvage rare+ items or run Craft sessions.</div>';
    host.innerHTML =
      matsHtml +
      lrGearUtilityPanelHtml(s) +
      lrLootPurposeControlsHtml(s, instances) +
      lrLootPurposeGuideHtml(s) +
      '<div class="forge-section">' +
        '<h4>Instances</h4>' + instancesHtml +
      '</div>' +
      '<div class="forge-section">' +
        '<h4>Combat Loadout (3 slots)</h4>' +
        '<div class="forge-loadout">' +
          '<select data-lr-loadout="slot1">' + optionFor("slot1") + '</select>' +
          '<select data-lr-loadout="slot2">' + optionFor("slot2") + '</select>' +
          '<select data-lr-loadout="slot3">' + optionFor("slot3") + '</select>' +
        '</div>' +
        '<div class="muted" style="font-size:.74rem;margin-top:6px">Auto-used by the fight engine: heals if HP &lt;40, bombs on next encounter, Iron Tonic at session start, Lucky Charm rerolls one drop.</div>' +
        '<div class="forge-cons" style="margin-top:6px">' + (consInv || '<div class="muted" style="font-size:.78rem">No consumables yet.</div>') + '</div>' +
      '</div>' +
      '<div class="forge-section">' +
        '<h4>Dyes (cosmetic)</h4>' +
        '<div style="display:flex;gap:5px;flex-wrap:wrap">' + (dyesHtml || '<div class="muted" style="font-size:.78rem">No dyes yet — Loot sessions and common salvage drop them.</div>') + '</div>' +
      '</div>' +
      '<div class="forge-section">' +
        '<h4>Gems</h4>' +
        '<div class="forge-cons">' + gemsHtml + '</div>' +
      '</div>';
    var openExpedition = host.querySelector("[data-lr-open-expedition]");
    if (openExpedition) openExpedition.addEventListener("click", function(){
      if (typeof window.openProgressPanel === "function") window.openProgressPanel("expedition");
      else {
        var tab = document.querySelector('[data-tab="expedition"]');
        if (tab) tab.click();
      }
    });
    var openChallenges = host.querySelector("[data-lr-open-challenges]");
    if (openChallenges) openChallenges.addEventListener("click", function(){
      if (typeof window.openProgressPanel === "function") window.openProgressPanel("challenges");
      else {
        var tab = document.querySelector('[data-tab="challenges"]');
        if (tab) tab.click();
      }
    });
    var iidBtns = host.querySelectorAll("[data-lr-iid]");
    Array.prototype.forEach.call(iidBtns, function(btn){
      btn.addEventListener("click", function(){
        openLootInspector(btn.getAttribute("data-lr-iid"));
      });
    });
    var selects = host.querySelectorAll("[data-lr-loadout]");
    Array.prototype.forEach.call(selects, function(sel){
      sel.addEventListener("change", function(){
        var slot = sel.getAttribute("data-lr-loadout");
        var id = sel.value || null;
        lrEnsureShape(_state());
        _state().loot.loadout[slot] = id;
        _state().loot.loadoutUpdatedAt = _now();
        _saveState(); renderForgePanel();
      });
    });
    Array.prototype.forEach.call(host.querySelectorAll("[data-fh-utility-slot]"), function(sel){
      sel.addEventListener("change", function(){
        if (typeof window.fhLootPurposeSetLoadout !== "function") return;
        var result = window.fhLootPurposeSetLoadout(
          _state(),
          sel.getAttribute("data-fh-utility-slot"),
          sel.value || null,
          { updatedAt:_now() }
        );
        if (!result.ok){
          _toast("Can't change utility loadout: " + String(result.reason || "unknown").replace(/_/g, " "), "warn");
          renderForgePanel();
          return;
        }
        _saveState();
        renderForgePanel();
        _toast("Utility loadout updated.", "good");
      });
    });
    Array.prototype.forEach.call(host.querySelectorAll("[data-fh-open-key]"), function(btn){
      btn.addEventListener("click", function(){
        if (typeof window.fhLootPurposeOpenKeyChest !== "function") return;
        var result = window.fhLootPurposeOpenKeyChest(
          _state(),
          btn.getAttribute("data-fh-open-key"),
          { updatedAt:_now() }
        );
        if (!result.ok){
          _toast("Can't open key chest: " + String(result.reason || "unknown").replace(/_/g, " "), "warn");
          return;
        }
        _saveState();
        renderForgePanel();
        if (typeof window.renderLoot === "function") window.renderLoot();
        _toast("Key chest opened → " + result.plan.itemName + " (" + result.plan.rewardTier + ")", "good");
      });
    });
    var purposeTarget = host.querySelector("[data-fh-reforge-target]");
    var purposeReagent = host.querySelector("[data-fh-reforge-reagent]");
    if (purposeTarget) purposeTarget.addEventListener("change", function(){ lrUpdatePurposeReforgePreview(host, _state()); });
    if (purposeReagent) purposeReagent.addEventListener("change", function(){ lrUpdatePurposeReforgePreview(host, _state()); });
    var purposeApply = host.querySelector("[data-fh-apply-reforge]");
    if (purposeApply) purposeApply.addEventListener("click", function(){
      var target = lrParseReforgeTarget(purposeTarget && purposeTarget.value);
      var preview = lrPreviewPurposeReforge(_state(), purposeTarget && purposeTarget.value, purposeReagent && purposeReagent.value);
      if (!target || !preview.ok){
        _toast("Can't reforge: " + String(preview.reason || "invalid target").replace(/_/g, " "), "warn");
        return;
      }
      var result = window.fhLootPurposeReforgeAffix(
        _state(),
        target.iid,
        target.affixIndex,
        purposeReagent.value,
        { operationId:preview.operationId, updatedAt:_now() }
      );
      if (!result.ok){
        _toast("Can't reforge: " + String(result.reason || "unknown").replace(/_/g, " "), "warn");
        return;
      }
      _saveState();
      renderForgePanel();
      _toast("Reforged exactly → " + lrAffixLabel(result.after) + " (" + result.costPaid + " Dust)", "good");
    });
    lrUpdatePurposeReforgePreview(host, s);
  }

  function openLootInspector(iid){
    var s = lrEnsureShape(_state());
    var inst = s.lootInstances[iid];
    if (!inst){ _toast("Instance not found.", "warn"); return; }
    renderLootInspector(iid);
    if (window.openModal) window.openModal("loot-inspector-modal");
  }

  function renderLootInspector(iid){
    var host = document.getElementById("loot-inspector-body");
    if (!host) return;
    var s = lrEnsureShape(_state());
    var inst = s.lootInstances[iid];
    if (!inst){ host.innerHTML = '<div class="muted">Instance not found.</div>'; return; }
    var tmpl = _lootById(inst.lootId);
    var art = tmpl ? lrItemArtHtml(tmpl, "inspector") : lrFallbackItemArt({ name:inst.lootId }, "inspector");
    var name = tmpl ? tmpl[1] : inst.lootId;
    var slot = tmpl ? _lootSlot(tmpl) : "none";
    var forgeSupported = lrInstanceSupportsForgeMutation(inst);
    var caps = LR_RARITY_CAPS[inst.tier] || LR_RARITY_CAPS.common;
    var mat = s.loot.materials || { dust:0, shards:0, essence:0 };
    var rerollCost = LR_REROLL_DUST[inst.tier] || 5;
    var upCost = { shards: (inst.level+1)*10, coins: (inst.level+1)*25 };
    var affRows = (inst.affixes || []).map(function(a, i){
      var label = lrAffixLabel(a);
      var meta = !forgeSupported
        ? '<span class="aff-fixed">collection · read-only</span>'
        : a.fixed
        ? '<span class="aff-fixed">baseline · can\'t reroll</span>'
        : '<span class="aff-cost">' + rerollCost + ' ✨</span>';
      var btn = !forgeSupported
        ? ''
        : a.fixed
        ? '<button disabled>Reroll</button>'
        : '<button data-lr-reroll="' + i + '" ' + ((mat.dust|0)<rerollCost?"disabled":"") + '>Reroll</button>';
      return '<div class="li-aff-row"><span>' + _escapeHtml(label) + '</span>' + meta + btn + '</div>';
    }).join("") || '<div class="muted" style="font-size:.78rem">No affixes on this item.</div>';
    var sockets = Array.isArray(inst.sockets) ? inst.sockets : [];
    var socketsHtml = !forgeSupported
      ? (sockets.length
        ? sockets.map(function(sk){
            var readOnlyGem = sk && sk.gemId ? LR_GEM_DEFS[sk.gemId] : null;
            return '<div class="li-socket' + (readOnlyGem ? ' filled' : '') + '">' +
              (readOnlyGem ? (readOnlyGem.sym + ' ' + _escapeHtml(readOnlyGem.name)) : 'Empty socket') +
              ' <span class="muted">read-only</span></div>';
          }).join("")
        : '<div class="muted" style="font-size:.78rem">No sockets on this collection item.</div>')
      : sockets.length
      ? sockets.map(function(sk, i){
          if (sk.gemId){
            var g = LR_GEM_DEFS[sk.gemId];
            return '<div class="li-socket filled">' + (g?g.sym:"") + ' ' + (g?_escapeHtml(g.name):sk.gemId) + ' <button data-lr-unsocket="' + i + '" style="margin-left:6px;font-size:.7rem">Remove</button></div>';
          }
          var gems = Object.keys(LR_GEM_DEFS).filter(function(k){ return (s.loot.gemsOwned[k]|0) > 0; });
          if (!gems.length){
            return '<div class="li-socket">Empty socket (no gems)</div>';
          }
          var opts = '<option value="">slot…</option>' + gems.map(function(k){ return '<option value="' + k + '">' + LR_GEM_DEFS[k].sym + ' ' + _escapeHtml(LR_GEM_DEFS[k].name) + ' ×' + (s.loot.gemsOwned[k]|0) + '</option>'; }).join("");
          return '<div class="li-socket">Empty <select data-lr-socket="' + i + '">' + opts + '</select></div>';
        }).join("")
      : '<div class="muted" style="font-size:.78rem">No sockets on this rarity.</div>';
    var dyeHtml = forgeSupported ? Object.keys(LR_DYE_DEFS).map(function(k){
      var d = LR_DYE_DEFS[k];
      var owned = (s.loot.dyesOwned[k]|0) > 0;
      if (!owned && inst.dyeId !== k) return "";
      return '<span class="li-dye' + (inst.dyeId===k?" active":"") + '" data-lr-dye="' + k + '" title="' + _escapeHtml(d.name) + '" style="background:' + d.color + '"></span>';
    }).join("") : "";
    var dyeSection = forgeSupported
      ? '<div class="li-section"><h5>Dye</h5><div class="li-dyes">' + (dyeHtml || '<div class="muted" style="font-size:.78rem">No dyes owned yet.</div>') + '<span class="li-dye' + (inst.dyeId===null?" active":"") + '" data-lr-dye="" title="Default" style="background:transparent;border-style:dashed"></span></div></div>'
      : '<div class="li-section"><h5>Dye</h5><div class="muted" style="font-size:.78rem">Forge dyes are not available for collection or purpose items.</div></div>';
    var lockLabel = inst.locked ? "Unlock" : "Lock";
    var upgradeDisabled = inst.level >= caps.maxLevel || (mat.shards|0) < upCost.shards || (s.coins|0) < upCost.coins;
    var upgradeButton = forgeSupported
      ? '<button data-lr-upgrade ' + (upgradeDisabled?"disabled":"") + '>Upgrade +1 (' + upCost.shards + ' 💎 + ' + upCost.coins + ' 🪙)</button>'
      : '';
    var forgeNotice = forgeSupported ? '' :
      '<div class="li-section"><div class="muted" style="font-size:.8rem">Collection / purpose item. Forge mutations are unavailable; its collection and purpose actions remain available in Forge.</div></div>';
    var stats = lrInstanceStats(inst);
    var statsLines = Object.keys(stats).map(function(k){
      var def = LR_AFFIX_DEFS[k];
      var label = def ? def.label.replace("{n}", stats[k]) : (k + " +" + stats[k]);
      return _escapeHtml(label);
    }).join(" · ") || "—";
    host.innerHTML =
      '<div class="li-head">' +
        '<div class="li-sym">' + art + '</div>' +
        '<div>' +
          '<h4>' + _escapeHtml(name) + '</h4>' +
          '<div class="li-sub">' + inst.tier + (forgeSupported ? (' · +' + inst.level + '/' + caps.maxLevel) : ' · collection') + ' · slot: ' + slot + '</div>' +
          '<div class="li-sub" style="margin-top:3px;color:var(--ink)">' + (forgeSupported ? 'Effective' : 'Stored roll') + ': ' + statsLines + '</div>' +
        '</div>' +
      '</div>' +
      forgeNotice +
      '<div class="li-section"><h5>Affixes</h5>' + affRows + '</div>' +
      '<div class="li-section"><h5>Sockets (' + sockets.length + ')</h5><div class="li-sockets">' + socketsHtml + '</div></div>' +
      dyeSection +
      '<div class="li-actions">' +
        upgradeButton +
        '<button data-lr-lock>' + lockLabel + '</button>' +
        '<button data-lr-salvage ' + (inst.locked?"disabled":"") + '>Salvage</button>' +
      '</div>';
    // Wire actions
    Array.prototype.forEach.call(host.querySelectorAll("[data-lr-reroll]"), function(b){
      b.addEventListener("click", function(){
        var idx = Number(b.getAttribute("data-lr-reroll"));
        var r = lrRerollAffix(_state(), iid, idx);
        if (!r.ok){ _toast("Can't reroll: " + r.reason, "warn"); return; }
        _saveState(); renderLootInspector(iid); renderForgePanel();
        _toast("Rerolled → " + lrAffixLabel(r.after) + " (cost " + r.costPaid + " ✨)", "good");
      });
    });
    Array.prototype.forEach.call(host.querySelectorAll("[data-lr-socket]"), function(sel){
      sel.addEventListener("change", function(){
        var idx = Number(sel.getAttribute("data-lr-socket"));
        var gemId = sel.value;
        if (!gemId) return;
        var r = lrSocketGem(_state(), iid, idx, gemId);
        if (!r.ok){ _toast("Can't socket: " + r.reason, "warn"); return; }
        _saveState(); renderLootInspector(iid); renderForgePanel();
      });
    });
    Array.prototype.forEach.call(host.querySelectorAll("[data-lr-unsocket]"), function(b){
      b.addEventListener("click", function(){
        var idx = Number(b.getAttribute("data-lr-unsocket"));
        if (!confirm("Removing the gem destroys it. Continue?")) return;
        var r = lrUnsocketGem(_state(), iid, idx);
        if (!r.ok){ _toast("Can't remove: " + r.reason, "warn"); return; }
        _saveState(); renderLootInspector(iid); renderForgePanel();
      });
    });
    Array.prototype.forEach.call(host.querySelectorAll("[data-lr-dye]"), function(d){
      d.addEventListener("click", function(){
        var dyeId = d.getAttribute("data-lr-dye") || null;
        var r = lrApplyDye(_state(), iid, dyeId);
        if (!r.ok){ _toast("Can't apply dye: " + r.reason, "warn"); return; }
        _saveState(); renderLootInspector(iid); renderForgePanel();
      });
    });
    var upBtn = host.querySelector("[data-lr-upgrade]");
    if (upBtn) upBtn.addEventListener("click", function(){
      var r = lrUpgradeInstance(_state(), iid);
      if (!r.ok){ _toast("Can't upgrade: " + r.reason, "warn"); return; }
      _saveState(); renderLootInspector(iid); renderForgePanel();
      _toast("Upgraded to +" + r.level + " (-" + r.shardsPaid + " 💎, -" + r.coinsPaid + " 🪙)", "good");
    });
    var lockBtn = host.querySelector("[data-lr-lock]");
    if (lockBtn) lockBtn.addEventListener("click", function(){
      var r = lrToggleLock(_state(), iid);
      _saveState(); renderLootInspector(iid);
      if (r.ok) _toast(r.locked ? "Locked." : "Unlocked.", "good");
    });
    var salBtn = host.querySelector("[data-lr-salvage]");
    if (salBtn) salBtn.addEventListener("click", function(){
      if (!confirm("Salvage this instance for materials? The template count in your inventory is preserved.")) return;
      var r = lrSalvageInstance(_state(), iid);
      if (!r.ok){ _toast("Can't salvage: " + r.reason, "warn"); return; }
      _saveState();
      if (window.closeModal) window.closeModal("loot-inspector-modal");
      renderForgePanel();
      if (window.renderLoot) window.renderLoot();
      _toast("Salvaged → +" + r.yield.dust + " Arcane Dust · +" + r.yield.shards + " Forge Shards · +" + r.yield.essence + " Mythic Essence" + (r.gemDropped?(" · +1 " + LR_GEM_DEFS[r.gemDropped].name):""), "good");
    });
  }

  function showBattleReport(run){
    if (!run) return;
    var host = document.getElementById("battle-report-body");
    if (!host) return;
    var encounters = Array.isArray(run.encounters) ? run.encounters : [];
    var rows = encounters.map(function(enc){
      var hpPct = Math.max(0, Math.min(100, Math.round((enc.heroHPEnd/100)*100)));
      var enemy = enc.enemy;
      var drop = null;
      for (var di=0; di<(run.drops||[]).length; di++) if (run.drops[di].enemyId === enemy.id) { drop = run.drops[di]; break; }
      var dropMeta = drop ? ("Drop: " + (function(){ var t=_lootById(drop.templateId); return t?t[1]:drop.templateId; })() + " (" + drop.rarity + ")") : "No drop";
      var weakHit = false, resistHit = false;
      for (var ri=0; ri<enc.rounds.length; ri++){ if (enc.rounds[ri].weak) weakHit = true; if (enc.rounds[ri].resist) resistHit = true; }
      return '<div class="br-encounter">' +
        '<div class="br-enemy">' + enemy.sym + '</div>' +
        '<div><div class="br-name">' + _escapeHtml(enemy.name) + ' <span class="muted" style="font-weight:400;font-size:.72rem">lv ' + enemy.level + (enemy.boss?" · BOSS":"") + '</span></div>' +
        '<div class="br-detail">' + enc.rounds.length + ' round' + (enc.rounds.length>1?"s":"") + ' · ' + (weakHit?"weakness hit · ":"") + (resistHit?"resisted · ":"") + 'HP ' + enc.heroHPStart + ' → ' + enc.heroHPEnd + '</div>' +
        '<div class="br-hpbar"><div style="width:' + hpPct + '%"></div></div><div class="br-detail" style="margin-top:3px">' + _escapeHtml(dropMeta) + '</div></div>' +
        '<div class="br-outcome ' + enc.outcome + '">' + enc.outcome + '</div></div>';
    }).join("");
    if (!rows) rows = '<div class="muted" style="padding:8px 0">No combat encounters were generated for this session.</div>';
    var sessionId = typeof run.sessionId === "string" ? run.sessionId : "";
    var reportModal = document.getElementById("battle-report-modal");
    if (reportModal) {
      if (sessionId) reportModal.dataset.sessionId = sessionId;
      else delete reportModal.dataset.sessionId;
    }
    var edit = sessionId ? '<div class="actions" style="margin-top:10px"><button type="button" data-battle-report-edit-time>Adjust or set exact session time</button></div>' : "";
    host.innerHTML = rows + edit;
    var editBtn = host.querySelector("[data-battle-report-edit-time]");
    if (editBtn) editBtn.addEventListener("click", function(){
      if (window.closeModal) window.closeModal("battle-report-modal");
      if (typeof window.openSessionEditModal === "function") window.openSessionEditModal(sessionId,{surface:"battle-report"});
    });
    if (window.openModal) window.openModal("battle-report-modal");
  }
  /* Settings toggle wiring — re-binds after the inline script's bindSettings
     has already run. Looks up the three new toggles and attaches handlers. */
  function lrWireSettings(){
    var bindings = [
      ["#tog-lr-anim", "animationsOn"],
      ["#tog-lr-log",  "showDropLog"],
      ["#tog-lr-autosalvage", "autoSalvageCommonDupes"]
    ];
    bindings.forEach(function(b){
      var sel = b[0], flag = b[1];
      var el = document.querySelector(sel);
      if (!el || el.dataset.lrBound) return;
      el.dataset.lrBound = "1";
      // Reflect current state
      var s = lrEnsureShape(_state());
      var on = !!(s.lootRework && s.lootRework.flags && s.lootRework.flags[flag]);
      el.setAttribute("aria-checked", on ? "true" : "false");
      el.addEventListener("click", function(){
        var next = el.getAttribute("aria-checked") !== "true";
        el.setAttribute("aria-checked", next ? "true" : "false");
        var st = lrEnsureShape(_state());
        st.lootRework.flags[flag] = next;
        _saveState();
        if (flag === "showDropLog"){
          var tab = document.querySelector('[data-tab="drops"]');
          if (tab) tab.style.display = next ? "" : "none";
        }
      });
    });
  }

  /* Inject the Customize button on the equipped grid rows and on the
     mounts/pets grids. Re-runs every time renderLoot / renderCompanions
     finishes — we hook by polling. Lightweight and idempotent. */
  function lrDecorateLootSurfaces(){
    var table = _LOOT_TABLE() || [];
    if (!table.length || typeof document === "undefined" || typeof document.querySelectorAll !== "function") return 0;
    var byName = {};
    table.forEach(function(row){ byName[String(row && row[1] || "").trim()] = row; });
    var count = 0;
    Array.prototype.forEach.call(document.querySelectorAll(".loot-item"), function(el){
      var nameNode = el.querySelector && el.querySelector(".name");
      var artNode = el.querySelector && el.querySelector(".sym");
      if (!nameNode || !artNode) return;
      var template = byName[String(nameNode.textContent || "").trim()];
      if (!template) return;
      var id = _lootId(template);
      if (el.dataset && el.dataset.fhVisualId === id && artNode.querySelector
          && artNode.querySelector(".fh-loot-item-art")) return;
      artNode.innerHTML = lrItemArtHtml(template, "collection");
      if (el.dataset) el.dataset.fhVisualId = id;
      count++;
    });
    return count;
  }

  function lrInjectCustomizeButtons(){
    var s = _state();
    if (!s) return;
    var slots = _EQUIP_SLOTS() || [];
    Array.prototype.forEach.call(document.querySelectorAll(".loot-item.equipped"), function(el){
      if (el.dataset.lrCustomized) return;
      var equipBtn = el.querySelector(".equip-btn");
      if (!equipBtn) return;
      // Determine the slot from currently-equipped match
      var match = null;
      for (var i=0; i<slots.length; i++){
        var slot = slots[i];
        var eq = s.hero && s.hero.equipped && s.hero.equipped[slot];
        if (!eq) continue;
        var tmpl = _lootById(eq.lootId);
        if (!tmpl) continue;
        /* Model art replaces the old symbol text. Prefer the deterministic id
           written by lrDecorateLootSurfaces and fall back to the visible name
           only for a just-rendered card awaiting its first decoration pass. */
        var cardId = el.dataset && el.dataset.fhVisualId;
        var name = el.querySelector(".name");
        if (cardId === eq.lootId || (name && String(name.textContent || "").trim() === String(tmpl[1] || ""))){
          match = { slot:slot }; break;
        }
      }
      if (!match) return;
      var c = document.createElement("button");
      c.type = "button";
      c.className = "equip-btn";
      c.style.marginLeft = "4px";
      c.textContent = "Customize";
      c.onclick = function(){
        var inst = lrEnsureInstanceForSlot(match.slot);
        if (inst) openLootInspector(inst.iid);
      };
      equipBtn.parentNode.appendChild(c);
      el.dataset.lrCustomized = "1";
    });
  }

  function lrWireCollectionModels(){
    ["renderLoot","renderCompanions"].forEach(function(name){
      var original = window[name];
      if (typeof original !== "function" || original.__fhModelArtWrapped) return;
      var wrapped = function(){
        var result = original.apply(this, arguments);
        try { lrDecorateLootSurfaces(); } catch(_){}
        try { lrInjectCustomizeButtons(); } catch(_){}
        return result;
      };
      wrapped.__fhModelArtWrapped = true;
      wrapped.__fhModelArtOriginal = original;
      window[name] = wrapped;
    });
  }

  /* Drops tab + Forge tab need to be in the tab strip's known list.
     The inline script's tab handler is generic (data-tab matching),
     so just adding the buttons + panels in HTML is enough. We also
     refresh the panels when the tab is shown. */
  function lrWireTabRefresh(){
    var bar = document.querySelector(".tabs[role='tablist']");
    if (!bar || bar.dataset.lrBound) return;
    bar.dataset.lrBound = "1";
    bar.addEventListener("click", function(ev){
      var btn = ev.target.closest("[data-tab]");
      if (!btn) return;
      var name = btn.getAttribute("data-tab");
      if (name === "drops") setTimeout(renderDropsPanel, 0);
      if (name === "forge") setTimeout(renderForgePanel, 0);
    });
  }

  /* Boot: bind settings + tab refresh + customize-button injection. */
  function lrBoot(){
    lrWireSettings();
    lrWireTabRefresh();
    lrWireCollectionModels();
    // Tick injection / render every couple of seconds — cheap, idempotent.
    setInterval(function(){
      try { lrDecorateLootSurfaces(); } catch(_){}
      try { lrInjectCustomizeButtons(); } catch(_){}
    }, 2000);
    // Initial render of new panels
    setTimeout(function(){
      try { renderDropsPanel(); } catch(_){}
      try { renderForgePanel(); } catch(_){}
      try { lrDecorateLootSurfaces(); } catch(_){}
    }, 200);
  }
  if (typeof window.FH_onPrimaryReady === "function") window.FH_onPrimaryReady(lrBoot);
  else if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", lrBoot, { once:true });
  else setTimeout(lrBoot, 0);

  /* ---------- public surface (window + __FocusHero) ---------- */
  var publics = {
    LR_RARITIES: LR_RARITIES, LR_SOURCE_WEIGHTS: LR_SOURCE_WEIGHTS,
    LR_PITY_THRESHOLD: LR_PITY_THRESHOLD, LR_RARITY_CAPS: LR_RARITY_CAPS,
    LR_AFFIX_DEFS: LR_AFFIX_DEFS, LR_GEM_DEFS: LR_GEM_DEFS,
    LR_DYE_DEFS: LR_DYE_DEFS, LR_CONSUMABLE_DEFS: LR_CONSUMABLE_DEFS,
    LR_MONSTER_TRAITS: LR_MONSTER_TRAITS, LR_MONSTER_DROPS: LR_MONSTER_DROPS,
    LR_REROLL_DUST: LR_REROLL_DUST, LR_SALVAGE_YIELD: LR_SALVAGE_YIELD,
    LR_DROP_LOG_CAP: LR_DROP_LOG_CAP, LR_OUTCOME_BIAS: LR_OUTCOME_BIAS,
    LR_SESSION_REWARD_POLICY_VERSION:LR_SESSION_REWARD_POLICY_VERSION,
    LR_SESSION_REWARD_DETAIL_CAP:LR_SESSION_REWARD_DETAIL_CAP,
    LR_SESSION_REWARD_TOMBSTONE_CAP:LR_SESSION_REWARD_TOMBSTONE_CAP,
    LR_SESSION_REWARD_STORAGE_BYTE_CAP:LR_SESSION_REWARD_STORAGE_BYTE_CAP,
    lrSeededRng: lrSeededRng, lrHashStr: lrHashStr, lrStableId:lrStableId, lrSha256Hex:lrSha256Hex,
    lrCanonicalRewardValue:lrCanonicalRewardValue,
    lrRewardContentCommitment:lrRewardContentCommitment,
    lrRewardSemanticCommitment:lrRewardSemanticCommitment,
    lrNormalizeSessionRewardReceipt:lrNormalizeSessionRewardReceipt,
    lrNormalizeSessionRewardTombstone:lrNormalizeSessionRewardTombstone,
    lrCompactSessionRewardReceiptState:lrCompactSessionRewardReceiptState,
    lrValidateSessionRewardReceiptState:lrValidateSessionRewardReceiptState,
    lrRewardReceiptEvidenceMap:lrRewardReceiptEvidenceMap,
    lrIsSharedKeyReceiptId:lrIsSharedKeyReceiptId,
    lrMergeSessionRewardReceiptStores:lrMergeSessionRewardReceiptStores,
    lrAssertSessionRewardCapacity:lrAssertSessionRewardCapacity,
    lrTemplateSources: lrTemplateSources, lrPityMultiplier: lrPityMultiplier,
    lrRarityWeightsForAction: lrRarityWeightsForAction,
    lrEligibleTemplates: lrEligibleTemplates,
    lrPickTemplateInRarity: lrPickTemplateInRarity,
    lrRollAffix: lrRollAffix, lrMintInstance: lrMintInstance,
    lrInstanceStats: lrInstanceStats, lrEquippedStats: lrEquippedStats,
    lrRerollAffix: lrRerollAffix, lrUpgradeInstance: lrUpgradeInstance,
    lrSocketGem: lrSocketGem, lrUnsocketGem: lrUnsocketGem,
    lrApplyDye: lrApplyDye, lrSalvageInstance: lrSalvageInstance,
    lrToggleLock: lrToggleLock,
    lrWorldEnemyRow: lrWorldEnemyRow, lrZoneEnemyRows: lrZoneEnemyRows,
    lrPickEnemy: lrPickEnemy, lrPickBossEnemy: lrPickBossEnemy, lrResolveEncounter: lrResolveEncounter,
    lrRollDropForEncounter: lrRollDropForEncounter, lrCommitDrop: lrCommitDrop,
    lrGrantEditThresholdEntitlement: lrGrantEditThresholdEntitlement,
    lrRunSessionCombat: lrRunSessionCombat,
    lrSessionEndLootPipeline: lrSessionEndLootPipeline,
    lrEnsureShape: lrEnsureShape, lrEnsureInstanceForSlot: lrEnsureInstanceForSlot,
    lrEncountersForMinutes: lrEncountersForMinutes,
    lrAffixLabel: lrAffixLabel, lrBaselineAffix: lrBaselineAffix,
    renderDropsPanel: renderDropsPanel, renderForgePanel: renderForgePanel,
    openLootInspector: openLootInspector, renderLootInspector: renderLootInspector,
    lrTemplateVisualItem:lrTemplateVisualItem, lrItemArtHtml:lrItemArtHtml,
    lrDecorateLootSurfaces:lrDecorateLootSurfaces,
    showBattleReport: showBattleReport,
    lrPlayDropSound: lrPlayDropSound
  };
  Object.keys(publics).forEach(function(k){ window[k] = publics[k]; });
  try {
    window.__FocusHero = window.__FocusHero || {};
    Object.keys(publics).forEach(function(k){ window.__FocusHero[k] = publics[k]; });
  } catch(_){}

  /* ---------- smoke tests appendix ---------- */
  window.__lrSmokeTests = function(){
    var results = [];
    var add = function(name, ok, msg){ results.push({ name:name, ok:!!ok, msg:msg||"" }); };

    // 1) Every source row sums to 1.0
    Object.keys(LR_SOURCE_WEIGHTS).forEach(function(action){
      var sum = 0;
      for (var i=0; i<LR_RARITIES.length; i++) sum += LR_SOURCE_WEIGHTS[action][LR_RARITIES[i]];
      add("loot.weights: " + action + " sums to 1.0", Math.abs(sum - 1.0) < 1e-9, "sum=" + sum);
    });
    // 2) Pity multipliers
    add("loot.pity: rare below threshold = 1.0", lrPityMultiplier("rare", 5) === 1.0);
    add("loot.pity: rare above threshold > 1.0", lrPityMultiplier("rare", 12) > 1.0);
    add("loot.pity: caps at 1.6", lrPityMultiplier("epic", 100) <= 1.6 + 1e-9);
    add("loot.pity: common has no pity", lrPityMultiplier("common", 9999) === 1.0);
    // 3) Renormalisation after pity still 1.0
    var w = lrRarityWeightsForAction("Fight", { common:0, uncommon:0, rare:50, epic:100, legendary:0, mythic:0 });
    var s = 0; for (var i=0; i<LR_RARITIES.length; i++) s += w[LR_RARITIES[i]];
    add("loot.weights: renormalised after pity sums to 1.0", Math.abs(s - 1.0) < 1e-9, "sum=" + s);
    if (window.FH_GAMEPLAY_CONTROLS){
      add("loot.source: Stand Still uses Rest weights",
          JSON.stringify(lrRarityWeightsForAction("Idle", {})) === JSON.stringify(lrRarityWeightsForAction("Rest", {})));
    }
    // 4) Source separation
    var TT = (typeof window.LOOT_TABLE !== "undefined") ? window.LOOT_TABLE : null;
    if (TT){
      var travel = lrEligibleTemplates("Travel", 120).map(function(it){ return _lootId(it); });
      var fight  = lrEligibleTemplates("Fight",  120).map(function(it){ return _lootId(it); });
      add("loot.source: Travel pool ≠ Fight pool", JSON.stringify(travel) !== JSON.stringify(fight));
      add("loot.source: Travel pool includes copper_coin", travel.indexOf("copper_coin") >= 0);
      add("loot.source: Travel pool excludes dualblade", travel.indexOf("dualblade") < 0);
      if (window.FH_GAMEPLAY_CONTROLS){
        add("loot.source: Stand Still uses Rest item pool",
            JSON.stringify(lrEligibleTemplates("Idle", 120).map(function(it){ return _lootId(it); })) ===
            JSON.stringify(lrEligibleTemplates("Rest", 120).map(function(it){ return _lootId(it); })));
      }
    }
    // 5) Gate
    var elig30 = lrEligibleTemplates("Fight", 30);
    add("loot.gate: 30-min Fight has no legendary", !elig30.some(function(it){ return it[2] === "legendary"; }));
    var elig120 = lrEligibleTemplates("Fight", 120, {world:{currentZone:"astral_plains"}});
    add("loot.gate: 120-min Fight allows legendary+mythic",
        elig120.some(function(it){ return it[2] === "legendary"; }) &&
        elig120.some(function(it){ return it[2] === "mythic"; }));
    // 6) Mint baseline preserved
    if (window.lootById){
      var inst = lrMintInstance(window.lootById("whetstone_blade"), { rng: lrSeededRng(42) });
      var baseline = inst.affixes.filter(function(a){ return a.fixed; })[0];
      add("loot.mint: whetstone baseline is +8 physical damage fixed",
          !!baseline && baseline.id === "dmgPhys" && baseline.value === 8);
      // 7) Affix rarity caps
      var crown = lrMintInstance(window.lootById("crown_of_flow"), { rng: lrSeededRng(7) });
      add("loot.mint: legendary has 2 sockets", crown.sockets.length === 2);
      add("loot.mint: legendary affix count ≤3", crown.affixes.length <= 3 && crown.affixes.length >= 1);
    }
    // 8) Combat determinism
    var ctx = { heroStats:{ dmgFire: 20, critPct: 10 }, heroLevel: 10, heroHP: 100 };
    var a = lrResolveEncounter(ctx, 0, lrSeededRng(0xfeed));
    var b = lrResolveEncounter(ctx, 0, lrSeededRng(0xfeed));
    add("loot.combat: seeded RNG is deterministic",
        a.enemy.id === b.enemy.id && a.outcome === b.outcome && a.heroHPEnd === b.heroHPEnd);
    // 9) Combat: hero HP floor at 1
    var weakCtx = { heroStats:{}, heroLevel: 1, heroHP: 5 };
    var minHp = Infinity;
    for (var ti=0; ti<20; ti++){
      var rr = lrResolveEncounter(weakCtx, ti, lrSeededRng(ti+1));
      if (rr.heroHPEnd < minHp) minHp = rr.heroHPEnd;
    }
    add("loot.combat: hero HP never below 1", minHp >= 1);
    // 10) Encounter counts
    add("loot.combat: 90m -> 4 encounters", lrEncountersForMinutes(90) === 4);
    add("loot.combat: 25m -> 2 encounters", lrEncountersForMinutes(25) === 2);
    add("loot.combat: 120m -> 5 encounters", lrEncountersForMinutes(120) === 5);
    return results;
  };

})();

/* asset content-type refresh — v10.32.0 */
