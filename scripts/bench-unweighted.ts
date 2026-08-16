// The unweighted-dish score: design §6. Four points per dish, one per macro, a
// macro passing when the estimate lands inside its band. Reported ALONGSIDE the
// 96-point weighted score and never merged into it - different dishes, different
// rule, and the weighted number would drown a 16-point signal anyway.
//
// Each dish is scored INSIDE ITS OWN MENU, not in a 4-item call. The 2026-08-12
// batch-size curve measured that batch composition moves the estimate (OSTRICA
// ~172 kcal at batch 3 against ~350 at batch 10), so enriching four fixtures
// alone would score a regime production never runs. The menus go through
// callGptEnrich at the deployed ENRICH_BATCH_SIZE and the four dishes are picked
// out of the result.
//
//   deno run --allow-net --allow-env --allow-read --allow-write \
//     --env-file=.env.local scripts/bench-unweighted.ts [draws] [arm]
//
// --replay scores the ARCHIVED responses of a previous run instead of paying for
// new ones, which is what makes an oracle correction free: a band moved after the
// fact re-scores every arm at $0. It calls no API and writes nothing.
//
//   deno run --allow-read scripts/bench-unweighted.ts 3 P --replay
import {
  callGptEnrich,
  chunk,
  ENRICH_BATCH_SIZE,
  ENRICH_MODEL,
  type EnrichedItem,
} from "../supabase/functions/analyze-menu/enrich.ts";
import { armA, armAConditional, armP, armPD, armPF } from "./probe-plate-arms.ts";
import { scoreItemAgainstBand } from "./macro-band-score.ts";
import type { UnweightedEntry } from "./unweighted-oracle.ts";
import { isBackfilled, itemsFromArchive } from "./bench-pipeline.ts";

const ORACLE = "scripts/fixtures/unweighted-oracle.json";
const CACHE_DIR = "scripts/fixtures/caches";

/** Which archived extraction each menu's items come from. Same files bench-pipeline uses. */
const MENU_ARCHIVE: Record<string, string> = {
  bistro: "bistro.eval117-r1.raw.json",
  andaluz: "andaluz.eval128-r1.raw.json",
  nikkori: "nikkori.eval117-r1.raw.json",
  polloteria: "polloteria.eval117-r1.raw.json",
};

const macros = (item: EnrichedItem) => ({
  calories: item.estimated_calories ?? 0,
  protein_g: item.protein_g ?? 0,
  carb_g: item.carb_g ?? 0,
  fat_g: item.fat_g ?? 0,
});

const replay = Deno.args.includes("--replay");
const positional = Deno.args.filter((a) => a !== "--replay");

const apiKey = Deno.env.get("OPENAI_API_KEY");
if (!apiKey && !replay) throw new Error("OPENAI_API_KEY is required");

const draws = Number(positional[0] ?? "3");
const arm = positional[1] ?? "baseline";

/**
 * Arm A, run through the SAME batching production uses. armA() sends every
 * unweighted item it receives in one call, so handing it a 121-item menu whole
 * would measure a regime neither production nor the baseline runs - and the
 * 2026-08-12 curve proved batch composition moves the answer. Chunking here
 * keeps the only difference between the arms the PROMPT.
 */
async function enrichWithArm(
  items: unknown[],
  // deno-lint-ignore no-explicit-any
  run: (batch: any) => Promise<unknown[]>,
): Promise<EnrichedItem[]> {
  const batches = chunk(items, ENRICH_BATCH_SIZE);
  const out: EnrichedItem[] = [];
  for (const batch of batches) {
    out.push(...await run(batch) as EnrichedItem[]);
  }
  return out;
}

/**
 * The archive to replay. The baseline's first run predates the arm segment in the
 * filename, so its files are `unweighted.<menu>-dN` with no arm - falling back to
 * that is what keeps the BASELINE replayable, and the baseline is the number every
 * arm is judged against.
 */
async function replayPath(arm: string, path: string): Promise<string> {
  try {
    await Deno.stat(path);
    return path;
  } catch {
    const legacy = path.replace(`unweighted.${arm}.`, "unweighted.");
    await Deno.stat(legacy); // throws with the real path if this run was never archived
    return legacy;
  }
}

