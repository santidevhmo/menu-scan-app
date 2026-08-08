import type { MacroValues } from "./macro-score.ts";

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

export function sumRecipe(ingredients: UsdaRecipeIngredient[]): MacroValues {
  return ingredients.reduce((total, ingredient) => ({
    calories: total.calories + ingredient.per_100g.calories * ingredient.grams / 100,
    protein_g: total.protein_g + ingredient.per_100g.protein_g * ingredient.grams / 100,
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
      throw new Error("Each recipe ingredient requires a positive integer fdc_id");
    }
    if (!Number.isFinite(ingredient.grams) || ingredient.grams <= 0) {
      throw new Error("Each recipe ingredient requires positive finite grams");
    }
    if (ingredient.basis !== "raw" && ingredient.basis !== "cooked") {
      throw new Error("Each recipe ingredient requires a raw or cooked basis");
    }
    for (const field of MACRO_FIELDS) {
      if (!Number.isFinite(ingredient.per_100g[field]) || ingredient.per_100g[field] < 0) {
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
