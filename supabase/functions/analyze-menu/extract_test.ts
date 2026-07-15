import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  EXTRACT_PROMPT,
  EXTRACT_SCHEMA,
  extractWithRetry,
  PAGE_PROMPT_SUFFIX,
  runCropExtractions,
  runExtraction,
  runGroupedExtraction,
  runPagedExtraction,
  TILE_PROMPT_SUFFIX,
  verifyTileItems,
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

Deno.test("verifyTileItems drops items with name_printed=false verdicts", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(new Response(JSON.stringify({
      choices: [{
        finish_reason: "stop",
        message: {
          content: '{"verdicts":[{"index":1,"name_printed":false}]}',
        },
      }],
    })))) as typeof fetch;

  try {
    const kept = await verifyTileItems(
      "data:image/png;base64,tile",
      [menuItem("A", 10), menuItem("B", 20)],
      "key",
    );
    assertEquals(kept, [menuItem("A", 10)]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("verifyTileItems keeps items missing from the verdict list", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(new Response(JSON.stringify({
      choices: [{
        finish_reason: "stop",
        message: {
          content: '{"verdicts":[{"index":0,"name_printed":true}]}',
        },
      }],
    })))) as typeof fetch;

  try {
    const kept = await verifyTileItems(
      "data:image/png;base64,tile",
      [menuItem("A", 10), menuItem("B", 20)],
      "key",
    );
    assertEquals(kept, [menuItem("A", 10), menuItem("B", 20)]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("verifyTileItems fails open when verification throws", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => Promise.reject(new Error("boom"))) as typeof fetch;

  try {
    const kept = await verifyTileItems(
      "data:image/png;base64,tile",
      [menuItem("A", 10), menuItem("B", 20)],
      "key",
    );
    assertEquals(kept, [menuItem("A", 10), menuItem("B", 20)]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("verifyTileItems sends exactly one image and name-only candidates", async () => {
  const originalFetch = globalThis.fetch;
  // deno-lint-ignore no-explicit-any
  let sentContent: any[] = [];
  globalThis.fetch = (async (input, init) => {
    const request = new Request(input, init);
    const body = JSON.parse(await request.text());
    sentContent = body.messages[0].content;
    return new Response(JSON.stringify({
      choices: [{
        finish_reason: "stop",
        message: { content: '{"verdicts":[]}' },
      }],
    }));
  }) as typeof fetch;

  try {
    await verifyTileItems(
      "data:image/png;base64,tile",
      [menuItem("A", 10)],
      "key",
    );
    const images = sentContent.filter((part) => part.type === "image_url");
    assertEquals(images.length, 1);
    const candidates = JSON.parse(
      sentContent[0].text.slice(sentContent[0].text.indexOf("[")),
    );
    assertEquals(candidates, [{ index: 0, name: "A" }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("verifyTileItems skips the API call for an empty tile", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (() => {
    fetchCalls++;
    return Promise.reject(new Error("should not be called"));
  }) as typeof fetch;

  try {
    const kept = await verifyTileItems("data:image/png;base64,tile", [], "key");
    assertEquals(kept, []);
    assertEquals(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("runPagedExtraction: one photo means exactly one call, default detail, passthrough", async () => {
  const seen: { photos: string[]; detail?: string }[] = [];
  const stub = ((photos: string[], _key: string, detail?: string) => {
    seen.push({ photos, detail });
    return Promise.resolve(fakeResult({ raw_response: "single" }));
  }) as typeof extractWithRetry;
  const result = await runPagedExtraction(["a"], "key", stub);
  if ("needs_crops" in result) throw new Error("unexpected dense");
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
      raw_response: "r2",
    }),
  ];
  const stub = ((photos: string[], _key: string, detail?: string) => {
    seen.push({ photos, detail });
    return Promise.resolve(pages[seen.length - 1]);
  }) as typeof extractWithRetry;

  const result = await runPagedExtraction(["a", "b"], "key", stub);
  if ("needs_crops" in result) throw new Error("unexpected dense");

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
  assertEquals(result.image_layout, { dense: false, crop_direction: "none" });
  // Raw payloads preserved per page as a JSON array string.
  assertEquals(JSON.parse(result.raw_response), ["r1", "r2"]);
});

Deno.test("runPagedExtraction: dense layout flag returns needs_crops, not items", async () => {
  const stub = (() =>
    Promise.resolve(fakeResult({
      image_layout: { dense: true, crop_direction: "none" },
      items: [menuItem("Garbage", 1)],
    }))) as typeof extractWithRetry;
  const result = await runPagedExtraction(["a"], "key", stub);
  assertEquals(result, { needs_crops: [0] });
});

Deno.test("runPagedExtraction: terminal length failure is a dense signal", async () => {
  const pages: (() => Promise<ExtractionResult>)[] = [
    () => Promise.resolve(fakeResult()),
    () =>
      Promise.reject(
        new Error("OpenAI extraction stopped with finish_reason=length"),
      ),
  ];
  let call = 0;
  const stub = (() => pages[call++]()) as typeof extractWithRetry;
  const result = await runPagedExtraction(["a", "b"], "key", stub);
  assertEquals(result, { needs_crops: [1] });
});

Deno.test("runPagedExtraction: non-dense terminal failure still throws", async () => {
  const stub = (() =>
    Promise.reject(new Error("OpenAI API error"))) as typeof extractWithRetry;
  await assertRejects(
    () => runPagedExtraction(["a"], "key", stub),
    Error,
    "OpenAI API error",
  );
});

Deno.test("runGroupedExtraction: 1-photo and 4-tile groups merge to one menu", async () => {
  const seen: { photos: string[]; detail?: string }[] = [];
  const results: ExtractionResult[] = [
    fakeResult({ items: [menuItem("Sopa", 80)], raw_response: "page1" }),
    fakeResult({
      items: [menuItem("Roll A", 100), {
        ...menuItem("Cola", 30),
        category: "drink" as const,
      }],
      raw_response: "t1",
    }),
    fakeResult({ items: [menuItem("Roll A", 100)], raw_response: "t2" }),
    fakeResult({ items: [menuItem("Roll B", 120)], raw_response: "t3" }),
    fakeResult({ items: [], raw_response: "t4" }),
  ];
  let call = 0;
  const stub = ((photos: string[], _key: string, detail?: string) => {
    seen.push({ photos, detail });
    return Promise.resolve(results[call++]);
  }) as typeof extractWithRetry;

  const merged = await runGroupedExtraction(
    [["p1"], ["a", "b", "c", "d"]],
    "key",
    stub,
  );

  assertEquals(seen[0], { photos: ["p1"], detail: undefined });
  assertEquals(seen.slice(1).map((s) => s.detail), [
    "high",
    "high",
    "high",
    "high",
  ]);
  // Tile drink filtered, tile duplicate merged, groups merged in order.
  assertEquals(merged.items, [
    menuItem("Sopa", 80),
    menuItem("Roll A", 100),
    menuItem("Roll B", 120),
  ]);
  assertEquals(JSON.parse(merged.raw_response), [
    "page1",
    "t1",
    "t2",
    "t3",
    "t4",
  ]);
});

Deno.test("runGroupedExtraction: rejects malformed group sizes", async () => {
  const stub = (() => Promise.resolve(fakeResult())) as typeof extractWithRetry;
  await assertRejects(
    () => runGroupedExtraction([["a", "b"]], "key", stub),
    Error,
    "group",
  );
});

Deno.test("runGroupedExtraction: 1-photo groups never call the verifier", async () => {
  let verifyCalls = 0;
  const stub = (() =>
    Promise.resolve(fakeResult({ items: [menuItem("Sopa", 80)] }))) as typeof extractWithRetry;
  const verify = (() => {
    verifyCalls++;
    return Promise.resolve([menuItem("Nope", 0)]);
  }) as typeof verifyTileItems;

  const result = await runGroupedExtraction([["a"]], "key", stub, verify);
  assertEquals(verifyCalls, 0);
  assertEquals(result.items, [menuItem("Sopa", 80)]);
});

Deno.test("runGroupedExtraction: verifier fail-open does not reject a 4-tile scan", async () => {
  const results: ExtractionResult[] = [
    fakeResult({ items: [menuItem("Roll A", 100)], raw_response: "t1" }),
    fakeResult({ items: [menuItem("Roll A", 100)], raw_response: "t2" }),
    fakeResult({ items: [menuItem("Roll B", 120)], raw_response: "t3" }),
    fakeResult({ items: [], raw_response: "t4" }),
  ];
  let call = 0;
  const stub = (() => Promise.resolve(results[call++])) as typeof extractWithRetry;
  let verifyCalls = 0;
  const verify = (() => {
    verifyCalls++;
    return Promise.reject(new Error("boom"));
  }) as typeof verifyTileItems;

  const result = await runGroupedExtraction([["a", "b", "c", "d"]], "key", stub, verify);
  assertEquals(verifyCalls, 4);
  assertEquals(result.items, [
    menuItem("Roll A", 100),
    menuItem("Roll B", 120),
  ]);
});

Deno.test("runGroupedExtraction: verifies each tile pre-merge, phantoms die at source", async () => {
  const results: ExtractionResult[] = [
    fakeResult({
      items: [menuItem("Roll A", 100), menuItem("Phantom Roll", 50)],
      raw_response: "t1",
    }),
    fakeResult({ items: [menuItem("Roll A", 100)], raw_response: "t2" }),
    fakeResult({ items: [menuItem("Roll B", 120)], raw_response: "t3" }),
    fakeResult({ items: [], raw_response: "t4" }),
  ];
  let call = 0;
  const stub = (() => Promise.resolve(results[call++])) as typeof extractWithRetry;
  const seen: string[][] = [];
  const verify = ((_tile: string, items: ExtractionResult["items"]) => {
    seen.push(items.map((i) => i.name));
    return Promise.resolve(items.filter((i) => i.name !== "Phantom Roll"));
  }) as typeof verifyTileItems;

  const result = await runGroupedExtraction([["a", "b", "c", "d"]], "key", stub, verify);
  assertEquals(seen.length, 4);
  assertEquals(seen[0], ["Roll A", "Phantom Roll"]);
  assertEquals(result.items, [menuItem("Roll A", 100), menuItem("Roll B", 120)]);
});

Deno.test("runGroupedExtraction: drops standalone option echoes after tile merge", async () => {
  const results: ExtractionResult[] = [
    fakeResult({
      items: [{
        ...menuItem("Paletas Heladas Agua", 20),
        options: [{ name: "Uva", price: null, grams: null }],
      }],
      raw_response: "t1",
    }),
    fakeResult({
      items: [menuItem("Uva", 20)],
      raw_response: "t2",
    }),
    fakeResult({ items: [], raw_response: "t3" }),
    fakeResult({ items: [], raw_response: "t4" }),
  ];
  let call = 0;
  const stub = (() => Promise.resolve(results[call++])) as typeof extractWithRetry;
  const verify = ((_tile: string, items: ExtractionResult["items"]) =>
    Promise.resolve(items)) as typeof verifyTileItems;

  const result = await runGroupedExtraction([["a", "b", "c", "d"]], "key", stub, verify);
  assertEquals(result.items, [{
    ...menuItem("Paletas Heladas Agua", 20),
    options: [{ name: "Uva", price: null, grams: null }],
  }]);
});

Deno.test("tile calls append TILE_PROMPT_SUFFIX; normal calls send P1 verbatim", async () => {
  const originalFetch = globalThis.fetch;
  const prompts: string[] = [];
  globalThis.fetch = (async (input, init) => {
    const request = new Request(input, init);
    const body = JSON.parse(await request.text());
    prompts.push(body.messages[0].content[0].text);
    return new Response(JSON.stringify({
      choices: [{
        finish_reason: "stop",
        message: {
          content:
            '{"image_quality":{"usable":true,"issues":[]},"image_layout":{"dense":false,"crop_direction":"none"},"items":[]}',
        },
      }],
    }));
  }) as typeof fetch;
  try {
    await runExtraction(["p"], "key");
    await runExtraction(["p"], "key", "high", true);
    await runExtraction(["p"], "key", "high", false, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assertEquals(prompts[0], EXTRACT_PROMPT);
  assertEquals(prompts[1], EXTRACT_PROMPT + TILE_PROMPT_SUFFIX);
  assertEquals(prompts[2], EXTRACT_PROMPT + PAGE_PROMPT_SUFFIX);
});

Deno.test("multi-photo pages get the page suffix; single-photo scans do not", async () => {
  const calls: { photos: string[]; tile: boolean; page: boolean }[] = [];
  const fake = (
    photos: string[],
    _key: string,
    _detail?: "auto" | "high" | "low",
    _extract?: unknown,
    tile = false,
    page = false,
  ) => {
    calls.push({ photos, tile, page });
    return Promise.resolve({
      image_quality: { usable: true, issues: [] },
      image_layout: { dense: false, crop_direction: "none" as const },
      items: [],
      raw_response: "",
    });
  };
  // deno-lint-ignore no-explicit-any
  await runPagedExtraction(["a"], "key", fake as any);
  // deno-lint-ignore no-explicit-any
  await runPagedExtraction(["a", "b"], "key", fake as any);
  // deno-lint-ignore no-explicit-any
  await runGroupedExtraction([["a"]], "key", fake as any);
  assertEquals(calls.map((c) => c.page), [false, true, true, true]);
  assertEquals(calls.every((c) => !c.tile), true);
});
