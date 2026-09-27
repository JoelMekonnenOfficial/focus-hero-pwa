/* Historical probe retained as a regression for the now-closed plaintext downgrade. No network, browser, storage or credentials.
 * node tests/cloud-plaintext-policy-probe.cjs [path/to/starmax]
 * This name intentionally is not discovered as a safety regression suite.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const directory = path.resolve(process.argv[2] || path.join(__dirname, '../starmax'));
const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
const start = html.indexOf('function parseSerializedCloudValue(');
const end = html.indexOf('function renderSecurityPanel(', start);
assert(start >= 0 && end > start, 'exact cloud parser/decrypt source must exist');
const context = vm.createContext({state:{settings:{e2eEncryption:true},sync:{}},syncControlError:(code,message)=>Object.assign(new Error(message),{code})});
vm.runInContext(html.slice(start,end), context);
const synthetic = {dataVersion:16,totalFocusMin:1,history:{},tasks:[],hero:{},settings:{e2eEncryption:true}};
(async()=>{
  for (const payload of [synthetic,{plain:synthetic},JSON.stringify({plain:synthetic})]) {
    assert.equal(context.state.settings.e2eEncryption,true);
    await assert.rejects(context.decryptStateBlob(payload),error=>error.code==='FH_SYNC_ENCRYPTION_REQUIRED');
  }
  console.log('PASS plaintext refused with local encryption enabled (3 exact-source cases).');
  console.log('Conditional risk requires cloud-row write authority; backend access was not exercised or established.');
})().catch(error=>{console.error(error);process.exitCode=1;});
