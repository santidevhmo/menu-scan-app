import { assertEquals } from "jsr:@std/assert";
import type { ExtractedMenuItem } from "./extract.ts";
import {
  dropSelfNamedSectionTitles,
  normalizeSectionTitle,
  textStructureCleanup,
} from "./mistral-cleanup.ts";

const item = (
  overrides: Partial<ExtractedMenuItem> = {},
): ExtractedMenuItem => ({
  name: "Item",
  description: "",
  price: 100,
  category: "food",
  section_title: null,
  options: [],
  grams: null,
  ...overrides,
});

const cleanWithMarkdown = textStructureCleanup as (
  items: ExtractedMenuItem[],
  markdown?: string,
) => ExtractedMenuItem[];

Deno.test("normalizeSectionTitle collapses only runs of three or more single-character tokens", () => {
  assertEquals(normalizeSectionTitle("P O"), "P O");
  assertEquals(normalizeSectionTitle("P O S"), "POS");
  assertEquals(
    normalizeSectionTitle("GH MAC | N | CHEESE"),
    "GH MAC | N | CHEESE",
  );
});

Deno.test("dropSelfNamedSectionTitles nulls a single-member same-named section", () => {
  const cleaned = dropSelfNamedSectionTitles([
    item({ name: "SEAFOOD PLATEAU*", section_title: "seafood plateau" }),
  ]);
  assertEquals(cleaned.map((it) => it.section_title), [null]);
});

Deno.test("dropSelfNamedSectionTitles keeps two-member and five-member same-named sections", () => {
  const twoMember = [
    item({ name: "Crispy Chicken", section_title: "Crispy Chicken" }),
    item({ name: "Boneless", section_title: "Crispy Chicken" }),
  ];
  const fiveMember = [
    item({ name: "Crispy Chicken", section_title: "Crispy Chicken" }),
    ...Array.from(
      { length: 4 },
      (_, index) =>
        item({ name: `Dish ${index}`, section_title: "Crispy Chicken" }),
    ),
  ];
  assertEquals(dropSelfNamedSectionTitles(twoMember), twoMember);
  assertEquals(dropSelfNamedSectionTitles(fiveMember), fiveMember);
});

Deno.test("dropSelfNamedSectionTitles keeps an item in a differently named section", () => {
  const cleaned = dropSelfNamedSectionTitles([
    item({ name: "Oysters", section_title: "seafood plateau" }),
    item({ name: "Oysters", section_title: "seafood plateau" }),
  ]);
  assertEquals(cleaned.map((it) => it.section_title), [
    "seafood plateau",
    "seafood plateau",
  ]);
});

Deno.test("textStructureCleanup normalizes titles before dropping labels, others, and drinks", () => {
  assertEquals(
    textStructureCleanup([
      item({ name: "POSTRES", section_title: "P O S T R E S" }),
      item({ name: "Note", category: "other", section_title: "P O S T R E S" }),
      item({ name: "Agua", category: "drink", section_title: "Bebidas" }),
    ]),
    [item({ name: "POSTRES", section_title: null })],
  );
});

Deno.test("textStructureCleanup folds the smallest parseable option weight without changing options", () => {
  const source = item({
    name: "CHURRASQUERÍA",
    options: [
      { name: "SENCILLA (300gr)", price: 495, grams: null },
      { name: "DOBLE (600gr)", price: 950, grams: null },
    ],
  });
  const [cleaned] = textStructureCleanup([source]);
  assertEquals(cleaned.grams, 300);
  assertEquals(cleaned.options, source.options);
});

Deno.test("textStructureCleanup turns a singleton per-unit note into its section's item", () => {
  const [cleaned] = textStructureCleanup([
    item({
      name: "per oz",
      price: 6.5,
      section_title: "PRIME TOMAHAWK* GF, DF",
    }),
  ]);
  assertEquals(cleaned.name, "PRIME TOMAHAWK* GF, DF");
  assertEquals(cleaned.price, 6.5);
  assertEquals(cleaned.options, []);
  assertEquals(cleaned.section_title, null);
});

