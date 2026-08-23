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

/** `--drop=A,B` -> {A, B}. Used for the pizza sensitivity row: dishes sharing one
 *  class ruling are not independent, and the bootstrap resamples dishes. */
export function parseDrop(args: string[]): Set<string> {
  const flag = args.find((a) => a.startsWith("--drop="));
  if (!flag) return new Set();
  return new Set(
    flag.slice("--drop=".length).split(",").map((s) => s.trim()).filter(
      Boolean,
    ),
  );
}

/** "NOBOOST@r2" -> "NOBOOST-f-r2". Same convention as the other sims. */
function armFile(arm: string): string {
  const [name, label] = arm.split("@");
  return `${name}-f${label ? `-${label}` : ""}`;
}

/**
 * What one scored draw contributes: the 4 pass/fail flags the band rule gives, and
 * the CONTINUOUS error the band rule throws away.
 *
 * `logErr` is mean |ln(model / band midpoint)| over the 4 macros. Log scale because
 * mass is a positive quantity and a 2x overestimate should weigh the same as a 2x
 * underestimate - on a raw-percentage scale they are 100% and 50%. The midpoint is
 * the reference because that is already where the band rule measures its 6 g /
 * 50 kcal allowance from.
 *
 * `massLogErr` is the same on the dish's total grams. It is a DIAGNOSTIC, not the
 * decision metric: arm ORDER sized better and scored worse, so an arm must be
 * judged on the macros it produces, never on the mass alone.
 */
type Draw = { pass: boolean[]; logErr: number; massLogErr: number | null };

/** dish -> one entry per scored draw. */
async function read(
  spec: string,
  oracle: UnweightedEntry[],
): Promise<Map<string, Draw[]>> {
  const out = new Map<string, Draw[]>();
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
          const got = {
            calories: item.estimated_calories ?? 0,
            protein_g: item.protein_g ?? 0,
            carb_g: item.carb_g ?? 0,
            fat_g: item.fat_g ?? 0,
          };
          const { fields } = scoreItemAgainstBand(entry.band, got);
          const errs: number[] = [];
          for (const [macro, band] of Object.entries(entry.band)) {
            const mid = (band[0] + band[1]) / 2;
            // A zero model answer has no finite log ratio. Clamped to 1 g/kcal
            // rather than dropped, or a catastrophic miss would leave the sample
            // and FLATTER the arm that produced it.
            const v = got[macro as keyof typeof got];
            if (mid > 0) errs.push(Math.abs(Math.log(Math.max(v, 1) / mid)));
          }
          // deno-lint-ignore no-explicit-any
          const ings: any[] = item.ingredients ?? [];
          const mass = ings.reduce((s, i) => s + (i.typical_serving_g ?? 0), 0);
          const massMid = (entry.mass_band_g[0] + entry.mass_band_g[1]) / 2;
          out.get(item.name)!.push({
            pass: fields.map((f) => f.pass),
            logErr: errs.reduce((a, b) => a + b, 0) / errs.length,
            massLogErr: mass > 0 && massMid > 0
              ? Math.abs(Math.log(mass / massMid))
              : null,
          });
        }
      }
    }
  }
  return out;
}

// Per-dish MEAN points per draw, so pooling two runs of one arm against one run of
// another compares like with like instead of rewarding whoever has more draws.
type Row = {
  dish: string;
  a: number;
  b: number;
  eA: number;
  eB: number;
  mA: number | null;
  mB: number | null;
};

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Mean per-dish difference, its 95% CI, and how often B leads. */
function bootstrap(rows: Row[], diffOf: (r: Row) => number) {
  const obs = mean(rows.map(diffOf));
  const ds: number[] = [];
  let wins = 0;
  for (let i = 0; i < RESAMPLES; i++) {
    let d = 0;
    for (let j = 0; j < rows.length; j++) {
      d += diffOf(rows[Math.floor(Math.random() * rows.length)]);
    }
    d /= rows.length;
    ds.push(d);
    if (d > 0) wins++;
  }
  ds.sort((x, y) => x - y);
  return {
    obs,
    lo: ds[Math.floor(RESAMPLES * 0.025)],
    hi: ds[Math.floor(RESAMPLES * 0.975)],
    winFrac: wins / RESAMPLES,
  };
}

// Exact two-sided binomial on the discordant pairs, p = 0.5.
function logC(n: number, k: number): number {
  let s = 0;
  for (let i = 1; i <= k; i++) s += Math.log(n - k + i) - Math.log(i);
  return s;
}

