/* Life XP primary state engine (v10.10.0 durable integration)
 *
 * This module is deliberately inert until FH_PRIMARY_STORE.create() is called.
 * It never reads, writes, migrates, or deletes legacy browser storage and it has
 * no cloud or recovery UI authority.  The application must supply exact JSON
 * bytes and explicitly choose when to initialize or commit them.
 *
 * Persistence model:
 *   - `head` is the authoritative, SHA-256-verified state envelope.
 *   - `previous` is the exact immediately preceding verified envelope.
 *   - a single IndexedDB transaction moves head -> previous and installs the
 *     new head, so a failed/aborted transaction leaves the prior head intact.
 *   - every commit is compare-and-swap fenced by both commit ID and a persisted
 *     random fence token. Concurrent tabs and stale cloud/recovery operations
 *     cannot both commit from the same base.
 *
 * The fixed head + previous slots and one immutable bootstrap-source receipt
 * avoid turning every ordinary save into another full-state snapshot.
 * Independent Data Guard / Recovery Center snapshots remain separate.
 */
(function (root) {
  "use strict";

  var FORMAT = 1;
  var DEFAULT_DB = "fh-primary-state-v1";
  var DB_VERSION = 1;
  var STORE = "stateSlots";
  var HEAD_KEY = "head";
  var PREVIOUS_KEY = "previous";
  var BOOTSTRAP_KEY = "bootstrapSource";
  var CHANNEL = "focusHero.primary.v1";
  var HASH_RE = /^[a-f0-9]{64}$/;

  function plainObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function makeError(code, message, details) {
    var error = new Error(message);
    error.code = code;
    if (details && plainObject(details)) error.details = details;
    return error;
  }

  function requestResult(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || makeError("FH_PRIMARY_IDB_REQUEST", "IndexedDB request failed.")); };
    });
  }

  function transactionDone(transaction) {
    return new Promise(function (resolve, reject) {
      transaction.oncomplete = function () { resolve(); };
      transaction.onabort = function () {
        reject(transaction.error || makeError("FH_PRIMARY_IDB_ABORT", "IndexedDB transaction aborted."));
      };
      transaction.onerror = function () {
        /* onabort supplies the final transaction result; suppress no events. */
      };
    });
  }

  function openDatabase(indexedDb, name) {
    return new Promise(function (resolve, reject) {
      var request;
      try { request = indexedDb.open(name, DB_VERSION); }
      catch (error) { reject(makeError("FH_PRIMARY_DB_OPEN", "Primary storage could not be opened.", { cause:String(error && (error.message || error)) })); return; }
      request.onupgradeneeded = function () {
        var database = request.result;
        if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE);
      };
      request.onblocked = function () {
        reject(makeError("FH_PRIMARY_DB_BLOCKED", "Primary storage upgrade is blocked by another open Life XP tab."));
      };
      request.onerror = function () {
        reject(makeError("FH_PRIMARY_DB_OPEN", "Primary storage could not be opened.", {
          cause:String(request.error && (request.error.message || request.error) || "unknown")
        }));
      };
      request.onsuccess = function () {
        var database = request.result;
        database.onversionchange = function () { try { database.close(); } catch (_) {} };
        resolve(database);
      };
    });
  }

  function strictTransaction(database, mode) {
    try { return database.transaction(STORE, mode, { durability:"strict" }); }
    catch (_) { return database.transaction(STORE, mode); }
  }

  function randomToken(cryptoApi, prefix) {
    if (cryptoApi && typeof cryptoApi.randomUUID === "function") return prefix + cryptoApi.randomUUID();
    if (!cryptoApi || typeof cryptoApi.getRandomValues !== "function") {
      throw makeError("FH_PRIMARY_RANDOM_UNAVAILABLE", "Secure randomness is unavailable; no primary-state operation was attempted.");
    }
    var bytes = new Uint8Array(24);
    cryptoApi.getRandomValues(bytes);
    var text = "";
    for (var i = 0; i < bytes.length; i++) text += bytes[i].toString(16).padStart(2, "0");
    return prefix + text;
  }

  async function sha256(cryptoApi, text) {
    if (!cryptoApi || !cryptoApi.subtle || typeof cryptoApi.subtle.digest !== "function" || typeof TextEncoder !== "function") {
      throw makeError("FH_PRIMARY_HASH_UNAVAILABLE", "SHA-256 is unavailable; no primary-state operation was attempted.");
    }
    var digest = await cryptoApi.subtle.digest("SHA-256", new TextEncoder().encode(String(text)));
    var bytes = new Uint8Array(digest);
    var out = "";
    for (var i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
    return out;
  }

  function recognizeState(parsed) {
    var marker = plainObject(parsed) && (
      plainObject(parsed.hero) || Array.isArray(parsed.tasks) ||
      (typeof parsed.dataVersion === "number" && Number.isFinite(parsed.dataVersion))
    );
    return !!marker && Number.isSafeInteger(parsed.totalFocusMin) && parsed.totalFocusMin >= 0;
  }

  function parseAndValidateRaw(raw, validateRaw) {
    if (typeof raw !== "string" || !raw) {
      throw makeError("FH_PRIMARY_INVALID_STATE", "Primary state must be non-empty JSON bytes.");
    }
    var parsed;
    try { parsed = JSON.parse(raw); }
    catch (_) { throw makeError("FH_PRIMARY_INVALID_STATE", "Primary state JSON is malformed; nothing was written."); }
    if (!recognizeState(parsed)) {
      throw makeError("FH_PRIMARY_INVALID_STATE", "Primary state is not a recognizable Life XP profile; nothing was written.");
    }
    if (JSON.stringify(parsed) !== raw) {
      throw makeError("FH_PRIMARY_NONCANONICAL_STATE", "Primary state bytes are not the app's canonical JSON serialization; nothing was written.");
    }
    if (typeof validateRaw === "function") {
      var result = validateRaw(raw, parsed);
      if (result !== true) {
        throw makeError("FH_PRIMARY_INVALID_STATE", typeof result === "string" ? result : "Application state validation failed; nothing was written.");
      }
    }
    return parsed;
  }

  function boundedText(value, label, max) {
    var text = typeof value === "string" ? value.trim() : "";
    if (!text || text.length > max) throw makeError("FH_PRIMARY_INVALID_ARGUMENT", label + " is missing or invalid.");
    return text;
  }

  function chainMaterial(record) {
    return JSON.stringify({
      format:record.format,
      commitId:record.commitId,
      sequence:record.sequence,
      lineageId:record.lineageId,
      previousCommitId:record.previousCommitId || null,
      previousStateSha256:record.previousStateSha256 || null,
      previousChainSha256:record.previousChainSha256 || null,
      stateSha256:record.stateSha256,
      focusMinutesHighWater:record.focusMinutesHighWater,
      fenceToken:record.fenceToken,
      writerId:record.writerId,
      savedAt:record.savedAt,
      source:record.source
    });
  }

  function publicMetadata(record) {
    if (!record) return null;
    return {
      format:record.format,
      commitId:record.commitId,
      sequence:record.sequence,
      lineageId:record.lineageId,
      previousCommitId:record.previousCommitId || null,
      stateSha256:record.stateSha256,
      chainSha256:record.chainSha256,
      focusMinutesHighWater:record.focusMinutesHighWater,
      fenceToken:record.fenceToken,
      writerId:record.writerId,
      savedAt:record.savedAt,
      source:record.source,
      bytes:typeof TextEncoder === "function" ? new TextEncoder().encode(record.raw).byteLength : record.raw.length
    };
  }

  function bootstrapMaterial(record) {
    return JSON.stringify({
      format:record.format,kind:record.kind,sourceKey:record.sourceKey,
      sourceSha256:record.sourceSha256,candidateSha256:record.candidateSha256,
      initialCommitId:record.initialCommitId,lineageId:record.lineageId,savedAt:record.savedAt
    });
  }

  async function makeBootstrapEvidence(cryptoApi,input) {
    var record={format:FORMAT,kind:"legacy-source",sourceKey:input.sourceKey,raw:input.raw,
      sourceSha256:await sha256(cryptoApi,input.raw),candidateSha256:input.candidateSha256,
      initialCommitId:input.initialCommitId,lineageId:input.lineageId,savedAt:input.savedAt,receiptSha256:""};
    record.receiptSha256=await sha256(cryptoApi,bootstrapMaterial(record));
    return record;
  }

  async function verifyBootstrapEvidence(cryptoApi,record) {
    if(!plainObject(record)||record.format!==FORMAT||record.kind!=="legacy-source"||
        typeof record.sourceKey!=="string"||!record.sourceKey||record.sourceKey.length>300||
        typeof record.raw!=="string"||!HASH_RE.test(String(record.sourceSha256||""))||
        !HASH_RE.test(String(record.candidateSha256||""))||!HASH_RE.test(String(record.receiptSha256||""))||
        typeof record.initialCommitId!=="string"||typeof record.lineageId!=="string"||
        !Number.isSafeInteger(record.savedAt)||record.savedAt<=0)throw makeError("FH_PRIMARY_CORRUPT","Primary bootstrap-source evidence is invalid.");
    if(await sha256(cryptoApi,record.raw)!==record.sourceSha256)throw makeError("FH_PRIMARY_CORRUPT","Exact legacy-source bytes do not match their receipt.");
    if(await sha256(cryptoApi,bootstrapMaterial(record))!==record.receiptSha256)throw makeError("FH_PRIMARY_CORRUPT","Legacy-source metadata does not match its receipt.");
    return record;
  }
  function sameBootstrapEvidence(left,right){
    return !!left&&!!right&&left.format===right.format&&left.kind===right.kind&&
      left.sourceKey===right.sourceKey&&left.raw===right.raw&&left.sourceSha256===right.sourceSha256&&
      left.candidateSha256===right.candidateSha256&&left.initialCommitId===right.initialCommitId&&
      left.lineageId===right.lineageId&&left.savedAt===right.savedAt&&left.receiptSha256===right.receiptSha256;
  }

  function exactRecordShape(record) {
    return plainObject(record) && record.format === FORMAT &&
      typeof record.raw === "string" && record.raw.length > 0 &&
      typeof record.commitId === "string" && record.commitId.length > 3 && record.commitId.length <= 200 &&
      Number.isSafeInteger(record.sequence) && record.sequence > 0 &&
      typeof record.lineageId === "string" && record.lineageId.length > 3 && record.lineageId.length <= 200 &&
      (record.previousCommitId === null || typeof record.previousCommitId === "string") &&
      (record.previousStateSha256 === null || HASH_RE.test(record.previousStateSha256)) &&
      (record.previousChainSha256 === null || HASH_RE.test(record.previousChainSha256)) &&
      HASH_RE.test(record.stateSha256) && HASH_RE.test(record.chainSha256) &&
      Number.isSafeInteger(record.focusMinutesHighWater) && record.focusMinutesHighWater >= 0 &&
      typeof record.fenceToken === "string" && record.fenceToken.length > 3 && record.fenceToken.length <= 200 &&
      typeof record.writerId === "string" && record.writerId.length > 3 && record.writerId.length <= 200 &&
      Number.isSafeInteger(record.savedAt) && record.savedAt > 0 &&
      typeof record.source === "string" && record.source.length > 0 && record.source.length <= 120;
  }

  async function verifyRecordMetadataReceipt(cryptoApi, record) {
    if (!exactRecordShape(record)) throw makeError("FH_PRIMARY_CORRUPT", "Primary-state envelope shape is invalid.");
    var chainHash = await sha256(cryptoApi, chainMaterial(record));
    if (chainHash !== record.chainSha256) throw makeError("FH_PRIMARY_CORRUPT", "Primary-state commit metadata does not match its chain receipt.");
    if (record.sequence === 1 && (record.previousCommitId || record.previousStateSha256 || record.previousChainSha256)) {
      throw makeError("FH_PRIMARY_CORRUPT", "The initial primary-state commit has an impossible predecessor.");
    }
    if (record.sequence > 1 && (!record.previousCommitId || !record.previousStateSha256 || !record.previousChainSha256)) {
      throw makeError("FH_PRIMARY_CORRUPT", "Primary-state predecessor evidence is incomplete.");
    }
    return record;
  }

  async function verifyRecord(cryptoApi, record, validateRaw) {
    await verifyRecordMetadataReceipt(cryptoApi, record);
    var parsed = parseAndValidateRaw(record.raw, validateRaw);
    if (record.focusMinutesHighWater < parsed.totalFocusMin) {
      throw makeError("FH_PRIMARY_CORRUPT", "Primary-state focus high-water is lower than the committed total.");
    }
    var stateHash = await sha256(cryptoApi, record.raw);
    if (stateHash !== record.stateSha256) throw makeError("FH_PRIMARY_CORRUPT", "Primary-state bytes do not match their SHA-256 receipt.");
    return record;
  }

  function sameRecordBytes(left, right) {
    return !!left && !!right && left.commitId === right.commitId && left.sequence === right.sequence &&
      left.stateSha256 === right.stateSha256 && left.chainSha256 === right.chainSha256 &&
      left.focusMinutesHighWater === right.focusMinutesHighWater &&
      left.fenceToken === right.fenceToken && left.raw === right.raw;
  }

  async function makeRecord(cryptoApi, input) {
    var record = {
      format:FORMAT,
      commitId:input.commitId,
      sequence:input.sequence,
      lineageId:input.lineageId,
      previousCommitId:input.previous ? input.previous.commitId : null,
      previousStateSha256:input.previous ? input.previous.stateSha256 : null,
      previousChainSha256:input.previous ? input.previous.chainSha256 : null,
      stateSha256:await sha256(cryptoApi, input.raw),
      focusMinutesHighWater:input.focusMinutesHighWater,
      chainSha256:"",
      fenceToken:input.fenceToken,
      writerId:input.writerId,
      savedAt:input.savedAt,
      source:input.source,
      raw:input.raw
    };
    record.chainSha256 = await sha256(cryptoApi, chainMaterial(record));
    return record;
  }

  function create(options) {
    options = options || {};
    var indexedDb = options.indexedDB || root.indexedDB;
    var cryptoApi = options.crypto || root.crypto;
    var dbName = options.dbName || DEFAULT_DB;
    var validateRaw = options.validateRaw;
    var now = typeof options.now === "function" ? options.now : Date.now;
    if (!indexedDb || typeof indexedDb.open !== "function") {
      throw makeError("FH_PRIMARY_IDB_UNAVAILABLE", "IndexedDB is unavailable; primary-state migration cannot begin.");
    }
    dbName = boundedText(dbName, "Database name", 200);
    var writerId = options.writerId ? boundedText(options.writerId, "Writer ID", 200) : randomToken(cryptoApi, "writer:");
    var databasePromise = null;
    var closed = false;
    var listeners = [];
    var channel = null;

    function database() {
      if (closed) return Promise.reject(makeError("FH_PRIMARY_CLOSED", "Primary-state engine is closed."));
      if (!databasePromise) databasePromise = openDatabase(indexedDb, dbName);
      return databasePromise;
    }

    async function rawSlots() {
      var db = await database();
      var tx = strictTransaction(db, "readonly");
      var store = tx.objectStore(STORE);
      var headRequest = store.get(HEAD_KEY);
      var previousRequest = store.get(PREVIOUS_KEY);
      var bootstrapRequest = store.get(BOOTSTRAP_KEY);
      var values = await Promise.all([requestResult(headRequest), requestResult(previousRequest),requestResult(bootstrapRequest), transactionDone(tx)]);
      return { head:values[0] || null, previous:values[1] || null,bootstrapSource:values[2]||null };
    }

    async function verifiedSnapshot() {
      var slots = await rawSlots();
      if (!slots.head) {
        if (slots.previous||slots.bootstrapSource) throw makeError("FH_PRIMARY_CORRUPT", "Primary storage contains partial bootstrap data but no authoritative head.");
        return { head:null, previous:null,bootstrapSource:null };
      }
      if(!slots.bootstrapSource)throw makeError("FH_PRIMARY_CORRUPT","Primary storage is missing its immutable bootstrap-source evidence.");
      await verifyBootstrapEvidence(cryptoApi,slots.bootstrapSource);
      if(slots.bootstrapSource.lineageId!==slots.head.lineageId)throw makeError("FH_PRIMARY_CORRUPT","Primary head lineage differs from its bootstrap-source evidence.");
      await verifyRecord(cryptoApi, slots.head, validateRaw);
      if(slots.head.sequence===1&&(slots.bootstrapSource.candidateSha256!==slots.head.stateSha256||
          slots.bootstrapSource.initialCommitId!==slots.head.commitId))throw makeError("FH_PRIMARY_CORRUPT","Initial head does not match its immutable bootstrap-source receipt.");
      if (slots.head.sequence === 1) {
        if (slots.previous) throw makeError("FH_PRIMARY_CORRUPT", "Initial primary head unexpectedly has a previous slot.");
        return slots;
      }
      if (!slots.previous) throw makeError("FH_PRIMARY_CORRUPT", "Primary head is missing its immediately preceding recovery slot.");
      await verifyRecord(cryptoApi, slots.previous, validateRaw);
      if (slots.previous.commitId !== slots.head.previousCommitId ||
          slots.previous.stateSha256 !== slots.head.previousStateSha256 ||
          slots.previous.chainSha256 !== slots.head.previousChainSha256 ||
          slots.previous.sequence + 1 !== slots.head.sequence ||
          slots.previous.lineageId !== slots.head.lineageId) {
        throw makeError("FH_PRIMARY_CORRUPT", "Primary head and previous-slot receipts do not form one verified chain.");
      }
      if (slots.head.focusMinutesHighWater < slots.previous.focusMinutesHighWater) {
        throw makeError("FH_PRIMARY_CORRUPT", "Primary head focus high-water regressed below its verified predecessor.");
      }
      return slots;
    }

    function emit(record) {
      var message = { kind:"focus-hero-primary-commit", dbName:dbName, head:publicMetadata(record) };
      ensureChannel();
      if (channel) { try { channel.postMessage(message); } catch (_) {} }
      listeners.slice().forEach(function (listener) { try { listener(message); } catch (_) {} });
    }

    function ensureChannel() {
      if (channel || typeof root.BroadcastChannel !== "function") return;
      try {
        channel = new root.BroadcastChannel(CHANNEL + ":" + dbName);
        channel.addEventListener("message", function (event) {
          var message = event && event.data;
          var head = message && message.head;
          if (!plainObject(message) || message.kind !== "focus-hero-primary-commit" || message.dbName !== dbName ||
              !plainObject(head) || !Number.isSafeInteger(head.sequence) || head.sequence < 1 ||
              !Number.isSafeInteger(head.focusMinutesHighWater) || head.focusMinutesHighWater < 0 ||
              typeof head.commitId !== "string" || !HASH_RE.test(String(head.stateSha256 || "")) ||
              !HASH_RE.test(String(head.chainSha256 || ""))) return;
          listeners.slice().forEach(function (listener) { try { listener(message); } catch (_) {} });
        });
      } catch (_) { channel = null; }
    }

    async function initializeFromLegacy(input) {
      input = input || {};
      var raw = input.raw;
      var parsed = parseAndValidateRaw(raw, validateRaw);
      var legacySourceRaw=typeof input.legacySourceRaw==="string"?input.legacySourceRaw:raw;
      var legacySourceKey=boundedText(input.legacySourceKey||"legacy-unspecified","Legacy source key",300);
      var lineageId = input.lineageId ? boundedText(input.lineageId, "Lineage ID", 200) : randomToken(cryptoApi, "lineage:");
      var fenceToken = input.fenceToken ? boundedText(input.fenceToken, "Fence token", 200) : randomToken(cryptoApi, "fence:");
      var source = boundedText(input.source || "legacy-bootstrap", "Commit source", 120);
      var commitId = randomToken(cryptoApi, "commit:");
      var savedAt = Math.floor(Number(now()));
      if (!Number.isSafeInteger(savedAt) || savedAt <= 0) throw makeError("FH_PRIMARY_CLOCK_INVALID", "A valid commit time is unavailable; nothing was written.");
      var next = await makeRecord(cryptoApi, {
        raw:raw, commitId:commitId, sequence:1, lineageId:lineageId,
        previous:null, focusMinutesHighWater:parsed.totalFocusMin,
        fenceToken:fenceToken, writerId:writerId, savedAt:savedAt, source:source
      });
      var bootstrapEvidence=await makeBootstrapEvidence(cryptoApi,{sourceKey:legacySourceKey,raw:legacySourceRaw,
        candidateSha256:next.stateSha256,initialCommitId:next.commitId,lineageId:next.lineageId,savedAt:savedAt});
      var db = await database();
      var tx = strictTransaction(db, "readwrite");
      var store = tx.objectStore(STORE);
      try {
        /* Queue every read before awaiting either one. Safari is aggressive
           about auto-closing an IndexedDB transaction when no request remains
           pending between promise continuations. */
        var currentRequest = store.get(HEAD_KEY);
        var previousRequest = store.get(PREVIOUS_KEY);
        var bootstrapRequest = store.get(BOOTSTRAP_KEY);
        var currentAndPrevious = await Promise.all([
          requestResult(currentRequest), requestResult(previousRequest),requestResult(bootstrapRequest)
        ]);
        var current = currentAndPrevious[0];
        var previous = currentAndPrevious[1];
        var existingBootstrap=currentAndPrevious[2];
        if (current || previous||existingBootstrap) {
          try { tx.abort(); } catch (_) {}
          throw makeError("FH_PRIMARY_ALREADY_INITIALIZED", "Primary storage already contains state; legacy bootstrap was not applied.");
        }
        store.put(next, HEAD_KEY);
        store.put(bootstrapEvidence,BOOTSTRAP_KEY);
        await transactionDone(tx);
      } catch (error) {
        try { tx.abort(); } catch (_) {}
        if (error && error.code) throw error;
        throw makeError("FH_PRIMARY_COMMIT_FAILED", "Legacy bootstrap failed atomically; no authoritative state was selected.", {
          cause:String(error && (error.message || error))
        });
      }
      var verified;
      try { verified = await verifiedSnapshot(); }
      catch (error) {
        throw makeError("FH_PRIMARY_COMMIT_INDETERMINATE", "Legacy bootstrap completed but its exact read-back could not be verified. Do not retry or choose another profile automatically.", {
          cause:String(error && (error.message || error)), commitId:commitId
        });
      }
      if (!sameRecordBytes(verified.head, next)) {
        throw makeError("FH_PRIMARY_COMMIT_INDETERMINATE", "Legacy bootstrap read-back differs from the exact candidate. Do not retry automatically.", { commitId:commitId });
      }
      if(!sameBootstrapEvidence(verified.bootstrapSource,bootstrapEvidence))throw makeError("FH_PRIMARY_COMMIT_INDETERMINATE","Legacy bootstrap source evidence did not read back exactly.",{commitId:commitId});
      emit(next);
      return { raw:next.raw, head:publicMetadata(next), previous:null };
    }

    async function commit(input) {
      input = input || {};
      var raw = input.raw;
      var parsed = parseAndValidateRaw(raw, validateRaw);
      var expectedCommitId = boundedText(input.expectedCommitId, "Expected commit ID", 200);
      var expectedFenceToken = boundedText(input.expectedFenceToken, "Expected fence token", 200);
      var source = boundedText(input.source || "local-save", "Commit source", 120);
      var snapshot = await verifiedSnapshot();
      if (!snapshot.head) throw makeError("FH_PRIMARY_UNINITIALIZED", "Primary storage is empty; explicit legacy bootstrap is required.");
      if (snapshot.head.commitId !== expectedCommitId || snapshot.head.fenceToken !== expectedFenceToken) {
        throw makeError("FH_PRIMARY_CONFLICT", "Primary state advanced or its operation fence changed; stale bytes were not written.", {
          expectedCommitId:expectedCommitId, actualCommitId:snapshot.head.commitId,
          expectedSequence:snapshot.head.sequence
        });
      }
      var nextFenceToken = input.rotateFence === true
        ? (input.nextFenceToken ? boundedText(input.nextFenceToken, "Next fence token", 200) : randomToken(cryptoApi, "fence:"))
        : expectedFenceToken;
      if (input.rotateFence !== true && input.nextFenceToken && input.nextFenceToken !== expectedFenceToken) {
        throw makeError("FH_PRIMARY_INVALID_ARGUMENT", "A fence token can change only during an explicit fence rotation.");
      }
      var savedAt = Math.floor(Number(now()));
      if (!Number.isSafeInteger(savedAt) || savedAt <= 0) throw makeError("FH_PRIMARY_CLOCK_INVALID", "A valid commit time is unavailable; nothing was written.");
      var next = await makeRecord(cryptoApi, {
        raw:raw, commitId:randomToken(cryptoApi, "commit:"), sequence:snapshot.head.sequence + 1,
        lineageId:snapshot.head.lineageId, previous:snapshot.head, fenceToken:nextFenceToken,
        focusMinutesHighWater:Math.max(snapshot.head.focusMinutesHighWater, parsed.totalFocusMin),
        writerId:writerId, savedAt:savedAt, source:source
      });
      var db = await database();
      var tx = strictTransaction(db, "readwrite");
      var store = tx.objectStore(STORE);
      try {
        var currentRequest = store.get(HEAD_KEY);
        var previousRequest = store.get(PREVIOUS_KEY);
        var bootstrapRequest=store.get(BOOTSTRAP_KEY);
        var currentAndPrevious = await Promise.all([
          requestResult(currentRequest), requestResult(previousRequest),requestResult(bootstrapRequest)
        ]);
        var current = currentAndPrevious[0];
        var currentPrevious = currentAndPrevious[1];
        var currentBootstrap=currentAndPrevious[2];
        if (!sameRecordBytes(current, snapshot.head) || current.fenceToken !== expectedFenceToken) {
          try { tx.abort(); } catch (_) {}
          throw makeError("FH_PRIMARY_CONFLICT", "Another tab committed first; stale bytes were not written.", {
            expectedCommitId:expectedCommitId,
            actualCommitId:current && current.commitId || null
          });
        }
        if (snapshot.previous && !sameRecordBytes(currentPrevious, snapshot.previous)) {
          try { tx.abort(); } catch (_) {}
          throw makeError("FH_PRIMARY_CONFLICT", "The recovery slot changed during the commit; no bytes were written.");
        }
        if (!snapshot.previous && currentPrevious) {
          try { tx.abort(); } catch (_) {}
          throw makeError("FH_PRIMARY_CORRUPT", "An unexpected recovery slot appeared; no bytes were written.");
        }
        if(!sameBootstrapEvidence(currentBootstrap,snapshot.bootstrapSource)){
          try{tx.abort();}catch(_){}
          throw makeError("FH_PRIMARY_CORRUPT","Immutable bootstrap-source evidence changed during commit; nothing was written.");
        }
        store.put(current, PREVIOUS_KEY);
        store.put(next, HEAD_KEY);
        await transactionDone(tx);
      } catch (error) {
        try { tx.abort(); } catch (_) {}
        if (error && error.code) throw error;
        throw makeError("FH_PRIMARY_COMMIT_FAILED", "Primary-state commit failed atomically; the prior verified head remains authoritative.", {
          cause:String(error && (error.message || error))
        });
      }
      var verified;
      try { verified = await verifiedSnapshot(); }
      catch (error) {
        throw makeError("FH_PRIMARY_COMMIT_INDETERMINATE", "Primary commit completed but its exact read-back could not be verified. Block accounting and sync until the head is inspected.", {
          cause:String(error && (error.message || error)), commitId:next.commitId
        });
      }
      if (!sameRecordBytes(verified.head, next) || !sameRecordBytes(verified.previous, snapshot.head)) {
        throw makeError("FH_PRIMARY_COMMIT_INDETERMINATE", "Primary commit read-back differs from the exact candidate or predecessor. Block accounting and sync.", { commitId:next.commitId });
      }
      emit(next);
      return { raw:next.raw, head:publicMetadata(next), previous:publicMetadata(verified.previous) };
    }

    /* Explicit Recovery-only repair for the one case the rotating previous
       slot exists to solve: the physical head is missing or fails independent
       verification while previous + immutable bootstrap evidence still
       verify. Recovery must first preserve the exact physical slot bundle in
       an independent cold archive and pass its verified receipt. This method
       never deletes that archive or the bootstrap source, never guesses from
       an invalid head, and always rotates the persisted operation fence. */
    async function repairFromVerifiedPrevious(input){
      input=input||{};
      var raw=input.raw;
      var parsed=parseAndValidateRaw(raw,validateRaw);
      var expectedPreviousCommitId=boundedText(input.expectedPreviousCommitId,"Expected previous commit ID",200);
      var preservation=input.preservationReceipt;
      var forensicRaw=input.forensicRaw;
      if(!plainObject(preservation)||typeof preservation.coldId!=="string"||!preservation.coldId||preservation.coldId.length>500||
          !HASH_RE.test(String(preservation.sha256||""))||!Number.isSafeInteger(preservation.bytes)||preservation.bytes<=0){
        throw makeError("FH_PRIMARY_RECOVERY_PRESERVATION_REQUIRED","A verified independent forensic preservation receipt is required before primary repair.");
      }
      if(typeof forensicRaw!=="string"||!forensicRaw)throw makeError("FH_PRIMARY_RECOVERY_PRESERVATION_REQUIRED","Exact forensic primary-slot bytes are required before primary repair.");
      var slots=await rawSlots();
      function forensicBundle(currentSlots){
        return JSON.stringify({format:"focus-hero-primary-forensic-v1",dbName:dbName,store:STORE,
          head:currentSlots.head||null,previous:currentSlots.previous||null,bootstrapSource:currentSlots.bootstrapSource||null});
      }
      var expectedForensicRaw=forensicBundle(slots);
      var forensicSha=await sha256(cryptoApi,forensicRaw);
      var forensicBytes=typeof TextEncoder==="function"?new TextEncoder().encode(forensicRaw).byteLength:forensicRaw.length;
      if(forensicRaw!==expectedForensicRaw||forensicSha!==preservation.sha256||forensicBytes!==preservation.bytes){
        throw makeError("FH_PRIMARY_RECOVERY_PRESERVATION_REQUIRED","The cold preservation receipt does not prove the exact current physical primary slots; repair was refused.");
      }
      if(!slots.previous)throw makeError("FH_PRIMARY_RECOVERY_UNAVAILABLE","No physical previous slot exists for explicit repair.");
      await verifyRecord(cryptoApi,slots.previous,validateRaw);
      if(slots.previous.commitId!==expectedPreviousCommitId)throw makeError("FH_PRIMARY_CONFLICT","The selected previous slot changed before repair.");
      if(!slots.bootstrapSource)throw makeError("FH_PRIMARY_CORRUPT","Immutable bootstrap-source evidence is missing; repair was refused.");
      await verifyBootstrapEvidence(cryptoApi,slots.bootstrapSource);
      if(slots.bootstrapSource.lineageId!==slots.previous.lineageId)throw makeError("FH_PRIMARY_CORRUPT","Previous slot lineage differs from immutable bootstrap evidence.");
      if(slots.previous.sequence===1&&(slots.bootstrapSource.candidateSha256!==slots.previous.stateSha256||
          slots.bootstrapSource.initialCommitId!==slots.previous.commitId))throw makeError("FH_PRIMARY_CORRUPT","Initial previous slot is not bound to immutable bootstrap evidence.");
      var preservedHeadHighWater=slots.previous.focusMinutesHighWater;
      if(slots.head){
        try{await verifyRecord(cryptoApi,slots.head,validateRaw);throw makeError("FH_PRIMARY_RECOVERY_REFUSED","The physical head verifies independently; automatic backward repair was refused.");}
        catch(error){if(error&&error.code==="FH_PRIMARY_RECOVERY_REFUSED")throw error;}
        /* A damaged state payload must never be selected as player data, but
           its separately chain-verified metadata may retain a higher
           block-only focus watermark when it still links exactly to the
           verified predecessor. This prevents recovery from lowering the
           cloud-collapse tripwire merely because the newest raw bytes broke. */
        try{
          await verifyRecordMetadataReceipt(cryptoApi,slots.head);
          if(slots.head.previousCommitId===slots.previous.commitId&&
              slots.head.previousStateSha256===slots.previous.stateSha256&&
              slots.head.previousChainSha256===slots.previous.chainSha256&&
              slots.head.sequence===slots.previous.sequence+1&&
              slots.head.lineageId===slots.previous.lineageId&&
              slots.head.focusMinutesHighWater>=slots.previous.focusMinutesHighWater){
            preservedHeadHighWater=slots.head.focusMinutesHighWater;
          }
        }catch(_){ /* invalid metadata is preserved only in the forensic copy */ }
      }
      var savedAt=Math.floor(Number(now()));
      if(!Number.isSafeInteger(savedAt)||savedAt<=0)throw makeError("FH_PRIMARY_CLOCK_INVALID","A valid commit time is unavailable; repair was not attempted.");
      var next=await makeRecord(cryptoApi,{raw:raw,commitId:randomToken(cryptoApi,"commit:"),sequence:slots.previous.sequence+1,
        lineageId:slots.previous.lineageId,previous:slots.previous,fenceToken:randomToken(cryptoApi,"fence:"),writerId:writerId,
        focusMinutesHighWater:Math.max(preservedHeadHighWater,slots.previous.focusMinutesHighWater,parsed.totalFocusMin),
        savedAt:savedAt,source:boundedText(input.source||"recovery-previous-repair","Commit source",120)});
      var db=await database(),tx=strictTransaction(db,"readwrite"),store=tx.objectStore(STORE);
      try{
        var headRequest=store.get(HEAD_KEY),previousRequest=store.get(PREVIOUS_KEY),bootstrapRequest=store.get(BOOTSTRAP_KEY);
        var current=await Promise.all([requestResult(headRequest),requestResult(previousRequest),requestResult(bootstrapRequest)]);
        var currentHead=current[0]||null,currentPrevious=current[1]||null,currentBootstrap=current[2]||null;
        if(forensicBundle({head:currentHead,previous:currentPrevious,bootstrapSource:currentBootstrap})!==forensicRaw||
            JSON.stringify(currentHead)!==JSON.stringify(slots.head)||!sameRecordBytes(currentPrevious,slots.previous)||!sameBootstrapEvidence(currentBootstrap,slots.bootstrapSource)){
          try{tx.abort();}catch(_){}
          throw makeError("FH_PRIMARY_CONFLICT","Primary physical slots changed after forensic preservation; repair wrote nothing.");
        }
        store.put(next,HEAD_KEY);
        await transactionDone(tx);
      }catch(error){
        try{tx.abort();}catch(_){}
        if(error&&error.code)throw error;
        throw makeError("FH_PRIMARY_COMMIT_FAILED","Explicit previous-slot repair failed atomically; physical evidence was not deleted.",{cause:String(error&&(error.message||error))});
      }
      var verified;
      try{verified=await verifiedSnapshot();}
      catch(error){throw makeError("FH_PRIMARY_COMMIT_INDETERMINATE","Previous-slot repair completed but exact joined read-back failed. Do not retry automatically.",{cause:String(error&&(error.message||error)),commitId:next.commitId});}
      if(!sameRecordBytes(verified.head,next)||!sameRecordBytes(verified.previous,slots.previous))throw makeError("FH_PRIMARY_COMMIT_INDETERMINATE","Previous-slot repair read-back differs from the exact candidate or predecessor.",{commitId:next.commitId});
      emit(next);
      return{raw:next.raw,head:publicMetadata(next),previous:publicMetadata(verified.previous),preservationReceipt:{coldId:preservation.coldId,sha256:preservation.sha256,bytes:preservation.bytes}};
    }

    async function readHead() {
      var snapshot = await verifiedSnapshot();
      return snapshot.head ? { raw:snapshot.head.raw, head:publicMetadata(snapshot.head) } : null;
    }

    async function readPrevious() {
      var snapshot = await verifiedSnapshot();
      return snapshot.previous ? { raw:snapshot.previous.raw, head:publicMetadata(snapshot.previous) } : null;
    }

    async function inspect() {
      var snapshot = await verifiedSnapshot();
      return { dbName:dbName, initialized:!!snapshot.head, head:publicMetadata(snapshot.head), previous:publicMetadata(snapshot.previous) };
    }

    /* Recovery-only inspection deliberately verifies each physical slot on
       its own. Normal boot and commit continue to require the strict joined
       chain above. This API never selects, repairs, copies, or writes a slot;
       it only lets Recovery show a still-valid predecessor when the other
       envelope is missing or corrupt. Invalid raw bytes are never returned. */
    async function inspectRecoverySlots() {
      var slots = await rawSlots();
      async function inspectOne(name, record) {
        if (!record) return { slot:name, exists:false, valid:false, raw:null, head:null, error:null };
        try {
          await verifyRecord(cryptoApi, record, validateRaw);
          return { slot:name, exists:true, valid:true, raw:record.raw, head:publicMetadata(record), error:null };
        } catch (error) {
          return {
            slot:name, exists:true, valid:false, raw:null, head:null,
            error:{ code:error && error.code || "FH_PRIMARY_CORRUPT", message:String(error && (error.message || error) || "Primary slot verification failed.") }
          };
        }
      }
      var checked = await Promise.all([
        inspectOne(HEAD_KEY, slots.head),
        inspectOne(PREVIOUS_KEY, slots.previous)
      ]);
      var head = checked[0], previous = checked[1];
      var chain = { complete:false, reason:"Primary recovery chain is incomplete." };
      if (!head.exists && !previous.exists) chain = { complete:true, reason:"Primary storage is empty." };
      else if (head.valid && head.head.sequence === 1 && !previous.exists) chain = { complete:true, reason:null };
      else if (head.valid && previous.valid &&
          previous.head.commitId === head.head.previousCommitId &&
          previous.head.stateSha256 === slots.head.previousStateSha256 &&
          previous.head.chainSha256 === slots.head.previousChainSha256 &&
          previous.head.sequence + 1 === head.head.sequence &&
          previous.head.lineageId === head.head.lineageId &&
          head.head.focusMinutesHighWater >= previous.head.focusMinutesHighWater) {
        chain = { complete:true, reason:null };
      } else if (head.exists && !head.valid) chain.reason = "The head envelope is corrupt; a separately valid previous slot may still be chosen explicitly.";
      else if (previous.exists && !previous.valid) chain.reason = "The previous envelope is corrupt; a separately valid head may still be chosen explicitly.";
      else if (!head.exists && previous.valid) chain.reason = "The head is missing; the verified previous slot may still be chosen explicitly.";
      else if (head.valid && !previous.exists) chain.reason = "The verified head is missing its required previous slot.";
      else if (head.valid && previous.valid) chain.reason = "Both envelopes verify independently but their receipts do not form one chain.";
      var bootstrap={exists:!!slots.bootstrapSource,valid:false,raw:null,sourceKey:null,error:null};
      if(slots.bootstrapSource){
        try{await verifyBootstrapEvidence(cryptoApi,slots.bootstrapSource);bootstrap={exists:true,valid:true,raw:slots.bootstrapSource.raw,
          sourceKey:slots.bootstrapSource.sourceKey,sourceSha256:slots.bootstrapSource.sourceSha256,
          candidateSha256:slots.bootstrapSource.candidateSha256,initialCommitId:slots.bootstrapSource.initialCommitId,
          lineageId:slots.bootstrapSource.lineageId,savedAt:slots.bootstrapSource.savedAt,error:null};}
        catch(error){bootstrap.error={code:error&&error.code||"FH_PRIMARY_CORRUPT",message:String(error&&error.message||error)};}
      }
      /* Recovery may expose independently verified envelopes for download, but
         it must never call the joined primary chain healthy unless the
         immutable bootstrap root is also verified and bound to that lineage.
         Normal boot/readHead already enforces the same conditions strictly. */
      if(chain.complete&&head.exists){
        if(!bootstrap.exists){chain={complete:false,reason:"The primary chain is missing its immutable bootstrap-source evidence."};}
        else if(!bootstrap.valid){chain={complete:false,reason:"The immutable bootstrap-source evidence is corrupt."};}
        else if(!head.valid||bootstrap.lineageId!==head.head.lineageId){chain={complete:false,reason:"The primary head lineage does not match its bootstrap-source evidence."};}
        else if(head.head.sequence===1&&(bootstrap.candidateSha256!==head.head.stateSha256||bootstrap.initialCommitId!==head.head.commitId)){
          chain={complete:false,reason:"The initial primary head is not bound to its bootstrap-source receipt."};
        }
      }else if(chain.complete&&!head.exists&&bootstrap.exists){
        chain={complete:false,reason:bootstrap.valid?"Bootstrap-source evidence exists without an authoritative head.":"Corrupt bootstrap-source evidence exists without an authoritative head."};
      }
      return { dbName:dbName, head:head, previous:previous,bootstrapSource:bootstrap, chain:chain };
    }

    async function persistenceStatus() {
      var storage = root.navigator && root.navigator.storage;
      var persisted = null, estimate = null;
      try { if (storage && typeof storage.persisted === "function") persisted = await storage.persisted(); } catch (_) {}
      try { if (storage && typeof storage.estimate === "function") estimate = await storage.estimate(); } catch (_) {}
      return { persisted:persisted, estimate:estimate && {
        usage:Number.isFinite(estimate.usage) ? estimate.usage : null,
        quota:Number.isFinite(estimate.quota) ? estimate.quota : null
      } };
    }

    async function requestPersistence() {
      var storage = root.navigator && root.navigator.storage;
      if (!storage || typeof storage.persist !== "function") return { supported:false, persisted:false };
      var persisted = await storage.persist();
      return { supported:true, persisted:!!persisted };
    }

    function subscribe(listener) {
      if (typeof listener !== "function") throw makeError("FH_PRIMARY_INVALID_ARGUMENT", "A commit listener must be a function.");
      listeners.push(listener);
      ensureChannel();
      return function () {
        var index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      };
    }

    async function close() {
      closed = true;
      if (channel) { try { channel.close(); } catch (_) {} channel = null; }
      if (databasePromise) {
        try { (await databasePromise).close(); } catch (_) {}
      }
    }

    return Object.freeze({
      open:async function () { await database(); return inspect(); },
      initializeFromLegacy:initializeFromLegacy,
      commit:commit,
      readHead:readHead,
      readPrevious:readPrevious,
      inspect:inspect,
      inspectRecoverySlots:inspectRecoverySlots,
      repairFromVerifiedPrevious:repairFromVerifiedPrevious,
      subscribe:subscribe,
      persistenceStatus:persistenceStatus,
      requestPersistence:requestPersistence,
      close:close
    });
  }

  var api = Object.freeze({
    FORMAT:FORMAT,
    DEFAULT_DB:DEFAULT_DB,
    CHANNEL:CHANNEL,
    create:create
  });
  try { Object.defineProperty(root, "FH_PRIMARY_STORE", { value:api, enumerable:false, configurable:false, writable:false }); }
  catch (_) { root.FH_PRIMARY_STORE = api; }
})(typeof window !== "undefined" ? window : globalThis);

/* asset content-type refresh — v10.32.0 */
