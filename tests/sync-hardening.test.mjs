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
  await page.waitForFunction(() => typeof window.fhRenderProgressionHub === "function");
  // Let the app's intentional delayed Targets/progression initializers finish
  // before a fixture replaces state. Otherwise their one-time shape save can
  // race a failed cloud operation and make an unrelated byte-for-byte storage
  // assertion flaky.
  await page.waitForTimeout(400);
  try {
    await run(page, traffic, context);
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
    /* Canonicalize render-owned additive shapes before taking exact-byte
       snapshots. Otherwise the delayed Targets/Challenges installers can
       legitimately save their first-run shape in the middle of a sync test. */
    const requestedSyncEnabled = !!current.sync.enabled;
    current.sync.enabled = false;
    window.renderAll?.();
    current.sync.enabled = requestedSyncEnabled;
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

  await test("A peer-tab staged recovery supersedes a delayed cloud pull before it can overwrite local data", async () => {
    let remoteRows = [];
    let releasePull;
    let signalPullStarted;
    const pullGate = new Promise(resolve => { releasePull = resolve; });
    const pullStarted = new Promise(resolve => { signalPullStarted = resolve; });
    await scenario(async (route, req) => {
      if (req.url.includes("/rest/v1/players") && req.method === "GET"){
        signalPullStarted();
        await pullGate;
        return json(route, remoteRows);
      }
      throw new Error(`unexpected request ${req.method} ${req.url}`);
    }, async (page, traffic, context) => {
      const peer = await context.newPage();
      const peerErrors = [];
      peer.on("pageerror", error => peerErrors.push(String(error)));
      await peer.goto(`http://127.0.0.1:${port}/`, { waitUntil:"domcontentloaded" });
      await peer.waitForFunction(() => window.__FocusHero?.stageRecovery && typeof window.cloudPull === "function");
      await fixture(page, { enabled:true });
      await page.waitForFunction(() => window.__FocusHero.stateRef().sync.enabled === true);
      await peer.waitForFunction(() => window.__FocusHero.stateRef().sync.playerId === "old-player");
      remoteRows = await page.evaluate(() => {
        const remote = JSON.parse(JSON.stringify(window.__FocusHero.DEFAULTS));
        remote.totalFocusMin = 999;
        remote.completedFocusSessions = 30;
        remote.history = { "2026-07-01":999 };
        remote.settings.e2eEncryption = false;
        return [{ data:{ plain:remote }, cloud_rev:99 }];
      });
      await page.evaluate(() => {
        window.__delayedPeerPullDone = false;
        window.__delayedPeerPullError = "";
        window.cloudPull({force:true})
          .catch(error => { window.__delayedPeerPullError = String(error?.code||error?.message||error); })
          .finally(() => { window.__delayedPeerPullDone = true; });
      });
      await Promise.race([pullStarted, new Promise((_, reject) => setTimeout(() => reject(new Error("delayed pull did not start")), 5000))]);
      const staged = await peer.evaluate(() => {
        const candidate = JSON.parse(JSON.stringify(window.__FocusHero.DEFAULTS));
        candidate.totalFocusMin = 333;
        candidate.completedFocusSessions = 11;
        candidate.history = { "2026-07-21":333 };
        return window.__FocusHero.stageRecovery(candidate, "focusHero.v4.state.pre-peer-test-", {
          operation:"import",
          syncMessage:"Import staged locally; verify it before re-enabling cloud sync."
        });
      });
      assert.equal(staged.syncPaused, true);
      await page.waitForFunction(() => {
        const state = window.__FocusHero.stateRef();
        return state.totalFocusMin === 333 && state.sync.enabled === false;
      });
      releasePull();
      await page.waitForFunction(() => window.__delayedPeerPullDone === true);
      const final = await page.evaluate(() => {
        const state = window.__FocusHero.stateRef();
        return {
          total:state.totalFocusMin,
          sessions:state.completedFocusSessions,
          rev:state.sync.cloudRev,
          code:state.sync.syncCode,
          enabled:state.sync.enabled,
          error:window.__delayedPeerPullError,
          stored:JSON.parse(localStorage.getItem("focusHero.v4.state"))
        };
      });
      assert.deepEqual(
        { total:final.total, sessions:final.sessions, rev:final.rev, code:final.code, enabled:final.enabled },
        { total:333, sessions:11, rev:9, code:"OLDCODE1", enabled:false }
      );
      assert.equal(final.stored.totalFocusMin,333);
      assert.equal(final.stored.sync.enabled,false);
      assert.match(final.error,/FH_SYNC_SUPERSEDED/);
      assert.equal(restWrites(traffic).length,0);
      assert.deepEqual(peerErrors,[],peerErrors.join("\n"));
    });
  });

  await test("A malformed peer-tab storage write cannot replace the valid in-memory profile", async () => {
    await scenario(async (_route, req) => {
      throw new Error(`unexpected request ${req.method} ${req.url}`);
    }, async (page, traffic, context) => {
      await fixture(page);
      const peer = await context.newPage();
      await peer.goto(`http://127.0.0.1:${port}/`, { waitUntil:"domcontentloaded" });
      await peer.waitForFunction(() => window.__FocusHero?.stateRef);
      await peer.waitForTimeout(400);
      const before = await page.evaluate(() => {
        const current = window.__FocusHero.stateRef();
        return { total:current.totalFocusMin, sessions:current.completedFocusSessions, code:current.sync.syncCode };
      });
      await peer.evaluate(() => localStorage.setItem("focusHero.v4.state", "{}"));
      await page.waitForTimeout(100);
      const after = await page.evaluate(() => {
        const current = window.__FocusHero.stateRef();
        return { total:current.totalFocusMin, sessions:current.completedFocusSessions, code:current.sync.syncCode };
      });
      assert.deepEqual(after,before);
      await page.evaluate(() => window.saveState({fromPull:true}));
      const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("focusHero.v4.state")));
      assert.equal(stored.totalFocusMin,before.total);
      assert.equal(restWrites(traffic).length,0);
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

  await test("Claim decrypts a normal E2E envelope returned as Supabase JSON text", async () => {
    let rows = [];
    await scenario(async (route, req) => {
      if (req.url.includes("/rest/v1/players") && req.method === "GET") return json(route, rows);
      throw new Error(`unexpected request ${req.method} ${req.url}`);
    }, async (page, traffic) => {
      await fixture(page, { backend:"jsonstorage", jsonstorageUrl:"https://api.jsonstorage.net/v1/json/stale" });
      await page.evaluate(() => {
        const s = window.__FocusHero.stateRef();
        s.settings.e2eEncryption = false;
        window.saveState({fromPull:true});
      });
      rows = await page.evaluate(async () => {
        const s = window.__FocusHero.stateRef();
        const priorSync = JSON.parse(JSON.stringify(s.sync));
        const priorE2E = s.settings.e2eEncryption;
        s.sync.syncCode = "NEWCODE1";
        s.sync.syncSecret = "NEWSECRET12345678";
        s.sync.saltB64 = null;
        s.settings.e2eEncryption = true;
        const remote = JSON.parse(JSON.stringify(window.__FocusHero.DEFAULTS));
        remote.totalFocusMin = 480;
        remote.completedFocusSessions = 16;
        remote.history = { "2026-07-11":480 };
        const envelope = await window.encryptStateBlob(remote);
        s.sync = priorSync;
        s.settings.e2eEncryption = priorE2E;
        window.saveState({fromPull:true});
        return [{ data:JSON.stringify(envelope), cloud_rev:11 }];
      });
      const result = await page.evaluate(() => window.claimSyncCode("NEWCODE1-NEWSECRET12345678"));
      const current = await page.evaluate(() => {
        const s = window.__FocusHero.stateRef();
        return {
          total:s.totalFocusMin, completed:s.completedFocusSessions,
          rev:s.sync.cloudRev, backend:s.sync.backend, e2e:s.settings.e2eEncryption
        };
      });
      assert.equal(result, true);
      assert.deepEqual(current, { total:480, completed:16, rev:11, backend:"supabase", e2e:true });
      assert.equal(traffic.some(x => x.url.includes("api.jsonstorage.net")), false);
      assert.equal(restWrites(traffic).length, 0);
    });
  });

  await test("Claim accepts an authenticated legacy serialized inner state", async () => {
    let rows = [];
    await scenario(async (route, req) => {
      if (req.url.includes("/rest/v1/players") && req.method === "GET") return json(route, rows);
      throw new Error(`unexpected request ${req.method} ${req.url}`);
    }, async (page, traffic) => {
      await fixture(page);
      rows = await page.evaluate(async () => {
        const s = window.__FocusHero.stateRef();
        const priorSync = JSON.parse(JSON.stringify(s.sync));
        const priorE2E = s.settings.e2eEncryption;
        s.sync.syncCode = "NEWCODE1";
        s.sync.syncSecret = "NEWSECRET12345678";
        s.sync.saltB64 = null;
        s.settings.e2eEncryption = true;
        const remote = JSON.parse(JSON.stringify(window.__FocusHero.DEFAULTS));
        remote.totalFocusMin = 360;
        remote.history = { "2026-07-11":360 };
        const envelope = await window.encryptStateBlob(JSON.stringify(remote));
        s.sync = priorSync;
        s.settings.e2eEncryption = priorE2E;
        window.saveState({fromPull:true});
        return [{ data:envelope, cloud_rev:9 }];
      });
      const result = await page.evaluate(() => window.claimSyncCode("NEWCODE1-NEWSECRET12345678"));
      const current = await page.evaluate(() => window.__FocusHero.stateRef());
      assert.equal(result, true);
      assert.equal(current.totalFocusMin, 360);
      assert.equal(current.sync.cloudRev, 9);
      assert.equal(restWrites(traffic).length, 0);
    });
  });

  await test("Malformed serialized cloud payload fails closed without a write", async () => {
    await scenario(async (route, req) => {
      if (req.url.includes("/rest/v1/players") && req.method === "GET"){
        return json(route, [{ data:'{"e2e":', cloud_rev:11 }]);
      }
      throw new Error(`unexpected request ${req.method} ${req.url}`);
    }, async (page, traffic) => {
      await fixture(page);
      const before = await snapshots(page);
      const result = await page.evaluate(() => window.claimSyncCode("NEWCODE1-NEWSECRET12345678"));
      const after = await snapshots(page);
      const message = await page.evaluate(() => document.querySelector("#claim-msg").textContent);
      assert.equal(result, false);
      assert.match(message, /not valid JSON/i);
      assert.equal(after.accounting, before.accounting);
      assert.equal(after.sync, before.sync);
      assert.equal(after.stored, before.stored);
      assert.equal(restWrites(traffic).length, 0);
    });
  });

  await test("Serialized primitives and arrays are rejected as non-state payloads", async () => {
    for (const serialized of ["[]", "42", "null", '{"hero":{}}']){
      await scenario(async (route, req) => {
        if (req.url.includes("/rest/v1/players") && req.method === "GET"){
          return json(route, [{ data:serialized, cloud_rev:11 }]);
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
    }
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

  await test("Cloud merge preserves Vault locations and remote progression on a fresh device", async () => {
    await scenario(async (_route, req) => { throw new Error(`unexpected request ${req.method} ${req.url}`); }, async (page) => {
      const result = await page.evaluate(() => {
        const fh = window.__FocusHero;
        const local = fh.migrate(JSON.parse(JSON.stringify(fh.DEFAULTS)));
        const remote = fh.migrate(JSON.parse(JSON.stringify(fh.DEFAULTS)));
        const vaulted = { iid:"vaulted", lootId:"blade", tier:"rare", level:2 };
        const withdrawn = { iid:"withdrawn", lootId:"helm", tier:"epic", level:1 };
        local.lootInstances = { vaulted:{...vaulted,level:1}, withdrawn };
        local.loot.vault = { instances:{}, locations:{ withdrawn:{location:"inventory",at:200} }, cap:100 };
        remote.lootInstances = {};
        remote.loot.vault = {
          instances:{ vaulted, withdrawn:{...withdrawn,level:2} },
          locations:{ withdrawn:{location:"vault",at:100} }, cap:100
        };
        remote.loot.mountProgress = 4321;
        remote.loot.mountFamilies = { dragon:{ collected:{ ember_drake:1 } } };
        remote.crystalShards = 70;
        remote.crystalShardsEarned = 100;
        remote.crystalShardsSpent = 30;
        remote.craftingDust = 12;
        remote.world = {
          currentZone:"frostpeak", unlockedZones:{verdant_vale:true,frostpeak:true},
          zonesVisited:{verdant_vale:2,frostpeak:3}, bossesDefeated:4,
          mysteryBoxesOpened:2, artifactsFound:{worldseed:20}, questCounters:{craft_actions:3}
        };
        const today = window.wdTodayKey(), week = window.wdWeekKey(), month = window.wdMonthKey();
        remote.questSystem = {
          lastRoll:{daily:today,weekly:week,seasonal:month},
          daily:[{id:"remote-daily",kind:"minutes",target:25,progress:20,completed:false,claimed:false,rolledAt:2}],
          weekly:[], seasonal:[], dailyClaimedCount:2, weeklyClaimedCount:0, seasonalClaimedCount:0
        };
        remote.achievementsV85 = { remote_achievement:123 };
        const merged = fh.mergeRemoteState(local, remote);
        return {
          vaultedProtected:!!merged.loot.vault.instances.vaulted,
          vaultedDuplicated:!!merged.lootInstances.vaulted,
          withdrawnActive:!!merged.lootInstances.withdrawn,
          withdrawnDuplicated:!!merged.loot.vault.instances.withdrawn,
          withdrawnLevel:merged.lootInstances.withdrawn?.level,
          mountProgress:merged.loot.mountProgress,
          mountCollected:merged.loot.mountFamilies.dragon?.collected?.ember_drake,
          shards:merged.crystalShards, spent:merged.crystalShardsSpent,
          dust:merged.craftingDust, zone:merged.world.currentZone,
          frostpeak:merged.world.unlockedZones.frostpeak,
          quest:merged.questSystem.daily[0]?.id,
          claimed:merged.questSystem.dailyClaimedCount,
          achievement:merged.achievementsV85.remote_achievement
        };
      });
      assert.deepEqual(result, {
        vaultedProtected:true, vaultedDuplicated:false,
        withdrawnActive:true, withdrawnDuplicated:false, withdrawnLevel:2,
        mountProgress:4321, mountCollected:1,
        shards:70, spent:30, dust:12, zone:"frostpeak", frostpeak:true,
        quest:"remote-daily", claimed:2, achievement:123
      });
    });
  });

  console.log(`sync hardening suite: ${passed}/${passed} passing`);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
