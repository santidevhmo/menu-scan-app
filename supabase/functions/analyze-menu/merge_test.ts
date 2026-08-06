import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { mergeItemSources } from "./merge.ts";
import type { ExtractedMenuItem } from "./extract.ts";

const item = (
  name: string,
  price: number | null,
  description = "",
  overrides: Partial<ExtractedMenuItem> = {},
): ExtractedMenuItem => ({
  name,
  description,
  price,
  category: "food",
  section_title: "Rollos",
  options: [],
  grams: null,
  ...overrides,
});

Deno.test("merges exact overlap duplicates", () => {
  assertEquals(
    mergeItemSources([
      [item("Lomo Salteado", 169)],
      [item("Lomo Salteado", 169, "Filete de res")],
    ]),
    [item("Lomo Salteado", 169, "Filete de res")],
  );
});

Deno.test("merges conservative OCR aliases", () => {
  assertEquals(
    mergeItemSources([[item("Mangud", 159)], [item("Manguo", 159)]]).length,
    1,
  );
});

Deno.test("merges near-name variant when one source omits the section", () => {
  const withSection = item("Kurimu Roll", 169);
  const nullSection = { ...item("Kurimu Roll I", 169), section_title: null };
  assertEquals(
    mergeItemSources([[withSection], [nullSection]]).length,
    1,
  );
});

Deno.test("keeps distinct same-price dishes", () => {
  assertEquals(
    mergeItemSources([[
      item("Cosmo Roll", 159),
      item("Cosmo de Pollo", 159),
    ]]).length,
    2,
  );
});

Deno.test("does not deduplicate within one source", () => {
  assertEquals(
    mergeItemSources([[
      item("Revueltos", 78),
      item("Revueltos", 84),
    ]]).length,
    2,
  );
});

Deno.test("removes empty section header pseudo-items", () => {
  const header = {
    ...item("Rollos", null),
    section_title: "Menu",
  };
  assertEquals(
    mergeItemSources([[header, item("Salmón Roll", 169)]])
      .map((entry) => entry.name),
    ["Salmón Roll"],
  );
});

Deno.test("sectionLenient merges near-name pair blocked only by section conflict", () => {
  const rollos = { ...item("Nikkori Dynamite", 179), section_title: "ROLLOS" };
  const empanizados = {
    ...item("Nikori Dynamite", 179),
    section_title: "EMPANIZADOS",
  };
  assertEquals(mergeItemSources([[rollos], [empanizados]]).length, 2);
  assertEquals(mergeItemSources([[rollos], [empanizados]], true).length, 1);
});

Deno.test("sectionLenient still respects price and category gates", () => {
  const a = { ...item("Salmon Crunch", 159), section_title: "ROLLOS" };
  const b = { ...item("Salimon Crunch", 179), section_title: "EMPANIZADOS" };
  assertEquals(mergeItemSources([[a], [b]], true).length, 2);
});

Deno.test("sectionLenient twin fold keeps the copy from the richer section source", () => {
  const sourceA = [
    item("Nuggets", 89, "", { section_title: "Pollo Kids", grams: 200 }),
  ];
  const sourceB = [
    item("Nuggets", 99, "", { section_title: "Pollo Kids", grams: 200 }),
    item("Chicken-Little", 99, "", { section_title: "Pollo Kids", grams: 200 }),
    item("Nuggets de Coliflor", 99, "", {
      section_title: "Pollo Kids",
      grams: 200,
    }),
  ];
  assertEquals(
    mergeItemSources([sourceA, sourceB], true).filter((i) =>
      i.name === "Nuggets"
    ),
    [sourceB[0]],
  );
});

Deno.test("sectionLenient twin fold keeps same-name items from different sections", () => {
  const crispy = item("Tender", 165, "", {
    section_title: "Crispy Chicken",
    grams: 350,
  });
  const sandwich = item("Tender", 159, "", {
    section_title: "Sandwiches & Hamburguesas",
    grams: 350,
  });
  assertEquals(mergeItemSources([[crispy], [sandwich]], true).length, 2);
});

