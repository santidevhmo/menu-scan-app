// Run: OPENAI_API_KEY=... deno run --allow-read --allow-write --allow-env --allow-net \
//        scripts/bench-macros.ts
import type { ExtractedMenuItem } from "../supabase/functions/analyze-menu/extract.ts";
import {
  ENRICH_PROMPT,
  ENRICH_MODEL,
  ENRICH_SCHEMA_OPENAI,
  type EnrichedItem,
  sumIngredientMacros,
} from "../supabase/functions/analyze-menu/enrich.ts";
import { parseItemGrams } from "../supabase/functions/analyze-menu/postprocess.ts";
import {
  type FieldVerdict,
  type MacroValues,
  scoreItem,
} from "./macro-score.ts";
import {
  type UsdaRecipeIngredient,
  validateRecipe,
} from "./usda-oracle.ts";

const ORACLE_PATH = "scripts/fixtures/macro-oracle.json";
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

function modelValues(item: EnrichedItem): MacroValues {
  // B10: production computes the item totals from the model's per-ingredient
  // numbers and DISCARDS the ones the model emitted at item level. Scoring
  // item.protein_g here would grade a value the app never shows (lesson 23 -
  // the harness must run the real logic, not a parallel copy).
  // B4: the printed total is part of the real computation - without it the
  // servings are scored unscaled and the harness grades a number production
  // never emits (lesson 23 - the harness must run the real logic).
  const totals = sumIngredientMacros(
    archivedIngredients(item.ingredients ?? []),
    item.printed_total_g,
  );
  return {
    calories: totals.estimated_calories,
    protein_g: totals.protein_g,
    carb_g: totals.carb_g,
    fat_g: totals.fat_g,
  };
}

function formatDelta(deltaPct: number | null): string {
  return deltaPct === null ? "n/a" : `${(deltaPct * 100).toFixed(1)}%`;
}

export function renderTable(results: ItemResult[]): string {
  return results.map(({ name, draws }) => {
    const detail = draws.flatMap((draw, index) => [
      `  draw ${index + 1}: ${draw.pass ? "PASS" : "FAIL"}`,
      ...draw.fields.map((field) =>
        `    ${field.field}: oracle ${field.oracle}, model ${field.model}, ${formatDelta(field.deltaPct)} ${field.pass ? "PASS" : "FAIL"}`
      ),
    ]);
    return [`${name}: ${draws.filter((draw) => draw.pass).length}/${draws.length}`, ...detail]
      .join("\n");
  }).join("\n\n");
}

export async function enrich(items: ExtractedMenuItem[]): Promise<{ items: EnrichedItem[]; raw: unknown }> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY is required");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: ENRICH_MODEL,
      messages: [{
        role: "user",
        content: `${ENRICH_PROMPT}\n\nMenu items (JSON):\n${JSON.stringify(items)}`,
      }],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "menu_items",
          strict: true,
          schema: ENRICH_SCHEMA_OPENAI,
        },
      },
      temperature: 0,
      seed: 17,
    }),
  });
  const raw = await res.json();
  if (!res.ok) {
    throw new Error((raw as { error?: { message?: string } }).error?.message ?? "OpenAI API error");
  }
  const content = (raw as {
    choices?: { message?: { content?: string } }[];
  }).choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI response missing content");
  return { items: JSON.parse(content).items as EnrichedItem[], raw };
}

/**
 * Normalises an archived ingredient list to the current shape.
 *
 * Runs before B4 emitted a final `grams` per ingredient and carried no printed
 * total. Mapping those to `typical_serving_g` with `within_printed_weight: true`
 * and no printed total makes resolveGrams pass them through unscaled - which is
 * exactly what they meant.
 *
 * Without this, re-scoring any pre-B4 run returns ZERO for every macro and still
 * prints a full table of -100% failures that looks like a real result. Six of
 * the ten archived runs are pre-B4.
 */
export function archivedIngredients(
  ingredients: {
    grams?: number;
    typical_serving_g?: number;
    within_printed_weight?: boolean;
  }[],
): EnrichedItem["ingredients"] {
  return ingredients.map((i) =>
    i.typical_serving_g === undefined && i.grams !== undefined
      ? { ...i, typical_serving_g: i.grams, within_printed_weight: true }
      : i
  ) as EnrichedItem["ingredients"];
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

    for (const [index, entry] of entries.entries()) {
      const item = drawItems[index];
      if (!item) throw new Error(`draw ${draw}: model returned too few items`);
      results[index].draws.push(scoreItem(entry.oracle!, modelValues(item)));
    }
  }

  console.log(renderTable(results));
}

if (import.meta.main) await run();
