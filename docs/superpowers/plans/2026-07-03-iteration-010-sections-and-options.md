# Iteration 010 — Sections + Two-Pass Options Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the options dimension aggregate-green on six eval fixtures — without regressing items, categories, section context, or image quality — then deploy the two-pass extraction and finally remove all allergen code.

**Architecture:** Restore the proven Iteration 009 two-pass extraction (Pass 1: option-free items; Pass 2: photo-aware options keyed by item index), then add exactly one general structural rule per pass: a priced-children section rule in Pass 1 and a concept-based (language-agnostic) option definition in Pass 2. A new `brasero-two` fixture encodes the grid-inversion and inline-choice ground truth. One paid benchmark run (Iteration 010) decides via the established regression gate.

**Tech Stack:** Deno (Supabase Edge Function), OpenAI gpt-4o structured output, `deno test`, fixture-driven eval harness (`scripts/eval-extraction.ts`).

**Spec:** `docs/superpowers/specs/2026-07-03-iteration-010-sections-and-options-design.md`

## Global Constraints

- Tasks 1–6 run in the worktree `/private/tmp/menu-scan-app-extraction-eval-harness` on branch `feat/extraction-eval-harness`. Task 7 touches the main repo `/Users/santiagoaguirre/Desktop/CODING/menu-scan-app` after merge. Task 8 runs in the main repo on a new branch.
- Model settings are frozen: `gpt-4o`, temperature `0`, seed `17`, independent 120-second timeout per pass.
- No menu-specific or language-specific hardcoded strings in prompts, code, or postprocessing. Concepts only.
- Menu photos live in `/Users/santiagoaguirre/Downloads/MenusTesting/`. `BraseroMenuTwo_TWo.png` is already there.
- Eval log is `docs/superpowers/extraction-eval-log.md` — append-only, in the established per-iteration format (metadata, hypothesis, change list, per-menu/aggregate table, what worked/failed, decision).
- Aggregate rule (existing harness): a dimension is green when ≥ 80% of menus pass it — with six fixtures that means ≥ 5 of 6. Items pass per menu = |actual − expected| ≤ 3 AND zero section-header phantom items.
- Regression gate: if any aggregate dimension that is currently green (items, categories, section_context, image_quality) turns FAIL in the Iteration 010 run, revert the implementation commits, log the decision, and STOP for user input.
- Testing spend is unconstrained (user, 2026-07-03). One benchmark run costs ~12 gpt-4o calls (2 passes × 6 menus).
- Package scripts use pnpm, never npm. Deno commands run as written (the rtk hook rewrites them transparently).
- Prior state already landed (do NOT redo): qualified option matcher (`4140b38`), corrected El Marcos fixture (`359a9d2`), offline re-score of iter-004/iter-009 (`a7c3f5b`).

---

### Task 1: Adjudicate Plato Surtido price and Casa Nostra Cesar row against the photos

Two ground-truth facts are unverified. Settle both from the photos before any paid run.

**Files:**
- Read: `/Users/santiagoaguirre/Downloads/MenusTesting/ElMarcosMenu.png`
- Read: `/Users/santiagoaguirre/Downloads/MenusTesting/CasaNostraMenu.png`
- Modify (only if the photo says so): `scripts/fixtures/el-marcos.expected.json`
- Modify (only if the photo says so): `scripts/fixtures/casa-nostra.expected.json`

**Interfaces:**
- Consumes: `ExpectedFixture` shape from `scripts/eval-extraction.ts:10-28` — `items_with_options` entries are `{ name_contains, description_contains?, price?, options: string[] }`.
- Produces: fixtures whose option targets match what is physically printed; a short adjudication report for the user.

- [ ] **Step 1: Check the Plato Surtido printed price**

Read `ElMarcosMenu.png` (use the Read tool — it renders the image). Locate the two "Plato Surtido" rows (the adjudication says one base card and one card with the "queso cottage o yogurt" choice). Record the printed price of the choice-bearing card. The current fixture (`el-marcos.expected.json` lines 45-50) expects `"price": 82`; the iter-009 extraction produced `72`.

