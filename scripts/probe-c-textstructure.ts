// C3 (2026-08-01): the prompt suffix, the request builder and the response
// parser MOVED into the edge function — production runs this path now, and the
// gate must exercise the same code production does, not a copy of it. This file
// re-exports them so every existing caller keeps working unchanged.
import {
  buildStructureRequest,
  type ExtractedMenuItem,
  parseStructureResponse,
} from "../supabase/functions/analyze-menu/extract.ts";
import { ocrMarkdown } from "../supabase/functions/analyze-menu/mistral-extract.ts";
import { mergeItemSources } from "../supabase/functions/analyze-menu/merge.ts";
import { postprocessItems } from "../supabase/functions/analyze-menu/postprocess.ts";
import { MENU_PHOTOS, rawPath } from "./probe-bakeoff-mistral-b1.ts";
import { MENU_DIR } from "./photo-input.ts";

export { ocrMarkdown };
export {
  STRUCTURE_MODEL,
  TEXT_PROMPT_SUFFIX,
} from "../supabase/functions/analyze-menu/extract.ts";

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : undefined;
}

/** Builds the fixed OpenAI text-structuring request. */
export function buildRequest(markdown: string, model: string): unknown {
  return buildStructureRequest(markdown, model);
}

/** Parses the completed OpenAI extraction response. */
export const parseResponse = parseStructureResponse;

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
  // RUN=N keeps draws apart. The structuring model returns a different but
  // valid item list per call (eval 116), so one draw is a sample, not a
  // measurement — every draw must be archived separately.
  const run = Number(Deno.env.get("RUN") ?? "1");
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
      `${outDir}/${menu}.${tag}-r${run}.raw.json`,
      JSON.stringify(payloads.raw, null, 2),
    );
    for (const [page, { raw }] of responses.entries()) {
      if (page === 0) continue;
      await Deno.writeTextFile(
        `${outDir}/${menu}.${tag}-r${run}.p${page}.raw.json`,
        JSON.stringify(raw, null, 2),
      );
    }
    await Deno.writeTextFile(
      `${outDir}/${menu}.${tag}-r${run}.nopost.dump.json`,
      JSON.stringify(payloads.nopost, null, 2),
    );
    await Deno.writeTextFile(
      `${outDir}/${menu}.${tag}-r${run}.dump.json`,
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
