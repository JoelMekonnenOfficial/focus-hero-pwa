/* Shared Playwright harness for the Life XP tests.
 *
 * Constraints this file exists to encode (see HANDOFF §8):
 *  - pinned chromium, --no-sandbox
 *  - serviceWorkers:'block' so a cached worker can never serve an old build
 *  - a NEW CONTEXT per clean-state test; localStorage survives page.reload()
 *  - this sandbox's browser has NO outbound network, so every external host is
 *    routed explicitly. A test that "reproduces" a cloud failure by letting a
 *    real request fail is reproducing the sandbox, not the bug.
 */
const { chromium } = await import(process.env.LIFEXP_PLAYWRIGHT_MODULE || 'playwright');

export const CHROME = process.env.LIFEXP_CHROME_PATH || chromium.executablePath();

/* Console noise that is expected in this harness and is not a defect.
   Anything not matched here fails the run. */
export const EXPECTED_NOISE = [
  /Password field is not contained in a form/i,
  /\[v8\.6\.3-patch\]/,
  /Service Worker registration blocked by Playwright/i,
  /SW register failed/i,
  /persistent storage not granted/i,
  /\[Report Only\]/i
];

export function isNoise(text){
  return EXPECTED_NOISE.some(re => re.test(text));
}

export async function launch(){
  return chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
}

/* Returns { ctx, page, problems, consoleAll }.
   `problems` collects pageerrors and any non-allowlisted error/warning. */
export async function openApp(browser, port, opts = {}){
  const ctx = await browser.newContext({ serviceWorkers: 'block', timezoneId: 'America/Toronto' });
  // All tests use disposable profiles. Only this local source server is real;
  // individual suites may override external routes with synthetic responses.
  await ctx.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' && url.port === String(port)
      ? route.continue() : route.abort('blockedbyclient');
  });
  const problems = [];
  const consoleAll = [];

  if (opts.routes) await opts.routes(ctx);
  else {
    await ctx.route('**://*.supabase.co/**', r => r.abort('failed'));
    await ctx.route('**://api.jsonstorage.net/**', r => r.abort('failed'));
  }

  const page = await ctx.newPage();
  page.on('console', m => {
    const line = `[${m.type()}] ${m.text()}`;
    consoleAll.push(line);
    if ((m.type() === 'error' || m.type() === 'warning') && !isNoise(m.text())) problems.push(line);
  });
  page.on('pageerror', e => {
    const line = `[PAGEERROR] ${e.message}`;
    consoleAll.push(line);
    problems.push(line);
  });

  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(
    () => typeof window.state === 'object' && window.state && typeof window.saveState === 'function',
    null, { timeout: 30000 }
  );
  await page.waitForTimeout(opts.settleMs ?? 4000);
  return { ctx, page, problems, consoleAll };
}

/* --- tiny assertion kit; every failure names the measured value --- */
export function makeReporter(name){
  const results = [];
  const check = (label, pass, detail = '') => {
    results.push({ label, pass, detail });
    console.log(`${pass ? '  ok  ' : ' FAIL '} ${label}${detail ? ' — ' + detail : ''}`);
    return pass;
  };
  const eq = (label, actual, expected) =>
    check(label, Object.is(actual, expected), `expected ${JSON.stringify(expected)}, measured ${JSON.stringify(actual)}`);
  const finish = () => {
    const failed = results.filter(r => !r.pass);
    console.log(`\n${name}: ${results.length - failed.length}/${results.length} passed`);
    if (failed.length){
      console.log(`${name} FAILED`);
      process.exit(1);
    }
    console.log(`${name} clean`);
    process.exit(0);
  };
  return { check, eq, finish, results };
}
