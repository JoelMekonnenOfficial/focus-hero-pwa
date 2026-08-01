import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lootSource = fs.readFileSync(path.join(ROOT, "loot-rework.js"), "utf8");
const worldSource = fs.readFileSync(path.join(ROOT, "world-depth.js"), "utf8");

function loadCombat(options={}){
  const document = {
    readyState:"loading",
    addEventListener(){},
    getElementById(){ return null; },
    querySelector(){ return null; },
    querySelectorAll(){ return []; }
  };
  const isolatedMath = Object.create(Math);
  const context = {
    console, Date, Math:isolatedMath, JSON, Set, Map,
    setTimeout, clearTimeout, setInterval, clearInterval,
    document,
    confirm(){ return false; }
  };
  context.window = context;
  context.MONSTERS = [
    ["t1","slime","●","Slime",1,3,["common"]],
    ["t2","wolf","◇","Wolf",5,6,["uncommon"]],
    ["t5","dragon","◆","Dragon",40,50,["legendary"]]
  ];
  context.LOOT_TABLE = options.lootTable || [];
  context.EQUIP_SLOTS = ["weapon"];
  context.GEAR_EFFECTS = {};
  context.allowedRaritiesForMinutes = () => new Set(["common","uncommon","rare","epic","legendary","mythic"]);
  context.lootId = item => item?.[1] || "";
  context.lootById = id => context.LOOT_TABLE.find(item => item?.[1] === id) || null;
  context.lootSlot = item => item?.[4] || "none";
  context.recordEncounter = monsterId => {
    if (!options.trackBestiary || !context.state) return null;
    const entry = context.state.bestiary?.[monsterId] || { unlocked:false, kills:0, drops:{} };
    entry.unlocked = true;
    entry.kills = (entry.kills|0) + 1;
    entry.firstSeenAt = entry.firstSeenAt || context.now();
    context.state.bestiary = context.state.bestiary || {};
    context.state.bestiary[monsterId] = entry;
    return entry;
  };
  context.toast = () => null;
  context.now = () => 1_750_000_000_000;
  context.uid = (() => { let n = 0; return () => `test-iid-${++n}`; })();
  vm.createContext(context);
  /* Match the app's script order: combat functions are defined before the
     world module, then resolve the world APIs when a session completes. */
  vm.runInContext(lootSource, context, { filename:"loot-rework.js" });
  vm.runInContext(worldSource, context, { filename:"world-depth.js" });
  return context;
}

function makeState(zoneId="frostpeak"){
  return {
    hero:{
      level:50,
      hp:100,
      equipped:{ weapon:{ instanceId:"weapon-1", lootId:"test_blade" } }
    },
    lootInstances:{
      "weapon-1":{
        iid:"weapon-1", lootId:"test_blade", tier:"rare", level:0,
        affixes:[{ id:"dmgFire", value:500, tier:"grand" }],
        sockets:[], locked:true
      }
    },
    lootOwned:{},
    loot:{
      drops:[],
      pity:{ common:0, uncommon:0, rare:0, epic:0, legendary:0, mythic:0 },
      materials:{ dust:0, shards:0, essence:0 },
      dyesOwned:{}, gemsOwned:{}, consumables:{},
      loadout:{ slot1:null, slot2:null, slot3:null }
    },
    lootRework:{ flags:{ animationsOn:false, autoSalvageDupes:false } },
    world:{
      currentZone:zoneId,
      unlockedZones:{ verdant_vale:true, [zoneId]:true },
      zonesVisited:{ [zoneId]:1 },
      bossesDefeated:0,
      bossSessionRewards:{},
      artifactsFound:{},
      questCounters:{}
    },
    crystalShards:0,
    crystalShardsEarned:0,
    crystalShardsSpent:0,
    achievements:{},
    bestiary:{}
  };
}

