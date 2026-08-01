import assert from "node:assert/strict";
import { test } from "node:test";
import { IDBFactory } from "fake-indexeddb";

import {
  DurableCommandReservationError,
  SYNTHETIC_DATABASE_PREFIX,
  SyntheticIndexedDbLedgerAdapter,
} from "../indexeddb-ledger-adapter.mjs";
import {
  SyntheticAccountingCommandBridge,
  SyntheticApplicationReceiptError,
  createSyntheticApplicationReceipt,
} from "../accounting-command-bridge.mjs";
import {
  REWARD_POLICY_VERSION,
  canonicalJson,
  projectLedger,
} from "../browser-ledger.mjs";

const identity = Object.freeze({
  profileId: "synthetic-accounting-bridge-profile",
  profileEpoch: "synthetic-accounting-bridge-epoch",
});

let databaseSequence = 0;

function databaseName(label) {
  databaseSequence += 1;
  return `${SYNTHETIC_DATABASE_PREFIX}${label}-${databaseSequence}`;
}

function adapter({
  indexedDB,
  name,
  syntheticFaultInjector = null,
}) {
  return new SyntheticIndexedDbLedgerAdapter({
    databaseName: name,
    indexedDB,
    locks: null,
    ...identity,
    syntheticFaultInjector,
  });
}

function command({
  commandId,
  sessionId,
  minutes,
  logicalTime = 1,
}) {
  return {
    commandId,
    actorId: "synthetic-accounting-actor",
    logicalTime,
    type: "session.created",
    payload: {
      sessionId,
      expectedRevision: 0,
      parentEventId: null,
      rewardPolicyVersion: REWARD_POLICY_VERSION,
      minutes,
    },
  };
}

function applicationHarness({ crashAfterReceipt = false } = {}) {
  const receipts = new Map();
  const proofs = new Map();
  const state = { totalMinutes:0, applyCount:0 };
  let crashPending = crashAfterReceipt;
  const participant = {
    async readApplicationReceipt(reservation) {
      return receipts.get(reservation.commandId) ?? null;
    },
    async applyReservedCommand(reservation) {
      const prior = receipts.get(reservation.commandId);
      if (prior) return prior;
      const minutes = reservation.command.payload.minutes;
      const proof = {
        commandId:reservation.commandId,
        minutes,
        totalMinutesAfter:state.totalMinutes + minutes,
      };
      const receipt = await createSyntheticApplicationReceipt(
        reservation,
        proof,
      );
      /*
       * This synchronous group models one application-state commit containing
       * both the accounting effect and its immutable command receipt.
       */
      state.totalMinutes = proof.totalMinutesAfter;
      state.applyCount += 1;
      proofs.set(reservation.commandId, proof);
      receipts.set(reservation.commandId, receipt);
      if (crashPending) {
        crashPending = false;
        throw new Error("synthetic crash after application receipt");
      }
      return receipt;
    },
    async verifyApplicationReceipt(receipt, reservation) {
      const proof = proofs.get(reservation.commandId);
      if (!proof) return false;
      const expected = await createSyntheticApplicationReceipt(
        reservation,
        proof,
      );
      return canonicalJson(expected) === canonicalJson(receipt);
    },
  };
  return { participant, state, receipts, proofs };
}

test("explicit reserve and finalize are separate durable phases", async () => {
  const indexedDB = new IDBFactory();
  const name = databaseName("explicit-phases");
  const ledger = adapter({ indexedDB, name });
  const input = command({
    commandId:"two-phase-command",
    sessionId:"two-phase-session",
    minutes:45,
  });

  await assert.rejects(
    ledger.finalizeCommand(input),
    DurableCommandReservationError,
  );
  const reserved = await ledger.reserveCommand(input);
  assert.equal(reserved.status, "reserved");
  assert.equal(reserved.newlyReserved, true);
  assert.equal(reserved.finalized, false);
  let loaded = await ledger.load();
  assert.equal(loaded.commandReservationCount, 1);
  assert.equal(loaded.pendingCommandCount, 1);
  assert.equal(loaded.observationCount, 0);
  assert.deepEqual(
    (await ledger.recoverPendingCommands()).map((item) => item.commandId),
    [input.commandId],
  );

  const finalized = await ledger.finalizeCommand(input);
  assert.equal(finalized.committed, true);
  const duplicate = await ledger.finalizeCommand(input);
  assert.equal(duplicate.committed, false);
  loaded = await ledger.load();
  assert.equal(loaded.pendingCommandCount, 0);
  assert.equal(loaded.observationCount, 1);
  assert.equal((await ledger.recoverCommands())[0].finalized, true);
  assert.equal(
    (await projectLedger(loaded.ledger, {
      profileId:identity.profileId,
      revision:loaded.revision,
    })).totalMinutes,
    45,
  );
  await ledger.close();
});

