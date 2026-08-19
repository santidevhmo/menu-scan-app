// Applies Santiago's 2026-08-16 accompaniment-weight rulings to the weighted
// oracle, recomputing each entry's totals from its own ingredients.
//
// SELF-CHECKING BY DESIGN: it first recomputes EVERY entry from its ingredients
// and refuses to write unless the recomputed totals reproduce the stored ones.
// An oracle edit that silently changes the arithmetic as well as the input is
// how a benchmark stops measuring what it claims to (lesson 28).
//
// The rulings, and their basis:
//   chimichurri  30 g -> 15 g   USDA spooned-on-food amounts (tablespoon 16-17 g,
//                               sandwich guideline 17 g). The 30 g the model
//                               returns is USDA's DIPPING-CONTAINER portion.
//   baguette     45 g -> 15 g   one slice, from USDA's 324 g / 22" baguette.
//   beans        80 g -> 30 g   Santiago's judgement, the midpoint of his ruled
//                               25-35 g. USDA publishes 130 g but that is beans
//                               AS THE FOOD; there is no published side-of-plate
//                               portion, and the composite recipes give none.
//
// NOT APPLIED, and deliberately: switching the bean record from `Pinto beans,
// from canned, no added fat` to `Refried beans, from fast food / restaurant`
// (177 kcal/100 g, fat 9.48). That is a COMPOSITION change and Santiago has
// ruled the weights only. Left for a separate ruling.
//
//   deno run --allow-read --allow-write scripts/apply-accompaniment-rulings.ts

const PATH = "scripts/fixtures/macro-oracle.json";

interface Ing {
  name: string;
  grams: number;
  per_100g: { calories: number; protein_g: number; carb_g: number; fat_g: number };
}
interface Entry {
  name: string;
  oracle: {
    calories: number;
    protein_g: number;
    carb_g: number;
    fat_g: number;
    assumed?: string;
    ingredients: Ing[];
  };
}

/** The same arithmetic as usda-oracle.ts's sumRecipe: per_100g x grams / 100. */
function sumRecipe(ings: Ing[]) {
  return ings.reduce(
    (t, i) => ({
      calories: t.calories + i.per_100g.calories * i.grams / 100,
      protein_g: t.protein_g + i.per_100g.protein_g * i.grams / 100,
      carb_g: t.carb_g + i.per_100g.carb_g * i.grams / 100,
      fat_g: t.fat_g + i.per_100g.fat_g * i.grams / 100,
    }),
    { calories: 0, protein_g: 0, carb_g: 0, fat_g: 0 },
  );
}

/** dish -> ingredient name fragment -> new grams */
const RULINGS: { dish: string; match: string; grams: number; note: string }[] = [
  { dish: "NEW YORK", match: "Olive oil", grams: 8.5, note: "chimichurri 30 -> 15 g" },
  { dish: "NEW YORK", match: "Parsley", grams: 6.5, note: "chimichurri 30 -> 15 g" },
  { dish: "Salmone toscano", match: "French or Vienna bread", grams: 15, note: "baguette 45 -> 15 g" },
  { dish: "PASTEL AZTECA", match: "Pinto beans", grams: 30, note: "beans 80 -> 30 g" },
];

const entries: Entry[] = JSON.parse(await Deno.readTextFile(PATH));

// ---- 1. prove the arithmetic reproduces what is already shipped -------------
let drift = 0;
for (const e of entries) {
  if (!e.oracle?.ingredients?.length) continue;
  const got = sumRecipe(e.oracle.ingredients);
  for (const k of ["calories", "protein_g", "carb_g", "fat_g"] as const) {
    // 0.01 absolute: the file stores full float precision, so anything larger
    // means this script's arithmetic is NOT the one that built the oracle.
    if (Math.abs(got[k] - e.oracle[k]) > 0.01) {
      console.error(
        `DRIFT ${e.name} ${k}: stored ${e.oracle[k]}, recomputed ${got[k].toFixed(3)}`,
      );
      drift++;
    }
  }
}
if (drift > 0) {
  console.error(
    `\nREFUSING TO WRITE - ${drift} field(s) do not reproduce. This script's` +
      ` arithmetic is not the oracle's; fix that before changing any weight.`,
  );
  Deno.exit(1);
}
console.log(`✓ recomputed ${entries.length} entries from their ingredients, all reproduce\n`);

