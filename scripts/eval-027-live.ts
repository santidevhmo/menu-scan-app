// Eval 027 — LIVE exit-gate attempt for Feature 1 (food items).
// Runs the `items` gate (count ±3, no phantom section-headers, no duplicate
// food items) on all 6 menus, RUNS consecutive times. Prints per-menu PASS/FAIL
// and a per-run gate verdict. Exit code 0 only if all RUNS pass.
//
// Routing:
//   - Non-dense menus: one production-faithful runExtraction call.
//   - Dense menus: the validated recipe — uncompressed 2x2 tiles at detail:"high",
//     each a separate call, merged with mergeItemSources.
//
// GENERALIZATION NOTE: DENSE_TILES feeds Nikkori's PRE-CUT tiles (test assets).
// The recipe (grid + high detail + merge) is general; automatically cutting any
// dense menu worldwide is a separate production follow-up (image lib + extending
// extract-crops to 4 high-detail crops). This map is test-harness INPUT ROUTING
// only — it is not, and must not become, menu-specific logic in the solution.
//
// Run: OPENAI_API_KEY=... deno run --allow-read --allow-write --allow-env \
//        --allow-net scripts/eval-027-live.ts
import { runExtraction } from "../supabase/functions/analyze-menu/extract.ts";
import { mergeItemSources } from "../src/lib/adaptiveExtraction.ts";
import {
  formatOptionBreakdown,
  gateFailures,
  optionBreakdown,
  optionRecall,
  scoreMenu,
} from "./eval-extraction.ts";
import type { ExtractedItem } from "../src/types/scan.ts";

type Fixture = Parameters<typeof scoreMenu>[0];
type Actual = Parameters<typeof scoreMenu>[1];

const MENU_DIR = "/Users/santiagoaguirre/Downloads/MenusTesting";
const FIXTURE_DIR = new URL("./fixtures/", import.meta.url);
// EVAL_RUNS=1 for iteration baselines; default 3 = the exit-gate protocol.
const RUNS = Number(Deno.env.get("EVAL_RUNS") ?? "3");

const DENSE_TILES: Record<string, string[]> = {
  nikkori: [
    "NikkoriMenu.grid-raw-1.png",
    "NikkoriMenu.grid-raw-2.png",
    "NikkoriMenu.grid-raw-3.png",
    "NikkoriMenu.grid-raw-4.png",
  ],
};

const rawKey = Deno.env.get("OPENAI_API_KEY");
if (!rawKey) throw new Error("OPENAI_API_KEY is required");
const apiKey: string = rawKey;

function mime(name: string): string {
  return name.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
}

async function photoData(name: string): Promise<string> {
  const bytes = await Deno.readFile(`${MENU_DIR}/${name}`);
  return `data:${mime(name)};base64,${bytes.toBase64()}`;
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

async function extractMenu(fixture: Fixture): Promise<Actual> {
  const tiles = DENSE_TILES[fixture.menu];
  if (tiles) {
    const sources: ExtractedItem[][] = [];
    let quality: Actual["image_quality"] | undefined;
    for (const tile of tiles) {
      const result = await runExtraction([await photoData(tile)], apiKey, "high");
      quality ??= result.image_quality;
      sources.push(result.items.filter((item) => item.category !== "drink"));
    }
    return { image_quality: quality!, items: mergeItemSources(sources) };
  }
  const photos = await Promise.all(fixture.photos.map(photoData));
  const result = await runExtraction(photos, apiKey);
  return { image_quality: result.image_quality, items: result.items };
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
  for (const fixture of fixtures) {
    const actual = await extractMenu(fixture);
    const report = scoreMenu(fixture, actual);
    reports.push(report);
    const dups = duplicateNames(actual.items);
    console.log(
      `  ${report.items.pass ? "PASS" : "FAIL"} ${fixture.menu} items: ${report.items.detail}${
        dups.length ? ` [dups: ${dups.join("; ")}]` : ""
      }`,
    );
    const foodOnly = actual.items.filter((item) => item.category !== "drink");
    const recall = optionRecall(fixture, foodOnly);
    console.log(
      `  ${report.options.pass ? "PASS" : "FAIL"} ${fixture.menu} options: ${report.options.detail}; recall ${recall.found}/${recall.expected}`,
    );
    for (const line of formatOptionBreakdown(optionBreakdown(fixture, foodOnly))) {
      console.log(line);
    }
    if (!report.items.pass || !report.options.pass) {
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
  const GATE_DIMS = ["items", "options"] as const;
  const failures = gateFailures(reports, [...GATE_DIMS]);
  if (failures.length === 0) {
    consecutivePasses++;
    console.log(`  GATE PASS: ${GATE_DIMS.join(", ")} on all ${reports.length} menus`);
  } else {
    consecutivePasses = 0;
    console.log(`  GATE FAIL: ${failures.join("; ")}`);
  }
}

console.log(`\n===== ${consecutivePasses}/${RUNS} consecutive all-menu passing runs =====`);
if (consecutivePasses < RUNS) Deno.exitCode = 1;
