#!/usr/bin/env python3
"""Export structured per-day JSON snapshots for the interactive site (docs/).

Reuses generate_dashboard.py's compute functions directly (imported as a
module) so the site's numbers and the emailed HTML dashboard's numbers can
never drift apart — one source of truth, two presentations.

Usage:
    python3 export_site_data.py            # latest day only + refresh index.json
    python3 export_site_data.py --all      # every logged day + refresh index.json
    python3 export_site_data.py 2026-08-10 # one specific day + refresh index.json

Writes: ../docs/data/<date>.json (one per exported day), ../docs/data/index.json
(lightweight rollup of every day, for the history browser + trend charts).
"""
import json
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import generate_dashboard as gd  # noqa: E402

DOCS_DATA = os.path.join(gd.ROOT, "..", "docs", "data")


def macro_block(consumed, target):
    consumed = round(consumed, 2)
    pct = round(consumed / target * 100) if target else None
    return {"consumed": consumed, "target": target, "pct": pct}


def export_day(target_date, all_days_by_date, profile, weight_entries, sleep_entries,
                lifestyle_events, ejac_entries, retainers_entries, workouts_entries,
                sperm_weeks, sperm_weights, sperm_bands, energy_days, energy_bands,
                is_latest, training_full):
    intake = all_days_by_date[target_date]
    t = profile["targets"]
    items = intake.get("items", [])
    tot = {k: sum(i.get(k, 0) for i in items) for k in
           ["kcal", "protein_g", "carbs_g", "fat_g", "fiber_g"]}
    micros = intake.get("micros_sperm_priority", {})
    mtarg = t["micros_sperm_priority"]

    macros = {
        "calories": macro_block(tot["kcal"], t["calories_kcal"]),
        "protein_g": macro_block(tot["protein_g"], t["protein_g"]),
        "carbs_g": macro_block(tot["carbs_g"], t["carbs_g"]),
        "fat_g": macro_block(tot["fat_g"], t["fat_g"]),
        "fiber_g": macro_block(tot["fiber_g"], t["fiber_g"]),
    }
    micro_block = {k: macro_block(micros.get(k, 0), mtarg.get(k, 0)) for k in mtarg}

    omega3_total = micros.get("omega3_epa_dha_mg", 0)
    omega3_target = mtarg.get("omega3_epa_dha_mg")
    supp_rows = []
    for label, name_sub, qty_sub, show_product in gd.expected_supplements_for(target_date):
        match = next(
            (i for i in items if name_sub in i.get("name", "").lower()
             and (qty_sub is None or qty_sub in i.get("qty", "").lower())),
            None,
        )
        taken = match is not None
        met_via_food = bool(
            not taken and label == "Omega-3" and omega3_target and omega3_total >= omega3_target
        )
        supp_rows.append({
            "label": label,
            "taken": taken,
            "met_via_food": met_via_food,
            "product_name": match["name"] if (taken and show_product) else None,
        })

    weight_entry = next((w for w in weight_entries if w["date"] == target_date), None)
    sleep_entry = next((s for s in sleep_entries if s["date"] == target_date), None)
    day_lifestyle = [e for e in lifestyle_events if e["date"] == target_date]
    day_ejac = [e for e in ejac_entries if e["date"] == target_date]
    retainer_entry = next((r for r in retainers_entries if r["date"] == target_date), None)
    workout_entry = next((w for w in workouts_entries if w["date"] == target_date), None)

    sperm_week = next((w for w in sperm_weeks if w["week_end"] == target_date), None)
    sperm_score = None
    if sperm_week:
        overall = round(sum(sperm_week["factors"][k] * w for k, w in sperm_weights.items()))
        sperm_score = {**sperm_week, "overall": overall, "band": gd.band_for(overall, sperm_bands)}

    energy_day = next((e for e in energy_days if e["date"] == target_date), None)
    energy_score = None
    if energy_day:
        energy_score = {**energy_day, "band": gd.band_for(energy_day["overall"], energy_bands)}

    bundle = {
        "date": target_date,
        "day_number": intake.get("day_number"),
        "in_progress": intake.get("in_progress"),
        "exclude_from_monthly_macros": intake.get("exclude_from_monthly_macros", False),
        "workout_today": intake.get("workout_today"),
        "workout_summary": intake.get("workout_summary"),
        "status_note": intake.get("status_note"),
        "caffeine_shots": intake.get("caffeine_shots"),
        "macros": macros,
        "micros": micro_block,
        "items": items,
        "weight": weight_entry,
        "sleep": sleep_entry,
        "lifestyle_events": day_lifestyle,
        "ejaculation_events": day_ejac,
        "retainers": retainer_entry,
        "supplement_compliance": supp_rows,
        "sperm_score": sperm_score,
        "energy_score": energy_score,
        "workout_log": workout_entry,
    }
    if is_latest:
        bundle["training"] = training_full.get("recommendation") if training_full else None
        bundle["training_alerts"] = training_full.get("alerts", []) if training_full else []
        bundle["training_trends"] = training_full.get("trends") if training_full else None
        bundle["training_balance"] = training_full.get("balance") if training_full else None
        bundle["training_bodyweight"] = training_full.get("bodyweight") if training_full else None
        bundle["suggestions"] = gd.generate_suggestions(
            profile, list(all_days_by_date.values()), weight_entries, sleep_entries,
            lifestyle_events, target_date, ejac_entries,
        )
    return bundle


