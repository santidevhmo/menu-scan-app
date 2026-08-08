import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { type MacroValues, scoreItem } from "./macro-score.ts";

const oracle: MacroValues = {
  calories: 530,
  protein_g: 38,
  carb_g: 45,
  fat_g: 22,
};

Deno.test("all four inside band => item passes", () => {
  const got = scoreItem(oracle, {
    calories: 505,
    protein_g: 34,
    carb_g: 52,
    fat_g: 19,
  });
  assertEquals(got.pass, true);
  assertEquals(got.fields.every((field) => field.pass), true);
});

Deno.test("calories outside 20% fails the item even when macros pass", () => {
  const got = scoreItem(oracle, {
    calories: 310,
    protein_g: 38,
    carb_g: 45,
    fat_g: 22,
  });
  assertEquals(got.pass, false);
  assertEquals(got.fields.find((field) => field.field === "calories")?.pass, false);
  assertEquals(got.fields.find((field) => field.field === "protein_g")?.pass, true);
});

Deno.test("calories band is 20% and macro band is 30% - boundary cases", () => {
  const onEdge = scoreItem(oracle, {
    calories: 530 * 1.2,
    protein_g: 38 * 1.3,
    carb_g: 45 * 0.7,
    fat_g: 22 * 0.7,
  });
  assertEquals(onEdge.pass, true);

  const justOver = scoreItem(oracle, {
    calories: 530 * 1.21,
    protein_g: 38,
    carb_g: 45,
    fat_g: 22,
  });
  assertEquals(justOver.pass, false);

  const macroSlack = scoreItem(oracle, {
    calories: 530,
    protein_g: 38 * 1.25,
    carb_g: 45,
    fat_g: 22,
  });
  assertEquals(macroSlack.pass, true);
});

Deno.test("zero oracle value uses the absolute 3g guard, not a percentage", () => {
  const zeroCarb: MacroValues = {
    calories: 400,
    protein_g: 40,
    carb_g: 0,
    fat_g: 20,
  };

  const within = scoreItem(zeroCarb, {
    calories: 400,
    protein_g: 40,
    carb_g: 3,
    fat_g: 20,
  });
  assertEquals(within.pass, true);
  assertEquals(within.fields.find((field) => field.field === "carb_g")?.deltaPct, null);

  const beyond = scoreItem(zeroCarb, {
    calories: 400,
    protein_g: 40,
    carb_g: 4,
    fat_g: 20,
  });
  assertEquals(beyond.pass, false);
});

Deno.test("verdicts report every field, in a stable order", () => {
  const got = scoreItem(oracle, oracle);
  assertEquals(got.fields.map((field) => field.field), [
    "calories",
    "protein_g",
    "carb_g",
    "fat_g",
  ]);
});
