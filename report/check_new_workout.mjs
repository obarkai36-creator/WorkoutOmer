/* =============================================================================
 * report/check_new_workout.mjs — gate the auto-email on an actual new workout.
 * -----------------------------------------------------------------------------
 * data.js also carries sleep and bodyweight logs, which are committed far more
 * often than workouts. The dashboard should keep building from all of that in
 * the background, but the auto-email should only fire when a new session
 * lands in WORKOUTS — otherwise every sleep/weigh-in commit would also spam
 * an email that looks identical to the last one.
 *
 * Compares the latest WORKOUTS timestamp in the current data.js against the
 * previous commit's data.js. Writes `new_workout=true|false` to GITHUB_OUTPUT.
 * A manual workflow_dispatch run always counts as "new" (explicit request).
 * ========================================================================== */
import { readFileSync, appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import vm from "node:vm";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function latestWorkoutMs(source) {
  const ctx = { window: {}, console };
  vm.createContext(ctx);
  vm.runInContext(source, ctx, { filename: "data.js" });
  const workouts = ctx.window.GYM_DATA?.WORKOUTS || [];
  const stamps = workouts.map((w) => new Date(w.datetime).getTime());
  return stamps.length ? Math.max(...stamps) : 0;
}

function writeOutput(name, value) {
  const file = process.env.GITHUB_OUTPUT;
  if (file) appendFileSync(file, `${name}=${value}\n`);
  console.log(`${name}=${value}`);
}

function main() {
  if (process.env.GITHUB_EVENT_NAME === "workflow_dispatch") {
    console.log("Manual workflow_dispatch run — always sending.");
    writeOutput("new_workout", "true");
    return;
  }

  const current = latestWorkoutMs(readFileSync(resolve(ROOT, "data.js"), "utf8"));

  let previous = 0;
  try {
    const prevSource = execFileSync("git", ["show", "HEAD~1:data.js"], { cwd: ROOT, encoding: "utf8" });
    previous = latestWorkoutMs(prevSource);
  } catch {
    // No previous commit / no previous data.js (e.g. first commit on the branch) → treat as new.
    console.log("No previous data.js to compare against — treating as new.");
    writeOutput("new_workout", "true");
    return;
  }

  const isNew = current > previous;
  console.log(`Latest WORKOUTS timestamp: previous=${new Date(previous).toISOString()} current=${new Date(current).toISOString()}`);
  writeOutput("new_workout", isNew ? "true" : "false");
}

main();
