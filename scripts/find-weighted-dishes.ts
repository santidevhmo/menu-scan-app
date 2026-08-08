// Lists dishes carrying a PRINTED WEIGHT across every archived extraction dump.
// $0, no model calls - it only reads `scripts/fixtures/caches/*.raw.json`.
//
// Why: widening the macro benchmark needs candidate dishes, and a printed weight
// is what B4's mechanism keys off (`printed_total_g` + `within_printed_weight`).
// The three current fixtures all came from this corpus - CESAR is an andaluz
// dish - so this is where the next ones come from too.
//
// Adding one to the benchmark is NOT automatic: each needs a USDA-sourced oracle
// recipe with fdc_ids, and Santiago approves every recipe personally.
//
// Run: deno run --allow-read scripts/find-weighted-dishes.ts

const PRINTED_WEIGHT = /\b\d{2,4}\s*(gr?s?\.?|gramos)\b/i;

export interface WeightedDish {
  menu: string;
  name: string;
  description: string;
}

export function isPrintedWeight(text: string): boolean {
  return PRINTED_WEIGHT.test(text);
}

export async function findWeightedDishes(
  cacheDir = "scripts/fixtures/caches",
): Promise<WeightedDish[]> {
  const seen = new Set<string>();
  const found: WeightedDish[] = [];

  for await (const entry of Deno.readDir(cacheDir)) {
    // macro-bench archives are this phase's own runs, not extraction dumps.
    if (!entry.name.endsWith(".raw.json")) continue;
    if (entry.name.startsWith("macro-bench")) continue;

    const menu = entry.name.split(".")[0];
    let items: { name?: string; description?: string }[];
    try {
      const raw = JSON.parse(await Deno.readTextFile(`${cacheDir}/${entry.name}`));
      const content = raw?.choices?.[0]?.message?.content;
      if (typeof content !== "string") continue;
      items = JSON.parse(content).items ?? [];
    } catch {
      // Dumps span several pipeline eras and not all are chat completions.
      continue;
    }

    for (const item of items) {
      const name = item.name ?? "";
      const description = item.description ?? "";
      if (!isPrintedWeight(`${name} ${description}`)) continue;

      const key = `${menu}|${name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({ menu, name, description });
    }
  }

  return found.sort((a, b) =>
    a.menu === b.menu ? a.name.localeCompare(b.name) : a.menu.localeCompare(b.menu)
  );
}

if (import.meta.main) {
  const dishes = await findWeightedDishes();
  for (const d of dishes) {
    console.log(`${d.menu.padEnd(13)} ${d.name}`);
    if (d.description) console.log(`              ${d.description.replace(/\s+/g, " ").slice(0, 130)}`);
  }
  console.log(`\n${dishes.length} distinct printed-weight dishes`);
}
