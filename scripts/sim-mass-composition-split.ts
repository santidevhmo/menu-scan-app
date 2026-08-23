// $0. ARE MASS AND COMPOSITION SEPARABLE LEVERS?
//
// Arm ORDER (2026-08-21) put 21 of 27 dish-draws INSIDE their mass band against
// the shipped dual's 14, and still scored LOWER (61/108 vs 67/108). Changing the
// gram question moved the per-100 g composition too, even though nothing asked
// it to. This crosses the two: each arm's MASS priced at each arm's DENSITY.
//
// The off-diagonal cells are NOT arms. No single call produces them. They answer
// one question only: if a design could take one arm's sizing and another's
// recipe, would that be worth building?
//
//   deno run --allow-read scripts/sim-mass-composition-split.ts dual ORDER
//
// ⚠️ Scored through the harness's OWN scoreItemAgainstBand, never a local copy.
// A hand-rolled version of this rule read 88/108 for the control where the
// harness reads 67, because it applied the 6 g / 50 kcal allowance to the band
// EDGES; the allowance is measured from the band MIDPOINT. The control row is
// asserted below for exactly that reason - eval 158's guard printed its
// invariant instead of enforcing it, and nobody could act on it.
import { scoreItemAgainstBand } from "./macro-band-score.ts";
import type { UnweightedEntry } from "./unweighted-oracle.ts";

const ORACLE = "scripts/fixtures/unweighted-oracle.json";
const CACHE = "scripts/fixtures/caches";
const DRAWS = 3;

const oracle: UnweightedEntry[] = JSON.parse(await Deno.readTextFile(ORACLE));
const arms = Deno.args.filter((a) => !a.startsWith("--"));
// "NOBOOST@r2" -> "NOBOOST-f-r2", the shape bench-unweighted --run writes. A bare
// arm name is unchanged, so every command already in START-HERE still resolves.
function armFile(arm: string): string {
  const [name, label] = arm.split("@");
  return `${name}-f${label ? `-${label}` : ""}`;
}

if (arms.length < 1) throw new Error("give at least one arm name");

/** Mass and per-100 g-of-DISH composition, per dish per draw. */
type Shape = { mass: number; per100: Record<string, number> };

async function read(arm: string): Promise<Map<string, (Shape | null)[]>> {
  const out = new Map<string, (Shape | null)[]>();
  for (const e of oracle) out.set(e.name, Array(DRAWS).fill(null));
  // Menus DERIVED from the oracle - three sims hardcoded a menu list and each
  // silently reported a ceiling over 6 of 9 dishes (eval 158).
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
        if (!out.has(item.name)) continue;
        // deno-lint-ignore no-explicit-any
        const ing: any[] = item.ingredients ?? [];
        const mass = ing.reduce((s, i) => s + (i.typical_serving_g ?? 0), 0);
        if (mass <= 0) continue;
        const per100: Record<string, number> = {};
        for (const [macro, key] of [
          ["protein_g", "protein_per_100g"],
          ["carb_g", "carb_per_100g"],
          ["fat_g", "fat_per_100g"],
        ] as const) {
          per100[macro] = ing.reduce(
            (s, i) => s + (i.typical_serving_g ?? 0) * (i[key] ?? 0),
            0,
          ) / mass;
        }
        out.get(item.name)![draw] = { mass, per100 };
      }
    }
  }
  return out;
}

/** Atwater on the recombined dish, the same arithmetic sumIngredientMacros does. */
function scoreCell(
  entry: UnweightedEntry,
  mass: number,
  per100: Record<string, number>,
): number {
  const protein = (per100.protein_g * mass) / 100;
  const carb = (per100.carb_g * mass) / 100;
  const fat = (per100.fat_g * mass) / 100;
  // ROUNDED exactly as sumIngredientMacros rounds, with calories from the
  // UNROUNDED sums. Not cosmetic: band edges are integers, so an unrounded 38.6
  // g of protein fails a band starting at 39 that the shipped pipeline passes.
  // Skipping this read 63 for the control against its published 67.
  const { fields } = scoreItemAgainstBand(entry.band, {
    calories: Math.round(4 * protein + 4 * carb + 9 * fat),
    protein_g: Math.round(protein),
    carb_g: Math.round(carb),
    fat_g: Math.round(fat),
  });
  return fields.filter((f) => f.pass).length;
}

const shapes = new Map<string, Map<string, (Shape | null)[]>>();
for (const arm of arms) shapes.set(arm, await read(arm));

// The DIAGONAL must reproduce each arm's published score, or every off-diagonal
// cell is noise. Recomputing from ingredients is not identical to the harness,
// which scores each item's ARCHIVED totals - so a small gap is expected and a
// large one is a defect. Threshold is deliberate, not decorative.
const TOLERANCE = 3;
const published: Record<string, number> = { dual: 67, baseline: 60 };

console.log(
  `\nrows = whose MASS, columns = whose COMPOSITION (points /${
    oracle.length * 4 * DRAWS
  })\n`,
);
const header = arms.map((a) => a.padStart(8)).join("");
console.log(`${"".padEnd(16)}${header}`);

const diagonal = new Map<string, number>();
for (const massArm of arms) {
  const cells: string[] = [];
  for (const compArm of arms) {
    let total = 0;
    let scored = 0;
    for (const e of oracle) {
      for (let d = 0; d < DRAWS; d++) {
        const m = shapes.get(massArm)!.get(e.name)![d];
        const c = shapes.get(compArm)!.get(e.name)![d];
        if (!m || !c) continue;
        total += scoreCell(e, m.mass, c.per100);
        scored++;
      }
    }
    if (massArm === compArm) diagonal.set(massArm, total);
    cells.push(
      (scored === oracle.length * DRAWS ? `${total}` : `${total}*`).padStart(8),
    );
  }
  console.log(`${massArm.padEnd(16)}${cells.join("")}`);
}
console.log(
  "\n* = some dish-draw had no archive for one of the two arms and was skipped.",
);

for (const [arm, got] of diagonal) {
  const want = published[arm];
  if (want === undefined) continue;
  if (Math.abs(got - want) > TOLERANCE) {
    throw new Error(
      `control row for "${arm}" recomputes ${got} against a published ${want} ` +
        `(tolerance ${TOLERANCE}). Every off-diagonal cell above is therefore ` +
        `unusable - fix the recomputation before quoting any of them.`,
    );
  }
  console.log(
    `✓ ${arm} recomputes ${got} against its published ${want} (within ${TOLERANCE})`,
  );
}
