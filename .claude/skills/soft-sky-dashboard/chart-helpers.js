/* "Soft sky" dashboard — chart + small-component JS helpers.
 * Pairs with tokens.css/dashboard.css. Requires Chart.js (vendored
 * locally — see SKILL.md) only for lineChart()/barChart(); the other
 * helpers (ringSvg, metricRow, chip) are dependency-free string builders.
 *
 * HUES keys are placeholders (pillar1..pillar7) matching tokens.css —
 * rename both sides together to your own data categories, e.g.:
 *   const HUES = { sleep: { a: "#a5b4fc", b: "#4f46e5" }, ... };
 * and reference var(--sleep-a)/var(--sleep-b) in tokens.css instead. */

const COLORS = { good: "#16a34a", warn: "#d97706", bad: "#dc2626", muted: "#93a1c2" };
const HUES = {
  pillar1: { a: "#fcd34d", b: "#f59e0b" },
  pillar2: { a: "#e0aaff", b: "#ec4899" },
  pillar3: { a: "#7dd3fc", b: "#2563eb" },
  pillar4: { a: "#6ee7b7", b: "#0d9488" },
  pillar5: { a: "#a5b4fc", b: "#4f46e5" },
  pillar6: { a: "#7dd3fc", b: "#0284c7" },
  pillar7: { a: "#93a1c2", b: "#66709a" },
};

/** Format a number for display, or an em-dash if null/undefined/NaN. */
function fmt(n, digits = 0) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

/** Pick a status color for a percent-of-target value.
 * mode "moreIsFine": higher is always better (e.g. steps, protein).
 * mode "ceiling": a target has a healthy band on both sides (e.g. calories).
 * default: simple >=100 good / >=50 warn / else bad. */
function pctColor(pct, mode) {
  if (pct === null || pct === undefined) return COLORS.muted;
  if (mode === "moreIsFine") return pct >= 100 ? COLORS.good : pct >= 70 ? COLORS.warn : COLORS.bad;
  if (mode === "ceiling") return (pct >= 85 && pct <= 115) ? COLORS.good : (pct >= 60 && pct <= 140) ? COLORS.warn : COLORS.bad;
  return pct >= 100 ? COLORS.good : pct >= 50 ? COLORS.warn : COLORS.bad;
}

/** Pick a color/band from an ordered list of {min, color, label} thresholds,
 * e.g. bands = [{min:0,color:COLORS.bad,label:"Low"},{min:50,color:COLORS.warn,label:"OK"},{min:80,color:COLORS.good,label:"Good"}]. */
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

/** A labeled progress bar: "Protein  120g / 165g (73%)" + colored fill. */
function metricRow({ label, consumed, target, pct, unit = "", mode = "ceiling", note = "", tip = "" }) {
  const color = pctColor(pct, mode);
  const width = Math.max(2, Math.min(100, pct === null || pct === undefined ? 0 : pct));
  const valsTxt = target
    ? `${fmt(consumed, unit === "IU" || unit === "mcg" ? 0 : 1)}${unit ? " " + unit : ""} / ${fmt(target, 0)}${unit ? " " + unit : ""} (${pct === null ? "—" : pct + "%"})`
    : `${fmt(consumed, 1)}${unit ? " " + unit : ""}`;
  return `
  <div class="metric">
    <div class="metric-top"><span>${label}</span><span class="vals">${valsTxt}</span></div>
    <div class="track"><div class="fill" style="width:${width}%;background:${color}"></div></div>
    ${note ? `<div class="metric-note">${note}</div>` : ""}
    ${tip && pct !== null && pct < (mode === "ceiling" ? 60 : 100) ? `<div class="metric-tip">💡 ${tip}</div>` : ""}
  </div>`;
}

/** A gradient progress ring as inline SVG, with an optional big center
 * number and small subtitle. gradId must be unique per ring on the page. */
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

/** A small stat chip: value on top, label below. */
function chip(value, label) {
  return `<div class="chip"><div class="chip-v">${value}</div><div class="chip-k">${label}</div></div>`;
}

/* ---- Chart.js wrappers, styled to match the design tokens ----
 * Requires a Chart.js UMD build loaded on the page (window.Chart). Keep
 * a `charts = {}` registry per page/module and call destroyChart() before
 * re-rendering a canvas (e.g. when the user switches days), or Chart.js
 * will silently stack duplicate chart instances on the same canvas. */
const charts = {};
function destroyChart(canvasId) {
  if (charts[canvasId]) { charts[canvasId].destroy(); delete charts[canvasId]; }
}
function lineChart(canvasId, labels, datasets, opts = {}) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  charts[canvasId] = new Chart(ctx, { type: "line", data: { labels, datasets }, options: {
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
  charts[canvasId] = new Chart(ctx, { type: "bar", data: { labels, datasets: [{ data, backgroundColor: colors, borderRadius: 5, maxBarThickness: 28 }] }, options: {
    responsive: true, maintainAspectRatio: false,
    scales: { x: { ticks: { color: COLORS.muted }, grid: { display: false } }, y: { ticks: { color: COLORS.muted }, grid: { color: "rgba(30,45,90,.08)" }, beginAtZero: true } },
    plugins: { legend: { display: false } },
  } });
}
