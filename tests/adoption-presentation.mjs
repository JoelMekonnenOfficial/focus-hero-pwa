/* Synthetic construction and read-only transport contract; no live adoption. */
import {launch,openApp,makeReporter} from './harness.mjs';
const PORT=process.argv[2]||9002,R=makeReporter('adoption-presentation.mjs');
const browser=await launch();
try{
  const {ctx,page,problems}=await openApp(browser,PORT,{settleMs:2000});
  const measured=await page.evaluate(async()=>{
    const clone=x=>JSON.parse(JSON.stringify(x));
    const remote=clone(window.state),local=clone(window.state);
    Object.assign(local.settings,{theme:'ocean',layout:'immersive',gameShell:'quest',colorPreset:'custom',
      customAccent:'#123456',customAccent2:'#654321',timerFont:'mono',timerWeight:500,
      timerColor:'custom',customTimerColor:'#112233',clockStyle:'minimal',wallpaperOn:false,
      wallpaperIntensity:25,wallpaperMotion:false,bgStyle:'solid',scene:'forest',lockedInXpPct:1,focusMin:99});
    Object.assign(remote.settings,{theme:'light',timerFont:'air',colorPreset:'mint',lockedInXpPct:25,focusMin:25,e2eEncryption:false});
    const keys=['theme','layout','gameShell','colorPreset','customAccent','customAccent2','timerFont','timerWeight',
      'timerColor','customTimerColor','clockStyle','wallpaperOn','wallpaperIntensity','wallpaperMotion','bgStyle','scene'];
    const timer={...clone(local.timer),remaining:123},clocks={slots:[{id:'scratch-clock',minutes:3}]};
    const sync={...clone(local.sync),enabled:true,userToken:'synthetic',cloudRev:1};
    const before=JSON.stringify([window.state,remote,local,timer,clocks,sync]);
    const adopted=window.buildAuthoritativeCloudState(remote,sync,{cloud_rev:44},true,timer,clocks,local.settings);
    const out={kept:keys.filter(k=>JSON.stringify(adopted.settings[k])===JSON.stringify(local.settings[k])),
      inputsUnchanged:before===JSON.stringify([window.state,remote,local,timer,clocks,sync]),
      timer:JSON.stringify(adopted.timer)===JSON.stringify(timer),clocks:JSON.stringify(adopted.fh11Clocks)===JSON.stringify(clocks),
      accountSettings:adopted.settings.lockedInXpPct===25&&adopted.settings.focusMin===25,
      encryption:adopted.settings.e2eEncryption===true,disabled:adopted.sync.enabled===false,
      pending:adopted.sync.pendingSync===false,revision:adopted.sync.cloudRev===44};
    adopted.settings.customAccent='#ffffff';adopted.timer.remaining=1;adopted.fh11Clocks.slots[0].minutes=9;
    out.detached=local.settings.customAccent==='#123456'&&timer.remaining===123&&clocks.slots[0].minutes===3;
    const fallback=window.buildAuthoritativeCloudState(remote,sync,{cloud_rev:44},false,timer,clocks,{theme:undefined});
    out.missingPresentationDoesNotErase=fallback.settings.theme==='light';
    const sourceRemote=clone(window.state),calls=[];
    window.supabaseRequest=async(path,opts)=>{calls.push({path,opts});return new Response(JSON.stringify([{cloud_rev:55,data:sourceRemote}]),{status:200,headers:{'Content-Type':'application/json'}});};
    const detachedSync={...clone(window.state.sync),backend:'supabase',playerId:'synthetic-player',cloudRev:2};
    const storageBefore=localStorage.getItem('focusHero.v4.lastCloudReconcileAt');
    const stateBefore=JSON.stringify(window.state);
    const response=await window.fetchCloudRemote({force:true,requireRemote:true,persistAuth:false,authReadOnly:true,syncContext:detachedSync});
    out.transportDetached=JSON.stringify(window.state)===stateBefore;
    out.noReconcileWrite=localStorage.getItem('focusHero.v4.lastCloudReconcileAt')===storageBefore;
    out.readOnlyForwarded=calls.length===1&&calls[0].opts.authReadOnly===true&&calls[0].opts.persistAuth===false;
    out.readCompleted=response.remotePayload.cloud_rev===55;
    return out;
  });
  R.eq('all explicit device presentation settings survive construction',measured.kept.length,16);
  for(const [key,value]of Object.entries(measured))if(typeof value==='boolean')R.check(key,value);
  R.check('no browser errors',problems.length===0,problems.join(' | '));
  await ctx.close();
}finally{await browser.close();}
R.finish();
