import { assertEquals } from "jsr:@std/assert";
import { mergeEntries } from "./unweighted-oracle-build.ts";
import type { UnweightedEntry } from "./unweighted-oracle.ts";

const entry = (name: string, cal: number): UnweightedEntry => ({
  name,
  menu: "bistro",
  unweighted: true,
  mass_band_g: [100, 200],
  band: {
    calories: [cal, cal],
    protein_g: [1, 1],
    carb_g: [1, 1],
    fat_g: [1, 1],
  },
  assumed: "test",
  source: "USDA FoodData Central",
  retrieved_at: "2026-08-22",
});

Deno.test("mergeEntries keeps dishes that are not in the drafts", () => {
  const merged = mergeEntries([entry("KEEP ME", 1)], [entry("NEW", 2)]);
  assertEquals(merged.map((e) => e.name), ["KEEP ME", "NEW"]);
});

Deno.test("mergeEntries overwrites a dish the drafts redefine, in place", () => {
  const merged = mergeEntries(
    [entry("A", 1), entry("B", 2)],
    [entry("B", 999)],
  );
  assertEquals(merged.map((e) => e.name), ["A", "B"]);
  assertEquals(merged[1].band.calories, [999, 999]);
});

Deno.test("mergeEntries on an empty existing oracle returns the drafts", () => {
  const merged = mergeEntries([], [entry("A", 1)]);
  assertEquals(merged.map((e) => e.name), ["A"]);
});
