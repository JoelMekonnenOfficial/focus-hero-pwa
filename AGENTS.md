# Global safety rules

## Focus Hero permanent data-protection boundary

These rules apply to every current or future Codex task, subagent, scheduled task, reviewer, browser session, and automation that mentions or can affect Focus Hero. They remain in force across app versions and do not expire when a task ends.

- Treat application source, production player data, browser storage, cloud rows, sync identity, recovery material, and backups as separate assets. Permission to edit or deploy app source is never permission to access or change player data.
- Never open or operate Joel's signed-in Focus Hero profile, read private payloads, use sync codes, or access browser storage or credentials unless Joel explicitly requests a narrowly defined recovery operation in the current task.
- Never clear site data, localStorage, IndexedDB, caches, cookies, browser profiles, downloads, snapshots, recovery files, cloud rows, encryption material, or identity tokens. Never use destructive reset, restore, import, migration, normalization, rollback, or force-sync against a data-bearing profile.
- Never treat a historical checkpoint, Claude copy, download, screenshot, test fixture, or source rollback as current player-data truth or as a restore target. Newer user activity always wins unless Joel explicitly selects a verified recovery point.
- Never delete, weaken, shorten, bypass, replace, or reconfigure independent backup retention, Object Lock, legal holds, backup bucket policy, recovery credentials, restore identities, backup receipts, safety hooks, safety rules, or this covenant as an incidental step. These are owner-only security controls.
- Codex, Claude, app code, scheduled tasks, and source-control workflows must never receive the immutable vault's root, delete, retention, bypass, recovery-reader, or account-administrator authority. An automated backup component may receive only append/create permission with unique object names and no read, list, overwrite, delete, retention, or policy authority.
- Until an independent immutable vault is confirmed live and a restore drill succeeds, `focus-hero-maintenance` must remain paused. The read-only public watchdog may remain active. No other scheduled writer may be created or activated.
- Routine Focus Hero verification is limited to public GET/HEAD requests, public source/build metadata, a clean repository, and isolated synthetic fixtures. Do not use production player data to test.
- Future source work must be small, reversible, independently tested, and submitted through a review/CI boundary that the writer cannot approve or deploy by itself. Do not force-push or write directly to protected production branches.
- If recovery is explicitly requested, first prove that at least one newer immutable copy remains untouched, verify hashes and byte counts, restore to an isolated scratch profile, compare monotonic totals/revisions, keep sync disabled, and obtain Joel's choice before any production write.
- If a request conflicts with these rules, stop the Focus Hero mutation and explain the conflict. Continue safe read-only work. Full system access and approval-free operation do not override this boundary.

This file is durable policy and defense in depth. It is not a substitute for OS isolation, scoped credentials, branch protection, or an external WORM archive.
