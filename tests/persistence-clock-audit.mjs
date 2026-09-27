/* Actual application, ephemeral synthetic profiles, loopback server only.
 * node tests/persistence-clock-audit.mjs [port] [optional-case-filter]
 */
import {launch,openApp,makeReporter} from './harness.mjs';
import {readFileSync} from 'node:fs';
const port=process.argv[2]||9002,filter=process.argv[3]||'';
const R=makeReporter('persistence-clock-audit.mjs'),browser=await launch();
const cases=[];
const test=(name,fn)=>cases.push({name,fn});
async function fixture(){
  const app=await openApp(browser,port,{settleMs:1200,...(process.env.LIFEXP_AUDIT_ECONOMY_SOURCE||process.env.LIFEXP_AUDIT_INDEX_SOURCE?{routes:async ctx=>{
    for(const [file,variable,type] of [['focus-economy.js','LIFEXP_AUDIT_ECONOMY_SOURCE','text/javascript'],['index.html','LIFEXP_AUDIT_INDEX_SOURCE','text/html']]){
      if(!process.env[variable])continue;
      const body=readFileSync(process.env[variable],'utf8');
      await ctx.route('**/'+file+'*',r=>r.fulfill({status:200,contentType:type,body}));
    }
  }}:{})});
  await app.page.waitForFunction(()=>!!window.finalizeStopwatch?.__fh11ClockLifecycle);
  await app.page.evaluate(async()=>{
    window.__messages=[];window.toast=(text,kind)=>window.__messages.push({text,kind});
    window.setMode('stopwatch',{resetRun:true,persistState:false});
    Object.assign(window.state.timer,{swAccumulatedMs:50123,swSessionStartedAt:Date.now()-50123,running:false,swStartedAt:0});
    await window.saveStateDurable({source:'synthetic-audit-fixture'});
    const receipt=await window.finalizeStopwatch();
    if(!receipt?.sessionId)throw Error('Synthetic session was not created');
    window.__sessionId=receipt.sessionId;
  });
  return app;
}

test('async-delete-refusal',async()=>{
  const {page,ctx}=await fixture();
  const out=await page.evaluate(async()=>{
    const preserve=window.FH_RELIEF.preserveSnapshot;
    window.FH_RELIEF.preserveSnapshot=async()=>{
      await Promise.resolve();
      window.state.totalFocusMin=99;window.state.history['2026-09-27']=99;
      window.state.timer.swAccumulatedMs=88888;
      throw new Error('synthetic backup denial');
    };
    const result=await window.deleteSessionRecord(window.__sessionId);
    window.FH_RELIEF.preserveSnapshot=preserve;
    return {result,minutes:window.state.totalFocusMin,elapsed:window.state.timer.swAccumulatedMs,
      hasRecord:window.state.sessionsLog.some(r=>r.id===window.__sessionId),locked:window.isAccountingStorageIndeterminate()};
  });
  R.eq('backup refusal never rolls back newer focus minutes',out.minutes,99);
  R.eq('backup refusal never rolls back newer live time',out.elapsed,88888);
  R.check('backup refusal keeps the session that was not deleted',out.result.ok===false&&out.hasRecord);
  await ctx.close();
});

test('async-delete-rebase-failure',async()=>{
  const {page,ctx}=await fixture();
  const out=await page.evaluate(async()=>{
    const preserve=window.FH_RELIEF.preserveSnapshot,save=window.saveStateDurable;let calls=0;
    window.FH_RELIEF.preserveSnapshot=async()=>{
      if(++calls===1){await Promise.resolve();window.state.totalFocusMin=99;window.state.history['2026-09-27']=99;window.state.timer.swAccumulatedMs=88888;}
    };
    window.saveStateDurable=async opts=>opts?.source==='accounting:deleteSessionRecord'?false:save(opts);
    const result=await window.deleteSessionRecord(window.__sessionId);
    window.FH_RELIEF.preserveSnapshot=preserve;window.saveStateDurable=save;
    return {result,calls,minutes:window.state.totalFocusMin,elapsed:window.state.timer.swAccumulatedMs,
      hasRecord:window.state.sessionsLog.some(r=>r.id===window.__sessionId)};
  });
  R.check('deletion rechecks a backup after concurrent activity',out.calls>=2);
  R.eq('failed deletion save uses the latest preserved pre-mutation minutes',out.minutes,99);
  R.eq('failed deletion save uses the latest preserved pre-mutation timer',out.elapsed,88888);
  R.check('failed deletion save restores the deleted short record',out.result.ok===false&&out.hasRecord,JSON.stringify(out));
  await ctx.close();
});

