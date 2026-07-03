import {
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  EXTRACT_SCHEMA,
  OPTIONS_SCHEMA,
  runExtraction,
} from "./extract.ts";

const FIRST_RAW =
  '{"image_quality":{"usable":true,"issues":[]},"items":[{"name":"Revueltos","description":"Naturales","price":78,"category":"food","section_title":"Huevos"},{"name":"Revueltos","description":"Con jamón","price":90,"category":"food","section_title":"Huevos"}]}';
const ONE_ITEM_RAW =
  '{"image_quality":{"usable":true,"issues":[]},"items":[{"name":"Revueltos","description":"Naturales","price":78,"category":"food","section_title":"Huevos"}]}';
const SECOND_RAW =
  '{"option_sets":[{"item_index":1,"options":[{"name":"Jamón","price":null,"grams":null}]}]}';

interface RequestBody {
  model: string;
  messages: {
    content: {
      type: string;
      text?: string;
      image_url?: { url: string };
    }[];
  }[];
}

function success(content: string): Response {
  return new Response(JSON.stringify({
    choices: [{
      finish_reason: "stop",
      message: { content },
    }],
  }));
}

Deno.test("runExtraction merges Pass 2 options by Pass 1 item index", async () => {
  const originalFetch = globalThis.fetch;
  const requestBodies: RequestBody[] = [];
  const authorizations: string[] = [];
  let calls = 0;

  globalThis.fetch = (async (input, init) => {
    calls += 1;
    const request = new Request(input, init);
    authorizations.push(request.headers.get("Authorization") ?? "");
    requestBodies.push(JSON.parse(await request.text()) as RequestBody);
    return success(calls === 1 ? FIRST_RAW : SECOND_RAW);
  }) as typeof fetch;

  try {
    const result = await runExtraction([
      "photo-base64",
      "data:image/png;base64,png-base64",
    ], "test-key");

    assertEquals(calls, 2);
    assertEquals(authorizations, ["Bearer test-key", "Bearer test-key"]);
    assertEquals(requestBodies.map((body) => body.model), ["gpt-4o", "gpt-4o"]);
    for (const body of requestBodies) {
      assertEquals(
        body.messages[0].content[1].image_url?.url,
        "data:image/jpeg;base64,photo-base64",
      );
      assertEquals(
        body.messages[0].content[2].image_url?.url,
        "data:image/png;base64,png-base64",
      );
    }
    const optionsPrompt = requestBodies[1].messages[0].content[0].text ?? "";
    assertStringIncludes(optionsPrompt, '"item_index":0');
    assertStringIncludes(optionsPrompt, '"item_index":1');
    assertStringIncludes(optionsPrompt, '"description":"Con jamón"');

    assertEquals(result.items, [{
      name: "Revueltos",
      description: "Naturales",
      price: 78,
      category: "food",
      section_title: "Huevos",
      options: [],
    }, {
      name: "Revueltos",
      description: "Con jamón",
      price: 90,
      category: "food",
      section_title: "Huevos",
      options: [{ name: "Jamón", price: null, grams: null }],
    }]);
    assertEquals(JSON.parse(result.raw_response), {
      items: FIRST_RAW,
      options: SECOND_RAW,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("runExtraction rejects invalid or duplicate Pass 2 indices", async () => {
  const originalFetch = globalThis.fetch;
  const invalidSets = [
    [{ item_index: 0, options: [] }, { item_index: 0, options: [] }],
    [{ item_index: 0.5, options: [] }],
    [{ item_index: -1, options: [] }],
    [{ item_index: 1, options: [] }],
  ];

  try {
    for (const option_sets of invalidSets) {
      let calls = 0;
      globalThis.fetch = (async () => {
        calls += 1;
        return success(
          calls === 1 ? ONE_ITEM_RAW : JSON.stringify({ option_sets }),
        );
      }) as typeof fetch;

      await assertRejects(
        () => runExtraction(["photo-base64"], "test-key"),
        Error,
        "Invalid or duplicate item_index",
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("runExtraction propagates Pass 2 provider failures", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    if (calls === 1) return success(ONE_ITEM_RAW);
    return new Response(
      JSON.stringify({ error: { message: "pass 2 failed" } }),
      { status: 500 },
    );
  }) as typeof fetch;

  try {
    await assertRejects(
      () => runExtraction(["photo-base64"], "test-key"),
      Error,
      "pass 2 failed",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("extraction schemas split item and option contracts", () => {
  const extractSchema = EXTRACT_SCHEMA as {
    required: string[];
    properties: {
      image_quality?: { required: string[] };
      items: {
        items: {
          required: string[];
          properties: Record<string, unknown> & {
            category: { enum?: string[] };
            section_title?: { type: string[] };
          };
        };
      };
    };
  };
  const optionsSchema = OPTIONS_SCHEMA as {
    required: string[];
    properties: {
      option_sets: {
        items: {
          required: string[];
          properties: {
            options: { items: { required: string[] } };
          };
        };
      };
    };
  };
  const item = extractSchema.properties.items.items;

  assertEquals(extractSchema.required, ["image_quality", "items"]);
  assertEquals(extractSchema.properties.image_quality?.required, [
    "usable",
    "issues",
  ]);
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
  ]);
  assertEquals(item.properties.section_title?.type, ["string", "null"]);
  assertEquals("options" in item.properties, false);
  assertEquals(optionsSchema.required, ["option_sets"]);
  assertEquals(optionsSchema.properties.option_sets.items.required, [
    "item_index",
    "options",
  ]);
  assertEquals(
    optionsSchema.properties.option_sets.items.properties.options.items
      .required,
    ["name", "price", "grams"],
  );
});
