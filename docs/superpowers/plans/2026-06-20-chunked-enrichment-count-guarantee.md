# Chunked Enrichment Count Guarantee Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Stage 2 enrichment return exactly one enriched item per extracted item, so the Results list always matches the real menu count.

**Architecture:** Stage 2 currently sends all extracted items to GPT-4o in one call against a heavy per-item schema; the model returns a valid-but-incomplete subset (e.g. 47 in → 15 out) due to early-stopping and output-token pressure. The fix splits items into small batches enriched in parallel (smaller outputs stay under the ceiling and stop the model bailing early), adds `temperature: 0` + a fixed `seed` for stability, and applies a reassembly guardrail that backfills any item the model still drops — guaranteeing `N in === N out`. The change is backend-only (Deno Edge Function); the frontend already renders whatever enrichment returns.

**Tech Stack:** Deno (Supabase Edge Function), OpenAI Chat Completions structured outputs, `Deno.test` for unit tests.

## Current Development Status (2026-06-20)

Status: **implemented, deployed, live-verified, and pushed to PR #10** (`feat/chunked-enrichment-count-guarantee`).

- Implemented pure enrichment helpers in `supabase/functions/analyze-menu/enrich.ts`.
- Added Deno unit coverage in `supabase/functions/analyze-menu/enrich_test.ts`; latest suite has 5 tests, including invalid chunk-size validation.
- Wired GPT-4o enrichment into chunked deterministic batches in `supabase/functions/analyze-menu/index.ts`.
- Added retry error handling so failed batches return `[]` and are backfilled during reassembly instead of rejecting `Promise.all`.
- Constrained ingredient categories to the app contract: `"protein" | "carb" | "fat" | "veg" | "other"`.
- Deployed `analyze-menu` to Supabase project `uonuiadueykynbetxxrw`.
- Live verification passed: OCR extracted 45 items and the results list rendered 45 items.
- Task 4 cleanup was a no-op on this branch because the temporary `[STAGE1]` / `[STAGE2]` logs were not present on updated `main`.
- PR review alignment completed: `AGENTS.md` no longer requires macro dot-badges, and the broader plan now notes Phase 6 as the agreed UI direction.

Latest validation:

- `deno test --no-lock supabase/functions/analyze-menu/enrich_test.ts`
- `deno check --no-lock supabase/functions/analyze-menu/index.ts`
- `pnpm exec tsc --noEmit`

## Global Constraints

- Package manager: pnpm only — never npm. (Client side; not needed for this backend task but applies if touching client.)
- Keep all model/OCR API calls inside the Supabase Edge Function. Never expose provider API keys in client code.
- Edge Function changes require `supabase functions deploy analyze-menu` to take effect.
- Deno std import version in this function is pinned to `https://deno.land/std@0.168.0` — reuse that exact version for any std import.
- Do not touch the mandatory allergen disclaimer or any UI behavior.
- Match existing code style in `index.ts` (2-space indent, JSDoc `/** */` one-liners on functions).

---

### Task 1: Pure enrichment helpers + tests

Split the count-guarantee logic into a side-effect-free module so it can be unit-tested without network or starting the HTTP server (`index.ts` calls `serve()` at top level, so it cannot be imported in a test).

**Files:**
- Create: `supabase/functions/analyze-menu/enrich.ts`
- Test: `supabase/functions/analyze-menu/enrich_test.ts`

**Interfaces:**
- Consumes: nothing (pure module).
- Produces:
  - `interface ExtractedItem { name: string; description: string; price: number | null; category: string }`
  - `interface EnrichedItem extends ExtractedItem { ingredients: { name: string; category: string }[]; protein_g: number; carb_g: number; fat_g: number; estimated_calories: number; confidence: "high" | "medium" | "low"; allergens: string[] }`
  - `function chunk<T>(arr: T[], size: number): T[][]`
  - `function fallbackEnriched(src: ExtractedItem): EnrichedItem`
  - `function reassembleEnriched(inputs: ExtractedItem[], enriched: EnrichedItem[]): EnrichedItem[]` — returns an array of length `inputs.length`, in `inputs` order, matching each input to an enriched item by name (consuming duplicates one-per-occurrence) and substituting `fallbackEnriched` for any input the model did not return.

