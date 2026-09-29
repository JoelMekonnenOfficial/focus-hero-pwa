/* Public delivery may inject optional analytics after the app's own scripts.
   All requests remain synthetic: a disposable browser, loopback source, and
   explicitly blocked external hosts. No production page or profile is opened. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {launch} from './harness.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const html=readFileSync(resolve(root,'starmax/index.html'),'utf8');
if(!process.argv.includes('--record-before')){
  const required=JSON.parse(/const FH_REQUIRED_RUNTIME_SCRIPTS = new Set\((\[[\s\S]*?\])\);/.exec(html)[1]);
  const referenced=Array.from(html.matchAll(/<script\b[^>]*\bsrc="([^"?#]+\.js)"[^>]*>/g),m=>m[1].replace(/^\.\//,''));
  referenced.push(/guardScript.src = "\.\/([^"]+)"/.exec(html)[1]);
  assert.deepEqual([...required].sort(),[...referenced].sort(),'Every actual first-party runtime script, including the dynamic guard, remains mandatory');
}
const mime={'.js':'application/javascript','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
let scenario={};
const server=createServer((req,res)=>{
  const path=new URL(req.url,'http://127.0.0.1').pathname;
  const name=path==='/'?'index.html':path.slice(1);
  if(path===scenario.missing||name==='optional-delivery.js'){res.writeHead(404).end('Synthetic missing script');return;}
  let body;
  try{body=name==='index.html'?html.replace('</body>',(scenario.inject||'')+'</body>'):readFileSync(resolve(root,'starmax',name));}
  catch{res.writeHead(404).end('Not found');return;}
  res.writeHead(200,{'Content-Type':mime[extname(name)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await launch();
const evidence=[];
try{
  for(const item of [
    {name:'complete app without optional delivery scripts',ready:true},
    {name:'blocked Cloudflare optional module',inject:'<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js/synthetic" crossorigin="anonymous"></script>',ready:true},
    {name:'blocked external script using an app filename',inject:'<script src="https://optional.invalid/focus-hero-ui-v11.js"></script>',ready:true},
    {name:'missing optional first-party delivery script',inject:'<script src="./optional-delivery.js"></script>',ready:true},
    {name:'missing required UI module',missing:'/focus-hero-ui-v11.js',ready:false},
    {name:'missing required durable store',missing:'/fh-primary-store-v13.js',ready:false},
    {name:'missing required dynamic guard',missing:'/data-guard.js',ready:false}
  ]){
    scenario=item;
    const ctx=await browser.newContext({serviceWorkers:'block'});
    const blocked=[];
    await ctx.route('**/*',route=>{
      if(new URL(route.request().url()).origin===origin)return route.continue();
      blocked.push(route.request().url());return route.abort('blockedbyclient');
    });
    await ctx.addInitScript(()=>{
      window.__auditDbOpens=[];
      const open=IDBFactory.prototype.open;
      IDBFactory.prototype.open=function(name,...args){window.__auditDbOpens.push(name);return open.call(this,name,...args);};
    });
    const page=await ctx.newPage();
    const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
    await page.goto(origin+'/',{waitUntil:'load'});
    await page.waitForFunction(()=>window.__FH_PRIMARY_READY__===true||!!document.getElementById('fh-asset-update-blocked'));
    await page.waitForTimeout(150);
    const actual=await page.evaluate(()=>({ready:window.__FH_PRIMARY_READY__===true,blocked:!!document.getElementById('fh-asset-update-blocked'),failures:window.__FH_ASSET_FAILURES__,opens:window.__auditDbOpens,ui:typeof window.FH_UI11==='object'}));
    evidence.push({name:item.name,expectedReady:item.ready,...actual,blockedExternal:blocked,pageErrors});
    console.log(JSON.stringify(evidence.at(-1)));
    await ctx.close();
    if(!process.argv.includes('--record-before')){
      assert.equal(actual.ready,item.ready,item.name+' hydration');
      assert.equal(actual.blocked,!item.ready,item.name+' blocking panel');
      if(item.ready){assert.deepEqual(actual.failures,[],item.name+' is not required code');assert.deepEqual(pageErrors,[],item.name+' has no app exception');assert.ok(actual.ui,item.name+' preserves the modern UI module');}
      else{assert.deepEqual(actual.opens,[],item.name+' must not open any profile database');assert.ok(actual.failures.includes(item.missing),item.name+' records the required failure');}
      if(item.inject?.includes('https://'))assert.equal(blocked.length,1,'The external script was actually denied without network access');
    }
  }
}finally{
  mkdirSync(resolve(root,'test-results'),{recursive:true});
  writeFileSync(resolve(root,'test-results/delivery-asset-gate'+(process.argv.includes('--record-before')?'-before':'')+'.json'),JSON.stringify(evidence,null,2)+'\n');
  await browser.close();await new Promise(r=>server.close(r));
}
console.log((process.argv.includes('--record-before')?'RECORDED ':'PASS ')+evidence.length+' synthetic public-delivery asset gate scenarios');
