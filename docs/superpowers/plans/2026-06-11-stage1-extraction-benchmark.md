# Stage 1 — Extraction Benchmark Implementation Plan

> **STATUS: COMPLETE (2026-06-13).** GPT-4o Vision selected as the sole OCR/extraction model. Other OCR providers (Google Vision, Mistral OCR) removed from the extraction stage. Product flow rebuilt as a 3-phase stepped experience (Menu OCR → Nutrition → Results). Stage 2 enrichment-model comparison continues in a separate plan.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **On approval, save this file as** `docs/superpowers/plans/2026-06-11-stage1-extraction-benchmark.md`. It is the executable expansion of Tasks 2.1–2.3 in `docs/superpowers/plans/2026-05-25-multi-model-menu-analysis.md` (Phase 2).

**Goal:** Add a pure-extraction stage to the existing `analyze-menu` pipeline that benchmarks three OCR/extraction models — Google Cloud Vision, Mistral OCR, and GPT-4o Vision — side-by-side, returning `{name, description, price, category}` only (zero nutrition), so menu *reading* fidelity can be scored against ground truth before any nutrition estimation is layered on.

**Architecture:** The single `analyze-menu` Supabase Edge Function gains a `stage` parameter. When `stage === "extract"`, it dispatches to three extraction handlers and returns `ExtractedItem[]`. The existing Phase 1 monolithic handlers stay in place as the (currently dormant) `"enrich"` path. On the client, the existing analysis store / results screen / review screen are **repurposed** to drive the extraction benchmark: the same tabbed UI now shows the three extraction candidates with their item count + raw OCR text. The Phase 1 `MenuItem`/`ModelProvider`/`analyzeMenu` code is left intact but unreferenced (retired later in Stage 2, Task 2.7).

**Tech Stack:** Expo, React Native, TypeScript, NativeWind, Zustand, Supabase Edge Functions (Deno), Google Cloud Vision REST, OpenAI REST (gpt-4o + gpt-4o-mini), Mistral OCR + chat REST.

**Current Stage 1 decision (2026-06-13):** The OCR/extraction winner is **GPT-4o Vision** (`provider: "gpt-vision"`, `model_id: "gpt-4o"`). Future development should use GPT-4o Vision as the selected menu-reading model unless a new benchmark explicitly replaces it. Current project cost assumption: **$0.03 USD per GPT-4o Vision extraction call**.

---

## Context

Phase 1 shipped a working multi-model pipeline where each model did OCR + nutrition estimation + sorting in one call. Captured outputs on the Mochomos menu showed a ~35% disagreement on item *count* between two Gemini tiers (`GEMINI_FLASH.MD` ~52 items vs `GEMINI_PRO.MD` ~70 items), while `MISTRAL_OCR.MD` is a faithful raw transcription used here as ground truth. The signal: when a model reads text and fabricates macros in the same pass, extraction fidelity drops.

This plan implements **Stage 1** of the two-stage pivot: decouple extraction from enrichment and benchmark extraction models independently. The extraction prompt contains **zero nutrition language**, so a model never reads text and invents macros in the same call. The deliverable is a runnable benchmark — three extraction tabs the operator can eyeball-score against the Mochomos menu — feeding the human DECISION GATE (Task 2.4) where one extraction winner is frozen before Stage 2.

**User-confirmed for this plan (2026-06-11):**
- Scope = all of Stage 1 (plan Tasks 2.1–2.3), stopping at the human decision gate 2.4.
- **OpenAI billing is live.** `OPENAI_API_KEY` works and has credits, so `gpt-vision` (a `gpt-4o` candidate) and the fixed `gpt-4o-mini` parse step for Google Vision are both in scope. This reverses the "disabled pending billing" state currently in the code — OpenAI is re-enabled here.

**Inconsistency reconciled:** The committed code still has all OpenAI code commented out with `TODO: re-enable when OpenAI billing is set up`, and `gpt-4o` removed from `ALL_PROVIDERS`. The Phase 2 plan header marks OpenAI billing ✅. Per the user's confirmation, this plan treats OpenAI as live and adds fresh extraction-specific OpenAI code rather than relying on the dead Phase 1 commented blocks.

---

## Prerequisites (verify before starting)

These are claimed done in the Phase 2 plan; confirm the secrets actually resolve in the deployed function:

