/* Exact-source identity transaction races. All states and effects are invented;
 * no browser, storage, backup, credential or network API is available. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'../starmax/index.html'),'utf8');
const first=html.indexOf('async function adoptVerifiedCloudProfile(){');
const last=html.indexOf('\nlet cloudPushInFlight',first);
assert(first>=0&&last>first);
const source=html.slice(first,last);
const copy=x=>JSON.parse(JSON.stringify(x));
const initial=()=>({totalFocusMin:60,settings:{e2eEncryption:true,theme:'ocean'},timer:{},fh11Clocks:{slots:[]},
  sync:{playerId:'synthetic-player',cloudRev:2,syncCode:'FAKE',syncSecretHash:'synthetic-hash',backend:'supabase'}});

function fixture(mode){
  const original=initial(),operation={generation:1},ui=new Map();
  const c={state:original,DEFAULTS:{sync:{}},primarySaveTail:Promise.resolve(),primaryLastDurableRaw:JSON.stringify(original),
    accountingStorageIndeterminate:false,syncIdentityOperation:operation,saveCalls:0,uploadCalls:0,
    pendingCloudAdoption:{identityOperation:operation,candidateSync:copy(original.sync),observedRev:3,fingerprint:'synthetic-fingerprint'},
    $:id=>{if(!ui.has(id))ui.set(id,{textContent:'',dataset:{},setAttribute(){}});return ui.get(id);},
    console:{warn(){}},deepClone:copy,hasSavedDeviceClocks:()=>false,hasUnfinishedDeviceRun:()=>false,
    beginSyncIdentityOperation:()=>operation,endSyncIdentityOperation(){},assertSyncOperationCurrent(){},setSyncClaimBusy(){},
    hasSupabase:()=>true,sha256:async()=>'synthetic-hash',derivePlayerId:async()=>'synthetic-player',now:()=>100,
    syncControlError:(code,message)=>Object.assign(new Error(message),{code}),safeClaimErrorMessage:e=>e.message,
    cloudStateFingerprint:async()=>'synthetic-fingerprint',noteCloudProtocol(){},
    clearCloudRetryTimer(){},clearPendingCloudAdoption(){},renderAll(){},renderSyncStatus(){},renderSecurityPanel(){},toast(){},
    renderPendingCloudAdoption(){},startPullPoll(){},scheduleCloudRetry(){},flushHardcoreMergeNotices(){},
    async fetchCloudRemote(){
      if(mode==='before-install'){
        c.state=copy(c.state);c.state.totalFocusMin=73;c.expected=c.state;
        throw new Error('synthetic interrupted read');
      }
      return {remoteState:{totalFocusMin:9,settings:{e2eEncryption:true}},sourceEncrypted:true,sourceProtocolVersion:2,
        remotePayload:{cloud_rev:3}};
    },
    readVerifiedPrimaryUploadBase:async()=>({head:{commitId:'synthetic-head'},raw:c.primaryLastDurableRaw}),
    async createVerifiedCloudAdoptionBackup(){return {previousRaw:JSON.stringify(c.state),commitId:'synthetic-head'};},
    buildAuthoritativeCloudState:(remote,sync,payload,encrypted,timer,clocks,settings)=>({totalFocusMin:69,settings:copy(settings),
      timer:copy(timer),fh11Clocks:copy(clocks),sync:{...copy(sync),enabled:false}}),
    mergeRemoteState:(local)=>({...copy(local),totalFocusMin:69}),
    async cloudPush(){c.uploadCalls++;throw new Error('Unexpected upload in failed local transaction');},
    async saveStateDurable(opts){
      c.saveCalls++;
      assert(['cloud-profile-adopt','sync-identity-claim'].includes(opts.source));
      if(mode==='prepared')c.state.fhCalendar={syntheticPreparedReceipt:true};
      opts.onPrepared?.({state:c.state,raw:JSON.stringify(c.state)});
      await Promise.resolve();
      if(mode==='in-place'){c.state.totalFocusMin=76;c.expected=c.state;}
      if(mode==='replacement'){c.state={...copy(c.state),totalFocusMin:90};c.expected=c.state;}
      if(mode==='returned-false')return false;
      throw new Error('synthetic durable refusal');
    }
  };
  c.window=c;vm.createContext(c);vm.runInContext(source,c);
  return {c,original,ui};
}

(async()=>{
  let checks=0;
  for(const operation of ['adopt','claim'])for(const mode of ['unchanged','prepared','in-place','replacement','returned-false']){
    const {c,original}=fixture(mode);
    const result=operation==='adopt'?await c.adoptVerifiedCloudProfile():await c.claimSyncCode('FAKE-SYNTHETICSECRET');
    assert.equal(c.saveCalls,1,'fixture reaches the actual transaction save');
    assert.equal(result,false,'failed local write is not success');
    assert.equal(c.uploadCalls,0,'failed local writes never advance to upload');
    if(c.expected)assert.equal(c.state,c.expected,'newer work object is retained');
    else assert.equal(c.state,original,'only this transaction’s unchanged candidate is rolled back');
    assert.equal(c.state.totalFocusMin,c.expected?.totalFocusMin||60);
    console.log('PASS '+operation+': '+mode);checks++;
  }
  const {c}=fixture('before-install');
  assert.equal(await c.adoptVerifiedCloudProfile(),false);
  assert.equal(c.saveCalls,0);assert.equal(c.state,c.expected);assert.equal(c.state.totalFocusMin,73);
  console.log('PASS adoption read failure cannot restore an earlier state before installing anything');checks++;
  console.log(checks+'/'+checks+' identity rollback checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
