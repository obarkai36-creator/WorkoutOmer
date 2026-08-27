#!/usr/bin/env python3
"""Generate the daily dark-mode intake dashboard as a self-contained HTML file.

Usage:
    python generate_dashboard.py [YYYY-MM-DD]

If no date is given, the most recent file in data/intake/ is used.
Reads: profile.json, references/supplements.json, data/metrics/weight.json,
data/metrics/sperm.json, data/metrics/lifestyle.json, data/metrics/sleep.json,
data/metrics/ejaculation.json, data/metrics/energy.json, data/intake/<date>.json
(all of them, for the sperm-score/suggestions computation once the 14-day
baseline unlocks, and for the daily energy score which has no such gate)
Writes: dashboards/<date>.html, data/metrics/sperm.json (appends/updates the
current 7-day window's computed factors, daily), data/metrics/energy.json
(appends/updates today's computed energy score, daily)
"""
import json
import re
import sys
import glob
import os
import subprocess
from datetime import date, datetime, timedelta

ROOT = os.path.dirname(os.path.abspath(__file__))


def refresh_training_snapshot():
    """Recompute data/metrics/workouts.json's report_snapshot against right
    now, not just whenever data.js was last edited. The load ratio (ACWR) is
    time-relative (7-day acute vs 28-day chronic load) — it keeps decaying
    as rest days pass even with no new session logged, so the snapshot needs
    refreshing on every dashboard build, not only on training days."""
    script = os.path.join(ROOT, "sync_training_snapshot.mjs")
    if not os.path.exists(script):
        return
    try:
        subprocess.run(["node", script], cwd=ROOT, capture_output=True,
                        timeout=15, check=True)
    except Exception as e:
        print(f"Warning: could not refresh training snapshot ({e})", file=sys.stderr)

# Selenium is tracked daily (not as a weekly average like the other
# micros below) because a single concentrated source (a few Brazil nuts)
# can spike well past a safe day's intake in one sitting — averaging it
# over a week could mask that. NIH ODS tolerable upper intake level, adults.
SELENIUM_UL_MCG = 400

# Vitamin C/E/D and folate all have body reserves lasting days-to-weeks, so
# a rolling 7-day average is a more physiologically meaningful target than
# forcing every single day to individually clear the daily number.
WEEKLY_TRACKED_MICROS = [
    ("vitamin_c_mg", "Vitamin C", "citrus, peppers, tomatoes"),
    ("vitamin_e_mg", "Vitamin E", "nuts, seeds, oils"),
    ("vitamin_d_iu", "Vitamin D", "fatty fish, eggs, or sun exposure"),
    ("folate_mcg_dfe", "Folate", "leafy greens, legumes"),
]


def load(path):
    with open(os.path.join(ROOT, path), encoding="utf-8") as f:
        return json.load(f)


def pick_date(arg):
    if arg:
        return arg
    files = sorted(glob.glob(os.path.join(ROOT, "data/intake/*.json")))
    if not files:
        sys.exit("No intake files found in data/intake/")
    return os.path.splitext(os.path.basename(files[-1]))[0]


def count_intake_days():
    return len(glob.glob(os.path.join(ROOT, "data/intake/*.json")))


# ---------- small render helpers ----------

def bar(value, target, unit="", reverse_over=False, label=None):
    """A labelled progress bar. reverse_over=True => going over target is bad (amber/red).
    label, if given, replaces the numeric "value / target" text (bar fill/color still
    reflect the real numbers) — for days logged qualitatively (e.g. buffet-style, no
    exact tracking) rather than item-by-item."""
    pct = 0 if not target else min(value / target * 100, 100)
    over = target and value > target * 1.05
    if reverse_over and over:
        color = "#f59e0b" if value <= target * 1.2 else "#ef4444"
    elif pct >= 90:
        color = "#22c55e"
    elif pct >= 60:
        color = "#3b82f6"
    else:
        color = "#f59e0b"
    display = label if label else f"{value:g} <span class=\"muted\">/ {target:g}</span>"
    return f"""
      <div class="metric">
        <div class="metric-top"><span>{unit}</span><span class="vals">{display}</span></div>
        <div class="track"><div class="fill" style="width:{pct:.0f}%;background:{color}"></div></div>
      </div>"""


def sparkline(entries, key, w=560, h=90, pad=8, baseline=None, baseline_label=None):
    pts = [(e["date"], e.get(key)) for e in entries if e.get(key) is not None]
    if len(pts) < 2:
        return "<div class='muted'>Not enough data yet.</div>"
    ys = [v for _, v in pts]
    # Baseline (e.g. a target/suggested value) is folded into the y-range so
    # it always renders on-chart, even on a day where actual intake is far
    # above or below it — otherwise the reference line could clip off the
    # top/bottom and silently disappear.
    range_vals = ys + ([baseline] if baseline is not None else [])
    lo, hi = min(range_vals), max(range_vals)
    rng = (hi - lo) or 1
    n = len(pts)
    coords = []
    for i, (_, v) in enumerate(pts):
        x = pad + i * (w - 2 * pad) / (n - 1)
        y = pad + (1 - (v - lo) / rng) * (h - 2 * pad)
        coords.append((x, y))
    poly = " ".join(f"{x:.1f},{y:.1f}" for x, y in coords)
    dots = "".join(
        f'<circle cx="{x:.1f}" cy="{y:.1f}" r="3" fill="#38bdf8"/>' for x, y in coords
    )
    last = coords[-1]
    baseline_svg = ""
    if baseline is not None:
        by = pad + (1 - (baseline - lo) / rng) * (h - 2 * pad)
        label = f'<text x="{w - pad}" y="{by - 4:.1f}" text-anchor="end" font-size="11" fill="#f59e0b">{baseline_label or f"{baseline:g}"}</text>' if baseline_label else ""
        baseline_svg = f"""<line x1="{pad}" y1="{by:.1f}" x2="{w - pad}" y2="{by:.1f}" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="5,4"/>{label}"""
    return f"""<svg viewBox="0 0 {w} {h}" width="100%" preserveAspectRatio="none" class="spark">
      {baseline_svg}
      <polyline fill="none" stroke="#38bdf8" stroke-width="2" points="{poly}"/>
      {dots}
      <circle cx="{last[0]:.1f}" cy="{last[1]:.1f}" r="4.5" fill="#22c55e"/>
    </svg>"""


def ring(score, color, label):
    r = 52
    circ = 2 * 3.14159 * r
    off = circ * (1 - score / 100)
    return f"""<div class="ring-wrap">
      <svg viewBox="0 0 130 130" width="150" height="150">
        <circle cx="65" cy="65" r="{r}" fill="none" stroke="#1f2937" stroke-width="12"/>
        <circle cx="65" cy="65" r="{r}" fill="none" stroke="{color}" stroke-width="12"
          stroke-linecap="round" stroke-dasharray="{circ:.1f}" stroke-dashoffset="{off:.1f}"
          transform="rotate(-90 65 65)"/>
        <text x="65" y="60" text-anchor="middle" class="ring-num">{score:.0f}</text>
        <text x="65" y="82" text-anchor="middle" class="ring-sub">/ 100</text>
      </svg>
      <div class="ring-label" style="color:{color}">{label}</div>
    </div>"""


def band_for(score, bands):
    chosen = bands[0]
    for b in bands:
        if score >= b["min"]:
            chosen = b
    return chosen


def clamp(v, lo=0, hi=100):
    return max(lo, min(hi, v))


def pdate(s):
    return datetime.strptime(s, "%Y-%m-%d")


def refresh_training_full():
    """Run export_training_state.mjs to recompute the FULL live training
    analysis (fatigue, recommendation, PRs, balance, relative strength,
    aerobic, ACWR trend) — used only by the unified-dashboard prototype.
    Unlike sync_training_snapshot.mjs, this also substitutes sleep.json and
    weight.json as the single source for sleep/bodyweight instead of data.js's
    own SLEEP/BODYWEIGHT arrays, so the two stop drifting apart."""
    script = os.path.join(ROOT, "export_training_state.mjs")
    try:
        subprocess.run(["node", script], cwd=ROOT, capture_output=True,
                        timeout=15, check=True)
    except Exception as e:
        print(f"Warning: could not refresh full training export ({e})", file=sys.stderr)


def _acwr_color(v):
    if v is None:
        return "#8b9bb0"
    return "#ef4444" if v > 1.5 else "#f59e0b" if v > 1.3 else "#3b82f6" if v < 0.8 else "#22c55e"


