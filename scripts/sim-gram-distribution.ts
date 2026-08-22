// $0. WHAT SIZE DID THE MODEL ACTUALLY GIVE EACH PLATE, AND DID ITS GRAM
// ANSWERS STOP BEING ROUND DEFAULTS?
//
// The score alone cannot tell an arm that changed the MECHANISM from an arm that
// moved the number for some other reason. Measured on the shipped `dual`
// archives 2026-08-21: of 140 ingredient gram answers, 71% are one of exactly
// 20/30/50/100 and 95% are multiples of 5 - a lookup of "one serving of that
// kind of food", not an estimate of a plate. This reads that distribution, plus
// each dish's total mass against the oracle's ruled band, for any archived arm.
//
//   deno run --allow-read scripts/sim-gram-distribution.ts dual ORDER PIECE
//
// Reads only `unweighted.<arm>-f.<menu>-d<draw>.raw.json`, the focused archives
// bench-unweighted writes. An arm with no archive is reported, never guessed at.
import type { UnweightedEntry } from "./unweighted-oracle.ts";

const ORACLE = "scripts/fixtures/unweighted-oracle.json";
const CACHE = "scripts/fixtures/caches";

const oracle: UnweightedEntry[] = JSON.parse(await Deno.readTextFile(ORACLE));
const arms = Deno.args.filter((a) => !a.startsWith("--"));
if (arms.length === 0) throw new Error("give at least one arm name");

// Menus DERIVED from the oracle, never hardcoded: three sims each silently
// reported a ceiling over 6 of 9 dishes because they pinned a menu list that
// never grew (eval 158).
const menus = [...new Set(oracle.map((e) => e.menu))];

for (const arm of arms) {
  const grams = new Map<string, number[]>();
  const answers: number[] = [];
  let missing = 0;

  for (const menu of menus) {
    for (let draw = 0; draw < 3; draw++) {
      let raw: string;
      try {
        raw = await Deno.readTextFile(
          `${CACHE}/unweighted.${arm}-f.${menu}-d${draw}.raw.json`,
        );
      } catch {
        missing++;
        continue;
      }
      for (const item of JSON.parse(raw).items) {
        if (!oracle.some((e) => e.name === item.name)) continue;
        // `typical_serving_g` is what every arm's runner writes back, whatever
        // the model's own key was called - so this reads the grams that actually
        // priced the macros, not the model's raw field.
        const ing = item.ingredients ?? [];
        // deno-lint-ignore no-explicit-any
        const each = ing.map((i: any) => i.typical_serving_g ?? 0);
        answers.push(...each);
        const list = grams.get(item.name) ?? [];
        list.push(Math.round(each.reduce((a: number, b: number) => a + b, 0)));
        grams.set(item.name, list);
      }
    }
  }

  console.log(`\n═══ ARM ${arm}`);
  if (answers.length === 0) {
    console.log("  no archive found - run the arm first");
    continue;
  }
  if (missing > 0) console.log(`  ⚠️  ${missing} menu-draw archives missing`);

  const round = answers.filter((v) => [20, 30, 50, 100].includes(v)).length;
  const mult5 = answers.filter((v) => v % 5 === 0).length;
  const pct = (n: number) => `${Math.round((100 * n) / answers.length)}%`;
  console.log(
    `  ${answers.length} ingredient gram answers  ` +
      `| 20/30/50/100: ${round} (${pct(round)})  ` +
      `| multiples of 5: ${mult5} (${pct(mult5)})`,
  );

  let low = 0, inBand = 0, high = 0;
  for (const e of oracle) {
    const got = grams.get(e.name) ?? [];
    const [lo, hi] = e.mass_band_g;
    const verdict = got.map((g) => g < lo ? "under" : g > hi ? "OVER" : "in");
    for (const v of verdict) {
      if (v === "under") low++;
      else if (v === "OVER") high++;
      else inBand++;
    }
    console.log(
      `    ${e.name.padEnd(18)} band ${String(`${lo}-${hi}`).padEnd(9)} ` +
        `got ${got.join("/").padEnd(14)} ${verdict.join(" ")}`,
    );
  }
  console.log(`  mass verdict: ${inBand} in band, ${high} OVER, ${low} under`);
}
