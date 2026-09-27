/* Exact application modules, synthetic memory only. No browser/profile/cloud.
 * node tests/rank-fairness-regressions.cjs [path/to/starmax]
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
process.env.TZ = 'America/Toronto';
const dir = path.resolve(process.argv[2] || path.join(__dirname, '../starmax'));
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const windows = html.slice(html.indexOf('function lateStartMap(){'), html.indexOf('function lateStartInfoFor(day){'));
const sources = ['fh-hardcore-v12.js', 'fh-rank-v1.js'].map(file => fs.readFileSync(path.join(dir, file), 'utf8'));
const clone = value => JSON.parse(JSON.stringify(value));
const at = text => new Date(text).getTime();
function sandbox(initial, date = '2026-09-27T12:00:00-04:00') {
  let now = at(date);
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const c = { state:clone(initial), Date:Clock, console:{ warn() {} }, navigator:{},
    document:{ readyState:'loading', addEventListener() {}, getElementById() { return null; } },
    setTimeout() { return 1; }, clearTimeout() {}, addEventListener() {}, FH_onPrimaryReady() {},
    saves:[], async saveStateDurable() { c.saves.push(clone(c.state)); return true; },
    todayKey(d = new Clock()) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
  };
  c.window = c;
  vm.createContext(c);
  vm.runInContext(windows, c);
  sources.forEach(source => vm.runInContext(source, c));
  c.advance = date => { now = at(date); };
  return c;
}
function run(id = 'four', minutes = 240, extra = {}) {
  return { id, startedAt:at('2026-09-25T08:00:00-04:00'), startDay:'2026-09-25',
    requirement:{ type:'minutes', value:minutes }, daysSurvived:0,
    lastCheckedDay:'2026-09-25', lastCheckedAt:1, pauses:[], excusedDays:[], ...extra };
}
function profile(runs = [run()], history = { '2026-09-25':500, '2026-09-26':500 }) {
  return { history, tasks:[], lateStarts:{}, sessionsLog:[], sync:{ enabled:false },
    fhRank:{ version:1, installedDay:'2026-09-01', installedAt:1, events:{} },
    fh12Hardcore:{ version:2, active:!!runs.length, run:runs[0] || null, runs, history:[] } };
}
function failure(id, day, delta = -200, kind = 'hardcore_fail') {
  return { id, kind, day, delta, at:1, label:'Original exact event', exempt:false };
}
function activeEvents(c) { return c.FH_RANK.fold(c.FH_RANK.normalize(c.state.fhRank), '2026-10-05').days.flatMap(d => d.events); }
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('fair reward/cost calibration stays bounded for custom, session, 4h, and 8h bars', () => {
  const c = sandbox(profile());
  for (const [minutes, day, cost] of [[1,12,-24],[60,20,-40],[240,40,-50],[480,57,-50],[1440,70,-50]]) {
    const req = { type:'minutes', value:minutes };
    assert.equal(c.FH_RANK.hardcoreDailyRP(req), day);
    assert.equal(c.FH_RANK.hardcoreFailureRP(req), cost);
    assert.ok(-cost / Math.round(day * c.FH_RANK.SCALE_FLOOR) <= 8);
  }
  assert.equal(c.FH_RANK.hardcoreDailyRP({ type:'sessions', value:4 }), 35);
});

test('an ongoing run enrolls prospectively, earns settled future days, and never backfills old daily RP', async () => {
  const c = sandbox(profile());
  await c.FH_HARDCORE.evaluateAutomatically();
  assert.equal(c.state.fh12Hardcore.runs[0].rankDailyFromDay, '2026-09-28');
  assert.equal(Object.keys(c.state.fhRank.events).filter(id => id.startsWith('hcday2:')).length, 0);
  c.state.history['2026-09-27'] = 500;
  c.state.history['2026-09-28'] = 500;
  c.advance('2026-09-29T00:01:00-04:00');
  await c.FH_HARDCORE.evaluateAutomatically();
  assert.equal(c.state.fhRank.events['hcday2:2026-09-28'].delta, 40);
  assert.equal(c.state.fhRank.events['hcday2:2026-09-27'], undefined);
  const saved = JSON.stringify(c.state.fhRank);
  await c.FH_HARDCORE.evaluateAutomatically();
  c.FH_RANK.materialize(c.state);
  assert.equal(JSON.stringify(c.state.fhRank), saved, 'repeated evaluation pays once');
});

test('parallel easier or duplicate runs pay once; later stronger proof adds only the difference', () => {
  const receipt = { rankDailyFromDay:'2026-09-25', rankEarnedDays:['2026-09-25'] };
  const c = sandbox(profile([run('a',240,receipt),run('b',240,receipt),run('c',60,receipt)]));
  c.FH_RANK.materialize(c.state);
  const weaker = clone(c.state.fhRank);
  assert.equal(weaker.events['hcday2:2026-09-25'].delta, 40);
  c.state.fh12Hardcore.runs.push(run('d',480,receipt));
  c.FH_RANK.materialize(c.state);
  const stronger = clone(c.state.fhRank);
  assert.equal(stronger.events['hcday2:2026-09-25'].delta, 57);
  for (const [a,b] of [[weaker,stronger],[stronger,weaker]]) {
    const merged = c.FH_RANK.merge(a,b);
    assert.equal(merged.events['hcday2:2026-09-25'].delta, 57);
    assert.equal(Object.keys(merged.events).filter(id => id.startsWith('hcday2:')).length, 1);
    assert.deepEqual(clone(c.FH_RANK.merge(merged, weaker)), clone(merged));
  }
});

test('settled actual dates exclude missed paused/excused days and date milestones correctly', async () => {
  const r = run('four',240,{ startDay:'2026-09-21', rankDailyFromDay:'2026-09-21',
    excusedDays:['2026-09-22'], pauses:[{ from:at('2026-09-23T00:00:00-04:00'), to:at('2026-09-24T00:00:00-04:00') }] });
  const c = sandbox(profile([r],{ '2026-09-21':300,'2026-09-24':300,'2026-09-25':300,'2026-09-26':300,'2026-09-27':300 }));
  await c.FH_HARDCORE.evaluateAutomatically();
  assert.deepEqual(clone(c.state.fh12Hardcore.runs[0].rankEarnedDays), ['2026-09-21','2026-09-24','2026-09-25','2026-09-26']);
  assert.equal(c.state.fhRank.events['hcm:four:3'].day, '2026-09-25');
  for (const day of ['2026-09-22','2026-09-23','2026-09-27']) assert.equal(c.state.fhRank.events['hcday2:'+day], undefined);
});

test('a late-start day earns no RP at midnight; it earns after the actual noon close', async () => {
  const p = profile([run('four',240,{ rankDailyFromDay:'2026-09-25' })]);
  p.lateStarts['2026-09-26'] = { startMin:720, declaredAt:at('2026-09-26T12:00:00-04:00') };
  p.sessionsLog = [{ id:'earned', type:'focus', minutes:300, at:at('2026-09-26T16:00:00-04:00') }];
  const c = sandbox(p, '2026-09-27T00:01:00-04:00');
  await c.FH_HARDCORE.evaluateAutomatically();
  assert.equal(c.state.fhRank.events['hcday2:2026-09-26'], undefined);
  c.advance('2026-09-27T12:01:00-04:00');
  await c.FH_HARDCORE.evaluateAutomatically();
  assert.equal(c.state.fhRank.events['hcday2:2026-09-26'].delta, 40);
});

test('new failures on existing runs use fair policy; legacy recorded amounts remain byte-exact', async () => {
  const p = profile([run()], { '2026-09-25':500 });
  p.fhRank.events['hcf:old'] = failure('hcf:old','2026-09-20',-173);
  const old = JSON.stringify(p.fhRank.events['hcf:old']);
  const c = sandbox(p);
  await c.FH_HARDCORE.evaluateAutomatically();
  assert.equal(c.state.fhRank.events['hcf:four:2026-09-26'].delta, -50);
  assert.equal(JSON.stringify(c.state.fhRank.events['hcf:old']), old);
  const stale = clone(c.state.fhRank);
  stale.events['hcf:four'] = failure('hcf:four','2026-09-26');
  c.state.fhRank = c.FH_RANK.merge(c.state.fhRank,stale);
  assert.equal(activeEvents(c).filter(e => e.id.startsWith('hcf:four')).length, 1, 'the same episode never charges twice');
  assert.equal(activeEvents(c).find(e => e.id.startsWith('hcf:four')).delta, -200, 'ambiguous old-client evidence keeps its exact original amount');
});

test('a same-run legacy failure survives a stale live run and both merge orders without repricing', async () => {
  const p = profile([run()], { '2026-09-25':500 });
  p.fhRank.events['hcf:four'] = failure('hcf:four','2026-09-26',-173);
  const c = sandbox(p);
  await c.FH_HARDCORE.evaluateAutomatically();
  const old = clone(c.state.fhRank);
  assert.equal(old.events['hcf:four:2026-09-26'],undefined);
  assert.equal(activeEvents(c).find(e => e.id === 'hcf:four').delta,-173);
  const unseen = c.FH_RANK.normalize({installedDay:'2026-09-01',events:{}});
  unseen.events['hcf:four:2026-09-26'] = failure('hcf:four:2026-09-26','2026-09-26',-50,'hardcore_fail_v2');
  for (const [a,b] of [[old,unseen],[unseen,old]]) {
    c.state.fhRank=c.FH_RANK.merge(a,b);
    const failures=activeEvents(c).filter(e=>/^hardcore_fail/.test(e.kind));
    assert.equal(failures.length,1);
    assert.equal(failures[0].delta,-173);
    assert.deepEqual(clone(c.state.fhRank.events['hcf:four']),p.fhRank.events['hcf:four']);
  }
});

test('concurrent new misses share one bounded loss; legacy loss calculation stays unchanged', () => {
  const c = sandbox(profile([]));
  const ledger = c.FH_RANK.normalize(c.state.fhRank);
  for (let i=0;i<5;i++) ledger.events['hcf:r'+i+':2026-09-26'] = failure('hcf:r'+i+':2026-09-26','2026-09-26',-50,'hardcore_fail_v2');
  const f = c.FH_RANK.fold(ledger,'2026-09-27');
  assert.equal(f.days[0].loss, -25, 'one 50 loss with existing placement multiplier');
  assert.equal(f.days[0].events.filter(e => e.counted).length, 1);
  ledger.events['hcf:old'] = failure('hcf:old','2026-09-26');
  assert.equal(c.FH_RANK.fold(ledger,'2026-09-27').days[0].loss, -125);
});

test('manual revival saves rank withdrawal atomically and stale peers cannot recharge it', async () => {
  const c = sandbox(profile([run()], { '2026-09-25':500 }));
  await c.FH_HARDCORE.evaluateAutomatically();
  const stale = clone(c.state.fhRank);
  const exact = JSON.stringify(stale.events['hcf:four:2026-09-26']);
  assert.equal((await c.FH_HARDCORE.revive('four')).ok,true);
  assert.equal(JSON.stringify(c.state.fhRank.events['hcf:four:2026-09-26']),exact, 'original evidence is preserved, not repriced');
  assert.ok(!activeEvents(c).some(e => e.id === 'hcf:four:2026-09-26'));
  const revived = clone(c.state.fhRank);
  for (const [a,b] of [[revived,stale],[stale,revived]]) {
    c.state.fhRank = c.FH_RANK.merge(a,b);
    assert.ok(!activeEvents(c).some(e => e.id === 'hcf:four:2026-09-26'));
  }
  assert.ok(c.saves.at(-1).fhRank.retractions['hcf:four:2026-09-26'].includes('2026-09-26'));
});

test('failed revival rolls back both fields and same-evidence retry succeeds', async () => {
  const c = sandbox(profile([run()], { '2026-09-25':500 }));
  await c.FH_HARDCORE.evaluateAutomatically();
  const before = JSON.stringify(c.state);
  c.saveStateDurable = async () => false;
  assert.equal((await c.FH_HARDCORE.revive('four')).ok,false);
  assert.equal(JSON.stringify(c.state),before);
  c.saveStateDurable = async () => true;
  assert.equal((await c.FH_HARDCORE.revive('four')).ok,true);
  assert.ok(!activeEvents(c).some(e => e.kind === 'hardcore_fail_v2'));
});

test('late incoming proof restores the run and withdraws the exact penalty automatically', async () => {
  const c = sandbox(profile([run()], { '2026-09-25':500 }));
  await c.FH_HARDCORE.evaluateAutomatically();
  c.state.history['2026-09-26'] = 500;
  await c.FH_HARDCORE.evaluateAutomatically();
  assert.equal(c.state.fh12Hardcore.runs.length,1);
  assert.ok(!activeEvents(c).some(e => /^hardcore_fail/.test(e.kind)));
});

test('revival before an unseen legacy penalty arrives still suppresses that episode', async () => {
  const p = profile([]);
  p.fh12Hardcore.history = [run('old',240,{ endedAt:at('2026-09-26T23:59:59-04:00'), missedDay:'2026-09-26' })];
  const c = sandbox(p);
  assert.equal((await c.FH_HARDCORE.revive('old')).ok,true);
  const stale = clone(c.state.fhRank);
  stale.events['hcf:old'] = failure('hcf:old','2026-09-26',-173);
  c.state.fhRank = c.FH_RANK.merge(c.state.fhRank,stale);
  assert.equal(c.state.fhRank.events['hcf:old'].delta,-173);
  assert.ok(!activeEvents(c).some(e => e.id === 'hcf:old'));
});

test('a later genuine failure of a revived run is a separate episode', async () => {
  const c = sandbox(profile([run()], { '2026-09-25':500 }));
  await c.FH_HARDCORE.evaluateAutomatically();
  await c.FH_HARDCORE.revive('four');
  c.advance('2026-09-28T12:00:00-04:00');
  await c.FH_HARDCORE.evaluateAutomatically();
  const failures = activeEvents(c).filter(e => /^hardcore_fail/.test(e.kind));
  assert.equal(failures.length,1);
  assert.equal(failures[0].id,'hcf:four:2026-09-27');
});

test('an explicit end records settled earned work without charging a failure', async () => {
  const c = sandbox(profile([run('four',240,{ rankDailyFromDay:'2026-09-25' })]));
  assert.equal((await c.FH_HARDCORE.end('four')).ok,true);
  assert.equal(c.state.fhRank.events['hcday2:2026-09-26'].delta,40);
  assert.equal(activeEvents(c).filter(e => /^hardcore_fail/.test(e.kind)).length,0);
});

test('receipt merge is commutative and retains fair policy against an older archived peer', async () => {
  const c = sandbox(profile([run()], { '2026-09-25':500 }));
  await c.FH_HARDCORE.evaluateAutomatically();
  const updated = c.FH_HARDCORE.state();
  const old = clone(updated);
  delete old.history[0].rankFailurePolicy;
  delete old.history[0].rankEarnedDays;
  delete old.history[0].rankDailyFromDay;
  const a = c.FH_HARDCORE.merge(updated,old);
  const b = c.FH_HARDCORE.merge(old,updated);
  assert.deepEqual(clone(a),clone(b));
  assert.equal(a.history[0].rankFailurePolicy,2);
  assert.deepEqual(clone(a.history[0].rankEarnedDays),['2026-09-25']);
});

test('rank refresh waits for verified save; refusal rolls back and retry persists', async () => {
  const c = sandbox(profile([run('four',240,{ rankDailyFromDay:'2026-09-25', rankEarnedDays:['2026-09-25'] })]));
  const before = JSON.stringify(c.state.fhRank);
  c.saveStateDurable = async () => false;
  assert.ok((await c.FH_RANK.refresh('test')).error);
  assert.equal(JSON.stringify(c.state.fhRank),before);
  c.saveStateDurable = async () => true;
  assert.equal((await c.FH_RANK.refresh('retry')).changed,true);
});

test('failed saves preserve newer in-place rank edits and peer adoption', async () => {
  for (const action of ['rank','revive']) for (const newer of ['in-place','peer']) {
    const c = sandbox(profile([run()], { '2026-09-25':500 }));
    if (action === 'revive') await c.FH_HARDCORE.evaluateAutomatically();
    let reject;
    c.saveStateDurable = () => new Promise((resolve,r) => { reject=r; });
    const operation = action === 'rank' ? c.FH_RANK.refresh('test') : c.FH_HARDCORE.revive('four');
    assert.equal(typeof reject,'function');
    if (newer === 'peer') c.state = clone(c.state);
    c.state.fhRank.events.newer = { id:'newer', day:'2026-09-27', kind:'quest_hit', delta:8, at:99, label:'Newer work', exempt:false };
    const expected = JSON.stringify(c.state.fhRank);
    reject(new Error('synthetic refusal'));
    await operation;
    assert.equal(JSON.stringify(c.state.fhRank), expected, `${action}/${newer}`);
  }
});

test('earned date receipts survive normalization beyond the old excuse list limit', () => {
  const c = sandbox(profile());
  const dates = Array.from({length:450},(_,n) => c.FH_RANK.__test.addDays('2025-01-01',n));
  c.state.fh12Hardcore.runs[0].rankEarnedDays = dates;
  assert.equal(c.FH_HARDCORE.state().runs[0].rankEarnedDays.length,450);
});

(async () => {
  let failed=0;
  for (const [name,fn] of tests) {
    try { await fn(); console.log('PASS '+name); }
    catch(error) { failed++; console.error('FAIL '+name+'\n'+error.stack); }
  }
  console.log(`${tests.length-failed}/${tests.length} passed`);
  process.exitCode = failed ? 1 : 0;
})();
