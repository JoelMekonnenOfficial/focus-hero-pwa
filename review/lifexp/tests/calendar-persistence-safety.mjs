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
for(const kind of ['ordinary-refusal','newer-in-place','newer-object','invalid-snapshot']){
  const {c}=fresh();c.Intl=Intl;
  vm.runInContext(readFileSync(new URL('fh-calendar-v1.js',folder),'utf8'),c);
  c.state.fhCalendar=calendar();c.primaryLastDurableRaw=JSON.stringify(c.state);const prior=c.state;
  c.fetchCloudRemote=async()=>({remoteState:{},remotePayload:{cloud_rev:101},sourceEncrypted:true});
  c.mergeRemoteState=local=>({...structuredClone(local),totalFocusMin:69});c.canonicalCloudSharedState=()=>'same';
  c.pendingHardcoreMergeNotices=[];c.flushHardcoreMergeNotices=()=>{};c.fhTrimLogs=()=>{};c.FH_LOG_CAPS={};c.isStateSane=()=>kind!=='invalid-snapshot';
  Object.assign(c,{primaryHydrated:true,browserSmokeRouteDisabled:false,primaryTabBlocked:false,accountingStorageIndeterminate:false,
    syncIdentityOperation:null,statePersistenceBarrierDepth:0,startupRecoveryError:null});
  vm.runInContext(source('function preparePrimarySnapshot(opts={}){','function primaryEvidenceRegression('),c);
  vm.runInContext(source('async function saveStateDurable(opts={}){','function saveState(opts={}){'),c);
  c.queuePreparedPrimary=async()=>{
    if(kind==='newer-object')c.state=structuredClone(c.state);
    if(kind.startsWith('newer'))c.state.totalFocusMin=99;
    throw new Error('Synthetic IndexedDB refusal');
  };
  await assert.rejects(c.cloudPull({force:true}),error=>error.code==='FH_SYNC_LOCAL_SAVE_FAILED');
  assert.equal(JSON.parse(c.primaryLastDurableRaw).totalFocusMin,60);
  if(kind.startsWith('newer'))assert.equal(c.state.totalFocusMin,99,'newer activity survives failed older pull');
  else{assert.equal(c.state,prior);assert.equal(c.state.totalFocusMin,60);assert.equal(Object.keys(c.state.fhCalendar.midnights).length,0);}
  console.log('PASS calendar pull rollback '+kind);checks++;
}
console.log(`${checks}/${checks} calendar persistence checks passed`);
