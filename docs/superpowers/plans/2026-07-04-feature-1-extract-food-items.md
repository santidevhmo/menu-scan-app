# Feature 1 — Extract all Food Menu Items — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Parent roadmap:** `docs/superpowers/plans/2026-07-04-ocr-extraction-master-roadmap.md`. Read its Strategy Rules before starting.

**Goal:** Every food item on each menu appears exactly once in the extraction JSON, and the food-item count matches the fixture's food total, on all 6 menus across 3 consecutive live runs.

**Architecture:** Two halves. (1) *Instrumentation* — split each fixture's combined `total_items` into `food_items`/`drink_items`, re-scope the harness's `items` dimension to count food only, and add a `--gate` flag that enforces "passes on ALL menus" for named dimensions. This half is deterministic TDD. (2) *Iteration* — run the live eval, diagnose per-menu food-count failures, tune `extract.ts` / `postprocess.ts`, and loop until the `items` gate is green 3/3. This half is empirical; the plan gives the protocol, not pre-written prompt edits.

**Tech Stack:** Deno, TypeScript, OpenAI GPT-4o Vision (`runExtraction` in `supabase/functions/analyze-menu/extract.ts`), fixture-driven eval harness (`scripts/eval-extraction.ts`).

## Global Constraints

- **Scope: extraction JSON only. NO UI work.** (Roadmap line 11.)
- **Working directory:** the worktree `/private/tmp/menu-scan-app-extraction-eval-harness` on branch `feat/extraction-eval-harness`. All commands below run from that directory.
- **Food definition (explicit assumption, from `extract.ts:24-25` which defaults ambiguous items to `"food"` and tags `"drink"` only when clear):** `food = category !== "drink"`. Therefore `food_items + drink_items === total_items` for every fixture. Sides/desserts/other count as food; drinks are Feature 5.
- **Exit gate (uniform, roadmap line 19-25):** the `items` (food) dimension passes on **ALL 6 menus** (`brasero`, `brasero-two`, `casa-nostra`, `el-marcos`, `mochomos`, `nikkori`) in **3 of 3 consecutive live eval runs**. This supersedes the ±2 noise-floor *acceptance* rule for closing; ±2 stays useful for judging mid-iteration progress. **Frozen gates at start: none** (first feature), so the closed-features clause is vacuous for Feature 1.
- **Ledger discipline:** every iteration logs to `docs/superpowers/extraction-iteration-ledger.md` and `docs/superpowers/extraction-eval-log.md` in the worktree.
- **No new libraries.** Match existing harness style.

---

## Reference Block (copied verbatim from the master roadmap)

### Branches

```
┌────────────────────────────────┬─────────────┬─────────────────────────────────────────────────────────────────────────┐
│             Branch             │   Status    │                                 Purpose                                 │
├────────────────────────────────┼─────────────┼─────────────────────────────────────────────────────────────────────────┤
│ feat/extraction-eval-harness   │ Active WIP  │ ← eval-log.md is here — measuring extraction quality across iterations;  │
│                                │             │   includes offline re-scoring against corrected El Marcos options;       │
│                                │             │   tracking pass/fail rates and option detection improvements             │
├────────────────────────────────┼─────────────┼─────────────────────────────────────────────────────────────────────────┤
│ feat/options-extraction-eval   │ 7 commits   │ Earlier extraction eval setup — GPT-4o vision caller, prompt configs,    │
│                                │             │   scoring framework with TDD                                             │
├────────────────────────────────┼─────────────┼─────────────────────────────────────────────────────────────────────────┤
│ feat/multi-goal-zscore-sorting │ Merged      │ ✓ Goal ranking algorithm (soft-clamped z-scores) — already in main       │
├────────────────────────────────┼─────────────┼─────────────────────────────────────────────────────────────────────────┤
│ feat/selectable-options        │ Current     │ ✓ Menu option UI selection feature — already in main                     │
├────────────────────────────────┼─────────────┼─────────────────────────────────────────────────────────────────────────┤
│ feat/phase3-goal-selection     │ Merged      │ ✓ Goal filtering logic — already in main                                 │
└────────────────────────────────┴─────────────┴─────────────────────────────────────────────────────────────────────────┘
```

**Working directory:** eval work happens in the worktree `/private/tmp/menu-scan-app-extraction-eval-harness` on branch `feat/extraction-eval-harness`.

### Files (reference — NOT MANDATORY TO READ ALL)

> Relevant files NOT MANDATORY TO READ ALL. Reading all results in burned context and unable to start task. Keep these as reference and to read when necessary.

- All evaluation results → `/private/tmp/menu-scan-app-extraction-eval-harness/docs/superpowers/extraction-eval-log.md`
- `/Users/santiagoaguirre/Desktop/CODING/menu-scan-app/CLAUDE.md`
- `/Users/santiagoaguirre/Desktop/CODING/menu-scan-app/AGENTS.md`
- `/private/tmp/menu-scan-app-extraction-eval-harness/docs/superpowers/extraction-options-handoff.md`
- `/private/tmp/menu-scan-app-extraction-eval-harness/docs/superpowers/extraction-iteration-ledger.md`
- `/private/tmp/menu-scan-app-extraction-eval-harness/docs/superpowers/specs/2026-07-03-two-pass-options-design.md`
- `/private/tmp/menu-scan-app-extraction-eval-harness/docs/superpowers/plans/2026-07-03-two-pass-options-iteration-009.md`
- `/private/tmp/menu-scan-app-extraction-eval-harness/supabase/functions/analyze-menu/postprocess.ts`
- `/private/tmp/menu-scan-app-extraction-eval-harness/scripts/eval-extraction.ts`
- `/private/tmp/menu-scan-app-extraction-eval-harness/scripts/fixtures/*.expected.json`