test("90-minute Fight uses the selected zone, resolves one final boss, and awards one receipt", () => {
  const app = loadCombat();
  const state = makeState("frostpeak");
  app.state = state;

  const run = app.lrSessionEndLootPipeline("Fight", 90, "fight-90-a");
  const frostIds = new Set(app.wdEnemiesForZone("frostpeak").map(enemy => enemy.id));

  assert.equal(run.encounters.length, 4);
  assert.equal(run.encounters.filter(enc => enc.enemy.boss).length, 1);
  assert.equal(run.encounters.at(-1).enemy.boss, true, "the threshold boss must be the final encounter");
  assert.ok(run.encounters.every(enc => enc.enemy.zoneId === "frostpeak"));
  assert.ok(run.encounters.every(enc => frostIds.has(enc.enemy.id)));
  assert.equal(run.boss.receipt.defeated, true);
  assert.equal(run.boss.receipt.zoneId, "frostpeak");
  assert.equal(run.boss.receipt.shardsAwarded, 50);
  assert.equal(state.world.bossesDefeated, 1);
  assert.equal(state.crystalShards, 50);
  assert.equal(state.crystalShardsEarned, 50);
  assert.equal(Object.keys(state.world.bossSessionRewards).length, 1);
});

test("replaying the same qualifying Fight is side-effect free and cannot mint a second boss reward", () => {
  const app = loadCombat();
  const state = makeState("frostpeak");
  app.state = state;

  const first = app.lrSessionEndLootPipeline("Fight", 90, "same-session");
  assert.equal(first.duplicate, false);
  const before = JSON.stringify(state);
  const replay = app.lrSessionEndLootPipeline("Fight", 90, "same-session");

  assert.equal(replay.duplicate, true);
  assert.equal(replay.encounters.length, 0);
  assert.equal(replay.drops.length, 0);
  assert.equal(replay.boss.receipt.shardsAwarded, 50);
  assert.equal(JSON.stringify(state), before, "duplicate completion must not change HP, pity, loot, kills, or currency");
});

test("identical offline session inputs mint identical loot IDs, and a retry cannot apply the reward twice", () => {
  const lootTable = [
    ["◇", "synthetic_common", "common", 1, "weapon"],
    ["◇", "synthetic_uncommon", "uncommon", 1, "weapon"],
    ["◇", "synthetic_rare", "rare", 1, "weapon"],
    ["◇", "synthetic_epic", "epic", 1, "weapon"],
    ["◇", "synthetic_legendary", "legendary", 1, "weapon"],
    ["◇", "synthetic_mythic", "mythic", 1, "weapon"]
  ];
  const appA = loadCombat({ lootTable });
  const appB = loadCombat({ lootTable });
  const stateA = makeState();
  const stateB = makeState();
  appA.state = stateA;
  appB.state = stateB;

  const firstA = appA.lrSessionEndLootPipeline("Hunt", 60, "offline-retry-safe-session");
  const firstB = appB.lrSessionEndLootPipeline("Hunt", 60, "offline-retry-safe-session");
  assert.equal(firstA.drops.length, 1, "fixture must produce one synthetic drop");
  assert.equal(firstB.drops.length, 1, "identical fixture must produce one synthetic drop");
  /* Values come from separate VM realms, so compare their JSON value rather
     than realm-specific object prototypes. */
  assert.equal(JSON.stringify(firstA.drops), JSON.stringify(firstB.drops), "drop receipt identity and roll must be deterministic");
  assert.equal(JSON.stringify(stateA.lootInstances), JSON.stringify(stateB.lootInstances), "minted instance ID and affixes must be deterministic");

  const beforeRetry = JSON.stringify(stateA);
  const retry = appA.lrSessionEndLootPipeline("Hunt", 60, "offline-retry-safe-session");
  assert.equal(retry.duplicate, true);
  assert.equal(retry.drops.length, 0);
  assert.equal(JSON.stringify(stateA), beforeRetry, "exact retry must not change loot, pity, or rewards");
  assert.throws(
    () => appA.lrSessionEndLootPipeline("Travel", 60, "offline-retry-safe-session"),
    /semantic mismatch.*retry refused/,
    "the same session ID with a different action is not an exact retry"
  );
  assert.throws(
    () => appA.lrSessionEndLootPipeline("Hunt", 61, "offline-retry-safe-session"),
    /semantic mismatch.*retry refused/,
    "the same session ID with different minutes is not an exact retry"
  );
});

