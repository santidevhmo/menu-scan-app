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
import { replayDraw } from "./bench-macros.ts";
import { pairWithOracle, scoreDish, toMacroValues } from "./macro-measure.ts";

const oracleFile = JSON.parse(
  await Deno.readTextFile("scripts/fixtures/macro-oracle.json"),
);
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
      // deno-lint-ignore no-explicit-any
      const dish = oracleFile.find((o: any) => o.name === name);
      const shipped = scoreDish(name, dish.oracle, toMacroValues(item));
      for (const [i, verdict] of shipped.fields.entries()) {
        fieldDraws++;
        if (!shipped.passes[i]) fails++;
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
