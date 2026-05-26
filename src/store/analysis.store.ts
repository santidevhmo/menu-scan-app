import { create } from "zustand";
import type { AnalysisResult, ModelProvider } from "@/types/scan";

const ALL_PROVIDERS: ModelProvider[] = ["gemini-1.5", "gemini-2.0", "mistral-ocr", "gpt-4o"];

function emptyRecord<T>(value: T): Record<ModelProvider, T> {
  return Object.fromEntries(ALL_PROVIDERS.map((p) => [p, value])) as Record<ModelProvider, T>;
}

interface AnalysisState {
  results: Record<ModelProvider, AnalysisResult | null>;
  loading: Record<ModelProvider, boolean>;
  activeTab: ModelProvider;
  setResult: (provider: ModelProvider, result: AnalysisResult) => void;
  setLoading: (provider: ModelProvider, loading: boolean) => void;
  setActiveTab: (tab: ModelProvider) => void;
  clear: () => void;
}

export const useAnalysisStore = create<AnalysisState>((set) => ({
  results: emptyRecord(null),
  loading: emptyRecord(false),
  activeTab: "gemini-2.0",
  setResult: (provider, result) =>
    set((s) => ({ results: { ...s.results, [provider]: result } })),
  setLoading: (provider, loading) =>
    set((s) => ({ loading: { ...s.loading, [provider]: loading } })),
  setActiveTab: (tab) => set({ activeTab: tab }),
  clear: () => set({ results: emptyRecord(null), loading: emptyRecord(false) }),
}));

export { ALL_PROVIDERS };
