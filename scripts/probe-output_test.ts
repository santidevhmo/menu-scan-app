import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import type { ExtractionResult } from "../supabase/functions/analyze-menu/extract.ts";
import { buildProbeDump } from "./probe-output.ts";

Deno.test("buildProbeDump preserves final items and raw tile responses", () => {
  const result: ExtractionResult = {
    image_quality: { usable: true, issues: [] },
    image_layout: { dense: true, crop_direction: "left_right" },
    items: [],
    raw_response: '["tile-1","tile-2"]',
  };

  assertEquals(buildProbeDump(result), {
    image_quality: result.image_quality,
    items: result.items,
    raw_response: result.raw_response,
  });
});
