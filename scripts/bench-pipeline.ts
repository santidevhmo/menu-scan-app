// Stage-2 PIPELINE INTEGRITY, not macro accuracy.
//
// The macro benchmark sends 8 fixture items in one call. Production sends whole
// menus through callGptEnrich in batches of ENRICH_BATCH_SIZE, and nothing has
// ever measured whether a model survives THAT: item count, input order,
// allergens (the mandatory disclaimer depends on them), and truncation.
//
// Answers one question: can a candidate model replace the pin without breaking
// the pipeline? Macro quality is bench-macros.ts's job, not this file's.
//
// Run: OPENAI_API_KEY=... deno run --allow-read --allow-write --allow-env --allow-net \
//        scripts/bench-pipeline.ts [model ...]
import {
  callGptEnrich,
  ENRICH_MODEL,
  type EnrichedItem,
  type ExtractedItem,
} from "../supabase/functions/analyze-menu/enrich.ts";

const MENUS = ["AndaluzMenu.jpg", "PolloteriaMenu.png"] as const;
const DRAFT_DIR = "scripts/fixtures/drafts";
const CACHE_DIR = "scripts/fixtures/caches";

/** Real extracted menus, already on disk — this run buys no OCR and no extraction. */
function loadMenu(draft: string): ExtractedItem[] {
  const parsed = JSON.parse(Deno.readTextFileSync(`${DRAFT_DIR}/${draft}.draft.json`)) as {
    items: ExtractedItem[];
  };
  return parsed.items;
}

export interface IntegrityReport {
  menu: string;
  model: string;
  sent: number;
  returned: number;
  orderPreserved: boolean;
  /** Items backfilled by reassembleEnriched — the model dropped them. */
  backfilled: string[];
  withAllergens: number;
  withIngredients: number;
  emptyMacros: string[];
  ms: number;
}

/**
 * An item is backfilled when the model failed to return it: fallbackEnriched
 * emits confidence "low" with no ingredients and zeroed macros. That exact
 * shape is the drop signal.
 */
function isBackfilled(item: EnrichedItem): boolean {
  return item.ingredients.length === 0 && item.estimated_calories === 0 &&
    item.confidence === "low";
}

export function inspect(
  menu: string,
  model: string,
  sent: ExtractedItem[],
  got: EnrichedItem[],
  ms: number,
): IntegrityReport {
  return {
    menu,
    model,
    sent: sent.length,
    returned: got.length,
    orderPreserved: got.every((item, i) => item.name === sent[i]?.name),
    backfilled: got.filter(isBackfilled).map((i) => i.name),
    withAllergens: got.filter((i) => (i.allergens ?? []).length > 0).length,
    withIngredients: got.filter((i) => (i.ingredients ?? []).length > 0).length,
    emptyMacros: got.filter((i) => !isBackfilled(i) && i.estimated_calories === 0)
      .map((i) => i.name),
    ms,
  };
}

export function renderReport(rows: IntegrityReport[]): string {
  const out = [
    "menu            model                     sent ret order drop allerg ingr  ms",
  ];
  for (const r of rows) {
    out.push(
      `${r.menu.padEnd(15)} ${r.model.padEnd(25)} ${String(r.sent).padStart(4)} ${
        String(r.returned).padStart(3)
      } ${(r.orderPreserved ? "ok" : "BROKEN").padStart(5)} ${
        String(r.backfilled.length).padStart(4)
      } ${String(r.withAllergens).padStart(6)} ${String(r.withIngredients).padStart(4)} ${
        String(r.ms).padStart(5)
      }`,
    );
    if (r.backfilled.length) out.push(`   dropped: ${r.backfilled.join(", ")}`);
    if (r.emptyMacros.length) out.push(`   zero macros: ${r.emptyMacros.join(", ")}`);
  }
  return out.join("\n");
}

if (import.meta.main) {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY is required");
  const models = Deno.args.length ? Deno.args : [ENRICH_MODEL];

  const rows: IntegrityReport[] = [];
  for (const model of models) {
    for (const menu of MENUS) {
      const items = loadMenu(menu);
      const started = Date.now();
      const result = await callGptEnrich(items, apiKey, model);
      const ms = Date.now() - started;
      // Archived BEFORE anything is inspected, passing runs included - lesson 26.
      Deno.writeTextFileSync(
        `${CACHE_DIR}/pipeline.${model}.${menu}.raw.json`,
        result.raw_response,
      );
      rows.push(inspect(menu, model, items, result.items, ms));
    }
  }
  console.log(renderReport(rows));
}