if (import.meta.main) {
  const oracle: UnweightedEntry[] = JSON.parse(await Deno.readTextFile(ORACLE));
  const args = Deno.args.filter((a) => !a.startsWith("--"));
  if (args.length !== 2) {
    throw new Error(
      "give exactly two arms to compare, e.g. dual NOBOOST (or dual+dual@r2 NOBOOST+NOBOOST@r2)",
    );
  }

  const [specA, specB] = args;
  const A = await read(specA, oracle);
  const B = await read(specB, oracle);

  const points = (draws: Draw[]) =>
    draws.reduce((n, d) => n + d.pass.filter(Boolean).length, 0);
  const logErr = (draws: Draw[]) => mean(draws.map((d) => d.logErr));
  const massErr = (draws: Draw[]) => {
    const xs = draws.map((d) => d.massLogErr).filter((x): x is number =>
      x !== null
    );
    return xs.length ? mean(xs) : null;
  };

  const dropped = parseDrop(Deno.args);
  const rows: Row[] = [];
  for (const e of oracle) {
    if (dropped.has(e.name)) continue;
    const da = A.get(e.name)!, db = B.get(e.name)!;
    if (da.length === 0 || db.length === 0) continue;
    rows.push({
      dish: e.name,
      a: points(da) / da.length,
      b: points(db) / db.length,
      eA: logErr(da),
      eB: logErr(db),
      mA: massErr(da),
      mB: massErr(db),
    });
  }
  if (rows.length === 0) throw new Error("no dish has archives for both arms");

  console.log(
    `\nPAIRED ON ${rows.length} DISHES — band points per draw (out of 4, higher better)` +
      ` and log-ratio error (lower better)\n`,
  );
  console.log(
    `  ${"dish".padEnd(18)} ${"band A".padStart(7)} ${"band B".padStart(7)} ${
      "diff".padStart(6)
    }   ${"logerr A".padStart(9)} ${"logerr B".padStart(9)} ${
      "diff".padStart(7)
    }`,
  );
  for (const r of rows) {
    const d = r.b - r.a;
    const de = r.eB - r.eA;
    console.log(
      `  ${r.dish.padEnd(18)} ${r.a.toFixed(2).padStart(7)} ${
        r.b.toFixed(2).padStart(7)
      } ${(d >= 0 ? "+" : "") + d.toFixed(2)}`.padEnd(50) +
        `${r.eA.toFixed(3).padStart(9)} ${r.eB.toFixed(3).padStart(9)} ${
          (de >= 0 ? "+" : "") + de.toFixed(3)
        }`,
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
  const sign = (x: number) => (x >= 0 ? "+" : "");
  const band = bootstrap(rows, (r) => r.b - r.a);
  // Points live on the published /108 scale: 9 dishes x 4 macros x 3 draws.
  const S = rows.length * DRAWS;
  console.log(
    `\n① DISH-LEVEL PAIRED BOOTSTRAP — BAND METRIC (${RESAMPLES} resamples of ${rows.length} dishes)` +
      `\n   observed ${sign(band.obs * S)}${(band.obs * S).toFixed(1)},` +
      ` 95% CI ${sign(band.lo * S)}${(band.lo * S).toFixed(1)} to ${
        sign(band.hi * S)
      }${(band.hi * S).toFixed(1)}` +
      ` on the /${rows.length * 4 * DRAWS} scale` +
      `\n   ${specB} ahead in ${
        (100 * band.winFrac).toFixed(1)
      }% of resamples` +
      `\n   → ${
        band.lo > 0 || band.hi < 0
          ? "the CI EXCLUDES zero: the difference survives clustering at the dish level"
          : `the CI INCLUDES zero: NOT resolvable at ${rows.length} dishes on this metric`
      }`,
  );

  // ---- 1a. the SAME bootstrap on a CONTINUOUS metric
  // The band rule scores 4 coin-flips per dish and discards magnitude: a dish 21%
  // off and a dish 300% off both score one fail. Mean |ln(model / band midpoint)|
  // keeps that magnitude, so the same 9 dishes carry more information. Lower is
  // better, so a NEGATIVE difference favours the second arm.
  const cont = bootstrap(rows, (r) => r.eB - r.eA);
  const mrows = rows.filter((r) => r.mA !== null && r.mB !== null);
  console.log(
    `\n①a THE SAME BOOTSTRAP ON LOG-RATIO ERROR — mean |ln(model / band midpoint)|` +
      ` over the 4 macros. LOWER IS BETTER.` +
      `\n   ${specA} ${mean(rows.map((r) => r.eA)).toFixed(4)}   ${specB} ${
        mean(rows.map((r) => r.eB)).toFixed(4)
      }` +
      `\n   observed ${sign(cont.obs)}${cont.obs.toFixed(4)},` +
      ` 95% CI ${sign(cont.lo)}${cont.lo.toFixed(4)} to ${sign(cont.hi)}${
        cont.hi.toFixed(4)
      }` +
      `\n   ${specB} lower (better) in ${
        (100 * (1 - cont.winFrac)).toFixed(1)
      }% of resamples` +
      `\n   → ${
        cont.lo > 0 || cont.hi < 0
          ? "the CI EXCLUDES zero: RESOLVABLE on this metric"
          : `the CI INCLUDES zero: NOT resolvable at ${rows.length} dishes on this metric either`
      }`,
  );
  // Effect relative to the noise it has to clear. Comparable across metrics because
  // both are the same ratio, which is the whole point of running them side by side.
  const snr = (b: { obs: number; lo: number; hi: number }) =>
    Math.abs(b.obs) / ((b.hi - b.lo) / 2);
  console.log(
    `\n   RESOLVING POWER (|effect| ÷ CI half-width, higher = more detectable):` +
      `\n     band metric      ${snr(band).toFixed(2)}` +
      `\n     log-ratio metric ${snr(cont).toFixed(2)}` +
      `\n   → ${
        snr(cont) > snr(band)
          ? `the continuous metric is ${
            (snr(cont) / snr(band)).toFixed(1)
          }x more sensitive on this comparison`
          : "the continuous metric is NOT more sensitive here"
      }`,
  );

  // HOW MANY DISHES WOULD IT TAKE? A bootstrap CI half-width shrinks as 1/sqrt(n), so
  // the n at which |effect| equals the half-width - the point where the CI just
  // excludes zero - is n_now / snr^2. This assumes the effect size and the
  // between-dish spread hold as dishes are added, which is exactly what a wider
  // oracle would test. Treat it as an order of magnitude, not a target.
  const needed = (b: { obs: number; lo: number; hi: number }) =>
    Math.ceil(rows.length / (snr(b) ** 2));
  console.log(
    `\n   DISHES NEEDED to resolve an effect THIS SIZE (n_now / snr², 1/√n scaling):` +
      `\n     on the band metric      ~${needed(band)} dishes` +
      `\n     on the log-ratio metric ~${needed(cont)} dishes` +
      `\n   ⚠️ Order of magnitude only - it assumes this effect size and this` +
      ` between-dish spread survive the widening.`,
  );
  if (mrows.length) {
    const massB = bootstrap(rows, (r) => r.mB! - r.mA!);
    console.log(
      `\n①b MASS-ONLY log-ratio (⚠️ DIAGNOSTIC, never the verdict — arm ORDER sized` +
        ` better and scored worse)` +
        `\n   ${specA} ${mean(mrows.map((r) => r.mA!)).toFixed(4)}   ${specB} ${
          mean(mrows.map((r) => r.mB!)).toFixed(4)
        }   observed ${sign(massB.obs)}${massB.obs.toFixed(4)}` +
        `  95% CI ${sign(massB.lo)}${massB.lo.toFixed(4)} to ${sign(massB.hi)}${
          massB.hi.toFixed(4)
        }`,
    );
  }

  // ---- 1b. leave-one-dish-out
  // A 9-dish set can have its whole headline carried by one row, and "the ranges are
  // disjoint" would still be true while describing one dish rather than a general
  // improvement. This names the dish instead of leaving it to be noticed.
  // `observed` is a SUM over dishes, so dropping one is a subtraction - and the
  // remaining total lives on a SMALLER denominator, which is why that is printed too
  // rather than silently compared against the 9-dish scale.
  const loo = rows.map((r) => ({
    dish: r.dish,
    without: observed - (r.b - r.a),
  }));
  loo.sort((x, y) => x.without - y.without);
  const outOf = (rows.length - 1) * 4 * DRAWS;
  console.log(
    `\n①c LEAVE-ONE-DISH-OUT — the difference recomputed with each dish removed` +
      `\n   (${DRAWS} draws over the remaining ${
        rows.length - 1
      } dishes, /${outOf})`,
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
        if (da[d].pass[m] && !db[d].pass[m]) b++;
        if (!da[d].pass[m] && db[d].pass[m]) c++;
      }
    }
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
}