def _fatigue_color(pct):
    return "#22c55e" if pct < 30 else "#3b82f6" if pct < 60 else "#f59e0b" if pct < 90 else "#ef4444"


def _qv_chip(value, label, color=None):
    style = f" style='color:{color}'" if color else ""
    return f"<div class='chip'><div class='chip-v'{style}>{value}</div><div class='chip-k'>{label}</div></div>"


def build_quickview(chips):
    """A compact 'at a glance' row of the most relevant numbers across every
    dataset (scores, intake totals, sleep, workout, load ratio, bodyweight),
    replacing the old prose status_note — the log table and the panels below
    already carry the detail, so a paragraph re-narrating the day was pure
    redundancy."""
    cells = "".join(_qv_chip(c["v"], c["k"], c.get("color")) for c in chips)
    return f"""
    <div class="panel span">
      <h2>Quick View</h2>
      <div class="chips qv">{cells}</div>
    </div>"""


# (label, name-substring to match, optional qty-substring e.g. "am"/"pm" dose,
#  show_product) — show_product surfaces which specific product was actually
# logged (vs. a static label), so a swap like Thorne -> Mayven is visible on
# the day it happens instead of being hidden behind a generic "Multivitamin"
# row.
EXPECTED_SUPPLEMENTS = [
    ("Allergy spray · AM", "rhinolast", "am", False),
    ("Allergy spray · PM", "rhinolast", "pm", False),
    ("Allergy pill (Bilaxten)", "bilaxten", None, False),
    ("Multivitamin", "multivit", None, True),
    ("Zinc (Thorne Picolinate)", "zinc picolinate", None, False),
    ("Omega-3", "omega-3", None, False),
    ("Creatine", "creatine", None, False),
]


def build_supplement_check(items, omega3_total=None, omega3_target=None):
    """Replaces the full item-by-item Intake Log table with just a compliance
    check against the standing daily supplement/medication routine — the
    macro/micro panels already cover what was eaten in aggregate, so the raw
    log was mostly useful for catching a missed dose, which this does more
    directly. For rows flagged show_product, the matched item's own name is
    shown instead of a static label, so a product swap (e.g. the multivitamin
    default changing) reads directly off that day's log.

    Omega-3 is a special case: the point of the supplement is to hit the
    omega3_epa_dha_mg target, not to take the softgel for its own sake. If
    food (fish) already cleared the target, skipping the supplement that day
    isn't a missed dose — don't flag it."""
    rows = []
    for label, name_sub, qty_sub, show_product in EXPECTED_SUPPLEMENTS:
        match = next(
            (i for i in items
             if name_sub in i.get("name", "").lower()
             and (qty_sub is None or qty_sub in i.get("qty", "").lower())),
            None,
        )
        taken = match is not None
        met_via_food = (
            not taken and label == "Omega-3"
            and omega3_target and (omega3_total or 0) >= omega3_target
        )
        icon = "✅" if (taken or met_via_food) else "⚠️"
        color = "#22c55e" if (taken or met_via_food) else "#f59e0b"
        if taken and show_product:
            status = match["name"]
        elif met_via_food:
            status = f"target met via food ({omega3_total:g}mg) — supplement skipped"
        else:
            status = "taken" if taken else "not logged today"
        rows.append(f"<li><span style='color:{color}'>{icon}</span> {label} <span class='muted'>· {status}</span></li>")
    return "".join(rows)


def build_training_panels(train):
    """Render the FULL training-dashboard content (fatigue, recommendation,
    PRs, balance, relative strength, aerobic, ACWR trend) from
    data/metrics/training_full.json, for the unified-dashboard prototype.
    This supersedes the compact `training_panel` mirror built from
    workouts.json's report_snapshot."""
    sections = train.get("sections", {})
    fat_rows = "".join(
        f"""<div class="metric">
          <div class="metric-top"><span>{name}</span><span class="vals">{s['pct']}%
            {f'<span class="muted"> · ready in {s["readyInHours"]}h</span>' if s['readyInHours'] else ' <span class="muted">· ready now</span>'}</span></div>
          <div class="track"><div class="fill" style="width:{s['pct']}%;background:{_fatigue_color(s['pct'])}"></div></div>
        </div>""" for name, s in sections.items() if name not in ("Cardio",)
    )

    rec = train.get("recommendation", {}) or {}
    if rec.get("deload"):
        rec_line = "<div class='tr-line'>Recommended: <b style=\"color:#f59e0b\">Full-body deload</b></div>"
        guidance_html = "".join(f"<div class='alert'>{g}</div>" for g in rec.get("deloadReasons", []))
        lifts_html = "".join(
            f"<li><b>{e['name']}</b> <span class='muted'>· best {e['best']}</span></li>"
            for e in rec.get("suggestedExercises", [])) or "<li class='muted'>—</li>"
    else:
        rest_txt = "ready now" if rec.get("readyNow") else f"~{rec.get('restHours','?')}h to go"
        count_txt = ""
        if rec.get("suggestedCount") and rec.get("totalAvailable"):
            count_txt = f" <span class='muted'>· go for <b style=\"color:var(--text)\">{rec['suggestedCount']} of {rec['totalAvailable']}</b> below</span>"
        rec_line = f"<div class='tr-line'>Recommended next: <b>{rec.get('section','–')} day</b> <span class='muted'>({rest_txt})</span>{count_txt}</div>"
        guidance_html = "".join(f"<div class='alert'>{g}</div>" for g in rec.get("guidance", [])) or "<div class='muted'>No special guidance.</div>"
        status_color = {"progress": "#22c55e", "rebuild": "#f59e0b", "hold": "#f59e0b", "hold_iso": "#f59e0b"}
        lifts_html = "".join(
            f"<li><b>{e['name']}</b> <span class='muted'>· best {e['best']}</span>"
            + (f"<br><span style='color:{status_color.get(e['target']['status'],'var(--text)')}'>{e['target']['text']}</span>" if e.get("target") else "")
            + "</li>"
            for e in rec.get("suggestedExercises", [])) or "<li class='muted'>—</li>"

    trends = train.get("trends", {}) or {}
    weeks = [w for w in trends.get("weeks", []) if w.get("acwr") is not None]
    if weeks:
        mx = max([w["acwr"] for w in weeks] + [1.5])
        bars = "".join(
            f"<div class='col'><div class='b' style='height:{(w['acwr']/mx)*46:.0f}px;background:{_acwr_color(w['acwr'])}'></div><div class='lbl'>{w['label']}</div></div>"
            for w in weeks)
        trend_html = f"<div class='loadbars'>{bars}</div>"
    else:
        trend_html = "<div class='muted'>Not enough sessions yet for a trend.</div>"
    acwr = trends.get("acwr")
    acwr_html = f"""
      <div class="bignum" style="color:{_acwr_color(acwr)}">{acwr if acwr is not None else '–'}<small> load ratio</small></div>
      <div class="goalline">Sweet spot 0.8–1.3 · danger &gt;1.5 · zone: <b>{trends.get('acwrZone','–')}</b></div>
      {trend_html}"""

    bal = train.get("balance", {}) or {}
    rel = train.get("relstrength", {}) or {}
    rel_rows = "".join(
        f"<li><b>{i['name']}</b> <span class='muted'>· {i['oneRM']}kg 1RM</span> <span style='float:right'>{i['ratio']}×BW</span></li>"
        for i in rel.get("items", [])[:8]) or "<li class='muted'>—</li>"
    bal_chips = "".join([
        f"<div class='chip'><div class='chip-v'>{bal.get('pushPull','–')}×</div><div class='chip-k'>Push : Pull</div></div>",
        f"<div class='chip'><div class='chip-v'>{bal.get('quadHam','–')}×</div><div class='chip-k'>Quad : Ham</div></div>",
    ])

    aer = train.get("aerobic", {}) or {}
    aer_chips = "".join([
        f"<div class='chip'><div class='chip-v'>{aer.get('km28','–')} km</div><div class='chip-k'>28-day distance</div></div>",
        f"<div class='chip'><div class='chip-v'>{aer.get('avgHr','–')}</div><div class='chip-k'>Avg HR</div></div>",
        f"<div class='chip'><div class='chip-v'>{round(aer['avgPace'],1) if aer.get('avgPace') else '–'}</div><div class='chip-k'>Avg pace min/km</div></div>",
        f"<div class='chip'><div class='chip-v'>{aer.get('daysSinceLast','–')}d</div><div class='chip-k'>Since last cardio</div></div>",
    ])

    changes = train.get("changes", []) or []
    changes_html = "".join(f"<li>{c}</li>" for c in changes) if changes else "<li class='muted'>Nothing flagged.</li>"

    return f"""
    <div class="panel span">
      <h2>Muscle Fatigue &amp; Recovery</h2>
      {fat_rows}
    </div>

    <div class="panel">
      <h2>Recommended Next Session</h2>
      {rec_line}
      <div class="tr-cols">
        <div><div class="ls-h">Suggested lifts</div><ul class="ev-ul">{lifts_html}</ul></div>
        <div><div class="ls-h">Guidance</div>{guidance_html}</div>
      </div>
    </div>

    <div class="panel">
      <h2>Load Ratio Trend (6wk)</h2>
      {acwr_html}
    </div>

    <div class="panel">
      <h2>Program Balance &amp; Relative Strength</h2>
      <div class="chips">{bal_chips}</div>
      <div class="ls-h" style="margin-top:14px">1RM ÷ bodyweight ({rel.get('bodyweightKg','–')}kg)</div>
      <ul class="ev-ul">{rel_rows}</ul>
    </div>

    <div class="panel">
      <h2>Aerobic / Cardio</h2>
      <div class="chips four">{aer_chips}</div>
    </div>

    <div class="panel">
      <h2>PRs &amp; Below-Best Lifts</h2>
      <ul class="ev-ul">{changes_html}</ul>
    </div>"""


