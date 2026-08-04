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
  structureMenuTextWithRetry,
  TILE_PROMPT_SUFFIX,
  verifyTileItems,
  verifyTileItemsBatched,
} from "./extract.ts";
import type { ExtractionResult } from "./extract.ts";
import { ocrMistralWithRetry } from "./mistral-extract.ts";

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
    Promise.resolve(
      new Response(JSON.stringify({
        choices: [{
          finish_reason: "length",
          message: { content: '{"image_quality":' },
        }],
      })),
    )) as typeof fetch;

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

const fakeResult = (
  over: Partial<ExtractionResult> = {},
): ExtractionResult => ({
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
    Promise.resolve(
      new Response(JSON.stringify({
        choices: [{
          finish_reason: "stop",
          message: {
            content: '{"verdicts":[{"index":1,"name_printed":false}]}',
          },
        }],
      })),
    )) as typeof fetch;

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
    Promise.resolve(
      new Response(JSON.stringify({
        choices: [{
          finish_reason: "stop",
          message: {
            content: '{"verdicts":[{"index":0,"name_printed":true}]}',
          },
        }],
      })),
    )) as typeof fetch;

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

Deno.test("verifyTileItemsBatched keeps 24 candidates in one verifier call", async () => {
  const items = Array.from(
    { length: 24 },
    (_, index) => menuItem(`Item ${index}`, index),
  );
  const batchSizes: number[] = [];
  const verify = ((
    _tile: string,
    batch: ExtractionResult["items"],
  ) => {
    batchSizes.push(batch.length);
    return Promise.resolve(batch);
  }) as typeof verifyTileItems;

  const kept = await verifyTileItemsBatched(
    "data:image/png;base64,tile",
    items,
    "key",
    verify,
  );

  assertEquals(batchSizes, [24]);
  assertEquals(kept, items);
});

Deno.test("verifyTileItemsBatched splits 36 candidates into ordered batches of 12", async () => {
  const items = Array.from(
    { length: 36 },
    (_, index) => menuItem(`Item ${index}`, index),
  );
  const batches: string[][] = [];
  const verify = ((
    _tile: string,
    batch: ExtractionResult["items"],
  ) => {
    batches.push(batch.map((item) => item.name));
    return Promise.resolve(batch);
  }) as typeof verifyTileItems;

  const kept = await verifyTileItemsBatched(
    "data:image/png;base64,tile",
    items,
    "key",
    verify,
  );

  assertEquals(batches.map((batch) => batch.length), [12, 12, 12]);
  assertEquals(batches.flat(), items.map((item) => item.name));
  assertEquals(kept, items);
});

Deno.test("runGroupedExtraction batches an overloaded tile before verification", async () => {
  const overloaded = Array.from(
    { length: 36 },
    (_, index) => menuItem(`Candidate ${index}`, index),
  );
  const results: ExtractionResult[] = [
    fakeResult({ items: overloaded, raw_response: "t1" }),
    fakeResult({ items: [], raw_response: "t2" }),
    fakeResult({ items: [], raw_response: "t3" }),
    fakeResult({ items: [], raw_response: "t4" }),
  ];
  let call = 0;
  const stub =
    (() => Promise.resolve(results[call++])) as typeof extractWithRetry;
  const batchSizes: number[] = [];
  const verify = ((
    _tile: string,
    batch: ExtractionResult["items"],
  ) => {
    if (batch.length > 0) batchSizes.push(batch.length);
    return Promise.resolve(batch);
  }) as typeof verifyTileItems;

  const result = await runGroupedExtraction(
    [["a", "b", "c", "d"]],
    "key",
    stub,
    verify,
  );

  assertEquals(batchSizes, [12, 12, 12]);
  assertEquals(
    result.items.map((item) => item.name),
    overloaded.map((item) => item.name),
  );
});

// ─── C3: the (c) text path (ruling 30) ───────────────────────────────────────
// Stage-1a Mistral OCR returns TEXT; Stage-1b a pinned model structures it.
// The chain order below is copied from scripts/score-c-dumps.ts, the harness
// that measured 40/45: postprocessItems PER PAGE -> mergeItemSources -> ONE
// textStructureCleanup over the "\n"-joined markdown of ALL pages.

