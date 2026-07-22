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
const harness = `<!doctype html><meta charset="utf-8"><body><script>
window.__guardInstallCounts={timeouts:0,intervals:0,visibility:0,pagehide:0};
const nativeTimeout=window.setTimeout.bind(window),nativeInterval=window.setInterval.bind(window);
window.setTimeout=function(){window.__guardInstallCounts.timeouts++;return nativeTimeout.apply(window,arguments)};
window.setInterval=function(){window.__guardInstallCounts.intervals++;return nativeInterval.apply(window,arguments)};
const nativeAdd=EventTarget.prototype.addEventListener;
EventTarget.prototype.addEventListener=function(type){
  if(this===document&&type==="visibilitychange")window.__guardInstallCounts.visibility++;
  if(this===window&&type==="pagehide")window.__guardInstallCounts.pagehide++;
  return nativeAdd.apply(this,arguments);
};
</script><script src="./data-guard.js"></script><script src="./data-guard.js"></script>`;
const mime = { ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8" };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === "/guard-harness.html") {
      res.writeHead(200, { "Content-Type":mime[".html"], "Cache-Control":"no-store" }); res.end(harness); return;
    }
    if (url.pathname === "/seed.html") {
      res.writeHead(200, { "Content-Type":mime[".html"], "Cache-Control":"no-store" }); res.end("<!doctype html><title>seed</title>"); return;
    }
    const rel = decodeURIComponent(url.pathname === "/" ? "/recover.html" : url.pathname);
    const file = path.resolve(root, `.${rel}`);
    if (!file.startsWith(root)) throw new Error("path escape");
    const body = await fs.readFile(file);
    res.writeHead(200, { "Content-Type":mime[path.extname(file)] || "application/octet-stream", "Cache-Control":"no-store" });
    res.end(body);
  } catch (_) { res.writeHead(404); res.end("not found"); }
});

await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;
const browser = await chromium.launch({ headless:true, channel:"chrome" });
let passed = 0;
async function test(name, fn){
  let timer;
  try {
    await Promise.race([
      fn(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`timeout: ${name}`)), 20000); })
    ]);
  } finally { clearTimeout(timer); }
  passed++; console.log(`ok ${passed} - ${name}`);
}

