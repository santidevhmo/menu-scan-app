# USDA Macro Oracle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace unaided macro estimates with a USDA FoodData Central recipe oracle for the three-item Stage-2 benchmark.

**Architecture:** A benchmark-only Deno helper searches USDA FDC, fetches only human-approved FDC IDs, and deterministically sums per-100g macros by the reviewed edible grams. It freezes the source IDs, nutrient inputs, and totals in `macro-oracle.json`; the existing GPT benchmark then reads that local reference without a USDA request.

**Tech Stack:** Deno, TypeScript, USDA FoodData Central REST API, existing Deno assertions.

## Execution status — current executable plan

- Approved design: `docs/superpowers/specs/2026-08-07-usda-macro-oracle-design.md`.
- Prerequisite Stage-2 harness is complete (`58dfc1f`, `73efc15`, `6bd5752`, `f8ca5a2`).
- **NEXT:** Task 1, Step 1 — write the failing pure-calculator tests. No USDA API call or secret
  is needed for Task 1.
- Task 3 pauses for Santiago to approve every selected FDC ID, edible grams, and raw/cooked
  basis. Do not edit the oracle before that approval.
- The later GPT-4o baseline remains blocked until Task 4 completes and Santiago gives separate
  explicit approval for the <$0.05 paid calls.

## Global Constraints

- This plan supersedes the manual-nutrition-value portions of `2026-08-07-stage2-macro-benchmark.md` Tasks 2 and 5; its prompt/schema, scoring bands, raw GPT archive, mirror check, and paid-run rules remain unchanged.
- USDA FDC is the only nutrition source. Open Food Facts is out of scope.
- Use `USDA_FDC_API_KEY` from gitignored `.env.local`; never print, commit, or put the key in a command or log.
- All USDA calls are benchmark preparation only. The app and production enrichment pipeline make no USDA request.
- Search results are candidates, not truth. Santiago approves every selected FDC ID, grams value, and raw/cooked basis before `macro-oracle.json` changes.
- Preserve the three existing dish texts and their photo-verified fields. Do not alter any other fixture or oracle.
- The existing model baseline stays blocked until this oracle is complete, then still needs separate explicit approval for the <$0.05 GPT-4o calls.

---

## File Structure

| File | Responsibility |
|---|---|
| `scripts/usda-oracle.ts` | FDC candidate search, food-detail nutrient projection, deterministic recipe totals, and local oracle preparation CLI. |
| `scripts/usda-oracle_test.ts` | $0 tests for FDC response projection, recipe validation, and totals. |
| `scripts/fixtures/macro-oracle.json` | Human-reviewed recipe inputs plus frozen USDA nutrient values and calculated totals. |
| `scripts/bench-macros.ts` | Rejects an incomplete or internally inconsistent USDA oracle before a model request. |
| `scripts/bench-macros_test.ts` | Pins the runner’s completed-USDA-oracle requirement. |

### Task 1: Build the pure USDA recipe calculator ← NEXT

**Files:**
- Create: `scripts/usda-oracle.ts`
- Create: `scripts/usda-oracle_test.ts`

**Interfaces:**
- Produces `type UsdaRecipeIngredient = { name: string; fdc_id: number; grams: number; basis: "raw" | "cooked" | "prepared"; per_100g: MacroValues }`.
- Produces `sumRecipe(ingredients: UsdaRecipeIngredient[]): MacroValues`.
- Produces `validateRecipe(ingredients: UsdaRecipeIngredient[], totals: MacroValues): void`.

- [ ] **Step 1: Write the failing calculator tests**

