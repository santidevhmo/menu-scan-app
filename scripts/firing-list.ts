// FIRING LIST — the discipline every rule in this pipeline owes (master-roadmap
// lessons 11-13, 22: any rule that ADDS, DELETES or RELABELS anything must
// enumerate every place it fires across the whole archived corpus, and the
// REFUSALS are the real deliverable).
//
// Prints one line per item and one per option this build produces, for every
// archived draw. Run it on the CHANGED tree and again on the unchanged tree,
// then diff: the difference IS the firing list, computed from what the code
// actually produced rather than from bookkeeping the rule keeps about itself —
// the two can disagree, and have (lesson 12, one matcher).
//
//   deno run --allow-read --allow-env scripts/firing-list.ts > after.txt
import { cleanForScore, itemsFromRaw } from "./score-c-dumps.ts";
import {
  menuArchive,
  ocrMarkdown,
  ocrSourcePaths,
} from "./probe-c-textstructure.ts";

const MENUS = [
  "polloteria",
  "nikkori",
  "el-marcos",
  "bistro",
  "guest-house",
  "brasero",
  "casa-nostra",
  "mochomos",
  "brasero-two",
  "andaluz",
];
const CORPUS: { menu: string; tag: string; draws: number }[] = [
  ...MENUS.flatMap((menu) => [
    { menu, tag: menuArchive(menu).draws, draws: 3 },
    { menu, tag: menuArchive(menu).single, draws: 1 },
  ]),
  // The 10-draw guest-house hunt (eval 121) — the largest single-menu sample
  // in the corpus, and the only place a rare shape would show up at all.
  { menu: "guest-house", tag: "eval121pt", draws: 10 },
].filter((entry, index, all) =>
  // andaluz's single-draw and 3-draw tags are the same archive; don't count it twice.
  all.findIndex((other) =>
    other.menu === entry.menu && other.tag === entry.tag
  ) === index
);

let options = 0;
let draws = 0;
for (const { menu, tag, draws: count } of CORPUS) {
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
      const where = `${menu} ${tag}-r${draw}`;
      const name = item.name.replaceAll("\n", " ");
      console.log(
        `ITEM ${where} | ${name} | ${item.category} | ${
          item.section_title ?? "-"
        } | ${item.price ?? "-"} | ${item.grams ?? "-"}`,
      );
      for (const option of item.options) {
        options++;
        console.log(
          `OPT  ${where} | ${name} | ${option.name.replaceAll("\n", " ")} | ${
            option.price ?? "-"
          } | ${option.grams ?? "-"}`,
        );
      }
    }
  }
}
console.error(`${draws} draws, ${options} options`);
