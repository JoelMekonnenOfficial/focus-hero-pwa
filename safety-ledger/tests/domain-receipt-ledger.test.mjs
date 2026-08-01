import assert from "node:assert/strict";
import { test } from "node:test";

import {
  SessionReceiptLedger,
  deriveSessionReceipts,
  deriveSyntheticSessionReceipts,
} from "../domain-receipt-ledger.mjs";

function create(commandId, overrides = {}) {
  return {
    commandId,
    type: "create",
    sessionId: "session-alpha",
    parentRevisionId: null,
    minutes: 120,
    taskId: "task-write",
    dayKey: "2026-07-26",
    ...overrides,
  };
}

function edit(commandId, parentRevisionId, overrides = {}) {
  return {
    commandId,
    type: "edit",
    sessionId: "session-alpha",
    parentRevisionId,
    minutes: 90,
    taskId: "task-write",
    dayKey: "2026-07-26",
    ...overrides,
  };
}

test("one absolute session projection includes every required effect family", () => {
  const ledger = new SessionReceiptLedger();
  const result = ledger.apply(create("create-1"));
  assert.equal(result.status, "applied");
  const p = result.projection;
  assert.equal(p.minutes, 120);
  assert.equal(p.taskMinutes["task-write"], 120);
  assert.equal(p.dayMinutes["2026-07-26"], 120);
  assert.equal(p.xp, 1200);
  assert.equal(p.coins, 240);
  assert.equal(p.eggMinutes, 120);
  assert.equal(p.targetProgress, 4);
  assert.equal(Object.keys(p.chests).length, 2);
  assert.equal(p.orbs, 2);
  assert.equal(p.farmingMinutes, 120);
  assert.equal(Object.values(p.materials).reduce((sum, amount) => sum + amount, 0), 8);
  assert.equal(Object.keys(p.lootInstances).length, 4);
});

test("edit down then up reuses the same stable loot and chest receipt identities", () => {
  const ledger = new SessionReceiptLedger();
  const first = ledger.apply(create("create-1"));
  const initial = ledger.receiptsForHead("session-alpha");
  const initialLoot = initial.filter((receipt) => receipt.kind === "loot.instance").map((receipt) => receipt.instance.iid);
  const initialChest = initial.filter((receipt) => receipt.kind === "target.chest").map((receipt) => receipt.instance.chestId);

  const down = ledger.apply(edit("edit-down", first.revision.revisionId, { minutes: 45 }));
  assert.equal(down.projection.xp, 450);
  assert.equal(Object.keys(down.projection.lootInstances).length, 1);
  assert.equal(Object.keys(down.projection.chests).length, 0);

  const up = ledger.apply(edit("edit-up", down.revision.revisionId, { minutes: 120 }));
  const final = ledger.receiptsForHead("session-alpha");
  assert.deepEqual(
    final.filter((receipt) => receipt.kind === "loot.instance").map((receipt) => receipt.instance.iid),
    initialLoot,
  );
  assert.deepEqual(
    final.filter((receipt) => receipt.kind === "target.chest").map((receipt) => receipt.instance.chestId),
    initialChest,
  );
  assert.equal(up.projection.xp, 1200);
});

test("duplicate delivery is idempotent and command-id reuse with different content is rejected", () => {
  const ledger = new SessionReceiptLedger();
  const command = create("create-1", { minutes: 60 });
  const first = ledger.apply(command);
  const duplicate = ledger.apply(command);
  assert.deepEqual(duplicate, first);
  assert.equal(ledger.history("session-alpha").length, 1);
  assert.throws(() => ledger.apply(create("create-1", { minutes: 61 })), /already used/);
});

