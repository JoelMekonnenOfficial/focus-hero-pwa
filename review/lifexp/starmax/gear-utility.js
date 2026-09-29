/*
 * Life XP gear utility contract
 * --------------------------------
 * Turns the existing equipped item, rolled-affix, set, and mount-family data
 * into one explainable gameplay profile.
 *
 * Safety properties:
 * - pure reads only: this module never mutates state or writes storage;
 * - never changes credited/authoritative minutes or the reward floor;
 * - never creates passive/idle rewards;
 * - all derived bonuses are capped and deterministic;
 * - optional consumers apply bonuses only at an actual session, encounter,
 *   encounter or Travel route boundary.
 */
(function (global) {
  "use strict";

  var VERSION = 2;
  var RANK = { common:1, uncommon:2, rare:3, epic:4, legendary:5, mythic:6, cursed:6, artifact:7 };
  var RARITIES = ["common","uncommon","rare","epic","legendary","mythic"];
  var STAT_KEYS = [
    "travelSpeedPct","critPct","dmgPhys","dmgFire","dmgFrost",
    "dmgPoison","dmgArcane","resPhys","resElem","dodgePct","lifesteal"
  ];
  var CAPS = Object.freeze({
    xpPct:40,
    coinPct:35,
    energySave:9,
    actionXpPct:10,
    lootFindPct:18,
    farmYieldPct:25,
    travelEfficiencyPct:30,
    weaponPower:60,
    resPhys:60,
    resElem:60,
    critPct:40,
    dodgePct:35,
    lifesteal:15,
    elementalDamage:80
  });
  var SLOT_ROLES = Object.freeze({
    weapon:{ name:"Vanguard", actions:["Fight","Craft"], description:"Adds reliable physical power in Fight sessions." },
    helmet:{ name:"Tactician", actions:["Meditate","Craft"], description:"Protects against elemental attacks." },
    armor:{ name:"Bulwark", actions:["Fight","Rest"], description:"Adds reliable physical and elemental protection." },
    mount:{ name:"Pathfinder", actions:["Travel","Hunt"], description:"Covers world routes faster, with combat support." },
    pet:{ name:"Scout", actions:["Loot","Meditate"], description:"Supports critical attacks and evasive combat." }
  });
  var COMBAT_FAMILY = Object.freeze({
    dragon:6, mythical:5, undead:5, cat:4, wolf:4, reptile:4, bear:4, elemental:4
  });

  function number(value) {
    value = Number(value);
    return isFinite(value) ? value : 0;
  }

  function integer(value) {
    return Math.max(0, Math.floor(number(value)));
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, number(value)));
  }

  function cleanId(value) {
    return String(value || "").trim();
  }

  function titleFromId(id) {
    return cleanId(id).replace(/^mount_/, "").replace(/_/g, " ").replace(/\b\w/g, function (letter) {
      return letter.toUpperCase();
    }) || "Unknown item";
  }

  function copyStats(input) {
    var out = {};
    STAT_KEYS.forEach(function (key) {
      var value = number(input && input[key]);
      if (value) out[key] = value;
    });
    return out;
  }

  function addStats(target, source) {
    STAT_KEYS.forEach(function (key) {
      var value = number(source && source[key]);
      if (value) target[key] = number(target[key]) + value;
    });
    return target;
  }

  function maxStats(target, source) {
    STAT_KEYS.forEach(function (key) {
      var value = number(source && source[key]);
      if (value) target[key] = Math.max(number(target[key]), value);
    });
    return target;
  }

  function templateFor(id) {
    try {
      if (typeof global.lootById === "function") return global.lootById(id);
    } catch (_) {}
    try {
      if (typeof LOOT_TABLE !== "undefined" && Array.isArray(LOOT_TABLE)) {
        for (var i=0; i<LOOT_TABLE.length; i++) {
          var row = LOOT_TABLE[i];
          var rowId = typeof global.lootId === "function"
            ? global.lootId(row)
            : String(row[1] || "").toLowerCase().replace(/[^a-z0-9]+/g, "_");
          if (rowId === id) return row;
        }
      }
    } catch (_) {}
    return null;
  }

  function legacyEffectFor(id) {
    try {
      if (typeof GEAR_EFFECTS !== "undefined" && GEAR_EFFECTS && GEAR_EFFECTS[id]) {
        return GEAR_EFFECTS[id];
      }
    } catch (_) {}
    try {
      if (global.GEAR_EFFECTS && global.GEAR_EFFECTS[id]) return global.GEAR_EFFECTS[id];
    } catch (_) {}
    return null;
  }

  function mountFor(id) {
    var mounts = Array.isArray(global.CR_MOUNTS_FULL) ? global.CR_MOUNTS_FULL : [];
    for (var i=0; i<mounts.length; i++) if (mounts[i] && mounts[i].id === id) return mounts[i];
    return null;
  }

  function inferMountFamily(id, name) {
    var text = (cleanId(id) + " " + cleanId(name)).toLowerCase();
    var rules = [
      ["dragon","dragon"],["drake","dragon"],["wyrm","dragon"],["wyvern","dragon"],
      ["wolf","wolf"],["hound","wolf"],["fox","wolf"],["kitsune","mythical"],
      ["lion","cat"],["tiger","cat"],["panther","cat"],["leopard","cat"],
      ["bear","bear"],["stag","forest"],["deer","forest"],["ram","forest"],
      ["boar","forest"],["ibex","forest"],["horse","horse"],["pony","horse"],
      ["mule","cattle"],["rhino","cattle"],["yak","cattle"],["bison","cattle"],
      ["eagle","bird"],["hawk","bird"],["falcon","bird"],["owl","bird"],
      ["moth","insect"],["spider","insect"],["scorpion","insect"],
      ["shark","aquatic"],["jelly","aquatic"],["otter","aquatic"],
      ["croc","reptile"],["raptor","reptile"],["lizard","reptile"],
      ["phoenix","mythical"],["unicorn","mythical"],["pegasus","mythical"],
      ["griffin","mythical"],["skiff","elemental"]
    ];
    for (var i=0; i<rules.length; i++) if (text.indexOf(rules[i][0]) >= 0) return rules[i][1];
    return "legacy";
  }

  function instanceStats(instance) {
    if (!instance) return {};
    try {
      if (typeof global.lrInstanceStats === "function") return copyStats(global.lrInstanceStats(instance));
    } catch (_) {}
    var out = {};
    var multiplier = 1 + integer(instance.level) * 0.08;
    (Array.isArray(instance.affixes) ? instance.affixes : []).forEach(function (affix) {
      if (!affix || STAT_KEYS.indexOf(affix.id) < 0) return;
      out[affix.id] = number(out[affix.id]) + Math.max(1, Math.floor(number(affix.value) * multiplier));
    });
    return out;
  }

  function itemFor(state, slot, equipped) {
    if (!equipped || !equipped.lootId) return null;
    var id = cleanId(equipped.lootId);
    var instance = equipped.instanceId && state.lootInstances
      ? state.lootInstances[equipped.instanceId] || null
      : null;
    var template = templateFor(id);
    var mount = slot === "mount" ? mountFor(id) : null;
    var tier = cleanId((instance && instance.tier) || equipped.tier || (template && template[2]) || (mount && mount.tier) || "common").toLowerCase();
    var rank = RANK[tier] || 1;
    var level = integer(instance && instance.level);
    var name = (template && template[1]) || (mount && mount.name) || titleFromId(id);
    var explicit = {};
    maxStats(explicit, legacyEffectFor(id));
    maxStats(explicit, mount && mount.effect);
    var rolled = instanceStats(instance);
    var stats = copyStats(explicit);
    /* Minted instances contain their template baseline. maxStats prevents that
       fixed baseline from being counted twice while retaining rolled affixes. */
    maxStats(stats, rolled);
    var family = slot === "mount"
      ? ((mount && mount.family) || inferMountFamily(id, name))
      : null;
    return {
      slot:slot,
      id:id,
      name:name,
      tier:tier,
      rank:rank,
      level:level,
      family:family,
      instanceId:cleanId(equipped.instanceId) || null,
      stats:stats,
      role:SLOT_ROLES[slot] || { name:"Utility", actions:[], description:"Adds loadout utility." }
    };
  }

  function setBonuses(equippedIds) {
    var out = [];
    try {
      if (typeof ITEM_SETS !== "undefined" && ITEM_SETS) {
        Object.keys(ITEM_SETS).sort().forEach(function (key) {
          var set = ITEM_SETS[key];
          var count = (set.items || []).filter(function (id) { return equippedIds.indexOf(id) >= 0; }).length;
          var picked = null;
          Object.keys(set.bonuses || {}).map(Number).sort(function (a,b) { return a-b; }).forEach(function (threshold) {
            if (count >= threshold) picked = { threshold:threshold, bonus:set.bonuses[threshold] };
          });
          if (picked) out.push({ id:"core:"+key, name:set.name, count:count, threshold:picked.threshold, bonus:picked.bonus });
        });
      }
    } catch (_) {}
    try {
      if (typeof global.wdComputeSetBonuses === "function") {
        var worldSets = global.wdComputeSetBonuses(equippedIds) || {};
        Object.keys(worldSets).sort().forEach(function (key) {
          var set = worldSets[key];
          out.push({ id:"world:"+key, name:set.label, count:set.pieces, threshold:set.tier, bonus:set.bonus || {} });
        });
      }
    } catch (_) {}
    return out;
  }

  function sourceLine(item, pieces, plannedPieces) {
    return {
      kind:"item",
      slot:item.slot,
      id:item.id,
      name:item.name,
      tier:item.tier,
      role:item.role.name,
      pieces:pieces.filter(Boolean),
      plannedPieces:(plannedPieces || []).filter(Boolean)
    };
  }

  function statPieces(stats) {
    stats = stats || {};
    var labels = {
      travelSpeedPct:"% Travel route speed",
      critPct:"% critical chance",
      dmgPhys:" physical damage",
      dmgFire:" fire damage",
      dmgFrost:" frost damage",
      dmgPoison:" poison damage",
      dmgArcane:" arcane damage",
      resPhys:" physical resistance",
      resElem:" elemental resistance",
      dodgePct:"% dodge",
      lifesteal:"% lifesteal"
    };
    return STAT_KEYS.filter(function (key) {
      return number(stats[key]) !== 0;
    }).map(function (key) {
      var value = number(stats[key]);
      if (key === "energySave") return "-" + value + labels[key];
      return (value > 0 ? "+" : "") + value + labels[key];
    });
  }

  function compute(state, context) {
    state = state && typeof state === "object" ? state : {};
    context = context || {};
    var equipped = state.hero && state.hero.equipped || {};
    var items = Object.keys(SLOT_ROLES).map(function(slot){ return itemFor(state, slot, equipped[slot]); }).filter(Boolean);
    var raw = {}, sources = [], travel = 0;
    items.forEach(function(item){
      addStats(raw, item.stats);
      var pieces = statPieces(item.stats);
      /* Slot foundations make old items useful without rewriting their saved
         affixes. New catalog stats and rolled combat affixes remain bounded. */
      var base = {};
      if (item.slot === "weapon") base.dmgPhys = 2 + item.rank * 3 + item.level * 2;
      if (item.slot === "helmet") base.resElem = 1 + item.rank + Math.floor(item.level / 2);
      if (item.slot === "armor") {
        base.resPhys = 2 + item.rank * 2 + item.level;
        base.resElem = Math.max(1, Math.floor(base.resPhys / 2));
      }
      if (item.slot === "pet") base.dodgePct = 1 + item.rank;
      if (item.slot === "mount") {
        travel = Math.max(travel, 4 + item.rank * 3);
        base.dmgPhys = number(COMBAT_FAMILY[item.family]);
        base.dodgePct = Math.floor(base.dmgPhys / 2);
        pieces = pieces.filter(function(piece){ return !/Travel/.test(piece); });
        pieces.push("+" + travel + "% Travel route speed");
      }
      addStats(raw, base);
      sources.push(sourceLine(item, pieces.concat(statPieces(base)), []));
    });
    var sets = setBonuses(items.map(function(item){ return item.id; }));
    sets.forEach(function(set){
      var bonus = set.bonus || {};
      var stats = copyStats(bonus);
      addStats(raw, stats);
      if (bonus.elemDmgPct) ["dmgFire","dmgFrost","dmgPoison","dmgArcane"].forEach(function(key){
        raw[key] = number(raw[key]) * (1 + Math.max(0, number(bonus.elemDmgPct)) / 100);
      });
      var pieces = statPieces(stats);
      if (bonus.elemDmgPct) pieces.push("+" + bonus.elemDmgPct + "% elemental combat power");
      sources.push({kind:"set",id:set.id,name:set.name,pieces:pieces,plannedPieces:[]});
    });
    var utility = typeof global.fhLootPurposeComputeUtility === "function" ? global.fhLootPurposeComputeUtility(state) : null;
    if (utility && utility.combat) addStats(raw, utility.combat);
    (utility && utility.sources || []).forEach(function(source){
      sources.push({kind:"utility",slot:source.slot,id:source.id,name:source.name,role:"Combat support",pieces:statPieces(source.effect.combat),plannedPieces:[]});
    });
    var combat = {};
    ["dmgPhys","dmgFire","dmgFrost","dmgPoison","dmgArcane","resPhys","resElem","critPct","dodgePct","lifesteal"].forEach(function(key){
      var cap = key === "dmgPhys" ? CAPS.weaponPower : /^dmg/.test(key) ? CAPS.elementalDamage : CAPS[key];
      combat[key] = Math.round(clamp(raw[key], 0, cap));
    });
    return {
      version:VERSION,action:cleanId(context.action)||null,equippedCount:items.length,
      utilityCount:utility && utility.sources ? utility.sources.length : 0,items:items,sets:sets,
      session:{xpPct:0,coinPct:0,energySave:0},combat:combat,
      loot:{qualityBiasPct:0},farm:{harvestYieldPct:0},
      travel:{speedPct:Math.round(clamp(travel,0,CAPS.travelEfficiencyPct))},
      planned:{actionRoleXpPct:0,travelEfficiencyPct:0},sources:sources,
      safety:{changesMinutes:false,passiveRewards:false,ignoredAuthoritativeMinuteEffects:[]}
    };
  }

  function combatStats(baseStats, state, context) {
    var out = copyStats(baseStats);
    var profile = compute(state, context);
    out.dmgPhys = clamp(Math.max(number(out.dmgPhys), profile.combat.dmgPhys), 0, CAPS.weaponPower);
    out.dmgFire = clamp(Math.max(number(out.dmgFire), profile.combat.dmgFire), 0, CAPS.elementalDamage);
    out.dmgFrost = clamp(Math.max(number(out.dmgFrost), profile.combat.dmgFrost), 0, CAPS.elementalDamage);
    out.dmgPoison = clamp(Math.max(number(out.dmgPoison), profile.combat.dmgPoison), 0, CAPS.elementalDamage);
    out.dmgArcane = clamp(Math.max(number(out.dmgArcane), profile.combat.dmgArcane), 0, CAPS.elementalDamage);
    out.resPhys = clamp(Math.max(number(out.resPhys), profile.combat.resPhys), 0, CAPS.resPhys);
    out.resElem = clamp(Math.max(number(out.resElem), profile.combat.resElem), 0, CAPS.resElem);
    out.critPct = clamp(Math.max(number(out.critPct), profile.combat.critPct), 0, CAPS.critPct);
    out.dodgePct = clamp(Math.max(number(out.dodgePct), profile.combat.dodgePct), 0, CAPS.dodgePct);
    out.lifesteal = clamp(Math.max(number(out.lifesteal), profile.combat.lifesteal), 0, CAPS.lifesteal);
    out.__gearUtility = {
      version:VERSION,
      weaponPower:profile.combat.dmgPhys,
      guard:profile.combat.resPhys + profile.combat.resElem,
      equippedCount:profile.equippedCount
    };
    return out;
  }

  function adjustRarityWeights(weights, state, context) {
    var profile = compute(state, context);
    var pct = profile.loot.qualityBiasPct;
    var out = {};
    var lifts = { common:-0.35, uncommon:-0.10, rare:0.45, epic:0.75, legendary:1.0, mythic:1.25 };
    RARITIES.forEach(function (rarity) {
      var base = Math.max(0, number(weights && weights[rarity]));
      var factor = Math.max(0.5, 1 + (pct / 100) * lifts[rarity]);
      out[rarity] = base * factor;
    });
    return {
      weights:out,
      qualityBiasPct:pct,
      sources:profile.sources.filter(function (source) {
        return source.pieces && source.pieces.some(function (piece) {
          return /loot|scout/i.test(piece);
        });
      }).map(function (source) { return source.name; })
    };
  }

  function harvestYield(baseYield, state, context) {
    var profile = compute(state, context);
    var pct = profile.farm.harvestYieldPct;
    var output = {};
    var bonus = {};
    Object.keys(baseYield || {}).sort().forEach(function (material) {
      var base = integer(baseYield[material]);
      var extra = base > 0 ? Math.max(0, Math.round(base * pct / 100)) : 0;
      output[material] = base + extra;
      bonus[material] = extra;
    });
    return {
      yield:output,
      bonus:bonus,
      harvestYieldPct:pct,
      applied:pct > 0 && Object.keys(bonus).some(function (key) { return bonus[key] > 0; }),
      sources:profile.sources.filter(function (source) {
        return source.pieces && source.pieces.some(function (piece) {
          return /farm/i.test(piece);
        });
      }).map(function (source) { return source.name; })
    };
  }

  function previewSessionRewards(base, state, context) {
    base = base || {};
    context = context || {};
    var profile = compute(state, context);
    var eligible = context.rewarded !== false && integer(context.minutes) >= Math.max(1, integer(context.rewardFloor || 1));
    var xp = integer(base.xp);
    var coins = integer(base.coins);
    if (!eligible) {
      return { xp:xp, coins:coins, appliedXpBonus:0, plannedXpBonus:0, eligible:false, previewOnly:true, profile:profile };
    }
    /* No caller applies this preview. Wiring it without a per-session gear
       snapshot would let current equipment rewrite historical edit rewards. */
    var plannedXpBonus = Math.round(xp * profile.planned.actionRoleXpPct / 100);
    return {
      xp:xp,
      coins:coins,
      appliedXpBonus:0,
      plannedXpBonus:plannedXpBonus,
      eligible:true,
      previewOnly:true,
      profile:profile
    };
  }

  /*
   * Non-equippable content-purpose registry.
   *
   * World Depth declares several attractive catalogs, but declaration is not
   * the same as a usable gameplay path. Keep the distinction machine-readable
   * so inventory/UI code can say "collection only" or "not usable yet"
   * instead of advertising a button that does not exist.
   */
  var PURPOSES = Object.freeze({
    map:{
      label:"World Map",
      purpose:"Legacy maps remain collectible. Clear enemies and the boss, then Travel to open the next world.",
      destination:"World",
      plannedAction:"View the world route requirements."
    },
    key:{
      label:"Chest Key",
      purpose:"Opens one deterministic chest containing active equippable gear.",
      destination:"Forge / Keys",
      plannedAction:"Open its deterministic reward preview."
    },
    gem:{
      label:"Forge Gem",
      purpose:"Active Forge gems socket a stat bonus; the separate World gem catalog remains unavailable.",
      destination:"Forge",
      plannedAction:"Socket or enchant gear."
    },
    rune:{
      label:"Weapon Rune",
      purpose:"Intended to socket a passive effect into a weapon.",
      destination:"Forge",
      plannedAction:"Socket into a weapon."
    },
    reagent:{
      label:"Forge Reagent",
      purpose:"Unlocks a reusable deterministic affix recipe paid with Arcane Dust.",
      destination:"Forge",
      plannedAction:"Select a non-fixed affix and apply its exact preview."
    },
    trophy:{
      label:"Boss Trophy",
      purpose:"Dormant catalog content; bosses do not currently award these declared objects.",
      destination:"Collection",
      plannedAction:"Unavailable until acquisition and a real consumer ship together."
    },
    tome:{
      label:"Tome",
      purpose:"Intended to unlock the named focus or combat technique.",
      destination:"Library",
      plannedAction:"Read to unlock a technique."
    },
    charm:{
      label:"Charm",
      purpose:"Provides a bounded effect only while selected in the utility loadout.",
      destination:"Loadout",
      plannedAction:"Select in the charm slot."
    },
    relic:{
      label:"Relic",
      purpose:"Provides a bounded effect only while selected in a relic slot.",
      destination:"Loadout",
      plannedAction:"Select in one of two relic slots."
    },
    fragment:{
      label:"Power Fragment",
      purpose:"Functions as a bounded relic while selected in the utility loadout.",
      destination:"Loadout",
      plannedAction:"Select in one of two relic slots."
    },
    cursed_relic:{
      label:"Cursed Relic",
      purpose:"Suppressed because its declared downside is not safely enforced by the current engine.",
      destination:"Unavailable",
      plannedAction:"Unavailable until both its benefit and downside are implemented together."
    },
    artifact:{
      label:"World Artifact",
      purpose:"Unique collection object intended for its declared artifact slot.",
      destination:"Collection / Loadout",
      plannedAction:"Inspect or equip in its declared slot."
    }
  });

  function contentCatalogs() {
    var forgeGems = [];
    if (global.LR_GEM_DEFS && typeof global.LR_GEM_DEFS === "object") {
      Object.keys(global.LR_GEM_DEFS).sort().forEach(function (id) {
        var gem = global.LR_GEM_DEFS[id] || {};
        forgeGems.push({
          id:id,
          name:gem.name || titleFromId(id),
          sym:gem.sym || "",
          tier:null,
          effect:(function () {
            var effect = {};
            if (gem.affixId) effect[gem.affixId] = number(gem.value);
            return effect;
          })(),
          forgeSocketReady:true
        });
      });
    }
    return [
      { category:"relic",   values:Array.isArray(global.WD_RELICS) ? global.WD_RELICS : [] },
      { category:"rune",    values:Array.isArray(global.WD_RUNES) ? global.WD_RUNES : [] },
      { category:"gem",     values:Array.isArray(global.WD_GEMS) ? global.WD_GEMS : [] },
      { category:"gem",     values:forgeGems },
      { category:"reagent", values:Array.isArray(global.WD_REAGENTS) ? global.WD_REAGENTS : [] },
      { category:"trophy",  values:Array.isArray(global.WD_TROPHIES) ? global.WD_TROPHIES : [] },
      { category:"tome",    values:Array.isArray(global.WD_TOMES) ? global.WD_TOMES : [] },
      { category:"map",     values:Array.isArray(global.WD_MAPS) ? global.WD_MAPS : [] },
      { category:"key",     values:Array.isArray(global.WD_KEYS) ? global.WD_KEYS : [] },
      { category:"charm",   values:Array.isArray(global.WD_CHARMS) ? global.WD_CHARMS : [] },
      { category:"artifact",values:Array.isArray(global.WD_ARTIFACTS) ? global.WD_ARTIFACTS : [] }
    ];
  }

  function inferContentCategory(id) {
    id = cleanId(id);
    var prefixes = ["relic","rune","gem","reagent","trophy","tome","map","key","charm","art"];
    for (var i=0; i<prefixes.length; i++) {
      if (id.indexOf(prefixes[i] + "_") === 0) return prefixes[i] === "art" ? "artifact" : prefixes[i];
    }
    return null;
  }

  function findContent(itemOrId) {
    var id = cleanId(typeof itemOrId === "string" ? itemOrId : itemOrId && itemOrId.id);
    var catalogs = contentCatalogs();
    for (var i=0; i<catalogs.length; i++) {
      for (var j=0; j<catalogs[i].values.length; j++) {
        var item = catalogs[i].values[j];
        if (item && item.id === id) return { category:catalogs[i].category, item:item };
      }
    }
    if (itemOrId && typeof itemOrId === "object") {
      return { category:inferContentCategory(id), item:itemOrId };
    }
    return { category:inferContentCategory(id), item:{ id:id, name:titleFromId(id) } };
  }

  function contentOwnedCount(state, category, id) {
    state = state || {};
    if (category === "gem") {
      return integer(state.loot && state.loot.gemsOwned && state.loot.gemsOwned[id]);
    }
    return integer(state.lootOwned && state.lootOwned[id]);
  }

  function classifyContent(itemOrId, state) {
    var found = findContent(itemOrId);
    var category = found.category;
    var item = found.item || {};
    var forgeGemReady = category === "gem" && !!(
      item.forgeSocketReady &&
      global.LR_GEM_DEFS &&
      global.LR_GEM_DEFS[item.id] &&
      typeof global.lrSocketGem === "function"
    );
    var registered = null;
    if (!forgeGemReady && typeof global.fhLootPurposeClassify === "function") {
      try { registered = global.fhLootPurposeClassify(item.id || itemOrId); } catch (_) { registered = null; }
      if (registered && registered.kind && registered.kind !== "unknown") category = registered.kind;
    }
    var purpose = PURPOSES[category] || {
      label:"Unclassified Loot",
      purpose:"No gameplay purpose is registered.",
      destination:"Inventory",
      plannedAction:"None"
    };
    var status = "dead-end";
    var userAction = false;
    var note = "No consuming or equipping action is wired.";

    if (forgeGemReady) {
      status = "ready";
      userAction = true;
      note = "Available in the Forge socket control.";
    } else if (registered && registered.supported && registered.action) {
      status = "ready";
      userAction = true;
      note = registered.purpose || "A visible deterministic action is available.";
    } else if (registered && registered.supported === false) {
      status = "dormant";
      note = registered.purpose || "Unavailable catalog content is suppressed from acquisition.";
    } else if (category === "artifact") {
      var template = templateFor(item.id);
      var slot = template && template[4];
      if (template && SLOT_ROLES[slot]) {
        status = "ready";
        userAction = true;
        note = "This artifact also exists as a normal equippable gear template.";
      } else {
        note = "The artifact and intended slot are declared, but no artifact equip/inspect action consumes it.";
      }
    }

    return {
      id:cleanId(item.id),
      name:item.name || titleFromId(item.id),
      category:category || "unknown",
      label:purpose.label,
      purpose:purpose.purpose,
      destination:purpose.destination,
      plannedAction:purpose.plannedAction,
      status:status,
      ready:status === "ready",
      userAction:userAction,
      deadEnd:status === "dead-end",
      dormant:status === "dormant",
      obtainable:registered ? !!registered.obtainable : forgeGemReady,
      note:note,
      owned:contentOwnedCount(state, category, item.id),
      declared:{
        tier:item.tier || null,
        effect:item.effect || null,
        unlocksZone:item.unlocksZone || null,
        unlocks:item.unlocks || null,
        chestTier:item.chestTier || null,
        slot:item.slot || null
      }
    };
  }

  function contentAudit(state) {
    var items = [];
    var seen = {};
    contentCatalogs().forEach(function (catalog) {
      catalog.values.forEach(function (item) {
        var classified = classifyContent(item, state);
        items.push(classified);
        seen[classified.id] = true;
      });
    });
    if (typeof global.fhLootPurposeRegistry === "function") {
      try {
        (global.fhLootPurposeRegistry({ includeDormant:true }) || []).forEach(function (entry) {
          if (!entry || !entry.id || seen[entry.id]) return;
          var classified = classifyContent(entry, state);
          items.push(classified);
          seen[classified.id] = true;
        });
      } catch (_) {}
    }
    var categories = {};
    items.forEach(function (item) {
      var row = categories[item.category] || (categories[item.category] = {
        category:item.category,
        label:item.label,
        purpose:item.purpose,
        destination:item.destination,
        total:0,
        ready:0,
        implementedNoUi:0,
        collectionOnly:0,
        dormant:0,
        deadEnds:0
      });
      row.total++;
      if (item.status === "ready") row.ready++;
      else if (item.status === "implemented-no-ui") row.implementedNoUi++;
      else if (item.status === "collection-only") row.collectionOnly++;
      else if (item.status === "dormant") row.dormant++;
      else row.deadEnds++;
    });
    return {
      categories:Object.keys(categories).sort().map(function (key) { return categories[key]; }),
      items:items,
      deadEnds:items.filter(function (item) { return item.deadEnd; }),
      dormant:items.filter(function (item) { return item.dormant; }),
      unexposed:items.filter(function (item) { return item.status === "implemented-no-ui"; }),
      collectionOnly:items.filter(function (item) { return item.status === "collection-only"; })
    };
  }

  function summary(state, context) {
    var profile = compute(state, context);
    var rows = [];
    if (profile.session.xpPct) rows.push("+" + profile.session.xpPct + "% XP");
    if (profile.session.coinPct) rows.push("+" + profile.session.coinPct + "% coins");
    if (profile.travel.speedPct) rows.push("+" + profile.travel.speedPct + "% Travel route speed");
    if (profile.combat.dmgPhys) rows.push("+" + profile.combat.dmgPhys + " Fight power");
    if (profile.combat.resPhys || profile.combat.resElem) rows.push("+" + (profile.combat.resPhys + profile.combat.resElem) + " total guard");
    if (profile.loot.qualityBiasPct) rows.push("+" + profile.loot.qualityBiasPct + "% loot-quality bias");
    if (profile.farm.harvestYieldPct) rows.push("+" + profile.farm.harvestYieldPct + "% harvest yield");
    var plannedRows = [];
    if (profile.planned.actionRoleXpPct) plannedRows.push("Planned, not active: +" + profile.planned.actionRoleXpPct + "% " + profile.action + " role XP");
    if (profile.planned.travelEfficiencyPct) plannedRows.push("Planned, not active: +" + profile.planned.travelEfficiencyPct + "% Travel route bonus");
    return {
      headline:(profile.equippedCount || profile.utilityCount)
        ? profile.equippedCount + " gear + " + profile.utilityCount + " utilit" + (profile.utilityCount === 1 ? "y" : "ies") + " active"
        : "No gameplay gear or utility items equipped",
      rows:rows,
      plannedRows:plannedRows,
      sources:profile.sources,
      profile:profile
    };
  }

  var api = {
    VERSION:VERSION,
    CAPS:CAPS,
    SLOT_ROLES:SLOT_ROLES,
    compute:compute,
    combatStats:combatStats,
    adjustRarityWeights:adjustRarityWeights,
    harvestYield:harvestYield,
    previewSessionRewards:previewSessionRewards,
    PURPOSES:PURPOSES,
    classifyContent:classifyContent,
    contentAudit:contentAudit,
    summary:summary
  };

  global.FH_GEAR_UTILITY = api;
  global.fhGearUtilityCompute = compute;
  global.fhGearUtilityCombatStats = combatStats;
  global.fhGearUtilityAdjustRarityWeights = adjustRarityWeights;
  global.fhGearUtilityHarvestYield = harvestYield;
  global.fhGearUtilityPreviewSessionRewards = previewSessionRewards;
  global.fhGearUtilityClassifyContent = classifyContent;
  global.fhGearUtilityContentAudit = contentAudit;
  global.fhGearUtilitySummary = summary;
  try {
    global.__FocusHero = global.__FocusHero || {};
    global.__FocusHero.gearUtility = api;
  } catch (_) {}
})(typeof window !== "undefined" ? window : globalThis);

/* asset content-type refresh — v10.32.0 */
