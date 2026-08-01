# Mistral OCR 4 Extraction Evaluation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Benchmark Mistral OCR 4 (`mistral-ocr-latest`) against the frozen GPT-4o Vision Stage 1 extractor on real menu photos, and record a go/no-go decision on swapping the production extraction model. Evaluation only — no production swap and no UI change in this phase.

**Architecture:** Mistral OCR is NOT a vision-chat call like GPT-4o. It is a dedicated `POST https://api.mistral.ai/v1/ocr` endpoint that returns markdown text per page. So Mistral extraction is two steps: (1) OCR each photo → markdown, (2) feed the joined markdown to `mistral-large-latest` chat completions with the **existing `EXTRACT_SCHEMA`** to produce the same `{ items: [...] }` shape GPT-4o returns. A new `"mistral-ocr"` branch in the `extract` stage of `analyze-menu` runs this; GPT-4o's path is untouched. A standalone Deno runner script POSTs the same local photos to both providers and prints a comparison row.

**Tech Stack:** Supabase Edge Function (Deno), Mistral OCR REST API (`/v1/ocr`), Mistral chat completions REST API (`/v1/chat/completions`), existing `EXTRACT_PROMPT` + `EXTRACT_SCHEMA` in `supabase/functions/analyze-menu/index.ts`.

## Global Constraints

- Keep all model API keys server-side (`MISTRAL_API_KEY` as a Supabase secret). Never in client code.
- Reuse the existing `EXTRACT_PROMPT` and `EXTRACT_SCHEMA` verbatim — controlled comparison, not a tuned Mistral prompt.
- No client changes, no new dependencies. Mistral calls use plain `fetch` via the existing `fetchWithTimeout` helper.
- Strict TypeScript, no `any`. Match the existing style in `index.ts`.
- This is the standalone execution plan for Phase 7.5 of the whole-app plan (`docs/superpowers/plans/2026-05-25-multi-model-menu-analysis.md`). On completion, mark Phase 7.5 there as done and link this file.

**Design notes / tradeoff (read before coding):**
- This plan implements the **two-step** path (OCR → `mistral-large-latest` structuring) because every request/response shape is verified and it mirrors the original PR #3 Mistral code. OCR 4 also offers a **single-call Document AI mode** (pass `document_annotation_format` with a JSON schema on the `/v1/ocr` call; the OCR output is structured by `mistral-small-2603`). That mode is a possible simplification, but its exact request/response field names are unverified here — only try it as a follow-up after the two-step passes, and confirm the field names against the Mistral annotations docs first. Do not block on it.
- The thing being benchmarked is OCR 4's **text recognition** quality; the structuring model is incidental. Both paths use `mistral-ocr-latest` for recognition.

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/functions/analyze-menu/index.ts` | Modify | Add `MISTRAL_API_KEY`, `callMistralChat`, `callMistralOcr`, `callMistralExtract`; route `provider === "mistral-ocr"` in the `extract` stage. |
| `supabase/functions/analyze-menu/compare_ocr.ts` | Create | Standalone Deno runner: base64-encode local photos, POST to the deployed function for both providers, print a comparison row. |

---

## Task 1: Wire the Mistral OCR 4 extraction branch

**Files:**
- Modify: `supabase/functions/analyze-menu/index.ts`

**Interfaces:**
- Consumes: `EXTRACT_PROMPT`, `EXTRACT_SCHEMA`, `fetchWithTimeout`, `ExtractedItem` (all already defined / imported in `index.ts`).
- Produces: `callMistralExtract(photos: string[]): Promise<{ items: ExtractedItem[]; raw_response: string }>` — same return shape as the existing `callGptExtract`.

- [ ] **Step 1: Add the Mistral API key constant**

In `index.ts`, after `const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;`, add:

```ts
const MISTRAL_API_KEY = Deno.env.get("MISTRAL_API_KEY")!;
```

- [ ] **Step 2: Add the Mistral chat + OCR helpers**

Add these three functions immediately after `callGptExtract` (after its closing `}`). They reuse `EXTRACT_PROMPT`, `EXTRACT_SCHEMA`, and `fetchWithTimeout`:

```ts
/** Calls Mistral chat completions with OpenAI-shaped structured output; returns raw JSON text. */
async function callMistralChat(model: string, content: unknown, schema: unknown): Promise<string> {
  const res = await fetchWithTimeout("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content }],
      temperature: 0,
      response_format: {
        type: "json_schema",
        json_schema: { name: "menu_items", strict: true, schema },
      },
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message ?? json.error?.message ?? "Mistral chat error");
  return json.choices[0].message.content as string;
}

