import * as FileSystem from "expo-file-system/legacy";
import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from "@supabase/supabase-js";
import { compressImage } from "./compressImage";
import { supabase } from "./supabase";
import { scoreAndSort, type GoalVector } from "./zScoreSort";
import { GOAL_PAIRS, GROUP_TO_MACRO, type MacroField } from "@/data/goals";
import type {
  ScanPhoto,
  ExtractionProvider,
  ExtractionResult,
  EnrichmentProvider,
  EnrichmentResult,
  ExtractedItem,
  EnrichedItem,
  ScoredItem,
} from "@/types/scan";

const GOALS_SORT_MAP: Record<
  string,
  {
    field: "protein_g" | "carb_g" | "fat_g" | "estimated_calories";
    order: "asc" | "desc";
  }
> = {
  "Highest in protein": { field: "protein_g", order: "desc" },
  "Low protein": { field: "protein_g", order: "asc" },
  "Low calorie": { field: "estimated_calories", order: "asc" },
  "High calorie": { field: "estimated_calories", order: "desc" },
  "High carb": { field: "carb_g", order: "desc" },
  "Low carb": { field: "carb_g", order: "asc" },
  "High fat": { field: "fat_g", order: "desc" },
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

/** Sorts menu items by all selected goals using z-score normalization. */
export function sortItemsByGoals(
  items: EnrichedItem[],
  goals: string[],
): ScoredItem[] {
  const vectors: GoalVector[] = goals.flatMap((goal) => {
    const cfg = GOALS_SORT_MAP[goal];
    if (!cfg) return [];

    return [
      {
        name: goal,
        field: cfg.field,
        direction: cfg.order === "desc" ? 1 : -1,
      },
    ];
  });
  return scoreAndSort(items, vectors) as ScoredItem[];
}

/** The macro fields the user is actively ranking by. */
export function selectedMacros(goals: string[]): Set<MacroField> {
  const macros = new Set<MacroField>();
  for (const pair of GOAL_PAIRS) {
    if (goals.includes(pair.high) || goals.includes(pair.low)) {
      macros.add(GROUP_TO_MACRO[pair.group]);
    }
  }
  return macros;
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

/** Runs the Stage 2 gram-based enrichment for one provider over cached items. */
export async function enrichMenu(
  items: ExtractedItem[],
  provider: EnrichmentProvider,
): Promise<EnrichmentResult> {
  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, {
    body: { items, provider, stage: "enrich" },
  });

  if (error) {
    const errMsg = await getFunctionErrorMessage(error);
    return {
      provider,
      items: [],
      latency_ms: 0,
      model_id: provider,
      error: errMsg,
    };
  }

  if (!data || !Array.isArray(data.items)) {
    return {
      provider,
      items: [],
      latency_ms: 0,
      model_id: provider,
      error: "Malformed enrichment response (missing items array)",
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
