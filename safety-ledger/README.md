# Isolated browser ledger component

This directory contains:

- `browser-ledger.mjs`: an in-memory, browser-safe, Web Crypto event ledger and
  deterministic projection;
- `indexeddb-ledger-adapter.mjs`: an importable, synthetic-database-only
  durability prototype that stores append-only observations and hash-chained
  revisions, reserves canonical commands and actor sequences transactionally,
  and uses Web Locks when available plus an IndexedDB head/allocator-CAS retry
  when they are not;
- `accounting-command-bridge.mjs`: a synthetic-only two-phase coordinator that
  requires a durable command reservation, an application-owned atomic
  state-plus-receipt commit, and durable ledger finalization in that order;
- `cloud-write-gate.mjs`: a pure capability gate that blocks protocol-v2 writes
  on JSONStorage and has no caller-reachable allow or CAS-intent path;
- `package.json`: the synthetic ledger and durable-adapter test commands.

Current hardened prototype behavior:

- ledger construction requires an exact synthetic `profileId`/`profileEpoch`
  identity and exposes no event-ID validation injection;
- every event ID binds `writerProtocol`, `ledgerVersion`, normalized
  `profileId`, and normalized `profileEpoch`; raw cross-epoch replay is
  quarantined;
- strings and object keys are normalized to Unicode NFC before hashing, and
  negative zero canonicalizes to zero;
- any distinct canonical observation under one claimed event ID quarantines the
  whole ID, regardless of whether either variant is otherwise valid;
- duplicate delivery preserves existing validation/collision quarantine reasons;
- revisions are ledger-issued current-head capabilities bound to the exact
  observation, accepted-event, quarantine, profile, and epoch state;
- authority operations accept only an exact, branded `AppendOnlyLedger`; the
  constructor prevents extensions, subclasses and proxies are rejected, and the
  exported prototype is frozen;
- normalization, hashing, private collections, exact-brand checks, revision
  capture, event resolution, ordering, and reward projection invoke
  module-initialization snapshots of the required platform intrinsics rather
  than later same-realm global or prototype lookups;
- normalized internal objects and arrays are cloned recursively from own
  properties only; no authority snapshot passes through `JSON.stringify` /
  `JSON.parse`, so inherited `toJSON` cannot substitute queued event bytes;
- authority and projection maps/filters allocate plain internal arrays through
  explicit indexed loops, so `Array[Symbol.species]` cannot supply forged
  projection or reward containers;
- every exported asynchronous operation returns a non-extensible native promise
  with non-configurable own `then` and constructor/species records, preventing
  later Promise static, prototype, constructor, or species replacement from
  gaining authority-critical dispatch;
- SHA-256 envelope checks use direct lowercase-hex character validation rather
  than `RegExp.prototype.test` / `exec`;
- isolated regressions replace the named Array, Map, Set, WeakMap, and WeakSet
  constructors/methods plus `Reflect.apply` and `Object.getPrototypeOf` after
  import, and separately probe inherited `Object.prototype.toJSON`,
  `Array[Symbol.species]`, `RegExp.prototype.exec`, and Promise
  method/species replacement;
- every selected projection event is revalidated against its exact event ID,
  canonical content hash, full envelope, profile ID, and profile epoch;
- any new observation invalidates every older revision;
- concurrent exact edit/delete branches from one parent are held for review and
  neither branch changes authoritative accounting;
- concurrent creates for one session are also held with no actor-name winner;
- rewards use one immutable policy named in the originating create event, and
  callers cannot supply projection-time reward rules;
- focused-minute, reward, revision, and `cloud_rev` arithmetic fails closed
  before leaving JavaScript's exact safe-integer range;
- the cloud gate has no public allow path: JSONStorage receives its explicit
  denial and every caller-asserted Supabase capability remains blocked.

Run from this directory:

```text
npm test
```

Nothing in this folder or the sibling `accounting-receipt-bridge.js` is
imported by the application or included in its public/offline bundle. A
read-only review found that the observed-effect bridge prototype did not yet
provide safe repeated-command identity, debit projection, complete effect
coverage, cross-device journal convergence, or bounded durable compaction, so
its tentative runtime wiring was removed. The durable adapter rejects every
database name that does not begin with `focus-hero-synthetic-ledger-`, has no
delete/clear/import/network/cloud operation, and is exercised only with
synthetic identities and in-memory IndexedDB tests. These components perform
no browser-profile, cloud, backup, migration, or deployment operation. See
`../LEDGER_INTEGRATION_CONTRACT.md` before any future integration proposal.

The isolated adapter exposes explicit `reserveCommand`, `finalizeCommand`, and
`recoverCommands` phases. A reservation durably binds one stable `commandId`,
the canonical command digest, actor sequence, deterministic event ID, and
reservation digest before any accounting effect may be applied. The injected
application participant must then atomically persist its state effect and a
receipt bound to that reservation. Only a verified receipt permits ledger
finalization. Recovery reports an unreceipted reservation as
`needs-application` rather than silently applying it, and it can finalize a
receipted reservation without applying the effect twice.

`appendCommand` remains only a ledger-only compatibility API for existing
synthetic tests. It does not create or verify an application receipt and must
not be used for a future Focus Hero accounting integration. Any such proposal
must use the two-phase coordinator and a separately reviewed application
participant with a real atomic state-plus-receipt transaction. The lower-level
`append` method remains only for already-built observations; it is not a safe
local command/sequence allocator.

This remains a narrow session-only prototype. IndexedDB durability has synthetic
coverage, including crash windows before application commit, after an atomic
application receipt, and after ledger finalization, but it is not an
authenticated, encrypted, full-domain ledger or proof of Supabase CAS behavior.
Real-browser testing, authenticated device ownership, cross-device sequencing,
migration design, and independent review remain required before any startup
wiring. Any future integration must load it in a trusted clean realm before
untrusted same-realm scripts; pre-import intrinsic replacement is outside this
prototype's authority model and must be prevented by the final application
boundary. Post-import hardening is defense in depth, not a substitute for realm
isolation, Content Security Policy, reviewed dependency ordering, or a
protected release boundary.
