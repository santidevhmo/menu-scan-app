import {
  dropBannerEchoOptions,
  dropHeaderEchoes,
  dropOptionEchoItems,
  postprocessItems,
  remapTruncatedSectionTitles,
} from "./postprocess.ts";
import { mergeItemSources } from "./merge.ts";
import { colocationStage } from "./colocation.ts";

const MODEL_TIMEOUT_MS = 120000;
const EXTRACT_SEED = 17;

export const EXTRACT_PROMPT =
  `Read this restaurant menu. Return every item exactly as printed, in menu order:
name, description, price, category, section_title, and options.
Do NOT estimate calories or nutrition. Do NOT invent items you cannot read.
Extract all visible menu items from every provided photo and every menu section.
Do not stop after a representative sample, a section summary, or the first page.
There is no maximum number of items; keep going until every readable item is returned.
Never return a section header as an item.
Copy the nearest printed heading that visually groups an item into section_title.
When a heading contains smaller subheadings, each item belongs to its nearest
subheading, never the parent (a spirits list under a parent heading with per-spirit
subheadings uses the spirit subheading). Use only printed headings; never invent
a grouping that is not printed on the menu. Set section_title to null
only when no heading groups the item. Preserve the item name exactly; never prepend
or synthesize the heading into the name.
A heading is often larger text without its own price, weight, or description, but
it must also group menu items beneath it. Do not treat restaurant names, slogans,
or promotional text as section headings.
Use category "food" for appetizers, entrees, main dishes, and other prepared food.
Use "side", "dessert", or "drink" only when that role is clear; otherwise use "other".
An option is a printed choice about one item's composition: a protein or filling
choice, a paid add-on, a dietary swap, or a flavor choice. Capture each option with
its printed price and weight in grams when present; otherwise use null.
Serving formats and sizes (glass vs bottle, copa vs botella, small vs large) are
NOT options. Distinct products listed under a shared heading are separate items,
not options.
When the same base dish is printed several times with different fillings, proteins,
or preparations, return ONE item named after the base dish and put each printed
variant in options. Never return duplicate item names for variants of one dish.
A choice printed inside a description ("con X o Y", "choice of X or Y") is an
options list; capture each choice in options. Do not move options into the description.
Ingredients joined by "y" or "and" ("con jamón y queso", "with ham and cheese")
are parts of ONE dish, never options; keep them in the item's name or description.
Never invent an option from words inside a name or sentence unless the menu
prints a choice word ("o", "or", "a elegir", "choice of") or prints a separate
price or weight for that alternative.
When a printed weight or volume accompanies an item (e.g. "(70gr.)", "350 ml"),
keep it verbatim in that item's name or description; never omit or clean away
printed weights.
If a description is not printed, use an empty string. If a price is not printed, set it to null.
Assess the visible menu layout. Set image_layout.dense=true only when small text,
many tightly packed items, or a crowded multi-group layout risks incomplete
extraction from the full image. For side-by-side content use crop_direction
"left_right"; for vertically stacked content use "top_bottom". For a normal
menu set dense=false and crop_direction="none".
Assess image quality across all photos. Report blur, low_light, glare, or another concise issue.
Set usable to false only when the menu cannot be read reliably.`;

// ponytail: v2 prompt/schema are an unproven hypothesis until the real-menu harness passes.
export const EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    image_quality: {
      type: "object",
      properties: {
        usable: { type: "boolean" },
        issues: { type: "array", items: { type: "string" } },
      },
      required: ["usable", "issues"],
      additionalProperties: false,
    },
    image_layout: {
      type: "object",
      properties: {
        dense: { type: "boolean" },
        crop_direction: {
          type: "string",
          enum: ["none", "left_right", "top_bottom"],
        },
      },
      required: ["dense", "crop_direction"],
      additionalProperties: false,
    },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          price: { type: ["number", "null"] },
          category: {
            type: "string",
            enum: ["food", "side", "dessert", "drink", "other"],
          },
          section_title: { type: ["string", "null"] },
          options: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                price: { type: ["number", "null"] },
                grams: { type: ["number", "null"] },
              },
              required: ["name", "price", "grams"],
              additionalProperties: false,
            },
          },
        },
        required: [
          "name",
          "description",
          "price",
          "category",
          "section_title",
          "options",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["image_quality", "image_layout", "items"],
  additionalProperties: false,
};

