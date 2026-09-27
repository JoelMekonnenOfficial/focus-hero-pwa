# Life XP 10.64.1 — due-diligence audit

September 27, 2026. **Source review candidate; not deployed. Release remains on hold.**

This review covers the prior 10.64.0 candidate at `4176f7d4c74edbf16d3d44c58d86db3ddaf46751`, the requested clock/gameplay/theme changes, and their interaction with the public 10.63.4 source baseline `d9d8d6c0a24a6d4cdd84cd3f97a178b33f197265`. Findings were reproduced against actual source using invented fixtures. Corrections were kept in separate commits and cross-reviewed by separate agents. This is additional engineering review, not the independent release approval required by the owner's policy.

No signed-in Focus Hero profile, private cloud row, sync identity, browser storage, recovery copy, or backup was opened. No live totals or runs were checked or changed. No deployment, workflow activation, retention change, or recovery was performed. Earlier user-reported matching totals are historical context, not evidence of today's player state.

## Release decision

**Do not deploy this package unattended or treat passing tests as approval.** The updated-client paths have extensive synthetic coverage, but the following gates remain:

1. **Mixed versions are incompatible.** Old 10.63.4 clients refuse new policy-4 rewards. Bypassing that refusal is unsafe: old journey and rank mergers discard newer evidence. All three devices must receive a complete compatible build before new-policy work resumes. The audit proves an in-place synthetic upgrade preserves old offline minutes; it cannot prove the real devices have updated.
2. **Encrypted-sync downgrade behavior needs a deliberate policy decision.** The inherited reader accepts recognizable plaintext even when local encryption is enabled. A party already able to replace a cloud row could avoid ciphertext authentication by substituting plaintext. This review does not establish that such write access exists. Backend authorization was not inspected. Tightening this needs explicit legacy compatibility handling and regression tests; no production migration or silent choice was attempted. See `SECURITY-AUDIT.md`.
3. **Historical late-start windows lack a timezone identifier.** The same record can be evaluated differently by devices in different timezones. The patch corrects daylight-saving arithmetic and refuses impossible windows, but cannot infer the original timezone of old records. Different timezone settings/travel require a separate calendar protocol before those scenarios can be certified.
4. **Independent approval and release controls remain unverified.** The historical GitHub main branch is marked protected, but the exact review/check/bypass rules were not publicly available. An enforced external reviewer and a release authority separate from the source writer must approve the exact candidate.
5. **Actual devices, Supabase permissions and independent recoverability are unverified.** Synthetic Chromium/WebKit checks cannot certify installed Opera/Chrome versions, iPhone home-screen suspension, OS storage eviction, live row-level permissions, or an immutable-vault restore drill. Maintenance remains paused.

## Corrected findings

| Area | Reproduced failure | Correction and evidence |
| --- | --- | --- |
| P1 — update coherence | New HTML hydrated while a previous worker served older scripts. Missing modules did not stop worker installation. | SHA-384 script receipts; pre-hydration failure gate; required executable bundle; content-derived cache namespace. Actual worker tests verify missing/wrong modules and wrong HTML reject installation, prior caches survive, and a complete build starts offline. A blocked page opens no profile/backup DB even after background helper timers. |
| P1 — update/save race | Automatic refresh could run while a durable commit was still pending or had failed. | Drain the current save queue, include later queued saves, then recheck storage/identity/accounting/clock barriers. Independent exact-source race probes. |
| P1 — deletion rollback | Awaited backup failure or no-change could replace newer work with an old command snapshot. | Roll back only state owned by that command, using the latest verified base. Preserve newer activity and pause when accounting ownership is uncertain. Real IndexedDB refusal and crash/reopen fixtures. |
| P1 — deletion reward continuation | Deleting an asynchronously corrected record reversed its old reward amount; late callbacks could spend rewards from a newer primary. | Return the exact deleted-record receipt, reverse that receipt's rewards, and recheck ownership before follow-up accounting. |
| P1 — Hardcore evidence | Conflict resolution used an obsolete run shape, dropped shared/distinct evidence, or reported success without a confirmed save. Lifecycle joins discarded pause/excuse/revival proof. | Preserve run evidence across lifecycle outcomes, archive distinct unchosen runs, await durable saving, and retain quarantine for contradictory same-ID identities. Shared terminal evidence remains terminal unless valid reinstatement supersedes it. |
| P1 — farming/economy | Two offline claims for the same crop paid twice; stale grants could resurrect deleted rewards. Equal timestamps could depend on merge order. | Crop identity receipts, terminal-deletion precedence, deterministic event joins. Actual encrypted three-device tests conserve both same-crop and distinct-crop rewards/materials. Historical random harvest IDs are retained. |
| P1 — task display security | Task emoji markup executed script through two HTML renderers. | Escape the displayed value; keep the stored text unchanged. Synthetic browser exploit checks cover both display and rename. |
| P2 — failed pull | A storage-warning notification changed the state being rolled back, leaving an uncommitted cloud merge visible. | Display-only storage warning; strict newer-state rollback guard stays intact. Real quota fault retains local 7 minutes in memory and on reload, with cloud bytes unchanged. |
| P2 — clock callbacks | Old completion could auto-start a replacement clock or clear its Priority choice. | Bind deferred actions to the completed clock and successful new receipt; stale/duplicate callbacks do not act on another clock. |
| P2 — calendar credit | Overlapping windows could count the same completed session/work twice; positive-minute records without a completed-session bonus could be omitted. | Separate minute eligibility from session-count eligibility, apply exclusive date ownership, and use calendar construction for selected times. Nonpositive windows refuse judgment. |
| P2 — evidence capacity | Read/merge normalization truncated old pauses/excused dates at a cap. | Retain existing evidence; refuse only new additions at capacity with a clear explanation. |
| Policy/UX — update/recovery | Update helpers removed existing caches/registrations; boot error advised selecting the latest backup. | Non-destructive update checks, no automatic navigation from the standalone helper, and guidance to preserve newer work and review recovery choices. Existing recovery controls are not exercised or certified. |

