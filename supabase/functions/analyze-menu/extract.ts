import { postprocessItems } from "./postprocess.ts";
import { mergeItemSources } from "./merge.ts";

const MODEL_TIMEOUT_MS = 120000;
const EXTRACT_SEED = 17;

export const EXTRACT_PROMPT =
  `Read this restaurant menu. Return every item exactly as printed, in menu order:
name, description, price, category, section_title, and options.
Do NOT estimate calories or nutrition. Do NOT invent items you cannot read.
Extract all visible menu items from every provided photo and every menu section.
Do not stop after a representative sample, a section summary, or the first page.
There is no maximum number of items; keep going until every readable item is returned.
Never return a section header as an item.
Copy the nearest printed heading that visually groups an item into section_title.
When a heading contains smaller subheadings, each item belongs to its nearest
subheading, never the parent (a spirits list under a parent heading with per-spirit
subheadings uses the spirit subheading). Use only printed headings; never invent
a grouping that is not printed on the menu. Set section_title to null
only when no heading groups the item. Preserve the item name exactly; never prepend
or synthesize the heading into the name.
A heading is often larger text without its own price, weight, or description, but
it must also group menu items beneath it. Do not treat restaurant names, slogans,
or promotional text as section headings.
Use category "food" for appetizers, entrees, main dishes, and other prepared food.
Use "side", "dessert", or "drink" only when that role is clear; otherwise use "other".
An option is a printed choice about one item's composition: a protein or filling
choice, a paid add-on, a dietary swap, or a flavor choice. Capture each option with
its printed price and weight in grams when present; otherwise use null.
Serving formats and sizes (glass vs bottle, copa vs botella, small vs large) are
NOT options. Distinct products listed under a shared heading are separate items,
not options.
When the same base dish is printed several times with different fillings, proteins,
or preparations, return ONE item named after the base dish and put each printed
variant in options. Never return duplicate item names for variants of one dish.
A choice printed inside a description ("con X o Y", "choice of X or Y") is an
options list; capture each choice in options. Do not move options into the description.
If a description is not printed, use an empty string. If a price is not printed, set it to null.
Assess the visible menu layout. Set image_layout.dense=true only when small text,
many tightly packed items, or a crowded multi-group layout risks incomplete
extraction from the full image. For side-by-side content use crop_direction
"left_right"; for vertically stacked content use "top_bottom". For a normal
menu set dense=false and crop_direction="none".
Assess image quality across all photos. Report blur, low_light, glare, or another concise issue.
Set usable to false only when the menu cannot be read reliably.`;

// ponytail: v2 prompt/schema are an unproven hypothesis until the real-menu harness passes.
export const EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    image_quality: {
      type: "object",
      properties: {
        usable: { type: "boolean" },
        issues: { type: "array", items: { type: "string" } },
      },
      required: ["usable", "issues"],
      additionalProperties: false,
    },
    image_layout: {
      type: "object",
      properties: {
        dense: { type: "boolean" },
        crop_direction: {
          type: "string",
          enum: ["none", "left_right", "top_bottom"],
        },
      },
      required: ["dense", "crop_direction"],
      additionalProperties: false,
    },
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
          section_title: { type: ["string", "null"] },
          options: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                price: { type: ["number", "null"] },
                grams: { type: ["number", "null"] },
              },
              required: ["name", "price", "grams"],
              additionalProperties: false,
            },
          },
        },
        required: [
          "name",
          "description",
          "price",
          "category",
          "section_title",
          "options",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["image_quality", "image_layout", "items"],
  additionalProperties: false,
};

export type CropDirection = "none" | "left_right" | "top_bottom";

export interface ImageLayout {
  dense: boolean;
  crop_direction: CropDirection;
}

export interface ImageQuality {
  usable: boolean;
  issues: string[];
}

export interface ExtractedMenuItem {
  name: string;
  description: string;
  price: number | null;
  category: "food" | "side" | "dessert" | "drink" | "other";
  section_title: string | null;
  options: { name: string; price: number | null; grams: number | null }[];
  // Printed item weight in grams, parsed deterministically from name/description
  // by postprocess (parseItemGrams) — NOT model-filled; EXTRACT_SCHEMA unchanged.
  grams: number | null;
}

