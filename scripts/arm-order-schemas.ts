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
// that kind of food". We ask for a label serving and we get one. Mass is the
// only lever with headroom left: sim-mass-ceiling.ts reads today 67/108,
// clamped-into-band 80/108, perfect mass 98/108.
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

export const ARM_ORDER = { prompt: ORDER_PROMPT, schema: orderSchema(ORDER_KEY), key: ORDER_KEY };
export const ARM_ORDER_NOPUSH = { prompt: ORDER_NOPUSH_PROMPT, schema: orderSchema(ORDER_KEY), key: ORDER_KEY };
export const ARM_PIECE = { prompt: PIECE_PROMPT, schema: orderSchema(PIECE_KEY, true), key: PIECE_KEY };