```ts
const recipe = [{
  name: "chicken breast",
  fdc_id: 1,
  grams: 150,
  basis: "cooked" as const,
  per_100g: { calories: 165, protein_g: 31, carb_g: 0, fat_g: 3.6 },
}];

Deno.test("sumRecipe scales per-100g USDA values by edible grams", () => {
  assertEquals(sumRecipe(recipe), {
    calories: 247.5, protein_g: 46.5, carb_g: 0, fat_g: 5.4,
  });
});

Deno.test("validateRecipe rejects missing source data and mismatched totals", () => {
  assertThrows(() => validateRecipe([{ ...recipe[0], fdc_id: 0 }], recipe[0].per_100g));
  assertThrows(() => validateRecipe(recipe, { ...recipe[0].per_100g, calories: 999 }));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `deno test --allow-all scripts/usda-oracle_test.ts`

Expected: FAIL because `scripts/usda-oracle.ts` does not exist.

- [ ] **Step 3: Implement the smallest pure calculator**

```ts
export function sumRecipe(ingredients: UsdaRecipeIngredient[]): MacroValues {
  return ingredients.reduce((total, ingredient) => ({
    calories: total.calories + ingredient.per_100g.calories * ingredient.grams / 100,
    protein_g: total.protein_g + ingredient.per_100g.protein_g * ingredient.grams / 100,
    carb_g: total.carb_g + ingredient.per_100g.carb_g * ingredient.grams / 100,
    fat_g: total.fat_g + ingredient.per_100g.fat_g * ingredient.grams / 100,
  }), { calories: 0, protein_g: 0, carb_g: 0, fat_g: 0 });
}
```

`validateRecipe` must require a positive integer `fdc_id`, positive finite grams, a `raw`, `cooked`, or `prepared` basis, and finite non-negative values for all four `per_100g` fields. It compares totals with a `0.01` rounding tolerance.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `deno test --allow-all scripts/usda-oracle_test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/usda-oracle.ts scripts/usda-oracle_test.ts
git commit -m "feat: add deterministic USDA recipe macro calculator"
```

### Task 2: Add the benchmark-only FDC client

**Files:**
- Modify: `scripts/usda-oracle.ts`
- Modify: `scripts/usda-oracle_test.ts`

**Interfaces:**
- Produces `searchFoods(query: string, apiKey: string): Promise<{ fdc_id: number; description: string; data_type: string }[]>`.
- Produces `fetchNutrients(fdcId: number, apiKey: string): Promise<MacroValues>`.
- FDC requests use `GET /foods/search` for candidates and `GET /food/{fdcId}` for the approved record.
- The CLI commands are `deno run --allow-read --allow-env --allow-net scripts/usda-oracle.ts search "query"` and `deno run --allow-read --allow-write --allow-env --allow-net scripts/usda-oracle.ts prepare`.

- [ ] **Step 1: Write canned-response tests**

Use a canned food-detail response with `foodNutrients` entries named `Energy`, `Protein`, `Carbohydrate, by difference`, and `Total lipid (fat)`, each with an `amount` and unit. Assert `fetchNutrients` projects the four values only when energy is `kcal` and macros are `g`; assert it throws when any required nutrient is absent or has the wrong unit.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `deno test --allow-all scripts/usda-oracle_test.ts`

Expected: FAIL because the FDC projection and client functions are absent.

- [ ] **Step 3: Implement the client around the documented endpoints**

```ts
const baseUrl = "https://api.nal.usda.gov/fdc/v1";

