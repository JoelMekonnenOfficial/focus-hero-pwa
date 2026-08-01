# Focus Hero v10.9.3 exact-candidate verification

Date: 2026-07-31  
Build: `fh-2026-07-31-v10-9-3-session-integrity`  
Status: **LOCAL SOURCE CHECKS GREEN — LIVE PLAYER DATA UNTOUCHED — NOT DEPLOYED**

This record covers only the isolated source candidate in this directory. No signed-in Focus Hero profile, browser storage, private cloud row, credential, sync identity, recovery material, or production deployment was opened or changed.

## Verified behavior

- Exact-total replacement and relative minute edits use one guarded path across live Focus, Stopwatch, task edits, completed-session edits, post-session edits, Session History/Analytics, and Battle Report.
- Positive manual time creates one idempotent session; reductions edit the newest source sessions first; session counts track zero crossings.
- Session History records pause and time-change detail.
- Reward edits follow live-session thresholds. Additions can award newly crossed XP, coins, eggs, loot, Targets, Orbs, and farming materials; reductions reverse the exact crossed entitlements and provenance-backed salvage.
- The read-only integrity audit reports duplicate session, operation, drop, farming, and spend evidence without silently repairing or deleting anything.
- Concurrent cloud session evidence adds; edits and tombstones project downward; ambiguous changed evidence fails closed before state mutation.
- Offline pending-session recovery and reconnect behavior remains covered.
- The unnecessary session-path instruction was removed, and the battle presentation can be hidden or switched among three lighter prototypes.
- Existing Supabase/offline architecture is retained. No AWS runtime or backup dependency was added.

## Exact verification result

The complete final tree was run as 35 isolated test files with two bounded workers so a browser process could not trap the whole suite.

- Test files: **35 passed / 0 failed**
- Tests: **143 passed / 0 failed**
- Skipped: **0**
- Cancelled: **0**
- Duration: **106.519 seconds**
- `focus-hero.html` and `index.html`: **byte-identical**

The suite includes accounting boundaries, minute arithmetic, session loot entitlements, focus economy, offline reconnect, pending claims, sync hardening, cloud merge conflicts, shop merge safety, UI refinement, resource routing, service-worker caching, package documentation, release gates, and inline syntax.

## Cloud statement

The cloud/offline implementation and encrypted sync behavior passed synthetic tests, including concurrent additions, downward edits, tombstones, ambiguous-state rejection, and reconnect recovery. The source still points to the existing Supabase project. A public unauthenticated health request from this sandbox did not receive an HTTP response, and the private current player row was deliberately not accessed. Therefore this report does **not** claim that Joel's latest signed-in profile completed a live sync; the app now only says cloud is current after real network evidence.

## SHA-256 seal

```text
97247b347be52301f2f8493ed324afcd76a342ebe2b54f6f2edf948f4b206326  focus-hero.html
97247b347be52301f2f8493ed324afcd76a342ebe2b54f6f2edf948f4b206326  index.html
8fa7a4c506e6a4a3a627ed766b66c7d33ee1df388632aea228229227403207bb  focus-economy.js
02c7fb22cde915d7443df139e689c1ea848233f092827bc06bfb5f8536d3612b  accounting-receipt-bridge.js
c2de47fbba711c3230ed356df2357427d63a56481f6bce7bb88fcac6129755a7  data-guard.js
5a063f12b84e4cae079c6c5cd44ee6cea1db28c2aebbc11e09f43735cf82f794  eggs.js
3ea5c50ca5b1ef6ffb72af44e55da2041bf7f54af0e97c9f351bc922e147622f  fh3d.js
98bca4dcce2f81eb8df35ae07ad6a570f2a24cc150208c5a500e0d07fec928da  game-shells.js
99277e0d1507a942259cb5c623e72a8821844dfb6cafd047d0f36f8f99bfa3fe  gear-utility.js
f5614b7b08a9c17d8a98ee9383b87746bffc47833a4f246e403b3d574a421e25  loot-purpose-actions.js
14873c2882c0e104cac61b6a9c0ec793194ccd0c247724259b3f4eadcfc32865  loot-rework.js
c110c1f8c2590bf9be6f90fc0b7d8bcbeaffa686201e63ff0459d9600aac8250  progression-hub.js
978ac00f35aed1ed86aaeffa0ee73d817e63830bfdf99c87444420a24ccb046e  shop-rework.js
f9fc53cade722239a5828d6278bb583ebfae15ed7874297c1346bdc27e1cbf4e  world-depth.js
2bace50300bab9902961db6c9cd8c641e0024b8aab951e94de201ed0ee0ddf8c  character-rebuild.js
ceb9a4492305adc6b6bfa11d370bbc9ddefd8cfd10693ecc0d04d0e1982dc6a5  character-v86-fix.js
df397c196558726c03dd82368e67a429d6d33a9ae74fd7ff45975ecb72d0ff00  manifest.webmanifest
1c6eca87eb47ae054afe1e560e64a03632e71e4549567486cd2d5fafaea7bbf5  recover.html
68b9d7ef8a21f721bc531e1d1b33a5d6ee35e74849ecc097638244044fafef13  sw.js
e3527c85d117f901196f3b4f9edbf273081343bcfdff5a04565b65afa591da9c  sw-v5.js
```

## Release boundary

This candidate is ready for independent exact-hash review. It is not self-approved and was not deployed. The permanent Focus Hero protection covenant still requires an owner-controlled independent immutable copy, a successful isolated restore drill, and a review/CI boundary the writer cannot approve or deploy through alone. That independent recovery copy does not have to use AWS, but it must remain outside the app's ordinary write authority.

