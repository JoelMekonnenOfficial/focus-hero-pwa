# Independent ledger audit remediation

Status: isolated prototype corrections complete; **still NO-GO for integration,
migration, cloud writing, or deployment**.

This note maps the blocking findings in
`../INDEPENDENT_LEDGER_AUDIT_2026-07-25.md` to the isolated corrections. No app
entry point, service worker, browser profile, player data, credential, cloud
row, backup, automation, or deployment was accessed or changed.

## Corrected in the isolated component

- Revisions are issued by one in-memory ledger authority and bind the exact
  profile ID, profile epoch, complete observation-state digest, accepted
  references, and quarantine state.
- Caller-created subsets, omitted quarantine, recomputed unkeyed digests,
  cross-ledger revisions, and any revision predating a new observation fail
  closed.
- `resolveEventReference` rejects event-ID and actor-sequence collisions.
- Any distinct canonical bytes under one claimed ID quarantine the whole ID,
  including valid-plus-invalid and invalid-plus-valid arrival orders.
- A retry of a quarantined observation returns its current quarantine reason,
  never `duplicate` with a null reason.
- Concurrent exact edit/edit and edit/delete branches from one parent are both
  held for review; neither branch changes projected accounting.
- The production constructor no longer accepts an event-ID derivation function.
- Unicode strings and keys normalize to NFC before hashing; negative zero
  canonicalizes to zero.
- CAS intents reject `cloud_rev` overflow and require exact lowercase 64-byte
  hexadecimal SHA-256 representations.

## Regression evidence

The dependency-free suite includes probes for:

- the audit's forged subset and omitted-quarantine revision attacks;
- stale pre-collision revisions and direct reference re-admission;
- same-ID valid/invalid variants in both arrival orders;
- repeated invalid, collision, sequence-collision, and version-fence delivery;
- concurrent exact edits and concurrent edit/delete;
- constructor oracle injection;
- NFC composed/decomposed identifiers and negative zero;
- `cloud_rev` overflow and malformed/uppercase/incorrect-length digests.

Run from `safety-ledger/`:

```text
npm test
```

## Deliberate blockers that remain

This is still a narrow, in-memory session prototype. It lacks the complete
Focus Hero event/effect/receipt/tombstone and inventory/spend schema,
authenticated device identity and sequencing, encryption, durable IndexedDB
append allocation, Web Locks, cross-tab protocol, checkpoints/compaction,
side-by-side migration, server RPC/RLS/CAS implementation, and immutable-vault
restore evidence.

The cloud capability object remains inert defense in depth, not proof that a
backend possesses the declared properties. JSONStorage protocol-v2 writes remain
unconditionally disabled.
