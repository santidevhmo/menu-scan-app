import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  BAND_TOLERANCE,
  deriveBands,
  validateEntry,
} from "./unweighted-oracle.ts";

// FDC 170715: pizza, meat and vegetable topping, regular crust.
const PIZZA = {
  protein_per_100g: 11.3,
  carb_per_100g: 25.1,
  fat_per_100g: 14.4,
};

Deno.test("macro bands are the AVERAGE dish, plus or minus the tolerance", () => {
  // Mass midpoint 500 g x composition, then +/-20% (Santiago, 2026-08-20).
  // Protein 56.5 -> 45-68, carb 125.5 -> 100-151, fat 72 -> 58-86.
  const bands = deriveBands([470, 530], PIZZA);
  assertEquals(bands.protein_g, [45, 68]);
  assertEquals(bands.carb_g, [100, 151]);
  assertEquals(bands.fat_g, [58, 86]);
  // Calories by Atwater from the SAME midpoint, never from a separate source.
  assertEquals(bands.calories, [1101, 1651]);
});

Deno.test("every band is exactly the tolerance wide, and they all match", () => {
  // Replaces "never wider than its mass band". That guard existed to stop a band
  // acquiring spread from nowhere; the rule it enforced - spread comes from the
  // MASS - is what Santiago's ruling deliberately replaced, because it handed
  // CAPRICCIOSA +/-6% and CARBONARA +/-29% for no stated reason.
  //
  // The equivalent guard under the new rule is stricter, not looser: every macro
  // must carry the SAME declared tolerance, so no band can be quietly widened for
  // one dish.
  //
  // Checked ENDPOINT BY ENDPOINT rather than as a width ratio. A ratio is the
  // wrong instrument here: whole-gram rounding moves a 58-86 band to 1.483 and a
  // 9-14 band to 1.556, so any ratio allowance loose enough for small macros would
  // be too loose to catch real extra spread on large ones. Each endpoint must sit
  // within half a gram of its exact value, which is exactly what rounding can do
  // and is magnitude-independent.
  for (const massBand of [[470, 530], [250, 450], [85, 120]] as const) {
    const midG = (massBand[0] + massBand[1]) / 2;
    const exact = {
      protein_g: midG * PIZZA.protein_per_100g / 100,
      carb_g: midG * PIZZA.carb_per_100g / 100,
      fat_g: midG * PIZZA.fat_per_100g / 100,
    };
    const bands = deriveBands([...massBand], PIZZA);
    for (const [macro, value] of Object.entries(exact)) {
      const [low, high] = bands[macro as keyof typeof exact];
      assertEquals(
        Math.abs(low - value * (1 - BAND_TOLERANCE)) <= 0.5 &&
          Math.abs(high - value * (1 + BAND_TOLERANCE)) <= 0.5,
        true,
        `${macro} band ${low}-${high} is not ${value.toFixed(1)} +/- ` +
          `${100 * BAND_TOLERANCE}% for mass ${massBand[0]}-${massBand[1]}`,
      );
    }
  }
});

Deno.test("the mass band no longer sets the tolerance", () => {
  // The point of the ruling, pinned: two dishes whose mass bands differ hugely
  // (11% vs 57% relative spread) must now be judged by the same bar.
  const narrow = deriveBands([470, 530], PIZZA);
  const wide = deriveBands([250, 450], PIZZA);
  const spread = ([lo, hi]: readonly number[]) => hi / lo;
  assertEquals(
    Math.abs(spread(narrow.fat_g) - spread(wide.fat_g)) < 0.02,
    true,
    `a 470-530 dish and a 250-450 dish must share a tolerance, got ` +
      `${spread(narrow.fat_g).toFixed(3)} and ${spread(wide.fat_g).toFixed(3)}`,
  );
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
