/*
 * Isolated synthetic-only IndexedDB durability adapter for the Focus Hero
 * protocol-v2 ledger.
 *
 * This module is inert until explicitly constructed. It has no application,
 * DOM, profile, cloud, network, backup, recovery, or credential access.
 */

import {
  AppendOnlyLedger,
  canonicalJson,
  captureRevision,
  createEvent,
  eventBody,
  sha256Hex,
} from "./browser-ledger.mjs";

export const SYNTHETIC_DATABASE_PREFIX = "focus-hero-synthetic-ledger-";
export const DURABLE_ADAPTER_VERSION = 3;

const DATABASE_VERSION = 2;
const EVENT_FORMAT = "focus-hero-durable-event-v2";
const REVISION_FORMAT = "focus-hero-durable-revision-v1";
const HEAD_FORMAT = "focus-hero-durable-head-v1";
const COMMAND_FORMAT = "focus-hero-command-reservation-v1";
const COMMAND_CONFLICT_FORMAT = "focus-hero-command-conflict-v1";
const ALLOCATOR_FORMAT = "focus-hero-actor-allocator-v1";
const EVENTS_STORE = "events";
const REVISIONS_STORE = "revisions";
const HEADS_STORE = "heads";
const COMMANDS_STORE = "commands";
const COMMAND_CONFLICTS_STORE = "commandConflicts";
const ALLOCATORS_STORE = "actorAllocators";
const PROFILE_INDEX = "byProfile";
const COMMAND_INDEX = "byCommand";
const MAX_CAS_ATTEMPTS = 12;

const intrinsicJsonParse = JSON.parse;
const intrinsicObjectKeys = Object.keys;
const intrinsicObjectPrototype = Object.prototype;
const intrinsicObjectGetPrototypeOf = Object.getPrototypeOf;
const intrinsicObjectHasOwnProperty = Object.prototype.hasOwnProperty;
const intrinsicReflectApply = Reflect.apply;
const intrinsicStringPadStart = String.prototype.padStart;

function applyIntrinsic(method, receiver, args) {
  return intrinsicReflectApply(method, receiver, args);
}

function hasOwn(value, key) {
  return applyIntrinsic(intrinsicObjectHasOwnProperty, value, [key]);
}

function requirePlainObject(value, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    intrinsicObjectGetPrototypeOf(value) !== intrinsicObjectPrototype
  ) {
    throw new TypeError(`${label} must be a plain object`);
  }
  return value;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function requireSafePositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return value;
}

function assertExactKeys(value, expected, label) {
  requirePlainObject(value, label);
  const actual = intrinsicObjectKeys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    throw new TypeError(`${label} has an invalid envelope`);
  }
  return value;
}

