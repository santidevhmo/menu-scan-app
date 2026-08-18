// THE MIXED-MENU HARNESS — scores the eight WEIGHTED fixtures inside their own
// real menus, which is the one thing bench-macros.ts structurally cannot do.
//
// WHY THIS EXISTS. bench-macros.ts sends all 8 fixtures in a SINGLE call, and all
// 8 print a weight. Production sends a whole menu through callGptEnrich, chunked
// into ENRICH_BATCH_SIZE groups of mostly-unweighted items. The 2026-08-12
// batch-size curve measured that batch composition MOVES the answer rather than
// merely scattering it, so "one call of 8 weighted dishes" is a regime production
// never runs — and every weighted figure this phase has published describes it.
//
// That blind spot is what blocks Arm P. Arm P splits each batch into a weighted
// call and an unweighted call, so a weighted dish's batch-mates change from
// "9 mixed items" to "the weighted items of its own chunk" — fewer, and all
// weighted. The 96-point benchmark cannot see that change because its 8 dishes
// already travel together. This harness can: same dishes, same oracle, same
// scoring path, and the ONLY difference between the arms is who shares the call.
//
//   arm `mixed`  callGptEnrich(whole menu, ENRICH_BATCH_SIZE)   = production today
//   arm `P`      chunk at ENRICH_BATCH_SIZE, then armP per chunk = Arm P shipped
//   arm `P10`    partition weighted/unweighted FIRST, then chunk  = Arm P without
//                each side at ENRICH_BATCH_SIZE                     the shrinkage
//
// The eight dishes' name and description are BYTE-IDENTICAL between the frozen
// oracle and these archived extractions (asserted below, and the run aborts
// otherwise), so the request text for a scored dish is unchanged from
// bench-macros.ts. Only its neighbours differ. 8 dishes x 4 fields x 3 draws = 96,
// the same denominator as the weighted benchmark, so the numbers compare directly.
//
// COST. Only the 9 items sharing a fixture's BATCH can influence it — every
// other batch is an independent HTTP request. So by default this sends just the
// batches the fixtures land in (53 of 227 items, a 77% saving) with the request
// bytes for a scored dish byte-identical either way. --full-menu sends whole
// menus, which buys nothing for the SCORE and is only for exercising the
// whole-menu path (concurrency, rescue) that bench-pipeline.ts already covers.
//
//   PAID (~$0.4/arm focused, ~$1.8/arm --full-menu):
//   deno run --allow-read --allow-write --allow-env --allow-net \
//     --env-file=.env.local scripts/bench-mixed-menu.ts [draws] [mixed|P] [--full-menu]
//
//   $0 — re-score an archived run against the CURRENT oracle, calls no API:
//   deno run --allow-read scripts/bench-mixed-menu.ts 3 mixed --replay
import {
  callGptEnrich,
  chunk,
  ENRICH_BATCH_SIZE,
  ENRICH_MODEL,
  type EnrichedItem,
} from "../supabase/functions/analyze-menu/enrich.ts";
import { isBackfilled, itemsFromArchive } from "./bench-pipeline.ts";
import { loadOracle, ORACLE_PATH } from "./bench-macros.ts";
import { altOracle, pairWithOracle, scoreDish, toMacroValues } from "./macro-measure.ts";

const CACHE_DIR = "scripts/fixtures/caches";

/**
 * The five menus the eight fixtures actually come from — every fixture is scored
 * inside ITS OWN menu, never a synthetic one. Same archives bench-pipeline and
 * bench-unweighted read, so all three harnesses see the same extraction.
 */
export const MENU_ARCHIVE: Record<string, string> = {
  andaluz: "andaluz.eval128-r1.raw.json",
  "casa-nostra": "casa-nostra.eval103c-m41-r1.raw.json",
  "el-marcos": "el-marcos.eval103c-m41-r1.raw.json",
  brasero: "brasero.eval103c-m41-r1.raw.json",
  polloteria: "polloteria.eval103c-m41-r1.raw.json",
};

export const ARMS = ["mixed", "P", "P10"] as const;
type Arm = typeof ARMS[number];

/**
 * Arm P through the SAME chunking production uses. armP() sends every item it
 * receives in one pair of calls, so handing it a 95-item menu whole would measure
 * a regime neither production nor the `mixed` arm runs. Chunking first keeps the
 * only difference between the arms the SPLIT — which is the thing under test.
 * This is deliberately identical to bench-unweighted.ts's enrichWithArm, so
 * Arm P means the same thing on both benchmarks.
 */
/**
 * Arm P-10 partitions before chunking, so it must receive the WHOLE list and
 * must NOT be pre-chunked here - pre-chunking is exactly the defect it undoes.
 */
async function enrichP10(items: unknown[]): Promise<EnrichedItem[]> {
  const { armP10 } = await import("./probe-plate-arms.ts");
  // deno-lint-ignore no-explicit-any
  return await armP10(items as any) as EnrichedItem[];
}

