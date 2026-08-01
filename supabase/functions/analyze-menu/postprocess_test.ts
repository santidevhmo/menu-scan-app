import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  dropOptionEchoItems,
  filterServingFormatOptions,
  foldPerUnitPrice,
  foldSectionTitlePunctuation,
  foldVariantCards,
  PER_UNIT_NOTE,
  promoteSections,
  remapTruncatedSectionTitles,
  stripMenuNumbers,
} from "./postprocess.ts";
import type { ExtractedMenuItem } from "./extract.ts";

const item = (
  name: string,
  overrides: Partial<ExtractedMenuItem> = {},
): ExtractedMenuItem => ({
  name,
  description: "",
  price: 10,
  category: "food",
  section_title: null,
  options: [],
  grams: null,
  ...overrides,
});

const withOptions = (
  name: string,
  options: string[],
): ExtractedMenuItem => ({
  ...item(name),
  options: options.map((o) => ({ name: o, price: null, grams: null })),
});

Deno.test("strips leading numbers when a menu-wide pattern exists", () => {
  const items = [
    item("39. Spaghetti Carbonara"),
    item("40. Lasagna"),
    item("41) Ravioli"),
    item("Tiramisu"),
  ];
  assertEquals(
    stripMenuNumbers(items).map((i) => i.name),
    ["Spaghetti Carbonara", "Lasagna", "Ravioli", "Tiramisu"],
  );
});

Deno.test("leaves names alone when numbers are not a menu-wide pattern", () => {
  const items = [
    item("360 Burger"),
    item("Pasta 3 Quesos"),
    item("Caesar Salad"),
    item("Margherita"),
  ];
  assertEquals(
    stripMenuNumbers(items).map((i) => i.name),
    ["360 Burger", "Pasta 3 Quesos", "Caesar Salad", "Margherita"],
  );
});

Deno.test("requires at least three numbered names before stripping", () => {
  const items = [item("1. Soup"), item("2. Bread")];
  assertEquals(
    stripMenuNumbers(items).map((i) => i.name),
    ["1. Soup", "2. Bread"],
  );
});

Deno.test("removes serving-format options, keeps composition options", () => {
  const items = [
    withOptions("Vino Tinto", ["Copa", "Botella"]),
    withOptions("Limonada", ["Vaso", "Jarra"]),
    withOptions("Pasta Alfredo", ["Camarón", "Pollo"]),
    withOptions("Colada", ["Piña", "Fresa"]),
  ];
  const result = filterServingFormatOptions(items);
  assertEquals(result[0].options, []);
  assertEquals(result[1].options, []);
  assertEquals(result[2].options.map((o) => o.name), ["Camarón", "Pollo"]);
  assertEquals(result[3].options.map((o) => o.name), ["Piña", "Fresa"]);
});

Deno.test("removes size-word options", () => {
  const items = [withOptions("Ramen", ["Chico", "Grande"])];
  assertEquals(filterServingFormatOptions(items)[0].options, []);
});

Deno.test("removes observed serving formats with quantities", () => {
  const items = [
    withOptions("Sake", ["Botella 750 ml"]),
    withOptions("Vino", ["Copa 85 mxn"]),
  ];
  assertEquals(filterServingFormatOptions(items)[0].options, []);
  assertEquals(filterServingFormatOptions(items)[1].options, []);
});

Deno.test("dropOptionEchoItems drops a bare item duplicating another item's option (eval 065: Paletas flavors)", () => {
  const parent = item("Paletas Heladas Agua", {
    price: 20,
    options: [
      { name: "Uva", price: null, grams: null },
      { name: "Piña", price: null, grams: null },
    ],
  });
  const echo = item("Uva", { price: 20, options: [] });
  assertEquals(dropOptionEchoItems([parent, echo]), [parent]);
});

Deno.test("dropOptionEchoItems keeps a standalone whose price disagrees (combo guard)", () => {
  const combo = item("Combo Familiar", {
    price: 300,
    options: [{ name: "Pizza de Pepperoni", price: null, grams: null }],
  });
  const dish = item("Pizza de Pepperoni", { price: 280, options: [] });
  assertEquals(dropOptionEchoItems([combo, dish]), [combo, dish]);
});