export const VERIFY_SCHEMA = {
  type: "object",
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer" },
          name_printed: { type: "boolean" },
        },
        required: ["index", "name_printed"],
        additionalProperties: false,
      },
    },
  },
  required: ["verdicts"],
  additionalProperties: false,
};

export type CropDirection = "none" | "left_right" | "top_bottom";

export interface ImageLayout {
  dense: boolean;
  crop_direction: CropDirection;
}

export interface ImageQuality {
  usable: boolean;
  issues: string[];
}

export interface ExtractedMenuItem {
  name: string;
  description: string;
  price: number | null;
  category: "food" | "side" | "dessert" | "drink" | "other";
  section_title: string | null;
  options: { name: string; price: number | null; grams: number | null }[];
  // Printed item weight in grams, parsed deterministically from name/description
  // by postprocess (parseItemGrams) — NOT model-filled; EXTRACT_SCHEMA unchanged.
  grams: number | null;
}

export interface ExtractionResult {
  image_quality: ImageQuality;
  image_layout: ImageLayout;
  items: ExtractedMenuItem[];
  raw_response: string;
}

function logVerifyResult(
  total: ExtractedMenuItem[],
  kept: ExtractedMenuItem[],
  nameRejected = 0,
): void {
  const keptSet = new Set(kept);
  const dropped = total.filter((item) => !keptSet.has(item));
  console.log("[verify]", {
    kept: kept.length,
    dropped: dropped.length,
    total: total.length,
    name_rejected: nameRejected,
    dropped_names: dropped.map((item) => item.name),
  });
}

// Sent ONLY with cropped-tile calls (dense flow): partial cards at tile edges
// otherwise get "reconstructed" into phantom dishes (nikkori diagnosis
// 2026-07-11 — "Cosmo de Pollo" cut mid-card became "Pollo Roll"). The
// neighboring tile always contains the full card, so skipping is lossless.
export const TILE_PROMPT_SUFFIX =
  `\nThis image is one cropped tile of a larger menu photo; items at the edges
may be cut off. Transcribe only items whose printed name is completely visible
in this tile. Skip any partially visible or cut-off item entirely — do not
guess or reconstruct its name; a neighboring tile shows it in full.`;

// Sent ONLY with per-page calls of a multi-photo scan (and the 1-photo groups
// of stage extract-pages): the completeness rule that fixed brasero-two's
// dropped "A elegir" line and skipped boxed insert (page-only A/B 2026-07-11:
// loiro options 8/8 vs intermittent) REGRESSED single-photo menus when global
// (P1 v6 gate loop 2/12: false-positive items from promo boxes on el-marcos /
// mochomos, and nikkori's dense self-assessment stopped firing) — so it is
// scoped to the page mode where it earned its evidence, like TILE_PROMPT_SUFFIX.
export const PAGE_PROMPT_SUFFIX =
  `\nThis photo is one page of a multi-page menu. Transcribe each item's card
completely: include its final printed line even when it is smaller or italic
(a trailing "a elegir"/"choice of" line with prices is part of that item's
options). Menus also print items inside boxed or bordered insert blocks and
sidebars; extract the items in every box exactly like items in the main
columns.`;

export const VERIFY_PROMPT =
  `You are verifying a menu transcription against a photo. The photo is one
cropped tile of a larger menu page; every candidate in the JSON list was
transcribed from THIS image. For each candidate answer ONE question from the
image only:
name_printed: does a printed menu item in this image correspond to this name?
Answer true when one does, ignoring small spelling differences, accents,
capitalization, and size or weight annotations like "(300gr)". Answer false
only when no printed dish corresponds to it — for example a name that combines
words from two different printed dishes is NOT printed.
When unsure, answer true.`;

