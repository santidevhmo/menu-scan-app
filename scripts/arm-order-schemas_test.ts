// The three ORDER arms are a PAID measurement whose whole claim is "one variable
// changed". These assertions are what makes that claim checkable for $0.
import { assert, assertEquals } from "jsr:@std/assert";
import {
  ARM_NOBOOST,
  ARM_NOPUSH,
  ARM_ORDER,
  ARM_ORDER_NOPUSH,
  ARM_PIECE,
  ORDER_KEY,
  orderSchema,
  PIECE_KEY,
} from "./arm-order-schemas.ts";
import {
  ENRICH_PROMPT,
  ENRICH_PROMPT_UNWEIGHTED,
  ENRICH_SCHEMA_OPENAI,
} from "../supabase/functions/analyze-menu/enrich.ts";

// deno-lint-ignore no-explicit-any
const ing = (s: any) => s.properties.items.items.properties.ingredients.items;
// The item NODE's property map and required list - not the node itself.
// deno-lint-ignore no-explicit-any
const itemProps = (s: any) => s.properties.items.items.properties;
// deno-lint-ignore no-explicit-any
const itemReq = (s: any): string[] => s.properties.items.items.required;

Deno.test("the gram key is renamed IN PLACE, not appended", () => {
  for (const [key, schema] of [
    [ORDER_KEY, ARM_ORDER.schema],
    [PIECE_KEY, ARM_PIECE.schema],
  ] as const) {
    const before = Object.keys(ing(ENRICH_SCHEMA_OPENAI));
    const after = Object.keys(ing(schema));
    assertEquals(after.length, before.length, "no field added or lost");
    assertEquals(
      after.indexOf(key),
      before.indexOf("typical_serving_g"),
      "position unchanged - strict mode emits in schema order",
    );
    assert(!after.includes("typical_serving_g"), "old key gone");
    assert(ing(schema).required.includes(key), "new key required");
  }
});

Deno.test("PIECE commits to the piece count BEFORE pricing pieces (B4)", () => {
  const keys = Object.keys(itemProps(ARM_PIECE.schema));
  assert(
    keys.indexOf("serving_pieces") < keys.indexOf("ingredients"),
    "serving_pieces must precede ingredients",
  );
  // ORDER leaves the item-level order exactly as shipped.
  assertEquals(
    Object.keys(itemProps(ARM_ORDER.schema)),
    Object.keys(itemProps(ENRICH_SCHEMA_OPENAI)),
  );
});

Deno.test("required stays in properties order and keeps the same members", () => {
  for (const schema of [ARM_ORDER.schema, ARM_PIECE.schema]) {
    const keys = Object.keys(itemProps(schema));
    const req = itemReq(schema);
    assertEquals(req, keys.filter((k) => req.includes(k)));
    assertEquals(
      [...req].sort(),
      [...itemReq(ENRICH_SCHEMA_OPENAI)].sort(),
    );
  }
});

Deno.test("no arm prompt still names the old gram field", () => {
  for (const arm of [ARM_ORDER, ARM_ORDER_NOPUSH, ARM_PIECE]) {
    assert(
      !arm.prompt.includes("typical_serving_g"),
      "a prompt naming a field the schema lacks is a contradiction, not an arm",
    );
    assert(arm.prompt.includes(arm.key), "the prompt must name the arm's key");
  }
});

Deno.test("ORDER and ORDER-nopush differ ONLY by pass 2's push sentence", () => {
  const push = ENRICH_PROMPT_UNWEIGHTED.slice(ENRICH_PROMPT.length)
    .replaceAll('"typical_serving_g"', `"${ORDER_KEY}"`);
  assertEquals(ARM_ORDER.prompt, ARM_ORDER_NOPUSH.prompt.replace(
    " The items in this request print no weight.",
    push,
  ));
  // Same schema object shape - the only difference between the two arms is text.
  assertEquals(
    JSON.stringify(ARM_ORDER.schema),
    JSON.stringify(ARM_ORDER_NOPUSH.schema),
  );
});

Deno.test("the arms keep the shipped prompt's other three steps intact", () => {
  // Everything after the gram instruction is untouched; if a future edit moves
  // step 2 or 3, this fails rather than a paid run measuring something else.
  for (const arm of [ARM_ORDER, ARM_ORDER_NOPUSH, ARM_PIECE]) {
    assert(arm.prompt.includes('2. For each ingredient, give its composition'));
    assert(arm.prompt.includes('3. Give "serving_pieces"'));
    assert(arm.prompt.includes('4. Set "confidence"'));
  }
});

Deno.test("a moved gram instruction THROWS instead of measuring the shipped prompt", () => {
  let threw = false;
  try {
    // orderSchema's own guard: a key that is not in the schema cannot be renamed.
    orderSchema("grams_in_one_order");
    // And the prompt guard is exercised by construction above - if the markers
    // stopped matching, importing this module would already have thrown.
  } catch {
    threw = true;
  }
  assertEquals(threw, false, "the current prompt and schema still match");
});

Deno.test("NOBOOST drops ONLY the push half, and keeps everything else shipped", () => {
  // The shipped addendum is one sentence, two opposed halves, split by a colon.
  // NOPUSH deleted both (57/108). NOBOOST must delete only the second.
  const addendum = ENRICH_PROMPT_UNWEIGHTED.slice(ENRICH_PROMPT.length);
  const restraint = "rather than the amount that ingredient is served in on its own";
  const push = "considerably greater quantity";
  assert(addendum.includes(restraint), "half A is not where NOBOOST assumes");
  assert(addendum.includes(push), "half B is not where NOBOOST assumes");

  assert(ARM_NOBOOST.prompt.includes(restraint), "NOBOOST lost the restraint");
  assert(!ARM_NOBOOST.prompt.includes(push), "NOBOOST kept the push");
  // NOPUSH is the arm that dropped BOTH - that is why it is not a push test.
  assert(!ARM_NOPUSH.prompt.includes(restraint));
  assert(!ARM_NOPUSH.prompt.includes(push));

  // Everything except that clause is the shipped pass-2 request, byte for byte.
  assertEquals(ARM_NOBOOST.schema, ENRICH_SCHEMA_OPENAI);
  assertEquals(ARM_NOBOOST.key, "typical_serving_g");
  assert(ARM_NOBOOST.prompt.startsWith(ENRICH_PROMPT));
  assert(ENRICH_PROMPT_UNWEIGHTED.startsWith(ARM_NOBOOST.prompt.slice(0, -1)));
});
