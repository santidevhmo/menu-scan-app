import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  EXTRACT_SCHEMA,
  runCropExtractions,
  runExtraction,
} from "./extract.ts";

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