export async function runExtraction(
  photos: string[],
  apiKey: string,
  detail?: "auto" | "high" | "low",
  tile = false,
  page = false,
): Promise<ExtractionResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{
          role: "user",
          content: [
            {
              type: "text",
              text: EXTRACT_PROMPT +
                (tile ? TILE_PROMPT_SUFFIX : page ? PAGE_PROMPT_SUFFIX : ""),
            },
            ...photos.map((photo) => ({
              type: "image_url",
              image_url: {
                url: photo.startsWith("data:")
                  ? photo
                  : `data:image/jpeg;base64,${photo}`,
                ...(detail ? { detail } : {}),
              },
            })),
          ],
        }],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "menu_items",
            strict: true,
            schema: EXTRACT_SCHEMA,
          },
        },
        temperature: 0,
        seed: EXTRACT_SEED,
      }),
      signal: controller.signal,
    });
    const json = await res.json() as {
      error?: { message?: string };
      system_fingerprint?: string;
      choices?: { finish_reason: string; message: { content: string } }[];
    };
    if (!res.ok) throw new Error(json.error?.message ?? "OpenAI API error");

    const choice = json.choices?.[0];
    if (!choice) throw new Error("OpenAI returned no extraction choice");
    if (choice.finish_reason !== "stop") {
      throw new Error(
        `OpenAI extraction stopped with finish_reason=${choice.finish_reason}`,
      );
    }
    const text = choice.message.content;
    if (!text) throw new Error("OpenAI returned no extraction content");

    console.log(
      "[openai] finish_reason:",
      choice.finish_reason,
      "fingerprint:",
      json.system_fingerprint ?? "n/a",
    );
    const parsed = JSON.parse(text) as Omit<ExtractionResult, "raw_response">;
    return {
      ...parsed,
      items: postprocessItems(parsed.items),
      raw_response: text,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        `Model request timed out after ${MODEL_TIMEOUT_MS / 1000}s`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// One retry on transient model failures — the 120s timeout (nikkori tile,
// eval 031+033 validation) and finish_reason=length (verbosity is
// nondeterministic; a dense page occasionally overruns the completion cap,
// eval 043). Moved from the eval runner (2026-07-10) so production inherits
// the resilience the 3/3 gate was measured with.
export async function extractWithRetry(
  photos: string[],
  apiKey: string,
  detail?: "auto" | "high" | "low",
  extract = runExtraction,
  tile = false,
  page = false,
): Promise<ExtractionResult> {
  try {
    return await extract(photos, apiKey, detail, tile, page);
  } catch (error) {
    const message = String(error);
    if (
      !message.includes("timed out") &&
      !message.includes("finish_reason=length")
    ) throw error;
    console.log("[extract] transient model failure — retrying call once");
    return await extract(photos, apiKey, detail, tile, page);
  }
}

export async function verifyTileItems(
  tile: string,
  items: ExtractedMenuItem[],
  apiKey: string,
): Promise<ExtractedMenuItem[]> {
  if (items.length === 0) return items;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);

    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [{
            role: "user",
            content: [
              {
                type: "text",
                text: `${VERIFY_PROMPT}\n\n${
                  JSON.stringify(
                    items.map((item, index) => ({ index, name: item.name })),
                  )
                }`,
              },
              {
                type: "image_url",
                image_url: {
                  url: tile.startsWith("data:")
                    ? tile
                    : `data:image/jpeg;base64,${tile}`,
                  detail: "high",
                },
              },
            ],
          }],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "menu_item_verdicts",
              strict: true,
              schema: VERIFY_SCHEMA,
            },
          },
          temperature: 0,
          seed: EXTRACT_SEED,
        }),
        signal: controller.signal,
      });
      const json = await res.json() as {
        error?: { message?: string };
        choices?: { finish_reason: string; message: { content: string } }[];
      };
      if (!res.ok) throw new Error(json.error?.message ?? "OpenAI API error");

      const choice = json.choices?.[0];
      if (!choice) throw new Error("OpenAI returned no verification choice");
      if (choice.finish_reason !== "stop") {
        throw new Error(
          `OpenAI verification stopped with finish_reason=${choice.finish_reason}`,
        );
      }
      const text = choice.message.content;
      if (!text) throw new Error("OpenAI returned no verification content");

      const parsed = JSON.parse(text) as {
        verdicts: { index: number; name_printed: boolean }[];
      };
      const nameRejected = new Set(
        parsed.verdicts
          .filter((verdict) => verdict.name_printed === false)
          .map((verdict) => verdict.index),
      );
      const kept = items.filter((_, index) => !nameRejected.has(index));
      logVerifyResult(items, kept, nameRejected.size);
      return kept;
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    logVerifyResult(items, items);
    return items;
  }
}