const response = await fetch(
  `${baseUrl}/food/${fdcId}?api_key=${encodeURIComponent(apiKey)}`,
);
if (!response.ok) throw new Error(`USDA FDC request failed: ${response.status}`);
```

Keep API access in `scripts/usda-oracle.ts`. Make the response-to-nutrients projection a pure function so tests use canned data rather than the key or network. `searchFoods` returns only candidate FDC ID, description, and data type; it does not select a candidate.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `deno test --allow-all scripts/usda-oracle_test.ts`

Expected: PASS with no FDC request.

- [ ] **Step 5: Commit**

```bash
git add scripts/usda-oracle.ts scripts/usda-oracle_test.ts
git commit -m "feat: add USDA FDC candidate and nutrient lookup helpers"
```

### Task 3: Freeze reviewed USDA recipes in the oracle

**Files:**
- Modify: `scripts/fixtures/macro-oracle.json`
- Modify: `scripts/usda-oracle.ts`
- Modify: `scripts/usda-oracle_test.ts`

**Interfaces:**
- Each item gains a temporary top-level `recipe` array of `{ name, fdc_id, grams, basis }` before preparation; preparation consumes and removes it so the completed fixture has one recipe source in `oracle.ingredients`.
- Preparation replaces `oracle: null` with `{ calories, protein_g, carb_g, fat_g, assumed, source: "USDA FoodData Central", retrieved_at, ingredients: UsdaRecipeIngredient[] }`.

- [ ] **Step 1: Query candidates, then stop for review**

Run the helper’s search command separately for each menu ingredient, for example:

```bash
deno run --allow-read --allow-env --allow-net scripts/usda-oracle.ts search "grilled chicken breast"
```

Present candidates as `description | data_type | fdc_id`; do not edit the oracle or infer portions yet.

**Abort condition:** if no candidate represents the printed ingredient and stated raw/cooked basis, stop. Do not substitute a nearest dish-level food or a branded food not named on the menu.

- [ ] **Step 2: Obtain Santiago’s approval of every recipe row**

For each ingredient, show `ingredient name | selected FDC description and ID | edible grams | raw/cooked basis`. Wait for explicit approval. These choices are the human-owned part of the oracle.

- [ ] **Step 3: Add approved recipe inputs and prepare the oracle**

The CLI reads `USDA_FDC_API_KEY` only from `.env.local`, fetches the approved IDs, freezes the projected per-100g values with the recipe rows, calculates totals with `sumRecipe`, and writes the completed `oracle` object. It must preserve the photo-verified menu text exactly.

- [ ] **Step 4: Verify all three items are complete and deterministic**

```bash
deno run --allow-read --allow-write --allow-env --allow-net scripts/usda-oracle.ts prepare
deno test --allow-all scripts/usda-oracle_test.ts scripts/bench-macros_test.ts
deno eval 'const items=JSON.parse(Deno.readTextFileSync("scripts/fixtures/macro-oracle.json")); console.log(items.map((item: {name:string; oracle: unknown}) => [item.name, item.oracle ? "FILLED" : "EMPTY"]));'
```

Expected: all three report `FILLED`; the test suite makes no USDA request.

- [ ] **Step 5: Commit**

```bash
git add scripts/fixtures/macro-oracle.json scripts/usda-oracle.ts scripts/usda-oracle_test.ts
git commit -m "test: build the USDA-backed macro benchmark oracle"
```

### Task 4: Require a completed USDA oracle before benchmarking

**Files:**
- Modify: `scripts/bench-macros.ts`
- Modify: `scripts/bench-macros_test.ts`

**Interfaces:**
- `loadOracle(path)` requires `oracle.source === "USDA FoodData Central"`, a non-empty recipe ingredient list, and totals that pass `validateRecipe`.
- `bench-macros.ts` never imports the FDC client or accesses `USDA_FDC_API_KEY`.

- [ ] **Step 1: Write the failing runner test**

```ts
Deno.test("loadOracle rejects an unprovenanced or inconsistent oracle", () => {
  const completeEntry = {
    menu: "m", name: "n", description: "", price: null, category: "food",
    section_title: null, options: [], printed_weight: "",
    oracle: {
      calories: 165, protein_g: 31, carb_g: 0, fat_g: 3.6,
      assumed: "USDA FDC", source: "USDA FoodData Central",
      retrieved_at: "2026-08-07",
      ingredients: [{
        name: "chicken", fdc_id: 1, grams: 100, basis: "cooked",
        per_100g: { calories: 165, protein_g: 31, carb_g: 0, fat_g: 3.6 },
      }],
    },
  };
  Deno.writeTextFileSync(tmp, JSON.stringify([{
    ...completeEntry,
    oracle: { ...completeEntry.oracle, source: "other" },
  }]));
  assertThrows(() => loadOracle(tmp), Error, "USDA FoodData Central");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `deno test --allow-all scripts/bench-macros_test.ts`

Expected: FAIL because the existing loader accepts any non-null oracle.

- [ ] **Step 3: Implement the loader guard**

Import only `validateRecipe` and its types from `scripts/usda-oracle.ts`. Reject invalid provenance or an inconsistent frozen recipe before the runner can construct a model request. Do not add an FDC fetch or change the GPT-4o request body.

- [ ] **Step 4: Run the runner and full Deno suites**

```bash
deno test --allow-all scripts/bench-macros_test.ts
deno test --allow-all scripts/ supabase/
```

Expected: the focused suite passes; the full suite has only the existing `scripts/tile-cut_test.ts` image-dimension failure.

- [ ] **Step 5: Commit**

```bash
git add scripts/bench-macros.ts scripts/bench-macros_test.ts
git commit -m "test: require a USDA-backed macro oracle before benchmarking"
```

### Task 5: Run the paid Stage-2 baseline

This reuses Task 5 of `2026-08-07-stage2-macro-benchmark.md` unchanged after the completed USDA oracle passes Task 4.

- [ ] **Step 1: Get explicit paid-run approval**

Report: `3 GPT-4o benchmark draws + 1 deployed-edge mirror call; estimated total under $0.05. USDA preparation is complete and free.` Wait for Santiago’s explicit approval.

- [ ] **Step 2: Mirror the deployed enrich path**

Send the completed three items to the deployed `analyze-menu` function with `stage: "enrich"`, then compare its shape against one local harness draw: exactly three items, original order, all required fields, and non-empty `ingredients[]`. Archive the mirror request and response in `scripts/fixtures/caches/`.

- [ ] **Step 3: Run and archive three local draws**

```bash
BENCH_DRAWS=3 BENCH_RUN_ID=baseline-001 \
deno run --allow-read --allow-write --allow-env --allow-net scripts/bench-macros.ts
```

Expected: three raw responses at `scripts/fixtures/caches/macro-bench.baseline-001-d{0,1,2}.raw.json` and a per-item range table.

- [ ] **Step 4: Audit and append the result**

Read every raw response’s `ingredients[]` against the printed descriptions. Append the range, every failed field/draw, ingredient audit, Atwater self-consistency, draw dispersion, and confidence-label observations to `docs/superpowers/stage2-macro-benchmark.md`.

- [ ] **Step 5: Commit and report**

```bash
git add docs/superpowers/stage2-macro-benchmark.md \
  scripts/fixtures/caches/macro-bench.mirror-request.json \
  scripts/fixtures/caches/macro-bench.mirror-response.json \
  scripts/fixtures/caches/macro-bench.baseline-001-d0.raw.json \
  scripts/fixtures/caches/macro-bench.baseline-001-d1.raw.json \
  scripts/fixtures/caches/macro-bench.baseline-001-d2.raw.json
git commit -m "test: record the USDA-backed Stage-2 macro baseline"
```

Report the per-item range and complete failure list, never a single-draw quality claim.

## Self-Review

| Requirement | Covered by |
|---|---|
| USDA-only, benchmark-only source | Global Constraints; Tasks 2–4 |
| Human approval of selected records and portions | Task 3 steps 1–2 |
| Frozen ingredient provenance and deterministic totals | Tasks 1 and 3 |
| No key or network in unit tests or benchmark runner | Tasks 2 and 4 |
| Existing benchmark, mirror, raw archives, and paid approval | Task 5 |

The plan contains no runtime integration, no new dependency, no Open Food Facts use, and no unapproved GPT-4o call.
