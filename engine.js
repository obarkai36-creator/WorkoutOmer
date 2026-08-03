/* =============================================================================
 * engine.js — the "personal trainer" brain.
 * -----------------------------------------------------------------------------
 * Pure functions. Reads window.GYM_DATA (from data.js) and produces everything
 * the dashboard renders. Two data sources:
 *   - SNAPSHOT : latest-vs-best per exercise  -> Workload Progress, balance
 *   - WORKOUTS : dated sessions               -> fatigue, recovery, timing, ACWR
 * ========================================================================== */

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

const READY_THRESHOLD = 30;             // % below which a muscle is "ready"
const UNDERRECOVERED_THRESHOLD = 60;    // training above this % = too soon
const MIN_SESSIONS_FOR_ACWR = 6;        // need this many in 28d for a reliable ratio

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round = (v, d = 0) => { const p = 10 ** d; return Math.round(v * p) / p; };
const sum = (arr) => arr.reduce((a, b) => a + b, 0);

function rpeFromHr(avgHr, age = 30) {
  const maxHr = 220 - age;
  const frac = clamp(avgHr / maxHr, 0.4, 1);
  return clamp(round((frac - 0.4) / 0.6 * 10, 1), 1, 10);
}
function est1RM(weight, reps) {
  if (weight <= 0 || reps <= 0) return 0;
  return weight * (1 + reps / 30);
}

/* Volume / 1RM for a SNAPSHOT record: {sets,reps,weight} | {scheme:[...]} | iso */
function recStats(rec, iso) {
  if (!rec) return { volume: 0, top1RM: 0, topWeight: 0 };
  const parts = rec.scheme ? rec.scheme : [rec];
  let volume = 0, top1RM = 0, topWeight = 0;
  for (const p of parts) {
    const setsN = p.sets || 1;
    const w = p.weight || 0;
    if (iso || p.seconds) {
      volume += setsN * (p.seconds || 0) * w;   // load·seconds
    } else {
      volume += setsN * (p.reps || 0) * w;      // volume load
      const orm = est1RM(w, p.reps || 0);
      if (orm > top1RM) top1RM = orm;
    }
    if (w > topWeight) topWeight = w;
  }
  return { volume, top1RM, topWeight };
}

/* ---- normalize dated WORKOUTS --------------------------------------------- */
function computeSessionExercise(ex, lib, athlete) {
  const def = lib[ex.name];
  if (!def) { console.warn(`Unknown exercise "${ex.name}"`); return { load: 0, top1RM: 0, muscles: {}, kind: "strength" }; }

  let load = 0, top1RM = 0, topWeight = 0;
  if (def.kind === "aerobic") {
    const rpe = ex.rpe != null ? ex.rpe : (ex.avgHr ? rpeFromHr(ex.avgHr) : 6);
    load = (ex.durationMin || 0) * rpe * 1.5;
  } else {
    const base = def.bodyweight ? (athlete.bodyweightKg || 75) : 0;
    for (const s of ex.sets || []) {
      const w = (s.weight != null ? s.weight : 0) + base + (s.added || 0);
      if (def.iso || s.seconds) { load += w * (s.seconds || 0); }
      else {
        load += w * (s.reps || 0);
        const orm = est1RM(w, s.reps || 0);
        if (orm > top1RM) top1RM = orm;
      }
      if (w > topWeight) topWeight = w;
    }
  }
  const muscles = {};
  for (const [m, share] of Object.entries(def.muscles)) muscles[m] = load * share;
  return { load, top1RM, topWeight, muscles, kind: def.kind };
}

function normalize(data) {
  const { ATHLETE, EXERCISE_LIBRARY } = data;
  const workouts = data.WORKOUTS.map((w) => {
    const t = new Date(w.datetime).getTime();
    const exercises = (w.exercises || []).map((ex) => ({ ...ex, ...computeSessionExercise(ex, EXERCISE_LIBRARY, ATHLETE) }));
    const muscleLoad = {};
    for (const ex of exercises)
      for (const [m, v] of Object.entries(ex.muscles)) muscleLoad[m] = (muscleLoad[m] || 0) + v;
    return { ...w, t, exercises, muscleLoad, isAerobic: exercises.some((e) => e.kind === "aerobic") };
  });
  workouts.sort((a, b) => b.t - a.t);
  return workouts;
}

/* Estimate a representative "hard session" load per muscle from the snapshot:
 * the sum of the muscle's three biggest movements. Used so that incidental
 * (secondary) work reads as proportionally less fatiguing than a focused day. */
function snapshotReference(data) {
  const perMuscle = {};
  for (const ex of data.SNAPSHOT) {
    const lib = data.EXERCISE_LIBRARY[ex.name];
    if (!lib) continue;
    const { volume } = recStats(ex.latest, ex.iso);
    for (const [m, share] of Object.entries(lib.muscles)) (perMuscle[m] = perMuscle[m] || []).push(volume * share);
  }
  const ref = {};
  for (const [m, arr] of Object.entries(perMuscle)) { arr.sort((a, b) => b - a); ref[m] = sum(arr.slice(0, 3)); }
  return ref;
}

