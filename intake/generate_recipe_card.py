#!/usr/bin/env python3
"""Render the recipe library (intake/recipes/*.json) into a dark-mode HTML page.

Each recipe is analyzed through two lenses (see references/nutrition_lenses.json):
  - him: weight loss / muscle retention / sperm optimization
  - her_preconception: portable prenatal block (copied into the 'lihitrack' project)

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

# House style tokens (match generate_dashboard.py)
CSS = """
  :root { --bg:#0b0f17; --panel:#131a26; --panel2:#0f1622; --line:#1f2a3a;
          --text:#e6edf3; --muted:#8b9bb0; --accent:#38bdf8;
          --him:#38bdf8; --her:#f472b6; --good:#22c55e; --warn:#f59e0b; --bad:#ef4444; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--text);
         font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
         line-height:1.45; padding:24px; }
  h1 { font-size:22px; margin:0 0 4px; }
  .sub { color:var(--muted); font-size:13px; margin-bottom:20px; }
  .card { background:var(--panel); border:1px solid var(--line); border-radius:14px;
          padding:18px 20px; margin:0 auto 22px; max-width:820px; }
  .rtitle { font-size:18px; font-weight:700; margin:0; }
  .badges { margin:8px 0 2px; }
  .badge { display:inline-block; font-size:11px; padding:2px 8px; border-radius:999px;
           background:var(--panel2); border:1px solid var(--line); color:var(--muted); margin:0 6px 6px 0; }
  .badge.src { color:var(--accent); border-color:var(--accent); }
  .badge.adopted { color:var(--good); border-color:var(--good); }
  .badge.tag { color:var(--muted); }
  .meta { color:var(--muted); font-size:12px; margin:4px 0 12px; }
  .macros { display:flex; flex-wrap:wrap; gap:8px; margin:10px 0 14px; }
  .m { flex:1 1 90px; background:var(--panel2); border:1px solid var(--line);
       border-radius:10px; padding:8px 10px; text-align:center; }
  .m .v { font-size:17px; font-weight:800; }
  .m .l { font-size:10px; color:var(--muted); text-transform:uppercase; letter-spacing:.04em; }
  .micros { font-size:12px; color:var(--muted); margin:0 0 14px; }
  .micros b { color:var(--text); }
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
  .ingredients { font-size:12.5px; color:var(--muted); }
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


def macro_tiles(ps):
    tiles = [
        ("kcal", ps.get("kcal")),
        ("protein", ps.get("protein_g"), "g"),
        ("carbs", ps.get("carbs_g"), "g"),
        ("fat", ps.get("fat_g"), "g"),
        ("fiber", ps.get("fiber_g"), "g"),
    ]
    out = []
    for t in tiles:
        label = t[0]
        val = t[1]
        unit = t[2] if len(t) > 2 else ""
        if val is None:
            continue
        out.append(f"<div class='m'><div class='v'>{val:g}{unit}</div><div class='l'>{escape(label)}</div></div>")
    return "<div class='macros'>" + "".join(out) + "</div>"


def micro_line(micros):
    if not micros:
        return ""
    parts = [f"<b>{v:g}</b> {escape(k.replace('_', ' '))}" for k, v in micros.items()]
    return "<div class='micros'>Per serving: " + " · ".join(parts) + "</div>"


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


def render_card(r):
    src = r.get("source", {})
    src_type = src.get("type", "other")
    html = ["<div class='card'>"]
    html.append(f"<div class='rtitle'>{escape(r.get('name', r['id']))}</div>")

    badges = [f"<span class='badge src'>{escape(src_type)}</span>"]
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
    html.append(macro_tiles(ps))
    html.append(micro_line(ps.get("micros")))

    ing = r.get("ingredients")
    if ing:
        names = ", ".join(escape(i["item"]) for i in ing if isinstance(i, dict) and i.get("item"))
        html.append(f"<div class='ingredients'><b style='color:var(--text)'>Ingredients:</b> {names}</div>")

    a = r.get("analysis", {})
    html.append("<div class='lens' style='margin-top:14px'>")
    html.append(lens_pane("him", a.get("him"), "weight loss · muscle retention · sperm"))
    html.append(lens_pane("her", a.get("her_preconception"), "preconception / prenatal (advisory)", copyable=True))
    html.append("</div>")

    html.append("</div>")
    return "".join(html)


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


def page(title, cards_html):
    return (f"<!doctype html><html><head><meta charset='utf-8'>"
            f"<meta name='viewport' content='width=device-width,initial-scale=1'>"
            f"<title>{escape(title)}</title><style>{CSS}</style></head><body>"
            f"<h1>{escape(title)}</h1>"
            f"<div class='sub'>Dual-lens recipe analysis · scored per intake/references/nutrition_lenses.json</div>"
            f"{cards_html}</body></html>")


def main():
    if len(sys.argv) > 1:
        rid = sys.argv[1]
        f = RECIPES_DIR / f"{rid}.json"
        if not f.exists():
            print(f"No recipe: {f}", file=sys.stderr)
            sys.exit(1)
        r = json.loads(f.read_text())
        out = RECIPES_DIR / f"{rid}.html"
        out.write_text(page(r.get("name", rid), render_card(r)))
        print(f"Wrote {out}")
        return

    recipes = load_recipes()
    if not recipes:
        print("No recipes found in intake/recipes/. Add <id>.json files (see SCHEMA.md).")
        return
    cards = "".join(render_card(r) for r in recipes)
    out = RECIPES_DIR / "library.html"
    out.write_text(page(f"Recipe library ({len(recipes)})", cards))
    print(f"Wrote {out} ({len(recipes)} recipe(s))")


if __name__ == "__main__":
    main()
