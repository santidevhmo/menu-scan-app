import type { ExtractionResult } from "../supabase/functions/analyze-menu/extract.ts";

export type ProbeDump = Pick<
  ExtractionResult,
  "image_quality" | "items" | "raw_response"
>;

export function buildProbeDump(result: ExtractionResult): ProbeDump {
  return {
    image_quality: result.image_quality,
    items: result.items,
    raw_response: result.raw_response,
  };
}
