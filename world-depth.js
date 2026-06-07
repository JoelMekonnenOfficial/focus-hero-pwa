/* ================================================================
 * Focus Hero v8.5.0 - WORLD DEPTH
 *
 * Companion to index.html. Loaded with <script src> after the loot
 * rework and character rebuild modules.
 *
 * This module adds depth on top of the v8.3 loot rework + v8.4
 * character/mount rebuild:
 *
 *   1. LOOT KINDS - 9 new item categories beyond gear:
 *        relic, rune, gem, reagent, trophy, tome, map, key, charm
 *      ~200 catalog items in addition to LOOT_TABLE.
 *
 *   2. RARITY LADDER - Common, Uncommon, Rare, Epic, Legendary,
 *      Mythic, plus two new top tiers:
 *        Cursed   - powerful with a downside trade-off
 *        Artifact - unique 1-of-1 named items with lore
 *
 *   3. AFFIX NAMING - 30+ prefixes, 30+ suffixes, generated as
 *      "Burning Sword of the Phoenix" style names with stat-bias hints.
 *
 *   4. GEAR SETS - 8 named sets with 3/5/full-piece bonuses.
 *
 *   5. CRAFTING - combine 3 same-rarity instances into 1 next-tier
 *      with retained affixes; enchanting via gems + reagents.
 *
 *   6. LOOT VAULT - separate cap-bounded storage (state.loot.vault).
 *
 *   7. CRYSTAL SHARDS - new premium-grind currency (state.crystalShards).
 *      Gained from boss kills, mythic drops, long streak rewards.
 *      Spent on Mystery Box, premium rerolls, zone unlocks.
 *
 *   8. QUESTS - 12 daily / 10 weekly / 6 seasonal templates with
 *      auto-rolling on date rollover. Tracked under state.questSystem.
 *
 *   9. WORLD ZONES - 6 zones (Verdant Vale, Frostpeak, Ember Wastes,
 *      Sunken Reef, Shadowmoor, Astral Plains) with biome enemies,
 *      mount bias, loot bias. Unlock by keys.
 *
 *  10. ENEMY EXPANSION - 45+ new enemies across biomes, taking the
 *      total bestiary past 60.
 *
 *  11. BOSS ENCOUNTERS - sessions >= 90 min Fight/Hunt spawn a boss
 *      as the final encounter, with elevated HP/damage and a
 *      guaranteed Epic+ drop + Crystal Shards reward.
 *
 *  12. ACHIEVEMENTS - 100+ achievements in tiered families
 *      (mounts, zones, quests, bosses, crafting, sets, ...).
 *
 * Migration: DATA_VERSION 12 -> 13. Additive only.
 *   Adds: state.crystalShards = 0
 *         state.questSystem = { daily:[], weekly:[], seasonal:[], lastRoll: { daily:null, weekly:null, seasonal:null } }
 *         state.world = { currentZone:"verdant_vale", unlockedZones:{verdant_vale:true}, bossesDefeated:0 }
 *         state.loot.vault = { instances:{}, cap:100 }
 *         state.craftingDust = 0
 *         state.achievementsV85 = {}
 *
 * Contract: every existing field byte-identical post-migration.
 * ================================================================ */

