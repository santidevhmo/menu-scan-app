import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  firstPage,
  median,
  percentile,
  perLineHeights,
  rescaledHeight,
} from "./probe-textsize-eval088.ts";
import type { OcrBlock, OcrPage } from "./probe-textsize-eval088.ts";

const block = (content: string, height: number): OcrBlock => ({
  content,
  top_left_x: 0,
  top_left_y: 0,
  bottom_right_x: 100,
  bottom_right_y: height,
});

Deno.test("perLineHeights divides block height by content line count", () => {
  assertEquals(
    perLineHeights([
      block("a\nb\nc", 60),
      block("  ", 20),
      block("bad", 0),
      block("also bad", -1),
    ]),
    [20],
  );
});

Deno.test("median handles odd and even lengths", () => {
  assertEquals(median([1, 3, 2]), 2);
  assertEquals(median([1, 2, 3, 4]), 2.5);
});

Deno.test("percentile uses the clamped floored index", () => {
  assertEquals(percentile([10, 20, 30, 40], 25), 20);
});

Deno.test("rescaledHeight uses the 768px shortest-side scale", () => {
  const page: OcrPage = {
    dimensions: { width: 2048, height: 1415 },
    blocks: [],
  };
  assert(Math.abs(rescaledHeight(20, page) - 10.86) <= 0.01);
});

Deno.test("firstPage accepts both OCR cache shapes", () => {
  const page: OcrPage = { dimensions: { width: 100, height: 200 }, blocks: [] };
  assertEquals(firstPage({ responses: [{ pages: [page] }] }), page);
  assertEquals(firstPage({ pages: [page] }), page);
});
