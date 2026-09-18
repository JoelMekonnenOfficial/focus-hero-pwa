/* Exact-source regressions for quota uncertainty, receipts and stale rollbacks.
   Synthetic storage/profile/network only; no browser or production access. */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { fresh, section, response } from './transport-fixture.mjs';
let checks=0;
function eq(value,expected,label){assert.equal(value,expected,label);checks++;console.log('PASS '+label);}
const storageError=error=>error.code==='FH_CLOUD_BUDGET_STORAGE';

for(const prior of ['Cloud accounting conflict in all-time focus minutes.','FH_SYNC_ACCOUNTING_CONFLICT','Failed to fetch']){
  const x=fresh();x.c.state.sync.lastSyncError=prior;x.seed(300,true);
  eq(await x.c.cloudPull({reason:'background'}),false,'background quota refusal is non-mutating to progress');
  eq(x.c.state.sync.lastSyncError,prior,'substantive error remains visible: '+prior);
  eq(x.c.state.totalFocusMin,60,'budget pause preserves focus total');
  eq(x.c.state.sync.pendingSync,true,'budget pause preserves pending work');
  eq(x.usage().peekBlockedUntil,1800000000000+3600000,'independent budget ledger records pause');
}

for(const bad of ['','{broken','null','{}','[]','{"t":"not-an-array"}','{"t":["123"]}',
  '{"t":[-1]}','{"t":[],"p":null}','{"t":[],"blockedUntil":"later"}']){
  const x=fresh();x.memory.set(x.c.FH_CLOUD_BUDGET.key,bad);
  const before=JSON.stringify(x.c.state);
  await assert.rejects(x.c.supabaseRequest('players?select=data',{authReadOnly:true}),storageError);
  eq(x.hits.length,0,'malformed ledger cannot allow an unmetered transfer: '+JSON.stringify(bad));
  eq(x.memory.get(x.c.FH_CLOUD_BUDGET.key),bad,'malformed ledger bytes are not reset');
  eq(JSON.stringify(x.c.state),before,'read-only ledger refusal preserves profile');
}
for(const mode of ['read-throws','write-throws','write-dropped','readback-throws','readback-mismatch']){
  const x=fresh();x.seed(89);const before=JSON.stringify(x.c.state);
  const get=x.c.localStorage.getItem,set=x.c.localStorage.setItem;
  let wrote=false;
  if(mode==='read-throws')x.c.localStorage.getItem=()=>{throw Error('synthetic locked storage');};
  if(mode==='write-throws')x.c.localStorage.setItem=()=>{throw Error('synthetic quota full');};
  if(mode==='write-dropped')x.c.localStorage.setItem=()=>{};
  if(mode==='readback-throws'||mode==='readback-mismatch'){
    x.c.localStorage.setItem=(k,v)=>{set(k,v);wrote=true;};
    x.c.localStorage.getItem=k=>{if(!wrote)return get(k);if(mode==='readback-throws')throw Error('synthetic readback failure');return '{"t":[],"p":[]}';};
  }
  for(let i=0;i<3;i++)await assert.rejects(x.c.supabaseRequest('players?select=data',{authReadOnly:true}),storageError);
  eq(x.hits.length,0,'storage '+mode+' fails closed before fetch');
  eq(JSON.stringify(x.c.state),before,'diagnostic '+mode+' does not change identity/progress');
  eq(x.c.fhBudgetResumeNow(),false,'manual grace cannot bypass '+mode);
}
{
  const x=fresh();await x.c.supabaseRequest('players?select=data',{authReadOnly:true});
  eq(x.hits.length,1,'absent ledger may initialize for a request');eq(x.usage().day,1,'initial reservation is persisted');
}
{
  const x=fresh();x.c.state.sync.lastSyncError='Cloud accounting conflict in total focus';
  x.c.localStorage.setItem=()=>{throw Error('synthetic full storage');};
  await assert.rejects(x.c.cloudPush({force:true}),storageError);
  eq(x.hits.length,0,'failed reservation stops a normal upload');
  eq(x.c.state.sync.lastSyncError,'Cloud accounting conflict in total focus','storage failure cannot mask accounting error');
  eq(x.c.state.sync.pendingSync,true,'unmetered upload remains queued');
  eq(x.c.retrySchedules,1,'storage refusal still schedules a bounded retry');
}

