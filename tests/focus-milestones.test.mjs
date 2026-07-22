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

let passed = 0;
async function test(name, fn){
  await fn();
  passed += 1;
  console.log(`ok ${passed} - ${name}`);
}

async function resetFixture(){
  await page.evaluate(() => {
    const fh = window.__FocusHero;
    const current = fh.stateRef();
    const fresh = fh.migrate(JSON.parse(JSON.stringify(fh.DEFAULTS)));
    Object.keys(current).forEach(key => delete current[key]);
    Object.assign(current, fresh);
    current.sync.enabled = false;
    current.settings.monthlyBackup = false;
    fh.clearAchievementBannerQueue?.();
    document.querySelectorAll(".fh76-ach-banner").forEach(node => node.remove());
    if (window.schedulePendingFocusMilestoneAnnouncement?._timer){
      clearTimeout(window.schedulePendingFocusMilestoneAnnouncement._timer);
      window.schedulePendingFocusMilestoneAnnouncement._timer = null;
    }
    window.saveState({ fromPull:true, suppressMilestoneAnnouncement:true });
    window.renderAll();
  });
}

try {
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil:"domcontentloaded" });
  await page.waitForFunction(() => window.__FocusHero?.reconcileFocusMilestones && document.getElementById("trophy-room"));

  await test("threshold math is exact at every 60,000 minutes", async () => {
    const values = await page.evaluate(() => {
      const f = window.__FocusHero.focusMilestonesEligible;
      return [f(59999), f(60000), f(119999), f(120000), f(180000)];
    });
    assert.deepEqual(values, [0,1,1,2,3]);
  });

  await test("v15 migration backfills rings silently without changing player accounting", async () => {
    const result = await page.evaluate(() => {
      const fh = window.__FocusHero;
      const raw = JSON.parse(JSON.stringify(fh.DEFAULTS));
      raw.dataVersion = 15;
      delete raw.focusMilestones;
      raw.totalFocusMin = 60000;
      raw.history = { "2026-07-21":60000 };
      raw.sessionsLog = [{ id:"kept", type:"focus", minutes:25, at:Date.now() }];
      raw.hero.level = 9;
      raw.hero.xp = 321;
      raw.coins = 88;
      raw.lootOwned = { "kept-loot":2 };
      const before = {
        totalFocusMin:raw.totalFocusMin, history:JSON.stringify(raw.history),
        sessionsLog:JSON.stringify(raw.sessionsLog), level:raw.hero.level,
        xp:raw.hero.xp, coins:raw.coins, lootOwned:JSON.stringify(raw.lootOwned)
      };
      const migrated = fh.migrate(raw);
      return {
        before,
        after:{
          totalFocusMin:migrated.totalFocusMin, history:JSON.stringify(migrated.history),
          sessionsLog:JSON.stringify(migrated.sessionsLog), level:migrated.hero.level,
          xp:migrated.hero.xp, coins:migrated.coins, lootOwned:JSON.stringify(migrated.lootOwned)
        },
        room:migrated.focusMilestones,
        version:migrated.dataVersion
      };
    });
    assert.deepEqual(result.after, result.before);
    assert.equal(result.version, 16);
    assert.deepEqual(
      { claimedThrough:result.room.claimedThrough, announcedThrough:result.room.announcedThrough },
      { claimedThrough:1, announcedThrough:1 }
    );
  });

  await test("legacy Beyond Measure preserves Ring #1 even after a later correction below 1,000h", async () => {
    const room = await page.evaluate(() => {
      const fh = window.__FocusHero;
      const raw = JSON.parse(JSON.stringify(fh.DEFAULTS));
      raw.dataVersion = 15;
      delete raw.focusMilestones;
      raw.totalFocusMin = 59000;
      raw.achievements.hours_1000 = 123456;
      return fh.migrate(raw).focusMilestones;
    });
    assert.equal(room.claimedThrough, 1);
    assert.equal(room.announcedThrough, 1);
  });

  await test("earned rings are permanent, idempotent, and advance once at the next threshold", async () => {
    const result = await page.evaluate(() => {
      const fh = window.__FocusHero;
      const s = fh.migrate(JSON.parse(JSON.stringify(fh.DEFAULTS)));
      s.totalFocusMin = 60000;
      const first = fh.reconcileFocusMilestones(s);
      const duplicate = fh.reconcileFocusMilestones(s);
      s.totalFocusMin = 59999;
      const corrected = fh.reconcileFocusMilestones(s);
      s.totalFocusMin = 120000;
      const second = fh.reconcileFocusMilestones(s);
      return { first, duplicate, corrected, second, room:s.focusMilestones };
    });
    assert.equal(result.first.newlyEarned, 1);
    assert.equal(result.duplicate.newlyEarned, 0);
    assert.equal(result.corrected.claimedThrough, 1);
    assert.equal(result.second.newlyEarned, 1);
    assert.equal(result.room.claimedThrough, 2);
  });

  await test("cloud merge uses max/union semantics and backfills legacy totals", async () => {
    const result = await page.evaluate(() => {
      const fh = window.__FocusHero;
      const base = () => fh.migrate(JSON.parse(JSON.stringify(fh.DEFAULTS)));
      const local = base();
      local.totalFocusMin = 59000;
      local.focusMilestones = { version:1, claimedThrough:2, announcedThrough:2 };
      const remote = base();
      remote.totalFocusMin = 60000;
      delete remote.focusMilestones;
      const merged = fh.mergeRemoteState(local, remote);
      const reverse = fh.mergeRemoteState(remote, local);
      const repeated = fh.mergeRemoteState(merged, remote);
      return {
        forward:merged.focusMilestones.claimedThrough,
        reverse:reverse.focusMilestones.claimedThrough,
        repeated:repeated.focusMilestones.claimedThrough,
        total:merged.totalFocusMin
      };
    });
    assert.deepEqual(result, { forward:2, reverse:2, repeated:2, total:60000 });
  });

  await test("artifact catalog is deterministic, unique, and preserves the flagship copy", async () => {
    const result = await page.evaluate(() => {
      const f = window.__FocusHero.focusArtifactSpec;
      const specs = Array.from({ length:1000 }, (_,i) => f(i+1));
      const again = f(1);
      return {
        first:{ id:again.id, name:again.name, title:again.title, slogan:again.slogan, form:again.form },
        ids:new Set(specs.map(x=>x.id)).size,
        names:new Set(specs.map(x=>x.name)).size,
        slogans:new Set(specs.map(x=>x.slogan)).size,
        signatures:new Set(specs.map(x=>x.visualSignature)).size,
        adjacentFormsDiffer:specs.every((x,i)=>i===0 || x.form!==specs[i-1].form),
        firstCycleForms:new Set(specs.slice(0,10).map(x=>x.form)).size,
        sameFormNextCycleChanged:specs[0].form===specs[10].form
          && specs[0].palette.accent!==specs[10].palette.accent
          && specs[0].visualSignature!==specs[10].visualSignature
      };
    });
    assert.deepEqual(result.first, {
      id:"focus-artifact-v1-1", name:"First Light Signet",
      title:"Keeper of the First Thousand",
      slogan:"A thousand hours, chosen one minute at a time.", form:"signet"
    });
    assert.equal(result.ids, 1000);
    assert.equal(result.names, 1000);
    assert.equal(result.slogans, 1000);
    assert.equal(result.signatures, 1000);
    assert.equal(result.adjacentFormsDiffer, true);
    assert.equal(result.firstCycleForms, 10);
    assert.equal(result.sameFormNextCycleChanged, true);
  });

  await test("Trophy Room renders the named vector artifact and no emoji navigation", async () => {
    await resetFixture();
    const result = await page.evaluate(() => {
      const fh = window.__FocusHero;
      const s = fh.stateRef();
      s.totalFocusMin = 60000;
      s.focusMilestones = { version:1, claimedThrough:1, announcedThrough:1 };
      window.renderAll();
      document.querySelector('[data-tab="trophies"]')?.click();
      const tab = document.querySelector('[data-tab="trophies"]');
      const panel = document.getElementById("tab-trophies");
      return {
        tabText:tab?.textContent?.trim(),
        panelText:panel?.textContent || "",
        cards:panel?.querySelectorAll(".focus-artifact-card").length || 0,
        svgs:panel?.querySelectorAll("svg").length || 0,
        hidden:panel?.hidden,
        roomLabel:panel?.querySelector("#trophy-room")?.getAttribute("aria-label") || "",
        listRole:panel?.querySelector(".trophy-grid")?.getAttribute("role") || "",
        listLabel:panel?.querySelector(".trophy-grid")?.getAttribute("aria-label") || "",
        listItems:panel?.querySelectorAll('.focus-artifact-card[role="listitem"]').length || 0,
        pictographic:/\p{Extended_Pictographic}/u.test(tab?.textContent || "")
      };
    });
    assert.equal(result.tabText, "Trophy Room");
    assert.equal(result.hidden, false);
    assert.equal(result.cards, 1);
    assert.equal(result.roomLabel, "Focus milestone Trophy Room");
    assert.equal(result.listRole, "list");
    assert.equal(result.listLabel, "Earned focus milestone artifacts");
    assert.equal(result.listItems, 1);
    assert.ok(result.svgs >= 2);
    assert.match(result.panelText, /First Light Signet/);
    assert.match(result.panelText, /Keeper of the First Thousand/);
    assert.match(result.panelText, /A thousand hours, chosen one minute at a time/);
    assert.match(result.panelText, /Artifact #1 · 1,000h/);
    assert.equal(result.pictographic, false);
  });

  await test("Trophy Room reports the exact remaining minutes near a ring threshold", async () => {
    await resetFixture();
    const result = await page.evaluate(() => {
      const fh = window.__FocusHero;
      const s = fh.stateRef();
      s.totalFocusMin = 59999;
      s.focusMilestones = { version:1, claimedThrough:0, announcedThrough:0 };
      fh.reconcileFocusMilestones(s);
      window.renderAll();
      document.querySelector('[data-tab="trophies"]')?.click();
      return document.getElementById("trophy-room")?.textContent || "";
    });
    assert.match(result, /1m to First Light Signet/);
    assert.doesNotMatch(result, /1h to First Light Signet/);
  });

  await test("simultaneous mythic and gold unlocks queue below phone chrome without warning red", async () => {
    await page.setViewportSize({ width:390, height:844 });
    await resetFixture();
    const result = await page.evaluate(async () => {
      const fh = window.__FocusHero;
      fh.showAchievementBanner("Beyond Measure", "mythic", "hours_1000");
      fh.showAchievementBanner("Master", "gold", "level_50");
      await new Promise(resolve => setTimeout(resolve, 80));
      const first = document.querySelector(".fh76-ach-banner");
      const firstSnapshot = {
        count:document.querySelectorAll(".fh76-ach-banner").length,
        text:first?.textContent || "",
        top:first?.getBoundingClientRect().top || 0,
        background:first ? getComputedStyle(first).backgroundImage : ""
      };
      fh.dismissAchievementBanner();
      await new Promise(resolve => setTimeout(resolve, 100));
      const second = document.querySelector(".fh76-ach-banner");
      const secondSnapshot = {
        count:document.querySelectorAll(".fh76-ach-banner").length,
        text:second?.textContent || "",
        top:second?.getBoundingClientRect().top || 0,
        background:second ? getComputedStyle(second).backgroundImage : ""
      };
      fh.clearAchievementBannerQueue();
      return { first:firstSnapshot, second:secondSnapshot };
    });
    assert.equal(result.first.count, 1);
    assert.match(result.first.text, /Beyond Measure/i);
    assert.match(result.first.text, /First Light Signet/);
    assert.match(result.first.text, /Keeper of the First Thousand/);
    assert.ok(result.first.top >= 104);
    assert.doesNotMatch(result.first.background, /180,\s*83,\s*9/);
    assert.equal(result.second.count, 1);
    assert.match(result.second.text, /Master/);
    assert.ok(result.second.top >= 104);
    assert.doesNotMatch(result.second.background, /180,\s*83,\s*9/);
    await page.setViewportSize({ width:1280, height:800 });
  });

  await test("artifact milestones and later achievements share one dismissible queue", async () => {
    await resetFixture();
    const result = await page.evaluate(async () => {
      const fh = window.__FocusHero;
      fh.showFocusMilestoneBanner(2, 2);
      fh.showAchievementBanner("Master", "gold", "level_50");
      await new Promise(resolve => setTimeout(resolve, 80));
      const first = document.querySelector(".fh76-ach-banner");
      const firstSnapshot = {
        count:document.querySelectorAll(".fh76-ach-banner").length,
        text:first?.textContent || "",
        dismissible:!!first?.querySelector(".achievement-banner-dismiss")
      };
      first?.querySelector(".achievement-banner-dismiss")?.click();
      await new Promise(resolve => setTimeout(resolve, 100));
      const second = document.querySelector(".fh76-ach-banner");
      const secondSnapshot = {
        count:document.querySelectorAll(".fh76-ach-banner").length,
        text:second?.textContent || ""
      };
      fh.clearAchievementBannerQueue();
      return {
        first:firstSnapshot,
        second:secondSnapshot,
        afterClear:document.querySelectorAll(".fh76-ach-banner").length
      };
    });
    assert.equal(result.first.count, 1);
    assert.match(result.first.text, /Twin-Flame Lantern earned/i);
    assert.equal(result.first.dismissible, true);
    assert.equal(result.second.count, 1);
    assert.match(result.second.text, /Master/i);
    assert.equal(result.afterClear, 0);
  });

  await test("Trophy Room stays within 320px and 390px mobile viewports", async () => {
    for (const width of [320,390]){
      await page.setViewportSize({ width, height:844 });
      await resetFixture();
      const result = await page.evaluate(() => {
        const s = window.__FocusHero.stateRef();
        s.totalFocusMin = 60000;
        s.focusMilestones = { version:1, claimedThrough:1, announcedThrough:1 };
        window.renderAll();
        document.querySelector('[data-tab="trophies"]')?.click();
        const room = document.getElementById("trophy-room");
        const hero = room?.querySelector(".trophy-room-hero");
        const copy = room?.querySelector(".trophy-room-copy");
        const card = room?.querySelector(".focus-artifact-card");
        return {
          viewport:document.documentElement.clientWidth,
          roomClient:room?.clientWidth || 0, roomScroll:room?.scrollWidth || 0,
          heroClient:hero?.clientWidth || 0, heroScroll:hero?.scrollWidth || 0,
          copyClient:copy?.clientWidth || 0, copyScroll:copy?.scrollWidth || 0,
          cardClient:card?.clientWidth || 0, cardScroll:card?.scrollWidth || 0
        };
      });
      assert.ok(result.viewport <= width);
      assert.ok(result.roomScroll <= result.roomClient);
      assert.ok(result.heroScroll <= result.heroClient);
      assert.ok(result.copyScroll <= result.copyClient);
      assert.ok(result.cardScroll <= result.cardClient);
    }
    await page.setViewportSize({ width:1280, height:800 });
  });

  await test("achievement banners respect reduced-motion preferences", async () => {
    await resetFixture();
    await page.emulateMedia({ reducedMotion:"reduce" });
    const animationName = await page.evaluate(() => {
      const fh = window.__FocusHero;
      fh.showAchievementBanner("Master", "gold", "level_50");
      const banner = document.querySelector(".fh76-ach-banner");
      const value = banner ? getComputedStyle(banner).animationName : "missing";
      fh.clearAchievementBannerQueue();
      return value;
    });
    assert.equal(animationName, "none");
    await page.emulateMedia({ reducedMotion:"no-preference" });
  });

  await test("a normal 1-minute ledger crossing still unlocks Beyond Measure exactly once", async () => {
    await resetFixture();
    const result = await page.evaluate(async () => {
      const fh = window.__FocusHero;
      const s = fh.stateRef();
      const task = fh.createTask({ name:"Threshold", emoji:"" });
      document.querySelectorAll(".fh76-ach-banner").forEach(node => node.remove());
      s.totalFocusMin = 59999;
      s.history = {};
      s.focusMilestones = { version:1, claimedThrough:0, announcedThrough:0 };
      delete s.achievements.hours_1000;
      for (const meta of fh.ACHIEVEMENTS_V76){
        const threshold = Number(meta?.[5]?.totalMin);
        if (threshold > 0 && threshold < 60000) s.achievements[meta[0]] = 1;
      }
      const totalXp = () => {
        let total = s.hero.xp;
        for (let level=1; level<s.hero.level; level++) total += Math.floor(100 * Math.pow(level, 1.35));
        return total;
      };
      const before = {
        xp:totalXp(), coins:s.coins,
        loot:JSON.stringify(s.lootOwned), eggs:JSON.stringify(s.eggs)
      };
      const applied = window.applyTaskTimeAdjustment(task.id, 1);
      await new Promise(resolve => setTimeout(resolve, 450));
      return {
        ok:applied?.ok, total:s.totalFocusMin,
        claimed:s.focusMilestones.claimedThrough,
        announced:s.focusMilestones.announcedThrough,
        achievement:!!s.achievements.hours_1000,
        xpGain:totalXp()-before.xp,
        noFloorRewards:s.coins===before.coins && JSON.stringify(s.lootOwned)===before.loot && JSON.stringify(s.eggs)===before.eggs,
        beyondBanners:[...document.querySelectorAll(".fh76-ach-banner:not(.focus-ring-banner)")].filter(node=>/Beyond Measure/i.test(node.textContent||"")).length,
        ringBanners:document.querySelectorAll(".focus-ring-banner").length
      };
    });
    assert.deepEqual(result, {
      ok:true, total:60000, claimed:1, announced:1, achievement:true,
      xpGain:2500, noFloorRewards:true, beyondBanners:1, ringBanners:0
    });
  });

  await test("a time-only ledger crossing earns one ring but not a duplicate celebration", async () => {
    await resetFixture();
    const result = await page.evaluate(async () => {
      const fh = window.__FocusHero;
      const s = fh.stateRef();
      const task = fh.createTask({ name:"Life", emoji:"" });
      task.timeOnly = true;
      s.totalFocusMin = 59990;
      s.history = {};
      s.achievements = {};
      for (const meta of fh.ACHIEVEMENTS_V76){
        const threshold = Number(meta?.[5]?.totalMin);
        if (threshold > 0 && threshold < 60000) s.achievements[meta[0]] = 1;
      }
      s.focusMilestones = { version:1, claimedThrough:0, announcedThrough:0 };
      const beforeXp = { level:s.hero.level, xp:s.hero.xp };
      const applied = window.applyTaskTimeAdjustment(task.id, 10);
      await new Promise(resolve => setTimeout(resolve, 450));
      return {
        ok:applied?.ok,
        total:s.totalFocusMin,
        ring:s.focusMilestones.claimedThrough,
        announced:s.focusMilestones.announcedThrough,
        achievement:!!s.achievements.hours_1000,
        xpUnchanged:s.hero.level === beforeXp.level && s.hero.xp === beforeXp.xp,
        achievementBanners:document.querySelectorAll(".fh76-ach-banner:not(.focus-ring-banner)").length,
        bannerText:[...document.querySelectorAll(".fh76-ach-banner:not(.focus-ring-banner)")].map(node=>node.textContent || ""),
        ringBanners:document.querySelectorAll(".focus-ring-banner").length
      };
    });
    assert.equal(result.ok, true);
    assert.equal(result.total, 60000);
    assert.equal(result.ring, 1);
    assert.equal(result.announced, 1);
    assert.equal(result.achievement, true);
    assert.equal(result.xpUnchanged, true);
    assert.ok(result.achievementBanners >= 1);
    assert.ok(result.bannerText.some(text => /Beyond Measure/i.test(text)));
    assert.equal(result.ringBanners, 0);
  });

  await test("Artifact #2 gets one persistent-room announcement and no gameplay reward", async () => {
    await resetFixture();
    const result = await page.evaluate(async () => {
      const fh = window.__FocusHero;
      const s = fh.stateRef();
      const task = fh.createTask({ name:"Life", emoji:"" });
      task.timeOnly = true;
      s.totalFocusMin = 119990;
      s.history = {};
      s.focusMilestones = { version:1, claimedThrough:1, announcedThrough:1 };
      for (const meta of fh.ACHIEVEMENTS_V76){
        if (meta?.[5]?.totalMin) s.achievements[meta[0]] = 1;
      }
      const before = {
        level:s.hero.level, xp:s.hero.xp, coins:s.coins,
        loot:JSON.stringify(s.lootOwned), eggs:JSON.stringify(s.eggs)
      };
      const applied = window.applyTaskTimeAdjustment(task.id, 10);
      await new Promise(resolve => setTimeout(resolve, 350));
      const firstCount = document.querySelectorAll(".focus-ring-banner").length;
      const ringBanner = document.querySelector(".focus-ring-banner");
      const firstText = ringBanner?.textContent || "";
      const animationDelay = ringBanner ? getComputedStyle(ringBanner).animationDelay : "";
      window.saveState({ fromPull:true });
      await new Promise(resolve => setTimeout(resolve, 250));
      return {
        ok:applied?.ok, total:s.totalFocusMin,
        claimed:s.focusMilestones.claimedThrough,
        announced:s.focusMilestones.announcedThrough,
        firstCount, firstText, animationDelay,
        afterSaveCount:document.querySelectorAll(".focus-ring-banner").length,
        unchanged:s.hero.level===before.level && s.hero.xp===before.xp && s.coins===before.coins
          && JSON.stringify(s.lootOwned)===before.loot && JSON.stringify(s.eggs)===before.eggs
      };
    });
    assert.equal(result.ok, true);
    assert.equal(result.total, 120000);
    assert.equal(result.claimed, 2);
    assert.equal(result.announced, 2);
    assert.equal(result.firstCount, 1);
    assert.equal(result.afterSaveCount, 1);
    assert.match(result.firstText, /Twin-Flame Lantern earned/i);
    assert.match(result.firstText, /Bearer of the Second Flame/);
    assert.match(result.firstText, /Discipline burns brighter/);
    assert.match(result.animationDelay, /8\.1s/);
    assert.equal(result.unchanged, true);
  });

  await test("artifact milestone state survives a local reload", async () => {
    await resetFixture();
    await page.evaluate(() => {
      const fh = window.__FocusHero;
      const s = fh.stateRef();
      s.totalFocusMin = 120000;
      fh.reconcileFocusMilestones(s);
      s.focusMilestones.announcedThrough = s.focusMilestones.claimedThrough;
      window.saveState({ fromPull:true, suppressMilestoneAnnouncement:true });
    });
    await page.reload({ waitUntil:"domcontentloaded" });
    await page.waitForFunction(() => window.__FocusHero?.stateRef);
    const result = await page.evaluate(() => ({
      total:window.__FocusHero.stateRef().totalFocusMin,
      ring:window.__FocusHero.stateRef().focusMilestones.claimedThrough,
      cards:document.querySelectorAll(".focus-artifact-card").length,
      names:[...document.querySelectorAll(".focus-artifact-name")].map(node=>node.textContent)
    }));
    assert.deepEqual(result, { total:120000, ring:2, cards:2, names:["Twin-Flame Lantern","First Light Signet"] });
  });

  assert.deepEqual(pageErrors, [], pageErrors.join("\n"));
  console.log(`passed ${passed}/${passed}`);
} finally {
  await context.close();
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
