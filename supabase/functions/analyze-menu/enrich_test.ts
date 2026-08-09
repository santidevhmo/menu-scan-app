import {
  assertEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  callGptEnrich,
  chunk,
  enrichBatch,
  ENRICH_MODEL,
  ENRICH_PROMPT,
  ENRICH_SCHEMA_OPENAI,
  type EnrichedItem,
  type ExtractedItem,
  sumIngredientMacros,
  fallbackEnriched,
  reassembleEnriched,
  resolveGrams,
  isBlackBoxIngredient,
} from "./enrich.ts";

const extracted = (name: string): ExtractedItem => ({
  name,
  description: "",
  price: null,
  category: "main",
});

const enriched = (name: string): EnrichedItem => ({
  ...extracted(name),
  printed_total_g: null,
  name_implied_components: [],
  ingredients: [{
    name: "x",
    category: "protein",
    within_printed_weight: true,
    typical_serving_g: 100,
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
  // Case-insensitive: B4 moved this clause mid-sentence, behind the printed
  // weight, so it is no longer sentence-initial. The step it guards is the same.
  assertEquals(/list the most likely ingredients/i.test(ENRICH_PROMPT), true);
  // B4 replaced "prefer printed weights over guesses" - the printed weight is
  // now a field the model reports and code scales to, not a basis for its own
  // gram guesses.
  assertEquals(ENRICH_PROMPT.includes("printed_total_g"), true);
});

Deno.test("every ingredient must carry a serving and a scope tag (B1, B4)", () => {
  // Without a per-ingredient size the model records WHAT is in a dish and never
  // HOW MUCH, so its portion assumption is unrecoverable from its output.
  // baseline-002 showed every macro it emitted was a multiple of 5 and every
  // calorie a multiple of 50 across 3 dishes x 3 draws - the signature of a
  // guess made straight at the macro level rather than a sum over portions.
  // B4 keeps that property and changes only what the size means.
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
  const keys = Object.keys(ingredient.properties);

  for (const field of ["within_printed_weight", "typical_serving_g"]) {
    assertEquals(keys.includes(field), true, `ingredients[] must declare ${field}`);
    // Strict mode only emits a field when it is required, so declaring it is not
    // enough - an optional field would be silently omitted on every call.
    assertEquals(
      ingredient.required.includes(field),
      true,
      `${field} must be required, or strict mode will omit it`,
    );
  }
  // The scope decision must come first: settle what the printed weight covers
  // before sizing anything into it.
  assertEquals(
    keys.indexOf("within_printed_weight") < keys.indexOf("typical_serving_g"),
    true,
    "within_printed_weight must precede typical_serving_g",
  );
  // A literal gram figure must not be askable - that is ours to derive, and
  // asking for it is exactly what produced five runs of frozen portions.
  assertEquals(
    keys.includes("grams"),
    false,
    "ingredients[] must not ask for grams - resolveGrams computes them",
  );
});

Deno.test("the item commits to its printed weight before portioning (B4)", () => {
  const schema = ENRICH_SCHEMA_OPENAI as {
    properties: {
      items: { items: { properties: Record<string, unknown>; required: string[] } };
    };
  };
  const item = schema.properties.items.items;
  const keys = Object.keys(item.properties);

  assertEquals(item.required.includes("printed_total_g"), true);
  assertEquals(
    keys.indexOf("printed_total_g") < keys.indexOf("ingredients"),
    true,
    "printed_total_g must precede ingredients",
  );
  // Null is how "the menu prints no weight" is expressed; without it in the type
  // union strict mode forces the model to invent a number.
  assertEquals(
    (item.properties.printed_total_g as { type: string[] }).type,
    ["number", "null"],
  );
});

Deno.test("enrich prompt asks for per-ingredient servings and derived totals (B1, B4)", () => {
  // B4 replaced "edible weight in grams" with a conventional serving; the grams
  // are ours to derive. The B1 property being guarded is unchanged: the item's
  // totals must still be summed from the parts rather than guessed directly.
  assertEquals(ENRICH_PROMPT.includes("typical_serving_g"), true);
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
    // Per 100 g, so the 150 g second ingredient must contribute 1.5x its stated
    // numbers. Drop the scaling and protein comes out 34, not 35.
    { name: "a", category: "protein", within_printed_weight: true, typical_serving_g: 100, protein_per_100g: 31, carb_per_100g: 0, fat_per_100g: 3.6 },
    { name: "b", category: "carb", within_printed_weight: true, typical_serving_g: 150, protein_per_100g: 2.7, carb_per_100g: 28, fat_per_100g: 0.3 },
  ]);

  assertEquals(got.protein_g, 35); // 31 + 4.05
  assertEquals(got.carb_g, 42); // 0 + 42
  assertEquals(got.fat_g, 4); // 3.6 + 0.45
  // Atwater on the unrounded sums: 4*35.05 + 4*42 + 9*4.05
  assertEquals(got.estimated_calories, 345);
});

