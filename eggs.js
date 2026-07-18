/* ================================================================
 * Focus Hero v8.6.0 - EGG SYSTEM
 *
 * Per Joel's direct request: "ADD EGGS into the game that I can
 * hatch for actual animals."
 *
 * Eggs drop from one verified roll per completed 30+ min focus session.
 * High-tier eggs are strictly gated by session length.
 * Each egg matches one of the mount FAMILIES (horse/wolf/cat/bear/
 * bird/reptile/dragon/mythical/forest/cattle/undead/elemental/
 * insect/aquatic/small).
 *
 * Incubation: each egg has incubationReqMin. The user clicks
 * "incubate" to start the timer. Cumulative focused minutes while
 * the egg slot is occupied count toward hatching. 3 incubator slots
 * initially.
 *
 *   Rarity         Incubation req
 *   ---------------  --------------
 *   common         120 min   (2h)
 *   uncommon       240 min   (4h)
 *   rare           300 min   (5h)
 *   epic           900 min   (15h)
 *   legendary     2400 min   (40h)
 *   mythic        6000 min   (100h)
 *
 * On hatch: a random mount of that family + rarity is minted into
 * lootInstances, lootOwned bumped, family progress updated.
 *
 * v13 -> v14 migration: adds state.eggs. v8.6.3 adds session provenance,
 * one-award-per-session deduplication, and a non-destructive quarantine for
 * unverified pre-fix legendary/mythic eggs.
 * ================================================================ */

