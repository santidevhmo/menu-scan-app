import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  filterServingFormatOptions,
  stripMenuNumbers,
} from "./postprocess.ts";
import type { ExtractedMenuItem } from "./extract.ts";

const item = (name: string): ExtractedMenuItem => ({
  name,
  description: "",
  price: 10,
  category: "food",
  section_title: null,
  options: [],
  grams: null,
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