/* Per-muscle reference = max(heaviest logged session, representative snapshot session). */
function referenceLoads(workouts, muscles, snapRef) {
  const ref = {};
  for (const m of Object.keys(muscles)) ref[m] = 0;
  for (const w of workouts)
    for (const [m, v] of Object.entries(w.muscleLoad)) if (v > (ref[m] || 0)) ref[m] = v;
  for (const m of Object.keys(ref)) ref[m] = Math.max(ref[m], snapRef[m] || 0, 1);
  return ref;
}

/* ---- fatigue (exponential recovery; recoveryHours = time to reach ready) -- */
const TAU_FACTOR = Math.log(100 / READY_THRESHOLD);
function muscleFatigue(workouts, muscles, ref, now) {
  const decayed = {};
  for (const m of Object.keys(muscles)) decayed[m] = 0;
  for (const w of workouts) {
    // A session logged with a same-day clock-time later than the moment this
    // recomputes (e.g. an evening workout logged before the real-world clock
    // reaches that hour) must still count at full freshness — clamping to 0
    // instead of skipping it. Skipping made the just-trained muscle look fully
    // recovered, so the dashboard immediately recommended the same section
    // again right after training it.
    const hours = Math.max(0, (now - w.t) / HOUR);
    for (const [m, load] of Object.entries(w.muscleLoad)) {
      const tau = muscles[m].recoveryHours / TAU_FACTOR;
      decayed[m] += load * Math.exp(-hours / tau);
    }
  }
  const result = {};
  for (const m of Object.keys(muscles)) {
    const pct = clamp((decayed[m] / ref[m]) * 100, 0, 100);
    const tau = muscles[m].recoveryHours / TAU_FACTOR;
    const target = ref[m] * (READY_THRESHOLD / 100);
    let readyInH = 0;
    if (decayed[m] > target) readyInH = tau * Math.log(decayed[m] / target);
    result[m] = { key: m, label: muscles[m].label, section: muscles[m].section, pct: round(pct), readyInHours: round(readyInH, 1), ready: pct < READY_THRESHOLD };
  }
  return result;
}

function sectionFatigue(fatigue, order) {
  const groups = {};
  for (const f of Object.values(fatigue)) (groups[f.section] = groups[f.section] || []).push(f);
  const out = {};
  for (const [section, items] of Object.entries(groups)) {
    out[section] = {
      section,
      pct: round(sum(items.map((i) => i.pct)) / items.length),
      readyInHours: round(Math.max(...items.map((i) => i.readyInHours)), 1),
      muscles: items.sort((a, b) => b.pct - a.pct),
    };
  }
  // Return in display order.
  const ordered = {};
  for (const s of order) if (out[s]) ordered[s] = out[s];
  for (const s of Object.keys(out)) if (!ordered[s]) ordered[s] = out[s];
  return ordered;
}

/* ---- workload progress from SNAPSHOT (grouped by section) ----------------- */
function snapshotProgress(data, workouts) {
  const todayNames = new Set((workouts[0]?.exercises || []).map((e) => e.name));
  const groups = {};
  for (const ex of data.SNAPSHOT) {
    const L = recStats(ex.latest, ex.iso);
    const B = recStats(ex.best, ex.iso);
    // Strength metric: estimated 1RM for rep-based lifts (accounts for weight AND
    // reps, so a heavier set at fewer reps can still be a PR). Timed/iso holds
    // have no 1RM, so fall back to load (weight x seconds).
    const useRM = !ex.iso && (L.top1RM > 0 || B.top1RM > 0);
    const Lm = useRM ? L.top1RM : L.volume;
    const Bm = useRM ? B.top1RM : B.volume;
    const peak = Math.max(Lm, Bm);
    const pct = peak > 0 ? round((Lm / peak) * 100) : 100;
    const item = {
      name: ex.name, section: ex.section, iso: !!ex.iso,
      latestText: ex.latest?.text || "", bestText: ex.best?.text || "",
      latestVol: round(L.volume), bestVol: round(B.volume), pct,
      latest1RM: round(L.top1RM, 1), best1RM: round(B.top1RM, 1),
      metric: useRM ? "1RM" : "load",
      isPR: Lm >= Bm, belowPR: pct < 99,
      gap: round(Math.max(0, Bm - Lm)),
      inToday: todayNames.has(ex.name),
    };
    (groups[ex.section] = groups[ex.section] || []).push(item);
  }
  // Order by SECTION_ORDER.
  const ordered = {};
  for (const s of data.SECTION_ORDER) if (groups[s]) ordered[s] = groups[s];
  return ordered;
}

/* ---- balance from SNAPSHOT (whole program) -------------------------------- */
function balance(data) {
  const muscles = data.MUSCLES;
  let push = 0, pull = 0, quad = 0, ham = 0, core = 0;
  const bySection = {};
  for (const ex of data.SNAPSHOT) {
    const lib = data.EXERCISE_LIBRARY[ex.name];
    if (!lib) continue;
    const { volume } = recStats(ex.latest, ex.iso);
    for (const [m, share] of Object.entries(lib.muscles)) {
      const v = volume * share;
      const sec = muscles[m].section;
      bySection[sec] = (bySection[sec] || 0) + v;
      if (muscles[m].role === "push") push += v;
      if (muscles[m].role === "pull") pull += v;
      if (m === "quads") quad += v;
      if (m === "hamstrings") ham += v;
      if (m === "core") core += v;
    }
  }
  return {
    bySection,
    pushPull: pull > 0 ? round(push / pull, 2) : null,
    quadHam: ham > 0 ? round(quad / ham, 2) : null,
    hasCore: core > 0,
  };
}