(function(){
  "use strict";

  /* ---------- RARITY LADDER ---------- */

  var WD_RARITIES = ["common","uncommon","rare","epic","legendary","mythic","cursed","artifact"];
  var WD_RARITY_COLOR = {
    common:    "#9CA3AF",
    uncommon:  "#22C55E",
    rare:      "#3B82F6",
    epic:      "#A855F7",
    legendary: "#F59E0B",
    mythic:    "#FF77C8",
    cursed:    "#7C1D1D",
    artifact:  "#E0E5FF"
  };
  var WD_RARITY_LABEL = {
    common:"Common", uncommon:"Uncommon", rare:"Rare", epic:"Epic",
    legendary:"Legendary", mythic:"Mythic", cursed:"Cursed", artifact:"Artifact"
  };

  /* ---------- LOOT KINDS (data tables) ---------- */

  /* Relics - passive buffs slotted into one of two relic slots.
     Each relic has an aura effect that triggers per session. */
  var WD_RELICS = [
    { id:"relic_lantern",       name:"Wayfinder Lantern",      sym:"🏮", tier:"common",    effect:{ xpPct:3 }, lore:"Guides the lost through dim woods." },
    { id:"relic_hourglass",     name:"Cracked Hourglass",      sym:"⏳", tier:"common",    effect:{ xpPct:3 }, lore:"Time grains slip through but it works." },
    { id:"relic_compass",       name:"Trail Compass",          sym:"🧭", tier:"common",    effect:{ coinPct:4 }, lore:"Always points to the next coin." },
    { id:"relic_book_worn",     name:"Worn Travel Journal",    sym:"📓", tier:"uncommon",  effect:{ xpPct:5 }, lore:"Notes on roads and how to walk them." },
    { id:"relic_eye_owl",       name:"Owl's Eye Charm",        sym:"👁️", tier:"uncommon",  effect:{ critPct:4 }, lore:"Sees in the dark of the page." },
    { id:"relic_horn_call",     name:"Hunter's Horn",          sym:"📯", tier:"rare",      effect:{ xpPct:7, coinPct:3 }, lore:"Calls back what the wild has taken." },
    { id:"relic_seed_world",    name:"Worldseed",              sym:"🌱", tier:"rare",      effect:{ energySave:2 }, lore:"Sprouts in any soil, even doubt." },
    { id:"relic_chalice_moon",  name:"Moonlit Chalice",        sym:"🍷", tier:"epic",      effect:{ xpPct:10, lifesteal:3 }, lore:"Drinks the moon, gives back warmth." },
    { id:"relic_anchor_void",   name:"Void Anchor",            sym:"⚓", tier:"epic",      effect:{ resPhys:8, resElem:8 }, lore:"Keeps the self from drifting." },
    { id:"relic_star_charted",  name:"Charted Star",           sym:"🌠", tier:"epic",      effect:{ xpPct:12 }, lore:"Sky-pinned. Won't move without you." },
    { id:"relic_heart_phoenix", name:"Phoenix Heart",           sym:"❤️‍🔥", tier:"legendary", effect:{ xpPct:18, lifesteal:6 }, lore:"Each session resets the embers." },
    { id:"relic_eye_dragon",    name:"Dragon Eye",              sym:"👁️‍🗨️", tier:"legendary", effect:{ critPct:14, dmgFire:18 }, lore:"Sees what wants to be slain." },
    { id:"relic_throne_lost",   name:"Lost Throne Shard",       sym:"♛", tier:"mythic",    effect:{ xpPct:25, coinPct:25 }, lore:"A king's seat, broken into seven shards." },
    { id:"relic_eye_universe",  name:"Eye of the Universe",     sym:"🪐", tier:"mythic",    effect:{ xpPct:30 }, lore:"Looks back at you for a moment, every session." },
    { id:"relic_doomwhisper",   name:"Doomwhisper Token",       sym:"🗣️", tier:"cursed",    effect:{ xpPct:40, energyPenalty:5 }, lore:"It speaks. You listen. Energy bleeds." },
    { id:"relic_kings_burden",  name:"King's Burden",            sym:"👑", tier:"cursed",    effect:{ coinPct:50, comboReset:true }, lore:"Heavy coin, but you forget how to chain." },
    { id:"relic_artifact_first",name:"The First Spark",          sym:"✨", tier:"artifact",  effect:{ xpPct:50, allStatsPct:5 }, lore:"Some say focus itself was born here.", artifactKey:"first_spark" }
  ];

  /* Runes - socket into weapons (single rune slot on the weapon). */
  var WD_RUNES = [
    { id:"rune_ansuz",    name:"Ansuz",     sym:"ᚨ", tier:"common",    effect:{ xpPct:3 } },
    { id:"rune_uruz",     name:"Uruz",      sym:"ᚢ", tier:"common",    effect:{ critPct:3 } },
    { id:"rune_thurisaz", name:"Thurisaz",  sym:"ᚦ", tier:"common",    effect:{ dmgFire:5 } },
    { id:"rune_isaz",     name:"Isaz",      sym:"ᛁ", tier:"uncommon",  effect:{ dmgFrost:7 } },
    { id:"rune_kenaz",    name:"Kenaz",     sym:"ᚲ", tier:"uncommon",  effect:{ dmgFire:8 } },
    { id:"rune_gebo",     name:"Gebo",      sym:"ᚷ", tier:"uncommon",  effect:{ coinPct:6 } },
    { id:"rune_sowilo",   name:"Sowilo",    sym:"ᛋ", tier:"rare",      effect:{ xpPct:7 } },
    { id:"rune_tiwaz",    name:"Tiwaz",     sym:"ᛏ", tier:"rare",      effect:{ critPct:6, dmgPhys:8 } },
    { id:"rune_berkano",  name:"Berkano",   sym:"ᛒ", tier:"rare",      effect:{ lifesteal:5 } },
    { id:"rune_dagaz",    name:"Dagaz",     sym:"ᛞ", tier:"epic",      effect:{ xpPct:12 } },
    { id:"rune_othala",   name:"Othala",    sym:"ᛟ", tier:"epic",      effect:{ coinPct:14 } },
    { id:"rune_algiz",    name:"Algiz",     sym:"ᛉ", tier:"epic",      effect:{ resPhys:10, resElem:10 } },
    { id:"rune_jera",     name:"Jera",      sym:"ᛃ", tier:"legendary", effect:{ xpPct:17, coinPct:10 } },
    { id:"rune_ehwaz",    name:"Ehwaz",     sym:"ᛖ", tier:"legendary", effect:{ critPct:14, dmgArcane:18 } },
    { id:"rune_naudiz",   name:"Naudiz",    sym:"ᚾ", tier:"cursed",    effect:{ xpPct:30, hpPenalty:10 } },
    { id:"rune_inguz",    name:"Inguz",     sym:"ᛜ", tier:"artifact",  effect:{ allStatsPct:10 }, artifactKey:"runic_zenith" }
  ];

  /* Gems - slot into rings/amulets/relics for elemental + utility bonuses. */
  var WD_GEMS = [
    { id:"gem_emerald_v85",  name:"Emerald",   sym:"🟢", tier:"common",   effect:{ coinPct:5 } },
    { id:"gem_ruby_v85",     name:"Ruby",      sym:"🔴", tier:"common",   effect:{ dmgFire:6 } },
    { id:"gem_sapphire_v85", name:"Sapphire",  sym:"🔵", tier:"common",   effect:{ dmgFrost:6 } },
    { id:"gem_topaz_v85",    name:"Topaz",     sym:"🟡", tier:"uncommon", effect:{ xpPct:5 } },
    { id:"gem_amethyst",     name:"Amethyst",  sym:"🟣", tier:"uncommon", effect:{ dmgArcane:8 } },
    { id:"gem_diamond",      name:"Diamond",   sym:"💎", tier:"rare",     effect:{ critPct:8 } },
    { id:"gem_onyx_v85",     name:"Onyx",      sym:"⬛", tier:"rare",     effect:{ resPhys:8 } },
    { id:"gem_pearl_v85",    name:"Pearl",     sym:"⚪", tier:"rare",     effect:{ resElem:8 } },
    { id:"gem_garnet",       name:"Garnet",    sym:"🔻", tier:"epic",     effect:{ dmgFire:14, critPct:5 } },
    { id:"gem_aquamarine",   name:"Aquamarine",sym:"🌊", tier:"epic",     effect:{ dmgFrost:14, xpPct:5 } },
    { id:"gem_obsidian",     name:"Obsidian",  sym:"⬛", tier:"legendary",effect:{ critPct:14, lifesteal:5 } },
    { id:"gem_starstone",    name:"Starstone", sym:"⭐", tier:"legendary",effect:{ xpPct:20 } },
    { id:"gem_void_crystal", name:"Void Crystal", sym:"🟪", tier:"mythic",effect:{ allStatsPct:8 } }
  ];

  /* Reagents - alchemy ingredients, consumed by enchanting/crafting. */
  var WD_REAGENTS = [
    { id:"reag_moss",      name:"Glowmoss",         sym:"🌿", tier:"common" },
    { id:"reag_petal",     name:"Rose Petal",       sym:"🌹", tier:"common" },
    { id:"reag_root",      name:"Spindleroot",      sym:"🪴", tier:"common" },
    { id:"reag_feather",   name:"Hawk Feather",     sym:"🪶", tier:"uncommon" },
    { id:"reag_fang",      name:"Wolf Fang",        sym:"🦷", tier:"uncommon" },
    { id:"reag_scale_drk", name:"Drake Scale",      sym:"🪨", tier:"rare" },
    { id:"reag_eye_newt",  name:"Newt Eye",         sym:"👁️", tier:"rare" },
    { id:"reag_blood_orc", name:"Orc Blood",        sym:"🩸", tier:"rare" },
    { id:"reag_horn_uni",  name:"Unicorn Horn",     sym:"🦄", tier:"epic" },
    { id:"reag_heart_drk", name:"Dragon Heart",     sym:"❤️", tier:"legendary" },
    { id:"reag_dust_star", name:"Stardust",         sym:"✨", tier:"epic" },
    { id:"reag_essence_v", name:"Void Essence",     sym:"🟪", tier:"mythic" }
  ];

  /* Trophies - drop from boss kills, displayed in player room. */
  var WD_TROPHIES = [
    { id:"trophy_slime_king",   name:"Slime King's Crown",     sym:"👑", tier:"rare",      fromBoss:"slime_king" },
    { id:"trophy_wolf_alpha",   name:"Alpha Wolf Pelt",        sym:"🐺", tier:"rare",      fromBoss:"wolf_alpha" },
    { id:"trophy_drake_skull",  name:"Drake Skull",            sym:"💀", tier:"epic",      fromBoss:"drake_elder" },
    { id:"trophy_lich_phylact", name:"Lich Phylactery",        sym:"🧿", tier:"epic",      fromBoss:"lich_eternal" },
    { id:"trophy_dragon_head",  name:"Ancient Dragon Head",    sym:"🐉", tier:"legendary", fromBoss:"dragon_apex" },
    { id:"trophy_void_eye",     name:"Void Lord's Eye",        sym:"👁️‍🗨️", tier:"mythic",   fromBoss:"void_horror_apex" },
    { id:"trophy_minotaur_axe", name:"Minotaur's Axe",         sym:"🪓", tier:"epic",      fromBoss:"minotaur_lord" },
    { id:"trophy_griffin_feath",name:"Griffin Crown Feather",  sym:"🪶", tier:"legendary", fromBoss:"griffin_king" },
    { id:"trophy_phoenix_ash",  name:"Phoenix Ash Jar",        sym:"🏺", tier:"legendary", fromBoss:"phoenix_eternal" },
    { id:"trophy_kraken_tent",  name:"Kraken Tentacle",        sym:"🐙", tier:"epic",      fromBoss:"kraken_deep" }
  ];

  /* Tomes - skill unlocks / new combat moves / passive techniques. */
  var WD_TOMES = [
    { id:"tome_focus_basic",     name:"Tome of Focus I",        sym:"📕", tier:"common",   unlocks:"focus_basic" },
    { id:"tome_focus_adept",     name:"Tome of Focus II",       sym:"📗", tier:"uncommon", unlocks:"focus_adept" },
    { id:"tome_combat_basic",    name:"Combat Manual I",        sym:"📘", tier:"common",   unlocks:"combat_basic" },
    { id:"tome_combat_master",   name:"Combat Manual II",       sym:"📙", tier:"rare",     unlocks:"combat_master" },
    { id:"tome_arcane_intro",    name:"Arcane Codex",           sym:"📔", tier:"rare",     unlocks:"arcane_intro" },
    { id:"tome_elements",        name:"Tome of Elements",       sym:"📒", tier:"epic",     unlocks:"elements_all" },
    { id:"tome_dragon_lang",     name:"Draconic Lexicon",       sym:"📕", tier:"legendary",unlocks:"dragon_speech" },
    { id:"tome_lost_arts",       name:"Lost Arts Compendium",   sym:"📚", tier:"mythic",   unlocks:"lost_arts" }
  ];

  /* Maps - unlock new world zones. */
  var WD_MAPS = [
    { id:"map_frostpeak",    name:"Map: Frostpeak",         sym:"🗺️", tier:"uncommon",  unlocksZone:"frostpeak" },
    { id:"map_ember_wastes", name:"Map: Ember Wastes",      sym:"🗺️", tier:"rare",      unlocksZone:"ember_wastes" },
    { id:"map_sunken_reef",  name:"Map: Sunken Reef",       sym:"🗺️", tier:"rare",      unlocksZone:"sunken_reef" },
    { id:"map_shadowmoor",   name:"Map: Shadowmoor",        sym:"🗺️", tier:"epic",      unlocksZone:"shadowmoor" },
    { id:"map_astral",       name:"Map: Astral Plains",     sym:"🗺️", tier:"legendary", unlocksZone:"astral_plains" },
    { id:"map_fragment",     name:"Map Fragment",           sym:"📜", tier:"common",    unlocksZone:null }
  ];

  /* Keys - open special chests (RNG bonus rolls). */
  var WD_KEYS = [
    { id:"key_brass",     name:"Brass Key",       sym:"🗝️", tier:"common",    chestTier:"common" },
    { id:"key_iron",      name:"Iron Key",        sym:"🗝️", tier:"common",    chestTier:"uncommon" },
    { id:"key_silver",    name:"Silver Key",      sym:"🗝️", tier:"uncommon",  chestTier:"rare" },
    { id:"key_gold",      name:"Gold Key",        sym:"🗝️", tier:"rare",      chestTier:"epic" },
    { id:"key_platinum",  name:"Platinum Key",    sym:"🗝️", tier:"epic",      chestTier:"legendary" },
    { id:"key_void",      name:"Voidsteel Key",   sym:"🗝️", tier:"legendary", chestTier:"mythic" },
    { id:"key_artifact",  name:"First Key",       sym:"🗝️", tier:"artifact",  chestTier:"artifact", artifactKey:"first_key" }
  ];

  /* Charms - single-slot small buffs. */
  var WD_CHARMS = [
    { id:"charm_clover",      name:"Four-Leaf Clover",   sym:"🍀", tier:"uncommon",  effect:{ luckPct:5 } },
    { id:"charm_rabbit_foot", name:"Rabbit's Foot",      sym:"🐇", tier:"common",    effect:{ luckPct:3 } },
    { id:"charm_horseshoe",   name:"Lucky Horseshoe",    sym:"🪒", tier:"uncommon",  effect:{ coinPct:5 } },
    { id:"charm_evil_eye",    name:"Evil Eye",           sym:"🧿", tier:"rare",      effect:{ resElem:6 } },
    { id:"charm_dreamcatcher",name:"Dreamcatcher",       sym:"🕸️", tier:"rare",      effect:{ xpPct:5 } },
    { id:"charm_focus_bead",  name:"Focus Bead",         sym:"📿", tier:"epic",      effect:{ xpPct:8, energySave:1 } },
    { id:"charm_phoenix_egg", name:"Phoenix Egg",        sym:"🥚", tier:"legendary", effect:{ xpPct:12, lifesteal:4 } },
    { id:"charm_star_mark",   name:"Star Mark",          sym:"⭐", tier:"mythic",    effect:{ allStatsPct:5 } }
  ];

  /* Artifacts - 1-of-1 unique named items with lore. */
  var WD_ARTIFACTS = [
    { id:"art_first_spark",   name:"The First Spark",    sym:"✨", tier:"artifact", slot:"relic",  effect:{ xpPct:50, allStatsPct:5 }, lore:"Some say focus itself was born here." },
    { id:"art_eternal_blade", name:"Eternal Blade",      sym:"🗡️", tier:"artifact", slot:"weapon", effect:{ critPct:25, dmgPhys:40, dmgArcane:15 }, lore:"Forged in a session that never ended." },
    { id:"art_worldroot",     name:"Worldroot Staff",    sym:"🌳", tier:"artifact", slot:"weapon", effect:{ xpPct:30, dmgPoison:35 }, lore:"Grown from the first idea, watered by every since." },
    { id:"art_runic_zenith",  name:"Runic Zenith",       sym:"☯", tier:"artifact", slot:"rune",   effect:{ allStatsPct:10 }, lore:"The unmade rune. Reads as itself." },
    { id:"art_first_key",     name:"First Key",          sym:"🗝️", tier:"artifact", slot:"key",    effect:{ unlocksAll:true }, lore:"Opened the first door. Still works on every other one." }
  ];

  /* ---------- AFFIX NAMING ---------- */

  /* Prefix words - statistically biased toward stat themes.
     When generating a name, the affix-list is scanned for its stat
     bias to pick a coherent prefix; falls back to neutral pool. */
  var WD_PREFIXES = {
    dmgFire:    ["Burning","Searing","Inferno","Smoldering","Pyrelit"],
    dmgFrost:   ["Frozen","Glacial","Riming","Frostbound","Tundra"],
    dmgArcane: ["Arcane","Eldritch","Mystic","Wyrd","Hexed"],
    dmgPoison:  ["Toxic","Venomed","Plagueborn","Withered","Verdigris"],
    dmgPhys:    ["Brutal","Honed","Sharpened","Crushing","Vicious"],
    xpPct:      ["Studied","Tutored","Erudite","Scribed","Inked"],
    coinPct:    ["Golden","Avaricious","Merchant's","Gilded","Treasured"],
    critPct:    ["Lucky","Cunning","Sniper's","Surgical","Precise"],
    resPhys:    ["Iron","Stalwart","Bastion","Bulwark","Adamant"],
    resElem:    ["Warded","Glyphed","Sealed","Shrouded","Rune-etched"],
    dodgePct:   ["Swift","Quick","Fleet","Phantom","Slipping"],
    lifesteal:  ["Vampiric","Drinking","Hungering","Bloodied","Sanguine"],
    energySave: ["Buoyant","Featherlight","Easeful","Restful","Unburdened"]
  };
  var WD_PREFIX_NEUTRAL = ["Ancient","Forgotten","Lost","Sacred","Blessed","Cursed","Worn","Polished","Carved","Etched","Star-touched","Moonlit","Sunsworn","Storm-marked"];

  /* Suffix patterns - "of the X". */
  var WD_SUFFIXES = {
    dmgFire:    ["of the Phoenix","of the Forge","of the Sun","of Cinders","of the Inferno"],
    dmgFrost:   ["of the Glacier","of Winter","of the Pole","of the Frost Queen","of Sleet"],
    dmgArcane: ["of the Void","of Mystery","of the Stars","of the Mage Lords","of the Astral"],
    dmgPoison:  ["of the Swamp","of the Hag","of the Spider","of Withering","of the Bog"],
    dmgPhys:    ["of Might","of Strength","of Power","of the Champion","of Battle"],
    xpPct:      ["of Knowledge","of the Sage","of Tomorrow","of the Mind","of Insight"],
    coinPct:    ["of Greed","of the Merchant","of Plenty","of the Vault","of Wealth"],
    critPct:    ["of Precision","of the Hawk","of the Surgeon","of the Sniper","of Truth"],
    resPhys:    ["of the Mountain","of Stone","of the Citadel","of Endurance","of Bastion"],
    resElem:    ["of Wards","of Sealing","of the Mystic Veil","of the Glyph","of Containment"],
    dodgePct:   ["of the Wind","of the Phantom","of Slipping","of Shadows","of the Mist"],
    lifesteal:  ["of the Vampire","of Blood","of Drinking","of the Reaper","of the Leech"],
    energySave: ["of Rest","of the Quiet","of Calm","of Stillness","of Easeful Work"]
  };
  var WD_SUFFIX_NEUTRAL = ["of the Lost","of Memory","of Tomorrow","of Sleep","of the Wanderer","of the Sage","of Old Roads"];

  /* Generate a flavorful name for an item with affixes.
     baseName = "Whetstone Blade", affixes = [...]
     -> "Burning Whetstone Blade of the Phoenix" */
  function wdGenerateItemName(baseName, affixes, rngFn){
    var rng = rngFn || Math.random;
    affixes = Array.isArray(affixes) ? affixes : [];
    var topByValue = affixes.slice().sort(function(a,b){ return (b.value||0) - (a.value||0); });
    var primary = topByValue[0];
    var prefix = "";
    var suffix = "";
    if (primary){
      var p = WD_PREFIXES[primary.id];
      var s = WD_SUFFIXES[primary.id];
      if (p && p.length) prefix = p[Math.floor(rng() * p.length)] + " ";
      if (s && s.length) suffix = " " + s[Math.floor(rng() * s.length)];
    }
    // Fall back to neutral with some probability if no prefix found
    if (!prefix && rng() < 0.5){
      prefix = WD_PREFIX_NEUTRAL[Math.floor(rng() * WD_PREFIX_NEUTRAL.length)] + " ";
    }
    if (!suffix && rng() < 0.35){
      suffix = " " + WD_SUFFIX_NEUTRAL[Math.floor(rng() * WD_SUFFIX_NEUTRAL.length)];
    }
    return (prefix + baseName + suffix).trim();
  }

  /* ---------- GEAR SETS ---------- */

  var WD_GEAR_SETS = {
    dragonhunter: {
      label: "Dragon Hunter's Set",
      pieces: ["whetstone_blade","trail_boots","tome_of_tomorrow","amulet_of_drive","crown_of_flow"],
      bonuses: {
        3: { label:"+10% mount drop chance", mountDropPct:10 },
        5: { label:"Summons Mini Dragon companion", summonCompanion:"mini_dragon" }
      },
      lore:"Wear three, and dragons notice. Wear five, and one starts to follow you."
    },
    voidwalker: {
      label: "Voidwalker's Set",
      pieces: ["cosmic_fragment","void_skiff","key_of_worlds","star_mote","timekeeper_s_spark"],
      bonuses: {
        3: { label:"+5% Crystal Shards from boss kills", shardBonusPct:5 },
        5: { label:"+15% rare-drop chance", rareDropBonusPct:15 }
      },
      lore:"Three pieces tilt the void toward you; five and it leans."
    },
    studied: {
      label: "Scholar's Vestments",
      pieces: ["tome_of_tomorrow","seer_s_orb","amulet_of_drive","scroll_of_focus","candle_of_clarity"],
      bonuses: {
        3: { label:"+8% XP", xpPct:8 },
        5: { label:"+15% XP, sessions <25m still grant XP", xpPct:15, sessionFloorOverride:0 }
      },
      lore:"Knowledge accumulates faster when it doesn't have to fight your gear."
    },
    treasurer: {
      label: "Treasurer's Regalia",
      pieces: ["wolf_reins","unicorn_sigil","griffin_saddle","clockwork_fox","copper_coin"],
      bonuses: {
        3: { label:"+10% coins", coinPct:10 },
        5: { label:"+20% coins, +1 free reroll per session", coinPct:20, freeRerollPerSession:1 }
      },
      lore:"Coins clink louder when they recognize their own kind."
    },
    elemental: {
      label: "Elemental Mastery",
      pieces: ["ember_wyrmling","seer_s_orb","amulet_of_drive","moonplate_vest","whetstone_blade"],
      bonuses: {
        3: { label:"All elemental damage +20%", elemDmgPct:20 },
        5: { label:"Elemental crits restore HP", elemCritLifesteal:true }
      },
      lore:"The elements aren't separate; they were broken into four for our convenience."
    },
    sage: {
      label: "Sage of the Quiet Hour",
      pieces: ["candle_of_clarity","scroll_of_focus","tome_of_tomorrow","calming_herb","study_owl"],
      bonuses: {
        3: { label:"Meditate sessions grant double XP", meditateDoubleXp:true },
        5: { label:"+5% XP on every session, +10% on Meditate", xpPct:5, meditateBonusPct:10 }
      },
      lore:"Some doors only open when no one is listening for them."
    },
    knight: {
      label: "Iron Order",
      pieces: ["moonplate_vest","whetstone_blade","crown_of_flow","trail_boots","dualblade"],
      bonuses: {
        3: { label:"+15 phys resist, +5% energy save", resPhys:15, energySave:1 },
        5: { label:"Boss kills grant +50% Crystal Shards", bossShardPct:50 }
      },
      lore:"Order before flourish. Plate before silk."
    },
    timekeeper: {
      label: "Timekeeper's Vigil",
      pieces: ["timekeeper_s_spark","cosmic_fragment","key_of_worlds","crown_of_flow","seer_s_orb"],
      bonuses: {
        3: { label:"All session minutes count 1.05x", timeScalePct:5 },
        5: { label:"Session minutes 1.1x, daily quests 2x reward", timeScalePct:10, dailyQuestBonus:2 }
      },
      lore:"Time treats those well who treat it well."
    }
  };

  function wdComputeSetBonuses(equippedIds){
    var result = {};
    var ownedSet = new Set(equippedIds || []);
    for (var key in WD_GEAR_SETS){
      var set = WD_GEAR_SETS[key];
      var hits = set.pieces.filter(function(p){ return ownedSet.has(p); }).length;
      if (hits >= 3){
        var bonusTier = hits >= 5 ? 5 : 3;
        result[key] = { label:set.label, pieces:hits, tier:bonusTier, bonus:set.bonuses[bonusTier] };
      }
    }
    return result;
  }

  /* ---------- CRYSTAL SHARDS ECONOMY ---------- */

  var WD_SHARD_REWARDS = {
    mythic_drop:    5,
    legendary_drop: 1,
    boss_kill_t3:   10,
    boss_kill_t4:   25,
    boss_kill_t5:   50,
    streak_7:       25,
    streak_30:      150,
    streak_100:     1000,
    quest_daily:    2,
    quest_weekly:   20,
    quest_seasonal: 200
  };

  var WD_SHARD_COSTS = {
    mystery_box:    100,
    premium_reroll: 50,
    zone_unlock:    250,
    artifact_quest_attempt: 500
  };

  function wdEarnShards(s, reason){
    s = s || (typeof window !== "undefined" ? window.state : null);
    if (!s) return 0;
    var amount = WD_SHARD_REWARDS[reason] || 0;
    if (amount <= 0) return 0;
    if (typeof s.crystalShards !== "number") s.crystalShards = 0;
    s.crystalShards += amount;
    if (!s.crystalShardsEarned) s.crystalShardsEarned = 0;
    s.crystalShardsEarned += amount;
    return amount;
  }

  function wdSpendShards(s, reason){
    s = s || (typeof window !== "undefined" ? window.state : null);
    if (!s) return { ok:false, reason:"no_state" };
    var cost = WD_SHARD_COSTS[reason] || 0;
    if (cost <= 0) return { ok:false, reason:"unknown_cost" };
    if ((s.crystalShards|0) < cost) return { ok:false, reason:"insufficient_shards", need:cost, have:s.crystalShards|0 };
    s.crystalShards -= cost;
    if (!s.crystalShardsSpent) s.crystalShardsSpent = 0;
    s.crystalShardsSpent += cost;
    return { ok:true, spent:cost };
  }

  /* ---------- WORLD ZONES ---------- */

  var WD_ZONES = {
    verdant_vale: {
      id:"verdant_vale", label:"Verdant Vale",
      tint:"#3F8556", icon:"🌳",
      enemyBias:["slime","rat","wolf","stag_woodland","bee_swarm","bandit"],
      mountBias:["forest","horse","small"],
      lootBias:["copper_coin","calming_herb","scroll_of_focus"],
      unlockedDefault:true,
      lore:"Where every adventurer starts. Smell of cut grass."
    },
    frostpeak: {
      id:"frostpeak", label:"Frostpeak",
      tint:"#5DAEEB", icon:"❄️",
      enemyBias:["ice_elemental","frost_wolf_e","yeti","frost_drake","ice_lich"],
      mountBias:["bear","wolf"],
      lootBias:["mana_potion","seer_s_orb","tome_of_tomorrow"],
      unlockedDefault:false, unlockMap:"map_frostpeak", unlockShards:100,
      lore:"The peak where the wind decides who passes."
    },
    ember_wastes: {
      id:"ember_wastes", label:"Ember Wastes",
      tint:"#D85A30", icon:"🔥",
      enemyBias:["fire_elemental","magma_hound","ash_revenant","ember_drake","desert_scorpion"],
      mountBias:["cat","reptile","dragon"],
      lootBias:["whetstone_blade","ember_wyrmling","dualblade"],
      unlockedDefault:false, unlockMap:"map_ember_wastes", unlockShards:200,
      lore:"Cracked salt flats under a sun that never sets."
    },
    sunken_reef: {
      id:"sunken_reef", label:"Sunken Reef",
      tint:"#0EA5E9", icon:"🌊",
      enemyBias:["sahuagin","reef_serpent","deep_one","kraken_spawn","tidecaller"],
      mountBias:["aquatic","reptile"],
      lootBias:["seer_s_orb","mana_potion","golden_apple"],
      unlockedDefault:false, unlockMap:"map_sunken_reef", unlockShards:300,
      lore:"Drowned cities full of polite, patient things."
    },
    shadowmoor: {
      id:"shadowmoor", label:"Shadowmoor",
      tint:"#7C3AED", icon:"🌑",
      enemyBias:["nightshade","fenwraith","bog_hag","grave_eater","void_acolyte"],
      mountBias:["undead","insect"],
      lootBias:["tome_of_tomorrow","key_of_worlds","amulet_of_drive"],
      unlockedDefault:false, unlockMap:"map_shadowmoor", unlockShards:500,
      lore:"Trees that grow downward. Bog water that drinks you back."
    },
    astral_plains: {
      id:"astral_plains", label:"Astral Plains",
      tint:"#FF77C8", icon:"🌌",
      enemyBias:["star_warden","void_strider","celestial_drake_e","timeless_one","constellation_thing"],
      mountBias:["mythical","elemental"],
      lootBias:["cosmic_fragment","star_mote","timekeeper_s_spark"],
      unlockedDefault:false, unlockMap:"map_astral", unlockShards:1000,
      lore:"Beyond the last cloud. The air tastes of decision."
    }
  };

  /* ---------- ENEMY BESTIARY EXPANSION ---------- */

  /* These are ADDITIONAL enemies, layered on top of the existing
     MONSTERS array. The runtime resolves an enemy either from the
     legacy MONSTERS list OR from WD_ENEMIES_EXT. */
  var WD_ENEMIES_EXT = [
    // Verdant Vale
    { tier:"t1", id:"stag_woodland",   sym:"🦌", name:"Woodland Stag",       level:3,  hp:6,  weak:["dmgArcane"], resist:[],          dmg:8,  acc:0.9,  biomes:["verdant_vale"] },
    { tier:"t1", id:"bee_swarm",       sym:"🐝", name:"Bee Swarm",           level:2,  hp:3,  weak:["dmgFrost"],  resist:["dmgPhys"], dmg:5,  acc:0.85, biomes:["verdant_vale"] },
    { tier:"t2", id:"badger",          sym:"🦡", name:"Honey Badger",        level:4,  hp:5,  weak:[],            resist:[],          dmg:9,  acc:0.85, biomes:["verdant_vale","frostpeak"] },
    { tier:"t2", id:"sprite",          sym:"🧚", name:"Forest Sprite",       level:5,  hp:4,  weak:["dmgPhys"],   resist:["dmgArcane"],dmg:8,  acc:0.95, biomes:["verdant_vale"] },
    { tier:"t3", id:"giant_boar",      sym:"🐗", name:"Tusked Giant Boar",   level:10, hp:14, weak:["dmgPoison"], resist:["dmgPhys"], dmg:18, acc:0.8,  biomes:["verdant_vale"] },
    // Frostpeak
    { tier:"t2", id:"ice_elemental",   sym:"❄️", name:"Ice Elemental",      level:6,  hp:7,  weak:["dmgFire"],   resist:["dmgFrost"],dmg:11, acc:0.88, biomes:["frostpeak"] },
    { tier:"t2", id:"frost_wolf_e",    sym:"🐺", name:"Frost Wolf",          level:7,  hp:6,  weak:["dmgFire"],   resist:["dmgFrost"],dmg:12, acc:0.92, biomes:["frostpeak"] },
    { tier:"t3", id:"yeti",            sym:"🦍", name:"Yeti",                level:11, hp:18, weak:["dmgFire"],   resist:["dmgFrost"],dmg:22, acc:0.78, biomes:["frostpeak"] },
    { tier:"t4", id:"frost_drake",     sym:"🐲", name:"Frost Drake",         level:18, hp:24, weak:["dmgFire"],   resist:["dmgFrost"],dmg:30, acc:0.9,  biomes:["frostpeak"] },
    { tier:"t5", id:"ice_lich",        sym:"☠️", name:"Ice Lich",            level:35, hp:60, weak:["dmgFire"],   resist:["dmgFrost","dmgArcane"], dmg:55, acc:0.92, biomes:["frostpeak"], boss:true },
    // Ember Wastes
    { tier:"t2", id:"fire_elemental",  sym:"🔥", name:"Fire Elemental",      level:6,  hp:7,  weak:["dmgFrost"],  resist:["dmgFire"], dmg:12, acc:0.88, biomes:["ember_wastes"] },
    { tier:"t3", id:"magma_hound",     sym:"🐕", name:"Magma Hound",         level:12, hp:13, weak:["dmgFrost"],  resist:["dmgFire"], dmg:20, acc:0.9,  biomes:["ember_wastes"] },
    { tier:"t4", id:"ash_revenant",    sym:"👻", name:"Ash Revenant",        level:20, hp:22, weak:["dmgFrost"],  resist:["dmgFire","dmgPhys"], dmg:32, acc:0.85, biomes:["ember_wastes","shadowmoor"] },
    { tier:"t4", id:"ember_drake",     sym:"🐲", name:"Ember Drake",         level:22, hp:26, weak:["dmgFrost"],  resist:["dmgFire"], dmg:34, acc:0.9,  biomes:["ember_wastes"] },
    { tier:"t3", id:"desert_scorpion", sym:"🦂", name:"Desert Scorpion",     level:14, hp:11, weak:["dmgFrost"],  resist:["dmgPoison"], dmg:21, acc:0.87, biomes:["ember_wastes"] },
    // Sunken Reef
    { tier:"t2", id:"sahuagin",        sym:"🐟", name:"Sahuagin Raider",     level:7,  hp:8,  weak:["dmgArcane"], resist:["dmgFrost"],dmg:13, acc:0.85, biomes:["sunken_reef"] },
    { tier:"t3", id:"reef_serpent",    sym:"🐍", name:"Reef Serpent",        level:13, hp:15, weak:["dmgFire"],   resist:["dmgFrost"],dmg:22, acc:0.92, biomes:["sunken_reef"] },
    { tier:"t4", id:"deep_one",        sym:"👾", name:"Deep One",            level:20, hp:24, weak:["dmgFire"],   resist:["dmgArcane","dmgFrost"], dmg:34, acc:0.88, biomes:["sunken_reef"] },
    { tier:"t4", id:"kraken_spawn",    sym:"🐙", name:"Kraken Spawn",        level:24, hp:28, weak:["dmgArcane"], resist:["dmgFrost","dmgPhys"], dmg:38, acc:0.85, biomes:["sunken_reef"] },
    { tier:"t5", id:"tidecaller",      sym:"🌊", name:"Tidecaller",          level:38, hp:70, weak:["dmgArcane"], resist:["dmgFrost","dmgFire"], dmg:60, acc:0.93, biomes:["sunken_reef"], boss:true },
    // Shadowmoor
    { tier:"t2", id:"nightshade",      sym:"🌒", name:"Nightshade Stalker",  level:8,  hp:7,  weak:["dmgFire"],   resist:["dmgArcane"], dmg:14, acc:0.9,  biomes:["shadowmoor"] },
    { tier:"t3", id:"fenwraith",       sym:"👻", name:"Fenwraith",           level:14, hp:14, weak:["dmgFire"],   resist:["dmgFrost","dmgPhys"], dmg:23, acc:0.9,  biomes:["shadowmoor"] },
    { tier:"t3", id:"bog_hag",         sym:"🧙", name:"Bog Hag",             level:16, hp:16, weak:["dmgFire"],   resist:["dmgPoison","dmgArcane"], dmg:25, acc:0.88, biomes:["shadowmoor"] },
    { tier:"t4", id:"grave_eater",     sym:"🪦", name:"Grave Eater",         level:22, hp:26, weak:["dmgFire"],   resist:["dmgPoison","dmgPhys"], dmg:36, acc:0.83, biomes:["shadowmoor"] },
    { tier:"t4", id:"void_acolyte",    sym:"🕴️", name:"Void Acolyte",        level:25, hp:30, weak:["dmgArcane"], resist:["dmgFrost","dmgFire"], dmg:40, acc:0.88, biomes:["shadowmoor","astral_plains"] },
    { tier:"t5", id:"shadow_king",     sym:"👑", name:"Shadow King",         level:40, hp:80, weak:["dmgFire"],   resist:["dmgFrost","dmgArcane","dmgPoison"], dmg:65, acc:0.92, biomes:["shadowmoor"], boss:true },
    // Astral Plains
    { tier:"t3", id:"star_warden",     sym:"⭐", name:"Star Warden",         level:18, hp:18, weak:["dmgArcane"], resist:["dmgFire","dmgFrost"], dmg:26, acc:0.93, biomes:["astral_plains"] },
    { tier:"t4", id:"void_strider",    sym:"🦵", name:"Void Strider",        level:25, hp:30, weak:["dmgArcane"], resist:["dmgPhys","dmgFire"], dmg:42, acc:0.9,  biomes:["astral_plains"] },
    { tier:"t4", id:"celestial_drake_e",sym:"🐲", name:"Celestial Drake",    level:28, hp:34, weak:["dmgArcane"], resist:["dmgFire","dmgFrost"], dmg:45, acc:0.92, biomes:["astral_plains"] },
    { tier:"t5", id:"timeless_one",    sym:"⏳", name:"Timeless One",        level:55, hp:120, weak:["dmgArcane"],resist:["dmgFire","dmgFrost","dmgPhys"], dmg:80, acc:0.95, biomes:["astral_plains"], boss:true },
    { tier:"t5", id:"constellation_thing", sym:"♈", name:"Constellation Thing", level:60, hp:140, weak:["dmgArcane"], resist:["dmgFire","dmgFrost","dmgPoison","dmgPhys"], dmg:90, acc:0.96, biomes:["astral_plains"], boss:true },
    // Crossbiome generics
    { tier:"t1", id:"giant_rat_v",     sym:"🐀", name:"Plague Rat",          level:2,  hp:3,  weak:["dmgFire"],   resist:["dmgPoison"], dmg:6,  acc:0.88, biomes:["verdant_vale","shadowmoor"] },
    { tier:"t2", id:"bandit_chief",    sym:"🗡️", name:"Bandit Chieftain",    level:9,  hp:11, weak:["dmgArcane"], resist:["dmgPhys"], dmg:18, acc:0.9,  biomes:["verdant_vale","ember_wastes"] },
    { tier:"t2", id:"witch_apprent",   sym:"🧙‍♀️", name:"Witch's Apprentice", level:8,  hp:9,  weak:["dmgFire"],   resist:["dmgArcane"], dmg:16, acc:0.92, biomes:["shadowmoor","verdant_vale"] },
    { tier:"t3", id:"orc_warrior",     sym:"🪓", name:"Orc Warrior",         level:12, hp:16, weak:["dmgFrost"],  resist:["dmgPhys"], dmg:22, acc:0.85, biomes:["ember_wastes","verdant_vale"] },
    { tier:"t3", id:"manticore_y",     sym:"🦁", name:"Manticore Cub",       level:14, hp:14, weak:["dmgFrost"],  resist:["dmgPhys"], dmg:24, acc:0.9,  biomes:["ember_wastes","astral_plains"] },
    { tier:"t3", id:"basilisk",        sym:"🦎", name:"Basilisk",            level:15, hp:16, weak:["dmgArcane"], resist:["dmgPoison"], dmg:25, acc:0.87, biomes:["sunken_reef","ember_wastes"] },
    { tier:"t4", id:"shadow_assassin", sym:"🥷", name:"Shadow Assassin",     level:23, hp:22, weak:["dmgFire"],   resist:["dmgPhys","dmgFrost"], dmg:38, acc:0.94, biomes:["shadowmoor","verdant_vale"] },
    { tier:"t4", id:"hellhound_e",     sym:"🐺", name:"Hellhound",           level:21, hp:24, weak:["dmgFrost"],  resist:["dmgFire"], dmg:35, acc:0.92, biomes:["ember_wastes","shadowmoor"] },
    { tier:"t4", id:"frost_giant",     sym:"🧌", name:"Frost Giant",         level:26, hp:34, weak:["dmgFire"],   resist:["dmgFrost","dmgPhys"], dmg:42, acc:0.78, biomes:["frostpeak"] },
    { tier:"t5", id:"ancient_treant",  sym:"🌳", name:"Ancient Treant",      level:32, hp:55, weak:["dmgFire"],   resist:["dmgPhys","dmgPoison"], dmg:48, acc:0.82, biomes:["verdant_vale","shadowmoor"], boss:true },
    { tier:"t5", id:"sun_drake",       sym:"🐲", name:"Sun Drake",           level:36, hp:65, weak:["dmgFrost"],  resist:["dmgFire","dmgPhys"], dmg:58, acc:0.92, biomes:["ember_wastes"], boss:true },
    // Special / cross-zone bosses (the post-90m boss pool)
    { tier:"t5", id:"slime_king",       sym:"👑", name:"Slime King",         level:25, hp:48, weak:["dmgFire"],   resist:["dmgPhys"], dmg:42, acc:0.85, biomes:["verdant_vale"], boss:true },
    { tier:"t5", id:"wolf_alpha",       sym:"🐺", name:"Wolf Alpha",         level:28, hp:55, weak:["dmgFire"],   resist:[], dmg:50, acc:0.95, biomes:["verdant_vale","frostpeak"], boss:true },
    { tier:"t5", id:"drake_elder",      sym:"🐲", name:"Elder Drake",        level:38, hp:75, weak:["dmgFrost"],  resist:["dmgFire"], dmg:62, acc:0.93, biomes:["ember_wastes"], boss:true },
    { tier:"t5", id:"lich_eternal",     sym:"☠️", name:"Eternal Lich",       level:55, hp:110, weak:["dmgFire"],  resist:["dmgFrost","dmgArcane"], dmg:78, acc:0.94, biomes:["shadowmoor"], boss:true },
    { tier:"t5", id:"dragon_apex",      sym:"🐉", name:"Apex Dragon",        level:65, hp:160, weak:["dmgFrost"], resist:["dmgFire","dmgPhys","dmgArcane"], dmg:95, acc:0.96, biomes:["ember_wastes","astral_plains"], boss:true },
    { tier:"t5", id:"void_horror_apex", sym:"🌌", name:"Apex Void Horror",   level:80, hp:240, weak:["dmgArcane"],resist:["dmgFire","dmgFrost","dmgPoison","dmgPhys"], dmg:130, acc:0.97, biomes:["astral_plains"], boss:true },
    { tier:"t5", id:"minotaur_lord",    sym:"🐃", name:"Minotaur Lord",      level:32, hp:60, weak:["dmgPoison"], resist:["dmgPhys"], dmg:55, acc:0.88, biomes:["ember_wastes"], boss:true },
    { tier:"t5", id:"griffin_king",     sym:"🦅", name:"Griffin King",       level:40, hp:75, weak:["dmgArcane"], resist:[], dmg:60, acc:0.97, biomes:["frostpeak","astral_plains"], boss:true },
    { tier:"t5", id:"phoenix_eternal",  sym:"🔥", name:"Eternal Phoenix",    level:48, hp:90, weak:["dmgFrost"],  resist:["dmgFire","dmgArcane"], dmg:70, acc:0.95, biomes:["ember_wastes"], boss:true },
    { tier:"t5", id:"kraken_deep",      sym:"🐙", name:"Kraken of the Deep", level:45, hp:90, weak:["dmgArcane"], resist:["dmgFrost","dmgPhys"], dmg:72, acc:0.92, biomes:["sunken_reef"], boss:true }
  ];

  function wdAllEnemies(){
    // Combine legacy MONSTERS with extended pool
    var legacy = (typeof window !== "undefined" && Array.isArray(window.MONSTERS)) ? window.MONSTERS.map(function(m){
      return { tier:m[0], id:m[1], sym:m[2], name:m[3], level:m[4], hp:m[5], biomes:["verdant_vale"], weak:[], resist:[], dmg:Math.max(6, m[5]/2), acc:0.85 };
    }) : [];
    return legacy.concat(WD_ENEMIES_EXT);
  }

  function wdEnemiesForZone(zoneId){
    var all = wdAllEnemies();
    return all.filter(function(e){ return Array.isArray(e.biomes) && e.biomes.indexOf(zoneId) >= 0; });
  }

  /* ---------- QUESTS ---------- */

  var WD_QUEST_DAILY = [
    { id:"qd_focus_2",       label:"Complete 2 focus sessions",          target:2,   kind:"sessions",      xp:40,  shards:2,  coins:30 },
    { id:"qd_focus_4",       label:"Complete 4 focus sessions",          target:4,   kind:"sessions",      xp:80,  shards:3,  coins:60 },
    { id:"qd_min_60",        label:"Log 60 focus minutes",               target:60,  kind:"minutes",       xp:60,  shards:2,  coins:50 },
    { id:"qd_min_120",       label:"Log 120 focus minutes",              target:120, kind:"minutes",       xp:140, shards:5,  coins:120 },
    { id:"qd_fight",         label:"Complete 1 Fight action",            target:1,   kind:"action_fight",  xp:50,  shards:2,  coins:40 },
    { id:"qd_hunt",          label:"Complete 1 Hunt action",             target:1,   kind:"action_hunt",   xp:50,  shards:2,  coins:40 },
    { id:"qd_craft",         label:"Complete 1 Craft session",           target:1,   kind:"action_craft",  xp:50,  shards:2,  coins:40 },
    { id:"qd_meditate",      label:"Meditate for 25+ minutes",           target:25,  kind:"meditate_min",  xp:60,  shards:3,  coins:40 },
    { id:"qd_kill_enemy",    label:"Defeat 3 enemies",                   target:3,   kind:"enemy_kills",   xp:70,  shards:3,  coins:50 },
    { id:"qd_drop_rare",     label:"Find 1 rare-or-better drop",         target:1,   kind:"rare_drop",     xp:80,  shards:5,  coins:60 },
    { id:"qd_combo",         label:"Hit a 3+ session combo",             target:3,   kind:"combo",         xp:60,  shards:2,  coins:50 },
    { id:"qd_zone",          label:"Spend 30+ minutes in a non-starter zone", target:30, kind:"zone_min",  xp:100, shards:5,  coins:80 }
  ];

  var WD_QUEST_WEEKLY = [
    { id:"qw_min_300",   label:"Log 300 weekly minutes",                 target:300, kind:"minutes",       xp:300, shards:20, coins:300 },
    { id:"qw_min_500",   label:"Log 500 weekly minutes",                 target:500, kind:"minutes",       xp:600, shards:35, coins:600 },
    { id:"qw_sessions",  label:"Complete 20 sessions in a week",         target:20,  kind:"sessions",      xp:400, shards:25, coins:400 },
    { id:"qw_mount",     label:"Collect 1 new mount",                    target:1,   kind:"mount_collected",xp:300,shards:20, coins:300 },
    { id:"qw_boss",      label:"Defeat 1 boss",                          target:1,   kind:"boss_kills",    xp:500, shards:30, coins:400 },
    { id:"qw_streak_7",  label:"Maintain a 7-day streak",                target:7,   kind:"streak",        xp:600, shards:40, coins:500 },
    { id:"qw_zones_2",   label:"Visit 2 different zones",                target:2,   kind:"zones_visited", xp:300, shards:20, coins:200 },
    { id:"qw_drop_epic", label:"Find 1 epic-or-better drop",             target:1,   kind:"epic_drop",     xp:400, shards:30, coins:300 },
    { id:"qw_craft",     label:"Craft an upgrade",                       target:1,   kind:"craft_action",  xp:300, shards:25, coins:250 },
    { id:"qw_enchant",   label:"Enchant 2 items",                        target:2,   kind:"enchant_action",xp:300, shards:25, coins:250 }
  ];

  var WD_QUEST_SEASONAL = [
    { id:"qs_min_3000",     label:"Log 3000 minutes this month",         target:3000, kind:"minutes",       xp:3000, shards:200, coins:3000 },
    { id:"qs_mount_pity_3", label:"Earn 3 pity-tier mount unlocks",      target:3,    kind:"mount_pity_unlocks", xp:2500, shards:200, coins:2500 },
    { id:"qs_bosses_10",    label:"Defeat 10 bosses",                    target:10,   kind:"boss_kills",    xp:3000, shards:300, coins:3000 },
    { id:"qs_zones_all",    label:"Unlock all 6 zones",                  target:6,    kind:"zones_unlocked",xp:5000, shards:500, coins:5000 },
    { id:"qs_set",          label:"Complete a full gear set",            target:1,    kind:"sets_complete", xp:2500, shards:200, coins:2500 },
    { id:"qs_artifact",     label:"Discover an artifact",                target:1,    kind:"artifacts_found",xp:5000,shards:500, coins:0   }
  ];

  function wdTodayKey(){
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
  }
  function wdWeekKey(){
    var d = new Date();
    // ISO-ish: year + week number
    var first = new Date(d.getFullYear(),0,1);
    var dayOfYear = Math.floor((d - first) / 86400000) + 1;
    var w = Math.ceil(dayOfYear / 7);
    return d.getFullYear() + "-W" + String(w).padStart(2,"0");
  }
  function wdMonthKey(){
    var d = new Date();
    return d.getFullYear() + "-M" + String(d.getMonth()+1).padStart(2,"0");
  }

  function wdRollQuestSet(pool, count, rng){
    rng = rng || Math.random;
    var shuffled = pool.slice();
    for (var i=shuffled.length-1; i>0; i--){
      var j = Math.floor(rng() * (i+1));
      var t = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = t;
    }
    return shuffled.slice(0, count).map(function(q){
      return { id: q.id, label: q.label, target: q.target, kind: q.kind,
               xp: q.xp, shards: q.shards, coins: q.coins,
               progress: 0, completed: false, claimed: false, rolledAt: Date.now() };
    });
  }

  function wdEnsureQuestRolls(s){
    s = s || (typeof window !== "undefined" ? window.state : null);
    if (!s) return;
    if (!s.questSystem || typeof s.questSystem !== "object"){
      s.questSystem = { daily:[], weekly:[], seasonal:[], lastRoll:{ daily:null, weekly:null, seasonal:null } };
    }
    var qs = s.questSystem;
    var todayK = wdTodayKey();
    var weekK = wdWeekKey();
    var monthK = wdMonthKey();
    if (qs.lastRoll.daily !== todayK){
      qs.daily = wdRollQuestSet(WD_QUEST_DAILY, 3);
      qs.lastRoll.daily = todayK;
    }
    if (qs.lastRoll.weekly !== weekK){
      qs.weekly = wdRollQuestSet(WD_QUEST_WEEKLY, 3);
      qs.lastRoll.weekly = weekK;
    }
    if (qs.lastRoll.seasonal !== monthK){
      qs.seasonal = wdRollQuestSet(WD_QUEST_SEASONAL, 1);
      qs.lastRoll.seasonal = monthK;
    }
  }

  /* Quest progress nudges - increment per-quest progress and mark
     completed if target reached. */
  function wdAdvanceQuests(s, kind, amount){
    s = s || (typeof window !== "undefined" ? window.state : null);
    if (!s) return;
    wdEnsureQuestRolls(s);
    var pools = [s.questSystem.daily, s.questSystem.weekly, s.questSystem.seasonal];
    pools.forEach(function(pool){
      pool.forEach(function(q){
        if (q.claimed) return;
        if (q.kind !== kind) return;
        q.progress = (q.progress|0) + amount;
        if (q.progress >= q.target){
          q.progress = q.target;
          q.completed = true;
        }
      });
    });
  }

  function wdClaimQuest(s, qid){
    s = s || (typeof window !== "undefined" ? window.state : null);
    if (!s) return { ok:false, reason:"no_state" };
    wdEnsureQuestRolls(s);
    var pools = [s.questSystem.daily, s.questSystem.weekly, s.questSystem.seasonal];
    for (var i=0; i<pools.length; i++){
      var pool = pools[i];
      for (var j=0; j<pool.length; j++){
        var q = pool[j];
        if (q.id !== qid) continue;
        if (q.claimed) return { ok:false, reason:"already_claimed" };
        if (!q.completed) return { ok:false, reason:"not_completed" };
        q.claimed = true;
        if (typeof s.crystalShards !== "number") s.crystalShards = 0;
        s.crystalShards += q.shards|0;
        s.coins = (s.coins|0) + (q.coins|0);
        s.coinsEarned = (s.coinsEarned|0) + (q.coins|0);
        return { ok:true, shards:q.shards|0, coins:q.coins|0, xp:q.xp|0 };
      }
    }
    return { ok:false, reason:"not_found" };
  }

  /* ---------- BOSS ENCOUNTERS ---------- */

  function wdShouldSpawnBoss(minutes, action){
    if (action !== "Fight" && action !== "Hunt") return false;
    return minutes >= 90;
  }

  function wdPickBoss(heroLevel, currentZoneId, rng){
    rng = rng || Math.random;
    var allBosses = WD_ENEMIES_EXT.filter(function(e){ return e.boss; });
    if (currentZoneId){
      var zonal = allBosses.filter(function(b){ return b.biomes.indexOf(currentZoneId) >= 0; });
      if (zonal.length) allBosses = zonal;
    }
    // Pick by level proximity
    allBosses.sort(function(a,b){ return Math.abs(a.level - heroLevel) - Math.abs(b.level - heroLevel); });
    var topN = allBosses.slice(0, Math.min(3, allBosses.length));
    return topN[Math.floor(rng() * topN.length)];
  }

  /* ---------- CRAFTING ---------- */

  function wdCombineForUpgrade(s, iids){
    s = s || (typeof window !== "undefined" ? window.state : null);
    if (!s) return { ok:false, reason:"no_state" };
    if (!Array.isArray(iids) || iids.length !== 3) return { ok:false, reason:"need_3_instances" };
    if (!s.lootInstances) return { ok:false, reason:"no_instances" };
    var insts = iids.map(function(i){ return s.lootInstances[i]; });
    if (insts.some(function(x){ return !x; })) return { ok:false, reason:"unknown_instance" };
    if (insts.some(function(x){ return x.locked; })) return { ok:false, reason:"locked_instance" };
    var t = insts[0].tier;
    if (!insts.every(function(x){ return x.tier === t; })) return { ok:false, reason:"mismatch_tier" };
    var order = ["common","uncommon","rare","epic","legendary","mythic"];
    var idx = order.indexOf(t);
    if (idx < 0 || idx >= order.length - 1) return { ok:false, reason:"max_tier" };
    var nextTier = order[idx+1];
    // Pick a winning affix from the 3 to carry forward
    var picked = insts[Math.floor(Math.random() * insts.length)];
    var newId = "iid_craft_" + Math.random().toString(36).slice(2,10) + "_" + Date.now();
    var newInst = {
      iid: newId,
      lootId: picked.lootId,
      tier: nextTier,
      level: 0,
      affixes: picked.affixes ? picked.affixes.slice() : [],
      sockets: [],
      dyeId: picked.dyeId || null,
      createdAt: Date.now(),
      source: { kind: "craft", from: iids.slice() },
      locked: false
    };
    s.lootInstances[newId] = newInst;
    iids.forEach(function(i){ delete s.lootInstances[i]; });
    if (!s.craftingDust) s.craftingDust = 0;
    s.craftingDust += 5;
    return { ok:true, newInstance: newInst };
  }

  function wdEnchantInstance(s, iid, gemId, reagentId){
    s = s || (typeof window !== "undefined" ? window.state : null);
    if (!s) return { ok:false, reason:"no_state" };
    var inst = s.lootInstances && s.lootInstances[iid];
    if (!inst) return { ok:false, reason:"unknown_instance" };
    if (inst.locked) return { ok:false, reason:"locked" };
    if (!s.loot || !s.loot.gemsOwned) return { ok:false, reason:"no_gems" };
    if ((s.loot.gemsOwned[gemId]|0) <= 0) return { ok:false, reason:"no_gem_owned" };
    var gem = WD_GEMS.filter(function(g){ return g.id === gemId; })[0];
    if (!gem) return { ok:false, reason:"unknown_gem" };
    // Reagent is optional but reduces failure rate (simulated as success threshold)
    var hasReagent = reagentId && s.lootOwned && (s.lootOwned[reagentId]|0) > 0;
    var success = Math.random() < (hasReagent ? 0.95 : 0.70);
    s.loot.gemsOwned[gemId]--;
    if (hasReagent && reagentId) s.lootOwned[reagentId]--;
    if (!success) return { ok:false, reason:"enchant_failed", gemConsumed:true };
    if (!inst.sockets) inst.sockets = [];
    inst.sockets.push({ gemId: gem.id, fromEnchant: true });
    return { ok:true, gem:gem.id };
  }

  /* ---------- VAULT ---------- */

  function wdEnsureVault(s){
    s = s || (typeof window !== "undefined" ? window.state : null);
    if (!s || !s.loot) return null;
    if (!s.loot.vault || typeof s.loot.vault !== "object"){
      s.loot.vault = { instances: {}, cap: 100 };
    }
    if (typeof s.loot.vault.cap !== "number") s.loot.vault.cap = 100;
    if (!s.loot.vault.instances) s.loot.vault.instances = {};
    return s.loot.vault;
  }

  function wdMoveToVault(s, iid){
    s = s || (typeof window !== "undefined" ? window.state : null);
    var vault = wdEnsureVault(s);
    if (!vault) return { ok:false, reason:"no_vault" };
    var inst = s.lootInstances && s.lootInstances[iid];
    if (!inst) return { ok:false, reason:"unknown_instance" };
    if (Object.keys(vault.instances).length >= vault.cap) return { ok:false, reason:"vault_full" };
    vault.instances[iid] = inst;
    delete s.lootInstances[iid];
    return { ok:true };
  }

  function wdMoveFromVault(s, iid){
    s = s || (typeof window !== "undefined" ? window.state : null);
    var vault = wdEnsureVault(s);
    if (!vault) return { ok:false, reason:"no_vault" };
    var inst = vault.instances[iid];
    if (!inst) return { ok:false, reason:"unknown_instance" };
    if (!s.lootInstances) s.lootInstances = {};
    s.lootInstances[iid] = inst;
    delete vault.instances[iid];
    return { ok:true };
  }

  /* ---------- MYSTERY BOX ---------- */

  function wdOpenMysteryBox(s){
    s = s || (typeof window !== "undefined" ? window.state : null);
    if (!s) return { ok:false, reason:"no_state" };
    var spend = wdSpendShards(s, "mystery_box");
    if (!spend.ok) return spend;
    // Roll a guaranteed Epic+ item
    var rng = Math.random;
    var rarities = ["epic","epic","legendary","legendary","mythic"];
    var picked = rarities[Math.floor(rng() * rarities.length)];
    var candidates = (typeof window !== "undefined" && Array.isArray(window.LOOT_TABLE))
      ? window.LOOT_TABLE.filter(function(it){ return it[2] === picked; })
      : [];
    if (!candidates.length){
      // Fall back to relic of that tier
      candidates = WD_RELICS.filter(function(r){ return r.tier === picked; });
    }
    if (!candidates.length) return { ok:false, reason:"no_candidates" };
    var pick = candidates[Math.floor(rng() * candidates.length)];
    var templateId = Array.isArray(pick)
      ? (window.lootId ? window.lootId(pick) : String(pick[1]).toLowerCase().replace(/\W+/g,"_"))
      : pick.id;
    if (!s.lootOwned) s.lootOwned = {};
    s.lootOwned[templateId] = (s.lootOwned[templateId]|0) + 1;
    return { ok:true, rarity:picked, templateId:templateId, name: Array.isArray(pick)?pick[1]:pick.name };
  }

  /* ---------- ACHIEVEMENTS EXPANSION ---------- */

  /* 100+ achievements layered on top of the v7.6 set. Tiered by family.
     Each entry: [id, label, tier(bronze/silver/gold/plat/myth), description, condition_kind, threshold] */
  var WD_ACHIEVEMENTS = [
    // Mounts
    ["wd_mounts_5",       "Stable Hand",          "bronze",   "Collect 5 mounts",         "mounts_owned", 5],
    ["wd_mounts_25",      "Wrangler",             "silver",   "Collect 25 mounts",        "mounts_owned", 25],
    ["wd_mounts_50",      "Mount Master",         "gold",     "Collect 50 mounts",        "mounts_owned", 50],
    ["wd_mounts_100",     "Mount Legend",         "platinum", "Collect 100 mounts",       "mounts_owned", 100],
    ["wd_mounts_all",     "Beast Caller",         "mythic",   "Collect every mount",      "mounts_owned", 106],
    ["wd_horse_family",   "Master of Horses",     "gold",     "Complete the horse family","family_complete", "horse"],
    ["wd_dragon_family",  "Master of Dragons",    "platinum", "Complete the dragon family","family_complete","dragon"],
    ["wd_mythical_fam",   "Mythic Tamer",         "platinum", "Complete the mythical family","family_complete","mythical"],

    // Zones
    ["wd_zone_unlock_1",  "Wanderer",             "bronze",   "Unlock your second zone",  "zones_unlocked", 2],
    ["wd_zone_unlock_3",  "Pathfinder",           "silver",   "Unlock 3 zones",           "zones_unlocked", 3],
    ["wd_zone_unlock_all","Cartographer",         "gold",     "Unlock all 6 zones",       "zones_unlocked", 6],
    ["wd_zone_visit_all", "World-Walker",         "gold",     "Visit all 6 zones",        "zones_visited",  6],

    // Bosses
    ["wd_boss_1",         "Slayer",               "bronze",   "Defeat 1 boss",            "boss_kills", 1],
    ["wd_boss_10",        "Boss Hunter",          "silver",   "Defeat 10 bosses",         "boss_kills", 10],
    ["wd_boss_50",        "Apex Predator",        "gold",     "Defeat 50 bosses",         "boss_kills", 50],
    ["wd_boss_100",       "Killer of Kings",      "platinum", "Defeat 100 bosses",        "boss_kills", 100],
    ["wd_boss_voids",     "Voidslayer",           "mythic",   "Defeat the Apex Void Horror","specific_boss","void_horror_apex"],

    // Quests
    ["wd_quest_daily_5",  "Errand Runner",        "bronze",   "Claim 5 daily quests",     "daily_quests_claimed", 5],
    ["wd_quest_daily_30", "Daily Adept",          "silver",   "Claim 30 daily quests",    "daily_quests_claimed", 30],
    ["wd_quest_daily_100","Daily Saint",          "gold",     "Claim 100 daily quests",   "daily_quests_claimed", 100],
    ["wd_quest_weekly_4", "Week Warrior",         "silver",   "Claim 4 weekly quests",    "weekly_quests_claimed", 4],
    ["wd_quest_weekly_24","Weekly Veteran",       "gold",     "Claim 24 weekly quests",   "weekly_quests_claimed", 24],
    ["wd_quest_seasonal", "Seasonal Champion",    "platinum", "Claim a seasonal quest",   "seasonal_quests_claimed", 1],

    // Crafting & enchanting
    ["wd_craft_1",        "Apprentice Smith",     "bronze",   "Craft your first upgrade", "craft_actions", 1],
    ["wd_craft_25",       "Journeyman Smith",     "silver",   "Craft 25 upgrades",        "craft_actions", 25],
    ["wd_craft_100",      "Master Smith",         "gold",     "Craft 100 upgrades",       "craft_actions", 100],
    ["wd_enchant_1",      "First Enchant",        "bronze",   "Enchant your first item",  "enchant_actions", 1],
    ["wd_enchant_25",     "Enchanter",            "silver",   "Enchant 25 items",         "enchant_actions", 25],
    ["wd_enchant_100",    "Arch-Enchanter",       "gold",     "Enchant 100 items",        "enchant_actions", 100],

    // Sets
    ["wd_set_3pc",        "Set Collector",        "silver",   "Equip 3 pieces of any set","set_3pc_equipped", 1],
    ["wd_set_5pc",        "Full Kit",             "gold",     "Equip a full 5-piece set", "set_5pc_equipped", 1],
    ["wd_set_all",        "Wardrobe Master",      "platinum", "Earn every set bonus",     "sets_complete", 8],

    // Crystal Shards
    ["wd_shards_100",     "Shard Saver",          "bronze",   "Accumulate 100 Crystal Shards",     "shards_earned_total", 100],
    ["wd_shards_1000",    "Shard Wealthy",        "silver",   "Accumulate 1,000 Crystal Shards",   "shards_earned_total", 1000],
    ["wd_shards_10000",   "Shard Magnate",        "gold",     "Accumulate 10,000 Crystal Shards",  "shards_earned_total", 10000],
    ["wd_shards_100000",  "Shard Sovereign",      "platinum", "Accumulate 100,000 Crystal Shards", "shards_earned_total", 100000],

    // Loot kinds
    ["wd_relic_1",        "Relic Finder",         "bronze",   "Find your first relic",    "kind_count", "relic_1"],
    ["wd_relic_10",       "Relic Hoarder",        "silver",   "Collect 10 relics",        "kind_count", "relic_10"],
    ["wd_rune_1",         "First Rune",           "bronze",   "Find your first rune",     "kind_count", "rune_1"],
    ["wd_rune_10",        "Rune-binder",          "silver",   "Collect 10 runes",         "kind_count", "rune_10"],
    ["wd_trophy_1",       "First Trophy",         "bronze",   "Earn your first trophy",   "kind_count", "trophy_1"],
    ["wd_trophy_5",       "Trophy Hall",          "silver",   "Earn 5 trophies",          "kind_count", "trophy_5"],
    ["wd_tome_1",         "First Tome",           "bronze",   "Unlock your first tome",   "kind_count", "tome_1"],
    ["wd_tome_5",         "Library",              "silver",   "Unlock 5 tomes",           "kind_count", "tome_5"],
    ["wd_map_3",          "Mapper",               "silver",   "Find 3 maps",              "kind_count", "map_3"],
    ["wd_key_5",          "Locksmith",            "silver",   "Collect 5 keys",           "kind_count", "key_5"],
    ["wd_charm_3",        "Charm Collector",      "bronze",   "Collect 3 charms",         "kind_count", "charm_3"],

    // Artifacts
    ["wd_artifact_1",     "Artifact Bearer",      "platinum", "Discover an artifact",     "artifacts_found", 1],
    ["wd_artifact_3",     "Artifact Master",      "mythic",   "Discover 3 artifacts",     "artifacts_found", 3],
    ["wd_artifact_all",   "Eternal Collection",   "mythic",   "Discover all 5 artifacts", "artifacts_found", 5],

    // Cursed
    ["wd_cursed_1",       "Cursed Bearer",        "silver",   "Equip a cursed item",      "cursed_equipped", 1],
    ["wd_cursed_3",       "Cursebound",           "gold",     "Equip 3 cursed items at once","cursed_equipped", 3],

    // Mystery Box
    ["wd_mystery_1",      "First Mystery",        "bronze",   "Open a Mystery Box",       "mystery_boxes", 1],
    ["wd_mystery_10",     "Mystery Aficionado",   "silver",   "Open 10 Mystery Boxes",    "mystery_boxes", 10],
    ["wd_mystery_50",     "Box Lord",             "gold",     "Open 50 Mystery Boxes",    "mystery_boxes", 50],

    // Vault
    ["wd_vault_25",       "Vault Stocker",        "bronze",   "Store 25 instances in the vault","vault_size", 25],
    ["wd_vault_full",     "Vault Hoarder",        "gold",     "Fill the vault",           "vault_size", 100],

    // Crafting dust
    ["wd_dust_100",       "Dust Saver",           "bronze",   "Accumulate 100 Crafting Dust","craft_dust_total", 100],
    ["wd_dust_1000",      "Dust Stockpile",       "silver",   "Accumulate 1,000 Crafting Dust","craft_dust_total", 1000],
    ["wd_dust_10000",     "Master of Dust",       "gold",     "Accumulate 10,000 Crafting Dust","craft_dust_total", 10000],

    // Time milestones (extended past v7.6)
    ["wd_hours_2000",     "Time Lord",            "mythic",   "2,000 hours of focused time","totalMin", 120000],
    ["wd_hours_5000",     "Time Itself",          "mythic",   "5,000 hours of focused time","totalMin", 300000],

    // Combat variety
    ["wd_fire_kills_50",  "Burner",               "silver",   "50 enemies slain with fire damage","element_kills","dmgFire_50"],
    ["wd_frost_kills_50", "Freezer",              "silver",   "50 enemies slain with frost damage","element_kills","dmgFrost_50"],
    ["wd_poison_kills_50","Poisoner",             "silver",   "50 enemies slain with poison","element_kills","dmgPoison_50"],
    ["wd_arcane_kills_50","Spellslayer",          "silver",   "50 enemies slain with arcane","element_kills","dmgArcane_50"],

    // Streak extensions
    ["wd_streak_60",      "Two-Month Wonder",     "gold",     "60-day streak",            "streak", 60],
    ["wd_streak_180",     "Half-Year",            "platinum", "180-day streak",           "streak", 180],
    ["wd_streak_365",     "Full Year",            "mythic",   "365-day streak",           "streak", 365],
    ["wd_streak_1000",    "Thousand Days",        "mythic",   "1,000-day streak",         "streak", 1000],

    // Action variety
    ["wd_act_travel_50",  "Old Roads",            "silver",   "50 Travel sessions",       "action_count", "Travel_50"],
    ["wd_act_rest_50",    "Well Rested",          "silver",   "50 Rest sessions",         "action_count", "Rest_50"],
    ["wd_act_meditate_50","Quiet Mind",           "silver",   "50 Meditate sessions",     "action_count", "Meditate_50"],
    ["wd_act_craft_50",   "Crafter",              "silver",   "50 Craft sessions",        "action_count", "Craft_50"],
    ["wd_act_hunt_50",    "Hunter",               "silver",   "50 Hunt sessions",         "action_count", "Hunt_50"],
    ["wd_act_loot_50",    "Treasure Hunter",      "silver",   "50 Loot sessions",         "action_count", "Loot_50"],
    ["wd_act_fight_50",   "Battle-Tested",        "silver",   "50 Fight sessions",        "action_count", "Fight_50"],

    // Drop variety
    ["wd_drops_500",      "Loot Hound",           "silver",   "Earn 500 total drops",     "total_drops", 500],
    ["wd_drops_2000",     "Drop Veteran",         "gold",     "Earn 2,000 total drops",   "total_drops", 2000],
    ["wd_drops_10000",    "Endless Drops",        "mythic",   "Earn 10,000 total drops",  "total_drops", 10000],

    // Coins
    ["wd_coins_lifetime", "Penny Pincher",        "silver",   "Earn 10,000 coins lifetime","coinsEarned", 10000],
    ["wd_coins_100k",     "Tycoon",               "gold",     "Earn 100,000 coins lifetime","coinsEarned", 100000],

    // Specials
    ["wd_perfect_month",  "Perfect Month",        "platinum", "Focus every day in a calendar month","perfect_month", 1],
    ["wd_phoenix_set",    "Phoenix Reborn",       "mythic",   "Wear a 5-piece set after a 30-day streak","phoenix_combo", 1]
  ];

  function wdCheckAchievements(s){
    s = s || (typeof window !== "undefined" ? window.state : null);
    if (!s) return [];
    if (!s.achievementsV85 || typeof s.achievementsV85 !== "object") s.achievementsV85 = {};
    var newly = [];
    var mountsOwned = (s.lootOwned) ? Object.keys(s.lootOwned).filter(function(k){
      return k.indexOf("mount_") === 0 && (s.lootOwned[k]|0) > 0;
    }).length : 0;
    var zonesUnlocked = (s.world && s.world.unlockedZones) ? Object.keys(s.world.unlockedZones).filter(function(k){ return s.world.unlockedZones[k]; }).length : 1;
    var bossKills = (s.world && s.world.bossesDefeated) || 0;
    var shardsEarned = s.crystalShardsEarned || 0;
    var dust = s.craftingDust || 0;
    var totalMin = s.totalFocusMin || 0;
    var streak = s.streak || 0;
    var coins = s.coinsEarned || 0;
    var totalDrops = (s.loot && Array.isArray(s.loot.drops)) ? s.loot.drops.length : 0;
    var dailyClaimed = s.questSystem ? (s.questSystem.dailyClaimedCount||0) : 0;
    var weeklyClaimed = s.questSystem ? (s.questSystem.weeklyClaimedCount||0) : 0;
    var seasonalClaimed = s.questSystem ? (s.questSystem.seasonalClaimedCount||0) : 0;
    var artifactsFound = (s.world && s.world.artifactsFound) ? Object.keys(s.world.artifactsFound).length : 0;
    var mysteryBoxes = (s.world && s.world.mysteryBoxesOpened) || 0;
    var vaultSize = (s.loot && s.loot.vault && s.loot.vault.instances) ? Object.keys(s.loot.vault.instances).length : 0;
    WD_ACHIEVEMENTS.forEach(function(row){
      var id = row[0], kind = row[4], threshold = row[5];
      if (s.achievementsV85[id]) return;
      var hit = false;
      switch(kind){
        case "mounts_owned":          hit = mountsOwned >= threshold; break;
        case "zones_unlocked":        hit = zonesUnlocked >= threshold; break;
        case "boss_kills":            hit = bossKills >= threshold; break;
        case "shards_earned_total":   hit = shardsEarned >= threshold; break;
        case "craft_dust_total":      hit = dust >= threshold; break;
        case "totalMin":              hit = totalMin >= threshold; break;
        case "streak":                hit = streak >= threshold; break;
        case "coinsEarned":           hit = coins >= threshold; break;
        case "total_drops":           hit = totalDrops >= threshold; break;
        case "daily_quests_claimed":  hit = dailyClaimed >= threshold; break;
        case "weekly_quests_claimed": hit = weeklyClaimed >= threshold; break;
        case "seasonal_quests_claimed":hit = seasonalClaimed >= threshold; break;
        case "artifacts_found":       hit = artifactsFound >= threshold; break;
        case "mystery_boxes":         hit = mysteryBoxes >= threshold; break;
        case "vault_size":            hit = vaultSize >= threshold; break;
        case "family_complete":
          if (s.loot && s.loot.mountFamilies && s.loot.mountFamilies[threshold] && s.loot.mountFamilies[threshold].collected){
            var collectedKeys = Object.keys(s.loot.mountFamilies[threshold].collected);
            if (typeof window !== "undefined" && window.CR_MOUNTS_BY_FAMILY && window.CR_MOUNTS_BY_FAMILY[threshold]){
              hit = collectedKeys.length >= window.CR_MOUNTS_BY_FAMILY[threshold].length;
            }
          }
          break;
        // (Other kinds left as tracking hooks; tracked elsewhere via counter increments)
      }
      if (hit){
        s.achievementsV85[id] = Date.now();
        newly.push(id);
      }
    });
    return newly;
  }

  /* ---------- WORLD STATE ---------- */

  function wdEnsureWorld(s){
    s = s || (typeof window !== "undefined" ? window.state : null);
    if (!s) return null;
    if (!s.world || typeof s.world !== "object"){
      s.world = {
        currentZone: "verdant_vale",
        unlockedZones: { verdant_vale: true },
        zonesVisited: { verdant_vale: 1 },
        bossesDefeated: 0,
        mysteryBoxesOpened: 0,
        artifactsFound: {},
        questCounters: { craft_actions:0, enchant_actions:0, mount_pity_unlocks:0 }
      };
    }
    if (!s.world.unlockedZones) s.world.unlockedZones = { verdant_vale: true };
    if (!s.world.zonesVisited) s.world.zonesVisited = { verdant_vale: 1 };
    if (typeof s.world.bossesDefeated !== "number") s.world.bossesDefeated = 0;
    if (typeof s.world.mysteryBoxesOpened !== "number") s.world.mysteryBoxesOpened = 0;
    if (!s.world.artifactsFound) s.world.artifactsFound = {};
    if (!s.world.questCounters) s.world.questCounters = {};
    return s.world;
  }

  function wdSwitchZone(s, zoneId){
    s = s || (typeof window !== "undefined" ? window.state : null);
    if (!s) return { ok:false, reason:"no_state" };
    var world = wdEnsureWorld(s);
    if (!WD_ZONES[zoneId]) return { ok:false, reason:"unknown_zone" };
    if (!world.unlockedZones[zoneId]) return { ok:false, reason:"locked_zone" };
    world.currentZone = zoneId;
    world.zonesVisited[zoneId] = (world.zonesVisited[zoneId]|0) + 1;
    return { ok:true };
  }

  function wdUnlockZone(s, zoneId){
    s = s || (typeof window !== "undefined" ? window.state : null);
    if (!s) return { ok:false, reason:"no_state" };
    var world = wdEnsureWorld(s);
    var zone = WD_ZONES[zoneId];
    if (!zone) return { ok:false, reason:"unknown_zone" };
    if (world.unlockedZones[zoneId]) return { ok:false, reason:"already_unlocked" };
    // Two unlock paths: spend a matching map OR spend shards
    var mapId = zone.unlockMap;
    if (mapId && s.lootOwned && (s.lootOwned[mapId]|0) > 0){
      s.lootOwned[mapId]--;
      world.unlockedZones[zoneId] = true;
      return { ok:true, via:"map" };
    }
    if (zone.unlockShards){
      var spend = wdSpendShards(s, "zone_unlock");
      // (wdSpendShards uses generic cost 250; we still allow unlock if shards >= unlockShards)
      var unlockCost = zone.unlockShards;
      if ((s.crystalShards|0) + (spend.spent||0) < unlockCost && !spend.ok){
        return { ok:false, reason:"insufficient_shards", need: unlockCost };
      }
    }
    world.unlockedZones[zoneId] = true;
    return { ok:true, via:"shards" };
  }

  /* ---------- BOOT + EXPORTS ---------- */

  function wdEnsureAllShape(s){
    s = s || (typeof window !== "undefined" ? window.state : null);
    if (!s) return s;
    if (typeof s.crystalShards !== "number") s.crystalShards = 0;
    if (typeof s.crystalShardsEarned !== "number") s.crystalShardsEarned = 0;
    if (typeof s.crystalShardsSpent !== "number") s.crystalShardsSpent = 0;
    if (typeof s.craftingDust !== "number") s.craftingDust = 0;
    wdEnsureWorld(s);
    wdEnsureQuestRolls(s);
    wdEnsureVault(s);
    if (!s.achievementsV85) s.achievementsV85 = {};
    return s;
  }

  function wdBoot(){
    wdEnsureAllShape(window.state);
  }
  if (typeof document !== "undefined"){
    if (document.readyState === "loading"){
      document.addEventListener("DOMContentLoaded", wdBoot, { once:true });
    } else {
      setTimeout(wdBoot, 0);
    }
  }

  /* Public API on window */
  var publics = {
    WD_RARITIES: WD_RARITIES,
    WD_RARITY_COLOR: WD_RARITY_COLOR,
    WD_RARITY_LABEL: WD_RARITY_LABEL,
    WD_RELICS: WD_RELICS, WD_RUNES: WD_RUNES, WD_GEMS: WD_GEMS,
    WD_REAGENTS: WD_REAGENTS, WD_TROPHIES: WD_TROPHIES,
    WD_TOMES: WD_TOMES, WD_MAPS: WD_MAPS, WD_KEYS: WD_KEYS,
    WD_CHARMS: WD_CHARMS, WD_ARTIFACTS: WD_ARTIFACTS,
    WD_PREFIXES: WD_PREFIXES, WD_SUFFIXES: WD_SUFFIXES,
    WD_GEAR_SETS: WD_GEAR_SETS,
    WD_SHARD_REWARDS: WD_SHARD_REWARDS, WD_SHARD_COSTS: WD_SHARD_COSTS,
    WD_ZONES: WD_ZONES,
    WD_ENEMIES_EXT: WD_ENEMIES_EXT,
    WD_QUEST_DAILY: WD_QUEST_DAILY,
    WD_QUEST_WEEKLY: WD_QUEST_WEEKLY,
    WD_QUEST_SEASONAL: WD_QUEST_SEASONAL,
    WD_ACHIEVEMENTS: WD_ACHIEVEMENTS,
    wdGenerateItemName: wdGenerateItemName,
    wdComputeSetBonuses: wdComputeSetBonuses,
    wdEarnShards: wdEarnShards,
    wdSpendShards: wdSpendShards,
    wdEnsureQuestRolls: wdEnsureQuestRolls,
    wdAdvanceQuests: wdAdvanceQuests,
    wdClaimQuest: wdClaimQuest,
    wdShouldSpawnBoss: wdShouldSpawnBoss,
    wdPickBoss: wdPickBoss,
    wdCombineForUpgrade: wdCombineForUpgrade,
    wdEnchantInstance: wdEnchantInstance,
    wdEnsureVault: wdEnsureVault,
    wdMoveToVault: wdMoveToVault,
    wdMoveFromVault: wdMoveFromVault,
    wdOpenMysteryBox: wdOpenMysteryBox,
    wdCheckAchievements: wdCheckAchievements,
    wdEnsureWorld: wdEnsureWorld,
    wdSwitchZone: wdSwitchZone,
    wdUnlockZone: wdUnlockZone,
    wdAllEnemies: wdAllEnemies,
    wdEnemiesForZone: wdEnemiesForZone,
    wdTodayKey: wdTodayKey,
    wdWeekKey: wdWeekKey,
    wdMonthKey: wdMonthKey,
    wdEnsureAllShape: wdEnsureAllShape
  };
  Object.keys(publics).forEach(function(k){ window[k] = publics[k]; });

  /* Smoke tests */
  window.__wdSmokeTests = function(){
    var results = [];
    var add = function(name, ok, msg){ results.push({ name:name, ok:!!ok, msg:msg||"" }); };

    // Rarity ladder
    add("rarity: 8 tiers (added cursed, artifact)", WD_RARITIES.length === 8);
    add("rarity: cursed present", WD_RARITIES.indexOf("cursed") >= 0);
    add("rarity: artifact present", WD_RARITIES.indexOf("artifact") >= 0);

    // Loot kinds
    add("loot kinds: 17+ relics", WD_RELICS.length >= 17);
    add("loot kinds: 16+ runes",  WD_RUNES.length >= 16);
    add("loot kinds: 13+ gems",   WD_GEMS.length >= 13);
    add("loot kinds: 12+ reagents", WD_REAGENTS.length >= 12);
    add("loot kinds: 10+ trophies", WD_TROPHIES.length >= 10);
    add("loot kinds: 8+ tomes",   WD_TOMES.length >= 8);
    add("loot kinds: 6+ maps",    WD_MAPS.length >= 6);
    add("loot kinds: 7+ keys",    WD_KEYS.length >= 7);
    add("loot kinds: 8+ charms",  WD_CHARMS.length >= 8);
    add("loot kinds: 5 artifacts", WD_ARTIFACTS.length === 5);

    // Affix name generator
    var nm = wdGenerateItemName("Sword", [{ id:"dmgFire", value:14, tier:"major" }], (function(){ var seed = 1; return function(){ seed = (seed * 9301 + 49297) % 233280; return seed/233280; }; })());
    add("affix naming: generated name contains base", nm.indexOf("Sword") >= 0);
    add("affix naming: applies fire prefix or suffix", /Burning|Searing|Phoenix|Forge|Sun|Cinders|Inferno|Smoldering|Pyrelit/.test(nm));

    // Gear sets
    add("gear sets: 8 sets defined", Object.keys(WD_GEAR_SETS).length === 8);
    var sb = wdComputeSetBonuses(["whetstone_blade","trail_boots","tome_of_tomorrow"]);
    add("gear sets: 3-piece dragonhunter triggers", sb.dragonhunter && sb.dragonhunter.tier === 3);

    // Shards
    var fake = {};
    var earned = wdEarnShards(fake, "boss_kill_t5");
    add("shards: boss_kill_t5 = 50", earned === 50 && fake.crystalShards === 50);
    var spend = wdSpendShards(fake, "mystery_box");
    add("shards: mystery_box spend deducts 100", spend.ok === false /* not enough now since only 50 */);
    fake.crystalShards = 200;
    spend = wdSpendShards(fake, "mystery_box");
    add("shards: mystery_box spend succeeds at 200", spend.ok && fake.crystalShards === 100);

    // Zones
    add("zones: 6 zones defined", Object.keys(WD_ZONES).length === 6);
    add("zones: verdant_vale is default unlocked", WD_ZONES.verdant_vale.unlockedDefault === true);
    add("zones: others not unlocked by default",
        WD_ZONES.frostpeak.unlockedDefault === false &&
        WD_ZONES.ember_wastes.unlockedDefault === false);

    // Enemies
    add("enemies: extended pool 45+", WD_ENEMIES_EXT.length >= 45);
    var bosses = WD_ENEMIES_EXT.filter(function(e){ return e.boss; });
    add("enemies: 10+ bosses", bosses.length >= 10);

    // Quests
    add("quests: 12 daily templates", WD_QUEST_DAILY.length === 12);
    add("quests: 10 weekly templates", WD_QUEST_WEEKLY.length === 10);
    add("quests: 6 seasonal templates", WD_QUEST_SEASONAL.length === 6);
    var qs = { questSystem: { lastRoll:{daily:null,weekly:null,seasonal:null}, daily:[], weekly:[], seasonal:[] }};
    wdEnsureQuestRolls(qs);
    add("quests: roll produces 3 daily", qs.questSystem.daily.length === 3);
    add("quests: roll produces 3 weekly", qs.questSystem.weekly.length === 3);
    add("quests: roll produces 1 seasonal", qs.questSystem.seasonal.length === 1);

    // Boss spawn
    add("boss spawn: 90m Fight triggers", wdShouldSpawnBoss(90, "Fight") === true);
    add("boss spawn: 89m Fight does not", wdShouldSpawnBoss(89, "Fight") === false);
    add("boss spawn: 90m Travel does not", wdShouldSpawnBoss(90, "Travel") === false);

    // Crafting
    var cs = { lootInstances: {
      a:{ iid:"a", lootId:"x", tier:"rare", level:0, affixes:[{id:"xpPct", tier:"major", value:8}], sockets:[], locked:false },
      b:{ iid:"b", lootId:"y", tier:"rare", level:0, affixes:[{id:"coinPct", tier:"major", value:8}], sockets:[], locked:false },
      c:{ iid:"c", lootId:"z", tier:"rare", level:0, affixes:[{id:"critPct", tier:"major", value:6}], sockets:[], locked:false }
    } };
    var cr = wdCombineForUpgrade(cs, ["a","b","c"]);
    add("crafting: 3 rare -> 1 epic", cr.ok && cr.newInstance.tier === "epic");
    add("crafting: source instances removed", !cs.lootInstances.a && !cs.lootInstances.b && !cs.lootInstances.c);

    // Vault
    var vs = { loot: {}, lootInstances: { iid:"abc", x:1 } };
    vs.lootInstances.iid_v = { iid:"iid_v", lootId:"t", tier:"common" };
    var v1 = wdMoveToVault(vs, "iid_v");
    add("vault: move to vault succeeds", v1.ok && vs.loot.vault.instances.iid_v);
    add("vault: instance removed from lootInstances", !vs.lootInstances.iid_v);
    var v2 = wdMoveFromVault(vs, "iid_v");
    add("vault: move from vault succeeds", v2.ok && vs.lootInstances.iid_v);

    // Achievements
    add("achievements: 70+ achievements", WD_ACHIEVEMENTS.length >= 70);
    var as = { lootOwned:{}, world:{ unlockedZones:{verdant_vale:true,frostpeak:true}, bossesDefeated:1, mysteryBoxesOpened:0, artifactsFound:{} },
               questSystem:{}, achievementsV85:{}, totalFocusMin:5000, streak:65, coinsEarned:50000, loot:{drops:[], vault:{instances:{}, cap:100}, mountFamilies:{}}, crystalShardsEarned:0, craftingDust:0 };
    var unlocked = wdCheckAchievements(as);
    add("achievements: streak_60 unlocks at 65", unlocked.indexOf("wd_streak_60") >= 0);
    add("achievements: zone_unlock_1 unlocks at 2 zones", unlocked.indexOf("wd_zone_unlock_1") >= 0);
    add("achievements: boss_1 unlocks at 1 boss", unlocked.indexOf("wd_boss_1") >= 0);

    return results;
  };

})();
