# v10.5.0 — 2026-07-18

**Live-parity corrections + Priority Expedition**
- Manual minute additions/removals now use the live session XP curve with the same current combo, streak, equipped-gear multiplier, and active XP boost. New session records preserve the applied XP/coin multipliers so later exact-total or +/- corrections gain or reverse the correct amounts instead of falling back to base XP.
- Added manual Priority mode. Each Priority run ends at an honor-system checkpoint: keep the full session only when priorities were followed, or cancel the entire run for zero minutes, XP, coins, loot, Orbs, materials, or farm growth.
- Added one organized Expedition tab. Eligible focus sessions earn deterministic Focus Orbs, seeds, and action-based farming materials; farm plots grow only from credited focus minutes. Orbs can accelerate crops, and harvested materials craft Focus Tonics, Forge Kits, and a third plot.
- Expedition rewards use a per-session event ledger. Editing or deleting a session updates that exact grant, while cloud merge keeps the newest correction per session and unions append-only spends/harvests. Existing profiles are initialized additively with no retroactive grants and no logged-minute rewrite.
- `sw.js` BUILD_ID -> `fh-2026-07-18-v10-5-0-expedition-priority`.

# v10.4.7 — 2026-07-17

**Calmer timer typography + consistent navigation**
- Added independent timer appearance settings: four typefaces, five weights down to extra-thin, six low-glare/custom color options, and a live preview. These are additive display preferences only; existing timer/session/accounting data is not migrated or rewritten.
- Removed decorative emoji from progression tabs, Focus Targets, Today so far, and the Stopwatch action. The mobile Sessions shortcut now uses the same monochrome-symbol treatment as the other navigation buttons.
- Removed the service worker's oversized Recover link injection. Recovery remains fully available from Settings → Backups, `recover.html` remains precached, and `data-guard.js` continues to be injected for rolling snapshots and wipe alarms.
- No minute addition/subtraction, exact-total editing, history, sessions, rewards, sync identity, or cloud-state logic changed. `sw.js` BUILD_ID -> `fh-2026-07-17-v10-4-7-ui-refinement`.

# v10.4.6 — 2026-07-16

**🧮 Exact minute accounting + clearer session controls**
- Daily Recap and the Sessions 30-day cards now read their minute/session totals from the authoritative `history` and `sessionHistory` ledgers. Standalone negative Time Ledger corrections no longer leave recap cards showing a larger stale sum of positive records.
- The Sessions timeline now includes standalone negative Time Ledger corrections (for example `−5m`) beside session records, so the visible history explains how the authoritative total was reached without rewriting past sessions.
- The session editor now labels the two supported paths explicitly: **Option 1 — add/subtract minutes** and **Option 2 — set the exact session total**. The exact-total field is prefilled with the current value, and the task-minute sheet links directly to Session History.
- Added an isolated regression for `19 + 6 + 70 + 10 − 5 = 100`, authoritative recap/session cards, visible `−5m` correction history, and both exact-total and ± session editing. No production player data is migrated or rewritten.
- `sw.js` BUILD_ID -> `fh-2026-07-16-v10-4-6-minute-accounting`.

# v10.4.5 — 2026-07-12

**🔐 Encrypted Claim stays encrypted**
- A successful Claim from an AES-GCM envelope now forces end-to-end encryption to remain enabled on the claiming device, even if an older local profile had the toggle off.
- This prevents the next legitimate sync from downgrading an encrypted row to plaintext. Claim itself remains GET-only; no existing cloud row or local state is changed until authentication, decryption, and strict state validation all succeed.
- `sw.js` BUILD_ID -> `fh-2026-07-12-v10-4-5-encrypted-claim`.

# v10.4.4 — 2026-07-12

**🔓 Supabase JSON-text payload compatibility**
- Claim now accepts an encrypted cloud envelope when a Supabase row's `data` field is returned as serialized JSON text, including bounded legacy double-serialization, before performing the existing AES-GCM authentication/decryption.
- Malformed or primitive payloads still fail closed. Claim remains read-only until a real object is authenticated, decrypted, and merged; failures never upload or alter the current local identity/data.
- Added an end-to-end encrypted regression fixture matching the production failure plus a malformed-text fail-closed case. No Supabase row/schema, logged minutes, sessions, history, XP, loot, inventory, or renderer behavior changed.
- `sw.js` BUILD_ID -> `fh-2026-07-12-v10-4-4-cloud-payload`.

# v10.4.3 — 2026-07-12

**☁️ Claim routes to the generated Supabase row**
- Entering a code from another device now selects the configured Supabase backend instead of inheriting a stale legacy JSONStorage backend and URL from the claiming device.
- This fixes the misleading "no cloud state" failure when Generate created the encrypted Supabase row successfully but an older PC profile was still pointed at JSONStorage.
- Claim remains transactional and read-only until a matching row is fetched, authenticated, decrypted, and merged. A failed Claim leaves local data, credentials, minutes, history, XP, and inventory unchanged and never uploads.
- Expired Supabase sessions still renew automatically; deleting browser `sb-*` localStorage keys is neither required nor used by Focus Hero's sync implementation.
- `sw.js` BUILD_ID -> `fh-2026-07-12-v10-4-3-claim-routing`.