- [ ] **Step 1: Write the failing tests**

Create `supabase/functions/analyze-menu/enrich_test.ts`:

```ts
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  chunk,
  fallbackEnriched,
  reassembleEnriched,
  type EnrichedItem,
  type ExtractedItem,
} from "./enrich.ts";

const extracted = (name: string): ExtractedItem => ({
  name,
  description: "",
  price: null,
  category: "main",
});

const enriched = (name: string): EnrichedItem => ({
  ...extracted(name),
  ingredients: [{ name: "x", category: "protein" }],
  protein_g: 10,
  carb_g: 5,
  fat_g: 3,
  estimated_calories: 100,
  confidence: "high",
  allergens: [],
});

Deno.test("chunk splits into size-capped batches and preserves all elements", () => {
  const nums = Array.from({ length: 47 }, (_, i) => i);
  const batches = chunk(nums, 10);
  assertEquals(batches.length, 5);
  assertEquals(batches[4].length, 7);
  assertEquals(batches.flat(), nums);
});

Deno.test("reassemble returns one item per input, in input order, backfilling drops", () => {
  const inputs = [extracted("A"), extracted("B"), extracted("C")];
  // Model dropped C and returned the rest out of order.
  const model = [enriched("B"), enriched("A")];
  const out = reassembleEnriched(inputs, model);
  assertEquals(out.length, 3);
  assertEquals(out.map((i) => i.name), ["A", "B", "C"]);
  assertEquals(out[2].confidence, "low"); // C was backfilled
  assertEquals(out[0].confidence, "high"); // A came from the model
});

Deno.test("reassemble matches duplicate names one-per-occurrence", () => {
  const inputs = [extracted("Salad"), extracted("Salad")];
  const model = [enriched("Salad")]; // only one returned
  const out = reassembleEnriched(inputs, model);
  assertEquals(out.length, 2);
  assertEquals(out[0].confidence, "high");
  assertEquals(out[1].confidence, "low"); // second occurrence backfilled
});

Deno.test("fallbackEnriched preserves identity and is schema-shaped", () => {
  const fb = fallbackEnriched({
    name: "Soup",
    description: "warm",
    price: 9,
    category: "appetizer",
  });
  assertEquals(fb.name, "Soup");
  assertEquals(fb.price, 9);
  assertEquals(fb.confidence, "low");
  assertEquals(fb.protein_g, 0);
  assertEquals(fb.ingredients, []);
  assertEquals(fb.allergens, []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test supabase/functions/analyze-menu/enrich_test.ts`
Expected: FAIL — `Module not found "./enrich.ts"`.

- [ ] **Step 3: Write the implementation**

Create `supabase/functions/analyze-menu/enrich.ts`:

```ts
// Pure, side-effect-free helpers for the Stage 2 enrichment count guarantee.
// Kept separate from index.ts (which calls serve() at import time) so this is unit-testable.

export interface ExtractedItem {
  name: string;
  description: string;
  price: number | null;
  category: string;
}

export interface EnrichedItem extends ExtractedItem {
  ingredients: { name: string; category: string }[];
  protein_g: number;
  carb_g: number;
  fat_g: number;
  estimated_calories: number;
  confidence: "high" | "medium" | "low";
  allergens: string[];
}

/** Splits an array into consecutive batches of at most `size`. */
export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Builds a schema-valid enriched item from extraction data when the model drops one. */
export function fallbackEnriched(src: ExtractedItem): EnrichedItem {
  return {
    name: src.name,
    description: src.description ?? "",
    price: src.price ?? null,
    category: src.category ?? "other",
    ingredients: [],
    protein_g: 0,
    carb_g: 0,
    fat_g: 0,
    estimated_calories: 0,
    confidence: "low",
    allergens: [],
  };
}

/**
 * Returns exactly one EnrichedItem per input, in input order. Matches by name,
 * consuming one enriched entry per occurrence so duplicate names map correctly;
 * any input the model failed to return is backfilled via fallbackEnriched.
 */
export function reassembleEnriched(
  inputs: ExtractedItem[],
  enriched: EnrichedItem[],
): EnrichedItem[] {
  const pools = new Map<string, EnrichedItem[]>();
  for (const e of enriched) {
    const arr = pools.get(e.name) ?? [];
    arr.push(e);
    pools.set(e.name, arr);
  }
  return inputs.map((src) => pools.get(src.name)?.shift() ?? fallbackEnriched(src));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno test supabase/functions/analyze-menu/enrich_test.ts`
