import assert from "node:assert/strict";
import test from "node:test";

import {
  createProtocolV2CasIntent,
  evaluateProtocolV2CloudWrite,
} from "../safety-ledger/cloud-write-gate.mjs";

const callerClaimedCapability = Object.freeze({
  adapterKind: "supabase-cloud-rev-cas",
  protocolVersion: 2,
  atomicCloudRevCas: true,
  immutableEventAppend: true,
  identityBound: true,
  migrationState: "ready",
});
const revisionDigest = "a".repeat(64);
const eventBatchDigest = "b".repeat(64);

test("JSONStorage protocol-v2 cloud writes are always disabled", () => {
  const decision = evaluateProtocolV2CloudWrite({
    ...callerClaimedCapability,
    adapterKind: "json-storage",
  });
  assert.deepEqual(decision, {
    allowed: false,
    code: "JSONSTORAGE_PROTOCOL_V2_WRITE_DISABLED",
    message: "Protocol-v2 cloud writes require atomic cloud_rev CAS",
  });
});

test("caller-asserted Supabase capability can never authorize writes", () => {
  const decision = evaluateProtocolV2CloudWrite(callerClaimedCapability);
  assert.deepEqual(decision, {
    allowed: false,
    code: "TRUSTED_ADAPTER_UNAVAILABLE",
    message: "No authenticated transactional cloud adapter is installed",
  });
});

test("ordinary object literals cannot manufacture a CAS intent", () => {
  assert.throws(
    () =>
      createProtocolV2CasIntent({
        capability: callerClaimedCapability,
        profileId: "caller-selected-profile",
        expectedCloudRev: 41,
        revisionDigest,
        eventBatchDigest,
      }),
    (error) => error.code === "TRUSTED_ADAPTER_UNAVAILABLE",
  );
});

test("a blocked adapter cannot manufacture a CAS intent", () => {
  assert.throws(
    () =>
      createProtocolV2CasIntent({
        capability: { adapterKind: "json-storage" },
        profileId: "synthetic-profile",
        expectedCloudRev: 0,
        revisionDigest,
        eventBatchDigest,
      }),
    (error) => error.code === "JSONSTORAGE_PROTOCOL_V2_WRITE_DISABLED",
  );
});

test("cloud_rev overflow is rejected before constructing an intent", () => {
  assert.throws(
    () =>
      createProtocolV2CasIntent({
        capability: callerClaimedCapability,
        profileId: "synthetic-profile",
        expectedCloudRev: Number.MAX_SAFE_INTEGER,
        revisionDigest,
        eventBatchDigest,
      }),
    TypeError,
  );
});

test("CAS intent digests require exact lowercase SHA-256 hex", () => {
  for (const [badRevisionDigest, badBatchDigest] of [
    ["a".repeat(63), eventBatchDigest],
    ["A".repeat(64), eventBatchDigest],
    [revisionDigest, "b".repeat(65)],
    [revisionDigest, "not-a-digest"],
  ]) {
    assert.throws(
      () =>
        createProtocolV2CasIntent({
          capability: callerClaimedCapability,
          profileId: "synthetic-profile",
          expectedCloudRev: 1,
          revisionDigest: badRevisionDigest,
          eventBatchDigest: badBatchDigest,
        }),
      TypeError,
    );
  }
});

test("post-import validation hooks cannot change the fail-closed cloud gate", () => {
  const defineProperty = Object.defineProperty;
  const getDescriptor = Object.getOwnPropertyDescriptor;
  const replacements = [
    [Object, "freeze"],
    [String.prototype, "trim"],
    [RegExp.prototype, "exec"],
    [Number, "isSafeInteger"],
  ];
  const originals = [];
  for (let index = 0; index < replacements.length; index += 1) {
    const [target, property] = replacements[index];
    originals[index] = getDescriptor(target, property);
  }
  const poisoned = function poisonedValidationHook() {
    throw new Error("post-import validation hook was invoked");
  };

  let decision;
  let rejection;
  try {
    for (let index = 0; index < replacements.length; index += 1) {
      const [target, property] = replacements[index];
      defineProperty(target, property, {
        ...originals[index],
        value: poisoned,
      });
    }
    decision = evaluateProtocolV2CloudWrite(callerClaimedCapability);
    try {
      createProtocolV2CasIntent({
        capability: callerClaimedCapability,
        profileId: "synthetic-profile",
        expectedCloudRev: 1,
        revisionDigest,
        eventBatchDigest,
      });
    } catch (error) {
      rejection = error;
    }
  } finally {
    for (let index = replacements.length - 1; index >= 0; index -= 1) {
      const [target, property] = replacements[index];
      defineProperty(target, property, originals[index]);
    }
  }

  assert.deepEqual(decision, {
    allowed: false,
    code: "TRUSTED_ADAPTER_UNAVAILABLE",
    message: "No authenticated transactional cloud adapter is installed",
  });
  assert.equal(Object.isFrozen(decision), true);
  assert.equal(rejection?.code, "TRUSTED_ADAPTER_UNAVAILABLE");
});