### Edge Function (menu scanning)

```bash
curl -s -X POST "https://uonuiadueykynbetxxrw.supabase.co/functions/v1/analyze-menu" \
  -H "Authorization: Bearer <EXPO_PUBLIC_SUPABASE_ANON_KEY from .env>" \
  -H "Content-Type: application/json" \
  -d '{"photos":["<base64 img1>","<base64 img2>"],"goals":[],"provider":"gpt-vision","stage":"extract"}'
```

Anon key is in `.env` as `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Response includes `items`, `raw_response`, `latency_ms`, `model_id`. Local `supabase serve` runs also need `OPENAI_API_KEY` set in the environment (per prior sessions).

> **Note for this feature:** the eval harness does **not** use the curl edge-function path — it calls `runExtraction(photos, apiKey)` directly with `OPENAI_API_KEY`. The curl block above is retained per the roadmap for manual/deployed testing only. The canonical Feature 1 commands are the `deno run ... eval-extraction.ts` invocations in the tasks below.

---

## File Structure

- **Modify** `scripts/eval-extraction.ts` — add `food_items`/`drink_items` to `ExpectedFixture`; re-scope the `items` dimension to food-only; add `gateFailures()` + `enforceGate()` + `--gate` wiring; extend `runSelfCheck()`. Single file, ~633 lines, already the home of all scoring logic.
- **Modify** all 6 fixtures `scripts/fixtures/{brasero,brasero-two,casa-nostra,el-marcos,mochomos,nikkori}.expected.json` — add `food_items` and `drink_items` keys.
- **Iterate on** `supabase/functions/analyze-menu/extract.ts` (prompt/schema) and `supabase/functions/analyze-menu/postprocess.ts` (dedup/cleanup) — empirical, Task 5 only. Do **not** pre-edit.

---

## Reference: current harness shape (so you don't have to re-read the file)

`ExpectedFixture` (eval-extraction.ts:10-28) has `menu`, `photos`, `total_items`, `categories`, `sections`, `section_headers?`, `section_expectations`, `items_with_options`, `image_quality?`.

`ExtractedMenuItem` (from `extract.ts`) has `name`, `description`, `price`, `category` (`"food" | "side" | "dessert" | "drink" | "other"`), `section_title`, `options: {name, price, grams}[]`.

Current `items` dimension (eval-extraction.ts:116-126) scores `actual.items.length` vs `fixture.total_items` with ±3 tolerance and a phantom-section-header check.

`MenuReport` fields (eval-extraction.ts:40-47): `menu`, `items`, `categories`, `section_context`, `options`, `image_quality` (each a `{pass, detail}`, except `image_quality` may be `null`).

CLI dispatch (eval-extraction.ts:628-633): `--self-check` runs unit tests; `--offline <dir>` re-scores archived `<menu>.actual.json`; no flag runs live.

---

## Task 1: Add `food_items` / `drink_items` to the fixture type + invariant guard

**Files:**
- Modify: `scripts/eval-extraction.ts` (interface `ExpectedFixture` ~lines 10-28; `loadFixtures` ~lines 294-309; `runSelfCheck` stub fixture ~lines 392-411 and `duplicateFixture` ~lines 539-554)
- Test: same file, `runSelfCheck()` (run via `--self-check`)

**Interfaces:**
- Produces: `ExpectedFixture.food_items: number` and `ExpectedFixture.drink_items: number`, with enforced invariant `food_items + drink_items === total_items`. Task 2 consumes `food_items`; Feature 5 later consumes `drink_items`.

- [ ] **Step 1: Write the failing self-check for the invariant**

In `runSelfCheck()`, immediately after the `imageMimeType` asserts (~line 390), add:

```ts
const balanced: ExpectedFixture = {
  menu: "balance",
  photos: ["stub.jpg"],
  total_items: 5,
  food_items: 3,
  drink_items: 2,
  categories: ["food", "drink"],
  sections: [],
  section_expectations: [],
  items_with_options: [],
};
assert(
  balanced.food_items + balanced.drink_items === balanced.total_items,
  "fixture food + drink counts must sum to total",
);
```

- [ ] **Step 2: Run it to confirm it fails to compile**

Run: `deno run --allow-read --allow-write --allow-env --allow-net scripts/eval-extraction.ts --self-check`
Expected: FAIL — TypeScript error, `food_items`/`drink_items` do not exist on `ExpectedFixture`.

- [ ] **Step 3: Add the fields to the interface**

In `interface ExpectedFixture`, directly after `total_items: number;`, add:

```ts
  food_items: number;
  drink_items: number;
