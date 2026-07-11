import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { mergeItemSources } from "./merge.ts";
import type { ExtractedMenuItem } from "./extract.ts";

const item = (
  name: string,
  price: number | null,
  description = "",
): ExtractedMenuItem => ({
  name,
  description,
  price,
  category: "food",
  section_title: "Rollos",
  options: [],
  grams: null,
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