Deno.test("sectionLenient twin fold does not deduplicate same-source price variants", () => {
  assertEquals(
    mergeItemSources([[
      item("Revueltos", 78, "", { section_title: "Huevos", grams: 70 }),
      item("Revueltos", 84, "", { section_title: "Huevos", grams: 70 }),
    ]], true).length,
    2,
  );
});

Deno.test("sectionLenient twin fold keeps same-name items with different grams", () => {
  const small = item("Nuggets", 89, "", {
    section_title: "Pollo Kids",
    grams: 200,
  });
  const large = item("Nuggets", 99, "", {
    section_title: "Pollo Kids",
    grams: 250,
  });
  assertEquals(mergeItemSources([[small], [large]], true).length, 2);
});

Deno.test("tile twin fold ignores section conflicts (eval 065: PapaBoneless)", () => {
  const a = item("PapaBoneless (600gr)", 192, "", {
    grams: 600,
    section_title: null,
  });
  const b = item("Papaboneless (600gr)", 189, "", {
    grams: 600,
    section_title: "Crispy Chicken",
  });
  const merged = mergeItemSources([[a], [b]], true);
  assertEquals(merged.length, 1);
});

Deno.test("tile twin fold matches near-names within the dedup threshold (eval 065: Papabones)", () => {
  const a = item("PapaBoneless (600gr)", 192, "", {
    grams: 600,
    section_title: null,
  });
  const b = item("Papabones (600gr)", 189, "", {
    grams: 600,
    section_title: "Crispy Chicken",
  });
  const merged = mergeItemSources([[a], [b]], true);
  assertEquals(merged.length, 1);
});

Deno.test("tile twin fold folds conflicting non-null sections (eval 065: Boneless Jr)", () => {
  const a = item("Boneless Jr(200gr)", 132, "", {
    grams: 200,
    section_title: "Pollo Kids",
  });
  const b = item("Boneless Jr (200gr)", 99, "", {
    grams: 200,
    section_title: "Crispy Chicken",
  });
  const merged = mergeItemSources([[a], [b]], true);
  assertEquals(merged.length, 1);
});

Deno.test("tile twin fold never folds items with different grams (real size pairs)", () => {
  const a = item("Ensalada", 150, "", {
    grams: 150,
    section_title: "Sides",
  });
  const b = item("Ensalada", 220, "", {
    grams: 350,
    section_title: "Sides",
  });
  const merged = mergeItemSources([[a], [b]], true);
  assertEquals(merged.length, 2);
});

Deno.test("non-tile merge path keeps twin-fold candidates byte-identical", () => {
  const sourceA = [
    item("Nuggets", 89, "", { section_title: "Pollo Kids", grams: 200 }),
  ];
  const sourceB = [
    item("Nuggets", 99, "", { section_title: "Pollo Kids", grams: 200 }),
    item("Chicken-Little", 99, "", { section_title: "Pollo Kids", grams: 200 }),
    item("Nuggets de Coliflor", 99, "", {
      section_title: "Pollo Kids",
      grams: 200,
    }),
  ];
  assertEquals(
    mergeItemSources([sourceA, sourceB]),
    [...sourceA, ...sourceB],
  );
});

Deno.test("sectionLenient drops truncated same-price subset when full name exists", () => {
  const truncated = item("Buffalo", 150, "", {
    section_title: "Sandwiches & Hamburguesas",
    grams: 300,
  });
  const full = item("Boneless Buffalo", 150, "", {
    section_title: "Sandwiches & Hamburguesas",
    grams: 300,
  });
  assertEquals(mergeItemSources([[truncated], [full]], true), [full]);
});

