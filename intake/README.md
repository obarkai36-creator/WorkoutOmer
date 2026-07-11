# Nutrition & Intake Tracker

Daily food / drink / supplement tracking toward three goals: **weight loss**,
**muscle retention**, and **sperm optimization**. Output is a self-contained
dark-mode HTML dashboard generated once per day.

## Layout

```
profile.json                 # baseline: personal details, goals, lifestyle, diet, targets
references/supplements.json  # current supplement stack (verified) + candidate additions
references/import_templates/ # example CSVs for exercise/scale exports
data/intake/YYYY-MM-DD.json  # one file per day: timestamped items + macro analysis
data/metrics/weight.json     # body-composition log (Eufy Smart Scale)
data/metrics/sperm.json      # sperm-optimization score: trailing 7-day window, recomputed + persisted daily (sub-factors + weights)
data/metrics/energy.json     # daily energy score (sleep/nutrition/movement/caffeine/alcohol), recomputed + persisted every render
data/metrics/lifestyle.json  # travel / heat / sleep / stress events that affect scoring
data/metrics/workouts.json   # training sessions + report_snapshot (kept in sync with ../data.js — see sync_training_snapshot.mjs)
data/metrics/sleep.json      # nightly sleep log (manual entry — Health Connect is US-only, not accessible yet)
data/metrics/ejaculation.json # ejaculatory frequency log (date, time, self/partnered) — feeds the sperm score
data/imports/                # drop CSV/JSON exports here, then run import_data.py
generate_dashboard.py        # renders dashboards/<date>.html from the JSON above
import_data.py               # merges data/imports/ files into the metrics stores
sync_training_snapshot.mjs   # refreshes workouts.json's report_snapshot by running ../data.js + ../engine.js live
dashboards/YYYY-MM-DD.html   # daily export (also sent in chat)
```

## Daily flow

1. Log food/drink (text or photo) with the time — items are analyzed into macros + micros.
2. Day's data is written to `data/intake/YYYY-MM-DD.json`.
3. Run `python3 generate_dashboard.py [YYYY-MM-DD]` (defaults to latest day).
4. Dashboard HTML lands in `dashboards/` and is shared in chat.

Log lifestyle events as they happen (a flight, poor sleep, sauna, high-stress
stretch) — they're recorded in `data/metrics/lifestyle.json` and feed the weekly
sperm score; recent ones show in the dashboard's Lifestyle log.

Whenever `../data.js` changes (new workout, new weigh-in), run
`node intake/sync_training_snapshot.mjs` before regenerating the nutrition
dashboard — it recomputes `workouts.json`'s `report_snapshot` from the same
`data.js` + `engine.js` the workout dashboard uses, so the Training panel's
"Latest" / "Recommended next" / alerts always match what the workout
dashboard itself is showing (rather than drifting out of sync).

## Panels

Status & progress · Weight & body composition · Sperm optimization (weekly) +
Lifestyle log · Macros (today) · Sperm-priority micronutrients · Intake log ·
Suggestions (unlocks after 14 logged days).

## Targets (editable in `profile.json`)

~2,050 kcal/day · 165 g protein (~2 g/kg) · 32 g fiber · sperm-priority micros
tracked daily (zinc, selenium, folate, omega-3, vit C/D/E, lycopene).

## Connecting the exercise-log project

The exercise log lives in a **separate repo** that can't be read directly, so it
shares data by exporting files into `data/imports/`. Then:

```
python3 import_data.py           # merges drops into metrics, archives to data/imports/processed/
python3 generate_dashboard.py
```

### Drop-in file format

Classified by filename prefix (case-insensitive). CSV needs a header row; JSON
must be a list of objects with the same keys. Extra columns are ignored. See
`references/import_templates/` for examples.

- **Weigh-ins** — `weight*` / `scale*` / `eufy*`:
  `date, weight_kg, body_fat_pct, skeletal_muscle_mass_kg, visceral_fat,
  muscle_mass_kg, lean_body_mass_kg, water_pct, bmr_kcal, resting_heart_rate`
  (`date` + `weight_kg` required, rest optional)
- **Workouts** — `workout*` / `exercise*` / `training*`:
  `date, type, duration_min, intensity, notes`

Imported entries are keyed by date and override any existing (or demo `sample`)
row for that date.

## Notes

- Eufy scale has **no automatic feed** — paste numbers or drop a `scale*`/`eufy*`
  export in `data/imports/`.
- The Thorne multivitamin micronutrient amounts in `references/supplements.json`
  are **verified** from the product label (both panels).


## Note: handling API-rejected images

Uploaded photos occasionally come back "(media removed — rejected by API)". This is
transient flakiness in the API media-ingest for some Samsung JPEG byte-streams — the
files themselves are valid (identical bytes have been rejected and accepted on
different attempts). The uploaded file still lands on disk under
`/root/.claude/uploads/<session>/`, so the fix is to re-rasterize it locally and read
the fresh copy instead of asking the user to re-send:

```js
// headless Chrome via playwright (executablePath /tmp/cft/chrome-linux64/chrome)
await page.goto("file:///root/.claude/uploads/<session>/<file>.jpg");
const img = await page.$('img');
await img.screenshot({ path: "/tmp/rerender.jpg", type: "jpeg", quality: 82 });
// then Read /tmp/rerender.jpg — passes.
```