const VERIFY_OVERLOAD_THRESHOLD = 24;
const VERIFY_BATCH_SIZE = 12;

export async function verifyTileItemsBatched(
  tile: string,
  items: ExtractedMenuItem[],
  apiKey: string,
  verify: typeof verifyTileItems = verifyTileItems,
): Promise<ExtractedMenuItem[]> {
  if (items.length <= VERIFY_OVERLOAD_THRESHOLD) {
    return await verify(tile, items, apiKey);
  }

  const batches = Array.from(
    { length: Math.ceil(items.length / VERIFY_BATCH_SIZE) },
    (_, index) =>
      items.slice(
        index * VERIFY_BATCH_SIZE,
        (index + 1) * VERIFY_BATCH_SIZE,
      ),
  );

  return (
    await Promise.all(
      batches.map((batch) => verify(tile, batch, apiKey)),
    )
  ).flat();
}

export type PagedExtraction = ExtractionResult | { needs_crops: number[] };

const DENSE_FAILURE = /timed out|finish_reason=length/;

function foldResults(
  results: ExtractionResult[],
  items: ExtractedMenuItem[],
): ExtractionResult {
  return {
    items,
    image_quality: {
      usable: results.every((r) => r.image_quality.usable),
      issues: [...new Set(results.flatMap((r) => r.image_quality.issues))],
    },
    image_layout: results[0].image_layout,
    raw_response: JSON.stringify(results.map((r) => r.raw_response)),
  };
}

// The iter-036 per-page recipe as the shared production path, now with the
// dense detector (failure-as-signal, probed 2026-07-10 3/3): a page is dense
// when it reports image_layout.dense OR terminally fails with timeout /
// finish_reason=length after the retry — the two ways a dense page presents
// (garbage items or truncation). Dense pages' items are never returned; the
// client must cut 2x2 tiles from the originals and use stage:"extract-pages".
// Non-dense terminal failures still fail the scan. 1 photo ⇒ one call
// (default detail); N photos ⇒ one high-detail call per page, in parallel,
// merged into ONE menu so enrichment runs once per scan.
export async function runPagedExtraction(
  photos: string[],
  apiKey: string,
  extract = extractWithRetry,
): Promise<PagedExtraction> {
  const settled = await Promise.allSettled(
    photos.length === 1
      ? [extract(photos, apiKey)]
      : photos.map((photo) =>
        extract([photo], apiKey, "high", undefined, false, true)
      ),
  );
  const needsCrops = settled.flatMap((s, index) =>
    (s.status === "fulfilled"
        ? s.value.image_layout.dense
        : DENSE_FAILURE.test(String(s.reason)))
      ? [index]
      : []
  );
  if (needsCrops.length > 0) return { needs_crops: needsCrops };
  const rejected = settled.find((s) => s.status === "rejected");
  if (rejected) throw (rejected as PromiseRejectedResult).reason;
  const results = settled.map((s) =>
    (s as PromiseFulfilledResult<ExtractionResult>).value
  );
  if (results.length === 1) return results[0];
  return foldResults(results, mergeItemSources(results.map((r) => r.items)));
}

