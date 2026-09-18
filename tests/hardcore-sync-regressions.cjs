/* Synthetic, network-free regression tests. No browser profile or storage.
 * Usage: node tests/hardcore-sync-regressions.cjs [path/to/fh-hardcore-v12.js]
 * An alternate source path makes the same assertions runnable on the baseline.
 */
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
process.env.TZ = 'America/Toronto';

const sourcePath = path.resolve(process.argv[2] || path.join(__dirname, '../starmax/fh-hardcore-v12.js'));
const source = fs.readFileSync(sourcePath, 'utf8');
const html = fs.readFileSync(path.join(path.dirname(sourcePath), 'index.html'), 'utf8');
const windowSource = html.slice(html.indexOf('function lateStartMap(){'), html.indexOf('function lateStartInfoFor(day){'));
assert.ok(windowSource.includes('function dayWindowFor(day)'), 'test loads the actual application day-window functions');
const clone = value => JSON.parse(JSON.stringify(value));
const at = value => new Date(value).getTime();
const NOW = at('2026-09-18T00:01:00-04:00');

function sandbox(initial, now = NOW) {
  class TestDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const timers = [];
  const c = {
    state: clone(initial), Date: TestDate, console: { warn() {} },
    document: { readyState: 'loading' }, navigator: {},
    setTimeout(fn, delay) { timers.push(delay); return timers.length; }, clearTimeout() {},
    saves: 0, async saveStateDurable() { c.saves++; return true; },
    FH_onPrimaryReady() {}, addEventListener() {},
    todayKey(d = new TestDate()) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
  };
  c.window = c;
  vm.createContext(c);
  vm.runInContext(windowSource, c);
  vm.runInContext(source, c);
  c.timers = timers;
  return c;
}

function run(id, minutes) {
  return { id, startedAt: at('2026-09-17T00:00:00-04:00'), startDay: '2026-09-17',
    requirement: { type: 'minutes', value: minutes }, daysSurvived: 0,
    lastCheckedDay: '2026-09-17', lastCheckedAt: 1, pauses: [], excusedDays: [] };
}
function profile(runs, minutes) {
  return { tasks: [], lateStarts: {}, history: { '2026-09-17': minutes }, sessionsLog: [],
    sync: { enabled: true, pendingSync: false },
    fh12Hardcore: { version: 2, runs, history: [], active: runs.length > 0, run: runs[0] || null } };
}
async function archiveAndScan(c) {
  await c.FH_HARDCORE.evaluateAutomatically();
  // Settle migration and the first unsuccessful scan before new evidence arrives.
  for (let i = 0; i < 3; i++) {
    c.state.fh12Hardcore = c.FH_HARDCORE.state();
    await c.FH_HARDCORE.evaluateAutomatically();
  }
}

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('manual revival survives a stale archive in either merge order', async () => {
  const c = sandbox(profile([run('four', 240)], 0));
  await c.FH_HARDCORE.evaluateAutomatically();
  const archive = c.FH_HARDCORE.state();
  // A same-day/future-clock end must also be superseded strictly, not tied.
  archive.history[0].endedAt = NOW + 2 * 86400000;
  const original = JSON.stringify(archive);
  const plan = c.FH_HARDCORE.__revivePlan(archive, 'four', '2026-09-18');
  assert.equal(plan.ok, true);
  assert.ok(plan.run.reinstatedAt > archive.history[0].endedAt);
  assert.equal(JSON.stringify(archive), original, 'pure plan does not mutate its input');
  for (const [left, right] of [[plan.next, archive], [archive, plan.next]]) {
    const merged = c.FH_HARDCORE.merge(left, right);
    assert.equal(merged.runs.length, 1);
    assert.equal(merged.runs[0].id, 'four');
    assert.ok(merged.runs[0].excusedDays.includes('2026-09-17'));
    assert.equal(merged.history.length, 0);
  }
});

test('unrepresentable revival timestamp is refused without modifying the archive', async () => {
  const c = sandbox(profile([run('four', 240)], 0));
  await c.FH_HARDCORE.evaluateAutomatically();
  const archive = c.FH_HARDCORE.state();
  archive.history[0].endedAt = Number.MAX_SAFE_INTEGER;
  const before = JSON.stringify(archive);
  const plan = c.FH_HARDCORE.__revivePlan(archive, 'four', '2026-09-18');
  assert.equal(plan.ok, false);
  assert.equal(JSON.stringify(archive), before);
});

test('new minutes restore an archived run automatically alongside a live sibling', async () => {
  const c = sandbox(profile([run('one', 60), run('four', 240)], 120));
  await archiveAndScan(c);
  assert.equal(c.state.fh12Hardcore.runs.length, 1);
  const saves = c.saves;
  await c.FH_HARDCORE.evaluateAutomatically();
  assert.equal(c.saves, saves, 'unchanged evidence causes no durable write');
  c.state.history['2026-09-17'] = 500;
  await c.FH_HARDCORE.evaluateAutomatically();
  assert.equal(c.state.fh12Hardcore.runs.length, 2);
  assert.equal(c.state.fh12Hardcore.history.length, 0);
  assert.equal(c.state.history['2026-09-17'], 500, 'audit does not alter earned minutes');
});

