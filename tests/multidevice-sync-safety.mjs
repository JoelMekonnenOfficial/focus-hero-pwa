/* Actual browser/source/encryption/IndexedDB/CAS audit. Disposable contexts and
 * one in-memory synthetic server row only; every non-loopback request blocked.
 * Historical source is read from Git, never from a player's device or profile.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './harness.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseline = process.env.LIFEXP_SYNC_BASELINE || 'd9d8d6c0';
execFileSync('git',['cat-file','-e',`${baseline}:starmax/index.html`],{cwd:root,stdio:'pipe'});
const evidence = [], cache = new Map();
const mime = {'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
const server = createServer(async (req,res) => {
  try {
    const u = new URL(req.url, 'http://localhost');
    const old = u.pathname.startsWith('/old/');
    const relative = decodeURIComponent(u.pathname.replace(/^\/(?:old\/)?/, '')) || 'index.html';
    if(relative.includes('..')) throw Error('bad path');
    let bytes;
    if(old){
      if(!cache.has(relative)) cache.set(relative,execFileSync('git',['show',`${baseline}:starmax/${relative}`],{cwd:root,maxBuffer:20*1024*1024,stdio:['ignore','pipe','ignore']}));
      bytes=cache.get(relative);
    } else bytes=await readFile(path.join(root,'starmax',relative));
    res.writeHead(200,{'Content-Type':mime[path.extname(relative)]||'application/octet-stream','Cache-Control':'no-store'}).end(bytes);
  } catch { res.writeHead(404).end('missing fixture source'); }
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port, browser=await launch();
const contexts=[];
const sync = {enabled:false,backend:'supabase',syncCode:'SYNTHETIC-AUDIT-CODE',syncSecret:'SYNTHETIC-AUDIT-SECRET-NOT-A-CREDENTIAL',syncSecretHash:'synthetic-audit-secret-hash',playerId:'synthetic-three-device-player',userId:'synthetic-auth-id',userToken:'synthetic.jwt.token',tokenExpiresAt:Date.now()+3600000,cloudRev:100,pendingSync:false,pendingSince:0,lastSyncError:null,retryCount:0,retryAfter:0,createAuthorization:null,lastReplayStorm:null,saltB64:'MDEyMzQ1Njc4OWFiY2RlZg=='};
function cloud(){return{row:null,requests:[],fault:null,async route(route){
  const req=route.request(),u=new URL(req.url()),method=req.method();
  if(!u.pathname.endsWith('/rest/v1/players')) return route.abort('blockedbyclient');
  this.requests.push({method,query:u.search});
  if(method==='GET'){
    const fields=(u.searchParams.get('select')||'').split(',');
    const out=this.row&&Object.fromEntries(fields.map(k=>[k,this.row[k]]));
    if(this.beforeReadReply){const hook=this.beforeReadReply;this.beforeReadReply=null;await hook();}
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(out?[out]:[])});
  }
  assert.equal(method,'PATCH','unexpected create/auth/write');
  const rev=Number(u.searchParams.get('cloud_rev')?.slice(3));
  const body=JSON.parse(req.postData());
  const matches=rev===this.row.cloud_rev;
  if(matches)this.row={...this.row,...body};
  if(matches&&this.afterAccept){const hook=this.afterAccept;this.afterAccept=null;await hook();}
  if(matches&&this.fault==='lost-after-accept'){this.fault=null;return route.abort('failed');}
  if(matches&&this.fault==='malformed-after-accept'){this.fault=null;return route.fulfill({status:200,contentType:'application/json',body:'{}'});}
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(matches?[{cloud_rev:this.row.cloud_rev}]:[])});
}};}
async function device(name,c,old=false,base=null){
  const ctx=await browser.newContext({serviceWorkers:'block',acceptDownloads:false,timezoneId:'America/Toronto',viewport:name==='phone'?{width:390,height:844}:{width:1280,height:900}});contexts.push(ctx);
  await ctx.route('**/*',route=>{const u=new URL(route.request().url());return u.hostname==='127.0.0.1'&&u.port===String(port)?route.continue():u.hostname.endsWith('.supabase.co')?c.route(route):route.abort('blockedbyclient');});
  const page=await ctx.newPage();
  page.on('pageerror',e=>console.error('SYNTHETIC PAGE ERROR',name,e.message));
  page.on('console',m=>{if(m.type()==='error')console.error('SYNTHETIC CONSOLE',name,m.text());});
  await page.goto(`http://127.0.0.1:${port}/${old?'old/':''}index.html`,{waitUntil:'load'});
  await page.waitForFunction(()=>!!window.state&&typeof window.saveStateDurable==='function');
  await page.waitForTimeout(600);
  await page.evaluate(async({sync,base,name})=>{
    if(base)window.state=structuredClone(base);
    Object.assign(window.state.sync,sync,{deviceName:name});
    window.state.settings.e2eEncryption=true;
    await saveStateDurable({fromPull:true,suppressMilestoneAnnouncement:true,source:'synthetic-audit-setup'});
  },{sync,base,name});
  return {name,page,ctx,old};
}
async function snapshot(d){await d.page.waitForFunction(()=>!!window.state&&typeof window.__fhEconomyTest?.totals==='function');return d.page.evaluate(()=>({total:state.totalFocusMin,history:state.history,tasks:state.tasks.map(t=>({id:t.id,total:t.totalFocusMin})),sessions:state.sessionsLog.map(s=>({id:s.id,minutes:s.minutes})),receipts:Object.fromEntries(Object.entries(state.loot.sessionRewardReceipts).map(([k,v])=>[k,v.policyVersion])),pending:state.sync.pendingSync,error:state.sync.lastSyncError,rev:state.sync.cloudRev,protocol:state.sync.cloudProtocolVersion||1,coins:state.coins,xp:totalXpForLevel(state.hero.level)+state.hero.xp,economy:window.__fhEconomyTest.totals(),harvests:state.focusEconomy.harvests.length}));}
async function invoke(d,what){return d.page.evaluate(async what=>{try{const result=await window[what]({force:true,requireRemote:true,reason:'synthetic-audit'});return{ok:true,result:typeof result==='object'?{uploadedCloudRev:result?.uploadedCloudRev,replayRequired:result?.replayRequired}:result};}catch(e){return{ok:false,code:e.code||'',message:e.message};}},what);}
async function edit(d,taskId,minutes,id){return d.page.evaluate(async({taskId,minutes,id})=>await applyTaskTimeAdjustment(taskId,minutes,{operationId:id,surface:'synthetic-audit'}),{taskId,minutes,id});}
async function scenario(name,fn){if(process.env.LIFEXP_SYNC_SCENARIO&&!name.includes(process.env.LIFEXP_SYNC_SCENARIO))return;const start=contexts.length;try{await fn();console.log('PASS',name);evidence.push({name,pass:true});}catch(e){console.log('FAIL',name,e.message);evidence.push({name,pass:false,error:e.message});}finally{await Promise.all(contexts.splice(start).map(c=>c.close()));}}
async function setup(oldFlags=[false,false,false]){
  const c=cloud();
  const a=await device('chrome',c,oldFlags[0]);
  const taskId=await a.page.evaluate(async()=>{const t=createTask({name:'Synthetic shared skill'});await saveStateDurable({fromPull:true,source:'synthetic-task'});return t.id;});
  const base=await a.page.evaluate(()=>structuredClone(state));
  c.row={id:sync.playerId,cloud_rev:100,sync_secret_hash:sync.syncSecretHash,updated_at:new Date().toISOString(),data:await a.page.evaluate(()=>encryptStateBlob({...state,sync:{...state.sync,cloudRev:99}}))};
  const devices=[a];for(let i=1;i<oldFlags.length;i++)devices.push(await device(['chrome','opera','phone'][i],c,oldFlags[i],base));
  return{c,devices,taskId};
}
try{
  await scenario('three updated devices preserve concurrent independent sessions',async()=>{
    const {c,devices,taskId}=await setup();
    for(let i=0;i<3;i++)assert.equal((await edit(devices[i],taskId,[17,23,31][i],`concurrent-${i}`)).ok,true);
    const pushes=await Promise.all(devices.map(d=>invoke(d,'cloudPush')));
    for(const d of devices){await invoke(d,'cloudPull');await invoke(d,'cloudPush');}
    for(const d of devices)await invoke(d,'cloudPull');
    const states=await Promise.all(devices.map(snapshot));
    evidence.push({detail:'concurrent',pushes,states,requests:c.requests});
    assert.deepEqual(states.map(s=>s.total),[71,71,71]);
    assert(states.every(s=>s.sessions.length===3&&[0,1,2].every(i=>s.receipts[`ledger_concurrent-${i}`]===4)));
    assert(states.every(s=>s.economy.farmMinutes===71&&s.economy.materials.timber===4&&s.economy.materials.seed===1),'distinct offline session materials are additive');
    for(const d of devices)assert.equal((await edit(d,taskId,17,'concurrent-0')).duplicate,true);
    assert.deepEqual((await Promise.all(devices.map(snapshot))).map(s=>s.total),[71,71,71]);
  });
  await scenario('accepted upload with lost response reconciles without duplicate progress',async()=>{
    const {c,devices,taskId}=await setup();const[a,b,d]=devices;
    assert.equal((await edit(a,taskId,19,'lost-receipt')).ok,true);
    c.fault='lost-after-accept';const failed=await invoke(a,'cloudPush');assert.equal(failed.ok,false);
    assert.equal((await snapshot(a)).pending,true);
    for(const x of[b,d,a]){assert.equal((await invoke(x,'cloudPull')).ok,true);assert.equal((await invoke(x,'cloudPush')).ok,true);}
    for(const x of devices)await invoke(x,'cloudPull');
    const states=await Promise.all(devices.map(snapshot));evidence.push({detail:'lost-response',failed,states,requests:c.requests});
    assert.deepEqual(states.map(s=>s.total),[19,19,19]);assert(states.every(s=>s.sessions.length===1));
  });
  await scenario('mixed clients refuse authenticated protocol before merging and retain offline work on upgrade',async()=>{
    const {c,devices,taskId}=await setup([true,false,true]);const[a,b,d]=devices;
    assert.equal((await edit(a,taskId,11,'old-offline-progress')).ok,true);
    assert.equal((await edit(b,taskId,29,'new-policy-four')).ok,true);
    assert.equal((await invoke(b,'cloudPush')).ok,true);
    const pulls=await Promise.all([invoke(a,'cloudPull'),invoke(d,'cloudPull')]);
    const states=await Promise.all(devices.map(snapshot));evidence.push({detail:'mixed-policy',pulls,states,requests:c.requests});
    assert(pulls.every(p=>!p.ok&&/Decrypt failed/.test(p.message)),JSON.stringify(pulls));
    assert.deepEqual(states.map(s=>s.total),[11,29,0]);assert.deepEqual(states.map(s=>s.rev),[100,101,100]);
    await a.page.evaluate(()=>document.getElementById('btn-sync-now').onclick());assert.equal((await snapshot(a)).rev,100);
    const before=JSON.stringify(c.row),blocked=await invoke(a,'cloudPush');assert.equal(blocked.ok,false);assert.equal(JSON.stringify(c.row),before);
    evidence.push({detail:'old-client-conflict-retry',blocked});
    for(const x of[a,d]){await x.page.goto(`http://127.0.0.1:${port}/index.html`,{waitUntil:'load'});await x.page.waitForFunction(()=>!!window.state);await x.page.waitForTimeout(600);}
    assert.equal((await snapshot(a)).total,11,'upgrade retains old offline session in its existing synthetic IndexedDB');
    for(const x of devices){assert.equal((await invoke(x,'cloudPull')).ok,true);assert.equal((await invoke(x,'cloudPush')).ok,true);}
    for(const x of devices)await invoke(x,'cloudPull');
    const upgraded=await Promise.all(devices.map(snapshot));evidence.push({detail:'mixed-upgrade-catchup',states:upgraded});
    assert.deepEqual(upgraded.map(s=>s.total),[40,40,40]);
    assert(upgraded.every(s=>s.receipts['ledger_old-offline-progress']===3&&s.receipts['ledger_new-policy-four']===4));
  });
  await scenario('malformed accepted receipt stays queued and retry reconciles once',async()=>{
    const {c,devices,taskId}=await setup([false,false]);const[a,b]=devices;
    assert.equal((await edit(a,taskId,13,'malformed-receipt')).ok,true);
    c.fault='malformed-after-accept';const failed=await invoke(a,'cloudPush');
    assert.equal(failed.code,'FH_SYNC_UNCONFIRMED_RECEIPT');
    assert.equal(c.requests.filter(r=>r.method==='PATCH').length,1);
    const pending=await snapshot(a);assert.equal(pending.pending,true);assert.match(pending.error,/unconfirmed/);
    assert.equal((await invoke(a,'cloudPush')).ok,true);
    assert.equal((await invoke(b,'cloudPull')).ok,true);
    assert.equal((await snapshot(b)).total,13);assert.equal((await snapshot(b)).sessions.length,1);
    evidence.push({detail:'malformed-receipt',failed,pending,requests:c.requests});
  });
  await scenario('primary commit refusal blocks unsaved edits before any upload',async()=>{
    const {c,devices,taskId}=await setup([false]);const[a]=devices;
    assert.equal((await edit(a,taskId,11,'durable-before-failure')).ok,true);
    await a.page.evaluate(()=>{IDBObjectStore.prototype.put=function(){throw new DOMException('synthetic primary write refusal','QuotaExceededError');};state.tasks[0].name='Synthetic unsaved name';});
    const failed=await invoke(a,'cloudPush');assert.equal(failed.ok,false);assert.equal(c.requests.length,0);assert.equal(c.row.cloud_rev,100);
    await a.page.reload({waitUntil:'load'});await a.page.waitForFunction(()=>!!window.state);
    const durable=await snapshot(a);assert.equal(durable.total,11);assert.equal(durable.sessions.length,1);
    evidence.push({detail:'primary-failure-before-upload',failed,durable});
  });
  await scenario('an edit while the upload receipt is delayed is replayed from durable state',async()=>{
    const {c,devices,taskId}=await setup([false,false]);const[a,b]=devices;
    assert.equal((await edit(a,taskId,13,'edit-before-request')).ok,true);
    let seen,release;const reached=new Promise(r=>seen=r),held=new Promise(r=>release=r);
    c.afterAccept=async()=>{seen();await held;};
    const pushing=invoke(a,'cloudPush');await reached;
    const added=await edit(a,taskId,7,'edit-during-request');release();assert.equal(added.ok,true);
    const result=await pushing;assert.equal(result.ok,true,JSON.stringify(result));
    assert(c.requests.filter(r=>r.method==='PATCH').length>=2,'advanced local watermark triggers actual replay');
    assert.equal((await invoke(b,'cloudPull')).ok,true);
    const states=await Promise.all([snapshot(a),snapshot(b)]);evidence.push({detail:'local-change-during-upload',result,states,requests:c.requests});
    assert.deepEqual(states.map(s=>s.total),[20,20]);assert(states.every(s=>s.sessions.length===2));
  });
  await scenario('failed pull commit retains local durable progress and remote row unchanged',async()=>{
    const {c,devices,taskId}=await setup([false,false]);const[a,b]=devices;
    assert.equal((await edit(a,taskId,7,'local-before-pull-failure')).ok,true);
    assert.equal((await edit(b,taskId,9,'remote-before-pull-failure')).ok,true);
    for(const [i,x] of[a,b].entries())await x.page.evaluate(async i=>{state.appLog=Array.from({length:60},(_,n)=>({id:`synthetic-${i}-${n}`,at:Date.now()-1000+n,text:`Synthetic device ${i} log ${n}`,isErr:false}));await saveStateDurable({fromPull:true,source:'synthetic-bounded-logs'});},i);
    assert.equal((await invoke(b,'cloudPush')).ok,true);
    const cloudBefore=JSON.stringify(c.row);
    await a.page.evaluate(async()=>{await saveStateDurable({fromPull:true,source:'synthetic-before-fault'});IDBObjectStore.prototype.put=function(){throw new DOMException('synthetic merge write refusal','QuotaExceededError');};const original=saveStateDurable;saveStateDurable=async function(opts){if(opts?.source==='cloud-pull-merge'){window.__auditBefore=structuredClone(state);try{return await original(opts);}catch(e){window.__auditAfter=structuredClone(state);throw e;}}return original(opts);};});
    const failed=await invoke(a,'cloudPull'),memory=await snapshot(a);
    const visibleWarning=await a.page.locator('#toasts').innerText();assert.match(visibleWarning,/Device storage is full/);
    const mutation=await a.page.evaluate(()=>{const before=window.__auditBefore||{},after=window.__auditAfter||{};return Object.fromEntries(Object.keys(after).filter(k=>JSON.stringify(before[k])!==JSON.stringify(after[k])).map(k=>[k,{before:before[k],after:after[k]}]));});
    await a.page.reload({waitUntil:'load'});await a.page.waitForFunction(()=>!!window.state);
    const durable=await snapshot(a);evidence.push({detail:'pull-save-failure',failed,memory,durable,mutation,warningVisible:true});
    assert.equal(failed.ok,false);assert.equal(memory.total,7);assert.equal(JSON.stringify(c.row),cloudBefore);assert.equal(durable.total,7);assert.equal(durable.sessions.length,1);assert.equal(memory.protocol,1);assert.equal(durable.protocol,1,'failed pull commit cannot persist a protocol pin');
    assert.deepEqual(mutation,{},'failed save warning does not mutate the profile awaiting guarded rollback');
  });
  await scenario('two offline devices reaching the same target can converge',async()=>{
    const {c,devices,taskId}=await setup();const[a,b,d]=devices;
    assert.equal((await edit(a,taskId,41,'shared-target-a')).ok,true);
    assert.equal((await edit(b,taskId,43,'shared-target-b')).ok,true);
    const pushes=await Promise.all([invoke(a,'cloudPush'),invoke(b,'cloudPush')]);
    for(const x of devices){await invoke(x,'cloudPull');await invoke(x,'cloudPush');}
    for(const x of devices)await invoke(x,'cloudPull');
    const states=await Promise.all(devices.map(snapshot));evidence.push({detail:'same-target',pushes,states,requests:c.requests});
    assert.deepEqual(states.map(s=>s.total),[84,84,84]);
  });
  for(const distinct of[false,true])await scenario(`${distinct?'distinct crops retain both yields':'same crop harvested twice yields once'} through encrypted cloud sync`,async()=>{
    const {c,devices}=await setup();const[a,b]=devices;
    const fixture={version:1,installedAt:1,grants:{seed:{id:'seed',sessionId:'seed',source:'session',minutes:60,action:'Travel',priority:false,orbs:0,materials:{seed:0,herb:0,timber:0,ore:0},farmMinutes:60,at:1,updatedAt:100,deleted:false}},spends:[],harvests:[],unlockedPlots:2,plots:[{id:'plot1',crop:'herb',plantedAt:0,updatedAt:12345,plantingId:'shared-crop'},{id:'plot2',crop:distinct?'herb':null,plantedAt:0,updatedAt:12345,plantingId:'second-crop'},{id:'plot3',crop:null,plantedAt:0,updatedAt:0}]};
    for(const x of devices)await x.page.evaluate(async fixture=>{state.focusEconomy=structuredClone(fixture);await saveStateDurable({fromPull:true,source:'synthetic-ready-crop'});},fixture);
    assert.equal(await a.page.evaluate(async()=>{const ok=window.__fhEconomyTest.harvest('plot1');await saveStateDurable({fromPull:true,source:'synthetic-crop-harvest'});return ok;}),true);
    assert.equal(await b.page.evaluate(async plot=>{const ok=window.__fhEconomyTest.harvest(plot);await saveStateDurable({fromPull:true,source:'synthetic-crop-harvest'});return ok;},distinct?'plot2':'plot1'),true);
    const pushes=await Promise.all([invoke(a,'cloudPush'),invoke(b,'cloudPush')]);
    for(const x of devices){assert.equal((await invoke(x,'cloudPull')).ok,true);assert.equal((await invoke(x,'cloudPush')).ok,true);}
    for(const x of devices)await invoke(x,'cloudPull');
    const states=await Promise.all(devices.map(snapshot));evidence.push({detail:distinct?'distinct-crops':'shared-crop',pushes,states,requests:c.requests});
    assert.deepEqual(states.map(s=>s.economy.materials.herb),distinct?[8,8,8]:[4,4,4]);
    assert(states.every(s=>s.harvests===(distinct?2:1)&&s.economy.farmMinutes===60));
    for(const x of devices)assert.equal(await x.page.evaluate(()=>window.__fhEconomyTest.harvest('plot1')),false,'crop cannot be harvested again after merge');
  });
  await scenario('protocol barrier protects new shared fields before any reward receipt',async()=>{
    const {c,devices}=await setup([true,false,true]);const[a,b,d]=devices;
    const record=async(id)=>b.page.evaluate(async id=>{
      wdRecordJourneySession(state,{sessionId:id,action:'Fight',minutes:30,zoneId:'verdant_vale',encounters:[{killed:true,enemy:wdEnemiesForZone('verdant_vale').find(e=>!e.boss)}]});
      await saveStateDurable({fromPull:true,source:'synthetic-isolated-journey-field'});
    },id);
    await record('journey-one');await record('journey-two');
    assert.equal(await b.page.evaluate(()=>Object.keys(state.loot.sessionRewardReceipts).length),0,'no reward-policy sentinel or fake accounting receipt');
    assert.equal((await invoke(b,'cloudPush')).ok,true);
    const before=JSON.stringify(c.row);
    for(const x of[a,d]){
      const pull=await invoke(x,'cloudPull');assert.equal(pull.ok,false);assert.match(pull.message,/Decrypt failed/);
      assert.equal((await snapshot(x)).rev,100);
      const push=await invoke(x,'cloudPush');assert.equal(push.ok,false);assert.equal(JSON.stringify(c.row),before);
    }
    const stored=await b.page.evaluate(blob=>decryptStateBlob(blob),c.row.data);
    assert.deepEqual(Object.keys(stored.world.journeySessionRewards).sort(),['session:journey-one','session:journey-two']);
    for(const x of[a,d]){await x.page.goto(`http://127.0.0.1:${port}/index.html`,{waitUntil:'load'});await x.page.waitForFunction(()=>!!window.state);await x.page.waitForTimeout(600);assert.equal((await invoke(x,'cloudPull')).ok,true);assert.deepEqual(await x.page.evaluate(()=>Object.keys(state.world.journeySessionRewards).sort()),['session:journey-one','session:journey-two']);}
    evidence.push({detail:'protocol-before-rewards',requests:c.requests});
  });
  await scenario('explicit plaintext opt-out keeps the same old-reader CAS barrier',async()=>{
    const {c,devices}=await setup([true,false,true]);const[a,b,d]=devices;
    for(const x of devices)await x.page.evaluate(async()=>{state.settings.e2eEncryption=false;await saveStateDurable({fromPull:true,source:'synthetic-explicit-plaintext-choice'});});
    assert.equal((await invoke(b,'cloudPush')).ok,true);assert.equal(c.row.data.lifexp.v,2);assert.equal(c.row.data.plain,undefined);
    const before=JSON.stringify(c.row);
    for(const x of[a,d]){assert.equal((await invoke(x,'cloudPull')).ok,false);assert.equal((await snapshot(x)).rev,100);assert.equal((await invoke(x,'cloudPush')).ok,false);assert.equal(JSON.stringify(c.row),before);}
    const profileBefore=await b.page.evaluate(()=>({total:state.totalFocusMin,rev:state.sync.cloudRev,code:state.sync.syncCode,salt:state.sync.saltB64}));
    await b.page.evaluate(async()=>{state.settings.e2eEncryption=true;await saveStateDurable({fromPull:true,source:'synthetic-require-encryption'});});
    const refused=await invoke(b,'cloudPull');assert.equal(refused.code,'FH_SYNC_ENCRYPTION_REQUIRED');assert.equal(JSON.stringify(c.row),before);
    assert.deepEqual(await b.page.evaluate(()=>({total:state.totalFocusMin,rev:state.sync.cloudRev,code:state.sync.syncCode,salt:state.sync.saltB64})),profileBefore);
    evidence.push({detail:'plaintext-choice-boundary',refused,requests:c.requests});
  });
  await scenario('legacy first-create and lost-create retry cannot replace a newer protocol row',async()=>{
    const {c,devices}=await setup([true,false,true]);const[a,b,d]=devices;
    assert.equal((await invoke(b,'cloudPush')).ok,true);const before=JSON.stringify(c.row);
    for(const [index,x] of[a,d].entries()){
      await x.page.evaluate(async index=>{state.sync.cloudRev=0;issueSyncCreateAuthorization(state.sync);state.sync.createAuthorization.attemptCount=index;state.sync.createAuthorization.lastAttemptAt=index?Date.now():0;await saveStateDurable({fromPull:true,source:'synthetic-old-create-recovery'});},index);
      const requestStart=c.requests.length;const push=await invoke(x,'cloudPush');assert.equal(push.ok,false);assert.match(push.message,/Decrypt failed/);
      assert.equal((await snapshot(x)).rev,0);assert.equal(JSON.stringify(c.row),before);
      assert(c.requests.slice(requestStart).length>=1);assert(c.requests.slice(requestStart).every(r=>r.method==='GET'),'old create recovery stops before any POST or PATCH');
    }
    evidence.push({detail:'legacy-create-refusal',requests:c.requests});
  });
  await scenario('enabling encryption during an in-flight plaintext read prevents merge',async()=>{
    const {c,devices}=await setup([false]);const[a]=devices;
    await a.page.evaluate(async()=>{state.settings.e2eEncryption=false;await saveStateDurable({fromPull:true,source:'synthetic-legacy-plaintext-choice'});});
    c.row={...c.row,data:{plain:await a.page.evaluate(()=>sanitizeForCloud(state))}};
    let seen,release;const reached=new Promise(r=>seen=r),held=new Promise(r=>release=r);
    c.beforeReadReply=async()=>{seen();await held;};
    const pulling=invoke(a,'cloudPull');await reached;
    await a.page.evaluate(async()=>{state.settings.e2eEncryption=true;await saveStateDurable({fromPull:true,source:'synthetic-require-encryption-during-read'});});
    const before=await snapshot(a);release();const result=await pulling;
    assert.equal(result.code,'FH_SYNC_ENCRYPTION_REQUIRED');assert.deepEqual(await snapshot(a),before);
    assert.equal(await a.page.evaluate(()=>state.settings.e2eEncryption),true);
    evidence.push({detail:'inflight-encryption-choice',result,requests:c.requests});
  });
  await scenario('confirmed protocol pin survives reload and rejects a higher-revision downgrade',async()=>{
    const {c,devices}=await setup([true,false,false]);const[a,b,d]=devices;
    const oldEnvelope=structuredClone(c.row.data);
    assert.equal((await invoke(b,'cloudPush')).ok,true);assert.equal((await invoke(d,'cloudPull')).ok,true);
    for(const x of[b,d]){await x.page.reload({waitUntil:'load'});await x.page.waitForFunction(()=>!!window.state);await x.page.waitForTimeout(600);assert.equal(await x.page.evaluate(()=>state.sync.cloudProtocolVersion),2);}
    c.row={...c.row,cloud_rev:c.row.cloud_rev+1,data:oldEnvelope};
    for(const x of[b,d]){const prev=await snapshot(x);const pull=await invoke(x,'cloudPull');assert.equal(pull.code,'FH_SYNC_UPDATE_REQUIRED');assert.deepEqual(await snapshot(x),prev);}
    evidence.push({detail:'durable-protocol-pin',requests:c.requests});
  });

}finally{
  await Promise.all(contexts.map(c=>c.close()));await browser.close();await new Promise(r=>server.close(r));
  await mkdir(path.join(root,'test-results'),{recursive:true});
  await writeFile(path.join(root,'test-results','multidevice-sync-audit.json'),JSON.stringify({baseline,evidence},null,2));
}
const failures=evidence.filter(e=>e.pass===false);
console.log(`${evidence.filter(e=>e.pass===true).length}/${evidence.filter(e=>'pass'in e).length} scenarios passed; evidence: test-results/multidevice-sync-audit.json`);
process.exitCode=failures.length?1:0;
