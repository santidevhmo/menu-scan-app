// EVAL 123 — rebuild the offline Stage-1a caches from the PASSTHROUGH originals.
//
// Eval 122 found the b1 caches (OCR of a 2048/q95 RE-ENCODE) are not the text
// production sends: the passthrough original's OCR drops ~9 trailing prices on
// el-marcos (3154 vs 3180 chars). This one-shot builder OCRs every fixture photo
// through productionPhotoData — the exact production upload path — and archives
// one raw response per page under the "pt" tag, so all future offline work keys
// on production-mirror text. ~$0.001/page, Santiago-approved 2026-08-01.
//
//   MISTRAL_API_KEY=... deno run --allow-read --allow-write --allow-env \
//     --allow-net --allow-run scripts/ocr-passthrough-cache.ts
import { ocrMistral } from "../supabase/functions/analyze-menu/mistral-extract.ts";
import { MENU_DIR, productionPhotoData } from "./photo-input.ts";
import { MENU_PHOTOS, rawPath } from "./probe-bakeoff-mistral-b1.ts";

const apiKey = Deno.env.get("MISTRAL_API_KEY");
if (!apiKey) throw new Error("MISTRAL_API_KEY is required");
const tmp = await Deno.makeTempDir({ prefix: "pt-cache-" });

for (const [menu, photos] of Object.entries(MENU_PHOTOS)) {
  for (const [page, photo] of photos.entries()) {
    const data = await productionPhotoData(photo, tmp);
    const read = await ocrMistral(data, apiKey);
    const path = rawPath(MENU_DIR, menu, "pt", 1, page);
    await Deno.writeTextFile(path, read.raw_response);
    console.log(`${menu} p${page}: md=${read.markdown.length} chars -> ${path}`);
  }
}
