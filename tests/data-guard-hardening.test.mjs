import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "data-guard.js"), "utf8");
const storage = new Map();
const fakeRows = new Map();
let fakeStoreCreated = false;
const fakeDb = {
  objectStoreNames: { contains() { return fakeStoreCreated; } },
  createObjectStore() { fakeStoreCreated = true; },
  transaction() {
    const tx = {};
    const store = {
      openCursor() {
        const request = {};
        const values = Array.from(fakeRows.values()).map(value => clone(value));
        let index = 0;
        function emit() {
          if (index < values.length) {
            request.result = {
              value: values[index],
              continue() { index += 1; queueMicrotask(emit); }
            };
          } else {
            request.result = null;
          }
          request.onsuccess?.();
        }
        queueMicrotask(emit);
        return request;
      },
      put(value) {
        queueMicrotask(() => {
          fakeRows.set(value.date, clone(value));
          tx.oncomplete?.();
        });
      },
      delete(key) {
        queueMicrotask(() => {
          fakeRows.delete(key);
          tx.oncomplete?.();
        });
      }
    };
    tx.objectStore = () => store;
    return tx;
  },
  close() {}
};
const fakeIndexedDB = {
  open() {
    const request = { result: fakeDb, error: null };
    queueMicrotask(() => {
      if (!fakeStoreCreated) request.onupgradeneeded?.();
      request.onsuccess?.();
    });
    return request;
  }
};
const sandbox = {
  console,
  indexedDB: fakeIndexedDB,
  localStorage: {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); }
  },
  document: {
    hidden: false,
    addEventListener() {},
    getElementById() { return null; }
  },
  setTimeout() { return 1; },
  setInterval() { return 1; },
  addEventListener() {}
};
sandbox.window = sandbox;
vm.runInNewContext(source, sandbox, { filename: "data-guard.js" });
const guardApi = sandbox.__fhGuardTest;
assert.ok(guardApi, "data guard test API should install");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function protectedState() {
  return {
    dataVersion: 16,
    profileEpoch: "profile-epoch-a",
    totalFocusMin: 6000,
    hero: { level: 25 },
    history: { "2026-07-24": 6000 },
    sessionsLog: [{ id: "session-1" }],
    tasks: [{ id: "task-1" }],
    coinsEarned: 50000,
    coinsSpent: 21000,
    focusMilestones: { version: 1, claimedThrough: 3, announcedThrough: 3 },
    crystalShardsEarned: 80,
    crystalShardsSpent: 30,
    craftingDust: 15,
    world: {
      unlockedZones: { verdant_vale: true, ember_reach: true },
      zonesVisited: { verdant_vale: 10, ember_reach: 2 },
      bossesDefeated: 4,
      bossSessionRewards: { "boss-session-1": { reward: "chest" } },
      mysteryBoxesOpened: 3,
      artifactsFound: { "artifact-1": { foundAt: 100 } },
      questCounters: { travel: 7 }
    },
    questSystem: {
      dailyClaimedCount: 6,
      weeklyClaimedCount: 2,
      seasonalClaimedCount: 1
    },
    achievementsV85: { "achievement-1": true },
    eggs: {
      owned: [{ id: "egg-owned" }],
      incubating: [{ id: "egg-incubating" }],
      hatched: [{ id: "egg-hatched" }],
      quarantined: [{ id: "egg-quarantined" }]
    },
    lootInstances: {
      "iid-inventory": { id: "iid-inventory", createdAt: 100, updatedAt: 200 }
    },
    loot: {
      vault: {
        instances: {
          "iid-vault": { id: "iid-vault", createdAt: 110, updatedAt: 210 }
        }
      },
      instanceTombstones: { "iid-deleted-before": 220 },
      dropTombstones: { "drop-deleted-before": 230 }
    },
    sessionTombstones: { "session-deleted-before": 240 },
    focusEconomy: {
      version: 1,
      grants: {},
      spends: [],
      harvests: [],
      plots: [],
      unlockedPlots: 2
    }
  };
}

function reasonsFor(current, baseline = protectedState()) {
  return Array.from(guardApi.anomalyReasons(guardApi.summarize(current), guardApi.summarize(baseline)));
}

