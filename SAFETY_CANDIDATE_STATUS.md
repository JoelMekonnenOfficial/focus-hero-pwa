# Focus Hero isolated ledger safety candidate

## 2026-08-01 v10.9.5 diverse-avatar addendum

- Avatar-only source delta: the two mirrored HTML entries, pixel renderer, renderer cache marker, manifest version, focused tests, and review documents.
- Complete modular customization: 4 neutral visual styles, 27 directly selectable hairstyles plus original-preservation mode, 10 exact skin tones, 5 body silhouettes, and 7 face shapes. Race does not select presentation style.
- Legacy appearance values and unknown future fields are preserved through additive overrides; rendering and studio previews use non-mutating readers.
- Focused avatar verification: **22/22 tests passed**. Independent read-only geometry audit found no defect.
- Complete exact-tree verification: **37/37 test files; 168/168 top-level tests passed; 0 failed, skipped, cancelled, or todo**.
- No signed-in profile, private cloud row, browser storage, credential, recovery material, production hosting, or deployment was accessed.
- Status: **SOURCE-ONLY REVIEW CANDIDATE — NOT DEPLOYED; CLAUDE/OWNER REVIEW REQUESTED.**

## 2026-07-31 v10.9.4 pixel-hero addendum

- Retired runtime removed from both entry files, service worker, public allowlist, and candidate tree; hash-verified archive retained outside the candidate.
- Deterministic code-native pixel hero added with appearance, equipment, pet, mount, scene, and action coverage.
- Status Ribbon, Journey Strip, Text Pulse, and hidden mode now have distinct tested behavior.
- Earlier complete app caches are retained; install/activation makes no cache-delete call.
- Exact-tree verification: **34/34 test files; 154/154 top-level tests passed; 0 failed, skipped, cancelled, or todo**.
- Mirrored HTML SHA-256: `f24bb0b8cffd182a94c5c81d4e9239c8517c69172eea10248c543a7fb1fbe89a`.
- No signed-in profile, private cloud row, browser storage, credential, recovery material, or production deployment was accessed.
- Status: **SOURCE CANDIDATE — COMPLETE LOCAL SUITE PASSED; INDEPENDENT RECOVERY AND RELEASE GATES REMAIN EXTERNAL.**

See `FINAL_CANDIDATE_VERIFICATION_2026-07-31-V10.9.4.md` for the exact public-file seal.

## 2026-07-31 v10.9.3 session-integrity addendum

- Existing Supabase/offline architecture retained; no AWS dependency added.
- Session-evidence cloud projection replaces maximum-only focus accounting for concurrent additions, edits, and tombstoned deletions.
- Ambiguous focus accounting baselines fail closed before local state mutation.
- Exact and relative editing, manual session counting, pause/change history, and reward reversals share the guarded accounting boundary.
- Complete verification ran against the final exact tree. No live profile, private cloud row, credential, recovery material, or production deployment was accessed.
- Exact-tree deterministic verification: **35/35 test files; 143/143 tests passed; 0 failed, skipped, or cancelled**.
- Status: SOURCE CANDIDATE — COMPLETE LOCAL SUITE PASSED; INDEPENDENT RELEASE REVIEW STILL REQUIRED.

The earlier v10.9.2 safety-freeze record follows for historical context.


## 2026-07-26 final safety freeze

The isolated app keeps its transitional all-or-nothing accounting boundary,
byte-verified local persistence, deterministic policy-v3 reward receipts, and
bounded fail-closed compact proofs.

A tentative observed-effect receipt journal was removed from the app after
independent review found unresolved repeated-command, debit-direction,
effect-coverage, cross-device-convergence, and compaction defects. The domain
ledger and durable adapter remain synthetic, unbundled prototypes only.

Verification completed against the current unwired files:

- top-level app suite: 143/143 passed;
- focused accounting/offline/package suite: 23/23 passed;
- isolated safety-ledger suite: 87/87 passed;
- durable adapter subset: 22/22 passed;
- protocol-v2 source suite: 70/70 passed;
- mirrored HTML SHA-256:
  `41FC57173CD6FE06028C495FA1038187144F72DA461989851D8525BAAF4E8E0C`.

See `FINAL_CANDIDATE_VERIFICATION_2026-07-26.md` for the exact evidence and
remaining gates.

This does not change the deployment status. The append-only client is not wired
to an authenticated cloud transaction, and the independent immutable-vault
plus isolated-restore prerequisite remains unverified.

Status: **SOURCE-ONLY — NOT APPROVED — DO NOT DEPLOY**

This directory began as a mechanical copy of the frozen v10.9.1 review
candidate and is now the isolated v10.9.2 source candidate created so the
release-blocking accounting architecture can be replaced without
touching the public repository, production hosting, a signed-in Focus Hero
profile, browser storage, cloud rows, credentials, backups, or recovery material.

## Baseline

- Source baseline: `review-focus-hero-v10-9-20260724`
- Mirrored HTML SHA-256:
  `99e3ccb9d2ea5bf24cd13e5fc395126476fc7cb6f3e517519deabcaf7debea49`
- Baseline decision: blocked; nine architectural release blockers are listed
  in `REVIEW_NOTES.md`.

## Work order

1. Add and independently review a browser-safe immutable event/receipt ledger.
2. Replace cumulative maximum and whole-state authoritative merge behavior.
3. Use the existing Supabase `cloud_rev` compare-and-swap only with verified
   ledger heads, profile epoch, and a minimum writer protocol.
4. Fail closed for JSONStorage protocol-v2 cloud writes because that backend has
   no verified compare-and-swap path.
5. Exchange immutable events between tabs instead of whole mutable state.
6. Add deterministic receipts and exact inverses for minutes, XP, coins, loot,
   eggs, Targets, Orbs, farming, Forge, milestones, and spendable inventory.
7. Build side-by-side synthetic migration and backend-enforced old-client
   fencing. Never run migration against a real profile during routine work.
8. Pass the exact-candidate adversarial CI gate and immutable-vault prerequisite.
9. Submit the exact saved artifact through protected independent review.

## Non-authorization

Nothing in this directory authorizes a restore, import, migration, cloud write,
workflow dispatch, merge, maintenance unpause, or deployment. Newer user
activity remains authoritative, and no historical profile copy is a restore
target.
