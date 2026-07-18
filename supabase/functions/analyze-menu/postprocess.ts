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
  const cardCounts = new Map<string, number>();
  for (const card of items) {
    const key = `${normalizeName(card.name)}#${card.category}`;
    cardCounts.set(key, (cardCounts.get(key) ?? 0) + 1);
  }
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
    // 3+ same-name cards with distinct descriptions are a printed variant
    // family even at the same price (Chilaquiles' three preparations @138) —
    // OCR double-reads come in pairs, so pairs (Nico) stay unfolded.
    const isVariantFamily = (cardCounts.get(key) ?? 0) >= 3 &&
      card.description.trim() !== "" &&
      normalizeName(card.description) !== normalizeName(base.description);
    if (
      !identical && !isPricedVariantLabel && !isVariantFamily &&
      card.options.length === 0
    ) {
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
    if (
      (isPricedVariantLabel || isVariantFamily) &&
      !known.has(normalizeName(card.description))
    ) {
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
      // parseItemGrams runs after promotion and parses the printed weight
      // from the promoted name ("Bandiola Adobada (150gr)").
      grams: option.grams,
    }));
  });
}

// A price-less, description-less, option-less item whose name is another
// item's section_title is a section-header echo (a heading transcribed as an
// item, e.g. a tile emitting "CERVEZAS" as a card), not a dish — drop it.
// Second shape (eval 051): a price-less header that SWALLOWED its children as
// options — name is a section_title AND most option names duplicate sibling
// item names ("Postres" carrying the six desserts that also exist as items).
// Wine-style format cards (null price, copa/botella options) never match:
// their option names are formats, not sibling dishes.
export function dropHeaderEchoes(
  items: ExtractedMenuItem[],
): ExtractedMenuItem[] {
  const sectionTitles = new Set(
    items.flatMap((item) =>
      item.section_title ? [normalizeName(item.section_title)] : []
    ),
  );
  const itemNames = new Set(items.map((item) => normalizeName(item.name)));
  return items.filter((item) => {
    if (item.price !== null || !sectionTitles.has(normalizeName(item.name))) {
      return true;
    }
    if (item.description.trim() === "" && item.options.length === 0) {
      return false; // classic header echo
    }
    if (item.options.length === 0) return true;
    const siblingMatches = item.options.filter((option) =>
      itemNames.has(normalizeName(option.name))
    ).length;
    return siblingMatches < Math.ceil(item.options.length / 2);
  });
}

const INLINE_DISJUNCTION = /\s(?:o|u|or)\s/i;
// Left scan excludes comma (commas separate list members: "Verdes, Rojas o
// Suizas"); right scan includes it (the list ends at the first punctuation).
const LEFT_BOUNDARY_CHARS = ".;:()";
const RIGHT_BOUNDARY = /[.,;:()]/;
const CHOICE_CONNECTOR =
  /^(?:a elegir:?\s+|choice of\s+|c\/\s*|(?:con|de|en|with)\s+)/i;
const MAX_CHOICE_WORDS = 3;

// GPT-4o reliably transcribes "con X o Y" choices into the description but
// ignores prompt instructions to structure them (iter 032) — so parse them
// deterministically. Returns null (no choices) unless every alternative is a
// short noun phrase; long alternatives mean a sentence-level "o", not a list.
// ponytail: disjunction tokens are es/en (o/u/or); extend per language from data.
function parseInlineChoices(description: string): string[] | null {
  const match = INLINE_DISJUNCTION.exec(description);
  if (!match) return null;
  const before = description.slice(0, match.index);
  const boundaryIndex = Math.max(
    ...[...LEFT_BOUNDARY_CHARS].map((ch) => before.lastIndexOf(ch)),
  );
  const leftText = before.slice(boundaryIndex + 1);
  const after = match.index + match[0].length;
  const rightStop = RIGHT_BOUNDARY.exec(description.slice(after));
  const rightText = description
    .slice(after, rightStop ? after + rightStop.index : undefined).trim();
  const parts = leftText.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0 || !rightText) return null;
  parts[0] = parts[0].replace(CHOICE_CONNECTOR, "").trim();
  const choices = [...parts, rightText].filter(Boolean);
  if (choices.length < 2) return null;
  if (choices.some((c) => c.split(/\s+/).length > MAX_CHOICE_WORDS)) {
    return null;
  }
  return choices;
}