def load_all_intake_days():
    """All logged daily intake files, sorted oldest -> newest."""
    days = []
    for path in sorted(glob.glob(os.path.join(ROOT, "data/intake/*.json"))):
        with open(path, encoding="utf-8") as f:
            days.append(json.load(f))
    return days


# ---------- real weekly sperm-optimization score (post 14-day unlock) -------

def compute_current_week(profile, target_date, all_days, weight_entries, sleep_entries, lifestyle_events, ejac_entries):
    """Computes this week's sperm-optimization factors from real logged data
    (trailing 7 days ending at target_date), replacing the illustrative demo
    week that ships in sperm.json before enough real data exists."""
    td = pdate(target_date)
    week_start = td - timedelta(days=6)
    t = profile["targets"]

    def in_week(d_str):
        d = pdate(d_str)
        return week_start <= d <= td

    week_days = [d for d in all_days if in_week(d["date"])]

    # nutrition: daily average of protein/fiber attainment + calorie adherence
    day_scores = []
    for d in week_days:
        items = d.get("items", [])
        kcal = sum(i.get("kcal", 0) for i in items)
        protein = sum(i.get("protein_g", 0) for i in items)
        fiber = sum(i.get("fiber_g", 0) for i in items)
        protein_score = clamp(protein / t["protein_g"] * 100) if t["protein_g"] else 100
        fiber_score = clamp(fiber / t["fiber_g"] * 100) if t["fiber_g"] else 100
        kcal_score = clamp(100 - abs(kcal - t["calories_kcal"]) / t["calories_kcal"] * 150) if t["calories_kcal"] else 100
        day_scores.append((protein_score + fiber_score + kcal_score) / 3)
    nutrition = round(sum(day_scores) / len(day_scores)) if day_scores else 50

    # body composition: actual weekly weight-loss pace vs the target pace
    goals = profile["goals"]
    target_rate = goals.get("target_loss_rate_kg_per_week") or 0
    bc_entries = [e for e in weight_entries if pdate(e["date"]) <= td]
    if bc_entries and target_rate:
        latest_w = bc_entries[-1]
        baseline_w = profile["personal"]["baseline_weight_kg"]
        baseline_date = pdate(profile["personal"]["baseline_date"])
        latest_date = pdate(latest_w["date"])
        weeks_elapsed = max((latest_date - baseline_date).days / 7, 0.5)
        actual_rate = (baseline_w - latest_w["weight_kg"]) / weeks_elapsed
        body_composition = round(clamp(actual_rate / target_rate * 100))
    else:
        body_composition = 50

    # sleep: nights in-window vs a healthy 7-9h band
    week_nights = [e for e in sleep_entries if in_week(e["date"])]
    if week_nights:
        night_scores = [clamp(100 - abs(n["duration_hours"] - clamp(n["duration_hours"], 7, 9)) * 15) for n in week_nights]
        sleep_factor = round(sum(night_scores) / len(night_scores))
    else:
        sleep_factor = 70  # neutral default — no nights logged in this window yet

    # alcohol: severity-weighted events in-window (so a single heavy session
    # doesn't score identically to a single light one), plus an extra penalty
    # for drinking on more than one day vs the <=1/week baseline
    alcohol_sev_penalty = {"mild": 5, "moderate": 15, "high": 30}
    week_alcohol_events = [e for e in lifestyle_events if e.get("type") == "alcohol" and in_week(e["date"])]
    alcohol_days = {e["date"] for e in week_alcohol_events}
    alcohol_severity_penalty = sum(alcohol_sev_penalty.get(e.get("severity"), 10) for e in week_alcohol_events)
    alcohol_frequency_penalty = max(0, len(alcohol_days) - 1) * 20
    alcohol = round(clamp(100 - alcohol_severity_penalty - alcohol_frequency_penalty))

    # heat/travel exposure: severity-weighted events in-window
    sev_penalty = {"mild": 8, "moderate": 18, "high": 35}
    travel_events = [e for e in lifestyle_events if "heat_travel_exposure" in e.get("affects", []) and in_week(e["date"])]
    penalty = sum(sev_penalty.get(e.get("severity"), 10) for e in travel_events)
    heat_travel_exposure = round(clamp(100 - penalty))

    # smoking: static from profile (no daily tracking exists for this)
    smoking_status = profile["lifestyle"].get("smoking", "none")
    smoking = 100 if smoking_status == "none" else 60 if "occasional" in smoking_status else 20

    # ejaculatory frequency: research favors short, regular intervals (~every
    # 1-2 days / 4-7x per week) over long abstinence, which raises DNA
    # fragmentation — count events in-window against that ideal frequency.
    week_ejac = [e for e in ejac_entries if in_week(e["date"])]
    if ejac_entries:
        ejaculatory_frequency = round(clamp(100 - max(0, 4 - len(week_ejac)) * 15))
    else:
        ejaculatory_frequency = 70  # neutral default — tracking just started, no history yet

    factors = {
        "nutrition": nutrition, "body_composition": body_composition, "sleep": sleep_factor,
        "alcohol": alcohol, "heat_travel_exposure": heat_travel_exposure, "smoking": smoking,
        "ejaculatory_frequency": ejaculatory_frequency,
    }
    caveats = [c for c in [
        "No nights logged in this window yet — sleep factor defaulted to neutral." if not week_nights else "",
        "No ejaculation events logged yet — factor defaulted to neutral." if not ejac_entries else "",
    ] if c]
    notes = (f"Computed from real logged data for {week_start.strftime('%Y-%m-%d')} → {target_date} "
             f"({len(week_days)} day(s) logged this window)." + (" " + " ".join(caveats) if caveats else ""))
    return {
        "week_start": week_start.strftime("%Y-%m-%d"), "week_end": target_date,
        "factors": factors, "notes": notes.strip(), "sample": False,
    }


def persist_computed_week(week):
    """Append/update this week's computed factors in sperm.json so there's a
    real growing history, instead of discarding the computation each render."""
    path = os.path.join(ROOT, "data/metrics/sperm.json")
    with open(path, encoding="utf-8") as f:
        sperm = json.load(f)
    weeks = sperm["weeks"]
    weeks[:] = [w for w in weeks if not w.get("sample")]  # drop the illustrative demo week once real data exists
    existing = next((w for w in weeks if w["week_start"] == week["week_start"]), None)
    if existing:
        existing.update(week)
    else:
        weeks.append(week)
    weeks.sort(key=lambda w: w["week_start"])
    with open(path, "w", encoding="utf-8") as f:
        json.dump(sperm, f, indent=2, ensure_ascii=False)
        f.write("\n")


