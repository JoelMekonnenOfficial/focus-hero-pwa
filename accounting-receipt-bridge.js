/*
 * Focus Hero accounting receipt bridge.
 *
 * This browser-only coordinator is intentionally local and synchronous. It
 * has no storage, network, cloud, recovery, credential, or profile access.
 * The surrounding accounting boundary supplies isolated before/after state
 * objects; this bridge derives the effects that actually occurred, validates
 * them with the hardened domain receipt ledger, then appends evidence to the
 * same state object that the boundary will persist once.
 */
(function(){
  "use strict";
  if (window.__fhAccountingReceiptBridge) return;

  var domain = window.FocusHeroDomainReceiptLedger;
  if (!domain || typeof domain.SessionReceiptLedger !== "function"){
    window.__fhAccountingReceiptBridge = Object.freeze({
      version:1,
      ready:false,
      error:"domain_receipt_ledger_unavailable"
    });
    return;
  }

  var JOURNAL_VERSION = 1;
  var POLICY_VERSION = "focus-hero-accounting-observed-effects-v1";
  var JOURNAL_KEY = "accountingReceiptJournal";
  var MATERIAL_KEYS = ["seed","herb","timber","ore"];

  function clone(value){ return structuredClone(value); }
  function plain(value){ return !!value && typeof value === "object" && !Array.isArray(value); }
  function text(value,label){
    if(typeof value !== "string" || !value.trim())throw new TypeError(label+" must be a non-empty string");
    return value;
  }
  function safeInteger(value,label){
    value=Number(value==null?0:value);
    if(!Number.isSafeInteger(value))throw new RangeError(label+" must be a safe integer");
    return value;
  }
  function nonNegative(value,label){
    value=safeInteger(value,label);
    if(value<0)throw new RangeError(label+" must not be negative");
    return value;
  }
  function canonical(value){
    if(value===null||typeof value!=="object")return JSON.stringify(value);
    if(Array.isArray(value))return "["+value.map(canonical).join(",")+"]";
    return "{"+Object.keys(value).sort().map(function(key){
      return JSON.stringify(key)+":"+canonical(value[key]);
    }).join(",")+"}";
  }
  function direction(delta){ return delta<0?"debit":"credit"; }
  function absoluteDelta(before,after,label){
    before=safeInteger(before,label+" before");
    after=safeInteger(after,label+" after");
    var delta=after-before;
    if(!Number.isSafeInteger(delta))throw new RangeError(label+" delta exceeds safe integer range");
    return { delta:delta, amount:Math.abs(delta), direction:direction(delta) };
  }
  function recordMap(list,key){
    var out=Object.create(null);
    (Array.isArray(list)?list:[]).forEach(function(item){
      if(!item||typeof item!=="object")return;
      var id=String(item[key]||"");
      if(id)out[id]=item;
    });
    return out;
  }
  function mapKeys(left,right){
    return Array.from(new Set(Object.keys(left||{}).concat(Object.keys(right||{})))).sort();
  }
  function receiptDescriptor(kind,slot,amount,dimensions,instance){
    return {
      kind:kind,
      slot:String(slot),
      amount:nonNegative(amount,kind+" amount"),
      reversible:true,
      dimensions:Object.assign({},dimensions||{}),
      instance:instance==null?null:Object.assign({},instance)
    };
  }
  function pushScalar(out,kind,slot,before,after,dimensions){
    var change=absoluteDelta(before,after,kind);
    if(!change.amount)return;
    out.push(receiptDescriptor(kind,slot,change.amount,
      Object.assign({direction:change.direction},dimensions||{}),null));
  }

  function heroTotalXp(state){
    var hero=plain(state&&state.hero)?state.hero:{};
    var level=Math.max(1,nonNegative(hero.level||1,"hero level"));
    var xp=nonNegative(hero.xp||0,"hero xp");
    var helper=window.__FocusHero&&window.__FocusHero.totalXpForLevel;
    if(typeof helper!=="function")throw new Error("total XP accounting helper is unavailable");
    var base=nonNegative(helper(level),"hero prior-level XP");
    var total=base+xp;
    if(!Number.isSafeInteger(total))throw new RangeError("hero total XP exceeds safe integer range");
    return total;
  }

  function eggCreditedMinutes(state){
    var eggs=plain(state&&state.eggs)?state.eggs:{};
    var seen=new Set(),total=0;
    ["owned","incubating","hatched","quarantined"].forEach(function(bucket){
      (Array.isArray(eggs[bucket])?eggs[bucket]:[]).forEach(function(egg,index){
        if(!egg||typeof egg!=="object")return;
        var id=String(egg.id||bucket+":"+index);
        if(seen.has(id))return;
        seen.add(id);
        var credits=Array.isArray(egg.incubationCredits)?egg.incubationCredits:[];
        var credited=credits.reduce(function(sum,entry){
          var amount=nonNegative(entry&&entry.minutes||0,"egg credit minutes");
          var next=sum+amount;
          if(!Number.isSafeInteger(next))throw new RangeError("egg credit minutes exceed safe integer range");
          return next;
        },0);
        if(!credited && bucket==="incubating")credited=nonNegative(egg.incubatedMin||0,"egg incubated minutes");
        total+=credited;
        if(!Number.isSafeInteger(total))throw new RangeError("egg minutes exceed safe integer range");
      });
    });
    return total;
  }

  function economyTotals(state){
    var economy=plain(state&&state.focusEconomy)?state.focusEconomy:{};
    var out={orbs:0,farmMinutes:0,materials:{seed:0,herb:0,timber:0,ore:0}};
    function addMaterial(map,multiplier){
      MATERIAL_KEYS.forEach(function(key){
        var amount=safeInteger(map&&map[key]||0,"economy material "+key);
        out.materials[key]+=amount*multiplier;
        if(!Number.isSafeInteger(out.materials[key]))throw new RangeError("economy material exceeds safe integer range");
      });
    }
    Object.keys(plain(economy.grants)?economy.grants:{}).sort().forEach(function(key){
      var grant=economy.grants[key];
      if(!grant||grant.deleted)return;
      out.orbs+=safeInteger(grant.orbs||0,"economy grant orbs");
      out.farmMinutes+=safeInteger(grant.farmMinutes||0,"economy grant farm minutes");
      addMaterial(grant.materials,1);
    });
    (Array.isArray(economy.harvests)?economy.harvests:[]).forEach(function(event){addMaterial(event&&event.yield,1);});
    (Array.isArray(economy.spends)?economy.spends:[]).forEach(function(event){
      out.orbs-=safeInteger(event&&event.cost&&event.cost.orbs||0,"economy spent orbs");
      out.farmMinutes+=safeInteger(event&&event.effect&&event.effect.farmMinutes||0,"economy farm effect");
      addMaterial(event&&event.cost&&event.cost.materials,-1);
    });
    out.orbs=Math.max(0,safeInteger(out.orbs,"economy orbs"));
    out.farmMinutes=Math.max(0,safeInteger(out.farmMinutes,"economy farm minutes"));
    MATERIAL_KEYS.forEach(function(key){out.materials[key]=Math.max(0,safeInteger(out.materials[key],"economy material "+key));});
    return out;
  }

  function targetClaims(state){
    var targets=plain(state&&state.targets)?state.targets:{},out=Object.create(null);
    ["daily","weekly"].forEach(function(scope){
      var block=plain(targets[scope])?targets[scope]:{};
      var period=String(block.date||block.week||"current");
      var claimed=plain(block.claimed)?block.claimed:{};
      ["easy","medium","hard"].forEach(function(tier){
        if(claimed[tier])out[scope+":"+period+":"+tier]=true;
      });
    });
    return out;
  }

  function lootInstances(state){
    var out=Object.create(null);
    function add(source){
      Object.keys(plain(source)?source:{}).sort().forEach(function(iid){
        var item=source[iid];
        if(!item||typeof item!=="object")return;
        out[iid]={
          actualIid:iid,
          itemId:String(item.lootId||item.templateId||item.id||"unknown-item")
        };
      });
    }
    add(state&&state.lootInstances);
    add(state&&state.loot&&state.loot.vault&&state.loot.vault.instances);
    return out;
  }

  function deriveObservedEffects(before,after){
    if(!plain(before)||!plain(after))throw new TypeError("accounting before/after states are required");
    var out=[];
    pushScalar(out,"minutes.all","all",before.totalFocusMin||0,after.totalFocusMin||0,{scope:"all"});

    var beforeTasks=recordMap(before.tasks,"id"),afterTasks=recordMap(after.tasks,"id");
    mapKeys(beforeTasks,afterTasks).forEach(function(taskId){
      var left=beforeTasks[taskId],right=afterTasks[taskId];
      pushScalar(out,"minutes.task",taskId,left&&left.totalFocusMin||0,right&&right.totalFocusMin||0,{taskId:taskId});
    });
    mapKeys(before.history||{},after.history||{}).forEach(function(dayKey){
      pushScalar(out,"minutes.day",dayKey,before.history&&before.history[dayKey]||0,after.history&&after.history[dayKey]||0,{dayKey:dayKey});
    });

    pushScalar(out,"xp","hero",heroTotalXp(before),heroTotalXp(after),{scope:"hero"});
    pushScalar(out,"coins","wallet",before.coins||0,after.coins||0,{scope:"wallet"});
    pushScalar(out,"egg.minutes","incubation",eggCreditedMinutes(before),eggCreditedMinutes(after),{scope:"incubation"});

    var beforeClaims=targetClaims(before),afterClaims=targetClaims(after);
    pushScalar(out,"target.progress","claimed-count",Object.keys(beforeClaims).length,Object.keys(afterClaims).length,{scope:"claimed-chests"});
    mapKeys(beforeClaims,afterClaims).forEach(function(chestId){
      if(!!beforeClaims[chestId]===!!afterClaims[chestId])return;
      var dir=afterClaims[chestId]?"credit":"debit";
      out.push(receiptDescriptor("target.chest",chestId,1,
        {direction:dir,actualChestId:chestId},
        {chestId:"observed-chest:"+chestId+":"+dir}));
    });

    var beforeEconomy=economyTotals(before),afterEconomy=economyTotals(after);
    pushScalar(out,"orbs","focus-orbs",beforeEconomy.orbs,afterEconomy.orbs,{scope:"focus-economy"});
    pushScalar(out,"farming.minutes","farm-clock",beforeEconomy.farmMinutes,afterEconomy.farmMinutes,{scope:"focus-economy"});
    MATERIAL_KEYS.forEach(function(materialId){
      var change=absoluteDelta(beforeEconomy.materials[materialId],afterEconomy.materials[materialId],"farming material "+materialId);
      if(!change.amount)return;
      out.push(receiptDescriptor("farming.material",materialId,change.amount,
        {direction:change.direction}, {materialId:materialId}));
    });

    var beforeLoot=lootInstances(before),afterLoot=lootInstances(after);
    mapKeys(beforeLoot,afterLoot).forEach(function(iid){
      if(beforeLoot[iid]&&afterLoot[iid])return;
      var item=afterLoot[iid]||beforeLoot[iid];
      var dir=afterLoot[iid]?"credit":"debit";
      out.push(receiptDescriptor("loot.instance",iid,1,
        {direction:dir,actualIid:iid},
        {iid:"observed-loot:"+iid+":"+dir,itemId:item.itemId}));
    });
    return out.sort(function(left,right){
      return (left.kind+"\u0000"+left.slot).localeCompare(right.kind+"\u0000"+right.slot);
    });
  }

  function semanticKey(boundaryCommand,args,before,after,result){
    args=Array.isArray(args)?args:[];
    var target="";
    if(boundaryCommand==="commitFocusTimerSession")target=String(args[0]&&args[0].sessionId||result&&result.sessionId||"focus");
    else if(boundaryCommand==="applySessionEdit"||boundaryCommand==="deleteSessionRecord")target=String(args[0]||"session");
    else if(boundaryCommand==="applyTaskTimeAdjustment")target=String(args[0]||"task")+":"+String(args[1]||0);
    else {
      var beforeIds=new Set((Array.isArray(before.sessionsLog)?before.sessionsLog:[]).map(function(row){return row&&row.id;}).filter(Boolean));
      var added=(Array.isArray(after.sessionsLog)?after.sessionsLog:[]).find(function(row){return row&&row.id&&!beforeIds.has(row.id);});
      target=String(added&&added.id||"stopwatch");
    }
    return boundaryCommand+":"+target;
  }

  function finalizedReceipts(commandId,descriptors){
    return descriptors.map(function(receipt,index){
      return {
        receiptId:"session:"+commandId+":"+receipt.kind+":"+receipt.slot+":"+index,
        sessionId:commandId,
        kind:receipt.kind,
        slot:receipt.slot+":"+index,
        amount:receipt.amount,
        reversible:receipt.reversible,
        dimensions:clone(receipt.dimensions),
        instance:receipt.instance===null?null:(function(){
          var value=clone(receipt.instance);
          if(receipt.kind==="loot.instance")value.iid=commandId+":"+value.iid;
          if(receipt.kind==="target.chest")value.chestId=commandId+":"+value.chestId;
          return value;
        })()
      };
    });
  }

  function emptyJournal(){
    return {version:JOURNAL_VERSION,policyVersion:POLICY_VERSION,entries:[]};
  }
  function readJournal(state){
    var raw=state&&state[JOURNAL_KEY];
    if(raw==null)return emptyJournal();
    if(!plain(raw)||raw.version!==JOURNAL_VERSION||raw.policyVersion!==POLICY_VERSION||!Array.isArray(raw.entries)){
      throw new Error("Accounting receipt journal is invalid or unsupported");
    }
    return clone(raw);
  }
  function validateEntry(entry){
    if(!plain(entry)||!plain(entry.command)||!Array.isArray(entry.receipts))throw new Error("Accounting receipt journal entry is malformed");
    text(entry.commandId,"journal commandId");
    text(entry.boundaryCommand,"journal boundaryCommand");
    text(entry.effectFingerprint,"journal effectFingerprint");
    if(entry.command.commandId!==entry.commandId||entry.command.sessionId!==entry.commandId)throw new Error("Accounting receipt journal command identity mismatch");
    if(domain.stableReceiptToken(canonical(entry.receipts))!==entry.effectFingerprint)throw new Error("Accounting receipt journal fingerprint mismatch");
  }
  function replay(journal){
    var plans=new Map();
    journal.entries.forEach(function(entry){validateEntry(entry);plans.set(entry.commandId,clone(entry.receipts));});
    var ledger=new domain.SessionReceiptLedger({
      policyVersion:POLICY_VERSION,
      planner:function(revision){
        var plan=plans.get(revision.revisionId);
        if(!plan)throw new Error("Receipt plan is unavailable for "+revision.revisionId);
        return clone(plan);
      }
    });
    journal.entries.forEach(function(entry){
      var applied=ledger.apply(entry.command);
      if(!applied||applied.status!=="applied")throw new Error("Accounting receipt journal replay did not apply");
    });
    return {ledger:ledger,plans:plans};
  }

  function appendObservedCommand(input){
    if(!plain(input))throw new TypeError("accounting receipt input is required");
    var boundaryCommand=text(input.boundaryCommand,"boundaryCommand");
    var before=input.beforeState,after=input.afterState;
    var beforeJournal=readJournal(before);
    var afterJournal=readJournal(after);
    if(canonical(beforeJournal)!==canonical(afterJournal)){
      throw new Error("Legacy accounting mutated the receipt journal outside its boundary");
    }
    var descriptors=deriveObservedEffects(before,after);
    if(!descriptors.length)return {ok:true,skipped:true,receiptCount:0,kinds:[]};
    var semantics=semanticKey(boundaryCommand,input.args,before,after,input.result);
    var semanticFingerprint=domain.stableReceiptToken(canonical(descriptors));
    var commandId="accounting_"+domain.stableReceiptToken(semantics+"|"+semanticFingerprint);
    var receipts=finalizedReceipts(commandId,descriptors);
    var effectFingerprint=domain.stableReceiptToken(canonical(receipts));
    var existing=beforeJournal.entries.find(function(entry){return entry&&entry.commandId===commandId;});
    if(existing){
      validateEntry(existing);
      if(existing.effectFingerprint!==effectFingerprint||canonical(existing.receipts)!==canonical(receipts)){
        throw new Error("Conflicting accounting receipt command");
      }
      return {ok:true,duplicate:true,commandId:commandId,effectFingerprint:effectFingerprint,
        receiptCount:receipts.length,kinds:Array.from(new Set(receipts.map(function(row){return row.kind;}))).sort()};
    }
    var command={
      commandId:commandId,
      type:"create",
      sessionId:commandId,
      parentRevisionId:null,
      minutes:descriptors.filter(function(row){return row.kind==="minutes.all";}).reduce(function(sum,row){return sum+row.amount;},0),
      taskId:String(input.args&&input.args[0]&&input.args[0].taskId||input.args&&input.args[0]||"accounting"),
      dayKey:String(Object.keys(after.history||{}).sort().slice(-1)[0]||"accounting")
    };
    var runtime=replay(beforeJournal);
    runtime.plans.set(commandId,clone(receipts));
    var applied=runtime.ledger.apply(command);
    if(!applied||applied.status!=="applied")throw new Error("Accounting receipt command was not accepted");
    if(canonical(runtime.ledger.receiptsForHead(commandId))!==canonical(receipts)){
      throw new Error("Accounting receipt projection differed from observed effects");
    }
    var entry={
      version:1,
      commandId:commandId,
      boundaryCommand:boundaryCommand,
      semanticKey:semantics,
      effectFingerprint:effectFingerprint,
      command:command,
      receipts:receipts
    };
    beforeJournal.entries.push(entry);
    after[JOURNAL_KEY]=beforeJournal;
    return {ok:true,duplicate:false,commandId:commandId,effectFingerprint:effectFingerprint,
      receiptCount:receipts.length,kinds:Array.from(new Set(receipts.map(function(row){return row.kind;}))).sort()};
  }

  function verifyStateJournal(state){
    var journal=readJournal(state);
    replay(journal);
    return {ok:true,entries:journal.entries.length,policyVersion:journal.policyVersion};
  }

  window.__fhAccountingReceiptBridge=Object.freeze({
    version:1,
    ready:true,
    policyVersion:POLICY_VERSION,
    journalKey:JOURNAL_KEY,
    appendObservedCommand:appendObservedCommand,
    deriveObservedEffects:deriveObservedEffects,
    verifyStateJournal:verifyStateJournal
  });
})();
