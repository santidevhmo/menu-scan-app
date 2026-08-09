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
import { ORACLE_PATH, replayDraw } from "./bench-macros.ts";
import { altOracle, pairWithOracle, scoreDish, toMacroValues } from "./macro-measure.ts";
import { parseItemGrams } from "../supabase/functions/analyze-menu/postprocess.ts";

const oracleFile = JSON.parse(await Deno.readTextFile(ORACLE_PATH));
// The 3-dish runs are RETIRED (their /36 figures must never be quoted as current)
// but stay here so their history re-scores under the same path. The -w runs are the
// live 8-dish set, and they are in the default list so the bare command reports
// CURRENT numbers instead of only the retired ones.
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
  "baseline-w1",
  "baseline-w2",
  "baseline-w3",
  "baseline-w4",
  "iter-b4-w1",
  "iter-b4-w2",
  "iter-b4-w3",
  "iter-b4-w4",
  "b9-gpt55-w1",
  "b9-gpt55-w2",
  "b9-gpt55-w3",
  "b9-gpt55-w4",
];

// Run IDs may be supplied on the command line, so a new arm is scored by the
// SAME path as the history it will be compared against.
// ponytail: a plain flag, not an env var - env reads throw under the documented
// `--allow-read`-only command, and a flag is discoverable where an env var is not.
const BY_DISH = Deno.args.includes("--by-dish");
const runArgs = Deno.args.filter((a) => !a.startsWith("--"));
const runs = runArgs.length ? runArgs : RUNS;
const DRAWS = 3;
const byDish = new Map<string, { fails: number; errSum: number; n: number; fieldDraws: number }>();

const out = ["run              failed        mean|err|   abs-floor"];
for (const run of runs) {
  let fails = 0, errSum = 0, n = 0, fieldDraws = 0, absolutes = 0;
  for (let d = 0; d < DRAWS; d++) {
    const drawItems = await replayDraw(run, d);
    // Archives legitimately predate dishes added later, so an absent dish is
    // skipped here - unlike a live run, where it is a defect.
    for (
      const { name, item } of pairWithOracle(
        // deno-lint-ignore no-explicit-any
        oracleFile.map((o: any) => o.name),
        drawItems,
        "skip",
      )
    ) {
      if (!byDish.has(name)) byDish.set(name, { fails: 0, errSum: 0, n: 0, fieldDraws: 0 });
      const dishTotals = byDish.get(name)!;
      // deno-lint-ignore no-explicit-any
      const dish = oracleFile.find((o: any) => o.name === name);
      // The printed weight comes from the SAME parser production uses, so the
      // second reading is anchored to the same number the pipeline sees.
      const [parsed] = parseItemGrams([{
        name: dish.name,
        description: dish.description,
        price: dish.price,
        category: dish.category,
        section_title: dish.section_title,
        options: dish.options,
        grams: null,
      }]);
      const shipped = scoreDish(
        name,
        dish.oracle,
        toMacroValues(item),
        altOracle(dish, parsed.grams),
      );
      for (const [i, verdict] of shipped.fields.entries()) {
        fieldDraws++;
        dishTotals.fieldDraws++;
        if (!shipped.passes[i]) fails++;
        if (!shipped.passes[i]) dishTotals.fails++;
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
        dishTotals.errSum += Math.abs(verdict.model - verdict.oracle) / verdict.oracle;
        dishTotals.n++;
      }
    }
  }
  out.push(
    `${run.padEnd(16)} ${`${fails}/${fieldDraws}`.padStart(6)}   ${
      `${(errSum / n * 100).toFixed(1)}%`.padStart(8)
    }   ${absolutes}`,
  );
}
if (BY_DISH) {
  out.push("", "dish                         failed        mean|err|");
  for (const [name, totals] of byDish) {
    out.push(
      `${name.padEnd(28)} ${`${totals.fails}/${totals.fieldDraws}`.padStart(6)}   ${
        `${(totals.errSum / totals.n * 100).toFixed(1)}%`.padStart(8)
      }`,
    );
  }
}
console.log(out.join("\n"));
