import { MODEL_TIMEOUT_MS } from "./extract.ts";
import type { Page } from "./mistral-cleanup.ts";

export const MENU_ANNOTATION_SCHEMA = {
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
  required: ["items"],
  additionalProperties: false,
};

export interface MistralExtraction {
  items: unknown[];
  page?: Page;
  raw_response: string;
}

export function reshapeMistral(raw: unknown): unknown[] {
  const response = (raw ?? {}) as Record<string, unknown>;
  let annotation: unknown = response.document_annotation;
  if (typeof annotation === "string") {
    try {
      annotation = JSON.parse(annotation);
    } catch {
      annotation = undefined;
    }
  }
  return annotation && typeof annotation === "object" &&
      Array.isArray((annotation as Record<string, unknown>).items)
    ? (annotation as Record<string, unknown>).items as unknown[]
    : [];
}

export function mistralPage(raw: unknown): Page | undefined {
  const response = raw as {
    pages?: {
      blocks?: Page["blocks"];
      dimensions: { width: number; height: number };
    }[];
  };
  const page = response.pages?.[0];
  return page
    ? {
      blocks: page.blocks ?? [],
      width: page.dimensions.width,
      height: page.dimensions.height,
    }
    : undefined;
}

export async function extractMistral(
  photo: string,
  apiKey: string,
): Promise<MistralExtraction> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.mistral.ai/v1/ocr", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "mistral-ocr-latest",
        document: {
          type: "image_url",
          image_url: photo.startsWith("data:")
            ? photo
            : `data:image/jpeg;base64,${photo}`,
        },
        document_annotation_format: {
          type: "json_schema",
          json_schema: {
            schema: MENU_ANNOTATION_SCHEMA,
            name: "menu_extraction",
            strict: true,
          },
        },
      }),
      signal: controller.signal,
    });
    const raw_response = await res.text();
    if (!res.ok) {
      throw new Error(`Mistral OCR HTTP ${res.status}: ${raw_response}`);
    }
    const response = JSON.parse(raw_response);
    return {
      items: reshapeMistral(response),
      page: mistralPage(response),
      raw_response,
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

export async function extractMistralWithRetry(
  photo: string,
  apiKey: string,
  extract = extractMistral,
): Promise<MistralExtraction> {
  try {
    return await extract(photo, apiKey);
  } catch (error) {
    if (!String(error).includes("timed out")) throw error;
    console.log("[extract] transient model failure — retrying call once");
    return await extract(photo, apiKey);
  }
}
