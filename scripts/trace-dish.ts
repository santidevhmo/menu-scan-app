// Trace ONE dish through Stage 2, capturing every intermediate the shipped path
// produces. Built for docs/pipeline-walkthrough.html, which shows the result.
//
// ⚠️ IT CALLS THE REAL EXPORTED FUNCTIONS AND COPIES NO PIPELINE LOGIC. That is
// lesson 23: the one time this repo's harness built its own request, every
// published macro came from a shape production never sends. Each step below is
// the same function, with the same arguments, in the same order that
// callGptEnrichFormSized -> callGptEnrichDualPass invokes them.
//
// The one thing it does NOT reproduce is dual's positional merge, and it does not
// need to: for an item printing no weight the merge always yields pass 2's answer
// unless that answer came back zeroed, and for an item printing a weight it always
// yields pass 1's. Both cases are asserted below rather than assumed.
//
// Cost: 3 calls per dish (pass 1, pass 2, label) over that dish's own batch of 10.
//
//   deno run --allow-read --allow-write --allow-net --allow-env \
//     --env-file=.env.local scripts/trace-dish.ts
import {
  callGptEnrich,
  chunk,
  ENRICH_BATCH_SIZE,
  ENRICH_MODEL,
  ENRICH_PROMPT_UNWEIGHTED,
  type EnrichedItem,
  type ExtractedItem,
  isFallbackEnriched,
  isUnweighted,
  resolveGrams,
} from "../supabase/functions/analyze-menu/enrich.ts";
import {
  applyFormMass,
  FORM_G,
  labelForms,
} from "../supabase/functions/analyze-menu/dish-form.ts";
// The repo's own archive reader. It re-runs parseItemGrams, which is what sets
// `grams` - and `grams` is the field the weighted/unweighted partition reads, so
// a hand-rolled parser here would silently change which pass a dish goes through.
import { itemsFromArchiveFile } from "./bench-pipeline.ts";

/** The archived Stage-1 extraction each dish really came off, byte for byte. */
const TARGETS: { menu: string; archive: string; dish: string }[] = [
  {
    menu: "bistro",
    archive: "bistro.eval117-r1.raw.json",
    dish: "JAMÓN CON CHAMPIÑONES",
  },
  {
    menu: "nikkori",
    archive: "nikkori.eval117-r1.raw.json",
    dish: "Salmón Roll",
  },
  {
    menu: "el-marcos",
    archive: "el-marcos.eval103c-m41-r1.raw.json",
    dish: "PASTEL AZTECA (300gr.)",
  },
];

function mass(item: EnrichedItem): number {
  return resolveGrams(item.ingredients ?? [], item.printed_total_g)
    .reduce((s, g) => s + g, 0);
}

// deno-lint-ignore no-explicit-any
function slim(item: EnrichedItem): any {
  return {
    printed_total_g: item.printed_total_g,
    name_implied_components: item.name_implied_components,
    ingredients: (item.ingredients ?? []).map((i) => ({
      name: i.name,
      category: i.category,
      within_printed_weight: i.within_printed_weight,
      g: Math.round(i.typical_serving_g * 10) / 10,
      per100: [i.protein_per_100g, i.carb_per_100g, i.fat_per_100g],
    })),
    plate_g: Math.round(mass(item) * 10) / 10,
    protein_g: item.protein_g,
    carb_g: item.carb_g,
    fat_g: item.fat_g,
    estimated_calories: item.estimated_calories,
    serving_pieces: item.serving_pieces,
    confidence: item.confidence,
    allergens: item.allergens,
  };
}

const apiKey = Deno.env.get("OPENAI_API_KEY");
if (!apiKey) throw new Error("OPENAI_API_KEY missing");

// deno-lint-ignore no-explicit-any
const traces: any[] = [];

