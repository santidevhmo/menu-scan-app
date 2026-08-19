# Dual-Pass Stage-2 Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give unweighted menu items the enrichment treatment measured at 38/72 without changing a single byte of what weighted items send today.

**Architecture:** Two sequential passes. **Pass 1** is today's `callGptEnrich` call, unmodified, over the whole menu — its answers are used for every item that prints a weight. **Pass 2** re-sends only the items that print no weight, in their own batches, with one extra sentence appended to the shared prompt — its answers replace pass 1's for those items only. Unweighted items are enriched twice and pass 1's copy of them is discarded; their **presence** in pass 1 is what holds the weighted items' batch composition at today's exact shape.

**Tech Stack:** Deno, TypeScript, Supabase Edge Functions, OpenAI chat completions with a strict JSON schema. No new dependencies.

## Why this shape, in one table

Measured in real menus, 3 draws per run (`scripts/bench-mixed-menu.ts`, `scripts/bench-unweighted.ts`):

| approach | weighted (lower better) | unweighted (higher better) |
|---|---|---|
| production today | **16–18/96** | 25–28/72 |
| Arm P (split, chunk-then-split) | 27/96 | 37/72 |
| Arm P-10 (split, partition-then-chunk) | **21–25/96** — confirmed over 3 runs | **38/72** |
| **dual-pass (this plan)** | **16–18/96 by construction** | **38/72** |

Arm P-10 was rejected because its weighted cost is real: three runs at 21, 22, 25 against a baseline of 16, 18 — non-overlapping ranges. The dual-pass keeps P-10's pass-2 batching (which is what produced 38/72) while leaving pass 1 untouched.

⚠️ **There is no "93% weighted pipeline" to preserve.** That figure comes from `bench-macros.ts` sending the 8 fixtures alone together — a grouping production never builds. In real menus the weighted score is **16–18/96 ≈ 82%**, and that is the number this plan preserves.

## Global Constraints

- **Pass 1's HTTP request body must be byte-identical to today's.** `enrichBatch` serialises whole item objects into the prompt (`JSON.stringify(items)`), so pass 1 must receive the *same array of the same objects* — no mapping, cloning, field-stripping or re-ordering. Task 1 pins this with a test.
- **Never lower `ENRICH_BATCH_SIZE`** (currently 10). Batch 3 is measurably worse for weighted dishes (13–15/96 vs 0–4/96 at the time it was measured).
- **`MAX_CONCURRENT_BATCHES` (currently 5) is a rate-limit guard, not a tuning knob.** A rate-limited batch does not merely slow a scan — `enrichBatchWithRetry` gives up after two attempts and `fallbackEnriched` returns the item with **zeroed macros**. Passes therefore run **sequentially**, so pass 2 can never compete with pass 1 for the concurrency budget.
- **Pass 2 is best-effort.** Any failure, timeout or fallback in pass 2 must leave the item with pass 1's answer. The worst case of this change is today's behaviour.
- **Model stays pinned** to `ENRICH_MODEL` (`gpt-4o-2024-08-06`). No model change is in scope.
- **No food, dish or cuisine name may appear in the prompt's nutrition step.** `enrich_test.ts` fails the build if one does.
- **Ingredient-array-before-macros schema order is load-bearing** and must not change. This plan changes no schema.
- **Nothing in this plan authorises a deployment.** Santiago rules on that separately, after Task 5.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/functions/analyze-menu/enrich.ts` | Modify. Gains an optional `prompt` parameter threaded through the batching, the unweighted prompt constant, `isUnweighted`, `isFallbackEnriched`, and `callGptEnrichDualPass`. |
| `supabase/functions/analyze-menu/enrich_test.ts` | Modify. Pins pass-1 byte identity, the merge rule, and graceful degradation. |
| `supabase/functions/analyze-menu/index.ts` | Modify, one call site (line ~109). Calls the dual-pass entry point. |
| `scripts/bench-pipeline.ts` | Modify. `isBackfilled` delegates to `enrich.ts`'s predicate so the harness and production cannot drift apart. |
| `scripts/bench-mixed-menu.ts` | Modify. Adds a `dual` arm so the shipped path is scored by the same harness that rejected P-10. |

---

### Task 1: Thread an optional prompt through the batching, and pin pass-1 byte identity

Pass 2 needs a different prompt through the *same* batching, retry and reassembly code. Adding a parameter to shared code is exactly where pass 1 could regress by accident, so the pinning test is written first.

**Files:**
- Modify: `supabase/functions/analyze-menu/enrich.ts` (`enrichBatchWithRetry`, `callGptEnrich`)
- Test: `supabase/functions/analyze-menu/enrich_test.ts`

**Interfaces:**
- Consumes: existing `enrichBatch(items, apiKey, model, onRaw?, prompt?, schema?)`, `chunk`, `MAX_CONCURRENT_BATCHES`, `reassembleEnriched`.
- Produces:
  - `enrichBatchWithRetry(batch: ExtractedItem[], apiKey: string, model: string, prompt?: string): Promise<EnrichedItem[]>`
  - `callGptEnrich(items: ExtractedItem[], apiKey: string, model?: string, batchSize?: number, prompt?: string): Promise<{ items: EnrichedItem[]; raw_response: string }>`

- [ ] **Step 1: Write the failing test**

Add to `supabase/functions/analyze-menu/enrich_test.ts`:

```ts
Deno.test("callGptEnrich sends the SHIPPED prompt when none is given", async () => {
  const bodies: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = ((_url: string, init: RequestInit) => {
    bodies.push(String(init.body));
    return Promise.resolve(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ items: [] }) } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    // deno-lint-ignore no-explicit-any
  }) as any;
  try {
    await callGptEnrich(
      [{ name: "A", description: "", price: null, category: "food" }],
      "k",
    );
  } finally {
    globalThis.fetch = original;
  }
  assertEquals(bodies.length, 1);
  const sent = JSON.parse(bodies[0]).messages[0].content as string;
  assertStringIncludes(sent, ENRICH_PROMPT);
  // The unweighted sentence must NOT leak into the default path — that is the
  // whole isolation guarantee of the dual pass.
  assertEquals(sent.includes("print no weight"), false);
});