/** Runs Mistral OCR 4 on each photo and returns the page markdown joined across all photos. */
async function callMistralOcr(photos: string[]): Promise<string> {
  const markdowns: string[] = [];
  for (const b64 of photos) {
    const res = await fetchWithTimeout("https://api.mistral.ai/v1/ocr", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MISTRAL_API_KEY}`,
      },
      body: JSON.stringify({
        model: "mistral-ocr-latest",
        document: { type: "image_url", image_url: `data:image/jpeg;base64,${b64}` },
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message ?? json.error?.message ?? "Mistral OCR error");
    // pages[].markdown is the raw OCR text per page (confirmed in OCR 4 docs).
    markdowns.push((json.pages ?? []).map((p: { markdown: string }) => p.markdown).join("\n"));
  }
  return markdowns.join("\n---\n");
}

/** Stage 1 extraction via Mistral OCR 4: OCR photos -> markdown -> structure with mistral-large. */
async function callMistralExtract(photos: string[]) {
  const ocrText = await callMistralOcr(photos);
  const content = `${EXTRACT_PROMPT}\n\nMenu text (OCR):\n${ocrText}`;
  const text = await callMistralChat("mistral-large-latest", content, EXTRACT_SCHEMA);
  return { items: JSON.parse(text).items as ExtractedItem[], raw_response: text };
}
```

- [ ] **Step 3: Route the `mistral-ocr` provider in the extract stage**

In the `serve` handler's `extract` block, replace the GPT-only guard:

```ts
    if (stage === "extract") {
      if (provider !== "gpt-vision") {
        throw new Error(`Unknown extraction provider: ${provider}`);
      }
      const result = await callGptExtract(photos);

      return new Response(
        JSON.stringify({ items: result.items, raw_response: result.raw_response, latency_ms: Date.now() - start, model_id: "gpt-4o" }),
        { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }
```

with a provider switch:

```ts
    if (stage === "extract") {
      let result: { items: ExtractedItem[]; raw_response: string };
      let modelId: string;

      if (provider === "gpt-vision") {
        result = await callGptExtract(photos);
        modelId = "gpt-4o";
      } else if (provider === "mistral-ocr") {
        result = await callMistralExtract(photos);
        modelId = "mistral-ocr-latest";
      } else {
        throw new Error(`Unknown extraction provider: ${provider}`);
      }

      return new Response(
        JSON.stringify({ items: result.items, raw_response: result.raw_response, latency_ms: Date.now() - start, model_id: modelId }),
        { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }
```

- [ ] **Step 4: Type-check the function**

Run: `cd supabase/functions/analyze-menu && deno check index.ts`
Expected: no errors.

- [ ] **Step 5: Set the Mistral secret and deploy**

```bash
supabase secrets set MISTRAL_API_KEY=xxx
supabase functions deploy analyze-menu
```

Expected: deploy succeeds; `MISTRAL_API_KEY` appears in `supabase secrets list`.

- [ ] **Step 6: Smoke-test the new branch with curl**

Replace `BASE64_HERE` with one small base64 JPEG of a menu; `$EXPO_PUBLIC_SUPABASE_URL` / `$EXPO_PUBLIC_SUPABASE_ANON_KEY` are in your client `.env`:

```bash
curl -sX POST "$EXPO_PUBLIC_SUPABASE_URL/functions/v1/analyze-menu" \
  -H "Authorization: Bearer $EXPO_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"stage":"extract","provider":"mistral-ocr","photos":["BASE64_HERE"]}' | head -c 800
```

Expected: JSON with a non-empty `items` array, `model_id: "mistral-ocr-latest"`, and a numeric `latency_ms`.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/analyze-menu/index.ts
git commit -m "feat: add mistral-ocr-latest extraction branch for evaluation"
```

---

## Task 2: Build the two-provider comparison runner

**Files:**
- Create: `supabase/functions/analyze-menu/compare_ocr.ts`

**Interfaces:**
- Consumes: the deployed `analyze-menu` function (`stage: "extract"`), via env vars `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
- Produces: a printed table row per `(fixture, provider)` with item count and latency. No exports.

- [ ] **Step 1: Write the runner script**

```ts
// Run:  deno run --allow-read --allow-env --allow-net compare_ocr.ts <img1.jpg> [img2.jpg ...]
// Env:  SUPABASE_URL, SUPABASE_ANON_KEY
// Compares gpt-vision vs mistral-ocr extraction on the same local photos.
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const PROVIDERS = ["gpt-vision", "mistral-ocr"] as const;

async function run(provider: string, photos: string[]) {
  const t0 = Date.now();
  const res = await fetch(`${URL}/functions/v1/analyze-menu`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON}` },
    body: JSON.stringify({ stage: "extract", provider, photos }),
  });
  const json = await res.json();
  const wallMs = Date.now() - t0;
  return {
    provider,
    items: Array.isArray(json.items) ? json.items.length : 0,
    serverMs: json.latency_ms ?? "-",
    wallMs,
    error: json.error ?? null,
  };
}

