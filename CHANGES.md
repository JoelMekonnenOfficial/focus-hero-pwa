## v7.9 - session time edits both ways; MMO character rework; alternate prototype

- Job 1: the session-time editor now accepts UPWARD corrections, not just reductions. The old "clamp at original elapsed" / "edits must decrease" rules are removed and replaced with an absolute safety cap (8h, or 2x the original elapsed, whichever is larger) so a fat-finger entry cannot corrupt stats.
- Editing a session up or down recalculates symmetrically: total focus time, day history, per-task totals, per-task daily minutes, adventure action minutes, XP (quiet level up/down), daily minute-quest progress, and reward/loot eligibility.
- Works in the post-session XP summary bubble and retroactively in session history. Additive only - no schema change, no data migration; pre-v7.6 records stay non-editable as before.
- Job 2: the v7 32x32 pixel avatar is replaced by a detailed, cel-shaded MMO-style armored knight - layered plate, pauldrons, plumed great-helm, detailed longsword, flowing cloak - rigged with separate limbs for smooth seven-state animation (rest, travel, fight, hunt, loot, craft, meditate). Namespaced `.v79-*` / `.fh79`; respects `prefers-reduced-motion`.
- Job 3: new standalone `prototype-v2.html` - a ground-up alternate layout (full-bleed world, HUD timer dial, MMO hotbar, slide-in panels). Separate file; uses its own `fhProtoV2` localStorage namespace and never touches main-app data.
- `sw.js` BUILD_ID bumped to `fh-2026-05-20-v7-9`.

## v7.8 - session-end edit time

- Added an Edit time control to the session-end XP summary for timed focus sessions and stopwatch logs.
- The editor supports reduce-only corrections with a minute field, -5/-10/-15/-20 quick buttons, Zero out, live XP preview, Save, and Cancel.
- Saving a correction subtracts the reduced minutes from total focus time, daily history, per-task totals, per-task daily minutes, and adventure action minutes.
- XP is recalculated against the adjusted minutes with quiet level-down support. If the edit crosses below the reward floor, the combo bump, focus daily progress, and rewarded session-log flag are rolled back.
- Session logs retain the original credited minutes via `adjustedFrom`; loot already rolled stays in inventory.
- `sw.js` BUILD_ID bumped to `fh-2026-05-17-v7-8`.
