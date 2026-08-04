import { assertEquals } from "jsr:@std/assert";
import {
  acceptRotation,
  correctionDegrees,
  detectOrientation,
  isPositivelyUpright,
  MIN_BLOCKS,
  type OcrBlock,
  printedNumbers,
} from "./orientation.ts";

/** `count` text boxes laid out as reading lines. `wide` makes them wider than
 *  tall (a page whose lines lie down); `down`/`right` set which way reading
 *  order advances, which is what separates upright from upside down. */
function page(
  count: number,
  { wide = true, down = true, right = true } = {},
): OcrBlock[] {
  return Array.from({ length: count }, (_, i) => {
    const step = down ? i : count - 1 - i;
    const cross = right ? i : count - 1 - i;
    const x = cross * 10;
    const y = step * 10;
    return {
      top_left_x: x,
      top_left_y: y,
      bottom_right_x: x + (wide ? 100 : 5),
      bottom_right_y: y + (wide ? 5 : 100),
      content: `line ${i}`,
    };
  });
}

Deno.test("an upright page is upright", () => {
  assertEquals(detectOrientation(page(40)), "upright");
});

Deno.test("horizontal lines reading backwards are upside down", () => {
  assertEquals(
    detectOrientation(page(40, { down: false, right: false })),
    "upside_down",
  );
});

Deno.test("vertical lines reading down-and-leftwards are turned clockwise", () => {
  assertEquals(
    detectOrientation(page(40, { wide: false, right: false })),
    "turned_clockwise",
  );
});

Deno.test("vertical lines reading up-and-rightwards are turned counter-clockwise", () => {
  assertEquals(
    detectOrientation(page(40, { wide: false, down: false })),
    "turned_counter_clockwise",
  );
});

// REFUSALS. These are the requirement, not the detections: Santiago asked for
// "not wrongly identifying correct upright menus and rotating them by accident".
Deno.test("REFUSES a page with too few text boxes to judge", () => {
  assertEquals(detectOrientation(page(MIN_BLOCKS - 1, { wide: false })), "upright");
});

Deno.test("REFUSES when the two axes disagree", () => {
  // Lines lie down, reading advances down the page but leftwards: no orientation
  // produces that, so we do not have one.
  assertEquals(detectOrientation(page(40, { right: false })), "upright");
});

Deno.test("REFUSES a page with no blocks at all", () => {
  assertEquals(detectOrientation([]), "upright");
});

Deno.test("REFUSES blocks that carry no text", () => {
  const blank = page(40).map((block) => ({ ...block, content: "   " }));
  assertEquals(detectOrientation(blank), "upright");
});

Deno.test("every correction returns the page upright", () => {
  assertEquals(correctionDegrees("upright"), 0);
  assertEquals(correctionDegrees("upside_down"), 180);
  // sips -r 90 turns CLOCKWISE (pinned to the pixel from bistro's header box in
  // the spec), so a clockwise-turned page is undone by a further 270.
  assertEquals(correctionDegrees("turned_clockwise"), 270);
  assertEquals(correctionDegrees("turned_counter_clockwise"), 90);
});

Deno.test("isPositivelyUpright demands evidence, not the absence of a verdict", () => {
  assertEquals(isPositivelyUpright(page(40)), true);
  // detectOrientation answers "upright" here too — because it cannot tell.
  assertEquals(detectOrientation(page(5)), "upright");
  assertEquals(isPositivelyUpright(page(5)), false);
});

Deno.test("printedNumbers counts bare prices, not just $ amounts", () => {
  // guest-house prints 150/280 with no currency symbol; an earlier draft
  // required $ or a unit and scored that whole menu at 3.
  assertEquals(printedNumbers("CHARRED BRUSSELS 18\nMISO MUSHROOMS 21"), 2);
  assertEquals(printedNumbers("5 FORMAGGI $240\nPapa (300gr)"), 3);
  assertEquals(printedNumbers("no numbers here"), 0);
});

Deno.test("acceptRotation needs BOTH guards", () => {
  const upright = { blocks: page(40), markdown: "A 100\nB 200\nC 300" };
  const sideways = { blocks: page(40, { wide: false, right: false }), markdown: "A\nB" };
  assertEquals(acceptRotation(upright, { markdown: "A 100\nB 200\nC 300" }), true);
  // Geometry fails: the "correction" produced a sideways page.
  assertEquals(acceptRotation(sideways, { markdown: "A" }), false);
  // Geometry passes but the numbers collapsed.
  assertEquals(
    acceptRotation({ blocks: page(40), markdown: "A" }, { markdown: "A 1 2 3 4 5" }),
    false,
  );
});
