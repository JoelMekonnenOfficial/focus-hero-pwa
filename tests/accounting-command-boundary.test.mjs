import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const commands = [
  "commitFocusTimerSession",
  "finalizeStopwatch",
  "applyTaskTimeAdjustment",
  "applySessionEdit",
  "deleteSessionRecord"
];

test("all accounting UI call sites use the wrapped public command path", async () => {
  for (const fileName of ["focus-hero.html", "index.html"]) {
    const source = await fs.readFile(path.join(root, fileName), "utf8");
    for (const name of commands) {
      const naked = new RegExp(`(^|[^.$A-Za-z0-9_])${name}\\s*\\(`, "gm");
      const matches = [...source.matchAll(naked)]
        .map(match => source.slice(0, match.index + match[1].length).split(/\r?\n/).length)
        .filter(line => {
          const text = source.split(/\r?\n/)[line - 1] || "";
          return !text.includes(`function ${name}(`) &&
            !text.trim().startsWith("*") &&
            !/^\d+\./.test(text.trim());
        });
      assert.deepEqual(matches, [], `${fileName} has a lexical ${name} bypass at lines ${matches.join(", ")}`);
    }
    assert.match(source, /const commit = window\.commitFocusTimerSession;/);
    assert.doesNotMatch(source, /window\.commitFocusTimerSession\s*\|\|\s*commitFocusTimerSession/);
  }
});

