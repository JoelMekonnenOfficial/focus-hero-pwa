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
  var idSequence = 0;

  function S(){ return window.state; }
  function n(v){ v=Number(v); return Number.isFinite(v)?v:0; }
  function int(v){ return Math.trunc(n(v)); }
  function clone(v){ return JSON.parse(JSON.stringify(v)); }
  function eventIdExists(candidate){
    var e=S()&&S().focusEconomy;if(!e)return false;
    if(e.grants&&Object.prototype.hasOwnProperty.call(e.grants,candidate))return true;
    return [e.spends,e.harvests].some(function(list){return Array.isArray(list)&&list.some(function(item){return item&&item.id===candidate;});});
  }
  function id(prefix){
    var candidate;
    do{
      idSequence+=1;
      candidate=prefix+"_"+Date.now()+"_"+idSequence.toString(36)+"_"+Math.random().toString(36).slice(2,9);
    }while(eventIdExists(candidate));
    return candidate;
  }
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
    return Array.from(map.values()).sort(function(x,y){return n(x.at)-n(y.at);});
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
  function plainObject(v){return !!v&&typeof v==="object"&&!Array.isArray(v);}
  function finiteInteger(v){return Number.isFinite(Number(v))&&Math.trunc(Number(v))===Number(v);}
  function validMaterialMap(map,allowNegative){
    if(!plainObject(map))return false;
    return MATERIALS.every(function(k){var value=map[k]==null?0:Number(map[k]);return finiteInteger(value)&&(allowNegative||value>=0);});
  }
  function duplicateEventIds(raw){
    var seen=new Set(),duplicates=new Set(),e=plainObject(raw)?raw:{};
    function add(value){var key=value&&typeof value.id==="string"?value.id.trim():"";if(!key)return;if(seen.has(key))duplicates.add(key);else seen.add(key);}
    if(plainObject(e.grants))Object.keys(e.grants).sort().forEach(function(k){add(e.grants[k]);});
    (Array.isArray(e.spends)?e.spends:[]).forEach(add);
    (Array.isArray(e.harvests)?e.harvests:[]).forEach(add);
    return Array.from(duplicates).sort();
  }
  function validateEconomy(raw,previous){
    var errors=[],e=raw;
    function fail(path,message){errors.push(path+": "+message);}
    function validId(value){return typeof value==="string"&&value.trim().length>0;}
    function validTime(value){return finiteInteger(value)&&Number(value)>=0;}
    if(!plainObject(e))return {ok:false,errors:["focusEconomy: expected an object"],duplicateIds:[],counts:{grants:0,spends:0,harvests:0,plots:0},unlockedPlots:0};
    if(!plainObject(e.grants))fail("grants","expected an object");
    else Object.keys(e.grants).sort().forEach(function(key){
      var g=e.grants[key],path="grants."+key;
      if(!plainObject(g)){fail(path,"expected an event object");return;}
      if(!validId(g.id))fail(path+".id","expected a non-empty string");
      if(g.id!==key)fail(path+".id","must match its grant key");
      if(!finiteInteger(g.orbs))fail(path+".orbs","expected an integer");
      if(!finiteInteger(g.farmMinutes))fail(path+".farmMinutes","expected an integer");
      if(!validMaterialMap(g.materials,true))fail(path+".materials","expected integer material amounts");
      if(!validTime(g.at))fail(path+".at","expected a non-negative integer timestamp");
      if(!validTime(g.updatedAt))fail(path+".updatedAt","expected a non-negative integer timestamp");
    });
    if(!Array.isArray(e.spends))fail("spends","expected an array");
    else e.spends.forEach(function(sp,i){
      var path="spends["+i+"]";
      if(!plainObject(sp)){fail(path,"expected an event object");return;}
      if(!validId(sp.id))fail(path+".id","expected a non-empty string");
      if(typeof sp.kind!=="string"||!sp.kind)fail(path+".kind","expected a non-empty string");
      if(!plainObject(sp.cost)||!finiteInteger(sp.cost.orbs)||Number(sp.cost.orbs)<0||!validMaterialMap(sp.cost.materials,false))fail(path+".cost","expected non-negative integer costs");
      if(!plainObject(sp.effect))fail(path+".effect","expected an object");
      if(!validTime(sp.at))fail(path+".at","expected a non-negative integer timestamp");
      if(!validTime(sp.updatedAt))fail(path+".updatedAt","expected a non-negative integer timestamp");
    });
    if(!Array.isArray(e.harvests))fail("harvests","expected an array");
    else e.harvests.forEach(function(h,i){
      var path="harvests["+i+"]";
      if(!plainObject(h)){fail(path,"expected an event object");return;}
      if(!validId(h.id))fail(path+".id","expected a non-empty string");
      if(!validId(h.plotId))fail(path+".plotId","expected a non-empty string");
      if(!Object.prototype.hasOwnProperty.call(CROPS,h.crop))fail(path+".crop","unknown crop");
      if(!validMaterialMap(h.yield,false))fail(path+".yield","expected non-negative integer material amounts");
      if(!validTime(h.at))fail(path+".at","expected a non-negative integer timestamp");
      if(!validTime(h.updatedAt))fail(path+".updatedAt","expected a non-negative integer timestamp");
    });
    if(!Array.isArray(e.plots))fail("plots","expected an array");
    else{
      var plotIds=new Set();
      if(e.plots.length!==3)fail("plots","expected exactly 3 persistent plot records");
      e.plots.forEach(function(p,i){
        var path="plots["+i+"]";
        if(!plainObject(p)){fail(path,"expected a plot object");return;}
        if(!validId(p.id))fail(path+".id","expected a non-empty string");
        else if(plotIds.has(p.id))fail(path+".id","duplicate plot id "+p.id);else plotIds.add(p.id);
        if(p.crop!==null&&!Object.prototype.hasOwnProperty.call(CROPS,p.crop))fail(path+".crop","unknown crop");
        if(!validTime(p.plantedAt))fail(path+".plantedAt","expected a non-negative integer");
        if(!validTime(p.updatedAt))fail(path+".updatedAt","expected a non-negative integer timestamp");
      });
    }
    var unlocked=Number(e.unlockedPlots);
    if(!finiteInteger(unlocked)||unlocked<2||unlocked>3)fail("unlockedPlots","expected an integer from 2 to 3");
    if(previous!=null){
      var before=plainObject(previous)?Number(previous.unlockedPlots):Number(previous);
      if(finiteInteger(before)&&finiteInteger(unlocked)&&unlocked<before)fail("unlockedPlots","must not decrease from "+before+" to "+unlocked);
    }
    var duplicates=duplicateEventIds(e);duplicates.forEach(function(value){fail("events.id","duplicate id "+value);});
    errors.sort();
    return {ok:errors.length===0,errors:errors,duplicateIds:duplicates,counts:{grants:plainObject(e.grants)?Object.keys(e.grants).length:0,spends:Array.isArray(e.spends)?e.spends.length:0,harvests:Array.isArray(e.harvests)?e.harvests.length:0,plots:Array.isArray(e.plots)?e.plots.length:0},unlockedPlots:finiteInteger(unlocked)?unlocked:0};
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
    return !!(rec&&(rec.timeOnly||(typeof window.taskIsTimeOnly==="function"&&window.taskIsTimeOnly(rec.taskId))||(typeof window.taskIsTimeOnlyByName==="function"&&window.taskIsTimeOnlyByName(rec.taskName))));
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
    cost=cost||{}; if(!ensure()||!canAfford(cost))return false;
    var e=ensure();
    e.spends.push({id:id("spend"),kind:kind,cost:{orbs:int(cost.orbs),materials:Object.assign(materialZero(),cost.materials||{})},effect:effect||{},at:Date.now(),updatedAt:Date.now()});
    return true;
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
    var timeOnly=(typeof window.taskIsTimeOnly==="function"&&window.taskIsTimeOnly(taskId))||(typeof window.taskIsTimeOnlyByName==="function"&&window.taskIsTimeOnlyByName(taskName));
    var combo=forced&&forced.combo!=null?int(forced.combo):(s.combo&&s.combo.date===today()?int(s.combo.count):0);
    var streak=forced&&forced.streak!=null?int(forced.streak):liveStreakPreview();
    var breakdown=window.computeXpBreakdown(m,{comboCount:combo,streakDays:streak,settings:s.settings});
    var eligible=!timeOnly&&m>=floor, raw=eligible?int(breakdown.total):0;
    if(eligible&&typeof window.rewardXpTotal!=="function")throw new Error("XP multiplier engine is unavailable");
    if(eligible&&typeof window.computeCoins!=="function")throw new Error("Coin reward engine is unavailable");
    var xp=eligible?int(window.rewardXpTotal(raw)):0;
    var coinBase=eligible?int(window.computeCoins(m,false)):0;
    var coins=eligible?int(window.computeCoins(m,true)):0;
    return {eligible:eligible,timeOnly:timeOnly,combo:combo,streak:streak,breakdown:breakdown,xpRaw:raw,xp:xp,xpMultiplier:raw?xp/raw:1,coinBase:coinBase,coins:coins,coinMultiplier:coinBase?coins/coinBase:1};
  }
  function totalHeroXp(){var s=S();return typeof window.totalXpForLevel==="function"?window.totalXpForLevel(s.hero.level)+int(s.hero.xp):int(s.hero.xp);}
  function addXp(amount){if(amount<=0)return;if(typeof window.addXpQuiet!=="function")throw new Error("XP grant engine is unavailable");window.addXpQuiet(amount);}
  function removeXp(amount){if(amount<=0)return;if(typeof window.removeXpQuiet!=="function")throw new Error("XP clawback engine is unavailable");window.removeXpQuiet(amount);}
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
  function sessionCoinBaseline(rec){
    if(!rec)return {coins:0,inferred:false};
    if(typeof rec.coins==="number"&&isFinite(rec.coins))return {coins:int(rec.coins),inferred:false};
    if(!rec.rewarded||recordTimeOnly(rec))return {coins:0,inferred:true};
    if(typeof window.computeCoins!=="function")throw new Error("Coin reward engine is unavailable");
    var base=int(window.computeCoins(int(rec.minutes),false)),mult=n(rec.coinMultiplierApplied);
    /* Pre-v10.5 records did not persist their coin amount or gear multiplier.
       One times the historical base is the only conservative, reproducible
       fallback; using current equipment would fabricate a past bonus. */
    return {coins:Math.round(base*(mult>0?mult:1)),inferred:true};
  }
  function newRecord(before){var log=S().sessionsLog||[];for(var i=log.length-1;i>=0;i--){if(log[i]&&log[i].id&&!before.has(log[i].id))return log[i];}return null;}
  function saveRender(){window.saveState();try{window.renderAll();}catch(_){}try{render();updatePriorityUi();}catch(_){}}
  function latestEditId(){var log=S().editLog||[], edit=log[log.length-1];return edit&&edit.id?String(edit.id):"";}
  function applyEggMinuteCorrection(delta,eventId,timeOnly,source){
    if(!delta||timeOnly)return null;
    if(typeof window.eggApplyMinuteCorrection!=="function")throw new Error("Egg minute-correction engine is unavailable");
    return window.eggApplyMinuteCorrection(S(),int(delta),String(eventId||""),source||{});
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
        var d=int(result.delta);
        /* Session-backed task reductions already ran the canonical wrapped session editor
           for each affected record, including XP, coins, eggs, loot, orbs and materials. */
        if(result.sessionBacked){saveRender();return result;}
        var ctx=liveRewardContext(Math.abs(d),taskId,task.name,forced);
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
        var rec=(S().sessionsLog||[]).find(function(r){return r&&r.id===sessionId;}), old=rec?clone(rec):null, oldXp=rec?int(rec.xp):0, oldCoinInfo=sessionCoinBaseline(old), oldCoins=oldCoinInfo.coins;
        var result=editFn.apply(this,arguments); if(!result||!result.ok||!rec)return result;
        var rawInfo=window.computeXpBreakdown(int(rec.minutes),{comboCount:rec.source==="stopwatch"?0:int(rec.comboPriorCount),streakDays:int(rec.streakForCalc||rec.streakBefore),settings:S().settings});
        var rewarded=!!rec.rewarded&&!recordTimeOnly(rec), raw=rewarded?int(rawInfo.total):0, mult=n(old&&old.xpMultiplierApplied)||1, desired=Math.round(raw*mult);
        if(int(rec.xp)!==desired){var correction=desired-int(rec.xp);if(correction>0)addXp(correction);else removeXp(-correction);rec.xp=desired;}
        rec.xpRaw=raw;rec.xpMultiplierApplied=mult;rec.originalXp=Math.max(int(rec.originalXp),oldXp);
        var coinBase=rewarded?int(window.computeCoins(rec.minutes,false)):0, coinMult=n(old&&old.coinMultiplierApplied)||1, coins=rewarded?Math.round(coinBase*coinMult):0;
        applyCoinDelta(coins-oldCoins);rec.coins=coins;rec.coinMultiplierApplied=coinMult;rec.originalCoins=Math.max(int(rec.originalCoins),oldCoins);
        if(oldCoinInfo.inferred){rec.coinBaselineInferred=true;rec.coinBaselineInferredAt=Date.now();rec.coinBaselineInferredFromMinutes=int(old&&old.minutes);rec.coinBaselineInferredCoins=oldCoins;}
        upsertGrant(rec);
        var oldEggMinutes=old&&old.rewarded?int(old.minutes):0;
        var newEggMinutes=rec.rewarded&&!recordTimeOnly(rec)?int(rec.minutes):0;
        applyEggMinuteCorrection(newEggMinutes-oldEggMinutes,"egg_session_edit_"+latestEditId(),false,{ownerId:rec.id,taskId:rec.taskId||"",kind:"session-edit"});
        result.xpDelta=desired-oldXp;result.coinDelta=coins-oldCoins;saveRender();return result;
      };ew.__fh105=true;window.applySessionEdit=ew;
    }
    var del=window.deleteSessionRecord;
    if(typeof del==="function"&&!del.__fh105){
      var dw=function(sessionId){var rec=(S().sessionsLog||[]).find(function(r){return r&&r.id===sessionId;}),snapshot=rec?clone(rec):null,coins=rec?int(rec.coins):0;var r=del.apply(this,arguments);if(r&&r.ok){if(coins)applyCoinDelta(-coins);reverseGrant(sessionId);if(snapshot&&snapshot.rewarded)applyEggMinuteCorrection(-int(snapshot.minutes),"egg_session_delete_"+String(sessionId)+"_"+(latestEditId()||"noedit"),false,{ownerId:sessionId,taskId:snapshot.taskId||"",kind:"session-delete"});saveRender();}return r;};dw.__fh105=true;window.deleteSessionRecord=dw;
    }
  }

  function finishRecordedSession(original,args,priorityPassed){
    var before=new Set((S().sessionsLog||[]).map(function(r){return r&&r.id;}));
    var result=original.apply(window,args);
    var claim=args&&args[0], claimId=claim&&claim.sessionId;
    var rec=newRecord(before) || (result&&result.record) || (claimId?(S().sessionsLog||[]).find(function(r){return r&&r.id===claimId;}):null);
    if(rec){rec.priorityVerified=!!priorityPassed||!!rec.priorityVerified;var raw=int(rec.xpRaw!=null?rec.xpRaw:rec.xp),actual=rec.rewarded?int(window.rewardXpTotal(raw)):0;var ctx={xpRaw:raw,xp:actual,xpMultiplier:raw?actual/raw:1,coins:rec.rewarded?int(window.computeCoins(rec.minutes,true)):0,coinBase:rec.rewarded?int(window.computeCoins(rec.minutes,false)):0,combo:int(rec.comboPriorCount),streak:int(rec.streakForCalc)};ctx.coinMultiplier=ctx.coinBase?ctx.coins/ctx.coinBase:1;patchRecord(rec,ctx);upsertGrant(rec);}
    S().timer.priorityRun=false;saveRender();return result;
  }
  function prioritySucceededForRun(claim){
    if(claim&&typeof claim==="object"&&Object.prototype.hasOwnProperty.call(claim,"priorityRun"))return !!claim.priorityRun;
    var s=S();return !!(s&&s.timer&&s.timer.priorityRun);
  }
  function installPriorityWrappers(){
    var start=window.startTimer;if(typeof start==="function"&&!start.__fhPriority){var sw=function(){var s=S(),fresh=!s.timer.running&&((typeof window.isStopwatch==="function"&&window.isStopwatch())?int(s.timer.swAccumulatedMs)===0:int(s.timer.msLeft)>=(typeof window.focusPlannedMs==="function"?int(window.focusPlannedMs()):int(s.settings.focusMin)*60000));if(fresh)s.timer.priorityRun=!!s.settings.priorityMode;var r=start.apply(this,arguments);updatePriorityUi();return r;};sw.__fhPriority=true;window.startTimer=sw;}
    var commit=window.commitFocusTimerSession;if(typeof commit==="function"&&!commit.__fhPriority){var cw=function(){var claim=arguments&&arguments[0];return finishRecordedSession(commit,arguments,prioritySucceededForRun(claim));};cw.__fhPriority=true;window.commitFocusTimerSession=cw;}
    var stop=window.finalizeStopwatch;if(typeof stop==="function"&&!stop.__fhPriority){var fw=function(){return finishRecordedSession(stop,arguments,prioritySucceededForRun(null));};fw.__fhPriority=true;window.finalizeStopwatch=fw;}
    ["resetTimer","cancelSession","gameModeResetSession"].forEach(function(name){var orig=window[name];if(typeof orig!=="function"||orig.__fhPriority)return;var w=function(){var r=orig.apply(this,arguments);if(r!==false){S().timer.priorityRun=false;updatePriorityUi();}return r;};w.__fhPriority=true;window[name]=w;});
  }

  /* Transitional accounting boundary.
     This is deliberately not presented as the final append-only event ledger.
     Its narrow job is to make each legacy accounting command appear as one
     persistence unit while the existing core, target, egg, loot, and economy
     effects run. Legacy helpers may still call saveState()/scheduleSave(), but
     the core barrier holds those writes, broadcasts, and cloud scheduling until
     the outermost fully wrapped command has completed. */
  var accountingCommandActive=false;
  var ACCOUNTING_COMMANDS=[
    "commitFocusTimerSession",
    "finalizeStopwatch",
    "applyTaskTimeAdjustment",
    "applySessionEdit",
    "deleteSessionRecord"
  ];
  function accountingSnapshot(){
    var serialized=JSON.stringify(S());
    if(typeof serialized!=="string")throw new Error("state snapshot was not serializable");
    return JSON.parse(serialized);
  }
  function renderAccountingSnapshotWithoutPersistence(snapshot){
    var pristine=JSON.stringify(snapshot);
    if(typeof window.beginStatePersistenceBarrier==="function")window.beginStatePersistenceBarrier();
    try{window.renderAll();}catch(_){}
    finally{
      if(typeof pristine==="string")window.state=JSON.parse(pristine);
      if(typeof window.endStatePersistenceBarrier==="function")window.endStatePersistenceBarrier();
    }
  }
  function accountingStorageIsIndeterminate(){
    return typeof window.isAccountingStorageIndeterminate==="function"&&window.isAccountingStorageIndeterminate();
  }
  function storageIndeterminateResult(error){
    return {
      ok:false,reason:"storage_indeterminate",retryable:false,
      error:error&&error.message||"Primary storage could not be verified. Export raw state and use explicit verified recovery before any retry."
    };
  }
  function installAtomicCommandBoundary(){
    ACCOUNTING_COMMANDS.forEach(function(name){
      var original=window[name];
      if(typeof original!=="function"||original.__fhAccountingBoundary)return;
      var wrapped=function(){
        if(accountingStorageIsIndeterminate())return storageIndeterminateResult();
        if(accountingCommandActive)return original.apply(this,arguments);
        var snapshot;
        try{snapshot=accountingSnapshot();}
        catch(error){
          try{window.toast("Accounting action paused safely. No data was changed.","warn");}catch(_){}
          return {ok:false,reason:"snapshot_failed",error:error&&error.message||String(error)};
        }
        accountingCommandActive=true;
        var deferAutoStart=name==="commitFocusTimerSession"&&!!(S()&&S().settings&&S().settings.autoStart);
        if(deferAutoStart)S().settings.autoStart=false;
        if(typeof window.beginStatePersistenceBarrier==="function")window.beginStatePersistenceBarrier();
        var result, failure=null;
        try{
          result=original.apply(this,arguments);
          if(result&&(result.ok===false||result.duplicate===true)){
            window.state=snapshot;
          }
        }catch(error){
          window.state=snapshot;
          failure=error;
        }finally{
          if(typeof window.endStatePersistenceBarrier==="function")window.endStatePersistenceBarrier();
          accountingCommandActive=false;
        }
        if(failure){
          renderAccountingSnapshotWithoutPersistence(snapshot);
          try{window.toast("Accounting action rolled back safely. Nothing was saved.","warn");}catch(_){}
          console.warn("[Focus Hero] accounting command rolled back",name,failure);
          return {ok:false,reason:"accounting_rolled_back",error:failure&&failure.message||String(failure)};
        }
        if(result&&(result.ok===false||result.duplicate===true)){
          renderAccountingSnapshotWithoutPersistence(snapshot);
          return result;
        }
        if(deferAutoStart&&S()&&S().settings)S().settings.autoStart=true;
        var persistenceOk=false,persistenceError=null;
        try{persistenceOk=window.saveState()===true;}
        catch(error){
          persistenceError=error;
          console.warn("[Focus Hero] completed accounting command could not be saved",name,error);
        }
        if(!persistenceOk){
          if(accountingStorageIsIndeterminate()){
            try{window.toast("Accounting is locked because device storage could not be verified. Do not retry; export raw state and use Recovery.","warn");}catch(_){}
            return storageIndeterminateResult(persistenceError);
          }
          window.state=snapshot;
          renderAccountingSnapshotWithoutPersistence(snapshot);
          try{window.toast("Accounting action was not saved and has been rolled back. Retry when device storage is available.","warn");}catch(_){}
          return {
            ok:false,reason:"persistence_failed",retryable:true,
            error:persistenceError&&persistenceError.message||window.saveState?._lastPrimarySave?.error||"primary state save failed"
          };
        }
        if(deferAutoStart)setTimeout(function(){try{window.startTimer();}catch(_){}},900);
        return result;
      };
      wrapped.__fhAccountingBoundary=true;
      wrapped.__fhAccountingCommand=name;
      wrapped.__fhAccountingInner=original;
      ["__fhPriority","__fh105","__fhtWrapped"].forEach(function(marker){
        if(original[marker])wrapped[marker]=original[marker];
      });
      window[name]=wrapped;
      if(window.__FocusHero)window.__FocusHero[name]=wrapped;
    });
    window.__fhAccountingBoundary={
      version:2,
      transitional:true,
      receiptJournal:false,
      commands:ACCOUNTING_COMMANDS.slice(),
      active:function(){return accountingCommandActive;}
    };
  }

  function plotProgress(plot,availableFarmMinutes){var spec=plot&&CROPS[plot.crop];if(!spec)return 0;var available=availableFarmMinutes==null?totals().farmMinutes:int(availableFarmMinutes);return Math.max(0,Math.min(spec.required,available-int(plot.plantedAt)));}
  function plant(plotId,cropId){var e=ensure(),p=e.plots.find(function(x){return x.id===plotId;}),spec=CROPS[cropId];if(!p||!spec||p.crop)return false;if(!spend("plant",{materials:{seed:1}},{crop:cropId})){window.toast("You need 1 seed.","warn");return false;}var plantedAt=totals().farmMinutes;e=ensure();p=e.plots.find(function(x){return x.id===plotId;});if(!p)return false;p.crop=cropId;p.plantedAt=plantedAt;p.updatedAt=Date.now();saveRender();return true;}
  function recordHarvest(e,p,at){
    var spec=p&&CROPS[p.crop];if(!e||!p||!spec)return null;
    var baseYield=clone(spec.yield),utility=null;
    if(typeof window.fhGearUtilityHarvestYield==="function"){
      try{utility=window.fhGearUtilityHarvestYield(baseYield,S(),{crop:p.crop,plotId:p.id});}catch(_){utility=null;}
    }
    var actualYield=utility&&plainObject(utility.yield)?clone(utility.yield):baseYield;
    var h={id:id("harvest"),plotId:p.id,crop:p.crop,yield:actualYield,at:at,updatedAt:at};
    if(utility&&utility.applied)h.gearUtility={version:1,harvestYieldPct:int(utility.harvestYieldPct),bonus:clone(utility.bonus||{}),sources:(utility.sources||[]).slice(0,5)};
    e.harvests.push(h);p.crop=null;p.plantedAt=0;p.updatedAt=at;return {event:h,name:spec.name};
  }
  function harvest(plotId){var e=ensure(),p=e.plots.find(function(x){return x.id===plotId;}),spec=p&&CROPS[p.crop];if(!p||!spec)return false;var available=totals().farmMinutes;e=ensure();p=e.plots.find(function(x){return x.id===plotId;});spec=p&&CROPS[p.crop];if(!p||!spec||plotProgress(p,available)<spec.required)return false;var result=recordHarvest(e,p,Date.now());window.toast(result.name+" harvested.","good");saveRender();return true;}
  function harvestAllReady(){
    var e=ensure(),available=totals().farmMinutes;e=ensure();var ready=e.plots.slice(0,e.unlockedPlots).filter(function(p){var spec=CROPS[p.crop];return !!spec&&plotProgress(p,available)>=spec.required;});
    if(!ready.length){window.toast("No plots are ready to harvest yet.","info");return false;}
    var at=Date.now(),names=[];ready.forEach(function(p){var result=recordHarvest(e,p,at);if(result)names.push(result.name);});
    window.toast(names.length+" plot"+(names.length===1?"":"s")+" harvested.","good");saveRender();return true;
  }
  function accelerate(){if(!spend("farm-boost",{orbs:1},{farmMinutes:25}))return void window.toast("You need 1 Focus Orb.","warn");window.toast("Farm advanced by 25 focus minutes.","good");saveRender();}
  function unlockPlot(){var e=ensure();if(e.unlockedPlots>=3)return false;if(!spend("unlock-plot",{orbs:3,materials:{timber:5,ore:4}},{unlockedPlot:3})){window.toast("Need 3 Orbs, 5 Timber, and 4 Ore.","warn");return false;}e=ensure();e.unlockedPlots=3;saveRender();return true;}
  function craftTonic(){if(!spend("focus-tonic",{orbs:1,materials:{herb:4}},{boost:"xp25"}))return void window.toast("Need 1 Orb and 4 Herbs.","warn");if(!S().store||typeof S().store!=="object")S().store={purchased:[],boosts:[],unlockedThemes:[]};if(!Array.isArray(S().store.boosts))S().store.boosts=[];S().store.boosts.push({uid:id("farm_tonic"),kind:"xp",mult:1.25,durationMs:45*60000,name:"Farm Focus Tonic",purchasedAt:Date.now(),activatedAt:null,used:false});window.toast("Focus Tonic crafted. Activate it in Store.","good");saveRender();}
  function craftForgeKit(){if(!spend("forge-kit",{orbs:1,materials:{timber:3,ore:3}},{dust:8,shards:1}))return void window.toast("Need 1 Orb, 3 Timber, and 3 Ore.","warn");if(!S().loot||typeof S().loot!=="object")S().loot={};if(!S().loot.materials||typeof S().loot.materials!=="object")S().loot.materials={dust:0,shards:0,essence:0};S().loot.materials.dust=int(S().loot.materials.dust)+8;S().loot.materials.shards=int(S().loot.materials.shards)+1;window.toast("Forge Kit crafted: +8 Arcane Dust, +1 Forge Shard.","good");saveRender();}

  function yieldText(values){var parts=[];MATERIALS.forEach(function(k){var amount=int(values&&values[k]);if(amount)parts.push("+"+amount+" "+(k==="seed"?"seed"+(amount===1?"":"s"):k));});return parts.join(", ")||"No materials";}
  function historyTime(value){var d=new Date(n(value));return Number.isFinite(d.getTime())?d.toLocaleString(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}):"Unknown time";}
  function render(){
    var host=document.getElementById("focus-economy-panel");if(!host)return;var e=ensure(),t=totals(),hasSeed=t.materials.seed>=1,s=S();
    var forgeMaterials=s&&s.loot&&s.loot.materials?s.loot.materials:{dust:0,shards:0,essence:0};
    var worldShards=Math.max(0,int(s&&s.crystalShards));
    var readyCount=0;
    var plots=e.plots.slice(0,e.unlockedPlots).map(function(p){var spec=CROPS[p.crop],progress=plotProgress(p,t.farmMinutes),pct=spec?Math.min(100,Math.round(progress/spec.required*100)):0;
      if(!spec)return '<div class="fhe-plot"><div class="fhe-plot-title"><b>Empty plot</b><strong>Needs 1 seed</strong></div><span>Choose a crop. Only credited focus minutes grow it.</span><select aria-label="Crop for '+esc(p.id)+'" data-fhe-crop="'+esc(p.id)+'"><option value="herb">Moon herbs · 60m → 4 herbs</option><option value="timber">Sunwood · 90m → 4 timber</option><option value="ore">Ironroot · 120m → 3 ore</option></select><button type="button" data-fhe-plant="'+esc(p.id)+'" '+(hasSeed?'':'disabled')+'>Plant · 1 seed</button><small>'+(hasSeed?'Affordable now':'Earn a seed with 30 credited minutes')+'</small></div>';
      var remaining=Math.max(0,spec.required-progress),ready=remaining===0;if(ready)readyCount+=1;
      return '<div class="fhe-plot '+(ready?'ready':'')+'"><div class="fhe-plot-title"><b>'+esc(spec.name)+'</b><strong>'+(ready?'READY':remaining+'m left')+'</strong></div><span>Yield: '+esc(yieldText(spec.yield))+' · '+esc(spec.note)+'</span><div class="fhe-track" role="progressbar" aria-label="'+esc(spec.name)+' growth" aria-valuemin="0" aria-valuemax="'+spec.required+'" aria-valuenow="'+progress+'"><i style="width:'+pct+'%"></i></div><small>'+progress+' of '+spec.required+' credited growth minutes</small><button type="button" data-fhe-harvest="'+esc(p.id)+'" '+(ready?'':'disabled')+'>'+(ready?'Harvest '+esc(yieldText(spec.yield)):'Growing · '+remaining+'m remaining')+'</button></div>';
    }).join("");
    var recent=e.harvests.slice().sort(function(a,b){return n(b&&b.at)-n(a&&a.at);}).slice(0,5).map(function(h){var spec=CROPS[h&&h.crop];return '<li><div><b>'+esc(spec?spec.name:(h&&h.crop)||"Harvest")+'</b><span>'+esc(historyTime(h&&h.at))+'</span></div><strong>'+esc(yieldText(h&&h.yield))+'</strong></li>';}).join("");
    var activeCount=e.plots.slice(0,e.unlockedPlots).filter(function(p){return !!CROPS[p&&p.crop];}).length;
    var boostAffordable=canAfford({orbs:1}),unlockAffordable=canAfford({orbs:3,materials:{timber:5,ore:4}}),tonicAffordable=canAfford({orbs:1,materials:{herb:4}}),forgeAffordable=canAfford({orbs:1,materials:{timber:3,ore:3}});
    host.innerHTML='<div class="fhe-head"><div><div class="fhe-kicker">Resource command center</div><h3>Expedition &amp; Farm</h3><p>Every resource now shows where it comes from, what it does, and where to spend it.</p></div><button type="button" data-fhe-boost '+(boostAffordable?'':'disabled')+'>+25 growth · 1 Orb</button></div>'+
      '<div class="fhe-res" aria-label="Expedition resources"><div><b>'+t.orbs+'</b><span>Focus Orbs</span><small>Earn: 25m · Use: boosts &amp; crafting</small></div><div><b>'+t.materials.seed+'</b><span>Seeds</span><small>Earn: 30m · Use: planting</small></div><div><b>'+t.materials.herb+'</b><span>Herbs</span><small>Farm/Hunt · Use: tonics</small></div><div><b>'+t.materials.timber+'</b><span>Timber</span><small>Farm/Travel · Use: building</small></div><div><b>'+t.materials.ore+'</b><span>Ore</span><small>Farm/Fight · Use: forging</small></div></div>'+
      '<div class="fhe-guide"><b>Exact earning rules</b><span>Credited focus → 1 Orb per 25m, 1 seed per 30m, 1 action material per 15m, and '+t.farmMinutes+' total farm-clock minutes.</span><span>A completed Priority run adds 1 Orb. Session edits recalculate that session’s grant; canceled runs grant nothing. Historical time from before this system is not converted retroactively.</span></div>'+
      '<div class="fhe-resource-map" aria-label="Resource destinations"><article><b>Forge materials</b><strong>'+int(forgeMaterials.dust)+' Dust · '+int(forgeMaterials.shards)+' Forge Shards</strong><span>Salvage gear or craft a Forge Kit. Dust rerolls; Forge Shards upgrade.</span><button type="button" data-fhe-open="forge">Open Forge</button></article><article><b>World currency</b><strong>'+worldShards+' World Shards</strong><span>Claim Challenges, then unlock zones or buy special Store stock. This is separate from Forge Shards.</span><button type="button" data-fhe-open="challenges">Open Challenges</button></article></div>'+
      '<div class="fhe-route-choice"><div><b>Peaceful route</b><span>Travel, Rest, Loot, Craft, Meditate, and Hunt never start combat.</span></div><div><b>Optional combat route</b><span>Only choosing Fight starts encounters in your selected World zone. A 90m+ Fight can reach that zone’s boss.</span></div></div>'+
      '<div class="fhe-section-title"><div><h4>Focus farm</h4><span class="fhe-section-note">'+activeCount+' planted · '+readyCount+' ready · '+e.unlockedPlots+' plots unlocked</span></div><button type="button" data-fhe-harvest-all '+(readyCount?'':'disabled')+'>Harvest all ready ('+readyCount+')</button></div><div class="fhe-plots">'+plots+'</div>'+(e.unlockedPlots<3?'<button type="button" data-fhe-unlock '+(unlockAffordable?'':'disabled')+'>Unlock third plot · 3 Orbs + 5 Timber + 4 Ore'+(unlockAffordable?'':' · Not affordable yet')+'</button>':'')+
      '<h4>Workshop</h4><div class="fhe-work"><button type="button" data-fhe-tonic '+(tonicAffordable?'':'disabled')+'><b>Focus Tonic</b><span>1 Orb + 4 Herbs → +25% XP boost for 45m</span><small>'+(tonicAffordable?'Affordable now':'Keep gathering Herbs and Orbs')+'</small></button><button type="button" data-fhe-forge '+(forgeAffordable?'':'disabled')+'><b>Forge Kit</b><span>1 Orb + 3 Timber + 3 Ore → 8 Arcane Dust + 1 Forge Shard</span><small>'+(forgeAffordable?'Affordable now':'Keep gathering Timber, Ore, and Orbs')+'</small></button></div>'+
      '<h4>Recent harvests</h4><ul class="fhe-history">'+(recent||'<li class="empty">No harvests yet. Your last five harvests will appear here.</li>')+'</ul>';
    host.querySelectorAll("[data-fhe-plant]").forEach(function(b){b.onclick=function(){var sel=host.querySelector('[data-fhe-crop="'+CSS.escape(b.dataset.fhePlant)+'"]');plant(b.dataset.fhePlant,sel&&sel.value);};});
    host.querySelectorAll("[data-fhe-harvest]").forEach(function(b){b.onclick=function(){harvest(b.dataset.fheHarvest);};});
    host.querySelectorAll("[data-fhe-open]").forEach(function(link){link.onclick=function(){var tab=link.dataset.fheOpen;if(typeof window.openProgressPanel==="function")window.openProgressPanel(tab);else{var fallback=document.querySelector('[data-tab="'+tab+'"]');if(fallback)fallback.click();}};});
    var b=host.querySelector("[data-fhe-boost]");if(b)b.onclick=accelerate;b=host.querySelector("[data-fhe-harvest-all]");if(b)b.onclick=harvestAllReady;b=host.querySelector("[data-fhe-unlock]");if(b)b.onclick=unlockPlot;b=host.querySelector("[data-fhe-tonic]");if(b)b.onclick=craftTonic;b=host.querySelector("[data-fhe-forge]");if(b)b.onclick=craftForgeKit;
  }
  window.fhRenderFocusEconomy=render;
  window.fhValidateFocusEconomy=validateEconomy;

  function updateToggle(){var el=document.getElementById("tog-prioritymode"),on=!!(S()&&S().settings&&S().settings.priorityMode);if(!el)return;el.setAttribute("aria-checked",on?"true":"false");el.classList.toggle("on",on);}
  function updatePriorityUi(){
    var s=S();if(!s)return;ensure();var badge=document.getElementById("priority-mode-badge"),armed=!!s.timer.priorityRun&&(s.timer.running||int(s.timer.swAccumulatedMs)>0||int(s.timer.msLeft)===0),on=!!s.settings.priorityMode;
    if(badge){badge.textContent=armed?"Priority run · Cancel run = 0 credit":(on?"Priority mode · ON":"Priority mode · OFF");badge.classList.toggle("armed",armed);badge.setAttribute("aria-pressed",on?"true":"false");}
    updateToggle();
  }
  function togglePriority(){ensure();S().settings.priorityMode=!S().settings.priorityMode;window.saveState();updatePriorityUi();window.toast(S().settings.priorityMode?"Priority mode on — use the shared Cancel run button for zero credit if needed.":"Priority mode off for new focus runs.","info");}
  function installDom(){
    if(!document.getElementById("fhe-style")){
      var st=document.createElement("style");st.id="fhe-style";st.textContent=[
        ".fhe-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.fhe-head h3{margin:0}.fhe-kicker{margin-bottom:2px;color:var(--accent-2);font-size:.62rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.fhe-head p,.fhe-rule{margin:4px 0 10px;color:var(--ink-dim);font-size:.76rem;line-height:1.45}",
        ".fhe-head>button,.fhe-section-title button{white-space:nowrap}.fhe-res{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px;margin:10px 0}",
        ".fhe-res div,.fhe-plot,.fhe-work button,.fhe-guide,.fhe-history{border:1px solid var(--border);background:rgba(255,255,255,.035);border-radius:12px;padding:9px}.fhe-res b{display:block;font-size:1.05rem}.fhe-res span,.fhe-plot span,.fhe-work span,.fhe-guide span{display:block;color:var(--ink-dim);font-size:.69rem;margin-top:2px;line-height:1.35}.fhe-res small,.fhe-plot small,.fhe-work small{display:block;color:var(--ink-dim);font-size:.62rem;line-height:1.35;margin-top:5px}",
        ".fhe-guide{display:grid;gap:2px;margin-bottom:8px}.fhe-guide b{font-size:.78rem}.fhe-resource-map,.fhe-route-choice{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:8px 0}.fhe-resource-map article,.fhe-route-choice>div{display:grid;gap:3px;padding:10px;border:1px solid var(--border);border-radius:12px;background:rgba(255,255,255,.035)}.fhe-resource-map b,.fhe-route-choice b{font-size:.72rem;text-transform:uppercase;letter-spacing:.05em;color:var(--accent-2)}.fhe-resource-map strong{font-size:.9rem}.fhe-resource-map span,.fhe-route-choice span{color:var(--ink-dim);font-size:.68rem;line-height:1.4}.fhe-resource-map button{justify-self:start;margin-top:4px;font-size:.68rem}.fhe-route-choice>div:last-child{border-color:rgba(248,113,113,.34)}.fhe-section-title,.fhe-plot-title{display:flex;align-items:center;justify-content:space-between;gap:8px}.fhe-section-title h4{margin:10px 0 2px}.fhe-section-note{display:block;color:var(--ink-dim);font-size:.65rem}.fhe-plot-title strong{font-size:.65rem;color:var(--ink-dim)}.fhe-plot.ready{border-color:rgba(74,222,128,.55);box-shadow:inset 0 0 0 1px rgba(74,222,128,.12)}.fhe-plot.ready .fhe-plot-title strong{color:#86efac}",
        ".fhe-plots{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:7px 0 10px}.fhe-plot select{width:100%;margin:8px 0}.fhe-plot button{width:100%;margin-top:8px}.fhe-track{height:9px;background:rgba(0,0,0,.28);border-radius:8px;margin:8px 0 4px;overflow:hidden}.fhe-track i{display:block;height:100%;background:linear-gradient(90deg,var(--accent),var(--accent-2));border-radius:inherit}.fhe-work{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.fhe-work button{text-align:left}",
        ".fhe-history{list-style:none;margin:7px 0 0;display:grid;gap:7px}.fhe-history li{display:flex;justify-content:space-between;gap:10px;align-items:center;padding-bottom:7px;border-bottom:1px solid var(--border)}.fhe-history li:last-child{padding-bottom:0;border-bottom:0}.fhe-history li div span{display:block;color:var(--ink-dim);font-size:.66rem;margin-top:2px}.fhe-history li strong{font-size:.72rem;color:#86efac;text-align:right}.fhe-history .empty{color:var(--ink-dim);font-size:.72rem}",
        ".priority-mode-badge{display:block;width:fit-content;max-width:92%;margin:6px auto 0;padding:5px 13px;border-radius:999px;font-size:.74rem;font-weight:700;background:rgba(148,163,184,.12);color:#cbd5e1;border:1px solid rgba(148,163,184,.3)}.priority-mode-badge.armed{background:rgba(96,165,250,.18);color:#bfdbfe;border-color:rgba(96,165,250,.55)}",
        "@media(max-width:680px){.fhe-head{align-items:stretch;flex-direction:column}.fhe-head>button{width:100%}.fhe-res{grid-template-columns:repeat(2,1fr)}.fhe-plots,.fhe-work,.fhe-resource-map,.fhe-route-choice{grid-template-columns:1fr}.fhe-section-title{align-items:flex-start;flex-direction:column}.fhe-section-title button{width:100%}}"
      ].join("");(document.head||document.documentElement).appendChild(st);
    }
    if(!document.getElementById("priority-mode-badge")){var anchor=document.getElementById("game-mode-badge");if(anchor){anchor.insertAdjacentHTML("afterend",'<button type="button" id="priority-mode-badge" class="priority-mode-badge" aria-pressed="false">Priority mode · OFF</button>');}}
    var tog=document.getElementById("tog-prioritymode");if(tog&&!tog.dataset.bound){tog.dataset.bound="1";tog.onclick=togglePriority;}
    var badge=document.getElementById("priority-mode-badge");if(badge&&!badge.dataset.bound){badge.dataset.bound="1";badge.onclick=togglePriority;}
  }
  function wrapRender(){var r=window.renderAll;if(typeof r==="function"&&!r.__fhEconomy){var w=function(){var x=r.apply(this,arguments);try{render();updatePriorityUi();}catch(_){}return x;};w.__fhEconomy=true;window.renderAll=w;}}

  function boot(){var before="";try{before=JSON.stringify({focusEconomy:S()&&S().focusEconomy,priorityMode:S()&&S().settings&&S().settings.priorityMode,priorityRun:S()&&S().timer&&S().timer.priorityRun});}catch(_){}ensure();installDom();installRewardParity();installPriorityWrappers();installAtomicCommandBoundary();wrapRender();render();updatePriorityUi();var after="";try{after=JSON.stringify({focusEconomy:S()&&S().focusEconomy,priorityMode:S()&&S().settings&&S().settings.priorityMode,priorityRun:S()&&S().timer&&S().timer.priorityRun});}catch(_){}if(before!==after){try{window.saveState();}catch(_){}}
    window.__fhEconomyTest={ensure:ensure,totals:totals,rewardGrant:rewardGrant,liveRewardContext:liveRewardContext,upsertGrant:upsertGrant,grantForRecord:grantForRecord,plant:plant,harvest:harvest,harvestAllReady:harvestAllReady,accelerate:accelerate,render:render,merge:window.fhMergeFocusEconomy,validate:validateEconomy,duplicateEventIds:duplicateEventIds};
  }
  if(document.readyState==="loading")window.addEventListener("DOMContentLoaded",function(){setTimeout(boot,0);});else setTimeout(boot,0);
})();