test("same-parent concurrent edits are held and converge regardless of delivery order", () => {
  function observe(order) {
    const ledger = new SessionReceiptLedger();
    const created = ledger.apply(create("create-1"));
    for (const command of order) ledger.apply(edit(command, created.revision.revisionId, {
      minutes: command === "edit-a" ? 75 : 30,
    }));
    return ledger;
  }
  const aThenB = observe(["edit-a", "edit-b"]);
  const bThenA = observe(["edit-b", "edit-a"]);
  assert.deepEqual(aThenB.snapshot(), bThenA.snapshot());
  const snapshot = aThenB.snapshot();
  assert.equal(snapshot.projection.minutes, 120, "the shared parent remains authoritative");
  assert.deepEqual(snapshot.heads, [{ sessionId: "session-alpha", revisionId: "create-1" }]);
  assert.deepEqual(snapshot.conflicts, [{
    sessionId: "session-alpha",
    parentRevisionId: "create-1",
    branchRevisionIds: ["edit-a", "edit-b"],
  }]);
  assert.equal(aThenB.history("session-alpha").length, 3);
});

test("a delayed ancestor sibling holds the complete descendant DAG and resolution restores the chosen leaf", () => {
  const ledger = new SessionReceiptLedger();
  const created = ledger.apply(create("create-c"));
  const e1 = ledger.apply(edit("edit-e1", created.revision.revisionId, { minutes: 90 }));
  const e2 = ledger.apply(edit("edit-e2", e1.revision.revisionId, { minutes: 60 }));
  ledger.apply(edit("edit-eb", created.revision.revisionId, { minutes: 30 }));

  const held = ledger.snapshot();
  assert.equal(held.projection.minutes, 120, "the ancestor parent is authoritative while held");
  assert.deepEqual(held.heads, [{ sessionId: "session-alpha", revisionId: "create-c" }]);
  assert.equal(ledger.history("session-alpha").length, 4, "the descendant is retained, not orphaned");

  const resolved = ledger.apply({
    commandId: "resolve-c",
    type: "resolveConflict",
    sessionId: "session-alpha",
    parentRevisionId: "create-c",
    chosenRevisionId: "edit-e1",
  });
  assert.equal(resolved.status, "applied");
  assert.equal(resolved.resolution.restoredHeadRevisionId, "edit-e2");
  assert.deepEqual(resolved.resolution.restoredDescendantRevisionIds, ["edit-e2"]);
  assert.deepEqual(resolved.resolution.nonAuthoritativeBranchRevisionIds, ["edit-eb"]);
  assert.equal(ledger.head("session-alpha").revisionId, "edit-e2");
  assert.equal(ledger.project().minutes, 60);

  const rejectedDescendant = ledger.apply(edit("edit-eb-child", "edit-eb", { minutes: 15 }));
  assert.equal(rejectedDescendant.status, "conflict");
  assert.match(rejectedDescendant.reason, /non-authoritative/);
  assert.equal(ledger.history("session-alpha").length, 4);
});

test("descendants arriving while an ancestor conflict is held remain in the chosen DAG", () => {
  const ledger = new SessionReceiptLedger();
  const created = ledger.apply(create("create-c"));
  ledger.apply(edit("edit-e1", created.revision.revisionId, { minutes: 90 }));
  ledger.apply(edit("edit-eb", created.revision.revisionId, { minutes: 30 }));
  const descendant = ledger.apply(edit("edit-e2", "edit-e1", { minutes: 60 }));
  assert.equal(descendant.status, "applied");
  assert.equal(ledger.head("session-alpha").revisionId, "create-c");
  const resolved = ledger.apply({
    commandId: "resolve-c",
    type: "resolveConflict",
    sessionId: "session-alpha",
    parentRevisionId: "create-c",
    chosenRevisionId: "edit-e1",
  });
  assert.equal(resolved.resolution.restoredHeadRevisionId, "edit-e2");
  assert.equal(resolved.projection.minutes, 60);
});

test("a nested conflict cannot escape an unresolved outer hold", () => {
  const ledger = new SessionReceiptLedger();
  const created = ledger.apply(create("create-c"));
  ledger.apply(edit("edit-e1", created.revision.revisionId, { minutes: 90 }));
  ledger.apply(edit("edit-eb", created.revision.revisionId, { minutes: 30 }));
  ledger.apply(edit("edit-e2a", "edit-e1", { minutes: 60 }));
  ledger.apply(edit("edit-e2b", "edit-e1", { minutes: 50 }));
  const attempted = ledger.apply({
    commandId: "resolve-inner-too-soon",
    type: "resolveConflict",
    sessionId: "session-alpha",
    parentRevisionId: "edit-e1",
    chosenRevisionId: "edit-e2a",
  });
  assert.equal(attempted.status, "conflict");
  assert.match(attempted.reason, /outer ancestor/);
  assert.equal(ledger.head("session-alpha").revisionId, "create-c");
  assert.equal(ledger.project().minutes, 120);
});

