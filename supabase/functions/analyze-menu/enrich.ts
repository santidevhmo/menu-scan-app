// Stage 2 enrichment helpers. Kept separate from index.ts, which calls serve().
export interface ExtractedItem {
  name: string;
  description: string;
  price: number | null;
  category: string;
}

export type IngredientCategory = "protein" | "carb" | "fat" | "veg" | "other";

export interface EnrichedItem extends ExtractedItem {
  ingredients: {
    name: string;
    category: IngredientCategory;
    grams: number;
    protein_g: number;
    carb_g: number;
    fat_g: number;
  }[];
  protein_g: number;
  carb_g: number;
  fat_g: number;
  estimated_calories: number;
  confidence: "high" | "medium" | "low";
  allergens: string[];
}

// ── Stage 2 prompt + schema ─────────────────────────────────────────────────
// Exported so offline harnesses run the real prompt rather than a copy.
export const ENRICH_PROMPT =
  `You estimate the nutrition profile of restaurant menu items. For each item, work step by step:
1. List the most likely ingredients. If the description names them, use them; otherwise infer from the name and category. Tag each ingredient: protein | carb | fat | veg | other, and give its edible weight in grams for one serving. If the item's name or description contains explicit weight or portion info — e.g. (280gr), chicken (80gr), 2 chicken breasts sliced — use it as the primary basis for gram estimates rather than a typical portion; prefer printed weights over guesses.
2. For each ingredient, give the protein_g, carb_g and fat_g that AT THAT GRAM WEIGHT contributes — not per 100 g, but the actual amount in this serving. Work from the ingredient's real composition and its preparation (e.g. grilled vs fried, dressing and cream are mostly fat). Most vegetables and tomato-based sauces are mostly water and contribute far less carbohydrate than their volume suggests; reserve high carb_g values for grains, bread, tortilla, rice, potato, corn kernels, legumes and sugar. The item's totals are added up from these, rather than estimating the totals directly, so each ingredient's numbers must stand on their own.
3. Set "confidence" to "low" only when the name and description are evocative or promotional rather than descriptive, leaving you with little ingredient information to go on.
List "allergens" you can infer from the ingredients (e.g. dairy, nuts, gluten, shellfish, egg, soy). Use an empty allergens array when none are inferred; do not include "none". Preserve each item's name, description, price, and category exactly as given. Do NOT sort the items. Return one object per input item, in the same order.`;

const ENRICH_INGREDIENT_PROPS = {
  name: { type: "string" },
  category: {
    type: "string",
    enum: ["protein", "carb", "fat", "veg", "other"],
  },
  // Makes the model commit to a portion out loud before it totals anything.
  // Required, not optional: strict mode only emits required fields.
  grams: { type: "number" },
  // B10: the model supplies each ingredient's contribution; sumIngredientMacros
  // adds them up. Grams first so the portion is committed before the numbers
  // that depend on it - field order is the chain of thought.
  protein_g: { type: "number" },
  carb_g: { type: "number" },
  fat_g: { type: "number" },
};

