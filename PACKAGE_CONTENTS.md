# Focus Hero package boundary

This file defines what may enter a public runtime upload or a review archive. It is a safety boundary, not deployment approval.

## Public runtime allowlist

Only these browser assets may be uploaded as public static files:

<!-- PUBLIC_RUNTIME_ALLOWLIST_BEGIN -->
- `index.html`
- `focus-hero.html`
- `recover.html`
- `sw.js`
- `manifest.webmanifest`
- `focus-hero-logo.svg`
- `icon-192.png`
- `icon-512.png`
- `pixel-avatar.js`
- `data-guard.js`
- `focus-economy.js`
- `loot-purpose-actions.js`
- `gear-utility.js`
- `progression-hub.js`
- `game-shells.js`
- `loot-rework.js`
- `character-rebuild.js`
- `world-depth.js`
- `shop-rework.js`
- `character-v86-fix.js`
- `eggs.js`
- `v8.6.3-patch.js`
<!-- PUBLIC_RUNTIME_ALLOWLIST_END -->

`.assetsignore` enforces this as a deny-by-default allowlist. A new runtime dependency must be added to the HTML or manifest, the service-worker precache, this list, and the package regression together.

## Review archive

A review archive may contain:

- every file in the public runtime allowlist;
- `README.md`, `CHANGES.md`, `REVIEW_NOTES.md`, and this file;
- `.assetsignore`;
- synthetic `tests/*.test.mjs` files whose dependencies are also deliberately included and whose network access is blocked or mocked.

A review archive is not a deployable bundle. Do not include production hosting configuration merely to make it convenient to publish.

The legacy `tests/supabase-heartbeat.test.mjs` test depends on the operational `.github/scripts/supabase-heartbeat-backup.mjs` helper outside the public runtime boundary. Keep both out of a distributable review archive unless they are separately redesigned for public, credential-free, read-only monitoring and independently reviewed.

## Always excluded

Never place any of the following in a public upload or distributable review archive:

- `.git`, `.github`, workflow files, scheduled writers, or deployment automation;
- `wrangler.toml`, production account/project routing, `CNAME`, or one-click deploy helpers;
- `.env*`, `.dev.vars*`, credentials, tokens, sync codes, recovery identities, or service-role material;
- `backups/`, backup-status files, browser profiles, downloads, local/session storage, IndexedDB, cookies, caches, recovery records, snapshots, exports, or private fixtures;
- old archives, old service workers, old prototypes, migration harnesses, patches, scratch files, logs, or test runtimes;
- `prototype-v2.html`, `sw-v5.js`, `v7.6-migration-test.js`, `__v8.3-deploy.ps1`, `__v8.3-deploy.patch`, and `__test_write.txt`;
- `node_modules`, package-manager caches, editor metadata, or OS metadata.

The existing `focus-hero-v10-9-review.zip` is a stale v10.9.0 archive and must not be reused or renamed as v10.9.1.

## Final-package verification

For any future approved release:

1. Build from an explicit allowlist, never from a recursive directory glob.
2. Extract the archive into a new temporary directory.
3. Confirm no extra file is present and no allowlisted file is missing.
4. Confirm `index.html` and `focus-hero.html` are byte-identical.
5. Confirm every HTML/manifest runtime reference is allowlisted and precached.
6. Run the approved synthetic suite against the extracted files.
7. Generate SHA-256 for every file and for the final archive.
8. Record the source revision, app version, service-worker build, test result, and independent reviewer.
9. Keep production deployment blocked until every release blocker in `REVIEW_NOTES.md` is closed.
