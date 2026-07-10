import type { ExtractedMenuItem } from "./extract.ts";

const LEADING_NUMBER = /^\d{1,3}[.)]?\s+/;

// ponytail: denylist matches every observed false positive (iter-001..004);
// extend from data, or replace with a second model pass if menus defeat it.
const SERVING_FORMAT = new Set([
  "copa",
  "botella",
  "vaso",
  "jarra",
  "glass",
  "bottle",
  "chico",
  "chica",
  "mediano",
  "mediana",
  "grande",
  "small",
  "medium",
  "large",
  "media",
  "1/2",
  "litro",
  "liter",
  "ml",
  "mxn",
]);

// Pure numbers in an option name are prices/volumes (Copa 85, 750), never a
// dish choice — general rule replacing the old hardcoded 85/300/750 entries.
const NUMERIC_TOKEN = /^\d+(?:[.,]\d+)?$/;

function isFormatToken(token: string): boolean {
  return SERVING_FORMAT.has(token) || NUMERIC_TOKEN.test(token);
}

function isServingFormat(name: string): boolean {
  const normalized = name.toLocaleLowerCase().trim();
  return isFormatToken(normalized) ||
    normalized.split(/\s+/).every((word) => isFormatToken(word));
}

// Broader than isServingFormat: fires if ANY token is a serving-format word.
// Distinguishes a folded section ("Cerdo" → dish cuts, no format tokens) from a
// format-priced item ("Cabernet" → "Copa 85 mxn / Botella 450 mxn", has tokens).
// ponytail: token scan; a dish literally named "Orden Grande" would be a false
// block — acceptable ceiling, upgrade to price-pattern parsing if a menu hits it.
function hasServingFormatToken(name: string): boolean {
  return name.toLocaleLowerCase().split(/[^a-z0-9/.,]+/).filter(Boolean)
    .some((token) => isFormatToken(token));
}

function normalizeName(value: string): string {
  return value.toLocaleLowerCase().trim().replaceAll(/\s+/g, " ")
    .normalize("NFD").replaceAll(/[\u0300-\u036f]/g, "");
}

// Same-name, same-category cards in one extraction are printed variants of ONE
// dish (POS convention: base variant on the card, alternatives as options).
// Fold: first card = base; each later card contributes its options, and its
// non-empty distinct description becomes a priced option — but ONLY when its
// price differs from the base: printed variants carry their own price, while an
// OCR double-read of the same dish repeats the price with drifted text (Nico
// roll), and folding that would invent an option. Identical true duplicates
// fold silently. ponytail: same-price distinct-desc cards and label-less price
// variants are left unfolded — ambiguous; revisit if a real menu hits either.
export function foldVariantCards(
  items: ExtractedMenuItem[],
): ExtractedMenuItem[] {
  const baseByKey = new Map<string, ExtractedMenuItem>();
  const result: ExtractedMenuItem[] = [];
  for (const card of items) {
    const key = `${normalizeName(card.name)}#${card.category}`;
    const base = baseByKey.get(key);
    if (!base) {
      const copy = { ...card, options: [...card.options] };
      baseByKey.set(key, copy);
      result.push(copy);
      continue;
    }
    const identical = card.price === base.price &&
      normalizeName(card.description) === normalizeName(base.description) &&
      card.options.length === 0;
    const isPricedVariantLabel = card.description.trim() !== "" &&
      normalizeName(card.description) !== normalizeName(base.description) &&
      card.price !== base.price;
    if (!identical && !isPricedVariantLabel && card.options.length === 0) {
      result.push(card); // ambiguous double or label-less variant — leave as-is
      continue;
    }
    const known = new Set(base.options.map((o) => normalizeName(o.name)));
    for (const option of card.options) {
      if (!known.has(normalizeName(option.name))) {
        base.options.push(option);
        known.add(normalizeName(option.name));
      }
    }
    if (isPricedVariantLabel && !known.has(normalizeName(card.description))) {
      base.options.push({
        name: card.description,
        price: card.price,
        grams: null,
      });
    }
  }
  return result;
}

// A price===null item whose options are dishes (no serving-format tokens) is a
// section GPT-4o folded into one line. Un-fold it: each option becomes its own
// item under section_title = the folded name; drop the placeholder. Format-priced
// items (wines: null price, options are copa/botella/mxn) are left untouched.
export function promoteSections(
  items: ExtractedMenuItem[],
): ExtractedMenuItem[] {
  return items.flatMap((item) => {
    const isFoldedSection = item.price === null &&
      item.options.length > 0 &&
      !item.options.some((option) => hasServingFormatToken(option.name));
    if (!isFoldedSection) return [item];
    return item.options.map((option) => ({
      name: option.name,
      description: "",
      price: option.price,
      category: item.category,
      section_title: item.name,
      options: [],
    }));
  });
}

// ponytail: ratio+minimum heuristic; revisit only if a real menu defeats it.
export function stripMenuNumbers(
  items: ExtractedMenuItem[],
): ExtractedMenuItem[] {
  const numbered = items.filter((item) => LEADING_NUMBER.test(item.name));
  if (numbered.length < 3 || numbered.length < items.length / 2) return items;
  return items.map((item) => ({
    ...item,
    name: item.name.replace(LEADING_NUMBER, ""),
  }));
}

