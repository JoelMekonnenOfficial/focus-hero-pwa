# Domain consistency audit — September 27, 2026

Scope: source at `4176f7d`, compared where relevant with deployed-source baseline
`d9d8d6c0a24a6d4cdd84cd3f97a178b33f197265`. All evidence uses exact application
modules and synthetic, isolated state. No player profile, cloud row, credentials,
backup or recovery material was accessed. This change does not authorize deployment.

## Corrected counterexamples

- One completed session in overlapping late-start windows could satisfy two dates.
  Session counting now uses the same later-date ownership rule as minute counting.
- A positive-minute focus record without a completed-session award could disappear
  from a partial-day minute window. Minute eligibility is now independent of
  completed-session eligibility.
- Adding elapsed minutes to midnight put a selected noon at 13:00 or 11:00 on
  daylight-saving transition dates. Selected times now use calendar construction;
  a declared day retains 24 elapsed hours and its carried successor starts exactly
  at its close. Displayed ending times reflect clock changes.
- A very late start before spring-forward can leave the following date with no
  usable duration. Audit now refuses to award, excuse or fail that date and reports
  the calendar problem. It does not silently repair historical declarations.
- Pause/excuse limits previously truncated evidence on reads/merges, and later end
  annotations discarded earlier pauses, excuses or rank reversals. Existing evidence
  now survives all lifecycle outcomes. The existing limits of 200 new pause intervals
  and 400 excused dates remain: additions at capacity refuse with a clear message.
- Conflict resolution read an obsolete single-run shape, losing distinct unchosen
  live runs, and reported success without confirmed saving. Distinct runs are now
  archived and resolution awaits durable saving. Failure preserves quarantine and
  newer edits. Same-ID contradictory locked identities refuse resolution and keep
  both copies quarantined; choosing one cannot safely make stale peers converge.
- Equal-clock economy corrections depended on merge order. Event joins now have a
  deterministic tie-break and terminal deletions beat stale positive grants.
- Two devices harvesting the same crop paid twice. New harvest IDs name the planted
  crop; the same crop pays once after merging. New plantings get independent IDs.
  Already-recorded historical harvest amounts/IDs are not rewritten.

## Validation

The new suite passes 21/21 after these fixes; the identical suite against `4176f7d`
passes 2/21, with 19 reproduced failures. Existing rank-fairness checks pass 18/18
and Hardcore-sync checks pass 15/15. All five selected browser suites passed;
Hardcore and late start were repeated after the final guard changes and passed.

`tests/domain-consistency-regressions.cjs` uses actual source modules in memory and
accepts an alternate source directory for before/after checks. It covers date
ownership, daylight saving, refusal atomicity, capacity, lifecycle and economy merge
commutativity/associativity/idempotence, terminal deletion, and crop conservation.
The existing rank-fairness and Hardcore-sync regression suites remain required.
Selected browser suites use disposable contexts, loopback assets and blocked
external network: Hardcore, late start, core, merge reductions, and gear/world.

## Release limitations and preserved policy

- **Devices must use the compatible new build.** Exact old-source probes confirm
  that the old rank merge drops revival retractions and all four new run rank-receipt
  fields. It also adds parallel `hardcore_fail_v2` penalties instead of applying the
  new daily maximum. Allowing a newer reward policy number alone does not fix this.
  Cross-version transport compatibility is reviewed separately.
- **Historical late-start dates use each device's local timezone.** A record contains
  only a date, selected clock minute and declaration timestamp; it cannot establish
  the original timezone unambiguously. Identical records can assign a session to
  different windows in Toronto and Los Angeles. This patch does not guess a timezone
  or migrate historical dates. Consistent local calendar settings are necessary for
  those records; cross-timezone travel needs a separate calendar protocol.
- Rank events already recorded remain append-only. Later editing/deleting qualifying
  minutes can change a run's audited survival or future outcome, but does not globally
  reprice prior daily rank credit. Explicit revival retractions remain episode-specific.
- World route milestones and unlocked worlds intentionally remain permanent after
  later session edits/deletions, per the existing policy. This audit does not relock them.
- Historical random harvest IDs are preserved. An older client harvesting the same
  crop with a different random ID cannot be safely inferred to be a duplicate after
  the fact. The new crop identity rule requires updated clients.

Scratch reproduction sources/logs remain in `test-results/` for independent review;
they contain synthetic values only. The tracked regression suite is the durable
before/after evidence for the corrected cases.

## Independent-review follow-up

The final source review found additional edge cases and supplied eight independent
counterexamples. Shared IDs in a manual conflict choice now use the ordinary pure
merge, retaining both sides' pause, excuse and rank-reversal evidence and terminal
lifecycle decisions. Original raw records are passed through so normalization does
not turn an unverified legacy survival total into proof. Distinct unchosen active
runs still become archived summaries; conflicting locked identities still refuse.
A clear-operation token prevents an older failed save from reopening quarantine
after a newer successful resolution, while preserving quarantine on a failed clear
with unrelated newer run edits.
If two quarantined copies contain more than five distinct live IDs together,
manual choice refuses without writes and preserves both copies for review. This
avoids the ordinary merge cap archiving selected runs before the choice is applied.

A window spanning a complete 23-hour spring-forward date must still split recorded
work when a later declared window owns part of that date. Both minute and session
shortcuts now check that overlap. An accepted legacy truthy deletion flag also uses
the same terminal merge rule as economy balance calculation. No stored records are
rewritten by these pure merge changes.

The expanded tracked suite passes 29/29, and the independent reviewer's eight exact
counterexamples all pass. Existing Hardcore-sync 15/15 and rank-fairness 18/18 checks
remain passing. The integrated release must still pass the full browser suite.
