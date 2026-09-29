import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const read = name => readFileSync(new URL('../starmax/' + name, import.meta.url));
const html = read('index.html');
assert.ok(html.equals(read('focus-hero.html')), 'HTML entry points must remain byte-identical');
const text = html.toString('utf8');
const manifest = JSON.parse(read('manifest.webmanifest'));
const version = /data-app-version="([^"]+)"/.exec(text)?.[1];
const build = /data-build-id="([^"]+)"/.exec(text)?.[1];
const workerBuild = /const BUILD_ID\s*=\s*["']([^"']+)/.exec(read('sw.js').toString('utf8'))?.[1];
assert.ok(version && build && workerBuild, 'App and worker identify their builds');
assert.equal(build, workerBuild, 'Page and service worker identify the same release');
assert.equal(manifest.version, version, 'Manifest cannot silently drift from the app version');
assert.equal(/<meta name="focus-hero-version" content="([^"]+)"/.exec(text)?.[1], version, 'Legacy version metadata agrees');
assert.equal(/<meta name="focus-hero-build" content="([^"]+)"/.exec(text)?.[1], build, 'Legacy build metadata agrees');
assert.ok(text.includes('<title>Life XP · v' + version + '</title>'), 'Initial page title agrees with the release');
assert.equal(manifest.start_url, './');
for (const shortcut of manifest.shortcuts) assert.ok(shortcut.url.startsWith('./?'), 'Shortcuts must use the current root entry point');
console.log('PASS mirror, page/worker/manifest release identifiers, and shortcut URLs');
const worker=read('sw.js').toString('utf8');
const hashes=JSON.parse(/const MODULE_INTEGRITY = (\{[\s\S]*?\});/.exec(worker)[1]);
const names=readdirSync(new URL('../starmax/',import.meta.url)).sort();
for(const name of names.filter(name=>name.endsWith('.js')&&name!=='sw.js')){
  assert.equal(hashes[name],'sha384-'+createHash('sha384').update(read(name)).digest('base64'),name+' requires resealing');
}
for(const match of text.matchAll(/<script\b[^>]*src="([^"?#]+\.js)"[^>]*>/g)){
  assert.equal(/integrity="([^"]+)"/.exec(match[0])?.[1],hashes[match[1].replace(/^\.\//,'')],match[1]+' is sealed');
  assert.ok(match[0].includes('crossorigin="anonymous"'));
}
assert.equal(/guardScript.integrity = "([^"]+)"/.exec(text)?.[1],hashes['data-guard.js']);
const requiredRuntime=JSON.parse(/const FH_REQUIRED_RUNTIME_SCRIPTS = new Set\((\[[\s\S]*?\])\);/.exec(text)[1]);
const referencedRuntime=Array.from(text.matchAll(/<script\b[^>]*src="([^"?#]+\.js)"[^>]*>/g),match=>match[1].replace(/^\.\//,''));
referencedRuntime.push(/guardScript.src = "\.\/([^"]+)"/.exec(text)[1]);
assert.deepEqual([...requiredRuntime].sort(),[...referencedRuntime].sort(),'Fatal boot gate must cover every sealed runtime script, including the dynamic guard');
const bundle=createHash('sha256');
for(const name of names.filter(name=>name!=='sw.js'))bundle.update(name+'\0').update(read(name));
assert.equal(/const BUNDLE_HASH = "([^"]+)"/.exec(worker)?.[1],bundle.digest('hex'),'Bundle changed: run node tools/seal-assets.mjs');
assert.ok(/CACHE_NAME\s*=.*BUNDLE_HASH/.test(worker),'Changed bytes require an isolated cache namespace');
for(const name of ['sw.js','reset-sw.html'])assert.ok(!/caches\.delete\s*\(|\.unregister\s*\(/.test(read(name).toString()),name+' preserves existing caches and registrations');
console.log('PASS module integrity, immutable bundle namespace, non-destructive update sources');
