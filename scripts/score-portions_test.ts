import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { scoreDishPortions } from "./score-portions.ts";

Deno.test("displacement is the share of dish mass on the wrong ingredient", () => {
  // The real CESAR case: the model's total is exactly right (200 g) and every
  // gram of error is in the split. A metric that only watched the total would
  // score this perfect, which is the whole reason displacement exists.
  const got = scoreDishPortions(
    [
      { name: "lettuce", grams: 60 },
      { name: "parmesan", grams: 15 },
      { name: "croutons", grams: 20 },
      { name: "chicken", grams: 75 },
      { name: "dressing", grams: 30 },
    ],
    [
      { name: "Lechuga", grams: 50 },
      { name: "Queso parmesano", grams: 20 },
      { name: "Croutones", grams: 30 },
      { name: "Pollo", grams: 80 },
      { name: "Aderezo", grams: 20 },
    ],
    "CESAR",
  );

  // |50-60| + |20-15| + |30-20| + |80-75| + |20-30| = 40 g of 200 g.
  assertEquals(got?.displacement, 0.2);
  assertEquals(got?.totalError, 0);
});

Deno.test("a count mismatch is unscorable, never silently misaligned", () => {
  // Alignment is positional. If the model drops or invents an ingredient, every
  // later row shifts and the metric would compare unrelated foods - so refuse.
  const got = scoreDishPortions(
    [{ name: "a", grams: 100 }, { name: "b", grams: 100 }],
    [{ name: "a", grams: 100 }],
    "x",
  );

  assertEquals(got, null);
});

Deno.test("totalError is signed so an under-portioned dish is distinguishable", () => {
  const got = scoreDishPortions(
    [{ name: "a", grams: 100 }],
    [{ name: "a", grams: 79 }],
    "x",
  );

  assertEquals(got?.totalError, -0.21);
  assertEquals(got?.displacement, 0.21);
});
