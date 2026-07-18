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
const context = await browser.newContext({ serviceWorkers:"allow" });
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", error => pageErrors.push(String(error)));

async function waitForApp(){
  await page.waitForFunction(() => window.__FocusHero && typeof window.startTimer === "function");
  await page.waitForFunction(() => window.commitFocusTimerSession?.__fhPriority && document.getElementById("priority-check-modal"));
}
async function rewardSnapshot(){
  return page.evaluate(() => {
    const s = window.__FocusHero.stateRef();
    const economy = window.__fhEconomyTest.totals();
    return {
      total:s.totalFocusMin,
      sessions:s.completedFocusSessions,
      logCount:s.sessionsLog.length,
      hero:{ level:s.hero.level, xp:s.hero.xp },
      coins:s.coins,
      canceled:s.canceledSessionCount,
      orbs:economy.orbs,
      farm:economy.farmMinutes,
      grants:Object.keys(s.focusEconomy.grants || {}).length,
      eggs:(s.eggs.processedSessionIds || []).slice()
    };
  });
}
async function expireFocus(){
  await page.evaluate(() => {
    window.setMode("focus");
    window.startTimer();
    const s = window.__FocusHero.stateRef();
    s.timer.endAt = Date.now() + 250;
    window.saveState({ fromPull:true });
  });
  await page.waitForSelector("#claim-modal:not([hidden])", { timeout:5000 });
}

