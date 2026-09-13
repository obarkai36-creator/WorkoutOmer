# Pre-redesign snapshot (2026-09-13)

Exact copies of `docs/index.html`, `docs/app.js`, and `docs/style.css` as
they stood immediately before the bento-dashboard redesign implementation
began (last real commit before this snapshot: `4411ca6`, "Add missing
sleep trend chart to the Sleep tile's own detail view" — that's the
concept-mockup work, not a change to these files themselves).

Kept in case the redesign drops or changes something worth reverting to.
Not linked from the live site nav — this folder is a reference archive
only, safe to ignore during normal use.

`docs/vendor/chart.umd.js` is unchanged by the redesign and shared, so it
isn't duplicated here — the archived `app.js` still expects
`vendor/chart.umd.js` one level up if you ever want to run this snapshot
standalone (copy it alongside, or run from `docs/` with these three files
swapped back in).

To restore for real (not just reference): copy these three files back
over their `docs/` counterparts, or use git history directly —
`git log -- docs/app.js` to find the last commit before the redesign and
`git show <commit>:docs/app.js > docs/app.js` (same for the other two).