test('corrected session timestamps invalidate a failed window audit without changing totals', async () => {
  const now = at('2026-09-18T14:00:00-04:00');
  const initial = profile([run('one', 60), run('four', 240)], 300);
  initial.lateStarts['2026-09-17'] = { startMin: 720, declaredAt: at('2026-09-17T12:00:00-04:00') };
  initial.sessionsLog = [
    { id: 'a', type: 'focus', minutes: 120, at: at('2026-09-17T13:00:00-04:00') },
    { id: 'b', type: 'focus', minutes: 180, at: at('2026-09-17T10:00:00-04:00') }
  ];
  const c = sandbox(initial, now);
  await archiveAndScan(c);
  assert.equal(c.state.fh12Hardcore.runs.length, 1);
  c.state.sessionsLog[1].at = at('2026-09-17T14:00:00-04:00');
  await c.FH_HARDCORE.evaluateAutomatically();
  assert.equal(c.state.fh12Hardcore.runs.length, 2);
  assert.equal(c.state.history['2026-09-17'], 300);
});

test('after midnight the scheduled deadline belongs to the active late-start day', async () => {
  const initial = profile([run('four', 240), run('eight', 480)], 180);
  initial.lateStarts['2026-09-17'] = { startMin: 720, declaredAt: at('2026-09-17T12:00:00-04:00') };
  const c = sandbox(initial);
  await c.FH_HARDCORE.evaluateAutomatically();
  assert.equal(c.FH_HARDCORE.activeDay(), '2026-09-17');
  assert.equal(c.state.fh12Hardcore.runs.length, 2, 'midnight is not the late-start deadline');
  assert.equal(c.timers.at(-1), at('2026-09-18T12:00:02-04:00') - NOW);
});

test('ordinary days retain their midnight deadline', async () => {
  const c = sandbox(profile([run('four', 240)], 300));
  await c.FH_HARDCORE.evaluateAutomatically();
  assert.equal(c.timers.at(-1), at('2026-09-19T00:00:02-04:00') - NOW);
});

test('an explicit end beats a stale manually revived peer, including clock skew', async () => {
  for (const endStamp of [NOW - 1000, NOW + 2 * 86400000]) {
    const c = sandbox(profile([run('four', 240)], 0));
    await c.FH_HARDCORE.evaluateAutomatically();
    const archive = c.FH_HARDCORE.state();
    archive.history[0].endedAt = endStamp;
    const plan = c.FH_HARDCORE.__revivePlan(archive, 'four', '2026-09-18');
    assert.equal(plan.ok, true);
    c.state.fh12Hardcore = clone(plan.next);
    const staleRevived = c.FH_HARDCORE.state();
    const result = await c.FH_HARDCORE.end('four');
    assert.equal(result.ok, true);
    const ended = c.FH_HARDCORE.state();
    assert.ok(ended.history[0].endedAt >= staleRevived.runs[0].reinstatedAt);
    for (const [left, right] of [[ended, staleRevived], [staleRevived, ended]]) {
      const merged = c.FH_HARDCORE.merge(left, right);
      assert.equal(merged.runs.length, 0);
      assert.equal(merged.history.length, 1);
      assert.equal(merged.history[0].missedDay, null);
    }
    c.state.history['2026-09-17'] = 500;
    await c.FH_HARDCORE.evaluateAutomatically();
    assert.equal(c.state.fh12Hardcore.runs.length, 0, 'an explicit end is never healed automatically');
  }
});

test('automatic restoration supersedes a future archived end but a later explicit end still wins', async () => {
  const c = sandbox(profile([run('four', 240)], 0));
  await c.FH_HARDCORE.evaluateAutomatically();
  const archived = c.FH_HARDCORE.state();
  archived.history[0].endedAt = NOW + 2 * 86400000;
  c.state.fh12Hardcore = clone(archived);
  c.state.history['2026-09-17'] = 500;
  await c.FH_HARDCORE.evaluateAutomatically();
  const restored = c.FH_HARDCORE.state();
  assert.equal(restored.runs.length, 1);
  assert.ok(restored.runs[0].reinstatedAt > archived.history[0].endedAt);
  assert.equal(c.FH_HARDCORE.merge(restored, archived).runs.length, 1);
  assert.equal((await c.FH_HARDCORE.end('four')).ok, true);
  assert.equal(c.FH_HARDCORE.merge(c.FH_HARDCORE.state(), restored).runs.length, 0);
});

test('failed durable restoration retries automatically with unchanged evidence', async () => {
  const c = sandbox(profile([run('one', 60), run('four', 240)], 120));
  await archiveAndScan(c);
  c.state.history['2026-09-17'] = 500;
  const persist = c.saveStateDurable;
  c.saveStateDurable = async () => false;
  const failed = await c.FH_HARDCORE.evaluateAutomatically();
  assert.equal(failed.ok, false);
  assert.equal(c.state.fh12Hardcore.runs.length, 1, 'failed save rolls back the restoration');
  c.saveStateDurable = persist;
  const retried = await c.FH_HARDCORE.evaluateAutomatically();
  assert.equal(retried.ok, true);
  assert.equal(c.state.fh12Hardcore.runs.length, 2, 'identical evidence is retried');
  assert.equal(c.state.fh12Hardcore.history.length, 0);
});

(async () => {
  let failures = 0;
  for (const [name, fn] of tests) {
    try { await fn(); console.log(`PASS ${name}`); }
    catch (error) { failures++; console.error(`FAIL ${name}: ${error.message}`); }
  }
  console.log(`${tests.length - failures}/${tests.length} passed`);
  process.exitCode = failures ? 1 : 0;
})();
