import type { ExtractedMenuItem } from "../supabase/functions/analyze-menu/extract.ts";
import {
  dropDrinkSections,
  dropOtherCategoryItems,
  dropSelfNamedSectionTitles,
  normalizeSectionTitle,
  textStructureCleanup,
} from "../supabase/functions/analyze-menu/mistral-cleanup.ts";
import { mergeItemSources } from "../supabase/functions/analyze-menu/merge.ts";
import { postprocessItems } from "../supabase/functions/analyze-menu/postprocess.ts";
import { scoreMenu } from "./eval-extraction.ts";
import { MENU_DIR } from "./photo-input.ts";
import {
  ocrMarkdown,
  ocrSourcePaths,
  parseResponse,
} from "./probe-c-textstructure.ts";

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

export function cleanForScore(items: ExtractedMenuItem[], markdown?: string): {
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
  return { items: textStructureCleanup(items, markdown), rewrites, nulled };
}

/**
 * Rebuild a menu's items from the archived RAW model responses through the real
 * chain: postprocessItems per page, then mergeItemSources — the order
 * probe-c-textstructure.ts uses live, and the order production uses.
 *
 * The cached `.dump.json` files were postprocessed at probe time, so scoring
 * them makes this harness BLIND to any change in postprocess.ts (found in eval
 * 110: three postprocess fixes scored a flat 35/45 here while actually being
 * worth +2). Rebuilding is byte-identical at unchanged code and is the only way
 * postprocess is really gated.
 */
export async function itemsFromRaw(
  menu: string,
  tag: string,
): Promise<ExtractedMenuItem[]> {
  const pages = await Promise.all(
    ocrSourcePaths(menu).map(async (_, page) => {
      const path = page === 0
        ? `${MENU_DIR}/${menu}.${tag}-r1.raw.json`
        : `${MENU_DIR}/${menu}.${tag}-r1.p${page}.raw.json`;
      return parseResponse(JSON.parse(await Deno.readTextFile(path)))
        .items as ExtractedMenuItem[];
    }),
  );
  const processed = pages.map(postprocessItems);
  return processed.length > 1 ? mergeItemSources(processed) : processed[0];
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
    // FROM_DUMP=1 scores the cached post-postprocess dumps (the pre-eval-110
    // behaviour) — useful only to confirm an archived number, never to gate a
    // postprocess change.
    dump.items = Deno.env.get("FROM_DUMP") === "1"
      ? dump.items
      : await itemsFromRaw(menu, tag);
    const markdown = (await Promise.all(
      ocrSourcePaths(menu).map(async (path) =>
        ocrMarkdown(JSON.parse(await Deno.readTextFile(path)))
      ),
    )).join("\n");
    const cleaned = cleanForScore(dump.items as ExtractedMenuItem[], markdown);
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
