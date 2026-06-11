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

export interface MenuItem {
  name: string;
  description: string;
  price: number | null;
  category: MenuCategory;
  estimated_calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  dietary_tags: string[];
  allergens: string[];
}

export type ModelProvider =
  | "gemini-2.5-flash"
  | "gemini-2.5-pro"
  | "mistral-ocr"
  | "gpt-4o";

export interface AnalysisResult {
  provider: ModelProvider;
  items: MenuItem[];
  latency_ms: number;
  model_id: string;
  error: string | null;
  raw_response?: string;
}

// ── Phase 2: two-stage extraction / enrichment ──────────────────────────────

// Stage 1 output — what a menu literally says (no nutrition)
export interface ExtractedItem {
  name: string;
  description: string;
  price: number | null;
  category: MenuCategory;
}

// Stage 2 output — extraction + estimated nutrition (defined now, used in Stage 2)
export interface EnrichedItem extends ExtractedItem {
  estimated_calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  dietary_tags: string[];
  allergens: string[];
}

export type ExtractionProvider = "google-vision" | "mistral-ocr" | "gpt-vision";
export type EnrichmentProvider =
  | "gemini-2.5-flash"
  | "gemini-2.5-pro"
  | "gpt-4o"
  | "mistral-large";
export type PipelineStage = "extract" | "enrich";

export interface ExtractionResult {
  provider: ExtractionProvider;
  items: ExtractedItem[];
  latency_ms: number;
  model_id: string;
  error: string | null;
  raw_response?: string;
}
