import { assertEquals } from "jsr:@std/assert";
import { parseDrop } from "./sim-arm-significance.ts";

Deno.test("parseDrop returns an empty set when the flag is absent", () => {
  assertEquals(parseDrop(["dual", "NOBOOST"]).size, 0);
});

Deno.test("parseDrop reads a comma-separated list", () => {
  const d = parseDrop(["dual", "NOBOOST", "--drop=MARGARITA,PEPPERONI"]);
  assertEquals([...d].sort(), ["MARGARITA", "PEPPERONI"]);
});

Deno.test("parseDrop trims whitespace and ignores empty entries", () => {
  const d = parseDrop(["--drop=A, B ,"]);
  assertEquals([...d].sort(), ["A", "B"]);
});
