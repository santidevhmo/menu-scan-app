import { assertEquals } from "jsr:@std/assert";
import type { ExtractedMenuItem } from "../supabase/functions/analyze-menu/extract.ts";
import { cleanForScore } from "./score-c-dumps.ts";

const item = (
  overrides: Partial<ExtractedMenuItem> = {},
): ExtractedMenuItem => ({
  name: "Item",
  description: "",
  price: 100,
  category: "food",
  section_title: null,
  options: [],
  grams: null,
  ...overrides,
});

Deno.test("cleanForScore applies C2 cleanup and records its rewrite and null audits", () => {
  const result = cleanForScore([
    item({ name: "POSTRES", section_title: "P O S T R E S" }),
    item({ name: "Note", category: "other", section_title: "P O S T R E S" }),
  ]);

  assertEquals(result.items, [item({ name: "POSTRES", section_title: null })]);
  assertEquals(result.rewrites, [
    "P O S T R E S → POSTRES",
    "P O S T R E S → POSTRES",
  ]);
  assertEquals(result.nulled, ["POSTRES | POSTRES → null"]);
});