test('async-delete-updated-reward-receipt',async()=>{
  const {page,ctx}=await fixture();
  const out=await page.evaluate(async()=>{
    const rec=window.state.sessionsLog.find(r=>r.id===window.__sessionId);
    Object.assign(rec,{minutes:5,originalMinutes:5,coins:4,rewarded:true});
    window.state.totalFocusMin=5;window.state.coins=4;window.state.coinsEarned=4;window.state.coinsSpent=0;
    const preserve=window.FH_RELIEF.preserveSnapshot,egg=window.eggApplyMinuteCorrection;let calls=0,eggDelta=0;
    window.eggApplyMinuteCorrection=function(s,delta,...args){eggDelta+=delta;return egg(s,delta,...args);};
    window.FH_RELIEF.preserveSnapshot=async()=>{
      await Promise.resolve();
      if(++calls===1){
        window.state=JSON.parse(JSON.stringify(window.state));
        Object.assign(window.state.sessionsLog.find(r=>r.id===window.__sessionId),{minutes:10,coins:10});
        window.state.totalFocusMin=10;window.state.coins=10;window.state.coinsEarned=10;
      }
    };
    const result=await window.deleteSessionRecord(window.__sessionId);
    window.FH_RELIEF.preserveSnapshot=preserve;window.eggApplyMinuteCorrection=egg;
    return {result,coins:window.state.coins,minutes:window.state.totalFocusMin,eggDelta};
  });
  R.check('deletion of concurrently updated session completes from verified current record',out.result.ok);
  R.eq('deletion reverses the current session coin receipt',out.coins,0);
  R.eq('deletion reverses the current session minute receipt',out.minutes,0);
  R.eq('deletion reverses the current session egg-minute receipt',out.eggDelta,-10);
  await ctx.close();
});

test('async-delete-continuation-ownership',async()=>{
  const {page,ctx}=await fixture();
  const out=await page.evaluate(async()=>{
    const rec=window.state.sessionsLog.find(r=>r.id===window.__sessionId);
    Object.assign(rec,{coins:4});window.state.coins=4;window.state.coinsEarned=4;window.state.coinsSpent=0;
    const render=window.renderAll;let injected=false;
    window.renderAll=function(){
      const result=render.apply(this,arguments);
      if(!injected&&!window.state.sessionsLog.some(r=>r.id===window.__sessionId)){
        injected=true;queueMicrotask(()=>{
          window.state=JSON.parse(JSON.stringify(window.state));
          window.state.coins=99;window.state.coinsEarned=99;window.state.totalFocusMin=99;
        });
      }
      return result;
    };
    const result=await window.deleteSessionRecord(window.__sessionId);window.renderAll=render;
    return {result,coins:window.state.coins,minutes:window.state.totalFocusMin,locked:window.isAccountingStorageIndeterminate()};
  });
  R.eq('deletion continuation never spends coins from a newer primary',out.coins,99);
  R.eq('deletion continuation never replaces a newer primary',out.minutes,99);
  R.check('unowned deletion continuation stops and marks accounting uncertain',out.result.ok===false&&out.result.reason==='storage_indeterminate'&&out.locked);
  await ctx.close();
});

