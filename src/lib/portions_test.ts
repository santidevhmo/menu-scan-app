import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { portionSteps } from "./portions.ts";

Deno.test("an item served in pieces steps by one piece", () => {
  const { step, label } = portionSteps(8);

  assertEquals(step, 1 / 8);
  // Santiago, 2026-08-11: the stepper reads as a plain piece count - "3", not
  // "3/8" - and opens at the whole order, so a pizza starts at 8. The case the
  // half-item stepper could not express at all is still the point: three slices
  // of a pizza is not a multiple of 0.5.
  assertEquals(label(3 / 8), "3");
  assertEquals(label(1 / 8), "1");
  assertEquals(label(1), "8");
});

Deno.test("piece labels survive floating-point accumulation", () => {
  // 1/3 + 1/3 + 1/3 is not exactly 1, and a diner must never see "2.9999".
  const { step, label } = portionSteps(3);
  const third = step;
  assertEquals(label(third + third), "2");
  assertEquals(label(third + third + third), "3");
});

Deno.test("anything not served in pieces keeps the half-item stepper", () => {
  for (const pieces of [null, undefined, 0, 1]) {
    const { step, label } = portionSteps(pieces);
    assertEquals(step, 0.5, `pieces=${pieces} must keep the half step`);
    assertEquals(label(0.5), "1/2");
    assertEquals(label(1), "x1");
    assertEquals(label(2), "x2");
  }
});

Deno.test("implausible piece counts fall back rather than produce nonsense", () => {
  // A model can return anything. None of these should reach the stepper.
  for (const bad of [-3, 1.5, 51, 1000, NaN, Infinity]) {
    assertEquals(
      portionSteps(bad).step,
      0.5,
      `pieces=${bad} must fall back to the half step`,
    );
  }
});

Deno.test("the real counts a menu states are handled", () => {
  // Observed on the archived menus: "(3 piezas)", "3 pzas", "orden de dos",
  // "Alitas 6 PZ", plus the conventional counts for pizza and nigiri.
  assertEquals(portionSteps(2).label(1 / 2), "1");
  assertEquals(portionSteps(3).label(2 / 3), "2");
  assertEquals(portionSteps(6).label(2 / 6), "2");
  assertEquals(portionSteps(12).label(5 / 12), "5");
});

Deno.test("the counter has no ceiling", () => {
  // The + button never stops. Two whole pizzas is sixteen slices, and under a
  // plain counter "16" is the right answer rather than the "16/8" CodeRabbit
  // caught in the fraction form on 2026-08-09.
  const { label } = portionSteps(8);
  assertEquals(label(2), "16");
  assertEquals(label(3), "24");
  assertEquals(label(1.125), "9");
});