- [ ] **Step 2: Fix the fixture if the print disagrees**

If the printed price of the choice-bearing card is not 82, edit `scripts/fixtures/el-marcos.expected.json` and change only that entry's `"price"` value to the printed number:

```json
    {
      "name_contains": "Plato Surtido",
      "description_contains": "queso cottage",
      "price": 82,
      "options": ["Queso cottage", "Yogurt"]
    }
```

If the print is 82, change nothing.

- [ ] **Step 3: Check the Casa Nostra Cesar row**

Read `CasaNostraMenu.png`. Locate the Cesar (César) salad row. Question: does the single priced row print a lettuce choice (e.g. "lechuga entera o en trozos")? Iteration 009's Pass 2 reported options `Lechuga entera / en trozos` for it; the fixture encodes no such target.

- [ ] **Step 4: Encode the Cesar target if it is printed in one priced row**

Per the user's adjudicated rule "choices inside one priced row are structured options": if Step 3 confirms the choice is printed inside the one priced Cesar row, add this entry to the `items_with_options` array of `scripts/fixtures/casa-nostra.expected.json` (read the file first; append after the last existing entry, preserving formatting):

```json
    {
      "name_contains": "Cesar",
      "options": ["entera", "trozos"]
    }
```

Option matching is normalized-substring (`eval-extraction.ts:165-169`), so lowercase fragments are fine. If the menu instead prints two separately priced Cesar rows, they are separate items — change nothing.

- [ ] **Step 5: Run the harness self-check**

Run: `deno run --allow-read scripts/eval-extraction.ts --self-check`
Expected: `Self-check passed`

- [ ] **Step 6: Commit (only if a fixture changed)**

```bash
git add scripts/fixtures/
git commit -m "fix: adjudicate Plato Surtido price and Casa Nostra Cesar options against photos"
```

- [ ] **Step 7: Report to user**

State in the task summary exactly what each photo prints and what (if anything) changed. This satisfies the spec's "report the printed price to the user".

---

### Task 2: Add the brasero-two fixture and an offline skip guard

**Files:**
- Create: `scripts/fixtures/brasero-two.expected.json`
- Modify: `scripts/eval-extraction.ts:332-345` (the `offline` function)

**Interfaces:**
- Consumes: `ExpectedFixture` shape; `loadFixtures()` auto-discovers every `scripts/fixtures/*.expected.json`, so no other harness change is needed for a sixth menu.
- Produces: sixth fixture scored by `main()` and `offline()`; `offline(dir)` now skips fixtures with no `<menu>.actual.json` in `dir` instead of throwing (old archives predate brasero-two).

- [ ] **Step 1: Write the fixture**

Create `scripts/fixtures/brasero-two.expected.json` with exactly:

```json
{
  "menu": "brasero-two",
  "photos": ["BraseroMenuTwo_TWo.png"],
  "total_items": 25,
  "categories": ["food", "side", "dessert"],
  "sections": [
    "Especialidades Brasero",
    "Cerdo",
    "Res",
    "Pollo",
    "Atún",
    "Guarniciones",
    "Postres"
  ],
  "section_headers": ["Los Lagos"],
  "section_expectations": [
    { "name_contains": "Taco de Leite", "section_title": "Especialidades Brasero" },
    { "name_contains": "Taco Loiro", "section_title": "Especialidades Brasero" },
    { "name_contains": "Bandiola", "section_title": "Cerdo" },
    { "name_contains": "Chistorra", "section_title": "Cerdo" },
    { "name_contains": "Chicharrón", "section_title": "Res" },
    { "name_contains": "Pechuga al Limón", "section_title": "Pollo" },
    { "name_contains": "Filete de Atún", "section_title": "Atún" },
    { "name_contains": "Papas Cambray", "section_title": "Guarniciones" },
    { "name_contains": "Brownie", "section_title": "Postres" }
  ],
  "items_with_options": [
    {
      "name_contains": "Taco Loiro",
      "options": ["picaña", "pollo"]
    }
  ],
  "image_quality": { "usable": true, "issues": [] }
}
```

