import { assertEquals } from "jsr:@std/assert";
import type { ExtractedMenuItem } from "../supabase/functions/analyze-menu/extract.ts";
import {
  dropDrinkSections,
  dropOtherCategoryItems,
  dropSelfEchoWeightOptions,
  normalizeSectionTitle,
  optionEchoesItem,
} from "./mistral-cleanup.ts";

const item = (
  overrides: Partial<ExtractedMenuItem> = {},
): ExtractedMenuItem => ({
  name: "Item",
  description: "",
  price: null,
  category: "food",
  section_title: null,
  options: [],
  grams: null,
  ...overrides,
});

Deno.test("dropSelfEchoWeightOptions folds an echoed option weight into its item", () => {
  const [cleaned] = dropSelfEchoWeightOptions([
    item({
      name: "Cheesey Chicken Balls",
      options: [{
        name: "Cheesey Chicken Balls (250gr)",
        price: null,
        grams: 250,
      }],
    }),
  ]);
  assertEquals(cleaned.options, []);
  assertEquals(cleaned.grams, 250);
});

Deno.test("dropSelfEchoWeightOptions keeps priced options", () => {
  const [cleaned] = dropSelfEchoWeightOptions([
    item({
      name: "Alitas",
      options: [{ name: "Alitas 6 PZ", price: 129, grams: null }],
    }),
  ]);
  assertEquals(cleaned.options.length, 1);
});

Deno.test("dropSelfEchoWeightOptions keeps bare flavor options", () => {
  const [cleaned] = dropSelfEchoWeightOptions([
    item({
      name: "Paletas",
      options: [{ name: "Uva", price: null, grams: null }],
    }),
  ]);
  assertEquals(cleaned.options.length, 1);
});

Deno.test("dropSelfEchoWeightOptions drops component weight options", () => {
  const [cleaned] = dropSelfEchoWeightOptions([
    item({
      name: "TostiBoneless",
      options: [{ name: "Boneless (300gr)", price: null, grams: 300 }],
    }),
  ]);
  assertEquals(cleaned.options, []);
  assertEquals(cleaned.grams, 300);
});

Deno.test("dropSelfEchoWeightOptions sums combo weights", () => {
  const [cleaned] = dropSelfEchoWeightOptions([
    item({
      name: "PapaBoneless",
      options: [
        { name: "Boneless (300gr)", price: null, grams: 300 },
        { name: "Papas sazonadas (300gr)", price: null, grams: 300 },
      ],
    }),
  ]);
  assertEquals(cleaned.options, []);
  assertEquals(cleaned.grams, 600);
});

Deno.test("dropSelfEchoWeightOptions sums all Megacharola component weights", () => {
  const [cleaned] = dropSelfEchoWeightOptions([
    item({
      name: "Megacharola",
      options: [
        { name: "Boneless (1,200gr)", price: null, grams: 1200 },
        { name: "Papas fritas (600gr)", price: null, grams: 600 },
        { name: "Apio y zanahoria", price: null, grams: null },
      ],
    }),
  ]);
  assertEquals(cleaned.grams, 1800);
});

Deno.test("optionEchoesItem matches normalized name tokens", () => {
  assertEquals(optionEchoesItem("Steak tartare", "STEAK TARTARE"), true);
  assertEquals(optionEchoesItem("Uva", "Paletas Heladas"), false);
});

Deno.test("dropOtherCategoryItems removes other items", () => {
  assertEquals(
    dropOtherCategoryItems([
      item({ category: "other" }),
      item({ category: "food" }),
    ])
      .map((entry: ExtractedMenuItem) => entry.category),
    ["food"],
  );
});

Deno.test("dropDrinkSections drops a drink section including non-drink items", () => {
  assertEquals(
    dropDrinkSections([
      item({ name: "Limonada", category: "drink", section_title: "Bebidas" }),
      item({
        name: "Malteadas",
        category: "dessert",
        section_title: "Bebidas",
      }),
      item({ name: "Tacos", category: "food", section_title: "Comida" }),
    ]).map((entry: ExtractedMenuItem) => entry.name),
    ["Tacos"],
  );
});

Deno.test("normalizeSectionTitle splits camel case and preserves normal titles", () => {
  assertEquals(normalizeSectionTitle("PolloKids"), "Pollo Kids");
  assertEquals(normalizeSectionTitle("Entradas"), "Entradas");
  assertEquals(normalizeSectionTitle(null), null);
});
