# Session notes

- Standing rule (added 2026-09-18): whenever the user logs a workout
  containing an exercise not yet in `data.js`'s `EXERCISE_LIBRARY`, add it to
  the catalog (with a sensible muscle-credit assignment, researched/reasoned
  through rather than guessed blindly) as part of that same logging step —
  don't let a new exercise go in as a one-off without joining the rotation.
  Note the mechanics: `EXERCISE_LIBRARY` (muscle credits, feeds push/pull and
  section-fatigue math) can be added immediately regardless of history, but
  `SNAPSHOT` (the latest-vs-best rows that power the Training tab's exercise
  search and `recommendSession()`'s suggestions) requires real logged data —
  an exercise only appears there, and only becomes suggestable/searchable,
  the first time it's actually performed and its numbers reported. Don't
  fabricate a placeholder SNAPSHOT best for an exercise that hasn't been
  done — say so plainly (catalog-ready, appears in rotation once logged)
  rather than inventing one. Applied immediately: added "Lat Pulldown (Wide
  Grip)" — `{ back: 1.0, biceps: 0.2 }` — distinct from the existing "Lat
  Pulldown (Triangle)" (`{ back: 1.0, biceps: 0.4 }`): the wider overhand grip
  biases the movement toward the lats and reduces elbow-flexion leverage, so
  it recruits less biceps than the close-neutral-grip Triangle attachment.
  Not yet logged as of adding it — will get its own SNAPSHOT row/history the
  first time it's actually performed.

- Supplement-compliance "Multivitamin" row fixed + Essential-5 added as its
  own row (2026-09-18, per explicit user direction: "for now, essential 5 +
  mayven replace the expensive multivitamin"): the compliance check's
  "Multivitamin" row (`EXPECTED_SUPPLEMENTS`/`expected_supplements_for` in
  generate_dashboard.py) matched on the substring "multivit" — which only
  ever matched Thorne Basic Nutrients 2/Day's literal product name. Every
  Mayven-era day logged the item as the compound name "Multivitamin (Mayven
  Full Volume Gummies)" (still contains "multivit", so it kept matching by
  coincidence) — until 2026-09-17, logged as plain "Mayven Full Volume
  Gummies" (no "multivit" substring), which is what surfaced the bug: the
  row would have silently shown "not logged today" despite Mayven being
  taken. Separately, Essential-5 (Advance Physician Formulas Vitamin
  C+D3+E+Zinc+Selenium, active since 2026-08-26) had never had its own
  compliance row at all. Fixed both: `expected_supplements_for(date)` now
  switches the Multivitamin row's match to "mayven" from
  `MAYVEN_SWAP_DATE = "2026-08-06"` onward (still matches "multivit" before
  that, for Thorne-era days), and adds a separate "Essential-5
  (C+D+E+Zinc+Selenium)" row (matching "advance physician formulas") from
  `ESSENTIAL5_START_DATE = "2026-08-26"` onward. Backfilled retroactively via
  `python3 export_site_data.py --all` so `docs/data/*.json`/`index.json` and
  the site's Supplement compliance trend reflect both products correctly
  across their whole active history — this also means historical compliance
  % from 08-26 onward shifted slightly since Essential-5 now correctly counts
  toward the denominator. Going forward, log Mayven under either name
  ("Mayven Full Volume Gummies" or the older compound form) — both match —
  and log Essential-5 under a name containing "Advance Physician Formulas"
  (as already done) so both compliance rows keep matching correctly.

