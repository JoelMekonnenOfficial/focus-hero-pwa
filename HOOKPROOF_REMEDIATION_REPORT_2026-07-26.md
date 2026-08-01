# Focus Hero ledger hook-proof remediation

Status: **SOURCE-ONLY — ISOLATED — NO-GO — DO NOT DEPLOY**

## Scope and provenance

This isolated sibling contains the final own-index and inherited-then
remediation. No deployed package or previously reviewed source was edited.

Only the isolated ledger component, its synthetic tests, and local review
documents changed. No signed-in browser profile, player data, browser storage,
cloud row, credential, sync identity, backup, recovery material, GitHub
repository, public host, migration, or deployment path was accessed.

## Findings closed

- Queued event snapshots are cloned recursively from normalized own properties.
  They no longer pass through JSON stringify/parse, so an inherited
  `Object.prototype.toJSON` hook cannot substitute another valid event.
- Authority/projection mapping and filtering allocate internal arrays with
  explicit indexed loops. `Array[Symbol.species]` cannot forge sessions,
  rewards, references, or quarantine arrays.
- SHA-256 envelope validation uses explicit lowercase-hex character checks and
  cannot dispatch through `RegExp.prototype.test` or `exec`.
- Exported asynchronous operations synchronously seal their returned native
  promises with non-configurable own `then` and constructor/species records.
  Internal promise creation and chaining use captured clean intrinsics.
- Returned promises also carry sealed own `catch` and `finally` methods.
- Canonical array traversal accepts only own data properties; inherited numeric
  accessors cannot influence canonicalization and sparse inherited event
  entries are rejected.
- Resolved authority objects carry a sealed own `then: undefined`, preventing
  inherited `Object.prototype.then` assimilation.
- The fail-closed cloud gate likewise captures its validation/freezing
  intrinsics and uses no RegExp validation path.
- The previous three-method post-import probe now replaces the named Array,
  Map, Set, WeakMap, and WeakSet constructors/methods in addition to
  `Reflect.apply` and `Object.getPrototypeOf`.

## Permanent regressions

The focused suite includes isolated child-process probes for:

1. named post-import Array/Map/Set/WeakMap/WeakSet replacement across create,
   edit, delete, reward, empty-ledger, subclass, and collision paths;
2. mutation of a queued append through inherited
   `Object.prototype.toJSON`;
3. a throwing `Array[Symbol.species]` constructor during a non-empty
   120-minute reward projection;
4. a throwing `RegExp.prototype.exec` during content-hash validation;
5. post-import Promise static/prototype/constructor/species replacement while
   every observed ledger promise is required to carry the sealed own
   descriptors; and
6. post-import cloud-gate freeze/trim/RegExp/safe-integer replacement while the
   gate remains frozen and fail-closed;
7. inherited numeric array accessors and sparse inherited event entries; and
8. inherited `Object.prototype.then` across all exported async authority paths.

## Verification

From `safety-ledger/`, `npm.cmd test` completed:

- **38 passed**
- **0 failed**
- **0 skipped**
- **0 cancelled**

Exact current hashes are recorded below after the final verification run.

## Exact relevant bytes

| File | SHA-256 |
| --- | --- |
| `safety-ledger/browser-ledger.mjs` | `4c936d692c1e104ea11346388934d5e1bc409d83ae95076fae1a41bed7f2dc60` |
| `safety-ledger/cloud-write-gate.mjs` | `7a75ea04b949a7ae6ee65240f632606bd8bef49b366115339b5009ba74651bc4` |
| `safety-ledger/package.json` | `6b32941a5c888bfe9c9d9828a7396f0bc60b4f37b8b0e9922920824280129118` |
| `safety-ledger/README.md` | `83b19a1bc886c2a7b7e4febfab20be58f7ebdbcca156867ae710b84540a8e9a0` |
| `tests/browser-ledger.test.mjs` | `57553f65ea9cefcd68463318ac5ed11c08625f2d5d5c056543c59a277eb29c8f` |
| `tests/cloud-write-gate.test.mjs` | `840eb68d0eba796527f1f54d114ed39fcec018c1a96d98ee1f70ddc8db8cd795` |
| `tests/final-authority-sealing.test.mjs` | `52213ae6faf945bdb9604682bac4d0d82da9c9df2ec2bec4250f29bdf0a6ce51` |
| `tests/fixtures/post-import-intrinsic-replacement-probe.mjs` | `043a9cc84c911b7bd3ef7580d3b57473095674784f39d74c5e84080fd91c4d78` |
| `tests/fixtures/post-import-secondary-hook-probe.mjs` | `d130ffd820fbdba49c4a773fe07454c455f86df4771bd9840819ffb11c8466c7` |
| `tests/fixtures/post-import-promise-hook-probe.cjs` | `527a195702c968c622dbee3f5f3076a31c79a8ce992f027b2b6ae2dfbf6c6a2a` |
| `tests/fixtures/post-import-own-index-probe.mjs` | `4291394fcd3ad0dd1450836a2f84ad0c25cac759b6cecae77c7af155349974b9` |
| `tests/fixtures/post-import-object-then-probe.cjs` | `3960e016572cf7477e38a9301543a7bac6353ead7a723add5f0b04146b777c19` |
| `LEDGER_INTEGRATION_CONTRACT.md` | `c3e29db0e34f357de0c416a6ff110a3ae8974b6a5a03119020807953c7d40a83` |

## Residual assumptions and release boundary

The module must still initialize in a trusted clean realm. Pre-import intrinsic
tampering, engine compromise, hostile privileged extensions, or replacement of
the runtime itself are outside this in-process prototype's authority model.
Captured Web Crypto and randomness are assumed to implement their platform
contracts.

This remains an in-memory, session-only prototype. It does not provide the full
gameplay event/effect/receipt/tombstone/spend/inventory domain, durable
IndexedDB/Web Locks, authenticated cloud CAS, encryption, immutable-vault
evidence, side-by-side migration, old-client fencing, or a protected
writer/reviewer/release boundary.

Green synthetic tests close the reproduced local hook defects only. The
component remains unwired and is not deployment evidence or deployment
authorization.
