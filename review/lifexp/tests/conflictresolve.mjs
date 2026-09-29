/* Synthetic accounting-conflict review. No profile adoption, writes or network. */
import { launch, openApp, makeReporter } from './harness.mjs';
const PORT=process.argv[2]||9002;
const R=makeReporter('conflictresolve.mjs');
const browser=await launch();
try{
  const {ctx,page,problems}=await openApp(browser,PORT,{settleMs:2000});
  const detection=await page.evaluate(()=>{
    const set=(error,enabled=true)=>{window.state.sync.enabled=enabled;window.state.sync.lastSyncError=error;return !!window.fhSyncConflictStuck();};
    const out={accounting:set('Cloud accounting conflict in all-time focus minutes'),
      race:!set('supabase push 409'),offline:!set('Failed to fetch'),clean:!set(null),
      syncOff:!set('FH_SYNC_ACCOUNTING_CONFLICT',false)};
    set('FH_SYNC_ACCOUNTING_CONFLICT');window.renderSyncConflictPanel();
    out.panelShown=!document.querySelector('#sync-conflict').hidden;
    set('supabase push 409');window.renderSyncConflictPanel();
    out.panelHiddenForRace=document.querySelector('#sync-conflict').hidden;
    return out;
  });
  for(const [label,pass]of Object.entries(detection))R.check(label,pass);
  const result=await page.evaluate(async()=>{
    const clone=x=>JSON.parse(JSON.stringify(x));
    const original={id:'synthetic_prior',type:'focus',at:Date.parse('2026-08-01T15:00:00Z'),
      localDay:'2026-08-01',dayKey:'2026-08-01',minutes:45,taskId:'synthetic_skill',taskName:'Skill',
      xp:142,lockedInRun:true,priorityRun:true,sessionCountApplied:1,
      sessionDetails:{startedAt:Date.parse('2026-08-01T14:15:00Z'),completedAt:Date.parse('2026-08-01T15:00:00Z'),customFlag:'retain'},
      xpComponents:{base:114,bonus:28},unknownFutureField:{must:'survive'}};
    const shared={...clone(original),id:'synthetic_shared',minutes:10};
    const removed={...clone(original),id:'synthetic_removed'};
    const local={tasks:[{id:'synthetic_skill',name:'Skill'}],sessionsLog:[original,shared,removed],
      totalFocusMin:1000,history:{'2026-08-01':1000},hero:{xp:222},timer:{running:false}};
    const remote={tasks:[{id:'synthetic_skill',name:'Skill'}],sessionsLog:[shared],
      sessionTombstones:{synthetic_removed:{at:1}},totalFocusMin:5000,history:{'2026-08-01':5000},hero:{xp:999},timer:{running:false}};
    const localBefore=JSON.stringify(local),remoteBefore=JSON.stringify(remote);
    const plan=window.fhBuildConflictProposal(local,remote,4242);
    const proof={inputUnchanged:JSON.stringify(local)===localBefore&&JSON.stringify(remote)===remoteBefore,
      exact:JSON.stringify(plan.exactSessionEvidence[0])===JSON.stringify(original),count:plan.exactSessionEvidence.length,
      noApply:plan.canApply===false&&!plan.accountingVerified,noCandidate:!('candidate' in plan),
      excluded:plan.excluded.map(r=>r.id),shared:plan.shared,mode:plan.mode,
      totalsUnchanged:plan.cloudMinutes===5000&&plan.localMinutes===1000,
      text:window.fhDescribeConflictPreflight(plan)};
    plan.exactSessionEvidence[0].xp=0;
    proof.detached=local.sessionsLog[0].xp===142;
    const different=clone(remote);different.sessionsLog[0].xp++;
    proof.sameIdConflict=window.fhBuildConflictProposal(local,different,4242).issues.some(x=>/different contents/.test(x));
    const duplicate=clone(local);duplicate.sessionsLog.push(clone(original));
    const dup=window.fhBuildConflictProposal(duplicate,remote,4242);
    proof.duplicateBlocked=dup.issues.some(x=>/duplicate session ID/.test(x));
    proof.noDuplicateEvidence=dup.exactSessionEvidence.length===1;
    const noSkill=clone(remote);noSkill.tasks=[];
    proof.missingSkill=window.fhBuildConflictProposal(local,noSkill,4242).blocked.length===1;
    const malformed=clone(local);malformed.sessionsLog.push({minutes:4});
    proof.missingId=window.fhBuildConflictProposal(malformed,remote,4242).issues.some(x=>/stable ID/.test(x));
    proof.emptyWarning=/does not prove/.test(window.fhDescribeConflictPreflight(window.fhBuildConflictProposal(remote,remote,4242)));
    const s=window.state;
    Object.assign(s,clone(local));
    s.sync.enabled=true;s.sync.pendingSync=true;s.sync.lastSyncError='Cloud accounting conflict in totals';
    s.sync.pendingSince=Date.now()-7200000;
    let cloud=clone(remote),rev=4242,reads=0,options=[],mutations=[];
    window.fetchCloudRemote=async opts=>{reads++;options.push(opts);return {remotePayload:{cloud_rev:rev},remoteState:clone(cloud),sourceEncrypted:false};};
    window.saveStateDurable=async()=>{mutations.push('save');throw Error('write forbidden');};
    window.applyTaskTimeAdjustment=async()=>{mutations.push('adjust');throw Error('write forbidden');};
    window.cloudPush=async()=>{mutations.push('push');throw Error('write forbidden');};
    window.createVerifiedCloudAdoptionBackup=async()=>{mutations.push('backup');throw Error('write forbidden');};
    const snap=JSON.stringify(s);
    const pre=await window.fhConflictResolvePreflight();
    proof.preflightExact=JSON.stringify(pre.exactSessionEvidence[0])===JSON.stringify(original);
    pre.localFingerprint='caller tampering';
    proof.recheckSame=(await window.fhRecheckConflictProposal()).ok;
    const deny=await window.fhResolveAccountingConflict({force:true});
    proof.resolverDenied=deny.ok===false&&deny.code==='FH_RECOVERY_REVIEW_ONLY';
    proof.resolverReadCount=reads===2;
    proof.noWrites=mutations.length===0;
    proof.liveUnchanged=JSON.stringify(window.state)===snap;
    proof.readOnlyOptions=options.every(o=>o.authReadOnly===true&&o.persistAuth===false&&o.syncContext!==s.sync);
    await window.fhConflictResolvePreflight();
    cloud.sessionsLog.push(clone(original));rev++;
    proof.newCloudRejected=!(await window.fhRecheckConflictProposal()).ok;
    proof.secondRecheckRejected=!(await window.fhRecheckConflictProposal()).ok;
    const fresh=await window.fhConflictResolvePreflight();
    proof.newCloudNoDuplicate=fresh.exactSessionEvidence.length===0;
    cloud.hero.xp++;
    proof.sameRevisionChangeRejected=!(await window.fhRecheckConflictProposal()).ok;
    await window.fhConflictResolvePreflight();s.history['2026-08-01']++;
    proof.newLocalRejected=!(await window.fhRecheckConflictProposal()).ok;
    await window.fhConflictResolvePreflight();
    const realNow=Date.now;
    try{Date.now=()=>realNow()+11*60000;proof.expiredRejected=!(await window.fhRecheckConflictProposal()).ok;}
    finally{Date.now=realNow;}
    window.fetchCloudRemote=async()=>{s.totalFocusMin++;return {remotePayload:{cloud_rev:rev},remoteState:clone(cloud)};};
    try{await window.fhConflictResolvePreflight();proof.duringReadRejected=false;}
    catch(e){proof.duringReadRejected=/Newer local activity/.test(e.message);}
    proof.staleCacheCleared=!(await window.fhRecheckConflictProposal()).ok;
    proof.finalNoWrites=mutations.length===0;
    proof.noAdoptControl=!document.querySelector('#btn-conflict-resolve');
    proof.reviewControls=!!document.querySelector('#btn-conflict-check')&&!!document.querySelector('#btn-conflict-recheck');
    s.sync.enabled=false;
    return proof;
  });
  for(const [key,value] of Object.entries(result)){
    if(typeof value==='boolean')R.check(key,value);
  }
  R.eq('exactly one local session retained as evidence',result.count,1);
  R.eq('review-only mode',result.mode,'review-only');
  R.check('cloud deletion respected',JSON.stringify(result.excluded)==='["synthetic_removed"]');
  R.check('shared session not duplicated',JSON.stringify(result.shared)==='["synthetic_shared"]');
  R.check('report distinguishes recovery prerequisites',/independent immutable copy.*isolated restore drill.*choice/.test(result.text));
  R.check('report never promises restored accounting',/cannot choose the correct accounting totals/.test(result.text));
  R.check('no unexpected browser errors',problems.length===0,problems.join(' | '));
  await ctx.close();
}finally{await browser.close();}
R.finish();
