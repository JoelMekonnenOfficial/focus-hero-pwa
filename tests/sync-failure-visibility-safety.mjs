/* Actual sync/UI handlers in a disposable profile, loopback source and a
   synthetic cloud row. All other network is refused; no production state. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,relative,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {launch} from './harness.mjs';
const assets=resolve(process.env.LIFEXP_TEST_ASSETS||fileURLToPath(new URL('../starmax/',import.meta.url)));
const mime={'.html':'text/html','.js':'application/javascript','.svg':'image/svg+xml','.json':'application/json','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{
  try{
    const file=resolve(assets,'.'+(new URL(req.url,'http://127.0.0.1').pathname==='/'?'/index.html':new URL(req.url,'http://127.0.0.1').pathname));
    const rel=relative(assets,file);if(rel==='..'||rel.startsWith('..'+sep))throw Error('outside fixture');
    res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(await readFile(file));
  }catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const port=server.address().port;let browser,checks=0,row,holdNext=null;
const requests=[];function pass(name){checks++;console.log('PASS '+name);}
try{
  browser=await launch();const ctx=await browser.newContext({serviceWorkers:'block',acceptDownloads:false});
  await ctx.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.hostname==='127.0.0.1'&&url.port===String(port))return route.continue();
    if(!url.hostname.endsWith('.supabase.co')||!url.pathname.endsWith('/rest/v1/players'))return route.abort('blockedbyclient');
    assert.equal(req.method(),'GET','visibility may not schedule a cloud write');requests.push(req.method());
    const fields=(url.searchParams.get('select')||'').split(',');
    const reply=Object.fromEntries(fields.map(k=>[k,row[k]]));
    if(holdNext){const hold=holdNext;holdNext=null;hold.seen();await hold.release;}
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([reply])});
  });
  const page=await ctx.newPage();
  page.on('pageerror',error=>console.error('Synthetic fixture error:',error.message));
  await page.goto(`http://127.0.0.1:${port}/index.html`,{waitUntil:'load'});
  await page.waitForFunction(()=>window.__FH_PRIMARY_READY__===true&&typeof window.saveStateDurable==='function',null,{timeout:10000}).catch(async error=>{
    console.error(await page.evaluate(()=>({assetFailures:window.__FH_ASSET_FAILURES__,blocked:document.getElementById('fh-asset-update-blocked')?.textContent,body:document.body.innerText.slice(-2000)})));throw error;
  });
  await page.waitForTimeout(500);
  const fixture=await page.evaluate(async()=>{
    Object.assign(state.sync,{enabled:true,backend:'supabase',playerId:'synthetic-visibility',cloudRev:100,
      syncCode:'SYNTHETIC-VISIBILITY',syncSecret:'SYNTHETIC-NOT-A-CREDENTIAL',syncSecretHash:'synthetic-hash',
      userToken:'synthetic.token',tokenExpiresAt:Date.now()+3600000,saltB64:'MDEyMzQ1Njc4OWFiY2RlZg==',
      pendingSync:true,pendingSince:Date.now()-7200000,lastSyncError:'Synthetic previous outage'});
    state.settings.e2eEncryption=true;
    await saveStateDurable({fromPull:true,source:'synthetic-visibility-setup'});
    renderSyncStatus();
    return {plain:sanitizeForCloud(state),raw:JSON.stringify(state),head:primaryHead.commitId};
  });
  row={data:{plain:fixture.plain},cloud_rev:100,sync_secret_hash:'synthetic-hash',updated_at:new Date().toISOString()};
  await page.evaluate(()=>document.getElementById('btn-sync-now').onclick());
  const manual=await page.evaluate(()=>({status:document.getElementById('sync-status').textContent,toasts:document.getElementById('toasts').innerText,raw:JSON.stringify(state),head:primaryHead.commitId,current:typeof currentCloudSyncFailure==='function'?currentCloudSyncFailure():null}));
  assert.match(manual.status,/unencrypted, but encryption is required/);
  assert.match(manual.toasts,/unencrypted, but encryption is required/);
  assert.match(manual.toasts,/Cloud sync has been failing for 2 hours[\s\S]*Reason: Decrypt failed: Cloud payload is unencrypted/);
  assert(!manual.toasts.includes('Cloud retry is queued'));
  assert.equal(manual.raw,fixture.raw);assert.equal(manual.head,fixture.head);
  pass('manual refusal names its actual cause without profile, primary, queue or cloud writes');

  const meta=await page.evaluate(async()=>({pulled:await cloudPull({reason:'synthetic-metadata'}),current:currentCloudSyncFailure()}));
  assert.equal(meta.pulled,false);assert.equal(meta.current,manual.current);
  pass('successful metadata-only contact cannot clear a failed full read');

  row.cloud_rev=101;
  await page.evaluate(()=>{cloudSyncAttemptResult=null;});
  const background=await page.evaluate(async()=>{
    try{await pullThenFlushPending('synthetic-background');}catch(e){return {code:e.code,status:document.getElementById('sync-status').textContent,raw:JSON.stringify(state)};}
  });
  assert.equal(background.code,'FH_SYNC_ENCRYPTION_REQUIRED');assert.match(background.status,/unencrypted/);
  assert.equal(background.raw,fixture.raw);
  const noticeBefore=await page.locator('#toasts').innerHTML();
  await page.evaluate(()=>pullThenFlushPending('synthetic-repeat').catch(()=>{}));
  assert.equal(await page.locator('#toasts').innerHTML(),noticeBefore,'same failure does not flood the warning banner');
  pass('background pull refusal becomes visible before an upload can start');

  let seen,release;const reached=new Promise(r=>seen=r),held=new Promise(r=>release=r);
  holdNext={seen,release:held};
  const older=page.evaluate(async()=>{try{await cloudPull({force:true});}catch(e){return e.code;}});
  await reached;
  row={...row,cloud_rev:102,data:await page.evaluate(()=>encryptStateBlob({...state,sync:{...state.sync,cloudRev:101}}))};
  assert.equal(await page.evaluate(()=>cloudPull({force:true})),true);
  assert.equal(await page.evaluate(()=>currentCloudSyncFailure()),null);
  release();assert.equal(await older,'FH_SYNC_ENCRYPTION_REQUIRED');
  assert.equal(await page.evaluate(()=>currentCloudSyncFailure()),null);
  pass('verified full pull clears the failure and delayed older refusal cannot replace success');

  const controls=await page.evaluate(()=>{
    const first=beginCloudSyncAttempt();noteCloudSyncAttempt(first,new Error('Synthetic current failure'));
    for(const code of ['FH_SYNC_SUPERSEDED','FH_SYNC_IDENTITY_BUSY','FH_SYNC_LOCAL_CHANGED','FH_SYNC_WATERMARK_ADVANCED','FH_CLOUD_BUDGET'])noteCloudSyncAttempt(beginCloudSyncAttempt(),Object.assign(new Error(code),{code}));
    const kept=currentCloudSyncFailure();const stale=beginCloudSyncAttempt();syncIdentityGeneration++;
    noteCloudSyncAttempt(stale,new Error('Old identity failure'));
    return {kept,changed:currentCloudSyncFailure()};
  });
  assert.equal(controls.kept,'Synthetic current failure');assert.equal(controls.changed,null);
  pass('transient control flow and stale identity results cannot replace meaningful diagnostics');

  const translations=await page.evaluate(()=>[
    describeSyncFailure('Cloud revision moved backwards. Sync stopped before changing local or cloud data.'),
    describeSyncFailure('These devices chose different Hardcore calendars. Keep both copies and review the timezone choice before syncing.')]);
  assert.match(translations[0],/moved backwards/);assert.match(translations[1],/different Hardcore calendars/);
  assert(translations.every(s=>!s.includes('normally settles')));
  pass('revision rollback and calendar protection are not described as harmless upload races');
  assert(requests.length>=5);await ctx.close();
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
console.log(`${checks} sync failure visibility checks passed`);
