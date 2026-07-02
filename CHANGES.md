# v10.0.0 — 2026-07-02

**FH3D "Forge" — the hero actually DOES things now**
- Ground-up animation engine: Rest sits by the fire, Travel walks (or rides), Fight swings the equipped weapon (bow draws, staff casts, duals alternate, unarmed boxes), Hunt stalks/aims, Craft kneels and hammers, Meditate floats cross-legged, Loot rummages. Live sessions run at full energy; idle plays a calm version.
- Fully articulated arms (shoulder→elbow→hand) and legs (hip→knee) — animations can never stretch or shear geometry.
- De-chibi proportions: human ≈7.4 head-heights; every race keeps identity via frame, not balloon heads. Builds (lean/balanced/broad) are far more visible; eye shapes/faces amplified; scars and smiles readable.
- Fixed: equipped mount never showed on the home card (scene name mismatch). Mount appears while travelling, as designed.

**Focus & flow**
- Battle log card removed from the timer card (post-session Battle Report stays).
- Start & ⏱️ Stopwatch now offer a one-tap task picker when you have 2+ tasks — pick and it starts instantly ("Start now" keeps the current task).

**Minutes → rewards**
- Minutes added in the edit tab now roll loot through the same pipeline as live sessions (and create a clawback-eligible session record). XP was already granted; loot completes it.
- Session editor: set an EXACT total for any session (not just ± deltas) and delete a whole session (fully reversing minutes/XP/loot) — from the Sessions tab or the editor sheet.

**Every day**
- Daily Recap card (Log section): today's minutes, sessions, XP, loot, streak, top task — plus a "Yesterday" recap toast on your first open each day.

**Achievements**
- "Create a task" (and friends) retro-unlock at boot and on creation — no more earned-but-locked.
- 12 new achievements: Full Quiver, Questmaster, Chain Lightning, Fortnight of Fire, Half-Century, Mythmaker, Six-Hour Day, Ultramarathon, Packrat, Dragon's Hoard, First Fortune, Tycoon.

**Gestures (rebuilt)**
- Rotating the 3D hero no longer switches tabs; swipes on scrollable strips are ignored; fast double-taps no longer eat button presses (CSS-level zoom suppression instead of a blanket preventDefault).
- Swipe left/right between sections with a haptic tick; swipe right inside any open sheet to close it.

**Offline**
- Service worker now serves versioned assets (fh3d.js?v=…) from the precache when offline — 3D no longer requires a connection. Everything still saves to this device instantly and syncs when a connection returns.

**Data integrity** — logged minutes and history untouched, as always. All edits/deletes go through the existing safe adjustment paths with previews, caps, clawback and pre-delete backups.

## v9.9.3 - arm proportions on short races, action-aware mount, calmer idle, bigger minutes box

- Fixed remaining "stretched limbs": arm bone lengths now scale with race height (goblin/dwarf arms were staying human-length after the v9.9.2 shear fix). Hands scale down to match.
- The home-card hero only rides the mount while the Travel action is active - resting/meditating/crafting shows the hero on foot. Character Studio full-loadout preview still shows the mount.
- Idle animation calmed way down (subtle breathing only); the energetic jog/gallop still kicks in while a session is running.
- Custom live-minutes input enlarged for easier tapping.
- sw.js BUILD_ID -> fh-2026-07-02-v9-9-3.

## v9.9.2 - limb-shear fix, honest headwear, custom live minutes, detail pass

- Fixed the "stretched limbs": goblin/dwarf/orc/fae body scaling used a non-uniform rig scale which sheared rotated limbs (worst while mounted/running). Race proportions are now baked into the joint plan; all transforms stay uniform.
- Headwear is honest: class hats/halos removed - a crown appears on your head only when you actually equip one. (Back-slung lutes, quivers, beads etc. stay.)
- Live session adjuster now takes CUSTOM minutes: +/- toggle, a minutes box, Apply (or press Enter). Same safe path as the -15/-5/+5/+15 buttons, same caps.
- Detail pass: articulated two-segment fingers with knuckles + thumb tip, kneepads on every outfit, boot heels and lace studs, elbow straps, belt side-studs, hip pouch on leathers/rogue/wraps, softer blink, brighter warm kick light, richer armor/cloth response, under-hero glow disc.
- Renderer + additive UI only; no data, sync, minutes or session logic touched. sw.js BUILD_ID -> fh-2026-07-02-v9-9-2.

## v9.9.0 - FH3D "Atelier": sculpted 3D hero, gear you can see, rebuilt mounts

