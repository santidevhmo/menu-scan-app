// $0: does naming a dish's FORM and taking that form's average size beat what the
// model does now? Santiago's proposal, eval 174.
//
// WHAT THIS IS. Two separate things can go wrong with a form mechanism: the TABLE
// of per-form grams can be wrong, or the CLASSIFIER can put a dish in the wrong
// row. This sim removes the classifier entirely - the labels below are assigned by
// hand - so what it measures is the TABLE ALONE, at its ceiling. If the table
// cannot beat the shipped 352 with perfect labels, no classifier can rescue it and
// nothing needs to be bought.
//
// WHAT IT IS NOT. Not an arm and it cannot ship: LABEL is hand-written. It also
// does NOT read mass_band_g to build a target - targets come only from FORM_G, and
// `oracle.band` (the MACRO bands) is read solely to score, exactly as
// sim-mass-ceiling.ts does.
//
// ☠️ CONTAMINATION, STATED UP FRONT. The author of this table had already read all
// 57 oracle mass bands. Two rows are therefore NOT independent and are flagged
// inline: `pizza_whole_thin` (whose 425 g IS the 400-450 band midpoint, a band this
// phase itself ruled) and the `taco_single` / `taco_single_loaded` split (invented
// after noticing EL CAPRICHO is heavier than TRADICIONAL). The sim prints
// target-vs-band per dish so every row can be audited, and prints the
// pizza-dropped total, which is the honest headline.
//
//   deno run --allow-read scripts/sim-form-table.ts
import { scoreItemAgainstBand } from "./macro-band-score.ts";

const CACHE = "scripts/fixtures/caches";
const ORACLE = "scripts/fixtures/unweighted-oracle.json";
const DRAWS = 3;

// deno-lint-ignore no-explicit-any
type Item = any;

/**
 * Grams for one restaurant serving of each FORM. Global food-reference values,
 * not menu-specific: every row is a shape of food that exists worldwide, and the
 * justification is the serving it describes, never a dish on these five menus.
 *
 * The `other` row is the mandatory fallback - a taxonomy this small cannot cover
 * an arbitrary menu, and a mechanism that silently mis-sizes an unknown form is
 * worse than one that leaves it alone.
 */
const FORM_G: Record<string, number> = {
  // ☠️ NOT INDEPENDENT: 425 is the midpoint of the 400-450 band this phase ruled.
  // The food reasoning is real (a 28-33 cm thin crust is a 250-280 g dough ball
  // baking down to ~200 g, plus 150-200 g of topping) but it cannot be claimed as
  // a blind prediction. This is why the pizza-dropped total is printed.
  pizza_whole_thin: 425,
  // FNDDS: 1 cup cooked spaghetti = 140 g. A restaurant entree is ~2 cups plus
  // roughly 120 g of sauce.
  pasta_entree: 400,
  // ~100 g of greens plus cheese, fruit, nuts and dressing.
  salad_entree: 320,
  salad_side: 150,
  // Maki: 8-10 pieces at ~30 g each.
  sushi_roll_order: 280,
  // One soft taco: ~30 g tortilla plus ~60 g of filling.
  taco_single: 95,
  // ☠️ PARTLY NOT INDEPENDENT: the split exists because the author had seen that
  // one taco here is heavier. The RULE applied is stated in advance and reads only
  // the description: a taco counts as loaded if it names a structural addition
  // beyond the tortilla (a cheese crust, a lettuce base) or four-plus fillings.
  taco_single_loaded: 130,
  // Two eggs (~100 g) plus ~90 g of filling.
  omelette_2egg: 200,
  // One thick slice or tostada base under a protein topping.
  open_toast: 175,
  // Two cafe biscuits at ~45 g.
  biscuit_order_of_two: 90,
  biscuit_order_of_two_fruit: 120,
  // FNDDS medium fries = 117 g; a shareable starter runs larger.
  fries_starter: 180,
  // Three to four breaded strips or boneless pieces.
  breaded_chicken_order: 200,
  // Eight croquettes at ~28 g.
  croquette_order: 220,
  // Two flour tortillas plus cheese and a filling.
  quesadilla_two_tortilla: 220,
  stuffed_pepper: 160,
  // Four to six corn tortillas at ~28 g.
  tortilla_order: 140,
  // Cake/brownie/crepe ~90 g, one scoop of ice cream ~65 g, fruit or sauce.
  dessert_plate_with_ice_cream: 190,
  // Two fried eggs on a masa base with beans.
  eggs_on_masa_base: 300,
  // Fallback.
  other: 250,
};

