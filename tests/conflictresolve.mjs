/* conflictresolve.mjs — the way out of an accounting stop.
 *
 * RULE 4: every number here is synthetic. None of it is Joel's data.
 *
 * Background: mergeRemoteState throws FH_SYNC_ACCOUNTING_CONFLICT rather than
 * guess which of two disagreeing totals is true. Correct — but the throw
 * happens before any assignment, and the push retry calls the same pull, so a
 * device in that state is severed from the cloud on every attempt with no
 * control anywhere that can end it.
 *
 * The thing being tested is not "does it adopt" — it is "can it ever lose a
 * session". Every guard below exists because the answer has to be no.
 */
import { launch, openApp, makeReporter } from './harness.mjs';

const PORT = process.argv[2] || 8998;
const R = makeReporter('conflictresolve.mjs');
const browser = await launch();
try {
  const { ctx, page, problems } = await openApp(browser, PORT, { settleMs: 5000 });

  const api = await page.evaluate(() => ({
    stuck: typeof window.fhSyncConflictStuck,
    pre: typeof window.fhConflictResolvePreflight,
    resolve: typeof window.fhResolveAccountingConflict,
    describe: typeof window.fhDescribeConflictPreflight,
    render: typeof window.renderSyncConflictPanel,
    panel: !!document.querySelector('#sync-conflict'),
    check: !!document.querySelector('#btn-conflict-check'),
    go: !!document.querySelector('#btn-conflict-resolve')
  }));
  R.eq('the detector exists', api.stuck, 'function');
  R.eq('the preflight exists', api.pre, 'function');
  R.eq('the resolver exists', api.resolve, 'function');
  R.eq('the report renderer exists', api.describe, 'function');
  R.check('the panel and both controls are in the markup', api.panel && api.check && api.go);

  /* ---- 1. it must fire for THIS failure and no other ------------------- */
  const detect = await page.evaluate(() => {
    const s = window.state;
    const set = (err, enabled) => { s.sync.enabled = enabled !== false; s.sync.lastSyncError = err;
                                    s.sync.pendingSince = Date.now() - 7200000;
                                    return !!window.fhSyncConflictStuck(); };
    return {
      accounting: set('Cloud accounting conflict in all-time focus minutes. Sync stopped before changing any data.'),
      race:       set('supabase push 409: {"code":"409"}'),
      offline:    set('Failed to fetch'),
      size:       set('supabase push 400: {"code":"23514","players_data_size_chk"}'),
      clean:      set(null),
      syncOff:    set('Cloud accounting conflict in hero XP. Sync stopped before changing any data.', false)
    };
  });
  R.eq('it fires on an accounting conflict', detect.accounting, true);
  R.eq('it does NOT fire on a genuine save race', detect.race, false);
  R.eq('nor when the device is simply offline', detect.offline, false);
  R.eq('nor on the row-size failure', detect.size, false);
  R.eq('nor when there is no error at all', detect.clean, false);
  R.eq('nor when sync is switched off entirely', detect.syncOff, false);

  /* ---- 2. the panel appears only in that state ------------------------- */
  const panel = await page.evaluate(() => {
    const s = window.state, box = document.querySelector('#sync-conflict');
    s.sync.enabled = true;
    s.sync.lastSyncError = 'supabase push 409: {"code":"409"}';
    window.renderSyncConflictPanel();
    const hiddenOnRace = box.hidden;
    s.sync.lastSyncError = 'Cloud accounting conflict in all-time focus minutes. Sync stopped before changing any data.';
    s.sync.pendingSince = Date.now() - 7200000;
    window.renderSyncConflictPanel();
    return { hiddenOnRace, shownOnConflict: !box.hidden,
             why: document.querySelector('#sync-conflict-why').textContent };
  });
  R.eq('hidden during an ordinary save race', panel.hiddenOnRace, true);
  R.eq('shown when the device is actually stopped', panel.shownOnConflict, true);
  R.check('and it says plainly that this will not clear by itself',
    /will not clear by itself/i.test(panel.why), panel.why);
  R.check('while confirming nothing has been changed on either side',
    /nothing has been changed on either side/i.test(panel.why), panel.why);

  /* ---- 3. the preflight names what is only here ------------------------ */
  const pre = await page.evaluate(async () => {
    const s = window.state;
    s.tasks = [
      { id:'t_keep', name:'Kept Skill', totalFocusMin:0, sessions:0, dailyMin:{} },
      { id:'t_gone', name:'Local Only Skill', totalFocusMin:0, sessions:0, dailyMin:{} }
    ];
    s.totalFocusMin = 1000;
    s.sessionsLog = [
      { id:'s_shared',  type:'focus', at: 1000, minutes: 60,  taskId:'t_keep', taskName:'Kept Skill' },
      { id:'s_localA',  type:'focus', at: 2000, minutes: 45,  taskId:'t_keep', taskName:'Kept Skill' },
      { id:'s_localB',  type:'focus', at: 3000, minutes: 30,  taskId:'t_gone', taskName:'Local Only Skill' },
      { id:'s_deleted', type:'focus', at: 4000, minutes: 90,  taskId:'t_keep', taskName:'Kept Skill' }
    ];
    /* The cloud: has the shared one, deliberately deleted another, and has
       never seen the two local ones. One of those has no skill over there. */
    window.fetchCloudRemote = async () => ({
      remotePayload: { cloud_rev: 4242 },
      sourceEncrypted: true,
      remoteState: {
        totalFocusMin: 5000,
        tasks: [{ id:'t_keep', name:'Kept Skill' }],
        sessionsLog: [{ id:'s_shared', type:'focus', at:1000, minutes:60, taskId:'t_keep' }],
        sessionTombstones: { s_deleted: { at: 4500 } }
      }
    });
    const p = await window.fhConflictResolvePreflight();
    return { rev:p.rev, cloudMinutes:p.cloudMinutes, localMinutes:p.localMinutes,
             localOnly: p.localOnly.map(x=>({id:x.id, min:x.minutes, carry:x.carryable})),
             blocked: p.blocked.map(x=>x.id), minutesAtRisk: p.minutesAtRisk,
             onlyLocalSkills: p.onlyLocalSkills,
             text: window.fhDescribeConflictPreflight(p) };
  });
  R.eq('it reads the cloud revision', pre.rev, 4242);
  R.eq('and both sides’ totals', `${pre.localMinutes}/${pre.cloudMinutes}`, '1000/5000');
  R.eq('it finds exactly the two sessions the cloud has never seen', pre.localOnly.length, 2);
  R.check('the shared session is not listed', !pre.localOnly.some(x=>x.id==='s_shared'));
  R.check('a session DELETED on the other device is not resurrected',
    !pre.localOnly.some(x=>x.id==='s_deleted'),
    'listed: ' + pre.localOnly.map(x=>x.id).join(','));
  R.eq('minutes at risk are counted', pre.minutesAtRisk, 75);
  R.check('the one with a matching skill can be carried',
    pre.localOnly.find(x=>x.id==='s_localA')?.carry === true);
  R.check('the one whose skill is missing over there CANNOT',
    pre.localOnly.find(x=>x.id==='s_localB')?.carry === false);
  R.eq('and it is flagged as blocking', pre.blocked.join(','), 's_localB');
  R.eq('the local-only skill is named', pre.onlyLocalSkills.join(','), 'Local Only Skill');
  R.check('the report spells out that resolving is blocked',
    /Resolving is blocked/i.test(pre.text), pre.text.slice(0,200));
  R.check('and marks the session that cannot be carried',
    /CANNOT be carried/.test(pre.text), pre.text.slice(0,400));

  /* ---- 4. it refuses, in every way it should --------------------------- */
  const refusals = await page.evaluate(async () => {
    const s = window.state;
    const out = {};
    out.blocked = await window.fhResolveAccountingConflict({});
    /* Clear the blocker, then age the check out. */
    s.sessionsLog = s.sessionsLog.filter(r => r.id !== 's_localB');
    const fresh = await window.fhConflictResolvePreflight();
    out.blockedCleared = fresh.blocked.length;
    window.__fhAgeCheck = true;
    return out;
  });
  R.check('it refuses while a session cannot be carried',
    refusals.blocked && refusals.blocked.ok === false && /cannot be carried/i.test(refusals.blocked.reason),
    JSON.stringify(refusals.blocked));
  R.eq('and the blocker clears once that session is gone', refusals.blockedCleared, 0);

  const notStuck = await page.evaluate(async () => {
    window.state.sync.lastSyncError = 'supabase push 409: {"code":"409"}';
    return await window.fhResolveAccountingConflict({});
  });
  R.check('it refuses outright when the device is not actually stopped',
    notStuck && notStuck.ok === false && /not stopped on an accounting conflict/i.test(notStuck.reason),
    JSON.stringify(notStuck));

  /* The last line of defence, and the one that actually fired in testing: the
     resolver takes a VERIFIED backup before it touches anything, and that
     backup refuses to be made while live state differs from the last durable
     commit. A resolve can therefore never run over uncommitted work. */
  const guarded = await page.evaluate(async () => {
    window.state.sync.lastSyncError = 'Cloud accounting conflict in all-time focus minutes. Sync stopped before changing any data.';
    window.state.sync.pendingSince = Date.now() - 7200000;
    const snapshotBefore = JSON.stringify(window.state);
    let threw = null;
    try { await window.fhResolveAccountingConflict({}); }
    catch (e){ threw = String((e && e.message) || e); }
    return { threw, unchanged: JSON.stringify(window.state) === snapshotBefore };
  });
  R.check('it stops rather than resolve over work that is not durably saved',
    !!guarded.threw && /Recovery copy|durable/i.test(guarded.threw), String(guarded.threw));
  R.eq('and live state was not touched when it stopped', guarded.unchanged, true);

  /* ---- 4b. THE HAPPY PATH, end to end, with a stubbed cloud -----------
     The point of this one is the carry. An adopt that quietly dropped the
     session this device alone was holding would pass every check above. */
  const happy = await page.evaluate(async () => {
    const s = window.state;
    s.tasks = [{ id:'t_keep', name:'Kept Skill', totalFocusMin:0, sessions:0, dailyMin:{}, lastUsedAt: Date.now() }];
    s.activeTaskId = 't_keep';
    s.sessionsLog = [];
    s.history = {}; s.totalFocusMin = 0; s.completedFocusSessions = 0;
    s.sync.enabled = true;
    s.sync.lastSyncError = 'Cloud accounting conflict in all-time focus minutes. Sync stopped before changing any data.';
    s.sync.pendingSince = Date.now() - 7200000;
    /* One real session, made through the app's own path so it is internally
       consistent, then hidden from the stubbed cloud. */
    await window.applyTaskTimeAdjustment('t_keep', 45, { surface:'test' });
    const mine = s.sessionsLog.filter(r=>r&&r.type==='focus')[0];
    const cloud = JSON.parse(JSON.stringify(s));
    cloud.sessionsLog = [];
    cloud.history = {};
    cloud.totalFocusMin = 5000;
    cloud.completedFocusSessions = 0;
    cloud.tasks = [{ ...cloud.tasks[0], totalFocusMin: 5000, sessions: 0, dailyMin:{} }];
    delete cloud.sync;
    window.fetchCloudRemote = async () => ({
      remotePayload: { cloud_rev: 9001 }, sourceEncrypted: false, remoteState: cloud
    });
    await window.saveStateDurable({ source:'test-settle' });
    const before = { minutes: s.totalFocusMin|0, sessionId: mine.id };
    const pre = await window.fhConflictResolvePreflight();
    const res = await window.fhResolveAccountingConflict({});
    const after = window.state;
    return { before, preCount: pre.localOnly.length, res,
             minutesAfter: after.totalFocusMin|0,
             sessionCount: (after.sessionsLog||[]).filter(r=>r&&r.type==='focus').length,
             taskMinutes: (after.tasks.find(t=>t.id==='t_keep')||{}).totalFocusMin|0,
             syncErr: after.sync.lastSyncError, rev: after.sync.cloudRev };
  });
  R.eq('the preflight sees the one session the cloud lacks', happy.preCount, 1);
  R.check('the resolve succeeds', !!(happy.res && happy.res.ok), JSON.stringify(happy.res).slice(0,220));
  R.eq('it lands on the cloud revision', happy.rev, 9001);
  R.eq('it reports carrying exactly one session', happy.res && happy.res.carried, 1);
  R.eq('worth exactly its minutes', happy.res && happy.res.carriedMinutes, 45);
  R.eq('the session survives the adopt', happy.sessionCount, 1);
  R.eq('and its minutes are ON TOP of the cloud total, not instead of it',
    happy.minutesAfter, 5045);
  R.eq('the skill keeps the cloud total plus the carried time', happy.taskMinutes, 5045);
  R.check('the stop is cleared so sync can resume', !happy.syncErr || !/accounting conflict/i.test(happy.syncErr),
    String(happy.syncErr));
  R.check('and a backup key was recorded', !!(happy.res && happy.res.backupKey),
    String(happy.res && happy.res.backupKey));

  /* ---- 5. an empty diff must read as safe, not as silence ------------- */
  const clean = await page.evaluate(async () => {
    const s = window.state;
    s.sessionsLog = [{ id:'s_shared', type:'focus', at:1000, minutes:60, taskId:'t_keep', taskName:'Kept Skill' }];
    s.tasks = [{ id:'t_keep', name:'Kept Skill', totalFocusMin:0, sessions:0, dailyMin:{} }];
    window.fetchCloudRemote = async () => ({
      remotePayload: { cloud_rev: 4242 }, sourceEncrypted: true,
      remoteState: { totalFocusMin: 5000, tasks: [{ id:'t_keep', name:'Kept Skill' }],
                     sessionsLog: [{ id:'s_shared', type:'focus', at:1000, minutes:60, taskId:'t_keep' }],
                     sessionTombstones: {} }
    });
    const p = await window.fhConflictResolvePreflight();
    return { n: p.localOnly.length, blocked: p.blocked.length, text: window.fhDescribeConflictPreflight(p) };
  });
  R.eq('with nothing unique here the list is empty', clean.n, 0);
  R.eq('and nothing blocks', clean.blocked, 0);
  R.check('the report says so in words rather than showing an empty space',
    /loses no sessions/i.test(clean.text), clean.text);

  /* The happy path calls the real cloudPush at the end. This sandbox has no
     outbound network, so that one failure is the harness, not the app - and it
     is named rather than filtered silently. */
  const real = problems.filter(t => !/ERR_FAILED|Failed to load resource|no cloud request was sent/i.test(t));
  R.check('no console errors beyond the sandbox\u2019s missing network',
    real.length === 0, real.slice(0,3).join(' | '));
  await ctx.close();
} finally {
  await browser.close();
}
