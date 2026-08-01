"use strict";

/*
 * CommonJS is intentional: Node's ESM loader itself awaits the module
 * evaluation promise. Running the hostile Promise phase only after a dynamic
 * import has completed isolates the ledger from loader-owned promises.
 */
const safeReflectApply = Reflect.apply;
const safeDefineProperty = Object.defineProperty;
const safeGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const safeObjectIsExtensible = Object.isExtensible;
const intrinsicPromise = Promise;
const safePromiseThen = Promise.prototype.then;

function restoreOwnDescriptor(target, property, descriptor) {
  safeDefineProperty(target, property, descriptor);
}

const moduleLoad = import("../../safety-ledger/browser-ledger.mjs");
safeReflectApply(safePromiseThen, moduleLoad, [runProbe, failImport]);

function failImport(error) {
  process.stderr.write(`${error?.stack ?? error}\n`);
  process.exitCode = 1;
}

function runProbe(ledgerModule) {
  const originals = {
    resolve: safeGetOwnPropertyDescriptor(intrinsicPromise, "resolve"),
    reject: safeGetOwnPropertyDescriptor(intrinsicPromise, "reject"),
    species: safeGetOwnPropertyDescriptor(
      intrinsicPromise,
      Symbol.species,
    ),
    then: safeGetOwnPropertyDescriptor(intrinsicPromise.prototype, "then"),
    catch: safeGetOwnPropertyDescriptor(intrinsicPromise.prototype, "catch"),
    finally: safeGetOwnPropertyDescriptor(
      intrinsicPromise.prototype,
      "finally",
    ),
    constructor: safeGetOwnPropertyDescriptor(
      intrinsicPromise.prototype,
      "constructor",
    ),
  };

  function isSealedLedgerPromise(value) {
    if (value === null || typeof value !== "object") return false;
    const ownThen = safeGetOwnPropertyDescriptor(value, "then");
    const ownCatch = safeGetOwnPropertyDescriptor(value, "catch");
    const ownFinally = safeGetOwnPropertyDescriptor(value, "finally");
    const ownConstructor = safeGetOwnPropertyDescriptor(value, "constructor");
    return Boolean(
      ownThen &&
      typeof ownThen.value === "function" &&
      ownThen.value !== intrinsicPromise.prototype.then &&
      ownThen.configurable === false &&
      ownThen.writable === false &&
      ownCatch &&
      typeof ownCatch.value === "function" &&
      ownCatch.value !== intrinsicPromise.prototype.catch &&
      ownCatch.configurable === false &&
      ownCatch.writable === false &&
      ownFinally &&
      typeof ownFinally.value === "function" &&
      ownFinally.value !== intrinsicPromise.prototype.finally &&
      ownFinally.configurable === false &&
      ownFinally.writable === false &&
      ownConstructor &&
      ownConstructor.value?.[Symbol.species] === intrinsicPromise &&
      ownConstructor.configurable === false &&
      ownConstructor.writable === false &&
      !safeObjectIsExtensible(value),
    );
  }

  function guardedPrototypeMethod(label, original) {
    return function guardedPromisePrototypeMethod(...args) {
      if (isSealedLedgerPromise(this)) {
        throw new Error(
          `ledger dynamically invoked replaced ${label}`,
        );
      }
      return safeReflectApply(original, this, args);
    };
  }

  let promiseSpeciesReads = 0;
  let inheritedConstructorSpeciesReads = 0;
  const replacementConstructorRecord = {};
  safeDefineProperty(replacementConstructorRecord, Symbol.species, {
    get() {
      inheritedConstructorSpeciesReads += 1;
      return intrinsicPromise;
    },
    configurable: false,
    enumerable: false,
  });
  const replacementThen = guardedPrototypeMethod(
    "Promise.prototype.then",
    originals.then.value,
  );
  const replacementCatch = guardedPrototypeMethod(
    "Promise.prototype.catch",
    originals.catch.value,
  );
  const replacementFinally = guardedPrototypeMethod(
    "Promise.prototype.finally",
    originals.finally.value,
  );
  const replacementResolve = function replacementPromiseResolve(value) {
    return safeReflectApply(originals.resolve.value, this, [value]);
  };
  const replacementReject = function replacementPromiseReject(reason) {
    return safeReflectApply(originals.reject.value, this, [reason]);
  };

  let finished = false;
  const watchdog = setTimeout(() => {
    finish(new Error("post-import Promise hook probe timed out"));
  }, 10_000);

  function restore() {
    restoreOwnDescriptor(
      intrinsicPromise.prototype,
      "constructor",
      originals.constructor,
    );
    restoreOwnDescriptor(
      intrinsicPromise.prototype,
      "finally",
      originals.finally,
    );
    restoreOwnDescriptor(
      intrinsicPromise.prototype,
      "catch",
      originals.catch,
    );
    restoreOwnDescriptor(intrinsicPromise.prototype, "then", originals.then);
    restoreOwnDescriptor(intrinsicPromise, Symbol.species, originals.species);
    restoreOwnDescriptor(intrinsicPromise, "reject", originals.reject);
    restoreOwnDescriptor(intrinsicPromise, "resolve", originals.resolve);
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
    process.stdout.write("post-import Promise hook probe passed\n");
  }

  function observeLedgerPromise(promise, onFulfilled) {
    try {
      const ownThen = safeGetOwnPropertyDescriptor(promise, "then");
      const ownCatch = safeGetOwnPropertyDescriptor(promise, "catch");
      const ownFinally = safeGetOwnPropertyDescriptor(promise, "finally");
      const ownConstructor = safeGetOwnPropertyDescriptor(
        promise,
        "constructor",
      );
      if (
        !ownThen ||
        typeof ownThen.value !== "function" ||
        ownThen.value === replacementThen ||
        ownThen.configurable !== false ||
        ownThen.writable !== false ||
        !ownCatch ||
        typeof ownCatch.value !== "function" ||
        ownCatch.value === replacementCatch ||
        ownCatch.configurable !== false ||
        ownCatch.writable !== false ||
        !ownFinally ||
        typeof ownFinally.value !== "function" ||
        ownFinally.value === replacementFinally ||
        ownFinally.configurable !== false ||
        ownFinally.writable !== false ||
        !ownConstructor ||
        ownConstructor.configurable !== false ||
        ownConstructor.writable !== false ||
        ownConstructor.value[Symbol.species] !== intrinsicPromise ||
        safeObjectIsExtensible(promise)
      ) {
        throw new Error("ledger promise is not sealed against Promise hooks");
      }
      const promiseSpeciesReadsBefore = promiseSpeciesReads;
      const inheritedSpeciesReadsBefore = inheritedConstructorSpeciesReads;
      const thenChain = safeReflectApply(ownThen.value, promise, [
        (value) => value,
      ]);
      const catchChain = safeReflectApply(ownCatch.value, promise, [
        (error) => {
          throw error;
        },
      ]);
      const finallyChain = safeReflectApply(ownFinally.value, promise, [
        () => undefined,
      ]);
      if (
        !isSealedLedgerPromise(thenChain) ||
        !isSealedLedgerPromise(catchChain) ||
        !isSealedLedgerPromise(finallyChain)
      ) {
        throw new Error("ledger Promise chains were not recursively sealed");
      }
      const observedThen = safeGetOwnPropertyDescriptor(
        finallyChain,
        "then",
      ).value;
      safeReflectApply(observedThen, finallyChain, [
        (value) => {
          try {
            onFulfilled(value);
          } catch (error) {
            finish(error);
          }
        },
        finish,
      ]);
      if (
        promiseSpeciesReads !== promiseSpeciesReadsBefore ||
        inheritedConstructorSpeciesReads !== inheritedSpeciesReadsBefore
      ) {
        throw new Error(
          "sealed ledger promise consulted a replaced Promise species hook",
        );
      }
    } catch (error) {
      finish(error);
    }
  }

  try {
    safeDefineProperty(intrinsicPromise, "resolve", {
      ...originals.resolve,
      value: replacementResolve,
    });
    safeDefineProperty(intrinsicPromise, "reject", {
      ...originals.reject,
      value: replacementReject,
    });
    safeDefineProperty(intrinsicPromise, Symbol.species, {
      get() {
        promiseSpeciesReads += 1;
        return intrinsicPromise;
      },
      configurable: originals.species.configurable,
      enumerable: originals.species.enumerable,
    });
    safeDefineProperty(intrinsicPromise.prototype, "then", {
      ...originals.then,
      value: replacementThen,
    });
    safeDefineProperty(intrinsicPromise.prototype, "catch", {
      ...originals.catch,
      value: replacementCatch,
    });
    safeDefineProperty(intrinsicPromise.prototype, "finally", {
      ...originals.finally,
      value: replacementFinally,
    });
    safeDefineProperty(intrinsicPromise.prototype, "constructor", {
      ...originals.constructor,
      value: replacementConstructorRecord,
    });

    const profileId = "promise-hook-synthetic-profile";
    const profileEpoch = "promise-hook-synthetic-epoch";
    const ledger = new ledgerModule.AppendOnlyLedger({
      profileId,
      profileEpoch,
    });
    observeLedgerPromise(
      ledgerModule.createEvent({
        profileId,
        profileEpoch,
        actorId: "promise-writer",
        actorSequence: 1,
        logicalTime: 1,
        type: "session.created",
        payload: {
          sessionId: "promise-session",
          expectedRevision: 0,
          parentEventId: null,
          rewardPolicyVersion: ledgerModule.REWARD_POLICY_VERSION,
          minutes: 60,
        },
      }),
      (event) => {
        observeLedgerPromise(ledger.append(event), (appendResult) => {
          if (appendResult.status !== "appended") {
            throw new Error("Promise-hook append did not commit");
          }
          observeLedgerPromise(
            ledgerModule.captureRevision(ledger),
            (revision) => {
              observeLedgerPromise(
                ledgerModule.projectLedger(ledger, {
                  profileId,
                  revision,
                }),
                (projection) => {
                  if (
                    projection.totalMinutes !== 60 ||
                    projection.rewards.xp !== 75 ||
                    projection.rewards.coins !== 30 ||
                    projection.rewards.loot.length !== 2
                  ) {
                    throw new Error(
                      "Promise hooks affected ledger projection",
                    );
                  }
                  finish();
                },
              );
            },
          );
        });
      },
    );
  } catch (error) {
    finish(error);
  }
}
