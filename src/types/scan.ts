export type ScanPhotoSource = "camera" | "gallery";

export interface ScanPhoto {
  id: string;
  uri: string;
  width: number;
  height: number;
  source: ScanPhotoSource;
}

export type MenuCategory = "appetizer" | "main" | "side" | "dessert" | "drink" | "other";

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

export type ModelProvider = "gemini-1.5" | "gemini-2.0" | "mistral-ocr" | "gpt-4o";

export interface AnalysisResult {
  provider: ModelProvider;
  items: MenuItem[];
  latency_ms: number;
  model_id: string;
  error: string | null;
}
