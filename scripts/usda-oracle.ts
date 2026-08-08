import type { MacroValues } from "./macro-score.ts";

const baseUrl = "https://api.nal.usda.gov/fdc/v1";
const ORACLE_PATH = "scripts/fixtures/macro-oracle.json";

type FdcNutrient = {
  nutrient: { name: string; unitName: string };
  amount: number;
};

type FdcFoodDetail = {
  foodNutrients: FdcNutrient[];
};

type FdcSearchResponse = {
  foods: { fdcId: number; description: string; dataType: string }[];
};

export type FdcFoodCandidate = {
  fdc_id: number;
  description: string;
  data_type: string;
};

type OracleRecipeInput = Omit<UsdaRecipeIngredient, "per_100g">;

type OracleFixtureEntry = {
  recipe?: OracleRecipeInput[];
  oracle: unknown;
};

export type UsdaRecipeIngredient = {
  name: string;
  fdc_id: number;
  grams: number;
  basis: "raw" | "cooked";
  per_100g: MacroValues;
};

const ZERO_MACROS: MacroValues = {
  calories: 0,
  protein_g: 0,
  carb_g: 0,
  fat_g: 0,
};

const MACRO_FIELDS: (keyof MacroValues)[] = [
  "calories",
  "protein_g",
  "carb_g",
  "fat_g",
];

function requiredNutrient(
  nutrients: FdcNutrient[],
  name: string,
  unitName: string,
): number {
  const nutrient = nutrients.find((candidate) =>
    candidate.nutrient.name === name && candidate.nutrient.unitName === unitName
  );
  if (!nutrient || !Number.isFinite(nutrient.amount)) {
    throw new Error(`USDA FDC response is missing ${name} in ${unitName}`);
  }
  return nutrient.amount;
}

export function projectNutrients(food: FdcFoodDetail): MacroValues {
  return {
    calories: requiredNutrient(food.foodNutrients, "Energy", "kcal"),
    protein_g: requiredNutrient(food.foodNutrients, "Protein", "g"),
    carb_g: requiredNutrient(
      food.foodNutrients,
      "Carbohydrate, by difference",
      "g",
    ),
    fat_g: requiredNutrient(food.foodNutrients, "Total lipid (fat)", "g"),
  };
}

export async function searchFoods(
  query: string,
  apiKey: string,
): Promise<FdcFoodCandidate[]> {
  const response = await fetch(
    `${baseUrl}/foods/search?query=${encodeURIComponent(query)}&api_key=${
      encodeURIComponent(apiKey)
    }`,
  );
  if (!response.ok) {
    throw new Error(`USDA FDC request failed: ${response.status}`);
  }

  const body = await response.json() as FdcSearchResponse;
  return body.foods.map((food) => ({
    fdc_id: food.fdcId,
    description: food.description,
    data_type: food.dataType,
  }));
}

export async function fetchNutrients(
  fdcId: number,
  apiKey: string,
): Promise<MacroValues> {
  const response = await fetch(
    `${baseUrl}/food/${fdcId}?api_key=${encodeURIComponent(apiKey)}`,
  );
  if (!response.ok) {
    throw new Error(`USDA FDC request failed: ${response.status}`);
  }

  return projectNutrients(await response.json() as FdcFoodDetail);
}

export async function loadFdcApiKey(path = ".env.local"): Promise<string> {
  const contents = await Deno.readTextFile(path);
  const match = contents.match(/^USDA_FDC_API_KEY=(.+)$/m);
  if (!match) throw new Error("USDA_FDC_API_KEY is required in .env.local");
  return match[1].trim().replace(/^['"]|['"]$/g, "");
}

export async function prepareOracle(
  apiKey: string,
  path = ORACLE_PATH,
): Promise<void> {
  const entries = JSON.parse(
    await Deno.readTextFile(path),
  ) as OracleFixtureEntry[];
  if (!Array.isArray(entries)) throw new Error("USDA oracle must be an array");

  for (const entry of entries) {
    if (!entry.recipe?.length) {
      throw new Error("USDA oracle entries require reviewed recipe inputs");
    }
    const ingredients = await Promise.all(
      entry.recipe.map(async (ingredient) => ({
        ...ingredient,
        per_100g: await fetchNutrients(ingredient.fdc_id, apiKey),
      })),
    );
    const totals = sumRecipe(ingredients);
    validateRecipe(ingredients, totals);
    entry.oracle = {
      ...totals,
      assumed: "USDA FDC recipe",
      source: "USDA FoodData Central",
      retrieved_at: new Date().toISOString().slice(0, 10),
      ingredients,
    };
  }

  await Deno.writeTextFile(path, `${JSON.stringify(entries, null, 2)}\n`);
}

export async function runCli(args = Deno.args): Promise<void> {
  const [command, ...rest] = args;
  const apiKey = await loadFdcApiKey();

  if (command === "search") {
    const query = rest.join(" ").trim();
    if (!query) throw new Error("Usage: usda-oracle.ts search <query>");
    for (const food of await searchFoods(query, apiKey)) {
      console.log(`${food.description} | ${food.data_type} | ${food.fdc_id}`);
    }
    return;
  }

  if (command === "prepare") {
    await prepareOracle(apiKey);
    return;
  }

  throw new Error("Usage: usda-oracle.ts <search|prepare>");
}

export function sumRecipe(ingredients: UsdaRecipeIngredient[]): MacroValues {
  return ingredients.reduce((total, ingredient) => ({
    calories: total.calories +
      ingredient.per_100g.calories * ingredient.grams / 100,
    protein_g: total.protein_g +
      ingredient.per_100g.protein_g * ingredient.grams / 100,
    carb_g: total.carb_g + ingredient.per_100g.carb_g * ingredient.grams / 100,
    fat_g: total.fat_g + ingredient.per_100g.fat_g * ingredient.grams / 100,
  }), ZERO_MACROS);
}

export function validateRecipe(
  ingredients: UsdaRecipeIngredient[],
  totals: MacroValues,
): void {
  for (const ingredient of ingredients) {
    if (!Number.isInteger(ingredient.fdc_id) || ingredient.fdc_id <= 0) {
      throw new Error(
        "Each recipe ingredient requires a positive integer fdc_id",
      );
    }
    if (!Number.isFinite(ingredient.grams) || ingredient.grams <= 0) {
      throw new Error("Each recipe ingredient requires positive finite grams");
    }
    if (ingredient.basis !== "raw" && ingredient.basis !== "cooked") {
      throw new Error("Each recipe ingredient requires a raw or cooked basis");
    }
    for (const field of MACRO_FIELDS) {
      if (
        !Number.isFinite(ingredient.per_100g[field]) ||
        ingredient.per_100g[field] < 0
      ) {
        throw new Error("Each per_100g macro must be finite and non-negative");
      }
    }
  }

  const calculated = sumRecipe(ingredients);
  for (const field of MACRO_FIELDS) {
    if (!Number.isFinite(totals[field]) || totals[field] < 0) {
      throw new Error("Recipe totals must be finite and non-negative");
    }
    if (Math.abs(calculated[field] - totals[field]) > 0.01) {
      throw new Error(`Recipe ${field} total does not match its ingredients`);
    }
  }
}

if (import.meta.main) await runCli();
