/* =============================================================================
 * data.js — YOUR WORKOUT DATA.
 * -----------------------------------------------------------------------------
 * Two parts:
 *   1) SNAPSHOT  — your current "latest" vs "best" for every tracked exercise,
 *                  grouped by muscle group. Powers the Workload Progress panel
 *                  and program-balance checks. (No dates needed.)
 *   2) WORKOUTS  — actual dated sessions (today + your cardio log). These drive
 *                  muscle fatigue, recovery, next-session timing, and cadence.
 *                  Add each new session here as it happens, newest first.
 *
 * Units: weights in KILOGRAMS (kg), distances in KILOMETERS (km).
 * Dumbbell loads marked "each" in your notes are stored as TOTAL kg moved
 * (e.g. 16kg each -> 32). Within an exercise this never affects latest-vs-best.
 * ========================================================================== */

const ATHLETE = {
  name: "Omer",
  bodyweightKg: 81.4, // most recent weigh-in (see BODYWEIGHT log)
  units: { weight: "kg", distance: "km" },
  weeklyTarget: { strengthSessions: 5, aerobicSessions: 2 },
};

/* ---- Bodyweight log (newest first) ----------------------------------------
 * Used for relative-strength denominators, bodyweight-exercise load, and the
 * weight trend shown on the Relative Strength panel. */
const BODYWEIGHT = [
  { datetime: "2026-06-20T07:05", kg: 81.4 },
  { datetime: "2026-06-19T07:52", kg: 81.65 },
  { datetime: "2026-06-17T05:30", kg: 80.7 },
  { datetime: "2026-06-16T06:05", kg: 81.75 },
];

/* ---- Muscles -> body section, recovery window, and push/pull role --------- */
const MUSCLES = {
  chest:      { label: "Chest",      section: "Chest",     recoveryHours: 72, role: "push" },
  back:       { label: "Back",       section: "Back",      recoveryHours: 72, role: "pull" },
  shoulders:  { label: "Shoulders",  section: "Shoulders", recoveryHours: 48, role: null   },
  biceps:     { label: "Biceps",     section: "Arms",      recoveryHours: 48, role: "pull" },
  triceps:    { label: "Triceps",    section: "Arms",      recoveryHours: 48, role: "push" },
  forearms:   { label: "Forearms",   section: "Arms",      recoveryHours: 36, role: null   },
  quads:      { label: "Quads",      section: "Legs",      recoveryHours: 72, role: null   },
  hamstrings: { label: "Hamstrings", section: "Legs",      recoveryHours: 72, role: null   },
  glutes:     { label: "Glutes",     section: "Legs",      recoveryHours: 72, role: null   },
  adductors:  { label: "Adductors",  section: "Legs",      recoveryHours: 48, role: null   },
  calves:     { label: "Calves",     section: "Legs",      recoveryHours: 48, role: null   },
  core:       { label: "Core",       section: "Core",      recoveryHours: 36, role: null   },
  cardio:     { label: "Cardio",     section: "Cardio",    recoveryHours: 36, role: null   },
};

/* Display order for sections across the dashboard. */
const SECTION_ORDER = ["Chest", "Back", "Shoulders", "Arms", "Legs", "Core", "Cardio"];

