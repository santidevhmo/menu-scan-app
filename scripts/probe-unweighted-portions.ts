// DIAGNOSTIC (2026-08-11): what does a dish weigh when the menu prints nothing?
//
// Every benchmark fixture carries a printed weight, so resolveGrams' fitting step
// is measured and its FALLBACK - the branch where nothing is fitted and the
// model's own per-ingredient servings stand - is not. Nikkori's real-camera
// device scan is 48 items, none of which prints a weight, so it exercises only
// that branch.
//
// Reaches the model through callGptEnrich, the deployed path (lesson: a probe
// with its own request shape measures a pipeline nobody ships).
//
// Run: OPENAI_API_KEY=... deno run --allow-read --allow-write --allow-env --allow-net \
//        scripts/probe-unweighted-portions.ts <dump.json> <out.json>
import {
  callGptEnrich,
  type EnrichedItem,
  type ExtractedItem,
  portionTarget,
  resolveGrams,
} from "../supabase/functions/analyze-menu/enrich.ts";

/** Total plated grams the pipeline settled on, and the share it fitted. */
export function plateGrams(
  item: EnrichedItem,
): { total: number; inside: number } {
  const grams = resolveGrams(item.ingredients ?? [], portionTarget(item));
  const total = grams.reduce((s, g) => s + g, 0);
  const inside = grams.reduce(
    (s, g, i) => item.ingredients[i].within_printed_weight ? s + g : s,
    0,
  );
  return { total, inside };
}

function table(items: EnrichedItem[]): string {
  const rows = items.map((it) => {
    const { total, inside } = plateGrams(it);
    const kcal = it.estimated_calories;
    return `| ${it.name} | ${total.toFixed(0)} | ${inside.toFixed(0)} | ${
      it.serving_pieces ?? "—"
    } | ${
      it.printed_total_g ?? "—"
    } | ${it.protein_g} | ${it.carb_g} | ${it.fat_g} | ${kcal} | ${
      total > 0 ? (kcal / total * 100).toFixed(0) : "—"
    } | ${it.ingredients.length} | ${it.confidence} |`;
  });
  return [
    "| item | total g | fitted g | pieces | printed g | P | C | F | kcal | kcal/100g | #ing | conf |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|",
    ...rows,
  ].join("\n");
}

if (import.meta.main) {
  const [dumpPath, outPath] = Deno.args;
  if (!dumpPath || !outPath) {
    console.error("usage: probe-unweighted-portions.ts <dump.json> <out.json>");
    Deno.exit(1);
  }
  const dump = JSON.parse(await Deno.readTextFile(dumpPath));
  const items: ExtractedItem[] = (dump.items ?? dump).map((
    i: ExtractedItem,
  ) => ({
    name: i.name,
    description: i.description ?? "",
    price: i.price ?? null,
    category: i.category ?? "food",
  }));

  const started = Date.now();
  const { items: enriched } = await callGptEnrich(
    items,
    Deno.env.get("OPENAI_API_KEY")!,
  );
  await Deno.writeTextFile(outPath, JSON.stringify(enriched, null, 2));

  console.log(table(enriched));
  const totals = enriched.map((i) => plateGrams(i).total).sort((a, b) => a - b);
  const median = totals[Math.floor(totals.length / 2)];
  console.log(
    `\n${enriched.length} items in ${
      ((Date.now() - started) / 1000).toFixed(0)
    }s — ` +
      `plate grams min ${totals[0].toFixed(0)} / median ${
        median.toFixed(0)
      } / max ${totals.at(-1)!.toFixed(0)}`,
  );
}
