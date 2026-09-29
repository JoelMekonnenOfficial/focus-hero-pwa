import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';
const html=readFileSync(new URL('../starmax/index.html',import.meta.url),'utf8');
const old=execFileSync('git',['show','d9d8d6c0:starmax/index.html'],{cwd:new URL('../',import.meta.url),encoding:'utf8',maxBuffer:10000000});
function cryptoSource(src){return src.slice(src.indexOf('function b64(bytes){'),src.indexOf('function renderSecurityPanel(){'));}
function engine(src){const c={crypto:webcrypto,TextEncoder,TextDecoder,Blob,Response,CompressionStream,DecompressionStream,Uint8Array,atob,btoa,console,
 PBKDF2_ITERATIONS:100000,AES_KEY_LENGTH:256,SALT_BYTES:16,IV_BYTES:12,state:{settings:{e2eEncryption:true},sync:{}},
 syncControlError:(code,message)=>Object.assign(new Error(message),{code})};vm.createContext(c);vm.runInContext(cryptoSource(src),c);return c;}
const current=engine(html),legacy=engine(old),clone=x=>JSON.parse(JSON.stringify(x));
const sync={syncCode:'SYNTHETIC-CODE',syncSecret:'SYNTHETIC-NON-CREDENTIAL',playerId:'synthetic-protocol-profile',cloudRev:6,saltB64:'MDEyMzQ1Njc4OWFiY2RlZg==',userToken:'synthetic-token',refreshToken:'synthetic-refresh'};
const profile={dataVersion:16,totalFocusMin:7,tasks:[],history:{},hero:{level:1},settings:{e2eEncryption:true},sync:clone(sync),notes:'synthetic '.repeat(600)};
current.state.sync=clone(sync);legacy.state.sync=clone(sync);
let count=0;const pass=label=>{count++;console.log('PASS',label);};
async function refuses(label,fn,code){await assert.rejects(fn,code?e=>e.code===code:undefined);pass(label);}
const blob=await current.encryptStateBlob(profile),v1=await legacy.encryptStateBlob(profile),before=JSON.stringify(profile);
assert.equal(blob.e2e.v,2);assert.equal(blob.e2e.z,'gzip');assert.equal(blob.e2e.salt,sync.saltB64);assert.equal(blob.e2e.revision,7);pass('versioned encrypted writer preserves salt and binds next revision');
const round=await current.decryptStateBlob(blob,clone(sync),{requireEncrypted:true,cloudRev:7});
assert.equal(round.totalFocusMin,7);assert.equal(round.sync.userToken,undefined);assert.equal(round.sync.refreshToken,undefined);assert.equal(round.sync.syncSecret,undefined);assert.equal(JSON.stringify(profile),before);pass('real AES-GCM round trip strips device credentials and preserves source bytes');
await refuses('legacy AES-GCM reader fails before profile parsing',()=>legacy.decryptStateBlob(blob));
assert.equal((await current.decryptStateBlob(v1,clone(sync))).totalFocusMin,7);pass('legacy encrypted payload remains readable before protocol upgrade');
for(const [name,edit,code] of [
 ['version rollback',e=>e.v=1,'FH_SYNC_AUTHENTICATION_FAILED'],['future version',e=>e.v=3,'FH_SYNC_UPDATE_REQUIRED'],
 ['algorithm',e=>e.alg='AES-CBC','FH_SYNC_INVALID_ENVELOPE'],['KDF',e=>e.kdf='PBKDF2-SHA1','FH_SYNC_INVALID_ENVELOPE'],
 ['iterations',e=>e.iter=1,'FH_SYNC_INVALID_ENVELOPE'],['profile',e=>e.profile='different-profile','FH_SYNC_INVALID_ENVELOPE'],
 ['revision',e=>e.revision=8,'FH_SYNC_INVALID_ENVELOPE'],['encoding removal',e=>delete e.z,'FH_SYNC_AUTHENTICATION_FAILED'],
 ['unknown encoding',e=>e.z='br','FH_SYNC_INVALID_ENVELOPE'],['salt',e=>e.salt=btoa('abcdefghijklmnop'),'FH_SYNC_AUTHENTICATION_FAILED'],
 ['IV',e=>e.iv=btoa('abcdefghijkl'),'FH_SYNC_AUTHENTICATION_FAILED'],['ciphertext',e=>{const bytes=new Uint8Array(current.unb64(e.ct));bytes[0]^=1;e.ct=current.b64(bytes);},'FH_SYNC_AUTHENTICATION_FAILED'],
 ['truncated ciphertext',e=>e.ct=btoa('bad'),'FH_SYNC_INVALID_ENVELOPE'],['malformed base64',e=>e.iv='!not-base64','FH_SYNC_INVALID_ENVELOPE'],
 ['short salt',e=>e.salt=btoa('short'),'FH_SYNC_INVALID_ENVELOPE'],['noninteger revision',e=>e.revision=7.1,'FH_SYNC_INVALID_ENVELOPE']
 ]){const bad=clone(blob);edit(bad.e2e);await refuses('refuses tampered '+name,()=>current.decryptStateBlob(bad,clone(sync),{cloudRev:7}),code);}
