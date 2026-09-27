/* Actual modules, synthetic memory only. No profile, browser storage or network.
 * node tests/shared-calendar-regressions.cjs [path/to/starmax] */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const dir=path.resolve(process.argv[2]||path.join(__dirname,'../starmax'));
const source=n=>fs.readFileSync(path.join(dir,n),'utf8');
const html=source('index.html'),windows=html.slice(html.indexOf('function lateStartMap(){'),html.indexOf('function canDeclareLateStart('));
const clone=v=>JSON.parse(JSON.stringify(v));
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
function state(){return{history:{},sessionHistory:{},sessionsLog:[],sessionTombstones:{},tasks:[],settings:{},timer:{},sync:{enabled:false},lateStarts:{},totalFocusMin:0,fh12Hardcore:{version:2,runs:[],history:[],active:false,run:null}};}
function run(){return{id:'four',startedAt:Date.parse('2026-09-25T04:00:00Z'),startDay:'2026-09-25',requirement:{type:'minutes',value:240},requirementLock:'fh12r1:minutes:240',daysSurvived:0,lastCheckedDay:'2026-09-25',lastCheckedAt:1,pauses:[],excusedDays:[]};}
function context(data=state(),now='2026-09-27T16:00:00Z',device='America/Toronto'){
  process.env.TZ=device;let stamp=Date.parse(now);
  class Clock extends Date{constructor(...args){super(...(args.length?args:[stamp]));}static now(){return stamp;}}
  const c={state:clone(data),Date:Clock,console,Intl,navigator:{},document:{readyState:'loading',addEventListener(){},getElementById(){return null;},createElement(){return{};},head:{appendChild(){}}},
    setTimeout(){return 1;},clearTimeout(){},setInterval(){},clearInterval(){},addEventListener(){},FH_onPrimaryReady(){},toast(){},renderAll(){},saveState(){return true;},
    todayKey(d=new Clock()){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}};
  c.window=c;c.advance=instant=>{stamp=Date.parse(instant);};vm.createContext(c);
  vm.runInContext(source('fh-calendar-v1.js'),c);vm.runInContext(windows,c);vm.runInContext(source('fh-hardcore-v12.js'),c);
  c.saveStateDurable=async()=>{if(c.state.fhCalendar)c.state.fhCalendar=c.FH_CALENDAR.prepared(c.state);return true;};return c;
}
function calendar(fromDay='2026-09-25',zone='America/Toronto'){
  return{version:1,id:'hc-calendar-1:'+zone+':'+fromDay,timeZone:zone,fromDay,chosenAt:Date.parse(fromDay+'T00:00:00Z'),midnights:{},entries:{},lateReceipts:{}};
}
function rec(id,at,minutes=60,units=1){return{id,type:'focus',source:'timer',at:Date.parse(at),localDay:at.slice(0,10),minutes,sessionCountApplied:units};}
const tests=[],test=(name,fn)=>tests.push([name,fn]);

test('Toronto calendar assigns the same absolute ordinary and 23/25-hour DST windows on three devices',()=>{
  const outputs=[];
  for(const zone of ['America/Toronto','America/Los_Angeles','UTC']){
    const s=state();s.fhCalendar=calendar('2026-03-01');const c=context(s,'2026-11-02T17:00:00Z',zone);
    outputs.push(['2026-03-08','2026-09-25','2026-11-01'].map(day=>clone(c.dayWindowFor(day))));
  }
  outputs.slice(1).forEach(x=>assert.deepEqual(x,outputs[0]));
  assert.deepEqual(outputs[0].map(w=>w.hours),[23,24,25]);
});

test('explicit wall times reject spring gaps and choose the first autumn repetition consistently',()=>{
  for(const zone of ['America/Toronto','America/Los_Angeles','UTC']){
    const c=context(undefined,undefined,zone),f=c.FH_CALENDAR;
    assert.throws(()=>f.clockAt('2026-03-08',150,'America/Toronto'),/does not exist/);
    assert.equal(f.clockAt('2026-11-01',90,'America/Toronto'),Date.parse('2026-11-01T05:30:00Z'));
    assert.equal(f.clockAt('2026-03-08',720,'America/Toronto'),Date.parse('2026-03-08T16:00:00Z'));
  }
});

