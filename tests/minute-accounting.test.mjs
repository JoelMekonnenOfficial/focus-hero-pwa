import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
let chromium;
for (const candidate of ["playwright", process.env.FOCUS_HERO_PLAYWRIGHT].filter(Boolean)) {
  try { ({ chromium } = require(candidate)); break; } catch (_) {}
}
if (!chromium) throw new Error("Playwright is required (set FOCUS_HERO_PLAYWRIGHT to its module path)");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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
  } catch (_) {
    res.writeHead(404);
    res.end("not found");
  }
});

await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const browser = await chromium.launch({ headless:true, channel:"chrome" });
const context = await browser.newContext({ serviceWorkers:"block" });
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", error => pageErrors.push(String(error)));

async function resetFixture(){
  await page.evaluate(() => {
    const fh = window.__FocusHero;
    const current = fh.stateRef();
    const fresh = fh.migrate(JSON.parse(JSON.stringify(fh.DEFAULTS)));
    Object.keys(current).forEach(key => delete current[key]);
    Object.assign(current, fresh, {
      totalFocusMin:0,
      completedFocusSessions:0,
      history:{},
      sessionHistory:{},
      sessionsLog:[],
      activityLog:[],
      editLog:[],
      tasks:[],
      activeTaskId:null
    });
    current.sync.enabled = false;
    current.settings.monthlyBackup = false;
    window.saveState({ fromPull:true });
    window.renderAll();
  });
}

