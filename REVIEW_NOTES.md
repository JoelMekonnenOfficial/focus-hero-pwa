# Focus Hero v10.9.5 diverse-avatar review addendum

## Current decision

The v10.9.5 avatar-only source candidate is complete for independent review. It has not been deployed and has not been connected to a signed-in player profile, browser storage, private cloud row, credentials, backups, or recovery material.

Review should confirm the bounded source delta, four distinct neutral style geometries, complete hairstyle library, exact skin-tone mapping, body/face variation, legacy appearance preservation, non-mutating renderer boundary, mirrored entry files, build markers, and the recorded synthetic results. Production release remains outside this task.

The current Supabase/offline architecture is unchanged. No AWS or vault dependency was added. No time, reward, accounting, cloud, offline, recovery, or deployment logic changed in this candidate.

---

# Focus Hero v10.9.3 current review addendum

## Current decision

The v10.9.3 source candidate is ready for complete synthetic verification and independent review. It has not been deployed and has not been connected to a signed-in player profile or production cloud row.

This iteration closes the specific maximum-only focus-time convergence defect for evidenced sessions: concurrent session additions add together, newer edits/deletions project downward correctly, and ambiguous baselines fail closed. It also unifies exact and relative time editing, session counting, pause/change detail, and reward reversal across the requested UI surfaces.

The existing Supabase cloud is retained. No AWS dependency was added. A public endpoint or mocked browser test can prove reachability and code behavior, but routine verification cannot claim that a private current player row is synchronized without crossing the permanent player-data boundary.

Production deployment remains outside this source task. The durable release covenant still requires an independent recovery copy with a successful isolated restore drill plus an independent reviewer/CI release decision. Those controls are implementation-neutral and do not require AWS.

The sections below are historical v10.9.1/v10.9.2 audit context. Any statement that maximum-only focus-session convergence is still unresolved is superseded by this addendum for the evidenced-session paths tested in v10.9.3; broader non-session spend and legacy ambiguity remain fail-closed or conservatively merged.

---

# Historical Focus Hero v10.9.1 due-diligence review

> **Superseded for the current v10.9.2 tree.** This document is retained as the
> baseline review that motivated the isolated work. Current exact-tree results,
> hashes, rejected integration findings, and remaining release gates are in
> `FINAL_CANDIDATE_VERIFICATION_2026-07-26.md`. Do not use the historical counts
> or hashes below to identify the current candidate.

## Decision

**Release status: BLOCKED — DO NOT DEPLOY.**

This is an isolated source-review candidate. It contains bounded safety, interface, Forge, 3D, and convergence improvements, but the current cross-device accounting model cannot yet guarantee accurate concurrent offline additions, reductions, or reward reversals. Passing regressions do not override that architectural release blocker.

## Safety boundary observed

The review used source files, synthetic fixtures, localhost browser contexts, and mocked endpoints only. It did not open or change:

- a signed-in Focus Hero profile, browser storage, or current player payload;
- a production cloud row, sync identity, sync code, encryption secret, or credential;
- a backup, recovery artifact, historical checkpoint, or Claude download;
- production hosting, a protected branch, or an enabled scheduled writer.

No restore, rollback, normalization, force-sync, or deployment occurred.

## Bounded fixes verified

- Malformed live bytes are never replaced during startup. The app loads the strongest verified snapshot in memory behind a blocking recovery screen, leaves the original bytes untouched, and requires an explicit recovery choice.
- Creating a new local profile takes and byte-verifies a unique exact copy of the prior live bytes. Existing LKG, migration, guard, and recovery records remain untouched, sync starts disabled, and a sync-identity generation boundary rejects delayed work from the prior profile.
- Historical automatic XP/loot purge paths are retired and cannot run at migration or boot.
- Data Guard protects minute totals, earned/spent coins, milestone ordinal, World counters and unlocks, egg IDs, inventory/Vault instance IDs, session tombstones, loot-drop tombstones, and instance tombstones. Explicit new-profile lineages retain separate same-day snapshots, while a later epoch loss prefers the newest lineage instead of an older larger profile.
- The Data Guard overlay no longer writes recovery bytes while live sync workers may exist. It routes to the isolated recovery page, where the user must deliberately choose a snapshot.
- Session edits carry monotonic mutation timestamps. Session deletion, loot-drop removal, inventory removal, Vault removal, equipment cleanup, and three-item Forge combination write monotonic tombstones.
- Stale branches cannot resurrect a deleted session row, removed drop, or consumed/salvaged instance. A genuinely newer same-ID recreation can survive an older tombstone.
- Forge rejects all mutation controls for non-equippable collection items before RNG, spending, timestamp, or state mutation and hides those unsupported controls.
- Forge combination rejects duplicate, locked, or equipped inputs before mutation, tombstones all three consumed instances, and reconciles template ownership with the three consumed and one crafted instances.
- Same-period Focus Target claims merge by logical OR. Target chests run through the noncombat Loot action and cannot secretly consume Fight inventory, change HP, create encounters, create boss receipts, or award boss shards. Local target rewards now use a persistence barrier: a failed XP/loot step restores exact in-memory state and cannot leak partial MAIN/LKG/cloud state or consume the claim; earlier successful tiers are still committed if a later tier fails.
- Egg-deletion correction IDs include the deleted session ID. Incubating egg merge is deterministic and unions distinct credit provenance.
- Unsupported equipment and mounts no longer receive guessed 3D geometry. Rebuild/render, pose, mount, and pet-frame failures restore the 2D fallback, stop the animation loop, and remain retryable. Reduced-motion mode stops continuous animation work.
- The production-accessible `?test=1` route is fail-closed: it uses a synthetic in-memory state and returns before storage, Data Guard, sync, BroadcastChannel, IndexedDB, or stateful browser smoke logic can run.
- Frontier Craft and Tactical Ops navigation remains visible and positioned at tablet and desktop widths.
- The service-role database heartbeat, repository-writing status job, and push-triggered deployment workflow are absent. The only packaged automation is a public app/manifest/service-worker GET/HEAD watchdog with read-only repository permission, no secrets, no commits, and no deploy authority.
- `index.html` and `focus-hero.html` are exact byte mirrors.

