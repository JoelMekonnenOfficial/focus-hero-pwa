/* Actual source modules, synthetic in-memory player. No browser or storage. */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const src = name => readFileSync(new URL('../starmax/'+name,import.meta.url),'utf8');
const html=src('index.html');
const sandbox={console,Date,Math,Set,Map,Uint8Array,TextEncoder,TextDecoder,
  setTimeout(){},setInterval(){},clearTimeout(){},clearInterval(){},
  document:{readyState:'loading',addEventListener(){},getElementById(){return null;}},
  addEventListener(){},now:()=>1800000000000,uid:(()=>{let n=0;return()=>`synthetic-${++n}`;})(),
  localStorage:{getItem(){throw Error('storage forbidden');},setItem(){throw Error('storage forbidden');}},
  fetch(){throw Error('network forbidden');},FH_onPrimaryReady(){},
  lootId:item=>item[1].toLowerCase().replace(/[^a-z0-9]+/g,'_'),
  lootSlot:item=>item[4],isEquippableSlot:slot=>['weapon','helmet','armor','mount','pet'].includes(slot),
  allowedRaritiesForMinutes:m=>new Set(m<25?['common','uncommon']:m<50?['common','uncommon','rare']:m<90?['common','uncommon','rare','epic']:m<120?['common','uncommon','rare','epic','legendary']:['common','uncommon','rare','epic','legendary','mythic'])};