Deno.test("dropOptionEchoItems matches option names with their own printed price", () => {
  const parent = item("Paletas Heladas Crema", {
    price: 30,
    options: [{ name: "Yoghurt con Cajeta", price: 30, grams: null }],
  });
  const echo = item("Yoghurt con Cajeta", { price: 30, options: [] });
  assertEquals(dropOptionEchoItems([parent, echo]), [parent]);
});

Deno.test("dropOptionEchoItems never drops items that have their own options", () => {
  const parent = item("Paletas Heladas Agua", {
    price: 20,
    options: [{ name: "Combinada", price: null, grams: null }],
  });
  const alsoParent = item("Combinada", {
    price: 20,
    options: [{ name: "Fresa-Vainilla", price: null, grams: null }],
  });
  assertEquals(dropOptionEchoItems([parent, alsoParent]), [parent, alsoParent]);
});

Deno.test("dropOptionEchoItems ignores unmatched option names", () => {
  const parent = item("Tacos", {
    price: 50,
    options: [{ name: "Pizza de Pepperoni", price: null, grams: null }],
  });
  const dish = item("Pizza", { price: 50, options: [] });
  assertEquals(dropOptionEchoItems([parent, dish]), [parent, dish]);
});

Deno.test("dropOptionEchoItems strips a matching section prefix before echo matching", () => {
  const parent = item("Paletas Heladas Agua", {
    price: 20,
    section_title: "Paletas Heladas",
    options: [{ name: "Piña", price: null, grams: null }],
  });
  const echo = item("Paletas Heladas Piña", {
    price: 20,
    section_title: "Paletas Heladas",
  });
  assertEquals(dropOptionEchoItems([parent, echo]), [parent]);
});

Deno.test("dropOptionEchoItems keeps prefixed items with options", () => {
  const parent = item("Paletas Heladas Agua", {
    price: 20,
    section_title: "Paletas Heladas",
    options: [{ name: "Piña", price: null, grams: null }],
  });
  const alsoParent = item("Paletas Heladas Crema", {
    price: 20,
    section_title: "Paletas Heladas",
    options: [{ name: "Piña", price: null, grams: null }],
  });
  assertEquals(dropOptionEchoItems([parent, alsoParent]), [parent, alsoParent]);
});

Deno.test("dropOptionEchoItems keeps a prefixed echo when its price differs", () => {
  const parent = item("Paletas Heladas Agua", {
    price: 20,
    section_title: "Paletas Heladas",
    options: [{ name: "Piña", price: null, grams: null }],
  });
  const dish = item("Paletas Heladas Piña", {
    price: 25,
    section_title: "Paletas Heladas",
  });
  assertEquals(dropOptionEchoItems([parent, dish]), [parent, dish]);
});

Deno.test("foldSectionTitlePunctuation uses the majority raw spelling", () => {
  const out = foldSectionTitlePunctuation([
    item("A", { section_title: "Pa Compartir" }),
    item("B", { section_title: "Pa'Compartir" }),
    item("C", { section_title: "Pa'Compartir" }),
  ]);
  assertEquals(out.map((i) => i.section_title), [
    "Pa'Compartir",
    "Pa'Compartir",
    "Pa'Compartir",
  ]);
});

Deno.test("foldSectionTitlePunctuation breaks ties with the longest spelling", () => {
  const out = foldSectionTitlePunctuation([
    item("A", { section_title: "Pa Compartir" }),
    item("B", { section_title: "Pa' Compartir" }),
  ]);
  assertEquals(out.map((i) => i.section_title), [
    "Pa' Compartir",
    "Pa' Compartir",
  ]);
});

Deno.test("foldSectionTitlePunctuation leaves different titles untouched", () => {
  const out = foldSectionTitlePunctuation([
    item("A", { section_title: "Entradas" }),
    item("B", { section_title: "Especialidades" }),
    item("C", { section_title: null }),
  ]);
  assertEquals(out.map((i) => i.section_title), [
    "Entradas",
    "Especialidades",
    null,
  ]);
});

