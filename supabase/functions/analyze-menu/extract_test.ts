import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  EXTRACT_SCHEMA,
  extractWithRetry,
  runCropExtractions,
  runExtraction,
  runPagedExtraction,
} from "./extract.ts";
import type { ExtractionResult } from "./extract.ts";

Deno.test("runExtraction sends photos to GPT-4o and returns parsed items", async () => {
  const originalFetch = globalThis.fetch;
  let authorization = "";
  let requestBody: Record<string, unknown> = {};

  globalThis.fetch = (async (input, init) => {
    const request = new Request(input, init);
    authorization = request.headers.get("Authorization") ?? "";
    requestBody = JSON.parse(await request.text());
    return new Response(
      JSON.stringify({
        choices: [{
          finish_reason: "stop",
          message: {
            content:
              '{"image_quality":{"usable":true,"issues":[]},"image_layout":{"dense":false,"crop_direction":"none"},"items":[{"name":"Revueltos","description":"","price":78,"category":"food","section_title":"Huevos","options":[]}]}',
          },
        }],
      }),
    );
  }) as typeof fetch;

  try {
    const result = await runExtraction([
      "photo-base64",
      "data:image/png;base64,png-base64",
    ], "test-key");
    const messages = requestBody.messages as {
      content: { image_url?: { url: string } }[];
    }[];

    assertEquals(authorization, "Bearer test-key");
    assertEquals(requestBody.model, "gpt-4o");
    assertEquals(
      messages[0].content[1].image_url?.url,
      "data:image/jpeg;base64,photo-base64",
    );
    assertEquals(
      messages[0].content[2].image_url?.url,
      "data:image/png;base64,png-base64",
    );
    assertEquals(result as unknown, {
      image_quality: { usable: true, issues: [] },
      image_layout: { dense: false, crop_direction: "none" },
      items: [{
        name: "Revueltos",
        description: "",
        price: 78,
        category: "food",
        section_title: "Huevos",
        options: [],
        grams: null,
      }],
      raw_response:
        '{"image_quality":{"usable":true,"issues":[]},"image_layout":{"dense":false,"crop_direction":"none"},"items":[{"name":"Revueltos","description":"","price":78,"category":"food","section_title":"Huevos","options":[]}]}',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("extraction schema defines the v2 image, category, and options contract", () => {
  const schema = EXTRACT_SCHEMA as unknown as {
    required: string[];
    properties: {
      image_quality?: { required: string[] };
      items: {
        items: {
          required: string[];
          properties: {
            category: { enum?: string[] };
            section_title?: { type: string[] };
            options?: { items: { required: string[] } };
          };
        };
      };
    };
  };
  const item = schema.properties.items.items;

  assertEquals(schema.required, ["image_quality", "image_layout", "items"]);
  assertEquals(schema.properties.image_quality?.required, ["usable", "issues"]);
  assertEquals(item.properties.category.enum, [
    "food",
    "side",
    "dessert",
    "drink",
    "other",
  ]);
  assertEquals(item.required, [
    "name",
    "description",
    "price",
    "category",
    "section_title",
    "options",
  ]);
  assertEquals(item.properties.section_title?.type, ["string", "null"]);
  assertEquals(item.properties.options?.items.required, [
    "name",
    "price",
    "grams",
  ]);
});

Deno.test("extraction schema requires image_layout", () => {
  const schema = EXTRACT_SCHEMA as unknown as {
    required: string[];
    properties: {
      image_layout: {
        required: string[];
        properties: {
          dense: { type: string };
          crop_direction: { enum: string[] };
        };
      };
    };
  };

  assertEquals(schema.required, ["image_quality", "image_layout", "items"]);
  assertEquals(schema.properties.image_layout.required, [
    "dense",
    "crop_direction",
  ]);
  assertEquals(schema.properties.image_layout.properties.dense.type, "boolean");
  assertEquals(
    schema.properties.image_layout.properties.crop_direction.enum,
    ["none", "left_right", "top_bottom"],
  );
});

Deno.test("runExtraction rejects truncated model output before JSON parsing", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(new Response(JSON.stringify({
      choices: [{
        finish_reason: "length",
        message: { content: '{"image_quality":' },
      }],
    })))) as typeof fetch;

  try {
    await assertRejects(
      () => runExtraction(["photo"], "test-key"),
      Error,
      "OpenAI extraction stopped with finish_reason=length",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("crop extraction invokes one model call per crop", async () => {
  const calls: string[][] = [];
  const regions = await runCropExtractions(
    ["left", "right"],
    "key",
    async (photos) => {
      calls.push(photos);
      return {
        image_quality: { usable: true, issues: [] },
        image_layout: { dense: false, crop_direction: "none" },
        items: [],
        raw_response: "{}",
      };
    },
  );
  assertEquals(calls, [["left"], ["right"]]);
  assertEquals(regions.length, 2);
});

const fakeResult = (over: Partial<ExtractionResult> = {}): ExtractionResult => ({
  image_quality: { usable: true, issues: [] },
  image_layout: { dense: false, crop_direction: "none" },
  items: [],
  raw_response: "{}",
  ...over,
});

const menuItem = (
  name: string,
  price: number | null,
  description = "",
): ExtractionResult["items"][number] => ({
  name,
  description,
  price,
  category: "food",
  section_title: null,
  options: [],
  grams: null,
});

Deno.test("extractWithRetry retries exactly once on timeout", async () => {
  let calls = 0;
  const stub = (() => {
    calls++;
    return calls === 1
      ? Promise.reject(new Error("Model request timed out after 120s"))
      : Promise.resolve(fakeResult({ raw_response: "second" }));
  }) as typeof runExtraction;
  const result = await extractWithRetry(["p"], "key", undefined, stub);
  assertEquals(calls, 2);
  assertEquals(result.raw_response, "second");
});

Deno.test("extractWithRetry retries on finish_reason=length", async () => {
  let calls = 0;
  const stub = (() => {
    calls++;
    return calls === 1
      ? Promise.reject(
        new Error("OpenAI extraction stopped with finish_reason=length"),
      )
      : Promise.resolve(fakeResult());
  }) as typeof runExtraction;
  await extractWithRetry(["p"], "key", undefined, stub);
  assertEquals(calls, 2);
});

Deno.test("extractWithRetry does not retry non-transient errors", async () => {
  let calls = 0;
  const stub = (() => {
    calls++;
    return Promise.reject(new Error("OpenAI API error"));
  }) as typeof runExtraction;
  await assertRejects(
    () => extractWithRetry(["p"], "key", undefined, stub),
    Error,
    "OpenAI API error",
  );
  assertEquals(calls, 1);
});

Deno.test("runPagedExtraction: one photo means exactly one call, default detail, passthrough", async () => {
  const seen: { photos: string[]; detail?: string }[] = [];
  const stub = ((photos: string[], _key: string, detail?: string) => {
    seen.push({ photos, detail });
    return Promise.resolve(fakeResult({ raw_response: "single" }));
  }) as typeof extractWithRetry;
  const result = await runPagedExtraction(["a"], "key", stub);
  assertEquals(seen, [{ photos: ["a"], detail: undefined }]);
  assertEquals(result.raw_response, "single");
});

Deno.test("runPagedExtraction: N photos means N high-detail single-photo calls, unified menu", async () => {
  const seen: { photos: string[]; detail?: string }[] = [];
  const pages: ExtractionResult[] = [
    fakeResult({
      items: [menuItem("Tacos", 100)],
      image_quality: { usable: true, issues: ["glare"] },
      raw_response: "r1",
    }),
    fakeResult({
      items: [menuItem("Tacos", 100, "de pastor"), menuItem("Sopa", 80)],
      image_quality: { usable: false, issues: ["glare", "blur"] },
      image_layout: { dense: true, crop_direction: "top_bottom" },
      raw_response: "r2",
    }),
  ];
  const stub = ((photos: string[], _key: string, detail?: string) => {
    seen.push({ photos, detail });
    return Promise.resolve(pages[seen.length - 1]);
  }) as typeof extractWithRetry;

  const result = await runPagedExtraction(["a", "b"], "key", stub);

  assertEquals(seen, [
    { photos: ["a"], detail: "high" },
    { photos: ["b"], detail: "high" },
  ]);
  // ONE menu: cross-page duplicate collapsed, richer copy kept.
  assertEquals(result.items, [
    menuItem("Tacos", 100, "de pastor"),
    menuItem("Sopa", 80),
  ]);
  // ONE quality verdict: any unusable page means unusable; issues deduped.
  assertEquals(result.image_quality, { usable: false, issues: ["glare", "blur"] });
  // Layout comes from the first dense page (dense + direction travel together).
  assertEquals(result.image_layout, { dense: true, crop_direction: "top_bottom" });
  // Raw payloads preserved per page as a JSON array string.
  assertEquals(JSON.parse(result.raw_response), ["r1", "r2"]);
});