test('24-hour late starts and shortened 17-hour next dates conserve minutes and session units across devices',()=>{
  const outputs=[];
  for(const device of ['America/Toronto','America/Los_Angeles','UTC']){
    const s=state();s.fhCalendar=calendar();
    s.fhCalendar.lateReceipts.a={day:'2026-09-25',at:1,kind:'set',startMin:420,fromMs:Date.parse('2026-09-25T11:00:00Z')};
    s.sessionsLog=[rec('late','2026-09-26T10:00:00Z',17,1),rec('short','2026-09-26T12:00:00Z',23,1),rec('minutes-only','2026-09-26T13:00:00Z',25,0)];
    const c=context(s,'2026-09-27T16:00:00Z',device),a=c.FH_CALENDAR;
    outputs.push({hours:a.windowFor('2026-09-26').hours,one:clone(a.totals('2026-09-25')),two:clone(a.totals('2026-09-26'))});
  }
  outputs.slice(1).forEach(x=>assert.deepEqual(x,outputs[0]));
  assert.deepEqual(outputs[0],{hours:17,one:{minutes:17,sessions:1},two:{minutes:48,sessions:1}});
});

test('overlapping spring-forward declarations never spend one session on two dates',()=>{
  const s=state();s.fhCalendar=calendar('2026-03-01');
  s.fhCalendar.lateReceipts.a={day:'2026-03-07',at:1,kind:'set',startMin:1410,fromMs:Date.parse('2026-03-08T04:30:00Z')};
  s.fhCalendar.lateReceipts.b={day:'2026-03-08',at:2,kind:'set',startMin:720,fromMs:Date.parse('2026-03-08T16:00:00Z')};
  s.sessionsLog=[rec('one','2026-03-08T18:00:00Z')];
  for(const device of ['America/Toronto','America/Los_Angeles','UTC']){
    const c=context(s,'2026-03-09T18:00:00Z',device),a=c.FH_CALENDAR;
    assert.equal(a.totals('2026-03-07').minutes+a.totals('2026-03-08').minutes,60);
    assert.equal(a.totals('2026-03-07').sessions+a.totals('2026-03-08').sessions,1);
  }
});

test('midnight display uses the shared active late-start date on every device',()=>{
  const s=state();s.fhCalendar=calendar();s.fhCalendar.lateReceipts.a={day:'2026-09-25',at:1,kind:'set',startMin:720,fromMs:Date.parse('2026-09-25T16:00:00Z')};
  for(const device of ['America/Toronto','America/Los_Angeles','UTC']){
    const c=context(s,'2026-09-26T09:00:00Z',device);assert.equal(c.FH_HARDCORE.activeDay(),'2026-09-25');
    c.advance('2026-09-26T17:00:00Z');assert.equal(c.FH_HARDCORE.activeDay(),'2026-09-26');
  }
});

test('an existing ambiguous late-start run is held without saves, excusing, failure, or rank edits',async()=>{
  const s=state(),r=run();s.fh12Hardcore={version:2,runs:[r],active:true,run:r,history:[]};s.history['2026-09-25']=500;
  s.lateStarts['2026-09-25']={startMin:720,declaredAt:1};s.fhRank={events:{existing:{delta:123}}};
  const c=context(s),before=JSON.stringify(c.state);let saves=0;c.saveStateDurable=async()=>{saves++;return true;};
  assert.equal((await c.FH_HARDCORE.evaluateAutomatically()).ok,false);assert.equal(saves,0);assert.equal(JSON.stringify(c.state),before);
  c.state.fhCalendar=calendar('2026-09-28');
  const chosen=JSON.stringify(c.state);assert.equal((await c.FH_HARDCORE.evaluateAutomatically()).ok,false);assert.equal(JSON.stringify(c.state),chosen);
});

test('choosing a future calendar preserves original runs and unrejudged history without reanchoring',async()=>{
  const s=state(),r=run();r.daysSurvived=2;s.fh12Hardcore={version:2,runs:[r],active:true,run:r,history:[]};s.history={'2026-09-25':300,'2026-09-26':500};
  s.fhRank={events:{old:{delta:50}}};const c=context(s),runs=JSON.stringify(c.state.fh12Hardcore),history=JSON.stringify(c.state.history),rank=JSON.stringify(c.state.fhRank);
  assert.equal((await c.FH_CALENDAR.choose('America/Toronto')).ok,true);
  assert.equal(c.state.fhCalendar.fromDay,'2026-09-28');assert.equal(JSON.stringify(c.state.fh12Hardcore),runs);
  assert.equal(JSON.stringify(c.state.history),history);assert.equal(JSON.stringify(c.state.fhRank),rank);
  assert.equal((await c.FH_CALENDAR.choose('America/Los_Angeles')).ok,false);
});