test("divergent replica inventory cannot hide different reward content behind the same stable IDs", () => {
  const rarities = ["common","uncommon","rare","epic","legendary","mythic"];
  const lootTable = rarities.flatMap(rarity => [
    ["A", `synthetic_${rarity}_a`, rarity, 1, "weapon"],
    ["B", `synthetic_${rarity}_b`, rarity, 1, "weapon"]
  ]);
  const appA = loadCombat({ lootTable });
  const appB = loadCombat({ lootTable });
  const stateA = makeState();
  const stateB = makeState();
  /* Each replica has the opposite half of the synthetic collection, so the
     same deterministic rarity roll must select different unowned content. */
  rarities.forEach(rarity => {
    stateA.lootOwned[`synthetic_${rarity}_b`] = 1;
    stateB.lootOwned[`synthetic_${rarity}_a`] = 1;
  });
  appA.state = stateA;
  appB.state = stateB;

  const sessionId = "divergent-offline-reward-session";
  const runA = appA.lrSessionEndLootPipeline("Hunt", 60, sessionId);
  const runB = appB.lrSessionEndLootPipeline("Hunt", 60, sessionId);
  const receiptA = stateA.loot.sessionRewardReceipts[sessionId];
  const receiptB = stateB.loot.sessionRewardReceipts[sessionId];

  assert.equal(runA.drops.length, 1);
  assert.equal(runB.drops.length, 1);
  assert.equal(runA.drops[0].id, runB.drops[0].id, "stable drop ID deliberately collides for this test");
  assert.equal(runA.drops[0].iid, runB.drops[0].iid, "stable instance ID deliberately collides for this test");
  assert.notEqual(runA.drops[0].templateId, runB.drops[0].templateId, "replica-local inventory selected different content");
  assert.notEqual(receiptA.contentCommitment, receiptB.contentCommitment, "full reward commitment must expose the conflict");
  assert.notEqual(JSON.stringify(receiptA.rewardSnapshot), JSON.stringify(receiptB.rewardSnapshot), "immutable snapshots must retain the conflicting content");

  const corrupted = JSON.parse(JSON.stringify(receiptA.rewardSnapshot));
  corrupted.drops[0].drop.templateId = "tampered-template";
  receiptA.rewardSnapshot = corrupted;
  assert.throws(
    () => appA.lrSessionEndLootPipeline("Hunt", 60, sessionId),
    /receipt content mismatch/,
    "a stored snapshot that no longer matches its commitment must fail closed"
  );
});

test("unverifiable legacy or future receipts cannot authorize a retry", () => {
  const lootTable = [
    ["◇", "synthetic_common", "common", 1, "weapon"],
    ["◇", "synthetic_uncommon", "uncommon", 1, "weapon"],
    ["◇", "synthetic_rare", "rare", 1, "weapon"],
    ["◇", "synthetic_epic", "epic", 1, "weapon"],
    ["◇", "synthetic_legendary", "legendary", 1, "weapon"],
    ["◇", "synthetic_mythic", "mythic", 1, "weapon"]
  ];
  const cases = [
    {
      name:"missing policy",
      mutate(receipt){ delete receipt.policyVersion; },
      error:/Unsupported session reward receipt policy/
    },
    {
      name:"unknown future policy",
      mutate(receipt){ receipt.policyVersion = 999; },
      error:/Unsupported session reward receipt policy/
    },
    {
      name:"missing snapshot",
      mutate(receipt){ delete receipt.rewardSnapshot; },
      error:/snapshot is missing/
    },
    {
      name:"missing commitment",
      mutate(receipt){ delete receipt.contentCommitment; },
      error:/commitment is missing/
    }
  ];

  for (const fixture of cases){
    const app = loadCombat({ lootTable });
    const state = makeState();
    app.state = state;
    const sessionId = `unverifiable-${fixture.name.replaceAll(" ", "-")}`;
    app.lrSessionEndLootPipeline("Hunt", 60, sessionId);
    fixture.mutate(state.loot.sessionRewardReceipts[sessionId]);
    const beforeRetry = JSON.stringify(state);
    assert.throws(
      () => app.lrSessionEndLootPipeline("Hunt", 60, sessionId),
      fixture.error,
      fixture.name
    );
    assert.equal(JSON.stringify(state), beforeRetry, `${fixture.name} refusal must have zero mutation`);
  }
});

