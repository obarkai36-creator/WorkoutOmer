/* =============================================================================
 * report/render.mjs — render the dashboard to a landscape PDF (report.pdf).
 * -----------------------------------------------------------------------------
 * Uses headless Chromium (Playwright) to load index.html in PDF mode, waits for
 * the page to finish drawing, and writes a paginated landscape PDF.
 *
 * "Now" is anchored to your most recent logged session so the report reads
 * correctly regardless of the CI runner's wall-clock date.
 *
 * Run: npm run render   (after `npm install` + `npx playwright install chromium`)
 * ========================================================================== */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import vm from "node:vm";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.env.REPORT_PDF || resolve(ROOT, "report.pdf");

/* Read data.js (browser-style) to find the latest logged session timestamp. */
function latestWorkoutISO() {
  const ctx = { window: {}, console };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(resolve(ROOT, "data.js"), "utf8"), ctx, { filename: "data.js" });
  const workouts = ctx.window.GYM_DATA?.WORKOUTS || [];
  let max = 0;
  for (const w of workouts) { const t = new Date(w.datetime).getTime(); if (t > max) max = t; }
  return max ? new Date(max).toISOString() : new Date().toISOString();
}

async function main() {
  const nowISO = latestWorkoutISO();
  const url = new URL(pathToFileURL(resolve(ROOT, "index.html")));
  url.searchParams.set("pdf", "1");
  url.searchParams.set("now", nowISO);

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(url.toString(), { waitUntil: "networkidle" });
    await page.waitForFunction("window.__READY === true", { timeout: 15000 });
    await page.waitForTimeout(600); // let canvas charts paint
    if (errors.length) console.warn("Page errors:", errors.join("; "));

    await page.pdf({
      path: OUT,
      landscape: true,
      format: "A4",
      printBackground: true,
      margin: { top: "9mm", bottom: "9mm", left: "9mm", right: "9mm" },
    });
    console.log(`✓ Wrote ${OUT} (as of ${nowISO})`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error("Render failed:", e); process.exit(1); });
