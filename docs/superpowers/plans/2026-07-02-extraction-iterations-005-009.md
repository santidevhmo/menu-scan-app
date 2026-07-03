# Extraction Iterations 005–009 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the items and options dimensions aggregate-green by re-baselining ground truth (variants stay separate items, ±3 count tolerance), adding deterministic post-processing (number stripping, serving-format option filtering, numbered-gap detection), and running measured paid iterations (prompt diet → item_number schema → conditional gap-fill), with two-pass options as the locked last resort.

**Architecture:** All model calls stay in `supabase/functions/analyze-menu/extract.ts` (`runExtraction`). New deterministic post-processing lives in a new `supabase/functions/analyze-menu/postprocess.ts`, applied inside `runExtraction` so production and the harness share it. The harness `scripts/eval-extraction.ts` gains an `--offline <dir>` mode that re-scores archived outputs without paid calls.

**Tech Stack:** Deno, TypeScript, OpenAI GPT-4o Vision (temperature 0, seed 17), existing harness `scripts/eval-extraction.ts`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-02-extraction-iterations-005-009-design.md`. Read it before starting.
- Required context files (read before any task): repo-root `CLAUDE.md` and `AGENTS.md`; `docs/superpowers/extraction-eval-log.md` (append-only — never rewrite earlier entries); `docs/superpowers/specs/2026-07-02-extraction-prompt-iterations-design.md`; `docs/superpowers/specs/2026-07-02-menu-section-context-design.md`; `docs/superpowers/plans/2026-07-02-extraction-prompt-iterations.md`; `/Users/santiagoaguirre/.claude/plans/okay-so-this-is-mutable-wilkinson.md`; `supabase/functions/analyze-menu/extract.ts`; `scripts/eval-extraction.ts`; `scripts/fixtures/*.expected.json`.
- Worktree: `/private/tmp/menu-scan-app-extraction-eval-harness`, branch `feat/extraction-eval-harness`. All commands run from the worktree root.
- Frozen model settings: `gpt-4o`, temperature `0`, seed `17`. Never change them.
- `.env.local` in the worktree root holds `OPENAI_API_KEY`. Never print, echo, log, or commit it.
- One hypothesis per paid run. Append every iteration (including offline 005) to `docs/superpowers/extraction-eval-log.md` with hypothesis, exact change, per-menu and aggregate scores, and decision.
- Regression gate: if a previously aggregate-green dimension goes aggregate-red after a paid run, revert the change commit and STOP for user input.
- Item-count tolerance: PASS when `abs(actual - expected) <= 3` (user rule, Task 1).
- Archived raw outputs live in `/Users/santiagoaguirre/Downloads/MenusTesting/iter-001/` … `iter-004/`. Never overwrite an archive. Top-level `*.actual.json` files are scratch and are overwritten by each live harness run.
- Paid harness run command (used by Tasks 7, 8, 9):

```bash
OPENAI_API_KEY=$(sed -n 's/^OPENAI_API_KEY=//p' .env.local) \
deno run --allow-read --allow-write=/Users/santiagoaguirre/Downloads/MenusTesting \
  --allow-env=OPENAI_API_KEY --allow-net=api.openai.com \
  scripts/eval-extraction.ts
```

- Static verification suite (used by several tasks):

```bash
deno check supabase/functions/analyze-menu/extract.ts supabase/functions/analyze-menu/postprocess.ts scripts/eval-extraction.ts
deno test supabase/functions/analyze-menu/
deno run --allow-read scripts/eval-extraction.ts --self-check
```

---

### Task 1: Harness item-count tolerance ±3

**Files:**
- Modify: `scripts/eval-extraction.ts:73` (items pass condition) and `runSelfCheck()` (~line 301)

**Interfaces:**
- Consumes: existing `scoreMenu(fixture, actual)`.
- Produces: `scoreMenu` items dimension passes when `Math.abs(itemDelta) <= 3 && phantomHeaders === 0`. All later scoring (offline and paid) relies on this.

- [ ] **Step 1: Change the tolerance**

In `scripts/eval-extraction.ts`, change:

```ts
    pass: Math.abs(itemDelta) <= 1 && phantomHeaders === 0,
```

to:

```ts
    pass: Math.abs(itemDelta) <= 3 && phantomHeaders === 0,
```

- [ ] **Step 2: Add tolerance asserts to the self-check**

In `runSelfCheck()`, after the existing `failing` asserts and before the `aggregateReports` asserts, add:

```ts
  const filler = (name: string): ExtractedMenuItem => ({
    name,
    description: "",
    price: 5,
    category: "food",
    section_title: "Mains",
    options: [],
  });
  assert(
    scoreMenu(fixture, {
      ...actual,
      items: [...actual.items, filler("Soup"), filler("Cake"), filler("Pie")],
    }).items.pass,
    "item count within +3 should pass",
  );
  assert(
    !scoreMenu(fixture, {
      ...actual,
      items: [
        ...actual.items,
        filler("Soup"),
        filler("Cake"),
        filler("Pie"),
        filler("Stew"),
      ],
    }).items.pass,
    "item count at +4 should fail",
  );
```

Note: these filler items use section "Mains" and options `[]`, matching the stub fixture's expectations, so only the count dimension is exercised. The existing `failing` case (delta +3 plus one phantom header) still fails items via `phantomHeaders`, so its assert message stays true.

- [ ] **Step 3: Run the self-check**

Run: `deno run --allow-read scripts/eval-extraction.ts --self-check`
Expected: `Self-check passed`

- [ ] **Step 4: Commit**

```bash
git add scripts/eval-extraction.ts
git commit -m "feat: item-count tolerance ±3 in extraction harness"
```

---

### Task 2: El Marcos fixture rework (USER CONFIRMATION GATE)

**Files:**
- Modify: `scripts/fixtures/el-marcos.expected.json`
- Read: `/Users/santiagoaguirre/Downloads/MenusTesting/ElMarcosMenu.png`, `/Users/santiagoaguirre/Downloads/MenusTesting/iter-001/el-marcos.actual.json`, `/Users/santiagoaguirre/Downloads/MenusTesting/iter-004/el-marcos.actual.json`

**Interfaces:**
- Consumes: current fixture (`total_items: 36`, five folding-based `items_with_options` targets: Fritos, De la Sierra, Waffles, Plato Surtido, Revueltos — each with `"options": []`, meaning "must carry ≥1 option").
- Produces: fixture with the confirmed unfolded `total_items` and `"items_with_options": []`. Under the harness's scoring, an empty target list means every options-bearing El Marcos item counts as a false positive — which is now correct: per the user, El Marcos variants are separate items and none of its dishes has a true within-dish choice.

- [ ] **Step 1: Recount ground truth unfolded**

1. Read the menu photo `/Users/santiagoaguirre/Downloads/MenusTesting/ElMarcosMenu.png` with the Read tool and count every printed item, treating each printed variant line (e.g. each egg preparation, each taco filling printed as its own line) as a separate item.
2. Cross-check against archived model output counts:

```bash
deno eval 'for (const d of ["iter-001","iter-004"]) console.log(d, JSON.parse(Deno.readTextFileSync(`/Users/santiagoaguirre/Downloads/MenusTesting/${d}/el-marcos.actual.json`)).items.length)'
```

Expected: `iter-001 45` and `iter-004 46` (the model's consistent unfolded counts). Reconcile your manual count against these; identify any item the model invented or missed.

- [ ] **Step 2: STOP — user confirms the count**

Present to the user: your manual count, the archived counts, and the reconciliation. Do not edit the fixture until the user confirms the number. This gate is required by the spec ("user confirms the number before the fixture is frozen").

- [ ] **Step 3: Update the fixture**

In `scripts/fixtures/el-marcos.expected.json`: set `"total_items"` to the confirmed count; replace the five-entry `"items_with_options"` array with `[]`. Leave `sections`, `section_expectations`, `categories`, and `image_quality` unchanged.

- [ ] **Step 4: Validate JSON and self-check**

Run: `deno eval 'JSON.parse(Deno.readTextFileSync("scripts/fixtures/el-marcos.expected.json")); console.log("valid")'`
Expected: `valid`
Run: `deno run --allow-read scripts/eval-extraction.ts --self-check`
Expected: `Self-check passed`

- [ ] **Step 5: Commit**

```bash
git add scripts/fixtures/el-marcos.expected.json
git commit -m "fix: el-marcos fixture uses unfolded separate-variant ground truth"
```

---

### Task 3: Number-stripper post-processing module

**Files:**
- Create: `supabase/functions/analyze-menu/postprocess.ts`
- Create: `supabase/functions/analyze-menu/postprocess_test.ts`
- Modify: `supabase/functions/analyze-menu/extract.ts:168-169` (apply post-processing to parsed items)

**Interfaces:**
- Consumes: `ExtractedMenuItem` from `./extract.ts`.
- Produces: `stripMenuNumbers(items: ExtractedMenuItem[]): ExtractedMenuItem[]` and `postprocessItems(items: ExtractedMenuItem[]): ExtractedMenuItem[]` (the single entry point later tasks extend). `runExtraction` returns post-processed items. Task 5's offline mode imports `postprocessItems`.

- [ ] **Step 1: Write the failing tests**

Create `supabase/functions/analyze-menu/postprocess_test.ts`:

```ts
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { stripMenuNumbers } from "./postprocess.ts";
import type { ExtractedMenuItem } from "./extract.ts";

const item = (name: string): ExtractedMenuItem => ({
  name,
  description: "",
  price: 10,
  category: "food",
  section_title: null,
  options: [],
});

Deno.test("strips leading numbers when a menu-wide pattern exists", () => {
  const items = [
    item("39. Spaghetti Carbonara"),
    item("40. Lasagna"),
    item("41) Ravioli"),
    item("Tiramisu"),
  ];
  assertEquals(
    stripMenuNumbers(items).map((i) => i.name),
    ["Spaghetti Carbonara", "Lasagna", "Ravioli", "Tiramisu"],
  );
});

Deno.test("leaves names alone when numbers are not a menu-wide pattern", () => {
  const items = [
    item("360 Burger"),
    item("Pasta 3 Quesos"),
    item("Caesar Salad"),
    item("Margherita"),
  ];
  assertEquals(
    stripMenuNumbers(items).map((i) => i.name),
    ["360 Burger", "Pasta 3 Quesos", "Caesar Salad", "Margherita"],
  );
});

Deno.test("requires at least three numbered names before stripping", () => {
  const items = [item("1. Soup"), item("2. Bread")];
  assertEquals(
    stripMenuNumbers(items).map((i) => i.name),
    ["1. Soup", "2. Bread"],
  );
});
```

Note: "360 Burger" has no separator-plus-space after digits followed by more text starting the name — the pattern below requires `. ` / `) ` / whitespace right after the number, and "360 Burger" matches `^\d+\s+`… so the menu-wide threshold is what protects it: only 1 of 4 names matches, below 50%. Both guards matter.

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test supabase/functions/analyze-menu/postprocess_test.ts`
Expected: FAIL — `Module not found ... postprocess.ts`

- [ ] **Step 3: Implement the stripper**

Create `supabase/functions/analyze-menu/postprocess.ts`:

```ts
import type { ExtractedMenuItem } from "./extract.ts";

const LEADING_NUMBER = /^\d{1,3}[.)]?\s+/;

// ponytail: ratio+minimum heuristic; revisit only if a real menu defeats it.
export function stripMenuNumbers(
  items: ExtractedMenuItem[],
): ExtractedMenuItem[] {
  const numbered = items.filter((item) => LEADING_NUMBER.test(item.name));
  if (numbered.length < 3 || numbered.length < items.length / 2) return items;
  return items.map((item) => ({
    ...item,
    name: item.name.replace(LEADING_NUMBER, ""),
  }));
}

export function postprocessItems(
  items: ExtractedMenuItem[],
): ExtractedMenuItem[] {
  return stripMenuNumbers(items);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno test supabase/functions/analyze-menu/postprocess_test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Wire into runExtraction**

In `supabase/functions/analyze-menu/extract.ts`, add to the imports at the top:

```ts
import { postprocessItems } from "./postprocess.ts";
```

and change:

```ts
    const parsed = JSON.parse(text) as Omit<ExtractionResult, "raw_response">;
    return { ...parsed, raw_response: text };
```

to:

```ts
    const parsed = JSON.parse(text) as Omit<ExtractionResult, "raw_response">;
    return {
      ...parsed,
      items: postprocessItems(parsed.items),
      raw_response: text,
    };
```

- [ ] **Step 6: Static verification**

Run the static verification suite from Global Constraints.
Expected: all checks pass, all existing tests still pass.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/analyze-menu/postprocess.ts supabase/functions/analyze-menu/postprocess_test.ts supabase/functions/analyze-menu/extract.ts
git commit -m "feat: deterministic leading-number stripper for menu item names"
```

---

### Task 4: Serving-format option filter

**Files:**
- Modify: `supabase/functions/analyze-menu/postprocess.ts`
- Modify: `supabase/functions/analyze-menu/postprocess_test.ts`

**Interfaces:**
- Consumes: `postprocessItems` from Task 3.
- Produces: `filterServingFormatOptions(items: ExtractedMenuItem[]): ExtractedMenuItem[]`; `postprocessItems` becomes `filterServingFormatOptions(stripMenuNumbers(items))`.

- [ ] **Step 1: Derive the term list from real failures**

Extract every option name the model produced on non-target Nikkori items in Iteration 004 (these are the observed false positives):

```bash
deno eval 'const a=JSON.parse(Deno.readTextFileSync("/Users/santiagoaguirre/Downloads/MenusTesting/iter-004/nikkori.actual.json")); for (const i of a.items) if (i.options.length) console.log(i.name, "=>", i.options.map((o)=>o.name).join(" | "))'
```

Record the output. The filter's term list below must cover the serving-format terms you see (expected from the eval log: copa/botella wine formats, serving sizes). Extend `SERVING_FORMAT` with any additional format words the output shows — formats only, never food words.

- [ ] **Step 2: Write the failing tests**

Append to `supabase/functions/analyze-menu/postprocess_test.ts` (extend the import line to include the new function):

```ts
import {
  filterServingFormatOptions,
  stripMenuNumbers,
} from "./postprocess.ts";
```

```ts
const withOptions = (
  name: string,
  options: string[],
): ExtractedMenuItem => ({
  ...item(name),
  options: options.map((o) => ({ name: o, price: null, grams: null })),
});

Deno.test("removes serving-format options, keeps composition options", () => {
  const items = [
    withOptions("Vino Tinto", ["Copa", "Botella"]),
    withOptions("Limonada", ["Vaso", "Jarra"]),
    withOptions("Pasta Alfredo", ["Camarón", "Pollo"]),
    withOptions("Colada", ["Piña", "Fresa"]),
  ];
  const result = filterServingFormatOptions(items);
  assertEquals(result[0].options, []);
  assertEquals(result[1].options, []);
  assertEquals(result[2].options.map((o) => o.name), ["Camarón", "Pollo"]);
  assertEquals(result[3].options.map((o) => o.name), ["Piña", "Fresa"]);
});

Deno.test("removes size-word options", () => {
  const items = [withOptions("Ramen", ["Chico", "Grande"])];
  assertEquals(filterServingFormatOptions(items)[0].options, []);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `deno test supabase/functions/analyze-menu/postprocess_test.ts`
Expected: FAIL — `filterServingFormatOptions` not exported

- [ ] **Step 4: Implement the filter**

Add to `supabase/functions/analyze-menu/postprocess.ts`:

```ts
// ponytail: denylist matches every observed false positive (iter-001..004);
// extend from data, or replace with a second model pass if menus defeat it.
const SERVING_FORMAT = new Set([
  "copa",
  "botella",
  "vaso",
  "jarra",
  "glass",
  "bottle",
  "chico",
  "chica",
  "mediano",
  "mediana",
  "grande",
  "small",
  "medium",
  "large",
  "media",
  "1/2",
  "litro",
  "liter",
]);

function isServingFormat(name: string): boolean {
  const normalized = name.toLocaleLowerCase().trim();
  return SERVING_FORMAT.has(normalized) ||
    normalized.split(/\s+/).every((word) => SERVING_FORMAT.has(word));
}

export function filterServingFormatOptions(
  items: ExtractedMenuItem[],
): ExtractedMenuItem[] {
  return items.map((item) => ({
    ...item,
    options: item.options.filter((option) => !isServingFormat(option.name)),
  }));
}
```

and change `postprocessItems` to:

```ts
export function postprocessItems(
  items: ExtractedMenuItem[],
): ExtractedMenuItem[] {
  return filterServingFormatOptions(stripMenuNumbers(items));
}
```

Include in `SERVING_FORMAT` any additional format terms recorded in Step 1.

- [ ] **Step 5: Run tests to verify they pass**

Run: `deno test supabase/functions/analyze-menu/postprocess_test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Static verification, then commit**

Run the static verification suite from Global Constraints. Expected: all pass.

```bash
git add supabase/functions/analyze-menu/postprocess.ts supabase/functions/analyze-menu/postprocess_test.ts
git commit -m "feat: deterministic serving-format option filter"
```

---

### Task 5: Offline scoring mode + Iteration 005 re-score

**Files:**
- Modify: `scripts/eval-extraction.ts` (add `--offline <dir>` mode)
- Modify: `docs/superpowers/extraction-eval-log.md` (append Iteration 005)

**Interfaces:**
- Consumes: `postprocessItems` from `../supabase/functions/analyze-menu/postprocess.ts`; Tasks 1–4 complete.
- Produces: `deno run --allow-read scripts/eval-extraction.ts --offline <dir>` re-scores archived outputs with post-processing applied, no API key or network. The Iteration 005 log entry is the new baseline for Iterations 006+.

- [ ] **Step 1: Add the offline mode**

In `scripts/eval-extraction.ts`, add to the imports:

```ts
import { postprocessItems } from "../supabase/functions/analyze-menu/postprocess.ts";
```

Add this function next to `main()`:

```ts
async function offline(dir: string): Promise<void> {
  const fixtures = await loadFixtures();
  const reports: MenuReport[] = [];
  for (const fixture of fixtures) {
    const raw = JSON.parse(
      await Deno.readTextFile(`${dir}/${fixture.menu}.actual.json`),
    ) as ActualExtraction;
    reports.push(scoreMenu(fixture, {
      image_quality: raw.image_quality,
      items: postprocessItems(raw.items),
    }));
  }
  printReport(reports, aggregateReports(reports));
}
```

Change the entry point at the bottom to:

```ts
if (import.meta.main) {
  const offlineIndex = Deno.args.indexOf("--offline");
  if (Deno.args.includes("--self-check")) runSelfCheck();
  else if (offlineIndex !== -1) await offline(Deno.args[offlineIndex + 1]);
  else await main();
}
```

Note: `main()` already applies post-processing implicitly because `runExtraction` now calls `postprocessItems` (Task 3). The offline mode applies it explicitly because archived files hold pre-postprocessing output.

- [ ] **Step 2: Static verification**

Run the static verification suite from Global Constraints. Expected: all pass.

- [ ] **Step 3: Re-score the Iteration 004 archive**

Run: `deno run --allow-read scripts/eval-extraction.ts --offline /Users/santiagoaguirre/Downloads/MenusTesting/iter-004`
Record the full per-menu and aggregate output. Sanity expectations:
- El Marcos items flips to PASS if `abs(46 - confirmed_count) <= 3`.
- Nikkori serving-format option false positives drop (the filter removes copa/botella-style options).
- Casa Nostra stays FAIL on items (23 vs 33) — expected; that is Iterations 007/008's job.
- **True-target check:** Brasero (Pasta Alfredo, Pasta Parmesano), Casa Nostra (three targets), and Nikkori (Coladas) options must still be matched. If the filter removed a true target's options, remove the offending term from `SERVING_FORMAT`, re-run, and note the adjustment in the log entry.

- [ ] **Step 4: Also re-score iter-001 for reference**

Run: `deno run --allow-read scripts/eval-extraction.ts --offline /Users/santiagoaguirre/Downloads/MenusTesting/iter-001`
This shows the original baseline under the new ground truth (useful because iter-001 had Nikkori at 118/120, its best completeness).

- [ ] **Step 5: Append Iteration 005 to the eval log**

Append a new `## Iteration 005 — Offline re-baseline (no paid run)` section to `docs/superpowers/extraction-eval-log.md` following the established format: date, commits (Tasks 1–5), no model call (offline), hypothesis (corrected ground truth + tolerance + deterministic post-processing turn El Marcos green and remove serving-format false positives without touching true targets), the exact changes, both re-scored tables (iter-004 and iter-001 archives), what improved/failed, and decision (which dimensions remain red going into Iteration 006).

- [ ] **Step 6: Commit**

```bash
git add scripts/eval-extraction.ts docs/superpowers/extraction-eval-log.md
git commit -m "feat: offline re-scoring mode; log Iteration 005 re-baseline"
```

---

### Task 6: Casa Nostra photo forensics

**Files:**
- Read: `/Users/santiagoaguirre/Downloads/MenusTesting/CasaNostraMenu.png`
- Modify: `docs/superpowers/extraction-eval-log.md` (append findings under Iteration 005)

**Interfaces:**
- Consumes: Iteration 005 log entry (Task 5).
- Produces: a written legibility verdict that Iteration 007 depends on. If the verdict is "legibility problem", STOP for user input before Task 8.

- [ ] **Step 1: Measure the source image**

Run: `sips -g pixelWidth -g pixelHeight /Users/santiagoaguirre/Downloads/MenusTesting/CasaNostraMenu.png`
Record dimensions.

- [ ] **Step 2: Simulate the client compression pipeline**

The client compresses to ≤1024px JPEG q=0.7 (`expo-image-manipulator`, per AGENTS.md). Simulate:

```bash
mkdir -p /private/tmp/claude-501/-Users-santiagoaguirre-Desktop-CODING-menu-scan-app/bfe2d6d6-0cf7-42d5-a1c7-2caf245bfa0c/scratchpad/forensics
sips -Z 1024 -s format jpeg -s formatOptions 70 /Users/santiagoaguirre/Downloads/MenusTesting/CasaNostraMenu.png --out /private/tmp/claude-501/-Users-santiagoaguirre-Desktop-CODING-menu-scan-app/bfe2d6d6-0cf7-42d5-a1c7-2caf245bfa0c/scratchpad/forensics/casa-nostra-1024.jpg
```

- [ ] **Step 3: Inspect the missing-dish region at both resolutions**

Read both the original PNG and the 1024px JPEG with the Read tool. Locate dishes numbered 39, 42–49, and 58–59 (per the eval log, the consistently-missed rows). Answer in writing: are those rows legible at 1024px? Do they sit in a distinct visual region (second column, page fold, dense block, low contrast)? Compare with rows the model does extract (e.g. 38, 40, 41, 50).

- [ ] **Step 4: Record the verdict and gate**

Append a `### Casa Nostra forensics` subsection to the Iteration 005 log entry with: image dimensions, what the missed region looks like at model resolution, and one of two verdicts:
- "Rows legible at model resolution — miss is attentional; proceed to Iteration 007 as designed", or
- "Rows degraded/illegible at model resolution — legibility problem; STOP for user input before Iteration 007" (per the spec, findings reshape Iteration 007).

If the second verdict: STOP and present findings to the user.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/extraction-eval-log.md
git commit -m "docs: casa nostra missing-dish photo forensics"
```

---

### Task 7: Iteration 006 — prompt diet (PAID RUN)

**Files:**
- Modify: `supabase/functions/analyze-menu/extract.ts:30-32` (EXTRACT_PROMPT)
- Modify: `docs/superpowers/extraction-eval-log.md` (append Iteration 006)

**Interfaces:**
- Consumes: Tasks 1–5 complete (tolerance, fixture, post-processing, offline baseline).
- Produces: dieted EXTRACT_PROMPT consumed by both the Edge Function and the harness. Schema, types, and signatures unchanged.

- [ ] **Step 1: Remove the variant-folding sentences**

In `supabase/functions/analyze-menu/extract.ts`, inside the EXTRACT_PROMPT template literal, delete exactly these lines (they now instruct behavior the user rejected):

```
When the same base dish is printed several times with different fillings, proteins,
or preparations, return ONE item named after the base dish and put each printed
variant in options. Never return duplicate item names for variants of one dish.
```

Keep everything else, including: the option definition sentence ("An option is a printed choice about one item's composition…"), the serving-format exclusion, the distinct-products sentence, the prose-choice rule ("con X o Y"), and the Iteration 004 nearest-subheading rule.

- [ ] **Step 2: Static verification**

Run the static verification suite from Global Constraints. Expected: all pass.

- [ ] **Step 3: Commit the prompt change before the run**

```bash
git add supabase/functions/analyze-menu/extract.ts
git commit -m "feat(iter-006): remove variant-folding rules from EXTRACT_PROMPT"
```

Record the commit hash for the log entry.

- [ ] **Step 4: Paid run**

Run the paid harness command from Global Constraints. Record the full per-menu and aggregate output. If a menu times out (Nikkori precedent), repeat the run once unchanged and record both attempts, per the Iteration 003 precedent.

- [ ] **Step 5: Archive raw outputs**

```bash
mkdir -p /Users/santiagoaguirre/Downloads/MenusTesting/iter-006
cp /Users/santiagoaguirre/Downloads/MenusTesting/*.actual.json /Users/santiagoaguirre/Downloads/MenusTesting/iter-006/
```

- [ ] **Step 6: Log, gate, decide**

Append `## Iteration 006 — Prompt diet` to the eval log in the established format. Hypothesis: removing folding rules recovers Nikkori completeness toward 118 and reduces El Marcos option false positives, without regressing aggregate-green dimensions.

Regression gate: compare against Iteration 005's re-baselined aggregate. If a previously aggregate-green dimension is now aggregate-red, revert the Step 3 commit (`git revert <hash>`), log the revert, and STOP for user input. Otherwise record the decision and continue.

- [ ] **Step 7: Commit the log**

```bash
git add docs/superpowers/extraction-eval-log.md
git commit -m "docs: log Iteration 006 prompt diet results"
```

---

### Task 8: Iteration 007 — item_number schema + gap detection (PAID RUN)

**Files:**
- Modify: `supabase/functions/analyze-menu/extract.ts` (EXTRACT_PROMPT, EXTRACT_SCHEMA, `ExtractedMenuItem`)
- Modify: `supabase/functions/analyze-menu/postprocess.ts` and `postprocess_test.ts` (gap detection)
- Modify: `supabase/functions/analyze-menu/extract_test.ts` (mocked response gains item_number)
- Modify: `scripts/eval-extraction.ts` (print detected gaps)
- Modify: `docs/superpowers/extraction-eval-log.md` (append Iteration 007)

**Interfaces:**
- Consumes: Task 6 verdict (must be "proceed"), Iteration 006 results.
- Produces: `ExtractedMenuItem.item_number: string | null` (internal only — stripped from names, never shown in UI); `detectNumberGaps(items: ExtractedMenuItem[]): number[]` in postprocess.ts, used by Task 9's gap-fill and printed by the harness.

- [ ] **Step 1: Write the failing gap-detection tests**

Append to `supabase/functions/analyze-menu/postprocess_test.ts` (extend the import to include `detectNumberGaps`):

```ts
const numbered = (name: string, n: string | null): ExtractedMenuItem => ({
  ...item(name),
  item_number: n,
});

Deno.test("detects holes in a numbered menu", () => {
  const items = [
    numbered("A", "38"),
    numbered("B", "40"),
    numbered("C", "41"),
    numbered("D", "50"),
  ];
  assertEquals(detectNumberGaps(items), [39, 42, 43, 44, 45, 46, 47, 48, 49]);
});

Deno.test("reports no gaps when fewer than half the items are numbered", () => {
  const items = [
    numbered("A", "1"),
    numbered("B", null),
    numbered("C", null),
    numbered("D", null),
  ];
  assertEquals(detectNumberGaps(items), []);
});

Deno.test("reports no gaps on a complete numbered sequence", () => {
  const items = [
    numbered("A", "1"),
    numbered("B", "2"),
    numbered("C", "3"),
  ];
  assertEquals(detectNumberGaps(items), []);
});
```

Note: this step requires the `item_number` field on `ExtractedMenuItem` (Step 3), so the test fails to type-check first — that is the expected failure.

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test supabase/functions/analyze-menu/postprocess_test.ts`
Expected: FAIL — `detectNumberGaps` not exported / `item_number` not a known property

- [ ] **Step 3: Add item_number to the contract**

In `supabase/functions/analyze-menu/extract.ts`:

1. `ExtractedMenuItem` gains the field:

```ts
export interface ExtractedMenuItem {
  name: string;
  description: string;
  price: number | null;
  category: "food" | "side" | "dessert" | "drink" | "other";
  section_title: string | null;
  item_number: string | null;
  options: { name: string; price: number | null; grams: number | null }[];
}
```

2. In EXTRACT_SCHEMA's item properties, after `section_title`, add:

```ts
          item_number: { type: ["string", "null"] },
```

and add `"item_number"` to the item `required` array (strict structured outputs require every property listed).

3. In EXTRACT_PROMPT, after the sentence ending "never prepend or synthesize the heading into the name.", add:

```
If a printed list number appears beside an item (like "39. Spaghetti"), copy that
number into item_number and leave it out of name; otherwise set item_number to null.
```

- [ ] **Step 4: Implement detectNumberGaps**

Add to `supabase/functions/analyze-menu/postprocess.ts`:

```ts
export function detectNumberGaps(items: ExtractedMenuItem[]): number[] {
  const numbers = items
    .map((item) => Number(item.item_number))
    .filter((n) => Number.isInteger(n) && n > 0);
  if (numbers.length < 3 || numbers.length < items.length / 2) return [];
  const present = new Set(numbers);
  const gaps: number[] = [];
  for (let n = Math.min(...numbers); n <= Math.max(...numbers); n++) {
    if (!present.has(n)) gaps.push(n);
  }
  return gaps;
}
```

- [ ] **Step 5: Fix type ripples**

1. `extract_test.ts`: in the mocked message `content` JSON string, add `"item_number":null` to the item object, and update any assertion comparing the parsed item or the request schema so the new field is expected. Run the test to find every assertion that needs it.
2. Task 3's `postprocess_test.ts` `item()` helper gains `item_number: null`.
3. Task 1's `filler()` helper in `runSelfCheck()` and every inline `ExtractedMenuItem` literal in `scripts/eval-extraction.ts`'s self-check gains `item_number: null`.
4. Run `deno check supabase/functions/analyze-menu/index.ts` — enrichment consumes `ExtractedItem`; adding a field is backward-compatible, but verify.

- [ ] **Step 6: Print gaps in the harness**

In `scripts/eval-extraction.ts`, import `detectNumberGaps` alongside `postprocessItems`, and in both `main()` and `offline()` after building `actual`, add:

```ts
    const gaps = detectNumberGaps(actual.items);
    if (gaps.length > 0) {
      console.log(`  number gaps detected: ${gaps.join(", ")}`);
    }
```

(In `main()`, `actual.items` are already post-processed by `runExtraction`; in `offline()`, call it on the post-processed array you pass to `scoreMenu`.)

- [ ] **Step 7: Full static verification**

Run the static verification suite from Global Constraints, plus:

```bash
deno check supabase/functions/analyze-menu/index.ts
deno test supabase/functions/analyze-menu/
```

Expected: all pass.

- [ ] **Step 8: Commit before the run**

```bash
git add supabase/functions/analyze-menu/ scripts/eval-extraction.ts
git commit -m "feat(iter-007): item_number schema field with deterministic gap detection"
```

- [ ] **Step 9: Paid run, archive, log, gate**

1. Run the paid harness command. Watch for Nikkori timeout (per-item output grew); on timeout, repeat once unchanged and record both attempts.
2. Archive:

```bash
mkdir -p /Users/santiagoaguirre/Downloads/MenusTesting/iter-007
cp /Users/santiagoaguirre/Downloads/MenusTesting/*.actual.json /Users/santiagoaguirre/Downloads/MenusTesting/iter-007/
```

3. Append `## Iteration 007 — item_number schema` to the eval log. Hypothesis: numbering forces row-by-row grounding and recovers some or all of Casa Nostra's 10 missing dishes; regardless, gaps become machine-detectable. Record the detected gaps per menu.
4. Regression gate as in Task 7 Step 6: revert and STOP if a green dimension goes red.

```bash
git add docs/superpowers/extraction-eval-log.md
git commit -m "docs: log Iteration 007 item_number results"
```

---

### Task 9: Iteration 008 — conditional gap-fill (PAID RUN; TRIGGER GATE)

**Files:**
- Modify: `supabase/functions/analyze-menu/extract.ts` (gap-fill call inside `runExtraction`)
- Modify: `supabase/functions/analyze-menu/extract_test.ts` (mocked gap-fill test)
- Modify: `docs/superpowers/extraction-eval-log.md` (append Iteration 008)

**Interfaces:**
- Consumes: `detectNumberGaps` and `postprocessItems` from Task 8; Iteration 007 results.
- Produces: `runExtraction` self-repairs numbered gaps with at most one follow-up call. Clean scans make exactly one call.

- [ ] **Step 1: TRIGGER GATE**

Read the Iteration 007 log entry. This task runs ONLY if gap detection still reports missing numbered dishes (Casa Nostra or any menu). If Iteration 007 recovered completeness (no gaps detected), mark this task skipped in the plan checklist, note it in the eval log status, and move to Task 10.

- [ ] **Step 2: Write the failing test**

Append to `supabase/functions/analyze-menu/extract_test.ts` a test that mocks `globalThis.fetch` to return, on the first call, an extraction whose numbered items skip 39 and 42 (e.g. items numbered "38", "40", "41", "43" — with ≥3 numbered items so gap detection fires), and on the second call, the missing items:

```ts
Deno.test("runExtraction fills detected number gaps with one follow-up call", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  const firstItems = ["38", "40", "41", "43"].map((n) => (
    `{"name":"Dish ${n}","description":"","price":10,"category":"food","section_title":null,"item_number":"${n}","options":[]}`
  )).join(",");
  const gapItems =
    '{"name":"Dish 39","description":"","price":10,"category":"food","section_title":null,"item_number":"39","options":[]},{"name":"Dish 42","description":"","price":10,"category":"food","section_title":null,"item_number":"42","options":[]}';

  globalThis.fetch = (async (_input, _init) => {
    calls += 1;
    const items = calls === 1 ? firstItems : gapItems;
    return new Response(JSON.stringify({
      choices: [{
        finish_reason: "stop",
        message: {
          content:
            `{"image_quality":{"usable":true,"issues":[]},"items":[${items}]}`,
        },
      }],
    }));
  }) as typeof fetch;

  try {
    const result = await runExtraction(["photo-base64"], "test-key");
    assertEquals(calls, 2);
    assertEquals(result.items.length, 6);
    assertEquals(
      result.items.map((item) => item.item_number),
      ["38", "39", "40", "41", "42", "43"],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `deno test supabase/functions/analyze-menu/extract_test.ts`
Expected: FAIL — `calls` is 1 and items length is 4 (no gap-fill yet)

- [ ] **Step 4: Implement the gap-fill**

In `supabase/functions/analyze-menu/extract.ts`:

1. Extract the fetch call in `runExtraction` into a reusable helper (same file):

```ts
async function callExtractModel(
  prompt: string,
  photos: string[],
  apiKey: string,
  signal: AbortSignal,
): Promise<{ parsed: Omit<ExtractionResult, "raw_response">; raw: string }> {
```

Move the existing `fetch(...)` through `JSON.parse(text)` body into it, parameterizing only the prompt text (`{ type: "text", text: prompt }`) and returning `{ parsed, raw: text }`. Everything else (model, schema, temperature, seed, response_format, error handling, finish_reason log) stays identical.

2. Add the gap-fill prompt builder:

```ts
function gapFillPrompt(gaps: number[]): string {
  return `Read this restaurant menu. A previous extraction missed the menu items with these printed list numbers: ${
    gaps.join(", ")
  }.
Return ONLY those menu items, exactly as printed: name, description, price, category,
section_title, item_number, and options. Copy each printed list number into item_number
and leave it out of name. Follow the same rules as a full extraction for every field.
Do NOT return items with other numbers. Do NOT invent items you cannot read.
Assess image quality across all photos as usual.`;
}
```

3. Rewrite `runExtraction`'s body to use the helper, then detect and fill (import `detectNumberGaps` from `./postprocess.ts`):

```ts
    const { parsed, raw } = await callExtractModel(
      EXTRACT_PROMPT,
      photos,
      apiKey,
      controller.signal,
    );
    let items = postprocessItems(parsed.items);
    const gaps = detectNumberGaps(items);
    if (gaps.length > 0) {
      // ponytail: one follow-up, no retry loop; escalate only if real menus need more.
      const fill = await callExtractModel(
        gapFillPrompt(gaps),
        photos,
        apiKey,
        controller.signal,
      );
      const wanted = new Set(gaps.map(String));
      const filled = postprocessItems(fill.parsed.items).filter((item) =>
        item.item_number !== null && wanted.has(item.item_number)
      );
      items = [...items, ...filled].sort((a, b) =>
        Number(a.item_number) - Number(b.item_number)
      );
    }
    return {
      image_quality: parsed.image_quality,
      items,
      raw_response: raw,
    };
```

The Task 3 wiring (`items: postprocessItems(parsed.items)` inline in the return) is replaced by this block; `raw_response` stays the first call's raw text.

Note: the numeric sort is safe here because gap detection only fires when ≥half the items carry numbers; items without numbers coerce to `NaN` and keep insertion order in V8's stable sort. Keep the existing single `MODEL_TIMEOUT_MS` AbortController covering both calls.

- [ ] **Step 5: Run tests to verify they pass**

Run: `deno test supabase/functions/analyze-menu/`
Expected: PASS, including the pre-existing single-call test (its mocked response has no menu-wide numbering, so no second call fires — verify; if its mocked item now triggers anything, the mock content has only 1 item so gap detection cannot fire).

- [ ] **Step 6: Static verification, commit before the run**

Run the static verification suite plus `deno check supabase/functions/analyze-menu/index.ts`. Expected: all pass.

```bash
git add supabase/functions/analyze-menu/
git commit -m "feat(iter-008): conditional gap-fill call for numbered-menu holes"
```

- [ ] **Step 7: Paid run, archive, log, gate**

1. Run the paid harness command.
2. Archive to `/Users/santiagoaguirre/Downloads/MenusTesting/iter-008/` (same `mkdir -p` + `cp` pattern as Task 8).
3. Append `## Iteration 008 — Conditional gap-fill` to the eval log. Hypothesis: the targeted follow-up recovers the dishes gap detection names; Casa Nostra items goes PASS within ±3. Record how many menus triggered the follow-up (production cost shape: only gapped scans pay).
4. Regression gate as before: revert and STOP if a green dimension goes red.

```bash
git add docs/superpowers/extraction-eval-log.md
git commit -m "docs: log Iteration 008 gap-fill results"
```

---

### Task 10: Iteration 009 trigger check — two-pass options (STOP GATE)

**Files:**
- Read: `docs/superpowers/extraction-eval-log.md`

**Interfaces:**
- Consumes: Iterations 005–008 results.
- Produces: a go/no-go decision. No implementation in this plan.

- [ ] **Step 1: Evaluate the trigger**

Trigger per spec: options still aggregate-red after Iteration 006 plus the deterministic filters. Read the latest aggregate in the eval log.

- [ ] **Step 2: Act on it**

- Trigger does NOT fire (options aggregate-green): record "Iteration 009 not needed" in the eval log status section and continue to Task 11.
- Trigger fires: STOP. Per the spec, two-pass options requires its own follow-up design (prompt split, whether pass 2 sees the photo or pass-1 text, merging). Present the trigger evidence to the user and return to brainstorming for that design. Do NOT implement two-pass from this plan.

---

### Task 11: Wrap-up and verification

**Files:**
- Modify: `docs/superpowers/extraction-eval-log.md` (status + handoff section)

**Interfaces:**
- Consumes: everything above.
- Produces: final logged status; clean verification.

- [ ] **Step 1: Full verification suite**

```bash
deno check supabase/functions/analyze-menu/extract.ts supabase/functions/analyze-menu/postprocess.ts supabase/functions/analyze-menu/index.ts scripts/eval-extraction.ts
deno test supabase/functions/analyze-menu/
deno run --allow-read scripts/eval-extraction.ts --self-check
pnpm lint
```

Expected: all pass. Fix anything red before proceeding.

- [ ] **Step 2: Final status section**

Append a `### Status after Iteration 00N` section (N = last executed iteration) to the eval log in the established format: aggregate-green/red dimensions, active prompt/schema commits, reverted commits if any, archived output locations, and next action.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/extraction-eval-log.md
git commit -m "docs: status after extraction iterations 005-00N"
```

- [ ] **Step 4: Report to user**

Summarize per-iteration outcomes, which hypotheses were confirmed or refuted, remaining red dimensions, and the recommended next step.
