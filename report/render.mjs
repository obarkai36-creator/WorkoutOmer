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
    await page.waitForTimeout(300);
    if (errors.length) console.warn("Page errors:", errors.join("; "));

    // Size the PDF page to the full content → guaranteed single landscape slide.
    const dims = await page.evaluate(() => ({
      w: Math.ceil(document.body.scrollWidth),
      h: Math.ceil(document.body.scrollHeight),
    }));
    await page.pdf({
      path: OUT,
      printBackground: true,
      width: `${dims.w}px`,
      height: `${dims.h}px`,
      pageRanges: "1",
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
    });
    console.log(`✓ Wrote ${OUT} (${dims.w}×${dims.h}px, as of ${nowISO})`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error("Render failed:", e); process.exit(1); });
