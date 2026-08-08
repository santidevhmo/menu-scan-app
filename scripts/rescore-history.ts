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

const oracleFile = JSON.parse(
  await Deno.readTextFile("scripts/fixtures/macro-oracle.json"),
);
const BAND: Record<string, number> = { cal: 0.2, p: 0.3, c: 0.3, f: 0.3 };
// PASTEL beans tolerance (Santiago 2026-08-08): a field fails only if it misses
// under BOTH readings - beans outside (the shipped oracle) and beans inside.
const BEANS_INSIDE: Record<string, number> = {
  cal: 452,
  p: 39.2,
  c: 31.4,
  f: 19.9,
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

const out = ["run              failed/36   mean|err|"];
for (const run of RUNS) {
  let fails = 0, errSum = 0, n = 0;
  for (let d = 0; d < 3; d++) {
    for (const item of await replayDraw(run, d)) {
      // deno-lint-ignore no-explicit-any
      const dish = oracleFile.find((o: any) => o.name === item.name);
      if (!dish) continue;
      // Three archive eras, three scoring paths - each run must be re-scored
      // the way IT was scored, or the comparison is meaningless.
      const ings = item.ingredients ?? [];
      const first = ings[0] ?? {};
      let got: Record<string, number>;
      if (first.protein_per_100g !== undefined) {
        // B12 onward: per-100 g composition, summed and priced in code.
        const m = sumIngredientMacros(
          archivedIngredients(ings),
          item.printed_total_g,
        );
        got = { cal: m.estimated_calories, p: m.protein_g, c: m.carb_g, f: m.fat_g };
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
          cal: Math.round(4 * s.p + 4 * s.c + 9 * s.f),
          p: Math.round(s.p),
          c: Math.round(s.c),
          f: Math.round(s.f),
        };
      } else {
        // baseline-002 and B1: no per-ingredient macros existed. Those runs were
        // scored on the model's own item-level numbers.
        got = {
          cal: item.estimated_calories,
          p: item.protein_g,
          c: item.carb_g,
          f: item.fat_g,
        };
      }
      const want: Record<string, number> = {
        cal: dish.oracle.calories,
        p: dish.oracle.protein_g,
        c: dish.oracle.carb_g,
        f: dish.oracle.fat_g,
      };
      const isPastel = item.name.startsWith("PASTEL");
      for (const k of ["cal", "p", "c", "f"]) {
        const err = Math.abs(got[k] - want[k]) / want[k];
        errSum += err;
        n++;
        const altMiss = isPastel
          ? Math.abs(got[k] - BEANS_INSIDE[k]) / BEANS_INSIDE[k] > BAND[k]
          : true;
        if (err > BAND[k] && altMiss) fails++;
      }
    }
  }
  out.push(
    `${run.padEnd(16)} ${String(fails).padStart(6)}/36   ${
      (errSum / n * 100).toFixed(1)
    }%`,
  );
}
console.log(out.join("\n"));
