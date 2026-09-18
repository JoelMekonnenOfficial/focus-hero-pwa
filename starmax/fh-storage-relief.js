/* ================================================================
 * Life XP — storage relief (v3, 2026-08-17)
 *
 * Keeps one-off recovery snapshots in the same-origin
 * `fh-coldstore/snaps` IndexedDB store. Existing snapshots are relocated, and
 * destructive callers can await `FH_RELIEF.preserveSnapshot(key, raw)` before
 * mutating anything. The live state, guard mirror, last-known-good mirror, and
 * fh-guard ring are never candidates.
 *
 * Safety contract:
 *   1. a cold record is inserted immutably (never overwritten),
 *   2. the stored string is read back and compared exactly,
 *   3. explicit preservation resolves only after that exact read-back,
 *   4. an existing local string must still equal the observed string before
 *      only that exact local copy is removed.
 *
 * Cold storage remains browser storage, not an independent backup.
 * Recovery Center is the supported way to inspect or restore records.
 * ================================================================ */
(function () {
  "use strict";

  if (window.__fhStorageReliefInstalled) return;
  window.__fhStorageReliefInstalled = true;

  var DB = "fh-coldstore";
  var STORE = "snaps";
  var VER = 1;
  var LOCK = "focus-hero-storage-relief-v2";
  var MAIN = "focusHero.v4.state";
  var RESTORED_PREFIX = MAIN + ".cold-restored-";
  var RESCAN_MS = 30000;
  var STABLE_MS = 75;
  var POST_WRITE_MS = 150;

  /* Covers both the app's timestamped `pre-*` snapshots and legacy/current
     underscore snapshots such as `pre_session_delete_<session-id>`.
     Requiring `.pre-` or `.pre_` excludes live, guard, and lkg by design. */
  var MOVABLE = /^focusHero\.v4\.state\.pre(?:-|_)/;

  var running = null;
  var scheduled = null;
  var collisionSequence = 0;
  var restoreSequence = 0;
  var storageChanges = Object.create(null);
  var recentRemovals = Object.create(null);

  function instanceToken() {
    try {
      if (crypto && typeof crypto.randomUUID === "function") return crypto.randomUUID().replace(/-/g, "");
      if (crypto && typeof crypto.getRandomValues === "function") {
        var values = new Uint32Array(4);
        crypto.getRandomValues(values);
        return Array.prototype.map.call(values, function (value) { return value.toString(16).padStart(8, "0"); }).join("");
      }
    } catch (_) {}
    return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  }

  var restoreInstance = instanceToken();

  function errorText(error) {
    return String(error && error.message ? error.message : error || "unknown error");
  }

  function bytes(value) {
    try { return new Blob([String(value)]).size; }
    catch (_) { return String(value).length; }
  }

  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function usage() {
    var total = 0;
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key == null) continue;
        total += bytes(key) + bytes(localStorage.getItem(key) || "");
      }
    } catch (_) {}
    return total;
  }

  function localTargets() {
    var out = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key && MOVABLE.test(key)) out.push(key);
      }
    } catch (_) {}
    out.sort();
    return out;
  }

  function openDb() {
    return new Promise(function (resolve, reject) {
      var request;
      try { request = indexedDB.open(DB, VER); }
      catch (error) { reject(error); return; }
      request.onupgradeneeded = function () {
        var db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "k" });
        }
      };
      request.onsuccess = function () {
        var db = request.result;
        db.onversionchange = function () { try { db.close(); } catch (_) {} };
        resolve(db);
      };
      request.onerror = function () { reject(request.error || new Error("IndexedDB open failed")); };
      request.onblocked = function () { reject(new Error("IndexedDB cold storage is blocked by another page")); };
    });
  }

  function withDb(operation) {
    return openDb().then(function (db) {
      var result;
      try { result = operation(db); }
      catch (error) { try { db.close(); } catch (_) {} throw error; }
      return Promise.resolve(result).then(function (value) {
        try { db.close(); } catch (_) {}
        return value;
      }, function (error) {
        try { db.close(); } catch (_) {}
        throw error;
      });
    });
  }

  function writeTransaction(db) {
    /* Explicit strict durability prevents the browser's relaxed default from
       reporting completion before the storage system has durably committed.
       Older engines that do not accept transaction options use their safest
       available implementation and still undergo exact read-back checking. */
    try { return db.transaction(STORE, "readwrite", { durability: "strict" }); }
    catch (_) { return db.transaction(STORE, "readwrite"); }
  }

  function readRecord(db, id) {
    return new Promise(function (resolve, reject) {
      var tx, request, value = null;
      try {
        tx = db.transaction(STORE, "readonly");
        request = tx.objectStore(STORE).get(id);
        request.onsuccess = function () { value = request.result || null; };
        request.onerror = function () { reject(request.error || new Error("IndexedDB read failed")); };
        tx.oncomplete = function () { resolve(value); };
        tx.onerror = function () { reject(tx.error || new Error("IndexedDB read failed")); };
        tx.onabort = function () { reject(tx.error || new Error("IndexedDB read aborted")); };
      } catch (error) { reject(error); }
    });
  }

  function readAll(db) {
    return new Promise(function (resolve, reject) {
      var tx, request, rows = [];
      try {
        tx = db.transaction(STORE, "readonly");
        request = tx.objectStore(STORE).getAll();
        request.onsuccess = function () { rows = request.result || []; };
        request.onerror = function () { reject(request.error || new Error("IndexedDB scan failed")); };
        tx.oncomplete = function () { resolve(rows); };
        tx.onerror = function () { reject(tx.error || new Error("IndexedDB scan failed")); };
        tx.onabort = function () { reject(tx.error || new Error("IndexedDB scan aborted")); };
      } catch (error) { reject(error); }
    });
  }

  function addRecord(db, record) {
    return new Promise(function (resolve, reject) {
      var tx, request, requestError = null;
      try {
        tx = writeTransaction(db);
        request = tx.objectStore(STORE).add(record);
        request.onerror = function () { requestError = request.error; };
        tx.oncomplete = function () { resolve(record); };
        tx.onerror = function () { reject(requestError || tx.error || new Error("IndexedDB insert failed")); };
        tx.onabort = function () { reject(requestError || tx.error || new Error("IndexedDB insert aborted")); };
      } catch (error) { reject(error); }
    });
  }

  function fingerprint(value) {
    /* This is only a readable collision suffix. Exact equality—not this hash—
       is the integrity decision. */
    var hash = 2166136261;
    for (var i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function makeRecord(id, sourceKey, raw) {
    return {
      k: id,
      sourceKey: sourceKey,
      v: raw,
      at: Date.now(),
      bytes: bytes(raw),
      fingerprint: fingerprint(raw),
      format: 2,
      retention: "preserve"
    };
  }

  function uniqueColdId(sourceKey, raw, attempt) {
    collisionSequence++;
    return sourceKey + "::cold::" + fingerprint(raw) + "::" +
      Date.now().toString(36) + "-" + collisionSequence.toString(36) + "-" + attempt.toString(36);
  }

  function insertCollisionRecord(db, sourceKey, raw, attempt) {
    attempt = attempt || 0;
    if (attempt > 12) return Promise.reject(new Error("Could not allocate an immutable cold-storage record"));
    var id = uniqueColdId(sourceKey, raw, attempt);
    return addRecord(db, makeRecord(id, sourceKey, raw)).then(function (record) {
      return { record: record, status: "collision-preserved" };
    }).catch(function (error) {
      if (error && error.name === "ConstraintError") {
        return insertCollisionRecord(db, sourceKey, raw, attempt + 1);
      }
      throw error;
    });
  }

  function persistImmutable(db, sourceKey, raw) {
    var initial = makeRecord(sourceKey, sourceKey, raw);
    return addRecord(db, initial).then(function (record) {
      return { record: record, status: "created" };
    }).catch(function (error) {
      if (!error || error.name !== "ConstraintError") throw error;
      return readRecord(db, sourceKey).then(function (existing) {
        if (existing && existing.v === raw && (existing.sourceKey || existing.k) === sourceKey) {
          return { record: existing, status: "already-preserved" };
        }
        /* Never overwrite the original record. Reuse an already-preserved
           exact collision copy; otherwise allocate a new immutable cold ID. */
        return readAll(db).then(function (records) {
          for (var i = 0; i < records.length; i++) {
            var candidate = records[i];
            if (candidate && candidate.v === raw && (candidate.sourceKey || candidate.k) === sourceKey) {
              return { record: candidate, status: "already-preserved-collision" };
            }
          }
          return insertCollisionRecord(db, sourceKey, raw, 0);
        });
      });
    });
  }

  function verifyColdRecord(db, record, sourceKey, raw) {
    return readRecord(db, record.k).then(function (back) {
      if (!back || back.v !== raw || (back.sourceKey || back.k) !== sourceKey) {
        throw new Error("cold-storage read-back differed from the source snapshot");
      }
      return back;
    });
  }

  function preserveSnapshot(key, raw) {
    if (typeof key !== "string" || !MOVABLE.test(key)) {
      return Promise.reject(new Error("Only Life XP pre-* and pre_* snapshot keys can be preserved"));
    }
    if (typeof raw !== "string") {
      return Promise.reject(new Error("Snapshot bytes must be provided as an exact string"));
    }
    return withCrossTabLock(function () {
      return withDb(function (db) {
        return persistImmutable(db, key, raw).then(function (stored) {
          return verifyColdRecord(db, stored.record, key, raw).then(function () {
            return {
              ok: true,
              key: key,
              bytes: bytes(raw),
              coldId: stored.record.k,
              status: stored.status
            };
          });
        });
      });
    });
  }

  function relocateOne(db, key) {
    var raw;
    try { raw = localStorage.getItem(key); }
    catch (error) { return Promise.resolve({ moved: false, reason: "local-read-failed", error: errorText(error) }); }
    if (raw === null) return Promise.resolve({ moved: false, reason: "already-absent" });
    var observedChange = storageChanges[key] || 0;

    return wait(STABLE_MS).then(function () {
      /* Do not archive a key that is still being written in this or a peer
         tab. Snapshot keys are expected to be write-once; a change is treated
         as a conflict and left in localStorage for a later pass. */
      if ((storageChanges[key] || 0) !== observedChange || localStorage.getItem(key) !== raw) {
        return { moved: false, reason: "source-changed-before-copy" };
      }
      return persistImmutable(db, key, raw).then(function (stored) {
        return verifyColdRecord(db, stored.record, key, raw).then(function () {
          return wait(POST_WRITE_MS).then(function () {
            /* The last read immediately precedes removal. This closes the
               previously demonstrated stale-read deletion path: if a peer
               replaces the key, its newer bytes are never removed. */
            if ((storageChanges[key] || 0) !== observedChange || localStorage.getItem(key) !== raw) {
              return { moved: false, reason: "source-changed-before-remove", coldId: stored.record.k };
            }
            recentRemovals[key] = { raw: raw, at: Date.now() };
            try { localStorage.removeItem(key); }
            catch (error) {
              delete recentRemovals[key];
              return { moved: false, reason: "local-remove-failed", error: errorText(error), coldId: stored.record.k };
            }
            if (localStorage.getItem(key) !== null) {
              delete recentRemovals[key];
              return { moved: false, reason: "source-reappeared", coldId: stored.record.k };
            }
            setTimeout(function () { delete recentRemovals[key]; }, 5000);
            return { moved: true, bytes: bytes(raw), coldId: stored.record.k, status: stored.status };
          });
        });
      });
    }).catch(function (error) {
      return { moved: false, reason: "copy-failed", error: errorText(error) };
    });
  }

  function relieveCore() {
    var targets = localTargets();
    var before = usage();
    if (!targets.length) {
      return Promise.resolve({ moved: 0, kept: 0, freed: 0, before: before, after: before });
    }
    return withDb(function (db) {
      var moved = 0, kept = 0, freed = 0;
      var details = [];
      var chain = Promise.resolve();
      targets.forEach(function (key) {
        chain = chain.then(function () {
          return relocateOne(db, key).then(function (result) {
            details.push({ key: key, result: result });
            if (result.moved) { moved++; freed += result.bytes || 0; }
            else kept++;
          });
        });
      });
      return chain.then(function () {
        var after = usage();
        var result = { moved: moved, kept: kept, freed: freed, before: before, after: after, details: details };
        if (moved) {
          console.info("[fh-relief] safely relocated " + moved + " snapshot(s), freeing about " +
            Math.round(freed / 1024) + " KB from localStorage");
        }
        return result;
      });
    });
  }

  function withCrossTabLock(operation) {
    if (navigator.locks && typeof navigator.locks.request === "function") {
      return navigator.locks.request(LOCK, { mode: "exclusive" }, operation);
    }
    /* Exact source re-checks remain fail-closed when Web Locks are absent. */
    return operation();
  }

  function relieve() {
    if (running) return running;
    var operation = Promise.resolve().then(function () {
      return withCrossTabLock(relieveCore);
    }).catch(function (error) {
      console.warn("[fh-relief] relocation skipped:", errorText(error));
      return { moved: 0, kept: 0, freed: 0, error: errorText(error) };
    });
    running = operation.then(function (result) { running = null; return result; }, function (error) {
      running = null;
      throw error;
    });
    return running;
  }

  function listCold() {
    return withDb(function (db) { return readAll(db); }).then(function (records) {
      return records.map(function (record) {
        var hours = null;
        try {
          var parsed = JSON.parse(record.v);
          var state = parsed && parsed.state ? parsed.state : parsed;
          if (state && Number.isFinite(Number(state.totalFocusMin))) {
            hours = (Number(state.totalFocusMin) / 60).toFixed(1) + "h";
          }
        } catch (_) {}
        return {
          id: record.k,
          key: record.sourceKey || record.k,
          bytes: bytes(record.v || ""),
          hours: hours,
          storedAt: record.at || null
        };
      });
    });
  }

  function uniqueRestoredKey(storage) {
    var stamp = new Date().toISOString().replace(/[:.]/g, "-");
    restoreSequence++;
    var base = RESTORED_PREFIX + stamp + "-" + restoreInstance + "-" + restoreSequence.toString(36);
    var key = base, suffix = 0;
    while (storage.getItem(key) !== null) { suffix++; key = base + "-" + suffix; }
    return key;
  }

  function copyRecordToLocal(record, storage) {
    storage = storage || localStorage;
    if (!record || typeof record.v !== "string") {
      return { ok: false, error: "cold snapshot was missing or malformed" };
    }
    var key;
    try {
      key = uniqueRestoredKey(storage);
      /* The destination is a new non-relocatable recovery key. Existing local
         snapshots—including the record's original source key—are untouched. */
      storage.setItem(key, record.v);
      if (storage.getItem(key) !== record.v) {
        return { ok: false, error: "restored bytes did not match", key: key };
      }
      return { ok: true, key: key, sourceKey: record.sourceKey || record.k, bytes: bytes(record.v) };
    } catch (error) {
      return { ok: false, error: errorText(error), key: key || null };
    }
  }

  function restoreCold(id) {
    return withCrossTabLock(function () {
      return withDb(function (db) { return readRecord(db, id); }).then(function (record) {
        if (!record) return { ok: false, error: "not found in cold storage", id: id };
        return copyRecordToLocal(record, localStorage);
      });
    }).catch(function (error) {
      return { ok: false, error: errorText(error), id: id };
    });
  }

  function schedule(delay) {
    if (scheduled !== null) clearTimeout(scheduled);
    scheduled = setTimeout(function () {
      scheduled = null;
      void relieve();
    }, Math.max(0, Number(delay) || 0));
  }

  window.addEventListener("storage", function (event) {
    if (!event.key || !MOVABLE.test(event.key)) return;
    var recent = recentRemovals[event.key];
    if (recent && event.newValue !== null && event.newValue !== recent.raw) {
      /* A peer write can theoretically land between the final comparison and
         removeItem. Its storage event carries the exact newer value. If our
         removal won that race and the key is absent, put those peer bytes back
         immediately; a later pass will archive them under their own cold ID. */
      try {
        if (localStorage.getItem(event.key) === null) localStorage.setItem(event.key, event.newValue);
      } catch (_) {}
    }
    storageChanges[event.key] = (storageChanges[event.key] || 0) + 1;
    schedule(250);
  });
  window.addEventListener("pageshow", function () { schedule(500); });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") schedule(500);
  });

  window.FH_RELIEF = {
    run: relieve,
    usage: function () {
      var total = usage();
      return { bytes: total, human: (total / 1048576).toFixed(2) + " MB" };
    },
    list: listCold,
    restore: restoreCold,
    preserveSnapshot: preserveSnapshot
  };

  function start() {
    schedule(2500);
    setInterval(function () {
      if (document.visibilityState !== "hidden") schedule(0);
    }, RESCAN_MS);
  }
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
})();

/* asset content-type refresh — v10.32.0 */
