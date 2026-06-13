/* =============================================================================
 * report/send.mjs — email report.pdf via Gmail SMTP.
 * -----------------------------------------------------------------------------
 * Required env (set as GitHub Actions secrets):
 *   SMTP_USER  your Gmail address (e.g. obarkai36@gmail.com)
 *   SMTP_PASS  a Google "App Password" (NOT your normal password)
 * Optional env:
 *   REPORT_TO  recipient (defaults to SMTP_USER)
 *   SMTP_HOST  defaults to smtp.gmail.com
 *   SMTP_PORT  defaults to 465 (SSL)
 *
 * If SMTP_USER/SMTP_PASS are absent, this exits 0 with a notice (so a first
 * push still succeeds and uploads the PDF artifact) — add the secret to enable
 * actual sending.
 * ========================================================================== */
import nodemailer from "nodemailer";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import vm from "node:vm";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PDF = process.env.REPORT_PDF || resolve(ROOT, "report.pdf");

const { SMTP_USER, SMTP_PASS } = process.env;
const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const REPORT_TO = process.env.REPORT_TO || SMTP_USER;

if (!SMTP_USER || !SMTP_PASS) {
  console.log("⚠ SMTP_USER / SMTP_PASS not set — skipping email send.");
  console.log("  Add them as repo secrets to enable automatic delivery.");
  process.exit(0);
}
if (!existsSync(PDF)) { console.error(`No PDF at ${PDF}; run the renderer first.`); process.exit(1); }

/* Pull the latest session for a useful subject line. */
function latestSession() {
  try {
    const ctx = { window: {}, console };
    vm.createContext(ctx);
    vm.runInContext(readFileSync(resolve(ROOT, "data.js"), "utf8"), ctx, { filename: "data.js" });
    const ws = (ctx.window.GYM_DATA?.WORKOUTS || []).slice().sort((a, b) => new Date(b.datetime) - new Date(a.datetime));
    return ws[0] || null;
  } catch { return null; }
}

async function main() {
  const last = latestSession();
  const dateStr = last ? new Date(last.datetime).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : new Date().toLocaleDateString();
  const note = last?.note ? ` — ${last.note}` : "";

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  await transporter.sendMail({
    from: `"WorkoutOmer" <${SMTP_USER}>`,
    to: REPORT_TO,
    subject: `🏋️ Training report — ${dateStr}${note}`,
    text: `Your latest training dashboard is attached as a PDF.\n\nLatest session: ${dateStr}${note}\n\n— WorkoutOmer`,
    attachments: [{ filename: `training-report-${dateStr.replace(/\s/g, "-")}.pdf`, path: PDF }],
  });
  console.log(`✓ Sent report to ${REPORT_TO}`);
}

main().catch((e) => { console.error("Send failed:", e.message); process.exit(1); });
