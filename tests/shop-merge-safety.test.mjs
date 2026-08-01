import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";

const shopSource = await fs.readFile(new URL("../shop-rework.js", import.meta.url), "utf8");
const indexSource = await fs.readFile(new URL("../index.html", import.meta.url), "utf8");
const mirrorSource = await fs.readFile(new URL("../focus-hero.html", import.meta.url), "utf8");

function makeState(overrides = {}) {
  return {
    coins: 1000,
    coinsSpent: 0,
    crystalShards: 500,
    crystalShardsSpent: 0,
    totalFocusMin: 321,
    completedFocusSessions: 12,
    lootOwned: {},
    sync: {
      enabled: true,
      syncCode: "identity-must-not-change",
      cloudRev: 17
    },
    ...overrides
  };
}

function loadShop(state = makeState()) {
  let saveCalls = 0;
  const window = {
    state,
    LOOT_TABLE: [
      ["B", "Ordinary Blade", "common", 0, "weapon", "ordinary_blade"],
      ["R", "Dormant Rune Blade", "rare", 0, "weapon", "rune_dormant"]
    ],
    lootId(item) { return item[5]; },
    isEquippableSlot(slot) { return slot === "weapon" || slot === "armor"; },
    GEAR_EFFECTS: {},
    STORE_CONSUMABLES: [
      { id: "cons_tea", name: "Focus Tea", sym: "T", price: 15, desc: "Ordinary consumable" }
    ],
    WD_RELICS: [
      { id: "relic_ready", name: "Ready Relic", sym: "R", tier: "rare", effect: { xpPct: 4 } },
      { id: "relic_cursed", name: "Dormant Curse", sym: "C", tier: "cursed", effect: { xpPct: 20 } }
    ],
    WD_CHARMS: [
      { id: "charm_ready", name: "Ready Charm", sym: "C", tier: "uncommon", effect: { luckPct: 2 } }
    ],
    WD_KEYS: [
      { id: "key_iron", name: "Iron Key", sym: "K", tier: "common", chestTier: "uncommon" }
    ],
    WD_REAGENTS: [
      { id: "reag_moss", name: "Glowmoss Recipe", sym: "M", tier: "common" }
    ],
    WD_RUNES: [{ id: "rune_dormant", name: "Dormant Rune", tier: "rare" }],
    WD_TOMES: [{ id: "tome_dormant", name: "Dormant Tome", tier: "rare" }],
    WD_GEMS: [{ id: "gem_dormant", name: "Dormant World Gem", tier: "rare" }],
    WD_MAPS: [{ id: "map_dormant", name: "Dormant Map", tier: "rare" }],
    WD_TROPHIES: [{ id: "trophy_dormant", name: "Dormant Trophy", tier: "rare" }],
    WD_ARTIFACTS: [{ id: "artifact_dormant", name: "Dormant Artifact", tier: "artifact" }],
    saveState() { saveCalls++; return true; }
  };
  const sandbox = {
    window,
    console: { warn() {} },
    setTimeout() { return 1; },
    clearTimeout() {}
  };
  vm.runInNewContext(shopSource, sandbox, { filename: "shop-rework.js" });
  return { window, state, getSaveCalls: () => saveCalls };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function extractMergePicker() {
  const start = indexSource.indexOf("function chooseLootInstanceForMerge");
  const end = indexSource.indexOf("\n\nfunction mergeRemoteState", start);
  assert.ok(start >= 0 && end > start, "merge picker must be a standalone pure helper");
  const functionSource = indexSource.slice(start, end);
  const sandbox = {};
  vm.runInNewContext(`${functionSource}\nglobalThis.pick = chooseLootInstanceForMerge;`, sandbox);
  return { pick: sandbox.pick, functionSource };
}

test("shop keeps dormant World catalogs out of ordinary and featured inventory", () => {
  const { window } = loadShop();
  const inventory = window.srBaseInventory();
  const ids = new Set(inventory.map(item => item.id));

  assert.ok(ids.has("gear_ordinary_blade"), "ordinary gear remains available");
  assert.ok(ids.has("cons_tea"), "ordinary consumables remain available");
  assert.ok(ids.has("key_iron"), "keys remain available");
  assert.ok(ids.has("reag_moss"), "reagent recipe remains available");

  for (const id of [
    "gear_rune_dormant",
    "rune_dormant",
    "tome_dormant",
    "gem_dormant",
    "map_dormant",
    "trophy_dormant",
    "artifact_dormant",
    "relic_ready",
    "relic_cursed",
    "charm_ready"
  ]) {
    assert.equal(ids.has(id), false, `${id} must be suppressed while its purpose is unusable`);
  }

  const featured = window.srFeaturedToday([
    ...inventory,
    { id: "rune_dormant", worldCatalog: "rune", rarity: "legendary", priceBase: 10 },
    { id: "artifact_dormant", worldCatalog: "artifact", rarity: "artifact", priceBase: 10 },
    { id: "relic_cursed", worldCatalog: "relic", slot: "relic", rarity: "cursed", priceBase: 10 }
  ]);
  assert.equal(featured.some(row => /dormant|cursed/.test(row.item.id)), false);
});

test("relics and charms surface only through an explicit true usability contract", () => {
  const { window } = loadShop();
  window.fhLootPurposeIsUsable = id => id === "relic_ready" || id === "charm_ready";
  const ids = new Set(window.srBaseInventory().map(item => item.id));

  assert.ok(ids.has("relic_ready"));
  assert.ok(ids.has("charm_ready"));
  assert.equal(ids.has("relic_cursed"), false, "cursed relic stays out unless explicitly usable");

  window.fhLootPurposeIsUsable = () => {
    throw new Error("purpose audit unavailable");
  };
  const failedClosed = new Set(window.srBaseInventory().map(item => item.id));
  assert.equal(failedClosed.has("relic_ready"), false);
  assert.equal(failedClosed.has("charm_ready"), false);
});

test("owned reagent recipes cannot charge twice while keys remain repeat-buyable", () => {
  const state = makeState({ lootOwned: { reag_moss: 1, key_iron: 2 } });
  const { window, getSaveCalls } = loadShop(state);
  const identityBefore = clone(state.sync);
  const accountingBefore = {
    coins: state.coins,
    coinsSpent: state.coinsSpent,
    totalFocusMin: state.totalFocusMin,
    sessions: state.completedFocusSessions
  };

  const recipeResult = window.srExecutePurchase({
    id: "reag_moss",
    slot: "reagent",
    category: "crafting",
    worldCatalog: "reagent",
    reagent: true,
    recipeUnlock: true
  }, 25, "coins");

  assert.equal(recipeResult.ok, false);
  assert.equal(recipeResult.reason, "recipe_already_unlocked");
  assert.equal(state.lootOwned.reag_moss, 1);
  assert.deepEqual(state.sync, identityBefore);
  assert.deepEqual({
    coins: state.coins,
    coinsSpent: state.coinsSpent,
    totalFocusMin: state.totalFocusMin,
    sessions: state.completedFocusSessions
  }, accountingBefore);
  assert.equal(getSaveCalls(), 0);

  const keyResult = window.srExecutePurchase({
    id: "key_iron",
    slot: "key",
    category: "special",
    worldCatalog: "key"
  }, 25, "coins");

  assert.equal(keyResult.ok, true);
  assert.equal(state.lootOwned.key_iron, 3);
  assert.equal(state.coins, 975);
  assert.equal(state.coinsSpent, 25);
  assert.deepEqual(state.sync, identityBefore, "purchase must not alter cloud identity");
  assert.equal(state.totalFocusMin, 321);
  assert.equal(state.completedFocusSessions, 12);
  assert.equal(getSaveCalls(), 1);
});

test("direct dormant purchase fails before accounting while ordinary shop still works", () => {
  const state = makeState();
  const { window, getSaveCalls } = loadShop(state);
  const before = clone(state);

  const dormantResult = window.srExecutePurchase({
    id: "map_dormant",
    worldCatalog: "map",
    category: "special"
  }, 200, "coins");
  assert.equal(dormantResult.ok, false);
  assert.equal(dormantResult.reason, "item_not_usable");
  assert.deepEqual(state, before);
  assert.equal(getSaveCalls(), 0);

  const ordinaryResult = window.srExecutePurchase({
    id: "gear_ordinary_blade",
    lootSlug: "ordinary_blade",
    slot: "weapon",
    category: "gear"
  }, 50, "coins");
  assert.equal(ordinaryResult.ok, true);
  assert.equal(state.lootOwned.ordinary_blade, 1);
  assert.equal(state.coins, 950);
  assert.equal(state.coinsSpent, 50);
  assert.deepEqual(state.sync, before.sync);
  assert.equal(state.totalFocusMin, before.totalFocusMin);
  assert.equal(state.completedFocusSessions, before.completedFocusSessions);
});

test("same-IID merge prefers updatedAt, then level only for absent or tied timestamps", () => {
  const { pick, functionSource } = extractMergePicker();
  const localNewerLower = { iid: "same", level: 1, updatedAt: 500, dyeId: "new" };
  const remoteOlderHigher = { iid: "same", level: 9, updatedAt: 400, dyeId: "old" };
  assert.equal(pick(localNewerLower, remoteOlderHigher), localNewerLower);
  assert.equal(pick(remoteOlderHigher, localNewerLower), localNewerLower);

  const stamped = { iid: "same", level: 0, updatedAt: 10 };
  const legacyHigh = { iid: "same", level: 20 };
  assert.equal(pick(legacyHigh, stamped), stamped, "a real timestamp beats a missing legacy timestamp");

  const legacyLow = { iid: "same", level: 2 };
  const legacyHigher = { iid: "same", level: 3 };
  assert.equal(pick(legacyLow, legacyHigher), legacyHigher);

  const tiedLow = { iid: "same", level: 4, updatedAt: 700 };
  const tiedHigh = { iid: "same", level: 5, updatedAt: 700 };
  assert.equal(pick(tiedLow, tiedHigh), tiedHigh);

  assert.doesNotMatch(functionSource, /coins|totalFocusMin|syncCode|cloudRev|syncSecret/);
  assert.match(indexSource, /chooseLiveLootInstanceForMerge\(iid, \[__lInst\[iid\], __rInst\[iid\]\]/);
  assert.match(functionSource, /return chooseLootInstanceForMerge\(best, item\)/);
});

test("entry mirrors remain byte-identical", () => {
  assert.equal(indexSource, mirrorSource);
});