const paths = Deno.args;
if (paths.length === 0) {
  console.error("Pass at least one image path.");
  Deno.exit(1);
}

const photos = await Promise.all(
  paths.map(async (p) => encodeBase64(await Deno.readFile(p))),
);

console.log(`Fixture: ${paths.join(", ")}  (${photos.length} photo(s))`);
console.log("provider".padEnd(14), "items".padEnd(7), "server_ms".padEnd(11), "wall_ms");
for (const provider of PROVIDERS) {
  const r = await run(provider, photos);
  console.log(
    r.provider.padEnd(14),
    String(r.items).padEnd(7),
    String(r.serverMs).padEnd(11),
    String(r.wallMs),
    r.error ? `ERROR: ${r.error}` : "",
  );
}
```

- [ ] **Step 2: Type-check the script**

Run: `cd supabase/functions/analyze-menu && deno check compare_ocr.ts`
Expected: no errors.

- [ ] **Step 3: Dry-run against one fixture**

```bash
cd supabase/functions/analyze-menu
export SUPABASE_URL="$EXPO_PUBLIC_SUPABASE_URL"
export SUPABASE_ANON_KEY="$EXPO_PUBLIC_SUPABASE_ANON_KEY"
deno run --allow-read --allow-env --allow-net compare_ocr.ts /path/to/brasero.jpg
```

Expected: two rows (gpt-vision, mistral-ocr) each with a non-zero `items` count and a `wall_ms` value.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/analyze-menu/compare_ocr.ts
git commit -m "feat: add OCR provider comparison runner script"
```

---

## Task 3: Run the benchmark on the three fixtures and fill the table

**Files:**
- Modify: this plan (fill the comparison table below).

Use the three real menus already used in prior extraction work. For each, run the script, then **eyeball the returned `items`** against the photo to score option/choice detection and name/price misreads (the runner reports counts and latency; quality scoring is manual).

- [ ] **Step 1: Brasero (churrasquería)** — heavy on option/choice groups.

```bash
deno run --allow-read --allow-env --allow-net compare_ocr.ts /path/to/brasero*.jpg
```

- [ ] **Step 2: Palominos** — varied option structures.
- [ ] **Step 3: Keburros Percherones** — general extraction quality.
- [ ] **Step 4: Fill the comparison table** below. For "Options correct" and "Name/price misreads", inspect the JSON `items` against the source photo (✓ / partial / ✗ + one-line note).

### Comparison Table

| Fixture | Provider | Items | Options correct | Name/price misreads | server_ms | wall_ms |
|---------|----------|-------|-----------------|---------------------|-----------|---------|
| Brasero | gpt-vision | — | — | — | — | — |
| Brasero | mistral-ocr | — | — | — | — | — |
| Palominos | gpt-vision | — | — | — | — | — |
| Palominos | mistral-ocr | — | — | — | — | — |
| Keburros | gpt-vision | — | — | — | — | — |
| Keburros | mistral-ocr | — | — | — | — | — |

---

## Task 4: Record the decision

**Files:**
- Modify: this plan (decision note below); `AGENTS.md` only if the model decision changes.

- [ ] **Step 1: Write the verdict.** Apply the rule: if Mistral OCR 4 **matches or beats** GPT-4o on item count + option detection across all 3 fixtures with **≤ 1.5× wall latency**, recommend opening a new **Phase 12: swap production extraction to `mistral-ocr-latest`**. Otherwise keep GPT-4o frozen.
- [ ] **Step 2: Record rationale** in the box below (one short paragraph + the deciding numbers). If keeping GPT-4o, note whether OCR 4's single-call Document AI mode is worth a later retry.
- [ ] **Step 3:** If (and only if) the decision changes the production extractor, update the `## OCR / Extraction Model Decision` section in `AGENTS.md` and the whole-app plan's status line — otherwise leave both unchanged.

> **Decision (fill in):** _____

- [ ] **Step 4: Commit the filled plan**

```bash
git add docs/superpowers/plans/2026-06-23-mistral-ocr4-evaluation.md
git commit -m "docs: record Mistral OCR 4 evaluation results and decision"
```

## Verification

1. `deno check index.ts` and `deno check compare_ocr.ts` both pass.
2. Curl smoke test (Task 1 Step 6) returns a non-empty `items` array with `model_id: "mistral-ocr-latest"`.
3. Comparison table filled for all 3 fixtures (both providers).
4. Decision recorded in Task 4 with the deciding numbers; `AGENTS.md` and the whole-app plan updated only if the production extractor changed.
