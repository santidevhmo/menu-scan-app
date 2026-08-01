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
 * A GATE MAY ONLY EVER READ THE MOST UPSTREAM CACHED ARTIFACT — the raw model
 * response. Everything downstream of it (`.dump.json`, `.clean.dump.json`,
 * `.actual.json`) is DERIVED: it was produced by the code as it stood when the
 * probe ran, so scoring it makes the gate blind to the very code it claims to
 * measure, and a real change reads as "no change".
 *
 * That is not hypothetical. This harness used to score `.dump.json`, which had
 * been postprocessed at probe time, and re-ran only `mistral-cleanup`. Eval
 * 110's three `postprocess.ts` fixes therefore scored a flat 35/45 while
 * actually being worth +2 dims. It went unnoticed because every C2 rule until
 * then happened to live in `mistral-cleanup.ts`, which IS re-run.
 *
 * So: rebuild from `.raw.json` through the real chain — `postprocessItems` per
 * page, then `mergeItemSources` — the order `probe-c-textstructure.ts` uses
 * live and production uses. Verified a strict no-op at unchanged code.
 *
 * `transform` exists ONLY so `score-c-dumps_test.ts` can inject a stub and
 * prove this function is still sensitive to it. Never pass it in production
 * code: a caller that overrides it is re-creating the eval-110 blindness.
 */
export async function itemsFromRaw(
  menu: string,
  tag: string,
  transform: (items: ExtractedMenuItem[]) => ExtractedMenuItem[] =
    postprocessItems,
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
  const processed = pages.map(transform);
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
    const items = await itemsFromRaw(menu, tag);
    const markdown = (await Promise.all(
      ocrSourcePaths(menu).map(async (path) =>
        ocrMarkdown(JSON.parse(await Deno.readTextFile(path)))
      ),
    )).join("\n");
    const cleaned = cleanForScore(items, markdown);
    const report = scoreMenu(fixture, {
      // The archived dumps only ever carried this constant (archivePayloads
      // hardcodes it), and image_quality is not in DIMS — so this is identical
      // to what the old dump-reading path scored.
      image_quality: { usable: true, issues: [] },
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
