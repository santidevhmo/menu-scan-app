# Extraction Iterations Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct Casa Nostra ground truth, re-score archived Iterations 001–004, run Iteration 006, and replace unsafe global number-gap filling with section-aware diagnostics.

**Architecture:** Keep the completed Iteration 005 post-processing and offline scorer. Correct only the invalid fixture, retain the `item_number` schema experiment, group number-gap diagnostics by printed section, and prohibit automatic gap-fill unless a human verifies a real printed omission and approves a separate design.

**Tech Stack:** Deno, TypeScript, OpenAI GPT-4o Vision (temperature 0, seed 17), existing extraction harness.

**Supersedes:** Tasks 6, 8, and 9 of `docs/superpowers/plans/2026-07-02-extraction-iterations-005-009.md`. Tasks 1–5 are complete. Original Tasks 7, 10, and 11 remain applicable except where this plan is more specific.

---

### Task 1: Correct Casa Nostra and re-score all archives

**Files:**
- Modify: `scripts/fixtures/casa-nostra.expected.json`
- Modify: `docs/superpowers/extraction-eval-log.md`

- [ ] **Step 1: Correct the fixture**

Change:

```json
"total_items": 33
```

to:

```json
"total_items": 23
```

Leave every other Casa Nostra expectation unchanged.

- [ ] **Step 2: Validate the fixture and harness**

Run:

```bash
rtk deno eval 'JSON.parse(Deno.readTextFileSync("scripts/fixtures/casa-nostra.expected.json")); console.log("valid")'
rtk deno run --allow-read scripts/eval-extraction.ts --self-check
```

Expected: `valid` and `Self-check passed`.

- [ ] **Step 3: Re-score every archived iteration**

Run:

```bash
rtk deno run --allow-read scripts/eval-extraction.ts --offline /Users/santiagoaguirre/Downloads/MenusTesting/iter-001
rtk deno run --allow-read scripts/eval-extraction.ts --offline /Users/santiagoaguirre/Downloads/MenusTesting/iter-002
rtk deno run --allow-read scripts/eval-extraction.ts --offline /Users/santiagoaguirre/Downloads/MenusTesting/iter-003
rtk deno run --allow-read scripts/eval-extraction.ts --offline /Users/santiagoaguirre/Downloads/MenusTesting/iter-004
```

Record every per-menu and aggregate report. These are offline re-scores, not
new model runs.

- [ ] **Step 4: Append the correction to the log**

Append `### Iteration 005 correction — Casa Nostra forensics` with:

- source dimensions `1408×1870`;
- client approximation `1024px`, JPEG quality 70;
- visible ranges 30–38, 40–41, 50–57, and 60–63;
- verdict that absent numbers are intentional gaps between printed sections,
  not missed or illegible rows;
- full re-scored tables for Iterations 001–004;
- decision that paid reruns of 001–004 are unnecessary.

Do not rewrite the existing Iteration 005 entry.

- [ ] **Step 5: Verify and commit**

Run:

```bash
rtk git diff --check
rtk git status --short
```

Commit:

```bash
rtk git add scripts/fixtures/casa-nostra.expected.json docs/superpowers/extraction-eval-log.md
rtk git commit -m "fix: correct Casa Nostra visible-item ground truth"
```

---

### Task 2: Iteration 006 prompt diet

**Files:**
- Modify: `supabase/functions/analyze-menu/extract.ts`
- Modify: `docs/superpowers/extraction-eval-log.md`

- [ ] **Step 1: Remove only the rejected folding rule**

Delete:

```text
When the same base dish is printed several times with different fillings, proteins,
or preparations, return ONE item named after the base dish and put each printed
variant in options. Never return duplicate item names for variants of one dish.
```

Keep the option definition, serving-format exclusion, distinct-products rule,
prose-choice rule, and nearest-subheading rule unchanged.

- [ ] **Step 2: Run static verification**

Run:

```bash
rtk deno check supabase/functions/analyze-menu/extract.ts supabase/functions/analyze-menu/postprocess.ts scripts/eval-extraction.ts
rtk deno test supabase/functions/analyze-menu/
rtk deno run --allow-read scripts/eval-extraction.ts --self-check
```

Expected: all pass.

- [ ] **Step 3: Commit the prompt before the paid run**

```bash
rtk git add supabase/functions/analyze-menu/extract.ts
rtk git commit -m "feat(iter-006): remove variant-folding rules from EXTRACT_PROMPT"
```

- [ ] **Step 4: Run and archive Iteration 006**

Run the paid harness with the frozen model settings and existing `.env.local`.
Never print the API key. If Nikkori times out, repeat once unchanged and record
both attempts.

Archive the completed output as:

```text
/Users/santiagoaguirre/Downloads/MenusTesting/iter-006/*.actual.json
```

- [ ] **Step 5: Log and apply the regression gate**

Append the full Iteration 006 report. Compare it with the corrected Iteration
005 baseline. If a previously aggregate-green dimension turns red, revert the
prompt commit, log the revert, and stop for user input.

- [ ] **Step 6: Commit the log**

```bash
rtk git add docs/superpowers/extraction-eval-log.md
rtk git commit -m "docs: log Iteration 006 prompt diet results"
```

---

### Task 3: Iteration 007 section-aware number diagnostics

**Files:**
- Modify: `supabase/functions/analyze-menu/extract.ts`
- Modify: `supabase/functions/analyze-menu/extract_test.ts`
- Modify: `supabase/functions/analyze-menu/postprocess.ts`
- Modify: `supabase/functions/analyze-menu/postprocess_test.ts`
- Modify: `scripts/eval-extraction.ts`
- Modify: `docs/superpowers/extraction-eval-log.md`

