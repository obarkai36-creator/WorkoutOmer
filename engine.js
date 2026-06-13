/* =============================================================================
 * engine.js — the "personal trainer" brain.
 * -----------------------------------------------------------------------------
 * Pure functions that turn the raw WORKOUTS data into:
 *   - per-muscle fatigue (%)            -> Muscle Fatigue panel
 *   - workload progress per exercise    -> Workload Progress panel
 *   - next recommended session + rest   -> Next Session panel
 *   - injury / overtraining alerts      -> Alerts panel
 *   - suggested programming changes     -> Changes panel
 *   - workout timing stats              -> Timing panel
 *
 * No external dependencies. Reads window.GYM_DATA (from data.js).
 * ========================================================================== */

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

/* Fatigue is "ready to train again" when it drops below this %. */
const READY_THRESHOLD = 30;
/* Training a muscle while still above this % counts as too-soon / under-recovered. */
const UNDERRECOVERED_THRESHOLD = 60;

/* ---- small helpers -------------------------------------------------------- */
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round = (v, d = 0) => { const p = 10 ** d; return Math.round(v * p) / p; };
const sum = (arr) => arr.reduce((a, b) => a + b, 0);

/* Estimate RPE (1-10) from average heart rate as a fraction of max HR. */
function rpeFromHr(avgHr, age = 30) {
  const maxHr = 220 - age;
  const frac = clamp(avgHr / maxHr, 0.4, 1);
  return clamp(round((frac - 0.4) / 0.6 * 10, 1), 1, 10);
}

/* Epley estimated 1-rep-max from a working set. */
function est1RM(weight, reps) {
  if (weight <= 0) return 0;
  return weight * (1 + reps / 30);
}

/* ---- normalization -------------------------------------------------------- */
/* Compute the training load each exercise produced, and split it onto muscles. */
function computeExerciseLoad(ex, lib, athlete) {
  const def = lib[ex.name];
  if (!def) {
    console.warn(`Unknown exercise "${ex.name}" — add it to EXERCISE_LIBRARY.`);
    return { load: 0, top1RM: 0, topWeight: 0, muscles: {} };
  }

  let load = 0;
  let top1RM = 0;
  let topWeight = 0;

  if (def.kind === "aerobic") {
    const rpe = ex.rpe != null ? ex.rpe : (ex.avgHr ? rpeFromHr(ex.avgHr) : 6);
    // Aerobic load = minutes weighted by effort. Scaled so a solid 40-min
    // tempo run lands in the same ballpark as a hard lifting session's
    // contribution to its primary muscle (see normalization note below).
    load = (ex.durationMin || 0) * rpe * 1.5;
  } else {
    const base = def.bodyweight ? (athlete.bodyweightKg || 75) : 0;
    for (const s of ex.sets || []) {
      const w = (s.weight != null ? s.weight : 0) + (def.bodyweight ? base : 0) + (s.added || 0);
      const reps = s.reps || 0;
      load += w * reps; // volume load (kg·reps)
      const orm = est1RM(w, reps);
      if (orm > top1RM) top1RM = orm;
      if (w > topWeight) topWeight = w;
    }
  }

  const muscles = {};
  for (const [m, share] of Object.entries(def.muscles)) {
    muscles[m] = load * share;
  }
  return { load, top1RM, topWeight, muscles, kind: def.kind };
}

/* Turn raw workouts into a normalized, time-sorted (newest first) structure. */
function normalize(data) {
  const { ATHLETE, EXERCISE_LIBRARY } = data;
  const workouts = data.WORKOUTS.map((w) => {
    const t = new Date(w.datetime).getTime();
    const exercises = (w.exercises || []).map((ex) => {
      const c = computeExerciseLoad(ex, EXERCISE_LIBRARY, ATHLETE);
      return { ...ex, ...c };
    });
    // Sum muscle loads for the whole session.
    const muscleLoad = {};
    for (const ex of exercises) {
      for (const [m, v] of Object.entries(ex.muscles)) {
        muscleLoad[m] = (muscleLoad[m] || 0) + v;
      }
    }
    const isAerobic = exercises.some((e) => e.kind === "aerobic");
    return { ...w, t, exercises, muscleLoad, isAerobic };
  });
  workouts.sort((a, b) => b.t - a.t); // newest first
  return workouts;
}

/* Per-muscle reference load = the muscle's heaviest single session in history.
 * Used to express both fatigue and per-session stress on a comparable 0-100 scale. */
