/* =============================================================================
 * report/send.mjs — email report.pdf.
 * -----------------------------------------------------------------------------
 * Preferred: Resend HTTP API (set RESEND_API_KEY). No SMTP password needed.
 * Fallback:  Gmail SMTP via nodemailer (set SMTP_PASS / GMAIL).
 *
 * Env (set as GitHub Actions secrets):
 *   RESEND_API_KEY   Resend API key (re_...)            ← preferred
 *   REPORT_TO        recipient (default obarkai36@gmail.com)
 *   RESEND_FROM      sender (default onboarding@resend.dev — works with no
 *                    domain setup, but Resend test mode only delivers to the
 *                    address you signed up with)
 *   SMTP_PASS        Gmail App Password                 ← fallback only
 *   SMTP_USER        Gmail address (default obarkai36@gmail.com)
 *
 * If neither credential is present, exits 0 with a notice.
 * ========================================================================== */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import vm from "node:vm";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PDF = process.env.REPORT_PDF || resolve(ROOT, "report.pdf");

const REPORT_TO = process.env.REPORT_TO || "obarkai36@gmail.com";
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM || "WorkoutOmer <onboarding@resend.dev>";
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_USER = process.env.SMTP_USER || REPORT_TO;
const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);

if (!existsSync(PDF)) { console.error(`No PDF at ${PDF}; run the renderer first.`); process.exit(1); }

/* Latest session → friendly subject line. */
function latestSession() {
  try {
    const ctx = { window: {}, console };
    vm.createContext(ctx);
    vm.runInContext(readFileSync(resolve(ROOT, "data.js"), "utf8"), ctx, { filename: "data.js" });
    const ws = (ctx.window.GYM_DATA?.WORKOUTS || []).slice().sort((a, b) => new Date(b.datetime) - new Date(a.datetime));
    return ws[0] || null;
  } catch { return null; }
}
const last = latestSession();
const dateStr = last ? new Date(last.datetime).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : new Date().toLocaleDateString();
const note = last?.note ? ` — ${last.note}` : "";
const subject = `🏋️ Training report — ${dateStr}${note}`;
const text = `Your latest training dashboard is attached as a PDF.\n\nLatest session: ${dateStr}${note}\n\n— WorkoutOmer`;
const filename = `training-report-${dateStr.replace(/\s/g, "-")}.pdf`;

async function sendViaResend() {
  console.log(`Sending via Resend: ${RESEND_FROM} → ${REPORT_TO}`);
  const content = readFileSync(PDF).toString("base64");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: RESEND_FROM, to: [REPORT_TO], subject, text, attachments: [{ filename, content }] }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Resend API ${res.status}: ${body}`);
  let id = ""; try { id = JSON.parse(body).id || ""; } catch {}
  console.log(`✓ Sent via Resend${id ? ` (id ${id})` : ""} to ${REPORT_TO}`);
}

async function sendViaSmtp() {
  const { default: nodemailer } = await import("nodemailer");
  console.log(`Sending via SMTP: ${SMTP_USER} → ${REPORT_TO} (${SMTP_HOST}:${SMTP_PORT})`);
  const transporter = nodemailer.createTransport({ host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_PORT === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } });
  await transporter.sendMail({ from: `"WorkoutOmer" <${SMTP_USER}>`, to: REPORT_TO, subject, text, attachments: [{ filename, path: PDF }] });
  console.log(`✓ Sent via SMTP to ${REPORT_TO}`);
}

async function main() {
  if (RESEND_API_KEY) return sendViaResend();
  if (SMTP_PASS) return sendViaSmtp();
  console.log("⚠ No email credential set — skipping send.");
  console.log("  Add a repo *Actions* secret RESEND_API_KEY (preferred) or SMTP_PASS to enable delivery.");
  process.exit(0);
}

main().catch((e) => { console.error("Send failed:", e.message); process.exit(1); });
