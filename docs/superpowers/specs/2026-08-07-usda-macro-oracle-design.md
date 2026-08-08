# USDA Macro Oracle Design

## Purpose

Replace unaided human macro estimates with a reproducible USDA FoodData Central
(FDC) recipe calculation for the Stage-2 benchmark. The oracle remains a
benchmark-only reference: it is not a runtime enrichment lookup, does not ship
to the app, and does not change the production prompt or model pipeline.

## Source policy

- Use USDA FDC only. Open Food Facts is out of scope.
- Use Foundation Foods or FNDDS records for generic ingredients.
- Use USDA Branded Foods only when the menu identifies the exact branded
  ingredient.
- Record the selected FDC ID and whether its portion is raw or cooked.
- An agent may list candidates, but cannot silently select a record or a
  portion. Santiago reviews those assumptions before the oracle is generated.

## Data model

`scripts/fixtures/macro-oracle.json` remains the single human-owned oracle.
Each filled entry contains the existing macro totals plus the recipe inputs that
produced them:

```json
{
  "oracle": {
    "calories": 430,
    "protein_g": 38,
    "carb_g": 14,
    "fat_g": 25,
    "assumed": "USDA FDC recipe; cooked chicken and prepared dressing",
    "source": "USDA FoodData Central",
    "retrieved_at": "2026-08-07",
    "ingredients": [
      {
        "name": "grilled chicken breast",
        "fdc_id": 0,
        "grams": 150,
        "basis": "cooked",
        "per_100g": {
          "calories": 0,
          "protein_g": 0,
          "carb_g": 0,
          "fat_g": 0
        }
      }
    ]
  }
}
```

`per_100g` freezes the FDC nutrients used for the calculation. The benchmark
therefore remains reproducible without a later USDA request; `fdc_id` preserves
the provenance for review. The zero values in the example are illustrative;
they must be replaced by FDC-derived values before an oracle is completed.

## Workflow

1. Search FDC for each menu ingredient and present the candidate records.
2. Santiago approves each selected FDC ID, edible grams, and raw/cooked basis.
3. A benchmark-only helper fetches those exact records with
   `USDA_FDC_API_KEY` from gitignored `.env.local`, projects calories, protein,
   carbs, and fat per 100 g, and writes the reviewed recipe plus calculated
   totals into the oracle.
4. The helper validates the deterministic sum before writing. The existing
   macro runner reads only the completed oracle and never calls USDA.
5. The mirror check and three GPT-4o draws run only after the filled oracle is
   reviewed and paid-run approval is explicit.

## Validation and tests

- Reject a recipe with a missing FDC ID, non-positive grams, unsupported basis,
  or a missing one of the four required nutrients.
- Reject totals that do not equal the ingredient sum within normal rounding.
- Unit-test nutrient projection, raw/cooked-basis preservation, summation, and
  incomplete-source rejection against canned FDC responses. Tests use neither
  the API key nor the network.
- Keep all live FDC use in the oracle-preparation helper. It is free, but every
  live GPT-4o call remains separately approved and archived.

## Success criteria

All three benchmark dishes have USDA-traceable recipes with reviewed portions,
frozen nutrient inputs, deterministic totals, and a short `assumed` statement.
The Stage-2 benchmark then measures GPT-4o against that reference without
changing production behavior.