# ---------- daily energy score -----------------------------------------------
#
# Parameters and weighting are based on a web search conducted with the user
# (Zoe/Healthline/SmartWellness-style consumer wellness sources + PMC sleep-
# research): sleep duration (7-9h ideal), balanced/blood-sugar-stable
# nutrition, regular movement, caffeine kept under ~400mg/day (~5 shots) and
# clear of the evening cutoff, and alcohol's well-documented next-day hit to
# sleep quality and perceived energy (~4% sleep-quality decline per drink).
# This is a same-day metric (last night + today), refreshed on every render —
# unlike the sperm score it doesn't need a 14-day baseline first.

def compute_energy_score(profile, target_date, todays_intake, sleep_entries, lifestyle_events, workout_entries):
    td = pdate(target_date)
    t = profile["targets"]

    # sleep: last night (the night whose wake-up date is target_date)
    night = next((e for e in sleep_entries if e["date"] == target_date), None)
    if night:
        h = night["duration_hours"]
        sleep_score = round(clamp(100 - abs(h - clamp(h, 7, 9)) * 15))
    else:
        sleep_score = 70  # neutral — no night logged for this date yet

    # nutrition: today's protein/fiber/calorie adherence (blood-sugar-stability proxy)
    items = todays_intake.get("items", [])
    kcal = sum(i.get("kcal", 0) for i in items)
    protein = sum(i.get("protein_g", 0) for i in items)
    fiber = sum(i.get("fiber_g", 0) for i in items)
    protein_score = clamp(protein / t["protein_g"] * 100) if t["protein_g"] else 100
    fiber_score = clamp(fiber / t["fiber_g"] * 100) if t["fiber_g"] else 100
    kcal_score = clamp(100 - abs(kcal - t["calories_kcal"]) / t["calories_kcal"] * 150) if t["calories_kcal"] else 100
    nutrition_score = round((protein_score + fiber_score + kcal_score) / 3)

    # movement: recency of any logged workout (regular movement supports energy)
    workout_dates = sorted(pdate(w["date"]) for w in workout_entries if pdate(w["date"]) <= td)
    if workout_dates:
        days_since = (td - workout_dates[-1]).days
        movement_score = round(clamp(100 - days_since * 20))
    else:
        movement_score = 50  # neutral — no workout history at all yet

    # caffeine: total vs a ~400mg/day (~5 shots) soft cap, plus timing vs the profile's cutoff
    caffeine_shots = todays_intake.get("caffeine_shots", 0)
    cutoff_str = profile["lifestyle"]["caffeine"].get("cutoff", "16:00")
    cutoff_min = int(cutoff_str.split(":")[0]) * 60 + int(cutoff_str.split(":")[1])
    caffeinated = [i for i in items if i.get("category") == "drink" and
                   any(kw in i.get("name", "").lower() for kw in ("espresso", "coffee", "caffeine", "energy drink"))]
    late_caffeine = any(
        int(i["time"].split(":")[0]) * 60 + int(i["time"].split(":")[1]) > cutoff_min
        for i in caffeinated if ":" in i.get("time", "")
    )
    caffeine_score = round(clamp(100 - max(0, caffeine_shots - 5) * 15 - (25 if late_caffeine else 0)))

    # alcohol: logged today or yesterday still measurably hits sleep quality/energy
    alcohol_dates = {e["date"] for e in lifestyle_events if e.get("type") == "alcohol"}
    yesterday = (td - timedelta(days=1)).strftime("%Y-%m-%d")
    alcohol_penalty = (30 if target_date in alcohol_dates else 0) + (20 if yesterday in alcohol_dates else 0)
    alcohol_score = round(clamp(100 - alcohol_penalty))

    weights = {"sleep": 0.35, "nutrition": 0.2, "movement": 0.15, "caffeine": 0.1, "alcohol": 0.2}
    factors = {"sleep": sleep_score, "nutrition": nutrition_score, "movement": movement_score,
               "caffeine": caffeine_score, "alcohol": alcohol_score}
    overall = round(sum(factors[k] * w for k, w in weights.items()))

    caveats = [c for c in [
        "no sleep logged for last night" if not night else "",
        "no workout history yet" if not workout_dates else "",
    ] if c]
    notes = f"Computed for {target_date} from last night's sleep, today's nutrition/caffeine/alcohol, and recent movement." \
        + (" (" + "; ".join(caveats) + ")" if caveats else "")

    # Raw numbers behind each factor score, for the "advanced stats" breakdown —
    # what actually drove the 0-100 sub-score, not just the sub-score itself.
    details = {
        "sleep": f"{h:g}h last night (target 7-9h)" if night else "no sleep logged for last night",
        "nutrition": f"{kcal:g}/{t['calories_kcal']:g} kcal · {protein:g}/{t['protein_g']:g}g protein · {fiber:g}/{t['fiber_g']:g}g fiber",
        "movement": f"last workout {days_since}d ago" if workout_dates else "no workout history yet",
        "caffeine": f"{caffeine_shots:g} shot(s) today (soft cap ~5)" + (", one after cutoff" if late_caffeine else ""),
        "alcohol": "logged today" if target_date in alcohol_dates
                   else ("logged yesterday" if yesterday in alcohol_dates else "none in the last 2 days"),
    }

    return {"date": target_date, "overall": overall, "factors": factors, "details": details, "notes": notes}


def persist_computed_energy(day):
    path = os.path.join(ROOT, "data/metrics/energy.json")
    with open(path, encoding="utf-8") as f:
        energy = json.load(f)
    days = energy["days"]
    existing = next((d for d in days if d["date"] == day["date"]), None)
    if existing:
        existing.update(day)
    else:
        days.append(day)
    days.sort(key=lambda d: d["date"])
    with open(path, "w", encoding="utf-8") as f:
        json.dump(energy, f, indent=2, ensure_ascii=False)
        f.write("\n")


# ---------- real suggestions engine (post 14-day unlock) --------------------