/* ---- weekly load + ACWR (guarded for sparse data) ------------------------- */
function sessionStress(w, ref) {
  return sum(Object.entries(w.muscleLoad).map(([m, v]) => (v / ref[m]) * 100));
}
function loadTrends(workouts, ref, now) {
  const weeks = [];
  for (let i = 5; i >= 0; i--) {
    const end = now - i * 7 * DAY, start = end - 7 * DAY;
    const inWeek = workouts.filter((w) => w.t > start && w.t <= end);
    // ACWR as it stood at the end of this week — same acute:chronic formula as
    // the live number below, just replayed at each past week's end date, so
    // the trend shows how the ratio actually got here rather than a single point.
    const acuteAtEnd = sum(workouts.filter((w) => end - w.t > 0 && end - w.t <= 7 * DAY).map((w) => sessionStress(w, ref)));
    const last28AtEnd = workouts.filter((w) => end - w.t > 0 && end - w.t <= 28 * DAY);
    const chronicAtEnd = last28AtEnd.length ? sum(last28AtEnd.map((w) => sessionStress(w, ref))) / 4 : 0;
    const acwrAtEnd = (last28AtEnd.length >= MIN_SESSIONS_FOR_ACWR && chronicAtEnd > 0) ? round(acuteAtEnd / chronicAtEnd, 2) : null;
    weeks.push({ label: i === 0 ? "This wk" : `-${i}w`, stress: round(sum(inWeek.map((w) => sessionStress(w, ref)))), sessions: inWeek.length, acwr: acwrAtEnd });
  }
  const acute = sum(workouts.filter((w) => now - w.t <= 7 * DAY).map((w) => sessionStress(w, ref)));
  const last28 = workouts.filter((w) => now - w.t <= 28 * DAY);
  const chronic = last28.length ? sum(last28.map((w) => sessionStress(w, ref))) / 4 : 0;

  let acwr = null, acwrZone = "insufficient";
  if (last28.length >= MIN_SESSIONS_FOR_ACWR && chronic > 0) {
    acwr = round(acute / chronic, 2);
    acwrZone = acwr > 1.5 ? "danger" : acwr > 1.3 ? "caution" : acwr < 0.8 ? "detraining" : "ok";
  }
  return { weeks, acute: round(acute), chronic: round(chronic), acwr, acwrZone, sessions28: last28.length };
}

/* ---- next-session lift target ---------------------------------------------
 * Turns "your best" into an actual next-session target using double
 * progression: add reps each session until a rep ceiling, then step the
 * weight up and drop back to a restart rep count. If the latest session came
 * in below best (a bad day, travel gym, fatigue), the target is to rebuild to
 * best first rather than pushing past it blindly. */
const REP_CEILING = 12, REP_RESTART = 8;
function weightIncrement(w) {
  if (w >= 100) return 5;
  if (w >= 40) return 2.5;
  if (w >= 15) return 2;
  return 1;
}
function nextLiftTarget(e, holdLoad) {
  const best = e.best, latest = e.latest;
  if (!best) return null;
  const bestStats = recStats(best, e.iso);
  const latestStats = recStats(latest, e.iso);
  const atBest = e.iso
    ? latestStats.volume >= bestStats.volume * 0.999
    : latestStats.top1RM >= bestStats.top1RM * 0.999;

  if (!atBest) {
    return { status: "rebuild", text: `Rebuild to best (${best.text})`, note: `Last session came in under your best (${best.text}) — rebuild to that before pushing further.` };
  }
  if (holdLoad) {
    return { status: "hold", text: `Hold at best (${best.text})`, note: `Load ratio is elevated — repeat your best (${best.text}) rather than pushing for a PR this session.` };
  }
  if (e.iso) {
    const seconds = (best.seconds || 0) + 5;
    return { status: "progress", text: `+5s (aim ${best.sets}×${seconds}s)`, note: `Add 5s per set from your best (${best.text}) — aim for ${best.sets}×${seconds}s.` };
  }
  if ((best.reps || 0) < REP_CEILING) {
    const reps = best.reps + 1;
    return { status: "progress", text: `+1 rep (aim ${best.sets}×${reps})`, note: `Add 1 rep per set at the same weight — aim for ${best.sets}×${reps} from ${best.text}.` };
  }
  const inc = weightIncrement(best.weight || 0);
  return { status: "progress", text: `+${inc}kg (reset to ${best.sets}×${REP_RESTART})`, note: `You're at ${best.reps} reps on ${best.text} — step the weight up ~${inc}kg and reset to ${best.sets}×${REP_RESTART}.` };
}

/* Exercises to leave out of the Next Session suggestion list specifically
 * (SNAPSHOT/Workload Progress/balance still track them in full) — either
 * superseded by another exercise or deliberately deduped so only one variant
 * of a redundant pair gets suggested. */
