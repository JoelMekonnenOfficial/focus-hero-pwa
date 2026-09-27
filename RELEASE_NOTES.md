# Life XP 10.64.2 review candidate

Build: `fh-2026-09-27-v10-64-2-compatible`. Source prepared for independent review, not a published release. It includes the earlier sync/save fixes, gameplay changes and due-diligence corrections. See `AUDIT.md` for findings, coverage and the release boundary.

## Sync and safe updates

Encrypted sync now checks that the format, profile and cloud revision belong together. Existing encrypted saves remain readable. Older applications cannot read or overwrite the newer Supabase copy; their separate offline work stays local until an ordinary in-place update enables a compatible merge. Every device needs the complete new build. Clearing storage, importing old saves and force-syncing are not part of updating.

Devices requiring encryption refuse plaintext. Turning encryption off is an explicit choice with an explanation. Providers without revision-protected writes pause publishing and retain queued local work instead of risking an older device overwriting the cloud. The app never switches provider or identity automatically for this change.

A downloaded update waits for open windows to be ready. An old window that cannot prove its saves are finished keeps the update waiting until it closes normally. Fixed windows drain saves and protect active, paused and parked clocks. Existing caches and registrations remain intact.

## Shared Hardcore day boundaries

Choose a shared timezone on one device and let normal sync share it. Existing profiles begin using the chosen calendar on the next full day; original run starts, earned history and rank events remain. New profiles can initialize the displayed device timezone when starting their first run. Future day boundaries and session receipts are shared, so another device's timezone does not change the result.

The app does not guess the original timezone for older late-start or pause records. Affected judgments wait for an explicit historical timezone confirmation. Conflicting calendar choices preserve both copies for review. This can pause judging or sync until the ambiguity is resolved; it never silently selects a losing copy.

## Due-diligence corrections

This audit adds complete-release integrity checks, content-derived offline cache namespaces, and update refusal when files are missing or incompatible. An incomplete page stops before profile databases open. Update controls preserve existing caches and registrations and wait for pending saves; paused or parked clocks and uncertain storage prevent refresh.

Async accounting commands now retain newer work instead of rolling back to stale snapshots, reverse the exact deleted record's rewards, and stop when command ownership changes. Old completion callbacks cannot start a replacement clock or clear its Priority choice. A storage warning no longer changes the state being rolled back after a failed pull.

Hardcore merges retain pause, excuse and revival evidence; unsafe identity decisions stay quarantined. Calendar-window ownership prevents duplicate credit, and impossible windows refuse judgment rather than inventing a failure. Crop harvest identity prevents two offline devices claiming the same planting twice. Task emoji markup is displayed as text rather than executable HTML.

## Clocks

Each clock saves its own Locked In, Priority, adventure action, task and timer context. Switching restores that clock's choices. Priority can be changed during a run and the completed record reflects its setting. A clock also retains the world in which its adventure started, so switching worlds cannot redirect its eventual fight or travel result.

A session shorter than one minute keeps its exact elapsed time and closes after its record is saved. It does not round up a focus minute, grant XP or loot, or increment the completed-session count. Failed or interrupted saves must preserve other clocks and newer progress.

Older parked clocks did not store every setting. Their recorded Priority flag can be restored, but an old Locked In choice cannot be reconstructed; check that choice once when resuming such a clock. Newly saved clock snapshots retain it.

## Equipment and worlds

Equipment supports combat through damage, defense, critical chance and related combat stats. Gear no longer provides XP, coin, energy-discount, loot-quality or farm-yield perks. Existing items and historical earnings are retained. Old saved noncombat affixes are inactive; new affixes are combat effects.

Fight drops use regional equipment pools. Peaceful actions retain their resource and consumable rewards. Defeat five normal enemies and the regional boss to clear a route, then cover 60 distance through Travel to unlock the next world. Equipped mounts increase travel speed by 7–22%, depending on tier. Distance never multiplies credited focus minutes. Already unlocked worlds remain open, and previously earned maps and shards remain owned. Later session-time corrections do not retract earned route progress or re-lock worlds.

## Ranked Standing

Future completed Hardcore days receive daily RP as well as the existing milestone rewards. Base daily RP is 20 times the square root of required hours, with bounded difficulty scaling: a four-hour day earns 40 base RP, and an eight-hour day earns 57. Normal placement, rating scaling and daily limits still apply.

Only the strongest completed Hardcore commitment on a date earns the daily bonus. A later stronger completion raises that date's award instead of stacking another award. New failure costs are at most twice the run's daily reward and never more than 50 base RP; multiple new-policy failures on one date share the largest applicable cost. Manual endings are not failures.

Existing event amounts are preserved. Ongoing runs start earning the new daily bonus on the next active day after their first evaluation with this build. Open, paused-only and excused-only days do not earn it. Completed-day evidence, milestone dates and revival reversals are retained across merges so duplicate runs and stale peers cannot award or charge the same event repeatedly.

Already-recorded legacy penalties retain their recorded amounts. If an older offline device brings such a penalty after updating, the existing amount takes precedence and the new-rule duplicate is suppressed. This prevents charging both without rewriting historical prices. Older builds cannot continue publishing into a newer protocol-protected Supabase row.

## Appearance

Three optional contrast themes: **Afterglow** (coral and cyan), **Voltage** (violet and lime), and **Cobalt & Gold** (blue and gold). Choosing one uses its coordinated theme colors. Existing theme choices remain as selected; custom accents are still available.

## Verification and publication

Tests use source served on loopback, disposable browsers and invented fixtures. They do not open a signed-in player profile or use player data. See `REVIEW.md` for reproducible checks and the required external review/release boundary. The source author cannot approve or deploy this candidate. No backup controls, recovery assets or scheduled writers are changed.
