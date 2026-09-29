/* Full local app, disposable Chromium profile and synthetic legacy run only.
 * Exercises the real calendar renderer, click binding and IndexedDB save/reload.
 * No external network, signed-in browser, real profile or fixed port is used. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, openApp } from './harness.mjs';

const assets=fileURLToPath(new URL('../starmax/',import.meta.url));
const mime={'.html':'text/html','.js':'application/javascript','.svg':'image/svg+xml','.json':'application/json','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{
  try{
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
    const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
    const target=resolve(assets,'.'+(pathname==='/'?'/index.html':pathname)),rel=relative(assets,target);
    if(rel==='..'||rel.startsWith('..'+sep)){res.writeHead(403).end();return;}
    const bytes=await readFile(target);res.writeHead(200,{'Content-Type':mime[extname(target)]||'application/octet-stream','Cache-Control':'no-store'}).end(req.method==='HEAD'?undefined:bytes);
  }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser,checks=0;
function pass(label){console.log('PASS '+label);checks++;}
try{
  browser=await launch();
  const {ctx,page,problems}=await openApp(browser,server.address().port,{settleMs:2000});
  await page.setViewportSize({width:390,height:844});
  const original=await page.evaluate(async()=>{
    const today=FH_HARDCORE.calendarDay(),yesterday=FH_CALENDAR.shift(today,-1),at=Date.parse(yesterday+'T16:00:00Z');
    state.sync.enabled=false;
    state.history[yesterday]=240;state.totalFocusMin=240;
    state.lateStarts={[yesterday]:{startMin:600,declaredAt:at}};
    const run={id:'synthetic-calendar-ui',startedAt:at,startDay:yesterday,requirement:{type:'minutes',value:240},requirementLock:'fh12r1:minutes:240',daysSurvived:0,lastCheckedDay:yesterday,lastCheckedAt:at,pauses:[],excusedDays:[]};
    state.fh12Hardcore={version:2,runs:[run],history:[],active:true,run};
    await saveStateDurable({source:'synthetic-calendar-ui-fixture'});
    FH_HARDCORE.render();FH_NAV.goTo('hardcore');
    return {startDay:yesterday,late:JSON.stringify(state.lateStarts),history:JSON.stringify(state.history)};
  });
  const input=page.getByLabel('Shared Hardcore timezone');
  await input.waitFor({state:'visible'});
  assert.match(await page.locator('#fh12-hardcore-panel').innerText(),/Choose on one device/);
  pass('mobile calendar card renders its one-device selection explanation');
  await input.fill('America/Los_Angeles');
  await page.getByRole('button',{name:'Use this calendar',exact:true}).click();
  await page.waitForFunction(()=>state.fhCalendar?.timeZone==='America/Los_Angeles'&&!document.getElementById('fh12-calendar-zone'));
  assert.match(await page.locator('#fh12-hardcore-panel').innerText(),/Shared calendar · America\/Los_Angeles/);
  assert.match(await page.locator('#fh12-hardcore-panel').innerText(),/Calendar review held:.*timezone/s);
  pass('real click saves chosen timezone and explains why ambiguous earlier dates remain held');
  const layout=await page.locator('#fh12-hardcore-panel').evaluate(el=>{
    const card=el.querySelector('.fh12-category-card'),r=card.getBoundingClientRect();
    return {left:r.left,right:r.right,viewport:innerWidth,scroll:card.scrollWidth,width:card.clientWidth};
  });
  assert(layout.left>=-1&&layout.right<=layout.viewport+1&&layout.scroll<=layout.width+1,JSON.stringify(layout));
  pass('shared calendar card fits a 390-pixel mobile viewport');
  const beforeReload=await page.evaluate(()=>JSON.stringify(state.fhCalendar));
  await page.reload({waitUntil:'load'});
  await page.waitForFunction(()=>window.__FH_PRIMARY_READY__&&window.FH_HARDCORE&&state.fhCalendar);
  await page.evaluate(()=>{FH_HARDCORE.render();FH_NAV.goTo('hardcore');});
  const restored=await page.evaluate(()=>({calendar:JSON.stringify(state.fhCalendar),startDay:state.fh12Hardcore.runs[0]?.startDay,late:JSON.stringify(state.lateStarts),history:JSON.stringify(state.history),active:state.fh12Hardcore.runs.length}));
  assert.deepEqual(restored,{calendar:beforeReload,...original,active:1});
  assert.match(await page.locator('#fh12-hardcore-panel').innerText(),/Shared calendar · America\/Los_Angeles/);
  pass('actual durable reload preserves selected calendar and original run/history/late declarations');
  assert.deepEqual(problems,[]);pass('calendar UI and reload produce no unexpected browser errors');
  await ctx.close();
}finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
console.log(`${checks} calendar UI safety checks passed.`);