const SUGGESTION_EXCLUDE = new Set([
  "Leg Extensions",              // machine maxed out; superseded by Single-Leg Extensions
  "Standing Calf Raises (Frame)", // keep only Calf Raises Machine in suggestions
]);

const EXTREME_ACWR = 2.0; // well past the danger-zone floor (>1.5) — high enough to justify a deload even right after another one

/* ---- deload check ----------------------------------------------------------
 * Whether the next session should be a light, full-body deload rather than
 * the normal per-section progression pick. Primary driver is training load
 * from the logged entries (ACWR danger zone); short-sleep and a notable
 * bodyweight drop are lifestyle-fatigue signals that strengthen the call but
 * aren't required on their own — they're reported either way so the reasoning
 * is visible, not just the verdict. Deloads are never recommended back-to-back
 * (the whole point is one lighter session to bring load back down) unless the
 * ratio is still extreme afterward. */
function deloadCheck(trends, sleep, bw, lastWasDeload) {
  const reasons = [];
  const loadSpike = !!(trends && trends.acwrZone === "danger");
  const extreme = !!(trends && trends.acwr != null && trends.acwr >= EXTREME_ACWR);
  const blockedByRecentDeload = loadSpike && lastWasDeload && !extreme;

  if (loadSpike && !blockedByRecentDeload) reasons.push(`Load ratio (ACWR) ${trends.acwr} is in the danger zone (>1.5) from your recent logged sessions.`);
  if (extreme && lastWasDeload) reasons.push(`Load ratio (ACWR) ${trends.acwr} is still extremely high (≥${EXTREME_ACWR}) even after your last session was a deload — another one is warranted despite training back-to-back.`);

  const shortSleep = !!(sleep && sleep.any && sleep.avg7 != null && sleep.avg7 < 7);
  if (shortSleep) reasons.push(`7-day average sleep is only ${sleep.avg7}h — under-recovered going into training.`);

  const bwDrop = !!(bw && bw.any && bw.delta != null && bw.delta <= -0.5);
  if (bwDrop) reasons.push(`Bodyweight dropped ${Math.abs(bw.delta)}kg since your last weigh-in — another sign of accumulated fatigue/under-recovery.`);

  return { recommend: loadSpike && !blockedByRecentDeload, reasons };
}

/* Pick each section's highest-1RM non-iso lift as the one compound exercise
 * to include in a deload session (skips bodyweight iso holds, which don't
 * have a top1RM and would otherwise never win). */
function primaryLiftForSection(data, section) {
  let top = null, topRM = -1;
  for (const e of data.SNAPSHOT) {
    if (e.section !== section || e.iso) continue;
    const B = recStats(e.best, false);
    if (B.top1RM > topRM) { topRM = B.top1RM; top = e; }
  }
  return top;
}

function deloadRound(w) {
  return Math.round(w / 2.5) * 2.5;
}

function deloadTarget(e) {
  const best = e.best;
  if (!best) return null;
  const weight = deloadRound((best.weight || 0) * 0.87);
  const reps = Math.max(5, (best.reps || 8) - 2);
  return {
    status: "deload",
    text: `${weight}kg × ${best.sets}×${reps} (deload)`,
    note: `~13% lighter than your best (${best.text}), reps capped well short of failure — recovery session, no PR attempt.`,
  };
}

