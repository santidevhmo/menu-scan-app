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
// --run <label> keeps a repeat run in its OWN archives instead of overwriting the
// previous one, and --replay --run <label> re-scores it:
//   ... scripts/bench-unweighted.ts 3 NOBOOST --run r2
//
// --replay scores the ARCHIVED responses of a previous run instead of paying for
// new ones, which is what makes an oracle correction free: a band moved after the
// fact re-scores every arm at $0. It calls no API and writes nothing.
//
//   deno run --allow-read scripts/bench-unweighted.ts 3 P --replay
import {
  callGptEnrich,
  callGptEnrichDualPass,
  chunk,
  ENRICH_BATCH_SIZE,
  ENRICH_MODEL,
  type EnrichedItem,
} from "../supabase/functions/analyze-menu/enrich.ts";
import {
  armA,
  armAConditional,
  armMassCall,
  armHybrid,
  armNoBoost,
  armNoPush,
  armOrder,
  armOrderNoPush,
  armP,
  armP10,
  armPD,
  armPF,
  armPiece,
  armPInline,
  armRole,
  armS3,
  armS4,
  armSplitOnly,
} from "./probe-plate-arms.ts";
import { scoreItemAgainstBand } from "./macro-band-score.ts";
import type { UnweightedEntry } from "./unweighted-oracle.ts";
import {
  assertRunIsProducingData,
  isBackfilled,
  itemsFromArchiveFile,
} from "./bench-pipeline.ts";

const ORACLE = "scripts/fixtures/unweighted-oracle.json";
const CACHE_DIR = "scripts/fixtures/caches";

/**
 * Which archived extraction each menu's items come from. Same files bench-pipeline uses.
 *
 * `el-marcos` and `brasero-two` were added 2026-08-20 with the four new fixtures
 * (OMELETTE CUBANA, TACO PORCO, BROWNIE). They use the same `eval103c-m41-r1`
 * extraction the MIXED-MENU harness already reads for el-marcos, so both harnesses
 * see one menu through one archive and cannot disagree about its neighbours.
 */
const MENU_ARCHIVE: Record<string, string> = {
  bistro: "bistro.eval117-r1.raw.json",
  andaluz: "andaluz.eval128-r1.raw.json",
  nikkori: "nikkori.eval117-r1.raw.json",
  "el-marcos": "el-marcos.eval103c-m41-r1.raw.json",
  "brasero-two": "brasero-two.eval117-r1.raw.json",
  polloteria: "polloteria.eval117-r1.raw.json",
};

/**
 * Only the batches the scored dishes land in.
 *
 * Same reasoning and same $0 saving as scripts/bench-mixed-menu.ts: callGptEnrich
 * chunks sequentially and fires each batch as its OWN request, so a scored dish
 * is influenced only by the <=9 items sharing its call. Batches are located in
 * the WHOLE menu first, so the chunk boundaries stay exactly production's, and
 * the request bytes for a scored dish are identical either way.
 *
 * --full-menu restores whole menus for load behaviour (concurrency, rescue),
 * which is bench-pipeline.ts's job rather than this harness's.
 */
function fixtureBatches(
  // deno-lint-ignore no-explicit-any
  items: any[],
  names: string[],
  // deno-lint-ignore no-explicit-any
): any[] {
  const wanted = new Set<number>();
  for (const name of names) {
    const idx = items.findIndex((i) => i.name === name);
    // A dish absent from its own archived extraction is a real defect, and the
    // per-dish loop below already reports it as ABSENT - so skip rather than
    // throw, and let the score record it.
    if (idx >= 0) wanted.add(Math.floor(idx / ENRICH_BATCH_SIZE));
  }
  return [...wanted].sort((a, b) => a - b).flatMap((b) =>
    items.slice(b * ENRICH_BATCH_SIZE, (b + 1) * ENRICH_BATCH_SIZE)
  );
}

