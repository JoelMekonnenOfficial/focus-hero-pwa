import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(ROOT, "loot-purpose-actions.js"), "utf8");
const indexSource = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const lootLiteral = indexSource.match(/const LOOT_TABLE = (\[[\s\S]*?\n\]);\r?\nconst EQUIP_SLOTS/);
assert.ok(lootLiteral, "canonical LOOT_TABLE should be extractable");
const ACTUAL_LOOT_TABLE = vm.runInNewContext(lootLiteral[1]);

const LOOT_TABLE = [
  ["C", "Cloth Cap", "common", 1, "helmet"],
  ["D", "Rusty Dagger", "common", 1, "weapon"],
  ["H", "Leather Helm", "uncommon", 1, "helmet"],
  ["S", "Iron Shortsword", "uncommon", 1, "weapon"],
  ["Q", "Scholar's Quill", "rare", 1, "weapon"],
  ["R", "Scholar's Robe", "rare", 1, "armor"],
  ["W", "Runed Warhammer", "epic", 1, "weapon"],
  ["T", "Tiger Mount", "epic", 1, "mount"],
  ["C", "Crown of Flow", "legendary", 1, "helmet"],
  ["L", "Lion of Resolve", "legendary", 1, "mount"],
  ["E", "Eye of Eternity", "mythic", 1, "helmet"],
  ["A", "Astral Dragon", "mythic", 1, "mount"],

  ["C", "Copper Coin", "common", 1, "none"],
  ["S", "Scroll of Focus", "common", 1, "none"],
  ["C", "Candle of Clarity", "common", 1, "none"],
  ["H", "Calming Herb", "uncommon", 1, "none"],
  ["M", "Mana Potion", "uncommon", 1, "none"],
  ["G", "Golden Apple", "uncommon", 1, "none"],
  ["O", "Seer's Orb", "rare", 1, "none"],
  ["R", "Targeter's Ring", "epic", 1, "accessory"],
  ["A", "Amulet of Drive", "epic", 1, "accessory"],
  ["K", "Key of Worlds", "legendary", 1, "accessory"],
  ["S", "Focus Stone", "common", 1, "none"],
  ["T", "Focus Tonic", "uncommon", 1, "none"],
  ["P", "Pathfinder's Compass", "epic", 1, "accessory"],
  ["T", "Calm Tea", "common", 1, "none"],
  ["D", "Energy Draught", "uncommon", 1, "none"],
  ["M", "Hearty Mead", "uncommon", 1, "none"],
  ["V", "Frost Vial", "rare", 1, "none"],
  ["H", "Hamsa Charm", "legendary", 1, "accessory"],
  ["F", "Focus Reliquary", "legendary", 1, "accessory"],
  ["L", "Luck Prism", "mythic", 1, "accessory"],
  ["S", "Syncfinder Compass", "epic", 1, "accessory"],
  ["M", "Mystery Locket", "rare", 1, "accessory"],
  ["F", "Festival Charm", "epic", 1, "none"],
  ["C", "Cosmic Fragment", "mythic", 1, "none"],
  ["T", "Timekeeper's Spark", "mythic", 1, "none"]
];

const WD_KEYS = [
  { id: "key_brass", name: "Brass Key", tier: "common", chestTier: "common" },
  { id: "key_iron", name: "Iron Key", tier: "common", chestTier: "uncommon" },
  { id: "key_silver", name: "Silver Key", tier: "uncommon", chestTier: "rare" },
  { id: "key_gold", name: "Gold Key", tier: "rare", chestTier: "epic" },
  { id: "key_platinum", name: "Platinum Key", tier: "epic", chestTier: "legendary" },
  { id: "key_void", name: "Voidsteel Key", tier: "legendary", chestTier: "mythic" },
  { id: "key_artifact", name: "First Key", tier: "artifact", chestTier: "artifact" }
];