/* ---- next recommended session --------------------------------------------- */
function recommendSession(data, workouts, sectionFat, now, bal, trends, sleep, bw) {
  const lastWasDeload = !!(workouts[0] && /deload/i.test(workouts[0].note || ""));
  const deload = deloadCheck(trends, sleep, bw, lastWasDeload);
  if (deload.recommend) {
    const sections = ["Chest", "Back", "Shoulders", "Legs", "Arms"];
    const suggestedExercises = sections
      .map((s) => primaryLiftForSection(data, s))
      .filter(Boolean)
      .map((e) => {
        const B = recStats(e.best, false);
        return { name: e.name, best: e.best?.text || "", best1RM: round(B.top1RM, 1), iso: false, target: deloadTarget(e) };
      });
    const aerobicLast7 = workouts.filter((w) => now - w.t <= 7 * DAY && w.isAerobic).length;
    const lastAerobicDeload = workouts.find((w) => w.isAerobic);
    return {
      section: "Full Body",
      deload: true,
      deloadReasons: deload.reasons,
      fatigue: null,
      restHours: 0,
      readyNow: true,
      readyAt: new Date(now),
      neverLogged: false,
      daysSince: null,
      suggestedExercises,
      guidance: deload.reasons,
      ranked: [],
      aerobicLast7, aerobicTarget: data.ATHLETE.weeklyTarget.aerobicSessions,
      daysSinceAerobic: lastAerobicDeload ? round((now - lastAerobicDeload.t) / DAY, 1) : null,
    };
  }

  const muscles = data.MUSCLES;
  // Trainable sections = those with at least one strength exercise in the snapshot.
  // Core isn't suggested as a standalone session — it still fully tracks
  // fatigue/workload/balance and any Core exercises logged as part of a real
  // workout still count normally; it just never wins the top-level pick.
  const trainable = [...new Set(data.SNAPSHOT.map((e) => e.section))]
    .filter((s) => sectionFat[s] && s !== "Cardio" && s !== "Core");

  if (!trainable.length) return null;

  // When was each section last the primary focus of a logged session?
  const lastTrained = {};
  for (const w of workouts) {
    const total = sum(Object.values(w.muscleLoad)) || 1;
    for (const s of trainable) {
      if (lastTrained[s] != null) continue;
      const secLoad = sum(Object.entries(w.muscleLoad).filter(([m]) => muscles[m].section === s).map(([, v]) => v));
      if (secLoad / total > 0.4) lastTrained[s] = w.t;
    }
  }

  // Sensible tie-break priority when several sections are equally recovered —
  // nudged by the program-wide push/pull balance so a corrective section wins
  // ties instead of the fixed default order. Physiological readiness (sorted
  // first, below) always outranks this: balance never pulls in an unrecovered
  // muscle, it only breaks ties among sections that are already comparably ready.
  const priority = { Legs: 0, Back: 1, Shoulders: 2, Chest: 3, Arms: 4 };
  if (bal && bal.pushPull != null) {
    if (bal.pushPull > 1.3) { priority.Back = -1; priority.Chest = 5; }
    else if (bal.pushPull < 0.7) { priority.Chest = -1; priority.Back = 5; }
  }
  const ranked = trainable
    .map((s) => ({
      section: s,
      fatigue: sectionFat[s].pct,
      readyInHours: sectionFat[s].readyInHours,
      daysSince: lastTrained[s] != null ? round((now - lastTrained[s]) / DAY, 1) : null,
    }))
    .sort((a, b) =>
      a.readyInHours - b.readyInHours ||
      (b.daysSince == null ? 99 : b.daysSince) - (a.daysSince == null ? 99 : a.daysSince) ||
      a.fatigue - b.fatigue ||
      (priority[a.section] ?? 9) - (priority[b.section] ?? 9)
    );

  const pick = ranked[0];
  const restHours = pick.readyInHours;

  // Exercises for the picked section. "best" is kept as a reference point;
  // "target" is the actual next-session ask, computed from latest-vs-best via
  // double progression (see nextLiftTarget) — ordered and annotated below to
  // reflect what actually keeps the program balanced this session.
  // Danger-zone ACWR is the same signal that puts "no PR attempts" in the
  // guidance text below — the per-exercise targets need to agree with that,
  // not keep suggesting weight/rep PRs while the copy says to hold flat.
  const holdLoad = !!(trends && trends.acwrZone === "danger");
  let suggestedExercises = data.SNAPSHOT
    .filter((e) => e.section === pick.section && !SUGGESTION_EXCLUDE.has(e.name))
    .map((e) => {
      const B = recStats(e.best, e.iso);
      const lib = data.EXERCISE_LIBRARY[e.name];
      const target = nextLiftTarget(e, holdLoad);
      return { name: e.name, best: e.best?.text || "", best1RM: round(B.top1RM, 1), iso: !!e.iso, target, lib };
    });

  const guidance = [];
  if (pick.section === "Legs" && bal && bal.quadHam != null && bal.quadHam > 2.5) {
    const hamBias = (e) => (e.lib?.muscles?.hamstrings || 0) - (e.lib?.muscles?.quads || 0);
    suggestedExercises.sort((a, b) => hamBias(b) - hamBias(a));
    guidance.push(`Quads are outpacing hamstrings ${bal.quadHam}× across the program — lead with RDLs / leg curls / glute-hamstring work today rather than quad-dominant lifts.`);
  } else if (pick.section === "Arms" && bal && bal.pushPull != null) {
    const armBias = (e) => (e.lib?.muscles?.biceps || 0) - (e.lib?.muscles?.triceps || 0);
    if (bal.pushPull > 1.3) {
      suggestedExercises.sort((a, b) => armBias(b) - armBias(a));
      guidance.push(`Push is ahead of pull ${bal.pushPull}× program-wide — favor biceps/curl work over triceps today.`);
    } else if (bal.pushPull < 0.7) {
      suggestedExercises.sort((a, b) => armBias(a) - armBias(b));
      guidance.push(`Pull is ahead of push ${round(1 / bal.pushPull, 2)}× program-wide — favor triceps/press work over curls today.`);
    }
  } else if (pick.section === "Back" && bal && bal.pushPull != null && bal.pushPull > 1.3) {
    guidance.push(`Push is ahead of pull ${bal.pushPull}× program-wide — good timing for a pull day; keep rowing/rear-delt volume generous rather than trimming it short.`);
  } else if (pick.section === "Chest" && bal && bal.pushPull != null && bal.pushPull < 0.7) {
    guidance.push(`Pull is ahead of push ${round(1 / bal.pushPull, 2)}× program-wide — good timing for a push day.`);
  }
  // Show every trainable exercise for the picked section (some, like Legs or
  // Arms, have a dozen+) rather than an arbitrary top-N cut — but a real
  // session doesn't run all of them, so also estimate how many to actually
  // do today from how many this section's own past sessions typically used.
  suggestedExercises = suggestedExercises.map(({ lib, ...rest }) => rest);
  const sectionExerciseNames = new Set(suggestedExercises.map((e) => e.name));
  const pastSessionSizes = [];
  for (const w of workouts) {
    const total = sum(Object.values(w.muscleLoad)) || 1;
    const secLoad = sum(Object.entries(w.muscleLoad).filter(([m]) => muscles[m].section === pick.section).map(([, v]) => v));
    if (secLoad / total <= 0.4) continue;
    const count = w.exercises.filter((ex) => sectionExerciseNames.has(ex.name)).length;
    if (count > 0) pastSessionSizes.push(count);
  }
  const totalAvailable = suggestedExercises.length;
  let typicalSessionSize = 4;
  if (pastSessionSizes.length) {
    pastSessionSizes.sort((a, b) => a - b);
    const mid = Math.floor(pastSessionSizes.length / 2);
    typicalSessionSize = pastSessionSizes.length % 2
      ? pastSessionSizes[mid]
      : Math.round((pastSessionSizes[mid - 1] + pastSessionSizes[mid]) / 2);
  }
  const minCount = Math.min(3, totalAvailable);
  let suggestedCount = clamp(typicalSessionSize, minCount, totalAvailable);
  if (trends && trends.acwrZone === "danger") suggestedCount = clamp(suggestedCount - 1, minCount, totalAvailable);

  if (trends && trends.acwrZone === "danger")
    guidance.push(`Load ratio ${trends.acwr} is in the danger zone — keep weight/sets flat this session, no PR attempts.`);
  else if (trends && trends.acwrZone === "caution")
    guidance.push(`Load ratio ${trends.acwr} is climbing — fine to train, but cap volume growth (~10%) rather than chasing a big PR.`);
  else if (trends && trends.acwrZone === "detraining")
    guidance.push(`Load ratio ${trends.acwr} has dipped — a normal, or even a slightly harder, session is fine.`);

  const aerobicLast7 = workouts.filter((w) => now - w.t <= 7 * DAY && w.isAerobic).length;
  const lastAerobic = workouts.find((w) => w.isAerobic);

  return {
    section: pick.section,
    fatigue: pick.fatigue,
    restHours: round(restHours, 1),
    readyNow: restHours < 1,
    readyAt: new Date(now + restHours * HOUR),
    neverLogged: pick.daysSince == null,
    daysSince: pick.daysSince,
    suggestedExercises, guidance, ranked,
    suggestedCount, totalAvailable, typicalSessionSize,
    aerobicLast7, aerobicTarget: data.ATHLETE.weeklyTarget.aerobicSessions,
    daysSinceAerobic: lastAerobic ? round((now - lastAerobic.t) / DAY, 1) : null,
  };
}

