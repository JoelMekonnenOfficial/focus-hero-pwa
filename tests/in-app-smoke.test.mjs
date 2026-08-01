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
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://127.0.0.1");
    const rel = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const file = path.resolve(root, `.${rel}`);
    if (!file.startsWith(root)) throw new Error("path escape");
    const body = await fs.readFile(file);
    const ext = path.extname(file);
    const type = ext === ".html" ? "text/html; charset=utf-8"
      : ext === ".js" ? "text/javascript; charset=utf-8"
      : ext === ".svg" ? "image/svg+xml"
      : ext === ".png" ? "image/png"
      : ext === ".webmanifest" ? "application/manifest+json"
      : "application/octet-stream";
    res.writeHead(200, { "Content-Type":type, "Cache-Control":"no-store" });
    res.end(body);
  } catch (_) {
    res.writeHead(404);
    res.end("not found");
  }
});

await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const browser = await chromium.launch({ headless:true, channel:"chrome" });
const context = await browser.newContext({ serviceWorkers:"block" });
const seeded = {
  dataVersion:16,
  totalFocusMin:60_123,
  completedFocusSessions:777,
  hero:{name:"Protected live fixture",level:42,xp:17},
  tasks:[{id:"protected-task",name:"Protected",totalFocusMin:60_123,sessions:777,dailyMin:{}}],
  history:{"2026-07-24":321},
  sessionsLog:[{id:"protected-session",type:"focus",minutes:321,at:1}],
  sync:{
    enabled:true,backend:"jsonstorage",jsonstorageUrl:"https://example.invalid/live-row",
    playerId:"protected-player",cloudRev:99,pendingSync:true
  }
};
const seededRaw = JSON.stringify(seeded);

await context.addInitScript(({seededRaw}) => {
  const MAIN = "focusHero.v4.state";
  localStorage.setItem(MAIN, seededRaw);
  const audit = window.__browserSmokeAudit = {
    writes:[], removes:[], clears:0, fetches:[], channels:[], posts:[], idbOpens:[]
  };
  const nativeSet = Storage.prototype.setItem;
  const nativeRemove = Storage.prototype.removeItem;
  const nativeClear = Storage.prototype.clear;
  Storage.prototype.setItem = function(key, value){
    audit.writes.push({key:String(key), value:String(value)});
    return nativeSet.call(this, key, value);
  };
  Storage.prototype.removeItem = function(key){
    audit.removes.push(String(key));
    return nativeRemove.call(this, key);
  };
  Storage.prototype.clear = function(){
    audit.clears += 1;
    return nativeClear.call(this);
  };
  window.fetch = function(input, init){
    audit.fetches.push({url:String(input), method:String(init?.method || "GET")});
    return Promise.reject(new Error("network disabled by browser-smoke isolation fixture"));
  };
  window.BroadcastChannel = class {
    constructor(name){ this.name=String(name); audit.channels.push(this.name); }
    postMessage(value){ audit.posts.push(value); }
    addEventListener(){}
    close(){}
  };
  if (window.indexedDB && typeof window.indexedDB.open === "function"){
    const nativeOpen = window.indexedDB.open.bind(window.indexedDB);
    window.indexedDB.open = function(name){
      audit.idbOpens.push(String(name));
      return nativeOpen.apply(null, arguments);
    };
  }
}, { seededRaw });

const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", error => pageErrors.push(String(error)));

try {
  await page.goto(`http://127.0.0.1:${port}/?test=1`, { waitUntil:"domcontentloaded" });
  await page.waitForSelector('[data-browser-smoke="disabled"]');
  await page.waitForFunction(() => Boolean(window.__FocusHero?.stateRef));
  /* The old Data Guard route wrote after six seconds. Wait beyond that window
     to prove the disabled browser-smoke route never installs its storage work. */
  await page.waitForTimeout(6_500);
  const result = await page.evaluate(async () => {
    let gateError = "";
    try { await window.runSmokeTests(); }
    catch (error) { gateError = error?.message || String(error); }
    return {
      main:localStorage.getItem("focusHero.v4.state"),
      memoryMinutes:window.__FocusHero.stateRef().totalFocusMin,
      audit:window.__browserSmokeAudit,
      gateError,
      guardScript:Boolean(document.querySelector('script[src*="data-guard.js"]')),
      label:document.querySelector('[data-browser-smoke="disabled"]')?.textContent || ""
    };
  });
  assert.equal(result.main, seededRaw, "the live profile bytes must remain exact");
  assert.equal(result.memoryMinutes, 0, "the disabled route must use an isolated default state");
  assert.deepEqual(result.audit.writes, []);
  assert.deepEqual(result.audit.removes, []);
  assert.equal(result.audit.clears, 0);
  assert.deepEqual(result.audit.fetches, []);
  assert.deepEqual(result.audit.channels, []);
  assert.deepEqual(result.audit.posts, []);
  assert.deepEqual(result.audit.idbOpens, []);
  assert.equal(result.guardScript, false);
  assert.match(result.gateError, /stateful smoke tests are disabled/i);
  assert.match(result.label, /isolated Node test harness/i);
  assert.deepEqual(pageErrors, []);
  console.log("ok - browser smoke route is fail-closed and leaves live state/storage/sync/BC untouched");
} finally {
  await context.close();
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
