// Stage 2 enrichment helpers. Kept separate from index.ts, which calls serve().
export interface ExtractedItem {
  name: string;
  description: string;
  price: number | null;
  category: string;
}

export type IngredientCategory = "protein" | "carb" | "fat" | "veg" | "other";

export interface EnrichedItem extends ExtractedItem {
  printed_total_g: number | null;
  /**
   * Components the item's NAME entails but its description never lists.
   * B15: the model reliably omits a dish's defining structural component when
   * the menu leaves it unsaid, and that component is often the dish's whole
   * carbohydrate. Making it answer the question explicitly - rather than hoping
   * it volunteers the ingredient - is the same move that made B4 work: ask for
   * knowledge, then let the ingredient list carry the consequence.
   */
  name_implied_components: string[];
  ingredients: {
    name: string;
    category: IngredientCategory;
    within_printed_weight: boolean;
    typical_serving_g: number;
    protein_per_100g: number;
    carb_per_100g: number;
    fat_per_100g: number;
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
1. Give "printed_total_g": the weight printed on the menu for this item — e.g. (280gr), 200g — or null when the menu prints none. Then give "name_implied_components": when the item's NAME denotes a composed or assembled form, name the structural components that form always contains but this description never states, and otherwise give an empty array. Judge it from what the named form IS, not from what sounds typical: a form's defining component is part of the dish even when the menu leaves it unsaid, because menus describe what varies and take the form itself as read. These components are frequently the item's main source of carbohydrate, and omitting them understates it badly. Include every one of them in the ingredient list below. Then list the most likely ingredients. If the description names them, use them; otherwise infer from the name and category. Tag each ingredient: protein | carb | fat | veg | other. Set "within_printed_weight" to false for anything the menu presents as served alongside the item rather than as part of it, because a printed weight normally describes the item itself and not what accompanies it. Give "typical_serving_g": the standard reference amount of that ingredient customarily consumed on one eating occasion — the amount nutrition labelling treats as one serving of that kind of food. Recall that established amount for the kind of food it is; do not estimate by eye how much of it looks like it is on the plate, because a poured or spooned component has a standard serving considerably larger than it appears. Where a kind of food has no established reference amount, give the amount it is normally served in. Give the conventional serving for the ingredient itself — these are rescaled to the printed weight afterwards, so they do not need to add up to anything.
2. For each ingredient, give its composition PER 100 g of that ingredient as served: protein_per_100g, carb_per_100g and fat_per_100g. These describe the food itself, not the size of the portion — the amount in this serving is calculated from them and the gram weight, so give the composition and let the weight do the rest. Base them on what the food is actually made of, including its water content, and on how it is prepared (fat absorbed or added in cooking counts), rather than on which macro the ingredient is best known for. Where a food is normally cooked, sauced or seasoned before it reaches the table, give the figures for that prepared version — the plain or raw reference figure for the same food understates the fat that preparation adds. The item's totals are added up from these, rather than estimating the totals directly, so each ingredient's numbers must stand on their own.
3. Set "confidence" to "low" only when the name and description are evocative or promotional rather than descriptive, leaving you with little ingredient information to go on.
List "allergens" you can infer from the ingredients (e.g. dairy, nuts, gluten, shellfish, egg, soy). Use an empty allergens array when none are inferred; do not include "none". Preserve each item's name, description, price, and category exactly as given. Do NOT sort the items. Return one object per input item, in the same order.`;

const ENRICH_INGREDIENT_PROPS = {
  name: { type: "string" },
  category: {
    type: "string",
    enum: ["protein", "carb", "fat", "veg", "other"],
  },
  // B4: decided BEFORE the serving, so the model settles what the printed
  // weight covers before it sizes anything. Also the first time the
  // inside-or-outside judgment is recorded rather than inferred by adding up
  // grams afterwards - it is where PASTEL's whole portion error lives.
  within_printed_weight: { type: "boolean" },
  // B21: the STANDARD REFERENCE AMOUNT for this kind of food, not a by-eye
  // impression of the plate. 21 CFR 101.12 (RACC) tabulates these for 150
  // product categories and every US nutrition label derives from it, so it is
  // knowledge the model holds INDEPENDENTLY of any portion guess - which is the
  // test B16 failed. It asked for a coating's share of the dish and the model
  // back-computed it from the grams it already had. Salad dressing's RACC is
  // 30 g; the model's by-eye answer was 20 g on a 150 g slaw and a 200 g salad
  // alike, and USDA's own default serving of coleslaw dressing is 31 g.
  //
  // B4: a conventional serving of this ingredient, NOT a number fitted to the
  // dish. resolveGrams does the fitting. iter-b1-001 through iter-b13-001 asked
  // for a fitted gram figure and got constrained arithmetic solved by rounding:
  // every gram was a multiple of 5 and CESAR's displacement was 20.0% in all 15
  // draws. Required, not optional: strict mode only emits required fields.
  typical_serving_g: { type: "number" },
  // B12: composition per 100 g, NOT the amount in this serving - the amount is
  // grams x per100 / 100, done in sumIngredientMacros. iter-b11-001 measured
  // that an asked-for amount comes back as a round number anchored to the
  // ingredient's category tag (anything tagged carb got 20 or 30 g regardless
  // of food or weight), while composition is a property of the food the model
  // actually knows. Same move as B10, one level down: take away the arithmetic,
  // leave the knowledge.
  protein_per_100g: { type: "number" },
  carb_per_100g: { type: "number" },
  fat_per_100g: { type: "number" },
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
          // B4: before ingredients on purpose - the model commits to the dish's
          // printed weight before portioning anything into it. Asked for rather
          // than parsed in code: the three benchmark fixtures alone print
          // "200 g", "200g" and "300gr.", and this prompt ships worldwide.
          printed_total_g: { type: ["number", "null"] },
          // B15: also before ingredients, and for the same reason as B4's
          // printed_total_g - the model names what the dish's form entails
          // BEFORE it lists ingredients, so the answer constrains the list
          // instead of rationalising one it has already written.
          name_implied_components: { type: "array", items: { type: "string" } },
          ingredients: {
            type: "array",
            items: {
              type: "object",
              properties: ENRICH_INGREDIENT_PROPS,
              required: [
                "name",
                "category",
                "within_printed_weight",
                "typical_serving_g",
                "protein_per_100g",
                "carb_per_100g",
                "fat_per_100g",
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
          "printed_total_g",
          "name_implied_components",
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

/**
 * `temperature: 0` is not universally accepted: gpt-5.x rejects it outright
 * ("Only the default (1) value is supported") and 400s the whole request. It
 * therefore travels with the model rather than being hardcoded, so changing the
 * pin cannot silently break every scan.
 */
function samplingFor(model: string): Record<string, number> {
  return model.startsWith("gpt-4") ? { temperature: 0, seed: ENRICH_SEED } : { seed: ENRICH_SEED };
}

/**
 * Enriches one Stage-2 batch with the deployed OpenAI request.
 *
 * `model` exists so an offline harness can exercise THIS path against another
 * model. It defaults to the pin, so production callers cannot be affected.
 */
export async function enrichBatch(
  items: ExtractedItem[],
  apiKey: string,
  model: string = ENRICH_MODEL,
  // Lets a harness archive the exact response bytes WITHOUT building its own
  // request. bench-macros.ts used to keep a private copy of this function; that
  // copy silently drifted and cost a wasted paid run (see the harness-defect
  // entry in the benchmark log). Production passes nothing.
  onRaw?: (raw: unknown) => void,
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
        model,
        messages: [{
          role: "user",
          content: `${ENRICH_PROMPT}\n\nMenu items (JSON):\n${JSON.stringify(items)}`,
        }],
        response_format: {
          type: "json_schema",
          json_schema: { name: "menu_items", strict: true, schema: ENRICH_SCHEMA_OPENAI },
        },
        ...samplingFor(model),
      }),
    },
  );
  const json: unknown = await res.json();
  onRaw?.(json);
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
    // A black-box ingredient means the totals rest on a whole-dish guess. The
    // numbers stand - nothing here can decompose what the model did not - but the
    // item is no longer "high" confidence, and the app already surfaces that.
    confidence: (item.ingredients ?? []).some((i) =>
        isBlackBoxIngredient(item.name, i.name)
      )
      ? "low" as const
      : item.confidence,
    ...sumIngredientMacros(item.ingredients ?? [], item.printed_total_g),
  }));
}

