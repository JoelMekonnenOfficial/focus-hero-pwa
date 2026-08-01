import assert from "node:assert/strict";
import { test } from "node:test";
import { IDBFactory } from "fake-indexeddb";

import {
  DurableCommandConflictError,
  SYNTHETIC_DATABASE_PREFIX,
  SyntheticIndexedDbLedgerAdapter,
} from "../indexeddb-ledger-adapter.mjs";
import {
  REWARD_POLICY_VERSION,
  createEvent,
  projectLedger,
} from "../browser-ledger.mjs";

const identity = Object.freeze({
  profileId: "synthetic-durable-profile",
  profileEpoch: "synthetic-durable-epoch",
});

let databaseSequence = 0;

function newDatabaseName(label) {
  databaseSequence += 1;
  return `${SYNTHETIC_DATABASE_PREFIX}${label}-${databaseSequence}`;
}

function newAdapter({
  databaseName,
  indexedDB,
  locks = null,
  profileId = identity.profileId,
  profileEpoch = identity.profileEpoch,
  syntheticFaultInjector = null,
}) {
  return new SyntheticIndexedDbLedgerAdapter({
    databaseName,
    indexedDB,
    locks,
    profileId,
    profileEpoch,
    syntheticFaultInjector,
  });
}

async function sessionEvent({
  actorId = "synthetic-actor",
  actorSequence,
  logicalTime = actorSequence,
  sessionId,
  minutes,
}) {
  return createEvent({
    ...identity,
    actorId,
    actorSequence,
    logicalTime,
    type: "session.created",
    payload: {
      sessionId,
      expectedRevision: 0,
      parentEventId: null,
      rewardPolicyVersion: REWARD_POLICY_VERSION,
      minutes,
    },
  });
}

function sessionCommand({
  commandId,
  actorId = "synthetic-command-actor",
  logicalTime,
  sessionId,
  minutes,
}) {
  return {
    commandId,
    actorId,
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

function serialLockManager() {
  let tail = Promise.resolve();
  let calls = 0;
  let active = 0;
  let maximumActive = 0;
  return {
    get calls() {
      return calls;
    },
    get maximumActive() {
      return maximumActive;
    },
    request(_name, options, callback) {
      assert.deepEqual(options, { mode: "exclusive" });
      calls += 1;
      const result = tail.then(async () => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        try {
          return await callback();
        } finally {
          active -= 1;
        }
      });
      tail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  };
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => {};
  });
}

async function openRawDatabase(indexedDB, databaseName) {
  return requestResult(indexedDB.open(databaseName));
}

test("prototype cannot open a non-synthetic database", () => {
  assert.throws(
    () =>
      newAdapter({
        databaseName: "focus-hero-production",
        indexedDB: new IDBFactory(),
      }),
    /must begin with focus-hero-synthetic-ledger-/,
  );
});

test("events and revisions survive adapter restart with a verified projection", async () => {
  const indexedDB = new IDBFactory();
  const databaseName = newDatabaseName("restart");
  const first = newAdapter({ databaseName, indexedDB });
  const eventA = await sessionEvent({
    actorSequence: 1,
    sessionId: "durable-a",
    minutes: 35,
  });
  const eventB = await sessionEvent({
    actorSequence: 2,
    sessionId: "durable-b",
    minutes: 55,
  });

  assert.equal((await first.append(eventA)).committed, true);
  assert.equal((await first.append(eventB)).committed, true);
  await first.close();

  const reopened = newAdapter({ databaseName, indexedDB });
  const loaded = await reopened.load();
  const projection = await projectLedger(loaded.ledger, {
    profileId: identity.profileId,
    revision: loaded.revision,
  });
  assert.equal(projection.totalMinutes, 90);
  assert.equal(loaded.observationCount, 2);
  assert.equal(loaded.durableRevisionCount, 2);
  assert.equal(loaded.durableHead.localRevision, 2);
  const revisions = await reopened.listDurableRevisions();
  assert.equal(revisions[0].previousRevisionDigest, null);
  assert.equal(revisions[1].previousRevisionDigest, revisions[0].digest);
  assert.equal("authorityToken" in revisions[0].ledgerManifest, false);
  await reopened.close();
});

