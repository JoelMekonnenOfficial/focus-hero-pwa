/* Non-destructive update paths; isolated synthetic browser only. */
import {launch,openApp,makeReporter} from './harness.mjs';
const R=makeReporter('forceupdate'),browser=await launch();
try{
 const {ctx,page,problems}=await openApp(browser,process.argv[2]||8998);
 const result=await page.evaluate(async()=>{
  const saved=JSON.stringify(window.state),realSW=navigator.serviceWorker,realCaches=window.caches,realReload=window.fhHardReloadFresh;
  let updated=0,removed=0,reloads=0;
  Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:{getRegistration:async()=>({update:async()=>updated++,unregister:async()=>removed++})}});
  Object.defineProperty(window,'caches',{configurable:true,value:{keys:async()=>['focus-hero-earlier'],delete:async()=>removed++}});
  window.fhHardReloadFresh=()=>reloads++;
  const ok=await window.fhForceUpdateNow();
  const untouched=JSON.stringify(window.state)===saved;
  const idleReloads=reloads;
  const timer=structuredClone(state.timer),clocks=state.fh11Clocks;
  state.timer.swAccumulatedMs=50123;
  const paused=await window.fhForceUpdateNow();
  state.timer=timer;state.fh11Clocks={slots:[{id:'synthetic-parked'}]};
  const parked=await window.fhForceUpdateNow();
  state.fh11Clocks=clocks;
  const priorReceipt=saveState._lastPrimarySave;
  saveState._lastPrimarySave={ok:false};
  const failedSave=await window.fhForceUpdateNow();
  saveState._lastPrimarySave=priorReceipt;
  Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:realSW});
  Object.defineProperty(window,'caches',{configurable:true,value:realCaches});window.fhHardReloadFresh=realReload;
  return {ok,updated,removed,reloads,idleReloads,untouched,paused,parked,failedSave};
 });
 R.check('idle update checks its own registration and reloads',result.ok&&result.updated===1&&result.idleReloads===1,JSON.stringify(result));
 R.eq('no cache or registration is removed',result.removed,0);
 R.check('idle update leaves profile untouched',result.untouched);
 R.check('paused and parked clocks and failed saves prevent reload',result.paused===false&&result.parked===false&&result.failedSave===false&&result.reloads===1);
 const standalone=await (await page.request.get(new URL('/reset-sw.html',page.url()).href)).text();
 R.check('standalone check keeps caches and worker registrations',!/(caches\.delete|\.unregister\s*\(|localStorage|indexedDB)/.test(standalone));
 R.check('standalone check does not auto-navigate',!/(location\.replace|location\.reload|setTimeout)/.test(standalone));
 R.check('standalone check is explicit and uses this registration',standalone.includes('getRegistration()')&&standalone.includes('registration.update()'));
 R.check('no browser errors',problems.length===0,problems.join(' | '));await ctx.close();
}finally{await browser.close();}
R.finish();
