import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(ROOT, "world-depth.js"), "utf8");

function loadWorldDepth(){
  const context = { console, Date, Math, setTimeout, clearTimeout };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename:"world-depth.js" });
  return context;
}

test("zone unlock charges each zone's exact advertised shard cost atomically", () => {
  const wd = loadWorldDepth();
  const state = { crystalShards:150, crystalShardsSpent:7, lootOwned:{}, loot:{}, world:null };
  const frost = wd.wdUnlockZone(state, "frostpeak");
  assert.deepEqual(JSON.parse(JSON.stringify(frost)), { ok:true, via:"shards", spent:100 });
  assert.equal(state.crystalShards, 50);
  assert.equal(state.crystalShardsSpent, 107);
  assert.equal(state.world.unlockedZones.frostpeak, true);

  const before = JSON.stringify(state);
  const ember = wd.wdUnlockZone(state, "ember_wastes");
  assert.equal(ember.ok, false);
  assert.equal(ember.need, 200);
  assert.equal(state.world.unlockedZones.ember_wastes, undefined);
  assert.equal(state.crystalShards, 50);
  assert.equal(JSON.parse(before).crystalShardsSpent, state.crystalShardsSpent);
});

test("a matching map unlocks a zone without charging shards", () => {
  const wd = loadWorldDepth();
  const state = { crystalShards:999, crystalShardsSpent:0, lootOwned:{map_ember_wastes:1}, loot:{}, world:null };
  const result = wd.wdUnlockZone(state, "ember_wastes");
  assert.equal(result.ok, true);
  assert.equal(result.via, "map");
  assert.equal(state.lootOwned.map_ember_wastes, 0);
  assert.equal(state.crystalShards, 999);
  assert.equal(state.crystalShardsSpent, 0);
});

test("challenge progress derives from canonical history and follows edits down", () => {
  const wd = loadWorldDepth();
  const today = wd.wdTodayKey();
  const state = {
    history:{ [today]:25 }, sessionsLog:[], combo:{date:today,count:0}, streak:0,
    questSystem:{
      lastRoll:{daily:today,weekly:wd.wdWeekKey(),seasonal:wd.wdMonthKey()},
      daily:[{id:"q",kind:"minutes",label:"25 minutes",target:25,progress:0,completed:false,claimed:false,xp:10,coins:5,shards:2}],
      weekly:[], seasonal:[]
    }
  };
  assert.equal(wd.wdReconcileQuestProgress(state), true);
  assert.equal(state.questSystem.daily[0].progress, 25);
  assert.equal(state.questSystem.daily[0].completed, true);
  assert.equal(wd.wdReconcileQuestProgress(state), false, "unchanged progress must not request another save");
  state.history[today] = 20;
  assert.equal(wd.wdReconcileQuestProgress(state), true);
  assert.equal(state.questSystem.daily[0].progress, 20);
  assert.equal(state.questSystem.daily[0].completed, false);
});

test("claim grants XP, coins, shards and increments the correct claimed counter once", () => {
  const wd = loadWorldDepth();
  const today = wd.wdTodayKey();
  let xpCalls = 0;
  wd.awardXp = amount => { xpCalls += 1; return amount; };
  const state = {
    history:{[today]:60}, sessionsLog:[], combo:{date:today,count:0}, streak:0,
    hero:{level:1,xp:0}, coins:10, coinsEarned:10, crystalShards:1, crystalShardsEarned:1,
    questSystem:{
      lastRoll:{daily:today,weekly:wd.wdWeekKey(),seasonal:wd.wdMonthKey()},
      daily:[{id:"q",kind:"minutes",label:"60 minutes",target:60,progress:0,completed:false,claimed:false,xp:40,coins:30,shards:2}],
      weekly:[], seasonal:[]
    }
  };
  const result = wd.wdClaimQuest(state, "q");
  assert.equal(result.ok, true);
  assert.equal(result.xp, 40);
  assert.equal(xpCalls, 1);
  assert.equal(state.coins, 40);
  assert.equal(state.coinsEarned, 40);
  assert.equal(state.crystalShards, 3);
  assert.equal(state.crystalShardsEarned, 3);
  assert.equal(state.questSystem.dailyClaimedCount, 1);
  assert.equal(wd.wdClaimQuest(state, "q").reason, "already_claimed");
  assert.equal(state.questSystem.dailyClaimedCount, 1);
});

