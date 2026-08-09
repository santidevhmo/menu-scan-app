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

Deno.test("a sub-3g oracle value uses the absolute guard, and still reports the delta", () => {
  // NEW YORK's real shape: a steak whose entire carb figure is garnish parsley.
  // At +/-30% the band would be 0.58-1.07g and "0" - the honest answer for a
  // steak - would fail on a difference no diner could perceive.
  const steak: MacroValues = {
    calories: 1258,
    protein_g: 103,
    carb_g: 0.82,
    fat_g: 94,
  };

  const saysZero = scoreItem(steak, { ...steak, carb_g: 0 });
  assertEquals(saysZero.pass, true);
  // The size of the miss is still information, even where it is not the rule.
  assertEquals(saysZero.fields.find((f) => f.field === "carb_g")?.deltaPct, -1);

  // The floor is an allowance, not an amnesty - 4g away still fails.
  assertEquals(scoreItem(steak, { ...steak, carb_g: 4 }).pass, false);

  // Above the floor the percentage band applies - but so does the 5g absolute
  // allowance, so a 1.1g miss no longer fails on a 37% ratio.
  const atFloor: MacroValues = { ...steak, carb_g: 3 };
  assertEquals(scoreItem(atFloor, { ...atFloor, carb_g: 3.9 }).pass, true);
  assertEquals(scoreItem(atFloor, { ...atFloor, carb_g: 4.1 }).pass, true);
});

Deno.test("a gram field passes on a small ABSOLUTE miss, whatever the percentage", () => {
  // Santiago 2026-08-09: "if something has 20 grams and the model says 15,
  // that's only five grams - it's not that different." A ratio grades noise on
  // small quantities; this rule keys off the DIFFERENCE, not the oracle value.
  const dish: MacroValues = { calories: 400, protein_g: 10, carb_g: 40, fat_g: 20 };

  // +40% but only 4g of food - forgiven.
  assertEquals(scoreItem(dish, { ...dish, protein_g: 14 }).pass, true);
  // Same +40% on a large quantity is 16g of food - still fails.
  assertEquals(scoreItem(dish, { ...dish, carb_g: 56 }).pass, false);
  // The allowance is 6g, not amnesty: 8g over on a 9.3g oracle still fails.
  const gnocchi: MacroValues = { ...dish, protein_g: 9.3 };
  assertEquals(scoreItem(gnocchi, { ...gnocchi, protein_g: 17.3 }).pass, false);
  // 5.2g over on the same oracle is +56% and now forgiven - that is the point.
  assertEquals(scoreItem(gnocchi, { ...gnocchi, protein_g: 14.5 }).pass, true);

  // Calories carry their own allowance (Santiago: "the 40 cal ... difference is
  // tolerable"), so a small absolute miss passes and a large one still fails.
  assertEquals(scoreItem(dish, { ...dish, calories: 404 }).pass, true); // +1%, band
  assertEquals(scoreItem(dish, { ...dish, calories: 440 }).pass, true); // +10%, band
  assertEquals(scoreItem(dish, { ...dish, calories: 448 }).pass, true); // +12%, 48 kcal
  assertEquals(scoreItem(dish, { ...dish, calories: 500 }).pass, false); // +25%, 100 kcal

  // A field forgiven by grams still reports its real percentage, so mean |error|
  // stays comparable with every figure recorded before this rule existed.
  const forgiven = scoreItem(dish, { ...dish, protein_g: 14 });
  const protein = forgiven.fields.find((f) => f.field === "protein_g");
  assertEquals(protein?.pass, true);
  assertEquals(protein?.absolute, false);
  assertEquals(Math.round((protein?.deltaPct ?? 0) * 100), 40);
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