test('explicit historical timezone confirmation makes legacy windows identical without editing their records',async()=>{
  const s=state();s.fhCalendar=calendar('2026-09-28');s.lateStarts['2026-09-25']={startMin:720,declaredAt:1};
  const c=context(s),before=JSON.stringify(c.state.lateStarts);assert(c.FH_CALENDAR.windowFor('2026-09-25').uncertain);
  assert.equal((await c.FH_CALENDAR.confirmLegacy('America/Toronto')).ok,true);assert.equal(JSON.stringify(c.state.lateStarts),before);
  const results=['America/Toronto','America/Los_Angeles','UTC'].map(z=>clone(context(c.state,undefined,z).dayWindowFor('2026-09-25')));
  results.slice(1).forEach(r=>assert.deepEqual(r,results[0]));assert.equal(results[0].fromMs,Date.parse('2026-09-25T16:00:00Z'));
});

test('failed calendar choice restores only its owned field and keeps newer player activity',async()=>{
  const c=context(),before=JSON.stringify(c.state);c.saveStateDurable=async()=>false;
  assert.equal((await c.FH_CALENDAR.choose('America/Toronto')).ok,false);assert.equal(JSON.stringify(c.state),before);
  c.saveStateDurable=async()=>{c.state.totalFocusMin=99;return false;};
  assert.equal((await c.FH_CALENDAR.choose('America/Toronto')).ok,false);assert.equal(c.state.totalFocusMin,99);assert.equal(c.state.fhCalendar,undefined);
});

test('failed calendar save cannot overwrite a newer same-object calendar edit or peer adoption',async()=>{
  for(const adopt of [false,true]){
    const c=context();c.saveStateDurable=async()=>{if(adopt)c.state=clone(c.state);c.state.fhCalendar.legacyTimeZone='UTC';return false;};
    assert.equal((await c.FH_CALENDAR.choose('America/Toronto')).ok,false);assert.equal(c.state.fhCalendar.legacyTimeZone,'UTC');
  }
});

test('calendar merges commute, associate, retain receipts, and reject incompatible choices',()=>{
  const c=context(),a=calendar(),b=calendar(),d=calendar();
  a.entries.x={at:1,recordedDay:'2026-09-25',updatedAt:1,minutes:17,sessions:1,deleted:false};b.entries.y={at:2,recordedDay:'2026-09-25',updatedAt:2,minutes:23,sessions:1,deleted:false};d.entries.x={at:1,recordedDay:'2026-09-25',updatedAt:3,minutes:0,sessions:0,deleted:true};
  const merge=c.FH_CALENDAR.merge,eq=(x,y)=>assert.deepEqual(stable(clone(x)),stable(clone(y)));
  for(const l of [a,b,d])for(const r of [a,b,d]){eq(merge(l,r),merge(r,l));eq(merge(l,l),l);for(const q of [a,b,d])eq(merge(merge(l,r),q),merge(l,merge(r,q)));}
  eq(merge(a,null),a);assert.throws(()=>merge(a,calendar('2026-09-25','UTC')),/different Hardcore/);
  assert.equal(c.FH_CALENDAR.covers(a,merge(a,b)),false);
});

test('same-save session receipts survive presentation pruning and honor edits/deletion without resurrection',()=>{
  const s=state();s.fhCalendar=calendar();s.sessionsLog=[rec('one','2026-09-25T18:00:00Z',60,1)];const c=context(s);
  c.state.fhCalendar=c.FH_CALENDAR.prepared(c.state);const stale=clone(c.state.fhCalendar);c.state.sessionsLog=[];
  assert.deepEqual(clone(c.FH_CALENDAR.totals('2026-09-25')),{minutes:60,sessions:1});
  c.state.sessionsLog=[Object.assign(rec('one','2026-09-25T18:00:00Z',17,0),{updatedAt:Date.parse('2026-09-27T17:00:00Z')})];
  c.state.fhCalendar=c.FH_CALENDAR.prepared(c.state);assert.deepEqual(clone(c.FH_CALENDAR.totals('2026-09-25')),{minutes:17,sessions:0});
  c.state.sessionsLog=[];c.state.sessionTombstones.one=Date.parse('2026-09-27T18:00:00Z');c.state.fhCalendar=c.FH_CALENDAR.prepared(c.state);
  for(const [a,b] of [[stale,c.state.fhCalendar],[c.state.fhCalendar,stale]]){c.state.fhCalendar=c.FH_CALENDAR.merge(a,b);assert.equal(c.FH_CALENDAR.totals('2026-09-25').minutes,0);}
});