function referenceLoads(workouts, muscles) {
  const ref = {};
  for (const m of Object.keys(muscles)) ref[m] = 0;
  for (const w of workouts) {
    for (const [m, v] of Object.entries(w.muscleLoad)) {
      if (v > (ref[m] || 0)) ref[m] = v;
    }
  }
  // Avoid divide-by-zero for muscles never trained.
  for (const m of Object.keys(ref)) if (!ref[m]) ref[m] = 1;
  return ref;
}

/* ---- fatigue -------------------------------------------------------------- */
/* Exponential recovery. `recoveryHours` is defined as the time for a maximal
 * session to decay down to READY_THRESHOLD (i.e. "ready to train hard again"),
 * so tau = recoveryHours / ln(100 / READY_THRESHOLD). */
const TAU_FACTOR = Math.log(100 / READY_THRESHOLD);
function muscleFatigue(workouts, muscles, ref, now) {
  const decayed = {};
  for (const m of Object.keys(muscles)) decayed[m] = 0;

  for (const w of workouts) {
    const hours = (now - w.t) / HOUR;
    if (hours < 0) continue;
    for (const [m, load] of Object.entries(w.muscleLoad)) {
      const tau = muscles[m].recoveryHours / TAU_FACTOR;
      decayed[m] += load * Math.exp(-hours / tau);
    }
  }

  const result = {};
  for (const m of Object.keys(muscles)) {
    const pct = clamp((decayed[m] / ref[m]) * 100, 0, 100);
    // Hours until this muscle decays below READY_THRESHOLD of its reference.
    const tau = muscles[m].recoveryHours / TAU_FACTOR;
    const target = ref[m] * (READY_THRESHOLD / 100);
    let readyInH = 0;
    if (decayed[m] > target) readyInH = tau * Math.log(decayed[m] / target);
    result[m] = {
      label: muscles[m].label,
      section: muscles[m].section,
      pct: round(pct),
      readyInHours: round(readyInH, 1),
      ready: pct < READY_THRESHOLD,
    };
  }
  return result;
}

/* Aggregate muscle fatigue up to body sections. */
function sectionFatigue(fatigue) {
  const groups = {};
  for (const f of Object.values(fatigue)) {
    (groups[f.section] = groups[f.section] || []).push(f);
  }
  const out = {};
  for (const [section, items] of Object.entries(groups)) {
    out[section] = {
      section,
      pct: round(sum(items.map((i) => i.pct)) / items.length),
      readyInHours: round(Math.max(...items.map((i) => i.readyInHours)), 1),
      muscles: items.sort((a, b) => b.pct - a.pct),
    };
  }
  return out;
}

/* ---- workload progress (latest workout) ----------------------------------- */
function workloadProgress(workouts) {
  if (!workouts.length) return { latest: null, items: [] };
  const latest = workouts[0];
  const history = workouts.slice(1);

  const items = latest.exercises.map((ex) => {
    // Best volume / best estimated 1RM for this exercise across all prior history.
    let bestVol = ex.load, bestORM = ex.top1RM, prevVol = null, prevORM = null;
    for (const w of history) {
      const match = w.exercises.find((e) => e.name === ex.name);
      if (!match) continue;
      if (prevVol == null) { prevVol = match.load; prevORM = match.top1RM; }
      if (match.load > bestVol) bestVol = match.load;
      if (match.top1RM > bestORM) bestORM = match.top1RM;
    }
    const volVsBest = bestVol > 0 ? round((ex.load / bestVol) * 100) : 100;
    const volVsPrev = prevVol ? round(((ex.load - prevVol) / prevVol) * 100, 1) : null;
    const ormVsPrev = prevORM ? round(((ex.top1RM - prevORM) / prevORM) * 100, 1) : null;
    return {
      name: ex.name,
      kind: ex.kind,
      volume: round(ex.load),
      bestVolume: round(bestVol),
      volVsBest,
      volVsPrev,
      est1RM: round(ex.top1RM, 1),
      ormVsPrev,
      isPR: ex.load >= bestVol && history.some((w) => w.exercises.some((e) => e.name === ex.name)),
      topWeight: ex.topWeight,
    };
  });
  return { latest, items };
}

/* ---- weekly load + acute:chronic workload ratio (ACWR) -------------------- */
/* Session "stress" = sum over muscles of (sessionMuscleLoad / refMuscle) * 100,
 * so strength and aerobic sessions land on one comparable scale. */
function sessionStress(w, ref) {
  return sum(Object.entries(w.muscleLoad).map(([m, v]) => (v / ref[m]) * 100));
}

