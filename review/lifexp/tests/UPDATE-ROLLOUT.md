# Update rollout evidence

All fixtures use actual historical/current application code in disposable Chromium contexts on a loopback server. No signed-in profile, production cloud, recovery material, or existing browser cache was accessed or changed.

## Reproduced issue

The historical 10.63.4 page considers a paused clock and pending debounced save safe to refresh. The previous candidate worker accepts its obsolete `FH_ACTIVATE_SAFE` message. In the real browser reproduction, that message caused one navigation while an 88.888-second paused clock had a pending save. The unload checkpoint preserved the elapsed duration: this demonstrates interruption, **not proven data loss**. The preserved before log is `test-results/update-live-rollout-before.log`. Automatic install takeover itself was not established reliably in this Chromium fixture; the explicit legacy message is the reproduced trigger.

## Source change

A completely verified worker now collects fresh readiness replies from every remaining window before requesting early activation. Unknown legacy pages and busy fixed pages prevent takeover. The old activation message has no effect. A fixed page drains all queued primary saves, checks unfinished work again, and also rechecks before its eventual reload. A blocked incomplete-update page can reply only before it has begun opening a profile. It explains why another window is holding the update and retries without clearing anything. Closing old pages normally lets the browser activate the waiting worker.

## Verification

`node tests/update-live-rollout-safety.mjs` owns its loopback server and is discovered by the default test runner. It covers five real transitions:

- Legacy paused clock plus pending debounced save: obsolete activation message causes zero navigation; 88.888 seconds remains in memory.
- Legacy running clock: candidate stays waiting and the old clock continues.
- Natural legacy-window close: next offline launch uses the complete new build and preserves the saved 50.123 seconds and all prior cache namespaces.
- New incomplete gate plus old paused peer: no profile database opens while blocked; waiting explanation appears; after only the legacy peer closes, the gate automatically boots the complete build and preserved clock.
- Missing required module: installation fails, the old complete worker and saved clock remain usable offline, and prior caches remain present.

Machine-readable evidence remains `test-results/update-live-rollout.json`. The existing release-coherence suite additionally checks mismatched module bytes, mismatched HTML build, retained caches, and coherent offline startup. Its empty metadata-only page explicitly acknowledges readiness; it never represents a data-bearing legacy page. The update-drain suite checks both reload and readiness drain ordering, refused saves, and the no-hydration gate boundary.

## Limits and integration

These tests establish Chromium behavior in synthetic contexts, not a production update or an iOS/WebKit service-worker rollout. Unknown legacy windows intentionally keep the update waiting until closed normally; suspended clients may delay it. There is no cache deletion, worker unregistration, profile rewrite, or forced close. Browser process termination and platform-specific suspension remain outside this check.

The integrated release must keep HTML mirrors equal, reseal module and bundle receipts, use its new release identifier, and include any newly introduced runtime modules (including the shared-calendar module) in the worker precache before review/CI. This source change does not authorize deployment or access to player data.