/* ---- Exercise library: which muscles each exercise loads (share 1.0=primary) */
const EXERCISE_LIBRARY = {
  // Chest
  "Bench Press":            { kind: "strength", muscles: { chest: 1.0, triceps: 0.4, shoulders: 0.3 } },
  "Dumbbell Bench Press":   { kind: "strength", muscles: { chest: 1.0, triceps: 0.4, shoulders: 0.3 } },
  "Incline Bench Press":    { kind: "strength", muscles: { chest: 1.0, shoulders: 0.4, triceps: 0.4 } },
  "Incline Dumbbell Bench Press": { kind: "strength", muscles: { chest: 1.0, shoulders: 0.4, triceps: 0.4 } },
  "Decline Bench Press":    { kind: "strength", muscles: { chest: 1.0, triceps: 0.4 } },
  "Incline Pec Fly":        { kind: "strength", muscles: { chest: 1.0, shoulders: 0.2 } },
  "Dumbbell Pec Fly":       { kind: "strength", muscles: { chest: 1.0 } },
  "Pec Fly Machine":        { kind: "strength", muscles: { chest: 1.0 } },
  "Chest Press Machine":    { kind: "strength", muscles: { chest: 1.0, triceps: 0.4, shoulders: 0.3 } },

  // Back
  "Diverging Seated Row":   { kind: "strength", muscles: { back: 1.0, biceps: 0.4 } },
  "Low Row":                { kind: "strength", muscles: { back: 1.0, biceps: 0.4 } },
  "Lat Pulldown (Triangle)":{ kind: "strength", muscles: { back: 1.0, biceps: 0.4 } },
  "Reverse Incline DB Row": { kind: "strength", muscles: { back: 1.0, shoulders: 0.3, biceps: 0.3 } },
  "Dumbbell Pullover":      { kind: "strength", muscles: { back: 1.0, chest: 0.4 } },
  "Dead Hang":              { kind: "strength", iso: true, bodyweight: true, muscles: { forearms: 1.0, back: 0.3 } },

  // Shoulders
  "Converging Shoulder Press":{ kind: "strength", muscles: { shoulders: 1.0, triceps: 0.4 } },
  "Dumbbell Shoulder Press":{ kind: "strength", muscles: { shoulders: 1.0, triceps: 0.4 } },
  "Lateral Raises":         { kind: "strength", muscles: { shoulders: 1.0 } },
  "Seated Lateral Raises":  { kind: "strength", muscles: { shoulders: 1.0 } },
  "Front Raises":           { kind: "strength", muscles: { shoulders: 1.0 } },
  "Rear Delt Machine":      { kind: "strength", muscles: { shoulders: 1.0, back: 0.3 } },
  "Shoulder Shrugs":        { kind: "strength", muscles: { shoulders: 0.7, back: 0.4 } },
  "Farmer's Hold":          { kind: "strength", iso: true, muscles: { forearms: 1.0, shoulders: 0.4 } },

  // Triceps (Arms)
  "Flat DB Triceps Extension":        { kind: "strength", muscles: { triceps: 1.0 } },
  "Seated Dips":                      { kind: "strength", muscles: { triceps: 1.0, chest: 0.4, shoulders: 0.3 } },
  "Triceps Extension Machine":        { kind: "strength", muscles: { triceps: 1.0 } },
  "Rope Cable Extension":             { kind: "strength", muscles: { triceps: 1.0 } },
  "Single-Hand DB Triceps Extension": { kind: "strength", muscles: { triceps: 1.0 } },
  "Overhead DB Triceps Extension":    { kind: "strength", muscles: { triceps: 1.0 } },

  // Biceps / Forearms (Arms)
  "Incline Hammer Curl":    { kind: "strength", muscles: { biceps: 1.0, forearms: 0.4 } },
  "Incline DB Curl":        { kind: "strength", muscles: { biceps: 1.0 } },
  "Hammer Curl":            { kind: "strength", muscles: { biceps: 1.0, forearms: 0.4 } },
  "Preacher Curl":          { kind: "strength", muscles: { biceps: 1.0 } },
  "Biceps Curl Machine":    { kind: "strength", muscles: { biceps: 1.0 } },
  "Half Curl":              { kind: "strength", muscles: { biceps: 1.0 } },
  "Forearm Twists":         { kind: "strength", muscles: { forearms: 1.0 } },

  // Calves (Legs)
  "Calf Raises Machine":            { kind: "strength", muscles: { calves: 1.0 } },
  "Standing Calf Raises (Frame)":   { kind: "strength", muscles: { calves: 1.0 } },
  "Dumbbell Calf Raise":            { kind: "strength", muscles: { calves: 1.0 } },

  // Legs
  "Leg Press":              { kind: "strength", muscles: { quads: 1.0, glutes: 0.5, hamstrings: 0.3 } },
  "Angled Leg Press":       { kind: "strength", muscles: { quads: 1.0, glutes: 0.5 } },
  "Leg Extensions":         { kind: "strength", muscles: { quads: 1.0 } },
  "Single-Leg Extensions":  { kind: "strength", muscles: { quads: 1.0 } },
  "Leg Curls":              { kind: "strength", muscles: { hamstrings: 1.0 } },
  "Outer Thigh":            { kind: "strength", muscles: { glutes: 0.8, quads: 0.2 } },
  "Inner Thigh":            { kind: "strength", muscles: { adductors: 1.0 } },
  "Glute Extension":        { kind: "strength", muscles: { glutes: 1.0, hamstrings: 0.4 } },
  "Dumbbell RDL":           { kind: "strength", muscles: { hamstrings: 1.0, glutes: 0.6, back: 0.3 } },
  "Dumbbell Sumo Squat":    { kind: "strength", muscles: { glutes: 1.0, quads: 0.7, adductors: 0.5 } },
  "Hip Thrust":             { kind: "strength", muscles: { glutes: 1.0, hamstrings: 0.4 } },
  "Glute Bridge":           { kind: "strength", bodyweight: true, muscles: { glutes: 1.0 } },

  // Cardio
  "Outdoor Run":            { kind: "aerobic", muscles: { cardio: 1.0, quads: 0.3, calves: 0.3 } },
  "Long Run":               { kind: "aerobic", muscles: { cardio: 1.0, quads: 0.3, calves: 0.3 } },
  "Rehabilitation Run":     { kind: "aerobic", muscles: { cardio: 1.0, quads: 0.2, calves: 0.2 } },
  "Incline Walk":           { kind: "aerobic", muscles: { cardio: 1.0, quads: 0.2, calves: 0.2 } },
  "Stationary Bike":        { kind: "aerobic", muscles: { cardio: 1.0, quads: 0.4 } },
};

