# Focus Hero v10.9.5 diverse-avatar and session-integrity candidate

This isolated candidate updates Focus Hero without opening or modifying a signed-in player profile, browser storage, production cloud row, credentials, backups, or recovery material.

DO NOT DEPLOY OR USE THIS CANDIDATE WITH A CURRENT PLAYER PROFILE.

This candidate is for source inspection and synthetic testing only.
Do not connect it to production cloud data during review.

## Outcome

- The current Supabase cloud remains the application cloud. No AWS runtime or AWS backup dependency was added.
- This candidate no longer loads the legacy character-renderer runtime. Its two runtime files and focused tests remain preserved in a separate local archive outside this candidate.
- A deterministic 64×64 code-native pixel hero now reflects class, species, build, hair, face shape, eye shape, exact skin tone, helmet preference, equipped weapon/armor/helmet, pet, mount, and the current session action without reading storage or the network.
- Four genuinely different avatar templates are selectable: Compact Cozy, Detailed MMO, Graphic Arcade, and Isometric Tactical. No style is tied to race, skin tone, facial structure, body type, or hairstyle.
- Character Studio provides independent diverse controls, including ten direct skin-tone swatches, seven face shapes, six body builds, the fourteen established hairstyles, and thirteen additional textured/fade/braid/loc options.
- New appearance choices use additive compatibility fields. Older and offline clients retain the fields they do not understand; established choices such as wavy hair or dreadlocks are not normalized back to short.
- Avatar, Character Studio, and equipment preview reads are non-mutating. Appearance changes still save only through the existing explicit customizer action.
- Four complete display shells already remain available: Modern Focus, Arcane Command, Frontier Craft, and Tactical Ops. These are presentation-only and independent of any vault or ledger design.
- Time edits share one accounting path across live sessions, task totals, Session History, Analytics, the post-session editor, and Battle Report.
- Both exact-total replacement and relative plus/minus correction are available on every time-edit surface.
- Manual added time counts as a session. Retried operation IDs cannot count the same addition twice.
- Reductions edit the newest matching session records and reverse their real XP, coins, eggs, loot, Orbs, farming materials, and session counts.
- Session History retains pause duration and time-change details.
- Fight edit rewards use the same encounter walls as live Fight sessions. Peaceful edits do not invent extra loot rolls.
- Concurrent cloud additions are additive when session evidence proves them. Reductions and deletions follow the newest proven session revision. Ambiguous accounting baselines stop sync before changing local state.
- The repeated session-path message is gone. The permanent Hero-vs-target card defaults to hidden; Status Ribbon, Journey Strip, and Text Pulse now each have genuinely distinct compact behavior.
- A read-only Session History integrity check reports duplicate session, manual-operation, reward-drop, farming, and spending identifiers; it never repairs or deletes data.

## Safety boundary

This is a source candidate, not a recovery point and not player-data truth. Do not import a historical profile, clear browser data, force-sync, restore, normalize, or roll back a current profile.

The existing local Data Guard, exact primary-storage read-back, last-known-good state, session/drop/instance tombstones, encrypted cloud payload, offline queue, cloud revision checks, and fail-closed accounting boundary remain intact. The service worker no longer programmatically deletes earlier complete Focus Hero caches during install or activation.

No AWS work is required by this application change. The durable release policy still requires an independent, implementation-neutral recovery copy and a successful isolated restore drill before an automated writer or production deployment is authorized. That recovery copy does not need to be AWS.

## Verification

Run every tests/*.test.mjs file with Node. Browser-backed tests require Playwright and a local Chrome installation. When Playwright is not resolved automatically, set FOCUS_HERO_PLAYWRIGHT to its installed package path.

Manual review must use an isolated synthetic browser profile served only from 127.0.0.1, with production sync disabled and external requests blocked or mocked.

Required checks include:

1. both HTML entry files are byte-identical;
2. inline and external JavaScript parse;
3. every exact/relative editor surface remains present at runtime;
4. 20 + 70 equals exactly 90 and operation retries are idempotent;
5. task reductions reverse session-linked rewards;
6. peaceful and Fight reward thresholds match their live paths;
7. concurrent additions, reductions, offline queueing, and conflict refusal pass;
8. the pixel hero is deterministic, integer-grid-only, appearance-aware, equipment-aware, offline-safe, and free of legacy renderer hooks; every visual style and hairstyle has distinct geometry, direct tone swatches render exactly, and legacy appearance choices survive normalization;
9. every selectable encounter presentation has distinct tested behavior;
10. service-worker, manifest, and runtime-package references agree;
11. the complete synthetic suite passes on the exact packaged files.

Final exact-tree result: **37/37 test files and 168/168 top-level tests passed**, with zero failures, skips, cancellations, or todo items. The focused avatar subset passed 22/22.

Passing synthetic tests proves only this source tree. It does not prove the current signed-in cloud row is synchronized, because private player data is deliberately outside routine source verification.

## Runtime package

PACKAGE_CONTENTS.md is the deny-by-default public runtime allowlist. Tests, review notes, old service workers, prototypes, credentials, browser files, recovery material, and prior archives are not runtime assets.

## Version markers

- Candidate: 10.9.5
- Data schema: 16
- Service-worker build: fh-2026-08-01-v10-9-5-diverse-avatars

These markers identify source code only. They never identify a player-data recovery point.
