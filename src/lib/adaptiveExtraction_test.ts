import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { gridCropRects, limitPhotos } from "./adaptiveExtraction.ts";

Deno.test("grid produces the proven 2x2 nikkori tiles", () => {
  assertEquals(gridCropRects(1196, 1896), [
    { originX: 0, originY: 0, width: 718, height: 1138 },
    { originX: 478, originY: 0, width: 718, height: 1138 },
    { originX: 0, originY: 758, width: 718, height: 1138 },
    { originX: 478, originY: 758, width: 718, height: 1138 },
  ]);
});

Deno.test("grid rects stay within bounds for odd dimensions", () => {
  for (const rect of gridCropRects(1197, 1895)) {
    assertEquals(rect.originX + rect.width <= 1197, true);
    assertEquals(rect.originY + rect.height <= 1895, true);
  }
});

Deno.test("photo list is capped at ten", () => {
  assertEquals(limitPhotos(Array.from({ length: 12 }, (_, id) => id)).length, 10);
});
