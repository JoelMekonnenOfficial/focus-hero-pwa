# Focus Hero v10.9.5 final candidate verification — 2026-08-01

Status: **SOURCE-ONLY REVIEW CANDIDATE — NOT DEPLOYED**

## Safety boundary observed

- No signed-in Focus Hero profile, private player payload, browser storage, sync code, production cloud row, credential, backup, recovery artifact, or historical snapshot was opened or changed.
- No restore, rollback, import, force-sync, deployment, GitHub release, Cloudflare change, AWS change, or scheduled writer action occurred.
- The candidate was copied from the fully verified v10.9.4 source and edited only inside the isolated v10.9.5 folder.
- Prototype PNGs are stored outside the public runtime package and contain no player data.

## Bounded source delta

Runtime/source changes relative to v10.9.4 are limited to:

- mirrored app entries: focus-hero.html and index.html;
- pure presentation renderer: pixel-avatar.js;
- renderer cache/version markers: sw.js and manifest.webmanifest;
- focused avatar tests and source-review documents.

No time, reward, accounting, session, offline queue, sync, cloud, recovery, world, farming, combat, milestone, or gameplay module changed.

## Implemented avatar system

- Four independent geometry presets: Compact Cozy, Detailed MMO, Graphic Arcade, and Isometric Tactical.
- No visual preset is selected by or coupled to race, skin tone, class, facial structure, body type, or hairstyle.
- Character Studio exposes original-preservation mode plus 27 directly selectable hairstyles, 10 exact skin-tone swatches, 5 body silhouettes, 7 face shapes, 12 hair colors, 8 eye colors, species, class gear, and equipment presentation.
- Every displayed concrete hairstyle has distinct pixel geometry; compact and round builds no longer fall back to balanced.
- Direct skin-tone swatches render their exact catalog hex value.
- Additive fields (visualStyle, hairStyle, skinTone, bodyStyle, faceShape) preserve older/offline-client compatibility. Legacy and unknown future fields are not erased.
- Avatar and Character Studio render paths use non-mutating readers. Explicit customizer input remains the appearance write path.

## Verification result

- Focused avatar suite: **22/22 passed**.
- Complete exact-tree suite: **37/37 files; 168/168 top-level tests passed**.
- Failures: 0. Skipped: 0. Cancelled: 0. Todo: 0.
- Browser-backed suites used the preserved workspace-local Playwright runtime and synthetic localhost fixtures with cloud writes disabled.
- Independent read-only geometry review found no avatar defect: four distinct presets, all displayed styles/builds/faces distinct, exact swatches, no race/style coupling, no storage/network API in the renderer, and compatibility fields preserved.

Passing tests prove this source tree only. They do not claim that a private signed-in production row is synchronized.

## Critical hashes

- Mirrored HTML SHA-256: 2b2130fe5fda27f93cbcfaf693a34c611853558533808fd90cadc61228311538
- Pixel renderer SHA-256: 57dd1ecfab0fae826361c0b267ca2761e378fd2e1c705f57ef875088416dcb6d
- Service worker SHA-256: ffabda5e893555a1c19c6d225f628b5f9ed88321d35af9bfd172a10200b3d3b7
- Manifest SHA-256: 566f184b2c67bd294706eb08d7677818db6b4ef225ed2140a646d6f1a1a398dd
- focus-hero.html and index.html: byte-identical.

## Public runtime allowlist seal

| File | SHA-256 |
|---|---|
| index.html | 2b2130fe5fda27f93cbcfaf693a34c611853558533808fd90cadc61228311538 |
| focus-hero.html | 2b2130fe5fda27f93cbcfaf693a34c611853558533808fd90cadc61228311538 |
| recover.html | 1c6eca87eb47ae054afe1e560e64a03632e71e4549567486cd2d5fafaea7bbf5 |
| sw.js | ffabda5e893555a1c19c6d225f628b5f9ed88321d35af9bfd172a10200b3d3b7 |
| manifest.webmanifest | 566f184b2c67bd294706eb08d7677818db6b4ef225ed2140a646d6f1a1a398dd |
| focus-hero-logo.svg | 54ede3a8ef1ca00b0ea0b898c6ae9dac1afb94de64c4b8d5fb2c808d14090f70 |
| icon-192.png | e3dd32636aa36413d7d7c0f391344ee00d3f9770be61d465d765abaed81ccc36 |
| icon-512.png | 1b3e59a6c3650e65444315d6b5151d4d29a64d35fff8c2d2ad9600153752062a |
| pixel-avatar.js | 57dd1ecfab0fae826361c0b267ca2761e378fd2e1c705f57ef875088416dcb6d |
| data-guard.js | c2de47fbba711c3230ed356df2357427d63a56481f6bce7bb88fcac6129755a7 |
| focus-economy.js | 8fa7a4c506e6a4a3a627ed766b66c7d33ee1df388632aea228229227403207bb |
| loot-purpose-actions.js | f5614b7b08a9c17d8a98ee9383b87746bffc47833a4f246e403b3d574a421e25 |
| gear-utility.js | 99277e0d1507a942259cb5c623e72a8821844dfb6cafd047d0f36f8f99bfa3fe |
| progression-hub.js | c110c1f8c2590bf9be6f90fc0b7d8bcbeaffa686201e63ff0459d9600aac8250 |
| game-shells.js | 98bca4dcce2f81eb8df35ae07ad6a570f2a24cc150208c5a500e0d07fec928da |
| loot-rework.js | 14873c2882c0e104cac61b6a9c0ec793194ccd0c247724259b3f4eadcfc32865 |
| character-rebuild.js | 2bace50300bab9902961db6c9cd8c641e0024b8aab951e94de201ed0ee0ddf8c |
| world-depth.js | f9fc53cade722239a5828d6278bb583ebfae15ed7874297c1346bdc27e1cbf4e |
| shop-rework.js | 978ac00f35aed1ed86aaeffa0ee73d817e63830bfdf99c87444420a24ccb046e |
| character-v86-fix.js | ceb9a4492305adc6b6bfa11d370bbc9ddefd8cfd10693ecc0d04d0e1982dc6a5 |
| eggs.js | 5a063f12b84e4cae079c6c5cd44ee6cea1db28c2aebbc11e09f43735cf82f794 |
| v8.6.3-patch.js | 91e6fd4e25ed40b62dbc4039773074eecc5c708ef414a4bf80179f4881f8e667 |

## Prototype board seal

Prototype folder: C:\Users\joe4k\Documents\Codex\Focus Hero Diverse Avatar Prototypes 2026-08-01

| File | SHA-256 |
|---|---|
| 01-compact-cozy-diverse.png | faa37c38cd274e25666f33085c000cdf9cf967159e141a66c2d3cc6a5c4b631d |
| 02-detailed-mmo-diverse.png | 7351a37953b02f3966959fb177b3b0d20de7ea3b681389efc7e98c133184e8f5 |
| 03-isometric-tactical-diverse.png | 800f1bc1dcca2ff684e457b5e0bfa7136e3bd50dbe5772978c00f77eb3f935a7 |
| 04-graphic-arcade-diverse.png | 8587c2fba3f90875c2aae79d21859f2b4e849475c0d140ebac685093008a2f9d |

## Independent review checklist

1. Confirm the source delta stays avatar/presentation-only.
2. Confirm all four presets and the complete hairstyle/build/face matrix remain geometrically distinct.
3. Confirm exact tone swatches, legacy preservation, and HTML mirror equality.
4. Confirm service-worker build, renderer query, manifest version, allowlist, and precache agree.
5. Keep production deployment outside this review unless the owner separately authorizes it through the protected release boundary.
