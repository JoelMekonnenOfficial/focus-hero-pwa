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
function fresh(){
  const memory=new Map(),hits=[],auth=[];
  let clock=1800000000000,seq=0;
  const c={URL,Promise,Math,JSON,Number,Date:class extends Date{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}},
    state:{sync:{enabled:true,backend:'supabase',cloudRev:100,playerId:'synthetic',userToken:'fake',tokenExpiresAt:clock+3600000,
      syncSecretHash:'synthetic',pendingSync:true,pendingSince:clock-1000},settings:{e2eEncryption:false},totalFocusMin:60},
    SUPABASE_URL:'https://synthetic.invalid',SUPABASE_ANON_KEY:'synthetic',syncIdentityGeneration:1,syncOperationsPaused:false,
    cloudPushInFlight:null,CLOUD_PUSH_REPLAY_CAP:6,primarySaveTail:Promise.resolve(),primaryHead:{commitId:'c0'},
    localStorage:{getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v))},
    console:{warn(){},info(){}},setTimeout:fn=>queueMicrotask(fn),
    hasSupabase:()=>true,currentBackend:()=>c.state.sync.backend,
    supabaseTokenIsFresh:s=>!!s.userToken&&s.tokenExpiresAt>clock+60000,
    supabaseSignInAnon:async opts=>{auth.push(opts);},
    assertAccountingStorageDeterminate(){},assertSyncOperationCurrent(){},assertCloudPushPayloadSafe(){},
    readVerifiedPrimaryUploadBase:async expected=>{if(expected)assert.equal(expected.raw,c.primaryLastDurableRaw);return{raw:c.primaryLastDurableRaw,head:{...c.primaryHead}};},
    saveStateDurable:async()=>{c.primaryLastDurableRaw=JSON.stringify(c.state);c.primaryHead={commitId:'c'+(++seq)};},
    CLOUD_PROTOCOL_VERSION:2,noteCloudProtocol(){},cloudEnvelopeVersion:()=>1,cloudProtocolMinimum:()=>1,cloudProtocolError:message=>Object.assign(new Error(message),{code:'FH_SYNC_UPDATE_REQUIRED'}),
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


export { fresh, section, response };
