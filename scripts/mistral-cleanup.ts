import { mergeItemSources } from "../supabase/functions/analyze-menu/merge.ts";
import type { ExtractedMenuItem } from "../supabase/functions/analyze-menu/extract.ts";
import {
  mistralCleanup,
  toExtractedItems,
} from "../supabase/functions/analyze-menu/mistral-cleanup.ts";
import { MENU_DIR } from "./photo-input.ts";
import {
  MENU_PHOTOS,
  rawPath,
  reshape,
  WIDE_MENUS,
} from "./probe-bakeoff-mistral-b1.ts";

export * from "../supabase/functions/analyze-menu/mistral-cleanup.ts";

if (import.meta.main) {
  const DIR = MENU_DIR;
  const TAG = Deno.env.get("TAG") ?? "b1";
  const runs = Number(Deno.env.get("RUNS") ?? "3");
  const menus = (Deno.env.get("MENUS") ?? WIDE_MENUS.join(",")).split(",")
    .map((m) => m.trim()).filter((m) => m.length > 0);
  for (const m of menus) {
    const photos = MENU_PHOTOS[m];
    if (!photos) throw new Error(`unknown menu: ${m}`);
    for (let r = 1; r <= runs; r++) {
      const perPage: ExtractedMenuItem[][] = [];
      for (const page of photos.keys()) {
        const resp = JSON.parse(
          await Deno.readTextFile(rawPath(DIR, m, TAG, r, page)),
        );
        const p0 = resp.pages?.[0];
        perPage.push(mistralCleanup(
          toExtractedItems(reshape(resp).items),
          p0
            ? {
              blocks: p0.blocks ?? [],
              width: p0.dimensions.width,
              height: p0.dimensions.height,
            }
            : undefined,
        ));
      }
      const cleaned = perPage.length === 1
        ? perPage[0]
        : mergeItemSources(perPage);
      await Deno.writeTextFile(
        `${DIR}/${m}.mistral-${TAG}-r${r}.clean.dump.json`,
        JSON.stringify(
          { image_quality: { usable: true, issues: [] }, items: cleaned },
          null,
          2,
        ),
      );
    }
  }
  console.log("clean dumps written for", menus.join(", "), `x${runs}`);
}