/**
 * The same idea for Arm P-10, whose batches form AFTER the weighted/unweighted
 * partition — so a scored dish's mates are its neighbours in the UNWEIGHTED-only
 * list, not in the mixed menu. Selecting with the mixed boundaries would send a
 * composition P-10 never builds, and the run would quietly measure Arm P.
 *
 * Only unweighted items are returned: every dish in this oracle is unweighted by
 * definition, and under P-10 the weighted half is a separate set of calls that
 * cannot influence them.
 */
function fixtureBatchesP10(
  // deno-lint-ignore no-explicit-any
  items: any[],
  names: string[],
  // deno-lint-ignore no-explicit-any
): any[] {
  const unweighted = items.filter((i) => i.grams == null);
  const wanted = new Set<number>();
  for (const name of names) {
    const idx = unweighted.findIndex((i) => i.name === name);
    if (idx >= 0) wanted.add(Math.floor(idx / ENRICH_BATCH_SIZE));
  }
  return [...wanted].sort((a, b) => a - b).flatMap((b) =>
    unweighted.slice(b * ENRICH_BATCH_SIZE, (b + 1) * ENRICH_BATCH_SIZE)
  );
}

const macros = (item: EnrichedItem) => ({
  calories: item.estimated_calories ?? 0,
  protein_g: item.protein_g ?? 0,
  carb_g: item.carb_g ?? 0,
  fat_g: item.fat_g ?? 0,
});

const replay = Deno.args.includes("--replay");
// Default is FOCUSED - see fixtureBatches. ~$2 -> ~$0.5 per arm, same measurement.
const fullMenu = Deno.args.includes("--full-menu");
// Repeat runs need their OWN archives or a range is impossible - and the standing
// rule is a range, never a single run. Ported from bench-mixed-menu.ts, which grew
// this after a re-run silently replaced its predecessor twice in one phase.
const runIdx = Deno.args.indexOf("--run");
const runLabel = runIdx >= 0 ? Deno.args[runIdx + 1] : "";
if (runIdx >= 0 && (!runLabel || runLabel.startsWith("--"))) {
  throw new Error("--run needs a label, e.g. --run r2");
}
// Drops every flag AND the value after --run, or the label would be read as the
// arm name and a paid run would be reported as something it is not.
const positional = Deno.args.filter((a, i) =>
  !a.startsWith("--") && Deno.args[i - 1] !== "--run"
);

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
  Pinline: armPInline,
  SplitOnly: armSplitOnly,
  S3: armS3,
  S4: armS4,
  // What the per-ingredient GRAM FIELD asks for. See arm-order-schemas.ts.
  ORDER: armOrder,
  "ORDER-nopush": armOrderNoPush,
  PIECE: armPiece,
  // The shipped question with pass 2's WHOLE addendum deleted. See ARM_NOPUSH.
  NOPUSH: armNoPush,
  // The shipped question with only the addendum's PUSH half deleted. See ARM_NOBOOST.
  NOBOOST: armNoBoost,
  // Both stack on NOBOOST, one variable each: ROLE adds an inert enum before the
  // gram field, MASSCALL rescales to a total from a second call. See ARM_ROLE and
  // ARM_MASSCALL. Their control is NOBOOST (70 and 72), not `dual`.
  ROLE: armRole,
  MASSCALL: armMassCall,
  // eval 171. Not a prompt or schema change - a ROUTER. Asks with NOBOOST's
  // prompt, then re-asks the SHIPPED question for only the items NOBOOST sized at
  // or above 300 g, because the size error runs in BOTH directions and every
  // single-direction arm above is rejected. See armHybrid.
  HYBRID: armHybrid,
};

/** Arms whose batches form like dual's pass 2 - see the selection call below. */
const ORDER_ARMS: Record<string, true> = {
  ORDER: true,
  "ORDER-nopush": true,
  PIECE: true,
  NOPUSH: true,
  NOBOOST: true,
  ROLE: true,
  MASSCALL: true,
  HYBRID: true,
};

