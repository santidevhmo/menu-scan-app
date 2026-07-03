import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  chunk,
  reassembleEnriched,
  type EnrichedItem,
  type ExtractedItem,
} from "./enrich.ts";
import { runExtraction } from "./extract.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const MODEL_TIMEOUT_MS = 120000;
const ENRICH_BATCH_SIZE = 10; // ponytail: small batches stop GPT-4o early-stopping; tune if drops persist
const ENRICH_SEED = 17; // fixed seed + temperature 0 run-to-run stability

// ── Stage 2: enrichment (gram-based CoT, goal-agnostic) ─────────────────────

const ENRICH_PROMPT = `You estimate the nutrition profile of restaurant menu items. For each item, work step by step:
1. List the most likely ingredients. If the description names them, use them; otherwise infer from the name and category. Tag each ingredient: protein | carb | fat | veg | other.
2. From those ingredients and the likely preparation (e.g. grilled vs fried), estimate per typical single restaurant serving: protein_g, carb_g, fat_g, estimated_calories. If the item's name or description contains explicit weight or portion info — e.g. (280gr), chicken (80gr), 2 chicken breasts sliced — use it as the primary basis for gram estimates rather than a typical portion; prefer printed weights over guesses.
3. Set "confidence" to "low" only when the name and description are evocative or promotional rather than descriptive, leaving you with little ingredient information to go on.
List "allergens" you can infer from the ingredients (e.g. dairy, nuts, gluten, shellfish, egg, soy). Use an empty allergens array when none are inferred; do not include "none". Preserve each item's name, description, price, and category exactly as given. Do NOT sort the items. Return one object per input item, in the same order.`;

const ENRICH_INGREDIENT_PROPS = {
  name: { type: "string" },
  category: { type: "string", enum: ["protein", "carb", "fat", "veg", "other"] },
};

const ENRICH_SCHEMA_GEMINI = {
  type: "array",
  items: {
    type: "object",
    properties: {
      name: { type: "string" },
      description: { type: "string" },
      price: { type: "number", nullable: true },
      category: { type: "string", enum: ["appetizer", "main", "side", "dessert", "drink", "other"] },
      ingredients: { type: "array", items: { type: "object", properties: ENRICH_INGREDIENT_PROPS, required: ["name", "category"] } },
      protein_g: { type: "number" },
      carb_g: { type: "number" },
      fat_g: { type: "number" },
      estimated_calories: { type: "number" },
      confidence: { type: "string", enum: ["high", "medium", "low"] },
      allergens: { type: "array", items: { type: "string" } },
    },
    required: ["name", "description", "price", "category", "ingredients", "protein_g", "carb_g", "fat_g", "estimated_calories", "confidence", "allergens"],
  },
};

const ENRICH_SCHEMA_OPENAI = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          price: { type: ["number", "null"] },
          category: { type: "string", enum: ["appetizer", "main", "side", "dessert", "drink", "other"] },
          ingredients: { type: "array", items: { type: "object", properties: ENRICH_INGREDIENT_PROPS, required: ["name", "category"], additionalProperties: false } },
          protein_g: { type: "number" },
          carb_g: { type: "number" },
          fat_g: { type: "number" },
          estimated_calories: { type: "number" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          allergens: { type: "array", items: { type: "string" } },
        },
        required: ["name", "description", "price", "category", "ingredients", "protein_g", "carb_g", "fat_g", "estimated_calories", "confidence", "allergens"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

/** Wraps fetch with an AbortController timeout for external model calls. */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = MODEL_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Model request timed out after ${timeoutMs / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(id);
  }
}

/** Calls OpenAI chat completions with structured output and returns raw JSON text. */
async function callOpenAIChat(
  model: string,
  content: unknown,
  schema: unknown,
  options?: { temperature?: number; seed?: number },
): Promise<string> {
  const res = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content }],
      response_format: {
        type: "json_schema",
        json_schema: { name: "menu_items", strict: true, schema },
      },
      ...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
      ...(options?.seed !== undefined ? { seed: options.seed } : {}),
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? "OpenAI API error");
  console.log("[openai] finish_reason:", json.choices[0].finish_reason);
  return json.choices[0].message.content as string;
}

/** Builds the enrichment user message: prompt + the extracted items as JSON. */
function buildEnrichContent(items: unknown): string {
  return `${ENRICH_PROMPT}\n\nMenu items (JSON):\n${JSON.stringify(items)}`;
}

