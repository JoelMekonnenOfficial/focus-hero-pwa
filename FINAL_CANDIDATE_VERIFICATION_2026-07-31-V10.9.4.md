# Focus Hero v10.9.4 exact-candidate verification — 2026-07-31

## Result

**Source candidate verified: 34/34 test files passed; 154/154 top-level tests passed; 0 failed, skipped, cancelled, or todo.**

The test runner was split into bounded groups because the combined browser suite exceeds the execution window. Every `tests/*.test.mjs` file received a complete passing run. No result was inferred from a timed-out partial run.

This is source and synthetic-fixture evidence only. It is not production-player-data evidence, a cloud-sync receipt, a recovery copy, an independent release approval, or a deployment authorization.

## Scope and invariants

- Candidate: `10.9.4`
- Service-worker build: `fh-2026-07-31-v10-9-4-pixel-hero`
- Data schema: unchanged at `16`
- Signed-in Focus Hero profile opened: **no**
- Browser storage or private player payload read: **no**
- Production cloud row or credential used: **no**
- Restore, import, migration, force-sync, reset, or deployment performed: **no**
- AWS dependency added: **no**
- Existing cloud/accounting behavior changed by the pixel-renderer retirement: **no**

## Verified outcomes

- `index.html` and `focus-hero.html` are byte-identical.
- `fh3d.js` and `three.min.js` are physically absent from the candidate and public package.
- Exact retired runtime hooks are absent from all allowlisted runtime files.
- The retired runtime and its focused tests remain hash-verified outside the candidate at `C:\Users\joe4k\Documents\Codex\Focus Hero 3D Archive 2026-07-31`.
- `pixel-avatar.js` is deterministic, input-only, storage-free, network-free, integer-grid-only, reduced-motion aware, and reflects class, race, build, hair, face, helmet preference, equipped weapon/helmet/armor, pet, mount, scene, and action.
- Status Ribbon, Journey Strip, Text Pulse, and No permanent card have distinct tested behavior.
- Failed service-worker install and activation perform no cache deletion; earlier complete Focus Hero caches remain owner-controlled.
- Public runtime stays deny-by-default and is a complete offline shell.
- Synthetic cold-offline boot, pending work, reconnect flush, and verified re-enable upload pass.
- Time accounting explicitly proves **20 + 70 = 90**, idempotent retries, and duplicate-evidence detection.
- Edit-up/edit-down reward parity, threshold grants/clawbacks, XP, eggs, targets, loot, mounts, Orbs, farming, pause/change history, and session counts pass.
- Cloud-sync checks fail closed on missing, stale, malformed, ambiguous, unauthenticated, or delayed evidence.

Focused evidence includes:

- Pixel renderer: 8/8
- Retired-runtime/package boundary: 8/8
- Encounter presentation layouts: 4/4
- Cache/offline-shell retention: 8/8
- Session loot entitlement scenarios: 13/13
- Sync-hardening scenarios: 25/25
- Milestone scenarios: 16/16
- Full suite: 34/34 files, 154/154 top-level tests

## Entry-file seal

Both entry files:

`SHA-256 f24bb0b8cffd182a94c5c81d4e9239c8517c69172eea10248c543a7fb1fbe89a`

## Exact public runtime allowlist

| File | Bytes | SHA-256 |
|---|---:|---|
| `index.html` | 948671 | `f24bb0b8cffd182a94c5c81d4e9239c8517c69172eea10248c543a7fb1fbe89a` |
| `focus-hero.html` | 948671 | `f24bb0b8cffd182a94c5c81d4e9239c8517c69172eea10248c543a7fb1fbe89a` |
| `recover.html` | 25547 | `1c6eca87eb47ae054afe1e560e64a03632e71e4549567486cd2d5fafaea7bbf5` |
| `sw.js` | 12030 | `37ef988d6b5d1c0ed3e28101822afd3602cd51ccb9d43fb3f1338fcb4e261e7a` |
| `manifest.webmanifest` | 1268 | `1737e2a507a0cfdca2888b18bc5f204598f12aefb875e4cf23d9cab70e660979` |
| `focus-hero-logo.svg` | 2012 | `54ede3a8ef1ca00b0ea0b898c6ae9dac1afb94de64c4b8d5fb2c808d14090f70` |
| `icon-192.png` | 19041 | `e3dd32636aa36413d7d7c0f391344ee00d3f9770be61d465d765abaed81ccc36` |
| `icon-512.png` | 66389 | `1b3e59a6c3650e65444315d6b5151d4d29a64d35fff8c2d2ad9600153752062a` |
| `pixel-avatar.js` | 21083 | `1a86b0e4cab9bccff960722a7f8373c3f41b04dac604401a0803cc8b4b915055` |
| `data-guard.js` | 39352 | `c2de47fbba711c3230ed356df2357427d63a56481f6bce7bb88fcac6129755a7` |
| `focus-economy.js` | 50731 | `8fa7a4c506e6a4a3a627ed766b66c7d33ee1df388632aea228229227403207bb` |
| `loot-purpose-actions.js` | 39534 | `f5614b7b08a9c17d8a98ee9383b87746bffc47833a4f246e403b3d574a421e25` |
| `gear-utility.js` | 37852 | `99277e0d1507a942259cb5c623e72a8821844dfb6cafd047d0f36f8f99bfa3fe` |
| `progression-hub.js` | 30141 | `c110c1f8c2590bf9be6f90fc0b7d8bcbeaffa686201e63ff0459d9600aac8250` |
| `game-shells.js` | 39853 | `98bca4dcce2f81eb8df35ae07ad6a570f2a24cc150208c5a500e0d07fec928da` |
| `loot-rework.js` | 149425 | `14873c2882c0e104cac61b6a9c0ec793194ccd0c247724259b3f4eadcfc32865` |
| `character-rebuild.js` | 80742 | `2bace50300bab9902961db6c9cd8c641e0024b8aab951e94de201ed0ee0ddf8c` |
| `world-depth.js` | 101834 | `f9fc53cade722239a5828d6278bb583ebfae15ed7874297c1346bdc27e1cbf4e` |
| `shop-rework.js` | 31409 | `978ac00f35aed1ed86aaeffa0ee73d817e63830bfdf99c87444420a24ccb046e` |
| `character-v86-fix.js` | 54314 | `ceb9a4492305adc6b6bfa11d370bbc9ddefd8cfd10693ecc0d04d0e1982dc6a5` |
| `eggs.js` | 31000 | `5a063f12b84e4cae079c6c5cd44ee6cea1db28c2aebbc11e09f43735cf82f794` |
| `v8.6.3-patch.js` | 15371 | `91e6fd4e25ed40b62dbc4039773074eecc5c708ef414a4bf80179f4881f8e667` |

The table was generated from the marked allowlist in `PACKAGE_CONTENTS.md`, not from a hand-selected subset.

## Release status

The source candidate is complete and locally verified. Production remains unmodified.

A real recovery drill still requires an owner-controlled independent copy and owner-generated narrow access that the app, Codex, Claude, scheduled tasks, and deploy credentials cannot administer or erase. Independent code review/approval and the protected deployment step also remain external release gates.
