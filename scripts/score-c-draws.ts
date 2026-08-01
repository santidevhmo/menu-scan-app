// SCORE EVERY DRAW, NOT ONE — the replacement for single-draw offline scoring.
//
// Eval 116 measured the thing this file exists for: the structuring model
// returns a DIFFERENT BUT VALID item list on each call, so a score computed from
// one archived response is a sample, not a measurement. The C2 rules were all
// tuned against exactly one response per menu (a design set of size one per
// fixture) and the first ×3 live gate came in 7-9 dims below the offline number
// with five dims flipping between runs.
//
// So this harness reports THREE things a single-draw score cannot:
//   1. best / worst / mean across draws — the honest range, never one number
//   2. which dims FLIP across draws — brittleness, the actual defect class
//   3. item-count spread per menu — the silent-data-loss watch (guest-house
//      read 48, then 36, then 48 dishes live)
//
// Same artifact rule as every gate here: reads ONLY *.raw.json and rebuilds
// through the real chain (master-roadmap lesson 20).
import type { ExtractedMenuItem } from "../supabase/functions/analyze-menu/extract.ts";
import { scoreMenu } from "./eval-extraction.ts";
import { cleanForScore, itemsFromRaw } from "./score-c-dumps.ts";
import { ocrMarkdown, ocrSourcePaths } from "./probe-c-textstructure.ts";

const DEFAULT_MENUS = [
  "polloteria",
  "nikkori",
  "el-marcos",
  "bistro",
  "guest-house",
  "brasero",
  "casa-nostra",
  "mochomos",
  "brasero-two",
];
const DIMS = [
  "items",
  "options",
  "section_context",
  "categories",
  "grams",
] as const;

const menus = (Deno.env.get("MENUS") ?? DEFAULT_MENUS.join(","))
  .split(",").map((menu) => menu.trim()).filter(Boolean);
const tag = Deno.env.get("TAG") ?? "eval117";
const draws = Number(Deno.env.get("DRAWS") ?? "3");

type Row = { scores: number[]; counts: number[]; flips: string[] };
const rows = new Map<string, Row>();

for (const menu of menus) {
  const fixture = JSON.parse(
    await Deno.readTextFile(
      new URL(`./fixtures/${menu}.expected.json`, import.meta.url),
    ),
  );
  const markdown = (await Promise.all(
    ocrSourcePaths(menu).map(async (path) =>
      ocrMarkdown(JSON.parse(await Deno.readTextFile(path)))
    ),
  )).join("\n");

  const perDim = new Map<string, boolean[]>();
  const row: Row = { scores: [], counts: [], flips: [] };
  for (let draw = 1; draw <= draws; draw++) {
    const items: ExtractedMenuItem[] = await itemsFromRaw(
      menu,
      tag,
      undefined,
      draw,
    );
    const cleaned = cleanForScore(items, markdown).items;
    const report = scoreMenu(fixture, {
      image_quality: { usable: true, issues: [] },
      items: cleaned,
    });
    row.scores.push(DIMS.filter((dim) => report[dim].pass).length);
    row.counts.push(cleaned.length);
    for (const dim of DIMS) {
      perDim.set(dim, [...(perDim.get(dim) ?? []), report[dim].pass]);
    }
  }
  for (const [dim, results] of perDim) {
    if (new Set(results).size > 1) {
      row.flips.push(`${dim}[${results.map((r) => r ? "P" : "F").join("")}]`);
    }
  }
  rows.set(menu, row);
}

console.log(`menu          ${
  Array.from({ length: draws }, (_, i) => `d${i + 1}`).join("  ")
}   items/draw        flipping dims`);
let best = 0, worst = 0;
for (const [menu, row] of rows) {
  best += Math.max(...row.scores);
  worst += Math.min(...row.scores);
  const spread = Math.max(...row.counts) - Math.min(...row.counts);
  console.log(
    `${menu.padEnd(13)} ${row.scores.map((s) => `${s}/5`).join(" ")}   ` +
      `${row.counts.join(",").padEnd(14)}${spread > 0 ? `±${spread}  ` : "     "}` +
      `${row.flips.join(" ") || "-"}`,
  );
}
console.log(
  `\nWORST-CASE TOTAL ${worst}/${menus.length * 5}   ` +
    `BEST-CASE TOTAL ${best}/${menus.length * 5}`,
);
console.log(
  "Report the RANGE. A single-draw number is a sample of this range, not the " +
    "extractor's quality (master-roadmap lesson 25).",
);
const brittle = [...rows].filter(([, row]) => row.flips.length > 0);
console.log(
  `\nBRITTLE MENUS (a dim changes verdict across identical calls): ${
    brittle.length === 0 ? "none" : brittle.map(([menu]) => menu).join(", ")
  }`,
);
