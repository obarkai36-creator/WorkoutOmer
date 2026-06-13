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
| 📈 **Workload Progress** | Every exercise in your latest workout: session volume vs. your all-time best, estimated 1RM, change vs. last time, and PR flags. |
| 🎯 **Next Session** | The most-recovered muscle group to train next, how long to rest first, the earliest sensible slot, and a suggested exercise list. |
| ⚠️ **Injury Alerts** | Acute:chronic workload ratio (load spikes), under-recovered muscles trained too soon, big single-lift jumps, and push/pull imbalance. |
| 🛠️ **Suggested Changes** | Programming tweaks — fix imbalances, address stalled lifts, hit neglected muscles, aerobic dose, load management. |
| 🕒 **Workout Timing** | Sessions/week, average rest gap, typical time of day, day-of-week pattern, and a 6-week training-load trend. |

## Logging workouts (`data.js`)

Add newest entries to the **top** of the `WORKOUTS` array. The first entry is
treated as your "latest workout."

**Strength:**
```js
{ datetime: "2026-06-12T07:20", note: "Legs", exercises: [
    { name: "Back Squat", sets: [ { reps: 5, weight: 115 }, { reps: 5, weight: 110 } ] },
    { name: "Pull-up",    sets: [ { reps: 8, added: 5 }, { reps: 7 } ] }, // bodyweight + 5kg
]}
```

**Aerobic:**
```js
{ datetime: "2026-06-05T18:45", exercises: [
    { name: "Run", durationMin: 40, distanceKm: 7.5, avgHr: 158, rpe: 7 },
]}
```

- Weights are in **kg**, distances in **km**.
- For bodyweight moves (pull-up, dips, plank), the load base is `ATHLETE.bodyweightKg`; use `added` for extra plates.
- New exercise? Add it to `EXERCISE_LIBRARY` with the muscles it works and their share (1.0 = primary mover, lower = assisting).
- Tune recovery speed per muscle via `recoveryHours` in `MUSCLES`.

## How the model works (brief)

- **Fatigue** — each session adds load to the muscles it works; that load decays
  exponentially. `recoveryHours` is the time for a maximal session to fall back
  to the "ready to train" threshold (~30%).
- **Load / ACWR** — each session gets a unitless *stress* score (so lifting and
  cardio are comparable). The acute:chronic workload ratio compares the last 7
  days to your 4-week average; ~0.8–1.3 is the sweet spot, >1.5 is spike territory.
- **Estimated 1RM** — Epley formula (`weight × (1 + reps/30)`).

These are training-model estimates to guide planning — **not medical advice.**

## Files

```
index.html   markup + panel layout
styles.css   dark theme, horizontal scroller
data.js      YOUR workouts + exercise/muscle definitions  ← edit this
engine.js    all calculations (pure functions)
app.js       rendering + charts (Chart.js via CDN)
```
