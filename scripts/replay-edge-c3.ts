// THE C3 GATE — replays cached responses through the REAL edge entry point.
//
// A GATE MAY ONLY READ THE MOST UPSTREAM CACHED ARTIFACT: the raw model
// response. Both stages are replayed from their own `*.raw.json` — Stage-1a
// from the `b1` Mistral OCR archive, Stage-1b from the `eval103c-m41` OpenAI
// archive — and everything downstream (postprocess, merge, cleanup) is executed
// live by `runPagedExtraction`. Score anything our own code produced and the
// gate goes blind to the code it claims to measure; that is the eval-110 bug,
// and `scripts/gate-artifacts_test.ts` now fails any file that does it.
//
// Guarded by `replay-edge-c3_test.ts`, whose two tests were each verified RED
// before being accepted.
import {
  parseStructureResponse,
  runPagedExtraction,
} from "../supabase/functions/analyze-menu/extract.ts";
import { ocrMarkdown } from "../supabase/functions/analyze-menu/mistral-extract.ts";
import { scoreMenu } from "./eval-extraction.ts";
import { MENU_DIR } from "./photo-input.ts";
import { menuArchive, ocrSourcePaths } from "./probe-c-textstructure.ts";

const DEFAULT_MENUS = [
  "polloteria",
  "nikkori",
  "el-marcos",
  "bistro",
  "guest-house",
  "brasero",
  "casa-nostra",
  "mochomos",
  "brasero-two",
  "andaluz",
];
const DIMS = [
  "items",
  "options",
  "section_context",
  "categories",
  "grams",
] as const;

/** Stage-1b archive path — page 0 has no suffix, later pages carry `.pN`. */
function structurePath(menu: string, tag: string, page: number): string {
  return page === 0
    ? `${MENU_DIR}/${menu}.${tag}-r1.raw.json`
    : `${MENU_DIR}/${menu}.${tag}-r1.p${page}.raw.json`;
}

/** Runs one menu through the edge with both stages served from cache. */
export async function replayMenu(menu: string, tag: string) {
  const ocrPaths = ocrSourcePaths(menu);
  const reads = await Promise.all(ocrPaths.map(async (path, page) => ({
    // A synthetic photo id per page: the stubs are keyed by identity, never by
    // call order, so the gate cannot depend on how Promise.all resolves.
    photo: `${menu}#${page}`,
    markdown: ocrMarkdown(JSON.parse(await Deno.readTextFile(path))),
    ocrRaw: await Deno.readTextFile(path),
    structureRaw: await Deno.readTextFile(structurePath(menu, tag, page)),
  })));
  const byPhoto = new Map(reads.map((read) => [read.photo, read]));
  const byMarkdown = new Map(reads.map((read) => [read.markdown, read]));
  if (byMarkdown.size !== reads.length) {
    throw new Error(`${menu}: two pages share OCR text — stub cannot key on it`);
  }

  const result = await runPagedExtraction(
    reads.map((read) => read.photo),
    "cached",
    "cached",
    ((photo: string) => {
      const hit = byPhoto.get(photo);
      if (!hit) throw new Error(`no cached OCR for ${photo}`);
      return Promise.resolve({
        markdown: hit.markdown,
        raw_response: hit.ocrRaw,
      });
    }) as Parameters<typeof runPagedExtraction>[3],
    ((markdown: string) => {
      const hit = byMarkdown.get(markdown);
      if (!hit) throw new Error(`no cached structuring for ${menu}`);
      // The edge's OWN parser, not a copy of it (master-roadmap lesson 23).
      const { items } = parseStructureResponse(JSON.parse(hit.structureRaw));
      return Promise.resolve({ items, raw_response: hit.structureRaw });
    }) as Parameters<typeof runPagedExtraction>[4],
  );
  if ("needs_crops" in result) throw new Error(`${menu} returned needs_crops`);
  return result;
}

if (import.meta.main) {
  const menus = (Deno.env.get("MENUS") ?? DEFAULT_MENUS.join(","))
    .split(",").map((menu) => menu.trim()).filter(Boolean);
  let total = 0;

  for (const menu of menus) {
    const tag = Deno.env.get("TAG") ?? menuArchive(menu).single;
    const fixture = JSON.parse(
      await Deno.readTextFile(
        new URL(`./fixtures/${menu}.expected.json`, import.meta.url),
      ),
    );
    const result = await replayMenu(menu, tag);
    const report = scoreMenu(fixture, {
      image_quality: result.image_quality,
      items: result.items,
    });
    const passing = DIMS.filter((dim) => report[dim].pass);
    total += passing.length;
    for (const dim of DIMS) {
      console.log(
        `${report[dim].pass ? "PASS" : "FAIL"} ${menu} ${dim}: ${
          report[dim].detail
        }`,
      );
    }
    console.log(`${menu}: ${passing.length}/5`);
  }
  console.log(`TOTAL ${total}/${menus.length * DIMS.length}`);
}
