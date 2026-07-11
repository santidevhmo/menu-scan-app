import { runExtraction } from "../supabase/functions/analyze-menu/extract.ts";
import { mergeItemSources } from "../supabase/functions/analyze-menu/merge.ts";
import type { ExtractedItem } from "../src/types/scan.ts";

const MENU_DIR = "/Users/santiagoaguirre/Downloads/MenusTesting";
const apiKey = Deno.env.get("OPENAI_API_KEY");
if (!apiKey) throw new Error("OPENAI_API_KEY is required");

const oracle = JSON.parse(
  await Deno.readTextFile(new URL("./fixtures/nikkori-food-names.json", import.meta.url)),
) as { rolls: string[] };

const normalize = (value: string) =>
  value.normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, " ").trim();

async function photoBase64(name: string): Promise<string> {
  return `data:image/png;base64,${(await Deno.readFile(`${MENU_DIR}/${name}`)).toBase64()}`;
}

function score(label: string, sources: ExtractedItem[][], latencyMs: number) {
  const items = mergeItemSources(sources);
  const actualNames = items.map((item) => normalize(item.name));
  const expectedNames = oracle.rolls.map(normalize);
  const missing = oracle.rolls.filter((_, index) =>
    !actualNames.includes(expectedNames[index])
  );
  const extras = items
    .filter((item) => !expectedNames.includes(normalize(item.name)))
    .map((item) => item.name);
  const duplicates = actualNames.filter((name, index) => actualNames.indexOf(name) !== index);
  console.log(JSON.stringify({
    label,
    expected: oracle.rolls.length,
    actual: items.length,
    exact_roll_recall: `${oracle.rolls.length - missing.length}/${oracle.rolls.length}`,
    missing,
    extras,
    duplicates: [...new Set(duplicates)],
    summed_latency_ms: latencyMs,
    calls: sources.length,
  }, null, 2));
  return missing.length === 0 && duplicates.length === 0;
}

let passingRuns = 0;
let completedRuns = 0;
for (let run = 1; run <= 3; run++) {
  const sources: ExtractedItem[][] = [];
  let latencyMs = 0;
  let failed = "";
  for (let crop = 1; crop <= 4; crop++) {
    const photoName = `NikkoriMenu.grid-raw-${crop}.png`;
    const label = `grid-raw-high-r${run}-${crop}`;
    const startedAt = Date.now();
    let result;
    try {
      result = await runExtraction([await photoBase64(photoName)], apiKey, "high");
    } catch (error) {
      failed = `${label}: ${error instanceof Error ? error.message : String(error)}`;
      latencyMs += Date.now() - startedAt;
      break;
    }
    const elapsed = Date.now() - startedAt;
    latencyMs += elapsed;
    sources.push(result.items.filter((item) => item.category !== "drink"));
    await Deno.writeTextFile(
      `${MENU_DIR}/nikkori.${label}.actual.json`,
      `${JSON.stringify({
        image_quality: result.image_quality,
        image_layout: result.image_layout,
        items: result.items,
        latency_ms: elapsed,
        finish_reason: "stop",
        detail: "high",
      }, null, 2)}\n`,
    );
    console.log(`wrote nikkori.${label}.actual.json — ${result.items.length} items in ${elapsed}ms`);
  }
  if (failed) {
    console.log(JSON.stringify({
      label: `grid-raw-high-r${run}`,
      incomplete: true,
      error: failed,
      completed_calls: sources.length,
      summed_latency_ms: latencyMs,
    }, null, 2));
    continue;
  }
  completedRuns++;
  if (score(`grid-raw-high-r${run}`, sources, latencyMs)) passingRuns++;
}

console.log(JSON.stringify({ completedRuns, passingRuns }, null, 2));
if (passingRuns < 2) Deno.exitCode = 1;
