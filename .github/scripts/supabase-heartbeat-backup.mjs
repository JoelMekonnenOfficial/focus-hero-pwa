import fs from "node:fs/promises";

/* Focus Hero - Supabase heartbeat + backup (v2, fail-loud edition).
 *
 * The old version reported success while backing up ZERO rows whenever
 * SUPABASE_SERVICE_ROLE_KEY was missing (RLS hides all rows from anon).
 * That masked a dead backup pipeline for weeks and cost real data.
 *
 * New rules:
 *   1. Missing SUPABASE_SERVICE_ROLE_KEY  -> exit 1 (loud red run).
 *   2. Any fetch failure                   -> exit 1.
 *   3. ALWAYS writes backups/backup-status.json with ranAt, ok, reason,
 *      rowCount, maxUpdatedAt - so an external watcher can verify backups
 *      are real and fresh without any credentials.
 *   4. rowCount 0 is recorded (status "empty") but does not fail the run -
 *      an unlinked app legitimately has no rows yet. External watcher decides.
 */

const APP_FILE = "focus-hero.html";
const BACKUP_FILE = "backups/focus-hero-supabase-players.json";
const STATUS_FILE = "backups/backup-status.json";
const EXPECTED_PROJECT_REF = process.env.EXPECTED_SUPABASE_PROJECT_REF || "fkhzpscihafekhtcyvlt";

function readConst(source, name) {
    const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*\"([^\"]*)\"`));
    if (!match || !match[1]) throw new Error(`Missing ${name} in ${APP_FILE}`);
    return match[1];
}

async function supabaseFetch(url, key, path) {
    const resp = await fetch(`${url}/rest/v1/${path}`, {
          headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" }
    });
    if (!resp.ok) {
          const body = await resp.text().catch(() => "");
          throw new Error(`Supabase ${resp.status}: ${body.slice(0, 300)}`);
    }
    return resp.json();
}

async function writeStatus(status) {
    await fs.mkdir("backups", { recursive: true });
    await fs.writeFile(STATUS_FILE, `${JSON.stringify(status, null, 2)}\n`, "utf8");
}

const startedAt = new Date().toISOString();
let status = { ranAt: startedAt, ok: false, reason: "unknown", rowCount: null, maxUpdatedAt: null, usedServiceKey: false };

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
  await supabaseFetch(supabaseUrl, supabaseAnonKey, "players?select=id&limit=1");

  if (!serviceKey) {
        status.reason = "SUPABASE_SERVICE_ROLE_KEY missing - backup CANNOT see protected rows. Add it in repo Settings -> Secrets -> Actions.";
        await writeStatus(status);
        console.error(status.reason);
        process.exit(1);
  }
    status.usedServiceKey = true;

  const rows = await supabaseFetch(supabaseUrl, serviceKey, "players?select=*&order=id.asc");
    const rowCount = Array.isArray(rows) ? rows.length : 0;
    const maxUpdatedAt = rowCount
      ? rows.map(r => r.updated_at || "").sort().at(-1) || null
                                                               : null;

  await fs.mkdir("backups", { recursive: true });
    await fs.writeFile(
          BACKUP_FILE,
          `${JSON.stringify({ projectRef, table: "public.players", rowCount, rows }, null, 2)}\n`,
          "utf8"
        );

  status.ok = true;
    status.rowCount = rowCount;
    status.maxUpdatedAt = maxUpdatedAt;
    status.reason = rowCount === 0 ? "empty - no player rows exist yet (is sync linked?)" : "backed up";
    await writeStatus(status);
    console.log(`Supabase backup: ${rowCount} row(s), newest updated_at=${maxUpdatedAt}. Status written.`);
} catch (err) {
    status.reason = String(err && err.message ? err.message : err).slice(0, 400);
    try { await writeStatus(status); } catch (_) {}
    console.error("Heartbeat/backup FAILED:", status.reason);
    process.exit(1);
}
