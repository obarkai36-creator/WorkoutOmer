#!/usr/bin/env node
/* export_training_state.mjs — dump the FULL live training analysis (engine.js
 * analyze()) to JSON, for the unified dashboard prototype.
 *
 * Unlike sync_training_snapshot.mjs (which only mirrors a trimmed summary),
 * this substitutes the nutrition side's sleep.json and weight.json as the
 * single source of truth for sleep and bodyweight/body-composition, instead
 * of data.js's own SLEEP/BODYWEIGHT arrays — those two are kept read-only
 * here and not written back to, so nothing about the existing dual-tracked
 * files changes yet. Everything else (WORKOUTS, SNAPSHOT, MUSCLES,
 * EXERCISE_LIBRARY) still comes from data.js, since that data has no
 * nutrition-side equivalent.
 *
 * Run: node intake/export_training_state.mjs
 * Writes: intake/data/metrics/training_full.json
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

function loadJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relPath), "utf-8"));
}

/* ---- sleep.json entries -> the {date,start,end,hours,note} shape engine.js expects */
function sleepFromNutrition() {
  const log = loadJson("data/metrics/sleep.json");
  return (log.entries || []).map((e) => ({
    date: e.date, start: e.sleep_start, end: e.sleep_end,
    hours: e.duration_hours, note: e.notes || "",
  }));
}

/* ---- weight.json entries -> the {datetime,kg} shape data.js's BODYWEIGHT uses,
 * keeping the richer body-composition fields alongside for the unified page. */
function bodyweightFromNutrition() {
  const log = loadJson("data/metrics/weight.json");
  const entries = (log.entries || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  return entries.map((e) => ({
    datetime: `${e.date}T${e.time || "00:00"}`,
    kg: e.weight_kg,
    bodyComposition: {
      bmi: e.bmi ?? null, body_fat_pct: e.body_fat_pct ?? null,
      muscle_mass_kg: e.muscle_mass_kg ?? null, visceral_fat: e.visceral_fat ?? null,
      bmr_kcal: e.bmr_kcal ?? null, body_age: e.body_age ?? null,
      resting_heart_rate: e.resting_heart_rate ?? null,
    },
  }));
}

const { data, engine } = loadWorkoutEngine();

// Substitute the nutrition side's sleep/bodyweight as the single source of
// truth. Sorted newest-first to match what data.js's own arrays expect.
data.SLEEP = sleepFromNutrition().sort((a, b) => b.date.localeCompare(a.date));
const bw = bodyweightFromNutrition();
data.BODYWEIGHT = bw.slice().sort((a, b) => new Date(b.datetime) - new Date(a.datetime));
if (bw.length) data.ATHLETE.bodyweightKg = bw[bw.length - 1].kg;

const now = Date.now();
const analysis = engine.analyze(data, now);

// Attach the latest body-composition record (from weight.json) alongside
// the plain bodyweight-kg history the engine already computes.
const latestBw = data.BODYWEIGHT[0];
analysis.bodyweight.composition = latestBw?.bodyComposition || null;

const outPath = path.join(ROOT, "data/metrics/training_full.json");
fs.writeFileSync(outPath, JSON.stringify(analysis, null, 2) + "\n");
console.log(`Wrote ${outPath} (${fs.statSync(outPath).size} bytes)`);
