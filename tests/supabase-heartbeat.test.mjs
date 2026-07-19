import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { runHeartbeat } from "../.github/scripts/supabase-heartbeat-backup.mjs";

function response(body, { status = 200, headers = {} } = {}) {
  const lowerHeaders = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: key => lowerHeaders.get(String(key).toLowerCase()) || null },
    async text() { return typeof body === "string" ? body : JSON.stringify(body); },
    async json() { return typeof body === "string" ? JSON.parse(body) : body; }
  };
}

async function withFixture(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "focus-hero-heartbeat-"));
  await fs.writeFile(path.join(dir, "focus-hero.html"), [
    'const SUPABASE_URL = "https://fkhzpscihafekhtcyvlt.supabase.co";',
    'const SUPABASE_ANON_KEY = "anon-fixture";',
    ""
  ].join("\n"), "utf8");
  try {
    await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

async function test(name, fn) {
  await fn();
  console.log(`ok - ${name}`);
}

await test("rowCount=0 fails closed and writes metadata-only status", async () => {
  await withFixture(async cwd => {
    const calls = [];
    const status = await runHeartbeat({
      cwd,
      env: { SUPABASE_SERVICE_ROLE_KEY: "service-fixture" },
      now: () => new Date("2026-07-19T10:00:00.000Z"),
      consoleImpl: { log() {}, error() {} },
      fetchImpl: async (url, init = {}) => {
        calls.push({ url, method: init.method || "GET" });
        if (init.method === "HEAD" && url.includes("limit=1")) return response("", { headers: { "content-range": "0-0/0" } });
        if (init.method === "HEAD") return response("", { headers: { "content-range": "*/0" } });
        return response([]);
      }
    });
    const written = JSON.parse(await fs.readFile(path.join(cwd, "backups", "backup-status.json"), "utf8"));
    assert.equal(status.ok, false);
    assert.equal(status.rowCount, 0);
    assert.equal(status.exportedPlayerRows, false);
    assert.match(status.reason, /fails closed/i);
    assert.deepEqual(written, status);
    assert.equal(calls.some(call => call.method !== "HEAD" && call.url.includes("select=id")), false);
  });
});

await test("positive rowCount passes without exporting player rows", async () => {
  await withFixture(async cwd => {
    const status = await runHeartbeat({
      cwd,
      env: { SUPABASE_SERVICE_ROLE_KEY: "service-fixture" },
      now: () => new Date("2026-07-19T10:01:00.000Z"),
      consoleImpl: { log() {}, error() {} },
      fetchImpl: async (url, init = {}) => {
        if (init.method === "HEAD" && url.includes("limit=1")) return response("", { headers: { "content-range": "0-0/4" } });
        if (init.method === "HEAD") return response("", { headers: { "content-range": "*/4" } });
        return response([{ updated_at: "2026-07-18T04:56:00.880363+00:00" }]);
      }
    });
    assert.equal(status.ok, true);
    assert.equal(status.rowCount, 4);
    assert.equal(status.exportedPlayerRows, false);
  });
});
