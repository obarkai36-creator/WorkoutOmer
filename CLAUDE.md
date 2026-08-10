# Session notes

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
- Multivitamin swap trial (decided 2026-07-31, "at least a few weeks" —
  reassess with the user after that): plan is to replace Thorne Basic
  Nutrients 2/Day with Mayven Full Volume Gummies (3 gummies/serving) +
  resuming Thorne Zinc Picolinate 15mg (already in the supplement stack,
  intake/references/supplements.json). The user still has some Thorne left,
  so **keep logging "multivit" as Thorne as normal until the user explicitly
  logs the Mayven gummies for the first time** — only then switch the
  standing default so future multivitamin-type log entries are read as
  gummies + zinc instead of Thorne.
  Per the gummies' label (photographed 2026-07-31): they cover some folate
  (~100mcg DFE, well under Thorne's 667mcg) and some zinc, but have NO
  selenium, vitamin C, vitamin D, or vitamin E at all — a real gap versus
  Thorne. Once the swap is active, proactively suggest specific foods
  throughout the day's logging flow (not just when asked) to help close
  those gaps: vitamin C (citrus, peppers, tomatoes), vitamin D (fatty fish,
  eggs, sun exposure), vitamin E (nuts, seeds, oils), selenium (Brazil nuts,
  fish, eggs), and extra folate (leafy greens, legumes). Frame as
  suggestions per the existing standing permission for intake-based
  suggestions, not mandates.
