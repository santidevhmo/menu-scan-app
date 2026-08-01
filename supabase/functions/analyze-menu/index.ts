import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  chunk,
  type EnrichedItem,
  type ExtractedItem,
  reassembleEnriched,
} from "./enrich.ts";
import {
  runCropExtractions,
  runGroupedExtraction,
  runPagedExtraction,
} from "./extract.ts";
import { isValidOcrPhotos } from "./request-validation.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const MISTRAL_API_KEY = Deno.env.get("MISTRAL_API_KEY")!;
const MODEL_TIMEOUT_MS = 120000;
const ENRICH_BATCH_SIZE = 10; // ponytail: small batches stop GPT-4o early-stopping; tune if drops persist
const ENRICH_SEED = 17; // fixed seed + temperature 0 run-to-run stability

// ── Stage 2: enrichment (gram-based CoT, goal-agnostic) ─────────────────────

const ENRICH_PROMPT =
  `You estimate the nutrition profile of restaurant menu items. For each item, work step by step:
1. List the most likely ingredients. If the description names them, use them; otherwise infer from the name and category. Tag each ingredient: protein | carb | fat | veg | other.
2. From those ingredients and the likely preparation (e.g. grilled vs fried), estimate per typical single restaurant serving: protein_g, carb_g, fat_g, estimated_calories. If the item's name or description contains explicit weight or portion info — e.g. (280gr), chicken (80gr), 2 chicken breasts sliced — use it as the primary basis for gram estimates rather than a typical portion; prefer printed weights over guesses.
3. Set "confidence" to "low" only when the name and description are evocative or promotional rather than descriptive, leaving you with little ingredient information to go on.
List "allergens" you can infer from the ingredients (e.g. dairy, nuts, gluten, shellfish, egg, soy). Use an empty allergens array when none are inferred; do not include "none". Preserve each item's name, description, price, and category exactly as given. Do NOT sort the items. Return one object per input item, in the same order.`;

const ENRICH_INGREDIENT_PROPS = {
  name: { type: "string" },
  category: {
    type: "string",
    enum: ["protein", "carb", "fat", "veg", "other"],
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
          category: {
            type: "string",
            enum: ["food", "side", "dessert", "drink", "other"],
          },
          ingredients: {
            type: "array",
            items: {
              type: "object",
              properties: ENRICH_INGREDIENT_PROPS,
              required: ["name", "category"],
              additionalProperties: false,
            },
          },
          protein_g: { type: "number" },
          carb_g: { type: "number" },
          fat_g: { type: "number" },
          estimated_calories: { type: "number" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          allergens: { type: "array", items: { type: "string" } },
        },
        required: [
          "name",
          "description",
          "price",
          "category",
          "ingredients",
          "protein_g",
          "carb_g",
          "fat_g",
          "estimated_calories",
          "confidence",
          "allergens",
        ],
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
  const res = await fetchWithTimeout(
    "https://api.openai.com/v1/chat/completions",
    {
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
        ...(options?.temperature !== undefined
          ? { temperature: options.temperature }
          : {}),
        ...(options?.seed !== undefined ? { seed: options.seed } : {}),
      }),
    },
  );
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
  const text = await callOpenAIChat(
    "gpt-4o",
    buildEnrichContent(items),
    ENRICH_SCHEMA_OPENAI,
    {
      temperature: 0,
      seed: ENRICH_SEED,
    },
  );
  return JSON.parse(text).items as EnrichedItem[];
}

