# Iteration 009 Two-Pass Options Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split menu extraction into an item-focused GPT-4o Vision call and an indexed options-only call, then measure whether options become aggregate-green without regressing the benchmark.

**Architecture:** Pass 1 returns image quality and option-free base items. Pass 2 sees the same photos plus an indexed compact item list and returns only option-bearing item indices. `runExtraction` validates and merges Pass 2 by index, applies existing deterministic post-processing, and preserves both raw responses in the existing string field.

**Tech Stack:** Deno, TypeScript, OpenAI GPT-4o Vision, existing Supabase Edge Function and extraction harness.

**Execution status (2026-07-03):** Tasks 1–4 executed. Implementation commit
`968982b` kept items/categories/image quality green but options stayed red and
section context regressed; it was reverted by `4d0f3b7`. The run exposed
incorrect El Marcos option ground truth. Do not repeat this plan unchanged.
Next: extend fixture matching for duplicate-name cards, encode the approved
ground truth, offline re-score archived Iteration 009, then design any new
model experiment from the corrected score.

---

### Task 1: Define failing two-pass behavior tests

**Files:**
- Modify: `supabase/functions/analyze-menu/extract_test.ts`

- [ ] **Step 1: Replace the single-call transport test**

Write one test whose mocked `fetch` returns:

1. two Pass 1 items with the same name but different descriptions/prices;
2. one Pass 2 option set for `item_index: 1`.

Assert:

- exactly two calls were made;
- both calls contain both original photos;
- the Pass 2 text contains the indexed Pass 1 items;
- item 0 has `options: []`;
- item 1 receives only the returned options;
- `raw_response` preserves both raw JSON strings.

Use duplicate names in the fixture:

```ts
const firstRaw =
  '{"image_quality":{"usable":true,"issues":[]},"items":[{"name":"Revueltos","description":"Naturales","price":78,"category":"food","section_title":"Huevos"},{"name":"Revueltos","description":"Con jamón","price":90,"category":"food","section_title":"Huevos"}]}';
const secondRaw =
  '{"option_sets":[{"item_index":1,"options":[{"name":"Jamón","price":null,"grams":null}]}]}';

assertEquals(calls, 2);
assertEquals(result.items[0].options, []);
assertEquals(result.items[1].options, [{
  name: "Jamón",
  price: null,
  grams: null,
}]);
assertEquals(JSON.parse(result.raw_response), {
  items: firstRaw,
  options: secondRaw,
});
```

- [ ] **Step 2: Add invalid-index tests**

For duplicate, fractional, negative, and out-of-range indices, mock a valid
Pass 1 and the invalid Pass 2 response. Assert `runExtraction` rejects with an
index-validation error.

```ts
const invalidSets = [
  [{ item_index: 0, options: [] }, { item_index: 0, options: [] }],
  [{ item_index: 0.5, options: [] }],
  [{ item_index: -1, options: [] }],
  [{ item_index: 1, options: [] }],
];

for (const option_sets of invalidSets) {
  await assertRejects(
    () => runExtraction(["photo-base64"], "test-key"),
    Error,
    "Invalid or duplicate item_index",
  );
}
```

- [ ] **Step 3: Add Pass 2 failure propagation**

Mock a successful Pass 1 and an HTTP 500 Pass 2 response. Assert the entire
extraction rejects with the provider error.

```ts
await assertRejects(
  () => runExtraction(["photo-base64"], "test-key"),
  Error,
  "pass 2 failed",
);
```

- [ ] **Step 4: Update schema assertions**

Assert:

- `EXTRACT_SCHEMA` Pass 1 items do not contain or require `options`;
- `OPTIONS_SCHEMA` requires `option_sets`;
- each option set requires `item_index` and `options`;
- each option requires `name`, `price`, and `grams`.

```ts
assertEquals(
  "options" in EXTRACT_SCHEMA.properties.items.items.properties,
  false,
);
assertEquals(OPTIONS_SCHEMA.required, ["option_sets"]);
assertEquals(
  OPTIONS_SCHEMA.properties.option_sets.items.required,
  ["item_index", "options"],
);
assertEquals(
  OPTIONS_SCHEMA.properties.option_sets.items.properties.options.items.required,
  ["name", "price", "grams"],
);
```

- [ ] **Step 5: Run tests and verify RED**

Run:

```bash
rtk deno test supabase/functions/analyze-menu/extract_test.ts
```

Expected: failures because extraction still makes one call and
`OPTIONS_SCHEMA` does not exist.

---

### Task 2: Implement the minimal two-pass pipeline

**Files:**
- Modify: `supabase/functions/analyze-menu/extract.ts`

- [ ] **Step 1: Make Pass 1 option-free**