type Structured = { items: unknown[]; raw_response: string };

const rawItem = (over: Record<string, unknown> = {}) => ({
  name: "Tacos",
  description: "",
  price: 100,
  category: "food",
  section_title: null,
  options: [],
  ...over,
});

Deno.test("runPagedExtraction: one photo means one OCR call, then one structuring call on its text", async () => {
  const ocrSeen: string[] = [];
  const structureSeen: string[] = [];
  const ocr = ((photo: string) => {
    ocrSeen.push(photo);
    return Promise.resolve({ markdown: "# TACOS\nTacos 100", raw_response: "o", blocks: [] });
  }) as typeof ocrMistralWithRetry;
  const structure = ((markdown: string) => {
    structureSeen.push(markdown);
    return Promise.resolve({ items: [rawItem()], raw_response: "s" });
  }) as typeof structureMenuTextWithRetry;

  const result = await runPagedExtraction(["a"], "mkey", "okey", ocr, structure);
  if ("needs_crops" in result) throw new Error("unexpected needs_crops");
  assertEquals(ocrSeen, ["a"]);
  assertEquals(structureSeen, ["# TACOS\nTacos 100"]);
  assertEquals(result.items, [menuItem("Tacos", 100)]);
  assertEquals(result.image_quality, { usable: true, issues: [] });
  assertEquals(result.image_layout, { dense: false, crop_direction: "none" });
  // Both stages are archived so a later session can diff raw model output
  // against our postprocessed output (master-roadmap lesson 21).
  assertEquals(JSON.parse(result.raw_response), [{ ocr: "o", structure: "s" }]);
});

Deno.test("runPagedExtraction: N photos run in parallel and cross-page merge", async () => {
  const seen: string[] = [];
  const structured: Structured[] = [
    { items: [rawItem()], raw_response: "s1" },
    {
      items: [rawItem({ description: "de pastor" }), rawItem({ name: "Sopa", price: 80 })],
      raw_response: "s2",
    },
  ];
  const release: (() => void)[] = [];
  const ocr = ((photo: string) => {
    const index = seen.length;
    seen.push(photo);
    return new Promise<{ markdown: string; raw_response: string; blocks: never[] }>((resolve) =>
      release.push(() => resolve({ markdown: `md${index}`, raw_response: `o${index}`, blocks: [] }))
    );
  }) as typeof ocrMistralWithRetry;
  const structure = ((markdown: string) =>
    Promise.resolve(
      structured[Number(markdown.replace("md", ""))],
    )) as typeof structureMenuTextWithRetry;

  const pending = runPagedExtraction(["a", "b"], "mkey", "okey", ocr, structure);
  assertEquals(seen, ["a", "b"]); // both OCR calls issued before either resolves
  release.forEach((resolve) => resolve());
  const result = await pending;
  if ("needs_crops" in result) throw new Error("unexpected needs_crops");
  assertEquals(result.items, [
    menuItem("Tacos", 100, "de pastor"),
    menuItem("Sopa", 80),
  ]);
  assertEquals(JSON.parse(result.raw_response), [
    { ocr: "o0", structure: "s1" },
    { ocr: "o1", structure: "s2" },
  ]);
});

