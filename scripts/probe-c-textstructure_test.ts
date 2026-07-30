import { assertEquals, assertThrows } from "jsr:@std/assert";
import {
  archivePayloads,
  buildRequest,
  ocrMarkdown,
  ocrSourcePaths,
  parseResponse,
  TEXT_PROMPT_SUFFIX,
} from "./probe-c-textstructure.ts";
import {
  EXTRACT_PROMPT,
  EXTRACT_SCHEMA,
} from "../supabase/functions/analyze-menu/extract.ts";
import type { ExtractedMenuItem } from "../supabase/functions/analyze-menu/extract.ts";
import { postprocessItems } from "../supabase/functions/analyze-menu/postprocess.ts";
import { MENU_DIR } from "./photo-input.ts";

Deno.test("ocrMarkdown reads all pages from the responses cache shape", () => {
  assertEquals(
    ocrMarkdown({
      responses: [{
        pages: [{ markdown: "# Entradas" }, { markdown: "Taco" }],
      }],
    }),
    "# Entradas\n\nTaco",
  );
});

Deno.test("ocrMarkdown uses the cached response's pages, not repeated responses", () => {
  assertEquals(
    ocrMarkdown({
      responses: [
        { pages: [{ markdown: "# Entradas" }, { markdown: "Taco" }] },
        { pages: [{ markdown: "duplicate OCR run" }] },
      ],
    }),
    "# Entradas\n\nTaco",
  );
});

Deno.test("ocrMarkdown reads the direct Mistral response cache shape", () => {
  assertEquals(
    ocrMarkdown({
      document_annotation: "{}",
      model: "mistral-ocr-latest",
      pages: [{ markdown: "# Nikkori" }],
    }),
    "# Nikkori",
  );
});

Deno.test("ocrMarkdown rejects caches without markdown", () => {
  assertThrows(
    () => ocrMarkdown({ responses: [{ pages: [{}] }] }),
    Error,
    "no markdown",
  );
});

Deno.test("buildRequest has the pinned text-structuring request shape", () => {
  const markdown = "# Tacos\nAl pastor 120";
  assertEquals(buildRequest(markdown, "gpt-4o-2024-11-20"), {
    model: "gpt-4o-2024-11-20",
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
  });
});

Deno.test("parseResponse returns the stopped structured extraction", () => {
  assertEquals(
    parseResponse({
      choices: [{
        finish_reason: "stop",
        message: {
          content: JSON.stringify({
            image_quality: { usable: true, issues: [] },
            image_layout: { dense: false, crop_direction: "none" },
            items: [{ name: "Taco" }],
          }),
        },
      }],
    }),
    {
      image_quality: { usable: true, issues: [] },
      image_layout: { dense: false, crop_direction: "none" },
      items: [{ name: "Taco" }],
    },
  );
});

Deno.test("parseResponse rejects a non-stop finish reason", () => {
  assertThrows(
    () =>
      parseResponse({ choices: [{ finish_reason: "length", message: {} }] }),
    Error,
    "finish_reason=length",
  );
});

Deno.test("parseResponse rejects empty content", () => {
  assertThrows(
    () =>
      parseResponse({
        choices: [{ finish_reason: "stop", message: { content: "" } }],
      }),
    Error,
    "no extraction content",
  );
});

Deno.test("ocrSourcePaths returns brasero-two's two cached pages in order", () => {
  assertEquals(
    ocrSourcePaths("brasero-two"),
    [
      `${MENU_DIR}/brasero-two.mistral-b1-r1.raw.json`,
      `${MENU_DIR}/brasero-two.mistral-b1-r1.p1.raw.json`,
    ],
  );
});

Deno.test("ocrSourcePaths keeps a single-page menu's cached path unchanged", () => {
  assertEquals(
    ocrSourcePaths("polloteria"),
    [`${MENU_DIR}/polloteria.mistral-b1-r1.raw.json`],
  );
});

Deno.test("ocrSourcePaths rejects an unknown menu", () => {
  assertThrows(
    () => ocrSourcePaths("nope"),
    Error,
    "unknown menu: nope",
  );
});

Deno.test("archivePayloads keeps raw, nopost, and postprocessed dump shapes", () => {
  const raw = {
    choices: [{
      finish_reason: "stop",
      message: {
        content: JSON.stringify({
          image_quality: { usable: false, issues: ["glare"] },
          image_layout: { dense: true, crop_direction: "left_right" },
          items: [{
            name: "Taco (300gr)",
            description: "",
            price: 120,
            category: "food",
            section_title: "Tacos",
            options: [],
          }],
        }),
      },
    }],
  };
  const parsed = parseResponse(raw);
  const payloads = archivePayloads(raw);
  const image_quality = { usable: true, issues: [] };

  assertEquals(payloads.raw, raw);
  assertEquals(payloads.nopost, { image_quality, items: parsed.items });
  assertEquals(payloads.post, {
    image_quality,
    items: postprocessItems(parsed.items as ExtractedMenuItem[]),
  });
});