try {
  await test("double inclusion installs one data guard instance", async () => {
    const context = await browser.newContext({ serviceWorkers:"block" });
    const page = await context.newPage();
    const errors = []; page.on("pageerror", error => errors.push(String(error)));
    await page.goto(`${base}/guard-harness.html`, { waitUntil:"domcontentloaded" });
    await page.waitForFunction(() => window.__fhGuardTest);
    const result = await page.evaluate(() => ({
      installed:window.__fhDataGuardInstalled === true,
      counts:window.__guardInstallCounts,
      api:typeof window.__fhGuardTest.takeSnapshot === "function"
    }));
    assert.deepEqual(result, {
      installed:true,
      counts:{timeouts:2,intervals:1,visibility:1,pagehide:1},
      api:true
    });
    assert.deepEqual(errors, []);
    await context.close();
  });

  await test("structural anomaly checks protect monotonic economy data without flagging normal additions", async () => {
    const context = await browser.newContext({ serviceWorkers:"block" });
    const page = await context.newPage();
    await page.goto(`${base}/guard-harness.html`, { waitUntil:"domcontentloaded" });
    const result = await page.evaluate(() => {
      const t = window.__fhGuardTest;
      const state = () => ({
        totalFocusMin:600, hero:{level:8}, history:{"2026-07-20":300,"2026-07-21":300},
        sessionsLog:[{id:"s1"},{id:"s2"}], tasks:[{id:"t1"}],
        focusEconomy:{version:1,
          grants:{g1:{id:"g1",updatedAt:200},g2:{id:"g2",updatedAt:220}},
          spends:[{id:"sp1",updatedAt:230}], harvests:[{id:"h1",updatedAt:240}],
          plots:[{id:"plot1",updatedAt:250},{id:"plot2",updatedAt:250},{id:"plot3",updatedAt:250}], unlockedPlots:3}
      });
      const guard = state();
      const rollback = state();
      delete rollback.focusEconomy.grants.g2;
      rollback.focusEconomy.spends=[];
      rollback.focusEconomy.harvests=[];
      rollback.focusEconomy.unlockedPlots=2;
      rollback.focusEconomy.plots[0].updatedAt=100;
      const duplicate = state(); duplicate.focusEconomy.spends.push({id:"g1",updatedAt:300});
      const higherTotalMissing = state(); higherTotalMissing.totalFocusMin=700; delete higherTotalMissing.focusEconomy;
      const richer = state();
      richer.focusEconomy.grants.g1.updatedAt=300;
      richer.focusEconomy.grants.g3={id:"g3",updatedAt:300};
      richer.focusEconomy.spends.push({id:"sp2",updatedAt:300});
      richer.focusEconomy.harvests.push({id:"h2",updatedAt:300});
      richer.focusEconomy.plots[0].updatedAt=300;
      const normalEdit = state(); normalEdit.history={"2026-07-21":600}; normalEdit.sessionsLog=[{id:"s2"}];
      const vanished = state(); vanished.history={}; vanished.sessionsLog=[]; vanished.tasks=[];
      const legacy = {totalFocusMin:600,hero:{level:8},history:{},sessionsLog:[],tasks:[]};
      const guardSummary=t.summarize(guard), richerSummary=t.summarize(richer);
      return {
        rollback:t.anomalyReasons(t.summarize(rollback),guardSummary),
        duplicate:t.anomalyReasons(t.summarize(duplicate),guardSummary),
        higherTotalMissing:t.anomalyReasons(t.summarize(higherTotalMissing),guardSummary),
        richer:t.anomalyReasons(richerSummary,guardSummary),
        normalEdit:t.anomalyReasons(t.summarize(normalEdit),guardSummary),
        vanished:t.anomalyReasons(t.summarize(vanished),guardSummary),
        legacy:t.anomalyReasons(t.summarize(legacy),t.summarize(legacy)),
        collapse:t.isAnomaly(5,600),
        poorReplace:t.sameDayReplaceOk(guardSummary,t.summarize(rollback)),
        richReplace:t.sameDayReplaceOk(guardSummary,richerSummary),
        idsDiffer:t.anomalyId("2026-07-21",guardSummary)!==t.anomalyId("2026-07-21",richerSummary)
      };
    });
    assert.ok(result.rollback.includes("focus-economy-grants-rollback"));
    assert.ok(result.rollback.includes("focus-economy-spends-rollback"));
    assert.ok(result.rollback.includes("focus-economy-harvests-rollback"));
    assert.ok(result.rollback.includes("focus-economy-unlocked-plots-rollback"));
    assert.ok(result.rollback.includes("focus-economy-grant-id-loss"));
    assert.ok(result.rollback.includes("focus-economy-plot-rollback"));
    assert.ok(result.duplicate.includes("focus-economy-duplicate-event-ids"));
    assert.ok(result.higherTotalMissing.includes("focus-economy-subtree-loss"));
    assert.deepEqual(result.richer, []);
    assert.deepEqual(result.normalEdit, []);
    assert.deepEqual(result.legacy, []);
    assert.ok(result.vanished.includes("same-total-multiple-subtrees-vanished"));
    assert.equal(result.collapse, true);
    assert.equal(result.poorReplace, false);
    assert.equal(result.richReplace, true);
    assert.equal(result.idsDiffer, true);
    await context.close();
  });

  await test("unsafe same-total economy loss cannot replace IndexedDB or mirror snapshots", async () => {
    const context = await browser.newContext({ serviceWorkers:"block" });
    const page = await context.newPage();
    await page.goto(`${base}/guard-harness.html`, { waitUntil:"domcontentloaded" });
    const result = await page.evaluate(async () => {
      const MAIN="focusHero.v4.state", MIRROR=MAIN+".guard", date=new Date().toISOString().slice(0,10);
      const protectedState={totalFocusMin:600,hero:{level:7},history:{"2026-07-21":600},sessionsLog:[{id:"s"}],tasks:[{id:"t"}],
        focusEconomy:{grants:{g1:{id:"g1",updatedAt:10}},spends:[{id:"sp1",updatedAt:10}],harvests:[],
          plots:[{id:"plot1",updatedAt:10},{id:"plot2",updatedAt:10},{id:"plot3",updatedAt:10}],unlockedPlots:3}};
      const poorer=JSON.parse(JSON.stringify(protectedState)); poorer.focusEconomy={grants:{},spends:[],harvests:[],plots:[],unlockedPlots:2};
      const db=await window.__fhGuardTest.openDb();
      await new Promise((resolve,reject)=>{const tx=db.transaction("snaps","readwrite");tx.objectStore("snaps").put({date,savedAt:"2026-07-21T12:00:00.000Z",minutes:600,state:protectedState});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
      db.close();
      localStorage.setItem(MIRROR,JSON.stringify({savedAt:"2026-07-21T12:00:00.000Z",state:protectedState}));
      localStorage.setItem(MAIN,JSON.stringify(poorer));
      await window.__fhGuardTest.takeSnapshot("unsafe-test");
      const afterBlocked=await (async()=>{const d=await window.__fhGuardTest.openDb();const rows=await window.__fhGuardTest.idbAll(d);d.close();return {row:rows[0],mirror:JSON.parse(localStorage.getItem(MIRROR))};})();
      const overlayShown=!!document.getElementById("fh-guard-overlay");
      document.getElementById("fh-guard-dismiss")?.click();
      await window.__fhGuardTest.takeSnapshot("unsafe-dismissed-test");
      const dismissedStayedClosed=!document.getElementById("fh-guard-overlay");
      const richer=JSON.parse(JSON.stringify(protectedState)); richer.focusEconomy.grants.g2={id:"g2",updatedAt:20}; richer.focusEconomy.spends.push({id:"sp2",updatedAt:20}); richer.focusEconomy.plots[0].updatedAt=20;
      localStorage.setItem(MAIN,JSON.stringify(richer));
      await window.__fhGuardTest.takeSnapshot("safe-test");
      const afterSafe=await (async()=>{const d=await window.__fhGuardTest.openDb();const rows=await window.__fhGuardTest.idbAll(d);d.close();return {row:rows[0],mirror:JSON.parse(localStorage.getItem(MIRROR))};})();
      return {
        blockedGrantCount:Object.keys(afterBlocked.row.state.focusEconomy.grants).length,
        blockedMirrorCount:Object.keys(afterBlocked.mirror.state.focusEconomy.grants).length,
        overlayShown,dismissedStayedClosed,
        safeGrantCount:Object.keys(afterSafe.row.state.focusEconomy.grants).length,
        safeMirrorCount:Object.keys(afterSafe.mirror.state.focusEconomy.grants).length
      };
    });
    assert.deepEqual(result,{blockedGrantCount:1,blockedMirrorCount:1,overlayShown:true,dismissedStayedClosed:true,safeGrantCount:2,safeMirrorCount:2});
    await context.close();
  });

  await test("a moderate regression cannot overwrite a stronger mirror when IndexedDB is empty", async () => {
    const context = await browser.newContext({ serviceWorkers:"block" });
    const page = await context.newPage();
    await page.goto(`${base}/guard-harness.html`, { waitUntil:"domcontentloaded" });
    const result = await page.evaluate(async () => {
      const MAIN="focusHero.v4.state",MIRROR=MAIN+".guard";
      const protectedState={totalFocusMin:1000,hero:{level:9},history:{"2026-07-21":1000},sessionsLog:[],tasks:[],
        focusEconomy:{grants:{},spends:[],harvests:[],plots:[],unlockedPlots:2}};
      const current=JSON.parse(JSON.stringify(protectedState));current.totalFocusMin=900;current.history={"2026-07-21":900};
      const mirrorRaw=JSON.stringify({savedAt:"2026-07-21T12:00:00.000Z",state:protectedState});
      localStorage.setItem(MIRROR,mirrorRaw);localStorage.setItem(MAIN,JSON.stringify(current));
      await window.__fhGuardTest.takeSnapshot("moderate-regression");
      const db=await window.__fhGuardTest.openDb(),rows=await window.__fhGuardTest.idbAll(db);db.close();
      return {mirrorUnchanged:localStorage.getItem(MIRROR)===mirrorRaw,idbMinutes:rows[0]?.state?.totalFocusMin};
    });
    assert.deepEqual(result,{mirrorUnchanged:true,idbMinutes:900});
    await context.close();
  });

  await test("data guard restore is byte-verified, backup-first, and rollback-safe", async () => {
    const context = await browser.newContext({ serviceWorkers:"block" });
    const page = await context.newPage();
    await page.goto(`${base}/guard-harness.html`, { waitUntil:"domcontentloaded" });
    const result = await page.evaluate(() => {
      const MAIN="focusHero.v4.state", prior=JSON.stringify({totalFocusMin:100,focusEconomy:{grants:{old:{id:"old"}}}});
      const target={dataVersion:16,totalFocusMin:100,focusEconomy:{grants:{new:{id:"new"}}},sessionsLog:[]};
      function storage(mode){
        const map=new Map([[MAIN,prior]]);let mainWrites=0,corrupted=false;
        return {map,
          getItem(key){
            const value=map.has(key)?map.get(key):null;
            if(key===MAIN&&mode.includes("corrupt")&&mainWrites===1&&!corrupted){corrupted=true;return JSON.stringify({totalFocusMin:100,focusEconomy:{grants:{lost:{id:"lost"}}},sessionsLog:[]});}
            if(key.includes(".pre-guard-restore-")&&mode==="backup-mismatch"&&map.has(key))return "mismatch";
            return value;
          },
          setItem(key,value){
            if(key.includes(".pre-guard-restore-")&&mode==="backup-throw")throw new Error("quota");
            if(key===MAIN){mainWrites++;if(mode==="corrupt-rollback-fail"&&mainWrites===2)throw new Error("rollback blocked");}
            map.set(key,String(value));
          },
          removeItem(key){map.delete(key);}
        };
      }
      function run(mode){
        const s=storage(mode);let error="",out=null;
        try{out=window.__fhGuardTest.verifiedRestore(s,target,MAIN+".pre-guard-restore-");}catch(e){error=e.message;}
        const backups=[...s.map.entries()].filter(([key])=>key.includes(".pre-guard-restore-"));
        return {error,main:s.map.get(MAIN),backup:backups[0]&&backups[0][1],out};
      }
      return {success:run("ok"),backupThrow:run("backup-throw"),backupMismatch:run("backup-mismatch"),corrupt:run("corrupt"),critical:run("corrupt-rollback-fail"),prior,target:JSON.stringify(target)};
    });
    assert.equal(result.success.main,result.target);
    assert.equal(result.success.backup,result.prior);
    assert.equal(result.backupThrow.main,result.prior);
    assert.match(result.backupThrow.error,/quota/);
    assert.equal(result.backupMismatch.main,result.prior);
    assert.match(result.backupMismatch.error,/backup verification/i);
    assert.equal(result.corrupt.main,result.prior);
    assert.equal(result.corrupt.backup,result.prior);
    assert.match(result.corrupt.error,/prior live state was restored and verified/i);
    assert.match(result.critical.error,/CRITICAL/);
    assert.equal(result.critical.backup,result.prior);
    await context.close();
  });

  await test("data guard restore preserves the current sync identity but pauses automatic upload", async () => {
    const context = await browser.newContext({ serviceWorkers:"block" });
    const page = await context.newPage();
    await page.goto(`${base}/guard-harness.html`, { waitUntil:"domcontentloaded" });
    const result = await page.evaluate(() => {
      const MAIN="focusHero.v4.state";
      const current={dataVersion:16,totalFocusMin:300,hero:{level:5},history:{},tasks:[],
        sync:{enabled:true,playerId:"current-player",cloudRev:12,syncCode:"CURRENT1",syncSecret:"current-secret",pendingSync:true,pendingSince:123,retryCount:2,retryAfter:456}};
      const target={dataVersion:16,totalFocusMin:240,hero:{level:4},history:{},tasks:[],
        sync:{enabled:true,playerId:"old-player",cloudRev:3,syncCode:"OLDCODE1",syncSecret:"old-secret",pendingSync:false}};
      const map=new Map([[MAIN,JSON.stringify(current)]]);
      const storage={getItem:key=>map.has(key)?map.get(key):null,setItem:(key,value)=>map.set(key,String(value)),removeItem:key=>map.delete(key)};
      const out=window.__fhGuardTest.verifiedRestore(storage,target,MAIN+".pre-guard-restore-");
      const restored=JSON.parse(map.get(MAIN));
      return {out,restored,current,target,backup:[...map.entries()].find(([key])=>key.includes(".pre-guard-restore-"))?.[1]};
    });
    assert.equal(result.restored.totalFocusMin,result.target.totalFocusMin);
    assert.equal(result.restored.sync.playerId,result.current.sync.playerId);
    assert.equal(result.restored.sync.cloudRev,result.current.sync.cloudRev);
    assert.equal(result.restored.sync.syncCode,result.current.sync.syncCode);
    assert.equal(result.restored.sync.enabled,false);
    assert.equal(result.restored.sync.pendingSync,false);
    assert.equal(result.restored.sync.pendingSince,0);
    assert.match(result.restored.sync.lastSyncError,/verify.*re-enabling/i);
    assert.equal(result.out.syncPaused,true);
    assert.equal(result.backup,JSON.stringify(result.current));
    await context.close();
  });

  await test("malformed live JSON is backed up exactly before the newest valid LKG is staged", async () => {
    const context = await browser.newContext({ serviceWorkers:"block" });
    const brokenRaw='{ definitely-not-valid-focus-hero-json';
    await context.addInitScript(({brokenRaw}) => {
      if (sessionStorage.getItem("startup-recovery-seeded")) return;
      sessionStorage.setItem("startup-recovery-seeded","1");
      const MAIN="focusHero.v4.state";
      const lkg={
        dataVersion:16,totalFocusMin:275,coins:73,
        hero:{name:"LKG Hero",level:5,xp:25},tasks:[],history:{"2026-07-21":275},sessionsLog:[],
        sync:{enabled:true,backend:"supabase",playerId:"lkg-player",cloudRev:14,syncCode:"LKGCODE1",syncSecret:"lkg-secret",pendingSync:true,pendingSince:12}
      };
      const stale={dataVersion:16,totalFocusMin:90,hero:{name:"Stale",level:2,xp:0},tasks:[],history:{},sessionsLog:[]};
      localStorage.setItem(MAIN,brokenRaw);
      localStorage.setItem(MAIN+".lkg",JSON.stringify({savedAt:"2026-07-21T23:59:00.000Z",state:lkg}));
      localStorage.setItem(MAIN+".pre-v16",JSON.stringify({savedAt:"2026-07-01T00:00:00.000Z",state:stale}));
    },{brokenRaw});
    const page=await context.newPage();
    await page.route("**/supabase.co/**",route=>route.abort());
    await page.goto(`${base}/focus-hero.html`,{waitUntil:"domcontentloaded"});
    await page.waitForFunction(() => window.__FocusHero?.stateRef);
    const first=await page.evaluate(() => {
      const MAIN="focusHero.v4.state",raw=localStorage.getItem(MAIN),state=JSON.parse(raw);
      const backupKey=Object.keys(localStorage).find(key=>key.startsWith(MAIN+".pre-startup-recovery-"));
      return {state,backupKey,backup:backupKey&&localStorage.getItem(backupKey),bootError:!!document.getElementById("__fh_safe")};
    });
    assert.equal(first.backup,brokenRaw);
    assert.match(first.backupKey,/\.pre-startup-recovery-/);
    assert.equal(first.state.totalFocusMin,275);
    assert.equal(first.state.coins,73);
    assert.equal(first.state.sync.playerId,"lkg-player");
    assert.equal(first.state.sync.cloudRev,14);
    assert.equal(first.state.sync.enabled,false);
    assert.equal(first.state.sync.pendingSync,false);
    assert.match(first.state.sync.lastSyncError,/startup recovery staged.*verify/i);
    assert.equal(first.bootError,false);
    await page.reload({waitUntil:"domcontentloaded"});
    await page.waitForFunction(() => window.__FocusHero?.stateRef);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("focusHero.v4.state")).totalFocusMin),275);
    await context.close();
  });

  await test("malformed live JSON with no valid snapshot fails closed without overwriting bytes", async () => {
    const context = await browser.newContext({ serviceWorkers:"block" });
    const brokenRaw="not-json-and-no-backup";
    await context.addInitScript(({brokenRaw}) => localStorage.setItem("focusHero.v4.state",brokenRaw),{brokenRaw});
    const page=await context.newPage();
    await page.goto(`${base}/focus-hero.html`,{waitUntil:"domcontentloaded"});
    await page.waitForSelector("#__fh_safe");
    await page.waitForTimeout(1250);
    const result=await page.evaluate(() => ({
      main:localStorage.getItem("focusHero.v4.state"),
      startupBackups:Object.keys(localStorage).filter(key=>key.includes(".pre-startup-recovery-")),
      message:document.getElementById("__fh_safe")?.textContent||""
    }));
    assert.equal(result.main,brokenRaw);
    assert.deepEqual(result.startupBackups,[]);
    assert.match(result.message,/malformed.*no valid recovery snapshot/i);
    await context.close();
  });

  await test("in-app snapshot recovery is backup-first, byte-verified, and sync-paused", async () => {
    const context = await browser.newContext({ serviceWorkers:"block" });
    const page = await context.newPage();
    const pageErrors=[]; page.on("pageerror",error=>pageErrors.push(String(error)));
    await page.route("**/supabase.co/**",route=>route.abort());
    await page.goto(`${base}/focus-hero.html`,{waitUntil:"domcontentloaded"});
    await page.waitForFunction(() => window.__FocusHero?.recover && Object.getOwnPropertyDescriptor(window,"state")?.set);
    const result=await page.evaluate(() => {
      const MAIN="focusHero.v4.state",LKG=MAIN+".lkg";
      const current=window.__FocusHero.migrate({
        dataVersion:window.__FocusHero.DATA_VERSION,totalFocusMin:300,coins:31,
        hero:{name:"Current Hero",level:5,xp:20},tasks:[],history:{"2026-07-21":300},sessionsLog:[],
        sync:{enabled:true,backend:"supabase",playerId:"current-player",cloudRev:12,syncCode:"CURRENT1",syncSecret:"current-secret",pendingSync:true,pendingSince:123,retryCount:2,retryAfter:456}
      });
      const target=window.__FocusHero.migrate({
        dataVersion:window.__FocusHero.DATA_VERSION,totalFocusMin:240,coins:99,
        hero:{name:"Recovered Hero",level:4,xp:40},tasks:[],history:{"2026-07-20":240},sessionsLog:[],
        sync:{enabled:true,backend:"supabase",playerId:"old-player",cloudRev:3,syncCode:"OLDCODE1",syncSecret:"old-secret",pendingSync:false}
      });
      const currentRaw=JSON.stringify(current);
      localStorage.setItem(MAIN,currentRaw);
      localStorage.setItem(LKG,JSON.stringify({savedAt:"2026-07-20T23:59:00.000Z",state:target}));
      window.state=current;
      const out=window.__FocusHero.recover();
      const stagedRaw=localStorage.getItem(MAIN),staged=JSON.parse(stagedRaw);
      return {
        out,currentRaw,stagedRaw,staged,memory:window.__FocusHero.stateRef(),
        backup:out.backupKey&&localStorage.getItem(out.backupKey),
        backupKeys:Object.keys(localStorage).filter(key=>key.startsWith(MAIN+".pre-in-app-recovery-"))
      };
    });
    assert.equal(result.out.ok,true);
    assert.equal(result.out.syncPaused,true);
    assert.match(result.out.backupKey,/\.pre-in-app-recovery-/);
    assert.equal(result.backup,result.currentRaw);
    assert.deepEqual(result.backupKeys,[result.out.backupKey]);
    assert.equal(result.staged.totalFocusMin,240);
    assert.equal(result.staged.coins,99);
    assert.equal(result.staged.sync.playerId,"current-player");
    assert.equal(result.staged.sync.cloudRev,12);
    assert.equal(result.staged.sync.syncCode,"CURRENT1");
    assert.equal(result.staged.sync.syncSecret,"current-secret");
    assert.equal(result.staged.sync.enabled,false);
    assert.equal(result.staged.sync.pendingSync,false);
    assert.equal(result.staged.sync.pendingSince,0);
    assert.equal(result.staged.sync.retryCount,0);
    assert.equal(result.staged.sync.retryAfter,0);
    assert.match(result.staged.sync.lastSyncError,/verify.*re-enabling/i);
    assert.equal(result.stagedRaw,JSON.stringify(result.staged));
    assert.equal(result.memory.totalFocusMin,result.staged.totalFocusMin);
    assert.equal(result.memory.sync.enabled,false);
    assert.equal(result.memory.sync.playerId,"current-player");
    assert.deepEqual(pageErrors,[]);
    await context.close();
  });

  await test("in-app recovery rejects malformed sources before migration and leaves live bytes unchanged", async () => {
    const context = await browser.newContext({ serviceWorkers:"block" });
    const page=await context.newPage();
    await page.goto(`${base}/focus-hero.html`,{waitUntil:"domcontentloaded"});
    await page.waitForFunction(() => window.__FocusHero?.recover && Object.getOwnPropertyDescriptor(window,"state")?.set);
    const result=await page.evaluate(() => {
      const MAIN="focusHero.v4.state",BAD=MAIN+".malformed-fixture";
      const current=window.__FocusHero.migrate({dataVersion:16,totalFocusMin:155,hero:{name:"Safe",level:3,xp:5},tasks:[],history:{},sessionsLog:[]});
      window.state=current;
      const before=JSON.stringify(current);
      localStorage.setItem(MAIN,before);
      localStorage.setItem(BAD,JSON.stringify({savedAt:"2026-07-01T00:00:00.000Z",state:[]}));
      const backupCountBefore=Object.keys(localStorage).filter(key=>key.startsWith(MAIN+".pre-in-app-recovery-")).length;
      const out=window.__FocusHero.recover(BAD);
      const backupCountAfter=Object.keys(localStorage).filter(key=>key.startsWith(MAIN+".pre-in-app-recovery-")).length;
      return {out,before,after:localStorage.getItem(MAIN),backupCountBefore,backupCountAfter};
    });
    assert.equal(result.out.ok,false);
    assert.match(result.out.error,/not a recognizable Focus Hero state/i);
    assert.equal(result.after,result.before);
    assert.equal(result.backupCountAfter,result.backupCountBefore);
    await context.close();
  });

  await test("in-app recovery rolls exact prior bytes back when main read-back verification fails", async () => {
    const context = await browser.newContext({ serviceWorkers:"block" });
    const page=await context.newPage();
    await page.goto(`${base}/focus-hero.html`,{waitUntil:"domcontentloaded"});
    await page.waitForFunction(() => window.__FocusHero?.stageRecovery && Object.getOwnPropertyDescriptor(window,"state")?.set);
    const result=await page.evaluate(() => {
      const MAIN="focusHero.v4.state";
      const current=window.__FocusHero.migrate({dataVersion:16,totalFocusMin:190,hero:{name:"Prior",level:4,xp:10},tasks:[],history:{},sessionsLog:[]});
      const target=window.__FocusHero.migrate({dataVersion:16,totalFocusMin:210,hero:{name:"Target",level:4,xp:30},tasks:[],history:{},sessionsLog:[]});
      const prior=JSON.stringify(current);
      window.state=current;
      localStorage.setItem(MAIN,prior);
      const nativeGet=Storage.prototype.getItem,nativeSet=Storage.prototype.setItem;
      let mainWrites=0,corrupted=false,error="";
      try {
        Storage.prototype.setItem=function(key,value){ if(key===MAIN) mainWrites++; return nativeSet.call(this,key,value); };
        Storage.prototype.getItem=function(key){
          const value=nativeGet.call(this,key);
          if(key===MAIN&&mainWrites===1&&!corrupted){corrupted=true;return JSON.stringify({dataVersion:16,totalFocusMin:0,hero:{level:1},tasks:[]});}
          return value;
        };
        window.__FocusHero.stageRecovery(target);
      } catch(e){ error=e.message; }
      finally { Storage.prototype.getItem=nativeGet; Storage.prototype.setItem=nativeSet; }
      const backupKey=Object.keys(localStorage).find(key=>key.startsWith(MAIN+".pre-in-app-recovery-"));
      return {error,prior,main:localStorage.getItem(MAIN),backup:backupKey&&localStorage.getItem(backupKey),memory:window.__FocusHero.stateRef().totalFocusMin};
    });
    assert.match(result.error,/prior live state was restored and verified/i);
    assert.equal(result.main,result.prior);
    assert.equal(result.backup,result.prior);
    assert.equal(result.memory,190);
    await context.close();
  });

  await test("boot-error Restore button uses the verified sync-paused recovery path", async () => {
    const context = await browser.newContext({ serviceWorkers:"block" });
    const page = await context.newPage();
    const dialogs=[]; page.on("dialog",dialog=>{dialogs.push(dialog.message());void dialog.dismiss();});
    await page.route("**/supabase.co/**",route=>route.abort());
    await page.goto(`${base}/focus-hero.html`,{waitUntil:"domcontentloaded"});
    await page.waitForFunction(() => window.__FocusHero?.recover && typeof window.showBootError === "function");
    const seeded=await page.evaluate(() => {
      const MAIN="focusHero.v4.state",LKG=MAIN+".lkg";
      const current=window.__FocusHero.migrate({
        dataVersion:window.__FocusHero.DATA_VERSION,totalFocusMin:410,coins:41,
        hero:{name:"Current Boot Hero",level:6,xp:10},tasks:[],history:{"2026-07-21":410},sessionsLog:[],
        sync:{enabled:true,backend:"supabase",playerId:"boot-current-player",cloudRev:17,syncCode:"BOOTCUR1",syncSecret:"boot-current-secret",pendingSync:true,pendingSince:321,retryCount:3,retryAfter:654}
      });
      const target=window.__FocusHero.migrate({
        dataVersion:window.__FocusHero.DATA_VERSION,totalFocusMin:360,coins:88,
        hero:{name:"Recovered Boot Hero",level:5,xp:50},tasks:[],history:{"2026-07-20":360},sessionsLog:[],
        sync:{enabled:true,backend:"supabase",playerId:"boot-old-player",cloudRev:4,syncCode:"BOOTOLD1",syncSecret:"boot-old-secret",pendingSync:false}
      });
      const stale=window.__FocusHero.migrate({
        dataVersion:window.__FocusHero.DATA_VERSION,totalFocusMin:110,coins:11,
        hero:{name:"Stale Migration Hero",level:2,xp:0},tasks:[],history:{"2026-07-01":110},sessionsLog:[]
      });
      const currentRaw=JSON.stringify(current);
      localStorage.setItem(MAIN,currentRaw);
      localStorage.setItem(LKG,JSON.stringify({savedAt:"2026-07-20T20:00:00.000Z",state:target}));
      localStorage.setItem(MAIN+".pre-v16",JSON.stringify({savedAt:"2026-07-01T00:00:00.000Z",state:stale}));
      window.state=current;
      window.showBootError(new Error("synthetic boot failure"));
      return {currentRaw};
    });
    await page.evaluate(() => {
      document.getElementById("__fh_restore").addEventListener("click",() => {
        sessionStorage.setItem("__focusHeroTestPreRestoreRaw",localStorage.getItem("focusHero.v4.state")||"");
      },{capture:true,once:true});
    });
    await Promise.all([
      page.waitForNavigation({waitUntil:"domcontentloaded"}),
      page.locator("#__fh_restore").click()
    ]);
    await page.waitForFunction(() => window.__FocusHero?.stateRef);
    const restored=await page.evaluate(() => {
      const MAIN="focusHero.v4.state",raw=localStorage.getItem(MAIN),state=JSON.parse(raw);
      const backupKey=Object.keys(localStorage).find(key=>key.startsWith(MAIN+".pre-in-app-recovery-"));
      return {
        raw,state,backupKey,backup:backupKey&&localStorage.getItem(backupKey),
        preRestoreRaw:sessionStorage.getItem("__focusHeroTestPreRestoreRaw")
      };
    });
    assert.ok(seeded.currentRaw);
    assert.equal(restored.backup,restored.preRestoreRaw);
    assert.match(restored.backupKey,/\.pre-in-app-recovery-/);
    assert.equal(restored.state.totalFocusMin,360);
    assert.equal(restored.state.coins,88);
    assert.equal(restored.state.sync.playerId,"boot-current-player");
    assert.equal(restored.state.sync.cloudRev,17);
    assert.equal(restored.state.sync.syncCode,"BOOTCUR1");
    assert.equal(restored.state.sync.syncSecret,"boot-current-secret");
    assert.equal(restored.state.sync.enabled,false);
    assert.equal(restored.state.sync.pendingSync,false);
    assert.equal(restored.state.sync.pendingSince,0);
    assert.match(restored.state.sync.lastSyncError,/verify.*re-enabling/i);
    assert.deepEqual(dialogs,[]);
    await context.close();
  });

  await test("recovery page lists, downloads, and restores IndexedDB guard snapshots", async () => {
    const context = await browser.newContext({ serviceWorkers:"block", acceptDownloads:true });
    const page = await context.newPage();
    const pageErrors=[]; page.on("pageerror",error=>pageErrors.push(String(error)));
    await page.goto(`${base}/seed.html`);
    const seeded = await page.evaluate(async () => {
      const live={dataVersion:16,totalFocusMin:120,hero:{level:4,xp:20},history:{"2026-07-19":120},sessionsLog:[{id:"live"}],tasks:[{id:"life"}],focusEconomy:{grants:{},spends:[],harvests:[],plots:[],unlockedPlots:2},
        sync:{enabled:true,playerId:"current-player",cloudRev:12,syncCode:"CURRENT1",syncSecret:"current-secret",userToken:"live-bearer",refreshToken:"live-refresh",tokenExpiresAt:999,pendingSync:true,pendingSince:123}};
      const guard={dataVersion:16,totalFocusMin:240,hero:{level:6,xp:40},history:{"2026-07-19":120,"2026-07-20":120},sessionsLog:[{id:"a"},{id:"b"}],tasks:[{id:"life"}],coins:7,
        focusEconomy:{grants:{g1:{id:"g1",updatedAt:2}},spends:[{id:"sp1",updatedAt:2}],harvests:[{id:"h1",updatedAt:2}],plots:[{id:"plot1"},{id:"plot2"},{id:"plot3"}],unlockedPlots:3},
        sync:{enabled:true,playerId:"old-player",cloudRev:3,syncCode:"OLDCODE1",syncSecret:"old-secret",userToken:"guard-bearer",refreshToken:"guard-refresh",tokenExpiresAt:888,pendingSync:false}};
      localStorage.setItem("focusHero.v4.state",JSON.stringify(live));
      localStorage.setItem("focusHero.v4.state.lkg",JSON.stringify({savedAt:"2026-07-19T12:00:00.000Z",state:live}));
      const db=await new Promise((resolve,reject)=>{const r=indexedDB.open("fh-guard",2);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains("snaps"))r.result.createObjectStore("snaps",{keyPath:"date"});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
      await new Promise((resolve,reject)=>{const tx=db.transaction("snaps","readwrite"),store=tx.objectStore("snaps");store.put({date:"2026-07-20",savedAt:"2026-07-20T23:59:00.000Z",reason:"interval",minutes:999999,state:guard});store.put({date:"2026-07-18",savedAt:"2026-07-18T10:00:00.000Z",reason:"malformed",minutes:999999,note:"no state"});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
      const before=await new Promise((resolve,reject)=>{const tx=db.transaction("snaps","readonly"),r=tx.objectStore("snaps").getAll();r.onsuccess=()=>resolve(JSON.stringify(r.result));r.onerror=()=>reject(r.error);});
      db.close(); return {live:JSON.stringify(live),guard:JSON.stringify(guard),before};
    });
    await page.goto(`${base}/recover.html`,{waitUntil:"domcontentloaded"});
    await page.waitForFunction(() => window.__fhRecoveryTest?.entries().some(entry => entry.source === "indexedDB"));
    const cards = page.locator('.snap[data-source="indexedDB"]');
    assert.equal(await cards.count(),2);
    const validCard=cards.filter({hasText:"2026-07-20"});
    const malformedCard=cards.filter({hasText:"2026-07-18"});
    const validText=await validCard.textContent();
    assert.match(validText,/IndexedDB guard ring/);
    assert.match(validText,/2026-07-20T23:59:00.000Z/);
    assert.match(validText,/4h 0m/);
    assert.doesNotMatch(validText,/999999/);
    assert.match(validText,/Economy events\s*3/);
    assert.match(validText,/Unlocked plots\s*3/);
    assert.equal(await validCard.locator("button.restore").count(),1);
    assert.equal(await malformedCard.locator("button.restore").count(),0);
    assert.equal(await malformedCard.locator("button.dl").count(),0);
    assert.match(await malformedCard.textContent(),/raw download is disabled/i);
    const downloadPromise=page.waitForEvent("download");
    await validCard.locator("button.dl").click();
    const download=await downloadPromise;
    assert.match(download.suggestedFilename(),/^focus-hero-indexedDB-.*-sanitized-/);
    const downloaded=JSON.parse(await fs.readFile(await download.path(),"utf8"));
    assert.equal(downloaded.state.sync.userToken,undefined);
    assert.equal(downloaded.state.sync.refreshToken,undefined);
    assert.equal(downloaded.state.sync.tokenExpiresAt,undefined);
    assert.equal(downloaded.state.sync.syncCode,"OLDCODE1");
    assert.equal(downloaded.state.sync.syncSecret,"old-secret");
    await download.delete();
    page.once("dialog",dialog=>dialog.accept());
    await validCard.locator("button.restore").click();
    await page.waitForFunction(() => /Restored & verified/.test(document.getElementById("status")?.textContent||""));
    const restored=await page.evaluate(async () => {
      const main=localStorage.getItem("focusHero.v4.state");
      const backupKey=Object.keys(localStorage).find(key=>key.startsWith("focusHero.v4.state.pre-recovery-"));
      const db=await new Promise((resolve,reject)=>{const r=indexedDB.open("fh-guard");r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
      const after=await new Promise((resolve,reject)=>{const tx=db.transaction("snaps","readonly"),r=tx.objectStore("snaps").getAll();r.onsuccess=()=>resolve(JSON.stringify(r.result));r.onerror=()=>reject(r.error);});
      db.close(); return {main,backup:backupKey&&localStorage.getItem(backupKey),after};
    });
    assert.equal(restored.backup,seeded.live);
    assert.equal(restored.after,seeded.before);
    const stagedMain=JSON.parse(restored.main),guardState=JSON.parse(seeded.guard),liveState=JSON.parse(seeded.live);
    assert.equal(stagedMain.sync.playerId,liveState.sync.playerId);
    assert.equal(stagedMain.sync.cloudRev,liveState.sync.cloudRev);
    assert.equal(stagedMain.sync.syncCode,liveState.sync.syncCode);
    assert.equal(stagedMain.sync.enabled,false);
    assert.equal(stagedMain.sync.pendingSync,false);
    assert.equal(stagedMain.sync.pendingSince,0);
    assert.match(stagedMain.sync.lastSyncError,/verify.*re-enabling/i);
    delete stagedMain.sync; delete guardState.sync;
    assert.deepEqual(stagedMain,guardState);
    assert.deepEqual(pageErrors,[]);
    await context.close();
  });

  await test("recovery restore failure rolls back exact bytes and keeps its backup", async () => {
    const context = await browser.newContext({ serviceWorkers:"block" });
    const page = await context.newPage();
    await page.goto(`${base}/recover.html`,{waitUntil:"domcontentloaded"});
    const result=await page.evaluate(() => {
      const MAIN="focusHero.v4.state",prior=JSON.stringify({totalFocusMin:90,focusEconomy:{grants:{old:{id:"old"}}}}),target={dataVersion:16,totalFocusMin:90,focusEconomy:{grants:{new:{id:"new"}}}};
      const map=new Map([[MAIN,prior]]);let mainWrites=0,corrupted=false;
      const storage={
        getItem(key){const value=map.has(key)?map.get(key):null;if(key===MAIN&&mainWrites===1&&!corrupted){corrupted=true;return JSON.stringify({totalFocusMin:90,focusEconomy:{grants:{wrong:{id:"wrong"}}}});}return value;},
        setItem(key,value){if(key===MAIN)mainWrites++;map.set(key,String(value));},removeItem(key){map.delete(key);}
      };
      let error="";try{window.__fhRecoveryTest.verifiedRestore({parsed:target},storage);}catch(e){error=e.message;}
      const backup=[...map.entries()].find(([key])=>key.startsWith(MAIN+".pre-recovery-"));
      const backupMap=new Map([[MAIN,prior]]);let candidateWrites=0,backupError="";
      const backupFailStorage={
        getItem:key=>backupMap.has(key)?backupMap.get(key):null,
        setItem(key,value){if(key.startsWith(MAIN+".pre-recovery-"))throw new Error("synthetic quota");if(key===MAIN)candidateWrites++;backupMap.set(key,String(value));},
        removeItem:key=>backupMap.delete(key)
      };
      try{window.__fhRecoveryTest.verifiedRestore({parsed:target},backupFailStorage);}catch(e){backupError=e.message;}
      return {error,main:map.get(MAIN),backup:backup&&backup[1],prior,backupError,backupFailMain:backupMap.get(MAIN),candidateWrites};
    });
    assert.match(result.error,/prior live state was restored and verified/i);
    assert.equal(result.main,result.prior);
    assert.equal(result.backup,result.prior);
    assert.match(result.backupError,/live state was not changed.*synthetic quota/i);
    assert.equal(result.backupFailMain,result.prior);
    assert.equal(result.candidateWrites,0);
    await context.close();
  });

  await test("opening recovery with no snapshots does not create the guard database", async () => {
    const context = await browser.newContext({ serviceWorkers:"block" });
    await context.addInitScript(() => {
      window.__listRecoveryDatabases = typeof indexedDB.databases === "function" ? indexedDB.databases.bind(indexedDB) : null;
      try { Object.defineProperty(indexedDB,"databases",{configurable:true,value:undefined}); } catch(_){}
    });
    const page = await context.newPage();
    await page.goto(`${base}/recover.html`,{waitUntil:"domcontentloaded"});
    await page.waitForFunction(() => !/Reading localStorage/.test(document.getElementById("list")?.textContent||""));
    const result=await page.evaluate(async () => ({
      entries:window.__fhRecoveryTest.entries().length,
      databases:window.__listRecoveryDatabases?(await window.__listRecoveryDatabases()).map(db=>db.name):[]
    }));
    assert.equal(result.entries,0);
    assert.ok(!result.databases.includes("fh-guard"));
    await context.close();
  });

  await test("an IndexedDB read failure leaves localStorage recovery usable", async () => {
    const context = await browser.newContext({ serviceWorkers:"block" });
    await context.addInitScript(() => {
      Object.defineProperty(window,"indexedDB",{configurable:true,value:{
        databases:async()=>{throw new Error("synthetic denied");},
        open:()=>{throw new Error("synthetic denied");}
      }});
    });
    const page = await context.newPage();
    await page.goto(`${base}/seed.html`);
    await page.evaluate(() => localStorage.setItem("focusHero.v4.state",JSON.stringify({totalFocusMin:75,hero:{level:2},history:{"2026-07-21":75},sessionsLog:[],tasks:[]})));
    await page.goto(`${base}/recover.html`,{waitUntil:"domcontentloaded"});
    await page.waitForFunction(() => window.__fhRecoveryTest?.entries().length === 1);
    assert.equal(await page.locator('.snap[data-source="localStorage"]').count(),1);
    assert.match(await page.locator("#list").textContent(),/IndexedDB guard ring could not be read: synthetic denied/);
    await context.close();
  });

  console.log(`passed ${passed}/${passed}`);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