Deno.test("runPagedExtraction: cleanup runs AFTER the merge over ALL pages' markdown joined by newline", async () => {
  // THIS TEST IS THE ONLY THING PINNING THE CHAIN ORDER — do not delete it as
  // redundant. Measured 2026-08-01 (eval 114): on the 9 real fixtures the
  // per-page and post-merge orders are a STRICT NO-OP, both scoring 40/45, so
  // neither the replay gate nor the harness comparison notices the difference.
  // Eight fixtures are single-page and the one two-page menu has no cross-page
  // fold. The case below is therefore SYNTHETIC on purpose: the priced-heading
  // card fold (C2-3) needs the heading `# TORTAS $20`, printed on page 0, to
  // reach an item that arrived on page 1. Only a single post-merge cleanup over
  // the joined text can see it. Verified RED under the per-page order.
  const markdowns = ["# TORTAS $20", "nothing here"];
  const structured: Structured[] = [
    { items: [rawItem()], raw_response: "s0" },
    {
      items: [rawItem({ name: "De Fresa", price: 15, section_title: "TORTAS" })],
      raw_response: "s1",
    },
  ];
  const ocr = ((photo: string) => {
    const index = photo === "a" ? 0 : 1;
    return Promise.resolve({
      markdown: markdowns[index],
      raw_response: `o${index}`,
      blocks: [],
    });
  }) as typeof ocrMistralWithRetry;
  const structure = ((markdown: string) =>
    Promise.resolve(
      structured[markdowns.indexOf(markdown)],
    )) as typeof structureMenuTextWithRetry;

  const result = await runPagedExtraction(["a", "b"], "mkey", "okey", ocr, structure);
  if ("needs_crops" in result) throw new Error("unexpected needs_crops");
  assertEquals(result.items.map((item) => item.name), ["Tacos", "TORTAS"]);
  assertEquals(result.items[1].price, 20);
  assertEquals(result.items[1].options, [
    { name: "De Fresa", price: 15, grams: null },
  ]);
});

Deno.test("runPagedExtraction: postprocessItems runs on each page's items", async () => {
  const ocr = (() =>
    Promise.resolve({
      markdown: "md",
      raw_response: "o",
      blocks: [],
    })) as typeof ocrMistralWithRetry;
  const structure = (() =>
    Promise.resolve({
      items: [rawItem({ name: "Boneless (300gr)" })],
      raw_response: "s",
    })) as typeof structureMenuTextWithRetry;

  const result = await runPagedExtraction(["a"], "mkey", "okey", ocr, structure);
  if ("needs_crops" in result) throw new Error("unexpected needs_crops");
  assertEquals(result.items[0].grams, 300); // parseItemGrams, postprocess only
});

Deno.test("runPagedExtraction: never returns needs_crops for a landscape-shaped photo", async () => {
  const ocr = (() =>
    Promise.resolve({
      markdown: "",
      raw_response: "o",
      blocks: [],
    })) as typeof ocrMistralWithRetry;
  const structure = (() =>
    Promise.resolve({ items: [], raw_response: "s" })) as
      typeof structureMenuTextWithRetry;
  const result = await runPagedExtraction(
    ["data:image/jpeg;base64,wide"],
    "mkey",
    "okey",
    ocr,
    structure,
  );
  assertEquals("needs_crops" in result, false);
});

Deno.test("ocrMistralWithRetry retries a timeout once then propagates", async () => {
  let calls = 0;
  const stub = (() => {
    calls++;
    return Promise.reject(new Error("Model request timed out after 120s"));
  }) as typeof ocrMistralWithRetry;
  await assertRejects(
    () => ocrMistralWithRetry("a", "key", stub),
    Error,
    "timed out",
  );
  assertEquals(calls, 2);
});

Deno.test("structureMenuTextWithRetry retries a timeout once then succeeds", async () => {
  let calls = 0;
  const stub = (() => {
    calls++;
    return calls === 1
      ? Promise.reject(new Error("Model request timed out after 120s"))
      : Promise.resolve({ items: [], raw_response: "second" });
  }) as typeof structureMenuTextWithRetry;
  const result = await structureMenuTextWithRetry("md", "key", stub);
  assertEquals(calls, 2);
  assertEquals(result.raw_response, "second");
});

Deno.test("structureMenuTextWithRetry retries a truncated completion once", async () => {
  let calls = 0;
  const stub = (() => {
    calls++;
    return calls === 1
      ? Promise.reject(
        new Error("OpenAI extraction stopped with finish_reason=length"),
      )
      : Promise.resolve({ items: [], raw_response: "second" });
  }) as typeof structureMenuTextWithRetry;
  await structureMenuTextWithRetry("md", "key", stub);
  assertEquals(calls, 2);
});