- [ ] **Step 1: Write failing section-gap tests**

Add the nullable `item_number` field to the test item helper, then add:

```ts
Deno.test("detects number gaps only within the same section", () => {
  const items = [
    numbered("A", "Pasta", "38"),
    numbered("B", "Pasta", "40"),
    numbered("C", "Pasta", "41"),
    numbered("D", "Pizze", "50"),
    numbered("E", "Pizze", "51"),
    numbered("F", "Pizze", "52"),
  ];
  assertEquals(detectNumberGaps(items), [{
    section_title: "Pasta",
    gaps: [39],
  }]);
});

Deno.test("does not report gaps across section boundaries", () => {
  const items = [
    numbered("A", "Pasta", "38"),
    numbered("B", "Pasta", "39"),
    numbered("C", "Pasta", "40"),
    numbered("D", "Pizze", "50"),
    numbered("E", "Pizze", "51"),
    numbered("F", "Pizze", "52"),
  ];
  assertEquals(detectNumberGaps(items), []);
});
```

The helper is:

```ts
const numbered = (
  name: string,
  section_title: string | null,
  item_number: string | null,
): ExtractedMenuItem => ({
  ...item(name),
  section_title,
  item_number,
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
rtk deno test supabase/functions/analyze-menu/postprocess_test.ts
```

Expected: type/export failures because `item_number` and
`detectNumberGaps` do not exist.

- [ ] **Step 3: Add `item_number` to extraction**

Add required nullable `item_number` to `ExtractedMenuItem`, the strict schema,
and mocked extraction responses. Add this prompt instruction:

```text
If a printed list number appears beside an item (like "39. Spaghetti"), copy that
number into item_number and leave it out of name; otherwise set item_number to null.
```

- [ ] **Step 4: Implement section-aware diagnostics**

Add:

```ts
export interface NumberGapReport {
  section_title: string;
  gaps: number[];
}

export function detectNumberGaps(
  items: ExtractedMenuItem[],
): NumberGapReport[] {
  const sections = new Map<string, ExtractedMenuItem[]>();
  for (const item of items) {
    if (!item.section_title) continue;
    const section = sections.get(item.section_title) ?? [];
    section.push(item);
    sections.set(item.section_title, section);
  }

  const reports: NumberGapReport[] = [];
  for (const [section_title, sectionItems] of sections) {
    const numbers = sectionItems
      .flatMap((item) =>
        item.item_number !== null ? [Number(item.item_number)] : []
      )
      .filter((number) => Number.isInteger(number) && number > 0);
    if (numbers.length < 3 || numbers.length < sectionItems.length / 2) {
      continue;
    }

    const present = new Set(numbers);
    const gaps: number[] = [];
    for (
      let number = Math.min(...numbers);
      number <= Math.max(...numbers);
      number++
    ) {
      if (!present.has(number)) gaps.push(number);
    }
    if (gaps.length > 0) reports.push({ section_title, gaps });
  }
  return reports;
}
```

This function reports evidence only. Production extraction makes no second
model call.

- [ ] **Step 5: Print diagnostics in live and offline harness modes**

For each report, print:

```ts
console.log(
  `  number gaps detected in ${report.section_title}: ${
    report.gaps.join(", ")
  }`,
);
```

- [ ] **Step 6: Run full static verification**

Run:

```bash
rtk deno check supabase/functions/analyze-menu/extract.ts supabase/functions/analyze-menu/postprocess.ts supabase/functions/analyze-menu/index.ts scripts/eval-extraction.ts
rtk deno test supabase/functions/analyze-menu/
rtk deno run --allow-read scripts/eval-extraction.ts --self-check
```

Expected: all pass.

- [ ] **Step 7: Commit, run, archive, and log Iteration 007**

Commit code before the paid run:

```bash
rtk git add supabase/functions/analyze-menu/ scripts/eval-extraction.ts
rtk git commit -m "feat(iter-007): section-aware item-number diagnostics"
```

Run the paid harness and archive output under `iter-007`. Append full results
and every section-gap report to the eval log. Apply the same regression gate
as Iteration 006, then commit the log.

---

### Task 4: Manual Iteration 008 gate

**Files:**
- Modify: `docs/superpowers/extraction-eval-log.md`

- [ ] **Step 1: Review every Iteration 007 gap against its source photo**

Classify each diagnostic as either:

- intentional numbering discontinuity; or
- verified printed item omitted from extraction.

- [ ] **Step 2: Apply the gate**

If every diagnostic is intentional, record `Iteration 008 not triggered`.

If any diagnostic corresponds to a real printed item, stop and create a
separate gap-fill design. Do not add an automatic follow-up model call in this
plan.

---

### Task 5: Options gate and wrap-up

Use original Tasks 10 and 11:

1. If options are aggregate-green after Iteration 006 and deterministic
   filtering, record `Iteration 009 not needed`.
2. If options remain aggregate-red, stop for a separate two-pass-options
   design.
3. Before completion, run:

```bash
rtk deno check supabase/functions/analyze-menu/extract.ts supabase/functions/analyze-menu/postprocess.ts supabase/functions/analyze-menu/index.ts scripts/eval-extraction.ts
rtk deno test supabase/functions/analyze-menu/
rtk deno run --allow-read scripts/eval-extraction.ts --self-check
rtk pnpm lint
```

Expected: all pass.