// ---- 2. apply the rulings ---------------------------------------------------
for (const r of RULINGS) {
  const e = entries.find((x) => x.name.startsWith(r.dish));
  if (!e) throw new Error(`dish not found: ${r.dish}`);
  const ing = e.oracle.ingredients.find((i) => i.name.includes(r.match));
  if (!ing) throw new Error(`ingredient not found: ${r.dish} / ${r.match}`);
  console.log(
    `${e.name.slice(0, 24).padEnd(26)} ${ing.name.slice(0, 30).padEnd(32)} ` +
      `${String(ing.grams).padStart(5)} -> ${String(r.grams).padStart(5)} g   ${r.note}`,
  );
  ing.grams = r.grams;
}

// ---- 3. recompute totals AND rewrite the provenance note --------------------
// The `assumed` text is the only record of WHY a number is what it is. Leaving
// it saying "the baguette sits outside at 45 g" after changing that 45 would put
// a false provenance in the one place a future session goes to check.
const NOTE: Record<string, string> = {
  "NEW YORK":
    " RE-RULED 2026-08-16 (Santiago): the chimichurri was 30 g and is now 15 g." +
    " 30 g is USDA's DIPPING-CONTAINER portion; a sauce spooned onto food is" +
    " published at 9-17 g (1 tbsp 16-17 g, guideline amount on a regular sandwich" +
    " 17 g). Held at 57% oil, so 8.5 g oil + 6.5 g parsley. Total eaten 415 g.",
  "Salmone toscano":
    " RE-RULED 2026-08-16 (Santiago): the baguette was 45 g and is now 15 g." +
    " USDA publishes a 22-inch baguette at 324 g, so ~15 g per inch - one slice." +
    " 45 g was about three slices. Total eaten 215 g.",
  "PASTEL AZTECA":
    " RE-RULED 2026-08-16 (Santiago): the beans were 80 g and are now 30 g, the" +
    " midpoint of his ruled 25-35 g. ⚠️ THIS IS A JUDGEMENT, NOT USDA-BACKED:" +
    " USDA publishes 130 g for this record, but that is beans AS THE FOOD, and" +
    " there is no published side-of-a-plate portion (the composite recipes give" +
    " none either). Santiago: USDA is describing a main dish, not a side." +
    " ⚠️ STILL OPEN, separate ruling: the record is `Pinto beans, from canned, no" +
    " added fat` (137 kcal/100 g) where a restaurant serves refried beans - FDC" +
    " 2707397 `Refried beans, from fast food / restaurant` is 177 kcal/100 g at" +
    " 9.48 g fat. Composition was NOT changed here; only the weight was ruled.",
};

console.log("");
for (const e of entries) {
  if (!RULINGS.some((r) => e.name.startsWith(r.dish))) continue;
  const before = { ...e.oracle };
  const got = sumRecipe(e.oracle.ingredients);
  Object.assign(e.oracle, got);
  const key = Object.keys(NOTE).find((k) => e.name.startsWith(k))!;
  if (!e.oracle.assumed?.includes("RE-RULED 2026-08-16")) {
    e.oracle.assumed = (e.oracle.assumed ?? "") + NOTE[key];
  }
  console.log(
    `${e.name.slice(0, 24).padEnd(26)} ${before.calories.toFixed(0)} -> ` +
      `${got.calories.toFixed(0)} kcal   fat ${before.fat_g.toFixed(1)} -> ` +
      `${got.fat_g.toFixed(1)} g`,
  );
}

await Deno.writeTextFile(PATH, `${JSON.stringify(entries, null, 2)}\n`);
console.log(`\nwritten to ${PATH}`);