test("Web Locks serialize concurrent writers and both events persist", async () => {
  const indexedDB = new IDBFactory();
  const locks = serialLockManager();
  const databaseName = newDatabaseName("web-locks");
  const writerA = newAdapter({ databaseName, indexedDB, locks });
  const writerB = newAdapter({ databaseName, indexedDB, locks });
  const [eventA, eventB] = await Promise.all([
    sessionEvent({
      actorId: "synthetic-a",
      actorSequence: 1,
      sessionId: "locked-a",
      minutes: 20,
    }),
    sessionEvent({
      actorId: "synthetic-b",
      actorSequence: 1,
      sessionId: "locked-b",
      minutes: 25,
    }),
  ]);

  const results = await Promise.all([
    writerA.append(eventA),
    writerB.append(eventB),
  ]);
  assert.deepEqual(results.map((result) => result.committed), [true, true]);
  assert.equal(locks.calls, 2);
  assert.equal(locks.maximumActive, 1);

  const loaded = await writerA.load();
  assert.equal(
    (await projectLedger(loaded.ledger, {
      profileId: identity.profileId,
      revision: loaded.revision,
    })).totalMinutes,
    45,
  );
  assert.equal(loaded.durableRevisionCount, 2);
  await Promise.all([writerA.close(), writerB.close()]);
});

test("IndexedDB CAS fallback converges concurrent tabs without Web Locks", async () => {
  const indexedDB = new IDBFactory();
  const databaseName = newDatabaseName("cas");
  const writerA = newAdapter({ databaseName, indexedDB });
  const writerB = newAdapter({ databaseName, indexedDB });
  const [eventA, eventB] = await Promise.all([
    sessionEvent({
      actorId: "synthetic-cas-a",
      actorSequence: 1,
      sessionId: "cas-a",
      minutes: 40,
    }),
    sessionEvent({
      actorId: "synthetic-cas-b",
      actorSequence: 1,
      sessionId: "cas-b",
      minutes: 50,
    }),
  ]);

  await Promise.all([writerA.append(eventA), writerB.append(eventB)]);
  const loaded = await writerA.load();
  const projection = await projectLedger(loaded.ledger, {
    profileId: identity.profileId,
    revision: loaded.revision,
  });
  assert.equal(projection.totalMinutes, 90);
  assert.equal(loaded.observationCount, 2);
  assert.equal(loaded.durableRevisionCount, 2);
  await Promise.all([writerA.close(), writerB.close()]);
});

test("restart after command reservation reuses the exact sequence and event", async () => {
  const indexedDB = new IDBFactory();
  const databaseName = newDatabaseName("reservation-crash");
  let injected = false;
  const crashing = newAdapter({
    databaseName,
    indexedDB,
    syntheticFaultInjector(phase) {
      if (phase === "after-command-reservation" && !injected) {
        injected = true;
        throw new Error("synthetic crash after reservation");
      }
    },
  });
  const command = sessionCommand({
    commandId: "command-resume-1",
    logicalTime: 1,
    sessionId: "reserved-session",
    minutes: 45,
  });

  await assert.rejects(
    crashing.appendCommand(command),
    /synthetic crash after reservation/,
  );
  const pending = await crashing.load();
  assert.equal(pending.commandReservationCount, 1);
  assert.equal(pending.pendingCommandCount, 1);
  assert.equal(pending.durableRevisionCount, 0);
  const reservationBeforeRestart =
    (await crashing.listCommandReservations())[0];
  await crashing.close();

  const reopened = newAdapter({ databaseName, indexedDB });
  const resumed = await reopened.appendCommand(command);
  assert.equal(resumed.committed, true);
  assert.equal(resumed.resumedReservation, true);
  assert.equal(resumed.actorSequence, 1);
  assert.equal(
    resumed.reservationDigest,
    reservationBeforeRestart.reservationDigest,
  );
  assert.equal(
    resumed.eventId,
    (await createEvent(reservationBeforeRestart.eventInput)).eventId,
  );
  const duplicate = await reopened.appendCommand(command);
  assert.equal(duplicate.committed, false);
  assert.equal(duplicate.resumedReservation, true);
  assert.equal(duplicate.actorSequence, resumed.actorSequence);
  assert.equal(duplicate.eventId, resumed.eventId);
  const loaded = await reopened.load();
  assert.equal(loaded.pendingCommandCount, 0);
  assert.equal(loaded.durableRevisionCount, 1);
  assert.equal(
    (await projectLedger(loaded.ledger, {
      profileId: identity.profileId,
      revision: loaded.revision,
    })).totalMinutes,
    45,
  );
  await reopened.close();
});

