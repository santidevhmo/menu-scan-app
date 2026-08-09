import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { modelGrams, scoreDishPortions } from "./score-portions.ts";

Deno.test("modelGrams derives B4 grams and still reads pre-B4 runs", () => {
  // Post-B4: servings sum to 250 inside a printed 200, so the two plate items
  // scale by 0.8 and the accompaniment passes through.
  assertEquals(
    modelGrams({
      printed_total_g: 200,
      ingredients: [
        { name: "a", within_printed_weight: true, typical_serving_g: 100 },
        { name: "b", within_printed_weight: true, typical_serving_g: 150 },
        { name: "side", within_printed_weight: false, typical_serving_g: 50 },
      ],
    }),
    [{ name: "a", grams: 80 }, { name: "b", grams: 120 }, { name: "side", grams: 50 }],
  );

  // Pre-B4 archived runs carry a literal grams and no printed_total_g. They must
  // keep scoring exactly as before or the five historical rows stop being
  // comparable to the new one.
  assertEquals(
    modelGrams({
      ingredients: [{ name: "a", grams: 50 }, { name: "b", grams: 30 }],
    }),
    [{ name: "a", grams: 50 }, { name: "b", grams: 30 }],
  );
});

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
