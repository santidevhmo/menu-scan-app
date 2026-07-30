// Eval 027 — LIVE exit-gate attempt for Feature 1 (food items).
// Runs the `items` gate (count ±3, no phantom section-headers, no duplicate
// food items) on all 6 menus, RUNS consecutive times. Prints per-menu PASS/FAIL
// and a per-run gate verdict. Exit code 0 only if all RUNS pass.
//
// Routing (production-faithful, no menu-keyed logic):
//   Every menu runs phase-1 runPagedExtraction — the same function the edge
//   stage:"extract" runs. Pages that dense-signal (image_layout.dense OR
//   terminal timeout/finish_reason=length) are cut at runtime into the proven
//   2x2 tiles from the ORIGINAL photo (sips; pixel-identical to the retired
//   pre-cut assets) and re-extracted via runGroupedExtraction — the same
//   function behind stage:"extract-pages". The detector verdict is asserted
//   per menu against the fixture's `dense` flag (data, not code): a non-dense
//   menu that dense-signals (wasted credits) or a dense menu that doesn't is
//   a gate FAIL.
//
// Run: OPENAI_API_KEY=... deno run --allow-read --allow-write --allow-env \
//        --allow-net --allow-run scripts/eval-027-live.ts
import {
  runGroupedExtraction,
  runPagedExtraction,
} from "../supabase/functions/analyze-menu/extract.ts";
import { gridCropRects } from "../src/lib/adaptiveExtraction.ts";
import {
  formatOptionBreakdown,
  gateFailures,
  optionBreakdown,
  optionRecall,
  scoreMenu,
} from "./eval-extraction.ts";
import {
  compressedPhotoData,
  PROD_JPEG_QUALITY,
  PROD_MAX_DIMENSION,
  productionPhotoData,
} from "./photo-input.ts";
import { cutTile } from "./tile-cut.ts";

type Fixture = Parameters<typeof scoreMenu>[0];
type Actual = Parameters<typeof scoreMenu>[1];

const MENU_DIR = "/Users/santiagoaguirre/Downloads/MenusTesting";
const FIXTURE_DIR = new URL("./fixtures/", import.meta.url);
// EVAL_RUNS=1 for iteration baselines; default 3 = the exit-gate protocol.
const RUNS = Number(Deno.env.get("EVAL_RUNS") ?? "3");

const rawKey = Deno.env.get("OPENAI_API_KEY");
if (!rawKey) throw new Error("OPENAI_API_KEY is required");
const apiKey: string = rawKey;
const rawMistralKey = Deno.env.get("MISTRAL_API_KEY");
if (!rawMistralKey) throw new Error("MISTRAL_API_KEY is required");
const mistralApiKey: string = rawMistralKey;

const INPUT_TMP = await Deno.makeTempDir({ prefix: "eval-input-" });

// Phase-1 input: PRODUCTION-MIRROR compression (ticket #3, spec 2026-07-12).
// Dense tiles still cut from ORIGINALS (cutTiles), exactly like prepareTile.
function photoData(name: string): Promise<string> {
  return productionPhotoData(name, INPUT_TMP);
}

async function loadFixtures(): Promise<Fixture[]> {
  const names: string[] = [];
  for await (const entry of Deno.readDir(FIXTURE_DIR)) {
    if (entry.isFile && entry.name.endsWith(".expected.json")) {
      names.push(entry.name);
    }
  }
  const fixtures = await Promise.all(
    names.sort().map(async (name) =>
      JSON.parse(await Deno.readTextFile(new URL(name, FIXTURE_DIR))) as Fixture
    ),
  );
  // EVAL_MENUS=el-marcos,brasero-two → cheap targeted run while iterating.
  // NEVER set for the exit gate — the gate is all 6 menus.
  const only = Deno.env.get("EVAL_MENUS");
  if (!only) return fixtures;
  const wanted = new Set(only.split(",").map((menu) => menu.trim()));
  return fixtures.filter((fixture) => wanted.has(fixture.menu));
}

const TILE_DIR = await Deno.makeTempDir({ prefix: "eval-tiles-" });

async function dims(path: string): Promise<{ w: number; h: number }> {
  const out = await new Deno.Command("sips", {
    args: ["-g", "pixelWidth", "-g", "pixelHeight", path],
  }).output();
  const text = new TextDecoder().decode(out.stdout);
  return {
    w: Number(text.match(/pixelWidth: (\d+)/)?.[1]),
    h: Number(text.match(/pixelHeight: (\d+)/)?.[1]),
  };
}

// Runtime tile cutting from the ORIGINAL photo — the production recipe.
// sips cropping is pixel-identical to the retired pre-cut tiles (verified
// 2026-07-10: tile-4 TIFF hash match). Format per the tile A/B (Task 7).
async function cutTiles(name: string): Promise<string[]> {
  // PNG (lossless) locked by the tile A/B (ledger 2026-07-11): jpeg q0.85
  // re-inflated phantom items 55/48 and destabilized a tile call; production
  // client tiles are PNG too (prepareTile).
  const ext = "png";
  const mimeType = "image/png";
  const src = `${MENU_DIR}/${name}`;
  const { w, h } = await dims(src);
  const tiles: string[] = [];
  for (const [i, rect] of gridCropRects(w, h).entries()) {
    const out = `${TILE_DIR}/${name.replaceAll("/", "_")}.tile${i}.${ext}`;
    await cutTile(src, rect, out);
    tiles.push(
      `data:${mimeType};base64,${(await Deno.readFile(out)).toBase64()}`,
    );
  }
  return tiles;
}