Keep `EXTRACT_PROMPT` exported, but remove `options` from its requested fields
and remove all option-definition sentences. Remove `options` from Pass 1 item
schema properties and required fields.

- [ ] **Step 2: Add the strict Pass 2 schema**

Export `OPTIONS_SCHEMA`:

```ts
export const OPTIONS_SCHEMA = {
  type: "object",
  properties: {
    option_sets: {
      type: "array",
      items: {
        type: "object",
        properties: {
          item_index: { type: "integer" },
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
        required: ["item_index", "options"],
        additionalProperties: false,
      },
    },
  },
  required: ["option_sets"],
  additionalProperties: false,
};
```

- [ ] **Step 3: Add internal response types and prompt builder**

Use an option-free internal Pass 1 item type. Build Pass 2 text from the
approved option definition and:

```ts
items.map((item, item_index) => ({
  item_index,
  name: item.name,
  description: item.description,
  price: item.price,
  section_title: item.section_title,
}))
```

The prompt requires returning only genuine option-bearing items and preserving
the supplied index.

- [ ] **Step 4: Extract a typed model-call helper**

Create one helper that receives prompt, schema name, schema, photos, and API
key. Each invocation creates and clears its own 120-second AbortController.
Keep model `gpt-4o`, temperature `0`, seed `17`, strict JSON schema, existing
HTTP errors, and finish-reason logging.

- [ ] **Step 5: Validate and merge option sets**

Reject any `item_index` that is non-integer, negative, out of range, or
duplicated. Default every Pass 1 item to `options: []`, merge valid option sets
by index, then call `postprocessItems` so serving-format filtering remains
active.

- [ ] **Step 6: Preserve both raw responses**

Return:

```ts
raw_response: JSON.stringify({
  items: first.raw,
  options: second.raw,
})
```

- [ ] **Step 7: Run tests and verify GREEN**

Run:

```bash
rtk deno test supabase/functions/analyze-menu/extract_test.ts
rtk deno test supabase/functions/analyze-menu/
```

Expected: all tests pass.

---

### Task 3: Verify and commit Iteration 009

**Files:**
- Modify: `supabase/functions/analyze-menu/extract.ts`
- Modify: `supabase/functions/analyze-menu/extract_test.ts`

- [ ] **Step 1: Run static verification**

```bash
rtk deno check supabase/functions/analyze-menu/extract.ts \
  supabase/functions/analyze-menu/postprocess.ts \
  supabase/functions/analyze-menu/index.ts \
  scripts/eval-extraction.ts
rtk deno test supabase/functions/analyze-menu/
rtk deno run --allow-read scripts/eval-extraction.ts --self-check
rtk git diff --check
```

Expected: all pass.

- [ ] **Step 2: Commit before the paid run**

```bash
rtk git add supabase/functions/analyze-menu/extract.ts \
  supabase/functions/analyze-menu/extract_test.ts
rtk git commit -m "feat(iter-009): split item and option extraction passes"
```

---

### Task 4: Paid benchmark, archive, and gate

**Files:**
- Modify: `docs/superpowers/extraction-eval-log.md`

- [ ] **Step 1: Run the paid harness**

Use `.env.local` without printing the key. Run the five-menu harness with the
frozen settings. If either pass times out, repeat once unchanged and record
both attempts.

- [ ] **Step 2: Archive outputs**

Copy the five completed `*.actual.json` files to:

```text
/Users/santiagoaguirre/Downloads/MenusTesting/iter-009/
```

- [ ] **Step 3: Append the complete Iteration 009 log**

Record:

- implementation commit;
- both-pass model settings;
- exact architecture change;
- per-menu and aggregate scores;
- improvements, regressions, and decision.

- [ ] **Step 4: Apply the regression gate**

Options must become aggregate-green. If any previously green dimension becomes
aggregate-red, revert the implementation commit, log the revert, commit the
log, and stop for user input.

- [ ] **Step 5: Commit the log**

```bash
rtk git add docs/superpowers/extraction-eval-log.md
rtk git commit -m "docs: log Iteration 009 two-pass options results"
```

---

### Task 5: Final verification and branch completion

- [ ] **Step 1: Run the complete suite**

```bash
rtk deno check supabase/functions/analyze-menu/extract.ts \
  supabase/functions/analyze-menu/postprocess.ts \
  supabase/functions/analyze-menu/index.ts \
  scripts/eval-extraction.ts
rtk deno test supabase/functions/analyze-menu/
rtk deno run --allow-read scripts/eval-extraction.ts --self-check
rtk pnpm lint
```

- [ ] **Step 2: Append final benchmark status and commit**

Record active and reverted iteration commits, green/red dimensions, archives,
and the next action.

- [ ] **Step 3: Use `superpowers:finishing-a-development-branch`**

Follow the required branch-completion workflow and present integration options
to the user.
