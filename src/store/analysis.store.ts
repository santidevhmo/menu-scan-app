import { create } from "zustand";
import type { EnrichmentResult, ExtractionResult } from "@/types/scan";

interface AnalysisState {
  extraction: ExtractionResult | null;
  extractionLoading: boolean;
  enrichment: EnrichmentResult | null;
  enrichmentLoading: boolean;
  setExtraction: (result: ExtractionResult) => void;
  setExtractionLoading: (loading: boolean) => void;
  setEnrichment: (result: EnrichmentResult) => void;
  setEnrichmentLoading: (loading: boolean) => void;
  clear: () => void;
}

/** Stores the current menu extraction + enrichment results and loading states. */
export const useAnalysisStore = create<AnalysisState>((set) => ({
  extraction: null,
  extractionLoading: false,
  enrichment: null,
  enrichmentLoading: false,
  setExtraction: (extraction) => set({ extraction }),
  setExtractionLoading: (extractionLoading) => set({ extractionLoading }),
  setEnrichment: (enrichment) => set({ enrichment }),
  setEnrichmentLoading: (enrichmentLoading) => set({ enrichmentLoading }),
  clear: () =>
    set({
      extraction: null,
      extractionLoading: false,
      enrichment: null,
      enrichmentLoading: false,
    }),
}));
