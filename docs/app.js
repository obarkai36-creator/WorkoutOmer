/* WorkoutOmer interactive dashboard — vanilla JS, no build step.
 * Reads docs/data/index.json (lightweight rollup of every logged day) and
 * docs/data/<date>.json (full per-day bundle, fetched lazily + cached) and
 * renders tabs on top of them. Data itself is produced by
 * intake/export_site_data.py, which reuses generate_dashboard.py's compute
 * functions so these numbers and the emailed HTML dashboard never drift. */

const COLORS = {
  green: "#22c55e", amber: "#f59e0b", red: "#ef4444", blue: "#38bdf8", muted: "#8b9bb0",
};

const MICRO_META = {
  zinc_mg: { label: "Zinc", unit: "mg", tip: "Zinc capsule, oysters, pumpkin seeds, beef" },
  selenium_mcg: { label: "Selenium", unit: "mcg", tip: "Brazil nuts (1-2 ≈ daily target), fish, eggs" },
  folate_mcg_dfe: { label: "Folate (DFE)", unit: "mcg", tip: "Leafy greens, legumes, fortified grains" },
  omega3_epa_dha_mg: { label: "Omega-3 EPA/DHA", unit: "mg", tip: "Fatty fish (salmon, sea bream), fish-oil softgel" },
  vitamin_c_mg: { label: "Vitamin C", unit: "mg", tip: "Citrus, peppers, tomatoes" },
  vitamin_d_iu: { label: "Vitamin D", unit: "IU", tip: "Fatty fish, eggs, sun exposure, D3 supplement" },
  vitamin_e_mg: { label: "Vitamin E", unit: "mg", tip: "Nuts, seeds, olive oil" },
  lycopene_mg: { label: "Lycopene", unit: "mg", tip: "Tomatoes (cooked concentrates it), watermelon" },
};

const SPERM_FACTOR_META = {
  nutrition: "Protein / fiber / calorie adherence, averaged over the trailing 7 days.",
  body_composition: "Actual weekly weight-loss pace vs. the ~0.4kg/week target.",
  sleep: "Share of nights in the 7-9h band this week.",
  alcohol: "Severity + frequency of drinking events this week (baseline: ≤1/week).",
  heat_travel_exposure: "Scrotal heat / travel exposure events this week.",
  smoking: "Static from profile lifestyle settings.",
  ejaculatory_frequency: "Regular 1-2 day intervals score best; long gaps score lower.",
};

const state = {
  index: null,
  dates: [],
  current: null,
  cache: {},
  tab: "overview",
  charts: {},
};