test("restart after committed event but before response returns one durable effect", async () => {
  const indexedDB = new IDBFactory();
  const databaseName = newDatabaseName("response-crash");
  let injected = false;
  const crashing = newAdapter({
    databaseName,
    indexedDB,
    syntheticFaultInjector(phase) {
      if (phase === "after-event-commit" && !injected) {
        injected = true;
        throw new Error("synthetic crash after event commit");
      }
    },
  });
  const command = sessionCommand({
    commandId: "command-response-1",
    logicalTime: 1,
    sessionId: "response-session",
    minutes: 70,
  });

  await assert.rejects(
    crashing.appendCommand(command),
    /synthetic crash after event commit/,
  );
  await crashing.close();
  const reopened = newAdapter({ databaseName, indexedDB });
  const resumed = await reopened.appendCommand(command);
  assert.equal(resumed.committed, false);
  assert.equal(resumed.resumedReservation, true);
  assert.equal(resumed.actorSequence, 1);
  const loaded = await reopened.load();
  assert.equal(loaded.commandReservationCount, 1);
  assert.equal(loaded.pendingCommandCount, 0);
  assert.equal(loaded.observationCount, 1);
  assert.equal(loaded.durableRevisionCount, 1);
  assert.equal(
    (await projectLedger(loaded.ledger, {
      profileId: identity.profileId,
      revision: loaded.revision,
    })).totalMinutes,
    70,
  );
  await reopened.close();
});

test("concurrent command reservations allocate one sequence each transactionally", async () => {
  const indexedDB = new IDBFactory();
  const databaseName = newDatabaseName("command-concurrency");
  const writerA = newAdapter({ databaseName, indexedDB });
  const writerB = newAdapter({ databaseName, indexedDB });
  const commandA = sessionCommand({
    commandId: "concurrent-command-a",
    actorId: "shared-durable-actor",
    logicalTime: 1,
    sessionId: "command-a",
    minutes: 25,
  });
  const commandB = sessionCommand({
    commandId: "concurrent-command-b",
    actorId: "shared-durable-actor",
    logicalTime: 2,
    sessionId: "command-b",
    minutes: 35,
  });

  const results = await Promise.all([
    writerA.appendCommand(commandA),
    writerB.appendCommand(commandB),
  ]);
  assert.deepEqual(
    results.map((result) => result.actorSequence).sort((a, b) => a - b),
    [1, 2],
  );
  assert.equal(new Set(results.map((result) => result.eventId)).size, 2);
  const reservations = await writerA.listCommandReservations();
  assert.deepEqual(
    reservations
      .map((record) => record.actorSequence)
      .sort((a, b) => a - b),
    [1, 2],
  );
  const loaded = await writerA.load();
  assert.equal(loaded.commandReservationCount, 2);
  assert.equal(loaded.pendingCommandCount, 0);
  assert.equal(
    (await projectLedger(loaded.ledger, {
      profileId: identity.profileId,
      revision: loaded.revision,
    })).totalMinutes,
    60,
  );
  await Promise.all([writerA.close(), writerB.close()]);
});

test("command allocation advances beyond already durable actor observations", async () => {
  const indexedDB = new IDBFactory();
  const databaseName = newDatabaseName("observed-sequence");
  const adapter = newAdapter({ databaseName, indexedDB });
  await adapter.append(
    await sessionEvent({
      actorId: "existing-observation-actor",
      actorSequence: 7,
      sessionId: "existing-observation",
      minutes: 10,
    }),
  );
  const result = await adapter.appendCommand(
    sessionCommand({
      commandId: "after-existing-sequence",
      actorId: "existing-observation-actor",
      logicalTime: 8,
      sessionId: "after-existing",
      minutes: 20,
    }),
  );

  assert.equal(result.actorSequence, 8);
  const loaded = await adapter.load();
  assert.equal(
    (await projectLedger(loaded.ledger, {
      profileId: identity.profileId,
      revision: loaded.revision,
    })).totalMinutes,
    30,
  );
  await adapter.close();
});