/**
 * Hand labels, assigned from name + section_title + description ONLY - the three
 * fields Stage 1 actually passes to enrichment (`index.ts` forwards items
 * unreshaped, so section_title does arrive). No label was chosen by looking at a
 * mass band.
 */
const LABEL: Record<string, string> = {
  // bistro, section "PIZZAS BISTRO" - 15 items, ALFREDO PORTOBELLO included: it
  // sits in the pizza section with a cream base, whatever its name suggests.
  "5 FORMAGGI": "pizza_whole_thin",
  "CAPRICCIOSA": "pizza_whole_thin",
  "FLAMENKUCHEN": "pizza_whole_thin",
  "QUESO AZUL": "pizza_whole_thin",
  "4 STAGIONI": "pizza_whole_thin",
  "ITALIANA": "pizza_whole_thin",
  "HAWAIANA": "pizza_whole_thin",
  "CAPRESE": "pizza_whole_thin",
  "ALFREDO PORTOBELLO": "pizza_whole_thin",
  "MEXICANA": "pizza_whole_thin",
  "VEGETARIANA": "pizza_whole_thin",
  "OSTRICA": "pizza_whole_thin",
  "MARGARITA": "pizza_whole_thin",
  "JAMÓN CON CHAMPIÑONES": "pizza_whole_thin",
  "PEPPERONI": "pizza_whole_thin",
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

const oracle: Item[] = JSON.parse(await Deno.readTextFile(ORACLE));
const byName = new Map(oracle.map((e) => [e.name, e]));
const MENUS = [...new Set(oracle.map((e) => e.menu))];

const unlabelled = oracle.map((e) => e.name).filter((n) => !(n in LABEL));
if (unlabelled.length) {
  throw new Error(
    `${unlabelled.length} ruled dishes have no form label: ${
      unlabelled.join(", ")
    }`,
  );
}
for (const [n, f] of Object.entries(LABEL)) {
  if (!(f in FORM_G)) throw new Error(`${n} labelled with unknown form "${f}"`);
}

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

/** Archived totals scaled by k - the same arithmetic bench-unweighted scores. */
function macrosScaled(it: Item, k: number) {
  return {
    calories: (it.estimated_calories ?? 0) * k,
    protein_g: (it.protein_g ?? 0) * k,
    carb_g: (it.carb_g ?? 0) * k,
    fat_g: (it.fat_g ?? 0) * k,
  };
}

const PIZZAS = Object.entries(LABEL)
  .filter(([, f]) => f === "pizza_whole_thin")
  .map(([n]) => n);

type Row = { pts: number; poss: number; dish: Map<string, number> };
const run = async (useForm: boolean): Promise<Row> => {
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
        const k = useForm ? FORM_G[LABEL[it.name]] / total : 1;
        const { fields } = scoreItemAgainstBand(e.band, macrosScaled(it, k));
        const p = fields.filter((f: Item) => f.pass).length;
        pts += p;
        poss += fields.length;
        dish.set(it.name, (dish.get(it.name) ?? 0) + p);
      }
    }
  }
  return { pts, poss, dish };
};

const control = await run(false);
const form = await run(true);

const scored = new Set(control.dish.keys());
const missing = oracle.map((e) => e.name).filter((n) => !scored.has(n));
if (missing.length) {
  throw new Error(
    `scored ${scored.size} of ${oracle.length} oracle dishes - missing ${
      missing.join(", ")
    }. Every total below would be over PART of the set and comparable to nothing.`,
  );
}