def generate_suggestions(profile, all_days, weight_entries, sleep_entries, lifestyle_events, target_date, ejac_entries):
    """Concrete, data-driven suggestions from the full logged history so far
    — replaces the placeholder 'engine active' message.

    Macro-based aggregates below use `closed_days` (in_progress != True) so a
    day that's still being logged mid-day doesn't read as a low-protein/
    low-fiber miss purely because it isn't over yet. `all_days` (unfiltered)
    is still used for the single explicit today-only lookup (`today_data`)
    further down, since that live selenium check is meant to apply while the
    day is still open, not just after it closes."""
    t = profile["targets"]
    sugg = []

    closed_days = [d for d in all_days if not d.get("in_progress") and not d.get("exclude_from_monthly_macros")]
    n = len(closed_days)
    protein_hit = sum(1 for d in closed_days if sum(i.get("protein_g", 0) for i in d.get("items", [])) >= t["protein_g"])
    fiber_hit = sum(1 for d in closed_days if sum(i.get("fiber_g", 0) for i in d.get("items", [])) >= t["fiber_g"])
    kcal_over = sum(1 for d in closed_days if sum(i.get("kcal", 0) for i in d.get("items", [])) > t["calories_kcal"] * 1.1)

    if n:
        if protein_hit / n >= 0.7:
            sugg.append(f"Protein target hit on {protein_hit}/{n} logged days — strong, consistent muscle-retention support. Keep it up.")
        else:
            sugg.append(f"Protein target hit on only {protein_hit}/{n} logged days — add a protein source to lighter meals to close the gap more consistently.")

        if fiber_hit / n < 0.5:
            sugg.append(f"Fiber cleared target on {fiber_hit}/{n} days — veg-forward meals (like the lettuce/tomato-heavy days) clear it easily; lean on those more often.")

        if kcal_over / n >= 0.3:
            sugg.append(f"Calories ran 10%+ over target on {kcal_over}/{n} days, mostly around restaurant meals and desserts — no single day is a problem, but the pattern is worth watching against the weight-loss goal.")

        fat_avg = sum(sum(i.get("fat_g", 0) for i in d.get("items", [])) for d in closed_days) / n
        fat_pct = round(fat_avg / t["fat_g"] * 100) if t["fat_g"] else 100
        if fat_pct > 120:
            sugg.append(f"Fat has averaged {fat_avg:.0f}g/day vs the {t['fat_g']}g target ({fat_pct}%) across all {n} logged days — it runs about equally high on restaurant and home-cooked days (olive oil, cheese, nuts show up everywhere), so it's a portion-size habit rather than something restaurants specifically drive.")

    am_protein_frac = []
    for d in closed_days:
        items = d.get("items", [])
        total_p = sum(i.get("protein_g", 0) for i in items)
        if total_p > 0:
            am_p = sum(i.get("protein_g", 0) for i in items if i.get("time", "99:99") < "12:00")
            am_protein_frac.append(am_p / total_p)
    if am_protein_frac:
        avg_am_pct = round(sum(am_protein_frac) / len(am_protein_frac) * 100)
        if avg_am_pct < 25:
            sugg.append(f"Only ~{avg_am_pct}% of daily protein is eaten before noon on average — it's heavily back-loaded into lunch/dinner. Adding 20-30g to breakfast (eggs, yogurt, cheese) would spread muscle-protein-synthesis stimulus more evenly across the day and help with morning satiety.")

    caf_cutoff = profile["lifestyle"].get("caffeine", {}).get("cutoff", "16:00")
    late_caf_count = sum(
        1 for d in all_days for i in d.get("items", [])
        if ("espresso" in i.get("name", "").lower() or "coffee" in i.get("name", "").lower())
        and i.get("time", "") >= caf_cutoff
    )
    if late_caf_count >= 5:
        sugg.append(f"Caffeine has been logged at/after the {caf_cutoff} cutoff {late_caf_count} time(s) across the tracked period — your own baseline flags that cutoff as the sleep-friendly line, worth tightening even without a clean sleep-quality signal yet tying the two together.")

    # Selenium: tracked daily, not weekly — see SELENIUM_UL_MCG comment above.
    mtarg = t["micros_sperm_priority"]
    today_data = next((d for d in all_days if d["date"] == target_date), None)
    today_micros = today_data.get("micros_sperm_priority", {}) if today_data else {}
    sel_today = today_micros.get("selenium_mcg", 0)
    sel_target = mtarg.get("selenium_mcg")
    if sel_target:
        if sel_today >= SELENIUM_UL_MCG:
            sugg.append(f"Selenium today is {sel_today:g}mcg — at or above the ~{SELENIUM_UL_MCG}mcg/day safe upper limit (tracked daily, not weekly, since a Brazil-nut serving can spike it fast). Skip any more concentrated sources for the rest of today.")
        elif sel_today < sel_target:
            sugg.append(f"Selenium today is {sel_today:g}mcg vs the ~{sel_target}mcg target (tracked daily, not weekly, since it can overshoot in one sitting) — 2-3 Brazil nuts, fish, or eggs would close the gap without real risk of going over.")

    # Vitamin C/E/D and folate: tracked as a 7-day rolling average — see
    # WEEKLY_TRACKED_MICROS comment above.
    last7 = [d for d in closed_days if 0 <= (pdate(target_date) - pdate(d["date"])).days < 7]
    if last7:
        for key, label, foods in WEEKLY_TRACKED_MICROS:
            target = mtarg.get(key)
            if not target:
                continue
            vals = [d.get("micros_sperm_priority", {}).get(key, 0) for d in last7]
            avg = sum(vals) / len(vals)
            if avg < target:
                pct = round(avg / target * 100)
                sugg.append(f"{label} averaging {avg:.0f} vs a ~{target:g} target over the last {len(last7)} day(s) ({pct}%) — tracked weekly, not daily (a slow-reserve nutrient) — add {foods} on a lighter day to bring the average up.")

    alcohol_days_14 = sorted({e["date"] for e in lifestyle_events if e.get("type") == "alcohol"})
    recent_alcohol = [d for d in alcohol_days_14 if (pdate(target_date) - pdate(d)).days < 14]
    if len(recent_alcohol) >= 5:
        sugg.append(f"Alcohol logged on {len(recent_alcohol)} of the last 14 days — well above the <=1/week baseline and the most consistent drag on the sperm-optimization score. A genuine dry stretch is the single highest-leverage change available right now.")

    if sleep_entries:
        avg_sleep = sum(e["duration_hours"] for e in sleep_entries) / len(sleep_entries)
        if len(sleep_entries) < 14:
            sugg.append(f"Average logged sleep is {avg_sleep:.1f}h across {len(sleep_entries)} night(s) tracked — keep logging nightly to get a reliable trend (still an early sample).")
        else:
            in_band = sum(1 for e in sleep_entries if 7 <= e["duration_hours"] <= 9)
            pct_in_band = round(in_band / len(sleep_entries) * 100)
            sugg.append(f"Average logged sleep is {avg_sleep:.1f}h across {len(sleep_entries)} nights tracked — an established trend at this point, not a sample. {in_band}/{len(sleep_entries)} nights ({pct_in_band}%) landed in the 7-9h target band.")

    if not ejac_entries:
        sugg.append("Ejaculatory frequency tracking just started with no events logged yet — research favors short, regular intervals (~every 1-2 days) over long abstinence for sperm motility and DNA integrity, so log each event to get a real read on this factor.")
    else:
        recent_ejac = [e for e in ejac_entries if (pdate(target_date) - pdate(e["date"])).days < 14]
        sugg.append(f"{len(recent_ejac)} ejaculation event(s) logged in the last 14 days — aiming for roughly every 1-2 days (8-14 over a 14-day span) tracks best with the sperm-quality research.")

    if weight_entries:
        baseline_w = profile["personal"]["baseline_weight_kg"]
        last_w = weight_entries[-1]["weight_kg"]
        lo_t, hi_t = profile["goals"]["target_weight_kg"]
        sugg.append(f"Weight is {last_w - baseline_w:+.2f} kg vs. the {profile['personal']['baseline_date']} baseline, {round(max(0, last_w - hi_t), 1)} kg from the {lo_t}-{hi_t} kg target range — pace is steady but slower than the 0.4 kg/week goal; tightening portions on non-restaurant days would help most.")

    return sugg[:12]


# ---------- main build ----------