const WD_REAGENTS = [
  { id: "reag_moss", name: "Glowmoss", tier: "common" },
  { id: "reag_petal", name: "Rose Petal", tier: "common" },
  { id: "reag_root", name: "Spindleroot", tier: "common" },
  { id: "reag_feather", name: "Hawk Feather", tier: "uncommon" },
  { id: "reag_fang", name: "Wolf Fang", tier: "uncommon" },
  { id: "reag_scale_drk", name: "Drake Scale", tier: "rare" },
  { id: "reag_eye_newt", name: "Newt Eye", tier: "rare" },
  { id: "reag_blood_orc", name: "Orc Blood", tier: "rare" },
  { id: "reag_horn_uni", name: "Unicorn Horn", tier: "epic" },
  { id: "reag_heart_drk", name: "Dragon Heart", tier: "legendary" },
  { id: "reag_dust_star", name: "Stardust", tier: "epic" },
  { id: "reag_essence_v", name: "Void Essence", tier: "mythic" }
];

const LR_AFFIX_DEFS = Object.fromEntries([
  "xpPct", "coinPct", "energySave", "critPct", "dmgFire", "dmgFrost",
  "dmgPoison", "dmgArcane", "resPhys", "resElem", "dodgePct", "lifesteal"
].map((id, index) => [id, {
  label: id,
  minor: [1 + (index % 2), 3 + (index % 2)],
  major: [4 + (index % 2), 7 + (index % 2)],
  grand: [8 + (index % 2), 12 + (index % 2)]
}]));

