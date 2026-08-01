import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const utilitySource = fs.readFileSync(path.join(ROOT, "gear-utility.js"), "utf8");
const lootPurposeSource = fs.readFileSync(path.join(ROOT, "loot-purpose-actions.js"), "utf8");
const lootSource = fs.readFileSync(path.join(ROOT, "loot-rework.js"), "utf8");
const economySource = fs.readFileSync(path.join(ROOT, "focus-economy.js"), "utf8");

const LOOT = {
  test_blade:["B","Test Blade","legendary",1,"weapon"],
  test_helm:["H","Test Helm","rare",1,"helmet"],
  test_plate:["A","Test Plate","legendary",1,"armor"],
  test_pet:["P","Test Pet","epic",1,"pet"]
};

function loadUtility(){
  const context = {
    console, Math, JSON, Set, Map, Object, Array, Number, String,
    isFinite, globalThis:null,
    GEAR_EFFECTS:{
      test_blade:{xpPct:80,label:"+80% XP"},
      test_plate:{energySave:30,label:"-30 energy"},
      test_pet:{coinPct:90,label:"+90% coins"}
    },
    ITEM_SETS:{
      test:{name:"Test Set",items:["test_blade","test_helm","test_plate"],bonuses:{3:{xpPct:50,coinPct:50,label:"Huge test bonus"}}}
    }
  };
  context.window = context;
  context.globalThis = context;
  context.lootById = id => LOOT[id] || null;
  context.lootId = row => Object.keys(LOOT).find(key => LOOT[key] === row) || "";
  context.LOOT_TABLE = Object.values(LOOT);
  context.EQUIP_SLOTS = ["weapon","helmet","armor","mount","pet"];
  context.CR_MOUNTS_FULL = [{
    id:"mount_test_ox",name:"Test Ox",tier:"mythic",family:"cattle",
    effect:{xpPct:50,coinPct:50,energySave:20,label:"Oversized fixture"}
  }];
  context.lrInstanceStats = instance => {
    const out = {};
    for (const affix of instance.affixes || []) out[affix.id] = (out[affix.id] || 0) + affix.value;
    return out;
  };
  context.wdComputeSetBonuses = () => ({
    timekeeper:{
      label:"Unsafe Time Set",pieces:5,tier:5,
      bonus:{timeScalePct:10,sessionFloorOverride:0,rareDropBonusPct:15,label:"Never changes recorded time"}
    }
  });
  context.WD_MAPS = [
    {id:"map_frostpeak",name:"Map: Frostpeak",tier:"uncommon",unlocksZone:"frostpeak"},
    {id:"map_fragment",name:"Map Fragment",tier:"common",unlocksZone:null}
  ];
  context.WD_KEYS = [{id:"key_brass",name:"Brass Key",tier:"common",chestTier:"common"}];
  context.WD_GEMS = [{id:"gem_ruby_v85",name:"Ruby",tier:"common",effect:{dmgFire:6}}];
  context.WD_REAGENTS = [{id:"reagent_iron_dust",name:"Iron Dust",tier:"common"}];
  context.WD_RUNES = [{id:"rune_ansuz",name:"Ansuz",tier:"common",effect:{xpPct:3}}];
  context.WD_TROPHIES = [{id:"trophy_slime_king",name:"Slime King's Crown",tier:"rare"}];
  context.WD_TOMES = [{id:"tome_focus_basic",name:"Tome of Focus I",tier:"common",unlocks:"focus_basic"}];
  context.WD_CHARMS = [{id:"charm_clover",name:"Four-Leaf Clover",tier:"uncommon",effect:{luckPct:5}}];
  context.WD_RELICS = [{id:"relic_lantern",name:"Wayfinder Lantern",tier:"common",effect:{xpPct:3}}];
  context.WD_ARTIFACTS = [{id:"art_first_key",name:"First Key",tier:"artifact",slot:"key"}];
  context.LR_GEM_DEFS = {gem_fire:{name:"Ruby",sym:"R",affixId:"dmgFire",value:6}};
  context.lrSocketGem = () => ({ok:true});
  context.wdUnlockZone = () => ({ok:true});
  context.wdEnchantInstance = () => ({ok:true});
  context.wdCheckAchievements = () => [];
  vm.createContext(context);
  vm.runInContext(lootPurposeSource, context, {filename:"loot-purpose-actions.js"});
  vm.runInContext(utilitySource, context, {filename:"gear-utility.js"});
  return context;
}

