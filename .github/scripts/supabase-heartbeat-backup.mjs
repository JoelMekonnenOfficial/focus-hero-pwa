import fs from "node:fs/promises";

const APP_FILE = "focus-hero.html";
const BACKUP_FILE = "backups/focus-hero-supabase-players.json";
const EXPECTED_PROJECT_REF = process.env.EXPECTED_SUPABASE_PROJECT_REF || "fkhzpscihafekhtcyvlt";

function readConst(source, name) {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*"([^"]*)"`));
  if (!match || !match[1]) throw new Error(`Missing ${name} in ${APP_FILE}`);
  return match[1];
}

async function supabaseFetch(url, key, path) {
  const resp = await fetch(`${url}/rest/v1/${path}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json"
    }
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Supabase ${resp.status}: ${body.slice(0, 300)}`);
  }
  return resp.json();
}

const html = await fs.readFile(APP_FILE, "utf8");
const supabaseUrl = readConst(html, "SUPABASE_URL");
const supabaseAnonKey = readConst(html, "SUPABASE_ANON_KEY");
const supabaseBackupKey = process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey;
const projectRef = new URL(supabaseUrl).hostname.split(".")[0];

if (projectRef !== EXPECTED_PROJECT_REF) {
  throw new Error(`Supabase project ref mismatch: expected ${EXPECTED_PROJECT_REF}, got ${projectRef}`);
}

await fs.mkdir("backups", { recursive: true });

// Cheap wake-up query first: enough to keep the free-tier project active.
await supabaseFetch(supabaseUrl, supabaseAnonKey, "players?select=id&limit=1");

// Stable, diff-friendly backup. Git history supplies the timestamp for changes.
// Set SUPABASE_SERVICE_ROLE_KEY in repo secrets so this bypasses RLS and truly
// captures every Focus Hero row. Without it, the dump is limited to anon-visible
// rows, but the heartbeat still keeps the project active.
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn("SUPABASE_SERVICE_ROLE_KEY is not set; backing up anon-visible rows only.");
}
const rows = await supabaseFetch(
  supabaseUrl,
  supabaseBackupKey,
  "players?select=*&order=id.asc"
);

const payload = {
  projectRef,
  table: "public.players",
  rowCount: Array.isArray(rows) ? rows.length : 0,
  rows
};

await fs.writeFile(BACKUP_FILE, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`Supabase heartbeat OK for ${projectRef}; backed up ${payload.rowCount} player row(s).`);