test('async-delete-newer-tombstone',async()=>{
  const {page,ctx}=await fixture();
  const out=await page.evaluate(async()=>{
    const preserve=window.FH_RELIEF.preserveSnapshot;let calls=0;
    window.FH_RELIEF.preserveSnapshot=async()=>{
      await Promise.resolve();
      if(++calls===1){
        window.state=JSON.parse(JSON.stringify(window.state));
        window.state.sessionsLog=window.state.sessionsLog.filter(r=>r.id!==window.__sessionId);
        window.state.sessionTombstones[window.__sessionId]=Date.now()+1000;
        window.state.totalFocusMin=99;window.state.history['2026-09-27']=99;
      }
    };
    const result=await window.deleteSessionRecord(window.__sessionId);
    window.FH_RELIEF.preserveSnapshot=preserve;
    return {result,minutes:window.state.totalFocusMin,hasRecord:window.state.sessionsLog.some(r=>r.id===window.__sessionId),tombstone:window.state.sessionTombstones[window.__sessionId]};
  });
  R.eq('not-found after an awaited backup preserves newer totals',out.minutes,99);
  R.eq('not-found after an awaited backup never resurrects deleted history',out.hasRecord,false);
  R.check('newer deletion tombstone is retained',out.tombstone>0);
  await ctx.close();
});

test('no-change-interleave',async()=>{
  const {page,ctx}=await fixture();
  const out=await page.evaluate(async()=>{
    window.state.timer.priorityRun=true;window.state.settings.priorityMode=true;
    queueMicrotask(()=>{window.state.totalFocusMin=99;window.state.timer.swAccumulatedMs=88888;});
    const result=await window.finalizeStopwatch();
    return {result,minutes:window.state.totalFocusMin,elapsed:window.state.timer.swAccumulatedMs,priority:window.state.timer.priorityRun};
  });
  R.eq('no-change receipt does not replace newer focus minutes',out.minutes,99);
  R.eq('no-change receipt does not replace a newer clock',out.elapsed,88888);
  R.eq('no-change receipt does not disable current Priority',out.priority,true);
  await ctx.close();
});

test('focus-autostart-ownership',async()=>{
  const {page,ctx}=await fixture();
  const out=await page.evaluate(async()=>{
    const stamp=Date.now(),claim={sessionId:'focus_audit_autostart',plannedMinutes:2,selectedMinutes:2,plannedMs:120000,elapsedMs:120000,startedAt:stamp-120000,completedAt:stamp,action:'Travel'};
    window.state.settings.autoStart=true;
    const result=await window.commitFocusTimerSession(claim,2);
    window.setMode('stopwatch',{resetRun:true,persistState:false});
    window.state.timer.swAccumulatedMs=88888;
    await new Promise(resolve=>setTimeout(resolve,1100));
    return {result,running:window.state.timer.running,elapsed:window.state.timer.swAccumulatedMs};
  });
  R.check('focus claim commits successfully before starting another clock',out.result.ok);
  R.eq('old auto-start callback cannot start the replacement clock',out.running,false);
  R.eq('old auto-start callback leaves replacement elapsed time intact',out.elapsed,88888);
  await ctx.close();
});

test('focus-autostart-normal-and-opt-out',async()=>{
  for(const optOut of [false,true]){
    const {page,ctx}=await fixture();
    const out=await page.evaluate(async optOut=>{
      const stamp=Date.now(),claim={sessionId:'focus_audit_auto_normal',plannedMinutes:2,plannedMs:120000,elapsedMs:120000,completedAt:stamp,action:'Travel'};
      window.state.settings.autoStart=true;
      if(optOut)queueMicrotask(()=>{window.state.settings.autoStart=false;});
      const result=await window.commitFocusTimerSession(claim,2);
      await new Promise(resolve=>setTimeout(resolve,1100));
      return {result,running:window.state.timer.running,autoStart:window.state.settings.autoStart};
    },optOut);
    R.eq(`auto-start respects the current preference (${optOut?'opted out':'enabled'})`,out.autoStart,!optOut);
    R.eq(`auto-start only starts an unchanged eligible clock (${optOut?'opted out':'enabled'})`,out.running,!optOut);
    await ctx.close();
  }
});