```bash
supabase secrets list   # must show GEMINI_API_KEY, MISTRAL_API_KEY, OPENAI_API_KEY, GOOGLE_VISION_API_KEY
```

If `GOOGLE_VISION_API_KEY` or `OPENAI_API_KEY` is missing:

```bash
supabase secrets set GOOGLE_VISION_API_KEY=xxx OPENAI_API_KEY=xxx
```

Have the Mochomos menu photos available in the gallery of the simulator/device used for the E2E run (the same images that produced `GEMINI_FLASH.MD` / `GEMINI_PRO.MD` / `MISTRAL_OCR.MD` at repo root).

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/types/scan.ts` | Modify | Add `ExtractedItem`, `EnrichedItem`, `ExtractionProvider`, `EnrichmentProvider`, `PipelineStage`, `ExtractionResult`. Leave Phase 1 types intact. |
| `supabase/functions/analyze-menu/index.ts` | Modify | Re-enable OpenAI; add extraction prompt + extraction schema + `callGoogleVision` / `callMistralExtract` / `callGptExtract`; add `stage` dispatch. |
| `src/lib/analyzeMenu.ts` | Modify | Add `extractMenu(photos, provider)` wrapper sending `stage: "extract"`. Leave `analyzeMenu` untouched. |
| `src/store/analysis.store.ts` | Modify | Repurpose store to be keyed by `ExtractionProvider`, holding `ExtractionResult`. |
| `src/app/results.tsx` | Modify | Retarget `TAB_LABELS` + types to `ExtractionProvider`. Raw-debug view body unchanged. |
| `src/app/review.tsx` | Modify | `handleAnalyze` fires the 3 extraction providers via `extractMenu`. |

---

## Shared shapes (defined in Task 2.1, referenced throughout)

```ts
// Stage 1 output — what a menu literally says (no nutrition)
export interface ExtractedItem {
  name: string;
  description: string;
  price: number | null;       // null when not printed
  category: MenuCategory;     // existing union: appetizer|main|side|dessert|drink|other
}

export type ExtractionProvider = "google-vision" | "mistral-ocr" | "gpt-vision";

export interface ExtractionResult {
  provider: ExtractionProvider;
  items: ExtractedItem[];
  latency_ms: number;
  model_id: string;
  error: string | null;
  raw_response?: string;      // structured JSON for gpt-vision; benchmark providers may expose provider-specific debug output
}
```

Edge Function extraction response (same envelope as Phase 1):
```json
{ "items": [ /* ExtractedItem[] */ ], "raw_response": "…", "latency_ms": 1234, "model_id": "…" }
```

---

## Task 2.1: Add two-stage types

**Files:**
- Modify: `src/types/scan.ts`

- [ ] **Step 1: Append the new types**

Append after the existing `AnalysisResult` interface. Do **not** modify or remove `MenuItem`, `ModelProvider`, or `AnalysisResult` — they are retired later in Stage 2.

```ts
// ── Phase 2: two-stage extraction / enrichment ──────────────────────────────

// Stage 1 output — what a menu literally says (no nutrition)
export interface ExtractedItem {
  name: string;
  description: string;
  price: number | null;
  category: MenuCategory;
}

// Stage 2 output — extraction + estimated nutrition (defined now, used in Stage 2)
export interface EnrichedItem extends ExtractedItem {
  estimated_calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  dietary_tags: string[];
  allergens: string[];
}

export type ExtractionProvider = "google-vision" | "mistral-ocr" | "gpt-vision";
export type EnrichmentProvider = "gemini-2.5-flash" | "gemini-2.5-pro" | "gpt-4o" | "mistral-large";
export type PipelineStage = "extract" | "enrich";