Ground-truth notes (user-adjudicated 2026-07-03 — do not "improve" these):

- 25 items = 12 Especialidades Brasero tacos + 7 grid items + 4 Guarniciones + 2 Postres.
- The grid entries Sirloin and Picaña are deliberately ABSENT from `section_expectations`: the mapping check (`eval-extraction.ts:137-143`) matches the FIRST item whose name contains the fragment, and "Taco Loiro (sirloin)" / "Tosta Brasil (picaña)" appear earlier in menu order. Chicharrón is the unambiguous Res exemplar on this page (the page-one Chicharrón items are not in this single-photo fixture). Do not add Sirloin or Picaña expectations.
- The four protein labels are in `sections`, so the phantom-header check fails `items` if the model emits Cerdo/Res/Pollo/Atún as items — that is intended: it punishes the grid inversion.
- Exactly one option-bearing item. Any other item with options (e.g. "tortilla de su elección" prose, serving formats) scores as a false positive — intended.
- `"Taco Sonora"` is printed on the menu but the model has misread it as "Taco Sombrero"; the fixture deliberately does not gate on that name (it is not in `section_expectations`). The misread only affects name fidelity, not counts.
- Items from the partial upside-down page at the top of the photo are not expected. If the run emits them, adjudicate in the eval log rather than editing this fixture silently.

- [ ] **Step 2: Add the offline skip guard**

In `scripts/eval-extraction.ts`, replace the body of `offline` (currently lines 332-345):

```ts
async function offline(dir: string): Promise<void> {
  const fixtures = await loadFixtures();
  const reports: MenuReport[] = [];
  for (const fixture of fixtures) {
    let raw: ActualExtraction;
    try {
      raw = JSON.parse(
        await Deno.readTextFile(`${dir}/${fixture.menu}.actual.json`),
      ) as ActualExtraction;
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        console.log(`\n${fixture.menu}`);
        console.log(`  SKIP no ${fixture.menu}.actual.json in ${dir}`);
        continue;
      }
      throw error;
    }
    reports.push(scoreMenu(fixture, {
      image_quality: raw.image_quality,
      items: postprocessItems(raw.items),
    }));
  }
  printReport(reports, aggregateReports(reports));
}
```

- [ ] **Step 3: Run the self-check**

Run: `deno run --allow-read scripts/eval-extraction.ts --self-check`
Expected: `Self-check passed`

- [ ] **Step 4: Verify the skip guard against the iter-009 archive**

Run: `deno run --allow-read scripts/eval-extraction.ts --offline /Users/santiagoaguirre/Downloads/MenusTesting/iter-009`
Expected: five menus scored as before, plus a `brasero-two` block reading `SKIP no brasero-two.actual.json in ...`. If Task 1 changed a fixture, append a two-line offline-re-score note to `docs/superpowers/extraction-eval-log.md` recording any per-menu score that moved.

- [ ] **Step 5: Commit**

```bash
git add scripts/fixtures/brasero-two.expected.json scripts/eval-extraction.ts docs/superpowers/extraction-eval-log.md
git commit -m "feat(iter-010): add brasero-two fixture and offline skip guard"
```

---

### Task 3: Restore the two-pass extraction from Iteration 009

The 009 implementation (`968982b`) was reverted in `4d0f3b7`. Later commits touched only `scripts/eval-extraction.ts` and fixtures, so reverting the revert applies cleanly to `supabase/functions/analyze-menu/extract.ts` and `extract_test.ts`.

**Files:**
- Modify (via git revert): `supabase/functions/analyze-menu/extract.ts`, `supabase/functions/analyze-menu/extract_test.ts`

**Interfaces:**
- Produces: `runExtraction(photos: string[], apiKey: string): Promise<ExtractionResult>` making exactly two model calls; exported `EXTRACT_PROMPT`, `EXTRACT_SCHEMA`, `OPTIONS_SCHEMA`; private `optionsPrompt(items)` builder; `mergeOptions` with strict index validation. Tasks 4 and 5 edit these prompts.

- [ ] **Step 1: Revert the revert**

```bash
git revert --no-edit 4d0f3b7
```