test("the transitional coordinator wraps every command outside all legacy effects", async () => {
  const source = await fs.readFile(path.join(root, "focus-economy.js"), "utf8");
  for (const name of commands) assert.match(source, new RegExp(`"${name}"`));
  assert.match(source, /installRewardParity\(\);installPriorityWrappers\(\);installAtomicCommandBoundary\(\);/);
  assert.match(source, /beginStatePersistenceBarrier/);
  assert.match(source, /endStatePersistenceBarrier/);
  assert.match(source, /window\.state=snapshot/);
  assert.match(source, /wrapped\.__fhAccountingBoundary=true/);
  assert.match(source, /if\(window\.__FocusHero\)window\.__FocusHero\[name\]=wrapped/);
  assert.match(source, /transitional:true/);
  assert.match(source, /reason:"persistence_failed",retryable:true/);
  assert.match(source, /reason:"storage_indeterminate",retryable:false/);
  assert.doesNotMatch(source, /function applyEggMinuteCorrection[^]*?catch\([^)]*\)\s*\{\s*return null;\s*\}/);
  for (const fileName of ["focus-hero.html", "index.html"]) {
    const html = await fs.readFile(path.join(root, fileName), "utf8");
    assert.match(html, /localStorage\.getItem\(STORAGE_KEY\) !== serialized/);
    assert.match(html, /saveState\._lastPrimarySave = \{ ok:true/);
    assert.match(html, /accountingCritical:true/);
    assert.match(html, /if \(accountingCritical\) throw new Error\("Focus target reward failed:/);
    assert.doesNotMatch(html, /function ledgerXpForMinutes\(min\)\s*\{\s*try\s*\{/);
    assert.match(html, /FH_ACCOUNTING_STORAGE_INDETERMINATE/);
    assert.match(html, /function loadState\(\)\{\s*assertAccountingStorageDeterminate\(\);/);
    assert.match(html, /function mergeRemoteState\(local, remote\)\{\s*assertAccountingStorageDeterminate\(\);/);
    assert.match(html, /if \(!browserSmokeRouteDisabled && !accountingStorageIndeterminate\) bc = new BroadcastChannel/);
  }
});

const require = createRequire(import.meta.url);
let chromium;
for (const candidate of ["playwright", process.env.FOCUS_HERO_PLAYWRIGHT].filter(Boolean)) {
  try { ({ chromium } = require(candidate)); break; } catch (_) {}
}

test("create, retry, edit, retry, and delete commit only completed synthetic state", { skip:!chromium }, async () => {
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
  const browser = await chromium.launch({ headless:true, channel:"chrome" });
  try {
    const context = await browser.newContext({ serviceWorkers:"block" });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil:"domcontentloaded" });
    await page.waitForFunction(() =>
      window.__fhAccountingBoundary &&
      window.__fhAccountingBoundary.commands.length === 5 &&
      window.commitFocusTimerSession?.__fhAccountingBoundary
    );
    const result = await page.evaluate(() => {
      const fh = window.__FocusHero;
      const current = fh.stateRef();
      const fresh = fh.migrate(JSON.parse(JSON.stringify(fh.DEFAULTS)));
      Object.keys(current).forEach(key => delete current[key]);
      Object.assign(current, fresh, {
        totalFocusMin:0,
        completedFocusSessions:0,
        history:{},
        sessionHistory:{},
        sessionsLog:[],
        activityLog:[],
        editLog:[],
        tasks:[],
        activeTaskId:null
      });
      current.sync.enabled = false;
      current.settings.monthlyBackup = false;
      current.settings.autoStart = false;
      const task = fh.createTask({ name:"Atomic fixture", emoji:"A" });
      const mainKey = "focusHero.v4.state";
      const nativeSetItem = Storage.prototype.setItem;
      let mainWrites = 0;
      Storage.prototype.setItem = function(key, value){
        if (key === mainKey) mainWrites += 1;
        return nativeSetItem.call(this, key, value);
      };
      const snap = () => {
        const s = fh.stateRef();
        return JSON.stringify({
          total:s.totalFocusMin|0,
          sessions:s.completedFocusSessions|0,
          history:s.history,
          task:s.tasks.find(item => item.id === task.id),
          records:s.sessionsLog,
          hero:s.hero,
          coins:s.coins|0,
          economy:s.focusEconomy,
          eggs:s.eggs
        });
      };
      try {
        mainWrites = 0;
        const claim = {
          sessionId:"focus_atomic_fixture_0001",
          plannedMinutes:20,
          elapsedMinutes:20,
          plannedMs:1_200_000,
          elapsedMs:1_200_000,
          startedAt:Date.now()-1_200_000,
          scheduledEndAt:Date.now(),
          completedAt:Date.now(),
          taskId:task.id,
          taskLabel:task.name,
          action:"Travel",
          priorityRun:false,
          lockedInRun:false
        };
        const created = window.commitFocusTimerSession(claim, 20);
        const createWrites = mainWrites;
        const afterCreate = snap();

        mainWrites = 0;
        const duplicate = window.commitFocusTimerSession(claim, 20);
        const duplicateWrites = mainWrites;
        const afterDuplicate = snap();

        mainWrites = 0;
        const edited = window.applySessionEdit(claim.sessionId, 30);
        const editWrites = mainWrites;
        const afterEdit = snap();

        mainWrites = 0;
        const duplicateEdit = window.applySessionEdit(claim.sessionId, 30);
        const duplicateEditWrites = mainWrites;
        const afterDuplicateEdit = snap();

        mainWrites = 0;
        const deleted = window.deleteSessionRecord(claim.sessionId);
        const deleteWrites = mainWrites;
        const afterDelete = snap();

        mainWrites = 0;
        const duplicateDelete = window.deleteSessionRecord(claim.sessionId);
        const duplicateDeleteWrites = mainWrites;
        const afterDuplicateDelete = snap();

        const mergeBase = JSON.parse(JSON.stringify(fh.stateRef()));
        const mergeLocal = JSON.parse(JSON.stringify(mergeBase));
        const mergeRemote = JSON.parse(JSON.stringify(mergeBase));
        const emptyPatch = () => ({ set:{}, remove:[] });
        const rewardReceipt = (sessionId, action, minutes, at, zoneId) => {
          const policyVersion = window.LR_SESSION_REWARD_POLICY_VERSION;
          const rewardSnapshot = {
            schemaVersion:policyVersion, sessionId, action, minutes,
            legacyItemId:null, zoneId, boss:null, drops:[], consumed:[],
            effects:{
              pity:{}, materials:{}, consumables:{}, lootOwned:{}, gemsOwned:{},
              instanceTombstones:emptyPatch(), mountFamilies:emptyPatch(), mountProgress:0,
              bestiary:emptyPatch(), world:emptyPatch(), achievements:emptyPatch(),
              heroHp:0, crystalShards:0, crystalShardsEarned:0
            }
          };
          return {
            at, policyVersion,
            semanticCommitment:window.lrRewardSemanticCommitment(sessionId, action, minutes, policyVersion),
            contentCommitment:window.lrRewardContentCommitment(rewardSnapshot),
            rewardSnapshot
          };
        };
        mergeLocal.loot.sessionRewardReceipts = {
          shared:rewardReceipt("shared","Travel",20,200,null),
          localOnly:rewardReceipt("localOnly","Loot",5,300,"zone-a")
        };
        mergeRemote.loot.sessionRewardReceipts = {
          shared:rewardReceipt("shared","Travel",20,100,null),
          remoteOnly:rewardReceipt("remoteOnly","Craft",10,400,"zone-b")
        };
        const forwardReceipts = fh.mergeRemoteState(mergeLocal, mergeRemote).loot.sessionRewardReceipts;
        const reverseReceipts = fh.mergeRemoteState(mergeRemote, mergeLocal).loot.sessionRewardReceipts;
        const conflicting = JSON.parse(JSON.stringify(mergeRemote));
        conflicting.loot.sessionRewardReceipts.shared.rewardSnapshot.zoneId = "conflicting-zone";
        conflicting.loot.sessionRewardReceipts.shared.contentCommitment = window.lrRewardContentCommitment(
          conflicting.loot.sessionRewardReceipts.shared.rewardSnapshot
        );
        let conflictRefused = false;
        try { fh.mergeRemoteState(mergeLocal, conflicting); }
        catch (error) { conflictRefused = /Conflicting session reward receipt/.test(String(error?.message || error)); }

        const dropLocal = JSON.parse(JSON.stringify(mergeBase));
        const dropRemote = JSON.parse(JSON.stringify(mergeBase));
        dropLocal.loot.sessionRewardReceipts = {};
        dropRemote.loot.sessionRewardReceipts = {};
        dropLocal.loot.drops = [{
          id:"drop_stable_fixture", at:200, updatedAt:250, sessionId:"session-fixture",
          iid:"iid-fixture", templateId:"fixture-blade", rarity:"rare",
          sourceAction:"Travel", enemyId:null, odds:{rolled:0.2,total:1,ratio:0.2}, pity:{tier:"rare"}
        }];
        dropRemote.loot.drops = [{
          id:"drop_stable_fixture", at:100, updatedAt:150, sessionId:"session-fixture",
          iid:"iid-fixture", templateId:"fixture-blade", rarity:"rare",
          sourceAction:"Travel", enemyId:null, odds:{rolled:0.2,total:1,ratio:0.2}, pity:{tier:"rare"}
        }];
        const forwardDrop = fh.mergeRemoteState(dropLocal, dropRemote).loot.drops
          .find(drop => drop.id === "drop_stable_fixture");
        const reverseDrop = fh.mergeRemoteState(dropRemote, dropLocal).loot.drops
          .find(drop => drop.id === "drop_stable_fixture");
        const divergentDrop = JSON.parse(JSON.stringify(dropRemote));
        divergentDrop.loot.drops[0].templateId = "different-blade";
        let dropConflictRefused = false;
        try { fh.mergeRemoteState(dropLocal, divergentDrop); }
        catch (error) { dropConflictRefused = /Conflicting stable loot drop/.test(String(error?.message || error)); }

        return {
          created, duplicate, edited, duplicateEdit, deleted, duplicateDelete,
          createWrites, duplicateWrites, editWrites, duplicateEditWrites,
          deleteWrites, duplicateDeleteWrites,
          afterCreate, afterDuplicate, afterEdit, afterDuplicateEdit,
          afterDelete, afterDuplicateDelete,
          forwardReceipts, reverseReceipts, conflictRefused,
          forwardDrop, reverseDrop, dropConflictRefused
        };
      } finally {
        Storage.prototype.setItem = nativeSetItem;
      }
    });
    assert.equal(result.created.ok, true);
    assert.equal(result.createWrites, 1);
    assert.equal(result.duplicate.duplicate, true);
    assert.equal(result.duplicateWrites, 0);
    assert.equal(result.afterDuplicate, result.afterCreate);
    assert.equal(result.edited.ok, true);
    assert.equal(result.editWrites, 1);
    assert.equal(result.duplicateEdit.ok, false);
    assert.equal(result.duplicateEdit.reason, "no_change");
    assert.equal(result.duplicateEditWrites, 0);
    assert.equal(result.afterDuplicateEdit, result.afterEdit);
    assert.equal(result.deleted.ok, true);
    assert.equal(result.deleteWrites, 1);
    assert.equal(result.duplicateDelete.ok, false);
    assert.equal(result.duplicateDelete.reason, "not_found");
    assert.equal(result.duplicateDeleteWrites, 0);
    assert.equal(result.afterDuplicateDelete, result.afterDelete);
    assert.deepEqual(result.forwardReceipts, result.reverseReceipts);
    assert.deepEqual(Object.keys(result.forwardReceipts).sort(), ["localOnly","remoteOnly","shared"]);
    assert.equal(result.forwardReceipts.shared.at, 100);
    assert.equal(result.forwardReceipts.shared.rewardSnapshot.sessionId, "shared");
    assert.match(result.forwardReceipts.shared.contentCommitment, /^sha256:[0-9a-f]{64}$/);
    assert.equal("dropIds" in result.forwardReceipts.shared, false, "duplicate outer reward fields stay removed");
    assert.equal(result.conflictRefused, true);
    assert.deepEqual(result.forwardDrop, result.reverseDrop);
    assert.equal(result.forwardDrop.at, 100);
    assert.equal(result.forwardDrop.updatedAt, 150);
    assert.equal(result.dropConflictRefused, true);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});

test("a late economy failure rolls the whole synthetic command back without persisting", { skip:!chromium }, async () => {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      const rel = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
      const file = path.resolve(root, `.${rel}`);
      if (!file.startsWith(root)) throw new Error("path escape");
      const body = await fs.readFile(file);
      res.writeHead(200, { "Content-Type":path.extname(file)===".html"?"text/html; charset=utf-8":"text/javascript; charset=utf-8", "Cache-Control":"no-store" });
      res.end(body);
    } catch (_) {
      res.writeHead(404);
      res.end("not found");
    }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless:true, channel:"chrome" });
  try {
    const page = await browser.newPage({ serviceWorkers:"block" });
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil:"domcontentloaded" });
    await page.waitForFunction(() => window.commitFocusTimerSession?.__fhAccountingBoundary);
    const result = await page.evaluate(() => {
      const fh = window.__FocusHero;
      const current = fh.stateRef();
      const fresh = fh.migrate(JSON.parse(JSON.stringify(fh.DEFAULTS)));
      Object.keys(current).forEach(key => delete current[key]);
      Object.assign(current, fresh, {
        totalFocusMin:0, completedFocusSessions:0, history:{}, sessionHistory:{},
        sessionsLog:[], activityLog:[], editLog:[], tasks:[]
      });
      current.sync.enabled = false;
      current.settings.monthlyBackup = false;
      current.settings.autoStart = true;
      const task = fh.createTask({ name:"Rollback fixture", emoji:"R" });
      const before = JSON.stringify(fh.stateRef());
      const mainKey = "focusHero.v4.state";
      const nativeSetItem = Storage.prototype.setItem;
      const nativeRewardXpTotal = window.rewardXpTotal;
      let mainWrites = 0;
      const mainWriteStacks = [];
      Storage.prototype.setItem = function(key, value){
        if (key === mainKey){
          mainWrites += 1;
          mainWriteStacks.push(String(new Error("main write").stack || ""));
        }
        return nativeSetItem.call(this, key, value);
      };
      window.rewardXpTotal = () => { throw new Error("synthetic late economy failure"); };
      let commandResult;
      try {
        commandResult = window.commitFocusTimerSession({
          sessionId:"focus_atomic_failure_0001",
          plannedMinutes:20,
          elapsedMinutes:20,
          plannedMs:1_200_000,
          elapsedMs:1_200_000,
          startedAt:Date.now()-1_200_000,
          scheduledEndAt:Date.now(),
          completedAt:Date.now(),
          taskId:task.id,
          taskLabel:task.name,
          action:"Travel"
        }, 20);
      } finally {
        window.rewardXpTotal = nativeRewardXpTotal;
        Storage.prototype.setItem = nativeSetItem;
      }
      return { commandResult, mainWrites, mainWriteStacks, unchanged:JSON.stringify(fh.stateRef()) === before };
    });
    await page.waitForTimeout(1100);
    const timerRunningAfterRollback = await page.evaluate(() => !!window.__FocusHero.stateRef().timer.running);
    assert.equal(result.commandResult.ok, false);
    assert.equal(result.commandResult.reason, "accounting_rolled_back");
    assert.equal(result.mainWrites, 0, result.mainWriteStacks.join("\n---\n"));
    assert.equal(result.unchanged, true);
    assert.equal(timerRunningAfterRollback, false);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});

test("egg, mount, target, loot, and final-save failures preserve memory and primary storage", { skip:!chromium }, async () => {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      const rel = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
      const file = path.resolve(root, `.${rel}`);
      if (!file.startsWith(root)) throw new Error("path escape");
      const body = await fs.readFile(file);
      res.writeHead(200, {
        "Content-Type":path.extname(file)===".html"?"text/html; charset=utf-8":"text/javascript; charset=utf-8",
        "Cache-Control":"no-store"
      });
      res.end(body);
    } catch (_) {
      res.writeHead(404);
      res.end("not found");
    }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless:true, channel:"chrome" });
  try {
    const page = await browser.newPage({ serviceWorkers:"block" });
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil:"domcontentloaded" });
    await page.waitForFunction(() =>
      window.applyTaskTimeAdjustment?.__fhAccountingBoundary &&
      typeof window.eggApplyMinuteCorrection === "function" &&
      typeof window.fhTargetsCheck === "function"
    );
    const result = await page.evaluate(() => {
      const fh = window.__FocusHero;
      const mainKey = "focusHero.v4.state";
      const nativeSetItem = Storage.prototype.setItem;

      function resetFixture(label) {
        const current = fh.stateRef();
        const fresh = fh.migrate(JSON.parse(JSON.stringify(fh.DEFAULTS)));
        Object.keys(current).forEach(key => delete current[key]);
        Object.assign(current, fresh, {
          totalFocusMin:0, completedFocusSessions:0, history:{}, sessionHistory:{},
          sessionsLog:[], activityLog:[], editLog:[], tasks:[]
        });
        current.sync.enabled = false;
        current.settings.monthlyBackup = false;
        current.settings.autoStart = false;
        current.settings.minRewardMinutes = 5;
        current.adventure.action = "Travel";
        const task = fh.createTask({ name:`${label} fixture`, emoji:"F" });
        const targets = window.__fhtTest.ensureShape();
        targets.__init = true;
        targets.daily.claimed = { easy:true, medium:true, hard:true };
        targets.weekly.claimed = { easy:true, medium:true, hard:true };
        if (window.saveState({ fromPull:true, suppressMilestoneAnnouncement:true }) !== true) {
          throw new Error(`Could not establish ${label} baseline`);
        }
        return task;
      }

      function runRollbackCase(label, installFailure, prepare) {
        const task = resetFixture(label);
        if (prepare) prepare(fh.stateRef());
        const restoreFailure = installFailure();
        const before = JSON.stringify(fh.stateRef());
        const primaryBefore = localStorage.getItem(mainKey);
        let mainWrites = 0;
        Storage.prototype.setItem = function(key, value) {
          if (key === mainKey) mainWrites += 1;
          return nativeSetItem.call(this, key, value);
        };
        let commandResult;
        try {
          commandResult = window.applyTaskTimeAdjustment(task.id, 10);
        } finally {
          Storage.prototype.setItem = nativeSetItem;
          restoreFailure();
        }
        return {
          commandResult,
          mainWrites,
          memoryUnchanged:JSON.stringify(fh.stateRef()) === before,
          primaryUnchanged:localStorage.getItem(mainKey) === primaryBefore
        };
      }

      const loot = runRollbackCase("loot", () => {
        const original = window.runSessionRewardPipeline;
        window.runSessionRewardPipeline = function() {
          fh.stateRef().coins = (fh.stateRef().coins|0) + 777;
          throw new Error("synthetic loot failure");
        };
        return () => { window.runSessionRewardPipeline = original; };
      });

      const economy = runRollbackCase("economy", () => {
        const original = window.computeCoins;
        window.computeCoins = function() {
          fh.stateRef().coins = (fh.stateRef().coins|0) + 888;
          throw new Error("synthetic economy failure");
        };
        return () => { window.computeCoins = original; };
      });

      const egg = runRollbackCase("egg", () => {
        const original = window.eggApplyMinuteCorrection;
        window.eggApplyMinuteCorrection = function() {
          fh.stateRef().coins = (fh.stateRef().coins|0) + 999;
          throw new Error("synthetic egg failure");
        };
        return () => { window.eggApplyMinuteCorrection = original; };
      });

      const mount = runRollbackCase("mount", () => {
        const original = window.crApplySessionMountRewards;
        window.crApplySessionMountRewards = function(state) {
          state.loot.mountProgress = (state.loot.mountProgress|0) + 10;
          throw new Error("synthetic mount failure");
        };
        return () => { window.crApplySessionMountRewards = original; };
      });

      const target = runRollbackCase("target", () => {
        const original = window.runSessionRewardPipeline;
        window.runSessionRewardPipeline = function(action) {
          if (action === "Loot") {
            fh.stateRef().coins = (fh.stateRef().coins|0) + 1111;
            throw new Error("synthetic target failure");
          }
          return original.apply(this, arguments);
        };
        return () => { window.runSessionRewardPipeline = original; };
      }, state => {
        const targets = window.__fhtTest.ensureShape();
        targets.__init = true;
        targets.daily.easy = 10;
        targets.daily.medium = 10_000;
        targets.daily.hard = 20_000;
        targets.daily.claimed = { easy:false, medium:true, hard:true };
        targets.weekly.claimed = { easy:true, medium:true, hard:true };
      });

      const saveTask = resetFixture("save");
      const saveBefore = JSON.stringify(fh.stateRef());
      const savePrimaryBefore = localStorage.getItem(mainKey);
      let mainWriteAttempts = 0;
      Storage.prototype.setItem = function(key, value) {
        if (key === mainKey) {
          mainWriteAttempts += 1;
          throw new DOMException("synthetic primary storage failure", "QuotaExceededError");
        }
        return nativeSetItem.call(this, key, value);
      };
      let saveFailure;
      try {
        saveFailure = window.applyTaskTimeAdjustment(saveTask.id, 10);
      } finally {
        Storage.prototype.setItem = nativeSetItem;
      }
      const persistence = {
        commandResult:saveFailure,
        mainWriteAttempts,
        memoryUnchanged:JSON.stringify(fh.stateRef()) === saveBefore,
        primaryUnchanged:localStorage.getItem(mainKey) === savePrimaryBefore
      };
      return { loot, economy, egg, mount, target, persistence };
    });

    for (const name of ["loot", "economy", "egg", "mount", "target"]) {
      assert.equal(result[name].commandResult.ok, false, name);
      assert.equal(result[name].commandResult.reason, "accounting_rolled_back", name);
      assert.equal(result[name].mainWrites, 0, name);
      assert.equal(result[name].memoryUnchanged, true, name);
      assert.equal(result[name].primaryUnchanged, true, name);
    }
    assert.equal(result.persistence.commandResult.ok, false);
    assert.equal(result.persistence.commandResult.reason, "persistence_failed");
    assert.equal(result.persistence.commandResult.retryable, true);
    assert.ok(result.persistence.mainWriteAttempts >= 1);
    assert.equal(result.persistence.memoryUnchanged, true);
    assert.equal(result.persistence.primaryUnchanged, true);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});