- Ground-up remodel of the 3D character renderer (`fh3d.js`, FH3D v9 "atelier-v1"): joint-anchored rig (shoulders/elbows/wrists/hips/knees all connect - no more floating pieces), sculpted head with real eyes (iris/pupil/catchlight/blinking lids), brows, shaped nose/mouth per face trait, and proper 6.5-head heroic proportions.
- Race kits for all 11 species: elf/fae ears + fae glass wings & antennae, goblin fan ears + snaggletooth, orc underbite tusks + heavy brow, dwarf stout build + braided beard + bigger head, undead pale glow-eyed gaunt look, demon swept horns + spade tail, beastfolk cat/wolf muzzles + ears + tails + whiskers, lizardfolk snout + crest fins + thick tail.
- Per-class outfit sets so classes read at a glance: plate (cuirass/pauldrons/tassets/greaves), mage-cleric robes (skirt/mantle/rune trim), bard doublet + feathered hat + lute, rogue-shadow dark wraps + face mask, ranger-druid studded leathers + hood + quiver, monk-alchemist wraps + beads/vials.
- Equipped gear now truly shows on the model, gripped in hand: swords/greatswords/daggers/dual blades/axes/hammers/spears/scythes/bows(+quiver)/staves/wands/orbs/lutes/tomes; crowns/circlets/hoods/greathelms/halos on the head (light headgear keeps your hair); armor overlays with tier-tinted metal + gem; pets are shaped familiars (fox/dragonling/owl/wisp/slime/golem) that orbit and flap.
- Rarity aura: the pedestal ring tints and glows with your best equipped tier.
- Mounts rebuilt with real anatomy, saddle, bridle and reins - horse/unicorn/pegasus/stag, wolf, panther, eagle-griffin with layered feather wings, dragon with bat-wing membranes + horned reptile skull, skiff, aquatic and insect families - and the hero actually sits astride with bent knees, hands to the reins.
- Studio quality-of-life: drag to orbit now includes slight pitch, mouse-wheel zoom in Character Studio, idle breathing/blink/tail/wing animation, jog cycle while a session runs, `prefers-reduced-motion` respected.
- Reliability: FH3D renders a first frame synchronously on attach/sync so the 3D view (and its ready-flag) comes up even in background tabs; SVG fallback still kicks in when WebGL is unavailable.
- Gear tab labels clarified ("Empty - equip to show on hero" / "On your hero"); loot codex now tags equippable items with a "shows on hero" badge per slot.
- Pure renderer swap + tiny UI strings only: no gameplay, data, sync, minutes or session logic touched. `sw.js` BUILD_ID -> `fh-2026-07-02-v9-9-0`.

## v8.8.3 - realistic 3D character, per-creature mounts, edit ±

- Character rebuilt with realistic (non-chibi) proportions + toon outlines on a lighter stage so it reads as a deliberate stylized 3D game render (FH3D v4).
- PER-CREATURE mounts: equipped mount now renders as the right animal — bird family = an actual eagle (wings/beak/talons), dragon = dragon, equine = horse/unicorn, feline = panther, canine = wolf, elemental = skiff. Fixes "eagle shows as a horse".
- Session-end edit summary now has a ± delta adjuster (type a number, flip the sign) so you can subtract on iOS (numeric keypad has no minus).
- Loot-on-edit (already present) is unchanged and its toasts are visible (clawback on edit-down, RNG bonus roll on edit-up).
- All v8.8.0 gameplay/data preserved. `sw.js` BUILD_ID -> `fh-2026-06-06-v8-8-3`.

## v8.8.2 - clean chibi 3D character

- Rebuilt the 3D character with a cohesive **chibi** art style (FH3D v3): big expressive head, compact connected body, small balanced shoulders/hands — fixes the bulbous-pauldron / pot-belly / floating-gap lumpiness. Soft toon-ish PBR + image-based lighting, cute face (big eyes), and species traits read clearly (orc tusks, elf/demon ears, dwarf beard, demon horns).
- Redesigned mounts to match (chunky clean horse/unicorn/etc.); camera framing fits the whole character + pedestal.
- All v8.8.0 gameplay/data preserved (only `focus-hero.html` banner, `fh3d.js`, `sw.js`, `index.html`, `CHANGES.md` changed). `sw.js` BUILD_ID -> `fh-2026-06-06-v8-8-2`.

## v8.8.1 - 3D character re-merged onto v8.8.0

- Re-integrated the Three.js 3D character (`fh3d.js` + vendored `three.min.js`) on TOP of v8.8.0. The app now has the full v8.8.0 gameplay (47 mount sprites, 11-species/8-class customizer, world zones, eggs, loot rework, activity log, data migrations) AND a live 3D character on the home Hero card + a drag-to-rotate preview in Character Studio.
- The 3D bridge (`fh3dSpec`) reads the v8.6+ model: `CR_SPECIES` skin tones by `skinIdx`, `CR_HAIR_COLORS`/`CR_EYE_COLORS`, and `CR_CLASSES[class].primary/secondary` for armour/trim, so customization + class changes drive the 3D model. Equipped mounts map to a 3D mount by family via `fhInferMountFamily`.
- In-app notifications (toasts) lifted above the bottom hotbar.
- Pure renderer: NO changes to any gameplay/data/cloud code — every v8.8.0 JS module (loot-rework, character-rebuild, world-depth, shop-rework, character-v86-fix, eggs, v8.6.3-patch) is byte-identical to v8.8.0. The 3D layer only reads a state snapshot.
- `sw.js` BUILD_ID -> `fh-2026-06-06-v8-8-1`; `three.min.js` + `fh3d.js` added to precache.

## v8.4.1 - 3D fixes & visual overhaul

- Fixed: the home Hero card showed the old SVG because the shared 3D canvas was being parked in the hidden Character Studio at boot. Studio now only borrows the canvas while open; the modal observer moves it back to the home card on close.
- Overhauled the 3D look: heroic (slimmer) proportions, a real face + proper knight helm (no "robot dome"), image-based lighting (PMREM env map) so metal armour reflects, and a class-coloured chest emblem so changing class is visible.
- Redesigned the mount into a proper horse silhouette (two-segment legs, neck/head/muzzle, mane, tail); unicorn/griffin/stag/panther/wolf/skiff variants. A mount only ever appears when one is actually equipped.
- Fixed in-app notifications (toasts) being hidden behind the bottom hotbar — they now sit above it with a higher stacking order.
- `sw.js` BUILD_ID -> `fh-2026-06-06-v8-4-1` (forces clients to re-cache the updated `fh3d.js`).

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