let passed = 0;
async function test(name, fn){
  try {
    await fn();
    passed += 1;
    console.log(`ok ${passed} - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

try {
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil:"domcontentloaded" });
  await page.waitForFunction(() => window.__FocusHero && typeof window.applyTaskTimeAdjustment === "function" && typeof window.renderSessionHistoryPanel === "function");

  await test("ledger corrections keep authoritative recap and session-history totals exact", async () => {
    await resetFixture();
    const result = await page.evaluate(() => {
      const task = window.__FocusHero.createTask({ name:"Life", emoji:"🖤" });
      [19, 6, 70, 10, -5].forEach(delta => {
        const applied = window.applyTaskTimeAdjustment(task.id, delta);
        if (!applied?.ok) throw new Error(`failed to apply ${delta}: ${applied?.reason}`);
      });
      const state = window.__FocusHero.stateRef();
      const localDayKey = value => {
        const date = value instanceof Date ? value : new Date(value ?? Date.now());
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      };
      const day = localDayKey();
      const liveTask = state.tasks.find(item => item.id === task.id);
      const recordedMinutes = state.sessionsLog
        .filter(record => record?.type === "focus" && localDayKey(record.at || 0) === day)
        .reduce((total, record) => total + (record.minutes|0), 0);
      const summary = window.daySummary(day);
      window.renderDailyRecap();
      window.renderSessionHistoryPanel();
      const recapFocused = document.querySelector("#daily-recap .dr-cell b")?.textContent || "";
      const cards = [...document.querySelectorAll("#sessions-panel .session-history-card")]
        .map(card => [card.querySelector("span")?.textContent || "", card.querySelector("b")?.textContent || ""]);
      const historyText = document.querySelector("#sessions-panel")?.textContent || "";
      return {
        total:state.totalFocusMin|0,
        history:state.history[day]|0,
        taskToday:liveTask.dailyMin[day]|0,
        taskTotal:liveTask.totalFocusMin|0,
        recordedMinutes,
        summary,
        recapFocused,
        cards,
        historyText
      };
    });

    assert.deepEqual(
      { total:result.total, history:result.history, taskToday:result.taskToday, taskTotal:result.taskTotal },
      { total:100, history:100, taskToday:100, taskTotal:100 }
    );
    assert.equal(result.recordedMinutes, 100, "session-linked reduction must reconcile recorded and authoritative minutes");
    assert.equal(result.summary.histMinutes, 100);
    assert.equal(result.summary.recordedMinutes, 100);
    assert.equal(result.summary.sessions, 4, "every positive manual addition counts as one session");
    assert.equal(result.summary.topTask, "Life");
    assert.equal(result.recapFocused, "100m");
    assert.deepEqual(result.cards.slice(0, 2), [["30d sessions","4"],["30d time","1h 40m"]]);
    assert.doesNotMatch(result.historyText, /Standalone Time Ledger correction/);
    assert.match(result.historyText, /10m → 5m/);
  });

  await test("session editor supports both exact totals and relative adjustments", async () => {
    await resetFixture();
    const result = await page.evaluate(() => {
      const task = window.__FocusHero.createTask({ name:"Exact session", emoji:"🎯" });
      window.applyTaskTimeAdjustment(task.id, 120);
      const state = window.__FocusHero.stateRef();
      const record = state.sessionsLog.find(item => item?.source === "ledger" && item.taskId === task.id);
      if (!record) throw new Error("ledger session record missing");

      window.openSessionEditModal(record.id);
      const prefilledExact = document.querySelector("#session-edit-exact")?.value;
      document.querySelector("#session-edit-exact").value = "90";
      window.applySessionExactFromModal();
      const afterExact = state.sessionsLog.find(item => item.id === record.id)?.minutes|0;

      window.openSessionEditModal(record.id);
      document.querySelector("#session-edit-delta").value = "15";
      window.renderSessionEditModal();
      window.applySessionEditFromModal();
      const afterRelative = state.sessionsLog.find(item => item.id === record.id)?.minutes|0;
      const now = new Date();
      const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const liveTask = state.tasks.find(item => item.id === task.id);
      return {
        prefilledExact,
        afterExact,
        afterRelative,
        total:state.totalFocusMin|0,
        history:state.history[day]|0,
        taskToday:liveTask.dailyMin[day]|0,
        taskTotal:liveTask.totalFocusMin|0
      };
    });

    assert.equal(result.prefilledExact, "120");
    assert.equal(result.afterExact, 90);
    assert.equal(result.afterRelative, 105);
    assert.deepEqual(
      { total:result.total, history:result.history, taskToday:result.taskToday, taskTotal:result.taskTotal },
      { total:105, history:105, taskToday:105, taskTotal:105 }
    );
  });

  await test("session history retains pause duration and time-change details", async () => {
    await resetFixture();
    const result = await page.evaluate(() => {
      const task = window.__FocusHero.createTask({ name:"Detailed session", emoji:"D" });
      window.applyTaskTimeAdjustment(task.id, 20, { operationId:"detail-session", surface:"test" });
      const state = window.__FocusHero.stateRef();
      const rec = state.sessionsLog.find(record=>record?.manualOperationId === "detail-session");
      const base = Date.now()-180_000;
      window.beginTimerRunDetails(base);
      window.pauseTimerRunDetails(base+60_000);
      window.resumeTimerRunDetails(base+120_000);
      window.recordTimerTimeChange("live-session","exact",20,90,base+150_000);
      rec.sessionDetails = window.snapshotTimerRunDetails(base+180_000);
      window.renderSessionHistoryPanel();
      return { details:rec.sessionDetails, text:document.querySelector("#sessions-panel")?.textContent||"" };
    });
    assert.equal(result.details.pauses.length, 1);
    assert.equal(result.details.pauses[0].durationMs, 60_000);
    assert.equal(result.details.timeChanges.length, 1);
    assert.match(result.text, /1 pause · 1m paused/);
    assert.match(result.text, /1 time change/);
  });

  await test("20 plus 70 is exactly 90, retries are idempotent, and the audit detects duplicate evidence", async () => {
    await resetFixture();
    const result = await page.evaluate(() => {
      const task = window.__FocusHero.createTask({ name:"Exact ninety", emoji:"N" });
      const first = window.applyTaskTimeAdjustment(task.id, 20, { operationId:"exact-90-a", surface:"test" });
      const retry = window.applyTaskTimeAdjustment(task.id, 20, { operationId:"exact-90-a", surface:"test" });
      const second = window.applyTaskTimeAdjustment(task.id, 70, { operationId:"exact-90-b", surface:"test" });
      const state = window.__FocusHero.stateRef();
      const clean = window.auditAccountingState(state);
      const source = state.sessionsLog.find(record=>record?.manualOperationId === "exact-90-a");
      state.sessionsLog.push({ ...JSON.parse(JSON.stringify(source)), id:"synthetic-duplicate-session" });
      const flagged = window.auditAccountingState(state);
      return { first, retry, second, total:state.totalFocusMin, taskTotal:state.tasks.find(item=>item.id===task.id)?.totalFocusMin, sessions:state.completedFocusSessions, records:state.sessionsLog.length-1, clean, flagged };
    });
    assert.equal(result.first.ok, true);
    assert.equal(result.retry.duplicate, true);
    assert.equal(result.retry.delta, 0);
    assert.equal(result.second.ok, true);
    assert.deepEqual({ total:result.total, task:result.taskTotal, sessions:result.sessions, records:result.records }, { total:90, task:90, sessions:2, records:2 });
    assert.equal(result.clean.ok, true);
    assert.equal(result.flagged.ok, false);
    assert.match(result.flagged.issues.join(" "), /Duplicate manual edit operation IDs/);
  });

  assert.deepEqual(pageErrors, [], pageErrors.join("\n"));
  console.log(`passed ${passed}/${passed}`);
} finally {
  await context.close();
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
