/* Source-level regression: pure synthetic report inputs, no browser or network. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const sourcePath = process.argv[2] || new URL('../starmax/fh-sync-doctor-v1.js', import.meta.url);
const source = readFileSync(sourcePath, 'utf8');
const start = source.indexOf('  function verdict(L, C){');
const end = source.indexOf('\n  async function run(){', start);
assert.ok(start >= 0 && end > start, 'Locate the actual shipped verdict function');
const verdict = vm.runInNewContext(source.slice(start, end) + '\nverdict;', { PROBE_TIMEOUT_MS: 8000 });
const local = { hasCode:true, enabled:true, cloudRev:100, minutes:1440, historyDays:3, pending:false, lastError:null };
const cloud = { state:'found', rev:100, minutes:1440, historyDays:3,
  diff:{onlyCloud:[], onlyLocal:[], cloudCount:1} };
const cases = [
  ['matching revision with different focus totals', {}, {minutes:0}],
  ['matching revision with lower device total', {minutes:100}, {}],
  ['matching revision with queued changes', {pending:true}, {}],
  ['matching revision with a budget pause', {lastError:'Catching up: 255 cloud transfers today; paused.'}, {}],
  ['matching revision with an accounting error', {lastError:'Cloud accounting conflict in all-time focus minutes.'}, {}],
  ['cloud payload could not be decrypted', {}, {diff:null, minutes:undefined, historyDays:undefined, blobError:'synthetic decrypt failure'}],
  ['cloud contains no verifiable skills', {}, {diff:null}],
  ['cloud contains no verifiable focus total', {}, {minutes:undefined}],
  ['cloud contains no verifiable history count', {}, {historyDays:undefined}],
  ['matching revision with different history', {}, {historyDays:2}],
  ['unrecognised cloud response', {}, {state:'unknown'}],
  ['pending minutes missing despite matching revision', {pending:true,lastError:'Catching up: paused.'}, {minutes:0}]
];
const failures=[];
for(const [label, localDelta, cloudDelta] of cases){
  const result=verdict({...local,...localDelta},{...cloud,...cloudDelta});
  const pass=result[0]!=='ok' && !/^IN STEP/i.test(result[1]);
  console.log(`${pass?'PASS':'FAIL'} ${label}: ${result[1]}`);
  if(!pass)failures.push(label);
}
assert.equal(verdict(local,cloud)[0],'ok','A verified match with no outstanding status is allowed');
assert.equal(verdict({...local,enabled:false},cloud)[0],'warn');
assert.equal(verdict({...local,hasCode:false},cloud)[0],'bad');
assert.equal(verdict(local,{...cloud,state:'http',status:403})[0],'bad');
assert.equal(verdict(local,{...cloud,rev:101})[0],'warn');
assert.equal(verdict(local,{...cloud,rev:99})[0],'bad');
assert.equal(verdict(local,{...cloud,diff:{onlyCloud:['Synthetic skill'],onlyLocal:[]}})[0],'bad');
assert.equal(verdict(local,{...cloud,diff:{onlyCloud:[],onlyLocal:['Synthetic skill']}})[0],'warn');
assert.deepEqual(failures,[],`${failures.length} false-success diagnostic verdicts`);
console.log('20 synthetic verdict checks passed.');
