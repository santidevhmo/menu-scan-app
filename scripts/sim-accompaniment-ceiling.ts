// $0 CEILING for the accompaniment defect. No model calls, nothing deployed.
//
// THE QUESTION IT ANSWERS, and the only one: if the model sized every
// accompaniment PERFECTLY, how many points would the score move? That is the
// most any arm could ever be worth, so it decides whether an arm is worth
// designing at all. The published defect figure ("24% of weighted items, 12-20%
// of their calories") is about CALORIES; it has never been converted to POINTS,
// and points are what a run is judged on.
//
// It is NOT a fix, NOT a prompt, NOT an arm, and it changes nothing that ships.
// It rewrites archived responses in memory and re-scores them.
//
// The rewrite is deliberately CRUDE - one multiplier applied to every ingredient
// the model marked `within_printed_weight: false`. Santiago's rule is that a side
// is smaller AS A SIDE than as a plate of its own, and the sweep asks how much
// smaller before it stops helping. A sweep, not a fitted constant: a single
// tuned number would be fitted to eight dishes and would not generalise (lesson
// 28 - measurement code that flatters itself redirects every future iteration).
//
//   1.00x  today, the control - must reproduce the published score exactly
//   0.50x  Santiago's chimichurri ruling (30 g -> 15 g)
//   ORACLE the exact weights he has already ruled, per dish - the true ceiling
//
// Two scores, NEVER merged (see START-HERE): weighted /96 and unweighted /72.
//
//   deno run --allow-read scripts/sim-accompaniment-ceiling.ts
import { loadOracle, ORACLE_PATH } from "./bench-macros.ts";
import {
  altOracle,
  pairWithOracle,
  scoreDish,
  toMacroValues,
} from "./macro-measure.ts";
import { scoreItemAgainstBand } from "./macro-band-score.ts";
import { itemsFromArchiveFile } from "./bench-pipeline.ts";
import { sumIngredientMacros } from "../supabase/functions/analyze-menu/enrich.ts";
// The harness's OWN map, imported rather than retyped: a second copy of which
// extraction feeds which menu is a second thing to drift, and a wrong one here
// would silently score the fixtures against the wrong neighbours.
import { MENU_ARCHIVE as MIXED_MENUS } from "./bench-mixed-menu.ts";

const CACHE = "scripts/fixtures/caches";
const UNWEIGHTED_ORACLE_PATH = "scripts/fixtures/unweighted-oracle.json";
const DRAWS = 3;

/** The runs each score is derived from. Every one is committed. */
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

// deno-lint-ignore no-explicit-any
type Item = any;

/**
 * Santiago's ruled as-served weights, taken from apply-accompaniment-rulings.ts
 * rather than retyped - a second copy of a ruled number is a second thing to
 * drift. Keyed by a fragment of the INGREDIENT name because the model's wording
 * varies between draws ("chimichurri" / "Chimichurri").
 *
 * Every entry here is a weight Santiago personally ruled, with USDA provenance
 * recorded in the oracle's `assumed` field. Nothing is invented.
 */
const RULED_G: { dish: RegExp; ingredient: RegExp; grams: number }[] = [
  { dish: /NEW YORK|RIB EYE/i, ingredient: /chimichurri/i, grams: 15 },
  { dish: /Salmone toscano/i, ingredient: /baguette|bread/i, grams: 15 },
  { dish: /PASTEL AZTECA/i, ingredient: /bean|frijol/i, grams: 30 },
];

/** Rewrite an archived item's accompaniments. Body ingredients are never touched. */
function rescaleAccompaniments(item: Item, mode: number | "oracle"): Item {
  const ings = (item.ingredients ?? []).map((i: Item) => {
    if (i.within_printed_weight) return i;
    if (mode === "oracle") {
      const rule = RULED_G.find((r) =>
        r.dish.test(item.name ?? "") && r.ingredient.test(i.name ?? "")
      );
      return rule ? { ...i, typical_serving_g: rule.grams } : i;
    }
    return { ...i, typical_serving_g: (i.typical_serving_g ?? 0) * mode };
  });
  return { ...item, ingredients: ings };
}

/** Recompute the item's own totals, because the harnesses read different fields. */
function withRecomputedTotals(item: Item): Item {
  const t = sumIngredientMacros(item.ingredients ?? [], item.printed_total_g);
  return { ...item, ...t };
}

const MODES: [string, number | "oracle"][] = [
  ["1.00x  today (control)", 1],
  ["0.75x", 0.75],
  ["0.50x  (chimichurri ruling)", 0.5],
  ["0.35x", 0.35],
  ["ORACLE (Santiago's ruled g)", "oracle"],
];

// ---------------------------------------------------------------- weighted /96
const entries = loadOracle(ORACLE_PATH);
const weighted = new Map<string, Map<string, number>>();
const weightedTotals: Record<string, [number, number]> = {};

