"use strict";

/*
 * CommonJS loads the ESM component before installing Object.prototype.then.
 * This keeps the loader's own module-evaluation promise outside the hostile
 * phase while exercising every ledger-owned async object value inside it.
 */
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const safeReflectApply = Reflect.apply;
const safeDefineProperty = Object.defineProperty;
const safeGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const safeDeleteProperty = Reflect.deleteProperty;
const safePromiseThen = Promise.prototype.then;

const modulePath = path.join(
  __dirname,
  "..",
  "..",
  "safety-ledger",
  "browser-ledger.mjs",
);
const moduleLoad = import(pathToFileURL(modulePath).href);
safeReflectApply(safePromiseThen, moduleLoad, [runProbe, failImport]);

function failImport(error) {
  process.stderr.write(`${error?.stack ?? error}\n`);
  process.exitCode = 1;
}

function runProbe(ledgerModule) {
  const originalThen = safeGetOwnPropertyDescriptor(
    Object.prototype,
    "then",
  );
  let inheritedThenCalls = 0;
  let finished = false;
  const watchdog = setTimeout(() => {
    finish(new Error("post-import Object.prototype.then probe timed out"));
  }, 10_000);

  function restore() {
    if (originalThen === undefined) {
      safeDeleteProperty(Object.prototype, "then");
    } else {
      safeDefineProperty(Object.prototype, "then", originalThen);
    }
  }

  function finish(error = null) {
    if (finished) return;
    finished = true;
    restore();
    clearTimeout(watchdog);
    if (error) {
      process.stderr.write(`${error?.stack ?? error}\n`);
      process.exitCode = 1;
      return;
    }
    process.stdout.write("post-import Object.prototype.then probe passed\n");
  }

  function assertSafeAsyncValue(value, label) {
    if (value === null || typeof value !== "object") {
      throw new Error(`${label} did not resolve to an object`);
    }
    const descriptor = safeGetOwnPropertyDescriptor(value, "then");
    if (
      !descriptor ||
      descriptor.value !== undefined ||
      descriptor.enumerable !== false ||
      descriptor.configurable !== false ||
      descriptor.writable !== false
    ) {
      throw new Error(`${label} lacked a sealed non-thenable own property`);
    }
  }

  function observe(promise, onFulfilled) {
    try {
      const ownThen = safeGetOwnPropertyDescriptor(promise, "then");
      if (!ownThen || typeof ownThen.value !== "function") {
        throw new Error("ledger promise lacked its sealed own then method");
      }
      safeReflectApply(ownThen.value, promise, [
        (value) => {
          try {
            onFulfilled(value);
          } catch (error) {
            finish(error);
          }
        },
        finish,
      ]);
    } catch (error) {
      finish(error);
    }
  }

  try {
    safeDefineProperty(Object.prototype, "then", {
      value(resolve) {
        inheritedThenCalls += 1;
        resolve("POISONED_OBJECT_THEN");
      },
      configurable: true,
      enumerable: false,
      writable: true,
    });

    const profileId = "object-then-synthetic-profile";
    const profileEpoch = "object-then-synthetic-epoch";
    const identity = { profileId, profileEpoch };
    observe(
      ledgerModule.createEvent({
        profileId,
        profileEpoch,
        actorId: "object-then-writer",
        actorSequence: 1,
        logicalTime: 1,
        type: "session.created",
        payload: {
          sessionId: "object-then-session",
          expectedRevision: 0,
          parentEventId: null,
          rewardPolicyVersion: ledgerModule.REWARD_POLICY_VERSION,
          minutes: 60,
        },
      }),
      (event) => {
        assertSafeAsyncValue(event, "createEvent");
        const ledger = new ledgerModule.AppendOnlyLedger(identity);
        assertSafeAsyncValue(ledger, "AppendOnlyLedger");
        observe(ledger.append(event), (appendResult) => {
          assertSafeAsyncValue(appendResult, "append");
          if (appendResult.status !== "appended") {
            throw new Error("Object.prototype.then append did not commit");
          }
          observe(ledgerModule.captureRevision(ledger), (revision) => {
            assertSafeAsyncValue(revision, "captureRevision");
            observe(
              ledgerModule.projectLedger(ledger, {
                profileId,
                revision,
              }),
              (projection) => {
                assertSafeAsyncValue(projection, "projectLedger");
                if (
                  projection.totalMinutes !== 60 ||
                  projection.rewards.xp !== 75 ||
                  projection.rewards.coins !== 30 ||
                  projection.rewards.loot.length !== 2
                ) {
                  throw new Error(
                    "Object.prototype.then altered ledger projection",
                  );
                }
                observe(ledgerModule.unionMerge(identity, [event]), (merged) => {
                  assertSafeAsyncValue(merged, "unionMerge");
                  if (merged.acceptedCount !== 1 || inheritedThenCalls !== 0) {
                    throw new Error(
                      "inherited Object.prototype.then reached async authority",
                    );
                  }
                  finish();
                });
              },
            );
          });
        });
      },
    );
  } catch (error) {
    finish(error);
  }
}
