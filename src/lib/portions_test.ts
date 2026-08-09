import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { portionSteps } from "./portions.ts";

Deno.test("an item served in pieces steps by one piece", () => {
  const { step, label } = portionSteps(8);

  assertEquals(step, 1 / 8);
  // The case the half-item stepper could not express at all: three slices of a
  // pizza is 3/8, which is not a multiple of 0.5.
  assertEquals(label(3 / 8), "3/8");
  assertEquals(label(1 / 8), "1/8");
  // A whole item reads as "all", not "8/8".
  assertEquals(label(1), "all");
});

Deno.test("piece labels survive floating-point accumulation", () => {
  // 1/3 + 1/3 + 1/3 is not exactly 1, and a diner must never see "2.9999/3".
  const { step, label } = portionSteps(3);
  const third = step;
  assertEquals(label(third + third), "2/3");
  assertEquals(label(third + third + third), "all");
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
  assertEquals(portionSteps(2).label(1 / 2), "1/2");
  assertEquals(portionSteps(3).label(2 / 3), "2/3");
  assertEquals(portionSteps(6).label(2 / 6), "2/6");
  assertEquals(portionSteps(12).label(5 / 12), "5/12");
});

Deno.test("a portion above a whole item does not read as a piece fraction", () => {
  // CodeRabbit, 2026-08-09: the + button has no ceiling, so two whole pizzas
  // rendered "16/8". Above one item the fraction stops meaning anything.
  const { label } = portionSteps(8);
  assertEquals(label(2), "x2");
  assertEquals(label(1.125), "x1.13");
  // At or below a whole item the piece form is unchanged.
  assertEquals(label(1), "all");
  assertEquals(label(3 / 8), "3/8");
});
