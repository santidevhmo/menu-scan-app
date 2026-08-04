// SANTIAGO'S EYES, NOT MY TABLE ($0).
//
// He asked for a folder of rotated menus he can look at, because a decision
// table he cannot check is not evidence — it is my word. So this renders the
// REAL detector's verdict as pictures: for every archived OCR response, the
// photo as the detector saw it, and the photo after the correction it chose.
//
// He judges one thing per pair: is the OUTPUT upright? For the upright fixtures
// the output must be byte-identical to the input — that is the false-positive
// check, and it is the one that matters most.
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
  { menu: string; photo: string; turn: number; raw: string }[]
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
      photo,
      turn: turned ? Number(turned[2]) : 0,
      raw: `${MENU_DIR}/${entry.name}`,
    });
  }
  return found.sort((a, b) =>
    a.menu.localeCompare(b.menu) || a.turn - b.turn
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

await Deno.mkdir(OUT, { recursive: true });
for await (const old of Deno.readDir(OUT)) {
  await Deno.remove(`${OUT}/${old.name}`);
}

const rows: string[] = [];
let wrong = 0;
for (const { menu, photo, turn, raw } of await archived()) {
  const page = JSON.parse(await Deno.readTextFile(raw)).pages[0];
  const blocks = (page.blocks ?? []) as OcrBlock[];
  const verdict = detectOrientation(blocks);
  const fix = correctionDegrees(verdict);
  const label = turn === 0 ? "upright" : `turned${turn}`;
  const stem = `${menu}__${label}`;
  const ext = photo.slice(photo.lastIndexOf("."));

  // INPUT = the photo exactly as the detector saw it.
  await turned(photo, turn, `${OUT}/${stem}__1-input${ext}`);
  // OUTPUT = the same photo after the correction the detector chose.
  await turned(photo, turn + fix, `${OUT}/${stem}__2-output__${verdict}__+${fix}deg${ext}`);

  // The photo is upright iff the total turn is a multiple of 360.
  const ok = (turn + fix) % 360 === 0;
  if (!ok) wrong++;
  const drift = readingOrderDrift(blocks);
  rows.push(
    `${ok ? "OK  " : "MISS"} ${stem.padEnd(30)} blocks=${
      String(blocks.length).padStart(3)
    } wide=${wideFraction(blocks).toFixed(3)} ` +
      `x=${drift.x >= 0 ? "+" : "-"}${Math.abs(drift.x).toFixed(2)} ` +
      `y=${drift.y >= 0 ? "+" : "-"}${Math.abs(drift.y).toFixed(2)} ` +
      `-> ${verdict} (+${fix}deg, ${printedNumbers(ocrMarkdown(JSON.parse(await Deno.readTextFile(raw))))} numbers read)`,
  );
}
for (const row of rows) console.log(row);
console.log(`\n${rows.length} cases, ${wrong} not upright after correction`);
console.log(`open ${OUT}`);