Deno.test("callGptEnrich forwards an explicit prompt to every batch", async () => {
  const bodies: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = ((_url: string, init: RequestInit) => {
    bodies.push(String(init.body));
    return Promise.resolve(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ items: [] }) } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    // deno-lint-ignore no-explicit-any
  }) as any;
  try {
    await callGptEnrich(
      [
        { name: "A", description: "", price: null, category: "food" },
        { name: "B", description: "", price: null, category: "food" },
      ],
      "k",
      ENRICH_MODEL,
      1, // force two batches, so "every batch" is actually exercised
      "CUSTOM PROMPT",
    );
  } finally {
    globalThis.fetch = original;
  }
  assertEquals(bodies.length, 2);
  for (const body of bodies) {
    assertStringIncludes(JSON.parse(body).messages[0].content, "CUSTOM PROMPT");
  }
});
```

Add `assertStringIncludes` to the existing `@std/assert` import in that file if it is not already imported, and add `callGptEnrich`, `ENRICH_PROMPT`, `ENRICH_MODEL` to the imports from `./enrich.ts`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `deno test --allow-all supabase/functions/analyze-menu/enrich_test.ts`

Expected: the second test FAILS — `callGptEnrich` takes no `prompt` argument, so `"CUSTOM PROMPT"` never reaches the body. (The first test may already pass; it exists to stay green forever.)

- [ ] **Step 3: Thread the parameter**

In `supabase/functions/analyze-menu/enrich.ts`, add a trailing parameter to both functions and forward it. Defaults keep every existing caller byte-identical.

```ts
async function enrichBatchWithRetry(
  batch: ExtractedItem[],
  apiKey: string,
  model: string,
  // Pass 2 varies the PROMPT and nothing else. Defaulted so pass 1 and every
  // existing caller send exactly what they sent before.
  prompt: string = ENRICH_PROMPT,
): Promise<EnrichedItem[]> {
```

Forward `prompt` to the `enrichBatch(...)` call inside it — it is the 5th argument, after `onRaw`:

```ts
  return await enrichBatch(batch, apiKey, model, undefined, prompt);
```

(Keep the existing retry/fallback structure around that call exactly as it is; only the argument list changes.)

Then in `callGptEnrich`:

```ts
export async function callGptEnrich(
  items: ExtractedItem[],
  apiKey: string,
  model: string = ENRICH_MODEL,
  batchSize: number = ENRICH_BATCH_SIZE,
  // Pass 2 of the dual pass. Defaulted, so pass 1's request is byte-identical
  // to what shipped before this parameter existed — pinned by enrich_test.ts.
  prompt: string = ENRICH_PROMPT,
): Promise<{ items: EnrichedItem[]; raw_response: string }> {
```

and forward it in the wave loop:

```ts
        batches.slice(i, i + MAX_CONCURRENT_BATCHES).map((batch) =>
          enrichBatchWithRetry(batch, apiKey, model, prompt)
        ),
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `deno test --allow-all supabase/functions/analyze-menu/enrich_test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/analyze-menu/enrich.ts supabase/functions/analyze-menu/enrich_test.ts
git commit -m "feat: thread an optional prompt through the enrichment batching

Defaulted to ENRICH_PROMPT so every existing caller is byte-identical. A test
pins that the default path never carries the unweighted sentence."
```

---

### Task 2: The unweighted prompt, and the two predicates the merge needs

**Files:**
- Modify: `supabase/functions/analyze-menu/enrich.ts`
- Modify: `scripts/bench-pipeline.ts`
- Test: `supabase/functions/analyze-menu/enrich_test.ts`

**Interfaces:**
- Produces:
  - `ENRICH_PROMPT_UNWEIGHTED: string`
  - `isUnweighted(item: ExtractedItem): boolean`
  - `isFallbackEnriched(item: EnrichedItem): boolean`

- [ ] **Step 1: Write the failing test**

```ts
Deno.test("the unweighted prompt is the shipped one plus the measured sentence", () => {
  assertStringIncludes(ENRICH_PROMPT_UNWEIGHTED, ENRICH_PROMPT);
  assertStringIncludes(ENRICH_PROMPT_UNWEIGHTED, "print no weight");
  // Never the other way round: the shipped prompt must stay clean.
  assertEquals(ENRICH_PROMPT.includes("print no weight"), false);
});

Deno.test("isUnweighted reads the code-parsed grams, not the model's answer", () => {
  const base = { name: "A", description: "", price: null, category: "food" };
  assertEquals(isUnweighted(base), true); // no grams field at all
  assertEquals(isUnweighted({ ...base, grams: null }), true);
  assertEquals(isUnweighted({ ...base, grams: 200 }), false);
  // 0 is not "no weight" - it is a parsed value, and treating it as absent
  // would route a real item into the wrong pass.
  assertEquals(isUnweighted({ ...base, grams: 0 }), false);
});

Deno.test("isFallbackEnriched spots a zeroed item and nothing else", () => {
  const live = {
    name: "A",
    ingredients: [{ name: "x" }],
    estimated_calories: 100,
    confidence: "high",
    // deno-lint-ignore no-explicit-any
  } as any;
  const dead = {
    name: "A",
    ingredients: [],
    estimated_calories: 0,
    confidence: "low",
    // deno-lint-ignore no-explicit-any
  } as any;
  assertEquals(isFallbackEnriched(live), false);
  assertEquals(isFallbackEnriched(dead), true);
  // A real item that genuinely has no calories (water) must NOT be mistaken
  // for a failure - it has ingredients and is not low-confidence.
  assertEquals(
    isFallbackEnriched({ ...live, estimated_calories: 0 }),
    false,
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `deno test --allow-all supabase/functions/analyze-menu/enrich_test.ts`

Expected: FAIL — `ENRICH_PROMPT_UNWEIGHTED`, `isUnweighted` and `isFallbackEnriched` do not exist.

- [ ] **Step 3: Implement**

In `supabase/functions/analyze-menu/enrich.ts`, after `ENRICH_PROMPT`:

```ts
/**
 * Pass 2's prompt: the shipped prompt plus one sentence, for items that print
 * no weight.
 *
 * MEASURED, not styled. Weighted items keep the shipped prompt, so B21 — which
 * took the weighted score to its current level — is untouched. This sentence
 * was 25-28/72 -> 38/72 on the unweighted oracle, and it only works when the
 * batch it is sent with contains nothing but unweighted items: phrased as a
 * per-item condition inside a mixed batch it scored 29/72 and the model applied
 * it indiscriminately. The opening clause is a statement about the WHOLE
 * request, which is exactly why pass 2 exists as a separate call.
 *
 * The shipped prompt ends "these are rescaled to the printed weight afterwards,
 * so they do not need to add up to anything" - a clause that is FALSE here,
 * because nothing rescales when there is no printed weight and the same numbers
 * also set the item's total mass.
 *
 * No food, dish or cuisine name - enrich_test.ts fails the build otherwise.
 */
export const ENRICH_PROMPT_UNWEIGHTED = ENRICH_PROMPT +
  ' The items in this request print no weight. For them, give "typical_serving_g" as the amount of that ingredient actually present in one order of this item as it is served, rather than the amount that ingredient is served in on its own: a component that forms the body of an item is present in considerably greater quantity than a standalone serving of it, and using the standalone amount understates the item.';

/**
 * Does the MENU print a weight for this item?
 *
 * Reads the grams `parseItemGrams` parsed during extraction, NOT the model's
 * `printed_total_g` — the partition has to be known before pass 2 is built, and
 * a code-parsed value cannot vary between draws the way a model answer can.
 * `grams` is absent from the ExtractedItem type but present at runtime, which is
 * why this reads through a cast rather than widening a type three call sites
 * share.
 */
export function isUnweighted(item: ExtractedItem): boolean {
  return (item as { grams?: number | null }).grams == null;
}

/**
 * Is this the zeroed placeholder `fallbackEnriched` returns when a batch failed?
 *
 * All three conditions are required. An item can legitimately have 0 calories
 * (mineral water); what marks a failure is 0 calories with NO ingredients and
 * low confidence together.
 */
export function isFallbackEnriched(item: EnrichedItem): boolean {
  return (item.ingredients ?? []).length === 0 &&
    item.estimated_calories === 0 &&
    item.confidence === "low";
}
```

Then in `scripts/bench-pipeline.ts`, make the harness delegate rather than keep a second copy (lesson 28 — a detector that drifts from the thing it detects is worse than none):

```ts
// Re-exported from the deployed module so the harness and production cannot
// disagree about what a failed item looks like.
export { isFallbackEnriched as isBackfilled } from "../supabase/functions/analyze-menu/enrich.ts";
```

and delete the local `isBackfilled` function body it replaces. Add `isFallbackEnriched` to the existing import list from `enrich.ts` only if a local reference still needs it.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
deno test --allow-all supabase/functions/analyze-menu/enrich_test.ts
deno test --allow-all scripts/bench-pipeline_test.ts
```

Expected: both PASS. The second confirms the harness's own backfill tests still hold against the production predicate.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/analyze-menu/enrich.ts supabase/functions/analyze-menu/enrich_test.ts scripts/bench-pipeline.ts
git commit -m "feat: the unweighted prompt, and one shared fallback detector

isBackfilled in the harness now delegates to enrich.ts's isFallbackEnriched, so
the detector and the thing it detects cannot drift apart."
```

---

### Task 3: `callGptEnrichDualPass` — the two passes and the merge

**Files:**
- Modify: `supabase/functions/analyze-menu/enrich.ts`
- Test: `supabase/functions/analyze-menu/enrich_test.ts`

**Interfaces:**
- Consumes: `callGptEnrich` (with the Task 1 `prompt` parameter), `isUnweighted`, `isFallbackEnriched`, `ENRICH_PROMPT_UNWEIGHTED`.
- Produces: `callGptEnrichDualPass(items: ExtractedItem[], apiKey: string, model?: string, batchSize?: number): Promise<{ items: EnrichedItem[]; raw_response: string }>` — the same return shape `callGptEnrich` has, so `index.ts` needs no other change.

- [ ] **Step 1: Write the failing test**

```ts
/** Builds a stub that answers each batch, tagging which prompt it saw. */
function stubOpenAI(seen: { prompt: string; names: string[] }[]) {
  return ((_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    const content = body.messages[0].content as string;
    const names = [...content.matchAll(/"name":"([^"]+)"/g)].map((m) => m[1]);
    const unweightedPass = content.includes("print no weight");
    seen.push({ prompt: unweightedPass ? "unweighted" : "shipped", names });
    return Promise.resolve(
      new Response(
        JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                items: names.map((name) => ({
                  name,
                  description: "",
                  price: null,
                  category: "food",
                  printed_total_g: null,
                  name_implied_components: [],
                  ingredients: [{
                    name: unweightedPass ? "pass2" : "pass1",
                    category: "other",
                    within_printed_weight: true,
                    typical_serving_g: 10,
                    protein_per_100g: 1,
                    carb_per_100g: 1,
                    fat_per_100g: 1,
                  }],
                  serving_pieces: 1,
                  allergens: [],
                  confidence: "high",
                })),
              }),
            },
          }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    // deno-lint-ignore no-explicit-any
  }) as any;
}