Deno.test("textStructureCleanup leaves non-per-unit and multi-member sections untouched", () => {
  const source = [
    item({ name: "per oz", price: 6.5, section_title: "PRIME TOMAHAWK" }),
    item({ name: "Side", section_title: "PRIME TOMAHAWK" }),
    item({ name: "Steak", section_title: "BUTCHER'S BEST" }),
  ];
  assertEquals(textStructureCleanup(source), source);
});

Deno.test("textStructureCleanup folds a section matched by a priced markdown heading", () => {
  const cleaned = cleanWithMarkdown([
    item({ name: "Uva", price: 20, grams: 100, section_title: "AGUA" }),
    item({ name: "Piña", price: 20, section_title: "AGUA" }),
  ], "# AGUA $20");
  assertEquals(cleaned, [item({
    name: "AGUA",
    price: 20,
    section_title: null,
    options: [
      { name: "Uva", price: 20, grams: 100 },
      { name: "Piña", price: 20, grams: null },
    ],
  })]);
});

Deno.test("textStructureCleanup prefixes a priced card with its nearest unpriced heading", () => {
  const cleaned = cleanWithMarkdown([
    item({ name: "Uva", price: 20, section_title: "Agua" }),
    item({ name: "Piña", price: 20, section_title: "Agua" }),
  ], "# Paletas Heladas\n# Agua $20");
  assertEquals(cleaned.map((it) => it.name), ["Paletas Heladas Agua"]);
});

Deno.test("textStructureCleanup skips priced parents while finding a card prefix", () => {
  const cleaned = cleanWithMarkdown([
    item({ name: "Uva", price: 20, section_title: "Agua" }),
    item({ name: "Piña", price: 20, section_title: "Agua" }),
  ], "# Paletas Heladas\n# Crema $30\n# Agua $20");
  assertEquals(cleaned.map((it) => it.name), ["Paletas Heladas Agua"]);
});

Deno.test("textStructureCleanup does not duplicate parent tokens already in a card heading", () => {
  const cleaned = cleanWithMarkdown([
    item({
      name: "Uva",
      price: 20,
      section_title: "Paletas Heladas Agua",
    }),
    item({
      name: "Piña",
      price: 20,
      section_title: "Paletas Heladas Agua",
    }),
  ], "# Paletas Heladas\n# Paletas Heladas Agua $20");
  assertEquals(cleaned.map((it) => it.name), ["Paletas Heladas Agua"]);
});

Deno.test("textStructureCleanup keeps a section matched only by an unpriced heading", () => {
  const source = [
    item({ name: "Papas", section_title: "VEGETARIANO" }),
    item({ name: "Ensalada", section_title: "VEGETARIANO" }),
  ];
  assertEquals(cleanWithMarkdown(source, "# VEGETARIANO"), source);
});

Deno.test("textStructureCleanup drops MALTEADAS before a priced heading can fold it", () => {
  assertEquals(
    cleanWithMarkdown([
      item({ name: "Fresa", category: "drink", section_title: "MALTEADAS" }),
    ], "# MALTEADAS $89"),
    [],
  );
});

Deno.test("textStructureCleanup drops a dessert-labelled card folded inside a drink block (eval 122)", () => {
  // polloteria run 2: the model labels the milkshake flavours DESSERT (runs 1/3
  // say drink), so dropDrinkSections misses them and foldPricedHeadingCards
  // builds a food-scope "Bebidas MALTEADAS" card. The members are the DISPUTED
  // evidence; the verdict comes from the NEIGHBOURS — every other resident of
  // the parent heading "Bebidas" is model-labelled drink, so the priced heading
  // lives inside a drinks block and its whole group is dropped.
  const markdown =
    "# Bebidas\n\nTe Helado (455ml) $35\n\nRefresco (355ml) $35\n\n" +
    "Agua Embotellada (500ml) $2\n\n# MALTEADAS $89\n\nVainilla\n\nFresa\n\nChocolate";
  const cleaned = cleanWithMarkdown([
    item({ name: "Te Helado (455ml)", category: "drink", section_title: "Bebidas", price: 35 }),
    item({ name: "Refresco (355ml)", category: "drink", section_title: "Bebidas", price: 35 }),
    item({ name: "Agua Embotellada (500ml)", category: "drink", section_title: "Bebidas", price: 2 }),
    item({ name: "Vainilla", category: "dessert", section_title: "MALTEADAS", price: 89 }),
    item({ name: "Fresa", category: "dessert", section_title: "MALTEADAS", price: 89 }),
    item({ name: "Chocolate", category: "dessert", section_title: "MALTEADAS", price: 89 }),
  ], markdown);
  assertEquals(cleaned, []);
});

