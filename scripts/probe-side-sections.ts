// MEASUREMENT ONLY ($0): for every archived draw, how does the model's "side"
// label distribute across the section the PAGE prints the item under?
import { cleanForScore, itemsFromRaw } from "./score-c-dumps.ts";
import { ocrMarkdown, ocrSourcePaths } from "./probe-c-textstructure.ts";

const CORPUS: [string, string, number, string][] = [
  ...["polloteria", "nikkori", "el-marcos", "bistro", "guest-house", "brasero",
    "casa-nostra", "mochomos", "brasero-two"].flatMap((m) =>
      [[m, "eval117", 3, "b1"], [m, "eval103c-m41", 1, "b1"]] as [string, string, number, string][]
    ),
  ["andaluz", "eval128", 3, "pt"],
];
for (const [menu, tag, count, ocr] of CORPUS) {
  Deno.env.set("OCR_TAG", ocr);
  const markdown = (await Promise.all(
    ocrSourcePaths(menu).map(async (p) => ocrMarkdown(JSON.parse(await Deno.readTextFile(p)))),
  )).join("\n");
  for (let draw = 1; draw <= count; draw++) {
    const items = cleanForScore(await itemsFromRaw(menu, tag, undefined, draw), markdown).items;
    const groups = new Map<string, { total: number; sides: string[] }>();
    for (const it of items) {
      const key = it.section_title ?? "(no section)";
      const g = groups.get(key) ?? { total: 0, sides: [] };
      g.total++;
      if (it.category === "side") g.sides.push(it.name.replaceAll("\n", " "));
      groups.set(key, g);
    }
    for (const [section, g] of groups) {
      if (g.sides.length === 0) continue;
      console.log(
        `${menu} ${tag}-r${draw} | ${section} | ${g.sides.length}/${g.total} side (${
          Math.round(100 * g.sides.length / g.total)
        }%) | ${g.sides.join(", ")}`,
      );
    }
  }
}