function stateFixture(){
  return {
    totalFocusMin:12345,
    history:{"2026-07-24":90},
    hero:{equipped:{
      weapon:{lootId:"test_blade",tier:"legendary",instanceId:"blade-1"},
      helmet:{lootId:"test_helm",tier:"rare",instanceId:"helm-1"},
      armor:{lootId:"test_plate",tier:"legendary",instanceId:"plate-1"},
      mount:{lootId:"mount_test_ox",tier:"mythic",instanceId:"mount-1"},
      pet:{lootId:"test_pet",tier:"epic",instanceId:"pet-1"}
    }},
    lootInstances:{
      "blade-1":{iid:"blade-1",tier:"legendary",level:4,affixes:[{id:"dmgPhys",value:200},{id:"critPct",value:80}]},
      "helm-1":{iid:"helm-1",tier:"rare",level:2,affixes:[{id:"dodgePct",value:50}]},
      "plate-1":{iid:"plate-1",tier:"legendary",level:3,affixes:[{id:"resPhys",value:200},{id:"resElem",value:200}]},
      "mount-1":{iid:"mount-1",tier:"mythic",level:0,affixes:[{id:"xpPct",value:50}]},
      "pet-1":{iid:"pet-1",tier:"epic",level:0,affixes:[{id:"coinPct",value:90}]}
    }
  };
}

test("loadout aggregation caps every reward and combat dimension while preserving source explanations", () => {
  const app = loadUtility();
  const state = stateFixture();
  const before = JSON.stringify(state);
  const profile = app.fhGearUtilityCompute(state, {action:"Fight"});

  assert.equal(profile.equippedCount, 5);
  assert.deepEqual(
    JSON.parse(JSON.stringify(profile.session)),
    {xpPct:40,coinPct:35,energySave:9}
  );
  assert.equal(profile.combat.dmgPhys, app.FH_GEAR_UTILITY.CAPS.weaponPower);
  assert.equal(profile.combat.resPhys, app.FH_GEAR_UTILITY.CAPS.resPhys);
  assert.equal(profile.combat.resElem, app.FH_GEAR_UTILITY.CAPS.resElem);
  assert.equal(profile.combat.critPct, app.FH_GEAR_UTILITY.CAPS.critPct);
  assert.equal(profile.combat.dodgePct, app.FH_GEAR_UTILITY.CAPS.dodgePct);
  assert.equal(profile.farm.harvestYieldPct, 19);
  assert.deepEqual(
    JSON.parse(JSON.stringify(profile.planned)),
    {actionRoleXpPct:6,travelEfficiencyPct:22}
  );
  assert.equal(profile.loot.qualityBiasPct, 18);
  assert.ok(profile.sources.some(source => source.name === "Test Ox" && source.pieces.some(piece => /farm specialty/.test(piece))));
  assert.ok(profile.sources.some(source => source.name === "Test Ox" && source.plannedPieces.some(piece => /not active/.test(piece))));
  assert.deepEqual(JSON.parse(JSON.stringify(profile.safety.ignoredAuthoritativeMinuteEffects)), ["Unsafe Time Set"]);
  assert.equal(profile.safety.changesMinutes, false);
  assert.equal(JSON.stringify(state), before, "computing utility must never write player state");
});

test("combat routing gives ordinary weapons/armor deterministic use and never mutates the base stats", () => {
  const app = loadUtility();
  const state = stateFixture();
  const base = {dmgPhys:999,dmgFire:9,resPhys:999};
  const before = JSON.stringify(base);
  const stats = app.fhGearUtilityCombatStats(base, state, {action:"Fight",minutes:90,sessionId:"synthetic"});

  assert.equal(JSON.stringify(base), before);
  assert.equal(stats.dmgPhys, 60);
  assert.equal(stats.resPhys, 60);
  assert.equal(stats.resElem, 60);
  assert.equal(stats.dmgFire, 9);
  assert.equal(stats.__gearUtility.equippedCount, 5);
});

