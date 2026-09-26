---
name: soft-sky-dashboard
description: Apply the "soft sky" bento-grid dashboard design system (light theme, tap-through detail modals, gradient progress rings, per-pillar color identity) to a static HTML/CSS/JS dashboard. Use when building or restyling a no-build-step data dashboard — an overview grid of metric tiles that expand into detail views — and you want a proven, cohesive visual system instead of designing one from scratch.
---

# Soft Sky Dashboard Design

A portable design system extracted from the WorkoutOmer health-tracking
dashboard (`docs/` in that repo). It's a light, "soft sky" bento-grid style:
pale blue-grey page background, white cards with soft shadows, a fixed
color identity per data "pillar" (metric category), and a tap-a-tile →
open-a-detail-modal interaction model. Vanilla HTML/CSS/JS, zero build
step, zero required CDN (Chart.js is vendored locally if you want charts).

This skill is presentation-layer only — it has no opinion on your data
model or backend. It assumes you already have (or will build) some JSON/API
data source and just need the dashboard shell and visual language.

## When to use this

- Building a new personal/small-team dashboard (health, finance, habits,
  ops metrics, whatever) that reads from a JSON file or simple API.
- Restyling an existing dashboard that currently looks inconsistent or
  "raw and unfinished" and needs a cohesive light theme.
- You want an Overview page of at-a-glance tiles, each of which can be
  tapped/clicked to open a fuller detail view, without full page navigation.

Don't reach for this if you need a dark theme (this system is light-only
by design — see Rationale) or a component library with JS framework
bindings (React/Vue/etc.) — this is vanilla DOM string-templating, ported
by hand into whatever stack you're using.

## Files in this skill

- `tokens.css` — the customizable design tokens (`:root` custom
  properties): base surfaces/borders/text colors, status colors, and the
  per-pillar gradient hue pairs. **Edit this file first** for any new
  project — rename/re-pick the pillar hues to match your own data
  categories.
- `dashboard.css` — structural component styles (header, bento grid,
  tiles, panels, chips, metric bars, tables, modal, responsive
  breakpoints). References the tokens via `var(--...)` — rarely needs
  edits beyond adding new component variants.
- `chart-helpers.js` — the JS half of the system: `COLORS`/`HUES`
  constants, `ringSvg()` (gradient progress ring as inline SVG),
  `lineChart()`/`barChart()` (thin Chart.js wrappers styled to match),
  `metricRow()` and `chip()` (small HTML-string builders for progress
  bars and stat chips). Skip this file if your dashboard has no charts.
- `index-skeleton.html` — a minimal page shell showing how the pieces
  wire together: stylesheet link with a cache-busting query string,
  optional vendored Chart.js script tag, the bento grid container, and
  the modal markup that detail views render into.

## How to apply it in a new repo/workspace

1. Copy `tokens.css`, `dashboard.css`, and (if you'll have charts)
   `chart-helpers.js` into your project's static assets directory
   (e.g. wherever `index.html` lives).
2. Copy `index-skeleton.html`'s `<head>` wiring and body skeleton
   (header, `#content` mount point, modal backdrop) into your actual
   `index.html`, or use it as a new file directly.
3. Open `tokens.css` and:
   - Keep `--bg`/`--surface-*`/`--border*`/`--text-*` as-is for the same
     "soft sky" look, or adjust to taste — they're intentionally subtle.
   - Keep `--good`/`--warn`/`--bad` reserved for *state only* (a value is
     on-target / borderline / off-target) — never use them decoratively
     elsewhere, or they stop being meaningful at a glance.
   - Replace the `--<pillar>-a`/`--<pillar>-b` pairs with one gradient
     pair per data category in your own dashboard (e.g. a finance
     dashboard might have `--spending`, `--savings`, `--income` instead
     of `--nutrition`, `--sleep`, `--training`). Each pillar keeps the
     *same* two colors everywhere it appears (tile, ring, chart line,
     dot) — that repetition is what makes the whole dashboard read as
     one system instead of an assortment of screens.
4. Build your Overview page as a `.grid` of `.tile` elements (see
   `dashboard.css` for the exact markup pattern used) — keep the tile
   count a multiple of the column count (3 by default) so the grid
   doesn't end with an orphaned tile and a visible gap.
5. For each tile's detail view, render into the shared `.modal-backdrop`
   / `.modal-panel` on click, using `.dgrid`/`.dpanel` for the two-column
   metric layout inside — don't build a separate modal per pillar.
6. If you add charts, vendor Chart.js locally (`npm install chart.js`,
   copy `dist/chart.umd.js` into your assets dir) rather than pulling
   from a CDN, unless your deployment target allows external scripts —
   this keeps the dashboard workable behind restrictive network policies.
7. **Cache-busting**: bump the `?v=<date>-<n>` query string on the CSS/JS
   `<link>`/`<script>` tags in your HTML every time either file changes.
   Static-file hosts (GitHub Pages, S3, etc.) and mobile browsers cache
   aggressively; without a version bump, users can silently keep seeing a
   stale copy after a deploy.

## Design vocabulary (component class reference)

| Class | Purpose |
|---|---|
| `.wrap` | Page-level max-width container (1180px) |
| `.grid` / `.tile` | The Overview bento grid and its tappable tiles |
| `.tile.tap:hover` | Hover affordance for tappable tiles (lift + border) |
| `.section-eyebrow` | Small uppercase label above a page section ("Today", "Insights") |
| `.hero` | Large highlight card, typically top-of-page summary |
| `.strip` / `.pill` | Horizontal scrollable row of small stat pills |
| `.panel` / `.panel.span` | Generic full-width or grid-column-spanning card |
| `.dgrid` / `.dpanel` | Two-column responsive layout used *inside* detail modals |
| `.metric` / `.track` / `.fill` | A labeled progress bar (consumed vs. target) |
| `.bignum` | Large numeral display (e.g. "8.2 <small>h</small>") |
| `.chips` / `.chip` | Small stat chips in a row or `.chips.four` 2x2/4-up grid |
| `.evul` | "Event/value" list — bordered list rows with a bold label |
| `table.datatable` | Sticky-header data table |
| `.modal-backdrop` / `.modal-panel` | Tap-through detail view container |
| `.alert-row` | Left-bordered callout for warnings/notes |
| `.empty-state` | Centered muted message for panels with no data yet |

See `dashboard.css` for the exact CSS behind each of these, and
`index-skeleton.html` plus the original WorkoutOmer `docs/app.js` (if you
have access to that repo) for real markup-generation examples — the
classes are designed to be built as template strings from JS, not
hand-written per page.

## Rationale (why these choices)

- **Light-only, no dark mode**: one design fully realized beats two half
  ones — this was a deliberate scope cut in the original project after
  comparing a dark and light pass side by side.
- **Fixed per-pillar color identity**: using the same two-color gradient
  for "Sleep" (for example) in the tile, the ring, and every chart line
  builds instant pattern recognition — you don't have to relearn what a
  color means on every new screen.
- **Status colors reserved for state**: green/amber/red mean "on target /
  borderline / off target" and nothing else, so they stay meaningful
  wherever they appear.
- **Tap-tile-to-open-modal over full navigation**: keeps the user on one
  mental "page" (Overview) while still allowing deep detail per category,
  and avoids building N separate full-page layouts.
- **No build step, no required CDN**: works from a plain static file
  host with zero tooling and no external network dependency — useful
  when the deployment target has restricted egress or you just want
  something that keeps working in 5 years without a `package.json`
  upgrade treadmill.