for (const t of TARGETS) {
  const menu = itemsFromArchiveFile(t.archive);
  const idx = menu.findIndex((i) => i.name === t.dish);
  if (idx < 0) throw new Error(`${t.dish} not in ${t.archive}`);

  // ── STEP 0. What Stage 1 handed over, and the partition it decides. ────────
  const extracted = menu[idx];
  const weighted = !isUnweighted(extracted as ExtractedItem);

  // PASS 1 sends the WHOLE menu chunked by ENRICH_BATCH_SIZE. We send only the
  // batch this dish falls in, so its batch-mates are exactly production's.
  const p1Batches = chunk(menu, ENRICH_BATCH_SIZE);
  const p1Batch = p1Batches[Math.floor(idx / ENRICH_BATCH_SIZE)];

  console.error(`\n[${t.dish}] pass 1 — batch of ${p1Batch.length}`);
  const pass1 = (await callGptEnrich(
    p1Batch as ExtractedItem[],
    apiKey,
    ENRICH_MODEL,
  )).items;
  const p1 = pass1.find((i) => i.name === t.dish)!;

  // PASS 2 re-chunks the UNWEIGHTED-ONLY list, so a dish's batch-mates differ
  // from pass 1's. Reproduce that partition, then send this dish's batch.
  const unweighted = menu.filter((i) => isUnweighted(i as ExtractedItem));
  let p2: EnrichedItem | undefined;
  let p2BatchSize = 0;
  if (!weighted) {
    const uIdx = unweighted.findIndex((i) => i.name === t.dish);
    const p2Batch =
      chunk(unweighted, ENRICH_BATCH_SIZE)[Math.floor(uIdx / ENRICH_BATCH_SIZE)];
    p2BatchSize = p2Batch.length;
    console.error(`[${t.dish}] pass 2 — batch of ${p2Batch.length}`);
    const got = (await callGptEnrich(
      p2Batch as ExtractedItem[],
      apiKey,
      ENRICH_MODEL,
      ENRICH_BATCH_SIZE,
      ENRICH_PROMPT_UNWEIGHTED, // the exported prompt, not a copy
      "system", // the envelope dual sends pass 2 through
    )).items;
    const cand = got.find((i) => i.name === t.dish);
    // dual keeps pass 1 when pass 2 is missing or zeroed. Assert, never assume.
    p2 = !cand || isFallbackEnriched(cand) ? undefined : cand;
  }

  const beforeSizing = p2 ?? p1;

  // ── THE LABEL CALL. Runs on the EXTRACTED items, after the dual pass. ──────
  console.error(`[${t.dish}] label — batch of ${p1Batch.length}`);
  const labels = await labelForms(p1Batch as ExtractedItem[], apiKey);
  const label = labels.get(t.dish) ?? null;

  // ── THE ONLY PLACE OUR TABLE ENTERS. Real function, whole batch. ──────────
  const sized = applyFormMass([beforeSizing], labels)[0];

  const before = mass(beforeSizing);
  const target = label && label !== "other" ? FORM_G[label] ?? null : null;

  traces.push({
    dish: t.dish,
    menu: t.menu,
    stage1: {
      name: extracted.name,
      description: extracted.description,
      price: extracted.price,
      category: extracted.category,
      // Both live on the runtime item but not on ExtractedItem, which is the
      // narrow shape enrichment consumes. Same cast isUnweighted uses.
      section_title:
        (extracted as { section_title?: string | null }).section_title ?? null,
      grams_parsed_by_our_regex:
        (extracted as { grams?: number | null }).grams ?? null,
    },
    partition: weighted ? "prints a weight -> pass 1's answer stands"
      : "prints no weight -> pass 2 replaces pass 1",
    pass1: { batch_size: p1Batch.length, answer: slim(p1) },
    pass2: p2
      ? { batch_size: p2BatchSize, answer: slim(p2) }
      : { skipped: weighted ? "dish prints a weight" : "returned nothing usable" },
    label_call: { chose: label, table_row_g: target },
    sizing: {
      plate_before_g: Math.round(before * 10) / 10,
      target_g: target,
      k: target && before > 0 ? Math.round((target / before) * 1000) / 1000 : null,
      applied: sized !== beforeSizing,
      why_not: sized === beforeSizing
        ? (beforeSizing.printed_total_g ? "printed weight — the page wins"
          : !label ? "no label returned"
          : label === "other" ? "`other` — no row fits, no opinion"
          : !target ? "label has no row in FORM_G"
          : "ingredients resolve to no mass")
        : null,
    },
    final: slim(sized),
  });
}

Deno.writeTextFileSync(
  "scripts/fixtures/dish-traces.json",
  JSON.stringify(traces, null, 2) + "\n",
);
console.error("\nwrote scripts/fixtures/dish-traces.json");