async function fetchJson(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

function fmt(n, digits = 0) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function pctColor(pct, mode) {
  if (pct === null || pct === undefined) return COLORS.muted;
  if (mode === "moreIsFine") {
    if (pct >= 100) return COLORS.green;
    if (pct >= 70) return COLORS.amber;
    return COLORS.red;
  }
  if (mode === "ceiling") {
    if (pct >= 85 && pct <= 115) return COLORS.green;
    if (pct >= 60 && pct <= 140) return COLORS.amber;
    return COLORS.red;
  }
  // default: micro-style, more-is-fine up to a point
  if (pct >= 100) return COLORS.green;
  if (pct >= 50) return COLORS.amber;
  return COLORS.red;
}

function scoreColor(score, bands) {
  if (score === null || score === undefined) return COLORS.muted;
  let chosen = bands[0];
  for (const b of bands) if (score >= b.min) chosen = b;
  return chosen.color;
}

function scoreLabel(score, bands) {
  if (score === null || score === undefined) return "—";
  let chosen = bands[0];
  for (const b of bands) if (score >= b.min) chosen = b;
  return chosen.label;
}

function metricBar({ label, consumed, target, pct, unit = "", mode = "ceiling", note = "", tip = "" }) {
  const color = pctColor(pct, mode);
  const width = Math.max(2, Math.min(100, pct === null ? 0 : pct));
  const valsTxt = target ? `${fmt(consumed, unit === "IU" || unit === "mcg" ? 0 : 1)}${unit ? " " + unit : ""} / ${fmt(target, 0)}${unit ? " " + unit : ""} (${pct === null ? "—" : pct + "%"})`
    : `${fmt(consumed, 1)}${unit ? " " + unit : ""}`;
  return `
  <div class="metric">
    <div class="metric-top"><span>${label}</span><span class="vals">${valsTxt}</span></div>
    <div class="track"><div class="fill" style="width:${width}%;background:${color}"></div></div>
    ${note ? `<div class="metric-note">${note}</div>` : ""}
    ${tip && pct !== null && pct < (mode === "ceiling" ? 60 : 100) ? `<div class="metric-tip">💡 ${tip}</div>` : ""}
  </div>`;
}

function chip(value, label, color) {
  return `<div class="chip"><div class="chip-v" style="${color ? `color:${color}` : ""}">${value}</div><div class="chip-k">${label}</div></div>`;
}

function badge(text, colorKey) {
  return `<span class="badge ${colorKey}">${text}</span>`;
}

function ringSvg(score, bands, label, size = 120) {
  const color = scoreColor(score, bands);
  const r = size / 2 - 10;
  const c = 2 * Math.PI * r;
  const frac = score === null ? 0 : Math.max(0, Math.min(100, score)) / 100;
  return `
  <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--line)" stroke-width="10"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="10"
      stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - frac)}" stroke-linecap="round"
      transform="rotate(-90 ${size / 2} ${size / 2})"/>
    <text x="50%" y="47%" text-anchor="middle" class="ring-num">${score === null ? "—" : score}</text>
    <text x="50%" y="64%" text-anchor="middle" class="ring-sub">${label}</text>
  </svg>`;
}

function destroyChart(id) {
  if (state.charts[id]) { state.charts[id].destroy(); delete state.charts[id]; }
}

function lineChart(canvasId, labels, datasets, opts = {}) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  state.charts[canvasId] = new Chart(ctx, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { ticks: { color: COLORS.muted, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 }, grid: { color: "#1f2a3a" } },
        y: { ticks: { color: COLORS.muted }, grid: { color: "#1f2a3a" }, ...(opts.yMin !== undefined ? { min: opts.yMin } : {}), ...(opts.yMax !== undefined ? { max: opts.yMax } : {}) },
      },
      plugins: { legend: { labels: { color: COLORS.muted, boxWidth: 12, font: { size: 11 } } } },
      ...opts.extra,
    },
  });
}

/* ---------------- data loading ---------------- */

async function loadIndex() {
  state.index = await fetchJson("data/index.json");
  state.dates = state.index.days.map((d) => d.date);
}

async function loadDay(date) {
  if (!state.cache[date]) state.cache[date] = await fetchJson(`data/${date}.json`);
  return state.cache[date];
}

function indexRow(date) {
  return state.index.days.find((d) => d.date === date);
}

function trailingRows(date, n) {
  const idx = state.dates.indexOf(date);
  const start = Math.max(0, idx - n + 1);
  return state.index.days.slice(start, idx + 1);
}

// Two distinct reasons a day's macro totals aren't real data points: it's
// still being logged (typically "today", in_progress) or food tracking was
// skipped/incomplete that day on purpose (exclude_from_monthly_macros — set
// on days like a travel-mode stretch or an untracked restaurant dinner).
// Either way it reads as a false low-calorie/protein dip on a macro trend
// chart — filter both out of macro-tracking charts specifically (not sleep/
// weight/retainer charts, which aren't affected by food-logging completeness).
function excludeUntracked(rows) {
  return rows.filter((r) => !r.in_progress && !r.exclude_from_monthly_macros);
}

/* ---------------- navigation ---------------- */

function setDate(date, pushToPicker = true) {
  if (!state.dates.includes(date)) return;
  state.current = date;
  if (pushToPicker) document.getElementById("datePick").value = date;
  updateNavButtons();
  renderCurrent();
}

function updateNavButtons() {
  const idx = state.dates.indexOf(state.current);
  document.getElementById("prevDay").disabled = idx <= 0;
  document.getElementById("nextDay").disabled = idx >= state.dates.length - 1;
}

