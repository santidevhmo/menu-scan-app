import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type FnddsRecord,
  gramsPerUnit,
  preferStandalone,
} from "./fndds-resolve.ts";

const rec = (desc: string, portions: [string, number][]): FnddsRecord => ({
  fdcId: 1,
  desc,
  dataType: "Survey (FNDDS)",
  per100g: { protein: 0, carb: 0, fat: 0 },
  portions: portions.map(([d, g]) => ({ desc: d, grams: g })),
});

Deno.test("gramsPerUnit reads a published portion", () => {
  const r = rec("Mayonnaise, regular", [["1 tablespoon", 13.8], ["1 cup", 220]]);
  assertEquals(gramsPerUnit(r, "tablespoon"), 13.8);
  assertEquals(gramsPerUnit(r, "cup"), 220);
});

Deno.test("gramsPerUnit divides out a leading count - '2 slices' at 60 g is 30 g each", () => {
  assertEquals(gramsPerUnit(rec("Bread", [["2 slices", 60]]), "slice"), 30);
});

Deno.test("gramsPerUnit returns null when the unit is not published", () => {
  // The real case that motivated constraint 4: rice "as ingredient" has no cup.
  const r = rec("Rice, white, cooked, as ingredient", [["1 fl oz (no ice)", 31]]);
  assertEquals(gramsPerUnit(r, "cup"), null);
});

Deno.test("gramsPerUnit does not match a unit inside another word", () => {
  // "scoop" contains no standalone "cup"; a substring match would wrongly hit.
  assertEquals(gramsPerUnit(rec("X", [["1 scoop", 50]]), "cup"), null);
});

Deno.test("preferStandalone ranks 'as ingredient' last", () => {
  const asIng = rec("Rice, white, cooked, as ingredient", []);
  const plain = rec("Rice, white, cooked", []);
  assertEquals(preferStandalone([asIng, plain]).map((r) => r.desc), [
    "Rice, white, cooked",
    "Rice, white, cooked, as ingredient",
  ]);
});
