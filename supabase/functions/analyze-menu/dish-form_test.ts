import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { applyFormMass, FORM_ENUM, FORM_G, LEGACY_FORMS } from "./dish-form.ts";

// The pizza split (eval 181) introduced two things that fail SILENTLY if broken:
// a legacy key that must resolve but must not be offered, and an ordering that
// encodes the physics. Neither throws; both just quietly produce wrong grams.

Deno.test("legacy pizza row still RESOLVES so archived replays keep sizing", () => {
  // Every archive from evals 174-180 labels its pizzas `pizza_whole_thin`. If this
  // key disappears, applyFormMass hits `if (!target) return it` and silently stops
  // sizing pizzas on replay - the $0 re-scoring the project runs on would be corrupt
  // and would look like a modelling regression rather than a missing table row.
  assertEquals(FORM_G.pizza_whole_thin, 425);
});

Deno.test("legacy pizza row is NOT offered to the model", () => {
  assert(LEGACY_FORMS.has("pizza_whole_thin"));
  assert(
    !FORM_ENUM.includes("pizza_whole_thin"),
    "a legacy row in the enum lets the model keep choosing the pre-split answer",
  );
  // and the real rows ARE offered
  for (const f of ["pizza_thin_cheese", "pizza_thin_meat_veg"]) {
    assert(FORM_ENUM.includes(f), `${f} must be choosable`);
  }
});

Deno.test("pizza rows respect the no-cheese floor and rise with topping load", () => {
  // FNDDS's no-cheese thin crust is 372 g at 28 cm. A pizza WITH cheese cannot weigh
  // less than one without - that floor is what pins PIZZA_SCALE, so a future retune
  // that pushes the cheese row under it has broken the derivation, not just a number.
  assert(
    FORM_G.pizza_thin_cheese >= 372,
    `cheese pizza ${FORM_G.pizza_thin_cheese} g is lighter than a bare crust (372 g)`,
  );
  const ladder = [
    FORM_G.pizza_thin_cheese,
    FORM_G.pizza_thin_extra_cheese,
    FORM_G.pizza_thin_pepperoni,
    FORM_G.pizza_thin_cheese_veg,
    FORM_G.pizza_thin_meat_veg,
  ];
  for (let i = 1; i < ladder.length; i++) {
    assert(ladder[i] > ladder[i - 1], `pizza rows out of order at ${i}: ${ladder}`);
  }
});

Deno.test("applyFormMass rescales a split pizza to its own row, not the legacy one", () => {
  const items = [{
    name: "CAPRICCIOSA",
    printed_total_g: null,
    ingredients: [
      { name: "crust", typical_serving_g: 200, protein_per_100g: 8, carb_per_100g: 50, fat_per_100g: 5 },
      { name: "ham", typical_serving_g: 50, protein_per_100g: 28, carb_per_100g: 0, fat_per_100g: 15 },
    ],
    // deno-lint-ignore no-explicit-any
  }] as any[];
  const out = applyFormMass(items, new Map([["CAPRICCIOSA", "pizza_thin_meat_veg"]]));
  const total = out[0].ingredients!.reduce(
    (s: number, i: { typical_serving_g?: number }) => s + (i.typical_serving_g ?? 0),
    0,
  );
  assertEquals(Math.round(total), FORM_G.pizza_thin_meat_veg);
  assert(Math.round(total) !== 425, "must not fall back to the legacy 425 g row");
});

Deno.test("an unknown or `other` form is left completely alone", () => {
  const ing = [{ name: "x", typical_serving_g: 100, protein_per_100g: 1, carb_per_100g: 1, fat_per_100g: 1 }];
  // deno-lint-ignore no-explicit-any
  const items = [{ name: "D", printed_total_g: null, ingredients: ing }] as any[];
  for (const form of ["other", "no_such_form"]) {
    const out = applyFormMass(items, new Map([["D", form]]));
    assertEquals(out[0].ingredients![0].typical_serving_g, 100, `${form} must not resize`);
  }
});
