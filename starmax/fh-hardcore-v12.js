/* ================================================================
 * Life XP — CONSISTENCY: STREAKS, DAYS SURVIVED, HARDCORE
 * (v12 hardened, 2026-08-17)
 *
 * Hardcore is deliberately additive and opt-in. Loading this file while
 * Hardcore is off does not add a state key, change either normal streak
 * field, wrap saveState(), or persist anything. Once a player explicitly
 * starts a run, calendar evaluation is automatic and idempotent: primary
 * ready, local midnight, focus, and visible-return hooks evaluate at most
 * once per new local day through the app's verified durable save boundary.
 * ================================================================ */
(function () {
  "use strict";

  if (window.FH_HARDCORE) return;

  var FIELD = "fh12Hardcore";
  var VERSION = 2;
  var MAX_RUN_DAYS = 20000;
  var MAX_CONCURRENT_RUNS = 5;
  var MAX_CATCH_UP_DAYS = MAX_RUN_DAYS;
  var AUTO_LOCK_NAME = "focus-hero:hardcore-calendar-v1";
  var automaticInFlight = null;
  var boundaryTimer = null;
  var lifecycleBound = false;

  var PRESETS = [
    { id: "session1", label: "1 session a day", type: "sessions", value: 1 },
    { id: "min60", label: "1 hour a day", type: "minutes", value: 60 },
    { id: "min120", label: "2 hours a day", type: "minutes", value: 120 },
    { id: "min240", label: "4 hours a day", type: "minutes", value: 240 },
    { id: "min480", label: "8 hours a day", type: "minutes", value: 480 }
  ];

  function S() {
    return window.state && typeof window.state === "object" ? window.state : null;
  }

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function finiteInt(value, fallback, min, max) {
    var n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    n = Math.floor(n);
    return Math.max(min, Math.min(max, n));
  }

  function cleanText(value, fallback, max) {
    var text = String(value == null ? (fallback || "") : value)
      .replace(/[\u0000-\u001f\u007f]/g, " ").trim();
    return text.slice(0, max || 120);
  }

  function exactStableRunId(value) {
    if (typeof value !== "string") return null;
    var normalized = cleanText(value, "", 80);
    return normalized && normalized === value ? value : null;
  }

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function validDay(value) {
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
    if (!match) return false;
    var year = Number(match[1]);
    var month = Number(match[2]);
    var day = Number(match[3]);
    var date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }

  function dayOrdinal(value) {
    if (!validDay(value)) return null;
    var parts = String(value).split("-");
    return Math.floor(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])) / 86400000);
  }

  function dayFromOrdinal(value) {
    var date = new Date(value * 86400000);
    return date.getUTCFullYear() + "-" + String(date.getUTCMonth() + 1).padStart(2, "0") +
      "-" + String(date.getUTCDate()).padStart(2, "0");
  }

  function dayKey(date) {
    var candidate = null;
    try {
      if (typeof window.todayKey === "function") candidate = window.todayKey(date);
    } catch (_) {}
    if (validDay(candidate)) return String(candidate);
    var value = date instanceof Date ? date : (date == null ? new Date() : new Date(date));
    if (!Number.isFinite(value.getTime())) return null;
    return value.getFullYear() + "-" + String(value.getMonth() + 1).padStart(2, "0") +
      "-" + String(value.getDate()).padStart(2, "0");
  }

  function presetById(id) {
    for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].id === id) return PRESETS[i];
    return null;
  }

  function requirementLabel(type, value) {
    if (type === "minutes") {
      if (value % 60 === 0) {
        var hours = value / 60;
        return hours + " hour" + (hours === 1 ? "" : "s") + " a day";
      }
      return value + " minutes a day";
    }
    return value + " session" + (value === 1 ? "" : "s") + " a day";
  }

  function normalizeRequirement(input) {
    var candidate = input;
    if (typeof input === "string") candidate = presetById(input);
    if (!candidate || typeof candidate !== "object") return null;
    var type = candidate.type === "minutes" ? "minutes" :
      (candidate.type === "sessions" ? "sessions" : null);
    if (!type) return null;
    var max = type === "minutes" ? 1440 : 100;
    var numeric = Number(candidate.value);
    if (!Number.isFinite(numeric) || numeric < 1 || numeric > max) return null;
    var value = Math.floor(numeric);
    if (value !== numeric) return null;
    var preset = presetById(cleanText(candidate.id, "", 40));
    var id = preset && preset.type === type && preset.value === value ? preset.id : "custom";
    return { id: id, label: requirementLabel(type, value), type: type, value: value };
  }

  function requirementLock(req) {
    return "fh12r1:" + req.type + ":" + req.value;
  }

  /* ================================================ PAUSE / RESUME (v10.35)

     "give me the option to pause the Hardcore run. When I resume it, it just
     depends on where I am in the time. If I unpause it while still in the same
     day, it just continues as it normally would; if it's the next day, that
     next day runs as it normally would unless I make another change/edit."

     So a pause suspends JUDGEMENT, nothing else:

       - Pause and resume inside the same date: nothing changes. That date is
         judged exactly as it would have been.
       - Resume on a later date: the date you resume on is judged normally,
         full requirement, from wherever you are in it. If that is tight, the
         late-start control is the thing that adjusts it - your edit, your call.
       - The dates the pause covers ARE still judged, and a day you did not
         meet is still recorded as a missed day - it is just not fatal. The
         run survives it. A paused day you DID meet still counts as survived,
         because you did the work.
       - Only ending the run ends the run.

     So a pause does not erase days or pretend they did not happen; it removes
     exactly one thing, the death penalty. The misses stay on the record.

     Stored as intervals rather than a flag so the history is reconstructable
     and two devices can merge without inventing a state neither was in. */
  function normalizePauses(raw) {
    if (!Array.isArray(raw)) return [];
    var out = [];
    for (var i = 0; i < raw.length && out.length < 200; i++) {
      var row = raw[i];
      if (!row || typeof row !== "object") continue;
      var from = finiteInt(row.from, 0, 0, Number.MAX_SAFE_INTEGER);
      if (!from) continue;
      var to = finiteInt(row.to, 0, 0, Number.MAX_SAFE_INTEGER);
      if (to && to < from) to = from;
      out.push(to ? { from: from, to: to } : { from: from, to: null });
    }
    out.sort(function (a, b) { return a.from - b.from; });
    return out;
  }
  function isPausedNow(run) {
    var list = (run && run.pauses) || [];
    return list.length > 0 && list[list.length - 1].to == null;
  }
  function pausedSince(run) {
    var list = (run && run.pauses) || [];
    var last = list[list.length - 1];
    return last && last.to == null ? last.from : 0;
  }
  /* Is this date covered by a pause? Covered means "a miss here does not end
     the run" - not "this date is ignored". */
  /* v10.39: YOU CAN PUT A RUN BACK.

     Until now a miss was final unless the record itself changed, and when the
     app got a day wrong there was no way to say so - you could only watch a
     real streak sit in the archive. This is the manual override: bring the run
     back and carry on from where it stopped.

     The day it died is recorded as EXCUSED, which is exactly the treatment a
     paused date already gets - the day is not counted as survived, it simply
     stops being fatal. Without that the audit would re-judge the same short
     day on the next pass and kill the run again a second later.

     Deliberately: excusing is per-date and per-run, the days survived are not
     inflated, and a run you ended yourself is revived too if you ask - it is
     your call, not the app's. It is recorded on the run so it is honest about
     having been revived. */
  function excusedDays(run) {
    var list = (run && run.excusedDays) || [];
    return Array.isArray(list) ? list : [];
  }
  function dateIsExcused(run, day) {
    var list = excusedDays(run);
    for (var i = 0; i < list.length; i++) if (list[i] === day) return true;
    return false;
  }
  function withExcusedDay(run, day) {
    var copy = clone(run);
    var list = excusedDays(copy).slice();
    if (validDay(day) && list.indexOf(day) === -1) list.push(day);
    /* Bounded: a run cannot accumulate unlimited excuses. */
    if (list.length > 400) list = list.slice(list.length - 400);
    copy.excusedDays = list;
    return copy;
  }

  function dateIsPaused(run, day, todayD) {
    var list = (run && run.pauses) || [];
    if (!list.length) return false;
    for (var i = 0; i < list.length; i++) {
      var pauseDay = dayKey(new Date(list[i].from));
      if (!pauseDay) continue;
      if (list[i].to == null) {
        /* still paused - nothing from the pause date onward is judged */
        if (day >= pauseDay) return true;
        continue;
      }
      var resumeDay = dayKey(new Date(list[i].to));
      if (!resumeDay) continue;
      /* paused and resumed the same date: that date is judged as normal */
      if (resumeDay === pauseDay) continue;
      if (day >= pauseDay && day < resumeDay) return true;
    }
    return false;
  }

  function normalizeExcusedDays(raw) {
    if (!Array.isArray(raw)) return [];
    var out = [];
    for (var i = 0; i < raw.length && out.length < 400; i++) {
      if (validDay(raw[i]) && out.indexOf(String(raw[i])) === -1) out.push(String(raw[i]));
    }
    out.sort();
    return out;
  }

  function normalizeRun(raw, archived) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    var req = normalizeRequirement(raw.requirement);
    var startDay = validDay(raw.startDay) ? String(raw.startDay) : null;
    if (!req || !startDay) return null;
    var expectedLock = requirementLock(req);
    var suppliedLock = cleanText(raw.requirementLock, "", 80);
    if (suppliedLock && suppliedLock !== expectedLock) return null;
    var run = {
      id: cleanText(raw.id, "hcr_legacy_" + startDay.replace(/-/g, ""), 80),
      startedAt: finiteInt(raw.startedAt, 0, 0, Number.MAX_SAFE_INTEGER),
      startDay: startDay,
      requirement: req,
      requirementLock: expectedLock,
      daysSurvived: finiteInt(raw.daysSurvived, 0, 0, MAX_RUN_DAYS),
      lastCheckedDay: validDay(raw.lastCheckedDay) ? String(raw.lastCheckedDay) : null,
      lastCheckedAt: finiteInt(raw.lastCheckedAt, 0, 0, Number.MAX_SAFE_INTEGER),
      pauses: normalizePauses(raw.pauses),
      /* Same trap the reinstatedAt note below describes: a field the
         normalizer does not know about is silently dropped on the next save,
         so an excused day would last exactly until the run was persisted and
         the run would die again on the same date. */
      excusedDays: normalizeExcusedDays(raw.excusedDays),
      revivedAt: finiteInt(raw.revivedAt, 0, 0, Number.MAX_SAFE_INTEGER),
      revivedCount: finiteInt(raw.revivedCount, 0, 0, 10000)
    };
    if (!archived) {
      /* v10.14.2: when a run is put back after its recorded miss was
         contradicted by merged history, the moment of that decision is part
         of the run's identity. Without it the normalizer strips the field and
         the merge cannot tell a reinstatement from a stale active copy. */
      run.reinstatedAt = finiteInt(raw.reinstatedAt, 0, 0, Number.MAX_SAFE_INTEGER);
    }
    if (archived) {
      run.endedAt = finiteInt(raw.endedAt, 0, 0, Number.MAX_SAFE_INTEGER);
      run.endReason = cleanText(raw.endReason, "ended", 120);
      run.missedDay = validDay(raw.missedDay) ? String(raw.missedDay) : null;
    }
    return run;
  }

  /* ------------------------------------------------------------------
     CONCURRENT RUNS

     Hardcore held exactly one run: `active` plus a single `run`. Every rule
     in this file - audit, archive, reinstate, merge - was written against
     that one run, and those rules are the part you least want rewritten,
     because they are what stops a streak being invented or a finished run
     being resurrected.

     So the runs became a list and the rules did not change. Each run is
     projected into the single-run shape the existing engine already knows,
     evaluated by that same engine, and folded back. A run carries its own
     requirement, its own start day and its own day count; runs succeed and
     fail independently, and a day's work counts toward every run whose bar
     it genuinely clears.

     `active`/`run` are still written, mirroring the first run, so a device
     still on an older build reads a valid profile instead of a broken one.
     ------------------------------------------------------------------ */
  function runsOf(data) {
    if (data && Array.isArray(data.runs)) return data.runs;
    return (data && data.active === true && data.run) ? [data.run] : [];
  }

  function withRuns(data, runs) {
    var out = data ? clone(data) : {};
    var list = (runs || []).slice(0, MAX_CONCURRENT_RUNS);
    out.version = VERSION;
    out.runs = list;
    out.history = (data && data.history) ? data.history : [];
    /* Legacy mirror - see the note above. */
    out.active = list.length > 0;
    out.run = list.length ? clone(list[0]) : null;
    return out;
  }

  /* One run, wearing the single-run shape the original engine expects. */
  function soloView(data, run) {
    return { version: VERSION, active: !!run, run: run ? clone(run) : null,
             history: clone(data && data.history ? data.history : []) };
  }

  function emptyHardcore() {
    return { version: VERSION, runs: [], history: [], active: false, run: null };
  }

  /* Pure read/migration preview. It never installs or rewrites FIELD. */
  function readHardcore() {
    var state = S();
    if (!state || !Object.prototype.hasOwnProperty.call(state, FIELD)) {
      return { ok: true, exists: false, needsMigration: false, data: emptyHardcore() };
    }
    var raw = state[FIELD];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return { ok: false, exists: true, reason: "Hardcore data has an invalid container." };
    }
    var history = [];
    if (raw.history != null && !Array.isArray(raw.history)) {
      return { ok: false, exists: true, reason: "Hardcore history has an invalid shape." };
    }
    for (var i = 0; i < (raw.history || []).length; i++) {
      var row = normalizeRun(raw.history[i], true);
      if (!row) return { ok: false, exists: true, reason: "A Hardcore history record is invalid." };
      history.push(row);
    }
    /* Either shape is readable: the list, or the older single run. */
    var rawRuns;
    if (Array.isArray(raw.runs)) {
      rawRuns = raw.runs;
    } else {
      var legacyActive = raw.active === true;
      var legacyRun = raw.run == null ? null : normalizeRun(raw.run, false);
      if ((legacyActive && !legacyRun) || (!legacyActive && raw.run != null)) {
        return { ok: false, exists: true, reason: "Hardcore active-run data is inconsistent." };
      }
      rawRuns = legacyActive ? [raw.run] : [];
    }
    if (rawRuns.length > MAX_CONCURRENT_RUNS) {
      return { ok: false, exists: true, reason: "Hardcore has more concurrent runs than this build allows." };
    }
    var runs = [];
    var seenId = Object.create(null);
    var endedId = Object.create(null);
    history.forEach(function (row) { endedId[row.id] = true; });
    for (var r = 0; r < rawRuns.length; r++) {
      var one = normalizeRun(rawRuns[r], false);
      if (!one) return { ok: false, exists: true, reason: "A Hardcore run is invalid." };
      if (seenId[one.id]) return { ok: false, exists: true, reason: "Hardcore has two runs sharing one id." };
      if (endedId[one.id]) return { ok: false, exists: true, reason: "A Hardcore run is recorded as both running and ended." };
      seenId[one.id] = true;
      runs.push(one);
    }
    var data = withRuns({ history: history }, runs);
    var canonical = null;
    try { canonical = JSON.stringify(data); } catch (_) {}
    var original = null;
    try { original = JSON.stringify(raw); } catch (_) {}
    return { ok: true, exists: true, needsMigration: canonical !== original, data: data };
  }

  function hardcoreMergeError(code, message) {
    var error = new Error(message);
    error.code = code;
    return error;
  }

  function assertStableRunIdentity(left, right, code) {
    if (!left || !right || left.id !== right.id || left.startDay !== right.startDay ||
        left.requirementLock !== right.requirementLock || left.startedAt !== right.startedAt) {
      throw hardcoreMergeError(code, "Hardcore merge conflict: one run id has divergent locked identity.");
    }
  }

  function archiveAnnotationKey(run) {
    /* End annotations are a separate immutable dimension from progress.
       Keeping the comparison independent of days/check metadata makes this
       join associative when another device later contributes more progress. */
    return JSON.stringify([
      validDay(run && run.missedDay) ? String(run.missedDay) : "",
      cleanText(run && run.endReason, "ended", 120)
    ]);
  }

  function archiveWinner(left, right) {
    assertStableRunIdentity(left, right, "FH_HARDCORE_HISTORY_CONFLICT");
    var annotation = left.endedAt !== right.endedAt
      ? (left.endedAt > right.endedAt ? left : right)
      : (archiveAnnotationKey(left) >= archiveAnnotationKey(right) ? left : right);
    var merged = clone(annotation);
    var leftDay = dayOrdinal(left.lastCheckedDay);
    var rightDay = dayOrdinal(right.lastCheckedDay);

    /* A later end annotation may explain the outcome, but it must never
       erase verified progress already present on another device. Each
       progress field is therefore a monotonic maximum, while the end
       annotation above uses a stable total-order tie-break. */
    merged.daysSurvived = Math.max(left.daysSurvived, right.daysSurvived);
    merged.lastCheckedAt = Math.max(left.lastCheckedAt, right.lastCheckedAt);
    merged.lastCheckedDay = (leftDay == null ? -1 : leftDay) >= (rightDay == null ? -1 : rightDay)
      ? left.lastCheckedDay : right.lastCheckedDay;
    return merged;
  }

  function sortHistory(rows) {
    var byId = Object.create(null);
    (rows || []).forEach(function (row) {
      if (!byId[row.id]) byId[row.id] = row;
      else byId[row.id] = archiveWinner(byId[row.id], row);
    });
    return Object.keys(byId).map(function (id) { return byId[id]; }).sort(function (a, b) {
      if (a.endedAt !== b.endedAt) return b.endedAt - a.endedAt;
      if (a.lastCheckedAt !== b.lastCheckedAt) return b.lastCheckedAt - a.lastCheckedAt;
      if (a.startedAt !== b.startedAt) return b.startedAt - a.startedAt;
      return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
    }).map(clone);
  }

  /* Pure normalization used only by the merge policy. Missing is distinct
     from malformed: undefined means that device never had Hardcore, while a
     present invalid value fails closed instead of being treated as Off. */
  function normalizeHardcoreForMerge(raw) {
    if (raw === undefined) return undefined;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw hardcoreMergeError("FH_HARDCORE_INVALID_STATE", "Hardcore merge refused invalid state.");
    }
    if (raw.history != null && !Array.isArray(raw.history)) {
      throw hardcoreMergeError("FH_HARDCORE_INVALID_STATE", "Hardcore merge refused invalid history.");
    }
    var history = [];
    for (var i = 0; i < (raw.history || []).length; i++) {
      var originalRow = raw.history[i];
      if (!originalRow || !exactStableRunId(originalRow.id)) {
        throw hardcoreMergeError("FH_HARDCORE_INVALID_STATE", "Hardcore merge requires stable history run ids.");
      }
      var row = normalizeRun(originalRow, true);
      if (!row) throw hardcoreMergeError("FH_HARDCORE_INVALID_STATE", "Hardcore merge refused an invalid history run.");
      history.push(row);
    }
    history = sortHistory(history);
    if (raw.active !== true && raw.active !== false && raw.active !== undefined) {
      throw hardcoreMergeError("FH_HARDCORE_INVALID_STATE", "Hardcore merge refused an invalid active flag.");
    }
    var rawRuns;
    if (Array.isArray(raw.runs)) {
      rawRuns = raw.runs;
    } else if (raw.active === true) {
      rawRuns = [raw.run];
    } else {
      if (raw.run != null) {
        throw hardcoreMergeError("FH_HARDCORE_INVALID_STATE", "Hardcore merge refused inconsistent active-run data.");
      }
      rawRuns = [];
    }
    var runs = [];
    var rawById = Object.create(null);
    var seen = Object.create(null);
    for (var r = 0; r < rawRuns.length; r++) {
      var rawOne = rawRuns[r];
      if (!rawOne || !exactStableRunId(rawOne.id)) {
        throw hardcoreMergeError("FH_HARDCORE_INVALID_STATE", "Hardcore merge requires a stable run id.");
      }
      var one = normalizeRun(rawOne, false);
      if (!one) throw hardcoreMergeError("FH_HARDCORE_INVALID_STATE", "Hardcore merge refused an invalid run.");
      if (seen[one.id]) {
        throw hardcoreMergeError("FH_HARDCORE_INVALID_STATE", "Hardcore merge refused two runs sharing one id.");
      }
      seen[one.id] = true;
      var archivedSameRun = history.find(function (row) { return row.id === one.id; });
      if (archivedSameRun) {
        assertStableRunIdentity(one, archivedSameRun, "FH_HARDCORE_ACTIVE_RUN_CONFLICT");
      }
      runs.push(one);
      rawById[one.id] = rawOne;
    }
    return {
      value: { version: VERSION, runs: runs, history: history },
      rawById: rawById
    };
  }

  function verifiedRunDays(raw, normalized) {
    if (!raw || !normalized || raw.requirementLock !== normalized.requirementLock) return 0;
    if (!validDay(raw.lastCheckedDay) || !(Number(raw.lastCheckedAt) > 0)) return 0;
    var start = dayOrdinal(normalized.startDay);
    var checked = dayOrdinal(raw.lastCheckedDay);
    if (start == null || checked == null || checked < start) return 0;
    var calendarMaximum = Math.min(MAX_RUN_DAYS, checked - start + 1);
    return Math.min(calendarMaximum, finiteInt(raw.daysSurvived, 0, 0, MAX_RUN_DAYS));
  }

  function mergeActiveRun(left, right, leftRaw, rightRaw) {
    assertStableRunIdentity(left, right, "FH_HARDCORE_ACTIVE_RUN_CONFLICT");
    var merged = clone(JSON.stringify(left) >= JSON.stringify(right) ? left : right);
    var leftDay = dayOrdinal(left.lastCheckedDay);
    var rightDay = dayOrdinal(right.lastCheckedDay);
    merged.lastCheckedDay = (leftDay == null ? -1 : leftDay) >= (rightDay == null ? -1 : rightDay)
      ? left.lastCheckedDay : right.lastCheckedDay;
    merged.lastCheckedAt = Math.max(left.lastCheckedAt, right.lastCheckedAt);
    merged.daysSurvived = Math.max(
      verifiedRunDays(leftRaw, left),
      verifiedRunDays(rightRaw, right)
    );
    merged.reinstatedAt = Math.max(
      finiteInt(left.reinstatedAt, 0, 0, Number.MAX_SAFE_INTEGER),
      finiteInt(right.reinstatedAt, 0, 0, Number.MAX_SAFE_INTEGER)
    );
    merged.pauses = mergePauseLists(left.pauses, right.pauses);
  /* An excuse is a decision the owner made on one device. Union it, the same
     way pauses are unioned - a device that has not seen the revive yet must
     not quietly un-excuse the day and end the run again on the next audit. */
  merged.excusedDays = normalizeExcusedDays((left.excusedDays || []).concat(right.excusedDays || []));
  merged.revivedAt = Math.max(left.revivedAt || 0, right.revivedAt || 0);
  merged.revivedCount = Math.max(left.revivedCount || 0, right.revivedCount || 0);
    return merged;
  }

  /* Pause intervals merge by their start moment. When both devices know the
     same pause but disagree about when it ended, the EARLIER resume wins:
     resuming sooner means fewer days go unjudged, so a merge can only ever
     make a run stricter, never quietly protect days neither device meant to
     protect. A pause one device has not seen resumed yet stays open only if
     nobody has recorded an end for it. */
  function mergePauseLists(a, b) {
    var byFrom = Object.create(null);
    var order = [];
    function take(list) {
      (list || []).forEach(function (row) {
        if (!row || !row.from) return;
        var key = String(row.from);
        if (!(key in byFrom)) { byFrom[key] = row.to == null ? null : row.to; order.push(row.from); return; }
        var have = byFrom[key];
        if (have == null) { byFrom[key] = row.to == null ? null : row.to; return; }
        if (row.to != null) byFrom[key] = Math.min(have, row.to);
      });
    }
    take(a); take(b);
    order.sort(function (x, y) { return x - y; });
    return normalizePauses(order.map(function (from) {
      var to = byFrom[String(from)];
      return to == null ? { from: from, to: null } : { from: from, to: to };
    }));
  }

  /* Pure, order-independent cross-device merge. It never reads window.state,
     saves, renders, or contacts storage/cloud. */
  function mergeHardcoreState(leftRaw, rightRaw) {
    var left = normalizeHardcoreForMerge(leftRaw);
    var right = normalizeHardcoreForMerge(rightRaw);
    if (!left && !right) return undefined;

    function adopt(side) {
      var out = clone(side.value);
      out.history = sortHistory(out.history);
      out.runs = out.runs.map(function (run) {
        var one = clone(run);
        one.daysSurvived = verifiedRunDays(side.rawById[run.id], run);
        return one;
      });
      return withRuns(out, out.runs);
    }
    if (!left) return adopt(right);
    if (!right) return adopt(left);

    var allHistory = sortHistory(left.value.history.concat(right.value.history));
    var endedById = Object.create(null);
    allHistory.forEach(function (row) { endedById[row.id] = row; });
    /* Run summaries are immutable recovery/convergence evidence. Never prune
       them locally: a stale peer may still need an older end record to avoid
       resurrecting a completed run. */
    var history = allHistory;
    var unarchived = Object.create(null);

    /* Union the two sides by run id.

       Two devices each holding a DIFFERENT active run used to be a conflict
       that had to be resolved by picking a winner and archiving the loser -
       because only one run could exist. With a list, that disagreement is
       simply two runs, and the honest merge is to keep both. The rule that
       an archived run beats a live one with the same id is unchanged, so a
       stale peer still cannot resurrect a finished run; and a reinstatement
       stamped after the recorded end is still newer evidence and still wins. */
    var byId = Object.create(null);
    var order = [];
    function consider(side) {
      side.value.runs.forEach(function (run) {
        var ended = endedById[run.id];
        if (ended) {
          assertStableRunIdentity(run, ended, "FH_HARDCORE_ACTIVE_RUN_CONFLICT");
          var reinstatedAt = finiteInt(run.reinstatedAt, 0, 0, Number.MAX_SAFE_INTEGER);
          var endedAt = finiteInt(ended.endedAt, 0, 0, Number.MAX_SAFE_INTEGER);
          if (!(reinstatedAt > endedAt)) return;
          unarchived[run.id] = true;
        }
        if (!byId[run.id]) {
          byId[run.id] = { run: run, raw: side.rawById[run.id] };
          order.push(run.id);
        } else {
          var prior = byId[run.id];
          byId[run.id] = {
            run: mergeActiveRun(prior.run, run, prior.raw, side.rawById[run.id]),
            raw: null
          };
        }
      });
    }
    consider(left);
    consider(right);
    if (Object.keys(unarchived).length) {
      history = history.filter(function (row) { return !unarchived[row.id]; });
    }

    var runs = order.map(function (id) {
      var entry = byId[id];
      var run = clone(entry.run);
      if (entry.raw) run.daysSurvived = verifiedRunDays(entry.raw, entry.run);
      return run;
    });

    /* Deterministic order, so both devices converge on the same list. */
    runs.sort(function (a, b) {
      if (a.startedAt !== b.startedAt) return a.startedAt - b.startedAt;
      return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
    });

    /* If the union somehow exceeds what this build supports, the newest runs
       become summaries rather than vanishing - most verified days survive,
       and the stamp is derived from the inputs so both devices agree. */
    var supersededNotice = null;
    if (runs.length > MAX_CONCURRENT_RUNS) {
      var ranked = runs.slice().sort(function (a, b) {
        if (a.daysSurvived !== b.daysSurvived) return b.daysSurvived - a.daysSurvived;
        if (a.startedAt !== b.startedAt) return a.startedAt - b.startedAt;
        return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
      });
      var keep = ranked.slice(0, MAX_CONCURRENT_RUNS);
      var drop = ranked.slice(MAX_CONCURRENT_RUNS);
      var keepIds = Object.create(null);
      keep.forEach(function (run) { keepIds[run.id] = true; });
      var stamp = 0;
      runs.forEach(function (run) {
        stamp = Math.max(stamp,
          finiteInt(run.startedAt, 0, 0, Number.MAX_SAFE_INTEGER),
          finiteInt(run.lastCheckedAt, 0, 0, Number.MAX_SAFE_INTEGER),
          finiteInt(run.reinstatedAt, 0, 0, Number.MAX_SAFE_INTEGER));
      });
      drop.forEach(function (run) {
        var archived = clone(run);
        delete archived.reinstatedAt;
        archived.endedAt = stamp + 1;
        archived.endReason = "over the concurrent run limit after syncing";
        archived.missedDay = null;
        history = history.concat([archived]);
      });
      runs = runs.filter(function (run) { return keepIds[run.id]; });
      supersededNotice = {
        keptRunId: runs.length ? runs[0].id : null,
        keptDays: runs.length ? runs[0].daysSurvived : 0,
        archivedRunId: drop[0].id,
        archivedDays: drop[0].daysSurvived
      };
    }

    var result = withRuns({ history: sortHistory(history) }, runs);
    if (supersededNotice) result.supersededRunNotice = supersededNotice;
    return result;
  }

  /* v10.33: a date is normally judged midnight-to-midnight, and its daily
     total in state.history is exactly that. A LATE START date is judged over a
     moved 24h window instead, which spans two dates - so the daily totals no
     longer answer the question and the sessions themselves have to be bucketed
     by when they actually happened. Ordinary dates keep using history, which
     stays the authority for everything else in the app. */
  /* v10.34: a day is judged over its own clock window. That is the declared
     24h stretch on a late-start date, the shortened run-to-midnight stretch on
     the date after one, and plain midnight-to-midnight everywhere else. Only
     the first two need the sessions bucketed by timestamp; an ordinary date
     is exactly what state.history already holds. */
  function lateWindow(day) {
    try {
      if (typeof window.dayWindowFor !== "function") return null;
      var w = window.dayWindowFor(day);
      /* `extended` is an ordinary day that runs on until the next day is
         declared to start. It has to be treated as a real window here, or the
         minutes in that gap fall back to plain history and the gap reopens. */
      if (!w || !(w.late || w.carried || w.extended)) return null;
      /* Which day asked for it - the overlap tie-break needs to know. */
      w.ownerDay = String(day);
      return w;
    } catch (_) { return null; }
  }
  function midnightOfDay(day, offsetDays) {
    var p = String(day).split("-");
    var d = new Date(+p[0], +p[1] - 1, +p[2], 0, 0, 0, 0);
    if (isNaN(d.getTime())) return null;
    if (offsetDays) d.setDate(d.getDate() + offsetDays);
    return d.getTime();
  }
  /* v10.35.1: MINUTES COME FROM THE SAME PLACE, WHATEVER SHAPE THE DAY IS.

     The first version of this summed sessionsLog for a moved window while an
     ordinary day read state.history. Those are not the same number.
     state.history is the authority for minutes and always has been;
     sessionsLog is a working list that can be pruned, can lack a timestamp,
     and can miss rows that history still counts. So a late start could quietly
     read FEWER minutes than the same day would have read untouched - and fail
     a day that was actually met. That is the worst thing this feature could
     possibly do, and it did it.

     Now: history is still the source. Per-session timestamps are used only for
     the one thing history cannot do - splitting a date across a boundary - and
     a date is never credited more than its own history says. If a date has
     history minutes but no usable session rows to split by, the day is
     credited rather than lost: unsplittable evidence is still evidence. */
  /* Does the day before or after own this moment? Only those two can: a
     window starts on its own date and runs at most 24h, so no other date's
     window can reach across. Failing closed (treating it as claimed) would
     re-drop the minute, so an unreadable neighbour counts as NOT claiming it. */
  /* Two windows can legitimately overlap: a late start on Monday runs into
     Tuesday, and Tuesday's own window opens partway through that. A minute
     inside both was being counted for BOTH days - free progress toward two
     different days from one session, which is exactly the unearned credit this
     app is not supposed to hand out.

     The tie-break is the later day. Once the next day has actually started,
     the minute belongs to it; before that it still belongs to the day that is
     running. Applied to the earlier window only, so the minute is never lost -
     it moves, it does not disappear. */
  function dayKeyOfWindow(w) {
    return (w && w.ownerDay) ? w.ownerDay : dayKey(new Date(w.fromMs));
  }

  function belongsToLaterWindow(day, atMs) {
    var ordinal = dayOrdinal(day);
    if (ordinal == null) return false;
    var nextDay = dayFromOrdinal(ordinal + 1);
    if (!nextDay) return false;
    var w = null;
    try { w = window.dayWindowFor(nextDay); } catch (_) { w = null; }
    if (!w || !Number.isFinite(w.fromMs) || !Number.isFinite(w.toMs)) return false;
    return atMs >= w.fromMs && atMs < w.toMs;
  }

  function claimedByNeighbourWindow(day, atMs, self) {
    var ordinal = dayOrdinal(day);
    if (ordinal == null) return false;
    for (var step = -1; step <= 1; step += 2) {
      var other = dayFromOrdinal(ordinal + step);
      if (!other) continue;
      var w = null;
      try { w = window.dayWindowFor(other); } catch (_) { w = null; }
      if (!w || !Number.isFinite(w.fromMs) || !Number.isFinite(w.toMs)) continue;
      if (self && w.fromMs === self.fromMs && w.toMs === self.toMs) continue;
      if (atMs >= w.fromMs && atMs < w.toMs) return true;
    }
    return false;
  }

  function minutesInWindow(w) {
    var state = S();
    if (!state) return 0;
    var hist = (state && state.history) || {};
    var log = Array.isArray(state.sessionsLog) ? state.sessionsLog : [];
    var firstDay = dayKey(new Date(w.fromMs));
    var lastDay = dayKey(new Date(Math.max(w.fromMs, w.toMs - 1)));
    var o1 = dayOrdinal(firstDay), o2 = dayOrdinal(lastDay);
    if (o1 == null || o2 == null) return 0;
    var total = 0;
    for (var o = o1; o <= o2 && o - o1 <= 3; o++) {
      var d = dayFromOrdinal(o);
      if (!d) continue;
      var dayHist = Math.max(0, Math.floor(Number(hist[d]) || 0));
      var dayStart = midnightOfDay(d, 0), dayEnd = midnightOfDay(d, 1);
      if (dayStart == null || dayEnd == null) continue;
      if (w.fromMs <= dayStart && w.toMs >= dayEnd) { total += dayHist; continue; }
      var sawTimestamped = false, part = 0;
      for (var i = 0; i < log.length; i++) {
        var rec = log[i];
        if (!recordSessionCredit(rec)) continue;
        var at = Number(rec.at || rec.completedAt || rec.startedAt);
        if (!Number.isFinite(at) || at < dayStart || at >= dayEnd) continue;
        sawTimestamped = true;
        if (at < w.fromMs || at >= w.toMs) continue;
        /* Overlap: the later day owns it. */
        if (belongsToLaterWindow(dayKeyOfWindow(w), at)) continue;
        var mins = Number(rec.minutes);
        if (Number.isFinite(mins) && mins > 0) part += mins;
      }
      /* v10.35.2: THE NO-TIMESTAMP FALLBACK IS ONLY FOR THIS WINDOW'S OWN DATE.

         Crediting a whole date whenever its rows cannot be split was meant to
         stop a day being lost. Applied to a LATER date it does something else:
         yesterday's window borrows tomorrow's entire total, and that same
         total is still credited to the date it belongs to. The same hours get
         spent twice - progress that was never earned. The window's own start
         date keeps the fallback, which is what guarantees a late start never
         credits less than the untouched day; a later date it merely overlaps
         has to be split by real timestamps or it contributes nothing. */
      if (!sawTimestamped) { if (o === o1) total += dayHist; continue; }
      /* v10.41: A MINUTE MUST BELONG TO EXACTLY ONE DAY - NEVER TO NONE.

         Splitting a date by timestamp quietly assumed every session lands in
         SOME window. It does not. Declare a late start at 11:30 and the work
         you did at 9am that morning is before this window opens - and the
         previous day's window closed at midnight, so it is not in that one
         either. Those minutes were credited to nobody: the day's whole total
         vanished and the bar read zero while the history still said 600.

         That is what killed a run that was being met. So: a session on this
         window's own date that no neighbouring window can claim is counted
         here rather than dropped. Only the date's own window absorbs its
         orphans, so nothing is counted twice, and the total is still capped by
         what that date's history actually says. */
      /* v10.41: the pre-wake gap is NOT absorbed here.

         Crediting minutes that fall before the window opens looks like it
         fixes the day that reads zero, and it does - but a late start declared
         at 11pm would then claim everything earlier that date AND everything
         up to 11pm the next day: about 47 hours of work satisfying one day's
         requirement. That is a bigger fault than the one it fixes.

         The gap is real and still needs an owner. The right owner is the
         PREVIOUS day - you were still inside yesterday until you declared that
         today had started - which means widening that day's window rather than
         letting this one reach backwards. Left deliberately undone here rather
         than shipped wrong. */
      total += dayHist ? Math.min(part, dayHist) : part;
    }
    return Math.floor(total);
  }
  function sessionsInWindow(w) {
    var state = S();
    if (!state) return 0;
    var sh = (state && state.sessionHistory) || {};
    var log = Array.isArray(state.sessionsLog) ? state.sessionsLog : [];
    var firstDay = dayKey(new Date(w.fromMs));
    var lastDay = dayKey(new Date(Math.max(w.fromMs, w.toMs - 1)));
    var o1 = dayOrdinal(firstDay), o2 = dayOrdinal(lastDay);
    if (o1 == null || o2 == null) return 0;
    var total = 0;
    for (var o = o1; o <= o2 && o - o1 <= 3; o++) {
      var d = dayFromOrdinal(o);
      if (!d) continue;
      var dayCount = Math.max(0, Math.floor(Number(sh[d]) || 0));
      var dayStart = midnightOfDay(d, 0), dayEnd = midnightOfDay(d, 1);
      if (dayStart == null || dayEnd == null) continue;
      if (w.fromMs <= dayStart && w.toMs >= dayEnd) { total += dayCount; continue; }
      var sawTimestamped = false, part = 0;
      for (var i = 0; i < log.length; i++) {
        var rec = log[i];
        if (!recordSessionCredit(rec)) continue;
        var at = Number(rec.at || rec.completedAt || rec.startedAt);
        if (!Number.isFinite(at) || at < dayStart || at >= dayEnd) continue;
        sawTimestamped = true;
        if (at >= w.fromMs && at < w.toMs) part++;
      }
      /* v10.35.2: THE NO-TIMESTAMP FALLBACK IS ONLY FOR THIS WINDOW'S OWN DATE.

         Crediting a whole date whenever its rows cannot be split was meant to
         stop a day being lost. Applied to a LATER date it does something else:
         yesterday's window borrows tomorrow's entire total, and that same
         total is still credited to the date it belongs to. The same hours get
         spent twice - progress that was never earned. The window's own start
         date keeps the fallback, which is what guarantees a late start never
         credits less than the untouched day; a later date it merely overlaps
         has to be split by real timestamps or it contributes nothing. */
      if (!sawTimestamped) { if (o === o1) total += dayCount; continue; }
      total += dayCount ? Math.min(part, dayCount) : part;
    }
    return total;
  }
  function minutesOn(day) {
    var w = lateWindow(day);
    if (w) return minutesInWindow(w);
    var state = S();
    var value = Number(state && state.history && state.history[day]);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  }

  function recordDay(record) {
    if (!record || typeof record !== "object") return null;
    if (validDay(record.localDay)) return String(record.localDay);
    if (validDay(record.dayKey)) return String(record.dayKey);
    var stamp = Number(record.at || record.completedAt || record.startedAt);
    return Number.isFinite(stamp) && stamp > 0 ? dayKey(new Date(stamp)) : null;
  }

  function recordSessionCredit(record) {
    if (!record || record.type !== "focus") return 0;
    var explicit = Number(record.sessionCountApplied);
    if (Number.isFinite(explicit)) return explicit > 0 ? 1 : 0;
    if (record.source === "ledger") return 0;
    return Number(record.minutes) > 0 ? 1 : 0;
  }

  function sessionsOn(day) {
    var state = S();
    var w = lateWindow(day);
    if (w) return sessionsInWindow(w);
    var stored = Number(state && state.sessionHistory && state.sessionHistory[day]);
    if (Number.isFinite(stored) && stored >= 0) return Math.floor(stored);
    if (!state || !Array.isArray(state.sessionsLog)) return 0;
    var count = 0;
    for (var i = 0; i < state.sessionsLog.length; i++) {
      var record = state.sessionsLog[i];
      if (recordSessionCredit(record) && recordDay(record) === day) count++;
    }
    return count;
  }

  /* THE PICKER.

     This started as <input type="time">. On a phone that is a fiddly native
     spinner, and depending on locale it renders as 24-hour with no AM/PM at
     all - so the one screen whose entire job is "tell me what time you woke
     up" had no readable numbers to tap. Replaced with plain buttons: twelve
     hours, four minute steps, AM and PM, and a line telling you exactly what
     window you are about to create. Nothing to type, nothing to spin, and it
     reads the same on every device. */
  var lateDraft = null;
  function draftNow() {
    var d = new Date();
    var h24 = d.getHours(), m = d.getMinutes();
    var h12 = h24 % 12; if (h12 === 0) h12 = 12;
    return { hour12: h12, min: Math.floor(m / 15) * 15, pm: h24 >= 12 };
  }
  function ensureDraft() { if (!lateDraft) lateDraft = draftNow(); return lateDraft; }
  function draftMinutes(d) {
    var h = d.hour12 % 12;
    return (d.pm ? h + 12 : h) * 60 + d.min;
  }
  function draftLabel(d) {
    return d.hour12 + ":" + String(d.min).padStart(2, "0") + " " + (d.pm ? "PM" : "AM");
  }
  function pill(action, value, label, on, extra) {
    return '<button type="button" class="fh12-pill' + (on ? " on" : "") + '" data-fh12="' + action +
      '" data-v="' + value + '"' + (extra || "") + '>' + label + "</button>";
  }

  function renderPanelSafe() {
    /* renderCategory draws the panel; render() only draws the summary strip
       and then delegates. Calling the panel renderer directly keeps a pill tap
       cheap and avoids a full summary rebuild on every tap. */
    try { renderCategory(); } catch (_) { try { render(); } catch (__) {} }
  }

  /* v10.35.2: A DAY IS NOT JUDGED UNTIL ITS OWN WINDOW HAS CLOSED.

     An ordinary day ends at its own midnight, so by the time it is in the
     past there is nothing left to add. A late start does not work that way:
     declaring 11:30 AM makes that date run until 11:30 the NEXT day. For
     those hours the date is already "yesterday" on the calendar while the
     window it owns is still open and still fillable.

     The audit used to walk every past date and treat a short one as a fatal
     miss. So a late start declared yesterday was failed this morning, hours
     before the window it created had actually run out. That is the bug that
     ended the 8h and the 4h run. A date is now only judged once the clock
     has passed the end of its window. */
  function windowEndMs(day) {
    var w = lateWindow(day);
    if (w && Number.isFinite(w.toMs)) return w.toMs;
    return midnightOfDay(day, 1);
  }
  /* ===== v10.62.2: THE CALENDAR ROLLING OVER IS NOT THE DAY ENDING =====

     Declare a late start of 10:00 AM and that date owns the clock until 10:00
     the next morning - that is the entire promise of the feature, and
     dayWindowFor already implements it. But every caller in here asked
     dayKey() for "today", and dayKey() is the calendar date. So at 12:01 AM
     the panel switched to the new date, whose own window does not open until
     10:00 AM, and every bar read 0 of 240 with ten hours still left to run.

     Nothing was lost when that happened - the minutes were still being
     credited to the day that owned them, and the audit uses windowEndMs and
     never judged the day early. But the screen said zero, which for a
     consistency challenge is indistinguishable from having been wiped.

     Hardcore's today is the day whose window contains this minute. When no
     late start is in play this is exactly dayKey(), so ordinary days are
     untouched. Where two windows could overlap the LATER day wins, which is
     the same tie-break the audit already uses - one minute is never credited
     to two days. */
  function hcActiveDay(nowMs) {
    var cal = dayKey();
    try {
      nowMs = Number.isFinite(nowMs) ? nowMs : Date.now();
      if (!cal || typeof window.fhDayShift !== "function") return cal;
      var prevKey = window.fhDayShift(cal, -1);
      if (!prevKey) return cal;
      var prevW = lateWindow(prevKey);
      if (!prevW || !prevW.late) return cal;
      if (!Number.isFinite(prevW.fromMs) || !Number.isFinite(prevW.toMs)) return cal;
      if (nowMs < prevW.fromMs || nowMs >= prevW.toMs) return cal;
      /* Yesterday's window is still open. It only keeps the minute while
         today's own window has not opened yet. */
      var ownW = null;
      try { ownW = window.dayWindowFor(cal); } catch (_) { ownW = null; }
      var opens = ownW && Number.isFinite(ownW.fromMs) ? ownW.fromMs : null;
      if (opens != null && nowMs >= opens) return cal;
      return prevKey;
    } catch (_) { return cal; }
  }
  function hcCalendarDayDiffers() {
    try { return hcActiveDay() !== dayKey(); } catch (_) { return false; }
  }
  function dayIsSettled(day, nowMs) {
    var end = windowEndMs(day);
    if (end == null) return true;
    return nowMs >= end;
  }

  function progressOn(day, req) {
    var have = req.type === "minutes" ? minutesOn(day) : sessionsOn(day);
    /* The requirement itself never moves. A late start buys TIME, not a
       smaller bar - the window above is what changed, not this number. */
    var need = req.value;
    return {
      have: have,
      need: need,
      pct: need > 0 ? Math.max(0, Math.min(100, Math.round(have / need * 100))) : 0,
      qualifies: have >= need,
      window: lateWindow(day)
    };
  }

  /* Pure, complete re-audit. Recomputing from the locked start day avoids
     double-counting the first qualified day and correctly notices a later
     edit that moved any prior day below its requirement. UTC ordinals are
     used for calendar arithmetic, so DST cannot create a 23/25-hour day bug. */
  function auditRun(run, today) {
    var start = dayOrdinal(run && run.startDay);
    var end = dayOrdinal(today);
    if (start == null || end == null) return { ok: false, reason: "invalid calendar day" };
    if (end < start) return { ok: false, reason: "device date is before this run started" };
    if (end - start > MAX_RUN_DAYS) return { ok: false, reason: "run is too long to audit safely" };
    var survived = 0;
    var missedWhilePaused = [];
    var pending = [];
    var nowMs = Date.now();
    for (var ordinal = start; ordinal < end; ordinal++) {
      var day = dayFromOrdinal(ordinal);
      if (progressOn(day, run.requirement).qualifies) { survived++; continue; }
      /* Its window is still open - there is still time to fill it. Not a
         miss, not yet a survival: it simply has not been decided. */
      if (!dayIsSettled(day, nowMs)) { pending.push(day); continue; }
      /* Missed. Fatal only if the run was not paused or excused on that date. */
      if (dateIsPaused(run, day, today)) { missedWhilePaused.push(day); continue; }
      if (dateIsExcused(run, day)) { missedWhilePaused.push(day); continue; }
      return { ok: true, active: false, ended: true, missedDay: day,
               daysSurvived: survived, missedWhilePaused: missedWhilePaused };
    }
    var todayProgress = progressOn(today, run.requirement);
    var pausedToday = dateIsPaused(run, today, today);
    if (pausedToday) todayProgress = Object.assign({}, todayProgress, { paused: true });
    return {
      ok: true,
      active: true,
      ended: false,
      paused: pausedToday,
      pausedSince: pausedToday ? pausedSince(run) : 0,
      /* A paused day still counts if you met it - the pause removes the
         penalty, not the credit. */
      daysSurvived: survived + (todayProgress.qualifies ? 1 : 0),
      missedWhilePaused: missedWhilePaused,
      pending: pending,
      today: todayProgress
    };
  }

  function streakInfo() {
    var state = S() || {};
    return {
      current: finiteInt(state.streak, 0, 0, Number.MAX_SAFE_INTEGER),
      longest: Math.max(
        finiteInt(state.longestStreak, 0, 0, Number.MAX_SAFE_INTEGER),
        finiteInt(state.streak, 0, 0, Number.MAX_SAFE_INTEGER)
      ),
      lastFocusDate: validDay(state.lastFocusDate) ? String(state.lastFocusDate) : null
    };
  }

  function restoreField(state, hadField, priorField) {
    if (hadField) state[FIELD] = priorField;
    else delete state[FIELD];
  }

  function uniqueRunId(data) {
    var base = "hcr_" + Date.now().toString(36);
    var used = Object.create(null);
    (data.history || []).forEach(function (row) { used[row.id] = true; });
    runsOf(data).forEach(function (row) { used[row.id] = true; });
    var id = base;
    var suffix = 1;
    while (used[id]) id = base + "_" + suffix++;
    return id;
  }

  async function start(presetOrRequirement) {
    var read = readHardcore();
    if (!read.ok) return { ok: false, reason: read.reason };
    if (!S()) return { ok: false, reason: "Life XP state is not ready." };
    var existing = runsOf(read.data);
    if (existing.length >= MAX_CONCURRENT_RUNS) {
      return { ok: false, reason: "You already have " + MAX_CONCURRENT_RUNS + " runs going. End one before starting another." };
    }
    var req = normalizeRequirement(presetOrRequirement);
    if (!req) return { ok: false, reason: "Choose a valid daily requirement." };
    var today = hcActiveDay();
    if (!today) return { ok: false, reason: "The device date is invalid." };
    var duplicate = existing.find(function (row) { return row.requirementLock === requirementLock(req); });
    if (duplicate) {
      return { ok: false, reason: "A run with that exact requirement is already going. Pick a different daily bar." };
    }
    var next = clone(read.data);
    next.version = VERSION;
    var fresh = {
      id: uniqueRunId(next),
      startedAt: Date.now(),
      startDay: today,
      requirement: req,
      requirementLock: requirementLock(req),
      daysSurvived: progressOn(today, req).qualifies ? 1 : 0,
      lastCheckedDay: today,
      lastCheckedAt: Date.now()
    };
    next = withRuns(next, existing.concat([fresh]));
    var saved = await persistReplacementDurable(next, "explicit-start");
    if (!saved.ok) return saved;
    try { render(); } catch (_) {}
    scheduleBoundaryEvaluation();
    toast(existing.length
      ? "Hardcore run added — " + req.label + ". It runs alongside your other " + existing.length + "."
      : "Hardcore started — " + req.label + ". The requirement is locked for this run.", "good");
    return { ok: true, run: clone(fresh) };
  }

  function setRequirement() {
    var read = readHardcore();
    if (read.ok && runsOf(read.data).length) {
      return { ok: false, reason: "A run's requirement is locked for its lifetime. Start another run for a different daily bar, or end this one." };
    }
    return { ok: false, reason: "Choose a requirement when starting a new run." };
  }

  function archiveRun(data, run, reason, missedDay, endedAt) {
    var archived = clone(run);
    /* An end supersedes the reinstatement it observed, including a future
       peer timestamp. Equality is enough: merge lets the archive win ties. */
    archived.endedAt = Math.max(finiteInt(endedAt, Date.now(), 0, Number.MAX_SAFE_INTEGER),
      finiteInt(run.reinstatedAt, 0, 0, Number.MAX_SAFE_INTEGER));
    archived.endReason = cleanText(reason, "ended", 120);
    archived.missedDay = validDay(missedDay) ? String(missedDay) : null;
    data.history.unshift(archived);
    /* Only this run ends. Every other run carries on: losing a three-day run
       must never cost you a forty-day one. */
    var remaining = runsOf(data).filter(function (row) { return row.id !== archived.id; });
    var rebuilt = withRuns(data, remaining);
    data.runs = rebuilt.runs;
    data.active = rebuilt.active;
    data.run = rebuilt.run;
    return archived;
  }

  async function end(runIdOrReason, maybeReason) {
    var read = readHardcore();
    if (!read.ok) return { ok: false, reason: read.reason };
    var live = runsOf(read.data);
    if (!live.length) return { ok: false, reason: "No Hardcore run is active." };
    /* end("reason") still works when there is only one run, so nothing that
       called this before has to know about the list. */
    var wantedId = null, reason = null;
    if (typeof runIdOrReason === "string" && live.find(function (r) { return r.id === runIdOrReason; })) {
      wantedId = runIdOrReason; reason = maybeReason;
    } else {
      reason = runIdOrReason;
    }
    var target = wantedId ? live.find(function (r) { return r.id === wantedId; }) : (live.length === 1 ? live[0] : null);
    if (!target) return { ok: false, reason: "Say which run to end - more than one is going." };
    var next = clone(read.data);
    var archived = archiveRun(next, target, reason || "ended by you", null, Date.now());
    var saved = await persistReplacementDurable(next, "explicit-end");
    if (!saved.ok) return saved;
    if (!runsOf(next).length) clearBoundaryTimer();
    try { render(); } catch (_) {}
    return { ok: true, days: archived.daysSurvived, reason: archived.endReason };
  }

  function findRun(live, runId) {
    if (runId) return live.find(function (r) { return r.id === runId; }) || null;
    return live.length === 1 ? live[0] : null;
  }
  async function pauseRun(runId) {
    var read = readHardcore();
    if (!read.ok) return { ok: false, reason: read.reason };
    var live = runsOf(read.data);
    if (!live.length) return { ok: false, reason: "No Hardcore run is active." };
    var target = findRun(live, runId);
    if (!target) return { ok: false, reason: "Say which run to pause - more than one is going." };
    if (isPausedNow(target)) return { ok: false, reason: "That run is already paused." };
    var next = clone(read.data);
    var rows = runsOf(next).map(function (r) {
      if (r.id !== target.id) return r;
      var copy = clone(r);
      copy.pauses = normalizePauses((copy.pauses || []).concat([{ from: Date.now(), to: null }]));
      return copy;
    });
    next = withRuns(next, rows);
    var saved = await persistReplacementDurable(next, "hardcore-pause");
    if (!saved.ok) return saved;
    try { render(); } catch (_) {}
    return { ok: true };
  }
  async function resumeRun(runId) {
    var read = readHardcore();
    if (!read.ok) return { ok: false, reason: read.reason };
    var live = runsOf(read.data);
    if (!live.length) return { ok: false, reason: "No Hardcore run is active." };
    var target = findRun(live, runId);
    if (!target) return { ok: false, reason: "Say which run to resume - more than one is going." };
    if (!isPausedNow(target)) return { ok: false, reason: "That run is not paused." };
    var next = clone(read.data);
    var rows = runsOf(next).map(function (r) {
      if (r.id !== target.id) return r;
      var copy = clone(r);
      var list = (copy.pauses || []).slice();
      var last = list[list.length - 1];
      if (last && last.to == null) list[list.length - 1] = { from: last.from, to: Date.now() };
      copy.pauses = normalizePauses(list);
      return copy;
    });
    next = withRuns(next, rows);
    var saved = await persistReplacementDurable(next, "hardcore-resume");
    if (!saved.ok) return saved;
    try { render(); } catch (_) {}
    return { ok: true };
  }

  function deterministicEvaluationStamp(day) {
    var ordinal = dayOrdinal(day);
    return ordinal == null ? 0 : Math.min(Number.MAX_SAFE_INTEGER, (ordinal + 1) * 86400000 - 1);
  }

  /* ------------------------------------------------------------------
     v10.14.1: a device that is BEHIND must not be allowed to fail a run.

     auditRun is a pure function of state.history, so a device whose
     history has not yet merged the other device's sessions sees a short
     day and declares a miss. That is exactly what happened on
     2026-08-22: the requirement was 240 min, the merged day held 276,
     and the phone ended the run because its own copy was short. An
     archived run then beats an active one in the merge, so the wrongful
     failure propagated and killed a run that was genuinely alive.

     Two defences, both pure and deterministic so every device agrees:

       1. Never finalise a miss while this device still has unsynced work
          queued. If the cloud has bytes we have not merged, our view of
          the day is not authoritative yet. Defer, do not end.

       2. Heal a miss that the evidence later contradicts. An archived
          automatic failure is re-audited against current history; if
          every day from the start day genuinely met the requirement, the
          run is put back. This can only ever restore progress that was
          actually earned - a day that is truly short keeps the run
          ended - so it cannot manufacture a streak that was not played.

     Runs you ended yourself carry missedDay === null and are never
     reinstated. */
  function cloudViewMayBeStale() {
    try {
      var st = S();
      var sync = st && st.sync;
      if (!sync || !sync.enabled) return false;
      return !!sync.pendingSync;
    } catch (_) { return false; }
  }

  /* How long a miss may be held open waiting for a sync that may never come. */
  var DEFER_GRACE_DAYS = 2;

  function deferralExpired(missedDay, today) {
    var missed = dayOrdinal(missedDay);
    var now = dayOrdinal(today);
    if (missed == null || now == null) return true;   /* cannot reason - do not hold */
    return (now - missed) > DEFER_GRACE_DAYS;
  }

  /* v10.35.1: an archived run is re-audited and brought back whenever the
     record no longer supports the miss - after a sync, after an edit, or after
     a fix like this one. It used to refuse to look while ANY run was live,
     which with more than one run meant a wrongly-ended run could never come
     back on its own while its sibling was still going. The check that matters
     is whether THIS run is already live, not whether any run is. */
  /* Manual revive. Unlike reinstatementPlan - which only rescues a run the
     RECORD no longer condemns - this one is the owner overriding the verdict,
     so it does not re-litigate the day. It still refuses to invent a run that
     is not in the archive, and still respects the concurrency cap. */
  function revivePlan(data, runId, today) {
    if (!data) return { ok: false, reason: "no hardcore data" };
    var archive = Array.isArray(data.history) ? data.history : [];
    if (!archive.length) return { ok: false, reason: "there are no ended runs to bring back" };
    if (runsOf(data).length >= MAX_CONCURRENT_RUNS) {
      return { ok: false, reason: "you already have " + MAX_CONCURRENT_RUNS + " runs going" };
    }
    var index = -1;
    for (var i = 0; i < archive.length; i++) {
      if (archive[i] && String(archive[i].id) === String(runId)) { index = i; break; }
    }
    if (index === -1) return { ok: false, reason: "that run is not in the archive" };
    var row = archive[index];
    var live = runsOf(data);
    for (var j = 0; j < live.length; j++) {
      if (String(live[j].id) === String(row.id)) return { ok: false, reason: "that run is already going" };
    }
    var restored = withExcusedDay(row, row.missedDay);
    delete restored.endedAt;
    delete restored.endReason;
    delete restored.missedDay;
    restored.revivedAt = deterministicEvaluationStamp(today);
    /* A peer may still hold the ended copy. Reviving must be newer than that
       end under the same ordering used by mergeHardcoreState. */
    var endedAt = finiteInt(row.endedAt, 0, 0, Number.MAX_SAFE_INTEGER);
    if (endedAt >= Number.MAX_SAFE_INTEGER) return { ok:false, reason:"That run's end timestamp cannot be superseded safely; nothing changed." };
    restored.reinstatedAt = Math.max(Date.now(), endedAt + 1);
    restored.revivedCount = Math.max(0, Math.trunc(Number(row.revivedCount) || 0)) + 1;
    restored.lastCheckedDay = today;
    var audit = auditRun(restored, today);
    if (!audit.ok) return { ok: false, reason: audit.reason || "that run could not be re-audited" };
    if (audit.ended) {
      /* A second, EARLIER short day is still there. Excuse that one too, so
         the owner's decision actually takes effect instead of dying again on
         a different date. */
      restored = withExcusedDay(restored, audit.missedDay);
      audit = auditRun(restored, today);
      if (!audit.ok || audit.ended) return { ok: false, reason: "that run has more than one missed day behind it" };
    }
    restored.daysSurvived = audit.daysSurvived;
    var next = clone(data);
    next.history = next.history.slice(0, index).concat(next.history.slice(index + 1));
    next = withRuns(next, runsOf(next).concat([restored]));
    return { ok: true, next: next, run: restored, days: audit.daysSurvived, excused: row.missedDay || null };
  }

  async function reviveRun(runId) {
    var read = readHardcore();
    if (!read.ok) return { ok: false, reason: read.reason };
    var today = hcActiveDay();
    var plan = revivePlan(read.data, runId, today);
    if (!plan.ok) return plan;
    /* Put the rank back too. The -200 was derived from the missed day this
       revive has just overturned, so leaving it would restore the run and keep
       the punishment - a half-restoration. The rank ledger lives on the same
       state object, so retracting here rides along on the one durable save
       below rather than becoming a second, separately-failable write. */
    var rankRestored = null;
    try {
      var st = S();
      if (st && window.FH_RANK && typeof window.FH_RANK.retract === "function") {
        var undone = window.FH_RANK.retract(st, "hcf:" + runId);
        if (undone && undone.changed) rankRestored = Math.abs(Number(undone.removed && undone.removed.delta) || 0);
      }
    } catch (_) {}
    var saved = await persistReplacementDurable(plan.next, "revive-run");
    if (!saved.ok) return saved;
    scheduleBoundaryEvaluation();
    try { render(); } catch (_) {}
    toast("Run restored — carrying on at " + plan.days + " day" + (plan.days === 1 ? "" : "s") +
      (plan.excused ? ". " + plan.excused + " is excused, not counted." : ".") +
      (rankRestored ? " " + rankRestored + " RP returned." : ""), "good");
    return { ok: true, days: plan.days, excused: plan.excused, rankRestored: rankRestored };
  }

  function reinstatementPlan(data, today) {
    if (!data) return null;
    if (!Array.isArray(data.history) || !data.history.length) return null;
    var liveIds = Object.create(null);
    runsOf(data).forEach(function (r) { liveIds[r.id] = true; });
    if (runsOf(data).length >= MAX_CONCURRENT_RUNS) return null;
    for (var i = 0; i < data.history.length; i++) {
      var row = data.history[i];
      /* Only automatic misses. An explicit end has missedDay === null - a run
         you chose to end stays ended. */
      if (!row || !validDay(row.missedDay)) continue;
      if (liveIds[row.id]) continue;
      var candidate = clone(row);
      delete candidate.endedAt;
      delete candidate.endReason;
      delete candidate.missedDay;
      var recheck = auditRun(candidate, today);
      if (!recheck.ok || recheck.ended || !recheck.active) continue;
      var next = clone(data);
      next.history = next.history.slice(0, i).concat(next.history.slice(i + 1));
      candidate.daysSurvived = recheck.daysSurvived;
      candidate.lastCheckedDay = today;
      candidate.lastCheckedAt = Math.max(
        finiteInt(candidate.lastCheckedAt, 0, 0, Number.MAX_SAFE_INTEGER),
        deterministicEvaluationStamp(today)
      );
      /* Keep the decision deterministic and strictly newer even when a peer
         with a later clock contributed the archived end. */
      var endedAt = finiteInt(row.endedAt, 0, 0, Number.MAX_SAFE_INTEGER);
      if (endedAt >= Number.MAX_SAFE_INTEGER) continue;
      candidate.reinstatedAt = Math.max(deterministicEvaluationStamp(today), endedAt + 1);
      next = withRuns(next, runsOf(next).concat([candidate]));
      return { row: row, next: next, days: recheck.daysSurvived };
    }
    return null;
  }

  function evaluationPlan(data, today) {
    if (!data || !data.active || !data.run) {
      var revive = reinstatementPlan(data, today);
      if (revive) {
        return {
          ok:true, changed:true, active:true, reinstated:true,
          on:revive.row.missedDay, days:revive.days, next:revive.next
        };
      }
      return { ok:true, changed:false, active:false, next:data };
    }
    var audit = auditRun(data.run, today);
    if (!audit.ok) return audit;
    var next = clone(data);
    var stamp = deterministicEvaluationStamp(today);
    if (audit.ended && cloudViewMayBeStale() && !deferralExpired(audit.missedDay, today)) {
      /* Unsynced work is queued: our day totals may be incomplete. Hold the
         run open rather than ending it on a view we know is partial.

         v10.27: this hold is now BOUNDED. It used to be indefinite, and that
         was a real failure - if sync got stuck (a blocked cloud row, a device
         left offline), `pendingSync` stayed true forever, the miss was
         deferred forever, and a run that had genuinely been lost stayed on the
         books until it was ended by hand. A streak that survives only because
         sync is broken is not a streak.

         So the benefit of the doubt lasts DEFER_GRACE_DAYS. Minutes that
         would rescue the run would have to arrive from another device, and if
         they have not arrived in two days they are not coming. After that the
         run ends on the evidence this device actually has, which is the same
         standard everything else here is held to. If the missing minutes do
         turn up later, the existing reinstatement path puts the run back. */
      try {
        console.warn("[fh-hardcore] deferring the " + audit.missedDay
          + " miss: this device still has unsynced changes queued, so its daily totals may be"
          + " incomplete. This hold expires after " + DEFER_GRACE_DAYS + " days.");
      } catch (_) {}
      return { ok:true, changed:false, active:true, deferred:true, next:data };
    }
    if (audit.ended) {
      next.run.daysSurvived = audit.daysSurvived;
      var lapsed = cloudViewMayBeStale();
      var archived = archiveRun(
        next, next.run,
        "missed " + audit.missedDay + (lapsed ? " (held for sync, never arrived)" : ""),
        audit.missedDay,
        deterministicEvaluationStamp(audit.missedDay)
      );
      return {
        ok:true, changed:true, active:false, ended:true,
        on:audit.missedDay, days:archived.daysSurvived, next:next
      };
    }
    next.run.daysSurvived = audit.daysSurvived;
    next.run.lastCheckedDay = today;
    next.run.lastCheckedAt = Math.max(finiteInt(next.run.lastCheckedAt, 0, 0, Number.MAX_SAFE_INTEGER), stamp);
    return {
      ok:true, changed:JSON.stringify(next) !== JSON.stringify(data), active:true,
      days:audit.daysSurvived, today:clone(audit.today), next:next
    };
  }

  /* Fan the single-run engine across every run.

     evaluationPlan is the part that decides whether a run survived a day,
     defers on unsynced data, archives a miss with a deterministic stamp, and
     revives a run whose miss was later contradicted. It is not reimplemented
     for several runs; each run is handed to it wearing the single-run shape
     it expects, and the outcomes are folded back into one state. */
  /* v10.35.3: keep pulling until the archive has nothing left to give.
     reinstatementPlan rescues the FIRST run it can and stops, so any single
     call revives exactly one. Both entry points below need every run the
     record no longer condemns, so both go through here. Bounded by the
     concurrency cap, and the archive shrinks on every success. */
  function reviveAll(pool, today) {
    var on = [], days = [];
    for (var guard = 0; guard < MAX_CONCURRENT_RUNS; guard++) {
      var revived = reinstatementPlan(pool, today);
      if (!revived) break;
      on.push(revived.row.missedDay);
      days.push(revived.days);
      pool = withRuns({ history: revived.next.history }, runsOf(revived.next));
    }
    return { pool: pool, on: on, days: days };
  }

  function evaluateAllPlans(data, today) {
    var live = runsOf(data);
    if (!live.length) {
      /* v10.35.3: this branch used to revive exactly one run and return, so
         when the SAME bug ended two runs only one came back - decided purely
         by which sat earlier in the archive. That is the two-run case, which
         is the common one. */
      var all = reviveAll(withRuns({ history: clone(data.history || []) }, []), today);
      if (all.on.length) {
        return { ok:true, changed:true, reinstated:true,
                 on:all.on[0], days:all.days[0],
                 reinstatedOn:all.on, reinstatedCount:all.on.length,
                 next: all.pool };
      }
      return { ok:true, changed:false, next:data };
    }
    var history = clone(data.history || []);
    var survivors = [];
    var ended = [];
    var deferred = false;
    var changed = false;
    for (var i = 0; i < live.length; i++) {
      var view = soloView({ history: history }, live[i]);
      var plan = evaluationPlan(view, today);
      if (!plan.ok) return plan;
      if (plan.deferred) deferred = true;
      if (plan.changed) changed = true;
      history = clone(plan.next.history || history);
      var stillLive = runsOf(plan.next);
      if (stillLive.length) survivors.push(stillLive[0]);
      else if (plan.ended) ended.push({ id: live[i].id, on: plan.on, days: plan.days,
                                        label: live[i].requirement && live[i].requirement.label });
    }
    /* v10.35.1: with runs live, the archived list was never re-examined, so a
       run ended in error could not come back while a sibling was still going -
       which is exactly the situation a two-run setup is always in. Try it here
       too, on the history as it stands after this pass. */
    /* v10.35.3: BRING BACK EVERY RUN THE RECORD NO LONGER CONDEMNS, NOT ONE.

       reinstatementPlan returns the first run it can rescue and stops. Calling
       it once meant a single revival per pass, so with two runs wrongly ended
       by the same bug, one came back and the other stayed dead waiting for
       some later pass to notice it. Whichever run happened to sit earlier in
       the archive won, which is not a rule - it is an accident of ordering.
       The same fix that clears one of them clears both, so keep pulling until
       there is nothing left to pull. The loop is bounded by the concurrency
       cap and by the archive shrinking on every success, so it terminates. */
    if (!ended.length && survivors.length < MAX_CONCURRENT_RUNS) {
      var back = reviveAll(withRuns({ history: history }, survivors), today);
      if (back.on.length) {
        return { ok:true, changed:true, reinstated:true,
                 on:back.on[0], days:back.days[0],
                 reinstatedOn:back.on, reinstatedCount:back.on.length,
                 next: back.pool };
      }
    }
    return {
      ok: true,
      changed: changed,
      deferred: deferred,
      ended: ended,
      endedCount: ended.length,
      activeCount: survivors.length,
      next: withRuns({ history: history }, survivors)
    };
  }

  function describeEnded(ended) {
    return ended.map(function (row) {
      return (row.label || "a run") + " ended — " + row.on + " missed the locked requirement.";
    }).join(" ");
  }

  /* Retained as a diagnostics/API path. Normal operation does not need a
     Check button; evaluateAutomatically() owns calendar transitions. */
  /* Naming one day when two runs came back reads like only one was restored. */
  function restoredMessage(plan) {
    var n = (plan && plan.reinstatedCount) || 1;
    if (n > 1) return "Hardcore restored — " + n + " runs came back; those days met the requirement after all.";
    return "Hardcore restored — " + plan.on + " met the requirement after all.";
  }

  async function evaluate() {
    var read = readHardcore();
    if (!read.ok) return { ok: false, reason: read.reason };
    var today = hcActiveDay();
    var plan = evaluateAllPlans(read.data, today);
    if (!plan.ok) return plan;
    if (plan.reinstated) {
      var healSave = await persistReplacementDurable(plan.next, "reinstate-contradicted-miss");
      if (!healSave.ok) return healSave;
      scheduleBoundaryEvaluation();
      try { render(); } catch (_) {}
      toast(restoredMessage(plan), "good");
      return { ok:true, active:true, reinstated:true, on:plan.on, days:plan.days,
               reinstatedOn:plan.reinstatedOn||[plan.on],
               reinstatedCount:plan.reinstatedCount||1 };
    }
    if (plan.changed || read.needsMigration) {
      var saved = await persistReplacementDurable(plan.next, "explicit-evaluation");
      if (!saved.ok) return saved;
    }
    if (plan.endedCount) {
      if (!plan.activeCount) clearBoundaryTimer();
      try { render(); } catch (_) {}
      toast(describeEnded(plan.ended), "bad");
      return { ok:true, active:plan.activeCount > 0, ended:true,
               endedRuns:clone(plan.ended), activeRuns:plan.activeCount };
    }
    scheduleBoundaryEvaluation();
    try { render(); } catch (_) {}
    return { ok:true, active:plan.activeCount > 0, activeRuns:plan.activeCount };
  }

  /* Due if ANY run is due. Asking only the first would let a second run sit
     unchecked across a calendar boundary. */
  /* v10.35.4: A REINSTATEMENT MUST NOT BE BLOCKED BY "ALREADY CHECKED TODAY".

     automaticDue answers "does a LIVE run need its daily check?". Once every
     live run is stamped for today it says no, and the caller returns before
     evaluateAllPlans is reached - which is also the only place the archive is
     re-examined. So the moment one wrongly-ended run came back and stamped
     itself, the gate shut for the rest of the day and its sibling could not
     follow it. Two runs killed by one bug, one back, one stuck until tomorrow.

     This only forces the pass to RUN. What the archive deserves is still
     decided by a full re-audit inside reinstatementPlan, so nothing is revived
     that the record does not support. The in-memory stamp stops it rescanning
     on every render while a legitimately-ended run sits in the archive; it is
     deliberately not persisted, so a reload always gets a fresh look. */
  var lastReviveScan = "";
  function reviveScanKey(data, today) {
    /* A sync or edit can change the evidence without changing the run counts.
       Cache only while all inputs to the archive's re-audit are unchanged. */
    var state = S() || {};
    return JSON.stringify([today, data, state.history || {}, state.sessionHistory || {},
      state.sessionsLog || [], state.lateStarts || {}]);
  }
  function mayHaveRevivableRun(data, today) {
    if (!data || !Array.isArray(data.history) || !data.history.length) return false;
    if (runsOf(data).length >= MAX_CONCURRENT_RUNS) return false;
    var liveIds = Object.create(null);
    runsOf(data).forEach(function (r) { liveIds[r.id] = true; });
    var candidate = data.history.some(function (row) {
      return row && validDay(row.missedDay) && !liveIds[row.id];
    });
    if (!candidate) return false;
    var key = reviveScanKey(data, today);
    if (key === lastReviveScan) return false;
    lastReviveScan = key;
    return true;
  }

  function automaticDue(read, today) {
    if (!read || !read.ok) return { due:false };
    var live = runsOf(read.data);
    if (!live.length) return { due:false };
    var todayOrdinal = dayOrdinal(today);
    if (todayOrdinal == null) return { due:false, error:"invalid calendar day" };
    var due = !!read.needsMigration;
    for (var i = 0; i < live.length; i++) {
      var startOrdinal = dayOrdinal(live[i].startDay);
      var checkedOrdinal = dayOrdinal(live[i].lastCheckedDay);
      if (startOrdinal == null) return { due:false, error:"invalid calendar day" };
      if (todayOrdinal < startOrdinal) return { due:false, error:"device date is before this run started" };
      var baseline = checkedOrdinal == null ? startOrdinal - 1 : checkedOrdinal;
      if (todayOrdinal < baseline) return { due:false, error:"device date moved behind the last Hardcore evaluation" };
      if (todayOrdinal - baseline > MAX_CATCH_UP_DAYS) {
        return { due:false, error:"Hardcore catch-up exceeds the protected calendar limit; nothing changed." };
      }
      if (todayOrdinal > baseline) due = true;
    }
    if (!due && mayHaveRevivableRun(read.data, today)) due = true;
    /* Marked checked earlier today, but the window that day owns has closed
       since. Without this the "already checked today" gate would hold the
       verdict over until tomorrow. */
    if (!due) {
      var nowMs = Date.now();
      for (var k = 0; k < live.length; k++) {
        var checkedDay = validDay(live[k].lastCheckedDay) ? String(live[k].lastCheckedDay) : null;
        if (!checkedDay) continue;
        var closes = windowEndMs(checkedDay);
        if (closes != null && nowMs >= closes) { due = true; break; }
      }
    }
    return { due: due };
  }

  async function persistReplacementDurable(next, source) {
    var state = S();
    if (!state) return { ok:false, reason:"Life XP state is not ready." };
    if (typeof window.saveStateDurable !== "function") {
      return { ok:false, reason:"Verified durable saving is unavailable; nothing changed." };
    }
    var hadField = Object.prototype.hasOwnProperty.call(state, FIELD);
    var priorField = state[FIELD];
    state[FIELD] = next;
    try {
      var saved = await window.saveStateDurable({
        source:"hardcore-" + cleanText(source, "automatic", 40),
        suppressMilestoneAnnouncement:true
      });
      if (saved === false) throw new Error("Verified durable saving refused this Hardcore change.");
      return { ok:true };
    } catch (error) {
      /* The same evidence must be retryable if its restoration did not save. */
      lastReviveScan = "";
      /* A peer-primary adoption may replace window.state while the awaited
         commit is in flight. Restore only the exact object installed here;
         never overwrite a newer peer state. */
      if (S() === state && state[FIELD] === next) restoreField(state, hadField, priorField);
      return { ok:false, reason:cleanText(error && error.message, "Hardcore change was not saved.", 180) };
    }
  }

  async function evaluateAutomaticallyUnderLock(source) {
    var read = readHardcore();
    if (!read.ok) return { ok:false, reason:read.reason };
    var today = hcActiveDay();
    if (!runsOf(read.data).length) {
      var healPlan = evaluateAllPlans(read.data, today);
      if (!healPlan.ok || !healPlan.reinstated) return { ok:true, active:false, changed:false };
      var healSave = await persistReplacementDurable(healPlan.next, source || "reinstate-contradicted-miss");
      if (!healSave.ok) return healSave;
      try { render(); } catch (_) {}
      toast(restoredMessage(healPlan), "good");
      return { ok:true, active:true, reinstated:true, changed:true, on:healPlan.on, days:healPlan.days, day:today };
    }
    var due = automaticDue(read, today);
    if (due.error) return { ok:false, reason:due.error };
    if (!due.due) return { ok:true, active:true, changed:false, day:today };
    var plan = evaluateAllPlans(read.data, today);
    if (!plan.ok) return plan;
    if (!plan.changed && !read.needsMigration) return { ok:true, active:true, changed:false, day:today };
    var saved = await persistReplacementDurable(plan.next, source);
    if (!saved.ok) return saved;
    if (plan.endedCount) {
      toast(describeEnded(plan.ended), "bad");
      return { ok:true, active:plan.activeCount > 0, ended:true, changed:true,
               endedRuns:clone(plan.ended), activeRuns:plan.activeCount, day:today };
    }
    return { ok:true, active:plan.activeCount > 0, changed:true, activeRuns:plan.activeCount, day:today };
  }

  function evaluateAutomatically(source) {
    if (automaticInFlight) return automaticInFlight;
    var operation = function () { return evaluateAutomaticallyUnderLock(source || "automatic"); };
    var locks = window.navigator && window.navigator.locks;
    var requested;
    try {
      requested = locks && typeof locks.request === "function"
        ? locks.request(AUTO_LOCK_NAME, { mode:"exclusive", ifAvailable:true }, function (lock) {
            return lock ? operation() : { ok:true, active:true, changed:false, skipped:"another-tab" };
          })
        : operation();
    } catch (error) {
      requested = Promise.resolve({ ok:false, reason:cleanText(error && error.message, "Automatic evaluation failed.", 180) });
    }
    automaticInFlight = Promise.resolve(requested).catch(function (error) {
      return { ok:false, reason:cleanText(error && error.message, "Automatic evaluation failed safely.", 180) };
    }).then(function (result) {
      try { render(); } catch (_) {}
      return result;
    }).finally(function () {
      automaticInFlight = null;
      scheduleBoundaryEvaluation();
    });
    return automaticInFlight;
  }

  function clearBoundaryTimer() {
    if (boundaryTimer != null) {
      try { clearTimeout(boundaryTimer); } catch (_) {}
      boundaryTimer = null;
    }
  }

  function scheduleBoundaryEvaluation() {
    clearBoundaryTimer();
    var read = readHardcore();
    if (!read.ok || !read.data.active || !read.data.run || typeof setTimeout !== "function") return;
    var current = new Date();
    if (!Number.isFinite(current.getTime())) return;
    /* v10.40: WAKE WHEN THE DEADLINE ACTUALLY PASSES.

       This always slept until the next local midnight. That is only the
       deadline for an ordinary day. Declare a late start at 11:30 and the
       day's window runs to 11:30 the NEXT morning - so the requirement could
       lapse mid-morning and nothing would notice until midnight, leaving a run
       that should have ended sitting there until it was ended by hand.

       Ask the day itself when it ends. Midnight remains the answer for an
       ordinary day, so nothing changes for one. */
    var deadline = null;
    try { deadline = windowEndMs(hcActiveDay(current.getTime())); } catch (_) { deadline = null; }
    var next = (deadline != null && deadline > current.getTime())
      ? new Date(deadline + 2000)
      : new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1, 0, 0, 2, 0);
    var delay = Math.max(1000, Math.min(2147483647, next.getTime() - current.getTime()));
    try {
      boundaryTimer = setTimeout(function () {
        boundaryTimer = null;
        void evaluateAutomatically("local-midnight");
      }, delay);
    } catch (_) { boundaryTimer = null; }
  }

  function bindAutomaticLifecycle() {
    if (lifecycleBound) return;
    lifecycleBound = true;
    if (window && typeof window.addEventListener === "function") {
      window.addEventListener("focus", function () { void evaluateAutomatically("window-focus"); });
    }
    if (document && typeof document.addEventListener === "function") {
      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "visible" || document.hidden === false) {
          void evaluateAutomatically("visible-return");
        }
      });
    }
  }

  function bestRun(data) {
    var best = 0;
    (data.history || []).forEach(function (row) { best = Math.max(best, row.daysSurvived || 0); });
    runsOf(data).forEach(function (row) { best = Math.max(best, row.daysSurvived || 0); });
    return best;
  }

  var CSS = [
    "#fh12-consistency{margin:8px 0 12px;border:1px solid var(--border,rgba(255,255,255,.12));border-radius:12px;background:var(--panel-2,rgba(255,255,255,.035));overflow:hidden}",
    ".fh12-summary{display:flex;align-items:center;gap:9px;padding:9px 10px;min-width:0}",
    ".fh12-copy{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}",
    ".fh12-copy b{font-size:.78rem}.fh12-copy span{font-size:.68rem;opacity:.66;white-space:normal}",
    ".fh12-badge{font-size:.64rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;border:1px solid var(--border,rgba(255,255,255,.16));border-radius:99px;padding:4px 7px;white-space:nowrap}",
    ".fh12-badge.live{color:#ffaaaa;border-color:rgba(255,110,110,.55);background:rgba(255,90,90,.08)}",
    "#fh12-consistency button{padding:6px 9px;border-radius:8px;cursor:pointer;font-size:.7rem;background:var(--panel-2,rgba(255,255,255,.05));color:var(--fg,#e8ecff);border:1px solid var(--border,rgba(255,255,255,.15))}",
    "#fh12-consistency button:hover{background:rgba(255,255,255,.1)}",
    ".fh12-setup,.fh12-actions{display:flex;gap:7px;flex-wrap:wrap;padding:0 10px 10px}",
    ".fh12-help{width:100%;font-size:.68rem;line-height:1.4;opacity:.67;margin:0}",
    ".fh12-progress{height:5px;border-radius:99px;background:rgba(255,255,255,.1);overflow:hidden;margin-top:3px}",
    ".fh12-progress i{display:block;height:100%;background:linear-gradient(90deg,var(--accent,#7ee0c8),var(--accent-2,#6fa8ff))}",
    ".fh12-danger:hover{color:#ffaaaa;border-color:rgba(255,110,110,.6)!important}",
    ".fh12-error{padding:9px 10px;color:#ffb4b4;font-size:.7rem;line-height:1.4}",
    "#fh12-hardcore-panel{display:grid;gap:12px}",
    ".fh12-category-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}",
    ".fh12-category-head h3{margin:0 0 4px;font-size:1rem}",
    ".fh12-category-head p{margin:0;font-size:.78rem;line-height:1.45;opacity:.72}",
    ".fh12-stat-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}",
    ".fh12-stat{padding:10px;border:1px solid var(--border,rgba(255,255,255,.12));border-radius:10px;background:var(--panel-2,rgba(255,255,255,.035))}",
    ".fh12-stat b{display:block;font-size:1.05rem}.fh12-stat span{display:block;margin-top:2px;font-size:.65rem;letter-spacing:.05em;text-transform:uppercase;opacity:.62}",
    ".fh12-category-card{padding:12px;border:1px solid var(--border,rgba(255,255,255,.12));border-radius:11px;background:var(--panel-2,rgba(255,255,255,.035))}",
    ".fh12-category-card h4{margin:0 0 7px;font-size:.82rem}.fh12-category-card p{margin:5px 0;font-size:.74rem;line-height:1.45;opacity:.76}",
    ".fh12-category-actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}",
    "#fh12-hardcore-panel button{padding:7px 10px;border-radius:8px;cursor:pointer;font-size:.72rem;background:var(--panel-2,rgba(255,255,255,.05));color:var(--fg,#e8ecff);border:1px solid var(--border,rgba(255,255,255,.15))}",
    ".fh12-history{display:grid;gap:7px}",
    ".fh12-history-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:9px 10px;border:1px solid var(--border,rgba(255,255,255,.1));border-radius:9px}.fh12-history-right{display:flex;flex-direction:column;align-items:flex-end;gap:6px}.fh12-revive{white-space:nowrap;font-size:.72rem;padding:4px 9px}.fh12-revived{opacity:.72;font-style:italic}",
    ".fh12-history-row b{font-size:.75rem}.fh12-history-row span{font-size:.68rem;opacity:.66}",
    "@media(max-width:520px){.fh12-stat-grid{grid-template-columns:1fr}.fh12-category-head{align-items:center}}"
  ].join("\n");

  function injectCss() {
    if (!document || document.getElementById("fh12-css")) return;
    var style = document.createElement("style");
    style.id = "fh12-css";
    style.textContent = CSS + conflictCss() +
      ".fh12-latenote{font-size:.8rem;opacity:.75;margin:.25rem 0}" +
      ".fh12-blocked{color:#ffb4b4;opacity:1}" +
      ".fh12-pausetag{font-size:.68rem;text-transform:uppercase;letter-spacing:.1em;padding:.15rem .45rem;" +
        "border-radius:99px;background:rgba(255,255,255,.10);vertical-align:middle;margin-left:.4rem;opacity:.85}" +
      ".fh12-picker{display:flex;flex-direction:column;gap:.5rem;margin:.6rem 0}" +
      ".fh12-picker-row{display:flex;align-items:flex-start;gap:.6rem;flex-wrap:wrap}" +
      ".fh12-picker-lbl{font-size:.72rem;text-transform:uppercase;letter-spacing:.09em;opacity:.6;" +
        "min-width:4.6rem;padding-top:.45rem}" +
      ".fh12-pills{display:flex;flex-wrap:wrap;gap:.35rem;flex:1 1 auto}" +
      ".fh12-pills.grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:.35rem}" +
      /* Scoped to the panel id AND marked important. Measured, not assumed:
         the app's own button styling was winning the cascade, so the selected
         pill came out the exact same colour as an unselected one - the state
         was invisible, which on a picker is the whole ballgame. */
      "#fh12-hardcore-panel .fh12-pill{min-width:2.6rem;min-height:2.5rem;padding:.35rem .6rem;" +
        "border-radius:10px;border:1px solid var(--border,rgba(255,255,255,.18));" +
        "background:rgba(255,255,255,.05);color:inherit;font-weight:650;font-size:.9rem;" +
        "cursor:pointer;font-variant-numeric:tabular-nums}" +
      "#fh12-hardcore-panel .fh12-pill:hover{border-color:rgba(var(--accent-rgb,102,227,196),.6)}" +
      "#fh12-hardcore-panel .fh12-pill.on{background:rgb(var(--accent-rgb,102,227,196)) !important;" +
        "color:#08131a !important;border-color:rgb(var(--accent-rgb,102,227,196)) !important;" +
        "font-weight:800;box-shadow:0 0 0 3px rgba(var(--accent-rgb,102,227,196),.25)}" +
      "#fh12-hardcore-panel .fh12-pill.ghost{opacity:.8;font-weight:550;min-width:auto}" +

      ".fh12-readout{font-size:.92rem;margin:.5rem 0 .25rem}" +
      "@media (max-width:520px){.fh12-picker-lbl{min-width:100%;padding-top:0}}";
    (document.head || document.documentElement).appendChild(style);
  }

  function ensureHost() {
    var card = document.getElementById("section-hero");
    if (!card) return null;
    var wrap = document.getElementById("fh12-consistency");
    if (!wrap) {
      wrap = document.createElement("section");
      wrap.id = "fh12-consistency";
      wrap.setAttribute("aria-label", "Consistency and Hardcore mode");
      var head = card.querySelector(".card-head");
      if (head && head.nextSibling) card.insertBefore(wrap, head.nextSibling);
      else card.appendChild(wrap);
    }
    return wrap;
  }

  function openCategory() {
    var button = document.querySelector && document.querySelector('[data-tab="hardcore"]');
    if (button && typeof button.click === "function") button.click();
    var section = document.getElementById("section-progress");
    try { if (section && typeof section.scrollIntoView === "function") section.scrollIntoView({ behavior:"smooth", block:"start" }); } catch (_) {}
  }

  function historyMarkup(data) {
    if (!data.history.length) return '<p class="fh12-help">No completed Hardcore runs yet.</p>';
    return '<div class="fh12-history">' + data.history.map(function (row) {
      var outcome = row.missedDay ? "Missed " + row.missedDay : row.endReason;
      var revived = (Number(row.revivedCount) || 0) > 0
        ? '<br><span class="fh12-revived">restored once before</span>' : "";
      return '<div class="fh12-history-row"><div><b>' + esc(row.requirement.label) + '</b><br><span>' +
        esc(row.startDay) + " · " + esc(outcome) + '</span>' + revived + '</div>' +
        '<div class="fh12-history-right"><b>' + row.daysSurvived + " day" +
        (row.daysSurvived === 1 ? "" : "s") + "</b>" +
        '<button type="button" class="fh12-pill ghost fh12-revive" data-fh12="revive" data-v="' +
        esc(String(row.id)) + '">Revive run</button></div></div>';
    }).join("") + "</div>";
  }

  function renderCategory() {
  /* THE LATE START CARD.

     Deliberately states the cost as well as the offer. It shows how many uses
     remain and refuses with a reason rather than a dead button, because a
     control that silently does nothing teaches you to distrust it. */
  function lateStartCard(today) {
    var info = null, hasRun = false, nextPrev = null;
    try {
      info = window.lateStartInfoFor(today);
      nextPrev = window.lateStartNextDayPreview(today);
      hasRun = (window.FH_HARDCORE ? window.FH_HARDCORE.runs() : []).length > 0;
    } catch (_) {}

    if (info) {
      return '<div class="fh12-category-card"><h4>Late start · today runs ' + esc(info.label) +
        ' to ' + esc(info.label) + ' tomorrow</h4>' +
        '<p>A full 24 hours from when you woke, requirement unchanged.</p>' +
        (nextPrev ? '<p class="fh12-latenote">Tomorrow then runs ' + esc(nextPrev.from) +
          ' to midnight — about ' + nextPrev.hours + ' hours. It still counts as its own day. ' +
          'Set another late start tomorrow if you want it to be a full 24 hours too.</p>' : '') +
        '<div class="fh12-category-actions">' +
        '<button type="button" data-fh12="latestart-clear">Clear late start</button></div></div>';
    }

    var d = ensureDraft();
    var mins = draftMinutes(d);
    var label = draftLabel(d);
    var tomorrowHours = Math.round(((1440 - mins) / 60) * 10) / 10;

    /* The one structural check left: 12:00 AM is not a late start, it is an
       ordinary day. Shown as a disabled button with the reason rather than a
       live button that silently refuses - which is what it did when the clock
       happened to be just past midnight and the picker defaulted there. */
    var check = null;
    try { check = window.canDeclareLateStart(mins); } catch (_) {}
    var blocked = (check && !check.ok)
      ? (mins === 0 ? "12:00 AM is just a normal day — pick the time you actually woke up."
                    : check.message)
      : "";

    var hours = "";
    var order = [12,1,2,3,4,5,6,7,8,9,10,11];
    for (var i = 0; i < order.length; i++) hours += pill("ls-hour", order[i], String(order[i]), d.hour12 === order[i]);
    var minutes = "";
    [0, 15, 30, 45].forEach(function (m) {
      minutes += pill("ls-min", m, ":" + String(m).padStart(2, "0"), d.min === m);
    });
    var meridiem = pill("ls-ampm", "am", "AM", !d.pm) + pill("ls-ampm", "pm", "PM", d.pm);

    return '<div class="fh12-category-card"><h4>Woke up late?</h4>' +
      '<p>Set when today actually started. Today then runs a full 24 hours from there, with the ' +
      'requirement unchanged. Set it whenever you like — it is your call.</p>' +
      (hasRun ? "" : '<p class="fh12-latenote">No Hardcore run is going right now. Setting this still records ' +
        'today\'s window, so a run you start today is judged on it.</p>') +
      '<div class="fh12-picker">' +
        '<div class="fh12-picker-row"><span class="fh12-picker-lbl">Hour</span><div class="fh12-pills grid">' + hours + '</div></div>' +
        '<div class="fh12-picker-row"><span class="fh12-picker-lbl">Minutes</span><div class="fh12-pills">' + minutes + '</div></div>' +
        '<div class="fh12-picker-row"><span class="fh12-picker-lbl">AM / PM</span><div class="fh12-pills">' + meridiem +
          '<button type="button" class="fh12-pill ghost" data-fh12="ls-now">Use current time</button></div></div>' +
      '</div>' +
      '<p class="fh12-readout">Today would run <b>' + esc(label) + '</b> → <b>' + esc(label) + ' tomorrow</b></p>' +
      (blocked ? '' :
        '<p class="fh12-latenote">Tomorrow would then run ' + esc(label) + ' to midnight — about ' +
        tomorrowHours + ' hours — and still count as its own day. Set another late start tomorrow ' +
        'if you want that one to be 24 hours too.</p>') +
      (blocked ? '<p class="fh12-latenote fh12-blocked">' + esc(blocked) + '</p>' : '') +
      '<div class="fh12-category-actions">' +
      '<button type="button" data-fh12="latestart-set"' + (blocked ? " disabled" : "") +
      '>Set today\'s start · ' + esc(label) + '</button></div></div>';
  }

    var root = document.getElementById("fh12-hardcore-panel");
    if (!root) return;
    var read = readHardcore();
    var streak = streakInfo();
    if (!read.ok) {
      root.innerHTML = '<div class="fh12-category-card fh12-error">' + esc(read.reason) +
        " Nothing was changed. Use Recovery Center before starting a run.</div>";
      return;
    }
    var data = read.data;
    var best = bestRun(data);
    var live = runsOf(data);
    var today = hcActiveDay();
    var audits = live.map(function (run) { return auditRun(run, today); });
    var currentDays = audits.reduce(function (top, audit, i) {
      var days = audit && audit.ok ? audit.daysSurvived : (live[i].daysSurvived || 0);
      return Math.max(top, days);
    }, 0);
    var header = '<div class="fh12-category-head"><div><h3>Hardcore progress</h3><p>A separate consistency challenge. It never changes your ordinary streak.</p></div><span class="fh12-badge' +
      (live.length ? ' live">' + (live.length === 1 ? "Active" : live.length + " running") : '">Off') + "</span></div>";
    var stats = '<div class="fh12-stat-grid"><div class="fh12-stat"><b>' +
      currentDays + '</b><span>' + (live.length > 1 ? "Longest live run" : "Current run") + '</span></div><div class="fh12-stat"><b>' +
      best + '</b><span>Hardcore best</span></div><div class="fh12-stat"><b>' + streak.current +
      '</b><span>Normal streak</span></div></div>';

    /* One card per run. Each carries its own requirement, its own start day,
       its own progress bar and its own End button, because ending one must
       never touch the others. */
    var body = live.map(function (run, i) {
      var progress = progressOn(today, run.requirement);
      var unit = run.requirement.type === "minutes" ? "m" : null;
      var have = progress.have + (unit || (" session" + (progress.have === 1 ? "" : "s")));
      var need = progress.need + (unit || (" session" + (progress.need === 1 ? "" : "s")));
      var days = audits[i] && audits[i].ok ? audits[i].daysSurvived : (run.daysSurvived || 0);
      var lateNote = "";
      if (progress.window) {
        var w = progress.window;
        var stillYesterday = today !== dayKey();
        lateNote = '<p class="fh12-latenote">' + (w.late
          ? (stillYesterday
              ? 'Still on ' + esc(today) + '. That late start runs until ' +
                esc(window.fmtClock12(w.startMin)) + ' this morning, so the clock has not rolled over ' +
                'yet and this progress still counts toward it.'
              : 'Late start — today runs ' + esc(window.fmtClock12(w.startMin)) + ' to ' +
                esc(window.fmtClock12(w.startMin)) + ' tomorrow. Full 24 hours, full requirement.')
          : 'Day after a late start — today runs ' + esc(window.fmtClock12(w.startMin)) +
            ' to midnight, about ' + (Math.round(w.hours * 10) / 10) + ' hours.') + '</p>';
      }
      var paused = audits[i] && audits[i].ok ? !!audits[i].paused : false;
      var missedPaused = (audits[i] && audits[i].ok && audits[i].missedWhilePaused) || [];
      var pausedNote = paused
        ? '<p class="fh12-latenote"><b>Paused.</b> Days are still counted, but a missed one will not end the ' +
          'run — only ending it yourself does. Meet the bar and the day still counts.</p>'
        : "";
      if (missedPaused.length) {
        pausedNote += '<p class="fh12-latenote">' + missedPaused.length + ' missed day' +
          (missedPaused.length === 1 ? "" : "s") + ' while paused' +
          (paused ? "" : " — the run survived them") + '.</p>';
      }
      return '<div class="fh12-category-card"><h4>' + esc(run.requirement.label) +
        (paused ? ' <span class="fh12-pausetag">Paused</span>' : '') + '</h4><p><b>' +
        days + ' day' + (days === 1 ? "" : "s") + ' survived</b> · started ' + esc(run.startDay) + '</p>' +
        '<p>' + have + " of " + need + ' today</p>' + lateNote + pausedNote +
        '<div class="fh12-progress"><i style="width:' + progress.pct + '%"></i></div>' +
        '<div class="fh12-category-actions">' +
        '<button type="button" data-fh12="' + (paused ? "resume" : "pause") + '" data-run="' + esc(run.id) + '">' +
        (paused ? "Resume run" : "Pause run") + '</button>' +
        '<button type="button" class="fh12-danger" data-fh12="end" data-run="' +
        esc(run.id) + '">End this run</button></div></div>';
    }).join("");

    /* Always offered. The old version only drew this when a run was already
       going, which meant the morning you woke late - before starting anything -
       was exactly when you could not reach it. */
    body += lateStartCard(today);
    if (live.length) {
      body += '<div class="fh12-category-card"><p>Automatic calendar review is on. Life XP checks once when a new local day begins or when you return to the app. Each run is judged on its own requirement; missing one ends only that run.</p></div>';
    }
    if (live.length < MAX_CONCURRENT_RUNS) {
      var available = PRESETS.filter(function (preset) {
        return !live.find(function (run) { return run.requirementLock === requirementLock(preset); });
      });
      body += '<div class="fh12-category-card"><h4>' + (live.length ? "Start another run" : "Start a new run") +
        '</h4><p>' + (live.length
          ? "It runs alongside the " + live.length + " you already have, with its own requirement and its own day count."
          : "Choose one daily requirement. It stays locked until the run ends. A missed completed day ends only Hardcore.") +
        '</p><div class="fh12-category-actions">' + (available.length
          ? available.map(function (preset) {
              return '<button type="button" data-fh12="start" data-preset="' + preset.id + '">' + esc(preset.label) + "</button>";
            }).join("")
          : "<p>Every preset requirement already has a run going.</p>") + "</div></div>";
    } else {
      body += '<div class="fh12-category-card"><p>You have the maximum of ' + MAX_CONCURRENT_RUNS +
        ' runs going. End one to start another.</p></div>';
    }

    root.innerHTML = header + stats + body + '<div class="fh12-category-card"><h4>Run history</h4>' + historyMarkup(data) + "</div>";
    bindActionRoot(root);
  }

  async function handleAction(event, root) {
    var button = event.target && event.target.closest ? event.target.closest("[data-fh12]") : null;
    if (!button || !root.contains(button)) return;
    if (event.isTrusted === false) return;
    var action = button.getAttribute("data-fh12");
    if (action === "open") {
      openCategory();
      return;
    }
    if (action === "start") {
      var preset = presetById(button.getAttribute("data-preset"));
      if (!preset) return;
      if (!window.confirm('Start Hardcore at "' + preset.label + '"?\n\nThis requirement is locked for the run.')) return;
      button.disabled = true;
      try {
        var started = await start(preset.id);
        if (!started.ok) toast(started.reason, "bad");
      } finally { button.disabled = false; }
    } else if (action === "end") {
      /* The button names the run it belongs to, so with several going you
         cannot end the wrong one by pressing the nearest End. */
      var runId = button.getAttribute("data-run") || null;
      var runs = window.FH_HARDCORE ? window.FH_HARDCORE.runs() : [];
      var target = runId ? runs.find(function (r) { return r.id === runId; }) : null;
      var which = target ? '"' + target.requirement.label + '"' : "this Hardcore run";
      if (!window.confirm("End " + which + "?\n\nIts result stays in Hardcore history. Your other runs are not affected.")) return;
      button.disabled = true;
      try {
        var ended = runId ? await end(runId, "ended by you") : await end("ended by you");
        if (!ended.ok) toast(ended.reason, "bad");
      } finally { button.disabled = false; }
    } else if (action === "pause" || action === "resume") {
      var pid = button.getAttribute("data-run") || null;
      if (action === "pause" && !window.confirm(
            "Pause this Hardcore run?\n\nDays keep being counted, but a missed one will NOT end the run — " +
            "it is just recorded as a missed day. Only ending the run ends it.\n\nA paused day you do meet " +
            "still counts as survived.")) return;
      button.disabled = true;
      try {
        var r = action === "pause" ? await pauseRun(pid) : await resumeRun(pid);
        if (!r.ok) toast(r.reason, "bad");
        else toast(action === "pause" ? "Run paused — a missed day will not end the run."
                                      : "Run resumed — a missed day ends the run again.",
                   action === "pause" ? "info" : "good");
      } finally { button.disabled = false; }
    } else if (action === "revive") {
      var rid = button.getAttribute("data-v");
      if (!window.confirm(
            "Revive this run?\n\nIt carries on from where it stopped. The day it ended on is " +
            "excused - it is not counted as a day you completed, it just stops ending the run.\n\n" +
            "Use this when you believe the app got that day wrong.")) return;
      button.disabled = true;
      try {
        var rv = await reviveRun(rid);
        if (!rv.ok) toast(rv.reason, "bad");
      } finally { button.disabled = false; }
    } else if (action === "ls-hour" || action === "ls-min" || action === "ls-ampm" || action === "ls-now") {
      var dr = ensureDraft();
      var v = button.getAttribute("data-v");
      if (action === "ls-hour") dr.hour12 = parseInt(v, 10) || 12;
      else if (action === "ls-min") dr.min = parseInt(v, 10) || 0;
      else if (action === "ls-ampm") dr.pm = (v === "pm");
      else lateDraft = draftNow();
      renderPanelSafe();
      return;
    } else if (action === "latestart-set") {
      var dr2 = ensureDraft();
      var mins = draftMinutes(dr2);
      var raw = draftLabel(dr2);
      if (!isFinite(mins)) { toast("Pick the time your day started.", "warn"); return; }
      /* Check BEFORE asking, so a refusal explains itself instead of arriving
         after you have already agreed to something. */
      var check = null;
      try { check = window.canDeclareLateStart(mins); } catch (_) {}
      if (check && !check.ok) { toast(check.message, "warn"); return; }
      if (!window.confirm("Count today as starting " + raw + "?\n\nToday runs " + raw + " to " + raw +
                          " tomorrow — a full 24 hours, same requirement.\n\nTomorrow then runs " + raw +
                          " to midnight and still counts as its own day.")) return;
      button.disabled = true;
      try { window.declareLateStart(mins); } finally { button.disabled = false; }
    } else if (action === "latestart-clear") {
      lateDraft = null;
      if (!window.confirm("Clear today's late start?\n\nToday goes back to a normal midnight-to-midnight day.")) return;
      try { window.clearLateStart(); } catch (_) {}
    } else if (action === "conflict-keep-local" || action === "conflict-keep-peer") {
      var keepPeer = action === "conflict-keep-peer";
      if (!window.confirm(keepPeer
        ? "Continue your other device's hardcore run?\n\nThis device's run is archived as a run summary, not deleted."
        : "Continue this device's hardcore run?\n\nThe other device's run is archived as a run summary, not deleted.")) return;
      button.disabled = true;
      try {
        var resolved = resolveMergeConflict(keepPeer ? "peer" : "local");
        if (!resolved.ok) toast(resolved.reason, "bad");
      } finally { button.disabled = false; }
    }
  }

  function conflictCss() {
    return ".fh12-conflict{margin-top:10px;line-height:1.5}" +
      ".fh12-conflict b{display:block;margin-bottom:4px}" +
      ".fh12-conflict .fh12-actions{margin-top:10px;display:flex;gap:8px;flex-wrap:wrap}";
  }

  function bindActionRoot(root) {
    root.onclick = function (event) {
      void handleAction(event, root).catch(function (error) {
        toast(cleanText(error && error.message, "Hardcore action failed safely.", 180), "bad");
      });
    };
  }

  function render() {
    var state = S();
    if (!state || !document) return;
    injectCss();
    var wrap = ensureHost();
    if (!wrap) {
      renderCategory();
      return;
    }
    var read = readHardcore();
    var streak = streakInfo();
    if (!read.ok) {
      wrap.innerHTML = '<div class="fh12-summary"><div class="fh12-copy"><b>Consistency</b>' +
        '<span>Normal streak ' + streak.current + 'd · best ' + streak.longest + 'd</span></div>' +
        '<span class="fh12-badge">Unavailable</span></div><div class="fh12-error">' + esc(read.reason) +
        " Nothing was changed. Use Recovery Center before starting a run.</div>";
      renderCategory();
      return;
    }

    var data = read.data;
    var html = "";
    var live = runsOf(data);
    if (live.length) {
      var today = hcActiveDay();
      /* The summary line reports every run, so a second one is never
         invisible from the focus screen. The End button here only appears
         when there is exactly one run to end - with several, ending has to
         happen against a named run in the panel. */
      var rows = live.map(function (run) {
        var audit = auditRun(run, today);
        var progress = progressOn(today, run.requirement);
        var days = audit.ok ? audit.daysSurvived : run.daysSurvived;
        var unit = run.requirement.type === "minutes" ? "m" : "";
        var status = audit.ok && audit.ended ? "Missed " + audit.missedDay + " — record result" :
          progress.have + unit + " / " + progress.need + unit + " today";
        return { run:run, days:days, progress:progress, status:status };
      });
      var lead = rows.reduce(function (top, row) { return row.days > top.days ? row : top; }, rows[0]);
      var headline = live.length === 1
        ? "Hardcore · " + lead.days + " day" + (lead.days === 1 ? "" : "s") + " survived"
        : "Hardcore · " + live.length + " runs · best " + lead.days + " day" + (lead.days === 1 ? "" : "s");
      html = '<div class="fh12-summary"><div class="fh12-copy"><b>' + esc(headline) + "</b>" +
        rows.map(function (row) {
          return "<span>" + esc(row.run.requirement.label) + " · " +
            (live.length > 1 ? row.days + "d · " : "locked · ") + esc(row.status) +
            '</span><div class="fh12-progress"><i style="width:' + row.progress.pct + '%"></i></div>';
        }).join("") +
        '</div><span class="fh12-badge live">' + (live.length === 1 ? "Active" : live.length + " running") + "</span></div>" +
        '<div class="fh12-actions"><button type="button" data-fh12="open">View progress</button>' +
        (live.length === 1
          ? '<button type="button" class="fh12-danger" data-fh12="end" data-run="' + esc(live[0].id) + '">End run</button>'
          : "") +
        '<span class="fh12-help">Normal streak remains separate: ' + streak.current + "d · best " + streak.longest + "d.</span></div>";
    } else {
      var best = bestRun(data);
      html = '<div class="fh12-summary"><div class="fh12-copy"><b>Consistency</b><span>Normal streak ' +
        streak.current + "d · best " + streak.longest + "d" + (best ? " · Hardcore best " + best + "d" : "") +
        '</span></div><span class="fh12-badge">Hardcore off</span><button type="button" data-fh12="open">Open</button></div>';
    }
    /* v10.17.1: a quarantined merge is stated plainly and resolved by hand.
       Both buttons are lossless: whichever run you do not keep is archived as a
       run summary, never deleted, and the other device converges on your
       choice at the next sync. */
    var conflict = state.fh12HardcoreConflict;
    if (conflict && typeof conflict === "object") {
      html += '<div class="fh12-error fh12-conflict">' +
        "<b>This device and your other device disagree about the hardcore run.</b> " +
        "Everything else — your hours, sessions and loot — is syncing normally. " +
        "Nothing has been deleted; pick which run continues and the other becomes a run summary." +
        '<div class="fh12-actions"><button type="button" data-fh12="conflict-keep-local">Keep this device\u2019s run</button>' +
        '<button type="button" data-fh12="conflict-keep-peer">Keep the other device\u2019s run</button></div></div>';
    }
    wrap.innerHTML = html;
    bindActionRoot(wrap);
    renderCategory();
  }

  /* Resolve a quarantined hardcore merge. Whichever side is not chosen has its
     active run archived into the shared history rather than dropped, so the run
     you did not keep still shows up as a completed summary. */
  function resolveMergeConflict(keep) {
    var state = S();
    if (!state) return { ok: false, reason: "no state" };
    var conflict = state.fh12HardcoreConflict;
    if (!conflict || typeof conflict !== "object") return { ok: false, reason: "nothing to resolve" };

    var mine = normalizeHardcoreForMerge(state[FIELD]);
    var theirs = normalizeHardcoreForMerge(conflict.peer);
    var chosen = keep === "peer" ? theirs : mine;
    var other = keep === "peer" ? mine : theirs;
    if (!chosen) return { ok: false, reason: "that copy could not be read" };

    var next = clone(chosen.value);
    var history = next.history.slice();
    var archivedId = null;
    if (other) {
      /* Fold in every run summary the other copy knows about... */
      var seen = Object.create(null);
      history.forEach(function (row) { seen[row.id] = true; });
      /* The run we are keeping is never also archived. When both copies describe
         the SAME run id with divergent identity there is nothing to archive at
         all - it is one run written down two ways, not two runs. */
      if (next.active && next.run) seen[next.run.id] = true;
      other.value.history.forEach(function (row) { if (!seen[row.id]) { seen[row.id] = true; history.push(clone(row)); } });
      /* ...and archive its active run, if it had one we are not keeping. */
      if (other.value.active && other.value.run && !seen[other.value.run.id]) {
        var loser = clone(other.value.run);
        loser.daysSurvived = verifiedRunDays(other.rawRun, other.value.run);
        delete loser.reinstatedAt;
        loser.endedAt = Math.max(
          finiteInt(loser.startedAt, 0, 0, Number.MAX_SAFE_INTEGER),
          finiteInt(loser.lastCheckedAt, 0, 0, Number.MAX_SAFE_INTEGER),
          finiteInt(next.run && next.run.startedAt, 0, 0, Number.MAX_SAFE_INTEGER)
        ) + 1;
        loser.endReason = "superseded — you kept the other device's run";
        loser.missedDay = null;
        history.push(loser);
        archivedId = loser.id;
      }
    }
    next.history = sortHistory(history);
    if (next.active && next.run) next.daysSurvived = verifiedRunDays(chosen.rawRun, next.run);

    state[FIELD] = next;
    state.fh12HardcoreConflict = null;
    try { if (typeof window.saveState === "function") window.saveState(); } catch (_) {}
    try { render(); } catch (_) {}
    toast(next.active && next.run
      ? "Hardcore resolved — keeping the run with " + (next.run.daysSurvived || 0) + " day" +
        ((next.run.daysSurvived || 0) === 1 ? "" : "s") + " survived." +
        (archivedId ? " The other run was archived as a summary." : "")
      : "Hardcore resolved — no run is active." + (archivedId ? " The other run was archived as a summary." : ""),
      "good");
    return { ok: true, active: !!next.active, archivedRunId: archivedId };
  }

  function toast(message, kind) {
    try { if (typeof window.toast === "function") window.toast(message, kind); } catch (_) {}
  }

  window.FH_HARDCORE = Object.freeze({
    presets: function () { return clone(PRESETS); },
    state: function () {
      var read = readHardcore();
      return read.ok ? clone(read.data) : { error: read.reason };
    },
    status: function () {
      var read = readHardcore();
      if (!read.ok) return { ok: false, reason: read.reason };
      var live = runsOf(read.data);
      if (!live.length) return { ok: true, active: false, runs: [], best: bestRun(read.data) };
      var today = hcActiveDay();
      var rows = live.map(function (run) {
        return Object.assign({ id: run.id, requirement: clone(run.requirement) }, clone(auditRun(run, today)));
      });
      /* The first run's fields stay at the top level so anything written
         against the single-run API keeps reading the same shape - including
         the quirk that the audit's own `active` (did it survive?) lands on
         top of the outer one (is a run configured?). That was the shape
         before and callers depend on it, so `runCount` is added rather than
         the old field quietly changing meaning. */
      return Object.assign({ active: true, runs: rows, runCount: rows.length }, rows[0]);
    },
    runs: function () {
      var read = readHardcore();
      if (!read.ok) return [];
      var today = hcActiveDay();
      return runsOf(read.data).map(function (run) {
        return { id: run.id, startDay: run.startDay, requirement: clone(run.requirement),
                 audit: clone(auditRun(run, today)) };
      });
    },
    activeDay: function () { return hcActiveDay(); },
    calendarDay: function () { return dayKey(); },
    activeDayDiffers: function () { return hcCalendarDayDiffers(); },
    windowFor: function (day) { var w = lateWindow(day); return w ? clone(w) : null; },
    maxConcurrentRuns: MAX_CONCURRENT_RUNS,
    start: start,
    end: end,
    /* Read-only: what this day's own window credits. Exported so the
       conservation invariant - every logged minute counted once, by exactly
       one day - can actually be asserted instead of assumed. */
    minutesOn: function (day) { return validDay(day) ? minutesOn(String(day)) : 0; },
    pause: pauseRun,
    resume: resumeRun,
    revive: reviveRun,
    __revivePlan: revivePlan,
    isPaused: function (runId) {
      var read = readHardcore();
      if (!read.ok) return false;
      var t = findRun(runsOf(read.data), runId);
      return !!(t && isPausedNow(t));
    },
    setRequirement: setRequirement,
    evaluate: evaluate,
    evaluateAutomatically: evaluateAutomatically,
    merge: mergeHardcoreState,
    deferGraceDays: DEFER_GRACE_DAYS,
    __deferralExpired: deferralExpired,
    resolveMergeConflict: resolveMergeConflict,
    streak: streakInfo,
    /* With several runs going, "did today qualify?" has to name a run.
       Called without one it answers for the first, exactly as before. */
    qualifies: function (day, runId) {
      var read = readHardcore();
      if (!read.ok) return false;
      var when = day || dayKey();
      if (!validDay(when)) return false;
      var live = runsOf(read.data);
      var run = runId ? live.find(function (r) { return r.id === runId; }) : live[0];
      return !!(run && progressOn(when, run.requirement).qualifies);
    },
    qualifiesAll: function (day) {
      var read = readHardcore();
      if (!read.ok) return [];
      var when = day || dayKey();
      if (!validDay(when)) return [];
      return runsOf(read.data).map(function (run) {
        return { id: run.id, label: run.requirement.label,
                 qualifies: progressOn(when, run.requirement).qualifies };
      });
    },
    progress: function (day, runId) {
      var read = readHardcore();
      if (!read.ok) return null;
      var when = day || dayKey();
      if (!validDay(when)) return null;
      var live = runsOf(read.data);
      var run = runId ? live.find(function (r) { return r.id === runId; }) : live[0];
      return run ? clone(progressOn(when, run.requirement)) : null;
    },
    render: render,
    renderCategory: renderCategory
  });

  /* Off remains read-only. An explicitly active run is evaluated through the
     app's verified durable boundary before its next calendar-day UI renders. */
  function boot() {
    var tries = 0;
    (function waitForState() {
      if (S() && Array.isArray(S().tasks)) {
        bindAutomaticLifecycle();
        try { render(); } catch (_) {}
        void evaluateAutomatically("primary-ready");
        return;
      }
      if (tries++ < 60) setTimeout(waitForState, 250);
    })();
  }
  if (typeof window.FH_onPrimaryReady === "function") window.FH_onPrimaryReady(boot);
  else if (document.readyState === "complete") boot();
  else window.addEventListener("load", boot, { once: true });
})();

/* asset content-type refresh — v10.32.0 */