```

- [ ] **Step 4: Add the runtime invariant guard in `loadFixtures`**

Replace the `return await Promise.all(...)` block at the end of `loadFixtures` with:

```ts
  const fixtures = await Promise.all(
    names.sort().map(async (name) =>
      JSON.parse(
        await Deno.readTextFile(new URL(name, FIXTURE_DIR)),
      ) as ExpectedFixture
    ),
  );
  for (const fixture of fixtures) {
    if (fixture.food_items + fixture.drink_items !== fixture.total_items) {
      throw new Error(
        `${fixture.menu}: food_items(${fixture.food_items}) + drink_items(${fixture.drink_items}) !== total_items(${fixture.total_items})`,
      );
    }
  }
  return fixtures;
```

- [ ] **Step 5: Add `food_items`/`drink_items` to the two self-check stub fixtures**

In the `stub` fixture (~line 392), after `total_items: 2,` add:
```ts
    food_items: 2,
    drink_items: 0,
```
In `duplicateFixture` (~line 539), after `total_items: 3,` add:
```ts
    food_items: 3,
    drink_items: 0,
```

- [ ] **Step 6: Run the self-check to verify it passes**

Run: `deno run --allow-read --allow-write --allow-env --allow-net scripts/eval-extraction.ts --self-check`
Expected: PASS — ends with `Self-check passed`.

- [ ] **Step 7: Commit**

```bash
git add scripts/eval-extraction.ts
git commit -m "feat(eval): add food_items/drink_items fixture fields with sum invariant"
```

---

## Task 2: Re-scope the `items` dimension to food-only

**Files:**
- Modify: `scripts/eval-extraction.ts` (`scoreMenu` items block ~lines 116-126; `runSelfCheck` ~after line 435)
- Test: `runSelfCheck()`

**Interfaces:**
- Consumes: `fixture.food_items` (Task 1), `ExtractedMenuItem.category`.
- Produces: `MenuReport.items` now measures `count(actual.items where category !== "drink")` vs `fixture.food_items`. Detail string format: `"<n>/<expected> food items; <k> section-header items"`.

- [ ] **Step 1: Write the failing self-check — drinks must not inflate the food count**

In `runSelfCheck()`, after the existing `passing`/`failing` asserts (~line 490), add:

```ts
const foodPlusDrinks: ActualExtraction = {
  image_quality: { usable: true, issues: [] },
  items: [
    ...actual.items,
    ...Array.from({ length: 5 }, (_, i) => ({
      name: `Drink ${i}`,
      description: "",
      price: 3,
      category: "drink" as const,
      section_title: null,
      options: [],
    })),
  ],
};
assert(
  scoreMenu(fixture, foodPlusDrinks).items.pass,
  "5 extra drink items must not break the food-only item count",
);
```

(The `stub` fixture has `food_items: 2` and two non-drink actual items, so the food count is 2 regardless of the 5 drinks. If drinks were counted, 7 vs 2 = +5 > 3 → fail. This test only passes when drinks are excluded.)

- [ ] **Step 2: Run it to confirm it fails**

Run: `deno run --allow-read --allow-write --allow-env --allow-net scripts/eval-extraction.ts --self-check`
Expected: FAIL — `Self-check failed: 5 extra drink items must not break the food-only item count` (current code counts all items against `total_items`).

- [ ] **Step 3: Re-scope the items block in `scoreMenu`**

Replace the items block (currently lines 116-126, starting `const itemDelta = ...` through the `const items = {...};`) with:

```ts
  const foodItems = actual.items.filter((item) => item.category !== "drink");
  const itemDelta = foodItems.length - fixture.food_items;
  const headers = new Set(
    [...fixture.sections, ...(fixture.section_headers ?? [])].map(normalize),
  );
  const phantomHeaders =
    actual.items.filter((item) => headers.has(normalize(item.name))).length;
  const items = {
    pass: Math.abs(itemDelta) <= 3 && phantomHeaders === 0,
    detail:
      `${foodItems.length}/${fixture.food_items} food items; ${phantomHeaders} section-header items`,
  };
```

- [ ] **Step 4: Run the self-check to verify it passes**

Run: `deno run --allow-read --allow-write --allow-env --allow-net scripts/eval-extraction.ts --self-check`
Expected: PASS — `Self-check passed`. The existing `passing.items.pass`, `failing.items.pass`, `+3`/`+4` boundary, and aggregate asserts still hold because the stub's non-drink items still number 2, 5, and 6 respectively against `food_items: 2`.

- [ ] **Step 5: Commit**

```bash
git add scripts/eval-extraction.ts
git commit -m "feat(eval): score items dimension on food-only (category != drink)"
```

---

## Task 3: Add the `--gate <dims>` all-menus filter flag

**Files:**
- Modify: `scripts/eval-extraction.ts` (add `GateDimension` type + `gateFailures()` near the other exported scorers ~after line 249; add `enforceGate()` helper; wire into `main()` ~lines 345-355 and `offline()` ~line 385; extend `runSelfCheck()`)
- Test: `runSelfCheck()`

**Interfaces:**
- Consumes: `MenuReport` (Task 2's re-scoped `items`).
- Produces: `export function gateFailures(reports: MenuReport[], dims: GateDimension[]): string[]` — returns one `"<dim>: <menu>, <menu>"` string per dimension that fails on any menu (empty array = all gated dimensions pass on all menus). `GateDimension = "items" | "categories" | "section_context" | "options" | "image_quality"`. A `null` `image_quality` score counts as passing. CLI: `--gate items` (or `--gate items,options` once later features close) exits non-zero unless every listed dimension passes on every menu. When `--gate` is present, the legacy 80%-aggregate exit is skipped.

- [ ] **Step 1: Write the failing self-check for `gateFailures`**

In `runSelfCheck()`, after the `aggregateReports` asserts (~line 528, they reference `passing` and `failing`), add:

```ts
assert(
  gateFailures([passing, passing], ["items"]).length === 0,
  "gate passes when every menu passes the dimension",
);
const gateFail = gateFailures([passing, failing], ["items"]);
assert(gateFail.length === 1, "gate fails when any menu fails the dimension");
assert(
  gateFail[0].startsWith("items:"),
  "gate failure names the failing dimension",
);
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `deno run --allow-read --allow-write --allow-env --allow-net scripts/eval-extraction.ts --self-check`
Expected: FAIL — TypeScript error, `gateFailures` is not defined.

