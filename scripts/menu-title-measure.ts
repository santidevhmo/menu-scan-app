// §3 of docs/backend-changes-required.md — the $0 attempt at deriving the
// menu's own title deterministically, from the OCR text blocks Mistral already
// returns on every scan. MEASURED 2026-09-05 AND REJECTED.
//
//   deno run --allow-read scripts/menu-title-measure.ts
//
// ⚠️ THIS IS NOT PRODUCTION CODE and does not live in the edge function. It is
// kept here, in scripts/, as the record of a measurement so nobody pays to
// re-derive the same answer. Calls no API — the archived Mistral responses
// already carry `blocks`, so re-running it is free.
//
// WHY IT WAS TRIED: EXTRACT_SCHEMA is eval-gated, so a new field there needs a
// paid re-baseline. Mistral returns a pixel box, a `type` and the text for
// every block, and we already read them for orientation. Free was worth a shot.
//
// WHY IT FAILED: best rule scored 5/11, and every failure was a SECTION
// HEADING presented as the restaurant's name — "ENSALADAS", "POSTRES",
// "BEBIDAS SIN ALCOHOL", "Sandwiches & Hamburguesas". §3 says null is a
// perfectly good answer; a confidently wrong Spanish word in the results
// header is not. And the heuristic cannot tell when it is wrong.
//
// WHY IT CANNOT BE PATCHED: separating a restaurant's name from a section
// heading needs a list of section words in every language a menu might print,
// which is exactly the menu-specific hardcoding that extraction is forbidden
// from carrying (extraction must generalise worldwide).
//
// THE SIGNAL THAT DID WORK, for whoever retries: `type: "title"` is a real
// discriminator — 159 title blocks against 753 text blocks across the corpus,
// and the correct answer is always among the titles. What is missing is a way
// to rank the titles, and geometry does not supply it.

import type { OcrBlock } from "../supabase/functions/analyze-menu/orientation.ts";

type TypedBlock = OcrBlock & { type?: string | null };

const CACHES = "scripts/fixtures/caches";

/** The real name printed on each fixture menu, read off the photos by hand. */
const TRUTH: Record<string, string> = {
  "andaluz": "EL ANDALUZ",
  "bistro": "PIZZAS BISTRO",
  "brasero": "BRASERO",
  "brasero-two": "BRASERO",
  "casa-nostra": "CASA NOSTRA",
  "el-marcos": "EL MARCOS",
  "guest-house": "GUEST HOUSE",
  "mochomos": "MOCHOMOS",
  "nikkori": "NIKKORI",
  "polloteria": "ComePollito",
};

const clean = (content: string) =>
  content
    .split("\n")
    .map((line) => line.replace(/^#{1,6}\s*/, "").replaceAll("*", "").trim())
    .filter((line) => line.length > 0)
    .join(" ");

/** Box height per line of content. Within TITLE blocks the content newlines do
 *  track visual lines, so this approximates glyph height. It does NOT hold for
 *  text blocks — a wrapped paragraph is one content line in a tall box, which
 *  is what made the first version of this return dish descriptions. */
const glyphHeight = (b: TypedBlock) => {
  const lines = (b.content ?? "").split("\n").filter((l) => l.trim()).length;
  return (b.bottom_right_y - b.top_left_y) / Math.max(1, lines);
};

const titles = (blocks: TypedBlock[]) =>
  blocks.filter((b) =>
    b.type === "title" && (b.content ?? "").trim().length >= 3
  );

const RULES: Record<string, (b: TypedBlock[]) => string | null> = {
  "topmost title": (blocks) => {
    const t = titles(blocks);
    if (t.length === 0) return null;
    return clean(
      t.reduce((a, b) => (b.top_left_y < a.top_left_y ? b : a)).content ?? "",
    );
  },
  "tallest title": (blocks) => {
    const t = titles(blocks);
    if (t.length === 0) return null;
    return clean(
      t.reduce((a, b) => (glyphHeight(b) > glyphHeight(a) ? b : a)).content ??
        "",
    );
  },
};

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
const correct = (menu: string, got: string | null) => {
  const want = TRUTH[menu.split(".")[0]];
  return got !== null && !!want && norm(got).includes(norm(want));
};

const files = [...Deno.readDirSync(CACHES)]
  .map((e) => e.name)
  .filter((n) => /\.mistral-pt-r1(\.p\d+)?\.raw\.json$/.test(n))
  .sort();

for (const [label, rule] of Object.entries(RULES)) {
  let hits = 0;
  console.log(`\n── ${label} ${"─".repeat(60 - label.length)}`);
  for (const name of files) {
    const raw = JSON.parse(Deno.readTextFileSync(`${CACHES}/${name}`));
    const blocks: TypedBlock[] = raw.pages?.[0]?.blocks ?? [];
    const menu = name.replace(/\.mistral-pt-r1(\.p\d+)?\.raw\.json$/, "$1");
    const got = rule(blocks);
    const ok = correct(menu, got);
    if (ok) hits++;
    console.log(
      `  ${ok ? "✓" : "✗"} ${menu.padEnd(20)} ${
        got === null ? "(null)" : JSON.stringify(got).slice(0, 46)
      }`,
    );
  }
  console.log(`  ${hits}/${files.length} correct`);
}

console.log(
  "\nREJECTED. A wrong title is worse than no title, and neither rule knows\n" +
    "when it is wrong. Every failure is a section heading — see the header of\n" +
    "this file for why that cannot be filtered without forbidden hardcoding.",
);
