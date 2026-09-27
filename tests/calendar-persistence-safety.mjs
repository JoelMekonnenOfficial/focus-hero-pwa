/* Exact source preparation/save/pull with synthetic state and failed commits.
   No browser, production storage, auth session, or network. */
import {fresh} from './transport-fixture.mjs';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const folder=new URL('../starmax/',import.meta.url),html=readFileSync(new URL('index.html',folder),'utf8');
function source(start,end){const a=html.indexOf(start),b=html.indexOf(end,a);assert(a>=0&&b>a);return html.slice(a,b);}
const calendar=()=>({version:1,id:'hc-calendar-1:America/Toronto:2026-09-27',timeZone:'America/Toronto',fromDay:'2026-09-27',chosenAt:1790467200000,midnights:{},entries:{},lateReceipts:{}});
let checks=0;
for(const kind of ['ordinary-refusal','newer-in-place','newer-object','invalid-snapshot','successful-pruning']){
  const {c}=fresh();c.Intl=Intl;
  vm.runInContext(readFileSync(new URL('fh-calendar-v1.js',folder),'utf8'),c);
  c.state.fhCalendar=calendar();c.primaryLastDurableRaw=JSON.stringify(c.state);const prior=c.state;
  c.fetchCloudRemote=async()=>({remoteState:{},remotePayload:{cloud_rev:101},sourceEncrypted:true});
  c.mergeRemoteState=local=>({...structuredClone(local),totalFocusMin:69,appLog:Array.from({length:61},(_,n)=>({at:n+1,text:'Synthetic merged log '+n}))});c.canonicalCloudSharedState=()=>'same';
  c.pendingHardcoreMergeNotices=[];c.flushHardcoreMergeNotices=()=>{};
  c.FH_LOG_CAPS={activityLog:200,appLog:60,battleLog:60};
  vm.runInContext(source('function fhTrimLogs(s, caps){','function primaryTabBlockedError('),c);
  let validationCalls=0,queued=0;
  c.isStateSane=snapshot=>{validationCalls++;assert.equal(snapshot.appLog.length,60,'real preparation prunes the merged presentation log before validation');return kind!=='invalid-snapshot';};
  Object.assign(c,{primaryHydrated:true,browserSmokeRouteDisabled:false,primaryTabBlocked:false,accountingStorageIndeterminate:false,
    syncIdentityOperation:null,statePersistenceBarrierDepth:0,startupRecoveryError:null});
  vm.runInContext(source('function preparePrimarySnapshot(opts={}){','function primaryEvidenceRegression('),c);
  vm.runInContext(source('async function saveStateDurable(opts={}){','function saveState(opts={}){'),c);
  c.queuePreparedPrimary=async prepared=>{
    queued++;assert.equal(c.state.appLog.length,60);
    if(kind==='successful-pruning'){c.primaryLastDurableRaw=prepared.raw;c.primaryHead={commitId:'synthetic-calendar-commit'};return;}
    if(kind==='newer-object')c.state=structuredClone(c.state);
    if(kind.startsWith('newer'))c.state.totalFocusMin=99;
    throw new Error('Synthetic IndexedDB refusal');
  };
  if(kind==='successful-pruning'){
    assert.equal(await c.cloudPull({force:true}),true);
    assert.equal(c.state.totalFocusMin,69);assert.equal(c.state.sync.cloudRev,101);assert.equal(c.state.appLog.length,60);
    const saved=JSON.parse(c.primaryLastDurableRaw);assert.equal(saved.totalFocusMin,69);assert.equal(saved.appLog.length,60);
    assert.deepEqual(saved.fhCalendar,c.state.fhCalendar);assert(Object.keys(saved.fhCalendar.midnights).length>0);
    assert.equal(queued,1);assert.equal(validationCalls,1);
    console.log('PASS calendar pull successful preparation persists pruned logs and same-save receipts');checks++;continue;
  }
  await assert.rejects(c.cloudPull({force:true}),error=>error.code==='FH_SYNC_LOCAL_SAVE_FAILED');
  assert.equal(validationCalls,1);assert.equal(queued,kind==='invalid-snapshot'?0:1);
  assert.equal(JSON.parse(c.primaryLastDurableRaw).totalFocusMin,60);
  if(kind.startsWith('newer'))assert.equal(c.state.totalFocusMin,99,'newer activity survives failed older pull');
  else{assert.equal(c.state,prior);assert.equal(c.state.totalFocusMin,60);assert.equal(Object.keys(c.state.fhCalendar.midnights).length,0);assert.equal(c.state.sync.cloudRev,100);assert.equal(c.state.appLog,undefined,'failed preparation does not leave its candidate or pruned log installed');}
  console.log('PASS calendar pull rollback '+kind);checks++;
}
console.log(`${checks}/${checks} calendar persistence checks passed`);
