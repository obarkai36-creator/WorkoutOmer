/* WorkoutOmer interactive dashboard — vanilla JS, no build step.
 * Bento overview + click-through detail modals ("soft sky" design — see
 * docs/design/BRIEF.md for the full history). Reads docs/data/index.json
 * (lightweight rollup of every logged day) and docs/data/<date>.json (full
 * per-day bundle, fetched lazily + cached). Data is produced by
 * intake/export_site_data.py, which reuses generate_dashboard.py's compute
 * functions so these numbers can never drift from the underlying model. */

const COLORS = { good: "#16a34a", warn: "#d97706", bad: "#dc2626", muted: "#93a1c2" };
const HUES = {
  nutrition: { a: "#6ee7b7", b: "#0d9488" }, training: { a: "#7dd3fc", b: "#2563eb" }, sperm: { a: "#e0aaff", b: "#ec4899" },
  sleep: { a: "#a5b4fc", b: "#4f46e5" }, bodycomp: { a: "#7dd3fc", b: "#0284c7" }, supplements: { a: "#93a1c2", b: "#66709a" },
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
  nutrition: "Protein / fiber / calorie adherence, averaged over the window.",
  body_composition: "Actual weekly weight-loss pace vs. the ~0.4kg/week target.",
  sleep: "Share of nights in the 7-9h band.",
  alcohol: "Severity + frequency of drinking events (baseline: ≤1/week).",
  heat_travel_exposure: "Scrotal heat / travel exposure events.",
  smoking: "Static from profile lifestyle settings.",
  ejaculatory_frequency: "Regular 1-2 day intervals score best; long gaps score lower.",
};
const BODY_COMP_FIELDS = [
  ["bmi","BMI",""], ["body_fat_pct","Body fat","%"], ["body_fat_mass_kg","Body fat mass","kg"],
  ["muscle_mass_kg","Muscle mass","kg"], ["skeletal_muscle_mass_kg","Skeletal muscle","kg"], ["lean_body_mass_kg","Lean body mass","kg"],
  ["bone_mass_kg","Bone mass","kg"], ["water_pct","Water","%"], ["visceral_fat","Visceral fat",""],
  ["protein_pct","Protein","%"], ["subcutaneous_fat_pct","Subcutaneous fat","%"], ["resting_heart_rate","Resting HR","bpm"],
  ["bmr_kcal","BMR","kcal"], ["body_age","Body age",""], ["body_type","Body type",""],
];