Expected: PASS — 4 tests ok.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/analyze-menu/enrich.ts supabase/functions/analyze-menu/enrich_test.ts
git commit -m "feat: add pure enrichment count-guarantee helpers with tests"
```

---

### Task 2: Wire chunked, stabilized enrichment into the Edge Function

Replace the single-call `callGptEnrich` with batched parallel calls (`temperature: 0` + fixed seed), a one-shot per-batch retry, and the reassembly guarantee. Add `finish_reason` logging to surface truncation (`length`) vs early-stop in real data.

**Files:**
- Modify: `supabase/functions/analyze-menu/index.ts`

**Interfaces:**
- Consumes (from Task 1): `chunk`, `reassembleEnriched`, `ExtractedItem`, `EnrichedItem` from `./enrich.ts`.
- Produces: `callGptEnrich(items: ExtractedItem[]): Promise<{ items: EnrichedItem[]; raw_response: string }>` — unchanged return shape; the serve handler keeps reading `result.items` and `result.raw_response`.

- [ ] **Step 1: Add the import**

At the top of `index.ts`, immediately after the existing `serve` import (line 1), add:

```ts
import {
  chunk,
  reassembleEnriched,
  type EnrichedItem,
  type ExtractedItem,
} from "./enrich.ts";
```

- [ ] **Step 2: Add tuning constants**

Directly below the existing `const MODEL_TIMEOUT_MS = 120000;` line, add:

```ts
const ENRICH_BATCH_SIZE = 10; // ponytail: small batches stop GPT-4o early-stopping; tune if drops persist
const ENRICH_SEED = 17; // fixed seed + temperature 0 for run-to-run stability
```

- [ ] **Step 3: Add temperature/seed options + finish_reason logging to `callOpenAIChat`**

Replace the entire `callOpenAIChat` function (currently lines ~125-144) with:

```ts
/** Calls OpenAI chat completions with structured output and returns raw JSON text. */
async function callOpenAIChat(
  model: string,
  content: unknown,
  schema: unknown,
  options?: { temperature?: number; seed?: number },
): Promise<string> {
  const res = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
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
      ...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
      ...(options?.seed !== undefined ? { seed: options.seed } : {}),
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? "OpenAI API error");
  console.log("[openai] finish_reason:", json.choices[0].finish_reason);
  return json.choices[0].message.content as string;
}
```

- [ ] **Step 4: Replace `callGptEnrich` with batched + reassembled enrichment**

Replace the entire `callGptEnrich` function (currently lines ~164-168) with:

```ts
/** Enriches one small batch of items with stabilized sampling. */
async function enrichBatch(items: ExtractedItem[]): Promise<EnrichedItem[]> {
  const text = await callOpenAIChat("gpt-4o", buildEnrichContent(items), ENRICH_SCHEMA_OPENAI, {
    temperature: 0,
    seed: ENRICH_SEED,
  });
  return JSON.parse(text).items as EnrichedItem[];
}

/** Enriches a batch, retrying once if the model returns fewer items than sent. */
async function enrichBatchWithRetry(batch: ExtractedItem[]): Promise<EnrichedItem[]> {
  const first = await enrichBatch(batch);
  if (first.length >= batch.length) return first;
  return await enrichBatch(batch);
}

/**
 * GPT-4o text enrichment over extracted items. Splits into small parallel batches
 * to avoid early-stopping/truncation, then reassembles to guarantee one enriched
 * item per input (dropped items are backfilled in enrich.ts).
 */
async function callGptEnrich(items: ExtractedItem[]) {
  const batches = chunk(items, ENRICH_BATCH_SIZE);
  const settled = await Promise.all(batches.map(enrichBatchWithRetry));
  const enriched = reassembleEnriched(items, settled.flat());
  return { items: enriched, raw_response: JSON.stringify({ items: enriched }) };
}
```

- [ ] **Step 5: Pass the typed array at the call site**

In the `serve` handler, find the enrichment branch (currently line ~230):

```ts
        result = await callGptEnrich(inputItems);
