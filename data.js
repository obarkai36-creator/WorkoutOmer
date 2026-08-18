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
  bodyweightKg: 81.00, // most recent weigh-in (see BODYWEIGHT log)
  units: { weight: "kg", distance: "km" },
  weeklyTarget: { strengthSessions: 5, aerobicSessions: 2 },
};

/* ---- Bodyweight log (newest first) ----------------------------------------
 * Used for relative-strength denominators, bodyweight-exercise load, and the
 * weight trend shown on the Relative Strength panel. */
const BODYWEIGHT = [
  { datetime: "2026-07-28T07:00", kg: 81.00 },
  { datetime: "2026-07-24T09:00", kg: 81.20 },
  { datetime: "2026-07-18T10:00", kg: 81.25 },
  { datetime: "2026-07-17T07:45", kg: 81.55 },
  { datetime: "2026-07-13T00:00", kg: 81.0 },
  { datetime: "2026-07-11T12:10", kg: 80.95 },
  { datetime: "2026-06-20T07:05", kg: 81.4 },
  { datetime: "2026-06-19T07:52", kg: 81.65 },
  { datetime: "2026-06-17T05:30", kg: 80.7 },
  { datetime: "2026-06-16T06:05", kg: 81.75 },
];

/* ---- Sleep log (newest first) ----------------------------------------------
 * Manual entry each morning (no wearable / automatic feed — Health Connect
 * integration is US-only, not accessible yet). Feeds the Sleep panel and the
 * recovery note on the Next Session recommendation. */
const SLEEP = [
  // 2-3 Aug — solid full night, squarely in the 7-9h target band
  { date: "2026-08-03", start: "23:30", end: "06:55", hours: 7.42, note: "squarely in the 7-9h target, no fragmentation" },
  // 1-2 Aug — short night, below the 7-9h target band, late bedtime
  { date: "2026-08-02", start: "01:10", end: "06:55", hours: 5.75, note: "below the 7-9h target, late bedtime, no fragmentation" },
  // 31 Jul-1 Aug — solid full night, squarely in the 7-9h target band
  { date: "2026-08-01", start: "23:30", end: "06:50", hours: 7.33, note: "squarely in the 7-9h target, no fragmentation" },
  // 30-31 Jul — long solid night, squarely in the 7-9h target band
  { date: "2026-07-31", start: "23:15", end: "08:00", hours: 8.75, note: "squarely in the 7-9h target, no fragmentation" },
  // 29-30 Jul — solid full night, squarely in the 7-9h target band
  { date: "2026-07-30", start: "22:50", end: "06:45", hours: 7.92, note: "squarely in the 7-9h target, no fragmentation" },
  // 28-29 Jul — moderate night, a bit short of the 7-9h target band
  { date: "2026-07-29", start: "23:15", end: "05:30", hours: 6.25, note: "a bit short of the 7-9h target, no fragmentation" },
  // 27-28 Jul — solid full night, squarely in the 7-9h target band
  { date: "2026-07-28", start: "23:45", end: "06:55", hours: 7.17, note: "squarely in the 7-9h target, no fragmentation" },
  // 26-27 Jul — solid full night, squarely in the 7-9h target band
  { date: "2026-07-27", start: "23:15", end: "06:30", hours: 7.25, note: "squarely in the 7-9h target, no fragmentation" },
  // 25-26 Jul — moderate night, a bit short of the 7-9h target band
  { date: "2026-07-26", start: "23:45", end: "06:15", hours: 6.5, note: "below the 7-9h target, no fragmentation" },
  // 24-25 Jul — long solid night, squarely in the 7-9h target band
  { date: "2026-07-25", start: "23:45", end: "08:30", hours: 8.75, note: "squarely in the 7-9h target, no fragmentation" },
  // 23-24 Jul — long solid night, just above the 7-9h target band
  { date: "2026-07-24", start: "23:00", end: "08:00", hours: 9, note: "just above the 7-9h target, no fragmentation" },
  // 22-23 Jul — solid full night, squarely in the 7-9h target band
  { date: "2026-07-23", start: "22:50", end: "06:25", hours: 7.58, note: "squarely in the 7-9h target, no fragmentation" },
  // 21-22 Jul — moderate night, a bit short of the 7-9h target band
  { date: "2026-07-22", start: "23:35", end: "05:40", hours: 6.08, note: "below the 7-9h target, no fragmentation" },
  // 20-21 Jul — solid full night, bounce-back after two short nights
  { date: "2026-07-21", start: "22:50", end: "06:30", hours: 7.67, note: "squarely in the 7-9h target, strong bounce-back" },
  // 19-20 Jul — short night, well below the 7-9h target band
  { date: "2026-07-20", start: "01:50", end: "06:30", hours: 4.67, note: "well below the 7-9h target, late bedtime, no fragmentation" },
  // 18-19 Jul — moderate night, a bit short of the 7-9h target band
  { date: "2026-07-19", start: "01:50", end: "08:20", hours: 6.5, note: "below the 7-9h target, late bedtime, no fragmentation" },
  // 17-18 Jul — very long night, just above the 7-9h target band
  { date: "2026-07-18", start: "23:15", end: "09:00", hours: 9.75, note: "just above the 7-9h target, strong recovery" },
  // 16-17 Jul — long solid night, bounce-back after three short nights
  { date: "2026-07-17", start: "22:30", end: "07:20", hours: 8.83, note: "squarely in the 7-9h target, strong bounce-back" },
  // 15-16 Jul — short night, third late bedtime in a row
  { date: "2026-07-16", start: "01:00", end: "06:25", hours: 5.42, note: "below the 7-9h target, late bedtime, no fragmentation" },
  // 14-15 Jul — short night, late bedtime after the buffet day
  { date: "2026-07-15", start: "01:10", end: "06:45", hours: 5.58, note: "below the 7-9h target, late bedtime, no fragmentation" },
  // 13-14 Jul — moderate night, one continuous stretch
  { date: "2026-07-14", start: "23:00", end: "05:20", hours: 6.33, note: "a bit under the 7-9h target, no fragmentation" },
  // 12-13 Jul — solid full night, good recovery after the fragmented night before
  { date: "2026-07-13", start: "22:35", end: "06:30", hours: 7.92, note: "solid full night" },
  // 11-12 Jul — fragmented, very short night (two segments)
  { date: "2026-07-12", start: "02:45", end: "05:03", hours: 1.47, note: "fragmented — two segments (1h15m + 13m)" },
  // 10-11 Jul — long catch-up sleep after the 10 Jul travel day (4:50hr flight, tz +2 shift)
  { date: "2026-07-11", start: "00:30", end: "11:45", hours: 11.25, note: "catch-up sleep post-travel" },
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
  "Narrow Push-Ups":        { kind: "strength", bodyweight: true, muscles: { chest: 0.7, triceps: 0.7 } },
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

  // Core
  "Plank":                  { kind: "strength", iso: true, bodyweight: true, muscles: { core: 1.0 } },
  "VKR":                    { kind: "strength", bodyweight: true, muscles: { core: 1.0 } },
  "VKR to Sides":           { kind: "strength", bodyweight: true, muscles: { core: 1.0 } },
  "Stretching / Mobility (rehab)": { kind: "mobility", iso: true, muscles: {} },

  // Cardio
  "Outdoor Run":            { kind: "aerobic", muscles: { cardio: 1.0, quads: 0.3, calves: 0.3 } },
  "Long Run":               { kind: "aerobic", muscles: { cardio: 1.0, quads: 0.3, calves: 0.3 } },
  "Rehabilitation Run":     { kind: "aerobic", muscles: { cardio: 1.0, quads: 0.2, calves: 0.2 } },
  "Incline Walk":           { kind: "aerobic", muscles: { cardio: 1.0, quads: 0.2, calves: 0.2 } },
  "Outdoor Walk":           { kind: "aerobic", muscles: { cardio: 1.0, quads: 0.2, calves: 0.2 } },
  "Stationary Bike":        { kind: "aerobic", muscles: { cardio: 1.0, quads: 0.4 } },
};

