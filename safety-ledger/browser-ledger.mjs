/*
 * Browser-safe, source-only Focus Hero ledger prototype.
 *
 * This module has no storage, network, DOM, profile, migration, or deployment
 * access. Cryptographic hashing uses the Web Crypto API supplied by the caller's
 * runtime. All state in this module is in-memory and synthetic until an
 * independently reviewed adapter is explicitly integrated.
 */

export const LEDGER_PROTOCOL = "focus-hero-ledger";
export const WRITER_PROTOCOL = 2;
export const LEDGER_VERSION = 1;
export const CURRENT_SCHEMA_VERSION = 2;
export const CURRENT_CLIENT_VERSION = 3;
export const MINIMUM_CLIENT_VERSION = 3;
export const REWARD_POLICY_VERSION = "focus-session-rewards-v1";

/*
 * Authority-critical operations use module-initialization snapshots of the
 * platform intrinsics. This prevents later same-realm replacement of shared
 * globals or prototype methods from changing ledger state, reference
 * resolution, hashing, or reward projection.
 */
const intrinsicReflectApply = Reflect.apply;
const intrinsicObjectPrototype = Object.prototype;
const intrinsicObjectCreate = Object.create;
const intrinsicObjectFreeze = Object.freeze;
const intrinsicObjectGetPrototypeOf = Object.getPrototypeOf;
const intrinsicObjectGetOwnPropertyDescriptor =
  Object.getOwnPropertyDescriptor;
const intrinsicObjectPreventExtensions = Object.preventExtensions;
const intrinsicObjectDefineProperty = Object.defineProperty;
const intrinsicObjectEntries = Object.entries;
const intrinsicObjectKeys = Object.keys;
const intrinsicObjectValues = Object.values;
const intrinsicObjectIsFrozen = Object.isFrozen;
const intrinsicObjectIs = Object.is;
const intrinsicObjectHasOwnProperty = Object.prototype.hasOwnProperty;
const intrinsicArrayIsArray = Array.isArray;
const intrinsicArrayForEach = Array.prototype.forEach;
const intrinsicArraySort = Array.prototype.sort;
const intrinsicArrayEvery = Array.prototype.every;
const intrinsicArraySome = Array.prototype.some;
const intrinsicArrayReduce = Array.prototype.reduce;
const intrinsicArrayJoin = Array.prototype.join;
const intrinsicArrayPush = Array.prototype.push;
const intrinsicString = String;
const intrinsicStringNormalize = String.prototype.normalize;
const intrinsicStringTrim = String.prototype.trim;
const intrinsicStringPadStart = String.prototype.padStart;
const intrinsicNumberToString = Number.prototype.toString;
const intrinsicNumberIsFinite = Number.isFinite;
const intrinsicNumberIsInteger = Number.isInteger;
const intrinsicNumberIsSafeInteger = Number.isSafeInteger;
const intrinsicMathCeil = Math.ceil;
const intrinsicMathFloor = Math.floor;
const intrinsicJsonStringify = JSON.stringify;
const intrinsicPromise = Promise;
const intrinsicPromiseResolve = Promise.resolve;
const intrinsicPromiseReject = Promise.reject;
const intrinsicPromiseThen = Promise.prototype.then;
const intrinsicPromiseCatch = Promise.prototype.catch;
const intrinsicPromiseFinally = Promise.prototype.finally;
const intrinsicMap = Map;
const intrinsicMapGet = Map.prototype.get;
const intrinsicMapSet = Map.prototype.set;
const intrinsicMapHas = Map.prototype.has;
const intrinsicMapDelete = Map.prototype.delete;
const intrinsicMapClear = Map.prototype.clear;
const intrinsicMapForEach = Map.prototype.forEach;
const intrinsicMapSize = intrinsicObjectGetOwnPropertyDescriptor(
  Map.prototype,
  "size",
).get;
const intrinsicSet = Set;
const intrinsicSetAdd = Set.prototype.add;
const intrinsicSetHas = Set.prototype.has;
const intrinsicSetForEach = Set.prototype.forEach;
const intrinsicSetSize = intrinsicObjectGetOwnPropertyDescriptor(
  Set.prototype,
  "size",
).get;
const intrinsicWeakMap = WeakMap;
const intrinsicWeakMapGet = WeakMap.prototype.get;
const intrinsicWeakMapSet = WeakMap.prototype.set;
const intrinsicWeakSet = WeakSet;
const intrinsicWeakSetAdd = WeakSet.prototype.add;
const intrinsicWeakSetHas = WeakSet.prototype.has;
const intrinsicUint8Array = Uint8Array;
const intrinsicUint32Array = Uint32Array;
const intrinsicTypedArrayPrototype = intrinsicObjectGetPrototypeOf(
  Uint8Array.prototype,
);
const intrinsicTypedArrayLength =
  intrinsicObjectGetOwnPropertyDescriptor(
    intrinsicTypedArrayPrototype,
    "length",
  ).get;
const intrinsicSymbolSpecies = Symbol.species;
const intrinsicCrypto = globalThis.crypto ?? null;
const intrinsicCryptoGetRandomValues = intrinsicCrypto?.getRandomValues ?? null;
const intrinsicTextEncoderConstructor =
  typeof globalThis.TextEncoder === "function" ? globalThis.TextEncoder : null;
const intrinsicTextEncoder =
  intrinsicTextEncoderConstructor === null
    ? null
    : new intrinsicTextEncoderConstructor();
const intrinsicTextEncoderEncode =
  intrinsicTextEncoderConstructor?.prototype?.encode ?? null;
const SAFE_PROMISE_CONSTRUCTOR = intrinsicObjectCreate(null);
intrinsicObjectDefineProperty(
  SAFE_PROMISE_CONSTRUCTOR,
  intrinsicSymbolSpecies,
  {
    value: intrinsicPromise,
    enumerable: false,
    configurable: false,
    writable: false,
  },
);
intrinsicObjectFreeze(SAFE_PROMISE_CONSTRUCTOR);

function applyIntrinsic(method, receiver, argumentsList) {
  return intrinsicReflectApply(method, receiver, argumentsList);
}

function getPrototypeOf(value) {
  return intrinsicObjectGetPrototypeOf(value);
}

function preventExtensions(value) {
  return intrinsicObjectPreventExtensions(value);
}

function defineProperty(value, property, descriptor) {
  return intrinsicObjectDefineProperty(value, property, descriptor);
}

/*
 * Objects that cross a native Promise resolution boundary must shadow any
 * later Object.prototype.then hook before they become non-extensible. The
 * property is deliberately non-enumerable so canonical JSON and exact-key
 * checks continue to describe only protocol data.
 */
function sealPromiseResolutionValue(value) {
  if (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    !applyIntrinsic(intrinsicObjectHasOwnProperty, value, ["then"])
  ) {
    defineProperty(value, "then", {
      value: undefined,
      enumerable: false,
      configurable: false,
      writable: false,
    });
  }
  return value;
}

function freeze(value) {
  return intrinsicObjectFreeze(sealPromiseResolutionValue(value));
}

function sealedPromiseThen(onFulfilled, onRejected) {
  return hardenPromise(
    applyIntrinsic(intrinsicPromiseThen, this, [onFulfilled, onRejected]),
  );
}

function sealedPromiseCatch(onRejected) {
  return hardenPromise(
    applyIntrinsic(intrinsicPromiseCatch, this, [onRejected]),
  );
}

function sealedPromiseFinally(onFinally) {
  return hardenPromise(
    applyIntrinsic(intrinsicPromiseFinally, this, [onFinally]),
  );
}

