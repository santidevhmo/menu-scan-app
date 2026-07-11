import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { cropRects, limitPhotos, validateLayout } from "./adaptiveExtraction.ts";

Deno.test("two left-right crops overlap by 20 percent", () => {
  assertEquals(cropRects(1000, 800, "left_right", 2), [
    { originX: 0, originY: 0, width: 600, height: 800 },
    { originX: 400, originY: 0, width: 600, height: 800 },
  ]);
});

Deno.test("two top-bottom crops overlap by 20 percent", () => {
  assertEquals(cropRects(800, 1000, "top_bottom", 2), [
    { originX: 0, originY: 0, width: 800, height: 600 },
    { originX: 0, originY: 400, width: 800, height: 600 },
  ]);
});

Deno.test("three crops use 45 percent regions", () => {
  assertEquals(cropRects(1000, 800, "left_right", 3), [
    { originX: 0, originY: 0, width: 450, height: 800 },
    { originX: 275, originY: 0, width: 450, height: 800 },
    { originX: 550, originY: 0, width: 450, height: 800 },
  ]);
});

Deno.test("dense layout requires a crop direction", () => {
  assertThrows(
    () => validateLayout({ dense: true, crop_direction: "none" }),
    Error,
    "Dense image is missing a crop direction",
  );
});

Deno.test("photo list is capped at ten", () => {
  assertEquals(limitPhotos(Array.from({ length: 12 }, (_, id) => id)).length, 10);
});
