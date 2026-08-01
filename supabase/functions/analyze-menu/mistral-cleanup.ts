import type { ExtractedMenuItem } from "./extract.ts";
import { parseItemGrams, PER_UNIT_NOTE } from "./postprocess.ts";

const WEIGHT_PAREN = /\(\s*\d[\d.,]*\s*(gr|g|kg|oz|ml|lt|l)\b[^)]*\)/i;
// A section dies only when it is OVERWHELMINGLY drinks. Measured plateau
// 0.75-0.90 (eval 099): el-marcos "Jugos y Frutas" is 71% drink and holds real
// food; polloteria "Bebidas" is 93% drink and must die (the Malteadas case).
const DRINK_SECTION_FRAC = 0.8;
export const SPACED_RUN_MIN = 3;
const SPACED_TITLE_RUN = new RegExp(
  `\\b(?:[\\p{L}\\p{N}]\\s+){${SPACED_RUN_MIN - 1},}[\\p{L}\\p{N}]\\b`,
  "gu",
);

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
  return title.replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚÑ])/g, "$1 $2").replace(
    SPACED_TITLE_RUN,
    (run) => run.replace(/\s+/g, ""),
  );
}

/** Null a dish's section when the title is that dish's own card name. */
export function dropSelfNamedSectionTitles(
  items: ExtractedMenuItem[],
): ExtractedMenuItem[] {
  const sectionCounts = new Map<string, number>();
  for (const it of items) {
    const section = norm(it.section_title ?? "").join(" ");
    if (section) {
      sectionCounts.set(section, (sectionCounts.get(section) ?? 0) + 1);
    }
  }
  return items.map((it) => {
    const section = norm(it.section_title ?? "");
    const name = norm(it.name);
    const sectionKey = section.join(" ");
    return section.length > 0 && sectionCounts.get(sectionKey) === 1 &&
        sectionKey === name.join(" ")
      ? { ...it, section_title: null }
      : it;
  });
}

function foldSmallestOptionGrams(
  items: ExtractedMenuItem[],
): ExtractedMenuItem[] {
  return items.map((it) => {
    if (it.grams != null) return it;
    const weights = it.options.flatMap((option) => {
      const [parsed] = parseItemGrams([{
        ...it,
        name: option.name,
        description: "",
        options: [],
        grams: option.grams,
      }]);
      return parsed.grams == null ? [] : [parsed.grams];
    });
    return weights.length > 0 ? { ...it, grams: Math.min(...weights) } : it;
  });
}

function foldPerUnitNoteSections(
  items: ExtractedMenuItem[],
): ExtractedMenuItem[] {
  const sections = new Map<string, ExtractedMenuItem[]>();
  for (const it of items) {
    if (!it.section_title) continue;
    const group = sections.get(it.section_title) ?? [];
    group.push(it);
    sections.set(it.section_title, group);
  }
  return items.map((it) =>
    it.section_title && sections.get(it.section_title)?.length === 1 &&
      PER_UNIT_NOTE.test(it.name)
      ? { ...it, name: it.section_title, section_title: null }
      : it
  );
}

const HEADING_PRICE =
  /\$\s*\d+(?:[.,]\d+)?|(?:^|\s)\d{2,4}(?:[.,]\d+)?\s*(?:mxn)?\s*$/i;

