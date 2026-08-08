import {
  assertEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  chunk,
  enrichBatch,
  ENRICH_PROMPT,
  ENRICH_SCHEMA_OPENAI,
  type EnrichedItem,
  type ExtractedItem,
  sumIngredientMacros,
  fallbackEnriched,
  reassembleEnriched,
} from "./enrich.ts";

const extracted = (name: string): ExtractedItem => ({
  name,
  description: "",
  price: null,
  category: "main",
});

const enriched = (name: string): EnrichedItem => ({
  ...extracted(name),
  ingredients: [{
    name: "x",
    category: "protein",
    grams: 100,
    protein_per_100g: 31,
    carb_per_100g: 0,
    fat_per_100g: 3.6,
  }],
  protein_g: 10,
  carb_g: 5,
  fat_g: 3,
  estimated_calories: 100,
  confidence: "high",
  allergens: [],
});

Deno.test("chunk splits into size-capped batches preserves all elements", () => {
  const nums = Array.from({ length: 47 }, (_, i) => i);
  const batches = chunk(nums, 10);

  assertEquals(batches.length, 5);
  assertEquals(batches[4].length, 7);
  assertEquals(batches.flat(), nums);
});

Deno.test("chunk rejects non-positive size", () => {
  assertThrows(() => chunk([1], 0), Error, "chunk size must be positive");
  assertThrows(() => chunk([1], -1), Error, "chunk size must be positive");
});

Deno.test("reassemble returns one item per input, in input order, backfilling drops", () => {
  const inputs = [extracted("A"), extracted("B"), extracted("C")];
  // Model dropped C returned rest out order.
  const model = [enriched("B"), enriched("A")];

  const out = reassembleEnriched(inputs, model);

  assertEquals(out.length, 3);
  assertEquals(out.map((i) => i.name), ["A", "B", "C"]);
  assertEquals(out[2].confidence, "low");
  assertEquals(out[0].confidence, "high");
});

Deno.test("reassemble matches duplicate names one-per-occurrence", () => {
  const inputs = [extracted("Salad"), extracted("Salad")];
  const model = [enriched("Salad")];

  const out = reassembleEnriched(inputs, model);

  assertEquals(out.length, 2);
  assertEquals(out[0].confidence, "high");
  assertEquals(out[1].confidence, "low");
});

Deno.test("fallbackEnriched preserves extraction identity with low-confidence zeros", () => {
  const out = fallbackEnriched({
    name: "Soup",
    description: "Tomato soup",
    price: 8,
    category: "starter",
  });

  assertEquals(out.name, "Soup");
  assertEquals(out.description, "Tomato soup");
  assertEquals(out.price, 8);
  assertEquals(out.category, "starter");
  assertEquals(out.ingredients, []);
  assertEquals(out.protein_g, 0);
  assertEquals(out.carb_g, 0);
  assertEquals(out.fat_g, 0);
  assertEquals(out.estimated_calories, 0);
  assertEquals(out.confidence, "low");
  assertEquals(out.allergens, []);
});

Deno.test("enrich schema generates ingredients BEFORE the macro numbers", () => {
  const schema = ENRICH_SCHEMA_OPENAI as {
    properties: {
      items: { items: { properties: Record<string, unknown> } };
    };
  };
  const keys = Object.keys(schema.properties.items.items.properties);

  const ingredientsAt = keys.indexOf("ingredients");
  const proteinAt = keys.indexOf("protein_g");
  const caloriesAt = keys.indexOf("estimated_calories");

  assertEquals(ingredientsAt >= 0, true, "ingredients must exist in the schema");
  assertEquals(
    ingredientsAt < proteinAt,
    true,
    `ingredients (${ingredientsAt}) must precede protein_g (${proteinAt})`,
  );
  assertEquals(
    ingredientsAt < caloriesAt,
    true,
    `ingredients (${ingredientsAt}) must precede estimated_calories (${caloriesAt})`,
  );
});

Deno.test("enrich prompt still instructs the two-step ingredient-then-estimate method", () => {
  assertEquals(ENRICH_PROMPT.includes("List the most likely ingredients"), true);
  assertEquals(ENRICH_PROMPT.includes("prefer printed weights over guesses"), true);
});