function parseCanonical(value) {
  return applyIntrinsic(intrinsicJsonParse, JSON, [canonicalJson(value)]);
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    transaction.onerror = () => {
      // onabort is the authoritative terminal signal.
    };
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function openDatabase(indexedDBFactory, databaseName) {
  return new Promise((resolve, reject) => {
    const request = indexedDBFactory.open(databaseName, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(EVENTS_STORE)) {
        const events = database.createObjectStore(EVENTS_STORE, {
          keyPath: "storageKey",
        });
        events.createIndex(PROFILE_INDEX, "profileKey", { unique: false });
      }
      if (!database.objectStoreNames.contains(REVISIONS_STORE)) {
        const revisions = database.createObjectStore(REVISIONS_STORE, {
          keyPath: "revisionKey",
        });
        revisions.createIndex(PROFILE_INDEX, "profileKey", { unique: false });
      }
      if (!database.objectStoreNames.contains(HEADS_STORE)) {
        database.createObjectStore(HEADS_STORE, { keyPath: "profileKey" });
      }
      if (!database.objectStoreNames.contains(COMMANDS_STORE)) {
        const commands = database.createObjectStore(COMMANDS_STORE, {
          keyPath: "commandKey",
        });
        commands.createIndex(PROFILE_INDEX, "profileKey", { unique: false });
      }
      if (!database.objectStoreNames.contains(COMMAND_CONFLICTS_STORE)) {
        const conflicts = database.createObjectStore(COMMAND_CONFLICTS_STORE, {
          keyPath: "conflictKey",
        });
        conflicts.createIndex(PROFILE_INDEX, "profileKey", { unique: false });
        conflicts.createIndex(COMMAND_INDEX, "commandKey", { unique: false });
      }
      if (!database.objectStoreNames.contains(ALLOCATORS_STORE)) {
        const allocators = database.createObjectStore(ALLOCATORS_STORE, {
          keyPath: "allocatorKey",
        });
        allocators.createIndex(PROFILE_INDEX, "profileKey", { unique: false });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      for (const storeName of [
        EVENTS_STORE,
        REVISIONS_STORE,
        HEADS_STORE,
        COMMANDS_STORE,
        COMMAND_CONFLICTS_STORE,
        ALLOCATORS_STORE,
      ]) {
        if (!database.objectStoreNames.contains(storeName)) {
          database.close();
          reject(new Error(`IndexedDB schema is missing ${storeName}`));
          return;
        }
      }
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () =>
      reject(request.error ?? new Error("unable to open IndexedDB"));
    request.onblocked = () =>
      reject(new Error("IndexedDB upgrade is blocked by another context"));
  });
}

function strictTransaction(database, storeNames, mode) {
  if (mode !== "readwrite") {
    return database.transaction(storeNames, mode);
  }
  try {
    return database.transaction(storeNames, mode, { durability: "strict" });
  } catch {
    return database.transaction(storeNames, mode);
  }
}

function stripAuthorityToken(revision) {
  const plain = parseCanonical(revision);
  if (!hasOwn(plain, "authorityToken")) {
    throw new TypeError("ledger revision has no authority token");
  }
  delete plain.authorityToken;
  return parseCanonical(plain);
}

function sameHead(left, right) {
  if (left === undefined || left === null) {
    return right === undefined || right === null;
  }
  if (right === undefined || right === null) {
    return false;
  }
  return (
    left.format === right.format &&
    left.profileKey === right.profileKey &&
    left.localRevision === right.localRevision &&
    left.revisionDigest === right.revisionDigest &&
    left.stateDigest === right.stateDigest &&
    left.observationCount === right.observationCount &&
    left.eventCount === right.eventCount
  );
}

function revisionNumberKey(value) {
  return applyIntrinsic(intrinsicStringPadStart, String(value), [16, "0"]);
}

function publicAppendResult(value) {
  return parseCanonical(value);
}

export class DurableLedgerConflictError extends Error {
  constructor(message = "durable ledger head changed too many times") {
    super(message);
    this.name = "DurableLedgerConflictError";
  }
}

export class DurableCommandConflictError extends Error {
  constructor(commandId) {
    super(`commandId ${commandId} has conflicting canonical bytes`);
    this.name = "DurableCommandConflictError";
    this.commandId = commandId;
  }
}

export class DurableCommandReservationError extends Error {
  constructor(commandId) {
    super(`commandId ${commandId} has no durable reservation`);
    this.name = "DurableCommandReservationError";
    this.commandId = commandId;
  }
}

export class SyntheticIndexedDbLedgerAdapter {
  #databaseName;
  #databasePromise;
  #identity;
  #indexedDB;
  #locks;
  #profileKeyPromise;
  #syntheticFaultInjector;
  #fallbackQueue = Promise.resolve();

  constructor(options) {
    requirePlainObject(options, "options");
    const allowed = new Set([
      "databaseName",
      "indexedDB",
      "locks",
      "profileEpoch",
      "profileId",
      "syntheticFaultInjector",
    ]);
    for (const key of intrinsicObjectKeys(options)) {
      if (!allowed.has(key)) {
        throw new TypeError(`unsupported adapter option ${key}`);
      }
    }
    for (const required of [
      "databaseName",
      "indexedDB",
      "profileEpoch",
      "profileId",
    ]) {
      if (!hasOwn(options, required)) {
        throw new TypeError(`missing adapter option ${required}`);
      }
    }

    this.#databaseName = requireString(options.databaseName, "databaseName");
    if (!this.#databaseName.startsWith(SYNTHETIC_DATABASE_PREFIX)) {
      throw new TypeError(
        `databaseName must begin with ${SYNTHETIC_DATABASE_PREFIX}`,
      );
    }
    if (
      options.indexedDB === null ||
      typeof options.indexedDB !== "object" ||
      typeof options.indexedDB.open !== "function"
    ) {
      throw new TypeError("indexedDB must be an injected IDBFactory");
    }
    if (
      hasOwn(options, "locks") &&
      options.locks !== null &&
      (typeof options.locks !== "object" ||
        typeof options.locks.request !== "function")
    ) {
      throw new TypeError("locks must be null or a Web Locks-compatible object");
    }
    if (
      hasOwn(options, "syntheticFaultInjector") &&
      options.syntheticFaultInjector !== null &&
      typeof options.syntheticFaultInjector !== "function"
    ) {
      throw new TypeError(
        "syntheticFaultInjector must be null or a function",
      );
    }

    this.#identity = parseCanonical({
      profileId: requireString(options.profileId, "profileId"),
      profileEpoch: requireString(options.profileEpoch, "profileEpoch"),
    });
    this.#indexedDB = options.indexedDB;
    this.#locks = hasOwn(options, "locks") ? options.locks : null;
    this.#syntheticFaultInjector = hasOwn(options, "syntheticFaultInjector")
      ? options.syntheticFaultInjector
      : null;
    this.#profileKeyPromise = sha256Hex(canonicalJson(this.#identity));
    this.#databasePromise = openDatabase(
      this.#indexedDB,
      this.#databaseName,
    );
  }

  identity() {
    return parseCanonical(this.#identity);
  }

  async #database() {
    return this.#databasePromise;
  }

  async #profileKey() {
    return this.#profileKeyPromise;
  }

  async #readSnapshot() {
    const [database, profileKey] = await Promise.all([
      this.#database(),
      this.#profileKey(),
    ]);
    const transaction = strictTransaction(
      database,
      [
        EVENTS_STORE,
        REVISIONS_STORE,
        HEADS_STORE,
        COMMANDS_STORE,
        COMMAND_CONFLICTS_STORE,
        ALLOCATORS_STORE,
      ],
      "readonly",
    );
    const done = transactionDone(transaction);
    const eventRequest = transaction
      .objectStore(EVENTS_STORE)
      .index(PROFILE_INDEX)
      .getAll(profileKey);
    const revisionRequest = transaction
      .objectStore(REVISIONS_STORE)
      .index(PROFILE_INDEX)
      .getAll(profileKey);
    const commandRequest = transaction
      .objectStore(COMMANDS_STORE)
      .index(PROFILE_INDEX)
      .getAll(profileKey);
    const commandConflictRequest = transaction
      .objectStore(COMMAND_CONFLICTS_STORE)
      .index(PROFILE_INDEX)
      .getAll(profileKey);
    const allocatorRequest = transaction
      .objectStore(ALLOCATORS_STORE)
      .index(PROFILE_INDEX)
      .getAll(profileKey);
    const headRequest = transaction.objectStore(HEADS_STORE).get(profileKey);
    const [
      events,
      revisions,
      commands,
      commandConflicts,
      allocators,
      head,
    ] = await Promise.all([
      requestResult(eventRequest),
      requestResult(revisionRequest),
      requestResult(commandRequest),
      requestResult(commandConflictRequest),
      requestResult(allocatorRequest),
      requestResult(headRequest),
    ]);
    await done;
    return {
      events,
      revisions,
      commands,
      commandConflicts,
      allocators,
      head,
    };
  }

  async #verifyEventRecord(record, profileKey) {
    assertExactKeys(
      record,
      [
        "contentDigest",
        "commandKey",
        "event",
        "eventId",
        "format",
        "profileEpoch",
        "profileId",
        "profileKey",
        "storageKey",
      ],
      "durable event",
    );
    if (
      record.format !== EVENT_FORMAT ||
      record.profileKey !== profileKey ||
      record.profileId !== this.#identity.profileId ||
      record.profileEpoch !== this.#identity.profileEpoch
    ) {
      throw new Error("durable event identity mismatch");
    }
    if (
      record.commandKey !== null &&
      (typeof record.commandKey !== "string" ||
        record.commandKey.length === 0)
    ) {
      throw new Error("durable event command key is invalid");
    }
    const canonical = canonicalJson(record.event);
    const digest = await sha256Hex(canonical);
    if (
      record.contentDigest !== digest ||
      record.eventId !== record.event.eventId ||
      record.storageKey !== `${profileKey}:${digest}`
    ) {
      throw new Error("durable event integrity check failed");
    }
    return parseCanonical(record);
  }

  async #verifyRevisionRecord({
    record,
    profileKey,
    expectedLocalRevision,
    previousRevisionDigest,
    eventByStorageKey,
    replayLedger,
    usedEventKeys,
  }) {
    assertExactKeys(
      record,
      [
        "appendResult",
        "digest",
        "format",
        "ledgerManifest",
        "localRevision",
        "previousRevisionDigest",
        "profileEpoch",
        "profileId",
        "profileKey",
        "revisionKey",
        "triggerEventStorageKey",
      ],
      "durable revision",
    );
    if (
      record.format !== REVISION_FORMAT ||
      record.profileKey !== profileKey ||
      record.profileId !== this.#identity.profileId ||
      record.profileEpoch !== this.#identity.profileEpoch ||
      record.localRevision !== expectedLocalRevision ||
      record.previousRevisionDigest !== previousRevisionDigest
    ) {
      throw new Error("durable revision chain mismatch");
    }
    if (usedEventKeys.has(record.triggerEventStorageKey)) {
      throw new Error("durable revision reuses a trigger event");
    }
    const eventRecord = eventByStorageKey.get(record.triggerEventStorageKey);
    if (!eventRecord) {
      throw new Error("durable revision trigger event is missing");
    }
    const appendResult = publicAppendResult(
      await replayLedger.append(eventRecord.event),
    );
    if (canonicalJson(appendResult) !== canonicalJson(record.appendResult)) {
      throw new Error("durable revision append result mismatch");
    }
    const issued = await captureRevision(replayLedger);
    const ledgerManifest = stripAuthorityToken(issued);
    if (canonicalJson(ledgerManifest) !== canonicalJson(record.ledgerManifest)) {
      throw new Error("durable revision ledger manifest mismatch");
    }
    const body = {
      format: record.format,
      profileKey: record.profileKey,
      profileId: record.profileId,
      profileEpoch: record.profileEpoch,
      localRevision: record.localRevision,
      previousRevisionDigest: record.previousRevisionDigest,
      triggerEventStorageKey: record.triggerEventStorageKey,
      appendResult: record.appendResult,
      ledgerManifest: record.ledgerManifest,
    };
    const digest = await sha256Hex(canonicalJson(body));
    const expectedKey =
      `${profileKey}:${revisionNumberKey(record.localRevision)}:${digest}`;
    if (record.digest !== digest || record.revisionKey !== expectedKey) {
      throw new Error("durable revision digest mismatch");
    }
    usedEventKeys.add(record.triggerEventStorageKey);
    return record;
  }

  async #commandDescriptor(input, profileKey) {
    const command = parseCanonical(input);
    assertExactKeys(
      command,
      ["actorId", "commandId", "logicalTime", "payload", "type"],
      "command",
    );
    requireString(command.commandId, "command.commandId");
    requireString(command.actorId, "command.actorId");
    requireSafePositiveInteger(command.logicalTime, "command.logicalTime");
    requireString(command.type, "command.type");
    const commandBody = parseCanonical({
      profileId: this.#identity.profileId,
      profileEpoch: this.#identity.profileEpoch,
      commandId: command.commandId,
      actorId: command.actorId,
      logicalTime: command.logicalTime,
      type: command.type,
      payload: command.payload,
    });
    const commandDigest = await sha256Hex(canonicalJson(commandBody));
    const commandIdDigest = await sha256Hex(
      canonicalJson(command.commandId),
    );
    const actorDigest = await sha256Hex(canonicalJson(command.actorId));
    const preview = await createEvent({
      profileId: commandBody.profileId,
      profileEpoch: commandBody.profileEpoch,
      actorId: commandBody.actorId,
      actorSequence: 1,
      logicalTime: commandBody.logicalTime,
      type: commandBody.type,
      payload: commandBody.payload,
    });
    const previewLedger = new AppendOnlyLedger(this.#identity);
    const previewResult = await previewLedger.append(preview);
    if (previewResult.status !== "appended") {
      throw new TypeError(
        `command cannot create a valid ledger event: ${previewResult.reason}`,
      );
    }
    return {
      commandBody,
      commandDigest,
      commandKey: `${profileKey}:${commandIdDigest}`,
      allocatorKey: `${profileKey}:${actorDigest}`,
    };
  }

  async #eventForCommandReservation(record) {
    return parseCanonical(record.event);
  }

  async #verifyCommandRecord(record, profileKey, revisionsByNumber) {
    assertExactKeys(
      record,
      [
        "actorSequence",
        "allocatorKey",
        "commandBody",
        "commandDigest",
        "commandKey",
        "event",
        "eventInput",
        "format",
        "profileKey",
        "reservationDigest",
        "reservedHeadDigest",
        "reservedHeadRevision",
      ],
      "command reservation",
    );
    assertExactKeys(
      record.commandBody,
      [
        "actorId",
        "commandId",
        "logicalTime",
        "payload",
        "profileEpoch",
        "profileId",
        "type",
      ],
      "command body",
    );
    if (
      record.format !== COMMAND_FORMAT ||
      record.profileKey !== profileKey ||
      record.commandBody.profileId !== this.#identity.profileId ||
      record.commandBody.profileEpoch !== this.#identity.profileEpoch
    ) {
      throw new Error("command reservation identity mismatch");
    }
    requireString(record.commandBody.commandId, "commandBody.commandId");
    requireString(record.commandBody.actorId, "commandBody.actorId");
    requireString(record.commandBody.type, "commandBody.type");
    requireSafePositiveInteger(
      record.commandBody.logicalTime,
      "commandBody.logicalTime",
    );
    requireSafePositiveInteger(record.actorSequence, "actorSequence");
    if (
      !Number.isSafeInteger(record.reservedHeadRevision) ||
      record.reservedHeadRevision < 0
    ) {
      throw new Error("command reservation head revision is invalid");
    }
    const commandDigest = await sha256Hex(
      canonicalJson(record.commandBody),
    );
    const commandIdDigest = await sha256Hex(
      canonicalJson(record.commandBody.commandId),
    );
    const actorDigest = await sha256Hex(
      canonicalJson(record.commandBody.actorId),
    );
    if (
      record.commandDigest !== commandDigest ||
      record.commandKey !== `${profileKey}:${commandIdDigest}` ||
      record.allocatorKey !== `${profileKey}:${actorDigest}`
    ) {
      throw new Error("command reservation digest or key mismatch");
    }
    const expectedEventInput = eventBody({
      protocol: record.eventInput.protocol,
      writerProtocol: record.eventInput.writerProtocol,
      ledgerVersion: record.eventInput.ledgerVersion,
      schemaVersion: record.eventInput.schemaVersion,
      clientVersion: record.eventInput.clientVersion,
      profileId: record.commandBody.profileId,
      profileEpoch: record.commandBody.profileEpoch,
      actorId: record.commandBody.actorId,
      actorSequence: record.actorSequence,
      logicalTime: record.commandBody.logicalTime,
      type: record.commandBody.type,
      payload: record.commandBody.payload,
    });
    if (
      canonicalJson(record.eventInput) !== canonicalJson(expectedEventInput)
    ) {
      throw new Error("command reservation event input mismatch");
    }
    const expectedEvent = await createEvent(record.eventInput);
    if (canonicalJson(record.event) !== canonicalJson(expectedEvent)) {
      throw new Error("command reservation event bytes mismatch");
    }
    if (record.reservedHeadRevision === 0) {
      if (record.reservedHeadDigest !== null) {
        throw new Error("initial command reservation has a head digest");
      }
    } else {
      const reservedRevision = revisionsByNumber.get(
        record.reservedHeadRevision,
      );
      if (
        !reservedRevision ||
        reservedRevision.digest !== record.reservedHeadDigest
      ) {
        throw new Error("command reservation references an unknown head");
      }
    }
    const reservationBody = {
      format: record.format,
      profileKey: record.profileKey,
      commandKey: record.commandKey,
      commandDigest: record.commandDigest,
      commandBody: record.commandBody,
      eventInput: record.eventInput,
      event: record.event,
      allocatorKey: record.allocatorKey,
      actorSequence: record.actorSequence,
      reservedHeadRevision: record.reservedHeadRevision,
      reservedHeadDigest: record.reservedHeadDigest,
    };
    const reservationDigest = await sha256Hex(
      canonicalJson(reservationBody),
    );
    if (record.reservationDigest !== reservationDigest) {
      throw new Error("command reservation integrity check failed");
    }
    return parseCanonical(record);
  }

  async #verifyAllocatorRecord(record, profileKey) {
    assertExactKeys(
      record,
      [
        "actorId",
        "allocatorKey",
        "digest",
        "format",
        "lastSequence",
        "profileKey",
      ],
      "actor allocator",
    );
    if (
      record.format !== ALLOCATOR_FORMAT ||
      record.profileKey !== profileKey
    ) {
      throw new Error("actor allocator identity mismatch");
    }
    requireString(record.actorId, "allocator.actorId");
    requireSafePositiveInteger(record.lastSequence, "allocator.lastSequence");
    const actorDigest = await sha256Hex(canonicalJson(record.actorId));
    const body = {
      format: record.format,
      profileKey: record.profileKey,
      allocatorKey: record.allocatorKey,
      actorId: record.actorId,
      lastSequence: record.lastSequence,
    };
    const digest = await sha256Hex(canonicalJson(body));
    if (
      record.allocatorKey !== `${profileKey}:${actorDigest}` ||
      record.digest !== digest
    ) {
      throw new Error("actor allocator integrity check failed");
    }
    return parseCanonical(record);
  }

  async #verifyCommandConflictRecord(
    record,
    profileKey,
    commandByKey,
  ) {
    assertExactKeys(
      record,
      [
        "commandId",
        "commandKey",
        "conflictKey",
        "conflictingCommandBody",
        "conflictingCommandDigest",
        "digest",
        "existingCommandDigest",
        "format",
        "profileKey",
      ],
      "command conflict",
    );
    if (
      record.format !== COMMAND_CONFLICT_FORMAT ||
      record.profileKey !== profileKey
    ) {
      throw new Error("command conflict identity mismatch");
    }
    assertExactKeys(
      record.conflictingCommandBody,
      [
        "actorId",
        "commandId",
        "logicalTime",
        "payload",
        "profileEpoch",
        "profileId",
        "type",
      ],
      "conflicting command body",
    );
    if (
      record.conflictingCommandBody.profileId !== this.#identity.profileId ||
      record.conflictingCommandBody.profileEpoch !==
        this.#identity.profileEpoch
    ) {
      throw new Error("conflicting command identity mismatch");
    }
    const reservation = commandByKey.get(record.commandKey);
    if (
      !reservation ||
      reservation.commandBody.commandId !== record.commandId ||
      reservation.commandDigest !== record.existingCommandDigest
    ) {
      throw new Error("command conflict has no matching reservation");
    }
    const conflictingDigest = await sha256Hex(
      canonicalJson(record.conflictingCommandBody),
    );
    if (
      conflictingDigest !== record.conflictingCommandDigest ||
      conflictingDigest === record.existingCommandDigest ||
      record.conflictingCommandBody.commandId !== record.commandId
    ) {
      throw new Error("command conflict variant is invalid");
    }
    const body = {
      format: record.format,
      profileKey: record.profileKey,
      commandKey: record.commandKey,
      commandId: record.commandId,
      existingCommandDigest: record.existingCommandDigest,
      conflictingCommandDigest: record.conflictingCommandDigest,
      conflictingCommandBody: record.conflictingCommandBody,
    };
    const digest = await sha256Hex(canonicalJson(body));
    if (
      record.digest !== digest ||
      record.conflictKey !== `${record.commandKey}:${conflictingDigest}`
    ) {
      throw new Error("command conflict integrity check failed");
    }
    return parseCanonical(record);
  }

  async #verifyCommandState(
    snapshot,
    profileKey,
    eventRecords,
    revisionRecords,
  ) {
    const revisionsByNumber = new Map();
    for (const revision of revisionRecords) {
      revisionsByNumber.set(revision.localRevision, revision);
    }
    const commandRecords = [];
    const commandByKey = new Map();
    const sequenceClaims = new Set();
    const maximumSequenceByAllocator = new Map();
    for (const rawRecord of snapshot.commands) {
      const record = await this.#verifyCommandRecord(
        rawRecord,
        profileKey,
        revisionsByNumber,
      );
      if (commandByKey.has(record.commandKey)) {
        throw new Error("duplicate command reservation key");
      }
      const sequenceKey = canonicalJson([
        record.commandBody.actorId,
        record.actorSequence,
      ]);
      if (sequenceClaims.has(sequenceKey)) {
        throw new Error("command reservations reuse an actor sequence");
      }
      sequenceClaims.add(sequenceKey);
      commandByKey.set(record.commandKey, record);
      commandRecords.push(record);
      maximumSequenceByAllocator.set(
        record.allocatorKey,
        Math.max(
          maximumSequenceByAllocator.get(record.allocatorKey) ?? 0,
          record.actorSequence,
        ),
      );
    }
    commandRecords.sort((left, right) =>
      left.commandKey.localeCompare(right.commandKey)
    );

    const allocatorRecords = [];
    const allocatorByKey = new Map();
    for (const rawRecord of snapshot.allocators) {
      const record = await this.#verifyAllocatorRecord(rawRecord, profileKey);
      if (allocatorByKey.has(record.allocatorKey)) {
        throw new Error("duplicate actor allocator key");
      }
      allocatorByKey.set(record.allocatorKey, record);
      allocatorRecords.push(record);
    }
    if (allocatorRecords.length !== maximumSequenceByAllocator.size) {
      throw new Error("actor allocator coverage mismatch");
    }
    for (const [allocatorKey, maximumSequence] of maximumSequenceByAllocator) {
      const allocator = allocatorByKey.get(allocatorKey);
      if (!allocator || allocator.lastSequence !== maximumSequence) {
        throw new Error("actor allocator sequence mismatch");
      }
    }

    const commandConflictRecords = [];
    const commandConflictsByCommand = new Map();
    for (const rawRecord of snapshot.commandConflicts) {
      const record = await this.#verifyCommandConflictRecord(
        rawRecord,
        profileKey,
        commandByKey,
      );
      commandConflictRecords.push(record);
      const conflicts =
        commandConflictsByCommand.get(record.commandKey) ?? [];
      conflicts.push(record);
      commandConflictsByCommand.set(record.commandKey, conflicts);
    }
    commandConflictRecords.sort((left, right) =>
      left.conflictKey.localeCompare(right.conflictKey)
    );

    const completedCommandKeys = new Set();
    for (const eventRecord of eventRecords) {
      if (eventRecord.commandKey === null) {
        continue;
      }
      if (completedCommandKeys.has(eventRecord.commandKey)) {
        throw new Error("one command reservation produced multiple events");
      }
      const reservation = commandByKey.get(eventRecord.commandKey);
      if (!reservation) {
        throw new Error("durable event has no command reservation");
      }
      const expectedEvent = await this.#eventForCommandReservation(
        reservation,
      );
      if (canonicalJson(expectedEvent) !== canonicalJson(eventRecord.event)) {
        throw new Error("command reservation event mismatch");
      }
      completedCommandKeys.add(eventRecord.commandKey);
    }

    return {
      commandRecords,
      commandByKey,
      commandConflictRecords,
      commandConflictsByCommand,
      allocatorRecords,
      allocatorByKey,
      completedCommandKeys,
      pendingCommandCount:
        commandRecords.length - completedCommandKeys.size,
    };
  }

  async #verifyAndHydrate(snapshot) {
    const profileKey = await this.#profileKey();
    const eventRecords = [];
    for (const rawRecord of snapshot.events) {
      eventRecords.push(await this.#verifyEventRecord(rawRecord, profileKey));
    }
    eventRecords.sort((left, right) =>
      left.storageKey.localeCompare(right.storageKey)
    );
    const eventByStorageKey = new Map();
    for (const record of eventRecords) {
      if (eventByStorageKey.has(record.storageKey)) {
        throw new Error("duplicate durable event storage key");
      }
      eventByStorageKey.set(record.storageKey, record);
    }

    const revisionRecords = snapshot.revisions.map((record) =>
      parseCanonical(record)
    );
    revisionRecords.sort(
      (left, right) => left.localRevision - right.localRevision,
    );
    const ledger = new AppendOnlyLedger(this.#identity);
    const usedEventKeys = new Set();
    let previousRevisionDigest = null;
    for (let index = 0; index < revisionRecords.length; index += 1) {
      const record = await this.#verifyRevisionRecord({
        record: revisionRecords[index],
        profileKey,
        expectedLocalRevision: index + 1,
        previousRevisionDigest,
        eventByStorageKey,
        replayLedger: ledger,
        usedEventKeys,
      });
      previousRevisionDigest = record.digest;
    }
    if (usedEventKeys.size !== eventRecords.length) {
      throw new Error("durable event exists outside the revision chain");
    }

    const issuedRevision = await captureRevision(ledger);
    const currentManifest = stripAuthorityToken(issuedRevision);
    let durableHead = null;
    if (revisionRecords.length === 0) {
      if (snapshot.head !== undefined && snapshot.head !== null) {
        throw new Error("durable head exists without revisions");
      }
    } else {
      durableHead = parseCanonical(snapshot.head);
      assertExactKeys(
        durableHead,
        [
          "eventCount",
          "format",
          "localRevision",
          "observationCount",
          "profileEpoch",
          "profileId",
          "profileKey",
          "revisionDigest",
          "stateDigest",
        ],
        "durable head",
      );
      const last = revisionRecords[revisionRecords.length - 1];
      if (
        durableHead.format !== HEAD_FORMAT ||
        durableHead.profileKey !== profileKey ||
        durableHead.profileId !== this.#identity.profileId ||
        durableHead.profileEpoch !== this.#identity.profileEpoch ||
        durableHead.localRevision !== last.localRevision ||
        durableHead.revisionDigest !== last.digest ||
        durableHead.stateDigest !== last.ledgerManifest.stateDigest ||
        durableHead.observationCount !==
          last.ledgerManifest.observationCount ||
        durableHead.eventCount !== last.ledgerManifest.eventCount ||
        canonicalJson(currentManifest) !== canonicalJson(last.ledgerManifest)
      ) {
        throw new Error("durable head integrity check failed");
      }
    }
    const commandState = await this.#verifyCommandState(
      snapshot,
      profileKey,
      eventRecords,
      revisionRecords,
    );
    return {
      ledger,
      issuedRevision,
      currentManifest,
      durableHead,
      eventRecords,
      revisionRecords,
      ...commandState,
    };
  }

  #assertNoCommandConflicts(state) {
    if (state.commandConflictRecords.length > 0) {
      throw new DurableCommandConflictError(
        state.commandConflictRecords[0].commandId,
      );
    }
  }

  #publicCommandReservation(record, {
    finalized = false,
    newlyReserved = false,
  } = {}) {
    const command = parseCanonical({
      commandId: record.commandBody.commandId,
      actorId: record.commandBody.actorId,
      logicalTime: record.commandBody.logicalTime,
      type: record.commandBody.type,
      payload: record.commandBody.payload,
    });
    return parseCanonical({
      status: finalized ? "finalized" : "reserved",
      command,
      commandId: record.commandBody.commandId,
      commandDigest: record.commandDigest,
      actorSequence: record.actorSequence,
      eventId: record.event.eventId,
      reservationDigest: record.reservationDigest,
      newlyReserved,
      resumedReservation: !newlyReserved,
      finalized,
    });
  }

  async load() {
    const state = await this.#verifyAndHydrate(await this.#readSnapshot());
    this.#assertNoCommandConflicts(state);
    return {
      ledger: state.ledger,
      revision: state.issuedRevision,
      durableHead: state.durableHead,
      observationCount: state.eventRecords.length,
      durableRevisionCount: state.revisionRecords.length,
      commandReservationCount: state.commandRecords.length,
      pendingCommandCount: state.pendingCommandCount,
      commandQuarantine: state.commandConflictRecords.map((record) =>
        parseCanonical(record)
      ),
    };
  }

  async listDurableRevisions() {
    const state = await this.#verifyAndHydrate(await this.#readSnapshot());
    return state.revisionRecords.map((record) => parseCanonical(record));
  }

  async listCommandReservations() {
    const state = await this.#verifyAndHydrate(await this.#readSnapshot());
    return state.commandRecords.map((record) => parseCanonical(record));
  }

  async listCommandQuarantine() {
    const state = await this.#verifyAndHydrate(await this.#readSnapshot());
    return state.commandConflictRecords.map((record) =>
      parseCanonical(record)
    );
  }

  async #reservationRecord({
    descriptor,
    actorSequence,
    durableHead,
  }) {
    const eventInput = eventBody({
      profileId: descriptor.commandBody.profileId,
      profileEpoch: descriptor.commandBody.profileEpoch,
      actorId: descriptor.commandBody.actorId,
      actorSequence,
      logicalTime: descriptor.commandBody.logicalTime,
      type: descriptor.commandBody.type,
      payload: descriptor.commandBody.payload,
    });
    const event = await createEvent(eventInput);
    const body = parseCanonical({
      format: COMMAND_FORMAT,
      profileKey: await this.#profileKey(),
      commandKey: descriptor.commandKey,
      commandDigest: descriptor.commandDigest,
      commandBody: descriptor.commandBody,
      eventInput,
      event,
      allocatorKey: descriptor.allocatorKey,
      actorSequence,
      reservedHeadRevision: durableHead?.localRevision ?? 0,
      reservedHeadDigest: durableHead?.revisionDigest ?? null,
    });
    return parseCanonical({
      ...body,
      reservationDigest: await sha256Hex(canonicalJson(body)),
    });
  }

  async #allocatorRecord(descriptor, lastSequence) {
    const body = parseCanonical({
      format: ALLOCATOR_FORMAT,
      profileKey: await this.#profileKey(),
      allocatorKey: descriptor.allocatorKey,
      actorId: descriptor.commandBody.actorId,
      lastSequence,
    });
    return parseCanonical({
      ...body,
      digest: await sha256Hex(canonicalJson(body)),
    });
  }

  async #commandConflictRecord(existing, descriptor) {
    const body = parseCanonical({
      format: COMMAND_CONFLICT_FORMAT,
      profileKey: await this.#profileKey(),
      commandKey: existing.commandKey,
      commandId: existing.commandBody.commandId,
      existingCommandDigest: existing.commandDigest,
      conflictingCommandDigest: descriptor.commandDigest,
      conflictingCommandBody: descriptor.commandBody,
    });
    return parseCanonical({
      ...body,
      conflictKey: `${existing.commandKey}:${descriptor.commandDigest}`,
      digest: await sha256Hex(canonicalJson(body)),
    });
  }

  #maximumObservedActorSequence(eventRecords, actorId) {
    let maximum = 0;
    for (const record of eventRecords) {
      if (
        record.event.actorId === actorId &&
        Number.isSafeInteger(record.event.actorSequence) &&
        record.event.actorSequence > maximum
      ) {
        maximum = record.event.actorSequence;
      }
    }
    return maximum;
  }

  async #abortForRetry(transaction, done) {
    transaction.abort();
    try {
      await done;
    } catch {
      // Expected optimistic-CAS abort.
    }
    return null;
  }

  async #reserveCommandIfUnchanged(state, descriptor) {
    const knownConflicts =
      state.commandConflictsByCommand.get(descriptor.commandKey) ?? [];
    if (knownConflicts.length > 0) {
      throw new DurableCommandConflictError(
        descriptor.commandBody.commandId,
      );
    }
    const existing = state.commandByKey.get(descriptor.commandKey) ?? null;
    if (existing && existing.commandDigest === descriptor.commandDigest) {
      return { reservation: existing, newlyReserved: false };
    }

    const expectedAllocator =
      state.allocatorByKey.get(descriptor.allocatorKey) ?? null;
    const observedMaximum = this.#maximumObservedActorSequence(
      state.eventRecords,
      descriptor.commandBody.actorId,
    );
    let reservationRecord = null;
    let allocatorRecord = null;
    let conflictRecord = null;
    if (existing === null) {
      const nextSequence =
        Math.max(
          expectedAllocator?.lastSequence ?? 0,
          observedMaximum,
        ) + 1;
      requireSafePositiveInteger(nextSequence, "allocated actorSequence");
      reservationRecord = await this.#reservationRecord({
        descriptor,
        actorSequence: nextSequence,
        durableHead: state.durableHead,
      });
      allocatorRecord = await this.#allocatorRecord(
        descriptor,
        nextSequence,
      );
    } else {
      conflictRecord = await this.#commandConflictRecord(
        existing,
        descriptor,
      );
    }

    const [database, profileKey] = await Promise.all([
      this.#database(),
      this.#profileKey(),
    ]);
    const transaction = strictTransaction(
      database,
      [
        COMMANDS_STORE,
        COMMAND_CONFLICTS_STORE,
        ALLOCATORS_STORE,
        HEADS_STORE,
      ],
      "readwrite",
    );
    const done = transactionDone(transaction);
    const commands = transaction.objectStore(COMMANDS_STORE);
    const conflicts = transaction.objectStore(COMMAND_CONFLICTS_STORE);
    const allocators = transaction.objectStore(ALLOCATORS_STORE);
    const heads = transaction.objectStore(HEADS_STORE);
    const [
      currentHead,
      currentCommand,
      currentConflicts,
      currentAllocator,
    ] = await Promise.all([
      requestResult(heads.get(profileKey)),
      requestResult(commands.get(descriptor.commandKey)),
      requestResult(
        conflicts.index(COMMAND_INDEX).getAll(descriptor.commandKey),
      ),
      requestResult(allocators.get(descriptor.allocatorKey)),
    ]);
    if (
      !sameHead(currentHead, state.durableHead) ||
      (currentCommand?.reservationDigest ?? null) !==
        (existing?.reservationDigest ?? null) ||
      (currentAllocator?.digest ?? null) !==
        (expectedAllocator?.digest ?? null) ||
      canonicalJson(
        currentConflicts.map((record) => record.digest).sort(),
      ) !==
        canonicalJson(
          knownConflicts.map((record) => record.digest).sort(),
        )
    ) {
      return this.#abortForRetry(transaction, done);
    }

    if (conflictRecord !== null) {
      conflicts.add(conflictRecord);
      await done;
      throw new DurableCommandConflictError(
        descriptor.commandBody.commandId,
      );
    }
    commands.add(reservationRecord);
    allocators.put(allocatorRecord);
    await done;
    return { reservation: reservationRecord, newlyReserved: true };
  }

  async #injectSyntheticFault(phase, details) {
    if (this.#syntheticFaultInjector !== null) {
      await this.#syntheticFaultInjector(phase, parseCanonical(details));
    }
  }

  async #commitIfUnchanged({
    expectedHead,
    eventRecord,
    revisionRecord,
    headRecord,
    commandGuard = null,
  }) {
    const database = await this.#database();
    const storeNames = [EVENTS_STORE, REVISIONS_STORE, HEADS_STORE];
    if (commandGuard !== null) {
      storeNames.push(COMMANDS_STORE, COMMAND_CONFLICTS_STORE);
    }
    const transaction = strictTransaction(
      database,
      storeNames,
      "readwrite",
    );
    const done = transactionDone(transaction);
    const heads = transaction.objectStore(HEADS_STORE);
    const currentHead = await requestResult(
      heads.get(headRecord.profileKey),
    );
    if (!sameHead(currentHead, expectedHead)) {
      transaction.abort();
      try {
        await done;
      } catch {
        // Expected abort: another writer committed first.
      }
      return false;
    }
    if (commandGuard !== null) {
      const command = await requestResult(
        transaction
          .objectStore(COMMANDS_STORE)
          .get(commandGuard.commandKey),
      );
      const conflicts = await requestResult(
        transaction
          .objectStore(COMMAND_CONFLICTS_STORE)
          .index(COMMAND_INDEX)
          .getAll(commandGuard.commandKey),
      );
      if (conflicts.length > 0) {
        transaction.abort();
        try {
          await done;
        } catch {
          // Expected fail-closed abort for a poisoned command ID.
        }
        throw new DurableCommandConflictError(commandGuard.commandId);
      }
      if (
        !command ||
        command.commandDigest !== commandGuard.commandDigest ||
        command.reservationDigest !== commandGuard.reservationDigest
      ) {
        transaction.abort();
        try {
          await done;
        } catch {
          // Expected fail-closed abort for missing reservation authority.
        }
        throw new Error("command reservation authority is unavailable");
      }
    }
    transaction.objectStore(EVENTS_STORE).add(eventRecord);
    transaction.objectStore(REVISIONS_STORE).add(revisionRecord);
    heads.put(headRecord);
    await done;
    return true;
  }

  async #appendAttempt(inputEvent, commandGuard = null) {
    const snapshot = await this.#readSnapshot();
    const state = await this.#verifyAndHydrate(snapshot);
    this.#assertNoCommandConflicts(state);
    if (commandGuard !== null) {
      const reservation = state.commandByKey.get(commandGuard.commandKey);
      const conflicts =
        state.commandConflictsByCommand.get(commandGuard.commandKey) ?? [];
      if (conflicts.length > 0) {
        throw new DurableCommandConflictError(commandGuard.commandId);
      }
      if (
        !reservation ||
        reservation.commandDigest !== commandGuard.commandDigest ||
        reservation.reservationDigest !== commandGuard.reservationDigest
      ) {
        throw new Error("command reservation authority is unavailable");
      }
    }
    const event = parseCanonical(inputEvent);
    const contentDigest = await sha256Hex(canonicalJson(event));
    const profileKey = await this.#profileKey();
    const storageKey = `${profileKey}:${contentDigest}`;
    const existing = state.eventRecords.find(
      (record) => record.storageKey === storageKey,
    );
    if (existing) {
      if (
        commandGuard !== null &&
        existing.commandKey !== commandGuard.commandKey
      ) {
        throw new Error(
          "existing event is not linked to the command reservation",
        );
      }
      const appendResult = publicAppendResult(
        await state.ledger.append(event),
      );
      return {
        committed: false,
        appendResult,
        durableHead: state.durableHead,
        durableRevision: null,
      };
    }

    const appendResult = publicAppendResult(
      await state.ledger.append(event),
    );
    const issued = await captureRevision(state.ledger);
    const ledgerManifest = stripAuthorityToken(issued);
    const localRevision =
      (state.durableHead?.localRevision ?? 0) + 1;
    requireSafePositiveInteger(localRevision, "localRevision");
    const eventRecord = parseCanonical({
      format: EVENT_FORMAT,
      storageKey,
      profileKey,
      profileId: this.#identity.profileId,
      profileEpoch: this.#identity.profileEpoch,
      eventId: event.eventId,
      contentDigest,
      commandKey: commandGuard?.commandKey ?? null,
      event,
    });
    const revisionBody = parseCanonical({
      format: REVISION_FORMAT,
      profileKey,
      profileId: this.#identity.profileId,
      profileEpoch: this.#identity.profileEpoch,
      localRevision,
      previousRevisionDigest:
        state.durableHead?.revisionDigest ?? null,
      triggerEventStorageKey: storageKey,
      appendResult,
      ledgerManifest,
    });
    const digest = await sha256Hex(canonicalJson(revisionBody));
    const revisionRecord = parseCanonical({
      ...revisionBody,
      digest,
      revisionKey:
        `${profileKey}:${revisionNumberKey(localRevision)}:${digest}`,
    });
    const headRecord = parseCanonical({
      format: HEAD_FORMAT,
      profileKey,
      profileId: this.#identity.profileId,
      profileEpoch: this.#identity.profileEpoch,
      localRevision,
      revisionDigest: digest,
      stateDigest: ledgerManifest.stateDigest,
      observationCount: ledgerManifest.observationCount,
      eventCount: ledgerManifest.eventCount,
    });
    const committed = await this.#commitIfUnchanged({
      expectedHead: state.durableHead,
      eventRecord,
      revisionRecord,
      headRecord,
      commandGuard,
    });
    if (!committed) {
      return null;
    }
    return {
      committed: true,
      appendResult,
      durableHead: headRecord,
      durableRevision: revisionRecord,
    };
  }

  async #appendWithRetries(inputEvent, commandGuard = null) {
    const invocationSnapshot = parseCanonical(inputEvent);
    for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
      const result = await this.#appendAttempt(
        invocationSnapshot,
        commandGuard,
      );
      if (result !== null) {
        return result;
      }
    }
    throw new DurableLedgerConflictError();
  }

  #fallbackExclusive(operation) {
    const result = this.#fallbackQueue.then(operation);
    this.#fallbackQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async #runExclusive(operation) {
    if (this.#locks !== null) {
      const profileKey = await this.#profileKey();
      const lockName =
        `focus-hero-durable:${this.#databaseName}:${profileKey}`;
      return this.#locks.request(
        lockName,
        { mode: "exclusive" },
        operation,
      );
    }
    return this.#fallbackExclusive(operation);
  }

  async #reserveCommandWithRetries(inputCommand) {
    const profileKey = await this.#profileKey();
    const descriptor = await this.#commandDescriptor(
      inputCommand,
      profileKey,
    );
    for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
      const state = await this.#verifyAndHydrate(await this.#readSnapshot());
      this.#assertNoCommandConflicts(state);
      const reservationResult = await this.#reserveCommandIfUnchanged(
        state,
        descriptor,
      );
      if (reservationResult === null) {
        continue;
      }
      const reservation = reservationResult.reservation;
      if (reservationResult.newlyReserved) {
        await this.#injectSyntheticFault("after-command-reservation", {
          commandId: reservation.commandBody.commandId,
          actorId: reservation.commandBody.actorId,
          actorSequence: reservation.actorSequence,
          reservationDigest: reservation.reservationDigest,
        });
      }
      return this.#publicCommandReservation(reservation, {
        newlyReserved: reservationResult.newlyReserved,
        finalized: state.completedCommandKeys.has(reservation.commandKey),
      });
    }
    throw new DurableLedgerConflictError(
      "command reservation head changed too many times",
    );
  }

  async #finalizeCommandWithRetries(inputCommand, reservationContext = null) {
    const profileKey = await this.#profileKey();
    const descriptor = await this.#commandDescriptor(
      inputCommand,
      profileKey,
    );
    for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
      const state = await this.#verifyAndHydrate(await this.#readSnapshot());
      this.#assertNoCommandConflicts(state);
      const reservation =
        state.commandByKey.get(descriptor.commandKey) ?? null;
      if (reservation === null) {
        throw new DurableCommandReservationError(
          descriptor.commandBody.commandId,
        );
      }
      if (reservation.commandDigest !== descriptor.commandDigest) {
        /*
         * Reuse the transactional conflict-evidence path. It records the
         * canonical variant before throwing and cannot accidentally allocate a
         * second reservation because this command key already exists. A
         * concurrent head change returns null, so retry from fresh verified
         * state instead of throwing without durable conflict evidence.
         */
        const conflictResult = await this.#reserveCommandIfUnchanged(
          state,
          descriptor,
        );
        if (conflictResult === null) {
          continue;
        }
        throw new DurableCommandConflictError(
          descriptor.commandBody.commandId,
        );
      }
      const event = await this.#eventForCommandReservation(reservation);
      const commandGuard = {
        commandKey: reservation.commandKey,
        commandId: reservation.commandBody.commandId,
        commandDigest: reservation.commandDigest,
        reservationDigest: reservation.reservationDigest,
      };
      const result = await this.#appendWithRetries(event, commandGuard);
      if (result.committed) {
        await this.#injectSyntheticFault("after-event-commit", {
          commandId: reservation.commandBody.commandId,
          actorSequence: reservation.actorSequence,
          eventId: event.eventId,
          revisionDigest: result.durableHead.revisionDigest,
        });
      }
      return {
        ...result,
        commandId: reservation.commandBody.commandId,
        actorSequence: reservation.actorSequence,
        eventId: event.eventId,
        reservationDigest: reservation.reservationDigest,
        resumedReservation:
          reservationContext === null
            ? true
            : reservationContext.resumedReservation,
      };
    }
    throw new DurableLedgerConflictError(
      "command finalization head changed too many times",
    );
  }

  async #appendCommandWithRetries(inputCommand) {
    const reservation = await this.#reserveCommandWithRetries(inputCommand);
    return this.#finalizeCommandWithRetries(inputCommand, reservation);
  }

  async append(inputEvent) {
    const invocationSnapshot = parseCanonical(inputEvent);
    return this.#runExclusive(
      () => this.#appendWithRetries(invocationSnapshot),
    );
  }

  async appendCommand(inputCommand) {
    const invocationSnapshot = parseCanonical(inputCommand);
    return this.#runExclusive(
      () => this.#appendCommandWithRetries(invocationSnapshot),
    );
  }

  async reserveCommand(inputCommand) {
    const invocationSnapshot = parseCanonical(inputCommand);
    return this.#runExclusive(
      () => this.#reserveCommandWithRetries(invocationSnapshot),
    );
  }

  async finalizeCommand(inputCommand) {
    const invocationSnapshot = parseCanonical(inputCommand);
    return this.#runExclusive(
      () => this.#finalizeCommandWithRetries(invocationSnapshot),
    );
  }

  async recoverCommands() {
    return this.#runExclusive(async () => {
      const state = await this.#verifyAndHydrate(await this.#readSnapshot());
      this.#assertNoCommandConflicts(state);
      return state.commandRecords.map((record) =>
        this.#publicCommandReservation(record, {
          finalized: state.completedCommandKeys.has(record.commandKey),
          newlyReserved: false,
        })
      );
    });
  }

  async recoverPendingCommands() {
    const commands = await this.recoverCommands();
    return commands.filter((reservation) => !reservation.finalized);
  }

  async close() {
    const database = await this.#databasePromise;
    database.close();
  }
}
