# Reward receipt hardening

This candidate records session rewards with a compact policy-v3 receipt:

- SHA-256 semantic and effect commitments
- stable drop and instance identities
- exact loot-owned, gem, tombstone, pity, material, consumable, HP, shard,
  mount progress/family/grant, bestiary, world/boss, and achievement effects
- no round-by-round encounter or UI battle history

Detailed receipts are capped at 64. Every detailed receipt is also represented
by a compact immutable idempotency proof. Compact proofs are capped at 2,048
entries and the combined receipt store at 512 KiB. When either proof limit is
reached, a new reward fails before gameplay mutation; existing evidence is
never silently deleted.

This is a conservative transitional boundary, not the final durable design.
The append-only IndexedDB/event-ledger adapter in `safety-ledger/` is still
synthetic-only and is not wired into application or cloud state. Until that
integration is independently reviewed and tested, the fixed proof capacity is
an explicit deployment blocker for indefinite offline idempotency.
