// $0: what does "close enough" cost, and does loosening it RIG the benchmark?
//
// ⚠️ HISTORICAL, 2026-08-19. This sweep informed Santiago's 2026-08-20 ruling and
// its job is done. `deriveBands` now emits the average dish +/-20%, so this
// script's "today's bands" row reads the NEW bands and every other row widens an
// already-widened band. The old mass-derived rule survives as
// `deriveBandsFromMassRange`, but the oracle FILE does not store the compositions
// needed to rebuild the old bands from it, so the comparison below cannot be
// reproduced as it originally ran. Kept for the record; do not quote its numbers
// as current.
//
// THE QUESTION. Every unweighted band is `mass range x one fixed composition`, so
// its width is the MASS range's width and nothing else. CAPRICCIOSA's mass is
// pinned to 400-450 g, so its fat band is 39-44 - a +/-6% bar that nobody chose.
// CARBONARA's mass range is 250-450 g, so it gets +/-29%. The dish with the widest
// band scores 12/12 and the dish with the narrowest scores 3/12.
//
// So this sweep replaces each band with "the band's midpoint, +/- T" and reports
// the score at each T.
//
// 🔴 THE GUARD, AND IT IS THE WHOLE POINT. Loosening a benchmark until the number
// looks good is rigging. The defence is that the SHIPPED pipeline and the PRE-DUAL
// baseline are scored at every T: if the gap between them holds, T is measuring
// tolerance; if the gap collapses, T is measuring nothing and must be rejected.
// This is the same baseline-gap check that guarded the 2026-08-09 oracle re-freeze.
//
//   deno run --allow-read scripts/sim-tolerance-sweep.ts
import { scoreItemAgainstBand } from "./macro-band-score.ts";

const CACHE = "scripts/fixtures/caches";
const ORACLE = "scripts/fixtures/unweighted-oracle.json";
const MENUS = ["andaluz", "bistro", "nikkori"];
const DRAWS = 3;

// deno-lint-ignore no-explicit-any
type Item = any;

const oracle: Item[] = JSON.parse(await Deno.readTextFile(ORACLE));
const byName = new Map(oracle.map((e) => [e.name, e]));

/** The band's own midpoint, widened to +/- tol. tol === null keeps the band as-is. */
function widen(band: [number, number], tol: number | null): [number, number] {
  if (tol === null) return band;
  const mid = (band[0] + band[1]) / 2;
  return [mid * (1 - tol), mid * (1 + tol)];
}

const TOLS: [string, number | null][] = [
  ["today's bands", null],
  ["+/-10%", 0.10],
  ["+/-15%", 0.15],
  ["+/-20%", 0.20],
  ["+/-25%", 0.25],
  ["+/-30%", 0.30],
];

/** `dual-f` is the SHIPPED path; `baseline-f` is the pre-dual-pass control. */
const ARMS = ["dual-f", "baseline-f"];

const score: Record<string, Record<string, [number, number]>> = {};
const perDish = new Map<string, Map<string, number>>();

for (const arm of ARMS) {
  score[arm] = {};
  for (const [label, tol] of TOLS) {
    let pts = 0, poss = 0;
    const dish = perDish.get(label) ?? new Map<string, number>();
    for (let d = 0; d < DRAWS; d++) {
      for (const menu of MENUS) {
        let raw: string;
        try {
          raw = await Deno.readTextFile(
            `${CACHE}/unweighted.${arm}.${menu}-d${d}.raw.json`,
          );
        } catch {
          continue;
        }
        for (const it of JSON.parse(raw).items as Item[]) {
          const e = byName.get(it.name);
          if (!e || !(it.ingredients ?? []).length) continue;
          const bands = Object.fromEntries(
            Object.entries(e.band).map((
              [k, v],
            ) => [k, widen(v as [number, number], tol)]),
          );
          const { fields } = scoreItemAgainstBand(bands as Item, {
            calories: it.estimated_calories ?? 0,
            protein_g: it.protein_g ?? 0,
            carb_g: it.carb_g ?? 0,
            fat_g: it.fat_g ?? 0,
          });
          const p = fields.filter((f: Item) => f.pass).length;
          pts += p;
          poss += fields.length;
          if (arm === "dual-f") dish.set(it.name, (dish.get(it.name) ?? 0) + p);
        }
      }
    }
    score[arm][label] = [pts, poss];
    if (arm === "dual-f") perDish.set(label, dish);
  }
}

console.log("How close must the app get before we call it right?\n");
console.log(
  `${"tolerance".padEnd(16)} ${"SHIPPED".padStart(10)} ${
    "pre-dual".padStart(10)
  } ` +
    `${"gap".padStart(8)}   guard`,
);
const baseGap = score["dual-f"]["today's bands"][0] -
  score["baseline-f"]["today's bands"][0];
for (const [label] of TOLS) {
  const [d, dn] = score["dual-f"][label];
  const [b] = score["baseline-f"][label];
  const gap = d - b;
  // The shipped pipeline must stay clearly ahead of the pre-dual control. A gap
  // that shrinks toward zero means the tolerance has stopped discriminating.
  const verdict = gap >= baseGap * 0.6
    ? "ok - still discriminates"
    : "🔴 GAP COLLAPSING - rigging";
  console.log(
    `${label.padEnd(16)} ${`${d}/${dn}`.padStart(10)} ${
      `${b}/${dn}`.padStart(10)
    } ` +
      `${String(gap).padStart(8)}   ${verdict}`,
  );
}

console.log("\nper dish, SHIPPED pipeline:");
const names = [...new Set([...perDish.values()].flatMap((m) => [...m.keys()]))]
  .sort();
console.log(
  `${"dish".padEnd(22)}` + TOLS.map(([l]) => l.padStart(14)).join(""),
);
for (const n of names) {
  console.log(
    `${n.slice(0, 20).padEnd(22)}` +
      TOLS.map(([l]) => String(perDish.get(l)!.get(n) ?? 0).padStart(14)).join(
        "",
      ),
  );
}

console.log(
  "\n⚠️ This sweep proposes NOTHING. Widening a band is an oracle change and" +
    "\nSantiago rules on those. It only shows what each bar would cost and whether" +
    "\nthe benchmark would still tell the two pipelines apart.",
);