for (const [label, mode] of MODES) {
  let fails = 0, fieldDraws = 0;
  const perDish = new Map<string, number>();
  for (const run of MIXED_RUNS) {
    for (let d = 0; d < DRAWS; d++) {
      for (const menu of Object.keys(MIXED_MENUS)) {
        const path = `${CACHE}/mixed.${run}.${menu}-d${d}.raw.json`;
        let raw: string;
        try {
          raw = await Deno.readTextFile(path);
        } catch {
          continue; // a run that did not cover this menu
        }
        const enriched: Item[] = JSON.parse(raw).items;
        const sent = itemsFromArchiveFile(MIXED_MENUS[menu]);
        const names = entries.filter((e) => e.menu === menu).map((e) => e.name);
        for (const { name, item } of pairWithOracle(names, enriched, "skip")) {
          const entry = entries.find((e) => e.name === name)!;
          const grams = (sent.find((i) =>
            i.name === name
          ) as { grams?: number | null } | undefined)
            ?.grams ?? null;
          const v = scoreDish(
            name,
            entry.oracle!,
            toMacroValues(rescaleAccompaniments(item, mode)),
            altOracle(entry, grams),
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
  weighted.set(label, perDish);
  weightedTotals[label] = [fails, fieldDraws];
}

console.log("WEIGHTED - the 8 printed-weight dishes inside their real menus");
console.log("lower is better; these are FAILED fields\n");
console.log(`${"rule".padEnd(30)} ${"failed".padStart(10)}`);
for (const [label] of MODES) {
  const [f, n] = weightedTotals[label];
  console.log(`${label.padEnd(30)} ${`${f}/${n}`.padStart(10)}`);
}

console.log("\nper dish (failed fields):");
const dishNames = [
  ...new Set([...weighted.values()].flatMap((m) => [...m.keys()])),
].sort();
console.log(
  `${"dish".padEnd(26)}` +
    MODES.map(([l]) => l.split(" ")[0].padStart(9)).join(""),
);
for (const name of dishNames) {
  const cells = MODES.map(([l]) =>
    String(weighted.get(l)!.get(name) ?? 0).padStart(9)
  ).join("");
  console.log(`${name.slice(0, 24).padEnd(26)}${cells}`);
}

// -------------------------------------------------------------- unweighted /72
const uEntries: Item[] = JSON.parse(
  await Deno.readTextFile(UNWEIGHTED_ORACLE_PATH),
);
console.log("\n\nUNWEIGHTED - the 6 no-printed-weight dishes");
console.log("higher is better; these are POINTS IN BAND\n");
console.log(`${"rule".padEnd(30)} ${"points".padStart(10)}`);

const unweightedPerDish = new Map<string, Map<string, number>>();
for (const [label, mode] of MODES) {
  let total = 0, possible = 0;
  const perDish = new Map<string, number>();
  for (let d = 0; d < DRAWS; d++) {
    for (const menu of UNWEIGHTED_MENUS) {
      const path = `${CACHE}/unweighted.dual-f.${menu}-d${d}.raw.json`;
      let raw: string;
      try {
        raw = await Deno.readTextFile(path);
      } catch {
        continue;
      }
      const enriched: Item[] = JSON.parse(raw).items;
      for (const entry of uEntries.filter((e: Item) => e.menu === menu)) {
        const item = enriched.find((i: Item) => i.name === entry.name);
        if (!item) continue;
        const fixed = withRecomputedTotals(rescaleAccompaniments(item, mode));
        const { fields } = scoreItemAgainstBand(entry.band, {
          calories: fixed.estimated_calories ?? 0,
          protein_g: fixed.protein_g ?? 0,
          carb_g: fixed.carb_g ?? 0,
          fat_g: fixed.fat_g ?? 0,
        });
        const pts = fields.filter((f: Item) => f.pass).length;
        total += pts;
        possible += fields.length;
        perDish.set(entry.name, (perDish.get(entry.name) ?? 0) + pts);
      }
    }
  }
  unweightedPerDish.set(label, perDish);
  console.log(`${label.padEnd(30)} ${`${total}/${possible}`.padStart(10)}`);
}

console.log("\nper dish (points in band):");
const uNames = [
  ...new Set([...unweightedPerDish.values()].flatMap((m) => [...m.keys()])),
].sort();
console.log(
  `${"dish".padEnd(26)}` +
    MODES.map(([l]) => l.split(" ")[0].padStart(9)).join(""),
);
for (const name of uNames) {
  const cells = MODES.map(([l]) =>
    String(unweightedPerDish.get(l)!.get(name) ?? 0).padStart(9)
  )
    .join("");
  console.log(`${name.slice(0, 24).padEnd(26)}${cells}`);
}

console.log(
  "\nThe 1.00x row MUST reproduce the published score, or this simulation's" +
    "\narithmetic is not the harnesses' and no other row means anything.",
);