/**
 * Per-ingredient grams. The model states a conventional serving for each
 * ingredient; we fit the ones the menu's printed weight covers to that weight
 * and let accompaniments through untouched.
 *
 * B4: the model used to pick gram numbers that had to sum to the printed
 * weight - constrained arithmetic, and it solved it by rounding. Across five
 * archived runs every gram it emitted was a multiple of 5 and CESAR's
 * displacement sat at exactly 20.0% in all 15 draws, never once moving. Taking
 * the fitting away is the same move as B10 (we do the addition) and B12 (we do
 * the multiplication).
 */
/**
 * True when an ingredient is really the DISH restated - a "black-box ingredient".
 *
 * Found by the 2026-08-09 generalisation probe: "Chicken Tikka Masala with
 * basmati rice" came back as `chicken tikka masala 200 g` + `basmati rice 150 g`.
 * The dish named itself, so its per-100 g figures are a whole-dish guess rather
 * than the composition of a food - and B18 measured that dish-level guessing is
 * WORSE than an ingredient sum on 6 of 8 dishes, which is the entire reason this
 * pipeline builds from parts. Every other guard sits downstream of the ingredient
 * list, so nothing else catches it.
 *
 * B23 tried to prompt the behaviour away and moved nothing - prompt wording is
 * now 0 for 3 here. So it is DETECTED instead: comparing an ingredient name to
 * the item's own name is cheap, language-agnostic, and needs no food list, which
 * matters because a shipped food list is both forbidden and measurably harmful.
 *
 * Deliberately narrow: the item name must BEGIN with the ingredient name. Menus
 * name dishes "X with Y" / "X con Y", where X is the dish and Y a component it
 * lists, so a restated dish sits at the head and a genuine ingredient does not.
 * Containment alone was tried first and was wrong - "Chicken Tikka Masala with
 * basmati rice" contains "basmati rice", which is a real food, and flagging it
 * would have downgraded a correct answer.
 *
 * A single-word ingredient is a food ("rice", "pollo"), never a dish restated.
 */
