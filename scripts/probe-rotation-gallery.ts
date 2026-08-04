// SANTIAGO'S EYES, NOT MY TABLE ($0).
//
// He asked for a folder of rotated menus he can look at, because a decision
// table he cannot check is not evidence — it is my word. So this renders the
// REAL detector's verdict as pictures: for every archived OCR response, the
// photo as the detector saw it, and the photo after the correction it chose.
//
// He opens ONE folder — `2-what-the-system-will-use` — and asks one question of
// every picture in it: does this read left to right? The crooked "before"
// pictures live in a separate folder, because the first version mixed both into
// one and half of it was deliberately-wrong images he had no way to tell apart.
//
// UPRIGHT FOR A HUMAN IS UPRIGHT FOR THE SYSTEM. There is no trade-off to
// balance: eval 131 measured that a sideways read keeps the dish names and drops
// the prices, so his eye is a valid oracle for this, not a proxy for one.
//
//   deno run --allow-read --allow-write --allow-env --allow-run \
//     scripts/probe-rotation-gallery.ts
import {
  correctionDegrees,
  detectOrientation,
  type OcrBlock,
  printedNumbers,
  readingOrderDrift,
  wideFraction,
} from "../supabase/functions/analyze-menu/orientation.ts";
import { ocrMarkdown } from "../supabase/functions/analyze-menu/mistral-extract.ts";
import { MENU_DIR, photoPath } from "./photo-input.ts";
import { MENU_PHOTOS } from "./probe-bakeoff-mistral-b1.ts";

const OUT = `${MENU_DIR}/RotationCheck`;

/** Every archived OCR response, as (menu, page, how the photo was turned). */
async function archived(): Promise<
  { menu: string; page: number; photo: string; turn: number; raw: string }[]
> {
  const found = [];
  for await (const entry of Deno.readDir(MENU_DIR)) {
    const upright = entry.name.match(/^(.+)\.mistral-pt-r1(?:\.p(\d+))?\.raw\.json$/);
    const turned = entry.name.match(/^(.+)\.mistral-rot(\d+)-r1\.raw\.json$/);
    const match = upright ?? turned;
    if (!match) continue;
    const menu = match[1];
    const page = upright ? Number(upright[2] ?? 0) : 0;
    const photo = MENU_PHOTOS[menu]?.[page];
    if (!photo) continue;
    found.push({
      menu,
      page,
      photo,
      turn: turned ? Number(turned[2]) : 0,
      raw: `${MENU_DIR}/${entry.name}`,
    });
  }
  return found.sort((a, b) =>
    a.menu.localeCompare(b.menu) || a.page - b.page || a.turn - b.turn
  );
}

async function sips(args: string[]): Promise<void> {
  const out = await new Deno.Command("sips", { args, stderr: "piped" }).output();
  if (!out.success) {
    throw new Error(`sips ${args.join(" ")}: ${new TextDecoder().decode(out.stderr)}`);
  }
}

/** Writes `photo` turned by `degrees` clockwise to `dest`. */
async function turned(photo: string, degrees: number, dest: string) {
  await Deno.copyFile(photoPath(photo), dest);
  if (degrees % 360 !== 0) await sips(["-r", String(degrees % 360), dest]);
}

const pixelDir = await Deno.makeTempDir({ prefix: "rot-pixels-" });
let pixelSeq = 0;
/** Fingerprint of an image's PIXELS, via uncompressed BMP so re-encoding cannot
 *  masquerade as a difference. */
async function pixels(path: string): Promise<string> {
  const bmp = `${pixelDir}/${pixelSeq++}.bmp`;
  await sips(["-s", "format", "bmp", path, "--out", bmp]);
  return (await Deno.readFile(bmp)).toBase64();
}

// TWO FOLDERS, NOT ONE. The first version put the crooked "before" image and
// the corrected "after" image side by side in one folder, distinguished only by
// a suffix inside a long filename — so the folder was half deliberately-wrong
// pictures and Santiago could not tell which was which. The check he needs is
// "open one folder, is everything in it readable", so give him exactly that.
const BEFORE = `${OUT}/1-what-the-camera-saw`;
const AFTER = `${OUT}/2-what-the-system-will-use`;
try {
  await Deno.remove(OUT, { recursive: true });
} catch { /* first run */ }
await Deno.mkdir(BEFORE, { recursive: true });
await Deno.mkdir(AFTER, { recursive: true });

const rows: string[] = [];
let wrong = 0;
for (const { menu, page: pageIndex, photo, turn, raw } of await archived()) {
  const page = JSON.parse(await Deno.readTextFile(raw)).pages[0];
  const blocks = (page.blocks ?? []) as OcrBlock[];
  const verdict = detectOrientation(blocks);
  const fix = correctionDegrees(verdict);
  const label = turn === 0 ? "upright" : `turned${turn}`;
  const stem = `${menu}${pageIndex > 0 ? `-page${pageIndex + 1}` : ""}__${label}`;
  const ext = photo.slice(photo.lastIndexOf("."));

  // BEFORE = the photo exactly as the detector saw it.
  const before = `${BEFORE}/${stem}${ext}`;
  await turned(photo, turn, before);
  // AFTER = that same FILE turned by the correction the detector chose. Rotating
  // the crooked file is the operation the app will really perform; computing
  // `turn + fix` in one step would have quietly tested arithmetic instead.
  const after = `${AFTER}/${stem}__${verdict}__turn${fix}${ext}`;
  await Deno.copyFile(before, after);
  if (fix !== 0) await sips(["-r", String(fix), after]);

  // Proof, not arithmetic: an exactly-corrected photo must come back
  // PIXEL-identical to the original upright fixture.
  //
  // Compared as uncompressed BMP, NOT as file bytes. Rotating a PNG twice
  // re-encodes it, so the bytes differ while every pixel matches — a byte
  // comparison called all 5 real corrections failures on the first run.
  const ok = await pixels(after) === await pixels(photoPath(photo));
  if (!ok) wrong++;
  const drift = readingOrderDrift(blocks);
  rows.push(
    `${ok ? "UPRIGHT " : "** NOT UPRIGHT **"} ${stem.padEnd(30)} blocks=${
      String(blocks.length).padStart(3)
    } wide=${wideFraction(blocks).toFixed(3)} ` +
      `x=${drift.x >= 0 ? "+" : "-"}${Math.abs(drift.x).toFixed(2)} ` +
      `y=${drift.y >= 0 ? "+" : "-"}${Math.abs(drift.y).toFixed(2)} ` +
      `-> ${verdict} (+${fix}deg, ${printedNumbers(ocrMarkdown(JSON.parse(await Deno.readTextFile(raw))))} numbers read)`,
  );
}
for (const row of rows) console.log(row);
console.log(
  `\n${rows.length} cases, ${wrong} NOT pixel-identical to the upright original`,
);
console.log(
  `\nLOOK AT THIS ONE — every picture in it must read left to right:\n  open ${AFTER}`,
);
console.log(`the crooked "before" pictures are separate: ${BEFORE}`);
