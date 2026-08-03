#!/usr/bin/env python3
"""Generate the monthly recap dashboard — accumulated/statistical view across
both dashboards (nutrition + training), compared against the previous month.

Usage:
    python generate_monthly_recap.py [YYYY-MM]

If no month is given, uses the month of the most recently logged intake day.
Reads the same stores as generate_dashboard.py (profile.json, data/intake/*.json,
data/metrics/*.json) plus ../data.js + ../engine.js (via monthly_training_stats.mjs,
replayed "as of" each month's last day) for the training side.
Writes: dashboards/monthly/<YYYY-MM>.html

Same visual system as the daily dashboard (see generate_dashboard.py's <style>
block) — this file intentionally duplicates rather than imports it, since the
two dashboards are meant to be able to diverge in layout independently.
"""
import json
import sys
import glob
import os
import subprocess
from datetime import datetime
from calendar import monthrange

ROOT = os.path.dirname(os.path.abspath(__file__))


def load(path):
    with open(os.path.join(ROOT, path), encoding="utf-8") as f:
        return json.load(f)


def load_all_intake_days():
    days = []
    for path in sorted(glob.glob(os.path.join(ROOT, "data/intake/*.json"))):
        with open(path, encoding="utf-8") as f:
            days.append(json.load(f))
    return days


def pick_month(arg):
    if arg:
        return arg
    files = sorted(glob.glob(os.path.join(ROOT, "data/intake/*.json")))
    if not files:
        sys.exit("No intake files found in data/intake/")
    latest = os.path.splitext(os.path.basename(files[-1]))[0]
    return latest[:7]


def month_bounds(ym):
    y, m = (int(x) for x in ym.split("-"))
    start = datetime(y, m, 1)
    end = datetime(y, m, monthrange(y, m)[1])
    return start, end


def prev_month(ym):
    y, m = (int(x) for x in ym.split("-"))
    return f"{y-1}-12" if m == 1 else f"{y}-{m-1:02d}"


def month_label(ym):
    y, m = (int(x) for x in ym.split("-"))
    return datetime(y, m, 1).strftime("%B %Y")


def in_range(date_str, start, end):
    d = datetime.strptime(date_str, "%Y-%m-%d")
    return start <= d <= end


def safe_avg(vals, nd=None):
    vals = [v for v in vals if v is not None]
    if not vals:
        return None
    v = sum(vals) / len(vals)
    return round(v, nd) if nd is not None else v


def clamp(v, lo=0, hi=100):
    return max(lo, min(hi, v))


def band_for(score, bands):
    chosen = bands[0]
    for b in bands:
        if score >= b["min"]:
            chosen = b
    return chosen


# ---------- render helpers (same visual language as generate_dashboard.py) --

def bar(value, target, unit="", reverse_over=False, label=None):
    if value is None:
        return f"""
      <div class="metric">
        <div class="metric-top"><span>{unit}</span><span class="vals muted">no data</span></div>
        <div class="track"><div class="fill" style="width:0%;background:#1f2a3a"></div></div>
      </div>"""
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


def ring(score, color, label, size=120):
    r = 52
    circ = 2 * 3.14159 * r
    off = circ * (1 - clamp(score) / 100)
    return f"""<div class="ring-wrap">
      <svg viewBox="0 0 130 130" width="{size}" height="{size}">
        <circle cx="65" cy="65" r="{r}" fill="none" stroke="#1f2937" stroke-width="12"/>
        <circle cx="65" cy="65" r="{r}" fill="none" stroke="{color}" stroke-width="12"
          stroke-linecap="round" stroke-dasharray="{circ:.1f}" stroke-dashoffset="{off:.1f}"
          transform="rotate(-90 65 65)"/>
        <text x="65" y="60" text-anchor="middle" class="ring-num">{score:.0f}</text>
        <text x="65" y="82" text-anchor="middle" class="ring-sub">/ 100</text>
      </svg>
      <div class="ring-label" style="color:{color}">{label}</div>
    </div>"""


