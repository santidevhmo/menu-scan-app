import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  dropOptionEchoItems,
  filterServingFormatOptions,
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
