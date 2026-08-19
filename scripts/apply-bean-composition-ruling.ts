// Applies Santiago's 2026-08-17 ruling on PASTEL AZTECA's beans: the RECORD
// changes from `Pinto beans, from canned, no added fat` to `Refried beans, from
// fast food / restaurant`. The 30 g weight he ruled on 2026-08-16 is unchanged.
//
// This is the composition half that apply-accompaniment-rulings.ts deliberately
// left open ("Composition was NOT changed here; only the weight was ruled").
//
// SELF-CHECKING BY DESIGN, same as its sibling: it recomputes EVERY entry from
// its own ingredients and refuses to write unless the recomputed totals
// reproduce the shipped ones. The arithmetic is imported from usda-oracle.ts
// rather than re-implemented (lesson 28).
//
// WHY THE RESTAURANT RECORD, given the standing "don't pick the richest" rule:
// it is the only FNDDS refried entry whose VENUE axis matches a restaurant
// plate, and venue is the axis that has made this oracle wrong six times. It is
// not a pick from several defensible same-venue records, which is what that rule
// guards against. Values verified live against the FDC API on 2026-08-17.
//
//   deno run --allow-read --allow-write scripts/apply-bean-composition-ruling.ts

import { sumRecipe, type UsdaRecipeIngredient } from "./usda-oracle.ts";

const PATH = "scripts/fixtures/macro-oracle.json";

interface Entry {
  name: string;
  oracle?: {
    calories: number;
    protein_g: number;
    carb_g: number;
    fat_g: number;
    assumed?: string;
    ingredients: UsdaRecipeIngredient[];
  };
}

const DISH = "PASTEL AZTECA";
const MATCH = "Pinto beans";
const NEW = {
  name: "Refried beans, from fast food / restaurant",
  fdc_id: 2707397,
  per_100g: { calories: 177, protein_g: 6.7, carb_g: 16.3, fat_g: 9.48 },
};
const NOTE = " BEAN COMPOSITION RE-RULED 2026-08-17 (Santiago), closing the" +
  " question the 2026-08-16 weight ruling left open. The record was FDC 2707375" +
  " `Pinto beans, from canned, no added fat` (137 kcal/100 g, fat 0.93) and is" +
  " now FDC 2707397 `Refried beans, from fast food / restaurant` (177 kcal/100 g," +
  " protein 6.7, carb 16.3, fat 9.48), verified live against the FDC API." +
  " A restaurant does not spoon plain canned pinto beans onto a plate. The 30 g" +
  " weight is unchanged. AXIS: venue - the same axis that has made this oracle" +
  " wrong six times. Of the FNDDS refried family (generic 90, with meat 99," +
  " reduced-sodium 89, bean dip 119, restaurant 177) this is the richest, which" +
  " the standing rule warns about; it is taken anyway because it is the ONLY" +
  " entry at this dish's venue, not a pick among defensible same-venue records." +
  " ⚠️ NOT PROPAGATED: ENFRIJOLADAS (same menu) keeps FDC 2707396 `Refried beans`" +
  " at 90 kcal for its `salsa de frijol`, because a bean sauce a dish is bathed" +
  " in is a thinner food than a scoop of refried beans beside it. That entry was" +
  " NOT re-ruled and remains as shipped.";

const entries: Entry[] = JSON.parse(await Deno.readTextFile(PATH));

// ---- 1. prove the arithmetic reproduces what is already shipped -------------
let drift = 0;
for (const e of entries) {
  if (!e.oracle?.ingredients?.length) continue;
  const got = sumRecipe(e.oracle.ingredients);
  for (const k of ["calories", "protein_g", "carb_g", "fat_g"] as const) {
    if (Math.abs(got[k] - e.oracle[k]) > 0.01) {
      console.error(`DRIFT ${e.name} ${k}: stored ${e.oracle[k]}, recomputed ${got[k].toFixed(3)}`);
      drift++;
    }
  }
}
if (drift > 0) {
  console.error(
    `\nREFUSING TO WRITE - ${drift} field(s) do not reproduce. This script's` +
      ` arithmetic is not the oracle's; fix that before changing any record.`,
  );
  Deno.exit(1);
}
console.log(`✓ recomputed ${entries.length} entries from their ingredients, all reproduce\n`);

// ---- 2. swap the record -----------------------------------------------------
const entry = entries.find((x) => x.name.startsWith(DISH));
if (!entry?.oracle) throw new Error(`dish not found: ${DISH}`);
const ing = entry.oracle.ingredients.find((i) => i.name.includes(MATCH));
if (!ing) throw new Error(`ingredient not found: ${DISH} / ${MATCH}`);
if (ing.grams !== 30) {
  throw new Error(
    `expected the ruled 30 g on ${DISH}'s beans, found ${ing.grams} g - run` +
      ` apply-accompaniment-rulings.ts first, or re-check the weight ruling.`,
  );
}
console.log(`${ing.name}  (FDC ${ing.fdc_id}, ${ing.per_100g.calories} kcal/100 g)`);
console.log(`  -> ${NEW.name}  (FDC ${NEW.fdc_id}, ${NEW.per_100g.calories} kcal/100 g)`);
console.log(`  grams unchanged at ${ing.grams}\n`);
Object.assign(ing, NEW);

// ---- 3. recompute totals and record the provenance --------------------------
const before = { ...entry.oracle };
Object.assign(entry.oracle, sumRecipe(entry.oracle.ingredients));
if (!entry.oracle.assumed?.includes("BEAN COMPOSITION RE-RULED")) {
  entry.oracle.assumed = (entry.oracle.assumed ?? "") + NOTE;
}
for (const k of ["calories", "protein_g", "carb_g", "fat_g"] as const) {
  console.log(`${k.padEnd(10)} ${before[k].toFixed(2).padStart(8)} -> ${entry.oracle[k].toFixed(2).padStart(8)}`);
}

await Deno.writeTextFile(PATH, `${JSON.stringify(entries, null, 2)}\n`);
console.log(`\nwritten to ${PATH}`);
