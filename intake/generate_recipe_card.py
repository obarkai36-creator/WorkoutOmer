#!/usr/bin/env python3
"""Render the recipe library (intake/recipes/*.json) into a dark-mode HTML page.

Each recipe is analyzed through two lenses (see references/nutrition_lenses.json):
  - him: weight loss / muscle retention / sperm optimization
  - her_preconception: portable prenatal block (copied into the 'lihitrack' project)

The full library page (library.html) has a filter/sort table of contents by meal
type (Chicken, Fish, Beef, Snack, Dessert). Individual recipe cards show a
best-practice cooking_guide (easy steps, seasoning + texture tips) when present.

Usage:
  python3 generate_recipe_card.py                # render whole library -> recipes/library.html
  python3 generate_recipe_card.py <recipe_id>    # render a single recipe -> recipes/<id>.html
"""
import json
import sys
from html import escape
from pathlib import Path

HERE = Path(__file__).resolve().parent
RECIPES_DIR = HERE / "recipes"

# Order meal types appear in the TOC / filter chips
MEAL_ORDER = ["Chicken", "Fish", "Beef", "Bread", "Snack", "Dessert", "Other"]

# House style tokens (match generate_dashboard.py) — deliberately single-theme dark,
# consistent with the project's other dashboards.
CSS = """
  :root { --bg:#0b0f17; --panel:#131a26; --panel2:#0f1622; --line:#1f2a3a;
          --text:#e6edf3; --muted:#8b9bb0; --accent:#38bdf8;
          --him:#38bdf8; --her:#f472b6; --good:#22c55e; --warn:#f59e0b; --bad:#ef4444; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--text);
         font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
         line-height:1.45; padding:24px; }
  .wrap { max-width:860px; margin:0 auto; }
  h1 { font-size:22px; margin:0 0 4px; }
  .sub { color:var(--muted); font-size:13px; margin-bottom:20px; }
  .toc { background:var(--panel); border:1px solid var(--line); border-radius:14px;
         padding:16px 20px; margin:0 0 22px; }
  .chips { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:4px; }
  .chip { cursor:pointer; font-size:13px; padding:6px 14px; border-radius:999px;
          background:var(--panel2); border:1px solid var(--line); color:var(--muted); user-select:none; }
  .chip.active { color:var(--bg); background:var(--accent); border-color:var(--accent); font-weight:700; }
  .chip:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
  .toc-group { margin-top:14px; }
  .toc-group h3 { font-size:12px; text-transform:uppercase; letter-spacing:.06em;
                  color:var(--accent); margin:0 0 6px; }
  .toc-list { list-style:none; padding:0; margin:0; }
  .toc-list li { margin:4px 0; font-size:13px; display:flex; gap:8px; align-items:baseline; }
  .toc-list a { color:var(--text); text-decoration:none; }
  .toc-list a:hover { text-decoration:underline; }
  .toc-dot { color:var(--good); font-size:11px; }
  .toc-score { color:var(--muted); font-size:11px; font-variant-numeric:tabular-nums; margin-left:auto; white-space:nowrap; }
  .card { background:var(--panel); border:1px solid var(--line); border-radius:14px;
          padding:18px 20px; margin:0 0 22px; scroll-margin-top:16px; }
  .rtitle { font-size:18px; font-weight:700; margin:0; }
  .badges { margin:8px 0 2px; }
  .badge { display:inline-block; font-size:11px; padding:2px 8px; border-radius:999px;
           background:var(--panel2); border:1px solid var(--line); color:var(--muted); margin:0 6px 6px 0; }
  .badge.src { color:var(--accent); border-color:var(--accent); }
  .badge.adopted { color:var(--good); border-color:var(--good); }
  .badge.meal { color:var(--text); border-color:var(--muted); font-weight:700; }
  .badge.tag { color:var(--muted); }
  .meta { color:var(--muted); font-size:12px; margin:4px 0 12px; }
  .basis { font-size:12px; color:var(--text); margin:12px 0 6px; }
  .basis b { color:var(--accent); }
  .macros { display:flex; flex-wrap:wrap; gap:8px; margin:6px 0 14px; }
  .m { flex:1 1 90px; background:var(--panel2); border:1px solid var(--line);
       border-radius:10px; padding:8px 10px; text-align:center; }
  .m .v { font-size:17px; font-weight:800; }
  .m .l { font-size:10px; color:var(--muted); text-transform:uppercase; letter-spacing:.04em; }
  .micros { font-size:12px; color:var(--muted); margin:0 0 14px; }
  .micros b { color:var(--text); }
  .ingredients { font-size:12.5px; color:var(--muted); }
  .cookwrap { display:grid; grid-template-columns:minmax(190px,1fr) 1.5fr; gap:14px;
              margin:14px 0 2px; align-items:start; }
  @media (max-width:680px){ .cookwrap { grid-template-columns:1fr; } }
  .ingr, .cook { background:var(--panel2); border:1px solid var(--line); border-radius:12px;
                 padding:12px 16px 14px; margin:0; }
  .ingr h4, .cook h4 { margin:0 0 8px; font-size:13px; color:var(--text); }
  .ingr ul { list-style:none; margin:0; padding:0; }
  .ingr li { font-size:12.5px; margin:0; padding:6px 0; border-bottom:1px solid var(--line);
             display:flex; justify-content:space-between; gap:12px; align-items:baseline; }
  .ingr li:last-child { border-bottom:none; }
  .ingr .name { color:var(--muted); flex:1 1 auto; }
  .ingr .qty { color:var(--accent); font-weight:700; text-align:right; flex:0 1 45%;
               font-variant-numeric:tabular-nums; }
  .ingr .inote { display:block; color:var(--muted); font-size:11px; font-style:italic; margin-top:2px; }
  .cook ol { margin:0; padding-left:20px; }
  .cook ol li { font-size:12.5px; margin:5px 0; }
  .lens { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
  @media (max-width:680px){ .lens { grid-template-columns:1fr; } }
  .pane { background:var(--panel2); border:1px solid var(--line); border-radius:12px; padding:14px; }
  .pane.him { border-top:3px solid var(--him); }
  .pane.her { border-top:3px solid var(--her); }
  .pane h3 { margin:0 0 2px; font-size:13px; }
  .pane .who { font-size:11px; color:var(--muted); margin-bottom:8px; }
  .score { display:inline-block; font-weight:800; font-size:15px; padding:2px 10px;
           border-radius:8px; background:var(--bg); }
  .verdict { font-size:13px; margin:8px 0; }
  .lbl { font-size:11px; text-transform:uppercase; letter-spacing:.04em; color:var(--muted); margin:10px 0 3px; }
  ul { margin:2px 0 0; padding-left:18px; }
  li { font-size:12.5px; margin:2px 0; }
  .flag { font-size:12px; color:var(--warn); }
  .copyhint { font-size:11px; color:var(--muted); font-style:italic; margin-top:10px; }
  .tmpl { background:var(--panel2); border-left:3px solid var(--accent); border-radius:8px;
          padding:10px 12px; margin:10px 0 4px; font-size:12.5px; }
  .tmpl b { color:var(--text); }
  .tmpl .rule { color:var(--muted); margin-top:4px; }
"""