Expected: clean revert, no conflicts. `supabase/functions/analyze-menu/extract.ts` is back to the two-pass version (~299 lines, containing `optionsPrompt` and `OPTIONS_SCHEMA`).

- [ ] **Step 2: Run the function tests**

Run: `deno test supabase/functions/analyze-menu/`
Expected: all tests PASS (including "runExtraction merges Pass 2 options by Pass 1 item index" and the invalid-index rejection tests).

- [ ] **Step 3: Type-check**

Run: `deno check supabase/functions/analyze-menu/extract.ts supabase/functions/analyze-menu/postprocess.ts supabase/functions/analyze-menu/index.ts scripts/eval-extraction.ts`
Expected: no errors. (The revert commit from Step 1 is this task's commit.)

---

### Task 4: Add the priced-children section rule to Pass 1

**Files:**
- Modify: `supabase/functions/analyze-menu/extract.ts` (the `EXTRACT_PROMPT` constant)
- Test: `supabase/functions/analyze-menu/extract_test.ts`

**Interfaces:**
- Consumes: exported `EXTRACT_PROMPT` from Task 3.
- Produces: the same export, with one added rule. No schema or signature changes.

- [ ] **Step 1: Write the failing test**

In `extract_test.ts`, add `EXTRACT_PROMPT` to the existing import from `./extract.ts`:

```ts
import {
  EXTRACT_PROMPT,
  EXTRACT_SCHEMA,
  OPTIONS_SCHEMA,
  runExtraction,
} from "./extract.ts";
```

Append the test:

```ts
Deno.test("EXTRACT_PROMPT states the priced-children section rule", () => {
  assertStringIncludes(
    EXTRACT_PROMPT,
    "entries printed under it each have their own price",
  );
  assertStringIncludes(
    EXTRACT_PROMPT,
    "never turn its priced entries into options",
  );
});
```

(Both fragments sit on a single line of the template literal — prompt text wraps across lines, so assertions must never span a line break.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `deno test supabase/functions/analyze-menu/extract_test.ts --filter "priced-children"`
Expected: FAIL (assertion error — text not found).

- [ ] **Step 3: Add the rule to EXTRACT_PROMPT**

In `extract.ts`, replace this exact passage of `EXTRACT_PROMPT`:

```
A heading is often larger text without its own price, weight, or description, but
it must also group menu items beneath it. Do not treat restaurant names, slogans,
or promotional text as section headings.
```

with:

```
A heading is often larger text without its own price, weight, or description, but
it must also group menu items beneath it. If a label has no price of its own and
the entries printed under it each have their own price, that label is a section
title: record it as those entries' section_title, never output the label itself
as an item, and never turn its priced entries into options. Do not treat
restaurant names, slogans, or promotional text as section headings.
```

No other `EXTRACT_PROMPT` edits. This is the only Pass 1 change in Iteration 010.

- [ ] **Step 4: Run all function tests**

Run: `deno test supabase/functions/analyze-menu/`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/analyze-menu/extract.ts supabase/functions/analyze-menu/extract_test.ts
git commit -m "feat(iter-010): add priced-children section rule to Pass 1 prompt"
```

---

### Task 5: Concept-based option definition in Pass 2

**Files:**
- Modify: `supabase/functions/analyze-menu/extract.ts` (the `optionsPrompt` function)
- Test: `supabase/functions/analyze-menu/extract_test.ts`

**Interfaces:**
- Consumes: private `optionsPrompt(items)`; the test observes it through the mocked `fetch` (second request's text content), same pattern as the existing merge test.
- Produces: unchanged signature; new prompt text only.

- [ ] **Step 1: Write the failing test**

Append to `extract_test.ts` (reuses the file's existing `RequestBody`, `success`, `ONE_ITEM_RAW` helpers):

```ts
Deno.test("Pass 2 prompt defines options by concept, not fixed wording", async () => {
  const originalFetch = globalThis.fetch;
  const requestBodies: RequestBody[] = [];
  let calls = 0;
  globalThis.fetch = (async (input, init) => {
    calls += 1;
    const request = new Request(input, init);
    requestBodies.push(JSON.parse(await request.text()) as RequestBody);
    return success(calls === 1 ? ONE_ITEM_RAW : '{"option_sets":[]}');
  }) as typeof fetch;

  try {
    await runExtraction(["photo-base64"], "test-key");
    const prompt = requestBodies[1].messages[0].content[0].text ?? "";
    assertStringIncludes(prompt, "mutually exclusive alternatives");
    assertStringIncludes(prompt, "in the menu's own language");
    assertStringIncludes(
      prompt,
      "have their own price is a section heading",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `deno test supabase/functions/analyze-menu/extract_test.ts --filter "concept"`
Expected: FAIL (assertion error — text not found).

- [ ] **Step 3: Replace the Pass 2 definition paragraphs**

In `extract.ts`, inside `optionsPrompt`, replace the first two paragraphs of the template string — exactly this text:

```
Read the restaurant menu photos again and identify selectable options
for the indexed items below. An option is a printed choice within one item's
composition: a protein or filling choice, paid add-on, dietary swap, or flavor
choice. A choice printed inside a description ("con X o Y", "choice of X or Y")
is an options list.

Separately printed preparations or variants are separate items, not options.
Serving formats and sizes (glass vs bottle, copa vs botella, small vs large)
are not options. Distinct products listed under a shared heading are not options.
```

with:

```
Read the restaurant menu photos again and identify selectable options
for the indexed items below. An option is a printed choice within one item's
composition: a protein or filling choice, paid add-on, dietary swap, or flavor
choice. Any wording in the menu's own language that invites choosing one of
several mutually exclusive alternatives is an options list, whatever its
formatting: an inline sentence, a bolded lead-in line, a parenthetical, or a
dash- or slash-separated list. An alternative that carries its own printed
price or weight is one option; record that printed price and grams.

The choice text must be printed inside that item's own block, under its name or
within its description area. A label printed above multiple entries that each
have their own price is a section heading, not an item with options; never
attach those entries as options of the label. Separately printed preparations
or variants are separate items, not options. Ingredients printed as served
together (joined by the menu language's "and") are description, not options.
Conditional or grouped combo choices stay description text. Serving formats and
sizes (glass vs bottle, copa vs botella, small vs large) are not options.
Distinct products listed under a shared heading are not options.
```

Keep the final "Return only items that have genuine options..." paragraph and the `Indexed items:` JSON block unchanged. (The hardcoded example phrase `"con X o Y", "choice of X or Y"` is deliberately removed — concepts only.)

- [ ] **Step 4: Run all function tests**

Run: `deno test supabase/functions/analyze-menu/`
Expected: all PASS. (If the old merge test asserted removed phrasing, update only string assertions — behavior assertions must not change.)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/analyze-menu/extract.ts supabase/functions/analyze-menu/extract_test.ts
git commit -m "feat(iter-010): concept-based option definition in Pass 2 prompt"
```

---

### Task 6: Run the Iteration 010 paid benchmark, log it, apply the gate

**Files:**
- Modify: `docs/superpowers/extraction-eval-log.md` (append entry)
- Output: `/Users/santiagoaguirre/Downloads/MenusTesting/*.actual.json` → archived to `iter-010/`

**Interfaces:**
- Consumes: the six fixtures, the restored two-pass `runExtraction`, `OPENAI_API_KEY` from the worktree's `.env.local`.
- Produces: the Iteration 010 log entry and a go/no-go decision for Task 7.

- [ ] **Step 1: Run the live benchmark (12 gpt-4o calls)**

```bash
cd /private/tmp/menu-scan-app-extraction-eval-harness
export OPENAI_API_KEY=$(grep '^OPENAI_API_KEY=' .env.local | cut -d= -f2-)
deno run --allow-read --allow-write --allow-env --allow-net scripts/eval-extraction.ts
```

Expected: a per-menu report for brasero, brasero-two, casa-nostra, el-marcos, mochomos, nikkori, then an Aggregate block. Target: items/categories/section_context/options/image_quality all PASS (options is the one changing; nikkori items may fail individually — aggregate needs ≥5/6).

- [ ] **Step 2: Archive the raw outputs**

```bash
mkdir -p /Users/santiagoaguirre/Downloads/MenusTesting/iter-010
cp /Users/santiagoaguirre/Downloads/MenusTesting/*.actual.json /Users/santiagoaguirre/Downloads/MenusTesting/iter-010/
```

- [ ] **Step 3: Append the Iteration 010 entry to the eval log**

Append to `docs/superpowers/extraction-eval-log.md`, following the exact format of the Iteration 009 entry: metadata bullets (date, implementation commits from Tasks 3-5, model `gpt-4o`, temperature `0`, seed `17`, timeouts, hypothesis), the change list (two-pass restored; priced-children rule in Pass 1; concept-based option definition in Pass 2; brasero-two fixture added; adjudications from Task 1), the six-row + aggregate results table (columns: Menu, Items, Categories, Section context, Options, Image quality), "What worked", "What regressed or failed", and "Decision". Record raw outputs path `/Users/santiagoaguirre/Downloads/MenusTesting/iter-010/*.actual.json`.

- [ ] **Step 4: Apply the regression gate**

- **All previously-green dimensions still green AND options green:** record decision "gate passed; proceed to deploy", go to Step 5.
- **Any previously-green aggregate dimension now FAIL:** revert the Task 4 and Task 5 commits (`git revert --no-edit <sha4> <sha5>`); if the failure implicates the two-pass split itself (not the prompt rules), also revert the Task 3 restore. Record the decision and STOP — report to the user before any further iteration.
- **Green dims held but options still FAIL:** do NOT revert; record per-menu option failures with specifics (missed targets vs false positives, which menus) and STOP for user input.

- [ ] **Step 5: Commit the log**

```bash
git add docs/superpowers/extraction-eval-log.md
git commit -m "docs: log Iteration 010 sections + two-pass options benchmark"
```

---

### Task 7: Deploy on green and verify in the simulator

Only after Task 6's gate passes AND the user has seen the results and approved deployment.

**Files:**
- Main repo: `supabase/functions/analyze-menu/` (updated via merge), `supabase/backups/`

**Interfaces:**
- Consumes: merged `feat/extraction-eval-harness` changes.
- Produces: deployed `analyze-menu` edge function; user-verified simulator behavior.

- [ ] **Step 1: Merge the branch**

Use the superpowers:finishing-a-development-branch skill: push `feat/extraction-eval-harness`, open a PR to `main`, merge after checks.

- [ ] **Step 2: Back up the currently deployed function (mirrors the v17 convention)**

```bash
cd /Users/santiagoaguirre/Desktop/CODING/menu-scan-app
git checkout main && git pull
cp -r supabase/functions/analyze-menu "supabase/backups/analyze-menu-pre-iter010-$(date +%Y%m%d-%H%M%S)"
```

- [ ] **Step 3: Deploy**

```bash
supabase functions deploy analyze-menu
```

Expected: deploy succeeds against project `uonuiadueykynbetxxrw`.

- [ ] **Step 4: User simulator verification**

Ask the user to scan both Brasero photos in the iOS simulator and confirm: (a) Taco Loiro (sirloin) shows picaña/pollo as selectable options; (b) the protein grid appears as 7 items under Cerdo/Res/Pollo/Atún sections with no Cerdo/Res/Pollo/Atún pseudo-items; (c) Churrasquería options still present.

---

### Task 8: Remove all allergen code (main repo, new branch)

Verified state: the client (`app/`, `components/`, `store/`, `types/`, `lib/`, `constants/`, `data/`, `hooks/`) has ZERO allergen references. Allergen code lives only in the edge function's enrich stage. The allergen UI exists solely on the unmerged branch `feat/allergen-selection`.

**Files:**
- Modify: `supabase/functions/analyze-menu/index.ts` (lines ~54, ~76, ~78, ~100, ~102)
- Modify: `supabase/functions/analyze-menu/enrich.ts` (lines ~19, ~46)
- Modify: `supabase/functions/analyze-menu/enrich_test.ts` (lines ~25, ~84)
- Modify: `AGENTS.md`
- Leave untouched: `supabase/backups/**` (historical snapshots)

**Interfaces:**
- Consumes: `EnrichedItem` type in `enrich.ts`; `ENRICH_PROMPT`, `ENRICH_SCHEMA_GEMINI`, `ENRICH_SCHEMA_OPENAI` in `index.ts`.
- Produces: enrichment output without an `allergens` field. Old scan-history rows keep a harmless stale `allergens` key; no migration needed.

- [ ] **Step 1: Create the branch**

```bash
cd /Users/santiagoaguirre/Desktop/CODING/menu-scan-app
git checkout main && git pull && git checkout -b chore/remove-allergens
```

- [ ] **Step 2: Remove allergens from the enrich prompt**

In `supabase/functions/analyze-menu/index.ts` (~line 54), replace:

```
List "allergens" you can infer from the ingredients (e.g. dairy, nuts, gluten, shellfish, egg, soy). Use an empty allergens array when none are inferred; do not include "none". Preserve each item's name, description, price, and category exactly as given. Do NOT sort the items. Return one object per input item, in the same order.`;
```

with:

```
Preserve each item's name, description, price, and category exactly as given. Do NOT sort the items. Return one object per input item, in the same order.`;
```

- [ ] **Step 3: Remove allergens from both enrich schemas**

In `index.ts`: delete the line `allergens: { type: "array", items: { type: "string" } },` from BOTH `ENRICH_SCHEMA_GEMINI` (~line 76) and `ENRICH_SCHEMA_OPENAI` (~line 100), and delete `, "allergens"` from both `required` arrays (~lines 78 and 102).

- [ ] **Step 4: Remove allergens from the enrich types and fallback**

In `supabase/functions/analyze-menu/enrich.ts`: delete `allergens: string[];` (~line 19, the `EnrichedItem` field) and `allergens: [],` (~line 46, the fallback object).

- [ ] **Step 5: Update the enrich tests**

In `supabase/functions/analyze-menu/enrich_test.ts`: delete `allergens: [],` (~line 25) and `assertEquals(out.allergens, []);` (~line 84).

Run: `deno test supabase/functions/analyze-menu/`
Expected: all PASS.

- [ ] **Step 6: Edit AGENTS.md**

Remove these three passages (verbatim locations as of 2026-07-03):

1. The bullet `- Allergy/ingredient exclusions — Filter out items containing specific ingredients` (Filtering & Preferences).
2. The bullet beginning `- **Mandatory allergen disclaimer** — when any allergen filter is active, ...` (same list).
3. In the OCR/Extraction section, the sentence `It also **retains per-item \`allergens\`** so the mandatory allergen disclaimer above keeps working.` — keep the rest of that paragraph.

- [ ] **Step 7: Check the development plan file**

Locate the plan file (`sunny-lemon-development-plan.md`, referenced in AGENTS.md; find with `mdfind -name sunny-lemon-development-plan 2>/dev/null || find ~/Desktop/CODING -name "sunny-lemon*" -maxdepth 4 2>/dev/null`). Grep it for allergen references. Do not edit it silently — list the passages and propose edits to the user (AGENTS.md's own rule for cross-file consistency).

- [ ] **Step 8: Ask the user about the two allergen artifacts (destructive — needs confirmation)**

Ask before acting: (a) delete the unmerged branch `feat/allergen-selection` (`git branch -D feat/allergen-selection` + delete remote if pushed), and (b) delete `docs/superpowers/plans/2026-06-21-allergen-selection.md` (untracked). Do neither without an explicit yes.

- [ ] **Step 9: Verify nothing functional remains**

```bash
grep -ri allergen app components store types lib constants data hooks supabase/functions 2>/dev/null
```

Expected: no output. Then run `pnpm lint` — expected: clean.

- [ ] **Step 10: Commit and open PR**

```bash
git add supabase/functions/analyze-menu/ AGENTS.md
git commit -m "chore: remove allergen extraction, enrichment, and docs references"
```

Push and open a PR to `main` per superpowers:finishing-a-development-branch.
