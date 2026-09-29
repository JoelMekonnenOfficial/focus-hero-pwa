/* Exact transport/diagnostic source, synthetic storage and cloud responses.
   Verify nested retry ownership without changing any merge or retry rules. */
import assert from 'node:assert/strict';
import {fresh,response} from './transport-fixture.mjs';
function fixture(rev=100){
  const f=fresh(),c=f.c;c.state.sync.cloudRev=rev;
  if(!rev)c.state.sync.createAuthorization={attemptCount:0};
  c.primaryLastDurableRaw=JSON.stringify(c.state);
  c.mergeRemoteState=local=>JSON.parse(JSON.stringify(local));
  c.canonicalCloudSharedState=()=>'same';c.pendingHardcoreMergeNotices=[];
  c.flushHardcoreMergeNotices=()=>{};c.renderAll=()=>{};
  const remote=revision=>response([{cloud_rev:revision,sync_secret_hash:'synthetic',data:{plain:JSON.parse(JSON.stringify(c.state))}}]);
  return {...f,remote};
}
let checks=0;
for(const kind of ['mature-cas','lost-create','insert-race']){
  const {c,hits,remote}=fixture(kind==='mature-cas'?100:0);let patches=0,gets=0,posts=0;
  c.respond=async(url,init)=>{
    if(init.method==='GET')return ++gets===1&&kind==='insert-race'?response([]):remote(101);
    if(init.method==='POST'){posts++;return response(null,409);}
    assert.equal(init.method,'PATCH');patches++;
    return kind==='mature-cas'&&patches===1?response([]):response(null,503);
  };
  let error;try{await c.cloudPush({force:true});}catch(e){error=e;}
  assert.match(error?.message,/503/);
  assert.equal(c.currentCloudSyncFailure(),error.message,'a nested successful pull cannot hide the later failed upload');
  assert.equal(c.state.sync.pendingSync,true);assert.equal(c.state.totalFocusMin,60);
  if(kind==='mature-cas')assert.deepEqual(hits.map(h=>h.method),['PATCH','GET','PATCH']);
  if(kind==='lost-create')assert.deepEqual(hits.map(h=>h.method),['GET','GET','PATCH']);
  if(kind==='insert-race')assert.deepEqual(hits.map(h=>h.method),['GET','POST','GET','PATCH']);
  console.log('PASS nested '+kind+' failure retains the parent diagnostic');checks++;
}
{
  const {c,hits,remote}=fixture();let patches=0,gets=0,seen,release;
  const reached=new Promise(r=>seen=r),held=new Promise(r=>release=r);
  c.respond=async(url,init)=>{
    if(init.method==='GET')return remote(++gets===1?101:102);
    assert.equal(init.method,'PATCH');if(++patches===1)return response([]);
    seen();await held;return response(null,503);
  };
  const older=c.cloudPush({force:true}).catch(error=>error);await reached;
  assert.equal(await c.cloudPull({force:true}),true);
  assert.equal(c.state.sync.cloudRev,102);assert.equal(c.currentCloudSyncFailure(),null);
  release();assert.match((await older).message,/503/);
  assert.equal(c.currentCloudSyncFailure(),null,'independent newer successful pull still outranks an older push failure');
  assert.deepEqual(hits.map(h=>h.method),['PATCH','GET','PATCH','GET']);
  console.log('PASS independent newer pull still wins over delayed failed nested retry');checks++;
}
console.log(`${checks} nested sync diagnostic checks passed`);
