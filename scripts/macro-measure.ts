// THE single measurement path for the Stage-2 macro benchmark.
//
// Everything that turns a model response into a score lives here and is imported
// by every tool that reports a number - the live runner (`bench-macros.ts`) and
// the $0 re-scorer (`rescore-history.ts`). Nothing may re-implement any of it.
//
// Why this file exists: the two tools each grew their own copy, and the copies
// disagreed in four ways at once (2026-08-09 audit). None of the disagreements
// announced themselves - each just produced a confident, wrong table:
//
//   1. Tolerance bands were declared twice, so a band change applied to new runs
//      and not to the history they were compared against.
//   2. The runner paired model items to oracle dishes BY POSITION while the
//      re-scorer paired BY NAME. One reordering and every score silently lands
//      on the wrong dish.
//   3. The PASTEL beans tolerance existed only in the re-scorer, so the runner
//      printed failures that the published number forgave.
//   4. Era handling existed only in the re-scorer. The archive spans three
//      response shapes, and the current path returns ZERO for every macro on the
//      older two - which prints as a full table of -100% failures that looks
//      exactly like a real result. That has already happened once.
//
// A zero-context session cannot be expected to rediscover any of this, which is
// why the duplication is deleted rather than documented, and why
// `macro-measure_test.ts` fails the build if a second copy reappears.
import { sumIngredientMacros } from "../supabase/functions/analyze-menu/enrich.ts";
import type { EnrichedItem } from "../supabase/functions/analyze-menu/enrich.ts";
import { type MacroValues, scoreItem } from "./macro-score.ts";

/**
 * A dish whose oracle has a SECOND defensible reading. A field fails only if it
 * misses under both.
 *
 * PASTEL AZTECA's `300gr.` may or may not include the `servido con frijoles`
 * beans. Santiago ruled 2026-08-08 that the difference is not important enough
 * to fail an item on, and that the shipped oracle stays as the one consistent
 * rule - so the tolerance lives here, in scoring, and never in the oracle file.
 */
const ALT_ORACLES: { matches: (name: string) => boolean; oracle: MacroValues }[] = [
  {
    matches: (name) => name.startsWith("PASTEL"),
    oracle: { calories: 452, protein_g: 39.2, carb_g: 31.4, fat_g: 19.9 },
  },
];

/**
 * Normalises an archived ingredient list to the current shape.
 *
 * Runs before B4 emitted a final `grams` per ingredient and carried no printed
 * total. Mapping those to `typical_serving_g` with `within_printed_weight: true`
 * and no printed total makes resolveGrams pass them through unscaled - which is
 * exactly what they meant.
 */
export function archivedIngredients(
  ingredients: {
    grams?: number;
    typical_serving_g?: number;
    within_printed_weight?: boolean;
  }[],
): EnrichedItem["ingredients"] {
  return ingredients.map((i) =>
    i.typical_serving_g === undefined && i.grams !== undefined
      ? { ...i, typical_serving_g: i.grams, within_printed_weight: true }
      : i
  ) as EnrichedItem["ingredients"];
}

/**
 * The macro values a run actually produced for one item, whichever era it was
 * archived in. Live responses are simply the newest era.
 *
 *   B12 onward   per-100 g composition -> summed and priced in code
 *   B10 / B11    per-ingredient macros as AMOUNTS -> summed, calories by Atwater
 *   baseline/B1  no per-ingredient macros -> the model's own item-level totals
 */
// deno-lint-ignore no-explicit-any
export function toMacroValues(item: any): MacroValues {
  const ingredients = item.ingredients ?? [];
  const first = ingredients[0] ?? {};

  if (first.protein_per_100g !== undefined) {
    const totals = sumIngredientMacros(
      archivedIngredients(ingredients),
      item.printed_total_g,
    );
    return {
      calories: totals.estimated_calories,
      protein_g: totals.protein_g,
      carb_g: totals.carb_g,
      fat_g: totals.fat_g,
    };
  }

  if (first.protein_g !== undefined) {
    // deno-lint-ignore no-explicit-any
    const sum = ingredients.reduce((acc: any, i: any) => ({
      p: acc.p + (i.protein_g ?? 0),
      c: acc.c + (i.carb_g ?? 0),
      f: acc.f + (i.fat_g ?? 0),
    }), { p: 0, c: 0, f: 0 });
    return {
      calories: Math.round(4 * sum.p + 4 * sum.c + 9 * sum.f),
      protein_g: Math.round(sum.p),
      carb_g: Math.round(sum.c),
      fat_g: Math.round(sum.f),
    };
  }

  return {
    calories: item.estimated_calories,
    protein_g: item.protein_g,
    carb_g: item.carb_g,
    fat_g: item.fat_g,
  };
}

export interface DishVerdict {
  /** Per field, against the SHIPPED oracle - the numbers to report. */
  fields: import("./macro-score.ts").FieldVerdict[];
  /** Per field, after any alternative reading is allowed. */
  passes: boolean[];
  pass: boolean;
}

/** Scores one dish for one draw, honouring any alternative oracle reading. */
export function scoreDish(
  dishName: string,
  oracle: MacroValues,
  model: MacroValues,
): DishVerdict {
  const shipped = scoreItem(oracle, model);
  const alt = ALT_ORACLES.find((entry) => entry.matches(dishName));
  const altScored = alt ? scoreItem(alt.oracle, model) : null;

  const passes = shipped.fields.map((field, i) =>
    field.pass || (altScored?.fields[i].pass ?? false)
  );
  return { fields: shipped.fields, passes, pass: passes.every(Boolean) };
}

/**
 * Pairs each oracle dish with the model's item of the SAME NAME, never by
 * position. Position pairing is silent misattribution waiting to happen: the
 * oracle grew from three dishes to eight, and an archive recorded against the
 * old set still matches by name while lining up wrongly by index.
 *
 * `missing` decides what an absent dish means, and the two callers genuinely
 * differ. A LIVE run must fail loudly - a short response is a real defect. A
 * REPLAY must skip, because archives legitimately predate dishes that were added
 * later.
 */
export function pairWithOracle<T extends { name: string }>(
  dishNames: string[],
  // deno-lint-ignore no-explicit-any
  items: any[],
  missing: "throw" | "skip",
  // deno-lint-ignore no-explicit-any
): { name: string; item: any }[] {
  // deno-lint-ignore no-explicit-any
  const paired: { name: string; item: any }[] = [];
  for (const name of dishNames) {
    const item = items.find((candidate) => candidate?.name === name);
    if (!item) {
      if (missing === "throw") {
        throw new Error(`model returned no item named ${name}`);
      }
      continue;
    }
    paired.push({ name, item });
  }
  return paired;
}
