/* Focus Hero v10.7 — organized progression hub.
 * Presentation and bindings for the existing World, Challenges, Vault and
 * Targets systems. State mutations continue through world-depth.js helpers.
 */
(function(){
  "use strict";
  if (typeof window === "undefined" || window.__fhProgressionHubInstalled) return;
  window.__fhProgressionHubInstalled = true;

  var targetView = "current";
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
      ".w85-zone-dot{display:inline-block;width:13px;height:13px;border-radius:50%;margin-right:8px;vertical-align:-1px;box-shadow:0 0 0 3px rgba(255,255,255,.06)}"+
      ".w85-zone-meta{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;color:var(--ink-dim);font-size:.7rem}.w85-zone-actions button{min-height:40px}"+
      ".q85-q-bar{position:relative}.q85-q-bar>div{min-width:0}.q85-q-claim{min-height:40px}.q85-summary{font-size:.72rem;color:var(--ink-dim)}"+
      ".vault-columns{display:grid;grid-template-columns:1fr 1fr;gap:12px}.vault-section h4{margin:0 0 8px;color:var(--ink)}.vault-cell-btn{min-height:36px}"+
      ".fht-view-switch{display:flex;gap:6px;margin:0 0 10px}.fht-view-switch button{min-height:42px;flex:1}.fht-history-list{display:grid;gap:7px}.fht-history-row{display:grid;grid-template-columns:1fr auto;gap:8px;padding:9px 10px;border:1px solid var(--border);border-radius:10px;background:var(--panel-2)}"+
      ".fht-history-row b{font-size:.82rem}.fht-history-row span{font-size:.72rem;color:var(--ink-dim)}"+
      "@media(max-width:760px){.progress-browse .tabs{grid-template-columns:1fr 1fr}.vault-columns{grid-template-columns:1fr}}"+
      "@media(max-width:430px){.progress-browse .tabs{grid-template-columns:1fr}.progress-tab-group button{min-height:44px}.w85-zones{grid-template-columns:1fr}.q85-quest{grid-template-columns:1fr}.q85-q-claim{width:100%}}";
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
    var current = zones[world.currentZone] || zones.verdant_vale;
    var shardCount = Math.max(0, s().crystalShards|0);
    root.innerHTML = '<div><div class="hub-kicker">Adventure map</div><h3 class="hub-title">World</h3><p class="hub-copy">Choose where future Fight and Hunt encounters happen. Locked zones charge exactly the price shown, once.</p></div>'+
      '<div class="w85-current"><b>Current zone: '+esc(current && current.label || "Verdant Vale")+'</b><br><span>'+esc(current && current.lore || "")+' · '+shardCount.toLocaleString()+' Crystal Shards</span></div>'+
      '<div class="w85-zones">'+Object.keys(zones).map(function(id){
        var zone = zones[id], unlocked = !!world.unlockedZones[id], active = world.currentZone === id;
        var hasMap = !!(zone.unlockMap && s().lootOwned && (s().lootOwned[zone.unlockMap]|0) > 0);
        var cost = Math.max(0, zone.unlockShards|0);
        var action = active ? '<button class="w85-zone-btn" disabled>Active</button>'
          : unlocked ? '<button class="w85-zone-btn" data-zone-switch="'+esc(id)+'">Travel here</button>'
          : '<button class="w85-zone-btn" data-zone-unlock="'+esc(id)+'"'+(!hasMap && shardCount < cost ? ' disabled title="Need '+cost+' Crystal Shards"' : '')+'>'+(hasMap ? "Use map to unlock" : "Unlock · "+cost+" shards")+'</button>';
        return '<article class="w85-zone-card'+(unlocked?"":" locked")+(active?" current":"")+'"><div><span class="w85-zone-dot" style="background:'+esc(zone.tint || "#64748b")+'"></span><span class="w85-zone-name">'+esc(zone.label)+'</span></div><div class="w85-zone-lore">'+esc(zone.lore)+'</div><div class="w85-zone-meta"><span>'+(unlocked?"Unlocked":"Locked")+'</span><span>'+(zone.enemyBias||[]).length+' enemy types</span></div><div class="w85-zone-actions">'+action+'</div></article>';
      }).join("")+'</div>';
    root.onclick = function(event){
      var unlock = event.target.closest("[data-zone-unlock]");
      var change = event.target.closest("[data-zone-switch]");
      if (unlock){
        var result = window.wdUnlockZone(s(), unlock.dataset.zoneUnlock);
        if (result && result.ok){ save(); say("Zone unlocked"+(result.spent ? " · "+result.spent+" shards" : " with your map"), "good"); refresh(); }
        else say(result && result.reason === "insufficient_shards" ? "Not enough Crystal Shards yet." : "That zone could not be unlocked.", "warn");
      } else if (change){
        var moved = window.wdSwitchZone(s(), change.dataset.zoneSwitch);
        if (moved && moved.ok){ save(); say("World zone changed.", "good"); refresh(); }
      }
    };
  }

  function questCard(q){
    var target = Math.max(1, q.target|0), progress = Math.max(0, Math.min(target, q.progress|0));
    var pct = Math.round(progress / target * 100);
    return '<article class="q85-quest'+(q.completed?" completed":"")+(q.claimed?" claimed":"")+'"><div><div class="q85-q-label">'+esc(q.label)+'</div><div class="q85-q-progress"><div class="q85-q-bar" role="progressbar" aria-valuemin="0" aria-valuemax="'+target+'" aria-valuenow="'+progress+'"><div style="width:'+pct+'%"></div></div><span>'+progress+' / '+target+'</span></div><div class="q85-q-rewards">'+(q.xp|0)+' XP · '+(q.coins|0)+' coins · '+(q.shards|0)+' shards</div></div><button class="q85-q-claim" data-quest-claim="'+esc(q.id)+'" '+(!q.completed || q.claimed ? "disabled" : "")+'>'+(q.claimed?"Claimed":q.completed?"Claim":"In progress")+'</button></article>';
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
        save(); say("Challenge claimed · +"+result.xp+" XP · +"+result.coins+" coins · +"+result.shards+" shards", "good"); refresh();
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
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function(){ setTimeout(install, 0); }, {once:true});
  else setTimeout(install, 0);
})();
