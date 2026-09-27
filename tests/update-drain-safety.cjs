/* Exact update functions, synthetic promises/state only. No browser or storage.
 * node tests/update-drain-safety.cjs [path/to/starmax]
 */
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const directory = path.resolve(process.argv[2] || path.join(__dirname, '../starmax'));
const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
const start = html.indexOf('function fhUpdateHasUnfinishedWork(){');
const end = html.indexOf('function maybeWarnAboutFileMode(){', start);
assert(start >= 0 && end > start, 'Exact application update functions must be present');
const source = html.slice(start, end);

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
function fixture() {
  const callbacks = {}, first = deferred(), report = { reloads:0, networkChecks:0 };
  const c = {
    accountingStorageIndeterminate:false, hasUnfinishedDeviceRun() { return false; },
    state:{ timer:{} }, saveTimer:null, statePersistenceBarrierDepth:0,
    primaryTabBlocked:false, syncIdentityOperation:null,
    saveState:{ _lastPrimarySave:{ ok:true } }, primarySaveTail:first.promise,
    toast() {}, fhHardReloadFresh() { report.reloads++; }, fhBuildCompare() { return 0; },
    document:{ documentElement:{ getAttribute() { return 'synthetic-page'; } }, readyState:'loading' },
    navigator:{ serviceWorker:{
      addEventListener(kind, callback) { callbacks[kind] = callback; },
      async getRegistration() { return { async update() { report.networkChecks++; } }; }
    } },
    location:{ protocol:'https:', reload() { report.reloads++; } },
    addEventListener() {}, setTimeout() {}
  };
  c.window = c;
  vm.createContext(c);
  vm.runInContext(source, c);
  c.registerSW();
  return { c, callbacks, first, report };
}
const nextTurn = () => new Promise(resolve => setImmediate(resolve));

(async () => {
  const current = fixture();
  current.callbacks.controllerchange();
  await nextTurn();
  assert.equal(current.report.reloads, 0, 'Do not interrupt the current save');
  const later = deferred();
  current.c.primarySaveTail = later.promise;
  current.first.resolve();
  await nextTurn();
  assert.equal(current.report.reloads, 0, 'A newer queued save must drain too');
  later.resolve();
  await nextTurn();
  assert.equal(current.report.reloads, 1);
  assert.equal(current.report.networkChecks, 0, 'An installed update can finish offline');
  console.log('PASS automatic refresh waits for current and newly queued saves');

  const failed = fixture();
  failed.callbacks.controllerchange();
  await nextTurn();
  failed.c.primaryTabBlocked = true;
  failed.c.saveState._lastPrimarySave = { ok:false };
  failed.first.resolve();
  await nextTurn();
  assert.equal(failed.report.reloads, 0, 'A resolved catch-tail is not a verified save');
  console.log('PASS swallowed-tail save failure prevents automatic refresh');

  const busy = fixture();
  busy.c.statePersistenceBarrierDepth = 1;
  assert.equal(await busy.c.fhForceUpdateNow(), false);
  busy.c.statePersistenceBarrierDepth = 0;
  busy.c.syncIdentityOperation = { synthetic:true };
  assert.equal(await busy.c.fhForceUpdateNow(), false);
  assert.equal(busy.report.reloads, 0);
  assert.equal(busy.report.networkChecks, 0);
  console.log('PASS accounting and identity operations prevent manual refresh');
  console.log('3/3 passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
