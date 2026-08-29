// Stage 2 FORM SIZING. Shipped 2026-08-23 (eval 176).
//
// THE PROBLEM IT FIXES. The model is good at knowing WHAT a dish contains and bad
// at knowing HOW MUCH of it arrives. Measured: model_mass = 0.634 x true_mass + 89
// (n=57, r=0.840), so small plates come out too heavy and large ones far too
// light. On the 57-dish oracle the shipped dual pass scores 352/684; this scores
// 434-453 over 4 runs x 3 draws, ranges disjoint, +86.8 with a 95% CI of +30.7 to
// +142.8 and - uniquely so far - the log-ratio metric excludes zero too.
//
// THE MECHANISM. Ask the model which FORM a dish is, from a fixed enum, and
// nothing else. Then WE set the plate's mass from our own table and rescale the
// ingredient grams to match. Our code still does all the arithmetic.
//
// WHY WE NEVER ASK IT FOR THE GRAMS. Eval 175 asked what a thin-crust pizza weighs
// IN GENERAL - no plate to look at, just the category - and it answered 300 g
// against a real 400-450; a maki order 200 g against 290-400; and it called entree
// salads "side salad" at 150 g. Its own numbers land in band on 17/57 where this
// table lands 48/57. The bias is in its PRIOR about serving sizes, not in its
// reading of any dish, which is why three separate arms that asked it for a gram
// number all failed the same way (Arm A 36/108, MASSCALL 50/108, and that probe).
// The grams are the one thing it is reliably wrong about, so they are the one thing
// we supply ourselves.
//
// ⚠️ KNOWN LIMIT - COVERAGE. Over five archived menus this table was NOT built
// from, it has a row for 33% of the dishes it would try to size (82% on the menus
// it was built from). An unmatched dish gets `other`, which means NO OPINION and
// leaves today's answer untouched - so an uncovered menu is no worse than before,
// it simply gains nothing. The gaps are ordinary forms (grilled vegetables, raw
// seafood, cake, hot cakes, tostadas): the table is SMALL, not wrong, and adding
// rows is the highest-value work left on it.
import {
  callGptEnrichDualPass,
  ENRICH_BATCH_SIZE,
  ENRICH_MODEL,
  enrichBatch,
  type EnrichedItem,
  type ExtractedItem,
  resolveGrams,
  sumIngredientMacros,
} from "./enrich.ts";

/**
 * Grams for ONE restaurant serving of each form. Global food-reference values, not
 * menu-specific: every row is a shape of food that exists worldwide, justified by
 * the serving it describes.
 *
 * ☠️ Two rows are NOT independent of the benchmark that validated them, and are
 * flagged inline. `scripts/sim-form-table.ts` prints every row against the oracle's
 * ruled band so the whole table can be audited, and reports the pizza-dropped
 * total for that reason.
 *
 * `other` is the fallback and MUST stay in the enum: it is how the model says "no
 * row fits", and applyFormMass reads it as "leave this dish alone".
 */
