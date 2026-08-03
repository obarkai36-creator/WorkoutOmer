/* =============================================================================
 * report/send_unified.mjs — email the unified training+nutrition dashboard
 * (an HTML file, not a PDF — no headless-browser render step needed).
 * -----------------------------------------------------------------------------
 * Preferred: Resend HTTP API (set RESEND_API_KEY). No SMTP password needed.
 * Fallback:  Gmail SMTP via nodemailer (set SMTP_PASS / GMAIL).
 *
 * Env (set as GitHub Actions secrets — same ones report/send.mjs already uses):
 *   RESEND_API_KEY   Resend API key (re_...)            ← preferred
 *   REPORT_TO        recipient (default obarkai36@gmail.com)
 *   RESEND_FROM      sender (default onboarding@resend.dev)
 *   SMTP_PASS        Gmail App Password                 ← fallback only
 *   SMTP_USER        Gmail address (default obarkai36@gmail.com)
 *   REPORT_DATE      the YYYY-MM-DD the dashboard was generated for (subject line)
 *
 * Usage: node report/send_unified.mjs <path-to-html>
 * If neither credential is present, exits 0 with a notice.
 * ========================================================================== */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HTML_PATH = process.argv[2];
if (!HTML_PATH) { console.error("Usage: node report/send_unified.mjs <path-to-html>"); process.exit(1); }
const HTML = resolve(ROOT, HTML_PATH);

const REPORT_TO = process.env.REPORT_TO || "obarkai36@gmail.com";
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM || "WorkoutOmer <onboarding@resend.dev>";
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_USER = process.env.SMTP_USER || REPORT_TO;
const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const REPORT_DATE = process.env.REPORT_DATE || new Date().toISOString().slice(0, 10);

if (!existsSync(HTML)) { console.error(`No HTML file at ${HTML}; run generate_dashboard.py --unified first.`); process.exit(1); }

const dateStr = new Date(REPORT_DATE).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const subject = `📊 Daily Dashboard — ${dateStr}`;
const text = `Your daily training + nutrition dashboard is attached (open in a browser).\n\nDate: ${dateStr}\n\n— WorkoutOmer`;
const filename = `dashboard-${REPORT_DATE}.html`;

async function sendViaResend() {
  console.log(`Sending via Resend: ${RESEND_FROM} → ${REPORT_TO}`);
  const content = readFileSync(HTML).toString("base64");
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
  await transporter.sendMail({ from: `"WorkoutOmer" <${SMTP_USER}>`, to: REPORT_TO, subject, text, attachments: [{ filename, path: HTML }] });
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