Deno.test("structureMenuTextWithRetry does not retry non-transient errors", async () => {
  let calls = 0;
  const stub = (() => {
    calls++;
    return Promise.reject(new Error("OpenAI API error"));
  }) as typeof structureMenuTextWithRetry;
  await assertRejects(
    () => structureMenuTextWithRetry("md", "key", stub),
    Error,
    "OpenAI API error",
  );
  assertEquals(calls, 1);
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
    Promise.resolve(
      fakeResult({ items: [menuItem("Sopa", 80)] }),
    )) as typeof extractWithRetry;
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
  const stub =
    (() => Promise.resolve(results[call++])) as typeof extractWithRetry;
  let verifyCalls = 0;
  const verify = (() => {
    verifyCalls++;
    return Promise.reject(new Error("boom"));
  }) as typeof verifyTileItems;

  const result = await runGroupedExtraction(
    [["a", "b", "c", "d"]],
    "key",
    stub,
    verify,
  );
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
  const stub =
    (() => Promise.resolve(results[call++])) as typeof extractWithRetry;
  const seen: string[][] = [];
  const verify = ((_tile: string, items: ExtractionResult["items"]) => {
    seen.push(items.map((i) => i.name));
    return Promise.resolve(items.filter((i) => i.name !== "Phantom Roll"));
  }) as typeof verifyTileItems;

  const result = await runGroupedExtraction(
    [["a", "b", "c", "d"]],
    "key",
    stub,
    verify,
  );
  assertEquals(seen.length, 4);
  assertEquals(seen[0], ["Roll A", "Phantom Roll"]);
  assertEquals(result.items, [
    menuItem("Roll A", 100),
    menuItem("Roll B", 120),
  ]);
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
  const stub =
    (() => Promise.resolve(results[call++])) as typeof extractWithRetry;
  const verify =
    ((_tile: string, items: ExtractionResult["items"]) =>
      Promise.resolve(items)) as typeof verifyTileItems;

  const result = await runGroupedExtraction(
    [["a", "b", "c", "d"]],
    "key",
    stub,
    verify,
  );
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

Deno.test("runGroupedExtraction single-photo pages get the page suffix", async () => {
  const calls: { tile: boolean; page: boolean }[] = [];
  const fake = (
    photos: string[],
    _key: string,
    _detail?: "auto" | "high" | "low",
    _extract?: unknown,
    tile = false,
    page = false,
  ) => {
    calls.push({ tile, page });
    return Promise.resolve({
      image_quality: { usable: true, issues: [] },
      image_layout: { dense: false, crop_direction: "none" as const },
      items: [],
      raw_response: "",
    });
  };
  // deno-lint-ignore no-explicit-any
  await runGroupedExtraction([["a"]], "key", fake as any);
  assertEquals(calls.map((c) => c.page), [true]);
  assertEquals(calls.every((c) => !c.tile), true);
});

Deno.test("runGroupedExtraction sends OCR photos only for dense groups", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = Deno.env.get("MISTRAL_API_KEY");
  const ocrPhotos: string[] = [];
  globalThis.fetch = (async (input, init) => {
    const body = JSON.parse(await new Request(input, init).text()) as {
      document: { image_url: string };
    };
    ocrPhotos.push(body.document.image_url);
    return new Response(JSON.stringify({
      pages: [{
        blocks: Array.from({ length: 5 }, (_, index) => ({
          content: `line ${index}`,
          type: "text",
        })),
      }],
    }));
  }) as typeof fetch;
  Deno.env.set("MISTRAL_API_KEY", "test-key");
  try {
    const results = [
      fakeResult({ raw_response: "portrait" }),
      ...[
        "tile-1",
        "tile-2",
        "tile-3",
        "tile-4",
      ].map((raw_response) => fakeResult({ raw_response })),
    ];
    let call = 0;
    const extract = (() =>
      Promise.resolve(results[call++])) as typeof extractWithRetry;
    const verify = ((_tile: string, items: ExtractionResult["items"]) =>
      Promise.resolve(items)) as typeof verifyTileItems;

    await runGroupedExtraction(
      [["portrait"], ["tile-1", "tile-2", "tile-3", "tile-4"]],
      "openai-key",
      extract,
      verify,
      ["portrait-ocr", "full-photo-ocr"],
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) Deno.env.delete("MISTRAL_API_KEY");
    else Deno.env.set("MISTRAL_API_KEY", originalKey);
  }
  assertEquals(ocrPhotos, ["full-photo-ocr"]);
});