async function extractMenu(
  fixture: Fixture,
): Promise<Actual & { denseSignaled: boolean }> {
  // Phase-1 input: production-mirror compressed (see photoData above).
  const photos = await Promise.all(fixture.photos.map(photoData));
  const phase1 = await runPagedExtraction(photos, mistralApiKey);
  if (!("needs_crops" in phase1)) {
    return {
      image_quality: phase1.image_quality,
      items: phase1.items,
      denseSignaled: false,
    };
  }
  const denseSet = new Set(phase1.needs_crops);
  const groups = await Promise.all(
    fixture.photos.map(async (name, index) =>
      denseSet.has(index) ? await cutTiles(name) : [await photoData(name)]
    ),
  );
  const ocrPhotos = await Promise.all(
    fixture.photos.map((name, index) =>
      denseSet.has(index)
        ? compressedPhotoData(
          name,
          PROD_MAX_DIMENSION,
          PROD_JPEG_QUALITY,
          INPUT_TMP,
        )
        : Promise.resolve(null)
    ),
  );
  const result = await runGroupedExtraction(
    groups,
    apiKey,
    undefined,
    undefined,
    ocrPhotos,
  );
  return {
    image_quality: result.image_quality,
    items: result.items,
    denseSignaled: true,
  };
}

// Mirrors the scorer's duplicate definition (name + price + description) so
// failures are self-explaining in the log instead of just a count.
function duplicateNames(items: Actual["items"]): string[] {
  const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ");
  const seen = new Set<string>();
  const dups = new Set<string>();
  for (const item of items.filter((i) => i.category !== "drink")) {
    const key = `${norm(item.name)}@${item.price}@${norm(item.description)}`;
    if (seen.has(key)) dups.add(item.name);
    else seen.add(key);
  }
  return [...dups];
}

const fixtures = await loadFixtures();
let consecutivePasses = 0;

for (let run = 1; run <= RUNS; run++) {
  console.log(`\n===== RUN ${run}/${RUNS} =====`);
  const reports = [];
  const detectorFailures: string[] = [];
  for (const fixture of fixtures) {
    const actual = await extractMenu(fixture);
    // Detector assertion (user requirement 2026-07-10): a non-dense menu
    // that dense-signals wastes ~4 calls + a round trip per page; a dense
    // menu that does not gets garbage items. Both fail the run.
    const detectorOk = actual.denseSignaled === Boolean(fixture.dense);
    console.log(
      `  ${detectorOk ? "PASS" : "FAIL"} ${fixture.menu} detector: ${
        actual.denseSignaled ? "dense-signaled" : "normal"
      } (expected ${fixture.dense ? "dense" : "normal"})`,
    );
    if (!detectorOk) detectorFailures.push(fixture.menu);
    const report = scoreMenu(fixture, actual);
    reports.push(report);
    const dups = duplicateNames(actual.items);
    console.log(
      `  ${
        report.items.pass ? "PASS" : "FAIL"
      } ${fixture.menu} items: ${report.items.detail}${
        dups.length ? ` [dups: ${dups.join("; ")}]` : ""
      }`,
    );
    const foodOnly = actual.items.filter((item) => item.category !== "drink");
    const recall = optionRecall(fixture, foodOnly);
    console.log(
      `  ${
        report.options.pass ? "PASS" : "FAIL"
      } ${fixture.menu} options: ${report.options.detail}; recall ${recall.found}/${recall.expected}`,
    );
    for (
      const line of formatOptionBreakdown(optionBreakdown(fixture, foodOnly))
    ) {
      console.log(line);
    }
    console.log(
      `  ${
        report.section_context.pass ? "PASS" : "FAIL"
      } ${fixture.menu} section_context: ${report.section_context.detail}`,
    );
    console.log(
      `  ${
        report.categories.pass ? "PASS" : "FAIL"
      } ${fixture.menu} categories: ${report.categories.detail}`,
    );
    console.log(
      `  ${
        report.grams.pass ? "PASS" : "FAIL"
      } ${fixture.menu} grams: ${report.grams.detail}`,
    );
    if (
      !report.items.pass || !report.options.pass ||
      !report.section_context.pass || !report.categories.pass ||
      !report.grams.pass
    ) {
      await Deno.writeTextFile(
        `${MENU_DIR}/${fixture.menu}.eval027-r${run}.actual.json`,
        `${JSON.stringify(actual, null, 2)}\n`,
      );
    }
  }
  // ⚠️ CUMULATIVE GATE — this list MUST include every CLOSED feature's dimension,
  // not just the active one, or a run silently passes without re-checking frozen
  // gates (roadmap "Cumulative regression gates"). scoreMenu already computes all
  // dimensions from the same response, so widening this array costs ZERO API calls.
  // Feature 1 = ["items"]; Feature 2 → ["items","options"]; Feature 3 →
  // ["items","options","section_context"]; etc. Widen it when you start a feature.
  const GATE_DIMS = [
    "items",
    "options",
    "section_context",
    "categories",
    "grams",
  ] as const;
  const failures = gateFailures(reports, [...GATE_DIMS]);
  if (detectorFailures.length > 0) {
    failures.push(`detector: ${detectorFailures.join(", ")}`);
  }
  if (failures.length === 0) {
    consecutivePasses++;
    console.log(
      `  GATE PASS: ${
        GATE_DIMS.join(", ")
      } + detector on all ${reports.length} menus`,
    );
  } else {
    consecutivePasses = 0;
    console.log(`  GATE FAIL: ${failures.join("; ")}`);
  }
}

console.log(
  `\n===== ${consecutivePasses}/${RUNS} consecutive all-menu passing runs =====`,
);
if (consecutivePasses < RUNS) Deno.exitCode = 1;