- Energy score fixes + ACWR overhaul (2026-09-15, per explicit user request —
  ACWR change was confirmed via AskUserQuestion, user chose "both: persist
  history AND switch to EWMA"):
  1. **Stale "last workout Nd ago" bug (fixed)**: `intake/data/metrics/
     workouts.json` has two independent parts — `report_snapshot` (auto-
     overwritten by `sync_training_snapshot.mjs`) and `entries` (a SEPARATE
     manually-maintained mirror of data.js's WORKOUTS, which is what
     `compute_energy_score()`'s movement factor actually reads). Logging a
     workout only updates `report_snapshot` via the sync script — `entries`
     must ALSO be manually appended every time, or the energy score's
     movement factor goes stale even though a workout was logged. Watch for
     this every time a workout is logged, not just when a bug surfaces.
  2. **Nutrition penalty on untracked days (fixed)**: `compute_energy_score()`
     in `generate_dashboard.py` now drops the nutrition factor entirely (and
     renormalizes the remaining weights) whenever `todays_intake.
     exclude_from_monthly_macros` is true, instead of scoring near-zero
     consumed-vs-target as if it were a bad-nutrition day. This re-checks the
     flag fresh per day, so it automatically stops applying the moment a
     day's flag is absent (e.g. from 2026-09-18 once macro break #2 ends) —
     no manual toggle needed. Backfilled retroactively for all 15 historical
     days that carry the flag (07-17, 07-24, 07-25, 07-29, 08-01, 08-21,
     08-22, 08-28, 08-30, 09-04, 09-06, 09-07, 09-08, 09-15, plus 09-16 once
     it becomes a real day) via `generate_dashboard.py <date> --unified` +
     `export_site_data.py --all`.
  3. **ACWR switched from box-window to EWMA (fixed, after consultation)**:
     the "rest day, load-ratio score didn't change" report was real —
     `engine.js`'s old ACWR was a 7-day/28-day box-sum ratio, a step function
     that only changes value when a workout's timestamp crosses one of those
     two window edges. On a quiet rest day where nothing crosses an edge, the
     ratio is bit-for-bit frozen. `loadTrends()`/`ewmaAcwrAt()` now use a
     coupled EWMA of daily training stress instead (Williams et al. 2016 /
     Murray et al. 2017's "EWMA-ACWR" method: lambda = 2/(N+1) applied once
     per calendar day, N=7 for acute and N=28 for chronic, 0 stress on rest
     days) — this drifts a little every day even without a session, since
     the short span decays faster than the long one on a rest stretch. Kept
     the same 0.8/1.3/1.5 injury-risk zone bands — the literature uses the
     same bands for both ACWR methods. Verified against the actual
     complained-about days: 2026-09-13 → 09-14 (both rest days) now reads
     1.05 → 0.85 instead of frozen, and the 09-05 through 09-09 layoff shows
     a smooth decline (0.80 → 0.64 → 0.52 → 0.42 → 0.34 → 0.27) instead of a
     flat number between window-edge crossings.
  4. **Training-load history now persisted per day (added)**: separately,
     `export_training_state.mjs`'s `now` was always live `Date.now()` — it
     never actually meant "as of this date," so regenerating a past day's
     report (e.g. during a backfill) silently showed today's live training
     state mislabeled as that day's. `export_training_state.mjs` now accepts
     an optional `YYYY-MM-DD` arg to pin `now` to that day's end-of-day, and
     `generate_dashboard.py`'s `persist_training_load()` saves each day's
     ACWR/acute/chronic/zone snapshot into `data/metrics/training_load.json`
     (same idempotent update-by-date pattern as `sperm.json`/`energy.json`),
     called automatically every time `generate_dashboard.py <date> --unified`
     runs. Backfilled for all 80 real historical days via a one-off script.
     `export_site_data.py` exposes it as `training_load` on every day's
     bundle (matched by date, same pattern as `sperm_trend`) and `acwr` in
     `index.json`'s per-day rollup — unlike `training_trends`/`training`
     (fatigue, recommendation, PRs — genuinely "right now" data, stays
     is_latest-only by design), this is now available for ANY day, so
     `docs/app.js`'s Training tab shows a real per-day ACWR chip + a full-
     history EWMA-smoothed trend chart (`chAcwrHist`) regardless of which day
     is being viewed, per the 2026-09-14 standing rule against letting a
     panel with a real data source go missing due to unrelated gating.
  **Known caveat, not yet addressed**: `ewmaAcwrAt()`'s stress-normalization
  reference (`ref`, from `referenceLoads()`/SNAPSHOT) reflects the CURRENT
  overall best-per-exercise, not what the bests were as of the historical
  date being computed — SNAPSHOT is a single "latest state" object, not
  versioned by date. This was already true of the old box-window ACWR too
  (not a regression), and reference loads move slowly enough that it's a
  reasonable approximation, but it means backfilled historical ACWR values
  aren't perfectly period-accurate the way the *day-boundary* fix is. Flagged
  here rather than silently accepted; revisit if it ever matters enough to
  version SNAPSHOT by date.

- Macro tracking break #2 (2026-09-15 through 2026-09-17, inclusive; resume
  Friday 2026-09-18): user explicitly asked to skip exact food macro/micro
  logging for this window — a new, separate break from the one cancelled on
  2026-09-13 (that one covered 09-06 through 09-17; this is a fresh request
  covering only 09-15 through 09-17, three days, while traveling for the
  hotel-gym stint). Only log supplements/medication (with their usual
  zero-kcal item entries), caffeine, workouts (data.js/workouts.json as
  normal), sleep, weigh-ins, and lifestyle events (alcohol, ejaculation,
  retainers, etc.) as usual — do NOT create detailed `items` food entries
  or estimate macros/micros for meals during this window. Mark each
  affected day file `exclude_from_monthly_macros: true` with an
  `exclude_reason` noting this break, same pattern as prior lighter-logging
  windows. Resume full detailed food logging on 2026-09-18 without being
  asked.
- Standing rule (added 2026-09-14, after the planned-workout regression):
  when rebuilding or restyling any part of the site (`docs/`), never let a
  data set/panel/feature go missing just because it's *empty* or *not
  logged* for the day being viewed. Every panel that has a real, current
  data source (a field on the intake JSON, a metrics file, a computed
  value) must keep rendering — with an explicit empty-state message if
  there's genuinely nothing to show — never a silent `return` that skips
  the panel entirely based on an unrelated gate (e.g. `isLatest`). This is
  exactly what caused the 2026-09-14 bug: `renderTrainingDetail()` in
  `docs/app.js` gated on `isLatest` and used that same gate to also skip
  `day.planned_workout`, so a manually-adjusted plan set for a *future*
  day (not yet "latest") silently failed to render even though the data
  existed — until a live browser check against a real future date caught
  it. When restyling/rewriting a page, explicitly re-check every existing
  data-bound panel still has a code path to render, independent of
  whatever new top-level view/tab/day gating the redesign introduces.
- Dashboard redesign implementation (started 2026-09-13, concept approved in
  `docs/design/` — see that folder's BRIEF.md for the full design history):
  replacing the old tab-based `docs/index.html`/`docs/app.js`/`docs/style.css`
  with the bento-grid "soft sky" (light) design proven out in
  `docs/design/mockup-final.html`. A snapshot of the pre-redesign site is
  archived at `docs/_archive/pre-redesign-2026-09-13/` in case anything needs
  reverting or cross-checking (a git tag would normally serve this purpose
  too, but this session's git credentials can't push tags — 403 on every
  retry — so the in-repo copy is the durable fallback). Three tracking
  additions are part of this same pass:
  1. **90-day trailing sperm-score trend** (implemented 2026-09-13): added
     `compute_trailing_trend()` in `generate_dashboard.py` alongside the
     existing weekly `compute_current_week()` — both now share a generic
     `compute_window_factors(..., window_days=N)`. Spermatogenesis +
     epididymal transit takes ~64-90 days, so the original 7-day score
     reflects "this week's habits," not sperm quality itself; the 90-day
     window is the biologically-relevant complement, not a replacement —
     keep showing both. Persisted in a new `trend` list in
     `data/metrics/sperm.json` (parallel to `weeks`), exposed as
     `sperm_trend` on both the per-day `docs/data/<date>.json` bundle and
     the `docs/data/index.json` rollup, matched the same way as
     `sperm_score` (by `week_end` == the target date). Backfilled for all
     65 already-unlocked historical days via a one-off script — going
     forward it's computed/persisted automatically every time
     `generate_dashboard.py <date> --unified` runs (still run at EOD even
     though the email is retired, see below — that's what keeps this and
     the weekly score's history growing).
  2. **Alcohol-free streak**: computed client-side in the new `app.js` from
     `index.json`'s existing per-day `alcohol_event` boolean (no backend
     change needed) — walk backward from the latest day until hitting a
     `true`. Surfaced as a tile in the redesign.
  3. **Steps tracking** (added 2026-09-13): a new optional `steps` field on
     the day intake JSON (`{"steps": 8432}` at the top level, alongside
     `caffeine_shots`), threaded through `export_site_data.py` to both the
     per-day bundle and the `index.json` rollup. No automatic Samsung
     Health pull is possible from this environment (no OAuth/device
     integration point exists here) — instead, **at EOD, before finalizing
     the day** (before setting `in_progress: false`), check whether `steps`
     has been logged for the day; if not, ask the user for their step
     count (Samsung Health or wherever they track it) before signing the
     day off, same pattern as the existing retainers trailing-night check.
     If they don't have it handy, log the day without steps rather than
     blocking EOD — this is a reminder, not a hard requirement.
  **Email retirement**: per explicit request, the emailed unified HTML
  dashboard is being dropped from the EOD routine now that the site has
  full (and better) parity — see the "Unified dashboard delivery" entry
  below for what specifically changes in the EOD steps.

- Manually-adjusted workout plans on the site/dashboard (added 2026-09-10):
  when the user asks for an ad hoc/adjusted workout plan (e.g. scaling
  weights down after a layoff or injury/fatigue, as opposed to just
  engine.js's automatic `recommended_next`), save it to that day's intake
  file as a `planned_workout` object: `{section, note, exercises: [{name,
  last, target, reasoning}]}`. This flows through automatically: `intake/
  export_site_data.py` passes it into the exported `docs/data/<date>.json`
  bundle, `docs/app.js`'s `renderTraining()` shows it as an "Adjusted plan
  for next session" panel on the Training tab, and `intake/
  generate_dashboard.py`'s unified HTML (`build_planned_workout_panel`)
  shows the same panel in the emailed report. Do this any time an adjusted
  plan is given in chat, not just when explicitly asked to "show it on the
  site" — the site should never lag behind what's discussed. Fixed
  alongside this: `generate_dashboard.py`'s sleep panel used to divide by
  zero (`ZeroDivisionError`) whenever `sleep.json` had no entries in the
  trailing 7 days — now guarded to show "no 7-day data" instead of
  crashing. Also discovered `sleep.json`/`weight.json` had silently fallen
  behind by about a week (sleep is logged in each day's intake file but
  wasn't being mirrored into `sleep.json` — unlike `workouts.json`, which
  gets manually mirrored from `data.js` every time); backfilled the gap
  from 2026-09-04 through 2026-09-10 from each day's logged sleep. Keep
  `sleep.json` updated going forward whenever a day's sleep entry is
  logged, the same way `workouts.json` is kept in sync with `data.js`.

- Push/pull-corrective exercise selection (added 2026-08-27, standing until
  the ratio normalizes): `engine.js`'s push/pull balance metric only credits
  muscles that carry a role — chest & triceps = push, back & biceps = pull;
  shoulders, forearms, legs, core are neutral (role: null) and never move the
  ratio. Current program ratio is push 1.47× pull (`training_full.json`
  `bal.pushPull`), matching the recurring "push outpacing pull" alert.
  Whenever suggesting/planning a workout (ad hoc or via engine.js's
  `recommended_next`), apply this exercise-priority within whichever section
  is being trained, until `bal.pushPull` settles back into ~0.8-1.3×:
    - **Chest day** (100% push, no pull option exists here): fly variants
      (Incline Pec Fly, Dumbbell Pec Fly, Pec Fly Machine) are "single push"
      (chest only); press variants (Bench/Incline/Decline Press, DB Bench,
      Chest Press Machine, Narrow Push-Ups) are "double push" (chest+
      triceps). Favor flys over presses while correcting — don't cut chest
      volume/frequency itself.
    - **Back day**: strongest correctors are Diverging Seated Row, Low Row,
      Lat Pulldown (Triangle), Reverse Incline DB Row — all double-pull
      (back+biceps). Dumbbell Pullover is net-pull-positive but weaker
      (dilutes with a chest/push secondary). Dead Hang gives ~zero ratio
      benefit (forearms-dominant, do it for grip/hang strength only).
      Prioritize the 4 rows over Pullover/Dead Hang when correcting.
    - **Shoulders day**: shoulders itself is neutral. Rear Delt Machine and
      Shoulder Shrugs both credit back (pull) as a secondary — correctors.
      Dumbbell Shoulder Press and Converging Shoulder Press both credit
      triceps (push) as a secondary — worsen it. Lateral Raises, Seated
      Lateral Raises, Front Raises, Farmer's Hold are neutral (shoulders/
      forearms only). Favor Rear Delt + Shrugs, go light on/skip the presses.
    - **Arms day**: pure biceps work (Incline Hammer Curl, Incline DB Curl,
      Hammer Curl, Preacher Curl, Biceps Curl Machine, Half Curl) is
      pull-only; pure triceps work is push-only. Seated Dips is the single
      biggest push-offender (double credit: triceps+chest) — first to trim/
      skip. Forearm Twists is neutral. Favor curls over extensions.
    - **Legs / Core / Cardio**: no muscle in these sections carries a push/
      pull role — program purely on their own merits (quad/ham balance,
      aerobic base), unrelated to this correction.
  Once `bal.pushPull` is back in the healthy 0.8-1.3× range, exercise
  selection can return to normal/preference-driven rather than corrective.

- New supplement rotation candidate — Advance Physician Formulas Vitamin
  C+D3+E+Zinc+Selenium (added 2026-08-25, label photographed, not yet
  started as of that date): per-2-capsule-serving provides 1000mg vitamin
  C, 2000IU vitamin D3, 134mg vitamin E, 20mg zinc (as citrate), 100mcg
  selenium (as L-selenomethionine) — saved to
  intake/references/supplements.json. This is a near-perfect fit for the
  gap the 2026-08-06 Mayven gummies swap left open: Mayven provides zero
  selenium/vitamin C/D/E, and this new capsule covers all four (plus more
  zinc). Recommend timing: post-breakfast alongside the Mayven gummies.
  **Zinc-stacking flag**: if the user continues taking the standalone
  Thorne Zinc Picolinate 15mg on top of this new supplement's 20mg + the
  Mayven gummies' 2.8mg, that's 37.8mg/day zinc — close to the 40mg adult
  UL. Suggest the user drop the standalone Thorne Zinc Picolinate once
  this new supplement is in regular rotation (22.8mg/day from
  Mayven+this alone is already well above the 11mg target with headroom
  to spare). **Selenium note**: 100mcg/day from this supplement alone,
  before any dietary selenium (e.g. Brazil nuts, ~95mcg each) — the daily
  target is 55mcg and the UL is 400mcg, so a Brazil nut on a day this is
  taken pushes to ~195mcg, still well under the UL, but flag if the user
  starts stacking multiple Brazil nuts on top of a taken dose. Log intake
  as a normal supplement item once the user confirms they've started
  taking it (not yet logged as of 2026-08-25 — added to the reference
  stack only).
  **UPDATE 2026-08-26**: user started taking this supplement (first dose
  11:18, day 60) and, per the zinc-stacking flag above, confirmed they
  will skip the standalone Thorne Zinc Picolinate 15mg going forward.
  Thorne Zinc Picolinate is now marked discontinued in
  intake/references/supplements.json — don't log it as taken unless the
  user explicitly says they took it again.
  **UPDATE 2026-08-30**: removed zinc from the supplement-compliance check
  itself (`EXPECTED_SUPPLEMENTS`/`expected_supplements_for()` in
  generate_dashboard.py, reused by export_site_data.py) as a standing rule
  — Mayven (2.8mg) + essential-5 (20mg) already give 22.8mg/day, well past
  the 11mg target, so a dedicated zinc dose is no longer part of the
  routine. The check is date-gated on `ZINC_DISCONTINUED_DATE =
  "2026-08-26"`: days from 08-26 onward drop the Zinc row entirely (it was
  never a real gap, just noise); days before that date still show it, since
  Thorne Zinc genuinely was the routine then. Backfilled retroactively via
  `python3 export_site_data.py --all` so `docs/data/*.json`/`index.json`
  and the site's Supplement compliance trend reflect this from 08-26
  onward. The trend chart itself (`docs/app.js`, Supplements & Lifestyle
  tab) was also switched from raw taken/expected-count lines to a single
  compliance-% line (0-100%, target line at 100%) per explicit request.

- Travel/lighter-logging mode (2026-08-21 through Saturday 2026-08-22,
  inclusive — user is away/traveling): user explicitly asked to skip exact
  food macro/micro logging for this window. Only log supplements (with their
  usual zero-kcal item entries) and workouts (data.js/workouts.json as
  normal) during this period — do NOT create detailed `items` food entries
  or estimate macros/micros for meals. Sleep/weigh-ins/lifestyle events still
  get logged as usual (unaffected by this — only food macro/micro detail is
  paused). Sunday 2026-08-23 is already back to normal, full detailed food
  logging — user confirmed Sunday will already be logged as usual, so resume
  from Sunday onward without being asked (not Monday).

- Macro tracking break (2026-09-06 from this point onward, through
  2026-09-17, inclusive; resume 2026-09-18): user explicitly asked to skip
  exact food macro/micro logging for this window. Only log supplements/
  medication (with their usual zero-kcal item entries), caffeine, workouts
  (data.js/workouts.json as normal), sleep, weigh-ins, and lifestyle events
  (alcohol, ejaculation, retainers, etc.) as usual — do NOT create detailed
  `items` food entries or estimate macros/micros for meals during this
  window. Mark each affected day file `exclude_from_monthly_macros: true`
  with an `exclude_reason` noting this break, same pattern as prior
  lighter-logging days (e.g. 2026-08-30, 2026-08-21/22). Resume full
  detailed food logging on 2026-09-18 without being asked.
  **UPDATE 2026-09-09**: user asked to temporarily return to full itemized
  tracking for 2026-09-09, 2026-09-10, and 2026-09-11 (confirmed via
  AskUserQuestion — these 3 days get real itemized food logging, then the
  break resumes for 2026-09-12 through 2026-09-17 as originally planned,
  still resuming for good on 2026-09-18). Remove `exclude_from_monthly_macros`
  /`exclude_reason` from the 09-09/09-10/09-11 day files and itemize meals on
  those days normally; re-add the exclusion flag starting 09-12.
  **UPDATE 2026-09-12**: user asked mid-day to itemize food for 09-12 too
  (unprompted follow-through on an earlier "might attempt tracking today"
  comment) — treated as another one-off exception day, same as 09-09/09-10/
  09-11: `exclude_from_monthly_macros`/`exclude_reason` removed from the
  09-12 day file, full itemized food logging for that day.
  **UPDATE 2026-09-13 — BREAK CANCELLED**: user explicitly ended the break
  early ("I'm trying to resume regular tracking through the holiday,
  skipping the rule. Log as usual, including the rest of the so called
  break."). Full itemized food/macro/micro tracking resumes 2026-09-13 and
  continues through what would have been the rest of the break window
  (09-14 through 09-17) and beyond — this is not another one-off exception,
  it supersedes the break plan entirely. Do not re-apply
  `exclude_from_monthly_macros` on 09-13 through 09-17 going forward; the
  09-06 through 09-08 days already logged with the exclusion flag stay as
  historical record, unaffected retroactively. User also flagged that
  Monday-Thursday logging will lean
  more on images/links rather than typed descriptions — no process change
  needed on this end beyond normal photo/label handling already in place.

- Simfonia cheese spread — verified label correction (2026-08-31): a photographed
  nutrition label gave the real per-100g values (108kcal, 9.8g protein, 4.6g
  carb, 5g fat, 24mg cholesterol, 376mg sodium, 129mg calcium), replacing an
  unverified ~308kcal/100g estimate that had been reused since the first
  Simfonia entry on 2026-06-29 — that old rate over-counted fat by ~5x and
  calories by ~2.9x whenever Simfonia was logged. Saved as
  `simfonia_cheese_spread_generic` in `intake/references/foods.json`
  (`verified: true`) — use this rate for all future Simfonia entries.
  Retroactively corrected all 31 affected historical day files (recomputed
  each Simfonia item's actual grams from its old kcal figure, then reapplied
  at the verified rate; added a one-line correction note to each file's
  `assumptions`). Reran `python3 export_site_data.py --all` so
  `docs/data/*.json`/`index.json` reflect the corrected macros across the
  full history.

- Recipe analyzer (started 2026-08-04): when the user drops a recipe — a link,
  an Instagram Reel / Facebook video caption or screenshot, an online recipe, or
  a family recipe — analyze it into `intake/recipes/<id>.json` (schema:
  `intake/recipes/SCHEMA.md`). Score every recipe through BOTH lenses in
  `intake/references/nutrition_lenses.json`: **him** (weight loss / muscle
  retention / sperm optimization, same targets as profile.json) and
  **her_preconception** (prenatal nutrients + ADVISORY pregnancy food-safety
  flags — trying within ~6 months, not yet, so flag+swap, don't hard-exclude).
  Her real calorie/macro tracking lives in a SEPARATE project ("lihitrack"), so
  the `her_preconception` block is written self-contained to be copy-pasted into
  her session — the user does that copy, not us. Render with
  `python3 intake/generate_recipe_card.py` → `intake/recipes/library.html`.
  IG Reels / FB videos are usually bot-blocked (403) — try to fetch, but expect
  to work from a pasted caption/screenshot. Proactively suggest recipe
  modifications and which recipes to adopt into the daily rotation (per the
  standing permission to make intake-based suggestions).
  **Notify the daily-tracking session (standing rule, added 2026-09-02):**
  whenever a recipe is ADDED or UPDATED and merged to trunk, push a note to the
  daily-tracking session ("Exercise & Lifestyle Tracking",
  session_01VMFqiW7kqpzCsd8qLjr4KR) by firing trigger
  trig_01RVx35MLg4aStEyXbjwxbGW (`fire_trigger`), passing `text` = the recipe
  name, meal_type, key per-unit macros, adopted state, and the new library
  count. The trigger's base prompt already tells that session to pull trunk and
  where the recipes live. This is how the main session references new recipes
  "for easy reference." (Do this every recipe add, right after the trunk merge
  + artifact republish.)

- If an upcoming action risks hitting a platform/tool limit (e.g. request size
  caps like the ~32MB upload limit, rate limits, context limits), flag it to
  the user *before* it causes a failure — don't let them discover it via an
  opaque error after the fact. If a limit is already close, say so and suggest
  a workaround (e.g. send fewer/smaller images per message) up front.
- Upload size: the platform's actual hard cap is ~32MB per request and is not
  configurable. Treat 30MB as an internal soft-warning threshold — as soon as
  attachments in a single message look like they'd total 30MB+, warn before
  sending/processing rather than waiting for the real 32MB error, so the user
  never has to abandon a session over it. Suggest splitting into multiple
  smaller messages as the workaround.
- Unified dashboard delivery (decided 2026-08-03, superseding the old
  workout-only PDF pipeline below): the training and nutrition dashboards
  are merged into one page. `intake/generate_dashboard.py <date> --unified`
  builds it (Quick View chip strip instead of prose status, full training
  panels — fatigue, recommendation w/ full exercise list + "go for N of M"
  count, load-ratio trend, balance/relative strength, aerobic, PRs —
  supplement/medication compliance check instead of a raw item log).
  At EOD, after closing out the day (regenerate, commit, push) trigger
  `.github/workflows/unified_report.yml` via workflow_dispatch (pass the
  date, or omit to use the most recent intake file) — this builds the page
  fresh in CI and emails it via `report/send_unified.mjs` (HTML attachment,
  same Resend/SMTP secrets as before). Do this automatically as part of the
  normal EOD routine, without being asked, and do **not** also send it via
  chat/SendUserFile — email is now the only delivery channel for the daily
  dashboard. The old `report.yml` (workout-only PDF, auto-fired on a
  data.js push with a new WORKOUTS entry) is now workflow_dispatch-only —
  kept as a manual fallback, not something to trigger routinely anymore.
  **UPDATE 2026-09-13 — EMAIL RETIRED**: per explicit request, once the
  site reached full (and better) feature parity via the redesign, the
  `unified_report.yml` workflow-dispatch trigger is dropped from the
  standing EOD routine — do not fire it automatically anymore (manual
  fallback only, if ever asked for). **Still run
  `python3 generate_dashboard.py <date> --unified` at EOD as before** —
  despite the name, this step is what computes and persists the weekly
  and 90-day-trend sperm-score factors into `sperm.json` (and the energy
  score into `energy.json`) that `export_site_data.py` depends on; only
  the email-send trigger is removed, not the computation step. The
  generated `dashboards/unified_*.html` file itself is now a harmless
  by-product, not a deliverable.
- Interactive dashboard site (built 2026-08-18, per explicit user request —
  decisions confirmed via AskUserQuestion: public/unlisted GitHub Pages URL,
  single-page app with a date picker over per-day static JSON (not one page
  per day), default tab set, keep the EOD email unchanged/in addition to the
  site): `docs/` is a static, no-build-step site (`index.html` + `app.js` +
  `style.css`, Chart.js vendored locally at `docs/vendor/chart.umd.js` —
  **not** a CDN `<script src>`, since this sandbox's network policy blocks
  `cdn.jsdelivr.net`; if that ever needs re-vendoring, `npm install chart.js`
  from `package.json` then copy `node_modules/chart.js/dist/chart.umd.js` →
  `docs/vendor/`, npm's registry isn't blocked). Tabs: Overview, Nutrition,
  Training, Body Composition, Sperm Optimization, Supplements & Lifestyle —
  each pairs charts/bars with inline recommendations (micro-deficit food
  tips, training guidance, supplement-compliance checklist) rather than
  dumping all commentary in one place. `intake/export_site_data.py` is the
  data pipeline: it **imports `generate_dashboard.py` as a module** and
  reuses its compute functions (`compute_current_week`, `compute_energy_score`,
  `generate_suggestions`, `EXPECTED_SUPPLEMENTS`, `load_all_intake_days`,
  etc.) plus the already-persisted `sperm.json`/`energy.json` history, so the
  site's numbers and the emailed HTML dashboard can never drift apart — one
  source of truth. It writes `docs/data/<date>.json` (one bundle per
  exported day) and rebuilds `docs/data/index.json` (lightweight rollup of
  every day, powers the history browser + trend charts without per-day
  fetches). Usage: `python3 export_site_data.py` (latest day only — this is
  the normal EOD case), `--all` (full historical backfill, rarely needed
  again), or a specific date. **Run this as a new, permanent step in the EOD
  close-out routine**, right alongside regenerating the unified HTML
  dashboard: after closing out the day's JSON, run
  `python3 export_site_data.py` from `intake/`, then commit+push `docs/`
  together with the rest of the day's close-out commit — GitHub Pages
  (serving from this branch's `/docs` folder, classic "deploy from branch"
  mode, no separate Actions workflow needed) picks up the new commit
  automatically, no extra trigger step required. The email pipeline
  (`unified_report.yml`) used to run alongside this unchanged — as of the
  2026-09-13 email retirement (see the "Unified dashboard delivery" entry
  above) it's no longer triggered at EOD; this export step is unaffected.
  **Outstanding one-time manual step (can't be done via the GitHub MCP
  tools available in this session — no Pages-config API exposed): the user
  needs to enable GitHub Pages once, in repo Settings → Pages → Source:
  "Deploy from a branch" → Branch: this session's branch → Folder: `/docs`
  → Save.** Until that's done the site has no live URL yet, even though all
  the data/code is already committed and correct. Once enabled, the URL is
  `https://obarkai36-creator.github.io/WorkoutOmer/` (repo is public, so
  this URL is unauthenticated/unlisted — anyone with the link can view it,
  per the user's explicit choice). Remind the user to do this if they ask
  why the link doesn't work yet.
- Monthly recap (automated 2026-07-31): a Routine ("Monthly recap generator",
  trigger trig_01Gxt8g3RG6GfePJ2ZbTTCMr) fires on the 1st of every month,
  generates the previous month's intake/dashboards/monthly/<YYYY-MM>.html via
  generate_monthly_recap.py, commits/pushes it, and sends it to the user
  automatically. Don't generate it manually anymore unless the user asks for
  an ad-hoc recap or the automated run visibly failed/was skipped — check
  `list_triggers`/recent commits first rather than assuming it didn't run.
- Standing permission (given 2026-07-27): proactively suggest full-body
  deload sessions when training-load signals call for it (e.g. repeated ACWR
  alerts >1.5 with no deload taken), and proactively make intake-based
  suggestions about food, coffee/caffeine, or alcohol patterns when the
  logged data supports it — don't hold back on these just to stay neutral.
  Still frame them as suggestions/observations, not mandates.
- Allergy medication reminders (starting 2026-07-31, temporary — "next few
  months" while on this course; ask the user when they stop so this line can
  be removed): they're taking a nasal spray 2x/day and a pill 1x/day
  (morning). Starting with the 2026-07-31 morning sleep entry, remind them to
  take these at two points in the daily logging flow, not by scanning the
  clock:
    - Morning: right after that day's sleep entry is logged, remind them to
      take the spray + the pill (both AM doses).
    - Night: right after that day's dinner is logged, remind them to take
      the spray (PM dose).
  These are chat reminders only — don't log the medication itself as an
  intake item unless the user explicitly tells you they took it.
- Multivitamin swap — ACTIVE (decided 2026-07-31, swap triggered 2026-08-06
  when the user first logged the Mayven gummies at 18:15 on day 40;
  reassess with the user after "at least a few weeks" on the new stack,
  so around/after 2026-08-20+): the standing default for multivitamin-type
  log entries is now Mayven Full Volume Gummies (2 gummies/serving) instead
  of Thorne Basic Nutrients 2/Day. Per the gummies' label (photographed
  2026-07-31, verified reference in intake/references/supplements.json):
  100mcg DFE folate (well under Thorne's 667mcg) and 2.8mg zinc, but NO
  selenium, vitamin C, vitamin D, or vitamin E at all — a real gap versus
  Thorne. The plan also calls for resuming Thorne Zinc Picolinate 15mg
  (already in the supplement stack) — log it separately if/when the user
  reports taking it; don't assume it alongside the gummies unless they say
  so. Proactively suggest specific foods throughout the day's logging flow
  (not just when asked) to help close the gummies' gaps: vitamin C (citrus,
  peppers, tomatoes), vitamin D (fatty fish, eggs, sun exposure), vitamin E
  (nuts, seeds, oils), selenium (Brazil nuts, fish, eggs), and extra folate
  (leafy greens, legumes). Frame as suggestions per the existing standing
  permission for intake-based suggestions, not mandates.
- Daily 16:00 macro/micro update (requested 2026-08-09, **not yet automated**):
  new standing rule — around 16:00 Israel time each day, proactively present a
  macro status update (calories/protein/carbs/fat/fiber vs. targets in
  intake/profile.json, consumed/remaining/%) plus the micro values from
  micros_sperm_priority (zinc, selenium, folate, omega-3, vitamin C, vitamin D,
  vitamin E, lycopene) vs. their targets, in the same format as prior ad-hoc
  macro updates. Attempted to set this up as a Routine
  (`mcp__Claude_Code_Remote__create_trigger`, cron `0 13 * * *` = 16:00 IDT)
  twice on 2026-08-09; both attempts failed with "MCP error -32003: MCP tool
  call requires approval" — this session can't grant that approval
  non-interactively. Until the user creates/approves the Routine themselves
  (via `claude mcp`/`/mcp` or the Routines UI in an interactive session), this
  can't fire automatically — surface that limitation rather than silently
  skipping it, and in the meantime give the update proactively whenever a live
  session happens to be active around 16:00 and a day file is open.
- Sun-exposure vitamin D estimation for long/moving stints (added 2026-08-09,
  requested after the day-43 run): the existing pattern (stationary sessions
  with exact area+duration, e.g. "20 min shoulder/neck only" or "10 min
  torso+legs") gave two anchor rates — small area (shoulder/neck) ≈15 IU/min,
  large area (torso+legs, mostly bare) ≈90 IU/min, both at
  midday/early-afternoon sun strength. For longer, non-stationary stints
  (runs, walks, hikes) where exposure is partial/mixed rather than a clean
  block, estimate rather than asking for a precise log:
    - Exposed duration: use whatever fraction the user gives (e.g. "sun
      exposure through half the run") × total activity duration.
    - Exposed area: infer from typical attire for the activity if not
      stated (e.g. running gear ≈ forearms + lower legs + face/neck, a
      "moderate" area ≈30 IU/min — between the two anchors) — state the
      assumption so the user can correct it.
    - Time-of-day discount: scale down from the midday anchor rate for
      early-morning/evening sun (lower UV angle); no discount needed
      within a couple hours of solar noon.
    - Always flag these as rough/low-confidence estimates (both in the
      item note/assumptions and verbally), since they're built on
      stationary-session anchor rates applied to messier real conditions.
    - Sun exposure isn't logged as a separate `items` entry — fold the
      estimated IU straight into `micros_sperm_priority.vitamin_d_iu` and
      describe it in `assumptions`/`status_note`, matching existing
      practice.
- Dental retainers (added 2026-08-10, starting that night; goal is **2x/week**,
  not nightly; reverted 2026-08-13 to the original flat trigger after
  briefly trying a weekly-pace/overdue-backstop version — see below): log
  usage in `intake/data/metrics/retainers.json` (`entries`: date/worn/note)
  whenever the user reports wearing (or skipping) them — same pattern as
  `sleep.json`, not logged as an intake item. **Don't proactively ask
  whether they were worn each EOD** — only log when the user actually
  volunteers it. At EOD close-out (when the user signals EOD, i.e. "before
  bed"), check the trailing nights: if the last 3 consecutive **calendar**
  nights up to and including tonight all show `worn: false` OR have no entry
  at all, note it once. Otherwise say nothing — no daily status chatter
  either way.
  **CORRECTION (2026-09-09)**: the check was previously (wrongly) applied
  as "the last 3 *logged* entries" rather than "the last 3 *calendar*
  nights" — this let a run of unlogged/missing nights slide silently past
  the trigger as long as the most recent *logged* entry happened to be
  `worn: true`, even when several nights had passed since that entry with
  no log at all. Concretely: walk backward from tonight night-by-night
  (not entry-by-entry) and count any night with no matching `date` in
  `entries` as equivalent to `worn: false` for this check. This check is
  tied to the user-initiated EOD signal, not a wall-clock Routine.
- Omega-3 supplement compliance (added 2026-08-11): the unified dashboard's
  supplement-compliance check (`build_supplement_check` in
  generate_dashboard.py) no longer flags the Omega-3 fish-oil softgel as a
  missed dose on a day where food (fish) alone already cleared the
  omega3_epa_dha_mg target — the point of the supplement is to hit that
  target, not to take the softgel for its own sake. Those days show ✅
  "target met via food (Xmg) — supplement skipped" instead of a ⚠️ warning.
  All other supplement/medication rows are unaffected.
