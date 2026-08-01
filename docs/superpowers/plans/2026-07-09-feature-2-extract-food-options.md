# Feature 2 — Extract Options of Food Items — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Parent roadmap:** `docs/superpowers/plans/2026-07-04-ocr-extraction-master-roadmap.md`. Read its Strategy Rules before starting. Feature 1 close-out context: `docs/superpowers/plans/2026-07-04-feature-1-extract-food-items.md` (Execution Log + Gotchas) and ledger iterations 025–029.

**Goal:** Every food item with printed choices (protein/filling choices, paid add-ons, dietary swaps, flavor choices, and same-base-dish variant lines) carries those choices in `options[]`, on all 6 menus across 3 consecutive live runs, without regressing Feature 1's frozen `items` completeness gate.

**Architecture:** Two halves. (1) *Instrumentation* — widen the cumulative gate to `["items","options"]`, scope the options dimension to food items only (drinks are Feature 5), complete the per-menu option oracles under the fold-into-options convention (ORACLE-CHANGE, user-approved), and generalize the numeric serving-format tokens. Deterministic TDD. (2) *Iteration* — run the live gate, diagnose per-menu options failures, tune `extract.ts` P1 / `postprocess.ts`, loop until `options` + frozen `items` are green 3/3. Empirical; protocol, not pre-written edits.

**Tech Stack:** Deno, TypeScript, OpenAI GPT-4o Vision (`runExtraction` in `supabase/functions/analyze-menu/extract.ts`), fixture-driven eval harness (`scripts/eval-extraction.ts`, live runner `scripts/eval-027-live.ts`).

## Global Constraints