function wireNav() {
  document.getElementById("prevDay").addEventListener("click", () => {
    const idx = state.dates.indexOf(state.current);
    if (idx > 0) setDate(state.dates[idx - 1]);
  });
  document.getElementById("nextDay").addEventListener("click", () => {
    const idx = state.dates.indexOf(state.current);
    if (idx < state.dates.length - 1) setDate(state.dates[idx + 1]);
  });
  document.getElementById("jumpLatest").addEventListener("click", () => setDate(state.dates[state.dates.length - 1]));
  document.getElementById("datePick").addEventListener("change", (e) => {
    let d = e.target.value;
    if (!state.dates.includes(d)) {
      // snap to nearest logged date
      d = state.dates.reduce((best, cur) => (Math.abs(new Date(cur) - new Date(d)) < Math.abs(new Date(best) - new Date(d)) ? cur : best));
    }
    setDate(d);
  });
  document.querySelectorAll("nav.tabs button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("nav.tabs button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.tab = btn.dataset.tab;
      renderCurrent();
    });
  });
}

/* ---------------- render dispatch ---------------- */

async function renderCurrent() {
  const content = document.getElementById("content");
  content.innerHTML = '<div class="loading">Loading…</div>';
  let day;
  try {
    day = await loadDay(state.current);
  } catch (err) {
    content.innerHTML = `<div class="empty-state">Couldn't load data for ${state.current}: ${err.message}</div>`;
    return;
  }
  const row = indexRow(state.current);
  document.getElementById("subtitle").textContent =
    `Day ${day.day_number ?? "?"} of ${state.index.days_logged} · ${state.current}` +
    (day.in_progress ? " · in progress" : "");

  const renderers = {
    overview: renderOverview, nutrition: renderNutrition, training: renderTraining,
    bodycomp: renderBodyComp, sperm: renderSperm, lifestyle: renderLifestyle,
  };
  (renderers[state.tab] || renderOverview)(day, row, content);
  document.getElementById("footer").textContent = `Data generated ${state.index.generated} · ${state.index.days_logged} days logged`;
}

/* ---------------- Overview tab ---------------- */

function renderOverview(day, row, el) {
  const t = state.index.profile_targets;
  const m = day.macros;
  const sperm = day.sperm_score;
  const energy = day.energy_score;
  const w = day.weight;

  const chips = [
    chip(day.workout_today ? "Yes" : "No", "Workout today", day.workout_today ? COLORS.green : COLORS.muted),
    chip(energy ? energy.overall : "—", "Energy score", energy ? scoreColor(energy.overall, state.index.energy_bands) : COLORS.muted),
    chip(sperm ? sperm.overall : "locked", "Sperm score", sperm ? scoreColor(sperm.overall, state.index.sperm_bands) : COLORS.muted),
    chip(w ? fmt(w.weight_kg, 2) + " kg" : "—", "Weigh-in"),
    chip(day.caffeine_shots ?? "—", "Caffeine shots"),
    chip(`${day.supplement_compliance.filter((s) => s.taken || s.met_via_food).length}/${day.supplement_compliance.length}`, "Supplements"),
  ];
  el.innerHTML = `
  <div class="chipstrip">${chips.join("")}</div>
  <div class="grid">
    <div class="panel">
      <h2>Macros</h2>
      ${metricBar({ label: "Calories", consumed: m.calories.consumed, target: m.calories.target, pct: m.calories.pct, unit: "kcal" })}
      ${metricBar({ label: "Protein", consumed: m.protein_g.consumed, target: m.protein_g.target, pct: m.protein_g.pct, unit: "g", mode: "moreIsFine" })}
      ${metricBar({ label: "Carbs", consumed: m.carbs_g.consumed, target: m.carbs_g.target, pct: m.carbs_g.pct, unit: "g" })}
      ${metricBar({ label: "Fat", consumed: m.fat_g.consumed, target: m.fat_g.target, pct: m.fat_g.pct, unit: "g" })}
      ${metricBar({ label: "Fiber", consumed: m.fiber_g.consumed, target: m.fiber_g.target, pct: m.fiber_g.pct, unit: "g", mode: "moreIsFine" })}
    </div>
    <div class="panel">
      <h2>14-day trend</h2>
      <div class="chart-box small"><canvas id="ov-kcal"></canvas></div>
      <div class="chart-box small" style="margin-top:10px"><canvas id="ov-protein"></canvas></div>
    </div>
    <div class="panel span">
      <h2>Status note</h2>
      <div class="status-note">${day.status_note || "No status note for this day."}</div>
    </div>
    ${day.suggestions && day.suggestions.length ? `
    <div class="panel span">
      <h2>Suggestions &amp; recommendations <span class="small muted">(current, as of the latest logged day)</span></h2>
      <ul class="plain tips">${day.suggestions.map((s) => `<li>💡 ${s}</li>`).join("")}</ul>
    </div>` : ""}
  </div>`;

  const rows = excludeUntracked(trailingRows(state.current, 14));
  lineChart("ov-kcal",
    rows.map((r) => r.date.slice(5)),
    [
      { label: "Calories", data: rows.map((r) => r.calories), borderColor: COLORS.blue, backgroundColor: "transparent", tension: .3 },
      { label: "Target", data: rows.map(() => t.calories_kcal), borderColor: COLORS.amber, borderDash: [5, 4], pointRadius: 0, backgroundColor: "transparent" },
    ]);
  lineChart("ov-protein",
    rows.map((r) => r.date.slice(5)),
    [
      { label: "Protein (g)", data: rows.map((r) => r.protein_g), borderColor: COLORS.green, backgroundColor: "transparent", tension: .3 },
      { label: "Target", data: rows.map(() => t.protein_g), borderColor: COLORS.amber, borderDash: [5, 4], pointRadius: 0, backgroundColor: "transparent" },
    ]);
}

