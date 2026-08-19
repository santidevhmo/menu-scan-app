// Lists USDA candidates for the six unweighted dishes so Santiago can rule on
// each. Writes NOTHING - selection is a human decision (2026-08-07 oracle
// design, Workflow step 2). Free: FDC calls cost nothing.
//
//   deno run --allow-net --allow-env --env-file=.env.local scripts/unweighted-candidates.ts
//   deno run ... scripts/unweighted-candidates.ts "pizza cheese"   # ad-hoc query

const key = Deno.env.get("USDA_FDC_API_KEY");
if (!key) throw new Error("USDA_FDC_API_KEY is required in .env.local");
const base = "https://api.nal.usda.gov/fdc/v1";

const NUTRIENTS: Record<number, string> = {
  1008: "kcal",
  1003: "protein",
  1005: "carb",
  1004: "fat",
};

/** The six dishes of the 2026-08-11 spec, with the queries that describe them. */
const DISHES: { dish: string; menu: string; queries: string[] }[] = [
  {
    dish: "CAPRICCIOSA (28 cm pizza)",
    menu: "bistro",
    queries: [
      "pizza meat and vegetable topping regular crust",
      "pizza cheese regular crust",
    ],
  },
  {
    dish: "ENSALADA GRIEGA",
    menu: "bistro",
    queries: ["greek salad", "feta cheese", "cucumber raw", "olives ripe canned"],
  },
  {
    dish: "CARBONARA",
    menu: "bistro",
    queries: [
      "spaghetti cooked",
      "cream sauce",
      "bacon cooked",
      "parmesan cheese",
    ],
  },
  {
    dish: "Salmon Roll",
    menu: "nikkori",
    queries: ["sushi roll", "rice white cooked", "salmon raw", "cream cheese"],
  },
  {
    dish: "Tiras de Pollo",
    menu: "andaluz",
    queries: [
      "chicken breast breaded fried strips",
      "potatoes french fried",
    ],
  },
  {
    dish: "Coliflor Roka",
    menu: "andaluz",
    queries: ["cauliflower cooked roasted", "cauliflower raw"],
  },
];

async function search(query: string) {
  const res = await fetch(`${base}/foods/search?api_key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      dataType: ["Foundation", "SR Legacy", "Survey (FNDDS)"],
      pageSize: 6,
    }),
  });
  if (!res.ok) throw new Error(`FDC ${res.status} for "${query}"`);
  const json = await res.json();
  return (json.foods ?? []) as {
    fdcId: number;
    description: string;
    dataType: string;
    foodNutrients: { nutrientId: number; value: number }[];
  }[];
}

/** Portion weights matter as much as composition: mass is what we are missing. */
async function portions(fdcId: number) {
  const res = await fetch(`${base}/food/${fdcId}?api_key=${key}`);
  if (!res.ok) return [];
  const food = await res.json();
  // deno-lint-ignore no-explicit-any
  return (food.foodPortions ?? []).map((p: any) =>
    `${p.amount ?? ""} ${p.measureUnit?.name ?? ""} ${
      p.modifier ?? p.portionDescription ?? ""
    } = ${p.gramWeight} g`
  );
}

const adHoc = Deno.args[0];
const targets = adHoc
  ? [{ dish: `ad-hoc: ${adHoc}`, menu: "-", queries: [adHoc] }]
  : DISHES;

for (const { dish, menu, queries } of targets) {
  console.log(`\n${"=".repeat(70)}\n${dish}  [${menu}]`);
  for (const query of queries) {
    console.log(`\n  query: "${query}"`);
    for (const food of await search(query)) {
      const macros: Record<string, number> = {};
      for (const n of food.foodNutrients ?? []) {
        const label = NUTRIENTS[n.nutrientId];
        if (label) macros[label] = n.value;
      }
      if (macros.kcal === undefined) continue;
      console.log(
        `    ${String(food.fdcId).padEnd(8)} ${food.dataType.padEnd(15)} ` +
          `${macros.kcal} kcal P${macros.protein} C${macros.carb} F${macros.fat} /100g` +
          `  ${food.description.slice(0, 60)}`,
      );
      for (const portion of await portions(food.fdcId)) {
        console.log(`        portion: ${portion}`);
      }
    }
  }
}

console.log(
  `\n${"=".repeat(70)}\nNothing was written. Santiago selects the FDC ID, the edible grams,\n` +
    `the raw/cooked/prepared basis, and both mass-band endpoints for each dish.`,
);
