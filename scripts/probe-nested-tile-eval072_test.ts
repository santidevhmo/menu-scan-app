import { assert, assertEquals } from "jsr:@std/assert";
import {
  buildInjectedExtract,
  frozenTileResult,
  nestedRects,
  OVERLOADED,
} from "./probe-nested-tile-eval072.ts";
import { extractWithRetry } from "../supabase/functions/analyze-menu/extract.ts";
import type { ExtractionResult } from "../supabase/functions/analyze-menu/extract.ts";
import { gridCropRects } from "../src/lib/adaptiveExtraction.ts";

Deno.test("nestedRects: 2x2, 25%-of-parent bounds", () => {
  const r = nestedRects({ originX: 100, originY: 50, width: 1000, height: 800 });
  assertEquals(r.length, 4);
  assertEquals(r[0], { originX: 100, originY: 50, width: 625, height: 500 });
  assertEquals(r[3], { originX: 475, originY: 350, width: 625, height: 500 });
  for (const s of r) {
    assert(s.originX >= 100 && s.originX + s.width <= 1100);
    assert(s.originY >= 50 && s.originY + s.height <= 850);
  }
  const overlapX = 2 * 625 - 1000;
  assert(overlapX / 625 >= 0.25);
});

Deno.test("nestedRects on the real overloaded parent stays in bounds", () => {
  const parent = gridCropRects(2274, 4032)[OVERLOADED];
  for (const s of nestedRects(parent)) {
    assert(s.originX >= parent.originX);
    assert(s.originY >= parent.originY);
    assert(s.originX + s.width <= parent.originX + parent.width);
    assert(s.originY + s.height <= parent.originY + parent.height);
  }
});

Deno.test("frozenTileResult parses raw, postprocesses items, preserves raw_response", () => {
  const raw = JSON.stringify({
    image_quality: { usable: true, issues: [] },
    image_layout: { dense: false, crop_direction: "none" },
    items: [{
      name: "Tacos",
      description: "",
      price: 50,
      category: "food",
      section_title: null,
      options: [],
    }],
  });
  const r = frozenTileResult(raw);
  assertEquals(r.raw_response, raw);
  assertEquals(r.items.length, 1);
  assertEquals(r.items[0].name, "Tacos");
});

Deno.test("injected extract: frozen hit, 4 nested calls, others passthrough", async () => {
  const frozenResult = {
    image_quality: { usable: true, issues: [] },
    image_layout: { dense: false, crop_direction: "none" },
    items: [],
    raw_response: "frozen",
  } as ExtractionResult;
  const frozen = new Map([["IMG_FROZEN", frozenResult]]);
  const calls: string[] = [];
  const names = ["Tacos", "Sushi", "Curry", "Pasta"];
  const stub = (async (photos: string[]) => {
    calls.push(photos[0]);
    return {
      image_quality: { usable: true, issues: [] },
      image_layout: { dense: false, crop_direction: "none" },
      items: [{
        name: names[calls.length - 1],
        description: "",
        price: 10,
        category: "food",
        section_title: null,
        options: [],
        grams: null,
      }],
      raw_response: `raw-${calls.length}`,
    } as ExtractionResult;
  }) as typeof extractWithRetry;
  const injected = buildInjectedExtract(frozen, "IMG_PARENT2", ["N1", "N2", "N3", "N4"], stub);

  assertEquals((await injected(["IMG_FROZEN"], "key")).raw_response, "frozen");
  assertEquals(calls.length, 0);

  const nestedResult = await injected(["IMG_PARENT2"], "key");
  assertEquals(calls, ["N1", "N2", "N3", "N4"]);
  assertEquals(JSON.parse(nestedResult.raw_response).length, 4);
  assertEquals(nestedResult.items.length, 4);

  await injected(["IMG_OTHER"], "key");
  assertEquals(calls.length, 5);
});
