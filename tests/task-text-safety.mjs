/* Exact application renderers in a blank disposable Chromium page. No profile,
 * storage, credentials, source server, or external network is used.
 * Optional LIFEXP_SOURCE_HTML selects another local source checkout for review.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {chromium}=await import(process.env.LIFEXP_PLAYWRIGHT_MODULE||'playwright');
const html=readFileSync(process.env.LIFEXP_SOURCE_HTML||new URL('../starmax/index.html',import.meta.url),'utf8');
function exactFunction(name){
  const start=html.indexOf(`function ${name}(`),end=html.indexOf('\n}',start)+2;
  assert(start>=0&&end>start,`source function ${name} must exist`);
  return html.slice(start,end);
}
const sources=['escapeHtml','startActiveTaskRename','renderActiveTaskRow'].map(exactFunction).join('\n');
const malicious='<img src="data:image/x-invalid;base64,AA==" onerror="window.__emojiExecuted=1">';
const name='Synthetic task <b>literal</b> & "quoted"';
const browser=await chromium.launch({executablePath:process.env.LIFEXP_CHROME_PATH||chromium.executablePath(),args:['--no-sandbox']});
let checks=0;
try{
  const context=await browser.newContext({serviceWorkers:'block',acceptDownloads:false});
  await context.route('**/*',route=>route.abort('blockedbyclient'));
  // Demonstrate that this payload's event would execute without escaping; the
  // tested pages have no CSP or disabled scripting that could hide a regression.
  const control=await context.newPage();
  await control.setContent('<div id="control"></div>');
  await control.evaluate(payload=>{document.getElementById('control').innerHTML=payload;},malicious);
  await control.waitForFunction(()=>window.__emojiExecuted===1);
  console.log('PASS synthetic inline-handler detector works');checks++;
  await control.close();
  for(const renderer of['renderActiveTaskRow','startActiveTaskRename'])for(const emoji of[malicious,'🧪']){
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.setContent('<div id="active-task-row"><div id="active-task-label"></div></div>');
    await page.evaluate(({sources,emoji,name,renderer})=>{
      window.$=selector=>document.querySelector(selector);
      window.isStopwatch=()=>false;window.nonNegativeNumber=value=>Math.max(0,Number(value)||0);
      window.activeTaskRowEditing=false;window.__emojiExecuted=0;
      window.renameTask=()=>{};window.openTaskSwitcher=()=>{};
      window.state={timer:{running:true,activeTaskId:'synthetic'},tasks:[{id:'synthetic',name,emoji}]};
      (0,eval)(sources);window[renderer]();
    },{sources,emoji,name,renderer});
    await page.waitForTimeout(75);
    const result=await page.evaluate(()=>({executed:window.__emojiExecuted,images:document.querySelectorAll('#active-task-label img').length,
      text:document.querySelector('#active-task-label > span')?.textContent,
      name:document.getElementById('active-task-rename')?.value??document.querySelector('.active-task-name')?.textContent,
      savedEmoji:state.tasks[0].emoji,savedName:state.tasks[0].name}));
    assert.deepEqual(result,{executed:0,images:0,text:emoji,name,savedEmoji:emoji,savedName:name},`${renderer} must retain literal task text without creating executable markup`);
    assert.deepEqual(errors,[],`${renderer} must run without errors`);
    console.log(`PASS ${renderer} retains ${emoji===malicious?'malicious markup as literal text':'ordinary emoji'} without execution or data mutation`);checks++;
    await page.close();
  }
  await context.close();
}finally{await browser.close();}
console.log(`${checks} task text safety checks passed.`);
