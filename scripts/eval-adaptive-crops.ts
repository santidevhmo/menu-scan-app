import { mergeItemSources } from "../supabase/functions/analyze-menu/merge.ts";
import type { ExtractedItem } from "../src/types/scan.ts";

const [label, ...paths] = Deno.args;
if (!label || paths.length === 0) {
  throw new Error("Usage: eval-adaptive-crops.ts <label> <actual.json>...");
}

const oracle = JSON.parse(
  await Deno.readTextFile(
    new URL("./fixtures/nikkori-food-names.json", import.meta.url),
  ),
) as { rolls: string[]; desserts: string[] };
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim();
const sources = await Promise.all(
  paths.map(async (path) => {
    const value = JSON.parse(await Deno.readTextFile(path)) as {
      items: ExtractedItem[];
    };
    return value.items.filter((item) => item.category !== "drink");
  }),
);
const items = mergeItemSources(sources);
const expected = oracle.rolls;
const actualNames = items.map((item) => normalize(item.name));
const expectedNames = expected.map(normalize);
const missing = expected.filter(
  (_, index) => !actualNames.includes(expectedNames[index]),
);
const extras = items
  .filter((item) => !expectedNames.includes(normalize(item.name)))
  .map((item) => item.name);
const duplicates = actualNames.filter(
  (name, index) => actualNames.indexOf(name) !== index,
);

console.log(
  JSON.stringify(
    {
      label,
      expected: expected.length,
      actual: items.length,
      missing,
      extras,
      duplicates: [...new Set(duplicates)],
    },
    null,
    2,
  ),
);
if (missing.length > 0 || duplicates.length > 0) Deno.exitCode = 1;
