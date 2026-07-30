import {
  type MistralExtraction,
  mistralPage,
  reshapeMistral,
} from "../supabase/functions/analyze-menu/mistral-extract.ts";
import { runPagedExtraction } from "../supabase/functions/analyze-menu/extract.ts";
import { scoreMenu } from "./eval-extraction.ts";
import { MENU_PHOTOS, rawPath } from "./probe-bakeoff-mistral-b1.ts";

type Fixture = Parameters<typeof scoreMenu>[0];

const DIR = `${Deno.env.get("HOME")}/Downloads/MenusTesting`;
const TAG = Deno.env.get("TAG") ?? "b1";
const RUNS = Number(Deno.env.get("RUNS") ?? "3");
const DIMS = [
  "items",
  "options",
  "section_context",
  "categories",
  "grams",
] as const;

async function cachedExtraction(
  menu: string,
  run: number,
  page: number,
): Promise<MistralExtraction> {
  const raw_response = await Deno.readTextFile(
    rawPath(DIR, menu, TAG, run, page),
  );
  const raw = JSON.parse(raw_response);
  return { items: reshapeMistral(raw), page: mistralPage(raw), raw_response };
}

const MENUS = (Deno.env.get("MENUS") ?? Object.keys(MENU_PHOTOS).join(","))
  .split(",").map((m) => m.trim()).filter((m) => m.length > 0);

let total = 0;
for (const menu of MENUS) {
  const fixture = JSON.parse(
    await Deno.readTextFile(
      new URL(`./fixtures/${menu}.expected.json`, import.meta.url),
    ),
  ) as Fixture;
  for (let run = 1; run <= RUNS; run++) {
    const cached = await Promise.all(
      MENU_PHOTOS[menu].map((_, page) => cachedExtraction(menu, run, page)),
    );
    // Key the stub by PHOTO, not by call order — the gate must not depend on
    // the order runPagedExtraction happens to invoke its extractor in.
    const byPhoto = new Map(MENU_PHOTOS[menu].map((p, i) => [p, cached[i]]));
    const result = await runPagedExtraction(
      MENU_PHOTOS[menu],
      "cached",
      ((photo: string) => {
        const hit = byPhoto.get(photo);
        if (!hit) throw new Error(`no cached response for ${photo}`);
        return Promise.resolve(hit);
      }) as typeof import("../supabase/functions/analyze-menu/mistral-extract.ts").extractMistralWithRetry,
    );
    if ("needs_crops" in result) throw new Error("unexpected needs_crops");
    const report = scoreMenu(fixture, result);
    const passing = DIMS.filter((dim) => report[dim].pass);
    total += passing.length;
    console.log(`${menu} r${run}: ${passing.length}/5 ${passing.join(",")}`);
  }
}
console.log(`TOTAL ${total}`);
