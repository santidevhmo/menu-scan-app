// $0 DIAGNOSIS of the under-decomposition defect. No model calls, nothing deployed.
//
// THE FINDING IT TESTS. Archived items the menu DESCRIBED come back with 5.34
// ingredients at 1.90 kcal/g; items it did NOT describe come back with 2.37 at
// 1.43, and 44% of those are under 1.2 kcal/g - a density a plate of cooked food
// essentially never has. The hypothesis is that the model names the headline food
// and drops the preparation (batter, frying oil, sauce, cheese).
//
// WHY A DENSITY YARDSTICK RATHER THAN THE ORACLE. Fitting a correction to the 14
// scored dishes would flatter itself and teach nothing about the other menus
// (lesson 28). kcal/g needs no oracle, so it runs over EVERY archived item on
// EVERY menu - which is what makes the claim general rather than fixture-specific.
//
// TWO SEPARATE QUESTIONS, deliberately not merged:
//   1. HOW BIG is the population? (all menus, no oracle - generality)
//   2. WHAT IS THE PRIZE if it were fixed? (the 14 scored dishes - points)
//
// Question 2 is a CEILING, not a proposal: it asks what the score becomes if the
// lean items were merely brought to the density of the DESCRIBED items on the same
// menus. It is not an arm, not a prompt, and not something that can ship.
//
//   deno run --allow-read scripts/sim-decomposition-ceiling.ts
import { loadOracle, ORACLE_PATH } from "./bench-macros.ts";
import {
  altOracle,
  pairWithOracle,
  scoreDish,
  toMacroValues,
} from "./macro-measure.ts";
import { scoreItemAgainstBand } from "./macro-band-score.ts";
import { sumIngredientMacros } from "../supabase/functions/analyze-menu/enrich.ts";
import { itemsFromArchiveFile } from "./bench-pipeline.ts";
import { MENU_ARCHIVE as MIXED_MENUS } from "./bench-mixed-menu.ts";

const CACHE = "scripts/fixtures/caches";
const UNWEIGHTED_ORACLE_PATH = "scripts/fixtures/unweighted-oracle.json";
const MIXED_RUNS = ["dual-f", "dual-f-r2", "dual-f-r3"];
/**
 * DERIVED from the unweighted oracle, never hardcoded. This used to read
 * ["andaluz", "bistro", "nikkori"] and did not grow when el-marcos and
 * brasero-two joined on 2026-08-20, so the unweighted half of this sim silently
 * covered 6 of 9 dishes. Deriving it means adding a dish extends the sim.
 */
const UNWEIGHTED_MENUS = [
  ...new Set(
    (JSON.parse(Deno.readTextFileSync(UNWEIGHTED_ORACLE_PATH)) as Item[])
      .map((e) => e.menu),
  ),
];
const DRAWS = 3;

// deno-lint-ignore no-explicit-any
type Item = any;

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

function densityOf(it: Item): { kcal: number; g: number; dens: number } {
  const ings: Item[] = it.ingredients ?? [];
  const gs = grams(it);
  let kcal = 0, g = 0;
  ings.forEach((i, n) => {
    g += gs[n];
    kcal += ((i.protein_per_100g ?? 0) * 4 + (i.carb_per_100g ?? 0) * 4 +
      (i.fat_per_100g ?? 0) * 9) * gs[n] / 100;
  });
  return { kcal, g, dens: g > 0 ? kcal / g : 0 };
}

// ============================================================ 1. THE POPULATION
// Every archived item, every menu, no oracle involved.
const pop = { described: [] as number[], bare: [] as number[] };
const ingCount = { described: [] as number[], bare: [] as number[] };
let scanned = 0;

for await (const entry of Deno.readDir(CACHE)) {
  if (!entry.name.endsWith(".raw.json")) continue;
  let parsed: Item;
  try {
    parsed = JSON.parse(await Deno.readTextFile(`${CACHE}/${entry.name}`));
  } catch {
    continue;
  }
  if (!parsed?.items) continue;
  for (const it of parsed.items) {
    // Enriched items only, and FOOD only - a drink is legitimately near 0 kcal/g
    // and would fake the whole result.
    if (!it.ingredients?.length || it.category !== "food") continue;
    const { dens } = densityOf(it);
    if (dens <= 0) continue;
    scanned++;
    const key = (it.description ?? "").trim() ? "described" : "bare";
    pop[key].push(dens);
    ingCount[key].push(it.ingredients.length);
  }
}

const median = (a: number[]) =>
  [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] ?? 0;
const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const leanPct = (a: number[]) =>
  100 * a.filter((d) => d < 1.2).length / (a.length || 1);

console.log(
  "1. THE POPULATION - every archived FOOD item, every menu, no oracle\n",
);
console.log(`scanned: ${scanned} items\n`);
console.log(
  `${"menu text".padEnd(18)} ${"items".padStart(7)} ${
    "ingredients".padStart(12)
  } ` +
    `${"kcal/g".padStart(8)} ${"under 1.2".padStart(10)}`,
);
for (const k of ["described", "bare"] as const) {
  console.log(
    `${(k === "bare" ? "NO description" : "described").padEnd(18)} ` +
      `${String(pop[k].length).padStart(7)} ${
        mean(ingCount[k]).toFixed(2).padStart(12)
      } ` +
      `${median(pop[k]).toFixed(2).padStart(8)} ${
        `${leanPct(pop[k]).toFixed(0)}%`.padStart(10)
      }`,
  );
}

// ================================================================ 2. THE PRIZE
// The ceiling: what if a lean item were merely as dense as this pipeline's OWN
// described items? Applied by scaling FAT only - the macro measured lowest on
// both scoreboards - because scaling every macro would just be a mass change,
// which Arm P already tested and which is a different experiment.
const TARGET = median(pop.described);