sandbox.window=sandbox;
vm.createContext(sandbox);
vm.runInContext(html.match(/const LOOT_TABLE = \[[\s\S]*?\n\];/)[0]+'\nwindow.LOOT_TABLE=LOOT_TABLE;',sandbox);
vm.runInContext('const EQUIP_SLOTS=["weapon","helmet","armor","mount","pet"]; window.EQUIP_SLOTS=EQUIP_SLOTS;'+html.slice(html.indexOf('const GEAR_EFFECTS ='),html.indexOf('const ACHIEVEMENTS ='))+'\nwindow.GEAR_EFFECTS=GEAR_EFFECTS;window.ITEM_SETS=ITEM_SETS;',sandbox);
vm.runInContext(html.slice(html.indexOf('function equippedStats('),html.indexOf('function gearEffectText(')),sandbox);
sandbox.lootById=id=>sandbox.LOOT_TABLE.find(t=>sandbox.lootId(t)===id);
for(const name of ['loot-rework-v1012.js','character-rebuild.js','world-depth.js','loot-purpose-actions.js','gear-utility.js'])vm.runInContext(src(name),sandbox,{filename:name});
const w=sandbox,clone=x=>JSON.parse(JSON.stringify(x));
const fresh=()=>({hero:{level:25,hp:100,energy:100,xp:300,equipped:{}},coins:75,totalFocusMin:1000,sessionsLog:[{id:'old',minutes:60,xp:60,coins:40}],lootOwned:{},lootInstances:{},world:{currentZone:'verdant_vale',unlockedZones:{verdant_vale:true}}});
let checks=0;const test=(name,fn)=>{fn();checks++;console.log('PASS '+name);};
test('All catalog gear and mounts describe combat or travel only',()=>{
  for(const fx of Object.values(w.GEAR_EFFECTS))assert(!/XP|coins|energy/i.test(fx.label));
  for(const m of w.CR_MOUNTS_FULL){assert(m.effect.travelSpeedPct>0);assert(!m.effect.xpPct&&!m.effect.coinPct&&!m.effect.energySave);}
});
test('Old affixes and inventory remain byte-identical and cannot change reward or economic utility',()=>{
  const s=fresh();s.hero.equipped={weapon:{lootId:'whetstone_blade',instanceId:'old'},mount:{lootId:'mount_ox',tier:'common',effect:{coinPct:999}},pet:{lootId:'star_mote'}};
  s.lootInstances.old={lootId:'whetstone_blade',tier:'rare',level:10,affixes:[{id:'xpPct',value:999},{id:'coinPct',value:999},{id:'energySave',value:999}]};
  const before=JSON.stringify(s),p=w.fhGearUtilityCompute(s,{action:'Fight'}),engine=w.equippedStats(s.hero);
  assert.equal(JSON.stringify(s),before);assert.equal(engine.xpPct+engine.coinPct+engine.energySave,0);
  assert.equal(p.session.xpPct+p.session.coinPct+p.session.energySave+p.loot.qualityBiasPct+p.farm.harvestYieldPct,0);
  assert(p.combat.dmgPhys>0);assert.equal(Object.keys(w.lrInstanceStats(s.lootInstances.old)).length,0);
});
test('New gear rolls have combat affixes; legacy earnings lines clearly inactive',()=>{
  for(let seed=0;seed<100;seed++){
    const inst=w.lrMintInstance(w.lootById('whetstone_blade'),{rng:w.lrSeededRng(seed+1)});
    assert(inst.affixes.every(a=>!['xpPct','coinPct','energySave'].includes(a.id)));
  }
  assert.match(w.lrAffixLabel({id:'xpPct',value:5}),/inactive/);
});
test('Equipped gear changes actual deterministic fight outcome',()=>{
  const naked=fresh();naked.hero.level=1;
  const geared=clone(naked);geared.hero.equipped={weapon:{lootId:'whetstone_blade',tier:'rare'},armor:{lootId:'moonplate_vest',tier:'epic'},helmet:{lootId:'tome_of_tomorrow',tier:'rare'}};
  const enemy=['t3','synthetic_dummy','x','Dummy',1,70,[]];enemy.__lrTraits={weak:[],resist:[],dmg:25,acc:1};
  const fight=s=>w.lrResolveEncounter({heroStats:w.fhGearUtilityCombatStats({},s,{}),heroLevel:1,heroHP:100,enemyOverride:enemy},0,()=>0.99);
  const a=fight(naked),b=fight(geared);assert.equal(a.killed,false);assert.equal(b.killed,true);assert(b.heroHPEnd>a.heroHPEnd);
});
test('Carried relics no longer bias loot or harvest, and give combat support',()=>{
  const s=fresh();s.lootOwned={copper_coin:1,calming_herb:1};s.loot={loadout:{relic1:'copper_coin',charm:'calming_herb'}};
  const u=w.fhLootPurposeComputeUtility(s);assert.equal(u.loot.qualityBiasPct,0);assert.equal(u.farm.harvestYieldPct,0);assert(u.combat.critPct>0&&u.combat.resPhys>0);
});
test('Every world offers regional Fight gear; peaceful sessions do not grant combat gear',()=>{
  for(const id of Object.keys(w.WD_ZONES)){
    for(const gear of w.wdGearForZone(id))assert(w.lootById(gear),`${id} has unknown ${gear}`);
    const s=fresh();s.world.currentZone=id;
    const pool=w.lrEligibleTemplates('Fight',120,s);assert(pool.length>0);
    for(const t of pool){assert(w.wdGearForZone(id).includes(w.lootId(t)));assert(w.isEquippableSlot(t[4]));}
    const dropped=w.lrRollDropForEncounter(w.lrEnsureShape(s),'Fight',120,null,'clean',()=>0.999,{enabled:true});
    assert(dropped);assert(w.wdGearForZone(id).includes(w.lootId(dropped.template)));
    for(const t of w.lrEligibleTemplates('Travel',120,s))assert(!w.isEquippableSlot(t[4]));
  }
});
const win=(id,boss=false)=>({killed:true,enemy:{id,boss}});
const clear=s=>{
  w.wdRecordJourneySession(s,{sessionId:'fight-one',action:'Fight',minutes:90,zoneId:'verdant_vale',encounters:[win('stag_woodland'),win('bee_swarm'),win('sprite'),win('slime_king',true)]});
  w.wdRecordJourneySession(s,{sessionId:'fight-two',action:'Fight',minutes:25,zoneId:'verdant_vale',encounters:[win('stag_woodland'),win('bee_swarm')]});
};
test('Only real wins clear a route; attempted fights, wrong-world enemies and early travel do not',()=>{
  const s=fresh();w.wdRecordJourneySession(s,{sessionId:'loss',action:'Fight',minutes:90,encounters:[{killed:false,enemy:{id:'slime_king',boss:true}},win('kraken_deep',true)]});
  w.wdRecordJourneySession(s,{sessionId:'early',action:'Travel',minutes:900});
  assert.equal(w.wdJourneyStatus(s).enemyWins,0);assert.equal(w.wdJourneyStatus(s).bossDefeated,false);assert.equal(w.wdJourneyStatus(s).distance,0);
  assert.equal(w.wdUnlockZone(s,'frostpeak').ok,false);
  clear(s);assert.equal(w.wdJourneyStatus(s).routeCleared,true);assert(!s.world.unlockedZones.frostpeak);
});
test('Mounted Travel unlocks the next world sooner without changing focus, XP, coins or inventory',()=>{
  const foot=fresh();clear(foot);const mounted=clone(foot);mounted.hero.equipped.mount={lootId:'mount_storm_dragon',tier:'mythic'};
  const before=clone(mounted);
  const options={sessionId:'route',action:'Travel',minutes:50};
  w.wdRecordJourneySession(foot,options);const result=w.wdRecordJourneySession(mounted,options);
  assert.equal(w.wdJourneyStatus(foot).distance,50);assert.equal(w.wdJourneyStatus(mounted).distance,60);
  assert(!foot.world.unlockedZones.frostpeak);assert.equal(mounted.world.unlockedZones.frostpeak,true);assert.equal(result.unlockedZone,'frostpeak');
  for(const key of ['totalFocusMin','coins','hero','lootOwned','lootInstances','sessionsLog'])assert.deepEqual(mounted[key],before[key]);
  const once=JSON.stringify(mounted);assert(w.wdRecordJourneySession(mounted,options).duplicate);assert.equal(JSON.stringify(mounted),once);
});
test('Progress keeps old unlocked worlds, and sync unions independent new route receipts exactly once',()=>{
  const a=fresh();a.world.unlockedZones.astral_plains=true;clear(a);const b=fresh();
  w.wdRecordJourneySession(b,{sessionId:'elsewhere',action:'Fight',minutes:25,zoneId:'frostpeak',encounters:[win('ice_elemental')]});
  const out=w.wdMergeProgressionState(a,b,{});assert(out.world.unlockedZones.astral_plains);
  assert.equal(Object.keys(out.world.journeySessionRewards).length,3);
  const again=w.wdMergeProgressionState(out,a,{});assert.equal(Object.keys(again.world.journeySessionRewards).length,3);assert.equal(w.wdJourneyStatus(again,'verdant_vale').enemyWins,5);
});
test('Actual session pipeline persists its world result and replay cannot mint a second reward',()=>{
  const s=fresh();w.state=s;
  const first=w.lrSessionEndLootPipeline('Fight',90,'real-pipeline');
  assert(first.encounters.length>0);assert(s.world.journeySessionRewards['session:real-pipeline']);
  const saved=s.loot.sessionRewardReceipts['real-pipeline'];assert.equal(saved.policyVersion,4);assert(Object.keys(saved.rewardSnapshot.effects.world.set).some(path=>path.includes('journeySessionRewards')));
  const before=JSON.stringify(s);const second=w.lrSessionEndLootPipeline('Fight',90,'real-pipeline');assert(second.duplicate);assert.equal(JSON.stringify(s),before);
});
test('Captured world controls enemies, regional gear and route origin after a world switch',()=>{
  const s=fresh();s.world.currentZone='frostpeak';s.world.unlockedZones.frostpeak=true;w.state=s;
  const result=w.lrSessionEndLootPipeline('Fight',90,'captured-world',{zoneId:'verdant_vale'});
  assert.equal(result.zoneId,'verdant_vale');assert.equal(s.world.currentZone,'frostpeak');
  assert.equal(s.world.journeySessionRewards['session:captured-world'].zoneId,'verdant_vale');
  assert(result.encounters.every(e=>e.enemy.zoneId==='verdant_vale'));
  for(const drop of result.drops.filter(d=>!d.mountReason))assert(w.wdGearForZone('verdant_vale').includes(drop.templateId));
});
test('Travel reward preparation cannot announce an unlock before its durable save',()=>{
  const s=fresh();clear(s);s.hero.equipped.mount={lootId:'mount_storm_dragon',tier:'mythic'};w.state=s;
  const messages=[];w.toast=message=>messages.push(String(message));
  const result=w.lrSessionEndLootPipeline('Travel',50,'unconfirmed-route',{zoneId:'verdant_vale'});
  assert.equal(s.world.unlockedZones.frostpeak,true,'reward preparation calculates the pending unlock');
  assert(result.rewardSnapshot || s.loot.sessionRewardReceipts['unconfirmed-route']);
  assert(!messages.some(message=>/route complete|frostpeak.*unlocked/i.test(message)),'no success announcement precedes verified persistence');
});
test('Prior policy-3 receipts remain valid without loosening their proof requirements',()=>{
  const s=fresh();w.state=s;w.lrSessionEndLootPipeline('Fight',25,'prior-three');
  const prior=clone(s.loot.sessionRewardReceipts['prior-three']);prior.policyVersion=3;prior.rewardSnapshot.schemaVersion=3;
  prior.contentCommitment=w.lrRewardContentCommitment(prior.rewardSnapshot);prior.semanticCommitment=w.lrRewardSemanticCommitment('prior-three','Fight',25,3);
  assert.equal(w.lrNormalizeSessionRewardReceipt('prior-three',prior).policyVersion,3);
  const bad=clone(prior);delete bad.semanticCommitment;assert.throws(()=>w.lrNormalizeSessionRewardReceipt('prior-three',bad),/semantic commitment/);
});
// Additional adversarial scenarios from independent review.
test('Only actual victories can grant Fight equipment or route wins',()=>{
  let losses=0;
  for(let seed=0;seed<60;seed++){
    const s=fresh();s.hero.level=50;s.hero.hp=1;s.world.currentZone='astral_plains';w.state=s;
    const result=w.lrSessionEndLootPipeline('Fight',90,'independent-losing-fight-'+seed,{zoneId:'astral_plains'});
    assert(result.encounters.length>0);
    const winners=new Set(result.encounters.filter(e=>e.killed).map(e=>e.enemy.id));
    losses+=result.encounters.filter(e=>!e.killed).length;
    assert(result.drops.every(d=>winners.has(d.enemyId)));
    assert.equal(w.wdJourneyStatus(s,'astral_plains').enemyWins,result.encounters.filter(e=>e.killed&&!e.enemy.boss).length);
  }
  assert(losses>0,'fixture must include actual losses');
});
test('Each world records exactly its actual non-boss wins and captured origin',()=>{
  for(const zone of Object.keys(w.WD_ZONES)){
    const s=fresh();s.hero.level=100;s.world.currentZone='verdant_vale';w.state=s;
    const id='independent-route-'+zone,result=w.lrSessionEndLootPipeline('Fight',120,id,{zoneId:zone});
    const row=s.world.journeySessionRewards['session:'+id];
    assert.equal(row.enemyWins,result.encounters.filter(e=>e.killed&&!e.enemy.boss).length);
    assert.equal(row.bossDefeated,result.encounters.some(e=>e.killed&&e.enemy.boss));
    assert.equal(row.zoneId,zone);assert.equal(s.world.currentZone,'verdant_vale');
    for(const d of result.drops.filter(d=>!d.mountReason))assert(w.wdGearForZone(zone).includes(d.templateId));
  }
});
test('Mismatched session replay fails before adding route credit or loot',()=>{
  const s=fresh();w.state=s;w.lrSessionEndLootPipeline('Fight',25,'independent-repeat',{zoneId:'verdant_vale'});
  const saved=JSON.stringify(s);
  assert.throws(()=>w.lrSessionEndLootPipeline('Travel',25,'independent-repeat',{zoneId:'frostpeak'}),/semantic mismatch/);
  assert.equal(JSON.stringify(s),saved);
  assert.throws(()=>w.lrSessionEndLootPipeline('Fight',90,'independent-repeat'),/semantic mismatch/);
  assert.equal(JSON.stringify(s),saved);
});
test('Replay after world switch retains the original proof and gives nothing twice',()=>{
  const s=fresh();w.state=s;w.lrSessionEndLootPipeline('Fight',25,'independent-zone-replay',{zoneId:'verdant_vale'});
  s.world.currentZone='frostpeak';const saved=JSON.stringify(s);
  const result=w.lrSessionEndLootPipeline('Fight',25,'independent-zone-replay',{zoneId:'frostpeak'});
  assert(result.duplicate);assert.equal(result.zoneId,'verdant_vale');assert.equal(JSON.stringify(s),saved);
});
test('Unknown world fails with no credited route or economic change',()=>{
  const s=fresh();w.lrEnsureShape(s);w.state=s;const before=clone(s);
  assert.throws(()=>w.lrSessionEndLootPipeline('Travel',120,'independent-bad-world',{zoneId:'missing_world'}),/Unknown session world/);
  assert.equal(s.totalFocusMin,before.totalFocusMin);assert.equal(s.coins,before.coins);assert.deepEqual(s.hero,before.hero);
  assert(!s.world.journeySessionRewards?.['session:independent-bad-world']);
});
console.log(`${checks} gameplay regression checks passed`);
