// The dish-FORM table and its scorer, shared by sim-form-table.ts (the $0 ceiling
// with hand labels) and probe-dish-form.ts (the paid probe with model labels).
//
// It lives in its own file for one reason: those two must never disagree about
// what a form is worth. A private copy of a table is exactly how bench-macros.ts
// once drifted from production and cost a wasted paid run.

import { scoreItemAgainstBand } from "./macro-band-score.ts";

const CACHE = "scripts/fixtures/caches";
const ORACLE = "scripts/fixtures/unweighted-oracle.json";
const DRAWS = 3;

// deno-lint-ignore no-explicit-any
type Item = any;

// The gram table lives in arm-dish-form.ts because an ARM needs it and must
// not import this file - LABEL below is the hand-assigned answer key.
export { FORM_G } from "./arm-dish-form.ts";

/**
 * Hand labels, assigned from name + section_title + description ONLY - the three
 * fields Stage 1 actually passes to enrichment (`index.ts` forwards items
 * unreshaped, so section_title does arrive). No label was chosen by looking at a
 * mass band. These are the GROUND TRUTH the model's labels are scored against.
 */
export const LABEL: Record<string, string> = {
  // bistro, section "PIZZAS BISTRO" - 14 PIZZAS. ALFREDO PORTOBELLO is NOT one.
  //
  // ☠️ CORRECTED eval 181. This block used to say "15 items, ALFREDO PORTOBELLO
  // included: it sits in the pizza section with a cream base, whatever its name
  // suggests" - and that CONTRADICTED THE ORACLE, which rules the dish as a PASTA
  // (200 g pasta + cream + chicken + mushrooms, 410 g, band [350,470]) and records
  // that it "arrives tagged section_title 'PIZZAS BISTRO'... a pasta under the pizza
  // heading, a known Stage-1 mis-section for this menu". The label followed the
  // mis-section instead of the food.
  // 🪤 The old single 425 g row HID this: 425 sits inside [350,470] by luck, so a
  // pasta sized as a pizza still passed. Splitting the row to 488 g exposed it. A
  // coarse table can conceal a wrong label; a finer one cannot.
  "ALFREDO PORTOBELLO": "pasta_entree", // 400 g, and the oracle's own decomposition is 410 g
  //
  // RE-LABELLED eval 181: the single `pizza_whole_thin` row split into five topping
  // classes. Each label below is assigned from the DESCRIPTION only, by the rule
  // "does it name meat, vegetables, both, or neither" - never from a mass band.
  // ⚠️ 5 of 15 have NO exactly matching FNDDS record and take the nearest class;
  // each is marked. That is a known weakness of this table, not a hidden one.
  "MARGARITA": "pizza_thin_cheese_veg", // tomato slices, basil
  "5 FORMAGGI": "pizza_thin_extra_cheese", // five cheeses, no meat, no veg
  "PEPPERONI": "pizza_thin_pepperoni", // pepperoni only
  "VEGETARIANA": "pizza_thin_cheese_veg", // spinach, squash, mushroom, onion, pepper, olive
  "CAPRICCIOSA": "pizza_thin_meat_veg", // serrano ham, artichoke, olive, mushroom
  "ITALIANA": "pizza_thin_meat_veg", // pepperoni, onion, pepper, olive, mushroom
  "CAPRESE": "pizza_thin_meat_veg", // spinach, serrano ham, dried tomato
  "MEXICANA": "pizza_thin_meat_veg", // onion, pepper, chistorra
  "JAMÓN CON CHAMPIÑONES": "pizza_thin_meat_veg", // ham, mushrooms (name only, no desc)
  "4 STAGIONI": "pizza_thin_meat_veg", // ⚠️ ALL meat (pepperoni, ham, bacon, chistorra), no veg - FNDDS has no meat-only thin-crust row
  "HAWAIANA": "pizza_thin_meat_veg", // ⚠️ meat + FRUIT (ham, pineapple) - nearest class
  "OSTRICA": "pizza_thin_meat_veg", // ⚠️ seafood (smoked oyster, bacon, dijon) - nearest class
  "FLAMENKUCHEN": "pizza_thin_meat_veg", // ⚠️ CREAM base (bacon, onion) - FNDDS has no cream-base pizza
  "QUESO AZUL": "pizza_thin_meat_veg", // ⚠️ CREAM base (blue cheese, spinach, ham, apple)
  // bistro, section "ENSALADAS" - all four read as composed entree salads.
  "ENSALADA GRIEGA": "salad_entree",
  "ENSALADA BISTRO": "salad_entree",
  "ENSALADA BALI": "salad_entree",
  "ENSALADA DE LA SEMANA": "salad_entree",
  // bistro, section "PASTAS".
  "CARBONARA": "pasta_entree",
  "LINGUINNI PARISIENNE": "pasta_entree",
  "PASTA ESPECIAL": "pasta_entree",
  "FRADIAVIOLA": "pasta_entree",
  "FETUCCINI ALFREDO": "pasta_entree",
  // andaluz.
  "TIRAS DE POLLO": "breaded_chicken_order",
  "PAPAS FRITAS": "fries_starter",
  "DE CAMARÓN ROKA": "sushi_roll_order",
  "MEDITERRÁNEA": "salad_entree",
  "QUESABONELESS": "quesadilla_two_tortilla",
  "CROQUETAS DE ABUELA (8 pints.)": "croquette_order",
  // el-marcos. DE INDIO is eggs on a masa base, not an omelette - its description
  // says "montados sobre un huarache de maíz con frijoles refritos".
  "OMELETTE CUBANA": "omelette_2egg",
  "OMELETTE TOMASA": "omelette_2egg",
  "OMELETTE LAMERA": "omelette_2egg",
  "Omelette de Camarón y Marlín": "omelette_2egg",
  "DE INDIO": "eggs_on_masa_base",
  "BISQUETS DEL CENTRO": "biscuit_order_of_two",
  "BISQUETS C/ FRUTOS ROJOS": "biscuit_order_of_two_fruit",
  // brasero-two. Loaded vs plain by the stated rule: PORCO names five fillings,
  // EL CAPRICHO names a lettuce base and a cheese crust; BRASERO and TRADICIONAL
  // are "<meat> en tortilla" and nothing else.
  "TACO PORCO": "taco_single_loaded",
  "TACO EL CAPRICHO": "taco_single_loaded",
  "TACO BRASERO": "taco_single",
  "TACO TRADICIONAL": "taco_single",
  "TOSTA ATUM": "open_toast",
  "TOSTA BRASIL (picaña)": "open_toast",
  "CHILE RELLENO": "stuffed_pepper",
  "ORDEN DE TORTILLAS": "tortilla_order",
  // Both desserts arrive with ice cream and the description says so.
  "BROWNIE": "dessert_plate_with_ice_cream",
  "ROLLOS DE CREPA": "dessert_plate_with_ice_cream",
  // nikkori - every scored item is a maki roll ("Por dentro / Por fuera").
  "Salmón Roll": "sushi_roll_order",
  "Duplex": "sushi_roll_order",
  "Ipanema Roll": "sushi_roll_order",
  "Fildeflex": "sushi_roll_order",
  "Vegan Roll": "sushi_roll_order",
  "Spicy Tuna Roll": "sushi_roll_order",
  "Avocado": "sushi_roll_order",
  "Tuna Especial": "sushi_roll_order",
  "Nikkori Maki": "sushi_roll_order",
  "Salmón Samba": "sushi_roll_order",
};

