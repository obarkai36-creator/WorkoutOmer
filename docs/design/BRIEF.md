# Dashboard redesign — design brief (living doc)

Started 2026-09-13. This tracks the redesign of `docs/` (the interactive
dashboard site) that will supersede the emailed unified HTML dashboard.
Updated as decisions are made — treat this as the source of truth for
direction, not the chat history.

## Decided so far

- **Visual direction: "soft navy"** (Oura-inspired) — soft dark navy
  background (not pure black), gradient accent rings, warmer than a stark
  Whoop/Linear treatment. Tokens live in `docs/design/tokens.css`.
- **Dark only.** No light-mode variant — one design to perfect.
- **Per-pillar fixed ring color identity**, used identically everywhere a
  pillar shows up (Energy=gold, Sperm=violet→pink, Training=cyan,
  Nutrition=green→teal, Sleep=indigo, Body comp=blue). Builds instant
  pattern recognition across tabs/days instead of relearning color per screen.
- **Status colors (green/amber/red) reserved for state only** — never used
  decoratively, so they stay meaningful.
- **Email retirement**: the emailed unified HTML dashboard
  (`unified_report.yml` / `generate_dashboard.py --unified`) is being
  retired in favor of the site being the single source of truth for
  tracking. The 6 features that exist ONLY in the email are being folded
  into the site as part of this same redesign pass (not a follow-up):
  1. Muscle Fatigue & Recovery — per-muscle-group bars (not just
     section-level), visible for every day, not gated to "latest day only"
     like the current site's live recommendation panel.
  2. Load Ratio Trend — 6-week ACWR bar chart with sweet-spot/danger zone.
  3. Program Balance & Relative Strength — Push:Pull / Quad:Ham ratio
     chips + 1RM÷bodyweight ranked list.
  4. Aerobic/Cardio panel — 28-day distance, avg HR, avg pace, days since
     last cardio.
  5. PRs & Below-Best Lifts — call-out list of recent PR/non-PR lifts.
  6. Energy Score full breakdown — ring + per-factor bars + notes (site
     currently only shows the raw number as a chip).
  Once these are live on the site, `unified_report.yml` (and the whole
  `send_unified.mjs` email pipeline) can be retired from the EOD routine.

## Open — being decided via the two mockups

**Layout paradigm for the Overview/landing view** — two real, static
mockups built to compare side by side (same tokens.css, same sample data
where applicable, so the comparison is layout-only):

- `docs/design/mockup-a-bento.html` — **Bento-grid hero view.** One hero
  ring (Energy score) + a grid of smaller pillar tiles (Nutrition,
  Training load, Sperm score, Sleep, Body comp, Supplements), each
  tap-through to its full tab. Dominant 2025 dashboard pattern; leads with
  "the one big thing" per Oura's own 2025 redesign philosophy.
- `docs/design/mockup-b-tabs.html` — **Refined tabs, current structure
  kept.** Same 6-tab nav as today, restyled with the new tokens; a couple
  of chips upgraded to small rings. Also shows what the migrated Training
  panel looks like in the new visual language (all 6 email-only features
  mocked there). Lower risk/rebuild than the bento option.

Both are static, non-functional mockups with sample data — not wired to
real data yet. Open the two files locally or via GitHub Pages
(`/design/mockup-a-bento.html`, `/design/mockup-b-tabs.html`) to compare.

**Still to decide once a layout is picked:**
- Where do the other 5 tabs (Nutrition, Body Comp, Sperm, Supplements) land
  visually in the bento version — do they keep today's list/panel style
  once you tap in, or also get a bento treatment?
- Chart library: keep Chart.js (already vendored at `docs/vendor/`) or
  consider a lighter/more-native sparkline approach for trend lines, given
  the "layer 1 = ring, layer 2 = sparkline, layer 3 = detail log" pattern
  the research surfaced.
- Typography: currently system-ui stack (zero external dependency). Could
  self-host Inter as a variable woff2 for a more considered numeral set if
  wanted — no CDN needed either way, matching the existing
  no-external-network policy from the Chart.js vendoring decision.
- Mobile layout for the bento grid (tile sizing collapses to 2-then-1
  column at the breakpoints already stubbed into the mockup CSS — needs a
  real device check once a direction is picked).

## Non-decisions (deliberately deferred)

- Exact copy/wording per panel — using representative sample text for now.
- Whether `sperm.json`/`energy.json` compute functions need any changes —
  this redesign is presentation-layer only unless something surfaces.
- GitHub Pages is still not confirmed enabled (see CLAUDE.md) — these
  mockup files will render fine locally regardless; once Pages is on they
  become viewable at the live URL too, same as the rest of `docs/`.