const WEIGHTED = {
  name: "STEAK",
  description: "",
  price: null,
  category: "food",
  grams: 400,
};
const UNWEIGHTED = {
  name: "PIZZA",
  description: "",
  price: null,
  category: "food",
  grams: null,
};

Deno.test("dual pass: pass 1 sees EVERY item with the shipped prompt", async () => {
  const seen: { prompt: string; names: string[] }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = stubOpenAI(seen);
  try {
    // deno-lint-ignore no-explicit-any
    await callGptEnrichDualPass([WEIGHTED, UNWEIGHTED] as any, "k");
  } finally {
    globalThis.fetch = original;
  }
  const pass1 = seen.filter((s) => s.prompt === "shipped");
  assertEquals(pass1.length, 1);
  // The unweighted item MUST be in pass 1 - its presence is what holds the
  // weighted item's batch composition at today's shape.
  assertEquals(pass1[0].names.sort(), ["PIZZA", "STEAK"]);
});

Deno.test("dual pass: pass 2 sees ONLY unweighted items", async () => {
  const seen: { prompt: string; names: string[] }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = stubOpenAI(seen);
  try {
    // deno-lint-ignore no-explicit-any
    await callGptEnrichDualPass([WEIGHTED, UNWEIGHTED] as any, "k");
  } finally {
    globalThis.fetch = original;
  }
  const pass2 = seen.filter((s) => s.prompt === "unweighted");
  assertEquals(pass2.length, 1);
  assertEquals(pass2[0].names, ["PIZZA"]);
});

