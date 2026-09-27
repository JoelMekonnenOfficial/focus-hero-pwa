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

## Unresolved encryption policy decision

`starmax/index.html:12343` (`decryptStateBlob`) accepts recognizable plaintext or a
`plain` wrapper whenever `e2e` is absent. `fetchCloudRemote` (`:16123`) and cloud
adoption only force the encryption setting on when the incoming source is encrypted;
they do not refuse plaintext because the local profile already requires encryption.
Thus an attacker with cloud-row write authority could replace ciphertext with an
unauthenticated legacy plaintext payload. AES-GCM does authenticate encrypted
payloads; this alternate path bypasses that guarantee. TLS and backend access
controls still matter and were not tested against production.

This inherited compatibility path needs an explicit policy for legacy plaintext,
encryption-required identities and any owner-approved transition. It is an open
release-security finding, not a claim that server access has been compromised.
This audit does not silently migrate, rewrite, reject or restore existing data.
`node tests/cloud-plaintext-policy-probe.cjs [path/to/starmax]` extracts the actual
parser/decrypt functions and confirms three recognizable synthetic plaintext forms
are accepted while local encryption is enabled, with no keys or network available.
It is an explicit evidence probe, not an automatically passing security requirement.

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