See `DOMAIN-AUDIT.md`, `tests/MULTIDEVICE-AUDIT.md`, `SECURITY-AUDIT.md`, and the named regression suites for exact boundaries and before/after reproductions.

## Verification coverage

The final delivered evidence archive contains the complete combined-suite result and individual logs, plus actual-worker and WebKit measurements. Tests cover:

- Three independent encrypted clients with CAS conflicts; independent 17/23/31-minute work converges to 71 without duplicate credit.
- Lost accepted responses, malformed receipts, upload-time edits, queued retries, real IndexedDB failures, and cloud-transfer budgets.
- Old-reader refusal retaining 11 offline minutes; upgrading those same disposable contexts combines 11 + 29 into 40 across all three.
- One crop claimed twice yielding one receipt / 4 herbs; separate crops yielding two receipts / 8 herbs; additive material and farm-minute preservation.
- Save-failure rollback, newer-primary adoption during accounting, short 50.123-second records without minute/reward inflation, duplicate completion, and restart between save and clock promotion.
- Hardcore/rank/day-window algebra, pause/excuse/revival retention, route and combat rewards, previously unlocked worlds, and requested appearance choices.
- Real service-worker install/activation/cache/offline behavior, module byte integrity, save-safe refresh, and byte-identical HTML entry points.
- WebKit startup, durable session/reload, per-clock controls and 320/390px layouts. This is a Safari-engine supplement, not physical iPhone/PWA certification.
- The pinned test-dependency audit reported zero known advisories at review time. This is a registry advisory check, not a guarantee against unknown vulnerabilities.

Tests intentionally assert some known incompatibilities as safe refusals. Those passing assertions do not mean the incompatibility is resolved. No finite audit can guarantee that all future combinations are defect-free.

## Deployment and history investigation

The desktop folder is `C:/Users/joe4k/OneDrive/Desktop/Focus Hero`, containing older source/deployment notes. It is not the current source of player truth. Save/recovery directories were not opened. Claude's regular review chat was accessible; a read-only context question was sent with the user's authorization. Claude confirmed the remembered Cloudflare/Supabase arrangement but could not recover the requested CoWork handoff or identify the origin of the protection rule.

The supplied handoff names the production Cloudflare Worker `focus-hero-pwa`. Public source checks identify live version 10.63.4. The historical public repository is [JoelMekonnenOfficial/focus-hero-pwa](https://github.com/JoelMekonnenOfficial/focus-hero-pwa), main commit `98f92700d8779212412fcf4417ef9b747e4bda15`; it does not match this current source candidate. Public GitHub metadata on September 27 reports:

- Main branch protected; protection details require authentication and were not available through the connected repository tool, which returned no accessible repositories.
- The Cloudflare deploy and Supabase heartbeat workflows are **disabled_manually**. Neither was enabled or edited.
- The historical deploy file triggers on a main-branch push and contains no test job or approval environment. Branch controls may add requirements, but their exact settings are unverified.
- The dynamic GitHub Pages workflow is active; the newest returned run metadata is from July 25. No workflow logs or backup-status payloads were read.
- Local Focus Hero maintenance and preservation watchdog automations are paused. No scheduled writer was created or activated.

Cloudflare supports both manual deployment and [Git integration](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/). The restriction is an owner rule, not a Cloudflare limitation. The durable file `C:/Users/joe4k/.codex/AGENTS.md` states: “Future source work must be small, reversible, independently tested, and submitted through a review/CI boundary that the writer cannot approve or deploy by itself.” This audit preserves that rule. Full computer access does not replace it.

## Concrete release handoff

1. An independent owner/reviewer checks the exact source, remaining findings and package hashes, then confirms required checks/reviews and protected release access. Do not simply reactivate the historical auto-deploy workflow.
2. Resolve the encrypted/plaintext compatibility policy and cross-timezone requirements. Confirm backend access controls from configuration, without exporting player payloads. Any recovery/backup work requires its separate owner authorization and isolation process.
3. Run CI from full Git history on the exact reviewed commit. Use the supplied history bundle to reproduce older-reader tests. Verify all 46 deployment files and HTML mirrors; never upload the review/test/source-history files as public static assets.
4. With Joel present, coordinate Chrome, Opera and the phone: finish/log existing work, confirm ordinary sync has no pending/error state, and keep old copies quiescent through the update. No cache clearing, reinstall, import, old backup selection, or force-sync is part of this plan.
5. The independent release authority deploys the approved static bundle. Public GET checks verify `/`, `/index.html`, `/focus-hero.html` and `/focus-hero` advertise the exact approved build, and required modules match the sealed bytes.
6. Joel confirms the build on all three devices and visually checks expected progress before resuming new-policy rewards. If any device is still old or refuses sync, preserve it and investigate; do not loosen validators or replace its profile. A source rollback to an older reader is not a safe data rollback.

Until these gates are met, the deliverable is a reproducible review package, not permission to publish or change player data.
