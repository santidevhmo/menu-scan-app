# Feature 4 — Closest Section + Category (+ option-price & grams checks) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Parent roadmap:** `docs/superpowers/plans/2026-07-04-ocr-extraction-master-roadmap.md`. Read its Strategy Rules before starting. Feature 1/2/3 close-out context: `2026-07-04-feature-1-extract-food-items.md`, `2026-07-09-feature-2-extract-food-options.md`, `2026-07-10-feature-3-extract-sections.md` (Execution Logs + Gotchas) and worktree ledger iterations 030–044.

**Goal:** every extracted item carries the correct coarse category (food/side/dessert), matched options carry the correct printed price and grams, and printed item weights land in a new structured `items[].grams` field — gated 3/3 live on all 6 menus with Features 1–3 staying green in the same runs.

**Architecture:** scorer + fixture extensions in the eval harness, plus ONE deterministic postprocess stage (`parseItemGrams`) that fills `items[].grams` from printed-weight text conventions. The strict `EXTRACT_SCHEMA` sent to GPT-4o and prompt P1 are NOT touched — the model never sees the new field; postprocess fills it (the lever class that won Features 2 and 3).

**Tech Stack:** Deno / TypeScript (worktree `/private/tmp/menu-scan-app-extraction-eval-harness`, branch `feat/extraction-eval-harness`). Live evals: GPT-4o Vision via `runExtraction`, ~$0.35/full-gate run, needs `OPENAI_API_KEY`.

## Global Constraints

