import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
let chromium;
for (const candidate of [
  "playwright",
  process.env.FOCUS_HERO_PLAYWRIGHT
].filter(Boolean)) {
  try { ({ chromium } = require(candidate)); break; } catch (_) {}
}
if (!chromium) throw new Error("Playwright is required (set FOCUS_HERO_PLAYWRIGHT to its module path)");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const supabaseOrigin = "https://fkhzpscihafekhtcyvlt.supabase.co";
const mime = {
  ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8",
  ".svg":"image/svg+xml", ".png":"image/png", ".json":"application/json",
  ".webmanifest":"application/manifest+json"
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://127.0.0.1");
    const rel = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const file = path.resolve(root, `.${rel}`);
    if (!file.startsWith(root)) throw new Error("path escape");
    const body = await fs.readFile(file);
    res.writeHead(200, { "Content-Type":mime[path.extname(file)] || "application/octet-stream", "Cache-Control":"no-store" });
    res.end(body);
  } catch (_) { res.writeHead(404); res.end("not found"); }
});

await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const browser = await chromium.launch({ headless:true, channel:"chrome" });
let passed = 0;

function json(route, body, status=200){
  return route.fulfill({ status, contentType:"application/json", body:JSON.stringify(body) });
}
function restWrites(traffic){
  return traffic.filter(x => x.url.includes("/rest/v1/") && !["GET","HEAD"].includes(x.method));
}

async function scenario(handler, run){
  const context = await browser.newContext({ serviceWorkers:"block" });
  const traffic = [];
  const dispatch = async route => {
    const req = route.request();
    const entry = { url:req.url(), method:req.method(), headers:await req.allHeaders() };
    traffic.push(entry);
    await handler(route, entry, traffic);
  };
  await context.route(`${supabaseOrigin}/**`, dispatch);
  await context.route("https://api.jsonstorage.net/**", dispatch);
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", e => pageErrors.push(String(e)));
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil:"domcontentloaded" });
  await page.waitForFunction(() => window.__FocusHero && typeof window.claimSyncCode === "function" && typeof window.cloudPull === "function");
  try {
    await run(page, traffic);
    assert.deepEqual(pageErrors, [], pageErrors.join("\n"));
  } finally {
    await context.close();
  }
}

async function fixture(page, syncOverrides={}, dataOverrides={}){
  await page.evaluate(({ syncOverrides, dataOverrides }) => {
    const fh = window.__FocusHero;
    const current = fh.stateRef();
    const fresh = fh.migrate(JSON.parse(JSON.stringify(fh.DEFAULTS)));
    Object.keys(current).forEach(k => delete current[k]);
    Object.assign(current, fresh);
    current.settings.monthlyBackup = false;
    Object.assign(current, {
      totalFocusMin:120,
      completedFocusSessions:4,
      streak:3,
      longestStreak:5,
      history:{ "2026-07-10":120 },
      sessionHistory:{ "2026-07-10":4 },
      sessionsLog:[],
      tasks:[],
      ...dataOverrides
    });
    current.sync = Object.assign({}, fresh.sync, {
      enabled:false,
      backend:"supabase",
      playerId:"old-player",
      cloudRev:9,
      syncCode:"OLDCODE1",
      syncSecret:"OLDSECRET12345678",
      syncSecretHash:"old-secret-hash",
      userId:"old-anon-user",
      userToken:"fixture-fresh-token",
      refreshToken:"fixture-refresh-token",
      tokenExpiresAt:Date.now()+3_600_000
    }, syncOverrides);
    localStorage.clear();
    localStorage.setItem("focusHero.v4.state", JSON.stringify(current));
  }, { syncOverrides, dataOverrides });
}

async function snapshots(page){
  return page.evaluate(() => {
    const s = window.__FocusHero.stateRef();
    const accounting = JSON.stringify({
      totalFocusMin:s.totalFocusMin,
      completedFocusSessions:s.completedFocusSessions,
      streak:s.streak,
      longestStreak:s.longestStreak,
      history:s.history,
      sessionHistory:s.sessionHistory,
      sessionsLog:s.sessionsLog,
      tasks:s.tasks,
      hero:{ level:s.hero?.level, xp:s.hero?.xp, hp:s.hero?.hp, energy:s.hero?.energy, equipped:s.hero?.equipped },
      coins:s.coins,
      coinsEarned:s.coinsEarned,
      coinsSpent:s.coinsSpent,
      lootOwned:s.lootOwned,
      lootInstances:s.lootInstances,
      loot:s.loot,
      lootRework:s.lootRework,
      eggs:s.eggs
    });
    return {
      accounting,
      sync:JSON.stringify(s.sync),
      stored:localStorage.getItem("focusHero.v4.state")
    };
  });
}

