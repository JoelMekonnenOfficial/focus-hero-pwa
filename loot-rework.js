/* ================================================================
 * Focus Hero — v8.x LOOT REWORK
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
    chronoblade:["Fight","Meditate","Loot"], eye_of_eternity:["Meditate","Loot","Fight"], astral_dragon:["Travel","Hunt","Loot"], celestial_phoenix:["Meditate","Loot","Hunt"], halo_of_mastery:["Meditate","Fight","Loot"]
  };

  /* Affix definitions — 12 stat lines that can roll on gear. */
  var LR_AFFIX_DEFS = {
    xpPct:      { label:"+{n}% XP",           minor:[2,4],  major:[5,9],  grand:[10,15], kind:"util" },
    coinPct:    { label:"+{n}% Coins",        minor:[2,4],  major:[5,9],  grand:[10,15], kind:"util" },
    energySave: { label:"-{n} Energy Cost",   minor:[1,1],  major:[2,2],  grand:[3,3],   kind:"util" },
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
    gem_xp:      { name:"Citrine",  sym:"🟡", affixId:"xpPct",     value:3 },
    gem_coin:    { name:"Sunstone", sym:"🟠", affixId:"coinPct",   value:3 }
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
    if (fx.xpPct)      return { id:"xpPct",      tier:"major", value:fx.xpPct,      fixed:true };
    if (fx.coinPct)    return { id:"coinPct",    tier:"major", value:fx.coinPct,    fixed:true };
    if (fx.energySave) return { id:"energySave", tier:"major", value:fx.energySave, fixed:true };
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
  function _allowedRaritiesForMinutes(minutes){
    if (typeof window.allowedRaritiesForMinutes === "function") return window.allowedRaritiesForMinutes(minutes);
    var out = new Set(LR_RARITIES); return out;
  }
  function _now(){ return window.now ? window.now() : Date.now(); }
  function _uid(){ return window.uid ? window.uid() : (Math.random().toString(36).slice(2,10) + Date.now().toString(36).slice(-4)); }
  function _saveState(){ try { window.saveState && window.saveState(); } catch(_){} }
  function _toast(msg, kind, actions){ try { window.toast && window.toast(msg, kind || "info", actions); } catch(_){} }
  function _escapeHtml(s){ return window.escapeHtml ? window.escapeHtml(s) : String(s||"").replace(/[&<>"']/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[c]; }); }
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
                 consumables:{}, loadout:{slot1:null,slot2:null,slot3:null}, loadoutUpdatedAt:0 };
    } else {
      if (!Array.isArray(s.loot.drops)) s.loot.drops = [];
      if (!s.loot.pity) s.loot.pity = { common:0, uncommon:0, rare:0, epic:0, legendary:0, mythic:0 };
      if (!s.loot.materials) s.loot.materials = { dust:0, shards:0, essence:0 };
      if (!s.loot.dyesOwned) s.loot.dyesOwned = {};
      if (!s.loot.gemsOwned) s.loot.gemsOwned = {};
      if (!s.loot.consumables) s.loot.consumables = {};
      if (!s.loot.loadout) s.loot.loadout = { slot1:null, slot2:null, slot3:null };
      if (typeof s.loot.loadoutUpdatedAt !== "number") s.loot.loadoutUpdatedAt = 0;
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

  function lrTemplateSources(templateId){
    return LR_SOURCE_OVERRIDES[templateId] || ["Fight","Hunt","Loot"];
  }

  function lrPityMultiplier(rarity, count){
    var th = LR_PITY_THRESHOLD[rarity];
    if (!isFinite(th) || count < th) return 1.0;
    return 1.0 + Math.min(0.6, (count - th) / (th * 0.5) * 0.6);
  }

  function lrRarityWeightsForAction(action, pityCounts){
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

  function lrEligibleTemplates(action, minutes){
    var allowed = _allowedRaritiesForMinutes(minutes);
    var TABLE = _LOOT_TABLE() || [];
    return TABLE.filter(function(it){
      if (!allowed.has(it[2])) return false;
      var sources = lrTemplateSources(_lootId(it));
      return sources.indexOf(action) >= 0;
    });
  }

  function lrPickTemplateInRarity(action, rarity, minutes, rng){
    var eligible = lrEligibleTemplates(action, minutes).filter(function(it){ return it[2] === rarity; });
    if (!eligible.length) return null;
    /* v9 dedup: don't hand back an item you already own until the rarity pool is
       exhausted. Draw only from UNOWNED eligible templates; once you own them all,
       fall back to the full pool (those dupes get auto-converted to materials in
       lrCommitDrop). Hearthstone-style "no dupes until the set is complete". */
    var owned = (_state() && _state().lootOwned) || {};
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
    var candidates = Object.keys(LR_AFFIX_DEFS).filter(function(k){ return !excludeIds || !excludeIds.has(k); });
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
    return {
      iid: _uid(),
      lootId: templateId,
      tier: tier,
      level: 0,
      affixes: affixes,
      sockets: sockets,
      dyeId: null,
      createdAt: _now(),
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

  function lrEquippedStats(hero){
    var s = _state();
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
    s.loot.materials.dust = dust - cost;
    return { ok:true, before:before, after:next, costPaid:cost };
  }

  function lrUpgradeInstance(s, iid){
    s = lrEnsureShape(s || _state());
    var inst = s.lootInstances[iid];
    if (!inst) return { ok:false, reason:"unknown_instance" };
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
    s.loot.materials.shards = haveShards - shardsCost;
    s.coins = haveCoins - coinCost;
    s.coinsSpent = (s.coinsSpent|0) + coinCost;
    return { ok:true, level:nextLevel, shardsPaid:shardsCost, coinsPaid:coinCost };
  }

  function lrSocketGem(s, iid, socketIdx, gemId){
    s = lrEnsureShape(s || _state());
    var inst = s.lootInstances[iid];
    if (!inst) return { ok:false, reason:"unknown_instance" };
    if (inst.locked) return { ok:false, reason:"locked" };
    if (socketIdx < 0 || socketIdx >= inst.sockets.length) return { ok:false, reason:"no_socket" };
    if (inst.sockets[socketIdx].gemId) return { ok:false, reason:"socket_full" };
    if (!LR_GEM_DEFS[gemId]) return { ok:false, reason:"unknown_gem" };
    var owned = s.loot.gemsOwned[gemId]|0;
    if (owned <= 0) return { ok:false, reason:"no_gem_owned" };
    s.loot.gemsOwned[gemId] = owned - 1;
    inst.sockets[socketIdx] = { gemId:gemId };
    return { ok:true, gemId:gemId, socketIdx:socketIdx };
  }

  function lrUnsocketGem(s, iid, socketIdx){
    s = lrEnsureShape(s || _state());
    var inst = s.lootInstances[iid];
    if (!inst) return { ok:false, reason:"unknown_instance" };
    if (inst.locked) return { ok:false, reason:"locked" };
    if (socketIdx < 0 || socketIdx >= inst.sockets.length) return { ok:false, reason:"no_socket" };
    var g = inst.sockets[socketIdx].gemId;
    if (!g) return { ok:false, reason:"empty_socket" };
    inst.sockets[socketIdx] = { gemId:null };
    return { ok:true, destroyed:g };
  }

  function lrApplyDye(s, iid, dyeId){
    s = lrEnsureShape(s || _state());
    var inst = s.lootInstances[iid];
    if (!inst) return { ok:false, reason:"unknown_instance" };
    if (dyeId !== null && !LR_DYE_DEFS[dyeId]) return { ok:false, reason:"unknown_dye" };
    if (dyeId !== null && !(s.loot.dyesOwned[dyeId]|0)) return { ok:false, reason:"no_dye_owned" };
    inst.dyeId = dyeId;
    return { ok:true, dyeId:dyeId };
  }

  function lrSalvageInstance(s, iid){
    s = lrEnsureShape(s || _state());
    var inst = s.lootInstances[iid];
    if (!inst) return { ok:false, reason:"unknown_instance" };
    if (inst.locked) return { ok:false, reason:"locked" };
    var yieldRow = LR_SALVAGE_YIELD[inst.tier] || LR_SALVAGE_YIELD.common;
    s.loot.materials.dust    = (s.loot.materials.dust|0)    + yieldRow.dust;
    s.loot.materials.shards  = (s.loot.materials.shards|0)  + yieldRow.shards;
    s.loot.materials.essence = (s.loot.materials.essence|0) + yieldRow.essence;
    var gemDropped = null;
    if (yieldRow.gemChance > 0 && Math.random() < yieldRow.gemChance){
      var gemIds = Object.keys(LR_GEM_DEFS);
      gemDropped = gemIds[Math.floor(Math.random() * gemIds.length)];
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
    delete s.lootInstances[iid];
    return { ok:true, yield:yieldRow, gemDropped:gemDropped };
  }

  function lrToggleLock(s, iid){
    s = lrEnsureShape(s || _state());
    var inst = s.lootInstances[iid];
    if (!inst) return { ok:false, reason:"unknown_instance" };
    inst.locked = !inst.locked;
    return { ok:true, locked:inst.locked };
  }

  /* ---------- combat ---------- */

  function lrPickEnemy(level, rng){
    rng = rng || Math.random;
    var MS = _MONSTERS() || [];
    var lv = Math.max(1, level|0);
    var candidates = MS.filter(function(m){ return m[4] <= lv + 5 && m[4] >= lv - 30; });
    var pool = candidates.length ? candidates : MS.slice(0,3);
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

  function lrResolveEncounter(ctx, encounterIdx, rng){
    rng = rng || Math.random;
    var enemyRow = ctx.enemyOverride || lrPickEnemy(ctx.heroLevel, rng);
    var enemyId = enemyRow[1];
    var traits = LR_MONSTER_TRAITS[enemyId] || { tags:[], weak:[], resist:[], dmg:10, acc:0.85 };
    var stats = ctx.heroStats || {};
    var baseAtk = 8 + Math.floor((ctx.heroLevel || 1) * 1.5);
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
    var enemyHPMax = Math.round(enemyRow[5] * (1 + 0.04 * ((ctx.heroLevel||1) - enemyRow[4])));
    var enemyHP = Math.max(5, enemyHPMax);
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
               tier:enemyRow[0], weak:traits.weak, resist:traits.resist, boss:!!traits.boss },
      heroHPStart: heroHPStart, heroHPEnd: heroHP,
      primary: primary, primaryAmt: primaryAmt, baseAtk: baseAtk,
      rounds: log,
      outcome: outcome, killed: killed
    };
  }

  function lrRollDropForEncounter(s, action, minutes, enemyRow, outcome, rng){
    s = lrEnsureShape(s || _state());
    rng = rng || Math.random;
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
    if (sum > 0) for (var j=0; j<LR_RARITIES.length; j++) biased[LR_RARITIES[j]] /= sum;
    var allowed = _allowedRaritiesForMinutes(minutes);
    var sum2 = 0;
    for (var k=0; k<LR_RARITIES.length; k++){
      var rr = LR_RARITIES[k];
      if (!allowed.has(rr)) biased[rr] = 0;
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
        return t && t[2] === rarity;
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
    if (!template) template = lrPickTemplateInRarity(action, rarity, minutes, rng);
    if (!template) return null;
    return {
      rarity: rarity, template: template,
      odds: { ratio:ratio, rolled:roll },
      pity: { tier:rarity, sinceLast:s.loot.pity[rarity]|0, bumped:lrPityMultiplier(rarity, s.loot.pity[rarity]) > 1 },
      fromMonsterTable: fromMonsterTable
    };
  }

  function lrCommitDrop(s, drop, ctx){
    s = lrEnsureShape(s || _state());
    var template = drop.template;
    var templateId = _lootId(template);
    var __wasOwned = ((s.lootOwned[templateId]|0) > 0); /* v9: owned before this drop => duplicate */
    var instance = lrMintInstance(template, { source:{ kind:"drop", action:ctx.action, enemyId:ctx.enemyId } });
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
      id: _uid(), at: _now(),
      sessionId: ctx.sessionId || null,
      iid: instance.iid,
      templateId: templateId,
      rarity: drop.rarity,
      sourceAction: ctx.action,
      enemyId: ctx.enemyId || null,
      odds: { rolled: drop.odds.rolled, total: 1, ratio: drop.odds.ratio },
      pity: drop.pity,
      fromMonsterTable: !!drop.fromMonsterTable,
      outcome: ctx.outcome || null
    };
    s.loot.drops.push(entry);
    if (s.loot.drops.length > LR_DROP_LOG_CAP) s.loot.drops.shift();
    var flags = (s.lootRework && s.lootRework.flags) || {};
    /* v9: a drop you ALREADY own is a duplicate (rarity pool exhausted -- see
       lrPickTemplateInRarity). Auto-convert it to materials so dupes still feel
       rewarding instead of "the same item again". Opt-out via flag; default on. */
    if (__wasOwned && flags.autoSalvageDupes !== false){
      var __sv = lrSalvageInstance(s, instance.iid);
      if (__sv && __sv.ok){
        entry.autoSalvaged = true; entry.dupeConverted = true;
        var __y = __sv.yield || {};
        var __tname = (template[1] || templateId);
        var __bits = [];
        if (__y.dust)    __bits.push("+"+__y.dust+" dust");
        if (__y.shards)  __bits.push("+"+__y.shards+" shards");
        if (__y.essence) __bits.push("+"+__y.essence+" essence");
        if (__sv.gemDropped && LR_GEM_DEFS[__sv.gemDropped]) __bits.push("+"+LR_GEM_DEFS[__sv.gemDropped].sym+" "+LR_GEM_DEFS[__sv.gemDropped].name);
        try { _toast("♻️ Duplicate "+__tname+" -> "+(__bits.join(", ")||"materials"), "info"); } catch(_){}
      }
    } else if (flags.autoSalvageCommonDupes && drop.rarity === "common"){
      var dupes = 0;
      var keys = Object.keys(s.lootInstances);
      for (var k=0; k<keys.length; k++){
        var it = s.lootInstances[keys[k]];
        if (it.lootId === templateId) dupes++;
      }
      if (dupes >= 4){
        lrSalvageInstance(s, instance.iid);
        entry.autoSalvaged = true;
      }
    }
    return entry;
  }

  function lrRunSessionCombat(s, opts){
    s = lrEnsureShape(s || _state());
    opts = opts || {};
    var action = opts.action || "Fight";
    var minutes = Math.max(0, opts.minutes|0);
    var sessionId = opts.sessionId || ("sess_" + _now());
    var rng = opts.rng || lrSeededRng(lrHashStr(sessionId));
    var heroStats = lrEquippedStats(s.hero);
    var heroLevel = (s.hero && s.hero.level)|0 || 1;
    var baseHP = (s.hero && s.hero.hp)|0 || 100;
    var combatActions = { Fight:true, Hunt:true };
    var isCombat = !!combatActions[action];
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
      var encCtx = { heroStats:Object.assign({}, heroStats), heroLevel:heroLevel, heroHP:runningHP };
      if (bombBonus){
        encCtx.heroStats[bombBonus.damageType] = (encCtx.heroStats[bombBonus.damageType] || 0) + bombBonus.value;
      }
      var enc = lrResolveEncounter(encCtx, i, rng);
      runningHP = enc.heroHPEnd;
      encounters.push(enc);
      _recordEncounter(enc.enemy.id);
      if (enc.outcome !== "whiff"){
        (function tryRoll(rerollsLeft){
          var MS = _MONSTERS() || [];
          var enemyRow = null;
          for (var mi=0; mi<MS.length; mi++) if (MS[mi][1] === enc.enemy.id) { enemyRow = MS[mi]; break; }
          var d = lrRollDropForEncounter(s, action, minutes, enemyRow, enc.outcome, rng);
          if (d){
            var e = lrCommitDrop(s, d, { sessionId:sessionId, action:action, enemyId:enc.enemy.id, outcome:enc.outcome });
            drops.push(e);
          } else if (rerollsLeft > 0){
            tryRoll(rerollsLeft - 1);
          }
        })(bonusRerolls);
        bonusRerolls = 0;
      }
    }
    if (!isCombat && minutes > 0){
      var d = lrRollDropForEncounter(s, action, minutes, null, "solid", rng);
      if (d){
        var e = lrCommitDrop(s, d, { sessionId:sessionId, action:action, enemyId:null, outcome:"solid" });
        drops.push(e);
      }
    }
    if (s.hero && isCombat){
      s.hero.hp = Math.max(1, Math.min(100, runningHP));
    }
    return { encounters:encounters, drops:drops, consumed:consumedLog };
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
    try {
      var a = lrEnsureAudio();
      if (!a) return;
      var rates = { common:0.9, uncommon:1.0, rare:1.15, epic:1.3, legendary:1.5, mythic:1.7 };
      a.playbackRate = rates[rarity] || 1.0;
      a.currentTime = 0;
      var p = a.play();
      if (p && p.catch) p.catch(function(){});
    } catch(e) {}
  }

  /* ---------- session-end loot pipeline ---------- */

  function lrSessionEndLootPipeline(action, minutes, sessionId){
    var s = lrEnsureShape(_state());
    if (!s || !s.loot || !s.loot.drops){
      var legacy = window.rollLoot ? window.rollLoot(minutes) : null;
      return { legacyItem: legacy, drops:[], encounters:[] };
    }
    var out = lrRunSessionCombat(s, { action:action, minutes:minutes, sessionId:sessionId });
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
      if (best && anim){
        lrPlayDropSound(best.rarity);
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
    try {
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
    } catch(e){}
    return { legacyItem: legacyItem, drops: out.drops, encounters: out.encounters, consumed: out.consumed };
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
      pityHtml = '<div style="font-size:.76rem;color:#cbd5e1;margin:2px 0 8px;font-weight:700">📚 Collection: ' + __owned + '/' + __total + ' found (' + __pct + '%)</div>' + pityHtml;
    } catch(_){}
    var drops = Array.isArray(s.loot.drops) ? s.loot.drops.slice().reverse() : [];
    if (!drops.length){
      host.innerHTML = pityHtml + '<div class="fh-empty"><span class="ico">\U0001F381</span>No drops yet — finish a focus session to earn your first loot.</div>';
      return;
    }
    var MS = _MONSTERS() || [];
    var rows = drops.slice(0, LR_BATTLE_REPORT_CAP).map(function(entry){
      var tmpl = _lootById(entry.templateId);
      var sym = tmpl ? tmpl[0] : "?";
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
        '<div class="drop-sym">' + sym + '</div>' +
        '<div>' +
        '<div class="drop-name">' + _escapeHtml(name) + ' <span class="muted" style="font-weight:400">· ' + entry.rarity + '</span></div>' +
        '<div class="drop-meta">' + _escapeHtml(ago) + ' · ' + _escapeHtml(action) + monBadge + '</div>' +
        '</div>' +
        '<div class="drop-odds">' + odds + '<br><span class="muted" style="font-size:.7rem">' + pityTxt + '</span></div>' +
        '</div>';
    }).join("");
    host.innerHTML = pityHtml + rows;
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
      '<div class="forge-mat"><b>✨ ' + (mat.dust|0) + '</b><div class="mat-name">Arcane Dust</div></div>' +
      '<div class="forge-mat"><b>💎 ' + (mat.shards|0) + '</b><div class="mat-name">Crystal Shards</div></div>' +
      '<div class="forge-mat"><b>🌌 ' + (mat.essence|0) + '</b><div class="mat-name">Mythic Essence</div></div>' +
      '</div>';
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
        var sym = tmpl ? tmpl[0] : "?";
        var name = tmpl ? tmpl[1] : inst.lootId;
        var affs = (inst.affixes || []).map(function(a){ return '<span class="fi-aff">' + _escapeHtml(lrAffixLabel(a)) + '</span>'; }).join("");
        var equippedCls = equippedIids.has(inst.iid) ? " equipped" : "";
        var lockedCls = inst.locked ? " locked" : "";
        return '<button type="button" class="forge-instance rar-' + inst.tier + equippedCls + lockedCls + '" data-lr-iid="' + _escapeHtml(inst.iid) + '">' +
          '<div style="font-size:1.5rem">' + sym + '</div>' +
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
    var sym = tmpl ? tmpl[0] : "?";
    var name = tmpl ? tmpl[1] : inst.lootId;
    var slot = tmpl ? _lootSlot(tmpl) : "none";
    var caps = LR_RARITY_CAPS[inst.tier] || LR_RARITY_CAPS.common;
    var mat = s.loot.materials || { dust:0, shards:0, essence:0 };
    var rerollCost = LR_REROLL_DUST[inst.tier] || 5;
    var upCost = { shards: (inst.level+1)*10, coins: (inst.level+1)*25 };
    var affRows = (inst.affixes || []).map(function(a, i){
      var label = lrAffixLabel(a);
      var meta = a.fixed
        ? '<span class="aff-fixed">baseline · can\'t reroll</span>'
        : '<span class="aff-cost">' + rerollCost + ' ✨</span>';
      var btn = a.fixed
        ? '<button disabled>Reroll</button>'
        : '<button data-lr-reroll="' + i + '" ' + ((mat.dust|0)<rerollCost?"disabled":"") + '>Reroll</button>';
      return '<div class="li-aff-row"><span>' + _escapeHtml(label) + '</span>' + meta + btn + '</div>';
    }).join("") || '<div class="muted" style="font-size:.78rem">No affixes on this item.</div>';
    var socketsHtml = inst.sockets.length
      ? inst.sockets.map(function(sk, i){
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
    var dyeHtml = Object.keys(LR_DYE_DEFS).map(function(k){
      var d = LR_DYE_DEFS[k];
      var owned = (s.loot.dyesOwned[k]|0) > 0;
      if (!owned && inst.dyeId !== k) return "";
      return '<span class="li-dye' + (inst.dyeId===k?" active":"") + '" data-lr-dye="' + k + '" title="' + _escapeHtml(d.name) + '" style="background:' + d.color + '"></span>';
    }).join("");
    var lockLabel = inst.locked ? "Unlock" : "Lock";
    var upgradeDisabled = inst.level >= caps.maxLevel || (mat.shards|0) < upCost.shards || (s.coins|0) < upCost.coins;
    var stats = lrInstanceStats(inst);
    var statsLines = Object.keys(stats).map(function(k){
      var def = LR_AFFIX_DEFS[k];
      var label = def ? def.label.replace("{n}", stats[k]) : (k + " +" + stats[k]);
      return _escapeHtml(label);
    }).join(" · ") || "—";
    host.innerHTML =
      '<div class="li-head">' +
        '<div class="li-sym">' + sym + '</div>' +
        '<div>' +
          '<h4>' + _escapeHtml(name) + '</h4>' +
          '<div class="li-sub">' + inst.tier + ' · +' + inst.level + '/' + caps.maxLevel + ' · slot: ' + slot + '</div>' +
          '<div class="li-sub" style="margin-top:3px;color:var(--ink)">Effective: ' + statsLines + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="li-section"><h5>Affixes</h5>' + affRows + '</div>' +
      '<div class="li-section"><h5>Sockets (' + inst.sockets.length + ')</h5><div class="li-sockets">' + socketsHtml + '</div></div>' +
      '<div class="li-section"><h5>Dye</h5><div class="li-dyes">' + (dyeHtml || '<div class="muted" style="font-size:.78rem">No dyes owned yet.</div>') + '<span class="li-dye' + (inst.dyeId===null?" active":"") + '" data-lr-dye="" title="Default" style="background:transparent;border-style:dashed"></span></div></div>' +
      '<div class="li-actions">' +
        '<button data-lr-upgrade ' + (upgradeDisabled?"disabled":"") + '>Upgrade +1 (' + upCost.shards + ' 💎 + ' + upCost.coins + ' 🪙)</button>' +
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
      _toast("Salvaged → +" + r.yield.dust + " ✨ +" + r.yield.shards + " 💎 +" + r.yield.essence + " 🌌" + (r.gemDropped?(" +1 " + LR_GEM_DEFS[r.gemDropped].name):""), "good");
    });
  }

  function showBattleReport(run){
    if (!run || !run.encounters || !run.encounters.length){
      _toast("Battle Report: no encounters this session.", "info");
      return;
    }
    var host = document.getElementById("battle-report-body");
    if (!host) return;
    var rows = run.encounters.map(function(enc){
      var hpPct = Math.max(0, Math.min(100, Math.round((enc.heroHPEnd/100)*100)));
      var enemy = enc.enemy;
      var drop = null;
      for (var di=0; di<run.drops.length; di++) if (run.drops[di].enemyId === enemy.id) { drop = run.drops[di]; break; }
      var dropMeta = drop
        ? ("Drop: " + (function(){ var t=_lootById(drop.templateId); return t?t[1]:drop.templateId; })() + " (" + drop.rarity + ")")
        : "No drop";
      var weakHit = false, resistHit = false;
      for (var ri=0; ri<enc.rounds.length; ri++){
        if (enc.rounds[ri].weak) weakHit = true;
        if (enc.rounds[ri].resist) resistHit = true;
      }
      return '<div class="br-encounter">' +
        '<div class="br-enemy">' + enemy.sym + '</div>' +
        '<div>' +
          '<div class="br-name">' + _escapeHtml(enemy.name) + ' <span class="muted" style="font-weight:400;font-size:.72rem">lv ' + enemy.level + (enemy.boss?" · BOSS":"") + '</span></div>' +
          '<div class="br-detail">' + enc.rounds.length + ' round' + (enc.rounds.length>1?"s":"") + ' · ' + (weakHit?"weakness hit · ":"") + (resistHit?"resisted · ":"") + 'HP ' + enc.heroHPStart + ' → ' + enc.heroHPEnd + '</div>' +
          '<div class="br-hpbar"><div style="width:' + hpPct + '%"></div></div>' +
          '<div class="br-detail" style="margin-top:3px">' + _escapeHtml(dropMeta) + '</div>' +
        '</div>' +
        '<div class="br-outcome ' + enc.outcome + '">' + enc.outcome + '</div>' +
      '</div>';
    }).join("");
    host.innerHTML = rows;
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
        // crude match by symbol
        var sym = el.querySelector(".sym");
        if (sym && sym.textContent === tmpl[0]){ match = { slot:slot }; break; }
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
    // Tick injection / render every couple of seconds — cheap, idempotent.
    setInterval(function(){
      try { lrInjectCustomizeButtons(); } catch(_){}
    }, 2000);
    // Initial render of new panels
    setTimeout(function(){
      try { renderDropsPanel(); } catch(_){}
      try { renderForgePanel(); } catch(_){}
    }, 200);
  }
  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", lrBoot, { once:true });
  } else {
    setTimeout(lrBoot, 0);
  }

  /* ---------- public surface (window + __FocusHero) ---------- */
  var publics = {
    LR_RARITIES: LR_RARITIES, LR_SOURCE_WEIGHTS: LR_SOURCE_WEIGHTS,
    LR_PITY_THRESHOLD: LR_PITY_THRESHOLD, LR_RARITY_CAPS: LR_RARITY_CAPS,
    LR_AFFIX_DEFS: LR_AFFIX_DEFS, LR_GEM_DEFS: LR_GEM_DEFS,
    LR_DYE_DEFS: LR_DYE_DEFS, LR_CONSUMABLE_DEFS: LR_CONSUMABLE_DEFS,
    LR_MONSTER_TRAITS: LR_MONSTER_TRAITS, LR_MONSTER_DROPS: LR_MONSTER_DROPS,
    LR_REROLL_DUST: LR_REROLL_DUST, LR_SALVAGE_YIELD: LR_SALVAGE_YIELD,
    LR_DROP_LOG_CAP: LR_DROP_LOG_CAP, LR_OUTCOME_BIAS: LR_OUTCOME_BIAS,
    lrSeededRng: lrSeededRng, lrHashStr: lrHashStr,
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
    lrPickEnemy: lrPickEnemy, lrResolveEncounter: lrResolveEncounter,
    lrRollDropForEncounter: lrRollDropForEncounter, lrCommitDrop: lrCommitDrop,
    lrRunSessionCombat: lrRunSessionCombat,
    lrSessionEndLootPipeline: lrSessionEndLootPipeline,
    lrEnsureShape: lrEnsureShape, lrEnsureInstanceForSlot: lrEnsureInstanceForSlot,
    lrEncountersForMinutes: lrEncountersForMinutes,
    lrAffixLabel: lrAffixLabel, lrBaselineAffix: lrBaselineAffix,
    renderDropsPanel: renderDropsPanel, renderForgePanel: renderForgePanel,
    openLootInspector: openLootInspector, renderLootInspector: renderLootInspector,
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
    // 4) Source separation
    var TT = (typeof window.LOOT_TABLE !== "undefined") ? window.LOOT_TABLE : null;
    if (TT){
      var travel = lrEligibleTemplates("Travel", 120).map(function(it){ return _lootId(it); });
      var fight  = lrEligibleTemplates("Fight",  120).map(function(it){ return _lootId(it); });
      add("loot.source: Travel pool ≠ Fight pool", JSON.stringify(travel) !== JSON.stringify(fight));
      add("loot.source: Travel pool includes copper_coin", travel.indexOf("copper_coin") >= 0);
      add("loot.source: Travel pool excludes dualblade", travel.indexOf("dualblade") < 0);
    }
    // 5) Gate
    var elig30 = lrEligibleTemplates("Fight", 30);
    add("loot.gate: 30-min Fight has no legendary", !elig30.some(function(it){ return it[2] === "legendary"; }));
    var elig120 = lrEligibleTemplates("Fight", 120);
    add("loot.gate: 120-min Fight allows legendary+mythic",
        elig120.some(function(it){ return it[2] === "legendary"; }) &&
        elig120.some(function(it){ return it[2] === "mythic"; }));
    // 6) Mint baseline preserved
    if (window.lootById){
      var inst = lrMintInstance(window.lootById("whetstone_blade"), { rng: lrSeededRng(42) });
      var baseline = inst.affixes.filter(function(a){ return a.fixed; })[0];
      add("loot.mint: whetstone baseline is +5 xpPct fixed",
          !!baseline && baseline.id === "xpPct" && baseline.value === 5);
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