export function filterServingFormatOptions(
  items: ExtractedMenuItem[],
): ExtractedMenuItem[] {
  return items.map((item) => ({
    ...item,
    options: item.options.filter((option) => !isServingFormat(option.name)),
  }));
}

export function postprocessItems(
  items: ExtractedMenuItem[],
): ExtractedMenuItem[] {
  return filterServingFormatOptions(
    promoteSections(foldVariantCards(stripMenuNumbers(items))),
  );
}

if (import.meta.main) {
  const item = (o: Partial<ExtractedMenuItem>): ExtractedMenuItem => ({
    name: "",
    description: "",
    price: null,
    category: "food",
    section_title: null,
    options: [],
    ...o,
  });
  // Folded meat grid → promoted to items under section "Cerdo".
  const cerdo = promoteSections([item({
    name: "Cerdo",
    section_title: "ESPECIALIDADES",
    options: [
      { name: "Bandiola Adobada (150gr)", price: null, grams: null },
      { name: "Chistorra (150gr)", price: null, grams: null },
    ],
  })]);
  if (cerdo.length !== 2) throw new Error(`cerdo: expected 2, got ${cerdo.length}`);
  if (cerdo.some((i) => i.section_title !== "Cerdo")) throw new Error("cerdo: section_title");
  if (cerdo[0].name !== "Bandiola Adobada (150gr)") throw new Error("cerdo: name");
  // Wine (format-priced) → left as a single item, NOT promoted.
  const wine = promoteSections([item({
    name: "Cabernet Sauvignon",
    section_title: "Tintos",
    options: [{ name: "Copa 85 mxn / Botella 450 mxn", price: null, grams: null }],
  })]);
  if (wine.length !== 1 || wine[0].name !== "Cabernet Sauvignon") throw new Error("wine promoted");
  // Priced item with options → untouched.
  const priced = promoteSections([item({
    name: "Con jamón, chorizo o tocino",
    price: 90,
    options: [{ name: "jamón", price: null, grams: null }],
  })]);
  if (priced.length !== 1 || priced[0].price !== 90) throw new Error("priced promoted");
  // Numeric tokens are serving-format generally, not via a hardcoded list.
  const numeric = filterServingFormatOptions([item({
    name: "Cabernet",
    options: [
      { name: "Copa 85", price: null, grams: null },
      { name: "450", price: null, grams: null },
      { name: "2 Chicken Breasts", price: null, grams: null },
    ],
  })]);
  if (numeric[0].options.length !== 1) {
    throw new Error(`numeric: expected 1 surviving option, got ${numeric[0].options.length}`);
  }
  if (numeric[0].options[0].name !== "2 Chicken Breasts") throw new Error("numeric: wrong survivor");
  // Same-name variant cards fold into one item; descriptions become priced options.
  const folded = foldVariantCards([
    item({ name: "REVUELTOS", price: 78, description: "Dos huevos naturales" }),
    item({
      name: "Revueltos",
      price: 84,
      description: "Dos huevos a la mexicana",
      options: [{ name: "Con jamón, chorizo o tocino", price: 90, grams: null }],
    }),
  ]);
  if (folded.length !== 1) throw new Error(`fold: expected 1 card, got ${folded.length}`);
  if (folded[0].price !== 78 || folded[0].description !== "Dos huevos naturales") {
    throw new Error("fold: base card must stay first card");
  }
  const foldedNames = folded[0].options.map((o) => `${o.name}@${o.price}`).join("|");
  if (foldedNames !== "Con jamón, chorizo o tocino@90|Dos huevos a la mexicana@84") {
    throw new Error(`fold: options wrong: ${foldedNames}`);
  }
  // A price-shell variant (empty description, has options) contributes only its options.
  const shell = foldVariantCards([
    item({ name: "FRITOS", price: 78, description: "Dos huevos naturales" }),
    item({
      name: "FRITOS",
      price: 90,
      options: [{ name: "Con jamón, chorizo o tocino", price: 90, grams: null }],
    }),
  ]);
  if (shell.length !== 1 || shell[0].options.length !== 1) throw new Error("fold: shell");
  // Identical true duplicates fold silently, no option added.
  const dup = foldVariantCards([
    item({ name: "Kurimu Roll", price: 169, description: "Salmón" }),
    item({ name: "Kurimu Roll", price: 169, description: "Salmón" }),
  ]);
  if (dup.length !== 1 || dup[0].options.length !== 0) throw new Error("fold: dup");
  // Same price + drifted description = OCR double-read, NOT a variant: no
  // option is invented, both cards stay.
  const ocrDouble = foldVariantCards([
    item({ name: "Nico", price: 159, description: "Por dentro: Arroz frito" }),
    item({ name: "Nico", price: 159, description: "Por dentro: Arroz frito con camarón" }),
  ]);
  if (ocrDouble.length !== 2 || ocrDouble.some((i) => i.options.length > 0)) {
    throw new Error("fold: OCR double must not become an option");
  }
  // Different names / different categories never fold.
  const distinct = foldVariantCards([
    item({ name: "Té", price: 32, category: "drink" }),
    item({ name: "Té Verde", price: 35, category: "drink" }),
  ]);
  if (distinct.length !== 2) throw new Error("fold: distinct names folded");
  console.log("postprocess self-check passed");
}
