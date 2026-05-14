# Focus Hero v4

A single-file Pomodoro RPG — tasks, tiered XP, background-safe timer, encrypted cloud sync. Open `focus-hero.html` in a browser or install as a PWA.

## Quick start

- **Local only.** Double-click `focus-hero.html`. State lives in `localStorage`. The service worker isn't active over `file://`, so PWA install + offline cache need a host.
- **Host it.** Any static host works — Netlify Drop, GitHub Pages, `npx serve`, VS Code Live Server.
- **Sync across devices.** See below.

## Cloud sync — two backends

### Option A — jsonstorage.net fallback (no setup)
Leave `SUPABASE_URL` / `SUPABASE_ANON_KEY` blank in `focus-hero.html`. Sync → Enable cloud sync uses `jsonstorage.net`, a public KV. With **End-to-end encryption** on (default), only your device holds the key — server sees ciphertext + IV + salt + `sync_secret_hash`.

### Option B — Supabase (60-second setup, free tier)

1. Sign up at https://supabase.com, create a project.
2. In the SQL editor, run:

   ```sql
   create extension if not exists pgcrypto;
   create table public.players (
     id               text primary key,
     user_id          uuid,
     data             jsonb not null,
     cloud_rev        integer not null default 0,
     sync_secret_hash text,
     updated_at       timestamptz not null default now()
   );
   alter table public.players enable row level security;

   create policy "own row by uid"
     on public.players for all
     using (auth.uid() is not null and user_id = auth.uid())
     with check (auth.uid() is not null and user_id = auth.uid());

   create policy "claim by secret"
     on public.players for select
     using (sync_secret_hash is not null);
   ```

3. In **Authentication → Providers**, enable **Anonymous sign-ins**.
4. **Project settings → API**: copy `Project URL` and `anon public` key.
5. Open `focus-hero.html` and edit these lines near the top of the `<script>`:

   ```js
   const SUPABASE_URL = "https://YOUR-PROJECT.supabase.co";
   const SUPABASE_ANON_KEY = "eyJhbGciOi..."; // anon key
   ```

6. Reload. Sync panel now says "Encrypted cloud sync active."

### Supabase heartbeat backup

v7.5 adds a daily GitHub Action that pings the configured Supabase project and writes a stable `backups/focus-hero-supabase-players.json` snapshot when rows change. Add `SUPABASE_SERVICE_ROLE_KEY` as a repository secret so the backup can bypass RLS and capture every `public.players` row; without that secret, the heartbeat still runs but the dump is limited to anon-visible rows.

## Pairing devices

Device A: Sync → Generate sync code. You see `CODE-SECRET` (e.g. `ABCDEFGH-IJKLMNOPQRSTUVWX`) plus a QR. The secret never leaves your devices; only its SHA-256 hash goes to the server.

Device B: Sync → Enter code from other device → paste the full `CODE-SECRET` → Claim.

## End-to-end encryption

- Algorithm: **AES-GCM-256**, key derived via **PBKDF2-SHA256, 100,000 iterations**, salt randomly generated on code creation.
- Toggle: Sync panel → "End-to-end encryption". On by default.
- Server sees: `{ iv, salt, ct, cloud_rev, sync_secret_hash }`. Never plaintext.

## Keyboard shortcuts

`Space` start/pause · `R` reset · `N` skip · `1/2/3/4` focus/short/long/stopwatch · `Shift+S` stopwatch · `Shift+L` stop & log stopwatch · `A` new task · `Q` new quest · `Shift+B` backup now · `T` theme · `Y` sync panel · `,` settings · `?` help.

## Data export / import / backup

Settings → **Back up all data** (or `Shift+B`) downloads a dated JSON. Monthly auto-backup fires once per calendar month on first load. Import re-hydrates any v1/v2/v3/v4 export through the migration layer.

## PWA install

Host the folder (Netlify / GitHub Pages / local server) and use your browser's install button. Manifest + SW already wired. iOS Safari: **Share → Add to Home Screen**.

## Smoke tests

Two ways to run them:

- **In the browser:** append `?test=1` to the URL. A banner at the top reports the v4 in-app checks (XP math, task CRUD, mid-session rename, app-open tracking, AES-GCM round-trip, v3→v4 migration, degraded read, cumulative-max merge).
- **Headlessly:** `node verify.js` runs **42 assertions** by extracting the inline `<script>` from the sibling `focus-hero.html` and evaluating its pure functions inside a Node `vm` with browser shims (uses Node's WebCrypto for the real AES-GCM round-trip). Use this in CI before any release. Exit code is non-zero if any assertion fails.

## File layout

| file | role |
| - | - |
| `focus-hero.html` | the entire app, single file |
| `sw.js`           | service worker (v4 cache, notification click handler) |
| `manifest.webmanifest` | PWA manifest (v4) |
| `icon-192.png`, `icon-512.png` | icons |
| `verify.js`       | headless test runner (`node verify.js`) — 42 assertions |
| `stopwatch-tests.js` | pure-function stopwatch suite (`node stopwatch-tests.js`) — 16 assertions |
| `CHANGES.md`      | detailed changelog |
| `README.md`       | this file |

## Troubleshooting

- **Service worker isn't registering.** SWs only work over `http(s)://` — not `file://`. Host it anywhere.
- **Sync stuck on "never."** Open DevTools → Network. 401 → wrong anon key. 403 → RLS policies missing; re-run the SQL.
- **"Remote secret hash mismatch."** Another device pushed with a different sync code. Generate a new code on one device and claim it on the other.
- **Background timer drifts on iOS.** Enable **Audio keepalive** (on by default) and optionally **Keep screen awake** in settings.
- **Lost data after reset.** Reset wipes `localStorage`. Import the last auto-backup JSON.