/* ---- SNAPSHOT — latest vs best for every tracked lift ----------------------
 * Each rec is { sets, reps, weight } (uniform), or { scheme: [...] } for mixed
 * set/rep schemes, or { sets, seconds, weight } for timed holds (iso: true).
 * `text` keeps your original notation for display.
 */
const SNAPSHOT = [
  // ---- Chest ----
  { name: "Bench Press",         section: "Chest", latest: { sets: 4, reps: 5, weight: 72.5, text: "72.5kg × 4×5" }, best: { sets: 4, reps: 5, weight: 72.5, text: "72.5kg × 4×5" } },
  { name: "Dumbbell Bench Press", section: "Chest", latest: { sets: 4, reps: 12, weight: 48, text: "24kg each × 4×12" }, best: { sets: 4, reps: 12, weight: 48, text: "24kg each × 4×12" } },
  { name: "Incline Bench Press", section: "Chest", latest: { sets: 4, reps: 5, weight: 72.5, text: "72.5kg × 4×5" }, best: { sets: 4, reps: 5, weight: 72.5, text: "72.5kg × 4×5" } },
  { name: "Incline Dumbbell Bench Press", section: "Chest", latest: { sets: 4, reps: 10, weight: 48, text: "24kg each × 4×10" }, best: { sets: 4, reps: 10, weight: 48, text: "24kg each × 4×10" } },
  { name: "Decline Bench Press", section: "Chest", latest: { sets: 4, reps: 5, weight: 72.5, text: "72.5kg × 4×5" }, best: { sets: 4, reps: 5, weight: 72.5, text: "72.5kg × 4×5" } },
  { name: "Incline Pec Fly",     section: "Chest", latest: { sets: 4, reps: 8, weight: 36, text: "18kg each × 4×8" }, best: { sets: 4, reps: 8, weight: 36, text: "18kg each × 4×8" } },
  { name: "Dumbbell Pec Fly",    section: "Chest", latest: { sets: 4, reps: 7, weight: 36, text: "18kg each × 4×7" }, best: { sets: 4, reps: 8, weight: 32, text: "16kg each × 4×8" } },
  { name: "Pec Fly Machine",     section: "Chest", latest: { sets: 3, reps: 8, weight: 84, text: "84kg × 3×8" }, best: { sets: 3, reps: 8, weight: 84, text: "84kg × 3×8" } },
  { name: "Chest Press Machine", section: "Chest", latest: { sets: 4, reps: 6, weight: 59, text: "59kg × 4×6" }, best: { sets: 4, reps: 7, weight: 59, text: "59kg × 4×7" } },

  // ---- Back ----
  { name: "Diverging Seated Row",    section: "Back", latest: { sets: 4, reps: 8, weight: 97, text: "97kg × 4×8" }, best: { sets: 4, reps: 8, weight: 97, text: "97kg × 4×8" } },
  { name: "Low Row",                 section: "Back", latest: { sets: 4, reps: 8, weight: 79, text: "79kg × 4×8" }, best: { sets: 4, reps: 8, weight: 79, text: "79kg × 4×8" } },
  { name: "Lat Pulldown (Triangle)", section: "Back", latest: { sets: 3, reps: 8, weight: 77, text: "77kg × 3×8" }, best: { sets: 3, reps: 8, weight: 77, text: "77kg × 3×8" } },
  { name: "Reverse Incline DB Row",  section: "Back", latest: { sets: 4, reps: 10, weight: 48, text: "24kg each × 4×10" }, best: { sets: 4, reps: 10, weight: 48, text: "24kg each × 4×10" } },
  { name: "Dumbbell Pullover",       section: "Back", latest: { sets: 4, reps: 9, weight: 18, text: "18kg × 4×9" }, best: { sets: 4, reps: 9, weight: 18, text: "18kg × 4×9" } },
  { name: "Dead Hang",               section: "Back", iso: true, latest: { sets: 3, seconds: 20, weight: 78, text: "20 sec × 3" }, best: { sets: 3, seconds: 20, weight: 78, text: "20 sec × 3" } },

  // ---- Shoulders ----
  { name: "Converging Shoulder Press", section: "Shoulders", latest: { sets: 4, reps: 8, weight: 79, text: "79kg × 4×8" }, best: { sets: 4, reps: 8, weight: 79, text: "79kg × 4×8" } },
  { name: "Dumbbell Shoulder Press",   section: "Shoulders", latest: { sets: 4, reps: 8, weight: 36, text: "18kg each × 4×8" }, best: { sets: 4, reps: 8, weight: 36, text: "18kg each × 4×8" } },
  { name: "Lateral Raises",            section: "Shoulders", latest: { sets: 4, reps: 10, weight: 28, text: "14kg each × 4×10" }, best: { sets: 4, reps: 8, weight: 32, text: "16kg each × 4×8" } },
  { name: "Seated Lateral Raises",     section: "Shoulders", latest: { sets: 4, reps: 8, weight: 24, text: "12kg each × 4×8" }, best: { sets: 4, reps: 8, weight: 24, text: "12kg each × 4×8" } },
  { name: "Front Raises",              section: "Shoulders", latest: { sets: 4, reps: 8, weight: 18, text: "18kg KB × 4×8" }, best: { sets: 4, reps: 8, weight: 18, text: "18kg KB × 4×8" } },
  { name: "Rear Delt Machine",         section: "Shoulders", latest: { sets: 3, reps: 8, weight: 73, text: "73kg × 3×8" }, best: { sets: 3, reps: 8, weight: 73, text: "73kg × 3×8" } },
  { name: "Shoulder Shrugs",           section: "Shoulders", latest: { sets: 4, reps: 10, weight: 48, text: "24kg each × 4×10" }, best: { sets: 4, reps: 10, weight: 48, text: "24kg each × 4×10" } },
  { name: "Farmer's Hold",             section: "Shoulders", iso: true, latest: { sets: 4, seconds: 30, weight: 48, text: "24kg each × 4×30s" }, best: { sets: 4, seconds: 30, weight: 48, text: "24kg each × 4×30s" } },

  // ---- Arms: Triceps ----
  { name: "Flat DB Triceps Extension",        section: "Arms", latest: { sets: 4, reps: 4, weight: 36, text: "18kg each × 4×4" }, best: { sets: 4, reps: 6, weight: 32, text: "16kg each × 4×6" } },
  { name: "Overhead DB Triceps Extension",    section: "Arms", latest: { sets: 4, reps: 12, weight: 18, text: "18kg × 4×12" }, best: { sets: 4, reps: 12, weight: 18, text: "18kg × 4×12" } },
  { name: "Seated Dips",                      section: "Arms", latest: { sets: 4, reps: 8, weight: 62, text: "62kg × 4×8" }, best: { sets: 4, reps: 8, weight: 62, text: "62kg × 4×8" } },
  { name: "Triceps Extension Machine",        section: "Arms", latest: { sets: 3, reps: 8, weight: 41, text: "41kg × 3×8" }, best: { sets: 3, reps: 8, weight: 41, text: "41kg × 3×8" } },
  { name: "Rope Cable Extension",             section: "Arms", latest: { sets: 4, reps: 8, weight: 75, text: "75kg × 4×8" }, best: { sets: 4, reps: 8, weight: 75, text: "75kg × 4×8" } },
  { name: "Single-Hand DB Triceps Extension", section: "Arms", latest: { sets: 4, reps: 8, weight: 12, text: "12kg each × 4×8" }, best: { sets: 4, reps: 8, weight: 12, text: "12kg each × 4×8" } },

  // ---- Arms: Biceps / Forearms ----
  { name: "Incline Hammer Curl",  section: "Arms", latest: { sets: 4, reps: 4, weight: 20, text: "20kg each × 4×4" }, best: { sets: 4, reps: 8, weight: 18, text: "18kg each × 4×8" } },
  { name: "Incline DB Curl",      section: "Arms", latest: { sets: 4, reps: 4, weight: 20, text: "20kg each × 4×4" }, best: { sets: 4, reps: 5, weight: 18, text: "18kg each × 4×5" } },
  { name: "Hammer Curl",          section: "Arms", latest: { sets: 4, reps: 10, weight: 20, text: "20kg × 4×10" }, best: { sets: 4, reps: 10, weight: 20, text: "20kg × 4×10" } },
  { name: "Preacher Curl",        section: "Arms", latest: { sets: 3, reps: 7, weight: 35, text: "12.5kg each + bar × 3×7" }, best: { sets: 3, reps: 7, weight: 35, text: "12.5kg each + bar × 3×7" } },
  { name: "Biceps Curl Machine",  section: "Arms", latest: { sets: 3, reps: 6, weight: 45, text: "45kg × 3×6" }, best: { sets: 3, reps: 6, weight: 45, text: "45kg × 3×6" } },
  { name: "Half Curl",            section: "Arms", latest: { sets: 4, reps: 6, weight: 32, text: "16kg each × 4×6" }, best: { sets: 4, reps: 6, weight: 32, text: "16kg each × 4×6" } },
  { name: "Forearm Twists",       section: "Arms", latest: { sets: 4, reps: 10, weight: 24, text: "12kg each × 4×10" }, best: { sets: 4, reps: 10, weight: 24, text: "12kg each × 4×10" } },

  // ---- Legs (incl. calves) ----
  { name: "Calf Raises Machine",          section: "Legs", latest: { sets: 5, reps: 12, weight: 72, text: "72kg × 5×12" }, best: { sets: 5, reps: 12, weight: 72, text: "72kg × 5×12" } },
  { name: "Standing Calf Raises (Frame)", section: "Legs", latest: { sets: 4, reps: 11, weight: 73.5, text: "73.5kg × 4×11" }, best: { sets: 4, reps: 11, weight: 73.5, text: "73.5kg × 4×11" } },
  { name: "Dumbbell Calf Raise",          section: "Legs", latest: { sets: 4, reps: 12, weight: 48, text: "24kg each × 4×12" }, best: { sets: 4, reps: 12, weight: 48, text: "24kg each × 4×12" } },
  { name: "Leg Press",                    section: "Legs", latest: { sets: 3, reps: 8, weight: 132, text: "132kg × 3×8" }, best: { sets: 4, reps: 8, weight: 132, text: "132kg × 4×8" } },
  { name: "Angled Leg Press",             section: "Legs", latest: { sets: 4, reps: 8, weight: 131, text: "131kg setup × 4×8" }, best: { sets: 4, reps: 8, weight: 131, text: "131kg setup × 4×8" } },
  { name: "Leg Extensions",               section: "Legs", latest: { sets: 4, reps: 10, weight: 111, text: "111kg × 4×10" }, best: { sets: 4, reps: 12, weight: 111, text: "111kg × 4×12" } },
  { name: "Single-Leg Extensions",        section: "Legs", latest: { sets: 4, reps: 10, weight: 23.25, text: "23.25kg each × 4×10" }, best: { sets: 4, reps: 10, weight: 23.25, text: "23.25kg each × 4×10" } },
  { name: "Leg Curls",                    section: "Legs", latest: { sets: 4, reps: 12, weight: 111, text: "111kg × 4×12" }, best: { sets: 4, reps: 12, weight: 111, text: "111kg × 4×12" } },
  { name: "Outer Thigh",                  section: "Legs", latest: { sets: 4, reps: 8, weight: 79, text: "79kg × 4×8" }, best: { sets: 5, reps: 10, weight: 79, text: "79kg × 5×10" } },
  { name: "Inner Thigh",                  section: "Legs", latest: { sets: 4, reps: 12, weight: 73, text: "73kg × 4×12" }, best: { sets: 3, reps: 8, weight: 77, text: "77kg × 3×8" } },
  { name: "Glute Extension",              section: "Legs", latest: { sets: 1, reps: 5, weight: 59, text: "59kg × 1×5 each" }, best: { sets: 1, reps: 5, weight: 59, text: "59kg × 1×5 each" } },
  { name: "Dumbbell RDL",                 section: "Legs", latest: { sets: 4, reps: 10, weight: 24, text: "24kg × 4×10" }, best: { sets: 6, reps: 8, weight: 24, text: "24kg × 6×8" } },
  { name: "Dumbbell Sumo Squat",          section: "Legs", latest: { sets: 4, reps: 12, weight: 24, text: "24kg × 4×12" }, best: { sets: 6, reps: 8, weight: 24, text: "24kg × 6×8" } },
  { name: "Hip Thrust",                   section: "Legs", latest: { sets: 3, reps: 12, weight: 24, text: "24kg × 3×12" }, best: { sets: 3, reps: 12, weight: 24, text: "24kg × 3×12" } },
  { name: "Glute Bridge",                 section: "Legs", latest: { sets: 2, reps: 12, weight: 78, text: "BW × 2×12" }, best: { sets: 2, reps: 12, weight: 78, text: "BW × 2×12" } },
];

