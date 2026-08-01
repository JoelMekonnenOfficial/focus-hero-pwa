# Focus Hero protocol-v2 ledger integration contract

Status: **isolated module integration only — not runtime-wired and not
deployable**.

The files in `safety-ledger/` are isolated modules. The durable adapter can open
only a newly named `focus-hero-synthetic-ledger-*` IndexedDB database; it is not
imported by `index.html`, `focus-hero.html`, the service worker, startup,
recovery, sync, or migration code. Tests use synthetic identifiers and an
in-memory IndexedDB implementation and never open a browser profile, production
database, cloud row, backup, or credential.

## Non-negotiable write gate

Protocol-v2 cloud writes are permitted only through one independently reviewed
Supabase/Postgres adapter whose implementation provides all of these properties:

1. The authenticated identity is bound server-side to exactly one profile.
2. Event insertion and `cloud_rev` comparison/increment happen in one database
   transaction.
3. Events are immutable inserts. Existing event rows are never updated or
   deleted by the application identity.
4. `(profile_id, event_id)` and `(profile_id, actor_id, actor_sequence)` have
   database uniqueness constraints.
5. The server independently validates the protocol version, exact envelope,
   payload shape, event digest, parent reference, and version fence.
6. The write begins with an exact expected `cloud_rev` and succeeds only when
   the current value equals it.
7. A successful transaction increments `cloud_rev` exactly once and returns the
   committed revision and accepted event references.
8. `cloud_rev` remains within an exact server/client integer representation, and
   every supplied revision/batch digest is exactly 64 lowercase SHA-256 hex
   characters.

An ordinary sequence of client-side Supabase `insert` and `update` calls is not
atomic enough. The adapter requires one reviewed Postgres function/RPC or another
transactional server boundary.

`cloud-write-gate.mjs` currently has **no allow path**. Ordinary objects claiming
Supabase, CAS, identity, or migration capabilities always return
`TRUSTED_ADAPTER_UNAVAILABLE` and cannot create an intent. JSONStorage receives
its more specific permanent denial. A future trusted adapter must be a separate,
independently reviewed server integration; caller flags can never upgrade this
closed gate.

## Required CAS transaction

Conceptually, one server transaction must:

```text
authenticate and resolve profile_id
lock/read current cloud_rev
reject unless current cloud_rev == expected_cloud_rev
validate every protocol-v2 event and batch digest
reject ID collisions, actor-sequence collisions, missing parents, and old clients
insert immutable event rows (exact duplicates may be reported idempotently)
compute/verify the resulting accepted revision
set cloud_rev = expected_cloud_rev + 1
commit all operations together
return next cloud_rev plus committed event/revision references
```

Any validation failure or affected-row count other than exactly one aborts the
entire transaction. There is no partial event insert, partial reward update,
best-effort write, force push, or last-writer-wins whole-state replacement.

## CAS conflict behavior

On a `cloud_rev` mismatch, the client must:

1. Stop the attempted write.
2. Fetch only authenticated immutable protocol-v2 events/revision evidence.
3. Validate and union-merge them with the local event set.
4. Reproject locally and surface all quarantines/conflicts.
5. Capture a new exact revision and retry with the new `cloud_rev`, using a
   small bounded retry count.

If validation, convergence, authentication, or the retry bound fails, syncing
stops visibly. Local events remain pending. The client must never solve a
conflict by uploading a whole JSON state, selecting the larger total, restoring
a historical snapshot, or silently discarding a branch.

Concurrent exact edits or deletions sharing one parent revision remain pending
review. Device name, actor ID, event ID, wall clock, and delivery order are not
authority to select a winner. Only a future authenticated backend CAS receipt
may establish which exact mutation committed.

Every immutable event and deterministic event ID includes the normalized
profile epoch, writer protocol, and ledger version. Raw bytes from another epoch
are quarantined even when the profile ID matches. A revision or merge identity
cannot override the epoch committed inside an event.

Reward effects use the immutable policy version committed in the originating
session-create event. Projection accepts no caller reward table. Future policy
versions require separate immutable catalog entries and deterministic receipts;
silently changing rules under an existing version is forbidden.

All numeric fields and aggregate additions must remain exact safe integers.
Overflow is a visible hard failure, never rounding, saturation, or coercion.

The in-memory revision capability in this prototype is valid only for the exact
current ledger instance and exact observation/quarantine head. It becomes
invalid when any distinct observation arrives and is not a durable or
server-authenticated receipt.

## JSONStorage fail-closed rule

`JSONStorage` does not provide a server-authoritative atomic `cloud_rev`
compare-and-swap across event insertion and revision increment. Therefore:

- `JSONStorage` must always return
  `JSONSTORAGE_PROTOCOL_V2_WRITE_DISABLED` for protocol-v2 cloud writes.
