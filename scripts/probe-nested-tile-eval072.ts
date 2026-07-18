// Eval 072 — nested tile-3 density probe (container ROADMAP 1d; ruling 8).
// Frozen: eval-068 r1 archived raw responses for parent tiles 0,1,3
// (archived per-tile item counts 19/17/46/25 — index 2 is the overloaded
// fake-producer). Live: ONLY parent tile 2, re-extracted as a nested 2x2 with
// 25%-of-parent overlap (40% of each sub-tile). Verify/merge/hygiene run the
// untouched production runGroupedExtraction via its injectable extract param —
// extraction density of region 2 is the single changed variable. Frozen tiles
// are re-verified live (their post-verify state was not archived; verifier is
// temperature-0 — residual variance is ledgered).
// Cost: 4 extraction + ~6 verify calls ≈ $0.22/run; x3 stop-on-first-failure.
// Launch (ONLY after planner relays approval):
//   deno run --env-file=.env.local --allow-env --allow-read --allow-write \
//     --allow-net=api.openai.com --allow-run scripts/probe-nested-tile-eval072.ts

import {
  type ExtractionResult,
  extractWithRetry,
  runExtraction,
  runGroupedExtraction,
} from "../supabase/functions/analyze-menu/extract.ts";
import { postprocessItems } from "../supabase/functions/analyze-menu/postprocess.ts";
import { mergeItemSources } from "../supabase/functions/analyze-menu/merge.ts";
import { type CropRect, gridCropRects } from "../src/lib/adaptiveExtraction.ts";
import { scoreMenu } from "./eval-extraction.ts";
import { MENU_DIR } from "./photo-input.ts";
import { buildProbeDump } from "./probe-output.ts";

type Fixture = Parameters<typeof scoreMenu>[0];
type ScoredDim = "items" | "options" | "section_context" | "categories" | "grams";

const PHOTO = "PolloteriaMenu.png";
const ARCHIVE = `${MENU_DIR}/polloteria.tiles-2x2-eval068-r1.actual.json`;
export const OVERLOADED = 2;
const DIMS: ScoredDim[] = ["items", "options", "section_context", "categories", "grams"];

/** 2x2 sub-grid over one parent with 25% overlap by parent side. */
export function nestedRects(parent: CropRect): CropRect[] {
  const overlap = 0.25;
  const subW = Math.round(parent.width * (1 + overlap) / 2);
  const subH = Math.round(parent.height * (1 + overlap) / 2);
  const xs = [parent.originX, parent.originX + parent.width - subW];
  const ys = [parent.originY, parent.originY + parent.height - subH];
  return ys.flatMap((originY) =>
    xs.map((originX) => ({ originX, originY, width: subW, height: subH }))
  );
}

/** Rebuild exactly what runExtraction returns: parse + postprocess + raw. */
export function frozenTileResult(raw: string): ExtractionResult {
  const parsed = JSON.parse(raw) as Omit<ExtractionResult, "raw_response">;
  return { ...parsed, items: postprocessItems(parsed.items), raw_response: raw };
}

/** Frozen tiles replay the archive; the overloaded parent runs the nested 2x2 live. */
export function buildInjectedExtract(
  frozen: Map<string, ExtractionResult>,
  parentImg: string,
  nested: string[],
  extract: typeof extractWithRetry,
): typeof extractWithRetry {
  return async (
    photos: string[],
    apiKey: string,
    detail?: "auto" | "high" | "low",
    _extract: typeof runExtraction = runExtraction,
    tile = false,
    page = false,
  ): Promise<ExtractionResult> => {
    const img = photos[0];
    const hit = frozen.get(img);
    if (hit) return hit;
    if (img === parentImg) {
      const subs = await Promise.all(
        nested.map((s) => extract([s], apiKey, "high", undefined, true)),
      );
      console.log(
        `[eval072] nested sub food counts: ${
          subs.map((s) => s.items.filter((i) => i.category === "food").length).join("/")
        }`,
      );
      const items = mergeItemSources(subs.map((s) => s.items), true);
      console.log(`[eval072] tile2 nested-merged items: ${items.length}`);
      return {
        image_quality: subs[0].image_quality,
        image_layout: subs[0].image_layout,
        items,
        raw_response: JSON.stringify(subs.map((s) => s.raw_response)),
      };
    }
    return extract(photos, apiKey, detail, _extract, tile, page);
  };
}

