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
  ENRICH_BATCH_SIZE,
  ENRICH_MODEL,
  type EnrichedItem,
  type ExtractedItem,
} from "../supabase/functions/analyze-menu/enrich.ts";
import { parseItemGrams } from "../supabase/functions/analyze-menu/postprocess.ts";
import type { ExtractedMenuItem } from "../supabase/functions/analyze-menu/extract.ts";

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

// Only four menus have a .draft.json, but every menu has an ARCHIVED EXTRACTION
// in caches/ — a raw chat completion whose content carries the same items[].
// Reading those covers all ten menus for $0 instead of re-buying OCR for six.
// parseItemGrams is applied because a draft is post-postprocess and the grams
// field reaches the model; skipping it would test a request production never
// sends (lesson 28 - the harness must use the deployed path's shape).
const ARCHIVED_EXTRACTIONS: Record<string, string> = {
  andaluz: "andaluz.eval128-r1.raw.json",
  bistro: "bistro.eval117-r1.raw.json",
  brasero: "brasero.eval117-r1.raw.json",
  "brasero-two": "brasero-two.eval117-r1.raw.json",
  "casa-nostra": "casa-nostra.eval117-r1.raw.json",
  "el-marcos": "el-marcos.eval117-r1.raw.json",
  "guest-house": "guest-house.eval117-r1.raw.json",
  mochomos: "mochomos.eval117-r1.raw.json",
  nikkori: "nikkori.eval117-r1.raw.json",
  polloteria: "polloteria.eval117-r1.raw.json",
};

export function itemsFromArchive(raw: string): ExtractedItem[] {
  const outer = JSON.parse(raw) as {
    choices: { message: { content: string } }[];
  };
  const inner = JSON.parse(outer.choices[0].message.content) as {
    items: ExtractedMenuItem[];
  };
  // The archived extraction predates postprocess, so grams is absent; parseItemGrams
  // fills it exactly as the deployed pipeline does before enrichment sees the item.
  return parseItemGrams(
    inner.items.map((it) => ({
      ...it,
      section_title: it.section_title ?? null,
      options: it.options ?? [],
      grams: it.grams ?? null,
    })),
  );
}

function loadArchivedMenu(menu: string): ExtractedItem[] {
  return itemsFromArchive(
    Deno.readTextFileSync(`${CACHE_DIR}/${ARCHIVED_EXTRACTIONS[menu]}`),
  );
}

export interface IntegrityReport {
  menu: string;
  model: string;
  batchSize: number;
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
export function isBackfilled(item: EnrichedItem): boolean {
  // `?? []` because an archived or malformed item may carry no ingredients key
  // at all, and this must report a drop rather than throw mid-sweep.
  return (item.ingredients ?? []).length === 0 &&
    item.estimated_calories === 0 && item.confidence === "low";
}

export function inspect(
  menu: string,
  model: string,
  sent: ExtractedItem[],
  got: EnrichedItem[],
  ms: number,
  batchSize: number = ENRICH_BATCH_SIZE,
): IntegrityReport {
  return {
    menu,
    model,
    batchSize,
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
    "menu            model                      bat sent ret order drop allerg ingr  ms",
  ];
  for (const r of rows) {
    out.push(
      `${r.menu.padEnd(15)} ${r.model.padEnd(25)} ${String(r.batchSize).padStart(4)} ${
        String(r.sent).padStart(4)
      } ${String(r.returned).padStart(3)} ${(r.orderPreserved ? "ok" : "BROKEN").padStart(5)} ${
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

/** Item counts for every archived menu. Costs nothing — used to price a sweep. */
export function countArchived(): { menu: string; items: number }[] {
  return Object.keys(ARCHIVED_EXTRACTIONS).map((menu) => ({
    menu,
    items: loadArchivedMenu(menu).length,
  }));
}

if (import.meta.main) {
  // SWEEP MODE: every archived menu at each given batch size. This is the
  // "does lowering ENRICH_BATCH_SIZE break a real menu" gate - a batch size that
  // fixes macro stability by dropping items is not a fix. Batch 10 is included
  // as the control, because "3 is clean" means nothing without "10 is clean too"
  // on the same menus in the same run.
  //   deno run ... scripts/bench-pipeline.ts sweep 10 3
  //   deno run ... scripts/bench-pipeline.ts sweep --dry 10 3
  if (Deno.args[0] === "sweep") {
    const args = Deno.args.slice(1);
    const dry = args.includes("--dry");
    const sizes = args.filter((a) => a !== "--dry").map(Number);
    if (sizes.length === 0 || sizes.some((s) => !Number.isInteger(s) || s < 1)) {
      throw new Error("sweep needs at least one positive integer batch size");
    }
    const counts = countArchived();
    const totalItems = counts.reduce((n, c) => n + c.items, 0);
    console.log(`${counts.length} archived menus, ${totalItems} items:`);
    for (const c of counts) {
      console.log(
        `  ${c.menu.padEnd(14)} ${String(c.items).padStart(4)} items -> ${
          sizes.map((s) => `b${s}: ${Math.ceil(c.items / s)} calls`).join(", ")
        }`,
      );
    }
    const calls = sizes.reduce(
      (n, s) => n + counts.reduce((m, c) => m + Math.ceil(c.items / s), 0),
      0,
    );
    console.log(
      `\n${calls} model calls, ${totalItems * sizes.length} item enrichments.`,
    );
    if (dry) {
      console.log("--dry: nothing was sent.");
      Deno.exit(0);
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) throw new Error("OPENAI_API_KEY is required");
    const rows: IntegrityReport[] = [];
    // Repeating a size is how you buy extra draws: `sweep 3 3` runs batch 3
    // twice. Drops are stochastic - Polloteria lost 16 items at b10 and 1 at b3
    // on one draw each - so a single clean pass is not evidence that a size
    // drops nothing. The pass index keeps each draw's archive on disk.
    for (const [pass, size] of sizes.entries()) {
      for (const { menu } of counts) {
        const items = loadArchivedMenu(menu);
        const started = Date.now();
        const result = await callGptEnrich(items, apiKey, ENRICH_MODEL, size);
        const ms = Date.now() - started;
        // Archived BEFORE anything is inspected, passing runs included - lesson 26.
        Deno.writeTextFileSync(
          `${CACHE_DIR}/pipeline.b${size}.p${pass}.${menu}.raw.json`,
          result.raw_response,
        );
        const row = inspect(menu, ENRICH_MODEL, items, result.items, ms, size);
        rows.push(row);
        console.log(renderReport([row]).split("\n").slice(1).join("\n"));
      }
    }
    console.log(`\n${renderReport(rows)}`);
    const broken = rows.filter((r) =>
      !r.orderPreserved || r.backfilled.length > 0 || r.emptyMacros.length > 0
    );
    console.log(
      broken.length === 0
        ? `\nCLEAN: ${rows.length} menu-runs, no drops, no reordering, no zeroed macros.`
        : `\nPROBLEMS on ${broken.length} of ${rows.length} menu-runs: ${
          broken.map((r) => `${r.menu}@b${r.batchSize}`).join(", ")
        }`,
    );
    Deno.exit(0);
  }

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