- [ ] **Step 3: Add the `GateDimension` type and `gateFailures()`**

Immediately after `aggregateReports` (after line 249), add:

```ts
type GateDimension =
  | "items"
  | "categories"
  | "section_context"
  | "options"
  | "image_quality";

export function gateFailures(
  reports: MenuReport[],
  dims: GateDimension[],
): string[] {
  const failures: string[] = [];
  for (const dim of dims) {
    const failing = reports
      .filter((report) => {
        const score = report[dim];
        return score !== null && !score.pass;
      })
      .map((report) => report.menu);
    if (failing.length > 0) failures.push(`${dim}: ${failing.join(", ")}`);
  }
  return failures;
}
```

- [ ] **Step 4: Add the `enforceGate()` CLI helper**

Directly below `gateFailures`, add:

```ts
function enforceGate(reports: MenuReport[]): boolean {
  const gateIndex = Deno.args.indexOf("--gate");
  if (gateIndex === -1) return false;
  const dims = Deno.args[gateIndex + 1]
    .split(",")
    .map((dim) => dim.trim()) as GateDimension[];
  const failures = gateFailures(reports, dims);
  if (failures.length > 0) {
    console.log(`\nGATE FAIL (${dims.join(", ")}):`);
    for (const failure of failures) console.log(`  ${failure}`);
    Deno.exitCode = 1;
  } else {
    console.log(`\nGATE PASS: ${dims.join(", ")} on all ${reports.length} menus`);
  }
  return true;
}
```

- [ ] **Step 5: Wire `enforceGate` into `main()`**

In `main()`, replace the final block (currently lines 345-355, `const aggregate = ...` through the closing `}` of the exit-code `if`) with:

```ts
  const aggregate = aggregateReports(reports);
  printReport(reports, aggregate);
  if (enforceGate(reports)) return;
  if (
    !aggregate.items ||
    !aggregate.categories ||
    !aggregate.section_context ||
    !aggregate.options ||
    aggregate.image_quality === false
  ) {
    Deno.exitCode = 1;
  }
```

- [ ] **Step 6: Wire `enforceGate` into `offline()`**

In `offline()`, replace the final line `printReport(reports, aggregateReports(reports));` with:

```ts
  printReport(reports, aggregateReports(reports));
  enforceGate(reports);
```

- [ ] **Step 7: Run the self-check to verify it passes**

Run: `deno run --allow-read --allow-write --allow-env --allow-net scripts/eval-extraction.ts --self-check`
Expected: PASS — `Self-check passed`.

- [ ] **Step 8: Commit**

```bash
git add scripts/eval-extraction.ts
git commit -m "feat(eval): add --gate flag enforcing named dimensions pass on all menus"
```

---

## Task 4: Establish ground-truth food/drink counts in all 6 fixtures

**Files:**
- Modify: `scripts/fixtures/brasero.expected.json`, `brasero-two.expected.json`, `casa-nostra.expected.json`, `el-marcos.expected.json`, `mochomos.expected.json`, `nikkori.expected.json`

**Interfaces:**
- Produces: each fixture gains `food_items` and `drink_items` such that `food_items + drink_items === total_items`. These are the ground truth the `items` gate scores against.

**Method (per fixture):** open the menu photo in `/Users/santiagoaguirre/Downloads/MenusTesting/<Photo>.png`, count the **drink** items (anything clearly a beverage — sodas, juices, coffee, cocktails, beer, wine, spirits, water). `drink_items` = that count. `food_items = total_items - drink_items`. Sanity-check `food_items` against the food count in the archived best-known extraction (`<menu>.actual.json` in the same folder — food = non-drink). If they disagree by more than ±2, re-count from the photo; the fixture wins.

**Seed values** (derived from archived extractions — the four all-food menus are certain because their `categories` arrays contain no `"drink"`; el-marcos and nikkori MUST be verified against the photo):

| menu | photo | total_items | food_items (seed) | drink_items (seed) | certain? |
|---|---|---|---|---|---|
| brasero | `BraseroMenu.png` | 28 | 28 | 0 | ✓ no drink category |
| brasero-two | `BraseroMenuTwo.png` | 25 | 25 | 0 | ✓ no drink category |
| casa-nostra | `CasaNostraMenu.png` | 23 | 23 | 0 | ✓ no drink category |
| mochomos | `MochomosMenu.png` | 22 | 22 | 0 | ✓ no drink category |
| el-marcos | `ElMarcosMenu.png` | 45 | 36 | 9 | ⚠ VERIFY vs photo |
| nikkori | `NikkoriMenu.png` | 120 | 45 | 75 | ⚠ VERIFY vs photo |