export function extractInlineChoices(
  items: ExtractedMenuItem[],
): ExtractedMenuItem[] {
  return items.map((item) => {
    // A dish with a printed inline choice carries a price; a price-null card
    // whose description is a choice is a serving-note fragment (Churrasquería
    // "En Taco") — never invent options on it. ponytail: drops price-less
    // market-price dishes too; widen only if a gate menu prints one.
    if (item.price === null) return item;
    const choices = parseInlineChoices(item.description);
    if (!choices) return item;
    const known = new Set(item.options.map((o) => normalizeName(o.name)));
    const added = choices.filter((choice) => !known.has(normalizeName(choice)));
    if (added.length === 0) return item;
    return {
      ...item,
      options: [
        ...item.options,
        ...added.map((name) => ({ name, price: null, grams: null })),
      ],
    };
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

// A pseudo-item whose NAME starts with a currency amount ("$94 POR NIÑO") is a
// price note transcribed out of a prose block, not a dish — no real dish name
// begins with a price. Description-less and option-less only, so a genuine
// promo card with content survives. ponytail: $-prefix only; add currency
// symbols per market from data.
const PRICE_NOTE_NAME = /^\s*\$\s*\d/;
const PRICE_NOTE_SECTION = /\$\s*\d/;

export function dropPriceNoteItems(
  items: ExtractedMenuItem[],
): ExtractedMenuItem[] {
  return items.filter((item) =>
    !(PRICE_NOTE_NAME.test(item.name) &&
      item.description.trim() === "" &&
      item.options.length === 0)
  );
}

// A section heading is never priced. When the model emits a promo/prose line
// as section_title ("Hazlas sazonadas por $20"), keep the item but clear the
// bogus heading. Item-level "$94 POR NIÑO" notes are handled separately by
// dropPriceNoteItems.
export function nullPriceNoteSections(
  items: ExtractedMenuItem[],
): ExtractedMenuItem[] {
  return items.map((item) => ({
    ...item,
    section_title:
      item.section_title && PRICE_NOTE_SECTION.test(item.section_title)
        ? null
        : item.section_title,
  }));
}

// A choice MENTION with no printed alternatives ("Tortillas a elegir",
// "de su elección") is not an option — mirrors the P1 rule and the inline
// parser's guard. ponytail: es/en phrases; extend per language from data.
const UNENUMERATED_CHOICE =
  /^\s*(?:\p{L}+\s+)?(?:a elegir|de su elecci[oó]n|su elecci[oó]n|of your choice|to choose)\s*$/iu;

// Per-unit price notation ("$98 C/U" = cada uno / each) — a price note, not a
// choice. Single-letter c/X covers the model's digit-class misreads of the
// same printed token ("C/J" for "C/U", eval 054); a real "c/<ingredient>"
// choice always has a full word after the slash. The second pattern covers
// per-person qualifiers ("POR NIÑO", "per person") emitted as options from
// promo blocks (eval 054 — the same printed text that dropPriceNoteItems
// handles at item level).
const PER_UNIT_NOTE = /^\s*(?:c\/[a-z]\.?|(?:por|per)\s+\p{L}+\.?)\s*$/iu;

// A pure weight/volume token is a weight note, not a choice (grams live in the
// grams field). "650gr", "80 gr.", "300ml".
const WEIGHT_NOTE = /^\s*\d+(?:[.,]\d+)?\s*(?:gr?|kg|ml|l|oz)\.?\s*$/i;

// An option whose name is contained (whole words) in its OWN item's name is
// self-decomposition ("Omelette de Camarón y Marlin" → options [Camarón,
// Marlin], eval 052 attempt 4), never a printed choice: the fold convention
// keeps the base variant on the card, so a real option always names something
// the item name does not.
function echoesOwnItemName(optionName: string, itemName: string): boolean {
  const opt = normalizeName(optionName);
  const item = ` ${normalizeName(itemName)} `;
  return opt.length > 0 && item.includes(` ${opt} `);
}

export function filterServingFormatOptions(
  items: ExtractedMenuItem[],
): ExtractedMenuItem[] {
  return items.map((item) => ({
    ...item,
    options: item.options.filter((option) =>
      !isServingFormat(option.name) &&
      !UNENUMERATED_CHOICE.test(option.name) &&
      !PER_UNIT_NOTE.test(option.name) &&
      !WEIGHT_NOTE.test(option.name) &&
      // "$94 por niño" as an option is a price note, not a choice (sibling
      // of dropPriceNoteItems' item-level rule).
      !PRICE_NOTE_NAME.test(option.name) &&
      !echoesOwnItemName(option.name, item.name)
    ),
  }));
}

// A price-null option whose name is contained (whole words) in a SAME-SECTION
// sibling item's name is the model re-attaching a neighboring card's dish as a
// choice ("Omelette de Camarón" + option "Marlin" beside "Cazuela de Marlín",
// overnight gate loop — 10/18 fails): a real printed choice either carries its
// own price (casa-nostra "Gluten free" 330, kept) or names something no
// sibling card in that section prints. Cross-section matches (Chilaquiles
// "divorciados" vs HUEVOS "Huevos Divorciados") are untouched.
export function dropSiblingEchoOptions(
  items: ExtractedMenuItem[],
): ExtractedMenuItem[] {
  return items.map((item) => ({
    ...item,
    options: item.options.filter((option) =>
      option.price !== null ||
      !items.some((sibling) =>
        sibling !== item &&
        sibling.section_title === item.section_title &&
        echoesOwnItemName(option.name, sibling.name)
      )
    ),
  }));
}

// A price-null option repeated verbatim across 3+ distinct items is a printed
// banner/promo line re-attached as a choice on every card, not a real option.
// Tile-mode only: the evidence is cross-tile bleed on dense pages, so the
// normal per-page path keeps its behavior unchanged.
export function dropBannerEchoOptions(
  items: ExtractedMenuItem[],
): ExtractedMenuItem[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const names = new Set(
      item.options
        .filter((option) => option.price === null)
        .map((option) => normalizeName(option.name)),
    );
    for (const name of names) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  const echoed = new Set(
    [...counts].filter(([, count]) => count >= 3).map(([name]) => name),
  );
  if (echoed.size === 0) return items;
  return items.map((item) => ({
    ...item,
    options: item.options.filter((option) =>
      option.price !== null || !echoed.has(normalizeName(option.name))
    ),
  }));
}

// A tile can read a multi-flavor card as one item with options while its
// overlap twin reads the flavors as standalone items (eval 065: "Paletas
// Heladas Agua" opts=[Uva, Piña…] vs standalone "Uva" $20). The echo
// duplicates an option of another kept item, so drop it on exact normalized
// name match plus price agreement (the option's own price, or the parent's
// price when the option is unpriced). A bare item that itself has options
// is a real card, not an echo.
export function dropOptionEchoItems(
  items: ExtractedMenuItem[],
): ExtractedMenuItem[] {
  return items.filter((item) => {
    if (item.options.length > 0) return true;
    const name = normalizeName(item.name);
    const section = item.section_title && normalizeName(item.section_title);
    const echoName = section && name.startsWith(`${section} `)
      ? name.slice(section.length).trim()
      : name;
    return !items.some((parent) =>
      parent !== item &&
      parent.options.some((option) =>
        normalizeName(option.name) === echoName &&
        (option.price !== null
          ? option.price === item.price
          : parent.price === item.price)
      )
    );
  });
}

// A tile whose cut slices a heading emits only the visible fragment as its
// section ("Sandwiches" for "Sandwiches & Hamburguesas", eval 065). When a
// title's words are a strict subset of EXACTLY one other emitted title's
// words, remap to the longer read; ambiguity (two possible supersets —
// parent/child heading families) leaves it untouched.
export function remapTruncatedSectionTitles(
  items: ExtractedMenuItem[],
): ExtractedMenuItem[] {
  const titles = new Map(
    items.flatMap((item) =>
      item.section_title
        ? [[normalizeName(item.section_title), item.section_title] as const]
        : []
    ),
  );
  return items.map((item) => {
    if (!item.section_title) return item;
    const words = normalizeName(item.section_title).split(" ").filter(Boolean);
    const supersets = [...titles].filter(([key]) => {
      const otherWords = key.split(" ").filter(Boolean);
      return otherWords.length > words.length &&
        words.every((word) => otherWords.includes(word));
    });
    if (supersets.length !== 1) return item;
    return { ...item, section_title: supersets[0][1] };
  });
}

// Printed weight convention: a number followed by g/gr/grs/kg ("600g",
// "70 gr.", "1kg"). Volumes (ml/L/oz) and "mg" are NOT grams. Name wins over
// description; first match wins.
// ponytail: multi-weight items take the first printed weight — refine to
// per-component weights only if Stage-2 accuracy demands it.
const GRAMS_TOKEN = /(?<![\p{L}\d])(\d+(?:[.,]\d+)?)\s*(kg|grs?|g)\b/iu;

function parseWeightNumber(value: string): number {
  return Number(value.replace(/,(?=\d{3}\b)/g, "").replace(",", "."));
}

export function parseItemGrams(
  items: ExtractedMenuItem[],
): ExtractedMenuItem[] {
  return items.map((item) => {
    const match = GRAMS_TOKEN.exec(item.name) ??
      GRAMS_TOKEN.exec(item.description);
    // No printed token: keep grams already carried (promoteSections copies the
    // source option's grams; raw model items have none → null).
    if (!match) return { ...item, grams: item.grams ?? null };
    const value = parseWeightNumber(match[1]);
    return {
      ...item,
      grams: match[2].toLowerCase() === "kg" ? value * 1000 : value,
    };
  });
}

export function postprocessItems(
  items: ExtractedMenuItem[],
): ExtractedMenuItem[] {
  // parseItemGrams runs LAST so items promoted from options
  // ("Bandiola Adobada (150gr)") also get their printed weight parsed.
  return parseItemGrams(dropSiblingEchoOptions(filterServingFormatOptions(
    extractInlineChoices(
      dropHeaderEchoes(nullPriceNoteSections(promoteSections(foldVariantCards(
        dropPriceNoteItems(stripMenuNumbers(items)),
      )))),
    ),
  )));
}

if (import.meta.main) {
  const item = (o: Partial<ExtractedMenuItem>): ExtractedMenuItem => ({
    name: "",
    description: "",
    price: null,
    category: "food",
    section_title: null,
    options: [],
    grams: null,
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
  if (cerdo.length !== 2) {
    throw new Error(`cerdo: expected 2, got ${cerdo.length}`);
  }
  if (cerdo.some((i) => i.section_title !== "Cerdo")) {
    throw new Error("cerdo: section_title");
  }
  if (cerdo[0].name !== "Bandiola Adobada (150gr)") {
    throw new Error("cerdo: name");
  }
  // Wine (format-priced) → left as a single item, NOT promoted.
  const wine = promoteSections([item({
    name: "Cabernet Sauvignon",
    section_title: "Tintos",
    options: [{
      name: "Copa 85 mxn / Botella 450 mxn",
      price: null,
      grams: null,
    }],
  })]);
  if (wine.length !== 1 || wine[0].name !== "Cabernet Sauvignon") {
    throw new Error("wine promoted");
  }
  // Priced item with options → untouched.
  const priced = promoteSections([item({
    name: "Con jamón, chorizo o tocino",
    price: 90,
    options: [{ name: "jamón", price: null, grams: null }],
  })]);
  if (priced.length !== 1 || priced[0].price !== 90) {
    throw new Error("priced promoted");
  }
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
    throw new Error(
      `numeric: expected 1 surviving option, got ${numeric[0].options.length}`,
    );
  }
  if (numeric[0].options[0].name !== "2 Chicken Breasts") {
    throw new Error("numeric: wrong survivor");
  }
  // Same-name variant cards fold into one item; descriptions become priced options.
  const folded = foldVariantCards([
    item({ name: "REVUELTOS", price: 78, description: "Dos huevos naturales" }),
    item({
      name: "Revueltos",
      price: 84,
      description: "Dos huevos a la mexicana",
      options: [{
        name: "Con jamón, chorizo o tocino",
        price: 90,
        grams: null,
      }],
    }),
  ]);
  if (folded.length !== 1) {
    throw new Error(`fold: expected 1 card, got ${folded.length}`);
  }
  if (
    folded[0].price !== 78 || folded[0].description !== "Dos huevos naturales"
  ) {
    throw new Error("fold: base card must stay first card");
  }
  const foldedNames = folded[0].options.map((o) => `${o.name}@${o.price}`).join(
    "|",
  );
  if (
    foldedNames !== "Con jamón, chorizo o tocino@90|Dos huevos a la mexicana@84"
  ) {
    throw new Error(`fold: options wrong: ${foldedNames}`);
  }
  // A price-shell variant (empty description, has options) contributes only its options.
  const shell = foldVariantCards([
    item({ name: "FRITOS", price: 78, description: "Dos huevos naturales" }),
    item({
      name: "FRITOS",
      price: 90,
      options: [{
        name: "Con jamón, chorizo o tocino",
        price: 90,
        grams: null,
      }],
    }),
  ]);
  if (shell.length !== 1 || shell[0].options.length !== 1) {
    throw new Error("fold: shell");
  }
  // Identical true duplicates fold silently, no option added.
  const dup = foldVariantCards([
    item({ name: "Kurimu Roll", price: 169, description: "Salmón" }),
    item({ name: "Kurimu Roll", price: 169, description: "Salmón" }),
  ]);
  if (dup.length !== 1 || dup[0].options.length !== 0) {
    throw new Error("fold: dup");
  }
  // Same price + drifted description = OCR double-read, NOT a variant: no
  // option is invented, both cards stay.
  const ocrDouble = foldVariantCards([
    item({ name: "Nico", price: 159, description: "Por dentro: Arroz frito" }),
    item({
      name: "Nico",
      price: 159,
      description: "Por dentro: Arroz frito con camarón",
    }),
  ]);
  if (ocrDouble.length !== 2 || ocrDouble.some((i) => i.options.length > 0)) {
    throw new Error("fold: OCR double must not become an option");
  }
  // 3+ same-name cards with distinct descriptions are a printed variant
  // family even at the same price (Chilaquiles' three preparations @138) —
  // OCR double-reads come in pairs, so the pair case (Nico) stays unfolded.
  const triple = foldVariantCards([
    item({
      name: "CHILAQUILES (70gr.)",
      price: 138,
      description: "Tradicionales. Con pollo.",
    }),
    item({
      name: "CHILAQUILES (70gr.)",
      price: 138,
      description: "Regionales. Con pollo, crema.",
    }),
    item({
      name: "CHILAQUILES (70gr.)",
      price: 138,
      description: "Divorciados Mitad rojos.",
    }),
  ]);
  if (triple.length !== 1) {
    throw new Error(`fold triple: expected 1 card, got ${triple.length}`);
  }
  const tripleNames = triple[0].options.map((o) => o.name).join("|");
  if (
    tripleNames !== "Regionales. Con pollo, crema.|Divorciados Mitad rojos."
  ) {
    throw new Error(`fold triple: options wrong: ${tripleNames}`);
  }
  // A section-header echo (price-less, desc-less, option-less item whose name
  // is another item's section_title) is dropped; real dishes stay.
  const echoes = dropHeaderEchoes([
    item({
      name: "CERVEZAS",
      price: null,
      category: "other",
      section_title: "BEBIDAS CON ALCOHOL",
    }),
    item({
      name: "Tecate Roja",
      price: 45,
      category: "drink",
      section_title: "CERVEZAS",
    }),
    item({ name: "En Taco", price: null, section_title: "Churrasquería" }),
  ]);
  if (echoes.map((i) => i.name).join("|") !== "Tecate Roja|En Taco") {
    throw new Error(`header echo: got ${echoes.map((i) => i.name).join("|")}`);
  }
  // A header that SWALLOWED its children as options (price-less item whose
  // name is a section_title and whose option names mostly duplicate sibling
  // item names) is dropped — nikkori "Postres" carrying the 6 desserts that
  // also exist as items (eval 051 r2; promoteSections is blocked there by
  // "Copa de nieve" tripping the wine serving-format guard). A null-price
  // wine card with copa/botella options has no sibling-name options → kept.
  const swallowed = dropHeaderEchoes([
    item({
      name: "Postres",
      price: null,
      category: "dessert",
      section_title: "POSTRES",
      options: [
        { name: "Red velvet", price: 105, grams: null },
        { name: "Copa de nieve", price: 49, grams: null },
      ],
    }),
    item({
      name: "Red velvet",
      price: 105,
      category: "dessert",
      section_title: "Postres",
    }),
    item({
      name: "Copa de nieve",
      price: 49,
      category: "dessert",
      section_title: "Postres",
    }),
    item({
      name: "Vino Blanco",
      price: null,
      category: "drink",
      section_title: "Vinos",
      options: [
        { name: "Copa", price: 85, grams: null },
        { name: "Botella", price: 450, grams: null },
      ],
    }),
    item({
      name: "Otro tinto",
      price: 99,
      category: "drink",
      section_title: "Vinos",
    }),
  ]);
  if (
    swallowed.map((i) => i.name).join("|") !==
      "Red velvet|Copa de nieve|Vino Blanco|Otro tinto"
  ) {
    throw new Error(
      `swallowed header: got ${swallowed.map((i) => i.name).join("|")}`,
    );
  }
  // Inline printed choices in descriptions become options.
  const inlineCases: [string, string[]][] = [
    ["Con huevo o verdura (Machaca 30gr.)", ["huevo", "verdura"]],
    ["C/huevo o verdura", ["huevo", "verdura"]],
    [
      "Verdes, Rojas o Suizas (verdes o rojas) 3 enchiladas rellenas de pollo.",
      ["Verdes", "Rojas", "Suizas"],
    ],
    ["Blanco o Integral (3 rebanadas)", ["Blanco", "Integral"]],
    ["Con queso cottage o yogurt (50gr.)", ["queso cottage", "yogurt"]],
    ["(Manzana o Plátano)", ["Manzana", "Plátano"]],
  ];
  for (const [desc, expected] of inlineCases) {
    const parsed = extractInlineChoices([
      item({ name: "X", price: 10, description: desc }),
    ]);
    const got = parsed[0].options.map((o) => o.name).join("|");
    if (got !== expected.join("|")) {
      throw new Error(
        `inline "${desc}": expected ${expected.join("|")}, got ${got}`,
      );
    }
  }
  // A price-less card is a serving-note fragment (Churrasquería "En Taco":
  // "Tortilla de maíz o harina recién hecha"), not a dish — parser skips it.
  const priceless = extractInlineChoices([item({
    name: "En Taco",
    price: null,
    description: "Tortilla de maíz o harina recién hecha.",
  })]);
  if (priceless[0].options.length !== 0) {
    throw new Error("inline: price-null item must not gain parsed options");
  }
  // Per-person qualifiers as options are price notes, not choices.
  const perPerson = filterServingFormatOptions([
    item({
      name: "Pa' los Bukis",
      price: 94,
      options: [{ name: "POR NIÑO", price: null, grams: null }],
    }),
  ]);
  if (perPerson[0].options.length !== 0) {
    throw new Error("per-person qualifier option must be dropped");
  }
  // Per-unit note misreads (C/J for C/U) are dropped like c/u itself.
  const perUnitMisread = filterServingFormatOptions([
    item({
      name: "Omelette de Camarón y Marlin",
      price: 98,
      options: [{ name: "C/J", price: null, grams: null }],
    }),
  ]);
  if (perUnitMisread[0].options.length !== 0) {
    throw new Error("per-unit note: C/J option must be dropped");
  }
  // Self-echo + price-note options are dropped; real options survive.
  const hygiene = filterServingFormatOptions([
    item({
      name: "Omelette de Camarón y Marlin",
      price: 98,
      options: [
        { name: "Camarón", price: null, grams: null },
        { name: "Marlin", price: null, grams: null },
      ],
    }),
    item({
      name: "Pa' los Bukis",
      price: 94,
      options: [{ name: "$94 por niño", price: null, grams: null }],
    }),
    item({
      name: "Revueltos",
      price: 78,
      options: [{
        name: "Con jamón, chorizo o tocino",
        price: 90,
        grams: null,
      }],
    }),
  ]);
  if (
    hygiene[0].options.length !== 0 || hygiene[1].options.length !== 0 ||
    hygiene[2].options.length !== 1
  ) {
    throw new Error(
      `option hygiene: got ${hygiene.map((i) => i.options.length).join(",")}`,
    );
  }
  // Long alternatives = sentence-level "o", NOT a choice list → no options.
  const prose = extractInlineChoices([item({
    name: "Pa' los Bukis",
    price: 94,
    description: "Hot cakes o huevo revuelto con su elección de jamón o tocino",
  })]);
  if (prose[0].options.length !== 0) {
    throw new Error(
      `prose guard: got ${prose[0].options.map((o) => o.name).join("|")}`,
    );
  }
  // Ingredient lists joined only by "y" are untouched.
  const yList = extractInlineChoices([item({
    name: "Roll",
    price: 159,
    description: "Por dentro: salmon, queso crema y aguacate.",
  })]);
  if (yList[0].options.length !== 0) {
    throw new Error("y-list must not create options");
  }
  // Existing options are kept; parsed duplicates are not re-added.
  const existing = extractInlineChoices([item({
    name: "Pasta",
    price: 165,
    description: "A elegir: camarón o pollo",
    options: [{ name: "camarón", price: null, grams: null }],
  })]);
  if (existing[0].options.length !== 2) {
    throw new Error(
      `dedup: got ${existing[0].options.map((o) => o.name).join("|")}`,
    );
  }
  // Unenumerated choice mentions create nothing.
  const unenumerated = extractInlineChoices([item({
    name: "Feijoada",
    price: 130,
    description: "Clásico caldo brasileño. (Tortillas a elegir)",
  })]);
  if (unenumerated[0].options.length !== 0) {
    throw new Error("unenumerated must not create options");
  }
  // A model-emitted choice MENTION without alternatives is not an option.
  const unenumeratedOpt = filterServingFormatOptions([item({
    name: "Feijoada",
    price: 130,
    options: [
      { name: "Tortillas a elegir", price: null, grams: null },
      { name: "de su elección", price: null, grams: null },
      { name: "picaña", price: 165, grams: null },
    ],
  })]);
  if (unenumeratedOpt[0].options.map((o) => o.name).join("|") !== "picaña") {
    throw new Error(
      `unenumerated filter: got ${
        unenumeratedOpt[0].options.map((o) => o.name).join("|")
      }`,
    );
  }
  // Per-unit price notation ("C/U" = cada uno) is not a choice.
  const perUnit = filterServingFormatOptions([item({
    name: "Omelette",
    price: 98,
    options: [
      { name: "C/U", price: null, grams: null },
      { name: "c/u.", price: null, grams: null },
      { name: "verdura", price: null, grams: null },
    ],
  })]);
  if (perUnit[0].options.map((o) => o.name).join("|") !== "verdura") {
    throw new Error(
      `per-unit filter: got ${perUnit[0].options.map((o) => o.name).join("|")}`,
    );
  }
  // Pure weight/volume tokens are weight notes, not choices.
  const weightOpt = filterServingFormatOptions([item({
    name: "Sirloin",
    price: 135,
    options: [
      { name: "650gr", price: null, grams: 650 },
      { name: "80 gr.", price: null, grams: 80 },
      { name: "300ml", price: null, grams: null },
      { name: "pollo", price: 150, grams: null },
    ],
  })]);
  if (weightOpt[0].options.map((o) => o.name).join("|") !== "pollo") {
    throw new Error(
      `weight filter: got ${weightOpt[0].options.map((o) => o.name).join("|")}`,
    );
  }
  // A price-null option echoing a SAME-SECTION sibling's name is a re-attached
  // neighboring dish, not a choice; priced options and cross-section matches
  // survive.
  const siblingEcho = dropSiblingEchoOptions([
    item({
      name: "Omelette de Camarón",
      price: 98,
      section_title: "DE LA PLAYA",
      options: [{ name: "Marlín", price: null, grams: null }],
    }),
    item({
      name: "Cazuela de Marlin",
      price: 98,
      section_title: "DE LA PLAYA",
    }),
    item({
      name: "Fettuccine CasaNostra",
      price: 300,
      section_title: "Pasta",
      options: [{ name: "Gluten free", price: 330, grams: null }],
    }),
    item({
      name: "Spaghetti Gluten free",
      price: 330,
      section_title: "Pasta",
    }),
    item({
      name: "Chilaquiles",
      price: 90,
      section_title: "MEXICANOS",
      options: [{ name: "divorciados", price: null, grams: null }],
    }),
    item({
      name: "Huevos Divorciados",
      price: 85,
      section_title: "HUEVOS",
    }),
    item({
      name: "Taco Loiro",
      price: 120,
      section_title: "ESPECIALIDADES",
      options: [{ name: "arrachera", price: null, grams: null }],
    }),
  ]);
  const siblingGot = siblingEcho.map((i) => i.options.length).join(",");
  if (siblingGot !== "0,0,1,0,1,0,1") {
    throw new Error(`sibling echo: got ${siblingGot}`);
  }
  // A price-null banner note repeated across 3+ distinct items is not a real
  // option in tile mode — remove it from every item.
  const banner = dropBannerEchoOptions(
    Array.from({ length: 7 }, (_, i) =>
      item({
        name: `Tender ${i + 1}`,
        price: 150 + i,
        options: [
          {
            name: "Cambia tu Tender por Pollo a la Plancha",
            price: null,
            grams: null,
          },
        ],
      })),
  );
  if (banner.some((i) => i.options.length !== 0)) {
    throw new Error(
      `banner echo: expected all options removed, got ${
        banner.map((i) => i.options.length).join(",")
      }`,
    );
  }
  // Priced repeated options are real printed values — untouched.
  const pricedBanner = dropBannerEchoOptions([
    item({
      name: "Revueltos",
      price: 78,
      options: [{ name: "jamón", price: 90, grams: null }],
    }),
    item({
      name: "Fritos",
      price: 78,
      options: [{ name: "jamón", price: 90, grams: null }],
    }),
  ]);
  if (pricedBanner.some((i) => i.options.length !== 1)) {
    throw new Error("banner echo: priced options must stay");
  }
  // Two repeated price-null options stay (below the 3-item threshold).
  const belowThreshold = dropBannerEchoOptions([
    item({
      name: "Burger",
      price: 10,
      options: [{ name: "Sin papas", price: null, grams: null }],
    }),
    item({
      name: "Sandwich",
      price: 12,
      options: [{ name: "Sin papas", price: null, grams: null }],
    }),
  ]);
  if (belowThreshold.some((i) => i.options.length !== 1)) {
    throw new Error(
      "banner echo: below-threshold null-price options must stay",
    );
  }
  // Different names / different categories never fold.
  const distinct = foldVariantCards([
    item({ name: "Té", price: 32, category: "drink" }),
    item({ name: "Té Verde", price: 35, category: "drink" }),
  ]);
  if (distinct.length !== 2) throw new Error("fold: distinct names folded");
  // A pseudo-item whose NAME is a currency amount ("$94 POR NIÑO") is a price
  // note from a prose block, never a dish; real dishes with digits ("3 Tacos")
  // and every other item survive.
  const priceNotes = dropPriceNoteItems([
    item({ name: "$94 POR NIÑO", price: 94, section_title: "PA' LOS BUKIS" }),
    item({ name: "3 Quesadillas", price: 80 }),
    item({ name: "Tacos", price: 45, description: "Con todo" }),
  ]);
  if (priceNotes.map((i) => i.name).join("|") !== "3 Quesadillas|Tacos") {
    throw new Error(
      `price note: got ${priceNotes.map((i) => i.name).join("|")}`,
    );
  }
  // A priced promo/prose line is not a real section heading.
  const priceNoteSection = nullPriceNoteSections([
    item({
      name: "Tender",
      price: 165,
      section_title: "Hazlas sazonadas por $20",
    }),
    item({ name: "Burger", price: 180, section_title: "Hamburguesas" }),
    item({ name: "$94 POR NIÑO", price: 94, section_title: "Pa' los Bukis" }),
  ]);
  if (priceNoteSection[0].section_title !== null) {
    throw new Error("price note section: priced promo heading must be nulled");
  }
  if (priceNoteSection[1].section_title !== "Hamburguesas") {
    throw new Error("price note section: normal section must stay");
  }
  if (priceNoteSection[2].name !== "$94 POR NIÑO") {
    throw new Error("price note section: item names must stay untouched");
  }
  // A price-note-named card that carries real content (desc/options) is kept.
  const priceNoteKeep = dropPriceNoteItems([
    item({ name: "$5 Wings", price: 5, description: "Every Tuesday special" }),
  ]);
  if (priceNoteKeep.length !== 1) {
    throw new Error("price note: content card dropped");
  }
  // Printed-weight parser: number + g/gr/grs/kg is grams; ml/L/oz/mg are not.
  const grams = parseItemGrams([
    item({ name: "CHILAQUILES (70gr.)" }),
    item({ name: "Bandiola Adobada (150gr)" }),
    item({ name: "Rib Eye", description: "Corte de 280 g a la parrilla" }),
    item({ name: "Té Matcha (350mL)" }),
    item({
      name: "Ensalada",
      description: "2 slices of lettuce, 100 tomatoes",
    }),
    item({ name: "Paella (1kg)" }),
    item({ name: "Suplemento", description: "100 mg de cafeína" }),
  ]);
  const gramsGot = grams.map((i) => String(i.grams)).join(",");
  if (gramsGot !== "70,150,280,null,null,1000,null") {
    throw new Error(`parseItemGrams: got ${gramsGot}`);
  }
  const gramsComma = parseItemGrams([
    item({ name: "Megach (1,200gr)" }),
    item({ name: "Paella (1.5kg)" }),
    item({ name: "Cheesy Chicken Balls (250gr)" }),
  ]);
  const gramsCommaGot = gramsComma.map((i) => String(i.grams)).join(",");
  if (gramsCommaGot !== "1200,1500,250") {
    throw new Error(`parseItemGrams comma: got ${gramsCommaGot}`);
  }
  // Name wins over description when both print a weight.
  const gramsPriority = parseItemGrams([
    item({ name: "Corte (300gr)", description: "con guarnición de 150gr" }),
  ]);
  if (gramsPriority[0].grams !== 300) {
    throw new Error("parseItemGrams: name priority");
  }
  console.log("postprocess self-check passed");
}
