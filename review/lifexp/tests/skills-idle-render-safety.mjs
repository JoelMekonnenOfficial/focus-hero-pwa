/* Real application scripts, a disposable profile and blocked external network.
 * The inherited Skills text write triggered another global observer sweep on
 * every idle animation frame. Verify convergence without disabling observers. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,relative,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {launch,openApp} from './harness.mjs';
const assets=fileURLToPath(new URL('../starmax/',import.meta.url));
const server=createServer(async(req,res)=>{
  try{
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
    const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
    const target=resolve(assets,'.'+(pathname==='/'?'/index.html':pathname)),rel=relative(assets,target);
    if(rel==='..'||rel.startsWith('..'+sep)){res.writeHead(403).end();return;}
    const body=await readFile(target);
    res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'})[extname(target)]||'application/octet-stream','Cache-Control':'no-store'}).end(req.method==='HEAD'?undefined:body);
  }catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser,checks=0;
function pass(label){console.log('PASS '+label);checks++;}
try{
  browser=await launch();
  const {ctx,page,problems}=await openApp(browser,server.address().port,{settleMs:2000});
  await page.waitForFunction(()=>window.__FH_PRIMARY_READY__&&document.querySelector('.fh11-skills-toggle'));
  async function idle(label){
    const result=await page.evaluate(async()=>{
      const button=document.querySelector('.fh11-skills-toggle'),before=button.textContent;
      let changes=0;const observer=new MutationObserver(records=>{changes+=records.length;});
      observer.observe(button,{childList:true,subtree:true,characterData:true});
      await new Promise(r=>setTimeout(r,700));observer.disconnect();
      return{changes,before,after:button.textContent};
    });
    assert.equal(result.changes,0,label+': repeated identical label writes must stop');
    assert.equal(result.after,result.before);pass(label);
  }
  await idle('closed Skills control converges while the application is idle');
  await page.locator('.fh11-skills-toggle').click();
  await page.waitForFunction(()=>document.querySelector('.fh11-skills-toggle').textContent==='Close skills'&&!document.getElementById('fh11-skills-body').hidden);
  pass('opening Skills still changes its label and reveals its controls');
  await idle('open Skills control converges without another observer frame');
  await page.locator('.fh11-skills-toggle').click();
  await page.waitForFunction(()=>document.querySelector('.fh11-skills-toggle').textContent==='Open skills'&&document.getElementById('fh11-skills-body').hidden);
  pass('closing Skills still changes its label and hides its controls');
  await page.evaluate(()=>{
    const day=todayKey();state.tasks=Array.from({length:100},(_,i)=>({id:'synthetic-'+i,name:'Synthetic skill '+i,emoji:'📚',totalFocusMin:50,sessions:1,dailyMin:{[day]:50},createdAt:Date.now()}));
    state.totalFocusMin=5000;state.history={[day]:5000};renderAll();
  });
  await page.locator('#btn-analytics').click();
  await page.waitForFunction(()=>document.getElementById('analytics-body').textContent.includes('83h 20m'));
  await idle('Stats with 100 synthetic skills does not restart the idle redraw loop');
  await page.locator('#analytics-modal [data-close]').first().click();
  await page.evaluate(()=>FH_NAV.goTo('ledger'));
  await page.waitForFunction(()=>document.getElementById('ledger-panel').textContent.includes('Synthetic skill 99'));
  await idle('Focus ledger with 100 synthetic skills remains stable and responsive');
  assert.deepEqual(problems,[]);pass('full application reports no unexpected browser errors');
  await ctx.close();
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
console.log(`${checks} Skills idle-render checks passed.`);