def score_color(s):
    if s is None:
        return "var(--muted)"
    if s >= 7:
        return "var(--good)"
    if s >= 4:
        return "var(--warn)"
    return "var(--bad)"


def _n(v, factor):
    """Scale a value by factor and round for display."""
    x = v * factor
    return round(x) if abs(x) >= 10 else round(x, 1)


def macro_tiles(ps, factor):
    tiles = [
        ("kcal", ps.get("kcal")),
        ("protein", ps.get("protein_g"), "g"),
        ("carbs", ps.get("carbs_g"), "g"),
        ("fat", ps.get("fat_g"), "g"),
        ("fiber", ps.get("fiber_g"), "g"),
    ]
    out = []
    for t in tiles:
        label, val = t[0], t[1]
        unit = t[2] if len(t) > 2 else ""
        if val is None:
            continue
        out.append(f"<div class='m'><div class='v'>{_n(val, factor):g}{unit}</div><div class='l'>{escape(label)}</div></div>")
    return "<div class='macros'>" + "".join(out) + "</div>"


def micro_line(micros, factor):
    if not micros:
        return ""
    parts = [f"<b>{_n(v, factor):g}</b> {escape(k.replace('_', ' '))}" for k, v in micros.items()]
    return "<div class='micros'>Per 100 g: " + " · ".join(parts) + "</div>"


def ingredients_block(r):
    ing = r.get("ingredients")
    if not ing:
        return ""
    rows = []
    for i in ing:
        if not isinstance(i, dict) or not i.get("item"):
            continue
        name = escape(i["item"])
        note = i.get("note")
        note_html = f"<span class='inote'>{escape(note)}</span>" if note else ""
        qty = i.get("qty")
        qty_html = f"<span class='qty'>{escape(qty)}</span>" if qty and qty != "—" else ""
        rows.append(f"<li><span class='name'>{name}{note_html}</span>{qty_html}</li>")
    if not rows:
        return ""
    return f"<div class='ingr'><h4>Ingredients</h4><ul>{''.join(rows)}</ul></div>"


def cooking_section(r):
    guide = r.get("cooking_guide")
    if guide:
        steps = "".join(f"<li>{escape(s)}</li>" for s in guide)
        return (f"<div class='cook'><h4>🍳 Cooking guide — for best taste &amp; texture</h4>"
                f"<ol>{steps}</ol></div>")
    steps = r.get("steps")
    if steps:
        items = "".join(f"<li>{escape(s)}</li>" for s in steps)
        return f"<div class='cook'><h4>Method</h4><ol>{items}</ol></div>"
    return ""


