import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyPortion, bestServingPortion } from "./probe-fndds-wholedish.ts";

Deno.test("a whole-dish serving is recognised as serving-level", () => {
  assertEquals(classifyPortion("1 serving"), "serving");
  assertEquals(classifyPortion("1 order"), "serving");
  assertEquals(classifyPortion("1 plate"), "serving");
  assertEquals(classifyPortion("1 medium pizza (11-12\")"), "serving");
  assertEquals(classifyPortion("1 taco"), "serving");
});

Deno.test("a volume measure is NOT a serving — this is the finding the probe exists for", () => {
  assertEquals(classifyPortion("1 cup"), "volume");
  assertEquals(classifyPortion("1 tablespoon"), "volume");
  assertEquals(classifyPortion("1 fl oz"), "volume");
});

Deno.test("countable units are their own class, not servings", () => {
  assertEquals(classifyPortion("1 slice"), "piece");
  assertEquals(classifyPortion("2 pieces"), "piece");
});

Deno.test("a bare weight carries no portion information", () => {
  assertEquals(classifyPortion("100 g"), "weight");
  assertEquals(classifyPortion("1 oz"), "weight");
});

Deno.test("bestServingPortion prefers a serving over a cup, and divides out a leading count", () => {
  const got = bestServingPortion([
    { desc: "1 cup", grams: 170 },
    { desc: "2 servings", grams: 600 },
  ]);
  assertEquals(got?.kind, "serving");
  assertEquals(got?.gramsPerUnit, 300);
});

Deno.test("bestServingPortion returns null when only volume measures are published", () => {
  assertEquals(
    bestServingPortion([{ desc: "1 cup", grams: 170 }, { desc: "1 tablespoon", grams: 15 }]),
    null,
  );
});
