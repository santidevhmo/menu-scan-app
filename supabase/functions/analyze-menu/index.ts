import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  chunk,
  enrichBatch,
  ENRICH_MODEL,
  type EnrichedItem,
  type ExtractedItem,
  reassembleEnriched,
} from "./enrich.ts";
import {
  runCropExtractions,
  runGroupedExtraction,
  runPagedExtraction,
} from "./extract.ts";
import { isValidOcrPhotos } from "./request-validation.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const MISTRAL_API_KEY = Deno.env.get("MISTRAL_API_KEY")!;
const ENRICH_BATCH_SIZE = 10; // ponytail: small batches stop GPT-4o early-stopping; tune if drops persist

/** Enriches a batch, retrying once if the model returns fewer items than sent. */
async function enrichBatchWithRetry(
  batch: ExtractedItem[],
): Promise<EnrichedItem[]> {
  try {
    const first = await enrichBatch(batch, OPENAI_API_KEY);
    if (first.length >= batch.length) return first;
  } catch (err) {
    console.error(
      "[enrich] batch failed, retrying:",
      err instanceof Error ? err.message : err,
    );
  }

  try {
    return await enrichBatch(batch, OPENAI_API_KEY);
  } catch (err) {
    console.error(
      "[enrich] batch failed twice, backfilling:",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

/**
 * GPT-4o text enrichment over extracted items. Splits into small parallel batches
 * to avoid early-stopping/truncation, then reassembles to guarantee one enriched
 * item per input (dropped items are backfilled in enrich.ts).
 */
async function callGptEnrich(
  items: ExtractedItem[],
): Promise<{ items: EnrichedItem[]; raw_response: string }> {
  const batches = chunk(items, ENRICH_BATCH_SIZE);
  const settled = await Promise.all(batches.map(enrichBatchWithRetry));
  const enriched = reassembleEnriched(items, settled.flat());
  return { items: enriched, raw_response: JSON.stringify({ items: enriched }) };
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
const MAX_PHOTOS = 10;
const MAX_BASE64_LEN = 10_000_000;

/** Returns the standard edge-function 400 response shape. */
function badRequest(message: string): Response {
  return new Response(
    JSON.stringify({
      items: [],
      latency_ms: 0,
      model_id: "error",
      error: message,
    }),
    {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    },
  );
}

/**
 * Records one row per scan so a device in the field can be debugged without
 * being tethered to a laptop. Menu text only — never the photo. Never throws:
 * a logging failure must not fail a scan.
 */
async function recordScan(row: Record<string, unknown>) {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return;
  try {
    const res = await fetch(`${url}/rest/v1/scan_log`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify(row),
    });
    if (!res.ok) console.error("[scan_log]", res.status, await res.text());
  } catch (err) {
    console.error("[scan_log] insert failed", err);
  }
}

/** Deno HTTP handler for validating requests and routing menu analysis stages. */
export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  const scanId = crypto.randomUUID().slice(0, 8);
  try {
    const {
      photos,
      pages,
      ocr_photos,
      provider,
      stage,
      items: inputItems,
      rotated,
      prior,
    } = await req.json();
    if (typeof provider !== "string") {
      return badRequest("Invalid 'provider'");
    }
    if (
      stage !== "extract" &&
      stage !== "extract-crops" &&
      stage !== "extract-pages" &&
      stage !== "enrich"
    ) {
      return badRequest("Invalid 'stage'");
    }

    // ponytail: trusted server-derived ExtractedItem[]; validate deeper if clients post raw items.
    if (stage === "enrich") {
      if (!Array.isArray(inputItems) || inputItems.length === 0) {
        return badRequest(
          "Invalid 'items': expected a non-empty array of extracted items",
        );
      }

      const start = Date.now();
      let result;
      let modelId: string;

      if (provider === "gpt-4o") {
        result = await callGptEnrich(inputItems as ExtractedItem[]);
        modelId = ENRICH_MODEL;
      } else {
        throw new Error(`Unknown enrichment provider: ${provider}`);
      }

      return new Response(
        JSON.stringify({
          items: result.items,
          raw_response: result.raw_response,
          latency_ms: Date.now() - start,
          model_id: modelId,
        }),
        { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    if (stage === "extract-pages") {
      if (provider !== "gpt-vision") {
        throw new Error(`Unknown extraction provider: ${provider}`);
      }
      if (
        !Array.isArray(pages) || pages.length === 0 ||
        pages.length > MAX_PHOTOS ||
        !pages.every((group: unknown) =>
          Array.isArray(group) &&
          (group.length === 1 || group.length === 4) &&
          group.every((p) =>
            typeof p === "string" && p.length <= MAX_BASE64_LEN
          )
        )
      ) {
        return badRequest(
          "Invalid 'pages': expected 1-10 groups of 1 or 4 base64 images",
        );
      }
      if (!isValidOcrPhotos(ocr_photos, pages.length)) {
        return badRequest("Invalid 'ocr_photos'");
      }
      const start = Date.now();
      const result = await runGroupedExtraction(
        pages,
        OPENAI_API_KEY,
        undefined,
        undefined,
        ocr_photos ?? [],
      );
      return new Response(
        JSON.stringify({
          image_quality: result.image_quality,
          image_layout: result.image_layout,
          items: result.items,
          raw_response: result.raw_response,
          latency_ms: Date.now() - start,
          model_id: "gpt-4o",
        }),
        { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    if (
      !Array.isArray(photos) ||
      photos.length === 0 ||
      photos.length > MAX_PHOTOS ||
      !photos.every((p) => typeof p === "string" && p.length <= MAX_BASE64_LEN)
    ) {
      return badRequest(
        "Invalid 'photos': expected 1-10 base64 image strings within size limit",
      );
    }

    const start = Date.now();

    if (stage === "extract-crops") {
      if (
        provider !== "gpt-vision" ||
        !Array.isArray(photos) ||
        (photos.length !== 2 && photos.length !== 3)
      ) {
        return badRequest("Invalid crop extraction request");
      }
      const regions = await runCropExtractions(photos, OPENAI_API_KEY);
      return new Response(
        JSON.stringify({
          regions: regions.map((region) => ({
            image_quality: region.image_quality,
            items: region.items,
          })),
          latency_ms: Date.now() - start,
          model_id: "gpt-4o",
        }),
        { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    if (stage === "extract") {
      if (provider !== "gpt-vision") {
        throw new Error(`Unknown extraction provider: ${provider}`);
      }
      console.log(
        `[scan ${scanId}] extract pages=${photos.length} rotated=${rotated === true}`,
      );
      // Per-page multi-photo recipe (iter-036): N photos ⇒ N parallel calls
      // merged into ONE menu; 1 photo ⇒ one call. Same path the eval gate proves.
      const result = await runPagedExtraction(
        photos,
        MISTRAL_API_KEY,
        OPENAI_API_KEY,
        undefined,
        undefined,
        { rotated: rotated === true, prior: Array.isArray(prior) ? prior : undefined },
      );
      if ("needs_rotation" in result) {
        console.log(
          `[scan ${scanId}] needs_rotation ${JSON.stringify(result.needs_rotation)} ocr_chars=${result.prior.map((p) => p.length).join(",")}`,
        );
        await recordScan({
          scan_id: scanId,
          pages: photos.length,
          rotated: rotated === true,
          outcome: "needs_rotation",
          ocr_chars: result.prior.reduce((n, p) => n + p.length, 0),
          detail: { needs_rotation: result.needs_rotation },
        });
        // The page is sideways: the client rotates it and re-submits with
        // rotated:true and `prior` returned verbatim. `rotated:true` is a hard
        // stop — we never ask twice (Santiago: at most 2 tries, never 4).
        return new Response(
          JSON.stringify({
            needs_rotation: result.needs_rotation,
            prior: result.prior,
            latency_ms: Date.now() - start,
            model_id: "mistral-ocr-4-0+gpt-4.1-2025-04-14",
          }),
          { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
        );
      }
      if ("needs_crops" in result) {
        console.log(`[scan ${scanId}] needs_crops ${JSON.stringify(result.needs_crops)}`);
        await recordScan({
          scan_id: scanId,
          pages: photos.length,
          rotated: rotated === true,
          outcome: "needs_crops",
          detail: { needs_crops: result.needs_crops },
        });
        // Dense page(s) detected: client must cut originals into 2x2 tiles
        // and re-submit everything via stage:"extract-pages".
        return new Response(
          JSON.stringify({
            needs_crops: result.needs_crops,
            latency_ms: Date.now() - start,
            model_id: "mistral-ocr-4-0+gpt-4.1-2025-04-14",
          }),
          { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
        );
      }

      console.log(
        `[scan ${scanId}] items=${result.items.length} ${JSON.stringify(result.items.map((i) => `${i.name}|${i.price ?? ""}`))}`,
      );
      await recordScan({
        scan_id: scanId,
        pages: photos.length,
        rotated: rotated === true,
        outcome: "items",
        item_count: result.items.length,
        detail: {
          dishes: result.items.map((i) => ({
            name: i.name,
            price: i.price ?? null,
            section: i.section_title ?? null,
          })),
        },
      });
      return new Response(
        JSON.stringify({
          image_quality: result.image_quality,
          image_layout: result.image_layout,
          items: result.items,
          raw_response: result.raw_response,
          latency_ms: Date.now() - start,
          model_id: "mistral-ocr-4-0+gpt-4.1-2025-04-14",
        }),
        { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    return badRequest("Invalid 'stage'");
  } catch (err) {
    // Was silent: a failed device scan left no trace anywhere.
    const message = err instanceof Error ? err.message : String(err);
    console.error("[scan] FAILED", err instanceof Error ? err.stack : err);
    await recordScan({
      scan_id: scanId,
      pages: 0,
      outcome: "error",
      detail: { message },
    });
    return new Response(
      JSON.stringify({
        items: [],
        latency_ms: 0,
        model_id: "error",
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  }
}

if (import.meta.main) serve(handleRequest);