def month_sparkline(cur_series, prev_series, cur_label, prev_label, w=560, h=90, pad=8):
    """cur_series/prev_series: [(date_str, value), ...] within their own month.
    X positioned by day-of-month so the two lines align on the calendar, not index."""
    all_vals = [v for _, v in cur_series] + [v for _, v in prev_series]
    if not all_vals:
        return "<div class='muted'>Not enough data yet.</div>"
    lo, hi = min(all_vals), max(all_vals)
    rng = (hi - lo) or 1

    def to_pts(series):
        pts = []
        for d, v in series:
            day = int(d.split("-")[2])
            x = pad + (day - 1) / 30 * (w - 2 * pad)
            y = pad + (1 - (v - lo) / rng) * (h - 2 * pad)
            pts.append((x, y))
        return pts

    cur_pts, prev_pts = to_pts(cur_series), to_pts(prev_series)
    poly = lambda pts: " ".join(f"{x:.1f},{y:.1f}" for x, y in pts)  # noqa: E731
    prev_line = (f'<polyline fill="none" stroke="#8b9bb0" stroke-width="2" stroke-dasharray="4,3" '
                 f'points="{poly(prev_pts)}"/>') if len(prev_pts) >= 2 else ""
    cur_line = (f'<polyline fill="none" stroke="#38bdf8" stroke-width="2.5" points="{poly(cur_pts)}"/>'
                if len(cur_pts) >= 2 else "")
    dots = "".join(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="3" fill="#38bdf8"/>' for x, y in cur_pts)
    last_dot = (f'<circle cx="{cur_pts[-1][0]:.1f}" cy="{cur_pts[-1][1]:.1f}" r="4.5" fill="#22c55e"/>'
                if cur_pts else "")
    return f"""<div class="spark-wrap">
      <svg viewBox="0 0 {w} {h}" width="100%" preserveAspectRatio="none" style="height:{h}px">
        {prev_line}{cur_line}{dots}{last_dot}
      </svg>
      <div class="spark-legend">
        <span style="border-top:2px solid #38bdf8">{cur_label}</span>
        <span style="border-top:2px dashed #8b9bb0">{prev_label}</span>
      </div>
    </div>"""


def delta_chip(value, unit_suffix, higher_is_good, arrow_up="▲", arrow_down="▼", pp=False):
    """Returns (text, css_class) for a chip-delta line, or ("—", "muted") if unknown."""
    if value is None:
        return "no prior data", "muted"
    if abs(value) < 1e-9:
        return "flat vs last month", "muted"
    arrow = arrow_up if value > 0 else arrow_down
    good = (value > 0) == higher_is_good
    cls = "up-good" if good else "up-bad"
    suffix = "pp" if pp else unit_suffix
    return f"{arrow} {value:+.1f}{suffix} vs last month", cls


def run_training_stats(ym):
    try:
        out = subprocess.run(
            ["node", os.path.join(ROOT, "monthly_training_stats.mjs"), ym],
            capture_output=True, text=True, check=True, cwd=ROOT,
        )
        return json.loads(out.stdout)
    except Exception as e:
        print(f"Warning: monthly_training_stats.mjs failed for {ym}: {e}", file=sys.stderr)
        return {"acwr": None, "alerts": [], "recommended_next": None, "sessions_per_week": None,
                "sessions_in_month": [], "sessions_in_month_count": 0}


def aggregate_month(ym, profile, sperm_model, all_days, weight_entries, sleep_entries,
                     lifestyle_events, ejac_entries, energy_days, sperm_weeks, workout_entries):
    start, end = month_bounds(ym)
    t = profile["targets"]

    def day_tot(d, key):
        return sum(i.get(key, 0) for i in d.get("items", []))

    days = [d for d in all_days if in_range(d["date"], start, end)]
    n_days = len(days)
    macro_days = [d for d in days if not d.get("exclude_from_monthly_macros")]
    protein_hit = sum(1 for d in macro_days if day_tot(d, "protein_g") >= t["protein_g"])

    w_in = [e for e in weight_entries if in_range(e["date"], start, end)]
    s_in = [e for e in sleep_entries if in_range(e["date"], start, end)]
    alcohol_days = {e["date"] for e in lifestyle_events
                    if e.get("type") == "alcohol" and in_range(e["date"], start, end)}
    ejac_in = sorted(e["date"] for e in ejac_entries if in_range(e["date"], start, end))
    if len(ejac_in) >= 2:
        gaps = [(datetime.strptime(ejac_in[i + 1], "%Y-%m-%d") - datetime.strptime(ejac_in[i], "%Y-%m-%d")).days
                for i in range(len(ejac_in) - 1)]
        ejac_avg_gap = sum(gaps) / len(gaps)
    else:
        ejac_avg_gap = None

    energy_in = [d for d in energy_days if in_range(d["date"], start, end)]
    energy_best = max(energy_in, key=lambda d: d["overall"]) if energy_in else None
    energy_worst = min(energy_in, key=lambda d: d["overall"]) if energy_in else None

    sperm_in = [w for w in sperm_weeks if not w.get("sample") and in_range(w["week_end"], start, end)]
    sperm_overalls = [sum(w["factors"][k] * wt for k, wt in sperm_model["weights"].items()) for w in sperm_in]
    sperm_best = sperm_in[sperm_overalls.index(max(sperm_overalls))] if sperm_overalls else None
    sperm_worst = sperm_in[sperm_overalls.index(min(sperm_overalls))] if sperm_overalls else None

    prs = [w for w in workout_entries if in_range(w["date"], start, end) and "(pr" in (w.get("notes") or "").lower()]

    training = run_training_stats(ym)

    return {
        "ym": ym, "n_days": n_days,
        "kcal_avg": safe_avg([day_tot(d, "kcal") for d in macro_days], 0),
        "protein_avg": safe_avg([day_tot(d, "protein_g") for d in macro_days], 1),
        "carbs_avg": safe_avg([day_tot(d, "carbs_g") for d in macro_days], 1),
        "fat_avg": safe_avg([day_tot(d, "fat_g") for d in macro_days], 1),
        "fiber_avg": safe_avg([day_tot(d, "fiber_g") for d in macro_days], 1),
        "protein_adherence": round(protein_hit / len(macro_days) * 100) if macro_days else None,
        "weight_avg": safe_avg([e["weight_kg"] for e in w_in], 1),
        "weight_series": [(e["date"], e["weight_kg"]) for e in w_in],
        "sleep_avg": safe_avg([e["duration_hours"] for e in s_in], 2),
        "nights_short": sum(1 for e in s_in if e["duration_hours"] < 6),
        "nights_total": len(s_in),
        "alcohol_days": len(alcohol_days),
        "ejac_count": len(ejac_in), "ejac_avg_gap": round(ejac_avg_gap, 1) if ejac_avg_gap else None,
        "energy_avg": safe_avg([d["overall"] for d in energy_in], 0),
        "energy_best": energy_best, "energy_worst": energy_worst,
        "sperm_avg": safe_avg(sperm_overalls, 0),
        "sperm_best": sperm_best, "sperm_worst": sperm_worst,
        "prs": prs,
        "sessions_count": training.get("sessions_in_month_count", 0),
        "sessions_per_week": training.get("sessions_per_week"),
        "acwr": training.get("acwr"),
        "alerts": training.get("alerts", []),
        "recommended_next": training.get("recommended_next"),
    }


def generate_recommendations(cur, prev):
    sugg = []

    if cur["sleep_avg"] is not None:
        if prev["sleep_avg"] is not None and cur["sleep_avg"] < prev["sleep_avg"] - 0.3:
            sugg.append(("Sleep", f"Sleep averaged {cur['sleep_avg']:.1f}h this month, down from "
                         f"{prev['sleep_avg']:.1f}h last month ({cur['nights_short']}/{cur['nights_total']} "
                         f"nights under 6h) — the single biggest lever left on both the energy and sperm scores."))
        elif prev["sleep_avg"] is not None and cur["sleep_avg"] > prev["sleep_avg"] + 0.3:
            sugg.append(("Sleep", f"Sleep improved to {cur['sleep_avg']:.1f}h avg (from {prev['sleep_avg']:.1f}h "
                         "last month) — keep whatever changed."))

    if cur["protein_adherence"] is not None:
        if prev["protein_adherence"] is not None and cur["protein_adherence"] > prev["protein_adherence"] + 5:
            sugg.append(("Nutrition", f"Protein-target adherence rose to {cur['protein_adherence']}% of days "
                         f"(from {prev['protein_adherence']}% last month) — whatever's driving it is working."))
        elif cur["protein_adherence"] < 50:
            sugg.append(("Nutrition", f"Protein target hit on only {cur['protein_adherence']}% of days this "
                         "month — worth a deliberate push, it's the most direct lever on the muscle-retention goal."))

    if cur["acwr"] is not None and prev["acwr"] is not None:
        if cur["acwr"] > prev["acwr"] + 0.15 and cur["acwr"] >= 1.0:
            sugg.append(("Training", f"Training load ratio drifted from {prev['acwr']:.2f} to {cur['acwr']:.2f}, "
                         "edging toward the caution band — a lighter week would reset it before it compounds "
                         "into a real overreach."))
        elif cur["acwr"] < 0.8:
            sugg.append(("Training", f"Load ratio sits at {cur['acwr']:.2f}, in the undertraining zone — "
                         "there's room to add volume without injury risk."))

    if cur["alcohol_days"] != prev["alcohol_days"]:
        if cur["alcohol_days"] < prev["alcohol_days"]:
            sugg.append(("Sperm", f"Alcohol frequency dropped from {prev['alcohol_days']} to "
                         f"{cur['alcohol_days']} day(s) this month — a real contributor to any sperm-score gain."))
        else:
            sugg.append(("Sperm", f"Alcohol logged on {cur['alcohol_days']} days this month (was "
                         f"{prev['alcohol_days']}) — worth watching against the <=1/week baseline."))

    push_pull = next((a for a in cur["alerts"] if "Push volume" in a or "pull" in a.lower()), None)
    if push_pull:
        sugg.append(("Balance", push_pull))

    return sugg[:5]


def render(ym, cur, prev, profile, latest_weight_entry):
    t = profile["targets"]
    lo_t, hi_t = profile["goals"]["target_weight_kg"]

    def d(cur_v, prev_v):
        return None if cur_v is None or prev_v is None else cur_v - prev_v

    chips_html = ""
    chip_defs = [
        (f"{cur['sperm_avg']:.0f}" if cur['sperm_avg'] is not None else "—",
         *delta_chip(d(cur['sperm_avg'], prev['sperm_avg']), "", True), "Avg sperm score"),
        (f"{cur['energy_avg']:.0f}" if cur['energy_avg'] is not None else "—",
         *delta_chip(d(cur['energy_avg'], prev['energy_avg']), "", True), "Avg energy score"),
        (f"{cur['weight_avg']:.1f} kg" if cur['weight_avg'] is not None else "—",
         *delta_chip(d(cur['weight_avg'], prev['weight_avg']), " kg", False), "Avg weight"),
        (f"{cur['protein_adherence']}%" if cur['protein_adherence'] is not None else "—",
         *delta_chip(d(cur['protein_adherence'], prev['protein_adherence']), "", True, pp=True), "Protein-target days"),
    ]
    for val, delta_txt, delta_cls, label in chip_defs:
        chips_html += (f'<div class="chip"><div class="chip-v">{val}</div>'
                        f'<div class="chip-delta {delta_cls}">{delta_txt}</div>'
                        f'<div class="chip-k">{label}</div></div>')

    macro_rows = (
        bar(cur["kcal_avg"], t["calories_kcal"], "Calories (kcal)", reverse_over=True)
        + bar(cur["protein_avg"], t["protein_g"], "Protein (g)")
        + bar(cur["carbs_avg"], t["carbs_g"], "Carbs (g)")
        + bar(cur["fat_avg"], t["fat_g"], "Fat (g)", reverse_over=True)
        + bar(cur["fiber_avg"], t["fiber_g"], "Fiber (g)")
    )

    weight_spark = month_sparkline(cur["weight_series"], prev["weight_series"],
                                    month_label(ym), month_label(prev["ym"]))

    acwr = cur["acwr"]
    acwr_color = "#8b9bb0" if acwr is None else ("#ef4444" if acwr > 1.5 else "#f59e0b" if acwr >= 1.3 else "#22c55e")
    acwr_delta = ""
    if acwr is not None and prev["acwr"] is not None:
        diff = acwr - prev["acwr"]
        acwr_delta = f"<div class='chip-delta {'up-bad' if diff>0.05 else 'up-good' if diff<-0.05 else 'muted'}'>{'▲' if diff>=0 else '▼'} from {prev['acwr']:.2f}</div>"
    def _truncate(s, n=140):
        return s if len(s) <= n else s[:n].rsplit(" ", 1)[0] + "…"

    pr_items = "".join(
        f"<li><span class='pr-star'>★</span><b>{p['date']}</b> — {_truncate(p.get('notes',''))}</li>"
        for p in cur["prs"]
    ) or "<li class='muted'>No PRs logged this month.</li>"

    training_panel = f"""
    <div class="panel span">
      <h2>Training Summary</h2>
      <div class="chips">
        <div class="chip"><div class="chip-v">{cur['sessions_count']}</div>
          <div class="chip-delta muted">pace ~{cur['sessions_per_week'] or '–'}/wk · {prev['ym']} had {prev['sessions_count']}</div>
          <div class="chip-k">Sessions logged</div></div>
        <div class="chip"><div class="chip-v">{len(cur['prs'])}</div>
          <div class="chip-delta muted">{prev['ym']} had {len(prev['prs'])}</div>
          <div class="chip-k">New PRs</div></div>
        <div class="chip"><div class="chip-v" style="color:{acwr_color}">{f'{acwr:.2f}' if acwr is not None else '—'}</div>
          {acwr_delta or "<div class='chip-delta muted'>no prior data</div>"}
          <div class="chip-k">Avg load ratio (ACWR)</div></div>
        <div class="chip"><div class="chip-v">{cur['recommended_next'] or '–'}</div>
          <div class="chip-delta muted">as of month end</div>
          <div class="chip-k">Recommended next</div></div>
      </div>
      <div class="two-col" style="margin-top:16px">
        <div>
          <div class="muted" style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;margin-bottom:4px">PRs this month</div>
          <ul class="pr-ul">{pr_items}</ul>
        </div>
        <div>
          <div class="muted" style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;margin-bottom:4px">Alerts, as of month end</div>
          {"".join(f"<div class='note' style='margin-bottom:8px'>{a}</div>" for a in cur['alerts']) or "<div class='muted'>No alerts.</div>"}
        </div>
      </div>
    </div>"""

    sband_cfg = profile.get("_sperm_bands") or [
        {"min": 0, "label": "Needs work", "color": "#ef4444"}, {"min": 50, "label": "Building", "color": "#f59e0b"},
        {"min": 70, "label": "Good", "color": "#3b82f6"}, {"min": 85, "label": "Optimized", "color": "#22c55e"}]
    eband_cfg = [{"min": 0, "label": "Low", "color": "#ef4444"}, {"min": 50, "label": "Moderate", "color": "#f59e0b"},
                 {"min": 70, "label": "Good", "color": "#3b82f6"}, {"min": 85, "label": "High", "color": "#22c55e"}]

    scores_panel = "<div class='panel'><h2>Sperm &amp; Energy Score · monthly average</h2><div class='ring-row'>"
    if cur["sperm_avg"] is not None:
        b = band_for(cur["sperm_avg"], sband_cfg)
        scores_panel += ring(cur["sperm_avg"], b["color"], f"Sperm · {b['label']}")
    if cur["energy_avg"] is not None:
        b = band_for(cur["energy_avg"], eband_cfg)
        scores_panel += ring(cur["energy_avg"], b["color"], f"Energy · {b['label']}")
    scores_panel += "</div>"
    best_worst = []
    if cur["sperm_best"] and cur["sperm_worst"] and cur["sperm_best"] != cur["sperm_worst"]:
        best_worst.append(f"Best week: sperm score, week ending {cur['sperm_best']['week_end']}. "
                           f"Worst week: week ending {cur['sperm_worst']['week_end']}.")
    if cur["energy_best"] and cur["energy_worst"] and cur["energy_best"] != cur["energy_worst"]:
        best_worst.append(f"Best day: energy {cur['energy_best']['overall']} ({cur['energy_best']['date']}). "
                           f"Worst day: {cur['energy_worst']['overall']} ({cur['energy_worst']['date']}).")
    if best_worst:
        scores_panel += f"<div class='note' style='margin-top:14px'>{' '.join(best_worst)}</div>"
    scores_panel += "</div>"

    def pp_row(label, cur_v, prev_v, fmt="{:.1f}", good_dir=1, unit=""):
        if cur_v is None:
            cur_s = "—"
        else:
            cur_s = fmt.format(cur_v) + unit
        prev_s = "—" if prev_v is None else fmt.format(prev_v) + unit
        if cur_v is None or prev_v is None:
            delta_s, color = "—", "var(--muted)"
        else:
            diff = cur_v - prev_v
            good = (diff > 0) == (good_dir > 0)
            color = "var(--good)" if abs(diff) < 1e-9 or good else "var(--bad)" if good_dir != 0 else "var(--muted)"
            sign = "+" if diff > 0 else ""
            delta_s = f"{sign}{fmt.format(diff)}{unit}"
        return f"<tr><td>{label}</td><td class='num'>{cur_s}</td><td class='num'>{prev_s}</td><td class='num' style='color:{color}'>{delta_s}</td></tr>"

    table_rows = (
        pp_row("Avg weight (kg)", cur["weight_avg"], prev["weight_avg"], good_dir=-1)
        + pp_row("Avg sperm score", cur["sperm_avg"], prev["sperm_avg"], fmt="{:.0f}", good_dir=1)
        + pp_row("Avg energy score", cur["energy_avg"], prev["energy_avg"], fmt="{:.0f}", good_dir=1)
        + pp_row("Avg daily protein (g)", cur["protein_avg"], prev["protein_avg"], fmt="{:.0f}", good_dir=1)
        + pp_row("Protein-target adherence (%)", cur["protein_adherence"], prev["protein_adherence"], fmt="{:.0f}", good_dir=1)
        + pp_row("Sessions logged", cur["sessions_count"], prev["sessions_count"], fmt="{:.0f}", good_dir=0)
        + pp_row("Avg sleep (h)", cur["sleep_avg"], prev["sleep_avg"], good_dir=1)
        + pp_row("Alcohol days", cur["alcohol_days"], prev["alcohol_days"], fmt="{:.0f}", good_dir=-1)
        + pp_row("Avg load ratio (ACWR)", cur["acwr"], prev["acwr"], fmt="{:.2f}", good_dir=0)
    )

    sugg = generate_recommendations(cur, prev)
    sugg_html = ("<ul class='sugg-ul'>" + "".join(
        f"<li><b class='tag'>{tag}</b>{text}</li>" for tag, text in sugg) + "</ul>") if sugg \
        else "<p class='muted'>Not enough month-over-month signal yet.</p>"

    lifestyle_panel = f"""
    <div class="panel">
      <h2>Lifestyle</h2>
      <div class="metric">
        <div class="metric-top"><span>Alcohol days</span><span class="vals">{cur['alcohol_days']} <span class="muted">/ {cur['n_days']} days ({prev['ym']}: {prev['alcohol_days']})</span></span></div>
        <div class="track"><div class="fill" style="width:{clamp(cur['alcohol_days']/max(cur['n_days'],1)*100)}%;background:{'#22c55e' if cur['alcohol_days']<=4 else '#f59e0b'}"></div></div>
      </div>
      <div class="metric">
        <div class="metric-top"><span>Avg sleep</span><span class="vals">{f"{cur['sleep_avg']:.2f}h" if cur['sleep_avg'] is not None else '—'} <span class="muted">({prev['ym']}: {f"{prev['sleep_avg']:.2f}h" if prev['sleep_avg'] is not None else '—'})</span></span></div>
        <div class="track"><div class="fill" style="width:{clamp((cur['sleep_avg'] or 0)/9*100)}%;background:{'#22c55e' if (cur['sleep_avg'] or 0)>=7 else '#f59e0b'}"></div></div>
      </div>
      <div class="metric">
        <div class="metric-top"><span>Nights &lt; 6h</span><span class="vals">{cur['nights_short']} <span class="muted">/ {cur['nights_total']} ({prev['ym']}: {prev['nights_short']}/{prev['nights_total']})</span></span></div>
        <div class="track"><div class="fill" style="width:{clamp(cur['nights_short']/max(cur['nights_total'],1)*100)}%;background:{'#ef4444' if cur['nights_short']>cur['nights_total']/3 else '#f59e0b'}"></div></div>
      </div>
      <div class="metric">
        <div class="metric-top"><span>Ejaculatory frequency</span><span class="vals">{f"~{cur['ejac_avg_gap']}d avg gap" if cur['ejac_avg_gap'] else f"{cur['ejac_count']} logged"} <span class="muted">(target 1-2d)</span></span></div>
        <div class="track"><div class="fill" style="width:{clamp(100 - (cur['ejac_avg_gap'] or 3)*20)}%;background:#3b82f6"></div></div>
      </div>
    </div>"""

    body_panel = f"""
    <div class="panel">
      <h2>Weight &amp; Body Composition · trend</h2>
      <div class="bignum">{f"{cur['weight_avg']:.1f}" if cur['weight_avg'] is not None else "—"}<small> kg avg</small></div>
      <div class="goalline">Target {lo_t}-{hi_t} kg · {f"{prev['ym']} avg was {prev['weight_avg']:.1f} kg" if prev['weight_avg'] is not None else "no prior data"}</div>
      {weight_spark}
    </div>"""

    days_note = (f"Nutrition logged on {cur['n_days']} day(s) this month vs {prev['n_days']} last month. "
                 if cur['n_days'] or prev['n_days'] else "")
    best_month = ("Best month of tracking so far — "
                  if cur.get('sperm_avg') and prev.get('sperm_avg') and cur['sperm_avg'] > prev['sperm_avg'] else "")
    exec_note = f"{days_note}{best_month}See Recommendations below for what moved and what to watch."

    nice_month = month_label(ym)
    generated = datetime.now().strftime("%Y-%m-%d %H:%M")

    html = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Monthly Recap · {nice_month}</title>
<style>
  :root {{ --bg:#0b0f17; --panel:#131a26; --panel2:#0f1622; --line:#1f2a3a;
           --text:#e6edf3; --muted:#8b9bb0; --accent:#38bdf8;
           --good:#22c55e; --warn:#f59e0b; --bad:#ef4444; --info:#3b82f6; }}
  * {{ box-sizing:border-box; }}
  html,body {{ margin:0; padding:0; background:var(--bg); }}
  body {{ color:var(--text);
          font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }}
  .wrap {{ max-width:1100px; margin:0 auto; padding:24px 18px 60px; }}
  header.top {{ display:flex; justify-content:space-between; align-items:flex-end;
                flex-wrap:wrap; gap:12px; margin-bottom:20px; }}
  .title {{ font-size:22px; font-weight:700; }}
  .subtitle {{ color:var(--muted); }}
  .daychip {{ background:linear-gradient(135deg,#1d4ed8,#0ea5e9); color:#fff;
              padding:8px 14px; border-radius:12px; font-weight:700; white-space:nowrap; }}
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
  .fill {{ height:100%; border-radius:6px; }}
  .bignum {{ font-size:40px; font-weight:800; line-height:1; font-variant-numeric:tabular-nums; }}
  .bignum small {{ font-size:16px; color:var(--muted); font-weight:600; }}
  .goalline {{ color:var(--muted); margin-top:6px; }}
  .chips {{ display:grid; grid-template-columns:repeat(4,1fr); gap:10px; }}
  .chip {{ background:var(--panel2); border:1px solid var(--line); border-radius:10px;
           padding:12px 10px; text-align:center; }}
  .chip-v {{ font-size:19px; font-weight:700; font-variant-numeric:tabular-nums; }}
  .chip-delta {{ font-size:12px; font-weight:700; margin-top:3px; font-variant-numeric:tabular-nums; }}
  .chip-k {{ font-size:11px; color:var(--muted); margin-top:3px; }}
  .up-good {{ color:var(--good); }} .up-bad {{ color:var(--bad); }}
  .spark-wrap{{ margin-top:6px; }}
  .spark-legend {{ display:flex; gap:16px; font-size:11px; color:var(--muted); margin-top:6px; }}
  .spark-legend span::before {{ content:""; display:inline-block; width:10px; height:2px;
    margin-right:5px; vertical-align:middle; }}
  table {{ width:100%; border-collapse:collapse; }}
  th,td {{ text-align:left; padding:9px 8px; border-bottom:1px solid var(--line); font-size:13.5px; }}
  th {{ color:var(--muted); font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:.05em; }}
  td.num, th.num {{ text-align:right; font-variant-numeric:tabular-nums; }}
  .dtable-wrap {{ overflow-x:auto; }}
  .ring-wrap {{ display:flex; flex-direction:column; align-items:center; }}
  .ring-num {{ fill:var(--text); font-size:26px; font-weight:800; }}
  .ring-sub {{ fill:var(--muted); font-size:10px; }}
  .ring-label {{ font-weight:700; margin-top:6px; font-size:13px; }}
  .ring-row {{ display:flex; gap:28px; justify-content:space-around; flex-wrap:wrap; }}
  .note {{ background:var(--panel2); border-left:3px solid var(--accent);
           padding:10px 12px; border-radius:8px; color:var(--text); margin-top:4px; font-size:13.5px; }}
  .sugg-ul {{ list-style:none; margin:0; padding:0; }}
  .sugg-ul li {{ font-size:14px; padding:10px 0 10px 16px; border-bottom:1px solid var(--line);
                 border-left:3px solid var(--accent); background:var(--panel2); border-radius:6px;
                 margin-bottom:8px; }}
  .sugg-ul li:last-child {{ margin-bottom:0; }}
  .sugg-ul li b.tag {{ display:inline-block; font-size:10.5px; letter-spacing:.04em; text-transform:uppercase;
    color:var(--bg); background:var(--accent); padding:2px 7px; border-radius:5px; margin-right:8px;
    font-weight:700; vertical-align:2px; }}
  .pr-ul {{ list-style:none; margin:10px 0 0; padding:0; }}
  .pr-ul li {{ font-size:13.5px; padding:7px 0; border-bottom:1px solid var(--line); }}
  .pr-ul li:last-child {{ border-bottom:none; }}
  .pr-ul .pr-star {{ color:var(--good); margin-right:6px; }}
  .two-col {{ display:grid; grid-template-columns:1.3fr 1fr; gap:18px; }}
  .footer {{ color:var(--muted); font-size:12px; text-align:center; margin-top:26px; }}
  @media(max-width:720px){{ .grid{{grid-template-columns:1fr;}} .chips{{grid-template-columns:repeat(2,1fr);}}
    .two-col{{grid-template-columns:1fr;}} .ring-row{{gap:16px;}} }}
</style></head>
<body><div class="wrap">

  <header class="top">
    <div>
      <div class="title">Monthly Recap</div>
      <div class="subtitle">{nice_month} · {cur['n_days']} day(s) logged · vs {month_label(prev['ym'])}</div>
    </div>
    <div class="daychip">{ym}</div>
  </header>

  <div class="grid">

    <div class="panel span">
      <h2>Executive Summary</h2>
      <div class="chips">{chips_html}</div>
      <div class="note" style="margin-top:14px">{exec_note}</div>
    </div>

    <div class="panel">
      <h2>Nutrition · monthly average vs target</h2>
      {macro_rows}
    </div>

    {body_panel}
{training_panel}
    {scores_panel}
    {lifestyle_panel}

    <div class="panel span">
      <h2>{nice_month} vs {month_label(prev['ym'])}</h2>
      <div class="dtable-wrap">
        <table>
          <thead><tr><th>Metric</th><th class="num">{ym}</th><th class="num">{prev['ym']}</th><th class="num">Δ</th></tr></thead>
          <tbody>{table_rows}</tbody>
        </table>
      </div>
    </div>

    <div class="panel span">
      <h2>Recommendations</h2>
      {sugg_html}
    </div>

  </div>

  <div class="footer">Generated {generated} · Monthly Recap · same visual system as the daily dashboards</div>
</div></body></html>"""

    out_dir = os.path.join(ROOT, "dashboards", "monthly")
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, f"{ym}.html")
    with open(out, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"Wrote {out}  (days {cur['n_days']}, sperm avg {cur['sperm_avg']}, energy avg {cur['energy_avg']}, "
          f"sessions {cur['sessions_count']}, PRs {len(cur['prs'])})")


def build(ym):
    profile = load("profile.json")
    sperm = load("data/metrics/sperm.json")
    weight = load("data/metrics/weight.json")
    all_days = load_all_intake_days()
    try:
        lifestyle = load("data/metrics/lifestyle.json")
    except FileNotFoundError:
        lifestyle = {"events": []}
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
        energy_store = {"days": []}
    try:
        workouts = load("data/metrics/workouts.json")
    except FileNotFoundError:
        workouts = {"entries": []}

    pym = prev_month(ym)
    args = (profile, sperm["model"], all_days, weight["entries"], sleep.get("entries", []),
            lifestyle.get("events", []), ejaculation.get("entries", []), energy_store.get("days", []),
            sperm.get("weeks", []), workouts.get("entries", []))
    cur = aggregate_month(ym, *args)
    prev = aggregate_month(pym, *args)

    render(ym, cur, prev, profile, weight["entries"][-1] if weight["entries"] else None)


if __name__ == "__main__":
    build(pick_month(sys.argv[1] if len(sys.argv) > 1 else None))
