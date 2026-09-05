import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  ALLERGENS,
  canonicalAllergen,
  canonicalAllergens,
} from "../src/data/allergens.ts";

// eval 191. The bug these pin: VALID_ALLERGENS filters a user's selection to
// this list, so anything the model detects but the list omits is silently
// discarded — on the one filter that carries a safety disclaimer.

Deno.test("the three allergens the model already detects are selectable", () => {
  // sulfites (50 occurrences), coconut (31), mustard (10) across the archives.
  for (const value of ["sulfites", "coconut", "mustard"]) {
    assertEquals(
      ALLERGENS.some((a) => a.value === value),
      true,
      `${value} is emitted by the model but not selectable`,
    );
  }
});

Deno.test("pork is NOT an allergen, however often the model says it", () => {
  // 46 occurrences, and deliberately excluded: a restriction flags a dish,
  // an allergen HIDES it. Listing pork here would hide dishes from someone
  // who merely prefers to skip it.
  assertEquals(ALLERGENS.some((a) => a.value === "pork"), false);
  assertEquals(canonicalAllergen("pork"), null);
});

Deno.test("canonicalAllergen: prose near-misses map to the value we carry", () => {
  assertEquals(canonicalAllergen("peanut"), "peanuts");
  assertEquals(canonicalAllergen("tree nuts"), "nuts");
  assertEquals(canonicalAllergen("Tree Nuts"), "nuts");
  assertEquals(canonicalAllergen("  SULPHITES "), "sulfites");
  assertEquals(canonicalAllergen("milk"), "dairy");
  assertEquals(canonicalAllergen("wheat"), "gluten");
});

Deno.test("canonicalAllergen: 'none' is dropped, not carried as a value", () => {
  // The prompt says "do not include 'none'" and the model emits it 34 times.
  // Another entry for "ask in prose: 0 for 6".
  assertEquals(canonicalAllergen("none"), null);
  assertEquals(canonicalAllergen("None"), null);
  assertEquals(canonicalAllergen(""), null);
  assertEquals(canonicalAllergen("   "), null);
});

Deno.test("canonicalAllergen: an unknown string is dropped, never passed through", () => {
  // Passing it through would put a raw model string in front of a user and
  // could match a chip by accident.
  assertEquals(canonicalAllergen("dragonfruit"), null);
});

Deno.test("canonicalAllergens: de-duplicates once spellings collapse", () => {
  // The real failure: an item tagged both "peanut" and "peanuts" would show
  // the user "Peanuts, Peanuts".
  assertEquals(canonicalAllergens(["peanut", "peanuts"]), ["peanuts"]);
  assertEquals(canonicalAllergens(["tree nuts", "nuts", "none"]), ["nuts"]);
  assertEquals(canonicalAllergens([]), []);
});

Deno.test("canonicalAllergens: a selected chip matches its prose variant", () => {
  // End to end, this is what results.tsx does — and what silently failed
  // before: raw "peanut" never matched a selected "peanuts", so an allergen
  // dish was SHOWN rather than hidden.
  const selected = ["peanuts"];
  const itemAllergens = ["peanut", "dairy"];
  assertEquals(
    canonicalAllergens(itemAllergens).some((a) => selected.includes(a)),
    true,
  );
  // And the pre-fix behaviour, kept as the reason this exists:
  assertEquals(itemAllergens.some((a) => selected.includes(a)), false);
});

Deno.test("every ALLERGENS value is its own canonical form", () => {
  // An alias pointing at a value that does not exist, or a value that an alias
  // rewrites, would make matching depend on which spelling arrived first.
  for (const { value } of ALLERGENS) {
    assertEquals(canonicalAllergen(value), value, `${value} is not canonical`);
  }
});