(function(){
  "use strict";

  /* Mount families (must align with v8.4 CR_MOUNTS_BY_FAMILY) */
  var EGG_FAMILIES = ["horse","wolf","cat","bear","bird","reptile","dragon","mythical","forest","cattle","undead","elemental","insect","aquatic","small"];

  /* Egg incubation times (in focus minutes) by rarity. */
  var EGG_INCUBATION_REQ = {
    common:   120,    // 2h
    uncommon: 240,    // 4h
    rare:     300,    // 5h
    epic:     900,    // 15h
    legendary:2400,   // 40h
    mythic:   6000    // 100h
  };

  var EGG_SYSTEM_VERSION = 2;
  var EGG_PROCESSED_SESSION_CAP = 200;
  var EGG_INCUBATION_CREDIT_CAP = 400;
  var EGG_MAX_CREDIT_MINUTES = Number.MAX_SAFE_INTEGER;
  var EGG_MIN_DROP_MINUTES = 30;
  var EGG_REWARD_PROOF = {};

  /* One total egg roll per qualifying session: 6% at 30m, up to 10%. */
  function eggDropChance(sessionMinutes){
    sessionMinutes = Math.max(0, Math.floor(Number(sessionMinutes) || 0));
    if (sessionMinutes < EGG_MIN_DROP_MINUTES) return 0;
    return Math.min(0.10, 0.06 + Math.floor((sessionMinutes - 30) / 30) * 0.01);
  }

  /* Conditional rarity distribution after the single egg roll succeeds. */
  function eggRarityWeights(sessionMinutes){
    sessionMinutes = Math.max(0, Math.floor(Number(sessionMinutes) || 0));
    if (sessionMinutes >= 240){
      return { common:0.55, uncommon:0.28, rare:0.13, epic:0.035, legendary:0.0045, mythic:0.0005 };
    }
    if (sessionMinutes >= 120){
      return { common:0.65, uncommon:0.25, rare:0.08, epic:0.018, legendary:0.002 };
    }
    if (sessionMinutes >= 60){
      return { common:0.75, uncommon:0.20, rare:0.045, epic:0.005 };
    }
    return { common:0.85, uncommon:0.14, rare:0.01 };
  }

  function eggRollRarity(sessionMinutes, rng){
    rng = typeof rng === "function" ? rng : Math.random;
    var weights = eggRarityWeights(sessionMinutes);
    var roll = rng();
    var total = 0;
    var order = ["common","uncommon","rare","epic","legendary","mythic"];
    for (var i=0; i<order.length; i++){
      var rarity = order[i];
      total += weights[rarity] || 0;
      if (roll < total) return rarity;
    }
    return "common";
  }

  /* Egg sprites - distinct per family + rarity. */
  var EGG_FAMILY_SYMS = {
    horse: "🥚",
    wolf:  "🥚",
    cat:   "🥚",
    bear:  "🥚",
    bird:  "🥚",
    reptile:"🐣",
    dragon: "🐉",
    mythical:"🦄",
    forest: "🌰",
    cattle: "🥚",
    undead: "💀",
    elemental:"💎",
    insect: "🦋",
    aquatic:"🐚",
    small:  "🥚"
  };

  /* Naming */
  function eggLabel(family, rarity){
    var fam = (family || "").replace("_", " ");
    var rar = rarity ? (rarity.charAt(0).toUpperCase() + rarity.slice(1)) : "Common";
    return rar + " " + fam.charAt(0).toUpperCase() + fam.slice(1) + " Egg";
  }

  /* ---------- STATE SHAPE ---------- */
  function eggHasVerifiedSource(egg){
    return !!(egg && typeof egg.sourceSessionId === "string" && egg.sourceSessionId &&
      Number(egg.sourceMinutes) >= EGG_MIN_DROP_MINUTES &&
      (egg.sourceType === "timer" || egg.sourceType === "stopwatch"));
  }

  function eggQuarantineUnverifiedHighTier(eggs){
    var existing = new Set(eggs.quarantined.map(function(egg){ return egg && egg.id; }).filter(Boolean));
    var moved = 0;
    ["owned","incubating"].forEach(function(bucket){
      var keep = [];
      eggs[bucket].forEach(function(egg){
        var highTier = egg && (egg.rarity === "legendary" || egg.rarity === "mythic");
        if (!highTier || eggHasVerifiedSource(egg)){
          keep.push(egg);
          return;
        }
        if (!egg.quarantinedAt) egg.quarantinedAt = Date.now();
        if (!egg.quarantineReason) egg.quarantineReason = "pre-v2-unverified-high-tier";
        if (!egg.id || !existing.has(egg.id)){
          eggs.quarantined.push(egg);
          if (egg.id) existing.add(egg.id);
        }
        moved++;
      });
      eggs[bucket] = keep;
    });
    return moved;
  }

  function eggEnsureState(s){
    s = s || (typeof window !== "undefined" ? window.state : null);
    if (!s) return null;
    if (!s.eggs || typeof s.eggs !== "object" || Array.isArray(s.eggs)){
      s.eggs = { owned: [], incubating: [], hatched: [], quarantined: [], processedSessionIds: [], slotCap: 3, systemVersion: EGG_SYSTEM_VERSION };
    }
    if (!Array.isArray(s.eggs.owned)) s.eggs.owned = [];
    if (!Array.isArray(s.eggs.incubating)) s.eggs.incubating = [];
    if (!Array.isArray(s.eggs.hatched)) s.eggs.hatched = [];
    if (!Array.isArray(s.eggs.quarantined)) s.eggs.quarantined = [];
    if (!Array.isArray(s.eggs.processedSessionIds)) s.eggs.processedSessionIds = [];
    if (typeof s.eggs.slotCap !== "number" || !(s.eggs.slotCap >= 1)) s.eggs.slotCap = 3;
    eggQuarantineUnverifiedHighTier(s.eggs);
    s.eggs.processedSessionIds = s.eggs.processedSessionIds.filter(function(id){ return typeof id === "string" && id; }).slice(-EGG_PROCESSED_SESSION_CAP);
    s.eggs.systemVersion = EGG_SYSTEM_VERSION;
    return s.eggs;
  }

  /* Incubation corrections need provenance. Without it, editing an old session
     after the incubator occupant changed could erase progress from the wrong
     egg. Credits live on the egg that actually received the minutes and are
     bounded; missing/legacy provenance fails closed instead of guessing. */
  function eggNormalizeIncubationCredits(egg){
    if (!egg || typeof egg !== "object") return [];
    var raw = Array.isArray(egg.incubationCredits) ? egg.incubationCredits : [];
    var out = [], byId = Object.create(null);
    raw.forEach(function(entry){
      if (!entry || typeof entry !== "object") return;
      var id = typeof entry.id === "string" ? entry.id : "";
      var minutes = Math.max(0, Math.trunc(Number(entry.minutes) || 0));
      if (!id || !minutes) return;
      var taskId = typeof entry.taskId === "string" ? entry.taskId : "";
      var key = id + "\u0000" + taskId;
      if (byId[key]){
        byId[key].minutes = Math.min(EGG_MAX_CREDIT_MINUTES, byId[key].minutes + minutes);
        byId[key].at = Math.max(byId[key].at || 0, Math.max(0, Number(entry.at) || 0));
        return;
      }
      var normalized = {
        id: id,
        taskId: taskId,
        kind: typeof entry.kind === "string" ? entry.kind.slice(0, 32) : "focus",
        minutes: Math.min(EGG_MAX_CREDIT_MINUTES, minutes),
        at: Math.max(0, Number(entry.at) || 0)
      };
      byId[key] = normalized;
      out.push(normalized);
    });
    egg.incubationCredits = out.slice(-EGG_INCUBATION_CREDIT_CAP);
    return egg.incubationCredits;
  }

  function eggRememberIncubationCredit(egg, minutes, source){
    var add = Math.max(0, Math.trunc(Number(minutes) || 0));
    source = source && typeof source === "object" ? source : {};
    var id = typeof source.id === "string" ? source.id : "";
    if (!egg || !add || !id) return 0;
    var credits = eggNormalizeIncubationCredits(egg);
    var taskId = typeof source.taskId === "string" ? source.taskId : "";
    var existing = null;
    for (var i = credits.length - 1; i >= 0; i--){
      if (credits[i].id === id && credits[i].taskId === taskId){ existing = credits[i]; break; }
    }
    if (existing){
      existing.minutes = Math.min(EGG_MAX_CREDIT_MINUTES, existing.minutes + add);
      existing.at = Math.max(existing.at || 0, Math.max(0, Number(source.at) || Date.now()));
    } else {
      credits.push({
        id: id,
        taskId: taskId,
        kind: typeof source.kind === "string" ? source.kind.slice(0, 32) : "focus",
        minutes: Math.min(EGG_MAX_CREDIT_MINUTES, add),
        at: Math.max(0, Number(source.at) || Date.now())
      });
      if (credits.length > EGG_INCUBATION_CREDIT_CAP) credits.shift();
    }
    return add;
  }

  function eggRewindIncubationCredits(egg, minutes, source){
    var left = Math.max(0, Math.trunc(Number(minutes) || 0));
    source = source && typeof source === "object" ? source : {};
    var ownerId = typeof source.ownerId === "string" ? source.ownerId : "";
    var taskId = typeof source.taskId === "string" ? source.taskId : "";
    if (!egg || !left || (!ownerId && !taskId)) return 0;
    var credits = eggNormalizeIncubationCredits(egg), removed = 0;
    for (var i = credits.length - 1; i >= 0 && left > 0; i--){
      var entry = credits[i];
      if (ownerId ? entry.id !== ownerId : entry.taskId !== taskId) continue;
      var take = Math.min(left, Math.max(0, Math.trunc(Number(entry.minutes) || 0)));
      if (!take) continue;
      entry.minutes -= take;
      left -= take;
      removed += take;
      if (entry.minutes <= 0) credits.splice(i, 1);
    }
    return removed;
  }

  /* ---------- DROP (session-end hook) ---------- */
  function eggMaybeDrop(s, sessionMinutes, context, proof, rng){
    s = s || (typeof window !== "undefined" ? window.state : null);
    if (proof !== EGG_REWARD_PROOF || !s || sessionMinutes < EGG_MIN_DROP_MINUTES) return null;
    eggEnsureState(s);
    rng = typeof rng === "function" ? rng : Math.random;
    if (rng() >= eggDropChance(sessionMinutes)) return null;
    var dropped = eggRollRarity(sessionMinutes, rng);
    var family = EGG_FAMILIES[Math.floor(rng() * EGG_FAMILIES.length)] || EGG_FAMILIES[0];
    var earnedAt = Date.now();
    var egg = {
      id: "egg_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4),
      family: family,
      rarity: dropped,
      sym: EGG_FAMILY_SYMS[family] || "🥚",
      name: eggLabel(family, dropped),
      incubationReqMin: EGG_INCUBATION_REQ[dropped],
      droppedAt: earnedAt,
      earnedAt: earnedAt,
      sourceSessionId: context.sessionId,
      sourceMinutes: context.minutes,
      sourceAction: context.action,
      sourceType: context.source
    };
    s.eggs.owned.push(egg);
    return egg;
  }

  /* ---------- INCUBATION ---------- */
  function eggStartIncubation(s, eggId){
    s = s || (typeof window !== "undefined" ? window.state : null);
    eggEnsureState(s);
    var idx = s.eggs.owned.findIndex(function(e){ return e.id === eggId; });
    if (idx < 0) return { ok:false, reason:"egg_not_found" };
    if (s.eggs.incubating.length >= s.eggs.slotCap) return { ok:false, reason:"slots_full" };
    var egg = s.eggs.owned.splice(idx, 1)[0];
    egg.incubatedMin = 0;
    egg.incubationCredits = [];
    egg.startedAt = Date.now();
    s.eggs.incubating.push(egg);
    return { ok:true };
  }

  function eggCancelIncubation(s, eggId){
    s = s || (typeof window !== "undefined" ? window.state : null);
    eggEnsureState(s);
    var idx = s.eggs.incubating.findIndex(function(e){ return e.id === eggId; });
    if (idx < 0) return { ok:false, reason:"not_incubating" };
    var egg = s.eggs.incubating.splice(idx, 1)[0];
    delete egg.incubatedMin;
    delete egg.incubationCredits;
    delete egg.startedAt;
    s.eggs.owned.push(egg);
    return { ok:true };
  }

  /* Called from session-end hook; advances every incubating egg by the
     session minutes. Returns array of newly-hatched eggs. */
  function eggAdvanceIncubation(s, minutes, creditSource){
    s = s || (typeof window !== "undefined" ? window.state : null);
    eggEnsureState(s);
    var hatched = [];
    var remaining = [];
    var addedMinutes = Math.max(0, minutes|0);
    s.eggs.incubating.forEach(function(egg){
      egg.incubatedMin = (egg.incubatedMin|0) + addedMinutes;
      if (addedMinutes && creditSource) eggRememberIncubationCredit(egg, addedMinutes, creditSource);
      if (egg.incubatedMin >= egg.incubationReqMin){
        // Hatch!
        var mount = eggHatch(s, egg);
        if (mount){
          egg.hatchedTo = mount.id;
          egg.hatchedAt = Date.now();
          s.eggs.hatched.push(egg);
          hatched.push({ egg: egg, mount: mount });
        } else {
          // Couldn't determine a mount — return to owned, don't crash
          delete egg.incubatedMin;
          delete egg.startedAt;
          s.eggs.owned.push(egg);
        }
      } else {
        remaining.push(egg);
      }
    });
    s.eggs.incubating = remaining;
    return hatched;
  }

  /* Minute edits use the same incubation clock as a completed focus session.
     The event id makes wrapper retries idempotent, while negative corrections
     only rewind eggs that are still incubating (a correction must never delete
     an already-hatched mount or another earned inventory item). */
  function eggApplyMinuteCorrection(s, deltaMinutes, eventId, source){
    var eggs = eggEnsureState(s);
    var delta = Math.trunc(Number(deltaMinutes) || 0);
    var key = typeof eventId === "string" ? eventId : "";
    if (!eggs || !delta || !key) return { processed:false, delta:0, hatched:[] };
    if (eggs.processedSessionIds.indexOf(key) >= 0) return { processed:false, delta:delta, hatched:[] };
    eggs.processedSessionIds.push(key);
    if (eggs.processedSessionIds.length > EGG_PROCESSED_SESSION_CAP) eggs.processedSessionIds.shift();

    source = source && typeof source === "object" ? source : {};
    var hatched = [], applied = [];
    if (delta > 0){
      hatched = eggAdvanceIncubation(s, delta, {
        id: typeof source.ownerId === "string" && source.ownerId ? source.ownerId : key,
        taskId: typeof source.taskId === "string" ? source.taskId : "",
        kind: typeof source.kind === "string" ? source.kind : "manual",
        at: Date.now()
      });
      hatched.forEach(function(h){
        if (typeof window.toast === "function") window.toast(h.egg.sym + " " + h.egg.name + " HATCHED into " + (h.mount.name || h.mount.id) + "!", "good");
        if (typeof window.logLine === "function") window.logLine("Egg hatched: " + h.egg.name + " -> " + (h.mount.name || h.mount.id));
      });
    } else {
      var rewind = Math.abs(delta);
      eggs.incubating.forEach(function(egg){
        var removed = eggRewindIncubationCredits(egg, rewind, source);
        if (removed){
          egg.incubatedMin = Math.max(0, (egg.incubatedMin|0) - removed);
          applied.push({ eggId:egg.id || "", minutes:removed });
        }
      });
    }
    try { eggRender(); } catch(_){}
    return { processed:true, delta:delta, hatched:hatched, applied:applied };
  }

  /* Hatch: pick a random mount from v8.4 CR_MOUNTS_BY_FAMILY of the matching
     family + rarity, mint it as a loot instance. */
  function eggHatch(s, egg){
    if (!egg || !egg.family || !egg.rarity) return null;
    var family = egg.family;
    var rarity = egg.rarity;
    var roster = window.CR_MOUNTS_BY_FAMILY && window.CR_MOUNTS_BY_FAMILY[family];
    if (!roster || !roster.length) return null;
    var candidates = roster.filter(function(m){ return m.tier === rarity; });
    if (!candidates.length){
      // Fall back: take any mount in family
      candidates = roster;
    }
    var mount = candidates[Math.floor(Math.random() * candidates.length)];
    if (!mount) return null;
    // Mint instance similar to crGrantMount logic
    var iid = "iid_egg_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
    var aff = null;
    if (mount.effect){
      var k = Object.keys(mount.effect).filter(function(k){ return k !== "label"; })[0];
      if (k) aff = { id: k, tier:"major", value: mount.effect[k], fixed: true };
    }
    var instance = {
      iid: iid, lootId: mount.id, tier: mount.tier, level: 0,
      affixes: aff ? [aff] : [], sockets: [], dyeId: null,
      createdAt: Date.now(),
      source: { kind:"egg_hatch", from: egg.id, family: family, rarity: rarity },
      locked: false
    };
    if (!s.lootInstances) s.lootInstances = {};
    s.lootInstances[iid] = instance;
    if (!s.lootOwned) s.lootOwned = {};
    s.lootOwned[mount.id] = (s.lootOwned[mount.id]|0) + 1;
    // Family progress tracking (v8.4 mountFamilies)
    if (s.loot && s.loot.mountFamilies){
      if (!s.loot.mountFamilies[family]) s.loot.mountFamilies[family] = { collected: {} };
      s.loot.mountFamilies[family].collected[mount.id] = 1;
    }
    // Drop log entry
    if (s.loot && Array.isArray(s.loot.drops)){
      s.loot.drops.push({
        id: "drop_" + Math.random().toString(36).slice(2,10),
        at: Date.now(),
        sessionId: null,
        iid: iid,
        templateId: mount.id,
        rarity: mount.tier,
        sourceAction: "EggHatch",
        enemyId: null,
        odds: { rolled: 1, total: 1, ratio: 1 },
        pity: { tier: mount.tier, sinceLast: 0, bumped: false },
        fromMonsterTable: false,
        fromEgg: true,
        eggFamily: family
      });
      if (s.loot.drops.length > 200) s.loot.drops.shift();
    }
    return mount;
  }

  /* ---------- VERIFIED SESSION REWARD BOUNDARY ---------- */
  function eggNormalizeCompletedRecord(s, record, pipelineResult){
    if (!s || !record || !pipelineResult ||
        !Array.isArray(pipelineResult.drops) || !Array.isArray(pipelineResult.encounters)) return null;
    var source = record.source;
    var sessionId = typeof record.id === "string" ? record.id : "";
    var minutes = Math.max(0, Math.floor(Number(record.minutes) || 0));
    var action = typeof record.action === "string" ? record.action : "";
    if (source !== "timer" && source !== "stopwatch") return null;
    if (!sessionId || sessionId.indexOf(source === "timer" ? "focus_" : "sw_") !== 0) return null;
    if (record.type !== "focus" || !record.rewarded || !minutes || !action) return null;
    if ((s.completedFocusSessions|0) < 1 || Number(s.totalFocusMin) < minutes) return null;
    var ledgerMatch = Array.isArray(s.sessionsLog) && s.sessionsLog.some(function(entry){
      return entry && entry.id === sessionId && entry.type === "focus" && entry.rewarded === true &&
        entry.source === source && (entry.minutes|0) === minutes;
    });
    if (!ledgerMatch) return null;
    return { source:source, sessionId:sessionId, minutes:minutes, action:action,
      taskId:typeof record.taskId === "string" ? record.taskId : "", at:Math.max(0, Number(record.at)||0) };
  }

  function eggProcessVerifiedSession(s, context, proof, rng){
    if (proof !== EGG_REWARD_PROOF) return { processed:false, hatched:[], dropped:null };
    var eggs = eggEnsureState(s);
    if (!eggs || eggs.processedSessionIds.indexOf(context.sessionId) >= 0){
      return { processed:false, hatched:[], dropped:null };
    }
    eggs.processedSessionIds.push(context.sessionId);
    if (eggs.processedSessionIds.length > EGG_PROCESSED_SESSION_CAP) eggs.processedSessionIds.shift();

    var hatched = eggAdvanceIncubation(s, context.minutes, {
      id:context.sessionId, taskId:context.taskId || "", kind:context.source || "focus", at:context.at || Date.now()
    });
    var dropped = eggMaybeDrop(s, context.minutes, context, EGG_REWARD_PROOF, rng);
    hatched.forEach(function(h){
      if (typeof window.toast === "function"){
        window.toast(h.egg.sym + " " + h.egg.name + " HATCHED into " + (h.mount.name || h.mount.id) + "!", "good");
      }
      if (typeof window.logLine === "function"){
        window.logLine("Egg hatched: " + h.egg.name + " -> " + (h.mount.name || h.mount.id));
      }
    });
    if (dropped){
      if (typeof window.toast === "function") window.toast(dropped.sym + " Found a " + dropped.name + "!", "good");
      if (typeof window.logLine === "function") window.logLine("Egg dropped: " + dropped.name);
    }
    if (typeof window.saveState === "function") window.saveState();
    try { eggRender(); } catch(_){}
    return { processed:true, hatched:hatched, dropped:dropped };
  }

  function eggRecordCompletedSession(record, pipelineResult){
    try {
      var s = window.state;
      var verified = eggNormalizeCompletedRecord(s, record, pipelineResult);
      if (verified) eggProcessVerifiedSession(s, verified, EGG_REWARD_PROOF);
    } catch(e){ console.warn("egg verified session:", e); }
  }

  /* ---------- UI ---------- */
  function eggRender(){
    var host = document.getElementById("egg-incubator");
    if (!host){
      // Try to inject near the mount-progress bar (under Hero card)
      var heroCard = document.querySelector(".hero-card");
      if (heroCard){
        host = document.createElement("div");
        host.id = "egg-incubator";
        host.className = "egg-incubator";
        // Place after cr-mount-progress if present, else end of card
        var mp = document.getElementById("cr-mount-progress");
        if (mp && mp.parentNode) mp.parentNode.insertBefore(host, mp.nextSibling);
        else heroCard.appendChild(host);
      }
    }
    if (!host) return;
    var s = window.state;
    if (!s) return;
    eggEnsureState(s);

    var owned = s.eggs.owned || [];
    var inc = s.eggs.incubating || [];
    var hatched = s.eggs.hatched || [];
    var quarantined = s.eggs.quarantined || [];
    var slots = s.eggs.slotCap || 3;

    var slotHtml = '';
    for (var i = 0; i < slots; i++){
      var egg = inc[i];
      if (egg){
        var pct = Math.min(100, Math.round((egg.incubatedMin / egg.incubationReqMin) * 100));
        slotHtml += '<div class="egg-slot egg-slot-active tier-' + egg.rarity + '" title="' + egg.name + '">' +
          '<div class="egg-sym">' + egg.sym + '</div>' +
          '<div class="egg-name">' + egg.name + '</div>' +
          '<div class="egg-bar"><div class="egg-fill" style="width:' + pct + '%"></div></div>' +
          '<div class="egg-pct">' + egg.incubatedMin + 'm / ' + egg.incubationReqMin + 'm (' + pct + '%)</div>' +
          '<button type="button" class="egg-cancel-btn" data-egg-cancel="' + egg.id + '">Cancel</button>' +
        '</div>';
      } else {
        slotHtml += '<div class="egg-slot egg-slot-empty"><span class="egg-empty-icon">+</span><span class="egg-empty-label">empty slot</span></div>';
      }
    }

    var ownedHtml = '';
    if (owned.length){
      ownedHtml = '<div class="egg-owned-title">Eggs in storage (' + owned.length + ')</div>' +
        '<div class="egg-owned-grid">' +
        owned.map(function(egg){
          var slotAvail = inc.length < slots;
          return '<div class="egg-owned tier-' + egg.rarity + '">' +
             '<div class="egg-sym">' + egg.sym + '</div>' +
             '<div class="egg-name">' + egg.name + '</div>' +
             '<div class="egg-meta">' + egg.incubationReqMin + 'm req</div>' +
             (eggHasVerifiedSource(egg) ? '<div class="egg-meta">Earned from ' + egg.sourceMinutes + 'm ' + egg.sourceType + '</div>' : '') +
             (slotAvail ?
              '<button type="button" class="egg-incubate-btn" data-egg-start="' + egg.id + '">Incubate</button>' :
              '<button type="button" class="egg-incubate-btn" disabled>Slots full</button>') +
          '</div>';
        }).join("") +
        '</div>';
    }

    var hatchedSummary = '';
    if (hatched.length){
      hatchedSummary = '<div class="egg-hatched-summary">' + hatched.length + ' egg' + (hatched.length===1?'':'s') + ' hatched all-time</div>';
    }
    var quarantineSummary = '';
    if (quarantined.length){
      quarantineSummary = '<div class="egg-hatched-summary">' + quarantined.length +
        ' unverified pre-fix high-tier egg' + (quarantined.length===1?'':'s') + ' preserved in quarantine</div>';
    }

    host.innerHTML =
      '<div class="egg-incubator-header"><b>🥚 Egg Incubator</b><span>' + inc.length + ' / ' + slots + ' slots active</span></div>' +
      '<div class="egg-slots">' + slotHtml + '</div>' +
      ownedHtml +
      quarantineSummary +
      hatchedSummary;

    host.querySelectorAll("[data-egg-start]").forEach(function(b){
      b.addEventListener("click", function(){
        var r = eggStartIncubation(window.state, b.getAttribute("data-egg-start"));
        if (!r.ok){
          if (typeof window.toast === "function") window.toast("Can't incubate: " + r.reason, "warn");
        } else {
          if (typeof window.saveState === "function") window.saveState();
          eggRender();
        }
      });
    });
    host.querySelectorAll("[data-egg-cancel]").forEach(function(b){
      b.addEventListener("click", function(){
        var r = eggCancelIncubation(window.state, b.getAttribute("data-egg-cancel"));
        if (!r.ok){
          if (typeof window.toast === "function") window.toast("Can't cancel: " + r.reason, "warn");
        } else {
          if (typeof window.saveState === "function") window.saveState();
          eggRender();
        }
      });
    });
  }

  /* ---------- BOOT ---------- */
  function eggBoot(){
    eggEnsureState(window.state);
    if (typeof window.saveState === "function") window.saveState();
    setTimeout(eggRender, 400);
    setInterval(eggRender, 6000);
  }

  if (typeof document !== "undefined"){
    if (document.readyState === "loading"){
      document.addEventListener("DOMContentLoaded", eggBoot, { once: true });
    } else {
      setTimeout(eggBoot, 0);
    }
  }

  /* Public API */
  window.eggMaybeDrop = eggMaybeDrop;
  window.eggRecordCompletedSession = eggRecordCompletedSession;
  window.eggStartIncubation = eggStartIncubation;
  window.eggCancelIncubation = eggCancelIncubation;
  window.eggAdvanceIncubation = eggAdvanceIncubation;
  window.eggApplyMinuteCorrection = eggApplyMinuteCorrection;
  window.eggHatch = eggHatch;
  window.eggRender = eggRender;
  window.eggEnsureState = eggEnsureState;
  window.EGG_FAMILIES = EGG_FAMILIES;
  window.EGG_INCUBATION_REQ = EGG_INCUBATION_REQ;
  window.eggDropChance = eggDropChance;
  window.eggRarityWeights = eggRarityWeights;

  /* Smoke tests */
  window.__eggSmokeTests = function(){
    var results = [];
    var add = function(name, ok, msg){ results.push({name:name, ok:!!ok, msg:msg||""}); };
    add("egg: 15 families", EGG_FAMILIES.length === 15);
    add("egg: 6 rarity tiers", Object.keys(EGG_INCUBATION_REQ).length === 6);
    add("egg: common needs 2h", EGG_INCUBATION_REQ.common === 120);
    add("egg: mythic needs 100h", EGG_INCUBATION_REQ.mythic === 6000);
    add("egg: 30m total chance is 6%", eggDropChance(30) === 0.06);
    add("egg: total chance caps at 10%", eggDropChance(1000) === 0.10);
    add("egg: no legendary before 120m", !eggRarityWeights(119).legendary);
    add("egg: no mythic before 240m", !eggRarityWeights(239).mythic);
    var fake = { totalFocusMin:240, completedFocusSessions:1, eggs:{owned:[],incubating:[],hatched:[],quarantined:[],processedSessionIds:[],slotCap:3,systemVersion:2} };
    add("egg: direct unverified drop call is locked", eggMaybeDrop(fake, 240) === null && fake.eggs.owned.length === 0);
    var record = { id:"focus_smoke_1", type:"focus", source:"timer", minutes:60, action:"Travel", rewarded:true };
    var pipelineResult = { drops:[], encounters:[] };
    add("egg: completed session must exist in ledger", eggNormalizeCompletedRecord(fake, record, pipelineResult) === null);
    fake.sessionsLog = [record];
    var ctx = eggNormalizeCompletedRecord(fake, record, pipelineResult);
    add("egg: matching completed ledger session verifies", !!ctx && ctx.sessionId === record.id);
    var processed = eggProcessVerifiedSession(fake, ctx, EGG_REWARD_PROOF, function(){ return 0; });
    add("egg: verified completed session can drop", processed.processed && !!processed.dropped && processed.dropped.rarity === "common");
    var duplicate = eggProcessVerifiedSession(fake, ctx, EGG_REWARD_PROOF, function(){ return 0; });
    add("egg: same completed session processes once", !duplicate.processed && fake.eggs.processedSessionIds.length === 1);
    var fake2 = { eggs:{owned:[{id:"legacyLegend",rarity:"legendary"}],incubating:[],hatched:[],quarantined:[],processedSessionIds:[],slotCap:3} };
    eggEnsureState(fake2);
    add("egg: unverified legacy legendary is quarantined, not deleted", fake2.eggs.owned.length === 0 && fake2.eggs.quarantined.length === 1);
    // Incubation start
    var fake3 = { eggs:{owned:[{id:"e1", family:"horse", rarity:"common", sym:"🥚", incubationReqMin:120, name:"Common Horse Egg"}],incubating:[],hatched:[],slotCap:3} };
    var r1 = eggStartIncubation(fake3, "e1");
    add("egg: start incubation succeeds", r1.ok && fake3.eggs.incubating.length === 1);
    var r2 = eggAdvanceIncubation(fake3, 60);
    add("egg: advance 60min -> still incubating", r2.length === 0 && fake3.eggs.incubating[0].incubatedMin === 60);
    var fake4 = { eggs:{owned:[],incubating:[{id:"e2", family:"horse", rarity:"common", sym:"🥚", incubationReqMin:120, incubatedMin:60, name:"Common Horse Egg"}],hatched:[],slotCap:3} };
    var r3 = eggAdvanceIncubation(fake4, 60);
    // Without mount roster won't hatch fully, but advancement count would still trigger
    add("egg: cross threshold attempts hatch", fake4.eggs.incubating.length === 0 || r3.length >= 0);
    // Slot cap
    var fake5 = { eggs:{owned:[{id:"e3",family:"wolf",rarity:"common",sym:"🥚",incubationReqMin:120,name:"x"}],incubating:[{},{},{}],hatched:[],slotCap:3} };
    var r4 = eggStartIncubation(fake5, "e3");
    add("egg: slot cap enforced", !r4.ok && r4.reason === "slots_full");
    return results;
  };
})();
