import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
  assertThrows,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  callGptEnrich,
  callGptEnrichDualPass,
  chunk,
  ENRICH_MODEL,
  MAX_CONCURRENT_BATCHES,
  ENRICH_PROMPT,
  ENRICH_PROMPT_UNWEIGHTED,
  ENRICH_SCHEMA_OPENAI,
  enrichBatch,
  type EnrichedItem,
  type ExtractedItem,
  fallbackEnriched,
  isBlackBoxed,
  isFallbackEnriched,
  isUnweighted,
  isBlackBoxIngredient,
  reassembleEnriched,
  resolveGrams,
  sumIngredientMacros,
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

  assertEquals(
    ingredientsAt >= 0,
    true,
    "ingredients must exist in the schema",
  );
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
    assertEquals(
      keys.includes(field),
      true,
      `ingredients[] must declare ${field}`,
    );
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
      items: {
        items: { properties: Record<string, unknown>; required: string[] };
      };
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
  const nutritionStep = ENRICH_PROMPT.split("\n2. ")[1]?.split("\n3. ")[0] ??
    "";

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
    {
      name: "a",
      category: "protein",
      within_printed_weight: true,
      typical_serving_g: 100,
      protein_per_100g: 31,
      carb_per_100g: 0,
      fat_per_100g: 3.6,
    },
    {
      name: "b",
      category: "carb",
      within_printed_weight: true,
      typical_serving_g: 150,
      protein_per_100g: 2.7,
      carb_per_100g: 28,
      fat_per_100g: 0.3,
    },
  ]);

  assertEquals(got.protein_g, 35); // 31 + 4.05
  assertEquals(got.carb_g, 42); // 0 + 42
  assertEquals(got.fat_g, 4); // 3.6 + 0.45
  // Atwater on the unrounded sums: 4*35.05 + 4*42 + 9*4.05
  assertEquals(got.estimated_calories, 345);
});

Deno.test("sumIngredientMacros rounds to whole grams and calories", () => {
  const got = sumIngredientMacros([
    {
      name: "a",
      category: "fat",
      within_printed_weight: true,
      typical_serving_g: 10,
      protein_per_100g: 12.4,
      carb_per_100g: 3.1,
      fat_per_100g: 24.6,
    },
    {
      name: "b",
      category: "veg",
      within_printed_weight: true,
      typical_serving_g: 10,
      protein_per_100g: 1.1,
      carb_per_100g: 2.4,
      fat_per_100g: 0.7,
    },
  ]);

  // 1.35 -> 1, 0.55 -> 1, 2.53 -> 3; calories from the UNROUNDED sums so the
  // total never drifts from what the parts actually add up to.
  assertEquals(got.protein_g, 1);
  assertEquals(got.carb_g, 1);
  assertEquals(got.fat_g, 3);
  assertEquals(
    got.estimated_calories,
    Math.round(4 * 1.35 + 4 * 0.55 + 9 * 2.53),
  );
});

