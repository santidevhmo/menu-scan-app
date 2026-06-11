import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "./supabase";
import type {
  ScanPhoto,
  ModelProvider,
  MenuItem,
  AnalysisResult,
  ExtractionProvider,
  ExtractionResult,
} from "@/types/scan";

const GOALS_SORT_MAP: Record<
  string,
  { field: keyof MenuItem; order: "asc" | "desc" }
> = {
  "Highest in protein": { field: "protein_g", order: "desc" },
  "Low calorie": { field: "estimated_calories", order: "asc" },
  "High carb": { field: "carbs_g", order: "desc" },
  "Low fat": { field: "fat_g", order: "asc" },
};

export function sortItemsByGoals(
  items: MenuItem[],
  goals: string[],
): MenuItem[] {
  const goal = goals[0];
  const sortConfig = goal ? GOALS_SORT_MAP[goal] : undefined;
  if (!sortConfig) return items;
  return [...items].sort((a, b) => {
    const aVal = a[sortConfig.field] as number;
    const bVal = b[sortConfig.field] as number;
    return sortConfig.order === "desc" ? bVal - aVal : aVal - bVal;
  });
}

export async function analyzeMenu(
  photos: ScanPhoto[],
  goals: string[],
  provider: ModelProvider,
): Promise<AnalysisResult> {
  const base64Photos = await Promise.all(
    photos.map((p) =>
      FileSystem.readAsStringAsync(p.uri, {
        encoding: FileSystem.EncodingType.Base64,
      }),
    ),
  );

  const { data, error } = await supabase.functions.invoke("analyze-menu", {
    body: { photos: base64Photos, goals, provider },
  });

  if (error) {
    let errMsg = error.message;
    try {
      const body = await (
        error as { context?: { json?: () => Promise<{ error?: string }> } }
      ).context?.json?.();
      if (body?.error) errMsg = body.error;
    } catch {}
    return {
      provider,
      items: [],
      latency_ms: 0,
      model_id: provider,
      error: errMsg,
    };
  }

  const sortedItems = sortItemsByGoals(data.items, goals);

  console.log(
    `[analyzeMenu] ${provider} raw_response:\n`,
    data.raw_response ?? "(none)",
  );

  return {
    provider,
    items: sortedItems,
    latency_ms: data.latency_ms,
    model_id: data.model_id,
    error: data.error ?? null,
    raw_response: data.raw_response,
  };
}

export async function extractMenu(
  photos: ScanPhoto[],
  provider: ExtractionProvider,
): Promise<ExtractionResult> {
  const base64Photos = await Promise.all(
    photos.map((p) =>
      FileSystem.readAsStringAsync(p.uri, {
        encoding: FileSystem.EncodingType.Base64,
      }),
    ),
  );

  const { data, error } = await supabase.functions.invoke("analyze-menu", {
    body: { photos: base64Photos, goals: [], provider, stage: "extract" },
  });

  if (error) {
    let errMsg = error.message;
    try {
      const body = await (
        error as { context?: { json?: () => Promise<{ error?: string }> } }
      ).context?.json?.();
      if (body?.error) errMsg = body.error;
    } catch {}
    return {
      provider,
      items: [],
      latency_ms: 0,
      model_id: provider,
      error: errMsg,
    };
  }

  return {
    provider,
    items: data.items,
    latency_ms: data.latency_ms,
    model_id: data.model_id,
    error: data.error ?? null,
    raw_response: data.raw_response,
  };
}
