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
  ingredients: [{ name: "x", category: "protein" }],
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