test('focus-duplicate-cleanup',async()=>{
  const {page,ctx}=await fixture();
  const out=await page.evaluate(async()=>{
    const stamp=Date.now(),claim={sessionId:'focus_audit_duplicate',plannedMinutes:2,selectedMinutes:2,plannedMs:120000,elapsedMs:120000,startedAt:stamp-120000,completedAt:stamp,action:'Travel',priorityRun:false};
    window.state.settings.autoStart=false;
    const first=await window.commitFocusTimerSession(claim,2);
    window.persistPendingFocusClaim(claim,{save:false});
    window.setMode('stopwatch',{resetRun:true,persistState:false});
    window.state.timer.swAccumulatedMs=88888;window.state.timer.priorityRun=true;window.state.settings.priorityMode=true;
    const second=await window.commitFocusTimerSession(claim,2);
    return {first,second,priority:window.state.timer.priorityRun,elapsed:window.state.timer.swAccumulatedMs,
      records:window.state.sessionsLog.filter(r=>r.id===claim.sessionId).length,total:window.state.totalFocusMin};
  });
  R.check('old focus claim is recognized as duplicate cleanup',out.second.duplicate&&out.second.commitCleanup);
  R.eq('duplicate focus cleanup cannot disable another run Priority',out.priority,true);
  R.eq('duplicate focus cleanup preserves the newer run time',out.elapsed,88888);
  R.eq('focus claim replay never duplicates its session',out.records,1);
  R.eq('focus claim replay credits minutes once',out.total,2);
  await ctx.close();
});

test('indexeddb-quota-abort',async()=>{
  const {page,ctx}=await fixture();
  const out=await page.evaluate(async()=>{
    window.state.timer.swAccumulatedMs=50123;window.state.timer.swSessionStartedAt=Date.now()-50123;
    await window.saveStateDurable({source:'synthetic-before-quota'});
    window.__messages=[];
    const reader=window.FH_PRIMARY_STORE.create({writerId:'synthetic-quota-reader'}),before=await reader.readHead();
    const put=IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put=function(value,key){if(this.name==='stateSlots'&&key==='head')throw new DOMException('Synthetic quota exhausted','QuotaExceededError');return put.apply(this,arguments);};
    const result=await window.finalizeStopwatch();IDBObjectStore.prototype.put=put;
    const after=await reader.readHead();await reader.close();
    return {result,sameHead:before.raw===after.raw&&before.head.commitId===after.head.commitId,
      elapsed:window.state.timer.swAccumulatedMs,count:window.state.sessionsLog.length,
      success:window.__messages.filter(m=>/50s logged/.test(m.text)).length};
  });
  R.eq('actual IndexedDB quota abort reports failure',out.result.ok,false);
  R.check('actual IndexedDB quota abort preserves the exact durable head',out.sameHead);
  R.eq('actual IndexedDB quota abort restores unfinished time',out.elapsed,50123);
  R.eq('actual IndexedDB quota abort leaves no partial new record',out.count,1);
  R.eq('actual IndexedDB quota abort announces no successful log',out.success,0);
  await page.reload({waitUntil:'load'});
  await page.waitForFunction(()=>!!window.finalizeStopwatch?.__fh11ClockLifecycle);
  const after=await page.evaluate(()=>({elapsed:window.state.timer.swAccumulatedMs,count:window.state.sessionsLog.length}));
  R.eq('reload after actual quota abort keeps unfinished time',after.elapsed,50123);
  R.eq('reload after actual quota abort keeps only committed history',after.count,1);
  await ctx.close();
});