Deno.test("resolveGrams fits the printed weight and leaves accompaniments alone (B4)", () => {
  // The Salmone case. Its menu prints 200g for the plate, but the baguette is
  // served alongside and sits OUTSIDE that weight - the oracle's total is 245 g.
  // Scaling every ingredient to 200 would pull the baguette inside and collapse
  // the dish, destroying a judgment the model already gets right.
  const got = resolveGrams(
    [
      {
        name: "plate a",
        category: "protein",
        within_printed_weight: true,
        typical_serving_g: 100,
        protein_per_100g: 0,
        carb_per_100g: 0,
        fat_per_100g: 0,
      },
      {
        name: "plate b",
        category: "veg",
        within_printed_weight: true,
        typical_serving_g: 150,
        protein_per_100g: 0,
        carb_per_100g: 0,
        fat_per_100g: 0,
      },
      {
        name: "side",
        category: "carb",
        within_printed_weight: false,
        typical_serving_g: 50,
        protein_per_100g: 0,
        carb_per_100g: 0,
        fat_per_100g: 0,
      },
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
      {
        name: "a",
        category: "protein",
        within_printed_weight: true,
        typical_serving_g: 140,
        protein_per_100g: 0,
        carb_per_100g: 0,
        fat_per_100g: 0,
      },
      {
        name: "b",
        category: "veg",
        within_printed_weight: true,
        typical_serving_g: 60,
        protein_per_100g: 0,
        carb_per_100g: 0,
        fat_per_100g: 0,
      },
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
      [{
        name: "side",
        category: "carb",
        within_printed_weight: false,
        typical_serving_g: 45,
        protein_per_100g: 0,
        carb_per_100g: 0,
        fat_per_100g: 0,
      }],
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
      {
        name: "a",
        category: "protein",
        within_printed_weight: true,
        typical_serving_g: 100,
        protein_per_100g: 20,
        carb_per_100g: 0,
        fat_per_100g: 0,
      },
      {
        name: "b",
        category: "carb",
        within_printed_weight: true,
        typical_serving_g: 150,
        protein_per_100g: 28,
        carb_per_100g: 0,
        fat_per_100g: 0,
      },
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
    const body = JSON.parse(init?.body as string) as {
      messages: { content: string }[];
    };
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

Deno.test("a dropped item is rescued in a small batch, not backfilled with zeroes", async () => {
  // Polloteria, reduced: a batch where the model consistently omits the same
  // short option names on BOTH attempts. Before the rescue these shipped as
  // 0 kcal.
  const items = Array.from({ length: 10 }, (_, i) => extracted(`item-${i}`));
  const ALWAYS_DROPPED = ["item-7", "item-8", "item-9"];
  const sizesSeen: number[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(init?.body as string) as {
      messages: { content: string }[];
    };
    const sent = JSON.parse(
      body.messages[0].content.split("Menu items (JSON):\n")[1],
    ) as { name: string }[];
    sizesSeen.push(sent.length);
    // The defect: these names come back only when the batch is small.
    const returned = sent.length > 3
      ? sent.filter((s) => !ALWAYS_DROPPED.includes(s.name))
      : sent;
    return new Response(JSON.stringify({
      choices: [{
        finish_reason: "stop",
        message: {
          content: JSON.stringify({ items: returned.map((s) => enriched(s.name)) }),
        },
      }],
    }));
  };

  try {
    const out = await callGptEnrich(items, "test-key");
    assertEquals(out.items.length, 10);
    assertEquals(out.items.map((i) => i.name), items.map((i) => i.name));
    // The point: every item carries real macros. fallbackEnriched would leave
    // 0 calories and an empty ingredient list.
    for (const name of ALWAYS_DROPPED) {
      const item = out.items.find((i) => i.name === name)!;
      assert(
        item.estimated_calories > 0,
        `${name} was backfilled with zeroes instead of rescued`,
      );
    }
    // And it rescued in SMALL batches rather than re-rolling the same 10.
    assert(
      sizesSeen.some((n) => n <= 3),
      `expected a small rescue batch, saw sizes ${sizesSeen.join(",")}`,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("a timed-out batch is rescued rather than zeroed", async () => {
  // Both whole-batch attempts fail; only smaller requests succeed. This is the
  // 120s MODEL_TIMEOUT_MS path that zeroed a dish twice during the 2026-08-13
  // benchmark runs.
  const items = Array.from({ length: 6 }, (_, i) => extracted(`item-${i}`));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(init?.body as string) as {
      messages: { content: string }[];
    };
    const sent = JSON.parse(
      body.messages[0].content.split("Menu items (JSON):\n")[1],
    ) as { name: string }[];
    if (sent.length > 3) throw new Error("Model request timed out after 120s");
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
    assertEquals(out.items.length, 6);
    for (const item of out.items) {
      assert(
        item.estimated_calories > 0,
        `${item.name} was zeroed by the timeout instead of rescued`,
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("callGptEnrich never exceeds MAX_CONCURRENT_BATCHES in flight", async () => {
  // 55 items at batchSize 3 is 19 batches — the Polloteria menu, the worst real
  // case. Uncapped this fired all 19 at once; a rate limit there does not slow a
  // scan down, it zeroes an item's macros via fallbackEnriched.
  const items = Array.from({ length: 55 }, (_, i) => extracted(`item-${i}`));
  let inFlight = 0;
  let peak = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    // Yield so overlapping calls actually overlap - without an await the
    // counter would return to 0 before the next call ever started and the
    // assertion would pass on a serial implementation too.
    await new Promise((r) => setTimeout(r, 1));
    const body = JSON.parse(init?.body as string) as {
      messages: { content: string }[];
    };
    const sent = JSON.parse(
      body.messages[0].content.split("Menu items (JSON):\n")[1],
    ) as { name: string }[];
    inFlight--;
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
    const out = await callGptEnrich(items, "test-key", ENRICH_MODEL, 3);
    assertEquals(out.items.length, 55);
    assertEquals(out.items.map((i) => i.name), items.map((i) => i.name));
    // The point of the test. 19 batches, never more than 5 at once.
    assert(
      peak <= MAX_CONCURRENT_BATCHES,
      `peak concurrency ${peak} exceeded MAX_CONCURRENT_BATCHES ${MAX_CONCURRENT_BATCHES}`,
    );
    // And it must still be parallel - a serial loop would peak at 1 and would
    // make every scan batches-times slower.
    assert(peak > 1, `expected parallel batches, peaked at ${peak}`);
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
    isBlackBoxIngredient(
      "Chicken Tikka Masala with basmati rice",
      "chicken tikka masala",
    ),
    true,
  );
  // Its sibling ingredient in the same response is a genuine food.
  assertEquals(
    isBlackBoxIngredient(
      "Chicken Tikka Masala with basmati rice",
      "basmati rice",
    ),
    false,
  );

  // FALSE POSITIVES ARE THE RISK - every one of these came back from the same
  // probe and must survive, or the fix silently downgrades good answers.
  assertEquals(isBlackBoxIngredient("Margherita", "pizza crust"), false);
  assertEquals(isBlackBoxIngredient("PASTA ALFREDO", "pasta"), false);
  assertEquals(
    isBlackBoxIngredient("Pad Thai with prawns", "rice noodles"),
    false,
  );
  assertEquals(
    isBlackBoxIngredient("BACON CHEESE BURGER", "burger bun"),
    false,
  );
  assertEquals(
    isBlackBoxIngredient("Coleslaw (150gr)", "aderezo cremoso"),
    false,
  );
  // A one-word ingredient is a food, never a dish restated.
  assertEquals(isBlackBoxIngredient("Pollo a la plancha", "pollo"), false);

  // Accent- and case-insensitive, since this ships to every language.
  assertEquals(
    isBlackBoxIngredient("PASTEL AZTECA (300gr.)", "pastel azteca"),
    true,
  );
  assertEquals(isBlackBoxIngredient("Ensalada Cesar", "ensalada cesar"), true);

  // Degenerate input must not throw or match.
  assertEquals(isBlackBoxIngredient("", "x"), false);
  assertEquals(isBlackBoxIngredient("Soup", ""), false);
});

Deno.test("B24b: only an ingredient carrying the whole dish is a black box", () => {
  // Both cases are REAL, from the 2026-08-09 nine-menu probe.
  const ing = (name: string, typical_serving_g: number) => ({
    name,
    category: "other" as const,
    within_printed_weight: true,
    typical_serving_g,
    protein_per_100g: 0,
    carb_per_100g: 0,
    fat_per_100g: 0,
  });

  // TRUE positive: the dish restated as its only ingredient, 100% of the mass.
  assertEquals(
    isBlackBoxed("HOT CAKES (3 piezas) Naturales", [ing("hot cakes", 150)]),
    true,
  );

  // FALSE positive that the name test alone produced, and the reason this guard
  // exists: BLACK TRUFFLE BUTTER decomposed CORRECTLY into butter 14g + black
  // truffle 5g and was downgraded anyway, purely because the item name starts
  // with an ingredient name. Truffle is 26% of the mass.
  assertEquals(
    isBlackBoxed("BLACK TRUFFLE BUTTER", [
      ing("butter", 14),
      ing("black truffle", 5),
    ]),
    false,
  );
  // The name test still matches both - the mass share is what separates them.
  assertEquals(
    isBlackBoxIngredient("BLACK TRUFFLE BUTTER", "black truffle"),
    true,
  );

  // No ingredients cannot be a black box; it is the separate empty-item case.
  assertEquals(isBlackBoxed("Spicy Garlic", []), false);
  // Zero-gram servings must not divide by zero.
  assertEquals(isBlackBoxed("X Y", [ing("x y", 0)]), false);
});

Deno.test("serving_pieces cannot be declined - force the field, not the wording", () => {
  // Asking for a conventional count when the menu prints none FAILED TWICE on
  // two wordings, the pizza case failing both times. Measured 2026-08-11 over
  // 213 real items: 199 came back with NO count. Prompt wording is 0 for 4 in
  // this phase; schema force is 5 for 7 (B4, B10, B12, B21, this). So the model
  // no longer has a null to hide in - "1" is the answer for a single plate, and
  // portionSteps already treats 1 as "no piece stepper".
  const item = ENRICH_SCHEMA_OPENAI.properties.items.items as {
    properties: Record<string, { type: unknown }>;
    required: string[];
  };
  assertEquals(item.properties.serving_pieces.type, "number");
  assertEquals(item.required.includes("serving_pieces"), true);
});

Deno.test("the piece step defines 1 and still prefers a printed count", () => {
  // Without "1 = a single plate" a forced field has nowhere to put a steak.
  assertEquals(ENRICH_PROMPT.includes("single plate"), true);
  assertEquals(ENRICH_PROMPT.includes("the count the menu states"), true);
});

Deno.test("resolveGrams prefers an as-served amount for an accompaniment (ARM S4)", () => {
  // An ingredient OUTSIDE the printed weight is the one class nothing rescales,
  // so whatever number arrives reaches the plate untouched. B21 asks for the
  // standard REFERENCE amount, which for a spooned sauce is USDA's 30 g
  // DIPPING-CONTAINER portion rather than the ~15 g actually served.
  const ingredients = [
    {
      name: "steak",
      category: "protein" as const,
      within_printed_weight: true,
      typical_serving_g: 250,
      protein_per_100g: 26,
      carb_per_100g: 0,
      fat_per_100g: 19,
    },
    {
      name: "sauce served alongside",
      category: "fat" as const,
      within_printed_weight: false,
      typical_serving_g: 30,
      amount_as_served_g: 15,
      protein_per_100g: 1,
      carb_per_100g: 2,
      fat_per_100g: 50,
    },
  ];

  // Inside is fitted to the printed weight; the accompaniment takes its
  // AS-SERVED amount, not its reference serving.
  assertEquals(resolveGrams(ingredients, 400), [400, 15]);

  // Without the field - which is every production response, since it is not in
  // the shipped schema - behaviour is unchanged. That is what keeps this arm
  // inert until it is deliberately shipped.
  const production = ingredients.map(({ amount_as_served_g: _drop, ...rest }) => rest);
  assertEquals(resolveGrams(production, 400), [400, 30]);
});

// ── Dual pass ───────────────────────────────────────────────────────────────

/**
 * Echoes back one minimal enriched item per item in the request, so
 * enrichBatchWithRetry sees a COMPLETE batch and neither retries nor rescues.
 * Records every request body so a test can assert which prompt it carried.
 */
function stubEcho(bodies: string[]) {
  return ((_url: string, init: RequestInit) => {
    bodies.push(String(init.body));
    const content = JSON.parse(String(init.body)).messages[0].content as string;
    const names = [...content.matchAll(/"name":"([^"]+)"/g)].map((m) => m[1]);
    return Promise.resolve(
      new Response(
        JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({ items: names.map((name) => ({ name })) }),
            },
          }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    // deno-lint-ignore no-explicit-any
  }) as any;
}

Deno.test("callGptEnrich sends the SHIPPED prompt when none is given", async () => {
  const bodies: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = stubEcho(bodies);
  try {
    await callGptEnrich([extracted("A")], "k");
  } finally {
    globalThis.fetch = original;
  }
  assertEquals(bodies.length, 1);
  const sent = JSON.parse(bodies[0]).messages[0].content as string;
  assertStringIncludes(sent, ENRICH_PROMPT);
  // The unweighted sentence must NOT leak into the default path - that is the
  // whole isolation guarantee of the dual pass.
  assertEquals(sent.includes("print no weight"), false);
});

Deno.test("callGptEnrich forwards an explicit prompt to every batch", async () => {
  const bodies: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = stubEcho(bodies);
  try {
    await callGptEnrich(
      [extracted("A"), extracted("B")],
      "k",
      ENRICH_MODEL,
      1, // force two batches, so "every batch" is actually exercised
      "CUSTOM PROMPT",
    );
  } finally {
    globalThis.fetch = original;
  }
  assertEquals(bodies.length, 2);
  for (const body of bodies) {
    assertStringIncludes(JSON.parse(body).messages[0].content, "CUSTOM PROMPT");
  }
});

Deno.test("an explicit prompt survives the RETRY and the RESCUE, not just the first try", async () => {
  // enrichBatchWithRetry calls enrichBatch THREE times - first attempt, whole-batch
  // retry, then the small-batch rescue. A prompt forwarded to only the first would
  // serve an unweighted item TODAY's answer while looking like it got the new one,
  // and only on the failure path, which is the hardest place to notice it.
  const bodies: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = ((_url: string, init: RequestInit) => {
    bodies.push(String(init.body));
    // Returns NOTHING, so the batch is never complete and both fallbacks fire.
    return Promise.resolve(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ items: [] }) } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    // deno-lint-ignore no-explicit-any
  }) as any;
  try {
    await callGptEnrich([extracted("A")], "k", ENRICH_MODEL, 10, "CUSTOM PROMPT");
  } finally {
    globalThis.fetch = original;
  }
  assertEquals(bodies.length, 3); // first attempt, retry, rescue
  for (const body of bodies) {
    assertStringIncludes(JSON.parse(body).messages[0].content, "CUSTOM PROMPT");
  }
});

Deno.test("the unweighted prompt is the shipped one plus the measured sentence", () => {
  assertStringIncludes(ENRICH_PROMPT_UNWEIGHTED, ENRICH_PROMPT);
  assertStringIncludes(ENRICH_PROMPT_UNWEIGHTED, "print no weight");
  // Never the other way round: the shipped prompt must stay clean.
  assertEquals(ENRICH_PROMPT.includes("print no weight"), false);
});

Deno.test("isUnweighted reads the code-parsed grams, not the model's answer", () => {
  const base = extracted("A");
  assertEquals(isUnweighted(base), true); // no grams field at all
  assertEquals(isUnweighted({ ...base, grams: null } as ExtractedItem), true);
  assertEquals(isUnweighted({ ...base, grams: 200 } as ExtractedItem), false);
  // 0 is not "no weight" - it is a parsed value, and treating it as absent
  // would route a real item into the wrong pass.
  assertEquals(isUnweighted({ ...base, grams: 0 } as ExtractedItem), false);
});

Deno.test("isFallbackEnriched spots a zeroed item and nothing else", () => {
  const live = {
    name: "A",
    ingredients: [{ name: "x" }],
    estimated_calories: 100,
    confidence: "high",
    // deno-lint-ignore no-explicit-any
  } as any;
  const dead = {
    name: "A",
    ingredients: [],
    estimated_calories: 0,
    confidence: "low",
    // deno-lint-ignore no-explicit-any
  } as any;
  assertEquals(isFallbackEnriched(live), false);
  assertEquals(isFallbackEnriched(dead), true);
  // A real item that genuinely has no calories (mineral water) must NOT be
  // mistaken for a failure - it has ingredients and is not low-confidence.
  assertEquals(isFallbackEnriched({ ...live, estimated_calories: 0 }), false);
  // fallbackEnriched IS the thing this detects - pinned against the real
  // producer so the two cannot drift apart.
  assertEquals(isFallbackEnriched(fallbackEnriched(extracted("A"))), true);
});

/** Answers each batch with a full item per input, tagging which prompt it saw. */
function stubOpenAI(seen: { prompt: string; names: string[] }[]) {
  return ((_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    const content = body.messages[0].content as string;
    const names = [...content.matchAll(/"name":"([^"]+)"/g)].map((m) => m[1]);
    const unweightedPass = content.includes("print no weight");
    seen.push({ prompt: unweightedPass ? "unweighted" : "shipped", names });
    return Promise.resolve(
      new Response(
        JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                items: names.map((name) => ({
                  name,
                  description: "",
                  price: null,
                  category: "food",
                  printed_total_g: null,
                  name_implied_components: [],
                  ingredients: [{
                    name: unweightedPass ? "pass2" : "pass1",
                    category: "other",
                    within_printed_weight: true,
                    typical_serving_g: 10,
                    protein_per_100g: 1,
                    carb_per_100g: 1,
                    fat_per_100g: 1,
                  }],
                  serving_pieces: 1,
                  allergens: [],
                  confidence: "high",
                })),
              }),
            },
          }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    // deno-lint-ignore no-explicit-any
  }) as any;
}

const WEIGHTED = { ...extracted("STEAK"), category: "food", grams: 400 };
const UNWEIGHTED = { ...extracted("PIZZA"), category: "food", grams: null };

Deno.test("dual pass: pass 1 sees EVERY item with the shipped prompt", async () => {
  const seen: { prompt: string; names: string[] }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = stubOpenAI(seen);
  try {
    await callGptEnrichDualPass([WEIGHTED, UNWEIGHTED], "k");
  } finally {
    globalThis.fetch = original;
  }
  const pass1 = seen.filter((s) => s.prompt === "shipped");
  assertEquals(pass1.length, 1);
  // The unweighted item MUST be in pass 1 - its presence is what holds the
  // weighted item's batch composition at today's shape.
  assertEquals(pass1[0].names.sort(), ["PIZZA", "STEAK"]);
});

Deno.test("dual pass: pass 2 sees ONLY unweighted items", async () => {
  const seen: { prompt: string; names: string[] }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = stubOpenAI(seen);
  try {
    await callGptEnrichDualPass([WEIGHTED, UNWEIGHTED], "k");
  } finally {
    globalThis.fetch = original;
  }
  const pass2 = seen.filter((s) => s.prompt === "unweighted");
  assertEquals(pass2.length, 1);
  assertEquals(pass2[0].names, ["PIZZA"]);
});

Deno.test("dual pass: weighted keeps pass 1, unweighted takes pass 2", async () => {
  const seen: { prompt: string; names: string[] }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = stubOpenAI(seen);
  let result;
  try {
    result = await callGptEnrichDualPass([WEIGHTED, UNWEIGHTED], "k");
  } finally {
    globalThis.fetch = original;
  }
  const steak = result!.items.find((i) => i.name === "STEAK")!;
  const pizza = result!.items.find((i) => i.name === "PIZZA")!;
  assertEquals(steak.ingredients[0].name, "pass1");
  assertEquals(pizza.ingredients[0].name, "pass2");
  // Order is preserved - the client re-ranks against input order.
  assertEquals(result!.items.map((i) => i.name), ["STEAK", "PIZZA"]);
});

Deno.test("dual pass: a failing pass 2 degrades to pass 1, never to zeros", async () => {
  const original = globalThis.fetch;
  let call = 0;
  globalThis.fetch = ((_url: string, init: RequestInit) => {
    call++;
    const content = JSON.parse(String(init.body)).messages[0].content as string;
    if (content.includes("print no weight")) {
      return Promise.reject(new Error("pass 2 exploded"));
    }
    return stubOpenAI([])(_url, init);
    // deno-lint-ignore no-explicit-any
  }) as any;
  let result;
  try {
    result = await callGptEnrichDualPass([WEIGHTED, UNWEIGHTED], "k");
  } finally {
    globalThis.fetch = original;
  }
  assertEquals(call > 1, true);
  assertEquals(result!.items.length, 2);
  // Both fall back to pass 1's answer - the worst case is today's app.
  for (const item of result!.items) {
    assertEquals(item.ingredients[0].name, "pass1");
  }
});

Deno.test("dual pass: a ZEROED pass-2 item degrades to pass 1", async () => {
  // The try/catch cannot see this one: pass 2 resolves fine, but the item inside
  // it is fallbackEnriched's zeroed placeholder. Shipping that would show the
  // user 0 kcal for a dish pass 1 had already answered correctly - the exact
  // failure v31 was deployed to stop.
  const original = globalThis.fetch;
  globalThis.fetch = ((_url: string, init: RequestInit) => {
    const content = JSON.parse(String(init.body)).messages[0].content as string;
    if (content.includes("print no weight")) {
      // Returns no items at all, so reassembleEnriched backfills with zeros.
      return Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify({ items: [] }) } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    }
    return stubOpenAI([])(_url, init);
    // deno-lint-ignore no-explicit-any
  }) as any;
  let result;
  try {
    result = await callGptEnrichDualPass([WEIGHTED, UNWEIGHTED], "k");
  } finally {
    globalThis.fetch = original;
  }
  const pizza = result!.items.find((i) => i.name === "PIZZA")!;
  assertEquals(pizza.ingredients[0].name, "pass1");
  assert(pizza.estimated_calories > 0);
});

Deno.test("dual pass: an all-weighted menu makes no second call at all", async () => {
  const seen: { prompt: string; names: string[] }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = stubOpenAI(seen);
  try {
    await callGptEnrichDualPass([WEIGHTED], "k");
  } finally {
    globalThis.fetch = original;
  }
  assertEquals(seen.length, 1);
  assertEquals(seen[0].prompt, "shipped");
});

Deno.test("dual pass: pass 2 waits for pass 1 - they are never in flight together", async () => {
  // Sequential is a rate-limit guarantee, not a style choice: a throttled batch
  // does not arrive late, it gives up after two attempts and fallbackEnriched
  // returns ZEROED macros. Overlapping the passes would put ~1.5x the requests
  // against the same limit.
  const original = globalThis.fetch;
  let inFlight = 0;
  let maxInFlight = 0;
  let sawPass2 = false;
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const content = JSON.parse(String(init.body)).messages[0].content as string;
    if (content.includes("print no weight")) sawPass2 = true;
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
    return stubOpenAI([])(_url, init);
    // deno-lint-ignore no-explicit-any
  }) as any;
  try {
    // Two batches of one, so pass 1 itself runs two concurrent requests: this
    // asserts the PASSES do not overlap, not that concurrency is gone.
    await callGptEnrichDualPass([WEIGHTED, UNWEIGHTED], "k", ENRICH_MODEL, 1);
  } finally {
    globalThis.fetch = original;
  }
  assertEquals(sawPass2, true);
  // Pass 1 is 2 requests; pass 2 is 1. If they overlapped this would reach 3.
  assertEquals(maxInFlight, 2);
});

Deno.test("index.ts calls the DUAL PASS, not the single pass", async () => {
  // The risk is a half-finished wiring - the import swapped but the call site
  // left, or vice versa. Pinned mechanically because neither half fails loudly.
  const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assertStringIncludes(source, "callGptEnrichDualPass(");
  // The single-pass entry point must not remain as the enrichment call site.
  assertEquals(/[^a-zA-Z]callGptEnrich\(/.test(source), false);
});