function loadTrends(workouts, ref, now) {
  // Weekly buckets for the last 6 weeks (oldest -> newest).
  const weeks = [];
  for (let i = 5; i >= 0; i--) {
    const end = now - i * 7 * DAY;
    const start = end - 7 * DAY;
    const inWeek = workouts.filter((w) => w.t > start && w.t <= end);
    weeks.push({
      label: i === 0 ? "This wk" : `-${i}wk`,
      stress: round(sum(inWeek.map((w) => sessionStress(w, ref)))),
      sessions: inWeek.length,
    });
  }

  const acute = sum(
    workouts.filter((w) => now - w.t <= 7 * DAY).map((w) => sessionStress(w, ref))
  );
  const last28 = workouts.filter((w) => now - w.t <= 28 * DAY).map((w) => sessionStress(w, ref));
  const chronic = last28.length ? sum(last28) / 4 : 0; // avg weekly load over 4 wks
  const acwr = chronic > 0 ? round(acute / chronic, 2) : null;

  let acwrZone = "ok";
  if (acwr != null) {
    if (acwr > 1.5) acwrZone = "danger";
    else if (acwr > 1.3) acwrZone = "caution";
    else if (acwr < 0.8) acwrZone = "detraining";
  }
  return { weeks, acute: round(acute), chronic: round(chronic), acwr, acwrZone };
}

/* ---- next recommended session --------------------------------------------- */
function recommendSession(workouts, sectionFat, now) {
  const trainable = ["Push", "Pull", "Legs"].filter((s) => sectionFat[s]);
  if (!trainable.length) return null;

  // Last time each section was trained (as primary focus).
  const lastTrained = {};
  for (const w of workouts) {
    for (const s of trainable) {
      if (lastTrained[s] != null) continue;
      const sectionLoad = sum(
        Object.entries(w.muscleLoad)
          .filter(([m]) => GYM.MUSCLES[m].section === s)
          .map(([, v]) => v)
      );
      const total = sum(Object.values(w.muscleLoad)) || 1;
      if (sectionLoad / total > 0.4) lastTrained[s] = w.t;
    }
  }

  // Score: prefer the most-recovered section that's been waiting longest.
  const ranked = trainable
    .map((s) => {
      const f = sectionFat[s];
      const daysSince = lastTrained[s] != null ? (now - lastTrained[s]) / DAY : 99;
      return { section: s, fatigue: f.pct, readyInHours: f.readyInHours, daysSince: round(daysSince, 1) };
    })
    .sort((a, b) => a.readyInHours - b.readyInHours || b.daysSince - a.daysSince || a.fatigue - b.fatigue);

  const pick = ranked[0];
  const restHours = pick.readyInHours;
  const readyAt = new Date(now + restHours * HOUR);

  // Suggest concrete exercises: pull the most recent session that targeted this section.
  const template = workouts.find((w) => {
    const sectionLoad = sum(
      Object.entries(w.muscleLoad)
        .filter(([m]) => GYM.MUSCLES[m].section === pick.section)
        .map(([, v]) => v)
    );
    const total = sum(Object.values(w.muscleLoad)) || 1;
    return sectionLoad / total > 0.4;
  });
  const suggestedExercises = template ? template.exercises.map((e) => e.name) : [];

  // Should you also fit in aerobic? (based on weekly target vs last 7 days)
  const aerobicLast7 = workouts.filter(
    (w) => now - w.t <= 7 * DAY && w.isAerobic
  ).length;

  return {
    section: pick.section,
    fatigue: pick.fatigue,
    restHours: round(restHours, 1),
    readyNow: restHours < 1,
    readyAt,
    daysSince: pick.daysSince,
    suggestedExercises,
    ranked,
    aerobicLast7,
    aerobicTarget: GYM.ATHLETE.weeklyTarget.aerobicSessions,
  };
}

