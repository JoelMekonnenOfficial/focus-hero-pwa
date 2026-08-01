import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { TextDecoder, TextEncoder } from "node:util";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadBridge(){
  const context = {
    console,
    TextEncoder,
    TextDecoder,
    crypto:globalThis.crypto,
    setTimeout,
    clearTimeout,
  };
  context.window = context;
  context.globalThis = context;
  context.__FocusHero = {
    totalXpForLevel(level){
      let total = 0;
      for (let current = 1; current < level; current += 1) total += current * 100;
      return total;
    },
  };
  vm.createContext(context);
  vm.runInContext(
    "globalThis.structuredClone = value => JSON.parse(JSON.stringify(value));",
    context,
  );
  for (const file of [
    "safety-ledger/domain-receipt-ledger.js",
    "accounting-receipt-bridge.js",
  ]){
    const source = await fs.readFile(path.join(root, file), "utf8");
    vm.runInContext(source, context, { filename:file });
  }
  return context.__fhAccountingReceiptBridge;
}

function stateFixture(){
  return {
    totalFocusMin:0,
    tasks:[{id:"task-a",totalFocusMin:0}],
    history:{"2026-07-26":0},
    sessionsLog:[],
    hero:{level:1,xp:0},
    coins:0,
    eggs:{
      owned:[],
      incubating:[{id:"egg-a",incubatedMin:0,incubationCredits:[]}],
      hatched:[],
      quarantined:[],
    },
    targets:{
      daily:{date:"2026-07-26",claimed:{easy:false,medium:false,hard:false}},
      weekly:{week:"2026-W30",claimed:{easy:false,medium:false,hard:false}},
    },
    focusEconomy:{
      grants:{},
      spends:[],
      harvests:[],
    },
    lootInstances:{},
    loot:{vault:{instances:{}}},
  };
}

test("observed app effects are validated and journaled before persistence", async () => {
  const bridge = await loadBridge();
  assert.equal(bridge.ready, true);
  const before = stateFixture();
  const after = structuredClone(before);
  after.totalFocusMin = 60;
  after.tasks[0].totalFocusMin = 60;
  after.history["2026-07-26"] = 60;
  after.hero.xp = 125;
  after.coins = 24;
  after.eggs.incubating[0].incubatedMin = 60;
  after.eggs.incubating[0].incubationCredits = [
    {id:"session-a",taskId:"task-a",minutes:60},
  ];
  after.targets.daily.claimed.easy = true;
  after.focusEconomy.grants["session-a"] = {
    id:"session-a",
    orbs:2,
    farmMinutes:60,
    materials:{seed:2,herb:0,timber:4,ore:0},
    deleted:false,
  };
  after.lootInstances["iid-a"] = {iid:"iid-a",lootId:"blade-a"};
  after.sessionsLog.push({id:"session-a",taskId:"task-a",minutes:60});

  const result = bridge.appendObservedCommand({
    boundaryCommand:"commitFocusTimerSession",
    args:[{sessionId:"session-a",taskId:"task-a"},60],
    beforeState:before,
    afterState:after,
    result:{ok:true,sessionId:"session-a"},
  });
  assert.equal(result.ok, true);
  assert.equal(result.duplicate, false);
  assert.equal(after.accountingReceiptJournal.entries.length, 1);
  assert.deepEqual(Array.from(result.kinds), [
    "coins",
    "egg.minutes",
    "farming.material",
    "farming.minutes",
    "loot.instance",
    "minutes.all",
    "minutes.day",
    "minutes.task",
    "orbs",
    "target.chest",
    "target.progress",
    "xp",
  ]);
  const verification = JSON.parse(JSON.stringify(bridge.verifyStateJournal(after)));
  assert.deepEqual(verification, {
    ok:true,
    entries:1,
    policyVersion:"focus-hero-accounting-observed-effects-v1",
  });
});

test("rollback retry reproduces one command and committed replay is idempotent", async () => {
  const bridge = await loadBridge();
  const before = stateFixture();
  const after = structuredClone(before);
  after.totalFocusMin = 20;
  after.tasks[0].totalFocusMin = 20;
  after.history["2026-07-26"] = 20;
  after.hero.xp = 40;
  after.sessionsLog.push({id:"session-retry",taskId:"task-a",minutes:20});
  const input = {
    boundaryCommand:"commitFocusTimerSession",
    args:[{sessionId:"session-retry",taskId:"task-a"},20],
    beforeState:before,
    afterState:after,
    result:{ok:true,sessionId:"session-retry"},
  };
  const first = bridge.appendObservedCommand(input);

  const rollbackAfter = structuredClone(after);
  delete rollbackAfter.accountingReceiptJournal;
  const retry = bridge.appendObservedCommand({...input, afterState:rollbackAfter});
  assert.equal(retry.commandId, first.commandId);
  assert.equal(retry.effectFingerprint, first.effectFingerprint);
  assert.deepEqual(rollbackAfter.accountingReceiptJournal, after.accountingReceiptJournal);

  const replayBefore = structuredClone(before);
  replayBefore.accountingReceiptJournal = structuredClone(after.accountingReceiptJournal);
  const replayAfter = structuredClone(rollbackAfter);
  replayAfter.accountingReceiptJournal = structuredClone(after.accountingReceiptJournal);
  const duplicate = bridge.appendObservedCommand({
    ...input,
    beforeState:replayBefore,
    afterState:replayAfter,
  });
  assert.equal(duplicate.duplicate, true);
  assert.equal(replayAfter.accountingReceiptJournal.entries.length, 1);
});

test("tampered journals and unsafe observed totals fail without changing after-state", async () => {
  const bridge = await loadBridge();
  const before = stateFixture();
  const after = structuredClone(before);
  after.totalFocusMin = Number.MAX_SAFE_INTEGER + 1;
  const bytes = JSON.stringify(after);
  assert.throws(() => bridge.appendObservedCommand({
    boundaryCommand:"applyTaskTimeAdjustment",
    args:["task-a",1],
    beforeState:before,
    afterState:after,
    result:{ok:true},
  }), /safe integer/);
  assert.equal(JSON.stringify(after), bytes);

  const tamperedBefore = stateFixture();
  tamperedBefore.accountingReceiptJournal = {
    version:1,
    policyVersion:"focus-hero-accounting-observed-effects-v1",
    entries:[{commandId:"fake"}],
  };
  const tamperedAfter = structuredClone(tamperedBefore);
  assert.throws(() => bridge.verifyStateJournal(tamperedAfter), /malformed/);
});

test("the incomplete observed-effect receipt prototype stays outside the app runtime", async () => {
  const [index, mirror, economy, serviceWorker, publicBoundary] = await Promise.all([
    fs.readFile(path.join(root, "index.html"), "utf8"),
    fs.readFile(path.join(root, "focus-hero.html"), "utf8"),
    fs.readFile(path.join(root, "focus-economy.js"), "utf8"),
    fs.readFile(path.join(root, "sw.js"), "utf8"),
    fs.readFile(path.join(root, ".assetsignore"), "utf8"),
  ]);
  assert.equal(index, mirror);
  for (const source of [index, serviceWorker, publicBoundary]) {
    assert.doesNotMatch(source, /accounting-receipt-bridge\.js/);
    assert.doesNotMatch(source, /safety-ledger\/domain-receipt-ledger\.js/);
  }
  assert.doesNotMatch(economy, /appendObservedCommand/);
  assert.match(economy, /receiptJournal:false/);
});
