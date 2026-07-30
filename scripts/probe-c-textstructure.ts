import {
  EXTRACT_PROMPT,
  EXTRACT_SCHEMA,
  type ExtractedMenuItem,
} from "../supabase/functions/analyze-menu/extract.ts";
import { postprocessItems } from "../supabase/functions/analyze-menu/postprocess.ts";
import { MENU_DIR } from "./photo-input.ts";

export const TEXT_PROMPT_SUFFIX =
  `\nThe menu is provided below as a verbatim OCR transcription of the photo, in
reading order; printed headings appear as markdown headings. Work only from
this text — there is no image, so set image_quality.usable=true with an empty
issues list and image_layout dense=false, crop_direction="none".

MENU TRANSCRIPTION:

`;

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

/** Reads either cached Mistral OCR response shape and joins its page markdown. */
export function ocrMarkdown(cached: unknown): string {
  const root = record(cached);
  const responses = root?.responses;
  const markdown = Array.isArray(responses)
    ? pagesMarkdown(responses[0])
    : pagesMarkdown(root);
  if (markdown.length === 0) throw new Error("OCR cache has no markdown");
  return markdown.join("\n\n");
}

/** Builds the fixed OpenAI text-structuring request for this probe. */
export function buildRequest(markdown: string, model: string): unknown {
  return {
    model,
    messages: [{
      role: "user",
      content: [{
        type: "text",
        text: EXTRACT_PROMPT + TEXT_PROMPT_SUFFIX + markdown,
      }],
    }],
    response_format: {
      type: "json_schema",
      json_schema: { name: "menu_items", strict: true, schema: EXTRACT_SCHEMA },
    },
    temperature: 0,
    seed: 17,
    max_tokens: 16384,
  };
}

/** Parses the completed OpenAI extraction response. */
export function parseResponse(
  json: unknown,
): { image_quality: unknown; image_layout: unknown; items: unknown[] } {
  const choices = record(json)?.choices;
  const choice = Array.isArray(choices) ? record(choices[0]) : undefined;
  if (!choice) throw new Error("OpenAI returned no extraction choice");
  if (choice.finish_reason !== "stop") {
    throw new Error(
      `OpenAI extraction stopped with finish_reason=${
        String(choice.finish_reason)
      }`,
    );
  }
  const content = record(choice.message)?.content;
  if (!content) throw new Error("OpenAI returned no extraction content");
  if (typeof content !== "string") {
    throw new Error("OpenAI extraction content must be a string");
  }
  const parsed = record(JSON.parse(content));
  if (!parsed || !Array.isArray(parsed.items)) {
    throw new Error("OpenAI extraction content must contain an items array");
  }
  return {
    image_quality: parsed.image_quality,
    image_layout: parsed.image_layout,
    items: parsed.items,
  };
}

export function ocrCacheName(menu: string): string {
  return menu === "nikkori"
    ? "nikkori.mistral-ocr.json"
    : `${menu}.mistral-ocr-2048q95.json`;
}

type ParsedResponse = ReturnType<typeof parseResponse>;

export function archivePayloads(raw: unknown, parsed = parseResponse(raw)): {
  raw: unknown;
  nopost: {
    image_quality: { usable: boolean; issues: string[] };
    items: unknown[];
  };
  post: {
    image_quality: { usable: boolean; issues: string[] };
    items: ExtractedMenuItem[];
  };
} {
  const image_quality = { usable: true, issues: [] };
  return {
    raw,
    nopost: { image_quality, items: parsed.items },
    post: {
      image_quality,
      items: postprocessItems(parsed.items as ExtractedMenuItem[]),
    },
  };
}

async function request(
  body: unknown,
  apiKey: string,
): Promise<{ raw: unknown; parsed: ParsedResponse }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const raw = await response.json() as unknown;
    if (!response.ok) {
      const message = record(record(raw)?.error)?.message;
      throw new Error(
        typeof message === "string" ? message : "OpenAI API error",
      );
    }
    return { raw, parsed: parseResponse(raw) };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Model request timed out after 120s");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

if (import.meta.main) {
  const menu = Deno.args[0] ?? "polloteria";
  const cache = ocrCacheName(menu);
  const cachePath = `${MENU_DIR}/${cache}`;
  const markdown = ocrMarkdown(JSON.parse(await Deno.readTextFile(cachePath)));
  const model = Deno.env.get("MODEL") ?? "gpt-4o-2024-11-20";
  const tag = Deno.env.get("TAG") ?? "eval103c";
  const outDir = Deno.env.get("OUT_DIR") ?? MENU_DIR;
  const body = buildRequest(markdown, model);

  if (Deno.env.get("LIVE") !== "1") {
    console.log(`[dry-run] menu=${menu}`);
    console.log(`[dry-run] cache=${cache}`);
    console.log(`[dry-run] markdown_chars=${markdown.length}`);
    console.log(`[dry-run] request=${JSON.stringify(body)}`);
  } else {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) throw new Error("OPENAI_API_KEY is required");
    const { raw, parsed } = await request(body, apiKey);
    const payloads = archivePayloads(raw, parsed);
    await Deno.writeTextFile(
      `${outDir}/${menu}.${tag}-r1.raw.json`,
      JSON.stringify(payloads.raw, null, 2),
    );
    await Deno.writeTextFile(
      `${outDir}/${menu}.${tag}-r1.nopost.dump.json`,
      JSON.stringify(payloads.nopost, null, 2),
    );
    await Deno.writeTextFile(
      `${outDir}/${menu}.${tag}-r1.dump.json`,
      JSON.stringify(payloads.post, null, 2),
    );
    const choices = record(raw)?.choices;
    const choice = Array.isArray(choices) ? record(choices[0]) : undefined;
    const usage = record(record(raw)?.usage);
    console.log(
      `${menu}: items=${parsed.items.length} post=${payloads.post.items.length} ` +
        `finish=${choice?.finish_reason} fp=${
          record(raw)?.system_fingerprint ?? "n/a"
        } ` +
        `in=${usage?.prompt_tokens} out=${usage?.completion_tokens} ` +
        `model_quality=${JSON.stringify(parsed.image_quality)} ` +
        `model_layout=${JSON.stringify(parsed.image_layout)}`,
    );
  }
}