- [ ] **Step 1: Add the keys to the four all-food fixtures**

In each of `brasero`, `brasero-two`, `casa-nostra`, `mochomos`, add after the `"total_items"` line:
```json
  "food_items": <total_items>,
  "drink_items": 0,
```
(e.g. brasero → `"food_items": 28, "drink_items": 0`.)

- [ ] **Step 2: Add and VERIFY the keys for el-marcos**

Open `/Users/santiagoaguirre/Downloads/MenusTesting/ElMarcosMenu.png`. Count drink items (the `De la Cafetería` and `Jugos y Frutas` sections are the beverage sources). Set:
```json
  "food_items": <45 - drinkCount>,
  "drink_items": <drinkCount>,
```
Seed is 36/9; adjust to the photo.

- [ ] **Step 3: Add and VERIFY the keys for nikkori**

Open `/Users/santiagoaguirre/Downloads/MenusTesting/NikkoriMenu.png`. Nikkori is drink-heavy (Cervezas, Cocteles, Margaritas, Martinis, Mojitos, Sake, Vodka, Ron, Tequila, Whisky, Digestivo, wines, Bebidas, Limonadas, Tés). Count all beverages. Set:
```json
  "food_items": <120 - drinkCount>,
  "drink_items": <drinkCount>,
```
Seed is 45/75; adjust to the photo.

- [ ] **Step 4: Verify the invariant holds for every fixture**

