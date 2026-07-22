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
const mime = {
  ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8",
  ".svg":"image/svg+xml", ".png":"image/png", ".json":"application/json",
  ".webmanifest":"application/manifest+json"
};
const server = http.createServer(async (req, res) => {
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

await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const browser = await chromium.launch({ headless:true, channel:"chrome" });
const context = await browser.newContext();
const cloudUrl = "https://api.jsonstorage.net/v1/json/focus-hero-offline-test";
let remoteState;
let remoteRev = 5;
let pushedPayload;
const traffic = [];
await context.route("https://api.jsonstorage.net/**", async route => {
  const request = route.request();
  traffic.push(request.method());
  if (request.method() === "GET") {
    return route.fulfill({ status:200, contentType:"application/json", body:JSON.stringify({
      id:"offline-test-player", data:{ plain:remoteState }, cloud_rev:remoteRev,
      sync_secret_hash:"offline-test-hash"
    }) });
  }
  if (request.method() === "PUT") {
    pushedPayload = JSON.parse(request.postData() || "{}");
    remoteRev = pushedPayload.cloud_rev;
    if (pushedPayload?.data?.plain) remoteState = pushedPayload.data.plain;
    return route.fulfill({ status:200, contentType:"application/json", body:"{}" });
  }
  return route.abort();
});

const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", error => pageErrors.push(String(error)));

try {
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil:"domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.__FocusHero?.stateRef));
  await page.waitForFunction(() => navigator.serviceWorker?.controller?.state === "activated", null, { timeout:30_000 });
  /* controllerchange intentionally reloads an idle page once. Let that queued
     navigation settle before seeding the isolated fixture. */
  await page.waitForTimeout(750);
  await page.waitForFunction(() => Boolean(window.__FocusHero?.stateRef));

  remoteState = await page.evaluate(cloudUrl => {
    const fh = window.__FocusHero;
    const fresh = fh.migrate(JSON.parse(JSON.stringify(fh.DEFAULTS)));
    fresh.settings.monthlyBackup = false;
    fresh.settings.e2eEncryption = false;
    fresh.totalFocusMin = 120;
    fresh.completedFocusSessions = 4;
    fresh.history = { "2026-07-22":120 };
    fresh.sessionHistory = { "2026-07-22":4 };
    fresh.tasks = [{
      id:"offline-task", name:"Offline test", emoji:"", createdAt:Date.now(),
      totalFocusMin:30, sessions:1, lastUsedAt:Date.now(), pinned:false,
      dailyMin:{ "2026-07-22":30 }
    }];
    fresh.sessionsLog = [{
      id:"offline-session", type:"focus", taskId:"offline-task", taskName:"Offline test",
      at:"2026-07-22T12:00:00.000Z", minutes:30, originalMinutes:30, xp:30, coins:6
    }];
    fresh.sync = Object.assign({}, fresh.sync, {
      enabled:true, backend:"jsonstorage", playerId:"offline-test-player",
      cloudRev:5, syncCode:"OFFLINE1", syncSecret:"offline-secret",
      syncSecretHash:"offline-test-hash", jsonstorageUrl:cloudUrl,
      pendingSync:false, pendingSince:0
    });
    const current = fh.stateRef();
    Object.keys(current).forEach(key => delete current[key]);
    Object.assign(current, fresh);
    localStorage.clear();
    window.saveState({ fromPull:true });
    return JSON.parse(JSON.stringify(fresh));
  }, cloudUrl);

  await context.setOffline(true);
  const offlineActions = await page.evaluate(() => {
    const down = window.applySessionEdit("offline-session", 20);
    const del = window.deleteSessionRecord("offline-session");
    const taskDown = window.applyTaskTimeAdjustment("offline-task", -5);
    const add = window.applyTaskTimeAdjustment("offline-task", 25);
    const state = window.__FocusHero.stateRef();
    const stored = JSON.parse(localStorage.getItem("focusHero.v4.state"));
    return {
      down, del, taskDown, add,
      total:state.totalFocusMin,
      pending:state.sync.pendingSync,
      pendingSince:state.sync.pendingSince,
      storedPending:stored.sync.pendingSync,
      storedPendingSince:stored.sync.pendingSince
    };
  });
  for (const result of [offlineActions.down, offlineActions.del, offlineActions.taskDown]) {
    assert.equal(result.ok, false);
    assert.match(result.reason, /reconnect/);
  }
  assert.equal(offlineActions.add.ok, true);
  assert.equal(offlineActions.total, 145);
  assert.equal(offlineActions.pending, true);
  assert.ok(offlineActions.pendingSince > 0);
  assert.equal(offlineActions.storedPending, true);
  assert.ok(offlineActions.storedPendingSince > 0);

  await page.reload({ waitUntil:"domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.__FocusHero?.stateRef));
  const afterColdOfflineBoot = await page.evaluate(() => {
    const state = window.__FocusHero.stateRef();
    return { total:state.totalFocusMin, pending:state.sync.pendingSync, pendingSince:state.sync.pendingSince };
  });
  assert.equal(afterColdOfflineBoot.total, 145);
  assert.equal(afterColdOfflineBoot.pending, true);
  assert.ok(afterColdOfflineBoot.pendingSince > 0);

  const firstReconnectRev = remoteRev + 1;
  await context.setOffline(false);
  await page.waitForFunction(expectedRev => {
    const state = window.__FocusHero?.stateRef();
    return state && state.sync.pendingSync === false && state.sync.cloudRev >= expectedRev;
  }, firstReconnectRev, { timeout:15_000 });

  const finalState = await page.evaluate(() => {
    const state = window.__FocusHero.stateRef();
    return { total:state.totalFocusMin, pending:state.sync.pendingSync, pendingSince:state.sync.pendingSince, cloudRev:state.sync.cloudRev };
  });
  assert.equal(finalState.total, 145);
  assert.equal(finalState.pending, false);
  assert.equal(finalState.pendingSince, 0);
  assert.ok(finalState.cloudRev >= firstReconnectRev);
  const firstGet = traffic.indexOf("GET"), firstPut = traffic.indexOf("PUT");
  assert.ok(firstGet >= 0 && firstPut > firstGet, "reconnect must pull before uploading");
  assert.equal(pushedPayload?.cloud_rev, remoteRev);
  assert.equal(pushedPayload?.data?.plain?.totalFocusMin, 145);

  const trafficBeforeReenable = traffic.length;
  const reenableRev = remoteRev + 1;
  await page.evaluate(() => {
    const state = window.__FocusHero.stateRef();
    state.sync.enabled = false;
    state.sync.pendingSync = false;
    state.sync.pendingSince = 0;
    state.sync.lastSyncError = "Recovery staged locally; verify it before re-enabling cloud sync.";
    window.saveState({ fromPull:true });
    window.setToggle("#tog-sync", false);
  });
  await page.evaluate(() => document.querySelector("#tog-sync")?.click());
  await page.waitForFunction(expectedRev => {
    const state = window.__FocusHero?.stateRef();
    return state && state.sync.enabled === true && state.sync.pendingSync === false && state.sync.cloudRev >= expectedRev;
  }, reenableRev, { timeout:15_000 });
  const reenableTraffic = traffic.slice(trafficBeforeReenable);
  assert.ok(reenableTraffic.includes("GET") && reenableTraffic.includes("PUT"));
  assert.ok(reenableTraffic.indexOf("GET") < reenableTraffic.indexOf("PUT"));
  assert.ok(remoteRev >= reenableRev);
  assert.equal(pushedPayload?.data?.plain?.totalFocusMin, 145);
  assert.deepEqual(pageErrors, []);
  console.log("ok - cold offline boot, durable pending marker, safe reductions, reconnect flush, and verified re-enable upload");
} finally {
  await context.close();
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