/* ---- injury / overtraining alerts ----------------------------------------- */
function injuryAlerts(data, fatigue, trends, bal, rec, now) {
  const alerts = [];

  if (trends.acwrZone === "insufficient")
    alerts.push({ level: "low", title: "Building a load baseline", detail: `Only ${trends.sessions28} session(s) logged in the last 28 days, so the acute:chronic load ratio isn't reliable yet. Keep logging and this becomes a real injury-risk gauge.` });
  else if (trends.acwrZone === "danger")
    alerts.push({ level: "high", title: "Training load spike", detail: `Load ratio ${trends.acwr} (>1.5). Sharp jumps are the classic soft-tissue injury setup — hold volume flat or deload.` });
  else if (trends.acwrZone === "caution")
    alerts.push({ level: "med", title: "Load climbing fast", detail: `Load ratio ${trends.acwr} (sweet spot 0.8–1.3). Keep added volume under ~10% next week.` });
  else if (trends.acwrZone === "detraining")
    alerts.push({ level: "low", title: "Load dropped off", detail: `Load ratio ${trends.acwr} (<0.8). A normal training week will bring this back up.` });

  // Heavily fatigued muscles right now.
  for (const f of Object.values(fatigue)) {
    if (f.pct >= 80)
      alerts.push({ level: "low", title: `${f.label} fatigued (${f.pct}%)`, detail: `Recovers in ~${f.readyInHours}h. Avoid loading it hard before then — you trained it most recently.` });
  }

  // Long aerobic gap.
  if (rec && rec.daysSinceAerobic != null && rec.daysSinceAerobic > 21)
    alerts.push({ level: "med", title: "Aerobic base slipping", detail: `${rec.daysSinceAerobic} days since your last logged cardio. Your heart-rate fitness and between-session recovery fade without it — fit in an easy run or bike.` });

  // Push/pull imbalance (program-wide).
  if (bal.pushPull != null && bal.pushPull > 1.4)
    alerts.push({ level: "med", title: "Push outpacing pull", detail: `Push volume is ${bal.pushPull}× pull across your program. A press-dominant ratio rounds the shoulders forward and stresses the rotator cuff — add rows / rear-delt work.` });
  else if (bal.pushPull != null && bal.pushPull < 0.7)
    alerts.push({ level: "low", title: "Pull outpacing push", detail: `Pull volume is ${round(1 / bal.pushPull, 2)}× push. Balance with more pressing.` });

  // Quad/ham imbalance.
  if (bal.quadHam != null && bal.quadHam > 3)
    alerts.push({ level: "med", title: "Hamstrings undertrained", detail: `Quad volume is ${bal.quadHam}× hamstrings. A big front/back gap raises hamstring-strain and knee risk — prioritise leg curls / RDLs.` });

  if (alerts.filter((a) => a.level !== "low").length === 0)
    alerts.unshift({ level: "ok", title: "No major red flags", detail: "Nothing acutely concerning. The notes below are housekeeping, not warnings." });

  const order = { high: 0, med: 1, low: 2, ok: 3 };
  alerts.sort((a, b) => order[a.level] - order[b.level]);
  return alerts;
}

