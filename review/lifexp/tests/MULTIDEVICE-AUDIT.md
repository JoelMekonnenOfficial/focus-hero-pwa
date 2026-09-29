# Three-device sync audit — 2026-09-27

Initial source under review: candidate `4176f7d`, followed by the authenticated-protocol changes based on `9dccafc`, compared with production-source baseline `d9d8d6c0` (10.63.4). No production profile, cloud payload, browser storage, credential, or backup was accessed. No deployment was performed.

## Initial findings and protocol follow-up

**Mixed-build limitation, now protected before any new reward.** The initial audit found that policy-4 receipts stopped old clients only after a new reward. An isolated new journey map without those receipts could be overwritten by an old merger. The authenticated protocol-2 boundary now makes the real 10.63.4 encrypted reader fail before parsing any profile fields; the explicit encryption-off wrapper also fails its profile recognizer. This does not make old software compatible: it keeps both branches safe until the old device updates. There are no fake session/reward records or policy relabeling.

**Supabase CAS protects the cloud while old devices wait to update.** Old forced pushes lose the revision comparison and stop when the required pull cannot authenticate. Old manual Sync now, first-create preflight, and retry after an unconfirmed create likewise cannot advance their local revision or overwrite the newer row. A new per-identity protocol pin persists on a verified receipt and refuses later version-1 payloads even if the surrounding row revision increases. Plaintext replacement is refused whenever local encryption is required.

**JSONStorage remains unsuitable for mixed-device publishing.** An old client can perform an unconditional PUT there, so an envelope cannot provide compare-and-swap protection. New publishing is paused with an actionable error before changing identity or sending a write; legacy reads remain available. No data or provider migration is attempted. The source change cannot prevent an unmodified old client from writing to that provider.

**P2 — A real failed IndexedDB pull commit left the uncommitted merge installed in memory. Fixed here.** With local 7 minutes and remote 9 minutes, `IDBObjectStore.put` threw `QuotaExceededError`. The app correctly refused the save and blocked further writes, but memory showed 16 while the durable profile still held 7. The storage warning itself appended a notification; that changed the exact object serialization used to distinguish newer activity from the just-installed merge. `notifySaveFailure` now displays its warning without adding another profile write. The strict newer-state rollback guard is unchanged. The regression now measures 7 in memory and after reload, unchanged remote bytes, and a visible storage warning.

## Measured scenarios

`multidevice-sync-safety.mjs` serves actual historical/current source on a loopback-only server and creates disposable browser contexts. Its in-memory server stores the actual AES-GCM cloud envelopes, enforces revision CAS, and injects transport faults. The normal app merger, encryption, durable IndexedDB storage, accounting wrappers, reward receipts, and retry loop run unchanged. Only specified faults and synthetic initial state are injected.

- Three independent 17/23/31-minute sessions, concurrent CAS requests and repeated operation IDs: 71 minutes, all three session receipts, and no duplicate credit on each updated device. Their separate economy grants preserve 4 timber, 1 seed, and 71 farm minutes.
- Accepted PATCH whose response is lost: queued local work reconciles to 19 minutes once on all three devices.
- Mixed versions: refusal preserves both branches; upgrading the same old contexts in place then combines 11 + 29 into 40 on all three, retaining policy 3 and policy 4 receipts.
- Accepted malformed PATCH receipt: exactly one initial request, visible unconfirmed error, pending state retained, later CAS reconciliation yields 13 once.
- Primary storage refusal before upload: no request sent, prior 11-minute durable session survives reload.
- New 7-minute edit while a 13-minute upload response is held: real replay uploads the newer durable state; both devices reach 20.
- Pull save refusal: cloud bytes unchanged and local 7 preserved in memory and after reload; warning remains visible. Distinct bounded local/remote diagnostic logs are included.
- Two offline devices independently crossing the same daily target with 41/43 minutes: both sessions converge to 84.
- One shared ready crop harvested on two offline devices: one harvest receipt and 4 herbs on all three after encrypted CAS reconciliation.
- Two distinct ready crops harvested separately: two receipts and 8 herbs on all three. A merged, already-harvested crop cannot be harvested again. These crop checks include the independently authored domain fix `0ddb426`.
- Protocol protection before the first reward: two journey records with zero reward receipts survive old-reader pulls and forced pushes; both old devices obtain both records after updating.
- Explicit encryption-off writes use the incompatible wrapper; old readers retain their revision and cannot overwrite it. Requiring encryption then refuses that same plaintext without changing totals, salt or identity.
- Legacy first-create and lost-create retry preflights stop after read-only requests when the row is already protocol 2.
- Requiring encryption while a plaintext GET is held refuses that response without undoing the newer local choice.
- Authenticated older full rows are refused even when their ciphertext is valid. A revision or protocol minimum committed while another response is held is rechecked against the latest verified local state before merging.
- Re-entering the same identity retains its protocol minimum and confirmed revision; it cannot authorize a downgrade. Different target identities keep their own separate floor.
- Verified protocol pins survive browser reload and reject revision-increasing encrypted downgrades.

- Shared calendar receipts, the authenticated protocol minimum and cloud revision commit together and survive reload. Conflicting calendar choices refuse before changing either device's recorded state or the cloud row.

All 21 end-to-end scenarios pass, including preserved offline work, expected mixed-version refusals and safe catch-up after updating. **A green test run is not deployment approval.**

## Rollout boundary and limitations

The updated-reader path is proven in synthetic contexts. The release can protect newer Supabase uploads while older clients remain offline: the envelope changes on the first new upload, independently of new reward creation. Each existing installation must load one coherent compatible build in place; it must keep its existing browser profile/storage and let normal guarded sync merge its offline work. A clock or save in progress must complete or reach the app's safe update boundary before activation. Do not reset storage, restore an old copy, generate a replacement identity, or force-sync to perform an update. The compatibility message tells users to update every device; source tests cannot prove that real Chrome, Opera, a phone, or other open copies have done so or certify their totals. A source rollback to 10.63.4 after protocol-2 publication intentionally cannot read that cloud row; recovery requires compatible source, not data rollback.

All three test devices use Chromium, with a mobile viewport for the phone fixture. This does not verify iPhone WebKit, operating-system suspension, real Supabase permissions, physical-device connectivity, service-worker update delivery, or backup recoverability. Those remain separate release checks. Background scheduling is disabled in these fixtures so controlled public sync operations determine the request order; scheduling and budget tests are separate suites.

Run with the repository's pinned Playwright installation:

```
node tests/multidevice-sync-safety.mjs
```

The Git checkout must include `d9d8d6c0`; the test fails early when historical source is unavailable. It blocks all unmocked external requests. `LIFEXP_PLAYWRIGHT_MODULE` and `LIFEXP_CHROME_PATH` support the existing isolated Windows runtime. `LIFEXP_SYNC_SCENARIO` can select a scenario by name for a focused reproduction. Measurements are written to `test-results/multidevice-sync-audit.json`; they contain only synthetic data.
