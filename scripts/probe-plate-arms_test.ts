// HYBRID's routing decision, without buying a run. The threshold is the whole
// arm: get it backwards and the paid run measures NOBOOST on big plates and the
// shipped prompt on small ones - the exact inverse of the mechanism, and it would
// still produce a plausible-looking score.
import { assert, assertEquals, assertExists } from "jsr:@std/assert@1";
import { HYBRID_T, hybridReaskIndices } from "./probe-plate-arms.ts";

// deno-lint-ignore no-explicit-any
const dish = (grams: number[], printed: number | null = null): any => ({
  printed_total_g: printed,
  ingredients: grams.map((g) => ({
    typical_serving_g: g,
    within_printed_weight: true,
  })),
});

Deno.test("re-asks the shipped question only at or above the threshold", () => {
  assertEquals(
    hybridReaskIndices([
      dish([50, 30]), //   80 g - a taco. NOBOOST keeps it.
      dish([200, 150]), // 350 g - a pizza. Shipped answer re-asked.
      dish([300]), //     300 g - exactly T, which is inclusive.
      dish([100, 199]), // 299 g - one gram under. NOBOOST keeps it.
    ]),
    [1, 2],
  );
});

Deno.test("threshold is 300 g and the boundary is inclusive", () => {
  assertEquals(HYBRID_T, 300);
  assertEquals(hybridReaskIndices([dish([HYBRID_T - 1])]), []);
  assertEquals(hybridReaskIndices([dish([HYBRID_T])]), [0]);
});

Deno.test("an empty or ingredient-less answer is never re-asked", () => {
  assertEquals(hybridReaskIndices([]), []);
  // deno-lint-ignore no-explicit-any
  assertEquals(hybridReaskIndices([{ printed_total_g: null } as any]), []);
});

Deno.test("routes on RESOLVED grams, so a printed weight rescales first", () => {
  // Ingredients sum to 100 g but the menu prints 400 g: resolveGrams fits them to
  // the printed total, so this is a big plate however small the raw numbers look.
  assertEquals(hybridReaskIndices([dish([60, 40], 400)]), [0]);
  assertEquals(hybridReaskIndices([dish([60, 40], 120)]), []);
});

Deno.test("NOBOOST-FORM is registered and is NOBOOST's prompt, not the shipped one", async () => {
  const bench = await import("./bench-unweighted.ts");
  const arms = (bench as unknown as { ARM_RUNNERS?: Record<string, unknown> })
    .ARM_RUNNERS;
  assertExists(arms, "bench-unweighted.ts must export ARM_RUNNERS for this test");
  assertExists(arms["NOBOOST-FORM"], "arm NOBOOST-FORM is not registered");

  // The whole point of the arm: NOBOOST's prompt, which is the shipped pass-2
  // sentence with the PUSH half removed and the RESTRAINT half kept.
  const { ARM_NOBOOST } = await import("./arm-order-schemas.ts");
  assert(
    !ARM_NOBOOST.prompt.includes("considerably greater quantity"),
    "the push clause survived — this would measure the shipped arm, not NOBOOST",
  );
  assert(
    ARM_NOBOOST.prompt.includes("served in on its own"),
    "the restraint clause is missing — this would measure NOPUSH, not NOBOOST",
  );
});
