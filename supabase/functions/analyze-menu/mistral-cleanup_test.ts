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