function headingText(line: string): string {
  return line.replace(/^#+\s*/, "");
}

function headingPrice(line: string, section: string): number | null {
  const text = headingText(line);
  const price = text.match(HEADING_PRICE);
  const remaining = norm(text.replace(price?.[0] ?? "", ""));
  const sectionTitle = norm(section);
  if (
    !price || remaining.length === 0 ||
    remaining.join(" ") !== sectionTitle.join(" ")
  ) return null;
  const number = price[0].match(/\d+(?:[.,]\d+)?/);
  return number ? Number(number[0].replace(",", ".")) : null;
}

function cardHeadingName(headings: string[], index: number): string {
  const own = headingText(headings[index]).replace(HEADING_PRICE, "").trim();
  const parent = headings.slice(0, index).reverse().find((heading) =>
    !HEADING_PRICE.test(headingText(heading))
  );
  if (!parent) return own;
  const parentText = headingText(parent);
  const parentTokens = norm(parentText);
  const ownTokens = new Set(norm(own));
  return parentTokens.length > 0 &&
      !parentTokens.every((token) => ownTokens.has(token))
    ? `${parentText} ${own}`
    : own;
}

function foldPricedHeadingCards(
  items: ExtractedMenuItem[],
  markdown?: string,
): ExtractedMenuItem[] {
  if (!markdown) return items;
  const headings = markdown.split("\n").filter((line) => line.startsWith("#"));
  const sections = new Map<string, ExtractedMenuItem[]>();
  for (const it of items) {
    if (!it.section_title) continue;
    const group = sections.get(it.section_title) ?? [];
    group.push(it);
    sections.set(it.section_title, group);
  }
  const cards = new Map<string, ExtractedMenuItem>();
  for (const [section, children] of sections) {
    const prices = headings.map((heading) => headingPrice(heading, section));
    const index = prices.findIndex((price) => price != null);
    if (index < 0) continue;
    const price = prices[index]!;
    const categories = new Map<ExtractedMenuItem["category"], number>();
    for (const child of children) {
      categories.set(child.category, (categories.get(child.category) ?? 0) + 1);
    }
    const category = [...categories].reduce((best, current) =>
      current[1] > best[1] ? current : best
    )[0];
    cards.set(section, {
      name: cardHeadingName(headings, index),
      description: "",
      price,
      category,
      section_title: null,
      options: children.map((child) => ({
        name: child.name,
        price: child.price,
        grams: child.grams,
      })),
      grams: null,
    });
  }
  const seen = new Set<string>();
  return items.flatMap((it) => {
    if (!it.section_title || !cards.has(it.section_title)) return [it];
    if (seen.has(it.section_title)) return [];
    seen.add(it.section_title);
    return [cards.get(it.section_title)!];
  });
}

// ─── MULTI-VERSION CARD FOLD (eval 111) ──────────────────────────────────────
// A card prints its dish name once and each version on its own short line:
//
//     WAFFLES
//       Con plátano, canela y miel balsámica   70
//       Con Frutos rojos                       78
//
// The model returns that as two dishes, either with the card name welded onto
// each version ("WAFFLES Con Frutos rojos") or with the card name promoted to a
// section. Both are one printed dish with two priced choices (ruling 1).
//
// THE HARD PART IS NOT FOLDING — IT IS REFUSING. Menus constantly list distinct
// dishes sharing a first word (Gnocchi alla sorrentina / Gnocchi toscano; PASTA
// AL PESTO / PASTA ALFREDO; TOSTADAS DE ATÚN / TOSTADAS DE ATÚN AL AJONJOLÍ).
// Measured across the 9 fixture menus: an unguarded prefix rule fires 51 times
// and would merge real dishes on 7 of them; the guards below cut that to 6, all
// genuine. The discriminator is LAYOUT, not vocabulary, so it carries no
// language assumption: a version is a line the menu prints on its own, while a
// distinct dish prints its FULL name on every line.
const PRICE_TAIL = /\$?\s*\d+(?:[.,]\d+)?\s*(?:mxn)?\s*$/i;

/** Comparison key shared by names, section titles and OCR lines (lesson 12: one
 *  matcher, used on both sides of every comparison). */
function textKey(value: string): string {
  const bare = headingText(value).replace(PRICE_TAIL, "").trim();
  return norm(normalizeSectionTitle(bare) ?? bare).join(" ");
}

/** True when `text` opens a line the menu prints WITHOUT a `#` — i.e. the menu
 *  gives it a line of its own, which is what makes it a version rather than
 *  part of a longer dish name. */
function opensPlainLine(lines: string[], text: string): boolean {
  const want = norm(text);
  if (want.length === 0) return false;
  return lines.some((line) => {
    if (line.startsWith("#")) return false;
    const tokens = norm(line.replace(PRICE_TAIL, ""));
    return tokens.length >= want.length &&
      tokens.slice(0, want.length).join(" ") === want.join(" ");
  });
}

function cardFrom(
  name: string,
  members: ExtractedMenuItem[],
  section: string | null,
  optionName: (member: ExtractedMenuItem) => string,
): ExtractedMenuItem {
  const [base, ...rest] = [...members].sort((a, b) =>
    (a.price ?? Number.MAX_SAFE_INTEGER) - (b.price ?? Number.MAX_SAFE_INTEGER)
  );
  return {
    name,
    // Keep the base version's printed prose — the scorer ignores description,
    // but it is what the diner reads, and dropping it silently loses real menu
    // text (CHILAQUILES' "Tradicionales. Con pollo, crema y queso gratinado…").
    description: base.description,
    price: base.price,
    category: base.category,
    section_title: section,
    options: [
      ...members.flatMap((member) => member.options),
      ...rest.map((member) => ({
        name: optionName(member),
        price: member.price,
        grams: member.grams,
      })),
    ],
    grams: base.grams,
  };
}

/** The card title was mistaken for a SECTION (el-marcos REVUELTOS / FRITOS).
 *  A real section is a `#` heading in the OCR; a card title is plain text. */
function foldUnpricedCardSections(
  items: ExtractedMenuItem[],
  markdown?: string,
): ExtractedMenuItem[] {
  if (!markdown) return items;
  const lines = markdown.split("\n").map((l) => l.trim()).filter(Boolean);
  const headings = new Set(
    lines.filter((line) => line.startsWith("#")).map(textKey),
  );
  const sections = new Map<string, ExtractedMenuItem[]>();
  for (const it of items) {
    if (!it.section_title) continue;
    sections.set(it.section_title, [
      ...(sections.get(it.section_title) ?? []),
      it,
    ]);
  }
  const cards = new Map<string, ExtractedMenuItem>();
  for (const [title, members] of sections) {
    if (members.length < 2 || headings.has(textKey(title))) continue;
    const at = lines.findIndex((line) =>
      !line.startsWith("#") && textKey(line) === textKey(title)
    );
    if (at < 0) continue;
    const parent = lines.slice(0, at).reverse()
      .find((line) => line.startsWith("#"));
    cards.set(
      title,
      cardFrom(
        title,
        members,
        parent ? headingText(parent).replace(PRICE_TAIL, "").trim() : null,
        (member) => member.name,
      ),
    );
  }
  const seen = new Set<string>();
  return items.flatMap((it) => {
    if (!it.section_title || !cards.has(it.section_title)) return [it];
    if (seen.has(it.section_title)) return [];
    seen.add(it.section_title);
    return [cards.get(it.section_title)!];
  });
}

/** The card title was WELDED onto every version's name (el-marcos WAFFLES,
 *  HOT CAKES, CHILAQUILES, PLATO SURTIDO). */
function foldWeldedPrefixCards(
  items: ExtractedMenuItem[],
  markdown?: string,
): ExtractedMenuItem[] {
  if (!markdown) return items;
  const lines = markdown.split("\n").map((l) => l.trim()).filter(Boolean);
  const printed = new Set(lines.map(textKey));
  const folds = new Map<string, ExtractedMenuItem>();
  const tried = new Set<string>();
  for (const candidate of items) {
    const words = candidate.name.split(/\s+/);
    for (let take = words.length; take >= 1; take--) {
      const prefix = words.slice(0, take).join(" ");
      const key = norm(prefix).join(" ");
      if (key.length === 0 || tried.has(key)) continue;
      const members = items.filter((it) => {
        const name = norm(it.name).join(" ");
        return name === key || name.startsWith(`${key} `);
      });
      if (members.length < 2) continue;
      tried.add(key);
      // The card title must be a line the menu actually prints...
      if (!printed.has(key)) break;
      // ...and every version must be printed on a line of its own. A distinct
      // dish prints its whole name, so its "suffix" never opens a line.
      const versions = members.filter((it) => norm(it.name).join(" ") !== key);
      const suffix = (it: ExtractedMenuItem) =>
        it.name.slice(prefix.length).trim();
      if (
        versions.length === 0 ||
        !versions.every((it) => opensPlainLine(lines, suffix(it)))
      ) break;
      folds.set(
        key,
        cardFrom(prefix, members, members[0].section_title, suffix),
      );
      break;
    }
  }
  if (folds.size === 0) return items;
  const seen = new Set<string>();
  return items.flatMap((it) => {
    const name = norm(it.name).join(" ");
    const key = [...folds.keys()].find((k) =>
      name === k || name.startsWith(`${k} `)
    );
    if (!key) return [it];
    if (seen.has(key)) return [];
    seen.add(key);
    return [folds.get(key)!];
  });
}

/** Deterministic cleanup for the (c) text-structuring path (ruling 30).
 *  Model-agnostic only — acts on the model's own labels/titles, never on
 *  Mistral-annotation artifacts. C3 renames this module. */
export function textStructureCleanup(
  items: ExtractedMenuItem[],
  markdown?: string,
): ExtractedMenuItem[] {
  const normalized = items.map((it) => ({
    ...it,
    section_title: normalizeSectionTitle(it.section_title),
  }));
  const filtered = dropDrinkSections(dropOtherCategoryItems(normalized));
  // Order is load-bearing and test-pinned: foldUnpricedCardSections collapses
  // REVUELTOS/FRITOS into single items FIRST, which is what stops
  // foldWeldedPrefixCards from seeing their duplicate child names as one card.
  return foldWeldedPrefixCards(
    foldUnpricedCardSections(
      foldPricedHeadingCards(
        foldPerUnitNoteSections(
          foldSmallestOptionGrams(dropSelfNamedSectionTitles(filtered)),
        ),
        markdown,
      ),
      markdown,
    ),
    markdown,
  );
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