test("a read-back mismatch retries only after verified restore and otherwise latches across reload", { skip:!chromium }, async () => {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      const rel = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
      const file = path.resolve(root, `.${rel}`);
      if (!file.startsWith(root)) throw new Error("path escape");
      const body = await fs.readFile(file);
      res.writeHead(200, {
        "Content-Type":path.extname(file)===".html"?"text/html; charset=utf-8":"text/javascript; charset=utf-8",
        "Cache-Control":"no-store"
      });
      res.end(body);
    } catch (_) {
      res.writeHead(404);
      res.end("not found");
    }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless:true, channel:"chrome" });
  try {
    const page = await browser.newPage({ serviceWorkers:"block" });
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil:"domcontentloaded" });
    await page.waitForFunction(() =>
      window.applyTaskTimeAdjustment?.__fhAccountingBoundary &&
      typeof window.isAccountingStorageIndeterminate === "function"
    );
    const result = await page.evaluate(async () => {
      const fh = window.__FocusHero;
      const mainKey = "focusHero.v4.state";
      const guardKey = `${mainKey}.accounting-storage-indeterminate.v1`;
      const nativeGet = Storage.prototype.getItem;
      const nativeSet = Storage.prototype.setItem;
      const nativePost = BroadcastChannel.prototype.postMessage;
      const nativeFetch = window.fetch;

      function reset(label) {
        const current = fh.stateRef();
        const fresh = fh.migrate(JSON.parse(JSON.stringify(fh.DEFAULTS)));
        Object.keys(current).forEach(key => delete current[key]);
        Object.assign(current, fresh, {
          totalFocusMin:0, completedFocusSessions:0, history:{}, sessionHistory:{},
          sessionsLog:[], activityLog:[], editLog:[], tasks:[]
        });
        current.sync.enabled = false;
        current.settings.monthlyBackup = false;
        current.settings.autoStart = false;
        current.settings.minRewardMinutes = 5;
        current.adventure.action = "Travel";
        const task = fh.createTask({ name:`${label} fixture`, emoji:"S" });
        const targets = window.__fhtTest.ensureShape();
        targets.__init = true;
        targets.daily.claimed = { easy:true, medium:true, hard:true };
        targets.weekly.claimed = { easy:true, medium:true, hard:true };
        if (window.saveState({ fromPull:true, suppressMilestoneAnnouncement:true }) !== true) {
          throw new Error(`could not save ${label} baseline`);
        }
        return task;
      }

      function installMismatch(restoreFails, counters) {
        let primarySets = 0;
        let mismatchReturned = false;
        Storage.prototype.setItem = function(key, value) {
          if (key === mainKey) {
            primarySets += 1;
            counters.primarySets = primarySets;
            if (restoreFails && primarySets === 2) {
              throw new DOMException("synthetic restore failure", "QuotaExceededError");
            }
          }
          return nativeSet.call(this, key, value);
        };
        Storage.prototype.getItem = function(key) {
          if (key === mainKey && primarySets === 1 && !mismatchReturned) {
            mismatchReturned = true;
            return "{\"synthetic\":\"read-back-mismatch\"}";
          }
          return nativeGet.call(this, key);
        };
      }

      const verifiedTask = reset("verified");
      const verifiedMemory = JSON.stringify(fh.stateRef());
      const verifiedPrimary = localStorage.getItem(mainKey);
      const verifiedCounters = { primarySets:0, broadcasts:0 };
      BroadcastChannel.prototype.postMessage = function() {
        verifiedCounters.broadcasts += 1;
        return nativePost.apply(this, arguments);
      };
      installMismatch(false, verifiedCounters);
      let verifiedResult;
      try { verifiedResult = window.applyTaskTimeAdjustment(verifiedTask.id, 10); }
      finally {
        Storage.prototype.getItem = nativeGet;
        Storage.prototype.setItem = nativeSet;
        BroadcastChannel.prototype.postMessage = nativePost;
      }
      const verified = {
        result:verifiedResult,
        counters:verifiedCounters,
        memoryUnchanged:JSON.stringify(fh.stateRef()) === verifiedMemory,
        primaryUnchanged:localStorage.getItem(mainKey) === verifiedPrimary,
        latched:window.isAccountingStorageIndeterminate()
      };

      const uncertainTask = reset("uncertain");
      const beforeTotal = fh.stateRef().totalFocusMin|0;
      const beforeTask = fh.stateRef().tasks.find(item => item.id === uncertainTask.id).totalFocusMin|0;
      const uncertainCounters = { primarySets:0, broadcasts:0, fetches:0 };
      BroadcastChannel.prototype.postMessage = function() {
        uncertainCounters.broadcasts += 1;
        return nativePost.apply(this, arguments);
      };
      window.fetch = function() {
        uncertainCounters.fetches += 1;
        return Promise.reject(new Error("network must remain blocked"));
      };
      installMismatch(true, uncertainCounters);
      let first, retry, mergeBlocked = false, cloudBlocked = false;
      try {
        first = window.applyTaskTimeAdjustment(uncertainTask.id, 10);
        const afterFirstTotal = fh.stateRef().totalFocusMin|0;
        const afterFirstTask = fh.stateRef().tasks.find(item => item.id === uncertainTask.id).totalFocusMin|0;
        retry = window.applyTaskTimeAdjustment(uncertainTask.id, 10);
        try { window.mergeRemoteState(fh.stateRef(), fh.stateRef()); }
        catch (error) { mergeBlocked = error?.code === "FH_ACCOUNTING_STORAGE_INDETERMINATE"; }
        try { await window.cloudPush({ force:true }); }
        catch (error) { cloudBlocked = error?.code === "FH_ACCOUNTING_STORAGE_INDETERMINATE"; }
        return {
          verified,
          uncertain:{
            first, retry, counters:uncertainCounters,
            latched:window.isAccountingStorageIndeterminate(),
            guardPresent:!!nativeGet.call(localStorage, guardKey),
            beforeTotal, beforeTask, afterFirstTotal, afterFirstTask,
            afterRetryTotal:fh.stateRef().totalFocusMin|0,
            afterRetryTask:fh.stateRef().tasks.find(item => item.id === uncertainTask.id).totalFocusMin|0,
            storedTotal:JSON.parse(nativeGet.call(localStorage, mainKey)).totalFocusMin|0,
            mergeBlocked, cloudBlocked
          }
        };
      } finally {
        Storage.prototype.getItem = nativeGet;
        Storage.prototype.setItem = nativeSet;
        BroadcastChannel.prototype.postMessage = nativePost;
        window.fetch = nativeFetch;
      }
    });

    assert.equal(result.verified.result.reason, "persistence_failed");
    assert.equal(result.verified.result.retryable, true);
    assert.equal(result.verified.counters.primarySets, 2);
    assert.equal(result.verified.counters.broadcasts, 0);
    assert.equal(result.verified.memoryUnchanged, true);
    assert.equal(result.verified.primaryUnchanged, true);
    assert.equal(result.verified.latched, false);

    assert.equal(result.uncertain.first.reason, "storage_indeterminate");
    assert.equal(result.uncertain.first.retryable, false);
    assert.equal(result.uncertain.retry.reason, "storage_indeterminate");
    assert.equal(result.uncertain.retry.retryable, false);
    assert.equal(result.uncertain.counters.primarySets, 2);
    assert.equal(result.uncertain.counters.broadcasts, 0);
    assert.equal(result.uncertain.counters.fetches, 0);
    assert.equal(result.uncertain.latched, true);
    assert.equal(result.uncertain.guardPresent, true);
    assert.equal(result.uncertain.afterFirstTotal, result.uncertain.beforeTotal + 10);
    assert.equal(result.uncertain.afterFirstTask, result.uncertain.beforeTask + 10);
    assert.equal(result.uncertain.afterRetryTotal, result.uncertain.afterFirstTotal);
    assert.equal(result.uncertain.afterRetryTask, result.uncertain.afterFirstTask);
    assert.equal(result.uncertain.storedTotal, result.uncertain.afterFirstTotal);
    assert.equal(result.uncertain.mergeBlocked, true);
    assert.equal(result.uncertain.cloudBlocked, true);

    await page.reload({ waitUntil:"domcontentloaded" });
    await page.waitForSelector("#__fh_safe");
    const reloaded = await page.evaluate(() => {
      const mainKey = "focusHero.v4.state";
      let loadBlocked = false;
      try { window.loadState(); }
      catch (error) { loadBlocked = error?.code === "FH_ACCOUNTING_STORAGE_INDETERMINATE"; }
      return {
        latched:window.isAccountingStorageIndeterminate(),
        screen:document.getElementById("__fh_safe")?.textContent || "",
        memoryTotal:window.__FocusHero.stateRef().totalFocusMin|0,
        storedTotal:JSON.parse(localStorage.getItem(mainKey)).totalFocusMin|0,
        loadBlocked,
        command:window.applyTaskTimeAdjustment("synthetic-after-reload", 10)
      };
    });
    assert.equal(reloaded.latched, true);
    assert.match(reloaded.screen, /No state was automatically chosen or merged/);
    assert.equal(reloaded.memoryTotal, 0);
    assert.ok(reloaded.storedTotal > 0);
    assert.equal(reloaded.loadBlocked, true);
    assert.equal(reloaded.command.reason, "storage_indeterminate");
    assert.equal(reloaded.command.retryable, false);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