Deno.test("REFUSES the drink-block drop when the parent owns too few residents (Paletas)", () => {
  // Paletas Heladas: the parent heading owns no plain lines of its own — the
  // flavours belong to the priced AGUA heading. Fewer than 3 parent residents
  // is no evidence, so ruling 33's fold proceeds untouched.
  const cleaned = cleanWithMarkdown([
    item({ name: "Uva", category: "dessert", section_title: "AGUA", price: 20 }),
    item({ name: "Piña", category: "dessert", section_title: "AGUA", price: 20 }),
  ], "# Paletas Heladas\n\n# AGUA $20\n\nUva\n\nPiña");
  assertEquals(cleaned.length, 1);
  assertEquals(cleaned[0].name, "Paletas Heladas AGUA");
});

Deno.test("REFUSES the drink-block drop when the neighbours are food", () => {
  // A priced heading in a FOOD block folds normally even when its own members
  // are labelled dessert — only a drink neighbourhood may kill the card.
  const cleaned = cleanWithMarkdown([
    item({ name: "Flan", category: "dessert", section_title: "Postres", price: 50 }),
    item({ name: "Pastel", category: "dessert", section_title: "Postres", price: 60 }),
    item({ name: "Gelatina", category: "dessert", section_title: "Postres", price: 30 }),
    item({ name: "Nutella", category: "dessert", section_title: "CREPAS", price: 80 }),
    item({ name: "Cajeta", category: "dessert", section_title: "CREPAS", price: 80 }),
  ], "# Postres\n\nFlan $50\n\nPastel $60\n\nGelatina $30\n\n# CREPAS $80\n\nNutella\n\nCajeta");
  assertEquals(cleaned.length, 4);
  assertEquals(cleaned.some((it) => it.name === "Postres CREPAS"), true);
});

Deno.test("textStructureCleanup without markdown is byte-identical", () => {
  const source = [
    item({ name: "Uva", price: 20, section_title: "AGUA" }),
    item({ name: "Piña", price: 20, section_title: "AGUA" }),
  ];
  assertEquals(textStructureCleanup(source), source);
});

Deno.test("textStructureCleanup does not fold VEGETARIANO from HONGO VEGETARIANO $285", () => {
  const source = [
    item({
      name: "Torre de Betabel",
      price: 200,
      section_title: "VEGETARIANO",
    }),
    item({
      name: "Hongo Vegetariano",
      price: 285,
      section_title: "VEGETARIANO",
    }),
  ];
  assertEquals(
    cleanWithMarkdown(source, "# HONGO VEGETARIANO $285"),
    source,
  );
});

Deno.test("textStructureCleanup folds a section matched by a trailing bare heading price", () => {
  const cleaned = cleanWithMarkdown([
    item({ name: "Uva", price: 20, section_title: "AGUA" }),
    item({ name: "Piña", price: 20, section_title: "AGUA" }),
  ], "# AGUA 20 MXN");
  assertEquals(cleaned, [item({
    name: "AGUA",
    price: 20,
    section_title: null,
    options: [
      { name: "Uva", price: 20, grams: null },
      { name: "Piña", price: 20, grams: null },
    ],
  })]);
});

// ─── MULTI-VERSION CARD FOLD (eval 111) ──────────────────────────────────────
// A card prints its dish name once and each version on its own short line:
//
//     WAFFLES
//       Con plátano, canela y miel balsámica   70
//       Con Frutos rojos                       78
//
// The model emits that as two dishes with the card name welded on. Folding it
// is easy; folding it WITHOUT destroying menus that merely repeat a first word
// is the whole problem. THE REFUSALS BELOW ARE THE POINT — each is a real group
// from a real fixture menu that the rule must decline. They were measured: the
// unguarded rule fires 51 times across the 9 menus, the guarded one 6.

