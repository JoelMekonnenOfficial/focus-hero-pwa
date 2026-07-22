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
const html = await fs.readFile(path.join(root, "focus-hero.html"), "utf8");
const index = await fs.readFile(path.join(root, "index.html"), "utf8");
const sw = await fs.readFile(path.join(root, "sw.js"), "utf8");

assert.equal(index, html, "index.html and focus-hero.html must remain exact mirrors");
assert.doesNotMatch(html, /data-tab="sessions"[^>]*>[^<]*[\p{Extended_Pictographic}]/u);
assert.doesNotMatch(html, /data-tab="targets"[^>]*>[^<]*[\p{Extended_Pictographic}]/u);
assert.match(html, /data-nav-action="sessions"><span>▦<\/span><b>Sessions<\/b>/);
assert.match(html, /href="\.\/recover\.html">Recovery center<\/a>/);
assert.match(html, /class="encounter-stage" id="encounter-stage"/);
assert.doesNotMatch(html, /adv-status-slot|adv-status-pill|fh76-blink/);
assert.doesNotMatch(sw, /RECOVER_LINK|data-nav-recover|withRecoverLink/);
assert.match(sw, /async function withDataGuard/);
assert.match(sw, /data-guard\.js/);
assert.match(sw, /\.\/progression-hub\.js/);
assert.equal((html.match(/id="btn-cancel-session"/g) || []).length, 1, "one shared live cancel control");
assert.doesNotMatch(html, /id="btn-lock-reset"|id="btn-priority-cancel"/);
assert.match(html, /#live-custom-min\{[^}]*min-height:48px/);
assert.match(html, /<script src="\.\/progression-hub\.js"><\/script>/);

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
try {
  const context = await browser.newContext({ serviceWorkers:"block", viewport:{ width:320, height:844 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(String(error)));
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil:"domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.__FocusHero?.stateRef));
  await page.waitForSelector(".progress-browse");

  const organized = await page.evaluate(async () => {
    await new Promise(resolve => setTimeout(resolve, 50));
    const browse = document.querySelector(".progress-browse");
    const live = document.querySelector("#live-adjust");
    if (live) live.hidden = false;
    const inputRect = document.querySelector("#live-custom-min")?.getBoundingClientRect();
    const wrapRect = document.querySelector("#live-custom-wrap")?.getBoundingClientRect();
    browse.open = true;
    document.querySelector('[data-tab="world"]')?.click();
    await new Promise(resolve => setTimeout(resolve, 20));
    const targetButtons = Array.from(document.querySelectorAll(".fht-view-switch button")).map(button => button.textContent.trim());
    return {
      groups:browse.querySelectorAll(".progress-tab-group").length,
      current:browse.querySelector("[data-progress-current]")?.textContent,
      closesAfterChoice:!browse.open,
      world:/Adventure map/.test(document.querySelector("#world-panel")?.textContent || ""),
      challenges:/Goals with rewards/.test(document.querySelector("#quests-v85-panel")?.textContent || ""),
      vault:/Protected item storage/.test(document.querySelector("#vault-panel")?.textContent || ""),
      targetButtons,
      duplicateTargets:document.querySelectorAll("#fht-card").length,
      cancelCount:document.querySelectorAll("#btn-cancel-session").length,
      inputWidth:inputRect?.width || 0,
      inputHeight:inputRect?.height || 0,
      customFits:!!inputRect && !!wrapRect && inputRect.right <= wrapRect.right + 1 && inputRect.left >= wrapRect.left - 1
    };
  });
  assert.equal(organized.groups, 6);
  assert.equal(organized.current, "World");
  assert.equal(organized.closesAfterChoice, true);
  assert.equal(organized.world, true);
  assert.equal(organized.challenges, true);
  assert.equal(organized.vault, true);
  assert.deepEqual(organized.targetButtons, ["Current targets", "Reward history"]);
  assert.equal(organized.duplicateTargets, 0);
  assert.equal(organized.cancelCount, 1);
  assert.ok(organized.inputWidth >= 140, `custom minute input width was ${organized.inputWidth}`);
  assert.ok(organized.inputHeight >= 48, `custom minute input height was ${organized.inputHeight}`);
  assert.equal(organized.customFits, true);

  const encounter = await page.evaluate(() => {
    const stage = document.querySelector("#encounter-stage");
    const craft = document.querySelector('#adv-actions [data-action="Craft"]');
    craft?.click();
    return {
      exists:!!stage,
      scene:stage?.dataset.scene,
      target:document.querySelector("#arena-enemy-name")?.textContent,
      model:!!document.querySelector("#arena-hero-model svg") && !!document.querySelector("#arena-enemy-model svg"),
      statusPill:!!document.querySelector("#adv-status-slot, .adv-status-pill")
    };
  });
  assert.deepEqual(encounter, { exists:true, scene:"crafting", target:"Forge Bench", model:true, statusPill:false });

  const seeded = await page.evaluate(() => {
    const state = window.__FocusHero.stateRef();
    return {
      font:state.settings.timerFont,
      weight:state.settings.timerWeight,
      color:state.settings.timerColor,
      custom:state.settings.customTimerColor,
      computedWeight:getComputedStyle(document.querySelector(".timer-display")).fontWeight
    };
  });
  assert.deepEqual(seeded, { font:"air", weight:200, color:"soft", custom:"#b8c4d4", computedWeight:"200" });
  const migratedAppearance = await page.evaluate(() => {
    const legacy = JSON.parse(JSON.stringify(window.__FocusHero.DEFAULTS));
    delete legacy.settings.timerFont;
    delete legacy.settings.timerWeight;
    delete legacy.settings.timerColor;
    delete legacy.settings.customTimerColor;
    legacy.totalFocusMin = 49777;
    legacy.completedFocusSessions = 451;
    legacy.history = { "2026-07-17":90 };
    const migrated = window.__FocusHero.migrate(legacy);
    return {
      font:migrated.settings.timerFont,
      weight:migrated.settings.timerWeight,
      color:migrated.settings.timerColor,
      custom:migrated.settings.customTimerColor,
      totalFocusMin:migrated.totalFocusMin,
      completedFocusSessions:migrated.completedFocusSessions,
      history:migrated.history
    };
  });
  assert.deepEqual(migratedAppearance, {
    font:"air", weight:200, color:"soft", custom:"#b8c4d4",
    totalFocusMin:49777, completedFocusSessions:451, history:{ "2026-07-17":90 }
  });

  await page.evaluate(() => {
    const state = window.__FocusHero.stateRef();
    state.totalFocusMin = 49777;
    state.completedFocusSessions = 451;
    state.history = { "2026-07-17":90, "2026-07-16":120 };
    state.sessionHistory = { "2026-07-17":2, "2026-07-16":3 };
    state.sessionsLog = [{ id:"protected-session", at:"2026-07-17T18:00:00.000Z", minutes:90 }];
    window.saveState({ fromPull:true });
  });
  const protectedBefore = await page.evaluate(() => {
    const s = window.__FocusHero.stateRef();
    return JSON.stringify({ totalFocusMin:s.totalFocusMin, completedFocusSessions:s.completedFocusSessions, history:s.history, sessionHistory:s.sessionHistory, sessionsLog:s.sessionsLog });
  });

  await page.click("#btn-settings");
  await page.selectOption("#cfg-timer-font", "mono");
  await page.selectOption("#cfg-timer-weight", "300");
  await page.evaluate(() => {
    const input = document.querySelector("#cfg-timer-custom-color");
    input.value = "#aabbcc";
    input.dispatchEvent(new Event("input", { bubbles:true }));
  });

  const changed = await page.evaluate(() => {
    const s = window.__FocusHero.stateRef();
    const timer = getComputedStyle(document.querySelector(".timer-display"));
    const preview = getComputedStyle(document.querySelector("#timer-style-preview"));
    return {
      font:s.settings.timerFont,
      weight:s.settings.timerWeight,
      color:s.settings.timerColor,
      custom:s.settings.customTimerColor,
      computedWeight:timer.fontWeight,
      computedColor:timer.color,
      previewColor:preview.color,
      protectedState:JSON.stringify({ totalFocusMin:s.totalFocusMin, completedFocusSessions:s.completedFocusSessions, history:s.history, sessionHistory:s.sessionHistory, sessionsLog:s.sessionsLog })
    };
  });
  assert.equal(changed.font, "mono");
  assert.equal(changed.weight, 300);
  assert.equal(changed.color, "custom");
  assert.equal(changed.custom, "#aabbcc");
  assert.equal(changed.computedWeight, "300");
  assert.equal(changed.computedColor, "rgb(170, 187, 204)");
  assert.equal(changed.previewColor, changed.computedColor);
  assert.equal(changed.protectedState, protectedBefore, "appearance changes must not alter Focus Hero records");
  assert.deepEqual(pageErrors, []);
  console.log("ok - timer appearance, navigation cleanup, recovery placement, and data isolation");
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
