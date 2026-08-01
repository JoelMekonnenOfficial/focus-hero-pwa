/*
 * Synthetic, browser-compatible Focus Hero session receipt model.
 *
 * This is deliberately an unwired domain component: it has no storage,
 * network, DOM, cloud, profile, migration, or deployment access.  It models
 * immutable session revisions and projects their effects from absolute
 * receipts instead of applying incremental +/- mutations.
 */

const DOMAIN_RECEIPT_LEDGER_VERSION = 1;
/*
 * These values are deliberately synthetic test fixtures, not Focus Hero's
 * production reward policy. A reviewed live policy must be injected through
 * SessionReceiptLedger({ planner, policyVersion }) during future integration.
 */
const SYNTHETIC_SESSION_RECEIPT_FIXTURE_POLICY_VERSION =
  "synthetic-focus-hero-session-receipts-v1";
const SESSION_RECEIPT_POLICY_VERSION =
  SYNTHETIC_SESSION_RECEIPT_FIXTURE_POLICY_VERSION;

const textEncoder = new TextEncoder();

function requireText(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function requireMinutes(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError("minutes must be a non-negative safe integer");
  }
  return value;
}

function copy(value) {
  return structuredClone(value);
}

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const key of Object.keys(value)) deepFreeze(value[key], seen);
  return Object.freeze(value);
}

function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}

/* A stable non-secret identifier; it is not a security primitive. */
function stableReceiptToken(value) {
  const bytes = textEncoder.encode(String(value));
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (const byte of bytes) {
    first = Math.imul(first ^ byte, 0x01000193) >>> 0;
    second = Math.imul(second ^ (byte + 0x9d), 0x85ebca6b) >>> 0;
  }
  return `${first.toString(16).padStart(8, "0")}${second.toString(16).padStart(8, "0")}`;
}

function receiptId(sessionId, kind, slot = "absolute") {
  return `session:${sessionId}:${kind}:${slot}`;
}

function deterministicItemId(sessionId, slot) {
  const seed = stableReceiptToken(`${sessionId}|loot|${slot}`);
  return `synthetic-loot-${seed.slice(0, 8)}`;
}

function deterministicMaterialId(sessionId, slot) {
  const options = ["ironwood", "moonfiber", "sunstone"];
  const number = Number.parseInt(stableReceiptToken(`${sessionId}|material|${slot}`).slice(0, 2), 16);
  return options[number % options.length];
}

function makeReceipt({ sessionId, kind, slot = "absolute", amount, reversible = true, dimensions = {}, instance = null }) {
  return Object.freeze({
    receiptId: receiptId(sessionId, kind, slot),
    sessionId,
    kind,
    slot: String(slot),
    amount,
    reversible,
    dimensions: Object.freeze({ ...dimensions }),
    instance: instance === null ? null : Object.freeze({ ...instance }),
  });
}

/*
 * The policy returns absolute desired receipts for a single active revision.
 * Every receipt ID is based on the stable session identity, never its minute
 * total, so a down-edit followed by an up-edit revives the same entitlement.
 */
