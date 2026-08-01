import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";

const lootSource = await fs.readFile(new URL("../loot-rework.js", import.meta.url), "utf8");
const indexSource = await fs.readFile(new URL("../index.html", import.meta.url), "utf8");
const mirrorSource = await fs.readFile(new URL("../focus-hero.html", import.meta.url), "utf8");

function makeState(overrides = {}) {
  return {
    coins: 1000,
    coinsSpent: 0,
    lootInstances: {},
    loot: {
      drops: [],
      pity: {},
      materials: { dust: 1000, shards: 1000, essence: 0 },
      dyesOwned: { dye_crimson: 1 },
      gemsOwned: { gem_fire: 1 },
      consumables: {},
      loadout: { slot1: null, slot2: null, slot3: null },
      loadoutUpdatedAt: 0
    },
    hero: { equipped: { weapon: null, helmet: null, armor: null, mount: null, pet: null } },
    ...overrides
  };
}

function loadLoot(state = makeState(), startAt = 1_725_000_000_000, inspectorHost = null) {
  let clock = startAt;
  let uidCounter = 0;
  const table = [
    ["B", "Test Blade", "rare", 1, "weapon", "test_blade"],
    ["C", "Copper Coin", "rare", 1, "none", "copper_coin"]
  ];
  const window = {
    state,
    LOOT_TABLE: table,
    EQUIP_SLOTS: ["weapon", "helmet", "armor", "mount", "pet"],
    lootId(item) { return item[5]; },
    lootById(id) { return table.find(item => item[5] === id) || null; },
    lootSlot(item) { return item[4]; },
    isEquippableSlot(slot) { return this.EQUIP_SLOTS.includes(slot); },
    allowedRaritiesForMinutes() { return new Set(["common", "uncommon", "rare", "epic", "legendary", "mythic"]); },
    now() { clock += 1; return clock; },
    uid() { uidCounter += 1; return `iid-${uidCounter}`; },
    saveState() {},
    toast() {},
    escapeHtml(value) { return String(value); },
    deepClone(value) { return JSON.parse(JSON.stringify(value)); },
    recordEncounter() {}
  };
  const document = {
    readyState: "loading",
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getElementById(id) { return id === "loot-inspector-body" ? inspectorHost : null; },
    createElement() {
      return {
        style: {},
        dataset: {},
        appendChild() {},
        setAttribute() {},
        addEventListener() {},
        querySelector() { return null; },
        querySelectorAll() { return []; }
      };
    }
  };
  const sandbox = {
    window,
    document,
    console: { warn() {}, info() {}, log() {}, error() {} },
    setTimeout() { return 1; },
    clearTimeout() {},
    setInterval() { return 1; },
    clearInterval() {}
  };
  vm.runInNewContext(lootSource, sandbox, { filename: "loot-rework.js" });
  return { window, state, now: () => clock };
}

function extractMergeHelpers(source = indexSource) {
  const start = source.indexOf("function chooseLootInstanceForMerge");
  const end = source.indexOf("\n\nfunction mergeRemoteState", start);
  assert.ok(start >= 0 && end > start, "loot merge helpers must remain standalone");
  const helperSource = source.slice(start, end);
  const sandbox = {};
  vm.runInNewContext(`${helperSource}
globalThis.helpers = {
  chooseLootInstanceForMerge,
  mergeLootInstanceTombstonesForMerge,
  lootInstanceTimestampForMerge,
  lootInstanceSurvivesTombstone,
  chooseLiveLootInstanceForMerge,
  chooseLootLoadoutForMerge,
  clearEquippedInstanceReferenceForMerge,
  raiseLootOwnedForSurvivingInstances
};`, sandbox);
  return { helpers: sandbox.helpers, helperSource };
}