export interface ExtractionResult {
  image_quality: ImageQuality;
  image_layout: ImageLayout;
  items: ExtractedMenuItem[];
  raw_response: string;
}

export async function runExtraction(
  photos: string[],
  apiKey: string,
  detail?: "auto" | "high" | "low",
): Promise<ExtractionResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: EXTRACT_PROMPT },
            ...photos.map((photo) => ({
              type: "image_url",
              image_url: {
                url: photo.startsWith("data:")
                  ? photo
                  : `data:image/jpeg;base64,${photo}`,
                ...(detail ? { detail } : {}),
              },
            })),
          ],
        }],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "menu_items",
            strict: true,
            schema: EXTRACT_SCHEMA,
          },
        },
        temperature: 0,
        seed: EXTRACT_SEED,
      }),
      signal: controller.signal,
    });
    const json = await res.json() as {
      error?: { message?: string };
      choices?: { finish_reason: string; message: { content: string } }[];
    };
    if (!res.ok) throw new Error(json.error?.message ?? "OpenAI API error");

    const choice = json.choices?.[0];
    if (!choice) throw new Error("OpenAI returned no extraction choice");
    if (choice.finish_reason !== "stop") {
      throw new Error(
        `OpenAI extraction stopped with finish_reason=${choice.finish_reason}`,
      );
    }
    const text = choice.message.content;
    if (!text) throw new Error("OpenAI returned no extraction content");

    console.log("[openai] finish_reason:", choice.finish_reason);
    const parsed = JSON.parse(text) as Omit<ExtractionResult, "raw_response">;
    return {
      ...parsed,
      items: postprocessItems(parsed.items),
      raw_response: text,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        `Model request timed out after ${MODEL_TIMEOUT_MS / 1000}s`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// One retry on transient model failures — the 120s timeout (nikkori tile,
// eval 031+033 validation) and finish_reason=length (verbosity is
// nondeterministic; a dense page occasionally overruns the completion cap,
// eval 043). Moved from the eval runner (2026-07-10) so production inherits
// the resilience the 3/3 gate was measured with.
export async function extractWithRetry(
  photos: string[],
  apiKey: string,
  detail?: "auto" | "high" | "low",
  extract = runExtraction,
): Promise<ExtractionResult> {
  try {
    return await extract(photos, apiKey, detail);
  } catch (error) {
    const message = String(error);
    if (
      !message.includes("timed out") &&
      !message.includes("finish_reason=length")
    ) throw error;
    console.log("[extract] transient model failure — retrying call once");
    return await extract(photos, apiKey, detail);
  }
}

// The iter-036 per-page recipe as the shared production path: 1 photo ⇒ one
// call (default detail, no merge); N photos ⇒ one high-detail call PER page
// (full completion budget each), in parallel, merged into ONE menu so
// downstream stages (enrichment, ranking) run once per scan, never per page.
// Multi-page detail is locked to "high" (gate-proven); the cheaper "auto"
// A/B is deferred to the post-release cost pass.
export async function runPagedExtraction(
  photos: string[],
  apiKey: string,
  extract = extractWithRetry,
): Promise<ExtractionResult> {
  if (photos.length === 1) return await extract(photos, apiKey);

  const results = await Promise.all(
    photos.map((photo) => extract([photo], apiKey, "high")),
  );
  return {
    items: mergeItemSources(results.map((r) => r.items)),
    image_quality: {
      usable: results.every((r) => r.image_quality.usable),
      issues: [...new Set(results.flatMap((r) => r.image_quality.issues))],
    },
    // First dense page wins so the dense flag survives for the auto-cutter
    // (critical-path #2) WITH its crop_direction (validateLayout forbids
    // dense:true + "none"). No dense page ⇒ page 1's layout.
    image_layout: results.find((r) => r.image_layout.dense)?.image_layout ??
      results[0].image_layout,
    raw_response: JSON.stringify(results.map((r) => r.raw_response)),
  };
}

export async function runCropExtractions(
  photos: string[],
  apiKey: string,
  extract = runExtraction,
): Promise<ExtractionResult[]> {
  if (photos.length !== 2 && photos.length !== 3) {
    throw new Error("extract-crops requires 2 or 3 photos");
  }
  return await Promise.all(
    photos.map((photo) => extract([photo], apiKey)),
  );
}
