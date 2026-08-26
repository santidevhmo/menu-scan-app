// $0 SANITY CHECK: could FNDDS's published whole-dish portions replace FORM_G?
//
// ⚠️ THIS IS NOT THE SHAPE EVAL 179 REJECTED. That one DECOMPOSED a dish into
// ingredients and looked each one up, and both its arms lost to FORM. This looks up
// the DISH ITSELF - the shape Menu-Match (WACV 2015) supports and the one FORM
// already implements, just with 24 handwritten rows instead of thousands of
// published ones. Decomposition failing says nothing about it.
//
// ⚠️ NEVER IN THE SCAN PATH. 1,000 req/hour PER IP; a cold scan is ~304 calls.
// Offline probing only - production would ship the CC0 bulk download.
import type { Portion } from "./fndds-resolve.ts";

export type PortionKind = "serving" | "volume" | "piece" | "weight";

// Order matters: "1 medium pizza" must read as a serving before "piece" gets a
// chance at it, and "1 fl oz" must read as volume before "oz" makes it a weight.
const PATTERNS: [PortionKind, RegExp][] = [
  ["serving", /\b(servings?|order|plate|meal|entree|sandwich|burrito|taco|pizza|roll|bowl|burger|wrap)\b/],
  ["volume", /\b(cup|tablespoon|tbsp|teaspoon|tsp|fl\.? ?oz|fluid ounce|pint|quart|liter|litre|ml)\b/],
  ["piece", /\b(piece|pieces|slice|slices|pc|each|item|unit|link|patty|leaf|clove|fillet|filet|breast|wing)\b/],
];

/** What KIND of thing a published portion string measures. */
export function classifyPortion(desc: string): PortionKind {
  const d = desc.toLowerCase();
  for (const [kind, re] of PATTERNS) if (re.test(d)) return kind;
  return "weight";
}

export interface ServingPortion {
  desc: string;
  kind: PortionKind;
  gramsPerUnit: number;
}

/**
 * The best serving-level portion a record publishes, or null if it publishes none.
 *
 * A leading count is divided back out - "2 servings, 600 g" is 300 g per serving -
 * the same rule `gramsPerUnit` in fndds-resolve.ts already applies.
 */
export function bestServingPortion(portions: Portion[]): ServingPortion | null {
  for (const p of portions) {
    if (classifyPortion(p.desc) !== "serving") continue;
    const lead = p.desc.trim().match(/^(\d+(?:\.\d+)?)/);
    const count = lead ? parseFloat(lead[1]) : 1;
    if (count > 0) {
      return { desc: p.desc, kind: "serving", gramsPerUnit: p.grams / count };
    }
  }
  return null;
}