try {
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil:"load" });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForTimeout(1200);
  await waitForApp();

  const task = await page.evaluate(() => {
    const fh = window.__FocusHero;
    const current = fh.stateRef();
    const fresh = fh.migrate(JSON.parse(JSON.stringify(fh.DEFAULTS)));
    Object.keys(current).forEach(key => delete current[key]);
    Object.assign(current, fresh);
    current.settings.monthlyBackup = false;
    current.settings.focusMin = 5;
    current.settings.chime = false;
    current.settings.notif = false;
    current.settings.priorityMode = true;
    current.settings.gameMode = true;
    const made = fh.createTask({ name:"Offline exact task", emoji:"🧭" });
    fh.setActiveTask(made.id);
    fh.setAdventureAction("Craft");
    window.saveState({ fromPull:true });
    return { id:made.id, name:made.name };
  });
  const initialRewards = await rewardSnapshot();

  await expireFocus();
  await page.evaluate(() => window.setClaimMinutes(4));
  const pendingBeforeReload = await page.evaluate(() => {
    const s = window.__FocusHero.stateRef();
    return JSON.parse(JSON.stringify(s.pendingFocusClaim));
  });
  assert.equal(pendingBeforeReload.plannedMinutes, 5);
  assert.equal(pendingBeforeReload.selectedMinutes, 4);
  assert.equal(pendingBeforeReload.elapsedMinutes, 5);
  assert.equal(pendingBeforeReload.plannedMs, 300_000);
  assert.equal(pendingBeforeReload.elapsedMs, 300_000);
  assert.equal(pendingBeforeReload.taskId, task.id);
  assert.equal(pendingBeforeReload.taskNameAtStart, task.name);
  assert.equal(pendingBeforeReload.action, "Craft");
  assert.equal(pendingBeforeReload.priorityRun, true);
  assert.equal(pendingBeforeReload.priorityVerified, false);
  assert.equal(pendingBeforeReload.lockedInRun, true);
  assert.ok(pendingBeforeReload.startedAt < pendingBeforeReload.scheduledEndAt);
  assert.ok(pendingBeforeReload.completedAt >= pendingBeforeReload.scheduledEndAt);
  assert.deepEqual(await rewardSnapshot(), initialRewards);

  await context.setOffline(true);
  await page.reload({ waitUntil:"domcontentloaded" });
  await waitForApp();
  await page.waitForSelector("#claim-modal:not([hidden])");
  const restored = await page.evaluate(() => ({
    pending:window.__FocusHero.stateRef().pendingFocusClaim,
    input:document.getElementById("claim-minutes").value,
    range:document.getElementById("claim-range").value
  }));
  assert.equal(restored.pending.sessionId, pendingBeforeReload.sessionId);
  assert.equal(restored.pending.selectedMinutes, 4);
  assert.equal(restored.input, "4");
  assert.equal(restored.range, "4");
  assert.equal((await rewardSnapshot()).total, 0);

  // The first confirmation opens the separate Priority checkpoint. Nothing is
  // awarded yet, and the durable claim remains intact through another reload.
  await page.click("#btn-confirm-claim");
  await page.waitForSelector("#priority-check-modal:not([hidden])");
  assert.equal((await rewardSnapshot()).total, 0);
  assert.equal(await page.evaluate(() => !!window.__FocusHero.stateRef().pendingFocusClaim), true);
  await page.reload({ waitUntil:"domcontentloaded" });
  await waitForApp();
  await page.waitForSelector("#claim-modal:not([hidden])");
  assert.equal(await page.locator("#claim-minutes").inputValue(), "4");

  await page.click("#btn-claim-full");
  await page.waitForSelector("#priority-check-modal:not([hidden])");
  await page.click("#btn-priority-keep");
  await page.waitForFunction(() => {
    const s = window.__FocusHero.stateRef();
    return s.totalFocusMin === 5 && !s.pendingFocusClaim;
  });
  const afterConfirm = await rewardSnapshot();
  assert.equal(afterConfirm.total, 5);
  assert.equal(afterConfirm.sessions, 1);
  assert.equal(afterConfirm.logCount, 1);
  assert.ok(afterConfirm.hero.xp > 0);
  assert.equal(afterConfirm.orbs, 1);
  assert.equal(afterConfirm.farm, 5);
  assert.equal(afterConfirm.grants, 1);
  assert.deepEqual(afterConfirm.eggs, [pendingBeforeReload.sessionId]);
  const record = await page.evaluate(id => {
    const s = window.__FocusHero.stateRef();
    return s.sessionsLog.find(rec => rec.id === id);
  }, pendingBeforeReload.sessionId);
  assert.equal(record.claimId, pendingBeforeReload.sessionId);
  assert.equal(record.minutes, 5);
  assert.equal(record.plannedMinutes, 5);
  assert.equal(record.elapsedMinutes, 5);
  assert.equal(record.plannedMs, 300_000);
  assert.equal(record.elapsedMs, 300_000);
  assert.equal(record.taskId, task.id);
  assert.equal(record.action, "Craft");
  assert.equal(record.priorityRun, true);
  assert.equal(record.priorityVerified, true);
  assert.equal(record.lockedInRun, true);

  // Simulate a process dying after the credited record was persisted but before
  // pending-claim cleanup. Reconfirming must reconcile/clear, never award twice.
  await page.evaluate(claim => {
    const s = window.__FocusHero.stateRef();
    s.pendingFocusClaim = Object.assign({}, claim, { selectedMinutes:5, priorityVerified:true });
    window.saveState({ fromPull:true });
  }, pendingBeforeReload);
  await page.reload({ waitUntil:"domcontentloaded" });
  await waitForApp();
  await page.waitForSelector("#claim-modal:not([hidden])");
  await page.click("#btn-confirm-claim");
  await page.waitForFunction(() => !window.__FocusHero.stateRef().pendingFocusClaim);
  assert.deepEqual(await rewardSnapshot(), afterConfirm);

  // Priority cancellation clears the durable claim only after the zero-credit
  // reset is saved, and the canceled session cannot reappear after reload.
  await expireFocus();
  const beforeCancel = await rewardSnapshot();
  await page.click("#btn-claim-full");
  await page.waitForSelector("#priority-check-modal:not([hidden])");
  await page.click("#btn-priority-cancel");
  await page.waitForFunction(() => !window.__FocusHero.stateRef().pendingFocusClaim);
  const afterCancel = await rewardSnapshot();
  assert.deepEqual({
    total:afterCancel.total, sessions:afterCancel.sessions, logCount:afterCancel.logCount,
    hero:afterCancel.hero, coins:afterCancel.coins, orbs:afterCancel.orbs,
    farm:afterCancel.farm, grants:afterCancel.grants, eggs:afterCancel.eggs
  }, {
    total:beforeCancel.total, sessions:beforeCancel.sessions, logCount:beforeCancel.logCount,
    hero:beforeCancel.hero, coins:beforeCancel.coins, orbs:beforeCancel.orbs,
    farm:beforeCancel.farm, grants:beforeCancel.grants, eggs:beforeCancel.eggs
  });
  assert.equal(afterCancel.canceled, beforeCancel.canceled + 1);
  await page.reload({ waitUntil:"domcontentloaded" });
  await waitForApp();
  assert.equal(await page.locator("#claim-modal").isHidden(), true);
  assert.equal(await page.evaluate(() => window.__FocusHero.stateRef().pendingFocusClaim), null);

  assert.deepEqual(pageErrors, []);
  console.log("ok - pending focus claims survive offline reloads and resolve exactly once");
} finally {
  await context.close();
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