test("loot utility shifts quality rather than adding rolls or bypassing minute gates", () => {
  const app = loadUtility();
  const state = stateFixture();
  const weights = {common:.55,uncommon:.25,rare:.12,epic:.05,legendary:.02,mythic:.01};
  const before = JSON.stringify(weights);
  const adjustedA = app.fhGearUtilityAdjustRarityWeights(weights, state, {action:"Loot",minutes:25,sessionId:"same"});
  const adjustedB = app.fhGearUtilityAdjustRarityWeights(weights, state, {action:"Loot",minutes:25,sessionId:"same"});

  assert.deepEqual(adjustedA, adjustedB);
  assert.equal(JSON.stringify(weights), before);
  assert.equal(Object.keys(adjustedA.weights).length, 6, "no additional roll or reward is created");
  assert.ok(adjustedA.weights.common < weights.common);
  assert.ok(adjustedA.weights.rare > weights.rare);
  assert.ok(adjustedA.weights.mythic > weights.mythic);
  assert.equal(adjustedA.qualityBiasPct, 18);
});

test("mount farming adds only a deterministic harvest-bound bonus and leaves minutes untouched", () => {
  const app = loadUtility();
  const state = stateFixture();
  const minutesBefore = state.totalFocusMin;
  const historyBefore = JSON.stringify(state.history);
  const first = app.fhGearUtilityHarvestYield({seed:0,herb:4,timber:0,ore:0}, state, {plotId:"plot1",crop:"herb"});
  const second = app.fhGearUtilityHarvestYield({seed:0,herb:4,timber:0,ore:0}, state, {plotId:"plot1",crop:"herb"});

  assert.deepEqual(first, second);
  assert.deepEqual(JSON.parse(JSON.stringify(first.yield)), {herb:5,ore:0,seed:0,timber:0});
  assert.equal(first.harvestYieldPct, 19);
  assert.equal(first.yield.herb, 5);
  assert.equal(first.bonus.herb, 1);
  assert.equal(first.applied, true);
  assert.equal(state.totalFocusMin, minutesBefore);
  assert.equal(JSON.stringify(state.history), historyBefore);

  state.hero.equipped.mount.tier = "mythic";
  app.CR_MOUNTS_FULL[0].family = "cattle";
  const larger = app.fhGearUtilityHarvestYield({seed:0,herb:20,timber:0,ore:0}, state, {plotId:"plot2",crop:"herb"});
  assert.equal(larger.yield.herb, 24);
  assert.equal(larger.bonus.herb, 4);
});

test("owned utility loot has no hidden effect until explicitly selected", () => {
  const app = loadUtility();
  app.wdComputeSetBonuses = () => ({});
  const state = {
    hero:{equipped:{}},
    lootInstances:{},
    lootOwned:{charm_clover:1},
    loot:{loadout:{slot1:null,slot2:null,slot3:null,charm:null,relic1:null,relic2:null},loadoutUpdatedAt:0}
  };
  const ownedOnly = app.fhGearUtilityCompute(state, {action:"Loot"});
  assert.equal(ownedOnly.utilityCount, 0);
  assert.equal(ownedOnly.loot.qualityBiasPct, 0);

  state.loot.loadout.charm = "charm_clover";
  state.loot.loadoutUpdatedAt = 1000;
  const selected = app.fhGearUtilityCompute(state, {action:"Loot"});
  assert.equal(selected.utilityCount, 1);
  assert.equal(selected.loot.qualityBiasPct, 5);
  assert.ok(selected.sources.some(source => source.kind === "utility" && source.id === "charm_clover"));
});

