import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = name => fs.readFileSync(path.join(ROOT, name), "utf8");

const index = read("index.html");
const mirror = read("focus-hero.html");
const serviceWorker = read("sw.js");
const packageContents = read("PACKAGE_CONTENTS.md");
const assetsIgnore = read(".assetsignore");
const pixelSource = read("pixel-avatar.js");

function documentedRuntimeAllowlist() {
  const block = packageContents.match(
    /<!-- PUBLIC_RUNTIME_ALLOWLIST_BEGIN -->([\s\S]*?)<!-- PUBLIC_RUNTIME_ALLOWLIST_END -->/
  )?.[1];
  assert.ok(block, "PACKAGE_CONTENTS.md must contain the marked public runtime allowlist");
  return [...block.matchAll(/^- \x60([^\x60]+)\x60\s*$/gm)].map(match => match[1]);
}

function assetsIgnoreAllowlist() {
  return assetsIgnore
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.startsWith("!") && !line.slice(1).includes("*") && !line.endsWith("/"))
    .map(line => line.slice(1));
}

function serviceWorkerPrecache() {
  const arraySource = serviceWorker.match(/const PRECACHE\s*=\s*(\[[\s\S]*?\]);/)?.[1];
  assert.ok(arraySource, "sw.js must expose a static PRECACHE array");
  return vm.runInNewContext("(" + arraySource + ")");
}

function hasScriptReference(source, file) {
  const escaped = file.replace(/[|\\{}()[\]^$+*?.-]/g, "\\$&");
  return new RegExp(
    "<script\\b[^>]*\\bsrc=[\"'](?:\\./)?" + escaped + "(?:\\?[^\"']*)?[\"'][^>]*>",
    "i"
  ).test(source);
}

