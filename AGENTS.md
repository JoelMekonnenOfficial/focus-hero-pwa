# Focus Hero repository safety contract

This contract applies to all work in this repository, including subagents and scheduled runs.

## Non-negotiable data boundary

- This repository contains app source, not authority over the production player profile.
- Never access, operate, reset, clear, import, restore, normalize, migrate, force-sync, or otherwise mutate a signed-in production profile, its browser storage, private cloud row, sync identity, encryption material, or backups.
- Never use historical totals, downloads, Claude artifacts, screenshots, fixtures, or old releases as a production restore target. Joel has newer activity.
- Use public GET/HEAD checks and isolated synthetic profiles only. Never place credentials, private payloads, sync codes, player rows, recovery exports, or private-state hashes in source, tests, logs, issues, pull requests, or coordination files.

## Permanent recovery boundary

- The independent immutable backup vault must live in a separate account that Codex cannot administer or sign into.
- Automation may have append/create-only access using unique object keys. It must have no read, list, overwrite, delete, retention, legal-hold, bypass, policy, key-management, or account-administration authority.
- Never weaken or remove Object Lock, compliance retention, vault policies, restore credentials, recovery receipts, safety rules, or safety tests.
- `focus-hero-maintenance` remains paused until the immutable vault is live, a scratch restore drill passes, and the repository-held Supabase service-role exposure is removed or replaced by a narrowly scoped metadata interface.

## Source-change gate

- Keep the read-only watchdog independent from writers.
- Submit future app changes through a protected pull request and required CI. The writer must not approve, merge, and deploy its own change.
- Before any release, create a rollback point for source, run the complete regression suite, confirm both HTML entrypoints are byte-identical, and verify the public live build without a real profile.
- Persistence, sync, recovery, data guards, schemas, minute accounting, XP/coin/loot/egg accounting, and session mutations require an explicit current user request plus focused regression coverage.
- On any ambiguity or failed gate, make no production change. Preserve every existing recovery copy.

These instructions are policy; actual protection also requires sandboxing, separate identities, scoped credentials, protected branches, and the external immutable archive.
