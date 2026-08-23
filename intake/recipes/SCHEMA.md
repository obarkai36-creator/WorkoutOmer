# Recipe library schema

One JSON file per recipe in `intake/recipes/`, named `<id>.json`. The analyzer
(Claude) fills these in when you drop a recipe — a link, a caption/screenshot
from an Instagram Reel or Facebook video, an online recipe, or a family recipe.
Scoring follows `intake/references/nutrition_lenses.json` (the dual-lens rubric).

Render the library with `python3 intake/generate_recipe_card.py` → writes
`intake/recipes/library.html` (dark-mode card view matching the dashboards).

## Fields

```jsonc
{
  "id": "chicken_meatballs_veg",        // slug, matches filename
  "name": "Chicken & hidden-veg meatballs",
  "source": {
    "type": "family",                   // family | instagram | facebook | web | other
    "url": null,                        // link if any
    "author": "Family recipe",
    "captured": "2026-08-04",           // when analyzed
    "notes": "How it was captured (pasted caption, screenshot, fetched, dictated)"
  },
  "servings": 8,
  "serving_desc": "≈160 g cooked (one scoop of the batch)",
  "serving_g": 160,                     // grams in one serving — REQUIRED for the per-100g card
  "ingredients": [
    {"item": "ground chicken", "qty": "1 kg", "note": "lean"},
    {"item": "sweet potato", "qty": "1 medium, grated"}
  ],
  "steps": ["Fry onion...", "Mix, rest 1h...", "Pan-fry medium heat..."],  // source method (as given)
  "meal_type": "Chicken",               // Chicken | Fish | Beef | Snack | Dessert — drives the library filter/TOC
  "cooking_guide": [                    // best-practice easy steps (seasoning + texture); for cook-yourself recipes
    "Pat the chicken dry and season boldly...",
    "Sear undisturbed until it releases; rest 5 min before slicing..."
  ],

  "per_serving": {                      // best estimate unless label-verified
    "kcal": 210, "protein_g": 24, "carbs_g": 9, "fat_g": 9, "fiber_g": 1.5,
    "micros": {                         // only nutrients meaningfully present; omit unknowns
      "zinc_mg": 1.6, "selenium_mcg": 18, "folate_mcg_dfe": 30,
      "iron_mg": 1.4, "choline_mg": 60, "vitamin_c_mg": 4
    }
  },
  "confidence": "estimate",             // estimate | measured | label-verified

  "analysis": {
    "him": {                            // weight loss / muscle retention / sperm
      "fit_score": 8,                   // 0-10 per nutrition_lenses.json scale
      "verdict": "High-protein, hidden veg, low sugar — strong cutting meal.",
      "flags": ["high protein density", "moderate zinc/selenium"],
      "suggested_mods": ["Swap breadcrumbs for oat bran to add fiber",
                         "Serve over a big salad for lycopene + fiber"]
    },
    "her_preconception": {              // PORTABLE — paste this block into lihitrack
      "fit_score": 7,
      "verdict": "Good lean protein + iron + choline from egg. Low folate as-is.",
      "prenatal_highlights": ["iron from chicken", "choline from egg"],
      "safety_advisories": [],          // advisory flags per the rubric; [] if none
      "suggested_mods": ["Add a handful of spinach to the mix for folate + more iron"]
    }
  },

  "tags": ["dinner", "high-protein", "meal-prep", "batch"],
  "adopted": false,                     // true once it's in the daily rotation
  "created": "2026-08-04",
  "updated": "2026-08-04"
}
```

## Notes on values
- Values are **stored per serving** but the rendered card **always displays them
  per 100 g** (with a "one typical serving ≈ Xg" reference), so the user decides
  their own portion. This requires `serving_g` on every recipe — the generator
  converts with `factor = 100 / serving_g`. If `serving_g` is missing it falls
  back to per-serving display.
- `per_serving` macros are best estimates unless a label or a weighed batch is
  available — set `confidence` accordingly, same discipline as `foods.json`.
- Only list micros that are actually meaningful in the dish; omit unknowns
  rather than guessing zeros.
- Once a recipe is `adopted`, it can be logged fast in a daily intake file the
  same way a `foods.json` item is — reference it by name + servings eaten.
- The `her_preconception` block is deliberately self-contained so it can be
  copy-pasted straight into the separate `lihitrack` session.
