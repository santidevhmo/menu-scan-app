import { MODEL_TIMEOUT_MS } from "./extract.ts";
import type { OcrBlock } from "./orientation.ts";

// Ruling 35 (2026-08-01): name the version, never the `mistral-ocr-latest`
// alias. `latest` moved under us once already — eval 101 saw results change
// overnight with no code change and eval 102 spent two experiments proving the
// drift was the vendor's. v4 is the exact model every measurement we own was
// taken on (eval 102: same alias 07-22 vs 07-29, OCR text char-sim 0.9999).
export const MISTRAL_OCR_MODEL = "mistral-ocr-4-0";

export interface MistralOcr {
  markdown: string;
  raw_response: string;
  /** Pixel box of every text block. Mistral has always returned these and
   *  production has always received them — C3 stopped USING them, not
   *  receiving them (verified: bistro.mistral-pt-r1.raw.json carries 83,
   *  written by this function). Reading them costs nothing. */
  blocks: OcrBlock[];
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : undefined;
}

function pagesMarkdown(value: unknown): string[] {
  const pages = record(value)?.pages;
  if (!Array.isArray(pages)) return [];
  return pages.flatMap((page) => {
    const markdown = record(page)?.markdown;
    return typeof markdown === "string" ? [markdown] : [];
  });
}

/** Reads either cached Mistral OCR response shape and joins its page markdown.
 *  Lives here, not in the harness, so the $0 gate and production read a cached
 *  or live response through the SAME function (master-roadmap lesson 23). */
export function ocrMarkdown(cached: unknown): string {
  const root = record(cached);
  const responses = root?.responses;
  const markdown = Array.isArray(responses)
    ? pagesMarkdown(responses[0])
    : pagesMarkdown(root);
  if (markdown.length === 0) throw new Error("OCR cache has no markdown");
  return markdown.join("\n\n");
}

/** Text-block boxes from a raw OCR response; `[]` when the model returns none,
 *  so the orientation detector degrades to "cannot tell" instead of throwing. */
export function pageBlocks(raw: unknown): OcrBlock[] {
  const pages = record(raw)?.pages;
  const first = Array.isArray(pages) ? record(pages[0]) : undefined;
  return Array.isArray(first?.blocks) ? first.blocks as OcrBlock[] : [];
}

/** Stage-1a: OCR the photo to text. No `document_annotation_format` — the
 *  vendor's own structuring is what ruling 30 replaced (its LLM is unpinnable;
 *  eval 101/102). We want the transcription, nothing else. */
export async function ocrMistral(
  photo: string,
  apiKey: string,
): Promise<MistralOcr> {
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
        model: MISTRAL_OCR_MODEL,
        document: {
          type: "image_url",
          image_url: photo.startsWith("data:")
            ? photo
            : `data:image/jpeg;base64,${photo}`,
        },
      }),
      signal: controller.signal,
    });
    const raw_response = await res.text();
    if (!res.ok) {
      throw new Error(`Mistral OCR HTTP ${res.status}: ${raw_response}`);
    }
    const parsed = JSON.parse(raw_response);
    return {
      markdown: ocrMarkdown(parsed),
      raw_response,
      blocks: pageBlocks(parsed),
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

export async function ocrMistralWithRetry(
  photo: string,
  apiKey: string,
  ocr = ocrMistral,
): Promise<MistralOcr> {
  try {
    return await ocr(photo, apiKey);
  } catch (error) {
    if (!String(error).includes("timed out")) throw error;
    console.log("[extract] transient OCR failure — retrying call once");
    return await ocr(photo, apiKey);
  }
}
