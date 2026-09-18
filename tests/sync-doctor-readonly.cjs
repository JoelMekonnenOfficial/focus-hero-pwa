/* Synthetic doctor integration tests: no network, storage, or real identity. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(process.argv[2] || path.join(__dirname, '../starmax/fh-sync-doctor-v1.js'), 'utf8');
const clone = x => JSON.parse(JSON.stringify(x));

function fixture() {
  const output = { innerHTML:'' };
  const local = { totalFocusMin:120, tasks:[{id:'test',name:'Synthetic task'}], history:{'2026-09-17':120},
    sync:{ enabled:true, playerId:'synthetic-identity', syncCode:'synthetic-code', syncSecret:'synthetic-secret',
      userToken:'synthetic-token', tokenExpiresAt:Date.now()+3600000, cloudRev:12, pendingSync:false } };
  const remote = { totalFocusMin:120, tasks:clone(local.tasks), history:clone(local.history) };
  const c = { state:local, document:{ readyState:'loading', addEventListener(){},
      documentElement:{getAttribute:()=> 'synthetic-build'},
      getElementById:id => id === 'fh-doctor-out' ? output : {} },
    setTimeout:()=>1, clearTimeout(){}, __fhReconcile:{}, calls:[],
    supabaseTokenIsFresh:sy => sy.userToken && sy.tokenExpiresAt > Date.now()+60000,
    async supabaseRequest(route, opts) {
      c.calls.push({route,opts});
      assert.equal(opts.method,'GET');
      assert.equal(opts.authReadOnly,true);
      assert.equal(opts.persistAuth,false);
      assert.notEqual(opts.syncContext,c.state.sync);
      return {ok:true,status:200,json:async()=>[{cloud_rev:12,data:remote}]};
    },
    async decryptStateBlob(data, sync) {
      assert.notEqual(sync,c.state.sync);
      sync.userToken = 'synthetic-local-helper-change';
      return data;
    }
  };
  c.window=c;
  vm.createContext(c);
  vm.runInContext(source,c);
  return c;
}

(async()=>{
  let c = fixture();
  const before = JSON.stringify(c.state);
  const result = await c.FH_SYNC_DOCTOR.run();
  assert.equal(result.cloud.state,'found');
  assert.equal(c.calls.length,1);
  assert.equal(JSON.stringify(c.state),before,'diagnostic helpers cannot modify the live profile');
  assert.match(result.verdict,/checked focus total/i);
  assert.ok(!JSON.stringify(result).includes('synthetic-secret'),'report excludes credentials');
  console.log('PASS existing-auth read uses a detached context and preserves profile/identity');

  c=fixture();
  c.state.sync.tokenExpiresAt=1;
  const expired=await c.FH_SYNC_DOCTOR.run();
  assert.equal(expired.cloud.state,'auth-required');
  assert.equal(c.calls.length,0);
  assert.match(expired.verdict,/did not renew credentials/i);
  console.log('PASS expired auth is reported without a cloud or auth request');

  c=fixture();
  c.supabaseRequest=async()=>({ok:false,status:401});
  const denied=await c.FH_SYNC_DOCTOR.run();
  assert.equal(denied.cloud.state,'http');
  assert.match(denied.verdict,/did not change credentials/i);
  console.log('PASS an auth rejection is reported without a false secret-mismatch diagnosis');

  c=fixture();
  const request=c.supabaseRequest;
  c.supabaseRequest=async(...args)=>{
    const response=await request(...args);
    c.state.totalFocusMin=240;
    c.state.history['2026-09-17']=240;
    return response;
  };
  const fresh=await c.FH_SYNC_DOCTOR.run();
  assert.equal(fresh.local.minutes,240);
  assert.match(fresh.verdict,/FOCUS TOTALS DIFFER/);
  console.log('PASS post-probe counts and verdict use the fresh local state');

  c=fixture();
  const identityRequest=c.supabaseRequest;
  c.supabaseRequest=async(...args)=>{
    const response=await identityRequest(...args);
    c.state.sync.playerId='different-synthetic-identity';
    return response;
  };
  const changed=await c.FH_SYNC_DOCTOR.run();
  assert.equal(changed.cloud.state,'identity-changed');
  assert.match(changed.verdict,/identity changed/i);
  console.log('PASS identity changes during a probe invalidate its comparison');
  console.log('5/5 diagnostic integration checks passed');
})();
