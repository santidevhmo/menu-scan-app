import {
  assertAlmostEquals,
  assertEquals,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  parsePiecesInput,
  parsePortionInput,
  portionLabel,
  portionStep,
  resolvePiecesPerOrder,
  portionFromUnitCount,
  sanitizeDecimalInput,
  sanitizeIntegerInput,
  unitCount,
} from "./portions.ts";

Deno.test("a portion counts in the dish's own unit", () => {
  // A whole plate of 12 rolls is 12 units; a whole soup is 1.
  assertEquals(unitCount(1, 12), 12);
  assertEquals(unitCount(0.5, 12), 6);
  assertEquals(unitCount(1, 1), 1);
  assertEquals(unitCount(0.5, 1), 0.5);
  // Santiago typed 18 meaning eighteen rolls of a twelve-roll plate.
  assertEquals(portionFromUnitCount(18, 12), 1.5);
  assertEquals(portionFromUnitCount(6, 12), 0.5);
  assertEquals(portionFromUnitCount(0.5, 1), 0.5);
});

Deno.test("INVARIANT: units and share round-trip to observable precision", () => {
  // The editor converts one way and the row converts back. Any drift here
  // shows up as macros that do not match the number on the screen.
  //
  // NOT bit-identical: (1/3 * 50) / 50 differs from 1/3 in the last bit, which
  // is real IEEE-754 behaviour and not something code can undo. 1e-9 of an
  // order is a millionth of a calorie on a 1000 kcal plate.
  for (const pieces of [1, 2, 3, 8, 12, 50]) {
    for (const portion of [1, 0.5, 0.25, 2, 1 / 3]) {
      assertAlmostEquals(
        portionFromUnitCount(unitCount(portion, pieces), pieces),
        portion,
        1e-9,
        `round trip failed for portion=${portion} pieces=${pieces}`,
      );
    }
  }
});

Deno.test("nothing but digits and one dot survives the quantity field", () => {
  // A decimal-pad keyboard cannot produce letters, but a hardware keyboard, a
  // paste, and a dictation can. The field must refuse them at the source.
  assertEquals(sanitizeDecimalInput("18"), "18");
  assertEquals(sanitizeDecimalInput("0.5"), "0.5");
  assertEquals(sanitizeDecimalInput("1abc2"), "12");
  assertEquals(sanitizeDecimalInput("abc"), "");
  assertEquals(sanitizeDecimalInput("-3"), "3");
  assertEquals(sanitizeDecimalInput("1e5"), "15");
  // Only the FIRST dot is a decimal point; the rest are typos.
  assertEquals(sanitizeDecimalInput("1.2.3"), "1.23");
  assertEquals(sanitizeDecimalInput("."), ".");
  // Mid-typing states must survive, or the field fights the diner.
  assertEquals(sanitizeDecimalInput("0."), "0.");
  assertEquals(sanitizeDecimalInput(""), "");
});

Deno.test("the divisor field takes digits only - a piece is never fractional", () => {
  assertEquals(sanitizeIntegerInput("12"), "12");
  assertEquals(sanitizeIntegerInput("1.5"), "15");
  assertEquals(sanitizeIntegerInput("8abc"), "8");
  assertEquals(sanitizeIntegerInput("-2"), "2");
  assertEquals(sanitizeIntegerInput(""), "");
});

Deno.test("a model count the UI can trust is kept", () => {
  assertEquals(resolvePiecesPerOrder(8), 8);
  assertEquals(resolvePiecesPerOrder(3), 3);
  assertEquals(resolvePiecesPerOrder(12), 12);
  assertEquals(resolvePiecesPerOrder(50), 50);
});

Deno.test("every other shape a model can return becomes 1", () => {
  // 1 is the safe default: it is what most of the world's menu items are, and
  // it behaves exactly as the app did before pieces existed.
  for (const bad of [null, undefined, 0, -3, 1.5, 51, 1000, NaN, Infinity]) {
    assertEquals(resolvePiecesPerOrder(bad), 1, `pieces=${bad} must become 1`);
  }
});

Deno.test("the step is one piece, or half an order when there are no pieces", () => {
  assertEquals(portionStep(1), 0.5);
  assertEquals(portionStep(8), 1 / 8);
  assertEquals(portionStep(3), 1 / 3);
});

Deno.test("a dish with no pieces reads as a plain quantity", () => {
  assertEquals(portionLabel(1, 1), "1");
  assertEquals(portionLabel(0.5, 1), "0.5");
  assertEquals(portionLabel(2, 1), "2");
});

Deno.test("a dish with pieces reads as count over divisor", () => {
  assertEquals(portionLabel(1, 8), "8 / 8");
  assertEquals(portionLabel(0.5, 8), "4 / 8");
  assertEquals(portionLabel(0.5, 3), "1.5 / 3");
  assertEquals(portionLabel(2 / 3, 3), "2 / 3");
});

Deno.test("labels survive floating-point accumulation", () => {
  // 1/3 + 1/3 + 1/3 is not exactly 1, and nobody may ever see "2.9999 / 3".
  const third = portionStep(3);
  assertEquals(portionLabel(third + third, 3), "2 / 3");
  assertEquals(portionLabel(third + third + third, 3), "3 / 3");
});

Deno.test("neither form has a ceiling", () => {
  // Two whole pizzas is sixteen slices; two soups is 2.
  assertEquals(portionLabel(2, 8), "16 / 8");
  assertEquals(portionLabel(3, 1), "3");
});

Deno.test("INVARIANT: changing the divisor never changes the macros", () => {
  // The spec's central guarantee. Macros are itemMacros x portion, so the
  // divisor is arithmetically absent - this test is what keeps it that way.
  const kcal = 1043;
  for (const portion of [1, 0.5, 0.25, 2, 1 / 3]) {
    const macros = kcal * portion;
    for (const divisor of [1, 3, 8, 12, 50]) {
      // The label is the ONLY thing a divisor is allowed to touch.
      portionLabel(portion, divisor);
      assertEquals(
        kcal * portion,
        macros,
        `divisor=${divisor} moved the macros`,
      );
    }
  }
});

Deno.test("a typed quantity is accepted down to a quarter and rounded to 2dp", () => {
  assertEquals(parsePortionInput("0.25"), 0.25);
  assertEquals(parsePortionInput("1"), 1);
  assertEquals(parsePortionInput("2.5"), 2.5);
  assertEquals(parsePortionInput("0.333"), 0.33);
  // What is displayed must be what the macros used.
  assertEquals(portionLabel(parsePortionInput("0.25")!, 1), "0.25");
});

Deno.test("a typed quantity that is not a positive number is rejected", () => {
  for (
    const bad of [
      "",
      " ",
      "0",
      "-1",
      "abc",
      "1.2.3",
      "NaN",
      "Infinity",
      // Positive but rounds to zero. It used to pass the > 0 check BEFORE
      // rounding and return 0, which the editor accepts (0 is not null) and
      // prices as a 0-calorie row.
      "0.001",
      "0.004",
    ]
  ) {
    assertEquals(parsePortionInput(bad), null, `"${bad}" must be rejected`);
  }
});

Deno.test("a typed divisor must be a whole number of pieces from 1 to 50", () => {
  assertEquals(parsePiecesInput("8"), 8);
  assertEquals(parsePiecesInput("1"), 1);
  assertEquals(parsePiecesInput("50"), 50);
  for (const bad of ["", "0", "-2", "1.5", "51", "abc", "Infinity"]) {
    assertEquals(parsePiecesInput(bad), null, `"${bad}" must be rejected`);
  }
});