// Phase 2: stateless grouped extraction. A group is one page — either its
// single compressed photo (normal) or its 4 original-resolution 2x2 tiles
// (dense). Tiles run the gate-proven recipe: parallel detail:"high", per-tile
// drink filter (release-scope decision: crop path drops drinks until F5),
// tile merge; then one cross-page merge so the scan yields ONE menu.
export async function runGroupedExtraction(
  groups: string[][],
  apiKey: string,
  extract = extractWithRetry,
  verify = verifyTileItems,
  ocrPhotos: (string | null)[] = [],
): Promise<ExtractionResult> {
  const groupResults = await Promise.all(groups.map(async (group, index) => {
    if (group.length === 1) {
      // A 1-photo group is always one page of a multi-page scan (a single
      // dense page arrives as its 4 tiles) — same page mode as phase 1.
      const result = await extract(
        group,
        apiKey,
        undefined,
        undefined,
        false,
        true,
      );
      return { calls: [result], items: result.items };
    }
    if (group.length !== 4) {
      throw new Error(`extract-pages group ${index} must have 1 or 4 photos`);
    }
    const tiles = await Promise.all(
      group.map((tile) => extract([tile], apiKey, "high", undefined, true)),
    );
    // Verify PRE-merge, per tile: each tile's raw items are checked against
    // that single tile image (v3, eval 064 — one image + a dozen names is a
    // tractable task; 4 overlapping images + 50 names was not). A phantom
    // dies at its source tile before it can fold into a merged item; a real
    // dish flake-rejected in one tile survives via its overlap-tile copy.
    // Lists over 24 candidates are split into ordered batches of at most 12 so
    // one unusually dense tile does not overload the name-verification task.
    const sources = await Promise.all(tiles.map(async (t, tileIndex) => {
      // Tile path drops drinks (F5 release scope) and condiment/topping panel
      // echoes (spec v1.2, ruling 12: cat "other" is never a real dish).
      const items = t.items.filter((i) =>
        i.category !== "drink" && i.category !== "other"
      );
      try {
        return await verifyTileItemsBatched(
          group[tileIndex],
          items,
          apiKey,
          verify,
        );
      } catch {
        logVerifyResult(items, items);
        return items;
      }
    }));
    // sectionLenient: tiles of one page see different heading context near
    // their edges — section conflicts must not block the overlap dedup.
    const merged = mergeItemSources(sources, true);
    return {
      calls: tiles,
      items: merged,
    };
  }));
  const allCalls = groupResults.flatMap((g) => g.calls);
  // Post-merge hygiene: header echoes (both shapes) need CROSS-tile section
  // knowledge — a tile can emit "Postres" while its dessert items come from
  // the neighboring tile, so the per-call postprocess can't see the match.
  const items = dropOptionEchoItems(
    remapTruncatedSectionTitles(
      dropBannerEchoOptions(
        dropHeaderEchoes(
          mergeItemSources(groupResults.map((g) => g.items)),
        ),
      ),
    ),
  );
  // Co-location stage (spec 2026-07-17, ruling 10): tile path only,
  // fail-open. Single-photo groups are untouched by construction.
  let mistralApiKey: string | undefined;
  try {
    mistralApiKey = Deno.env.get("MISTRAL_API_KEY");
  } catch {
    mistralApiKey = undefined;
  }
  const cleaned = await colocationStage(
    groups.flatMap((group, index) => {
      const photo = ocrPhotos[index];
      return group.length === 4 && typeof photo === "string" && photo.length > 0
        ? [photo]
        : [];
    }),
    items,
    mistralApiKey,
  );
  return foldResults(allCalls, cleaned);
}

export async function runCropExtractions(
  photos: string[],
  apiKey: string,
  extract = runExtraction,
): Promise<ExtractionResult[]> {
  if (photos.length !== 2 && photos.length !== 3) {
    throw new Error("extract-crops requires 2 or 3 photos");
  }
  return await Promise.all(
    photos.map((photo) => extract([photo], apiKey)),
  );
}
