# Session notes

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
- Workout dashboard auto-email gate: the report.yml GitHub Action only sends
  the emailed report when it detects a genuinely new WORKOUTS entry in
  data.js (check_new_workout.mjs). If an exercise is added to a workout
  *after* that workout's session was already logged and pushed (same date,
  editing the existing entry rather than adding a new one), the auto-email
  gate will skip it — so the emailed report will silently miss the addition.
  In that situation, manually trigger the report.yml workflow via
  workflow_dispatch right after pushing, without waiting to be asked —
  don't make the user discover the gap by asking "did you send it?".
- Monthly recap: hold off generating intake/dashboards/monthly/<YYYY-MM>.html
  until the user explicitly signals it's time (e.g. "it's Aug 1st, run the
  July recap") — don't run generate_monthly_recap.py proactively before then.
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