test("concurrent retries of one command reserve and append exactly once", async () => {
  const indexedDB = new IDBFactory();
  const databaseName = newDatabaseName("same-command-concurrency");
  const writerA = newAdapter({ databaseName, indexedDB });
  const writerB = newAdapter({ databaseName, indexedDB });
  const command = sessionCommand({
    commandId: "one-command-many-tabs",
    actorId: "shared-retry-actor",
    logicalTime: 1,
    sessionId: "one-command-session",
    minutes: 50,
  });

  const results = await Promise.all([
    writerA.appendCommand(command),
    writerB.appendCommand(command),
  ]);
  assert.deepEqual(
    new Set(results.map((result) => result.actorSequence)),
    new Set([1]),
  );
  assert.deepEqual(
    new Set(results.map((result) => result.eventId)).size,
    1,
  );
  assert.equal(results.filter((result) => result.committed).length, 1);
  const loaded = await writerA.load();
  assert.equal(loaded.commandReservationCount, 1);
  assert.equal(loaded.pendingCommandCount, 0);
  assert.equal(loaded.observationCount, 1);
  assert.equal(loaded.durableRevisionCount, 1);
  await Promise.all([writerA.close(), writerB.close()]);
});

test("same commandId with different bytes is durably quarantined and fails closed", async () => {
  const indexedDB = new IDBFactory();
  const databaseName = newDatabaseName("command-conflict");
  const adapter = newAdapter({ databaseName, indexedDB });
  const original = sessionCommand({
    commandId: "stable-command-id",
    logicalTime: 1,
    sessionId: "stable-command-session",
    minutes: 30,
  });
  const conflicting = structuredClone(original);
  conflicting.payload.minutes = 90;

  const committed = await adapter.appendCommand(original);
  assert.equal(committed.committed, true);
  await assert.rejects(
    adapter.appendCommand(conflicting),
    DurableCommandConflictError,
  );
  const quarantine = await adapter.listCommandQuarantine();
  assert.equal(quarantine.length, 1);
  assert.notEqual(
    quarantine[0].existingCommandDigest,
    quarantine[0].conflictingCommandDigest,
  );
  await assert.rejects(
    adapter.appendCommand(original),
    DurableCommandConflictError,
  );
  await assert.rejects(adapter.load(), DurableCommandConflictError);
  const revisions = await adapter.listDurableRevisions();
  assert.equal(revisions.length, 1);
  assert.equal(revisions[0].ledgerManifest.observationCount, 1);
  await adapter.close();
});

test("a conflicting retry poisons a pending crash reservation before any event append", async () => {
  const indexedDB = new IDBFactory();
  const databaseName = newDatabaseName("pending-command-conflict");
  const crashing = newAdapter({
    databaseName,
    indexedDB,
    syntheticFaultInjector(phase) {
      if (phase === "after-command-reservation") {
        throw new Error("synthetic pending crash");
      }
    },
  });
  const original = sessionCommand({
    commandId: "pending-stable-command",
    logicalTime: 1,
    sessionId: "pending-session",
    minutes: 30,
  });
  const conflicting = structuredClone(original);
  conflicting.payload.minutes = 31;

  await assert.rejects(
    crashing.appendCommand(original),
    /synthetic pending crash/,
  );
  await crashing.close();
  const reopened = newAdapter({ databaseName, indexedDB });
  await assert.rejects(
    reopened.appendCommand(conflicting),
    DurableCommandConflictError,
  );
  await assert.rejects(
    reopened.appendCommand(original),
    DurableCommandConflictError,
  );
  await assert.rejects(reopened.load(), DurableCommandConflictError);
  assert.equal((await reopened.listCommandReservations()).length, 1);
  assert.equal((await reopened.listCommandQuarantine()).length, 1);
  assert.equal((await reopened.listDurableRevisions()).length, 0);
  await reopened.close();
});

test("duplicate delivery is idempotent and creates no extra revision", async () => {
  const indexedDB = new IDBFactory();
  const databaseName = newDatabaseName("duplicate");
  const writerA = newAdapter({ databaseName, indexedDB });
  const writerB = newAdapter({ databaseName, indexedDB });
  const event = await sessionEvent({
    actorSequence: 1,
    sessionId: "one-copy",
    minutes: 60,
  });

  const results = await Promise.all([
    writerA.append(event),
    writerB.append(event),
  ]);
  assert.equal(results.filter((result) => result.committed).length, 1);
  const loaded = await writerA.load();
  assert.equal(loaded.observationCount, 1);
  assert.equal(loaded.durableRevisionCount, 1);
  assert.equal(
    (await projectLedger(loaded.ledger, {
      profileId: identity.profileId,
      revision: loaded.revision,
    })).totalMinutes,
    60,
  );
  await Promise.all([writerA.close(), writerB.close()]);
});

