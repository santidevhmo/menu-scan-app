// $0. IS THE DIFFERENCE BETWEEN TWO ARMS REAL, OR INSIDE THE NOISE?
//
// Written 2026-08-21 after an external research review made a specific, checkable
// charge against this phase's method: "the 108 points are NOT independent - 4
// macros within a dish are driven by the same mass error and 3 draws are repeated
// measures. The effective sample size is closer to 9 clusters, not 108. At n=9 the
// minimum detectable effect is roughly 15-20 percentage points, meaning you
// currently cannot claim any single-digit improvement is real."
//
// That charge lands on the phase's ONLY win (NOBOOST 70-72 vs dual 64-67), so it
// gets tested rather than believed. Two tests, both paired on the same dishes:
//
//   1. DISH-LEVEL PAIRED BOOTSTRAP - resamples the 9 DISHES with replacement,
//      which is the unit the review says we actually have. This is the honest one:
//      it inherits whatever within-dish correlation exists instead of assuming it
//      away, because a dish is either in a resample or out of it, with all its
//      macros and draws attached.
//   2. McNEMAR-STYLE EXACT SIGN TEST on discordant CELLS. Reported second and
//      labelled, because it treats 108 correlated cells as independent and is
//      therefore ANTICONSERVATIVE - it is here to show how much the naive view
//      overstates confidence, not to support a claim.
//
//   deno run --allow-read scripts/sim-arm-significance.ts dual NOBOOST
//   deno run --allow-read scripts/sim-arm-significance.ts dual+dual@r2 NOBOOST+NOBOOST@r2
//
// `A+B` pools runs of the same arm, so a two-run range is tested as one sample.
//
// ⚠️ Scores each dish's ARCHIVED totals through the harness's own
// scoreItemAgainstBand - the same call bench-unweighted makes - so the per-arm
// totals printed here must equal the published ones exactly. A hand-rolled version
// of this rule once read 88/108 where the harness reads 67.
import { scoreItemAgainstBand } from "./macro-band-score.ts";
import type { UnweightedEntry } from "./unweighted-oracle.ts";
import { isBackfilled } from "./bench-pipeline.ts";

const ORACLE = "scripts/fixtures/unweighted-oracle.json";
const CACHE = "scripts/fixtures/caches";
const DRAWS = 3;
const RESAMPLES = 10_000;

const oracle: UnweightedEntry[] = JSON.parse(await Deno.readTextFile(ORACLE));
const args = Deno.args.filter((a) => !a.startsWith("--"));
if (args.length !== 2) {
  throw new Error(
    "give exactly two arms to compare, e.g. dual NOBOOST (or dual+dual@r2 NOBOOST+NOBOOST@r2)",
  );
}

/** "NOBOOST@r2" -> "NOBOOST-f-r2". Same convention as the other sims. */
function armFile(arm: string): string {
  const [name, label] = arm.split("@");
  return `${name}-f${label ? `-${label}` : ""}`;
}

/** dish -> one entry per scored draw, each a 4-length pass/fail array. */
async function read(spec: string): Promise<Map<string, boolean[][]>> {
  const out = new Map<string, boolean[][]>();
  for (const e of oracle) out.set(e.name, []);
  for (const arm of spec.split("+")) {
    for (const menu of [...new Set(oracle.map((e) => e.menu))]) {
      for (let draw = 0; draw < DRAWS; draw++) {
        let raw: string;
        try {
          raw = await Deno.readTextFile(
            `${CACHE}/unweighted.${armFile(arm)}.${menu}-d${draw}.raw.json`,
          );
        } catch {
          continue;
        }
        for (const item of JSON.parse(raw).items) {
          const entry = oracle.find((e) => e.name === item.name);
          // A BACKFILLED item is all zeros and fails every band by construction -
          // excluded here for the same reason bench-unweighted excludes it.
          if (!entry || isBackfilled(item)) continue;
          const { fields } = scoreItemAgainstBand(entry.band, {
            calories: item.estimated_calories ?? 0,
            protein_g: item.protein_g ?? 0,
            carb_g: item.carb_g ?? 0,
            fat_g: item.fat_g ?? 0,
          });
          out.get(item.name)!.push(fields.map((f) => f.pass));
        }
      }
    }
  }
  return out;
}

const [specA, specB] = args;
const A = await read(specA);
const B = await read(specB);

const points = (draws: boolean[][]) =>
  draws.reduce((n, d) => n + d.filter(Boolean).length, 0);

// Per-dish MEAN points per draw, so pooling two runs of one arm against one run of
// another compares like with like instead of rewarding whoever has more draws.
type Row = { dish: string; a: number; b: number; nA: number; nB: number };
const rows: Row[] = [];
for (const e of oracle) {
  const da = A.get(e.name)!, db = B.get(e.name)!;
  if (da.length === 0 || db.length === 0) continue;
  rows.push({
    dish: e.name,
    a: points(da) / da.length,
    b: points(db) / db.length,
    nA: da.length,
    nB: db.length,
  });
}
if (rows.length === 0) throw new Error("no dish has archives for both arms");

