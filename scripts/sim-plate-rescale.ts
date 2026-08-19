// $0 SIMULATION. Answers "is the plate anchor worth another paid arm?" from
// archives already on disk, before spending anything.
//
// Arm A did two things at once: it asked for a plate weight AND rewrote the
// ingredient list (measured: dishes whose anchor was never applied still moved).
// This separates them. It takes the BASELINE's ingredient list - the one the
// deployed prompt produces - and rescales it to the plate weight Arm A returned,
// through the real sumIngredientMacros. That is the arm where the plate weight
// arrives WITHOUT the prompt's collateral damage, which is what Arm C tried to
// be and what a code-side sanity check would be.
//
// A threshold sweep is included because a plate weight is only worth applying
// where it disagrees with the sum: the design question is "how far off does the
// ingredient sum have to be before we overrule it?"
//
//   deno run --allow-read scripts/sim-plate-rescale.ts
import { sumIngredientMacros } from "../supabase/functions/analyze-menu/enrich.ts";
import { scoreItemAgainstBand } from "./macro-band-score.ts";
import type { UnweightedEntry } from "./unweighted-oracle.ts";

const CACHE = "scripts/fixtures/caches";
const DRAWS = 3;
const oracle: UnweightedEntry[] = JSON.parse(
  await Deno.readTextFile("scripts/fixtures/unweighted-oracle.json"),
);
const MENU: Record<string, string> = {
  CAPRICCIOSA: "bistro",
  CARBONARA: "bistro",
  "ENSALADA GRIEGA": "bistro",
  "TIRAS DE POLLO": "andaluz",
  "COLIFLOR ROKA": "andaluz",
  "Salmón Roll": "nikkori",
};

// deno-lint-ignore no-explicit-any
const load = async (f: string): Promise<any[]> =>
  JSON.parse(await Deno.readTextFile(`${CACHE}/${f}`)).items;

// deno-lint-ignore no-explicit-any
const macros = (it: any) => ({
  calories: it.estimated_calories ?? 0,
  protein_g: it.protein_g ?? 0,
  carb_g: it.carb_g ?? 0,
  fat_g: it.fat_g ?? 0,
});

// Apply the plate weight only when the ingredient sum disagrees by more than
// this factor either way. 1.0 means "always apply", Infinity means "never".
const THRESHOLDS = [1.0, 1.15, 1.3, 1.5, 2.0, Infinity];
const totals = new Map<number, number>();
const perDish = new Map<string, Map<number, number>>();

for (const t of THRESHOLDS) totals.set(t, 0);
for (const e of oracle) {
  perDish.set(e.name, new Map(THRESHOLDS.map((t) => [t, 0])));
}

let scored = 0;
for (let d = 0; d < DRAWS; d++) {
  for (const entry of oracle) {
    const menu = MENU[entry.name];
    const base = (await load(`unweighted.${menu}-d${d}.raw.json`))
      .find((i) => i.name === entry.name);
    const armA = (await load(`unweighted.A.${menu}-d${d}.raw.json`))
      .find((i) => i.name === entry.name);
    if (!base || !armA) {
      console.log(`  ${entry.name} d${d}: MISSING from an archive`);
      continue;
    }
    const ingredients = base.ingredients ?? [];
    if (ingredients.length === 0) continue;
    scored++;

    const sum = ingredients.reduce(
      // deno-lint-ignore no-explicit-any
      (n: number, g: any) => n + (g.typical_serving_g ?? 0),
      0,
    );
    const plate = armA._plate_g ?? 0;
    const ratio = sum > 0 ? plate / sum : 0;

    for (const t of THRESHOLDS) {
      // Outside the threshold -> trust the plate. Inside -> keep the sum.
      const apply = plate > 0 && sum > 0 &&
        (ratio >= t || ratio <= 1 / t) && t !== Infinity;
      const values = apply
        ? macros({ ...base, ...sumIngredientMacros(ingredients, plate) })
        : macros(base);
      const points =
        scoreItemAgainstBand(entry.band, values).fields.filter((f) => f.pass)
          .length;
      totals.set(t, totals.get(t)! + points);
      perDish.get(entry.name)!.set(t, perDish.get(entry.name)!.get(t)! + points);
    }
  }
}

const label = (t: number) => (t === Infinity ? "never" : `x${t.toFixed(2)}`);
console.log(
  `\nSIMULATED: baseline ingredient list rescaled to Arm A's plate weight`,
);
console.log(`${scored} dish-draws scored, ${scored * 4} points available\n`);
console.log(
  `${"dish".padEnd(18)}${THRESHOLDS.map((t) => label(t).padStart(9)).join("")}`,
);
for (const e of oracle) {
  console.log(
    `${e.name.slice(0, 17).padEnd(18)}${
      THRESHOLDS.map((t) => String(perDish.get(e.name)!.get(t)).padStart(9))
        .join("")
    }`,
  );
}
console.log(
  `${"TOTAL".padEnd(18)}${
    THRESHOLDS.map((t) => `${totals.get(t)}`.padStart(9)).join("")
  }`,
);
console.log(
  `\n"never" (${totals.get(Infinity)}) is the measured baseline and is the control.` +
    `\nA threshold only earns a paid run if it beats that column by more than a few points.` +
    `\n⚠️ SIMULATION: it reuses Arm A's plate weights, which were produced by a prompt that` +
    `\nalso rewrote the ingredient list. A real arm must get the plate weight some other way.`,
);