/** Enriches a batch, retrying once if the model returns fewer items than sent. */
async function enrichBatchWithRetry(
  batch: ExtractedItem[],
): Promise<EnrichedItem[]> {
  try {
    const first = await enrichBatch(batch);
    if (first.length >= batch.length) return first;
  } catch (err) {
    console.error(
      "[enrich] batch failed, retrying:",
      err instanceof Error ? err.message : err,
    );
  }

  try {
    return await enrichBatch(batch);
  } catch (err) {
    console.error(
      "[enrich] batch failed twice, backfilling:",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

/**
 * GPT-4o text enrichment over extracted items. Splits into small parallel batches
 * to avoid early-stopping/truncation, then reassembles to guarantee one enriched
 * item per input (dropped items are backfilled in enrich.ts).
 */
async function callGptEnrich(
  items: ExtractedItem[],
): Promise<{ items: EnrichedItem[]; raw_response: string }> {
  const batches = chunk(items, ENRICH_BATCH_SIZE);
  const settled = await Promise.all(batches.map(enrichBatchWithRetry));
  const enriched = reassembleEnriched(items, settled.flat());
  return { items: enriched, raw_response: JSON.stringify({ items: enriched }) };
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
const MAX_PHOTOS = 10;
const MAX_BASE64_LEN = 10_000_000;

/** Returns the standard edge-function 400 response shape. */
function badRequest(message: string): Response {
  return new Response(
    JSON.stringify({
      items: [],
      latency_ms: 0,
      model_id: "error",
      error: message,
    }),
    {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    },
  );
}

/** Deno HTTP handler for validating requests and routing menu analysis stages. */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const { photos, pages, ocr_photos, provider, stage, items: inputItems } =
      await req.json();
    if (typeof provider !== "string") {
      return badRequest("Invalid 'provider'");
    }
    if (
      stage !== "extract" &&
      stage !== "extract-crops" &&
      stage !== "extract-pages" &&
      stage !== "enrich"
    ) {
      return badRequest("Invalid 'stage'");
    }

    // ponytail: trusted server-derived ExtractedItem[]; validate deeper if clients post raw items.
    if (stage === "enrich") {
      if (!Array.isArray(inputItems) || inputItems.length === 0) {
        return badRequest(
          "Invalid 'items': expected a non-empty array of extracted items",
        );
      }

      const start = Date.now();
      let result;
      let modelId: string;

      if (provider === "gpt-4o") {
        result = await callGptEnrich(inputItems as ExtractedItem[]);
        modelId = "gpt-4o";
      } else {
        throw new Error(`Unknown enrichment provider: ${provider}`);
      }

      return new Response(
        JSON.stringify({
          items: result.items,
          raw_response: result.raw_response,
          latency_ms: Date.now() - start,
          model_id: modelId,
        }),
        { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    if (stage === "extract-pages") {
      if (provider !== "gpt-vision") {
        throw new Error(`Unknown extraction provider: ${provider}`);
      }
      if (
        !Array.isArray(pages) || pages.length === 0 ||
        pages.length > MAX_PHOTOS ||
        !pages.every((group: unknown) =>
          Array.isArray(group) &&
          (group.length === 1 || group.length === 4) &&
          group.every((p) =>
            typeof p === "string" && p.length <= MAX_BASE64_LEN
          )
        )
      ) {
        return badRequest(
          "Invalid 'pages': expected 1-10 groups of 1 or 4 base64 images",
        );
      }
      if (!isValidOcrPhotos(ocr_photos, pages.length)) {
        return badRequest("Invalid 'ocr_photos'");
      }
      const start = Date.now();
      const result = await runGroupedExtraction(
        pages,
        OPENAI_API_KEY,
        undefined,
        undefined,
        ocr_photos ?? [],
      );
      return new Response(
        JSON.stringify({
          image_quality: result.image_quality,
          image_layout: result.image_layout,
          items: result.items,
          raw_response: result.raw_response,
          latency_ms: Date.now() - start,
          model_id: "gpt-4o",
        }),
        { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    if (
      !Array.isArray(photos) ||
      photos.length === 0 ||
      photos.length > MAX_PHOTOS ||
      !photos.every((p) => typeof p === "string" && p.length <= MAX_BASE64_LEN)
    ) {
      return badRequest(
        "Invalid 'photos': expected 1-10 base64 image strings within size limit",
      );
    }

    const start = Date.now();

    if (stage === "extract-crops") {
      if (
        provider !== "gpt-vision" ||
        !Array.isArray(photos) ||
        (photos.length !== 2 && photos.length !== 3)
      ) {
        return badRequest("Invalid crop extraction request");
      }
      const regions = await runCropExtractions(photos, OPENAI_API_KEY);
      return new Response(
        JSON.stringify({
          regions: regions.map((region) => ({
            image_quality: region.image_quality,
            items: region.items,
          })),
          latency_ms: Date.now() - start,
          model_id: "gpt-4o",
        }),
        { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    if (stage === "extract") {
      if (provider !== "gpt-vision") {
        throw new Error(`Unknown extraction provider: ${provider}`);
      }
      // Per-page multi-photo recipe (iter-036): N photos ⇒ N parallel calls
      // merged into ONE menu; 1 photo ⇒ one call. Same path the eval gate proves.
      const result = await runPagedExtraction(photos, MISTRAL_API_KEY, OPENAI_API_KEY);
      if ("needs_crops" in result) {
        // Dense page(s) detected: client must cut originals into 2x2 tiles
        // and re-submit everything via stage:"extract-pages".
        return new Response(
          JSON.stringify({
            needs_crops: result.needs_crops,
            latency_ms: Date.now() - start,
            model_id: "mistral-ocr-4-0+gpt-4.1-2025-04-14",
          }),
          { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({
          image_quality: result.image_quality,
          image_layout: result.image_layout,
          items: result.items,
          raw_response: result.raw_response,
          latency_ms: Date.now() - start,
          model_id: "mistral-ocr-4-0+gpt-4.1-2025-04-14",
        }),
        { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
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
      {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  }
});
