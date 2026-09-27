# Life XP 10.64.1 audit candidate

Build: `fh-2026-09-27-v10-64-1-audited`. This is source prepared for independent review, not a published release. It includes the earlier 10.63.5 sync/save fixes and 10.64.0 gameplay work. See `AUDIT.md` for findings, coverage, and remaining release blockers. Passing the synthetic tests is not deployment approval.

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

All devices need the new build for consistent new failure prices. Older clients cannot distinguish a newly generated old-rule penalty from a previously recorded one. If such a legacy penalty arrives for the same failure, its recorded amount takes precedence and the new-rule duplicate is suppressed. This preserves historical amounts and prevents charging both; it can retain the old price while an older client is still in use.

## Appearance

Three optional contrast themes: **Afterglow** (coral and cyan), **Voltage** (violet and lime), and **Cobalt & Gold** (blue and gold). Choosing one uses its coordinated theme colors. Existing theme choices remain as selected; custom accents are still available.

## Verification and publication

Tests use source served on loopback, disposable browsers and invented fixtures. They do not open a signed-in player profile or use player data. See `REVIEW.md` for reproducible checks and the required external review/release boundary. The source author cannot approve or deploy this candidate. No backup controls, recovery assets or scheduled writers are changed.
