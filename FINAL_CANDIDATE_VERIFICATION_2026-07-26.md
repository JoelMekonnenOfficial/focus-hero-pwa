# Focus Hero v10.9.2 exact-candidate verification

Date: 2026-07-26  
Status: **LOCAL SOURCE CHECKS GREEN — LIVE DATA UNTOUCHED — NOT DEPLOYED**

This report covers only the isolated source candidate in this directory. No
signed-in Focus Hero profile, browser storage, cloud row, credential, recovery
snapshot, AWS resource, GitHub release, or production deployment was accessed
or changed.

## Safe source work verified

- Live completion, stopwatch completion, relative minute changes, exact-total
  replacement, and session deletion run inside one outer rollback boundary.
- XP, coins, loot, eggs, Targets/chests, Orbs, farming, milestones, and mounts
  complete before the one primary save is accepted.
- Injected egg, target, loot, economy, mount, and device-storage failures restore
  the exact prior in-memory state and do not publish a partial saved state.
- Primary persistence requires exact byte read-back. A failed write suppresses
  broadcast, cloud scheduling, and automatic next-session start.
- An unverifiable rollback enters the durable, non-retryable
  `storage_indeterminate` lock instead of guessing which state won.
- Reward retries use deterministic identities and randomness, and their compact
  proofs are bounded and fail closed on missing, altered, divergent, or
  over-capacity evidence.
- Exact-total and relative minute editing, session history, live-equivalent
  reward accounting, offline pending-session recovery/reconnect, prompt-free
  Priority completion, shared Priority/Locked-In cancellation, milestone
  artifacts, timer appearance controls, and recovery placement remain covered
  by regression tests.

## Rejected integration

Independent review found that the tentative observed-effect receipt journal did
not safely handle repeated command identity, debit direction, complete effect
coverage, cross-device convergence, or bounded compaction. That journal and the
domain-ledger prototype were therefore removed from the app, service-worker
cache, and public package allowlist before this verification.

The prototype source and tests remain only as isolated synthetic research. They
are not imported by either app entry file, are not precached, and cannot open a
production-named IndexedDB database. The production candidate keeps the
previously verified all-or-nothing accounting and deterministic reward
hardening without shipping the unsafe journal.

## Exact verification results

- Full top-level app suite: **143/143 passed**
- Focused accounting/offline/package suite: **23/23 passed**
- Isolated safety-ledger suite: **87/87 passed**
- Durable adapter subset: **22/22 passed**
- Protocol-v2 source suite: **70/70 passed**
- Disposable PostgreSQL 18.4 runtime proof: **PASS**
  - all 227 fixture statements executed;
  - same-revision race produced one append and one CAS conflict;
  - rollback, profile consistency, and privilege boundaries passed;
  - production access was false.
- Immutable-vault owner-handoff static validator: **6/6 checks passed**
- App hookproof manifest: **13/13 hashes verified**
- Protocol package manifest: **32/32 hashes verified**
- `focus-hero.html` and `index.html`: **byte-identical**

Key SHA-256 values:

```text
41fc57173cd6fe06028c495fa1038187144f72da461989851d8525baaf4e8e0c  focus-hero.html
41fc57173cd6fe06028c495fa1038187144f72da461989851d8525baaf4e8e0c  index.html
d1dd44ea360a8ed5fc7d134e2304752fa67fdb2c9981c0bfe5550d1f4d8d69ce  focus-economy.js
5a063f12b84e4cae079c6c5cd44ee6cea1db28c2aebbc11e09f43735cf82f794  eggs.js
86a7ccab3195ab94e95561aaba3a004fc2f6b185e72443a06ef3464d0d2da2d5  loot-rework.js
437c58c677188d1d60e376319ed6f820463a51fc6d2d5b8c3991e1a427b34fd8  character-rebuild.js
9e4f6749d7b6b3c3c74888a05ffa22b7391a4d070e199102415246d8e760df88  sw.js
```

## Remaining release gates

The code-local candidate is ready for a protected review boundary, but it is
not safe to deploy to production yet:

1. The protocol-v2 append-only client is not runtime-wired to an authenticated
   Supabase transaction, and positive Auth/PostgREST behavior is not proven.
2. The complete legacy-writer inventory and mixed-client cutover fence are not
   proven against the real hosting path.
3. The owner-controlled immutable vault is not confirmed live, and its negative
   permission canaries plus an isolated exact-version restore drill have not
   succeeded. The validated handoff files alone do not satisfy this gate.
4. The exact tree has not crossed a protected CI/review/deploy boundary that
   prevents the writer from approving or deploying its own work.

Accordingly, `focus-hero-maintenance` must remain paused and this candidate
remains a **production no-go**. The read-only public watchdog may remain active.
