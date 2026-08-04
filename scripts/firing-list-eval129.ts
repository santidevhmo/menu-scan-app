// FIRING LIST for the two eval-129 option-recovery rules (master-roadmap
// lessons 11-13, 22: any rule that ADDS or DELETES anything must enumerate
// every place it fires across the whole archived corpus, and the REFUSALS are
// the real deliverable).
//
// Prints one line per option this build produces, for every archived draw.
// Run it on the CHANGED tree and again on the unchanged tree, then diff: the
// added lines are the complete firing list, with no rule-internal bookkeeping
// to disagree with what the code actually did (lesson 12 — one matcher).
//
//   deno run --allow-read --allow-env scripts/firing-list-eval129.ts > after.txt
import { cleanForScore, itemsFromRaw } from "./score-c-dumps.ts";
import { ocrMarkdown, ocrSourcePaths } from "./probe-c-textstructure.ts";

const CORPUS: { menu: string; tag: string; draws: number; ocr: string }[] = [
  ...[
    "polloteria",
    "nikkori",
    "el-marcos",
    "bistro",
    "guest-house",
    "brasero",
    "casa-nostra",
    "mochomos",
    "brasero-two",
  ].flatMap((menu) => [
    { menu, tag: "eval117", draws: 3, ocr: "b1" },
    { menu, tag: "eval103c-m41", draws: 1, ocr: "b1" },
  ]),
  { menu: "guest-house", tag: "eval121pt", draws: 10, ocr: "b1" },
  { menu: "andaluz", tag: "eval128", draws: 3, ocr: "pt" },
];

let options = 0;
let draws = 0;
for (const { menu, tag, draws: count, ocr } of CORPUS) {
  Deno.env.set("OCR_TAG", ocr);
  const markdown = (await Promise.all(
    ocrSourcePaths(menu).map(async (path) =>
      ocrMarkdown(JSON.parse(await Deno.readTextFile(path)))
    ),
  )).join("\n");
  for (let draw = 1; draw <= count; draw++) {
    const items = cleanForScore(
      await itemsFromRaw(menu, tag, undefined, draw),
      markdown,
    ).items;
    draws++;
    for (const item of items) {
      for (const option of item.options) {
        options++;
        console.log(
          `${menu} ${tag}-r${draw} | ${item.name.replaceAll("\n", " ")} | ${
            option.name.replaceAll("\n", " ")
          } | ${option.price ?? "-"} | ${option.grams ?? "-"}`,
        );
      }
    }
  }
}
console.error(`${draws} draws, ${options} options`);