- **Scope: extraction JSON only. NO UI work.** (Roadmap.) Options of **food** items only — drink options (Té Manzanilla/Negro, Chocolate frío/caliente, Jugo flavors) are Feature 5's problem and must not fail this gate.
- **Working directory:** the worktree `/private/tmp/menu-scan-app-extraction-eval-harness` on branch `feat/extraction-eval-harness`. All code/harness/ledger commands run there. Plan/roadmap/diagram edits happen in the primary folder (`feat/selectable-options`) (`/Users/santiagoaguirre/Desktop/CODING/menu-scan-app`). If the worktree path is gone, recreate it: `git worktree add /private/tmp/menu-scan-app-extraction-eval-harness feat/extraction-eval-harness`.
- **Exit gate (cumulative, roadmap):** `options` passes on **ALL 6 menus** (`brasero`, `brasero-two`, `casa-nostra`, `el-marcos`, `mochomos`, `nikkori`) in **3 of 3 consecutive live runs**, **AND** Feature 1's `items` completeness check (distinct food dish-names ±3, no true duplicates) stays green in those same runs. A change that wins options but breaks `items` anywhere is **rejected outright**.
- **Run the gate ONLY via `scripts/eval-027-live.ts`** — it routes Nikkori through the validated uncompressed 2×2 `detail:"high"` crop-merge path. The plain `eval-extraction.ts --gate` is single-call and spuriously fails Nikkori.
- **Option semantics (the convention this feature implements — set at Feature 1 close, iter-029, superseding the 2026-07-03 separate-card semantics):** when the same base dish is printed several times with different fillings/proteins/preparations (Revueltos 78/84/90, Chilaquiles' 3 preps @138), return **ONE item named after the base dish with each printed variant in `options[]`**. A choice printed inside one priced row ("con X o Y", "Blanco o Integral") is also an `options[]` list. Serving formats/sizes (copa/botella, chico/grande) are NOT options. Distinct products under a shared heading are separate items, not options. P1 already states all of this; the feature makes it actually hold on real menus.
- **No menu-specific hardcoding** — no menu names, item names, or counts in production code (`extract.ts`, `postprocess.ts`, `adaptiveExtraction.ts`). The solution must generalize worldwide. (`DENSE_TILES` in the eval script is test-input routing only, already sanctioned.)
- **One hypothesis per paid run.** Live evals cost ≈$0.30/run (9–10 GPT-4o calls incl. 4 Nikkori tiles); the 3-run gate ≈$0.90. `OPENAI_API_KEY` must be set in the environment; never print or commit it.
- **Frozen model constraints:** GPT-4o Vision, `temperature: 0`, `seed: 17`, strict `json_schema`, model calls only inside the Edge Function code paths.
- **Ledger discipline:** every eval = one entry in the worktree's `docs/superpowers/extraction-iteration-ledger.md` (newest LAST, ≤15 lines, template at top; **next entry = iteration 030**), full detail in `extraction-eval-log.md`. Scorer/fixture changes need user approval and a `Verdict: ORACLE-CHANGE` entry.
- **Diagram discipline:** on feature close or any P1/P2/schema/flow change, update `docs/superpowers/diagrams/menu-extraction-pipeline.md` (status flags, notes, prompt appendix) in the main repo and re-copy to `~/Downloads/menu-extraction-pipeline.md`.
- **No new libraries. pnpm only for JS deps.**
- **Do-not-repeat (proven dead ends, ledger 001–024):** two-pass options extraction (iters 009/010); variant-folding prompt *additions* beyond the current P1 text (iter 002); nutrition-material option rule (iter 011); few-shot grid examples (iter 013); food-only prompting, compression/crop-geometry changes, full-page `detail` variants (016–024). Nikkori's item count is hypersensitive to any prompt addition (99–125 observed) — prefer postprocess/deterministic fixes over prompt prose when possible (iter-014 lesson).

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

> **Note for this feature:** the eval harness does **not** use the curl edge-function path — `eval-027-live.ts` calls `runExtraction` directly with `OPENAI_API_KEY`. The curl block is retained per the roadmap for manual/deployed testing only.

---

## Reference: current harness shape (so you don't have to re-read the files)

- `ExpectedFixture.items_with_options` (eval-extraction.ts:23-28): `{ name_contains: string; description_contains?: string; price?: number; options: string[] }[]`. Matching: `findOptionTargetIndex` (≈line 66) consumes extracted items one-to-one by normalized `name_contains` substring + optional `description_contains`/`price` filters.
- `optionRecall(fixture, items)` (≈line 92, exported): counts expected option strings found (substring match on option names) across matched targets. Reported metric, not part of `options.pass`.
- Options dimension (`scoreMenu`, ≈lines 194-219): `pass = missingOptionItems.length === 0 && falsePositiveOptions.length === 0`. A **missed target** = target not matched, OR matched item has zero options / lacks an expected option substring. A **false positive** = ANY extracted item with `options.length > 0` not consumed by a target. ⚠️ Currently scans **all** items (drinks included) — Task 2 fixes that.
- `gateFailures(reports, dims)` / `enforceGate` — from Feature 1. `eval-027-live.ts:127` has `GATE_DIMS = ["items"]` — Task 1 widens it (roadmap: mandatory, or frozen gates silently stop being checked).
- `postprocessItems` = `stripMenuNumbers → promoteSections → filterServingFormatOptions` (postprocess.ts:96). `SERVING_FORMAT` denylist (postprocess.ts:7) contains bare numbers `"750","300","85"` — Task 4 generalizes.
- ⚠️ **Known interaction, expect it in diagnosis:** `promoteSections` (postprocess.ts, iter-014) un-folds any `price===null` item whose options carry no serving-format token — each option becomes its own item. That is exactly the shape of a folded variant dish with per-variant prices (e.g. Revueltos → null price + options 78/84/90). If baseline shows folded dishes re-split into items, this rule is the first suspect; it must learn to distinguish a folded *section* (its target case, e.g. "Cerdo" → cuts) from a folded *variant dish* — generally, not by menu.
- Nikkori's eval path filters drinks **before** `mergeItemSources`, so its `actual.items` are food-only; other menus keep drinks in `actual.items`.
- `mergeItemSources` (src/lib/adaptiveExtraction.ts) merges duplicate crop items and unions their `options` (`mergeOptions`); null/empty `section_title` is merge-compatible (iter-026).
- Feature 1 `items` check (frozen): distinct food dish-names within ±3 of `food_items`, no true duplicates (same name+price+description). Section-header pseudo-items do NOT fail it (Feature 3's job).
- Fixture option targets today: brasero = Pasta Alfredo (Camarón/Pollo), Pasta Parmesano (Chorizo/Pollo/Camarón); brasero-two = Taco Loiro (picaña/pollo); casa-nostra = 3 gluten-free swaps; el-marcos = 4 targets in the **superseded 2026-07-03 split-card convention** (`name_contains: "Con jamón, chorizo o tocino"`); mochomos, nikkori = empty.

---

## Task 1: Option breakdown scorer — food-scoped, per-target diagnostics

> User requirement (2026-07-09): every test run must show, per menu, the fixture's expected option targets vs. what was extracted — which targets matched (and to which item, with its actual options), which missed, which partially matched, and which food items erroneously carry options — so misreads are visually diagnosable.

**Files:**
- Modify: `/private/tmp/menu-scan-app-extraction-eval-harness/scripts/eval-extraction.ts` (new `optionBreakdown` + `formatOptionBreakdown` exports after `optionRecall` ≈line 111; options block in `scoreMenu` ≈lines 194-219 refactored onto the breakdown; `offline()` prints the breakdown; `runSelfCheck` extended)
- Test: same file, `runSelfCheck()` via `--self-check`

**Interfaces:**
- Consumes: `findOptionTargetIndex`, `normalize`, `foodItems` (already computed at the top of `scoreMenu`).
- Produces:
  - `export function optionBreakdown(fixture: ExpectedFixture, items: ExtractedMenuItem[]): OptionBreakdown` where `OptionBreakdown = { targets: { target, matchedItem: string | null, matchedOptions: string[], missingOptions: string[] }[], falsePositives: { name: string, options: string[] }[] }`.
  - `export function formatOptionBreakdown(breakdown: OptionBreakdown): string[]` — human-readable lines (✓ / ~ / ✗ / ⚠ FALSE POSITIVE).
  - `MenuReport.options` scored over **food items only** via the same breakdown (drinks are Feature 5; a drink with options is neither a target nor a false positive).

- [ ] **Step 1: Write the failing self-checks (drink FP scoping + breakdown shape)**

In `runSelfCheck()`, immediately after the `foodPlusDrinks` assert (`"5 extra drink items must not break the food-only item count"`), add:

```ts
  const drinkWithOptions: ActualExtraction = {
    image_quality: { usable: true, issues: [] },
    items: [
      ...actual.items,
      {
        name: "Té",
        description: "",
        price: 32,
        category: "drink" as const,
        section_title: null,
        options: [
          { name: "Manzanilla", price: null, grams: null },
          { name: "Negro", price: null, grams: null },
        ],
      },
    ],
  };
  assert(
    scoreMenu(fixture, drinkWithOptions).options.pass,
    "a drink item with options must not fail the food-scoped options gate",
  );

  const breakdown = optionBreakdown(fixture, actual.items);
  assert(
    breakdown.targets.length === 2 &&
      breakdown.targets[0].matchedItem === "House Burger" &&
      breakdown.targets[0].matchedOptions.join(",") === "Add Cheese" &&
      breakdown.targets[0].missingOptions.length === 0,
    "breakdown reports the matched item and its actual options",
  );
  assert(
    breakdown.falsePositives.length === 0,
    "consumed targets are not false positives",
  );
  const missedBreakdown = optionBreakdown(fixture, [
    { ...actual.items[0], options: [] },
    actual.items[1],
  ]);
  assert(
    missedBreakdown.targets[0].matchedItem === "House Burger" &&
      missedBreakdown.targets[0].matchedOptions.length === 0 &&
      missedBreakdown.targets[0].missingOptions.join(",") === "Cheese",
    "breakdown reports a matched item extracted with no options",
  );
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `deno run --allow-read --allow-write --allow-env --allow-net scripts/eval-extraction.ts --self-check`
Expected: FAIL — TypeScript error, `optionBreakdown` is not defined (and the drink-FP assert would fail at runtime under current all-items scoring).

- [ ] **Step 3: Implement `optionBreakdown` + `formatOptionBreakdown`, refactor `scoreMenu` onto them**

Directly after `optionRecall`, add:

```ts
export interface OptionBreakdown {
  targets: {
    target: ExpectedFixture["items_with_options"][number];
    matchedItem: string | null;
    matchedOptions: string[];
    missingOptions: string[];
  }[];
  falsePositives: { name: string; options: string[] }[];
}

export function optionBreakdown(
  fixture: ExpectedFixture,
  items: ExtractedMenuItem[],
): OptionBreakdown {
  const consumed = new Set<number>();
  const targets = fixture.items_with_options.map((target) => {
    const index = findOptionTargetIndex(target, items, consumed);
    if (index === undefined) {
      return {
        target,
        matchedItem: null,
        matchedOptions: [],
        missingOptions: target.options,
      };
    }
    consumed.add(index);
    const item = items[index];
    const names = item.options.map((option) => option.name);
    const missingOptions = target.options.filter((expected) =>
      !names.some((name) => normalize(name).includes(normalize(expected)))
    );
    return { target, matchedItem: item.name, matchedOptions: names, missingOptions };
  });
  const falsePositives = items
    .filter((item, index) => item.options.length > 0 && !consumed.has(index))
    .map((item) => ({
      name: item.name,
      options: item.options.map((option) => option.name),
    }));
  return { targets, falsePositives };
}

export function formatOptionBreakdown(breakdown: OptionBreakdown): string[] {
  const lines: string[] = [];
  for (const entry of breakdown.targets) {
    const want =
      `"${entry.target.name_contains}" wants [${entry.target.options.join(", ")}]`;
    if (entry.matchedItem === null) {
      lines.push(`    ✗ ${want} → no matching item extracted`);
    } else if (entry.matchedOptions.length === 0) {
      lines.push(`    ✗ ${want} → "${entry.matchedItem}" extracted with NO options`);
    } else if (entry.missingOptions.length > 0) {
      lines.push(
        `    ~ ${want} → "${entry.matchedItem}" has [${entry.matchedOptions.join(", ")}]; missing [${entry.missingOptions.join(", ")}]`,
      );
    } else {
      lines.push(`    ✓ ${want} → "${entry.matchedItem}" has [${entry.matchedOptions.join(", ")}]`);
    }
  }
  for (const fp of breakdown.falsePositives) {
    lines.push(`    ⚠ FALSE POSITIVE "${fp.name}" has [${fp.options.join(", ")}]`);
  }
  return lines;
}
```

Then replace the options block in `scoreMenu` (from `const expectedOptionItems = fixture.items_with_options;` through the `const options = {...};` assignment) with:

```ts
  const optionsBreakdown = optionBreakdown(fixture, foodItems);
  const missingOptionItems = optionsBreakdown.targets.filter((entry) =>
    entry.matchedItem === null ||
    entry.matchedOptions.length === 0 ||
    entry.missingOptions.length > 0
  );
  const options = {
    pass: missingOptionItems.length === 0 &&
      optionsBreakdown.falsePositives.length === 0,
    detail:
      `missed targets: ${missingOptionItems.length}; false-positive items: ${optionsBreakdown.falsePositives.length}`,
  };
```

(`findOptionTargetIndex` and the consumed-set semantics are unchanged — one matcher, now shared by scoring and reporting. Passing `foodItems` instead of `actual.items` is the food-scoping.)

- [ ] **Step 4: Print the breakdown in `offline()`**

In `offline()`, after the `option recall` console.log, add:

```ts
    for (
      const line of formatOptionBreakdown(
        optionBreakdown(
          fixture,
          processed.filter((item) => item.category !== "drink"),
        ),
      )
    ) console.log(line);
```

- [ ] **Step 5: Run the self-check to verify it passes**

Run: `deno run --allow-read --allow-write --allow-env --allow-net scripts/eval-extraction.ts --self-check`
Expected: PASS — `Self-check passed`. The existing `failing.options.pass` assert still fails correctly because the "Mains" pseudo-item with options has `category: "other"` (food-scoped), and the "Fries" target consumes its item as before.

- [ ] **Step 6: Commit + ledger note**

```bash
git add scripts/eval-extraction.ts
git commit -m "feat(eval): food-scoped option breakdown scorer with per-target diagnostics"
```

Add a short ledger entry (Verdict: ORACLE-CHANGE — scorer scope change, sanctioned verbatim by the roadmap's Feature 2 "food items only" line; note user approval of this plan covers it).

---

## Task 2: Widen the cumulative gate + per-menu option breakdown in the live runner

**Files:**
- Modify: `/private/tmp/menu-scan-app-extraction-eval-harness/scripts/eval-027-live.ts` (imports ≈line 21; per-menu loop ≈lines 104-120; `GATE_DIMS` ≈line 127)

**Interfaces:**
- Consumes: `scoreMenu`, `gateFailures`, `optionRecall`, `optionBreakdown`, `formatOptionBreakdown` from `./eval-extraction.ts` (Task 1).
- Produces: per-run gate = `["items","options"]`; per-menu console lines for BOTH dimensions, `optionRecall found/expected`, and the full ✓/~/✗/⚠ target breakdown; failing menus dump `<menu>.eval027-r<run>.actual.json` when **either** dimension fails. Zero extra API cost.

- [ ] **Step 1: Widen `GATE_DIMS` and import the breakdown helpers**

In `scripts/eval-027-live.ts` change line 21 to:

```ts
import {
  formatOptionBreakdown,
  gateFailures,
  optionBreakdown,
  optionRecall,
  scoreMenu,
} from "./eval-extraction.ts";
```

and line 127 to:

```ts
  const GATE_DIMS = ["items", "options"] as const;
```

- [ ] **Step 2: Print the options line + breakdown and widen the failure dump**

Replace the per-menu block (currently lines 108-119, from `const dups = duplicateNames(actual.items);` through the closing `}` of the `if (!report.items.pass)` dump) with:

```ts
    const dups = duplicateNames(actual.items);
    console.log(
      `  ${report.items.pass ? "PASS" : "FAIL"} ${fixture.menu} items: ${report.items.detail}${
        dups.length ? ` [dups: ${dups.join("; ")}]` : ""
      }`,
    );
    const foodOnly = actual.items.filter((item) => item.category !== "drink");
    const recall = optionRecall(fixture, foodOnly);
    console.log(
      `  ${report.options.pass ? "PASS" : "FAIL"} ${fixture.menu} options: ${report.options.detail}; recall ${recall.found}/${recall.expected}`,
    );
    for (const line of formatOptionBreakdown(optionBreakdown(fixture, foodOnly))) {
      console.log(line);
    }
    if (!report.items.pass || !report.options.pass) {
      await Deno.writeTextFile(
        `${MENU_DIR}/${fixture.menu}.eval027-r${run}.actual.json`,
        `${JSON.stringify(actual, null, 2)}\n`,
      );
    }
```

- [ ] **Step 3: Type-check (no live run)**

Run (from the worktree): `deno check scripts/eval-027-live.ts`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add scripts/eval-027-live.ts
git commit -m "feat(eval): widen live gate to items+options, print per-target option breakdown"
```

---

## Task 3: Re-adjudicate the option oracles (fold convention, complete per menu) — USER APPROVAL REQUIRED

> **Why completeness matters:** the gate's false-positive check fails ANY food item with options that isn't in the fixture. An incomplete oracle therefore punishes *correct* extractions (e.g. Machaca "Con huevo o verdura" is printed on el-marcos but absent from today's fixture). Every printed food choice on each menu must be either a target or deliberately excluded — decided with the user, per menu.

**Files:**
- Modify: `/private/tmp/menu-scan-app-extraction-eval-harness/scripts/fixtures/{brasero,brasero-two,casa-nostra,el-marcos,mochomos,nikkori}.expected.json` (`items_with_options` arrays only — do NOT touch `food_items`/`total_items`/`sections`)
- Photos: `/Users/santiagoaguirre/Downloads/MenusTesting/{BraseroMenu,BraseroMenuTwo,CasaNostraMenu,ElMarcosMenu,MochomosMenu,NikkoriMenu}.png`

**Interfaces:**
- Produces: per-menu `items_with_options` that are (a) in the **fold convention** (targets named by base dish), (b) **complete** (every printed food choice covered), (c) food-only. Tasks 5-7 score against these.

- [ ] **Step 1: Draft the el-marcos target list from the photo (seed below), then verify each line against `ElMarcosMenu.png`**

Seed (read from the photo 2026-07-09 — verify, don't trust blindly). Option strings are substring-matched against extracted option names, so keep them short and distinctive:

```json
"items_with_options": [
  { "name_contains": "Revueltos", "options": ["naturales", "mexicana", "jamón"] },
  { "name_contains": "Fritos", "options": ["naturales", "jamón"] },
  { "name_contains": "Chilaquiles", "options": ["Tradicionales", "Regionales", "Divorciados"] },
  { "name_contains": "Machaca", "description_contains": "huevo", "options": ["huevo", "verdura"] },
  { "name_contains": "Enchiladas", "options": ["Verdes", "Rojas", "Suizas"] },
  { "name_contains": "Pan Tostado", "options": ["Blanco", "Integral"] },
  { "name_contains": "Hot Cakes", "options": ["Naturales", "jamón"] },
  { "name_contains": "Waffles", "options": ["plátano", "frutos rojos"] },
  { "name_contains": "Plato Surtido", "options": ["queso cottage", "yogurth"] },
  { "name_contains": "Avena", "options": ["Manzana", "Plátano"] },
  { "name_contains": "Machaca de Marlín", "options": ["huevo", "verdura"] }
]
```

Known judgment calls to settle with the user in Step 3: (a) "Machaca" (MEXICANOS) vs "Machaca de Marlín" (DE LA PLAYA) — `findOptionTargetIndex` uses substring matching, so order the more specific target FIRST or disambiguate via `description_contains`/`price`; (b) Revueltos/Fritos @90's inner "jamón, chorizo o tocino" choice is nested — the flat schema keeps it inside the variant option's name text; the target string `"jamón"` matches either representation; (c) Pa' los Bukis stays description-only (Feature 3 owns the section-vs-item question); (d) drink choices (Té, Chocolate, Jugo, Leche) are EXCLUDED — Task 2 makes them invisible to the gate.

- [ ] **Step 2: Review the other five photos the same way**

For each of `BraseroMenu.png`, `BraseroMenuTwo.png`, `CasaNostraMenu.png`, `MochomosMenu.png`, `NikkoriMenu.png`: list every printed food choice; diff against the fixture's current targets; keep existing targets that survive (brasero pastas, Taco Loiro, casa-nostra gluten-free swaps — re-express in fold convention only if the photo shows variant lines rather than inline choices); confirm mochomos and nikkori genuinely have zero food-item choices (expected: yes — rolls and steaks carry no printed choices; nikkori's serving-format lists are wine/sake = drinks).

- [ ] **Step 3: Present the full six-menu target table to the user for approval**

Show per menu: proposed targets, what changed vs the old fixture, and each judgment call. **Do not edit fixtures before approval.** This supersedes the 2026-07-03 el-marcos split-card targets — say so explicitly.

- [ ] **Step 4: Apply the approved targets to the six fixture files**

Edit only `items_with_options`. Then verify the harness still loads and self-checks:

Run: `deno run --allow-read --allow-write --allow-env --allow-net scripts/eval-extraction.ts --self-check`
Expected: PASS.

- [ ] **Step 5: Commit + ledger ORACLE-CHANGE entry**

```bash
git add scripts/fixtures/*.expected.json
git commit -m "feat(eval): re-adjudicate option oracles to fold convention, complete per menu"
```

Ledger entry (Verdict: ORACLE-CHANGE): one line per menu on what changed and the user's approval date.

---

## Task 4: Generalize the numeric serving-format tokens (F1 handoff item)

> Feature 1's log flagged the bare numbers `"750","300","85"` in `SERVING_FORMAT` as menu-specific residue. Deleting them outright would re-open wine false positives ("Copa 85" passes `isServingFormat` only because every token is in the set). The general fix: treat any pure-number token as a serving-format token.

**Files:**
- Modify: `/private/tmp/menu-scan-app-extraction-eval-harness/supabase/functions/analyze-menu/postprocess.ts` (`SERVING_FORMAT` set line 7; `isServingFormat` ≈line 33; `hasServingFormatToken` ≈line 44; self-check block under `import.meta.main`)
- Test: the file's own `import.meta.main` self-check

- [ ] **Step 1: Write the failing self-check**

In the `import.meta.main` self-check block at the bottom of `postprocess.ts`, add asserts (match the existing assert style in that block):

```ts
// Numeric tokens are serving-format generally, not via a hardcoded list.
console.assert(isServingFormat("Copa 85"), "copa + number is serving format");
console.assert(isServingFormat("450"), "bare number is serving format");
console.assert(
  !isServingFormat("2 Chicken Breasts"),
  "number + dish words is NOT serving format",
);
```

If `isServingFormat` is not visible to the self-check block (it is module-private but the block lives in the same file — it is visible), keep the asserts as written.

- [ ] **Step 2: Run it to confirm the bare-number case fails**

Run: `deno run supabase/functions/analyze-menu/postprocess.ts`
Expected: the `"450"` assert fails (450 is not in the denylist), the others pass.

- [ ] **Step 3: Replace the bare-number entries with a numeric-token rule**

Remove `"750"`, `"300"`, `"85"` from `SERVING_FORMAT`. Add above `isServingFormat`:

```ts
// Pure numbers in an option name are prices/volumes (Copa 85, 750), never a
// dish choice — general rule replacing the old hardcoded 85/300/750 entries.
const NUMERIC_TOKEN = /^\d+(?:[.,]\d+)?$/;

function isFormatToken(token: string): boolean {
  return SERVING_FORMAT.has(token) || NUMERIC_TOKEN.test(token);
}
```

Then use it in both predicates:

```ts
function isServingFormat(name: string): boolean {
  const normalized = name.toLocaleLowerCase().trim();
  return isFormatToken(normalized) ||
    normalized.split(/\s+/).every((word) => isFormatToken(word));
}
```

```ts
function hasServingFormatToken(name: string): boolean {
  return name.toLocaleLowerCase().split(/[^a-z0-9/.,]+/).filter(Boolean)
    .some((token) => isFormatToken(token));
}
```

- [ ] **Step 4: Run the self-check to verify it passes**

Run: `deno run supabase/functions/analyze-menu/postprocess.ts`
Expected: all asserts pass (existing ones included — `"copa"`, `"1/2"` etc. still match via the set).

- [ ] **Step 5: Run the harness self-check for collateral**

Run: `deno run --allow-read --allow-write --allow-env --allow-net scripts/eval-extraction.ts --self-check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/analyze-menu/postprocess.ts
git commit -m "refactor(postprocess): replace hardcoded price numbers with numeric-token rule"
```

---

## Task 5: Free offline pre-baseline, then paid live baseline + per-menu diagnosis

**Files:**
- Read: archived `<menu>.actual.json` / `<menu>.eval027-r*.actual.json` in `/Users/santiagoaguirre/Downloads/MenusTesting/`
- Log: worktree `docs/superpowers/extraction-iteration-ledger.md` (iteration 030), `extraction-eval-log.md`

**Interfaces:**
- Consumes: Tasks 1-4 (widened gate, food-scoped scorer, approved oracles, numeric-token rule).
- Produces: a per-menu failure-mode table that Task 6's iterations target.

- [ ] **Step 1: Offline re-score the newest archives ($0)**

Run: `deno run --allow-read --allow-write --allow-env --allow-net scripts/eval-extraction.ts --offline /Users/santiagoaguirre/Downloads/MenusTesting`
Read only the `options` lines + recall. ⚠️ Nikkori's archived `nikkori.actual.json` is a STALE full-page run — ignore its `items` result entirely (F1 gotcha); its options line is indicative only. This is a cheap preview of which menus already pass under the new oracles, not a gate.

- [ ] **Step 2: Live baseline run (~$0.30, one run)**

Temporarily set `RUNS = 1` in `eval-027-live.ts` for the baseline (restore to 3 before the exit-gate attempt), then:

```bash
OPENAI_API_KEY=... deno run --allow-read --allow-write --allow-env --allow-net scripts/eval-027-live.ts
```

Record every per-menu items+options line in the ledger (iteration 030).

- [ ] **Step 3: Diagnose each failing menu from its dumped actual.json**

For every options FAIL, classify against the photo:
- **Missed target — not folded:** variant dish emitted as N split cards instead of one item + options (Revueltos/Chilaquiles pattern). Check FIRST whether `promoteSections` un-folded it (parent price null + dish-word options → promote fires; see Reference). If the dump shows split cards *and* the raw model response folded them, the bug is postprocess, not the prompt.
- **Missed target — choice left in prose:** "con X o Y" stayed in `description` with empty `options`.
- **Missed target — item not matched:** target name/price filter doesn't match how the model names the item (fix may be the fixture matcher fields, with user approval — not the prompt).
- **False positive:** options fabricated on a non-target food item (ingredient lists joined by "y", serving formats that escaped the filter, folded sections that should be separate items).
Write the failure mode per menu to the ledger before touching anything.

---

## Task 6: Iterate until the `items`+`options` gate passes on all 6 menus

**Files (as diagnosis dictates):**
- Modify: `supabase/functions/analyze-menu/extract.ts` (P1 prompt/schema) and/or `supabase/functions/analyze-menu/postprocess.ts` (deterministic rules) — worktree copies
- Log: ledger (iterations 031+) + eval log, one entry per paid run

**Protocol (repeat until GATE PASS on a single run):**

- [ ] **Step 1: ONE targeted change per iteration** — the smallest edit addressing one diagnosed failure mode. Prefer deterministic postprocess fixes over prompt prose (iter-012/013/014 lesson: prompt additions leak across menus; Nikkori item count is hypersensitive). Log hypothesis + exact change to the ledger BEFORE running.
- [ ] **Step 2: Re-run** `OPENAI_API_KEY=... deno run --allow-read --allow-write --allow-env --allow-net scripts/eval-027-live.ts` (RUNS=1 while iterating).
- [ ] **Step 3: Regression guard** — if the change wins options somewhere but breaks `items` anywhere (watch brasero-two's +3 edge and el-marcos distinct-name count) or breaks options on a previously-passing menu, REVERT it outright and record the lesson. Dimension-trading is the failure this roadmap exists to prevent.
- [ ] **Step 4: If P1 or the schema changed in an ACCEPTED iteration**, update the pipeline diagram's prompt appendix (main repo) + re-copy to `~/Downloads` (Diagram discipline) — do this when the change is accepted, not at feature close.
- [ ] **Step 5: Commit each accepted iteration**

```bash
git add supabase/functions/analyze-menu/extract.ts supabase/functions/analyze-menu/postprocess.ts docs/superpowers/extraction-iteration-ledger.md docs/superpowers/extraction-eval-log.md
git commit -m "feat(extract): iteration NNN — <one-line hypothesis> (options gate)"
```

---

## Task 7: Exit gate — 3 consecutive live runs, all green

- [ ] **Step 1: Restore `RUNS = 3`** in `eval-027-live.ts` (if changed for iteration), commit if dirty.

- [ ] **Step 2: Run the full gate, no code changes between runs (~$0.90)**

```bash
OPENAI_API_KEY=... deno run --allow-read --allow-write --allow-env --allow-net scripts/eval-027-live.ts
```

Expected: `GATE PASS: items, options on all 6 menus` in ALL 3 runs and exit code 0. Any FAIL on any menu in any run → the feature is NOT closed; return to Task 6 (the fix must hold with margin, not ±1 luck). Record all 3 runs' per-menu lines in `extraction-eval-log.md` + a ledger entry.

- [ ] **Step 3: Commit the passing state**

```bash
git add -A supabase/functions/analyze-menu scripts docs/superpowers
git commit -m "feat(extract): options extraction passes items+options gate 3/3 on all menus"
```

---

## Task 8: Close out Feature 2 — freeze the gate, log, diagram, checklists, key hygiene

> Run these edits in the **main repo checkout** (`/Users/santiagoaguirre/Desktop/CODING/menu-scan-app`); the worktree holds only code/ledger commits.

- [ ] **Step 1: Fill the Feature 2 Execution Log (below)** — initial failures per menu, accepted/rejected changes (with why), final 3/3 per-menu results, gotchas for Features 3-5, and the frozen-gate command Feature 3 inherits: `eval-027-live.ts` with `GATE_DIMS = ["items", "options", "section_context"]`.

- [ ] **Step 2: Tick both checklists** — Feature 2 in this plan's checklist below AND in the roadmap's Progress Checklist.

- [ ] **Step 3: Diagram discipline** — update `docs/superpowers/diagrams/menu-extraction-pipeline.md`: flip the options row of the Status table to 🟢 CLOSED, update the STAGE 1 sequence note (Feature 1+2 closed, gate = items+options), refresh the P1 appendix if the prompt changed, bump "Last updated", then:

```bash
cp docs/superpowers/diagrams/menu-extraction-pipeline.md ~/Downloads/menu-extraction-pipeline.md
```

- [ ] **Step 4: Commit (main repo)**

```bash
git add docs/superpowers/plans/2026-07-09-feature-2-extract-food-options.md docs/superpowers/plans/2026-07-04-ocr-extraction-master-roadmap.md docs/superpowers/diagrams/menu-extraction-pipeline.md
git commit -m "docs: close Feature 2 (food options) — log, freeze options gate, diagram"
```

- [ ] **Step 5: Key hygiene** — remind the user to revoke any OpenAI API key pasted into chat or exposed during the live evals.

---

## Feature 2 Execution Log

> Fill during Tasks 5-8. This is the durable record Features 3-5 read. Per-iteration detail lives in the worktree ledger; this is the feature-level summary.

**Status:** ✅ **CLOSED 2026-07-09** (eval 038: 3/3 consecutive live `GATE PASS: items, options` on all 6 menus; ledger iterations 030–038).

**Convention locked (user, 2026-07-09, DoorDash/POS-aligned):** one item per base dish; the BASE variant lives on the item card; alternative variants, printed choices, and paid add-ons attach as `options[]` with their printed prices; options NEVER become new items. Supersedes the 2026-07-03 split-card semantics.

**What failed initially (baseline eval 030):** el-marcos recall 4/20 (inline "con X o Y" choices left in descriptions; Revueltos/Fritos split into same-name cards flagged as FPs), brasero-two 0/3 (Taco Loiro "A elegir" line dropped by the model; Churrasquería block shredded; Feijoada FP "Tortillas a elegir").

**What fixed it (change → effect, all in worktree `feat/extraction-eval-harness`):**
1. `foldVariantCards()` (postprocess, iter 031) — same-name/category cards fold into base + priced options; price-differs guard prevents OCR-double-read FPs (Nico roll).
2. `extractInlineChoices()` (postprocess, iter 033) — deterministic parser for printed "con X o Y"/"A elegir:"/parenthesized alternatives; ≤3-word guard aborts sentence-level "o"; solved ALL el-marcos inline targets.
3. Option filters (iters 034/036/037, all TDD): unenumerated choice mentions ("Tortillas a elegir"), per-unit price notes ("C/U"), pure weight tokens ("650gr") are not options.
4. Per-page calls for multi-photo menus (iter 036, eval runner) — the proven dense-tile recipe at page granularity recovered Taco Loiro's dropped "A elegir" line. ⚠️ Production wiring pending (see gotchas).
5. Scorer: accent-insensitive matching; `optionBreakdown` per-target ✓/~/✗/⚠ diagnostics; options dimension food-scoped.

**Changes rejected (and why):** iter 032 — P1 prose-choice rule rewrite: recall unchanged AND brasero-two items 45→38 (dimension trade; GPT-4o ignores prose-choice instructions in this regime — do NOT retry). Iter 035 — `detail:"high"` for non-dense pages: no recovery of dropped print, ~2× image cost, reverted.

**Oracle rulings (user, 2026-07-09):** Taco Loiro → [pollo] (picaña extracted with right price under stable misread "arrachera" — F1 misread-tolerance policy); Revueltos → [jamón] (the @84 mexicana line is dropped by the model ~2/3 runs — vision nondeterminism); Churrasquería target removed → deferred to Feature 3 (it is a SECTION with entries incl. "Pídelo con Queso" @10 — block-level add-on attachment is section semantics, same bucket as Pa' los Bukis).

**Final results (per-menu, 3/3 runs, eval 038):** brasero 28/28 + recall 5/5; brasero-two 47/44 + 1/1; casa-nostra 23/23 + 3/3; el-marcos 28–30/28 + 19/19; mochomos 22/22; nikkori 49–50/48 (crop-merge path). 0 duplicates, 0 option FPs, 0 missed targets in every run.

**Frozen gate inherited by Feature 3:** `eval-027-live.ts` with `GATE_DIMS = ["items", "options", "section_context"]` (widen when F3 starts).

**Gotchas for future features:**
- **Production wiring gap (like the dense auto-cutter):** the per-page multi-photo recipe and the crop path's `detail:"high"` live in the eval runner; the production `extract` stage still sends all photos in one call. Wire per-page + merge into the Edge Function keyed on photo count (general), not menu id.
- **F3 inherits:** Churrasquería block-add-on attachment ("Pídelo con Queso" → section's items), "Pa' los Bukis" section-vs-item, el-marcos stray section-header pseudo-item (1 in some runs).
- **Known tolerated vision limits (ledger 035–037):** picaña→arrachera word substitution in tiny italic print; Revueltos @84 line dropped ~2/3 runs; 60gr→650gr digit misreads in grid weights. A name/weight-verification pass would be new scope.
- **brasero-two now runs 47/44 (+3 edge) under per-page calls** — F3 changes that increase card counts can tip it; watch it like F1 watched 45/47.
- **DoorDash research** (see roadmap "Prior art" section): full pipeline comparison + adoption list; PDFs in ~/Downloads.

---

## Progress Checklist (mirrors the roadmap)

- [x] Feature 1 — Extract all Food menu items ✅ CLOSED 2026-07-06
- [x] Feature 2 — Extract options of Food items ✅ CLOSED 2026-07-09
- [ ] Feature 3 — Extract sections & sub-sections
- [ ] Feature 4 — Extract closest section + category
- [ ] Feature 5 — Extract all Drink menu items

---

## Self-Review

- **Spec coverage:** roadmap Feature 2 asks for (a) scoped dimension `options` pass + `optionRecall`, food only → Tasks 1-2; (b) reuse `items_with_options` fixtures → Task 3 (re-adjudicated to the iter-029 fold convention with user approval — the 2026-07-03 el-marcos targets predate it); (c) frozen Feature 1 gate in the same runs → Task 1 `GATE_DIMS` + Task 6 regression guard; (d) exit gate 3/3 via `eval-027-live.ts` → Task 7; (e) F1 handoff SERVING_FORMAT cleanup → Task 4; (f) Reference Block verbatim, ledger + diagram discipline, key revocation → present.
- **Placeholder scan:** the only `_fill_` markers are in the Execution Log (filled at execution time, matching Feature 1's pattern). All code steps show complete code.
- **Type consistency:** `foodItems` reuses the existing binding in `scoreMenu`; `optionRecall(fixture, items)` signature matches its export; `isFormatToken` used by both postprocess predicates; `GATE_DIMS` widening matches `GateDimension` union from Feature 1.