Deno.test("folds a welded multi-version card (el-marcos WAFFLES)", () => {
  const md = [
    "# DE LA PANADERÍA",
    "WAFFLES",
    "Con plátano, canela y miel balsámica 70",
    "Con Frutos rojos 78",
  ].join("\n");
  const out = cleanWithMarkdown([
    item({
      name: "WAFFLES Con plátano, canela y miel balsámica",
      price: 70,
      section_title: "DE LA PANADERÍA",
    }),
    item({
      name: "WAFFLES Con Frutos rojos",
      price: 78,
      section_title: "DE LA PANADERÍA",
    }),
  ], md);
  assertEquals(out.length, 1);
  assertEquals(out[0].name, "WAFFLES");
  assertEquals(out[0].price, 70);
  assertEquals(out[0].options.map((o) => [o.name, o.price]), [
    ["Con Frutos rojos", 78],
  ]);
});

Deno.test("REFUSES two different dishes sharing a first word (casa-nostra Gnocchi)", () => {
  const md = [
    "# Pasta",
    "Gnocchi alla sorrentina 250",
    "Gnocchi toscano 265",
  ].join("\n");
  const source = [
    item({
      name: "Gnocchi alla sorrentina",
      price: 250,
      section_title: "Pasta",
    }),
    item({ name: "Gnocchi toscano", price: 265, section_title: "Pasta" }),
  ];
  assertEquals(cleanWithMarkdown(source, md), source);
});

Deno.test("REFUSES a dish whose full name extends another's (mochomos Tostadas de Atún)", () => {
  const md = [
    "# TACOS Y TOSTADAS",
    "TOSTADAS DE ATÚN 340",
    "TOSTADAS DE ATÚN AL AJONJOLÍ 335",
  ].join("\n");
  const source = [
    item({
      name: "TOSTADAS DE ATÚN",
      price: 340,
      section_title: "TACOS Y TOSTADAS",
    }),
    item({
      name: "TOSTADAS DE ATÚN AL AJONJOLÍ",
      price: 335,
      section_title: "TACOS Y TOSTADAS",
    }),
  ];
  assertEquals(cleanWithMarkdown(source, md), source);
});

Deno.test("REFUSES sibling cards whose versions are their own headings (polloteria Paletas)", () => {
  const md = ["# Paletas Heladas", "# AGUA $20", "# CREMA $30"].join("\n");
  const source = [
    item({ name: "Paletas Heladas AGUA", price: 20 }),
    item({ name: "Paletas Heladas CREMA", price: 30 }),
  ];
  assertEquals(cleanWithMarkdown(source, md), source);
});

Deno.test("REFUSES same-named dishes that sit in different sections (el-marcos Machaca)", () => {
  const md = [
    "# MEXICANOS",
    "MACHACA",
    "Con huevo o verdura (Machaca 30gr.) 98",
    "# DE LA PLAYA",
    "Machaca de Marlín c/huevo o verdura",
    "98",
  ].join("\n");
  const source = [
    item({ name: "MACHACA", price: 98, section_title: "MEXICANOS" }),
    item({
      name: "Machaca de Marlín c/huevo o verdura",
      price: 98,
      section_title: "DE LA PLAYA",
    }),
  ];
  assertEquals(cleanWithMarkdown(source, md), source);
});

Deno.test("folds a card the model mistook for a section (el-marcos REVUELTOS)", () => {
  const md = [
    "# HUEVOS",
    "REVUELTOS",
    "Dos huevos naturales 78",
    "Dos huevos a la mexicana 84",
  ].join("\n");
  const out = cleanWithMarkdown([
    item({
      name: "Dos huevos naturales",
      price: 78,
      section_title: "REVUELTOS",
    }),
    item({
      name: "Dos huevos a la mexicana",
      price: 84,
      section_title: "REVUELTOS",
    }),
  ], md);
  assertEquals(out.length, 1);
  assertEquals(out[0].name, "REVUELTOS");
  assertEquals(out[0].price, 78);
  assertEquals(out[0].section_title, "HUEVOS");
  assertEquals(out[0].options.map((o) => [o.name, o.price]), [
    ["Dos huevos a la mexicana", 84],
  ]);
});