/* ---- injury / overtraining alerts ----------------------------------------- */
function injuryAlerts(workouts, fatigue, trends, progress, now) {
  const alerts = [];

  // 1) Acute:chronic workload ratio
  if (trends.acwr != null) {
    if (trends.acwrZone === "danger")
      alerts.push({ level: "high", title: "Training load spike", detail: `Acute:chronic workload ratio is ${trends.acwr} (>1.5). Sharp load jumps are the classic soft-tissue injury setup. Hold volume flat or deload this week.` });
    else if (trends.acwrZone === "caution")
      alerts.push({ level: "med", title: "Load climbing fast", detail: `ACWR is ${trends.acwr} (sweet spot 0.8–1.3). You're ramping quickly — keep added volume under ~10% next week.` });
    else if (trends.acwrZone === "detraining")
      alerts.push({ level: "low", title: "Load dropped off", detail: `ACWR is ${trends.acwr} (<0.8). Fitness may be slipping — a normal training week will bring this back.` });
  }

  // 2) Under-recovered muscles trained back-to-back
  const tooSoon = [];
  for (let i = 0; i < workouts.length - 1; i++) {
    const w = workouts[i];
    for (const m of Object.keys(w.muscleLoad)) {
      const prev = workouts.slice(i + 1).find((p) => p.muscleLoad[m] > 0);
      if (!prev) continue;
      const gapH = (w.t - prev.t) / HOUR;
      if (gapH < GYM.MUSCLES[m].recoveryHours * 0.6 && w.muscleLoad[m] > 0 && prev.muscleLoad[m] > 0) {
        tooSoon.push(`${GYM.MUSCLES[m].label} (${round(gapH)}h apart)`);
      }
    }
  }
  if (tooSoon.length) {
    const uniq = [...new Set(tooSoon)].slice(0, 4);
    alerts.push({ level: "med", title: "Muscles trained before recovery", detail: `Recently hit again under-recovered: ${uniq.join(", ")}. Space these ~48–72h apart or keep the second session light.` });
  }

  // 3) Rapid single-lift jumps in the latest session
  for (const it of progress.items) {
    if (it.ormVsPrev != null && it.ormVsPrev > 12)
      alerts.push({ level: "med", title: `Big jump on ${it.name}`, detail: `Estimated 1RM up ${it.ormVsPrev}% vs last time. Increases over ~10% per session raise strain/joint risk — smaller steps stick better.` });
  }

  // 4) Currently very fatigued sections
  for (const f of Object.values(fatigue)) {
    if (f.pct >= 85)
      alerts.push({ level: "low", title: `${f.label} heavily fatigued`, detail: `${f.label} is at ${f.pct}% — fully recovered in ~${f.readyInHours}h. Avoid loading it hard before then.` });
  }

  // 5) Push/Pull imbalance over last 28 days
  const bal = balance(workouts, now);
  if (bal.pushPull > 1.4)
    alerts.push({ level: "med", title: "Push outpacing pull", detail: `Push volume is ${bal.pushPull}× pull over 28 days. A push-dominant ratio pulls the shoulders forward and stresses the rotator cuff — add rows/face pulls.` });
  else if (bal.pushPull < 0.7)
    alerts.push({ level: "low", title: "Pull outpacing push", detail: `Pull volume is ${round(1 / bal.pushPull, 2)}× push over 28 days. Balance it out with more pressing.` });

  if (!alerts.length)
    alerts.push({ level: "ok", title: "No red flags", detail: "Load, recovery and balance all look healthy. Keep progressing gradually." });

  const order = { high: 0, med: 1, low: 2, ok: 3 };
  alerts.sort((a, b) => order[a.level] - order[b.level]);
  return alerts;
}

/* ---- balance helpers ------------------------------------------------------ */
function balance(workouts, now) {
  const recent = workouts.filter((w) => now - w.t <= 28 * DAY);
  const bySection = {};
  for (const w of recent) {
    for (const [m, v] of Object.entries(w.muscleLoad)) {
      const sec = GYM.MUSCLES[m].section;
      bySection[sec] = (bySection[sec] || 0) + v;
    }
  }
  const push = bySection.Push || 0;
  const pull = bySection.Pull || 0;
  // quad vs hamstring volume
  let quad = 0, ham = 0;
  for (const w of recent) { quad += w.muscleLoad.quads || 0; ham += w.muscleLoad.hamstrings || 0; }
  return {
    bySection,
    pushPull: pull > 0 ? round(push / pull, 2) : null,
    quadHam: ham > 0 ? round(quad / ham, 2) : null,
  };
}

