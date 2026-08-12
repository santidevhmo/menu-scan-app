// Builds a draft oracle recipe from FDC ids and gram weights, ready for
// Santiago to approve or reject ingredient by ingredient. $0.
//
// Every gram figure here is a HUMAN judgment about how a dish is plated; only
// the per-100 g composition comes from USDA. The two must never be confused,
// which is why this prints the split.
//
// Run: deno run --env-file=.env.local --allow-env --allow-net --allow-read \
//        scripts/usda-draft-recipe.ts "California Roll" 240 2708422:127:cooked 174203:45:prepared
import { fetchNutrients, sumRecipe } from "./usda-oracle.ts";

if (import.meta.main) {
  const [dish, servedG, ...specs] = Deno.args;
  const key = Deno.env.get("USDA_FDC_API_KEY")!;

  const ingredients = [];
  for (const spec of specs) {
    const [id, grams, basis, ...name] = spec.split(":");
    const per100 = await fetchNutrients(Number(id), key);
    ingredients.push({
      name: name.join(":") || `fdc ${id}`,
      fdc_id: Number(id),
      grams: Number(grams),
      basis: basis || "prepared",
      per_100g: per100,
    });
  }

  const totals = sumRecipe(ingredients);
  const sum = ingredients.reduce((s, i) => s + i.grams, 0);
  console.log(
    JSON.stringify(
      { dish, served_g: Number(servedG), ingredients, totals },
      null,
      2,
    ),
  );
  console.log(
    `\ningredient grams sum to ${sum} against a served mass of ${servedG}` +
      (sum === Number(servedG) ? " ✅" : " ⚠️ MISMATCH"),
  );
  console.log(
    `per 100 g of plate: ${(totals.calories / sum * 100).toFixed(0)} kcal, ` +
      `P ${(totals.protein_g / sum * 100).toFixed(1)} C ${
        (totals.carb_g / sum * 100).toFixed(1)
      } F ${(totals.fat_g / sum * 100).toFixed(1)}`,
  );
}
