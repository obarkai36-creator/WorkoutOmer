#!/usr/bin/env node
/* monthly_training_stats.mjs — training-side stats for the monthly recap.
 * Replays ../engine.js's analyze() as of the last moment of a given month, so
 * ACWR / push-pull balance / recommended-next reflect what the workout
 * dashboard actually showed at that point in time (not today's live state) —
 * the same technique sync_training_snapshot.mjs uses for the daily nutrition
 * dashboard, just with an "as of" timestamp instead of "now".
 *
 * Usage: node monthly_training_stats.mjs <YYYY-MM>
 * Prints one JSON object to stdout.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(ROOT, "..");
const DAY = 24 * 60 * 60 * 1000;

function loadWorkoutEngine() {
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  for (const file of ["data.js", "engine.js"]) {
    const code = fs.readFileSync(path.join(REPO, file), "utf-8");
    vm.runInContext(code, sandbox, { filename: file });
  }
  return { data: sandbox.window.GYM_DATA, engine: sandbox.window.GYM_ENGINE };
}

function fmtPace(min) {
  if (min == null) return null;
  const m = Math.floor(min), s = Math.round((min - m) * 60);
  return `${m}:${String(s).padStart(2, "0")}/km`;
}

const month = process.argv[2];
if (!month || !/^\d{4}-\d{2}$/.test(month)) {
  console.error("Usage: node monthly_training_stats.mjs <YYYY-MM>");
  process.exit(1);
}

const [y, m] = month.split("-").map(Number);
const monthStart = new Date(Date.UTC(y, m - 1, 1));
const monthEndExclusive = new Date(Date.UTC(y, m, 1));
// "As of" the last recorded moment of the month, so trailing windows (ACWR's
// 28-day lookback, etc.) match what the dashboard showed at month-end.
const asOf = new Date(monthEndExclusive.getTime() - 1000);

const { data, engine } = loadWorkoutEngine();
const a = engine.analyze(data, asOf.getTime());

let aerobic28 = 0;
for (const w of a.workouts) for (const ex of w.exercises)
  if (ex.kind === "aerobic" && asOf.getTime() - w.t <= 28 * DAY) aerobic28++;

const sessionsInMonth = a.workouts
  .filter((w) => w.t >= monthStart.getTime() && w.t < monthEndExclusive.getTime())
  .map((w) => ({
    date: new Date(w.t).toISOString().slice(0, 10),
    note: w.note || w.exercises?.[0]?.name || null,
  }))
  .sort((x, y2) => (x.date < y2.date ? -1 : 1));

const result = {
  month,
  as_of: asOf.toISOString().slice(0, 10),
  acwr: a.trends.acwr,
  sessions_per_week: a.timing.perWeek,
  recommended_next: `${a.recommendation.section} day`,
  alerts: a.alerts.map((al) => al.detail),
  aerobic_28d_km: a.aerobic.km28,
  aerobic_sessions_28d: aerobic28,
  sessions_in_month: sessionsInMonth,
  sessions_in_month_count: sessionsInMonth.length,
};

console.log(JSON.stringify(result));
