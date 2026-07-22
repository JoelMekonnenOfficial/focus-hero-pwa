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
  } catch (_) {
    res.writeHead(404);
    res.end("not found");
  }
});

await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const browser = await chromium.launch({ headless:true, channel:"chrome" });
const context = await browser.newContext({ serviceWorkers:"block" });
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", error => pageErrors.push(String(error)));

async function resetFixture(){
  await page.evaluate(() => {
    const fh = window.__FocusHero;
    const current = fh.stateRef();
    const fresh = fh.migrate(JSON.parse(JSON.stringify(fh.DEFAULTS)));
    Object.keys(current).forEach(key => delete current[key]);
    Object.assign(current, fresh, {
      totalFocusMin:0, completedFocusSessions:0, history:{}, sessionHistory:{},
      sessionsLog:[], activityLog:[], editLog:[], tasks:[], activeTaskId:null,
      lootOwned:{}, lootInstances:{}
    });
    current.sync.enabled = false;
    current.settings.monthlyBackup = false;
    current.adventure.action = "Loot";
    window.lrEnsureShape(current);
    window.saveState({ fromPull:true });
    window.renderAll();
  });
}

async function ledgerSession(minutes, name="Threshold test"){
  return page.evaluate(({ minutes, name }) => {
    const task = window.__FocusHero.createTask({ name, emoji:"T" });
    window.__FocusHero.setAdventureAction("Loot");
    const added = window.applyTaskTimeAdjustment(task.id, minutes);
    if (!added?.ok) throw new Error(`fixture add failed: ${added?.reason}`);
    const state = window.__FocusHero.stateRef();
    const rec = state.sessionsLog.find(r=>r?.source === "ledger" && r.taskId === task.id);
    if (!rec) throw new Error("fixture session missing");
    return { taskId:task.id, sessionId:rec.id };
  }, { minutes, name });
}