- **One feature only:** categories + option-price/grams + item grams. Do NOT iterate on drinks (F5) or re-litigate frozen semantics of items/options/section_context.
- **Cumulative gate:** every live run re-checks frozen dims. `GATE_DIMS` in `scripts/eval-027-live.ts` MUST be widened FIRST (Task 1) — forget it and runs print `GATE PASS` while never re-checking frozen gates.
- **Exit gate:** `categories` + `grams` + value-checked `options` pass on all 6 menus in 3/3 consecutive live runs of `scripts/eval-027-live.ts`, AND `items`/`options`/`section_context` stay green in those same runs.
- **Run the gate via `scripts/eval-027-live.ts`, NOT `eval-extraction.ts --gate`** — only it routes nikkori through the crop-merge path (single full-page calls spuriously fail it).
- **Never hardcode menu-specific values or counts** — solutions must generalize to menus worldwide (OCR generalization memory).
- **Lever preference order:** fixture/oracle corrections (user-approved) → scorer semantics → deterministic postprocess. P1/P2/schema-to-model edits are a LAST resort (iter 032's P1 edit traded dimensions and was reverted; F3 closed with zero prompt edits).
- **Oracle changes require explicit user approval** (ORACLE-CHANGE discipline). Task 6 is a HARD user checkpoint before any live run.
- **Ledger discipline:** every iteration logs to `docs/superpowers/extraction-iteration-ledger.md` (worktree), newest last.
- **Offline caveat:** `eval-extraction.ts --offline` re-postprocesses already-postprocessed dumps — verdicts unreliable for multi-call menus (nikkori, brasero-two). Trust unit self-checks + live runs for fold/merge levers; offline is faithful only for single-call menus.
- **Diagram discipline on close:** update `docs/superpowers/diagrams/menu-extraction-pipeline.md` (status flags, notes, postprocess chain, schema note) and re-copy to `~/Downloads/menu-extraction-pipeline.md`.
- **Known frozen-dim tripwires:** brasero-two runs 47/44 (+3 items edge); el-marcos Revueltos' "@84 mexicana" line is dropped by the model ~2/3 runs (when dropped, the jamón option comes back priced 84 instead of the printed 90 — this WILL hit the new price check; expect an iteration/oracle ruling); brasero-two grid weights suffer 60gr→650gr digit misreads (stable-misread policy may apply to grams pins).

---

## User decisions locked at kickoff (2026-07-10)

1. **Grams:** add structured `items[].grams` — filled by a deterministic postprocess parser from printed text conventions ("600g", "70 gr.", "1kg"; ml/L/oz are volumes, NOT grams), NOT by the model. `EXTRACT_SCHEMA`/P1 unchanged.
2. **Categories:** food-scoped set-level check + per-item `category_expectations` pins (flat coarse category only — "Pasta parmesano → food"; the section half is already F3's frozen check).
3. **Option prices:** Claude drafts expected prices/grams from archives + ledger; user verifies against photos before any live run.

---

## File Structure

All code changes in the worktree `/private/tmp/menu-scan-app-extraction-eval-harness`:

- `scripts/eval-027-live.ts` — GATE_DIMS widening, per-menu categories/grams print lines, failure-dump condition (Task 1)
- `scripts/eval-extraction.ts` — scorer: food-scoped categories + pins, option price/grams verification, grams dimension, fixture types, self-checks (Tasks 2, 3, 5)
- `supabase/functions/analyze-menu/extract.ts` — `ExtractedMenuItem.grams` type field ONLY (no schema-to-model change) (Task 4)
- `supabase/functions/analyze-menu/postprocess.ts` — `parseItemGrams` stage + self-checks (Task 4)
- `src/types/scan.ts` — `ExtractedItem.grams` (Task 4)
- `scripts/fixtures/*.expected.json` — options→object migration (Task 3), oracle drafts (Task 6)

Plan + close-out docs in the MAIN repo (`/Users/santiagoaguirre/Desktop/CODING/menu-scan-app`).

---

### Task 1: Widen the cumulative gate (the roadmap's "first mechanical step")

**Files:**
- Modify: `scripts/eval-027-live.ts:187` (GATE_DIMS), `:161-179` (print + dump)

**Interfaces:**
- Consumes: `scoreMenu` already computes `categories` per response; `grams` dimension arrives in Task 5 — until then the widened array would not compile, so this task widens to `categories` and Task 5 adds `grams`.
- Produces: every run prints and gates `categories` alongside frozen dims.

- [ ] **Step 1: Widen GATE_DIMS and add the categories print line**

In `scripts/eval-027-live.ts` change line 187:

```ts
  const GATE_DIMS = ["items", "options", "section_context", "categories"] as const;
```

After the `section_context` console.log (line ~171), add:

```ts
    console.log(
      `  ${report.categories.pass ? "PASS" : "FAIL"} ${fixture.menu} categories: ${report.categories.detail}`,
    );
```

Extend the failure-dump condition (line ~172):

```ts
    if (
      !report.items.pass || !report.options.pass ||
      !report.section_context.pass || !report.categories.pass
    ) {
```

- [ ] **Step 2: Verify it type-checks**

Run: `cd /private/tmp/menu-scan-app-extraction-eval-harness && deno check scripts/eval-027-live.ts`
Expected: no errors (the `categories` dimension already exists in `MenuReport` and `GateDimension`).

- [ ] **Step 3: Commit**

```bash
git add scripts/eval-027-live.ts
git commit -m "feat(eval): F4 start — widen GATE_DIMS to categories, print + dump on categories failures"
```

---

### Task 2: Scorer — food-scoped categories + per-item category pins

**Files:**
- Modify: `scripts/eval-extraction.ts` — `ExpectedFixture` (~line 16), `scoreMenu` categories block (lines 239–252), `runSelfCheck`

**Interfaces:**
- Consumes: `foodItems` (already computed in `scoreMenu`), `normalize()`.
- Produces: fixture field `category_expectations?: { name_contains: string; category: Category }[]`; categories `detail` string format `missing: …; spurious: …; wrong: …` with named diagnostics (`Flan→food (expected dessert)`).

- [ ] **Step 1: Write failing self-checks**

In `runSelfCheck()` (before the final `printReport` call), add:

```ts
  // F4: categories is food-scoped — drink in fixture.categories is ignored
  // (nikkori crop path drops drinks pre-merge), and per-item pins use the
  // same any-match semantics as section_expectations.
  const catFixture: ExpectedFixture = {
    ...fixture,
    categories: ["food", "dessert", "drink"],
    category_expectations: [
      { name_contains: "Flan", category: "dessert" },
    ],
  };
  const catItems = (overrides: Partial<ExtractedMenuItem>[]): ActualExtraction => ({
    image_quality: { usable: true, issues: [] },
    items: overrides.map((o) => ({
      name: "",
      description: "",
      price: null,
      category: "food" as const,
      section_title: null,
      options: [],
      ...o,
    })),
  });
  assert(
    scoreMenu(catFixture, catItems([
      { name: "Rib Eye", category: "food" },
      { name: "Flan", category: "dessert" },
    ])).categories.pass,
    "food-scoped categories: missing drink category must not fail",
  );
  assert(
    !scoreMenu(catFixture, catItems([
      { name: "Rib Eye", category: "food" },
      { name: "Flan", category: "food" },
      { name: "Brownie", category: "dessert" },
    ])).categories.pass,
    "category pin: Flan mislabeled food must fail even when the set matches",
  );
  assert(
    scoreMenu(catFixture, catItems([
      { name: "Rib Eye", category: "food" },
      { name: "Flan", category: "other" },
      { name: "Flan", category: "dessert" },
    ])).categories.pass === false,
    "spurious category (other) must fail even when the pin is satisfied by any-match",
  );
```

(The third assert documents both behaviors at once: the pin passes via any-match, but the spurious `other` still fails the set check.)

- [ ] **Step 2: Run to verify failure**

Run: `deno run --allow-read scripts/eval-extraction.ts --self-check`
Expected: FAIL — `category_expectations` does not exist on `ExpectedFixture` (type error) or first new assert throws.

- [ ] **Step 3: Implement**

Add to `ExpectedFixture` (after `drink_section_expectations`):

```ts
  // F4: per-item coarse-category pins (flat category only — the section half
  // is Feature 3's frozen check). Any-match semantics, like section_expectations.
  category_expectations?: {
    name_contains: string;
    category: Category;
  }[];
```

Replace the categories block in `scoreMenu` (lines 239–252):

```ts
  // Feature 4 is food-scoped like Feature 3: the nikkori crop path drops
  // drinks before merge, so the drink category can never appear there —
  // drinks are Feature 5's dimension.
  const expectedCategories = new Set(
    fixture.categories.filter((category) => category !== "drink"),
  );
  const actualCategories = new Set(foodItems.map((item) => item.category));
  const missingCategories = [...expectedCategories].filter((category) =>
    !actualCategories.has(category)
  );
  const spuriousCategories = [...actualCategories].filter((category) =>
    !expectedCategories.has(category)
  );
  // ANY name-matching food item with the expected category satisfies the pin —
  // impostor/duplicate same-name cards must not steal the check (F3 lesson).
  const wrongCategories = (fixture.category_expectations ?? []).flatMap(
    (expected) => {
      const matches = foodItems.filter((candidate) =>
        normalize(candidate.name).includes(normalize(expected.name_contains))
      );
      if (matches.length === 0) {
        return [`${expected.name_contains}→(item not found)`];
      }
      if (matches.some((item) => item.category === expected.category)) return [];
      return [
        `${matches[0].name}→${matches[0].category} (expected ${expected.category})`,
      ];
    },
  );
  const categories = {
    pass: missingCategories.length === 0 && spuriousCategories.length === 0 &&
      wrongCategories.length === 0,
    detail: `missing: ${missingCategories.join(", ") || "none"}; spurious: ${
      spuriousCategories.join(", ") || "none"
    }; wrong: ${wrongCategories.join("; ") || "none"}`,
  };
```

- [ ] **Step 4: Run self-check to verify pass**

Run: `deno run --allow-read scripts/eval-extraction.ts --self-check`
Expected: `Self-check passed`

- [ ] **Step 5: Commit**

```bash
git add scripts/eval-extraction.ts
git commit -m "feat(scorer): food-scoped categories + any-match category_expectations pins (TDD)"
```

---

### Task 3: Scorer — option price & grams verification + fixture options→object migration

**Files:**
- Modify: `scripts/eval-extraction.ts` — `ExpectedFixture.items_with_options`, `optionRecall`, `OptionBreakdown`, `optionBreakdown`, `formatOptionBreakdown`, options block in `scoreMenu`, `runSelfCheck` stub fixtures
- Modify: all 6 `scripts/fixtures/*.expected.json` — mechanical `"x"` → `{"name":"x"}` migration (values arrive in Task 6)

**Interfaces:**
- Consumes: `findOptionTargetIndex` (unchanged), `normalize()`.
- Produces: option target entry type `{ name: string; price?: number | null; grams?: number | null }` — a present `price`/`grams` key means the matched option's value MUST equal it (`null` = "printed no per-option price"); an absent key means unchecked (F2's frozen name-only semantics). `OptionBreakdown.targets[].valueMismatches: string[]` and a `$` line in `formatOptionBreakdown`.

- [ ] **Step 1: Write failing self-checks**

In `runSelfCheck()`, add (uses the same `catItems`-style stub or the existing `revueltosCard` helpers already present in the self-check block):

```ts
  // F4: a present price/grams key on an expected option is verified against
  // the matched option; absent keys keep F2's name-only semantics.
  const priceFixture: ExpectedFixture = {
    ...fixture,
    items_with_options: [{
      name_contains: "Revueltos",
      options: [{ name: "jamón", price: 90 }],
    }],
  };
  const revueltosAt = (price: number | null): ActualExtraction => ({
    image_quality: { usable: true, issues: [] },
    items: [{
      name: "Revueltos",
      description: "Dos huevos naturales",
      price: 78,
      category: "food",
      section_title: "Huevos",
      options: [{ name: "Con jamón, chorizo o tocino", price, grams: null }],
      grams: null,
    }],
  });
  assert(
    scoreMenu(priceFixture, revueltosAt(90)).options.pass,
    "option price check: matching printed price must pass",
  );
  assert(
    !scoreMenu(priceFixture, revueltosAt(84)).options.pass,
    "option price check: 84 vs printed 90 must fail options",
  );
  const noPriceKeyFixture: ExpectedFixture = {
    ...fixture,
    items_with_options: [{
      name_contains: "Revueltos",
      options: [{ name: "jamón" }],
    }],
  };
  assert(
    scoreMenu(noPriceKeyFixture, revueltosAt(84)).options.pass,
    "absent price key: name-only semantics (F2 frozen) must still pass",
  );
```

(Note: `grams: null` on the stub item is Task 4's field — if Task 3 executes before Task 4, omit that line and add it in Task 4; the tasks are committed in order so keep it and run Tasks 3+4's checks after Task 4 if executing strictly sequentially. Recommended: implement Tasks 3 and 4 in one working session, run all self-checks at the end of Task 4.)

- [ ] **Step 2: Implement the type + scorer changes**

`ExpectedFixture.items_with_options` becomes:

```ts
  items_with_options: {
    name_contains: string;
    description_contains?: string;
    price?: number;
    // price/grams present ⇒ matched option's value must equal it (null =
    // "no per-option price printed"). Absent ⇒ unchecked (F2 name-only).
    options: {
      name: string;
      price?: number | null;
      grams?: number | null;
    }[];
  }[];
```

`optionRecall` (name-based recall stays F2-faithful — values don't change recall):

```ts
    const names = items[index].options.map((option) => normalize(option.name));
    for (const expectedOption of target.options) {
      if (names.some((name) => name.includes(normalize(expectedOption.name)))) {
        found++;
      }
    }
```

`OptionBreakdown.targets[]` gains `valueMismatches: string[]`. In `optionBreakdown`, after computing `missingOptions`:

```ts
    const valueMismatches = target.options.flatMap((expected) => {
      const matched = item.options.find((option) =>
        normalize(option.name).includes(normalize(expected.name))
      );
      if (!matched) return [];
      const mismatches: string[] = [];
      if ("price" in expected && matched.price !== expected.price) {
        mismatches.push(
          `${expected.name}: price ${matched.price ?? "null"} (expected ${expected.price ?? "null"})`,
        );
      }
      if ("grams" in expected && matched.grams !== expected.grams) {
        mismatches.push(
          `${expected.name}: grams ${matched.grams ?? "null"} (expected ${expected.grams ?? "null"})`,
        );
      }
      return mismatches;
    });
```

Include `valueMismatches` in both return branches (empty array in the `matchedItem: null` branch), update `missingOptions` mapping to compare `expected.name`:

```ts
    const missingOptions = target.options.filter((expected) =>
      !names.some((name) => normalize(name).includes(normalize(expected.name)))
    );
```

(`missingOptions` is now the object type — update `formatOptionBreakdown`'s joins to `.map((o) => o.name).join(", ")`.)

In `formatOptionBreakdown`, after the per-target ✓/~/✗ line, print value mismatches:

```ts
    for (const mismatch of entry.valueMismatches) {
      lines.push(`    $ VALUE MISMATCH ${mismatch}`);
    }
```

In `scoreMenu`'s options block, fail on value mismatches too:

```ts
  const missingOptionItems = optionsBreakdown.targets.filter((entry) =>
    entry.matchedItem === null ||
    entry.matchedOptions.length === 0 ||
    entry.missingOptions.length > 0 ||
    entry.valueMismatches.length > 0
  );
```

And extend the detail string:

```ts
    detail:
      `missed targets: ${missingOptionItems.length}; false-positive items: ${optionsBreakdown.falsePositives.length}; value mismatches: ${
        optionsBreakdown.targets.flatMap((t) => t.valueMismatches).length
      }`,
```

- [ ] **Step 3: Migrate all existing self-check stub fixtures and the 6 fixture JSONs**

In `runSelfCheck()`, every `options: ["x", "y"]` in stub fixtures becomes `options: [{ name: "x" }, { name: "y" }]`.

Migrate the 6 fixture files mechanically (name-only, values arrive in Task 6):

```bash
cd /private/tmp/menu-scan-app-extraction-eval-harness/scripts/fixtures
python3 - <<'EOF'
import json
for menu in ["brasero", "brasero-two", "casa-nostra", "el-marcos", "mochomos", "nikkori"]:
    path = f"{menu}.expected.json"
    d = json.load(open(path))
    for target in d.get("items_with_options", []):
        target["options"] = [
            o if isinstance(o, dict) else {"name": o} for o in target["options"]
        ]
    json.dump(d, open(path, "w"), ensure_ascii=False, indent=2)
    open(path, "a").write("\n")
EOF
```

- [ ] **Step 4: Type-check + self-check**

Run: `deno check scripts/eval-extraction.ts scripts/eval-027-live.ts && deno run --allow-read scripts/eval-extraction.ts --self-check`
Expected: `Self-check passed` (run after Task 4 if the `grams` stub field is included).

- [ ] **Step 5: Commit**

```bash
git add scripts/eval-extraction.ts scripts/fixtures/
git commit -m "feat(scorer): verify option price/grams on matched options; fixtures migrate options to objects (TDD)"
```

---

### Task 4: `items[].grams` type field + deterministic `parseItemGrams` postprocess stage

**Files:**
- Modify: `supabase/functions/analyze-menu/extract.ts:126-133` (`ExtractedMenuItem`) — TYPE ONLY, do NOT touch `EXTRACT_SCHEMA` or `EXTRACT_PROMPT`
- Modify: `supabase/functions/analyze-menu/postprocess.ts` — new `parseItemGrams` + chain + self-checks
- Modify: `src/types/scan.ts:22-29` (`ExtractedItem`)
- Possibly modify: any other `ExtractedMenuItem`/`ExtractedItem` constructor found by grep (Step 3)

**Interfaces:**
- Consumes: `ExtractedMenuItem` (extract.ts), postprocess chain in `postprocessItems`.
- Produces: `ExtractedMenuItem.grams: number | null` and `ExtractedItem.grams: number | null`; `parseItemGrams(items: ExtractedMenuItem[]): ExtractedMenuItem[]` — ALWAYS sets `grams` (number or null) on every item, so raw model output (which lacks the key) is normalized by `postprocessItems`.

- [ ] **Step 1: Write failing self-checks**

In `postprocess.ts`'s `import.meta.main` block (the `item()` helper gains `grams: null` in its defaults):

```ts
  // Printed-weight parser: number + g/gr/grs/kg is grams; ml/L/oz are volumes.
  const grams = parseItemGrams([
    item({ name: "CHILAQUILES (70gr.)" }),
    item({ name: "Bandiola Adobada (150gr)" }),
    item({ name: "Rib Eye", description: "Corte de 280 g a la parrilla" }),
    item({ name: "Té Matcha (350mL)" }),
    item({ name: "Ensalada", description: "2 slices of lettuce, 100 tomatoes" }),
    item({ name: "Paella (1kg)" }),
  ]);
  const gramsGot = grams.map((i) => i.grams).join(",");
  if (gramsGot !== "70,150,280,null,null,1000") {
    throw new Error(`parseItemGrams: got ${gramsGot}`);
  }
  // Name wins over description when both print a weight.
  const gramsPriority = parseItemGrams([
    item({ name: "Corte (300gr)", description: "con guarnición de 150gr" }),
  ]);
  if (gramsPriority[0].grams !== 300) throw new Error("parseItemGrams: name priority");
```

- [ ] **Step 2: Run to verify failure**

Run: `deno run supabase/functions/analyze-menu/postprocess.ts`
Expected: FAIL — `parseItemGrams` not defined.

- [ ] **Step 3: Implement**

`extract.ts` — add to `ExtractedMenuItem` (type only; `EXTRACT_SCHEMA` stays byte-identical — the model never emits this field, `postprocessItems` fills it):

```ts
export interface ExtractedMenuItem {
  name: string;
  description: string;
  price: number | null;
  category: "food" | "side" | "dessert" | "drink" | "other";
  section_title: string | null;
  options: { name: string; price: number | null; grams: number | null }[];
  // Printed item weight in grams, parsed deterministically from name/description
  // by postprocess (parseItemGrams) — NOT model-filled; EXTRACT_SCHEMA unchanged.
  grams: number | null;
}
```

`src/types/scan.ts` — mirror the field on `ExtractedItem` with the same comment.

`postprocess.ts` — new stage (above `postprocessItems`):

```ts
// Printed weight convention: a number followed by g/gr/grs/kg ("600g",
// "70 gr.", "1kg"). Volumes (ml/L/oz) are NOT grams. Name wins over
// description; first match wins.
// ponytail: multi-weight items take the first printed weight — refine to
// per-component weights only if Stage-2 accuracy demands it.
const GRAMS_TOKEN = /(?<![\p{L}\d])(\d+(?:[.,]\d+)?)\s*(kg|grs?|g)\b/iu;

export function parseItemGrams(
  items: ExtractedMenuItem[],
): ExtractedMenuItem[] {
  return items.map((item) => {
    const match = GRAMS_TOKEN.exec(item.name) ??
      GRAMS_TOKEN.exec(item.description);
    if (!match) return { ...item, grams: null };
    const value = Number(match[1].replace(",", "."));
    return {
      ...item,
      grams: match[2].toLowerCase() === "kg" ? value * 1000 : value,
    };
  });
}
```

Chain — `parseItemGrams` runs LAST so items promoted from options ("Bandiola Adobada (150gr)") also get parsed:

```ts
export function postprocessItems(
  items: ExtractedMenuItem[],
): ExtractedMenuItem[] {
  return parseItemGrams(filterServingFormatOptions(
    extractInlineChoices(
      dropHeaderEchoes(promoteSections(foldVariantCards(stripMenuNumbers(items)))),
    ),
  ));
}
```

⚠️ Regex sanity: `(?<![\p{L}\d])` blocks `mg`/`ml` prefixes matching the `g` branch mid-word... it does NOT — `ml`'s `l` is a letter before nothing; what blocks `350mL` is that `m` is a letter immediately before... no: the token tried would be `350` + `mL` which doesn't match `(kg|grs?|g)`. What must NOT match: "100 mg" — `mg` isn't in the alternation and `g` alone can't match because `m` sits between the digits and the `g`, so `\s*` fails. The self-check's `350mL` case covers the volume class; add "100 mg" to the self-check list if paranoid.

- [ ] **Step 4: Fix every other constructor the type change breaks**

```bash
cd /private/tmp/menu-scan-app-extraction-eval-harness
grep -rn "ExtractedMenuItem\|ExtractedItem" supabase/ src/ scripts/ --include="*.ts" -l
deno check scripts/eval-extraction.ts scripts/eval-027-live.ts supabase/functions/analyze-menu/postprocess.ts supabase/functions/analyze-menu/extract.ts supabase/functions/analyze-menu/index.ts
```

Every stub/constructor that builds items literally (postprocess `item()` helper, eval self-check stubs, any index.ts mapping, `mergeItemSources` if it constructs rather than passes through) gains `grams: null` (or preserves the merged item's grams). Fix until `deno check` is clean. Also run the repo's client type-check if configured (`pnpm` typecheck script) — the `src/types/scan.ts` change ripples to the app; new required field means client constructors of `ExtractedItem` (if any, e.g. test stubs) need `grams: null`.

- [ ] **Step 5: Run all self-checks**

Run: `deno run supabase/functions/analyze-menu/postprocess.ts && deno run --allow-read scripts/eval-extraction.ts --self-check`
Expected: both print success (this also closes Task 3's deferred check).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/analyze-menu/extract.ts supabase/functions/analyze-menu/postprocess.ts src/types/scan.ts scripts/
git commit -m "feat(postprocess): items[].grams filled by deterministic parseItemGrams — EXTRACT_SCHEMA untouched (TDD)"
```

---

### Task 5: Scorer — `grams` dimension + gate wiring

**Files:**
- Modify: `scripts/eval-extraction.ts` — `ExpectedFixture`, `MenuReport`, `AggregateReport`, `scoreMenu`, `aggregateReports`, `GateDimension`/`GATE_DIMENSIONS`, `printReport`, `runSelfCheck`
- Modify: `scripts/eval-027-live.ts` — GATE_DIMS gains `"grams"`, print line, dump condition

**Interfaces:**
- Consumes: `foodItems`, `normalize()`, Task 4's `items[].grams`.
- Produces: fixture field `grams_expectations?: { name_contains: string; grams: number }[]` (any-match, food-scoped); `MenuReport.grams: DimensionScore`; gate dimension `"grams"`.

- [ ] **Step 1: Write failing self-checks**

```ts
  // F4: grams pins — any-match over food items, same semantics as the
  // category/section pins.
  const gramsFixture: ExpectedFixture = {
    ...fixture,
    grams_expectations: [{ name_contains: "Chilaquiles", grams: 70 }],
  };
  assert(
    scoreMenu(gramsFixture, catItems([
      { name: "CHILAQUILES (70gr.)", grams: 70 },
    ])).grams.pass,
    "grams pin: parsed printed weight must pass",
  );
  assert(
    !scoreMenu(gramsFixture, catItems([
      { name: "CHILAQUILES (650gr.)", grams: 650 },
    ])).grams.pass,
    "grams pin: digit-misread weight must fail with named diagnostic",
  );
  assert(
    scoreMenu(fixture, catItems([{ name: "X" }])).grams.pass,
    "no grams_expectations: dimension passes vacuously",
  );
```

(`catItems` stub from Task 2 — its item defaults gain `grams: null`.)

- [ ] **Step 2: Implement**

`ExpectedFixture`:

```ts
  // F4: printed item-weight pins (grams as printed on the menu; parseItemGrams
  // fills items[].grams). Any-match over food items.
  grams_expectations?: {
    name_contains: string;
    grams: number;
  }[];
```

`MenuReport` gains `grams: DimensionScore;`, `AggregateReport` gains `grams: boolean;`.

In `scoreMenu` (after the options block):

```ts
  const wrongGrams = (fixture.grams_expectations ?? []).flatMap((expected) => {
    const matches = foodItems.filter((candidate) =>
      normalize(candidate.name).includes(normalize(expected.name_contains))
    );
    if (matches.length === 0) return [`${expected.name_contains}→(item not found)`];
    if (matches.some((item) => item.grams === expected.grams)) return [];
    return [
      `${matches[0].name}→${matches[0].grams ?? "null"} (expected ${expected.grams})`,
    ];
  });
  const grams = {
    pass: wrongGrams.length === 0,
    detail: `wrong: ${wrongGrams.join("; ") || "none"}`,
  };
```

Return it from `scoreMenu`; add `grams: green("grams")` to `aggregateReports` (widen `green`'s parameter union with `"grams"`); add `"grams"` to `GateDimension` and `GATE_DIMENSIONS`; add a `grams` line to `printReport`.

`eval-027-live.ts`:

```ts
  const GATE_DIMS = ["items", "options", "section_context", "categories", "grams"] as const;
```

plus a `grams` print line and `!report.grams.pass` in the dump condition (mirror Task 1's edits).

- [ ] **Step 3: Verify**

Run: `deno check scripts/eval-extraction.ts scripts/eval-027-live.ts && deno run --allow-read scripts/eval-extraction.ts --self-check`
Expected: `Self-check passed`

- [ ] **Step 4: Commit**

```bash
git add scripts/eval-extraction.ts scripts/eval-027-live.ts
git commit -m "feat(scorer): grams dimension via grams_expectations pins; GATE_DIMS +grams (TDD)"
```

---

### Task 6: Draft the Feature 4 oracle → HARD USER CHECKPOINT

**Files:**
- Modify: all 6 `scripts/fixtures/*.expected.json` — `category_expectations`, `grams_expectations`, option `price`/`grams` values

**Interfaces:**
- Consumes: archive dumps `/Users/santiagoaguirre/Downloads/MenusTesting/<menu>*.actual.json` (real extracted names/prices/categories to draft from), ledger-known values, the 6 menu photos (user's authority).
- Produces: user-approved oracle. NO LIVE RUN BEFORE APPROVAL.

- [ ] **Step 1: Enumerate draft candidates from the archives**

```bash
cd /Users/santiagoaguirre/Downloads/MenusTesting && ls *.actual.json
```

For each menu, read the newest dump and list: (a) each option target's extracted option prices/grams; (b) 3–6 category-pin candidates spanning the menu's category set (at least one per non-food category the fixture lists — e.g. a `side` from brasero's Acompañamientos, a `dessert` from brasero-two's Postres and nikkori's Postres); (c) items whose name/description prints a weight token (grams-pin candidates — brasero-two's meat grid, el-marcos gramajes).

- [ ] **Step 2: Write the draft into the 6 fixtures**

Ledger-known values to prefill: el-marcos Revueltos/Fritos option `{"name": "jamón", "price": 90}`; brasero-two Taco Loiro `{"name": "pollo", "price": 150}` (the tolerated-misread picaña/arrachera stays out of the required list per the F2 ruling); el-marcos inline-parsed choices (Machaca huevo/verdura, Enchiladas Verdes/Rojas/Suizas, Pan Tostado, Plato Surtido, Avena, Hot Cakes, Waffles) get `"price": null` (parser adds null; verify the menu truly prints no per-choice price). Draft everything else from the archives; anything unverifiable stays WITHOUT a price key (= unchecked) rather than guessed.

- [ ] **Step 3: Present the per-menu draft table to the user for verification against the photos — HARD STOP**

Show: every option target with drafted price/grams, every category pin, every grams pin. The user confirms or corrects each from the photos (this is the ORACLE-CHANGE approval). Apply corrections.

- [ ] **Step 4: Validate + ledger + commit**

Run: `deno run --allow-read scripts/eval-extraction.ts --self-check && deno check scripts/eval-027-live.ts`

Ledger entry: `## Feature 4 START — gate widened + F4 oracle (ORACLE-CHANGE, user-approved <date>)` recording the decisions (grams-as-postprocess, food-scoped categories, pins added per menu, price semantics).

```bash
git add scripts/fixtures/ docs/superpowers/extraction-iteration-ledger.md
git commit -m "feat(oracle): F4 category/grams pins + option price/grams values (user-approved)"
```

---

### Task 7: $0 offline probe + live baseline (eval 045)

**Files:**
- No code changes. Ledger entry in the worktree.

- [ ] **Step 1: Offline probe against the newest archives**

Run: `deno run --allow-read --allow-write scripts/eval-extraction.ts --offline /Users/santiagoaguirre/Downloads/MenusTesting`
Read only the `categories`/`grams`/options-value lines. ⚠️ Multi-call menus (nikkori, brasero-two) are double-postprocess-unreliable; single-call menus are faithful. This is a cheap preview, not a gate.

- [ ] **Step 2: Live baseline, 1 run (~$0.35)**

Run: `OPENAI_API_KEY=... EVAL_RUNS=1 deno run --allow-read --allow-write --allow-env --allow-net scripts/eval-027-live.ts`
Expected: frozen dims (items/options-names/section_context) PASS as in eval 044; new checks reveal F4's real failure surface. Failure dumps land in `MenusTesting/*.eval027-r1.actual.json`.

- [ ] **Step 3: Ledger the baseline (eval 045) — per-menu results, failure classes, chosen levers**

---

### Task 8: Iteration loop (evals 046+)

**Files:**
- As dictated by failures: fixtures (user-approved) → `scripts/eval-extraction.ts` → `supabase/functions/analyze-menu/postprocess.ts`. P1/P2/EXTRACT_SCHEMA last resort.

**Known candidate failure classes + matching levers (from the ledger — verify against YOUR baseline before using):**

- **el-marcos jamón@84 vs printed 90** (~2/3 of runs the "@84 mexicana" line is dropped; the fold then maps jamón to the only remaining price 84). A number never transcribed cannot be recovered deterministically. Levers in preference order: (a) oracle ruling — user decides whether the pin tolerates the known-dropped-line price (e.g. remove the price key from that one target, mirroring the F2 "Revueltos → [jamón]" nondeterminism ruling) — do NOT generalize a tolerance mechanism for one menu; (b) if the user wants it solved, per-page/high-detail experiments were already rejected (iter 035) — say so before burning API budget.
- **60gr→650gr digit misreads on brasero-two's meat grid** — stable-misread policy candidates: pin only weights that read stably across archives; user rules on the rest.
- **Spurious `other` category** — dropHeaderEchoes kills the main source (header echoes); if a real food item comes back `other` intermittently, first check whether the item genuinely reads ambiguous (oracle: widen the fixture's category set is WRONG — instead pin the item and let the named diagnostic drive a postprocess or ruling decision).
- **Category flips food↔side on garnish-like items** — any-match pins + user ruling on the printed truth; avoid scorer loosening.

**Discipline per iteration:** hypothesis → cheapest validation (self-check / offline for single-call menus / EVAL_MENUS-targeted live ~$0.06) → ledger entry (newest last) → only then full runs. Never two dimensions at once; frozen-dim regressions reject the change outright.

---

### Task 9: Exit gate (3/3 consecutive live runs, ~$1.05)

- [ ] **Step 1: Run the gate**

Run: `OPENAI_API_KEY=... deno run --allow-read --allow-write --allow-env --allow-net scripts/eval-027-live.ts`
(Default `EVAL_RUNS=3`; never set `EVAL_MENUS` for the gate.)
Expected: `GATE PASS: items, options, section_context, categories, grams` ×3, `3/3 consecutive all-menu passing runs`, exit code 0.

- [ ] **Step 2: If any run fails** — back to Task 8; the gate restarts (3 CONSECUTIVE passes).

- [ ] **Step 3: Ledger the gate eval** (per-menu results, all runs).

---

### Task 10: Close-out (MAIN repo + worktree)

- [ ] **Step 1: Fill this plan's Execution Log** (below — status, initial failures, fixes, rejected changes, oracle rulings, final per-menu results, frozen gate F5 inherits, gotchas for F5).
- [ ] **Step 2: Tick Feature 4 in BOTH Progress Checklists** (this plan + the roadmap `2026-07-04-ocr-extraction-master-roadmap.md`), and mark the roadmap's F4 section CLOSED with date + gate eval number.
- [ ] **Step 3: Update the pipeline diagram** `docs/superpowers/diagrams/menu-extraction-pipeline.md`: categories/F4 line → 🟢 with close date; postprocess chain note gains `parseItemGrams`; add an items[].grams note to the schema line (postprocess-filled, EXTRACT_SCHEMA unchanged — or the prompt appendix if P1 changed, which it must not have); Status table row for F4; then `cp docs/superpowers/diagrams/menu-extraction-pipeline.md ~/Downloads/menu-extraction-pipeline.md`.
- [ ] **Step 4: Ledger close entry** ("Feature 4 CLOSED <date>") stating the frozen gate F5 inherits: `eval-027-live.ts` with `GATE_DIMS = ["items", "options", "section_context", "categories", "grams"]` — F5 widens the items dimension to drinks, unfilters the crop path's drink drop, and inherits `drink_sections`/`drink_section_expectations`.
- [ ] **Step 5: Update AGENTS.md's extraction-hardening paragraph** (F4 closed, next F5) — same one-line sync as prior features.
- [ ] **Step 6: Revoke any OpenAI API key pasted into chat or exposed during live evals.**

---

## Reference Block (copied verbatim from the roadmap)

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

---

## Feature 4 Execution Log

> Fill during Tasks 7–10. This is the durable record Feature 5 reads. Per-iteration detail lives in the worktree ledger; this is the feature-level summary.

**Status:** ✅ **CLOSED 2026-07-10** (eval 047: 3/3 consecutive live `GATE PASS: items, options, section_context, categories, grams` on all 6 menus; ledger evals 045–047, iteration 046; total live spend ~$2.45).

**What failed initially (baseline eval 045):** only 3 of 30 menu-dimension checks — (1) brasero grams: Mac and Cheese read 150 vs the printed 250 (stable vision misread, name transcribed "MAC AND CHEESE 150g" in every run — likely price-column contamination of tiny red print); (2) el-marcos option price: Revueltos jamón @84 vs printed 90 (the dropped "mexicana @84" line migrates its price onto the option; Fritos' identical printed line passed @90 in the SAME run); (3) nikkori sections: spurious "ROLLS" (first-seen anglicization of the tolerated parent header "Rollos"). Gate attempt 1 (eval 046, 2/3) then surfaced (4) el-marcos categories: spurious "other" from pseudo-item "$94 POR NIÑO" (the F1-era Pa' los Bukis junk-line nondeterminism finally hitting a gated dimension).

**What fixed it (change → effect, all in worktree `feat/extraction-eval-harness`):**
1. Harness build (Tasks 1–5, all TDD, $0): GATE_DIMS → 5 dims; scorer food-scoped `categories` + any-match `category_expectations` pins; option `price`/`grams` value verification on name-matched options (absent key = F2's frozen name-only semantics); `items[].grams` as a TYPE-only schema field — **EXTRACT_SCHEMA and P1 byte-identical** — filled by deterministic postprocess `parseItemGrams` (number+g/gr/grs/kg convention, ml/L/oz/mg excluded, name wins over description, promoteSections carries option grams through); `grams` dimension via `grams_expectations` pins.
2. User-verified oracle (photos re-read 2026-07-10): all option prices, category pins (2–3/menu), grams pins across the 6 fixtures.
3. `dropPriceNoteItems` (postprocess, iter 046, TDD): an item whose NAME starts with a currency amount with no description and no options is a prose-block price note, never a dish — killed the "$94 POR NIÑO" class at the root; offline-validated against the exact failing dump.
4. Baseline misses (1)–(3) → oracle rulings below; zero code.

**Changes rejected (and why):** none — no P1/P2/schema-to-model edits were ever attempted (F2/F3 lesson held: every fix was harness, oracle, or deterministic postprocess).

**Oracle rulings (user, 2026-07-10):** Pasta Parmesan = ONE item + 3 priced options (fold convention reaffirmed); Mac and Cheese 250gr = stable-misread tolerance → grams pin swapped to Puré de Papa→350 (same sides grid, reads correctly; iter-035 precedent says detail:high cannot recover this class); Revueltos jamón price UNCHECKED (dropped-line price migration — Fritos@90 stays pinned and verifies the same printed line); Plato Surtido's printed with-option total (82) is never transcribed by the model → UNCHECKED, revisit only if a verification pass is built; Chilaquiles option price UNCHECKED (packaging flips 138/null); "Rolls" added to nikkori `section_headers` (tolerated anglicization of "Rollos").

**Final results (per-menu, 3/3 runs, eval 047):** brasero 28/28 + recall 5/5 + Parmesan 25/45/70 ✓; brasero-two 47/44 + 1/1 + pollo@150 ✓; casa-nostra 23/23 + 3/3 + Gluten free 330/305/355 ✓; el-marcos 29/28 + 19/19 + Fritos jamón@90 / Hot Cakes@78 / Waffles@78 ✓; mochomos 22/22; nikkori 49/48 (crop-merge path). 0 duplicates, 0 option FPs, 0 value mismatches, 0 wrong categories, 0 wrong grams in every run.

**Frozen gate inherited by Feature 5:** `eval-027-live.ts` with `GATE_DIMS = ["items", "options", "section_context", "categories", "grams"]`. F5 widens `items` to drinks, removes the crop path's per-tile drink filter, and inherits `drink_sections`/`drink_section_expectations`.

**Gotchas for future features:**
- **`items[].grams` is postprocess-filled, not model-filled.** EXTRACT_SCHEMA never changed; the model never emits the key. Any consumer (Stage 2, client) gets it from `postprocessItems` output only — raw model JSON lacks it.
- **Known tolerated vision limits (adds to the F2 list):** Mac and Cheese 250gr→"150g" stable name contamination; Revueltos jamón price migrates to 84 when the mexicana line drops; Plato Surtido's 82 with-option total never transcribed. A name/price/weight verification pass remains new scope.
- **F5 decision pending:** user is weighing deferring F5 (drinks) post-release for momentum; production wiring (per-page recipe + dense auto-cutter) and the Stage-2 benchmark rank ahead of it against the core feature. Do not start F5 without an explicit go.
- **brasero-two still runs 47/44 (+3 edge)** — unchanged through F4; watch on any card-count-increasing change.

---

## Progress Checklist (mirrors the roadmap)

- [x] Feature 1 — Extract all Food menu items ✅ CLOSED 2026-07-06
- [x] Feature 2 — Extract options of Food items ✅ CLOSED 2026-07-09
- [x] Feature 3 — Extract sections & sub-sections ✅ CLOSED 2026-07-10
- [x] Feature 4 — Extract closest section + category (+ option-price & grams checks) ✅ CLOSED 2026-07-10
- [ ] Feature 5 — Extract all Drink menu items (deferral post-release under discussion)

---

## Self-Review

- **Spec coverage:** roadmap F4 asks for (a) per-item nearest section → already frozen F3 (`section_expectations` stay in the gate; F3 gotcha honored: F4 extends entries via pins, never tightens match semantics); (b) coarse category per item → Task 2 (food-scoped set + any-match pins) + Task 6 oracle; (c) option-price accuracy (2026-07-09 scope add) → Task 3 value verification riding the options dimension exactly as the roadmap specifies, el-marcos @84/@90 case called out in Task 8; (d) grams capture (2026-07-09 scope add, kickoff decision made) → Tasks 4–5 (structured field via deterministic postprocess, EXTRACT_SCHEMA untouched) + Stage-2 note preserved in roadmap; (e) GATE_DIMS widening first → Task 1; (f) 3/3 cumulative exit gate via eval-027-live → Task 9; (g) Reference Block verbatim, ledger + diagram discipline, key revocation → present.
- **Placeholder scan:** the only `_fill_` markers are in the Execution Log (filled at execution time — same pattern as F1–F3 plans). All code steps show complete code. Task 6's oracle VALUES are deliberately not invented here — they require the archives + user photo verification by design (ORACLE-CHANGE discipline), and the task specifies exactly which values are ledger-known prefills.
- **Type consistency:** `category_expectations`/`grams_expectations` use `name_contains` + any-match over `foodItems`, matching `section_expectations` (F3). Option value checks key off `"price" in expected` so Task 3's migration (name-only objects) is behavior-preserving until Task 6 adds values. `grams: number | null` is required on both `ExtractedMenuItem` and `ExtractedItem`; Task 4 Step 4 sweeps constructors. GATE_DIMS grows in two steps (Task 1 `categories`, Task 5 `grams`) because the `grams` dimension doesn't exist until Task 5 — each widening type-checks at its commit.