function deriveSyntheticSessionReceipts({ sessionId, minutes, taskId, dayKey }) {
  requireText(sessionId, "sessionId");
  requireMinutes(minutes);
  requireText(taskId, "taskId");
  requireText(dayKey, "dayKey");
  const receipts = [
    makeReceipt({ sessionId, kind: "minutes.all", amount: minutes }),
    makeReceipt({ sessionId, kind: "minutes.task", amount: minutes, dimensions: { taskId } }),
    makeReceipt({ sessionId, kind: "minutes.day", amount: minutes, dimensions: { dayKey } }),
    makeReceipt({ sessionId, kind: "xp", amount: minutes * 10 }),
    makeReceipt({ sessionId, kind: "coins", amount: minutes * 2 }),
    makeReceipt({ sessionId, kind: "egg.minutes", amount: minutes }),
    makeReceipt({ sessionId, kind: "target.progress", amount: Math.floor(minutes / 25) }),
    makeReceipt({ sessionId, kind: "orbs", amount: Math.floor(minutes / 45) }),
    makeReceipt({ sessionId, kind: "farming.minutes", amount: minutes }),
  ];

  for (let slot = 1; slot <= Math.floor(minutes / 30); slot += 1) {
    const iid = `loot-instance-${stableReceiptToken(`${sessionId}|loot|${slot}`)}`;
    receipts.push(makeReceipt({
      sessionId,
      kind: "loot.instance",
      slot,
      amount: 1,
      instance: { iid, itemId: deterministicItemId(sessionId, slot) },
    }));
  }
  for (let slot = 1; slot <= Math.floor(minutes / 60); slot += 1) {
    receipts.push(makeReceipt({
      sessionId,
      kind: "target.chest",
      slot,
      amount: 1,
      instance: { chestId: `chest-${stableReceiptToken(`${sessionId}|chest|${slot}`)}` },
    }));
  }
  for (let slot = 1; slot <= Math.floor(minutes / 15); slot += 1) {
    receipts.push(makeReceipt({
      sessionId,
      kind: "farming.material",
      slot,
      amount: 1,
      instance: { materialId: deterministicMaterialId(sessionId, slot) },
    }));
  }
  return Object.freeze(receipts);
}

/* Backwards-compatible name; the implementation remains synthetic-only. */
const deriveSessionReceipts = deriveSyntheticSessionReceipts;

function emptyProjection() {
  return {
    minutes: 0,
    taskMinutes: Object.create(null),
    dayMinutes: Object.create(null),
    xp: 0,
    coins: 0,
    eggMinutes: 0,
    targetProgress: 0,
    chests: Object.create(null),
    orbs: 0,
    farmingMinutes: 0,
    materials: Object.create(null),
    lootInstances: Object.create(null),
    activeReceipts: Object.create(null),
  };
}

