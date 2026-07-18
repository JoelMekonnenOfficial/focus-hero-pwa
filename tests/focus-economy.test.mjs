import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
let chromium;
for (const candidate of ["playwright", process.env.FOCUS_HERO_PLAYWRIGHT].filter(Boolean)) {
  try { ({ chromium } = require(candidate)); break; } catch (_) {}
}
if (!chromium) throw new Error("Playwright is required (set FOCUS_HERO_PLAYWRIGHT to its module path)");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = await fs.readFile(path.join(root, "focus-hero.html"), "utf8");
const index = await fs.readFile(path.join(root, "index.html"), "utf8");
const sw = await fs.readFile(path.join(root, "sw.js"), "utf8");
assert.equal(index, html, "index.html and focus-hero.html must remain exact mirrors");
assert.match(html, /data-tab="expedition"/);
assert.match(html, /id="tog-prioritymode"/);
assert.match(html, /focus-economy\.js/);
assert.match(sw, /focus-economy\.js/);

const mime = { ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".svg":"image/svg+xml", ".png":"image/png", ".webmanifest":"application/manifest+json" };
const server = http.createServer(async (req,res)=>{
  try {
    const url = new URL(req.url, "http://127.0.0.1");
    const rel = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const file = path.resolve(root, `.${rel}`);
    if (!file.startsWith(root)) throw new Error("path escape");
    const body = await fs.readFile(file);
    res.writeHead(200, { "Content-Type":mime[path.extname(file)] || "application/octet-stream", "Cache-Control":"no-store" });
    res.end(body);
  } catch (_) { res.writeHead(404); res.end("not found"); }
});

await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const { port } = server.address();
const browser = await chromium.launch({headless:true,channel:"chrome"});
const context = await browser.newContext({serviceWorkers:"block"});
const page = await context.newPage();
const pageErrors=[];
page.on("pageerror",e=>pageErrors.push(String(e)));

async function reset(){
  await page.evaluate(()=>{
    const fh=window.__FocusHero, current=fh.stateRef(), fresh=fh.migrate(JSON.parse(JSON.stringify(fh.DEFAULTS)));
    Object.keys(current).forEach(k=>delete current[k]); Object.assign(current,fresh);
    current.sync.enabled=false; current.settings.monthlyBackup=false; current.sessionsLog=[]; current.activityLog=[]; current.editLog=[];
    window.__fhEconomyTest.ensure(); window.saveState({fromPull:true}); window.renderAll();
  });
}