test("minting and every mutable instance action stamp an untruncated updatedAt", () => {
  const { window, state, now } = loadLoot();
  window.lrEnsureShape(state);
  assert.deepEqual(
    JSON.parse(JSON.stringify(state.loot.instanceTombstones)),
    {},
    "shape creation must add a tombstone map"
  );

  const minted = window.lrMintInstance(window.LOOT_TABLE[0], { rng: () => 0.25 });
  assert.equal(minted.updatedAt, minted.createdAt);
  assert.ok(minted.createdAt > 1_700_000_000_000);

  state.lootInstances["mutable-iid"] = {
    iid: "mutable-iid",
    lootId: "test_blade",
    tier: "rare",
    level: 0,
    affixes: [{ id: "xpPct", tier: "minor", value: 2, fixed: false }],
    sockets: [{ gemId: null }],
    dyeId: null,
    locked: false,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000
  };
  const inst = state.lootInstances["mutable-iid"];

  assert.equal(window.lrRerollAffix(state, inst.iid, 0, { rng: () => 0.5 }).ok, true);
  const rerolledAt = inst.updatedAt;
  assert.equal(rerolledAt, now());

  assert.equal(window.lrUpgradeInstance(state, inst.iid).ok, true);
  assert.ok(inst.updatedAt > rerolledAt);
  const upgradedAt = inst.updatedAt;

  assert.equal(window.lrSocketGem(state, inst.iid, 0, "gem_fire").ok, true);
  assert.ok(inst.updatedAt > upgradedAt);
  const socketedAt = inst.updatedAt;

  assert.equal(window.lrUnsocketGem(state, inst.iid, 0).ok, true);
  assert.ok(inst.updatedAt > socketedAt);
  const unsocketedAt = inst.updatedAt;

  assert.equal(window.lrApplyDye(state, inst.iid, "dye_crimson").ok, true);
  assert.ok(inst.updatedAt > unsocketedAt);
  const dyedAt = inst.updatedAt;

  assert.equal(window.lrToggleLock(state, inst.iid).ok, true);
  assert.ok(inst.updatedAt > dyedAt);
});

test("Forge rejects non-equippable instances before mutation and renders them read-only", () => {
  const host = {
    innerHTML: "",
    querySelectorAll() { return []; },
    querySelector() { return null; }
  };
  const state = makeState();
  state.lootInstances.collection = {
    iid: "collection",
    lootId: "copper_coin",
    tier: "rare",
    level: 0,
    affixes: [{ id: "xpPct", tier: "minor", value: 2, fixed: false }],
    sockets: [{ gemId: "gem_fire" }],
    dyeId: null,
    locked: false,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000
  };
  const { window } = loadLoot(state, 1_725_000_000_000, host);
  window.lrEnsureShape(state);
  let rerollRngCalls = 0;
  const attempts = [
    ["reroll", () => window.lrRerollAffix(state, "collection", 0, {
      rng() {
        rerollRngCalls += 1;
        return 0.5;
      }
    })],
    ["upgrade", () => window.lrUpgradeInstance(state, "collection")],
    ["socket", () => window.lrSocketGem(state, "collection", 0, "gem_fire")],
    ["unsocket", () => window.lrUnsocketGem(state, "collection", 0)],
    ["dye", () => window.lrApplyDye(state, "collection", "dye_crimson")]
  ];

  for (const [label, attempt] of attempts) {
    const before = JSON.stringify(state);
    const result = attempt();
    assert.equal(result.ok, false, `${label} must be rejected`);
    assert.equal(result.reason, "unsupported_slot", `${label} must report its slot contract`);
    assert.equal(result.slot, "none", `${label} must identify the unsupported slot`);
    assert.equal(JSON.stringify(state), before, `${label} must not spend or mutate anything`);
  }
  assert.equal(rerollRngCalls, 0, "unsupported rerolls must stop before rolling a replacement affix");

  window.renderLootInspector("collection");
  assert.match(host.innerHTML, /Collection \/ purpose item/);
  assert.doesNotMatch(host.innerHTML, /data-lr-(?:reroll|upgrade|socket|unsocket|dye)/);
  assert.match(host.innerHTML, /data-lr-lock/);
  assert.match(host.innerHTML, /data-lr-salvage/);
});