Deno.test("remapTruncatedSectionTitles remaps a fragment to its unique superset (eval 065: Sandwiches)", () => {
  const a = item("Nashville", {
    price: 159,
    section_title: "Sandwiches",
  });
  const b = item("Dallas", {
    price: 159,
    section_title: "Sandwiches & Hamburguesas",
  });
  const out = remapTruncatedSectionTitles([a, b]);
  assertEquals(out.map((i: ExtractedMenuItem) => i.section_title), [
    "Sandwiches & Hamburguesas",
    "Sandwiches & Hamburguesas",
  ]);
});

Deno.test("remapTruncatedSectionTitles leaves ambiguous subsets alone (two supersets)", () => {
  const a = item("X", { price: 1, section_title: "Rollos" });
  const b = item("Y", { price: 2, section_title: "Rollos Especiales" });
  const c = item("Z", { price: 3, section_title: "Rollos Empanizados" });
  const out = remapTruncatedSectionTitles([a, b, c]);
  assertEquals(out.map((i: ExtractedMenuItem) => i.section_title), [
    "Rollos",
    "Rollos Especiales",
    "Rollos Empanizados",
  ]);
});

Deno.test("remapTruncatedSectionTitles ignores null and unrelated titles", () => {
  const a = item("X", { price: 1, section_title: null });
  const b = item("Y", { price: 2, section_title: "Sides" });
  const out = remapTruncatedSectionTitles([a, b]);
  assertEquals(out.map((i: ExtractedMenuItem) => i.section_title), [
    null,
    "Sides",
  ]);
});

// eval 110 — promoteSections was exploding real dish CARDS, not just folded
// sections. A folded section is a bare name + children; a dish card carries its
// own description (brasero-two TACO LOIRO, guest-house PRIME TOMAHAWK*).
Deno.test("promoteSections still explodes a description-less folded section", () => {
  const cerdo = item("Cerdo", {
    price: null,
    section_title: "ESPECIALIDADES",
    options: [
      { name: "Bandiola Adobada (150gr)", price: null, grams: null },
      { name: "Chistorra (150gr)", price: null, grams: null },
    ],
  });
  const out = promoteSections([cerdo]);
  assertEquals(out.map((i: ExtractedMenuItem) => i.name), [
    "Bandiola Adobada (150gr)",
    "Chistorra (150gr)",
  ]);
  assertEquals(out.map((i: ExtractedMenuItem) => i.section_title), [
    "Cerdo",
    "Cerdo",
  ]);
});

Deno.test("promoteSections leaves a dish card that carries a description", () => {
  const taco = item("TACO LOIRO (sirloin)", {
    price: null,
    description: "Taco de chile caribe relleno de panela marinada.",
    section_title: "ESPECIALIDADES BRASERO",
    options: [
      { name: "picaña", price: 165, grams: null },
      { name: "pollo", price: 150, grams: null },
    ],
  });
  assertEquals(promoteSections([taco]), [taco]);
});

// A spared per-unit card must keep its printed rate as the item price
// (ruling 31): the per-unit option is dropped later by
// filterServingFormatOptions, which would otherwise take the price with it.
Deno.test("foldPerUnitPrice takes the rate from a single per-unit option", () => {
  const tomahawk = item("PRIME TOMAHAWK*", {
    price: null,
    options: [{ name: "per oz", price: 6.5, grams: null }],
  });
  assertEquals(foldPerUnitPrice([tomahawk])[0].price, 6.5);
});

Deno.test("foldPerUnitPrice leaves an already-priced item alone", () => {
  const priced = item("STEAK", {
    price: 40,
    options: [{ name: "per oz", price: 6.5, grams: null }],
  });
  assertEquals(foldPerUnitPrice([priced])[0].price, 40);
});

