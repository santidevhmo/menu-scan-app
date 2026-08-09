import {
  assertEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  ENRICH_MODEL,
} from "../supabase/functions/analyze-menu/enrich.ts";
import {
  enrich,
  loadOracle,
  type OracleEntry,
  archivedIngredients,
  renderTable,
  replayDraw,
  toExtractedItems,
} from "./bench-macros.ts";
import {
  type UsdaRecipeIngredient,
  validateRecipe,
} from "./usda-oracle.ts";

const ORACLE_PATH = "scripts/fixtures/macro-oracle.json";

Deno.test("the shipped oracle is complete and USDA-validated", () => {
  // Pins the ROSTER, so a fixture cannot appear or vanish unnoticed - widening it
  // changes the yardstick and every archived run has to be re-scored (B14). The
  // archive tests below stay at three items on purpose: the runs they read were
  // recorded against the original three and always will be.
  const entries = loadOracle(ORACLE_PATH);
  assertEquals(entries.length, 8);
  assertEquals(entries.map((entry) => entry.name), [
    "CESAR (200 g)",
    "Salmone toscano",
    "PASTEL AZTECA (300gr.)",
    "NEW YORK",
    "French Fries (300gr)",
    "Gnocchi alla sorrentina",
    "ENFRIJOLADAS (135gr.)",
    "Coleslaw (150gr)",
  ]);
});

Deno.test("replayDraw reads an archived run without calling the model", async () => {
  // Guards the $0 re-score path. iter-b4-004 is committed, so this is a stable
  // fixture; if the archive format ever changes, this fails before a re-score
  // silently produces nonsense.
  const items = await replayDraw("iter-b4-004", 0);

  assertEquals(items.length, 3);
  assertEquals(items.map((i) => i.name), [
    "CESAR (200 g)",
    "Salmone toscano",
    "PASTEL AZTECA (300gr.)",
  ]);
  assertEquals(items[0].printed_total_g, 200);
});

Deno.test("a pre-B4 archive still scores non-zero when re-scored", async () => {
  // The bug this exists for: pre-B4 runs archived a final `grams` per
  // ingredient, and B4 renamed that to `typical_serving_g`. Without the shape
  // adapter, resolveGrams sees no servings, returns 0 for everything, and the
  // re-score prints a full table of -100% failures that looks like a result.
  // Six of the ten archived runs are pre-B4.
  const items = await replayDraw("iter-b13-001", 0);
  const cesar = archivedIngredients(items[0].ingredients);

  assertEquals(cesar.length, 5);
  // Every ingredient must carry a usable serving after adaptation.
  assertEquals(cesar.every((i) => i.typical_serving_g > 0), true);
  // 50 g lettuce + 20 parmesan + 30 croutons + 80 chicken + 20 dressing.
  assertEquals(cesar.reduce((s, i) => s + i.typical_serving_g, 0), 200);
});

Deno.test("replayDraw fails loudly on an archive it cannot read", async () => {
  await assertRejects(
    () => replayDraw("no-such-run", 0),
    Error,
  );
});

Deno.test("every shipped dish total is the sum of its own ingredients", () => {
  // The oracle stores dish totals AND the ingredients they came from. Edit an
  // ingredient and forget the totals - which is exactly the shape of the
  // 2026-08-08 Caesar dressing re-pick - and every score silently shifts against
  // a yardstick that no longer describes its own parts. validateRecipe was only
  // ever exercised on synthetic recipes; this runs it on the real file.
  const raw = JSON.parse(Deno.readTextFileSync(ORACLE_PATH)) as {
    name: string;
    oracle: {
      calories: number;
      protein_g: number;
      carb_g: number;
      fat_g: number;
      ingredients: UsdaRecipeIngredient[];
    };
  }[];

  for (const dish of raw) {
    const { ingredients, ...totals } = dish.oracle;
    validateRecipe(ingredients, {
      calories: totals.calories,
      protein_g: totals.protein_g,
      carb_g: totals.carb_g,
      fat_g: totals.fat_g,
    });
  }
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
    assertEquals(request?.model, ENRICH_MODEL);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) Deno.env.delete("OPENAI_API_KEY");
    else Deno.env.set("OPENAI_API_KEY", originalKey);
  }
});
