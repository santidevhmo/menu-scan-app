import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { findWeightedDishes, isPrintedWeight } from "./find-weighted-dishes.ts";

Deno.test("isPrintedWeight matches the notations these menus actually use", () => {
  // The three benchmark fixtures alone print all three of these forms, which is
  // why the pipeline asks the model to read the weight rather than regexing it.
  for (const t of ["CESAR (200 g)", "PASTEL AZTECA (300gr.)", "acompañado. 200g"]) {
    assertEquals(isPrintedWeight(t), true, t);
  }
  // A price or a year must not read as a weight.
  for (const t of ["Pizza Margherita $180", "since 1994", "2 chicken breasts"]) {
    assertEquals(isPrintedWeight(t), false, t);
  }
});

Deno.test("the archived corpus still yields candidate dishes", async () => {
  // Guards the widening workflow: if the dump format changes and this silently
  // returns nothing, the next fixture round would look like there is no corpus.
  const dishes = await findWeightedDishes();

  assertEquals(dishes.length > 50, true, `only found ${dishes.length}`);
  // CESAR is already a benchmark fixture and comes from this corpus, so it must
  // be discoverable by the same survey that finds its successors.
  assertEquals(
    dishes.some((d) => d.menu === "andaluz" && d.name.startsWith("CESAR")),
    true,
  );
});
