// EVAL 116 — is our offline baseline measuring an input production no longer sends?
//
// The cached `b1` OCR text that every offline score rests on was produced from a
// 2048px q95 RE-ENCODE (probe-bakeoff-mistral-b1.ts:157). Production now uploads
// the PASSTHROUGH ORIGINAL (photo-input.ts productionPhotoData, the ticket-#3
// fidelity fix). Eval 115 measured brasero-two at 5/5 offline and 2/5 live ×3,
// with the CHURRASQUERÍA card returning C1's pre-Shape-A "defect A" shape — the
// exact thing foldPricedHeadingCards exists to fix — as if the fold never fired.
//
// This probe holds EVERYTHING constant except the OCR text. It feeds the SAME
// cached structuring items through the SAME real textStructureCleanup with three
// different markdowns, and reports whether the fold fires under each:
//
//   cached      — the July b1 text the 40/45 was measured against
//   reencoded   — a fresh OCR of the 2048/q95 copy (isolates model drift)
//   passthrough — a fresh OCR of the original, i.e. what production sends
//
// Reading the result:
//   cached fires, reencoded fires, passthrough does NOT -> the INPUT IMAGE is
//     the cause; the offline baseline measures a file we no longer send.
//   cached fires, reencoded does NOT                    -> the OCR MODEL drifted
//     since July, independent of the image.
//   all three fire                                      -> neither; the live
//     failure came from the structuring model, not the text.
import { textStructureCleanup } from "../supabase/functions/analyze-menu/mistral-cleanup.ts";
import type { ExtractedMenuItem } from "../supabase/functions/analyze-menu/extract.ts";
import { ocrMistral } from "../supabase/functions/analyze-menu/mistral-extract.ts";
import { compressedPhotoData, MENU_DIR, productionPhotoData } from "./photo-input.ts";
import { MENU_PHOTOS } from "./probe-bakeoff-mistral-b1.ts";
import { itemsFromRaw } from "./score-c-dumps.ts";
import { ocrMarkdown, ocrSourcePaths } from "./probe-c-textstructure.ts";

const MENU = Deno.env.get("MENU") ?? "brasero-two";
/** The card whose fold is the tell. Substring, matched case-insensitively. */
const CARD = Deno.env.get("CARD") ?? "churrasqu";

function foldFired(items: ExtractedMenuItem[]): {
  fired: boolean;
  shape: string;
} {
  const hits = items.filter((item) =>
    (item.name + " " + (item.section_title ?? "")).toLowerCase().includes(CARD)
  );
  // Folded (Shape A) = ONE item whose own name is the card and which carries the
  // printed sizes as options. Unfolded = the sizes are standalone items sitting
  // under a section of that name.
  const folded = hits.filter((item) =>
    item.name.toLowerCase().includes(CARD) && item.options.length > 0
  );
  return {
    fired: folded.length === 1 && hits.length === 1,
    shape: hits.map((item) =>
      `${item.name}@${item.price}[sec=${item.section_title}` +
      `,opts=${item.options.map((o) => `${o.name}@${o.price}`).join("/") || "-"}]`
    ).join("  ") || "(no item matches)",
  };
}

const photos = MENU_PHOTOS[MENU];
if (!photos) throw new Error(`unknown menu: ${MENU}`);

// The items are held CONSTANT: the archived structuring response the offline
// 40/45 was scored from, postprocessed and merged exactly as production does.
const items = await itemsFromRaw(MENU, "eval103c-m41");

const cached = (await Promise.all(
  ocrSourcePaths(MENU).map(async (path) =>
    ocrMarkdown(JSON.parse(await Deno.readTextFile(path)))
  ),
)).join("\n");

if (Deno.env.get("LIVE") !== "1") {
  console.log(`[dry-run] menu=${MENU} pages=${photos.length}`);
  console.log(`[dry-run] would make ${photos.length * 2} Mistral OCR calls`);
  console.log(`[dry-run] cached markdown chars=${cached.length}`);
  console.log(`[dry-run] cached fold:`, foldFired(textStructureCleanup(items, cached)));
} else {
  const apiKey = Deno.env.get("MISTRAL_API_KEY");
  if (!apiKey) throw new Error("MISTRAL_API_KEY is required");
  const tmp = await Deno.makeTempDir({ prefix: "ocr-fidelity-" });

  const variants: Record<string, string> = { cached };
  for (const [label, build] of [
    ["reencoded", (p: string) => compressedPhotoData(p, 2048, 95, tmp)],
    ["passthrough", (p: string) => productionPhotoData(p, tmp)],
  ] as const) {
    const pages = await Promise.all(photos.map(async (photo, page) => {
      const data = await build(photo);
      const read = await ocrMistral(data, apiKey);
      // Archive the raw so this never has to be re-paid for (lesson 20/21).
      // The page index is REQUIRED: without it page 1 overwrites page 0 and a
      // later reader silently analyses half the menu (this bug was live for one
      // run — the in-memory comparison above was unaffected, the archive was not).
      await Deno.writeTextFile(
        `${MENU_DIR}/${MENU}.eval116-${label}.p${page}.raw.json`,
        read.raw_response,
      );
      console.log(`  [${label}] ${photo}: payload=${data.length} chars`);
      return read.markdown;
    }));
    variants[label] = pages.join("\n");
  }

  console.log(`\n=== ${MENU}: does the "${CARD}" fold fire? ===`);
  for (const [label, markdown] of Object.entries(variants)) {
    const result = foldFired(textStructureCleanup(items, markdown));
    console.log(
      `${result.fired ? "FIRES    " : "NO-FIRE  "} ${label.padEnd(12)} ` +
        `md=${markdown.length} chars`,
    );
    console.log(`             ${result.shape}`);
  }

  console.log(`\n=== headings mentioning "${CARD}" ===`);
  for (const [label, markdown] of Object.entries(variants)) {
    const lines = markdown.split("\n").filter((line) =>
      line.toLowerCase().includes(CARD)
    );
    console.log(`${label}:`);
    for (const line of lines) console.log(`   ${JSON.stringify(line)}`);
  }
}