const state = { index: null, dates: [], current: null, cache: {}, charts: {} };

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
  if (mode === "moreIsFine") return pct >= 100 ? COLORS.good : pct >= 70 ? COLORS.warn : COLORS.bad;
  if (mode === "ceiling") return (pct >= 85 && pct <= 115) ? COLORS.good : (pct >= 60 && pct <= 140) ? COLORS.warn : COLORS.bad;
  return pct >= 100 ? COLORS.good : pct >= 50 ? COLORS.warn : COLORS.bad;
}
function scoreColor(score, bands) {
  if (score === null || score === undefined) return COLORS.muted;
  let chosen = bands[0];
  for (const b of bands) if (score >= b.min) chosen = b;
  return chosen.color;
}
function scoreBand(score, bands) {
  if (score === null || score === undefined) return { label: "—", color: COLORS.muted };
  let chosen = bands[0];
  for (const b of bands) if (score >= b.min) chosen = b;
  return chosen;
}
function metricRow({ label, consumed, target, pct, unit = "", mode = "ceiling", note = "", tip = "" }) {
  const color = pctColor(pct, mode);
  const width = Math.max(2, Math.min(100, pct === null || pct === undefined ? 0 : pct));
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
function ringSvg(size, strokeW, pct, gradId, colorA, colorB, big, sub) {
  const r = size / 2 - strokeW / 2 - 1, c = 2 * Math.PI * r;
  const safePct = pct === null || pct === undefined ? 0 : Math.max(0, Math.min(100, pct));
  const off = c * (1 - safePct / 100);
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <defs><linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${colorA}"/><stop offset="100%" stop-color="${colorB}"/></linearGradient></defs>
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--surface-inset)" stroke-width="${strokeW}"/>
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="url(#${gradId})" stroke-width="${strokeW}" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}" transform="rotate(-90 ${size/2} ${size/2})"/>
    ${big !== undefined ? `<text x="50%" y="47%" text-anchor="middle" font-size="${size*0.24}" font-weight="700" fill="var(--text-1)">${big}</text>` : ""}
    ${sub ? `<text x="50%" y="63%" text-anchor="middle" font-size="${size*0.082}" font-weight="600" fill="var(--text-3)">${sub}</text>` : ""}
  </svg>`;
}
function chip(value, label) { return `<div class="chip"><div class="chip-v">${value}</div><div class="chip-k">${label}</div></div>`; }

/* ---------------- data loading ---------------- */
async function loadIndex() {
  state.index = await fetchJson("data/index.json");
  state.dates = state.index.days.map((d) => d.date);
}
async function loadDay(date) {
  if (!state.cache[date]) state.cache[date] = await fetchJson(`data/${date}.json`);
  return state.cache[date];
}
function indexRow(date) { return state.index.days.find((d) => d.date === date); }
function trailingRows(date, n) {
  const idx = state.dates.indexOf(date);
  const start = Math.max(0, idx - n + 1);
  return state.index.days.slice(start, idx + 1);
}
// Two distinct reasons a day's macro totals aren't real data points: it's
// still being logged (in_progress) or food tracking was deliberately
// skipped that day (exclude_from_monthly_macros — a travel stretch, a
// macro-tracking break, etc). Either reads as a false near-zero dip on a
// macro trend chart — filter both out of macro-tracking charts specifically.
function excludeUntracked(rows) { return rows.filter((r) => !r.in_progress && !r.exclude_from_monthly_macros); }

// Days since the last logged alcohol event, walking back from `date`
// (inclusive) through state.index.days — computed client-side from the
// existing per-day `alcohol_event` boolean, no backend change needed.
function alcoholFreeStreak(date) {
  const idx = state.dates.indexOf(date);
  if (idx < 0) return null;
  let streak = 0;
  for (let i = idx; i >= 0; i--) {
    const row = state.index.days[i];
    if (row.alcohol_event) break;
    streak++;
  }
  return streak;
}

/* ---------------- navigation ---------------- */
function setDate(date) {
  if (!state.dates.includes(date)) return;
  state.current = date;
  document.getElementById("datePick").value = date;
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
      d = state.dates.reduce((best, cur) => (Math.abs(new Date(cur) - new Date(d)) < Math.abs(new Date(best) - new Date(d)) ? cur : best));
    }
    setDate(d);
  });
  document.getElementById("modalClose").addEventListener("click", closeDetail);
  document.getElementById("modalBackdrop").addEventListener("click", (e) => { if (e.target.id === "modalBackdrop") closeDetail(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDetail(); });
}

/* ---------------- main render (bento overview) ---------------- */
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
  const isLatest = state.current === state.dates[state.dates.length - 1];
  document.getElementById("subtitle").textContent =
    `Day ${day.day_number ?? "?"} of ${state.index.days_logged} · ${state.current}` + (day.in_progress ? " · in progress" : "");

  const t = state.index.profile_targets;
  const m = day.macros;
  const energy = day.energy_score;
  const sperm = day.sperm_score;
  const suppTaken = day.supplement_compliance.filter((s) => s.taken || s.met_via_food).length;
  const suppTotal = day.supplement_compliance.length;
  const streak = alcoholFreeStreak(state.current);

  content.innerHTML = `
  <div class="section-eyebrow">Today</div>
  <div class="strip">
    <div class="pill"><span class="dot" style="background:${row.workout_today ? COLORS.good : COLORS.muted}"></span>${row.workout_today ? `<b>${row.workout_type || "Workout"}</b> logged` : "Rest day"}</div>
    ${day.training_trends ? `<div class="pill"><span class="dot" style="background:${HUES.training.b}"></span>Load ratio <b>${fmt(day.training_trends.acwr,2)}</b> · zone: ${day.training_trends.acwrZone}</div>` : ""}
    <div class="pill"><span class="dot" style="background:${COLORS.warn}"></span><b>${suppTaken}/${suppTotal}</b> supplements</div>
    <div class="pill"><span class="dot" style="background:${COLORS.muted}"></span><b>${day.caffeine_shots ?? "—"}</b> caffeine shots</div>
    <div class="pill"><span class="dot" style="background:${streak > 0 ? COLORS.good : COLORS.bad}"></span><b>${streak ?? "—"}</b> day${streak === 1 ? "" : "s"} alcohol-free</div>
    <div class="pill">${day.steps ? `<span class="dot" style="background:${COLORS.good}"></span><b>${fmt(day.steps)}</b> steps` : `<span class="dot" style="background:${COLORS.muted}"></span>Steps not logged`}</div>
  </div>

  <div style="margin-top:16px">${renderHero(day, energy, sperm)}</div>

  ${day.status_note ? `
  <div class="section-eyebrow">Status note <span class="sub">— from the day's log</span></div>
  <div class="panel"><div class="status-note-text">${day.status_note}</div></div>` : ""}

  <div class="section-eyebrow">At a glance <span class="sub">— tap a tile for the full breakdown</span></div>
  <div class="grid">${renderTiles(day, row, isLatest)}</div>

  ${day.suggestions && day.suggestions.length ? `
  <div class="section-eyebrow">Insights <span class="sub">— generated from the logged history, current as of the latest day</span></div>
  <div class="panel"><h2>Suggestions</h2><ul class="tips">${day.suggestions.map((s) => `<li>💡 ${s}</li>`).join("")}</ul></div>` : ""}
  `;

  document.getElementById("footer").textContent = `Data generated ${state.index.generated} · ${state.index.days_logged} days logged`;
  wireTileClicks(day, isLatest);
}

function renderHero(day, energy, sperm) {
  if (!energy) return `<div class="empty-state">No energy score computed for this day.</div>`;
  const idx = state.dates.indexOf(state.current);
  const prevRow = idx > 0 ? state.index.days[idx - 1] : null;
  const delta = prevRow && prevRow.energy_score !== null ? energy.overall - prevRow.energy_score : null;
  const worstFactor = Object.entries(energy.factors).sort((a, b) => a[1] - b[1])[0];
  const worstDetail = energy.details ? energy.details[worstFactor[0]] : "";
  return `
  <div class="hero">
    <div class="ring-col">${ringSvg(128, 11, energy.overall, "gEnergyHero", "#fcd34d", "#f59e0b", energy.overall, "ENERGY")}</div>
    <div class="body">
      <div class="eyebrow-inline">Today's read</div>
      <div class="headline">Band: <b>${energy.band.label}</b>. ${energy.notes || ""} ${worstDetail ? `Biggest drag: <b>${worstFactor[0]} (${worstFactor[1]})</b> — ${worstDetail}.` : ""}</div>
      <div class="trendrow">
        ${delta !== null ? `<span class="trend-pill ${delta < 0 ? "down" : delta === 0 ? "flat" : ""}">${delta > 0 ? "↑" : delta < 0 ? "↓" : "→"} ${Math.abs(delta)} vs yesterday</span>` : ""}
        ${sperm ? `<span class="small muted">Sperm score this week: <b style="color:var(--text-1)">${sperm.overall}</b> (${sperm.band.label})</span>` : `<span class="small muted">Sperm score: locked until 14 days of logging</span>`}
      </div>
    </div>
  </div>`;
}

function renderTiles(day, row, isLatest) {
  const micros = day.micros;
  const microEntries = Object.entries(micros).filter(([, v]) => v.target);
  const worstMicro = [...microEntries].sort((a, b) => a[1].pct - b[1].pct).find(([, v]) => v.pct < 100);
  const bestCandidate = [...microEntries].sort((a, b) => b[1].pct - a[1].pct)[0];
  const bestMicro = bestCandidate && bestCandidate[1].pct > 0 && (!worstMicro || bestCandidate[0] !== worstMicro[0]) ? bestCandidate : null;
  const suppMissing = day.supplement_compliance.find((s) => !s.taken && !s.met_via_food);

  return `
    <div class="tile tap" data-tile="nutrition">
      <div class="go">→</div><h3>Nutrition</h3>
      <div class="row">${ringSvg(52, 6, Math.min(100, day.macros.calories.pct), "gNutr", HUES.nutrition.a, HUES.nutrition.b)}
        <div><div class="num">${fmt(day.macros.calories.consumed)}<small>/${day.macros.calories.target} kcal</small></div><div class="sub">${fmt(day.macros.protein_g.consumed)}g protein · ${day.macros.protein_g.pct ?? "—"}%</div></div></div>
      <div class="tile-divider"></div>
      <div class="bar-row">
        ${bestMicro ? `<div><div class="bar-label"><span>${MICRO_META[bestMicro[0]].label}</span><span>${bestMicro[1].pct}%</span></div><div class="bar"><div style="width:100%;background:${COLORS.good}"></div></div></div>` : ""}
        ${worstMicro ? `<div><div class="bar-label"><span>${MICRO_META[worstMicro[0]].label}</span><span>${worstMicro[1].pct}%</span></div><div class="bar"><div style="width:${worstMicro[1].pct}%;background:${COLORS.bad}"></div></div></div>` : `<div class="small muted">All tracked micros at/above target.</div>`}
      </div>
    </div>

    <div class="tile tap" data-tile="training">
      <div class="go">→</div><h3>Training load</h3>
      ${day.training_trends ? `
      <div class="row">${ringSvg(52, 6, Math.min(100, day.training_trends.acwr / 1.5 * 100), "gTrain", HUES.training.a, HUES.training.b)}
        <div><div class="num">${fmt(day.training_trends.acwr,2)}<small>ACWR</small></div><div class="sub">Zone: ${day.training_trends.acwrZone} (sweet spot 0.8–1.3)</div></div></div>
      <div class="tile-divider"></div>
      <div class="small muted">Recommended next: <b style="color:var(--text-1)">${day.training && day.training.deload ? "Full-body deload" : (day.training ? day.training.section + " day" : "—")}</b> ${day.training && day.training.readyNow ? "· ready now" : ""}</div>` :
      `<div class="empty-state">Live training data only computed for the latest logged day.</div>`}
    </div>

    <div class="tile tap" data-tile="sperm">
      <div class="go">→</div><h3>Sperm score</h3>
      ${day.sperm_score ? `
      <div class="row">${ringSvg(52, 6, day.sperm_score.overall, "gSperm", HUES.sperm.a, HUES.sperm.b)}
        <div><div class="num">${day.sperm_score.overall}<small>/ 100</small></div><div class="sub">Weekly · ${day.sperm_score.band.label} band</div></div></div>
      <div class="tile-divider"></div>
      <div class="small muted">${day.sperm_trend ? `90-day trend: <b style="color:var(--text-1)">${day.sperm_trend.overall}</b> (${day.sperm_trend.band.label})` : "90-day trend not yet available"}</div>` :
      `<div class="empty-state">🔒 Locked until 14 days of logging.</div>`}
    </div>

    <div class="tile tap" data-tile="sleep">
      <div class="go">→</div><h3>Sleep</h3>
      ${day.sleep ? `
      <div class="num">${fmt(day.sleep.duration_hours,2)}<small>h</small></div>
      <div class="sub" style="margin-top:2px">${day.sleep.sleep_start} – ${day.sleep.sleep_end}</div>
      <div class="tile-divider"></div>
      <div class="trendrow"><span class="trend-pill ${day.sleep.duration_hours >= 7 && day.sleep.duration_hours <= 9 ? "" : "warn"}">${day.sleep.duration_hours >= 7 && day.sleep.duration_hours <= 9 ? "In target band" : "Outside 7-9h band"}</span></div>` :
      `<div class="empty-state">No sleep logged this day.</div>`}
    </div>

    <div class="tile tap" data-tile="bodycomp">
      <div class="go">→</div><h3>Body composition</h3>
      <div id="bc-tile-content"><div class="small muted">Loading…</div></div>
    </div>

    <div class="tile tap" data-tile="supplements">
      <div class="go">→</div><h3>Supplements &amp; lifestyle</h3>
      <div class="num">${day.supplement_compliance.filter((s) => s.taken || s.met_via_food).length}<small>/ ${day.supplement_compliance.length}</small></div>
      <div class="sub" style="margin-top:2px">${suppMissing ? `${suppMissing.label} not logged` : "Fully compliant today"}</div>
      <div class="tile-divider"></div>
      <div class="trendrow">${day.lifestyle_events.length ? `<span class="trend-pill warn">${day.lifestyle_events.length} lifestyle event${day.lifestyle_events.length === 1 ? "" : "s"} today</span>` : `<span class="trend-pill">No lifestyle events today</span>`}</div>
    </div>`;
}

function wireTileClicks(day, isLatest) {
  document.querySelectorAll("[data-tile]").forEach((el) => {
    el.addEventListener("click", () => openDetail(el.dataset.tile, day, isLatest));
  });
  fillBodyCompTile(day);
}

// The bodycomp tile shows the MOST RECENT weigh-in as of the viewed day
// (not just "did this exact day have one," which would be empty most
// days) — needs the latest prior day-with-a-weigh-in's full bundle, so it
// resolves async after the initial tile render.
async function fillBodyCompTile(day) {
  const el = document.getElementById("bc-tile-content");
  if (!el) return;
  const w = await resolveLatestWeight(state.current);
  if (!w) { el.innerHTML = `<div class="empty-state" style="padding:10px 0">No weigh-in logged yet.</div>`; return; }
  const [loTarget, hiTarget] = state.index.goals.target_weight_kg || [null, null];
  el.innerHTML = `
    <div class="num">${fmt(w.entry.weight_kg,2)}<small>kg</small></div>
    <div class="sub" style="margin-top:2px">${w.date}${w.date !== state.current ? " (most recent)" : ""}${loTarget ? ` · goal ${loTarget}–${hiTarget}kg` : ""}</div>
    <div class="tile-divider"></div>
    <div class="trendrow"><span class="trend-pill ${w.delta === null ? "flat" : w.delta < 0 ? "" : w.delta > 0 ? "down" : "flat"}">${w.delta === null ? "First weigh-in" : `${w.delta < 0 ? "↓" : w.delta > 0 ? "↑" : "→"} ${fmt(Math.abs(w.delta),2)}kg vs prior`}</span></div>`;
}

// Walks index.json backward from `date` to find the most recent day with a
// real weigh-in, then fetches that day's full bundle for the complete
// weight record (index rows only carry weight_kg/bmi/body_fat_pct/
// muscle_mass_kg — not the full ~15-field record).
async function resolveLatestWeight(date) {
  const idx = state.dates.indexOf(date);
  let found = null, prevFound = null;
  for (let i = idx; i >= 0; i--) {
    if (state.index.days[i].weight_kg !== null) {
      if (!found) found = state.index.days[i].date;
      else { prevFound = state.index.days[i].date; break; }
    }
  }
  if (!found) return null;
  const bundle = await loadDay(found);
  let delta = null;
  if (prevFound) {
    const prevBundle = await loadDay(prevFound);
    delta = bundle.weight.weight_kg - prevBundle.weight.weight_kg;
  }
  return { date: found, entry: bundle.weight, delta };
}

/* ---------------- modal detail views ---------------- */
function openDetail(key, day, isLatest) {
  const h = HUES[key];
  const titles = { nutrition: "Nutrition", training: "Training", sperm: "Sperm Optimization", sleep: "Sleep", bodycomp: "Body Composition", supplements: "Supplements & Lifestyle" };
  const subs = {
    nutrition: "Macros, sperm-priority micros, and today's logged items", training: "Fatigue, load ratio, balance, aerobic, PRs",
    sperm: "Weekly composite score and contributing factors", sleep: "Duration and consistency", bodycomp: "Latest weigh-in and full history", supplements: "Compliance check, retainers, lifestyle events",
  };
  document.getElementById("modalTitle").textContent = titles[key];
  document.getElementById("modalSubtitle").textContent = subs[key];
  document.getElementById("modalRing").innerHTML = ringSvg(40, 5, 70, "gModal" + key, h.a, h.b);
  const body = document.getElementById("modalBody");
  body.innerHTML = `<div class="loading">Loading…</div>`;
  document.getElementById("modalBackdrop").classList.add("open");
  const renderers = { nutrition: renderNutritionDetail, training: renderTrainingDetail, sperm: renderSpermDetail, sleep: renderSleepDetail, bodycomp: renderBodyCompDetail, supplements: renderSupplementsDetail };
  Promise.resolve(renderers[key](day, isLatest)).then((html) => {
    body.innerHTML = html;
    requestAnimationFrame(() => drawCharts(key, day));
  });
}
function closeDetail() { document.getElementById("modalBackdrop").classList.remove("open"); }

function microRows(micros) {
  return Object.entries(MICRO_META).map(([key, meta]) => {
    const v = micros[key] || { consumed: 0, target: 0, pct: null };
    return metricRow({ label: meta.label, consumed: v.consumed, target: v.target, pct: v.pct, unit: meta.unit, tip: meta.tip });
  }).join("");
}

function renderNutritionDetail(day) {
  const m = day.macros;
  const itemsRows = (day.items || []).map((i) => `
    <tr><td>${i.time || ""}</td><td>${i.name}${i.note ? `<div class="small muted">${i.note}</div>` : ""}</td><td>${i.qty || ""}</td>
    <td class="num">${fmt(i.kcal)}</td><td class="num">${fmt(i.protein_g,1)}</td><td class="num">${fmt(i.carbs_g,1)}</td><td class="num">${fmt(i.fat_g,1)}</td><td class="num">${fmt(i.fiber_g,1)}</td></tr>`).join("");
  return `
  <div class="dgrid">
    <div class="dpanel"><h4>Macros — ${state.current}</h4>
      ${metricRow({ label: "Calories", consumed: m.calories.consumed, target: m.calories.target, pct: m.calories.pct, unit: "kcal" })}
      ${metricRow({ label: "Protein", consumed: m.protein_g.consumed, target: m.protein_g.target, pct: m.protein_g.pct, unit: "g", mode: "moreIsFine" })}
      ${metricRow({ label: "Carbs", consumed: m.carbs_g.consumed, target: m.carbs_g.target, pct: m.carbs_g.pct, unit: "g" })}
      ${metricRow({ label: "Fat", consumed: m.fat_g.consumed, target: m.fat_g.target, pct: m.fat_g.pct, unit: "g" })}
      ${metricRow({ label: "Fiber", consumed: m.fiber_g.consumed, target: m.fiber_g.target, pct: m.fiber_g.pct, unit: "g", mode: "moreIsFine" })}
    </div>
    <div class="dpanel"><h4>Sperm-priority micros</h4>${microRows(day.micros)}</div>
    <div class="dpanel span"><h4>Calories &amp; macros — full history <span class="tag">(macro-break days excluded)</span></h4><div class="chart-box"><canvas id="chNutr"></canvas></div></div>
    <div class="dpanel span"><h4>Logged items — ${state.current}</h4>
      ${itemsRows ? `<div class="scrollbox"><table class="datatable">
        <thead><tr><th>Time</th><th>Item</th><th>Qty</th><th class="num">Kcal</th><th class="num">P</th><th class="num">C</th><th class="num">F</th><th class="num">Fib</th></tr></thead>
        <tbody>${itemsRows}</tbody></table></div>` : `<div class="empty-state">No items logged this day.</div>`}
    </div>
  </div>`;
}

function renderTrainingDetail(day, isLatest) {
  if (!isLatest || !day.training) {
    return `<div class="empty-state">Live training data (fatigue, load ratio, recommendations) is only computed for the most recently logged day — jump to Latest to see it.</div>`;
  }
  const rec = day.training;
  const exRows = (rec.suggestedExercises || []).map((e) => `
    <tr><td>${e.name}${e.preferred ? ` <span class="star">★ preferred</span>` : ""}</td><td>${e.best || ""}</td>
    <td class="num">${e.best1RM ? fmt(e.best1RM,1) : "—"}</td><td>${e.target ? e.target.text : ""}</td></tr>`).join("");
  const rankedRows = (rec.ranked || []).map((s) => `
    <tr><td>${s.section}</td><td class="num">${fmt(s.fatigue,0)}%</td><td class="num">${s.readyInHours === 0 ? "ready now" : fmt(s.readyInHours,1) + "h"}</td><td class="num">${s.daysSince === null ? "—" : fmt(s.daysSince,1) + "d"}</td></tr>`).join("");
  const sections = day.training_sections || {};
  const bal = day.training_balance || {};
  const rel = day.training_relstrength || {};
  const aer = day.training_aerobic || {};
  const changes = day.training_changes || [];
  const alerts = day.training_alerts || [];

  return `
  <div class="dgrid">
    <div class="dpanel span"><h4>Muscle fatigue &amp; recovery</h4>
      ${Object.entries(sections).filter(([name]) => name !== "Cardio").map(([name, s]) => `
      <div class="metric"><div class="metric-top"><span>${name}</span><span class="vals">${s.pct}% · ${s.readyInHours ? "ready in " + fmt(s.readyInHours,1) + "h" : "ready now"}</span></div>
      <div class="track"><div class="fill" style="width:${s.pct}%;background:${s.pct >= 50 ? COLORS.warn : COLORS.good}"></div></div></div>`).join("")}
    </div>
    <div class="dpanel span"><h4>Recommended next session</h4>
      <div class="bignum" style="color:${HUES.training.b}">${rec.deload ? "Full-body deload" : rec.section}</div>
      <div class="metric-note">${rec.readyNow ? "Ready now" : "Rest " + fmt(rec.restHours,1) + "h"} · last trained ${rec.daysSince === null ? "never" : fmt(rec.daysSince,1) + "d ago"}${rec.suggestedCount ? ` · go for <b style="color:var(--text-1)">${rec.suggestedCount} of ${rec.totalAvailable}</b> below (typical ${rec.typicalSessionSize})` : ""}</div>
      ${(rec.guidance || []).map((g) => `<div class="metric-note" style="margin-top:6px">💡 ${g}</div>`).join("")}
      ${exRows ? `<div class="scrollbox" style="margin-top:12px;max-height:none"><table class="datatable">
        <thead><tr><th>Exercise</th><th>Best</th><th class="num">1RM</th><th>Target this session</th></tr></thead>
        <tbody>${exRows}</tbody></table></div>` : ""}
    </div>
    <div class="dpanel"><h4>Section readiness</h4>
      ${rankedRows ? `<table class="datatable"><thead><tr><th>Section</th><th class="num">Fatigue</th><th class="num">Rest</th><th class="num">Days since</th></tr></thead><tbody>${rankedRows}</tbody></table>` : `<div class="small muted">No ranking available.</div>`}
    </div>
    <div class="dpanel"><h4>Load ratio trend (6wk)</h4>
      <div class="bignum" style="color:${HUES.training.b}">${fmt(day.training_trends.acwr,2)}<small> load ratio</small></div>
      <div class="goalline">Sweet spot 0.8–1.3 · danger &gt;1.5 · zone: <b style="color:var(--text-1)">${day.training_trends.acwrZone}</b></div>
      <div class="chart-box small"><canvas id="chAcwr"></canvas></div>
    </div>
    <div class="dpanel"><h4>Program balance &amp; relative strength</h4>
      <div class="chips"><div class="chip"><div class="chip-v">${bal.pushPull ?? "—"}×</div><div class="chip-k">Push : Pull</div></div><div class="chip"><div class="chip-v">${bal.quadHam ?? "—"}×</div><div class="chip-k">Quad : Ham</div></div></div>
      ${rel.items ? `<div class="small muted" style="margin:14px 0 8px">1RM ÷ bodyweight (${rel.bodyweightKg}kg)</div>
      <ul class="evul">${rel.items.slice(0,8).map((i) => `<li><b>${i.name}</b> · ${i.oneRM}kg 1RM <span style="float:right;color:var(--text-1)">${i.ratio}×BW</span></li>`).join("")}</ul>` : ""}
    </div>
    <div class="dpanel"><h4>Aerobic / cardio</h4>
      <div class="chips four">
        <div class="chip"><div class="chip-v">${aer.km28 ?? "—"} km</div><div class="chip-k">28-day</div></div>
        <div class="chip"><div class="chip-v">${aer.avgHr ?? "—"}</div><div class="chip-k">Avg HR</div></div>
        <div class="chip"><div class="chip-v">${aer.avgPace ? fmt(aer.avgPace,2) : "—"}</div><div class="chip-k">Pace min/km</div></div>
        <div class="chip"><div class="chip-v">${aer.daysSinceLast ?? "—"}d</div><div class="chip-k">Since cardio</div></div>
      </div>
    </div>
    <div class="dpanel span"><h4>Bodyweight trend <span class="tag">(training-load reference)</span></h4><div class="chart-box small"><canvas id="chBw"></canvas></div></div>
    ${alerts.length ? `<div class="dpanel span"><h4>Load &amp; balance alerts</h4>${alerts.map((a) => `<div class="alert-row ${a.level === "low" ? "low" : ""}"><b>${a.title}</b><br>${a.detail}</div>`).join("")}</div>` : ""}
    <div class="dpanel span"><h4>PRs &amp; below-best lifts</h4>
      ${day.workout_log ? `<div class="metric-note" style="margin-bottom:10px">Today's session: ${day.workout_log.notes || ""}</div>` : ""}
      ${changes.length ? `<ul class="evul">${changes.map((c) => `<li>${c}</li>`).join("")}</ul>` : `<div class="small muted">Nothing flagged.</div>`}
    </div>
  </div>`;
}

function renderSpermDetail(day) {
  if (!day.sperm_score) {
    return `<div class="empty-state">🔒 Score unlocks after 14 logged days. The inputs (nutrition, sleep, alcohol, heat/travel) are still being logged.</div>`;
  }
  const s = day.sperm_score;
  const ejacRows = (day.ejaculation_events || []).map((e) => `<li>${e.time || ""} — ${e.type}${e.note ? ` · ${e.note}` : ""}</li>`).join("");
  return `
  <div class="dgrid">
    <div class="dpanel"><div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap">
      ${ringSvg(96, 9, s.overall, "gSpermD", HUES.sperm.a, HUES.sperm.b, s.overall)}
      <div class="small muted">Window ${s.week_start} → ${s.week_end}<br>Band: <b style="color:var(--text-1)">${s.band.label}</b><br>${s.notes || ""}</div>
    </div></div>
    <div class="dpanel"><h4>Factors this week</h4>
      ${Object.entries(s.factors).map(([k, v]) => `<div class="metric"><div class="metric-top"><span>${k.replace(/_/g," ")}</span><span class="vals">${v}</span></div>
      <div class="track"><div class="fill" style="width:${v}%;background:${pctColor(v,"moreIsFine")}"></div></div><div class="metric-note">${SPERM_FACTOR_META[k] || ""}</div></div>`).join("")}
    </div>
    ${day.sperm_trend ? `
    <div class="dpanel span"><h4>~90-day trailing trend <span class="tag">(the biologically-relevant window — spermatogenesis takes ~64-90 days, so this reflects sperm quality better than the weekly number above)</span></h4>
      <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap">
        ${ringSvg(72, 7, day.sperm_trend.overall, "gSpermTrend", HUES.sperm.a, HUES.sperm.b, day.sperm_trend.overall)}
        <div class="small muted">Window ${day.sperm_trend.week_start} → ${day.sperm_trend.week_end}<br>Band: <b style="color:var(--text-1)">${day.sperm_trend.band.label}</b></div>
      </div>
    </div>` : ""}
    <div class="dpanel span"><h4>Sperm-priority micronutrients — ${state.current} <span class="tag">(same as Nutrition)</span></h4>${microRows(day.micros)}</div>
    <div class="dpanel span"><h4>Ejaculation log — ${state.current}</h4>${ejacRows ? `<ul class="evul">${ejacRows}</ul>` : `<div class="empty-state">No event logged this day.</div>`}</div>
    <div class="dpanel span"><h4>Sperm score trend <span class="tag">(weekly number, full history)</span></h4><div class="chart-box"><canvas id="chSperm"></canvas></div></div>
    <div class="dpanel span"><h4>90-day trailing trend <span class="tag">(full history)</span></h4><div class="chart-box"><canvas id="chSpermTrendHist"></canvas></div></div>
  </div>`;
}

function renderSleepDetail(day) {
  if (!day.sleep) return `<div class="empty-state">No sleep logged this day.</div>`;
  return `
  <div class="dgrid">
    <div class="dpanel span">
      <div class="bignum" style="color:${HUES.sleep.b}">${fmt(day.sleep.duration_hours,2)}<small> h</small></div>
      <div class="goalline">${day.sleep.sleep_start} – ${day.sleep.sleep_end} · 7-9h target band</div>
      <div class="small muted">${day.sleep.notes || ""}</div>
    </div>
    <div class="dpanel span"><h4>Sleep trend <span class="tag">(last 30 nights)</span></h4><div class="chart-box"><canvas id="chSleepPillar"></canvas></div></div>
  </div>`;
}

async function renderBodyCompDetail() {
  const w = await resolveLatestWeight(state.current);
  const [loTarget, hiTarget] = state.index.goals.target_weight_kg || [null, null];
  if (!w) return `<div class="dgrid"><div class="dpanel span"><div class="empty-state">No weigh-in logged yet.</div></div></div>`;
  const entry = w.entry;
  const first = state.index.days.find((r) => r.weight_kg !== null);
  const totalChange = first ? entry.weight_kg - first.weight_kg : null;
  const hasSteps = trailingRows(state.current, 30).some((r) => r.steps !== null && r.steps !== undefined);
  return `
  <div class="dgrid">
    <div class="dpanel span"><h4>Latest weigh-in — ${w.date}</h4>
      <div class="bignum" style="color:${HUES.bodycomp.b}">${fmt(entry.weight_kg,2)}<small>kg</small></div>
      <div class="goalline">${loTarget ? `Goal range ${loTarget}–${hiTarget}kg` : ""}${totalChange !== null ? ` · since first logged weigh-in: ${totalChange >= 0 ? "+" : ""}${fmt(totalChange,2)}kg` : ""}</div>
      <div class="chips">${BODY_COMP_FIELDS.filter(([k]) => entry[k] !== undefined && entry[k] !== null).map(([k, label, unit]) =>
        chip(`${typeof entry[k] === "number" ? fmt(entry[k], unit === "kg" || unit === "%" ? 1 : 0) : entry[k]}${unit ? ` <small style="font-size:9px">${unit}</small>` : ""}`, label)).join("")}</div>
    </div>
    <div class="dpanel span"><h4>Weight trend — full history <span class="tag">(goal range shown)</span></h4><div class="chart-box"><canvas id="chWeight"></canvas></div></div>
    <div class="dpanel"><h4>Body fat % trend</h4><div class="chart-box small"><canvas id="chBf"></canvas></div></div>
    <div class="dpanel"><h4>Muscle mass trend</h4><div class="chart-box small"><canvas id="chMm"></canvas></div></div>
    <div class="dpanel span"><h4>Steps <span class="tag">(last 30 days, where logged)</span></h4>${hasSteps ? `<div class="chart-box small"><canvas id="chSteps"></canvas></div>` : `<div class="empty-state">No step counts logged yet.</div>`}</div>
  </div>`;
}

function renderSupplementsDetail(day) {
  const suppRows = day.supplement_compliance.map((s) => {
    const ok = s.taken || s.met_via_food;
    const status = s.product_name || (s.met_via_food ? "target met via food — supplement skipped" : (s.taken ? "taken" : "not logged today"));
    return `<li><span style="color:${ok ? COLORS.good : COLORS.warn}">${ok ? "✅" : "⚠️"}</span> ${s.label} <span class="muted">· ${status}</span></li>`;
  }).join("");
  const lifeRows = (day.lifestyle_events || []).map((e) => `
    <li><b>${e.type}</b> <span class="small muted">(${e.severity})</span> — ${e.description || ""}${e.notes ? `<br><span class="small muted">${e.notes}</span>` : ""}</li>`).join("");
  return `
  <div class="dgrid">
    <div class="dpanel"><h4>Supplement &amp; medication check — ${state.current}</h4><ul class="evul">${suppRows}</ul></div>
    <div class="dpanel"><h4>Retainers &amp; sleep</h4>
      <div class="metric"><div class="metric-top"><span>Retainers</span><span class="vals">${day.retainers ? (day.retainers.worn ? "Worn" : "Skipped") : "Not logged"}</span></div></div>
      ${day.sleep ? `<div class="metric"><div class="metric-top"><span>Sleep</span><span class="vals">${fmt(day.sleep.duration_hours,2)}h (${day.sleep.sleep_start}–${day.sleep.sleep_end})</span></div></div>` : ""}
    </div>
    <div class="dpanel span"><h4>Lifestyle events — ${state.current}</h4>${lifeRows ? `<ul class="evul">${lifeRows}</ul>` : `<div class="empty-state">No lifestyle events logged this day.</div>`}</div>
    <div class="dpanel span"><h4>Supplement compliance trend <span class="tag">(last 30 days)</span></h4><div class="chart-box small"><canvas id="chSupp"></canvas></div></div>
    <div class="dpanel span"><h4>Alcohol-free days <span class="tag">(last 30 days)</span></h4><div class="dot-strip">${trailingRows(state.current, 30).map((r) => `<div class="dot-cell" title="${r.date}: ${r.alcohol_event ? "alcohol logged" : "alcohol-free"}" style="background:${r.alcohol_event ? COLORS.bad : COLORS.good}"></div>`).join("")}</div></div>
    <div class="dpanel span"><h4>Retainer usage <span class="tag">(last 30 tracked nights)</span></h4>
      <div class="dot-strip">${trailingRows(state.current, 30).map((r) => `<div class="dot-cell" title="${r.date}: ${r.retainers_worn === true ? "worn" : r.retainers_worn === false ? "skipped" : "not logged (assumed not worn)"}" style="background:${r.retainers_worn === true ? COLORS.good : COLORS.bad}"></div>`).join("")}</div>
    </div>
  </div>`;
}

/* ---------------- Chart.js charts ---------------- */
function destroyChart(id) { if (state.charts[id]) { state.charts[id].destroy(); delete state.charts[id]; } }
function lineChart(canvasId, labels, datasets, opts = {}) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  state.charts[canvasId] = new Chart(ctx, { type: "line", data: { labels, datasets }, options: {
    responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
    scales: { x: { ticks: { color: COLORS.muted, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 }, grid: { display: false } },
      y: { ticks: { color: COLORS.muted }, grid: { color: "rgba(30,45,90,.08)" }, ...(opts.yMin !== undefined ? { min: opts.yMin } : {}), ...(opts.yMax !== undefined ? { max: opts.yMax } : {}) } },
    plugins: { legend: { labels: { color: "#5b6b8c", boxWidth: 10, font: { size: 11 } } } },
  } });
}
function barChart(canvasId, labels, data, colors) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  state.charts[canvasId] = new Chart(ctx, { type: "bar", data: { labels, datasets: [{ data, backgroundColor: colors, borderRadius: 5, maxBarThickness: 28 }] }, options: {
    responsive: true, maintainAspectRatio: false,
    scales: { x: { ticks: { color: COLORS.muted }, grid: { display: false } }, y: { ticks: { color: COLORS.muted }, grid: { color: "rgba(30,45,90,.08)" }, beginAtZero: true } },
    plugins: { legend: { display: false } },
  } });
}

function drawCharts(key, day) {
  if (key === "nutrition") {
    const rows = excludeUntracked(state.index.days);
    lineChart("chNutr", rows.map((r) => r.date.slice(5)), [
      { label: "Calories", data: rows.map((r) => r.calories), borderColor: HUES.nutrition.b, backgroundColor: "transparent", tension: .2, pointRadius: 0 },
      { label: "Protein (g)", data: rows.map((r) => r.protein_g), borderColor: COLORS.good, backgroundColor: "transparent", tension: .2, pointRadius: 0 },
      { label: "Fat (g)", data: rows.map((r) => r.fat_g), borderColor: COLORS.warn, backgroundColor: "transparent", tension: .2, pointRadius: 0 },
      { label: "Fiber (g)", data: rows.map((r) => r.fiber_g), borderColor: "#a78bfa", backgroundColor: "transparent", tension: .2, pointRadius: 0 },
    ]);
  }
  if (key === "training" && day.training_trends) {
    const weeks = (day.training_trends.weeks || []).filter((w) => w.acwr !== null);
    barChart("chAcwr", weeks.map((w) => w.label), weeks.map((w) => w.acwr),
      weeks.map((w) => w.acwr > 1.3 ? COLORS.bad : (w.acwr > 1.05 || w.acwr < 0.8) ? COLORS.warn : COLORS.good));
    const bwRows = state.index.days.filter((r) => r.weight_kg !== null);
    lineChart("chBw", bwRows.map((r) => r.date.slice(5)), [{ label: "Bodyweight (kg)", data: bwRows.map((r) => r.weight_kg), borderColor: HUES.training.b, backgroundColor: "transparent", tension: .2, spanGaps: true }]);
  }
  if (key === "sperm") {
    const rows = state.index.days.filter((r) => r.sperm_score !== null);
    lineChart("chSperm", rows.map((r) => r.date.slice(5)), [{ label: "Sperm score (weekly)", data: rows.map((r) => r.sperm_score), borderColor: HUES.sperm.b, backgroundColor: "transparent", tension: .2, pointRadius: 0 }], { yMin: 0, yMax: 100 });
    const trendRows = state.index.days.filter((r) => r.sperm_trend !== null);
    if (trendRows.length) lineChart("chSpermTrendHist", trendRows.map((r) => r.date.slice(5)), [{ label: "90-day trend", data: trendRows.map((r) => r.sperm_trend), borderColor: HUES.sperm.a, backgroundColor: "transparent", tension: .2, pointRadius: 0 }], { yMin: 0, yMax: 100 });
  }
  if (key === "sleep" || key === "supplements") {
    const rows = trailingRows(state.current, 30);
    if (key === "sleep") {
      lineChart("chSleepPillar", rows.map((r) => r.date.slice(5)), [
        { label: "Sleep (h)", data: rows.map((r) => r.sleep_hours), borderColor: HUES.sleep.b, backgroundColor: "transparent", spanGaps: true, pointRadius: 0 },
        { label: "7h target", data: rows.map(() => 7), borderColor: COLORS.muted, borderDash: [4,4], pointRadius: 0, backgroundColor: "transparent" },
        { label: "9h target", data: rows.map(() => 9), borderColor: COLORS.muted, borderDash: [4,4], pointRadius: 0, backgroundColor: "transparent" },
      ]);
    } else {
      lineChart("chSupp", rows.map((r) => r.date.slice(5)), [
        { label: "Compliance %", data: rows.map((r) => r.supplements_total ? Math.round((r.supplements_taken / r.supplements_total) * 100) : null), borderColor: COLORS.good, backgroundColor: "transparent", pointRadius: 0 },
        { label: "Target", data: rows.map(() => 100), borderColor: COLORS.muted, borderDash: [4,4], pointRadius: 0, backgroundColor: "transparent" },
      ], { yMin: 0, yMax: 100 });
    }
  }
  if (key === "bodycomp") {
    const rows = state.index.days.filter((r) => r.weight_kg !== null);
    const [loTarget, hiTarget] = state.index.goals.target_weight_kg || [null, null];
    lineChart("chWeight", rows.map((r) => r.date), [
      { label: "Weight (kg)", data: rows.map((r) => r.weight_kg), borderColor: HUES.bodycomp.b, backgroundColor: "transparent", tension: .2 },
      ...(loTarget ? [
        { label: "Goal low", data: rows.map(() => loTarget), borderColor: COLORS.good, borderDash: [5,4], pointRadius: 0, backgroundColor: "transparent" },
        { label: "Goal high", data: rows.map(() => hiTarget), borderColor: COLORS.warn, borderDash: [5,4], pointRadius: 0, backgroundColor: "transparent" },
      ] : []),
    ]);
    const bfRows = rows.filter((r) => r.body_fat_pct !== null);
    lineChart("chBf", bfRows.map((r) => r.date.slice(5)), [{ label: "Body fat %", data: bfRows.map((r) => r.body_fat_pct), borderColor: COLORS.bad, backgroundColor: "transparent", tension: .2 }]);
    const mmRows = rows.filter((r) => r.muscle_mass_kg !== null);
    lineChart("chMm", mmRows.map((r) => r.date.slice(5)), [{ label: "Muscle mass (kg)", data: mmRows.map((r) => r.muscle_mass_kg), borderColor: COLORS.good, backgroundColor: "transparent", tension: .2 }]);
    const stepRows = trailingRows(state.current, 30).filter((r) => r.steps !== null && r.steps !== undefined);
    if (stepRows.length) barChart("chSteps", stepRows.map((r) => r.date.slice(5)), stepRows.map((r) => r.steps), stepRows.map((r) => r.steps >= 6000 ? COLORS.good : COLORS.warn));
  }
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