/** Enriches one small batch of items with stabilized sampling. */
async function enrichBatch(items: ExtractedItem[]): Promise<EnrichedItem[]> {
  const text = await callOpenAIChat("gpt-4o", buildEnrichContent(items), ENRICH_SCHEMA_OPENAI, {
    temperature: 0,
    seed: ENRICH_SEED,
  });
  return JSON.parse(text).items as EnrichedItem[];
}

/** Enriches a batch, retrying once if the model returns fewer items than sent. */
async function enrichBatchWithRetry(batch: ExtractedItem[]): Promise<EnrichedItem[]> {
  try {
    const first = await enrichBatch(batch);
    if (first.length >= batch.length) return first;
  } catch (err) {
    console.error("[enrich] batch failed, retrying:", err instanceof Error ? err.message : err);
  }

  try {
    return await enrichBatch(batch);
  } catch (err) {
    console.error("[enrich] batch failed twice, backfilling:", err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * GPT-4o text enrichment over extracted items. Splits into small parallel batches
 * to avoid early-stopping/truncation, then reassembles to guarantee one enriched
 * item per input (dropped items are backfilled in enrich.ts).
 */
async function callGptEnrich(items: ExtractedItem[]): Promise<{ items: EnrichedItem[]; raw_response: string }> {
  const batches = chunk(items, ENRICH_BATCH_SIZE);
  const settled = await Promise.all(batches.map(enrichBatchWithRetry));
  const enriched = reassembleEnriched(items, settled.flat());
  return { items: enriched, raw_response: JSON.stringify({ items: enriched }) };
}

/** Gemini text enrichment over extracted items (no photos). */
async function callGeminiEnrich(items: unknown, model: string) {
  const res = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildEnrichContent(items) }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: ENRICH_SCHEMA_GEMINI },
      }),
    },
  );
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? "Gemini API error");
  const text = json.candidates[0].content.parts[0].text;
  return { items: JSON.parse(text), raw_response: text };
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const MAX_PHOTOS = 10;
const MAX_BASE64_LEN = 10_000_000;

/** Returns the standard edge-function 400 response shape. */
function badRequest(message: string): Response {
  return new Response(
    JSON.stringify({ items: [], latency_ms: 0, model_id: "error", error: message }),
    { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
  );
}

/** Deno HTTP handler for validating requests and routing menu analysis stages. */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const { photos, provider, stage, items: inputItems } = await req.json();
    if (typeof provider !== "string") {
      return badRequest("Invalid 'provider'");
    }
    if (stage !== "extract" && stage !== "enrich") {
      return badRequest("Invalid 'stage'");
    }

    // ponytail: trusted server-derived ExtractedItem[]; validate deeper if clients post raw items.
    if (stage === "enrich") {
      if (!Array.isArray(inputItems) || inputItems.length === 0) {
        return badRequest("Invalid 'items': expected a non-empty array of extracted items");
      }

      const start = Date.now();
      let result;
      let modelId: string;

      if (provider === "gpt-4o") {
        result = await callGptEnrich(inputItems as ExtractedItem[]);
        modelId = "gpt-4o";
      } else if (provider === "gemini-2.5-flash") {
        result = await callGeminiEnrich(inputItems, "gemini-2.5-flash");
        modelId = "gemini-2.5-flash";
      } else {
        throw new Error(`Unknown enrichment provider: ${provider}`);
      }

      return new Response(
        JSON.stringify({ items: result.items, raw_response: result.raw_response, latency_ms: Date.now() - start, model_id: modelId }),
        { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    if (
      !Array.isArray(photos) ||
      photos.length === 0 ||
      photos.length > MAX_PHOTOS ||
      !photos.every((p) => typeof p === "string" && p.length <= MAX_BASE64_LEN)
    ) {
      return badRequest("Invalid 'photos': expected 1-10 base64 image strings within size limit");
    }

    const start = Date.now();

    if (stage === "extract") {
      if (provider !== "gpt-vision") {
        throw new Error(`Unknown extraction provider: ${provider}`);
      }
      const result = await runExtraction(photos, OPENAI_API_KEY);

      return new Response(
        JSON.stringify({ items: result.items, raw_response: result.raw_response, latency_ms: Date.now() - start, model_id: "gpt-4o" }),
        { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    return badRequest("Invalid 'stage'");
  } catch (err) {
    return new Response(
      JSON.stringify({
        items: [],
        latency_ms: 0,
        model_id: "error",
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});