test('late-start choices are immutable receipts and refused writes preserve the previous boundaries',async()=>{
  const s=state();s.fhCalendar=calendar();const c=context(s),before=JSON.stringify(c.state.fhCalendar);
  c.saveStateDurable=async()=>false;assert.equal((await c.FH_CALENDAR.setLate(720)).ok,false);assert.equal(JSON.stringify(c.state.fhCalendar),before);
  c.saveStateDurable=async()=>true;assert.equal((await c.FH_CALENDAR.setLate(720)).ok,true);
  const old=clone(c.state.fhCalendar);c.advance('2026-09-27T17:00:00Z');assert.equal((await c.FH_CALENDAR.setLate(0,true)).ok,true);
  assert.equal(Object.keys(c.state.fhCalendar.lateReceipts).length,2);
  assert.equal(c.FH_CALENDAR.activeLate('2026-09-27'),null);assert(c.FH_CALENDAR.covers(c.state.fhCalendar,old));
});

test('a post-cutover session labelled yesterday on an LA device is never credited twice',()=>{
  const s=state();s.fhCalendar=calendar('2026-09-28');s.history['2026-09-27']=300;s.sessionHistory['2026-09-27']=2;
  s.sessionsLog=[Object.assign(rec('post','2026-09-28T05:00:00Z',60,1),{localDay:'2026-09-27'})];
  for(const device of ['America/Toronto','America/Los_Angeles','UTC']){
    const c=context(s,'2026-09-28T16:00:00Z',device);
    assert.equal(c.FH_HARDCORE.minutesOn('2026-09-27'),240);assert.equal(c.FH_HARDCORE.minutesOn('2026-09-28'),60);
    assert.equal(c.FH_CALENDAR.legacyRemainder('2026-09-27',true),1);assert.equal(c.FH_CALENDAR.totals('2026-09-28').sessions,1);
    assert.equal(c.state.history['2026-09-27'],300,'original history is retained byte-for-byte');
  }
});

test('a legacy late window carries post-cutover morning proof after presentation rows are pruned',()=>{
  const s=state();s.fhCalendar=calendar('2026-09-28');s.fhCalendar.legacyTimeZone='America/Toronto';
  s.lateStarts['2026-09-27']={startMin:720,declaredAt:1};s.history['2026-09-27']=240;s.history['2026-09-28']=60;
  s.sessionHistory['2026-09-27']=1;s.sessionHistory['2026-09-28']=1;
  s.sessionsLog=[Object.assign(rec('post','2026-09-28T12:00:00Z',60,1),{localDay:'2026-09-28'})];
  const c=context(s,'2026-09-29T16:00:00Z');c.state.fhCalendar=c.FH_CALENDAR.prepared(c.state);c.state.sessionsLog=[];
  assert.equal(c.FH_HARDCORE.minutesOn('2026-09-27'),300);
  assert.equal(c.FH_HARDCORE.minutesOn('2026-09-28'),0);
  assert.equal(c.FH_CALENDAR.futurePortion('2026-09-27').sessions,1);
});

test('ordinary pre-cutover earned dates still audit from existing totals without resetting the run',()=>{
  const s=state(),r=run();s.fh12Hardcore={version:2,runs:[r],active:true,run:r,history:[]};
  s.fhCalendar=calendar('2026-09-28');s.history={'2026-09-25':300,'2026-09-26':500,'2026-09-27':240};
  const c=context(s,'2026-09-28T13:00:00Z'),audit=c.FH_HARDCORE.status();
  assert.equal(audit.ok,true);assert.equal(audit.daysSurvived,3);
  assert.deepEqual(clone(audit.earnedDays),['2026-09-25','2026-09-26','2026-09-27']);
  assert.equal(c.state.fh12Hardcore.runs[0].startDay,'2026-09-25');
});

