import { assertEquals } from "jsr:@std/assert";
import {
  nonEmptyBlocks,
  orientationKeys,
  totalChars,
  wideBlockFraction,
  wordCount,
} from "./probe-rotation-h2.ts";

const block = (
  content: string,
  topLeftX: number,
  topLeftY: number,
  bottomRightX: number,
  bottomRightY: number,
) => ({
  content,
  top_left_x: topLeftX,
  top_left_y: topLeftY,
  bottom_right_x: bottomRightX,
  bottom_right_y: bottomRightY,
});

Deno.test("wideBlockFraction measures horizontal text blocks", () => {
  assertEquals(
    wideBlockFraction([block("x", 0, 0, 2, 1), block("x", 0, 0, 4, 1)]),
    1,
  );
  assertEquals(
    wideBlockFraction([block("x", 0, 0, 1, 2), block("x", 0, 0, 1, 4)]),
    0,
  );
  assertEquals(
    wideBlockFraction([block("x", 0, 0, 2, 1), block("x", 0, 0, 1, 2)]),
    0.5,
  );
});

Deno.test("wordCount excludes digits", () => {
  assertEquals(wordCount([block("Ensalada de Pollo 158", 0, 0, 1, 1)]), 3);
});

Deno.test("orientationKeys finds orientation metadata keys", () => {
  assertEquals(orientationKeys('{"rotation":90,"pages":[]}'), ["rotation"]);
  assertEquals(orientationKeys('{"pages":[]}'), []);
});

Deno.test("totalChars trims blocks and nonEmptyBlocks excludes empty content", () => {
  assertEquals(
    totalChars([block("abc", 0, 0, 1, 1), block(" de ", 0, 0, 1, 1)]),
    5,
  );
  assertEquals(
    nonEmptyBlocks([block("abc", 0, 0, 1, 1), block("", 0, 0, 1, 1)]),
    1,
  );
});
