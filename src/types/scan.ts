import type { ScanErrorCode } from "@/lib/scanError";

export type ScanPhotoSource = "camera" | "gallery";

export interface ScanPhoto {
  id: string;
  uri: string;
  width: number;
  height: number;
  source: ScanPhotoSource;
}

export type MenuCategory = "food" | "side" | "dessert" | "drink" | "other";
export type CropDirection = "none" | "left_right" | "top_bottom";

export interface ImageLayout {
  dense: boolean;
  crop_direction: CropDirection;
}

// ── Phase 2: two-stage extraction / enrichment ──────────────────────────────

// Stage 1 output — what a menu literally says (no nutrition)
export interface ExtractedItem {
  name: string;
  description: string;
  price: number | null;
  category: MenuCategory;
  section_title: string | null;
  options: { name: string; price: number | null; grams: number | null }[];
  // Printed item weight in grams, parsed deterministically from name/description
  // by postprocess (parseItemGrams) — NOT model-filled.
  grams: number | null;
}

// Stage 2 reasoning substrate — ingredient tagged by macro category
export interface EnrichedIngredient {
  name: string;
  category: "protein" | "carb" | "fat" | "veg" | "other";
}

// Stage 2 output — extraction + gram-based nutrition estimate (CoT, goal-agnostic)
export interface EnrichedItem extends ExtractedItem {
  ingredients: EnrichedIngredient[];
  protein_g: number;
  carb_g: number;
  fat_g: number;
  estimated_calories: number;
  /** Pieces the item is served as (pizza slices, sushi pcs); null if eaten whole. */
  serving_pieces?: number | null;
  confidence: "high" | "medium" | "low";
  allergens: string[];
}

export interface ScoredItem extends EnrichedItem {
  alignment_score: number;
  goal_scores: Record<string, number>;
}

export interface EnrichmentResult {
  provider: EnrichmentProvider;
  items: EnrichedItem[];
  latency_ms: number;
  model_id: string;
  /** ⚠️ DEVELOPER-FACING. Logs only — never render it. It carries function
   *  names and environment hints on purpose. Render `scanErrorCopy(error_code)`
   *  instead (§5 of docs/backend-changes-required.md). */
  error: string | null;
  /** What the UI maps to copy and to an action. Null when there was no error. */
  error_code?: ScanErrorCode | null;
  raw_response?: string;
}

export type ExtractionProvider = "gpt-vision";
export type EnrichmentProvider = "gpt-4o";
export type PipelineStage = "extract" | "enrich";

/** Readability of one page of a scan. A scan is 1–10 pages of ONE menu, and
 *  the interface counts pages, never photos — see /CONTEXT.md → Page. */
export type PageOutcome = "ok" | "unreadable" | "readable_no_items";

export interface PageVerdict {
  /** 1-based, so it can be shown as-is ("Page 2 of 3"). */
  page: number;
  outcome: PageOutcome;
  /** User-safe copy, null when `outcome` is "ok". Safe to render verbatim. */
  reason: string | null;
  /** Diagnostic only. Never show this to a user. */
  ocr_chars: number;
}

/** What the whole scan amounts to, DERIVED from the page verdicts — the server
 *  never sends this. Three cases, because the UX branches three ways. */
export type ScanOutcome =
  /** At least one item was found. Proceed to results. */
  | "ok"
  /** Some pages unreadable, but not all — offer a per-page re-scan. */
  | "partial"
  /** Every page unreadable, or nothing found anywhere. Dead end. */
  | "unusable";

export interface ExtractionResult {
  provider: ExtractionProvider;
  items: ExtractedItem[];
  image_layout: ImageLayout | null;
  latency_ms: number;
  model_id: string;
  /** ⚠️ DEVELOPER-FACING. Logs only — never render it. See EnrichmentResult. */
  error: string | null;
  /** What the UI maps to copy and to an action. Null when there was no error. */
  error_code?: ScanErrorCode | null;
  raw_response?: string;
  /** One verdict per page, in page order. Empty when the server made no
   *  per-page judgement (the dense-crop path, where a page becomes four
   *  tiles and attribution is not yet solved) — treat empty as "cannot
   *  offer a per-page re-scan", not as "every page was fine". */
  pages: PageVerdict[];
}
