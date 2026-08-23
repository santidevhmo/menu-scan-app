// The prompts and schemas for arms ORDER, ORDER-nopush and PIECE, defined ONCE
// and imported by whatever runs them - same reason as arm-schemas.ts. An arm
// measured in one harness and scored in another under a second definition is
// lesson 28 waiting to happen.
//
// Deliberately holds NO API key and no runner, so a test that only wants to
// inspect a schema does not have to own credentials.
//
// ── WHAT THESE ARMS ARE FOR ────────────────────────────────────────────────
//
// Measured 2026-08-21 from the SHIPPED `dual` archives: across the 9 oracle
// dishes x 3 draws, 140 ingredient gram answers, 100 of them (71%) are one of
// exactly four numbers - 20, 30, 50 or 100 - and 134 (95%) are multiples of 5.
// OMELETTE CUBANA prices chorizo, ham, bacon and cheese at 30 g EACH against
// ruled 15/15/8/15; TACO PORCO prices its meat at 100 g against a ruled 55 and
// its tortilla at 50 against a published 28. Salmón Roll is the same habit
// undershooting: `serving_pieces: 8` is correct, yet the rice is a flat 100 g
// and the roll totals 230-250 g against a ruled 300-400.
//
// The field is named `typical_serving_g` and the prompt asks for "the standard
// reference amount ... the amount nutrition labelling treats as one serving of
// that kind of food". Mass is the only lever with headroom left:
// sim-mass-ceiling.ts reads today 67/108, clamped-into-band 80/108, perfect mass
// 98/108.
//
// ⚠️ THIS COMMENT USED TO SAY "we ask for a label serving and we get one".
// THAT IS FALSE and was corrected 2026-08-21 after an external research review
// prompted the check. Against 21 CFR 101.12 Table 2, the actual answers deviate in
// BOTH directions, pooled over four archive sets:
//
//   ingredient class   RACC   model median   n
//   cooked pasta        140            180   12   ABOVE
//   eggs                 50            120   12   ABOVE
//   cheese               30             30   72   matches
//   dressing             30             30   12   matches
//   cooked rice         140            100   12   below
//   vegetables           85             30  100   FAR below
//   nuts                 30             10   23   FAR below
//
// So the round-number clustering is NOT recitation of a labelling table. It is
// round-number anchoring toward a few familiar values, and the sign of the error
// tracks a component's ROLE in the dish: what forms the body lands at or above its
// reference amount, what is scattered over the body lands far under. That is why
// ARM_ROLE's one-way shrink of non-body components lost 12 points (eval 163) —
// those components were already the under-portioned ones.
//
// ⚠️ THIS DELIBERATELY REVERSES B21, AND B16 IS THE PRIOR FAILURE TO WATCH FOR.
// B21 chose a reference amount precisely because it is knowledge the model holds
// INDEPENDENTLY of any portion guess; B16 asked for an ingredient's share of the
// dish and the model back-computed it from grams it had already written. The
// post-run check is therefore not only the score: re-run the gram-distribution
// count above. If the answers still snap to 20/30/50/100, the mechanism did not
// take and the score moved for some other reason.
//
// ⚠️ NOT Arm A. Nothing here asks for a plate TOTAL and nothing rescales. Arm A
// (`typical_total_g` + rescale every ingredient to it) is rejected twice at
// 36/108 because the rescale MULTIPLIES an oversize. These arms change what the
// per-ingredient gram question ASKS, and our code does the same addition it
// always did.
//
//   ORDER         grams_in_one_order, plus pass 2's shipped push sentence
//   ORDER-nopush  the same, with the push sentence dropped
//   PIECE         grams_per_piece x serving_pieces, multiplied by OUR code
//
// The chain is one variable per step: ORDER - ORDER-nopush isolates the push
// sentence, PIECE - ORDER-nopush isolates per-piece pricing.
import {
  ENRICH_PROMPT,
  ENRICH_PROMPT_UNWEIGHTED,
  ENRICH_SCHEMA_OPENAI,
} from "../supabase/functions/analyze-menu/enrich.ts";

export const ORDER_KEY = "grams_in_one_order";
export const PIECE_KEY = "grams_per_piece";

/** No food, dish or cuisine name - the guard in enrich_test.ts exists because a food list here was measured harmful. */
const ORDER_ASK = `Give "${ORDER_KEY}": how many grams of that ingredient one` +
  " order of this item contains, as the restaurant serves it. This is the" +
  " ingredient's share of THIS item, not a serving of that food on its own: an" +
  " ingredient that garnishes, tops, fills or seasons an item is present in a" +
  " small fraction of the amount it would be served in as a dish of its own," +
  " while an ingredient that forms the item's body is present in more. Size it" +
  " from what one order of this item physically is - how much of it one person" +
  " is handed - and not from any established reference amount for that kind of" +
  " food.";