try {
  await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>window.__fhEconomyTest && window.__FocusHero?.stateRef);

  const migration = await page.evaluate(()=>{
    const legacy=JSON.parse(JSON.stringify(window.__FocusHero.DEFAULTS));
    delete legacy.focusEconomy; delete legacy.settings.priorityMode;
    legacy.totalFocusMin=49872; legacy.completedFocusSessions=451; legacy.history={"2026-07-18":95};
    const m=window.__FocusHero.migrate(legacy);
    return {minutes:m.totalFocusMin,sessions:m.completedFocusSessions,history:m.history["2026-07-18"],grants:Object.keys(m.focusEconomy.grants).length,priority:m.settings.priorityMode};
  });
  assert.deepEqual(migration,{minutes:49872,sessions:451,history:95,grants:0,priority:false});

  await reset();
  const parity = await page.evaluate(()=>{
    const s=window.__FocusHero.stateRef(), task=window.__FocusHero.createTask({name:"Deep Work",emoji:"D"}), now=new Date(), day=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
    s.combo={count:3,date:day}; s.streak=4; s.lastFocusDate=day;
    if(s.targets){for(const scope of ["daily","weekly"]){if(s.targets[scope])s.targets[scope].claimed={easy:true,medium:true,hard:true};}}
    s.store.boosts=[{uid:"test-boost",kind:"xp",mult:1.5,durationMs:3600000,activatedAt:Date.now(),used:false}];
    const before={level:s.hero.level,xp:s.hero.xp};
    const expected=window.__fhEconomyTest.liveRewardContext(70,task.id,task.name,{combo:3,streak:4});
    const add=window.applyTaskTimeAdjustment(task.id,70);
    const afterAdd={level:s.hero.level,xp:s.hero.xp};
    const rec=s.sessionsLog.find(r=>r?.source==="ledger"&&r.taskId===task.id);
    const addGrant=window.__fhEconomyTest.totals();
    const remove=window.applyTaskTimeAdjustment(task.id,-70);
    const afterRemove={level:s.hero.level,xp:s.hero.xp};
    const afterGrant=window.__fhEconomyTest.totals();
    return {expected,add,remove,before,afterAdd,afterRemove,recordXp:rec.xp,recordRaw:rec.xpRaw,recordCombo:rec.comboPriorCount,recordStreak:rec.streakForCalc,addGrant,afterGrant};
  });
  assert.equal(parity.recordXp,parity.expected.xp);
  assert.equal(parity.recordRaw,parity.expected.xpRaw);
  assert.equal(parity.recordCombo,3);
  assert.equal(parity.recordStreak,4);
  assert.notDeepEqual(parity.afterAdd,parity.before,"manual addition must change hero XP");
  assert.equal(parity.add.xpDelta,parity.expected.xp,"addition reports the exact live-equivalent XP grant");
  assert.equal(parity.remove.xpDelta,-parity.expected.xp,"matching removal reverses that exact session-equivalent XP; one-time achievements remain earned");
  assert.equal(parity.addGrant.orbs,2);
  assert.equal(parity.addGrant.materials.seed,2);
  assert.equal(parity.addGrant.materials.timber,4);
  assert.deepEqual(parity.afterGrant,{orbs:0,materials:{seed:0,herb:0,timber:0,ore:0},farmMinutes:0});

  await reset();
  const sessionEdit = await page.evaluate(()=>{
    const s=window.__FocusHero.stateRef(), task=window.__FocusHero.createTask({name:"Edit parity",emoji:"E"}), now=new Date(), day=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
    s.combo={count:2,date:day};s.streak=3;s.lastFocusDate=day;
    if(s.targets){for(const scope of ["daily","weekly"]){if(s.targets[scope])s.targets[scope].claimed={easy:true,medium:true,hard:true};}}
    window.applyTaskTimeAdjustment(task.id,70);
    const rec=s.sessionsLog.find(r=>r?.source==="ledger"&&r.taskId===task.id), oldXp=rec.xp, mult=rec.xpMultiplierApplied;
    const raw=window.__FocusHero.computeXpBreakdown(30,{comboCount:2,streakDays:3,settings:s.settings}).total;
    const expected=Math.round(raw*mult), result=window.applySessionEdit(rec.id,30), eco=window.__fhEconomyTest.totals();
    return {oldXp,expected,newXp:rec.xp,result,minutes:rec.minutes,eco};
  });
  assert.equal(sessionEdit.minutes,30);
  assert.equal(sessionEdit.newXp,sessionEdit.expected);
  assert.equal(sessionEdit.result.xpDelta,sessionEdit.expected-sessionEdit.oldXp);
  assert.deepEqual(sessionEdit.eco,{orbs:1,materials:{seed:1,herb:0,timber:2,ore:0},farmMinutes:30});

  await reset();
  const priorityCancel = await page.evaluate(()=>{
    const s=window.__FocusHero.stateRef(), task=window.__FocusHero.createTask({name:"Priority",emoji:"P"});
    s.settings.priorityMode=true; s.timer.priorityRun=true; s.timer.mode="focus"; s.timer.activeTaskId=task.id; s.timer.activeTaskNameAtStart=task.name;
    const before={minutes:s.totalFocusMin,canceled:s.canceledSessionCount,records:s.sessionsLog.length};
    const pending=window.commitFocusTimerSession({taskId:task.id,taskLabel:task.name,action:"Travel"},25);
    const modalOpen=!document.getElementById("priority-check-modal").hidden;
    document.getElementById("btn-priority-cancel").click();
    return {before,pending,modalOpen,minutes:s.totalFocusMin,canceled:s.canceledSessionCount,records:s.sessionsLog.length,orbs:window.__fhEconomyTest.totals().orbs};
  });
  assert.equal(priorityCancel.pending.pendingPriority,true);
  assert.equal(priorityCancel.modalOpen,true);
  assert.equal(priorityCancel.minutes,priorityCancel.before.minutes);
  assert.equal(priorityCancel.records,priorityCancel.before.records);
  assert.equal(priorityCancel.canceled,priorityCancel.before.canceled+1);
  assert.equal(priorityCancel.orbs,0);

  await reset();
  const priorityKeep = await page.evaluate(()=>{
    const s=window.__FocusHero.stateRef(), task=window.__FocusHero.createTask({name:"Priority",emoji:"P"});
    s.settings.priorityMode=true; s.timer.priorityRun=true; s.timer.mode="focus"; s.timer.activeTaskId=task.id; s.timer.activeTaskNameAtStart=task.name;
    window.commitFocusTimerSession({taskId:task.id,taskLabel:task.name,action:"Travel"},25);
    document.getElementById("btn-priority-keep").click();
    const rec=s.sessionsLog.find(r=>r?.type==="focus");
    return {minutes:s.totalFocusMin,verified:rec?.priorityVerified,orbs:window.__fhEconomyTest.totals().orbs,farm:window.__fhEconomyTest.totals().farmMinutes};
  });
  assert.deepEqual(priorityKeep,{minutes:25,verified:true,orbs:2,farm:25});

  const merge = await page.evaluate(()=>window.__fhEconomyTest.merge(
    {version:1,grants:{same:{id:"same",orbs:1,updatedAt:10}},spends:[{id:"a",at:1}],harvests:[],plots:[],unlockedPlots:2},
    {version:1,grants:{same:{id:"same",orbs:4,updatedAt:20}},spends:[{id:"b",at:2}],harvests:[],plots:[],unlockedPlots:3}
  ));
  assert.equal(merge.grants.same.orbs,4);
  assert.deepEqual(merge.spends.map(x=>x.id),["a","b"]);
  assert.equal(merge.unlockedPlots,3);

  assert.deepEqual(pageErrors,[],pageErrors.join("\n"));
  console.log("ok - live XP parity, Priority cancellation/verification, Expedition grants, and merge safety");
} finally {
  await context.close(); await browser.close(); await new Promise(resolve=>server.close(resolve));
}
