// $0 CEILING: if the MASS of every unweighted dish were right, what would we score?
//
// WHY THIS IS WORTH RE-ASKING. Arm A ("ask the model for the plate's total grams")
// measured 12/72 and the family was retired. But it was measured BEFORE the dual
// pass, against an assembly running ~1.81 kcal/g, and the note it left behind -
// "correcting the total cannot fix this, rescaling preserves proportions" - was
// true of THAT assembly. Today's dual pass runs ~2.3 kcal/g and 5 of 6 unweighted
// dishes are now INSIDE their oracle's implied density band while 3 of 6 are
// outside their MASS band. The premise that retired the family may have expired.
//
// This is NOT an arm and cannot ship: it reads each dish's answer from the oracle.
// It only bounds what a mass fix could be worth before one is designed.
//
// Scores through scoreItemAgainstBand - the harness's own scorer - so the control
// row must reproduce the published number exactly. A hand-rolled scorer got 33
// where the harness gets 36, which is precisely the divergence lesson 28 forbids.
//
//   deno run --allow-read scripts/sim-mass-ceiling.ts
import { scoreItemAgainstBand } from "./macro-band-score.ts";

const CACHE = "scripts/fixtures/caches";
const ORACLE = "scripts/fixtures/unweighted-oracle.json";
const MENUS = ["andaluz", "bistro", "nikkori"];
const DRAWS = 3;

// deno-lint-ignore no-explicit-any
type Item = any;

const oracle: Item[] = JSON.parse(await Deno.readTextFile(ORACLE));
const byName = new Map(oracle.map((e) => [e.name, e]));

/** Resolved grams, replicating resolveGrams exactly. */
function grams(it: Item): number[] {
  const ings: Item[] = it.ingredients ?? [];
  const inside = ings.reduce(
    (s, i) => i.within_printed_weight ? s + (i.typical_serving_g ?? 0) : s,
    0,
  );
  const p = it.printed_total_g;
  const scale = p && inside > 0 ? p / inside : 1;
  return ings.map((i) =>
    i.within_printed_weight
      ? (i.typical_serving_g ?? 0) * scale
      : (i.typical_serving_g ?? 0)
  );
}

/**
 * The item's macros, scaled by `k`.
 *
 * Reads the ARCHIVED totals rather than recomputing them from the ingredients,
 * because that is what `bench-unweighted.ts` scores. Recomputing diverges on
 * ENSALADA GRIEGA (5 points against the harness's 8) and would have made every
 * row here quietly incomparable to the published figures - lesson 28 exactly.
 *
 * Scaling every ingredient's grams by k and scaling the totals by k are the same
 * arithmetic, because composition is per 100 g and the sum is linear in grams.
 */
function macrosScaled(it: Item, k: number) {
  return {
    calories: (it.estimated_calories ?? 0) * k,
    protein_g: (it.protein_g ?? 0) * k,
    carb_g: (it.carb_g ?? 0) * k,
    fat_g: (it.fat_g ?? 0) * k,
  };
}

type Mode = null | "lo" | "mid" | "hi" | "clamp";
const MODES: [string, Mode][] = [
  ["today (control)", null],
  // The FAIREST reading of "if the mass were right": leave a dish that is already
  // inside its band alone, and move one that is outside only as far as the nearest
  // edge. Forcing every dish to the band's midpoint is not a mass correction - it
  // breaks CARBONARA, which is at 281 g inside a wide 250-450 band and scores 12/12
  // today. That difference is the whole reason this mode exists.
  ["mass -> clamped into band", "clamp"],
  ["mass -> bottom of band", "lo"],
  ["mass -> middle of band", "mid"],
  ["mass -> top of band", "hi"],
];

const perDish = new Map<string, Map<string, number>>();
const totals: Record<string, [number, number]> = {};

for (const [label, mode] of MODES) {
  let pts = 0, poss = 0;
  const dish = new Map<string, number>();
  for (let d = 0; d < DRAWS; d++) {
    for (const menu of MENUS) {
      let raw: string;
      try {
        raw = await Deno.readTextFile(
          `${CACHE}/unweighted.dual-f.${menu}-d${d}.raw.json`,
        );
      } catch {
        continue;
      }
      for (const it of JSON.parse(raw).items as Item[]) {
        const e = byName.get(it.name);
        if (!e || !(it.ingredients ?? []).length) continue;
        const total = grams(it).reduce((s, g) => s + g, 0);
        if (total <= 0) continue;
        let k = 1;
        if (mode) {
          const [lo, hi] = e.mass_band_g;
          const target = mode === "clamp"
            ? Math.min(Math.max(total, lo), hi)
            : mode === "lo"
            ? lo
            : mode === "hi"
            ? hi
            : (lo + hi) / 2;
          k = target / total;
        }
        const { fields } = scoreItemAgainstBand(e.band, macrosScaled(it, k));
        const p = fields.filter((f: Item) => f.pass).length;
        pts += p;
        poss += fields.length;
        dish.set(it.name, (dish.get(it.name) ?? 0) + p);
      }
    }
  }
  perDish.set(label, dish);
  totals[label] = [pts, poss];
}

console.log("UNWEIGHTED - points in band, higher is better\n");
console.log(`${"rule".padEnd(26)} ${"points".padStart(10)}`);
for (const [label] of MODES) {
  const [p, n] = totals[label];
  console.log(`${label.padEnd(26)} ${`${p}/${n}`.padStart(10)}`);
}

console.log("\nper dish:");
const names = [...new Set([...perDish.values()].flatMap((m) => [...m.keys()]))]
  .sort();
console.log(
  `${"dish".padEnd(22)}` +
    MODES.map(([l]) => l.split(" ")[0].padStart(10)).join(""),
);
for (const n of names) {
  console.log(
    `${n.slice(0, 20).padEnd(22)}` +
      MODES.map(([l]) => String(perDish.get(l)!.get(n) ?? 0).padStart(10)).join(
        "",
      ),
  );
}

console.log(
  "\nThe control row MUST read 36/72, the published dual-pass score." +
    "\nAnything else means this scorer is not the harness's and no row is believable.",
);
