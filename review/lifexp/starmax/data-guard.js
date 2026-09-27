/* Life XP — data guard (v10.7.0)
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
 *  2. Reads the verified IndexedDB primary head. The historical localStorage
 *     guard mirror remains untouched recovery material and is never refreshed.
 *  3. On every boot: compares primary state against the guard high-water mark.
 *     If focus minutes collapse or append-only structural data regresses, it
 *     shows a BLOCKING full-screen prompt that routes to the isolated recovery
 *     page. Fail-closed: an unsafe state can never quietly replace protected
 *     snapshots, and recovery never races the live app's cloud workers.
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
  var RESET_INTENT_PREFIX = "focusHero.reset-intent.v1.";
  var DB_NAME = "fh-guard", STORE = "snaps";
  var COLD_DB_NAME = "fh-coldstore", COLD_STORE = "snaps";
  var PRIMARY_DB_NAME = "fh-primary-state-v1";
  var PRIMARY_ACTIVATION = "focusHero.primary.v1.activation";
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
  function uniqueSortedIds(values) {
    var seen = Object.create(null), out = [];
    (values || []).forEach(function (value) {
      var id = typeof value === "string" ? value.trim() : "";
      if (!id || seen[id]) return;
      seen[id] = true;
      out.push(id);
    });
    return out.sort();
  }
  function idsFromObject(raw, prefix, includeValue) {
    if (!plainObject(raw)) return [];
    return Object.keys(raw).filter(function (key) {
      return typeof includeValue === "function" ? includeValue(raw[key], key) : true;
    }).map(function (key) { return String(prefix || "") + key; });
  }
  function worldProgressSummary(state) {
    state = plainObject(state) ? state : {};
    var world = plainObject(state.world) ? state.world : {};
    var quests = plainObject(state.questSystem) ? state.questSystem : {};
    var counters = Object.create(null);
    function put(key, value) { counters[key] = count(value); }
    put("crystalShardsEarned", state.crystalShardsEarned);
    put("crystalShardsSpent", state.crystalShardsSpent);
    put("craftingDust", state.craftingDust);
    put("bossesDefeated", world.bossesDefeated);
    put("mysteryBoxesOpened", world.mysteryBoxesOpened);
    put("dailyClaimedCount", quests.dailyClaimedCount);
    put("weeklyClaimedCount", quests.weeklyClaimedCount);
    put("seasonalClaimedCount", quests.seasonalClaimedCount);
    if (plainObject(world.zonesVisited)) Object.keys(world.zonesVisited).forEach(function (id) {
      put("zoneVisit:" + id, world.zonesVisited[id]);
    });
    if (plainObject(world.questCounters)) Object.keys(world.questCounters).forEach(function (id) {
      put("questCounter:" + id, world.questCounters[id]);
    });
    var unlockIds = uniqueSortedIds(
      idsFromObject(world.unlockedZones, "zone:", function (value) { return !!value; })
        .concat(idsFromObject(world.artifactsFound, "artifact:", function (value) { return value !== null && value !== undefined && value !== false; }))
        .concat(idsFromObject(world.bossSessionRewards, "bossReceipt:", function (value) { return value !== null && value !== undefined; }))
        .concat(idsFromObject(state.achievementsV85, "achievement:", function (value) { return !!value; }))
    );
    var counterKeys = Object.keys(counters).sort();
    var total = counterKeys.reduce(function (sum, key) {
      return Math.min(Number.MAX_SAFE_INTEGER, sum + count(counters[key]));
    }, 0);
    return {
      worldCounters: counters,
      worldCounterTotal: total,
      worldUnlockIds: unlockIds,
      worldUnlocks: unlockIds.length,
      worldRevision: stableSignature(unlockIds.concat(counterKeys.map(function (key) {
        return key + "@" + counters[key];
      })))
    };
  }
  function eggProgressSummary(raw) {
    var eggs = plainObject(raw) ? raw : {};
    var ids = [];
    ["owned", "incubating", "hatched", "quarantined"].forEach(function (bucket) {
      (Array.isArray(eggs[bucket]) ? eggs[bucket] : []).forEach(function (egg) {
        if (egg && typeof egg.id === "string" && egg.id.trim()) ids.push(egg.id.trim());
      });
    });
    ids = uniqueSortedIds(ids);
    return {
      eggIds: ids,
      eggCount: ids.length,
      eggRevision: stableSignature(ids)
    };
  }
  function lootProgressSummary(state) {
    state = plainObject(state) ? state : {};
    var loot = plainObject(state.loot) ? state.loot : {};
    var vault = plainObject(loot.vault) ? loot.vault : {};
    var inventory = plainObject(state.lootInstances) ? state.lootInstances : {};
    var vaultInstances = plainObject(vault.instances) ? vault.instances : {};
    var tombstones = plainObject(loot.instanceTombstones) ? loot.instanceTombstones : {};
    var dropTombstonesRaw = plainObject(loot.dropTombstones) ? loot.dropTombstones : {};
    var sessionTombstonesRaw = plainObject(state.sessionTombstones) ? state.sessionTombstones : {};
    var ids = [], updatedAt = Object.create(null), deletedAt = Object.create(null);
    var dropDeletedAt = Object.create(null), sessionDeletedAt = Object.create(null);
    function addInstances(source) {
      Object.keys(source).forEach(function (iid) {
        var id = String(iid || "").trim();
        if (!id) return;
        ids.push(id);
        var item = source[iid];
        var stamp = Math.max(count(item && item.updatedAt), count(item && item.createdAt));
        updatedAt[id] = Math.max(count(updatedAt[id]), stamp);
      });
    }
    addInstances(inventory);
    addInstances(vaultInstances);
    Object.keys(tombstones).forEach(function (iid) {
      var id = String(iid || "").trim();
      var stamp = count(tombstones[iid]);
      if (id && stamp > 0) deletedAt[id] = stamp;
    });
    Object.keys(dropTombstonesRaw).forEach(function (dropId) {
      var id = String(dropId || "").trim();
      var stamp = count(dropTombstonesRaw[dropId]);
      if (id && stamp > 0) dropDeletedAt[id] = stamp;
    });
    Object.keys(sessionTombstonesRaw).forEach(function (sessionId) {
      var id = String(sessionId || "").trim();
      var stamp = count(sessionTombstonesRaw[sessionId]);
      if (id && stamp > 0) sessionDeletedAt[id] = stamp;
    });
    ids = uniqueSortedIds(ids);
    var tombstoneIds = Object.keys(deletedAt).sort();
    var dropTombstoneIds = Object.keys(dropDeletedAt).sort();
    var sessionTombstoneIds = Object.keys(sessionDeletedAt).sort();
    return {
      lootInstanceIds: ids,
      lootInstanceCount: ids.length,
      lootInstanceUpdatedAt: updatedAt,
      lootInstanceTombstones: deletedAt,
      lootInstanceTombstoneCount: tombstoneIds.length,
      lootDropTombstones: dropDeletedAt,
      lootDropTombstoneCount: dropTombstoneIds.length,
      sessionTombstones: sessionDeletedAt,
      sessionTombstoneCount: sessionTombstoneIds.length,
      lootInstanceRevision: stableSignature(ids.map(function (id) {
        return id + "@" + count(updatedAt[id]);
      }).concat(tombstoneIds.map(function (id) {
        return "deleted:" + id + "@" + deletedAt[id];
      })).concat(dropTombstoneIds.map(function (id) {
        return "drop-deleted:" + id + "@" + dropDeletedAt[id];
      })).concat(sessionTombstoneIds.map(function (id) {
        return "session-deleted:" + id + "@" + sessionDeletedAt[id];
      })))
    };
  }
  function idLookup(ids) {
    var out = Object.create(null);
    (ids || []).forEach(function (id) { if (typeof id === "string" && id) out[id] = true; });
    return out;
  }
  function hasIdLoss(currentIds, protectedIds) {
    var current = idLookup(currentIds);
    return (protectedIds || []).some(function (id) { return !current[id]; });
  }
  function hasNumberMapRegression(current, guard) {
    current = current || {};
    guard = guard || {};
    return Object.keys(guard).some(function (key) { return count(current[key]) < count(guard[key]); });
  }
  /* v10.62.0: a drop in minutes is only evidence of a wipe when nothing
     ACCOUNTS for it. Deliberately removing a skill's logged hours writes a
     reduction receipt into synced state saying how much was taken and why; a
     receipt the guard copy has not seen yet explains exactly that much of the
     loss. Without this the guard could not tell "you deleted two skills on
     purpose" from "your profile was wiped", and shouted WIPE at the user for
     doing something they had just confirmed twice. Anything the receipts do
     not cover is still treated as a wipe, at the same thresholds as before. */
  function reductionEntries(state) {
    var led = plainObject(state) ? state.focusReductions : null;
    var list = (plainObject(led) && Array.isArray(led.entries)) ? led.entries : [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!plainObject(e) || typeof e.id !== "string" || !e.id) continue;
      out.push([e.id.slice(0, 120), count(e.total) + count(e.trackedTotal)]);
    }
    return out;
  }
  function declaredReductionAllowance(current, guard) {
    var mine = (current && current.reductions) || [];
    var theirs = (guard && guard.reductions) || [];
    var seen = {};
    for (var i = 0; i < theirs.length; i++) seen[theirs[i][0]] = true;
    var allowance = 0;
    for (var j = 0; j < mine.length; j++) {
      if (!seen[mine[j][0]]) allowance += count(mine[j][1]);
    }
    return allowance;
  }
  function hasMeaningfulMinuteRegression(currentMinutes, guardMinutes, allowance) {
    var current = count(currentMinutes), guard = count(guardMinutes);
    if (current >= guard) return false;
    var loss = guard - current - Math.max(0, count(allowance));
    if (loss <= 0) return false;
    return loss > Math.max(120, guard * 0.05);
  }
  function profileEpochValue(state) {
    var raw = state && state.profileEpoch;
    if (typeof raw === "string") return raw.trim().slice(0, 256);
    if (plainObject(raw) && typeof raw.id === "string") return raw.id.trim().slice(0, 256);
    return "";
  }
  async function sha256Text(value) {
    if (!window.crypto || !window.crypto.subtle || typeof TextEncoder !== "function") {
      throw new Error("SHA-256 is unavailable");
    }
    var bytes = new TextEncoder().encode(String(value));
    var digest = await window.crypto.subtle.digest("SHA-256", bytes);
    return Array.prototype.map.call(new Uint8Array(digest), function (byte) {
      return byte.toString(16).padStart(2, "0");
    }).join("");
  }
  async function validateResetIntentReceipt(state, storage) {
    try {
      var epoch = state && state.profileEpoch;
      if (!plainObject(epoch) || epoch.reason !== "explicit-new-local-profile") return false;
      var epochId = typeof epoch.id === "string" ? epoch.id.trim() : "";
      var coldId = typeof epoch.preservedColdId === "string" ? epoch.preservedColdId : "";
      var sourceKey = typeof epoch.preservedSourceKey === "string" ? epoch.preservedSourceKey : "";
      var receiptKey = typeof epoch.resetIntentReceiptKey === "string" ? epoch.resetIntentReceiptKey : "";
      if (!epochId || epochId.length > 256 || !Number.isSafeInteger(epoch.createdAt) || epoch.createdAt <= 0) return false;
      if (!coldId || sourceKey.indexOf(MAIN + ".pre-new-profile-") !== 0) return false;
      if (receiptKey !== RESET_INTENT_PREFIX + epochId) return false;
      var receiptRaw = storage.getItem(receiptKey);
      if (typeof receiptRaw !== "string" || !receiptRaw) return false;
      var receipt = JSON.parse(receiptRaw);
      if (!plainObject(receipt) || receipt.kind !== "focus-hero-new-local-profile" || receipt.version !== 1 ||
          receipt.epochId !== epochId || receipt.createdAt !== epoch.createdAt || receipt.coldId !== coldId || receipt.sourceKey !== sourceKey ||
          !Number.isSafeInteger(receipt.backupBytes) || receipt.backupBytes <= 0 ||
          typeof receipt.backupSha256 !== "string" || !/^[a-f0-9]{64}$/.test(receipt.backupSha256)) return false;
      var cold = await new Promise(function(resolve,reject){
        var open=indexedDB.open(COLD_DB_NAME,1),db=null;
        open.onupgradeneeded=function(){try{open.transaction.abort();}catch(_){}};
        open.onerror=function(){reject(open.error||new Error("Cold reset archive unavailable"));};
        open.onsuccess=function(){
          db=open.result;if(!db.objectStoreNames.contains(COLD_STORE)){db.close();resolve(null);return;}
          var tx=db.transaction(COLD_STORE,"readonly"),request=tx.objectStore(COLD_STORE).get(coldId),value=null;
          request.onsuccess=function(){value=request.result||null;};request.onerror=function(){reject(request.error||new Error("Cold reset record read failed"));};
          tx.oncomplete=function(){db.close();resolve(value);};tx.onerror=function(){try{db.close();}catch(_){}reject(tx.error||new Error("Cold reset record read failed"));};
        };
      });
      if (!cold || cold.k !== coldId || cold.sourceKey !== sourceKey || typeof cold.v !== "string") return false;
      if (new TextEncoder().encode(cold.v).byteLength !== receipt.backupBytes) return false;
      if (await sha256Text(cold.v) !== receipt.backupSha256) return false;
      return true;
    } catch (_) { return false; }
  }
  function summarize(state) {
    state = plainObject(state) ? state : {};
    var historyValid = plainObject(state.history);
    var hist = historyValid ? state.history : {};
    var days = Object.keys(hist).filter(function (k) { return /^\d{4}-\d{2}-\d{2}$/.test(k); }).length;
    var economy = focusEconomySummary(state.focusEconomy);
    var world = worldProgressSummary(state);
    var eggs = eggProgressSummary(state.eggs);
    var loot = lootProgressSummary(state);
    var profileEpoch = profileEpochValue(state);
    return {
      profileEpoch: profileEpoch,
      intentionalProfileEpoch: "",
      reductions: reductionEntries(state),
      minutes: count(state.totalFocusMin),
      level: count(state.hero && state.hero.level),
      coinsEarned: count(state.coinsEarned),
      coinsSpent: count(state.coinsSpent),
      milestoneOrdinal: count(state.focusMilestones && state.focusMilestones.claimedThrough),
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
      economyRevision: economy.economyRevision,
      worldCounters: world.worldCounters,
      worldCounterTotal: world.worldCounterTotal,
      worldUnlockIds: world.worldUnlockIds,
      worldUnlocks: world.worldUnlocks,
      worldRevision: world.worldRevision,
      eggIds: eggs.eggIds,
      eggCount: eggs.eggCount,
      eggRevision: eggs.eggRevision,
      lootInstanceIds: loot.lootInstanceIds,
      lootInstanceCount: loot.lootInstanceCount,
      lootInstanceUpdatedAt: loot.lootInstanceUpdatedAt,
      lootInstanceTombstones: loot.lootInstanceTombstones,
      lootInstanceTombstoneCount: loot.lootInstanceTombstoneCount,
      lootDropTombstones: loot.lootDropTombstones,
      lootDropTombstoneCount: loot.lootDropTombstoneCount,
      sessionTombstones: loot.sessionTombstones,
      sessionTombstoneCount: loot.sessionTombstoneCount,
      lootInstanceRevision: loot.lootInstanceRevision
    };
  }
  async function summarizeWithResetIntent(state, storage) {
    var summary = summarize(state);
    if (summary.profileEpoch && await validateResetIntentReceipt(state, storage || localStorage)) {
      summary.intentionalProfileEpoch = summary.profileEpoch;
    }
    return summary;
  }
  /* Structural checks intentionally use only invariants the app treats as
     append-only/monotonic. Editable history/task/session counts are never
     compared by themselves. For equal-minute states, a missing populated
     container (or two independently vanished containers) is strong evidence
     of partial subtree rollback rather than a normal edit. */
  function anomalyReasons(current, guard) {
    if (typeof current === "number" || typeof guard === "number") {
      /* Bare numbers carry no receipts, so there is nothing to excuse the
         drop; the threshold behaves exactly as it always did. */
      var currentMin = count(current), guardMin = count(guard);
      return hasMeaningfulMinuteRegression(currentMin, guardMin, 0) ? ["focus-minutes-regression"] : [];
    }
    current = current || summarize(null); guard = guard || summarize(null);
    /* A deliberately created local profile starts a new lineage only when its
       metadata-only intent receipt still matches the exact preserved backup.
       A bare/forged epoch marker can never suppress a wipe warning. */
    if (current.profileEpoch && current.profileEpoch !== guard.profileEpoch &&
        current.intentionalProfileEpoch === current.profileEpoch) return [];
    var reasons = [];
    if (hasMeaningfulMinuteRegression(current.minutes, guard.minutes,
        declaredReductionAllowance(current, guard))) reasons.push("focus-minutes-regression");
    if (count(current.coinsEarned) < count(guard.coinsEarned)) reasons.push("coins-earned-rollback");
    if (count(current.coinsSpent) < count(guard.coinsSpent)) reasons.push("coins-spent-rollback");
    if (count(current.milestoneOrdinal) < count(guard.milestoneOrdinal)) reasons.push("focus-milestone-rollback");
    if (hasNumberMapRegression(current.worldCounters, guard.worldCounters)) reasons.push("world-counter-rollback");
    if (hasIdLoss(current.worldUnlockIds, guard.worldUnlockIds)) reasons.push("world-unlock-id-loss");
    if (hasIdLoss(current.eggIds, guard.eggIds)) reasons.push("egg-id-loss");
    if (hasNumberMapRegression(current.lootInstanceTombstones, guard.lootInstanceTombstones)) {
      reasons.push("loot-instance-tombstone-rollback");
    }
    if (hasNumberMapRegression(current.lootDropTombstones, guard.lootDropTombstones)) {
      reasons.push("loot-drop-tombstone-rollback");
    }
    if (hasNumberMapRegression(current.sessionTombstones, guard.sessionTombstones)) {
      reasons.push("session-tombstone-rollback");
    }
    var currentLootIds = idLookup(current.lootInstanceIds);
    var missingLoot = (guard.lootInstanceIds || []).some(function (iid) {
      if (currentLootIds[iid]) return false;
      var protectedStamp = count(guard.lootInstanceUpdatedAt && guard.lootInstanceUpdatedAt[iid]);
      var tombstoneStamp = count(current.lootInstanceTombstones && current.lootInstanceTombstones[iid]);
      return !(tombstoneStamp > 0 && tombstoneStamp >= protectedStamp);
    });
    if (missingLoot) reasons.push("loot-instance-id-loss");
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
      count(guard.coinsEarned), count(guard.coinsSpent), count(guard.milestoneOrdinal),
      String(guard.economyRevision || "0"), String(guard.worldRevision || "0"),
      String(guard.eggRevision || "0"), String(guard.lootInstanceRevision || "0"),
      String(guard.profileEpoch || "legacy")].join(":");
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

  var primaryReader = null;
  async function readMainState() {
    try {
      if (window.FH_PRIMARY_STORE && typeof window.FH_PRIMARY_STORE.create === "function") {
        if (!primaryReader) primaryReader = window.FH_PRIMARY_STORE.create({ dbName:PRIMARY_DB_NAME });
        var head = await primaryReader.readHead();
        if (head && typeof head.raw === "string") {
          var primary = JSON.parse(head.raw);
          return plainObject(primary) ? primary : null;
        }
      }
      /* Once activation exists, a missing/unreadable IDB head is a hard stop.
         Frozen legacy MAIN must never silently become current again. */
      if (localStorage.getItem(PRIMARY_ACTIVATION) !== null) return null;
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
      coinsEarned: sum.coinsEarned, coinsSpent: sum.coinsSpent, milestoneOrdinal: sum.milestoneOrdinal,
      economyGrants: sum.economyGrants, economySpends: sum.economySpends,
      economyHarvests: sum.economyHarvests, economyEvents: sum.economyEvents,
      economyPlots: sum.economyPlots, unlockedPlots: sum.unlockedPlots,
      duplicateEventIds: sum.duplicateEventIds, invalidEventIds: sum.invalidEventIds,
      worldUnlocks: sum.worldUnlocks, worldCounterTotal: sum.worldCounterTotal,
      eggCount: sum.eggCount, lootInstanceCount: sum.lootInstanceCount,
      lootInstanceTombstoneCount: sum.lootInstanceTombstoneCount,
      lootDropTombstoneCount: sum.lootDropTombstoneCount,
      sessionTombstoneCount: sum.sessionTombstoneCount,
      profileEpoch: sum.profileEpoch
    };
  }
  function betterProtectedSnapshot(left, right) {
    if (!left) return right;
    if (!right) return left;
    var a = left._guardSummary || summaryForSnapshot(left);
    var b = right._guardSummary || summaryForSnapshot(right);
    var keys = ["minutes", "coinsEarned", "coinsSpent", "milestoneOrdinal", "worldUnlocks",
      "worldCounterTotal", "eggCount", "lootInstanceCount", "lootInstanceTombstoneCount",
      "lootDropTombstoneCount", "sessionTombstoneCount",
      "economyEvents", "unlockedPlots", "sessions", "histDays", "tasks"];
    for (var i = 0; i < keys.length; i++) {
      if (a[keys[i]] !== b[keys[i]]) return a[keys[i]] > b[keys[i]] ? left : right;
    }
    return String(left.savedAt || left.date || "") >= String(right.savedAt || right.date || "") ? left : right;
  }
  function findAnomalousGuard(snapshots, currentSummary) {
    var best = null;
    var latestLineageGuard = null;
    for (var i = 0; i < snapshots.length; i++) {
      var snapshot = snapshots[i];
      if (!snapshot || !plainObject(snapshot.state)) continue;
      var protectedSummary = summaryForSnapshot(snapshot);
      var reasons = anomalyReasons(currentSummary, protectedSummary);
      if (!reasons.length) continue;
      snapshot._guardSummary = protectedSummary;
      snapshot._guardReasons = reasons;
      best = betterProtectedSnapshot(best, snapshot);
      /* If the active state's epoch vanished during a wipe, prefer the newest
         explicit profile lineage rather than an older profile with a larger
         historical total. All snapshots remain available on Recovery. */
      if (!currentSummary.profileEpoch && protectedSummary.profileEpoch &&
          (!latestLineageGuard ||
           String(snapshot.savedAt || snapshot.date || "") >
             String(latestLineageGuard.savedAt || latestLineageGuard.date || ""))) {
        latestLineageGuard = snapshot;
      }
    }
    return latestLineageGuard || best;
  }
  function uniqueBackupKey(storage, prefix) {
    var base = prefix + new Date().toISOString().replace(/[:.]/g, "-");
    var key = base, suffix = 0;
    while (storage.getItem(key) !== null) { suffix++; key = base + "-" + suffix; }
    return key;
  }
  function snapshotKeyFor(date, summary) {
    var epoch = summary && typeof summary.profileEpoch === "string" ? summary.profileEpoch : "";
    return epoch ? date + "#" + stableSignature([epoch]) : date;
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
    void storage; void state; void backupPrefix;
    throw new Error("Data Guard is read-only. Use the standalone Recovery Center for an explicit durable-primary restore.");
  }

  /* ---------- snapshotting ---------- */
  var snapBusy = false;
  async function takeSnapshot(reason) {
    if (snapBusy) return; snapBusy = true;
    try {
      var state = await readMainState(); if (!state) return;
      var sum = await summarizeWithResetIntent(state, localStorage); if (sum.minutes < 1) return;
      var db = await openDb();
      var all = await idbAll(db);
      var mirror = readMirrorSnapshot();
      var mirrorSummary = mirror ? summaryForSnapshot(mirror) : null;
      var protectedSnapshots = mirror ? all.concat([mirror]) : all.slice();
      var unsafeGuard = findAnomalousGuard(protectedSnapshots, sum);
      if (unsafeGuard) {
        db.close();
        showOverlay(unsafeGuard, sum, unsafeGuard._guardReasons || []);
        return;
      }
      var calendarDate = todayKey();
      var date = snapshotKeyFor(calendarDate, sum);
      var existing = null, maxMin = mirrorSummary ? mirrorSummary.minutes : 0, dateToMin = {};
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
      /* Do not refresh the historical full-state localStorage guard mirror.
         The independent IndexedDB ring above is the guard's only write path. */
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
        '<button id="fh-guard-restore" style="font:inherit;display:block;width:100%;margin:8px 0;padding:12px;border:0;border-radius:10px;background:#2456d9;color:#fff;font-weight:600">Review protected snapshot (' + fmtH(protectedSummary.minutes) + ")</button>" +
        '<button id="fh-guard-recover" style="font:inherit;display:block;width:100%;margin:8px 0;padding:12px;border:0;border-radius:10px;background:#2a2f55;color:#fff">Open recovery page (all snapshots)</button>' +
        '<button id="fh-guard-dismiss" style="font:inherit;display:block;width:100%;margin:8px 0;padding:10px;border:0;border-radius:10px;background:transparent;color:#8a93b3">I reset on purpose — dismiss</button>' +
        "</div>";
      (document.body || document.documentElement).appendChild(o);
      document.getElementById("fh-guard-restore").onclick = function () {
        /* Never mutate the live app while its sync workers may still be in
           flight. The standalone recovery page has no cloud poller, debounce,
           BroadcastChannel writer, or in-memory app state to race. */
        location.href = "./recover.html";
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
      var state = await readMainState();
      if (!state) return;
      var currentSummary = await summarizeWithResetIntent(state, localStorage);
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
    function startGuard() {
      setTimeout(function () { bootCheck(); }, 2500);
      setTimeout(function () { takeSnapshot("boot"); }, 6000);
      setInterval(function () { takeSnapshot("interval"); }, SNAP_INTERVAL_MS);
      document.addEventListener("visibilitychange", function () { if (document.hidden) takeSnapshot("hide"); });
      window.addEventListener("pagehide", function () { takeSnapshot("pagehide"); });
    }
    // A mixed/incomplete release must not open profile or snapshot databases.
    // Standalone recovery contexts keep their existing guard behavior.
    if (typeof window.FH_onPrimaryReady === "function") window.FH_onPrimaryReady(startGuard);
    else startGuard();
    window.__fhGuardTest = { summarize: summarize, focusEconomySummary: focusEconomySummary,
      summarizeWithResetIntent: summarizeWithResetIntent, validateResetIntentReceipt: validateResetIntentReceipt,
      anomalyReasons: anomalyReasons, isAnomaly: isAnomaly, sameDayReplaceOk: sameDayReplaceOk,
      pruneDates: pruneDates, anomalyId: anomalyId, compactSummary: compactSummary,
      stageRecoveryState: stageRecoveryState,
      snapshotKeyFor: snapshotKeyFor, findAnomalousGuard: findAnomalousGuard,
      takeSnapshot: takeSnapshot, openDb: openDb, idbAll: idbAll };
  } catch (_) {}
})();

/* asset content-type refresh — v10.32.0 */
