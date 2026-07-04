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
  "750",
  "300",
  "85",
  "ml",
  "mxn",
]);

function isServingFormat(name: string): boolean {
  const normalized = name.toLocaleLowerCase().trim();
  return SERVING_FORMAT.has(normalized) ||
    normalized.split(/\s+/).every((word) => SERVING_FORMAT.has(word));
}

// Broader than isServingFormat: fires if ANY token is a serving-format word.
// Distinguishes a folded section ("Cerdo" → dish cuts, no format tokens) from a
// format-priced item ("Cabernet" → "Copa 85 mxn / Botella 450 mxn", has tokens).
// ponytail: token scan; a dish literally named "Orden Grande" would be a false
// block — acceptable ceiling, upgrade to price-pattern parsing if a menu hits it.
function hasServingFormatToken(name: string): boolean {
  return name.toLocaleLowerCase().split(/[^a-z0-9/]+/).filter(Boolean)
    .some((token) => SERVING_FORMAT.has(token));
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
  return filterServingFormatOptions(promoteSections(stripMenuNumbers(items)));
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
  console.log("postprocess self-check passed");
}
