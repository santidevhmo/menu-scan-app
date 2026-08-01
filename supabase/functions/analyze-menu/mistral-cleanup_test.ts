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