/* ---- suggested changes ---------------------------------------------------- */
function suggestedChanges(data, progress, bal, rec) {
  const changes = [];

  // Lifts currently below their PR (biggest gaps first).
  const below = [];
  for (const items of Object.values(progress)) for (const it of items) if (it.belowPR) below.push(it);
  below.sort((a, b) => a.pct - b.pct);
  if (below.length) {
    const top = below.slice(0, 3).map((b) => `${b.name} (${b.pct}% of best)`);
    changes.push(`You're below your PR on ${below.length} lift${below.length > 1 ? "s" : ""} — closest wins first: ${top.join(", ")}. Add a rep or a set before adding weight.`);
  }

  // Balance.
  if (bal.pushPull != null && bal.pushPull > 1.3)
    changes.push(`Add pulling volume — push is ${bal.pushPull}× your pull. Aim toward ~1:1 to keep shoulders healthy.`);
  if (bal.quadHam != null && bal.quadHam > 2.5)
    changes.push(`Hamstrings lag quads (${bal.quadHam}×). Keep RDLs/leg curls heavy and add a set.`);

  // Direct core work.
  if (!bal.hasCore)
    changes.push(`No direct core work is tracked. Add planks / hanging leg raises — it carries over to your pressing and squatting stability.`);

  // Aerobic dose.
  if (rec && rec.daysSinceAerobic != null && rec.daysSinceAerobic > 14)
    changes.push(`Bring cardio back into the week (last logged ${rec.daysSinceAerobic} days ago). 1–2 easy zone-2 sessions speeds recovery between lifting days.`);
  else if (rec && rec.aerobicLast7 < rec.aerobicTarget)
    changes.push(`Only ${rec.aerobicLast7}/${rec.aerobicTarget} aerobic sessions this week — add an easy run or row.`);

  if (!changes.length) changes.push("Program looks balanced. Keep adding small increments and logging sessions.");
  return changes;
}

/* ---- workout timing ------------------------------------------------------- */
function timingStats(workouts, now) {
  if (!workouts.length) return null;
  const times = workouts.map((w) => w.t).sort((a, b) => a - b);
  const gaps = [];
  for (let i = 1; i < times.length; i++) gaps.push((times[i] - times[i - 1]) / DAY);
  const avgGap = gaps.length ? round(sum(gaps) / gaps.length, 1) : null;
  const longestGap = gaps.length ? round(Math.max(...gaps), 1) : null;
  const perWeek = round(workouts.filter((w) => now - w.t <= 28 * DAY).length / 4, 1);

  // Sessions with timeUnknown (placeholder clock-times — e.g. full-day step
  // totals with no real start time) are excluded here so they don't skew the
  // typical-time stat, but still count everywhere else (gaps, frequency, dow).
  const timedWorkouts = workouts.filter((w) => !w.timeUnknown);
  const hours = timedWorkouts.map((w) => new Date(w.t).getHours());
  const avgHour = hours.length ? round(sum(hours) / hours.length) : null;
  // Derived from avgHour (not a separate morning-session count) so the label
  // always matches the "~Xh:00" figure shown next to it.
  const todPref = avgHour == null ? null : avgHour < 12 ? "morning" : avgHour < 17 ? "afternoon" : "evening";

  const dow = [0, 0, 0, 0, 0, 0, 0];
  for (const w of workouts) dow[new Date(w.t).getDay()]++;

  return { avgGap, longestGap, perWeek, avgHour, todPref, dow, daysSinceLast: round((now - times[times.length - 1]) / DAY, 1), total: workouts.length };
}

/* ---- bodyweight log ------------------------------------------------------- */
function bodyweight(data) {
  const log = (data.BODYWEIGHT || []).slice().sort((a, b) => new Date(b.datetime) - new Date(a.datetime));
  if (!log.length) return { any: false, current: data.ATHLETE.bodyweightKg || 75, history: [] };
  const current = log[0].kg, prev = log[1]?.kg ?? null;
  const earliest = log[log.length - 1].kg;
  return {
    any: true, current, prev,
    delta: prev != null ? round(current - prev, 2) : null,
    totalChange: log.length > 1 ? round(current - earliest, 2) : null,
    latestDate: log[0].datetime,
    min: Math.min(...log.map((e) => e.kg)), max: Math.max(...log.map((e) => e.kg)),
    history: log,
  };
}

/* ---- sleep log -------------------------------------------------------------
 * Manual nightly entries (SLEEP in data.js). Feeds the Sleep panel and a
 * short recovery caution on the Next Session recommendation. */