// A mistyped arm name would otherwise run the BASELINE and be written up as that
// arm's result - a paid run reported as something it is not.
if (
  arm !== "baseline" && arm !== "P10" && arm !== "dual" && !(arm in ARM_RUNNERS)
) {
  throw new Error(
    `unknown arm "${arm}" - expected baseline, P10, dual, ${
      Object.keys(ARM_RUNNERS).join(", ")
    }`,
  );
}
const oracle: UnweightedEntry[] = JSON.parse(await Deno.readTextFile(ORACLE));
const menus = [...new Set(oracle.map((e) => e.menu))];

// dish -> per-draw { points, fields }
const results = new Map<string, { points: number[]; detail: string[] }>();
for (const e of oracle) results.set(e.name, { points: [], detail: [] });

for (let draw = 0; draw < draws; draw++) {
  for (const menu of menus) {
    // The `-f` segment keeps a ~$0.5 focused run from OVERWRITING the whole-menu
    // archives that hold this phase's published evidence (the 28/72 baseline and
    // Arm P's 37/72). Replaying those needs --full-menu.
    const archive = `${CACHE_DIR}/unweighted.${arm}${fullMenu ? "" : "-f"}${
      runLabel ? `-${runLabel}` : ""
    }.${menu}-d${draw}.raw.json`;
    let enriched: EnrichedItem[];
    if (replay) {
      // A menu with NO archive is skipped and reported, never thrown on.
      //
      // WHY: adding OMELETTE CUBANA, TACO PORCO and BROWNIE on 2026-08-20 brought
      // in two menus (el-marcos, brasero-two) that no unweighted run has ever
      // enriched — and a throw here took the $0 REPLAY down for every arm at once,
      // including the baseline every arm is judged against. Replay is the cheapest
      // tool in this phase and the one that killed three fixes for nothing, so it
      // must degrade to a PARTIAL score rather than die. The per-dish loop already
      // reports a missing dish as ABSENT, so this follows a convention that exists.
      let raw: string;
      try {
        raw = await Deno.readTextFile(await replayPath(arm, archive));
      } catch {
        console.log(
          `  ⏭  ${menu} draw ${
            draw + 1
          }: no archive for arm "${arm}" — SKIPPED, ` +
            `so its dishes score 0. Run the arm to cover them.`,
        );
        continue;
      }
      enriched = JSON.parse(raw).items;
    } else {
      const whole = itemsFromArchiveFile(MENU_ARCHIVE[menu]);
      const names = oracle.filter((e) => e.menu === menu).map((e) => e.name);
      // `dual` selects like P-10 ON PURPOSE. Every dish in this oracle is
      // unweighted, so its answer comes ENTIRELY from pass 2 and pass 1's copy is
      // discarded - and pass 2 chunks the unweighted-only list at
      // ENRICH_BATCH_SIZE, which is exactly what fixtureBatchesP10 builds. Using
      // the mixed selection would hand pass 2 a SMALLER batch than production
      // sends, and batch size is known to move this score.
      //
      // That makes `dual` vs `P10` a clean one-variable comparison: same prompt
      // (md5-identical), same batch composition, differing only in the REQUEST
      // ENVELOPE - probe-plate-arms.ts's callOpenAI puts the prompt in a `system`
      // message and wraps the items as {"items":[...]}, while enrichBatch (this
      // arm, and production) sends ONE `user` message with the items appended.
      // The 38/72 on record was measured through the former, never the latter.
      // ORDER/ORDER-nopush/PIECE select like P-10 for the same reason `dual`
      // does: each one IS dual's pass 2 with the gram field changed, so its
      // batches form after the weighted/unweighted partition. Selecting with
      // the mixed boundaries would send a composition the arm never builds and
      // make the run incomparable to the 67/108 control.
      const select = arm === "P10" || arm === "dual" || arm in ORDER_ARMS
        ? fixtureBatchesP10
        : fixtureBatches;
      const items = fullMenu ? whole : select(whole, names);
      const runner = ARM_RUNNERS[arm];
      enriched = arm === "P10"
        // NOT through enrichWithArm: that pre-chunks, and P-10 partitions the
        // WHOLE list before chunking each side. Pre-chunking would rebuild Arm
        // P's undersized batches and silently re-measure it.
        // deno-lint-ignore no-explicit-any
        ? await armP10(items as any) as EnrichedItem[]
        : arm === "dual"
        // The SHIPPED entry point, end to end. Pass 1 over an all-unweighted
        // selection is redundant work whose answers are then discarded - that is
        // the price of exercising the real function rather than a stand-in.
        // deno-lint-ignore no-explicit-any
        ? (await callGptEnrichDualPass(items as any, apiKey!, ENRICH_MODEL))
          .items
        : runner
        // deno-lint-ignore no-explicit-any
        ? await enrichWithArm(items, runner as any)
        // deno-lint-ignore no-explicit-any
        : (await callGptEnrich(items as any, apiKey!, ENRICH_MODEL)).items;
      assertRunIsProducingData(`${arm} / ${menu} / draw ${draw + 1}`, enriched);
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
          `draw ${draw + 1}: ${
            !got ? "ABSENT" : "BACKFILLED (API failure)"
          } - EXCLUDED`,
        );
        continue;
      }
      const { fields, pass } = scoreItemAgainstBand(entry.band, macros(got));
      const points = fields.filter((f) => f.pass).length;
      results.get(entry.name)!.points.push(points);
      results.get(entry.name)!.detail.push(
        `draw ${draw + 1}: ${points}/4 ${pass ? "PASS" : "FAIL"}  ` +
          fields.map((f) =>
            `${f.field}=${Math.round(f.model)}${
              f.pass ? "" : `(band ${f.band})`
            }`
          ).join(" "),
      );
    }
  }
}

