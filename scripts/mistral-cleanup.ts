// M1 — Mistral-specific deterministic cleanup layer (planner-designed, ruling 29,
// 2026-07-22). Turns Mistral's document_annotation output into the clean menu
// shape our scorer expects. Harness-only ($0); NO production edge code.
import type { ExtractedMenuItem } from "../supabase/functions/analyze-menu/extract.ts";
import { mergeItemSources } from "../supabase/functions/analyze-menu/merge.ts";
import { MENU_DIR } from "./photo-input.ts";
import {
  MENU_PHOTOS,
  rawPath,
  reshape,
  WIDE_MENUS,
} from "./probe-bakeoff-mistral-b1.ts";

const WEIGHT_PAREN = /\(\s*\d[\d.,]*\s*(gr|g|kg|oz|ml|lt|l)\b[^)]*\)/i;
// A section dies only when it is OVERWHELMINGLY drinks. Measured plateau
// 0.75-0.90 (eval 099): el-marcos "Jugos y Frutas" is 71% drink and holds real
// food; polloteria "Bebidas" is 93% drink and must die (the Malteadas case).
const DRINK_SECTION_FRAC = 0.8;

export function stripTrailingParen(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, "").trim();
}
function norm(s: string): string[] {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .split(/[^a-z0-9]+/).filter((t) => t.length > 0);
}
/** True when every option-name token (sans trailing weight paren) is in the item name. */
export function optionEchoesItem(optName: string, itemName: string): boolean {
  const o = norm(stripTrailingParen(optName));
  const i = new Set(norm(itemName));
  return o.length > 0 && i.size > 0 && o.every((t) => i.has(t));
}
/** Drop null-price options that only restate the item or carry a bare weight; fold that weight into item grams. */
export function dropSelfEchoWeightOptions(
  items: ExtractedMenuItem[],
): ExtractedMenuItem[] {
  return items.map((it) => {
    let folded = 0;
    const kept: typeof it.options = [];
    for (const opt of it.options ?? []) {
      const artifact = opt.price == null &&
        (optionEchoesItem(opt.name, it.name) || WEIGHT_PAREN.test(opt.name) ||
          opt.grams != null);
      if (artifact) {
        if (opt.grams != null) folded += opt.grams;
        continue;
      }
      kept.push(opt);
    }
    // Combo weight = SUM of folded component weights (total food); single-
    // component items get their one weight. Only fills when grams is unset.
    const grams = it.grams ?? (folded > 0 ? folded : null);
    return { ...it, grams, options: kept };
  });
}
export function dropOtherCategoryItems(
  items: ExtractedMenuItem[],
): ExtractedMenuItem[] {
  return items.filter((it) => it.category !== "other");
}
/** Drop drinks (F5-deferred) and overwhelmingly-drink sections, using the
 * model's own category labels — no hardcoded section names (menu-generic). */
export function dropDrinkSections(
  items: ExtractedMenuItem[],
): ExtractedMenuItem[] {
  const sections = new Map<string, { drinks: number; total: number }>();
  for (const it of items) {
    if (!it.section_title) continue;
    const counts = sections.get(it.section_title) ?? { drinks: 0, total: 0 };
    counts.total++;
    if (it.category === "drink") counts.drinks++;
    sections.set(it.section_title, counts);
  }
  const drinkSections = new Set(
    [...sections].filter(([, counts]) =>
      counts.drinks > 0 && counts.drinks / counts.total >= DRINK_SECTION_FRAC
    ).map(([section]) => section),
  );
  return items.filter((it) =>
    it.category !== "drink" &&
    (!it.section_title || !drinkSections.has(it.section_title))
  );
}
/** PolloKids -> Pollo Kids (split camel/Pascal runs); leaves normal titles intact. */
export function normalizeSectionTitle(title: string | null): string | null {
  if (!title) return title;
  return title.replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚÑ])/g, "$1 $2");
}

interface Block {
  top_left_x: number;
  top_left_y: number;
  bottom_right_x: number;
  bottom_right_y: number;
  content: string;
}
export interface Page {
  blocks: Block[];
  width: number;
  height: number;
}

const MATCH_FLOOR = 0.6; // token-set match strength required before we act
const FAR_DIST = 0.35; // normalized-coord Euclidean distance treated as "different card"
// An option is legitimate if its words are PRINTED NEXT TO the dish, even when
// the source block is a whole sentence (so it can never match tightly). Measured
// plateau 0.05-0.30 (eval 099); 0.35 loses the bistro fix.
const RESCUE_DIST = 0.15;

