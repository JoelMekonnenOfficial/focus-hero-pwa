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
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://127.0.0.1");
    const rel = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const file = path.resolve(root, `.${rel}`);
    if (!file.startsWith(root)) throw new Error("path escape");
    const body = await fs.readFile(file);
    const ext = path.extname(file);
    const type = ext === ".html" ? "text/html; charset=utf-8"
      : ext === ".js" ? "text/javascript; charset=utf-8"
      : ext === ".svg" ? "image/svg+xml"
      : ext === ".png" ? "image/png"
      : ext === ".webmanifest" ? "application/manifest+json"
      : "application/octet-stream";
    res.writeHead(200, { "Content-Type":type, "Cache-Control":"no-store" });
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

try {
  await page.goto(`http://127.0.0.1:${port}/?test=1`, { waitUntil:"domcontentloaded" });
  await page.waitForSelector(".test-banner .hdr", { timeout:60_000 });
  const header = (await page.locator(".test-banner .hdr").textContent()) || "";
  const failures = await page.locator(".test-banner .fail").allTextContents();
  assert.match(header, /smoke tests — \d+\/\d+ passing/);
  assert.deepEqual(failures, []);
  assert.deepEqual(pageErrors, []);
  console.log(`ok - ${header}`);
} finally {
  await context.close();
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