const PIECE_ASK = `Give "${PIECE_KEY}": how many grams of that ingredient are` +
  ' in ONE PIECE of this item as it is served, where "serving_pieces" is how' +
  " many pieces one order is. When one order is eaten as a single plate rather" +
  ' than as separate pieces, "serving_pieces" is 1 and this is the whole' +
  " order's amount. Size it from what one piece physically is, and not from any" +
  " established reference amount for that kind of food.";

/**
 * Swaps the gram instruction out of the shipped prompt.
 *
 * THROWS rather than warns. A printed guard is not a guard - sim-mass-ceiling.ts
 * printed "the control row MUST read 36/72" while printing 56/72 for a day. If
 * the prompt is reworded and these markers stop matching, a paid run must die
 * here rather than quietly measure the shipped prompt under an arm's name.
 */
function replaceGramAsk(prompt: string, replacement: string): string {
  const startMarker = 'Give "typical_serving_g":';
  const endMarker = "do not need to add up to anything.";
  const start = prompt.indexOf(startMarker);
  const end = prompt.indexOf(endMarker);
  if (start < 0 || end < 0 || end < start) {
    throw new Error(
      "the gram instruction moved in ENRICH_PROMPT - re-locate it before running a paid arm",
    );
  }
  return prompt.slice(0, start) + replacement +
    prompt.slice(end + endMarker.length);
}

/**
 * Pass 2's shipped extra sentence, and the arm that drops it.
 *
 * The sentence tells the model a body component is "present in considerably
 * greater quantity than a standalone serving" - a one-directional push UP. It is
 * part of what makes the shipped dual pass beat baseline by +7, and it is aimed
 * the wrong way for a small hand-held item. ORDER keeps it (with the renamed
 * key), ORDER-nopush keeps only its factual first clause.
 */
const PUSH = ENRICH_PROMPT_UNWEIGHTED.slice(ENRICH_PROMPT.length);
if (!PUSH.includes('"typical_serving_g"')) {
  throw new Error(
    "pass 2's sentence no longer names typical_serving_g - re-read it before running a paid arm",
  );
}
const NO_PUSH = " The items in this request print no weight.";

export const ORDER_PROMPT = replaceGramAsk(ENRICH_PROMPT, ORDER_ASK) +
  PUSH.replaceAll('"typical_serving_g"', `"${ORDER_KEY}"`);
export const ORDER_NOPUSH_PROMPT = replaceGramAsk(ENRICH_PROMPT, ORDER_ASK) +
  NO_PUSH;
export const PIECE_PROMPT = replaceGramAsk(ENRICH_PROMPT, PIECE_ASK) + NO_PUSH;

/**
 * The shipped schema with the gram key RENAMED IN PLACE.
 *
 * In place, not appended: strict mode emits fields in schema order, so keeping
 * the key's position keeps every other B4 ordering decision intact and leaves
 * the rename as the only difference. A parallel field alongside
 * `typical_serving_g` was rejected as a design - an overlapping field has been
 * measured to come back as a copy of the one it overlaps.
 *
 * `piecesFirst` additionally moves `serving_pieces` ahead of `ingredients`,
 * which PIECE needs and the B4 ordering rule requires: a per-piece gram figure
 * cannot be written before the piece count it divides.
 */
export function orderSchema(key: string, piecesFirst = false) {
  // deno-lint-ignore no-explicit-any
  const schema: any = structuredClone(ENRICH_SCHEMA_OPENAI);
  const item = schema.properties.items.items;
  const ing = item.properties.ingredients.items;

  const before = Object.keys(ing.properties).indexOf("typical_serving_g");
  ing.properties = Object.fromEntries(
    Object.entries(ing.properties).map((
      [k, v],
    ) => [k === "typical_serving_g" ? key : k, v]),
  );
  ing.required = ing.required.map((r: string) =>
    r === "typical_serving_g" ? key : r
  );
  if (
    before < 0 || Object.keys(ing.properties).indexOf(key) !== before ||
    "typical_serving_g" in ing.properties || !ing.required.includes(key)
  ) {
    throw new Error(`the gram key rename to ${key} did not take`);
  }

  if (piecesFirst) {
    const rebuilt: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(item.properties)) {
      if (k === "serving_pieces") continue;
      if (k === "ingredients") {
        rebuilt.serving_pieces = item.properties.serving_pieces;
      }
      rebuilt[k] = v;
    }
    item.properties = rebuilt;
    const keys = Object.keys(rebuilt);
    if (keys.indexOf("serving_pieces") >= keys.indexOf("ingredients")) {
      throw new Error("serving_pieces did not move ahead of ingredients");
    }
    // `required` re-derived in PROPERTIES order, not appended to. Strict mode
    // emits in properties order, and leaving the two lists disagreeing is the
    // kind of drift that makes a schema hard to reason about later.
    const wasRequired = new Set<string>(item.required);
    item.required = keys.filter((k) => wasRequired.has(k));
    if (item.required.length !== wasRequired.size) {
      throw new Error("moving serving_pieces changed which fields are required");
    }
  }
  return schema;
}

