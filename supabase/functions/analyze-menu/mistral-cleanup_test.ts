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
