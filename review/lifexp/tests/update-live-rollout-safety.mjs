/* Real worker rollout over exact historical/current apps; isolated loopback contexts.
 * node tests/update-live-rollout-safety.mjs [optional scenario]
 */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {launch} from './harness.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),base='d9d8d6c0';
const cached=new Map(),evidence=[],workerMessages=[];let serving='old',failPath='';
function bytes(release,name){const key=release+':'+name;if(!cached.has(key))cached.set(key,(release==='old'||process.env.LIFEXP_UPDATE_CANDIDATE_REF)?execFileSync('git',['show',(release==='old'?base:process.env.LIFEXP_UPDATE_CANDIDATE_REF)+':starmax/'+name],{cwd:root,maxBuffer:20e6,stdio:['ignore','pipe','ignore']}):readFileSync(resolve(root,'starmax',name)));return cached.get(key);}
const mime={'.js':'application/javascript','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=createServer((req,res)=>{try{const pathname=new URL(req.url,'http://loopback').pathname,name=pathname==='/'?'index.html':pathname.slice(1);if(pathname==='/__audit_harness'){res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'}).end('<!doctype html><title>Isolated update request</title>');return;}if(pathname===failPath)throw Error('synthetic absent asset');if(name.includes('..'))throw Error('invalid');const body=bytes(serving,name);res.writeHead(200,{'Content-Type':mime[extname(name)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);}catch(_){res.writeHead(404).end('Synthetic missing file');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,browser=await launch();
const oldBuild=/data-build-id="([^"]+)"/.exec(bytes('old','index.html').toString())[1],newBuild=/data-build-id="([^"]+)"/.exec(bytes('new','index.html').toString())[1];
async function context(){const ctx=await browser.newContext({serviceWorkers:'allow',timezoneId:'America/Toronto'});await ctx.addInitScript(()=>{window.__auditDatabaseOpens=[];const open=IDBFactory.prototype.open;IDBFactory.prototype.open=function(name,...args){window.__auditDatabaseOpens.push(name);return open.call(this,name,...args);};});await ctx.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort('blockedbyclient'));ctx.on('console',m=>{if(m.type()==='error'||m.type()==='warning')workerMessages.push(m.text());});return ctx;}
async function open(ctx){const page=await ctx.newPage();await page.goto(origin+'/',{waitUntil:'load'});await page.waitForFunction(()=>window.__FH_PRIMARY_READY__===true);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);await page.waitForTimeout(1200);await page.waitForFunction(()=>window.__FH_PRIMARY_READY__===true);return page;}
async function workerBuild(page){return page.evaluate(()=>new Promise(resolve=>{const ch=new MessageChannel(),timeout=setTimeout(()=>{ch.port1.close();resolve(null);},5000);ch.port1.onmessage=e=>{clearTimeout(timeout);ch.port1.close();resolve(e.data.buildId);};navigator.serviceWorker.controller.postMessage({type:'FH_WHICH_BUILD'},[ch.port2]);}));}
async function switchRelease(page,release='new'){serving=release;const helper=await page.context().newPage();await helper.goto(origin+'/__audit_harness');await helper.evaluate(async()=>{const reg=await navigator.serviceWorker.getRegistration();await reg.update();});await helper.close();}
async function settledUpdate(page){for(let i=0;i<90;i++){await page.waitForTimeout(500);try{const status=await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();return {installing:r?.installing?.state,waiting:r?.waiting?.state,active:r?.active?.state};});if(!status.installing){return status;}}catch(_){}}throw Error('worker install did not settle');}
async function sessionFixture(page){return page.evaluate(async()=>{setMode('stopwatch',{resetRun:true,persistState:false});state.timer.swAccumulatedMs=50123;state.timer.swSessionStartedAt=Date.now()-50123;await saveStateDurable({source:'synthetic-paused-clock'});return JSON.stringify(state);});}
const scenarios={
 async legacy_pending_save(){
  serving='old';const ctx=await context(),page=await open(ctx);await sessionFixture(page);
  const durable=await page.evaluate(()=>({elapsed:state.timer.swAccumulatedMs,raw:primaryLastDurableRaw}));
  await page.evaluate(()=>{state.timer.swAccumulatedMs=88888;saveTimer=setTimeout(()=>saveState(),60000);window.__auditHeldSave=true;});
  await page.waitForFunction(()=>window.__auditHeldSave===true);
  let navigations=0;page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations++;});
  await switchRelease(page);await settledUpdate(page);await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();r.waiting?.postMessage({type:'FH_ACTIVATE_SAFE',buildId:document.documentElement.dataset.buildId});});await page.waitForTimeout(3000);
  const got=await page.evaluate(()=>({build:document.documentElement.dataset.buildId,elapsed:window.state?.timer?.swAccumulatedMs,held:window.__auditHeldSave===true}));
  const worker=await workerBuild(page);evidence.push({name:'legacy_pending_save',navigations,...got,worker,durableElapsed:durable.elapsed});
  assert.equal(navigations,0,'A new worker must not reload unknown legacy pages with an unfinished save');assert.equal(got.elapsed,88888);assert.equal(worker,oldBuild);await ctx.close();
 }