Deno.test("foldPerUnitPrice ignores two per-unit options and priceless ones", () => {
  const two = item("A", {
    price: null,
    options: [
      { name: "per oz", price: 6.5, grams: null },
      { name: "per lb", price: 90, grams: null },
    ],
  });
  const bare = item("B", {
    price: null,
    options: [{ name: "per oz", price: null, grams: null }],
  });
  assertEquals(
    foldPerUnitPrice([two, bare]).map((i: ExtractedMenuItem) => i.price),
    [null, null],
  );
});

Deno.test("foldPerUnitPrice ignores a real choice option", () => {
  const dish = item("Tacos", {
    price: null,
    options: [{ name: "picaña", price: 165, grams: null }],
  });
  assertEquals(foldPerUnitPrice([dish])[0].price, null);
});

// eval 110 — foldVariantCards keyed on name+category only, so two DIFFERENT
// printed cards that share a variant line name were folded together and one was
// silently deleted (el-marcos prints both REVUELTOS and FRITOS, each with a
// "Dos huevos naturales 78" line). Variants of one dish sit on one card, hence
// in one section.
Deno.test("foldVariantCards keeps same-name cards in DIFFERENT sections", () => {
  const revueltos = item("Dos huevos naturales", {
    price: 78,
    section_title: "REVUELTOS",
  });
  const fritos = item("Dos huevos naturales", {
    price: 78,
    section_title: "FRITOS",
  });
  const out = foldVariantCards([revueltos, fritos]);
  assertEquals(out.length, 2);
  assertEquals(out.map((i: ExtractedMenuItem) => i.section_title), [
    "REVUELTOS",
    "FRITOS",
  ]);
});

Deno.test("foldVariantCards keeps a cross-section card that carries options", () => {
  const withOpts = (section: string) =>
    item("Con jamón, chorizo o tocino", {
      price: 90,
      section_title: section,
      options: [{ name: "jamón", price: 90, grams: null }],
    });
  assertEquals(
    foldVariantCards([withOpts("REVUELTOS"), withOpts("FRITOS")]).length,
    2,
  );
});

Deno.test("foldVariantCards still folds true duplicates in the SAME section", () => {
  const a = item("Dos huevos naturales", {
    price: 78,
    section_title: "REVUELTOS",
  });
  const b = item("Dos huevos naturales", {
    price: 78,
    section_title: "REVUELTOS",
  });
  assertEquals(foldVariantCards([a, b]).length, 1);
});

Deno.test("foldVariantCards still folds a priced variant label in the SAME section", () => {
  const base = item("CHILAQUILES", {
    price: 138,
    description: "Tradicionales.",
    section_title: "MEXICANOS",
  });
  const variant = item("CHILAQUILES", {
    price: 150,
    description: "Regionales.",
    section_title: "MEXICANOS",
  });
  const out = foldVariantCards([base, variant]);
  assertEquals(out.length, 1);
  assertEquals(out[0].options.map((o) => o.name), ["Regionales."]);
});

// eval 110 — "MEXICAN WHITE SHRIMP  7 EA" is the same per-unit family as
// "PRIME TOMAHAWK* 6.50 PER OZ" (ruling 31): a printed rate, never a choice.
Deno.test("PER_UNIT_NOTE matches a bare EA", () => {
  assertEquals(PER_UNIT_NOTE.test("EA"), true);
  assertEquals(PER_UNIT_NOTE.test("ea."), true);
  assertEquals(PER_UNIT_NOTE.test("per oz"), true);
});

Deno.test("PER_UNIT_NOTE does not match dish names starting with ea", () => {
  for (const name of ["Ealing Salad", "Easy Bowl", "Tea", "Sea Bass"]) {
    assertEquals(PER_UNIT_NOTE.test(name), false, name);
  }
});

Deno.test("filterServingFormatOptions drops a bare EA option", () => {
  const shrimp = item("MEXICAN WHITE SHRIMP", {
    price: 7,
    options: [{ name: "EA", price: 7, grams: null }],
  });
  assertEquals(filterServingFormatOptions([shrimp])[0].options, []);
});