test("a command cannot inject one session under another session's parent DAG", () => {
  const ledger = new SessionReceiptLedger();
  ledger.apply(create("create-a", { sessionId: "session-a" }));
  const b = ledger.apply(create("create-b", { sessionId: "session-b" }));
  ledger.apply(edit("edit-b1", b.revision.revisionId, { sessionId: "session-b", minutes: 80 }));
  ledger.apply(edit("edit-b2", b.revision.revisionId, { sessionId: "session-b", minutes: 70 }));
  const before = ledger.snapshot();
  const injected = ledger.apply(edit("inject-a-under-b", b.revision.revisionId, {
    sessionId: "session-a",
    minutes: 999,
  }));
  assert.equal(injected.status, "conflict");
  assert.match(injected.reason, /another session/);
  assert.deepEqual(ledger.snapshot(), before);
  assert.equal(ledger.history("session-a").length, 1);
});

test("independent sessions union-converge despite interleaved delivery", () => {
  const alpha = create("create-alpha", { sessionId: "alpha", minutes: 60, taskId: "task-a" });
  const beta = create("create-beta", { sessionId: "beta", minutes: 90, taskId: "task-b" });
  const first = new SessionReceiptLedger();
  const second = new SessionReceiptLedger();
  first.apply(alpha); first.apply(beta);
  second.apply(beta); second.apply(alpha);
  assert.deepEqual(first.snapshot(), second.snapshot());
  assert.equal(first.project().minutes, 150);
});

test("delete reverses normal receipts exactly but preserves an explicitly locked receipt", () => {
  const ledger = new SessionReceiptLedger();
  const created = ledger.apply(create("create-1", { minutes: 60 }));
  const loot = ledger.receiptsForHead("session-alpha").find((receipt) => receipt.kind === "loot.instance");
  ledger.apply({
    commandId: "lock-loot-1",
    type: "lockReceipt",
    sessionId: "session-alpha",
    receiptId: loot.receiptId,
  });
  const deleted = ledger.apply({
    commandId: "delete-1",
    type: "delete",
    sessionId: "session-alpha",
    parentRevisionId: created.revision.revisionId,
  });
  assert.equal(deleted.status, "applied");
  assert.equal(deleted.projection.minutes, 0);
  assert.equal(deleted.projection.xp, 0);
  assert.equal(deleted.projection.coins, 0);
  assert.equal(Object.keys(deleted.projection.lootInstances).length, 1);
  assert.equal(Object.keys(deleted.projection.activeReceipts).length, 1);
});

test("a locked receipt keeps its original beneficiary when a later edit changes task/day", () => {
  const ledger = new SessionReceiptLedger();
  const created = ledger.apply(create("create-1", { minutes: 60 }));
  const taskMinutes = ledger.receiptsForHead("session-alpha").find((receipt) => receipt.kind === "minutes.task");
  ledger.apply({ commandId: "lock-task-1", type: "lockReceipt", sessionId: "session-alpha", receiptId: taskMinutes.receiptId });
  const changed = ledger.apply(edit("edit-1", created.revision.revisionId, {
    minutes: 30,
    taskId: "task-read",
    dayKey: "2026-07-27",
  }));
  assert.equal(changed.projection.taskMinutes["task-write"], 60);
  assert.equal(changed.projection.taskMinutes["task-read"], undefined);
  assert.equal(changed.projection.dayMinutes["2026-07-27"], 30);
});

test("receipt derivation is pure and deterministic across independent ledgers", () => {
  const input = { sessionId: "session-deterministic", minutes: 120, taskId: "task-1", dayKey: "2026-07-26" };
  assert.deepEqual(deriveSessionReceipts(input), deriveSessionReceipts(input));
  const a = new SessionReceiptLedger();
  const b = new SessionReceiptLedger();
  const command = { commandId: "create-same", type: "create", parentRevisionId: null, ...input };
  assert.deepEqual(a.apply(command).projection, b.apply(command).projection);
});