console.log(`\nPAIRED ON ${rows.length} DISHES — mean points per draw, out of 4\n`);
console.log(
  `  ${"dish".padEnd(18)} ${specA.padStart(12)} ${specB.padStart(12)}   diff`,
);
for (const r of rows) {
  const d = r.b - r.a;
  console.log(
    `  ${r.dish.padEnd(18)} ${r.a.toFixed(2).padStart(12)} ${
      r.b.toFixed(2).padStart(12)
    }  ${d >= 0 ? "+" : ""}${d.toFixed(2)}`,
  );
}
const meanA = rows.reduce((s, r) => s + r.a, 0);
const meanB = rows.reduce((s, r) => s + r.b, 0);
const observed = meanB - meanA;
console.log(
  `\n  per-draw totals: ${specA} ${meanA.toFixed(1)}/${rows.length * 4}, ` +
    `${specB} ${meanB.toFixed(1)}/${rows.length * 4}` +
    `  →  scaled to ${DRAWS} draws: ${(meanA * DRAWS).toFixed(0)} vs ${
      (meanB * DRAWS).toFixed(0)
    } /${rows.length * 4 * DRAWS}`,
);
console.log(
  `  observed difference: ${observed >= 0 ? "+" : ""}${
    observed.toFixed(2)
  } points per draw = ${(observed * DRAWS).toFixed(1)} on the /${
    rows.length * 4 * DRAWS
  } scale`,
);

// ---- 1. dish-level paired bootstrap
// Resamples DISHES, not cells. Each draw of that dish travels with it, so the
// within-dish correlation the review names is preserved rather than assumed away.
const diffs: number[] = [];
let wins = 0;
for (let i = 0; i < RESAMPLES; i++) {
  let d = 0;
  for (let j = 0; j < rows.length; j++) {
    const r = rows[Math.floor(Math.random() * rows.length)];
    d += r.b - r.a;
  }
  diffs.push(d);
  if (d > 0) wins++;
}
diffs.sort((x, y) => x - y);
const lo = diffs[Math.floor(RESAMPLES * 0.025)];
const hi = diffs[Math.floor(RESAMPLES * 0.975)];
console.log(
  `\n① DISH-LEVEL PAIRED BOOTSTRAP (${RESAMPLES} resamples of ${rows.length} dishes)` +
    `\n   95% CI on the difference: ${lo >= 0 ? "+" : ""}${
      (lo * DRAWS).toFixed(1)
    } to ${hi >= 0 ? "+" : ""}${(hi * DRAWS).toFixed(1)} points` +
    ` on the /${rows.length * 4 * DRAWS} scale` +
    `\n   ${specB} ahead in ${(100 * wins / RESAMPLES).toFixed(1)}% of resamples` +
    `\n   → ${
      lo > 0 || hi < 0
        ? "the CI EXCLUDES zero: the difference survives clustering at the dish level"
        : "the CI INCLUDES zero: this difference is NOT resolvable at 9 dishes"
    }`,
);

// ---- 1b. leave-one-dish-out
// A 9-dish set can have its whole headline carried by one row, and "the ranges are
// disjoint" would still be true while describing one dish rather than a general
// improvement. This names the dish instead of leaving it to be noticed.
// `observed` is a SUM over dishes, so dropping one is a subtraction - and the
// remaining total lives on a SMALLER denominator, which is why that is printed too
// rather than silently compared against the 9-dish scale.
const loo = rows.map((r) => ({ dish: r.dish, without: observed - (r.b - r.a) }));
loo.sort((x, y) => x.without - y.without);
const outOf = (rows.length - 1) * 4 * DRAWS;
console.log(
  `\n①b LEAVE-ONE-DISH-OUT — the difference recomputed with each dish removed` +
    `\n   (${DRAWS} draws over the remaining ${rows.length - 1} dishes, /${outOf})`,
);
for (const l of loo.slice(0, 3)) {
  console.log(
    `   without ${l.dish.padEnd(18)} ${l.without >= 0 ? "+" : ""}${
      (l.without * DRAWS).toFixed(1)
    } /${outOf}`,
  );
}
const flip = loo.find((l) => (l.without > 0) !== (observed > 0));
if (flip) {
  console.log(
    `   ⚠️  REMOVING ${flip.dish} REVERSES THE SIGN. The headline is that dish, not the arm.`,
  );
}

// ---- 2. cell-level exact sign test, ANTICONSERVATIVE and labelled as such
// Pairs draw i of one arm with draw i of the other. The draws are independent
// samples, not repeated measures of one thing, so this pairing is arbitrary - it
// is reported to show how much the naive 108-independent-cells view inflates
// confidence, not to support a conclusion.
let b = 0, c = 0;
for (const e of oracle) {
  const da = A.get(e.name)!, db = B.get(e.name)!;
  for (let d = 0; d < Math.min(da.length, db.length); d++) {
    for (let m = 0; m < 4; m++) {
      if (da[d][m] && !db[d][m]) b++;
      if (!da[d][m] && db[d][m]) c++;
    }
  }
}
// Exact two-sided binomial on the discordant pairs, p = 0.5.
function logC(n: number, k: number): number {
  let s = 0;
  for (let i = 1; i <= k; i++) s += Math.log(n - k + i) - Math.log(i);
  return s;
}
const n = b + c;
const kMin = Math.min(b, c);
let p = 0;
for (let k = 0; k <= kMin; k++) p += Math.exp(logC(n, k) - n * Math.LN2);
p = Math.min(1, 2 * p);
console.log(
  `\n② CELL-LEVEL EXACT SIGN TEST — ⚠️ ANTICONSERVATIVE, treats ${n} correlated` +
    ` cells as independent` +
    `\n   discordant: ${specA} only ${b}, ${specB} only ${c}  →  p = ${
      p.toExponential(2)
    }` +
    `\n   Quote ① and not this. It is here to show the size of the overstatement.`,
);