test("recovery after reservation never applies an unreceipted command implicitly", async () => {
  const indexedDB = new IDBFactory();
  const name = databaseName("crash-after-reserve");
  const input = command({
    commandId:"crash-after-reserve",
    sessionId:"reserve-crash-session",
    minutes:30,
  });
  const first = adapter({ indexedDB, name });
  await first.reserveCommand(input);
  await first.close();

  const application = applicationHarness();
  const reopened = adapter({ indexedDB, name });
  const bridge = new SyntheticAccountingCommandBridge({
    adapter:reopened,
    applicationParticipant:application.participant,
  });
  const recovery = await bridge.recover();
  assert.equal(recovery[0].status, "needs-application");
  assert.equal(application.state.totalMinutes, 0);
  assert.equal(application.state.applyCount, 0);

  const executed = await bridge.execute(input);
  assert.equal(executed.status, "finalized");
  assert.equal(application.state.totalMinutes, 30);
  assert.equal(application.state.applyCount, 1);
  const loaded = await reopened.load();
  assert.equal(loaded.pendingCommandCount, 0);
  assert.equal(loaded.observationCount, 1);
  await reopened.close();
});

test("recovery finalizes a receipted application without applying it twice", async () => {
  const indexedDB = new IDBFactory();
  const name = databaseName("crash-after-application");
  const input = command({
    commandId:"crash-after-application",
    sessionId:"application-crash-session",
    minutes:60,
  });
  const application = applicationHarness({ crashAfterReceipt:true });
  const first = adapter({ indexedDB, name });
  const firstBridge = new SyntheticAccountingCommandBridge({
    adapter:first,
    applicationParticipant:application.participant,
  });
  await assert.rejects(
    firstBridge.execute(input),
    /synthetic crash after application receipt/,
  );
  assert.equal(application.state.totalMinutes, 60);
  assert.equal(application.state.applyCount, 1);
  assert.equal((await first.load()).pendingCommandCount, 1);
  await first.close();

  const reopened = adapter({ indexedDB, name });
  const recoveredBridge = new SyntheticAccountingCommandBridge({
    adapter:reopened,
    applicationParticipant:application.participant,
  });
  const recovery = await recoveredBridge.recover();
  assert.equal(recovery[0].status, "recovered-finalization");
  assert.equal(application.state.totalMinutes, 60);
  assert.equal(application.state.applyCount, 1);
  const loaded = await reopened.load();
  assert.equal(loaded.pendingCommandCount, 0);
  assert.equal(
    (await projectLedger(loaded.ledger, {
      profileId:identity.profileId,
      revision:loaded.revision,
    })).totalMinutes,
    60,
  );
  await reopened.close();
});

test("recovery after finalization and response loss remains exactly once", async () => {
  const indexedDB = new IDBFactory();
  const name = databaseName("crash-after-finalize");
  const input = command({
    commandId:"crash-after-finalize",
    sessionId:"finalize-crash-session",
    minutes:75,
  });
  const application = applicationHarness();
  let crashPending = true;
  const first = adapter({
    indexedDB,
    name,
    syntheticFaultInjector(phase) {
      if (phase === "after-event-commit" && crashPending) {
        crashPending = false;
        throw new Error("synthetic response loss after finalization");
      }
    },
  });
  const firstBridge = new SyntheticAccountingCommandBridge({
    adapter:first,
    applicationParticipant:application.participant,
  });
  await assert.rejects(
    firstBridge.execute(input),
    /synthetic response loss after finalization/,
  );
  assert.equal(application.state.applyCount, 1);
  await first.close();

  const reopened = adapter({ indexedDB, name });
  const recoveredBridge = new SyntheticAccountingCommandBridge({
    adapter:reopened,
    applicationParticipant:application.participant,
  });
  const recovery = await recoveredBridge.recover();
  assert.equal(recovery[0].status, "already-finalized");
  const duplicate = await recoveredBridge.execute(input);
  assert.equal(duplicate.status, "already-finalized");
  assert.equal(application.state.totalMinutes, 75);
  assert.equal(application.state.applyCount, 1);
  const loaded = await reopened.load();
  assert.equal(loaded.observationCount, 1);
  assert.equal(loaded.durableRevisionCount, 1);
  await reopened.close();
});

test("a ledger-finalized command without an application receipt fails closed", async () => {
  const indexedDB = new IDBFactory();
  const name = databaseName("missing-application-receipt");
  const input = command({
    commandId:"missing-application-receipt",
    sessionId:"missing-receipt-session",
    minutes:25,
  });
  const ledger = adapter({ indexedDB, name });
  await ledger.appendCommand(input);
  const application = applicationHarness();
  const bridge = new SyntheticAccountingCommandBridge({
    adapter:ledger,
    applicationParticipant:application.participant,
  });

  const recovery = await bridge.recover();
  assert.equal(
    recovery[0].status,
    "blocked-missing-application-receipt",
  );
  await assert.rejects(
    bridge.execute(input),
    SyntheticApplicationReceiptError,
  );
  assert.equal(application.state.applyCount, 0);
  await ledger.close();
});
