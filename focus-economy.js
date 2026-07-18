/* Focus Hero v10.5 — live-parity corrections, Priority mode, and Expedition. */
(function(){
  "use strict";
  if (window.__fhEconomyInstalled) return;
  window.__fhEconomyInstalled = true;

  var CROPS = {
    herb:   { name:"Moon herbs", required:60,  yield:{herb:4},   note:"Brews Focus Tonics." },
    timber: { name:"Sunwood",    required:90,  yield:{timber:4}, note:"Builds farm and forge upgrades." },
    ore:    { name:"Ironroot",   required:120, yield:{ore:3},    note:"Builds farm and forge upgrades." }
  };
  var MATERIALS = ["seed","herb","timber","ore"];
  var pendingPriority = null;
  var priorityBypass = false;

  function S(){ return window.state; }
  function n(v){ v=Number(v); return Number.isFinite(v)?v:0; }
  function int(v){ return Math.trunc(n(v)); }
  function clone(v){ try{return JSON.parse(JSON.stringify(v));}catch(_){return v;} }
  function id(prefix){ return prefix+"_"+Date.now()+"_"+Math.random().toString(36).slice(2,9); }
  function esc(v){
    if (typeof window.escapeHtml === "function") return window.escapeHtml(String(v==null?"":v));
    return String(v==null?"":v).replace(/[&<>"']/g,function(c){return({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[c];});
  }
  function unionEvents(a,b){
    var map=new Map();
    [a,b].forEach(function(list){ (Array.isArray(list)?list:[]).forEach(function(e){
      if(!e||!e.id)return; var cur=map.get(e.id);
      if(!cur || n(e.updatedAt||e.at)>=n(cur.updatedAt||cur.at)) map.set(e.id,clone(e));
    }); });
    return Array.from(map.values()).sort(function(x,y){return n(x.at)-n(y.at);}).slice(-1000);
  }
  function normalized(raw){
    var e=(raw&&typeof raw==="object"&&!Array.isArray(raw))?clone(raw):{};
    e.version=Math.max(1,int(e.version));
    if(!e.grants||typeof e.grants!=="object"||Array.isArray(e.grants))e.grants={};
    if(!Array.isArray(e.spends))e.spends=[];
    if(!Array.isArray(e.harvests))e.harvests=[];
    if(!Array.isArray(e.plots))e.plots=[];
    e.unlockedPlots=Math.max(2,Math.min(3,int(e.unlockedPlots)||2));
    e.installedAt=Math.max(0,n(e.installedAt));
    for(var i=0;i<3;i++){
      if(!e.plots[i]||typeof e.plots[i]!=="object") e.plots[i]={id:"plot"+(i+1),crop:null,plantedAt:0,updatedAt:0};
      if(!e.plots[i].id)e.plots[i].id="plot"+(i+1);
    }
    return e;
  }
  function ensure(){
    var s=S(); if(!s)return null;
    s.focusEconomy=normalized(s.focusEconomy);
    if(!s.focusEconomy.installedAt)s.focusEconomy.installedAt=Date.now();
    if(!s.settings||typeof s.settings!=="object")s.settings={};
    if(typeof s.settings.priorityMode!=="boolean")s.settings.priorityMode=false;
    if(!s.timer||typeof s.timer!=="object")s.timer={};
    if(typeof s.timer.priorityRun!=="boolean")s.timer.priorityRun=false;
    return s.focusEconomy;
  }

  window.fhMergeFocusEconomy=function(local,remote){
    var a=normalized(local), b=normalized(remote), out=normalized(a);
    Object.keys(b.grants).forEach(function(k){
      var x=a.grants[k], y=b.grants[k];
      if(!x || n(y&&y.updatedAt)>=n(x&&x.updatedAt)) out.grants[k]=clone(y);
    });
    out.spends=unionEvents(a.spends,b.spends);
    out.harvests=unionEvents(a.harvests,b.harvests);
    var pmap=new Map();
    a.plots.concat(b.plots).forEach(function(p){ if(!p||!p.id)return; var cur=pmap.get(p.id); if(!cur||n(p.updatedAt)>=n(cur.updatedAt))pmap.set(p.id,clone(p)); });
    out.plots=Array.from(pmap.values()).sort(function(x,y){return String(x.id).localeCompare(String(y.id));}).slice(0,3);
    out.unlockedPlots=Math.max(a.unlockedPlots,b.unlockedPlots);
    out.installedAt=Math.min.apply(null,[a.installedAt,b.installedAt].filter(Boolean).concat([Date.now()]));
    return normalized(out);
  };

  function materialZero(){ return {seed:0,herb:0,timber:0,ore:0}; }
  function rewardGrant(minutes,action,priority){
    var m=Math.max(0,int(minutes)), mats=materialZero(), units=Math.floor(m/15);
    mats.seed=Math.floor(m/30);
    switch(String(action||"Travel")){
      case "Fight": mats.ore+=units; break;
      case "Hunt": mats.herb+=units; break;
      case "Meditate": case "Rest": mats.herb+=units; break;
      case "Loot": mats.seed+=units; break;
      case "Craft": mats.timber+=Math.ceil(units/2); mats.ore+=Math.floor(units/2); break;
      default: mats.timber+=units;
    }
    return {orbs:Math.floor(m/25)+(priority?1:0),materials:mats,farmMinutes:m};
  }
  function recordTimeOnly(rec){
    try{return !!(rec&&(rec.timeOnly||(typeof window.taskIsTimeOnly==="function"&&window.taskIsTimeOnly(rec.taskId))||(typeof window.taskIsTimeOnlyByName==="function"&&window.taskIsTimeOnlyByName(rec.taskName))));}catch(_){return false;}
  }
  function grantForRecord(rec){
    var floor=Math.max(1,int(S().settings&&S().settings.minRewardMinutes)||5);
    if(!rec||!rec.rewarded||recordTimeOnly(rec)||int(rec.minutes)<floor)return {orbs:0,materials:materialZero(),farmMinutes:0};
    return rewardGrant(rec.minutes,rec.action,!!rec.priorityVerified);
  }
  function upsertGrant(rec){
    var e=ensure(); if(!e||!rec||!rec.id)return;
    var g=grantForRecord(rec), old=e.grants[rec.id]||{};
    e.grants[rec.id]={id:rec.id,sessionId:rec.id,source:rec.source||"session",minutes:int(rec.minutes),action:rec.action||"Travel",
      priority:!!rec.priorityVerified,orbs:int(g.orbs),materials:g.materials,farmMinutes:int(g.farmMinutes),
      at:n(old.at)||n(rec.at)||Date.now(),updatedAt:Date.now(),deleted:false};
  }
  function reverseGrant(sessionId){
    var e=ensure(), old=e&&e.grants[sessionId]; if(!old)return;
    old=clone(old); old.orbs=0; old.materials=materialZero(); old.farmMinutes=0; old.deleted=true; old.updatedAt=Date.now(); e.grants[sessionId]=old;
  }
  function addLedgerCorrection(editId,minutes,action){
    var e=ensure(); if(!e||!editId)return;
    var g=rewardGrant(Math.abs(int(minutes)),action,false), sign=int(minutes)<0?-1:1;
    MATERIALS.forEach(function(k){g.materials[k]=int(g.materials[k])*sign;});
    e.grants["correction_"+editId]={id:"correction_"+editId,source:"ledger-correction",minutes:int(minutes),action:action||"Travel",
      priority:false,orbs:int(g.orbs)*sign,materials:g.materials,farmMinutes:int(g.farmMinutes)*sign,at:Date.now(),updatedAt:Date.now(),deleted:false};
  }
  function totals(){
    var e=ensure(), out={orbs:0,materials:materialZero(),farmMinutes:0}; if(!e)return out;
    Object.keys(e.grants).forEach(function(k){var g=e.grants[k];if(!g||g.deleted)return;out.orbs+=int(g.orbs);out.farmMinutes+=int(g.farmMinutes);MATERIALS.forEach(function(m){out.materials[m]+=int(g.materials&&g.materials[m]);});});
    e.harvests.forEach(function(h){MATERIALS.forEach(function(m){out.materials[m]+=int(h&&h.yield&&h.yield[m]);});});
    e.spends.forEach(function(sp){out.orbs-=int(sp&&sp.cost&&sp.cost.orbs);out.farmMinutes+=int(sp&&sp.effect&&sp.effect.farmMinutes);MATERIALS.forEach(function(m){out.materials[m]-=int(sp&&sp.cost&&sp.cost.materials&&sp.cost.materials[m]);});});
    out.orbs=Math.max(0,out.orbs); out.farmMinutes=Math.max(0,out.farmMinutes); MATERIALS.forEach(function(m){out.materials[m]=Math.max(0,out.materials[m]);});
    return out;
  }
  function canAfford(cost){var t=totals();if(int(cost.orbs)>t.orbs)return false;return MATERIALS.every(function(m){return int(cost.materials&&cost.materials[m])<=t.materials[m];});}
  function spend(kind,cost,effect){
    var e=ensure(); cost=cost||{}; if(!e||!canAfford(cost))return false;
    e.spends.push({id:id("spend"),kind:kind,cost:{orbs:int(cost.orbs),materials:Object.assign(materialZero(),cost.materials||{})},effect:effect||{},at:Date.now(),updatedAt:Date.now()});
    e.spends=e.spends.slice(-1000); return true;
  }

  function today(){
    if(typeof window.todayKey==="function")return window.todayKey();
    var d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
  }
  function liveStreakPreview(){
    var s=S(), tk=today(), prev=s.lastFocusDate;
    if(prev===tk)return Math.max(0,int(s.streak)); if(!prev)return 1;
    var pd=new Date(prev+"T00:00:00"),td=new Date(tk+"T00:00:00"),diff=Math.round((td-pd)/86400000);
    return diff===1?Math.max(1,int(s.streak)+1):1;
  }
  function liveRewardContext(minutes,taskId,taskName,forced){
    var s=S(), m=Math.max(0,int(minutes)), floor=Math.max(1,int(s.settings&&s.settings.minRewardMinutes)||5);
    var timeOnly=false; try{timeOnly=(typeof window.taskIsTimeOnly==="function"&&window.taskIsTimeOnly(taskId))||(typeof window.taskIsTimeOnlyByName==="function"&&window.taskIsTimeOnlyByName(taskName));}catch(_){}
    var combo=forced&&forced.combo!=null?int(forced.combo):(s.combo&&s.combo.date===today()?int(s.combo.count):0);
    var streak=forced&&forced.streak!=null?int(forced.streak):liveStreakPreview();
    var breakdown=window.computeXpBreakdown(m,{comboCount:combo,streakDays:streak,settings:s.settings});
    var eligible=!timeOnly&&m>=floor, raw=eligible?int(breakdown.total):0;
    var xp=eligible&&typeof window.rewardXpTotal==="function"?int(window.rewardXpTotal(raw)):raw;
    var coinBase=eligible&&typeof window.computeCoins==="function"?int(window.computeCoins(m,false)):0;
    var coins=eligible&&typeof window.computeCoins==="function"?int(window.computeCoins(m,true)):0;
    return {eligible:eligible,timeOnly:timeOnly,combo:combo,streak:streak,breakdown:breakdown,xpRaw:raw,xp:xp,xpMultiplier:raw?xp/raw:1,coinBase:coinBase,coins:coins,coinMultiplier:coinBase?coins/coinBase:1};
  }
  function totalHeroXp(){var s=S();return typeof window.totalXpForLevel==="function"?window.totalXpForLevel(s.hero.level)+int(s.hero.xp):int(s.hero.xp);}
  function addXp(amount){if(amount>0&&typeof window.addXpQuiet==="function")window.addXpQuiet(amount);}
  function removeXp(amount){if(amount>0&&typeof window.removeXpQuiet==="function")window.removeXpQuiet(amount);}
  function applyCoinDelta(delta){
    var s=S(), d=int(delta); if(!d)return;
    if(d>0)s.coinsEarned=Math.max(0,int(s.coinsEarned)+d);else s.coinsSpent=Math.max(0,int(s.coinsSpent)-d);
    s.coins=Math.max(0,int(s.coinsEarned)-int(s.coinsSpent));
  }
  function patchRecord(rec,ctx){
    if(!rec||!ctx)return;
    rec.xpRaw=int(ctx.xpRaw); rec.xpMultiplierApplied=n(ctx.xpMultiplier)||1; rec.xp=int(ctx.xp); rec.originalXp=Math.max(int(rec.originalXp),int(ctx.xp));
    rec.coins=int(ctx.coins); rec.originalCoins=Math.max(int(rec.originalCoins),int(ctx.coins)); rec.coinMultiplierApplied=n(ctx.coinMultiplier)||1;
    rec.comboPriorCount=int(ctx.combo); rec.streakForCalc=int(ctx.streak);
  }
  function newRecord(before){var log=S().sessionsLog||[];for(var i=log.length-1;i>=0;i--){if(log[i]&&log[i].id&&!before.has(log[i].id))return log[i];}return null;}
  function saveRender(){try{window.saveState();}catch(_){}try{window.renderAll();}catch(_){}try{render();updatePriorityUi();}catch(_){}}
  function latestEditId(){var log=S().editLog||[], edit=log[log.length-1];return edit&&edit.id?String(edit.id):"";}
  function applyEggMinuteCorrection(delta,eventId,timeOnly,source){
    if(!delta||timeOnly||typeof window.eggApplyMinuteCorrection!=="function")return null;
    try{return window.eggApplyMinuteCorrection(S(),int(delta),String(eventId||""),source||{});}catch(_){return null;}
  }

  function installRewardParity(){
    var originalPreview=window.sessionEditXpPreview;
    if(typeof originalPreview==="function"&&!originalPreview.__fh105){
      var preview=function(rec,minutes){var r=originalPreview.call(this,rec,minutes),raw=int(r.xpAfter),mult=n(rec&&rec.xpMultiplierApplied)||1;r.xpRawAfter=raw;r.xpAfter=r.willReward?Math.round(raw*mult):0;return r;};preview.__fh105=true;window.sessionEditXpPreview=preview;
    }
    var ledger=window.applyTaskTimeAdjustment;
    if(typeof ledger==="function"&&!ledger.__fh105){
      var lw=function(taskId,delta){
        var s=S(), task=(s.tasks||[]).find(function(t){return t&&t.id===taskId;})||{}, before=new Set((s.sessionsLog||[]).map(function(r){return r&&r.id;}));
        var forced={combo:s.combo&&s.combo.date===today()?int(s.combo.count):0,streak:liveStreakPreview()};
        var result=ledger.apply(this,arguments); if(!result||!result.ok)return result;
        var d=int(result.delta), ctx=liveRewardContext(Math.abs(d),taskId,task.name,forced);
        var base=ctx.timeOnly?0:(typeof window.ledgerXpForMinutes==="function"?int(window.ledgerXpForMinutes(d)):int(ctx.breakdown.base));
        var extra=Math.max(0,int(ctx.xp)-base); if(d>0)addXp(extra);else removeXp(extra);
        if(ctx.eligible)applyCoinDelta(d>0?ctx.coins:-ctx.coins);
        var rec=d>0?newRecord(before):null;
        if(rec){patchRecord(rec,ctx);upsertGrant(rec);}else if(d<0){var edit=(s.editLog||[])[(s.editLog||[]).length-1];addLedgerCorrection(edit&&edit.id,d,rec&&rec.action||((s.adventure&&s.adventure.action)||"Travel"));}
        if(d>0&&ctx.eligible&&rec)applyEggMinuteCorrection(d,"egg_ledger_"+rec.id,ctx.timeOnly,{ownerId:rec.id,taskId:taskId,kind:"ledger"});
        else if(d<0)applyEggMinuteCorrection(d,"egg_ledger_edit_"+latestEditId(),ctx.timeOnly,{taskId:taskId,kind:"ledger-correction"});
        result.xpDelta=d>0?ctx.xp:-ctx.xp;result.coinDelta=d>0?ctx.coins:-ctx.coins;saveRender();return result;
      };lw.__fh105=true;window.applyTaskTimeAdjustment=lw;
    }
    var editFn=window.applySessionEdit;
    if(typeof editFn==="function"&&!editFn.__fh105){
      var ew=function(sessionId,newMinutes){
        var rec=(S().sessionsLog||[]).find(function(r){return r&&r.id===sessionId;}), old=rec?clone(rec):null, oldXp=rec?int(rec.xp):0, oldCoins=rec?int(rec.coins):0;
        var result=editFn.apply(this,arguments); if(!result||!result.ok||!rec)return result;
        var rawInfo=window.computeXpBreakdown(int(rec.minutes),{comboCount:rec.source==="stopwatch"?0:int(rec.comboPriorCount),streakDays:int(rec.streakForCalc||rec.streakBefore),settings:S().settings});
        var rewarded=!!rec.rewarded&&!recordTimeOnly(rec), raw=rewarded?int(rawInfo.total):0, mult=n(old&&old.xpMultiplierApplied)||1, desired=Math.round(raw*mult);
        if(int(rec.xp)!==desired){var correction=desired-int(rec.xp);if(correction>0)addXp(correction);else removeXp(-correction);rec.xp=desired;}
        rec.xpRaw=raw;rec.xpMultiplierApplied=mult;rec.originalXp=Math.max(int(rec.originalXp),oldXp);
        var coinBase=rewarded?int(window.computeCoins(rec.minutes,false)):0, coinMult=n(old&&old.coinMultiplierApplied)||1, coins=rewarded?Math.round(coinBase*coinMult):0;
        applyCoinDelta(coins-oldCoins);rec.coins=coins;rec.coinMultiplierApplied=coinMult;rec.originalCoins=Math.max(int(rec.originalCoins),oldCoins);
        upsertGrant(rec);
        var oldEggMinutes=old&&old.rewarded?int(old.minutes):0;
        var newEggMinutes=rec.rewarded&&!recordTimeOnly(rec)?int(rec.minutes):0;
        applyEggMinuteCorrection(newEggMinutes-oldEggMinutes,"egg_session_edit_"+latestEditId(),false,{ownerId:rec.id,taskId:rec.taskId||"",kind:"session-edit"});
        result.xpDelta=desired-oldXp;result.coinDelta=coins-oldCoins;saveRender();return result;
      };ew.__fh105=true;window.applySessionEdit=ew;
    }
    var del=window.deleteSessionRecord;
    if(typeof del==="function"&&!del.__fh105){
      var dw=function(sessionId){var rec=(S().sessionsLog||[]).find(function(r){return r&&r.id===sessionId;}),snapshot=rec?clone(rec):null,coins=rec?int(rec.coins):0;var r=del.apply(this,arguments);if(r&&r.ok){if(coins)applyCoinDelta(-coins);reverseGrant(sessionId);if(snapshot&&snapshot.rewarded)applyEggMinuteCorrection(-int(snapshot.minutes),"egg_session_delete_"+(latestEditId()||sessionId),false,{ownerId:sessionId,taskId:snapshot.taskId||"",kind:"session-delete"});saveRender();}return r;};dw.__fh105=true;window.deleteSessionRecord=dw;
    }
  }

  function finishRecordedSession(original,args,priorityPassed){
    var before=new Set((S().sessionsLog||[]).map(function(r){return r&&r.id;})), xpBefore=totalHeroXp();
    priorityBypass=true; var result; try{result=original.apply(window,args);}finally{priorityBypass=false;}
    var claim=args&&args[0], claimId=claim&&claim.sessionId;
    var rec=newRecord(before) || (result&&result.record) || (claimId?(S().sessionsLog||[]).find(function(r){return r&&r.id===claimId;}):null);
    if(rec){rec.priorityVerified=!!priorityPassed||!!rec.priorityVerified;var raw=int(rec.xpRaw!=null?rec.xpRaw:rec.xp),actual=rec.rewarded?int(window.rewardXpTotal(raw)):0;var ctx={xpRaw:raw,xp:actual,xpMultiplier:raw?actual/raw:1,coins:rec.rewarded?int(window.computeCoins(rec.minutes,true)):0,coinBase:rec.rewarded?int(window.computeCoins(rec.minutes,false)):0,combo:int(rec.comboPriorCount),streak:int(rec.streakForCalc)};ctx.coinMultiplier=ctx.coinBase?ctx.coins/ctx.coinBase:1;patchRecord(rec,ctx);upsertGrant(rec);}
    S().timer.priorityRun=false;saveRender();return result;
  }
  function priorityEnabledForRun(){var s=S();return !!(s&&s.timer&&(s.timer.priorityRun||s.settings.priorityMode));}
  function showPriority(kind,original,args){pendingPriority={kind:kind,original:original,args:Array.prototype.slice.call(args)};var m=document.getElementById("priority-check-modal");if(m)m.hidden=false;}
  function cancelPriorityRun(){
    var s=S(); if(!pendingPriority&&!s.pendingFocusClaim)return;
    var wasSw=pendingPriority&&pendingPriority.kind==="stopwatch";pendingPriority=null;
    if(wasSw){s.timer.swStartedAt=0;s.timer.swAccumulatedMs=0;s.timer.swSessionStartedAt=0;s.timer.swLaps=[];}else{s.timer.msLeft=(typeof window.modeMinutes==="function"?window.modeMinutes("focus"):int(s.settings.focusMin)||25)*60000;}
    s.timer.running=false;s.timer.endAt=0;s.timer.pausedAt=0;s.timer.activeTaskId=null;s.timer.activeTaskNameAtStart=null;s.timer.priorityRun=false;s.canceledSessionCount=int(s.canceledSessionCount)+1;
    var m=document.getElementById("priority-check-modal");if(m)m.hidden=true;try{window.stopKeepalive();window.releaseWakeLock();}catch(_){}try{window.logLine("Priority run canceled — no minutes, XP, loot, or materials counted.");}catch(_){}try{window.toast("Priority run canceled. Nothing counted.","warn");}catch(_){}try{if(typeof window.clearPendingFocusClaim==="function")window.clearPendingFocusClaim();}catch(_){}saveRender();
  }
  function installPriorityWrappers(){
    var start=window.startTimer;if(typeof start==="function"&&!start.__fhPriority){var sw=function(){var s=S(),fresh=!s.timer.running&&((typeof window.isStopwatch==="function"&&window.isStopwatch())?int(s.timer.swAccumulatedMs)===0:int(s.timer.msLeft)>=(typeof window.focusPlannedMs==="function"?int(window.focusPlannedMs()):int(s.settings.focusMin)*60000));if(fresh)s.timer.priorityRun=!!s.settings.priorityMode;var r=start.apply(this,arguments);updatePriorityUi();return r;};sw.__fhPriority=true;window.startTimer=sw;}
    var commit=window.commitFocusTimerSession;if(typeof commit==="function"&&!commit.__fhPriority){var cw=function(){var claim=arguments&&arguments[0];if(!priorityBypass&&claim&&claim.priorityVerified)return finishRecordedSession(commit,arguments,true);if(!priorityBypass&&priorityEnabledForRun()){showPriority("timer",commit,arguments);return{pendingPriority:true};}return finishRecordedSession(commit,arguments,false);};cw.__fhPriority=true;window.commitFocusTimerSession=cw;}
    var stop=window.finalizeStopwatch;if(typeof stop==="function"&&!stop.__fhPriority){var fw=function(){var s=S();if(!priorityBypass&&priorityEnabledForRun()){
      if(s.timer.running){s.timer.swAccumulatedMs=int(s.timer.swAccumulatedMs)+Math.max(0,Date.now()-n(s.timer.swStartedAt));s.timer.swStartedAt=0;s.timer.running=false;}
      if(Math.floor(int(s.timer.swAccumulatedMs)/60000)>0){showPriority("stopwatch",stop,arguments);saveRender();return{pendingPriority:true};}
    }return finishRecordedSession(stop,arguments,false);};fw.__fhPriority=true;window.finalizeStopwatch=fw;}
    ["resetTimer","cancelSession","gameModeResetSession"].forEach(function(name){var orig=window[name];if(typeof orig!=="function"||orig.__fhPriority)return;var w=function(){var r=orig.apply(this,arguments);if(r!==false){S().timer.priorityRun=false;updatePriorityUi();}return r;};w.__fhPriority=true;window[name]=w;});
  }

  function plotProgress(plot){var spec=plot&&CROPS[plot.crop];if(!spec)return 0;return Math.max(0,Math.min(spec.required,totals().farmMinutes-int(plot.plantedAt)));}
  function plant(plotId,cropId){var e=ensure(),p=e.plots.find(function(x){return x.id===plotId;}),spec=CROPS[cropId];if(!p||!spec||p.crop)return;if(!spend("plant",{materials:{seed:1}},{crop:cropId}))return void window.toast("You need 1 seed.","warn");p.crop=cropId;p.plantedAt=totals().farmMinutes;p.updatedAt=Date.now();saveRender();}
  function harvest(plotId){var e=ensure(),p=e.plots.find(function(x){return x.id===plotId;}),spec=p&&CROPS[p.crop];if(!p||!spec||plotProgress(p)<spec.required)return;var h={id:id("harvest"),plotId:plotId,crop:p.crop,yield:clone(spec.yield),at:Date.now(),updatedAt:Date.now()};e.harvests.push(h);e.harvests=e.harvests.slice(-1000);p.crop=null;p.plantedAt=0;p.updatedAt=Date.now();window.toast(spec.name+" harvested.","good");saveRender();}
  function accelerate(){if(!spend("farm-boost",{orbs:1},{farmMinutes:25}))return void window.toast("You need 1 Focus Orb.","warn");window.toast("Farm advanced by 25 focus minutes.","good");saveRender();}
  function unlockPlot(){var e=ensure();if(e.unlockedPlots>=3)return;if(!spend("unlock-plot",{orbs:3,materials:{timber:5,ore:4}},{unlockedPlot:3}))return void window.toast("Need 3 Orbs, 5 Timber, and 4 Ore.","warn");e.unlockedPlots=3;saveRender();}
  function craftTonic(){if(!spend("focus-tonic",{orbs:1,materials:{herb:4}},{boost:"xp25"}))return void window.toast("Need 1 Orb and 4 Herbs.","warn");if(!S().store||typeof S().store!=="object")S().store={purchased:[],boosts:[],unlockedThemes:[]};if(!Array.isArray(S().store.boosts))S().store.boosts=[];S().store.boosts.push({uid:id("farm_tonic"),kind:"xp",mult:1.25,durationMs:45*60000,name:"Farm Focus Tonic",purchasedAt:Date.now(),activatedAt:null,used:false});window.toast("Focus Tonic crafted. Activate it in Store.","good");saveRender();}
  function craftForgeKit(){if(!spend("forge-kit",{orbs:1,materials:{timber:3,ore:3}},{dust:8,shards:1}))return void window.toast("Need 1 Orb, 3 Timber, and 3 Ore.","warn");if(!S().loot||typeof S().loot!=="object")S().loot={};if(!S().loot.materials||typeof S().loot.materials!=="object")S().loot.materials={dust:0,shards:0,essence:0};S().loot.materials.dust=int(S().loot.materials.dust)+8;S().loot.materials.shards=int(S().loot.materials.shards)+1;window.toast("Forge Kit crafted: +8 Dust, +1 Shard.","good");saveRender();}

  function render(){
    var host=document.getElementById("focus-economy-panel");if(!host)return;var e=ensure(),t=totals();
    var plots=e.plots.slice(0,e.unlockedPlots).map(function(p){var spec=CROPS[p.crop],progress=plotProgress(p),pct=spec?Math.min(100,Math.round(progress/spec.required*100)):0;
      if(!spec)return '<div class="fhe-plot"><b>Empty plot</b><span>Plant 1 seed. Growth advances only from credited focus minutes.</span><select data-fhe-crop="'+esc(p.id)+'"><option value="herb">Moon herbs · 60m</option><option value="timber">Sunwood · 90m</option><option value="ore">Ironroot · 120m</option></select><button type="button" data-fhe-plant="'+esc(p.id)+'">Plant</button></div>';
      return '<div class="fhe-plot"><b>'+esc(spec.name)+'</b><span>'+progress+' / '+spec.required+' growth minutes · '+esc(spec.note)+'</span><div class="fhe-track"><i style="width:'+pct+'%"></i></div><button type="button" data-fhe-harvest="'+esc(p.id)+'" '+(progress<spec.required?'disabled':'')+'>Harvest</button></div>';
    }).join("");
    host.innerHTML='<div class="fhe-head"><div><h3>Expedition</h3><p>One organized home for Orbs, materials, farming, and crafting.</p></div><button type="button" data-fhe-boost>Spend 1 Orb · +25 growth</button></div>'+
      '<div class="fhe-res"><div><b>'+t.orbs+'</b><span>Focus Orbs</span></div><div><b>'+t.materials.seed+'</b><span>Seeds</span></div><div><b>'+t.materials.herb+'</b><span>Herbs</span></div><div><b>'+t.materials.timber+'</b><span>Timber</span></div><div><b>'+t.materials.ore+'</b><span>Ore</span></div></div>'+
      '<p class="fhe-rule">Credited sessions earn 1 Orb per 25 minutes, 1 action-based material per 15 minutes, and 1 seed per 30 minutes. A verified Priority run adds 1 Orb. Minute corrections recalculate these same grants.</p>'+
      '<h4>Focus farm</h4><div class="fhe-plots">'+plots+'</div>'+(e.unlockedPlots<3?'<button type="button" data-fhe-unlock>Unlock third plot · 3 Orbs + 5 Timber + 4 Ore</button>':'')+
      '<h4>Workshop</h4><div class="fhe-work"><button type="button" data-fhe-tonic><b>Focus Tonic</b><span>1 Orb + 4 Herbs → +25% XP boost for 45m</span></button><button type="button" data-fhe-forge><b>Forge Kit</b><span>1 Orb + 3 Timber + 3 Ore → 8 Dust + 1 Shard</span></button></div>';
    host.querySelectorAll("[data-fhe-plant]").forEach(function(b){b.onclick=function(){var sel=host.querySelector('[data-fhe-crop="'+CSS.escape(b.dataset.fhePlant)+'"]');plant(b.dataset.fhePlant,sel&&sel.value);};});
    host.querySelectorAll("[data-fhe-harvest]").forEach(function(b){b.onclick=function(){harvest(b.dataset.fheHarvest);};});
    var b=host.querySelector("[data-fhe-boost]");if(b)b.onclick=accelerate;b=host.querySelector("[data-fhe-unlock]");if(b)b.onclick=unlockPlot;b=host.querySelector("[data-fhe-tonic]");if(b)b.onclick=craftTonic;b=host.querySelector("[data-fhe-forge]");if(b)b.onclick=craftForgeKit;
  }
  window.fhRenderFocusEconomy=render;

  function updateToggle(){var el=document.getElementById("tog-prioritymode"),on=!!(S()&&S().settings&&S().settings.priorityMode);if(!el)return;el.setAttribute("aria-checked",on?"true":"false");el.classList.toggle("on",on);}
  function updatePriorityUi(){
    var s=S();if(!s)return;ensure();var badge=document.getElementById("priority-mode-badge"),armed=!!s.timer.priorityRun&&(s.timer.running||int(s.timer.swAccumulatedMs)>0||int(s.timer.msLeft)===0),on=!!s.settings.priorityMode;
    if(badge){badge.textContent=armed?"Priority run · verify at finish":(on?"Priority mode · ON":"Priority mode · OFF");badge.classList.toggle("armed",armed);badge.setAttribute("aria-pressed",on?"true":"false");}
    var reset=document.getElementById("btn-priority-reset");if(reset)reset.hidden=!armed;updateToggle();
  }
  function togglePriority(){ensure();S().settings.priorityMode=!S().settings.priorityMode;window.saveState();updatePriorityUi();window.toast(S().settings.priorityMode?"Priority mode on for new focus runs.":"Priority mode off for new focus runs.","info");}
  function installDom(){
    if(!document.getElementById("fhe-style")){var st=document.createElement("style");st.id="fhe-style";st.textContent=".fhe-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.fhe-head h3{margin:0}.fhe-head p,.fhe-rule{margin:4px 0 10px;color:var(--ink-dim);font-size:.76rem;line-height:1.45}.fhe-res{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px;margin:10px 0}.fhe-res div,.fhe-plot,.fhe-work button{border:1px solid var(--border);background:rgba(255,255,255,.035);border-radius:12px;padding:9px}.fhe-res b{display:block;font-size:1.05rem}.fhe-res span,.fhe-plot span,.fhe-work span{display:block;color:var(--ink-dim);font-size:.67rem;margin-top:2px}.fhe-plots{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:7px 0 10px}.fhe-plot select{width:100%;margin:8px 0}.fhe-track{height:8px;background:rgba(0,0,0,.28);border-radius:8px;margin:8px 0;overflow:hidden}.fhe-track i{display:block;height:100%;background:linear-gradient(90deg,var(--accent),var(--accent-2));border-radius:inherit}.fhe-work{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.fhe-work button{text-align:left}.priority-mode-badge{display:block;width:fit-content;max-width:92%;margin:6px auto 0;padding:5px 13px;border-radius:999px;font-size:.74rem;font-weight:700;background:rgba(148,163,184,.12);color:#cbd5e1;border:1px solid rgba(148,163,184,.3)}.priority-mode-badge.armed{background:rgba(96,165,250,.18);color:#bfdbfe;border-color:rgba(96,165,250,.55)}#btn-priority-reset{display:block;width:fit-content;margin:6px auto 0;padding:6px 14px;border-radius:999px;font-size:.74rem;color:#ff9aa7;border-color:rgba(255,122,138,.5)}.priority-check-copy{color:var(--ink-dim);line-height:1.5}.priority-check-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}@media(max-width:680px){.fhe-res{grid-template-columns:repeat(3,1fr)}.fhe-plots,.fhe-work{grid-template-columns:1fr}}";(document.head||document.documentElement).appendChild(st);}
    if(!document.getElementById("priority-mode-badge")){var anchor=document.getElementById("btn-lockedin-reset")||document.getElementById("game-mode-badge");if(anchor){anchor.insertAdjacentHTML("afterend",'<button type="button" id="priority-mode-badge" class="priority-mode-badge" aria-pressed="false">Priority mode · OFF</button><button type="button" id="btn-priority-reset" hidden>Cancel this Priority run</button>');}}
    if(!document.getElementById("priority-check-modal")){document.body.insertAdjacentHTML("beforeend",'<div class="modal-backdrop" id="priority-check-modal" hidden data-locked="true"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="priority-check-title"><h3 id="priority-check-title">Priority check</h3><p class="priority-check-copy">Did you work in the right priority order for this run? This is your manual honor-system checkpoint.</p><div class="priority-check-actions"><button type="button" id="btn-priority-cancel">Cancel entire run · 0 credit</button><button type="button" class="primary" id="btn-priority-keep">Yes · keep full session</button></div></div></div>');}
    var tog=document.getElementById("tog-prioritymode");if(tog&&!tog.dataset.bound){tog.dataset.bound="1";tog.onclick=togglePriority;}
    var badge=document.getElementById("priority-mode-badge");if(badge&&!badge.dataset.bound){badge.dataset.bound="1";badge.onclick=togglePriority;}
    var reset=document.getElementById("btn-priority-reset");if(reset&&!reset.dataset.bound){reset.dataset.bound="1";reset.onclick=function(){if(pendingPriority)cancelPriorityRun();else if(typeof window.cancelSession==="function")window.cancelSession();};}
    var keep=document.getElementById("btn-priority-keep");if(keep&&!keep.dataset.bound){keep.dataset.bound="1";keep.onclick=function(){var p=pendingPriority;if(!p)return;pendingPriority=null;document.getElementById("priority-check-modal").hidden=true;if(p.args&&p.args[0])p.args[0].priorityVerified=true;try{if(typeof window.markPendingFocusClaimPriorityVerified==="function")window.markPendingFocusClaimPriorityVerified();}catch(_){}finishRecordedSession(p.original,p.args,true);try{if(typeof window.clearPendingFocusClaim==="function")window.clearPendingFocusClaim(p.args&&p.args[0]&&p.args[0].sessionId);}catch(_){}};}
    var cancel=document.getElementById("btn-priority-cancel");if(cancel&&!cancel.dataset.bound){cancel.dataset.bound="1";cancel.onclick=cancelPriorityRun;}
  }
  function wrapRender(){var r=window.renderAll;if(typeof r==="function"&&!r.__fhEconomy){var w=function(){var x=r.apply(this,arguments);try{render();updatePriorityUi();}catch(_){}return x;};w.__fhEconomy=true;window.renderAll=w;}}

  function boot(){ensure();installDom();installRewardParity();installPriorityWrappers();wrapRender();render();updatePriorityUi();try{window.saveState();}catch(_){}
    window.__fhEconomyTest={ensure:ensure,totals:totals,rewardGrant:rewardGrant,liveRewardContext:liveRewardContext,upsertGrant:upsertGrant,grantForRecord:grantForRecord,plant:plant,harvest:harvest,accelerate:accelerate,merge:window.fhMergeFocusEconomy};
  }
  if(document.readyState==="loading")window.addEventListener("DOMContentLoaded",function(){setTimeout(boot,0);});else setTimeout(boot,0);
})();
