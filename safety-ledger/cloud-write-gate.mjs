/*
 * Pure capability gate only. This module performs no cloud or storage access.
 */

export const CLOUD_LEDGER_PROTOCOL_VERSION = 2;

const intrinsicReflectApply = Reflect.apply;
const intrinsicObjectFreeze = Object.freeze;
const intrinsicStringTrim = String.prototype.trim;
const intrinsicStringCharCodeAt = String.prototype.charCodeAt;
const intrinsicNumberIsSafeInteger = Number.isSafeInteger;
const intrinsicNumberMaxSafeInteger = Number.MAX_SAFE_INTEGER;
const intrinsicError = Error;
const intrinsicTypeError = TypeError;

function frozenDecision(allowed, code, message) {
  return intrinsicObjectFreeze({ allowed, code, message });
}

export function evaluateProtocolV2CloudWrite(capability) {
  if (!capability || typeof capability !== "object") {
    return frozenDecision(false, "CAPABILITY_MISSING", "No cloud adapter capability");
  }
  if (capability.adapterKind === "json-storage") {
    return frozenDecision(
      false,
      "JSONSTORAGE_PROTOCOL_V2_WRITE_DISABLED",
      "Protocol-v2 cloud writes require atomic cloud_rev CAS",
    );
  }
  return frozenDecision(
    false,
    "TRUSTED_ADAPTER_UNAVAILABLE",
    "No authenticated transactional cloud adapter is installed",
  );
}

function requireString(value, field) {
  if (
    typeof value !== "string" ||
    intrinsicReflectApply(intrinsicStringTrim, value, []) === ""
  ) {
    throw new intrinsicTypeError(`${field} must be a non-empty string`);
  }
}

function requireSha256Hex(value, field) {
  if (typeof value !== "string" || value.length !== 64) {
    throw new intrinsicTypeError(
      `${field} must be 64 lowercase SHA-256 hex characters`,
    );
  }
  for (let index = 0; index < value.length; index += 1) {
    const code = intrinsicReflectApply(
      intrinsicStringCharCodeAt,
      value,
      [index],
    );
    if (!((code >= 48 && code <= 57) || (code >= 97 && code <= 102))) {
      throw new intrinsicTypeError(
        `${field} must be 64 lowercase SHA-256 hex characters`,
      );
    }
  }
}

export function createProtocolV2CasIntent({
  capability,
  profileId,
  expectedCloudRev,
  revisionDigest,
  eventBatchDigest,
}) {
  const decision = evaluateProtocolV2CloudWrite(capability);
  if (decision.code === "JSONSTORAGE_PROTOCOL_V2_WRITE_DISABLED") {
    const error = new intrinsicError(decision.message);
    error.code = decision.code;
    throw error;
  }
  requireString(profileId, "profileId");
  requireSha256Hex(revisionDigest, "revisionDigest");
  requireSha256Hex(eventBatchDigest, "eventBatchDigest");
  if (
    !intrinsicNumberIsSafeInteger(expectedCloudRev) ||
    expectedCloudRev < 0 ||
    expectedCloudRev >= intrinsicNumberMaxSafeInteger
  ) {
    throw new intrinsicTypeError(
      "expectedCloudRev must allow an exact safe-integer increment",
    );
  }
  const error = new intrinsicError(decision.message);
  error.code = decision.code;
  throw error;
}