test("a reviewed pure planner can replace synthetic fixture formulas without rewiring this module", () => {
  const ledger = new SessionReceiptLedger({
    policyVersion: "reviewed-policy-example-v1",
    planner: (revision) => deriveSyntheticSessionReceipts(revision).map((receipt) => (
      receipt.kind === "xp" ? { ...receipt, amount: revision.minutes * 17 } : receipt
    )),
  });
  const result = ledger.apply(create("create-policy", { minutes: 10 }));
  assert.equal(result.projection.xp, 170);
  assert.equal(ledger.snapshot().policyVersion, "reviewed-policy-example-v1");
});

test("unknown receipt kinds fail before mutation and the same command can safely retry", () => {
  let malformed = true;
  const ledger = new SessionReceiptLedger({
    planner: (revision) => deriveSyntheticSessionReceipts(revision).map((receipt, index) => (
      malformed && index === 0 ? { ...receipt, kind: "unknown.kind" } : receipt
    )),
  });
  const before = ledger.snapshot();
  const command = create("create-retry", { minutes: 10 });
  assert.throws(() => ledger.apply(command), /unsupported receipt kind/);
  assert.deepEqual(ledger.snapshot(), before);
  assert.equal(ledger.head("session-alpha"), null);
  assert.deepEqual(ledger.history("session-alpha"), []);

  malformed = false;
  const retry = ledger.apply(command);
  assert.equal(retry.status, "applied");
  assert.equal(retry.projection.minutes, 10);
});

test("missing required receipt dimensions and instances leave exact zero state", () => {
  const corruptions = [
    {
      label: "task dimension",
      mutate: (receipts) => receipts.map((receipt) => (
        receipt.kind === "minutes.task" ? { ...receipt, dimensions: {} } : receipt
      )),
      error: /dimensions\.taskId/,
    },
    {
      label: "loot instance field",
      mutate: (receipts) => receipts.map((receipt) => (
        receipt.kind === "loot.instance" ? { ...receipt, instance: { iid: receipt.instance.iid } } : receipt
      )),
      error: /instance\.itemId/,
    },
    {
      label: "chest instance",
      mutate: (receipts) => receipts.map((receipt) => (
        receipt.kind === "target.chest" ? { ...receipt, instance: null } : receipt
      )),
      error: /receipt\.instance must be a plain object/,
    },
  ];
  for (const fixture of corruptions) {
    const ledger = new SessionReceiptLedger({
      planner: (revision) => fixture.mutate(deriveSyntheticSessionReceipts(revision)),
    });
    const before = ledger.snapshot();
    assert.throws(() => ledger.apply(create(`bad-${fixture.label}`, { minutes: 60 })), fixture.error);
    assert.deepEqual(ledger.snapshot(), before);
    assert.deepEqual(ledger.history("session-alpha"), []);
  }
});

test("unsafe, duplicate, and invalid discrete receipt amounts are rejected atomically", () => {
  const corruptions = [
    {
      mutate: (receipts) => receipts.map((receipt) => (
        receipt.kind === "xp" ? { ...receipt, amount: Number.MAX_SAFE_INTEGER + 1 } : receipt
      )),
      error: /safe integer/,
    },
    {
      mutate: (receipts) => [...receipts, { ...receipts[0] }],
      error: /duplicate receipt IDs/,
    },
    {
      mutate: (receipts) => receipts.map((receipt) => (
        receipt.kind === "loot.instance" ? { ...receipt, amount: 2 } : receipt
      )),
      error: /amount must equal 1/,
    },
  ];
  for (const [index, fixture] of corruptions.entries()) {
    const ledger = new SessionReceiptLedger({
      planner: (revision) => fixture.mutate(deriveSyntheticSessionReceipts(revision)),
    });
    const before = ledger.snapshot();
    assert.throws(() => ledger.apply(create(`bad-numeric-${index}`, { minutes: 30 })), fixture.error);
    assert.deepEqual(ledger.snapshot(), before);
    assert.deepEqual(ledger.history("session-alpha"), []);
  }
});

