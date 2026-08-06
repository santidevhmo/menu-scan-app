import { assertEquals } from "jsr:@std/assert";
import type { ExtractedMenuItem } from "../supabase/functions/analyze-menu/extract.ts";
import {
  dropDrinkSections,
  dropMisattachedOptions,
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
  // The drink share must clear DRINK_SECTION_FRAC for the section to die — this
  // mirrors polloteria's real Bebidas (14 drinks + Malteadas = 93% drink). A
  // section that is only half drinks is KEPT by design (eval 099: nikkori's
  // POSTRES is 40% drink and holds 6 real desserts).
  assertEquals(
    dropDrinkSections([
      ...Array.from({ length: 5 }, (_, i) =>
        item({
          name: `Limonada ${i}`,
          category: "drink",
          section_title: "Bebidas",
        })),
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

const page = (
  blocks: Array<
    {
      top_left_x: number;
      top_left_y: number;
      bottom_right_x: number;
      bottom_right_y: number;
      content: string;
    }
  >,
) => ({ blocks, width: 100, height: 100 });

Deno.test("dropMisattachedOptions drops options printed far from the item's card", () => {
  const p = page([
    {
      top_left_x: 10,
      top_left_y: 20,
      bottom_right_x: 30,
      bottom_right_y: 25,
      content: "5 Formaggi",
    },
    {
      top_left_x: 44,
      top_left_y: 70,
      bottom_right_x: 50,
      bottom_right_y: 74,
      content: "Pollo",
    },
    {
      top_left_x: 44,
      top_left_y: 72,
      bottom_right_x: 52,
      bottom_right_y: 76,
      content: "Camaron",
    },
  ]);
  const [out] = dropMisattachedOptions([
    item({
      name: "5 Formaggi",
      options: [
        { name: "Pollo", price: 20, grams: null },
        { name: "Camaron", price: 25, grams: null },
      ],
    }),
  ], p);
  assertEquals(out.options, []);
});

Deno.test("dropMisattachedOptions keeps options printed on the item's own card", () => {
  const p = page([
    {
      top_left_x: 10,
      top_left_y: 20,
      bottom_right_x: 30,
      bottom_right_y: 25,
      content: "Paletas Heladas",
    },
    {
      top_left_x: 11,
      top_left_y: 26,
      bottom_right_x: 20,
      bottom_right_y: 30,
      content: "Uva",
    },
  ]);
  const [out] = dropMisattachedOptions([
    item({
      name: "Paletas Heladas",
      options: [{ name: "Uva", price: null, grams: null }],
    }),
  ], p);
  assertEquals(out.options.length, 1);
});

Deno.test("dropMisattachedOptions keeps options when the block match is weak (fail-open)", () => {
  const p = page([
    {
      top_left_x: 10,
      top_left_y: 20,
      bottom_right_x: 30,
      bottom_right_y: 25,
      content: "Alitas",
    },
    {
      top_left_x: 44,
      top_left_y: 70,
      bottom_right_x: 80,
      bottom_right_y: 78,
      content: "una orden de boneless papas alitas dedos apio",
    },
  ]);
  const [out] = dropMisattachedOptions([
    item({
      name: "Alitas",
      options: [{ name: "Alitas 6 PZ", price: 129, grams: null }],
    }),
  ], p);
  assertEquals(out.options.length, 1);
});

Deno.test("dropMisattachedOptions is a no-op without page blocks", () => {
  const it = item({
    name: "X",
    options: [{ name: "Y", price: 1, grams: null }],
  });
  assertEquals(dropMisattachedOptions([it], undefined)[0].options.length, 1);
  assertEquals(
    dropMisattachedOptions([it], { blocks: [], width: 100, height: 100 })[0]
      .options.length,
    1,
  );
});

Deno.test("dropSelfEchoWeightOptions folds a generic no-price weight option", () => {
  const [cleaned] = dropSelfEchoWeightOptions([
    item({
      name: "New York",
      options: [{ name: "Peso", price: null, grams: 400 }],
    }),
  ]);
  assertEquals(cleaned.options, []);
  assertEquals(cleaned.grams, 400);
});

Deno.test("dropSelfEchoWeightOptions keeps a priced option that carries grams", () => {
  const [cleaned] = dropSelfEchoWeightOptions([
    item({
      name: "Fettuccine",
      options: [{ name: "Spaghetti Gluten free", price: 330, grams: 180 }],
    }),
  ]);
  assertEquals(cleaned.options.length, 1);
  assertEquals(cleaned.grams, null);
});

Deno.test("dropDrinkSections keeps a mostly-non-drink section", () => {
  const drinks = Array.from(
    { length: 4 },
    (_, i) =>
      item({ name: `Drink ${i}`, category: "drink", section_title: "POSTRES" }),
  );
  const desserts = Array.from(
    { length: 6 },
    (_, i) =>
      item({
        name: `Dessert ${i}`,
        category: "dessert",
        section_title: "POSTRES",
      }),
  );
  assertEquals(
    dropDrinkSections([...drinks, ...desserts]).map((it) => it.name),
    desserts.map((it) => it.name),
  );
});

Deno.test("dropDrinkSections still drops an overwhelmingly-drink section", () => {
  const drinks = Array.from(
    { length: 14 },
    (_, i) =>
      item({ name: `Drink ${i}`, category: "drink", section_title: "Bebidas" }),
  );
  const dessert = item({
    name: "Malteadas",
    category: "dessert",
    section_title: "Bebidas",
  });
  assertEquals(dropDrinkSections([...drinks, dessert]), []);
});

Deno.test("dropMisattachedOptions rescues an option printed on the item's own card", () => {
  const p = page([
    {
      top_left_x: 10,
      top_left_y: 20,
      bottom_right_x: 30,
      bottom_right_y: 25,
      content: "# TACO LOIRO (sirloin)",
    },
    {
      top_left_x: 10,
      top_left_y: 28,
      bottom_right_x: 40,
      bottom_right_y: 33,
      content: "Taco de chile caribe... A elegir: (picaña $165, pollo $150)",
    },
    {
      top_left_x: 70,
      top_left_y: 70,
      bottom_right_x: 80,
      bottom_right_y: 75,
      content: "# POLLO",
    },
  ]);
  const [out] = dropMisattachedOptions([
    item({
      name: "# TACO LOIRO (sirloin)",
      options: [{ name: "Pollo", price: 150, grams: null }],
    }),
  ], p);
  assertEquals(out.options.length, 1);
});
