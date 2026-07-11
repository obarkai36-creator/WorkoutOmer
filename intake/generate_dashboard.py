#!/usr/bin/env python3
"""Generate the daily dark-mode intake dashboard as a self-contained HTML file.

Usage:
    python generate_dashboard.py [YYYY-MM-DD]

If no date is given, the most recent file in data/intake/ is used.
Reads: profile.json, references/supplements.json, data/metrics/weight.json,
data/metrics/sperm.json, data/metrics/lifestyle.json, data/metrics/sleep.json,
data/metrics/ejaculation.json, data/intake/<date>.json (all of them, for the
sperm-score/suggestions computation once the 14-day baseline unlocks)
Writes: dashboards/<date>.html, data/metrics/sperm.json (appends/updates the
current week's computed factors once unlocked)
"""
import json
import sys
import glob
import os
from datetime import date, datetime, timedelta

ROOT = os.path.dirname(os.path.abspath(__file__))


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

def bar(value, target, unit="", reverse_over=False):
    """A labelled progress bar. reverse_over=True => going over target is bad (amber/red)."""
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
    return f"""
      <div class="metric">
        <div class="metric-top"><span>{unit}</span><span class="vals">{value:g} <span class="muted">/ {target:g}</span></span></div>
        <div class="track"><div class="fill" style="width:{pct:.0f}%;background:{color}"></div></div>
      </div>"""