test("unwired action-role XP remains a pure, explicitly unapplied preview", () => {
  const app = loadUtility();
  const state = stateFixture();
  const before = JSON.stringify(state);
  const eligible = app.fhGearUtilityPreviewSessionRewards({xp:100,coins:40}, state, {
    action:"Fight",minutes:25,rewardFloor:5,rewarded:true
  });
  const below = app.fhGearUtilityPreviewSessionRewards({xp:100,coins:40}, state, {
    action:"Fight",minutes:4,rewardFloor:5,rewarded:true
  });

  assert.deepEqual(
    {xp:eligible.xp,coins:eligible.coins,applied:eligible.appliedXpBonus,planned:eligible.plannedXpBonus,eligible:eligible.eligible,previewOnly:eligible.previewOnly},
    {xp:100,coins:40,applied:0,planned:6,eligible:true,previewOnly:true}
  );
  assert.deepEqual(
    {xp:below.xp,coins:below.coins,applied:below.appliedXpBonus,planned:below.plannedXpBonus,eligible:below.eligible,previewOnly:below.previewOnly},
    {xp:100,coins:40,applied:0,planned:0,eligible:false,previewOnly:true}
  );
  assert.equal(JSON.stringify(state), before);
});

test("non-equippable content registry separates active actions from deliberately dormant catalogs", () => {
  const app = loadUtility();
  const state = stateFixture();
  state.lootOwned = {map_frostpeak:1,key_brass:2,trophy_slime_king:1};
  state.loot = {gemsOwned:{gem_ruby_v85:3}};

  const map = app.fhGearUtilityClassifyContent("map_frostpeak", state);
  const fragment = app.fhGearUtilityClassifyContent("map_fragment", state);
  const gem = app.fhGearUtilityClassifyContent("gem_ruby_v85", state);
  const forgeGem = app.fhGearUtilityClassifyContent("gem_fire", state);
  const reagent = app.fhGearUtilityClassifyContent("reagent_iron_dust", state);
  const trophy = app.fhGearUtilityClassifyContent("trophy_slime_king", state);
  const key = app.fhGearUtilityClassifyContent("key_brass", state);
  const tome = app.fhGearUtilityClassifyContent("tome_focus_basic", state);
  const charm = app.fhGearUtilityClassifyContent("charm_clover", state);
  const audit = app.fhGearUtilityContentAudit(state);

  assert.deepEqual(
    {status:map.status,userAction:map.userAction,owned:map.owned,destination:map.destination},
    {status:"dormant",userAction:false,owned:1,destination:"World"}
  );
  assert.equal(fragment.status, "dormant");
  assert.equal(gem.status, "dormant");
  assert.equal(forgeGem.status, "ready");
  assert.equal(gem.owned, 3);
  assert.equal(reagent.status, "ready");
  assert.equal(trophy.status, "dormant");
  assert.equal(trophy.owned, 1);
  assert.match(key.note, /deterministic chest/);
  assert.equal(key.status, "ready");
  assert.equal(tome.status, "dormant");
  assert.equal(charm.status, "ready");
  assert.equal(audit.deadEnds.length, 0);
  assert.ok(audit.dormant.some(item => item.id === "map_frostpeak"));
  assert.ok(audit.dormant.some(item => item.id === "rune_ansuz"));
  assert.ok(audit.dormant.some(item => item.id === "trophy_slime_king"));
});

test("integration hooks are explicit and historical edit loot opts out", () => {
  assert.match(lootSource, /fhGearUtilityCombatStats/);
  assert.match(lootSource, /fhGearUtilityAdjustRarityWeights/);
  assert.match(lootSource, /enabled:false/);
  assert.match(lootSource, /stats\.dmgPhys/);
  assert.match(economySource, /fhGearUtilityHarvestYield/);
  assert.match(economySource, /gearUtility=\{version:1/);
  assert.match(lootSource, /Loadout utility/);
  assert.match(lootSource, /Exact item, mount, and set sources/);
  assert.match(lootSource, /Planned - not active/);
  assert.match(lootSource, /Loot purpose guide/);
  assert.match(lootSource, /Dormant \/ unavailable/);
  assert.match(lootSource, /Obtainable dead ends/);
  assert.match(lootSource, /fhLootPurposeOpenKeyChest/);
  assert.match(lootSource, /fhLootPurposeReforgeAffix/);
  assert.match(lootSource, /fhLootPurposeSetLoadout/);
  assert.match(lootSource, /fhGearUtilitySummary/);
  assert.match(lootSource, /fhGearUtilityContentAudit/);
});