let total = 0;
// Scored out of the draws that actually returned an estimate, so one API timeout
// does not silently deflate the headline number.
const scoredDraws = [...results.values()].reduce(
  (n, r) => n + r.points.length,
  0,
);
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
  console.log(
    `${entry.name.padEnd(18)} ${
      String(sum).padStart(3)
    } pts   per-draw ${span}`,
  );
  for (const line of r.detail) console.log(`    ${line}`);
}
// A dish with no draws was never scored, so it is not in `possible` either - and a
// partial total therefore LOOKS like a full one. "52/72" reads exactly like the
// historical 6-dish figure while meaning something else entirely, which is the
// reporting trap this footer exists to close. Say the coverage out loud.
const covered = oracle.filter((e) =>
  (results.get(e.name)?.points.length ?? 0) > 0
);
const missing = oracle.filter((e) =>
  (results.get(e.name)?.points.length ?? 0) === 0
);
console.log(
  `\nTOTAL ${total}/${possible} points in band (${
    Math.round(100 * total / possible)
  }%)` +
    ` over ${covered.length} of ${oracle.length} ruled dishes.` +
    (runLabel ? ` [arm ${arm}, run ${runLabel}]` : ` [arm ${arm}]`) +
    (missing.length
      ? `\n⚠️  PARTIAL SCORE - NOT COMPARABLE TO A FULL ONE. Unscored: ${
        missing.map((e) => e.name).join(", ")
      }.` +
        `\n    They have no archive for this arm, so they are absent from BOTH sides of the` +
        `\n    fraction. Run the arm (no --replay) to cover them.`
      : "") +
    `\n⚠️  The DENOMINATOR changed on 2026-08-20 (6 dishes -> ${oracle.length}) and so did the pass` +
    `\n    rule (average ±20%, plus a 6 g / 50 kcal allowance). A score from before that date is` +
    `\n    not comparable to one after it.` +
    `\n⚠️  Report alongside the weighted number, never merged into it.`,
);
