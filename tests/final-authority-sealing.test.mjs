import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  AppendOnlyLedger,
  REWARD_POLICY_VERSION,
  canonicalJson,
  captureRevision,
  createEvent,
  projectLedger,
  sha256Hex,
  unionMerge,
} from "../safety-ledger/browser-ledger.mjs";

const profileId = "final-remediation-synthetic-profile";
const profileEpoch = "final-remediation-synthetic-epoch-a";
const identity = Object.freeze({ profileId, profileEpoch });
const execFileAsync = promisify(execFile);

async function makeCreate({
  actorId,
  actorSequence,
  sessionId,
  minutes,
  eventProfileEpoch = profileEpoch,
}) {
  return createEvent({
    profileId,
    profileEpoch: eventProfileEpoch,
    actorId,
    actorSequence,
    logicalTime: actorSequence,
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

async function recomputeUntrustedRevisionDigest(revision) {
  const forged = structuredClone(revision);
  const {
    authorityToken: _authorityToken,
    digest: _digest,
    ...body
  } = forged;
  forged.digest = await sha256Hex(canonicalJson(body));
  return forged;
}

test("instances reject own resolver and descriptor replacement", async () => {
  const observed = await makeCreate({
    actorId: "observed",
    actorSequence: 1,
    sessionId: "observed-session",
    minutes: 30,
  });
  const forged = await makeCreate({
    actorId: "forged",
    actorSequence: 1,
    sessionId: "forged-session",
    minutes: 120,
    eventProfileEpoch: "final-remediation-synthetic-epoch-b",
  });
  const ledger = new AppendOnlyLedger(identity);
  await ledger.append(observed);
  const revision = await captureRevision(ledger);

  assert.equal(Object.isExtensible(ledger), false);
  assert.throws(() => {
    ledger.resolveEventReference = () => forged;
  }, TypeError);
  assert.throws(() => {
    ledger.exactStateDescriptor = () => ({
      profileId,
      profileEpoch,
      observations: [],
      acceptedEventRefs: [],
      quarantine: [],
    });
  }, TypeError);
  assert.throws(
    () =>
      Object.defineProperty(ledger, "resolveEventReference", {
        value: () => forged,
      }),
    TypeError,
  );

  const projection = await projectLedger(ledger, { profileId, revision });
  assert.equal(projection.totalMinutes, 30);
  assert.equal(projection.sessions[0].lastEventId, observed.eventId);
  assert.equal(projection.rewards.xp, 30);
});

test("prototype replacement and prototype changes are blocked", async () => {
  const ledger = new AppendOnlyLedger(identity);

  assert.equal(Object.isFrozen(AppendOnlyLedger.prototype), true);
  assert.equal(Object.isFrozen(AppendOnlyLedger), true);
  assert.throws(
    () =>
      Object.defineProperty(
        AppendOnlyLedger.prototype,
        "resolveEventReference",
        { value: () => null },
      ),
    TypeError,
  );
  assert.throws(
    () =>
      Object.defineProperty(
        AppendOnlyLedger.prototype,
        "exactStateDescriptor",
        { value: () => null },
      ),
    TypeError,
  );
  assert.throws(() => Object.setPrototypeOf(ledger, {}), TypeError);
});

test("subclasses, proxies, and prototype lookalikes fail exact authority checks", async () => {
  class OverridingLedger extends AppendOnlyLedger {
    resolveEventReference() {
      throw new Error("subclass resolver must never run");
    }

    exactStateDescriptor() {
      throw new Error("subclass descriptor must never run");
    }
  }

  const subclass = new OverridingLedger(identity);
  const exact = new AppendOnlyLedger(identity);
  const proxied = new Proxy(exact, {});
  const lookalike = Object.create(AppendOnlyLedger.prototype);

  await assert.rejects(
    captureRevision(subclass),
    /requires an exact AppendOnlyLedger instance/,
  );
  await assert.rejects(
    projectLedger(subclass, { profileId }),
    /requires an exact AppendOnlyLedger instance/,
  );
  await assert.rejects(
    unionMerge(identity, subclass),
    /requires an exact AppendOnlyLedger instance/,
  );
  await assert.rejects(
    captureRevision(proxied),
    /requires an exact AppendOnlyLedger instance/,
  );
  await assert.rejects(
    captureRevision(lookalike),
    /requires an exact AppendOnlyLedger instance/,
  );
});

test("cross-epoch observations cannot reach projection", async () => {
  const epochB = await makeCreate({
    actorId: "epoch-b",
    actorSequence: 1,
    sessionId: "cross-epoch",
    minutes: 120,
    eventProfileEpoch: "final-remediation-synthetic-epoch-b",
  });
  const ledger = await unionMerge(identity, [epochB]);

  assert.equal(ledger.acceptedCount, 0);
  assert.deepEqual(
    ledger.quarantine().map((entry) => entry.reason),
    ["LEDGER_EPOCH_MISMATCH"],
  );
  const projection = await projectLedger(ledger, { profileId });
  assert.equal(projection.totalMinutes, 0);
  assert.equal(projection.rewards.xp, 0);
});

test("manifest event-ID/content-hash mismatches are rejected", async () => {
  const first = await makeCreate({
    actorId: "first",
    actorSequence: 1,
    sessionId: "first",
    minutes: 30,
  });
  const second = await makeCreate({
    actorId: "second",
    actorSequence: 1,
    sessionId: "second",
    minutes: 60,
  });
  const ledger = await unionMerge(identity, [first, second]);
  const revision = await captureRevision(ledger);
  const [firstRef, secondRef] = revision.acceptedEventRefs;

  assert.throws(
    () =>
      ledger.resolveEventReference({
        eventId: firstRef.eventId,
        contentHash: secondRef.contentHash,
      }),
    RangeError,
  );

  const forged = structuredClone(revision);
  forged.acceptedEventRefs[0].contentHash = secondRef.contentHash;
  const forgedWithDigest = await recomputeUntrustedRevisionDigest(forged);
  await assert.rejects(
    projectLedger(ledger, {
      profileId,
      revision: forgedWithDigest,
    }),
    /revision is not an exact ledger-issued manifest/,
  );
});

test("capture remains bound to private state after failed descriptor override", async () => {
  const observed = await makeCreate({
    actorId: "descriptor",
    actorSequence: 1,
    sessionId: "descriptor",
    minutes: 60,
  });
  const ledger = new AppendOnlyLedger(identity);
  await ledger.append(observed);

  assert.throws(
    () =>
      Object.defineProperty(ledger, "exactStateDescriptor", {
        value: () => ({
          profileId,
          profileEpoch,
          observations: [],
          acceptedEventRefs: [],
          quarantine: [],
        }),
      }),
    TypeError,
  );

  const revision = await captureRevision(ledger);
  assert.equal(revision.eventCount, 1);
  assert.equal(revision.acceptedEventRefs[0].eventId, observed.eventId);
  assert.equal(
    (await projectLedger(ledger, { profileId, revision })).totalMinutes,
    60,
  );
});

test("named post-import collection replacements cannot alter authority", async () => {
  const probePath = fileURLToPath(
    new URL("./fixtures/post-import-intrinsic-replacement-probe.mjs", import.meta.url),
  );
  const { stdout, stderr } = await execFileAsync(process.execPath, [probePath], {
    windowsHide: true,
    timeout: 20_000,
  });
  assert.equal(stderr, "");
  assert.match(stdout, /post-import named intrinsic replacement probe passed/);
});

test("inherited JSON, Array species, and RegExp exec hooks cannot alter authority", async () => {
  const probePath = fileURLToPath(
    new URL("./fixtures/post-import-secondary-hook-probe.mjs", import.meta.url),
  );
  const { stdout, stderr } = await execFileAsync(process.execPath, [probePath], {
    windowsHide: true,
    timeout: 20_000,
  });
  assert.equal(stderr, "");
  assert.match(stdout, /post-import secondary hook probe passed/);
});

test("post-import Promise methods and species cannot alter async authority", async () => {
  const probePath = fileURLToPath(
    new URL("./fixtures/post-import-promise-hook-probe.cjs", import.meta.url),
  );
  const { stdout, stderr } = await execFileAsync(process.execPath, [probePath], {
    windowsHide: true,
    timeout: 20_000,
  });
  assert.equal(stderr, "");
  assert.match(stdout, /post-import Promise hook probe passed/);
});

test("inherited array indices cannot alter canonicalization or supply sparse events", async () => {
  const probePath = fileURLToPath(
    new URL("./fixtures/post-import-own-index-probe.mjs", import.meta.url),
  );
  const { stdout, stderr } = await execFileAsync(process.execPath, [probePath], {
    windowsHide: true,
    timeout: 20_000,
  });
  assert.equal(stderr, "");
  assert.match(stdout, /post-import own-index probe passed/);
});

test("inherited Object.prototype.then cannot alter async authority", async () => {
  const probePath = fileURLToPath(
    new URL("./fixtures/post-import-object-then-probe.cjs", import.meta.url),
  );
  const { stdout, stderr } = await execFileAsync(process.execPath, [probePath], {
    windowsHide: true,
    timeout: 20_000,
  });
  assert.equal(stderr, "");
  assert.match(stdout, /post-import Object\.prototype\.then probe passed/);
});
