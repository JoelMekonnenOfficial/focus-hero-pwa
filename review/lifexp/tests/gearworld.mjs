import { launch,openApp,makeReporter } from './harness.mjs';
import { mkdir } from 'node:fs/promises';
const R=makeReporter('gearworld.mjs'),browser=await launch();
try {
  const {ctx,page,problems}=await openApp(browser,process.argv[2],{settleMs:3500});
  const setup=await page.evaluate(()=>{
    const s=window.state;
    s.hero.equipped={weapon:{lootId:'whetstone_blade',tier:'rare',instanceId:'legacy-synthetic'},armor:{lootId:'moonplate_vest',tier:'epic'},mount:{lootId:'mount_storm_dragon',tier:'mythic',effect:{coinPct:30,label:'+30% coins'}}};
    s.lootOwned.whetstone_blade=1;
    s.lootInstances['legacy-synthetic']={iid:'legacy-synthetic',lootId:'whetstone_blade',tier:'rare',level:0,affixes:[{id:'xpPct',value:5,fixed:true},{id:'coinPct',value:6},{id:'energySave',value:2}],sockets:[],locked:false};
    const before=JSON.stringify(s.lootInstances);
    window.renderForgePanel();window.openLootInspector('legacy-synthetic');
    const inspector=document.getElementById('loot-inspector')?.textContent || document.body.textContent;
    const profile=window.fhGearUtilityCompute(s,{action:'Fight'});
    return {before,after:JSON.stringify(s.lootInstances),inspector,summary:document.getElementById('forge-panel')?.textContent||'',profile};
  });
  R.check('legacy affixes and appearance stay untouched during rendering',setup.before===setup.after);
  R.check('legacy economic affixes are explicitly inactive',/Retired XP perk \(inactive\)/.test(setup.inspector)&&!/\+5% XP|\+6% Coins|-2 Energy Cost/.test(setup.inspector));
  R.check('equipped mount shows actual route speed, and gear has no economic utility',setup.profile.travel.speedPct===22&&setup.profile.session.energySave===0&&setup.profile.loot.qualityBiasPct===0&&setup.profile.farm.harvestYieldPct===0);
  const route=await page.evaluate(()=>{
    if(window.closeModal)window.closeModal('#loot-inspector-modal');
    for(const el of document.querySelectorAll('.modal-backdrop'))el.hidden=true;
    const s=window.state,win=(id,boss=false)=>({killed:true,enemy:{id,boss}});
    window.wdRecordJourneySession(s,{sessionId:'ui-fight-a',action:'Fight',minutes:90,encounters:[win('stag_woodland'),win('bee_swarm'),win('sprite'),win('slime_king',true)]});
    window.wdRecordJourneySession(s,{sessionId:'ui-fight-b',action:'Fight',minutes:25,encounters:[win('stag_woodland'),win('bee_swarm')]});
    window.wdRecordJourneySession(s,{sessionId:'ui-travel',action:'Travel',minutes:25});
    window.fhRenderProgressionHub();
    document.querySelector('[data-tab="world"]').click();
    return document.getElementById('world-panel').textContent;
  });
  R.check('world route displays victories, boss and measured mount distance',/5\/5 enemy victories/.test(route)&&/boss defeated/.test(route)&&/30\.5\/60 Travel distance/.test(route)&&/22% route speed/.test(route));
  R.check('locked worlds show victory and Travel requirements, not purchases',/5 enemy wins, a boss win, then 60 Travel distance/.test(route)&&!/Unlock ·|Use map to unlock/.test(route));
  await mkdir(new URL('../test-results/',import.meta.url),{recursive:true});
  await page.locator('#world-panel').screenshot({path:new URL('../test-results/gear-world-review.png',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')});
  R.check('no unexpected browser errors',problems.length===0,problems.join('\n'));
  await ctx.close();
} finally {await browser.close();}
R.finish();