// Property order is load-bearing: strict-mode output is emitted in schema order.
export const ENRICH_SCHEMA_OPENAI = {
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
              required: [
                "name",
                "category",
                "grams",
                "protein_g",
                "carb_g",
                "fat_g",
              ],
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

const MODEL_TIMEOUT_MS = 120000;
const ENRICH_SEED = 17; // fixed seed + temperature 0 run-to-run stability
export const ENRICH_MODEL = "gpt-4o-2024-08-06";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

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

/** Enriches one Stage-2 batch with the deployed OpenAI request. */
export async function enrichBatch(
  items: ExtractedItem[],
  apiKey: string,
): Promise<EnrichedItem[]> {
  const res = await fetchWithTimeout(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: ENRICH_MODEL,
        messages: [{
          role: "user",
          content: `${ENRICH_PROMPT}\n\nMenu items (JSON):\n${JSON.stringify(items)}`,
        }],
        response_format: {
          type: "json_schema",
          json_schema: { name: "menu_items", strict: true, schema: ENRICH_SCHEMA_OPENAI },
        },
        temperature: 0,
        seed: ENRICH_SEED,
      }),
    },
  );
  const json: unknown = await res.json();
  const errorMessage = isRecord(json) && isRecord(json.error) &&
      typeof json.error.message === "string"
    ? json.error.message
    : undefined;
  if (!res.ok) throw new Error(errorMessage ?? "OpenAI API error");

  const choices = isRecord(json) && Array.isArray(json.choices)
    ? json.choices
    : undefined;
  const first = choices?.[0];
  if (!isRecord(first)) throw new Error("OpenAI response missing choices");
  const finishReason = typeof first.finish_reason === "string"
    ? first.finish_reason
    : undefined;
  const content = isRecord(first.message) &&
      typeof first.message.content === "string"
    ? first.message.content
    : undefined;
  if (!content) throw new Error("OpenAI response missing content");

  console.log("[openai] finish_reason:", finishReason);
  const parsed: unknown = JSON.parse(content);
  if (!isRecord(parsed) || !Array.isArray(parsed.items)) {
    throw new Error("OpenAI response missing items");
  }
  // B10: the item-level macros are OURS, not the model's. iter-b1-001 measured
  // that the model portions well and totals badly - its own grams, priced with
  // USDA values, beat the macros it reported on two of three dishes, while
  // every total it emitted stayed a multiple of 5. So it supplies the parts and
  // we do the addition, which is the one step a computer cannot get wrong.
  return (parsed.items as EnrichedItem[]).map((item) => ({
    ...item,
    ...sumIngredientMacros(item.ingredients ?? []),
  }));
}

/**
 * Item macros summed from the model's per-ingredient numbers, with calories
 * derived by Atwater (4 kcal/g protein, 4 carb, 9 fat) so the total is always
 * consistent with its own parts.
 */
export function sumIngredientMacros(
  ingredients: EnrichedItem["ingredients"],
): Pick<
  EnrichedItem,
  "protein_g" | "carb_g" | "fat_g" | "estimated_calories"
> {
  let protein = 0, carb = 0, fat = 0;
  for (const i of ingredients) {
    protein += i.protein_g ?? 0;
    carb += i.carb_g ?? 0;
    fat += i.fat_g ?? 0;
  }
  return {
    protein_g: Math.round(protein),
    carb_g: Math.round(carb),
    fat_g: Math.round(fat),
    // Atwater on the UNROUNDED sums, so calories never drift from the parts.
    estimated_calories: Math.round(4 * protein + 4 * carb + 9 * fat),
  };
}

/** Splits array into consecutive batches at most `size`. */
export function chunk<T>(arr: T[], size: number): T[][] {
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error("chunk size must be positive");
  }

  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Builds a schema-valid enriched item when extraction data drops one. */
export function fallbackEnriched(src: ExtractedItem): EnrichedItem {
  return {
    name: src.name,
    description: src.description ?? "",
    price: src.price ?? null,
    category: src.category ?? "other",
    ingredients: [],
    protein_g: 0,
    carb_g: 0,
    fat_g: 0,
    estimated_calories: 0,
    confidence: "low",
    allergens: [],
  };
}

/**
 * Returns exactly one EnrichedItem per input, in input order. Matches by name,
 * consuming one enriched entry per occurrence so duplicate names map correctly;
 * any input the model failed to return is backfilled via fallbackEnriched.
 */
export function reassembleEnriched(
  inputs: ExtractedItem[],
  enriched: EnrichedItem[],
): EnrichedItem[] {
  const pools = new Map<string, EnrichedItem[]>();
  for (const e of enriched) {
    const arr = pools.get(e.name) ?? [];
    arr.push(e);
    pools.set(e.name, arr);
  }

  return inputs.map((src) =>
    pools.get(src.name)?.shift() ?? fallbackEnriched(src)
  );
}