def lens_pane(kind, data, who, copyable=False):
    if not data:
        return ""
    s = data.get("fit_score")
    color = score_color(s)
    html = [f"<div class='pane {kind}'>"]
    html.append(f"<h3>{escape('For him' if kind == 'him' else 'For her')}"
                f" &nbsp;<span class='score' style='color:{color}'>{s if s is not None else '—'}/10</span></h3>")
    html.append(f"<div class='who'>{escape(who)}</div>")
    if data.get("verdict"):
        html.append(f"<div class='verdict'>{escape(data['verdict'])}</div>")

    highlights = data.get("flags") or data.get("prenatal_highlights")
    if highlights:
        html.append("<div class='lbl'>Highlights</div><ul>")
        html += [f"<li>{escape(h)}</li>" for h in highlights]
        html.append("</ul>")

    adv = data.get("safety_advisories")
    if adv:
        html.append("<div class='lbl'>Safety advisories</div><ul>")
        for a in adv:
            if isinstance(a, dict):
                txt = a.get("note", "")
                swap = a.get("swap")
                txt = txt + (f" — swap: {swap}" if swap else "")
            else:
                txt = a
            html.append(f"<li class='flag'>⚠ {escape(txt)}</li>")
        html.append("</ul>")

    mods = data.get("suggested_mods")
    if mods:
        html.append("<div class='lbl'>Suggested modifications</div><ul>")
        html += [f"<li>{escape(m)}</li>" for m in mods]
        html.append("</ul>")

    if copyable:
        html.append("<div class='copyhint'>↑ Copy this block into the lihitrack session.</div>")
    html.append("</div>")
    return "".join(html)


def render_card(r, anchor=False):
    src = r.get("source", {})
    src_type = src.get("type", "other")
    meal = r.get("meal_type", "Other")
    attrs = ""
    if anchor:
        attrs = (f" id='{escape(r['id'])}' data-mealtype='{escape(meal)}'"
                 f" data-adopted='{'1' if r.get('adopted') else '0'}'")
    html = [f"<div class='card'{attrs}>"]
    html.append(f"<div class='rtitle'>{escape(r.get('name', r['id']))}</div>")

    badges = [f"<span class='badge meal'>{escape(meal)}</span>",
              f"<span class='badge src'>{escape(src_type)}</span>"]
    if r.get("adopted"):
        badges.append("<span class='badge adopted'>✓ in rotation</span>")
    for t in r.get("tags", []):
        badges.append(f"<span class='badge tag'>{escape(t)}</span>")
    html.append("<div class='badges'>" + "".join(badges) + "</div>")

    meta = []
    if r.get("servings"):
        meta.append(f"{r['servings']} servings")
    if r.get("serving_desc"):
        meta.append(escape(r["serving_desc"]))
    if r.get("confidence"):
        meta.append(f"macros: {escape(r['confidence'])}")
    if src.get("url"):
        meta.append(f"<a href='{escape(src['url'])}' style='color:var(--accent)'>source</a>")
    html.append("<div class='meta'>" + " · ".join(meta) + "</div>")

    if r.get("template"):
        li = r.get("logged_instance", {})
        inst = ", ".join(f"{k.replace('_', ' ')} <b>{v}</b>"
                         for k, v in li.items() if k not in ("date", "note"))
        html.append("<div class='tmpl'>")
        html.append("<b>Template</b> — chicken &amp; pasta are input per batch.")
        if inst:
            html.append(f"<br>This logged batch: {inst}"
                        + (f" <span style='color:var(--muted)'>({li['date']})</span>" if li.get("date") else ""))
        if r.get("balance_rule"):
            html.append(f"<div class='rule'>⚖ {escape(r['balance_rule'])}</div>")
        html.append("</div>")

    ps = r.get("per_serving", {})
    serving_g = r.get("serving_g")
    if serving_g:
        factor = 100.0 / serving_g
        basis = (f"Values per <b>100 g</b> — you decide the portion "
                 f"<span class='muted'>· one typical serving ≈ {serving_g:g} g</span>")
    else:
        factor = 1.0
        basis = "Values <b>per serving</b> <span class='muted'>· serving weight not set</span>"
    html.append(f"<div class='basis'>{basis}</div>")
    html.append(macro_tiles(ps, factor))
    html.append(micro_line(ps.get("micros"), factor))

    ing_html = ingredients_block(r)
    cook_html = cooking_section(r)
    if ing_html and cook_html:
        # Cooking mode: quantities beside the steps (stacks on narrow screens).
        html.append(f"<div class='cookwrap'>{ing_html}{cook_html}</div>")
    else:
        html.append(ing_html + cook_html)

    a = r.get("analysis", {})
    html.append("<div class='lens' style='margin-top:14px'>")
    html.append(lens_pane("him", a.get("him"), "weight loss · muscle retention · sperm"))
    html.append(lens_pane("her", a.get("her_preconception"), "preconception / prenatal (advisory)", copyable=True))
    html.append("</div>")

    html.append("</div>")
    return "".join(html)