# v10.4.2 — 2026-07-11

**🔐 Cloud claim and token safety**
- Claim is now transactional and identity-serialized: a missing, rejected, malformed, or undecryptable cloud row leaves existing data/credentials unchanged, Claim never uploads, and delayed responses from the prior identity cannot overwrite a completed claim.
- Expired anonymous Supabase sessions refresh with their cached refresh token or obtain a new anonymous session once; authentication failure stops the cloud request instead of reusing an expired bearer token.
- A blank-looking 0-minute profile requires typing `NEW PROFILE` before Generate can create a new cloud identity. The Sync panel tells users to open Recovery or claim from the data-bearing device when hours are missing.
- Only Generate receives one-time permission to create a missing row; rev-zero automatic saves/heartbeats fail closed. Generate also clears the old JSONStorage URL only after committing the new identity.
- Sync now refuses its force-push path when there is neither a successful pull nor a previously confirmed cloud revision. A confirmed row is protected from a >90% local-total collapse relative to the local recovery snapshot. Exported backups and encrypted cloud blobs omit device bearer/refresh credentials.
- No Supabase schema, minute accounting, XP, loot, inventory, or renderer behavior changed. `sw.js` BUILD_ID -> `fh-2026-07-11-v10-4-2-sync-safety`.

# v10.4.1 — 2026-07-11

**🔒 Private cloud-backup readiness check**
- The scheduled Supabase verifier now records only aggregate status (`rowCount` and newest `updated_at`). It never downloads or commits player rows, encrypted state blobs, row IDs, or sync-secret hashes into this public repository.
- A missing service-role secret still fails loudly, and the public status trail remains useful for confirming that protected cloud rows exist and are fresh.
- Fixed a time-only reward leak: LIFEMAXXING/time-only timer and stopwatch sessions can still unlock earned achievement badges and advance target bars, but those paths now suppress achievement XP and target-chest XP/loot. They remain minutes/streak only, including edit-up and ledger paths.
- Existing XP, loot, minutes, sessions, history, and cloud data are not clawed back or rewritten. `sw.js` BUILD_ID -> `fh-2026-07-11-v10-4-1-safety`.

# v10.3.1 — 2026-07-10

**🧾 Battle Report edit loot clawback**
- Reducing a session's minutes from the post-session edit flow or Sessions tab now previews any loot that will be removed if the corrected minutes fall below that loot tier's threshold.
- The save path re-checks the session's drops by rarity threshold and removes only drops from that exact session that are no longer eligible. Allowed lower-tier drops stay; unrelated sessions stay untouched.
- Session summaries now refresh their displayed loot after a clawback, so they do not keep pointing at an item that was removed.
- Safety: this only responds to an intentional session-minute edit and only mutates loot that was earned by that edited session. Logged minutes/history are still changed only by the edit value itself.
- `sw.js` BUILD_ID -> `fh-2026-07-10-v10-3-1`.

# v10.3.0 — 2026-07-10

**🎁 Target Chests + visible Sessions**
- Daily and weekly adaptive Focus Targets now present their Easy / Medium / Hard tiers as actual chest rewards: Daily/Weekly Supply Chest, Royal Chest, and Legendary Chest. Crossing a tier still uses the existing v10.2 reward path, so XP and loot odds stay aligned with the minutes required for that chest.
- Added a dedicated **🎯 Targets** tab in Progression. The compact dashboard target card now has an **Open Targets** shortcut, and the full tab shows the chest rack plus a plain data-safety note.
- Added a bottom-nav **Sessions** shortcut that opens the existing Sessions tab directly, so recent sessions are no longer buried in the long rewards tab row.
- Safety: targets still read `state.history` only for progress/calibration and never edit logged minutes, hours, tasks, sessions, streaks, or history. Chest opening only adds the intended one-time XP/loot reward through the existing reward engine.
- Rollback: the previous production source is the v10.2.0 commit (`3967a61`) and will be tagged before this deploy as `pre-v10.3-target-chests`.
- `sw.js` BUILD_ID -> `fh-2026-07-10-v10-3-0`.

# v10.2.0 — 2026-07-09