export interface ExtractionResult {
  provider: ExtractionProvider;
  items: ExtractedItem[];
  latency_ms: number;
  model_id: string;
  error: string | null;
  raw_response?: string;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/types/scan.ts
git commit -m "feat: add two-stage extraction/enrichment types"
```

---

## Task 2.2: Edge Function — extraction stage

**Files:**
- Modify: `supabase/functions/analyze-menu/index.ts`

The existing file dispatches `gemini-2.5-flash` / `gemini-2.5-pro` / `mistral-ocr` in a monolithic switch and returns `{ items, raw_response, latency_ms, model_id }`. This task adds extraction handlers and a `stage` gate **above** that switch, and re-enables OpenAI for `gpt-vision` + the Google Vision parse step.

- [ ] **Step 1: Re-enable the OpenAI key**

At the top of the file, change the commented OpenAI key line and add the Google Vision key. The current lines are:

```ts
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
// const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!; // TODO: re-enable when OpenAI billing is set up (add payment method + $5 credits at platform.openai.com/settings/billing)
const MISTRAL_API_KEY = Deno.env.get("MISTRAL_API_KEY")!;
```

Replace those three lines with:

```ts
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const MISTRAL_API_KEY = Deno.env.get("MISTRAL_API_KEY")!;
const GOOGLE_VISION_API_KEY = Deno.env.get("GOOGLE_VISION_API_KEY")!;
```

- [ ] **Step 2: Add the extraction prompt + extraction schema**

Add these right after the existing `MENU_ITEM_SCHEMA_MISTRAL` constant (i.e. before `function buildPrompt`). The extraction schema omits every nutrition field; the prompt contains zero nutrition language.

```ts
// ── Stage 1: extraction (zero nutrition) ────────────────────────────────────

const EXTRACT_PROMPT = `Read this restaurant menu. Return every item exactly as printed, in menu order:
name, description, price, category (appetizer|main|side|dessert|drink|other).
Do NOT estimate calories or nutrition. Do NOT invent items you cannot read.
If a description is not printed, use an empty string. If a price is not printed, set it to null.`;

// JSON-schema (OpenAI/Mistral structured-output shape) — extraction only, no nutrition
const EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          price: { type: ["number", "null"] },
          category: { type: "string", enum: ["appetizer", "main", "side", "dessert", "drink", "other"] },
        },
        required: ["name", "description", "price", "category"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};