export const FORM_G: Record<string, number> = {
  // ── PIZZA, SPLIT BY TOPPING CLASS (eval 181, Santiago's call 2026-08-24) ──
  //
  // Was ONE row at 425 g for every pizza. That could not be right: FNDDS's own
  // published areal densities span 3.9-5.9 g/in^2 across topping classes, so a
  // cheese pizza and a meat-and-vegetable pizza differ by ~1.3x. Fifteen Bistro
  // pizzas shared one number.
  //
  // 🔑 SOURCE: FNDDS publishes a portion called "1 surface inch" - grams per square
  // inch of pizza - so a printed diameter converts to a mass with NO interpolation
  // across diameter bins. Bistro prints "28 CM" as its pizza section header (in the
  // OCR of the original photo), = 11.02 in = 95.4 in^2.
  // Re-derive any row: `deno run --allow-read --allow-net --allow-env \
  //   --env-file=.env.local scripts/probe-pizza-areal.ts`
  //
  // 🪤 EVAL 178'S 620 g FIGURE WAS WRONG AND IS SUPERSEDED. It read FNDDS's flat
  // "medium (11-12 in)" row, which all 8 records independently imply is really an
  // ~11.8 in pizza - 13% more area than 28 cm. The surface-inch figure is the same
  // data at finer resolution without that error. The meat-and-veg record (2708663)
  // is 563 g at 28 cm, not 620.
  //
  // ⚠️ THE LEVEL IS DELIBERATELY COMPRESSED, THE RATIOS ARE NOT. Santiago chose
  // "USDA for the ratios, keep my level" - FNDDS is US restaurant survey data and
  // American pizzas are more heavily loaded than a Mexican bistro's thin crust.
  // Every row is USDA_g * PIZZA_SCALE.
  //
  // 🔑 PIZZA_SCALE IS NOT FREE TO CHOOSE: it is pinned by a physical floor. FNDDS's
  // NO-CHEESE thin crust is 3.9 g/in^2 = 372 g, and a pizza WITH cheese cannot weigh
  // less than one without. So the cheese row cannot go below 372, which fixes the
  // scale at 372/429. A flat 425 g menu average would have required 0.79 and put a
  // cheese pizza at 337 g - lighter than a bare crust, i.e. impossible.
  // Menu-weighted average over the 15 Bistro pizzas: 425 g before, 469 g after.
  //
  // ☠️ These rows are INDEPENDENT of the oracle in a way `pizza_whole_thin` never
  // was - they come from published USDA densities, not from the band this project
  // ruled. But the BAND MOVED WITH THEM (eval 181), so a rising score does NOT prove
  // the app got better: both sides read the same FNDDS records. Only a kitchen scale
  // settles the absolute level. See eval 178 ① for why (A ≈ C).
  pizza_thin_cheese: 372, // 4.5 g/in^2, FDC 2708615 - and the floor
  pizza_thin_extra_cheese: 397, // 4.8 g/in^2, FDC 2708622
  pizza_thin_pepperoni: 406, // 4.9 g/in^2, FDC 2708639
  pizza_thin_cheese_veg: 430, // 5.2 g/in^2, FDC 2708626
  pizza_thin_meat_veg: 488, // 5.9 g/in^2, FDC 2708663
  // ⚠️ LEGACY - DO NOT REMOVE AND DO NOT OFFER TO THE MODEL. Every archive from
  // evals 174-180 labels its pizzas `pizza_whole_thin`. Deleting this key would make
  // `applyFormMass` fall through its `if (!target) return it` guard and silently stop
  // sizing pizzas on replay, corrupting the $0 re-scoring the whole project runs on.
  // It is excluded from FORM_ENUM below, so the model can no longer choose it.
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
  // ☠️ PARTLY NOT INDEPENDENT, AND THE WEAKEST ROW HERE. The split was added after
  // noticing one benchmark taco was heavier, and on TACO PORCO the model
  // consistently disagrees with the hand label - defensibly so. The rule reads only
  // the description: loaded if it names a structural addition beyond the tortilla
  // (a cheese crust, a lettuce base) or four-plus fillings.
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
  // No row fits - see the note above. NOT a 250 g answer.
  other: 250,
};

/**
 * Rows that still RESOLVE for archived labels but must never be OFFERED to the model.
 * See `pizza_whole_thin` above: replay needs the key, classification must not have it.
 */
export const LEGACY_FORMS = new Set(["pizza_whole_thin"]);

export const FORM_ENUM = Object.keys(FORM_G).filter((f) => !LEGACY_FORMS.has(f));

/**
 * `name` and `dish_form`, nothing else. Any additional field would give the model
 * room to reason about THIS plate's size, which is the failure mode being avoided.
 */
export const FORM_LABEL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "dish_form"],
        properties: {
          name: { type: "string" },
          dish_form: { type: "string", enum: FORM_ENUM },
        },
      },
    },
  },
};

export const FORM_LABEL_PROMPT =
  `You are labelling restaurant menu items by the SHAPE of dish they are.

For each item choose the one dish_form that best describes A SINGLE ORDER of it
as it arrives at the table. Judge the whole plate, including anything the
description says comes with it. Use the item's section heading as a strong hint
about what kind of dish it is.

Do not estimate any weight. Do not describe the ingredients. Choose a form.
If no form fits the dish, choose "other".`;