async function test(name, fn){
  await fn();
  passed++;
  console.log(`ok ${passed} - ${name}`);
}

try {
  await test("Claim fails closed on a non-OK pull", async () => {
    await scenario(async (route, req) => {
      if (req.url.includes("/rest/v1/players")) return route.fulfill({ status:503, body:"temporary outage" });
      throw new Error(`unexpected request ${req.method} ${req.url}`);
    }, async (page, traffic) => {
      await fixture(page);
      const before = await snapshots(page);
      const result = await page.evaluate(() => window.claimSyncCode("NEWCODE1-NEWSECRET12345678"));
      const after = await snapshots(page);
      assert.equal(result, false);
      assert.equal(after.accounting, before.accounting);
      assert.equal(after.sync, before.sync);
      assert.equal(after.stored, before.stored);
      assert.equal(restWrites(traffic).length, 0);
    });
  });

  await test("Claim never pushes when the cloud row is missing", async () => {
    await scenario(async (route, req) => {
      if (req.url.includes("/rest/v1/players") && req.method === "GET") return json(route, []);
      throw new Error(`unexpected request ${req.method} ${req.url}`);
    }, async (page, traffic) => {
      await fixture(page);
      const before = await snapshots(page);
      const result = await page.evaluate(() => window.claimSyncCode("NEWCODE1-NEWSECRET12345678"));
      const after = await snapshots(page);
      assert.equal(result, false);
      assert.equal(after.accounting, before.accounting);
      assert.equal(after.sync, before.sync);
      assert.equal(after.stored, before.stored);
      assert.equal(restWrites(traffic).length, 0);
    });
  });

  await test("Claim preserves the prior identity when decrypt fails", async () => {
    await scenario(async (route, req) => {
      if (req.url.includes("/rest/v1/players") && req.method === "GET"){
        return json(route, [{ data:{ e2e:{ v:1, ct:"%%%", iv:"%%%", salt:"%%%" } }, cloud_rev:4 }]);
      }
      throw new Error(`unexpected request ${req.method} ${req.url}`);
    }, async (page, traffic) => {
      await fixture(page);
      const before = await snapshots(page);
      const result = await page.evaluate(() => window.claimSyncCode("NEWCODE1-NEWSECRET12345678"));
      const after = await snapshots(page);
      assert.equal(result, false);
      assert.equal(after.accounting, before.accounting);
      assert.equal(after.sync, before.sync);
      assert.equal(after.stored, before.stored);
      assert.equal(restWrites(traffic).length, 0);
    });
  });

  await test("Expired access token refreshes before the pull", async () => {
    await scenario(async (route, req) => {
      if (req.url.includes("/auth/v1/token?grant_type=refresh_token")){
        return json(route, { access_token:"fresh-access", refresh_token:"fresh-refresh", expires_in:3600, user:{id:"old-anon-user"} });
      }
      if (req.url.includes("/rest/v1/players")) return json(route, []);
      throw new Error(`unexpected request ${req.method} ${req.url}`);
    }, async (page, traffic) => {
      await fixture(page, { userToken:"expired-access", refreshToken:"refresh-me", tokenExpiresAt:Date.now()-60_000 });
      const before = await snapshots(page);
      const result = await page.evaluate(() => window.cloudPull({force:true}));
      const after = await snapshots(page);
      assert.equal(result, false);
      assert.equal(after.accounting, before.accounting);
      const sync = JSON.parse(after.sync);
      assert.equal(sync.userToken, "fresh-access");
      assert.equal(sync.refreshToken, "fresh-refresh");
      assert.equal(traffic.filter(x => x.url.includes("grant_type=refresh_token")).length, 1);
      assert.equal(traffic.filter(x => x.url.includes("/auth/v1/signup")).length, 0);
      assert.equal(traffic.find(x => x.url.includes("/rest/v1/players")).headers.authorization, "Bearer fresh-access");
      assert.equal(restWrites(traffic).length, 0);
    });
  });

  await test("A server-rejected cached token refreshes once and replays the read", async () => {
    let reads = 0;
    await scenario(async (route, req) => {
      if (req.url.includes("/auth/v1/token?grant_type=refresh_token")){
        return json(route, { access_token:"retry-access", refresh_token:"retry-refresh", expires_in:3600, user:{id:"old-anon-user"} });
      }
      if (req.url.includes("/rest/v1/players")){
        reads++;
        return reads === 1 ? json(route, { message:"JWT expired" }, 401) : json(route, []);
      }
      throw new Error(`unexpected request ${req.method} ${req.url}`);
    }, async (page, traffic) => {
      await fixture(page);
      const before = await snapshots(page);
      const result = await page.evaluate(() => window.cloudPull({force:true}));
      const after = await snapshots(page);
      assert.equal(result, false);
      assert.equal(after.accounting, before.accounting);
      assert.equal(reads, 2);
      assert.equal(traffic.filter(x => x.url.includes("grant_type=refresh_token")).length, 1);
      assert.equal(traffic.filter(x => x.url.includes("/rest/v1/players"))[1].headers.authorization, "Bearer retry-access");
      assert.equal(restWrites(traffic).length, 0);
    });
  });

  await test("Legacy expired token obtains a replacement anonymous session", async () => {
    await scenario(async (route, req) => {
      if (req.url.includes("/auth/v1/signup")){
        return json(route, { access_token:"replacement-access", refresh_token:"replacement-refresh", expires_in:3600, user:{id:"new-anon-user"} });
      }
      if (req.url.includes("/rest/v1/players")) return json(route, []);
      throw new Error(`unexpected request ${req.method} ${req.url}`);
    }, async (page, traffic) => {
      await fixture(page, { userToken:"expired-legacy", refreshToken:null, tokenExpiresAt:Date.now()-60_000 });
      const before = await snapshots(page);
      await page.evaluate(() => window.cloudPull({force:true}));
      const after = await snapshots(page);
      assert.equal(after.accounting, before.accounting);
      const sync = JSON.parse(after.sync);
      assert.equal(sync.userToken, "replacement-access");
      assert.equal(sync.userId, "new-anon-user");
      assert.equal(traffic.filter(x => x.url.includes("/auth/v1/signup")).length, 1);
      assert.equal(traffic.find(x => x.url.includes("/rest/v1/players")).headers.authorization, "Bearer replacement-access");
      assert.equal(restWrites(traffic).length, 0);
    });
  });

  await test("Authentication failure sends no cloud data request and preserves accounting", async () => {
    await scenario(async (route, req) => {
      if (req.url.includes("/auth/v1/token")) return json(route, { error:"expired" }, 401);
      if (req.url.includes("/auth/v1/signup")) return json(route, { error:"offline" }, 503);
      throw new Error(`REST request must not happen after auth failure: ${req.method} ${req.url}`);
    }, async (page, traffic) => {
      await fixture(page, { userToken:"expired-access", refreshToken:"still-valuable", tokenExpiresAt:Date.now()-60_000 });
      const before = await snapshots(page);
      await assert.rejects(() => page.evaluate(() => window.cloudPull({force:true})), /authentication could not be renewed/i);
      const after = await snapshots(page);
      assert.equal(after.accounting, before.accounting);
      assert.equal(after.sync, before.sync);
      assert.equal(traffic.filter(x => x.url.includes("/rest/v1/")).length, 0);
    });
  });

  await test("Rev-zero automatic and heartbeat pushes cannot create a cloud row", async () => {
    await scenario(async (_route, req) => {
      throw new Error(`rev-zero guarded push must not reach network: ${req.method} ${req.url}`);
    }, async (page, traffic) => {
      await fixture(page, { enabled:true, cloudRev:0 });
      const errors = await page.evaluate(async () => {
        window.saveState();
        await new Promise(resolve => setTimeout(resolve, 750));
        let heartbeatError = "";
        try { await window.cloudPush({ reason:"active-session-heartbeat" }); }
        catch(e){ heartbeatError = String(e?.message||e); }
        return { heartbeatError, pending:window.__FocusHero.stateRef().sync.lastSyncError||"" };
      });
      assert.match(errors.heartbeatError, /row creation blocked/i);
      assert.match(errors.pending, /row creation blocked/i);
      assert.equal(traffic.length, 0);
    });
  });

  await test("A collapsed live state cannot overwrite a confirmed cloud revision", async () => {
    await scenario(async (_route, req) => {
      throw new Error(`collapsed-state guard must stop before network: ${req.method} ${req.url}`);
    }, async (page, traffic) => {
      await fixture(page, { cloudRev:7 }, { totalFocusMin:0, completedFocusSessions:0, history:{}, sessionHistory:{}, sessionsLog:[], tasks:[] });
      const result = await page.evaluate(async () => {
        const protectedState = JSON.parse(JSON.stringify(window.__FocusHero.stateRef()));
        protectedState.totalFocusMin = 800;
        localStorage.setItem("focusHero.v4.state.lkg", JSON.stringify({ savedAt:new Date().toISOString(), state:protectedState }));
        let error = "";
        try { await window.cloudPush({ force:true, reason:"automatic-save" }); }
        catch(e){ error = String(e?.message||e); }
        const s = window.__FocusHero.stateRef();
        return { error, rev:s.sync.cloudRev, total:s.totalFocusMin };
      });
      assert.match(result.error, /open recover before syncing/i);
      assert.deepEqual({ rev:result.rev, total:result.total }, { rev:7, total:0 });
      assert.equal(traffic.length, 0);
    });
  });

  await test("Generate clears the old JSONStorage URL only after committing the new identity", async () => {
    const oldUrl = "https://api.jsonstorage.net/v1/json/old-row";
    const newUrl = "https://api.jsonstorage.net/v1/json/new-row";
    await scenario(async (route, req) => {
      if (req.url.startsWith("https://api.jsonstorage.net/v1/json?") && req.method === "POST"){
        return json(route, { uri:newUrl });
      }
      throw new Error(`Generate must not reuse the old JSONStorage row: ${req.method} ${req.url}`);
    }, async (page, traffic) => {
      await fixture(
        page,
        { enabled:true, backend:"jsonstorage", jsonstorageUrl:oldUrl, cloudRev:5 },
        { totalFocusMin:48_000, completedFocusSessions:900, history:{ "2026-07-10":48_000 } }
      );
      const result = await page.evaluate(() => {
        window.prompt = () => { throw new Error("nonblank restored state must not prompt"); };
        return window.genSyncCode();
      });
      const sync = await page.evaluate(() => window.__FocusHero.stateRef().sync);
      assert.equal(result, true);
      assert.equal(sync.jsonstorageUrl, newUrl);
      assert.equal(sync.cloudRev, 1);
      assert.equal(traffic.length, 1);
      assert.equal(traffic[0].method, "POST");
      assert.equal(traffic.some(x => x.url === oldUrl), false);
    });
  });

  await test("A delayed old-identity pull cannot overwrite a completed Claim", async () => {
    let oldRows = [];
    let newRows = [];
    let releaseOld;
    let signalOldStarted;
    const oldGate = new Promise(resolve => { releaseOld = resolve; });
    const oldStarted = new Promise(resolve => { signalOldStarted = resolve; });
    await scenario(async (route, req) => {
      if (req.url.includes("/rest/v1/players") && req.method === "GET"){
        if (req.url.includes("id=eq.old-player")){
          signalOldStarted();
          await oldGate;
          return json(route, oldRows);
        }
        return json(route, newRows);
      }
      throw new Error(`unexpected request ${req.method} ${req.url}`);
    }, async (page, traffic) => {
      await fixture(page);
      ({ oldRows, newRows } = await page.evaluate(() => {
        const oldRemote = JSON.parse(JSON.stringify(window.__FocusHero.DEFAULTS));
        oldRemote.totalFocusMin = 999;
        oldRemote.history = { "2026-07-01":999 };
        oldRemote.settings.e2eEncryption = false;
        const newRemote = JSON.parse(JSON.stringify(window.__FocusHero.DEFAULTS));
        newRemote.totalFocusMin = 240;
        newRemote.completedFocusSessions = 8;
        newRemote.history = { "2026-07-10":120, "2026-07-11":120 };
        newRemote.settings.e2eEncryption = false;
        return {
          oldRows:[{ data:{ plain:oldRemote }, cloud_rev:99 }],
          newRows:[{ data:{ plain:newRemote }, cloud_rev:7 }]
        };
      }));
      await page.evaluate(() => {
        window.__oldPullDone = false;
        window.__oldPullError = "";
        window.cloudPull({force:true})
          .catch(e => { window.__oldPullError = String(e?.code||e?.message||e); })
          .finally(() => { window.__oldPullDone = true; });
      });
      await Promise.race([oldStarted, new Promise((_, reject) => setTimeout(() => reject(new Error("old pull did not start")), 5000))]);
      const claimed = await page.evaluate(() => window.claimSyncCode("NEWCODE1-NEWSECRET12345678"));
      assert.equal(claimed, true);
      releaseOld();
      await page.waitForFunction(() => window.__oldPullDone === true);
      const final = await page.evaluate(() => {
        const s = window.__FocusHero.stateRef();
        return { total:s.totalFocusMin, rev:s.sync.cloudRev, code:s.sync.syncCode, oldPullError:window.__oldPullError };
      });
      assert.deepEqual({ total:final.total, rev:final.rev, code:final.code }, { total:240, rev:7, code:"NEWCODE1" });
      assert.match(final.oldPullError, /FH_SYNC_SUPERSEDED/);
      assert.equal(restWrites(traffic).length, 0);
    });
  });

  await test("A delayed old-identity push cannot mutate Claim state or revision", async () => {
    let newRows = [];
    let releaseOldPush;
    let signalOldPushStarted;
    const oldPushGate = new Promise(resolve => { releaseOldPush = resolve; });
    const oldPushStarted = new Promise(resolve => { signalOldPushStarted = resolve; });
    await scenario(async (route, req) => {
      if (req.url.includes("/rest/v1/players") && req.method === "PATCH"){
        signalOldPushStarted();
        await oldPushGate;
        return json(route, [{ cloud_rev:6 }]);
      }
      if (req.url.includes("/rest/v1/players") && req.method === "GET") return json(route, newRows);
      throw new Error(`unexpected request ${req.method} ${req.url}`);
    }, async (page, traffic) => {
      await fixture(page, { cloudRev:5 });
      newRows = await page.evaluate(() => {
        const remote = JSON.parse(JSON.stringify(window.__FocusHero.DEFAULTS));
        remote.totalFocusMin = 240;
        remote.completedFocusSessions = 8;
        remote.history = { "2026-07-10":120, "2026-07-11":120 };
        remote.settings.e2eEncryption = false;
        return [{ data:{ plain:remote }, cloud_rev:7 }];
      });
      await page.evaluate(() => {
        window.__oldPushDone = false;
        window.__oldPushError = "";
        window.cloudPush({force:true, reason:"old-identity-save"})
          .catch(e => { window.__oldPushError = String(e?.code||e?.message||e); })
          .finally(() => { window.__oldPushDone = true; });
      });
      await Promise.race([oldPushStarted, new Promise((_, reject) => setTimeout(() => reject(new Error("old push did not start")), 5000))]);
      const claimed = await page.evaluate(() => window.claimSyncCode("NEWCODE1-NEWSECRET12345678"));
      assert.equal(claimed, true);
      releaseOldPush();
      await page.waitForFunction(() => window.__oldPushDone === true);
      const final = await page.evaluate(() => {
        const s = window.__FocusHero.stateRef();
        return {
          total:s.totalFocusMin,
          rev:s.sync.cloudRev,
          code:s.sync.syncCode,
          pending:s.sync.pendingSync,
          oldPushError:window.__oldPushError
        };
      });
      assert.deepEqual(
        { total:final.total, rev:final.rev, code:final.code, pending:final.pending },
        { total:240, rev:7, code:"NEWCODE1", pending:false }
      );
      assert.match(final.oldPushError, /FH_SYNC_SUPERSEDED/);
      const writes = restWrites(traffic);
      assert.equal(writes.length, 1);
      assert.match(writes[0].url, /id=eq\.old-player/);
    });
  });

  await test("Successful Claim merges remote state without any push", async () => {
    let rows = [];
    await scenario(async (route, req) => {
      if (req.url.includes("/rest/v1/players") && req.method === "GET") return json(route, rows);
      throw new Error(`unexpected request ${req.method} ${req.url}`);
    }, async (page, traffic) => {
      await fixture(page);
      rows = await page.evaluate(() => {
        const remote = JSON.parse(JSON.stringify(window.__FocusHero.DEFAULTS));
        remote.totalFocusMin = 240;
        remote.completedFocusSessions = 8;
        remote.history = { "2026-07-10":120, "2026-07-11":120 };
        remote.sessionHistory = { "2026-07-10":4, "2026-07-11":4 };
        remote.settings.e2eEncryption = false;
        return [{ data:{ plain:remote }, cloud_rev:7 }];
      });
      const result = await page.evaluate(() => window.claimSyncCode("NEWCODE1-NEWSECRET12345678"));
      const state = await page.evaluate(() => {
        const s = window.__FocusHero.stateRef();
        return { total:s.totalFocusMin, completed:s.completedFocusSessions, history:s.history, sync:s.sync };
      });
      assert.equal(result, true);
      assert.equal(state.total, 240);
      assert.equal(state.completed, 8);
      assert.equal(state.history["2026-07-11"], 120);
      assert.equal(state.sync.syncCode, "NEWCODE1");
      assert.equal(state.sync.syncSecret, "NEWSECRET12345678");
      assert.equal(state.sync.cloudRev, 7);
      assert.equal(restWrites(traffic).length, 0);
    });
  });

  await test("Claim ignores a stale JSONStorage backend and reads the generated Supabase row", async () => {
    let rows = [];
    const staleUrl = "https://api.jsonstorage.net/v1/json/months-old-row";
    await scenario(async (route, req) => {
      if (req.url.includes("/rest/v1/players") && req.method === "GET") return json(route, rows);
      throw new Error(`Claim must use Supabase, not stale JSONStorage: ${req.method} ${req.url}`);
    }, async (page, traffic) => {
      await fixture(page, { backend:"jsonstorage", jsonstorageUrl:staleUrl });
      rows = await page.evaluate(() => {
        const remote = JSON.parse(JSON.stringify(window.__FocusHero.DEFAULTS));
        remote.totalFocusMin = 240;
        remote.completedFocusSessions = 8;
        remote.history = { "2026-07-10":120, "2026-07-11":120 };
        remote.settings.e2eEncryption = false;
        return [{ data:{ plain:remote }, cloud_rev:7 }];
      });
      const result = await page.evaluate(() => window.claimSyncCode("NEWCODE1-NEWSECRET12345678"));
      const sync = await page.evaluate(() => window.__FocusHero.stateRef().sync);
      assert.equal(result, true);
      assert.equal(sync.backend, "supabase");
      assert.equal(sync.jsonstorageUrl, null);
      assert.equal(sync.cloudRev, 7);
      assert.equal(traffic.filter(x => x.url.includes("/rest/v1/players") && x.method === "GET").length, 1);
      assert.equal(traffic.some(x => x.url.includes("api.jsonstorage.net")), false);
      assert.equal(restWrites(traffic).length, 0);
    });
  });

  await test("Blank Generate requires the exact typed confirmation before mutation", async () => {
    await scenario(async (_route, req) => {
      throw new Error(`blank Generate must not reach network: ${req.method} ${req.url}`);
    }, async (page, traffic) => {
      await fixture(page, { backend:"jsonstorage", jsonstorageUrl:"https://api.jsonstorage.net/v1/json/original-row" }, { totalFocusMin:0, completedFocusSessions:0, history:{}, sessionHistory:{}, sessionsLog:[], tasks:[] });
      const before = await snapshots(page);
      const result = await page.evaluate(async () => {
        window.prompt = () => "not a new profile";
        return window.genSyncCode();
      });
      const after = await snapshots(page);
      assert.equal(result, false);
      assert.equal(after.accounting, before.accounting);
      assert.equal(after.sync, before.sync);
      assert.equal(after.stored, before.stored);
      assert.equal(traffic.length, 0);
    });
  });

  await test("Sync now does not force-push without a pull or confirmed revision", async () => {
    await scenario(async (route, req) => {
      if (req.url.includes("/rest/v1/players") && req.method === "GET") return json(route, []);
      throw new Error(`unexpected request ${req.method} ${req.url}`);
    }, async (page, traffic) => {
      await fixture(page, { enabled:true, cloudRev:0 });
      const before = await snapshots(page);
      await page.evaluate(() => document.querySelector("#btn-sync-now").onclick());
      const after = await snapshots(page);
      assert.equal(after.accounting, before.accounting);
      assert.equal(restWrites(traffic).length, 0);
    });
  });

  await test("Cloud payloads and exported backups omit device auth tokens", async () => {
    await scenario(async (_route, req) => { throw new Error(`unexpected request ${req.method} ${req.url}`); }, async (page) => {
      await fixture(page);
      const result = await page.evaluate(() => {
        const s = window.__FocusHero.stateRef();
        const cloud = window.sanitizeForCloud(s);
        const exported = window.buildBackupBlob().payload.state;
        return { cloud:cloud.sync, exported:exported.sync, live:s.sync };
      });
      for (const safe of [result.cloud, result.exported]){
        assert.equal("userToken" in safe, false);
        assert.equal("refreshToken" in safe, false);
        assert.equal("tokenExpiresAt" in safe, false);
      }
      assert.equal(result.live.userToken, "fixture-fresh-token");
      assert.equal(result.live.refreshToken, "fixture-refresh-token");
    });
  });

  console.log(`sync hardening suite: ${passed}/${passed} passing`);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