{
  const baseline = protectedState();
  const richer = clone(baseline);
  richer.totalFocusMin += 60;
  richer.coinsEarned += 100;
  richer.coinsSpent += 20;
  richer.focusMilestones.claimedThrough += 1;
  richer.focusMilestones.announcedThrough += 1;
  richer.crystalShardsEarned += 5;
  richer.crystalShardsSpent += 1;
  richer.craftingDust += 5;
  richer.world.zonesVisited.ember_reach += 1;
  richer.world.bossesDefeated += 1;
  richer.world.mysteryBoxesOpened += 1;
  richer.world.questCounters.travel += 1;
  richer.world.unlockedZones.sapphire_road = true;
  richer.world.artifactsFound["artifact-2"] = { foundAt: 300 };
  richer.eggs.incubating.push(richer.eggs.owned.shift());
  const inventoryItem = richer.lootInstances["iid-inventory"];
  delete richer.lootInstances["iid-inventory"];
  richer.loot.vault.instances["iid-inventory"] = inventoryItem;
  assert.deepEqual(reasonsFor(richer, baseline), []);
  assert.equal(
    guardApi.sameDayReplaceOk(guardApi.summarize(baseline), guardApi.summarize(richer)),
    true
  );
  assert.notEqual(
    guardApi.anomalyId("2026-07-24", guardApi.summarize(baseline)),
    guardApi.anomalyId("2026-07-24", guardApi.summarize(richer))
  );
}

{
  const state = protectedState();
  state.coinsEarned -= 1;
  assert.ok(reasonsFor(state).includes("coins-earned-rollback"));
}

{
  const state = protectedState();
  state.coinsSpent -= 1;
  assert.ok(reasonsFor(state).includes("coins-spent-rollback"));
}

{
  const state = protectedState();
  state.focusMilestones.claimedThrough -= 1;
  assert.ok(reasonsFor(state).includes("focus-milestone-rollback"));
}

{
  const state = protectedState();
  state.world.zonesVisited.ember_reach -= 1;
  assert.ok(reasonsFor(state).includes("world-counter-rollback"));
}

{
  const state = protectedState();
  delete state.world.unlockedZones.ember_reach;
  assert.ok(reasonsFor(state).includes("world-unlock-id-loss"));
}

{
  const state = protectedState();
  state.eggs.incubating = [];
  assert.ok(reasonsFor(state).includes("egg-id-loss"));
}

{
  const state = protectedState();
  const item = state.lootInstances["iid-inventory"];
  delete state.lootInstances["iid-inventory"];
  state.loot.vault.instances["iid-inventory"] = item;
  assert.equal(reasonsFor(state).includes("loot-instance-id-loss"), false);
}

{
  const state = protectedState();
  delete state.lootInstances["iid-inventory"];
  state.loot.instanceTombstones["iid-inventory"] = 201;
  assert.equal(reasonsFor(state).includes("loot-instance-id-loss"), false);
}

{
  const state = protectedState();
  delete state.lootInstances["iid-inventory"];
  state.loot.instanceTombstones["iid-inventory"] = 199;
  assert.ok(reasonsFor(state).includes("loot-instance-id-loss"));
}

{
  const state = protectedState();
  delete state.loot.instanceTombstones["iid-deleted-before"];
  assert.ok(reasonsFor(state).includes("loot-instance-tombstone-rollback"));
}

{
  const state = protectedState();
  delete state.loot.dropTombstones["drop-deleted-before"];
  assert.ok(reasonsFor(state).includes("loot-drop-tombstone-rollback"));
}

{
  const state = protectedState();
  delete state.sessionTombstones["session-deleted-before"];
  assert.ok(reasonsFor(state).includes("session-tombstone-rollback"));
}

{
  const baseline = protectedState();
  const deliberateNewProfile = clone(baseline);
  deliberateNewProfile.profileEpoch = { id: "profile-epoch-b", createdAt: 123, reason: "explicit-new-local-profile" };
  deliberateNewProfile.totalFocusMin = 300;
  deliberateNewProfile.sessionsLog = [];
  deliberateNewProfile.history = { "2026-07-24": 300 };
  deliberateNewProfile.loot.dropTombstones = {};
  deliberateNewProfile.sessionTombstones = {};
  assert.deepEqual(reasonsFor(deliberateNewProfile, baseline), []);
  assert.notEqual(
    guardApi.snapshotKeyFor("2026-07-24", guardApi.summarize(deliberateNewProfile)),
    guardApi.snapshotKeyFor("2026-07-24", guardApi.summarize(baseline))
  );

  const lostEpoch = clone(deliberateNewProfile);
  delete lostEpoch.profileEpoch;
  lostEpoch.totalFocusMin = 0;
  lostEpoch.history = {};
  assert.ok(reasonsFor(lostEpoch, deliberateNewProfile).includes("focus-minutes-regression"));

  const selected = guardApi.findAnomalousGuard([
    { date: "2026-07-23#old", savedAt: "2026-07-23T10:00:00.000Z", state: baseline },
    { date: "2026-07-24#new", savedAt: "2026-07-24T10:00:00.000Z", state: deliberateNewProfile }
  ], guardApi.summarize(lostEpoch));
  assert.equal(
    guardApi.summarize(selected.state).profileEpoch,
    "profile-epoch-b",
    "an epoch-loss alert must prefer the newest explicit profile lineage, not an older larger total"
  );
}