test("receipt IDs cannot be reused across sessions and a rejected command remains retryable", () => {
  let collide = true;
  const ledger = new SessionReceiptLedger({
    planner: (revision) => deriveSyntheticSessionReceipts(revision).map((receipt) => (
      receipt.kind === "xp"
        ? { ...receipt, receiptId: collide ? "shared-xp-receipt" : `xp:${revision.sessionId}` }
        : receipt
    )),
  });
  ledger.apply(create("create-owner-a", { sessionId: "owner-a", minutes: 10 }));
  const before = ledger.snapshot();
  const second = create("create-owner-b", { sessionId: "owner-b", minutes: 10 });
  assert.throws(() => ledger.apply(second), /owned by another session/);
  assert.deepEqual(ledger.snapshot(), before);
  assert.deepEqual(ledger.history("owner-b"), []);

  collide = false;
  assert.equal(ledger.apply(second).status, "applied");
  assert.equal(ledger.history("owner-b").length, 1);
});

test("aggregate safe-integer overflow rolls back revision, ownership, and command reservation", () => {
  let secondAmount = Number.MAX_SAFE_INTEGER;
  const ledger = new SessionReceiptLedger({
    planner: (revision) => [{
      receiptId: `minutes:${revision.sessionId}`,
      sessionId: revision.sessionId,
      kind: "minutes.all",
      slot: "absolute",
      amount: revision.sessionId === "overflow-b" ? secondAmount : Number.MAX_SAFE_INTEGER,
      reversible: true,
      dimensions: {},
      instance: null,
    }],
  });
  ledger.apply(create("create-overflow-a", { sessionId: "overflow-a", minutes: 1 }));
  const before = ledger.snapshot();
  const second = create("create-overflow-b", { sessionId: "overflow-b", minutes: 1 });
  assert.throws(() => ledger.apply(second), /safe integer range/);
  assert.deepEqual(ledger.snapshot(), before);
  assert.equal(ledger.head("overflow-b"), null);
  assert.deepEqual(ledger.history("overflow-b"), []);

  secondAmount = 0;
  assert.equal(ledger.apply(second).status, "applied", "same commandId retries after rollback");
  assert.equal(ledger.project().minutes, Number.MAX_SAFE_INTEGER);
});

test("accepted revisions freeze canonical receipts and never re-run planner for history or projection", () => {
  let plannerCalls = 0;
  let xpMultiplier = 17;
  const ledger = new SessionReceiptLedger({
    policyVersion: "mutable-catalog-test-v1",
    planner: (revision) => {
      plannerCalls += 1;
      return deriveSyntheticSessionReceipts(revision).map((receipt) => (
        receipt.kind === "xp" ? { ...receipt, amount: revision.minutes * xpMultiplier } : receipt
      ));
    },
  });
  ledger.apply(create("create-frozen", { minutes: 10 }));
  assert.equal(plannerCalls, 1);
  const original = ledger.snapshot();
  assert.equal(original.projection.xp, 170);

  xpMultiplier = 999;
  ledger.project();
  ledger.snapshot();
  ledger.head("session-alpha");
  ledger.receiptsForHead("session-alpha");
  const exportedHistory = ledger.history("session-alpha");
  assert.equal(plannerCalls, 1, "all reads use the stored absolute receipt plan");
  assert.equal(ledger.snapshot().projection.xp, 170);
  assert.equal(exportedHistory[0].receiptPolicyVersion, "mutable-catalog-test-v1");
  assert.match(exportedHistory[0].receiptPlanFingerprint, /^[0-9a-f]{16}$/);

  const exportedXp = exportedHistory[0].receipts.find((receipt) => receipt.kind === "xp");
  exportedXp.amount = 1;
  assert.equal(ledger.snapshot().projection.xp, 170, "mutating an exported copy cannot rewrite history");

  ledger.apply(edit("edit-new-policy-result", "create-frozen", { minutes: 11 }));
  assert.equal(plannerCalls, 2, "a newly accepted revision is planned exactly once");
  assert.equal(ledger.snapshot().projection.xp, 10989);
  assert.equal(plannerCalls, 2);
});
