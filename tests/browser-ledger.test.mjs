import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  AppendOnlyLedger,
  CURRENT_CLIENT_VERSION,
  CURRENT_SCHEMA_VERSION,
  LEDGER_VERSION,
  REWARD_POLICY_VERSION,
  WRITER_PROTOCOL,
  canonicalJson,
  captureRevision,
  createEvent,
  deterministicEventId,
  projectLedger,
  sha256Hex,
  unionMerge,
} from "../safety-ledger/browser-ledger.mjs";

const profileId = "synthetic-browser-profile";
const profileEpoch = "synthetic-epoch-1";
const ledgerIdentity = Object.freeze({ profileId, profileEpoch });

function newLedger() {
  return new AppendOnlyLedger(ledgerIdentity);
}

function mergeLedgers(...sources) {
  return unionMerge(ledgerIdentity, ...sources);
}

async function recomputeUntrustedRevision(revision) {
  const forged = structuredClone(revision);
  const {
    authorityToken: _authorityToken,
    digest: _digest,
    ...body
  } = forged;
  forged.digest = await sha256Hex(canonicalJson(body));
  return forged;
}

async function makeEvent({
  actorId = "actor-a",
  actorSequence,
  logicalTime = actorSequence,
  type,
  sessionId,
  expectedRevision,
  parentEventId = type === "session.created" ? null : undefined,
  eventProfileEpoch = profileEpoch,
  rewardPolicyVersion = REWARD_POLICY_VERSION,
  minutes,
  schemaVersion = CURRENT_SCHEMA_VERSION,
  clientVersion = CURRENT_CLIENT_VERSION,
  writerProtocol = WRITER_PROTOCOL,
  ledgerVersion = LEDGER_VERSION,
}) {
  const payload = { sessionId, expectedRevision, parentEventId };
  if (type === "session.created") {
    payload.rewardPolicyVersion = rewardPolicyVersion;
  }
  if (minutes !== undefined) payload.minutes = minutes;
  return createEvent({
    schemaVersion,
    clientVersion,
    writerProtocol,
    ledgerVersion,
    profileId,
    profileEpoch: eventProfileEpoch,
    actorId,
    actorSequence,
    logicalTime,
    type,
    payload,
  });
}

