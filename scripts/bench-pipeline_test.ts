// $0, no network. Pins the integrity checks themselves — a detector that never
// fires is worse than none, because the run it clears is the run nobody rechecks.
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { inspect, renderReport } from "./bench-pipeline.ts";
import type {
  EnrichedItem,
  ExtractedItem,
} from "../supabase/functions/analyze-menu/enrich.ts";

const sent = (names: string[]): ExtractedItem[] =>
  names.map((name) => ({ name, description: "", price: null, category: "food" }));

const good = (name: string): EnrichedItem => ({
  name,
  description: "",
  price: null,
  category: "food",
  printed_total_g: null,
  ingredients: [{ name: "x", category: "protein" }],
  protein_g: 10,
  carb_g: 10,
  fat_g: 5,
  estimated_calories: 125,
  confidence: "high",
  allergens: ["dairy"],
} as unknown as EnrichedItem);

const backfilled = (name: string): EnrichedItem => ({
  name,
  description: "",
  price: null,
  category: "food",
  printed_total_g: null,
  ingredients: [],
  protein_g: 0,
  carb_g: 0,
  fat_g: 0,
  estimated_calories: 0,
  confidence: "low",
  allergens: [],
} as unknown as EnrichedItem);

Deno.test("a clean run reports order preserved and nothing dropped", () => {
  const items = sent(["A", "B"]);
  const r = inspect("m", "mdl", items, [good("A"), good("B")], 10);
  assertEquals(r.orderPreserved, true);
  assertEquals(r.backfilled, []);
  assertEquals(r.withAllergens, 2);
  assertEquals(r.returned, 2);
});

Deno.test("a dropped item is detected through its backfill shape", () => {
  const items = sent(["A", "B"]);
  const r = inspect("m", "mdl", items, [good("A"), backfilled("B")], 10);
  assertEquals(r.backfilled, ["B"]);
  assertEquals(r.returned, 2, "reassembly always returns one per input");
});

Deno.test("reordering is caught - the client re-ranks against input order", () => {
  const items = sent(["A", "B"]);
  const r = inspect("m", "mdl", items, [good("B"), good("A")], 10);
  assertEquals(r.orderPreserved, false);
  assertEquals(renderReport([r]).includes("BROKEN"), true);
});

Deno.test("a real item answering zero calories is not confused with a backfill", () => {
  const zero = { ...good("A"), estimated_calories: 0 };
  const r = inspect("m", "mdl", sent(["A"]), [zero], 10);
  assertEquals(r.backfilled, []);
  assertEquals(r.emptyMacros, ["A"]);
});
