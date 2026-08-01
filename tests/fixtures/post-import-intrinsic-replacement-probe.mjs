import {
  AppendOnlyLedger,
  REWARD_POLICY_VERSION,
  captureRevision,
  createEvent,
  projectLedger,
} from "../../safety-ledger/browser-ledger.mjs";

/*
 * Capture the fixture's restoration tools before installing hostile
 * replacements. The ledger module was imported first and must rely only on its
 * own clean initialization snapshots after this point.
 */
const safeDefineProperty = Object.defineProperty;
const safeGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const safeString = String;

const poisonedIntrinsic = function poisonedIntrinsic() {
  throw new Error("post-import intrinsic replacement was invoked");
};

const targets = [
  [Reflect, "apply", "value"],
  [Object, "getPrototypeOf", "value"],
  [Array, "isArray", "value"],
  [Array.prototype, "map", "value"],
  [Array.prototype, "filter", "value"],
  [Array.prototype, "forEach", "value"],
  [Array.prototype, "sort", "value"],
  [Array.prototype, "every", "value"],
  [Array.prototype, "some", "value"],
  [Array.prototype, "reduce", "value"],
  [Array.prototype, "join", "value"],
  [Array.prototype, "push", "value"],
  [Map.prototype, "get", "value"],
  [Map.prototype, "set", "value"],
  [Map.prototype, "has", "value"],
  [Map.prototype, "delete", "value"],
  [Map.prototype, "clear", "value"],
  [Map.prototype, "forEach", "value"],
  [Map.prototype, "size", "get"],
  [Set.prototype, "add", "value"],
  [Set.prototype, "has", "value"],
  [Set.prototype, "forEach", "value"],
  [Set.prototype, "size", "get"],
  [WeakMap.prototype, "get", "value"],
  [WeakMap.prototype, "set", "value"],
  [WeakSet.prototype, "add", "value"],
  [WeakSet.prototype, "has", "value"],
  [globalThis, "Array", "value"],
  [globalThis, "Map", "value"],
  [globalThis, "Set", "value"],
  [globalThis, "WeakMap", "value"],
  [globalThis, "WeakSet", "value"],
];

const originals = [];
for (let index = 0; index < targets.length; index += 1) {
  const target = targets[index];
  originals[index] = safeGetOwnPropertyDescriptor(target[0], target[1]);
}

function installPoison(target, property, kind, original) {
  const replacement = {
    configurable: original.configurable,
    enumerable: original.enumerable,
  };
  if (kind === "get") {
    replacement.get = poisonedIntrinsic;
    replacement.set = original.set;
  } else {
    replacement.value = poisonedIntrinsic;
    replacement.writable = original.writable;
  }
  safeDefineProperty(target, property, replacement);
}

const profileId = "intrinsic-replacement-synthetic-profile";
const profileEpoch = "intrinsic-replacement-synthetic-epoch";
const identity = { profileId, profileEpoch };

try {
  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index];
    installPoison(target[0], target[1], target[2], originals[index]);
  }

  const ledger = new AppendOnlyLedger(identity);
  const created = await createEvent({
    profileId,
    profileEpoch,
    actorId: "writer-a",
    actorSequence: 1,
    logicalTime: 1,
    type: "session.created",
    payload: {
      sessionId: "session-a",
      expectedRevision: 0,
      parentEventId: null,
      rewardPolicyVersion: REWARD_POLICY_VERSION,
      minutes: 120,
    },
  });
  const edited = await createEvent({
    profileId,
    profileEpoch,
    actorId: "writer-a",
    actorSequence: 2,
    logicalTime: 2,
    type: "session.minutes_set",
    payload: {
      sessionId: "session-a",
      expectedRevision: 1,
      parentEventId: created.eventId,
      minutes: 60,
    },
  });
  const deleted = await createEvent({
    profileId,
    profileEpoch,
    actorId: "writer-a",
    actorSequence: 3,
    logicalTime: 3,
    type: "session.deleted",
    payload: {
      sessionId: "session-a",
      expectedRevision: 2,
      parentEventId: edited.eventId,
    },
  });
  await ledger.append(created);
  await ledger.append(edited);
  await ledger.append(deleted);
  const revision = await captureRevision(ledger);
  const projection = await projectLedger(ledger, { profileId, revision });
  if (
    revision.eventCount !== 3 ||
    projection.totalMinutes !== 0 ||
    projection.sessions.length !== 1 ||
    projection.sessions[0].deleted !== true ||
    projection.rewards.xp !== 0 ||
    projection.rewards.coins !== 0 ||
    projection.rewards.loot.length !== 0
  ) {
    throw new Error("captured collection intrinsics produced a wrong projection");
  }

  const emptyLedger = new AppendOnlyLedger(identity);
  const emptyRevision = await captureRevision(emptyLedger);
  const emptyProjection = await projectLedger(emptyLedger, {
    profileId,
    revision: emptyRevision,
  });
  if (
    emptyRevision.eventCount !== 0 ||
    emptyRevision.observationCount !== 0 ||
    emptyProjection.totalMinutes !== 0 ||
    emptyProjection.sessions.length !== 0 ||
    emptyProjection.rewards.xp !== 0 ||
    emptyProjection.rewards.coins !== 0 ||
    emptyProjection.rewards.loot.length !== 0
  ) {
    throw new Error("post-import replacements forged empty-ledger authority");
  }

  class DerivedLedger extends AppendOnlyLedger {}
  const derived = new DerivedLedger(identity);
  let derivedRejected = false;
  try {
    await captureRevision(derived);
  } catch (error) {
    const message = safeString(error?.message ?? error);
    derivedRejected =
      message === "captureRevision requires an exact AppendOnlyLedger instance";
  }
  if (!derivedRejected) {
    throw new Error("post-import replacements admitted a ledger subclass");
  }

  const collisionLedger = new AppendOnlyLedger(identity);
  const collisionA = await createEvent({
    profileId,
    profileEpoch,
    actorId: "collision-writer",
    actorSequence: 1,
    logicalTime: 10,
    type: "session.created",
    payload: {
      sessionId: "collision-a",
      expectedRevision: 0,
      parentEventId: null,
      rewardPolicyVersion: REWARD_POLICY_VERSION,
      minutes: 30,
    },
  });
  const collisionB = await createEvent({
    profileId,
    profileEpoch,
    actorId: "collision-writer",
    actorSequence: 1,
    logicalTime: 11,
    type: "session.created",
    payload: {
      sessionId: "collision-b",
      expectedRevision: 0,
      parentEventId: null,
      rewardPolicyVersion: REWARD_POLICY_VERSION,
      minutes: 60,
    },
  });
  await collisionLedger.append(collisionA);
  await collisionLedger.append(collisionB);
  const collisionRevision = await captureRevision(collisionLedger);
  if (
    collisionRevision.eventCount !== 0 ||
    collisionRevision.acceptedEventRefs.length !== 0 ||
    collisionRevision.quarantine.length !== 2 ||
    collisionRevision.quarantine[0].reason !== "ACTOR_SEQUENCE_COLLISION" ||
    collisionRevision.quarantine[1].reason !== "ACTOR_SEQUENCE_COLLISION"
  ) {
    throw new Error("captured Set/Map intrinsics failed collision quarantine");
  }
} finally {
  for (let index = targets.length - 1; index >= 0; index -= 1) {
    const target = targets[index];
    safeDefineProperty(target[0], target[1], originals[index]);
  }
}

process.stdout.write(
  "post-import named intrinsic replacement probe passed\n",
);