for(const value of [null,[],3,{e2e:[]},{...blob,plain:profile},{...blob,lifexp:{v:2}}])await refuses('malformed/ambiguous envelope fails closed',()=>current.decryptStateBlob(value));
for(const value of [profile,{plain:profile},JSON.stringify({plain:profile}),{lifexp:{v:2,format:'plain',state:profile}}])await refuses('required encryption refuses plaintext shape',()=>current.decryptStateBlob(value,clone(sync)), 'FH_SYNC_ENCRYPTION_REQUIRED');
current.state.settings.e2eEncryption=false;
for(const value of [profile,{plain:profile},JSON.stringify({plain:profile})]){assert.equal((await current.decryptStateBlob(value,clone(sync))).totalFocusMin,7);pass('explicit local encryption-off can read legacy plaintext');}
const off=clone(profile);off.settings.e2eEncryption=false;const plain=await current.encryptStateBlob(off);
assert.equal(plain.plain,undefined);assert.equal(plain.e2e,undefined);assert.equal(plain.lifexp.v,2);assert.equal((await current.decryptStateBlob(plain,clone(sync))).totalFocusMin,7);
assert.equal(legacy.isRecognizableCloudState(await legacy.decryptStateBlob(plain)),false);pass('explicit-off versioned plaintext is unreadable to legacy profile recognizer');
const pinned=clone(sync);current.noteCloudProtocol(pinned,2);assert.equal(pinned.cloudProtocolVersion,2);current.noteCloudProtocol(pinned,1);assert.equal(pinned.cloudProtocolVersion,2);pass('protocol pin is monotonic for one identity');
await refuses('pinned profile rejects encrypted v1 downgrade even with newer row revision',()=>current.decryptStateBlob(v1,pinned,{cloudRev:100}), 'FH_SYNC_UPDATE_REQUIRED');
await refuses('pinned profile rejects legacy plaintext downgrade',()=>current.decryptStateBlob({plain:profile},pinned), 'FH_SYNC_UPDATE_REQUIRED');
assert.equal((await current.decryptStateBlob(plain,pinned)).totalFocusMin,7);pass('explicit plaintext opt-out retains versioned compatibility barrier');
const other={...sync,cloudProtocolVersion:2,cloudProtocolIdentity:'different-profile'};assert.equal((await current.decryptStateBlob(v1,other)).totalFocusMin,7);pass('protocol pin never guessed across a different sync identity');
const futurePlain={...sync,cloudProtocolIdentity:sync.playerId,cloudProtocolVersion:3};
await refuses('plaintext v2 cannot bypass known future protocol minimum',()=>current.decryptStateBlob(plain,futurePlain),'FH_SYNC_UPDATE_REQUIRED');
await refuses('direct decrypt rejects malformed plaintext profile',()=>current.decryptStateBlob({lifexp:{v:2,format:'plain',state:{totalFocusMin:7}}},sync),'FH_SYNC_INVALID_ENVELOPE');
current.state.settings.e2eEncryption=true;
await refuses('row revision swap rejected',()=>current.decryptStateBlob(blob,sync,{cloudRev:9}),'FH_SYNC_INVALID_ENVELOPE');
const wrong={...sync,syncSecret:'SYNTHETIC-WRONG'};await refuses('wrong key rejected without plaintext fallback',()=>current.decryptStateBlob(blob,wrong),'FH_SYNC_AUTHENTICATION_FAILED');
const future={...sync,cloudProtocolIdentity:sync.playerId,cloudProtocolVersion:3};await refuses('older writer cannot downgrade known future protocol',()=>current.encryptStateBlob({...profile,sync:future}),'FH_SYNC_UPDATE_REQUIRED');
current.fhStreamsAvailable=()=>false;const raw=await current.encryptStateBlob(profile);assert.equal(raw.e2e.z,undefined);assert.equal((await current.decryptStateBlob(raw,sync)).totalFocusMin,7);pass('uncompressed fallback uses same authenticated boundary');
const toggleSource=html.slice(html.indexOf('  const togE = $("#tog-e2e");'),html.indexOf('  $("#btn-gen-code").onclick',html.indexOf('  const togE = $("#tog-e2e");')));
for(const mode of ['unchanged','state-replaced','settings-replaced','same-object-activity','cancel']){
 const owner={settings:{e2eEncryption:true},totalFocusMin:7};let handler,saveCalls=0;
 const c={state:owner,JSON,confirm:()=>mode!=='cancel',$:()=>({addEventListener:(_,fn)=>handler=fn}),readToggle:()=>true,setToggle(){},toast(){},renderSecurityPanel(){},
  saveStateDurable:async()=>{saveCalls++;if(mode==='state-replaced')c.state={settings:{e2eEncryption:false},totalFocusMin:99};if(mode==='settings-replaced')c.state.settings={e2eEncryption:false,newer:true};if(mode==='same-object-activity')c.state.totalFocusMin=99;throw new Error('synthetic save refusal');}};
 vm.createContext(c);vm.runInContext(toggleSource,c);await handler();
 if(mode==='cancel'){assert.equal(saveCalls,0);assert.equal(c.state.settings.e2eEncryption,true);}
 else if(mode==='unchanged')assert.equal(c.state.settings.e2eEncryption,true);
 else{assert.equal(c.state.settings.e2eEncryption,false);if(mode!=='settings-replaced')assert.equal(c.state.totalFocusMin,99);else assert.equal(c.state.settings.newer,true);}
 pass('encryption setting failure ownership: '+mode);
}
console.log(`${count} exact-source encryption/protocol checks passed.`);
