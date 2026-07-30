import type { ExtractedMenuItem } from "../supabase/functions/analyze-menu/extract.ts";
import {
  dropDrinkSections,
  dropOtherCategoryItems,
  dropSelfNamedSectionTitles,
  normalizeSectionTitle,
  textStructureCleanup,
} from "../supabase/functions/analyze-menu/mistral-cleanup.ts";
import { scoreMenu } from "./eval-extraction.ts";
import { MENU_DIR } from "./photo-input.ts";

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

export function cleanForScore(items: ExtractedMenuItem[]): {
  items: ExtractedMenuItem[];
  rewrites: string[];
  nulled: string[];
} {
  const normalized = items.map((it) => ({
    ...it,
    section_title: normalizeSectionTitle(it.section_title),
  }));
  const rewrites = items.flatMap((it, index) =>
    it.section_title !== normalized[index].section_title
      ? [`${it.section_title} → ${normalized[index].section_title}`]
      : []
  );
  const survivors = dropDrinkSections(dropOtherCategoryItems(normalized));
  const titled = dropSelfNamedSectionTitles(survivors);
  const nulled = titled.flatMap((it, index) =>
    survivors[index].section_title !== null && it.section_title === null
      ? [`${it.name} | ${survivors[index].section_title} → null`]
      : []
  );
  return { items: textStructureCleanup(items), rewrites, nulled };
}

if (import.meta.main) {
  const menus = (Deno.env.get("MENUS") ?? DEFAULT_MENUS.join(","))
    .split(",").map((menu) => menu.trim()).filter(Boolean);
  const tag = Deno.env.get("TAG") ?? "eval103c-m41";
  let total = 0;

  for (const menu of menus) {
    const fixture = JSON.parse(
      await Deno.readTextFile(
        new URL(`./fixtures/${menu}.expected.json`, import.meta.url),
      ),
    );
    const dump = JSON.parse(
      await Deno.readTextFile(`${MENU_DIR}/${menu}.${tag}-r1.dump.json`),
    );
    if (!Array.isArray(dump.items)) {
      throw new Error(`${menu}: dump has no items`);
    }
    const cleaned = cleanForScore(dump.items as ExtractedMenuItem[]);
    const report = scoreMenu(fixture, {
      image_quality: dump.image_quality ?? { usable: true, issues: [] },
      items: cleaned.items,
    });
    const passing = DIMS.filter((dim) => report[dim].pass);
    total += passing.length;
    for (const dim of DIMS) {
      const result = report[dim];
      console.log(
        `${result.pass ? "PASS" : "FAIL"} ${menu} ${dim}: ${result.detail}`,
      );
    }
    console.log(`${menu}: ${passing.length}/5`);
    for (const rewrite of cleaned.rewrites) {
      console.log(`C2-1 ${menu} | ${rewrite}`);
    }
    for (const nulled of cleaned.nulled) {
      console.log(`C2-2 ${menu} | ${nulled}`);
    }
  }
  console.log(`TOTAL ${total}/${menus.length * DIMS.length}`);
}
