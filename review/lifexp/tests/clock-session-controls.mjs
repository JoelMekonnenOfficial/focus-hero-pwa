/* Isolated synthetic clock controls. No production profile, data, or endpoints.
 * Usage: node tests/clock-session-controls.mjs [loopback-port]
 */
import { launch, openApp, makeReporter } from './harness.mjs';
const PORT = process.argv[2] || 9002;
const R = makeReporter('clock-session-controls.mjs');
const browser = await launch();
const expectedFailure = /accounting command rolled back.*finalizeStopwatch/;
const sessions = [];

async function fixture() {
  const app = await openApp(browser, PORT);
  sessions.push(app);
  await app.page.waitForFunction(() => !!window.finalizeStopwatch?.__fh11ClockLifecycle);
  await app.page.evaluate(async () => {
    window.__clockToasts = [];
    window.toast = (message, kind) => window.__clockToasts.push({message, kind});
    const s = window.state;
    s.tasks = ['A', 'B'].map(name => ({id: 'task_' + name, name, totalFocusMin: 0, sessions: 0, dailyMin: {}, lastUsedAt: Date.now()}));
    // This old record is a sentinel: current run controls must never edit it.
    s.sessionsLog.push({id:'synthetic_historical',type:'focus',source:'stopwatch',minutes:0,seconds:7,elapsedMs:7123,at:1700000000000,localDay:'2023-11-14',dayKey:'2023-11-14',taskId:'old_task',xp:0,rewarded:false,subMinute:true,lockedInRun:false,priorityRun:false,sessionCountApplied:0});
    window.__historical = JSON.stringify(s.sessionsLog.find(r=>r.id==='synthetic_historical'));
    window.__setClock = (name, elapsed, on) => {
      const x=window.state, stamp=Date.now()-120000;
      if(x.timer.running)window.pauseTimer({persistState:false});
      window.setMode('stopwatch', {resetRun:true,persistState:false});
      x.activeTaskId='task_'+name;
      Object.assign(x.timer, {mode:'stopwatch',running:false,endAt:0,pausedAt:Date.now(),msLeft:0,plannedMs:0,
        swAccumulatedMs:elapsed,swStartedAt:0,swSessionStartedAt:stamp,
        activeTaskId:'task_'+name,activeTaskNameAtStart:name,priorityRun:on,
        workoutMode:on,swWorkoutMode:on,
        runDetails:{startedAt:stamp,completedAt:0,pauses:[{id:'pause_'+name,pausedAt:stamp+1000,resumedAt:stamp+2000,durationMs:1000}],timeChanges:[]},
        swLaps:[{id:'lap_'+name,at:stamp+10000,elapsedMs:10000,durationMs:10000}]});
      Object.assign(x.settings,{gameMode:on,priorityMode:on,lockedInXpPct:on?25:70});
      x.adventure.action=on?'Travel':'Fight';
      x.timer.runDetails.adventureZoneId=on?'verdant_vale':'ember_wastes';
      window.renderAll();
    };
    window.__readClock = () => {
      const x=window.state,t=x.timer;
      return {elapsed:t.swAccumulatedMs,running:t.running,task:t.activeTaskId,activeTask:x.activeTaskId,
        lockedIn:x.settings.gameMode,priority:x.settings.priorityMode,priorityRun:t.priorityRun,
        rate:x.settings.lockedInXpPct,action:x.adventure.action,workout:t.workoutMode,laps:JSON.stringify(t.swLaps),details:JSON.stringify(t.runDetails)};
    };
    window.__clockTotals=()=>JSON.stringify({minutes:window.state.totalFocusMin,sessions:window.state.completedFocusSessions,
      hero:window.state.hero,coins:window.state.coins,coinsEarned:window.state.coinsEarned,history:window.state.history,
      sessionHistory:window.state.sessionHistory,tasks:window.state.tasks,streak:window.state.streak,
      lastFocusDate:window.state.lastFocusDate,cycle:window.state.cycleCount,loot:window.state.loot});
    window.__setClock('A',50123,true);
    await window.saveStateDurable({source:'synthetic-clock-fixture'});
  });
  return app;
}

