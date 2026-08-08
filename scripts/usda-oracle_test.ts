import {
  assertEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  fetchNutrients,
  loadFdcApiKey,
  prepareOracle,
  projectNutrients,
  searchFoods,
  sumRecipe,
  validateRecipe,
} from "./usda-oracle.ts";

const recipe = [{
  name: "chicken breast",
  fdc_id: 1,
  grams: 150,
  basis: "cooked" as const,
  per_100g: { calories: 165, protein_g: 31, carb_g: 0, fat_g: 3.6 },
}];

Deno.test("sumRecipe scales per-100g USDA values by edible grams", () => {
  assertEquals(sumRecipe(recipe), {
    calories: 247.5,
    protein_g: 46.5,
    carb_g: 0,
    fat_g: 5.4,
  });
});

Deno.test("validateRecipe rejects missing source data and mismatched totals", () => {
  assertThrows(() =>
    validateRecipe([{ ...recipe[0], fdc_id: 0 }], recipe[0].per_100g)
  );
  assertThrows(() =>
    validateRecipe(recipe, { ...recipe[0].per_100g, calories: 999 })
  );
});

Deno.test("validateRecipe accepts a prepared ingredient", () => {
  validateRecipe(
    [{ ...recipe[0], basis: "prepared" }],
    sumRecipe([{ ...recipe[0], basis: "prepared" }]),
  );
});

const cannedFoodDetail = {
  foodNutrients: [
    { nutrient: { name: "Energy", unitName: "kcal" }, amount: 165 },
    { nutrient: { name: "Protein", unitName: "g" }, amount: 31 },
    {
      nutrient: { name: "Carbohydrate, by difference", unitName: "g" },
      amount: 0,
    },
    { nutrient: { name: "Total lipid (fat)", unitName: "g" }, amount: 3.6 },
  ],
};

Deno.test("projectNutrients returns USDA energy and macro values", () => {
  assertEquals(projectNutrients(cannedFoodDetail), {
    calories: 165,
    protein_g: 31,
    carb_g: 0,
    fat_g: 3.6,
  });
});

Deno.test("projectNutrients rejects every missing or wrongly-unitized nutrient", () => {
  for (const [index, nutrient] of cannedFoodDetail.foodNutrients.entries()) {
    assertThrows(() =>
      projectNutrients({
        foodNutrients: cannedFoodDetail.foodNutrients.filter((
          _,
          candidateIndex,
        ) => candidateIndex !== index),
      })
    );
    assertThrows(() =>
      projectNutrients({
        foodNutrients: cannedFoodDetail.foodNutrients.map((
          candidate,
          candidateIndex,
        ) =>
          candidateIndex === index
            ? {
              ...candidate,
              nutrient: {
                ...candidate.nutrient,
                unitName: nutrient.nutrient.unitName === "g" ? "mg" : "kJ",
              },
            }
            : candidate
        ),
      })
    );
  }
});

async function withCannedFetch(
  handler: (input: RequestInfo | URL) => Response,
  run: () => Promise<void>,
): Promise<void> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input) => Promise.resolve(handler(input));
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

Deno.test("searchFoods returns only USDA candidates", async () => {
  await withCannedFetch((input) => {
    assertEquals(
      String(input),
      "https://api.nal.usda.gov/fdc/v1/foods/search?query=chicken%20breast&api_key=test-key",
    );
    return Response.json({
      foods: [{
        fdcId: 123,
        description: "Chicken, breast",
        dataType: "Foundation",
      }],
    });
  }, async () => {
    assertEquals(await searchFoods("chicken breast", "test-key"), [{
      fdc_id: 123,
      description: "Chicken, breast",
      data_type: "Foundation",
    }]);
  });
});

Deno.test("fetchNutrients projects a canned USDA detail response", async () => {
  await withCannedFetch((input) => {
    assertEquals(
      String(input),
      "https://api.nal.usda.gov/fdc/v1/food/123?api_key=test-key",
    );
    return Response.json(cannedFoodDetail);
  }, async () => {
    assertEquals(await fetchNutrients(123, "test-key"), {
      calories: 165,
      protein_g: 31,
      carb_g: 0,
      fat_g: 3.6,
    });
  });
});

Deno.test("fetchNutrients identifies an FDC ID when a detail lacks a required nutrient", async () => {
  await withCannedFetch(
    () => Response.json({ foodNutrients: [] }),
    async () => {
      await assertRejects(
        () => fetchNutrients(456, "test-key"),
        Error,
        "FDC ID 456",
      );
    },
  );
});

Deno.test("USDA client rejects non-OK responses", async () => {
  await withCannedFetch(
    () => new Response("unavailable", { status: 503 }),
    async () => {
      await assertRejects(
        () => searchFoods("chicken", "test-key"),
        Error,
        "503",
      );
      await assertRejects(
        () => fetchNutrients(123, "test-key"),
        Error,
        "FDC ID 123",
      );
    },
  );
});

Deno.test("loadFdcApiKey reads USDA_FDC_API_KEY from a supplied env file", async () => {
  const path = await Deno.makeTempFile();
  try {
    await Deno.writeTextFile(path, "USDA_FDC_API_KEY=test-key\n");
    assertEquals(await loadFdcApiKey(path), "test-key");
  } finally {
    await Deno.remove(path);
  }
});

Deno.test("prepareOracle freezes reviewed recipes from canned FDC details", async () => {
  const path = await Deno.makeTempFile();
  try {
    await Deno.writeTextFile(
      path,
      JSON.stringify([{
        recipe: [{ name: "chicken", fdc_id: 123, grams: 100, basis: "cooked" }],
        oracle: null,
      }]),
    );
    await withCannedFetch(() => Response.json(cannedFoodDetail), async () => {
      await prepareOracle("test-key", path);
    });
    const [entry] = JSON.parse(await Deno.readTextFile(path)) as [{
      oracle: { calories: number; ingredients: unknown[]; source: string };
    }];
    assertEquals(entry.oracle.calories, 165);
    assertEquals(entry.oracle.source, "USDA FoodData Central");
    assertEquals(entry.oracle.ingredients.length, 1);
    assertEquals("recipe" in entry, false);
  } finally {
    await Deno.remove(path);
  }
});
