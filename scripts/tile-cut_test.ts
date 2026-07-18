import { assertEquals } from "jsr:@std/assert";
import { gridCropRects } from "../src/lib/adaptiveExtraction.ts";
import { cutTile, imageDims } from "./tile-cut.ts";

const HELPER = new URL("./png-crop.cjs", import.meta.url).pathname;

async function node(...args: string[]): Promise<string> {
  const out = await new Deno.Command("node", { args: [HELPER, ...args] })
    .output();
  if (!out.success) {
    throw new Error(new TextDecoder().decode(out.stderr));
  }
  return new TextDecoder().decode(out.stdout).trim();
}

async function pixel(path: string, x: number, y: number): Promise<string> {
  return node("pixel", path, String(x), String(y));
}

Deno.test("cutTile preserves synthetic corner positions including 0,0", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "tile-cut-synthetic-" });
  const source = `${tmp}/source.png`;
  await node("make", source, "200", "140");
  const rects = [
    { originX: 0, originY: 0, width: 120, height: 84 },
    { originX: 80, originY: 0, width: 120, height: 84 },
    { originX: 0, originY: 56, width: 120, height: 84 },
    { originX: 80, originY: 56, width: 120, height: 84 },
  ];
  try {
    for (const [index, rect] of rects.entries()) {
      const output = `${tmp}/tile-${index}.png`;
      await cutTile(source, rect, output);
      assertEquals(
        await pixel(output, 0, 0),
        await pixel(source, rect.originX, rect.originY),
      );
      assertEquals(
        await pixel(output, rect.width - 1, rect.height - 1),
        await pixel(
          source,
          rect.originX + rect.width - 1,
          rect.originY + rect.height - 1,
        ),
      );
    }
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("cutTile preserves source positions for every Polloteria grid tile", async () => {
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
      assertEquals(
        await pixel(output, 0, 0),
        await pixel(source, rect.originX, rect.originY),
      );
    }
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});
