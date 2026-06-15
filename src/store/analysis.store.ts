import { create } from "zustand";
import type { ExtractionResult } from "@/types/scan";

interface AnalysisState {
  extraction: ExtractionResult | null;
  extractionLoading: boolean;
  setExtraction: (result: ExtractionResult) => void;
  setExtractionLoading: (loading: boolean) => void;
  clear: () => void;
}

/** Stores the current menu extraction result and loading state. */
export const useAnalysisStore = create<AnalysisState>((set) => ({
  extraction: null,
  extractionLoading: false,
  setExtraction: (extraction) => set({ extraction }),
  setExtractionLoading: (extractionLoading) => set({ extractionLoading }),
  clear: () => set({ extraction: null, extractionLoading: false }),
}));