let passed = 0;
async function test(name, fn){
  try {
    await fn();
    passed += 1;
    console.log(`ok ${passed} - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

try {
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil:"domcontentloaded" });
  await page.waitForFunction(() => window.__FocusHero && typeof window.lrGrantEditThresholdEntitlement === "function" && typeof window.applySessionEdit === "function");

  await test("20 to 25 uses the 25-minute rare-eligible gate and canonical session id", async () => {
    await resetFixture();
    const { sessionId } = await ledgerSession(20);
    const result = await page.evaluate(sessionId => {
      const state = window.__FocusHero.stateRef();
      const edit = window.applySessionEdit(sessionId, 25);
      const rec = state.sessionsLog.find(r=>r?.id === sessionId);
      const entitlement = rec?.lootThresholdEntitlements?.thresholds?.["25"];
      const drop = state.loot.drops.find(d=>d?.editEntitlementId === entitlement?.id);
      return { edit, minutes:rec?.minutes, entitlement, drop };
    }, sessionId);
    assert.equal(result.edit.ok, true);
    assert.equal(result.minutes, 25);
    assert.equal(result.entitlement.eligibleMinutes, 25);
    assert.equal(result.entitlement.crossedAtMinutes, 25);
    assert.equal(result.entitlement.eligibleRarities.includes("rare"), true);
    assert.equal(result.drop.sessionId, sessionId);
    assert.equal(result.drop.editThreshold, 25);
    assert.doesNotMatch(result.drop.sessionId, /_edit_/);
  });

  await test("119 to 120 crosses the mythic eligibility wall", async () => {
    await resetFixture();
    const { sessionId } = await ledgerSession(119, "Mythic wall");
    const result = await page.evaluate(sessionId => {
      const state = window.__FocusHero.stateRef();
      const edit = window.applySessionEdit(sessionId, 120);
      const rec = state.sessionsLog.find(r=>r?.id === sessionId);
      const entitlement = rec?.lootThresholdEntitlements?.thresholds?.["120"];
      const drop = state.loot.drops.find(d=>d?.editEntitlementId === entitlement?.id);
      return { edit, entitlement, drop, keys:Object.keys(rec?.lootThresholdEntitlements?.thresholds||{}) };
    }, sessionId);
    assert.equal(result.edit.ok, true);
    assert.deepEqual(result.keys, ["120"]);
    assert.equal(result.entitlement.eligibleMinutes, 120);
    assert.equal(result.entitlement.eligibleRarities.includes("mythic"), true);
    assert.equal(result.drop.sessionId, sessionId);
    assert.equal(result.drop.editThreshold, 120);
  });

  await test("edit-down claws back the exact threshold item and instance", async () => {
    await resetFixture();
    const { sessionId } = await ledgerSession(20, "Clawback");
    const result = await page.evaluate(sessionId => {
      const state = window.__FocusHero.stateRef();
      const up = window.applySessionEdit(sessionId, 25);
      const rec = state.sessionsLog.find(r=>r?.id === sessionId);
      const entitlement = rec.lootThresholdEntitlements.thresholds["25"];
      const templateId = entitlement.drop.templateId;
      const iid = entitlement.drop.iid;
      const ownedWhileActive = state.lootOwned[templateId]|0;
      const down = window.applySessionEdit(sessionId, 24);
      return {
        up, down, templateId, iid, ownedWhileActive,
        ownedAfter:state.lootOwned[templateId]|0,
        active:entitlement.active,
        hasDrop:state.loot.drops.some(d=>d?.editEntitlementId === entitlement.id),
        hasInstance:!!state.lootInstances[iid]
      };
    }, sessionId);
    assert.equal(result.up.clawback.gained.length, 1);
    assert.equal(result.down.clawback.removed.some(x=>x.entitlement && x.threshold === 25), true);
    assert.equal(result.active, false);
    assert.equal(result.hasDrop, false);
    assert.equal(result.hasInstance, false);
    assert.equal(result.ownedAfter, result.ownedWhileActive - 1);
  });

  await test("up-down-up restores one stable reward without reroll farming", async () => {
    await resetFixture();
    const { sessionId } = await ledgerSession(20, "Idempotence");
    const result = await page.evaluate(sessionId => {
      const state = window.__FocusHero.stateRef();
      window.applySessionEdit(sessionId, 25);
      const rec = state.sessionsLog.find(r=>r?.id === sessionId);
      const entitlement = rec.lootThresholdEntitlements.thresholds["25"];
      const first = { iid:entitlement.drop.iid, templateId:entitlement.drop.templateId, rarity:entitlement.drop.rarity, rolledAt:entitlement.rolledAt };
      window.applySessionEdit(sessionId, 24);
      window.applySessionEdit(sessionId, 25);
      const secondDrop = state.loot.drops.find(d=>d?.editEntitlementId === entitlement.id);
      const ownedAfterFirstRestore = state.lootOwned[first.templateId]|0;
      window.applySessionEdit(sessionId, 24);
      window.applySessionEdit(sessionId, 25);
      const finalDrops = state.loot.drops.filter(d=>d?.editEntitlementId === entitlement.id);
      const gains = state.activityLog.filter(a=>a?.action === "edit_threshold_gain" && a.sessionId === sessionId).length;
      const restores = state.activityLog.filter(a=>a?.action === "edit_entitlement_restored" && a.sessionId === sessionId).length;
      return {
        first, second:{iid:secondDrop?.iid,templateId:secondDrop?.templateId,rarity:secondDrop?.rarity},
        final:finalDrops.map(d=>({iid:d.iid,templateId:d.templateId,rarity:d.rarity})),
        rolledAt:entitlement.rolledAt, ownedAfterFirstRestore,
        ownedFinal:state.lootOwned[first.templateId]|0, gains, restores,
        thresholdKeys:Object.keys(rec.lootThresholdEntitlements.thresholds)
      };
    }, sessionId);
    assert.deepEqual(result.second, { iid:result.first.iid, templateId:result.first.templateId, rarity:result.first.rarity });
    assert.deepEqual(result.final, [{ iid:result.first.iid, templateId:result.first.templateId, rarity:result.first.rarity }]);
    assert.equal(result.rolledAt, result.first.rolledAt);
    assert.equal(result.ownedFinal, result.ownedAfterFirstRestore);
    assert.equal(result.gains, 1);
    assert.equal(result.restores, 2);
    assert.deepEqual(result.thresholdKeys, ["25"]);
  });

  await test("time-only session edits remain reward-free", async () => {
    await resetFixture();
    const result = await page.evaluate(() => {
      const fh = window.__FocusHero;
      const state = fh.stateRef();
      const task = fh.createTask({ name:"LIFEMAXXING", emoji:"L" });
      task.timeOnly = true;
      const at = Date.now();
      const date = new Date(at);
      const day = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
      task.totalFocusMin = 20;
      task.dailyMin[day] = 20;
      state.totalFocusMin = 20;
      state.history[day] = 20;
      const rec = { id:"focus_time_only_threshold", type:"focus", source:"ledger", taskId:task.id, taskName:task.name,
        minutes:20, originalMinutes:20, at, action:"Loot", timeOnly:true, rewarded:false, xp:0,
        comboApplied:0, dailyFocusApplied:0, dailyMinApplied:0 };
      state.sessionsLog.push(rec);
      const beforeDrops = state.loot.drops.length;
      const edit = window.applySessionEdit(rec.id, 25);
      return { edit, minutes:rec.minutes, xp:rec.xp, rewarded:rec.rewarded,
        ledger:rec.lootThresholdEntitlements||null, beforeDrops, afterDrops:state.loot.drops.length };
    });
    assert.equal(result.edit.ok, true);
    assert.equal(result.minutes, 25);
    assert.equal(result.xp, 0);
    assert.equal(result.rewarded, false);
    assert.equal(result.ledger, null);
    assert.equal(result.afterDrops, result.beforeDrops);
    assert.equal(result.edit.clawback.gained.length, 0);
  });

  await test("session edit XP and minute accounting parity stay unchanged", async () => {
    await resetFixture();
    const { sessionId, taskId } = await ledgerSession(20, "Parity");
    const result = await page.evaluate(({ sessionId, taskId }) => {
      const fh = window.__FocusHero;
      const state = fh.stateRef();
      const rec = state.sessionsLog.find(r=>r?.id === sessionId);
      const oldXp = rec.xp|0;
      const edit = window.applySessionEdit(sessionId, 25);
      const expected = fh.computeXpBreakdown(25, { comboCount:rec.comboPriorCount|0, streakDays:(rec.streakForCalc ?? rec.streakBefore)|0, settings:state.settings }).total;
      const task = state.tasks.find(t=>t.id === taskId);
      return { oldXp, edit, newXp:rec.xp|0, expected, total:state.totalFocusMin|0, taskTotal:task.totalFocusMin|0 };
    }, { sessionId, taskId });
    assert.equal(result.newXp, result.expected);
    assert.equal(result.edit.xpDelta, result.expected - result.oldXp);
    assert.equal(result.total, 25);
    assert.equal(result.taskTotal, 25);
  });

  assert.deepEqual(pageErrors, [], pageErrors.join("\n"));
  console.log(`passed ${passed}/${passed}`);
} finally {
  await context.close();
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