Deno.test("dual pass: weighted keeps pass 1, unweighted takes pass 2", async () => {
  const seen: { prompt: string; names: string[] }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = stubOpenAI(seen);
  let result;
  try {
    // deno-lint-ignore no-explicit-any
    result = await callGptEnrichDualPass([WEIGHTED, UNWEIGHTED] as any, "k");
  } finally {
    globalThis.fetch = original;
  }
  const steak = result!.items.find((i) => i.name === "STEAK")!;
  const pizza = result!.items.find((i) => i.name === "PIZZA")!;
  assertEquals(steak.ingredients[0].name, "pass1");
  assertEquals(pizza.ingredients[0].name, "pass2");
  // Order is preserved - the client re-ranks against input order.
  assertEquals(result!.items.map((i) => i.name), ["STEAK", "PIZZA"]);
});

Deno.test("dual pass: a failing pass 2 degrades to pass 1, never to zeros", async () => {
  const original = globalThis.fetch;
  let call = 0;
  globalThis.fetch = ((_url: string, init: RequestInit) => {
    call++;
    const content = JSON.parse(String(init.body)).messages[0].content as string;
    if (content.includes("print no weight")) {
      return Promise.reject(new Error("pass 2 exploded"));
    }
    return stubOpenAI([])(_url, init);
    // deno-lint-ignore no-explicit-any
  }) as any;
  let result;
  try {
    // deno-lint-ignore no-explicit-any
    result = await callGptEnrichDualPass([WEIGHTED, UNWEIGHTED] as any, "k");
  } finally {
    globalThis.fetch = original;
  }
  assertEquals(call > 1, true);
  assertEquals(result!.items.length, 2);
  // Both fall back to pass 1's answer - the worst case is today's app.
  for (const item of result!.items) {
    assertEquals(item.ingredients[0].name, "pass1");
  }
});