/* ---------------- Nutrition tab ---------------- */

function renderNutrition(day, row, el) {
  const m = day.macros;
  const micros = day.micros;
  const itemsRows = (day.items || []).map((i) => `
    <tr>
      <td class="t-time">${i.time || ""}</td>
      <td>${i.name}${i.note ? `<div class="small muted">${i.note}</div>` : ""}</td>
      <td>${i.qty || ""}</td>
      <td class="num">${fmt(i.kcal, 0)}</td>
      <td class="num">${fmt(i.protein_g, 1)}</td>
      <td class="num">${fmt(i.carbs_g, 1)}</td>
      <td class="num">${fmt(i.fat_g, 1)}</td>
      <td class="num">${fmt(i.fiber_g, 1)}</td>
    </tr>`).join("");

  el.innerHTML = `
  <div class="grid">
    <div class="panel">
      <h2>Macros — ${state.current}</h2>
      ${metricBar({ label: "Calories", consumed: m.calories.consumed, target: m.calories.target, pct: m.calories.pct, unit: "kcal" })}
      ${metricBar({ label: "Protein", consumed: m.protein_g.consumed, target: m.protein_g.target, pct: m.protein_g.pct, unit: "g", mode: "moreIsFine" })}
      ${metricBar({ label: "Carbs", consumed: m.carbs_g.consumed, target: m.carbs_g.target, pct: m.carbs_g.pct, unit: "g" })}
      ${metricBar({ label: "Fat", consumed: m.fat_g.consumed, target: m.fat_g.target, pct: m.fat_g.pct, unit: "g" })}
      ${metricBar({ label: "Fiber", consumed: m.fiber_g.consumed, target: m.fiber_g.target, pct: m.fiber_g.pct, unit: "g", mode: "moreIsFine" })}
    </div>
    <div class="panel">
      <h2>Sperm-priority micros</h2>
      ${Object.entries(MICRO_META).map(([key, meta]) => {
        const v = micros[key] || { consumed: 0, target: 0, pct: null };
        return metricBar({ label: meta.label, consumed: v.consumed, target: v.target, pct: v.pct, unit: meta.unit, tip: meta.tip });
      }).join("")}
    </div>
    <div class="panel span">
      <h2>Full history — calories &amp; macros</h2>
      <div class="chart-box"><canvas id="nu-all"></canvas></div>
    </div>
    <div class="panel span">
      <h2>Logged items — ${state.current}</h2>
      ${itemsRows ? `
      <div style="overflow-x:auto">
      <table>
        <thead><tr><th>Time</th><th>Item</th><th>Qty</th><th class="num">Kcal</th><th class="num">P</th><th class="num">C</th><th class="num">F</th><th class="num">Fib</th></tr></thead>
        <tbody>${itemsRows}</tbody>
      </table></div>` : `<div class="empty-state">No items logged this day.</div>`}
    </div>
  </div>`;

  const rows = excludeUntracked(state.index.days);
  lineChart("nu-all",
    rows.map((r) => r.date.slice(5)),
    [
      { label: "Calories", data: rows.map((r) => r.calories), borderColor: COLORS.blue, backgroundColor: "transparent", tension: .2, pointRadius: 0 },
      { label: "Protein (g)", data: rows.map((r) => r.protein_g), borderColor: COLORS.green, backgroundColor: "transparent", tension: .2, pointRadius: 0 },
      { label: "Fat (g)", data: rows.map((r) => r.fat_g), borderColor: COLORS.amber, backgroundColor: "transparent", tension: .2, pointRadius: 0 },
      { label: "Fiber (g)", data: rows.map((r) => r.fiber_g), borderColor: "#a78bfa", backgroundColor: "transparent", tension: .2, pointRadius: 0 },
    ]);
}

