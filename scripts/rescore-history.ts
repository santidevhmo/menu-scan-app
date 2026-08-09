// $0 re-score of every archived run against the CURRENT oracle. No model calls.
//
// Why this exists separately from `BENCH_RESCORE=1`: the harness runs the
// CURRENT scoring path, which is correct for a run archived today and wrong for
// one archived before the path existed. There are three eras in the archive and
// each run has to be re-scored the way IT was scored, or the comparison is
// meaningless:
//
//   baseline-002, iter-b1-001  ingredients carry no macros -> item-level totals
//   iter-b10/b11-001           per-ingredient macros as AMOUNTS -> sum them
//   iter-b12 onward            per-100 g composition -> the current path
//
// The oracle has now been re-frozen twice and every published figure in the log
// depends on this. Kept so those figures stay reproducible rather than being
// numbers someone once printed.
//
// Run: deno run --allow-read scripts/rescore-history.ts
import { archivedIngredients, replayDraw } from "./bench-macros.ts";
import { sumIngredientMacros } from "../supabase/functions/analyze-menu/enrich.ts";
import { type MacroValues, scoreItem } from "./macro-score.ts";

const oracleFile = JSON.parse(
  await Deno.readTextFile("scripts/fixtures/macro-oracle.json"),
);
// The bands live in macro-score.ts and are read from there, never restated. This
// file used to keep its own copy, so the 2026-08-09 sub-3g floor would have
// applied to new runs and not to the history they are compared against - the
// exact drift that made the first re-score attempt print a tidy, false table.
// PASTEL beans tolerance (Santiago 2026-08-08): a field fails only if it misses
// under BOTH readings - beans outside (the shipped oracle) and beans inside.
const BEANS_INSIDE: MacroValues = {
  calories: 452,
  protein_g: 39.2,
  carb_g: 31.4,
  fat_g: 19.9,
};

const RUNS = [
  "baseline-002",
  "iter-b1-001",
  "iter-b10-001",
  "iter-b11-001",
  "iter-b12-001",
  "iter-b13-001",
  "iter-b4-001",
  "iter-b4-002",
  "iter-b4-003",
  "iter-b4-004",
];

// Run IDs may be supplied on the command line, so a new arm is scored by the
// SAME path as the history it will be compared against.
const runs = Deno.args.length ? Deno.args : RUNS;
const DRAWS = 3;

const out = ["run              failed        mean|err|   abs-floor"];
for (const run of runs) {
  let fails = 0, errSum = 0, n = 0, fieldDraws = 0, absolutes = 0;
  for (let d = 0; d < DRAWS; d++) {
    for (const item of await replayDraw(run, d)) {
      // deno-lint-ignore no-explicit-any
      const dish = oracleFile.find((o: any) => o.name === item.name);
      if (!dish) continue;
      // Three archive eras, three scoring paths - each run must be re-scored
      // the way IT was scored, or the comparison is meaningless.
      const ings = item.ingredients ?? [];
      const first = ings[0] ?? {};
      let got: MacroValues;
      if (first.protein_per_100g !== undefined) {
        // B12 onward: per-100 g composition, summed and priced in code.
        const m = sumIngredientMacros(
          archivedIngredients(ings),
          item.printed_total_g,
        );
        got = {
          calories: m.estimated_calories,
          protein_g: m.protein_g,
          carb_g: m.carb_g,
          fat_g: m.fat_g,
        };
      } else if (first.protein_g !== undefined) {
        // B10/B11: per-ingredient macros as AMOUNTS in the serving; the code of
        // the day summed them and derived calories by Atwater.
        // deno-lint-ignore no-explicit-any
        const s = ings.reduce((a: any, i: any) => ({
          p: a.p + (i.protein_g ?? 0),
          c: a.c + (i.carb_g ?? 0),
          f: a.f + (i.fat_g ?? 0),
        }), { p: 0, c: 0, f: 0 });
        got = {
          calories: Math.round(4 * s.p + 4 * s.c + 9 * s.f),
          protein_g: Math.round(s.p),
          carb_g: Math.round(s.c),
          fat_g: Math.round(s.f),
        };
      } else {
        // baseline-002 and B1: no per-ingredient macros existed. Those runs were
        // scored on the model's own item-level numbers.
        got = {
          calories: item.estimated_calories,
          protein_g: item.protein_g,
          carb_g: item.carb_g,
          fat_g: item.fat_g,
        };
      }
      const want: MacroValues = dish.oracle;
      const shipped = scoreItem(want, got);
      // PASTEL only: a field survives if EITHER reading of the beans passes.
      const alt = item.name.startsWith("PASTEL")
        ? scoreItem(BEANS_INSIDE, got)
        : null;

      for (const [i, verdict] of shipped.fields.entries()) {
        fieldDraws++;
        if (!verdict.pass && !alt?.fields[i].pass) fails++;
        // A field decided by the absolute floor has no meaningful percentage -
        // "0 g carb" on a steak is a 100% error and a correct answer. Counted
        // for pass/fail, excluded from the mean, and reported so the exclusion
        // is visible rather than silent.
        if (verdict.absolute) {
          absolutes++;
          continue;
        }
        // The mean is always measured against the SHIPPED oracle - one dish
        // having a second acceptable reading must not flatter its error.
        errSum += Math.abs(verdict.model - verdict.oracle) / verdict.oracle;
        n++;
      }
    }
  }
  out.push(
    `${run.padEnd(16)} ${`${fails}/${fieldDraws}`.padStart(6)}   ${
      `${(errSum / n * 100).toFixed(1)}%`.padStart(8)
    }   ${absolutes}`,
  );
}
console.log(out.join("\n"));