/* ---- suggested changes ---------------------------------------------------- */
function suggestedChanges(workouts, fatigue, trends, progress, now) {
  const changes = [];
  const bal = balance(workouts, now);

  // Balance-driven
  if (bal.pushPull != null && bal.pushPull > 1.3)
    changes.push(`Add a pulling exercise (rows / face pulls) — push is ${bal.pushPull}× your pull volume. Aim for roughly 1:1.`);
  if (bal.quadHam != null && bal.quadHam > 3)
    changes.push(`Hamstrings are under-trained (quads ${bal.quadHam}× hamstrings). Add Romanian deadlifts or leg curls to protect the knees.`);

  // Stagnation: lifts in the latest session not improving vs previous
  const stagnant = progress.items.filter((i) => i.ormVsPrev != null && i.ormVsPrev <= 0 && i.kind !== "aerobic");
  if (stagnant.length)
    changes.push(`Stalling on ${stagnant.map((s) => s.name).join(", ")}. Try a small deload then a fresh progression, or swap rep ranges.`);

  // Untrained / neglected muscles (28d)
  const trainedRecently = new Set();
  for (const w of workouts.filter((w) => now - w.t <= 14 * DAY))
    for (const m of Object.keys(w.muscleLoad)) trainedRecently.add(m);
  const neglected = Object.keys(GYM.MUSCLES).filter(
    (m) => m !== "cardio" && !trainedRecently.has(m)
  );
  if (neglected.length)
    changes.push(`Not trained in 2 weeks: ${neglected.map((m) => GYM.MUSCLES[m].label).join(", ")}. Work them back into the rotation.`);

  // Aerobic dose
  const aerobic7 = workouts.filter((w) => now - w.t <= 7 * DAY && w.isAerobic).length;
  const aTarget = GYM.ATHLETE.weeklyTarget.aerobicSessions;
  if (aerobic7 < aTarget)
    changes.push(`Only ${aerobic7}/${aTarget} aerobic sessions this week. Add an easy zone-2 run or row — it speeds recovery between lifts.`);

  // Load management
  if (trends.acwrZone === "danger" || trends.acwrZone === "caution")
    changes.push(`Cap weekly volume growth at ~10%. Your load is climbing faster than your body adapts (ACWR ${trends.acwr}).`);
  if (trends.acwrZone === "detraining")
    changes.push(`You can safely add a little volume — recent load is below your 4-week baseline.`);

  if (!changes.length)
    changes.push("Programming looks balanced. Keep adding small increments and logging sessions.");

  return changes;
}

/* ---- workout timing ------------------------------------------------------- */
function timingStats(workouts, now) {
  if (!workouts.length) return null;
  const times = workouts.map((w) => w.t).sort((a, b) => a - b);

  // Gaps between consecutive sessions (days).
  const gaps = [];
  for (let i = 1; i < times.length; i++) gaps.push((times[i] - times[i - 1]) / DAY);
  const avgGap = gaps.length ? round(sum(gaps) / gaps.length, 1) : null;
  const longestGap = gaps.length ? round(Math.max(...gaps), 1) : null;

  // Sessions per week (last 28 days).
  const last28 = workouts.filter((w) => now - w.t <= 28 * DAY).length;
  const perWeek = round(last28 / 4, 1);

  // Time-of-day preference.
  const hours = workouts.map((w) => new Date(w.t).getHours());
  const avgHour = round(sum(hours) / hours.length);
  const morning = hours.filter((h) => h < 12).length;
  const evening = hours.length - morning;
  const todPref = morning >= evening ? "morning" : "evening";

  // Day-of-week distribution.
  const dow = [0, 0, 0, 0, 0, 0, 0];
  for (const w of workouts) dow[new Date(w.t).getDay()]++;

  // Days since last session.
  const daysSinceLast = round((now - times[times.length - 1]) / DAY, 1);

  return {
    avgGap, longestGap, perWeek,
    avgHour, todPref, morning, evening, dow,
    daysSinceLast,
    total: workouts.length,
  };
}

/* ---- top-level assembly --------------------------------------------------- */
let GYM; // shared reference to raw data for helpers above

function analyze(data, now = Date.now()) {
  GYM = data;
  const workouts = normalize(data);
  const ref = referenceLoads(workouts, data.MUSCLES);
  const fatigue = muscleFatigue(workouts, data.MUSCLES, ref, now);
  const sections = sectionFatigue(fatigue);
  const progress = workloadProgress(workouts);
  const trends = loadTrends(workouts, ref, now);
  const recommendation = recommendSession(workouts, sections, now);
  const alerts = injuryAlerts(workouts, fatigue, trends, progress, now);
  const changes = suggestedChanges(workouts, fatigue, trends, progress, now);
  const timing = timingStats(workouts, now);

  return { now, workouts, ref, fatigue, sections, progress, trends, recommendation, alerts, changes, timing };
}

if (typeof window !== "undefined") {
  window.GYM_ENGINE = { analyze, READY_THRESHOLD };
}