**🎯 Daily & Weekly Focus Targets (adaptive)**
- New goal system on the dashboard: a **Today** bar and a **This week** bar, each with three stacked tiers — **Easy / Medium / Hard**. Cross a tier and you’re rewarded through the *exact same engine as a real session*: session-scale XP (`awardXp`) **plus** a real loot roll (`runSessionRewardPipeline`) sized to that tier’s minutes, so the loot quality matches a session of that length. Bigger tier = bigger reward. Missing a target costs nothing.
- **Adaptive sizing:** tiers auto-calibrate to your own rolling average (last 21 active days). Medium ≈ a typical day, Easy ≈ half, Hard ≈ 1.5×; weekly scales from your daily Medium (×3 / ×5 / ×7). With little history it starts gentle (30/60/90 min) and tunes up as you log more. Recalibrates once per day/week so thresholds never move under your feet mid-day.
- **No retro-burst:** on first install, any tier you’ve *already* met today/this week is baselined as claimed — you earn from your next crossing forward, not from past minutes. Rewards are claimed-once and reset each day / ISO week.
- Time-only (LIFEMAXXING) minutes still count toward your hours goal (consistent with how achievements count all focused time); no individual time-only session earns loot/XP — those gates are untouched.

**How it’s built (safety):**
- Implemented as a single self-contained trailing `<script>` module that *wraps* existing globals (`commitFocusTimerSession`, `finalizeStopwatch`, `applyTaskTimeAdjustment`, `applySessionEdit`, `deleteSessionRecord`, `renderAll`) and renders its own card. **Zero edits to the core app script** — verified byte-identical to a pristine clone. Fully reversible (delete the block).
- Reads `state.history` only; never writes logged minutes. `sw.js` BUILD_ID -> `fh-2026-07-09-v10-2-0`. `fh3d.js` unchanged (its `?v=` intentionally left as-is).
- Verification: `node --check` on all three inline `<script>` blocks + `sw.js`; targets module behavioral suite (21 assertions) green — adaptive calibration, anti-retro-burst baseline, grant-once (no double), XP/loot session-parity, weekly summing, day/week reset; core 41-assertion regression still holds because the main script is unchanged.

# v10.1.2 — 2026-07-09

**🗑️ Removed the "VS" encounter card**
- The little card on the timer screen that pitted your Hero against an action-flavored "objective" — Open Road while travelling, Reward Cache while looting, Trail Signs while hunting, Forge Bench / Focus Orb, or a monster-of-the-day while fighting — has been removed. You said it was distracting and didn't add anything, so it's gone. The 3D hero, the progress bar, the active-task row and the Daily Recap are all untouched.
- Pure presentational change: only the card's markup was deleted. `renderEncounterStage()` already self-guards (`if(!stage) return`), so no code path breaks; the now-unused CSS is left in place (harmless) to keep the change tiny and reversible.
- Under the hood: markup removed from `index.html` and `focus-hero.html` (still byte-identical); `sw.js` BUILD_ID -> `fh-2026-07-09-v10-1-2`. `fh3d.js` is unchanged, so its `?v=` query is intentionally left as-is.
- Verification: `node --check` on `fh3d.js`, `sw.js`, and both inline `<script>` blocks; behavioral regression suite (41 assertions) green — 660-minute ledger credit exact, session edit up/down absolute set, full session-delete reversal, LIFEMAXXING time-only gate (minutes yes, XP/loot zero), and `sum(dailyMin)==totalFocusMin`. No session, minute, XP, loot, coin or streak logic was touched; live user data confirmed unchanged before/after deploy.

# v10.1.1 — 2026-07-06

**♿ Live reduce-motion for the 3D hero**
- The FH3D renderer now honors your OS "reduce motion" setting *live*. Previously it only checked once when the app loaded — so turning the setting on or off while Focus Hero was open didn't change the hero animation (the rest of the UI already updated live via CSS). Now the 3D loop tracks the change: enable reduce-motion and the hero holds a calm static pose; turn it back off and the animation resumes. Renderer-only gate; no session, minute, XP, loot or streak logic is touched.
- Under the hood: `fh3d.js?v=` and `sw.js` BUILD_ID bumped to `fh-2026-07-06-v10-1-1`; `index.html` and `focus-hero.html` remain byte-identical.
- Verification: `node --check` on `fh3d.js` and both inline `<script>` blocks; behavioral regression suite (48 assertions) green — 660-minute ledger credit exact, session edit up/down, full session-delete reversal, LIFEMAXXING time-only gate (minutes yes, XP/loot zero), and `sum(dailyMin)==totalFocusMin`. Live user data confirmed unchanged before/after deploy.

# v10.1.0 — 2026-07-02

**🌿 Time-only tasks (LIFEMAXXING)**
- Tasks named like "LIFEMAXXING" are now time-only: sessions log minutes and keep your streak, but never award XP, loot or coins — living well is its own reward. Applies to live sessions (stopwatch + timer), edit-tab minute additions, and session edit-ups (no reward re-grants, no bonus rolls).
- One-shot cleanup on first open: every past LIFEMAXXING session is stripped of its XP and loot (Midas gauntlet and friends go back to the void, unequipped if worn). Minutes, streak and history are untouched. State is backed up locally first; a log line lists exactly what was reversed.
- 🌿 badge on time-only tasks in the task list.

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