/* ---- SNAPSHOT — latest vs best for every tracked lift ----------------------
 * Each rec is { sets, reps, weight } (uniform), or { scheme: [...] } for mixed
 * set/rep schemes, or { sets, seconds, weight } for timed holds (iso: true).
 * `text` keeps your original notation for display.
 */
const SNAPSHOT = [
  // ---- Chest ----
  { name: "Bench Press",         section: "Chest", latest: { sets: 4, reps: 8, weight: 72.5, text: "72.5kg × 4×8" }, best: { sets: 4, reps: 8, weight: 72.5, text: "72.5kg × 4×8" } },
  { name: "Dumbbell Bench Press", section: "Chest", latest: { sets: 4, reps: 12, weight: 48, text: "24kg each × 4×12" }, best: { sets: 4, reps: 12, weight: 48, text: "24kg each × 4×12" } },
  { name: "Incline Bench Press", section: "Chest", latest: { sets: 4, reps: 7, weight: 72.5, text: "72.5kg × 4×7" }, best: { sets: 4, reps: 7, weight: 72.5, text: "72.5kg × 4×7" } },
  { name: "Incline Dumbbell Bench Press", section: "Chest", latest: { sets: 4, reps: 11, weight: 48, text: "24kg each × 4×11" }, best: { sets: 4, reps: 11, weight: 48, text: "24kg each × 4×11" } },
  { name: "Decline Bench Press", section: "Chest", latest: { sets: 4, reps: 6, weight: 72.5, text: "72.5kg × 4×6" }, best: { sets: 4, reps: 6, weight: 72.5, text: "72.5kg × 4×6" } },
  { name: "Incline Pec Fly",     section: "Chest", latest: { sets: 4, reps: 9, weight: 36, text: "18kg each × 4×9" }, best: { sets: 4, reps: 9, weight: 36, text: "18kg each × 4×9" } },
  { name: "Narrow Push-Ups",     section: "Chest", latest: { sets: 4, reps: 10, weight: 81.00, text: "BW × 4×10" }, best: { sets: 4, reps: 10, weight: 81.00, text: "BW × 4×10" } },
  { name: "Dumbbell Pec Fly",    section: "Chest", latest: { sets: 4, reps: 7, weight: 36, text: "18kg each × 4×7" }, best: { sets: 4, reps: 8, weight: 32, text: "16kg each × 4×8" } },
  { name: "Pec Fly Machine",     section: "Chest", latest: { sets: 3, reps: 6, weight: 73, text: "73kg × 3×6 (deload)" }, best: { sets: 3, reps: 8, weight: 84, text: "84kg × 3×8" } },
  { name: "Chest Press Machine", section: "Chest", latest: { sets: 4, reps: 4, weight: 73, text: "73kg × 4×4" }, best: { sets: 4, reps: 6, weight: 73, text: "73kg × 4×6" } },

  // ---- Back ----
  { name: "Diverging Seated Row",    section: "Back", latest: { sets: 4, reps: 8, weight: 97, text: "97kg × 4×8" }, best: { sets: 4, reps: 8, weight: 97, text: "97kg × 4×8" } },
  { name: "Low Row",                 section: "Back", latest: { sets: 4, reps: 10, weight: 79, text: "79kg × 4×10" }, best: { sets: 4, reps: 10, weight: 79, text: "79kg × 4×10" } },
  { name: "Lat Pulldown (Triangle)", section: "Back", latest: { sets: 3, reps: 8, weight: 77, text: "77kg × 3×8" }, best: { sets: 3, reps: 8, weight: 77, text: "77kg × 3×8" } },
  { name: "Reverse Incline DB Row",  section: "Back", latest: { sets: 4, reps: 11, weight: 52, text: "26kg each × 4×11" }, best: { sets: 4, reps: 11, weight: 52, text: "26kg each × 4×11" } },
  { name: "Dumbbell Pullover",       section: "Back", latest: { sets: 4, reps: 11, weight: 20, text: "20kg × 4×11" }, best: { sets: 4, reps: 11, weight: 20, text: "20kg × 4×11" } },
  { name: "Dead Hang",               section: "Back", iso: true, latest: { scheme: [ { sets: 1, seconds: 35, weight: 81.00 }, { sets: 1, seconds: 30, weight: 81.00 }, { sets: 1, seconds: 25, weight: 81.00 } ], text: "35s + 30s + 25s" }, best: { scheme: [ { sets: 1, seconds: 35, weight: 81.00 }, { sets: 1, seconds: 30, weight: 81.00 }, { sets: 1, seconds: 25, weight: 81.00 } ], text: "35s + 30s + 25s" } },

  // ---- Shoulders ----
  { name: "Converging Shoulder Press", section: "Shoulders", latest: { sets: 4, reps: 6, weight: 68, text: "68kg × 4×6 (deload)" }, best: { sets: 4, reps: 8, weight: 79, text: "79kg × 4×8" } },
  { name: "Dumbbell Shoulder Press",   section: "Shoulders", latest: { sets: 4, reps: 10, weight: 36, text: "18kg each × 4×10" }, best: { sets: 4, reps: 10, weight: 36, text: "18kg each × 4×10" } },
  { name: "Lateral Raises",            section: "Shoulders", latest: { sets: 4, reps: 9, weight: 32, text: "16kg each × 4×9" }, best: { sets: 4, reps: 9, weight: 32, text: "16kg each × 4×9" } },
  { name: "Seated Lateral Raises",     section: "Shoulders", latest: { sets: 4, reps: 10, weight: 24, text: "12kg each × 4×10" }, best: { sets: 4, reps: 7, weight: 28, text: "14kg each × 4×7" } },
  { name: "Front Raises",              section: "Shoulders", latest: { sets: 4, reps: 8, weight: 18, text: "18kg KB × 4×8" }, best: { sets: 4, reps: 8, weight: 18, text: "18kg KB × 4×8" } },
  { name: "Rear Delt Machine",         section: "Shoulders", latest: { sets: 3, reps: 9, weight: 73, text: "73kg × 3×9" }, best: { sets: 3, reps: 9, weight: 73, text: "73kg × 3×9" } },
  { name: "Shoulder Shrugs",           section: "Shoulders", latest: { sets: 4, reps: 8, weight: 52, text: "26kg each × 4×8" }, best: { sets: 4, reps: 12, weight: 48, text: "24kg each × 4×12" } },
  { name: "Farmer's Hold",             section: "Shoulders", iso: true, latest: { sets: 4, seconds: 30, weight: 52, text: "26kg each × 4×30s" }, best: { sets: 4, seconds: 35, weight: 48, text: "24kg each × 4×35s" } },

  // ---- Arms: Triceps ----
  { name: "Flat DB Triceps Extension",        section: "Arms", latest: { sets: 4, reps: 4, weight: 36, text: "18kg each × 4×4" }, best: { sets: 4, reps: 6, weight: 32, text: "16kg each × 4×6" } },
  { name: "Overhead DB Triceps Extension",    section: "Arms", latest: { sets: 4, reps: 12, weight: 18, text: "18kg × 4×12" }, best: { sets: 4, reps: 12, weight: 18, text: "18kg × 4×12" } },
  { name: "Seated Dips",                      section: "Arms", latest: { sets: 4, reps: 8, weight: 62, text: "62kg × 4×8" }, best: { sets: 4, reps: 8, weight: 62, text: "62kg × 4×8" } },
  { name: "Triceps Extension Machine",        section: "Arms", latest: { sets: 3, reps: 8, weight: 41, text: "41kg × 3×8" }, best: { sets: 3, reps: 8, weight: 41, text: "41kg × 3×8" } },
  { name: "Rope Cable Extension",             section: "Arms", latest: { sets: 4, reps: 6, weight: 64, text: "64kg × 4×6 (deload)" }, best: { sets: 4, reps: 8, weight: 75, text: "75kg × 4×8" } },
  { name: "Single-Hand DB Triceps Extension", section: "Arms", latest: { sets: 4, reps: 8, weight: 12, text: "12kg each × 4×8" }, best: { sets: 4, reps: 8, weight: 12, text: "12kg each × 4×8" } },

  // ---- Arms: Biceps / Forearms ----
  { name: "Incline Hammer Curl",  section: "Arms", latest: { sets: 4, reps: 8, weight: 18, text: "18kg each × 4×8" }, best: { sets: 4, reps: 8, weight: 18, text: "18kg each × 4×8" } },
  { name: "Incline DB Curl",      section: "Arms", latest: { sets: 4, reps: 6, weight: 18, text: "18kg each × 4×6" }, best: { sets: 4, reps: 6, weight: 18, text: "18kg each × 4×6" } },
  { name: "Hammer Curl",          section: "Arms", latest: { sets: 4, reps: 10, weight: 20, text: "20kg × 4×10" }, best: { sets: 4, reps: 10, weight: 20, text: "20kg × 4×10" } },
  { name: "Preacher Curl",        section: "Arms", latest: { sets: 3, reps: 7, weight: 35, text: "12.5kg each + bar × 3×7" }, best: { sets: 3, reps: 7, weight: 35, text: "12.5kg each + bar × 3×7" } },
  { name: "Biceps Curl Machine",  section: "Arms", latest: { sets: 2, reps: 6, weight: 45, text: "45kg × 2×6" }, best: { sets: 3, reps: 6, weight: 45, text: "45kg × 3×6" } },
  { name: "Half Curl",            section: "Arms", latest: { sets: 4, reps: 5, weight: 36, text: "18kg each × 4×5" }, best: { sets: 4, reps: 5, weight: 36, text: "18kg each × 4×5" } },
  { name: "Forearm Twists",       section: "Arms", latest: { sets: 4, reps: 10, weight: 24, text: "12kg each × 4×10" }, best: { sets: 4, reps: 10, weight: 24, text: "12kg each × 4×10" } },

  // ---- Legs (incl. calves) ----
  { name: "Calf Raises Machine",          section: "Legs", latest: { sets: 4, reps: 8, weight: 81, text: "81kg (70kg + 11kg frame) × 4×8" }, best: { sets: 4, reps: 11, weight: 76, text: "76kg × 4×11" } },
  { name: "Standing Calf Raises (Frame)", section: "Legs", latest: { sets: 4, reps: 11, weight: 73.5, text: "73.5kg × 4×11" }, best: { sets: 4, reps: 11, weight: 73.5, text: "73.5kg × 4×11" } },
  { name: "Dumbbell Calf Raise",          section: "Legs", latest: { sets: 4, reps: 12, weight: 48, text: "24kg each × 4×12" }, best: { sets: 4, reps: 12, weight: 48, text: "24kg each × 4×12" } },
  { name: "Leg Press",                    section: "Legs", latest: { sets: 4, reps: 10, weight: 132, text: "132kg × 4×10" }, best: { sets: 4, reps: 10, weight: 132, text: "132kg × 4×10" } },
  // NOTE: 11 Jul (202kg) is the first entry counting the full setup total
  // (plates each side x2 + sled/frame weight). Earlier entries (e.g. 131kg)
  // likely under-counted this (confirmed by user) — treat pre-11-Jul figures
  // as not directly comparable; use the each-side+frame total from now on.
  { name: "Angled Leg Press",             section: "Legs", latest: { sets: 4, reps: 7, weight: 202, text: "202kg setup (70kg each side + 62kg frame) × 4×7" }, best: { sets: 4, reps: 7, weight: 202, text: "202kg setup (70kg each side + 62kg frame) × 4×7" } },
  { name: "Leg Extensions",               section: "Legs", latest: { sets: 4, reps: 12, weight: 111, text: "111kg × 4×12" }, best: { sets: 4, reps: 12, weight: 111, text: "111kg × 4×12" } },
  { name: "Single-Leg Extensions",        section: "Legs", latest: { sets: 4, reps: 6, weight: 57, text: "57kg each × 4×6" }, best: { sets: 4, reps: 6, weight: 57, text: "57kg each × 4×6" } },
  { name: "Leg Curls",                    section: "Legs", latest: { sets: 4, reps: 12, weight: 111, text: "111kg × 4×12" }, best: { sets: 4, reps: 12, weight: 111, text: "111kg × 4×12" } },
  { name: "Outer Thigh",                  section: "Legs", latest: { sets: 4, reps: 10, weight: 79, text: "79kg × 4×10" }, best: { sets: 5, reps: 10, weight: 79, text: "79kg × 5×10" } },
  { name: "Inner Thigh",                  section: "Legs", latest: { sets: 3, reps: 9, weight: 79, text: "79kg × 3×9" }, best: { sets: 3, reps: 9, weight: 79, text: "79kg × 3×9" } },
  { name: "Glute Extension",              section: "Legs", latest: { sets: 1, reps: 5, weight: 59, text: "59kg × 1×5 each" }, best: { sets: 1, reps: 5, weight: 59, text: "59kg × 1×5 each" } },
  { name: "Dumbbell RDL",                 section: "Legs", latest: { sets: 4, reps: 10, weight: 24, text: "24kg × 4×10" }, best: { sets: 6, reps: 8, weight: 24, text: "24kg × 6×8" } },
  { name: "Dumbbell Sumo Squat",          section: "Legs", latest: { sets: 4, reps: 12, weight: 24, text: "24kg × 4×12" }, best: { sets: 6, reps: 8, weight: 24, text: "24kg × 6×8" } },
  { name: "Hip Thrust",                   section: "Legs", latest: { sets: 3, reps: 12, weight: 24, text: "24kg × 3×12" }, best: { sets: 3, reps: 12, weight: 24, text: "24kg × 3×12" } },
  { name: "Glute Bridge",                 section: "Legs", latest: { sets: 2, reps: 12, weight: 78, text: "BW × 2×12" }, best: { sets: 2, reps: 12, weight: 78, text: "BW × 2×12" } },

  // ---- Core ----
  { name: "Plank", section: "Core", iso: true, latest: { sets: 3, seconds: 35, weight: 81.00, text: "BW × 3×35s" }, best: { sets: 3, seconds: 35, weight: 81.00, text: "BW × 3×35s" } },
  { name: "VKR", section: "Core", latest: { sets: 4, reps: 10, weight: 81.2, text: "BW × 4×10" }, best: { sets: 4, reps: 10, weight: 81.2, text: "BW × 4×10" } },
  { name: "VKR to Sides", section: "Core", latest: { sets: 4, reps: 8, weight: 81.2, text: "BW × 4×8" }, best: { sets: 4, reps: 8, weight: 81.2, text: "BW × 4×8" } },
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
  // 18 Aug — Shoulders (20:00)
  {
    datetime: "2026-08-18T20:00", note: "Shoulders",
    exercises: [
      { name: "Dumbbell Shoulder Press", sets: [ { reps: 10, weight: 36 }, { reps: 10, weight: 36 }, { reps: 10, weight: 36 }, { reps: 10, weight: 36 } ] },
      { name: "Seated Lateral Raises",   sets: [ { reps: 10, weight: 24 }, { reps: 10, weight: 24 }, { reps: 10, weight: 24 }, { reps: 10, weight: 24 } ] },
      { name: "Shoulder Shrugs",         sets: [ { reps: 8, weight: 52 }, { reps: 8, weight: 52 }, { reps: 8, weight: 52 }, { reps: 8, weight: 52 } ] },
      { name: "Farmer's Hold",           sets: [ { seconds: 30, weight: 52 }, { seconds: 30, weight: 52 }, { seconds: 30, weight: 52 }, { seconds: 30, weight: 52 } ] },
    ],
  },

  // 15 Aug — Back + Stationary Bike (rehab) (11:00)
  {
    datetime: "2026-08-15T11:00", note: "Back + Stationary Bike (rehab, low intensity, after weights)",
    exercises: [
      { name: "Diverging Seated Row",   sets: [ { reps: 8, weight: 97 }, { reps: 8, weight: 97 }, { reps: 8, weight: 97 }, { reps: 8, weight: 97 } ] },
      { name: "Low Row",                sets: [ { reps: 10, weight: 79 }, { reps: 10, weight: 79 }, { reps: 10, weight: 79 }, { reps: 10, weight: 79 } ] },
      { name: "Reverse Incline DB Row", sets: [ { reps: 11, weight: 52 }, { reps: 11, weight: 52 }, { reps: 11, weight: 52 }, { reps: 11, weight: 52 } ] },
      { name: "Dumbbell Pullover",      sets: [ { reps: 11, weight: 20 }, { reps: 11, weight: 20 }, { reps: 11, weight: 20 }, { reps: 11, weight: 20 } ] },
      { name: "Dead Hang",              sets: [ { seconds: 35 }, { seconds: 30 }, { seconds: 25 } ] },
      { name: "Stationary Bike",        durationMin: 16, rpe: 3 },
    ],
  },

  // 14 Aug — Legs (16:45)
  {
    datetime: "2026-08-14T16:45", note: "Legs",
    exercises: [
      { name: "Calf Raises Machine",   sets: [ { reps: 8, weight: 81 }, { reps: 8, weight: 81 }, { reps: 8, weight: 81 }, { reps: 8, weight: 81 } ] },
      { name: "Angled Leg Press",      sets: [ { reps: 7, weight: 202 }, { reps: 7, weight: 202 }, { reps: 7, weight: 202 }, { reps: 7, weight: 202 } ] },
      { name: "Single-Leg Extensions", sets: [ { reps: 6, weight: 57 }, { reps: 6, weight: 57 }, { reps: 6, weight: 57 }, { reps: 6, weight: 57 } ] },
      { name: "Inner Thigh",           sets: [ { reps: 9, weight: 79 }, { reps: 9, weight: 79 }, { reps: 9, weight: 79 } ] },
      { name: "Outer Thigh",           sets: [ { reps: 10, weight: 79 }, { reps: 10, weight: 79 }, { reps: 10, weight: 79 }, { reps: 10, weight: 79 } ] },
    ],
  },

  // 12 Aug — Back (07:15)
  {
    datetime: "2026-08-12T07:15", note: "Back",
    exercises: [
      { name: "Diverging Seated Row",   sets: [ { reps: 6, weight: 100 }, { reps: 6, weight: 100 }, { reps: 6, weight: 100 }, { reps: 6, weight: 100 } ] },
      { name: "Dumbbell Pullover",      sets: [ { reps: 10, weight: 20 }, { reps: 10, weight: 20 }, { reps: 10, weight: 20 }, { reps: 10, weight: 20 } ] },
      { name: "Reverse Incline DB Row", sets: [ { reps: 10, weight: 52 }, { reps: 10, weight: 52 }, { reps: 10, weight: 52 }, { reps: 10, weight: 52 } ] },
      { name: "Dead Hang",              sets: [ { seconds: 35 }, { seconds: 30 }, { seconds: 25 } ] },
    ],
  },

  // 10 Aug — Stationary bike, "lazy bike" level 3 (07:00)
  {
    datetime: "2026-08-10T07:00", note: "Stationary bike (\"lazy bike\", level 3) — 115 kcal per machine, avg speed 16.7km/h",
    exercises: [
      { name: "Stationary Bike", distanceKm: 6.8, durationMin: 25 },
    ],
  },

  // 9 Aug — Alternating run/walk, Or Akiva (18:15)
  {
    datetime: "2026-08-09T18:15", note: "Alternating run/walk — Or Akiva (sun exposure ~half the run)",
    exercises: [
      { name: "Outdoor Run", distanceKm: 5.01, durationMin: 46.03, cadence: 127, elevationGainM: 35 },
    ],
  },

  // 8 Aug — Chest (15:55)
  {
    datetime: "2026-08-08T15:55", note: "Chest",
    exercises: [
      { name: "Dumbbell Bench Press",         sets: [ { reps: 12, weight: 48 }, { reps: 12, weight: 48 }, { reps: 12, weight: 48 }, { reps: 12, weight: 48 } ] },
      { name: "Incline Pec Fly",              sets: [ { reps: 9, weight: 36 }, { reps: 9, weight: 36 }, { reps: 9, weight: 36 }, { reps: 9, weight: 36 } ] },
      { name: "Incline Dumbbell Bench Press", sets: [ { reps: 11, weight: 48 }, { reps: 11, weight: 48 }, { reps: 11, weight: 48 }, { reps: 11, weight: 48 } ] },
      { name: "Narrow Push-Ups",              sets: [ { reps: 10 }, { reps: 10 }, { reps: 10 }, { reps: 10 } ] },
    ],
  },

  // 7 Aug — Shoulders (10:30)
  {
    datetime: "2026-08-07T10:30", note: "Shoulders",
    exercises: [
      { name: "Dumbbell Shoulder Press", sets: [ { reps: 10, weight: 36 }, { reps: 10, weight: 36 }, { reps: 10, weight: 36 }, { reps: 10, weight: 36 } ] },
      { name: "Shoulder Shrugs",         sets: [ { reps: 12, weight: 48 }, { reps: 12, weight: 48 }, { reps: 12, weight: 48 }, { reps: 12, weight: 48 } ] },
      { name: "Farmer's Hold",           sets: [ { seconds: 35, weight: 48 }, { seconds: 35, weight: 48 }, { seconds: 35, weight: 48 }, { seconds: 35, weight: 48 } ] },
      { name: "Lateral Raises",          sets: [ { reps: 9, weight: 32 }, { reps: 9, weight: 32 }, { reps: 9, weight: 32 }, { reps: 9, weight: 32 } ] },
    ],
  },

  // 4 Aug — Back (14:30)
  {
    datetime: "2026-08-04T14:30", note: "Back",
    exercises: [
      { name: "Diverging Seated Row",   sets: [ { reps: 8, weight: 97 }, { reps: 8, weight: 97 }, { reps: 8, weight: 97 }, { reps: 8, weight: 97 } ] },
      { name: "Low Row",                sets: [ { reps: 9, weight: 79 }, { reps: 9, weight: 79 }, { reps: 9, weight: 79 }, { reps: 9, weight: 79 } ] },
      { name: "Reverse Incline DB Row", sets: [ { reps: 9, weight: 52 }, { reps: 9, weight: 52 }, { reps: 9, weight: 52 }, { reps: 9, weight: 52 } ] },
      { name: "Dumbbell Pullover",      sets: [ { reps: 11, weight: 18 }, { reps: 11, weight: 18 }, { reps: 11, weight: 18 }, { reps: 11, weight: 18 } ] },
      { name: "Dead Hang",              sets: [ { seconds: 35 }, { seconds: 35 } ] },
    ],
  },

  // 3 Aug — Chest (21:05)
  {
    datetime: "2026-08-03T21:05", note: "Chest",
    exercises: [
      { name: "Plank",               sets: [ { seconds: 35 }, { seconds: 35 }, { seconds: 35 } ] },
      { name: "Bench Press",         sets: [ { reps: 8, weight: 72.5 }, { reps: 8, weight: 72.5 }, { reps: 8, weight: 72.5 }, { reps: 8, weight: 72.5 } ] },
      { name: "Incline Bench Press", sets: [ { reps: 7, weight: 72.5 }, { reps: 7, weight: 72.5 }, { reps: 7, weight: 72.5 }, { reps: 7, weight: 72.5 } ] },
      { name: "Incline Pec Fly",     sets: [ { reps: 9, weight: 36 }, { reps: 9, weight: 36 }, { reps: 9, weight: 36 }, { reps: 9, weight: 36 } ] },
    ],
  },

  // 1 Aug — Back + Arms (09:00)
  {
    datetime: "2026-08-01T09:00", note: "Back + Arms",
    exercises: [
      { name: "Dumbbell Pullover",      sets: [ { reps: 10, weight: 18 }, { reps: 10, weight: 18 }, { reps: 10, weight: 18 }, { reps: 10, weight: 18 } ] },
      { name: "Reverse Incline DB Row", sets: [ { reps: 8, weight: 52 }, { reps: 8, weight: 52 }, { reps: 8, weight: 52 }, { reps: 8, weight: 52 } ] },
      { name: "Incline DB Curl",        sets: [ { reps: 6, weight: 18 }, { reps: 6, weight: 18 }, { reps: 6, weight: 18 }, { reps: 6, weight: 18 } ] },
      { name: "Incline Hammer Curl",    sets: [ { reps: 8, weight: 18 }, { reps: 8, weight: 18 }, { reps: 8, weight: 18 }, { reps: 8, weight: 18 } ] },
      { name: "Half Curl",              sets: [ { reps: 5, weight: 36 }, { reps: 5, weight: 36 }, { reps: 5, weight: 36 }, { reps: 5, weight: 36 } ] },
      { name: "Dead Hang",              sets: [ { seconds: 25 }, { seconds: 25 }, { seconds: 25 } ] },
    ],
  },

  // 29 Jul — Full Body (Deload) (06:10, one lift per section at ~87% of best, following the deload recommendation)
  {
    datetime: "2026-07-29T06:10", note: "Full Body (Deload)",
    exercises: [
      { name: "Pec Fly Machine",           sets: [ { reps: 6, weight: 73 }, { reps: 6, weight: 73 }, { reps: 6, weight: 73 } ] },
      { name: "Diverging Seated Row",      sets: [ { reps: 6, weight: 84 }, { reps: 6, weight: 84 }, { reps: 6, weight: 84 }, { reps: 6, weight: 84 } ] },
      { name: "Converging Shoulder Press", sets: [ { reps: 6, weight: 68 }, { reps: 6, weight: 68 }, { reps: 6, weight: 68 }, { reps: 6, weight: 68 } ] },
      { name: "Angled Leg Press",          sets: [ { reps: 5, weight: 172 }, { reps: 5, weight: 172 }, { reps: 5, weight: 172 }, { reps: 5, weight: 172 } ] },
      { name: "Rope Cable Extension",      sets: [ { reps: 6, weight: 64 }, { reps: 6, weight: 64 }, { reps: 6, weight: 64 }, { reps: 6, weight: 64 } ] },
    ],
  },

  // 27 Jul — Chest (20:20, followed the report's recommended Chest day)
  {
    datetime: "2026-07-27T20:20", note: "Chest",
    exercises: [
      { name: "Bench Press",         sets: [ { reps: 7, weight: 72.5 }, { reps: 7, weight: 72.5 }, { reps: 7, weight: 72.5 }, { reps: 7, weight: 72.5 } ] },
      { name: "Incline Bench Press", sets: [ { reps: 6, weight: 72.5 }, { reps: 6, weight: 72.5 }, { reps: 6, weight: 72.5 }, { reps: 6, weight: 72.5 } ] },
      { name: "Decline Bench Press", sets: [ { reps: 6, weight: 72.5 }, { reps: 6, weight: 72.5 }, { reps: 6, weight: 72.5 }, { reps: 6, weight: 72.5 } ] },
      { name: "VKR",                 sets: [ { reps: 10 }, { reps: 10 }, { reps: 10 }, { reps: 10 } ] },
      { name: "VKR to Sides",        sets: [ { reps: 8 }, { reps: 8 }, { reps: 8 }, { reps: 8 } ] },
    ],
  },

  // 25 Jul — Legs (10:20, followed the report's recommended Legs day)
  {
    datetime: "2026-07-25T10:20", note: "Legs",
    exercises: [
      { name: "Calf Raises Machine",   sets: [ { reps: 11, weight: 76 }, { reps: 11, weight: 76 }, { reps: 11, weight: 76 }, { reps: 11, weight: 76 } ] },
      { name: "Leg Press",             sets: [ { reps: 10, weight: 132 }, { reps: 10, weight: 132 }, { reps: 10, weight: 132 }, { reps: 10, weight: 132 } ] },
      { name: "Angled Leg Press",      sets: [ { reps: 7, weight: 202 }, { reps: 7, weight: 202 }, { reps: 7, weight: 202 }, { reps: 7, weight: 202 } ] },
      { name: "Single-Leg Extensions", sets: [ { reps: 6, weight: 57 }, { reps: 6, weight: 57 }, { reps: 6, weight: 57 }, { reps: 6, weight: 57 } ] },
      { name: "Outer Thigh",           sets: [ { reps: 10, weight: 79 }, { reps: 10, weight: 79 }, { reps: 10, weight: 79 }, { reps: 10, weight: 79 } ] },
      { name: "Inner Thigh",           sets: [ { reps: 8, weight: 79 }, { reps: 8, weight: 79 }, { reps: 8, weight: 79 } ] },
    ],
  },

  // 24 Jul — Shoulders (10:20, followed the report's recommended Shoulders day)
  {
    datetime: "2026-07-24T10:20", note: "Shoulders",
    exercises: [
      { name: "Front Raises",           sets: [ { reps: 8, weight: 18 }, { reps: 8, weight: 18 }, { reps: 8, weight: 18 }, { reps: 8, weight: 18 } ] },
      { name: "Dumbbell Shoulder Press", sets: [ { reps: 9, weight: 36 }, { reps: 9, weight: 36 }, { reps: 9, weight: 36 }, { reps: 9, weight: 36 } ] },
      { name: "Shoulder Shrugs",        sets: [ { reps: 11, weight: 48 }, { reps: 11, weight: 48 }, { reps: 11, weight: 48 }, { reps: 11, weight: 48 } ] },
      { name: "Lateral Raises",         sets: [ { reps: 8, weight: 32 }, { reps: 8, weight: 32 }, { reps: 8, weight: 32 }, { reps: 8, weight: 32 } ] },
      { name: "Rear Delt Machine",      sets: [ { reps: 9, weight: 73 }, { reps: 9, weight: 73 }, { reps: 9, weight: 73 } ] },
      { name: "VKR",                    sets: [ { reps: 8 }, { reps: 8 }, { reps: 8 }, { reps: 8 } ] },
      { name: "VKR to Sides",           sets: [ { reps: 8 }, { reps: 8 }, { reps: 8 }, { reps: 8 } ] },
    ],
  },

  // 21 Jul — Back (15:30, followed the report's recommended Back day)
  {
    datetime: "2026-07-21T15:30", note: "Back",
    exercises: [
      { name: "Diverging Seated Row",   sets: [ { reps: 8, weight: 97 }, { reps: 8, weight: 97 }, { reps: 8, weight: 97 }, { reps: 8, weight: 97 } ] },
      { name: "Low Row",                sets: [ { reps: 8, weight: 79 }, { reps: 8, weight: 79 }, { reps: 8, weight: 79 }, { reps: 8, weight: 79 } ] },
      { name: "Reverse Incline DB Row", sets: [ { reps: 10, weight: 48 }, { reps: 10, weight: 48 }, { reps: 10, weight: 48 }, { reps: 10, weight: 48 } ] },
      { name: "Dumbbell Pullover",      sets: [ { reps: 10, weight: 18 }, { reps: 10, weight: 18 }, { reps: 10, weight: 18 }, { reps: 10, weight: 18 } ] },
      { name: "Dead Hang",              sets: [ { seconds: 20 }, { seconds: 20 }, { seconds: 20 } ] },
    ],
  },

  // 19 Jul — Outdoor Run (clock time not given)
  {
    datetime: "2026-07-19T12:00", timeUnknown: true, note: "Outdoor Run",
    exercises: [
      { name: "Outdoor Run", distanceKm: 3.7, durationMin: 25 },
    ],
  },

  // 18 Jul — Arms (18:20, followed the report's recommended Arms day)
  {
    datetime: "2026-07-18T18:20", note: "Arms",
    exercises: [
      { name: "Incline Hammer Curl", sets: [ { reps: 8, weight: 18 }, { reps: 8, weight: 18 }, { reps: 8, weight: 18 }, { reps: 8, weight: 18 } ] },
      { name: "Incline DB Curl",     sets: [ { reps: 5, weight: 18 }, { reps: 5, weight: 18 }, { reps: 5, weight: 18 }, { reps: 5, weight: 18 } ] },
      { name: "Half Curl",           sets: [ { reps: 6, weight: 32 }, { reps: 6, weight: 32 }, { reps: 6, weight: 32 }, { reps: 6, weight: 32 } ] },
      { name: "Forearm Twists",      sets: [ { reps: 10, weight: 24 }, { reps: 10, weight: 24 }, { reps: 10, weight: 24 }, { reps: 10, weight: 24 } ] },
      { name: "Dead Hang",           sets: [ { seconds: 20 }, { seconds: 20 }, { seconds: 20 } ] },
      { name: "Biceps Curl Machine", sets: [ { reps: 6, weight: 45 }, { reps: 6, weight: 45 } ] },
      { name: "Plank",               sets: [ { seconds: 45 } ] },
    ],
  },

  // 15 Jul — Chest (07:35)
  {
    datetime: "2026-07-15T07:35", note: "Chest",
    exercises: [
      { name: "Chest Press Machine", sets: [ { reps: 4, weight: 73 }, { reps: 4, weight: 73 }, { reps: 4, weight: 73 }, { reps: 4, weight: 73 } ] },
      { name: "Bench Press",         sets: [ { reps: 6, weight: 72.5 }, { reps: 6, weight: 72.5 }, { reps: 6, weight: 72.5 }, { reps: 6, weight: 72.5 } ] },
      { name: "Incline Bench Press", sets: [ { reps: 5, weight: 72.5 }, { reps: 5, weight: 72.5 }, { reps: 5, weight: 72.5 }, { reps: 5, weight: 72.5 } ] },
      { name: "Incline Pec Fly",     sets: [ { reps: 8, weight: 36 }, { reps: 8, weight: 36 }, { reps: 8, weight: 36 }, { reps: 8, weight: 36 } ] },
    ],
  },

  // 13 Jul — Stretching / rehab session + planks (21:05)
  {
    datetime: "2026-07-13T21:05", note: "Stretching / rehab + planks",
    exercises: [
      { name: "Stretching / Mobility (rehab)", sets: [ { seconds: 1200 } ] },
      { name: "Plank", sets: [ { seconds: 30 }, { seconds: 30 }, { seconds: 30 } ] },
    ],
  },

  // 11 Jul — Legs (followed the report's recommended Legs day)
  {
    datetime: "2026-07-11T21:00", note: "Legs",
    exercises: [
      { name: "Calf Raises Machine", sets: [ { reps: 10, weight: 77 }, { reps: 10, weight: 77 }, { reps: 10, weight: 77 }, { reps: 10, weight: 77 } ] },
      { name: "Angled Leg Press",    sets: [ { reps: 6, weight: 202 }, { reps: 6, weight: 202 }, { reps: 6, weight: 202 }, { reps: 6, weight: 202 } ] },
      { name: "Leg Extensions",      sets: [ { reps: 12, weight: 111 }, { reps: 12, weight: 111 }, { reps: 12, weight: 111 }, { reps: 12, weight: 111 } ] },
      { name: "Outer Thigh",         sets: [ { reps: 8, weight: 79 }, { reps: 8, weight: 79 }, { reps: 8, weight: 79 }, { reps: 8, weight: 79 } ] },
      { name: "Inner Thigh",         sets: [ { reps: 10, weight: 75 }, { reps: 10, weight: 75 }, { reps: 10, weight: 75 } ] },
      { name: "Leg Press",           sets: [ { reps: 8, weight: 132 }, { reps: 8, weight: 132 }, { reps: 8, weight: 132 }, { reps: 8, weight: 132 } ] },
    ],
  },

  // 9 Jul — Morning run along the Thames (Nike Run Club, ~159 kcal per app)
  {
    datetime: "2026-07-09T06:45", note: "Morning run — Thames path, positive split, 22°C, ~159 kcal (Nike Run Club)",
    exercises: [
      { name: "Outdoor Run", distanceKm: 2.01, durationMin: 11.6, cadence: 162 },
    ],
  },

  // 6 Jul — Push + arms at a travel gym (machines comparable to home per user;
  // logged as regular lifts, SNAPSHOT PRs updated: chest press & incline press PRs)
  {
    datetime: "2026-07-06T17:00", note: "Push + arms (travel gym)",
    exercises: [
      { name: "Chest Press Machine",       sets: [ { reps: 6, weight: 73 }, { reps: 6, weight: 73 }, { reps: 6, weight: 73 }, { reps: 6, weight: 73 } ] },
      { name: "Incline Bench Press",        sets: [ { reps: 6, weight: 73 }, { reps: 6, weight: 73 }, { reps: 6, weight: 73 }, { reps: 6, weight: 73 } ] },
      { name: "Converging Shoulder Press",  sets: [ { reps: 6, weight: 82 }, { reps: 6, weight: 82 }, { reps: 6, weight: 82 }, { reps: 6, weight: 82 } ] },
      { name: "Incline Hammer Curl",        sets: [ { reps: 8, weight: 16 }, { reps: 8, weight: 16 }, { reps: 8, weight: 16 }, { reps: 8, weight: 16 } ] },
      { name: "Incline DB Curl",            sets: [ { reps: 6, weight: 16 }, { reps: 6, weight: 16 }, { reps: 6, weight: 16 }, { reps: 6, weight: 16 } ] },
    ],
  },

  // 5 Jul — Full-day walking, London (Samsung Health: 17,133 steps / 13.35 km)
  {
    datetime: "2026-07-05T12:00", timeUnknown: true, note: "Full-day walking — London",
    exercises: [
      { name: "Outdoor Walk", distanceKm: 13.35, durationMin: 174, rpe: 3 },
    ],
  },

  // 4 Jul — Long city walk, London (full-day event; steps via Samsung Health)
  {
    datetime: "2026-07-04T12:00", timeUnknown: true, note: "Long city walk — London (full-day)",
    exercises: [
      { name: "Outdoor Walk", distanceKm: 10.43, durationMin: 130, rpe: 3 },
    ],
  },

  // 3 Jul — Full-day city walking on a travel/red-eye day (~16K steps)
  {
    datetime: "2026-07-03T12:00", timeUnknown: true, note: "Full-day city walking (travel day)",
    exercises: [
      { name: "Outdoor Walk", distanceKm: 11.5, durationMin: 150, rpe: 3 },
    ],
  },

  // 30 Jun — Shoulders + Chest, light / high-rep (15:00)
  {
    datetime: "2026-06-30T15:00", note: "Shoulders + Chest (light/high-rep)",
    exercises: [
      { name: "Dumbbell Shoulder Press", sets: [ { reps: 12, weight: 28 }, { reps: 12, weight: 28 }, { reps: 12, weight: 28 }, { reps: 12, weight: 28 } ] },
      { name: "Seated Lateral Raises",   sets: [ { reps: 7, weight: 28 }, { reps: 7, weight: 28 }, { reps: 7, weight: 28 }, { reps: 7, weight: 28 } ] },
      { name: "Front Raises",            sets: [ { reps: 10, weight: 16 }, { reps: 10, weight: 16 }, { reps: 10, weight: 16 } ] },
      { name: "Incline Pec Fly",         sets: [ { reps: 12, weight: 28 }, { reps: 12, weight: 28 }, { reps: 12, weight: 28 }, { reps: 12, weight: 28 } ] },
      { name: "Dumbbell Bench Press",    sets: [ { reps: 15, weight: 28 }, { reps: 15, weight: 28 }, { reps: 15, weight: 28 }, { reps: 15, weight: 28 } ] },
    ],
  },

  // 27 Jun — Back / pull session (18:10)
  {
    datetime: "2026-06-27T18:10", note: "Back (pull)",
    exercises: [
      { name: "Diverging Seated Row",   sets: [ { reps: 6, weight: 109 }, { reps: 6, weight: 109 }, { reps: 6, weight: 109 }, { reps: 6, weight: 109 } ] },
      { name: "Low Row",                sets: [ { reps: 6, weight: 79 }, { reps: 6, weight: 79 }, { reps: 6, weight: 79 }, { reps: 6, weight: 79 } ] },
      { name: "Reverse Incline DB Row", sets: [ { reps: 9, weight: 52 }, { reps: 9, weight: 52 }, { reps: 9, weight: 52 }, { reps: 9, weight: 52 } ] },
      { name: "Dumbbell Pullover",      sets: [ { reps: 10, weight: 18 }, { reps: 10, weight: 18 }, { reps: 10, weight: 18 }, { reps: 10, weight: 18 } ] },
      { name: "Dead Hang",              sets: [ { seconds: 30 } ] },
    ],
  },

  // 27 Jun — Beach walk, alternating sand (08:15). 60 min; soft sand raises
  // effort -> rpe 6. Distance ~4.3 km estimated (no GPS).
  {
    datetime: "2026-06-27T08:15", note: "Beach walk — alternating sand",
    exercises: [
      { name: "Outdoor Walk", distanceKm: 4.3, durationMin: 60, rpe: 6 },
    ],
  },

  // 26 Jun — Flat road/sidewalk walk (clock-time approximate). 50 min, ~4.5 km,
  // easy effort -> rpe 3.
  {
    datetime: "2026-06-26T17:00", note: "Flat walk (road/sidewalk)",
    exercises: [
      { name: "Outdoor Walk", distanceKm: 4.5, durationMin: 50, rpe: 3 },
    ],
  },

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

  // Cardio log (dates are day.month 2026; clock-times are placeholders — timeUnknown
  // excludes these from the time-of-day / typical-time stat, dates still count elsewhere)
  { datetime: "2026-05-08T18:00", timeUnknown: true, exercises: [ { name: "Outdoor Run",        distanceKm: 2.00, durationMin: 13.2, avgHr: 148 } ] },
  { datetime: "2026-05-01T19:00", timeUnknown: true, exercises: [ { name: "Stationary Bike",    durationMin: 70, rpe: 5 } ] },
  { datetime: "2026-04-21T18:00", timeUnknown: true, exercises: [ { name: "Outdoor Run",        distanceKm: 2.50, durationMin: 16.4, avgHr: 145 } ] },
  { datetime: "2026-04-05T08:00", timeUnknown: true, exercises: [ { name: "Incline Walk",       distanceKm: 2.98, durationMin: 35.1, avgHr: 117 } ] },
  { datetime: "2026-04-02T08:00", timeUnknown: true, exercises: [ { name: "Incline Walk",       distanceKm: 3.84, durationMin: 42.0, avgHr: 115 } ] },
  { datetime: "2026-03-30T08:00", timeUnknown: true, exercises: [ { name: "Incline Walk",       distanceKm: 3.38, durationMin: 39.4, rpe: 4 } ] },
  { datetime: "2026-03-23T18:00", timeUnknown: true, exercises: [ { name: "Outdoor Run",        distanceKm: 2.00, durationMin: 12.5, avgHr: 147 } ] },
  { datetime: "2026-03-16T18:00", timeUnknown: true, exercises: [ { name: "Outdoor Run",        distanceKm: 2.50, durationMin: 16.1, avgHr: 147 } ] },
  { datetime: "2026-03-11T18:00", timeUnknown: true, exercises: [ { name: "Outdoor Run",        distanceKm: 2.51, durationMin: 14.7, avgHr: 154 } ] },
  { datetime: "2026-03-02T18:00", timeUnknown: true, exercises: [ { name: "Rehabilitation Run", distanceKm: 3.00, durationMin: 22.1, avgHr: 145 } ] },
  { datetime: "2026-02-27T09:00", timeUnknown: true, exercises: [ { name: "Long Run",           distanceKm: 10.00, durationMin: 66.25, avgHr: 156 } ] },
];

/* Expose for the engine. */
if (typeof window !== "undefined") {
  window.GYM_DATA = { ATHLETE, MUSCLES, SECTION_ORDER, EXERCISE_LIBRARY, SNAPSHOT, WORKOUTS, BODYWEIGHT, SLEEP };
}