function slug(row) {
  return String(row[1]).toLowerCase().replace(/['’]/g, "_").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function loadModule(overrides = {}) {
  const context = {
    console,
    Math,
    JSON,
    Object,
    Array,
    Number,
    String,
    Set,
    Map,
    globalThis: null,
    LOOT_TABLE,
    EQUIP_SLOTS: ["weapon", "helmet", "armor", "mount", "pet"],
    lootId: slug,
    LR_AFFIX_DEFS,
    LR_RARITY_CAPS: {
      common: { affixes: 1, sockets: 0 },
      uncommon: { affixes: 1, sockets: 0 },
      rare: { affixes: 2, sockets: 1 },
      epic: { affixes: 2, sockets: 2 },
      legendary: { affixes: 3, sockets: 2 },
      mythic: { affixes: 3, sockets: 3 }
    },
    LR_REROLL_DUST: {
      common: 5, uncommon: 10, rare: 25, epic: 60, legendary: 150, mythic: 400
    },
    WD_KEYS,
    WD_REAGENTS,
    WD_RELICS: [
      { id: "relic_lantern", name: "Wayfinder Lantern", tier: "common", effect: { xpPct: 3 } },
      { id: "relic_anchor_void", name: "Void Anchor", tier: "epic", effect: { resPhys: 8, resElem: 8 } },
      { id: "relic_heart_phoenix", name: "Phoenix Heart", tier: "legendary", effect: { lifesteal: 6 } },
      { id: "relic_doomwhisper", name: "Doomwhisper Token", tier: "cursed", effect: { xpPct: 40, energyPenalty: 5 } },
      { id: "relic_artifact_first", name: "The First Spark", tier: "artifact", effect: { xpPct: 50 } }
    ],
    WD_CHARMS: [
      { id: "charm_clover", name: "Four-Leaf Clover", tier: "uncommon", effect: { luckPct: 5 } },
      { id: "charm_evil_eye", name: "Evil Eye", tier: "rare", effect: { resElem: 6 } },
      { id: "charm_focus_bead", name: "Focus Bead", tier: "epic", effect: { xpPct: 8 } }
    ],
    WD_RUNES: [{ id: "rune_ansuz", name: "Ansuz", tier: "common", effect: { xpPct: 3 } }],
    WD_TOMES: [{ id: "tome_focus_basic", name: "Tome of Focus I", tier: "common" }],
    WD_GEMS: [{ id: "gem_ruby_v85", name: "Ruby", tier: "common" }],
    WD_MAPS: [{ id: "map_frostpeak", name: "Map: Frostpeak", tier: "uncommon" }],
    WD_TROPHIES: [{ id: "trophy_slime_king", name: "Slime Crown", tier: "rare" }],
    WD_ARTIFACTS: [{ id: "art_first_spark", name: "The First Spark", tier: "artifact" }]
  };
  Object.assign(context, overrides);
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "loot-purpose-actions.js" });
  return context;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function keyState(keyId, count = 1) {
  return {
    totalFocusMin: 60_000,
    xp: 1234,
    coins: 5678,
    history: { "2026-07-24": 90 },
    lootOwned: { [keyId]: count },
    lootInstances: {},
    loot: {
      drops: [],
      materials: { dust: 1000, shards: 0, essence: 0 },
      loadout: { slot1: "cons_heal_small", slot2: null, slot3: null },
      loadoutUpdatedAt: 10
    },
    world: { questCounters: {} }
  };
}

test("currently obtainable inert loot and World shop items all have bounded active purposes", () => {
  const app = loadModule();
  const audit = app.fhLootPurposeAudit();
  const expectedLegacy = [
    "copper_coin", "scroll_of_focus", "candle_of_clarity", "calming_herb",
    "mana_potion", "golden_apple", "seer_s_orb",
    "targeter_s_ring", "amulet_of_drive", "key_of_worlds",
    "focus_stone", "focus_tonic", "pathfinder_s_compass",
    "calm_tea", "energy_draught", "hearty_mead", "frost_vial",
    "hamsa_charm", "focus_reliquary", "luck_prism", "syncfinder_compass",
    "mystery_locket", "festival_charm", "cosmic_fragment", "timekeeper_s_spark"
  ];

  assert.equal(audit.deadEnds.length, 0);
  assert.ok(audit.active.length > 0);
  assert.ok(audit.active.every(entry => entry.supported && entry.status === "active" && entry.action));
  for (const id of expectedLegacy) {
    const entry = app.fhLootPurposeClassify(id);
    assert.equal(entry.supported, true, `${id} should be supported`);
    assert.ok(["utility_loadout", "open_key_chest"].includes(entry.action), `${id} needs a real action`);
  }
  for (const key of WD_KEYS.filter(item => item.tier !== "artifact")) {
    assert.equal(app.fhLootPurposeClassify(key.id).action, "open_key_chest");
  }
  for (const reagent of WD_REAGENTS) {
    const entry = app.fhLootPurposeClassify(reagent.id);
    assert.equal(entry.action, "reforge_affix");
    assert.equal(entry.reusableUnlock, true);
    assert.ok(LR_AFFIX_DEFS[entry.affixId], `${reagent.id} maps to an existing affix`);
  }
  assert.equal(app.fhLootPurposeClassify("relic_lantern").action, "utility_loadout");
  assert.equal(app.fhLootPurposeClassify("charm_clover").action, "utility_loadout");
  assert.equal(app.fhLootPurposeIsUsable("relic_lantern"), true);
  assert.equal(app.fhLootPurposeIsUsable("relic_doomwhisper"), false);
  assert.equal(app.fhLootPurposeClassify("relic_doomwhisper").status, "unsupported");

  for (const id of [
    "rune_ansuz", "tome_focus_basic", "gem_ruby_v85", "map_frostpeak",
    "trophy_slime_king", "art_first_spark", "key_artifact", "relic_artifact_first"
  ]) {
    const entry = app.fhLootPurposeClassify(id);
    assert.equal(entry.status, "dormant", `${id} stays dormant`);
    assert.equal(entry.supported, false);
    assert.equal(entry.action, null);
  }

  for (const entry of audit.active.filter(item => item.action === "utility_loadout")) {
    const serialized = JSON.stringify(entry.effect);
    assert.doesNotMatch(serialized, /xpPct|coinPct|minutes|passive/i);
    assert.ok(
      Object.keys(entry.effect.combat).length ||
      entry.effect.loot.qualityBiasPct ||
      entry.effect.farm.harvestYieldPct,
      `${entry.id} exposes a bounded utility`
    );
  }
});

test("all 24 currently rollable non-active-slot templates are covered by a usable action", () => {
  const app = loadModule({ LOOT_TABLE: ACTUAL_LOOT_TABLE });
  const activeSlots = new Set(["weapon", "helmet", "armor", "mount", "pet"]);
  const nonActive = ACTUAL_LOOT_TABLE.filter(row => !activeSlots.has(row[4]));
  assert.equal(nonActive.length, 24, "coverage target must move deliberately if the canonical catalog changes");
  for (const row of nonActive) {
    const id = slug(row);
    const entry = app.fhLootPurposeClassify(id);
    assert.equal(entry.supported, true, `${id} must not remain inert`);
    assert.equal(app.fhLootPurposeIsUsable(id), true, `${id} must expose a proven action`);
    assert.ok(entry.action, `${id} needs an action`);
  }
});

test("key chests use owned-minus-used availability and converge on deterministic rewards", () => {
  const app = loadModule();
  const base = keyState("key_gold", 2);
  const left = clone(base);
  const right = clone(base);
  const leftBeforeAuthority = {
    totalFocusMin: left.totalFocusMin,
    xp: left.xp,
    coins: left.coins,
    history: clone(left.history)
  };

  const leftOpen = app.fhLootPurposeOpenKeyChest(left, "key_gold", { ordinal: 1, updatedAt: 1000 });
  const rightOpen = app.fhLootPurposeOpenKeyChest(right, "key_gold", { ordinal: 1, updatedAt: 1000 });

  assert.equal(leftOpen.ok, true);
  assert.equal(leftOpen.duplicate, false);
  assert.deepEqual(clone(leftOpen.plan), clone(rightOpen.plan));
  assert.deepEqual(clone(leftOpen.instance), clone(rightOpen.instance));
  assert.deepEqual(left, right, "two branches opening the same ordinal converge byte-for-byte");
  assert.equal(leftOpen.plan.rewardTier, "epic");
  assert.ok(["weapon", "helmet", "armor", "mount", "pet"].includes(leftOpen.plan.itemSlot));
  assert.equal(left.world.questCounters.key_used_key_gold, 1);
  assert.equal(left.lootOwned.key_gold, 2, "keys are availability tokens, not decremented counters");
  assert.equal(app.fhLootPurposeKeyAvailability(left, "key_gold").available, 1);
  assert.deepEqual({
    totalFocusMin: left.totalFocusMin,
    xp: left.xp,
    coins: left.coins,
    history: left.history
  }, leftBeforeAuthority);

  const retryBefore = JSON.stringify(left);
  const retry = app.fhLootPurposeOpenKeyChest(left, "key_gold", { ordinal: 1, updatedAt: 1000 });
  assert.equal(retry.ok, true);
  assert.equal(retry.duplicate, true);
  assert.equal(retry.committed, false);
  assert.equal(JSON.stringify(left), retryBefore, "retrying an ordinal cannot mint or charge twice");

  const second = app.fhLootPurposeOpenKeyChest(left, "key_gold", { ordinal: 2, updatedAt: 1001 });
  assert.equal(second.ok, true);
  assert.notEqual(second.plan.rewardId, leftOpen.plan.rewardId);
  assert.notEqual(second.plan.instanceId, leftOpen.plan.instanceId);
  assert.equal(left.world.questCounters.key_used_key_gold, 2);
  assert.equal(app.fhLootPurposeKeyAvailability(left, "key_gold").available, 0);
  const exhaustedBefore = JSON.stringify(left);
  const exhausted = app.fhLootPurposeOpenKeyChest(left, "key_gold", { ordinal: 3 });
  assert.equal(exhausted.ok, false);
  assert.equal(exhausted.reason, "no_available_key");
  assert.equal(JSON.stringify(left), exhaustedBefore);
});

test("every active key tier plans an exact-tier active-equippable deterministic reward", () => {
  const app = loadModule();
  for (const key of WD_KEYS.filter(item => item.tier !== "artifact")) {
    const state = keyState(key.id, 1);
    const a = app.fhLootPurposePlanKeyChest(state, key.id, { ordinal: 1 });
    const b = app.fhLootPurposePlanKeyChest(clone(state), key.id, { ordinal: 1 });
    assert.equal(a.ok, true, key.id);
    assert.deepEqual(clone(a), clone(b), `${key.id} plan is deterministic`);
    assert.equal(a.rewardTier, key.chestTier);
    assert.ok(["weapon", "helmet", "armor", "mount", "pet"].includes(a.itemSlot));
  }
  const worldKey = keyState("key_of_worlds", 1);
  const worldPlan = app.fhLootPurposePlanKeyChest(worldKey, "key_of_worlds", { ordinal: 1 });
  assert.equal(worldPlan.ok, true);
  assert.equal(worldPlan.rewardTier, "legendary");
});

test("reagent reforge is deterministic, dust-funded, reusable, idempotent, and monotonic", () => {
  const app = loadModule();
  const base = keyState("reag_dust_star", 1);
  base.lootInstances.gear_1 = {
    iid: "gear_1",
    lootId: "runed_warhammer",
    tier: "epic",
    level: 2,
    updatedAt: 50,
    affixes: [
      { id: "xpPct", tier: "major", value: 6, fixed: true },
      { id: "coinPct", tier: "major", value: 5, fixed: false }
    ]
  };
  const left = clone(base);
  const right = clone(base);
  const beforeAuthority = {
    totalFocusMin: left.totalFocusMin,
    xp: left.xp,
    coins: left.coins,
    history: clone(left.history)
  };

  const a = app.fhLootPurposeReforgeAffix(
    left, "gear_1", 1, "reag_dust_star",
    { operationId: "user-reforge-1", updatedAt: 75 }
  );
  const b = app.fhLootPurposeReforgeAffix(
    right, "gear_1", 1, "reag_dust_star",
    { operationId: "user-reforge-1", updatedAt: 75 }
  );

  assert.equal(a.ok, true);
  assert.equal(a.costPaid, 60);
  assert.equal(a.reagentConsumed, 0);
  assert.equal(left.loot.materials.dust, 940);
  assert.equal(left.lootOwned.reag_dust_star, 1);
  assert.equal(left.lootInstances.gear_1.updatedAt, 75);
  assert.ok(LR_AFFIX_DEFS[a.after.id]);
  assert.equal(a.after.tier, "major");
  assert.equal(a.after.fixed, false);
  assert.deepEqual(clone(a.after), clone(b.after));
  assert.deepEqual(left, right);
  assert.deepEqual({
    totalFocusMin: left.totalFocusMin,
    xp: left.xp,
    coins: left.coins,
    history: left.history
  }, beforeAuthority);

  const retryBefore = JSON.stringify(left);
  const retry = app.fhLootPurposeReforgeAffix(
    left, "gear_1", 1, "reag_dust_star",
    { operationId: "user-reforge-1", updatedAt: 80 }
  );
  assert.equal(retry.ok, true);
  assert.equal(retry.duplicate, true);
  assert.equal(retry.costPaid, 0);
  assert.equal(JSON.stringify(left), retryBefore);

  const fixedBefore = JSON.stringify(left);
  const fixed = app.fhLootPurposeReforgeAffix(left, "gear_1", 0, "reag_dust_star", { operationId: "fixed" });
  assert.equal(fixed.ok, false);
  assert.equal(fixed.reason, "fixed_affix");
  assert.equal(JSON.stringify(left), fixedBefore);

  const poor = clone(base);
  poor.loot.materials.dust = 59;
  const insufficient = app.fhLootPurposeReforgeAffix(poor, "gear_1", 1, "reag_dust_star", { operationId: "poor" });
  assert.equal(insufficient.ok, false);
  assert.equal(insufficient.reason, "insufficient_dust");
  assert.equal(poor.loot.materials.dust, 59);

  const lockedRecipe = clone(base);
  lockedRecipe.lootOwned.reag_dust_star = 0;
  const noReagent = app.fhLootPurposeReforgeAffix(lockedRecipe, "gear_1", 1, "reag_dust_star", { operationId: "locked" });
  assert.equal(noReagent.ok, false);
  assert.equal(noReagent.reason, "reagent_recipe_locked");
});

test("utility loadout reuses its existing merge field, validates ownership, and applies only bounded action utility", () => {
  const app = loadModule();
  const state = keyState("unused", 0);
  state.lootOwned = {
    charm_clover: 1,
    relic_anchor_void: 1,
    cosmic_fragment: 1,
    hamsa_charm: 1
  };
  const authorityBefore = {
    totalFocusMin: state.totalFocusMin,
    xp: state.xp,
    coins: state.coins,
    history: clone(state.history)
  };

  const charm = app.fhLootPurposeSetLoadout(state, "charm", "charm_clover", { updatedAt: 20 });
  const relic1 = app.fhLootPurposeSetLoadout(state, "relic1", "relic_anchor_void", { updatedAt: 21 });
  const relic2 = app.fhLootPurposeSetLoadout(state, "relic2", "cosmic_fragment", { updatedAt: 22 });
  assert.equal(charm.ok && relic1.ok && relic2.ok, true);
  assert.equal(state.loot.loadout.slot1, "cons_heal_small", "existing consumable slots survive");
  assert.deepEqual(
    {
      charm: state.loot.loadout.charm,
      relic1: state.loot.loadout.relic1,
      relic2: state.loot.loadout.relic2,
      updatedAt: state.loot.loadoutUpdatedAt
    },
    {
      charm: "charm_clover",
      relic1: "relic_anchor_void",
      relic2: "cosmic_fragment",
      updatedAt: 22
    }
  );

  const wrongKind = app.fhLootPurposeSetLoadout(state, "charm", "relic_anchor_void");
  assert.equal(wrongKind.ok, false);
  assert.equal(wrongKind.reason, "wrong_loadout_kind");
  const notOwned = app.fhLootPurposeSetLoadout(state, "relic1", "focus_reliquary");
  assert.equal(notOwned.ok, false);
  assert.equal(notOwned.reason, "item_not_owned");
  const duplicateBefore = JSON.stringify(state);
  const duplicate = app.fhLootPurposeSetLoadout(state, "relic2", "cosmic_fragment", { updatedAt: 999 });
  assert.equal(duplicate.duplicate, true);
  assert.equal(JSON.stringify(state), duplicateBefore);

  const utility = app.fhLootPurposeComputeUtility(state);
  assert.ok(utility.combat.resPhys > 0);
  assert.ok(utility.combat.dmgArcane > 0);
  assert.ok(utility.loot.qualityBiasPct > 0);
  assert.ok(utility.combat.resPhys <= app.FH_LOOT_PURPOSE.UTILITY_CAPS.combat.resPhys);
  assert.ok(utility.loot.qualityBiasPct <= app.FH_LOOT_PURPOSE.UTILITY_CAPS.loot.qualityBiasPct);
  assert.deepEqual(clone(utility.safety), {
    changesMinutes: false,
    changesHistoricalXp: false,
    changesHistoricalCoins: false,
    addsPassiveRewards: false
  });

  const baseCombat = { resPhys: 5, dmgArcane: 2 };
  const combatBefore = JSON.stringify(baseCombat);
  const combat = app.fhLootPurposeApplyCombatStats(baseCombat, state);
  assert.equal(JSON.stringify(baseCombat), combatBefore);
  assert.ok(combat.resPhys > baseCombat.resPhys);
  assert.ok(combat.dmgArcane > baseCombat.dmgArcane);

  const weights = { common: 0.55, uncommon: 0.25, rare: 0.15, epic: 0.05, legendary: 0, mythic: 0 };
  const weightsBefore = JSON.stringify(weights);
  const adjusted = app.fhLootPurposeAdjustRarityWeights(weights, state);
  assert.equal(JSON.stringify(weights), weightsBefore);
  assert.equal(adjusted.weights.legendary, 0, "a zero minute-gated tier remains unavailable");
  assert.equal(adjusted.weights.mythic, 0, "a zero minute-gated tier remains unavailable");
  assert.ok(Math.abs(Object.values(adjusted.weights).reduce((a, b) => a + b, 0) - 1) < 1e-12);

  const harvestBase = { herb: 10, ore: 0 };
  const harvestBefore = JSON.stringify(harvestBase);
  const harvest = app.fhLootPurposeApplyHarvestYield(harvestBase, state);
  assert.equal(JSON.stringify(harvestBase), harvestBefore);
  assert.equal(harvest.yield.ore, 0, "utility cannot mint a material absent from the harvest");
  assert.ok(harvest.yield.herb >= harvestBase.herb);
  assert.deepEqual({
    totalFocusMin: state.totalFocusMin,
    xp: state.xp,
    coins: state.coins,
    history: state.history
  }, authorityBefore);
});

test("module contains no random, clock, storage, network, save, or historical-time authority", () => {
  assert.doesNotMatch(source, /Math\.random|Date\.now|localStorage|sessionStorage|indexedDB|fetch\s*\(|saveState\s*\(/);
  assert.doesNotMatch(source, /\btotalFocusMin\b|\bsessionsLog\b|\bsessionHistory\b/);
  assert.match(source, /key_used_/);
  assert.match(source, /loot\.loadoutUpdatedAt/);
  assert.match(source, /reagentConsumed:\s*0/);
});
