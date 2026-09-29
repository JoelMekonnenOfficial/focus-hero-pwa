/* Shared Hardcore calendar. Storage and sync go through the app's guarded APIs.
   Legacy date totals stay labelled as recorded. A timezone is never inferred
   for an old late-start declaration. All changes use the verified save gate. */
(function(){
  "use strict";
  if(window.FH_CALENDAR)return;
  const copy=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const own=(o,k)=>Object.prototype.hasOwnProperty.call(o||{},k);
  const plain=v=>!!v&&typeof v==="object"&&!Array.isArray(v);
  const safeId=id=>!!id&&!["__proto__","constructor","prototype"].includes(String(id));
  const formats=new Map(), clocks=new Map();
  let choiceInFlight=false;
  function fail(message){const e=new Error(message);e.code="FH_CALENDAR_REVIEW";throw e;}
  function dateOK(day){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(day)))return false;
    const d=new Date(day+"T12:00:00Z");return Number.isFinite(+d)&&d.toISOString().slice(0,10)===day;
  }
  function shift(day,n){if(!dateOK(day))return null;return new Date(Date.parse(day+"T12:00:00Z")+n*86400000).toISOString().slice(0,10);}
  function formatter(zone){
    if(typeof zone!=="string"||zone.length>100)fail("Choose a valid calendar timezone.");
    if(!formats.has(zone)){
      try{formats.set(zone,new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}));}
      catch(_){fail("This device cannot read that calendar timezone. Update the browser before judging a run.");}
    }
    return formats.get(zone);
  }
  function parts(stamp,zone){const out={};formatter(zone).formatToParts(new Date(stamp)).forEach(p=>{if(p.type!=="literal")out[p.type]=p.value;});return out;}
  function dayAt(stamp,zone){const p=parts(stamp,zone);return p.year+"-"+p.month+"-"+p.day;}
  function clockAt(day,minute,zone){
    if(!dateOK(day)||!Number.isInteger(minute)||minute<0||minute>=1440)fail("Invalid calendar date or clock time.");
    const key=zone+"|"+day+"|"+minute;if(clocks.has(key))return clocks.get(key);
    const wall=Date.parse(day+"T00:00:00Z")+minute*60000, offsets=new Set(), matches=[];
    for(let h=-36;h<=36;h+=6){
      const sample=wall+h*3600000,p=parts(sample,zone);
      offsets.add(Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second)-sample);
    }
    for(const offset of offsets){const at=wall-offset,p=parts(at,zone);
      if(p.year+"-"+p.month+"-"+p.day===day&&(+p.hour*60+ +p.minute)===minute)matches.push(at);}
    if(!matches.length)fail("That clock time does not exist because the clocks move forward. Choose a real time.");
    // An autumn repeated clock time consistently means its first occurrence.
    const result=Math.min(...matches);clocks.set(key,result);return result;
  }
  function stable(v){if(Array.isArray(v))return JSON.stringify(v.map(x=>JSON.parse(stable(x))));if(plain(v)){const o={};Object.keys(v).sort().forEach(k=>{o[k]=JSON.parse(stable(v[k]));});return JSON.stringify(o);}return JSON.stringify(v);}
  function valid(raw){
    if(raw==null)return null;
    const keys=(object,allowed)=>{if(Object.keys(object).some(k=>!allowed.includes(k)))fail("This calendar contains unsupported evidence. Update all devices before merging it.");};
    if(!plain(raw)||raw.version!==1||!dateOK(raw.fromDay)||typeof raw.id!=="string"||!Number.isSafeInteger(raw.chosenAt)||raw.chosenAt<=0)fail("The saved calendar needs review; no run was judged.");
    keys(raw,["version","id","timeZone","fromDay","chosenAt","legacyTimeZone","midnights","entries","lateReceipts"]);
    formatter(raw.timeZone);
    if(raw.id!=="hc-calendar-1:"+raw.timeZone+":"+raw.fromDay)fail("The saved calendar identity disagrees with its timezone.");
    if(raw.legacyTimeZone!=null)formatter(raw.legacyTimeZone);
    for(const name of ["midnights","entries","lateReceipts"])if(!plain(raw[name]))fail("The saved calendar evidence is incomplete.");
    for(const [day,at] of Object.entries(raw.midnights))if(!dateOK(day)||!Number.isSafeInteger(at))fail("A saved day boundary is invalid.");
    for(const [id,r] of Object.entries(raw.entries)){
      if(!safeId(id)||!plain(r)||!dateOK(r.recordedDay)||!Number.isSafeInteger(r.at)||!Number.isSafeInteger(r.updatedAt)||r.updatedAt<r.at||!Number.isSafeInteger(r.minutes)||r.minutes<0||![0,1].includes(r.sessions)||typeof r.deleted!=="boolean")fail("A saved calendar session receipt is invalid.");
      keys(r,["at","recordedDay","minutes","sessions","updatedAt","deleted"]);
    }
    for(const [id,r] of Object.entries(raw.lateReceipts)){
      if(!safeId(id)||!plain(r)||!dateOK(r.day)||!["set","clear"].includes(r.kind)||!Number.isSafeInteger(r.at)||r.at<=0||(r.kind==="set"&&(!Number.isSafeInteger(r.fromMs)||!Number.isInteger(r.startMin)||r.startMin<=0||r.startMin>=1440)))fail("A saved late-start receipt is invalid.");
      keys(r,r.kind==="clear"?["day","at","kind"]:["day","at","kind","fromMs","startMin"]);
    }
    return raw;
  }
  function unionImmutable(a,b,label){const out=copy(a);for(const [key,value] of Object.entries(b)){if(own(out,key)&&stable(out[key])!==stable(value))fail("Conflicting "+label+" receipts require review; both copies are preserved.");out[key]=copy(value);}return out;}
  function merge(a,b){
    a=valid(a);b=valid(b);if(!a)return copy(b);if(!b)return copy(a);
    if(a.id!==b.id)fail("These devices chose different Hardcore calendars. Keep both copies and review the timezone choice before syncing.");
    if(a.legacyTimeZone&&b.legacyTimeZone&&a.legacyTimeZone!==b.legacyTimeZone)fail("The confirmed historical timezones disagree; both copies remain protected.");
    const out=copy(a);out.chosenAt=Math.min(a.chosenAt,b.chosenAt);
    if(a.legacyTimeZone||b.legacyTimeZone)out.legacyTimeZone=a.legacyTimeZone||b.legacyTimeZone;
    out.midnights=unionImmutable(a.midnights,b.midnights,"day boundary");
    out.lateReceipts=unionImmutable(a.lateReceipts,b.lateReceipts,"late-start");
    for(const [id,row] of Object.entries(b.entries)){
      const old=out.entries[id];if(!old){out.entries[id]=copy(row);continue;}
      if(row.deleted!==old.deleted){if(row.deleted)out.entries[id]=copy(row);continue;}
      if(row.updatedAt===old.updatedAt&&stable(row)!==stable(old))fail("Conflicting calendar session receipts require review.");
      if(row.updatedAt>old.updatedAt)out.entries[id]=copy(row);
    }
    return valid(out);
  }
  function current(s){return valid((s||window.state||{}).fhCalendar);}
  function calendarDay(stamp,s){const cal=current(s);return cal?dayAt(stamp==null?Date.now():stamp,cal.timeZone):null;}
  function activeLate(cal,day){
    let best=null;for(const [id,r] of Object.entries(cal.lateReceipts))if(r.day===day&&(!best||r.at>best.at||(r.at===best.at&&id>best.id)))best=Object.assign({id},r);
    return best&&best.kind==="set"?best:null;
  }
  function isFuture(day,cal){return !!cal&&day>=cal.fromDay;}
  function windowFor(day,s){
    s=s||window.state||{};const cal=current(s);if(!cal)return null;
    const future=isFuture(day,cal),zone=future?cal.timeZone:cal.legacyTimeZone;
    const legacyMap=s.lateStarts||{},prev=shift(day,-1),next=shift(day,1);
    const hasLegacy=[prev,day,next].some(k=>legacyMap[k]&&Number(legacyMap[k].startMin)>0);
    if(!future&&!zone&&hasLegacy)return{uncertain:true,ownerDay:day,reason:"Confirm the timezone used for earlier late-start dates before this day can be judged."};
    if(!future&&!hasLegacy)return null; // Preserve the original ordinary date totals.
    const tz=zone||cal.timeZone;
    const midnight=k=>future&&own(cal.midnights,k)?cal.midnights[k]:clockAt(k,0,tz);
    const declaration=k=>{
      if(k>=cal.fromDay)return activeLate(cal,k);
      const raw=legacyMap[k];if(!raw||!(Number(raw.startMin)>0))return null;
      if(!cal.legacyTimeZone)return{uncertain:true};
      return{startMin:Number(raw.startMin),fromMs:clockAt(k,Number(raw.startMin),cal.legacyTimeZone)};
    };
    const ownLate=declaration(day),prior=declaration(prev),following=declaration(next);
    // A prospective cutover does not borrow an ambiguous legacy window.
    if([ownLate,prior,following].some(x=>x&&x.uncertain))return{uncertain:true,ownerDay:day,reason:"An adjacent older late-start window needs its original timezone confirmed."};
    const fromMs=ownLate?ownLate.fromMs:prior?prior.fromMs+86400000:midnight(day);
    const naturalEnd=ownLate?fromMs+86400000:midnight(next);
    const toMs=Math.max(naturalEnd,following?following.fromMs:naturalEnd);
    return{fromMs,toMs,ownerDay:day,late:!!ownLate,carried:!ownLate&&!!prior,extended:toMs!==naturalEnd,shared:future,
      timeZone:tz,startMin:ownLate?ownLate.startMin:prior?prior.startMin:0,hours:(toMs-fromMs)/3600000};
  }
  function collect(s,cal){
    const out=copy(cal.entries),cutoff=cal.midnights[cal.fromDay]??clockAt(cal.fromDay,0,cal.timeZone);
    for(const rec of s.sessionsLog||[]){
      if(!rec||rec.type!=="focus")continue;
      const at=Number(rec.at||rec.completedAt||rec.startedAt);if(!Number.isSafeInteger(at)||at<cutoff)continue;
      if(!safeId(rec.id))fail("A new calendar session is missing a usable identity; keep this copy for review.");
      const minutes=Number(rec.minutes);if(!Number.isFinite(minutes)||minutes<0)fail("A new calendar session has invalid minutes.");
      const explicit=Number(rec.sessionCountApplied);
      const recordedDay=dateOK(rec.localDay)?rec.localDay:dateOK(rec.dayKey)?rec.dayKey:null;
      if(!recordedDay)fail("A new calendar session is missing its originally recorded date; no date was guessed.");
      const row={at,recordedDay,minutes:Math.floor(minutes),sessions:Number.isFinite(explicit)?(explicit>0?1:0):(minutes>0&&rec.source!=="ledger"?1:0),
        updatedAt:Math.max(at,Number(rec.updatedAt)||0,Number(rec.editedAt)||0,Number(rec.completedAt)||0),deleted:false};
      const old=out[String(rec.id)];
      if(!old||(!old.deleted&&row.updatedAt>=old.updatedAt))out[String(rec.id)]=row;
    }
    for(const [id,at] of Object.entries(s.sessionTombstones||{}))if(out[id]&&Number(at)>0)out[id]=Object.assign({},out[id],{minutes:0,sessions:0,deleted:true,updatedAt:Math.max(out[id].updatedAt,Number(at))});
    return out;
  }
  function prepared(s){
    const cal=current(s);if(!cal)return null;const out=copy(cal);
    const end=shift(dayAt(Date.now(),cal.timeZone),3);
    let day=shift(cal.fromDay,-1),n=0;
    while(day<=end&&n++<20005){if(!own(out.midnights,day))out.midnights[day]=clockAt(day,0,cal.timeZone);day=shift(day,1);}
    if(day<=end)fail("Calendar evidence exceeds the protected date limit.");
    out.entries=collect(s,out);return valid(out);
  }
  function totals(day,s,includeLegacyWindow){
    s=s||window.state;const cal=current(s),w=windowFor(day,s);
    if(!cal||!w||(!w.shared&&!includeLegacyWindow)||w.uncertain)return null;
    if(!(w.toMs>w.fromMs))fail("This day has no usable duration; no result was recorded.");
    const later=windowFor(shift(day,1),s);if(later&&later.uncertain)fail(later.reason);
    let minutes=0,sessions=0;for(const rec of Object.values(collect(s,cal))){
      if(rec.deleted||rec.at<w.fromMs||rec.at>=w.toMs)continue;
      if(later&&rec.at>=later.fromMs&&rec.at<later.toMs)continue;
      minutes+=rec.minutes;sessions+=rec.sessions;
    }
    return{minutes,sessions};
  }
  function legacyRemainder(day,units,s){
    s=s||window.state;const cal=current(s),field=units?"sessionHistory":"history";
    let amount=Math.max(0,Math.floor(Number(s[field]&&s[field][day])||0));if(!cal)return amount;
    // A device-local date may put post-cutover work on yesterday. Remove only
    // that positively identified portion before assigning it by absolute time.
    for(const rec of Object.values(collect(s,cal)))if(!rec.deleted&&rec.recordedDay===day)amount-=units?rec.sessions:rec.minutes;
    return Math.max(0,amount);
  }
  async function persist(next,source){
    const s=window.state;if(!s||typeof window.saveStateDurable!=="function")return{ok:false,reason:"Verified saving is unavailable."};
    if(choiceInFlight)return{ok:false,reason:"A calendar choice is already saving."};
    try{next=prepared(Object.assign({},s,{fhCalendar:next}));}catch(e){return{ok:false,reason:e.message||String(e)};}
    choiceInFlight=true;const had=own(s,"fhCalendar"),before=s.fhCalendar;s.fhCalendar=next;let installed=next,raw=JSON.stringify(next);
    try{const pending=window.saveStateDurable({source:"calendar-"+source});if(JSON.stringify(s.fhCalendar)===raw)installed=s.fhCalendar;
      if(await pending===false)throw new Error("The calendar choice could not be saved.");return{ok:true};
    }catch(e){if(window.state===s&&s.fhCalendar===installed&&JSON.stringify(installed)===raw){if(had)s.fhCalendar=before;else delete s.fhCalendar;}return{ok:false,reason:e.message||String(e)};
    }finally{choiceInFlight=false;}
  }
  function hasHistory(s){return Number(s.totalFocusMin)>0||(s.sessionsLog||[]).length>0||Object.keys(s.history||{}).length>0||Object.keys(s.lateStarts||{}).length>0||!!(s.fh12Hardcore&&((s.fh12Hardcore.runs||[]).length||(s.fh12Hardcore.history||[]).length||s.fh12Hardcore.active));}
  async function choose(timeZone,options){
    try{
      options=options||{};formatter(timeZone);
      // A synced profile must first learn an existing choice through the normal
      // guarded pull. An offline first choice could otherwise strand two peers.
      if(!current()&&window.state?.sync?.enabled){
        if(typeof window.cloudPull!=="function")return{ok:false,reason:"Let normal sync finish on this device before choosing a calendar."};
        const pulled=await window.cloudPull({force:true,full:true,requireRemote:true,reason:"calendar-choice"});
        if(!pulled)return{ok:false,reason:"Calendar choice is waiting for a complete normal sync. Choose on one device, then sync your others."};
      }
      const s=window.state,old=current(s);
      if(old){if(old.timeZone!==timeZone)return{ok:false,reason:"The shared calendar is locked. Changing historical boundaries needs a separate review."};
        if(!options.confirmLegacy)return{ok:true,noChange:true};
        if(old.legacyTimeZone&&old.legacyTimeZone!==timeZone)return{ok:false,reason:"The earlier timezone is already confirmed differently."};
        const next=copy(old);next.legacyTimeZone=timeZone;return persist(next,"confirm-history");}
      const today=dayAt(Date.now(),timeZone),fromDay=hasHistory(s)?shift(today,1):today;
      const next={version:1,id:"hc-calendar-1:"+timeZone+":"+fromDay,timeZone,fromDay,chosenAt:Date.now(),midnights:{},entries:{},lateReceipts:{}};
      if(options.confirmLegacy)next.legacyTimeZone=timeZone;
      return await persist(prepared(Object.assign({},s,{fhCalendar:next})),"choose");
    }catch(e){return{ok:false,reason:e.message||String(e)};}
  }
  async function ensureForNewRun(){
    if(current())return{ok:true};if(hasHistory(window.state))return{ok:false,reason:"Choose the shared Hardcore calendar first. Earlier progress is preserved."};
    return choose(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }
  async function confirmLegacy(timeZone){
    try{formatter(timeZone);const cal=current();if(!cal)return{ok:false,reason:"Choose the shared future calendar first."};
      if(cal.legacyTimeZone)return{ok:cal.legacyTimeZone===timeZone,reason:"The historical timezone is already confirmed and cannot be silently changed."};
      const next=copy(cal);next.legacyTimeZone=timeZone;return persist(next,"confirm-history");
    }catch(e){return{ok:false,reason:e.message||String(e)};}
  }
  async function setLate(minute,clear){
    try{const cal=current();if(!cal)return{ok:false,reason:"Choose the shared calendar first."};
      const now=Date.now(),day=dayAt(now,cal.timeZone);if(day<cal.fromDay)return{ok:false,reason:"The shared calendar starts on "+cal.fromDay+". Earlier late-start records are preserved."};
      if(!clear&&(!Number.isInteger(minute)||minute<=0||minute>=1440))return{ok:false,reason:"Choose a time later than midnight and before the end of the day."};
      const next=copy(cal),id="late:"+now+":"+(window.crypto&&window.crypto.randomUUID?window.crypto.randomUUID():Math.random().toString(36).slice(2));
      next.lateReceipts[id]=clear?{day,at:now,kind:"clear"}:{day,at:now,kind:"set",startMin:minute,fromMs:clockAt(day,minute,cal.timeZone)};
      return await persist(next,clear?"clear-late-start":"late-start");
    }catch(e){return{ok:false,reason:e.message||String(e)};}
  }
  window.FH_CALENDAR=Object.freeze({validate:valid,merge,prepared,choose,confirmLegacy,ensureForNewRun,setLate,totals,windowFor,dayAt,clockAt,shift,
    legacyRemainder,futurePortion:(day,s)=>totals(day,s,true),
    cutoff:()=>{const c=current();return c?(c.midnights[c.fromDay]??clockAt(c.fromDay,0,c.timeZone)):Infinity;},
    covers:(candidate,prior)=>stable(merge(prior,candidate))===stable(candidate),
    current,calendarDay,hasHistory,deviceZone:()=>Intl.DateTimeFormat().resolvedOptions().timeZone,
    activeLate:day=>{const c=current();return c?copy(activeLate(c,day)):null;},
    clockParts:(stamp,zone)=>{const c=current(),z=zone||(c&&c.timeZone)||Intl.DateTimeFormat().resolvedOptions().timeZone,p=parts(stamp,z);return{day:dayAt(stamp,z),minute:+p.hour*60+ +p.minute};},
    status:()=>{try{const c=current();return c?{ok:true,timeZone:c.timeZone,fromDay:c.fromDay,legacyConfirmed:!!c.legacyTimeZone}:{ok:false,reason:"Choose a shared timezone before Hardcore days are judged across devices."};}catch(e){return{ok:false,reason:e.message};}}});
})();
