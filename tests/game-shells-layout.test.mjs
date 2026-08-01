import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
let chromium;
for (const candidate of ["playwright", process.env.FOCUS_HERO_PLAYWRIGHT].filter(Boolean)) {
  try {
    ({ chromium } = require(candidate));
    break;
  } catch (_) {}
}
if (!chromium) {
  throw new Error("Playwright is required (set FOCUS_HERO_PLAYWRIGHT to its module path)");
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json"
};

function startServer() {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      const rel = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
      const file = path.resolve(root, `.${rel}`);
      const withinRoot = file === root || file.startsWith(`${root}${path.sep}`);
      if (!withinRoot) throw new Error("path escape");
      const body = await fs.readFile(file);
      res.writeHead(200, {
        "Content-Type": mime[path.extname(file)] || "application/octet-stream",
        "Cache-Control": "no-store"
      });
      res.end(body);
    } catch (_) {
      res.writeHead(404);
      res.end("not found");
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function readNavigationLayout(page, shell, width, height) {
  await page.setViewportSize({ width, height });
  return page.evaluate(async ({ shell, width, height }) => {
    document.documentElement.setAttribute("data-layout", "dashboard");
    window.FHGameShells.setShell(shell);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const nav = document.querySelector(".app-nav");
    const style = getComputedStyle(nav);
    const rect = nav.getBoundingClientRect();
    const visibleButtons = Array.from(nav.querySelectorAll("button")).filter((button) => {
      const buttonRect = button.getBoundingClientRect();
      const buttonStyle = getComputedStyle(button);
      return buttonStyle.display !== "none" && buttonRect.width > 0 && buttonRect.height > 0;
    }).length;

    return {
      display: style.display,
      position: style.position,
      flexDirection: style.flexDirection,
      left: rect.left,
      right: width - rect.right,
      top: rect.top,
      bottom: height - rect.bottom,
      width: rect.width,
      height: rect.height,
      visibleButtons,
      totalButtons: nav.querySelectorAll("button").length
    };
  }, { shell, width, height });
}

function assertVisibleNavigation(layout) {
  assert.equal(layout.display, "flex");
  assert.equal(layout.position, "fixed");
  assert.ok(layout.width > 0, `navigation width was ${layout.width}`);
  assert.ok(layout.height > 0, `navigation height was ${layout.height}`);
  assert.equal(layout.visibleButtons, layout.totalButtons);
  assert.ok(layout.totalButtons > 0);
}

test("Frontier and Tactical navigation is visible and positioned at tablet and desktop widths", async () => {
  const server = await startServer();
  const { port } = server.address();
  const browser = await chromium.launch({ headless: true, channel: "chrome" });

  try {
    const context = await browser.newContext({
      serviceWorkers: "block",
      viewport: { width: 1200, height: 800 }
    });
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === "127.0.0.1") await route.continue();
      else await route.abort();
    });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.FHGameShells && document.querySelector(".app-nav")));

    for (const width of [980, 1200]) {
      const frontierDesktop = await readNavigationLayout(page, "frontier", width, 800);
      assertVisibleNavigation(frontierDesktop);
      assert.equal(frontierDesktop.flexDirection, "column");
      assert.ok(Math.abs(frontierDesktop.left - 14) <= 1, `Frontier left offset was ${frontierDesktop.left}`);
      assert.ok(Math.abs(frontierDesktop.top - 112) <= 1, `Frontier top offset was ${frontierDesktop.top}`);

      const tacticalDesktop = await readNavigationLayout(page, "tactical", width, 800);
      assertVisibleNavigation(tacticalDesktop);
      assert.equal(tacticalDesktop.flexDirection, "column");
      assert.ok(Math.abs(tacticalDesktop.right - 14) <= 1, `Tactical right offset was ${tacticalDesktop.right}`);
      assert.ok(Math.abs(tacticalDesktop.top - 111) <= 1, `Tactical top offset was ${tacticalDesktop.top}`);
    }

    for (const width of [861, 900, 979]) {
      for (const shell of ["frontier", "tactical"]) {
        const tablet = await readNavigationLayout(page, shell, width, 800);
        assertVisibleNavigation(tablet);
        assert.equal(tablet.flexDirection, "row");
        assert.ok(Math.abs(tablet.left - tablet.right) <= 1, `${shell} tablet navigation was not centered`);
        assert.ok(Math.abs(tablet.bottom - 9) <= 1, `${shell} tablet bottom offset was ${tablet.bottom}`);
      }
    }

    await context.close();
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
