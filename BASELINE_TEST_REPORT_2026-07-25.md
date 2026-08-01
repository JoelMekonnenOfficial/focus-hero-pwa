# Focus Hero isolated baseline test report

Status: **BASELINE PASS — SOURCE-ONLY CANDIDATE — NOT A DEPLOYMENT APPROVAL**

Candidate:

- `focus-hero-safety-candidate-ledger-20260725`
- frozen source baseline: Focus Hero v10.9.1 due-diligence review
- player profile, browser storage, cloud rows, credentials, and recovery material were not used
- browser-backed tests used synthetic local fixtures with service workers and cloud writes disabled

## Result

The complete baseline suite passed with deterministic single-file concurrency:

```text
tests 84
pass 84
fail 0
duration_ms 165066.9417
```

Command:

```text
node --test --test-concurrency=1 tests\*.test.mjs
```

`FOCUS_HERO_PLAYWRIGHT` pointed only to the existing workspace-local Playwright
runtime at `.test-runtime-playwright\node_modules\playwright`.

## Parallel-run note

An earlier fully parallel run reported 83/84 because one browser recovery suite
exceeded its internal 20-second timeout under concurrent browser load. That suite
was rerun alone and passed all 19 assertions, then passed again in the complete
single-concurrency run above. No product assertion failed.

## Boundary

This proves only that the inherited v10.9.1 candidate baseline is reproducible and
that its existing tests are green. It does not clear the append-only ledger,
mixed-client cutoff, independent immutable-vault, protected-review, or deployment
gates.
