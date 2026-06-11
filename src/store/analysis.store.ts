import { create } from "zustand";
import type { ExtractionResult, ExtractionProvider } from "@/types/scan";

const ALL_PROVIDERS: ExtractionProvider[] = [
  "google-vision",
  "mistral-ocr",
  "gpt-vision",
];

function emptyRecord<T>(value: T): Record<ExtractionProvider, T> {
  return Object.fromEntries(ALL_PROVIDERS.map((p) => [p, value])) as Record<
    ExtractionProvider,
    T
  >;
}

interface AnalysisState {
  results: Record<ExtractionProvider, ExtractionResult | null>;
  loading: Record<ExtractionProvider, boolean>;
  activeTab: ExtractionProvider;
  setResult: (provider: ExtractionProvider, result: ExtractionResult) => void;
  setLoading: (provider: ExtractionProvider, loading: boolean) => void;
  setActiveTab: (tab: ExtractionProvider) => void;
  clear: () => void;
}

export const useAnalysisStore = create<AnalysisState>((set) => ({
  results: emptyRecord(null),
  loading: emptyRecord(false),
  activeTab: "google-vision",
  setResult: (provider, result) =>
    set((s) => ({ results: { ...s.results, [provider]: result } })),
  setLoading: (provider, loading) =>
    set((s) => ({ loading: { ...s.loading, [provider]: loading } })),
  setActiveTab: (tab) => set({ activeTab: tab }),
  clear: () => set({ results: emptyRecord(null), loading: emptyRecord(false) }),
}));

export { ALL_PROVIDERS };
