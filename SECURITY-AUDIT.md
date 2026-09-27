# Source security review — September 27, 2026

Scope: candidate source for `10.64.1` / `fh-2026-09-27-v10-64-1-audited`, isolated
synthetic tests, and public repository metadata reported by the coordinating
reviewer. Line references identify the reviewed candidate and may move after
integration. No signed-in profile, real cloud row, sync code, browser credential,
backup payload, recovery material or production storage was opened or modified.
This is not a backend authorization or production penetration test.

## Confirmed rendering defect, corrected in the candidate

`starmax/index.html:11365` (`startActiveTaskRename`) and `:14323`
(`renderActiveTaskRow`) previously inserted `task.emoji` directly into HTML. An
isolated blank Chromium context running the exact renderer executed an `onerror`
marker from a synthetic task value. Tasks can arrive through sync/import, so this
was stored script injection in the app origin; it was inherited, not introduced by
the current feature work. The candidate now calls `escapeHtml` at both sinks,
retaining the supplied text instead of treating it as markup. The separate
`tests/task-text-safety.mjs` regression covers both exact renderers. This finding
does not claim that a real profile contained malicious text.

## Plaintext downgrade and compatibility boundary, corrected in the candidate

`decryptStateBlob` now refuses every plaintext shape when the device requires
encryption. Legacy plaintext is readable only after the user explicitly chooses
encryption off locally; switching it off explains the exposure and requires a
confirmation. No setting, key, salt, identity or history is guessed or migrated.
The setting's failed durable save can roll back only its own unchanged snapshot,
so a delayed failure cannot overwrite newer activity.

Every new encrypted upload uses protocol 2 AES-GCM additional authenticated data.
The authenticated fields include protocol, algorithm, KDF, iteration count,
profile identity, cloud revision, salt, IV and compression. The parser rejects
malformed/ambiguous envelopes, unknown parameters, an incorrect row binding, and
unrecognizable decrypted profiles before merge. Existing encrypted protocol 1
remains readable until a verified protocol-2 pull/upload receipt is saved. The
per-identity minimum is durable and monotonic; a higher cloud revision cannot
make the same identity accept older encrypted or plaintext formats. Read-only
inspection does not persist a pin or modify profile state.

The actual 10.63.4 reader omits AAD and therefore cannot authenticate protocol 2.
It fails before parsing any shared fields, including when there are no new reward
receipts. Explicit encryption-off uploads use a distinct protocol-2 plaintext
wrapper that the old profile recognizer also refuses. This wrapper is a semantic
compatibility boundary, not encryption or authentication. Supabase revision CAS
prevents a stale old writer from replacing the newer row after either refusal.
Old offline work remains on its device and can converge after an in-place update.
Old code cannot be made to understand this protocol by deploying source elsewhere;
all devices must update to resume shared progress.

JSONStorage has no equivalent revision CAS. New publishing there is refused
before auth, salt generation or cloud writes, with a visible explanation; read
compatibility remains. This cannot prevent an old, unmodified JSONStorage client
from writing. No provider migration, credential change or cloud-row change is
performed automatically.

`tests/encryption-protocol-safety.mjs` runs 50 exact-source real-crypto checks,
including actual old-reader rejection, compression/uncompressed operation,
parameter/ciphertext tampering, plaintext policy, identity-scoped pins, future
protocol refusal and encryption-setting rollback ownership.
`tests/cloud-plaintext-policy-probe.cjs` now asserts that the three formerly
accepted plaintext forms are refused. `tests/multidevice-sync-safety.mjs` exercises
real encrypted uploads, browser storage, CAS, refusal and in-place upgrade using
only disposable synthetic devices. These do not establish real backend access
controls or that an actual device has updated. A compromised same-origin script,
stolen secret, hostile authenticated endpoint or arbitrary local-storage write
remains outside the protection supplied by an envelope format alone.

## Key and identity boundaries inspected

- `deriveE2EKey` (`index.html:12049`) uses PBKDF2/SHA-256 and a nonextractable
  AES-GCM key; salt and IV generation use browser cryptographic randomness.
- `sanitizeForCloud` (`:12149`) removes sync secrets/hashes, bearer/refresh tokens,
  token expiry and creation authorization before upload. It also excludes parked
  clocks. `sanitizeForExport` (`:12170`) removes session credentials but deliberately
  retains the reusable code/secret in an owner-requested export; those exports are
  sensitive recovery material, not public diagnostics.
- The inspected browser Supabase configuration is a public anonymous API key,
  not a service-role secret. Authenticated requests use the configured HTTPS
  endpoint. No private service-role or vault authority was found in the inspected
  browser code; this does not audit external secret stores or repository history.
- `supabaseRequest` (`:14581`) restricts `authReadOnly` to GET with an existing
  valid session and no refresh/signup or 401 auth replay. Diagnostic requests still
  record their transfer budget. This is not a zero-storage-writes claim.
- Actual Supabase row policies, credential scope, immutable vault permissions,
  retention enforcement and recovery authority remain externally unverified.

## Recovery remains a separate owner-controlled operation

Import (`index.html:18855`) can call `stageInAppRecoveryState` (`:8614`) and the
recovery center's `verifiedRestore` (`recover.html:770`) can write a selected state
to primary storage. Those paths perform local preservation, validation, fencing and
read-back checks, and stage sync paused; they do not establish an independent
immutable vault, prove a newer untouched immutable copy, or perform an isolated
restore drill. They were inspected as source, never exercised on real data.
The boot panel now says “Review recovery options”; its earlier recommendation to
restore the most recent automatic backup was inappropriate as proof of recovery
safety. Existing backup files, retention and controls remain untouched.

Production recovery still requires the owner's narrowly scoped request, hashes and
byte counts, a newer preserved immutable copy, an isolated scratch comparison with
sync disabled, and the owner's choice before any production write. Maintenance
must remain paused until the independent-vault and successful-drill requirements
are established.

## Review and deployment boundary

The candidate `.github/workflows/review.yml` runs synthetic tests with read-only
repository permission, pinned actions, disabled checkout credential persistence,
locked test dependencies and no deployment/production credentials. It does not
enforce remote branch protection merely by existing in this checkout.

Public metadata checked by the coordinating reviewer identifies
`JoelMekonnenOfficial/focus-hero-pwa`, historical main commit
`98f92700d8779212412fcf4417ef9b747e4bda15`. Main is marked protected, but protection
details were unavailable (HTTP 401), so independent required reviews, checks and
bypass permissions are not confirmed. The historical deploy workflow would deploy
on a main push and the heartbeat workflow references a service-role environment
secret; **both were `disabled_manually` on September 27**. No workflow was enabled,
no secret or backup payload was read, and no external control was changed. The
active historical Pages workflow and older repository source do not establish an
approved deployment path for this candidate. Follow `REVIEW.md`: an independent
owner-controlled reviewer and CI boundary must approve the exact commit; the source
writer must not approve or deploy it.
