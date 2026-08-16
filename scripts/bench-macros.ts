// Run: OPENAI_API_KEY=... deno run --allow-read --allow-write --allow-env --allow-net \
//        scripts/bench-macros.ts
import type { ExtractedMenuItem } from "../supabase/functions/analyze-menu/extract.ts";
import {
  callGptEnrich,
  enrichBatch,
  ENRICH_MODEL,
  type EnrichedItem,
} from "../supabase/functions/analyze-menu/enrich.ts";
import { parseItemGrams } from "../supabase/functions/analyze-menu/postprocess.ts";
import { type FieldVerdict, type MacroValues } from "./macro-score.ts";
import {
  altOracle,
  pairWithOracle,
  scoreDish,
  toMacroValues,
} from "./macro-measure.ts";
import {
  type UsdaRecipeIngredient,
  validateRecipe,
} from "./usda-oracle.ts";

const FROZEN_ORACLE_PATH = "scripts/fixtures/macro-oracle.json";
// ponytail: the env read is optional on purpose. The documented $0 command is
// `deno run --allow-read scripts/rescore-history.ts`, and a bare Deno.env.get
// THROWS without --allow-env, which would break it. No env access = frozen oracle.
export const ORACLE_PATH = (() => {
  try {
    return Deno.env.get("MACRO_ORACLE_PATH") ?? FROZEN_ORACLE_PATH;
  } catch {
    return FROZEN_ORACLE_PATH;
  }
})();
const CACHE_DIR = "scripts/fixtures/caches";

type OracleValues = MacroValues & {
  assumed: string;
  source: string;
  retrieved_at: string;
  ingredients: UsdaRecipeIngredient[];
};

export interface OracleEntry {
  menu: string;
  name: string;
  description: string;
  price: number | null;
  category: ExtractedMenuItem["category"];
  section_title: string | null;
  options: ExtractedMenuItem["options"];
  printed_weight: string;
  oracle: OracleValues | null;
}

interface ItemDraw {
  pass: boolean;
  fields: FieldVerdict[];
  /** Per-field verdict AFTER any alternative oracle reading (PASTEL's beans). */
  passes: boolean[];
}

interface ItemResult {
  name: string;
  draws: ItemDraw[];
}

export function loadOracle(path: string): OracleEntry[] {
  const entries = JSON.parse(Deno.readTextFileSync(path)) as OracleEntry[];
  if (!Array.isArray(entries)) {
    throw new Error("oracle not filled");
  }
  for (const entry of entries) {
    const oracle = entry.oracle;
    if (!oracle) throw new Error("oracle not filled");
    if (oracle.source !== "USDA FoodData Central") {
      throw new Error("oracle source must be USDA FoodData Central");
    }
    if (!Array.isArray(oracle.ingredients) || !oracle.ingredients.length) {
      throw new Error("oracle requires a completed USDA ingredient list");
    }
    validateRecipe(oracle.ingredients, oracle);
  }
  return entries;
}

export function toExtractedItems(entries: OracleEntry[]): ExtractedMenuItem[] {
  return parseItemGrams(entries.map((entry) => ({
    name: entry.name,
    description: entry.description,
    price: entry.price,
    category: entry.category,
    section_title: entry.section_title,
    options: entry.options,
    grams: null,
  })));
}

function formatDelta(deltaPct: number | null): string {
  return deltaPct === null ? "n/a" : `${(deltaPct * 100).toFixed(1)}%`;
}

export function renderTable(results: ItemResult[]): string {
  return results.map(({ name, draws }) => {
    const detail = draws.flatMap((draw, index) => [
      `  draw ${index + 1}: ${draw.pass ? "PASS" : "FAIL"}`,
      ...draw.fields.map((field, i) =>
        // draw.passes, not field.pass - otherwise a dish with a second accepted
        // reading prints FAIL on a field its own draw counts as a PASS.
        `    ${field.field}: oracle ${field.oracle}, model ${field.model}, ${formatDelta(field.deltaPct)} ${draw.passes[i] ? "PASS" : "FAIL"}`
      ),
    ]);
    return [`${name}: ${draws.filter((draw) => draw.pass).length}/${draws.length}`, ...detail]
      .join("\n");
  }).join("\n\n");
}

/**
 * The model this BENCHMARK calls. Defaults to whatever production is pinned to,
 * so the harness measures the real pipeline unless told otherwise (lesson 23).
 *
 * `BENCH_MODEL` exists for B9, the cross-model arm: it is a measurement knob and
 * nothing more. Production's `ENRICH_MODEL` in supabase/functions/analyze-menu/
 * is untouched by it, and no measured result moves that constant without a
 * separate ruling.
 */
export function benchModel(): string {
  return Deno.env.get("BENCH_MODEL") ?? ENRICH_MODEL;
}

