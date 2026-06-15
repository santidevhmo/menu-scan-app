import * as FileSystem from "expo-file-system/legacy";
import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from "@supabase/supabase-js";
import { compressImage } from "./compressImage";
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

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const FUNCTION_NAME = "analyze-menu";

/** Builds safe diagnostic details for the analyze-menu edge function call. */
function getSupabaseDebugContext(
  provider: ExtractionProvider,
  photoCount: number,
  totalBase64Chars: number,
) {
  let host = "(invalid url)";
  let projectRef = "(unknown)";

  try {
    const url = new URL(SUPABASE_URL);
    host = url.host;
    projectRef = host.split(".")[0] ?? "(unknown)";
  } catch {}

  return {
    functionName: FUNCTION_NAME,
    functionUrl: SUPABASE_URL
      ? `${SUPABASE_URL}/functions/v1/${FUNCTION_NAME}`
      : "(missing EXPO_PUBLIC_SUPABASE_URL)",
    projectRef,
    host,
    provider,
    stage: "extract",
    photoCount,
    totalBase64Chars,
  };
}

/** Extracts the most useful message from Supabase Edge Function errors. */
async function getFunctionErrorMessage(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = (await error.context.json()) as { error?: string };
      return body.error ?? error.message;
    } catch {
      return error.message;
    }
  }

  if (error instanceof FunctionsFetchError) {
    return `${error.message}. Check EXPO_PUBLIC_SUPABASE_URL, project status, and network reachability.`;
  }

  if (error instanceof FunctionsRelayError) {
    return `${error.message}. Check Supabase Edge Function deployment and relay status.`;
  }

  return error instanceof Error ? error.message : "Unknown Edge Function error";
}

/** Logs failed edge function invocations with request context for debugging. */
function logFunctionInvokeError(context: object, error: unknown) {
  console.warn("[extractMenu] Edge Function invoke failed", {
    ...context,
    errorName: error instanceof Error ? error.name : typeof error,
    errorMessage: error instanceof Error ? error.message : String(error),
  });
}

/** Logs the Stage 1 extraction payload in a readable console block. */
function logExtractionResult(result: ExtractionResult) {
  const title = `STAGE 1 EXTRACTION RESULT: ${result.provider}`;
  const payload = {
    provider: result.provider,
    model_id: result.model_id,
    latency_ms: result.latency_ms,
    item_count: result.items.length,
    error: result.error,
    items: result.items,
    raw_response: result.raw_response ?? null,
  };

  console.log(
    `\n========== ${title} ==========\n${JSON.stringify(payload, null, 2)}\n========== END ${title} ==========\n`,
  );
}

/** Sorts menu items by the first selected goal when a local sort is mapped. */
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

/** Runs the legacy one-stage analysis path and sorts items by selected goals. */
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

/** Runs the live Stage 1 GPT-4o Vision extraction path through Supabase. */
export async function extractMenu(
  photos: ScanPhoto[],
  provider: ExtractionProvider,
): Promise<ExtractionResult> {
  const base64Photos = await Promise.all(
    photos.map(async (p) => {
      const compressed = await compressImage(p.uri, p.width, p.height);
      return FileSystem.readAsStringAsync(compressed.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    }),
  );
  const debugContext = getSupabaseDebugContext(
    provider,
    photos.length,
    base64Photos.reduce((sum, photo) => sum + photo.length, 0),
  );

  console.log("[extractMenu] invoking Edge Function", debugContext);

  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, {
    body: { photos: base64Photos, goals: [], provider, stage: "extract" },
  });

  if (error) {
    logFunctionInvokeError(debugContext, error);
    const errMsg = await getFunctionErrorMessage(error);
    const result: ExtractionResult = {
      provider,
      items: [],
      latency_ms: 0,
      model_id: provider,
      error: errMsg,
    };

    logExtractionResult(result);
    return result;
  }

  if (!data || !Array.isArray(data.items)) {
    const result: ExtractionResult = {
      provider,
      items: [],
      latency_ms: 0,
      model_id: provider,
      error: "Malformed response from analyze-menu (missing items array)",
    };

    logExtractionResult(result);
    return result;
  }

  const result: ExtractionResult = {
    provider,
    items: data.items,
    latency_ms: data.latency_ms,
    model_id: data.model_id,
    error: data.error ?? null,
    raw_response: data.raw_response,
  };

  logExtractionResult(result);
  return result;
}
