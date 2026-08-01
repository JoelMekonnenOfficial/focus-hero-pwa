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
const manifest = JSON.parse(read("manifest.webmanifest"));
const readme = read("README.md");
const packageContents = read("PACKAGE_CONTENTS.md");
const assetsIgnore = read(".assetsignore");

function documentedRuntimeAllowlist() {
  const block = packageContents.match(
    /<!-- PUBLIC_RUNTIME_ALLOWLIST_BEGIN -->([\s\S]*?)<!-- PUBLIC_RUNTIME_ALLOWLIST_END -->/
  )?.[1];
  assert.ok(block, "PACKAGE_CONTENTS.md must contain the marked public runtime allowlist");
  return [...block.matchAll(/^- `([^`]+)`\s*$/gm)].map(match => match[1]);
}

function assetsIgnoreAllowlist() {
  return assetsIgnore
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(
      line =>
        line.startsWith("!") &&
        !line.slice(1).includes("*") &&
        !line.endsWith("/"),
    )
    .map(line => line.slice(1));
}

function normalizedLocalReference(value) {
  if (!value || /^(?:[a-z]+:|#|data:)/i.test(value)) return null;
  const clean = value.split(/[?#]/, 1)[0].replace(/^\.\//, "").replace(/^\//, "");
  return clean || "index.html";
}

function htmlRuntimeReferences(source) {
  const refs = [];
  for (const match of source.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)) refs.push(match[1]);
  for (const match of source.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["']/gi)) refs.push(match[1]);
  for (const match of source.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']/gi)) refs.push(match[1]);
  return refs.map(normalizedLocalReference).filter(Boolean);
}

function serviceWorkerPrecache() {
  const source = serviceWorker.match(/const PRECACHE\s*=\s*(\[[\s\S]*?\]);/)?.[1];
  assert.ok(source, "sw.js must expose a static PRECACHE array");
  return vm.runInNewContext(`(${source})`).map(normalizedLocalReference);
}

test("entry files are byte-identical and version markers agree", () => {
  assert.equal(index, mirror, "index.html and focus-hero.html must remain exact mirrors");

  const documentedVersion = readme.match(/^# Focus Hero v(\d+\.\d+\.\d+)/m)?.[1];
  assert.ok(documentedVersion, "README must identify the candidate version");
  assert.equal(manifest.version, documentedVersion);

  const dashedVersion = documentedVersion.replace(/\./g, "-");
  const buildId = serviceWorker.match(/const BUILD_ID\s*=\s*"([^"]+)"/)?.[1] || "";
  assert.match(buildId, new RegExp(`v${dashedVersion}(?:-|$)`));

  const rendererQuery = index.match(/pixel-avatar\.js\?v=([^"'<>]+)/)?.[1] || "";
  assert.match(
    rendererQuery,
    new RegExp(`v${dashedVersion}(?:-|$)`),
    "the pixel-renderer query must change with a renderer-affecting candidate so HTTP caches cannot serve the prior build"
  );
});

test("public runtime is deny-by-default and matches the documented allowlist", () => {
  const firstRule = assetsIgnore
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(line => line && !line.startsWith("#"));
  assert.equal(firstRule, "*", ".assetsignore must start by denying every public asset");

  const documented = documentedRuntimeAllowlist();
  const allowed = assetsIgnoreAllowlist();
  assert.deepEqual(new Set(allowed), new Set(documented));
  assert.equal(allowed.length, new Set(allowed).size, "public allowlist entries must be unique");

  for (const prohibited of [
    "prototype-v2.html",
    "sw-v5.js",
    "v7.6-migration-test.js",
    "__v8.3-deploy.ps1",
    "__v8.3-deploy.patch",
    "__test_write.txt"
  ]) {
    assert.equal(allowed.includes(prohibited), false, `${prohibited} must never be a public asset`);
  }

  for (const requiredPattern of [
    ".github/**",
    "tests/**",
    "backups/**",
    ".env*",
    ".dev.vars*",
    "*.zip",
    "*recovery*",
    "*snapshot*",
    "*fixture*"
  ]) {
    assert.match(assetsIgnore, new RegExp(`^${requiredPattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"));
  }
});

test("HTML and manifest runtime references are allowlisted and fully precached", () => {
  const allowed = new Set(documentedRuntimeAllowlist());
  const refs = new Set(htmlRuntimeReferences(index));

  refs.add(normalizedLocalReference(manifest.start_url));
  for (const icon of manifest.icons || []) refs.add(normalizedLocalReference(icon.src));
  for (const shortcut of manifest.shortcuts || []) refs.add(normalizedLocalReference(shortcut.url));
  refs.delete(null);

  for (const ref of refs) {
    assert.equal(allowed.has(ref), true, `${ref} is referenced by the app but absent from the public allowlist`);
  }

  const precache = serviceWorkerPrecache();
  assert.equal(precache.length, new Set(precache).size, "service-worker precache entries must be unique");
  assert.deepEqual(
    new Set(precache),
    new Set([...allowed].filter(file => file !== "sw.js")),
    "every public runtime file except the service worker itself must be in the complete offline shell"
  );
});

test("blocked-candidate README contains no live-cloud or public-deployment recipe", () => {
  assert.match(readme, /DO NOT DEPLOY OR USE THIS CANDIDATE WITH A CURRENT PLAYER PROFILE/);
  assert.match(readme, /source inspection and synthetic testing only/i);
  assert.match(readme, /127\.0\.0\.1/);
  assert.match(readme, /Do not connect it to production cloud data/i);
  assert.match(readme, /PACKAGE_CONTENTS\.md/);

  for (const forbidden of [
    /create policy/i,
    /SUPABASE_SERVICE_ROLE_KEY/,
    /YOUR-PROJECT\.supabase/i,
    /Netlify Drop/i,
    /GitHub Pages/i,
    /wrangler deploy/i,
    /git push/i,
    /60-second setup/i
  ]) {
    assert.doesNotMatch(readme, forbidden);
  }
});

test("package guide excludes automation, private data, legacy builds, and stale archives", () => {
  for (const required of [
    /\.github/,
    /scheduled writers/,
    /credentials/,
    /browser profiles/,
    /recovery records/,
    /supabase-heartbeat\.test\.mjs/,
    /supabase-heartbeat-backup\.mjs/,
    /prototype-v2\.html/,
    /sw-v5\.js/,
    /v7\.6-migration-test\.js/,
    /focus-hero-v10-9-review\.zip/,
    /SHA-256/,
    /explicit allowlist/
  ]) {
    assert.match(packageContents, required);
  }
});
