// M1 — Mistral-specific deterministic cleanup layer (planner-designed, ruling 29,
// 2026-07-22). Turns Mistral's document_annotation output into the clean menu
// shape our scorer expects. Harness-only ($0); NO production edge code.
import { parseItemGrams } from "../supabase/functions/analyze-menu/postprocess.ts";
import type { ExtractedMenuItem } from "../supabase/functions/analyze-menu/extract.ts";

const WEIGHT_PAREN = /\(\s*\d[\d.,]*\s*(gr|g|kg|oz|ml|lt|l)\b[^)]*\)/i;

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
    let grams = it.grams ?? null;
    const kept: typeof it.options = [];
    for (const opt of it.options ?? []) {
      const artifact = opt.price == null &&
        (optionEchoesItem(opt.name, it.name) || WEIGHT_PAREN.test(opt.name));
      if (artifact) {
        if (grams == null && opt.grams != null) grams = opt.grams;
        continue;
      }
      kept.push(opt);
    }
    return { ...it, grams, options: kept };
  });
}
export function dropOtherCategoryItems(
  items: ExtractedMenuItem[],
): ExtractedMenuItem[] {
  return items.filter((it) => it.category !== "other");
}
/** PolloKids -> Pollo Kids (split camel/Pascal runs); leaves normal titles intact. */
export function normalizeSectionTitle(title: string | null): string | null {
  if (!title) return title;
  return title.replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚÑ])/g, "$1 $2");
}
export function mistralCleanup(
  items: ExtractedMenuItem[],
): ExtractedMenuItem[] {
  const a = dropOtherCategoryItems(items);
  const b = dropSelfEchoWeightOptions(a);
  const c = b.map((it) => ({
    ...it,
    section_title: normalizeSectionTitle(it.section_title),
  }));
  return parseItemGrams(c); // fallback fill for any still-null grams from name text
}

const MENUS = ["polloteria", "bistro", "guest-house"];
if (import.meta.main) {
  const DIR = `${Deno.env.get("HOME")}/Downloads/MenusTesting`;
  for (const m of MENUS) {
    for (const r of [1, 2, 3]) {
      const raw = JSON.parse(
        await Deno.readTextFile(`${DIR}/${m}.mistral-b1-r${r}.dump.json`),
      );
      const items: ExtractedMenuItem[] = (raw.items ?? []).map((
        it: Record<string, unknown>,
      ) => ({
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
      }));
      const cleaned = mistralCleanup(items);
      await Deno.writeTextFile(
        `${DIR}/${m}.mistral-b1-r${r}.clean.dump.json`,
        JSON.stringify(
          { image_quality: { usable: true, issues: [] }, items: cleaned },
          null,
          2,
        ),
      );
    }
  }
  console.log("clean dumps written for", MENUS.join(", "), "x3");
}