Deno.test("REFUSES to fold a real section that IS a markdown heading", () => {
  const md = ["# ENSALADAS", "ENSALADA GRIEGA 185", "ENSALADA BISTRO 225"].join(
    "\n",
  );
  const source = [
    item({ name: "ENSALADA GRIEGA", price: 185, section_title: "ENSALADAS" }),
    item({ name: "ENSALADA BISTRO", price: 225, section_title: "ENSALADAS" }),
  ];
  assertEquals(cleanWithMarkdown(source, md), source);
});

Deno.test("omitting the markdown stays byte-identical (both fold rules are inert)", () => {
  const source = [
    item({
      name: "WAFFLES Con plátano",
      price: 70,
      section_title: "DE LA PANADERÍA",
    }),
    item({
      name: "WAFFLES Con Frutos rojos",
      price: 78,
      section_title: "DE LA PANADERÍA",
    }),
  ];
  assertEquals(textStructureCleanup(source), source);
});

// ─── The card fold must not depend on the model's grouping choice (eval 118) ──
// Across three identical calls polloteria returned the SAME 95 items, but draw 1
// labelled the ice-cream flavours section_title:"AGUA" while draws 2 and 3 left
// them NULL. The fold keyed on section_title, so it fired once and skipped
// twice: 42 / 52 / 52 items. The printed markdown was identical in all three.
// Both shapes must now produce the same card (master-roadmap lesson 25).
Deno.test("priced-heading fold places unsectioned items from the printed page", () => {
  const item = (name: string, section: string | null) => ({
    name,
    description: "",
    price: 20,
    category: "food" as const,
    section_title: section,
    options: [],
    grams: null,
  });
  const markdown = ["# Paletas Heladas", "# AGUA $20", "Uva", "Piña", "Melón"]
    .join("\n");
  const sectioned = textStructureCleanup(
    [item("Uva", "AGUA"), item("Piña", "AGUA"), item("Melón", "AGUA")],
    markdown,
  );
  const unsectioned = textStructureCleanup(
    [item("Uva", null), item("Piña", null), item("Melón", null)],
    markdown,
  );
  assertEquals(sectioned.length, 1);
  assertEquals(sectioned[0].name, "Paletas Heladas AGUA");
  assertEquals(sectioned[0].options.length, 3);
  // The whole point: the model's choice of section_title changes nothing.
  assertEquals(unsectioned, sectioned);
});

// REFUSAL, and it is the part that matters: a line printed under two different
// headings cannot be placed, so it is left alone rather than guessed at.
// polloteria prints "Fresa" three times — under AGUA $20, CREMA $30 and
// MALTEADAS $89. Guessing would attach a 20-peso paleta to the milkshake card.
Deno.test("an ambiguously printed line is refused, not guessed", () => {
  const item = (name: string, price: number) => ({
    name,
    description: "",
    price,
    category: "food" as const,
    section_title: null,
    options: [],
    grams: null,
  });
  const markdown = [
    "# AGUA $20",
    "Fresa",
    "Uva",
    "# CREMA $30",
    "Fresa",
    "Nuez",
  ].join("\n");
  const out = textStructureCleanup([item("Fresa", 20), item("Uva", 20)], markdown);
  // Uva is unambiguous and folds; Fresa is printed twice and stays standalone.
  assertEquals(out.some((i) => i.name === "Fresa" && i.options.length === 0), true);
});

// ─── SECTION-LEVEL CHOICE LINE (eval 129) ────────────────────────────────────
// El Andaluz prints "empanizados o naturales" once, under `# sushi`, for all
// three rolls. Firing list across 49 archived draws: this is the ONLY place it
// fires — the refusals below are what keep it that way.
const roll = (name: string, price: number): ExtractedMenuItem => ({
  name,
  description: "",
  price,
  category: "food",
  section_title: "sushi",
  options: [],
  grams: null,
});
const SUSHI = [
  "# sushi",
  "empanizados o naturales",
  "DE CAMARÓN ROKA $275",
  "DE ATÚN $275",
].join("\n");