test("pixel avatar is the sole packaged avatar runtime and retired renderer files are absent", () => {
  assert.equal(index, mirror, "the two runtime entry files must remain byte-identical");

  const documented = documentedRuntimeAllowlist();
  const allowed = assetsIgnoreAllowlist();
  const precache = serviceWorkerPrecache();

  assert.equal(fs.existsSync(path.join(ROOT, "pixel-avatar.js")), true);
  assert.equal(hasScriptReference(index, "pixel-avatar.js"), true);
  assert.equal(hasScriptReference(mirror, "pixel-avatar.js"), true);
  assert.equal(precache.includes("./pixel-avatar.js"), true);
  assert.equal(documented.includes("pixel-avatar.js"), true);
  assert.equal(allowed.includes("pixel-avatar.js"), true);
  assert.match(index, /pixel-avatar\.js\?v=fh-[^"'<>]+/);
  assert.match(index, /window\.FHPixelAvatar/);
  assert.match(pixelSource, /global\.FHPixelAvatar\s*=\s*api/);

  for (const retiredFile of ["fh3d.js", "three.min.js"]) {
    assert.equal(fs.existsSync(path.join(ROOT, retiredFile)), false, retiredFile + " must be absent from the release tree");
    assert.equal(precache.includes("./" + retiredFile), false, retiredFile + " must be absent from PRECACHE");
    assert.equal(documented.includes(retiredFile), false, retiredFile + " must be absent from PACKAGE_CONTENTS");
    assert.equal(allowed.includes(retiredFile), false, retiredFile + " must be absent from .assetsignore allowlist");
  }

  const runtimeBoundary = [index, mirror, serviceWorker, packageContents, assetsIgnore].join("\n");
  for (const retiredToken of [
    "fh3d.js",
    "three.min.js",
    "window.FH3D",
    "window.THREE",
    "FH3D.",
    "fh3d-canvas",
    "data-fh3d-ready",
    "fhShouldUse3d",
    "fh3dUpdate",
    "fh3dSpec",
    "fh3dStudioOpen",
    "characterPreviewFh3dOptions",
    "cfg-avatar-renderer",
    "VALID_AVATAR_RENDERERS"
  ]) {
    assert.equal(runtimeBoundary.includes(retiredToken), false, "retired runtime token remains: " + retiredToken);
  }
  assert.doesNotMatch(runtimeBoundary, /data-renderer\s*=\s*["']3d["']/i);
});

test("character rebuild catalogs remain packaged while the renderer changes", () => {
  const documented = documentedRuntimeAllowlist();
  const allowed = assetsIgnoreAllowlist();
  const precache = serviceWorkerPrecache();

  for (const retainedFile of ["character-rebuild.js", "character-v86-fix.js"]) {
    assert.equal(fs.existsSync(path.join(ROOT, retainedFile)), true, retainedFile + " must remain in the release tree");
    assert.equal(hasScriptReference(index, retainedFile), true, retainedFile + " must remain referenced by HTML");
    assert.equal(precache.includes("./" + retainedFile), true, retainedFile + " must remain available offline");
    assert.equal(documented.includes(retainedFile), true, retainedFile + " must remain documented");
    assert.equal(allowed.includes(retainedFile), true, retainedFile + " must remain public");
  }

  assert.match(read("character-rebuild.js"), /window\.CR_SPECIES\s*=\s*CR_SPECIES/);
  assert.match(read("character-v86-fix.js"), /window\.V86_SPECIES_PROFILES\s*=\s*V86_SPECIES_PROFILES/);
});

function successfulAssetResponse(request) {
  const raw = typeof request === "string" ? request : request.url;
  const url = new URL(raw, "https://focus.test/");
  const html = url.pathname === "/" || url.pathname.endsWith(".html");
  let contentType = "application/octet-stream";
  if (html) contentType = "text/html; charset=utf-8";
  else if (url.pathname.endsWith(".js")) contentType = "text/javascript; charset=utf-8";
  else if (url.pathname.endsWith(".svg")) contentType = "image/svg+xml";
  else if (url.pathname.endsWith(".png")) contentType = "image/png";
  else if (url.pathname.endsWith(".webmanifest")) contentType = "application/manifest+json";
  return new Response(html ? "<!doctype html><body>ok</body>" : "asset", {
    status: 200,
    headers: { "content-type": contentType }
  });
}

function makeServiceWorkerRuntime() {
  const listeners = new Map();
  const deletions = [];
  const cache = {
    async put() {},
    async match() { return undefined; },
    async delete(key) {
      deletions.push({ kind: "entry", key: String(key) });
      return true;
    }
  };
  const caches = {
    async open() { return cache; },
    async keys() { return ["focus-hero-old-complete", "another-app-cache"]; },
    async delete(name) {
      deletions.push({ kind: "cache", key: String(name) });
      return true;
    }
  };
  const calls = { skipWaiting: 0, claim: 0 };
  const self = {
    registration: {
      scope: "https://focus.test/",
      showNotification() {}
    },
    location: new URL("https://focus.test/"),
    clients: {
      async claim() { calls.claim += 1; },
      async matchAll() { return []; },
      async openWindow() {}
    },
    async skipWaiting() { calls.skipWaiting += 1; },
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(handler);
    }
  };
  const context = {
    self,
    caches,
    fetch: successfulAssetResponse,
    URL,
    Request,
    Response,
    Headers,
    Blob,
    console,
    setTimeout,
    clearTimeout
  };
  vm.createContext(context);
  vm.runInContext(serviceWorker, context, { filename: "sw.js" });

  async function dispatch(type, data = {}) {
    const waits = [];
    const event = Object.assign({}, data, {
      waitUntil(promise) { waits.push(Promise.resolve(promise)); },
      respondWith() {}
    });
    for (const handler of listeners.get(type) || []) handler(event);
    await Promise.all(waits);
  }

  return { calls, deletions, dispatch };
}

test("service-worker install and activate never delete app caches", async () => {
  assert.doesNotMatch(
    serviceWorker,
    /\bcaches\s*\.\s*delete\s*\(/,
    "the runtime service worker must not programmatically delete a cache"
  );

  const runtime = makeServiceWorkerRuntime();
  await runtime.dispatch("install");
  assert.deepEqual(runtime.deletions, [], "install must preserve every prior complete cache");
  assert.equal(runtime.calls.skipWaiting, 1);

  await runtime.dispatch("activate");
  assert.deepEqual(runtime.deletions, [], "activate must preserve every prior complete cache");
  assert.equal(runtime.calls.claim, 1);
});