const ARM_RUNNERS: Record<string, (batch: never) => Promise<unknown[]>> = {
  A: armA,
  "A-cond": armAConditional,
  P: armP,
  PF: armPF,
  PD: armPD,
};

// A mistyped arm name would otherwise run the BASELINE and be written up as that
// arm's result - a paid run reported as something it is not.
if (arm !== "baseline" && !(arm in ARM_RUNNERS)) {
  throw new Error(
    `unknown arm "${arm}" - expected baseline, ${Object.keys(ARM_RUNNERS).join(", ")}`,
  );
}
const oracle: UnweightedEntry[] = JSON.parse(await Deno.readTextFile(ORACLE));
const menus = [...new Set(oracle.map((e) => e.menu))];

// dish -> per-draw { points, fields }
const results = new Map<string, { points: number[]; detail: string[] }>();
for (const e of oracle) results.set(e.name, { points: [], detail: [] });

for (let draw = 0; draw < draws; draw++) {
  for (const menu of menus) {
    const archive = `${CACHE_DIR}/unweighted.${arm}.${menu}-d${draw}.raw.json`;
    let enriched: EnrichedItem[];
    if (replay) {
      enriched = JSON.parse(await Deno.readTextFile(await replayPath(arm, archive)))
        .items;
    } else {
      const items = itemsFromArchive(
        await Deno.readTextFile(`${CACHE_DIR}/${MENU_ARCHIVE[menu]}`),
      );
      const runner = ARM_RUNNERS[arm];
      enriched = runner
        // deno-lint-ignore no-explicit-any
        ? await enrichWithArm(items, runner as any)
        // deno-lint-ignore no-explicit-any
        : (await callGptEnrich(items as any, apiKey!, ENRICH_MODEL)).items;
      await Deno.writeTextFile(
        archive,
        JSON.stringify({ items: enriched }, null, 2) + "\n",
      );
    }

    for (const entry of oracle.filter((e) => e.menu === menu)) {
      const got = enriched.find((i) => i.name === entry.name);
      if (!got || isBackfilled(got)) {
        // A missing or BACKFILLED dish is a measurement defect, not an estimate.
        // The first run of this harness scored a timed-out batch as 0/4 and it
        // read as the model being catastrophically wrong about a salad; a
        // fallbackEnriched item is all zeros, which fails every band by
        // construction. Excluded from the score and reported instead.
        results.get(entry.name)!.detail.push(
          `draw ${draw + 1}: ${!got ? "ABSENT" : "BACKFILLED (API failure)"} - EXCLUDED`,
        );
        continue;
      }
      const { fields, pass } = scoreItemAgainstBand(entry.band, macros(got));
      const points = fields.filter((f) => f.pass).length;
      results.get(entry.name)!.points.push(points);
      results.get(entry.name)!.detail.push(
        `draw ${draw + 1}: ${points}/4 ${pass ? "PASS" : "FAIL"}  ` +
          fields.map((f) =>
            `${f.field}=${Math.round(f.model)}${f.pass ? "" : `(band ${f.band})`}`
          ).join(" "),
      );
    }
  }
}

let total = 0;
// Scored out of the draws that actually returned an estimate, so one API timeout
// does not silently deflate the headline number.
const scoredDraws = [...results.values()].reduce((n, r) => n + r.points.length, 0);
const possible = scoredDraws * 4;
console.log(
  `\nUNWEIGHTED SCORE - arm ${arm} - ${oracle.length} dishes x 4 macros x ${draws} draws, ` +
    `${scoredDraws} dish-draws scored = ${possible} points\n`,
);
for (const entry of oracle) {
  const r = results.get(entry.name)!;
  const sum = r.points.reduce((a, b) => a + b, 0);
  total += sum;
  const span = r.points.length === 0
    ? "no draws"
    : `${Math.min(...r.points)}-${Math.max(...r.points)}/4`;
  console.log(`${entry.name.padEnd(18)} ${String(sum).padStart(3)} pts   per-draw ${span}`);
  for (const line of r.detail) console.log(`    ${line}`);
}
console.log(
  `\nTOTAL ${total}/${possible} points in band (${Math.round(100 * total / possible)}%).` +
    (oracle.length < 6
      ? `\n⚠️  Only ${oracle.length} of the design's 6 dishes are ruled - NOT the full score.`
      : "") +
    `\n⚠️  Report alongside the 96-point weighted number, never merged into it.`,
);
