// The prompt and schema for arms S3 and S4, defined ONCE and imported by every
// harness that runs them - bench-macros.ts, bench-unweighted.ts and the probe
// modes in probe-plate-arms.ts. An arm measured in one harness and scored in
// another under a second definition is lesson 28 waiting to happen.
//
// Deliberately holds NO API key and no runner, so a test that only wants to
// inspect the schema does not have to own credentials.
//
// S3  fixes what an ingredient IS MADE OF. Required `parts` array of
//     {name, share_pct}. Measured 2026-08-16: chimichurri's fat went 15 -> 50
//     g/100 g, where a sentence and a required STRING each moved it zero.
// S4  = S3 plus what an accompaniment WEIGHS. Required `amount_as_served_g`,
//     which resolveGrams uses for ingredients outside the printed weight - the
//     one class nothing rescales, and where B21's standard reference amount is
//     USDA's 30 g DIPPING CONTAINER rather than the ~15 g spooned onto a plate.
//
// Both put a NUMBER behind a required field: wording is 0 for 5 in this phase
// and schema force is 6 for 8, and a required STRING was measured to buy a
// description while leaving the number untouched.
import { ENRICH_PROMPT, ENRICH_SCHEMA_OPENAI } from "../supabase/functions/analyze-menu/enrich.ts";

const PARTS_SENTENCE =
  ' Give "parts" for every ingredient: the single foods it is made from and the' +
  " percentage of its weight each one accounts for. When the ingredient is" +
  " already a single food, give that one food at 100. State the parts before the" +
  " composition figures and let them determine those figures, because a mixture" +
  " built largely from a concentrated component is far richer than its name" +
  " suggests.";

const SERVED_SENTENCE =
  ' Give "amount_as_served_g" for every ingredient: when the ingredient is served' +
  " alongside the item rather than as part of it, the amount of it actually" +
  " served with one order, as it arrives at the table; otherwise repeat" +
  ' "typical_serving_g". These two differ most for a poured or spooned' +
  " component, whose established serving is measured as a container rather than" +
  " as the amount that reaches a plate.";

const PARTS_FIELD = {
  type: "array",
  items: {
    type: "object",
    properties: { name: { type: "string" }, share_pct: { type: "number" } },
    required: ["name", "share_pct"],
    additionalProperties: false,
  },
};

/**
 * Rebuilds the ingredient object with the arm's extra fields in the right PLACE.
 * Key order is the mechanism, not decoration: strict mode emits fields in schema
 * order, so `parts` must PRECEDE the per-100 g figures it is meant to constrain,
 * and `amount_as_served_g` must follow `within_printed_weight`, the flag that
 * decides whether it is used at all.
 */
function armSchema(withServed: boolean) {
  const schema = structuredClone(ENRICH_SCHEMA_OPENAI);
  // deno-lint-ignore no-explicit-any
  const ing = (schema as any).properties.items.items.properties.ingredients.items;
  const p = ing.properties;
  ing.properties = {
    name: p.name,
    category: p.category,
    within_printed_weight: p.within_printed_weight,
    typical_serving_g: p.typical_serving_g,
    ...(withServed ? { amount_as_served_g: { type: "number" } } : {}),
    parts: PARTS_FIELD,
    protein_per_100g: p.protein_per_100g,
    carb_per_100g: p.carb_per_100g,
    fat_per_100g: p.fat_per_100g,
  };
  ing.required = [
    "name",
    "category",
    "within_printed_weight",
    "typical_serving_g",
    ...(withServed ? ["amount_as_served_g"] : []),
    "parts",
    "protein_per_100g",
    "carb_per_100g",
    "fat_per_100g",
  ];
  return schema;
}

export const ARM_S3 = {
  prompt: ENRICH_PROMPT + PARTS_SENTENCE,
  schema: armSchema(false),
};
export const ARM_S4 = {
  prompt: ENRICH_PROMPT + PARTS_SENTENCE + SERVED_SENTENCE,
  schema: armSchema(true),
};