function tokenOverlap(a: string[], b: string[]): number {
  if (a.length === 0) return 0;
  const bset = new Set(b);
  return a.filter((t) => bset.has(t)).length / a.length;
}
/** High only when the two token sets are nearly identical (block IS mostly the name). */
function bidiMatch(a: string[], b: string[]): number {
  return Math.min(tokenOverlap(a, b), tokenOverlap(b, a));
}
function blockCenter(b: Block, w: number, h: number): [number, number] {
  return [
    (b.top_left_x + b.bottom_right_x) / 2 / w,
    (b.top_left_y + b.bottom_right_y) / 2 / h,
  ];
}
/** Best-matching block for a name (bidirectional token match) + its strength. */
function bestBlock(
  name: string,
  blocks: Block[],
): { block: Block | null; strength: number } {
  const nt = norm(name);
  let block: Block | null = null;
  let strength = 0;
  for (const b of blocks) {
    const m = bidiMatch(nt, norm(b.content ?? ""));
    if (m > strength) {
      strength = m;
      block = b;
    }
  }
  return { block, strength };
}
/** Drop options whose printed text co-locates FAR from the item's own card.
 * Fail-open: only drops when BOTH the item anchor and the option block match
 * tightly (>=MATCH_FLOOR) AND print > FAR_DIST apart. Absent page => no-op. */
export function dropMisattachedOptions(
  items: ExtractedMenuItem[],
  page?: Page,
): ExtractedMenuItem[] {
  if (!page || !page.blocks || page.blocks.length === 0) return items;
  const { blocks, width, height } = page;
  return items.map((it) => {
    if (!it.options || it.options.length === 0) return it;
    const anchor = bestBlock(it.name, blocks);
    if (!anchor.block || anchor.strength < MATCH_FLOOR) return it; // can't anchor -> keep all
    const ac = blockCenter(anchor.block, width, height);
    const kept = it.options.filter((opt) => {
      const src = bestBlock(opt.name, blocks);
      if (!src.block || src.strength < MATCH_FLOOR) return true; // weak -> keep
      const sc = blockCenter(src.block, width, height);
      const dist = Math.hypot(ac[0] - sc[0], ac[1] - sc[1]);
      if (dist <= FAR_DIST) return true;
      const optionTokens = norm(opt.name);
      return blocks.some((block) => {
        const bc = blockCenter(block, width, height);
        const nearby = Math.hypot(ac[0] - bc[0], ac[1] - bc[1]) <= RESCUE_DIST;
        const blockTokens = new Set(norm(block.content ?? ""));
        return nearby && optionTokens.every((token) => blockTokens.has(token));
      });
    });
    return { ...it, options: kept };
  });
}

export function mistralCleanup(
  items: ExtractedMenuItem[],
  page?: Page,
): ExtractedMenuItem[] {
  const a = dropDrinkSections(items);
  const b = dropOtherCategoryItems(a);
  const m = dropMisattachedOptions(b, page);
  const c = dropSelfEchoWeightOptions(m);
  // Grams come from the folded weight-options (summed for combos); Mistral puts
  // weights in options, not names, so parseItemGrams is NOT used — it would grab
  // the first weight in a combo's description and clobber the correct sum.
  return c.map((it) => ({
    ...it,
    section_title: normalizeSectionTitle(it.section_title),
  }));
}

/** Coerce Mistral's annotation items into ExtractedMenuItem (grams unset). */
export function toExtractedItems(raw: unknown[]): ExtractedMenuItem[] {
  return raw.map((r) => {
    const it = r as Record<string, unknown>;
    return {
      name: (it.name as string) ?? "",
      description: (it.description as string) ?? "",
      price: (it.price as number | null) ?? null,
      category: (it.category as ExtractedMenuItem["category"]) ?? "food",
      section_title: (it.section_title as string | null) ?? null,
      options: ((it.options as unknown[]) ?? []).map((o) => {
        const oo = o as Record<string, unknown>;
        return {
          name: (oo.name as string) ?? "",
          price: (oo.price as number | null) ?? null,
          grams: (oo.grams as number | null) ?? null,
        };
      }),
      grams: null,
    };
  });
}

if (import.meta.main) {
  const DIR = MENU_DIR;
  const TAG = Deno.env.get("TAG") ?? "b1";
  const runs = Number(Deno.env.get("RUNS") ?? "3");
  const menus = (Deno.env.get("MENUS") ?? WIDE_MENUS.join(",")).split(",")
    .map((m) => m.trim()).filter((m) => m.length > 0);
  for (const m of menus) {
    const photos = MENU_PHOTOS[m];
    if (!photos) throw new Error(`unknown menu: ${m}`);
    for (let r = 1; r <= runs; r++) {
      // Per PAGE: clean with that page's OWN blocks (blocks are per-photo, so
      // this is exactly how production must wire it), then merge across pages.
      const perPage: ExtractedMenuItem[][] = [];
      for (const page of photos.keys()) {
        const resp = JSON.parse(
          await Deno.readTextFile(rawPath(DIR, m, TAG, r, page)),
        );
        const p0 = resp.pages?.[0];
        perPage.push(mistralCleanup(
          toExtractedItems(reshape(resp).items),
          p0
            ? {
              blocks: p0.blocks ?? [],
              width: p0.dimensions.width,
              height: p0.dimensions.height,
            }
            : undefined,
        ));
      }
      const cleaned = perPage.length === 1
        ? perPage[0]
        : mergeItemSources(perPage);
      await Deno.writeTextFile(
        `${DIR}/${m}.mistral-${TAG}-r${r}.clean.dump.json`,
        JSON.stringify(
          { image_quality: { usable: true, issues: [] }, items: cleaned },
          null,
          2,
        ),
      );
    }
  }
  console.log("clean dumps written for", menus.join(", "), `x${runs}`);
}
