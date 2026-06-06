## v8.4 - real-time 3D character, mounts & gear

- New 3D hero system (`fh3d.js`, Three.js r160 vendored locally as `three.min.js` for offline-first). Replaces the flat SVG avatar with a stylized, game-quality 3D character: PBR materials, three-point lighting, soft shadows, a pedestal diorama, and idle/active animation.
- Live 3D preview on the **home hero card** (auto-rotating, drag to spin) and a large drag-to-rotate stage in **Character Studio** that updates instantly as you change appearance, class, gear or mount.
- Customization is fully wired: skin, hair (short/long/mohawk/braids/shaved/+colour), eyes, race traits (elf ears, dwarf beard, orc tusks), build, face, helmet (open/closed/crest), armour colour, trim/accent and cloak all drive the 3D model.
- 3D gear: weapons (whetstone blade, dualblade), helmet pieces (Crown of Flow, Tome circlet), the Moonplate Vest glow, and a floating companion pet — all tier-tinted.
- 3D mounts the hero rides: Wolf, Unicorn (horn), Griffin (wings, flap + gallop), Astral Stag (antlers), Phase Panther, and the Void Skiff (hover board). Gallop animation while a focus session is running.
- Progressive enhancement: if WebGL/Three.js is unavailable the existing SVG avatar remains the fallback. The 3D layer is a **pure renderer** — it only reads a snapshot of `appearance`/`equipped` and never touches state, localStorage, focus minutes/hours, XP, or Supabase cloud sync. Render loop pauses when the tab/preview is hidden (battery-friendly).
- `sw.js` BUILD_ID bumped to `fh-2026-06-06-v8-4`; `three.min.js` + `fh3d.js` added to the precache.

## v8.3 - safe-area, accurate stopwatch, offline-first

- CSS: `.app` and the achievement banner now respect `env(safe-area-inset-bottom/top/left/right)` so the app nav bar, content edges, and top-of-screen banners are no longer covered by the iOS home indicator, Android nav bar, or notch.
- Stopwatch / timer accuracy: the display tick rate moved from 250 ms to 100 ms (10 Hz), and the per-second tick sound now fires once per actual second boundary regardless of tick rate. Combined with the existing timestamp-based elapsed math, the visible time stays within 1/10 s of wall-clock.
- Visibility / wake: on `visibilitychange` (visible) and `pageshow`, the timer is force-re-rendered so the displayed seconds jump to the correct value immediately after returning from background — no more "seconds skip when I switch back" feel.
- Offline-first: `cloudPush` and `cloudPull` are now gated on `navigator.onLine` — when offline, no network calls are made (zero wasted cellular data) and `state.sync.dirty` is set. The new `online` event listener flushes the dirty state and restarts pull polling; the `offline` listener stops the pull poll. All local writes (`saveState`) continue to work unchanged, so the app remains fully usable with no network.
- `sw.js` BUILD_ID bumped to `fh-2026-05-30-v8-3`.

## v7.9 - session time edits both ways; MMO character rework; alternate prototype

- Job 1: the session-time editor now accepts UPWARD corrections, not just reductions. The old "clamp at original elapsed" / "edits must decrease" rules are removed and replaced with an absolute safety cap (8h, or 2x the original elapsed, whichever is larger) so a fat-finger entry cannot corrupt stats.
- Editing a session up or down recalculates symmetrically: total focus time, day history, per-task totals, per-task daily minutes, adventure action minutes, XP (quiet level up/down), daily minute-quest progress, and reward/loot eligibility.
- Works in the post-session XP summary bubble and retroactively in session history. Additive only - no schema change, no data migration; pre-v7.6 records stay non-editable as before.
- Job 2: the v7 32x32 pixel avatar is replaced by a detailed, cel-shaded MMO-style armored knight - layered plate, pauldrons, plumed great-helm, detailed longsword, flowing cloak - rigged with separate limbs for smooth seven-state animation (rest, travel, fight, hunt, loot, craft, meditate). Namespaced `.v79-*` / `.fh79`; respects `prefers-reduced-motion`.
- Job 3: new standalone `prototype-v2.html` - a ground-up alternate layout (full-bleed world, HUD timer dial, MMO hotbar, slide-in panels). Separate file; uses its own `fhProtoV2` localStorage namespace and never touches main-app data.
- Zoom-lock: the app and prototype are now viewport-locked - pinch-zoom, double-tap zoom and iOS gesture zoom are blocked (single-finger scrolling still works) so the layout cannot be accidentally zoomed.
- `sw.js` BUILD_ID bumped to `fh-2026-05-21-v7-9`.

## v7.8 - session-end edit time

- Added an Edit time control to the session-end XP summary for timed focus sessions and stopwatch logs.
- The editor supports reduce-only corrections with a minute field, -5/-10/-15/-20 quick buttons, Zero out, live XP preview, Save, and Cancel.
- Saving a correction subtracts the reduced minutes from total focus time, daily history, per-task totals, per-task daily minutes, and adventure action minutes.
- XP is recalculated against the adjusted minutes with quiet level-down support. If the edit crosses below the reward floor, the combo bump, focus daily progress, and rewarded session-log flag are rolled back.
- Session logs retain the original credited minutes via `adjustedFrom`; loot already rolled stays in inventory.
- `sw.js` BUILD_ID bumped to `fh-2026-05-17-v7-8`.
