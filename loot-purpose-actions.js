/* ================================================================
 * Focus Hero — deterministic loot-purpose actions
 *
 * This module gives currently obtainable keys, reagents, charms,
 * relics, accessories, and fragments bounded gameplay purposes.
 *
 * Safety contract:
 * - no storage, network, cloud, save, migration, or profile access;
 * - no random rolls and no passive grants;
 * - no minute, XP, or coin history changes;
 * - key use is a monotonic counter over owned keys;
 * - utility loadout choices reuse loot.loadout + loadoutUpdatedAt.
 * ================================================================ */
(function (global) {
  "use strict";

  var VERSION = 1;
  var ACTIVE_EQUIP_SLOTS = ["weapon", "helmet", "armor", "mount", "pet"];
  var UTILITY_LOADOUT_SLOTS = ["charm", "relic1", "relic2"];
  var RARITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary", "mythic"];
  var COMBAT_AFFIX_IDS = [
    "critPct", "dmgArcane", "dmgFire", "dmgFrost", "dmgPoison",
    "dodgePct", "lifesteal", "resElem", "resPhys"
  ];
  var DEFAULT_REROLL_DUST = {
    common: 5,
    uncommon: 10,
    rare: 25,
    epic: 60,
    legendary: 150,
    mythic: 400
  };
  var UTILITY_CAPS = Object.freeze({
    combat: Object.freeze({
      critPct: 12,
      dmgArcane: 24,
      dmgFire: 24,
      dmgFrost: 24,
      dmgPoison: 24,
      dodgePct: 10,
      lifesteal: 10,
      resElem: 20,
      resPhys: 20
    }),
    loot: Object.freeze({ qualityBiasPct: 15 }),
    farm: Object.freeze({ harvestYieldPct: 18 })
  });

  var LOOT_PURPOSE_OVERRIDES = Object.freeze({
    copper_coin: {
      kind: "relic",
      role: "loot",
      effect: { loot: { qualityBiasPct: 1 } },
      purpose: "Acts as a carried lucky coin that biases an existing loot roll."
    },
    scroll_of_focus: {
      kind: "relic",
      role: "farm",
      effect: { farm: { harvestYieldPct: 2 } },
      purpose: "Acts as a reusable cultivation note during explicit harvests."
    },
    candle_of_clarity: {
      kind: "relic",
      role: "loot",
      effect: { loot: { qualityBiasPct: 2 } },
      purpose: "Acts as a carried light that biases an existing loot roll."
    },
    calming_herb: {
      kind: "charm",
      role: "farm",
      effect: { farm: { harvestYieldPct: 3 } },
      purpose: "Acts as a reusable garden charm during explicit harvests."
    },
    mana_potion: {
      kind: "relic",
      role: "combat",
      effect: { combat: { dmgArcane: 3 } },
      purpose: "Acts as a carried focus flask during optional Fight encounters."
    },
    golden_apple: {
      kind: "charm",
      role: "farm",
      effect: { farm: { harvestYieldPct: 4 } },
      purpose: "Acts as a reusable orchard charm during explicit harvests."
    },
    seer_s_orb: {
      kind: "relic",
      role: "loot",
      effect: { loot: { qualityBiasPct: 4 } },
      purpose: "Biases an existing loot roll toward quality without adding a roll."
    },
    targeter_s_ring: {
      kind: "relic",
      role: "combat",
      effect: { combat: { critPct: 4 } },
      purpose: "Sharpens aim during optional Fight encounters."
    },
    amulet_of_drive: {
      kind: "relic",
      role: "farm",
      effect: { farm: { harvestYieldPct: 5 } },
      purpose: "Improves yields when a planted crop is explicitly harvested."
    },
    pathfinder_s_compass: {
      kind: "relic",
      role: "loot",
      effect: { loot: { qualityBiasPct: 5 } },
      purpose: "Biases an existing loot roll toward quality without adding a roll."
    },
    hamsa_charm: {
      kind: "charm",
      role: "combat",
      effect: { combat: { resElem: 7 } },
      purpose: "Adds elemental guard during optional Fight encounters."
    },
    focus_reliquary: {
      kind: "relic",
      role: "farm",
      effect: { farm: { harvestYieldPct: 8 } },
      purpose: "Improves yields when a planted crop is explicitly harvested."
    },
    luck_prism: {
      kind: "relic",
      role: "loot",
      effect: { loot: { qualityBiasPct: 10 } },
      purpose: "Biases an existing loot roll toward quality without adding a roll."
    },
    syncfinder_compass: {
      kind: "relic",
      role: "loot",
      effect: { loot: { qualityBiasPct: 6 } },
      purpose: "Biases an existing loot roll toward quality without adding a roll."
    },
    festival_charm: {
      kind: "charm",
      role: "loot",
      effect: { loot: { qualityBiasPct: 5 } },
      purpose: "Biases an existing loot roll toward quality without adding a roll."
    },
    cosmic_fragment: {
      kind: "fragment",
      role: "combat",
      effect: { combat: { dmgArcane: 10 } },
      purpose: "Adds arcane power during optional Fight encounters."
    },
    timekeeper_s_spark: {
      kind: "fragment",
      role: "farm",
      effect: { farm: { harvestYieldPct: 10 } },
      purpose: "Improves yields when a planted crop is explicitly harvested."
    },
    focus_stone: {
      kind: "relic",
      role: "combat",
      effect: { combat: { resPhys: 2 } },
      purpose: "Adds physical guard during optional Fight encounters."
    },
    focus_tonic: {
      kind: "relic",
      role: "farm",
      effect: { farm: { harvestYieldPct: 3 } },
      purpose: "Acts as a reusable cultivation tonic during explicit harvests."
    },
    calm_tea: {
      kind: "charm",
      role: "combat",
      effect: { combat: { resElem: 2 } },
      purpose: "Adds elemental guard during optional Fight encounters."
    },
    energy_draught: {
      kind: "relic",
      role: "combat",
      effect: { combat: { dodgePct: 3 } },
      purpose: "Adds dodge utility during optional Fight encounters."
    },
    hearty_mead: {
      kind: "charm",
      role: "combat",
      effect: { combat: { resPhys: 3 } },
      purpose: "Adds physical guard during optional Fight encounters."
    },
    frost_vial: {
      kind: "relic",
      role: "combat",
      effect: { combat: { dmgFrost: 5 } },
      purpose: "Adds frost power during optional Fight encounters."
    },
    key_of_worlds: {
      kind: "key",
      role: "action",
      chestTier: "legendary",
      purpose: "Opens one deterministic legendary key chest."
    }
  });

  var REAGENT_AFFIX_PREFERENCES = Object.freeze({
    reag_moss:      ["dmgPoison", "resElem", "dodgePct"],
    reag_petal:     ["lifesteal", "resElem", "dodgePct"],
    reag_root:      ["resPhys", "dodgePct", "lifesteal"],
    reag_feather:   ["dodgePct", "critPct", "resElem"],
    reag_fang:      ["critPct", "dmgPoison", "lifesteal"],
    reag_scale_drk: ["resElem", "resPhys", "dmgFire"],
    reag_eye_newt:  ["dmgArcane", "critPct", "resElem"],
    reag_blood_orc: ["dmgFire", "lifesteal", "critPct"],
    reag_horn_uni:  ["dmgFrost", "resElem", "lifesteal"],
    reag_heart_drk: ["dmgFire", "critPct", "resPhys"],
    reag_dust_star: ["dmgArcane", "dodgePct", "critPct"],
    reag_essence_v: ["lifesteal", "dmgArcane", "resElem"]
  });

  function isObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function integer(value) {
    var n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }

  function cleanId(value) {
    return String(value || "").trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  }

  function slugName(value) {
    return cleanId(String(value || "").replace(/['’]/g, "_"));
  }

  function itemId(row) {
    if (!row) return "";
    if (!Array.isArray(row)) return cleanId(row.id);
    if (typeof global.lootId === "function") {
      try {
        return cleanId(global.lootId(row));
      } catch (_) {}
    }
    return slugName(row[1]);
  }

  function stableHash(value) {
    var text = String(value || "");
    var hash = 2166136261 >>> 0;
    for (var i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash >>> 0;
  }

  function clamp(value, min, max) {
    var n = Number(value);
    if (!Number.isFinite(n)) n = 0;
    return Math.max(min, Math.min(max, n));
  }

  function activeEquipSlots() {
    var configured = Array.isArray(global.EQUIP_SLOTS) ? global.EQUIP_SLOTS : ACTIVE_EQUIP_SLOTS;
    return configured.filter(function (slot) {
      return ACTIVE_EQUIP_SLOTS.indexOf(slot) >= 0;
    });
  }

  function tierPotency(tier) {
    var map = {
      common: 2,
      uncommon: 3,
      rare: 4,
      epic: 5,
      legendary: 7,
      mythic: 9,
      cursed: 7,
      artifact: 10
    };
    return map[tier] || 2;
  }

  function emptyEffect() {
    return { combat: {}, loot: {}, farm: {} };
  }

  function normalizeEffect(effect) {
    var out = emptyEffect();
    effect = isObject(effect) ? effect : {};
    var combat = isObject(effect.combat) ? effect.combat : {};
    Object.keys(UTILITY_CAPS.combat).forEach(function (key) {
      if (Number(combat[key]) > 0) {
        out.combat[key] = clamp(combat[key], 0, UTILITY_CAPS.combat[key]);
      }
    });
    var loot = isObject(effect.loot) ? effect.loot : {};
    if (Number(loot.qualityBiasPct) > 0) {
      out.loot.qualityBiasPct = clamp(loot.qualityBiasPct, 0, UTILITY_CAPS.loot.qualityBiasPct);
    }
    var farm = isObject(effect.farm) ? effect.farm : {};
    if (Number(farm.harvestYieldPct) > 0) {
      out.farm.harvestYieldPct = clamp(farm.harvestYieldPct, 0, UTILITY_CAPS.farm.harvestYieldPct);
    }
    return out;
  }

  function roleForCatalogItem(item, kind) {
    var id = cleanId(item && item.id);
    if (kind === "charm") {
      if (/clover|rabbit|horseshoe|dream|star/.test(id)) return "loot";
      if (/focus|phoenix/.test(id)) return "farm";
      return "combat";
    }
    if (/lantern|compass|book|journal|horn|charted|owl/.test(id)) return "loot";
    if (/hourglass|seed|chalice|heart|spark/.test(id)) return "farm";
    return "combat";
  }

  function catalogUtility(item, kind) {
    var potency = tierPotency(item && item.tier);
    var role = roleForCatalogItem(item, kind);
    var declared = isObject(item && item.effect) ? item.effect : {};
    var effect = emptyEffect();

    if (role === "loot") {
      effect.loot.qualityBiasPct = clamp(
        Number(declared.luckPct) || potency,
        1,
        UTILITY_CAPS.loot.qualityBiasPct
      );
    } else if (role === "farm") {
      effect.farm.harvestYieldPct = clamp(
        potency + (Number(declared.energySave) || 0),
        1,
        UTILITY_CAPS.farm.harvestYieldPct
      );
    } else {
      var copied = 0;
      COMBAT_AFFIX_IDS.forEach(function (key) {
        if (copied >= 2 || !(Number(declared[key]) > 0)) return;
        effect.combat[key] = clamp(declared[key], 1, UTILITY_CAPS.combat[key]);
        copied++;
      });
      if (!copied) {
        effect.combat.resElem = clamp(potency, 1, UTILITY_CAPS.combat.resElem);
      }
    }

    return { role: role, effect: normalizeEffect(effect) };
  }

  function effectSummary(effect) {
    var rows = [];
    effect = normalizeEffect(effect);
    Object.keys(effect.combat).forEach(function (key) {
      rows.push("+" + effect.combat[key] + " " + key + " in Fight");
    });
    if (effect.loot.qualityBiasPct) {
      rows.push("+" + effect.loot.qualityBiasPct + "% existing-roll quality bias");
    }
    if (effect.farm.harvestYieldPct) {
      rows.push("+" + effect.farm.harvestYieldPct + "% explicit harvest yield");
    }
    return rows.join(" · ");
  }

  function activeUtilityEntry(id, item, kind, source, override) {
    var generated = override && override.effect
      ? { role: override.role, effect: normalizeEffect(override.effect) }
      : catalogUtility(item, kind);
    var loadoutKind = kind === "charm" ? "charm" : "relic";
    return {
      id: id,
      name: (item && (item.name || item[1])) || id,
      tier: (item && (item.tier || item[2])) || null,
      kind: kind,
      source: source,
      obtainable: true,
      supported: true,
      status: "active",
      action: "utility_loadout",
      loadoutKind: loadoutKind,
      role: generated.role,
      effect: generated.effect,
      effectSummary: effectSummary(generated.effect),
      purpose: (override && override.purpose) || (
        generated.role === "loot"
          ? "Biases an existing loot roll toward quality without adding a roll."
          : generated.role === "farm"
            ? "Improves yields when a planted crop is explicitly harvested."
            : "Adds bounded utility during optional Fight encounters."
      )
    };
  }

  function keyEntry(id, item, source, chestTier) {
    return {
      id: id,
      name: (item && (item.name || item[1])) || id,
      tier: (item && (item.tier || item[2])) || null,
      chestTier: chestTier || (item && item.chestTier) || (item && item[2]) || "common",
      kind: "key",
      source: source,
      obtainable: true,
      supported: true,
      status: "active",
      action: "open_key_chest",
      purpose: "Opens one deterministic chest reward; owned keys are never decremented."
    };
  }

  function reagentEntry(id, item) {
    var preferences = REAGENT_AFFIX_PREFERENCES[id] || COMBAT_AFFIX_IDS.slice();
    return {
      id: id,
      name: (item && item.name) || id,
      tier: (item && item.tier) || null,
      kind: "reagent",
      source: "world_shop",
      obtainable: true,
      supported: true,
      status: "active",
      action: "reforge_affix",
      affixId: preferences[0],
      affixPreferences: preferences.slice(),
      reusableUnlock: true,
      purpose: "Unlocks a deterministic Arcane Dust reforge recipe and is not consumed."
    };
  }

  function dormantEntry(id, item, kind) {
    return {
      id: id,
      name: (item && item.name) || id,
      tier: (item && item.tier) || null,
      kind: kind,
      source: "world_catalog",
      obtainable: false,
      supported: false,
      status: "dormant",
      action: null,
      purpose: "Dormant catalog content; no reward, consume, or equip action is enabled."
    };
  }

  function suppressedCursedEntry(id, item) {
    var entry = dormantEntry(id, item, "cursed_relic");
    entry.status = "unsupported";
    entry.purpose = "Cursed relic is suppressed because its declared downside is not safely enforced.";
    return entry;
  }

  function buildRegistry() {
    var byId = Object.create(null);
    var add = function (entry) {
      if (!entry || !entry.id) return;
      if (!byId[entry.id] || (entry.supported && !byId[entry.id].supported)) byId[entry.id] = entry;
    };

    var lootTable = Array.isArray(global.LOOT_TABLE) ? global.LOOT_TABLE : [];
    lootTable.forEach(function (row) {
      var id = itemId(row);
      var override = LOOT_PURPOSE_OVERRIDES[id];
      var slot = row && row[4];
      if (slot === "accessory") {
        var accessoryKind = override && override.kind ? override.kind : "relic";
        if (accessoryKind === "key") add(keyEntry(id, row, "loot_table", override.chestTier));
        else add(activeUtilityEntry(id, row, accessoryKind, "loot_table", override));
      } else if (override) {
        if (override.kind === "key") add(keyEntry(id, row, "loot_table", override.chestTier));
        else add(activeUtilityEntry(id, row, override.kind, "loot_table", override));
      }
    });

    var worldRelics = Array.isArray(global.WD_RELICS) ? global.WD_RELICS : [];
    worldRelics.forEach(function (item) {
      if (item.tier === "artifact") add(dormantEntry(cleanId(item.id), item, "artifact"));
      else if (item.tier === "cursed") add(suppressedCursedEntry(cleanId(item.id), item));
      else add(activeUtilityEntry(cleanId(item.id), item, "relic", "world_shop", null));
    });

    var worldCharms = Array.isArray(global.WD_CHARMS) ? global.WD_CHARMS : [];
    worldCharms.forEach(function (item) {
      add(activeUtilityEntry(cleanId(item.id), item, "charm", "world_shop", null));
    });

    var worldKeys = Array.isArray(global.WD_KEYS) ? global.WD_KEYS : [];
    worldKeys.forEach(function (item) {
      if (item.tier === "artifact") add(dormantEntry(cleanId(item.id), item, "artifact"));
      else add(keyEntry(cleanId(item.id), item, "world_shop", item.chestTier));
    });

    var worldReagents = Array.isArray(global.WD_REAGENTS) ? global.WD_REAGENTS : [];
    worldReagents.forEach(function (item) {
      add(reagentEntry(cleanId(item.id), item));
    });

    [
      { values: global.WD_RUNES, kind: "rune" },
      { values: global.WD_TOMES, kind: "tome" },
      { values: global.WD_GEMS, kind: "gem" },
      { values: global.WD_MAPS, kind: "map" },
      { values: global.WD_TROPHIES, kind: "trophy" },
      { values: global.WD_ARTIFACTS, kind: "artifact" }
    ].forEach(function (catalog) {
      (Array.isArray(catalog.values) ? catalog.values : []).forEach(function (item) {
        add(dormantEntry(cleanId(item.id), item, catalog.kind));
      });
    });

    return byId;
  }

  function inferredDormantKind(id) {
    var prefixes = [
      ["rune_", "rune"],
      ["tome_", "tome"],
      ["gem_", "gem"],
      ["map_", "map"],
      ["trophy_", "trophy"],
      ["art_", "artifact"]
    ];
    for (var i = 0; i < prefixes.length; i++) {
      if (id.indexOf(prefixes[i][0]) === 0) return prefixes[i][1];
    }
    return null;
  }

  function classify(itemOrId) {
    var id = cleanId(typeof itemOrId === "string" ? itemOrId : itemOrId && itemOrId.id);
    var registry = buildRegistry();
    if (registry[id]) return clone(registry[id]);
    var dormantKind = inferredDormantKind(id);
    if (dormantKind) return dormantEntry(id, isObject(itemOrId) ? itemOrId : null, dormantKind);
    return {
      id: id,
      name: (itemOrId && itemOrId.name) || id,
      tier: null,
      kind: "unknown",
      source: "unknown",
      obtainable: false,
      supported: false,
      status: "unsupported",
      action: null,
      purpose: "No bounded gameplay purpose is registered for this item."
    };
  }

  function registryList(options) {
    options = options || {};
    var registry = buildRegistry();
    return Object.keys(registry).sort().map(function (id) {
      return clone(registry[id]);
    }).filter(function (entry) {
      return options.includeDormant !== false || entry.supported;
    });
  }

  function audit() {
    var entries = registryList({ includeDormant: true });
    var active = entries.filter(function (entry) { return entry.supported; });
    var dormant = entries.filter(function (entry) { return !entry.supported; });
    return {
      entries: entries,
      active: active,
      dormant: dormant,
      deadEnds: active.filter(function (entry) { return !entry.action; }),
      counts: {
        active: active.length,
        dormant: dormant.length,
        keys: active.filter(function (entry) { return entry.kind === "key"; }).length,
        reagents: active.filter(function (entry) { return entry.kind === "reagent"; }).length,
        utility: active.filter(function (entry) { return entry.action === "utility_loadout"; }).length
      }
    };
  }

  function isUsable(itemOrId) {
    var entry = classify(itemOrId);
    return entry.supported === true && typeof entry.action === "string" && entry.action.length > 0;
  }

  function ownedCount(state, id) {
    return integer(state && state.lootOwned && state.lootOwned[id]);
  }

  function keyCounterName(keyId) {
    return "key_used_" + cleanId(keyId);
  }

  function keyAvailability(state, keyId) {
    keyId = cleanId(keyId);
    var key = classify(keyId);
    var counter = keyCounterName(keyId);
    var owned = ownedCount(state, keyId);
    var used = integer(
      state && state.world && state.world.questCounters && state.world.questCounters[counter]
    );
    return {
      ok: key.supported && key.kind === "key",
      keyId: keyId,
      counter: counter,
      owned: owned,
      used: used,
      available: Math.max(0, owned - used),
      chestTier: key.chestTier || null,
      reason: key.supported && key.kind === "key" ? null : "unsupported_key"
    };
  }

  function rewardTier(chestTier) {
    chestTier = cleanId(chestTier);
    return chestTier === "artifact" ? "mythic" : (
      RARITY_ORDER.indexOf(chestTier) >= 0 ? chestTier : "common"
    );
  }

  function keyRewardCandidates(tier) {
    var slots = activeEquipSlots();
    var rows = Array.isArray(global.LOOT_TABLE) ? global.LOOT_TABLE : [];
    return rows.filter(function (row) {
      return row && row[2] === tier && slots.indexOf(row[4]) >= 0;
    }).map(function (row) {
      return { id: itemId(row), row: row };
    }).filter(function (entry) {
      return !!entry.id;
    }).sort(function (a, b) {
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  }

  function affixBandForTier(tier) {
    if (tier === "legendary" || tier === "mythic") return "grand";
    if (tier === "rare" || tier === "epic") return "major";
    return "minor";
  }

  function deterministicAffix(affixId, tier, seed) {
    var definitions = isObject(global.LR_AFFIX_DEFS) ? global.LR_AFFIX_DEFS : {};
    var definition = definitions[affixId];
    if (!definition) return null;
    var band = affixBandForTier(tier);
    var range = Array.isArray(definition[band]) ? definition[band] : null;
    if (!range) return null;
    var low = Number(range[0]) || 1;
    var high = Math.max(low, Number(range[1]) || low);
    return {
      id: affixId,
      tier: band,
      value: low + (stableHash(seed) % (high - low + 1)),
      fixed: false
    };
  }

  function deterministicKeyInstance(plan, stamp) {
    var tier = plan.rewardTier;
    var caps = isObject(global.LR_RARITY_CAPS) && isObject(global.LR_RARITY_CAPS[tier])
      ? global.LR_RARITY_CAPS[tier]
      : { affixes: 1, sockets: 0 };
    var affixes = [];
    if (typeof global.lrBaselineAffix === "function") {
      try {
        var baseline = global.lrBaselineAffix(plan.itemId);
        if (baseline) affixes.push(clone(baseline));
      } catch (_) {}
    }
    var definitions = isObject(global.LR_AFFIX_DEFS) ? global.LR_AFFIX_DEFS : {};
    var ids = Object.keys(definitions).sort();
    var wanted = Math.max(1, integer(caps.affixes));
    var cursor = ids.length ? stableHash(plan.rewardId) % ids.length : 0;
    var guard = 0;
    while (affixes.length < wanted && ids.length && guard < ids.length * 2) {
      var affixId = ids[cursor % ids.length];
      cursor++;
      guard++;
      if (affixes.some(function (affix) { return affix && affix.id === affixId; })) continue;
      var affix = deterministicAffix(affixId, tier, plan.rewardId + ":" + affixId);
      if (affix) affixes.push(affix);
    }
    var sockets = [];
    for (var i = 0; i < integer(caps.sockets); i++) sockets.push({ gemId: null });
    return {
      iid: plan.instanceId,
      lootId: plan.itemId,
      tier: tier,
      level: 0,
      affixes: affixes,
      sockets: sockets,
      dyeId: null,
      createdAt: stamp,
      updatedAt: stamp,
      source: {
        kind: "key_chest",
        keyId: plan.keyId,
        ordinal: plan.ordinal,
        rewardId: plan.rewardId
      },
      locked: false
    };
  }

  function planKeyChest(state, keyId, options) {
    options = options || {};
    keyId = cleanId(keyId);
    var availability = keyAvailability(state, keyId);
    if (!availability.ok) return { ok: false, reason: availability.reason, availability: availability };
    var ordinal = integer(options.ordinal) || (availability.used + 1);
    if (!ordinal) return { ok: false, reason: "invalid_ordinal", availability: availability };
    var tier = rewardTier(availability.chestTier);
    var candidates = keyRewardCandidates(tier);
    if (!candidates.length) {
      return {
        ok: false,
        reason: "no_active_equippable_reward_pool",
        keyId: keyId,
        ordinal: ordinal,
        chestTier: availability.chestTier,
        rewardTier: tier,
        availability: availability
      };
    }
    var rewardId = "key_chest:" + keyId + ":" + ordinal;
    var picked = candidates[stableHash(rewardId + ":" + tier) % candidates.length];
    return {
      ok: true,
      keyId: keyId,
      ordinal: ordinal,
      counter: availability.counter,
      chestTier: availability.chestTier,
      rewardTier: tier,
      rewardId: rewardId,
      itemId: picked.id,
      itemName: picked.row[1],
      itemSlot: picked.row[4],
      instanceId: "iid_key_chest_" + keyId + "_" + ordinal + "_" + stableHash(rewardId).toString(36),
      availability: availability
    };
  }

  function requestedStamp(options, current, fallback) {
    var requested = Number(options && options.updatedAt);
    var base = Number.isFinite(Number(current)) && Number(current) >= 0 ? Math.floor(Number(current)) : 0;
    if (Number.isFinite(requested) && requested > base) return Math.floor(requested);
    return Math.max(base + 1, integer(fallback));
  }

  function openKeyChest(state, keyId, options) {
    options = options || {};
    if (!isObject(state)) return { ok: false, reason: "no_state" };
    var plan = planKeyChest(state, keyId, options);
    if (!plan.ok) return plan;

    var current = keyAvailability(state, plan.keyId);
    if (plan.ordinal <= current.used) {
      return {
        ok: true,
        duplicate: true,
        committed: false,
        plan: plan,
        availability: current
      };
    }
    if (plan.ordinal !== current.used + 1) {
      return { ok: false, reason: "out_of_order_ordinal", expected: current.used + 1, plan: plan };
    }
    if (current.available <= 0) {
      return { ok: false, reason: "no_available_key", plan: plan, availability: current };
    }

    var stamp = requestedStamp(options, 0, plan.ordinal);
    var instance = deterministicKeyInstance(plan, stamp);

    if (!isObject(state.lootOwned)) state.lootOwned = {};
    if (!isObject(state.lootInstances)) state.lootInstances = {};
    if (!isObject(state.world)) state.world = {};
    if (!isObject(state.world.questCounters)) state.world.questCounters = {};
    if (!isObject(state.loot)) state.loot = {};
    if (!Array.isArray(state.loot.drops)) state.loot.drops = [];

    var hadInstance = !!state.lootInstances[plan.instanceId];
    if (!hadInstance) {
      state.lootInstances[plan.instanceId] = instance;
      state.lootOwned[plan.itemId] = integer(state.lootOwned[plan.itemId]) + 1;
    } else if (integer(state.lootOwned[plan.itemId]) <= 0) {
      state.lootOwned[plan.itemId] = 1;
    }

    var hasReceipt = state.loot.drops.some(function (drop) {
      return drop && drop.id === plan.rewardId;
    });
    if (!hasReceipt) {
      state.loot.drops.push({
        id: plan.rewardId,
        at: stamp,
        sessionId: null,
        iid: plan.instanceId,
        templateId: plan.itemId,
        rarity: plan.rewardTier,
        sourceAction: "Key Chest",
        enemyId: null,
        keyId: plan.keyId,
        keyOrdinal: plan.ordinal
      });
    }

    state.world.questCounters[plan.counter] = Math.max(
      integer(state.world.questCounters[plan.counter]),
      plan.ordinal
    );
    var after = keyAvailability(state, plan.keyId);
    return {
      ok: true,
      duplicate: hadInstance || hasReceipt,
      committed: true,
      plan: plan,
      instance: clone(state.lootInstances[plan.instanceId]),
      availability: after
    };
  }

  function reagentPreferences(reagentId) {
    var configured = REAGENT_AFFIX_PREFERENCES[reagentId] || [];
    var out = configured.concat(COMBAT_AFFIX_IDS);
    return out.filter(function (id, index) { return out.indexOf(id) === index; });
  }

  function reforgeAffix(state, iid, affixIndex, reagentId, options) {
    options = options || {};
    reagentId = cleanId(reagentId);
    if (!isObject(state)) return { ok: false, reason: "no_state" };
    var instance = state.lootInstances && state.lootInstances[iid];
    if (!isObject(instance)) return { ok: false, reason: "unknown_instance" };
    if (instance.locked) return { ok: false, reason: "locked_instance" };
    if (!Number.isInteger(Number(affixIndex)) || Number(affixIndex) < 0) {
      return { ok: false, reason: "invalid_affix_index" };
    }
    affixIndex = Number(affixIndex);
    var affixes = Array.isArray(instance.affixes) ? instance.affixes : [];
    var current = affixes[affixIndex];
    if (!isObject(current)) return { ok: false, reason: "unknown_affix" };

    var operationId = cleanId(options.operationId) || (
      "reforge_" + cleanId(iid) + "_" + affixIndex + "_" + reagentId + "_" + integer(instance.updatedAt)
    );
    if (current.reforgeId === operationId) {
      return {
        ok: true,
        duplicate: true,
        committed: false,
        operationId: operationId,
        after: clone(current),
        costPaid: 0
      };
    }
    if (current.fixed) return { ok: false, reason: "fixed_affix" };

    var reagent = classify(reagentId);
    if (!reagent.supported || reagent.kind !== "reagent") {
      return { ok: false, reason: "unsupported_reagent" };
    }
    if (ownedCount(state, reagentId) <= 0) {
      return { ok: false, reason: "reagent_recipe_locked" };
    }
    var definitions = isObject(global.LR_AFFIX_DEFS) ? global.LR_AFFIX_DEFS : {};
    if (!Object.keys(definitions).length) return { ok: false, reason: "affix_definitions_unavailable" };

    var dustMap = isObject(global.LR_REROLL_DUST) ? global.LR_REROLL_DUST : DEFAULT_REROLL_DUST;
    var cost = integer(dustMap[instance.tier]) || DEFAULT_REROLL_DUST[instance.tier] || 5;
    var dust = integer(state.loot && state.loot.materials && state.loot.materials.dust);
    if (dust < cost) {
      return { ok: false, reason: "insufficient_dust", need: cost, have: dust };
    }

    var excluded = Object.create(null);
    affixes.forEach(function (affix, index) {
      if (index !== affixIndex && affix && affix.id) excluded[affix.id] = true;
    });
    var preferences = reagentPreferences(reagentId);
    var nextId = null;
    for (var i = 0; i < preferences.length; i++) {
      if (definitions[preferences[i]] && !excluded[preferences[i]]) {
        nextId = preferences[i];
        break;
      }
    }
    if (!nextId) return { ok: false, reason: "no_compatible_affix" };

    var next = deterministicAffix(nextId, instance.tier, operationId + ":" + nextId);
    if (!next) return { ok: false, reason: "invalid_affix_definition" };
    next.reagentId = reagentId;
    next.reforgeId = operationId;
    next.source = "reagent_reforge";

    var before = clone(current);
    instance.affixes[affixIndex] = next;
    state.loot.materials.dust = dust - cost;
    instance.updatedAt = requestedStamp(options, instance.updatedAt, 1);
    return {
      ok: true,
      duplicate: false,
      committed: true,
      operationId: operationId,
      before: before,
      after: clone(next),
      costPaid: cost,
      reagentConsumed: 0,
      updatedAt: instance.updatedAt
    };
  }

  function loadoutValue(state, slot) {
    var value = state && state.loot && state.loot.loadout && state.loot.loadout[slot];
    return value ? cleanId(value) : null;
  }

  function validateLoadoutChoice(state, slot, id) {
    if (UTILITY_LOADOUT_SLOTS.indexOf(slot) < 0) {
      return { ok: false, reason: "invalid_loadout_slot" };
    }
    if (!id) return { ok: true, id: null, entry: null };
    id = cleanId(id);
    var entry = classify(id);
    if (!entry.supported || entry.action !== "utility_loadout") {
      return { ok: false, reason: "unsupported_utility_item", entry: entry };
    }
    var wantedKind = slot === "charm" ? "charm" : "relic";
    if (entry.loadoutKind !== wantedKind) {
      return { ok: false, reason: "wrong_loadout_kind", entry: entry };
    }
    var selectedElsewhere = UTILITY_LOADOUT_SLOTS.filter(function (other) {
      return other !== slot && loadoutValue(state, other) === id;
    }).length;
    var owned = ownedCount(state, id);
    if (owned <= selectedElsewhere) {
      return {
        ok: false,
        reason: owned ? "insufficient_copies" : "item_not_owned",
        owned: owned,
        selectedElsewhere: selectedElsewhere,
        entry: entry
      };
    }
    return { ok: true, id: id, entry: entry, owned: owned };
  }

  function getUtilityLoadout(state) {
    var result = {};
    UTILITY_LOADOUT_SLOTS.forEach(function (slot) {
      var id = loadoutValue(state, slot);
      var validation = validateLoadoutChoice(state, slot, id);
      result[slot] = {
        id: id,
        valid: validation.ok,
        reason: validation.ok ? null : validation.reason,
        entry: validation.ok && id ? validation.entry : null
      };
    });
    return {
      slots: result,
      updatedAt: integer(state && state.loot && state.loot.loadoutUpdatedAt)
    };
  }

  function setUtilityLoadout(state, slot, id, options) {
    options = options || {};
    if (!isObject(state)) return { ok: false, reason: "no_state" };
    id = id ? cleanId(id) : null;
    var validation = validateLoadoutChoice(state, slot, id);
    if (!validation.ok) return validation;
    var current = loadoutValue(state, slot);
    if (current === id) {
      return { ok: true, duplicate: true, committed: false, slot: slot, id: id };
    }
    if (!isObject(state.loot)) state.loot = {};
    if (!isObject(state.loot.loadout)) state.loot.loadout = {};
    state.loot.loadout[slot] = id;
    state.loot.loadoutUpdatedAt = requestedStamp(options, state.loot.loadoutUpdatedAt, 1);
    return {
      ok: true,
      duplicate: false,
      committed: true,
      slot: slot,
      id: id,
      updatedAt: state.loot.loadoutUpdatedAt,
      loadout: getUtilityLoadout(state)
    };
  }

  function computeUtility(state) {
    var totals = emptyEffect();
    var sources = [];
    var loadout = getUtilityLoadout(state);
    UTILITY_LOADOUT_SLOTS.forEach(function (slot) {
      var selected = loadout.slots[slot];
      if (!selected.valid || !selected.entry) return;
      var effect = normalizeEffect(selected.entry.effect);
      Object.keys(effect.combat).forEach(function (key) {
        totals.combat[key] = (totals.combat[key] || 0) + effect.combat[key];
      });
      totals.loot.qualityBiasPct = (totals.loot.qualityBiasPct || 0) + (effect.loot.qualityBiasPct || 0);
      totals.farm.harvestYieldPct = (totals.farm.harvestYieldPct || 0) + (effect.farm.harvestYieldPct || 0);
      sources.push({
        slot: slot,
        id: selected.entry.id,
        name: selected.entry.name,
        effect: effect,
        effectSummary: selected.entry.effectSummary
      });
    });
    Object.keys(UTILITY_CAPS.combat).forEach(function (key) {
      if (totals.combat[key]) totals.combat[key] = clamp(totals.combat[key], 0, UTILITY_CAPS.combat[key]);
    });
    totals.loot.qualityBiasPct = clamp(
      totals.loot.qualityBiasPct || 0,
      0,
      UTILITY_CAPS.loot.qualityBiasPct
    );
    totals.farm.harvestYieldPct = clamp(
      totals.farm.harvestYieldPct || 0,
      0,
      UTILITY_CAPS.farm.harvestYieldPct
    );
    return {
      combat: totals.combat,
      loot: totals.loot,
      farm: totals.farm,
      sources: sources,
      loadoutUpdatedAt: loadout.updatedAt,
      safety: {
        changesMinutes: false,
        changesHistoricalXp: false,
        changesHistoricalCoins: false,
        addsPassiveRewards: false
      }
    };
  }

  function applyCombatStats(baseStats, state) {
    var out = Object.assign({}, isObject(baseStats) ? baseStats : {});
    var utility = computeUtility(state);
    Object.keys(utility.combat).forEach(function (key) {
      out[key] = (Number(out[key]) || 0) + utility.combat[key];
    });
    out.__lootPurpose = { combat: clone(utility.combat), sources: clone(utility.sources) };
    return out;
  }

  function adjustRarityWeights(weights, state) {
    var original = isObject(weights) ? weights : {};
    var out = {};
    Object.keys(original).forEach(function (key) {
      out[key] = Math.max(0, Number(original[key]) || 0);
    });
    var utility = computeUtility(state);
    var bias = utility.loot.qualityBiasPct || 0;
    if (!bias) return { weights: out, qualityBiasPct: 0, applied: false };

    var total = Object.keys(out).reduce(function (sum, key) { return sum + out[key]; }, 0);
    var donorKeys = ["common", "uncommon"].filter(function (key) { return out[key] > 0; });
    var receiverKeys = ["rare", "epic", "legendary", "mythic"].filter(function (key) {
      return out[key] > 0;
    });
    if (total <= 0 || !donorKeys.length || !receiverKeys.length) {
      return { weights: out, qualityBiasPct: bias, applied: false };
    }
    var donorTotal = donorKeys.reduce(function (sum, key) { return sum + out[key]; }, 0);
    var receiverTotal = receiverKeys.reduce(function (sum, key) { return sum + out[key]; }, 0);
    var shift = Math.min(donorTotal * 0.2, total * bias / 1000);
    donorKeys.forEach(function (key) {
      out[key] -= shift * (out[key] / donorTotal);
    });
    receiverKeys.forEach(function (key) {
      out[key] += shift * (out[key] / receiverTotal);
    });
    return { weights: out, qualityBiasPct: bias, applied: shift > 0 };
  }

  function applyHarvestYield(baseYield, state) {
    var out = {};
    Object.keys(isObject(baseYield) ? baseYield : {}).forEach(function (key) {
      out[key] = Math.max(0, integer(baseYield[key]));
    });
    var utility = computeUtility(state);
    var pct = utility.farm.harvestYieldPct || 0;
    var bonus = {};
    Object.keys(out).forEach(function (key) {
      bonus[key] = out[key] > 0 ? Math.max(0, Math.round(out[key] * pct / 100)) : 0;
      out[key] += bonus[key];
    });
    return {
      yield: out,
      bonus: bonus,
      harvestYieldPct: pct,
      applied: Object.keys(bonus).some(function (key) { return bonus[key] > 0; })
    };
  }

  var api = {
    VERSION: VERSION,
    UTILITY_CAPS: UTILITY_CAPS,
    UTILITY_LOADOUT_SLOTS: UTILITY_LOADOUT_SLOTS.slice(),
    REAGENT_AFFIX_PREFERENCES: REAGENT_AFFIX_PREFERENCES,
    stableHash: stableHash,
    classify: classify,
    isUsable: isUsable,
    registry: registryList,
    audit: audit,
    keyAvailability: keyAvailability,
    planKeyChest: planKeyChest,
    openKeyChest: openKeyChest,
    reforgeAffix: reforgeAffix,
    validateLoadoutChoice: validateLoadoutChoice,
    getUtilityLoadout: getUtilityLoadout,
    setUtilityLoadout: setUtilityLoadout,
    computeUtility: computeUtility,
    applyCombatStats: applyCombatStats,
    adjustRarityWeights: adjustRarityWeights,
    applyHarvestYield: applyHarvestYield
  };

  global.FH_LOOT_PURPOSE = api;
  global.fhLootPurposeClassify = classify;
  global.fhLootPurposeIsUsable = isUsable;
  global.fhLootPurposeRegistry = registryList;
  global.fhLootPurposeAudit = audit;
  global.fhLootPurposeKeyAvailability = keyAvailability;
  global.fhLootPurposePlanKeyChest = planKeyChest;
  global.fhLootPurposeOpenKeyChest = openKeyChest;
  global.fhLootPurposeReforgeAffix = reforgeAffix;
  global.fhLootPurposeValidateLoadoutChoice = validateLoadoutChoice;
  global.fhLootPurposeGetLoadout = getUtilityLoadout;
  global.fhLootPurposeSetLoadout = setUtilityLoadout;
  global.fhLootPurposeComputeUtility = computeUtility;
  global.fhLootPurposeApplyCombatStats = applyCombatStats;
  global.fhLootPurposeAdjustRarityWeights = adjustRarityWeights;
  global.fhLootPurposeApplyHarvestYield = applyHarvestYield;
  try {
    global.__FocusHero = global.__FocusHero || {};
    global.__FocusHero.lootPurpose = api;
  } catch (_) {}
})(typeof window !== "undefined" ? window : globalThis);