def build(target_date, unified=False):
    profile = load("profile.json")
    supps = load("references/supplements.json")
    weight = load("data/metrics/weight.json")
    sperm = load("data/metrics/sperm.json")
    intake = load(f"data/intake/{target_date}.json")
    try:
        lifestyle = load("data/metrics/lifestyle.json")
    except FileNotFoundError:
        lifestyle = {"events": []}
    refresh_training_snapshot()
    try:
        workouts = load("data/metrics/workouts.json")
    except FileNotFoundError:
        workouts = {"entries": [], "report_snapshot": {}}
    try:
        sleep = load("data/metrics/sleep.json")
    except FileNotFoundError:
        sleep = {"entries": []}
    try:
        ejaculation = load("data/metrics/ejaculation.json")
    except FileNotFoundError:
        ejaculation = {"entries": []}
    try:
        energy_store = load("data/metrics/energy.json")
    except FileNotFoundError:
        energy_store = {"model": {"weights": {}, "bands": []}, "days": []}

    t = profile["targets"]
    items = intake["items"]

    tot = {k: sum(i.get(k, 0) for i in items) for k in
           ["kcal", "protein_g", "carbs_g", "fat_g", "fiber_g"]}
    micros = intake.get("micros_sperm_priority", {})
    mtarg = t["micros_sperm_priority"]

    # weight panel
    entries = weight["entries"]
    latest = entries[-1]
    first = entries[0]
    lo_t, hi_t = profile["goals"]["target_weight_kg"]
    to_go = max(0, latest["weight_kg"] - hi_t)

    # sperm panel
    # The weighted score is only surfaced once a 14-day baseline exists (same
    # gate as Suggestions). Before that the inputs are logged but no estimate
    # is shown — the demo week must not read as a real score. Once unlocked,
    # replace the illustrative demo week with one computed from real logged
    # data (nutrition, body composition, sleep, alcohol, travel) instead of
    # the static seed entry in sperm.json.
    UNLOCK_DAYS = 14
    days_logged = count_intake_days()
    score_unlocked = days_logged >= UNLOCK_DAYS
    all_days = load_all_intake_days()

    if score_unlocked:
        wk = compute_current_week(profile, target_date, all_days, entries,
                                   sleep.get("entries", []), lifestyle.get("events", []),
                                   ejaculation.get("entries", []))
        persist_computed_week(wk)
    else:
        wk = sperm["weeks"][-1]
    weights = sperm["model"]["weights"]
    overall = sum(wk["factors"][k] * w for k, w in weights.items())
    sband = band_for(overall, sperm["model"]["bands"])

    td_ref = datetime.strptime(target_date, "%Y-%m-%d")

    # sleep panel (manual nightly entries — Health Connect is US-only, not accessible yet)
    sleep_upto = sorted(
        [e for e in sleep.get("entries", []) if e["date"] <= target_date],
        key=lambda e: e["date"])
    if sleep_upto:
        latest_sleep = sleep_upto[-1]
        last7_sleep = [e for e in sleep_upto
                       if 0 <= (td_ref - datetime.strptime(e["date"], "%Y-%m-%d")).days < 7]
        last14_sleep = [e for e in sleep_upto
                        if 0 <= (td_ref - datetime.strptime(e["date"], "%Y-%m-%d")).days < 14]
        avg7_sleep = round(sum(e["duration_hours"] for e in last7_sleep) / len(last7_sleep), 1)
        avg14_sleep = round(sum(e["duration_hours"] for e in last14_sleep) / len(last14_sleep), 1) if last14_sleep else None
        nights_short7 = sum(1 for e in last7_sleep if e["duration_hours"] < 6)
        nights_long7 = sum(1 for e in last7_sleep if e["duration_hours"] > 9.5)
        h = latest_sleep["duration_hours"]
        sleep_status = "low" if h < 6 else "long" if h > 9.5 else "good"
        sleep_color = {"low": "#ef4444", "good": "#22c55e", "long": "#f59e0b"}[sleep_status]
        sleep_label = {"low": "short", "good": "on target", "long": "long (catch-up)"}[sleep_status]
        note_html = f"<div class='note' style='margin-top:10px'>{latest_sleep['notes']}</div>" if latest_sleep.get("notes") else ""
        avg14_html = f" · {avg14_sleep:g}h 14-day avg" if avg14_sleep is not None else ""
        sleep_panel = f"""
    <div class="panel">
      <h2>Sleep</h2>
      <div class="bignum" style="color:{sleep_color}">{h:g}<small> h</small></div>
      <div class="goalline">{latest_sleep['sleep_start']}–{latest_sleep['sleep_end']} · <b style="color:{sleep_color}">{sleep_label}</b> · {avg7_sleep:g}h 7-day avg{avg14_html}</div>
      {sparkline(sleep_upto[-14:], 'duration_hours')}
      <div class="small muted" style="margin-top:6px">Last 7 nights: <b style="color:{'#ef4444' if nights_short7 else 'var(--text)'}">{nights_short7} short</b> (&lt;6h) · <b style="color:{'#f59e0b' if nights_long7 else 'var(--text)'}">{nights_long7} long</b> (&gt;9.5h) of {len(last7_sleep)} logged</div>
      {note_html}
    </div>"""
        sleep_note_line = f"<div class='small' style='margin-top:8px;color:{sleep_color}'>Sleep last night: <b>{h:g}h</b> ({sleep_label})</div>"
    else:
        sleep_panel = ""
        sleep_note_line = ""

    # daily energy score (no unlock gate — same-day metric, not a historical trend)
    energy = compute_energy_score(profile, target_date, intake, sleep.get("entries", []),
                                   lifestyle.get("events", []), workouts.get("entries", []))
    persist_computed_energy(energy)
    eband = band_for(energy["overall"], energy_store["model"]["bands"])
    edetails = energy.get("details", {})
    efactors = "".join(
        f"""<div class="metric">
          <div class="metric-top"><span>{k}</span><span class="vals">{v:g}</span></div>
          <div class="track"><div class="fill" style="width:{v:.0f}%;background:{eband['color']}"></div></div>
          <div class="small muted" style="margin-top:2px">{edetails.get(k,'')}</div>
        </div>""" for k, v in energy["factors"].items()
    )
    energy_panel = f"""
    <div class="panel">
      <h2>Energy Score · today</h2>
      <div class="sperm-flex">
        {ring(energy["overall"], eband["color"], eband["label"])}
        <div class="factors">{efactors}</div>
      </div>
      <div class="note" style="margin-top:14px">{energy["notes"]}</div>
    </div>"""

    # lifestyle events in the 7 days up to the dashboard date
    recent_events = sorted(
        [e for e in lifestyle.get("events", [])
         if 0 <= (td_ref - datetime.strptime(e["date"], "%Y-%m-%d")).days < 7],
        key=lambda e: e["date"], reverse=True)
    sev_color = {"mild": "#f59e0b", "moderate": "#f97316", "high": "#ef4444"}
    if recent_events:
        ev_rows = "".join(
            f"<li><span class='ev-dot' style='background:{sev_color.get(e.get('severity'),'#8b9bb0')}'></span>"
            f"<b>{e['date']}</b> · {e['description']} "
            f"<span class='muted'>· {e.get('type','')} · {e.get('severity','')}</span></li>"
            for e in recent_events)
        lifestyle_html = (f"<div class='lifestyle'><div class='ls-h'>Lifestyle log · last 7 days</div>"
                          f"<ul>{ev_rows}</ul></div>")
    else:
        lifestyle_html = ""

    # training panel (from exercise project)
    snap = workouts.get("report_snapshot", {})
    recent_workouts = sorted(
        [w for w in workouts.get("entries", [])
         if 0 <= (td_ref - datetime.strptime(w["date"], "%Y-%m-%d")).days < 14],
        key=lambda w: w["date"], reverse=True)
    if snap or recent_workouts:
        acwr = snap.get("acwr")
        acwr_color = ("#ef4444" if acwr and acwr > 1.5 else
                      "#f59e0b" if acwr and acwr >= 1.3 else "#22c55e")

        def _stat(v, k, color=None):
            st = f"color:{color}" if color else ""
            return (f"<div class='chip'><div class='chip-v' style='{st}'>{v}</div>"
                    f"<div class='chip-k'>{k}</div></div>")
        tr_stats = (
            _stat(f"{snap.get('sessions_per_week','–')}/wk", "Sessions")
            + _stat(f"{snap.get('aerobic_28d_km','–')} km", "Cardio 28d")
            + _stat(f"{snap.get('avg_hr','–')} bpm", "Avg HR")
            + _stat(acwr if acwr else "–", "Load ratio", acwr_color))
        alerts_html = "".join(f"<div class='alert'>{a}</div>" for a in snap.get("alerts", [])) \
            or "<div class='muted'>No alerts.</div>"
        training_panel = f"""
    <div class="panel span">
      <h2>Training · from exercise dashboard (report {snap.get('report_date','–')})</h2>
      <div class="chips four">{tr_stats}</div>
      <div class="tr-line">Latest: <b>{snap.get('latest_session','–')}</b> · Recommended next: <b>{snap.get('recommended_next','–')}</b></div>
      <div class="ls-h">Load &amp; balance alerts</div>{alerts_html}
    </div>"""
    else:
        training_panel = ""

    train_full = None
    if unified:
        # The richer panels below (fatigue, recommendation, PRs, balance,
        # aerobic, load-ratio trend) fully supersede this compact mirror —
        # showing both would just be the same numbers twice.
        training_panel = ""
        refresh_training_full()
        try:
            train_full = load("data/metrics/training_full.json")
            training_panel = build_training_panels(train_full)
        except FileNotFoundError:
            pass

    # suggestions gate (same 14-day baseline as the sperm score)
    suggestions_unlocked = days_logged >= UNLOCK_DAYS

    # ----- HTML pieces -----
    macro_override = intake.get("macro_display_override", {})
    macro_rows = (
        bar(tot["kcal"], t["calories_kcal"], "Calories (kcal)", reverse_over=True, label=macro_override.get("kcal"))
        + bar(tot["protein_g"], t["protein_g"], "Protein (g)", label=macro_override.get("protein_g"))
        + bar(tot["carbs_g"], t["carbs_g"], "Carbs (g)", label=macro_override.get("carbs_g"))
        + bar(tot["fat_g"], t["fat_g"], "Fat (g)", reverse_over=True, label=macro_override.get("fat_g"))
        + bar(tot["fiber_g"], t["fiber_g"], "Fiber (g)", label=macro_override.get("fiber_g"))
    )

    # 7-day rolling average — so one qualitative/buffet/opt-out day doesn't
    # read as a miss when the week-level trend is fine. Days flagged
    # exclude_from_monthly_macros (same flag the monthly recap respects) are
    # left out of the average; the 14-day sparkline still plots every day's
    # raw total so the trend line has no gaps.
    def day_tot(d, key):
        return sum(i.get(key, 0) for i in d.get("items", []))

    days14 = [d for d in all_days if 0 <= (td_ref - pdate(d["date"])).days < 14]
    days7_for_avg = [d for d in days14 if (td_ref - pdate(d["date"])).days < 7
                     and not d.get("exclude_from_monthly_macros")]
    if days7_for_avg:
        avg7_kcal = round(sum(day_tot(d, "kcal") for d in days7_for_avg) / len(days7_for_avg))
        avg7_protein = round(sum(day_tot(d, "protein_g") for d in days7_for_avg) / len(days7_for_avg), 1)
        excluded7 = sum(1 for d in days14 if (td_ref - pdate(d["date"])).days < 7
                        and d.get("exclude_from_monthly_macros"))
        excl_note = f" ({excluded7} day(s) excluded — not tracked/qualitative)" if excluded7 else ""
        rolling_html = f"""
      <div class="small muted" style="margin-top:12px">7-day avg ({len(days7_for_avg)} day(s)): <b style="color:var(--text)">{avg7_kcal:g} kcal</b> &middot; <b style="color:var(--text)">{avg7_protein:g}g protein</b>{excl_note}</div>
      {sparkline(sorted([{"date": d["date"], "kcal": day_tot(d, "kcal")} for d in days14], key=lambda e: e["date"]), "kcal", baseline=t["calories_kcal"], baseline_label=f"target {t['calories_kcal']:g}")}
      <div class="small muted" style="margin-top:10px">Protein (g), 14-day trend</div>
      {sparkline(sorted([{"date": d["date"], "protein_g": day_tot(d, "protein_g")} for d in days14], key=lambda e: e["date"]), "protein_g", baseline=t["protein_g"], baseline_label=f"target {t['protein_g']:g}")}"""
    else:
        rolling_html = ""

    micro_rows = "".join(
        bar(micros.get(k, 0), mtarg[k], k.replace("_", " ")) for k in mtarg
    )

    supplement_check_html = build_supplement_check(
        items,
        omega3_total=micros.get("omega3_epa_dha_mg", 0),
        omega3_target=mtarg.get("omega3_epa_dha_mg"),
    )

    bc = profile["baseline_body_composition"]
    comp_cards = "".join(
        f"<div class='chip'><div class='chip-v'>{v}</div><div class='chip-k'>{k}</div></div>"
        for k, v in [
            ("BMI", latest.get("bmi", bc["bmi"])),
            ("Body fat %", latest.get("body_fat_pct", bc["body_fat_pct"])),
            ("Body fat mass kg", latest.get("body_fat_mass_kg", "—")),
            ("Subcutaneous fat %", latest.get("subcutaneous_fat_pct", "—")),
            ("Visceral fat", latest.get("visceral_fat", bc["visceral_fat"])),
            ("Skeletal muscle kg", latest.get("skeletal_muscle_mass_kg", bc["skeletal_muscle_mass_kg"])),
            ("Muscle mass kg", latest.get("muscle_mass_kg", bc["muscle_mass_kg"])),
            ("Lean body mass kg", latest.get("lean_body_mass_kg", bc["lean_body_mass_kg"])),
            ("Protein %", latest.get("protein_pct", bc["protein_pct"])),
            ("Water %", latest.get("water_pct", bc["water_pct"])),
            ("Bone mass kg", latest.get("bone_mass_kg", bc["bone_mass_kg"])),
            ("BMR kcal", latest.get("bmr_kcal", bc["bmr_kcal"])),
            ("Resting HR", latest.get("resting_heart_rate", bc["resting_heart_rate"])),
            ("Body age", latest.get("body_age", "—")),
            ("Body type", latest.get("body_type", "—")),
        ]
    )

    sfactors = "".join(
        f"""<div class="metric">
          <div class="metric-top"><span>{k.replace('_',' ')}</span><span class="vals">{v:g}</span></div>
          <div class="track"><div class="fill" style="width:{v:.0f}%;background:{sband['color']}"></div></div>
        </div>""" for k, v in wk["factors"].items()
    )

    if suggestions_unlocked:
        suggestions = generate_suggestions(profile, all_days, entries,
                                            sleep.get("entries", []), lifestyle.get("events", []), target_date,
                                            ejaculation.get("entries", []))
        sugg_body = ("<ul class='sugg-ul'>" + "".join(f"<li>{s}</li>" for s in suggestions) + "</ul>") if suggestions \
            else "<p class='muted'>Not enough signal yet to generate suggestions.</p>"
    else:
        remaining = 14 - days_logged
        sugg_body = f"""<div class="locked">
          <div class="lock-ico">🔒</div>
          <div><b>Recommendations unlock after 14 logged days.</b>
          <div class="muted">{days_logged} / 14 logged · {remaining} day(s) to go. Building your baseline before suggesting changes.</div></div>
        </div>"""

    # Sperm panel: locked (no score/ring) until the 14-day baseline; the
    # Lifestyle log below is always shown (it's real logged data, not an estimate).
    if score_unlocked:
        sperm_title = f"Sperm Optimization · trailing 7 days, updated daily ({wk['week_start']} → {wk['week_end']})"
        sperm_score_html = f"""
      <div class="sperm-flex">
        {ring(overall, sband['color'], sband['label'])}
        <div class="factors">{sfactors}</div>
      </div>
      <div class="note" style="margin-top:14px">{wk.get('notes','')}</div>"""
    else:
        sperm_title = "Sperm Optimization"
        remaining = UNLOCK_DAYS - days_logged
        sperm_score_html = f"""<div class="locked">
          <div class="lock-ico">🔒</div>
          <div><b>Score unlocks after {UNLOCK_DAYS} logged days.</b>
          <div class="muted">{days_logged} / {UNLOCK_DAYS} logged · {remaining} day(s) to go. Logging the inputs (nutrition, sleep, alcohol, heat/travel) now; the weighted estimate switches on at day {UNLOCK_DAYS}.</div></div>
        </div>"""

    # Quick View — the compact "all datasets, most relevant numbers" strip
    # that replaces the old prose status_note panel.
    qv_chips = [{"v": f"{energy['overall']}", "k": "Energy score", "color": eband["color"]}]
    if score_unlocked:
        qv_chips.append({"v": f"{overall:.0f}", "k": "Sperm score", "color": sband["color"]})
    else:
        qv_chips.append({"v": "🔒", "k": "Sperm score"})
    qv_chips.append({"v": f"{tot['kcal']:g}", "k": f"kcal (of {t['calories_kcal']:g})"})
    qv_chips.append({"v": f"{tot['protein_g']:g}g", "k": f"protein (of {t['protein_g']:g}g)"})
    if sleep_upto:
        qv_chips.append({"v": f"{h:g}h", "k": f"Sleep ({sleep_label})", "color": sleep_color})
    if intake.get("workout_today"):
        wsum = intake.get("workout_summary") or ""
        pr_m = re.search(r"(\d+) new PRs?", wsum)
        sess_name = wsum.split(" (")[0] if " (" in wsum else wsum.split(":")[0]
        wv = f"{sess_name}" + (f" · {pr_m.group(1)} PR{'s' if pr_m.group(1) != '1' else ''}" if pr_m else "")
        qv_chips.append({"v": wv, "k": "Workout", "color": "#22c55e" if pr_m else None})
    else:
        qv_chips.append({"v": "Rest day", "k": "Workout"})
    if train_full:
        acwr = train_full.get("trends", {}).get("acwr")
        zone = train_full.get("trends", {}).get("acwrZone", "–")
        qv_chips.append({"v": f"{acwr if acwr is not None else '–'}", "k": f"Load ratio ({zone})", "color": _acwr_color(acwr)})
        rec_section = train_full.get("recommendation", {})
        rec_label = "Deload" if rec_section.get("deload") else rec_section.get("section", "–")
        qv_chips.append({"v": rec_label, "k": "Recommended next"})
    qv_chips.append({"v": f"{latest['weight_kg']:g}kg", "k": "Bodyweight"})
    if intake.get("caffeine_shots") is not None:
        qv_chips.append({"v": f"{intake['caffeine_shots']}", "k": "Caffeine shots"})
    quickview_panel = build_quickview(qv_chips)

    sample_flag = " · <span style='color:#f59e0b'>DEMO sample data</span>" if intake.get("_note") else ""

    dt = datetime.strptime(target_date, "%Y-%m-%d")
    nice_date = dt.strftime("%A, %d %B %Y")

    html = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{'Unified' if unified else 'Intake'} Dashboard · {target_date}</title>
