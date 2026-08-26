# Session notes

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
  (`unified_report.yml`) is unchanged and untouched by this.
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
  bed"), check the trailing nights: if the last 3 consecutive tracked
  nights all show `worn: false` (or are missing), note it once. Otherwise
  say nothing — no daily status chatter either way. This check is tied to
  the user-initiated EOD signal, not a wall-clock Routine.
- Omega-3 supplement compliance (added 2026-08-11): the unified dashboard's
  supplement-compliance check (`build_supplement_check` in
  generate_dashboard.py) no longer flags the Omega-3 fish-oil softgel as a
  missed dose on a day where food (fish) alone already cleared the
  omega3_epa_dha_mg target — the point of the supplement is to hit that
  target, not to take the softgel for its own sake. Those days show ✅
  "target met via food (Xmg) — supplement skipped" instead of a ⚠️ warning.
  All other supplement/medication rows are unaffected.
