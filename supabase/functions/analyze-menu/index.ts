import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const MODEL_TIMEOUT_MS = 120000;

// ── Stage 1: extraction (zero nutrition) ────────────────────────────────────

const EXTRACT_PROMPT = `Read this restaurant menu. Return every item exactly as printed, in menu order:
name, description, price, category (appetizer|main|side|dessert|drink|other).
Do NOT estimate calories or nutrition. Do NOT invent items you cannot read.
Extract all visible menu items from every provided photo and every menu section.
Do not stop after a representative sample, a section summary, or the first page.
There is no maximum number of items; keep going until every readable item is returned.
If a description is not printed, use an empty string. If a price is not printed, set it to null.`;

// JSON-schema (OpenAI/Mistral structured-output shape) — extraction only, no nutrition
const EXTRACT_SCHEMA = {
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
        },
        required: ["name", "description", "price", "category"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

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
async function callOpenAIChat(model: string, content: unknown, schema: unknown): Promise<string> {
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
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? "OpenAI API error");
  return json.choices[0].message.content as string;
}

/** Calls GPT-4o Vision for Stage 1 menu text extraction only. */
async function callGptExtract(photos: string[]) {
  const content = [
    { type: "text", text: EXTRACT_PROMPT },
    ...photos.map((b64) => ({
      type: "image_url",
      image_url: { url: `data:image/jpeg;base64,${b64}` },
    })),
  ];
  const text = await callOpenAIChat("gpt-4o", content, EXTRACT_SCHEMA);
  return { items: JSON.parse(text).items, raw_response: text };
}

/** Builds the enrichment user message: prompt + the extracted items as JSON. */
function buildEnrichContent(items: unknown): string {
  return `${ENRICH_PROMPT}\n\nMenu items (JSON):\n${JSON.stringify(items)}`;
}

/** GPT-4o text enrichment over extracted items (reuses callOpenAIChat). */
async function callGptEnrich(items: unknown) {
  const text = await callOpenAIChat("gpt-4o", buildEnrichContent(items), ENRICH_SCHEMA_OPENAI);
  return { items: JSON.parse(text).items, raw_response: text };
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
        result = await callGptEnrich(inputItems);
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
      const result = await callGptExtract(photos);

      return new Response(
        JSON.stringify({ items: result.items, raw_response: result.raw_response, latency_ms: Date.now() - start, model_id: "gpt-4o" }),
        { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }
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
