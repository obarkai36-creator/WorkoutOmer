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

const { data, engine } = loadWorkoutEngine();
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
  recommended_next: `${a.recommendation.section} day`,
  alerts: a.alerts.map((al) => al.detail),
};

const wPath = path.join(REPO, "intake/data/metrics/workouts.json");
const w = JSON.parse(fs.readFileSync(wPath, "utf-8"));
w.report_snapshot = snapshot;
fs.writeFileSync(wPath, JSON.stringify(w, null, 2) + "\n");
console.log("Synced report_snapshot:", JSON.stringify(snapshot, null, 2));