/**
 * ARM NOPUSH — ☠️ RUN AND REJECTED, 57/108 vs the shipped 67 (eval 160). DO NOT RE-RUN.
 *
 * ⚠️ IT DOES NOT MEASURE WHAT ITS NAME SAYS. The unweighted addendum is ONE sentence
 * holding TWO OPPOSED halves, split by a colon (see ENRICH_PROMPT_UNWEIGHTED):
 *   A (restraint) "...the amount actually present in one order of this item as it is
 *                  served, rather than the amount that ingredient is served in on its own"
 *   B (the push)  ": a component that forms the body ... considerably greater quantity
 *                  than a standalone serving ... understates the item."
 * This arm deletes A AND B. Under the shipped gram ask - which asks for a nutrition
 * LABEL serving - A is the only restraint in the whole prompt, so deleting it sends
 * every ingredient back to a standalone portion: TACO PORCO 225 g -> 348 g, Salmón Roll
 * 230 g -> 477 g, mass 12 of 27 OVER against dual's 9. Worse on BOTH axes of
 * sim-mass-composition-split (its mass 58, its recipe 61, against 67).
 *
 * 🔑 That reconciles it with ORDER 61 vs ORDER-nopush 65 (+4 for the same deletion):
 * ORDER_ASK carries its own restraint, so there the deletion dropped only redundant
 * push. Restraint in that sentence alone -> -10. Restraint also in the gram ask -> +4.
 * ARM_NOBOOST below is the isolated test of B that neither arm performed.
 *
 * `key` is the shipped field, which makes the runner's remap the identity - the
 * arm reuses runOrderArm rather than growing a second request path (lesson 23).
 */
export const ARM_NOPUSH = {
  prompt: ENRICH_PROMPT + NO_PUSH,
  schema: ENRICH_SCHEMA_OPENAI,
  key: "typical_serving_g",
};
if (ARM_NOPUSH.prompt.includes("considerably greater quantity")) {
  throw new Error("the push clause survived - NOPUSH would measure the shipped arm");
}

/**
 * ARM NOBOOST — the shipped pass-2 sentence with ONLY half B (the push) deleted.
 * Half A (the restraint) stays. Shipped gram ask, shipped schema, shipped key.
 *
 * Why: two arms now point at B and neither isolated it. ORDER-nopush beat ORDER by 4
 * with A still present in its gram ask; NOPUSH lost 10 with A deleted too. B is also
 * aimed at a failure mode this dish set no longer has - B says the standalone amount
 * "understates the item", while 12 of 27 dish-draws now come back OVER their band.
 *
 * Control: `dual` 67/108. Diff: one clause.
 */
const COLON = ": a component that forms the body";
const cut = PUSH.indexOf(COLON);
if (cut < 0) {
  throw new Error(
    "the push half moved inside ENRICH_PROMPT_UNWEIGHTED - re-split it before running NOBOOST",
  );
}
export const ARM_NOBOOST = {
  prompt: ENRICH_PROMPT + PUSH.slice(0, cut) + ".",
  schema: ENRICH_SCHEMA_OPENAI,
  key: "typical_serving_g",
};
if (
  ARM_NOBOOST.prompt.includes("considerably greater quantity") ||
  !ARM_NOBOOST.prompt.includes("served in on its own")
) {
  throw new Error("NOBOOST must drop the push and KEEP the restraint - it did not");
}

/**
 * ARM ROLE — NOBOOST's prompt, plus ONE required enum per ingredient. SCHEMA ONLY.
 *
 * `role` is an inert 4-value enum - body | filling | topping | garnish - inserted
 * immediately BEFORE the gram field. Nothing reads it. No sentence explains it, no
 * per-role gram table exists, and our arithmetic is unchanged. The ONLY mechanism
 * under test is B4 ordering: strict mode emits in schema order, so the model must
 * NAME what a component is to the dish before it prices it.
 *
 * Why schema-only: prompt wording is 0 for 6 in this phase and a required schema
 * field is 6 for 8. Adding a sentence too would make the arm two variables and an
 * unattributable result.
 *
 * ⚠️ THE RIDER THAT KILLED THE NEAREST PRIOR ARM. S4's second gram field came back
 * IDENTICAL to typical_serving_g in 364 of 364 ingredients, because a required field
 * whose MEANING OVERLAPS an existing one returns a copy. `role` overlaps nothing -
 * it is a label, not a second number, and no other field can supply it.
 *
 * Control: NOBOOST 70 and 72 /108. Diff: one enum. Post-run check is not only the
 * score - read the labels back. If everything is "body", the enum was inert in the
 * useless sense and the family is closed.
 */
