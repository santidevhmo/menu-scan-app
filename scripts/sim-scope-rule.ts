// $0 simulation of the printed-weight SCOPE rule, on the 8-dish weighted set.
//
// The scope question - "does a menu's printed 200 g already include the bread and
// beans served with it?" - is not answered anywhere in code. It is answered per
// ingredient, per scan, by the model's `within_printed_weight` flag. This scores
// what the archived runs WOULD have produced under each candidate rule, so the
// ruling is made on evidence instead of on preference.
//
//   C (today)  the model decides per ingredient
//   A          the printed weight covers the WHOLE plate - every ingredient in
//
// Option B (the menu's own words decide) is NOT simulated: it needs a menu-text
// classifier that does not exist, and on this fixture set it would differ from C
// only where the model already disagrees with the menu wording. Build it only if
// A and C are close enough that B is worth the work.
//
// Scores through macro-measure.ts, the same path rescore-history.ts uses, so the
// numbers are comparable to every published figure. No model calls.
//
//   deno run --allow-read scripts/sim-scope-rule.ts
import { ORACLE_PATH, replayDraw } from "./bench-macros.ts";
import { altOracle, pairWithOracle, scoreDish, toMacroValues } from "./macro-measure.ts";
import { parseItemGrams } from "../supabase/functions/analyze-menu/postprocess.ts";

const oracleFile = JSON.parse(await Deno.readTextFile(ORACLE_PATH));
// w1 was never archived; the published B21 figures are these three runs.
const RUNS = ["iter-b21-w2", "iter-b21-w3", "iter-b21-w4"];
const DRAWS = 3;

/** Option A: nothing escapes the fit, so every ingredient is inside. */
// deno-lint-ignore no-explicit-any
function allInside(item: any) {
  return {
    ...item,
    // deno-lint-ignore no-explicit-any
    ingredients: (item.ingredients ?? []).map((i: any) => ({
      ...i,
      within_printed_weight: true,
    })),
  };
}

const RULES: Record<string, (i: unknown) => unknown> = {
  "C (today, model decides)": (i) => i,
  "A (printed = whole plate)": allInside,
};

console.log(`${"rule".padEnd(28)} ${"failed/96".padStart(10)} ${"mean|err|".padStart(10)}`);
const perDish: Record<string, Map<string, number>> = {};
for (const [label, transform] of Object.entries(RULES)) {
  let fails = 0, fieldDraws = 0, errSum = 0, n = 0;
  perDish[label] = new Map();
  for (const run of RUNS) {
    for (let d = 0; d < DRAWS; d++) {
      const drawItems = await replayDraw(run, d);
      for (
        const { name, item } of pairWithOracle(
          // deno-lint-ignore no-explicit-any
          oracleFile.map((o: any) => o.name),
          drawItems,
          "skip",
        )
      ) {
        // deno-lint-ignore no-explicit-any
        const dish = oracleFile.find((o: any) => o.name === name);
        const [parsed] = parseItemGrams([{
          name: dish.name,
          description: dish.description,
          price: dish.price,
          category: dish.category,
          section_title: dish.section_title,
          options: dish.options,
          grams: null,
          // deno-lint-ignore no-explicit-any
        } as any]);
        const v = scoreDish(
          name,
          dish.oracle,
          toMacroValues(transform(item)),
          altOracle(dish, parsed.grams),
        );
        for (const [i, verdict] of v.fields.entries()) {
          fieldDraws++;
          if (!v.passes[i]) {
            fails++;
            perDish[label].set(name, (perDish[label].get(name) ?? 0) + 1);
          }
          if (verdict.absolute) continue;
          errSum += Math.abs(verdict.model - verdict.oracle) / verdict.oracle;
          n++;
        }
      }
    }
  }
  console.log(
    `${label.padEnd(28)} ${`${fails}/${fieldDraws}`.padStart(10)} ` +
      `${(100 * errSum / n).toFixed(1).padStart(9)}%`,
  );
}

console.log("\nfailed fields per dish (4 runs x 3 draws, 48 fields each):");
const names = [...new Set(Object.values(perDish).flatMap((m) => [...m.keys()]))];
console.log(`${"dish".padEnd(26)} ${"C today".padStart(9)} ${"A".padStart(9)}`);
for (const name of names.sort()) {
  const c = perDish["C (today, model decides)"].get(name) ?? 0;
  const a = perDish["A (printed = whole plate)"].get(name) ?? 0;
  const mark = a === c ? "" : a < c ? "  <- A better" : "  <- A worse";
  console.log(
    `${name.slice(0, 24).padEnd(26)} ${String(c).padStart(9)} ${String(a).padStart(9)}${mark}`,
  );
}