assert.equal(
  source.includes("verifiedRestore(localStorage, guard.state"),
  false,
  "guard overlay must never restore while live cloud workers may be running"
);
assert.ok(source.includes('location.href = "./recover.html"'));

assert.deepEqual(Array.from(guardApi.anomalyReasons(880, 1000)), []);
assert.deepEqual(Array.from(guardApi.anomalyReasons(879, 1000)), ["focus-minutes-regression"]);
assert.deepEqual(Array.from(guardApi.anomalyReasons(5700, 6000)), []);
assert.deepEqual(Array.from(guardApi.anomalyReasons(5699, 6000)), ["focus-minutes-regression"]);

{
  const baseline = protectedState();
  const state = clone(baseline);
  state.totalFocusMin += 10;
  delete state.world.artifactsFound["artifact-1"];
  const baselineSummary = guardApi.summarize(baseline);
  const currentSummary = guardApi.summarize(state);
  assert.ok(guardApi.anomalyReasons(currentSummary, baselineSummary).includes("world-unlock-id-loss"));
  assert.equal(guardApi.sameDayReplaceOk(baselineSummary, currentSummary), false);
}

{
  const MAIN = "focusHero.v4.state";
  const MIRROR = `${MAIN}.guard`;
  const baseline = protectedState();
  storage.set(MAIN, JSON.stringify(baseline));
  await guardApi.takeSnapshot("seed-protected-state");
  const mirrorBefore = storage.get(MIRROR);
  const rowsBefore = await guardApi.idbAll(await guardApi.openDb());
  assert.equal(rowsBefore.length, 1);

  const regressed = clone(baseline);
  regressed.totalFocusMin += 10;
  regressed.coinsEarned -= 1;
  delete regressed.world.unlockedZones.ember_reach;
  regressed.eggs.owned = [];
  delete regressed.lootInstances["iid-inventory"];
  storage.set(MAIN, JSON.stringify(regressed));
  await guardApi.takeSnapshot("blocked-monotonic-regression");
  const rowsAfter = await guardApi.idbAll(await guardApi.openDb());
  assert.equal(rowsAfter.length, 1);
  assert.deepEqual(rowsAfter[0].state, baseline);
  assert.equal(storage.get(MIRROR), mirrorBefore);

  fakeRows.clear();
  await guardApi.takeSnapshot("blocked-by-mirror-only");
  assert.equal(fakeRows.size, 0);
  assert.equal(storage.get(MIRROR), mirrorBefore);
}

{
  const MAIN = "focusHero.v4.state";
  storage.clear();
  fakeRows.clear();

  const olderLineage = protectedState();
  storage.set(MAIN, JSON.stringify(olderLineage));
  await guardApi.takeSnapshot("older-lineage");

  const currentLineage = protectedState();
  currentLineage.profileEpoch = { id: "profile-epoch-b", createdAt: 123, reason: "explicit-new-local-profile" };
  currentLineage.totalFocusMin = 300;
  currentLineage.history = { "2026-07-24": 300 };
  storage.set(MAIN, JSON.stringify(currentLineage));
  await guardApi.takeSnapshot("current-lineage");

  const rows = await guardApi.idbAll(await guardApi.openDb());
  assert.equal(rows.length, 2, "same-day snapshots from separate profile lineages must both remain recoverable");
  assert.equal(new Set(rows.map(row => row.date)).size, 2);

  const wipedCurrentLineage = clone(currentLineage);
  wipedCurrentLineage.totalFocusMin = 0;
  wipedCurrentLineage.history = {};
  storage.set(MAIN, JSON.stringify(wipedCurrentLineage));
  await guardApi.takeSnapshot("blocked-current-lineage-wipe");

  const afterWipe = await guardApi.idbAll(await guardApi.openDb());
  const currentKey = guardApi.snapshotKeyFor(
    new Date().toISOString().slice(0, 10),
    guardApi.summarize(currentLineage)
  );
  assert.equal(afterWipe.find(row => row.date === currentKey)?.state.totalFocusMin, 300);
}

console.log("data-guard hardening tests passed");
