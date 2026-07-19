// Forced-tile geometry A/B (horizontal Phase 1 step 2): bypass the (broken)
// detector and run Polloteria through runGroupedExtraction as ONE dense page,
// with two tile geometries, x3 runs each, oracle-scored.
//   2x2     — the gate-proven portrait grid (gridCropRects)
//   4x1col  — landscape column strips: 40% width, full height, origins
//             0/20/40/60. Portrait-shaped tiles preserve text height through
//             GPT-4o's rescale; 4 tiles = production group size.
// Usage: deno run --allow-read --allow-write --allow-env --allow-net \
//   --allow-run scripts/probe-tiles.ts
import { runGroupedExtraction } from "../supabase/functions/analyze-menu/extract.ts";
import { type CropRect, gridCropRects } from "../src/lib/adaptiveExtraction.ts";
import { scoreMenu } from "./eval-extraction.ts";
import {
  compressedPhotoData,
  MENU_DIR,
  PROD_JPEG_QUALITY,
  PROD_MAX_DIMENSION,
} from "./photo-input.ts";
import { buildProbeDump } from "./probe-output.ts";
import { cutTile } from "./tile-cut.ts";

type Fixture = Parameters<typeof scoreMenu>[0];
type ScoredDim =
  | "items"
  | "options"
  | "section_context"
  | "categories"
  | "grams";

const apiKey = Deno.env.get("OPENAI_API_KEY")!;
const tmp = await Deno.makeTempDir({ prefix: "tiles-" });
const PHOTO = Deno.env.get("PROBE_PHOTO") ?? "PolloteriaMenu.png";
const PROBE_NAME = Deno.env.get("PROBE_NAME") ?? "polloteria";
const FIXTURE_FILE = Deno.env.get("PROBE_FIXTURE") ??
  "polloteria.expected.json";
const fixture: Fixture = JSON.parse(
  await Deno.readTextFile(
    new URL(`./fixtures/${FIXTURE_FILE}`, import.meta.url),
  ),
);
const DIMS: ScoredDim[] = [
  "items",
  "options",
  "section_context",
  "categories",
  "grams",
];
const DUMP_TAG = Deno.env.get("DUMP_TAG") ?? "eval085";

function colStripRects(w: number, h: number): CropRect[] {
  const tileW = Math.round(w * 0.4);
  return [0, 0.2, 0.4, 0.6].map((o) => {
    const originX = Math.round(w * o);
    return {
      originX,
      originY: 0,
      width: Math.min(tileW, w - originX),
      height: h,
    };
  });
}

async function dims(path: string): Promise<{ w: number; h: number }> {
  const out = await new Deno.Command("sips", {
    args: ["-g", "pixelWidth", "-g", "pixelHeight", path],
  }).output();
  if (!out.success) {
    throw new Error(
      `sips dims failed: ${new TextDecoder().decode(out.stderr)}`,
    );
  }
  const text = new TextDecoder().decode(out.stdout);
  const w = Number(text.match(/pixelWidth:\s+(\d+)/)?.[1]);
  const h = Number(text.match(/pixelHeight:\s+(\d+)/)?.[1]);
  if (!Number.isFinite(w) || !Number.isFinite(h)) {
    throw new Error(`could not parse dimensions from sips output: ${text}`);
  }
  return { w, h };
}

async function cutTiles(rects: CropRect[], tag: string): Promise<string[]> {
  const src = `${MENU_DIR}/${PHOTO}`;
  const tiles: string[] = [];
  for (const [i, rect] of rects.entries()) {
    const out = `${tmp}/${tag}-tile${i + 1}.png`;
    await cutTile(src, rect, out);
    tiles.push(
      `data:image/png;base64,${(await Deno.readFile(out)).toBase64()}`,
    );
  }
  return tiles;
}

const { w, h } = await dims(`${MENU_DIR}/${PHOTO}`);
const ocrPhoto = await compressedPhotoData(
  PHOTO,
  PROD_MAX_DIMENSION,
  PROD_JPEG_QUALITY,
  tmp,
);
const GEOMETRIES = [
  { key: "2x2", rects: gridCropRects(w, h) },
];

for (const g of GEOMETRIES) {
  console.log(
    `\n===== GEOMETRY: ${g.key} rects=${JSON.stringify(g.rects)} =====`,
  );
  const tiles = await cutTiles(g.rects, g.key);

  for (let run = 1; run <= 3; run++) {
    try {
      const result = await runGroupedExtraction(
        [tiles],
        apiKey,
        undefined,
        undefined,
        [ocrPhoto],
      );
      const report = scoreMenu(fixture, {
        image_quality: result.image_quality,
        items: result.items,
      });
      const fails = DIMS.filter((d) => !report[d].pass);
      const detail = DIMS.map((d) => `${d}=${report[d].pass ? "P" : "F"}`).join(
        " ",
      );
      const dumpPath =
        `${MENU_DIR}/${PROBE_NAME}.tiles-${g.key}-${DUMP_TAG}-r${run}.actual.json`;

      await Deno.writeTextFile(
        dumpPath,
        `${JSON.stringify(buildProbeDump(result), null, 2)}\n`,
      );

      console.log(
        `${g.key} run ${run}: ${detail}; ${
          fails.length === 0 ? "ALL PASS" : `FAIL ${fails.join(",")}`
        }; dump=${dumpPath}`,
      );

      if (fails.length > 0) {
        for (const d of fails) {
          console.log(`  ${d}: ${report[d].detail}`);
        }
        console.log(
          "stopping after first scored failure; diagnostic trace captured",
        );
        break;
      }
    } catch (error) {
      console.log(
        `${g.key} run ${run}: TERMINAL ${String(error).slice(0, 100)}`,
      );
    }
  }
}