```

- [ ] **Step 3: Add a shared OpenAI chat helper**

Add after the existing `callGemini` function. This is reused by both `callGptExtract` (vision) and `callGoogleVision` (the fixed `gpt-4o-mini` parse step). `content` is the OpenAI message `content` payload — a string for text-only, or an array for vision.

```ts
async function callOpenAIChat(model: string, content: unknown, schema: unknown): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content }],
      response_format: {
        type: "json_schema",
        json_schema: { name: "menu_items", strict: true, schema },
      },
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? "OpenAI API error");
  return json.choices[0].message.content as string; // JSON string conforming to schema
}
```

- [ ] **Step 4: Add `callGptExtract` (gpt-4o vision)**

```ts
async function callGptExtract(photos: string[]) {
  const content = [
    { type: "text", text: EXTRACT_PROMPT },
    ...photos.map((b64) => ({
      type: "image_url",
      image_url: { url: `data:image/jpeg;base64,${b64}` },
    })),
  ];
  const text = await callOpenAIChat("gpt-4o", content, EXTRACT_SCHEMA);
  return { items: JSON.parse(text).items, raw_response: text };
}
```

- [ ] **Step 5: Add `callGoogleVision` (DOCUMENT_TEXT_DETECTION + fixed gpt-4o-mini parse)**

Synchronous `images:annotate` with base64 `image.content`; OCR text is at `responses[0].fullTextAnnotation.text`. The text→items parse uses the **fixed** model `gpt-4o-mini` (fairness caveat: only Vision needs this step, and the parse model is held constant so a parse failure is not misattributed to Vision's OCR).

```ts
async function callGoogleVision(photos: string[]) {
  const texts: string[] = [];
  for (const b64 of photos) {
    const res = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [
            {
              image: { content: b64 },
              features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
            },
          ],
        }),
      }
    );
    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message ?? "Google Vision error");
    const perImageError = json.responses?.[0]?.error?.message;
    if (perImageError) throw new Error(perImageError);
    texts.push(json.responses?.[0]?.fullTextAnnotation?.text ?? "");
  }

  const ocrText = texts.join("\n---\n");
  const parseContent = `${EXTRACT_PROMPT}\n\nHere is the menu text extracted via OCR:\n\n${ocrText}`;
  const structured = await callOpenAIChat("gpt-4o-mini", parseContent, EXTRACT_SCHEMA);
  return { items: JSON.parse(structured).items, raw_response: ocrText };
}
```

- [ ] **Step 6: Add `callMistralExtract` (reuse Mistral OCR + mistral-large structuring, no nutrition)**

Mirrors the existing `callMistralOCR` but swaps in `EXTRACT_PROMPT` + `EXTRACT_SCHEMA` so the structuring step never asks for nutrition.

```ts
async function callMistralExtract(photos: string[]) {
  const ocrResults: string[] = [];
  for (const b64 of photos) {
    const ocrRes = await fetch("https://api.mistral.ai/v1/ocr", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MISTRAL_API_KEY}`,
      },
      body: JSON.stringify({
        model: "mistral-ocr-latest",
        document: {
          type: "image_url",
          image_url: `data:image/jpeg;base64,${b64}`,
        },
      }),
    });
    const ocrJson = await ocrRes.json();
    if (!ocrRes.ok) throw new Error(ocrJson.message ?? "Mistral OCR error");
    const pageTexts = ocrJson.pages.map((p: { markdown: string }) => p.markdown);
    ocrResults.push(pageTexts.join("\n"));
  }

  const ocrText = ocrResults.join("\n---\n");

  const structureRes = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({
      model: "mistral-large-latest",
      messages: [
        {
          role: "user",
          content: `${EXTRACT_PROMPT}\n\nHere is the menu text extracted via OCR:\n\n${ocrText}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "menu_items", strict: true, schema: EXTRACT_SCHEMA },
      },
    }),
  });

  const structureJson = await structureRes.json();
  if (!structureRes.ok) throw new Error(structureJson.message ?? "Mistral chat error");
  const parsed = JSON.parse(structureJson.choices[0].message.content);
  return { items: parsed.items, raw_response: ocrText };
}
```

- [ ] **Step 7: Add the `stage` dispatch gate inside `serve`**

In the existing `serve` handler, the destructure currently reads `const { photos, goals, provider } = await req.json();`. Change it to also read `stage`, and add the extraction branch **before** the existing enrich switch. Replace:

```ts
    const { photos, goals, provider } = await req.json();
    const start = Date.now();

    let items;
    let modelId: string;
    let rawResponse: string | undefined;

    switch (provider) {
```

with:

```ts
    const { photos, goals, provider, stage } = await req.json();
    const start = Date.now();

    let items;
    let modelId: string;
    let rawResponse: string | undefined;

    if (stage === "extract") {
      switch (provider) {
        case "google-vision": {
          const result = await callGoogleVision(photos);
          items = result.items;
          rawResponse = result.raw_response;
          modelId = "google-vision + gpt-4o-mini";
          break;
        }
        case "mistral-ocr": {
          const result = await callMistralExtract(photos);
          items = result.items;
          rawResponse = result.raw_response;
          modelId = "mistral-ocr-latest + mistral-large-latest";
          break;
        }
        case "gpt-vision": {
          const result = await callGptExtract(photos);
          items = result.items;
          rawResponse = result.raw_response;
          modelId = "gpt-4o";
          break;
        }
        default:
          throw new Error(`Unknown extraction provider: ${provider}`);
      }

      return new Response(
        JSON.stringify({ items, raw_response: rawResponse, latency_ms: Date.now() - start, model_id: modelId }),
        { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    switch (provider) {
```

Leave the existing enrich switch (`gemini-2.5-flash` / `gemini-2.5-pro` / `mistral-ocr`) and its `return`/`catch` exactly as-is. `goals` stays in the destructure — the enrich path still uses it; the extract path ignores it.

- [ ] **Step 8: Deploy**

```bash
supabase functions deploy analyze-menu
```

Expected: deploy succeeds. (TypeScript for the Edge Function is Deno-only and excluded from the app's `tsc` via `tsconfig.json` `"exclude": ["supabase"]` — do not run `tsc` against it.)

- [ ] **Step 9: Smoke-test the deployed extract stage with curl**

Replace `ANON_KEY`, `PROJECT_REF`, and `BASE64` (a small base64 JPEG of any menu) before running:

```bash
curl -s -X POST "https://PROJECT_REF.supabase.co/functions/v1/analyze-menu" \
  -H "Authorization: Bearer ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"photos":["BASE64"],"goals":[],"provider":"google-vision","stage":"extract"}' | head -c 800
```

Expected: JSON with an `items` array of `{name, description, price, category}` objects (no nutrition fields) plus `raw_response`, `latency_ms`, `model_id`. Repeat with `"provider":"mistral-ocr"` and `"provider":"gpt-vision"` to confirm all three handlers return 200.

- [ ] **Step 10: Commit**

```bash
git add supabase/functions/analyze-menu/index.ts
git commit -m "feat: add extraction stage with Google Vision, Mistral, GPT"
```

---

## Task 2.3: Client + UI for extraction mode

This repurposes the existing analysis store / results screen / review screen to drive the extraction benchmark. The Phase 1 `analyzeMenu` function and Phase 1 store keys are dropped from the active flow (types kept; retired in Stage 2).

### 2.3a — `extractMenu` client function

**Files:** Modify `src/lib/analyzeMenu.ts`

- [ ] **Step 1: Add the `extractMenu` wrapper**

Add at the end of the file. Leave the existing `analyzeMenu`, `sortItemsByGoals`, and `GOALS_SORT_MAP` untouched (retired in Stage 2). Update the import line at the top to also import the new types.

Change the top import:

```ts
import type { ScanPhoto, ModelProvider, MenuItem, AnalysisResult } from "@/types/scan";
```

to:

```ts
import type {
  ScanPhoto,
  ModelProvider,
  MenuItem,
  AnalysisResult,
  ExtractionProvider,
  ExtractionResult,
} from "@/types/scan";
```

Append at the end of the file:

```ts
export async function extractMenu(
  photos: ScanPhoto[],
  provider: ExtractionProvider,
): Promise<ExtractionResult> {
  const base64Photos = await Promise.all(
    photos.map((p) =>
      FileSystem.readAsStringAsync(p.uri, {
        encoding: FileSystem.EncodingType.Base64,
      })
    )
  );

  const { data, error } = await supabase.functions.invoke("analyze-menu", {
    body: { photos: base64Photos, goals: [], provider, stage: "extract" },
  });

  if (error) {
    let errMsg = error.message;
    try {
      const body = await (error as { context?: { json?: () => Promise<{ error?: string }> } }).context?.json?.();
      if (body?.error) errMsg = body.error;
    } catch {}
    return { provider, items: [], latency_ms: 0, model_id: provider, error: errMsg };
  }

  return {
    provider,
    items: data.items,
    latency_ms: data.latency_ms,
    model_id: data.model_id,
    error: data.error ?? null,
    raw_response: data.raw_response,
  };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

### 2.3b — Repurpose the analysis store

**Files:** Modify `src/store/analysis.store.ts`

- [ ] **Step 3: Rewrite the store to be keyed by `ExtractionProvider`**

Replace the entire contents of `src/store/analysis.store.ts` with:

```ts
import { create } from "zustand";
import type { ExtractionResult, ExtractionProvider } from "@/types/scan";

const ALL_PROVIDERS: ExtractionProvider[] = ["google-vision", "mistral-ocr", "gpt-vision"];

function emptyRecord<T>(value: T): Record<ExtractionProvider, T> {
  return Object.fromEntries(ALL_PROVIDERS.map((p) => [p, value])) as Record<ExtractionProvider, T>;
}

interface AnalysisState {
  results: Record<ExtractionProvider, ExtractionResult | null>;
  loading: Record<ExtractionProvider, boolean>;
  activeTab: ExtractionProvider;
  setResult: (provider: ExtractionProvider, result: ExtractionResult) => void;
  setLoading: (provider: ExtractionProvider, loading: boolean) => void;
  setActiveTab: (tab: ExtractionProvider) => void;
  clear: () => void;
}

export const useAnalysisStore = create<AnalysisState>((set) => ({
  results: emptyRecord(null),
  loading: emptyRecord(false),
  activeTab: "google-vision",
  setResult: (provider, result) =>
    set((s) => ({ results: { ...s.results, [provider]: result } })),
  setLoading: (provider, loading) =>
    set((s) => ({ loading: { ...s.loading, [provider]: loading } })),
  setActiveTab: (tab) => set({ activeTab: tab }),
  clear: () => set({ results: emptyRecord(null), loading: emptyRecord(false) }),
}));

export { ALL_PROVIDERS };
```

### 2.3c — Retarget the results screen tabs

**Files:** Modify `src/app/results.tsx`

The raw-debug body (the `tryPrettyPrint` view, the latency badge, loading/error states) works unchanged because `ExtractionResult` carries the same `items` / `raw_response` / `latency_ms` / `model_id` / `error` fields. Only the provider type and tab labels change.

- [ ] **Step 4: Change the type import**

Replace:

```ts
import type { ModelProvider } from "@/types/scan";
```

with:

```ts
import type { ExtractionProvider } from "@/types/scan";
```

- [ ] **Step 5: Replace `TAB_LABELS`**

Replace:

```ts
const TAB_LABELS: Record<ModelProvider, string> = {
  "gemini-2.5-flash": "Gemini 2.5 Flash",
  "gemini-2.5-pro": "Gemini 2.5 Pro",
  "mistral-ocr": "Mistral OCR",
  "gpt-4o": "GPT-4o",
};
```

with:

```ts
const TAB_LABELS: Record<ExtractionProvider, string> = {
  "google-vision": "Google Vision",
  "mistral-ocr": "Mistral OCR",
  "gpt-vision": "GPT-4o Vision",
};
```

Leave the rest of `results.tsx` unchanged.

### 2.3d — Wire the review screen to the extraction benchmark

**Files:** Modify `src/app/review.tsx`

- [ ] **Step 6: Swap `analyzeMenu` for `extractMenu` and drop the goals arg**

Replace the import:

```ts
import { analyzeMenu } from "@/lib/analyzeMenu";
```

with:

```ts
import { extractMenu } from "@/lib/analyzeMenu";
```

Then replace the body of the `ALL_PROVIDERS.forEach(async (provider) => { ... })` loop. The current loop is:

```ts
    ALL_PROVIDERS.forEach(async (provider) => {
      setLoading(provider, true);
      try {
        const result = await analyzeMenu(photos, ["Highest in protein"], provider);
        setResult(provider, result);
      } catch (err) {
        setResult(provider, {
          provider,
          items: [],
          latency_ms: 0,
          model_id: provider,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      } finally {
        setLoading(provider, false);
      }
    });
```

Replace it with:

```ts
    ALL_PROVIDERS.forEach(async (provider) => {
      setLoading(provider, true);
      try {
        const result = await extractMenu(photos, provider);
        setResult(provider, result);
      } catch (err) {
        setResult(provider, {
          provider,
          items: [],
          latency_ms: 0,
          model_id: provider,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      } finally {
        setLoading(provider, false);
      }
    });
```

(`provider` is now typed `ExtractionProvider` via the rewritten `ALL_PROVIDERS`; the error-fallback object matches `ExtractionResult`. No other change to `review.tsx`.)

- [ ] **Step 7: Type-check and lint**

Run: `npx tsc --noEmit && npx eslint src/ --ext .ts,.tsx`
Expected: No errors. (`analyzeMenu` / `sortItemsByGoals` are now unused exports — exports are not flagged by eslint's no-unused-vars; if a project rule does flag them, leave them and note it, since they are retired in Stage 2 Task 2.7.)

- [ ] **Step 8: Commit**

```bash
git add src/lib/analyzeMenu.ts src/store/analysis.store.ts src/app/results.tsx src/app/review.tsx
git commit -m "feat: wire extraction-stage benchmark UI"
```

---

## Verification (Stage 1)

1. **TypeScript:** `npx tsc --noEmit` → zero errors.
2. **Lint:** `npx eslint src/ --ext .ts,.tsx` → zero errors.
3. **Edge Function deployed:** `supabase functions deploy analyze-menu` succeeds; the Task 2.2 Step 9 curl returns 200 with nutrition-free `items` for all three of `google-vision`, `mistral-ocr`, `gpt-vision`.
4. **Stage 1 E2E:** launch the app → pick the Mochomos menu photos from the gallery → Review → tap **Analyze Menu** → Results screen shows three tabs (**Google Vision**, **Mistral OCR**, **GPT-4o Vision**) → each tab populates as its model responds → each shows item count + latency badge and the raw OCR/JSON in the debug view.
5. **Error handling:** point one provider's secret at an invalid key (or temporarily break it) → that tab shows a clean error message while the others still succeed.

---

## Stage 1 outcome

**Resolved 2026-06-13:** The local simulator / Edge Function request failure was debugged and the Stage 1 benchmark ran successfully.

**Selected OCR/extraction model:** **GPT-4o Vision** (`provider: "gpt-vision"`, `model_id: "gpt-4o"`).

**Cost assumption:** **$0.03 USD per GPT-4o Vision extraction call**.

Future Stage 2 enrichment work should use GPT-4o Vision as the frozen menu-reading model unless the benchmark is intentionally rerun and this decision is replaced.