test("auto-salvage uses only the command RNG, including gem choice and tombstone", () => {
  const lootTable = [["â—†", "synthetic_mythic", "mythic", 1, "weapon"]];
  const appA = loadCombat({ lootTable });
  const appB = loadCombat({ lootTable });
  const stateA = makeState();
  const stateB = makeState();
  for (const state of [stateA, stateB]){
    state.lootOwned.synthetic_mythic = 1;
    state.lootRework.flags.autoSalvageDupes = true;
  }
  appA.state = stateA;
  appB.state = stateB;
  appA.Math.random = () => 0;
  appB.Math.random = () => 0.999999;
  const drop = {
    rarity:"mythic", template:lootTable[0],
    odds:{ rolled:0.5, ratio:1, gearUtilityPct:0, gearUtilitySources:[] },
    pity:{ tier:"mythic", sinceLast:0, bumped:false },
    fromMonsterTable:false
  };
  const commit = (app, state) => app.lrCommitDrop(state, drop, {
    sessionId:"deterministic-salvage", action:"Loot", rng:app.lrSeededRng(12345),
    instanceId:"iid-deterministic-salvage", dropId:"drop-deterministic-salvage"
  });
  const entryA = commit(appA, stateA);
  const entryB = commit(appB, stateB);
  const effect = state => ({
    entry:state.loot.drops.at(-1),
    materials:state.loot.materials,
    gemsOwned:state.loot.gemsOwned,
    tombstone:state.loot.instanceTombstones["iid-deterministic-salvage"],
    instance:state.lootInstances["iid-deterministic-salvage"] || null
  });
  assert.equal(entryA.autoSalvaged, true);
  assert.equal(entryB.autoSalvaged, true);
  assert.equal(JSON.stringify(effect(stateA)), JSON.stringify(effect(stateB)));
  assert.equal(Object.values(stateA.loot.gemsOwned).reduce((sum,n)=>sum+n,0), 1, "mythic salvage must mint exactly one deterministic gem");
  assert.equal(stateA.loot.instanceTombstones["iid-deterministic-salvage"], Number.MAX_SAFE_INTEGER - appA.lrHashStr("deterministic-salvage|iid-deterministic-salvage"));
});