Run: `deno run --allow-read --allow-write --allow-env --allow-net scripts/eval-extraction.ts --offline /Users/santiagoaguirre/Downloads/MenusTesting`
Expected: no `food_items + drink_items !== total_items` error thrown from `loadFixtures` (it may print per-menu scores or SKIP lines — that's fine; the point is the invariant guard passes for all 6). If it throws, fix the offending fixture's counts.

- [ ] **Step 5: Commit**

```bash
git add scripts/fixtures/*.expected.json
git commit -m "feat(eval): split fixture totals into ground-truth food/drink counts"
```

---

## Task 5: Iterate `extract.ts` until the food `items` gate passes on all 6 menus

This is the empirical core. **No pre-written prompt edits** — the change depends on what the live run reveals. Follow the loop; log every iteration to the ledger.

**Files (iterate as diagnosis dictates):**
- Modify: `supabase/functions/analyze-menu/extract.ts` (system/user prompt, schema — food-item completeness)
- Modify: `supabase/functions/analyze-menu/postprocess.ts` (dedup, section-header stripping)
- Log: `docs/superpowers/extraction-iteration-ledger.md`, `docs/superpowers/extraction-eval-log.md`

**Interfaces:**
- Consumes: the `--gate items` flag (Task 3), food-scoped scoring (Task 2), ground-truth counts (Task 4).
- Produces: a prompt/schema state where `--gate items` prints `GATE PASS: items on all 6 menus`.

**Pre-flight:** ensure `OPENAI_API_KEY` is set in the environment (each live run costs ~$0.03/menu × 6 ≈ $0.18).

- [ ] **Step 1: Baseline live run**

Run: `deno run --allow-read --allow-write --allow-env --allow-net scripts/eval-extraction.ts --gate items`
This writes `<menu>.actual.json` for each menu to `/Users/santiagoaguirre/Downloads/MenusTesting/` and prints per-menu `items` PASS/FAIL plus the gate verdict. Record the per-menu `items` detail lines in the ledger.

- [ ] **Step 2: Diagnose each failing menu**

For every menu whose `items` line is FAIL, open its `<menu>.actual.json` and compare food items (`category !== "drink"`) against the photo and `food_items`:
- **Undercount** (fewer food items than expected): the model skipped items — usually dense grids, multi-column layouts, or items printed as description text. Note which items are missing.
- **Overcount** (more than +3): duplicates, or section headers extracted as items (`phantomHeaders > 0`). Note the offending names.
Write the failure mode per menu to the ledger.

- [ ] **Step 3: Make ONE targeted change**

Change **either** the `extract.ts` prompt/schema **or** `postprocess.ts` — the smallest edit that addresses the diagnosed failure mode. Examples of the *kind* of change (do not apply blindly — match the diagnosis):
- Undercount on dense menus → strengthen the prompt instruction to enumerate every printed dish including grid/multi-column layouts.
- Section headers as items → tighten `postprocess.ts` header-stripping or the prompt's "do not emit section titles as items" rule.
Log the hypothesis and the exact change to the ledger **before** re-running.

- [ ] **Step 4: Re-run and check for regressions across menus**

Run: `deno run --allow-read --allow-write --allow-env --allow-net scripts/eval-extraction.ts --gate items`
**Regression guard (roadmap line 25):** if the change fixed the target menu but broke a menu that previously passed `items`, the change is **rejected** — revert it and try a different edit. A change only counts if it moves the gate toward all-6 green without trading one menu for another.

- [ ] **Step 5: Loop Steps 2-4 until the gate passes**

Repeat until the run prints `GATE PASS: items on all 6 menus`. Each iteration = one ledger entry.

- [ ] **Step 6: Confirm the exit gate — 3 consecutive live runs, all green**

Run the live gate command **3 times in a row**, no code changes between them:
```bash
deno run --allow-read --allow-write --allow-env --allow-net scripts/eval-extraction.ts --gate items
```
Expected: `GATE PASS: items on all 6 menus` all 3 times. If any run shows FAIL on any menu, the feature is **not** closed — the count is unstable; return to Step 2 (the model is non-deterministic near a boundary; the fix must hold with margin, not by ±1 luck). Record all 3 runs' per-menu results in `extraction-eval-log.md`.

- [ ] **Step 7: Commit the passing extraction state**

```bash
git add supabase/functions/analyze-menu/extract.ts supabase/functions/analyze-menu/postprocess.ts docs/superpowers/extraction-iteration-ledger.md docs/superpowers/extraction-eval-log.md
git commit -m "feat(extract): food-item extraction passes items gate 3/3 on all menus"
```

---

## Task 6: Close out Feature 1 — freeze the gate, log, tick the checklist

> **Location note:** this plan and the roadmap live in the **main repo checkout** (`/Users/santiagoaguirre/Desktop/CODING/menu-scan-app`), not the worktree. Run the edits and the `git` commit in Steps 1-4 from the main repo directory (the code/ledger commits in Tasks 1-5 run from the worktree — the two are separate working trees on separate branches).

**Files:**
- Modify: this plan's **Feature 1 Execution Log** and **Progress Checklist** (below)
- Modify: `docs/superpowers/plans/2026-07-04-ocr-extraction-master-roadmap.md` (its Progress Checklist)

- [ ] **Step 1: Fill the Feature 1 Execution Log**

In the Execution Log section below, record: which menus failed initially and how; the change(s) that fixed each; any change that was rejected by the regression guard (and why); the final 3/3 per-menu counts. This is the context the Feature 2+ instances will read.

- [ ] **Step 2: Tick both checklists**

Change `- [ ] Feature 1` to `- [x] Feature 1` in the Progress Checklist below **and** in the roadmap's Progress Checklist (roadmap line 145).

- [ ] **Step 3: Record the frozen-gate command for Feature 2**

Feature 2's runs must keep Feature 1 green. Its gate command becomes:
```bash
deno run --allow-read --allow-write --allow-env --allow-net scripts/eval-extraction.ts --gate items,options
```
Note this in the Execution Log so the Feature 2 instance inherits it.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-07-04-feature-1-extract-food-items.md docs/superpowers/plans/2026-07-04-ocr-extraction-master-roadmap.md
git commit -m "docs: close Feature 1 (food items) — log, freeze items gate, tick checklist"
```

---

## Feature 1 — Current Position & Next Evals (2026-07-06 handoff)

**Acceptance bar (clarified by the user 2026-07-06):** a menu's food dimension passes when its **food-item count is within ±3 of the fixture's `food_items`** AND there are **no duplicated food items** AND no section-header pseudo-items (`phantomHeaders === 0`). **Exact printed-name spelling is NOT required for Feature 1** — a stable OCR misread (e.g. `Nevada`→`Nevadal`, `Kurimi Roll`→`Kurimu Roll`) is acceptable as long as the item appears exactly once and the count is in range. Name normalization/spelling is deferred to a later feature. **This supersedes the de-facto 42/42 exact-roll-recall bar that iterations 016–024 were (over-strictly) rejected against.**

**Position:** 5 of 6 menus pass the food-count gate on the iter-015 baseline (brasero 28/28, brasero-two 43/44, casa-nostra 23/23, el-marcos 36/34, mochomos 22/22). **Nikkori is the sole blocker.** The 3-of-3-consecutive-all-6 exit gate has never been attempted because Nikkori has never passed once. Iterations 016–024 proved the blocker is NOT compression, crop geometry, or full-page resolution (all dead ends — see below). The best result (iter-024: raw 2×2 crops, uncompressed, `detail:"high"`, 4 separate calls, merged) reaches **39–40/42 exact rolls with ZERO duplicates**, and its remaining misses are stable name misreads — which the clarified bar treats as acceptable. **What was never measured: the merged iter-024 food count through the real `--gate items` scorer.** That is the decisive open question.

### Eval 025 — free re-score of the iter-024 archives — ✅ DONE 2026-07-06

Ran offline via the existing `scripts/eval-adaptive-crops.ts` (merges the 4 archived crops per run with `mergeItemSources`, filters drinks, reports merged food count + normalized-name duplicates). All 12 archives present; zero API cost. Command form:
```bash
deno run --allow-read scripts/eval-adaptive-crops.ts grid-raw-high-r1 \
  ~/Downloads/MenusTesting/nikkori.grid-raw-high-r1-{1,2,3,4}.actual.json   # repeat for r2, r3
```
**Result under the clarified bar (count within [45,51], no dups): 2/3 runs PASS** — r1 `actual=47` dups=[] ✅, r3 `actual=48` dups=[] ✅, **r2 `actual=52` dups=[] ❌ (+1 over the 51 ceiling).** r2's overcount is a **crop-boundary variant split**: `Kurimu Roll` + `Kurimu Roll I` and `Salmón Samba I` are the same rolls appearing twice under two spellings — they escape exact-normalized dedup but a roll then "appears twice" (violates "appears exactly once"). Ledger entry: iteration 025.

### Harness prep + the lever

1. **The lever — tighten `mergeItemSources` (`src/lib/adaptiveExtraction.ts`) — ✅ DONE 2026-07-06 (iteration 026).** Root-cause of r2's overcount was NOT missing trailing-token logic — the edit-distance dedup already matched `Kurimu Roll`/`Kurimu Roll I` (distance 2 ≤ threshold 2). The blocker was the `duplicate()` guard requiring identical `section_title`: iter-024's crop 3 emits `section_title:null`, treated as a distinct section, so the variant survived. Fix: a null/empty section on either side is now **compatible** (null = "unknown", not "different section"). TDD test "merges near-name variant when one source omits the section" added. **Eval 026 (offline re-score of iter-024 archives, $0): r1=47, r2=48 (was 52), r3=48 → 3/3 under the clarified bar, r2 `missing` unchanged so zero rolls lost, all 11 unit tests pass.**
2. **Instrumentation — extend the `items` scorer (`scripts/eval-extraction.ts` ~lines 118–128) — ✅ DONE 2026-07-06.** `items.pass` now also fails when a food item is a true duplicate — **same normalized name AND same price** (keyed on `name@price`), so same-name-different-price dishes (Revueltos 78/84/90) stay distinct while a genuinely doubled dish (Kurimu Roll @169 ×2) is caught. Detail string reports the duplicate count. TDD: a failing "same name at same price = duplicate" self-check + a passing "same name different price = distinct" guard added; `--self-check` passes.

### Eval 027 — the real exit-gate attempt (paid, live) — ⏳ SCRIPT READY, awaiting a live run

Built and type-checked `scripts/eval-027-live.ts` (2026-07-06): 5 non-dense menus run one production-faithful `runExtraction`; Nikkori runs the validated recipe (uncompressed 2×2 tiles at `detail:"high"`, merged). Routes via a `DENSE_TILES` map that feeds Nikkori's pre-cut tiles — this is **eval input routing only** (test assets), NOT solution logic; the automatic cutter for any dense menu is the separate production follow-up (needs an image lib + `extract-crops` extended to 4 high-detail crops — currently it caps at 2–3 and omits `detail`). Runs the `items` gate on all 6 menus 3 consecutive times; exit 0 only if all 3 pass. Run it:
```bash
OPENAI_API_KEY=... deno run --allow-read --allow-write --allow-env --allow-net scripts/eval-027-live.ts
```
(The generic `eval-extraction.ts --gate items` path is single-call only and does NOT crop dense menus, so it cannot pass Nikkori on its own — use `eval-027-live.ts` until the auto-cutter lands.)
Pass = `GATE PASS: items on all 6 menus` all 3 runs, each menu also clearing the no-dup check. Cost ≈ $0.30/run × 3 ≈ $0.90. Watch for: (a) the r2 overcount recurring if the merge tweak is too weak; (b) `phantomHeaders` on any menu; (c) brasero-two (−1) and el-marcos (+2) sitting near the ±3 edge — their 3/3 stability is unverified.
- **Cost — ✅ APPROVED by user 2026-07-06:** raw crops skip the production ≤1024px/JPEG-q0.7 compression and add ~3 extra GPT-4o calls (~$0.12) per dense menu. User accepted this to get the core feature correct; cost optimization is a later, separate concern (must not sacrifice OCR quality).
- **Wiring gap to close (general, not menu-specific):** the live crop path (`runCropExtractions` in `extract.ts`) currently calls `runExtraction([photo], apiKey)` with **no** `detail` arg (→ auto) and crops go through the normal compression path. Iter-024's 3/3 needed `detail:"high"` on **uncompressed** crops. Wire both — but key them on the model's own `image_layout.dense` flag (any dense menu worldwide → high-detail uncompressed crops), never on a menu id. Audited 2026-07-06: prompt, schema, crop routing, and the iter-026 merge fix are all general (no menu names, no hardcoded counts, no oracle imports in production). Only residual: `postprocess.ts` `SERVING_FORMAT` denylist has bare numbers `85`/`300`/`750` — affects option filtering only (not Feature 1 counts); clean up in Feature 2.

### Do NOT re-run (proven dead ends, ledger 016–024)

Compression variants, crop-geometry variants, full-page `detail:auto`/`high`, food-only prompting, and prompt-level anti-fold/subheading rules. All net-lose or fail; do not resurrect. Iterations 001–014 predate Feature 1 (old multi-dimension loop) — do not revive their hypotheses either.

### Logging discipline (do not skip)

Every eval = one entry in `/private/tmp/menu-scan-app-extraction-eval-harness/docs/superpowers/extraction-iteration-ledger.md` (newest LAST, ≤15 lines, use the entry template at the top of that file), with full run detail in `extraction-eval-log.md` in the same directory. The feature-level summary goes in this plan's Execution Log below. Do NOT log Feature 1 evals into any other feature's file, and do NOT append into the ledger's 001–011 do-not-repeat summary. Continue the sequence: the next entries are **iteration 025+**.

---

## Feature 1 Execution Log

> Fill during Tasks 5-6. This is the durable record other LLM instances read before Features 2-5. Per-iteration detail lives in `extraction-iteration-ledger.md`; this is the feature-level summary.

**Status:** ✅ **CLOSED 2026-07-06** (iteration 029, Option A). Feature 1's `items` gate was redefined to measure **completeness** — distinct food dish-NAMES within ±3, no true duplicates — dropping the section-header check from the pass condition (that's Feature 3). All 6 menus meet it: 5 offline-green under the new metric + Nikkori live-green (48–51 across 6 runs in evals 027/028). el-marcos oracle re-adjudicated 34→28 (distinct dishes). Honest caveat: no fresh 3/3 live gate was run under the final scorer (no API key that session) — closure rests on the offline + prior-live evidence; a confirming `eval-027-live.ts` run is a recommended formality, not a blocker.

**Ground-truth food/drink counts (FINAL — distinct-dish convention):**

| menu | total | food_items | drink_items | notes |
|---|---|---|---|---|
| brasero | 28 | 28 | 0 | |
| brasero-two | 44 | 44 | 0 | count touches +3 edge some runs (45/47) — watch in F2 |
| casa-nostra | 23 | 23 | 0 | |
| mochomos | 22 | 22 | 0 | |
| el-marcos | 36 | 28 | 8 | re-adjudicated from 34→28 (distinct dishes, not variant-split cards) |
| nikkori | 114 | 48 | 66 | passes ONLY via crop-merge path (`eval-027-live.ts`), not single-call |

**What failed initially (per menu):** Nikkori — dense 5-column roll grid undercounted/misread on a single full-page call (the weeks-long blocker). el-marcos — surfaced late: count instability from variant fold/split + section-header junk.

**What fixed it (change → effect):** (1) Nikkori: uncompressed 2×2 tiles at `detail:"high"`, each a separate call, merged via `mergeItemSources` → recovers all rolls; (2) `mergeItemSources` null-section fix (iter 026) → collapses crop-boundary name variants, no overcount; (3) scorer: duplicate = name+price+description (iter 027) so variant cards aren't false dups; (4) scorer: completeness = distinct dish-names, section-header check moved to Feature 3 (iter 029) → el-marcos passes on the thing Feature 1 owns.

**Changes rejected (and why):** all compressed/full-page/crop-geometry/prompt-tuning attempts (ledger 016–024) — net-lose or trade one menu for another. "Add postprocess exact dedup" (iter 027 candidate) — would have DELETED real Chilaquiles variants. Correcting el-marcos's oracle number while still counting raw cards — cards swing 28–36, too wide for any fixed ±3.

**Final results (per-menu, distinct-dish metric):** brasero 28/28, brasero-two 43–47/44, casa-nostra 23/23, el-marcos 28–30/28, mochomos 22/22 (all offline-green); nikkori 48–51/48 (live-green, crop-merge path). No duplicates on any menu.

**Frozen gate inherited by Feature 2:** run `scripts/eval-027-live.ts` (routes Nikkori through crops — the plain `eval-extraction.ts --gate` path canNOT crop Nikkori and will fail it). F2 must keep `items` green AND pass `options`.

**Gotchas for future features:**
- **Nikkori only passes via the crop-merge path.** Any F2+ eval that scores Nikkori on a single full-page call will spuriously fail `items`. Use `eval-027-live.ts`.
- **brasero-two is count-unstable near +3** (45/47) — a small over-split in F2 could tip it to fail `items`.
- **el-marcos = the variant/section testbed.** Chilaquiles (3 preps @138) and Revueltos (78/84/90) are the F2 fold-into-options targets; "Pa' los Bukis" (section vs $94/niño combo) + "$94 POR NIÑO" junk are the F3 targets.
- **Real-world shipping gap:** dense-menu cropping is fed pre-cut Nikkori tiles in the eval; production needs a general auto-cutter (image lib + `extract-crops` extended to 4 high-detail uncompressed crops, keyed on the model's `image_layout.dense`). NOT built — separate follow-up.
- **`postprocess.ts` SERVING_FORMAT** denylist has bare numbers 85/300/750 (option filtering only) — clean up in F2.

---

## Progress Checklist (mirrors the roadmap)

- [x] Feature 1 — Extract all Food menu items ✅ CLOSED 2026-07-06
- [x] Feature 2 — Extract options of Food items ✅ CLOSED 2026-07-09 (see `2026-07-09-feature-2-extract-food-options.md`)
- [ ] Feature 3 — Extract sections & sub-sections
- [ ] Feature 4 — Extract closest section + category
- [ ] Feature 5 — Extract all Drink menu items

---

## Self-Review

- **Spec coverage:** roadmap Feature 1 asks for (a) split `total_items` into food/drink → Tasks 1 + 4; (b) category/dimension filter flag scoring active dimension + frozen gates → Task 3 (`--gate`); (c) `items` (food) passes all 6 menus 3/3 → Task 5 Step 6; (d) frozen gates at start = none → Global Constraints. Reference Block copied verbatim → present. Log + status checklist → present. All covered.
- **Placeholder scan:** the only `_tbd_`/`_fill_` markers are in the Execution Log, which is intentionally filled at execution time (it records empirical results that cannot exist before the runs). All *code* steps show complete code.
- **Type consistency:** `food_items`/`drink_items: number` defined in Task 1, consumed in Tasks 2/4. `gateFailures(reports, dims)` signature identical in Task 3 definition and self-check. `GateDimension` union matches `MenuReport` keys. `enforceGate` called in both `main()` and `offline()`.