## Unresolved release blockers

1. **Concurrent offline minutes are not additive.** `totalFocusMin`, history, task totals, session totals, XP, and coin counters still use max/LWW-style merging. Two devices can each add valid work and lose one branch's delta.
2. **Reductions and deletions do not fully converge at aggregate level.** Tombstones now prevent visible row/item resurrection, but a stale branch can still keep a larger aggregate total. The focused regression deliberately exposes this: a 25-minute stale total remains while the corrected session row is 24 or deleted.
3. **Pull-before-push can undo a valid reduction.** Aggregate max-merging still favors the stale higher value even when the session tombstone is newer.
4. **Peer-tab state is whole-state replacement.** Concurrent same-browser tab work can still be lost without a mutation/event ledger.
5. **Edited-session reward parity is not transactionally reversible.** Edit-derived loot can differ from a true live-session receipt, and egg/loot/achievement correction effects do not yet share one durable cross-device receipt with complete inverse operations.
6. **Spendable materials still max-merge.** Forge/farming spends can be refunded by a stale branch.
7. **Simultaneous target claims lack a durable cross-device receipt/tombstone.** Claim flags now merge safely after synchronization, but two offline devices can claim before either sees the other.
8. **Egg cancellation/correction lacks complete lifecycle mutation tombstones.** The deterministic merge favors preservation, but exact cross-device negative correction convergence is not yet provable.
9. **Independent immutable recovery is not proven.** The permanent release boundary requires an external append-only/WORM vault with scoped create-only credentials and a successful isolated restore drill.

## Required architecture before release

Implement an append-only, uniquely identified accounting/event ledger (or equivalent PN-counter design) for:

- minute grants and removals;
- per-day and per-task allocation;
- XP and coin grants/spends;
- loot, target, egg, farming, Forge, achievement, and milestone receipts;
- deletion/correction tombstones;
- cross-tab and cross-device mutation ordering.

The cutover must be backward-compatible, preserve current data without treating a historical copy as truth, and be tested with old/new mixed clients, two offline writers, edit/delete races, duplicate delivery, clock skew, interrupted migration, and rollback into an isolated synthetic profile.

## Release process

After the ledger migration is independently reviewed and the immutable-vault restore drill succeeds:

1. run the complete synthetic suite against the exact package;
2. verify both HTML mirrors and every precached asset by hash;
3. submit through protected review/CI;
4. require a reviewer separate from the writer;
5. deploy only the reviewed saved artifact.

## Verification result

- Complete suite: **29/29 test files passed** against the frozen mirrored HTML hash.
- Embedded browser smoke checks: **50/50 passed**.
- Synchronization hardening: **24/24 passed**.
- Recovery/browser safety: **19/19 passed**, including exact preservation of every seeded recovery key and rejection of a delayed old-cloud pull when creating a new local profile.
- Data Guard hardening suite passed, including tombstone rollback and profile-lineage isolation.
- Session edit/delete convergence: **8/8 passed**, including the explicit aggregate-counter release-blocker fixture.
- World/Forge depth: **12/12 passed**.
- Visual registries: **107/107 canonical equippable profiles** and **114/114 stable mount builds** passed.
- Package/document boundary: **5/5 passed**; service-worker package/cache checks: **5/5 passed**; public-watchdog safety: **3/3 passed**.
- Frozen HTML mirror SHA-256: `99e3ccb9d2ea5bf24cd13e5fc395126476fc7cb6f3e517519deabcaf7debea49`.

The package SHA-256 is recorded alongside the final archive after source preparation.
