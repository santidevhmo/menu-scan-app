import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { EXTRACT_PROMPT, EXTRACT_SCHEMA, runExtraction } from "./extract.ts";

Deno.test("extraction prompt defines general option inclusion and exclusion rules", () => {
  for (
    const anchor of [
      "protein or filling choice",
      "dietary substitution",
      "each alternative's printed price or weight",
      "printed inside the description",
      "without printing the named alternatives",
      "flavor or variety lists",
      "prepared or served",
    ]
  ) {
    assertEquals(EXTRACT_PROMPT.includes(anchor), true, `missing: ${anchor}`);
  }

  for (
    const token of [
      "lechuga",
      "tortilla",
      "picaña",
      "cottage",
      "con X o Y",
      "copa",
      "botella",
    ]
  ) {
    assertEquals(EXTRACT_PROMPT.includes(token), false, `found: ${token}`);
  }
});

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
              '{"image_quality":{"usable":true,"issues":[]},"items":[{"name":"Revueltos","description":"","price":78,"category":"food","section_title":"Huevos","options":[]}]}',
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
      items: [{
        name: "Revueltos",
        description: "",
        price: 78,
        category: "food",
        section_title: "Huevos",
        options: [],
      }],
      raw_response:
        '{"image_quality":{"usable":true,"issues":[]},"items":[{"name":"Revueltos","description":"","price":78,"category":"food","section_title":"Huevos","options":[]}]}',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("extraction schema defines the v2 image, category, and options contract", () => {
  const schema = EXTRACT_SCHEMA as {
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

  assertEquals(schema.required, ["image_quality", "items"]);
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
