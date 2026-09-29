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
- **Historical late-start records do not establish their original timezone.** The
  shared-calendar follow-up below stops uncertain automatic judgments until that
  timezone is explicitly confirmed. It does not infer a timezone from the device,
  declaration timestamp or a historical checkpoint, or rewrite stored dates.
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

## Shared-calendar follow-up

This follow-up starts from `9dccafca1ca73ba488672f98fac29127a6ee6884` and adds
`fh-calendar-v1.js`, loaded before Hardcore. All checks still use synthetic state;
no production profile, identity, cloud row or recovery material was accessed.

The shared `fhCalendar` receipt records an explicit IANA timezone, a prospective
first date, immutable absolute midnight boundaries and late-start declarations,
and session receipts keyed by stable session IDs. Those receipts retain each
session's original recorded date, absolute timestamp, corrected minutes/session
units, update timestamp and terminal deletion. They survive presentation-log
retention, so pruning a displayed session cannot erase earned-day evidence. A
later edit replaces that receipt at a newer update timestamp; a deletion remains
terminal when a stale peer returns. Unknown schema fields, missing original dates,
contradictory equal-version receipts and differing immutable boundaries refuse
the merge/save rather than discard or guess evidence.

A wholly new profile may initialize its displayed device timezone when the first
run starts. A profile with existing progress asks for one future calendar, beginning
the next date in that timezone. Choosing never reanchors a run's start or drops
unevaluated earlier dates. If sync is enabled, a complete ordinary guarded pull
must succeed first so another device's existing calendar can be adopted. The UI
says to choose on one device and let normal sync share it before choosing elsewhere.

Earlier ordinary dates keep their recorded date totals. Unconfirmed historical
late starts and pauses hold only audits that need their ambiguous boundaries;
saved run progress remains visible. A separate explicit confirmation supplies the
historical timezone, which may differ from the future calendar. Until confirmation,
an ordinary legacy date's close is conservatively no earlier than its latest
possible timezone close. Post-cutover work is subtracted from its original legacy
date bucket before absolute-window assignment, preventing a Los Angeles device's
"yesterday" label from counting the same work on two Hardcore dates. An earlier
confirmed late window can still receive its next-morning portion after the log is
pruned. No history total or already-recorded rank amount is rewritten.

New ordinary dates use the persisted calendar's 23-, 24- or 25-hour boundaries.
Late starts keep 24 elapsed hours, shortened successors remain distinct dates,
and overlapping windows give the later date sole ownership of each session.
Missing spring-forward clock times refuse; repeated autumn times consistently
select the first occurrence, as stated in the settings card. There is no per-device
timezone fallback for these prospective windows.

Calendar preparation is pure until primary snapshot validation succeeds. The
primary save API can synchronously report its exact prepared object/bytes through
`onPrepared({state, raw})`; cloud pull uses that receipt for its existing strict
failure-rollback ownership check. This avoids mistaking its own added calendar
boundaries for newer user activity, while preserving genuinely newer same-object
or replacement-object activity. Calendar choice has the corresponding field-level
durability guard. Identity-claim/adoption integration is reviewed separately.

Validation on the final calendar source:

- `tests/shared-calendar-regressions.cjs`: 20/20 actual-module checks. Toronto,
  Los Angeles and UTC devices produce identical absolute windows and complete
  Hardcore/rank outcomes, including 17-/23-/25-hour dates, paused/missed/revived
  runs, session-count conservation, pruned receipts, edits/deletions, cutoff carry,
  old earned dates, normal-sync adoption, merge algebra and failed saving.
- `tests/calendar-persistence-safety.mjs`: 5/5 exact primary-save/cloud-pull
  checks, including prepared-calendar save refusal and both newer activity forms.
- `tests/calendar-ui-safety.mjs`: 5/5 full-app Chromium checks. At 390-pixel phone
  width, the real "Use this calendar" click saves the selected timezone, presents
  the historical hold explanation, fits the viewport, and survives an actual
  durable reload while preserving the original run, history and late declaration.
- Existing core, Hardcore, late-start, sync, clock-save-races and
  persistence-clock-audit browser suites all pass (6/6 selected suites).
- Independent review reproduced and verified fixes for remote-only unsupported
  metadata loss and the prepared-calendar/cloud-pull rollback mismatch.

Remaining explicit limitations:

- Independently selected calendars with different cutover dates **refuse to merge,
  even when their timezone matches**. Choosing the earlier date automatically
  could reinterpret formerly legacy dates whose timestamp evidence was pruned.
  Both copies remain intact; this release does not offer an automatic conflict
  migration. Ordinary sync adoption before choice and the one-device instruction
  reduce this risk but cannot rule out simultaneous first choices.
- If nobody knows an old late-start/pause timezone, those uncertain judgments
  remain held. No success, failure, excuse or rank credit is invented to hide the
  missing fact. A confirmed historical timezone is immutable in normal settings.
- The compatible encrypted protocol is required to protect these new fields from
  old readers; it is implemented and tested in the separate transport change.
- These are isolated synthetic browser/timezone checks, not verification against
  Joel's Chrome, Opera or phone profile. Real mobile service-worker/platform
  limitations remain documented in the rollout audit. The integrated release
  still needs the complete suite and independent release boundary.
