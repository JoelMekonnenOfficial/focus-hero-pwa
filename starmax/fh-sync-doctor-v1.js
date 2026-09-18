/* ==========================================================================
   Life XP — SYNC DOCTOR                                  fh-sync-doctor-v1.js

   WHY THIS EXISTS.

   Sync has been diagnosed twice from the wrong machine, because the only
   evidence available was "it says last pushed" and a guess. Two devices can
   BOTH report a recent successful push and still never exchange a single
   skill - if they are pushing to two different cloud rows. Nothing in the app
   showed that, so nothing could catch it.

   This uploads no profile and changes no progress, settings, or identity.
   The cloud transfer budget records its download. It answers three questions:

     1. WHO does this device think it is?   (the cloud identity fingerprint)
     2. WHAT does the cloud hold for that identity, right now?
     3. WHERE do those two disagree?

   The fingerprint is the important one. Open this on both devices: if the
   fingerprints differ, they are syncing to separate clouds and no amount of
   pressing "Sync now" will ever join them. That is the failure the app could
   not previously see, and it is invisible from the outside because both
   devices are working perfectly - just past each other.

   No sync credentials are included in the report. The identity is printed
   as its last six characters only, which is enough to compare two
   devices and useless to anybody else.
   ========================================================================== */
(function(){
  "use strict";
  if (window.FH_SYNC_DOCTOR) return;

  var CSS_ID = "fh-doctor-css";
  var CSS = [
    '#fh-doctor-wrap{margin-top:10px}',
    '#fh-doctor-out{margin-top:9px;padding:11px 13px;border-radius:12px;font-size:.8rem;line-height:1.6;',
    '  border:1px solid var(--border,rgba(255,255,255,.14));background:var(--panel-2,rgba(255,255,255,.04));',
    '  white-space:pre-wrap;word-break:break-word;font-family:var(--mono,ui-monospace,monospace)}',
    '#fh-doctor-out .v{font-weight:700}',
    '#fh-doctor-out .ok{color:#7ee2a8}',
    '#fh-doctor-out .bad{color:#ff9b9b}',
    '#fh-doctor-out .warn{color:#ffd479}',
    '#fh-doctor-out h5{margin:10px 0 2px;font-size:.74rem;letter-spacing:.12em;text-transform:uppercase;opacity:.55;font-weight:700}',
    '#fh-doctor-out h5:first-child{margin-top:0}',
    '.fh-doctor-id{font-size:1.05rem;letter-spacing:.16em;font-weight:800}'
  ].join("\n");

  function ensureCss(){
    if (document.getElementById(CSS_ID)) return;
    var el = document.createElement("style");
    el.id = CSS_ID; el.textContent = CSS;
    document.head.appendChild(el);
  }

  function esc(v){
    return String(v == null ? "" : v).replace(/[&<>"']/g, function(c){
      return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c];
    });
  }
  function fingerprint(id){
    var s = String(id || "");
    return s ? s.slice(-6).toUpperCase() : null;
  }
  function ago(ms){
    var n = Number(ms) || 0;
    if (!n) return "never";
    var d = Math.max(0, Date.now() - n);
    if (d < 60000) return Math.round(d/1000) + "s ago";
    if (d < 3600000) return Math.round(d/60000) + "m ago";
    if (d < 86400000) return Math.round(d/3600000) + "h ago";
    return Math.round(d/86400000) + "d ago";
  }

  function localFacts(){
    var s = window.state || {};
    var sy = s.sync || {};
    return {
      enabled: sy.enabled === true,
      hasCode: !!sy.syncCode,
      identity: fingerprint(sy.playerId),
      cloudRev: Math.max(0, Math.trunc(Number(sy.cloudRev) || 0)),
      pending: sy.pendingSync === true,
      lastPushedAt: Number(sy.lastPushedAt) || 0,
      lastPulledAt: Number(sy.lastPulledAt) || 0,
      lastError: sy.lastSyncError ? String(sy.lastSyncError).slice(0, 220) : null,
      backend: sy.backend || "(none)",
      skills: Array.isArray(s.tasks) ? s.tasks.length : 0,
      minutes: Math.max(0, Math.trunc(Number(s.totalFocusMin) || 0)),
      historyDays: s.history ? Object.keys(s.history).length : 0,
      newestDay: s.history ? Object.keys(s.history).sort().slice(-1)[0] || "(none)" : "(none)",
      /* WHICH BUILD IS THIS DEVICE ACTUALLY RUNNING?
         A phone that installed the app to its home screen can keep serving an
         old copy from its own cache long after a fix ships. Every previous
         round of this investigation assumed both devices were running the same
         code, and nothing on screen could confirm it. Now one screenshot can. */
      build: (document.documentElement.getAttribute("data-app-version") || "unknown"),
      buildId: (document.documentElement.getAttribute("data-build-id") || "unknown"),
      /* Present only in builds that carry the periodic full re-check. If this
         says NO, this device has not received the sync repair at all and
         nothing it reports about being "in step" can be trusted. */
      hasReconcile: !!window.__fhReconcile
    };
  }

  /* The cloud read goes through the app's own authenticated request path, so
     it carries the same token and secret-hash header a real sync would. A
     probe that authenticated differently would be answering a different
     question than the one that matters. */
  /* A probe that never answers is the worst possible outcome: the report sits
     on "Checking..." and the owner learns nothing, when "the cloud did not
     answer" is itself one of the most useful things it could have told them.
     So the probe is raced against a clock and always resolves. */
  var PROBE_TIMEOUT_MS = 8000;
  function withTimeout(promise){
    return new Promise(function(resolve){
      var settled = false;
      var t = setTimeout(function(){
        if (!settled){ settled = true; resolve({ state:"timeout" }); }
      }, PROBE_TIMEOUT_MS);
      Promise.resolve(promise).then(function(v){
        if (!settled){ settled = true; clearTimeout(t); resolve(v); }
      }, function(e){
        if (!settled){ settled = true; clearTimeout(t);
          resolve({ state:"error", message:String((e && e.message) || e).slice(0,200) }); }
      });
    });
  }

  /* Reading only the revision answers "are we in step" and nothing else - and
     "in step but missing a skill" is precisely the failure that has been
     hunted for a week. So the probe reads the profile blob too and decrypts
     it HERE, on the device, with the key this device already holds. No profile
     is uploaded or changed, and the decrypted copy never leaves the
     function. What it buys is the only answer that actually settles the
     question: the list of skills the cloud is holding, by name. */
  async function probeCloud(){
    var s = window.state || {};
    /* Auth/decryption helpers receive a detached context. The request uses
       existing auth only; diagnosing must never renew or create an identity. */
    var sy = Object.assign({}, s.sync || {});
    if (!sy.playerId) return { state:"no-identity" };
    if (typeof window.supabaseRequest !== "function") return { state:"unavailable" };
    if (typeof window.supabaseTokenIsFresh !== "function") return { state:"unavailable" };
    if (!window.supabaseTokenIsFresh(sy)) return { state:"auth-required" };
    try {
      var resp = await window.supabaseRequest(
        "players?id=eq." + encodeURIComponent(sy.playerId) + "&select=data,cloud_rev,updated_at",
        { method:"GET", prefer:"return=representation", syncContext:sy,
          persistAuth:false, authReadOnly:true });
      if (sy.playerId !== ((window.state && window.state.sync) || {}).playerId) return { state:"identity-changed" };
      if (!resp || !resp.ok) return { state:"http", status: resp ? resp.status : 0 };
      var rows = await resp.json();
      if (!Array.isArray(rows) || !rows.length) return { state:"missing" };
      var row = rows[0];
      var res = { state:"found", rev: Math.trunc(Number(row.cloud_rev) || 0), at: row.updated_at };
      /* The blob is a bonus, not the point. If it cannot be opened the
         revision verdict above still stands, so a decrypt failure is
         reported as its own small fact rather than failing the report. */
      try {
        if (row.data != null && typeof window.decryptStateBlob === "function"){
          var remote = await window.decryptStateBlob(row.data, sy);
          if (remote && Array.isArray(remote.tasks)){
            res.skills = remote.tasks.filter(Boolean).map(function(t){
              return { id:String(t.id), name:String(t.name || "(unnamed)") };
            });
            res.minutes = Math.max(0, Math.trunc(Number(remote.totalFocusMin) || 0));
            res.historyDays = remote.history ? Object.keys(remote.history).length : 0;
          }
        }
      } catch (e) {
        res.blobError = String((e && e.message) || e).slice(0, 160);
      }
      if (sy.playerId !== ((window.state && window.state.sync) || {}).playerId) return { state:"identity-changed" };
      return res;
    } catch (e) {
      if (e && e.code === "FH_SYNC_AUTH_REQUIRED") return { state:"auth-required" };
      return { state:"error", message: String((e && e.message) || e).slice(0, 200) };
    }
  }

  /* Compare by id, report by name. Two skills can share a name across devices
     and still be different rows, which is exactly the confusion that made
     LIFEMAX and LifeMaxxing look like one problem. */
  function skillDiff(localTasks, cloudSkills){
    if (!Array.isArray(cloudSkills)) return null;
    var lmap = {}, i, t;
    for (i = 0; i < localTasks.length; i++){
      t = localTasks[i]; if (t && t.id != null) lmap[String(t.id)] = String(t.name || "(unnamed)");
    }
    var cmap = {};
    for (i = 0; i < cloudSkills.length; i++) cmap[cloudSkills[i].id] = cloudSkills[i].name;
    var onlyCloud = [], onlyLocal = [], k;
    for (k in cmap) if (!(k in lmap)) onlyCloud.push(cmap[k]);
    for (k in lmap) if (!(k in cmap)) onlyLocal.push(lmap[k]);
    return { onlyCloud:onlyCloud, onlyLocal:onlyLocal, cloudCount:cloudSkills.length };
  }

  function verdict(L, C){
    if (!L.hasCode) return ["bad", "NOT CONNECTED — this device has no sync code, so it has no cloud to talk to. Nothing it does will ever reach your other device."];
    if (!L.enabled) return ["warn", "Sync is switched OFF on this device. It has a code, but it is not using it."];
    if (C.state === "no-identity") return ["bad", "NO IDENTITY — this device has a code but never completed a handshake. It cannot push or pull."];
    if (C.state === "auth-required") return ["warn", "CLOUD AUTHENTICATION EXPIRED OR UNAVAILABLE. Diagnose Sync did not renew credentials or create an identity. The cloud profile was not read."];
    if (C.state === "identity-changed") return ["warn", "The sync identity changed during this check. Run Diagnose Sync again to compare the current identity."];
    if (C.state === "missing") return ["bad", "NO CLOUD ROW for this device's identity. Either it was never created, or this device is looking at an identity nothing was ever saved under."];
    if (C.state === "http") return ["bad", "The cloud refused the request (HTTP " + C.status + "). Authentication or row access may be unavailable; Diagnose Sync did not change credentials."];
    if (C.state === "error") return ["bad", "Could not reach the cloud: " + C.message];
    if (C.state === "unavailable") return ["warn", "This build cannot probe the cloud directly."];
    if (C.state === "timeout") return ["bad", "THE CLOUD DID NOT ANSWER within " + Math.round(PROBE_TIMEOUT_MS/1000) + "s. This device cannot reach it, so nothing it does is syncing right now."];
    if (C.rev > L.cloudRev) return ["warn", "THE CLOUD IS AHEAD by " + (C.rev - L.cloudRev) + " revision(s). This device has not pulled. Press Sync now."];
    if (C.rev < L.cloudRev) return ["bad", "THIS DEVICE IS AHEAD OF THE CLOUD (" + L.cloudRev + " vs " + C.rev + "). Its uploads are not landing."];
    if (C.diff && C.diff.onlyCloud.length){
      return ["bad", "IN STEP BY REVISION BUT MISSING CONTENT. The cloud holds " +
        C.diff.onlyCloud.length + " skill(s) this device does not have: " +
        C.diff.onlyCloud.join(", ") + ". Press Sync now — it forces a full download."];
    }
    if (C.diff && C.diff.onlyLocal.length){
      return ["warn", "This device holds " + C.diff.onlyLocal.length +
        " skill(s) the cloud has not received yet: " + C.diff.onlyLocal.join(", ") +
        ". Press Sync now to upload them."];
    }
    /* A matching revision is not evidence that queued work reached the cloud.
       Keep this verdict limited to the content this probe actually checked. */
    if (C.state !== "found" || C.blobError || !C.diff ||
        !Number.isFinite(C.minutes) || !Number.isFinite(C.historyDays)){
      return ["warn", "CLOUD CONTENT NOT VERIFIED. The revision alone cannot confirm that your progress has synced."];
    }
    if (C.minutes !== L.minutes){
      return ["warn", "FOCUS TOTALS DIFFER: this device has " + L.minutes +
        " minutes; the cloud has " + C.minutes + ". Your progress is not yet confirmed in sync."];
    }
    if (C.historyDays !== L.historyDays){
      return ["warn", "FOCUS HISTORY DIFFERS: this device has " + L.historyDays +
        " days; the cloud has " + C.historyDays + ". Your progress is not yet confirmed in sync."];
    }
    if (L.pending){
      return ["warn", "CHANGES ARE STILL QUEUED on this device. A matching cloud revision does not confirm that they have uploaded."];
    }
    if (String(L.lastError || "").trim()){
      return ["warn", "A SYNC ERROR IS STILL RECORDED. Review Last sync error below; this check cannot confirm that sync has recovered."];
    }
    return ["ok", "The checked focus total, history-day count and skill list match the cloud at revision " + C.rev + "."];
  }

  async function run(){
    ensureCss();
    var out = document.getElementById("fh-doctor-out");
    if (out) out.innerHTML = "Checking…";
    var C = await withTimeout(probeCloud());
    /* Work or a background pull may finish while the GET is in flight. Use
       one fresh local view for both displayed counts and the verdict. */
    var L = localFacts();
    C.diff = skillDiff((window.state && window.state.tasks) || [], C.skills);
    var v = verdict(L, C);
    var lines = [];
    lines.push('<h5>Verdict</h5><span class="v ' + v[0] + '">' + esc(v[1]) + '</span>');
    lines.push('<h5>Which build this device is running</h5>' +
      'version <span class="v">' + esc(L.build) + '</span>  ·  ' + esc(L.buildId) + '\n' +
      'sync repair present: ' + (L.hasReconcile
        ? '<span class="ok">yes</span>'
        : '<span class="bad">NO — this device is on an old copy. Close the app fully and reopen it, ' +
          'or remove it from your home screen and add it again. Nothing below can be trusted until this says yes.</span>') +
      '\nCompare this line across your devices FIRST. Two devices on different builds ' +
      'will disagree no matter what else is true.');
    lines.push('<h5>This device’s cloud identity</h5>' +
      '<span class="fh-doctor-id">' + esc(L.identity || "— none —") + '</span>\n' +
      'Open this on your other device. If the two codes above are DIFFERENT, they are\n' +
      'syncing to separate clouds and will never see each other, no matter how many\n' +
      'times you press Sync now. That is the fault, and it needs a deliberate re-claim.');
    lines.push('<h5>This device</h5>' +
      'sync ' + (L.enabled ? "on" : "OFF") + ' · code ' + (L.hasCode ? "yes" : "NO") +
      ' · backend ' + esc(L.backend) + '\n' +
      'revision ' + L.cloudRev + ' · queued change: ' + (L.pending ? "YES" : "no") + '\n' +
      'last pushed ' + ago(L.lastPushedAt) + ' · last pulled ' + ago(L.lastPulledAt) + '\n' +
      'skills ' + L.skills + ' · focus minutes ' + L.minutes + '\n' +
      'history ' + L.historyDays + ' days, newest ' + esc(L.newestDay));
    lines.push('<h5>The cloud, right now</h5>' +
      (C.state === "found"
        ? ('revision ' + C.rev + ' · updated ' + esc(String(C.at || "").slice(0,19).replace("T"," ")))
        : ('unreadable — ' + esc(C.state) + (C.message ? ": " + esc(C.message) : "") +
           (C.status ? " (HTTP " + C.status + ")" : ""))));
    if (C.state === "found"){
      if (C.diff){
        lines.push('<h5>Skills, this device vs the cloud</h5>' +
          'this device ' + L.skills + ' · cloud ' + C.diff.cloudCount + '\n' +
          'in the cloud but NOT here: ' +
            (C.diff.onlyCloud.length ? '<span class="bad">' + esc(C.diff.onlyCloud.join(", ")) + '</span>' : 'none') + '\n' +
          'here but NOT in the cloud: ' +
            (C.diff.onlyLocal.length ? '<span class="warn">' + esc(C.diff.onlyLocal.join(", ")) + '</span>' : 'none') +
          (C.minutes != null ? '\ncloud focus minutes ' + C.minutes + ' · cloud history ' + C.historyDays + ' days' : ''));
      } else if (C.blobError){
        lines.push('<h5>Skills, this device vs the cloud</h5><span class="warn">' +
          'The cloud profile could not be opened on this device: ' + esc(C.blobError) +
          '\nThat usually means this device\u2019s sync secret does not match the row it is reading.</span>');
      }
    }
    if (L.lastError) lines.push('<h5>Last sync error</h5><span class="bad">' + esc(L.lastError) + '</span>');
    if (out) out.innerHTML = lines.join("\n\n");
    return { local:L, cloud:C, verdict:v[1] };
  }

  function plainText(){
    var out = document.getElementById("fh-doctor-out");
    return out ? out.textContent : "";
  }

  function install(){
    var host = document.getElementById("sync-active");
    if (!host) return false;
    if (document.getElementById("fh-doctor-wrap")) return true;
    ensureCss();
    var wrap = document.createElement("div");
    wrap.id = "fh-doctor-wrap";
    var row = document.createElement("div");
    row.className = "row"; row.style.cssText = "gap:8px";
    var btn = document.createElement("button");
    btn.type = "button"; btn.id = "fh-doctor-run";
    btn.textContent = "Diagnose sync";
    btn.title = "Read-only. Checks what this device thinks, what the cloud actually holds, and where they disagree.";
    btn.addEventListener("click", function(){ run(); });
    var copy = document.createElement("button");
    copy.type = "button"; copy.textContent = "Copy report";
    copy.addEventListener("click", function(){
      var t = plainText();
      if (!t) return;
      try { navigator.clipboard.writeText(t); copy.textContent = "Copied";
            setTimeout(function(){ copy.textContent = "Copy report"; }, 1600); } catch(_){}
    });
    row.append(btn, copy);
    var out = document.createElement("div");
    out.id = "fh-doctor-out";
    out.textContent = "Press Diagnose sync. No progress, settings, or identity changes. The download counts toward the cloud transfer budget.";
    wrap.append(row, out);
    host.appendChild(wrap);
    return true;
  }

  function boot(){
    if (!install()) { setTimeout(boot, 800); return; }
    try {
      new MutationObserver(function(){ install(); })
        .observe(document.body, { childList:true, subtree:true });
    } catch(_){}
  }

  window.FH_SYNC_DOCTOR = Object.freeze({ run: run, facts: localFacts, probe: probeCloud, text: plainText });

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", function(){ setTimeout(boot, 900); });
  } else { setTimeout(boot, 900); }
})();

/* asset content-type refresh — v10.32.0 */