function hardenPromise(value) {
  if (value === null || typeof value !== "object") {
    throw new TypeError("ledger async operation did not return a native promise");
  }
  defineProperty(value, "constructor", {
    value: SAFE_PROMISE_CONSTRUCTOR,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  defineProperty(value, "then", {
    value: sealedPromiseThen,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  defineProperty(value, "catch", {
    value: sealedPromiseCatch,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  defineProperty(value, "finally", {
    value: sealedPromiseFinally,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  preventExtensions(value);
  return value;
}

function objectEntries(value) {
  return intrinsicObjectEntries(value);
}

function objectKeys(value) {
  return intrinsicObjectKeys(value);
}

function objectValues(value) {
  return intrinsicObjectValues(value);
}

function isFrozen(value) {
  return intrinsicObjectIsFrozen(value);
}

function isSameValue(left, right) {
  return intrinsicObjectIs(left, right);
}

function hasOwn(value, property) {
  return applyIntrinsic(intrinsicObjectHasOwnProperty, value, [property]);
}

function ownDataDescriptor(value, property, path) {
  const descriptor = intrinsicObjectGetOwnPropertyDescriptor(value, property);
  if (!descriptor || !hasOwn(descriptor, "value")) {
    throw new TypeError(`${path} must be an own data property`);
  }
  return descriptor;
}

function ownDataValue(value, property, path) {
  return ownDataDescriptor(value, property, path).value;
}

function optionalOwnDataValue(value, property, path) {
  const descriptor = intrinsicObjectGetOwnPropertyDescriptor(value, property);
  if (descriptor === undefined) return undefined;
  if (!hasOwn(descriptor, "value")) {
    throw new TypeError(`${path} must be an own data property`);
  }
  return descriptor.value;
}

function isArray(value) {
  return intrinsicArrayIsArray(value);
}

function ownArrayLength(value, path = "authority array") {
  const length = ownDataValue(value, "length", `${path}.length`);
  if (!isSafeInteger(length) || length < 0) {
    throw new TypeError(`${path}.length must be a non-negative safe integer`);
  }
  return length;
}

function assertDenseOwnDataArray(value, path = "authority array") {
  const length = ownArrayLength(value, path);
  for (let index = 0; index < length; index += 1) {
    ownDataDescriptor(value, index, `${path}[${index}]`);
  }
  return length;
}

function arrayMap(value, callback, path = "authority array") {
  const result = [];
  const length = ownArrayLength(value, path);
  for (let index = 0; index < length; index += 1) {
    arrayPush(
      result,
      callback(ownDataValue(value, index, `${path}[${index}]`), index),
    );
  }
  return result;
}

function arrayForEach(value, callback, path = "authority array") {
  const length = ownArrayLength(value, path);
  for (let index = 0; index < length; index += 1) {
    callback(ownDataValue(value, index, `${path}[${index}]`), index);
  }
}

function arrayFilter(value, callback, path = "authority array") {
  const result = [];
  const length = ownArrayLength(value, path);
  for (let index = 0; index < length; index += 1) {
    const item = ownDataValue(value, index, `${path}[${index}]`);
    if (callback(item, index)) {
      arrayPush(result, item);
    }
  }
  return result;
}

function arraySort(value, callback) {
  assertDenseOwnDataArray(value);
  applyIntrinsic(intrinsicArraySort, value, [callback]);
  return value;
}

function arrayEvery(value, callback) {
  const length = ownArrayLength(value);
  for (let index = 0; index < length; index += 1) {
    if (!callback(ownDataValue(value, index, `authority array[${index}]`), index)) {
      return false;
    }
  }
  return true;
}

function arraySome(value, callback) {
  const length = ownArrayLength(value);
  for (let index = 0; index < length; index += 1) {
    if (callback(ownDataValue(value, index, `authority array[${index}]`), index)) {
      return true;
    }
  }
  return false;
}

function arrayReduce(value, callback, initialValue) {
  let accumulator = initialValue;
  const length = ownArrayLength(value);
  for (let index = 0; index < length; index += 1) {
    accumulator = callback(
      accumulator,
      ownDataValue(value, index, `authority array[${index}]`),
      index,
    );
  }
  return accumulator;
}

function arrayJoin(value, separator) {
  assertDenseOwnDataArray(value);
  return applyIntrinsic(intrinsicArrayJoin, value, [separator]);
}

function arrayPush(value, item) {
  const index = ownArrayLength(value);
  defineProperty(value, index, {
    value: item,
    enumerable: true,
    configurable: true,
    writable: true,
  });
  return ownArrayLength(value);
}

function arrayPushAll(target, source, path = "authority source array") {
  const length = ownArrayLength(source, path);
  for (let index = 0; index < length; index += 1) {
    arrayPush(
      target,
      ownDataValue(source, index, `${path}[${index}]`),
    );
  }
  return ownArrayLength(target);
}

function normalizeString(value) {
  return applyIntrinsic(intrinsicStringNormalize, value, ["NFC"]);
}

function trimString(value) {
  return applyIntrinsic(intrinsicStringTrim, value, []);
}

function padStringStart(value, length, fill) {
  return applyIntrinsic(intrinsicStringPadStart, value, [length, fill]);
}

function numberToString(value, radix) {
  return applyIntrinsic(intrinsicNumberToString, value, [radix]);
}

function isFiniteNumber(value) {
  return intrinsicNumberIsFinite(value);
}

function isInteger(value) {
  return intrinsicNumberIsInteger(value);
}

function isSafeInteger(value) {
  return intrinsicNumberIsSafeInteger(value);
}

function jsonStringifyPrimitive(value) {
  if (value !== null && typeof value === "object") {
    throw new TypeError("canonical JSON stringification accepts primitives only");
  }
  return intrinsicJsonStringify(value);
}

function promiseResolve(value) {
  return hardenPromise(
    applyIntrinsic(intrinsicPromiseResolve, intrinsicPromise, [value]),
  );
}

function promiseReject(value) {
  return hardenPromise(
    applyIntrinsic(intrinsicPromiseReject, intrinsicPromise, [value]),
  );
}

function promiseThen(value, onFulfilled, onRejected) {
  const hardened = hardenPromise(value);
  return hardenPromise(
    applyIntrinsic(intrinsicPromiseThen, hardened, [
      onFulfilled,
      onRejected,
    ]),
  );
}

function mapGet(map, key) {
  return applyIntrinsic(intrinsicMapGet, map, [key]);
}

function mapSet(map, key, value) {
  return applyIntrinsic(intrinsicMapSet, map, [key, value]);
}

function mapHas(map, key) {
  return applyIntrinsic(intrinsicMapHas, map, [key]);
}

function mapDelete(map, key) {
  return applyIntrinsic(intrinsicMapDelete, map, [key]);
}

function mapClear(map) {
  return applyIntrinsic(intrinsicMapClear, map, []);
}

function mapForEach(map, callback) {
  return applyIntrinsic(intrinsicMapForEach, map, [callback]);
}

function mapSize(map) {
  return applyIntrinsic(intrinsicMapSize, map, []);
}

function mapEntries(map) {
  const entries = [];
  mapForEach(map, (value, key) => {
    arrayPush(entries, [key, value]);
  });
  return entries;
}

function mapValues(map) {
  const values = [];
  mapForEach(map, (value) => {
    arrayPush(values, value);
  });
  return values;
}

function setAdd(set, value) {
  return applyIntrinsic(intrinsicSetAdd, set, [value]);
}

function setHas(set, value) {
  return applyIntrinsic(intrinsicSetHas, set, [value]);
}

function setForEach(set, callback) {
  return applyIntrinsic(intrinsicSetForEach, set, [callback]);
}

function setSize(set) {
  return applyIntrinsic(intrinsicSetSize, set, []);
}

function weakMapGet(map, key) {
  return applyIntrinsic(intrinsicWeakMapGet, map, [key]);
}

function weakMapSet(map, key, value) {
  return applyIntrinsic(intrinsicWeakMapSet, map, [key, value]);
}

function weakSetAdd(set, value) {
  return applyIntrinsic(intrinsicWeakSetAdd, set, [value]);
}

function weakSetHas(set, value) {
  return applyIntrinsic(intrinsicWeakSetHas, set, [value]);
}

const EVENT_TYPES = new intrinsicSet([
  "session.created",
  "session.minutes_set",
  "session.deleted",
]);

const EXACT_EVENT_KEYS = freeze([
  "actorId",
  "actorSequence",
  "clientVersion",
  "eventId",
  "ledgerVersion",
  "logicalTime",
  "payload",
  "profileEpoch",
  "profileId",
  "protocol",
  "schemaVersion",
  "type",
  "writerProtocol",
]);

const PAYLOAD_KEYS = freeze({
  "session.created": freeze([
    "expectedRevision",
    "minutes",
    "parentEventId",
    "rewardPolicyVersion",
    "sessionId",
  ]),
  "session.minutes_set": freeze([
    "expectedRevision",
    "minutes",
    "parentEventId",
    "sessionId",
  ]),
  "session.deleted": freeze([
    "expectedRevision",
    "parentEventId",
    "sessionId",
  ]),
});

const DEFAULT_REWARDS = freeze([
  freeze({ minutes: 30, xp: 30, coins: 10, loot: "bronze-focus-cache" }),
  freeze({ minutes: 60, xp: 45, coins: 20, loot: "silver-focus-cache" }),
  freeze({ minutes: 120, xp: 90, coins: 45, loot: "gold-focus-cache" }),
]);

const REWARD_POLICIES = freeze({
  [REWARD_POLICY_VERSION]: DEFAULT_REWARDS,
});

const revisionAuthority = new intrinsicWeakMap();
const exactLedgerInstances = new intrinsicWeakSet();

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeJson(value, path = "$") {
  if (typeof value === "string") {
    return normalizeString(value);
  }
  if (value === null || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!isFiniteNumber(value)) {
      throw new TypeError(`${path} must contain finite JSON numbers`);
    }
    if (isInteger(value) && !isSafeInteger(value)) {
      throw new TypeError(`${path} must contain only safe JSON integers`);
    }
    return isSameValue(value, -0) ? 0 : value;
  }
  if (isArray(value)) {
    return arrayMap(value, (item, index) =>
      normalizeJson(item, `${path}[${index}]`),
    );
  }
  if (
    typeof value === "object" &&
    getPrototypeOf(value) === intrinsicObjectPrototype
  ) {
    const normalized = {};
    const keys = objectKeys(value);
    const keyCount = ownArrayLength(keys, `${path} keys`);
    for (let index = 0; index < keyCount; index += 1) {
      const rawKey = ownDataValue(keys, index, `${path} keys[${index}]`);
      const child = ownDataValue(value, rawKey, `${path}.${rawKey}`);
      if (child === undefined) {
        throw new TypeError(`${path}.${rawKey} cannot be undefined`);
      }
      const key = normalizeString(rawKey);
      if (hasOwn(normalized, key)) {
        throw new TypeError(`${path} contains Unicode-equivalent duplicate keys`);
      }
      defineProperty(normalized, key, {
        value: normalizeJson(child, `${path}.${key}`),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return normalized;
  }
  throw new TypeError(`${path} must be plain JSON data`);
}

function assertJson(value, path = "$") {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return;
  }
  if (typeof value === "number") {
    if (!isFiniteNumber(value)) {
      throw new TypeError(`${path} must contain finite JSON numbers`);
    }
    return;
  }
  if (isArray(value)) {
    arrayForEach(
      value,
      (item, index) => assertJson(item, `${path}[${index}]`),
      path,
    );
    return;
  }
  if (
    typeof value === "object" &&
    getPrototypeOf(value) === intrinsicObjectPrototype
  ) {
    const keys = objectKeys(value);
    const keyCount = ownArrayLength(keys, `${path} keys`);
    for (let index = 0; index < keyCount; index += 1) {
      const key = ownDataValue(keys, index, `${path} keys[${index}]`);
      const child = ownDataValue(value, key, `${path}.${key}`);
      if (child === undefined) {
        throw new TypeError(`${path}.${key} cannot be undefined`);
      }
      assertJson(child, `${path}.${key}`);
    }
    return;
  }
  throw new TypeError(`${path} must be plain JSON data`);
}

function canonicalNormalizedJson(value) {
  if (value === null || typeof value !== "object") {
    return jsonStringifyPrimitive(value);
  }
  if (isArray(value)) {
    return `[${arrayJoin(
      arrayMap(
        value,
        (item) => canonicalNormalizedJson(item),
        "canonical JSON array",
      ),
      ",",
    )}]`;
  }
  const keys = arraySort(objectKeys(value), compareText);
  return `{${arrayJoin(
    arrayMap(
      keys,
      (key) =>
        `${jsonStringifyPrimitive(key)}:${canonicalNormalizedJson(
          ownDataValue(value, key, `canonical JSON.${key}`),
        )}`,
    ),
    ",",
  )}}`;
}

export function canonicalJson(value) {
  const normalized = normalizeJson(value);
  assertJson(normalized);
  return canonicalNormalizedJson(normalized);
}

function cloneNormalizedJson(value, path = "$") {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return value;
  }
  if (isArray(value)) {
    const clone = [];
    const length = ownArrayLength(value, path);
    for (let index = 0; index < length; index += 1) {
      arrayPush(
        clone,
        cloneNormalizedJson(
          ownDataValue(value, index, `${path}[${index}]`),
          `${path}[${index}]`,
        ),
      );
    }
    return clone;
  }
  if (
    typeof value === "object" &&
    getPrototypeOf(value) === intrinsicObjectPrototype
  ) {
    const clone = {};
    const keys = objectKeys(value);
    const keyCount = ownArrayLength(keys, `${path} keys`);
    for (let index = 0; index < keyCount; index += 1) {
      const key = ownDataValue(keys, index, `${path} keys[${index}]`);
      defineProperty(clone, key, {
        value: cloneNormalizedJson(
          ownDataValue(value, key, `${path}.${key}`),
          `${path}.${key}`,
        ),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return clone;
  }
  throw new TypeError(`${path} must be normalized plain JSON data`);
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !isFrozen(value)) {
    freeze(value);
    const keys = objectKeys(value);
    arrayForEach(
      keys,
      (key) =>
        deepFreeze(ownDataValue(value, key, `deep-freeze.${key}`)),
      "deep-freeze keys",
    );
  }
  return value;
}

function requireString(value, field) {
  if (typeof value !== "string" || trimString(value) === "") {
    throw new TypeError(`${field} must be a non-empty string`);
  }
}

function requirePositiveInteger(value, field) {
  if (!isSafeInteger(value) || value < 1) {
    throw new TypeError(`${field} must be a positive safe integer`);
  }
}

function requireNonNegativeInteger(value, field) {
  if (!isSafeInteger(value) || value < 0) {
    throw new TypeError(`${field} must be a non-negative safe integer`);
  }
}

function requireSha256Hex(value, field) {
  if (typeof value !== "string" || value.length !== 64) {
    throw new TypeError(`${field} must be 64 lowercase SHA-256 hex characters`);
  }
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    const decimal = character >= "0" && character <= "9";
    const lowercaseHex = character >= "a" && character <= "f";
    if (!decimal && !lowercaseHex) {
      throw new TypeError(
        `${field} must be 64 lowercase SHA-256 hex characters`,
      );
    }
  }
}

function checkedSafeAdd(left, right, field) {
  if (!isSafeInteger(left) || !isSafeInteger(right)) {
    throw new RangeError(`${field} operands must be safe integers`);
  }
  const sum = left + right;
  if (!isSafeInteger(sum)) {
    throw new RangeError(`${field} exceeds exact safe-integer accounting`);
  }
  return sum;
}

function hasExactKeys(value, expectedKeys) {
  if (!value || typeof value !== "object" || isArray(value)) {
    return false;
  }
  const actual = arraySort(objectKeys(value), compareText);
  return (
    actual.length === expectedKeys.length &&
    arrayEvery(actual, (key, index) => key === expectedKeys[index])
  );
}

function typedArrayLength(value) {
  return applyIntrinsic(intrinsicTypedArrayLength, value, []);
}

function secureRandomCrypto() {
  if (
    intrinsicCrypto === null ||
    typeof intrinsicCryptoGetRandomValues !== "function"
  ) {
    throw new Error("Web Crypto randomness is unavailable; ledger operation blocked");
  }
  return intrinsicCrypto;
}

function bytesToHex(bytes) {
  const encoded = [];
  const length = typedArrayLength(bytes);
  for (let index = 0; index < length; index += 1) {
    arrayPush(
      encoded,
      padStringStart(numberToString(bytes[index], 16), 2, "0"),
    );
  }
  return arrayJoin(encoded, "");
}

function randomAuthorityToken() {
  const bytes = new intrinsicUint8Array(32);
  secureRandomCrypto();
  applyIntrinsic(intrinsicCryptoGetRandomValues, intrinsicCrypto, [bytes]);
  return bytesToHex(bytes);
}

const SHA256_INITIAL_STATE = freeze([
  0x6a09e667,
  0xbb67ae85,
  0x3c6ef372,
  0xa54ff53a,
  0x510e527f,
  0x9b05688c,
  0x1f83d9ab,
  0x5be0cd19,
]);

const SHA256_ROUND_CONSTANTS = freeze([
  0x428a2f98,
  0x71374491,
  0xb5c0fbcf,
  0xe9b5dba5,
  0x3956c25b,
  0x59f111f1,
  0x923f82a4,
  0xab1c5ed5,
  0xd807aa98,
  0x12835b01,
  0x243185be,
  0x550c7dc3,
  0x72be5d74,
  0x80deb1fe,
  0x9bdc06a7,
  0xc19bf174,
  0xe49b69c1,
  0xefbe4786,
  0x0fc19dc6,
  0x240ca1cc,
  0x2de92c6f,
  0x4a7484aa,
  0x5cb0a9dc,
  0x76f988da,
  0x983e5152,
  0xa831c66d,
  0xb00327c8,
  0xbf597fc7,
  0xc6e00bf3,
  0xd5a79147,
  0x06ca6351,
  0x14292967,
  0x27b70a85,
  0x2e1b2138,
  0x4d2c6dfc,
  0x53380d13,
  0x650a7354,
  0x766a0abb,
  0x81c2c92e,
  0x92722c85,
  0xa2bfe8a1,
  0xa81a664b,
  0xc24b8b70,
  0xc76c51a3,
  0xd192e819,
  0xd6990624,
  0xf40e3585,
  0x106aa070,
  0x19a4c116,
  0x1e376c08,
  0x2748774c,
  0x34b0bcb5,
  0x391c0cb3,
  0x4ed8aa4a,
  0x5b9cca4f,
  0x682e6ff3,
  0x748f82ee,
  0x78a5636f,
  0x84c87814,
  0x8cc70208,
  0x90befffa,
  0xa4506ceb,
  0xbef9a3f7,
  0xc67178f2,
]);

function rotateRight32(value, distance) {
  return ((value >>> distance) | (value << (32 - distance))) >>> 0;
}

function sha256HexSync(text) {
  if (typeof text !== "string") {
    throw new TypeError("sha256Hex input must be a string");
  }
  if (
    intrinsicTextEncoder === null ||
    typeof intrinsicTextEncoderEncode !== "function"
  ) {
    throw new Error("TextEncoder is unavailable; ledger operation blocked");
  }
  const bytes = applyIntrinsic(
    intrinsicTextEncoderEncode,
    intrinsicTextEncoder,
    [text],
  );
  const byteLength = typedArrayLength(bytes);
  const bitLength = byteLength * 8;
  if (!isSafeInteger(bitLength)) {
    throw new RangeError("sha256Hex input exceeds exact length accounting");
  }
  const paddedLength = intrinsicMathCeil((byteLength + 9) / 64) * 64;
  if (!isSafeInteger(paddedLength)) {
    throw new RangeError("sha256Hex padded input exceeds exact length accounting");
  }
  const padded = new intrinsicUint8Array(paddedLength);
  for (let index = 0; index < byteLength; index += 1) {
    padded[index] = bytes[index];
  }
  padded[byteLength] = 0x80;
  const highBits = intrinsicMathFloor(bitLength / 0x100000000);
  const lowBits = bitLength >>> 0;
  padded[paddedLength - 8] = (highBits >>> 24) & 0xff;
  padded[paddedLength - 7] = (highBits >>> 16) & 0xff;
  padded[paddedLength - 6] = (highBits >>> 8) & 0xff;
  padded[paddedLength - 5] = highBits & 0xff;
  padded[paddedLength - 4] = (lowBits >>> 24) & 0xff;
  padded[paddedLength - 3] = (lowBits >>> 16) & 0xff;
  padded[paddedLength - 2] = (lowBits >>> 8) & 0xff;
  padded[paddedLength - 1] = lowBits & 0xff;

  let h0 = SHA256_INITIAL_STATE[0];
  let h1 = SHA256_INITIAL_STATE[1];
  let h2 = SHA256_INITIAL_STATE[2];
  let h3 = SHA256_INITIAL_STATE[3];
  let h4 = SHA256_INITIAL_STATE[4];
  let h5 = SHA256_INITIAL_STATE[5];
  let h6 = SHA256_INITIAL_STATE[6];
  let h7 = SHA256_INITIAL_STATE[7];
  const schedule = new intrinsicUint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      const cursor = offset + index * 4;
      schedule[index] =
        ((padded[cursor] << 24) |
          (padded[cursor + 1] << 16) |
          (padded[cursor + 2] << 8) |
          padded[cursor + 3]) >>>
        0;
    }
    for (let index = 16; index < 64; index += 1) {
      const s0 =
        rotateRight32(schedule[index - 15], 7) ^
        rotateRight32(schedule[index - 15], 18) ^
        (schedule[index - 15] >>> 3);
      const s1 =
        rotateRight32(schedule[index - 2], 17) ^
        rotateRight32(schedule[index - 2], 19) ^
        (schedule[index - 2] >>> 10);
      schedule[index] =
        (schedule[index - 16] + s0 + schedule[index - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let index = 0; index < 64; index += 1) {
      const sum1 =
        rotateRight32(e, 6) ^
        rotateRight32(e, 11) ^
        rotateRight32(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temp1 =
        (h +
          sum1 +
          choose +
          SHA256_ROUND_CONSTANTS[index] +
          schedule[index]) >>>
        0;
      const sum0 =
        rotateRight32(a, 2) ^
        rotateRight32(a, 13) ^
        rotateRight32(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sum0 + majority) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return arrayJoin(
    arrayMap(
      [h0, h1, h2, h3, h4, h5, h6, h7],
      (word) => padStringStart(numberToString(word, 16), 8, "0"),
      "SHA-256 state",
    ),
    "",
  );
}

export function sha256Hex(text) {
  try {
    return promiseResolve(sha256HexSync(text));
  } catch (error) {
    return promiseReject(error);
  }
}

export function eventBody(input) {
  if (
    !input ||
    typeof input !== "object" ||
    isArray(input) ||
    getPrototypeOf(input) !== intrinsicObjectPrototype
  ) {
    throw new TypeError("event input must be a same-realm plain object");
  }
  const body = normalizeJson({
    protocol:
      optionalOwnDataValue(input, "protocol", "input.protocol") ??
      LEDGER_PROTOCOL,
    writerProtocol:
      optionalOwnDataValue(input, "writerProtocol", "input.writerProtocol") ??
      WRITER_PROTOCOL,
    ledgerVersion:
      optionalOwnDataValue(input, "ledgerVersion", "input.ledgerVersion") ??
      LEDGER_VERSION,
    schemaVersion:
      optionalOwnDataValue(input, "schemaVersion", "input.schemaVersion") ??
      CURRENT_SCHEMA_VERSION,
    clientVersion:
      optionalOwnDataValue(input, "clientVersion", "input.clientVersion") ??
      CURRENT_CLIENT_VERSION,
    profileId: ownDataValue(input, "profileId", "input.profileId"),
    profileEpoch: ownDataValue(input, "profileEpoch", "input.profileEpoch"),
    actorId: ownDataValue(input, "actorId", "input.actorId"),
    actorSequence: ownDataValue(
      input,
      "actorSequence",
      "input.actorSequence",
    ),
    logicalTime: ownDataValue(input, "logicalTime", "input.logicalTime"),
    type: ownDataValue(input, "type", "input.type"),
    payload: ownDataValue(input, "payload", "input.payload"),
  });
  assertJson(body);
  return body;
}

async function deterministicEventIdAsync(input) {
  const digest = await hardenPromise(
    sha256Hex(canonicalJson(eventBody(input))),
  );
  return `fh_evt_${digest}`;
}

export function deterministicEventId(input) {
  return hardenPromise(deterministicEventIdAsync(input));
}

async function createEventAsync(input) {
  const body = eventBody(input);
  return deepFreeze({
    eventId: await hardenPromise(deterministicEventId(body)),
    ...body,
  });
}

export function createEvent(input) {
  return hardenPromise(createEventAsync(input));
}

async function validationReasonAsync(event, deriveEventId) {
  if (!hasExactKeys(event, EXACT_EVENT_KEYS)) {
    return "EVENT_ENVELOPE_INVALID";
  }
  if (event.protocol !== LEDGER_PROTOCOL) {
    return "PROTOCOL_UNSUPPORTED";
  }
  if (event.writerProtocol !== WRITER_PROTOCOL) {
    return "WRITER_PROTOCOL_UNSUPPORTED";
  }
  if (event.ledgerVersion !== LEDGER_VERSION) {
    return "LEDGER_VERSION_UNSUPPORTED";
  }
  if (event.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    return event.schemaVersion < CURRENT_SCHEMA_VERSION
      ? "SCHEMA_TOO_OLD"
      : "SCHEMA_TOO_NEW";
  }
  if (
    !isSafeInteger(event.clientVersion) ||
    event.clientVersion < MINIMUM_CLIENT_VERSION
  ) {
    return "CLIENT_TOO_OLD";
  }
  if (event.clientVersion > CURRENT_CLIENT_VERSION) {
    return "CLIENT_TOO_NEW";
  }
  if (!setHas(EVENT_TYPES, event.type)) {
    return "EVENT_TYPE_UNSUPPORTED";
  }
  if (!hasExactKeys(event.payload, PAYLOAD_KEYS[event.type])) {
    return "EVENT_PAYLOAD_INVALID";
  }

  try {
    requireString(event.profileId, "profileId");
    requireString(event.profileEpoch, "profileEpoch");
    requireString(event.actorId, "actorId");
    requirePositiveInteger(event.actorSequence, "actorSequence");
    requirePositiveInteger(event.logicalTime, "logicalTime");
    requireString(event.payload.sessionId, "payload.sessionId");
    requireNonNegativeInteger(
      event.payload.expectedRevision,
      "payload.expectedRevision",
    );
    if (event.type === "session.created") {
      if (event.payload.parentEventId !== null) {
        throw new TypeError("create parentEventId must be null");
      }
      if (event.payload.rewardPolicyVersion !== REWARD_POLICY_VERSION) {
        return "REWARD_POLICY_UNSUPPORTED";
      }
    } else {
      requireString(event.payload.parentEventId, "payload.parentEventId");
    }
    if (event.type !== "session.deleted") {
      requireNonNegativeInteger(event.payload.minutes, "payload.minutes");
    }
  } catch {
    return "EVENT_SHAPE_INVALID";
  }

  let expectedId;
  try {
    expectedId = await hardenPromise(deriveEventId(event));
  } catch {
    return "EVENT_SHAPE_INVALID";
  }
  return event.eventId === expectedId ? null : "EVENT_ID_MISMATCH";
}

function validationReason(event, deriveEventId) {
  return hardenPromise(validationReasonAsync(event, deriveEventId));
}

function compareEvents(left, right) {
  return (
    compareText(left.actorId, right.actorId) ||
    left.actorSequence - right.actorSequence ||
    compareText(left.eventId, right.eventId)
  );
}

function dependencyOrder(events) {
  const remaining = new intrinsicMap();
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    mapSet(remaining, event.eventId, event);
  }
  const processed = new intrinsicSet();
  const ordered = [];

  while (mapSize(remaining) > 0) {
    const ready = arraySort(
      arrayFilter(mapValues(remaining), (event) => {
        const parentId = event.payload.parentEventId;
        return parentId === null || setHas(processed, parentId);
      }),
      compareEvents,
    );
    if (ready.length === 0) {
      arrayPushAll(ordered, arraySort(mapValues(remaining), compareEvents));
      break;
    }
    for (let index = 0; index < ready.length; index += 1) {
      const event = ready[index];
      arrayPush(ordered, event);
      setAdd(processed, event.eventId);
      mapDelete(remaining, event.eventId);
    }
  }
  return ordered;
}

export class AppendOnlyLedger {
  #observations = new intrinsicMap();
  #validation = new intrinsicMap();
  #contentHashes = new intrinsicMap();
  #eventIdCollisions = new intrinsicSet();
  #sequenceClaims = new intrinsicMap();
  #sequenceCollisions = new intrinsicSet();
  #appendQueue = promiseResolve();
  #profileId;
  #profileEpoch;

  constructor(options) {
    if (!hasExactKeys(options, ["profileEpoch", "profileId"])) {
      throw new TypeError(
        "AppendOnlyLedger requires exactly profileId and profileEpoch",
      );
    }
    const normalized = normalizeJson(options);
    requireString(normalized.profileId, "profileId");
    requireString(normalized.profileEpoch, "profileEpoch");
    this.#profileId = normalized.profileId;
    this.#profileEpoch = normalized.profileEpoch;
    weakMapSet(revisionAuthority, this, new intrinsicMap());
    weakSetAdd(exactLedgerInstances, this);
    sealPromiseResolutionValue(this);
    preventExtensions(this);
  }

  append(inputEvent) {
    let invocationSnapshot;
    try {
      invocationSnapshot = deepFreeze(normalizeJson(inputEvent));
      assertJson(invocationSnapshot);
    } catch (error) {
      return promiseReject(error);
    }
    const operation = promiseThen(this.#appendQueue, () =>
      this.#appendOne(invocationSnapshot)
    );
    this.#appendQueue = promiseThen(
      operation,
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  #appendOne(inputEvent) {
    return hardenPromise(this.#appendOneAsync(inputEvent));
  }

  async #appendOneAsync(inputEvent) {
    const event = deepFreeze(cloneNormalizedJson(inputEvent));
    assertJson(event);
    requireString(event.eventId, "eventId");
    const canonical = canonicalJson(event);

    let variants = mapGet(this.#observations, event.eventId);
    if (!variants) {
      variants = new intrinsicMap();
      mapSet(this.#observations, event.eventId, variants);
    }
    if (mapHas(variants, canonical)) {
      const knownReason = setHas(this.#eventIdCollisions, event.eventId)
        ? "EVENT_ID_COLLISION"
        : mapGet(this.#validation, canonical) ??
          (setHas(this.#sequenceCollisions, event.eventId)
            ? "ACTOR_SEQUENCE_COLLISION"
            : null);
      return deepFreeze({
        status: knownReason ? "quarantined" : "duplicate",
        eventId: event.eventId,
        reason: knownReason,
      });
    }

    mapSet(variants, canonical, event);
    mapClear(weakMapGet(revisionAuthority, this));
    if (mapSize(variants) > 1) {
      setAdd(this.#eventIdCollisions, event.eventId);
    }
    mapSet(
      this.#contentHashes,
      canonical,
      await hardenPromise(sha256Hex(canonical)),
    );
    const reason =
      event.profileId !== this.#profileId
        ? "LEDGER_PROFILE_MISMATCH"
        : event.profileEpoch !== this.#profileEpoch
          ? "LEDGER_EPOCH_MISMATCH"
          : await hardenPromise(
              validationReason(event, deterministicEventId),
            );
    mapSet(this.#validation, canonical, reason);
    if (setHas(this.#eventIdCollisions, event.eventId)) {
      return deepFreeze({
        status: "quarantined",
        eventId: event.eventId,
        reason: "EVENT_ID_COLLISION",
      });
    }
    if (reason) {
      return deepFreeze({ status: "quarantined", eventId: event.eventId, reason });
    }

    const sequenceKey = canonicalJson([
      event.profileId,
      event.actorId,
      event.actorSequence,
    ]);
    let claims = mapGet(this.#sequenceClaims, sequenceKey);
    if (!claims) {
      claims = new intrinsicSet();
      mapSet(this.#sequenceClaims, sequenceKey, claims);
    }
    setAdd(claims, event.eventId);
    if (setSize(claims) > 1) {
      setForEach(claims, (eventId) =>
        setAdd(this.#sequenceCollisions, eventId),
      );
      return deepFreeze({
        status: "quarantined",
        eventId: event.eventId,
        reason: "ACTOR_SEQUENCE_COLLISION",
      });
    }

    return deepFreeze({ status: "appended", eventId: event.eventId, reason: null });
  }

  identity() {
    return deepFreeze({
      profileId: this.#profileId,
      profileEpoch: this.#profileEpoch,
    });
  }

  settled() {
    return hardenPromise(this.#appendQueue);
  }

  observations() {
    return this.#observationList();
  }

  #observationList() {
    const result = [];
    const observationGroups = mapValues(this.#observations);
    for (let index = 0; index < observationGroups.length; index += 1) {
      arrayPushAll(result, mapValues(observationGroups[index]));
    }
    return freeze(
      arraySort(
        result,
        (left, right) =>
          compareText(left.eventId, right.eventId) ||
          compareText(canonicalJson(left), canonicalJson(right)),
      ),
    );
  }

  events() {
    return this.#acceptedEvents();
  }

  #acceptedEvents() {
    const accepted = [];
    const observationEntries = mapEntries(this.#observations);
    for (let index = 0; index < observationEntries.length; index += 1) {
      const [eventId, variants] = observationEntries[index];
      if (
        setHas(this.#eventIdCollisions, eventId) ||
        setHas(this.#sequenceCollisions, eventId)
      ) {
        continue;
      }
      const valid = arrayFilter(
        mapEntries(variants),
        ([canonical]) => mapGet(this.#validation, canonical) === null,
      );
      if (valid.length === 1) {
        arrayPush(accepted, valid[0][1]);
      }
    }
    return freeze(arraySort(accepted, compareEvents));
  }

  quarantine() {
    return this.#quarantineEntries();
  }

  #quarantineEntries() {
    const result = [];
    const observationEntries = mapEntries(this.#observations);
    for (let index = 0; index < observationEntries.length; index += 1) {
      const [eventId, variants] = observationEntries[index];
      const variantEntries = mapEntries(variants);
      const valid = arrayFilter(
        variantEntries,
        ([canonical]) => mapGet(this.#validation, canonical) === null,
      );
      if (setHas(this.#eventIdCollisions, eventId)) {
        arrayPush(
          result,
          deepFreeze({
            eventId,
            reason: "EVENT_ID_COLLISION",
            variantHashes: freeze(
              arraySort(
                arrayMap(valid, ([canonical]) =>
                  mapGet(this.#contentHashes, canonical),
                ),
                compareText,
              ),
            ),
          }),
        );
      }
      if (setHas(this.#sequenceCollisions, eventId)) {
        arrayPush(
          result,
          deepFreeze({
            eventId,
            reason: "ACTOR_SEQUENCE_COLLISION",
            variantHashes: freeze(
              arraySort(
                arrayMap(valid, ([canonical]) =>
                  mapGet(this.#contentHashes, canonical),
                ),
                compareText,
              ),
            ),
          }),
        );
      }
      for (
        let variantIndex = 0;
        variantIndex < variantEntries.length;
        variantIndex += 1
      ) {
        const canonical = variantEntries[variantIndex][0];
        const reason = mapGet(this.#validation, canonical);
        if (reason) {
          arrayPush(
            result,
            deepFreeze({
              eventId,
              reason,
              variantHashes: freeze([
                mapGet(this.#contentHashes, canonical),
              ]),
            }),
          );
        }
      }
    }
    return freeze(
      arraySort(
        result,
        (left, right) =>
          compareText(left.eventId, right.eventId) ||
          compareText(left.reason, right.reason) ||
          compareText(left.variantHashes[0] ?? "", right.variantHashes[0] ?? ""),
      ),
    );
  }

  resolveEventReference(reference) {
    if (
      !reference ||
      typeof reference !== "object" ||
      isArray(reference) ||
      getPrototypeOf(reference) !== intrinsicObjectPrototype ||
      !hasExactKeys(reference, ["contentHash", "eventId"])
    ) {
      throw new TypeError("event reference must contain exact own data fields");
    }
    return this.#resolveEventReference({
      eventId: ownDataValue(reference, "eventId", "reference.eventId"),
      contentHash: ownDataValue(
        reference,
        "contentHash",
        "reference.contentHash",
      ),
    });
  }

  #resolveEventReference({ eventId, contentHash }) {
    requireString(eventId, "event reference eventId");
    requireSha256Hex(contentHash, "event reference contentHash");
    if (
      setHas(this.#eventIdCollisions, eventId) ||
      setHas(this.#sequenceCollisions, eventId)
    ) {
      throw new RangeError(`event reference is quarantined: ${eventId}`);
    }
    const variants = mapGet(this.#observations, eventId);
    if (!variants) {
      throw new RangeError(`missing event observation: ${eventId}`);
    }
    const variantEntries = mapEntries(variants);
    for (let index = 0; index < variantEntries.length; index += 1) {
      const [canonical, event] = variantEntries[index];
      if (
        mapGet(this.#contentHashes, canonical) === contentHash &&
        mapGet(this.#validation, canonical) === null &&
        arraySome(
          this.#acceptedEvents(),
          (accepted) =>
            accepted.eventId === eventId &&
            mapGet(this.#contentHashes, canonicalJson(accepted)) === contentHash,
        )
      ) {
        return event;
      }
    }
    throw new RangeError(`missing valid event variant: ${eventId}/${contentHash}`);
  }

  exactStateDescriptor() {
    return this.#exactStateDescriptor();
  }

  #exactStateDescriptor() {
    const observations = [];
    const observationEntries = mapEntries(this.#observations);
    for (let index = 0; index < observationEntries.length; index += 1) {
      const [eventId, variants] = observationEntries[index];
      const variantEntries = mapEntries(variants);
      for (
        let variantIndex = 0;
        variantIndex < variantEntries.length;
        variantIndex += 1
      ) {
        const canonical = variantEntries[variantIndex][0];
        arrayPush(
          observations,
          deepFreeze({
            eventId,
            contentHash: mapGet(this.#contentHashes, canonical),
            validationReason: mapGet(this.#validation, canonical),
          }),
        );
      }
    }
    arraySort(
      observations,
      (left, right) =>
        compareText(left.eventId, right.eventId) ||
        compareText(left.contentHash, right.contentHash),
    );
    const acceptedEventRefs = arrayMap(
      this.#acceptedEvents(),
      (event) =>
        deepFreeze({
          eventId: event.eventId,
          contentHash: mapGet(this.#contentHashes, canonicalJson(event)),
        }),
    );
    return deepFreeze({
      profileId: this.#profileId,
      profileEpoch: this.#profileEpoch,
      observations: freeze(observations),
      acceptedEventRefs: freeze(acceptedEventRefs),
      quarantine: this.#quarantineEntries(),
    });
  }

  get acceptedCount() {
    return this.#acceptedEvents().length;
  }

  get observationCount() {
    return this.#observationList().length;
  }
}

const ledgerIntrinsics = freeze({
  exactStateDescriptor: AppendOnlyLedger.prototype.exactStateDescriptor,
  identity: AppendOnlyLedger.prototype.identity,
  observations: AppendOnlyLedger.prototype.observations,
  resolveEventReference: AppendOnlyLedger.prototype.resolveEventReference,
  settled: AppendOnlyLedger.prototype.settled,
});

freeze(AppendOnlyLedger.prototype);
freeze(AppendOnlyLedger);

function requireExactLedger(ledger, operation) {
  if (
    !weakSetHas(exactLedgerInstances, ledger) ||
    getPrototypeOf(ledger) !== AppendOnlyLedger.prototype ||
    ledger.constructor !== AppendOnlyLedger
  ) {
    throw new TypeError(`${operation} requires an exact AppendOnlyLedger instance`);
  }
}

function exactLedgerIdentity(ledger) {
  return applyIntrinsic(ledgerIntrinsics.identity, ledger, []);
}

function exactLedgerObservations(ledger) {
  return applyIntrinsic(ledgerIntrinsics.observations, ledger, []);
}

function exactLedgerStateDescriptor(ledger) {
  return applyIntrinsic(ledgerIntrinsics.exactStateDescriptor, ledger, []);
}

function exactResolveEventReference(ledger, reference) {
  return applyIntrinsic(
    ledgerIntrinsics.resolveEventReference,
    ledger,
    [reference],
  );
}

function exactLedgerSettled(ledger) {
  return applyIntrinsic(ledgerIntrinsics.settled, ledger, []);
}

async function unionMergeAsync(identity, sources) {
  const normalizedIdentity = normalizeJson(identity);
  if (!hasExactKeys(normalizedIdentity, ["profileEpoch", "profileId"])) {
    throw new TypeError("unionMerge requires an exact ledger identity");
  }
  const observations = [];
  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index];
    if (weakSetHas(exactLedgerInstances, source)) {
      requireExactLedger(source, "unionMerge");
      await hardenPromise(exactLedgerSettled(source));
      if (
        canonicalJson(exactLedgerIdentity(source)) !==
        canonicalJson(normalizedIdentity)
      ) {
        throw new RangeError("cannot merge a different profile identity/epoch");
      }
      arrayPushAll(observations, exactLedgerObservations(source));
    } else if (isArray(source)) {
      arrayPushAll(
        observations,
        source,
        `unionMerge source[${index}]`,
      );
    } else {
      throw new TypeError("unionMerge sources must be exact ledgers or event arrays");
    }
  }
  arraySort(
    observations,
    (left, right) =>
      compareText(intrinsicString(left.eventId), intrinsicString(right.eventId)) ||
      compareText(canonicalJson(left), canonicalJson(right)),
  );
  const merged = new AppendOnlyLedger(normalizedIdentity);
  for (let index = 0; index < observations.length; index += 1) {
    await hardenPromise(merged.append(observations[index]));
  }
  return merged;
}

export function unionMerge(identity, ...sources) {
  return hardenPromise(unionMergeAsync(identity, sources));
}

function revisionBody({
  profileId,
  profileEpoch,
  stateDigest,
  observationCount,
  acceptedEventRefs,
  quarantine,
}) {
  return {
    format: "focus-hero-ledger-revision-v2",
    profileId,
    profileEpoch,
    stateDigest,
    observationCount,
    eventCount: acceptedEventRefs.length,
    acceptedEventRefs,
    quarantine,
  };
}

async function captureRevisionAsync(ledger) {
  requireExactLedger(ledger, "captureRevision");
  await hardenPromise(exactLedgerSettled(ledger));
  const state = exactLedgerStateDescriptor(ledger);
  const stateDigest = await hardenPromise(sha256Hex(canonicalJson(state)));
  const body = revisionBody({
    profileId: state.profileId,
    profileEpoch: state.profileEpoch,
    stateDigest,
    observationCount: state.observations.length,
    acceptedEventRefs: cloneNormalizedJson(state.acceptedEventRefs),
    quarantine: cloneNormalizedJson(state.quarantine),
  });
  const revision = deepFreeze({
    ...body,
    digest: await hardenPromise(sha256Hex(canonicalJson(body))),
    authorityToken: randomAuthorityToken(),
  });
  mapSet(
    weakMapGet(revisionAuthority, ledger),
    revision.authorityToken,
    canonicalJson(revision),
  );
  return revision;
}

export function captureRevision(ledger) {
  return hardenPromise(captureRevisionAsync(ledger));
}

async function resolveRevisionAsync(ledger, requestedRevision) {
  requireExactLedger(ledger, "resolveRevision");
  await hardenPromise(exactLedgerSettled(ledger));
  const revision = deepFreeze(normalizeJson(requestedRevision));
  if (
    !hasExactKeys(revision, [
      "acceptedEventRefs",
      "authorityToken",
      "digest",
      "eventCount",
      "format",
      "observationCount",
      "profileEpoch",
      "profileId",
      "quarantine",
      "stateDigest",
    ])
  ) {
    throw new TypeError("invalid ledger revision envelope");
  }
  if (
    revision.format !== "focus-hero-ledger-revision-v2" ||
    !isArray(revision.acceptedEventRefs) ||
    !isArray(revision.quarantine) ||
    revision.eventCount !== revision.acceptedEventRefs.length
  ) {
    throw new TypeError("invalid ledger revision manifest");
  }
  const issuedCanonical = mapGet(
    weakMapGet(revisionAuthority, ledger),
    revision.authorityToken,
  );
  if (!issuedCanonical || issuedCanonical !== canonicalJson(revision)) {
    throw new RangeError("revision is not an exact ledger-issued manifest");
  }
  const currentState = exactLedgerStateDescriptor(ledger);
  const currentStateDigest = await hardenPromise(
    sha256Hex(canonicalJson(currentState)),
  );
  if (
    revision.profileId !== currentState.profileId ||
    revision.profileEpoch !== currentState.profileEpoch ||
    revision.stateDigest !== currentStateDigest ||
    revision.observationCount !== currentState.observations.length ||
    canonicalJson(revision.acceptedEventRefs) !==
      canonicalJson(currentState.acceptedEventRefs) ||
    canonicalJson(revision.quarantine) !== canonicalJson(currentState.quarantine)
  ) {
    throw new RangeError("revision is stale or does not match exact ledger state");
  }
  const body = revisionBody({
    profileId: revision.profileId,
    profileEpoch: revision.profileEpoch,
    stateDigest: revision.stateDigest,
    observationCount: revision.observationCount,
    acceptedEventRefs: revision.acceptedEventRefs,
    quarantine: revision.quarantine,
  });
  if (
    revision.digest !==
    (await hardenPromise(sha256Hex(canonicalJson(body))))
  ) {
    throw new RangeError("ledger revision digest mismatch");
  }
  const unique = new intrinsicSet();
  for (
    let index = 0;
    index < revision.acceptedEventRefs.length;
    index += 1
  ) {
    const reference = revision.acceptedEventRefs[index];
    setAdd(unique, `${reference.eventId}\u0000${reference.contentHash}`);
  }
  if (setSize(unique) !== revision.acceptedEventRefs.length) {
    throw new RangeError("ledger revision contains duplicate references");
  }
  const resolvedEvents = [];
  for (
    let index = 0;
    index < revision.acceptedEventRefs.length;
    index += 1
  ) {
    const reference = revision.acceptedEventRefs[index];
    if (!hasExactKeys(reference, ["contentHash", "eventId"])) {
      throw new TypeError("invalid accepted event reference");
    }
    requireString(reference.eventId, "accepted event reference eventId");
    requireSha256Hex(
      reference.contentHash,
      "accepted event reference contentHash",
    );
    const event = exactResolveEventReference(ledger, reference);
    const canonical = canonicalJson(event);
    const actualContentHash = await hardenPromise(sha256Hex(canonical));
    if (
      event.eventId !== reference.eventId ||
      actualContentHash !== reference.contentHash
    ) {
      throw new RangeError(
        "resolved event bytes do not match the accepted event reference",
      );
    }
    const reason = await hardenPromise(
      validationReason(event, deterministicEventId),
    );
    if (reason) {
      throw new RangeError(`resolved event failed projection validation: ${reason}`);
    }
    if (
      event.profileId !== currentState.profileId ||
      event.profileEpoch !== currentState.profileEpoch
    ) {
      throw new RangeError("resolved event does not match the ledger profile epoch");
    }
    arrayPush(resolvedEvents, event);
  }
  return sealPromiseResolutionValue({
    revision,
    events: dependencyOrder(resolvedEvents),
  });
}

function resolveRevision(ledger, requestedRevision) {
  return hardenPromise(resolveRevisionAsync(ledger, requestedRevision));
}

function conflict(event, reason, actualRevision = null) {
  return deepFreeze({
    eventId: event.eventId,
    sessionId: event.payload.sessionId,
    reason,
    expectedRevision: event.payload.expectedRevision,
    actualRevision,
  });
}

function concurrentExactBranches(events) {
  const groups = new intrinsicMap();
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const key =
      event.type === "session.created"
        ? canonicalJson([
            "create",
            event.profileId,
            event.profileEpoch,
            event.payload.sessionId,
          ])
        : canonicalJson([
            "exact-mutation",
            event.profileId,
            event.profileEpoch,
            event.payload.sessionId,
            event.payload.parentEventId,
            event.payload.expectedRevision,
          ]);
    let group = mapGet(groups, key);
    if (!group) {
      group = [];
      mapSet(groups, key, group);
    }
    arrayPush(group, event);
  }
  const unresolved = new intrinsicSet();
  const groupValues = mapValues(groups);
  for (let index = 0; index < groupValues.length; index += 1) {
    const group = groupValues[index];
    if (group.length > 1) {
      arrayForEach(group, (event) => setAdd(unresolved, event.eventId));
    }
  }
  return unresolved;
}

function projectRewards(sessions) {
  const receipts = [];
  let xp = 0;
  let coins = 0;
  for (let sessionIndex = 0; sessionIndex < sessions.length; sessionIndex += 1) {
    const session = sessions[sessionIndex];
    if (session.deleted) continue;
    const tiers = REWARD_POLICIES[session.rewardPolicyVersion];
    if (!tiers) {
      throw new RangeError(
        `unknown committed reward policy: ${session.rewardPolicyVersion}`,
      );
    }
    for (let tierIndex = 0; tierIndex < tiers.length; tierIndex += 1) {
      const tier = tiers[tierIndex];
      if (session.minutes < tier.minutes) continue;
      arrayPush(
        receipts,
        deepFreeze({
          rewardId: `${session.sessionId}:${session.rewardPolicyVersion}:minutes:${tier.minutes}`,
          sessionId: session.sessionId,
          rewardPolicyVersion: session.rewardPolicyVersion,
          thresholdMinutes: tier.minutes,
          xp: tier.xp,
          coins: tier.coins,
          loot: tier.loot,
        }),
      );
      xp = checkedSafeAdd(xp, tier.xp, "reward XP");
      coins = checkedSafeAdd(coins, tier.coins, "reward coins");
    }
  }
  arraySort(
    receipts,
    (left, right) =>
      compareText(left.sessionId, right.sessionId) ||
      left.thresholdMinutes - right.thresholdMinutes,
  );
  return deepFreeze({
    xp,
    coins,
    loot: freeze(arrayMap(receipts, (receipt) => receipt.loot)),
    receipts: freeze(receipts),
  });
}

async function projectLedgerAsync(
  ledger,
  options = {},
) {
  requireExactLedger(ledger, "projectLedger");
  if (
    !options ||
    typeof options !== "object" ||
    isArray(options) ||
    getPrototypeOf(options) !== intrinsicObjectPrototype ||
    !hasOwn(options, "profileId") ||
    arraySome(
      objectKeys(options),
      (key) => key !== "profileId" && key !== "revision",
    )
  ) {
    throw new TypeError(
      "projectLedger accepts only profileId and an optional issued revision",
    );
  }
  const profileId = ownDataValue(options, "profileId", "options.profileId");
  const revision =
    optionalOwnDataValue(options, "revision", "options.revision") ?? null;
  const normalizedProfileId = normalizeJson(profileId);
  requireString(normalizedProfileId, "profileId");
  const projectionIdentity = exactLedgerIdentity(ledger);
  if (normalizedProfileId !== projectionIdentity.profileId) {
    throw new RangeError("projection profile does not match ledger identity");
  }
  const resolved = await hardenPromise(
    resolveRevision(
      ledger,
      revision ??
        (await hardenPromise(captureRevision(ledger))),
    ),
  );
  const sessions = new intrinsicMap();
  const conflicts = [];
  const appliedEventIds = [];
  const unresolvedExactBranches = concurrentExactBranches(resolved.events);

  for (let index = 0; index < resolved.events.length; index += 1) {
    const event = resolved.events[index];
    if (
      event.profileId !== normalizedProfileId ||
      event.profileEpoch !== projectionIdentity.profileEpoch
    ) {
      throw new RangeError("projection event escaped the validated ledger identity");
    }
    const { sessionId, expectedRevision, parentEventId } = event.payload;
    const current = mapGet(sessions, sessionId);
    const actualRevision = current?.revision ?? 0;
    if (setHas(unresolvedExactBranches, event.eventId)) {
      arrayPush(
        conflicts,
        conflict(
          event,
          event.type === "session.created"
            ? "CONCURRENT_CREATE_REVIEW_REQUIRED"
            : "CONCURRENT_EXACT_BRANCH_REVIEW_REQUIRED",
          actualRevision,
        ),
      );
      continue;
    }
    if (
      event.type !== "session.created" &&
      (!current || parentEventId !== current.lastEventId)
    ) {
      arrayPush(
        conflicts,
        conflict(
          event,
          current ? "PARENT_REVISION_MISMATCH" : "PARENT_NOT_FOUND",
          actualRevision,
        ),
      );
      continue;
    }
    if (expectedRevision !== actualRevision) {
      arrayPush(
        conflicts,
        conflict(event, "REVISION_MISMATCH", actualRevision),
      );
      continue;
    }

    if (event.type === "session.created") {
      if (current) {
        arrayPush(
          conflicts,
          conflict(event, "SESSION_ALREADY_EXISTS", actualRevision),
        );
        continue;
      }
      mapSet(sessions, sessionId, {
        sessionId,
        revision: 1,
        minutes: event.payload.minutes,
        rewardPolicyVersion: event.payload.rewardPolicyVersion,
        deleted: false,
        lastEventId: event.eventId,
      });
    } else if (event.type === "session.minutes_set") {
      if (!current || current.deleted) {
        arrayPush(
          conflicts,
          conflict(event, "SESSION_NOT_EDITABLE", actualRevision),
        );
        continue;
      }
      mapSet(sessions, sessionId, {
        ...current,
        revision: checkedSafeAdd(
          current.revision,
          1,
          "session revision",
        ),
        minutes: event.payload.minutes,
        lastEventId: event.eventId,
      });
    } else if (event.type === "session.deleted") {
      if (!current || current.deleted) {
        arrayPush(
          conflicts,
          conflict(event, "SESSION_NOT_DELETABLE", actualRevision),
        );
        continue;
      }
      mapSet(sessions, sessionId, {
        ...current,
        revision: checkedSafeAdd(
          current.revision,
          1,
          "session revision",
        ),
        minutes: 0,
        deleted: true,
        lastEventId: event.eventId,
      });
    }
    arrayPush(appliedEventIds, event.eventId);
  }

  const projectedSessions = arrayMap(
    arraySort(
      mapValues(sessions),
      (left, right) => compareText(left.sessionId, right.sessionId),
    ),
    (session) => deepFreeze({ ...session }),
  );
  const {
    authorityToken: _authorityToken,
    ...publicRevision
  } = resolved.revision;
  return deepFreeze({
    profileId: normalizedProfileId,
    revision: deepFreeze({
      ...publicRevision,
      appliedEventCount: appliedEventIds.length,
    }),
    totalMinutes: arrayReduce(
      projectedSessions,
      (sum, session) =>
        checkedSafeAdd(
          sum,
          session.deleted ? 0 : session.minutes,
          "total focused minutes",
        ),
      0,
    ),
    sessions: freeze(projectedSessions),
    rewards: projectRewards(projectedSessions),
    conflicts: freeze(conflicts),
    ledgerQuarantine: resolved.revision.quarantine,
  });
}

export function projectLedger(ledger, options = {}) {
  return hardenPromise(projectLedgerAsync(ledger, options));
}

export const rewardPolicyCatalog = REWARD_POLICIES;