for(const malformed of ['invalid-json',null,{},'unexpected',[null],[{}],[{cloud_rev:'101'}],
  [{cloud_rev:102}],[{cloud_rev:101},{cloud_rev:101}]]){
  const x=fresh();let pulls=0,synced=0;
  x.c.cloudPull=async()=>{pulls++;return true;};
  x.c.markCloudSynced=async()=>{synced++;return true;};
  x.c.respond=async()=>malformed==='invalid-json'
    ?{ok:true,status:200,json:async()=>{throw SyntaxError('synthetic malformed JSON');}}
    :response(malformed);
  await assert.rejects(x.c.cloudPush({force:true}),e=>e.code==='FH_SYNC_UNCONFIRMED_RECEIPT');
  eq(x.hits.length,1,'ambiguous PATCH receipt does not replay: '+JSON.stringify(malformed));
  eq(pulls,0,'unknown response is not treated as a proved empty CAS result');
  eq(synced,0,'unknown response cannot fabricate a synced receipt');
  eq(x.c.state.sync.cloudRev,100,'unknown response cannot advance local revision');
  eq(x.c.state.sync.pendingSync,true,'unknown response keeps progress queued');
  eq(x.usage().day,1,'uncertain sent request remains counted');
}

function pullFixture(){
  const x=fresh();const remote=JSON.parse(JSON.stringify(x.c.state));
  x.c.fetchCloudRemote=async()=>({remoteState:remote,remotePayload:{cloud_rev:101},sourceEncrypted:false});
  x.c.mergeRemoteState=local=>JSON.parse(JSON.stringify(local));
  x.c.canonicalCloudSharedState=()=>'same';x.c.pendingHardcoreMergeNotices=[];x.c.flushHardcoreMergeNotices=()=>{};
  return x;
}
for(const mode of ['top-level','same-object-edit','unchanged']){
  const x=pullFixture();const original=x.c.state;
  x.c.saveStateDurable=async opts=>{
    if(opts.source==='cloud-pull-merge'){
      if(mode==='top-level')x.c.state={...x.c.state,totalFocusMin:999,newer:true};
      if(mode==='same-object-edit'){x.c.state.totalFocusMin=999;x.c.state.newer=true;}
      throw Error('synthetic durable refusal');
    }
  };
  await assert.rejects(x.c.cloudPull({force:true}),e=>e.code==='FH_SYNC_LOCAL_SAVE_FAILED');
  if(mode==='unchanged'){eq(x.c.state,original,'failed unchanged pull rolls back its own candidate');}
  else{eq(x.c.state.totalFocusMin,999,'failed old pull preserves '+mode+' newer work');eq(x.c.state.newer,true,'newer pull state marker survives');}
}

for(const mode of ['top-level','sync-object','same-sync-edit','unchanged']){
  const x=fresh();x.c.accountingStorageIndeterminate=false;x.c.clearCloudRetryTimer=()=>{};x.c.logLine=()=>{};
  vm.runInContext(section('async function markCloudSynced(opts={},watermark=null){','async function readVerifiedPrimaryUploadBase('),x.c);
  const original=JSON.stringify(x.c.state.sync);
  x.c.saveStateDurable=async()=>{
    if(mode==='top-level')x.c.state={...x.c.state,sync:{...x.c.state.sync,cloudRev:999,playerId:'newer-identity'}};
    if(mode==='sync-object')x.c.state.sync={...x.c.state.sync,cloudRev:999,playerId:'newer-identity'};
    if(mode==='same-sync-edit'){x.c.state.sync.cloudRev=999;x.c.state.sync.playerId='newer-identity';}
    throw Error('synthetic receipt refusal');
  };
  await assert.rejects(x.c.markCloudSynced(),/synthetic receipt refusal/);
  if(mode==='unchanged')eq(JSON.stringify(x.c.state.sync),original,'failed unchanged receipt restores only its own sync edits');
  else{eq(x.c.state.sync.cloudRev,999,'receipt rollback preserves '+mode+' newer revision');eq(x.c.state.sync.playerId,'newer-identity','receipt rollback preserves newer identity');}
}
console.log(`${checks} transport safety checks passed.`);