export function isBlackBoxIngredient(
  itemName: string,
  ingredientName: string,
): boolean {
  const norm = (t: string) =>
    t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

  const item = norm(itemName);
  const ing = norm(ingredientName);
  if (ing.length < 3 || item.length < 3) return false;
  // A one-word ingredient is a food ("rice", "pollo"), not a dish restated.
  if (!ing.includes(" ")) return false;
  return item.startsWith(ing);
}

export function resolveGrams(
  ingredients: EnrichedItem["ingredients"],
  printedTotalG?: number | null,
): number[] {
  const inside = ingredients.reduce(
    (sum, i) => i.within_printed_weight ? sum + (i.typical_serving_g ?? 0) : sum,
    0,
  );
  // No printed weight, or nothing tagged inside it, means there is nothing to
  // fit to and the model's own servings stand. Requiring inside > 0 is also what
  // keeps an empty ingredient list from producing NaN.
  const scale = printedTotalG && inside > 0 ? printedTotalG / inside : 1;

  return ingredients.map((i) =>
    (i.typical_serving_g ?? 0) * (i.within_printed_weight ? scale : 1)
  );
}

/**
 * Item macros summed from the model's per-ingredient composition, priced at each
 * ingredient's resolved gram weight, with calories derived by Atwater (4 kcal/g
 * protein, 4 carb, 9 fat) so the total is always consistent with its own parts.
 */
export function sumIngredientMacros(
  ingredients: EnrichedItem["ingredients"],
  printedTotalG?: number | null,
): Pick<
  EnrichedItem,
  "protein_g" | "carb_g" | "fat_g" | "estimated_calories"
> {
  const grams = resolveGrams(ingredients, printedTotalG);
  let protein = 0, carb = 0, fat = 0;
  ingredients.forEach((i, idx) => {
    // B12: per-100 g composition x portion. The model states what the food IS;
    // the multiplication is ours. B4: and so is the portion.
    const share = grams[idx] / 100;
    protein += (i.protein_per_100g ?? 0) * share;
    carb += (i.carb_per_100g ?? 0) * share;
    fat += (i.fat_per_100g ?? 0) * share;
  });
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
    printed_total_g: null,
    name_implied_components: [],
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

export const ENRICH_BATCH_SIZE = 10; // ponytail: small batches stop GPT-4o early-stopping; tune if drops persist

/** Enriches a batch, retrying once if the model returns fewer items than sent. */
async function enrichBatchWithRetry(
  batch: ExtractedItem[],
  apiKey: string,
  model: string,
): Promise<EnrichedItem[]> {
  try {
    const first = await enrichBatch(batch, apiKey, model);
    if (first.length >= batch.length) return first;
  } catch (err) {
    console.error(
      "[enrich] batch failed, retrying:",
      err instanceof Error ? err.message : err,
    );
  }

  try {
    return await enrichBatch(batch, apiKey, model);
  } catch (err) {
    console.error(
      "[enrich] batch failed twice, backfilling:",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

/**
 * Stage-2 text enrichment over extracted items. Splits into small parallel
 * batches to avoid early-stopping/truncation, then reassembles to guarantee one
 * enriched item per input (dropped items are backfilled above).
 *
 * Lives here rather than in index.ts because index.ts calls serve() at module
 * scope and cannot be imported — so a harness could only ever test a COPY of
 * the batching, which is lesson 23 exactly.
 */
export async function callGptEnrich(
  items: ExtractedItem[],
  apiKey: string,
  model: string = ENRICH_MODEL,
): Promise<{ items: EnrichedItem[]; raw_response: string }> {
  const batches = chunk(items, ENRICH_BATCH_SIZE);
  const settled = await Promise.all(
    batches.map((batch) => enrichBatchWithRetry(batch, apiKey, model)),
  );
  const enriched = reassembleEnriched(items, settled.flat());
  return { items: enriched, raw_response: JSON.stringify({ items: enriched }) };
}