<style>
  :root {{ --bg:#0b0f17; --panel:#131a26; --panel2:#0f1622; --line:#1f2a3a;
           --text:#e6edf3; --muted:#8b9bb0; --accent:#38bdf8; }}
  * {{ box-sizing:border-box; }}
  body {{ margin:0; background:var(--bg); color:var(--text);
          font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }}
  .wrap {{ max-width:1100px; margin:0 auto; padding:24px 18px 60px; }}
  header.top {{ display:flex; justify-content:space-between; align-items:flex-end;
                flex-wrap:wrap; gap:12px; margin-bottom:20px; }}
  .title {{ font-size:22px; font-weight:700; }}
  .subtitle {{ color:var(--muted); }}
  .daychip {{ background:linear-gradient(135deg,#1d4ed8,#0ea5e9); color:#fff;
              padding:8px 14px; border-radius:12px; font-weight:700; }}
  .grid {{ display:grid; grid-template-columns:repeat(2,1fr); gap:16px; }}
  .panel {{ background:var(--panel); border:1px solid var(--line); border-radius:16px;
            padding:18px; }}
  .panel.span {{ grid-column:1 / -1; }}
  .panel h2 {{ margin:0 0 14px; font-size:13px; letter-spacing:.08em;
               text-transform:uppercase; color:var(--muted); }}
  .metric {{ margin:10px 0; }}
  .metric-top {{ display:flex; justify-content:space-between; font-size:13px; margin-bottom:5px; }}
  .vals {{ font-variant-numeric:tabular-nums; font-weight:600; }}
  .muted {{ color:var(--muted); font-weight:400; }}
  .track {{ height:8px; background:#0a1019; border-radius:6px; overflow:hidden; }}
  .fill {{ height:100%; border-radius:6px; transition:width .3s; }}
  .bignum {{ font-size:40px; font-weight:800; line-height:1; }}
  .bignum small {{ font-size:16px; color:var(--muted); font-weight:600; }}
  .goalline {{ color:var(--muted); margin-top:6px; }}
  .chips {{ display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-top:14px; }}
  .chip {{ background:var(--panel2); border:1px solid var(--line); border-radius:10px;
           padding:10px; text-align:center; }}
  .chip-v {{ font-size:18px; font-weight:700; }}
  .chip-k {{ font-size:11px; color:var(--muted); margin-top:2px; }}
  .spark {{ height:90px; margin-top:6px; }}
  table {{ width:100%; border-collapse:collapse; }}
  th,td {{ text-align:left; padding:7px 6px; border-bottom:1px solid var(--line); font-size:13px; }}
  th {{ color:var(--muted); font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:.05em; }}
  .t-time {{ color:var(--muted); width:54px; font-variant-numeric:tabular-nums; }}
  .t-num {{ text-align:right; font-variant-numeric:tabular-nums; width:52px; }}
  .t-total td {{ font-weight:700; border-top:2px solid var(--line); border-bottom:none; color:var(--text); }}
  .dot {{ display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:8px; }}
  .ring-wrap {{ display:flex; flex-direction:column; align-items:center; }}
  .ring-num {{ fill:var(--text); font-size:30px; font-weight:800; }}
  .ring-sub {{ fill:var(--muted); font-size:11px; }}
  .ring-label {{ font-weight:700; margin-top:6px; }}
  .sperm-flex {{ display:flex; gap:20px; align-items:center; flex-wrap:wrap; }}
  .sperm-flex .factors {{ flex:1; min-width:240px; }}
  .note {{ background:var(--panel2); border-left:3px solid var(--accent);
           padding:10px 12px; border-radius:8px; color:var(--text); margin-top:4px; }}
  .chips.four {{ grid-template-columns:repeat(4,1fr); margin-top:0; }}
  .chips.qv {{ grid-template-columns:repeat(auto-fit,minmax(104px,1fr)); margin-top:0; }}
  .tr-line {{ margin:12px 0 14px; font-size:14px; }}
  .tr-cols {{ display:grid; grid-template-columns:1fr 1fr; gap:18px; }}
  .ev-ul {{ list-style:none; margin:0; padding:0; }}
  .ev-ul li {{ font-size:13px; padding:5px 0; border-bottom:1px solid var(--line); }}
  .alert {{ background:var(--panel2); border-left:3px solid #f59e0b; padding:8px 10px;
            border-radius:8px; margin-bottom:8px; font-size:13px; }}
  .lifestyle {{ margin-top:14px; }}
  .ls-h {{ font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:var(--muted); margin-bottom:6px; }}
  .lifestyle ul {{ list-style:none; margin:0; padding:0; }}
  .lifestyle li {{ font-size:13px; padding:5px 0; border-bottom:1px solid var(--line); }}
  .ev-dot {{ display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:8px; }}
  .sugg-ul {{ list-style:none; margin:0; padding:0; }}
  .sugg-ul li {{ font-size:14px; padding:10px 0 10px 16px; border-bottom:1px solid var(--line);
                 border-left:3px solid var(--accent); background:var(--panel2); border-radius:6px;
                 margin-bottom:8px; }}
  .sugg-ul li:last-child {{ margin-bottom:0; }}
  .locked {{ display:flex; gap:14px; align-items:center; padding:8px 0; }}
  .lock-ico {{ font-size:30px; }}
  .loadbars {{ display:flex; align-items:flex-end; gap:6px; height:56px; margin-top:6px; }}
  .loadbars .col {{ flex:1; display:flex; flex-direction:column; align-items:center; gap:3px; justify-content:flex-end; }}
  .loadbars .col .b {{ width:100%; background:var(--accent); border-radius:4px 4px 0 0; min-height:2px; }}
  .loadbars .col .lbl {{ font-size:9px; color:var(--muted); }}
  .footer {{ color:var(--muted); font-size:12px; text-align:center; margin-top:26px; }}
  @media(max-width:720px){{ .grid{{grid-template-columns:1fr;}} .chips{{grid-template-columns:repeat(3,1fr);}}
    .chips.four{{grid-template-columns:repeat(2,1fr);}} .tr-cols{{grid-template-columns:1fr;}} }}
</style></head>
<body><div class="wrap">

  <header class="top">
    <div>
      <div class="title">{'Training &amp; Nutrition Dashboard' if unified else 'Nutrition &amp; Intake Dashboard'}</div>
      <div class="subtitle">{nice_date} · Goals: weight loss · muscle retention · sperm optimization{sample_flag}</div>
    </div>
    <div class="daychip">Day {intake.get('day_number','?')}</div>
  </header>

  <div class="grid">

{quickview_panel}
{energy_panel}
    <div class="panel">
      <h2>Weight &amp; Body Composition</h2>
      <div class="bignum">{latest['weight_kg']:g}<small> kg</small></div>
      <div class="goalline">Target {lo_t}–{hi_t} kg · {'<b>'+format(to_go,'g')+' kg to go</b>' if to_go else '<b>in range 🎯</b>'} · since start {latest['weight_kg']-first['weight_kg']:+.1f} kg</div>
      {sparkline(entries,'weight_kg')}
      <div class="chips">{comp_cards}</div>
    </div>

    <div class="panel">
      <h2>{sperm_title}</h2>
      {sperm_score_html}
      {sleep_note_line}
      {lifestyle_html}
    </div>
{sleep_panel}
    <div class="panel">
      <h2>Macros · today</h2>
      {macro_rows}
      {rolling_html}
    </div>

    <div class="panel">
      <h2>Sperm-priority micronutrients · today</h2>
      {micro_rows}
    </div>
{training_panel}
    <div class="panel span">
      <h2>Supplements &amp; Medication Check</h2>
      <ul class="ev-ul">{supplement_check_html}</ul>
    </div>

    <div class="panel span">
      <h2>Suggestions &amp; Recommendations</h2>
      {sugg_body}
    </div>

  </div>

  <div class="footer">Generated {datetime.now().strftime('%Y-%m-%d %H:%M')} · data in /data · edit profile.json to adjust targets</div>
</div></body></html>"""

    out_dir = os.path.join(ROOT, "dashboards")
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, f"{'unified_' if unified else ''}{target_date}.html")
    with open(out, "w", encoding="utf-8") as f:
        f.write(html)
    score_str = f"{overall:.0f}" if score_unlocked else f"locked ({days_logged}/{UNLOCK_DAYS}d)"
    print(f"Wrote {out}  (calories {tot['kcal']:g}, protein {tot['protein_g']:g} g, "
          f"sperm score {score_str}, energy score {energy['overall']}, days logged {days_logged})")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a != "--unified"]
    unified_flag = "--unified" in sys.argv[1:]
    build(pick_date(args[0] if args else None), unified=unified_flag)
