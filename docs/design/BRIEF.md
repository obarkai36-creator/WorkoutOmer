# Dashboard redesign — design brief (living doc)

Started 2026-09-13. This tracks the redesign of `docs/` (the interactive
dashboard site) that will supersede the emailed unified HTML dashboard.
Updated as decisions are made — treat this as the source of truth for
direction, not the chat history.

## Decided so far

- **Visual direction: "soft sky" (light theme)** — pivoted 2026-09-13 after
  seeing the dark "soft navy" version actually rendered: white/pale
  blue-grey page background, white cards, dark navy text, lighter
  per-pillar ring hues than the original dark-mode palette. Gradient
  rings, section-eyebrow labels, tile dividers, and the click-to-open
  detail modal all carry over from the dark pass unchanged — this was a
  token-level swap (`docs/design/tokens.css`), not a structural rebuild.
- **Light only.** No dark-mode variant — one design to perfect.
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

- **Layout paradigm: bento-grid Overview, LOCKED IN** (2026-09-13, after
  comparing both mockups). `docs/design/mockup-b-tabs.html` is kept in the
  repo as historical reference only — not being iterated on further.
- **v1 mockups read as "raw and unfinished"** (2026-09-13 feedback) — the
  problem was the shared visual system, not the layout choice. v3 (current)
  fixes: bumped surface/border contrast so cards visibly separate from the
  page instead of blending into the ambient glow; added `.section-eyebrow`
  labels ("Today" / "At a glance" / "Insights") for page-level hierarchy;
  added a hairline `.tile-divider` inside each tile between the headline
  ring+number and the secondary bar/trend row, so tiles don't read as one
  undifferentiated block; deepened shadows for more separation.
- **Interaction model: tap-through opens a modal**, not real navigation —
  each of the 6 tiles opens a full detail view (same modal, content
  swapped) so the "inside" of each pillar can be inspected without leaving
  Overview. This is now built out in `mockup-a-bento.html` with real
  sample content per pillar (not just a label), including all 6 features
  migrated from the email inside the Training detail view.

## Open

**Still to decide:**
- Whether the modal-on-tap pattern is the final interaction, or tiles
  should navigate to a full page/section instead once this leaves the
  concept stage.
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
