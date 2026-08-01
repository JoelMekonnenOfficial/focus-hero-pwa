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

async function ledgerSession(minutes, name="Threshold test", action="Fight"){
  return page.evaluate(({ minutes, name, action }) => {
    const task = window.__FocusHero.createTask({ name, emoji:"T" });
    window.__FocusHero.setAdventureAction(action);
    const added = window.applyTaskTimeAdjustment(task.id, minutes);
    if (!added?.ok) throw new Error(`fixture add failed: ${added?.reason}`);
    const state = window.__FocusHero.stateRef();
    const rec = state.sessionsLog.find(r=>r?.source === "ledger" && r.taskId === task.id);
    if (!rec) throw new Error("fixture session missing");
    return { taskId:task.id, sessionId:rec.id };
  }, { minutes, name, action });
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

  await test("Fight 20 to 25 uses the live 25-minute encounter gate and canonical session id", async () => {
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

  await test("peaceful 20 to 25 does not invent a second live loot roll", async () => {
    await resetFixture();
    const { sessionId } = await ledgerSession(20, "Peaceful parity", "Loot");
    const result = await page.evaluate(sessionId => {
      const state = window.__FocusHero.stateRef();
      const beforeDrops = state.loot.drops.filter(drop=>drop?.sessionId === sessionId).length;
      const edit = window.applySessionEdit(sessionId, 25);
      const rec = state.sessionsLog.find(record=>record?.id === sessionId);
      const afterDrops = state.loot.drops.filter(drop=>drop?.sessionId === sessionId).length;
      return { edit, beforeDrops, afterDrops, keys:Object.keys(rec?.lootThresholdEntitlements?.thresholds||{}) };
    }, sessionId);
    assert.equal(result.edit.ok, true);
    assert.equal(result.edit.clawback.gained.length, 0);
    assert.equal(result.afterDrops, result.beforeDrops);
    assert.deepEqual(result.keys, []);
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

  await test("task-level reduction uses the session engine and removes crossed Fight rewards", async () => {
    await resetFixture();
    const { sessionId, taskId } = await ledgerSession(20, "Task reduction parity");
    const result = await page.evaluate(({ sessionId, taskId }) => {
      const state = window.__FocusHero.stateRef();
      const up = window.applySessionEdit(sessionId, 50);
      const rec = state.sessionsLog.find(record=>record?.id === sessionId);
      const activeBefore = Object.values(rec?.lootThresholdEntitlements?.thresholds||{}).filter(entry=>entry?.active).length;
      const down = window.applyTaskTimeAdjustment(taskId, -30, { operationId:"task_reward_clawback_test", surface:"task-editor" });
      const activeAfter = Object.values(rec?.lootThresholdEntitlements?.thresholds||{}).filter(entry=>entry?.active).length;
      return { up, down, minutes:rec?.minutes, activeBefore, activeAfter };
    }, { sessionId, taskId });
    assert.equal(result.up.clawback.gained.length, 2);
    assert.equal(result.activeBefore, 2);
    assert.equal(result.down.ok, true);
    assert.equal(result.down.sessionBacked, true);
    assert.equal(result.down.delta, -30);
    assert.equal(result.down.clawback.removed.length, 2);
    assert.equal(result.minutes, 20);
    assert.equal(result.activeAfter, 0);
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

  await test("edit tombstones keep the newer session row and removed loot deleted in either merge direction", async () => {
    await resetFixture();
    const { sessionId } = await ledgerSession(20, "Edit convergence");
    const result = await page.evaluate(sessionId => {
      const state = window.__FocusHero.stateRef();
      window.applySessionEdit(sessionId, 25);
      const rec = state.sessionsLog.find(row=>row?.id===sessionId);
      const entitlement = rec.lootThresholdEntitlements.thresholds["25"];
      const iid = entitlement.drop.iid;
      const dropId = entitlement.drop.id;
      const stale = JSON.parse(JSON.stringify(state));
      window.applySessionEdit(sessionId, 24);
      const corrected = JSON.parse(JSON.stringify(state));
      const forward = window.__FocusHero.mergeRemoteState(corrected, stale);
      const reverse = window.__FocusHero.mergeRemoteState(stale, corrected);
      const snapshot = merged => ({
        minutes:merged.sessionsLog.find(row=>row?.id===sessionId)?.minutes,
        hasDrop:(merged.loot?.drops||[]).some(drop=>drop?.id===dropId),
        hasInstance:!!merged.lootInstances?.[iid],
        dropTombstone:merged.loot?.dropTombstones?.[dropId]||0,
        instanceTombstone:merged.loot?.instanceTombstones?.[iid]||0,
        totalFocusMin:merged.totalFocusMin
      });
      return { forward:snapshot(forward), reverse:snapshot(reverse) };
    }, sessionId);
    assert.deepEqual(result.forward,result.reverse);
    assert.equal(result.forward.minutes,24);
    assert.equal(result.forward.hasDrop,false);
    assert.equal(result.forward.hasInstance,false);
    assert.ok(result.forward.dropTombstone>0);
    assert.ok(result.forward.instanceTombstone>0);
    assert.equal(result.forward.totalFocusMin,24,"the newer edited session must project its corrected aggregate total");
  });

  await test("session deletion tombstone prevents stale row and loot resurrection in either merge direction", async () => {
    await resetFixture();
    const { sessionId } = await ledgerSession(20, "Delete convergence");
    const result = await page.evaluate(sessionId => {
      const state = window.__FocusHero.stateRef();
      window.applySessionEdit(sessionId,25);
      const rec = state.sessionsLog.find(row=>row?.id===sessionId);
      const entitlement = rec.lootThresholdEntitlements.thresholds["25"];
      const iid = entitlement.drop.iid;
      const dropId = entitlement.drop.id;
      const stale = JSON.parse(JSON.stringify(state));
      const deleted = window.deleteSessionRecord(sessionId);
      const corrected = JSON.parse(JSON.stringify(state));
      const forward = window.__FocusHero.mergeRemoteState(corrected,stale);
      const reverse = window.__FocusHero.mergeRemoteState(stale,corrected);
      const snapshot = merged => ({
        hasSession:merged.sessionsLog.some(row=>row?.id===sessionId),
        hasDrop:(merged.loot?.drops||[]).some(drop=>drop?.id===dropId),
        hasInstance:!!merged.lootInstances?.[iid],
        sessionTombstone:merged.sessionTombstones?.[sessionId]||0,
        dropTombstone:merged.loot?.dropTombstones?.[dropId]||0,
        instanceTombstone:merged.loot?.instanceTombstones?.[iid]||0,
        totalFocusMin:merged.totalFocusMin
      });
      return {deleted,forward:snapshot(forward),reverse:snapshot(reverse)};
    },sessionId);
    assert.equal(result.deleted.ok,true);
    assert.deepEqual(result.forward,result.reverse);
    assert.equal(result.forward.hasSession,false);
    assert.equal(result.forward.hasDrop,false);
    assert.equal(result.forward.hasInstance,false);
    assert.ok(result.forward.sessionTombstone>0);
    assert.ok(result.forward.dropTombstone>0);
    assert.ok(result.forward.instanceTombstone>0);
    assert.equal(result.forward.totalFocusMin,0,"a tombstoned deleted session must project out of aggregate totals");
  });

  await test("mount rewards are committed, deterministic, and retry-proof", async () => {
    await resetFixture();
    const result = await page.evaluate(() => {
      const fh = window.__FocusHero;
      const live = fh.stateRef();
      const base = JSON.parse(JSON.stringify(live));
      const restore = () => {
        Object.keys(live).forEach(key => delete live[key]);
        Object.assign(live, JSON.parse(JSON.stringify(base)));
        window.lrEnsureShape(live);
        live.loot.mountProgress = 2995;
        live.loot.mountFamilies = {};
      };
      const run = randomValue => {
        restore();
        const originalRandom = Math.random;
        Math.random = () => randomValue;
        let first;
        try { first = window.lrSessionEndLootPipeline("Loot", 10, "mount-receipt-stable"); }
        finally { Math.random = originalRandom; }
        const receipt = live.loot.sessionRewardReceipts["mount-receipt-stable"];
        const mountRow = receipt.rewardSnapshot.drops.find(row => row.drop?.mountGrant);
        const firstMountState = {
          progress:live.loot.mountProgress,
          families:JSON.parse(JSON.stringify(live.loot.mountFamilies)),
          lootOwned:live.lootOwned[mountRow.drop.templateId]|0,
          iid:mountRow.drop.iid,
          dropId:mountRow.drop.id,
          instance:mountRow.instance
        };
        const beforeRetry = JSON.stringify(live);
        const retry = window.lrSessionEndLootPipeline("Loot", 10, "mount-receipt-stable");
        const retryUnchanged = JSON.stringify(live) === beforeRetry;
        delete live.loot.sessionRewardReceipts["mount-receipt-stable"];
        const beforeProofRetry = JSON.stringify(live);
        const proofRetry = window.lrSessionEndLootPipeline("Loot", 10, "mount-receipt-stable");
        const proofRetryUnchanged = JSON.stringify(live) === beforeProofRetry;
        return {
          first, receipt:JSON.parse(JSON.stringify(receipt)), mountRow,
          firstMountState, retry, retryUnchanged, proofRetry, proofRetryUnchanged
        };
      };
      return { a:run(0), b:run(0.999999) };
    });
    assert.equal(result.a.first.duplicate, false);
    assert.equal(result.a.retry.duplicate, true);
    assert.equal(result.a.proofRetry.duplicate, true);
    assert.equal(result.a.retryUnchanged, true);
    assert.equal(result.a.proofRetryUnchanged, true);
    assert.equal(result.a.firstMountState.progress, 3005);
    assert.equal(result.a.receipt.rewardSnapshot.effects.mountProgress, 10);
    assert.ok(Object.keys(result.a.receipt.rewardSnapshot.effects.mountFamilies.set).length > 0);
    assert.equal(result.a.receipt.rewardSnapshot.effects.lootOwned[result.a.mountRow.drop.templateId], 1);
    assert.equal(result.a.mountRow.drop.mountGrant, true);
    assert.ok(result.a.mountRow.instance);
    assert.equal(result.a.receipt.contentCommitment, result.b.receipt.contentCommitment);
    assert.deepEqual(result.a.receipt.rewardSnapshot, result.b.receipt.rewardSnapshot);
    assert.deepEqual(result.a.firstMountState, result.b.firstMountState);
  });

  await test("last-known-good validation compares immutable reward evidence, not just receipt keys", async () => {
    await resetFixture();
    const { sessionId } = await ledgerSession(20, "LKG receipt integrity");
    const result = await page.evaluate(sessionId => {
      const fh = window.__FocusHero;
      const state = fh.stateRef();
      window.saveState._lastLkgAt = 0;
      const persisted = window.saveState({ fromPull:true });
      const candidate = JSON.parse(JSON.stringify(state));
      const receipt = candidate.loot.sessionRewardReceipts[sessionId];
      if (!receipt) throw new Error("fixture reward receipt missing");
      receipt.rewardSnapshot.zoneId = "tampered-zone";
      receipt.contentCommitment = window.lrRewardContentCommitment(receipt.rewardSnapshot);
      candidate.loot.sessionRewardReceiptTombstones[sessionId].contentCommitment = receipt.contentCommitment;
      const receiptCheck = window.lrValidateSessionRewardReceiptState(candidate.loot);
      return {
        persisted,
        internallyValid:receiptCheck.ok,
        saneAgainstLkg:fh.isStateSane(candidate)
      };
    }, sessionId);
    assert.equal(result.persisted, true);
    assert.equal(result.internallyValid, true, "fixture must be self-consistent so only the LKG comparison catches it");
    assert.equal(result.saneAgainstLkg, false);
  });

  await test("same stable reward IDs with divergent replica content make merge fail closed", async () => {
    await resetFixture();
    const result = await page.evaluate(() => {
      const fh = window.__FocusHero;
      const base = JSON.parse(JSON.stringify(fh.stateRef()));
      const local = JSON.parse(JSON.stringify(base));
      const remote = JSON.parse(JSON.stringify(base));
      const sessionId = "synthetic-divergent-reward";
      const snapshot = templateId => ({
        schemaVersion:window.LR_SESSION_REWARD_POLICY_VERSION,
        sessionId,
        action:"Hunt",
        minutes:60,
        legacyItemId:templateId,
        zoneId:"verdant_vale",
        boss:null,
        drops:[{
          drop:{
            id:"drop_stable_collision", iid:"iid_stable_collision",
            sessionId, templateId, rarity:"rare", sourceAction:"Hunt"
          },
          instance:{
            iid:"iid_stable_collision", lootId:templateId, tier:"rare",
            level:0, affixes:[], sockets:[], source:{ kind:"drop", action:"Hunt", enemyId:null }
          }
        }],
        consumed:[],
        effects:{
          pity:{common:0,uncommon:0,rare:0,epic:1,legendary:1,mythic:1},
          materials:{dust:0,shards:0,essence:0},
          consumables:{}, lootOwned:{}, gemsOwned:{},
          instanceTombstones:{set:{},remove:[]}, mountFamilies:{set:{},remove:[]}, mountProgress:0,
          bestiary:{set:{},remove:[]}, world:{set:{},remove:[]}, achievements:{set:{},remove:[]},
          heroHp:0, crystalShards:0, crystalShardsEarned:0
        }
      });
      const snapshotA = snapshot("replica-a-blade");
      const snapshotB = snapshot("replica-b-blade");
      const semanticCommitment = window.lrRewardSemanticCommitment(
        sessionId, "Hunt", 60, window.LR_SESSION_REWARD_POLICY_VERSION
      );
      const receipt = (rewardSnapshot, at) => ({
        at, policyVersion:window.LR_SESSION_REWARD_POLICY_VERSION,
        semanticCommitment, rewardSnapshot,
        contentCommitment:window.lrRewardContentCommitment(rewardSnapshot)
      });
      local.loot.sessionRewardReceipts = {
        [sessionId]:receipt(snapshotA, 200)
      };
      local.loot.sessionRewardReceiptTombstones = {
        [sessionId]:{
          policyVersion:window.LR_SESSION_REWARD_POLICY_VERSION,
          semanticCommitment,
          contentCommitment:window.lrRewardContentCommitment(snapshotA)
        }
      };
      remote.loot.sessionRewardReceipts = {
        [sessionId]:receipt(snapshotB, 100)
      };
      remote.loot.sessionRewardReceiptTombstones = {
        [sessionId]:{
          policyVersion:window.LR_SESSION_REWARD_POLICY_VERSION,
          semanticCommitment,
          contentCommitment:window.lrRewardContentCommitment(snapshotB)
        }
      };
      let error = "";
      try { fh.mergeRemoteState(local, remote); }
      catch (caught) { error = String(caught?.message || caught); }
      return {
        sameDropId:local.loot.sessionRewardReceipts[sessionId].rewardSnapshot.drops[0].drop.id ===
          remote.loot.sessionRewardReceipts[sessionId].rewardSnapshot.drops[0].drop.id,
        commitmentsDiffer:local.loot.sessionRewardReceipts[sessionId].contentCommitment !== remote.loot.sessionRewardReceipts[sessionId].contentCommitment,
        error
      };
    });
    assert.equal(result.sameDropId, true);
    assert.equal(result.commitmentsDiffer, true);
    assert.match(result.error, /Conflicting session reward receipt.*merge refused/);
  });

  assert.deepEqual(pageErrors, [], pageErrors.join("\n"));
  console.log(`passed ${passed}/${passed}`);
} finally {
  await context.close();
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