- No flag, retry, UI action, query parameter, old-client mode, or fallback path
  may override that decision.
- Protocol-v2 events must not be downgraded into the legacy whole-state JSON
  payload.
- A JSONStorage-backed build may remain local-only/read-only and visibly report
  pending unsynced work, but it may not claim cloud synchronization.
- Pulling legacy JSON must not mutate, normalize, replace, or acknowledge a
  protocol-v2 ledger.

The synthetic gate test proves this local rule. A future integration review must
also prove there is no alternate call path around it.

## Prototype scope blocker

The current core ledger intentionally supports only session creation,
exact-minute replacement, deletion, and derived demonstration rewards. The
synthetic adapter now exercises append-only IndexedDB observations, hash-chained
durable manifests, append-only canonical command reservations, transactional
actor-sequence allocation, crash/restart resumption, Web Locks, and an
IndexedDB head/allocator-CAS fallback. It still does not implement the full
event/effect/receipt/tombstone/inventory/spend/domain schema, encryption,
authenticated device ownership, cross-device sequencing, or the old-writer
migration fence required for the application. Its tests do not include a
real-browser matrix. Green local tests therefore do not authorize startup
wiring, migration, cloud writing, or deploy.

## Minimum server model for later review

The eventual schema should separate:

- an identity/profile binding table;
- an immutable ledger-event table;
- an authoritative profile revision row containing `cloud_rev`;
- append receipts/batch digests;
- quarantine/audit evidence that the application writer cannot erase.

RLS must prevent cross-profile reads and writes. The application identity must
not have event update/delete, revision bypass, backup administration, retention
bypass, or recovery authority.

## Runtime bridge blocker audit (2026-07-26)

The current application cannot safely make this prototype authoritative by
adding an import or wrapping `saveState`. The inspected runtime pathways have
different transaction and authority models:

- `focus-economy.js` installs a synchronous accounting-command boundary that
  runs the legacy state mutation before calling the legacy `saveState`.
- `index.html` and `focus-hero.html` load and save whole state through browser
  storage, merge whole remote state in `cloudPull` / `mergeRemoteState`, and
  propagate whole-state changes through the multi-tab listener.
- The durable adapter is asynchronous and rejects every non-synthetic database
  namespace.
- The cloud gate intentionally has no protocol-v2 write allow path.

The new isolated `accounting-command-bridge.mjs` therefore remains unwired. It
proves the required local order against synthetic participants:

```text
durably reserve canonical command and actor sequence
atomically commit application effect plus reservation-bound receipt
verify that receipt against the committed application state
durably finalize the deterministic ledger event
```

Its recovery rules are fail-closed. An unreceipted pending reservation is
reported as needing an application decision and is never applied implicitly. A
receipted pending reservation can be finalized without applying the effect
again. A finalized ledger command without its application receipt is blocked as
an invariant violation.

Runtime wiring remains blocked until a separately reviewed change supplies all
of the following:

1. A production namespace, authenticated profile/epoch binding, and explicit
   migration design that never treats a historical snapshot as current truth.
2. An asynchronous conversion of every accounting call site, with UI behavior
   that cannot report success before durable completion.
3. One application transaction that commits the accounting effect and an
   immutable command receipt together. A ledger reservation followed by an
   ordinary whole-state `saveState` has an unrecoverable split-brain crash
   window and is not acceptable.
4. Startup recovery that verifies all pending and finalized commands before
   accepting a new command, without using production player data as a test
   fixture.
5. The authenticated server CAS adapter and closed-gate replacement described
   above, including mixed-version and old-writer fencing.
6. Full deterministic projection and receipt coverage for every accounting
   domain, including XP, coins, loot thresholds and revocation, targets, eggs,
   inventory, spends, farming, milestones, and tombstones.

Until those blockers are independently satisfied, neither `appendCommand` nor
the synthetic two-phase bridge is an authorized Focus Hero runtime pathway. A
partial bridge would create the appearance of atomicity while legacy
local-storage, multi-tab, or cloud writers could still commit outside it, so the
correct result of this audit is a precise hard block rather than unsafe wiring.

## Required release sequence

1. Independent review of this module, gate, tests, and contract.
2. Isolated synthetic Postgres/RLS/RPC tests, including concurrent writers,
   duplicate delivery, collision attempts, rollback, old clients, and clock
   skew.
3. A real-browser IndexedDB/Web Locks matrix using disposable synthetic
   profiles for the isolated adapter.
4. Mixed-version and migration design review; no automatic live migration.
5. Independent immutable-vault confirmation and an isolated successful restore
   drill.
6. Only then may a separately reviewed change propose startup wiring. That
   change still cannot self-approve or self-deploy.

Until every gate passes, the existing maintenance writer remains paused and this
candidate remains **NO-GO for deployment**.
