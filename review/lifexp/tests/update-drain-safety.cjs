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
const readinessStart=html.indexOf('window.__FH_PROFILE_OPEN_STARTED__ = false;');
const readinessEnd=html.indexOf('function fhShowIncompleteUpdate(){',readinessStart);
assert(readinessStart>=0&&readinessEnd>readinessStart);
function readinessFixture(){
  const item=fixture();item.c.document.getElementById=()=>null;
  vm.runInContext(html.slice(readinessStart,readinessEnd),item.c);
  item.ask=()=>{const answers=[];const pending=item.callbacks.message({data:{type:'FH_UPDATE_PREPARE',protocol:1},ports:[{postMessage(answer){answers.push(answer);}}]});return {answers,pending};};
  return item;
}

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
  const gate=readinessFixture();
  await gate.ask().pending;
  assert.equal((await (async()=>{const a=gate.ask();await a.pending;return a.answers[0];})()).ready,false);
  gate.c.document.getElementById=id=>id==='fh-asset-update-blocked'?{}:null;
  let answer=gate.ask();await answer.pending;assert.equal(answer.answers[0].ready,true);
  gate.c.__FH_PROFILE_OPEN_STARTED__=true;answer=gate.ask();await answer.pending;assert.equal(answer.answers[0].ready,false);
  console.log('PASS only a blocked gate that has never begun opening a profile acknowledges readiness');

  const ready=readinessFixture();ready.c.__FH_PRIMARY_READY__=true;
  const pending=ready.ask();await nextTurn();assert.equal(pending.answers.length,0);
  const queued=deferred();ready.c.primarySaveTail=queued.promise;ready.first.resolve();await nextTurn();assert.equal(pending.answers.length,0);
  queued.resolve();await pending.pending;assert.equal(pending.answers[0].ready,true);
  console.log('PASS readiness waits for current and newly queued durable saves');

  const refused=readinessFixture();refused.c.__FH_PRIMARY_READY__=true;
  const awaiting=refused.ask();await nextTurn();refused.c.saveState._lastPrimarySave={ok:false};refused.first.resolve();await awaiting.pending;assert.equal(awaiting.answers[0].ready,false);
  console.log('PASS a failed save cannot acknowledge safe activation');
  console.log('6/6 passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