test('subminute-correction-and-delete',async()=>{
  const {page,ctx}=await fixture();
  const out=await page.evaluate(async()=>{
    const before=JSON.stringify(window.state.sessionsLog.find(r=>r.id===window.__sessionId));
    const edit=await window.applySessionEdit(window.__sessionId,1);
    const unchanged=before===JSON.stringify(window.state.sessionsLog.find(r=>r.id===window.__sessionId));
    const removed=await window.deleteSessionRecord(window.__sessionId);
    return {edit,unchanged,removed,minutes:window.state.totalFocusMin,sessions:window.state.completedFocusSessions,
      count:window.state.sessionsLog.length,tombstone:window.state.sessionTombstones[window.__sessionId],xp:window.state.hero.xp};
  });
  R.check('subminute record refuses a minute-only edit without altering its exact duration',out.edit.reason==='not_editable'&&out.unchanged);
  R.check('explicit short-session deletion succeeds through real verified backup',out.removed.ok);
  R.eq('short-session deletion removes only its record',out.count,0);
  R.eq('short-session deletion reverses no invented minutes',out.minutes,0);
  R.eq('short-session deletion reverses no invented session credit',out.sessions,0);
  R.check('short-session deletion creates a resurrection fence',out.tombstone>0);
  await ctx.close();
});

test('indexeddb-boot-denied',async()=>{
  const ctx=await browser.newContext({serviceWorkers:'block',timezoneId:'America/Toronto'});
  await ctx.route('**/*',route=>{const u=new URL(route.request().url());return u.hostname==='127.0.0.1'&&u.port===String(port)?route.continue():route.abort('blockedbyclient');});
  await ctx.addInitScript(()=>{
    window.__deniedWrites=[];
    const put=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){window.__deniedWrites.push(String(key));return put.apply(this,arguments);};
    Object.defineProperty(indexedDB,'open',{value:()=>{throw new DOMException('Synthetic storage denial','SecurityError');}});
  });
  const page=await ctx.newPage();await page.goto(`http://127.0.0.1:${port}/index.html`,{waitUntil:'load'});
  await page.waitForTimeout(1200);
  const out=await page.evaluate(()=>({save:window.saveState?.(),profileWrites:window.__deniedWrites.filter(key=>key==='focusHero.v4.state'),
    blocked:!!document.getElementById('__fh_safe'),panel:document.getElementById('__fh_safe')?.textContent}));
  R.eq('IndexedDB denial never enables the legacy save path',out.save,false);
  R.eq('IndexedDB denial never manufactures a replacement legacy profile',out.profileWrites.length,0);
  R.check('IndexedDB denial is visible instead of silent fallback',out.blocked,out.blocked?'storage pause panel is visible':JSON.stringify(out));
  await ctx.close();
});

test('crash-between-log-promotion',async()=>{
  const {page,ctx}=await fixture();
  const setup=await page.evaluate(async()=>{
    window.state.timer.swAccumulatedMs=75123;window.FH_UI11.addClock();
    await window.saveStateDurable({source:'synthetic-before-crash'});
    window.state.timer.swAccumulatedMs=50123;window.state.timer.swSessionStartedAt=Date.now()-50123;
    const save=window.saveStateDurable;
    window.saveStateDurable=async opts=>{
      if(opts?.source==='device-local-clocks'){window.__promotionHeld=true;return new Promise(()=>{});}
      return save(opts);
    };
    void window.finalizeStopwatch();return true;
  });
  await page.waitForFunction(()=>window.__promotionHeld===true);
  await page.close();
  const reopened=await ctx.newPage();await reopened.goto(`http://127.0.0.1:${port}/index.html`,{waitUntil:'load'});
  await reopened.waitForFunction(()=>!!window.finalizeStopwatch?.__fh11ClockLifecycle);
  const out=await reopened.evaluate(()=>({count:window.state.sessionsLog.length,
    elapsed:[window.state.timer.swAccumulatedMs,...window.FH_UI11.clocks().map(c=>c.swAccumulatedMs)],
    exact:window.state.sessionsLog.filter(r=>r.elapsedMs===50123).length}));
  R.eq('crash after log preserves each committed short session exactly once',out.count,2);
  R.eq('crash after log preserves exact short durations',out.exact,2);
  R.eq('crash after log preserves only unlogged remaining clock time',out.elapsed.reduce((a,b)=>a+b,0),75123);
  await ctx.close();
});

try{
  for(const item of cases)if(!filter||item.name.includes(filter)){
    console.log('\nCASE '+item.name);await item.fn();
  }
}finally{await browser.close();}
R.finish();