export function roleSchema() {
  // deno-lint-ignore no-explicit-any
  const schema: any = structuredClone(ENRICH_SCHEMA_OPENAI);
  const ing = schema.properties.items.items.properties.ingredients.items;

  const rebuilt: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ing.properties)) {
    if (k === "typical_serving_g") {
      rebuilt.role = {
        type: "string",
        enum: ["body", "filling", "topping", "garnish"],
      };
    }
    rebuilt[k] = v;
  }
  ing.properties = rebuilt;
  const keys = Object.keys(rebuilt);
  // Strict mode requires EVERY property, and re-deriving in properties order keeps
  // the two lists from drifting - same reason orderSchema does it that way.
  const wasRequired = new Set<string>([...ing.required, "role"]);
  ing.required = keys.filter((k) => wasRequired.has(k));

  if (
    keys.indexOf("role") + 1 !== keys.indexOf("typical_serving_g") ||
    ing.required.length !== keys.length
  ) {
    throw new Error(
      "role must sit immediately before typical_serving_g and every field must be required",
    );
  }
  return schema;
}

export const ARM_ROLE = {
  prompt: ARM_NOBOOST.prompt,
  schema: roleSchema(),
  key: "typical_serving_g",
};

/**
 * ARM MASSCALL — NOBOOST's recipe, rescaled to a plate total from a SEPARATE call
 * that never sees an ingredient list. Prompt and schema are NOBOOST's, unchanged;
 * the arm's whole content is the second call, which lives in probe-plate-arms.ts.
 *
 * ⚠️ THE PLATE-WEIGHT FAMILY WAS RETIRED - UNDER A RULER THAT NO LONGER EXISTS.
 * Arm A (12-15/72), A-conditional (28-30/72) and every simulated threshold (best
 * 31/72) were measured on 6 dishes with the old band rule. The oracle is now 9
 * dishes /108 with a midpoint allowance, and under THAT ruler sim-mass-ceiling.ts
 * reads mass-anywhere-in-band at 80/108 against today's 67, taking OMELETTE CUBANA
 * 3/12 -> 12/12 and TACO PORCO 0 -> 12. The retirement note itself records the gap
 * this arm fills: "the simulation reuses Arm A's plate weights, produced by a prompt
 * that also rewrote the ingredient list. A real arm would have to source the plate
 * weight some other way."
 *
 * ⚠️ AND IT STILL CANNOT FIX CAPRICCIOSA. At 450 g, the TOP of its band, the pizza
 * returns 812 kcal against 1101-1238, because rescaling preserves proportions. That
 * finding is untouched by the new ruler. This arm is aimed at the dishes whose MIX
 * is already right and whose SIZE is not - which the 2026-08-21 split says is most
 * of them: mix error never exceeds +-20%, size error runs 0.65 to 1.30.
 */
export const ARM_MASSCALL = ARM_NOBOOST;

/**
 * The SHIPPED pass-2 question, as an arm object so HYBRID can re-ask it for the
 * items NOBOOST sized at or above its threshold. `PUSH` is defined above as the
 * tail of ENRICH_PROMPT_UNWEIGHTED, so this prompt IS that constant - there is no
 * second copy of the shipped sentence to drift.
 */
export const ARM_SHIPPED_PASS2 = {
  prompt: ENRICH_PROMPT + PUSH,
  schema: ENRICH_SCHEMA_OPENAI,
  key: "typical_serving_g",
};
if (ARM_SHIPPED_PASS2.prompt !== ENRICH_PROMPT_UNWEIGHTED) {
  throw new Error(
    "ARM_SHIPPED_PASS2 is not byte-identical to ENRICH_PROMPT_UNWEIGHTED - " +
      "HYBRID would re-ask a question production never asks",
  );
}

export const ARM_ORDER = { prompt: ORDER_PROMPT, schema: orderSchema(ORDER_KEY), key: ORDER_KEY };
export const ARM_ORDER_NOPUSH = { prompt: ORDER_NOPUSH_PROMPT, schema: orderSchema(ORDER_KEY), key: ORDER_KEY };
export const ARM_PIECE = { prompt: PIECE_PROMPT, schema: orderSchema(PIECE_KEY, true), key: PIECE_KEY };