function safeSum(left, right, label) {
  const value = left + right;
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} exceeds safe integer range`);
  }
  return value;
}

function increment(bucket, key, amount, label) {
  bucket[key] = safeSum(bucket[key] ?? 0, amount, label);
}

function applyReceipt(projection, receipt, amount) {
  if (amount === 0) return;
  projection.activeReceipts[receipt.receiptId] = {
    receipt: copy(receipt),
    amount,
  };
  switch (receipt.kind) {
    case "minutes.all": projection.minutes = safeSum(projection.minutes, amount, "focused minutes"); break;
    case "minutes.task": increment(projection.taskMinutes, receipt.dimensions.taskId, amount, "task minutes"); break;
    case "minutes.day": increment(projection.dayMinutes, receipt.dimensions.dayKey, amount, "day minutes"); break;
    case "xp": projection.xp = safeSum(projection.xp, amount, "XP"); break;
    case "coins": projection.coins = safeSum(projection.coins, amount, "coins"); break;
    case "egg.minutes": projection.eggMinutes = safeSum(projection.eggMinutes, amount, "egg minutes"); break;
    case "target.progress": projection.targetProgress = safeSum(projection.targetProgress, amount, "target progress"); break;
    case "target.chest": projection.chests[receipt.instance.chestId] = copy(receipt.instance); break;
    case "orbs": projection.orbs = safeSum(projection.orbs, amount, "orbs"); break;
    case "farming.minutes": projection.farmingMinutes = safeSum(projection.farmingMinutes, amount, "farming minutes"); break;
    case "farming.material": increment(projection.materials, receipt.instance.materialId, amount, "farming materials"); break;
    case "loot.instance": projection.lootInstances[receipt.instance.iid] = copy(receipt.instance); break;
    default: throw new Error(`unknown receipt kind: ${receipt.kind}`);
  }
}

const SCALAR_RECEIPT_KINDS = new Set([
  "minutes.all",
  "xp",
  "coins",
  "egg.minutes",
  "target.progress",
  "orbs",
  "farming.minutes",
]);
const SUPPORTED_RECEIPT_KINDS = new Set([
  ...SCALAR_RECEIPT_KINDS,
  "minutes.task",
  "minutes.day",
  "target.chest",
  "farming.material",
  "loot.instance",
]);

function requirePlainRecord(value, label) {
  const prototype = value !== null && typeof value === "object"
    ? Object.getPrototypeOf(value)
    : null;
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (prototype !== Object.prototype && prototype !== null)
  ) {
    throw new TypeError(`${label} must be a plain object`);
  }
  return value;
}

function requireNullInstance(receipt) {
  if (receipt.instance !== null) {
    throw new TypeError(`${receipt.kind} receipt.instance must be null`);
  }
}

function validateReceiptSchema(receipt, sessionId) {
  requirePlainRecord(receipt, "receipt");
  requireText(receipt.receiptId, "receipt.receiptId");
  requireText(receipt.sessionId, "receipt.sessionId");
  requireText(receipt.kind, "receipt.kind");
  requireText(receipt.slot, "receipt.slot");
  if (receipt.sessionId !== sessionId) {
    throw new TypeError("planner receipt sessionId must match its revision");
  }
  if (!SUPPORTED_RECEIPT_KINDS.has(receipt.kind)) {
    throw new TypeError(`unsupported receipt kind: ${receipt.kind}`);
  }
  if (!Number.isSafeInteger(receipt.amount) || receipt.amount < 0) {
    throw new TypeError("receipt.amount must be a non-negative safe integer");
  }
  if (typeof receipt.reversible !== "boolean") {
    throw new TypeError("receipt.reversible must be boolean");
  }
  requirePlainRecord(receipt.dimensions, "receipt.dimensions");

  if (SCALAR_RECEIPT_KINDS.has(receipt.kind)) {
    requireNullInstance(receipt);
    return;
  }
  if (receipt.kind === "minutes.task") {
    requireText(receipt.dimensions.taskId, "receipt.dimensions.taskId");
    requireNullInstance(receipt);
    return;
  }
  if (receipt.kind === "minutes.day") {
    requireText(receipt.dimensions.dayKey, "receipt.dimensions.dayKey");
    requireNullInstance(receipt);
    return;
  }

  const instance = requirePlainRecord(receipt.instance, "receipt.instance");
  if (receipt.kind !== "farming.material" && receipt.amount !== 1) {
    throw new TypeError(`${receipt.kind} receipt.amount must equal 1`);
  }
  if (receipt.kind === "farming.material" && receipt.amount < 1) {
    throw new TypeError("farming.material receipt.amount must be at least 1");
  }
  if (receipt.kind === "target.chest") {
    requireText(instance.chestId, "receipt.instance.chestId");
  } else if (receipt.kind === "farming.material") {
    requireText(instance.materialId, "receipt.instance.materialId");
  } else {
    requireText(instance.iid, "receipt.instance.iid");
    requireText(instance.itemId, "receipt.instance.itemId");
  }
}

function receiptInstanceOwnershipKey(receipt) {
  if (receipt.kind === "target.chest") return `chest:${receipt.instance.chestId}`;
  if (receipt.kind === "loot.instance") return `loot:${receipt.instance.iid}`;
  return null;
}

function validateCommand(command) {
  if (command === null || typeof command !== "object" || Array.isArray(command)) {
    throw new TypeError("command must be an object");
  }
  requireText(command.commandId, "commandId");
  if (!["create", "edit", "delete", "lockReceipt", "resolveConflict"].includes(command.type)) {
    throw new TypeError("command.type must be create, edit, delete, lockReceipt, or resolveConflict");
  }
  requireText(command.sessionId, "sessionId");
  return command;
}

function commandFingerprint(command) {
  return canonical(command);
}

/*
 * In-memory immutable-revision model. `apply` stores every accepted command
 * verbatim in history. It never mutates a prior revision or applies a delta to
 * a projection; each result is a fresh projection of absolute receipts.
 */
class SessionReceiptLedger {
  #revisions = new Map();
  #heads = new Map();
  #commands = new Map();
  #locks = new Map();
  /* Immutable parent -> immediate-child DAG edges, including held branches. */
  #branches = new Map();
  #conflicts = new Map();
  #resolutions = new Map();
  #nonAuthoritativeRoots = new Set();
  #receiptOwners = new Map();
  #instanceOwners = new Map();
  #planner;
  #policyVersion;

  constructor({ planner = deriveSyntheticSessionReceipts, policyVersion = SYNTHETIC_SESSION_RECEIPT_FIXTURE_POLICY_VERSION } = {}) {
    if (typeof planner !== "function") throw new TypeError("planner must be a pure function");
    requireText(policyVersion, "policyVersion");
    this.#planner = planner;
    this.#policyVersion = policyVersion;
  }

  apply(input) {
    const command = copy(validateCommand(input));
    const fingerprint = commandFingerprint(command);
    const prior = this.#commands.get(command.commandId);
    if (prior) {
      if (prior.fingerprint !== fingerprint) {
        throw new Error(`commandId ${command.commandId} was already used for a different command`);
      }
      return copy(prior.result);
    }

    let result;
    if (command.type === "lockReceipt") result = this.#lockReceipt(command);
    else if (command.type === "resolveConflict") result = this.#resolveConflict(command);
    else result = this.#revise(command);
    this.#commands.set(command.commandId, { fingerprint, result: copy(result) });
    return copy(result);
  }

  #revise(command) {
    const head = this.#heads.get(command.sessionId) ?? null;
    if (command.type === "create") {
      if (head !== null) return this.#conflict(command, head, "session already exists");
      if (command.parentRevisionId !== null && command.parentRevisionId !== undefined) {
        return this.#conflict(command, null, "create must not name a parent revision");
      }
    } else {
      requireText(command.parentRevisionId, "parentRevisionId");
      const parent = this.#revisions.get(command.parentRevisionId);
      if (!parent) {
        return this.#conflict(command, head, "parent revision is unknown");
      }
      if (parent.sessionId !== command.sessionId) {
        return this.#conflict(command, head, "parent revision belongs to another session");
      }
      if (this.#resolutions.has(command.parentRevisionId)) {
        return this.#conflict(command, head, "parent branch set was already explicitly resolved");
      }
      if (this.#hasNonAuthoritativeAncestor(parent)) {
        return this.#conflict(command, head, "parent belongs to a non-authoritative resolved branch");
      }
    }

    let revision;
    if (command.type === "delete") {
      const parent = this.#revisions.get(command.parentRevisionId);
      revision = Object.freeze({
        revisionId: command.commandId,
        sessionId: command.sessionId,
        parentRevisionId: command.parentRevisionId,
        operation: "delete",
        deleted: true,
        minutes: parent.minutes,
        taskId: parent.taskId,
        dayKey: parent.dayKey,
        receiptPolicyVersion: this.#policyVersion,
        receiptPlanFingerprint: stableReceiptToken("[]"),
        receipts: Object.freeze([]),
      });
    } else {
      requireMinutes(command.minutes);
      requireText(command.taskId, "taskId");
      requireText(command.dayKey, "dayKey");
      const revisionFields = {
        revisionId: command.commandId,
        sessionId: command.sessionId,
        parentRevisionId: command.type === "create" ? null : command.parentRevisionId,
        operation: command.type,
        deleted: false,
        minutes: command.minutes,
        taskId: command.taskId,
        dayKey: command.dayKey,
      };
      const receipts = this.#planAndFreeze(revisionFields);
      revision = Object.freeze({
        ...revisionFields,
        receiptPolicyVersion: this.#policyVersion,
        receiptPlanFingerprint: stableReceiptToken(canonical(receipts)),
        receipts,
      });
    }
    const projection = this.#transaction(() => {
      this.#revisions.set(revision.revisionId, revision);
      for (const receipt of revision.receipts) {
        this.#receiptOwners.set(receipt.receiptId, revision.sessionId);
        const instanceKey = receiptInstanceOwnershipKey(receipt);
        if (instanceKey !== null) this.#instanceOwners.set(instanceKey, revision.sessionId);
      }
      if (revision.operation === "edit" || revision.operation === "delete") {
        this.#observeBranch(revision);
      } else {
        this.#heads.set(revision.sessionId, revision);
      }
      return this.project();
    });
    return Object.freeze({ status: "applied", revision: copy(revision), projection });
  }

  /*
   * A second distinct edit sharing an exact parent is a real concurrency
   * signal. Rather than selecting the delivery winner, retain both immutable
   * branches and move the authoritative projection back to the common parent.
   */
  #observeBranch(revision) {
    const branches = this.#branches.get(revision.parentRevisionId) ?? new Map();
    branches.set(revision.revisionId, revision);
    this.#branches.set(revision.parentRevisionId, branches);
    const parent = this.#revisions.get(revision.parentRevisionId);
    const outerConflict = this.#unresolvedAncestorOf(parent);
    if (branches.size === 1) {
      /* A descendant of a held branch is retained but cannot escape the hold. */
      if (!outerConflict) this.#heads.set(revision.sessionId, revision);
      return;
    }
    this.#conflicts.set(revision.parentRevisionId, Object.freeze({
      sessionId: revision.sessionId,
      parentRevisionId: revision.parentRevisionId,
      branchRevisionIds: Object.freeze([...branches.keys()].sort()),
    }));
    /* The outermost unresolved ancestor remains the authoritative boundary. */
    this.#heads.set(revision.sessionId, outerConflict ?? parent);
  }

  #resolveConflict(command) {
    requireText(command.parentRevisionId, "parentRevisionId");
    requireText(command.chosenRevisionId, "chosenRevisionId");
    const conflict = this.#conflicts.get(command.parentRevisionId);
    const branches = this.#branches.get(command.parentRevisionId);
    if (!conflict || !branches?.has(command.chosenRevisionId)) {
      return this.#conflict(command, this.#heads.get(command.sessionId) ?? null, "named branch is not an unresolved conflict");
    }
    const parent = this.#revisions.get(command.parentRevisionId);
    const chosen = branches.get(command.chosenRevisionId);
    if (!parent || conflict.sessionId !== command.sessionId || parent.sessionId !== command.sessionId || chosen.sessionId !== command.sessionId) {
      return this.#conflict(command, this.#heads.get(command.sessionId) ?? null, "branch belongs to another session");
    }
    if (this.#hasNonAuthoritativeAncestor(parent)) {
      return this.#conflict(command, this.#heads.get(command.sessionId) ?? null, "conflict belongs to a non-authoritative resolved branch");
    }
    const parentOfConflict = parent.parentRevisionId === null
      ? null
      : this.#revisions.get(parent.parentRevisionId) ?? null;
    if (parentOfConflict && this.#unresolvedAncestorOf(parentOfConflict)) {
      return this.#conflict(command, this.#heads.get(command.sessionId) ?? null, "an outer ancestor conflict must be resolved first");
    }
    const nonAuthoritativeBranchRevisionIds = [...branches.keys()]
      .filter((revisionId) => revisionId !== command.chosenRevisionId)
      .sort();
    return this.#transaction(() => {
      for (const revisionId of nonAuthoritativeBranchRevisionIds) {
        this.#nonAuthoritativeRoots.add(revisionId);
      }
      this.#conflicts.delete(command.parentRevisionId);
      const restoredPath = this.#unambiguousDescendantPath(chosen);
      const restoredHead = restoredPath[restoredPath.length - 1];
      const resolution = Object.freeze({
        sessionId: command.sessionId,
        parentRevisionId: command.parentRevisionId,
        chosenBranchRevisionId: chosen.revisionId,
        restoredDescendantRevisionIds: Object.freeze(restoredPath.slice(1).map((revision) => revision.revisionId)),
        restoredHeadRevisionId: restoredHead.revisionId,
        nonAuthoritativeBranchRevisionIds: Object.freeze(nonAuthoritativeBranchRevisionIds),
        resolutionCommandId: command.commandId,
      });
      this.#resolutions.set(command.parentRevisionId, resolution);
      this.#heads.set(command.sessionId, restoredHead);
      return Object.freeze({ status: "applied", resolved: copy(conflict), resolution: copy(resolution), projection: this.project() });
    });
  }

  #unresolvedAncestorOf(revision) {
    let cursor = revision;
    let outermost = null;
    while (cursor) {
      if (this.#conflicts.has(cursor.revisionId)) outermost = cursor;
      cursor = cursor.parentRevisionId === null
        ? null
        : this.#revisions.get(cursor.parentRevisionId) ?? null;
    }
    return outermost;
  }

  #hasNonAuthoritativeAncestor(revision) {
    let cursor = revision;
    while (cursor) {
      if (this.#nonAuthoritativeRoots.has(cursor.revisionId)) return true;
      cursor = cursor.parentRevisionId === null
        ? null
        : this.#revisions.get(cursor.parentRevisionId) ?? null;
    }
    return false;
  }

  #unambiguousDescendantPath(root) {
    const path = [root];
    let cursor = root;
    while (!this.#conflicts.has(cursor.revisionId)) {
      const children = this.#branches.get(cursor.revisionId);
      if (!children || children.size !== 1) break;
      const next = [...children.values()][0];
      if (this.#hasNonAuthoritativeAncestor(next)) break;
      path.push(next);
      cursor = next;
    }
    return path;
  }

  #lockReceipt(command) {
    requireText(command.receiptId, "receiptId");
    const head = this.#heads.get(command.sessionId);
    if (head === undefined || head.deleted) return this.#conflict(command, head ?? null, "cannot lock a missing or deleted session");
    const receipt = head.receipts.find((candidate) => candidate.receiptId === command.receiptId);
    if (!receipt) return this.#conflict(command, head, "receipt is not active on the current revision");
    const existing = this.#locks.get(command.receiptId);
    if (existing) return Object.freeze({ status: "applied", locked: copy(existing), projection: this.project() });
    const locked = Object.freeze({ ...receipt, lockedAmount: receipt.amount, lockCommandId: command.commandId });
    return this.#transaction(() => {
      this.#locks.set(command.receiptId, locked);
      return Object.freeze({ status: "applied", locked: copy(locked), projection: this.project() });
    });
  }

  #conflict(command, head, reason) {
    return Object.freeze({
      status: "conflict",
      reason,
      commandId: command.commandId,
      sessionId: command.sessionId,
      currentRevisionId: head?.revisionId ?? null,
      projection: this.project(),
    });
  }

  project() {
    const projection = emptyProjection();
    const desired = new Map();
    for (const revision of this.#heads.values()) {
      if (revision.deleted) continue;
      for (const receipt of revision.receipts) desired.set(receipt.receiptId, receipt);
    }
    const ids = new Set([...desired.keys(), ...this.#locks.keys()]);
    for (const id of [...ids].sort()) {
      const locked = this.#locks.get(id);
      const desiredAmount = desired.get(id)?.amount ?? 0;
      const effectiveAmount = locked ? Math.max(desiredAmount, locked.lockedAmount) : desiredAmount;
      /*
       * A lock preserves the receipt's original dimensions/instance identity.
       * This matters if, for example, a later edit moves the session to a
       * different task or day: a non-reversible receipt cannot silently move
       * from its original beneficiary to the new one.
       */
      const receipt = locked ?? desired.get(id);
      applyReceipt(projection, receipt, effectiveAmount);
    }
    return copy(projection);
  }

  history(sessionId) {
    requireText(sessionId, "sessionId");
    return [...this.#revisions.values()]
      .filter((revision) => revision.sessionId === sessionId)
      .map(copy);
  }

  head(sessionId) {
    requireText(sessionId, "sessionId");
    const revision = this.#heads.get(sessionId);
    return revision ? copy(revision) : null;
  }

  receiptsForHead(sessionId) {
    const revision = this.#heads.get(sessionId);
    return revision && !revision.deleted ? copy(revision.receipts) : [];
  }

  #planAndFreeze(revision) {
    const receipts = this.#planner(Object.freeze({
      revisionId: revision.revisionId,
      parentRevisionId: revision.parentRevisionId,
      operation: revision.operation,
      sessionId: revision.sessionId,
      minutes: revision.minutes,
      taskId: revision.taskId,
      dayKey: revision.dayKey,
      policyVersion: this.#policyVersion,
    }));
    if (!Array.isArray(receipts)) throw new TypeError("planner must return an array of absolute receipts");
    const frozenReceipts = copy(receipts);
    const ids = new Set();
    const instanceIds = new Set();
    for (const receipt of frozenReceipts) {
      validateReceiptSchema(receipt, revision.sessionId);
      if (ids.has(receipt.receiptId)) throw new TypeError("planner returned duplicate receipt IDs");
      ids.add(receipt.receiptId);
      const owner = this.#receiptOwners.get(receipt.receiptId);
      if (owner !== undefined && owner !== revision.sessionId) {
        throw new TypeError("receiptId is already owned by another session");
      }
      const instanceKey = receiptInstanceOwnershipKey(receipt);
      if (instanceKey !== null) {
        if (instanceIds.has(instanceKey)) throw new TypeError("planner returned duplicate effect instance IDs");
        instanceIds.add(instanceKey);
        const instanceOwner = this.#instanceOwners.get(instanceKey);
        if (instanceOwner !== undefined && instanceOwner !== revision.sessionId) {
          throw new TypeError("effect instance ID is already owned by another session");
        }
      }
    }
    frozenReceipts.sort((left, right) => left.receiptId.localeCompare(right.receiptId));
    return deepFreeze(frozenReceipts);
  }

  #transaction(operation) {
    const checkpoint = {
      revisions: this.#revisions,
      heads: this.#heads,
      locks: this.#locks,
      branches: this.#branches,
      conflicts: this.#conflicts,
      resolutions: this.#resolutions,
      nonAuthoritativeRoots: this.#nonAuthoritativeRoots,
      receiptOwners: this.#receiptOwners,
      instanceOwners: this.#instanceOwners,
    };
    this.#revisions = new Map(this.#revisions);
    this.#heads = new Map(this.#heads);
    this.#locks = new Map(this.#locks);
    this.#branches = new Map(
      [...this.#branches].map(([parentRevisionId, children]) => [parentRevisionId, new Map(children)]),
    );
    this.#conflicts = new Map(this.#conflicts);
    this.#resolutions = new Map(this.#resolutions);
    this.#nonAuthoritativeRoots = new Set(this.#nonAuthoritativeRoots);
    this.#receiptOwners = new Map(this.#receiptOwners);
    this.#instanceOwners = new Map(this.#instanceOwners);
    try {
      return operation();
    } catch (error) {
      this.#revisions = checkpoint.revisions;
      this.#heads = checkpoint.heads;
      this.#locks = checkpoint.locks;
      this.#branches = checkpoint.branches;
      this.#conflicts = checkpoint.conflicts;
      this.#resolutions = checkpoint.resolutions;
      this.#nonAuthoritativeRoots = checkpoint.nonAuthoritativeRoots;
      this.#receiptOwners = checkpoint.receiptOwners;
      this.#instanceOwners = checkpoint.instanceOwners;
      throw error;
    }
  }

  snapshot() {
    const conflicts = [...this.#conflicts.values()]
      .map(copy)
      .sort((left, right) => left.parentRevisionId.localeCompare(right.parentRevisionId));
    const heads = [...this.#heads.entries()]
      .map(([sessionId, revision]) => ({ sessionId, revisionId: revision.revisionId }))
      .sort((left, right) => left.sessionId.localeCompare(right.sessionId));
    const resolutions = [...this.#resolutions.values()]
      .map(copy)
      .sort((left, right) => left.parentRevisionId.localeCompare(right.parentRevisionId));
    return copy({ policyVersion: this.#policyVersion, heads, conflicts, resolutions, projection: this.project() });
  }
}

/*
 * Universal source export. Browsers load this file as a classic script before
 * the accounting bridge; the .mjs facade re-exports the same implementation
 * for Node tests and other module consumers. No application state is touched.
 */
globalThis.FocusHeroDomainReceiptLedger = Object.freeze({
  DOMAIN_RECEIPT_LEDGER_VERSION,
  SYNTHETIC_SESSION_RECEIPT_FIXTURE_POLICY_VERSION,
  SESSION_RECEIPT_POLICY_VERSION,
  stableReceiptToken,
  deriveSyntheticSessionReceipts,
  deriveSessionReceipts,
  SessionReceiptLedger,
});
