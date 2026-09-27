/* ==========================================================================
   Life XP — STANDING (competitive rank)                        fh-rank-v1.js

   WHAT THIS IS
   ------------
   A ladder in the shape of CS:GO or League: a single rating number (RP), cut
   into tiers and divisions, that goes UP when you keep the commitments you
   made and DOWN when you let them lapse.

   THE ONE RULE THAT MAKES IT WORK
   -------------------------------
   Standing is never a counter that something increments. Every change is an
   EVENT with an id derived from the thing that caused it, and your rating is
   a pure fold over the set of those events.

       rating = fold( sort( union( device A events, device B events ) ) )

   That single decision is what makes this survive everything that has broken
   before:

     * A miss recorded on your phone and the same miss recorded on your laptop
       carry the SAME id, so the union keeps one. You cannot be punished twice
       for one missed deadline no matter how many devices see it.
     * Nothing is ever "applied". A device that was offline for a week does not
       replay a backlog of increments; it re-derives the same events everyone
       else already has and the union is a no-op.
     * The whole rating is recomputable from evidence. If the ledger were
       deleted tomorrow it would rebuild itself identically from your history.

   WHAT CAN MOVE YOUR RANK
   -----------------------
   Only evidence that can be re-verified later. That is a deliberate limit:

     * Dated quests (a deadline you set yourself)   - hit, missed, or done late
     * Daily / weekly / seasonal challenges         - but ONLY the kinds whose
       progress can be recomputed for a past period from your own history
       (minutes, sessions, action counts). A challenge like "maintain a 7-day
       streak" is a live counter with no truthful past value, so it is never
       allowed to touch your rank.
     * Hardcore runs                                - milestones and failures
     * Days with no recorded activity at all        - decay, with a rest grace

   WHAT CANNOT
   -----------
     * Anything dated before the day Standing was installed. You are not judged
       on deadlines set when nobody told you they were scored.
     * Anything a device cannot prove from its own records.

   FAIRNESS RAILS
   --------------
     * At most +300 and at most -250 in any single calendar day, so neither a
       burst of trivial to-dos nor a month away from the app can move you more
       than about one division in a day.
     * Your first 5 scored days are placement: gains count double, losses count
       half, and no badge is shown until placement finishes.
     * A rest day is free if you were active on at least 3 of the 7 days ending
       that day. Taking the weekend off after a real week costs nothing.

   Deleting a quest does NOT erase a penalty it already earned. The ledger is
   append-only precisely so that "delete the ones I missed" is not a strategy.
   ========================================================================== */
