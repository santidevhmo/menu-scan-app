export type ScanPhotoSource = "camera" | "gallery";

export interface ScanPhoto {
  id: string;
  uri: string;
  width: number;
  height: number;
  source: ScanPhotoSource;
}

export type MenuCategory =
  | "appetizer"
  | "main"
  | "side"
  | "dessert"
  | "drink"
  | "other";

// ── Phase 2: two-stage extraction / enrichment ──────────────────────────────

// Stage 1 output — what a menu literally says (no nutrition)
export interface ExtractedItem {
  name: string;
  description: string;
  price: number | null;
  category: MenuCategory;
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
  confidence: "high" | "medium" | "low";
  allergens: string[];
}

export interface EnrichmentResult {
  provider: EnrichmentProvider;
  items: EnrichedItem[];
  latency_ms: number;
  model_id: string;
  error: string | null;
  raw_response?: string;
}

export type ExtractionProvider = "gpt-vision";
export type EnrichmentProvider = "gemini-2.5-flash" | "gpt-4o";
export type PipelineStage = "extract" | "enrich";

export interface ExtractionResult {
  provider: ExtractionProvider;
  items: ExtractedItem[];
  latency_ms: number;
  model_id: string;
  error: string | null;
  raw_response?: string;
}
