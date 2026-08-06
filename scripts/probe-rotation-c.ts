// H2 RE-PROBE UNDER THE (c) PIPELINE — does a SIDEWAYS photo still need us to
// rotate it? (ruling 27 made sideways capture launch scope; eval 094's evidence
// predates the Mistral-OCR migration and measured a DETECTOR, not the pipeline.)
//
// The real case: a diner turns the phone to photograph a WIDE menu, so the
// capture arrives portrait-shaped with the text lying on its side. Rotating a
// landscape fixture by 90 degrees reproduces exactly that.
//
// CHEAP-FIRST. Stage-1b only ever sees Stage-1a's TEXT, so if the OCR of a
// rotated photo matches the OCR of the upright one, the rest of the pipeline
// cannot tell them apart and no rotation code is needed. That makes Stage-1a
// the whole question, at ~$0.001 a call — pay for structuring only if it passes.
//
//   MISTRAL_API_KEY=... deno run --allow-read --allow-write --allow-env \
//     --allow-net --allow-run scripts/probe-rotation-c.ts
import { ocrMistral } from "../supabase/functions/analyze-menu/mistral-extract.ts";
import { MENU_DIR, photoPath, productionPhotoData } from "./photo-input.ts";
import { MENU_PHOTOS, rawPath } from "./probe-bakeoff-mistral-b1.ts";

// H2.2 Task 7: close the thin direction. The counter-clockwise verdict rested
// on ONE observation (polloteria @270°). This covers all 4 landscape menus in
// BOTH directions plus 2 portrait menus turned sideways — a diner can hold
// the phone wrong on any menu, not just wide ones.
const CASES: [string, number][] = [
  ["polloteria", 90],
  ["polloteria", 180],
  ["polloteria", 270],
  ["bistro", 90],
  ["bistro", 180],
  ["bistro", 270],
  ["guest-house", 90],
  ["guest-house", 180],
  ["guest-house", 270],
  ["el-marcos", 90],
  ["el-marcos", 180],
  ["el-marcos", 270],
  ["nikkori", 90],
  ["brasero", 270],
];

const apiKey = Deno.env.get("MISTRAL_API_KEY");
if (!apiKey) throw new Error("MISTRAL_API_KEY is required");
const tmp = await Deno.makeTempDir({ prefix: "rotation-c-" });
// The permanent, versioned pt-r1 archive (all 10 menus) — not MENU_DIR, which
// only has the 3 landscape menus from the original H2 re-probe (eval 094-era).
const CACHES = new URL("./fixtures/caches/", import.meta.url).pathname;

/** Character-level similarity, the same measure eval 102 used for OCR drift. */
function similarity(a: string, b: string): number {
  const short = a.length < b.length ? a : b;
  const long = a.length < b.length ? b : a;
  if (long.length === 0) return 1;
  let same = 0;
  for (let i = 0; i < short.length; i++) if (short[i] === long[i]) same++;
  return same / long.length;
}

/** Fraction of the upright OCR's word set the rotated OCR also produced —
 *  robust to reflow, which raw character alignment is not. */
function wordRecall(upright: string, rotated: string): number {
  const words = (text: string) =>
    new Set(text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);
  const want = words(upright);
  if (want.size === 0) return 1;
  const got = words(rotated);
  let hit = 0;
  for (const word of want) if (got.has(word)) hit++;
  return hit / want.size;
}

for (const [menu, degrees] of CASES) {
  const archivePath = rawPath(MENU_DIR, menu, `rot${degrees}`, 1, 0);
  try {
    await Deno.stat(archivePath);
    console.log(`${menu} @${degrees}°: already archived, skipping (guard the spend)`);
    continue;
  } catch {
    // not archived yet — fetch it
  }
  const photos = MENU_PHOTOS[menu];
  if (photos.length !== 1) throw new Error(`${menu}: probe assumes one page`);
  const source = photoPath(photos[0]);
  const rotated = `${tmp}/${menu}.rot${degrees}.png`;
  await Deno.copyFile(source, rotated);
  const spin = await new Deno.Command("sips", {
    args: ["-r", String(degrees), rotated],
  }).output();
  if (!spin.success) {
    throw new Error(`sips -r ${degrees} ${menu}: ${
      new TextDecoder().decode(spin.stderr)
    }`);
  }
  // productionPhotoData reads by fixture NAME; the rotated file is a temp, so
  // inline the same passthrough rule rather than teach it a second lookup.
  const bytes = await Deno.readFile(rotated);
  const data = `data:image/png;base64,${bytes.toBase64()}`;

  const read = await ocrMistral(data, apiKey);
  await Deno.writeTextFile(
    rawPath(MENU_DIR, menu, `rot${degrees}`, 1, 0),
    read.raw_response,
  );
  const upright = JSON.parse(
    await Deno.readTextFile(`${CACHES}${menu}.mistral-pt-r1.raw.json`),
  ).pages[0].markdown as string;

  console.log(
    `${menu} @${degrees}°: chars ${read.markdown.length} vs upright ${upright.length} ` +
      `| char-sim ${similarity(upright, read.markdown).toFixed(4)} ` +
      `| WORD RECALL ${(100 * wordRecall(upright, read.markdown)).toFixed(1)}%`,
  );
}
console.log(`\nrotated OCR archived as <menu>.mistral-rot<deg>-r1.raw.json`);