test("same-ID different bytes remain durable quarantine evidence", async () => {
  const indexedDB = new IDBFactory();
  const databaseName = newDatabaseName("quarantine");
  const adapter = newAdapter({ databaseName, indexedDB });
  const valid = await sessionEvent({
    actorSequence: 1,
    sessionId: "collision",
    minutes: 30,
  });
  const differentBytes = structuredClone(valid);
  differentBytes.unexpected = true;

  assert.equal((await adapter.append(valid)).appendResult.status, "appended");
  assert.equal(
    (await adapter.append(differentBytes)).appendResult.reason,
    "EVENT_ID_COLLISION",
  );
  const loaded = await adapter.load();
  const projection = await projectLedger(loaded.ledger, {
    profileId: identity.profileId,
    revision: loaded.revision,
  });
  assert.equal(loaded.observationCount, 2);
  assert.equal(loaded.durableRevisionCount, 2);
  assert.equal(projection.totalMinutes, 0);
  assert.equal(
    projection.ledgerQuarantine.some(
      (entry) => entry.reason === "EVENT_ID_COLLISION",
    ),
    true,
  );
  await adapter.close();
});

test("load fails closed if stored event bytes no longer match their digest", async () => {
  const indexedDB = new IDBFactory();
  const databaseName = newDatabaseName("tamper");
  const adapter = newAdapter({ databaseName, indexedDB });
  await adapter.append(
    await sessionEvent({
      actorSequence: 1,
      sessionId: "integrity",
      minutes: 30,
    }),
  );

  const database = await openRawDatabase(indexedDB, databaseName);
  const transaction = database.transaction(["events"], "readwrite");
  const done = transactionDone(transaction);
  const store = transaction.objectStore("events");
  const rows = await requestResult(store.getAll());
  rows[0].event.payload.minutes = 999;
  store.put(rows[0]);
  await done;
  database.close();

  await assert.rejects(
    adapter.load(),
    /durable event integrity check failed/,
  );
  await adapter.close();
});

test("load fails closed if a reserved sequence is altered in storage", async () => {
  const indexedDB = new IDBFactory();
  const databaseName = newDatabaseName("reservation-tamper");
  const adapter = newAdapter({
    databaseName,
    indexedDB,
    syntheticFaultInjector(phase) {
      if (phase === "after-command-reservation") {
        throw new Error("stop after reservation");
      }
    },
  });
  await assert.rejects(
    adapter.appendCommand(
      sessionCommand({
        commandId: "tamper-reservation",
        logicalTime: 1,
        sessionId: "tamper-reservation-session",
        minutes: 30,
      }),
    ),
    /stop after reservation/,
  );

  const database = await openRawDatabase(indexedDB, databaseName);
  const transaction = database.transaction(["commands"], "readwrite");
  const done = transactionDone(transaction);
  const store = transaction.objectStore("commands");
  const rows = await requestResult(store.getAll());
  rows[0].actorSequence = 999;
  store.put(rows[0]);
  await done;
  database.close();

  await assert.rejects(
    adapter.load(),
    /command reservation event input mismatch|command reservation integrity check failed/,
  );
  await adapter.close();
});

test("profiles and epochs remain isolated inside one synthetic database", async () => {
  const indexedDB = new IDBFactory();
  const databaseName = newDatabaseName("identity");
  const primary = newAdapter({ databaseName, indexedDB });
  const other = newAdapter({
    databaseName,
    indexedDB,
    profileId: "synthetic-other-profile",
    profileEpoch: "synthetic-other-epoch",
  });
  await primary.append(
    await sessionEvent({
      actorSequence: 1,
      sessionId: "primary-only",
      minutes: 75,
    }),
  );

  const primaryLoad = await primary.load();
  const otherLoad = await other.load();
  assert.equal(primaryLoad.observationCount, 1);
  assert.equal(otherLoad.observationCount, 0);
  assert.equal(otherLoad.durableRevisionCount, 0);
  await Promise.all([primary.close(), other.close()]);
});

test("adapter source exposes no delete, clear, cloud, network, or profile enumeration path", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    new URL("../indexeddb-ledger-adapter.mjs", import.meta.url),
    "utf8",
  );
  for (const forbidden of [
    ".delete(",
    ".clear(",
    "deleteDatabase",
    ".databases(",
    "localStorage",
    "sessionStorage",
    "fetch(",
    "XMLHttpRequest",
    "WebSocket",
    "supabase",
    "document.",
    "window.",
  ]) {
    assert.equal(source.includes(forbidden), false, `found ${forbidden}`);
  }
});