test('a synced device adopts an existing calendar through normal pull before another choice',async()=>{
  const s=state();s.sync.enabled=true;const c=context(s);let pulls=0,saves=0;
  c.cloudPull=async opts=>{pulls++;assert(opts.full&&opts.requireRemote);c.state.fhCalendar=calendar('2026-09-25');return true;};
  c.saveStateDurable=async()=>{saves++;return true;};
  assert.equal((await c.FH_CALENDAR.choose('America/Toronto')).ok,true);assert.equal(pulls,1);assert.equal(saves,0);assert.equal(c.state.fhCalendar.fromDay,'2026-09-25');
  const noPull=context(s);noPull.cloudPull=async()=>false;const before=JSON.stringify(noPull.state);
  assert.equal((await noPull.FH_CALENDAR.choose('America/Toronto')).ok,false);assert.equal(JSON.stringify(noPull.state),before);
});

test('same-zone different cutovers refuse without guessing the earlier device coverage',()=>{
  const c=context();assert.throws(()=>c.FH_CALENDAR.merge(calendar('2026-09-25'),calendar('2026-09-26')),/different Hardcore calendars/);
});

test('unknown calendar metadata or missing recorded dates refuse in either merge order',()=>{
  const c=context(),a=calendar(),unknown=calendar();unknown.opaqueFuture={receipt:'keep'};
  assert.throws(()=>c.FH_CALENDAR.merge(a,unknown),/unsupported evidence/);assert.throws(()=>c.FH_CALENDAR.merge(unknown,a),/unsupported evidence/);
  const missing=calendar();missing.entries.x={at:1,updatedAt:1,minutes:10,sessions:1,deleted:false};
  assert.throws(()=>c.FH_CALENDAR.merge(a,missing),/receipt is invalid/);
});

test('three device zones agree on earned RP, pause, genuine failure, and receipt-only automatic revival',async()=>{
  const results=[];
  for(const device of ['America/Toronto','America/Los_Angeles','UTC']){
    const s=state(),r=run();r.rankDailyFromDay='2026-09-25';r.rankEarnedDays=[];
    s.fh12Hardcore={version:2,runs:[r],active:true,run:r,history:[]};s.fhCalendar=calendar();
    s.sessionsLog=[rec('first','2026-09-25T18:00:00Z',240,1),rec('second','2026-09-26T18:00:00Z',240,1)];
    s.fhRank={version:1,installedDay:'2026-09-01',installedAt:1,events:{}};
    const c=context(s,'2026-09-27T16:00:00Z',device);vm.runInContext(source('fh-rank-v1.js'),c);
    assert.equal((await c.FH_HARDCORE.evaluateAutomatically()).ok,true);assert.equal(c.FH_HARDCORE.status().daysSurvived,2);
    assert.equal(c.state.fhRank.events['hcday2:2026-09-25'].delta,40);
    assert.equal((await c.FH_HARDCORE.pause('four')).ok,true);c.advance('2026-09-28T16:00:00Z');
    assert.equal((await c.FH_HARDCORE.evaluateAutomatically()).ok,true);assert.equal(c.state.fh12Hardcore.runs.length,1);
    assert.equal((await c.FH_HARDCORE.resume('four')).ok,true);c.advance('2026-09-29T16:00:00Z');
    assert.equal((await c.FH_HARDCORE.evaluateAutomatically()).ok,true);assert.equal(c.state.fh12Hardcore.runs.length,0);
    await c.FH_HARDCORE.evaluateAutomatically(); // Cache an unsuccessful restoration scan.
    c.state.fhCalendar.entries.lateProof={at:Date.parse('2026-09-28T18:00:00Z'),recordedDay:'2026-09-28',updatedAt:Date.parse('2026-09-28T18:00:00Z'),minutes:240,sessions:1,deleted:false};
    assert.equal((await c.FH_HARDCORE.evaluateAutomatically()).ok,true);assert.equal(c.state.fh12Hardcore.runs.length,1);
    assert.equal(c.FH_HARDCORE.status().daysSurvived,3);
    results.push(stable(clone({hardcore:c.state.fh12Hardcore,rank:c.state.fhRank})));
  }
  results.slice(1).forEach(r=>assert.deepEqual(r,results[0]));
});

(async()=>{let failed=0;for(const [name,fn] of tests){try{await fn();console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+'\n'+e.stack);}}console.log(`${tests.length-failed}/${tests.length} passed`);process.exitCode=failed?1:0;})();