def main():
    argv = sys.argv[1:]
    all_flag = "--all" in argv
    explicit_dates = [a for a in argv if a != "--all"]
    os.makedirs(DOCS_DATA, exist_ok=True)

    profile = gd.load("profile.json")
    weight_entries = gd.load("data/metrics/weight.json")["entries"]
    sleep_entries = gd.load("data/metrics/sleep.json").get("entries", [])
    try:
        lifestyle_events = gd.load("data/metrics/lifestyle.json").get("events", [])
    except FileNotFoundError:
        lifestyle_events = []
    try:
        ejac_entries = gd.load("data/metrics/ejaculation.json").get("entries", [])
    except FileNotFoundError:
        ejac_entries = []
    try:
        retainers_entries = gd.load("data/metrics/retainers.json").get("entries", [])
    except FileNotFoundError:
        retainers_entries = []
    try:
        workouts_entries = gd.load("data/metrics/workouts.json").get("entries", [])
    except FileNotFoundError:
        workouts_entries = []

    sperm_store = gd.load("data/metrics/sperm.json")
    sperm_weeks = sperm_store["weeks"]
    sperm_weights = sperm_store["model"]["weights"]
    sperm_bands = sperm_store["model"]["bands"]

    energy_store = gd.load("data/metrics/energy.json")
    energy_days = energy_store["days"]
    energy_bands = energy_store["model"]["bands"]

    all_days = gd.load_all_intake_days()
    all_days_by_date = {d["date"]: d for d in all_days}
    dates = sorted(all_days_by_date.keys())
    latest_date = dates[-1]

    gd.refresh_training_full()
    try:
        training_full = gd.load("data/metrics/training_full.json")
    except FileNotFoundError:
        training_full = None

    if explicit_dates:
        targets = [d for d in explicit_dates if d in all_days_by_date]
    elif all_flag:
        targets = dates
    else:
        targets = [latest_date]

    index_rows = []
    for d in dates:
        bundle = export_day(
            d, all_days_by_date, profile, weight_entries, sleep_entries,
            lifestyle_events, ejac_entries, retainers_entries, workouts_entries,
            sperm_weeks, sperm_weights, sperm_bands, energy_days, energy_bands,
            is_latest=(d == latest_date), training_full=training_full,
        )
        if d in targets:
            with open(os.path.join(DOCS_DATA, f"{d}.json"), "w", encoding="utf-8") as f:
                json.dump(bundle, f, ensure_ascii=False)
        index_rows.append({
            "date": d,
            "day_number": bundle["day_number"],
            "calories": bundle["macros"]["calories"]["consumed"],
            "protein_g": bundle["macros"]["protein_g"]["consumed"],
            "carbs_g": bundle["macros"]["carbs_g"]["consumed"],
            "fat_g": bundle["macros"]["fat_g"]["consumed"],
            "fiber_g": bundle["macros"]["fiber_g"]["consumed"],
            "weight_kg": bundle["weight"]["weight_kg"] if bundle["weight"] else None,
            "bmi": bundle["weight"].get("bmi") if bundle["weight"] else None,
            "body_fat_pct": bundle["weight"].get("body_fat_pct") if bundle["weight"] else None,
            "muscle_mass_kg": bundle["weight"].get("muscle_mass_kg") if bundle["weight"] else None,
            "sperm_score": bundle["sperm_score"]["overall"] if bundle["sperm_score"] else None,
            "energy_score": bundle["energy_score"]["overall"] if bundle["energy_score"] else None,
            "sleep_hours": bundle["sleep"]["duration_hours"] if bundle["sleep"] else None,
            "workout_today": bundle["workout_today"],
            "workout_type": (bundle["workout_summary"] or "").split(",")[0].split(".")[0] if bundle["workout_today"] else None,
            "caffeine_shots": bundle["caffeine_shots"],
            "retainers_worn": bundle["retainers"]["worn"] if bundle["retainers"] else None,
            "alcohol_event": any(e.get("type") == "alcohol" for e in bundle["lifestyle_events"]),
            "ejaculation_count": len(bundle["ejaculation_events"]),
            "in_progress": bundle["in_progress"],
            "exclude_from_monthly_macros": bundle["exclude_from_monthly_macros"],
            "supplements_taken": sum(1 for s in bundle["supplement_compliance"] if s["taken"] or s["met_via_food"]),
            "supplements_total": len(bundle["supplement_compliance"]),
        })

    index = {
        "generated": datetime.now().isoformat(timespec="seconds"),
        "days_logged": len(dates),
        "profile_targets": profile["targets"],
        "goals": profile["goals"],
        "sperm_bands": sperm_bands,
        "energy_bands": energy_bands,
        "days": index_rows,
    }
    with open(os.path.join(DOCS_DATA, "index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False)

    print(f"Exported {len(targets)} day file(s) -> docs/data/  ({len(dates)} days total in index.json)")


if __name__ == "__main__":
    main()