,
 async legacy_running_clock(){
  serving='old';const ctx=await context(),page=await open(ctx);await sessionFixture(page);
  await page.evaluate(async()=>{startTimer();await saveStateDurable({source:'synthetic-running-clock'});});
  let navigations=0;page.on('framenavigated',f=>{if(f===page.mainFrame())navigations++;});
  await switchRelease(page);const status=await settledUpdate(page);await page.waitForTimeout(2000);
  const state=await page.evaluate(()=>({running:window.state.timer.running,elapsed:window.state.timer.swAccumulatedMs,started:window.state.timer.swStartedAt}));
  assert.equal(navigations,0);assert.equal(status.waiting,'installed');assert.equal(await workerBuild(page),oldBuild);assert.equal(state.running,true);
  evidence.push({name:'legacy_running_clock',navigations,status,...state});await ctx.close();
 },
 async natural_close_offline_resume(){
  serving='old';const ctx=await context(),page=await open(ctx);await sessionFixture(page);
  const oldCaches=await page.evaluate(()=>caches.keys());await switchRelease(page);const status=await settledUpdate(page);assert.equal(status.waiting,'installed');
  await page.close();await new Promise(r=>setTimeout(r,1500));await ctx.setOffline(true);
  const resumed=await ctx.newPage();await resumed.goto(origin+'/',{waitUntil:'load'});await resumed.waitForFunction(()=>window.__FH_PRIMARY_READY__===true);
  const result=await resumed.evaluate(async()=>({build:document.documentElement.dataset.buildId,elapsed:state.timer.swAccumulatedMs,caches:await caches.keys()}));
  assert.equal(result.build,newBuild);assert.equal(result.elapsed,50123);assert(oldCaches.every(name=>result.caches.includes(name)));
  evidence.push({name:'natural_close_offline_resume',...result});await ctx.close();
 },
 async incomplete_gate_with_legacy_peer(){
  serving='old';const ctx=await context(),legacy=await open(ctx);await sessionFixture(legacy);
  await switchRelease(legacy);assert.equal((await settledUpdate(legacy)).waiting,'installed');
  failPath='/gear-utility.js';const gate=await ctx.newPage();await gate.goto(origin+'/',{waitUntil:'load'});
  await gate.waitForSelector('#fh-asset-update-blocked');await gate.waitForTimeout(2500);
  const blocked=await gate.evaluate(()=>({ready:window.__FH_PRIMARY_READY__===true,opens:window.__auditDatabaseOpens,waiting:!!document.getElementById('fh-update-waiting')}));
  assert.equal(blocked.ready,false);assert.deepEqual(blocked.opens,[]);assert.equal(blocked.waiting,true,'The blocked page explains that another window is holding the update');assert.equal(await workerBuild(legacy),oldBuild);
  await legacy.close();failPath='';await gate.waitForFunction(()=>window.__FH_PRIMARY_READY__===true,null,{timeout:30000});
  const resumed=await gate.evaluate(()=>({build:document.documentElement.dataset.buildId,elapsed:state.timer.swAccumulatedMs,opens:window.__auditDatabaseOpens}));
  assert.equal(resumed.build,newBuild);assert.equal(resumed.elapsed,50123);assert(resumed.opens.length>0);
  evidence.push({name:'incomplete_gate_with_legacy_peer',blocked,resumed});await ctx.close();
 },
 async missing_module_keeps_previous_bundle(){
  serving='old';const ctx=await context(),page=await open(ctx);await sessionFixture(page);const oldCaches=await page.evaluate(()=>caches.keys());
  failPath='/gear-utility.js';await switchRelease(page);const status=await settledUpdate(page);assert.equal(status.waiting,undefined);assert.equal(await workerBuild(page),oldBuild);
  await ctx.setOffline(true);await page.reload({waitUntil:'load'});await page.waitForFunction(()=>window.__FH_PRIMARY_READY__===true);
  const resumed=await page.evaluate(async()=>({build:document.documentElement.dataset.buildId,elapsed:state.timer.swAccumulatedMs,caches:await caches.keys()}));
  assert.equal(resumed.build,oldBuild);assert.equal(resumed.elapsed,50123);assert(oldCaches.every(name=>resumed.caches.includes(name)));
  evidence.push({name:'missing_module_keeps_previous_bundle',status,...resumed});failPath='';await ctx.close();
 }
};
try{for(const [name,run] of Object.entries(scenarios)){if(process.argv[2]&&process.argv[2]!==name)continue;await run();console.log('PASS '+name);}}finally{mkdirSync(resolve(root,'test-results'),{recursive:true});writeFileSync(resolve(root,'test-results/update-live-rollout.json'),JSON.stringify({evidence,workerMessages},null,2)+'\n');await browser.close();await new Promise(r=>server.close(r));}
