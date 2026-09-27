/* Safari-engine supplement, not a physical iPhone/PWA certification.
 * A fresh synthetic context; only the supplied loopback source port is allowed.
 * Usage: node tests/mobile-webkit.mjs <loopback-port>
 * Install the pinned Playwright WebKit build; PLAYWRIGHT_BROWSERS_PATH may point
 * to a dedicated test-browser directory. No personal browser is ever attached.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const {webkit}=await import(process.env.LIFEXP_PLAYWRIGHT_MODULE||'playwright');
const port=Number(process.argv[2]);
assert(Number.isInteger(port)&&port>0&&port<65536,'a loopback source-server port is required');
const browser=await webkit.launch(process.env.LIFEXP_WEBKIT_PATH?{executablePath:process.env.LIFEXP_WEBKIT_PATH}:{});
const ctx=await browser.newContext({serviceWorkers:'block',acceptDownloads:false,viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2,timezoneId:'America/Toronto'});
const rows=[],errors=[],layoutMeasurements=[];
const check=(label,actual,expected=true)=>{assert.deepEqual(actual,expected,label);rows.push({label,actual});console.log('PASS',label);};
await ctx.route('**/*',route=>{const url=new URL(route.request().url());return url.hostname==='127.0.0.1'&&url.port===String(port)?route.continue():route.abort('blockedbyclient');});
const page=await ctx.newPage();
page.on('pageerror',error=>errors.push(error.message));
const ready=async()=>{await page.waitForFunction(()=>window.__FH_PRIMARY_READY__===true&&!!window.state&&!!window.finalizeStopwatch?.__fh11ClockLifecycle&&!!window.__fhEconomyTest);await page.waitForTimeout(500);};
const reload=async()=>{await page.reload({waitUntil:'load'});await ready();};
const accounting=()=>page.evaluate(()=>({minutes:state.totalFocusMin,sessions:state.completedFocusSessions,hero:{level:state.hero.level,xp:state.hero.xp},coins:state.coins,coinsEarned:state.coinsEarned,history:state.history,sessionHistory:state.sessionHistory,loot:state.loot,economy:window.__fhEconomyTest.totals()}));
async function setClock(name,elapsed,on){await page.evaluate(async({name,elapsed,on})=>{
  const s=window.state,stamp=Date.now()-elapsed-1000;
  if(s.timer.running)pauseTimer({persistState:false});setMode('stopwatch',{resetRun:true,persistState:false});
  s.activeTaskId='webkit_'+name;
  Object.assign(s.timer,{mode:'stopwatch',running:false,endAt:0,pausedAt:Date.now(),msLeft:0,plannedMs:0,swAccumulatedMs:elapsed,swStartedAt:0,swSessionStartedAt:stamp,
    activeTaskId:'webkit_'+name,activeTaskNameAtStart:name,priorityRun:on,workoutMode:false,swWorkoutMode:false,swLaps:[],
    runDetails:{startedAt:stamp,completedAt:0,adventureZoneId:'verdant_vale',pauses:[],timeChanges:[]}});
  Object.assign(s.settings,{gameMode:on,priorityMode:on,lockedInXpPct:on?25:70});s.adventure.action=on?'Travel':'Rest';renderAll();
  await saveStateDurable({fromPull:true,source:'synthetic-webkit-clock'});
},{name,elapsed,on});}
const clock=()=>page.evaluate(()=>({elapsed:state.timer.swAccumulatedMs,task:state.timer.activeTaskId,lockedIn:state.settings.gameMode,priority:state.settings.priorityMode,priorityRun:state.timer.priorityRun,rate:state.settings.lockedInXpPct,action:state.adventure.action}));
try{
  await page.goto(`http://127.0.0.1:${port}/index.html`,{waitUntil:'load',timeout:60000});await ready();
  check('WebKit hydrates a clean durable profile',await page.evaluate(()=>window.__FH_PRIMARY_READY__&&state.totalFocusMin===0));
  check('all release scripts passed the asset gate',await page.evaluate(()=>window.__FH_ASSET_FAILURES__||[]),[]);
  const calendar=await page.evaluate(()=>{
    const c=window.FH_CALENDAR;
    return {
      spring:(c.clockAt('2026-03-09',0,'America/Toronto')-c.clockAt('2026-03-08',0,'America/Toronto'))/3600000,
      autumn:(c.clockAt('2026-11-02',0,'America/Toronto')-c.clockAt('2026-11-01',0,'America/Toronto'))/3600000,
      toronto:c.clockAt('2026-09-27',0,'America/Toronto'),
      losAngeles:c.clockAt('2026-09-27',0,'America/Los_Angeles'),
      utc:c.clockAt('2026-09-27',0,'UTC')
    };
  });
  check('WebKit resolves shared-zone spring and autumn day lengths',[calendar.spring,calendar.autumn],[23,25]);
  check('WebKit uses the selected zone instead of the device zone',
    [calendar.toronto,calendar.losAngeles,calendar.utc],
    ['2026-09-27T04:00:00Z','2026-09-27T07:00:00Z','2026-09-27T00:00:00Z'].map(Date.parse));
  const encrypted=await page.evaluate(async()=>{
    const plain=JSON.parse(JSON.stringify(state));
    plain.sync={syncCode:'SYNTHETIC-WEBKIT',syncSecret:'synthetic-webkit-secret',playerId:'synthetic-webkit-profile',
      cloudRev:40,saltB64:b64(new Uint8Array(SALT_BYTES))};
    plain.settings.e2eEncryption=true;
    const blob=await encryptStateBlob(plain);
    const round=await decryptStateBlob(blob,plain.sync,{requireEncrypted:true,cloudRev:41});
    let plaintextError='',revisionError='';
    try{await decryptStateBlob({plain},plain.sync,{requireEncrypted:true});}catch(e){plaintextError=e.code;}
    try{await decryptStateBlob(blob,plain.sync,{requireEncrypted:true,cloudRev:42});}catch(e){revisionError=e.code;}
    return {version:blob.e2e.v,minutes:round.totalFocusMin,plaintextError,revisionError};
  });
  check('WebKit authenticates protocol 2 and rejects plaintext or row mismatch',encrypted,
    {version:2,minutes:0,plaintextError:'FH_SYNC_ENCRYPTION_REQUIRED',revisionError:'FH_SYNC_INVALID_ENVELOPE'});
  await page.evaluate(async()=>{
    state.tasks=['A','B'].map(name=>({id:'webkit_'+name,name:'Synthetic WebKit '+name,totalFocusMin:0,sessions:0,dailyMin:{},createdAt:Date.now(),lastUsedAt:Date.now()}));
    await saveStateDurable({fromPull:true,source:'synthetic-webkit-tasks'});
  });
  await setClock('A',50123,true);
  const beforeShort=await accounting();
  const short=await page.evaluate(async()=>{const result=await finalizeStopwatch();return {result,record:state.sessionsLog.find(r=>r.id===result.sessionId)};});
  check('50-second completion returns a durable success receipt',!!(short.result.ok&&short.result.logged&&short.result.sessionId));
  check('short session retains exact duration',[short.record.elapsedMs,short.record.seconds,short.record.minutes],[50123,50,0]);
  check('short session awards no XP or completed session',[short.record.xp,short.record.sessionCountApplied,short.record.rewarded],[0,0,false]);
  check('short session preserves Locked In and Priority flags',[short.record.lockedInRun,short.record.priorityRun],[true,true]);
  check('short session changes no accounting or reward totals',await accounting(),beforeShort);
  await reload();
  check('short session survives WebKit reload exactly',await page.evaluate(id=>state.sessionsLog.find(r=>r.id===id),short.result.sessionId),short.record);
  const replay=await page.evaluate(()=>finalizeStopwatch());check('repeated completion cannot duplicate short credit',replay.noChange);
  await setClock('A',300321,false);
  const ordinary=await page.evaluate(async()=>{const result=await finalizeStopwatch();return {result,record:state.sessionsLog.find(r=>r.id===result.sessionId),total:state.totalFocusMin,count:state.completedFocusSessions,rewards:Object.keys(state.loot.sessionRewardReceipts)};});
  check('ordinary five-minute session commits on WebKit',!!(ordinary.result.ok&&ordinary.result.logged));
  check('ordinary session adds exactly five minutes and one session',[ordinary.total,ordinary.count,ordinary.record.minutes],[5,1,5]);
  check('ordinary session receives its reward receipt',ordinary.rewards.includes(ordinary.result.sessionId));
  await reload();
  check('ordinary session and short record both survive reload',await page.evaluate(ids=>({total:state.totalFocusMin,count:state.completedFocusSessions,ids:state.sessionsLog.filter(r=>ids.includes(r.id)).map(r=>r.id).sort()}),[short.result.sessionId,ordinary.result.sessionId]),{total:5,count:1,ids:[short.result.sessionId,ordinary.result.sessionId].sort()});

  await setClock('A',10000,true);const a=await clock();
  const aId=await page.evaluate(async()=>{FH_UI11.addClock();await saveStateDurable({fromPull:true,source:'synthetic-webkit-park'});return FH_UI11.clocks()[0].id;});
  await setClock('B',21000,false);const b=await clock();
  await page.locator(`.fh11-chip[data-slot="${aId}"]`).click();check('switching restores clock A choices independently',await clock(),a);
  const bId=await page.evaluate(()=>FH_UI11.clocks()[0].id);
  await page.locator(`.fh11-chip[data-slot="${bId}"]`).click();check('switching restores clock B choices independently',await clock(),b);
  await page.evaluate(async()=>{await document.getElementById('priority-mode-badge').onclick();await saveStateDurable({fromPull:true,source:'synthetic-webkit-priority'});});
  check('Priority can turn on for the active clock',await page.evaluate(()=>[state.settings.priorityMode,state.timer.priorityRun]),[true,true]);
  await page.evaluate(async()=>{await document.getElementById('priority-mode-badge').onclick();await saveStateDurable({fromPull:true,source:'synthetic-webkit-priority-off'});});
  check('turning off active Priority preserves the parked clock choice',await page.evaluate(()=>[state.settings.priorityMode,state.timer.priorityRun,FH_UI11.clocks()[0].sessionSettings.priorityMode]),[false,false,true]);
  await reload();
  check('independent clock settings survive reload',await page.evaluate(()=>({activeLocked:state.settings.gameMode,activePriority:state.settings.priorityMode,activeElapsed:state.timer.swAccumulatedMs,parkedLocked:FH_UI11.clocks()[0].sessionSettings.gameMode,parkedElapsed:FH_UI11.clocks()[0].swAccumulatedMs})),{activeLocked:false,activePriority:false,activeElapsed:21000,parkedLocked:true,parkedElapsed:10000});

  for(const width of[320,390]){
    await page.setViewportSize({width,height:844});
    await page.locator('#btn-theme').click();await page.locator('.theme-swatch[data-theme="afterglow"]').click();
    check(`Afterglow theme applies at ${width}px`,await page.getAttribute('html','data-theme'),'afterglow');
    const chooser=await page.locator('#theme-modal .modal').evaluate(el=>{
      const box=node=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node);return{
        tag:node.tagName,id:node.id,className:String(node.className),left:r.left,right:r.right,width:r.width,
        clientWidth:node.clientWidth,scrollWidth:node.scrollWidth,minWidth:s.minWidth,maxWidth:s.maxWidth,
        gridTemplateColumns:s.gridTemplateColumns,display:s.display,font:s.font,whiteSpace:s.whiteSpace
      };};
      const bounds=el.getBoundingClientRect();
      return {viewport:innerWidth,modal:box(el),controls:[...el.querySelectorAll('.form-row,.val,select,input,.timer-style-preview,.theme-grid')].map(box),
        overflow:[...el.querySelectorAll('*')].filter(node=>{const r=node.getBoundingClientRect();return r.width>0&&(r.right>bounds.right+1||r.left<bounds.left-1);}).map(box)};
    });
    layoutMeasurements.push({width,chooser});console.log('LAYOUT',JSON.stringify({width,chooser}));
    check(`theme chooser fits ${width}px WebKit viewport`,chooser.modal.scrollWidth<=chooser.modal.clientWidth+2);
    await page.locator('#theme-modal [data-close]').click();
    const layout=await page.evaluate(()=>({viewport:innerWidth,root:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
    check(`main layout has no horizontal overflow at ${width}px`,layout.root<=width+2&&layout.body<=width+2&&layout.viewport<=width+2);
  }
  await page.evaluate(()=>saveStateDurable({fromPull:true,source:'synthetic-webkit-theme'}));await reload();
  check('new theme persists across WebKit reload',await page.getAttribute('html','data-theme'),'afterglow');
  check('WebKit reports no page errors',errors,[]);
  await mkdir(new URL('../test-results/',import.meta.url),{recursive:true});
  await page.screenshot({path:fileURLToPath(new URL('../test-results/mobile-webkit.png',import.meta.url))});
}catch(error){
  await mkdir(new URL('../test-results/',import.meta.url),{recursive:true});
  try{await page.screenshot({path:fileURLToPath(new URL('../test-results/mobile-webkit-failure.png',import.meta.url))});}catch{}
  throw error;
}finally{
  await mkdir(new URL('../test-results/',import.meta.url),{recursive:true});
  await writeFile(new URL('../test-results/mobile-webkit.json',import.meta.url),JSON.stringify({engine:'WebKit',scope:'isolated engine coverage, not physical iPhone/PWA certification',checks:rows,errors,layoutMeasurements},null,2));
  await ctx.close();await browser.close();
}
console.log(`${rows.length} WebKit checks passed.`);
