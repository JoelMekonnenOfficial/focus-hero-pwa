# Second independent ledger review remediation

Status: locally addressable findings corrected; **still NO-GO and unwired**.

The full review at
`../focus-hero-ledger-independent-remediation-review-20260725/INDEPENDENT_REMEDIATION_REVIEW_2026-07-25.md`
was read before these changes. Work remained inside the isolated
`focus-hero-safety-candidate-ledger-20260725` component.

## Closed locally

- Events now contain normalized `profileEpoch`, `writerProtocol`, and
  `ledgerVersion`; those values participate in deterministic event IDs.
- Append and raw iterable merge quarantine cross-epoch events.
- Revisions remain bound to the exact in-memory ledger identity, epoch, head,
  observations, accepted references, and quarantine.
- The executable cloud gate has no caller-reachable allow path. JSONStorage is
  explicitly denied and fabricated Supabase capability objects return
  `TRUSTED_ADAPTER_UNAVAILABLE`.
- Session-create events commit an immutable reward-policy version. Projection
  uses only the frozen policy catalog, emits versioned deterministic receipts,
  and rejects caller reward-table options.
- Competing creates for one session are both held for review.
- Total minutes, reward balances, session revisions, and `cloud_rev` increments
  use checked safe-integer arithmetic and fail visibly on overflow.
- Regression probes reproduce the second review's epoch replay, forged cloud
  capability, reward injection, concurrent-create, and large-total scenarios
  and now require fail-closed outcomes.

## Still release-blocking

The component remains an in-memory session-only prototype. It does not contain
the complete Focus Hero event/effect/receipt/tombstone/spend/inventory domain,
durable device identity and sequence allocation, encryption, IndexedDB/Web
Locks, cross-tab protocol, compaction, side-by-side migration, immutable-vault
restore evidence, or a real authenticated Postgres/RLS/RPC adapter.

No local green test is evidence for production CAS, migration, recovery,
application wiring, or deployment.
