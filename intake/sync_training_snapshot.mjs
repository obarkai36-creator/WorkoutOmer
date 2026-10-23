#!/usr/bin/env node
/* sync_training_snapshot.mjs — refresh data/metrics/workouts.json's report_snapshot
 * from the live computation in ../data.js + ../engine.js, so the nutrition
 * dashboard's Training panel ("Latest" / "Recommended next" / alerts) always
 * matches what the workout dashboard itself is showing right now.
 *
 * Run this after editing ../data.js (new session, new weigh-in, etc.):
 *   node intake/sync_training_snapshot.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(ROOT, "..");

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

function loadJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relPath), "utf-8"));
}

/* ---- sleep.json entries -> the {date,start,end,hours,note} shape engine.js expects
 * (same substitution export_training_state.mjs uses — data.js's own SLEEP array
 * is a stale, unmaintained duplicate; sleep.json is the one kept current every day) */
function sleepFromNutrition() {
  const log = loadJson("data/metrics/sleep.json");
  return (log.entries || []).map((e) => ({
    date: e.date, start: e.sleep_start, end: e.sleep_end,
    hours: e.duration_hours, note: e.notes || "",
  }));
}

/* ---- weight.json entries -> the {datetime,kg} shape data.js's BODYWEIGHT uses */
function bodyweightFromNutrition() {
  const log = loadJson("data/metrics/weight.json");
  const entries = (log.entries || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  return entries.map((e) => ({ datetime: `${e.date}T${e.time || "00:00"}`, kg: e.weight_kg }));
}

const { data, engine } = loadWorkoutEngine();

// Substitute the nutrition side's sleep/bodyweight as the single source of
// truth, same as export_training_state.mjs — keeps this trimmed summary
// (and its "recommended_next") consistent with training_full.json instead
// of silently drifting from data.js's stale SLEEP/BODYWEIGHT arrays.
data.SLEEP = sleepFromNutrition().sort((a, b) => b.date.localeCompare(a.date));
const bw = bodyweightFromNutrition();
data.BODYWEIGHT = bw.slice().sort((a, b) => new Date(b.datetime) - new Date(a.datetime));
if (bw.length) data.ATHLETE.bodyweightKg = bw[bw.length - 1].kg;

const now = Date.now();
const a = engine.analyze(data, now);

const DAY = 24 * 60 * 60 * 1000;
let aerobic28 = 0;
for (const w of a.workouts) for (const ex of w.exercises)
  if (ex.kind === "aerobic" && now - w.t <= 28 * DAY) aerobic28++;

const snapshot = {
  report_date: new Date(now).toISOString().slice(0, 10),
  latest_session: a.workouts[0]?.note || a.workouts[0]?.exercises?.[0]?.name || null,
  sessions_logged: a.workouts.length,
  sessions_per_week: a.timing.perWeek,
  typical_time: a.timing.todPref,
  aerobic_28d_km: a.aerobic.km28,
  aerobic_sessions_28d: aerobic28,
  avg_pace: fmtPace(a.aerobic.avgPace),
  avg_hr: a.aerobic.avgHr,
  acwr: a.trends.acwr,
  recommended_next: a.recommendation.deload ? "Full Body (Deload) day" : `${a.recommendation.section} day`,
  alerts: a.alerts.map((al) => al.detail),
};

const wPath = path.join(REPO, "intake/data/metrics/workouts.json");
const w = JSON.parse(fs.readFileSync(wPath, "utf-8"));
w.report_snapshot = snapshot;
fs.writeFileSync(wPath, JSON.stringify(w, null, 2) + "\n");
console.log("Synced report_snapshot:", JSON.stringify(snapshot, null, 2));
