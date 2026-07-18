import { assertEquals } from "jsr:@std/assert";
import { gridCropRects } from "../src/lib/adaptiveExtraction.ts";
import { cutTile, imageDims, rotatedRect } from "./tile-cut.ts";

Deno.test("rotatedRect maps the flush bottom-left tile", () => {
  assertEquals(
    rotatedRect(
      { originX: 0, originY: 629, width: 1364, height: 943 },
      2274,
      1572,
    ),
    { originX: 910, originY: 0, width: 1364, height: 943 },
  );
});

Deno.test("rotatedRect round-trips a non-flush rect", () => {
  const rect = { originX: 120, originY: 240, width: 500, height: 300 };
  assertEquals(
    rotatedRect(rotatedRect(rect, 2274, 1572), 2274, 1572),
    rect,
  );
});

Deno.test("cutTile outputs exact dimensions for every Polloteria grid tile", async () => {
  const source =
    "/Users/santiagoaguirre/Downloads/MenusTesting/PolloteriaMenu.png";
  const tmp = await Deno.makeTempDir({ prefix: "tile-cut-test-" });
  try {
    for (const [index, rect] of gridCropRects(2274, 1572).entries()) {
      const output = `${tmp}/tile-${index}.png`;
      await cutTile(source, rect, output);
      assertEquals(await imageDims(output), {
        w: 1364,
        h: 943,
      });
    }
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});