/* ---- WORKOUTS — dated sessions (newest first) ------------------------------
 * These drive muscle fatigue, recovery, the next-session call, and timing.
 * Per your choice, the undated SNAPSHOT tables above are NOT treated as recent
 * sessions — only what's logged here counts toward fatigue.
 *
 * NOTE: cardio clock-times below are placeholders (your log recorded duration,
 * not time of day), so the "typical time of day" stat is approximate until you
 * log real timestamps. Today's session time is set to this morning.
 */
const WORKOUTS = [
  // 23 Jun — Chest / Triceps / Shoulders / Back / Biceps, dumbbell session (20:50)
  {
    datetime: "2026-06-23T20:50", note: "Upper body (DB)",
    exercises: [
      { name: "Dumbbell Pec Fly",              sets: [ { reps: 7, weight: 36 }, { reps: 7, weight: 36 }, { reps: 7, weight: 36 }, { reps: 7, weight: 36 } ] },
      { name: "Flat DB Triceps Extension",     sets: [ { reps: 4, weight: 36 }, { reps: 4, weight: 36 }, { reps: 4, weight: 36 }, { reps: 4, weight: 36 } ] },
      { name: "Dumbbell Pullover",             sets: [ { reps: 9, weight: 18 }, { reps: 9, weight: 18 }, { reps: 9, weight: 18 }, { reps: 9, weight: 18 } ] },
      { name: "Overhead DB Triceps Extension", sets: [ { reps: 12, weight: 18 }, { reps: 12, weight: 18 }, { reps: 12, weight: 18 }, { reps: 12, weight: 18 } ] },
      { name: "Dumbbell Shoulder Press",       sets: [ { reps: 8, weight: 36 }, { reps: 8, weight: 36 }, { reps: 8, weight: 36 }, { reps: 8, weight: 36 } ] },
      { name: "Incline Hammer Curl",           sets: [ { reps: 4, weight: 20 }, { reps: 4, weight: 20 }, { reps: 4, weight: 20 }, { reps: 4, weight: 20 } ] },
      { name: "Incline DB Curl",               sets: [ { reps: 4, weight: 20 }, { reps: 4, weight: 20 }, { reps: 4, weight: 20 }, { reps: 4, weight: 20 } ] },
    ],
  },

  // 22 Jun — Incline treadmill walk (14:45): 40 min, 5–5.5 kph @ 4–8% incline,
  // ~300 kcal (treadmill estimate). Moderate effort -> rpe 5.
  {
    datetime: "2026-06-22T14:45", note: "Incline treadmill walk (4–8%, ~300 kcal)",
    exercises: [
      { name: "Incline Walk", distanceKm: 3.5, durationMin: 40, rpe: 5 },
    ],
  },

  // 20 Jun — 3 km guided run, Or Akiva (08:10). No HR strap; avgHr ESTIMATED at
  // 150 bpm from his own ~6.5 min/km history (145–148), +drift over 20 min
  // continuous, negative splits (6'45→6'08), 24°C, at 81.4 kg. ≈79% HRmax (Z3).
  {
    datetime: "2026-06-20T08:10", note: "3 km guided run — Or Akiva (HR estimated)",
    exercises: [
      { name: "Outdoor Run", distanceKm: 3.06, durationMin: 20.08, avgHr: 150, cadence: 158, elevationGainM: 15 },
    ],
  },

  // 19 Jun — Chest + Arms, dumbbell session (16:30)
  {
    datetime: "2026-06-19T16:30", note: "Chest + Arms (DB)",
    exercises: [
      { name: "Dumbbell Bench Press",         sets: [ { reps: 12, weight: 48 }, { reps: 12, weight: 48 }, { reps: 12, weight: 48 }, { reps: 12, weight: 48 } ] },
      { name: "Incline Dumbbell Bench Press", sets: [ { reps: 10, weight: 48 }, { reps: 10, weight: 48 }, { reps: 10, weight: 48 }, { reps: 10, weight: 48 } ] },
      { name: "Incline Pec Fly",              sets: [ { reps: 8, weight: 36 }, { reps: 8, weight: 36 }, { reps: 8, weight: 36 }, { reps: 8, weight: 36 } ] },
      { name: "Incline Hammer Curl",          sets: [ { reps: 8, weight: 18 }, { reps: 8, weight: 18 }, { reps: 8, weight: 18 }, { reps: 8, weight: 18 } ] },
      { name: "Incline DB Curl",              sets: [ { reps: 5, weight: 18 }, { reps: 5, weight: 18 }, { reps: 5, weight: 18 }, { reps: 5, weight: 18 } ] },
      { name: "Flat DB Triceps Extension",    sets: [ { reps: 6, weight: 32 }, { reps: 6, weight: 32 }, { reps: 6, weight: 32 }, { reps: 6, weight: 32 } ] },
      { name: "Overhead DB Triceps Extension", sets: [ { reps: 12, weight: 16 }, { reps: 12, weight: 16 }, { reps: 12, weight: 16 }, { reps: 12, weight: 16 } ] },
    ],
  },

  // 16 Jun — Back + Shoulders (13:30)
  {
    datetime: "2026-06-16T13:30", note: "Back + Shoulders",
    exercises: [
      { name: "Reverse Incline DB Row", sets: [ { reps: 10, weight: 48 }, { reps: 10, weight: 48 }, { reps: 10, weight: 48 }, { reps: 10, weight: 48 } ] },
      { name: "Dumbbell Pullover",      sets: [ { reps: 8, weight: 18 }, { reps: 8, weight: 18 }, { reps: 8, weight: 18 }, { reps: 8, weight: 18 } ] },
      { name: "Dumbbell Shoulder Press", sets: [ { reps: 8, weight: 36 }, { reps: 8, weight: 36 }, { reps: 8, weight: 36 }, { reps: 8, weight: 36 } ] },
      { name: "Front Raises",           sets: [ { reps: 8, weight: 18 }, { reps: 8, weight: 18 }, { reps: 8, weight: 18 }, { reps: 8, weight: 18 } ] },
      { name: "Shoulder Shrugs",        sets: [ { reps: 10, weight: 48 }, { reps: 10, weight: 48 }, { reps: 10, weight: 48 }, { reps: 10, weight: 48 } ] },
      { name: "Farmer's Hold",          sets: [ { seconds: 30, weight: 48 }, { seconds: 30, weight: 48 }, { seconds: 30, weight: 48 }, { seconds: 30, weight: 48 } ] },
    ],
  },

  // 14 Jun — Legs/Glutes at home (ended 23:28)
  {
    datetime: "2026-06-14T23:28", note: "Legs / Glutes (home)",
    exercises: [
      { name: "Dumbbell Sumo Squat", sets: [ { reps: 12, weight: 24 }, { reps: 12, weight: 24 }, { reps: 12, weight: 24 }, { reps: 12, weight: 24 } ] },
      { name: "Dumbbell Calf Raise",  sets: [ { reps: 12, weight: 48 }, { reps: 12, weight: 48 }, { reps: 12, weight: 48 }, { reps: 12, weight: 48 } ] },
      { name: "Dumbbell RDL",          sets: [ { reps: 10, weight: 24 }, { reps: 10, weight: 24 }, { reps: 10, weight: 24 }, { reps: 10, weight: 24 } ] },
      { name: "Hip Thrust",            sets: [ { reps: 12, weight: 24 }, { reps: 12, weight: 24 }, { reps: 12, weight: 24 } ] },
    ],
  },

  // TODAY — Chest + Biceps (10:15–11:15), finished with an easy treadmill walk
  {
    datetime: "2026-06-13T10:15", note: "Chest + Biceps + treadmill walk",
    exercises: [
      { name: "Bench Press",         sets: [ { reps: 5, weight: 72.5 }, { reps: 5, weight: 72.5 }, { reps: 5, weight: 72.5 }, { reps: 5, weight: 72.5 } ] },
      { name: "Incline Bench Press", sets: [ { reps: 5, weight: 72.5 }, { reps: 5, weight: 72.5 }, { reps: 5, weight: 72.5 }, { reps: 5, weight: 72.5 } ] },
      { name: "Decline Bench Press", sets: [ { reps: 5, weight: 72.5 }, { reps: 5, weight: 72.5 }, { reps: 5, weight: 72.5 }, { reps: 5, weight: 72.5 } ] },
      { name: "Incline Pec Fly",     sets: [ { reps: 8, weight: 32 }, { reps: 8, weight: 32 }, { reps: 8, weight: 32 }, { reps: 8, weight: 32 } ] },
      { name: "Incline Hammer Curl", sets: [ { reps: 8, weight: 16 }, { reps: 8, weight: 16 }, { reps: 8, weight: 16 }, { reps: 8, weight: 16 } ] },
      { name: "Incline DB Curl",     sets: [ { reps: 6, weight: 16 }, { reps: 6, weight: 16 }, { reps: 6, weight: 16 }, { reps: 6, weight: 16 } ] },
      // ~15 min treadmill, small incline, 15:00/km pace (≈1.0 km), easy effort
      { name: "Incline Walk",        durationMin: 15, distanceKm: 1.0, rpe: 3 },
    ],
  },

  // Cardio log (dates are day.month 2026; clock-times are placeholders)
  { datetime: "2026-05-08T18:00", exercises: [ { name: "Outdoor Run",        distanceKm: 2.00, durationMin: 13.2, avgHr: 148 } ] },
  { datetime: "2026-05-01T19:00", exercises: [ { name: "Stationary Bike",    durationMin: 70, rpe: 5 } ] },
  { datetime: "2026-04-21T18:00", exercises: [ { name: "Outdoor Run",        distanceKm: 2.50, durationMin: 16.4, avgHr: 145 } ] },
  { datetime: "2026-04-05T08:00", exercises: [ { name: "Incline Walk",       distanceKm: 2.98, durationMin: 35.1, avgHr: 117 } ] },
  { datetime: "2026-04-02T08:00", exercises: [ { name: "Incline Walk",       distanceKm: 3.84, durationMin: 42.0, avgHr: 115 } ] },
  { datetime: "2026-03-30T08:00", exercises: [ { name: "Incline Walk",       distanceKm: 3.38, durationMin: 39.4, rpe: 4 } ] },
  { datetime: "2026-03-23T18:00", exercises: [ { name: "Outdoor Run",        distanceKm: 2.00, durationMin: 12.5, avgHr: 147 } ] },
  { datetime: "2026-03-16T18:00", exercises: [ { name: "Outdoor Run",        distanceKm: 2.50, durationMin: 16.1, avgHr: 147 } ] },
  { datetime: "2026-03-11T18:00", exercises: [ { name: "Outdoor Run",        distanceKm: 2.51, durationMin: 14.7, avgHr: 154 } ] },
  { datetime: "2026-03-02T18:00", exercises: [ { name: "Rehabilitation Run", distanceKm: 3.00, durationMin: 22.1, avgHr: 145 } ] },
  { datetime: "2026-02-27T09:00", exercises: [ { name: "Long Run",           distanceKm: 10.00, durationMin: 66.25, avgHr: 156 } ] },
];

/* Expose for the engine. */
if (typeof window !== "undefined") {
  window.GYM_DATA = { ATHLETE, MUSCLES, SECTION_ORDER, EXERCISE_LIBRARY, SNAPSHOT, WORKOUTS, BODYWEIGHT };
}