test("vault refuses equipped instances and preserves inventory on failure", () => {
  const wd = loadWorldDepth();
  const inst = {iid:"eq-1",lootId:"blade",tier:"rare"};
  const state = {
    loot:{}, lootInstances:{"eq-1":inst},
    hero:{equipped:{weapon:{instanceId:"eq-1"}}}
  };
  const blocked = wd.wdMoveToVault(state, "eq-1");
  assert.equal(blocked.reason, "equipped_instance");
  assert.equal(state.lootInstances["eq-1"], inst);
  assert.equal(Object.keys(state.loot.vault.instances).length, 0);
});

test("vault moves record durable location markers for cloud reconciliation", () => {
  const wd = loadWorldDepth();
  const state = {
    loot:{}, lootInstances:{item:{iid:"item",lootId:"blade",tier:"rare"}},
    hero:{equipped:{weapon:null}}
  };
  assert.equal(wd.wdMoveToVault(state, "item").ok, true);
  assert.equal(state.loot.vault.locations.item.location, "vault");
  const storedAt = state.loot.vault.locations.item.at;
  assert.ok(storedAt > 0);
  assert.equal(wd.wdMoveFromVault(state, "item").ok, true);
  assert.equal(state.loot.vault.locations.item.location, "inventory");
  assert.ok(state.loot.vault.locations.item.at >= storedAt);
});

test("progression merge preserves remote world, quests, achievements, and shard spends", () => {
  const wd = loadWorldDepth();
  const today = wd.wdTodayKey();
  const week = wd.wdWeekKey();
  const month = wd.wdMonthKey();
  const local = {
    crystalShards:80, crystalShardsEarned:100, crystalShardsSpent:20, craftingDust:5,
    world:{currentZone:"verdant_vale",unlockedZones:{verdant_vale:true},zonesVisited:{verdant_vale:1},bossesDefeated:1,mysteryBoxesOpened:0,artifactsFound:{},questCounters:{}},
    questSystem:{lastRoll:{daily:today,weekly:week,seasonal:month},daily:[],weekly:[],seasonal:[],dailyClaimedCount:0},
    achievementsV85:{local:10}
  };
  const remote = {
    crystalShards:70, crystalShardsEarned:100, crystalShardsSpent:30, craftingDust:12,
    world:{currentZone:"frostpeak",unlockedZones:{verdant_vale:true,frostpeak:true},zonesVisited:{verdant_vale:2,frostpeak:3},bossesDefeated:4,mysteryBoxesOpened:2,artifactsFound:{worldseed:20},questCounters:{craft_actions:3}},
    questSystem:{lastRoll:{daily:today,weekly:week,seasonal:month},daily:[{id:"remote-daily",kind:"minutes",target:25,progress:20,completed:false,claimed:false,rolledAt:2}],weekly:[],seasonal:[],dailyClaimedCount:2},
    achievementsV85:{remote:20}
  };
  const merged = wd.wdMergeProgressionState(local, remote, {});
  assert.equal(merged.crystalShards, 70, "the larger spent counter must not resurrect shards");
  assert.equal(merged.crystalShardsSpent, 30);
  assert.equal(merged.craftingDust, 12);
  assert.equal(merged.world.unlockedZones.frostpeak, true);
  assert.equal(merged.world.currentZone, "frostpeak");
  assert.equal(merged.world.bossesDefeated, 4);
  assert.equal(merged.world.artifactsFound.worldseed, 20);
  assert.equal(merged.questSystem.daily[0].id, "remote-daily");
  assert.equal(merged.questSystem.dailyClaimedCount, 2);
  assert.equal(merged.achievementsV85.local, 10);
  assert.equal(merged.achievementsV85.remote, 20);
});

test("embedded world-depth smoke suite remains green", () => {
  const wd = loadWorldDepth();
  const results = wd.__wdSmokeTests();
  const failures = results.filter(row => !row.ok);
  assert.equal(failures.length, 0, failures.map(row => row.name).join(", "));
});
