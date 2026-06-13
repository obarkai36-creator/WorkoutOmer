/* =============================================================================
 * data.js — YOUR WORKOUT DATA lives here.
 * -----------------------------------------------------------------------------
 * This is the only file you need to edit to log workouts. Open it, copy the
 * shape of an existing entry, and add new ones to the top of WORKOUTS.
 *
 * Everything else (charts, fatigue model, recommendations) updates automatically
 * when you reload index.html in a browser.
 *
 * Units: weights in KILOGRAMS (kg), distances in KILOMETERS (km).
 * ========================================================================== */

/* ---- About you -------------------------------------------------------------
 * bodyweightKg is used as the load base for bodyweight exercises (pull-ups,
 * dips, plank, etc.). `added` on a set adds weight on top of bodyweight.
 */
const ATHLETE = {
  name: "Omer",
  bodyweightKg: 78,
  units: { weight: "kg", distance: "km" },
  // Goal split you're aiming for. Used for frequency/balance advice.
  weeklyTarget: { strengthSessions: 4, aerobicSessions: 2 },
};

/* ---- Muscle map ------------------------------------------------------------
 * Each muscle belongs to a body "section" and has an approximate recovery
 * window (hours to ~full recovery for a hard session). Larger muscles recover
 * more slowly. Tune these to your own recovery if you like.
 */
const MUSCLES = {
  chest:      { label: "Chest",      section: "Push",    recoveryHours: 72 },
  shoulders:  { label: "Shoulders",  section: "Push",    recoveryHours: 48 },
  triceps:    { label: "Triceps",    section: "Push",    recoveryHours: 48 },
  back:       { label: "Back",       section: "Pull",    recoveryHours: 72 },
  biceps:     { label: "Biceps",     section: "Pull",    recoveryHours: 48 },
  quads:      { label: "Quads",      section: "Legs",    recoveryHours: 72 },
  hamstrings: { label: "Hamstrings", section: "Legs",    recoveryHours: 72 },
  glutes:     { label: "Glutes",     section: "Legs",    recoveryHours: 72 },
  calves:     { label: "Calves",     section: "Legs",    recoveryHours: 48 },
  core:       { label: "Core",       section: "Core",    recoveryHours: 36 },
  cardio:     { label: "Cardio",     section: "Aerobic", recoveryHours: 36 },
};

/* ---- Exercise library ------------------------------------------------------
 * Maps an exercise name to the muscles it loads and their share (1.0 = primary
 * mover, lower = assisting). `bodyweight: true` means the load base is your
 * bodyweight. Add your own exercises here; workouts just reference the name.
 */
const EXERCISE_LIBRARY = {
  // --- Push ---
  "Bench Press":              { kind: "strength", muscles: { chest: 1.0, triceps: 0.5, shoulders: 0.4 } },
  "Incline Dumbbell Press":   { kind: "strength", muscles: { chest: 1.0, shoulders: 0.5, triceps: 0.4 } },
  "Overhead Press":           { kind: "strength", muscles: { shoulders: 1.0, triceps: 0.5 } },
  "Lateral Raise":            { kind: "strength", muscles: { shoulders: 1.0 } },
  "Triceps Pushdown":         { kind: "strength", muscles: { triceps: 1.0 } },
  "Dips":                     { kind: "strength", bodyweight: true, muscles: { chest: 0.8, triceps: 1.0, shoulders: 0.4 } },

  // --- Pull ---
  "Pull-up":                  { kind: "strength", bodyweight: true, muscles: { back: 1.0, biceps: 0.5 } },
  "Barbell Row":              { kind: "strength", muscles: { back: 1.0, biceps: 0.4 } },
  "Lat Pulldown":             { kind: "strength", muscles: { back: 1.0, biceps: 0.4 } },
  "Seated Cable Row":         { kind: "strength", muscles: { back: 1.0, biceps: 0.4 } },
  "Barbell Curl":             { kind: "strength", muscles: { biceps: 1.0 } },
  "Face Pull":                { kind: "strength", muscles: { shoulders: 0.7, back: 0.5 } },

  // --- Legs ---
  "Back Squat":               { kind: "strength", muscles: { quads: 1.0, glutes: 0.6, hamstrings: 0.4 } },
  "Front Squat":              { kind: "strength", muscles: { quads: 1.0, glutes: 0.5, core: 0.3 } },
  "Romanian Deadlift":        { kind: "strength", muscles: { hamstrings: 1.0, glutes: 0.7, back: 0.3 } },
  "Leg Press":                { kind: "strength", muscles: { quads: 1.0, glutes: 0.5 } },
  "Leg Curl":                 { kind: "strength", muscles: { hamstrings: 1.0 } },
  "Walking Lunge":            { kind: "strength", muscles: { quads: 0.8, glutes: 1.0, hamstrings: 0.4 } },
  "Calf Raise":               { kind: "strength", muscles: { calves: 1.0 } },

  // --- Core ---
  "Plank":                    { kind: "strength", bodyweight: true, muscles: { core: 1.0 } },
  "Hanging Leg Raise":        { kind: "strength", bodyweight: true, muscles: { core: 1.0 } },
  "Cable Crunch":             { kind: "strength", muscles: { core: 1.0 } },

  // --- Aerobic ---
  "Run":                      { kind: "aerobic", muscles: { cardio: 1.0, quads: 0.3, calves: 0.3 } },
  "Cycling":                  { kind: "aerobic", muscles: { cardio: 1.0, quads: 0.4 } },
  "Rowing":                   { kind: "aerobic", muscles: { cardio: 1.0, back: 0.3, quads: 0.3 } },
};

