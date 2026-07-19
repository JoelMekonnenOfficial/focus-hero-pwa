import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

/* Focus Hero - Supabase heartbeat + backup-readiness check (v3).
 *
 * IMPORTANT: this repository is public. Never export player rows, encrypted
 * blobs, row ids, secret hashes, or any other user record into the checkout.
 * The service key is used only for read-only metadata checks (row count and
 * newest updated_at), and only those aggregates are written to git.
 *
 * Rules:
 *   1. Missing SUPABASE_SERVICE_ROLE_KEY  -> exit 1 (loud red run).
 *   2. Any fetch failure                   -> exit 1.
 *   3. ALWAYS writes backups/backup-status.json with ranAt, ok, reason,
 *      rowCount, maxUpdatedAt - so an external watcher can verify cloud
 *      persistence is visible and fresh without exposing player data.
 *   4. rowCount 0 fails closed. A linked production app should have protected
 *      metadata-visible rows; zero rows means the monitoring signal is unsafe.
 */

const APP_FILE = "focus-hero.html";
const STATUS_FILE = "backups/backup-status.json";
const EXPECTED_PROJECT_REF = process.env.EXPECTED_SUPABASE_PROJECT_REF || "fkhzpscihafekhtcyvlt";

function readConst(source, name) {
    const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*\"([^\"]*)\"`));
    if (!match || !match[1]) throw new Error(`Missing ${name} in ${APP_FILE}`);
    return match[1];
}

async function supabaseRequest(url, key, restPath, init = {}, fetchImpl = fetch) {
    const resp = await fetchImpl(`${url}/rest/v1/${restPath}`, {
          ...init,
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            Accept: "application/json",
            ...(init.headers || {})
          }
    });
    if (!resp.ok) {
          const body = await resp.text().catch(() => "");
          throw new Error(`Supabase ${resp.status}: ${body.slice(0, 300)}`);
    }
    return resp;
}

async function supabaseFetch(url, key, restPath, init, fetchImpl) {
    const resp = await supabaseRequest(url, key, restPath, init, fetchImpl);
    return resp.json();
}

async function readPlayerMetadata(url, key, fetchImpl = fetch) {
    // HEAD + count=exact returns only Content-Range; no row body leaves Supabase.
    const countResp = await supabaseRequest(url, key, "players?select=id", {
      method: "HEAD",
      headers: { Prefer: "count=exact" }
    }, fetchImpl);
    const range = countResp.headers.get("content-range") || "";
    const countMatch = range.match(/\/(\d+)$/);
    if (!countMatch) throw new Error("Supabase row count missing from Content-Range");

    // Fetch only the newest timestamp. No id, state blob, or secret hash.
    const latestRows = await supabaseFetch(
      url,
      key,
      "players?select=updated_at&order=updated_at.desc&limit=1",
      undefined,
      fetchImpl
    );
    return {
      rowCount: Number(countMatch[1]),
      maxUpdatedAt: Array.isArray(latestRows) && latestRows.length
        ? latestRows[0].updated_at || null
        : null
    };
}

async function writeStatus(status, cwd = ".") {
    const statusPath = path.join(cwd, STATUS_FILE);
    await fs.mkdir(path.dirname(statusPath), { recursive: true });
    await fs.writeFile(statusPath, `${JSON.stringify(status, null, 2)}\n`, "utf8");
}

export async function runHeartbeat({
  cwd = ".",
  env = process.env,
  fetchImpl = fetch,
  now = () => new Date(),
  consoleImpl = console
} = {}) {
  let status = {
    ranAt: now().toISOString(),
    ok: false,
    reason: "unknown",
    rowCount: null,
    maxUpdatedAt: null,
    usedServiceKey: false,
    mode: "metadata-only",
    exportedPlayerRows: false
  };

  try {
    const html = await fs.readFile(path.join(cwd, APP_FILE), "utf8");
    const supabaseUrl = readConst(html, "SUPABASE_URL");
    const supabaseAnonKey = readConst(html, "SUPABASE_ANON_KEY");
    const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
    const projectRef = new URL(supabaseUrl).hostname.split(".")[0];

    if (projectRef !== EXPECTED_PROJECT_REF) {
        throw new Error(`Supabase project ref mismatch: expected ${EXPECTED_PROJECT_REF}, got ${projectRef}`);
    }

    // Wake-up ping keeps the free-tier project alive even if the rest fails.
    // HEAD prevents even an anon-visible row body from entering the runner.
    await supabaseRequest(supabaseUrl, supabaseAnonKey, "players?select=id&limit=1", { method: "HEAD" }, fetchImpl);

    if (!serviceKey) {
        status.reason = "SUPABASE_SERVICE_ROLE_KEY missing - metadata verification CANNOT see protected rows. Add it in repo Settings -> Secrets -> Actions.";
        await writeStatus(status, cwd);
        consoleImpl.error(status.reason);
        return status;
    }
    status.usedServiceKey = true;

    const { rowCount, maxUpdatedAt } = await readPlayerMetadata(supabaseUrl, serviceKey, fetchImpl);

    status.rowCount = rowCount;
    status.maxUpdatedAt = maxUpdatedAt;
    if (rowCount === 0) {
      status.reason = "no player rows visible - metadata heartbeat fails closed";
      await writeStatus(status, cwd);
      consoleImpl.error(`Supabase metadata check failed closed: ${status.reason}. No player rows exported.`);
      return status;
    }
    status.ok = true;
    status.reason = "cloud rows visible; metadata verified without exporting player data";
    await writeStatus(status, cwd);
    consoleImpl.log(`Supabase metadata check: ${rowCount} row(s), newest updated_at=${maxUpdatedAt}. No player rows exported.`);
  } catch (err) {
    status.reason = String(err && err.message ? err.message : err).slice(0, 400);
    try { await writeStatus(status, cwd); } catch (_) {}
    consoleImpl.error("Heartbeat/backup FAILED:", status.reason);
  }
  return status;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const status = await runHeartbeat();
  if (!status.ok) process.exit(1);
}
