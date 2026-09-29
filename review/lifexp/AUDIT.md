# Current follow-up: Life XP 10.64.3

The September 29 regression patch is documented in `INCIDENT-10.64.3.md` and the current `RELEASE_NOTES.md`. It addresses the reproduced optional-script startup block, idle Skills redraw loop, and hidden current sync failures. Its exact validation and publication status are recorded separately. The earlier review below is preserved as historical evidence; it does not claim the reported layout difference or every physical-device issue is resolved.

---

# Life XP 10.64.2 — compatibility and due-diligence review

September 27, 2026. Build fh-2026-09-27-v10-64-2-compatible. Source candidate, not a published release.

This continues the 10.64.1 audit at 9dccafca1ca73ba488672f98fac29127a6ee6884, using actual public 10.63.4 source at d9d8d6c0a24a6d4cdd84cd3f97a178b33f197265 for old-client checks. Earlier dated packages remain available. Tests use disposable browsers, loopback servers and invented records. No signed-in Focus Hero profile, private cloud payload, browser storage, sync code, recovery copy or backup was inspected or changed.

## Requested behavior retained

- Clocks retain separate Locked In, Priority, task, action and timer settings. Priority can change during a run. Deferred completion cannot alter another clock.
- A 50-second session saves exact elapsed time and closes after durable success, without inventing a focus minute, XP, coins or a completed-session bonus.
- Equipment supports combat. Regional enemies and bosses clear routes; Travel advances to the next world, with mounts increasing travel speed. Existing inventory, past earnings and unlocked worlds remain.
- Future Hardcore days receive balanced daily RP; the strongest commitment earns that date's bonus, and new failures share a bounded daily cost. Existing rank events retain their recorded amounts.
- Afterglow, Voltage and Cobalt & Gold add coordinated contrasting colors alongside the existing themes.

RELEASE_NOTES.md describes the exact rules and older-clock limitations.

## Additional corrections

**Authenticated sync version.** New encrypted envelopes bind their version, encoding, identity and revision to AES-GCM authentication. Old encrypted saves remain readable. Older applications reject the new envelope before their mergers can discard unfamiliar calendar, journey or rank evidence. Revision-checked Supabase writes prevent stale old clients replacing the newer row; an in-place synthetic update then recovers their separate offline work. No fake rewards, identity changes, key replacement or player-data migration serves as a compatibility marker.

**Encryption policy.** Encryption-required devices refuse plaintext, including when the setting becomes stricter during a read. Plaintext requires explicit local opt-out and uses a versioned wrapper that older readers refuse. A verified protocol version is remembered per identity to prevent downgrade. Diagnostics use a detached context and verify the downloaded revision. Providers without revision-checked writes cannot safely publish this format and are refused with local work retained; the app does not silently change providers.

**Shared Hardcore calendar.** Future judging uses a chosen shared timezone and absolute boundary/session receipts. Historical ordinary date totals and run start dates remain recorded as before. The code does not guess the original timezone of old late-start or pause evidence. Ambiguous judgments wait for explicit historical timezone confirmation instead of recording a false failure or changing old rewards. Choose the calendar on one device and let ordinary sync share it. Conflicting choices preserve both copies and require review; contradictory boundaries are not automatically reconciled.

**Safe update activation.** The old page's guard omits some paused clocks and pending saves. An actual browser reproduction showed an old page with an 88.888-second paused clock reload after the old activation message. Its unload checkpoint preserved that time: the evidence proves interruption, not observed data loss. The new worker requires fresh readiness acknowledgements from open pages and does not trust the legacy activation message. Unknown old pages keep an update waiting until they close normally. Fixed pages drain saves and respect running, paused, parked and blocked-storage states. Existing caches and registrations remain.

The prior complete-bundle integrity gate remains: executable files carry SHA-384 receipts, incomplete bundles stop before primary hydration, and an offline cache identifies its exact content. The failed-pull, asynchronous rollback, reward continuation, duplicate harvest, Hardcore evidence and task-text injection corrections are retained.

The additional calendar review reproduced a failed-pull rollback error caused by synchronous save preparation changing the comparison bytes. Rollback now captures the exact prepared state before awaiting the save, including when validation fails after synchronous log trimming, and still refuses to overwrite newer work. Source inspection found the same stale-restoration risk in identity claim/adoption failures. Twelve exact-source fault cases cover unchanged, prepared, newer-in-place and replacement states, explicit save refusal, a read failure before installation and a clock saved during asynchronous verification; the older implementation fails the newer-work case. These are synthetic checks of source behavior, not production recovery operations.

## Verification and limits

Separate Linux CI exposed a 320px WebKit theme-panel overflow that Windows WebKit did not show. Measurements identified a background-control row extending beyond its available width; narrow theme panels now stack their labels and controls without clipping them. The mobile test checks both the panel and individual control bounds and saves failure geometry. CI also exposed a historical-fixture path assumption when the candidate lives below the repository root; the test now enumerates that source independently of its working directory. Neither correction changes player records.

The combined suite covers real encrypted three-device CAS exchanges, legacy refusal and in-place upgrade, lost replies, malformed receipts, edits during uploads, storage failures, calendar algebra, DST and timestamp ownership, ranking, world progression, clock races, task rendering, worker transitions and offline startup. WebKit coverage checks durable sessions, clock controls, mobile layouts, encryption and Toronto/Los Angeles/UTC boundaries, including 23- and 25-hour days.

Focused evidence is in SECURITY-AUDIT.md, DOMAIN-AUDIT.md, tests/MULTIDEVICE-AUDIT.md and the update-rollout report. Packaged and CI results identify the source commit. Passing tests that expect safe refusal do not mean older clients can keep sharing new-format progress without updating.

These checks do not certify installed builds or current totals on Joel's actual Chrome, Opera or phone, physical iPhone suspension/eviction, live Supabase row policies, or an independent immutable-vault restore drill. Existing recovery controls were not exercised or certified. Maintenance remains paused until the separate vault/drill requirements are met.

## Review and release handoff

The current supplied AGENTS.md requires a review/CI boundary that the source writer cannot approve or deploy by itself. This is an owner-supplied rule, not a Cloudflare requirement. This submission preserves it and does not modify protected branches, approval settings, backup controls, retention or disabled historical workflows.

The GitHub integration now reports source push access to JoelMekonnenOfficial/focus-hero-pwa. Main is marked protected; its detailed protection settings remain inaccessible to the integration. The source submission is prepared under review/lifexp/, with read-only CI and historical paths preserved. Its sparse checkout excludes the historical backup folder. Adding this CI file alone does not establish required-review enforcement.

The release authority should use the exact checked commit and publish only its 47 starmax/ assets through the existing Cloudflare Worker. The corrected Chrome profile is signed in to the correct Cloudflare account and the existing Focus Hero deployment has been located. Public GET checks after release must verify identical build/bytes at /, /index.html, /focus-hero.html and /focus-hero, plus sealed modules.

For rollout, finish and save current work, then close/reopen old app windows normally when ready. A waiting update may reflect another open window with unfinished work. Do not clear site data, caches, cookies or registrations; do not import an old copy or force-sync. Check the displayed build on each device before expecting new-format progress to sync. Older offline work stays on its device until it receives the compatible reader.

No deployment, production recovery, forced update, backend-policy change or scheduled writer activation was performed by this review.
