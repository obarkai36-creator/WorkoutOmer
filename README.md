# 🏋️ WorkoutOmer — Personal Training Dashboard

A horizontal, single-page dashboard that turns your logged workouts into a
coach's-eye view: how recovered each muscle is, how your lifts are trending,
what to train next and when, and what to watch out for.

No build step, no backend, no install. Open `index.html` in any browser.

## Quick start

1. Open **`index.html`** in your browser (double-click it, or serve the folder).
2. To log workouts, edit **`data.js`** — it's the only file you touch.
3. Reload the page. Everything recalculates automatically.

> Tip: to preview the dashboard as of a specific day, add `?now=2026-06-13`
> to the URL.

## The six panels (scroll horizontally →)

| Panel | What it shows |
|-------|---------------|
| 🔥 **Muscle Fatigue** | Current fatigue % per body section (Push / Pull / Legs / Core / Aerobic) and per muscle, from recent volume decaying over each muscle's recovery window. |
| 📈 **Workload Progress** | Every tracked lift, grouped by muscle group: latest vs. your personal best (as a % bar), PR stars, and which lifts you're currently below best on. Lifts in today's session are dotted (●). |
| 🎯 **Next Session** | The most-recovered muscle group to train next, how long to rest first, the earliest sensible slot, and a suggested exercise list. |
| ⚠️ **Injury Alerts** | Acute:chronic workload ratio (load spikes), under-recovered muscles trained too soon, big single-lift jumps, and push/pull imbalance. |
| 🛠️ **Suggested Changes** | Programming tweaks — fix imbalances, address stalled lifts, hit neglected muscles, aerobic dose, load management. |
| 🕒 **Workout Timing** | Sessions/week, average rest gap, typical time of day, day-of-week pattern, and a 6-week training-load trend. |

## `data.js` has two parts

**1. `SNAPSHOT`** — your current *latest vs best* for every exercise, grouped by
muscle group. No dates needed; powers Workload Progress and the balance checks.
```js
{ name: "Bench Press", section: "Chest",
  latest: { sets: 4, reps: 5, weight: 72.5, text: "72.5kg × 4×5" },
  best:   { sets: 4, reps: 5, weight: 72.5, text: "72.5kg × 4×5" } }
```
- Uniform sets → `{ sets, reps, weight }`. Mixed → `{ scheme: [ {sets,reps,weight}, ... ] }`.
- Timed holds → add `iso: true` and use `{ sets, seconds, weight }`.
- Dumbbell "each" loads are stored as **total kg** (16 each → 32); `text` keeps your original notation for display.

**2. `WORKOUTS`** — actual **dated** sessions (newest first). These drive muscle
fatigue, recovery, the next-session call, and timing. Log each session here as
it happens; also bump the matching `SNAPSHOT` entry when you hit a new best.
```js
// strength
{ datetime: "2026-06-13T09:00", note: "Chest + Biceps", exercises: [
    { name: "Bench Press", sets: [ { reps: 5, weight: 72.5 }, { reps: 5, weight: 72.5 } ] },
]}
// aerobic
{ datetime: "2026-05-08T18:00", exercises: [
    { name: "Outdoor Run", distanceKm: 2.0, durationMin: 13.2, avgHr: 148 },
]}
```

- Weights in **kg**, distances in **km**.
- New exercise? Add it to `EXERCISE_LIBRARY` with the muscles it works and their share (1.0 = primary mover, lower = assisting), then reference it by name.
- Tune recovery speed per muscle via `recoveryHours` in `MUSCLES`; sections come from `SECTION_ORDER`.

> **Note on the seeded data:** your undated per-muscle-group tables are loaded as
> `SNAPSHOT` benchmarks (not recent sessions), so fatigue is driven only by
> today's logged session + your cardio log. Muscle groups you haven't logged a
> dated session for yet will read as "recovered" until you log one.

## How the model works (brief)

- **Fatigue** — each session adds load to the muscles it works; that load decays
  exponentially. `recoveryHours` is the time for a maximal session to fall back
  to the "ready to train" threshold (~30%).
- **Load / ACWR** — each session gets a unitless *stress* score (so lifting and
  cardio are comparable). The acute:chronic workload ratio compares the last 7
  days to your 4-week average; ~0.8–1.3 is the sweet spot, >1.5 is spike territory.
- **Estimated 1RM** — Epley formula (`weight × (1 + reps/30)`).

These are training-model estimates to guide planning — **not medical advice.**

## 📧 Auto-emailed PDF report (after each log)

Every time `data.js` changes and is pushed, a GitHub Action renders the
dashboard to a **landscape PDF** and emails it to you.

- **Renderer:** `report/render.mjs` (headless Chromium via Playwright) → `report.pdf`,
  laid out for print via the `?pdf=1` mode. "Now" is anchored to your most
  recent logged session so the report reads correctly in CI.
- **Email:** `report/send.mjs` (Gmail SMTP via nodemailer).
- **Workflow:** `.github/workflows/report.yml` — runs on push to `data.js`
  (and on manual *Run workflow*). The PDF is also uploaded as a build artifact.

### One-time setup — add the email secret

The Action can render the PDF without any setup, but to actually **send** the
email it needs a Gmail **App Password** (a 16-char token, not your normal
password):

1. Enable 2-Step Verification on your Google account, then create an App
   Password: <https://myaccount.google.com/apppasswords> (pick "Mail").
2. In the GitHub repo: **Settings → Secrets and variables → Actions → New
   repository secret**, and add:
   - `SMTP_USER` = your Gmail address (e.g. `obarkai36@gmail.com`)
   - `SMTP_PASS` = the 16-char App Password
   - `REPORT_TO` *(optional)* = recipient; defaults to `SMTP_USER`
3. Done. The next push that touches `data.js` emails you the PDF. Until the
   secret exists, the run still succeeds and the PDF is downloadable from the
   Action's artifacts.

Run it locally too:
```bash
npm install && npx playwright install chromium
SMTP_USER=you@gmail.com SMTP_PASS=app-password npm run report   # render + email
npm run render                                                  # just make report.pdf
```

## Files

```
index.html   markup + panel layout
styles.css   dark theme, horizontal scroller
data.js      YOUR workouts + exercise/muscle definitions  ← edit this
engine.js    all calculations (pure functions)
app.js       rendering + charts (+ ?pdf=1 print mode)
vendor/      Chart.js bundled locally (no network needed)
report/      render.mjs (HTML→PDF) + send.mjs (email)
.github/     workflow that renders + emails on each push
```

Everything runs **100% offline** — Chart.js is vendored in `vendor/`, so the
dashboard works with no internet connection.