/* ---- Workouts --------------------------------------------------------------
 * NEWEST FIRST. The first entry is treated as your "latest workout".
 *
 * Strength entry:
 *   { datetime: "2026-06-12T07:20", note: "...", exercises: [
 *       { name: "Back Squat", sets: [ { reps: 5, weight: 110 }, ... ] },
 *       // bodyweight move: use `added` for extra plates (omit for pure BW)
 *       { name: "Pull-up", sets: [ { reps: 8, added: 10 }, ... ] },
 *   ]}
 *
 * Aerobic entry:
 *   { datetime: "2026-06-05T18:45", exercises: [
 *       { name: "Run", durationMin: 38, distanceKm: 7.2, avgHr: 156, rpe: 7 },
 *   ]}
 *
 * `rpe` (1-10 perceived effort) drives aerobic load. If you only log avgHr,
 * the engine estimates rpe from heart rate.
 *
 * The sample data below is realistic placeholder so the dashboard is useful
 * immediately — replace it with your real sessions as they come.
 */
const WORKOUTS = [
  // LATEST — heavy leg day (legs will read as fatigued today)
  {
    datetime: "2026-06-12T07:20", note: "Legs — squat felt strong",
    exercises: [
      { name: "Back Squat",        sets: [ { reps: 5, weight: 115 }, { reps: 5, weight: 115 }, { reps: 5, weight: 110 }, { reps: 6, weight: 100 } ] },
      { name: "Romanian Deadlift", sets: [ { reps: 8, weight: 90 },  { reps: 8, weight: 90 },  { reps: 8, weight: 85 } ] },
      { name: "Leg Press",         sets: [ { reps: 12, weight: 180 }, { reps: 12, weight: 180 }, { reps: 10, weight: 180 } ] },
      { name: "Calf Raise",        sets: [ { reps: 15, weight: 90 },  { reps: 15, weight: 90 },  { reps: 15, weight: 90 } ] },
    ],
  },
  {
    datetime: "2026-06-11T07:30", note: "Pull",
    exercises: [
      { name: "Pull-up",       sets: [ { reps: 9, added: 5 }, { reps: 8, added: 5 }, { reps: 7 }, { reps: 6 } ] },
      { name: "Barbell Row",   sets: [ { reps: 8, weight: 80 }, { reps: 8, weight: 80 }, { reps: 8, weight: 75 } ] },
      { name: "Seated Cable Row", sets: [ { reps: 12, weight: 65 }, { reps: 12, weight: 65 }, { reps: 11, weight: 65 } ] },
      { name: "Barbell Curl",  sets: [ { reps: 10, weight: 35 }, { reps: 9, weight: 35 }, { reps: 8, weight: 35 } ] },
    ],
  },
  {
    datetime: "2026-06-09T07:10", note: "Push — bench PR!",
    exercises: [
      { name: "Bench Press",            sets: [ { reps: 5, weight: 92.5 }, { reps: 5, weight: 92.5 }, { reps: 5, weight: 90 }, { reps: 6, weight: 82.5 } ] },
      { name: "Overhead Press",         sets: [ { reps: 8, weight: 50 }, { reps: 7, weight: 50 }, { reps: 7, weight: 47.5 } ] },
      { name: "Incline Dumbbell Press", sets: [ { reps: 10, weight: 30 }, { reps: 10, weight: 30 }, { reps: 9, weight: 30 } ] },
      { name: "Triceps Pushdown",       sets: [ { reps: 12, weight: 30 }, { reps: 12, weight: 30 }, { reps: 12, weight: 27.5 } ] },
    ],
  },
  {
    datetime: "2026-06-06T07:20", note: "Legs",
    exercises: [
      { name: "Back Squat",        sets: [ { reps: 5, weight: 110 }, { reps: 5, weight: 110 }, { reps: 5, weight: 105 }, { reps: 6, weight: 95 } ] },
      { name: "Romanian Deadlift", sets: [ { reps: 8, weight: 87.5 }, { reps: 8, weight: 87.5 }, { reps: 8, weight: 82.5 } ] },
      { name: "Leg Press",         sets: [ { reps: 12, weight: 170 }, { reps: 12, weight: 170 }, { reps: 11, weight: 170 } ] },
      { name: "Calf Raise",        sets: [ { reps: 15, weight: 85 }, { reps: 15, weight: 85 }, { reps: 14, weight: 85 } ] },
    ],
  },
  {
    datetime: "2026-06-05T18:45",
    exercises: [
      { name: "Run", durationMin: 40, distanceKm: 7.5, avgHr: 158, rpe: 7 },
    ],
  },
  {
    datetime: "2026-06-04T07:15", note: "Pull",
    exercises: [
      { name: "Pull-up",          sets: [ { reps: 8, added: 5 }, { reps: 8 }, { reps: 7 }, { reps: 6 } ] },
      { name: "Barbell Row",      sets: [ { reps: 8, weight: 77.5 }, { reps: 8, weight: 77.5 }, { reps: 8, weight: 72.5 } ] },
      { name: "Lat Pulldown",     sets: [ { reps: 12, weight: 60 }, { reps: 12, weight: 60 }, { reps: 11, weight: 60 } ] },
      { name: "Barbell Curl",     sets: [ { reps: 10, weight: 32.5 }, { reps: 9, weight: 32.5 }, { reps: 8, weight: 32.5 } ] },
    ],
  },
  {
    datetime: "2026-06-02T07:25", note: "Push",
    exercises: [
      { name: "Bench Press",            sets: [ { reps: 5, weight: 90 }, { reps: 5, weight: 90 }, { reps: 5, weight: 87.5 }, { reps: 6, weight: 80 } ] },
      { name: "Overhead Press",         sets: [ { reps: 8, weight: 47.5 }, { reps: 7, weight: 47.5 }, { reps: 7, weight: 45 } ] },
      { name: "Incline Dumbbell Press", sets: [ { reps: 10, weight: 28 }, { reps: 10, weight: 28 }, { reps: 9, weight: 28 } ] },
      { name: "Triceps Pushdown",       sets: [ { reps: 12, weight: 27.5 }, { reps: 12, weight: 27.5 }, { reps: 11, weight: 27.5 } ] },
    ],
  },
  {
    datetime: "2026-05-30T07:10", note: "Legs",
    exercises: [
      { name: "Back Squat",        sets: [ { reps: 5, weight: 107.5 }, { reps: 5, weight: 107.5 }, { reps: 5, weight: 102.5 } ] },
      { name: "Romanian Deadlift", sets: [ { reps: 8, weight: 85 }, { reps: 8, weight: 85 }, { reps: 8, weight: 80 } ] },
      { name: "Leg Press",         sets: [ { reps: 12, weight: 165 }, { reps: 12, weight: 165 }, { reps: 11, weight: 165 } ] },
      { name: "Calf Raise",        sets: [ { reps: 15, weight: 80 }, { reps: 15, weight: 80 }, { reps: 14, weight: 80 } ] },
    ],
  },
  {
    datetime: "2026-05-29T18:30",
    exercises: [
      { name: "Run", durationMin: 35, distanceKm: 6.5, avgHr: 152, rpe: 6 },
    ],
  },
  {
    datetime: "2026-05-28T07:20", note: "Pull",
    exercises: [
      { name: "Pull-up",      sets: [ { reps: 8 }, { reps: 7 }, { reps: 7 }, { reps: 6 } ] },
      { name: "Barbell Row",  sets: [ { reps: 8, weight: 75 }, { reps: 8, weight: 75 }, { reps: 8, weight: 70 } ] },
      { name: "Lat Pulldown", sets: [ { reps: 12, weight: 57.5 }, { reps: 12, weight: 57.5 }, { reps: 11, weight: 57.5 } ] },
      { name: "Barbell Curl", sets: [ { reps: 10, weight: 30 }, { reps: 9, weight: 30 }, { reps: 8, weight: 30 } ] },
    ],
  },
  {
    datetime: "2026-05-26T07:15", note: "Push",
    exercises: [
      { name: "Bench Press",            sets: [ { reps: 5, weight: 87.5 }, { reps: 5, weight: 87.5 }, { reps: 5, weight: 85 } ] },
      { name: "Overhead Press",         sets: [ { reps: 8, weight: 45 }, { reps: 7, weight: 45 }, { reps: 7, weight: 42.5 } ] },
      { name: "Incline Dumbbell Press", sets: [ { reps: 10, weight: 26 }, { reps: 10, weight: 26 }, { reps: 9, weight: 26 } ] },
      { name: "Triceps Pushdown",       sets: [ { reps: 12, weight: 25 }, { reps: 12, weight: 25 }, { reps: 11, weight: 25 } ] },
    ],
  },
];

/* Expose for the engine (works whether loaded as module or plain script). */
if (typeof window !== "undefined") {
  window.GYM_DATA = { ATHLETE, MUSCLES, EXERCISE_LIBRARY, WORKOUTS };
}
