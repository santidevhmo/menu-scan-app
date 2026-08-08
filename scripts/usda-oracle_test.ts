import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { sumRecipe, validateRecipe } from "./usda-oracle.ts";

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
