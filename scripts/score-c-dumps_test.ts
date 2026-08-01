import { assertEquals } from "jsr:@std/assert";
import type { ExtractedMenuItem } from "../supabase/functions/analyze-menu/extract.ts";
import { cleanForScore, itemsFromRaw } from "./score-c-dumps.ts";

const item = (
  overrides: Partial<ExtractedMenuItem> = {},
): ExtractedMenuItem => ({
  name: "Item",
  description: "",
  price: 100,
  category: "food",
  section_title: null,
  options: [],
  grams: null,
  ...overrides,
});

Deno.test("cleanForScore applies C2 cleanup and records its rewrite and null audits", () => {
  const result = cleanForScore([
    item({ name: "POSTRES", section_title: "P O S T R E S" }),
    item({ name: "Note", category: "other", section_title: "P O S T R E S" }),
  ]);

  assertEquals(result.items, [item({ name: "POSTRES", section_title: null })]);
  assertEquals(result.rewrites, [
    "P O S T R E S → POSTRES",
    "P O S T R E S → POSTRES",
  ]);
  assertEquals(result.nulled, ["POSTRES | POSTRES → null"]);
});

// ─── THE EVAL-110 GUARD ──────────────────────────────────────────────────────
// This gate once scored `*.dump.json`, which had already been postprocessed
// when the probe ran. Three real postprocess.ts fixes therefore reported "no
// change" (35/45) while actually being worth +2 dims. The class is general: a
// gate that reads a DERIVED artifact is blind to the code that derived it.
//
// These two tests fail the moment that blindness returns, whatever form it
// takes — a reintroduced dump read, a cached shortcut, a memoised result.
const TAG = "eval103c-m41";

Deno.test("the gate reflects production postprocess — a stub transform reaches the output", async () => {
  // If the pipeline ever reads a pre-processed artifact instead of applying the
  // real chain to raw responses, this stub is ignored and items come back
  // non-empty. That is exactly the eval-110 failure.
  const stubbed = await itemsFromRaw("bistro", TAG, () => []);
  assertEquals(
    stubbed,
    [],
    "itemsFromRaw ignored its transform — the gate is scoring a derived " +
      "artifact again and cannot see postprocess.ts (see eval 110)",
  );
});

Deno.test("the gate really runs postprocess — raw model output is not passed through", async () => {
  // postprocessItems is not a no-op on this menu (it folds the TACO LOIRO card
  // and strips echoes), so identity-vs-real must differ. Guards the inverse
  // mistake: wiring the harness straight to raw and skipping the chain.
  const raw = await itemsFromRaw("brasero-two", TAG, (items) => items);
  const real = await itemsFromRaw("brasero-two", TAG);
  // Compared as a boolean so a failure prints the reason, not two item dumps.
  assertEquals(
    JSON.stringify(real) === JSON.stringify(raw),
    false,
    "postprocessItems had no effect — the gate is scoring unprocessed model " +
      "output and does not mirror production",
  );
});