Deno.test("sumIngredientMacros rounds to whole grams and calories", () => {
  const got = sumIngredientMacros([
    { name: "a", category: "fat", within_printed_weight: true, typical_serving_g: 10, protein_per_100g: 12.4, carb_per_100g: 3.1, fat_per_100g: 24.6 },
    { name: "b", category: "veg", within_printed_weight: true, typical_serving_g: 10, protein_per_100g: 1.1, carb_per_100g: 2.4, fat_per_100g: 0.7 },
  ]);

  // 1.35 -> 1, 0.55 -> 1, 2.53 -> 3; calories from the UNROUNDED sums so the
  // total never drifts from what the parts actually add up to.
  assertEquals(got.protein_g, 1);
  assertEquals(got.carb_g, 1);
  assertEquals(got.fat_g, 3);
  assertEquals(got.estimated_calories, Math.round(4 * 1.35 + 4 * 0.55 + 9 * 2.53));
});

Deno.test("resolveGrams fits the printed weight and leaves accompaniments alone (B4)", () => {
  // The Salmone case. Its menu prints 200g for the plate, but the baguette is
  // served alongside and sits OUTSIDE that weight - the oracle's total is 245 g.
  // Scaling every ingredient to 200 would pull the baguette inside and collapse
  // the dish, destroying a judgment the model already gets right.
  const got = resolveGrams(
    [
      { name: "plate a", category: "protein", within_printed_weight: true, typical_serving_g: 100, protein_per_100g: 0, carb_per_100g: 0, fat_per_100g: 0 },
      { name: "plate b", category: "veg", within_printed_weight: true, typical_serving_g: 150, protein_per_100g: 0, carb_per_100g: 0, fat_per_100g: 0 },
      { name: "side", category: "carb", within_printed_weight: false, typical_serving_g: 50, protein_per_100g: 0, carb_per_100g: 0, fat_per_100g: 0 },
    ],
    200,
  );

  // Inside sums to 250, printed is 200, so the scale is 0.8 - applied to the two
  // plate items only. The side keeps its stated serving.
  assertEquals(got, [80, 120, 50]);
  assertEquals(got[0] + got[1], 200);
});

Deno.test("resolveGrams passes servings through when no weight is printed (B4)", () => {
  const got = resolveGrams(
    [
      { name: "a", category: "protein", within_printed_weight: true, typical_serving_g: 140, protein_per_100g: 0, carb_per_100g: 0, fat_per_100g: 0 },
      { name: "b", category: "veg", within_printed_weight: true, typical_serving_g: 60, protein_per_100g: 0, carb_per_100g: 0, fat_per_100g: 0 },
    ],
    null,
  );

  assertEquals(got, [140, 60]);
});

Deno.test("resolveGrams does not divide by zero when nothing is inside (B4)", () => {
  // The retry path backfills dropped items with an empty ingredient list, and a
  // dish can legitimately be all-accompaniment. Either must not produce NaN.
  assertEquals(resolveGrams([], 200), []);
  assertEquals(
    resolveGrams(
      [{ name: "side", category: "carb", within_printed_weight: false, typical_serving_g: 45, protein_per_100g: 0, carb_per_100g: 0, fat_per_100g: 0 }],
      200,
    ),
    [45],
  );
});

