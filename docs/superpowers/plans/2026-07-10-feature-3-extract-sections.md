# Feature 3 — Extract Sections & Sub-sections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Parent roadmap:** `docs/superpowers/plans/2026-07-04-ocr-extraction-master-roadmap.md`. Read its Strategy Rules before starting. Feature 1/2 close-out context: `2026-07-04-feature-1-extract-food-items.md` + `2026-07-09-feature-2-extract-food-options.md` (Execution Logs + Gotchas) and worktree ledger iterations 030–038.

**Goal:** every menu's printed section hierarchy is captured in the extraction JSON — each fixture section appears as some food item's `section_title`, no spurious sections, and trimmed item names ("Revueltos") map to their parent section ("Huevos") — passing on all 6 menus in 3/3 consecutive live runs with Features 1–2 still green.

**Architecture:** no new pipeline stages. The scorer's existing `section_context` dimension (missing/spurious sections + `section_expectations` mappings) IS Feature 3's dimension — it gets food-scoped (drinks are Feature 5) and its diagnostics get named. Fixtures get a one-time section re-adjudication from the photos (the current lists predate Features 1–2 and are provably incomplete — brasero-two's live output shows 5 "spurious" sections that are likely real printed headings). Extraction fixes follow the F2 playbook: deterministic postprocess first, P1 edits only as a last resort.

**Tech Stack:** Deno/TypeScript (eval scripts + Edge Function code), GPT-4o Vision (P1), existing `--self-check` assert harness.

## Global Constraints

- **One feature only:** sections/`section_context`. Do NOT iterate on categories, grams, option prices (F4) or drinks (F5), even when the same file is open.
- **Exit gate:** `section_context` passes on ALL 6 menus (`brasero`, `brasero-two`, `casa-nostra`, `el-marcos`, `mochomos`, `nikkori`) in 3/3 consecutive live runs, AND frozen gates `items` + `options` pass in those same runs. Feature 3 is NOT done if F1 or F2 regressed.
- **Gate runner:** `scripts/eval-027-live.ts` ONLY (routes Nikkori through the crop-merge path; the plain `eval-extraction.ts --gate` spuriously fails Nikkori's `items`). ~$0.35 per full 6-menu run; needs `OPENAI_API_KEY` in the environment.
- **Never hardcode menu-specific values** (no menu-keyed section lists, no item counts in the solution code). Fixtures/oracles are the only place menu specifics live.
- **Ledger discipline:** every iteration logs to `docs/superpowers/extraction-iteration-ledger.md` in the worktree, newest last.
- **Diagram discipline:** on close or any P1/P2/schema/flow change, update `docs/superpowers/diagrams/menu-extraction-pipeline.md` (status flags, notes, prompt appendix) and re-copy to `~/Downloads/menu-extraction-pipeline.md`.
- **F2 hard lessons (do not re-learn at cost):** GPT-4o ignores nuanced P1 prose rules in this regime and P1 wording changes trade `items` on brasero-two/nikkori (iter 032 — reverted). `detail:"high"` on non-dense pages recovers nothing (iter 035 — reverted). Prefer deterministic postprocess.
- **brasero-two runs at the items +3 edge (47/44 under per-page calls).** Any change that increases card counts can tip the frozen F1 gate.
- **Oracle changes (fixtures) require user approval** and a ledger `ORACLE-CHANGE` entry.
- **Last step of the feature: revoke any OpenAI API key pasted into chat or exposed during live evals.**

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

**Working directory:** eval work happens in the worktree `/private/tmp/menu-scan-app-extraction-eval-harness` on branch `feat/extraction-eval-harness`. (If the worktree is gone, recreate: `git worktree add /private/tmp/menu-scan-app-extraction-eval-harness feat/extraction-eval-harness`.)

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

## Reference: current harness shape (so you don't have to re-read the files)

- `scripts/eval-extraction.ts` (960 lines): `ExpectedFixture` type (has `sections: string[]`, `section_headers?: string[]`, `section_expectations: {name_contains, section_title}[]`), `normalize()` (accent-insensitive), `scoreMenu()` computes ALL dimensions per response — `section_context` today = missing sections (every `fixture.sections` entry must appear as some item's `section_title`) + spurious sections (actual section not in fixture list) + `section_expectations` mapping check, over ALL items including drinks. `gateFailures(reports, dims)` is dimension-generic. `runSelfCheck()` (line ~558) is the assert-based TDD harness, run via `deno run --allow-read scripts/eval-extraction.ts --self-check`. `--offline <dir>` re-scores saved `<menu>.actual.json` dumps at $0.
- `scripts/eval-027-live.ts` (188 lines): the ONLY gate runner. Routes nikkori via `DENSE_TILES` (4 pre-cut tiles, `detail:"high"`, **drops drink items per tile**, `mergeItemSources`); multi-photo menus (brasero-two) get one call per page + merge (iter 036); single-photo menus one production-faithful call. `GATE_DIMS = ["items", "options"]` at line ~176 — **widening it is Task 1**. `EVAL_RUNS=1` env for baselines, default 3. `EVAL_MENUS=el-marcos,brasero-two` for cheap targeted runs (NEVER for the exit gate). Dumps `<menu>.eval027-r<run>.actual.json` to `~/Downloads/MenusTesting` on failure.
- `supabase/functions/analyze-menu/postprocess.ts` (419 lines): chain `stripMenuNumbers → foldVariantCards → promoteSections → extractInlineChoices → filterServingFormatOptions`. `promoteSections` already un-folds a section GPT-4o collapsed into one null-price item (each option becomes an item with `section_title` = the folded name).
- Menu photos + saved extraction dumps: `/Users/santiagoaguirre/Downloads/MenusTesting/`. The plain `<menu>.actual.json` archives are usable for $0 offline scoring **except nikkori's** (a stale full-page run — never score nikkori offline from it; ledger iter 029).
- Offline `section_context` status on current archives (2026-07-10, pre-plan probe): brasero PASS, casa-nostra PASS, mochomos PASS; **brasero-two FAIL** (spurious: ENTRADAS, ESPECIALIDADES, Churrasquería, ENSALADAS, CALDOS; 1 wrong mapping); **el-marcos FAIL** (2 wrong mappings); nikkori FAIL (stale archive — ignore).

---

## Task 1: Widen the cumulative gate + per-menu section line in the live runner

**Files:**
- Modify: `/private/tmp/menu-scan-app-extraction-eval-harness/scripts/eval-027-live.ts` (~lines 150–176)

**Interfaces:**
- Consumes: `MenuReport.section_context: {pass, detail}` from `scoreMenu` (already exported).
- Produces: gate verdicts that include `section_context`; failure dumps triggered by section failures too. Later tasks rely on the printed line format `PASS|FAIL <menu> section_context: <detail>`.

- [ ] **Step 1: Widen `GATE_DIMS` and add the per-menu print + dump condition**

In `scripts/eval-027-live.ts`, change the `GATE_DIMS` line:

```ts
  const GATE_DIMS = ["items", "options", "section_context"] as const;
```

After the options `console.log`/breakdown block (right before the `if (!report.items.pass || !report.options.pass)` dump), add the section line and widen the dump condition:

```ts
    console.log(
      `  ${report.section_context.pass ? "PASS" : "FAIL"} ${fixture.menu} section_context: ${report.section_context.detail}`,
    );
    if (
      !report.items.pass || !report.options.pass || !report.section_context.pass
    ) {
```

(The `if` replaces the existing two-condition dump check; body unchanged.)

- [ ] **Step 2: Verify it compiles and the gate now checks three dimensions**

Run: `cd /private/tmp/menu-scan-app-extraction-eval-harness && deno check scripts/eval-027-live.ts`
Expected: no type errors. (No live run yet — that's Task 4.)

- [ ] **Step 3: Commit**

```bash
cd /private/tmp/menu-scan-app-extraction-eval-harness
git add scripts/eval-027-live.ts
git commit -m "feat(eval): F3 start — widen cumulative gate to items+options+section_context"
```

---

## Task 2: Scorer — food-scope `section_context` + named wrong-mapping diagnostics

**Files:**
- Modify: `/private/tmp/menu-scan-app-extraction-eval-harness/scripts/eval-extraction.ts` (`ExpectedFixture` type ~line 10, `scoreMenu` section block ~lines 246–276, `runSelfCheck` ~line 558)

**Interfaces:**
- Consumes: existing `foodItems` binding inside `scoreMenu` (`actual.items.filter((item) => item.category !== "drink")`) and `normalize()`.
- Produces: `ExpectedFixture.drink_sections?: string[]` (stored, NOT scored — reserved for Feature 5); `section_context.detail` that names each wrong mapping as `<item name>→<actual section|null> (expected <section>)`. Task 3's fixtures and Task 5's diagnosis depend on both.

**Why food-scoped:** the nikkori crop path drops drink items before merge (`eval-027-live.ts` line ~103), so drink sections can never appear in its output — an all-items sections check is unpassable there by construction. Drinks (and their sections) are Feature 5, mirroring how F1/F2 scoped items/options to food. Note for F4: `section_expectations` stays food-only until F5 revisits.

- [ ] **Step 1: Write the failing self-checks**

In `runSelfCheck()`, after the existing `passing`/`failing` asserts, add:

```ts
  // Feature 3: section_context is food-scoped — drink items and their sections
  // are Feature 5's dimension, neither satisfying nor polluting this one.
  const withDrink = scoreMenu(fixture, {
    image_quality: { usable: true, issues: [] },
    items: [
      ...actual.items,
      {
        name: "Mojito",
        description: "",
        price: 9,
        category: "drink",
        section_title: "Cocktails",
        options: [],
      },
    ],
  });
  assert(
    withDrink.section_context.pass,
    "a drink-only section must not count as spurious (food-scoped)",
  );
  const drinkSatisfied = scoreMenu(
    { ...fixture, sections: [...fixture.sections, "Cocktails"] },
    {
      image_quality: { usable: true, issues: [] },
      items: [
        ...actual.items,
        {
          name: "Mojito",
          description: "",
          price: 9,
          category: "drink",
          section_title: "Cocktails",
          options: [],
        },
      ],
    },
  );
  assert(
    !drinkSatisfied.section_context.pass,
    "a fixture section satisfied only by a drink item is still missing",
  );
  const namedWrong = scoreMenu(fixture, {
    image_quality: { usable: true, issues: [] },
    items: [
      { ...actual.items[0], section_title: "Sides" },
      actual.items[1],
    ],
  });
  assert(
    !namedWrong.section_context.pass &&
      namedWrong.section_context.detail.includes(
        "House Burger→Sides (expected Mains)",
      ),
    "wrong mappings must be named in the detail string",
  );
```

- [ ] **Step 2: Run self-check to verify the new asserts fail**

Run: `cd /private/tmp/menu-scan-app-extraction-eval-harness && deno run --allow-read scripts/eval-extraction.ts --self-check`
Expected: FAIL — `Self-check failed: a drink-only section must not count as spurious (food-scoped)` (or the named-detail assert, whichever trips first).

- [ ] **Step 3: Implement — food-scope the section block, name the wrong mappings, add the type field**

In `ExpectedFixture`, after `section_headers?: string[];` add:

```ts
  // Sections that group only drink items — captured at F3 adjudication so the
  // data isn't lost, scored by Feature 5, ignored until then.
  drink_sections?: string[];
```

Replace the `scoreMenu` section block (the `actualSections` / `incorrectMappings` / `sectionContext` code, currently over `actual.items`) with:

```ts
  const actualSections = new Map(
    foodItems.flatMap((item) =>
      item.section_title
        ? [[normalize(item.section_title), item.section_title] as const]
        : []
    ),
  );
  const missingSections = [...expectedSections].filter(([key]) =>
    !actualSections.has(key)
  ).map(([, section]) => section);
  const spuriousSections = [...actualSections].filter(([key]) =>
    !expectedSections.has(key)
  ).map(([, section]) => section);
  const wrongMappings = fixture.section_expectations.flatMap((expected) => {
    const item = foodItems.find((candidate) =>
      normalize(candidate.name).includes(normalize(expected.name_contains))
    );
    if (!item) return [`${expected.name_contains}→(item not found)`];
    if (
      normalize(item.section_title ?? "") === normalize(expected.section_title)
    ) return [];
    return [
      `${item.name}→${item.section_title ?? "null"} (expected ${expected.section_title})`,
    ];
  });
  const sectionContext = {
    pass: missingSections.length === 0 &&
      spuriousSections.length === 0 &&
      wrongMappings.length === 0,
    detail: `missing: ${missingSections.join(", ") || "none"}; spurious: ${
      spuriousSections.join(", ") || "none"
    }; wrong mappings: ${wrongMappings.join("; ") || "none"}`,
  };
```

(`expectedSections` construction is unchanged. Delete the old `incorrectMappings` binding — `wrongMappings` replaces it.)

- [ ] **Step 4: Run self-check to verify everything passes**

Run: `deno run --allow-read scripts/eval-extraction.ts --self-check`
Expected: PASS (all asserts, old and new). If a PRE-EXISTING assert broke, the food-scoping changed semantics an old check relied on — fix the implementation, not the old assert.

- [ ] **Step 5: Commit**

```bash
git add scripts/eval-extraction.ts
git commit -m "feat(eval): food-scope section_context + named wrong-mapping diagnostics (F3)"
```

---

## Task 3: Re-adjudicate the section oracles from the 6 photos — USER APPROVAL REQUIRED

**Files:**
- Modify: `/private/tmp/menu-scan-app-extraction-eval-harness/scripts/fixtures/*.expected.json` (all 6)

**Interfaces:**
- Consumes: menu photos in `/Users/santiagoaguirre/Downloads/MenusTesting/` (filenames in each fixture's `photos`; nikkori also has the 4 `NikkoriMenu.grid-raw-*.png` tiles); `drink_sections` field from Task 2.
- Produces: complete, food-scoped `sections` arrays + resolved `section_expectations` that Tasks 4–6 score against.

**Procedure:** read each photo and list every printed heading that groups FOOD items (the P1 rule: nearest subheading wins; parents with subheadings under them go to `section_headers`). Compare against the fixture. Then present the full proposed diff to the user — every line of it is an ORACLE-CHANGE.

- [ ] **Step 1: Adjudicate each menu from its photo and draft the fixture diffs**

Known decision items to resolve (photo-verify each; do not assume):

1. **brasero-two — likely-incomplete `sections`:** live output shows ENTRADAS, ESPECIALIDADES, ENSALADAS, CALDOS as "spurious". If printed, add them (watch case — the fixture uses title case, the model transcribes caps; `normalize()` is case-insensitive so either spelling works).
2. **brasero-two — Churrasquería (deferred here by F2):** the block prints as a section with entries Sencilla (300gr) @495 / Doble (600gr) @950 / En Taco / En Tostada / Pídelo con Queso @10. Decide: (a) add "Churrasquería" to `sections` (+ a `section_expectations` entry, e.g. Sencilla→Churrasquería); (b) whether its entries change `food_items` 44→N (this touches the FROZEN F1 oracle — brasero-two already runs 47/44, so if the model has been extracting these entries all along, the count may already absorb them; check the newest dump before proposing); (c) the "Pídelo con Queso" block-level add-on — recommend: leave as an item-level judgment this feature does NOT gate (option semantics are F2-frozen; only its SECTION attachment is F3).
3. **el-marcos — Pa' los Bukis:** currently in `sections`, but it's a $94/niño kids-combo block whose content is prose, and F2 ruled it description-only. Decide: keep in `sections` (require the combo line as an item under it) or move to `section_headers` (tolerated as a heading, not required). Recommend: move to `section_headers` — requiring a section to be *some food item's* `section_title` when its only content is one prose combo line makes the gate hostage to the model's junk-line nondeterminism (the "$94 POR NIÑO" phantom, iter 028).
4. **el-marcos — the 2 wrong mappings** in the current archive: run the Task 4 offline probe first, read the named `wrong mappings` from the new detail string, then adjudicate whether the fixture expectation or the extraction is wrong.
5. **nikkori — food/drink split:** move all drink-section entries (Cervezas, Cocteles, Margaritas, Martinis, Mojitos, Sake, Vodka, Ron, Tequila, Whisky, Digestivo, Blancos y Rosados, Tintos, Bebidas, Limonadas de Sabores, Tés Calientes o Fríos, Cocteles) to `drink_sections`, and delete the drink `section_expectations` (Tecate Roja, Nikkori Relax, Mango con chamoy, Frutos Rojos, Tradicional, Sake Pearl Bai, Grey Goose, Captain Morgan, Don Julio 70, Black Label, Carajillo, Vino Blanco, Cabernet Sauvignon, Refresco, Pepino 12 oz, Té Lipton, Nikkori November) — record them in a `drink_section_expectations` comment-equivalent only if F5 will want them (recommend: yes, add `drink_section_expectations` as a parallel unscored array so nothing is lost).
6. **nikkori — Postres inconsistency:** "Postres" sits in `section_headers` but `section_expectations` requires Pastel de zanahoria→Postres (a dessert = food-scoped). If the photo shows Postres as a direct heading with items (no subheadings), move it to `sections`.
7. **nikkori — crop reality check:** the gate extracts from 4 tiles; a heading whose items land on a different tile may be unrecoverable. Verify each remaining food section (Naturales, Empanizados, Horneados, Capeados, Postres) is on the same tile as at least one of its items before requiring it. If one isn't, flag it to the user as a known crop limitation instead of silently keeping an unpassable oracle.
8. **All menus:** confirm the food `sections` list is complete (brasero, casa-nostra, mochomos passed offline, so expect no or small diffs).

- [ ] **Step 2: Present the per-menu diff to the user and get approval**

Show old→new for every fixture field touched. Do not write files before approval.

- [ ] **Step 3: Apply the approved fixtures and re-run the self-check**

Run: `deno run --allow-read scripts/eval-extraction.ts --self-check`
Expected: PASS (fixtures are data; the self-check guards the scorer still parses them — `deno check scripts/eval-027-live.ts` too if `drink_section_expectations` was added to the type).

- [ ] **Step 4: Ledger + commit**

Append an `ORACLE-CHANGE` entry to `docs/superpowers/extraction-iteration-ledger.md` (worktree) summarizing every ruling, then:

```bash
git add scripts/fixtures/ docs/superpowers/extraction-iteration-ledger.md
git commit -m "feat(eval): F3 section-oracle re-adjudication (user-approved ORACLE-CHANGE)"
```

---

## Task 4: Free offline pre-baseline, then paid live baseline

**Files:**
- No code changes. Ledger append only.

**Interfaces:**
- Consumes: Tasks 1–3 (widened gate, food-scoped scorer, adjudicated fixtures).
- Produces: the Feature 3 baseline ledger entry — per-menu named failure list Task 5 iterates against.

- [ ] **Step 1: Offline probe ($0)**

Run: `deno run --allow-read scripts/eval-extraction.ts --offline /Users/santiagoaguirre/Downloads/MenusTesting`
Record per-menu `section_context` details. Ignore nikkori (stale full-page archive — its verdict is meaningless; ledger iter 029).

- [ ] **Step 2: Live baseline (1 run, ~$0.35)**

Run: `cd /private/tmp/menu-scan-app-extraction-eval-harness && EVAL_RUNS=1 OPENAI_API_KEY=<key> deno run --allow-read --allow-write --allow-env --allow-net scripts/eval-027-live.ts`
Expected: `items` + `options` PASS on all 6 (frozen gates — if either fails, STOP and diagnose before any F3 work; nothing has changed extraction yet, so a failure is noise or environment). Record every `section_context` line verbatim.

- [ ] **Step 3: Ledger the baseline**

Append "Eval 039 — Feature 3 LIVE baseline" to the ledger: per-menu pass/fail + named missing/spurious/wrong-mapping lists + failure-class grouping (e.g. heading-case variants, crop-boundary nulls, stray header pseudo-items). Commit:

```bash
git add docs/superpowers/extraction-iteration-ledger.md
git commit -m "docs(ledger): eval 039 — F3 live baseline (section_context)"
```

---

## Task 5: Iterate until `section_context` passes with `items`+`options` still green

**Files:**
- Modify (as hypotheses dictate): `/private/tmp/menu-scan-app-extraction-eval-harness/supabase/functions/analyze-menu/postprocess.ts` (+ its self-checks in `eval-extraction.ts`), `src/lib/adaptiveExtraction.ts` (crop-merge section handling), `scripts/eval-027-live.ts` (harness recipe only). P1 (`extract.ts`) ONLY as a last resort with a targeted 2-menu pre-flight.

**Interfaces:**
- Consumes: baseline failure classes from Task 4; `postprocessItems` chain order `stripMenuNumbers → foldVariantCards → promoteSections → extractInlineChoices → filterServingFormatOptions`.
- Produces: a run where all three gate dimensions pass on all 6 menus (the exit-gate candidate state).

**Iteration protocol (the F1/F2 loop — follow exactly):**

1. ONE lever per iteration. State the hypothesis and the expected per-menu effect BEFORE spending money.
2. Validate deterministic changes offline first (`--offline`, $0) against ALL saved dumps; postprocess changes get failing self-checks first (TDD, same `runSelfCheck` harness).
3. Cheap targeted live runs while iterating: `EVAL_MENUS=<failing menus> EVAL_RUNS=1 ...` (~$0.03–0.10). Full 6-menu single runs only to confirm a candidate.
4. Every iteration gets a ledger entry (hypothesis → result → ACCEPTED/REVERTED/DIAGNOSTIC), newest last.
5. A change that wins `section_context` but breaks `items` or `options` on ANY menu is REJECTED outright (roadmap dimension-trading rule).
6. If a failure converges to an oracle judgment call (like F2's picaña/arrachera), queue it as a user decision instead of burning runs.

**Known candidate failure classes + matching levers (from the baseline probe and F1/F2 gotchas — verify against YOUR baseline before using):**

- **Stray section-header pseudo-item** (el-marcos, ~1 in some runs; F2 gotcha): a heading extracted as a null-price item ALSO pollutes sections when it carries a `section_title`. Deterministic lever: drop a food item whose normalized name equals its own `section_title` or another item's `section_title` and that has null price and no options — a header echo, not a dish. TDD it in postprocess; watch it does NOT delete promoteSections output or real null-price dishes.
- **Crop/page-boundary section loss** (nikkori tiles, brasero-two pages): an item's heading sits on another tile → `section_title` null or wrong → missing/wrong mapping. Lever lives in `mergeItemSources` (it is already "null-section compatible" for dedup): when duplicate cards merge, prefer the non-null `section_title`. If a section is entirely headless on every tile, that's the crop-cutter limitation — surface to user, don't hack the oracle.
- **Parent-vs-subheading confusion** (nikkori Rollos vs Naturales/Empanizados/…; brasero "A las brasas"): P1 already has the nearest-subheading rule and it worked at F1 close. If it regresses, compare against `section_headers` before touching P1.
- **Sub-section hierarchy not representable:** the schema has only flat `section_title`. Feature 3's goal ("Huevos → Revueltos") needs the PARENT on trimmed items — which flat `section_title` already gives (Revueltos gets "Huevos"). Do NOT add a schema field for hierarchy unless a gate menu is unpassable without it; that would be a schema change requiring diagram discipline + user sign-off.

- [ ] **Step 1: Pick the highest-frequency failure class from the baseline; write hypothesis + expected effect in the ledger**
- [ ] **Step 2: Implement the ONE lever (TDD for postprocess/merge code: failing self-check → implement → self-check green)**
- [ ] **Step 3: Validate offline ($0), then targeted live (EVAL_MENUS), then full single run when everything looks green**
- [ ] **Step 4: Ledger the result; commit ACCEPTED changes; `git checkout` REVERTED ones byte-identical**
- [ ] **Step 5: Repeat until a full single run shows `GATE PASS: items, options, section_context` on all 6 menus**

---

## Task 6: Exit gate — 3 consecutive live runs, all green (~$1.00)

**Files:**
- No code changes. Ledger append only.

- [ ] **Step 1: Run the gate**

Run: `cd /private/tmp/menu-scan-app-extraction-eval-harness && OPENAI_API_KEY=<key> deno run --allow-read --allow-write --allow-env --allow-net scripts/eval-027-live.ts`
(Default `EVAL_RUNS=3`; NO `EVAL_MENUS` filter.)
Expected: `3/3 consecutive all-menu passing runs`, gate line reading `GATE PASS: items, options, section_context` in every run.

- [ ] **Step 2: On any failed run** — back to Task 5 with the dumped `<menu>.eval027-r<run>.actual.json`; the 3-run counter resets (consecutive means consecutive).

- [ ] **Step 3: Ledger the gate result**

```bash
git add docs/superpowers/extraction-iteration-ledger.md
git commit -m "docs(ledger): eval NNN — Feature 3 exit gate 3/3 (items+options+section_context)"
```

---

## Task 7: Close out Feature 3 — log, checklists, diagram, key hygiene

**Files:**
- Modify: this plan (Execution Log below), `docs/superpowers/plans/2026-07-04-ocr-extraction-master-roadmap.md` (Progress Checklist), `docs/superpowers/diagrams/menu-extraction-pipeline.md` (+ copy to `~/Downloads/`), worktree ledger.

- [ ] **Step 1: Fill this plan's Execution Log** (status, what failed initially, what fixed it, changes rejected, oracle rulings, final per-menu results, frozen gate for F4, gotchas for F4/F5 — mirror F2's format).
- [ ] **Step 2: Tick Feature 3 in BOTH Progress Checklists** (master roadmap + this plan's copy below).
- [ ] **Step 3: Diagram discipline:** update `menu-extraction-pipeline.md` — sections stage 🟡→🟢 with close date, note any postprocess-chain/schema change in the sequence notes and Status table, update the P1 appendix ONLY if P1 changed; copy to `~/Downloads/menu-extraction-pipeline.md`.
- [ ] **Step 4: Ledger close entry** ("Feature 3 CLOSED <date>") stating the frozen gate F4 inherits: `eval-027-live.ts` with `GATE_DIMS = ["items", "options", "section_context", "categories"]` (widen when F4 starts — F4 also adds option-price/grams scoring per the roadmap).
- [ ] **Step 5: Commit worktree + main-repo doc changes** (separate commits, matching each repo's log style).
- [ ] **Step 6: Revoke any OpenAI API key pasted into chat or otherwise exposed during live evals.**

---

## Feature 3 Execution Log

> Fill during Tasks 4–7. This is the durable record Features 4–5 read. Per-iteration detail lives in the worktree ledger; this is the feature-level summary.

**Status:** _fill at close_

**What failed initially (baseline eval 039):** _fill_

**What fixed it (change → effect):** _fill_

**Changes rejected (and why):** _fill_

**Oracle rulings (user):** _fill_

**Final results (per-menu, 3/3 runs):** _fill_

**Frozen gate inherited by Feature 4:** _fill_

**Gotchas for future features:** _fill_

---

## Progress Checklist (mirrors the roadmap)

- [x] Feature 1 — Extract all Food menu items ✅ CLOSED 2026-07-06
- [x] Feature 2 — Extract options of Food items ✅ CLOSED 2026-07-09
- [ ] Feature 3 — Extract sections & sub-sections
- [ ] Feature 4 — Extract closest section + category
- [ ] Feature 5 — Extract all Drink menu items

---

## Self-Review

- **Spec coverage:** roadmap F3 asks for (a) section hierarchy captured → `section_context` missing/spurious checks (Tasks 1–2) + hierarchy note in Task 5 (flat `section_title` already encodes parent-of-trimmed-item); (b) full-item-name rule ("Huevos → Revueltos") → `section_expectations` mapping check, el-marcos Huevos entries already in fixtures, named diagnostics in Task 2; (c) harness work "reuse sections fixture arrays" → Task 3 re-adjudication (arrays exist but are provably incomplete/misscoped — brasero-two spurious ×5, nikkori drink-section unpassability); (d) frozen gates F1+F2 → Task 1 `GATE_DIMS` + Task 5 rejection rule; (e) exit gate 3/3 via `eval-027-live.ts` → Task 6; (f) Reference Block verbatim, ledger + diagram discipline, key revocation → present. F2 handoff items landing here: Churrasquería (Task 3.2), Pa' los Bukis (Task 3.3), stray header pseudo-item (Task 5 lever 1).
- **Placeholder scan:** the only `_fill_` markers are in the Execution Log (filled at execution time — same pattern as F1/F2 plans). All code steps show complete code.
- **Type consistency:** `wrongMappings` replaces `incorrectMappings` inside `scoreMenu` only (no external consumers — `MenuReport.section_context` shape `{pass, detail}` unchanged, so Task 1's runner needs no scorer knowledge beyond the report). `drink_sections?: string[]` optional → existing fixtures parse unchanged until Task 3 adds it. Self-check stubs reuse the existing `fixture`/`actual` bindings in `runSelfCheck` scope.
