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
import bisect
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


UNLOCK_DAYS = 14  # same gate generate_dashboard.py uses before a real score exists


def export_day(target_date, all_days_by_date, profile, weight_entries, sleep_entries,
                lifestyle_events, ejac_entries, retainers_entries, workouts_entries,
                sperm_weights, sperm_bands, energy_bands, days_logged_asof,
                is_latest, training_full, training_load_entries):
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
    # A day can have more than one logged session (e.g. two separate gym
    # segments) -- collect ALL of that date's entries rather than just the
    # first match, so a second same-day session isn't silently dropped.
    day_workout_entries = [w for w in workouts_entries if w["date"] == target_date]

    # Sperm score / energy score are computed LIVE here (the same pure
    # functions generate_dashboard.py's EOD run uses), not read from
    # sperm.json/energy.json's persisted history — that history is only
    # refreshed once/day at EOD, so reading it made the site's numbers lag
    # behind everything logged since the last EOD, which defeats the point
    # of re-exporting after every single entry. Computing live means today's
    # score reflects what's logged *right now*, exactly like macros/micros
    # already do (fixed 2026-09-18, after the "still shows locked" report).
    all_days_list = list(all_days_by_date.values())
    score_unlocked = days_logged_asof >= UNLOCK_DAYS
    sperm_score = None
    sperm_trend = None
    if score_unlocked:
        wk = gd.compute_current_week(profile, target_date, all_days_list, weight_entries,
                                      sleep_entries, lifestyle_events, ejac_entries)
        overall = round(sum(wk["factors"][k] * w for k, w in sperm_weights.items()))
        sperm_score = {**wk, "overall": overall, "band": gd.band_for(overall, sperm_bands)}

        # ~90-day trailing trend — the biologically-relevant window
        # (spermatogenesis takes ~64-90 days), kept alongside the weekly
        # "current habits" score above rather than replacing it.
        trend = gd.compute_trailing_trend(profile, target_date, all_days_list, weight_entries,
                                           sleep_entries, lifestyle_events, ejac_entries)
        trend_overall = round(sum(trend["factors"][k] * w for k, w in sperm_weights.items()))
        sperm_trend = {**trend, "overall": trend_overall, "band": gd.band_for(trend_overall, sperm_bands)}

    energy = gd.compute_energy_score(profile, target_date, intake, sleep_entries,
                                      lifestyle_events, workouts_entries)
    energy_score = {**energy, "band": gd.band_for(energy["overall"], energy_bands)}

    # Per-day ACWR (EWMA acute:chronic load ratio) history — persisted by
    # generate_dashboard.py's persist_training_load() pinned to that date's
    # end-of-day, so past days show what the ratio actually was then instead
    # of only ever "right now" (the `training_trends` field below is still
    # is_latest-only live state for the Training tab's "what to do next").
    training_load = next((e for e in training_load_entries if e["date"] == target_date), None)

    bundle = {
        "date": target_date,
        "day_number": intake.get("day_number"),
        "in_progress": intake.get("in_progress"),
        "exclude_from_monthly_macros": intake.get("exclude_from_monthly_macros", False),
        "workout_today": intake.get("workout_today"),
        "workout_summary": intake.get("workout_summary"),
        "status_note": intake.get("status_note"),
        "caffeine_shots": intake.get("caffeine_shots"),
        "steps": intake.get("steps"),
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
        "sperm_trend": sperm_trend,
        "energy_score": energy_score,
        "training_load": training_load,
        "workout_log": day_workout_entries[0] if day_workout_entries else None,
        "workout_logs": day_workout_entries,
        "planned_workout": intake.get("planned_workout"),
    }
    if is_latest:
        bundle["training"] = training_full.get("recommendation") if training_full else None
        bundle["training_alerts"] = training_full.get("alerts", []) if training_full else []
        bundle["training_trends"] = training_full.get("trends") if training_full else None
        bundle["training_balance"] = training_full.get("balance") if training_full else None
        bundle["training_bodyweight"] = training_full.get("bodyweight") if training_full else None
        # muscle-level fatigue (finer-grained than the section-level
        # `training.sections`... actually this IS `sections` — see
        # generate_dashboard.py's build_training_panels for the shape),
        # relative strength, aerobic detail, and the PR/below-best "changes"
        # list were only ever surfaced in the emailed dashboard — the
        # redesign needs them on the site too, so expose them here the same
        # way the fields above already are.
        bundle["training_sections"] = training_full.get("sections") if training_full else None
        bundle["training_relstrength"] = training_full.get("relstrength") if training_full else None
        bundle["training_aerobic"] = training_full.get("aerobic") if training_full else None
        bundle["training_changes"] = training_full.get("changes", []) if training_full else []
        # Full latest-vs-best listing for EVERY exercise across every section
        # (not just whatever's currently recommended) -- engine.js already
        # computes this (snapshotProgress) but it had never been surfaced in
        # any UI. Powers the Training tab's exercise/muscle-group search.
        bundle["training_progress"] = training_full.get("progress") if training_full else None
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

    # Only the static model config (weights/bands) is needed here now — the
    # actual scores are computed live per-date in export_day(), not read
    # from these files' persisted history (see export_day's comment).
    sperm_store = gd.load("data/metrics/sperm.json")
    sperm_weights = sperm_store["model"]["weights"]
    sperm_bands = sperm_store["model"]["bands"]

    energy_store = gd.load("data/metrics/energy.json")
    energy_bands = energy_store["model"]["bands"]

    try:
        training_load_entries = gd.load("data/metrics/training_load.json").get("entries", [])
    except FileNotFoundError:
        training_load_entries = []

    all_days = gd.load_all_intake_days()
    all_days_by_date = {d["date"]: d for d in all_days}
    dates = sorted(all_days_by_date.keys())
    # "planned_only" days are pre-populated ahead of time purely to hold an
    # adjusted workout plan for a day that hasn't happened yet (see the
    # planned_workout feature) — they must stay reachable via manual date
    # navigation but must never be treated as "today"/"latest".
    real_dates = [d for d in dates if not all_days_by_date[d].get("planned_only")]
    latest_date = real_dates[-1] if real_dates else dates[-1]

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
        # How many real days had been logged as of this date — the same
        # 14-day gate generate_dashboard.py uses before the sperm score is a
        # real (rather than illustrative) estimate.
        days_logged_asof = bisect.bisect_right(real_dates, d)
        bundle = export_day(
            d, all_days_by_date, profile, weight_entries, sleep_entries,
            lifestyle_events, ejac_entries, retainers_entries, workouts_entries,
            sperm_weights, sperm_bands, energy_bands, days_logged_asof,
            is_latest=(d == latest_date), training_full=training_full,
            training_load_entries=training_load_entries,
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
            "sperm_trend": bundle["sperm_trend"]["overall"] if bundle["sperm_trend"] else None,
            "energy_score": bundle["energy_score"]["overall"] if bundle["energy_score"] else None,
            "acwr": bundle["training_load"]["acwr"] if bundle["training_load"] else None,
            "sleep_hours": bundle["sleep"]["duration_hours"] if bundle["sleep"] else None,
            "workout_today": bundle["workout_today"],
            "workout_type": (bundle["workout_summary"] or "").split(",")[0].split(".")[0] if bundle["workout_today"] else None,
            "caffeine_shots": bundle["caffeine_shots"],
            "steps": bundle["steps"],
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
        "days_logged": len(real_dates),
        "latest_date": latest_date,
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
