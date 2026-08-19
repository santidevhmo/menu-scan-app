import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { type MacroBands, scoreItemAgainstBand } from "./macro-band-score.ts";

// The Capricciosa's real band, from the 2026-08-11 spec.
const CAPRICCIOSA: MacroBands = {
  calories: [1250, 1490],
  protein_g: [50, 64],
  carb_g: [112, 140],
  fat_g: [63, 80],
};

Deno.test("a value inside its band passes", () => {
  const { fields, pass } = scoreItemAgainstBand(CAPRICCIOSA, {
    calories: 1380,
    protein_g: 57,
    carb_g: 126,
    fat_g: 72,
  });
  assertEquals(pass, true);
  assertEquals(fields.filter((f) => f.pass).length, 4);
});

Deno.test("the endpoints are INSIDE the band", () => {
  // A band is inclusive. An estimate that lands exactly on a published USDA
  // portion weight must not fail for landing on it.
  const low = scoreItemAgainstBand(CAPRICCIOSA, {
    calories: 1250,
    protein_g: 50,
    carb_g: 112,
    fat_g: 63,
  });
  const high = scoreItemAgainstBand(CAPRICCIOSA, {
    calories: 1490,
    protein_g: 64,
    carb_g: 140,
    fat_g: 80,
  });
  assertEquals(low.pass, true);
  assertEquals(high.pass, true);
});

Deno.test("one unit outside either endpoint fails that field only", () => {
  const { fields, pass } = scoreItemAgainstBand(CAPRICCIOSA, {
    calories: 1249,
    protein_g: 57,
    carb_g: 126,
    fat_g: 81,
  });
  assertEquals(pass, false);
  assertEquals(fields.find((f) => f.field === "calories")?.pass, false);
  assertEquals(fields.find((f) => f.field === "fat_g")?.pass, false);
  assertEquals(fields.find((f) => f.field === "protein_g")?.pass, true);
  assertEquals(fields.find((f) => f.field === "carb_g")?.pass, true);
});

Deno.test("what the app actually returned for the Capricciosa fails every field", () => {
  // 517 kcal / P26 C57 F21 - the defect that motivated this oracle. If any
  // widening of a band ever lets this pass, the band is wrong.
  const { fields, pass } = scoreItemAgainstBand(CAPRICCIOSA, {
    calories: 517,
    protein_g: 26,
    carb_g: 57,
    fat_g: 21,
  });
  assertEquals(pass, false);
  assertEquals(fields.filter((f) => f.pass).length, 0);
});

Deno.test("a broken answer is never forgiven", () => {
  // Same rule as the percentage scorer: a negative or non-finite number does
  // not describe food, so no band contains it.
  for (const bad of [-1, NaN, Infinity]) {
    const { fields } = scoreItemAgainstBand(CAPRICCIOSA, {
      calories: bad,
      protein_g: 57,
      carb_g: 126,
      fat_g: 72,
    });
    const calories = fields.find((f) => f.field === "calories")!;
    assertEquals(calories.pass, false, `${bad} must fail`);
    assertEquals(calories.band, "invalid");
  }
});

Deno.test("the reported oracle value is the band midpoint", () => {
  // FieldVerdict carries a single number. The midpoint is the only honest
  // one-number summary of a band, and deltaPct is measured against it.
  const { fields } = scoreItemAgainstBand(CAPRICCIOSA, {
    calories: 1370,
    protein_g: 57,
    carb_g: 126,
    fat_g: 72,
  });
  const calories = fields.find((f) => f.field === "calories")!;
  assertEquals(calories.oracle, 1370);
  assertEquals(calories.deltaPct, 0);
  assertEquals(calories.band, "1250-1490");
});
