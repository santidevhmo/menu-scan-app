// Surveys USDA FDC candidates for an oracle recipe ingredient. $0 - the FDC API
// is free and public domain.
//
// Prints the SPREAD, never just the top hit: the Caesar-dressing episode cost
// six runs because the richest defensible entry was taken (57.8 g fat/100 g,
// against a median of 36.7) and made the model look wrong. Pick near the median
// of real products.
//
// Run: deno run --env-file=.env.local --allow-env --allow-net \
//        scripts/usda-candidates.ts "sushi rice cooked" "imitation crab"
import { searchFoods } from "./usda-oracle.ts";

if (import.meta.main) {
  const key = Deno.env.get("USDA_FDC_API_KEY")!;
  for (const query of Deno.args) {
    const hits = (await searchFoods(query, key)).slice(0, 6);
    console.log(`\n## ${query}`);
    for (const h of hits) {
      console.log(
        `  ${h.fdc_id}  ${
          h.description.slice(0, 56).padEnd(56)
        } ${h.data_type}`,
      );
    }
  }
}