async function enrichSplit(items: unknown[]): Promise<EnrichedItem[]> {
  // Imported HERE, not at module scope: probe-plate-arms.ts throws on import
  // without OPENAI_API_KEY, which would break both `--replay` (documented as $0,
  // calls no API) and any test of this file.
  const { armP } = await import("./probe-plate-arms.ts");
  const out: EnrichedItem[] = [];
  for (const batch of chunk(items, ENRICH_BATCH_SIZE)) {
    // deno-lint-ignore no-explicit-any
    out.push(...await armP(batch as any) as EnrichedItem[]);
  }
  return out;
}

/**
 * The scored dishes' text must be what bench-macros.ts sends, or this harness
 * changes two things at once and measures neither. Asserted rather than assumed:
 * a re-extraction that reworded a description would otherwise silently turn a
 * batch-composition result into a prompt-text result.
 */
export function assertFixtureTextMatches(
  menu: string,
  // deno-lint-ignore no-explicit-any
  items: any[],
  entries: ReturnType<typeof loadOracle>,
): void {
  for (const entry of entries.filter((e) => e.menu === menu)) {
    const found = items.find((i) => i.name === entry.name);
    if (!found) {
      throw new Error(
        `${menu}: fixture "${entry.name}" is not in ${MENU_ARCHIVE[menu]} - ` +
          `this harness cannot score it inside its menu.`,
      );
    }
    const a = (found.description ?? "").trim();
    const b = (entry.description ?? "").trim();
    if (a !== b) {
      throw new Error(
        `${menu}: "${entry.name}" description differs from the oracle's.\n` +
          `  archive: ${a}\n  oracle : ${b}\n` +
          `Scoring it would measure the text change, not the batch composition.`,
      );
    }
  }
}

/**
 * The batches the scored fixtures actually land in, taken from the FULL menu so
 * chunk boundaries are exactly production's, then sliced out.
 *
 * Equivalent by construction, not by approximation: callGptEnrich chunks
 * sequentially and fires each batch as its own request, so a dish is influenced
 * only by the <=9 items sharing its call. Passing that same slice back in
 * reproduces the identical request bytes; the batches we drop could not have
 * touched the score. What IS lost is whole-menu behaviour under load — which is
 * bench-pipeline.ts's job, not this harness's.
 */
/**
 * The same idea for Arm P-10, whose batches form AFTER the weighted/unweighted
 * partition - so a fixture's mates are its neighbours in the WEIGHTED-ONLY
 * list, not in the mixed menu. Using the mixed boundaries here would send a
 * composition P-10 never builds.
 *
 * Returns weighted items only: all 8 fixtures print a weight, and under P-10
 * the unweighted half is a separate set of calls that cannot influence them.
 */
export function fixtureBatchesP10(
  // deno-lint-ignore no-explicit-any
  items: any[],
  names: string[],
  // deno-lint-ignore no-explicit-any
): any[] {
  const weighted = items.filter((i) => i.grams != null);
  const wanted = new Set<number>();
  for (const name of names) {
    const idx = weighted.findIndex((i) => i.name === name);
    if (idx < 0) {
      throw new Error(`fixture "${name}" is not weighted - cannot locate its P-10 batch`);
    }
    wanted.add(Math.floor(idx / ENRICH_BATCH_SIZE));
  }
  return [...wanted].sort((a, b) => a - b).flatMap((b) =>
    weighted.slice(b * ENRICH_BATCH_SIZE, (b + 1) * ENRICH_BATCH_SIZE)
  );
}

export function fixtureBatches(
  // deno-lint-ignore no-explicit-any
  items: any[],
  names: string[],
  // deno-lint-ignore no-explicit-any
): any[] {
  const wanted = new Set<number>();
  for (const name of names) {
    const idx = items.findIndex((i) => i.name === name);
    if (idx < 0) throw new Error(`fixture "${name}" not in its menu - cannot locate its batch`);
    wanted.add(Math.floor(idx / ENRICH_BATCH_SIZE));
  }
  return [...wanted].sort((a, b) => a - b).flatMap((b) =>
    items.slice(b * ENRICH_BATCH_SIZE, (b + 1) * ENRICH_BATCH_SIZE)
  );
}