Deno.test("sumIngredientMacros prices the SCALED grams, not the raw servings (B4)", () => {
  // Servings sum to 250 inside a printed 200, so every inside ingredient is
  // priced at 0.8x what it stated. Without the scaling this returns 62.
  const got = sumIngredientMacros(
    [
      { name: "a", category: "protein", within_printed_weight: true, typical_serving_g: 100, protein_per_100g: 20, carb_per_100g: 0, fat_per_100g: 0 },
      { name: "b", category: "carb", within_printed_weight: true, typical_serving_g: 150, protein_per_100g: 28, carb_per_100g: 0, fat_per_100g: 0 },
    ],
    200,
  );

  // 80 g x 20/100 + 120 g x 28/100 = 16 + 33.6 = 49.6 -> 50
  assertEquals(got.protein_g, 50);
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

Deno.test("the pinned model is sent WITH temperature 0, the parameter it accepts", async () => {
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
    assertEquals(request?.temperature, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("a model that rejects temperature 0 is sent none, and cannot change the pin", async () => {
  // gpt-5.x answers "Only the default (1) value is supported" and 400s the whole
  // request. Sending it anyway is how a model switch breaks every scan in
  // production while the benchmark stays green - the harness quietly drops the
  // parameter, so nothing measured here ever exercised the real path.
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
    await enrichBatch([extracted("A")], "test-key", "gpt-5.5-2026-04-23");
    assertEquals(request?.model, "gpt-5.5-2026-04-23");
    assertEquals("temperature" in (request ?? {}), false);
    // Overriding the argument must never move what production is pinned to.
    assertEquals(ENRICH_MODEL, "gpt-4o-2024-08-06");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("callGptEnrich batches at the production size and returns one item per input", async () => {
  const items = Array.from({ length: 23 }, (_, i) => extracted(`item-${i}`));
  const batchSizes: number[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(init?.body as string) as { messages: { content: string }[] };
    const sent = JSON.parse(
      body.messages[0].content.split("Menu items (JSON):\n")[1],
    ) as { name: string }[];
    batchSizes.push(sent.length);
    return new Response(JSON.stringify({
      choices: [{
        finish_reason: "stop",
        message: {
          content: JSON.stringify({ items: sent.map((s) => enriched(s.name)) }),
        },
      }],
    }));
  };

  try {
    const out = await callGptEnrich(items, "test-key");
    assertEquals(batchSizes.sort((a, b) => b - a), [10, 10, 3]);
    assertEquals(out.items.length, 23);
    // Order is the contract the client re-ranks against.
    assertEquals(out.items.map((i) => i.name), items.map((i) => i.name));
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

Deno.test("B24: a dish restated as its own ingredient is detected, and only that", () => {
  // The real case, from the 2026-08-09 generalisation probe.
  assertEquals(
    isBlackBoxIngredient("Chicken Tikka Masala with basmati rice", "chicken tikka masala"),
    true,
  );
  // Its sibling ingredient in the same response is a genuine food.
  assertEquals(
    isBlackBoxIngredient("Chicken Tikka Masala with basmati rice", "basmati rice"),
    false,
  );

  // FALSE POSITIVES ARE THE RISK - every one of these came back from the same
  // probe and must survive, or the fix silently downgrades good answers.
  assertEquals(isBlackBoxIngredient("Margherita", "pizza crust"), false);
  assertEquals(isBlackBoxIngredient("PASTA ALFREDO", "pasta"), false);
  assertEquals(isBlackBoxIngredient("Pad Thai with prawns", "rice noodles"), false);
  assertEquals(isBlackBoxIngredient("BACON CHEESE BURGER", "burger bun"), false);
  assertEquals(isBlackBoxIngredient("Coleslaw (150gr)", "aderezo cremoso"), false);
  // A one-word ingredient is a food, never a dish restated.
  assertEquals(isBlackBoxIngredient("Pollo a la plancha", "pollo"), false);

  // Accent- and case-insensitive, since this ships to every language.
  assertEquals(isBlackBoxIngredient("PASTEL AZTECA (300gr.)", "pastel azteca"), true);
  assertEquals(isBlackBoxIngredient("Ensalada Cesar", "ensalada cesar"), true);

  // Degenerate input must not throw or match.
  assertEquals(isBlackBoxIngredient("", "x"), false);
  assertEquals(isBlackBoxIngredient("Soup", ""), false);
});
