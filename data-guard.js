/* Focus Hero — data guard (v10.4.0)
 *
 * Purpose: make a silent data wipe impossible to miss and trivial to undo.
 * Injected by the service worker; fully independent of app code. If anything
 * in here fails, it fails silent — it can never break the app.
 *
 * What it does:
 *  1. Keeps a 14-day ring buffer of full-state snapshots in IndexedDB
 *     ("fh-guard" DB) — a storage layer SEPARATE from localStorage, so a
 *     localStorage-level wipe cannot touch it.
 *  2. Mirrors the best snapshot to localStorage key focusHero.v4.state.guard
 *     so the standalone recovery page lists it too.
 *  3. On every boot: compares live state against the guard high-water mark.
 *     If the live state has collapsed (<10% of protected minutes), it shows a
 *     BLOCKING full-screen prompt with one-tap restore. Fail-closed: a wiped
 *     state can never quietly become the new normal.
 *  4. Snapshots are monotonic per day (never replaced by a smaller state) and
 *     the all-time high-water snapshot is never pruned.
 */
(function () {
  "use strict";
  var MAIN = "focusHero.v4.state";
  var MIRROR = "focusHero.v4.state.guard";
  var DISMISS_PREFIX = "focusHero.guard.dismiss.";
  var DB_NAME = "fh-guard", STORE = "snaps", DB_VER = 1;
  var SNAP_INTERVAL_MS = 10 * 60 * 1000;
  var KEEP_DAYS = 14;

  /* ---------- pure helpers (unit-tested) ---------- */
  function summarize(state) {
    var hist = (state && typeof state.history === "object" && state.history) ? state.history : {};
    var days = 0; for (var k in hist) { if (/^\d{4}-\d{2}-\d{2}$/.test(k)) days++; }
    return {
      minutes: (state && state.totalFocusMin) | 0,
      level: (state && state.hero && state.hero.level) | 0,
      sessions: (state && Array.isArray(state.sessionsLog)) ? state.sessionsLog.length : 0,
      histDays: days
    };
  }
  /* Anomaly: guard protects >=60 min AND live state is below 10% of it (min 10). */
  function isAnomaly(currentMin, guardMaxMin) {
    guardMaxMin = guardMaxMin | 0; currentMin = currentMin | 0;
    return guardMaxMin >= 60 && currentMin < Math.max(10, Math.round(guardMaxMin * 0.10));
  }
  /* Same-day snapshot may only be replaced by an equal-or-bigger state. */
  function sameDayReplaceOk(existingMin, newMin) { return (newMin | 0) >= (existingMin | 0); }
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
  function anomalyId(guardDate, guardMin) { return guardDate + ":" + (guardMin | 0); }
  function todayKey() { return new Date().toISOString().slice(0, 10); }

  /* ---------- IndexedDB (callback-wrapped, promise API) ---------- */
  function openDb() {
    return new Promise(function (res, rej) {
      try {
        var r = indexedDB.open(DB_NAME, DB_VER);
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

  /* ---------- snapshotting ---------- */
  var snapBusy = false;
  async function takeSnapshot(reason) {
    if (snapBusy) return; snapBusy = true;
    try {
      var state = readMainState(); if (!state) return;
      var sum = summarize(state); if (sum.minutes < 1) return;
      var db = await openDb();
      var all = await idbAll(db);
      var date = todayKey();
      var existing = null, maxMin = 0, dateToMin = {};
      for (var i = 0; i < all.length; i++) {
        dateToMin[all[i].date] = all[i].minutes | 0;
        if (all[i].date === date) existing = all[i];
        if ((all[i].minutes | 0) > maxMin) maxMin = all[i].minutes | 0;
      }
      if (existing && !sameDayReplaceOk(existing.minutes, sum.minutes)) { db.close(); return; }
      await idbPut(db, { date: date, savedAt: new Date().toISOString(), reason: String(reason || ""),
        minutes: sum.minutes, level: sum.level, sessions: sum.sessions, histDays: sum.histDays, state: state });
      dateToMin[date] = sum.minutes;
      var toDelete = pruneDates(dateToMin, KEEP_DAYS);
      for (var d = 0; d < toDelete.length; d++) { try { await idbDelete(db, toDelete[d]); } catch (_) {} }
      db.close();
      /* Mirror the best-known state for the standalone recovery page. */
      if (sum.minutes >= maxMin) {
        try { localStorage.setItem(MIRROR, JSON.stringify({ savedAt: new Date().toISOString(), state: state })); } catch (_) {}
      }
    } catch (_) { /* never break the app */ }
    finally { snapBusy = false; }
  }

  /* ---------- boot anomaly check + blocking prompt ---------- */
  function fmtH(m) { m = m | 0; var h = Math.floor(m / 60); return h > 0 ? (h + "h " + (m % 60) + "m") : (m + "m"); }

  function showOverlay(guard, currentMin) {
    try {
      if (document.getElementById("fh-guard-overlay")) return;
      var id = anomalyId(guard.date, guard.minutes);
      var o = document.createElement("div");
      o.id = "fh-guard-overlay";
      o.setAttribute("style", "position:fixed;inset:0;z-index:2147483000;background:rgba(5,7,18,.97);color:#e8eaf6;" +
        "font:16px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;padding:22px");
      o.innerHTML =
        '<div style="max-width:460px">' +
        '<div style="font-size:40px">⚠️</div>' +
        '<h2 style="margin:8px 0">Your data looks wiped</h2>' +
        '<p style="opacity:.85">This device holds a protected snapshot with <b>' + fmtH(guard.minutes) +
        '</b> of focus (level ' + guard.level + ", " + guard.histDays + " days, saved " + guard.date +
        "), but the app just loaded with only <b>" + fmtH(currentMin) + "</b>.</p>" +
        '<p style="opacity:.85">Nothing has been overwritten. Choose:</p>' +
        '<button id="fh-guard-restore" style="font:inherit;display:block;width:100%;margin:8px 0;padding:12px;border:0;border-radius:10px;background:#2456d9;color:#fff;font-weight:600">⟲ Restore my data (' + fmtH(guard.minutes) + ")</button>" +
        '<button id="fh-guard-recover" style="font:inherit;display:block;width:100%;margin:8px 0;padding:12px;border:0;border-radius:10px;background:#2a2f55;color:#fff">Open recovery page (all snapshots)</button>' +
        '<button id="fh-guard-dismiss" style="font:inherit;display:block;width:100%;margin:8px 0;padding:10px;border:0;border-radius:10px;background:transparent;color:#8a93b3">I reset on purpose — dismiss</button>' +
        "</div>";
      (document.body || document.documentElement).appendChild(o);
      document.getElementById("fh-guard-restore").onclick = function () {
        try {
          var cur = null; try { cur = localStorage.getItem(MAIN); } catch (_) {}
          if (cur != null) { try { localStorage.setItem(MAIN + ".pre-guard-restore-" + Date.now(), cur); } catch (_) {} }
          localStorage.setItem(MAIN, JSON.stringify(guard.state));
          var check = JSON.parse(localStorage.getItem(MAIN));
          if (((check && check.totalFocusMin) | 0) !== (guard.minutes | 0)) throw new Error("verify failed");
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
      var currentMin = state ? (summarize(state).minutes | 0) : 0;
      var db = await openDb();
      var all = await idbAll(db); db.close();
      if (!all.length) return;
      var best = all[0];
      for (var i = 1; i < all.length; i++) { if ((all[i].minutes | 0) > (best.minutes | 0)) best = all[i]; }
      if (!isAnomaly(currentMin, best.minutes)) return;
      var id = anomalyId(best.date, best.minutes);
      try { if (localStorage.getItem(DISMISS_PREFIX + id)) return; } catch (_) {}
      showOverlay(best, currentMin);
    } catch (_) {}
  }

  /* ---------- wiring ---------- */
  try {
    setTimeout(function () { bootCheck(); }, 2500);
    setTimeout(function () { takeSnapshot("boot"); }, 6000);
    setInterval(function () { takeSnapshot("interval"); }, SNAP_INTERVAL_MS);
    document.addEventListener("visibilitychange", function () { if (document.hidden) takeSnapshot("hide"); });
    window.addEventListener("pagehide", function () { takeSnapshot("pagehide"); });
    window.__fhGuardTest = { summarize: summarize, isAnomaly: isAnomaly, sameDayReplaceOk: sameDayReplaceOk,
      pruneDates: pruneDates, anomalyId: anomalyId };
  } catch (_) {}
})();