async function main(): Promise<void> {
  const replay = Deno.args.includes("--replay");
  // Default is FOCUSED: send only the batches the fixtures land in. See the COST
  // note at the top — equivalent for the score, 77% cheaper.
  const fullMenu = Deno.args.includes("--full-menu");
  const positional = Deno.args.filter((a) => !a.startsWith("--"));
  const draws = Number(positional[0] ?? "3");
  const arm = (positional[1] ?? "mixed") as Arm;

  // A mistyped arm would otherwise run the baseline and be written up as the arm —
  // a paid run reported as something it is not (bench-unweighted's rule, kept).
  if (!ARMS.includes(arm)) {
    throw new Error(`unknown arm "${arm}" - expected ${ARMS.join(" or ")}`);
  }
  // Read the key ONLY when a call will actually be made: a bare Deno.env.get
  // throws without --allow-env, which would break the documented $0 replay
  // command (`deno run --allow-read ... --replay`). Same reason bench-macros.ts
  // guards its ORACLE_PATH read.
  const apiKey = replay ? null : Deno.env.get("OPENAI_API_KEY");
  if (!apiKey && !replay) throw new Error("OPENAI_API_KEY is required");

  const entries = loadOracle(ORACLE_PATH);
  const menus = [...new Set(entries.map((e) => e.menu))];
  for (const menu of menus) {
    if (!MENU_ARCHIVE[menu]) throw new Error(`no archived extraction for menu "${menu}"`);
  }

  // dish -> per-draw verdicts, plus any draw excluded as a measurement defect
  const results = new Map<string, { fails: number; fieldDraws: number; notes: string[] }>();
  for (const e of entries) results.set(e.name, { fails: 0, fieldDraws: 0, notes: [] });

  for (let draw = 0; draw < draws; draw++) {
    for (const menu of menus) {
      const suffix = fullMenu ? "" : "-f";
      const archive = `${CACHE_DIR}/mixed.${arm}${suffix}.${menu}-d${draw}.raw.json`;
    let enriched: EnrichedItem[];
    let sent: ReturnType<typeof itemsFromArchive>;

    if (replay) {
      enriched = JSON.parse(await Deno.readTextFile(archive)).items;
      sent = itemsFromArchive(await Deno.readTextFile(`${CACHE_DIR}/${MENU_ARCHIVE[menu]}`));
    } else {
      const whole = itemsFromArchive(
        await Deno.readTextFile(`${CACHE_DIR}/${MENU_ARCHIVE[menu]}`),
      );
      assertFixtureTextMatches(menu, whole, entries);
      // Batches are located in the WHOLE menu, so the chunk boundaries a fixture
      // sits on are exactly production's, then only those chunks are sent.
      const names = entries.filter((e) => e.menu === menu).map((e) => e.name);
      const select = arm === "P10" ? fixtureBatchesP10 : fixtureBatches;
      sent = fullMenu ? whole : select(whole, names);
      enriched = arm === "P10"
        ? await enrichP10(sent)
        : arm === "P"
        ? await enrichSplit(sent)
        // deno-lint-ignore no-explicit-any
        : (await callGptEnrich(sent as any, apiKey!, ENRICH_MODEL)).items;
      await Deno.writeTextFile(archive, JSON.stringify({ items: enriched }, null, 2) + "\n");
    }

    const dishNames = entries.filter((e) => e.menu === menu).map((e) => e.name);
    for (const { name, item } of pairWithOracle(dishNames, enriched, "skip")) {
      const entry = entries.find((e) => e.name === name)!;
      const row = results.get(name)!;
      // A BACKFILLED item is all zeros — it fails every field by construction and
      // would read as the model being catastrophically wrong. It is an API
      // failure, so it is excluded and reported (bench-unweighted's rule, kept).
      if (isBackfilled(item)) {
        row.notes.push(`draw ${draw + 1}: BACKFILLED (API failure) - EXCLUDED`);
        continue;
      }
      // itemsFromArchive runs parseItemGrams, so `grams` is present at runtime;
      // its declared ExtractedItem return type just does not carry the field.
      // Read through the cast rather than widening a signature three harnesses
      // share. altOracle needs it for PASTEL's second reading.
      const grams =
        (sent.find((i) => i.name === name) as { grams?: number | null } | undefined)
          ?.grams ?? null;
      const verdict = scoreDish(
        name,
        entry.oracle!,
        toMacroValues(item),
        altOracle(entry, grams),
      );
      row.fails += verdict.passes.filter((p) => !p).length;
      row.fieldDraws += verdict.passes.length;
    }
    // A dish that never arrived at all is a drop, not an estimate — say so.
    for (const name of dishNames) {
      if (!enriched.some((i) => i.name === name)) {
        results.get(name)!.notes.push(`draw ${draw + 1}: ABSENT from the response`);
      }
    }
    }
  }

  let fails = 0, fieldDraws = 0;
  console.log(
    `arm ${arm}, ${draws} draws, ${menus.length} menus, batch ${ENRICH_BATCH_SIZE}, ` +
      `${fullMenu ? "WHOLE MENUS" : "fixture batches only"}\n`,
  );
  console.log("dish                           failed");
  for (const e of entries) {
    const r = results.get(e.name)!;
    fails += r.fails;
    fieldDraws += r.fieldDraws;
    console.log(`${e.name.slice(0, 28).padEnd(30)} ${String(r.fails).padStart(2)}/${r.fieldDraws}`);
    for (const n of r.notes) console.log(`    ${n}`);
  }
  console.log(`\nTOTAL ${fails}/${fieldDraws}`);
}

if (import.meta.main) await main();
