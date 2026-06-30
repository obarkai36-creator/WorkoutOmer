#!/usr/bin/env python3
"""Import exercise-log + scale data dropped into data/imports/.

The exercise-log project (a separate repo) can't be read directly, so it
exports files into this repo's data/imports/ folder. This script parses them
and merges into:
    data/metrics/weight.json     (body-composition / weigh-ins)
    data/metrics/workouts.json   (training sessions)

Accepted files (classified by filename prefix, case-insensitive):
    weight*.csv | weight*.json | scale*       -> weigh-ins
    workout*.csv | exercise*.* | training*.*  -> workouts

CSV must have a header row. Recognised columns (extra columns are ignored):
  Weigh-ins:  date, weight_kg, body_fat_pct, skeletal_muscle_mass_kg,
              visceral_fat, muscle_mass_kg, lean_body_mass_kg, water_pct,
              bmr_kcal, resting_heart_rate
  Workouts:   date, type, duration_min, intensity, notes

JSON must be a list of objects with the same keys.

Merge rules: entries are keyed by date; an imported entry overrides any existing
entry for that date (including demo 'sample' rows). Processed files are moved to
data/imports/processed/.

Usage:  python import_data.py
"""
import csv
import json
import os
import glob
import shutil

ROOT = os.path.dirname(os.path.abspath(__file__))
IMPORTS = os.path.join(ROOT, "data/imports")
PROCESSED = os.path.join(IMPORTS, "processed")

WEIGHT_FIELDS = ["weight_kg", "body_fat_pct", "skeletal_muscle_mass_kg",
                 "visceral_fat", "muscle_mass_kg", "lean_body_mass_kg",
                 "water_pct", "bmr_kcal", "resting_heart_rate"]
WORKOUT_FIELDS = ["type", "duration_min", "intensity", "notes"]


def load_json(path, default):
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


def read_rows(path):
    """Return a list of dict rows from a CSV or JSON file."""
    if path.lower().endswith(".json"):
        data = load_json(path, [])
        return data if isinstance(data, list) else data.get("entries", [])
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def num(v):
    try:
        return float(v) if "." in str(v) else int(v)
    except (ValueError, TypeError):
        return v


def classify(name):
    n = os.path.basename(name).lower()
    if n.startswith(("weight", "scale", "eufy")):
        return "weight"
    if n.startswith(("workout", "exercise", "training")):
        return "workout"
    return None


def merge_by_date(store_entries, new_rows, fields, source):
    by_date = {e["date"]: e for e in store_entries}
    added = 0
    for row in new_rows:
        d = (row.get("date") or "").strip()
        if not d:
            continue
        entry = {"date": d, "sample": False, "_source": source}
        for k in fields:
            if row.get(k) not in (None, ""):
                entry[k] = num(row[k])
        by_date[d] = entry
        added += 1
    return sorted(by_date.values(), key=lambda e: e["date"]), added


def main():
    files = [f for f in glob.glob(os.path.join(IMPORTS, "*"))
             if os.path.isfile(f)]
    if not files:
        print("No files in data/imports/. Drop a weight*/workout* CSV or JSON there.")
        return

    weight = load_json(os.path.join(ROOT, "data/metrics/weight.json"),
                       {"unit": "kg", "entries": []})
    workouts = load_json(os.path.join(ROOT, "data/metrics/workouts.json"),
                         {"_note": "Training sessions imported from the exercise-log project.", "entries": []})

    os.makedirs(PROCESSED, exist_ok=True)
    touched_w = touched_x = 0
    for path in files:
        kind = classify(path)
        if kind is None:
            print(f"  ? skipped (unknown type): {os.path.basename(path)}")
            continue
        rows = read_rows(path)
        src = os.path.basename(path)
        if kind == "weight":
            weight["entries"], n = merge_by_date(weight["entries"], rows, WEIGHT_FIELDS, src)
            touched_w += n
            print(f"  + {n} weigh-in(s) from {src}")
        else:
            workouts["entries"], n = merge_by_date(workouts["entries"], rows, WORKOUT_FIELDS, src)
            touched_x += n
            print(f"  + {n} workout(s) from {src}")
        shutil.move(path, os.path.join(PROCESSED, src))

    if touched_w:
        save_json(os.path.join(ROOT, "data/metrics/weight.json"), weight)
    if touched_x:
        save_json(os.path.join(ROOT, "data/metrics/workouts.json"), workouts)
    print(f"Done. {touched_w} weigh-in(s), {touched_x} workout(s) merged. "
          f"Now run: python generate_dashboard.py")


if __name__ == "__main__":
    main()