test("v3 receipt commits compact exact effects and rejects omitted-effect tampering", () => {
  const rarities = ["common","uncommon","rare","epic","legendary","mythic"];
  const lootTable = rarities.map(rarity => ["â—‡", `effect_${rarity}`, rarity, 1, "weapon"]);
  const app = loadCombat({ lootTable, trackBestiary:true });
  const state = makeState("frostpeak");
  lootTable.forEach(item => { state.lootOwned[item[1]] = 1; });
  state.lootRework.flags.autoSalvageDupes = true;
  app.state = state;
  const sessionId = "compact-exact-effects";
  const run = app.lrSessionEndLootPipeline("Fight", 90, sessionId);
  const receipt = state.loot.sessionRewardReceipts[sessionId];
  const snapshot = receipt.rewardSnapshot;

  assert.ok(run.drops.length > 0, "fixture must exercise loot and auto-salvage effects");
  assert.match(receipt.contentCommitment, /^sha256:[0-9a-f]{64}$/);
  assert.match(receipt.semanticCommitment, /^sha256:[0-9a-f]{64}$/);
  assert.equal("encounters" in snapshot, false, "round-by-round battle history is not receipt content");
  assert.equal("encounter" in (snapshot.boss || {}), false, "boss UI report is not receipt content");
  for (const key of [
    "pity","materials","consumables","lootOwned","gemsOwned","instanceTombstones","mountFamilies","mountProgress",
    "bestiary","world","achievements","heroHp","crystalShards","crystalShardsEarned"
  ]) assert.ok(Object.hasOwn(snapshot.effects, key), `missing exact effect ${key}`);
  assert.ok(Object.keys(snapshot.effects.instanceTombstones.set).length > 0);
  assert.ok(Object.keys(snapshot.effects.bestiary.set).length > 0);
  assert.ok(Object.keys(snapshot.effects.world.set).some(path => path.includes("bossSessionRewards")));
  assert.equal(app.lrSha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");

  const omitted = JSON.parse(JSON.stringify(receipt));
  delete omitted.rewardSnapshot.effects.gemsOwned;
  omitted.contentCommitment = app.lrRewardContentCommitment(omitted.rewardSnapshot);
  assert.throws(
    () => app.lrNormalizeSessionRewardReceipt(sessionId, omitted),
    /effect schema omits gemsOwned/,
    "even a recomputed commitment cannot authorize an incomplete v2 effect schema"
  );

  const missingCommitmentLoot = JSON.parse(JSON.stringify(state.loot));
  delete missingCommitmentLoot.sessionRewardReceipts[sessionId].contentCommitment;
  assert.throws(
    () => app.lrMergeSessionRewardReceiptStores(missingCommitmentLoot, {}),
    /commitment is missing/,
    "merge must reject a missing commitment instead of manufacturing one"
  );
  assert.equal(
    missingCommitmentLoot.sessionRewardReceipts[sessionId].contentCommitment,
    undefined,
    "failed merge must leave malformed input untouched"
  );
});

test("500+ proofs stay bounded, compacted retries remain idempotent, and capacity fails before mutation", () => {
  const app = loadCombat();
  const state = makeState();
  app.state = state;
  app.lrEnsureShape(state);
  const emptyPatch = () => ({ set:{}, remove:[] });
  const makeSnapshot = (sessionId, minutes=1) => ({
    schemaVersion:app.LR_SESSION_REWARD_POLICY_VERSION,
    sessionId, action:"Loot", minutes, legacyItemId:null, zoneId:"frostpeak",
    boss:null, drops:[], consumed:[],
    effects:{
      pity:{}, materials:{}, consumables:{}, lootOwned:{}, gemsOwned:{},
      instanceTombstones:emptyPatch(), mountFamilies:emptyPatch(), mountProgress:0,
      bestiary:emptyPatch(), world:emptyPatch(), achievements:emptyPatch(),
      heroHp:0, crystalShards:0, crystalShardsEarned:0
    }
  });
  for (let i=0; i<550; i++){
    const sessionId = `bounded-${String(i).padStart(4,"0")}`;
    const snapshot = makeSnapshot(sessionId);
    const semanticCommitment = app.lrRewardSemanticCommitment(sessionId, "Loot", 1, app.LR_SESSION_REWARD_POLICY_VERSION);
    const contentCommitment = app.lrRewardContentCommitment(snapshot);
    state.loot.sessionRewardReceiptTombstones[sessionId] = {
      policyVersion:app.LR_SESSION_REWARD_POLICY_VERSION, semanticCommitment, contentCommitment
    };
    if (i < 100){
      state.loot.sessionRewardReceipts[sessionId] = {
        at:i+1, policyVersion:app.LR_SESSION_REWARD_POLICY_VERSION,
        semanticCommitment, contentCommitment, rewardSnapshot:snapshot
      };
    }
  }
  const compact = app.lrCompactSessionRewardReceiptState(state);
  assert.equal(compact.proofCount, 550);
  assert.equal(compact.detailCount, app.LR_SESSION_REWARD_DETAIL_CAP);
  assert.ok(compact.bytes <= app.LR_SESSION_REWARD_STORAGE_BYTE_CAP);
  assert.equal(JSON.stringify(compact.receipts).includes("encounters"), false);

  const compactedId = "bounded-0000";
  assert.equal(Boolean(state.loot.sessionRewardReceipts[compactedId]), false);
  assert.equal(Boolean(state.loot.sessionRewardReceiptTombstones[compactedId]), true);
  const beforeRetry = JSON.stringify(state);
  const retry = app.lrSessionEndLootPipeline("Loot", 1, compactedId);
  assert.equal(retry.duplicate, true);
  assert.equal(JSON.stringify(state), beforeRetry, "proof-only retry must not re-award or mutate");

  const full = makeState();
  app.state = full;
  app.lrEnsureShape(full);
  for (let i=0; i<app.LR_SESSION_REWARD_TOMBSTONE_CAP; i++){
    const sessionId = `full-${String(i).padStart(4,"0")}`;
    full.loot.sessionRewardReceiptTombstones[sessionId] = {
      policyVersion:app.LR_SESSION_REWARD_POLICY_VERSION,
      semanticCommitment:app.lrRewardSemanticCommitment(sessionId, "Loot", 1, app.LR_SESSION_REWARD_POLICY_VERSION),
      contentCommitment:`sha256:${app.lrSha256Hex(`effect-${i}`)}`
    };
  }
  app.lrCompactSessionRewardReceiptState(full);
  const beforeRefusal = JSON.stringify(full);
  assert.throws(
    () => app.lrSessionEndLootPipeline("Loot", 1, "capacity-overflow"),
    /capacity exhausted/,
    "new rewards must fail before mutation when exact idempotency evidence cannot be retained"
  );
  assert.equal(JSON.stringify(full), beforeRefusal);
});

test("capacity preflight is clone-only and policy-v1 evidence migrates without replay", () => {
  const app = loadCombat();
  const emptyPatch = () => ({ set:{}, remove:[] });
  const currentSnapshot = (sessionId, minutes=1) => ({
    schemaVersion:app.LR_SESSION_REWARD_POLICY_VERSION,
    sessionId, action:"Loot", minutes, legacyItemId:null, zoneId:"frostpeak",
    boss:null, drops:[], consumed:[],
    effects:{
      pity:{}, materials:{}, consumables:{}, lootOwned:{}, gemsOwned:{},
      instanceTombstones:emptyPatch(), mountFamilies:emptyPatch(), mountProgress:0,
      bestiary:emptyPatch(), world:emptyPatch(), achievements:emptyPatch(),
      heroHp:0, crystalShards:0, crystalShardsEarned:0
    }
  });
  const full = makeState();
  app.state = full;
  app.lrEnsureShape(full);
  for (let i=0; i<app.LR_SESSION_REWARD_TOMBSTONE_CAP; i++){
    const sessionId = `preflight-${String(i).padStart(4,"0")}`;
    const snapshot = currentSnapshot(sessionId);
    const semanticCommitment = app.lrRewardSemanticCommitment(sessionId, "Loot", 1, app.LR_SESSION_REWARD_POLICY_VERSION);
    const contentCommitment = app.lrRewardContentCommitment(snapshot);
    full.loot.sessionRewardReceiptTombstones[sessionId] = {
      policyVersion:app.LR_SESSION_REWARD_POLICY_VERSION, semanticCommitment, contentCommitment
    };
    if (i < app.LR_SESSION_REWARD_DETAIL_CAP + 1){
      full.loot.sessionRewardReceipts[sessionId] = {
        at:i+1, policyVersion:app.LR_SESSION_REWARD_POLICY_VERSION,
        semanticCommitment, contentCommitment, rewardSnapshot:snapshot
      };
    }
  }
  const receiptBytesBefore = JSON.stringify(full.loot.sessionRewardReceipts);
  const proofBytesBefore = JSON.stringify(full.loot.sessionRewardReceiptTombstones);
  assert.throws(
    () => app.lrAssertSessionRewardCapacity(full, "preflight-overflow", "Loot", 1),
    /capacity exhausted/
  );
  assert.equal(JSON.stringify(full.loot.sessionRewardReceipts), receiptBytesBefore, "failed preflight must not evict detail");
  assert.equal(JSON.stringify(full.loot.sessionRewardReceiptTombstones), proofBytesBefore, "failed preflight must not normalize proofs");

  const legacy = makeState();
  app.state = legacy;
  app.lrEnsureShape(legacy);
  const legacyId = "legacy-policy-one";
  const legacySnapshot = {
    schemaVersion:1, sessionId:legacyId, action:"Hunt", minutes:60,
    legacyItemId:null, zoneId:"frostpeak", boss:null, drops:[], encounters:[],
    consumed:[], effects:{ pity:{}, materials:{}, consumables:{} }
  };
  const legacyCommitment = app.lrStableId(
    "reward", JSON.stringify(app.lrCanonicalRewardValue(legacySnapshot))
  );
  legacy.loot.sessionRewardReceipts[legacyId] = {
    at:100, action:"Hunt", minutes:60, policyVersion:1,
    rewardSnapshot:legacySnapshot, contentCommitment:legacyCommitment
  };
  const migrated = app.lrCompactSessionRewardReceiptState(legacy);
  assert.equal(migrated.detailCount, 1);
  assert.equal(migrated.proofCount, 1);
  assert.match(migrated.receipts[legacyId].semanticCommitment, /^sha256:[0-9a-f]{64}$/);
  const detailedLoot = JSON.parse(JSON.stringify(legacy.loot));
  delete legacy.loot.sessionRewardReceipts[legacyId];
  const beforeRetry = JSON.stringify(legacy);
  const retry = app.lrSessionEndLootPipeline("Hunt", 60, legacyId);
  assert.equal(retry.duplicate, true);
  assert.equal(JSON.stringify(legacy), beforeRetry, "legacy proof-only retry must be side-effect free");
  const merged = app.lrMergeSessionRewardReceiptStores(detailedLoot, legacy.loot);
  assert.ok(merged.receipts[legacyId], "detail+proof merge must retain validated legacy detail");
  assert.deepEqual(
    JSON.parse(JSON.stringify(merged.tombstones[legacyId])),
    JSON.parse(JSON.stringify(migrated.tombstones[legacyId]))
  );
});

test("Fight below 90 minutes stays in-zone without a boss or World Shard reward", () => {
  const app = loadCombat();
  const state = makeState("ember_wastes");
  app.state = state;

  const run = app.lrSessionEndLootPipeline("Fight", 89, "fight-89");
  const emberIds = new Set(app.wdEnemiesForZone("ember_wastes").map(enemy => enemy.id));

  assert.ok(run.encounters.length > 0);
  assert.ok(run.encounters.every(enc => !enc.enemy.boss));
  assert.ok(run.encounters.every(enc => enc.enemy.zoneId === "ember_wastes"));
  assert.ok(run.encounters.every(enc => emberIds.has(enc.enemy.id)));
  assert.equal(run.boss, null);
  assert.equal(state.world.bossesDefeated, 0);
  assert.equal(state.crystalShards, 0);
  assert.equal(Object.keys(state.world.bossSessionRewards).length, 0);
});

test("Hunt and every other non-Fight action remain noncombat even past 90 minutes", () => {
  for (const action of ["Hunt","Travel","Loot","Craft","Rest","Meditate"]){
    const app = loadCombat();
    const state = makeState("astral_plains");
    app.state = state;
    const hpBefore = state.hero.hp;

    const run = app.lrSessionEndLootPipeline(action, 120, `noncombat-${action}`);

    assert.equal(run.encounters.length, 0, `${action} must not create encounters`);
    assert.equal(run.boss, null, `${action} must not create a boss`);
    assert.equal(state.hero.hp, hpBefore, `${action} must not change combat HP`);
    assert.equal(state.world.bossesDefeated, 0);
    assert.equal(state.crystalShards, 0);
    assert.equal(Object.keys(state.world.bossSessionRewards).length, 0);
    assert.equal(app.wdShouldSpawnBoss(120, action), false);
  }
});