export const oracle: Item[] = JSON.parse(await Deno.readTextFile(ORACLE));
export const byName = new Map(oracle.map((e) => [e.name, e]));
export const MENUS = [...new Set(oracle.map((e) => e.menu))];

/**
 * The dishes whose band came from ONE class ruling, so they can be dropped.
 *
 * Matches the `pizza_thin_*` prefix since eval 181 split the single row; the old
 * exact-match on `pizza_whole_thin` would have returned ZERO pizzas after the split
 * and silently made every "pizzas-dropped" total identical to the full total.
 */
export const PIZZAS = Object.entries(LABEL)
  .filter(([, f]) => f.startsWith("pizza_"))
  .map(([n]) => n);

/** Resolved grams, replicating resolveGrams exactly. */
export function grams(it: Item): number[] {
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
 * Archived totals scaled by k. Reads the ARCHIVED totals rather than recomputing
 * them from the ingredients, because that is what bench-unweighted.ts scores -
 * recomputing diverges on ENSALADA GRIEGA and would make every row here quietly
 * incomparable to the published figures.
 */
function macrosScaled(it: Item, k: number) {
  return {
    calories: (it.estimated_calories ?? 0) * k,
    protein_g: (it.protein_g ?? 0) * k,
    carb_g: (it.carb_g ?? 0) * k,
    fat_g: (it.fat_g ?? 0) * k,
  };
}

export interface ScoreRow {
  pts: number;
  poss: number;
  dish: Map<string, number>;
}

/**
 * Rescale every archived `dual` answer so the plate weighs what `targetFor` says,
 * then score it with the harness's own scorer.
 *
 * `targetFor` returning null means "no opinion" and leaves the dish untouched at
 * k=1 - which is what an unrecognised form must do. Passing `() => null`
 * therefore reproduces the shipped control exactly, and that is the control row.
 */
export async function scoreWithTargets(
  targetFor: (name: string) => number | null,
): Promise<ScoreRow> {
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
        const target = targetFor(it.name);
        const k = target === null ? 1 : target / total;
        const { fields } = scoreItemAgainstBand(e.band, macrosScaled(it, k));
        const p = fields.filter((f: Item) => f.pass).length;
        pts += p;
        poss += fields.length;
        dish.set(it.name, (dish.get(it.name) ?? 0) + p);
      }
    }
  }
  return { pts, poss, dish };
}

/** Points over every dish EXCEPT the 15 that share one pizza ruling. */
export function withoutPizzas(r: ScoreRow): number {
  return [...r.dish.entries()]
    .filter(([n]) => !PIZZAS.includes(n))
    .reduce((s, [, p]) => s + p, 0);
}

/**
 * Throws unless a row covers every ruled dish. A ceiling measured over part of
 * the oracle understates every total and is comparable to nothing - the defect
 * that made an earlier sim report a ceiling over 6 of 9 dishes.
 */
export function assertFullCoverage(r: ScoreRow) {
  const missing = oracle.map((e) => e.name).filter((n) => !r.dish.has(n));
  if (missing.length) {
    throw new Error(
      `scored ${r.dish.size} of ${oracle.length} oracle dishes - missing ${
        missing.join(", ")
      }. Every total would be over PART of the set.`,
    );
  }
}