export async function enrich(
  items: ExtractedMenuItem[],
): Promise<{ items: EnrichedItem[]; raw: unknown }> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY is required");

  // Calls the DEPLOYED path. This function used to build its own OpenAI request,
  // which meant every macro number ever published came from a request production
  // does not send. Prompt and schema changes still measured correctly because
  // both copies imported them - but anything enrichBatch did AROUND the request
  // was invisible, and B20 wasted a paid run discovering it. The `temperature: 0`
  // incident was the same defect in bench-pipeline.ts; a9fce10 fixed that copy
  // and left this one. bench-macros_test.ts now fails the build if it returns.
  // BENCH_BATCH_SIZE (2026-08-12). This harness has always sent all 8 fixtures in
  // ONE call - effectively batch 8 - while production chunks a real menu into
  // ENRICH_BATCH_SIZE groups. That was harmless until the batch-size curve
  // measured that batch size SHIFTS the answer and not just its scatter, which
  // makes "one call of 8" a regime production never runs. Set this to score the
  // fixtures at a real batch size, through callGptEnrich - the deployed path,
  // including its retry, reassembly and concurrency cap. Unset, the request is
  // byte-identical to every archived run and the numbers stay comparable.
  const batchSize = Number(Deno.env.get("BENCH_BATCH_SIZE") ?? "0");
  if (batchSize > 0) {
    const result = await callGptEnrich(items, apiKey, benchModel(), batchSize);
    // raw_response carries the reassembled items, which is all replayDraw needs
    // to re-score this run for $0 later.
    return { items: result.items, raw: JSON.parse(result.raw_response) };
  }

  let raw: unknown = null;
  const enriched = await enrichBatch(items, apiKey, benchModel(), (r) => {
    raw = r;
  });
  return { items: enriched, raw };
}

/**
 * Re-reads one archived draw instead of calling the model, so a changed oracle
 * can be applied to history for $0.
 *
 * The oracle has been re-frozen twice now (printed weights `a4ebf0f`, the Caesar
 * dressing `a60eb2a`) and each time every archived run had to be re-scored or
 * the phase's numbers stop being comparable. That was done once with an ad-hoc
 * script that no longer exists; this is the same thing, kept.
 */
export async function replayDraw(
  runId: string,
  draw: number,
): Promise<EnrichedItem[]> {
  const raw: unknown = JSON.parse(
    await Deno.readTextFile(`${CACHE_DIR}/macro-bench.${runId}-d${draw}.raw.json`),
  );
  // A BENCH_BATCH_SIZE run archives the reassembled items instead of one chat
  // completion, because at batch 3 there is no single completion to archive.
  const reassembled = (raw as { items?: EnrichedItem[] })?.items;
  if (Array.isArray(reassembled)) return reassembled;
  const content = (raw as {
    choices?: { message?: { content?: string } }[];
  })?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error(`archived draw ${draw} of ${runId} has no message content`);
  }
  return JSON.parse(content).items as EnrichedItem[];
}

async function run(): Promise<void> {
  const entries = loadOracle(ORACLE_PATH);
  const items = toExtractedItems(entries);
  const draws = Number(Deno.env.get("BENCH_DRAWS") ?? "3");
  const runId = Deno.env.get("BENCH_RUN_ID") ?? new Date().toISOString();
  const results: ItemResult[] = entries.map((entry) => ({
    name: entry.name,
    draws: [],
  }));

  // BENCH_RESCORE=1 costs nothing: it replays archived responses through the
  // CURRENT oracle. It must never write to the cache - the archive it reads is
  // the evidence, and overwriting it would destroy the run it is re-scoring.
  const rescore = Deno.env.get("BENCH_RESCORE") === "1";

  for (let draw = 0; draw < draws; draw++) {
    let drawItems: EnrichedItem[];
    if (rescore) {
      drawItems = await replayDraw(runId, draw);
    } else {
      const response = await enrich(items);
      await Deno.writeTextFile(
        `${CACHE_DIR}/macro-bench.${runId}-d${draw}.raw.json`,
        JSON.stringify(response.raw, null, 2),
      );
      drawItems = response.items;
    }

    // Paired by NAME and scored through the shared path, so this table and the
    // published figures from rescore-history.ts cannot say different things.
    // A live call must return every dish; a replay may be an older, shorter run.
    for (const { name, item } of pairWithOracle(
      entries.map((entry) => entry.name),
      drawItems,
      rescore ? "skip" : "throw",
    )) {
      const index = entries.findIndex((entry) => entry.name === name);
      results[index].draws.push(
        scoreDish(
          name,
          entries[index].oracle!,
          toMacroValues(item),
          altOracle(entries[index], items[index].grams),
        ),
      );
    }
  }

  console.log(renderTable(results));
}

if (import.meta.main) await run();
