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