Deno.test("every ingredient must carry a gram weight (B1)", () => {
  // Without this the model records WHAT is in a dish and never HOW MUCH, so its
  // portion assumption is unrecoverable from its output. baseline-002 showed
  // every macro it emitted was a multiple of 5 and every calorie a multiple of
  // 50 across 3 dishes x 3 draws - the signature of a guess made straight at
  // the macro level rather than a sum over portions.
  const schema = ENRICH_SCHEMA_OPENAI as {
    properties: {
      items: {
        items: {
          properties: {
            ingredients: {
              items: {
                properties: Record<string, unknown>;
                required: string[];
              };
            };
          };
        };
      };
    };
  };
  const ingredient = schema.properties.items.items.properties.ingredients.items;

  assertEquals(
    Object.keys(ingredient.properties).includes("grams"),
    true,
    "ingredients[] must declare a grams property",
  );
  // Strict mode only emits a field when it is required, so declaring it is not
  // enough - an optional grams would be silently omitted on every call.
  assertEquals(
    ingredient.required.includes("grams"),
    true,
    "grams must be required, or strict mode will omit it",
  );
});

Deno.test("enrich prompt asks for per-ingredient grams and derived totals (B1)", () => {
  assertEquals(ENRICH_PROMPT.includes("edible weight in grams"), true);
  assertEquals(
    ENRICH_PROMPT.includes("rather than estimating the totals directly"),
    true,
  );
});

Deno.test("the nutrition step names no specific food (B11 lesson)", () => {
  // B11 shipped a sentence listing "grains, bread, tortilla, rice, potato, corn
  // kernels, legumes and sugar" as the high-carb foods. That list was a
  // roll-call of the three benchmark fixtures' own ingredients, and the model
  // took the licence: sweet corn went from 15 g to 20 g of carb at 30 g, against
  // USDA's 5.6 g. The prompt ships to every menu on earth; a food named HERE is
  // a nutrition claim about that food, and the test set must not leak into it.
  //
  // Scoped to step 2 on purpose. Step 1 is about reading the menu's own text and
  // its "chicken (80gr)" example illustrates printed-weight NOTATION, not
  // composition - it is baseline wording common to every run measured so far.
  const nutritionStep = ENRICH_PROMPT.split("\n2. ")[1]?.split("\n3. ")[0];
  assertEquals(typeof nutritionStep, "string", "step 2 must be findable");

  for (
    const food of [
      "tortilla",
      "corn",
      "rice",
      "potato",
      "bread",
      "legume",
      "sugar",
      "grain",
      "crouton",
      "salmon",
      "chicken",
      "tomato",
      "cheese",
      "bean",
      "dressing",
      "cream",
    ]
  ) {
    assertEquals(
      new RegExp(`\\b${food}`, "i").test(nutritionStep),
      false,
      `step 2 must not name "${food}" - it is a nutrition claim about our fixtures`,
    );
  }
});

Deno.test("the nutrition step rejects the raw reference form (B13)", () => {
  // iter-b12-001: fat came back BELOW the oracle on all six fats measured, and
  // the per-ingredient dump showed why - the model was quoting plain, raw
  // reference entries while the oracle prices as-prepared ones.
  //
  // Step 2 already said "as served" and "fat absorbed or added in cooking
  // counts" when that run was measured, so an inclusive phrasing is proven
  // insufficient. What is load-bearing here is the NEGATIVE: naming the raw
  // reference figure as the wrong answer. Stated as a basis, never as a food -
  // the guard above still applies to this sentence.
  const nutritionStep = ENRICH_PROMPT.split("\n2. ")[1]?.split("\n3. ")[0] ?? "";

  assertEquals(
    nutritionStep.includes("cooked, sauced or seasoned"),
    true,
    "step 2 must name preparation as the basis",
  );
  assertEquals(
    /plain or raw reference figure/.test(nutritionStep),
    true,
    "step 2 must reject the raw reference figure explicitly, not just ask for the prepared one",
  );
});