async function sh(args: string[]): Promise<void> {
  const out = await new Deno.Command(args[0], { args: args.slice(1) }).output();
  if (!out.success) {
    throw new Error(`${args.join(" ")} failed: ${new TextDecoder().decode(out.stderr)}`);
  }
}

async function dims(path: string): Promise<{ w: number; h: number }> {
  const out = await new Deno.Command("sips", {
    args: ["-g", "pixelWidth", "-g", "pixelHeight", path],
  }).output();
  if (!out.success) {
    throw new Error(`sips dims failed: ${new TextDecoder().decode(out.stderr)}`);
  }
  const text = new TextDecoder().decode(out.stdout);
  const w = Number(text.match(/pixelWidth:\s+(\d+)/)?.[1]);
  const h = Number(text.match(/pixelHeight:\s+(\d+)/)?.[1]);
  if (!Number.isFinite(w) || !Number.isFinite(h)) {
    throw new Error(`could not parse dimensions from sips output: ${text}`);
  }
  return { w, h };
}

async function cutTiles(rects: CropRect[], tag: string, tmp: string): Promise<string[]> {
  const src = `${MENU_DIR}/${PHOTO}`;
  const tiles: string[] = [];
  for (const [i, rect] of rects.entries()) {
    const out = `${tmp}/${tag}-tile-${i}.png`;
    await sh([
      "sips",
      "-s",
      "format",
      "png",
      "--cropOffset",
      String(rect.originY),
      String(rect.originX),
      "-c",
      String(rect.height),
      String(rect.width),
      src,
      "--out",
      out,
    ]);
    const bytes = await Deno.readFile(out);
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 32768) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    }
    tiles.push(`data:image/png;base64,${btoa(binary)}`);
  }
  return tiles;
}

if (import.meta.main) {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY is required");

  const tmp = await Deno.makeTempDir({ prefix: "eval072-" });
  try {
    const { w, h } = await dims(`${MENU_DIR}/${PHOTO}`);
    const parentRects = gridCropRects(w, h);
    const parentImgs = await cutTiles(parentRects, "parent", tmp);
    const nestedImgs = await cutTiles(nestedRects(parentRects[OVERLOADED]), "nested", tmp);
    const archive = JSON.parse(await Deno.readTextFile(ARCHIVE)) as { raw_response: string };
    const archived = JSON.parse(archive.raw_response) as string[];
    if (archived.length !== 4) throw new Error("expected four archived tile responses");

    const frozen = new Map<string, ExtractionResult>();
    for (const i of [0, 1, 3]) frozen.set(parentImgs[i], frozenTileResult(archived[i]));
    const injected = buildInjectedExtract(
      frozen,
      parentImgs[OVERLOADED],
      nestedImgs,
      extractWithRetry,
    );
    const fixture: Fixture = JSON.parse(
      await Deno.readTextFile(new URL("./fixtures/polloteria.expected.json", import.meta.url)),
    );

    for (let run = 1; run <= 3; run++) {
      try {
        const result = await runGroupedExtraction([parentImgs], apiKey, injected);
        const report = scoreMenu(fixture, {
          image_quality: result.image_quality,
          items: result.items,
        });
        const fails = DIMS.filter((d) => !report[d].pass);
        const dumpPath = `${MENU_DIR}/polloteria.nested-tile-eval072-r${run}.actual.json`;
        await Deno.writeTextFile(dumpPath, `${JSON.stringify(buildProbeDump(result), null, 2)}\n`);
        console.log(
          `run ${run}: ${DIMS.map((d) => `${d}=${report[d].pass ? "P" : "F"}`).join(" ")}; ${
            fails.length === 0 ? "ALL PASS" : `FAIL ${fails.join(",")}`
          }; dump=${dumpPath}`,
        );
        if (fails.length > 0) {
          for (const d of fails) console.log(`${d}: ${report[d].detail}`);
          console.log("stopping on first scored failure per approved design");
          break;
        }
      } catch (error) {
        console.log(`run ${run}: TERMINAL ${String(error).slice(0, 200)}`);
        console.log("stopping on terminal failure");
        break;
      }
    }
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
}
