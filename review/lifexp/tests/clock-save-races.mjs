/* Adversarial save timing, entirely inside disposable synthetic profiles. */
import { launch, openApp, makeReporter } from './harness.mjs';
const PORT=process.argv[2]||9002;
const R=makeReporter('clock-save-races.mjs');
const browser=await launch();
const apps=[];
async function fixture(){
  const app=await openApp(browser,PORT);apps.push(app);
  await app.page.waitForFunction(()=>!!window.finalizeStopwatch?.__fh11ClockLifecycle);
  await app.page.evaluate(async()=>{
    window.__messages=[];window.toast=(text,kind)=>window.__messages.push({text,kind});
    window.setMode('stopwatch',{resetRun:true,persistState:false});
    window.state.timer.swAccumulatedMs=70000;
    window.state.timer.swSessionStartedAt=Date.now()-70000;
    window.state.settings.gameMode=false;window.state.settings.priorityMode=false;window.state.timer.priorityRun=false;
    window.FH_UI11.addClock();
    await window.saveStateDurable({source:'synthetic-race-fixture'});
    window.state.timer.swAccumulatedMs=50123;
    window.state.timer.swSessionStartedAt=Date.now()-50123;
    window.state.settings.gameMode=true;window.state.settings.priorityMode=true;window.state.timer.priorityRun=true;
    window.__view=()=>JSON.stringify({timer:window.state.timer,clocks:window.state.fh11Clocks,
      lockedIn:window.state.settings.gameMode,priority:window.state.settings.priorityMode,action:window.state.adventure.action});
  });
  return app;
}
try{
  for(const race of ['start','switch','replace']){
    const {page}=await fixture();
    const out=await page.evaluate(async race=>{
      const save=window.saveStateDurable;let expected;
      window.saveStateDurable=async opts=>{
        const ok=await save(opts);
        if(opts?.source==='accounting:finalizeStopwatch'){
          if(race==='start')window.startTimer();
          else if(race==='switch')document.querySelector('.fh11-chip[data-slot]').click();
          else{
            const next=JSON.parse(JSON.stringify(window.state));
            next.timer.swAccumulatedMs=88888;next.timer.runDetails={startedAt:Date.now()-88888,pauses:[],timeChanges:[]};
            next.settings.gameMode=false;next.settings.priorityMode=false;next.timer.priorityRun=false;
            window.state=next;
          }
          expected=window.__view();
        }
        return ok;
      };
      const receipt=await window.finalizeStopwatch();
      window.saveStateDurable=save;
      return {receipt,same:window.__view()===expected,messages:window.__messages};
    },race);
    R.check(`${race}: completed save keeps the newer live clock`,out.same);
    R.check(`${race}: retirement explicitly detects the newer clock`,out.receipt.logged&&out.receipt.clockChangedWhileSaving);
    R.check(`${race}: user is told newer choices were retained`,out.messages.some(m=>/newer clock choices/.test(m.text)));
  }
  for(const race of ['in-place','replace']){
    const {page}=await fixture();
    const out=await page.evaluate(async race=>{
      const save=window.saveStateDurable;let expected;
      window.saveStateDurable=async opts=>{
        if(opts?.source!=='accounting:finalizeStopwatch')return save(opts);
        await Promise.resolve();
        if(race==='replace')window.state=JSON.parse(JSON.stringify(window.state));
        const s=window.state;
        s.totalFocusMin+=12;s.hero.xp+=1;s.timer.swAccumulatedMs=88888;
        s.history['2026-09-27']=(s.history['2026-09-27']||0)+12;
        s.sync.rev=(s.sync.rev||0)+1;
        expected=JSON.stringify(s);
        return false;
      };
      const receipt=await window.finalizeStopwatch();window.saveStateDurable=save;
      const actual=JSON.stringify(window.state),earlier=JSON.parse(expected),changed=Object.keys(window.state).filter(key=>JSON.stringify(window.state[key])!==JSON.stringify(earlier[key])).map(key=>({key,before:earlier[key],after:window.state[key]}));
      const retry=await window.finalizeStopwatch();
      return {receipt,same:actual===expected,changed,retry,locked:window.isAccountingStorageIndeterminate(),messages:window.__messages};
    },race);
    R.eq(`${race}: failed save never claims success`,out.receipt.ok,false);
    R.check(`${race}: failed save preserves newer progress byte for byte`,out.same,JSON.stringify(out.changed));
    R.check(`${race}: uncertainty is explicit and non-retryable`,out.receipt.newerStatePreserved&&out.receipt.retryable===false);
    R.check(`${race}: further accounting fails closed`,out.locked&&out.retry.reason==='storage_indeterminate');
    R.check(`${race}: no short-session success toast leaks through`,!out.messages.some(m=>/50s logged/.test(m.text)));
  }
  {
    const {page}=await fixture();
    const out=await page.evaluate(async()=>{
      const save=window.saveStateDurable;let expected;
      window.saveStateDurable=async opts=>{
        if(opts?.source!=='device-local-clocks')return save(opts);
        await Promise.resolve();
        window.state.timer.swAccumulatedMs=91919;
        window.state.settings.priorityMode=true;window.state.timer.priorityRun=true;
        expected=window.__view();return false;
      };
      const receipt=await window.finalizeStopwatch();window.saveStateDurable=save;
      return {receipt,same:window.__view()===expected};
    });
    R.check('failed secondary promotion never rolls back newer clock edits',out.same);
    R.check('failed secondary promotion remains an explicit partial UI result',out.receipt.clockRetirementPending&&out.receipt.logged);
  }
  {
    const {page}=await fixture();
    const out=await page.evaluate(async()=>{
      const save=window.saveState;const results=[];
      for(const failure of ['false','throw','reject']){
        window.state.settings.priorityMode=false;window.state.timer.priorityRun=false;
        window.saveState=()=>{if(failure==='throw')throw new Error('synthetic save throw');if(failure==='reject')return Promise.reject(new Error('synthetic async save rejection'));return false;};
        await document.getElementById('priority-mode-badge').onclick();
        results.push({setting:window.state.settings.priorityMode,run:window.state.timer.priorityRun});
      }
      window.saveState=save;
      return {results,messages:window.__messages};
    });
    R.check('Priority failure, throw, and rejected Promise restore prior settings',out.results.every(v=>v.setting===false&&v.run===false));
    R.eq('each Priority save failure surfaces a warning',out.messages.filter(m=>m.kind==='warn'&&/Priority could not be saved/.test(m.text)).length,3);
    const aba=await page.evaluate(async()=>{
      const save=window.saveState;
      window.state.settings.priorityMode=false;window.state.timer.priorityRun=false;
      let resolveFirst,calls=0;
      window.saveState=()=>++calls===1?new Promise(resolve=>{resolveFirst=resolve;}):true;
      const click=document.getElementById('priority-mode-badge').onclick;
      const first=click();await click();await click();resolveFirst(false);await first;
      window.saveState=save;
      return {setting:window.state.settings.priorityMode,run:window.state.timer.priorityRun};
    });
    R.check('older rejected Priority toggle cannot overwrite a newer off/on choice',aba.setting&&aba.run);
    const newClock=await page.evaluate(async()=>{
      const save=window.saveState;
      window.state.settings.priorityMode=false;window.state.timer.priorityRun=false;
      let rejectOld;
      window.saveState=()=>new Promise(resolve=>{rejectOld=resolve;});
      const oldChoice=document.getElementById('priority-mode-badge').onclick();
      window.saveState=save;
      window.FH_UI11.addClock();window.startTimer();
      const before={mode:window.state.settings.priorityMode,run:window.state.timer.priorityRun,running:window.state.timer.running};
      rejectOld(false);await oldChoice;
      const after={mode:window.state.settings.priorityMode,run:window.state.timer.priorityRun,running:window.state.timer.running};
      return {before,after};
    });
    R.eq('rejected Priority save for old clock cannot change newly started clock',JSON.stringify(newClock.after),JSON.stringify(newClock.before));
  }
  for(const priority of [true,false]){
    const {page}=await fixture();
    const out=await page.evaluate(priority=>{
      const slot=window.FH_UI11.clocks()[0];delete slot.sessionSettings;slot.priorityRun=priority;
      window.state.settings.priorityMode=!priority;window.state.settings.gameMode=false;
      document.querySelector('.fh11-chip[data-slot]').click();
      return {setting:window.state.settings.priorityMode,run:window.state.timer.priorityRun,locked:window.state.settings.gameMode,messages:window.__messages};
    },priority);
    R.eq(`legacy parked Priority ${priority} restores its known setting`,out.setting,priority);
    R.eq(`legacy parked Priority ${priority} agrees with its run flag`,out.run,priority);
    R.eq(`legacy clock does not invent missing Locked In truth (${priority})`,out.locked,false);
    R.check(`legacy clock explains missing Locked In setting (${priority})`,out.messages.some(m=>/older clock did not save Locked In/.test(m.text)));
  }
  for(const {problems} of apps)R.check('race fixture has no unexpected browser errors',problems.length===0,problems.join(' | '));
}finally{await browser.close();}
R.finish();
