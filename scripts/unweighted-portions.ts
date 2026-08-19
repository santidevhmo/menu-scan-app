// Reads PUBLISHED portion weights for a dish's candidate records and prints the
// spread, so a mass band can be read off verifiable data rather than invented.
//
// Santiago, 2026-08-11: "The grams of the menu items missing grams and/or size
// should be cross-checked via USDA, FDC, or any other verifiable source to get
// their average size to use for the oracle."
//
// Writes NOTHING. Selection stays a human decision.
//
//   deno run --allow-net --allow-env --env-file=.env.local scripts/unweighted-portions.ts
//   deno run ... scripts/unweighted-portions.ts 170715 173292   # ad-hoc ids

const key = Deno.env.get("USDA_FDC_API_KEY");
if (!key) throw new Error("USDA_FDC_API_KEY is required in .env.local");

/** Candidate records per dish, chosen for dish-type match. Santiago rules. */
const DISHES: { dish: string; note: string; ids: number[] }[] = [
  {
    dish: "CAPRICCIOSA (28 cm pizza)",
    note: "whole-pie portions, scaled by area to 28 cm",
    ids: [172055, 172049, 173292, 172047, 172096],
  },
  {
    dish: "ENSALADA GRIEGA",
    note: "composite salad portions, plus dressing served alongside",
    ids: [2709830, 2710195],
  },
  {
    dish: "CARBONARA",
    note: "restaurant pasta in cream sauce, as served",
    ids: [2708855],
  },
  {
    dish: "Salmon Roll",
    note: "sushi as served; a roll order is several pieces",
    ids: [2708422, 2709988],
  },
  {
    dish: "Tiras de Pollo",
    note: "breaded fried chicken plus the fries served with it",
    ids: [170756, 2709469],
  },
  {
    dish: "Coliflor Roka",
    note: "cooked cauliflower as a side",
    ids: [169986, 2709172],
  },
];

/** Area ratio of the menu's stated size to a reference diameter. */
const areaRatio = (statedCm: number, referenceCm: number) =>
  (statedCm / referenceCm) ** 2;

async function food(fdcId: number) {
  const res = await fetch(
    `https://api.nal.usda.gov/fdc/v1/food/${fdcId}?api_key=${key}`,
  );
  if (!res.ok) return null;
  return await res.json();
}

/**
 * Per-100 g protein/carb/fat for a record. deriveBands multiplies the mass band
 * by ONE composition, so a dish assembled from two records (a salad and its
 * dressing, chicken and its fries) needs these blended by mass - and the blend
 * is a judgement that goes in `assumed`, not a silent average.
 */
// deno-lint-ignore no-explicit-any
function per100g(f: any): { protein: number; carb: number; fat: number } | null {
  const want: Record<string, keyof { protein: 0; carb: 0; fat: 0 }> = {
    "203": "protein",
    "204": "fat",
    "205": "carb",
  };
  const out = { protein: NaN, carb: NaN, fat: NaN };
  // deno-lint-ignore no-explicit-any
  for (const n of (f.foodNutrients ?? []) as any[]) {
    const num = String(n.nutrient?.number ?? n.nutrientNumber ?? "");
    const key = want[num];
    if (key) out[key] = Number(n.amount ?? n.value ?? NaN);
  }
  return Number.isFinite(out.protein) && Number.isFinite(out.carb) &&
      Number.isFinite(out.fat)
    ? out
    : null;
}

// --search lets a candidate be FOUND rather than guessed. The committed list
// already contains one wrong record (a canned-orange id under Coliflor Roka) and
// one wrong dish type (cheese fries where the menu prints plain papas fritas),
// which is what guessing ids costs.
if (Deno.args[0] === "--search") {
  const terms = Deno.args.slice(1).join(" ");
  if (!terms) throw new Error("--search needs search terms");
  const res = await fetch(
    `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${key}&query=${
      encodeURIComponent(terms)
    }&pageSize=12`,
  );
  if (!res.ok) throw new Error(`FDC search ${res.status}`);
  const { foods = [] } = await res.json();
  console.log(`"${terms}" — ${foods.length} results\n`);
  // deno-lint-ignore no-explicit-any
  for (const f of foods as any[]) {
    console.log(
      `  ${String(f.fdcId).padStart(8)}  ${f.dataType?.padEnd(14) ?? ""} ${f.description}`,
    );
  }
  console.log("\nNothing was written. Santiago rules on the record.");
  Deno.exit(0);
}

const ids = Deno.args.map(Number).filter(Number.isInteger);
const targets = ids.length > 0
  ? [{ dish: `ad-hoc`, note: "", ids }]
  : DISHES;

for (const { dish, note, ids } of targets) {
  console.log(`\n${"=".repeat(72)}\n${dish}`);
  if (note) console.log(`  (${note})`);
  const weights: number[] = [];
  for (const id of ids) {
    const f = await food(id);
    if (!f) {
      console.log(`  ${id}: NOT FOUND`);
      continue;
    }
    console.log(`\n  ${id} — ${f.description}`);
    const comp = per100g(f);
    console.log(
      comp
        ? `    per 100 g: protein ${comp.protein} g, carb ${comp.carb} g, fat ${comp.fat} g ` +
          `(${Math.round(4 * comp.protein + 4 * comp.carb + 9 * comp.fat)} kcal)`
        : "    per 100 g: NOT PUBLISHED",
    );
    // deno-lint-ignore no-explicit-any
    const portions = (f.foodPortions ?? []) as any[];
    if (portions.length === 0) {
      console.log("    no published portion — mass must be recipe-derived");
      continue;
    }
    for (const p of portions) {
      const label =
        `${p.amount ?? ""} ${p.measureUnit?.name ?? ""} ${p.modifier ?? p.portionDescription ?? ""}`
          .replace(/\s+/g, " ").trim();
      console.log(`    ${String(p.gramWeight).padStart(7)} g   ${label}`);
      weights.push(p.gramWeight);
    }
  }
  if (weights.length > 0) {
    const sorted = [...weights].sort((a, b) => a - b);
    console.log(
      `\n  published portions span ${sorted[0]}–${sorted[sorted.length - 1]} g ` +
        `across ${sorted.length} entries`,
    );
  }
}

console.log(
  `\n${"=".repeat(72)}\n` +
    `A 28 cm pizza is ${(areaRatio(28, 35.56) * 100).toFixed(0)}% of a 14" by area, ` +
    `${(areaRatio(28, 30.48) * 100).toFixed(0)}% of a 12".\n` +
    `Nothing was written. Santiago rules on the record, the grams, and both endpoints.`,
);