(function(){
  "use strict";
  if (window.FH_RANK) return;

  var VERSION = 1;

  /* ---------------------------------------------------------------- config */

  var START_RP        = 1200;   /* Bronze III - a real rank, with room to fall */
  var MIN_RP          = 0;
  var MAX_RP          = 6000;
  var DIVISION_RP     = 200;
  var DAILY_GAIN_CAP  = 300;
  var DAILY_LOSS_CAP  = 250;
  var PLACEMENT_DAYS  = 5;
  var LOOKBACK_DAYS   = 45;     /* how far back settlement will reach */
  var RATING_WINDOW   = 60;     /* how much of the past your rank reflects */
  var SEED_DAYS       = 0;      /* a first install looks back exactly nowhere */
  var LOOKBACK_WEEKS  = 10;
  var LOOKBACK_MONTHS = 3;
  var MAX_EVENTS      = 20000;
  var REST_WINDOW     = 7;      /* rest grace: active days needed in a window */
  var REST_MIN_ACTIVE = 3;

  /* ANTI-FARMING.

     A rating you can mint is not a rating. Two rules stop Standing being
     bought with busywork:

       1. Only so many rewards of one kind count on one day. Ticking off forty
          one-word to-dos is not four hundred RP of discipline; it is four
          deadlines kept and thirty-six pieces of noise. Events past the limit
          stay in the ledger as evidence and are shown, but are worth nothing.

       2. A commitment has to have EXISTED before you can be credited with
          keeping it. Writing "breathe" and ticking it in the same breath is
          not a kept deadline. Four hours is short enough that a genuine
          same-morning task still counts and long enough that a farm does not.

     Penalties are deliberately NOT limited this way. The daily loss cap is the
     only thing holding them back, because the failure mode being guarded
     against here is inventing progress, not avoiding consequences. */
  var PER_DAY_KIND_LIMIT = {
    quest_hit: 3, quest_late: 3,
    daily_hit: 3, weekly_hit: 3, seasonal_hit: 1, active_day: 1,
    hardcore_milestone: 2, hardcore_day: 1
  };
  var MIN_COMMITMENT_MS = 4 * 3600 * 1000;

  /* 3. YOUR EXTRAS CANNOT OUTGROW YOUR DAY.

     This is the rule that makes "hours are the main driver" true rather than
     merely stated, and it closes the hole the other two left open.

     Ticking a box already required a real day underneath it - 25 logged
     minutes. But that guard is a THRESHOLD, and a threshold is a door: walk
     through it with 25 minutes and you collected exactly as much as someone
     who sat down for six hours. Measured, a 30-minute day with three ticked
     to-dos scored 44 a day, beating a genuine SIX HOUR day at 35 and all but
     matching nine hours at 45. Anyone could see that was wrong.

     So the door becomes a slope. The daily-scale rewards - deadlines kept,
     daily challenges cleared - are worth at most what the day's own focus was
     worth. Do 25 minutes and your extras are worth 25 minutes; do six hours
     and they are worth six hours. The only lever that raises the ceiling is
     the work itself, so there is nothing left to farm: the ticking never
     stands in for the sitting down, it only ever amplifies it.

     Deliberately NOT capped this way:

       - Weekly and seasonal challenges. They are earned across a period and
         settle on its last day, which may be a quiet one. Judging a week's
         work by the minutes logged on the Sunday would be meaningless.
       - Hardcore milestones. Thirty days is thirty days; it is not a thing a
         single day's minutes has any business pricing.
       - Every penalty. A ceiling on losses would mean a short day makes
         missing a deadline cheaper, and consequences are not on sale. */
  var DAY_SCALED_KINDS = { quest_hit:1, quest_late:1, daily_hit:1 };
  var EXTRAS_RATIO     = 1;   /* extras may match the day's focus, not exceed it */

  /* RESCHEDULING IS NOT FAILING.

     Moving a due date is a decision about your own plan, not a broken promise,
     and the ladder has no business charging for it. A deadline you push before
     it lapses was never missed - the derivation reads the CURRENT due date, so
     there is nothing to charge.

     The awkward case is the seam at midnight. The day-boundary refresh fires
     just after 00:00, so without a grace window a quest due "today" becomes a
     missed deadline while you are asleep, and by morning it is too late to
     either finish it or move it. So a lapsed deadline is not charged until the
     due day has been over for MISS_GRACE_MS. You get the following morning to
     do it, or to move it, and only then does it count against you. */
  var MISS_GRACE_MS = 12 * 3600 * 1000;

  /* CALIBRATION.

     Ticking a box is cheap; the minutes are not. So the small, repeatable
     reward is deliberately the SMALLEST number here, and the things that
     cannot be faked - a challenge that needs real logged minutes, a week held
     together, a Hardcore run - carry the weight. A player who invents twenty
     one-word to-dos a day and does no work plateaus in Silver. The apex ranks
     are only reachable through Hardcore, which is the point: they should cost
     something nothing else in the game costs.

     Losses are heavier than the matching gain, on purpose. Missing a deadline
     you set yourself is worth more information than keeping one. */
  /* MISSING A DEADLINE MUST NOT BE A TRAP.

     The old prices were +12 to keep a deadline and -30 to miss one. Run that
     forward: set three deadlines, keep two, miss one, and you are DOWN six
     points for a two-thirds hit rate. The rational play under those numbers is
     to never put a due date on anything, which is the exact opposite of what
     the feature is for - it turned the honest player into the punished one.

     A miss still has to cost more than a hit pays, or a deadline means
     nothing. Two-to-one does that: two kept out of three is break-even, three
     out of four is progress, and half is a real fall. The asymmetry survives;
     the trap does not. */
  var RP = {
    questHit:        8,   /* a deadline YOU set, kept                          */
    questMiss:     -16,   /* a deadline YOU set, let go                        */
    questLate:       4,   /* kept eventually - half credit, after the miss     */
    activeDay:      12,   /* the value of a ONE HOUR day; scales below         */
    dailyHit:       10,   /* a rolled challenge cleared                        */
    weeklyHit:      70,
    seasonHit:     200,
    hardcoreFail: -200,
    hardcoreDay:    20,
    hardcoreFailMax: 50,
    idleDay:        -8
  };
  /* NO HARD CAP ON A DAY'S FOCUS. Asked directly why one existed, the honest
     answer was that the usual reasons were already covered elsewhere:

       - Runaway grinding is handled by the CURVE. With an exponent below 1
         the fourth hour pays less than the first, so hours never run away.
       - A stuck timer is handled upstream: a single session is capped at 8h,
         and live focus at 24h.
       - Total daily inflation is handled by DAILY_GAIN_CAP (300 RP), which
         sits above everything. Even a full 24-hour day yields 81 RP, nowhere
         near it.

     So an extra ceiling only did one thing: tell someone who genuinely focused
     for ten hours that the last two did not count. That is the opposite of
     what this ladder is for. The curve stays; the arbitrary ceiling is gone. */
  var ACTIVE_DAY_CURVE  = 0.6;  /* <1 = diminishing returns on a long day      */
  var MIN_ACTIVE_MIN    = 25;   /* a day needs one real block to count at all  */

  /* WHY A LAPSED CHALLENGE COSTS NOTHING.

     The daily and weekly challenges are ROLLED AT YOU. You did not agree to
     "defeat one boss today"; the game picked it. Charging for failing an
     assignment you never accepted produced a genuinely perverse ladder in
     testing: a person doing 45 focused minutes a day ranked BELOW a person who
     never opened the app, because showing up exposed them to three challenges
     they had not asked for and could not always clear.

     So challenges only ever pay. The penalties belong to the two things that
     ARE promises you made: a deadline you put on your own quest, and a
     Hardcore run whose daily bar you set and locked yourself. That is also
     exactly what was asked for. */

  /* THE COLD START: EVERYONE STARTS AT ZERO.

     An earlier version of this file credited the 30 days of work already in
     your history on the day Standing was installed, on the reasoning that the
     work was real and re-derivable so the credit was earned. That reasoning
     was wrong, and it produced exactly the thing this project has always
     refused: a rank handed over rather than played for. You opened the app and
     were already several tiers up the ladder having never once been ranked.

     A rank is a record of what you did WHILE BEING RANKED. Backfilling it from
     history is not evidence-based crediting, it is starting the race at the
     finish line. So the gate is one date and it applies to everything, credit
     and cost alike: nothing dated before the day Standing was installed can
     ever move your rating, in either direction.

     This is enforced twice on purpose. Nothing before the gate is DERIVED
     (SEED_DAYS is zero), and nothing before the gate SURVIVES normalisation
     either - so an old pre-gate event cannot creep back in from a device that
     has not updated, or from a backup written under the old rule. */

  /* A RANK IS FORM, NOT A LIFETIME TOTAL.

     If every point you ever earned counted forever, the number would only ever
     go up, and after a year everyone sits at the ceiling holding a trophy for
     something they did last spring. That is a score, not a rank.

     So the fold only counts the last RATING_WINDOW days. Your Standing is your
     last two months: keep it up and it holds, stop and it falls back on its
     own without anything having to punish you. Older events are kept in the
     ledger - they are still the record of what happened - they simply stop
     counting toward where you stand today.

     This is also why the rating is never stored. It is recomputed from the
     window every time it is shown, so two devices always agree the moment
     they agree on the date, and there is no cached number to drift. */

  /* DIMINISHING RETURNS.

     Every ladder worth climbing gets heavier near the top, or the top stops
     meaning anything. Gains are scaled by where you already are; losses never
     are. Falling out of Diamond is fast, getting back in is not.

     The old version did this in four steps - full rate below 3000, then 0.60,
     0.40, 0.25, 0.15. Measured against real personas it was doing something
     nobody asked for. Because the harder worker climbs faster, they hit each
     harsher step SOONER, and the step then drags them back toward the person
     doing less. Two hours a day and nine hours a day were separated by seven
     points a day at the top, and four hours only outranked two by 221 points
     after a month and a half. The ladder had quietly become rubber-banding:
     effort was being actively cancelled out near the top.

     A smooth taper fixes the shape without giving up the grind. Everyone at
     the same rating is scaled identically, so the ordering between two players
     is never inverted - the harder worker's bigger raw number keeps pulling
     ahead, just more slowly the higher it gets. The last rungs still cost
     multiples of the first. There is simply no longer a cliff that punishes
     you for arriving at it early.

     Rounded to two decimals on purpose: the rating is recomputed on every
     device rather than stored, so the scale has to be a value two machines
     can agree on exactly, not a raw float. */
  var SCALE_FROM  = 3400;   /* full rate up to here (Platinum I)              */
  var SCALE_FLOOR = 0.25;   /* the hardest the very top ever gets             */
  function gainScale(rp){
    if (!(rp > SCALE_FROM)) return 1;
    var t = (rp - SCALE_FROM) / (MAX_RP - SCALE_FROM);
    if (t > 1) t = 1;
    return Math.round((1 - t * (1 - SCALE_FLOOR)) * 100) / 100;
  }

  /* Hardcore milestones are exempt from the daily gain cap. They are not
     farmable - a 30-day milestone is thirty days of verified work - and
     clipping a 100-day payout to +300 would make the deepest achievement in
     the game worth the same as an afternoon of to-dos. */
  var HARDCORE_EARLY = [
    { days:3,   rp:50  },
    { days:7,   rp:90  },
    { days:14,  rp:150 },
    { days:30,  rp:280 },
    { days:60,  rp:420 },
    { days:100, rp:700 }
  ];
  /* THE BAR YOU SET IS PART OF THE ACHIEVEMENT.

     Thirty days at eight hours a day is not the same feat as thirty days at
     one, and paying them the same would quietly tell you the harder bar was
     not worth choosing. So a run's milestones are weighted by its own locked
     requirement, against a one-hour-a-day baseline.

     The weight is a square root rather than a straight ratio: eight hours is
     genuinely harder than one, but it is not eight times the rank, or the
     ladder would just be a leaderboard of who picked the biggest number.
     Sessions are converted at 45 minutes each so the two requirement types sit
     on one scale instead of being judged by different rulers.

     New daily rewards use the same weight. New failure costs are bounded at
     twice a run's daily reward and at 50 RP, including for ongoing runs. */
  var HARDCORE_BASELINE_MIN   = 60;
  var MINUTES_PER_SESSION     = 45;
  var HARDCORE_WEIGHT_MIN     = 0.6;
  var HARDCORE_WEIGHT_MAX     = 3.5;

  function requirementMinutes(req){
    if (!req || typeof req !== "object") return HARDCORE_BASELINE_MIN;
    var value = Math.max(0, Number(req.value) || 0);
    if (!value) return HARDCORE_BASELINE_MIN;
    return req.type === "sessions" ? value * MINUTES_PER_SESSION : value;
  }
  function hardcoreWeight(req){
    var mins = requirementMinutes(req);
    var raw = Math.sqrt(mins / HARDCORE_BASELINE_MIN);
    return clamp(Math.round(raw * 100) / 100, HARDCORE_WEIGHT_MIN, HARDCORE_WEIGHT_MAX);
  }

  function hardcoreDailyRP(req){ return Math.round(RP.hardcoreDay * hardcoreWeight(req)); }
  function hardcoreFailureRP(req){ return -Math.min(RP.hardcoreFailMax, 2 * hardcoreDailyRP(req)); }

  var HARDCORE_RECURRING_EVERY = 30;   /* after 100 days, one every month */
  var HARDCORE_RECURRING_RP    = 420;
  var HARDCORE_MAX_DAYS        = 2000;

  /* Because the rating only looks at the last RATING_WINDOW days, a run's early
     milestones eventually age out. Without something after them, the LONGEST
     runs in the game - the hardest thing anyone can do here - would quietly
     stop being worth anything, and a 400-day streak would rank below a fresh
     one. So past 100 days a milestone lands every month, for as long as the run
     is alive. Keeping a run going is the only thing that reaches the apex, and
     it has to be kept going to stay there. */
  function hardcoreMilestones(){
    var out = HARDCORE_EARLY.slice();
    for (var d = HARDCORE_EARLY[HARDCORE_EARLY.length-1].days + HARDCORE_RECURRING_EVERY;
         d <= HARDCORE_MAX_DAYS; d += HARDCORE_RECURRING_EVERY){
      out.push({ days:d, rp:HARDCORE_RECURRING_RP, recurring:true });
    }
    return out;
  }
  var HARDCORE_MILESTONES = hardcoreMilestones();

  var TIERS = [
    { key:"ash",      name:"Ash",       color:"#8B8FA3", glow:"#B9BECF" },
    { key:"iron",     name:"Iron",      color:"#9A8F80", glow:"#C7BAA6" },
    { key:"bronze",   name:"Bronze",    color:"#C57B3C", glow:"#EFA45F" },
    { key:"silver",   name:"Silver",    color:"#AFC0D6", glow:"#E3EDFB" },
    { key:"gold",     name:"Gold",      color:"#E2B12F", glow:"#FFD766" },
    { key:"platinum", name:"Platinum",  color:"#4FD5C2", glow:"#8CF4E6" },
    { key:"diamond",  name:"Diamond",   color:"#6FA8FF", glow:"#A9CCFF" },
    { key:"master",   name:"Master",    color:"#B47BFF", glow:"#D8B6FF" }
  ];
  /* 8 tiers x 3 divisions x 200 RP = 4800, then two single-band apex ranks. */
  var APEX = [
    { key:"ascendant", name:"Ascendant", color:"#FF7A3D", glow:"#FFB27A", from:4800, to:5399 },
    { key:"eternal",   name:"Eternal",   color:"#FFD166", glow:"#FFF0B8", from:5400, to:MAX_RP }
  ];

  /* ------------------------------------------------------------- utilities */

  function S(){ return (typeof window !== "undefined" && window.state) ? window.state : null; }
  function clone(v){ return v == null ? v : JSON.parse(JSON.stringify(v)); }
  function int(v){ var n = Number(v); return isFinite(n) ? Math.round(n) : 0; }
  function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }
  function isDay(v){ return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v); }

  function dayKeyOf(value){
    var d = value instanceof Date ? value : new Date(value);
    if (!isFinite(d.getTime())) return null;
    return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" +
           String(d.getDate()).padStart(2,"0");
  }
  function todayKey(){ return dayKeyOf(new Date()); }

  function dayOrdinal(day){
    if (!isDay(day)) return null;
    var p = day.split("-");
    return Math.floor(Date.UTC(+p[0], +p[1]-1, +p[2]) / 86400000);
  }
  function dayFromOrdinal(ord){
    if (!isFinite(ord)) return null;
    var d = new Date(ord * 86400000);
    return d.getUTCFullYear() + "-" + String(d.getUTCMonth()+1).padStart(2,"0") + "-" +
           String(d.getUTCDate()).padStart(2,"0");
  }
  function addDays(day, n){
    var o = dayOrdinal(day);
    return o == null ? null : dayFromOrdinal(o + n);
  }
  function endOfDayMs(ms){
    var d = new Date(ms);
    if (!isFinite(d.getTime())) return null;
    d.setHours(23,59,59,999);
    return d.getTime();
  }
  /* Deterministic timestamp for a day, used so an event carries the same `at`
     on every device instead of "whenever this device happened to notice". */
  function noonOf(day){
    var o = dayOrdinal(day);
    return o == null ? 0 : (o * 86400000) + 43200000;
  }

  function WD(){ return (typeof window !== "undefined") ? window : {}; }
  function hasWorldDepth(){
    var w = WD();
    return typeof w.wdQuestSetForPeriod === "function" &&
           typeof w.wdQuestValueForPeriod === "function" &&
           typeof w.wdPeriodKeyOf === "function";
  }

  /* ------------------------------------------------------------- the store */

  function emptyLedger(){
    return { version: VERSION, installedDay: null, installedAt: 0, events: {}, retractions: {} };
  }

  function normalizeEvent(raw){
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    var id = typeof raw.id === "string" ? raw.id.slice(0,120) : "";
    if (!id) return null;
    if (!isDay(raw.day)) return null;
    var delta = Number(raw.delta);
    if (!isFinite(delta) || Math.abs(delta) > 5000) return null;
    return {
      id: id,
      kind: typeof raw.kind === "string" ? raw.kind.slice(0,32) : "other",
      day: String(raw.day),
      delta: Math.round(delta),
      at: Math.max(0, int(raw.at)),
      label: typeof raw.label === "string" ? raw.label.slice(0,160) : "",
      exempt: raw.exempt === true
    };
  }

  function normalizeLedger(raw){
    var out = emptyLedger();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
    out.installedDay = isDay(raw.installedDay) ? String(raw.installedDay) : null;
    out.installedAt  = Math.max(0, int(raw.installedAt));
    var src = (raw.events && typeof raw.events === "object" && !Array.isArray(raw.events)) ? raw.events : {};
    Object.keys(src).forEach(function(key){
      var ev = normalizeEvent(src[key]);
      /* The install date is a hard floor, not a preference. An event dated
         before Standing existed is dropped here rather than merely ignored by
         the fold, so it cannot be resurrected by a sync from a device still
         running the old build, or restored from a backup taken under it. */
      if (ev && out.installedDay && ev.day < out.installedDay) return;
      /* The map key and the event's own id must agree. A record whose key was
         rewritten - by a bad merge, a hand edit, a corrupted sync - is dropped
         rather than trusted, because the id IS the anti-duplication guarantee
         and an id that does not match its slot is no guarantee at all. */
      if (ev && ev.id === key) out.events[key] = ev;
    });
    var retractions = raw.retractions;
    if (retractions && typeof retractions === "object" && !Array.isArray(retractions)) {
      Object.keys(retractions).forEach(function(id){
        if (!/^hcf:/.test(id) || id.length > 120 || !Array.isArray(retractions[id])) return;
        retractions[id].forEach(function(day){ if (isDay(day)) markRetraction(out, id, day); });
      });
    }
    return out;
  }

  function isRetracted(ledger, event){
    return !!(ledger.retractions && ledger.retractions[event.id] && ledger.retractions[event.id].indexOf(event.day) !== -1);
  }
  function markRetraction(ledger, id, day){
    if (!/^hcf:/.test(id) || !isDay(day)) return false;
    var dates = ledger.retractions[id] || [];
    if (dates.indexOf(day) !== -1) return false;
    ledger.retractions[id] = dates.concat([day]).sort();
    return true;
  }
  function recordedLegacyFailure(ledger, event){
    if (!event || event.kind !== "hardcore_fail_v2") return null;
    var suffix = ":" + event.day;
    if (event.id.slice(-suffix.length) !== suffix) return null;
    var old = ledger.events[event.id.slice(0, -suffix.length)];
    return old && old.kind === "hardcore_fail" && old.day === event.day && !isRetracted(ledger, old) ? old : null;
  }

  /* -------------------------------------------------------------- the fold */

  function sortedEvents(ledger){
    return Object.keys(ledger.events).map(function(k){ return ledger.events[k]; })
      .filter(function(event){ return !isRetracted(ledger, event) && !recordedLegacyFailure(ledger, event); })
      .sort(function(a,b){
        if (a.day !== b.day) return a.day < b.day ? -1 : 1;
        return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
      });
  }

  /* Pure. Same events in, same rating out - on any device, in any order they
     arrived, forever. The per-day caps and the placement multipliers are part
     of the fold rather than stored state precisely so that a merge can never
     produce a rating that disagrees with the evidence. */
  function fold(ledger, asOfDay){
    var asOf = asOfDay || todayKey();
    var horizon = addDays(asOf, -RATING_WINDOW);
    /* The upper bound matters as much as the lower one. asOfDay used to move
       only the horizon, so "the rating as it stood at the last review" quietly
       included everything that happened AFTER that review - which would have
       made a published rank drift between reviews, defeating the entire point
       of publishing one. Today's fold is unaffected: nothing is ever dated
       later than today. */
    var events = sortedEvents(ledger).filter(function(e){
      if (horizon && !(e.day > horizon)) return false;
      return !asOf || e.day <= asOf;
    });
    var rp = START_RP;
    var scoredDays = 0;
    var days = [];
    var i = 0;
    while (i < events.length){
      var day = events[i].day;
      var group = [];
      while (i < events.length && events[i].day === day){ group.push(events[i]); i++; }

      var placement = scoredDays < PLACEMENT_DAYS;
      var rawGain = 0, rawLoss = 0, exemptGain = 0, hardcoreLoss = 0, hardestMiss = null;

      /* Per-kind daily limits. Sorted by id so the same four of forty count on
         every device - "whichever ones this device happened to see first" is
         not a rule, it is a race. */
      var seenOfKind = Object.create(null);
      var focusCredit = 0, extras = 0;
      group.sort(function(a, b){ return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0); });
      group.forEach(function(ev){
        ev.counted = true;
        if (ev.delta > 0){
          var limit = PER_DAY_KIND_LIMIT[ev.kind];
          if (limit != null){
            var n = (seenOfKind[ev.kind] = (seenOfKind[ev.kind] || 0) + 1);
            if (n > limit){ ev.counted = false; return; }
          }
          if (ev.exempt) exemptGain += ev.delta;
          else if (ev.kind === "active_day") focusCredit += ev.delta;
          else if (DAY_SCALED_KINDS[ev.kind]) extras += ev.delta;
          else rawGain += ev.delta;
        } else if (ev.kind === "hardcore_fail_v2") {
          /* Parallel commitments share the day's work. Their new-policy
             misses share one bounded daily cost as well. */
          if (ev.delta < hardcoreLoss) {
            if (hardestMiss) hardestMiss.counted = false;
            hardestMiss = ev;
            hardcoreLoss = ev.delta;
          } else ev.counted = false;
        } else {
          rawLoss += ev.delta;
        }
      });
      rawLoss += hardcoreLoss;

      /* The extras ceiling. Everything you ticked today is worth at most what
         today's focus was worth - see DAY_SCALED_KINDS above. The clipped
         amount is reported rather than silently dropped, so the day's detail
         can say WHY a tick paid less than its face value. */
      var extrasAllowed = Math.min(extras, Math.round(focusCredit * EXTRAS_RATIO));
      var extrasClipped = extras - extrasAllowed;
      rawGain += focusCredit + extrasAllowed;

      /* Scale on the rating you START the day with, so a day's reward does not
         depend on the order events happen to sit inside that day. */
      var scale = gainScale(rp);
      var gain = Math.round(rawGain * (placement ? 2 : 1) * scale);
      /* Hardcore keeps a floor under the scale. Diminishing returns should make
         the top a grind, not make the hardest thing in the game worthless once
         you are near it - Eternal has to be reachable by someone actually
         holding a run together, or the rung is decoration. */
      var exempt = Math.round(exemptGain * (placement ? 2 : 1) * Math.max(scale, 0.35));
      var loss = Math.round(rawLoss * (placement ? 0.5 : 1));
      gain = Math.min(gain, DAILY_GAIN_CAP);
      loss = Math.max(loss, -DAILY_LOSS_CAP);

      var before = rp;
      rp = clamp(rp + gain + exempt + loss, MIN_RP, MAX_RP);

      /* Placement measures how you PLAY, so only a day you actually played
         spends one of the five. A day whose entire contents is decay - you
         were not there - still costs its RP, but it does not burn a placement
         day, because otherwise five days away at the start would quietly eat
         the whole placement window and the first day you actually sat down to
         work would already be at normal rates. Placement is a head start for
         showing up, and you cannot show up by being absent. */
      if (group.some(function(e){ return e.kind !== "idle"; })) scoredDays++;
      days.push({
        day: day, before: before, after: rp, gain: gain, loss: loss,
        exempt: exempt, scale: scale, net: rp - before, placement: placement,
        focusCredit: focusCredit, extras: extras, extrasClipped: extrasClipped,
        capped: (rawGain * (placement ? 2 : 1)) > DAILY_GAIN_CAP ||
                (rawLoss * (placement ? 0.5 : 1)) < -DAILY_LOSS_CAP,
        limited: group.some(function(e){ return e.counted === false; }),
        events: group
      });
    }
    return {
      rp: rp,
      window: RATING_WINDOW,
      horizon: horizon,
      scoredDays: scoredDays,
      inPlacement: scoredDays < PLACEMENT_DAYS,
      placementLeft: Math.max(0, PLACEMENT_DAYS - scoredDays),
      days: days,
      eventCount: events.length
    };
  }

  /* ------------------------------------------------------------- the ladder */

  function rankFor(rp){
    rp = clamp(int(rp), MIN_RP, MAX_RP);
    for (var a = APEX.length - 1; a >= 0; a--){
      if (rp >= APEX[a].from){
        var apex = APEX[a];
        var span = Math.max(1, apex.to - apex.from);
        return {
          tier: apex.key, tierName: apex.name, division: 0, roman: "",
          label: apex.name, color: apex.color, glow: apex.glow,
          floor: apex.from, ceil: apex.to, apex: true,
          progress: clamp((rp - apex.from) / span, 0, 1),
          toNext: a === APEX.length - 1 ? 0 : (APEX[a+1].from - rp)
        };
      }
    }
    var index = Math.floor(rp / DIVISION_RP);          /* 0..23 */
    index = clamp(index, 0, TIERS.length * 3 - 1);
    var tier = TIERS[Math.floor(index / 3)];
    var withinTier = index % 3;                        /* 0,1,2 */
    var roman = ["III","II","I"][withinTier];
    var floor = index * DIVISION_RP;
    return {
      tier: tier.key, tierName: tier.name, division: 3 - withinTier, roman: roman,
      label: tier.name + " " + roman, color: tier.color, glow: tier.glow,
      floor: floor, ceil: floor + DIVISION_RP - 1, apex: false,
      progress: clamp((rp - floor) / DIVISION_RP, 0, 1),
      toNext: (floor + DIVISION_RP) - rp
    };
  }

  function ladder(){
    var rows = [];
    TIERS.forEach(function(t, ti){
      ["III","II","I"].forEach(function(roman, wi){
        var floor = (ti * 3 + wi) * DIVISION_RP;
        rows.push({ label: t.name + " " + roman, floor: floor, ceil: floor + DIVISION_RP - 1,
                    color: t.color, glow: t.glow, apex:false });
      });
    });
    APEX.forEach(function(a){
      rows.push({ label: a.name, floor: a.from, ceil: a.to, color: a.color, glow: a.glow, apex:true });
    });
    return rows;
  }

  /* ---------------------------------------------------------- the derivation

     Everything below returns CANDIDATE events. Nothing here writes. The same
     state produces the same candidates every time, which is what lets
     materialisation be a set-union instead of an application of changes.
     ------------------------------------------------------------------------ */

  function ev(id, kind, day, delta, label, exempt){
    return { id:id, kind:kind, day:day, delta:delta, at:noonOf(day),
             label:label, exempt: !!exempt };
  }

  function minutesOnDay(s, day){
    return Math.max(0, Math.floor(Number((s && s.history || {})[day]) || 0));
  }

  /* The work itself. A small, honest credit for the minutes actually logged,
     so that someone who just quietly does the work climbs - slowly - without
     ever setting a deadline or touching a challenge. */
  function deriveActivity(s, gateDay, todayD){
    var out = [];
    var todayOrd = dayOrdinal(todayD);
    if (todayOrd == null) return out;
    for (var back = 1; back <= LOOKBACK_DAYS; back++){
      var day = dayFromOrdinal(todayOrd - back);
      if (!day || day < gateDay) break;
      var mins = minutesOnDay(s, day);
      if (mins < MIN_ACTIVE_MIN) continue;
      /* v10.32: hours are the point of the app, so hours drive the rank.
         The old rule paid 3 RP per half hour and stopped at 12, so a two-hour
         day and an eight-hour day scored identically and a single ticked quest
         was worth as much as either. Focus was decoration on the ladder.

         Now a day is worth activeDay RP at one hour and grows on a curve with
         an exponent below 1, so more hours always pay more, but the fourth
         hour pays less than the first. That rewards showing up daily rather
         than one heroic session, and it cannot be farmed: the day is still
         capped, and the cap is reached around eight hours.

           1h -> 12   2h -> 18   4h -> 28   8h -> 42   12h -> 53   24h -> 81 */
      var value = Math.round(RP.activeDay * Math.pow(mins / 60, ACTIVE_DAY_CURVE));
      if (value <= 0) continue;
      out.push(ev("act:" + day, "active_day", day, value,
                  "Focused " + Math.floor(mins / 60) + "h " + (mins % 60) + "m"));
    }
    return out;
  }

  /* Dated quests - the commitments you made to yourself. */
  function deriveCommitments(s, creditGate, penaltyGate, todayD, ledger){
    var out = [];
    var already = (ledger && ledger.events) ? ledger.events : {};
    var quests = Array.isArray(s && s.quests) ? s.quests : [];
    var nowMs = Date.now();
    quests.forEach(function(q){
      if (!q || q.id == null || !q.dueAt) return;
      var dueDay = dayKeyOf(q.dueAt);
      if (!dueDay || dueDay < creditGate) return;
      var limit = endOfDayMs(q.dueAt);
      if (limit == null) return;
      var title = String(q.title || "a quest").slice(0, 60);
      var id = String(q.id);
      var doneAt = q.done ? Number(q.doneAt) : NaN;

      if (q.done && isFinite(doneAt) && doneAt <= limit){
        /* A commitment must have existed before it can count as kept. A quest
           with no recorded creation time cannot prove it did, and unprovable
           credit is exactly the thing this ledger refuses to hand out. */
        var createdAt = Number(q.at);
        if (!isFinite(createdAt) || (doneAt - createdAt) < MIN_COMMITMENT_MS) return;
        var hitDay = dayKeyOf(doneAt) || dueDay;
        if (hitDay > todayD) hitDay = todayD;
        /* And the day has to have had real work on it. This is a focus app;
           a day with five logged minutes and twenty ticked boxes is not a
           productive day, and the ladder should not say it was. */
        if (minutesOnDay(s, hitDay) < MIN_ACTIVE_MIN) return;
        out.push(ev("q:" + id + ":hit", "quest_hit", hitDay, RP.questHit,
                    "Kept a deadline — " + title));
        return;
      }
      /* Missed: the due day is over and it was not finished within it. A quest
         completed with no recorded doneAt is treated as finished late rather
         than on time; the benefit of the doubt does not extend to evidence
         that is not there. */
      /* A recorded hit is proof the deadline was met, and proof does not expire.
         Un-ticking a finished quest - by accident, or to re-use the row - must
         never turn a kept deadline into a missed one after the fact. Once the
         ledger says you made it, nothing you do to the checkbox later can
         charge you for it. */
      if (already["q:" + id + ":hit"]) return;

      if (dueDay < penaltyGate) return;   /* you were not told it was scored */

      if (nowMs > limit + MISS_GRACE_MS){
        out.push(ev("q:" + id + ":miss", "quest_miss", dueDay, RP.questMiss,
                    "Missed a deadline — " + title));
        if (q.done){
          var lateDay = isFinite(doneAt) ? (dayKeyOf(doneAt) || dueDay) : todayD;
          if (lateDay < dueDay) lateDay = dueDay;
          if (lateDay > todayD) lateDay = todayD;
          out.push(ev("q:" + id + ":late", "quest_late", lateDay, RP.questLate,
                      "Finished late — " + title));
        }
      }
    });
    return out;
  }

  /* Daily / weekly / seasonal challenges, settled for periods that are OVER. */
  /* `retract` collects ids that were RE-VERIFIED and genuinely not earned, as
     opposed to ids that simply could not be checked. Only the first kind may
     ever be removed from the ledger: an unverifiable quest (its source pruned)
     must keep the rank it was already paid, or pruning a log would quietly
     delete earned progress. */
  function deriveChallenges(s, gateDay, todayD, retract){
    var out = [];
    if (!hasWorldDepth()) return out;
    var w = WD();
    var todayOrd = dayOrdinal(todayD);
    if (todayOrd == null) return out;

    function settle(scope, key, hitRp, day){
      var set;
      try { set = w.wdQuestSetForPeriod(scope, key) || []; } catch(_){ return; }
      set.forEach(function(q){
        if (!q || !q.id) return;
        var value = null;
        try { value = w.wdQuestValueForPeriod(s, scope, key, q.kind); } catch(_){ value = null; }
        if (value === null) return;                    /* not re-verifiable */
        if (Math.floor(value) < (q.target | 0)) {
          /* Verified, and it is not met. If the ledger still holds a hit for
             this exact challenge, the record no longer supports it. */
          if (retract) retract[scope.charAt(0) + "q:" + key + ":" + q.id] = true;
          return;                                        /* rolled at you - never charged */
        }
        out.push(ev(scope.charAt(0) + "q:" + key + ":" + q.id, scope + "_hit", day, hitRp,
                    "Cleared — " + q.label));
      });
    }

    /* DAILY: only days that actually saw activity. A day the app never opened
       is an absence, and absence is handled by decay - charging it as three
       separate failed challenges as well would be punishing the same fact
       four times. */
    for (var back = 1; back <= LOOKBACK_DAYS; back++){
      var day = dayFromOrdinal(todayOrd - back);
      if (!day || day < gateDay) break;
      var active = false;
      try { active = !!w.wdDayHasActivity(s, day); } catch(_){ active = false; }
      if (!active) continue;
      settle("daily", day, RP.dailyHit, day);
    }

    /* WEEKLY / SEASONAL: settle on the last day of the period, so the reward
       or the cost lands on a day inside the period it belongs to. */
    var seenWeek = {}, seenMonth = {};
    for (var b2 = 1; b2 <= LOOKBACK_WEEKS * 7 + 7; b2++){
      var d2 = dayFromOrdinal(todayOrd - b2);
      if (!d2 || d2 < gateDay) break;
      var wk = w.wdPeriodKeyOf("weekly", new Date(noonOf(d2)));
      if (!wk || seenWeek[wk]) continue;
      seenWeek[wk] = true;
      if (wk === w.wdPeriodKeyOf("weekly", new Date(noonOf(todayD)))) continue;
      settle("weekly", wk, RP.weeklyHit, d2);
    }
    for (var b3 = 1; b3 <= LOOKBACK_MONTHS * 31 + 31; b3++){
      var d3 = dayFromOrdinal(todayOrd - b3);
      if (!d3 || d3 < gateDay) break;
      var mk = w.wdPeriodKeyOf("seasonal", new Date(noonOf(d3)));
      if (!mk || seenMonth[mk]) continue;
      seenMonth[mk] = true;
      if (mk === w.wdPeriodKeyOf("seasonal", new Date(noonOf(todayD)))) continue;
      settle("seasonal", mk, RP.seasonHit, d3);
    }
    return out;
  }

  /* Hardcore. Derived entirely from hardcore's own records, which already
     defend themselves against invented streaks and resurrected runs. */
  function deriveHardcore(s, creditGate, penaltyGate){
    var out = [];
    var hc = s && s.fh12Hardcore;
    if (!hc || typeof hc !== "object") return out;
    var live = Array.isArray(hc.runs) ? hc.runs
             : (hc.active === true && hc.run ? [hc.run] : []);
    var past = Array.isArray(hc.history) ? hc.history : [];
    var daily = Object.create(null);

    function milestones(run){
      if (!run || !run.id || !isDay(run.startDay)) return;
      var survived = Math.max(0, int(run.daysSurvived));
      var label = (run.requirement && run.requirement.label) ? run.requirement.label : "Hardcore";
      var weight = hardcoreWeight(run.requirement);
      var earned = Array.isArray(run.rankEarnedDays) ? run.rankEarnedDays.filter(isDay).sort() : null;
      if (earned && isDay(run.rankDailyFromDay)) earned.forEach(function(day){
        if (day < run.rankDailyFromDay || day < creditGate || day >= todayKey()) return;
        var value = hardcoreDailyRP(run.requirement);
        if (!daily[day] || value > daily[day].delta) {
          daily[day] = ev("hcday2:" + day, "hardcore_day", day, value,
            "Hardcore day — strongest completed daily bar", false);
        }
      });
      HARDCORE_MILESTONES.forEach(function(m){
        if (survived < m.days) return;
        /* Updated audits carry actual completed dates. Pauses and excuses
           never advance this list; an open day cannot pay a milestone. Older
           run summaries retain their original derivation for compatibility. */
        var day = earned ? earned[m.days - 1] : addDays(run.startDay, m.days);
        if (!day || day < creditGate) return;
        var value = Math.round(m.rp * weight);
        out.push(ev("hcm:" + run.id + ":" + m.days, "hardcore_milestone", day, value,
                    "Hardcore — " + m.days + " days on " + label +
                    (weight === 1 ? "" : "  (\u00d7" + weight + " for the bar)"), true));
      });
    }

    live.forEach(milestones);
    past.forEach(function(run){
      milestones(run);
      if (!run || !run.id) return;
      /* Only a MISSED requirement costs rank. Ending a run on purpose is a
         decision, not a failure, and the ladder does not punish decisions. */
      if (!isDay(run.missedDay)) return;
      if (run.missedDay < penaltyGate) return;
      var label = (run.requirement && run.requirement.label) ? run.requirement.label : "Hardcore";
      var fair = run.rankFailurePolicy === 2;
      out.push(ev("hcf:" + run.id + (fair ? ":" + run.missedDay : ""), fair ? "hardcore_fail_v2" : "hardcore_fail", run.missedDay,
                  fair ? hardcoreFailureRP(run.requirement) : RP.hardcoreFail,
                  "Hardcore run lost — missed " + label));
    });
    Object.keys(daily).sort().forEach(function(day){ out.push(daily[day]); });
    return out;
  }

  /* Decay for days with nothing on them at all, with a rest grace so a normal
     week off at the weekend is free. */
  function deriveIdle(s, gateDay, todayD){
    var out = [];
    if (!hasWorldDepth()) return out;
    var w = WD();
    var todayOrd = dayOrdinal(todayD);
    if (todayOrd == null) return out;

    var activeCache = {};
    function activeOn(day){
      if (!(day in activeCache)){
        try { activeCache[day] = !!w.wdDayHasActivity(s, day); }
        catch(_){ activeCache[day] = false; }
      }
      return activeCache[day];
    }

    for (var back = 1; back <= LOOKBACK_DAYS; back++){
      var day = dayFromOrdinal(todayOrd - back);
      if (!day || day < gateDay) break;
      if (activeOn(day)) continue;
      /* Rest grace: count activity across the window ENDING on this day. */
      var activeInWindow = 0;
      for (var k = 0; k < REST_WINDOW; k++){
        var probe = dayFromOrdinal(todayOrd - back - k);
        if (probe && activeOn(probe)) activeInWindow++;
      }
      if (activeInWindow >= REST_MIN_ACTIVE) continue;
      out.push(ev("idle:" + day, "idle", day, RP.idleDay, "No activity recorded"));
    }
    return out;
  }

  function deriveAll(s){
    var ledger = normalizeLedger(s && s.fhRank);
    var todayD = todayKey();
    var penaltyGate = ledger.installedDay || todayD;          /* costs start here */
    var creditGate = addDays(penaltyGate, -SEED_DAYS) || penaltyGate;  /* credit may reach back */
    var retract = Object.create(null);
    var all = []
      .concat(deriveActivity(s, creditGate, todayD))
      .concat(deriveCommitments(s, creditGate, penaltyGate, todayD, ledger))
      .concat(deriveChallenges(s, creditGate, todayD, retract))
      .concat(deriveHardcore(s, creditGate, penaltyGate))
      .concat(deriveIdle(s, penaltyGate, todayD));
    /* Carried alongside the candidates rather than returned separately, so
       every existing caller of deriveAll keeps working unchanged. */
    all.retractable = retract;
    return all;
  }

  /* ------------------------------------------------------- materialisation */

  /* A withdrawn failure retains its original event plus a dated receipt.
     Unioning that receipt prevents stale peers from restoring the charge.
     Historical event amounts are never repriced to the new policy. */
  function retract(s, eventId){
    if (!s || !eventId) return { changed:false };
    var ledger = normalizeLedger(s.fhRank);
    if (!ledger.events || !ledger.events[eventId]) return { changed:false };
    var removed = ledger.events[eventId];
    if (!markRetraction(ledger, eventId, removed.day)) return { changed:false, removed:removed };
    s.fhRank = ledger;
    return { changed:true, removed:removed };
  }

  function materialize(s){
    if (!s) return { changed:false };
    var ledger = normalizeLedger(s.fhRank);
    var changed = false;
    var todayD = todayKey();

    /* If normalisation threw anything away - a pre-install event from an older
       build, a corrupted record - persist the cleaned ledger rather than
       filtering the same garbage out on every read forever. */
    var storedCount = (s.fhRank && s.fhRank.events && typeof s.fhRank.events === "object")
      ? Object.keys(s.fhRank.events).length : 0;
    var purged = storedCount - Object.keys(ledger.events).length;
    if (purged > 0) changed = true;

    if (!ledger.installedDay){
      ledger.installedDay = todayKey();
      ledger.installedAt = Date.now();
      changed = true;
    }

    var added = 0;
    /* Revivals carry durable evidence even if the penalty arrives later from
       a stale peer. Preserve the original event and its exact amount; a
       withdrawal suppresses that episode instead of minting positive RP. */
    var hc = s.fh12Hardcore || {};
    var runs = (Array.isArray(hc.runs) ? hc.runs : (hc.active && hc.run ? [hc.run] : [])).concat(hc.history || []);
    runs.forEach(function(run){
      (run.rankReversedFailures || []).forEach(function(row){
        if (row && (row.id === "hcf:" + run.id || row.id === "hcf:" + run.id + ":" + row.day)) {
          if (markRetraction(ledger, row.id, row.day)) changed = true;
        }
      });
    });
    var candidates = deriveAll(s);
    var truncated = false;
    var derivedIds = Object.create(null);
    for (var i = 0; i < candidates.length; i++){
      var cand = normalizeEvent(candidates[i]);
      if (!cand) continue;
      derivedIds[cand.id] = cand;
      if (isRetracted(ledger, cand)) continue;
      /* A stale active copy can re-report an already recorded failure. Never
         reprice that episode. Legacy event timestamps are deterministic, so
         an old peer's previously unseen charge cannot safely be classified as
         historical versus newly derived. Its exact amount takes precedence;
         the versioned duplicate is excluded in either merge order. */
      if (recordedLegacyFailure(ledger, cand)) continue;
      if (ledger.events[cand.id]) {
        /* One date owns one daily award. A later stronger qualifying run
           supplies only the difference; duplicate/easier runs supply zero. */
        var previous = ledger.events[cand.id];
        if (cand.kind === "hardcore_day" && /^hcday2:/.test(cand.id) &&
            previous.kind === cand.kind && cand.delta > previous.delta) {
          ledger.events[cand.id] = cand;
          changed = true;
        }
        continue;
      }
      if (Object.keys(ledger.events).length >= MAX_EVENTS) { truncated = true; break; }
      ledger.events[cand.id] = cand;
      added++; changed = true;
    }

    /* v10.44: RECONCILE THE EVENTS THAT ARE PURE FUNCTIONS OF HISTORY.

       materialize only ever added. An event whose source later shrank stayed
       forever, so deleting a session or correcting a day's minutes downward
       left the RP it had already paid out sitting in the ledger. Rank drifted
       permanently above what the record supports - unearned progress, arrived
       at by doing nothing.

       Reconciled here: active_day and idle. Both are computed solely from
       state.history, which is the authority and is never pruned, so "not
       derived any more" reliably means "no longer true".

       NOT reconciled: quests, hardcore milestones. Their sources CAN be
       pruned, and treating a pruned log as a retraction would delete rank that
       was genuinely earned - the opposite mistake, and the worse one.

       Skipped entirely if the candidate list hit the event cap, since a
       truncated derivation cannot distinguish "gone" from "not reached". */
    var RECONCILABLE = { active_day:1, idle:1 };
    var verifiedGone = (candidates && candidates.retractable) || Object.create(null);

    /* v10.47: ONLY RECONCILE WHAT THE DERIVER STILL SPEAKS FOR.

       deriveAll looks back LOOKBACK_DAYS and no further. That is a moving
       window, not a statement about the past: an event from six months ago is
       simply out of range, not withdrawn. The previous pass read "not derived"
       as "no longer true" for EVERY stored event, so on a long-lived profile
       it deleted every activity event older than the window - hundreds of them
       - the first time it ran. That is why the ledger was append-only in the
       first place, and I removed that property without understanding why it
       was there.

       Reconciliation is now confined to the window the deriver actually
       covers. Inside it, "not derived" really does mean the record no longer
       supports the event. Outside it, nothing is touched, ever. */
    var reconcileFloor = addDays(todayD, -LOOKBACK_DAYS);

    if (!truncated){
      var ids = Object.keys(ledger.events);
      for (var r = 0; r < ids.length; r++){
        var stored = ledger.events[ids[r]];
        if (!stored) continue;
        /* Out of the deriver's reach - leave it exactly as it is. */
        if (!reconcileFloor || !isDay(stored.day) || stored.day < reconcileFloor) continue;
        var live = derivedIds[stored.id];
        /* A challenge that was actually re-checked and is not met any more. */
        if (!live && verifiedGone[stored.id]){
          delete ledger.events[stored.id];
          changed = true;
          continue;
        }
        if (!RECONCILABLE[stored.kind]) continue;
        if (!live){
          delete ledger.events[stored.id];
          changed = true;
          continue;
        }
        if (live.delta !== stored.delta){
          ledger.events[stored.id] = live;
          changed = true;
        }
      }
    }

    if (changed) s.fhRank = ledger;
    return { changed: changed, added: added, purged: Math.max(0, purged), ledger: ledger };
  }

  /* -------------------------------------------------------------- the merge

     Union by id. Two devices that saw the same fact produce byte-identical
     events, so the union is exact. If two records somehow share an id and
     disagree, the tie is broken by a stable total order rather than by
     recency, because "whichever device synced last" is not a truth. */
  function mergeRank(leftRaw, rightRaw){
    if (leftRaw === undefined && rightRaw === undefined) return undefined;
    var a = normalizeLedger(leftRaw);
    var b = normalizeLedger(rightRaw);
    var out = emptyLedger();

    var days = [a.installedDay, b.installedDay].filter(isDay).sort();
    out.installedDay = days.length ? days[0] : null;
    var stamps = [a.installedAt, b.installedAt].filter(function(n){ return n > 0; });
    out.installedAt = stamps.length ? Math.min.apply(null, stamps) : 0;

    function take(src){
      Object.keys(src.events).forEach(function(id){
        var incoming = src.events[id];
        var existing = out.events[id];
        if (!existing){ out.events[id] = clone(incoming); return; }
        if (JSON.stringify(existing) === JSON.stringify(incoming)) return;
        if (/^hcday2:/.test(id) && incoming.kind === "hardcore_day" && existing.kind === "hardcore_day" &&
            incoming.delta !== existing.delta) {
          if (incoming.delta > existing.delta) out.events[id] = clone(incoming);
          return;
        }
        /* Divergent copies of one event: keep the lexicographically smaller
           serialisation. Arbitrary, but identical on both devices, which is
           the only property that matters - it converges instead of oscillating
           back and forth every time the two sync. */
        if (JSON.stringify(incoming) < JSON.stringify(existing)) out.events[id] = clone(incoming);
      });
      Object.keys(src.retractions).forEach(function(id){
        src.retractions[id].forEach(function(day){ markRetraction(out, id, day); });
      });
    }
    take(a); take(b);

    /* Safety valve. Rather than silently truncating - which would make the
       rating disagree between devices - keep the newest events by day and
       record that the horizon moved. */
    var ids = Object.keys(out.events);
    if (ids.length > MAX_EVENTS){
      ids.sort(function(x, y){
        var ex = out.events[x], ey = out.events[y];
        if (ex.day !== ey.day) return ex.day < ey.day ? 1 : -1;
        return ex.id < ey.id ? -1 : 1;
      });
      var kept = {};
      ids.slice(0, MAX_EVENTS).forEach(function(id){ kept[id] = out.events[id]; });
      out.events = kept;
    }
    return out;
  }

  /* ------------------------------------------------------------------- api */

  /* ====================================================== THE RANK REVIEW

     Asked for directly: "whatever time it takes for them to update your rank...
     they look at what I've done, and if it's better or worse, they adjust
     accordingly. And then the next ranking determination, it happens again."

     A number that moves every time you close a session is a score, not a rank.
     Competitive games publish a rank on a cadence and hold it there between
     reviews, and that is the difference between "how am I doing right now" and
     "where do I stand" - the second one is only meaningful if it stays still
     long enough to mean something.

     So: the LIVE rating still moves continuously and is still visible, because
     hiding it would just make the review feel arbitrary. But the PUBLISHED
     rank - the one on the badge, the one that is actually your rank - only
     changes on review day.

     Fourteen days, because the fold already reflects the last sixty: a week
     would republish before much of the window had turned over, and a month
     would let a bad fortnight sit on your profile long after you had fixed it.

     Nothing about the schedule is stored. Review N lands on installedDay + N*14
     and the rating at any past boundary is just the fold as of that day, so
     every device computes the same schedule and the same published rank from
     the same ledger, with nothing to sync and nothing to drift. */
  var REVIEW_EVERY_DAYS = 14;

  function reviewSchedule(installedDay, todayD){
    var today = todayD || todayKey();
    var anchor = isDay(installedDay) ? installedDay : today;
    var a = dayOrdinal(anchor), t = dayOrdinal(today);
    if (a == null || t == null) return null;
    var elapsed = Math.max(0, t - a);
    var completed = Math.floor(elapsed / REVIEW_EVERY_DAYS);
    var lastDay  = completed > 0 ? addDays(anchor, completed * REVIEW_EVERY_DAYS) : null;
    var nextDay  = addDays(anchor, (completed + 1) * REVIEW_EVERY_DAYS);
    var prevDay  = completed > 1 ? addDays(anchor, (completed - 1) * REVIEW_EVERY_DAYS) : null;
    return {
      every: REVIEW_EVERY_DAYS,
      anchor: anchor,
      count: completed,
      lastReviewDay: lastDay,
      prevReviewDay: prevDay,
      nextReviewDay: nextDay,
      daysUntilNext: Math.max(0, dayOrdinal(nextDay) - t),
      /* the stretch currently being judged */
      periodStart: lastDay || anchor,
      periodEnd: nextDay
    };
  }

  /* What the last review actually looked at: the work itself, in plain terms,
     so the adjustment is never just a number that moved on its own. */
  function periodReport(ledger, fromDay, toDay){
    var out = { minutes:0, activeDays:0, questsKept:0, questsMissed:0,
                challenges:0, hardcoreDays:0, hardcoreDailyDays:0, rp:0 };
    var failureByDay = Object.create(null);
    var evs = sortedEvents(ledger);
    for (var i = 0; i < evs.length; i++){
      var e = evs[i];
      if (fromDay && e.day <= fromDay) continue;
      if (toDay && e.day > toDay) continue;
      if (e.kind === "hardcore_fail_v2") failureByDay[e.day] = Math.min(failureByDay[e.day] || 0, e.delta);
      else out.rp += e.delta;
      if (e.kind === "active_day"){ out.activeDays++;
        var m = /Focused (\d+)h (\d+)m/.exec(e.label || "");
        if (m) out.minutes += (+m[1]) * 60 + (+m[2]);
      }
      else if (e.kind === "quest_hit") out.questsKept++;
      else if (e.kind === "quest_miss") out.questsMissed++;
      else if (e.kind === "daily_hit" || e.kind === "weekly_hit" || e.kind === "seasonal_hit") out.challenges++;
      else if (e.kind === "hardcore_milestone") out.hardcoreDays++;
      else if (e.kind === "hardcore_day") out.hardcoreDailyDays++;
    }
    Object.keys(failureByDay).forEach(function(day){ out.rp += failureByDay[day]; });
    return out;
  }

  /* The published rank, plus everything needed to explain it. */
  function standing(stateOrLedger, todayD){
    var raw = stateOrLedger && stateOrLedger.fhRank ? stateOrLedger.fhRank : stateOrLedger;
    var ledger = normalizeLedger(raw);
    var today = todayD || todayKey();
    var sched = reviewSchedule(ledger.installedDay, today);
    var live = fold(ledger, today);
    if (!sched){
      return { ok:false, live:{ rp:live.rp, rank:rankFor(live.rp) } };
    }
    var provisional = sched.count < 1;
    /* Before the first review you have no published rank yet - the same way a
       game will not print one until placements are done. The live rating is
       still shown, clearly labelled, so nothing is hidden while you wait. */
    var pubFold = provisional ? live : fold(ledger, sched.lastReviewDay);
    var prevFold = sched.prevReviewDay ? fold(ledger, sched.prevReviewDay) : null;
    var from = prevFold ? prevFold.rp : (provisional ? null : START_RP);
    var delta = (from == null) ? 0 : (pubFold.rp - from);
    return {
      ok: true,
      provisional: provisional,
      rp: pubFold.rp,
      rank: rankFor(pubFold.rp),
      live: { rp: live.rp, rank: rankFor(live.rp) },
      trend: live.rp - pubFold.rp,
      review: {
        every: sched.every,
        count: sched.count,
        lastDay: sched.lastReviewDay,
        nextDay: sched.nextReviewDay,
        daysUntilNext: sched.daysUntilNext,
        from: from,
        to: pubFold.rp,
        delta: delta,
        direction: delta > 0 ? "up" : (delta < 0 ? "down" : "held"),
        /* what the most recent completed review judged */
        report: sched.lastReviewDay
          ? periodReport(ledger, sched.prevReviewDay || addDays(sched.lastReviewDay, -sched.every), sched.lastReviewDay)
          : null,
        /* and what is accumulating toward the next one */
        current: periodReport(ledger, sched.periodStart, today)
      }
    };
  }

  function summary(){
    var s = S();
    var ledger = normalizeLedger(s && s.fhRank);
    var f = fold(ledger);
    var rank = rankFor(f.rp);
    return {
      ok: true,
      installedDay: ledger.installedDay,
      rp: f.rp,
      rank: rank,
      inPlacement: f.inPlacement,
      placementLeft: f.placementLeft,
      scoredDays: f.scoredDays,
      eventCount: f.eventCount,
      days: f.days,
      standing: standing(ledger)
    };
  }

  function recent(limit){
    var s = S();
    var ledger = normalizeLedger(s && s.fhRank);
    var f = fold(ledger);
    var rows = [];
    for (var i = f.days.length - 1; i >= 0 && rows.length < (limit || 40); i--){
      rows.push(f.days[i]);
    }
    return rows;
  }

  var refreshing = false;
  async function refresh(reason){
    if (refreshing) return { changed:false };
    var s = S();
    if (!s) return { changed:false };
    refreshing = true;
    var prior = s.fhRank;
    var hadRank = Object.prototype.hasOwnProperty.call(s, "fhRank");
    var installed = prior;
    var installedJSON = JSON.stringify(prior);
    try {
      if (typeof window.saveStateDurable !== "function") return { changed:false, error:"Verified saving is unavailable." };
      var res = materialize(s);
      installed = s.fhRank;
      installedJSON = JSON.stringify(installed);
      if (res.changed){
        var saved = await window.saveStateDurable({ source:"rank-" + String(reason || "refresh").slice(0,40), suppressMilestoneAnnouncement:true });
        if (saved === false) throw new Error("Verified saving refused the rank change.");
      }
      if (res.changed) { try { render(); } catch(_){} }
      return res;
    } catch (error){
      if (S() === s && s.fhRank === installed && JSON.stringify(installed) === installedJSON) {
        if (hadRank) s.fhRank = prior;
        else delete s.fhRank;
      }
      try { console.warn("[Life XP] Standing refresh failed safely:", reason, error); } catch(_){}
      return { changed:false, error:String(error && error.message || error) };
    } finally {
      refreshing = false;
    }
  }

  window.FH_RANK = Object.freeze({
    version: VERSION,
    START_RP: START_RP,
    RP: RP,
    HARDCORE_MILESTONES: HARDCORE_MILESTONES,
    HARDCORE_EARLY: HARDCORE_EARLY,
    hardcoreWeight: hardcoreWeight,
    hardcoreDailyRP: hardcoreDailyRP,
    hardcoreFailureRP: hardcoreFailureRP,
    MISS_GRACE_MS: MISS_GRACE_MS,
    DAILY_GAIN_CAP: DAILY_GAIN_CAP,
    DAILY_LOSS_CAP: DAILY_LOSS_CAP,
    PLACEMENT_DAYS: PLACEMENT_DAYS,
    PER_DAY_KIND_LIMIT: PER_DAY_KIND_LIMIT,
    ACTIVE_DAY_CURVE: ACTIVE_DAY_CURVE,
    MIN_ACTIVE_MIN: MIN_ACTIVE_MIN,
    DAY_SCALED_KINDS: DAY_SCALED_KINDS,
    EXTRAS_RATIO: EXTRAS_RATIO,
    SCALE_FROM: SCALE_FROM,
    SCALE_FLOOR: SCALE_FLOOR,
    gainScale: gainScale,
    MIN_COMMITMENT_MS: MIN_COMMITMENT_MS,
    LOOKBACK_DAYS: LOOKBACK_DAYS,
    RATING_WINDOW: RATING_WINDOW,
    SEED_DAYS: SEED_DAYS,
    REVIEW_EVERY_DAYS: REVIEW_EVERY_DAYS,
    reviewSchedule: reviewSchedule,
    standing: standing,
    periodReport: periodReport,
    rankFor: rankFor,
    ladder: ladder,
    fold: fold,
    retract: retract,
    normalize: normalizeLedger,
    derive: deriveAll,
    materialize: materialize,
    merge: mergeRank,
    summary: summary,
    recent: recent,
    refresh: refresh,
    render: function(){ try { render(); } catch(_){} },
    __test: {
      deriveCommitments: deriveCommitments,
      deriveActivity: deriveActivity,
      deriveChallenges: deriveChallenges,
      deriveHardcore: deriveHardcore,
      deriveIdle: deriveIdle,
      dayKeyOf: dayKeyOf, addDays: addDays, noonOf: noonOf
    }
  });

  /* ================================================================ RENDER */

  var CSS_ID = "fh-rank-css";
  var CSS = [
    '#fh-rank-panel{display:flex;flex-direction:column;gap:14px}',
    '.fhr-hero{display:flex;gap:16px;align-items:center;flex-wrap:wrap;',
    '  padding:14px;border-radius:16px;border:1px solid var(--border,rgba(255,255,255,.12));',
    '  background:linear-gradient(135deg,rgba(255,255,255,.05),rgba(255,255,255,.01))}',
    '.fhr-review{display:flex;flex-direction:column;gap:6px;padding:12px 13px;border-radius:12px;',
    '  border:1px solid var(--border,rgba(255,255,255,.12));background:rgba(255,255,255,.03)}',
    '.fhr-reviewline{font-size:.92rem}',
    '.fhr-reviewwhat,.fhr-reviewnext,.fhr-reviewtrend{font-size:.82rem;opacity:.82}',
    '.fhr-review b.up{color:#7ee3a8}',
    '.fhr-review b.down{color:#ff9d9d}',
    '.fhr-badge{flex:0 0 auto;width:104px;height:104px}',
    '.fhr-badge svg{width:100%;height:100%;display:block}',
    '.fhr-meta{flex:1 1 220px;min-width:200px;display:flex;flex-direction:column;gap:7px}',
    '.fhr-rank{font-size:1.45rem;font-weight:700;letter-spacing:.01em;line-height:1.1}',
    '.fhr-rp{font-size:.86rem;opacity:.78}',
    '.fhr-bar{height:9px;border-radius:999px;overflow:hidden;',
    '  background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.08)}',
    '.fhr-bar>i{display:block;height:100%;border-radius:999px;transition:width .45s ease}',
    '.fhr-next{font-size:.76rem;opacity:.66}',
    '.fhr-note{font-size:.78rem;padding:8px 11px;border-radius:10px;',
    '  background:rgba(255,209,102,.10);border:1px solid rgba(255,209,102,.28);color:#ffe1a3}',
    '.fhr-sec{border:1px solid var(--border,rgba(255,255,255,.12));border-radius:14px;padding:12px}',
    '.fhr-sec>h4{margin:0 0 9px;font-size:.82rem;letter-spacing:.12em;text-transform:uppercase;opacity:.65;font-weight:600}',
    '.fhr-day{display:flex;flex-direction:column;gap:4px;padding:8px 0;',
    '  border-bottom:1px solid rgba(255,255,255,.06)}',
    '.fhr-day:last-child{border-bottom:0}',
    '.fhr-dayhead{display:flex;align-items:baseline;gap:9px}',
    '.fhr-date{font-size:.8rem;opacity:.72;min-width:74px}',
    '.fhr-net{font-weight:700;font-size:.9rem;min-width:52px}',
    '.fhr-net.up{color:#7ee2a8}.fhr-net.down{color:#ff9b9b}.fhr-net.flat{opacity:.5}',
    '.fhr-after{font-size:.74rem;opacity:.5;margin-left:auto}',
    '.fhr-reasons{display:flex;flex-direction:column;gap:2px;padding-left:83px}',
    '.fhr-reason{font-size:.75rem;opacity:.72;display:flex;gap:8px}',
    '.fhr-reason b{font-weight:600;min-width:38px;font-variant-numeric:tabular-nums}',
    '.fhr-reason.up b{color:#7ee2a8}.fhr-reason.down b{color:#ff9b9b}',
    '.fhr-reason.off{opacity:.38;text-decoration:line-through}',
    '.fhr-cap{font-size:.7rem;opacity:.55;padding-left:83px;font-style:italic}',
    '.fhr-ladder{position:relative;display:flex;flex-direction:column;gap:3px;max-height:300px;overflow:auto}',
    '.fhr-rung{display:flex;align-items:center;gap:9px;padding:4px 7px;border-radius:8px;font-size:.78rem}',
    '.fhr-rung.here{background:rgba(255,255,255,.11);font-weight:700;outline:1px solid rgba(255,255,255,.22)}',
    '.fhr-dot{width:9px;height:9px;border-radius:3px;flex:0 0 auto}',
    '.fhr-rungrp{margin-left:auto;opacity:.5;font-size:.72rem;font-variant-numeric:tabular-nums}',
    '.fhr-rules{font-size:.78rem;line-height:1.55;opacity:.8}',
    '.fhr-rules li{margin:3px 0}',
    '.fhr-rules code{font-size:.74rem;opacity:.85}',
    '.fhr-chip{display:inline-flex;align-items:center;gap:6px;padding:3px 9px;border-radius:999px;',
    '  font-size:.74rem;font-weight:600;border:1px solid rgba(255,255,255,.16)}',
    '#fh-rank-badge{display:inline-flex;align-items:center;gap:7px;cursor:pointer}',
    '#fh-rank-badge svg{width:26px;height:26px;display:block}',
    '#fh-rank-badge .lbl{font-size:.76rem;font-weight:700}',
    '#fh-rank-badge .rp{font-size:.7rem;opacity:.6;font-variant-numeric:tabular-nums}',
    '.fhr-empty{font-size:.82rem;opacity:.6}',
    '.fhr-window{font-size:.76rem;opacity:.55;margin:-4px 2px 0}'
  ].join("\n");

  function ensureCss(){
    if (document.getElementById(CSS_ID)) return;
    var el = document.createElement("style");
    el.id = CSS_ID; el.textContent = CSS;
    document.head.appendChild(el);
  }

  function esc(v){
    return String(v == null ? "" : v).replace(/[&<>"']/g, function(c){
      return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c];
    });
  }

  /* A crest, not a clip-art shield: a faceted plate whose facets take the tier
     colour, with the division numeral cut into it. Drawn at any size from one
     path set so the header chip and the 104px hero badge are the same mark. */
  function badgeSvg(rank, hidden){
    var c = hidden ? "#7C8399" : rank.color;
    var g = hidden ? "#AAB1C6" : rank.glow;
    var uid = "r" + Math.random().toString(36).slice(2,8);
    var numeral = hidden ? "?" : (rank.apex ? "" : rank.roman);
    var star = rank.apex && !hidden;
    return [
      '<svg viewBox="0 0 100 100" role="img" aria-label="', esc(hidden ? "Unranked" : rank.label), '">',
      '<defs>',
        '<linearGradient id="', uid, 'a" x1="0" y1="0" x2="0" y2="1">',
          '<stop offset="0" stop-color="', g, '"/><stop offset="1" stop-color="', c, '"/></linearGradient>',
        '<linearGradient id="', uid, 'b" x1="0" y1="0" x2="1" y2="1">',
          '<stop offset="0" stop-color="', c, '" stop-opacity=".95"/>',
          '<stop offset="1" stop-color="#0B0E1A" stop-opacity=".85"/></linearGradient>',
      '</defs>',
      '<path d="M50 6 L86 22 V52 C86 72 70 86 50 94 C30 86 14 72 14 52 V22 Z" fill="url(#', uid, 'b)"/>',
      '<path d="M50 6 L86 22 V52 C86 72 70 86 50 94 C30 86 14 72 14 52 V22 Z" fill="none" ',
        'stroke="url(#', uid, 'a)" stroke-width="4" stroke-linejoin="round"/>',
      '<path d="M50 15 L78 27 V51 C78 66 66 78 50 85 V15 Z" fill="', c, '" opacity=".22"/>',
      star
        ? '<path d="M50 30 L57 45 L73 47 L61 58 L64 74 L50 66 L36 74 L39 58 L27 47 L43 45 Z" fill="' + g + '"/>'
        : ('<text x="50" y="62" text-anchor="middle" font-size="30" font-weight="700" ' +
           'font-family="ui-serif,Georgia,serif" fill="' + g + '">' + esc(numeral) + '</text>'),
      '</svg>'
    ].join("");
  }

  function fmtDate(day){
    var p = String(day).split("-");
    var d = new Date(+p[0], +p[1]-1, +p[2]);
    var t = new Date(); t.setHours(0,0,0,0);
    var diff = Math.round((d - t) / 86400000);
    if (diff === 0) return "today";
    if (diff === -1) return "yesterday";
    return d.toLocaleDateString(undefined, { month:"short", day:"numeric" });
  }

  function signed(n){ return (n > 0 ? "+" : "") + n; }

  function badgeEnabled(){
    var s = S();
    return !(s && s.settings && s.settings.showRankBadge === false);
  }

  function renderBadgeChip(){
    var host = document.getElementById("fh-rank-badge");
    if (!host) return;
    /* Switched off in Settings: the chip leaves the profile entirely rather
       than sitting there greyed out. Standing itself keeps running - the rank
       is still tracked, still on its own tab, still reviewed on schedule. What
       is turned off is having it look at you while you work. */
    if (!badgeEnabled()){
      host.innerHTML = "";
      host.hidden = true;
      host.style.display = "none";
      return;
    }
    host.hidden = false;
    host.style.display = "";
    var sum = summary();
    var st = sum.standing;
    /* The chip shows the PUBLISHED rank, not the live one. That is the whole
       point of a review: what is on your profile holds still between them. */
    var pub = (st && st.ok) ? st : null;
    var hidden = sum.inPlacement || (pub && pub.provisional);
    var shown = pub ? pub.rank : sum.rank;
    var shownRp = pub ? pub.rp : sum.rp;
    host.innerHTML = badgeSvg(shown, hidden) +
      '<span class="lbl">' + esc(hidden ? "Placements" : shown.label) + '</span>' +
      '<span class="rp">' + (hidden ? (sum.placementLeft + " left") : (shownRp + " RP")) + '</span>';
    host.title = hidden
      ? "Standing — " + sum.placementLeft + " placement day" + (sum.placementLeft === 1 ? "" : "s") + " to go"
      : "Standing — " + shown.label + " · " + shownRp + " RP" +
        (pub ? "  (next review in " + pub.review.daysUntilNext + "d)" : "");
    if (!host.dataset.bound){
      host.dataset.bound = "1";
      host.addEventListener("click", function(){
        var btn = document.querySelector(".tabs button[data-tab='standing']");
        if (btn) btn.click();
        var panel = document.getElementById("fh-rank-panel");
        if (panel && panel.scrollIntoView) panel.scrollIntoView({ behavior:"smooth", block:"center" });
      });
    }
  }

  function render(){
    ensureCss();
    renderBadgeChip();
    var host = document.getElementById("fh-rank-panel");
    if (!host) return;

    var sum = summary();
    var hidden = sum.inPlacement;
    var rank = sum.rank;
    var html = [];

    /* --- hero --- */
    html.push('<div class="fhr-hero">');
    html.push('<div class="fhr-badge">', badgeSvg(rank, hidden), '</div>');
    html.push('<div class="fhr-meta">');
    html.push('<div class="fhr-rank" style="color:', hidden ? "#c7cde0" : rank.glow, '">',
              esc(hidden ? "Unranked" : rank.label), '</div>');
    html.push('<div class="fhr-rp">', sum.rp, ' RP',
              hidden ? '' : (rank.apex ? '' : ' · ' + rank.floor + '–' + rank.ceil), '</div>');
    html.push('<div class="fhr-bar"><i style="width:', Math.round(rank.progress*100),
              '%;background:linear-gradient(90deg,', rank.color, ',', rank.glow, ')"></i></div>');
    html.push('<div class="fhr-next">',
      hidden
        ? esc(sum.placementLeft + " placement day" + (sum.placementLeft === 1 ? "" : "s") + " to go")
        : (rank.toNext > 0
            ? esc(rank.toNext + " RP to the next rank")
            : "Top of the ladder"),
      '</div>');
    html.push('</div></div>');

    html.push('<div class="fhr-window">Standing reflects your last ', RATING_WINDOW,
      ' days. Keep it up and it holds; stop and it falls back on its own.</div>');

    /* --- the review --- */
    var st = sum.standing;
    if (st && st.ok){
      var rv = st.review;
      html.push('<div class="fhr-sec"><h4>Rank review</h4>');
      if (st.provisional){
        html.push('<div class="fhr-note"><b>Not ranked yet.</b> Your rank is published every ',
          rv.every, ' days rather than jumping around every session. The first review lands in ',
          '<b>', rv.daysUntilNext, ' day', (rv.daysUntilNext === 1 ? '' : 's'),
          '</b>. Until then the number above is provisional — it is what you are on course for, ',
          'not a rank you hold.</div>');
      } else {
        var dirWord = rv.direction === "up" ? "went up" :
                      (rv.direction === "down" ? "came down" : "held");
        html.push('<div class="fhr-review">');
        html.push('<div class="fhr-reviewline">Last review <b>', esc(fmtDate(rv.lastDay)),
                  '</b> — your rank ', dirWord,
                  (rv.delta ? ' <b class="' + (rv.delta > 0 ? "up" : "down") + '">' +
                              signed(rv.delta) + ' RP</b>' : ''), '.</div>');
        if (rv.report){
          html.push('<div class="fhr-reviewwhat">It looked at <b>',
            Math.round(rv.report.minutes / 60), 'h</b> of focus across <b>',
            rv.report.activeDays, '</b> day', (rv.report.activeDays === 1 ? '' : 's'),
            rv.report.questsKept   ? ', ' + rv.report.questsKept + ' deadline' + (rv.report.questsKept === 1 ? '' : 's') + ' kept' : '',
            rv.report.questsMissed ? ', ' + rv.report.questsMissed + ' missed' : '',
            rv.report.challenges   ? ', ' + rv.report.challenges + ' challenge' + (rv.report.challenges === 1 ? '' : 's') + ' cleared' : '',
            rv.report.hardcoreDays ? ', ' + rv.report.hardcoreDays + ' Hardcore milestone' + (rv.report.hardcoreDays === 1 ? '' : 's') : '',
            rv.report.hardcoreDailyDays ? ', ' + rv.report.hardcoreDailyDays + ' completed Hardcore day' + (rv.report.hardcoreDailyDays === 1 ? '' : 's') : '',
            '.</div>');
        }
        html.push('<div class="fhr-reviewnext">Next review in <b>', rv.daysUntilNext, ' day',
          (rv.daysUntilNext === 1 ? '' : 's'), '</b>. So far this period: <b>',
          Math.round(rv.current.minutes / 60), 'h</b> across <b>', rv.current.activeDays,
          '</b> day', (rv.current.activeDays === 1 ? '' : 's'), '.</div>');
        if (st.trend){
          html.push('<div class="fhr-reviewtrend">On current form you are tracking <b class="',
            (st.trend > 0 ? "up" : "down"), '">', signed(st.trend), ' RP</b> — ',
            esc(st.live.rank.label), ' if the review were held today.</div>');
        }
        html.push('</div>');
      }
      html.push('<div class="fhr-note" style="margin-top:8px">Your rank is published on a ',
        rv.every, '-day cycle so it means "where you stand", not "what you did in the last hour". ',
        'The live number keeps moving underneath and you can always see it here — only the ',
        'published rank waits for review day.</div>');
      html.push('</div>');
    }

    if (hidden){
      html.push('<div class="fhr-note"><b>Placement.</b> Your first ', PLACEMENT_DAYS,
        ' <em>active</em> days count double on the way up and half on the way down, ',
        'so you land near your real rank in a week instead of grinding up for a month. ',
        'A day only counts as active if you actually did something — logged focus, ',
        'settled a deadline, cleared a challenge. Days away do not use them up, ',
        'so the head start is still there whenever you start. Your rank name appears once ',
        'the ', PLACEMENT_DAYS, ' are done.</div>');
    }

    /* --- recent movement --- */
    var days = recent(14);
    html.push('<div class="fhr-sec"><h4>Recent movement</h4>');
    if (!days.length){
      html.push('<div class="fhr-empty">Standing starts today at ', START_RP, ' RP, from zero — ',
                'nothing you did before now counts, in either direction. ',
                'Log some focus, put a deadline on a quest, or start a Hardcore run, ',
                'and the first day settles tomorrow.</div>');
    } else {
      days.forEach(function(d){
        var cls = d.net > 0 ? "up" : (d.net < 0 ? "down" : "flat");
        html.push('<div class="fhr-day"><div class="fhr-dayhead">');
        html.push('<span class="fhr-date">', esc(fmtDate(d.day)), '</span>');
        html.push('<span class="fhr-net ', cls, '">', signed(d.net), ' RP</span>');
        if (d.placement) html.push('<span class="fhr-chip" style="opacity:.6">placement</span>');
        html.push('<span class="fhr-after">', d.after, '</span>');
        html.push('</div><div class="fhr-reasons">');
        d.events.slice().sort(function(a,b){ return b.delta - a.delta; }).forEach(function(e){
          var dead = e.counted === false;
          html.push('<div class="fhr-reason ', dead ? "off" : (e.delta >= 0 ? "up" : "down"), '">',
                    '<b>', dead ? "—" : signed(e.delta), '</b><span>', esc(e.label || e.kind),
                    dead ? ' <i style="opacity:.6">(past the daily limit)</i>' : '', '</span></div>');
        });
        html.push('</div>');
        if (d.limited){
          html.push('<div class="fhr-cap">Daily limits apply. Concurrent Hardcore misses share the largest new-policy loss for this date.</div>');
        }
        if (d.capped){
          html.push('<div class="fhr-cap">Capped — a single day can move you at most +',
                    DAILY_GAIN_CAP, ' or −', DAILY_LOSS_CAP, ' RP.</div>');
        }
        html.push('</div>');
      });
    }
    html.push('</div>');

    /* --- ladder --- */
    html.push('<div class="fhr-sec"><h4>The ladder</h4><div class="fhr-ladder">');
    ladder().slice().reverse().forEach(function(row){
      var here = sum.rp >= row.floor && sum.rp <= row.ceil;
      html.push('<div class="fhr-rung', here && !hidden ? ' here' : '', '">',
        '<span class="fhr-dot" style="background:', row.color, '"></span>',
        '<span>', esc(row.label), '</span>',
        '<span class="fhr-rungrp">', row.floor, row.apex ? '+' : ('–' + row.ceil), '</span>',
        '</div>');
    });
    html.push('</div></div>');

    /* --- rules --- */
    html.push('<div class="fhr-sec"><h4>What moves your Standing</h4><ul class="fhr-rules">');
    [
      ['Kept a deadline', RP.questHit, 'a quest you gave a due date, finished on or before that day'],
      ['Missed a deadline', RP.questMiss, 'the due day ended and it was not done — charged once, never again'],
      ['Finished it late', RP.questLate, 'partial recovery on a deadline you missed but still completed'],
      ['A day of real focus', RP.activeDay, 'for one hour, rising with the hours you actually do \u2014 about +28 at four hours, +42 at eight. No ceiling; longer days simply pay less per extra hour'],
      ['Daily challenge cleared', RP.dailyHit, 'per challenge, settled the day after'],
      ['Weekly challenge cleared', RP.weeklyHit, 'per challenge, settled when the week closes'],
      ['Seasonal challenge cleared', RP.seasonHit, 'settled when the month closes'],
      ['A day with nothing on it', RP.idleDay, 'skipped if you were active on ' + REST_MIN_ACTIVE + ' of the previous ' + REST_WINDOW + ' days']
    ].forEach(function(row){
      html.push('<li><b>', signed(row[1]), '</b> — ', esc(row[0]),
                row[2] ? ' <span style="opacity:.6">(' + esc(row[2]) + ')</span>' : '', '</li>');
    });
    html.push('<li><b>+12 to +70</b> — a completed Hardcore day. ',
      '20 × the square root of required hours, with the weight limited to 0.6–3.5; ',
      'sessions count as 45 minutes. A 4-hour bar pays +40 and an 8-hour bar +57 before taper. ',
      'Only the strongest completed bar counts each date; a stronger bar reached later adds only the difference. ',
      'Credit waits until that day’s window closes. Ongoing runs start this daily credit on the next active day after the update.</li>');
    html.push('<li><b>−24 to −50</b> — new Hardcore misses cost the smaller of 50 RP or twice that run’s daily award. ',
      'Only the largest new Hardcore loss counts each date, even with several runs. ',
      'Ending a run on purpose costs nothing. Recorded past rewards and penalties keep their original amounts; ',
      'reviving a run withdraws its exact failure episode. Update every device: a legacy charge from an older app keeps its original cost, counted once.</li>');
    html.push('<li><b>+', HARDCORE_EARLY.map(function(m){ return m.rp; }).join(' / +'),
              '</b> — Hardcore milestones at ',
              HARDCORE_EARLY.map(function(m){ return m.days; }).join(', '),
              ' days, then <b>+', HARDCORE_RECURRING_RP, '</b> every ',
              HARDCORE_RECURRING_EVERY, ' days a run stays alive ',
              '<span style="opacity:.6">(exempt from the daily cap — the only route to the apex ranks)</span></li>');
    html.push('<li><b>\u00d7', hardcoreWeight({type:"minutes",value:120}), ' / \u00d7',
              hardcoreWeight({type:"minutes",value:240}), ' / \u00d7',
              hardcoreWeight({type:"minutes",value:480}),
              '</b> — Hardcore milestones scale with the bar you locked ',
              '<span style="opacity:.6">(2h / 4h / 8h a day, against a 1-hour baseline. ',
              'Daily rewards follow the normal rank taper down to 25%; milestone rewards taper no lower than 35%)</span></li>');
    html.push('</ul>');
    html.push('<div class="fhr-rules" style="margin-top:9px">',
      '<b>Challenges only ever pay.</b> Letting a daily or weekly challenge lapse costs you ',
      'nothing — the game rolled it at you, you did not agree to it. The only things that ',
      'take rank away are a deadline you set yourself, a Hardcore run whose own locked bar ',
      'you missed, and days with nothing on them at all.</div>');
    html.push('<div class="fhr-rules" style="margin-top:9px">',
      '<b>Limits.</b> At most ', PER_DAY_KIND_LIMIT.quest_hit,
      ' kept deadlines count in a day, and a quest has to have existed for ',
      Math.round(MIN_COMMITMENT_MS / 3600000), ' hours before finishing it counts as keeping one. ',
      'A day can move you at most +', DAILY_GAIN_CAP, ' or −', DAILY_LOSS_CAP,
      ' RP. Hardcore milestones ignore the upward cap.</div>');
    html.push('<div class="fhr-rules" style="margin-top:9px">',
      '<b>Rescheduling is free.</b> Moving a due date before it lapses is a decision about ',
      'your plan, not a missed deadline, and costs nothing. Even once the day ends you have ',
      'until midday to finish it or move it \u2014 nothing is charged at midnight while you sleep. ',
      'What you cannot do is move a deadline you already blew: that one is on the books.</div>');
    html.push('<div class="fhr-rules" style="margin-top:10px;opacity:.62">',
      'Only challenges whose progress can be re-checked against your own history ',
      'can move your rank — minutes, sessions and action counts. A challenge like ',
      '“maintain a 7-day streak” is a live counter with no truthful past value, so it never counts. ',
      'Standing started on ', esc(sum.installedDay || "today"),
      ' and everyone starts at ', START_RP, ' RP. Nothing before that date counts, ',
      'in either direction — not the work, not the misses. A rank is a record of ',
      'what you did while being ranked, so this one is entirely yours to earn.',
      '</div>');
    html.push('</div>');

    host.innerHTML = html.join("");

    /* Put the rung you are standing on in view rather than making you scroll
       a 26-row ladder to find yourself. */
    try {
      var here = host.querySelector(".fhr-rung.here");
      if (here && here.parentNode){
        var box = here.parentNode;
        box.scrollTop = Math.max(0, here.offsetTop - box.clientHeight / 2 + here.offsetHeight / 2);
      }
    } catch(_){}
  }

  /* -------------------------------------------------------------- lifecycle */

  var boundaryTimer = null;
  function scheduleBoundary(){
    if (boundaryTimer) clearTimeout(boundaryTimer);
    var next = new Date();
    next.setHours(24, 0, 30, 0);      /* just after local midnight */
    var wait = Math.max(30000, Math.min(next.getTime() - Date.now(), 6 * 3600 * 1000));
    boundaryTimer = setTimeout(function(){
      refresh("day-boundary");
      scheduleBoundary();
    }, wait);
  }

  /* Finishing a quest can move Standing the same day, so the badge should not
     wait for a reload to say so. Debounced, because the app re-renders a lot
     and re-deriving on every keystroke would be wasteful for no gain. */
  var nudgeTimer = null;
  function nudge(reason){
    if (nudgeTimer) clearTimeout(nudgeTimer);
    nudgeTimer = setTimeout(function(){ nudgeTimer = null; refresh(reason); }, 900);
  }
  function wrapForNudge(name, reason){
    var original = window[name];
    if (typeof original !== "function" || original.__fhRank) return;
    var wrapped = function(){
      var out = original.apply(this, arguments);
      try { nudge(reason); } catch(_){}
      return out;
    };
    wrapped.__fhRank = true;
    try { window[name] = wrapped; } catch(_){}
  }

  function boot(){
    if (!S()) { setTimeout(boot, 400); return; }
    ensureCss();
    ["toggleQuest", "removeQuest", "setQuestDue"].forEach(function(name){
      wrapForNudge(name, name);
    });
    refresh("boot");
    try { render(); } catch(_){}
    scheduleBoundary();
    document.addEventListener("visibilitychange", function(){
      if (!document.hidden) refresh("visible");
    });
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", function(){ setTimeout(boot, 700); });
  } else {
    setTimeout(boot, 700);
  }

})();

/* asset content-type refresh — v10.32.0 */