```

Replace with:

```ts
        result = await callGptEnrich(inputItems as ExtractedItem[]);
```

- [ ] **Step 6: Type-check the function with Deno**

Run: `deno check supabase/functions/analyze-menu/index.ts`
Expected: no errors. (If `deno` flags the `gemini`/`openai` env `!` non-null assertions or existing patterns, those are pre-existing and unrelated — only fix errors introduced by this task.)

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/analyze-menu/index.ts
git commit -m "feat: chunked, stabilized GPT-4o enrichment with count guarantee"
```

---

### Task 3: Deploy and verify the count matches end-to-end

This is the proof gate. No automated test — it requires the live model and a real scan. The temporary `[STAGE1]`/`[STAGE2]` console logs added during diagnosis are still in `src/lib/analyzeMenu.ts` and are used here to confirm the fix before removal in Task 4.

**Files:** none modified.

**Requires:** Supabase CLI authenticated for this project; the iOS Simulator running the app (`pnpm start`).

- [ ] **Step 1: Deploy the Edge Function**

Run: `supabase functions deploy analyze-menu`
Expected: deploy succeeds (function bundles `index.ts` + `enrich.ts`).

- [ ] **Step 2: Run one scan of the standard test menu in the Simulator**

Capture/select the test menu photos and tap "Analyze Menu".

- [ ] **Step 3: Read the Metro/Expo console and confirm counts match**

Expected lines (counts will match the menu, e.g. 47):

```
[STAGE1 extract] items returned: 47
[STAGE2 enrich] items received as input: 47
[STAGE2 enrich] items returned: 47
```

Success criterion: `STAGE2 returned === STAGE1 returned`. Also confirm the Results list is scrollable to the full item count. If `finish_reason` ever logged `length`, note it — truncation was live and chunking resolved it.

If the counts still differ, STOP and return to systematic-debugging Phase 1 — do not proceed to Task 4.

- [ ] **Step 4: No commit** (verification only).

---

### Task 4: Remove temporary diagnostic logging

Clean up the debug `console.log` lines added during root-cause investigation, now that the fix is verified. Leave the pre-existing `logExtractionResult` block intact.

**Files:**
- Modify: `src/lib/analyzeMenu.ts`

- [ ] **Step 1: Remove the three STAGE1 logs in `extractMenu`**

Delete each of these three lines (they appear three times, once per return path in `extractMenu`):

```ts
    console.log("[STAGE1 extract] items returned:", result.items.length);
```

and

```ts
  console.log("[STAGE1 extract] items returned:", result.items.length);
```

(There are 3 occurrences total in `extractMenu` — remove all 3. Keep every `logExtractionResult(result);` call.)

- [ ] **Step 2: Remove the STAGE2 logs in `enrichMenu`**

Delete the input log near the top of `enrichMenu`:

```ts
  console.log("[STAGE2 enrich] items received as input:", items.length);

```

and delete all three occurrences of:

```ts
    console.log("[STAGE2 enrich] items returned:", result.items.length);
```

- [ ] **Step 3: Type-check the client**

Run: `pnpm exec tsc --noEmit`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/analyzeMenu.ts
git commit -m "chore: remove temporary enrichment count diagnostics"
```

---

## Notes for the implementer

- **Why backend, not frontend:** confirmed via diagnosis — extraction returns the full count (47), the frontend renders exactly what enrichment returns; enrichment was the only stage dropping items.
- **Cost:** chunking turns one large call into ~`ceil(N/10)` smaller parallel calls. At test scale (47 items → 5 calls) this is acceptable and was validated against production enrichment patterns.
- **Out of scope (YAGNI at this scale):** stable item IDs threaded through the pipeline, the `Instructor` validation library, job queues/webhooks, and changes to the Gemini enrichment path (`callGeminiEnrich`) — GPT-4o is the selected enrichment provider.
- **Dev plan:** after this lands, add a short "Phase 6" entry to `docs/superpowers/plans/2026-05-25-multi-model-menu-analysis.md` (append-only) documenting the shipped chunked-enrichment behavior.
