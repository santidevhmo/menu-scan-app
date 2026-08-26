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

import {
  food,
  loadCache,
  preferStandalone,
  saveCache,
  shortlist,
} from "./fndds-resolve.ts";

interface OracleEntry {
  name: string;
  menu: string;
  mass_band_g: [number, number];
}

if (import.meta.main) {
  await loadCache();
  const oracle: OracleEntry[] = JSON.parse(
    await Deno.readTextFile("scripts/fixtures/unweighted-oracle.json"),
  );
  const terms: Record<string, string> = JSON.parse(
    await Deno.readTextFile("scripts/fixtures/fndds-dish-terms.json"),
  );

  const rows: Record<string, unknown>[] = [];
  for (const e of oracle) {
    const term = (terms[e.name] ?? "").trim();
    if (!term) {
      rows.push({ dish: e.name, term: null, outcome: "NO_TERM" });
      continue;
    }
    // Up to 5 candidates, standalone records preferred - constraint 4 in
    // fndds-resolve.ts: "as ingredient" records carry the worse portion table.
    const ids = await shortlist(term, 5);
    const recs = preferStandalone(
      (await Promise.all(ids.map((id) => food(id))))
        .filter((r): r is NonNullable<typeof r> => r !== null),
    );
    if (recs.length === 0) {
      rows.push({ dish: e.name, term, outcome: "NO_RECORD" });
      continue;
    }
    const head = recs[0];
    const serving = bestServingPortion(head.portions);
    const [lo, hi] = e.mass_band_g;
    rows.push({
      dish: e.name,
      term,
      fdcId: head.fdcId,
      record: head.desc,
      dataType: head.dataType,
      // EVERY published portion, not just the chosen one. The DISTRIBUTION of
      // portion kinds is the finding; a single number would hide it.
      portions: head.portions.map((p) => ({
        desc: p.desc,
        grams: p.grams,
        kind: classifyPortion(p.desc),
      })),
      serving_g: serving?.gramsPerUnit ?? null,
      serving_desc: serving?.desc ?? null,
      band: [lo, hi],
      outcome: !serving
        ? "VOLUME_ONLY"
        : serving.gramsPerUnit >= lo && serving.gramsPerUnit <= hi
        ? "IN_BAND"
        : serving.gramsPerUnit < lo
        ? "UNDER"
        : "OVER",
    });
    console.error(`  ${e.name} -> ${head.desc}`);
  }
  await saveCache();

  const tally: Record<string, number> = {};
  for (const r of rows) tally[String(r.outcome)] = (tally[String(r.outcome)] ?? 0) + 1;

  console.log("\n=== FNDDS WHOLE-DISH SANITY CHECK ===");
  console.log(`${oracle.length} oracle dishes\n`);
  console.log("A. COVERAGE — did we get a record at all?");
  console.log(`   no search term written : ${tally.NO_TERM ?? 0}`);
  console.log(`   no record found        : ${tally.NO_RECORD ?? 0}`);
  const withRec = oracle.length - (tally.NO_TERM ?? 0) - (tally.NO_RECORD ?? 0);
  console.log(`   record found           : ${withRec}`);

  console.log("\nB. UNITS — does it publish a SERVING, or only volume measures?");
  console.log(`   volume/piece only      : ${tally.VOLUME_ONLY ?? 0}`);
  const withServing = withRec - (tally.VOLUME_ONLY ?? 0);
  console.log(`   serving-level portion  : ${withServing}`);
  console.log("   🔑 If this line is small, the idea inherits eval 179's unit problem.");

  console.log("\nC. ACCURACY — of those, how many land in the ruled mass band?");
  console.log(`   IN BAND                : ${tally.IN_BAND ?? 0}`);
  console.log(`   under                  : ${tally.UNDER ?? 0}`);
  console.log(`   over                   : ${tally.OVER ?? 0}`);
  console.log(
    `\n   FNDDS in-band rate     : ${tally.IN_BAND ?? 0}/${withServing}` +
      ` of dishes it can size`,
  );
  console.log("   COMPARE: FORM_G is 48/57. Re-derive with sim-form-table.ts.");

  await Deno.writeTextFile(
    "scripts/fixtures/fndds-wholedish-report.json",
    JSON.stringify(rows, null, 2) + "\n",
  );
  console.log("\nwrote scripts/fixtures/fndds-wholedish-report.json");
}
