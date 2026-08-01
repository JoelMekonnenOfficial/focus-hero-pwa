import {
  AppendOnlyLedger,
  REWARD_POLICY_VERSION,
  captureRevision,
  createEvent,
  projectLedger,
} from "../../safety-ledger/browser-ledger.mjs";

const safeDefineProperty = Object.defineProperty;
const safeGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const safeDeleteProperty = Reflect.deleteProperty;

function restoreOwnDescriptor(target, property, descriptor) {
  if (descriptor === undefined) {
    safeDeleteProperty(target, property);
  } else {
    safeDefineProperty(target, property, descriptor);
  }
}

function makeCreatedEvent({
  profileId,
  profileEpoch,
  sessionId,
  minutes,
  actorId,
  logicalTime,
}) {
  return createEvent({
    profileId,
    profileEpoch,
    actorId,
    actorSequence: 1,
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

/*
 * A queued append must preserve the synchronous invocation snapshot even when
 * an inherited toJSON hook is installed before its asynchronous work begins.
 */
{
  const profileId = "tojson-hook-synthetic-profile";
  const profileEpoch = "tojson-hook-synthetic-epoch";
  const ledger = new AppendOnlyLedger({ profileId, profileEpoch });
  const eventA = await makeCreatedEvent({
    profileId,
    profileEpoch,
    sessionId: "snapshot-a",
    minutes: 30,
    actorId: "snapshot-writer-a",
    logicalTime: 1,
  });
  const eventB = await makeCreatedEvent({
    profileId,
    profileEpoch,
    sessionId: "snapshot-b",
    minutes: 120,
    actorId: "snapshot-writer-b",
    logicalTime: 2,
  });
  const originalToJson = safeGetOwnPropertyDescriptor(
    Object.prototype,
    "toJSON",
  );
  const pending = ledger.append(eventA);
  safeDefineProperty(Object.prototype, "toJSON", {
    value() {
      return eventB;
    },
    configurable: true,
    enumerable: false,
    writable: true,
  });
  let appendResult;
  try {
    appendResult = await pending;
  } finally {
    restoreOwnDescriptor(Object.prototype, "toJSON", originalToJson);
  }
  const revision = await captureRevision(ledger);
  const projection = await projectLedger(ledger, { profileId, revision });
  if (
    appendResult.eventId !== eventA.eventId ||
    revision.acceptedEventRefs[0].eventId !== eventA.eventId ||
    projection.totalMinutes !== 30 ||
    projection.sessions.length !== 1 ||
    projection.sessions[0].sessionId !== "snapshot-a"
  ) {
    throw new Error("inherited Object.prototype.toJSON changed a queued event");
  }
}

/*
 * Authority arrays must never consult Array[Symbol.species]. A throwing
 * species constructor makes any species-sensitive map/filter path fail.
 */
{
  const originalArraySpecies = safeGetOwnPropertyDescriptor(
    Array,
    Symbol.species,
  );
  let speciesReads = 0;
  safeDefineProperty(Array, Symbol.species, {
    get() {
      speciesReads += 1;
      return function poisonedArraySpecies() {
        throw new Error("Array species constructor was invoked");
      };
    },
    configurable: true,
    enumerable: false,
  });
  try {
    const profileId = "array-species-synthetic-profile";
    const profileEpoch = "array-species-synthetic-epoch";
    const ledger = new AppendOnlyLedger({ profileId, profileEpoch });
    const event = await makeCreatedEvent({
      profileId,
      profileEpoch,
      sessionId: "species-session",
      minutes: 120,
      actorId: "species-writer",
      logicalTime: 1,
    });
    await ledger.append(event);
    const revision = await captureRevision(ledger);
    const projection = await projectLedger(ledger, { profileId, revision });
    if (
      projection.totalMinutes !== 120 ||
      projection.sessions.length !== 1 ||
      projection.rewards.xp !== 165 ||
      projection.rewards.coins !== 75 ||
      projection.rewards.loot.length !== 3 ||
      speciesReads !== 0
    ) {
      throw new Error("Array species affected authority or reward projection");
    }
  } finally {
    restoreOwnDescriptor(Array, Symbol.species, originalArraySpecies);
  }
}

/*
 * SHA-256 envelope validation is character-by-character and must not invoke
 * RegExp.prototype.exec through test().
 */
{
  const originalExec = safeGetOwnPropertyDescriptor(RegExp.prototype, "exec");
  let execCalls = 0;
  safeDefineProperty(RegExp.prototype, "exec", {
    value() {
      execCalls += 1;
      throw new Error("RegExp.prototype.exec was invoked");
    },
    configurable: originalExec.configurable,
    enumerable: originalExec.enumerable,
    writable: originalExec.writable,
  });
  try {
    const profileId = "regexp-hook-synthetic-profile";
    const profileEpoch = "regexp-hook-synthetic-epoch";
    const ledger = new AppendOnlyLedger({ profileId, profileEpoch });
    const event = await makeCreatedEvent({
      profileId,
      profileEpoch,
      sessionId: "regexp-session",
      minutes: 60,
      actorId: "regexp-writer",
      logicalTime: 1,
    });
    await ledger.append(event);
    const revision = await captureRevision(ledger);
    const projection = await projectLedger(ledger, { profileId, revision });
    if (
      projection.totalMinutes !== 60 ||
      revision.acceptedEventRefs.length !== 1 ||
      execCalls !== 0
    ) {
      throw new Error("RegExp hooks affected digest validation");
    }
  } finally {
    restoreOwnDescriptor(RegExp.prototype, "exec", originalExec);
  }
}

process.stdout.write("post-import secondary hook probe passed\n");