Deno.test("dual pass: an all-weighted menu makes no second call at all", async () => {
  const seen: { prompt: string; names: string[] }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = stubOpenAI(seen);
  try {
    // deno-lint-ignore no-explicit-any
    await callGptEnrichDualPass([WEIGHTED] as any, "k");
  } finally {
    globalThis.fetch = original;
  }
  assertEquals(seen.length, 1);
  assertEquals(seen[0].prompt, "shipped");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `deno test --allow-all supabase/functions/analyze-menu/enrich_test.ts`

Expected: FAIL — `callGptEnrichDualPass` is not defined.

- [ ] **Step 3: Implement**

Append to `supabase/functions/analyze-menu/enrich.ts`:

```ts
/**
 * Stage 2 in two passes, so unweighted items get a better answer and weighted
 * items get today's.
 *
 * PASS 1 is `callGptEnrich` over the WHOLE menu with the shipped prompt — the
 * exact call that ships today, byte for byte. Its answers are kept for every
 * item that prints a weight.
 *
 * PASS 2 re-sends only the items that print no weight, in their own batches,
 * with ENRICH_PROMPT_UNWEIGHTED. Its answers replace pass 1's for those items.
 *
 * ⚠️ WHY UNWEIGHTED ITEMS ARE SENT TWICE. Not to retry them — their PRESENCE in
 * pass 1 is what keeps the weighted items' batches at today's composition.
 * Removing them measurably moves the weighted score: that is Arm P-10, which
 * scored 21-25/96 against this baseline's 16-18/96 over three runs.
 *
 * ⚠️ SEQUENTIAL ON PURPOSE. Running the passes together would put ~1.5x the
 * requests in flight against the same rate limit, and a rate-limited batch does
 * not merely arrive late — enrichBatchWithRetry gives up after two attempts and
 * the item comes back with ZEROED macros. Pass 2 waits so it can never compete
 * with pass 1 for the concurrency budget. The cost is latency; see the plan.
 *
 * ⚠️ PASS 2 IS BEST-EFFORT. Any throw, and any item it returns zeroed, falls
 * back to pass 1's answer. The worst case of this whole change is today's app.
 */
export async function callGptEnrichDualPass(
  items: ExtractedItem[],
  apiKey: string,
  model: string = ENRICH_MODEL,
  batchSize: number = ENRICH_BATCH_SIZE,
): Promise<{ items: EnrichedItem[]; raw_response: string }> {
  // PASS 1 — untouched. Nothing above this line may reshape `items`.
  const pass1 = await callGptEnrich(items, apiKey, model, batchSize);

  const unweighted = items.filter(isUnweighted);
  if (unweighted.length === 0) return pass1;

  let pass2: EnrichedItem[];
  try {
    const result = await callGptEnrich(
      unweighted,
      apiKey,
      model,
      batchSize,
      ENRICH_PROMPT_UNWEIGHTED,
    );
    pass2 = result.items;
  } catch (error) {
    console.error(`[enrich] pass 2 failed, keeping pass 1: ${error}`);
    return pass1;
  }

  // Merged BY POSITION within the unweighted subsequence, never by name:
  // callGptEnrich returns items aligned to the array it was given, and menus do
  // repeat a name across sections.
  let next = 0;
  const merged = items.map((item, index) => {
    const fromPass1 = pass1.items[index];
    if (!isUnweighted(item)) return fromPass1;
    const candidate = pass2[next++];
    // A missing or zeroed pass-2 answer is a failure, not an estimate.
    return !candidate || isFallbackEnriched(candidate) ? fromPass1 : candidate;
  });

  return { items: merged, raw_response: JSON.stringify({ items: merged }) };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
deno test --allow-all supabase/functions/analyze-menu/enrich_test.ts
```

Expected: PASS, all five new tests.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/analyze-menu/enrich.ts supabase/functions/analyze-menu/enrich_test.ts
git commit -m "feat: callGptEnrichDualPass - pass 1 unchanged, pass 2 unweighted-only

Pass 2 is sequential (rate-limit isolation) and best-effort (any failure keeps
pass 1's answer). Merged by position within the unweighted subsequence, because
menus repeat names across sections."
```

---

### Task 4: Wire it into the edge function

**Files:**
- Modify: `supabase/functions/analyze-menu/index.ts:109`
- Test: `supabase/functions/analyze-menu/enrich_test.ts` (guard, below)

**Interfaces:**
- Consumes: `callGptEnrichDualPass` from Task 3.
- Produces: no new interface — the response shape is unchanged (`{ items, raw_response, latency_ms, model_id }`).

- [ ] **Step 1: Write the failing guard test**

The risk is a half-finished wiring: the import swapped but the call site left, or vice versa. Pin it mechanically.

```ts
Deno.test("index.ts calls the DUAL PASS, not the single pass", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  assertStringIncludes(source, "callGptEnrichDualPass(");
  // The single-pass entry point must not remain as the enrichment call site.
  assertEquals(/[^a-zA-Z]callGptEnrich\(/.test(source), false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `deno test --allow-all supabase/functions/analyze-menu/enrich_test.ts`

Expected: FAIL — `index.ts` still calls `callGptEnrich(`.

- [ ] **Step 3: Change the call site**

In `supabase/functions/analyze-menu/index.ts`, change the import on line 3 from `callGptEnrich` to `callGptEnrichDualPass`, and the call at ~line 109:

```ts
      if (provider === "gpt-4o") {
        result = await callGptEnrichDualPass(
          inputItems as ExtractedItem[],
          OPENAI_API_KEY,
        );
        modelId = ENRICH_MODEL;
      } else {
```

⚠️ Do not add a `.map()`, spread or clone around `inputItems`. Pass 1 must receive the same objects it receives today — including the `grams` field, which `enrichBatch` serialises into the prompt.

- [ ] **Step 4: Run the full suite**

```bash
deno test --allow-all scripts/ supabase/
```

Expected: `2 failed` and nothing else — `scripts/tile-cut_test.ts` and `scripts/macro-measure_test.ts`'s archive-era guard are known noise, documented in `docs/superpowers/START-HERE.md`. **Any third failure is yours.**

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/analyze-menu/index.ts supabase/functions/analyze-menu/enrich_test.ts
git commit -m "feat: the edge function enriches in two passes

A source guard pins that the single-pass entry point is no longer the call site."
```

---

### Task 5: Score the shipped path on both benchmarks, and measure the latency

Tasks 1–4 argue that weighted is unchanged. This task **measures** it, through the harness that rejected Arm P-10, so the claim is evidence rather than reasoning.

**Files:**
- Modify: `scripts/bench-mixed-menu.ts` (add a `dual` arm)

**Interfaces:**
- Consumes: `callGptEnrichDualPass`, `ARMS`, `fixtureBatches`.
- Produces: a `dual` arm on the mixed-menu harness.

- [ ] **Step 1: Add the arm**

In `scripts/bench-mixed-menu.ts`, extend the arm list and dispatch:

```ts
export const ARMS = ["mixed", "P", "P10", "Pinline", "dual"] as const;
```

Import it alongside the others:

```ts
import {
  callGptEnrich,
  callGptEnrichDualPass,
  chunk,
  ENRICH_BATCH_SIZE,
  ENRICH_MODEL,
  type EnrichedItem,
} from "../supabase/functions/analyze-menu/enrich.ts";
```

and add a branch before the `mixed` fallback, using the SAME batch selection as `mixed` — the dual pass's pass 1 is today's batching, so its fixtures sit in today's batches:

```ts
      enriched = arm === "P10"
        ? await enrichP10(sent)
        : arm === "P"
        ? await enrichSplit(sent)
        : arm === "Pinline"
        ? await enrichPInline(sent)
        : arm === "dual"
        // deno-lint-ignore no-explicit-any
        ? (await callGptEnrichDualPass(sent as any, apiKey!, ENRICH_MODEL)).items
        // deno-lint-ignore no-explicit-any
        : (await callGptEnrich(sent as any, apiKey!, ENRICH_MODEL)).items;
```

`fixtureBatches` (the mixed-menu selector) is already the default for any arm that is not `P10`, so no change is needed there.

- [ ] **Step 2: Verify the harness type-checks and the arm is reachable**

```bash
deno check scripts/bench-mixed-menu.ts
deno test --allow-all scripts/bench-mixed-menu_test.ts
```

Expected: check passes, 8 tests pass.

- [ ] **Step 3: Get Santiago's cost approval, then run**

**Report to him first:** *"Weighted gate, 3 runs of 3 draws: ~$1.20. Unweighted confirmation, 1 run: ~$0.50. Total ~$1.70."* **Wait for explicit approval — every live-run cost is his call.**

```bash
# WEIGHTED GATE - must land inside 16-18/96. Three runs, because the P-10
# decision turned on a range and this claim is stronger than that one.
deno run --allow-read --allow-write --allow-env --allow-net \
  --env-file=.env.local scripts/bench-mixed-menu.ts 3 dual
deno run --allow-read --allow-write --allow-env --allow-net \
  --env-file=.env.local scripts/bench-mixed-menu.ts 3 dual --run r2
deno run --allow-read --allow-write --allow-env --allow-net \
  --env-file=.env.local scripts/bench-mixed-menu.ts 3 dual --run r3
```

- [ ] **Step 4: Judge it against the pre-registered bar**

**Written before the run, so the result cannot be reinterpreted afterwards:**

| outcome | verdict |
|---|---|
| weighted lands **inside 16–18/96** across all three runs | ✅ isolation holds as constructed — proceed |
| weighted lands **outside 16–18/96** | 🔴 **STOP.** The isolation argument is wrong somewhere. Do NOT ship. Diagnose with `superpowers:systematic-debugging` — the likely cause is pass 1 receiving reshaped items, so diff the serialized request body against a `mixed`-arm run first. |
| unweighted (below) lands **near 38/72** | ✅ the gain transferred |
| unweighted lands **near 25–28/72** | 🔴 pass 2 is not reaching the model as intended — check the prompt actually differs in the archived request |

The unweighted side needs no new arm: pass 2 sends exactly what `bench-unweighted.ts`'s `P10` arm already sends, so re-confirm with

```bash
deno run --allow-read --allow-write --allow-env --allow-net \
  --env-file=.env.local scripts/bench-unweighted.ts 3 P10
```

- [ ] **Step 5: Measure the latency cost — it is a product input, not a footnote**

The two passes are sequential, so Stage 2 gets slower. GPT-5.5 was **declined for production on a 2.4× Stage-2 latency**, so this number can itself sink the change.

```bash
deno run --allow-read --allow-write --allow-env --allow-net \
  --env-file=.env.local scripts/bench-pipeline.ts
```

Record Stage-2 wall-clock before and after on the same menu, and report it as a ratio. **Expected ~1.5–2×.** If it exceeds ~2×, say so plainly and offer the shared-concurrency variant (both passes in flight, total simultaneous requests capped at `MAX_CONCURRENT_BATCHES` so rate-limit exposure is unchanged) as a follow-up rather than shipping a slow scan.

- [ ] **Step 6: Commit the evidence**

```bash
git add scripts/bench-mixed-menu.ts scripts/fixtures/caches/mixed.dual*.raw.json \
  docs/superpowers/stage2-macro-benchmark.md docs/superpowers/extraction-iteration-ledger.md
git commit -m "bench: the dual pass scored on both benchmarks

Weighted <RANGE>/96 against a 16-18 baseline, unweighted <N>/72, Stage-2
latency <RATIO>x. Ranges, not single runs."
```

Append a full entry to `docs/superpowers/stage2-macro-benchmark.md` and an eval entry to `docs/superpowers/extraction-iteration-ledger.md`, and update the `🎯 CURRENT PHASE` block in `docs/superpowers/plans/2026-07-04-ocr-extraction-master-roadmap.md` plus the handoff in `docs/superpowers/START-HERE.md` **in the same commit** — a 35-minute gap between deploying and updating those lines is exactly how this project once spent two days believing the wrong version was live.

---

### Task 6: Deployment — Santiago's ruling, not the implementer's

- [ ] **Step 1: Present the decision**

Report, in plain language and as a table: the weighted range (must be 16–18/96), the unweighted score, the latency ratio, and the per-scan cost change (~$0.03 → ~$0.05). **State explicitly what is NOT covered:** the accompaniment/side-portion defect on weighted items remains unfixed (24% of weighted items, 12–20% of their calories).

- [ ] **Step 2: On approval, deploy and record the rollback in the same commit**

```bash
supabase functions deploy analyze-menu --project-ref uonuiadueykynbetxxrw
```

Record the new version number and this rollback command in `START-HERE.md` **in the same commit as the deploy**:

```bash
git checkout <PRE-DEPLOY-SHA> -- supabase/functions/analyze-menu/ && \
  supabase functions deploy analyze-menu --project-ref uonuiadueykynbetxxrw
```

- [ ] **Step 3: Verify against the SERVER, never against a doc**

Use `mcp__supabase__list_edge_functions` to confirm the version and `updated_at`, then smoke-test a real scan and check that a weighted dish's macros are unchanged and an unweighted dish's are higher. **These docs once claimed "v28, not deployed" for two days while v29 served every scan** — the live bundle is the only fingerprint that cannot lie.

---

## Self-Review

**Spec coverage**

| Requirement from the discussion | Task |
|---|---|
| Pass 1 byte-identical to today | Task 1 (test), Task 3 (implementation), Task 4 (no reshaping at the call site) |
| Pass 2 = unweighted only, Arm P's sentence | Task 2 (prompt), Task 3 (partition) |
| Unweighted items present in pass 1 | Task 3, pinned by the "pass 1 sees EVERY item" test |
| Throttled so pass 2 cannot starve pass 1 | Task 3 — sequential, documented at the call site |
| Graceful degradation to today's answer | Task 3 — try/catch plus the per-item `isFallbackEnriched` check |
| A test pinning pass 1 for future refactors | Task 1 Step 1 and Task 4 Step 1 |
| Weighted frozen as a regression gate | Task 5 — three runs against a pre-registered 16–18/96 bar |
| Latency is a decision input | Task 5 Step 5 |
| Cost change stated | Task 6 Step 1 |
| Deployment is Santiago's call | Task 6 |

**Placeholder scan:** no TBDs; every code step carries the actual code. The two `<RANGE>`/`<RATIO>` markers are in a commit message to be filled with measured values, which is intended.

**Type consistency:** `callGptEnrichDualPass` returns `{ items, raw_response }`, matching `callGptEnrich`, so `index.ts`'s `result.items` / `result.raw_response` need no change. `isUnweighted` and `isFallbackEnriched` keep the same names in Tasks 2, 3 and in `bench-pipeline.ts`. The `prompt` parameter is the 5th argument of `callGptEnrich` and the 4th of `enrichBatchWithRetry` consistently across Tasks 1, 2 and 3.

## What this plan deliberately does NOT do

- **No feature flag.** Rollback here is a redeploy of the previous version, which this project already does and documents; a flag would be a second mechanism for the same job.
- **No parallel passes.** Measured isolation is worth more than latency, and the shared-concurrency variant is offered as a follow-up only if Task 5 Step 5 shows the sequential cost is unacceptable.
- **No change to `ENRICH_BATCH_SIZE`, the schema, the model pin, or `resolveGrams`.**
- **No fix for the accompaniment/side-portion defect.** Still open, still the largest known weighted defect.