test("equippable inspector retains Forge mutation controls", () => {
  const host = {
    innerHTML: "",
    querySelectorAll() { return []; },
    querySelector() { return null; }
  };
  const state = makeState();
  state.lootInstances.blade = {
    iid: "blade",
    lootId: "test_blade",
    tier: "rare",
    level: 0,
    affixes: [{ id: "xpPct", tier: "minor", value: 2, fixed: false }],
    sockets: [{ gemId: null }],
    dyeId: null,
    locked: false,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000
  };
  const { window } = loadLoot(state, 1_725_000_000_000, host);

  window.renderLootInspector("blade");
  assert.match(host.innerHTML, /data-lr-reroll/);
  assert.match(host.innerHTML, /data-lr-upgrade/);
  assert.match(host.innerHTML, /data-lr-socket/);
  assert.match(host.innerHTML, /data-lr-dye/);
});

test("salvage tombstone blocks stale inventory or vault resurrection", () => {
  const state = makeState();
  state.lootInstances.stale = {
    iid: "stale",
    lootId: "test_blade",
    tier: "rare",
    level: 2,
    affixes: [],
    sockets: [],
    locked: false,
    createdAt: 1_725_000_000_010,
    updatedAt: 1_725_000_000_020
  };
  state.hero.equipped.weapon = { lootId: "test_blade", instanceId: "stale", tier: "rare" };
  const staleRemoteCopy = JSON.parse(JSON.stringify(state.lootInstances.stale));
  const { window } = loadLoot(state, 1_725_000_001_000);
  const result = window.lrSalvageInstance(state, "stale");

  assert.equal(result.ok, true);
  assert.equal(state.lootInstances.stale, undefined);
  assert.equal(state.hero.equipped.weapon, null);
  assert.ok(state.loot.instanceTombstones.stale > staleRemoteCopy.updatedAt);

  const { helpers } = extractMergeHelpers();
  const mergedTombstones = helpers.mergeLootInstanceTombstonesForMerge(
    state.loot.instanceTombstones,
    { stale: staleRemoteCopy.updatedAt }
  );
  const fromStaleInventory = helpers.chooseLiveLootInstanceForMerge(
    "stale",
    [staleRemoteCopy],
    mergedTombstones
  );
  const fromStaleVault = helpers.chooseLiveLootInstanceForMerge(
    "stale",
    [null, staleRemoteCopy],
    mergedTombstones
  );
  assert.equal(fromStaleInventory, null);
  assert.equal(fromStaleVault, null);
  assert.equal(mergedTombstones.stale, state.loot.instanceTombstones.stale);
});

test("salvage never lowers an existing later tombstone", () => {
  const existingDeletedAt = 1_725_000_009_000;
  const state = makeState();
  state.loot.instanceTombstones = { monotonic: existingDeletedAt };
  state.lootInstances.monotonic = {
    iid: "monotonic",
    lootId: "test_blade",
    tier: "common",
    level: 0,
    affixes: [],
    sockets: [],
    locked: false,
    createdAt: 1_725_000_000_010,
    updatedAt: 1_725_000_000_020
  };
  const { window } = loadLoot(state, 1_725_000_001_000);

  assert.equal(window.lrSalvageInstance(state, "monotonic").ok, true);
  assert.equal(state.loot.instanceTombstones.monotonic, existingDeletedAt);
});

test("a genuinely newer same-IID recreation survives an older tombstone", () => {
  const { helpers } = extractMergeHelpers();
  const tombstones = helpers.mergeLootInstanceTombstonesForMerge(
    { reborn: 1_725_000_010_000 },
    { reborn: 1_725_000_009_999 }
  );
  const stale = { iid: "reborn", level: 99, createdAt: 1_725_000_000_000, updatedAt: 1_725_000_009_000 };
  const recreated = { iid: "reborn", level: 1, createdAt: 1_725_000_010_001, updatedAt: 1_725_000_010_002 };

  assert.equal(helpers.lootInstanceSurvivesTombstone("reborn", stale, tombstones), false);
  assert.equal(helpers.lootInstanceSurvivesTombstone("reborn", recreated, tombstones), true);
  assert.equal(
    helpers.chooseLiveLootInstanceForMerge("reborn", [stale, recreated], tombstones).updatedAt,
    recreated.updatedAt
  );
});

