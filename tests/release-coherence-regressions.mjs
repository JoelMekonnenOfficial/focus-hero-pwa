/* Actual service worker and browser cache, isolated loopback-only profile.
   No signed-in browser, real cloud, production data, or cache removal. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));
const base='d9d8d6c0a24a6d4cdd84cd3f97a178b33f197265';
const files=readdirSync(resolve(root,'starmax'));
const previous=Object.fromEntries(files.map(name=>[name,execFileSync('git',['show',base+':starmax/'+name],{cwd:root,maxBuffer:5e6})]));
const next=Object.fromEntries(files.map(name=>[name,readFileSync(resolve(root,'starmax',name))]));
const sha=body=>createHash('sha256').update(body).digest('hex');
const mime={'.js':'application/javascript','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
let release=previous,worker=previous,failPath='',requests=[];
const server=createServer((req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  requests.push(path);
  res.setHeader('Cache-Control','no-store');
  if(path==='/__audit_harness'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Isolated release audit</title>');return;}
  const name=path==='/'?'index.html':path.slice(1);
  const data=(name==='sw.js'?worker:release)[name];
  if(!data||path===failPath){res.writeHead(404).end('Synthetic missing asset');return;}
  res.setHeader('Content-Type',mime[extname(name)]||'application/octet-stream');res.end(data);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({args:['--no-sandbox']});
const ctx=await browser.newContext({serviceWorkers:'allow'});
await ctx.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort('blockedbyclient'));
const page=await ctx.newPage();
await ctx.addInitScript(()=>{
  window.__auditDbOpens=[];
  const original=IDBFactory.prototype.open;
  IDBFactory.prototype.open=function(name,...args){window.__auditDbOpens.push(name);return original.call(this,name,...args);};
});
const scriptReads=[];
page.on('response',response=>{if(new URL(response.url()).pathname==='/gear-utility.js')scriptReads.push(response.body().then(body=>sha(body)).catch(()=>null));});
const evidence={base,candidate:execFileSync('git',['rev-parse','HEAD'],{cwd:root}).toString().trim(),checks:[]};
try{
  await page.goto(origin+'/__audit_harness');
  await page.evaluate(async()=>{await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;});
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  release=next;
  const split=await page.evaluate(async()=>{
    const html=await (await fetch('/',{headers:{Accept:'text/html'}})).text();
    const module=await (await fetch('/focus-economy.js')).text();
    return {build:/data-build-id="([^"]+)"/.exec(html)?.[1],module};
  });
  evidence.checks.push({name:'legacy worker transition',htmlBuild:split.build,moduleIsPrevious:sha(split.module)===sha(previous['focus-economy.js']),moduleIsNext:sha(split.module)===sha(next['focus-economy.js'])});
  // Force one stale cached module to remain unavailable from network. Any
  // candidate pre-hydration integrity gate must block incomplete-code startup.
  failPath='/gear-utility.js';
  await page.goto(origin+'/',{waitUntil:'load'});
  await page.waitForTimeout(7200);
  const startup=await page.evaluate(()=>({build:document.documentElement.dataset.buildId,ready:window.__FH_PRIMARY_READY__===true,blocked:!!document.getElementById('fh-asset-update-blocked'),failures:window.__FH_ASSET_FAILURES__||[],databaseOpens:window.__auditDbOpens}));
  startup.gearFromPrevious=(await Promise.all(scriptReads)).includes(sha(previous['gear-utility.js']));
  evidence.checks.push({name:'stale module startup',...startup});
  if(process.argv.includes('--record-before')){
    console.log(JSON.stringify(evidence,null,2));
  }else{
    assert.equal(startup.ready,false,'A page mixing new HTML with stale modules must never hydrate player state');
    assert.equal(startup.blocked,true,'An incomplete update must explain why startup is paused');
    assert.deepEqual(startup.databaseOpens,[],'Blocked mixed release never opens profile or backup databases, even after helper timers');
  }
  await ctx.close();
  release=previous;worker=previous;failPath='';
  const updateCtx=await browser.newContext({serviceWorkers:'allow'});
  await updateCtx.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort('blockedbyclient'));
  const updatePage=await updateCtx.newPage();
  await updatePage.goto(origin+'/__audit_harness');
  await updatePage.evaluate(async()=>{await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;});
  await updatePage.waitForFunction(()=>!!navigator.serviceWorker.controller);
  const oldCaches=await updatePage.evaluate(()=>caches.keys());
  const nextBuild=/data-build-id="([^"]+)"/.exec(next['index.html'].toString())[1];
  const oldBuild=/data-build-id="([^"]+)"/.exec(previous['index.html'].toString())[1];
  const installedBuild=()=>updatePage.evaluate(()=>new Promise(resolve=>{
    const channel=new MessageChannel();channel.port1.onmessage=event=>resolve(event.data.buildId);
    navigator.serviceWorker.controller.postMessage({type:'FH_WHICH_BUILD'},[channel.port2]);
  }));
  const update=()=>updatePage.evaluate(async()=>{
    const registration=await navigator.serviceWorker.getRegistration();
    return new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error('Synthetic worker update timed out')),20000);
      registration.addEventListener('updatefound',()=>{
        const installing=registration.installing;
        const check=()=>{if(['redundant','activated'].includes(installing.state)){clearTimeout(timeout);resolve(installing.state);}};
        installing.addEventListener('statechange',check);check();
      },{once:true});
      registration.update().catch(reject);
    });
  });
  release=next;worker=next;failPath='/gear-utility.js';
  assert.equal(await update(),'redundant','Missing executable must reject installation');
  assert.equal(await installedBuild(),oldBuild,'Failed update keeps the previous worker active');

  evidence.checks.push({name:'missing executable install',previousWorkerRetained:true});
  failPath='';
  release={...next,'gear-utility.js':previous['gear-utility.js']};
  assert.equal(await update(),'redundant','Wrong executable bytes must reject installation');
  assert.equal(await installedBuild(),oldBuild);
  release={...next,'index.html':previous['index.html'],'focus-hero.html':previous['focus-hero.html']};
  assert.equal(await update(),'redundant','Wrong document build must reject installation');
  assert.equal(await installedBuild(),oldBuild);
  evidence.checks.push({name:'wrong module and HTML build',previousWorkerRetained:true});
  release=next;
  // The next attempt has all assets and must complete without clearing anything.
  assert.equal(await update(),'activated');
  await updatePage.waitForFunction(async build=>{
    return new Promise(resolve=>{const channel=new MessageChannel();channel.port1.onmessage=event=>resolve(event.data.buildId===build);navigator.serviceWorker.controller.postMessage({type:'FH_WHICH_BUILD'},[channel.port2]);});
  },nextBuild);
  const cacheNames=await updatePage.evaluate(()=>caches.keys());
  assert.ok(oldCaches.every(key=>cacheNames.includes(key)),'Prior cache namespaces remain untouched');
  release=previous;
  const coherent=await updatePage.evaluate(async()=>({html:await(await fetch('/',{headers:{Accept:'text/html'}})).text(),module:await(await fetch('/gear-utility.js')).text()}));
  assert.equal(/data-build-id="([^"]+)"/.exec(coherent.html)[1],nextBuild,'Installed bundle cannot mix with a changed network HTML');
  assert.equal(sha(coherent.module),sha(next['gear-utility.js']),'Installed executable cannot be replaced by background network revalidation');
  evidence.checks.push({name:'complete install and network skew',coherent:true,priorCachesPreserved:true});
  await updateCtx.setOffline(true);
  await updatePage.goto(origin+'/',{waitUntil:'load'});
  await updatePage.waitForFunction(()=>window.__FH_PRIMARY_READY__===true);
  assert.equal(await updatePage.locator('#fh-asset-update-blocked').count(),0);
  evidence.checks.push({name:'offline complete bundle startup',ready:true});
  await updateCtx.close();
  console.log('PASS actual legacy/new worker transition, missing-module refusal, complete install, retained caches, coherent offline startup');
}finally{
  mkdirSync(resolve(root,'test-results'),{recursive:true});
  writeFileSync(resolve(root,'test-results/release-coherence-audit.json'),JSON.stringify(evidence,null,2)+'\n');
  await browser.close();await new Promise(r=>server.close(r));
}
