/* Focus Hero — data guard (v10.7.0)
 *
 * Purpose: make a silent data wipe impossible to miss and trivial to undo.
 * Loaded directly by the app with service-worker injection as a fallback; it
 * remains independent of app code. If anything here fails, it fails silent —
 * it can never break the app.
 *
 * What it does:
 *  1. Keeps a 14-day ring buffer of full-state snapshots in IndexedDB
 *     ("fh-guard" DB) — a storage layer SEPARATE from localStorage, so a
 *     localStorage-level wipe cannot touch it.
 *  2. Mirrors the best snapshot to localStorage key focusHero.v4.state.guard
 *     so the standalone recovery page lists it too.
 *  3. On every boot: compares live state against the guard high-water mark.
 *     If focus minutes collapse or append-only structural data regresses, it
 *     shows a BLOCKING full-screen prompt with one-tap restore. Fail-closed: an
 *     unsafe state can never quietly replace protected snapshots.
 *  4. Snapshots are monotonic per day (never replaced by a smaller state) and
 *     the all-time high-water snapshot is never pruned.
 */
(function () {
  "use strict";
  /* The app loads this file directly and the service worker remains a fallback.
     Keep the guard at the very top so both paths cannot install
     duplicate timers, listeners, snapshots, or recovery prompts. */
  var INSTALL_FLAG = "__fhDataGuardInstalled";
  try {
    if (window[INSTALL_FLAG]) return;
    Object.defineProperty(window, INSTALL_FLAG, { value: true, enumerable: false, configurable: false });
  } catch (_) {
    try { if (window[INSTALL_FLAG]) return; window[INSTALL_FLAG] = true; } catch (__) { return; }
  }

  var MAIN = "focusHero.v4.state";
  var MIRROR = "focusHero.v4.state.guard";
  var DISMISS_PREFIX = "focusHero.guard.dismiss.";
  var DB_NAME = "fh-guard", STORE = "snaps";
  var SNAP_INTERVAL_MS = 10 * 60 * 1000;
  var KEEP_DAYS = 14;

  /* ---------- pure helpers (unit-tested) ---------- */
  function plainObject(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
  function count(value) {
    var n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.min(Number.MAX_SAFE_INTEGER, Math.floor(n)) : 0;
  }
  function stableSignature(parts) {
    var text = (parts || []).join("|");
    var hash = 2166136261;
    for (var i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    return (hash >>> 0).toString(36);
  }
  function focusEconomySummary(raw) {
    var present = plainObject(raw);
    var e = present ? raw : {};
    var grantsValid = plainObject(e.grants);
    var spendsValid = Array.isArray(e.spends);
    var harvestsValid = Array.isArray(e.harvests);
    var plotsValid = Array.isArray(e.plots);
    var grants = grantsValid ? Object.keys(e.grants).length : 0;
    var spends = spendsValid ? e.spends.length : 0;
    var harvests = harvestsValid ? e.harvests.length : 0;
    var seen = Object.create(null), duplicates = Object.create(null), invalidIds = 0;
    var grantIds = [], grantUpdatedAt = Object.create(null), plotUpdatedAt = Object.create(null);
    function addId(item) {
      var id = item && typeof item.id === "string" ? item.id.trim() : "";
      if (!id) { invalidIds++; return; }
      if (seen[id]) duplicates[id] = true;
      else seen[id] = true;
    }
    if (grantsValid) Object.keys(e.grants).sort().forEach(function (key) {
      var item = e.grants[key];
      grantIds.push(key);
      grantUpdatedAt[key] = count(item && (item.updatedAt || item.at));
      addId(item);
    });
    if (spendsValid) e.spends.forEach(addId);
    if (harvestsValid) e.harvests.forEach(addId);
    if (plotsValid) e.plots.forEach(function (plot) {
      var id = plot && typeof plot.id === "string" ? plot.id.trim() : "";
      if (id) plotUpdatedAt[id] = count(plot.updatedAt);
    });
    var unlocked = Number(e.unlockedPlots);
    var unlockedValid = Number.isFinite(unlocked) && Math.floor(unlocked) === unlocked && unlocked >= 2 && unlocked <= 3;
    return {
      focusEconomyPresent: present,
      focusEconomyValid: present && grantsValid && spendsValid && harvestsValid && plotsValid && unlockedValid,
      economyGrants: grants,
      economySpends: spends,
      economyHarvests: harvests,
      economyEvents: grants + spends + harvests,
      economyPlots: plotsValid ? e.plots.length : 0,
      unlockedPlots: unlockedValid ? unlocked : 0,
      duplicateEventIds: Object.keys(duplicates).length,
      invalidEventIds: invalidIds,
      economyGrantIds: grantIds,
      economyGrantUpdatedAt: grantUpdatedAt,
      economyPlotUpdatedAt: plotUpdatedAt,
      economyRevision: stableSignature(grantIds.map(function (id) { return id + "@" + grantUpdatedAt[id]; })
        .concat(Object.keys(plotUpdatedAt).sort().map(function (id) { return id + "@" + plotUpdatedAt[id]; })))
    };
  }
  function summarize(state) {
    state = plainObject(state) ? state : {};
    var historyValid = plainObject(state.history);
    var hist = historyValid ? state.history : {};
    var days = Object.keys(hist).filter(function (k) { return /^\d{4}-\d{2}-\d{2}$/.test(k); }).length;
    var economy = focusEconomySummary(state.focusEconomy);
    return {
      minutes: count(state.totalFocusMin),
      level: count(state.hero && state.hero.level),
      sessions: Array.isArray(state.sessionsLog) ? state.sessionsLog.length : 0,
      histDays: days,
      tasks: Array.isArray(state.tasks) ? state.tasks.length : 0,
      historyValid: historyValid,
      sessionsLogValid: Array.isArray(state.sessionsLog),
      tasksValid: Array.isArray(state.tasks),
      focusEconomyPresent: economy.focusEconomyPresent,
      focusEconomyValid: economy.focusEconomyValid,
      economyGrants: economy.economyGrants,
      economySpends: economy.economySpends,
      economyHarvests: economy.economyHarvests,
      economyEvents: economy.economyEvents,
      economyPlots: economy.economyPlots,
      unlockedPlots: economy.unlockedPlots,
      duplicateEventIds: economy.duplicateEventIds,
      invalidEventIds: economy.invalidEventIds,
      economyGrantIds: economy.economyGrantIds,
      economyGrantUpdatedAt: economy.economyGrantUpdatedAt,
      economyPlotUpdatedAt: economy.economyPlotUpdatedAt,
      economyRevision: economy.economyRevision
    };
  }
  /* Structural checks intentionally use only invariants the app treats as
     append-only/monotonic. Editable history/task/session counts are never
     compared by themselves. For equal-minute states, a missing populated
     container (or two independently vanished containers) is strong evidence
     of partial subtree rollback rather than a normal edit. */
  function anomalyReasons(current, guard) {
    if (typeof current === "number" || typeof guard === "number") {
      var currentMin = count(current), guardMin = count(guard);
      return guardMin >= 60 && currentMin < Math.max(10, Math.round(guardMin * 0.10)) ? ["focus-minutes-collapse"] : [];
    }
    current = current || summarize(null); guard = guard || summarize(null);
    var reasons = [];
    if (guard.minutes >= 60 && current.minutes < Math.max(10, Math.round(guard.minutes * 0.10))) {
      reasons.push("focus-minutes-collapse");
    }
    if (guard.focusEconomyPresent && guard.focusEconomyValid) {
      if (!current.focusEconomyPresent || !current.focusEconomyValid) {
        if (guard.economyEvents > 0 || guard.unlockedPlots > 2) reasons.push("focus-economy-subtree-loss");
      } else {
        if (current.economyGrants < guard.economyGrants) reasons.push("focus-economy-grants-rollback");
        if (current.economySpends < guard.economySpends) reasons.push("focus-economy-spends-rollback");
        if (current.economyHarvests < guard.economyHarvests) reasons.push("focus-economy-harvests-rollback");
        if (current.unlockedPlots < guard.unlockedPlots) reasons.push("focus-economy-unlocked-plots-rollback");
        if (current.duplicateEventIds > guard.duplicateEventIds) reasons.push("focus-economy-duplicate-event-ids");
        var currentGrantIds = Object.create(null);
        (current.economyGrantIds || []).forEach(function (id) { currentGrantIds[id] = true; });
        var protectedGrantIds = guard.economyGrantIds || [];
        if (protectedGrantIds.some(function (id) { return !currentGrantIds[id]; })) {
          reasons.push("focus-economy-grant-id-loss");
        } else if (protectedGrantIds.some(function (id) {
          return count(current.economyGrantUpdatedAt && current.economyGrantUpdatedAt[id]) <
            count(guard.economyGrantUpdatedAt && guard.economyGrantUpdatedAt[id]);
        })) {
          reasons.push("focus-economy-grant-rollback");
        }
        var guardPlots = guard.economyPlotUpdatedAt || {}, currentPlots = current.economyPlotUpdatedAt || {};
        if (Object.keys(guardPlots).some(function (id) {
          return !Object.prototype.hasOwnProperty.call(currentPlots, id) || count(currentPlots[id]) < count(guardPlots[id]);
        })) reasons.push("focus-economy-plot-rollback");
      }
    }
    if (current.minutes === guard.minutes && guard.minutes > 0) {
      if (guard.historyValid && guard.histDays > 0 && !current.historyValid) reasons.push("history-subtree-loss");
      if (guard.sessionsLogValid && guard.sessions > 0 && !current.sessionsLogValid) reasons.push("sessions-subtree-loss");
      if (guard.tasksValid && guard.tasks > 0 && !current.tasksValid) reasons.push("tasks-subtree-loss");
      var vanished = 0;
      if (guard.histDays >= 2 && current.histDays === 0) vanished++;
      if (guard.sessions >= 2 && current.sessions === 0) vanished++;
      if (guard.tasks >= 1 && current.tasks === 0) vanished++;
      if (vanished >= 2) reasons.push("same-total-multiple-subtrees-vanished");
    }
    return reasons;
  }
  function isAnomaly(current, guard) { return anomalyReasons(current, guard).length > 0; }
  /* Same-day snapshot may only be replaced by an equal-or-bigger state. */
  function sameDayReplaceOk(existing, next) {
    if (typeof existing === "number" || typeof next === "number") return count(next) >= count(existing);
    return !!existing && !!next && next.minutes >= existing.minutes && !isAnomaly(next, existing);
  }
  /* Keep newest KEEP_DAYS dates plus the all-time high-water date. */
  function pruneDates(dateToMinutes, keepDays) {
    var dates = Object.keys(dateToMinutes).sort();       // ascending
    var hw = null, hwMin = -1;
    for (var i = 0; i < dates.length; i++) {
      var m = dateToMinutes[dates[i]] | 0;
      if (m >= hwMin) { hwMin = m; hw = dates[i]; }      // latest max wins ties
    }
    var keep = {}; var recent = dates.slice(-keepDays);
    for (var j = 0; j < recent.length; j++) keep[recent[j]] = true;
    if (hw) keep[hw] = true;
    return dates.filter(function (d) { return !keep[d]; }); // dates to DELETE
  }
  function anomalyId(guardDate, guard) {
    if (typeof guard === "number") return guardDate + ":" + count(guard);
    guard = guard || {};
    return [guardDate, count(guard.minutes), count(guard.economyGrants), count(guard.economySpends),
      count(guard.economyHarvests), count(guard.unlockedPlots), count(guard.duplicateEventIds),
      String(guard.economyRevision || "0")].join(":");
  }
  function todayKey() { return new Date().toISOString().slice(0, 10); }

  /* ---------- IndexedDB (callback-wrapped, promise API) ---------- */
  function openDb() {
    return new Promise(function (res, rej) {
      try {
        /* Omit a fixed version so a future schema bump remains readable. A new
           database still starts at version 1 and creates the current store. */
        var r = indexedDB.open(DB_NAME);
        r.onupgradeneeded = function () {
          var db = r.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "date" });
        };
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { rej(r.error); };
      } catch (e) { rej(e); }
    });
  }
  function idbAll(db) {
    return new Promise(function (res, rej) {
      var out = [];
      var tx = db.transaction(STORE, "readonly");
      var cur = tx.objectStore(STORE).openCursor();
      cur.onsuccess = function () {
        var c = cur.result;
        if (c) { out.push(c.value); c.continue(); } else res(out);
      };
      cur.onerror = function () { rej(cur.error); };
    });
  }
  function idbPut(db, val) {
    return new Promise(function (res, rej) {
      var tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(val);
      tx.oncomplete = function () { res(); };
      tx.onerror = function () { rej(tx.error); };
    });
  }
  function idbDelete(db, key) {
    return new Promise(function (res, rej) {
      var tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = function () { res(); };
      tx.onerror = function () { rej(tx.error); };
    });
  }

  function readMainState() {
    try {
      var raw = localStorage.getItem(MAIN);
      if (!raw) return null;
      var p = JSON.parse(raw);
      return (p && typeof p === "object" && !Array.isArray(p)) ? p : null;
    } catch (e) { return null; }
  }

  function readMirrorSnapshot() {
    try {
      var raw = localStorage.getItem(MIRROR);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!plainObject(parsed) || !plainObject(parsed.state)) return null;
      return {
        date: String(parsed.savedAt || "").slice(0, 10) || "mirror",
        savedAt: parsed.savedAt || null,
        reason: "localStorage mirror",
        state: parsed.state
      };
    } catch (_) { return null; }
  }
  function summaryForSnapshot(snapshot) {
    return summarize(snapshot && snapshot.state);
  }
  function compactSummary(sum) {
    return {
      minutes: sum.minutes, level: sum.level, sessions: sum.sessions, histDays: sum.histDays, tasks: sum.tasks,
      economyGrants: sum.economyGrants, economySpends: sum.economySpends,
      economyHarvests: sum.economyHarvests, economyEvents: sum.economyEvents,
      economyPlots: sum.economyPlots, unlockedPlots: sum.unlockedPlots,
      duplicateEventIds: sum.duplicateEventIds, invalidEventIds: sum.invalidEventIds
    };
  }
  function betterProtectedSnapshot(left, right) {
    if (!left) return right;
    if (!right) return left;
    var a = left._guardSummary || summaryForSnapshot(left);
    var b = right._guardSummary || summaryForSnapshot(right);
    var keys = ["minutes", "economyEvents", "unlockedPlots", "sessions", "histDays", "tasks"];
    for (var i = 0; i < keys.length; i++) {
      if (a[keys[i]] !== b[keys[i]]) return a[keys[i]] > b[keys[i]] ? left : right;
    }
    return String(left.savedAt || left.date || "") >= String(right.savedAt || right.date || "") ? left : right;
  }
  function findAnomalousGuard(snapshots, currentSummary) {
    var best = null;
    for (var i = 0; i < snapshots.length; i++) {
      var snapshot = snapshots[i];
      if (!snapshot || !plainObject(snapshot.state)) continue;
      var protectedSummary = summaryForSnapshot(snapshot);
      var reasons = anomalyReasons(currentSummary, protectedSummary);
      if (!reasons.length) continue;
      snapshot._guardSummary = protectedSummary;
      snapshot._guardReasons = reasons;
      best = betterProtectedSnapshot(best, snapshot);
    }
    return best;
  }
  function uniqueBackupKey(storage, prefix) {
    var base = prefix + new Date().toISOString().replace(/[:.]/g, "-");
    var key = base, suffix = 0;
    while (storage.getItem(key) !== null) { suffix++; key = base + "-" + suffix; }
    return key;
  }
  function stageRecoveryState(state, previousRaw) {
    var staged = JSON.parse(JSON.stringify(state));
    var previousState = null;
    try {
      previousState = previousRaw == null ? null : JSON.parse(previousRaw);
      if (plainObject(previousState) && plainObject(previousState.state)) previousState = previousState.state;
    } catch (_) { previousState = null; }
    var syncSource = plainObject(previousState && previousState.sync) ? previousState.sync :
      (plainObject(staged.sync) ? staged.sync : null);
    if (syncSource) {
      staged.sync = JSON.parse(JSON.stringify(syncSource));
      staged.sync.enabled = false;
      staged.sync.pendingSync = false;
      staged.sync.pendingSince = 0;
      staged.sync.retryCount = 0;
      staged.sync.retryAfter = 0;
      staged.sync.lastSyncError = "Recovery staged locally; verify it before re-enabling cloud sync.";
    }
    return staged;
  }
  function verifiedRestore(storage, state, backupPrefix) {
    var hasStateMarker = plainObject(state && state.hero) || Array.isArray(state && state.tasks) ||
      (state && typeof state.dataVersion === "number" && Number.isFinite(state.dataVersion));
    if (!plainObject(state) || !Number.isSafeInteger(state.totalFocusMin) || state.totalFocusMin < 0 || !hasStateMarker) {
      throw new Error("Snapshot is not a valid Focus Hero state.");
    }
    var previous = storage.getItem(MAIN);
    var staged = stageRecoveryState(state, previous);
    var desired = JSON.stringify(staged);
    if (typeof desired !== "string") throw new Error("Snapshot could not be serialized.");
    var roundTrip = JSON.parse(desired);
    if (!plainObject(roundTrip) || JSON.stringify(roundTrip) !== desired) throw new Error("Snapshot serialization check failed.");
    var backupKey = null;
    if (previous !== null) {
      backupKey = uniqueBackupKey(storage, backupPrefix || (MAIN + ".pre-guard-restore-"));
      storage.setItem(backupKey, previous);
      if (storage.getItem(backupKey) !== previous) throw new Error("Pre-restore backup verification failed; live state was not changed.");
    }
    var mainMutated = false;
    try {
      mainMutated = true;
      storage.setItem(MAIN, desired);
      var readBack = storage.getItem(MAIN);
      if (readBack !== desired) throw new Error("Restored bytes did not match the selected snapshot.");
      var verified = JSON.parse(readBack);
      if (!plainObject(verified) || JSON.stringify(verified) !== desired) throw new Error("Restored state failed its full read-back check.");
      return { backupKey: backupKey, serialized: desired, syncPaused:!!(staged.sync && staged.sync.enabled === false) };
    } catch (error) {
      if (!mainMutated) throw error;
      var rollbackOk = false;
      try {
        if (previous === null) storage.removeItem(MAIN); else storage.setItem(MAIN, previous);
        rollbackOk = storage.getItem(MAIN) === previous;
      } catch (_) { rollbackOk = false; }
      if (!rollbackOk) {
        throw new Error("CRITICAL: restore verification failed and automatic rollback could not be verified. The pre-restore backup remains at " + (backupKey || "no backup key") + ".");
      }
      throw new Error("Restore verification failed; the prior live state was restored and verified. " + (error && error.message ? error.message : error));
    }
  }

  /* ---------- snapshotting ---------- */
  var snapBusy = false;
  async function takeSnapshot(reason) {
    if (snapBusy) return; snapBusy = true;
    try {
      var state = readMainState(); if (!state) return;
      var sum = summarize(state); if (sum.minutes < 1) return;
      var db = await openDb();
      var all = await idbAll(db);
      var mirror = readMirrorSnapshot();
      var protectedSnapshots = mirror ? all.concat([mirror]) : all.slice();
      var unsafeGuard = findAnomalousGuard(protectedSnapshots, sum);
      if (unsafeGuard) {
        db.close();
        showOverlay(unsafeGuard, sum, unsafeGuard._guardReasons || []);
        return;
      }
      var date = todayKey();
      var existing = null, maxMin = mirror ? summaryForSnapshot(mirror).minutes : 0, dateToMin = {};
      for (var i = 0; i < all.length; i++) {
        var protectedSum = summaryForSnapshot(all[i]);
        dateToMin[all[i].date] = protectedSum.minutes;
        if (all[i].date === date) existing = all[i];
        if (protectedSum.minutes > maxMin) maxMin = protectedSum.minutes;
      }
      if (existing && !sameDayReplaceOk(summaryForSnapshot(existing), sum)) { db.close(); return; }
      var savedAt = new Date().toISOString();
      await idbPut(db, { date: date, savedAt: savedAt, reason: String(reason || ""),
        minutes: sum.minutes, level: sum.level, sessions: sum.sessions, histDays: sum.histDays,
        summary: compactSummary(sum), state: state });
      dateToMin[date] = sum.minutes;
      var toDelete = pruneDates(dateToMin, KEEP_DAYS);
      for (var d = 0; d < toDelete.length; d++) { try { await idbDelete(db, toDelete[d]); } catch (_) {} }
      db.close();
      /* Mirror the best-known state for the standalone recovery page. */
      if (sum.minutes >= maxMin) {
        try { localStorage.setItem(MIRROR, JSON.stringify({ savedAt: savedAt, summary: compactSummary(sum), state: state })); } catch (_) {}
      }
    } catch (_) { /* never break the app */ }
    finally { snapBusy = false; }
  }

  /* ---------- boot anomaly check + blocking prompt ---------- */
  function fmtH(m) { m = count(m); var h = Math.floor(m / 60); return h > 0 ? (h + "h " + (m % 60) + "m") : (m + "m"); }
  function escHtml(value) {
    return String(value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function showOverlay(guard, currentSummary, reasons) {
    try {
      if (document.getElementById("fh-guard-overlay")) return;
      var protectedSummary = guard._guardSummary || summaryForSnapshot(guard);
      currentSummary = currentSummary && typeof currentSummary === "object" ? currentSummary : summarize({ totalFocusMin: currentSummary });
      reasons = Array.isArray(reasons) ? reasons : anomalyReasons(currentSummary, protectedSummary);
      var id = anomalyId(guard.date || String(guard.savedAt || "").slice(0, 10) || "snapshot", protectedSummary);
      try { if (localStorage.getItem(DISMISS_PREFIX + id)) return; } catch (_) {}
      var o = document.createElement("div");
      o.id = "fh-guard-overlay";
      o.setAttribute("style", "position:fixed;inset:0;z-index:2147483000;background:rgba(5,7,18,.97);color:#e8eaf6;" +
        "font:16px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;padding:22px");
      o.innerHTML =
        '<div style="max-width:460px">' +
        '<div style="font-size:40px">⚠️</div>' +
        '<h2 style="margin:8px 0">Your data looks wiped</h2>' +
        '<p style="opacity:.85">This device holds a protected snapshot with <b>' + fmtH(protectedSummary.minutes) +
        '</b> of focus (level ' + protectedSummary.level + ", " + protectedSummary.histDays + " days, saved " +
        escHtml(guard.savedAt || guard.date || "unknown") + "), while the live state has <b>" + fmtH(currentSummary.minutes) + "</b>.</p>" +
        '<p style="opacity:.85">The guard detected: <code>' + escHtml(reasons.join(", ") || "protected-data regression") +
        '</code>. The unsafe state has not replaced protected snapshots. Choose:</p>' +
        '<button id="fh-guard-restore" style="font:inherit;display:block;width:100%;margin:8px 0;padding:12px;border:0;border-radius:10px;background:#2456d9;color:#fff;font-weight:600">⟲ Restore my data (' + fmtH(protectedSummary.minutes) + ")</button>" +
        '<button id="fh-guard-recover" style="font:inherit;display:block;width:100%;margin:8px 0;padding:12px;border:0;border-radius:10px;background:#2a2f55;color:#fff">Open recovery page (all snapshots)</button>' +
        '<button id="fh-guard-dismiss" style="font:inherit;display:block;width:100%;margin:8px 0;padding:10px;border:0;border-radius:10px;background:transparent;color:#8a93b3">I reset on purpose — dismiss</button>' +
        "</div>";
      (document.body || document.documentElement).appendChild(o);
      document.getElementById("fh-guard-restore").onclick = function () {
        try {
          verifiedRestore(localStorage, guard.state, MAIN + ".pre-guard-restore-");
          location.reload();
        } catch (e) { alert("Restore failed: " + (e && e.message ? e.message : e) + " — use the recovery page instead."); }
      };
      document.getElementById("fh-guard-recover").onclick = function () { location.href = "./recover.html"; };
      document.getElementById("fh-guard-dismiss").onclick = function () {
        try { localStorage.setItem(DISMISS_PREFIX + id, new Date().toISOString()); } catch (_) {}
        o.remove();
      };
    } catch (_) {}
  }

  async function bootCheck() {
    try {
      var state = readMainState();
      var currentSummary = summarize(state);
      var db = await openDb();
      var all = await idbAll(db); db.close();
      var mirror = readMirrorSnapshot(); if (mirror) all.push(mirror);
      if (!all.length) return;
      var best = findAnomalousGuard(all, currentSummary); if (!best) return;
      var protectedSummary = best._guardSummary || summaryForSnapshot(best);
      var id = anomalyId(best.date || String(best.savedAt || "").slice(0, 10) || "snapshot", protectedSummary);
      try { if (localStorage.getItem(DISMISS_PREFIX + id)) return; } catch (_) {}
      showOverlay(best, currentSummary, best._guardReasons || []);
    } catch (_) {}
  }

  /* ---------- wiring ---------- */
  try {
    setTimeout(function () { bootCheck(); }, 2500);
    setTimeout(function () { takeSnapshot("boot"); }, 6000);
    setInterval(function () { takeSnapshot("interval"); }, SNAP_INTERVAL_MS);
    document.addEventListener("visibilitychange", function () { if (document.hidden) takeSnapshot("hide"); });
    window.addEventListener("pagehide", function () { takeSnapshot("pagehide"); });
    window.__fhGuardTest = { summarize: summarize, focusEconomySummary: focusEconomySummary,
      anomalyReasons: anomalyReasons, isAnomaly: isAnomaly, sameDayReplaceOk: sameDayReplaceOk,
      pruneDates: pruneDates, anomalyId: anomalyId, compactSummary: compactSummary,
      stageRecoveryState: stageRecoveryState, verifiedRestore: verifiedRestore,
      takeSnapshot: takeSnapshot, openDb: openDb, idbAll: idbAll };
  } catch (_) {}
})();
