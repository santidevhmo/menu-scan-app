// Compression ladder probe (ticket #3, spec 2026-07-12): for each fixture, run
// phase-1 runPagedExtraction on 4 input arms — original (control), 1024/q0.70,
// 1536/q0.80, 2048/q0.85 — and oracle-score every non-dense verdict. Detector
// assertions per arm: nikkori MUST dense-signal; the 5 normal menus must NOT.
// Filters for targeted re-probes:
//   PROBE_MODES=2048q85 PROBE_MENUS=el-marcos deno run ... scripts/probe-fidelity.ts
// Run (detached):
//   nohup deno run --allow-read --allow-write --allow-env --allow-net \
//     --allow-run scripts/probe-fidelity.ts > /tmp/probe-ladder.log 2>&1 &
import { runPagedExtraction } from "../supabase/functions/analyze-menu/extract.ts";
import { scoreMenu } from "./eval-extraction.ts";
import { compressedPhotoData, MENU_DIR } from "./photo-input.ts";

type Fixture = Parameters<typeof scoreMenu>[0];
const FIXTURE_DIR = new URL("./fixtures/", import.meta.url);
const apiKey = Deno.env.get("OPENAI_API_KEY")!;
const tmp = await Deno.makeTempDir({ prefix: "fidelity-" });

function mime(name: string): string {
  return name.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
}

async function originalData(name: string): Promise<string> {
  const bytes = await Deno.readFile(`${MENU_DIR}/${name}`);
  return `data:${mime(name)};base64,${bytes.toBase64()}`;
}

interface Mode {
  key: string;
  maxDim: number | null;
  quality: number | null;
}

const MODES: Mode[] = [
  { key: "original", maxDim: null, quality: null },
  { key: "1024q70", maxDim: 1024, quality: 70 },
  { key: "1536q80", maxDim: 1536, quality: 80 },
  { key: "2048q85", maxDim: 2048, quality: 85 },
  { key: "2048q90", maxDim: 2048, quality: 90 },
  { key: "2048q95", maxDim: 2048, quality: 95 },
];

const fixtures: Fixture[] = [];
for await (const entry of Deno.readDir(FIXTURE_DIR)) {
  if (entry.isFile && entry.name.endsWith(".expected.json")) {
    fixtures.push(
      JSON.parse(await Deno.readTextFile(new URL(entry.name, FIXTURE_DIR))),
    );
  }
}
fixtures.sort((a, b) => a.menu.localeCompare(b.menu));

const onlyModes = Deno.env.get("PROBE_MODES")?.split(",").map((s) => s.trim());
const onlyMenus = Deno.env.get("PROBE_MENUS")?.split(",").map((s) => s.trim());
const modes = onlyModes ? MODES.filter((mode) => onlyModes.includes(mode.key)) : MODES;
const menus = onlyMenus
  ? fixtures.filter((fixture) => onlyMenus.includes(fixture.menu))
  : fixtures;

const DIMS = ["items", "options", "section_context", "categories", "grams"] as const;
const summary: string[] = [];

for (const mode of modes) {
  console.log(`\n===== MODE: ${mode.key} =====`);
  for (const fixture of menus) {
    const photos = await Promise.all(
      fixture.photos.map(async (photo) => {
        const data = mode.maxDim === null
          ? await originalData(photo)
          : await compressedPhotoData(photo, mode.maxDim, mode.quality!, tmp);
        console.log(`  [payload] ${photo}: ${data.length} chars`);
        return data;
      }),
    );
    let line: string;
    try {
      const result = await runPagedExtraction(photos, apiKey);
      const denseSignaled = "needs_crops" in result;
      const detectorOk = denseSignaled === Boolean(fixture.dense);
      if (denseSignaled) {
        line = `${fixture.menu}: DENSE-SIGNAL — detector ${detectorOk ? "OK" : "WRONG"}`;
      } else {
        const report = scoreMenu(fixture, {
          image_quality: result.image_quality,
          items: result.items,
        });
        const fails = DIMS.filter((dim) => !(report[dim] as { pass: boolean }).pass);
        line = `${fixture.menu}: detector ${detectorOk ? "OK" : "WRONG"}; ${
          fails.length === 0 ? "ALL DIMS PASS" : `FAIL ${fails.join(",")}`
        }`;
        if (fails.length > 0) {
          await Deno.writeTextFile(
            `${MENU_DIR}/${fixture.menu}.fidelity-${mode.key}.actual.json`,
            `${JSON.stringify({ image_quality: result.image_quality, items: result.items }, null, 2)}\n`,
          );
        }
      }
    } catch (error) {
      line = `${fixture.menu}: TERMINAL ${String(error).slice(0, 80)}`;
    }
    console.log(`${mode.key} ${line}`);
    summary.push(`${mode.key.padEnd(9)} ${line}`);
  }
}

console.log("\n===== LADDER SUMMARY =====");
for (const line of summary) console.log(line);