def build_toc(recipes):
    groups = {}
    for r in recipes:
        groups.setdefault(r.get("meal_type", "Other"), []).append(r)
    ordered = [m for m in MEAL_ORDER if m in groups] + [m for m in groups if m not in MEAL_ORDER]

    chips = [f"<button class='chip active' data-type='all' onclick=\"filterCards('all')\">"
             f"All <span class='toc-score'>{len(recipes)}</span></button>"]
    for m in ordered:
        chips.append(f"<button class='chip' data-type='{escape(m)}' onclick=\"filterCards('{escape(m)}')\">"
                     f"{escape(m)} <span class='toc-score'>{len(groups[m])}</span></button>")

    grouplists = []
    for m in ordered:
        items = []
        for r in sorted(groups[m], key=lambda x: (not x.get("adopted"), x.get("name", ""))):
            a = r.get("analysis", {})
            him = a.get("him", {}).get("fit_score")
            her = a.get("her_preconception", {}).get("fit_score")
            dot = "<span class='toc-dot' title='in rotation'>●</span>" if r.get("adopted") else ""
            score = ""
            if him is not None or her is not None:
                score = f"<span class='toc-score'>you {him if him is not None else '–'} · her {her if her is not None else '–'}</span>"
            items.append(f"<li>{dot}<a href='#{escape(r['id'])}'>{escape(r.get('name', r['id']))}</a>{score}</li>")
        grouplists.append(f"<div class='toc-group' data-mealtype='{escape(m)}'>"
                          f"<h3>{escape(m)} ({len(groups[m])})</h3>"
                          f"<ul class='toc-list'>{''.join(items)}</ul></div>")

    return (f"<div class='toc'><div class='chips'>{''.join(chips)}</div>"
            f"{''.join(grouplists)}</div>")


TOC_JS = """
<script>
function filterCards(type){
  document.querySelectorAll('.card').forEach(function(c){
    c.style.display = (type==='all' || c.dataset.mealtype===type) ? '' : 'none';
  });
  document.querySelectorAll('.toc-group').forEach(function(g){
    g.style.display = (type==='all' || g.dataset.mealtype===type) ? '' : 'none';
  });
  document.querySelectorAll('.chip').forEach(function(ch){
    ch.classList.toggle('active', ch.dataset.type===type);
  });
}
</script>
"""


def page(title, sub, body_html, extra_js=""):
    return (f"<!doctype html><html lang='en'><head><meta charset='utf-8'>"
            f"<meta name='viewport' content='width=device-width,initial-scale=1'>"
            f"<title>{escape(title)}</title><style>{CSS}</style></head><body>"
            f"<div class='wrap'><h1>{escape(title)}</h1>"
            f"<div class='sub'>{sub}</div>"
            f"{body_html}</div>{extra_js}</body></html>")


def load_recipes():
    recipes = []
    for f in sorted(RECIPES_DIR.glob("*.json")):
        if f.name.startswith("_"):
            continue
        try:
            recipes.append(json.loads(f.read_text()))
        except json.JSONDecodeError as e:
            print(f"  ! skipping {f.name}: {e}", file=sys.stderr)
    return recipes


def main():
    if len(sys.argv) > 1:
        rid = sys.argv[1]
        f = RECIPES_DIR / f"{rid}.json"
        if not f.exists():
            print(f"No recipe: {f}", file=sys.stderr)
            sys.exit(1)
        r = json.loads(f.read_text())
        out = RECIPES_DIR / f"{rid}.html"
        sub = "Dual-lens recipe analysis · scored per intake/references/nutrition_lenses.json"
        out.write_text(page(r.get("name", rid), sub, render_card(r)))
        print(f"Wrote {out}")
        return

    recipes = load_recipes()
    if not recipes:
        print("No recipes found in intake/recipes/. Add <id>.json files (see SCHEMA.md).")
        return
    adopted = sum(1 for r in recipes if r.get("adopted"))
    sub = (f"{len(recipes)} recipes · {adopted} in rotation · dual-lens scored (you + her preconception). "
           f"Filter by meal type below; ● = in rotation.")
    body = build_toc(recipes) + "".join(render_card(r, anchor=True) for r in recipes)
    out = RECIPES_DIR / "library.html"
    out.write_text(page("Recipe Library", sub, body, extra_js=TOC_JS))
    print(f"Wrote {out} ({len(recipes)} recipe(s), {adopted} adopted)")


if __name__ == "__main__":
    main()
