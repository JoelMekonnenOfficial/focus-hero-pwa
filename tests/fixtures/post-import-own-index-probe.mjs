import {
  AppendOnlyLedger,
  REWARD_POLICY_VERSION,
  canonicalJson,
  captureRevision,
  createEvent,
  projectLedger,
  unionMerge,
} from "../../safety-ledger/browser-ledger.mjs";

const safeDefineProperty = Object.defineProperty;
const safeGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const safeDeleteProperty = Reflect.deleteProperty;
const safeHasOwn = Object.prototype.hasOwnProperty;
const safeReflectApply = Reflect.apply;

function restoreOwnDescriptor(target, property, descriptor) {
  if (descriptor === undefined) {
    safeDeleteProperty(target, property);
  } else {
    safeDefineProperty(target, property, descriptor);
  }
}

/*
 * Capturing Array.prototype.push is insufficient: native push still performs
 * ordinary [[Set]] and can invoke an inherited numeric setter. Authority
 * arrays must create every numeric index as an own data property.
 */
{
  const originalZero = safeGetOwnPropertyDescriptor(Array.prototype, "0");
  let inheritedGetterReads = 0;
  let inheritedSetterCalls = 0;
  safeDefineProperty(Array.prototype, "0", {
    get() {
      inheritedGetterReads += 1;
      return "INHERITED_ZERO";
    },
    set() {
      inheritedSetterCalls += 1;
      throw new Error("inherited Array.prototype[0] setter was invoked");
    },
    configurable: true,
    enumerable: false,
  });
  let canonical;
  try {
    canonical = canonicalJson(["expected-zero"]);
  } finally {
    restoreOwnDescriptor(Array.prototype, "0", originalZero);
  }
  if (
    canonical !== '["expected-zero"]' ||
    inheritedGetterReads !== 0 ||
    inheritedSetterCalls !== 0
  ) {
    throw new Error("inherited numeric accessors altered canonical arrays");
  }
}

/*
 * A sparse source must not inherit an event from Array.prototype. It is not an
 * event-bearing source unless every index is an own data property.
 */
{
  const profileId = "own-index-synthetic-profile";
  const profileEpoch = "own-index-synthetic-epoch";
  const identity = { profileId, profileEpoch };
  const inheritedEvent = await createEvent({
    profileId,
    profileEpoch,
    actorId: "inherited-writer",
    actorSequence: 1,
    logicalTime: 1,
    type: "session.created",
    payload: {
      sessionId: "inherited-session",
      expectedRevision: 0,
      parentEventId: null,
      rewardPolicyVersion: REWARD_POLICY_VERSION,
      minutes: 120,
    },
  });
  const sparseSource = new Array(1);
  const originalZero = safeGetOwnPropertyDescriptor(Array.prototype, "0");
  safeDefineProperty(Array.prototype, "0", {
    value: inheritedEvent,
    configurable: true,
    enumerable: false,
    writable: true,
  });
  let rejection;
  try {
    await unionMerge(identity, sparseSource);
  } catch (error) {
    rejection = error;
  } finally {
    restoreOwnDescriptor(Array.prototype, "0", originalZero);
  }
  if (
    safeReflectApply(safeHasOwn, sparseSource, ["0"]) ||
    !(rejection instanceof TypeError) ||
    !String(rejection.message).includes("must be an own data property")
  ) {
    throw new Error("sparse merge source was not rejected as inherited data");
  }

  const emptyLedger = new AppendOnlyLedger(identity);
  const emptyRevision = await captureRevision(emptyLedger);
  const emptyProjection = await projectLedger(emptyLedger, {
    profileId,
    revision: emptyRevision,
  });
  if (
    emptyRevision.eventCount !== 0 ||
    emptyProjection.totalMinutes !== 0 ||
    emptyProjection.rewards.xp !== 0 ||
    emptyProjection.rewards.coins !== 0 ||
    emptyProjection.rewards.loot.length !== 0
  ) {
    throw new Error("sparse-source rejection left non-empty authority state");
  }
}

process.stdout.write("post-import own-index probe passed\n");