test("Web Crypto SHA-256 matches the standard abc vector", async () => {
  assert.equal(
    await sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

test("browser module contains no Node, DOM, storage, or network dependency", async () => {
  const source = await readFile(
    new URL("../safety-ledger/browser-ledger.mjs", import.meta.url),
    "utf8",
  );
  for (const forbidden of [
    "node:",
    "require(",
    "process.",
    "Buffer.",
    "localStorage",
    "indexedDB",
    "fetch(",
    "supabase",
    "document.",
    "window.",
  ]) {
    assert.equal(source.includes(forbidden), false, `found ${forbidden}`);
  }
});

test("deterministic event IDs use canonical key ordering", async () => {
  const left = {
    profileId,
    profileEpoch,
    actorId: "actor-a",
    actorSequence: 1,
    logicalTime: 1,
    type: "session.created",
    payload: {
      sessionId: "s1",
      expectedRevision: 0,
      parentEventId: null,
      rewardPolicyVersion: REWARD_POLICY_VERSION,
      minutes: 30,
    },
  };
  const right = {
    type: "session.created",
    logicalTime: 1,
    actorSequence: 1,
    actorId: "actor-a",
    profileId,
    profileEpoch,
    payload: {
      minutes: 30,
      parentEventId: null,
      rewardPolicyVersion: REWARD_POLICY_VERSION,
      expectedRevision: 0,
      sessionId: "s1",
    },
  };
  assert.equal(await deterministicEventId(left), await deterministicEventId(right));
});

test("canonical hashing normalizes Unicode NFC and negative zero", async () => {
  const composed = await makeEvent({
    actorId: "Caf\u00e9",
    actorSequence: 1,
    type: "session.created",
    sessionId: "r\u00e9sum\u00e9",
    expectedRevision: 0,
    minutes: 30,
  });
  const decomposed = await makeEvent({
    actorId: "Cafe\u0301",
    actorSequence: 1,
    type: "session.created",
    sessionId: "re\u0301sume\u0301",
    expectedRevision: -0,
    minutes: 30,
  });

  assert.equal(composed.eventId, decomposed.eventId);
  assert.equal(decomposed.actorId, "Caf\u00e9");
  assert.equal(decomposed.payload.sessionId, "r\u00e9sum\u00e9");
  assert.equal(Object.is(decomposed.payload.expectedRevision, -0), false);
  assert.equal(canonicalJson(-0), "0");
  assert.throws(() => canonicalJson(Number.MAX_SAFE_INTEGER + 1), TypeError);
});

test("append is deeply immutable and duplicate delivery is idempotent", async () => {
  const created = await makeEvent({
    actorSequence: 1,
    type: "session.created",
    sessionId: "s1",
    expectedRevision: 0,
    minutes: 45,
  });
  const ledger = newLedger();
  assert.equal((await ledger.append(created)).status, "appended");
  assert.equal((await ledger.append(created)).status, "duplicate");
  assert.throws(() => {
    created.payload.minutes = 999;
  }, TypeError);
  assert.equal(ledger.acceptedCount, 1);
  assert.equal((await projectLedger(ledger, { profileId })).totalMinutes, 45);
});

test("append snapshots mutable input at invocation before async hashing", async () => {
  const created = structuredClone(
    await makeEvent({
      actorSequence: 1,
      type: "session.created",
      sessionId: "snapshot",
      expectedRevision: 0,
      minutes: 45,
    }),
  );
  const ledger = newLedger();
  const pendingAppend = ledger.append(created);
  created.payload.minutes = 999;

  assert.equal((await pendingAppend).status, "appended");
  assert.equal((await projectLedger(ledger, { profileId })).totalMinutes, 45);
});

test("invalid variants stay quarantined with the same reason on retry", async () => {
  const created = await makeEvent({
    actorSequence: 1,
    type: "session.created",
    sessionId: "strict",
    expectedRevision: 0,
    minutes: 25,
  });
  const envelopeExtension = { ...structuredClone(created), ignored: true };
  const payloadExtension = structuredClone(created);
  payloadExtension.payload.ignored = true;
  const envelopeLedger = newLedger();
  const payloadLedger = newLedger();

  assert.equal(
    (await envelopeLedger.append(envelopeExtension)).reason,
    "EVENT_ENVELOPE_INVALID",
  );
  assert.equal(
    (await envelopeLedger.append(envelopeExtension)).reason,
    "EVENT_ENVELOPE_INVALID",
  );
  assert.equal(
    (await payloadLedger.append(payloadExtension)).reason,
    "EVENT_PAYLOAD_INVALID",
  );
  assert.equal(
    (await payloadLedger.append(payloadExtension)).reason,
    "EVENT_PAYLOAD_INVALID",
  );
  assert.equal(envelopeLedger.acceptedCount, 0);
  assert.equal(payloadLedger.acceptedCount, 0);
});

test("any same-ID different bytes block projection and invalidate old revisions", async () => {
  const valid = await makeEvent({
    actorSequence: 1,
    type: "session.created",
    sessionId: "collision",
    expectedRevision: 0,
    minutes: 30,
  });
  const differentBytes = { ...structuredClone(valid), unexpected: true };
  const ledger = newLedger();
  await ledger.append(valid);
  const beforeCollision = await captureRevision(ledger);
  const acceptedRef = beforeCollision.acceptedEventRefs[0];

  assert.equal(
    (await ledger.append(differentBytes)).reason,
    "EVENT_ID_COLLISION",
  );
  assert.equal(
    (await ledger.append(differentBytes)).reason,
    "EVENT_ID_COLLISION",
  );
  assert.equal(ledger.acceptedCount, 0);
  assert.equal(
    ledger.quarantine().some((entry) => entry.reason === "EVENT_ID_COLLISION"),
    true,
  );
  assert.throws(() => ledger.resolveEventReference(acceptedRef), RangeError);
  await assert.rejects(
    projectLedger(ledger, { profileId, revision: beforeCollision }),
    RangeError,
  );

  const inverseLedger = newLedger();
  assert.equal(
    (await inverseLedger.append(differentBytes)).reason,
    "EVENT_ENVELOPE_INVALID",
  );
  assert.equal(
    (await inverseLedger.append(valid)).reason,
    "EVENT_ID_COLLISION",
  );
  assert.equal(inverseLedger.acceptedCount, 0);
});

test("production constructor rejects event-ID oracle injection", () => {
  assert.throws(
    () =>
      new AppendOnlyLedger({
        ...ledgerIdentity,
        deriveEventId: async (event) => event.eventId,
      }),
    TypeError,
  );
});

test("two offline writers converge under either union order", async () => {
  const writerA = newLedger();
  const writerB = newLedger();
  await writerA.append(
    await makeEvent({
      actorId: "offline-a",
      actorSequence: 1,
      type: "session.created",
      sessionId: "a",
      expectedRevision: 0,
      minutes: 35,
    }),
  );
  await writerB.append(
    await makeEvent({
      actorId: "offline-b",
      actorSequence: 1,
      type: "session.created",
      sessionId: "b",
      expectedRevision: 0,
      minutes: 55,
    }),
  );
  const ab = await projectLedger(await mergeLedgers(writerA, writerB), { profileId });
  const ba = await projectLedger(await mergeLedgers(writerB, writerA), { profileId });
  assert.deepEqual(ab, ba);
  assert.equal(ab.totalMinutes, 90);
});

test("sequence collisions reject direct, stale, subset, and omitted-quarantine revisions", async () => {
  const first = await makeEvent({
    actorId: "same",
    actorSequence: 7,
    type: "session.created",
    sessionId: "a",
    expectedRevision: 0,
    minutes: 30,
  });
  const second = await makeEvent({
    actorId: "same",
    actorSequence: 7,
    type: "session.created",
    sessionId: "b",
    expectedRevision: 0,
    minutes: 40,
  });
  const ledger = newLedger();
  await ledger.append(first);
  const beforeCollision = await captureRevision(ledger);
  const firstRef = beforeCollision.acceptedEventRefs[0];
  await ledger.append(second);
  assert.equal(ledger.acceptedCount, 0);
  assert.deepEqual(
    ledger.quarantine().map((entry) => entry.reason),
    ["ACTOR_SEQUENCE_COLLISION", "ACTOR_SEQUENCE_COLLISION"],
  );
  assert.equal(
    (await ledger.append(first)).reason,
    "ACTOR_SEQUENCE_COLLISION",
  );
  assert.equal(
    (await ledger.append(second)).reason,
    "ACTOR_SEQUENCE_COLLISION",
  );
  assert.throws(() => ledger.resolveEventReference(firstRef), RangeError);
  await assert.rejects(
    projectLedger(ledger, { profileId, revision: beforeCollision }),
    RangeError,
  );

  const current = await captureRevision(ledger);
  const forgedSubset = structuredClone(current);
  forgedSubset.acceptedEventRefs = [firstRef];
  forgedSubset.eventCount = 1;
  forgedSubset.quarantine = [];
  const forgedSubsetWithDigest = await recomputeUntrustedRevision(forgedSubset);
  await assert.rejects(
    projectLedger(ledger, {
      profileId,
      revision: forgedSubsetWithDigest,
    }),
    RangeError,
  );

  const omittedQuarantine = structuredClone(current);
  omittedQuarantine.quarantine = [];
  const omittedWithDigest = await recomputeUntrustedRevision(omittedQuarantine);
  await assert.rejects(
    projectLedger(ledger, {
      profileId,
      revision: omittedWithDigest,
    }),
    RangeError,
  );
});

test("concurrent exact edits from one parent are both held for review", async () => {
  const created = await makeEvent({
    actorId: "seed",
    actorSequence: 1,
    logicalTime: 999999,
    type: "session.created",
    sessionId: "shared",
    expectedRevision: 0,
    minutes: 20,
  });
  const actorA = await makeEvent({
    actorId: "actor-a",
    actorSequence: 1,
    logicalTime: 999999,
    type: "session.minutes_set",
    sessionId: "shared",
    expectedRevision: 1,
    parentEventId: created.eventId,
    minutes: 40,
  });
  const actorB = await makeEvent({
    actorId: "actor-b",
    actorSequence: 1,
    logicalTime: 1,
    type: "session.minutes_set",
    sessionId: "shared",
    expectedRevision: 1,
    parentEventId: created.eventId,
    minutes: 90,
  });
  const projection = await projectLedger(
    await mergeLedgers([actorB], [created], [actorA]),
    { profileId },
  );
  assert.equal(projection.totalMinutes, 20);
  assert.deepEqual(
    projection.conflicts.map((entry) => entry.reason),
    [
      "CONCURRENT_EXACT_BRANCH_REVIEW_REQUIRED",
      "CONCURRENT_EXACT_BRANCH_REVIEW_REQUIRED",
    ],
  );
  assert.deepEqual(
    new Set(projection.conflicts.map((entry) => entry.eventId)),
    new Set([actorA.eventId, actorB.eventId]),
  );
});

test("concurrent creates for one session are both held for review", async () => {
  const actorA = await makeEvent({
    actorId: "actor-a",
    actorSequence: 1,
    type: "session.created",
    sessionId: "same-session",
    expectedRevision: 0,
    minutes: 40,
  });
  const actorB = await makeEvent({
    actorId: "actor-b",
    actorSequence: 1,
    type: "session.created",
    sessionId: "same-session",
    expectedRevision: 0,
    minutes: 90,
  });
  const projection = await projectLedger(
    await mergeLedgers([actorB, actorA]),
    { profileId },
  );

  assert.equal(projection.totalMinutes, 0);
  assert.equal(projection.sessions.length, 0);
  assert.deepEqual(
    projection.conflicts.map((entry) => entry.reason),
    ["CONCURRENT_CREATE_REVIEW_REQUIRED", "CONCURRENT_CREATE_REVIEW_REQUIRED"],
  );
});

test("a concurrent exact edit and delete are both held for review", async () => {
  const created = await makeEvent({
    actorId: "seed",
    actorSequence: 1,
    type: "session.created",
    sessionId: "edit-delete",
    expectedRevision: 0,
    minutes: 50,
  });
  const edit = await makeEvent({
    actorId: "actor-a",
    actorSequence: 1,
    type: "session.minutes_set",
    sessionId: "edit-delete",
    expectedRevision: 1,
    parentEventId: created.eventId,
    minutes: 10,
  });
  const deletion = await makeEvent({
    actorId: "actor-b",
    actorSequence: 1,
    type: "session.deleted",
    sessionId: "edit-delete",
    expectedRevision: 1,
    parentEventId: created.eventId,
  });
  const projection = await projectLedger(
    await mergeLedgers([created], [edit], [deletion]),
    { profileId },
  );

  assert.equal(projection.totalMinutes, 50);
  assert.equal(projection.sessions[0].deleted, false);
  assert.deepEqual(
    projection.conflicts.map((entry) => entry.reason),
    [
      "CONCURRENT_EXACT_BRANCH_REVIEW_REQUIRED",
      "CONCURRENT_EXACT_BRANCH_REVIEW_REQUIRED",
    ],
  );
});

test("an exact revision fails closed after any later observation", async () => {
  const ledger = newLedger();
  const first = await makeEvent({
    actorSequence: 1,
    type: "session.created",
    sessionId: "first",
    expectedRevision: 0,
    minutes: 30,
  });
  await ledger.append(first);
  const revision = await captureRevision(ledger);
  assert.equal(
    (await projectLedger(ledger, { profileId, revision })).totalMinutes,
    30,
  );

  await ledger.append(
    await makeEvent({
      actorId: "actor-0",
      actorSequence: 1,
      logicalTime: 1,
      type: "session.created",
      sessionId: "later",
      expectedRevision: 0,
      minutes: 999,
    }),
  );
  await assert.rejects(
    projectLedger(ledger, { profileId, revision }),
    RangeError,
  );
});

test("revisions and merges are bound to one ledger profile epoch", async () => {
  const ledger = newLedger();
  const epochOneEvent = await makeEvent({
    actorSequence: 1,
    type: "session.created",
    sessionId: "epoch-bound",
    expectedRevision: 0,
    minutes: 30,
  });
  const epochTwoEvent = await makeEvent({
    actorSequence: 1,
    type: "session.created",
    sessionId: "epoch-bound",
    expectedRevision: 0,
    minutes: 30,
    eventProfileEpoch: "synthetic-epoch-2",
  });
  assert.notEqual(epochOneEvent.eventId, epochTwoEvent.eventId);
  await ledger.append(epochOneEvent);
  const revision = await captureRevision(ledger);
  const otherLedger = new AppendOnlyLedger({
    profileId,
    profileEpoch: "synthetic-epoch-2",
  });

  await assert.rejects(
    projectLedger(otherLedger, { profileId, revision }),
    RangeError,
  );
  await assert.rejects(
    unionMerge(ledgerIdentity, otherLedger),
    RangeError,
  );

  const replayTarget = await unionMerge(
    { profileId, profileEpoch: "synthetic-epoch-2" },
    [ledger.observations()[0]],
  );
  assert.equal(replayTarget.acceptedCount, 0);
  assert.equal(replayTarget.quarantine()[0].reason, "LEDGER_EPOCH_MISMATCH");
  assert.equal(
    (await projectLedger(replayTarget, { profileId })).totalMinutes,
    0,
  );
});

test("edits and deletes reverse minutes, XP, coins, and loot thresholds", async () => {
  const ledger = newLedger();
  const created = await makeEvent({
    actorSequence: 1,
    type: "session.created",
    sessionId: "rewarded",
    expectedRevision: 0,
    minutes: 130,
  });
  await ledger.append(created);
  const afterCreate = await projectLedger(ledger, { profileId });
  const edited = await makeEvent({
    actorSequence: 2,
    type: "session.minutes_set",
    sessionId: "rewarded",
    expectedRevision: 1,
    parentEventId: created.eventId,
    minutes: 35,
  });
  await ledger.append(edited);
  const afterEdit = await projectLedger(ledger, { profileId });
  const deleted = await makeEvent({
    actorSequence: 3,
    type: "session.deleted",
    sessionId: "rewarded",
    expectedRevision: 2,
    parentEventId: edited.eventId,
  });
  await ledger.append(deleted);

  const afterDelete = await projectLedger(ledger, { profileId });
  assert.deepEqual(
    [afterCreate.totalMinutes, afterCreate.rewards.xp, afterCreate.rewards.coins],
    [130, 165, 75],
  );
  assert.deepEqual(
    [afterEdit.totalMinutes, afterEdit.rewards.xp, afterEdit.rewards.coins],
    [35, 30, 10],
  );
  assert.deepEqual(
    [afterDelete.totalMinutes, afterDelete.rewards.xp, afterDelete.rewards.coins],
    [0, 0, 0],
  );
  assert.deepEqual(afterDelete.rewards.loot, []);
});

test("rewards are bound to one committed versioned policy", async () => {
  const ledger = newLedger();
  await ledger.append(
    await makeEvent({
      actorId: "reward-source",
      actorSequence: 1,
      type: "session.created",
      sessionId: "reward-policy",
      expectedRevision: 0,
      minutes: 60,
    }),
  );
  const revision = await captureRevision(ledger);
  const projection = await projectLedger(ledger, { profileId, revision });

  assert.equal(projection.rewards.xp, 75);
  assert.deepEqual(
    new Set(
      projection.rewards.receipts.map(
        (receipt) => receipt.rewardPolicyVersion,
      ),
    ),
    new Set([REWARD_POLICY_VERSION]),
  );
  await assert.rejects(
    projectLedger(ledger, {
      profileId,
      revision,
      rewardTiers: [
        {
          minutes: 1,
          xp: 999999,
          coins: 999999,
          loot: "caller-selected-loot",
        },
      ],
    }),
    TypeError,
  );

  const unsupportedLedger = newLedger();
  const unsupported = await makeEvent({
    actorId: "unsupported-policy",
    actorSequence: 1,
    type: "session.created",
    sessionId: "unsupported-policy",
    expectedRevision: 0,
    minutes: 60,
    rewardPolicyVersion: "caller-policy",
  });
  assert.equal(
    (await unsupportedLedger.append(unsupported)).reason,
    "REWARD_POLICY_UNSUPPORTED",
  );
});

test("aggregate focused minutes fail closed before integer precision loss", async () => {
  const events = await Promise.all([
    makeEvent({
      actorId: "large-a",
      actorSequence: 1,
      type: "session.created",
      sessionId: "large-a",
      expectedRevision: 0,
      minutes: Number.MAX_SAFE_INTEGER,
    }),
    makeEvent({
      actorId: "large-b",
      actorSequence: 1,
      type: "session.created",
      sessionId: "large-b",
      expectedRevision: 0,
      minutes: Number.MAX_SAFE_INTEGER,
    }),
    makeEvent({
      actorId: "large-c",
      actorSequence: 1,
      type: "session.created",
      sessionId: "large-c",
      expectedRevision: 0,
      minutes: 1,
    }),
  ]);
  const ledger = await mergeLedgers(events);

  await assert.rejects(
    projectLedger(ledger, { profileId }),
    /total focused minutes exceeds exact safe-integer accounting/,
  );
});

test("client, schema, writer protocol, and ledger versions are fenced", async () => {
  const candidates = await Promise.all([
    makeEvent({
      actorId: "legacy-client",
      actorSequence: 1,
      type: "session.created",
      sessionId: "a",
      expectedRevision: 0,
      minutes: 500,
      clientVersion: CURRENT_CLIENT_VERSION - 1,
    }),
    makeEvent({
      actorId: "future-client",
      actorSequence: 1,
      type: "session.created",
      sessionId: "b",
      expectedRevision: 0,
      minutes: 500,
      clientVersion: CURRENT_CLIENT_VERSION + 1,
    }),
    makeEvent({
      actorId: "legacy-schema",
      actorSequence: 1,
      type: "session.created",
      sessionId: "c",
      expectedRevision: 0,
      minutes: 500,
      schemaVersion: CURRENT_SCHEMA_VERSION - 1,
    }),
    makeEvent({
      actorId: "future-schema",
      actorSequence: 1,
      type: "session.created",
      sessionId: "d",
      expectedRevision: 0,
      minutes: 500,
      schemaVersion: CURRENT_SCHEMA_VERSION + 1,
    }),
    makeEvent({
      actorId: "legacy-writer",
      actorSequence: 1,
      type: "session.created",
      sessionId: "e",
      expectedRevision: 0,
      minutes: 500,
      writerProtocol: WRITER_PROTOCOL - 1,
    }),
    makeEvent({
      actorId: "legacy-ledger",
      actorSequence: 1,
      type: "session.created",
      sessionId: "f",
      expectedRevision: 0,
      minutes: 500,
      ledgerVersion: LEDGER_VERSION - 1,
    }),
  ]);
  const ledger = await mergeLedgers(candidates);
  assert.equal(ledger.acceptedCount, 0);
  const expectedReasons = [
    "CLIENT_TOO_OLD",
    "CLIENT_TOO_NEW",
    "SCHEMA_TOO_OLD",
    "SCHEMA_TOO_NEW",
    "WRITER_PROTOCOL_UNSUPPORTED",
    "LEDGER_VERSION_UNSUPPORTED",
  ];
  assert.deepEqual(ledger.quarantine().map((entry) => entry.reason).sort(), [
    ...expectedReasons,
  ].sort());
  for (let index = 0; index < candidates.length; index += 1) {
    const retry = await ledger.append(candidates[index]);
    assert.equal(retry.status, "quarantined");
    assert.equal(retry.reason, expectedReasons[index]);
  }
});