Deno.test("sectionLenient drops multiple fragments when a fuller same-price name exists", () => {
  const cheesy = item("Cheesy", 159, "", {
    section_title: "Sandwiches & Hamburguesas",
    grams: 300,
  });
  const bacon = item("Bacon", 159, "", {
    section_title: "Sandwiches & Hamburguesas",
    grams: 300,
  });
  const full = item("Cheesey Bacon", 159, "", {
    section_title: "Sandwiches & Hamburguesas",
    grams: 300,
  });
  assertEquals(mergeItemSources([[cheesy], [bacon], [full]], true), [full]);
});

Deno.test("sectionLenient keeps same-section subset shape when prices differ", () => {
  const truncated = item("Buffalo", 150, "", {
    section_title: "Sandwiches & Hamburguesas",
    grams: 300,
  });
  const full = item("Boneless Buffalo", 159, "", {
    section_title: "Sandwiches & Hamburguesas",
    grams: 300,
  });
  assertEquals(mergeItemSources([[truncated], [full]], true).length, 2);
});

Deno.test("sectionLenient keeps same-source truncation candidates", () => {
  const truncated = item("Buffalo", 150, "", {
    section_title: "Sandwiches & Hamburguesas",
    grams: 300,
  });
  const full = item("Boneless Buffalo", 150, "", {
    section_title: "Sandwiches & Hamburguesas",
    grams: 300,
  });
  assertEquals(mergeItemSources([[truncated, full]], true), [truncated, full]);
});

Deno.test("sectionLenient keeps overlapping same-price names when neither is a subset", () => {
  const brasero = item("Taco Brasero", 120, "", {
    section_title: "Especialidades",
  });
  const tradicional = item("Taco Tradicional", 120, "", {
    section_title: "Especialidades",
  });
  assertEquals(mergeItemSources([[brasero], [tradicional]], true).length, 2);
});

Deno.test("sectionLenient folds null-grams exact-name butcher price twins", () => {
  const full = item("MISHIMA RESERVE WAGYU NEW YORK* GF", 155, "", {
    section_title: "BUTCHER'S BEST",
  });
  const truncated = item("MISHIMA RESERVE WAGYU NEW YORK* GF", 1, "", {
    section_title: "BUTCHER'S BEST",
  });
  assertEquals(mergeItemSources([[full], [truncated]], true), [full]);
});

Deno.test("sectionLenient folds null-grams butcher suffix price twins", () => {
  const full = item("40-DAY DRY AGED BONE-IN RIBEYE* 20oz", 145, "", {
    section_title: "BUTCHER'S BEST",
  });
  const suffix = item("40-DAY DRY AGED BONE-IN RIBEYE* 20oz GF", 14, "", {
    section_title: "BUTCHER'S BEST",
  });
  assertEquals(mergeItemSources([[full], [suffix]], true), [full]);
});

Deno.test("sectionLenient folds null-price butcher suffix twins", () => {
  const base = item("BUTCHER'S CUT*", null, "", {
    section_title: "BUTCHER'S BEST",
  });
  const suffix = item("BUTCHER'S CUT* GF", null, "", {
    section_title: "BUTCHER'S BEST",
  });
  assertEquals(mergeItemSources([[base], [suffix]], true).length, 1);
});

Deno.test("null-grams butcher folding keeps distinct names and is tile-only", () => {
  const ribeye = item("PRIME RIBEYE", 145, "", {
    section_title: "BUTCHER'S BEST",
  });
  const strip = item("NEW YORK STRIP", 155, "", {
    section_title: "BUTCHER'S BEST",
  });
  assertEquals(mergeItemSources([[ribeye], [strip]], true), [ribeye, strip]);

  const full = item("BUTCHER'S CUT*", 145, "", {
    section_title: "BUTCHER'S BEST",
  });
  const suffix = item("BUTCHER'S CUT* GF", 14, "", {
    section_title: "BUTCHER'S BEST",
  });
  assertEquals(mergeItemSources([[full], [suffix]]), [full, suffix]);
});