const drop = (r: Row) =>
  [...r.dish.entries()]
    .filter(([n]) => !PIZZAS.includes(n))
    .reduce((s, [, p]) => s + p, 0);

console.log("UNWEIGHTED - points in band, higher is better\n");
console.log(
  `${"rule".padEnd(34)}${"all 57".padStart(12)}${"no pizzas".padStart(14)}`,
);
for (
  const [label, r] of [["today (dual, control)", control], [
    "form -> table average",
    form,
  ]] as [string, Row][]
) {
  const n = PIZZAS.length * 4 * DRAWS;
  console.log(
    `${label.padEnd(34)}${`${r.pts}/${r.poss}`.padStart(12)}${
      `${drop(r)}/${r.poss - n}`.padStart(14)
    }`,
  );
}
console.log(
  `${"DELTA".padEnd(34)}${
    `${form.pts - control.pts >= 0 ? "+" : ""}${form.pts - control.pts}`
      .padStart(12)
  }${
    `${drop(form) - drop(control) >= 0 ? "+" : ""}${drop(form) - drop(control)}`
      .padStart(14)
  }`,
);

// Per FORM: is the row helping or hurting, and how far is its target from the
// bands the oracle ruled? A row whose target equals every band's midpoint is the
// contamination tell.
console.log(
  "\nper form - target vs the mass band the oracle ruled (audit column):",
);
console.log(
  `${"form".padEnd(30)}${"n".padStart(3)}${"target".padStart(8)}${
    "band mid".padStart(10)
  }${"gap".padStart(7)}${"points".padStart(12)}${"delta".padStart(8)}`,
);
const forms = [...new Set(Object.values(LABEL))].sort();
for (const f of forms) {
  const names = Object.entries(LABEL).filter(([, x]) => x === f).map(([n]) =>
    n
  );
  const mids = names.map((n) => {
    const [lo, hi] = byName.get(n)!.mass_band_g;
    return (lo + hi) / 2;
  });
  const mid = mids.reduce((s, m) => s + m, 0) / mids.length;
  const c = names.reduce((s, n) => s + (control.dish.get(n) ?? 0), 0);
  const v = names.reduce((s, n) => s + (form.dish.get(n) ?? 0), 0);
  console.log(
    `${f.padEnd(30)}${String(names.length).padStart(3)}${
      String(FORM_G[f]).padStart(8)
    }${mid.toFixed(0).padStart(10)}${
      `${FORM_G[f] - mid >= 0 ? "+" : ""}${(FORM_G[f] - mid).toFixed(0)}`
        .padStart(7)
    }${`${v}/${names.length * 4 * DRAWS}`.padStart(12)}${
      `${v - c >= 0 ? "+" : ""}${v - c}`.padStart(8)
    }`,
  );
}

// How often does the table's flat number land inside the ruled mass band? This is
// the "does form predict mass" question, kept separate from the score.
const inBand = oracle.filter((e) => {
  const [lo, hi] = e.mass_band_g;
  const t = FORM_G[LABEL[e.name]];
  return t >= lo && t <= hi;
});
const inBandNoPizza = inBand.filter((e) => !PIZZAS.includes(e.name));
console.log(
  `\nform target lands INSIDE the ruled mass band: ${inBand.length}/${oracle.length}` +
    ` (${((100 * inBand.length) / oracle.length).toFixed(0)}%)` +
    `, excluding pizzas ${inBandNoPizza.length}/${
      oracle.length - PIZZAS.length
    }` +
    ` (${
      ((100 * inBandNoPizza.length) / (oracle.length - PIZZAS.length)).toFixed(
        0,
      )
    }%)`,
);
console.log(
  `\nControl covers all ${oracle.length} oracle dishes, scored through the ` +
    `harness's own scoreItemAgainstBand. Targets come only from FORM_G; ` +
    `mass_band_g is read for the audit column and the line above, never to set one.`,
);