try {
  {
    const {page}=await fixture();
    const a=await page.evaluate(()=>window.__readClock());
    const parked=await page.evaluate(async()=>{
      window.FH_UI11.addClock();
      await window.saveStateDurable({source:'synthetic-clock-fixture'});
      window.__setClock('B',75123,false);
      return window.FH_UI11.clocks()[0].id;
    });
    const b=await page.evaluate(()=>window.__readClock());
    await page.locator(`.fh11-chip[data-slot="${parked}"]`).click();
    const restoredA=await page.evaluate(()=>window.__readClock());
    R.check('clock A restores all run settings, task, time, laps and details',JSON.stringify(restoredA)===JSON.stringify(a));
    const bId=await page.evaluate(()=>window.FH_UI11.clocks()[0].id);
    await page.locator(`.fh11-chip[data-slot="${bId}"]`).click();
    R.check('clock B restores its independent choices',JSON.stringify(await page.evaluate(()=>window.__readClock()))===JSON.stringify(b));
    await page.evaluate(()=>window.saveStateDurable({source:'synthetic-clock-fixture'}));
    await page.reload({waitUntil:'load'});
    await page.waitForFunction(()=>!!window.finalizeStopwatch?.__fh11ClockLifecycle);
    const afterReload=await page.evaluate(()=>({current:window.state.settings,slot:window.FH_UI11.clocks()[0],task:window.state.timer.activeTaskId,elapsed:window.state.timer.swAccumulatedMs}));
    R.eq('current clock Priority survives reload',afterReload.current.priorityMode,false);
    R.eq('current clock Locked In survives reload',afterReload.current.gameMode,false);
    R.eq('current clock elapsed survives reload',afterReload.elapsed,75123);
    R.eq('parked Locked In survives reload',afterReload.slot.sessionSettings.gameMode,true);
    R.eq('parked Priority survives reload',afterReload.slot.sessionSettings.priorityMode,true);
    R.eq('parked Locked In rate survives reload',afterReload.slot.sessionSettings.lockedInXpPct,25);
    R.eq('parked adventure action survives reload',afterReload.slot.adventureAction,'Travel');
    R.eq('parked adventure origin survives reload',afterReload.slot.runDetails.adventureZoneId,'verdant_vale');
    R.eq('historical record is untouched by switching and reload',await page.evaluate(()=>JSON.stringify(window.state.sessionsLog.find(r=>r.id==='synthetic_historical'))),await page.evaluate(()=>JSON.stringify({id:'synthetic_historical',type:'focus',source:'stopwatch',minutes:0,seconds:7,elapsedMs:7123,at:1700000000000,localDay:'2023-11-14',dayKey:'2023-11-14',taskId:'old_task',xp:0,rewarded:false,subMinute:true,lockedInRun:false,priorityRun:false,sessionCountApplied:0})));
  }
  {
    const {page}=await fixture();
    const result=await page.evaluate(async()=>{
      window.__setClock('A',0,false);
      window.state.timer.swSessionStartedAt=0;
      window.state.world.currentZone='verdant_vale';
      window.startTimer();
      const origin=window.state.timer.runDetails.adventureZoneId;
      window.pauseTimer({persistState:false});
      window.state.timer.swAccumulatedMs=5*60000;
      window.state.world.currentZone='ember_wastes';
      const pipeline=window.lrSessionEndLootPipeline, calls=[];
      window.lrSessionEndLootPipeline=(action,minutes,id,opts)=>{calls.push({action,minutes,zoneId:opts?.zoneId});return {legacyItem:null,drops:[],encounters:[]};};
      const receipt=await window.finalizeStopwatch();
      window.lrSessionEndLootPipeline=pipeline;
      const record=window.state.sessionsLog.find(r=>r.id===receipt.sessionId);
      return {origin,calls,zone:window.state.world.currentZone,recordZone:record.sessionDetails.adventureZoneId};
    });
    R.eq('new run captures its original adventure world',result.origin,'verdant_vale');
    R.eq('stopwatch outcome forwards its captured world',result.calls[0]?.zoneId,'verdant_vale');
    R.eq('stopwatch outcome retains the selected action',result.calls[0]?.action,'Fight');
    R.eq('captured route does not change current world selection',result.zone,'ember_wastes');
    R.eq('new session retains its adventure origin',result.recordZone,'verdant_vale');
  }
  {
    const {page}=await fixture();
    const result=await page.evaluate(async()=>{
      window.__setClock('A',65000,false);
      window.startTimer();
      document.getElementById('priority-mode-badge').click();
      const on={running:window.state.timer.running,run:window.state.timer.priorityRun,setting:window.state.settings.priorityMode};
      document.getElementById('priority-mode-badge').click();
      const off={running:window.state.timer.running,run:window.state.timer.priorityRun,setting:window.state.settings.priorityMode};
      document.getElementById('priority-mode-badge').click();
      window.pauseTimer({persistState:false});
      const receipt=await window.finalizeStopwatch();
      const record=window.state.sessionsLog.find(r=>r.id===receipt.sessionId);
      return {on,off,receipt,record,historical:JSON.stringify(window.state.sessionsLog.find(r=>r.id==='synthetic_historical'))===window.__historical};
    });
    R.eq('Priority can turn on while the stopwatch runs',JSON.stringify(result.on),JSON.stringify({running:true,run:true,setting:true}));
    R.eq('Priority can turn off while the stopwatch runs',JSON.stringify(result.off),JSON.stringify({running:true,run:false,setting:false}));
    R.check('ordinary stopwatch completion returns a committed receipt',result.receipt.ok&&result.receipt.logged&&!!result.receipt.sessionId);
    R.eq('completed session records the mid-run Priority setting',result.record.priorityRun,true);
    R.eq('completed session validates Priority',result.record.priorityVerified,true);
    R.check('mid-run Priority never rewrites historical flags',result.historical);
  }
  {
    const {page}=await fixture();
    const result=await page.evaluate(async()=>{
      const totals=window.__clockTotals(), details=window.state.timer.runDetails, laps=JSON.stringify(window.state.timer.swLaps);
      const receipt=await window.finalizeStopwatch();
      const record=window.state.sessionsLog.find(r=>r.id===receipt.sessionId);
      const clock=window.__readClock(), again=await window.finalizeStopwatch();
      window.renderSessionHistoryPanel();
      const historySeconds=!!Array.from(document.querySelectorAll('.session-history-meta')).find(node=>node.textContent==='50s');
      const recentSeconds=window.renderEditableSessionRows().includes('>50s</div>');
      return {receipt,record,clock,again,historySeconds,recentSeconds,sameTotals:totals===window.__clockTotals(),laps,startedAt:details.startedAt,
        count:window.state.sessionsLog.filter(r=>r.id===receipt.sessionId).length,
        historical:JSON.stringify(window.state.sessionsLog.find(r=>r.id==='synthetic_historical'))===window.__historical,
        toasts:window.__clockToasts};
    });
    R.check('50-second session returns a durable receipt',result.receipt.ok&&result.receipt.logged&&!!result.receipt.sessionId);
    R.eq('short session preserves exact milliseconds',result.record.elapsedMs,50123);
    R.eq('short session records seconds honestly',result.record.seconds,50);
    R.check('session history displays the short duration in seconds',result.historySeconds);
    R.check('recent session list displays the short duration in seconds',result.recentSeconds);
    R.eq('short session invents no credited minute',result.record.minutes,0);
    R.eq('short session earns no session count',result.record.sessionCountApplied,0);
    R.eq('short session earns no XP',result.record.xp,0);
    R.eq('short session records its Locked In flag',result.record.lockedInRun,true);
    R.eq('short session records its Priority flag',result.record.priorityRun,true);
    R.eq('short session records Workout',result.record.workoutSession,true);
    R.eq('short session preserves the original start',result.record.startedAt,result.startedAt);
    R.eq('short session preserves laps',JSON.stringify(result.record.stopwatchLaps),result.laps);
    R.check('short session changes no totals or resources',result.sameTotals);
    R.eq('completed short clock no longer holds elapsed time',result.clock.elapsed,0);
    R.eq('completed short clock releases task binding',result.clock.task,null);
    R.eq('completed short clock clears run details',result.clock.details,'null');
    R.check('repeated Stop & Log cannot duplicate the short session',result.again.noChange&&result.count===1);
    R.check('short session leaves historical records untouched',result.historical);
    R.check('success message follows completed short-session save',result.toasts.some(t=>/50s logged/.test(t.message)));
  }
  {
    const {page}=await fixture();
    const result=await page.evaluate(async()=>{
      window.__setClock('B',75123,false);window.FH_UI11.addClock();
      await window.saveStateDurable({source:'synthetic-clock-fixture'});
      window.__setClock('A',50123,true);
      const receipt=await window.finalizeStopwatch();
      return {receipt,clock:window.__readClock(),slots:window.FH_UI11.clocks().length,records:window.state.sessionsLog.filter(r=>r.id!=='synthetic_historical').length};
    });
    R.check('logging short A retires it and promotes B',result.receipt.ok&&result.slots===0&&result.clock.task==='task_B');
    R.eq('promoted B retains its elapsed time',result.clock.elapsed,75123);
    R.eq('promoted B remains paused',result.clock.running,false);
    R.eq('promoted B restores Locked In',result.clock.lockedIn,false);
    R.eq('promoted B restores Priority',result.clock.priority,false);
    R.eq('promotion does not log the remaining clock',result.records,1);
  }
  for(const failure of ['insert','durable']){
    const {page}=await fixture();
    const result=await page.evaluate(async failure=>{
      const before=window.__readClock(),totals=window.__clockTotals();
      const originalInsert=window.pushSessionLog, originalSave=window.saveStateDurable;
      if(failure==='insert')window.pushSessionLog=()=>{throw new Error('synthetic record insertion failure');};
      else window.saveStateDurable=async opts=>opts?.source==='accounting:finalizeStopwatch'?false:originalSave(opts);
      const receipt=await window.finalizeStopwatch();
      window.pushSessionLog=originalInsert;window.saveStateDurable=originalSave;
      return {receipt,unchanged:JSON.stringify(before)===JSON.stringify(window.__readClock()),sameTotals:totals===window.__clockTotals(),
        records:window.state.sessionsLog.length,toasts:window.__clockToasts};
    },failure);
    R.eq(`${failure} failure is reported as a failure`,result.receipt.ok,false);
    R.check(`${failure} failure keeps the original unfinished clock`,result.unchanged);
    R.check(`${failure} failure changes no accounting totals`,result.sameTotals);
    R.eq(`${failure} failure leaves no partial new record`,result.records,1);
    R.check(`${failure} failure never announces a successful log`,!result.toasts.some(t=>/50s logged/.test(t.message)));
  }
  {
    const {page}=await fixture();
    const result=await page.evaluate(async()=>{
      window.__setClock('B',75123,false);window.FH_UI11.addClock();
      await window.saveStateDurable({source:'synthetic-clock-fixture'});
      window.__setClock('A',50123,true);
      const save=window.saveStateDurable;
      window.saveStateDurable=async opts=>opts?.source==='device-local-clocks'?false:save(opts);
      const receipt=await window.finalizeStopwatch();
      window.saveStateDurable=save;
      return {receipt,clock:window.__readClock(),slots:window.FH_UI11.clocks(),count:window.state.sessionsLog.filter(r=>r.id===receipt.sessionId).length,toasts:window.__clockToasts};
    });
    R.check('failed clock-promotion save distinguishes saved session from pending clock change',result.receipt.logged&&result.receipt.clockRetirementPending);
    R.eq('failed promotion retains the parked clock',result.slots.length,1);
    R.eq('failed promotion preserves the parked time',result.slots[0].swAccumulatedMs,75123);
    R.eq('failed promotion never resurrects logged time',result.clock.elapsed,0);
    R.eq('failed promotion restores current settings',result.clock.priority,true);
    R.eq('failed promotion does not duplicate the committed session',result.count,1);
    R.check('failed promotion gives a specific warning',result.toasts.some(t=>t.kind==='warn'&&/session was saved.*next-clock/.test(t.message)));
  }
  for(const {problems} of sessions){
    const unexpected=problems.filter(line=>!expectedFailure.test(line));
    R.check('isolated browser has no unexpected errors',unexpected.length===0,unexpected.join(' | '));
  }
} finally {
  await browser.close();
}
R.finish();
