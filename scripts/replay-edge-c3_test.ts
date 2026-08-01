// SENSITIVITY GUARDS FOR THE C3 GATE. A guard nobody has watched fail is not a
// guard — both tests below were verified RED by deliberately breaking the thing
// they protect, then restored (see ledger eval 114).
//
// 1. The chain really runs. A gate that ends up reading anything our own code
//    already produced is blind to that code — the eval-110 bug, worth +2 dims
//    of silence at the time.
// 2. The edge reproduces the harness that MEASURED 40/45, item for item.
//
// WHAT GUARD 2 DOES NOT COVER, measured 2026-08-01 rather than assumed: it does
// NOT catch the chain ORDER. Cleaning per page instead of once post-merge is a
// strict no-op on today's fixtures — 8 of the 9 menus are single-page (where
// the two orders are identical by construction) and brasero-two, the only
// multi-page menu, has no fold that reaches across its pages. Both orders score
// 40/45 and both pass this file. The order is pinned instead by the synthetic
// unit test "runPagedExtraction: cleanup runs AFTER the merge over ALL pages'
// markdown joined by newline" in extract_test.ts, which was verified to go RED
// under the per-page order. Keep that test: on the day a two-page menu prints a
// card heading on one page and its versions on the next, it is the only thing
// standing between us and a silent regression.
import { assertEquals } from "jsr:@std/assert";
import { ocrMarkdown } from "../supabase/functions/analyze-menu/mistral-extract.ts";
import { cleanForScore, itemsFromRaw } from "./score-c-dumps.ts";
import { ocrSourcePaths } from "./probe-c-textstructure.ts";
import { replayMenu } from "./replay-edge-c3.ts";

const TAG = "eval103c-m41";

async function joinedMarkdown(menu: string): Promise<string> {
  return (await Promise.all(
    ocrSourcePaths(menu).map(async (path) =>
      ocrMarkdown(JSON.parse(await Deno.readTextFile(path)))
    ),
  )).join("\n");
}

Deno.test("the C3 gate really runs the chain — raw model items are not passed through", async () => {
  // postprocessItems + textStructureCleanup are both non-trivial on this menu
  // (they fold the TACO LOIRO card), so identity-vs-real must differ.
  const replayed = await replayMenu("brasero-two", TAG);
  const raw = await itemsFromRaw("brasero-two", TAG, (items) => items);
  assertEquals(
    JSON.stringify(replayed.items) === JSON.stringify(raw),
    false,
    "the edge returned unprocessed model output — the gate is not measuring " +
      "postprocess.ts or mistral-cleanup.ts at all (see eval 110)",
  );
});

for (const menu of ["brasero-two", "polloteria"]) {
  Deno.test(`the edge chain matches the harness that measured 40/45 — ${menu}`, async () => {
    const replayed = await replayMenu(menu, TAG);
    const harness = cleanForScore(
      await itemsFromRaw(menu, TAG),
      await joinedMarkdown(menu),
    );
    assertEquals(
      replayed.items,
      harness.items,
      "runPagedExtraction no longer reproduces scripts/score-c-dumps.ts. The " +
        "usual cause is the chain ORDER: postprocess must run PER PAGE, then " +
        "mergeItemSources, then ONE textStructureCleanup over all pages' " +
        "markdown joined by a newline.",
    );
  });
}
