# Three-device sync audit — 2026-09-27

Source under review: candidate `4176f7d`, compared with production-source baseline `d9d8d6c0` (10.63.4). No production profile, cloud payload, browser storage, credential, or backup was accessed. No deployment was performed.

## Findings

**P1 — Mixed 10.63.4/10.64.0 clients cannot continue ordinary sync after the first policy-4 reward. Release blocker.** A new client recorded 29 minutes and uploaded its real encrypted envelope at revision 101. Both old readers refused with `Unsupported session reward tombstone policy for ledger_new-policy-four`. An old device's separate 11 offline minutes remained local at revision 100. Its attempted upload lost the CAS, then stopped on the same guarded pull; the cloud row was unchanged. This is a safe refusal, but it does not satisfy three-device sync. Do not weaken receipt validation or label new rewards as policy 3.

**P1 compatibility-bridge constraint — Older world merging can overwrite the new journey map.** In an isolated field fixture deliberately lacking policy-4 reward receipts, an old client imported journey-one. After the newer client added journey-two, the old client retained its one-entry map and uploaded that stale map to the synthetic cloud. This is not a claim that a normal policy-4 reward bypasses the guard: normal old readers stop first. It proves that teaching old receipt readers to accept policy 4 alone is unsafe. Old rank/Hardcore compatibility is audited separately.

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
- Old journey-field preservation failure described above is asserted as a known compatibility blocker.

The suite reports passing assertions for the expected mixed-version refusals and bridge hazard. **A green test run is not deployment approval.**

## Rollout boundary and limitations

The updated-reader path is proven in synthetic contexts. A deployment must still establish that Chrome, Opera, the phone, and any other open copies run one coherent compatible build before creating new-policy rewards. Do not operate user profiles, reset storage, restore an old copy, or force sync to accomplish that. Source tests cannot prove the real devices have updated or certify their current totals. A reader-first bridge would need at least reward-receipt validation/preservation, journey-map union, and the new rank/Hardcore merge semantics; changing only a policy allowlist is insufficient.

All three test devices use Chromium, with a mobile viewport for the phone fixture. This does not verify iPhone WebKit, operating-system suspension, real Supabase permissions, physical-device connectivity, service-worker update delivery, or backup recoverability. Those remain separate release checks. Background scheduling is disabled in these fixtures so controlled public sync operations determine the request order; scheduling and budget tests are separate suites.

Run with the repository's pinned Playwright installation:

```
node tests/multidevice-sync-safety.mjs
```

The Git checkout must include `d9d8d6c0`; the test fails early when historical source is unavailable. It blocks all unmocked external requests. `LIFEXP_PLAYWRIGHT_MODULE` and `LIFEXP_CHROME_PATH` support the existing isolated Windows runtime. `LIFEXP_SYNC_SCENARIO` can select a scenario by name for a focused reproduction. Measurements are written to `test-results/multidevice-sync-audit.json`; they contain only synthetic data.
