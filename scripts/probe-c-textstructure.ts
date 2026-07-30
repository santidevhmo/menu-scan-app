import {
  EXTRACT_PROMPT,
  EXTRACT_SCHEMA,
  type ExtractedMenuItem,
} from "../supabase/functions/analyze-menu/extract.ts";
import { mergeItemSources } from "../supabase/functions/analyze-menu/merge.ts";
import { postprocessItems } from "../supabase/functions/analyze-menu/postprocess.ts";
import { MENU_PHOTOS, rawPath } from "./probe-bakeoff-mistral-b1.ts";
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

/** Stage-1a source = b1 raw OCR responses, one cached response per photo. */
export function ocrSourcePaths(menu: string): string[] {
  const photos = MENU_PHOTOS[menu];
  if (!photos) throw new Error(`unknown menu: ${menu}`);
  return photos.map((_, page) => rawPath(MENU_DIR, menu, "b1", 1, page));
}

type ParsedResponse = ReturnType<typeof parseResponse>;

export function archivePayloads(
  raw: unknown,
  parsed = parseResponse(raw),
  postItems = postprocessItems(parsed.items as ExtractedMenuItem[]),
): {
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
      items: postItems,
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
  const cachePaths = ocrSourcePaths(menu);
  const markdowns = await Promise.all(
    cachePaths.map(async (path) =>
      ocrMarkdown(JSON.parse(await Deno.readTextFile(path)))
    ),
  );
  const model = Deno.env.get("MODEL") ?? "gpt-4o-2024-11-20";
  const tag = Deno.env.get("TAG") ?? "eval103c";
  const outDir = Deno.env.get("OUT_DIR") ?? MENU_DIR;
  const bodies = markdowns.map((markdown) => buildRequest(markdown, model));

  if (Deno.env.get("LIVE") !== "1") {
    console.log(`[dry-run] menu=${menu}`);
    console.log(`[dry-run] pages=${cachePaths.length}`);
    console.log(`[dry-run] cache_paths=${cachePaths.join(",")}`);
    console.log(`[dry-run] markdown_chars=${markdowns.map((m) => m.length)}`);
    console.log(`[dry-run] requests=${JSON.stringify(bodies)}`);
  } else {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) throw new Error("OPENAI_API_KEY is required");
    const responses = await Promise.all(
      bodies.map((body) => request(body, apiKey)),
    );
    const perPageItems = responses.map(({ parsed }) =>
      parsed.items as ExtractedMenuItem[]
    );
    const postprocessed = perPageItems.map(postprocessItems);
    const merged = postprocessed.length > 1
      ? mergeItemSources(postprocessed)
      : postprocessed[0];
    const payloads = archivePayloads(
      responses[0].raw,
      { ...responses[0].parsed, items: perPageItems.flat() },
      merged,
    );
    await Deno.writeTextFile(
      `${outDir}/${menu}.${tag}-r1.raw.json`,
      JSON.stringify(payloads.raw, null, 2),
    );
    for (const [page, { raw }] of responses.entries()) {
      if (page === 0) continue;
      await Deno.writeTextFile(
        `${outDir}/${menu}.${tag}-r1.p${page}.raw.json`,
        JSON.stringify(raw, null, 2),
      );
    }
    await Deno.writeTextFile(
      `${outDir}/${menu}.${tag}-r1.nopost.dump.json`,
      JSON.stringify(payloads.nopost, null, 2),
    );
    await Deno.writeTextFile(
      `${outDir}/${menu}.${tag}-r1.dump.json`,
      JSON.stringify(payloads.post, null, 2),
    );
    const choices = record(responses[0].raw)?.choices;
    const choice = Array.isArray(choices) ? record(choices[0]) : undefined;
    const usage = record(record(responses[0].raw)?.usage);
    console.log(
      `${menu}: pages=${responses.length} items=[${
        perPageItems.map((items) => items.length)
      }] merged=${merged.length} post=${payloads.post.items.length} ` +
        `finish=${choice?.finish_reason} fp=${
          record(responses[0].raw)?.system_fingerprint ?? "n/a"
        } ` +
        `in=${usage?.prompt_tokens} out=${usage?.completion_tokens} ` +
        `model_quality=${JSON.stringify(responses[0].parsed.image_quality)} ` +
        `model_layout=${JSON.stringify(responses[0].parsed.image_layout)}`,
    );
  }
}
