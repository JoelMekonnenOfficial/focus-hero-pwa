/* Independent domain audit: exact source, synthetic memory, no network/storage.
 * node tests/domain-consistency-regressions.cjs [path/to/starmax]
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
process.env.TZ = 'America/Toronto';
const dir = path.resolve(process.argv[2] || path.join(__dirname,'../starmax'));
const src = name => fs.readFileSync(path.join(dir,name),'utf8');
const html = src('index.html');
const windows = html.slice(html.indexOf('function lateStartMap(){'),html.indexOf('function canDeclareLateStart('));
const clone = x => JSON.parse(JSON.stringify(x));
const at = s => new Date(s).getTime();
function canonical(x) {
  if (Array.isArray(x)) return x.map(canonical);
  return x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])) : x;
}
function context(initial, instant='2026-09-27T12:00:00-04:00') {
  let now=at(instant);
  class Clock extends Date { constructor(...args){super(...(args.length?args:[now]));} static now(){return now;} }
  const c={state:clone(initial),Date:Clock,console:{warn(){}},navigator:{},
    document:{readyState:'loading',addEventListener(){},getElementById(){return null;},createElement(){return {};},head:{appendChild(){}}},
    setTimeout(){return 1;},clearTimeout(){},setInterval(){},clearInterval(){},addEventListener(){},FH_onPrimaryReady(){},
    toast(){},renderAll(){},saveState(){return true;},async saveStateDurable(){return true;},
    todayKey(d=new Clock()){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  };
  c.window=c;vm.createContext(c);
  c.advance=s=>{now=at(s);};
  return c;
}
function run(id, value=240, type='minutes') {
  return {id,startedAt:at('2026-09-25T00:00:00-04:00'),startDay:'2026-09-25',requirement:{type,value},
    daysSurvived:0,lastCheckedDay:'2026-09-25',lastCheckedAt:1,pauses:[],excusedDays:[]};
}
function profile(runs=[run('four')]) {
  return {history:{},sessionHistory:{},sessionsLog:[],tasks:[],settings:{},timer:{},sync:{enabled:false},lateStarts:{},
    fh12Hardcore:{version:2,runs,active:!!runs.length,run:runs[0]||null,history:[]}};
}
function hardcore(p=profile(), instant) {
  const c=context(p,instant);vm.runInContext(windows,c);vm.runInContext(src('fh-hardcore-v12.js'),c);return c;
}
function economy(initial) {
  const c=context(initial || {settings:{},timer:{}});
  c.FH_onPrimaryReady=fn=>{c.ready=fn;};
  c.setTimeout=fn=>{c.boot=fn;return 1;};
  vm.runInContext(src('focus-economy.js'),c);
  c.ready();c.boot();return c;
}
function grant(id, orbs, updatedAt=100, deleted=false) {
  return {id,sessionId:id,source:'session',minutes:60,action:'Travel',priority:false,orbs,
    materials:{seed:0,herb:0,timber:0,ore:0},farmMinutes:deleted?0:60,at:1,updatedAt,deleted};
}
function ledger(grants={}) {return {version:1,installedAt:1,grants,spends:[],harvests:[],unlockedPlots:2,
  plots:[1,2,3].map(n=>({id:'plot'+n,crop:null,plantedAt:0,updatedAt:0}))};}
const tests=[];const test=(name,fn)=>tests.push([name,fn]);

test('one session inside overlapping late-start windows belongs to only the later date',()=>{
  const p=profile([run('one',1,'sessions')]);
  p.lateStarts={'2026-09-25':{startMin:720,declaredAt:1},'2026-09-26':{startMin:480,declaredAt:2}};
  p.history['2026-09-26']=60;p.sessionHistory['2026-09-26']=1;
  p.sessionsLog=[{id:'only',type:'focus',minutes:60,sessionCountApplied:1,at:at('2026-09-26T09:00:00-04:00')}];
  const c=hardcore(p);
  assert.equal(c.FH_HARDCORE.minutesOn('2026-09-25')+c.FH_HARDCORE.minutesOn('2026-09-26'),60);
  assert.equal(c.FH_HARDCORE.progress('2026-09-25').have,0);
  assert.equal(c.FH_HARDCORE.progress('2026-09-26').have,1);
});

test('minute windows retain credited focus minutes that do not award a completed session',()=>{
  const p=profile();p.lateStarts['2026-09-26']={startMin:720,declaredAt:1};p.history['2026-09-26']=241;
  p.sessionsLog=[
    {id:'counted',type:'focus',minutes:1,sessionCountApplied:1,at:at('2026-09-26T06:00:00-04:00')},
    {id:'minutes-only',type:'focus',minutes:240,source:'ledger',sessionCountApplied:0,at:at('2026-09-26T14:00:00-04:00')}
  ];
  const c=hardcore(p);assert.equal(c.FH_HARDCORE.minutesOn('2026-09-26'),240);
  p.fh12Hardcore=profile([run('sessions',1,'sessions')]).fh12Hardcore;
  const s=hardcore(p);assert.equal(s.FH_HARDCORE.progress('2026-09-26').have,0);
});

for (const day of ['2026-03-08','2026-11-01']) test(`late-start noon uses local noon across the ${day} clock change`,()=>{
  const p=profile();p.lateStarts[day]={startMin:720,declaredAt:1};
  const c=hardcore(p);
  const w=c.dayWindowFor(day),next=c.dayWindowFor(c.fhDayShift(day,1));
  assert.equal(new Date(w.fromMs).getHours(),12);
  assert.equal(w.toMs-w.fromMs,86400000,'a declared day remains a full 24 elapsed hours');
  assert.equal(next.fromMs,w.toMs,'the carried date begins exactly when its predecessor closes');
});

test('ordinary spring and autumn dates retain their real 23/25 hour midnight boundaries',()=>{
  const c=hardcore();
  assert.equal(c.dayWindowFor('2026-03-08').hours,23);
  assert.equal(c.dayWindowFor('2026-11-01').hours,25);
});

test('a nonpositive carried date refuses automatic judgment without excusing or ending it',async()=>{
  const p=profile([Object.assign(run('four'),{startDay:'2026-03-07',startedAt:at('2026-03-07T00:00:00-05:00'),lastCheckedDay:'2026-03-07'})]);
  p.lateStarts['2026-03-07']={startMin:1410,declaredAt:1};
  p.sessionsLog=[{id:'earned',type:'focus',minutes:240,at:at('2026-03-08T14:00:00-04:00')}];
  p.history['2026-03-08']=240;
  const c=hardcore(p,'2026-03-09T12:00:00-04:00'),before=JSON.stringify(c.state);
  const result=await c.FH_HARDCORE.evaluateAutomatically();
  assert.equal(result.ok,false);assert.match(result.reason,/2026-03-08.*duration/);
  assert.equal(JSON.stringify(c.state),before);
});

test('a window spanning a clock change displays its actual ending clock time',()=>{
  for(const [day,end] of [['2026-03-07','1:00 PM'],['2026-10-31','11:00 AM']]){
    const p=profile();p.lateStarts[day]={startMin:720,declaredAt:1};
    const c=hardcore(p);
    assert.equal(c.lateStartInfoFor(day).endLabel,end);
    assert.equal(c.lateStartNextDayPreview(day).from,end);
  }
});

function dateList(count,start='2024-01-01'){
  return Array.from({length:count},(_,i)=>new Date(Date.parse(start+'T12:00:00Z')+i*86400000).toISOString().slice(0,10));
}
test('pause/excuse evidence survives a merge beyond per-device addition capacity',()=>{
  const one=run('four'),two=run('four');
  one.pauses=Array.from({length:200},(_,i)=>({from:100+i*2,to:101+i*2}));
  two.pauses=[{from:10000,to:10001}];
  one.excusedDays=dateList(400);two.excusedDays=['2026-09-24'];
  const a=profile([one]).fh12Hardcore,b=profile([two]).fh12Hardcore,c=hardcore();
  for(const [l,r] of [[a,b],[b,a]]){
    const merged=c.FH_HARDCORE.merge(l,r);
    assert.equal(merged.runs[0].pauses.length,201);
    assert.equal(merged.runs[0].excusedDays.length,401);
    assert.equal(c.FH_HARDCORE.merge(merged,merged).runs[0].excusedDays.length,401);
  }
});
test('a new pause at capacity refuses clearly without dropping old pause evidence',async()=>{
  const r=run('four');r.pauses=Array.from({length:200},(_,i)=>({from:100+i*2,to:101+i*2}));
  const c=hardcore(profile([r])),before=JSON.stringify(c.state);
  const result=await c.FH_HARDCORE.pause('four');
  assert.equal(result.ok,false);assert.match(result.reason,/200/);assert.equal(JSON.stringify(c.state),before);
});
test('a new revival excuse at capacity refuses without replacing any prior excuse',async()=>{
  const r=run('four');r.excusedDays=dateList(400);r.endedAt=10;r.missedDay='2026-09-26';r.endReason='missed';
  const p=profile([]);p.fh12Hardcore.history=[r];const c=hardcore(p),before=JSON.stringify(c.state);
  const result=await c.FH_HARDCORE.revive('four');
  assert.equal(result.ok,false);assert.match(result.reason,/400/);assert.equal(JSON.stringify(c.state),before);
});

test('later end annotations retain earlier pause/excuse and reversal evidence',()=>{
  const a=run('four'),b=run('four');
  a.pauses=[{from:100,to:200}];a.excusedDays=['2026-09-25'];
  a.rankReversedFailures=[{id:'hcf:four',day:'2026-09-25'}];
  const ended=clone(b);ended.endedAt=1000;ended.endReason='ended by you';
  const archiveA=clone(a);archiveA.endedAt=500;archiveA.endReason='ended earlier';
  const archived=r=>{const p=profile([]).fh12Hardcore;p.history=[r];return p;};
  const c=hardcore(),latest=archived(ended);
  for(const first of [profile([a]).fh12Hardcore,archived(archiveA)]){
    for(const [l,r] of [[first,latest],[latest,first]]){
      const merged=c.FH_HARDCORE.merge(l,r),row=merged.history[0];
      assert.equal(merged.runs.length,0);assert.equal(row.endReason,'ended by you');
      assert.equal(row.pauses.length,1);assert.deepEqual(clone(row.excusedDays),['2026-09-25']);
      assert.equal(row.rankReversedFailures.length,1);
    }
  }
});

test('active, ended and revived copies converge across every three-device merge order',()=>{
  const a=run('four'),ended=run('four'),revived=run('four');
  a.pauses=[{from:100,to:200}];a.excusedDays=['2026-09-25'];
  a.requirementLock=ended.requirementLock=revived.requirementLock='fh12r1:minutes:240';
  ended.endedAt=1000;ended.endReason='missed';ended.missedDay='2026-09-26';
  revived.reinstatedAt=1001;revived.rankReversedFailures=[{id:'hcf:four:2026-09-26',day:'2026-09-26'}];
  revived.excusedDays=['2026-09-26'];
  const archive=profile([]).fh12Hardcore;archive.history=[ended];
  const values=[profile([a]).fh12Hardcore,archive,profile([revived]).fh12Hardcore],c=hardcore();
  const m=(l,r)=>c.FH_HARDCORE.merge(l,r),eq=(l,r)=>assert.deepEqual(canonical(clone(l)),canonical(clone(r)));
  for(const l of values)for(const r of values){eq(m(l,r),m(r,l));eq(m(m(l,r),m(l,r)),m(l,r));for(const d of values)eq(m(m(l,r),d),m(l,m(r,d)));}
});

test('resolving a multi-run conflict archives every distinct unchosen run',async()=>{
  for(const choice of ['local','peer']){
    const p=profile([run('same',240),run('local-only',60)]);
    p.fh12HardcoreConflict={peer:profile([run('same',240),run('remote-only',120)]).fh12Hardcore};
    const c=hardcore(p),before=clone(c.state.fh12HardcoreConflict);
    const result=await c.FH_HARDCORE.resolveMergeConflict(choice);
    assert.equal(result.ok,true);
    const wanted=choice==='local'?'remote-only':'local-only';
    assert(c.state.fh12Hardcore.history.some(r=>r.id===wanted),`${wanted} must survive as an archive record`);
    assert.equal(c.FH_HARDCORE.state().runs.length,2);
    assert.equal(c.state.fh12HardcoreConflict,null);
    assert.equal(before.peer.runs.length,2,'input fixture remains intact');
  }
});

test('a refused conflict-resolution save retains runs and quarantine evidence exactly',async()=>{
  const p=profile([run('same',240),run('local-only',60)]);
  p.fh12HardcoreConflict={peer:profile([run('same',240),run('remote-only',120)]).fh12Hardcore};
  const c=hardcore(p),before=JSON.stringify(c.state);
  c.saveState=()=>false;c.saveStateDurable=async()=>false;
  assert.equal((await c.FH_HARDCORE.resolveMergeConflict('local')).ok,false);
  assert.equal(JSON.stringify(c.state),before);
});

test('failed conflict save preserves newer run edits and restores its still-owned quarantine',async()=>{
  const p=profile([run('same',240)]);p.fh12HardcoreConflict={peer:profile([run('other',480)]).fh12Hardcore};
  const c=hardcore(p),conflict=clone(c.state.fh12HardcoreConflict);
  c.saveStateDurable=async()=>{c.state.fh12Hardcore.runs[0].daysSurvived=3;return false;};
  assert.equal((await c.FH_HARDCORE.resolveMergeConflict('local')).ok,false);
  assert.equal(c.state.fh12Hardcore.runs[0].daysSurvived,3);
  assert.deepEqual(clone(c.state.fh12HardcoreConflict),conflict);
});

test('a same-ID locked-identity disagreement keeps both copies quarantined without saving',async()=>{
  for(const choice of ['local','peer']){
    const p=profile([run('same',240)]);p.fh12HardcoreConflict={peer:profile([run('same',480)]).fh12Hardcore};
    const c=hardcore(p),before=JSON.stringify(c.state);let saves=0;
    c.saveStateDurable=async()=>{saves++;return true;};
    const result=await c.FH_HARDCORE.resolveMergeConflict(choice);
    assert.equal(result.ok,false);assert.match(result.reason,/locked details/);
    assert.equal(saves,0);assert.equal(JSON.stringify(c.state),before);
  }
});

test('equal-time session grant corrections merge identically in either order',()=>{
  const c=economy(),a=ledger({same:grant('same',1)}),b=ledger({same:grant('same',2)});
  assert.deepEqual(canonical(clone(c.fhMergeFocusEconomy(a,b))),canonical(clone(c.fhMergeFocusEconomy(b,a))));
});

test('economy merge is commutative, associative and idempotent across clocks and deletions',()=>{
  const c=economy(),values=[ledger({same:grant('same',1)}),ledger({same:grant('same',2)}),ledger({same:grant('same',0,1,true)})];
  values[0].spends=[{id:'spend',at:1,updatedAt:100,cost:{orbs:1}}];
  values[1].spends=[{id:'spend',at:1,updatedAt:100,cost:{orbs:2}}];
  values[2].spends=[{id:'other',at:1,updatedAt:100,cost:{orbs:1}}];
  values.forEach((e,i)=>{e.plots[0]={id:'plot1',crop:i?'herb':null,plantedAt:i,updatedAt:100};});
  const m=(a,b)=>c.fhMergeFocusEconomy(a,b),eq=(a,b)=>assert.deepEqual(canonical(clone(a)),canonical(clone(b)));
  for(const a of values){eq(m(a,a),a);for(const b of values){eq(m(a,b),m(b,a));for(const d of values)eq(m(m(a,b),d),m(a,m(b,d)));}}
});

test('a deleted economy grant cannot resurrect from a stale peer with a later clock',()=>{
  const c=economy(),removed=ledger({same:grant('same',0,100,true)}),stale=ledger({same:grant('same',2,1000,false)});
  for(const [a,b] of [[removed,stale],[stale,removed]]){
    const merged=c.fhMergeFocusEconomy(a,b);
    assert.equal(merged.grants.same.deleted,true);
    c.state.focusEconomy=merged;assert.equal(c.__fhEconomyTest.totals().orbs,0);
  }
});

test('the same ready crop harvested on two offline devices grants its yield once',()=>{
  const e=ledger({seed:grant('seed',0)});e.grants.seed.farmMinutes=60;
  e.plots[0]={id:'plot1',crop:'herb',plantedAt:0,updatedAt:12345};
  const a=economy({settings:{},timer:{},focusEconomy:e});
  const b=economy({settings:{},timer:{},focusEconomy:e});
  b.advance('2026-09-27T12:01:00-04:00');
  assert.equal(a.__fhEconomyTest.harvest('plot1'),true);
  assert.equal(b.__fhEconomyTest.harvest('plot1'),true);
  for(const [left,right] of [[a,b],[b,a]]){
    const merged=left.fhMergeFocusEconomy(left.state.focusEconomy,right.state.focusEconomy);
    const probe=economy({settings:{},timer:{},focusEconomy:merged});
    assert.equal(probe.__fhEconomyTest.totals().materials.herb,4);
  }
});

test('two distinct plantings in the same plot can each yield once',()=>{
  const e=ledger({seed:grant('seed',0)});e.grants.seed.farmMinutes=60;
  e.plots[0]={id:'plot1',crop:'herb',plantedAt:0,updatedAt:12345,plantingId:'first'};
  const a=economy({settings:{},timer:{},focusEconomy:e});
  assert.equal(a.__fhEconomyTest.harvest('plot1'),true);
  a.state.focusEconomy.plots[0]={id:'plot1',crop:'herb',plantedAt:0,updatedAt:12345,plantingId:'second'};
  assert.equal(a.__fhEconomyTest.harvest('plot1'),true);
  assert.equal(a.__fhEconomyTest.totals().materials.herb,8);
  assert.equal(a.state.focusEconomy.harvests.length,2);
});

(async()=>{let failed=0;for(const [name,fn] of tests){try{await fn();console.log('PASS '+name);}catch(error){failed++;console.error('FAIL '+name+'\n'+error.stack);}}
  console.log(`${tests.length-failed}/${tests.length} passed`);process.exitCode=failed?1:0;})();