/** Raise an item's fat until it reaches the described-item density. Never lowers. */
function liftLeanFat(it: Item, target: number): Item {
  const { dens } = densityOf(it);
  if (dens <= 0 || dens >= target) return it;
  const gs = grams(it);
  const ings: Item[] = it.ingredients ?? [];
  const totalG = gs.reduce((s, g) => s + g, 0);
  if (totalG <= 0) return it;
  // kcal needed, delivered as fat at 9 kcal/g, spread across the item's grams.
  const needKcal = (target - dens) * totalG;
  const addFatPer100 = (needKcal / 9) / (totalG / 100);
  return {
    ...it,
    ingredients: ings.map((i) => ({
      ...i,
      fat_per_100g: (i.fat_per_100g ?? 0) + addFatPer100,
    })),
  };
}

const MODES: [string, (it: Item) => Item][] = [
  ["today (control)", (it) => it],
  [
    `lift lean items to ${TARGET.toFixed(2)} kcal/g`,
    (it) => liftLeanFat(it, TARGET),
  ],
];

console.log(`\n\n2. THE PRIZE - the 14 scored dishes only`);
console.log(
  `   ceiling = lift any item under ${
    TARGET.toFixed(2)
  } kcal/g up to it, via fat\n`,
);

const entries = loadOracle(ORACLE_PATH);
console.log("WEIGHTED (failed fields, lower is better)");
const wPerDish = new Map<string, Map<string, number>>();
for (const [label, fn] of MODES) {
  let fails = 0, fieldDraws = 0;
  const perDish = new Map<string, number>();
  for (const run of MIXED_RUNS) {
    for (let d = 0; d < DRAWS; d++) {
      for (const menu of Object.keys(MIXED_MENUS)) {
        let raw: string;
        try {
          raw = await Deno.readTextFile(
            `${CACHE}/mixed.${run}.${menu}-d${d}.raw.json`,
          );
        } catch {
          continue;
        }
        const enriched: Item[] = JSON.parse(raw).items;
        const sent = itemsFromArchiveFile(MIXED_MENUS[menu]);
        const names = entries.filter((e) => e.menu === menu).map((e) => e.name);
        for (const { name, item } of pairWithOracle(names, enriched, "skip")) {
          const entry = entries.find((e) => e.name === name)!;
          const g = (sent.find((i) =>
            i.name === name
          ) as { grams?: number | null } | undefined)
            ?.grams ?? null;
          const v = scoreDish(
            name,
            entry.oracle!,
            toMacroValues(fn(item)),
            altOracle(entry, g),
          );
          const f = v.passes.filter((p) =>
            !p
          ).length;
          fails += f;
          fieldDraws += v.passes.length;
          perDish.set(name, (perDish.get(name) ?? 0) + f);
        }
      }
    }
  }
  wPerDish.set(label, perDish);
  console.log(`  ${label.padEnd(38)} ${`${fails}/${fieldDraws}`.padStart(9)}`);
}

console.log("\nUNWEIGHTED (points in band, higher is better)");
const uEntries: Item[] = JSON.parse(
  await Deno.readTextFile(UNWEIGHTED_ORACLE_PATH),
);
const uPerDish = new Map<string, Map<string, number>>();
for (const [label, fn] of MODES) {
  let total = 0, possible = 0;
  const perDish = new Map<string, number>();
  for (let d = 0; d < DRAWS; d++) {
    for (const menu of UNWEIGHTED_MENUS) {
      let raw: string;
      try {
        raw = await Deno.readTextFile(
          `${CACHE}/unweighted.dual-f.${menu}-d${d}.raw.json`,
        );
      } catch {
        continue;
      }
      const enriched: Item[] = JSON.parse(raw).items;
      for (const e of uEntries.filter((x: Item) => x.menu === menu)) {
        const item = enriched.find((i: Item) => i.name === e.name);
        if (!item) continue;
        const lifted = fn(item);
        const t = sumIngredientMacros(
          lifted.ingredients ?? [],
          lifted.printed_total_g,
        );
        const { fields } = scoreItemAgainstBand(e.band, {
          calories: t.estimated_calories,
          protein_g: t.protein_g,
          carb_g: t.carb_g,
          fat_g: t.fat_g,
        });
        const pts = fields.filter((f: Item) => f.pass).length;
        total += pts;
        possible += fields.length;
        perDish.set(e.name, (perDish.get(e.name) ?? 0) + pts);
      }
    }
  }
  uPerDish.set(label, perDish);
  console.log(`  ${label.padEnd(38)} ${`${total}/${possible}`.padStart(9)}`);
}

console.log("\nper dish:");
for (
  const [title, m] of [["WEIGHTED (failed)", wPerDish], [
    "UNWEIGHTED (points)",
    uPerDish,
  ]] as const
) {
  console.log(`\n  ${title}`);
  const names = [...new Set([...m.values()].flatMap((x) => [...x.keys()]))]
    .sort();
  console.log(
    `  ${"dish".padEnd(26)}${
      MODES.map(([l]) => l.slice(0, 9).padStart(11)).join("")
    }`,
  );
  for (const n of names) {
    console.log(
      `  ${n.slice(0, 24).padEnd(26)}` +
        MODES.map(([l]) => String(m.get(l)!.get(n) ?? 0).padStart(11)).join(""),
    );
  }
}

console.log(
  "\nThe control row MUST reproduce the published score, or this simulation's" +
    "\narithmetic is not the harnesses' and no other row means anything.",
);
