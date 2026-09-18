/* Actual transport, budget and push/CAS/replay code in an isolated VM.
   Storage, clock, durable commits, auth and network are synthetic. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const src=readFileSync(new URL('../starmax/index.html',import.meta.url),'utf8');
function section(a,b){const i=src.indexOf(a),j=src.indexOf(b,i);assert.ok(i>=0&&j>i,a);return src.slice(i,j);}
const actual=[
  section('async function supabaseRequest(path, init){','function supabaseJwtExpiryMs('),
  section('var FH_CLOUD_BUDGET =','async function cloudPush(opts){'),
  section('async function cloudPush(opts){','function lastKnownGoodFocusMinutes(){'),
  section('async function cloudPushOnce(opts){','function assertCloudMetadataAuthorized('),
  section('function assertCloudMetadataAuthorized(','async function cloudPull(opts){'),
  section('async function cloudPull(opts){','/* Instance edits are mutable')
].join('\n');
let checks=0;
function eq(value,expected,label){assert.equal(value,expected,label);checks++;console.log('PASS '+label);}
function fresh(){
  const memory=new Map(),hits=[],auth=[];
  let clock=1800000000000,seq=0;
  const c={URL,Promise,Math,JSON,Number,Date:class extends Date{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}},
    state:{sync:{enabled:true,backend:'supabase',cloudRev:100,playerId:'synthetic',userToken:'fake',tokenExpiresAt:clock+3600000,
      syncSecretHash:'synthetic',pendingSync:true,pendingSince:clock-1000},settings:{},totalFocusMin:60},
    SUPABASE_URL:'https://synthetic.invalid',SUPABASE_ANON_KEY:'synthetic',syncIdentityGeneration:1,syncOperationsPaused:false,
    cloudPushInFlight:null,CLOUD_PUSH_REPLAY_CAP:6,primarySaveTail:Promise.resolve(),primaryHead:{commitId:'c0'},
    localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,String(v))},
    console:{warn(){},info(){}},setTimeout:fn=>queueMicrotask(fn),
    hasSupabase:()=>true,currentBackend:()=>c.state.sync.backend,
    supabaseTokenIsFresh:s=>!!s.userToken&&s.tokenExpiresAt>clock+60000,
    supabaseSignInAnon:async opts=>{auth.push(opts);},
    assertAccountingStorageDeterminate(){},assertSyncOperationCurrent(){},assertCloudPushPayloadSafe(){},
    readVerifiedPrimaryUploadBase:async expected=>{if(expected)assert.equal(expected.raw,c.primaryLastDurableRaw);return{raw:c.primaryLastDurableRaw,head:{...c.primaryHead}};},
    saveStateDurable:async()=>{c.primaryLastDurableRaw=JSON.stringify(c.state);c.primaryHead={commitId:'c'+(++seq)};},
    syncControlError:(code,message)=>Object.assign(new Error(message),{code}),isSyncControlError:()=>false,
    markCloudPending:async e=>{c.state.sync.pendingSync=true;c.state.sync.lastSyncError=e.message;},
    markCloudSynced:async()=>{c.state.sync.pendingSync=false;return true;},
    renderSyncStatus(){},scheduleCloudRetry(){c.retrySchedules++;},retrySchedules:0,
    fhTrace(){},stuckSyncNoticeShown:false,deepClone:x=>JSON.parse(JSON.stringify(x)),
    encryptStateBlobWithinRowLimit:async value=>({plain:value}),cloudEnvelopeFingerprint:async()=>'synthetic',
    fhRecordPayloadMeasurement(){},cloudBlobSerializedBytes:blob=>JSON.stringify(blob).length,now:()=>clock,
    syncCreateAuthorizationAllowsCreate:()=>true,clearSyncCreateAuthorizationDurably:async()=>{},
    reconcileDue:()=>false,noteSuccessfulCloudMetadataContact(){},noteCloudReconcile(){},
    parseSerializedCloudValue:x=>x,decryptStateBlob:async x=>x.plain||x,isRecognizableCloudState:()=>true,
    fetch:async(url,init)=>{hits.push({url,method:init.method,init});return c.respond(url,init);},
    respond:async(url,init)=>({ok:true,status:200,json:async()=>init.method==='PATCH'?[{cloud_rev:JSON.parse(init.body).cloud_rev}]:[],text:async()=>''})
  };
  c.window=c;c.primaryLastDurableRaw=JSON.stringify(c.state);
  vm.createContext(c);vm.runInContext(actual,c);
  return {c,hits,auth,memory,advance:ms=>clock+=ms,usage:()=>c.fhCloudUsage(),
    seed:(n,peek=false)=>memory.set(c.FH_CLOUD_BUDGET.key,JSON.stringify({t:peek?[]:Array(n).fill(clock),p:peek?Array(n).fill(clock):[],blockedUntil:0,note:''}))};
}
const response=(body,status=200)=>({ok:status>=200&&status<300,status,json:async()=>body,text:async()=>'synthetic failure'});

// Coalesced callers reach one active request and one replay, never 20 charges.
{
  const x=fresh();let release,started;
  const gate=new Promise(r=>release=r),signal=new Promise(r=>started=r);
  x.c.respond=async(url,init)=>{if(x.hits.length===1){started();await gate;}return response([{cloud_rev:JSON.parse(init.body).cloud_rev}]);};
  const calls=[x.c.cloudPush({force:true})];await signal;
  for(let i=1;i<20;i++)calls.push(x.c.cloudPush({force:true}));
  for(let i=0;i<30;i++)await Promise.resolve();
  release();await Promise.all(calls);
  eq(x.hits.length,2,'20 coalesced callers issue two upload requests');
  eq(x.usage().day,2,'coalesced callers pay exactly the two uploads');
  eq(x.c.state.totalFocusMin,60,'coalescing preserves focus totals');
}
// State changing during every response exhausts the six-replay valve.
{
  const x=fresh();x.c.respond=async(url,init)=>{x.c.state.syntheticAdvance=(x.c.state.syntheticAdvance||0)+1;return response([{cloud_rev:JSON.parse(init.body).cloud_rev}]);};
  await x.c.cloudPush({force:true});
  eq(x.hits.length,6,'replay valve still caps uploads at six');eq(x.usage().day,6,'each actual replay consumes a transfer');
  eq(x.c.state.sync.pendingSync,true,'replay valve retains pending work');eq(x.c.retrySchedules,1,'replay valve schedules retry');
}
// CAS retry executes actual cloudPushOnce recursion and actual full fetch.
{
  const x=fresh();let patches=0;
  x.c.respond=async(url,init)=>init.method==='GET'?response([{cloud_rev:101,data:{plain:{totalFocusMin:60}},sync_secret_hash:'synthetic'}])
    :response(++patches===1?[]:[{cloud_rev:JSON.parse(init.body).cloud_rev}]);
  x.c.cloudPull=async opts=>{const pulled=await x.c.fetchCloudRemote(opts);x.c.state.sync.cloudRev=pulled.remotePayload.cloud_rev;await x.c.saveStateDurable();return true;};
  await x.c.cloudPush({force:true});
  eq(x.hits.map(h=>h.method).join(','),'PATCH,GET,PATCH','CAS conflict pulls and retries exactly once');
  eq(x.usage().day,3,'CAS retry counts both uploads and full download');
}
// Requests that never reach transport consume no slots.
{
  const x=fresh();x.c.state.sync.enabled=false;await x.c.cloudPush();
  eq(x.usage().day,0,'disabled no-op caller is not charged');
  x.c.state.sync.enabled=true;x.c.assertCloudPushPayloadSafe=()=>{throw new Error('synthetic guard');};
  await assert.rejects(x.c.cloudPush({force:true}),/synthetic guard/);eq(x.hits.length,0,'local safety refusal makes no request');
  eq(x.usage().day,0,'local safety refusal is not charged');
}
// Background metadata is separately charged; only actual blob requests cost full.
{
  const x=fresh();x.c.respond=async()=>response([{cloud_rev:100,sync_secret_hash:'synthetic'}]);
  const peek=await x.c.fetchCloudRemote({});eq(peek.metadataOnly,true,'unchanged revision returns metadata');
  eq(x.usage().peekDay,1,'metadata request consumes one peek');eq(x.usage().day,0,'metadata request consumes no full transfer');
  x.c.respond=async(url)=>response([{cloud_rev:101,sync_secret_hash:'synthetic',...(url.includes('select=data')?{data:{plain:{totalFocusMin:60}}}:{})}]);
  await x.c.fetchCloudRemote({});eq(x.usage().peekDay,2,'new revision discovery consumes a peek');eq(x.usage().day,1,'new revision payload consumes one full transfer');
}
// Full limit gates background escalation, forced download and replay, with no reset.
{
  const x=fresh();x.seed(90);x.c.respond=async()=>response([{cloud_rev:101,sync_secret_hash:'synthetic'}]);
  await assert.rejects(x.c.fetchCloudRemote({}),e=>e.code==='FH_CLOUD_BUDGET');
  eq(x.hits.length,1,'full ceiling allows metadata but refuses payload escalation');eq(x.usage().day,90,'refused full request does not increment or clear history');
  eq(x.c.state.sync.pendingSync,true,'budget keeps pending work');
  eq(x.c.state.sync.pendingSince,1800000000000-1000,'budget preserves original pending time');
  eq(x.c.state.totalFocusMin,60,'budget refusal preserves progress');
  eq(x.c.state.sync.retryAfter,1800000000000+3600000,'retry waits for the full budget window');
  const before=x.hits.length;await assert.rejects(x.c.fetchCloudRemote({force:true}),e=>e.code==='FH_CLOUD_BUDGET');
  eq(x.hits.length,before,'force is not a budget bypass');
  await assert.rejects(x.c.cloudPull({force:true,reason:'push-conflict'}),e=>e.code==='FH_CLOUD_BUDGET');
  eq(x.c.state.sync.retryAfter,1800000000000+3600000,'CAS pull preserves the budget error and retry deadline');
}
{
  const x=fresh();x.seed(300,true);
  eq(await x.c.cloudPull({}),false,'exhausted peek pool returns without blocking later uploads');
  eq(x.hits.length,0,'exhausted peek pool makes no request');
  await x.c.cloudPush({force:true});eq(x.hits.length,1,'full transfer is allowed after peek-only refusal');
  eq(x.usage().day,1,'peek refusal consumes no upload slot');
}
{
  const x=fresh();x.seed(89);x.c.respond=async(url,init)=>{x.c.state.syntheticAdvance=1;return response([{cloud_rev:JSON.parse(init.body).cloud_rev}]);};
  await assert.rejects(x.c.cloudPush({force:true}),e=>e.code==='FH_CLOUD_BUDGET');
  eq(x.hits.length,1,'replay stops at the remaining one transfer');eq(x.usage().day,90,'replay never exceeds the hourly cap');
  eq(x.c.state.sync.pendingSync,true,'budget-stopped replay stays pending');
  eq(x.c.state.sync.retryAfter,1800000000000+3600000,'push catch preserves budget retry deadline');
}
// Failed HTTP/network requests remain charged exactly once; auth replays twice.
{
  const x=fresh();const times=Array.from({length:250},(_,i)=>1800000000000-(i+1)*300000);
  x.memory.set(x.c.FH_CLOUD_BUDGET.key,JSON.stringify({t:times,p:[],blockedUntil:0,note:''}));
  await assert.rejects(x.c.supabaseRequest('players?select=data',{method:'GET'}),e=>e.code==='FH_CLOUD_BUDGET');
  eq(x.hits.length,0,'daily ceiling refuses requests below the hourly ceiling');
  eq(x.usage().day,250,'daily refusal preserves all 250 counted transfers');
  eq(x.c.state.sync.retryAfter,Math.min(...times)+86400000,'daily retry waits for its actual rolling window');
}
{
  const x=fresh();x.c.respond=async()=>{throw new Error('synthetic network failure');};
  await assert.rejects(x.c.fetchCloudRemote({force:true}),/network failure/);eq(x.usage().day,1,'network-failed full download is charged');
  x.c.respond=async()=>response([],503);await assert.rejects(x.c.fetchCloudRemote({requireRemote:true}),/503/);
  eq(x.usage().day,2,'HTTP-failed full download is charged');
  x.c.respond=async()=>response([],x.hits.length===3?401:200);
  await x.c.supabaseRequest('players?select=data',{method:'GET'});eq(x.usage().day,4,'401 request and authenticated replay are each charged');
}
// Diagnostic auth may not refresh, sign up, write a profile or bypass limits.
{
  const x=fresh();const before=JSON.stringify(x.c.state);
  x.c.respond=async()=>response([],401);
  const refused=await x.c.supabaseRequest('players?select=data',{method:'GET',authReadOnly:true});
  eq(refused.status,401,'diagnostic returns 401 without retry');eq(x.auth.length,0,'diagnostic never invokes auth refresh or signup');
  eq(x.hits.length,1,'diagnostic 401 is attempted once');eq(x.usage().day,1,'diagnostic full read is budgeted');
  eq(x.hits[0].init.authReadOnly,undefined,'diagnostic flag is stripped from fetch');
  eq(JSON.stringify(x.c.state),before,'diagnostic auth rejection preserves profile');
  x.c.state.sync.tokenExpiresAt=0;const expiredBefore=JSON.stringify(x.c.state);
  await assert.rejects(x.c.supabaseRequest('players?select=data',{authReadOnly:true}),e=>e.code==='FH_SYNC_AUTH_REQUIRED');
  eq(x.hits.length,1,'expired diagnostic auth sends no request');eq(x.auth.length,0,'expired diagnostic auth never signs up');
  eq(JSON.stringify(x.c.state),expiredBefore,'expired diagnostic auth preserves identity');
  await assert.rejects(x.c.supabaseRequest('players',{method:'PATCH',authReadOnly:true}),e=>e.code==='FH_SYNC_READ_ONLY');
  x.c.state.sync.tokenExpiresAt=1800000000000+3600000;x.seed(90);const fullBefore=JSON.stringify(x.c.state);
  await assert.rejects(x.c.supabaseRequest('players?select=data',{authReadOnly:true}),e=>e.code==='FH_CLOUD_BUDGET');
  eq(JSON.stringify(x.c.state),fullBefore,'diagnostic budget refusal changes no profile fields');
}
// Legacy history remains byte-for-byte untouched on read, and existing grace expires.
{
  const x=fresh();const prior=JSON.stringify({t:Array(90).fill(1800000000000),blockedUntil:1800000000000+3600000,note:'Catching up: old hold'});
  x.memory.set(x.c.FH_CLOUD_BUDGET.key,prior);eq(x.usage().day,90,'legacy timestamp history survives inspection');
  eq(x.memory.get(x.c.FH_CLOUD_BUDGET.key),prior,'legacy inspection does not rewrite history');
  x.c.fhBudgetResumeNow();eq(x.usage().day,90,'manual grace retains all previous timestamps');
  await x.c.supabaseRequest('players?select=data',{method:'GET'});eq(x.usage().day,91,'existing grace permits and counts an actual transfer');
  x.advance(300001);await assert.rejects(x.c.supabaseRequest('players?select=data',{method:'GET'}),e=>e.code==='FH_CLOUD_BUDGET');
  eq(x.usage().day,91,'grace expires without another charge or history reset');
}
// JSONStorage reads and writes obey the same request boundary.
{
  const x=fresh();x.c.state.sync.backend='jsonstorage';x.c.state.sync.jsonstorageUrl='https://synthetic.invalid/json';
  await x.c.saveStateDurable();x.c.respond=async()=>response({cloud_rev:100,data:{plain:{totalFocusMin:60}}});
  await x.c.fetchCloudRemote({force:true});await x.c.cloudPush({force:true});
  eq(x.hits.map(h=>h.method).join(','),'GET,PUT','JSONStorage reads and uploads use actual transport');
  eq(x.usage().day,2,'JSONStorage transfers each count once');
}
{
  const x=fresh();x.c.state.sync.backend='jsonstorage';x.c.state.sync.cloudRev=0;
  x.c.state.sync.createAuthorization={version:1,playerId:'synthetic',attemptCount:0,lastAttemptAt:0};
  await x.c.saveStateDurable();x.seed(90);
  await assert.rejects(x.c.cloudPush({force:true}),e=>e.code==='FH_CLOUD_BUDGET');
  eq(x.hits.length,0,'budget-blocked JSONStorage create sends no request');
  eq(x.c.state.sync.createAuthorization.attemptCount,0,'never-sent JSONStorage create retains its existing grant');
  x.c.fhBudgetResumeNow();x.c.respond=async()=>response({uri:'https://synthetic.invalid/new-json'});
  await x.c.cloudPush({force:true});
  eq(x.hits.filter(h=>h.method==='POST').length,1,'deferred JSONStorage creation remains retryable exactly once');
  eq(x.hits[0].method,'POST','JSONStorage creation uses a counted POST');
  eq(x.usage().day,90+x.hits.length,'JSONStorage creation and subsequent replay are each charged');
}
{
  const x=fresh();x.c.state.sync.backend='jsonstorage';x.c.state.sync.cloudRev=0;
  x.c.state.sync.createAuthorization={version:1,playerId:'synthetic',attemptCount:0,lastAttemptAt:0};
  await x.c.saveStateDurable();x.c.respond=async()=>{throw new Error('synthetic lost response');};
  await assert.rejects(x.c.cloudPush({force:true}),/lost response/);
  eq(x.c.state.sync.createAuthorization.attemptCount,1,'uncertain JSONStorage request retains its one-shot protection');
  await assert.rejects(x.c.cloudPush({force:true}),e=>e.code==='FH_SYNC_JSON_CREATE_UNCERTAIN');
  eq(x.hits.length,1,'uncertain JSONStorage create is never duplicated');
  eq(x.usage().day,1,'uncertain JSONStorage create attempt remains charged');
}
console.log(`${checks} transport accounting checks passed.`);
