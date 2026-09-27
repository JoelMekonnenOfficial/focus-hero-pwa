/* ================================================================
 * Life XP — GAMEPLAY CONTROLS (v13 candidate, 2026-08-17)
 *
 * Pure helpers for three user-facing controls that cross accounting and
 * sync boundaries:
 *   1. Stand Still is a real peaceful action, but uses Rest's existing
 *      reward table so selecting a visual pose cannot invent a new economy.
 *   2. Recovery Pause protects a bounded number of calendar days from
 *      conditioning degradation. It never creates workout credit or rewards.
 *   3. Equipment changes are planned immutably so the host can save first
 *      and render only after success, including an explicit null unequip.
 *
 * This module is passive. It does not read application state, touch the DOM,
 * use storage/network APIs, generate IDs, or install event listeners.
 * ================================================================ */
(function installFocusHeroGameplayControls(global) {
  "use strict";

  if (global.FH_GAMEPLAY_CONTROLS) return;

  var IDLE_ACTION = Object.freeze({
    id:"Idle",
    label:"Stand Still",
    sym:"Ⅱ",
    scene:"idle",
    burstMs:0,
    motionless:true,
    peaceful:true,
    rewardSource:"Rest",
    requiredForAllActions:false
  });
  var EQUIP_SLOTS = Object.freeze(["weapon","helmet","armor","mount","pet"]);
  var RECOVERY_VERSION = 1;
  var MAX_RECOVERY_DAYS = 14;
  var RECOVERY_PRESETS = Object.freeze([1, 3, 7, 14]);
  var RECOVERY_REASONS = Object.freeze(["soreness","recovery","injury","medical_rest"]);

  function own(value, key) {
    return !!value && Object.prototype.hasOwnProperty.call(value, key);
  }

  function clonePlain(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    var out = {};
    Object.keys(value).forEach(function (key) { out[key] = value[key]; });
    return out;
  }

  function stable(value) {
    if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
    if (value && typeof value === "object") {
      return "{" + Object.keys(value).sort().map(function (key) {
        return JSON.stringify(key) + ":" + stable(value[key]);
      }).join(",") + "}";
    }
    return JSON.stringify(value);
  }

  /* ---------- Stand Still action ------------------------------ */

  function normalizeGameplayAction(value) {
    var raw = String(value == null ? "" : value).trim();
    var lower = raw.toLowerCase().replace(/[\s_-]+/g, " ");
    if (lower === "idle" || lower === "stand still" || lower === "standing") return "Idle";
    return raw;
  }

  function extendActionList(actions) {
    var source = Array.isArray(actions) ? actions : [];
    var out = source.filter(function (action) {
      return normalizeGameplayAction(action && (action.id || action.label)) !== "Idle";
    }).map(function (action) { return clonePlain(action); });
    out.push(clonePlain(IDLE_ACTION));
    return out;
  }

  function rewardSourceForAction(action) {
    return normalizeGameplayAction(action) === "Idle" ? "Rest" : String(action == null ? "" : action);
  }

  function requiredAchievementActions(actions) {
    return extendActionList(actions).filter(function (action) {
      return action.requiredForAllActions !== false;
    });
  }

  /* ---------- Transactional equipment planning ---------------- */

  function planEquipmentChange(equipped, slot, nextItem) {
    slot = String(slot || "");
    if (EQUIP_SLOTS.indexOf(slot) < 0) return { ok:false, reason:"invalid_slot", slot:slot };
    var source = equipped && typeof equipped === "object" && !Array.isArray(equipped) ? equipped : {};
    var before = own(source, slot) && source[slot] && typeof source[slot] === "object"
      ? clonePlain(source[slot]) : null;
    var next = nextItem && typeof nextItem === "object" && !Array.isArray(nextItem)
      ? clonePlain(nextItem) : null;
    var target = {};
    Object.keys(source).forEach(function (key) {
      target[key] = source[key] && typeof source[key] === "object" && !Array.isArray(source[key])
        ? clonePlain(source[key]) : source[key];
    });
    target[slot] = next ? clonePlain(next) : null;
    return {
      ok:true,
      slot:slot,
      operation:next ? "equip" : "unequip",
      before:before,
      next:next,
      target:target,
      changed:stable(before) !== stable(next)
    };
  }

  /* ---------- Recovery Pause ---------------------------------- */

  function dayOrdinal(value) {
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
    if (!match) return null;
    var year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    var stamp = Date.UTC(year, month - 1, day);
    var date = new Date(stamp);
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return Math.floor(stamp / 86400000);
  }

  function dayFromOrdinal(ordinal) {
    return new Date(Number(ordinal) * 86400000).toISOString().slice(0, 10);
  }

  function eventId(value) {
    var id = String(value || "").trim();
    return /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,95}$/.test(id) ? id : "";
  }

  function normalizeRecoveryEvent(row, mapKey) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return null;
    var id = eventId(row.id || mapKey);
    var type = row.type === "start" || row.type === "end" ? row.type : "";
    var at = Number(row.at);
    var day = dayOrdinal(row.day) == null ? "" : String(row.day);
    if (!id || !type || !Number.isSafeInteger(at) || at <= 0 || !day) return null;
    if (type === "start") {
      var days = Number(row.days);
      if (!Number.isSafeInteger(days) || days < 1 || days > MAX_RECOVERY_DAYS) return null;
      var reason = RECOVERY_REASONS.indexOf(row.reason) >= 0 ? row.reason : "recovery";
      return { id:id, type:type, at:at, day:day, days:days, reason:reason };
    }
    var targetId = eventId(row.targetId);
    if (!targetId) return null;
    return { id:id, type:type, at:at, day:day, targetId:targetId };
  }

  function normalizeRecoveryState(value) {
    var source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    var rows = source.events && typeof source.events === "object" && !Array.isArray(source.events) ? source.events : {};
    var events = {};
    Object.keys(rows).sort().forEach(function (key) {
      var row = normalizeRecoveryEvent(rows[key], key);
      if (row) events[row.id] = row;
    });
    return { version:RECOVERY_VERSION, events:events };
  }

  function mergeRecoveryState(localValue, remoteValue) {
    var local = normalizeRecoveryState(localValue);
    var remote = normalizeRecoveryState(remoteValue);
    var events = {};
    var ids = Object.keys(local.events).concat(Object.keys(remote.events)).filter(function (id, index, all) {
      return all.indexOf(id) === index;
    }).sort();
    ids.forEach(function (id) {
      var a = local.events[id], b = remote.events[id];
      if (a && b && stable(a) !== stable(b)) {
        var error = new Error("Recovery event conflict: " + id);
        error.code = "FH_RECOVERY_EVENT_CONFLICT";
        throw error;
      }
      events[id] = clonePlain(a || b);
    });
    return { version:RECOVERY_VERSION, events:events };
  }

  function recoveryIntervals(value) {
    var recovery = normalizeRecoveryState(value);
    var starts = Object.keys(recovery.events).map(function (id) { return recovery.events[id]; })
      .filter(function (event) { return event.type === "start"; });
    var ends = Object.keys(recovery.events).map(function (id) { return recovery.events[id]; })
      .filter(function (event) { return event.type === "end"; });
    return starts.map(function (start) {
      var from = dayOrdinal(start.day);
      var through = from + start.days - 1;
      ends.filter(function (end) { return end.targetId === start.id; }).forEach(function (end) {
        through = Math.min(through, dayOrdinal(end.day) - 1);
      });
      return {
        id:start.id,
        reason:start.reason,
        from:from,
        through:through,
        startDay:start.day,
        throughDay:through >= from ? dayFromOrdinal(through) : start.day,
        active:through >= from
      };
    }).filter(function (interval) { return interval.active; })
      .sort(function (a, b) { return a.from - b.from || (a.id < b.id ? -1 : 1); });
  }

  function deriveRecoveryStatus(value, today) {
    var todayOrd = dayOrdinal(today);
    if (todayOrd == null) return { valid:false, active:false, protectedDays:[], protectedDayCount:0, intervals:[] };
    var intervals = recoveryIntervals(value);
    var ordinals = {};
    intervals.forEach(function (interval) {
      var through = Math.min(todayOrd, interval.through);
      for (var ordinal = interval.from; ordinal <= through; ordinal++) ordinals[ordinal] = true;
    });
    var activeIntervals = intervals.filter(function (interval) {
      return interval.from <= todayOrd && interval.through >= todayOrd;
    });
    var protectedDays = Object.keys(ordinals).map(Number).sort(function (a, b) { return a - b; }).map(dayFromOrdinal);
    var latestThrough = activeIntervals.reduce(function (max, interval) { return Math.max(max, interval.through); }, -Infinity);
    return {
      valid:true,
      active:activeIntervals.length > 0,
      activeIds:activeIntervals.map(function (interval) { return interval.id; }),
      protectedDays:protectedDays,
      protectedDayCount:protectedDays.length,
      untilDay:Number.isFinite(latestThrough) ? dayFromOrdinal(latestThrough) : null,
      intervals:intervals
    };
  }

  function adjustRestDays(value, rawRestDays, today) {
    var todayOrd = dayOrdinal(today);
    var raw = Math.max(0, Number(rawRestDays) || 0);
    if (todayOrd == null || raw <= 0) return { rawRestDays:raw, protectedRestDays:0, effectiveRestDays:raw };
    var lastWorkoutOrd = todayOrd - raw;
    var protectedOrdinals = {};
    recoveryIntervals(value).forEach(function (interval) {
      var from = Math.max(lastWorkoutOrd + 1, interval.from);
      var through = Math.min(todayOrd, interval.through);
      for (var ordinal = from; ordinal <= through; ordinal++) protectedOrdinals[ordinal] = true;
    });
    var protectedCount = Object.keys(protectedOrdinals).length;
    return {
      rawRestDays:raw,
      protectedRestDays:protectedCount,
      effectiveRestDays:Math.max(0, raw - protectedCount)
    };
  }

  function addRecoveryStart(value, input) {
    input = input && typeof input === "object" ? input : {};
    var recovery = normalizeRecoveryState(value);
    var event = normalizeRecoveryEvent({
      id:input.id, type:"start", at:input.at, day:input.day,
      days:input.days, reason:input.reason
    }, input.id);
    if (!event) return { ok:false, reason:"invalid_start", recovery:recovery };
    if (own(recovery.events, event.id)) return { ok:false, reason:"duplicate_event_id", recovery:recovery };
    if (deriveRecoveryStatus(recovery, event.day).active) return { ok:false, reason:"already_active", recovery:recovery };
    var events = clonePlain(recovery.events);
    events[event.id] = event;
    return { ok:true, event:event, recovery:{ version:RECOVERY_VERSION, events:events } };
  }

  function addRecoveryEnd(value, input) {
    input = input && typeof input === "object" ? input : {};
    var recovery = normalizeRecoveryState(value);
    var status = deriveRecoveryStatus(recovery, input.day);
    var targetId = eventId(input.targetId) || (status.activeIds && status.activeIds[status.activeIds.length - 1]) || "";
    var event = normalizeRecoveryEvent({
      id:input.id, type:"end", at:input.at, day:input.day, targetId:targetId
    }, input.id);
    if (!event) return { ok:false, reason:"invalid_end", recovery:recovery };
    if (!status.active || status.activeIds.indexOf(targetId) < 0) return { ok:false, reason:"not_active", recovery:recovery };
    if (own(recovery.events, event.id)) return { ok:false, reason:"duplicate_event_id", recovery:recovery };
    var events = clonePlain(recovery.events);
    events[event.id] = event;
    return { ok:true, event:event, recovery:{ version:RECOVERY_VERSION, events:events } };
  }

  global.FH_GAMEPLAY_CONTROLS = Object.freeze({
    idleAction:clonePlain(IDLE_ACTION),
    extendActionList:extendActionList,
    normalizeGameplayAction:normalizeGameplayAction,
    rewardSourceForAction:rewardSourceForAction,
    requiredAchievementActions:requiredAchievementActions,
    equipmentSlots:EQUIP_SLOTS.slice(),
    planEquipmentChange:planEquipmentChange,
    recovery:Object.freeze({
      version:RECOVERY_VERSION,
      maxDays:MAX_RECOVERY_DAYS,
      presets:RECOVERY_PRESETS.slice(),
      reasons:RECOVERY_REASONS.slice(),
      normalize:normalizeRecoveryState,
      merge:mergeRecoveryState,
      derive:deriveRecoveryStatus,
      adjustRestDays:adjustRestDays,
      addStart:addRecoveryStart,
      addEnd:addRecoveryEnd
    })
  });
})(typeof window !== "undefined" ? window : globalThis);

/* asset content-type refresh — v10.32.0 */
