import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { deriveBands, validateEntry } from "./unweighted-oracle.ts";

// FDC 170715: pizza, meat and vegetable topping, regular crust.
const PIZZA = {
  protein_per_100g: 11.3,
  carb_per_100g: 25.1,
  fat_per_100g: 14.4,
};

Deno.test("macro bands are the mass band times the composition", () => {
  const bands = deriveBands([470, 530], PIZZA);
  assertEquals(bands.protein_g, [53, 60]);
  assertEquals(bands.carb_g, [118, 133]);
  assertEquals(bands.fat_g, [68, 76]);
  // Calories by Atwater from the same endpoints, never from a separate source.
  assertEquals(bands.calories, [1293, 1459]);
});

Deno.test("a derived band is never meaningfully wider than its mass band", () => {
  // The whole point of deriving: uncertainty comes from the mass and nowhere
  // else, so no macro may claim more spread than the mass it came from.
  //
  // The 2% allowance is ROUNDING, not slack in the rule. Protein derives to
  // 53.11-59.89 and rounds to 53-60, whose ratio (1.1321) sits just above the
  // mass ratio (1.1277). Rounding to whole grams is what a human reads; the
  // rule is about the derivation, not the display.
  const massRatio = 530 / 470;
  const bands = deriveBands([470, 530], PIZZA);
  for (const [low, high] of Object.values(bands)) {
    if (low === 0) continue;
    assertEquals(
      high / low <= massRatio * 1.02,
      true,
      `band ${low}-${high} spreads wider than the mass band`,
    );
  }
});

Deno.test("a zero-composition field derives a zero band", () => {
  const bands = deriveBands([100, 200], {
    protein_per_100g: 0,
    carb_per_100g: 10,
    fat_per_100g: 0,
  });
  assertEquals(bands.protein_g, [0, 0]);
  assertEquals(bands.fat_g, [0, 0]);
});

const VALID = {
  name: "CAPRICCIOSA",
  menu: "bistro",
  unweighted: true,
  mass_band_g: [470, 530],
  band: deriveBands([470, 530], PIZZA),
  assumed:
    "28 cm stated on the menu; mass from FDC 173292 and 172047 scaled by area.",
  source: "USDA FoodData Central",
  retrieved_at: "2026-08-11",
};

Deno.test("a complete entry validates", () => {
  assertEquals(validateEntry(VALID), []);
});

Deno.test("a band whose low exceeds its high is rejected", () => {
  const problems = validateEntry({ ...VALID, mass_band_g: [530, 470] });
  assertEquals(problems.length > 0, true);
  assertEquals(problems.some((p) => p.includes("mass_band_g")), true);
});

Deno.test("non-positive endpoints are rejected", () => {
  assertEquals(
    validateEntry({ ...VALID, mass_band_g: [0, 530] }).length > 0,
    true,
  );
  assertEquals(
    validateEntry({ ...VALID, mass_band_g: [-1, 530] }).length > 0,
    true,
  );
});

Deno.test("an unweighted entry may not carry a printed weight", () => {
  // If a dish prints its weight it belongs in the 96-point weighted oracle,
  // where the mass is a fact rather than a band.
  const problems = validateEntry({ ...VALID, printed_total_g: 500 });
  assertEquals(problems.some((p) => p.includes("printed")), true);
});

Deno.test("a missing provenance field is rejected", () => {
  for (const key of ["assumed", "source", "retrieved_at", "menu", "name"]) {
    const entry = { ...VALID } as Record<string, unknown>;
    delete entry[key];
    assertEquals(
      validateEntry(entry).length > 0,
      true,
      `missing ${key} must be rejected`,
    );
  }
});
