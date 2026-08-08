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
    protein_g: 31,
    carb_g: 0,
    fat_g: 3.6,
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

Deno.test("every ingredient carries its own macros so code can sum them (B10)", () => {
  // iter-b1-001: the model portions well and totals badly. Its own grams,
  // priced with USDA values, scored BETTER than the macros it reported on two
  // of three dishes, while every total it emitted stayed a multiple of 5.
  // So we ask for the per-ingredient numbers and do the addition ourselves.
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

  for (const field of ["protein_g", "carb_g", "fat_g"]) {
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
});

Deno.test("sumIngredientMacros totals the parts and derives calories by Atwater", () => {
  const got = sumIngredientMacros([
    { name: "chicken", category: "protein", grams: 100, protein_g: 31, carb_g: 0, fat_g: 3.6 },
    { name: "rice", category: "carb", grams: 150, protein_g: 4, carb_g: 42, fat_g: 0.4 },
  ]);

  assertEquals(got.protein_g, 35);
  assertEquals(got.carb_g, 42);
  assertEquals(got.fat_g, 4);
  // 4*35 + 4*42 + 9*4 = 140 + 168 + 36 = 344
  assertEquals(got.estimated_calories, 344);
});

Deno.test("sumIngredientMacros rounds to whole grams and calories", () => {
  const got = sumIngredientMacros([
    { name: "a", category: "fat", grams: 10, protein_g: 1.24, carb_g: 0.31, fat_g: 2.46 },
    { name: "b", category: "veg", grams: 10, protein_g: 0.11, carb_g: 0.24, fat_g: 0.07 },
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
