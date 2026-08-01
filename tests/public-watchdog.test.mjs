import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflows = path.join(root, ".github", "workflows");
const files = fs.readdirSync(workflows).filter(name => /\.ya?ml$/i.test(name));
const watchdogPath = path.join(workflows, "public-watchdog.yml");
const watchdog = fs.readFileSync(watchdogPath, "utf8");
const allWorkflowSource = files.map(name => fs.readFileSync(path.join(workflows, name), "utf8")).join("\n");

test("only the public read-only watchdog is packaged", () => {
  assert.deepEqual(files, ["public-watchdog.yml"]);
  assert.match(watchdog, /permissions:\s*\n\s*contents:\s*read/);
  assert.match(watchdog, /https:\/\/focus\.joelmekonnen\.com/);
  assert.match(watchdog, /curl --fail/);
  assert.match(watchdog, /manifest\.webmanifest/);
  assert.match(watchdog, /sw\.js/);
});

test("packaged workflows cannot write, deploy, or use privileged/private authority", () => {
  assert.doesNotMatch(allWorkflowSource, /contents:\s*write/i);
  assert.doesNotMatch(allWorkflowSource, /\bgit\s+push\b/i);
  assert.doesNotMatch(allWorkflowSource, /\bwrangler\b|cloudflare.*token/i);
  assert.doesNotMatch(allWorkflowSource, /service[_-]?role|secrets\.|players\?/i);
  assert.doesNotMatch(allWorkflowSource, /^\s*push:\s*$/m);
});

test("retired private heartbeat and automatic deploy artifacts are absent", () => {
  assert.equal(fs.existsSync(path.join(workflows, "deploy.yml")), false);
  assert.equal(fs.existsSync(path.join(workflows, "supabase-heartbeat.yml")), false);
  assert.equal(fs.existsSync(path.join(root, ".github", "scripts", "supabase-heartbeat-backup.mjs")), false);
  assert.equal(fs.existsSync(path.join(root, "backups", "backup-status.json")), false);
});
