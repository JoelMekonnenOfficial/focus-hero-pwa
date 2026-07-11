import fs from "node:fs/promises";

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
 *   4. rowCount 0 is recorded (status "empty") but does not fail the run -
 *      an unlinked app legitimately has no rows yet. External watcher decides.
 */

const APP_FILE = "focus-hero.html";
const STATUS_FILE = "backups/backup-status.json";
const EXPECTED_PROJECT_REF = process.env.EXPECTED_SUPABASE_PROJECT_REF || "fkhzpscihafekhtcyvlt";

function readConst(source, name) {
    const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*\"([^\"]*)\"`));
    if (!match || !match[1]) throw new Error(`Missing ${name} in ${APP_FILE}`);
    return match[1];
}

async function supabaseRequest(url, key, path, init = {}) {
    const resp = await fetch(`${url}/rest/v1/${path}`, {
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

async function supabaseFetch(url, key, path, init) {
    const resp = await supabaseRequest(url, key, path, init);
    return resp.json();
}

async function readPlayerMetadata(url, key) {
    // HEAD + count=exact returns only Content-Range; no row body leaves Supabase.
    const countResp = await supabaseRequest(url, key, "players?select=id", {
      method: "HEAD",
      headers: { Prefer: "count=exact" }
    });
    const range = countResp.headers.get("content-range") || "";
    const countMatch = range.match(/\/(\d+)$/);
    if (!countMatch) throw new Error("Supabase row count missing from Content-Range");

    // Fetch only the newest timestamp. No id, state blob, or secret hash.
    const latestRows = await supabaseFetch(
      url,
      key,
      "players?select=updated_at&order=updated_at.desc&limit=1"
    );
    return {
      rowCount: Number(countMatch[1]),
      maxUpdatedAt: Array.isArray(latestRows) && latestRows.length
        ? latestRows[0].updated_at || null
        : null
    };
}

async function writeStatus(status) {
    await fs.mkdir("backups", { recursive: true });
    await fs.writeFile(STATUS_FILE, `${JSON.stringify(status, null, 2)}\n`, "utf8");
}

const startedAt = new Date().toISOString();
let status = {
  ranAt: startedAt,
  ok: false,
  reason: "unknown",
  rowCount: null,
  maxUpdatedAt: null,
  usedServiceKey: false,
  mode: "metadata-only",
  exportedPlayerRows: false
};

try {
    const html = await fs.readFile(APP_FILE, "utf8");
    const supabaseUrl = readConst(html, "SUPABASE_URL");
    const supabaseAnonKey = readConst(html, "SUPABASE_ANON_KEY");
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const projectRef = new URL(supabaseUrl).hostname.split(".")[0];

  if (projectRef !== EXPECTED_PROJECT_REF) {
        throw new Error(`Supabase project ref mismatch: expected ${EXPECTED_PROJECT_REF}, got ${projectRef}`);
  }

  // Wake-up ping keeps the free-tier project alive even if the rest fails.
  // HEAD prevents even an anon-visible row body from entering the runner.
  await supabaseRequest(supabaseUrl, supabaseAnonKey, "players?select=id&limit=1", { method: "HEAD" });

  if (!serviceKey) {
        status.reason = "SUPABASE_SERVICE_ROLE_KEY missing - metadata verification CANNOT see protected rows. Add it in repo Settings -> Secrets -> Actions.";
        await writeStatus(status);
        console.error(status.reason);
        process.exit(1);
  }
    status.usedServiceKey = true;

  const { rowCount, maxUpdatedAt } = await readPlayerMetadata(supabaseUrl, serviceKey);

  status.ok = true;
    status.rowCount = rowCount;
    status.maxUpdatedAt = maxUpdatedAt;
    status.reason = rowCount === 0
      ? "empty - no player rows exist yet (is sync linked?)"
      : "cloud rows visible; metadata verified without exporting player data";
    await writeStatus(status);
    console.log(`Supabase metadata check: ${rowCount} row(s), newest updated_at=${maxUpdatedAt}. No player rows exported.`);
} catch (err) {
    status.reason = String(err && err.message ? err.message : err).slice(0, 400);
    try { await writeStatus(status); } catch (_) {}
    console.error("Heartbeat/backup FAILED:", status.reason);
    process.exit(1);
}