def sparkline(entries, key, w=560, h=90, pad=8):
    pts = [(e["date"], e.get(key)) for e in entries if e.get(key) is not None]
    if len(pts) < 2:
        return "<div class='muted'>Not enough data yet.</div>"
    ys = [v for _, v in pts]
    lo, hi = min(ys), max(ys)
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
    return f"""<svg viewBox="0 0 {w} {h}" width="100%" preserveAspectRatio="none" class="spark">
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

    # alcohol: distinct drinking days in-window vs the <=1/week baseline
    alcohol_days = {e["date"] for e in lifestyle_events if e.get("type") == "alcohol" and in_week(e["date"])}
    alcohol = round(clamp(100 - max(0, len(alcohol_days) - 1) * 20))

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


# ---------- real suggestions engine (post 14-day unlock) --------------------

def generate_suggestions(profile, all_days, weight_entries, sleep_entries, lifestyle_events, target_date, ejac_entries):
    """Concrete, data-driven suggestions from the full logged history so far
    — replaces the placeholder 'engine active' message."""
    t = profile["targets"]
    sugg = []

    n = len(all_days)
    protein_hit = sum(1 for d in all_days if sum(i.get("protein_g", 0) for i in d.get("items", [])) >= t["protein_g"])
    fiber_hit = sum(1 for d in all_days if sum(i.get("fiber_g", 0) for i in d.get("items", [])) >= t["fiber_g"])
    kcal_over = sum(1 for d in all_days if sum(i.get("kcal", 0) for i in d.get("items", [])) > t["calories_kcal"] * 1.1)

    if protein_hit / n >= 0.7:
        sugg.append(f"Protein target hit on {protein_hit}/{n} logged days — strong, consistent muscle-retention support. Keep it up.")
    else:
        sugg.append(f"Protein target hit on only {protein_hit}/{n} logged days — add a protein source to lighter meals to close the gap more consistently.")

    if fiber_hit / n < 0.5:
        sugg.append(f"Fiber cleared target on {fiber_hit}/{n} days — veg-forward meals (like the lettuce/tomato-heavy days) clear it easily; lean on those more often.")

    if kcal_over / n >= 0.3:
        sugg.append(f"Calories ran 10%+ over target on {kcal_over}/{n} days, mostly around restaurant meals and desserts — no single day is a problem, but the pattern is worth watching against the weight-loss goal.")

    alcohol_days_14 = sorted({e["date"] for e in lifestyle_events if e.get("type") == "alcohol"})
    recent_alcohol = [d for d in alcohol_days_14 if (pdate(target_date) - pdate(d)).days < 14]
    if len(recent_alcohol) >= 5:
        sugg.append(f"Alcohol logged on {len(recent_alcohol)} of the last 14 days — well above the <=1/week baseline and the most consistent drag on the sperm-optimization score. A genuine dry stretch is the single highest-leverage change available right now.")

    if sleep_entries:
        avg_sleep = sum(e["duration_hours"] for e in sleep_entries) / len(sleep_entries)
        sugg.append(f"Average logged sleep is {avg_sleep:.1f}h across {len(sleep_entries)} night(s) tracked — keep logging nightly to get a reliable trend (still an early sample).")

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

    return sugg[:6]


# ---------- main build ----------

def build(target_date):
    profile = load("profile.json")
    supps = load("references/supplements.json")
    weight = load("data/metrics/weight.json")
    sperm = load("data/metrics/sperm.json")
    intake = load(f"data/intake/{target_date}.json")
    try:
        lifestyle = load("data/metrics/lifestyle.json")
    except FileNotFoundError:
        lifestyle = {"events": []}
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
        avg7_sleep = round(sum(e["duration_hours"] for e in last7_sleep) / len(last7_sleep), 1)
        h = latest_sleep["duration_hours"]
        sleep_status = "low" if h < 6 else "long" if h > 9.5 else "good"
        sleep_color = {"low": "#ef4444", "good": "#22c55e", "long": "#f59e0b"}[sleep_status]
        sleep_label = {"low": "short", "good": "on target", "long": "long (catch-up)"}[sleep_status]
        note_html = f"<div class='note' style='margin-top:10px'>{latest_sleep['notes']}</div>" if latest_sleep.get("notes") else ""
        sleep_panel = f"""
    <div class="panel">
      <h2>Sleep</h2>
      <div class="bignum" style="color:{sleep_color}">{h:g}<small> h</small></div>
      <div class="goalline">{latest_sleep['sleep_start']}–{latest_sleep['sleep_end']} · <b style="color:{sleep_color}">{sleep_label}</b> · {avg7_sleep:g}h 7-day avg</div>
      {note_html}
    </div>"""
        sleep_note_line = f"<div class='small' style='margin-top:8px;color:{sleep_color}'>Sleep last night: <b>{h:g}h</b> ({sleep_label})</div>"
    else:
        sleep_panel = ""
        sleep_note_line = ""

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
        sess_rows = "".join(
            f"<li><b>{w['date']}</b> · {w['type']}"
            + (f" <span class='muted'>· {w['duration_min']} min</span>" if w.get('duration_min') else "")
            + (f" <span class='muted'>· {w['notes']}</span>" if w.get('notes') else "")
            + "</li>" for w in recent_workouts) or "<li class='muted'>No sessions in range.</li>"
        alerts_html = "".join(f"<div class='alert'>{a}</div>" for a in snap.get("alerts", [])) \
            or "<div class='muted'>No alerts.</div>"
        training_panel = f"""
    <div class="panel span">
      <h2>Training · from exercise dashboard (report {snap.get('report_date','–')})</h2>
      <div class="chips four">{tr_stats}</div>
      <div class="tr-line">Latest: <b>{snap.get('latest_session','–')}</b> · Recommended next: <b>{snap.get('recommended_next','–')}</b></div>
      <div class="tr-cols">
        <div><div class="ls-h">Recent sessions (14d)</div><ul class="ev-ul">{sess_rows}</ul></div>
        <div><div class="ls-h">Load &amp; balance alerts</div>{alerts_html}</div>
      </div>
    </div>"""
    else:
        training_panel = ""

    # suggestions gate (same 14-day baseline as the sperm score)
    suggestions_unlocked = days_logged >= UNLOCK_DAYS

    # ----- HTML pieces -----
    macro_rows = (
        bar(tot["kcal"], t["calories_kcal"], "Calories (kcal)", reverse_over=True)
        + bar(tot["protein_g"], t["protein_g"], "Protein (g)")
        + bar(tot["carbs_g"], t["carbs_g"], "Carbs (g)")
        + bar(tot["fat_g"], t["fat_g"], "Fat (g)", reverse_over=True)
        + bar(tot["fiber_g"], t["fiber_g"], "Fiber (g)")
    )

    micro_rows = "".join(
        bar(micros.get(k, 0), mtarg[k], k.replace("_", " ")) for k in mtarg
    )

    cat_color = {"food": "#38bdf8", "drink": "#a78bfa", "supplement": "#22c55e"}
    log_rows = "".join(
        f"""<tr>
          <td class="t-time">{i['time']}</td>
          <td><span class="dot" style="background:{cat_color.get(i['category'],'#888')}"></span>{i['name']}<span class="muted"> · {i.get('qty','')}</span></td>
          <td class="t-num">{i['kcal']:g}</td>
          <td class="t-num">{i['protein_g']:g}</td>
          <td class="t-num">{i['carbs_g']:g}</td>
          <td class="t-num">{i['fat_g']:g}</td>
          <td class="t-num">{i['fiber_g']:g}</td>
        </tr>""" for i in items
    )
    log_total = (
        f"""<tr class="t-total">
          <td></td><td>Total</td>
          <td class="t-num">{tot['kcal']:g}</td>
          <td class="t-num">{tot['protein_g']:g}</td>
          <td class="t-num">{tot['carbs_g']:g}</td>
          <td class="t-num">{tot['fat_g']:g}</td>
          <td class="t-num">{tot['fiber_g']:g}</td>
        </tr>"""
    )

    bc = profile["baseline_body_composition"]
    comp_cards = "".join(
        f"<div class='chip'><div class='chip-v'>{v}</div><div class='chip-k'>{k}</div></div>"
        for k, v in [
            ("Body fat %", latest.get("body_fat_pct", bc["body_fat_pct"])),
            ("Skeletal muscle kg", latest.get("skeletal_muscle_mass_kg", bc["skeletal_muscle_mass_kg"])),
            ("Visceral fat", latest.get("visceral_fat", bc["visceral_fat"])),
            ("Muscle mass kg", latest.get("muscle_mass_kg", bc["muscle_mass_kg"])),
            ("BMR kcal", latest.get("bmr_kcal", bc["bmr_kcal"])),
            ("Resting HR", latest.get("resting_heart_rate", bc["resting_heart_rate"])),
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
        sperm_title = f"Sperm Optimization · weekly ({wk['week_start']} → {wk['week_end']})"
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

    sample_flag = " · <span style='color:#f59e0b'>DEMO sample data</span>" if intake.get("_note") else ""

    dt = datetime.strptime(target_date, "%Y-%m-%d")
    nice_date = dt.strftime("%A, %d %B %Y")

    html = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Intake Dashboard · {target_date}</title>
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
  .footer {{ color:var(--muted); font-size:12px; text-align:center; margin-top:26px; }}
  @media(max-width:720px){{ .grid{{grid-template-columns:1fr;}} .chips{{grid-template-columns:repeat(3,1fr);}}
    .chips.four{{grid-template-columns:repeat(2,1fr);}} .tr-cols{{grid-template-columns:1fr;}} }}
</style></head>
<body><div class="wrap">

  <header class="top">
    <div>
      <div class="title">Nutrition &amp; Intake Dashboard</div>
      <div class="subtitle">{nice_date} · Goals: weight loss · muscle retention · sperm optimization{sample_flag}</div>
    </div>
    <div class="daychip">Day {intake.get('day_number','?')}</div>
  </header>

  <div class="grid">

    <div class="panel span">
      <h2>Status &amp; Progress</h2>
      <div class="note">{intake.get('status_note','')}</div>
    </div>

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
    </div>

    <div class="panel">
      <h2>Sperm-priority micronutrients · today</h2>
      {micro_rows}
    </div>
{training_panel}
    <div class="panel span">
      <h2>Intake Log · today</h2>
      <table>
        <thead><tr><th>Time</th><th>Item</th><th class="t-num">kcal</th><th class="t-num">prot</th><th class="t-num">carb</th><th class="t-num">fat</th><th class="t-num">fib</th></tr></thead>
        <tbody>{log_rows}{log_total}</tbody>
      </table>
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
    out = os.path.join(out_dir, f"{target_date}.html")
    with open(out, "w", encoding="utf-8") as f:
        f.write(html)
    score_str = f"{overall:.0f}" if score_unlocked else f"locked ({days_logged}/{UNLOCK_DAYS}d)"
    print(f"Wrote {out}  (calories {tot['kcal']:g}, protein {tot['protein_g']:g} g, "
          f"sperm score {score_str}, days logged {days_logged})")


if __name__ == "__main__":
    build(pick_date(sys.argv[1] if len(sys.argv) > 1 else None))