function sleepSummary(data, now) {
  const log = (data.SLEEP || []).slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  if (!log.length) return { any: false, history: [] };
  const current = log[0];
  const last7 = log.filter((e) => (now - new Date(e.date).getTime()) / DAY <= 7);
  const avg7 = last7.length ? round(sum(last7.map((e) => e.hours)) / last7.length, 1) : null;
  const status = current.hours < 6 ? "low" : current.hours > 9.5 ? "long" : "good";
  return { any: true, current, avg7, status, history: log };
}

/* ---- relative strength (lift ÷ bodyweight) -------------------------------- */
function relativeStrength(data, bwKg) {
  const bw = bwKg || data.ATHLETE.bodyweightKg || 75;
  const KEY = ["Bench Press", "Incline Bench Press", "Decline Bench Press", "Converging Shoulder Press",
    "Diverging Seated Row", "Low Row", "Leg Press", "Seated Dips"];
  const items = [];
  for (const name of KEY) {
    const ex = data.SNAPSHOT.find((e) => e.name === name);
    if (!ex) continue;
    const B = recStats(ex.best, ex.iso);
    const orm = B.top1RM || B.topWeight;
    if (!orm) continue;
    items.push({ name, oneRM: round(orm, 1), ratio: round(orm / bw, 2) });
  }
  items.sort((a, b) => b.ratio - a.ratio);
  return { bodyweightKg: bw, items };
}

/* ---- aerobic / cardio summary --------------------------------------------- */
function aerobicSummary(workouts, athlete, now) {
  const sessions = [];
  for (const w of workouts)
    for (const ex of w.exercises) {
      if (ex.kind !== "aerobic") continue;
      const dist = ex.distanceKm || 0, dur = ex.durationMin || 0;
      sessions.push({ t: w.t, name: ex.name, distanceKm: dist, durationMin: dur, avgHr: ex.avgHr || null, pace: dist > 0 ? dur / dist : null });
    }
  sessions.sort((a, b) => b.t - a.t);
  if (!sessions.length) return { any: false };

  const withDist = sessions.filter((s) => s.distanceKm > 0);
  const withPace = sessions.filter((s) => s.pace != null);
  const withHr = sessions.filter((s) => s.avgHr != null);
  const maxHr = 220 - (athlete.age || 30);
  const zones = { Z1: 0, Z2: 0, Z3: 0, Z4: 0, Z5: 0 };
  for (const s of withHr) { const f = s.avgHr / maxHr; zones[f < 0.6 ? "Z1" : f < 0.7 ? "Z2" : f < 0.8 ? "Z3" : f < 0.9 ? "Z4" : "Z5"]++; }

  let paceTrend = null;
  if (withPace.length >= 2) {
    const recent = withPace.slice(0, Math.min(3, withPace.length));
    const prior = withPace.slice(recent.length, recent.length + 3);
    if (prior.length) paceTrend = round(sum(recent.map((s) => s.pace)) / recent.length - sum(prior.map((s) => s.pace)) / prior.length, 2);
  }
  return {
    any: true, count: sessions.length,
    km7: round(sum(sessions.filter((s) => now - s.t <= 7 * DAY).map((s) => s.distanceKm)), 1),
    km28: round(sum(sessions.filter((s) => now - s.t <= 28 * DAY).map((s) => s.distanceKm)), 1),
    totalKm: round(sum(sessions.map((s) => s.distanceKm)), 1),
    longest: withDist.length ? round(Math.max(...withDist.map((s) => s.distanceKm)), 2) : 0,
    avgHr: withHr.length ? round(sum(withHr.map((s) => s.avgHr)) / withHr.length) : null,
    bestPace: withPace.length ? Math.min(...withPace.map((s) => s.pace)) : null,
    avgPace: withPace.length ? sum(withPace.map((s) => s.pace)) / withPace.length : null,
    paceTrend, zones, maxHr,
    daysSinceLast: round((now - sessions[0].t) / DAY, 1),
    recent: sessions.slice(0, 5),
  };
}

/* ---- top-level assembly --------------------------------------------------- */
function analyze(data, now = Date.now()) {
  const workouts = normalize(data);
  const ref = referenceLoads(workouts, data.MUSCLES, snapshotReference(data));
  const fatigue = muscleFatigue(workouts, data.MUSCLES, ref, now);
  const sections = sectionFatigue(fatigue, data.SECTION_ORDER);
  const progress = snapshotProgress(data, workouts);
  const bal = balance(data);
  const trends = loadTrends(workouts, ref, now);
  const bw = bodyweight(data);
  const sleep = sleepSummary(data, now);
  const recommendation = recommendSession(data, workouts, sections, now, bal, trends, sleep, bw);
  const alerts = injuryAlerts(data, fatigue, trends, bal, recommendation, now);
  const changes = suggestedChanges(data, progress, bal, recommendation);
  const timing = timingStats(workouts, now);
  const relstrength = relativeStrength(data, bw.current);
  const aerobic = aerobicSummary(workouts, data.ATHLETE, now);
  return { now, workouts, ref, fatigue, sections, progress, balance: bal, trends, recommendation, alerts, changes, timing, relstrength, aerobic, bodyweight: bw, sleep };
}

if (typeof window !== "undefined") window.GYM_ENGINE = { analyze, READY_THRESHOLD };
