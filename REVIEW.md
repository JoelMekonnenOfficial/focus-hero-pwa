# Life XP source review

This repository contains source and synthetic tests. It contains no production player data or recovery copies. The included workflow only runs tests; it cannot deploy and receives no Cloudflare, Supabase, backup, or recovery credentials.

## Reproduce checks

Use Node 20 or later (the workflow uses Node 22). Keep the test browser inside this checkout and disable browser-cache garbage collection. In PowerShell:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location).Path '.playwright-browsers'
$env:PLAYWRIGHT_SKIP_BROWSER_GC = '1'
npm ci --ignore-scripts
npx playwright install chromium webkit
npm test
```

On Linux/macOS, set `PLAYWRIGHT_BROWSERS_PATH="$PWD/.playwright-browsers"` and `PLAYWRIGHT_SKIP_BROWSER_GC=1` with `export`, then run the same three commands. Linux CI uses Playwright's `--with-deps` option during installation.

The runner serves this checkout on a random loopback port, creates disposable browser contexts, and denies external requests unless a suite supplies a synthetic response. Ordinary tests block service workers; release-coherence tests explicitly enable real workers in a separate disposable loopback context. A WebKit supplement tests mobile layouts and durable sessions. No existing browser profile is opened. Results are written to `test-results/`. A failed assertion fails the run, including in older suites that previously forgot to finalize their reporter. `npm test -- boot sync` selects named suites. Set `LIFEXP_TEST_WORKERS=1` for sequential execution.

Keep Git history through `d9d8d6c0a24a6d4cdd84cd3f97a178b33f197265`: the mixed-version tests execute that actual historical source. A shallow checkout or a source ZIP alone cannot run those tests; use the accompanying Git review bundle or a full clone. CI uses `fetch-depth: 0`.

After changing any deployed file, run `node tools/seal-assets.mjs`. Commit the generated HTML mirrors and worker receipts together. `npm run test:source` verifies every module's SHA-384 integrity receipt and the content-derived cache namespace without rewriting them. The deployed build must include all 47 files from `starmax/`; do not mix old and new assets.

The optional `LIFEXP_PLAYWRIGHT_MODULE` and `LIFEXP_CHROME_PATH` environment variables support an already-installed test runtime. They must never point to a signed-in browser profile; the harness does not support persistent contexts.

## Release boundary

The source author must not approve or deploy these changes. Before release, an owner-controlled repository must enforce an independent reviewer and required checks on the exact reviewed commit. Protect the production branch against direct writes and force pushes. Keep deployment credentials outside the writer and test workflow. A deployment decision must be made by the independent owner/release authority after review and CI succeed.

Adding this workflow file does not create or enforce those repository protections. The historical public repository is `JoelMekonnenOfficial/focus-hero-pwa`; its main branch is marked protected, but the connected integration cannot read its exact required reviews, checks, or bypass permissions (HTTP 403). On September 27 its Cloudflare deploy and Supabase heartbeat workflows were both manually disabled. The connected repository tool now reports source push access, and a non-writing push check succeeds. These facts allow a review submission, not a change to owner-controlled release protections. Do not enable the old workflows as a shortcut.

The review submission keeps this complete candidate under `review/lifexp/` alongside the historical repository. Existing application, deployment, backup, and policy files remain unchanged. The added top-level workflow runs only the candidate's synthetic checks, with a sparse checkout of this source subtree and blob-filtered history. It does not check out historical backups. The current source history remains reachable for old-reader tests. Only `review/lifexp/starmax/` is a deployable static bundle; never publish the repository root, tests, reports, or Git history as application assets.

The accounting-conflict UI is a comparison and review step, not a restore mechanism. It preserves exact record evidence without choosing authoritative totals or changing a profile. Production recovery still requires the owner's narrowly scoped request, proof of a newer untouched immutable copy, verified hashes and byte counts, an isolated scratch restore/drill with sync disabled, and the owner's selected recovery point. No backup policy, retention, recovery credential, or scheduled writer is changed by this code. Maintenance must remain paused until the independent vault and restore drill requirements are met.

## Reference documentation

- [Playwright continuous integration](https://playwright.dev/docs/ci)
- [GitHub workflow permissions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions)
- [GitHub deployment environments and required reviewers](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)

The GitHub workflow uses immutable action revisions read from the official action repositories. Its test artifacts are synthetic logs, not backups; the artifact retention setting does not change any production backup retention.
