/* Life XP v10.9 — organized progression and World command hub.
 * Presentation and bindings for the existing World, Challenges, Vault and
 * Targets systems. State mutations continue through world-depth.js helpers.
 */
(function(){
  "use strict";
  if (typeof window === "undefined" || window.__fhProgressionHubInstalled) return;
  window.__fhProgressionHubInstalled = true;

  var targetView = "current";
  var worldPreviewZone = null;
  var TAB_LABELS = {
    targets:"Targets", expedition:"Expedition", loot:"Loot", "quests-v85":"Challenges",
    world:"World", vault:"Vault", stable:"Stable", mounts:"Mounts", pets:"Pets",
    drops:"Drops", forge:"Forge", trophies:"Trophy Room", ach:"Achievements",
    store:"Store", ledger:"Ledger", sessions:"Sessions", bestiary:"Bestiary", heat:"Heatmap"
  };
  var GROUPS = [
    ["Goals", ["targets","quests-v85","sessions","heat"]],
    ["Adventure", ["expedition","world","bestiary"]],
    ["Inventory", ["loot","drops","vault","forge","store"]],
    ["Companions", ["stable","mounts","pets"]],
    ["Legacy", ["trophies","ach"]],
    ["Records", ["ledger"]]
  ];

  function s(){ return window.state; }
  function esc(value){
    return String(value == null ? "" : value).replace(/[&<>"']/g, function(ch){
      return ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[ch];
    });
  }
  function say(message, kind){
    try { if (typeof window.toast === "function") window.toast(message, kind || "info"); }
    catch(_){}
  }
  function save(){
    try { if (typeof window.saveState === "function") window.saveState(); }
    catch(err){ console.warn("progression hub save", err); }
  }
  function refresh(){
    try { if (typeof window.renderAll === "function") window.renderAll(); else renderAllPanels(); }
    catch(err){ console.warn("progression hub render", err); }
  }

  function ensureStyle(){
    if (document.getElementById("fh-progression-hub-style")) return;
    var style = document.createElement("style");
    style.id = "fh-progression-hub-style";
    style.textContent =
      ".progress-browse{margin:0 0 12px;border:1px solid var(--border);border-radius:12px;background:var(--panel-2)}"+
      ".progress-browse>summary{list-style:none;display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:48px;padding:0 14px;cursor:pointer;color:var(--ink);font-weight:700}"+
      ".progress-browse>summary::-webkit-details-marker{display:none}.progress-browse>summary:after{content:'Browse';font-size:.72rem;color:var(--ink-dim);font-weight:600;text-transform:uppercase;letter-spacing:.08em}"+
      ".progress-browse[open]>summary{border-bottom:1px solid var(--border)}"+
      ".progress-browse .tabs{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px!important;padding:12px;margin:0!important}"+
      ".progress-tab-group{min-width:0;padding:8px;border:1px solid var(--border);border-radius:10px;background:rgba(0,0,0,.08)}"+
      ".progress-tab-group>span{display:block;margin:0 4px 7px;color:var(--ink-dim);font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.09em}"+
      ".progress-tab-group>div{display:flex;flex-wrap:wrap;gap:6px}.progress-tab-group button{min-height:40px;flex:1 1 auto}"+
      ".hub-kicker{font-size:.72rem;color:var(--ink-dim);text-transform:uppercase;letter-spacing:.08em}.hub-title{margin:2px 0 4px;font-size:1.08rem;color:var(--ink)}"+
      ".hub-copy{margin:0 0 12px;color:var(--ink-dim);font-size:.82rem;line-height:1.5}.hub-empty{padding:16px;border:1px dashed var(--border);border-radius:10px;color:var(--ink-dim);text-align:center;font-size:.82rem}"+
      ".world-command{display:grid;gap:12px}.world-command-hero{--zone:#64748b;position:relative;isolation:isolate;overflow:hidden;padding:18px;border:1px solid color-mix(in srgb,var(--zone) 58%,var(--border));border-radius:18px;background:linear-gradient(135deg,color-mix(in srgb,var(--zone) 24%,var(--panel)) 0%,var(--panel) 58%,color-mix(in srgb,var(--zone) 10%,var(--panel-2)) 100%)}"+
      ".world-command-hero:before{content:'';position:absolute;z-index:-1;inset:-40% -10% auto 38%;height:240px;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,var(--zone) 34%,transparent),transparent 68%)}"+
      ".world-command-top{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.world-command-title{display:flex;gap:12px;align-items:center}.world-zone-mark{width:48px;height:48px;display:grid;place-items:center;border-radius:14px;border:1px solid color-mix(in srgb,var(--zone) 62%,white 10%);background:color-mix(in srgb,var(--zone) 26%,rgba(0,0,0,.28));font-weight:900;letter-spacing:.05em;color:var(--ink)}"+
      ".world-command-title h3{margin:0;font-size:1.35rem;color:var(--ink)}.world-command-title p{margin:4px 0 0;max-width:58ch;color:var(--ink-dim);line-height:1.45;font-size:.8rem}.world-command-status{display:grid;justify-items:end;gap:5px;text-align:right}.world-command-status b{font-size:.72rem;text-transform:uppercase;letter-spacing:.1em;color:color-mix(in srgb,var(--zone) 70%,white)}.world-command-status span{font-size:.72rem;color:var(--ink-dim)}"+
      ".world-command-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:16px}.world-command-metrics>div{padding:9px 10px;border-radius:11px;border:1px solid rgba(255,255,255,.08);background:rgba(0,0,0,.16)}.world-command-metrics b{display:block;color:var(--ink);font-size:.86rem}.world-command-metrics span{display:block;margin-top:2px;color:var(--ink-dim);font-size:.65rem;text-transform:uppercase;letter-spacing:.07em}"+
      ".world-loop{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}.world-loop-step{position:relative;padding:10px 11px;border:1px solid var(--border);border-radius:11px;background:var(--panel-2);min-width:0}.world-loop-step:not(:last-child):after{content:'›';position:absolute;right:-7px;top:50%;z-index:2;transform:translateY(-50%);width:14px;height:20px;display:grid;place-items:center;color:var(--ink-dim);background:var(--panel)}.world-loop-step b{display:block;color:var(--ink);font-size:.75rem}.world-loop-step span{display:block;color:var(--ink-dim);font-size:.66rem;margin-top:3px;line-height:1.35}"+
      ".world-route{display:flex;align-items:stretch;gap:0;padding:9px;border:1px solid var(--border);border-radius:14px;background:var(--panel-2);overflow-x:auto}.world-route-node{--zone:#64748b;position:relative;min-width:116px;flex:1;border:0;background:transparent;color:var(--ink-dim);padding:8px 7px;cursor:pointer;text-align:center}.world-route-node:not(:last-child):after{content:'';position:absolute;top:21px;left:64%;right:-36%;height:2px;background:var(--border-strong)}.world-route-node span{position:relative;z-index:1;width:28px;height:28px;margin:0 auto 6px;display:grid;place-items:center;border-radius:50%;border:2px solid var(--border-strong);background:var(--panel);font-size:.62rem;font-weight:900}.world-route-node b{display:block;font-size:.67rem;white-space:nowrap}.world-route-node.unlocked span{border-color:var(--zone);box-shadow:0 0 0 4px color-mix(in srgb,var(--zone) 15%,transparent)}.world-route-node.preview{color:var(--ink)}.world-route-node.preview span{background:var(--zone);color:#fff}.world-route-node:focus-visible{outline:2px solid var(--accent);outline-offset:-2px;border-radius:8px}"+
      ".w85-zones{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.w85-zone-card{--zone:#64748b;position:relative;overflow:hidden;padding:13px;border:1px solid var(--border);border-radius:14px;background:linear-gradient(145deg,color-mix(in srgb,var(--zone) 8%,var(--panel-2)),var(--panel-2) 58%)}.w85-zone-card:before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--zone)}.w85-zone-card.locked{filter:saturate(.62);opacity:.72}.w85-zone-card.current{border-color:color-mix(in srgb,var(--zone) 72%,white 10%);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--zone) 18%,transparent)}"+
      ".w85-zone-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.w85-zone-title{display:flex;gap:9px;align-items:center}.w85-zone-dot{display:inline-block;width:14px;height:14px;border-radius:4px;transform:rotate(45deg);background:var(--zone);box-shadow:0 0 0 3px color-mix(in srgb,var(--zone) 14%,transparent)}.w85-zone-name{font-weight:800;color:var(--ink)}.w85-zone-state{font-size:.62rem;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-dim)}"+
      ".w85-zone-lore{font-size:.74rem;color:var(--ink-dim);margin:7px 0 9px;line-height:1.45}.w85-zone-intel{display:grid;grid-template-columns:1fr 1fr;gap:7px}.w85-zone-intel>div{padding:8px;border-radius:9px;border:1px solid rgba(255,255,255,.06);background:rgba(0,0,0,.12)}.w85-zone-intel b{display:block;color:var(--ink);font-size:.67rem}.w85-zone-intel span{display:block;color:var(--ink-dim);font-size:.64rem;margin-top:3px;line-height:1.35}.w85-zone-meta{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;color:var(--ink-dim);font-size:.66rem}.w85-zone-actions{display:flex;gap:7px;margin-top:10px}.w85-zone-actions button{min-height:40px;flex:1}.w85-zone-preview{border:1px solid var(--border);background:transparent;color:var(--ink)}"+
      ".q85-q-bar{position:relative}.q85-q-bar>div{min-width:0}.q85-q-claim{min-height:40px}.q85-summary{font-size:.72rem;color:var(--ink-dim)}"+
      ".vault-columns{display:grid;grid-template-columns:1fr 1fr;gap:12px}.vault-section h4{margin:0 0 8px;color:var(--ink)}.vault-cell-btn{min-height:36px}"+
      ".fht-view-switch{display:flex;gap:6px;margin:0 0 10px}.fht-view-switch button{min-height:42px;flex:1}.fht-history-list{display:grid;gap:7px}.fht-history-row{display:grid;grid-template-columns:1fr auto;gap:8px;padding:9px 10px;border:1px solid var(--border);border-radius:10px;background:var(--panel-2)}"+
      ".fht-history-row b{font-size:.82rem}.fht-history-row span{font-size:.72rem;color:var(--ink-dim)}"+
      "@media(max-width:760px){.progress-browse .tabs{grid-template-columns:1fr 1fr}.vault-columns{grid-template-columns:1fr}.world-command-metrics,.world-loop{grid-template-columns:1fr 1fr}.w85-zones{grid-template-columns:1fr}.world-command-top{align-items:stretch}.world-command-status{justify-items:start;text-align:left}}"+
      "@media(max-width:430px){.progress-browse .tabs{grid-template-columns:1fr}.progress-tab-group button{min-height:44px}.world-command-hero{padding:14px}.world-command-top{display:grid}.world-command-metrics,.world-loop{grid-template-columns:1fr}.world-loop-step:not(:last-child):after{display:none}.world-route-node{min-width:100px}.w85-zone-intel{grid-template-columns:1fr}.q85-quest{grid-template-columns:1fr}.q85-q-claim{width:100%}}";
    (document.head || document.documentElement).appendChild(style);
  }

  function updateBrowseLabel(details){
    if (!details) return;
    var current = details.querySelector('.tabs button[aria-pressed="true"]');
    var label = details.querySelector("[data-progress-current]");
    if (label) label.textContent = TAB_LABELS[current && current.dataset.tab] || (current ? current.textContent.trim() : "Targets");
  }

  function organizeTabs(){
    var host = document.getElementById("section-progress");
    var tabs = host && host.querySelector(".tabs");
    if (!tabs) return;
    var details = tabs.closest(".progress-browse");
    if (!details){
      details = document.createElement("details");
      details.className = "progress-browse";
      var summary = document.createElement("summary");
      summary.innerHTML = '<span><span class="hub-kicker">Progression</span><br><span data-progress-current>Targets</span></span>';
      tabs.parentNode.insertBefore(details, tabs);
      details.appendChild(summary);
      details.appendChild(tabs);
    }
    if (!tabs.dataset.grouped){
      var buttons = {};
      Array.prototype.forEach.call(tabs.querySelectorAll('button[role="tab"]'), function(btn){ buttons[btn.dataset.tab] = btn; });
      GROUPS.forEach(function(group){
        var wrap = document.createElement("div");
        wrap.className = "progress-tab-group";
        wrap.setAttribute("role", "presentation");
        var label = document.createElement("span"); label.textContent = group[0];
        var row = document.createElement("div"); row.setAttribute("role", "presentation");
        group[1].forEach(function(id){ if (buttons[id]) row.appendChild(buttons[id]); });
        if (row.children.length){ wrap.appendChild(label); wrap.appendChild(row); tabs.appendChild(wrap); }
      });
      tabs.dataset.grouped = "true";
      tabs.addEventListener("click", function(event){
        var btn = event.target.closest('button[role="tab"]');
        if (!btn) return;
        setTimeout(function(){
          updateBrowseLabel(details);
          details.open = false;
          renderPanel(btn.dataset.tab);
        }, 0);
      });
    }
    updateBrowseLabel(details);
  }

  function renderWorld(){
    var root = document.getElementById("world-panel");
    if (!root || !s() || typeof window.wdEnsureWorld !== "function") return;
    var world = window.wdEnsureWorld(s());
    var zones = window.WD_ZONES || {};
    var zoneIds = Object.keys(zones);
    if (!worldPreviewZone || !zones[worldPreviewZone]) worldPreviewZone = world.currentZone;
    var selectedId = worldPreviewZone || world.currentZone;
    var current = zones[selectedId] || zones[world.currentZone] || zones.verdant_vale;
    var selectedUnlocked = !!world.unlockedZones[selectedId];
    var selectedActive = world.currentZone === selectedId;
    var shardCount = Math.max(0, s().crystalShards|0);
    var journey = window.wdJourneyStatus(s(),world.currentZone);
    var nextZone = journey.nextZone && zones[journey.nextZone];
    var speed = window.fhGearUtilityCompute ? window.fhGearUtilityCompute(s(),{action:"Travel"}).travel.speedPct : 0;
    var routeCopy = !nextZone ? "Final world reached. Keep challenging its enemies and bosses."
      : journey.nextUnlocked ? nextZone.label + " is open. Select it below to continue."
      : "Route to " + nextZone.label + ": " + Math.min(journey.enemyTarget,journey.enemyWins) + "/" + journey.enemyTarget + " enemy victories · boss " + (journey.bossDefeated ? "defeated" : "waiting") + " · " + Math.min(journey.distanceTarget,journey.distance).toFixed(1) + "/" + journey.distanceTarget + " Travel distance.";
    var unlockedCount = zoneIds.filter(function(id){ return !!world.unlockedZones[id]; }).length;
    var roster = typeof window.wdEnemiesForZone === "function" ? window.wdEnemiesForZone(selectedId) : [];
    var bosses = roster.filter(function(enemy){ return !!enemy.boss; });
    var regular = roster.filter(function(enemy){ return !enemy.boss; });
    var bossName = bosses.length ? bosses[0].name : "Regional apex";
    var mark = String(current && current.label || "World").split(/\s+/).map(function(word){ return word.charAt(0); }).join("").slice(0,2).toUpperCase();
    root.innerHTML = '<div class="world-command">'+
      '<div><div class="hub-kicker">Adventure command</div><h3 class="hub-title">World</h3><p class="hub-copy">Fight earns regional gear and clears the next route. Defeat five enemies and the regional boss, then complete the route with Travel. Other actions remain peaceful.</p></div>'+
      '<section class="world-command-hero" style="--zone:'+esc(current && current.tint || "#64748b")+'" aria-label="'+esc(current && current.label || "Current zone")+' briefing">'+
        '<div class="world-command-top"><div class="world-command-title"><span class="world-zone-mark" aria-hidden="true">'+esc(mark)+'</span><div><h3>'+esc(current && current.label || "Verdant Vale")+'</h3><p>'+esc(current && current.lore || "")+'</p></div></div>'+
        '<div class="world-command-status"><b>'+(selectedActive ? "Active Fight zone" : selectedUnlocked ? "Unlocked preview" : "Locked preview")+'</b><span>'+shardCount.toLocaleString()+' World Shards available</span></div></div>'+
        '<div class="world-command-metrics"><div><b>'+unlockedCount+' / '+zoneIds.length+'</b><span>Zones unlocked</span></div><div><b>'+regular.length+'</b><span>Encounter types</span></div><div><b>'+esc(bossName)+'</b><span>90m Fight boss</span></div><div><b>'+Math.max(0,world.bossesDefeated|0)+'</b><span>Bosses defeated</span></div></div>'+
      '</section>'+
      '<div class="world-command-hero" aria-label="Current world route"><h3>'+esc(routeCopy)+'</h3><p>Travel adds one distance per focused minute after the route is cleared. '+(speed ? 'Your mount adds '+speed+'% route speed.' : 'Equip a mount to cover the route faster.')+' Focus minutes, XP and coins stay the same.</p></div>'+
      '<div class="world-loop" aria-label="World gameplay loop"><div class="world-loop-step"><b>1 · Choose a zone</b><span>Preview its roster, boss, mounts, and loot signals.</span></div><div class="world-loop-step"><b>2 · Start Fight</b><span>Only the explicit Fight action activates combat.</span></div><div class="world-loop-step"><b>3 · Build your loadout</b><span>Win equipment from this world and use its combat stats.</span></div><div class="world-loop-step"><b>4 · Claim progression</b><span>Five enemy victories and a boss clear the next Travel route.</span></div></div>'+
      '<nav class="world-route" aria-label="Zone route">'+zoneIds.map(function(id, index){
        var zone = zones[id], unlocked = !!world.unlockedZones[id], preview = selectedId === id;
        return '<button type="button" class="world-route-node'+(unlocked?" unlocked":" locked")+(preview?" preview":"")+'" data-zone-preview="'+esc(id)+'" style="--zone:'+esc(zone.tint || "#64748b")+'" aria-pressed="'+(preview?"true":"false")+'"><span>'+(index+1)+'</span><b>'+esc(zone.label)+'</b></button>';
      }).join("")+'</nav>'+
      '<div class="w85-zones">'+zoneIds.map(function(id){
        var zone = zones[id], unlocked = !!world.unlockedZones[id], active = world.currentZone === id;
        var hasMap = !!(zone.unlockMap && s().lootOwned && (s().lootOwned[zone.unlockMap]|0) > 0);
        var cost = Math.max(0, zone.unlockShards|0);
        var zoneRoster = typeof window.wdEnemiesForZone === "function" ? window.wdEnemiesForZone(id) : [];
        var zoneBoss = zoneRoster.filter(function(enemy){ return !!enemy.boss; })[0];
        var zoneEnemies = zoneRoster.filter(function(enemy){ return !enemy.boss; }).slice(0,3).map(function(enemy){ return enemy.name; });
        var zoneMounts = (zone.mountBias || []).map(prettyId);
        var zoneLoot = window.wdGearForZone(id).slice(-4).map(prettyId);
        var previous = zoneIds[zoneIds.indexOf(id)-1];
        var incoming = previous ? window.wdJourneyStatus(s(),previous) : null;
        var requirement = incoming ? "From " + zones[previous].label + ": 5 enemy wins, a boss win, then 60 Travel distance" : "Starting world";
        var action = active ? '<button class="w85-zone-btn" disabled>Current world</button>'
          : unlocked ? '<button class="w85-zone-btn" data-zone-switch="'+esc(id)+'">Enter world</button>'
          : '<button class="w85-zone-btn" data-zone-unlock="'+esc(id)+'"'+(!incoming || !incoming.ready ? ' disabled' : '')+'>Complete the route</button>';
        return '<article class="w85-zone-card'+(unlocked?"":" locked")+(active?" current":"")+'" style="--zone:'+esc(zone.tint || "#64748b")+'"><div class="w85-zone-head"><div class="w85-zone-title"><span class="w85-zone-dot" aria-hidden="true"></span><span class="w85-zone-name">'+esc(zone.label)+'</span></div><span class="w85-zone-state">'+(active?"Active":unlocked?"Unlocked":"Locked")+'</span></div><div class="w85-zone-lore">'+esc(zone.lore)+'</div><div class="w85-zone-intel"><div><b>Fight roster</b><span>'+esc(zoneEnemies.join(" · ") || "Regional encounters")+'</span></div><div><b>Regional boss</b><span>'+esc(zoneBoss && zoneBoss.name || "90-minute apex")+'</span></div><div><b>Mount families</b><span>'+esc(zoneMounts.join(" · ") || "Regional")+'</span></div><div><b>Loot signals</b><span>'+esc(zoneLoot.join(" · ") || "Mixed drops")+'</span></div></div><div class="w85-zone-meta"><span>'+(unlocked?"Route open":esc(requirement))+'</span><span>'+zoneRoster.length+' total encounters</span></div><div class="w85-zone-actions"><button type="button" class="w85-zone-preview" data-zone-preview="'+esc(id)+'">Briefing</button>'+action+'</div></article>';
      }).join("")+'</div></div>';
    root.onclick = function(event){
      var unlock = event.target.closest("[data-zone-unlock]");
      var change = event.target.closest("[data-zone-switch]");
      var preview = event.target.closest("[data-zone-preview]");
      if (preview){
        worldPreviewZone = preview.dataset.zonePreview;
        renderWorld();
      } else if (unlock){
        var result = window.wdUnlockZone(s(), unlock.dataset.zoneUnlock);
        if (result && result.ok){ worldPreviewZone = unlock.dataset.zoneUnlock; save(); say("World unlocked", "good"); refresh(); }
        else say("Clear the previous world and complete its Travel route first.", "warn");
      } else if (change){
        var moved = window.wdSwitchZone(s(), change.dataset.zoneSwitch);
        if (moved && moved.ok){ worldPreviewZone = change.dataset.zoneSwitch; save(); say("Current world changed.", "good"); refresh(); }
      }
    };
  }

  function prettyId(value){
    return String(value || "").replace(/_/g, " ").replace(/\b\w/g, function(ch){ return ch.toUpperCase(); });
  }

  function questCard(q){
    var target = Math.max(1, q.target|0), progress = Math.max(0, Math.min(target, q.progress|0));
    var pct = Math.round(progress / target * 100);
    return '<article class="q85-quest'+(q.completed?" completed":"")+(q.claimed?" claimed":"")+'"><div><div class="q85-q-label">'+esc(q.label)+'</div><div class="q85-q-progress"><div class="q85-q-bar" role="progressbar" aria-valuemin="0" aria-valuemax="'+target+'" aria-valuenow="'+progress+'"><div style="width:'+pct+'%"></div></div><span>'+progress+' / '+target+'</span></div><div class="q85-q-rewards">'+(q.xp|0)+' XP · '+(q.coins|0)+' coins · '+(q.shards|0)+' World Shards</div></div><button class="q85-q-claim" data-quest-claim="'+esc(q.id)+'" '+(!q.completed || q.claimed ? "disabled" : "")+'>'+(q.claimed?"Claimed":q.completed?"Claim":"In progress")+'</button></article>';
  }

  function renderChallenges(){
    var root = document.getElementById("quests-v85-panel");
    if (!root || !s() || typeof window.wdEnsureQuestRolls !== "function") return;
    var changed = window.wdEnsureQuestRolls(s());
    if (typeof window.wdReconcileQuestProgress === "function") changed = window.wdReconcileQuestProgress(s()) || changed;
    if (changed) save();
    var qs = s().questSystem || {};
    var sections = [["daily","Daily","Resets with the next local day"],["weekly","Weekly","Resets with the next focus week"],["seasonal","Seasonal","Resets with the next month"]];
    root.innerHTML = '<div><div class="hub-kicker">Goals with rewards</div><h3 class="hub-title">Challenges</h3><p class="hub-copy">Minute and session goals are recalculated from your saved records, so corrections move progress both up and down.</p></div>'+sections.map(function(row){
      var list = Array.isArray(qs[row[0]]) ? qs[row[0]] : [];
      var claimed = list.filter(function(q){ return q.claimed; }).length;
      return '<section class="q85-section"><div class="q85-section-header"><h4>'+row[1]+'</h4><span class="q85-roll-time">'+row[2]+'</span></div><div class="q85-summary">'+claimed+' of '+list.length+' claimed</div>'+(list.length ? list.map(questCard).join("") : '<div class="hub-empty">No challenges rolled yet.</div>')+'</section>';
    }).join("");
    root.onclick = function(event){
      var btn = event.target.closest("[data-quest-claim]");
      if (!btn || btn.disabled) return;
      var result = window.wdClaimQuest(s(), btn.dataset.questClaim);
      if (result && result.ok){
        try { if (typeof window.wdCheckAchievements === "function") window.wdCheckAchievements(s()); } catch(_){}
        save(); say("Challenge claimed · +"+result.xp+" XP · +"+result.coins+" coins · +"+result.shards+" World Shards", "good"); refresh();
      } else say("That challenge is not ready to claim.", "warn");
    };
  }

  function instanceInfo(inst){
    var template = typeof window.lootById === "function" ? window.lootById(inst && inst.lootId) : null;
    return { symbol:template ? template[0] : "◇", name:template ? template[1] : ((inst && inst.lootId) || "Unknown item"), tier:(inst && inst.tier) || (template && template[2]) || "common" };
  }
  function vaultCell(inst, action, label){
    var info = instanceInfo(inst);
    return '<div class="vault-cell"><div class="vault-cell-sym">'+esc(info.symbol)+'</div><div class="vault-cell-name" title="'+esc(info.name)+'">'+esc(info.name)+'</div><div class="vault-cell-tier">'+esc(info.tier)+'</div><div class="vault-cell-actions"><button class="vault-cell-btn" '+action+'>'+label+'</button></div></div>';
  }
  function renderVault(){
    var root = document.getElementById("vault-panel");
    if (!root || !s() || typeof window.wdEnsureVault !== "function") return;
    var vault = window.wdEnsureVault(s());
    if (!vault) return;
    var stored = Object.keys(vault.instances || {}).map(function(id){ return vault.instances[id]; });
    var equipped = new Set(Object.keys((s().hero && s().hero.equipped) || {}).map(function(slot){ return s().hero.equipped[slot] && s().hero.equipped[slot].instanceId; }).filter(Boolean));
    var inventory = Object.keys(s().lootInstances || {}).map(function(id){ return s().lootInstances[id]; }).filter(function(inst){ return inst && !equipped.has(inst.iid); });
    root.innerHTML = '<div><div class="hub-kicker">Protected item storage</div><h3 class="hub-title">Vault</h3><p class="hub-copy">Move unequipped instances out of the active Forge inventory without deleting or salvaging them.</p></div><div class="vault-header"><b>'+stored.length+' / '+(vault.cap|0)+' stored</b><span>'+inventory.length+' eligible in inventory</span></div><div class="vault-columns"><section class="vault-section"><h4>Stored</h4><div class="vault-grid">'+(stored.length ? stored.map(function(inst){ return vaultCell(inst, 'data-vault-out="'+esc(inst.iid)+'"', "Move out"); }).join("") : '<div class="hub-empty">The Vault is empty.</div>')+'</div></section><section class="vault-section"><h4>Available to store</h4><div class="vault-grid">'+(inventory.length ? inventory.map(function(inst){ return vaultCell(inst, 'data-vault-in="'+esc(inst.iid)+'"', "Store"); }).join("") : '<div class="hub-empty">No unequipped instances are waiting.</div>')+'</div></section></div>';
    root.onclick = function(event){
      var into = event.target.closest("[data-vault-in]");
      var out = event.target.closest("[data-vault-out]");
      var result = into ? window.wdMoveToVault(s(), into.dataset.vaultIn) : out ? window.wdMoveFromVault(s(), out.dataset.vaultOut) : null;
      if (!result) return;
      if (result.ok){ save(); say(into ? "Item stored in the Vault." : "Item returned to inventory.", "good"); refresh(); }
      else say(result.reason === "equipped_instance" ? "Unequip that item before storing it." : result.reason === "vault_full" ? "The Vault is full." : "That item could not be moved safely.", "warn");
    };
  }

  function targetHistoryRows(){
    return ((s() && s().activityLog) || []).filter(function(entry){ return entry && entry.action === "target_chest_opened"; }).sort(function(a,b){ return (b.at||0)-(a.at||0); });
  }
  function enhanceTargets(){
    var duplicate = document.getElementById("fht-card");
    if (duplicate) duplicate.remove();
    var panel = document.getElementById("fht-tab-panel");
    /* The legacy target renderer replaces panel.innerHTML on every render.
       The dataset survives that replacement, so inspect the real controls. */
    if (!panel || panel.querySelector(".fht-view-switch")) return;
    var current = document.createElement("div");
    current.className = "fht-current-view";
    while (panel.firstChild) current.appendChild(panel.firstChild);
    var history = document.createElement("div");
    history.className = "fht-history-view";
    var rows = targetHistoryRows();
    history.innerHTML = rows.length ? '<div class="fht-history-list">'+rows.map(function(entry){
      var info = entry.after || {};
      var date = new Date(entry.at || entry.timestamp || 0);
      var when = isFinite(date.getTime()) ? date.toLocaleString() : "Saved reward";
      return '<div class="fht-history-row"><div><b>'+esc(info.chest || "Target chest")+'</b><br><span>'+esc(info.scope || "target")+' · '+esc(info.tier || "reward")+(info.loot ? " · "+esc(info.loot) : "")+'</span></div><span>'+esc(when)+'<br>+'+Math.max(0,info.xp|0)+' XP</span></div>';
    }).join("")+'</div>' : '<div class="hub-empty">Opened target chests will appear here. This history is read-only.</div>';
    var controls = document.createElement("div");
    controls.className = "fht-view-switch";
    controls.setAttribute("role", "tablist");
    controls.setAttribute("aria-label", "Targets view");
    controls.innerHTML = '<button type="button" role="tab" data-target-view="current">Current targets</button><button type="button" role="tab" data-target-view="history">Reward history</button>';
    panel.appendChild(controls); panel.appendChild(current); panel.appendChild(history);
    panel.dataset.hubEnhanced = "true";
    function applyView(){
      current.hidden = targetView !== "current";
      history.hidden = targetView !== "history";
      Array.prototype.forEach.call(controls.querySelectorAll("button"), function(btn){ btn.setAttribute("aria-pressed", btn.dataset.targetView === targetView ? "true" : "false"); });
    }
    controls.onclick = function(event){ var btn = event.target.closest("[data-target-view]"); if (!btn) return; targetView = btn.dataset.targetView; applyView(); };
    applyView();
  }

  function renderPanel(tab){
    if (tab === "world") renderWorld();
    else if (tab === "quests-v85") renderChallenges();
    else if (tab === "vault") renderVault();
    else if (tab === "targets") enhanceTargets();
  }
  function renderAllPanels(){
    organizeTabs();
    enhanceTargets();
    renderWorld();
    renderChallenges();
    renderVault();
  }

  function install(){
    ensureStyle();
    renderAllPanels();
    var original = window.renderAll;
    if (typeof original === "function" && !original.__fhProgressionHubWrapped){
      var wrapped = function(){
        var result = original.apply(this, arguments);
        try { renderAllPanels(); } catch(err){ console.warn("progression hub render", err); }
        return result;
      };
      wrapped.__fhProgressionHubWrapped = true;
      window.renderAll = wrapped;
    }
    window.fhRenderProgressionHub = renderAllPanels;
  }

  if (typeof document === "undefined") return;
  if (typeof window.FH_onPrimaryReady === "function") window.FH_onPrimaryReady(function(){ setTimeout(install, 0); });
  else if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function(){ setTimeout(install, 0); }, {once:true});
  else setTimeout(install, 0);
})();

/* asset content-type refresh — v10.32.0 */
