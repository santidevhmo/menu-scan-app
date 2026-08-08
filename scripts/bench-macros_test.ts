import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  enrich,
  loadOracle,
  type OracleEntry,
  renderTable,
  toExtractedItems,
} from "./bench-macros.ts";

const ORACLE_PATH = "scripts/fixtures/macro-oracle.json";

Deno.test("the shipped oracle file has three items with the expected names", () => {
  const raw = JSON.parse(Deno.readTextFileSync(ORACLE_PATH)) as OracleEntry[];
  assertEquals(raw.length, 3);
  assertEquals(raw.map((entry) => entry.name), [
    "CESAR (200 g)",
    "Salmone toscano",
    "PASTEL AZTECA (300gr.)",
  ]);
});

Deno.test("loadOracle refuses to proceed while any oracle is unfilled", () => {
  const tmp = Deno.makeTempFileSync({ suffix: ".json" });
  Deno.writeTextFileSync(
    tmp,
    JSON.stringify([{
      menu: "m",
      name: "N",
      description: "",
      price: null,
      category: "food",
      section_title: null,
      options: [],
      printed_weight: "",
      oracle: null,
    }]),
  );

  assertThrows(() => loadOracle(tmp), Error, "oracle not filled");
  Deno.removeSync(tmp);
});

const completeEntry = {
  menu: "m",
  name: "n",
  description: "",
  price: null,
  category: "food",
  section_title: null,
  options: [],
  printed_weight: "",
  oracle: {
    calories: 165,
    protein_g: 31,
    carb_g: 0,
    fat_g: 3.6,
    assumed: "USDA FDC",
    source: "USDA FoodData Central",
    retrieved_at: "2026-08-07",
    ingredients: [{
      name: "chicken",
      fdc_id: 1,
      grams: 100,
      basis: "cooked",
      per_100g: { calories: 165, protein_g: 31, carb_g: 0, fat_g: 3.6 },
    }],
  },
};

Deno.test("loadOracle rejects an unprovenanced oracle", () => {
  const tmp = Deno.makeTempFileSync({ suffix: ".json" });
  Deno.writeTextFileSync(
    tmp,
    JSON.stringify([{
      ...completeEntry,
      oracle: { ...completeEntry.oracle, source: "other" },
    }]),
  );

  assertThrows(() => loadOracle(tmp), Error, "USDA FoodData Central");
  Deno.removeSync(tmp);
});

Deno.test("loadOracle rejects oracle totals that do not match ingredients", () => {
  const tmp = Deno.makeTempFileSync({ suffix: ".json" });
  Deno.writeTextFileSync(
    tmp,
    JSON.stringify([{
      ...completeEntry,
      oracle: { ...completeEntry.oracle, calories: 166 },
    }]),
  );

  assertThrows(() => loadOracle(tmp), Error, "calories total does not match");
  Deno.removeSync(tmp);
});

Deno.test("loadOracle rejects ingredients with non-positive grams", () => {
  const tmp = Deno.makeTempFileSync({ suffix: ".json" });
  Deno.writeTextFileSync(
    tmp,
    JSON.stringify([{
      ...completeEntry,
      oracle: {
        ...completeEntry.oracle,
        ingredients: [{ ...completeEntry.oracle.ingredients[0], grams: 0 }],
      },
    }]),
  );

  assertThrows(() => loadOracle(tmp), Error, "positive finite grams");
  Deno.removeSync(tmp);
});

Deno.test("loadOracle rejects ingredients with an unsupported basis", () => {
  const tmp = Deno.makeTempFileSync({ suffix: ".json" });
  Deno.writeTextFileSync(
    tmp,
    JSON.stringify([{
      ...completeEntry,
      oracle: {
        ...completeEntry.oracle,
        ingredients: [{ ...completeEntry.oracle.ingredients[0], basis: "fried" }],
      },
    }]),
  );

  assertThrows(() => loadOracle(tmp), Error, "raw, cooked, or prepared basis");
  Deno.removeSync(tmp);
});

Deno.test("grams comes from the real parseItemGrams, matching production", () => {
  const entries = JSON.parse(
    Deno.readTextFileSync(ORACLE_PATH),
  ) as OracleEntry[];
  const items = toExtractedItems(entries);

  assertEquals(items[0].grams, 200);
  assertEquals(items[1].grams, 200);
  assertEquals(items[2].grams, 300);
});

Deno.test("items sent to the model carry the full production shape", () => {
  const entries = JSON.parse(
    Deno.readTextFileSync(ORACLE_PATH),
  ) as OracleEntry[];
  const items = toExtractedItems(entries);

  assertEquals(Object.keys(items[0]).sort(), [
    "category",
    "description",
    "grams",
    "name",
    "options",
    "price",
    "section_title",
  ]);
});

Deno.test("renderTable reports per-draw tallies, never a single number", () => {
  const out = renderTable([{
    name: "CESAR (200 g)",
    draws: [
      { pass: true, fields: [] },
      { pass: false, fields: [] },
      { pass: true, fields: [] },
    ],
  }]);

  assertEquals(out.includes("2/3"), true);
  assertEquals(out.includes("CESAR (200 g)"), true);
});

Deno.test("macro benchmark serializes the pinned Stage-2 enrichment model", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = Deno.env.get("OPENAI_API_KEY");
  let request: Record<string, unknown> | undefined;
  Deno.env.set("OPENAI_API_KEY", "test-key");
  globalThis.fetch = async (_input, init) => {
    request = JSON.parse(init?.body as string) as Record<string, unknown>;
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"items":[]}' } }] }));
  };

  try {
    await enrich([]);
    assertEquals(request?.model, "gpt-4o-2024-08-06");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) Deno.env.delete("OPENAI_API_KEY");
    else Deno.env.set("OPENAI_API_KEY", originalKey);
  }
});
