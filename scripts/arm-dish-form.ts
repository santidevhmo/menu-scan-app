// The dish-FORM arms, eval 176. Santiago's proposal turned into something that
// runs end to end instead of rescaling saved answers.
//
// THE MECHANISM, in one line: ask the model which FORM a dish is (a fixed enum,
// nothing else), then rescale its ingredient grams so the plate weighs what OUR
// table says that form weighs.
//
// WHY THE MODEL IS NEVER ASKED FOR GRAMS. Eval 175 asked it what a thin-crust
// pizza weighs IN GENERAL - no plate to look at, just the category - and it said
// 300 g against a ruled 400-450; a maki order 200 g against 290-400. Its own
// numbers land in band on 17/57 where this table lands 48/57, and it is too LOW on
// 33/57. The compression eval 171 measured (0.634 x true + 89) is in the model's
// PRIOR about serving sizes, not in its reading of a dish, which is why Arm A
// (36/108), MASSCALL (50/108) and eval 175's approach 2 all failed identically.
// The grams are the one thing it is reliably biased about, so they are the one
// thing we do not ask it for.
//
// ⚠️ The enum and the prompt live HERE and nowhere else. probe-dish-form.ts
// imports them, so the question these arms ask is byte-identical to the one whose
// 57/57 label accuracy was measured. A second copy would let the arm ask something
// the probe never validated.
import {
  callGptEnrichDualPass,
  ENRICH_BATCH_SIZE,
  ENRICH_MODEL,
  enrichBatch,
  type EnrichedItem,
  type ExtractedItem,
  resolveGrams,
  sumIngredientMacros,
} from "../supabase/functions/analyze-menu/enrich.ts";
// ⚠️ The hand labels in dish-forms.ts are the ANSWER KEY. Nothing in this file
// may import them - an arm that reads them is not an arm.

/**
 * Grams for one restaurant serving of each FORM. Global food-reference values,
 * not menu-specific: every row is a shape of food that exists worldwide, and the
 * justification is the serving it describes, never a dish on these five menus.
 *
 * ☠️ CONTAMINATION. The author had read all 57 oracle mass bands before writing
 * this. Two rows are flagged inline as NOT independent. sim-form-table.ts prints
 * every target against the ruled band midpoint so each row can be audited, and
 * prints the pizza-dropped total, which is the honest headline.
 *
 * `other` is the mandatory fallback - a taxonomy this small cannot cover an
 * arbitrary menu, and silently mis-sizing an unknown form is worse than leaving
 * it alone. Callers are expected to treat it as "no opinion", not as 250 g.
 */
export const FORM_G: Record<string, number> = {
  // ☠️ NOT INDEPENDENT: 425 is the midpoint of the 400-450 band this phase ruled.
  // The food reasoning is real (a 28-33 cm thin crust is a 250-280 g dough ball
  // baking down to ~200 g, plus 150-200 g of topping) but it cannot be claimed as
  // a blind prediction.
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
  // Fallback - see the note above.
  other: 250,
};

export const FORM_ENUM = Object.keys(FORM_G);

/**
 * Only `name` and `dish_form`. Anything else would give the model room to reason
 * about THIS plate's size, which is the failure mode being avoided.
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
 * One label per item name, from a dedicated call chunked exactly like enrichment.
 *
 * Positional alignment is NOT trusted - the map is keyed by the name the model
 * echoes back, and a name it did not echo simply gets no label and is left alone.
 * Silently mispairing labels would run the pizza target on a taco.
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
 * Rescale each dish so its plate weighs FORM_G[label], and recompute the macros
 * from the rescaled ingredients with the pipeline's own summer.
 *
 * THREE CASES ARE LEFT ALONE, deliberately:
 *  - a dish with a PRINTED weight. The menu already said what it weighs; a
 *    category average must never overrule the thing printed on the page.
 *  - `other`, or a form not in the table. The fallback is "no opinion", NOT
 *    250 g, so a menu this taxonomy does not cover degrades to today's answer
 *    instead of being confidently mis-sized. Eval 175 ③ is the open risk here.
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
 * FORM: the SHIPPED dual pass, then form-sized. Its control is `dual`, because it
 * is dual plus one label call - same prompt, same schema, same request envelope
 * ("user"), same batch composition. That is what makes the comparison
 * one-variable, and it is also exactly what eval 174/175 rescaled, so the paid
 * result should land near 469.
 */
export async function armForm(
  items: ExtractedItem[],
  apiKey: string,
): Promise<EnrichedItem[]> {
  const dual = await callGptEnrichDualPass(items, apiKey, ENRICH_MODEL);
  const labels = await labelForms(items, apiKey);
  return applyFormMass(dual.items, labels);
}