/* ---------------- Training tab ---------------- */

function renderTraining(day, row, el) {
  const isLatest = state.current === state.dates[state.dates.length - 1];
  let liveHtml = "";
  if (isLatest && day.training) {
    const rec = day.training;
    const exRows = (rec.suggestedExercises || []).map((e) => `
      <tr>
        <td>${e.name}${e.preferred ? ` <span class="badge blue" title="Corrects the current imbalance — prioritize this one">★ preferred</span>` : ""}</td>
        <td>${e.best || ""}</td>
        <td>${e.target ? e.target.text : ""}</td>
      </tr>`).join("");
    const ranked = (rec.ranked || []).map((s) => `
      <tr>
        <td>${s.section}</td>
        <td class="num">${fmt(s.fatigue, 0)}%</td>
        <td class="num">${s.readyInHours === 0 ? "ready now" : fmt(s.readyInHours, 1) + "h"}</td>
        <td class="num">${s.daysSince === null ? "—" : fmt(s.daysSince, 1) + "d"}</td>
      </tr>`).join("");
    liveHtml = `
    <div class="panel span">
      <h2>Recommended next session <span class="small muted">(live, computed now)</span></h2>
      <div class="bignum" style="color:${COLORS.blue}">${rec.deload ? "Full Body (Deload)" : rec.section}</div>
      <div class="metric-note">Fatigue ${fmt(rec.fatigue, 0)}% · ${rec.readyNow ? "ready now" : "rest " + fmt(rec.restHours, 1) + "h"} · last trained ${rec.daysSince === null ? "never" : fmt(rec.daysSince, 1) + "d ago"}</div>
      ${rec.suggestedCount != null ? `<div class="metric-note" style="margin-top:4px">Go for <b>${rec.suggestedCount} of ${rec.totalAvailable}</b> exercises this session (typical session size: ${rec.typicalSessionSize}) — stopping there keeps this section's fatigue in check and this muscle group ready for its next session on schedule.</div>` : ""}
      ${(rec.guidance || []).length ? `<ul class="plain tips" style="margin-top:10px">${rec.guidance.map((g) => `<li>💡 ${g}</li>`).join("")}</ul>` : ""}
      ${(day.training_alerts || []).length ? `<ul class="plain tips" style="margin-top:6px">${day.training_alerts.map((a) => `<li>⚠️ <b>${a.title || ""}</b>${a.title ? " — " : ""}${a.detail || a}</li>`).join("")}</ul>` : ""}
    </div>
    <div class="panel span">
      <h2>Suggested exercises &amp; targets</h2>
      <div style="overflow-x:auto"><table>
        <thead><tr><th>Exercise</th><th>Best</th><th>Target this session</th></tr></thead>
        <tbody>${exRows}</tbody>
      </table></div>
    </div>
    <div class="panel span">
      <h2>Section readiness</h2>
      <div style="overflow-x:auto"><table>
        <thead><tr><th>Section</th><th class="num">Fatigue</th><th class="num">Rest needed</th><th class="num">Days since</th></tr></thead>
        <tbody>${ranked}</tbody>
      </table></div>
    </div>`;
  }

  const wl = day.workout_log;
  const historyHtml = `
    <div class="panel span">
      <h2>${state.current} session log</h2>
      ${day.workout_today && wl ? `
        <div class="bignum" style="font-size:20px">${wl.type}</div>
        <div class="metric-note" style="margin-top:8px">${wl.notes || ""}</div>
      ` : `<div class="empty-state">No workout logged this day.</div>`}
    </div>`;

  const rows = state.index.days.filter((r) => r.weight_kg !== null);
  el.innerHTML = `
  <div class="grid">
    ${liveHtml}
    ${historyHtml}
    <div class="panel span">
      <h2>Bodyweight trend <span class="small muted">(training-relevant load reference)</span></h2>
      <div class="chart-box"><canvas id="tr-weight"></canvas></div>
    </div>
  </div>`;

  lineChart("tr-weight", rows.map((r) => r.date.slice(5)),
    [{ label: "Bodyweight (kg)", data: rows.map((r) => r.weight_kg), borderColor: COLORS.blue, backgroundColor: "transparent", tension: .2, spanGaps: true }],
    { yMin: undefined });
}

/* ---------------- Body Composition tab ---------------- */

function renderBodyComp(day, row, el) {
  const w = day.weight;
  const goals = state.index.goals;
  const [loTarget, hiTarget] = goals.target_weight_kg || [null, null];

  let latestPanel = "<div class=\"empty-state\">No weigh-in logged this day.</div>";
  if (w) {
    const fields = [
      ["BMI", w.bmi, ""], ["Body fat %", w.body_fat_pct, "%"], ["Body fat mass", w.body_fat_mass_kg, "kg"],
      ["Muscle mass", w.muscle_mass_kg, "kg"], ["Skeletal muscle mass", w.skeletal_muscle_mass_kg, "kg"],
      ["Lean body mass", w.lean_body_mass_kg, "kg"], ["Bone mass", w.bone_mass_kg, "kg"],
      ["Water", w.water_pct, "%"], ["Visceral fat", w.visceral_fat, ""], ["Protein", w.protein_pct, "%"],
      ["Subcutaneous fat", w.subcutaneous_fat_pct, "%"], ["Resting HR", w.resting_heart_rate, "bpm"],
      ["BMR", w.bmr_kcal, "kcal"], ["Body age", w.body_age, ""], ["Body type", w.body_type, ""],
    ];
    latestPanel = `
      <div class="bignum" style="color:${COLORS.blue}">${fmt(w.weight_kg, 2)}<small>kg</small></div>
      <div class="metric-note">${loTarget ? `Goal range ${loTarget}–${hiTarget}kg · ${w.weight_kg > hiTarget ? fmt(w.weight_kg - hiTarget, 2) + "kg above range" : "within range"}` : ""}</div>
      <div class="grid" style="margin-top:14px;grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">
        ${fields.filter(([, v]) => v !== undefined && v !== null).map(([label, v, unit]) =>
          `<div class="chip"><div class="chip-v">${typeof v === "number" ? fmt(v, unit === "kg" || unit === "%" ? 1 : 0) : v}${unit ? `<small style="font-size:11px;color:var(--muted)"> ${unit}</small>` : ""}</div><div class="chip-k">${label}</div></div>`
        ).join("")}
      </div>`;
  }

  const bcFactor = day.sperm_score ? day.sperm_score.factors.body_composition : null;

  el.innerHTML = `
  <div class="grid">
    <div class="panel span">
      <h2>Latest weigh-in ${w ? `<span class="small muted">(${w.date})</span>` : ""}</h2>
      ${latestPanel}
      ${bcFactor !== null ? `<div class="metric-tip" style="margin-top:12px">Weekly pace vs. ~${goals.target_loss_rate_kg_per_week}kg/week target: <b>${bcFactor}%</b> of target pace (feeds the sperm-optimization body-composition factor).</div>` : ""}
    </div>
    <div class="panel span">
      <h2>Weight trend <span class="small muted">(full history)</span></h2>
      <div class="chart-box"><canvas id="bc-weight"></canvas></div>
    </div>
    <div class="panel">
      <h2>Body fat % trend</h2>
      <div class="chart-box small"><canvas id="bc-bf"></canvas></div>
    </div>
    <div class="panel">
      <h2>Muscle mass trend</h2>
      <div class="chart-box small"><canvas id="bc-mm"></canvas></div>
    </div>
  </div>`;

  const rows = state.index.days.filter((r) => r.weight_kg !== null);
  lineChart("bc-weight", rows.map((r) => r.date), [
    { label: "Weight (kg)", data: rows.map((r) => r.weight_kg), borderColor: COLORS.blue, backgroundColor: "transparent", tension: .2 },
    ...(loTarget ? [
      { label: "Goal low", data: rows.map(() => loTarget), borderColor: COLORS.green, borderDash: [5, 4], pointRadius: 0, backgroundColor: "transparent" },
      { label: "Goal high", data: rows.map(() => hiTarget), borderColor: COLORS.amber, borderDash: [5, 4], pointRadius: 0, backgroundColor: "transparent" },
    ] : []),
  ]);
  const bfRows = rows.filter((r) => r.body_fat_pct !== null);
  lineChart("bc-bf", bfRows.map((r) => r.date.slice(5)), [
    { label: "Body fat %", data: bfRows.map((r) => r.body_fat_pct), borderColor: COLORS.red, backgroundColor: "transparent", tension: .2 },
  ]);
  const mmRows = rows.filter((r) => r.muscle_mass_kg !== null);
  lineChart("bc-mm", mmRows.map((r) => r.date.slice(5)), [
    { label: "Muscle mass (kg)", data: mmRows.map((r) => r.muscle_mass_kg), borderColor: COLORS.green, backgroundColor: "transparent", tension: .2 },
  ]);
}

/* ---------------- Sperm Optimization tab ---------------- */

function renderSperm(day, row, el) {
  const s = day.sperm_score;
  const micros = day.micros;
  const ejacRows = (day.ejaculation_events || []).map((e) => `<li>${e.time || ""} — ${e.type}${e.note ? ` · ${e.note}` : ""}</li>`).join("");

  el.innerHTML = `
  <div class="grid">
    <div class="panel">
      <h2>Weekly sperm-optimization score</h2>
      ${s ? `
      <div class="ring-wrap">
        ${ringSvg(s.overall, state.index.sperm_bands, s.band.label)}
        <div class="small muted">Window ${s.week_start} → ${s.week_end}<br>${s.notes || ""}</div>
      </div>` : `<div class="empty-state">Locked until 14 days of logging accumulate (or not computed for this specific day).</div>`}
    </div>
    <div class="panel">
      <h2>Factors this week</h2>
      ${s ? Object.entries(s.factors).map(([k, v]) => `
        <div class="metric">
          <div class="metric-top"><span>${k.replace(/_/g, " ")}</span><span class="vals">${v}</span></div>
          <div class="track"><div class="fill" style="width:${v}%;background:${pctColor(v, "moreIsFine")}"></div></div>
          <div class="metric-note">${SPERM_FACTOR_META[k] || ""}</div>
        </div>`).join("") : `<div class="empty-state">No factor breakdown for this day.</div>`}
    </div>
    <div class="panel span">
      <h2>Sperm-priority micronutrients — ${state.current}</h2>
      ${Object.entries(MICRO_META).map(([key, meta]) => {
        const v = micros[key] || { consumed: 0, target: 0, pct: null };
        return metricBar({ label: meta.label, consumed: v.consumed, target: v.target, pct: v.pct, unit: meta.unit, tip: meta.tip });
      }).join("")}
    </div>
    <div class="panel span">
      <h2>Ejaculation log — ${state.current}</h2>
      ${ejacRows ? `<ul class="plain">${ejacRows}</ul>` : `<div class="empty-state">No event logged this day.</div>`}
    </div>
    <div class="panel span">
      <h2>Sperm score trend <span class="small muted">(full history)</span></h2>
      <div class="chart-box"><canvas id="sp-trend"></canvas></div>
    </div>
  </div>`;

  const rows = state.index.days.filter((r) => r.sperm_score !== null);
  lineChart("sp-trend", rows.map((r) => r.date.slice(5)), [
    { label: "Sperm score", data: rows.map((r) => r.sperm_score), borderColor: "#a78bfa", backgroundColor: "transparent", tension: .2 },
  ], { yMin: 0 });
}

/* ---------------- Supplements & Lifestyle tab ---------------- */

function renderLifestyle(day, row, el) {
  const suppRows = day.supplement_compliance.map((s) => {
    const ok = s.taken || s.met_via_food;
    const status = s.product_name || (s.met_via_food ? "target met via food — supplement skipped" : (s.taken ? "taken" : "not logged today"));
    return `<li><span style="color:${ok ? COLORS.green : COLORS.amber}">${ok ? "✅" : "⚠️"}</span> ${s.label} <span class="muted">· ${status}</span></li>`;
  }).join("");

  const lifeRows = (day.lifestyle_events || []).map((e) => `
    <li><b>${e.type}</b> <span class="badge ${e.severity === "high" ? "red" : e.severity === "moderate" ? "amber" : "blue"}">${e.severity}</span><br>
    <span class="small muted">${e.description || ""}${e.notes ? " — " + e.notes : ""}</span></li>`).join("");

  el.innerHTML = `
  <div class="grid">
    <div class="panel">
      <h2>Supplement &amp; medication check — ${state.current}</h2>
      <ul class="plain">${suppRows}</ul>
    </div>
    <div class="panel">
      <h2>Retainers &amp; sleep</h2>
      <div class="metric">
        <div class="metric-top"><span>Retainers</span><span class="vals">${day.retainers ? (day.retainers.worn ? "Worn" : "Skipped") : "Not logged"}</span></div>
      </div>
      ${day.sleep ? `
      <div class="metric" style="margin-top:10px">
        <div class="metric-top"><span>Sleep</span><span class="vals">${fmt(day.sleep.duration_hours, 2)}h (${day.sleep.sleep_start}–${day.sleep.sleep_end})</span></div>
        <div class="metric-note">${day.sleep.notes || ""}</div>
      </div>` : `<div class="empty-state" style="padding:14px 0">No sleep logged this day.</div>`}
    </div>
    <div class="panel span">
      <h2>Lifestyle events — ${state.current}</h2>
      ${lifeRows ? `<ul class="plain">${lifeRows}</ul>` : `<div class="empty-state">No lifestyle events logged this day.</div>`}
    </div>
    <div class="panel span">
      <h2>Supplement compliance trend <span class="small muted">(last 30 days)</span></h2>
      <div class="chart-box small"><canvas id="li-supp"></canvas></div>
    </div>
    <div class="panel span">
      <h2>Sleep trend <span class="small muted">(last 30 days)</span></h2>
      <div class="chart-box small"><canvas id="li-sleep"></canvas></div>
    </div>
    <div class="panel span">
      <h2>Retainer usage <span class="small muted">(last 30 tracked nights)</span></h2>
      ${renderRetainerStrip()}
    </div>
  </div>`;

  const rows = trailingRows(state.current, 30);
  lineChart("li-supp", rows.map((r) => r.date.slice(5)), [
    { label: "Compliance %", data: rows.map((r) => r.supplements_total ? Math.round((r.supplements_taken / r.supplements_total) * 100) : null), borderColor: COLORS.green, backgroundColor: "transparent" },
    { label: "Target", data: rows.map(() => 100), borderColor: COLORS.muted, borderDash: [4, 4], pointRadius: 0, backgroundColor: "transparent" },
  ], { yMin: 0, yMax: 100 });
  lineChart("li-sleep", rows.map((r) => r.date.slice(5)), [
    { label: "Sleep (h)", data: rows.map((r) => r.sleep_hours), borderColor: COLORS.blue, backgroundColor: "transparent" },
    { label: "7h target", data: rows.map(() => 7), borderColor: COLORS.muted, borderDash: [4, 4], pointRadius: 0, backgroundColor: "transparent" },
    { label: "9h target", data: rows.map(() => 9), borderColor: COLORS.muted, borderDash: [4, 4], pointRadius: 0, backgroundColor: "transparent" },
  ]);
}

function renderRetainerStrip() {
  const rows = trailingRows(state.current, 30);
  if (!rows.length) return `<div class="empty-state">No retainer nights tracked yet.</div>`;
  const colorFor = (r) => r.retainers_worn === true ? COLORS.green : COLORS.red;
  const labelFor = (r) => r.retainers_worn === true ? "worn" : r.retainers_worn === false ? "skipped" : "not logged (assumed not worn)";
  return `<div style="display:flex;gap:4px;flex-wrap:wrap">${rows.map((r) =>
    `<div title="${r.date}: ${labelFor(r)}" style="width:18px;height:18px;border-radius:4px;background:${colorFor(r)}"></div>`
  ).join("")}</div>`;
}

/* ---------------- boot ---------------- */

async function boot() {
  await loadIndex();
  const min = state.dates[0], max = state.dates[state.dates.length - 1];
  const picker = document.getElementById("datePick");
  picker.min = min; picker.max = max;
  wireNav();
  setDate(max);
}

boot().catch((err) => {
  document.getElementById("content").innerHTML = `<div class="empty-state">Failed to load dashboard data: ${err.message}</div>`;
});