/**
 * One form label per item name.
 *
 * Keyed by the name the model echoes back, NOT by position: a name it did not echo
 * simply gets no label and its dish is left alone. Trusting order here would let a
 * dropped item shift every label by one and run the pizza target on a taco.
 */
export async function labelForms(
  items: ExtractedItem[],
  apiKey: string,
  onRaw?: (raw: unknown) => void,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let b = 0; b * ENRICH_BATCH_SIZE < items.length; b++) {
    const batch = items.slice(
      b * ENRICH_BATCH_SIZE,
      (b + 1) * ENRICH_BATCH_SIZE,
    );
    const got = await enrichBatch(
      batch,
      apiKey,
      ENRICH_MODEL,
      onRaw,
      FORM_LABEL_PROMPT,
      FORM_LABEL_SCHEMA,
      "system",
    );
    // deno-lint-ignore no-explicit-any
    for (const it of got as any[]) {
      if (typeof it?.name === "string" && typeof it?.dish_form === "string") {
        out.set(it.name, it.dish_form);
      }
    }
  }
  return out;
}

/**
 * Rescale each dish so its plate weighs FORM_G[label], then recompute its macros
 * from the rescaled ingredients with the pipeline's own summer.
 *
 * FOUR CASES ARE LEFT ALONE, each deliberately:
 *  - a dish with a PRINTED weight. The menu already stated what it weighs and a
 *    category average must never overrule the page.
 *  - `other`, or a form missing from the table. "No opinion", not 250 g.
 *  - a dish the model returned no label for.
 *  - a dish whose ingredients resolve to no mass, which cannot be rescaled.
 */
export function applyFormMass(
  enriched: EnrichedItem[],
  labels: Map<string, string>,
): EnrichedItem[] {
  return enriched.map((it) => {
    if (it.printed_total_g) return it;
    const form = labels.get(it.name);
    if (!form || form === "other") return it;
    const target = FORM_G[form];
    if (!target) return it;
    const ings = it.ingredients ?? [];
    const total = resolveGrams(ings, it.printed_total_g).reduce(
      (s, g) => s + g,
      0,
    );
    if (!(total > 0)) return it;
    const k = target / total;
    const ingredients = ings.map((i) => ({
      ...i,
      typical_serving_g: (i.typical_serving_g ?? 0) * k,
    }));
    return {
      ...it,
      ingredients,
      ...sumIngredientMacros(ingredients, it.printed_total_g),
    };
  });
}

/**
 * THE SHIPPED ENTRY POINT: the dual pass, then form-sized.
 *
 * `scripts/arm-dish-form.ts` re-exports this so the benchmark's `FORM` arm and
 * production are the SAME function. A harness copy of this logic is exactly how
 * bench-macros.ts once drifted from production and cost a wasted paid run.
 *
 * ⚠️ THE LABEL CALL CANNOT FAIL A SCAN. If it throws - rate limit, timeout, bad
 * JSON - the dual-pass result is returned unsized. That is a scan that scores like
 * v32 instead of better, which is strictly preferable to a scan that returns
 * nothing. The third call is an IMPROVEMENT on a working answer, never a
 * dependency of it.
 */
export async function callGptEnrichFormSized(
  items: ExtractedItem[],
  apiKey: string,
  model: string = ENRICH_MODEL,
): Promise<{ items: EnrichedItem[]; raw_response: string }> {
  const dual = await callGptEnrichDualPass(items, apiKey, model);
  try {
    const labels = await labelForms(items, apiKey);
    const sized = applyFormMass(dual.items, labels);
    console.log(
      `[form] sized ${
        sized.filter((s, i) => s !== dual.items[i]).length
      } of ${sized.length} items`,
    );
    return { ...dual, items: sized };
  } catch (err) {
    console.error(
      "[form] label call failed, returning UNSIZED dual-pass result:",
      err instanceof Error ? err.message : err,
    );
    return dual;
  }
}
