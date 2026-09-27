/* Disposable browser contexts, synthetic cloud routes, loopback source only.
 * No production profile, credential, or deploy access is needed by this runner.
 */
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, readdir } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url));
const assets = resolve(root, 'starmax');
const logs = resolve(root, 'test-results');
const run = promisify(execFile);
const browserSuites = [
  'boot', 'core', 'sync', 'themes', 'audio', 'stability', 'panels', 'audit',
  'scenes', 'scroll', 'hardcore', 'devices', 'budget', 'skillremoval',
  'hourremoval', 'mergereduce', 'guardreduce', 'runmode', 'animpause', 'heroxp',
  'latestart', 'runmodehistory', 'conflictresolve', 'quietalarms', 'forceupdate',
  'adoption-presentation', 'contrast-themes', 'gearworld',
  'clock-session-controls', 'clock-save-races'
];
const mime = { '.html':'text/html', '.js':'application/javascript', '.json':'application/json',
  '.webmanifest':'application/manifest+json', '.svg':'image/svg+xml', '.png':'image/png' };
const server = createServer(async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
    const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    const route = pathname === '/' ? '/index.html' : pathname === '/focus-hero' ? '/focus-hero.html' : pathname;
    const target = resolve(assets, '.' + route);
    const rel = relative(assets, target);
    if (rel.startsWith('..' + sep) || rel === '..' || resolve(target) === assets) {
      res.writeHead(403).end(); return;
    }
    const body = await readFile(target);
    res.writeHead(200, { 'Content-Type':mime[extname(target)] || 'application/octet-stream', 'Cache-Control':'no-store' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch { res.writeHead(404).end('Not found'); }
});

await mkdir(logs, { recursive:true });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = String(server.address().port);
const results = [];
try {
  const available = await readdir(resolve(root, 'tests'));
  const standalone = available.filter(name => /(?:regressions|verdict|readonly|safety|accounting|integrity)\.(?:cjs|mjs)$/.test(name)
    && !browserSuites.includes(name.replace(/\.(?:cjs|mjs)$/, ''))).sort();
  const all = browserSuites.map(name => ({ name:name + '.mjs', args:[port] }))
    .concat(standalone.map(name => ({ name, args:[] })));
  const selected = process.argv.slice(2);
  const jobs = selected.length ? all.filter(job => selected.includes(job.name) || selected.includes(job.name.replace(/\.(?:cjs|mjs)$/, ''))) : all;
  if (selected.length && jobs.length !== new Set(selected).size) throw new Error('Unknown or duplicate test selection');
  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      const job = jobs[next++];
      const started = Date.now();
      let output = '', error = null;
      try {
        const result = await run(process.execPath, [resolve(root, 'tests', job.name), ...job.args], {
          cwd:root, env:{ ...process.env, TZ:'America/Toronto' }, timeout:180000, maxBuffer:10 * 1024 * 1024,
          windowsHide:true
        });
        output = result.stdout + result.stderr;
        // Some original suites forgot R.finish(). Never interpret a printed
        // failing assertion as success merely because the shell exit was zero.
        if (/^\s*FAIL\s/m.test(output)) error = 'A test printed a failed assertion';
      } catch (caught) {
        output = (caught.stdout || '') + (caught.stderr || '');
        error = String(caught.message || caught);
      }
      await writeFile(resolve(logs, job.name + '.log'), output + (error ? '\nRUNNER: ' + error + '\n' : ''));
      const result = { name:job.name, passed:!error, elapsedMs:Date.now() - started, error };
      results.push(result);
      console.log(`${result.passed ? 'PASS' : 'FAIL'} ${job.name} (${Math.round(result.elapsedMs / 1000)}s)`);
      await writeFile(resolve(logs, 'summary.json'), JSON.stringify(results, null, 2) + '\n');
    }
  }
  const concurrency = Math.max(1, Math.min(2, Number(process.env.LIFEXP_TEST_WORKERS) || 2));
  await Promise.all(Array.from({ length:concurrency }, () => worker()));
  const failures = results.filter(result => !result.passed);
  console.log(`${results.length - failures.length}/${results.length} suites passed. Logs: test-results/`);
  process.exitCode = failures.length ? 1 : 0;
} finally {
  await new Promise(resolve => server.close(resolve));
}