Deno.test("attaches a section's printed choice line to every dish in it", () => {
  const out = textStructureCleanup(
    [roll("DE CAMARÓN ROKA", 275), roll("DE ATÚN", 275)],
    SUSHI,
  );
  assertEquals(out.length, 2);
  for (const item of out) {
    assertEquals(item.options.map((o) => o.name), [
      "empanizados",
      "naturales",
    ]);
  }
});

Deno.test("REFUSES a PRICED line under a heading — that is a dish", () => {
  const markdown = [
    "# entradas",
    "Papas fritas o bravas $190",
    "CHAMPIÑONES AL AJILLO $225",
  ].join("\n");
  const out = textStructureCleanup(
    [{ ...roll("CHAMPIÑONES AL AJILLO", 225), section_title: "entradas" }],
    markdown,
  );
  assertEquals(out[0].options, []);
});

Deno.test("REFUSES a line the model returned as a dish", () => {
  const markdown = ["# tacos", "Pastor o suadero", "TACOS DE PAPADA $205"].join(
    "\n",
  );
  const out = textStructureCleanup(
    [
      { ...roll("Pastor o suadero", 90), section_title: "tacos" },
      { ...roll("TACOS DE PAPADA", 205), section_title: "tacos" },
    ],
    markdown,
  );
  for (const item of out) assertEquals(item.options, []);
});

Deno.test("REFUSES prose under a heading (alternatives too long to be a list)", () => {
  const markdown = [
    "# carnes",
    "Todos nuestros cortes se sirven a la plancha o al carbón de encino",
    "ARRACHERA DE LA CASA $455",
  ].join("\n");
  const out = textStructureCleanup(
    [{ ...roll("ARRACHERA DE LA CASA", 455), section_title: "carnes" }],
    markdown,
  );
  assertEquals(out[0].options, []);
});

// ─── BASE VARIANT LEFT IN THE DESCRIPTION (eval 129) ─────────────────────────
const QUESO = [
  "# entradas",
  "QUESO FUNDIDO",
  "Con chistorra y champis (50 g) $235",
  "Con chile verde + diezmillo (100 g) $290",
].join("\n");
const fundido = (
  overrides: Partial<ExtractedMenuItem> = {},
): ExtractedMenuItem => ({
  name: "QUESO FUNDIDO",
  description: "Con chistorra y champis (50 g)",
  price: 235,
  category: "food",
  section_title: "entradas",
  options: [{ name: "Con chile verde + diezmillo (100 g)", price: 290, grams: 100 }],
  grams: 50,
  ...overrides,
});

Deno.test("restores the base variant the model left in the description", () => {
  const [out] = textStructureCleanup([fundido()], QUESO);
  assertEquals(out.options.map((o) => o.name), [
    "Con chistorra y champis (50 g)",
    "Con chile verde + diezmillo (100 g)",
  ]);
  assertEquals(out.options[0].price, 235);
  assertEquals(out.options[0].grams, 50);
});

Deno.test("REFUSES a normal dish: its NAME line carries the price", () => {
  const markdown = [
    "# entradas",
    "PAPAS FRITAS $190",
    "Sazonadas con trufa, parmesano y virutas de bacon",
  ].join("\n");
  const [out] = textStructureCleanup([
    fundido({
      name: "PAPAS FRITAS",
      description: "Sazonadas con trufa, parmesano y virutas de bacon",
      price: 190,
      grams: null,
      options: [{ name: "extra tocino", price: 15, grams: null }],
    }),
  ], markdown);
  assertEquals(out.options.length, 1);
});

Deno.test("REFUSES a card with no PRICED option — nothing says it is a variant", () => {
  const [out] = textStructureCleanup([
    fundido({
      options: [{ name: "con chile verde", price: null, grams: null }],
    }),
  ], QUESO);
  assertEquals(out.options.length, 1);
});