test("same-IID edits merge by full updatedAt before legacy level fallback", () => {
  const { helpers } = extractMergeHelpers();
  const olderHighLevel = {
    iid: "edited",
    level: 50,
    createdAt: 1_725_000_000_000,
    updatedAt: 1_725_000_100_000,
    dyeId: "old"
  };
  const newerLowLevel = {
    iid: "edited",
    level: 1,
    createdAt: 1_725_000_000_000,
    updatedAt: 1_725_000_100_001,
    dyeId: "new"
  };
  assert.equal(helpers.chooseLootInstanceForMerge(olderHighLevel, newerLowLevel).dyeId, "new");
  assert.equal(
    helpers.chooseLiveLootInstanceForMerge("edited", [olderHighLevel, newerLowLevel], {}).dyeId,
    "new"
  );
});

test("equipped cleanup removes only the stale instance reference", () => {
  const { helpers } = extractMergeHelpers();
  const hero = {
    equipped: {
      weapon: { lootId: "test_blade", instanceId: "deleted-iid" },
      helmet: { lootId: "legacy_helmet" },
      armor: null
    }
  };
  const lootOwned = { test_blade: 4, legacy_helmet: 2 };

  assert.equal(helpers.clearEquippedInstanceReferenceForMerge(hero, "deleted-iid"), true);
  assert.equal(hero.equipped.weapon, null);
  assert.equal(hero.equipped.helmet.lootId, "legacy_helmet");
  assert.deepEqual(lootOwned, { test_blade: 4, legacy_helmet: 2 });
});

test("loadout ordering keeps real millisecond timestamps instead of 32-bit truncation", () => {
  const { helpers } = extractMergeHelpers();
  const localAt = 1_725_000_000_000;
  const remoteAt = localAt + 4_294_967_296;
  assert.equal(localAt | 0, remoteAt | 0, "fixture demonstrates the former 32-bit timestamp collision");

  const winner = helpers.chooseLootLoadoutForMerge(
    { loadout: { slot1: "local" }, loadoutUpdatedAt: localAt },
    { loadout: { slot1: "remote" }, loadoutUpdatedAt: remoteAt }
  );
  assert.equal(winner.loadout.slot1, "remote");
  assert.equal(winner.loadoutUpdatedAt, remoteAt);
});

test("surviving instances raise template ownership without lowering legacy counts", () => {
  const { helpers } = extractMergeHelpers();
  const owned = { same_template: 1, legacy_high: 7 };
  const inventory = {
    "iid-a": { iid: "iid-a", lootId: "same_template" },
    "iid-b": { iid: "iid-b", lootId: "same_template" },
    "iid-c": { iid: "iid-c", lootId: "legacy_high" }
  };
  const vault = {
    "iid-b": { iid: "iid-b", lootId: "same_template" },
    "iid-d": { iid: "iid-d", lootId: "vault_template" }
  };

  const result = helpers.raiseLootOwnedForSurvivingInstances(owned, inventory, vault);
  assert.equal(result, owned);
  assert.equal(owned.same_template, 2, "two distinct merged instances raise a max-merged count of one");
  assert.equal(owned.legacy_high, 7, "a larger historical template count is never decremented");
  assert.equal(owned.vault_template, 1);
});

test("both HTML mirrors carry identical tombstone-safe merge wiring", () => {
  assert.equal(indexSource, mirrorSource);
  assert.match(indexSource, /instanceTombstones:\s*deepClone\(__mergedInstanceTombstones\)/);
  assert.match(indexSource, /chooseLiveLootInstanceForMerge\(iid,\s*\[__lInst\[iid\], __rInst\[iid\]\]/);
  assert.match(indexSource, /clearEquippedInstanceReferenceForMerge\(out\.hero, iid\)/);
  assert.match(indexSource, /raiseLootOwnedForSurvivingInstances\(out\.lootOwned, out\.lootInstances, out\.loot\.vault\.instances\)/);
  assert.doesNotMatch(indexSource, /loadoutUpdatedAt\|0/);
});