Deno.test("every ingredient carries per-100g composition, not an amount (B12)", () => {
  // iter-b11-001: asked for the amount in the serving, the model returns a round
  // number anchored to the ingredient's category tag - anything tagged carb got
  // 20 or 30 g whatever the food or weight (croutons 30 g->20, corn 30 g->20,
  // baguette 50 g->30, beans 70 g->20). Composition per 100 g is a property of
  // the food, and the multiplication is the part a computer cannot get wrong.
  const schema = ENRICH_SCHEMA_OPENAI as {
    properties: {
      items: {
        items: {
          properties: {
            ingredients: {
              items: {
                properties: Record<string, unknown>;
                required: string[];
              };
            };
          };
        };
      };
    };
  };
  const ingredient = schema.properties.items.items.properties.ingredients.items;

  for (const field of ["protein_per_100g", "carb_per_100g", "fat_per_100g"]) {
    assertEquals(
      Object.keys(ingredient.properties).includes(field),
      true,
      `ingredients[] must declare ${field}`,
    );
    assertEquals(
      ingredient.required.includes(field),
      true,
      `${field} must be required, or strict mode will omit it`,
    );
  }
  // The per-serving amounts must NOT be askable, or the model answers those and
  // the anchor comes straight back.
  for (const field of ["protein_g", "carb_g", "fat_g"]) {
    assertEquals(
      Object.keys(ingredient.properties).includes(field),
      false,
      `ingredients[] must not ask for ${field} - that is ours to compute`,
    );
  }
});

Deno.test("sumIngredientMacros prices composition at each ingredient's weight", () => {
  const got = sumIngredientMacros([
    // Per 100 g, so the 150 g of rice must contribute 1.5x its stated numbers.
    // Drop the scaling and protein comes out 34, not 35.
    { name: "a", category: "protein", grams: 100, protein_per_100g: 31, carb_per_100g: 0, fat_per_100g: 3.6 },
    { name: "b", category: "carb", grams: 150, protein_per_100g: 2.7, carb_per_100g: 28, fat_per_100g: 0.3 },
  ]);

  assertEquals(got.protein_g, 35); // 31 + 4.05
  assertEquals(got.carb_g, 42); // 0 + 42
  assertEquals(got.fat_g, 4); // 3.6 + 0.45
  // Atwater on the unrounded sums: 4*35.05 + 4*42 + 9*4.05
  assertEquals(got.estimated_calories, 345);
});

Deno.test("sumIngredientMacros rounds to whole grams and calories", () => {
  const got = sumIngredientMacros([
    { name: "a", category: "fat", grams: 10, protein_per_100g: 12.4, carb_per_100g: 3.1, fat_per_100g: 24.6 },
    { name: "b", category: "veg", grams: 10, protein_per_100g: 1.1, carb_per_100g: 2.4, fat_per_100g: 0.7 },
  ]);

  // 1.35 -> 1, 0.55 -> 1, 2.53 -> 3; calories from the UNROUNDED sums so the
  // total never drifts from what the parts actually add up to.
  assertEquals(got.protein_g, 1);
  assertEquals(got.carb_g, 1);
  assertEquals(got.fat_g, 3);
  assertEquals(got.estimated_calories, Math.round(4 * 1.35 + 4 * 0.55 + 9 * 2.53));
});

Deno.test("sumIngredientMacros returns zeros for an empty ingredient list", () => {
  // The retry path backfills dropped items with zeros at confidence "low"; an
  // empty list must not produce NaN and poison the whole batch.
  assertEquals(sumIngredientMacros([]), {
    protein_g: 0,
    carb_g: 0,
    fat_g: 0,
    estimated_calories: 0,
  });
});

Deno.test("production enrichment serializes the pinned Stage-2 model", async () => {
  const originalFetch = globalThis.fetch;
  let request: Record<string, unknown> | undefined;
  globalThis.fetch = async (_input, init) => {
    request = JSON.parse(init?.body as string) as Record<string, unknown>;
    return new Response(JSON.stringify({
      choices: [{
        finish_reason: "stop",
        message: { content: JSON.stringify({ items: [enriched("A")] }) },
      }],
    }));
  };

  try {
    await enrichBatch([extracted("A")], "test-key");
    assertEquals(request?.model, "gpt-4o-2024-08-06");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("production enrichment rejects a malformed OpenAI response clearly", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({}));

  try {
    await assertRejects(
      () => enrichBatch([extracted("A")], "test-key"),
      Error,
      "OpenAI response missing choices",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
