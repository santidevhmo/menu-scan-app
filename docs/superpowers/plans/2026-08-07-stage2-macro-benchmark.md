# Stage-2 Macro Enrichment Benchmark — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a benchmark that measures whether Stage-2 macro estimates agree with a
Santiago-approved USDA FoodData Central recipe oracle, on three already-extracted menu items.

**Architecture:** Stage 2 is a text-only step — it takes extracted menu items as JSON and never
sees a photo. The benchmark reuses photo-verified fixture items, sends them through the real
production prompt and schema, and scores them against a frozen USDA recipe oracle. Its evidence
set is the oracle, harness, append-only log, mirror request/response, raw draws, and a limited
execution-evidence manifest.

**Tech Stack:** Deno (test + run), TypeScript, OpenAI Chat Completions
(`gpt-4o-2024-08-06`, strict `json_schema`), Supabase Edge Functions (for mirror checks).

**Spec:** `docs/superpowers/specs/2026-08-07-stage2-macro-enrichment-benchmark-design.md` —
read it before starting. This plan implements it and does not restate its rationale.

## Execution status — historical foundation

**Do not execute Tasks 1–4 again.** They are complete on branch
`worktree-stage2-macro-benchmark`:

- Task 1 — prompt/schema export: `58dfc1f`
- Task 2 — three-item fixture shell: `73efc15`
- Task 3 — pure macro scoring: `6bd5752`
- Task 4 — benchmark runner and raw-response archive: `f8ca5a2`

The unchecked boxes below are retained as the original implementation record, not a live task
list. The manual-value portions of Tasks 2 and 5 are superseded by the approved USDA plan:
`docs/superpowers/plans/2026-08-07-usda-macro-oracle.md`.

## Current handoff — 2026-08-08

**Do not execute Tasks 1–5 again.** The USDA oracle plan is complete and all benchmark evidence
is committed on branch `worktree-stage2-macro-benchmark`:

| Milestone | Commit / result |
|---|---|
| Deterministic USDA calculator, FDC helper, approved recipes, runner guard | `4300e4f` → `242ab9e` |
| Alias-based historical baseline-001 | `f32af60`; CESAR 0/3, Salmone 0/3, Pastel 2/3 |
| Pin Stage-2 production + harness and deploy it | `0476481` (deployment manually confirmed) |
| Pinned baseline-002 | `37dd47c`; CESAR 0/3, Salmone 0/3, Pastel 3/3 |
| Response-boundary hardening and final deploy | `ce91e91` (deployment manually confirmed) |

Stage 2 production requests, benchmark requests, and response metadata share the pinned
`ENRICH_MODEL = "gpt-4o-2024-08-06"`. The full raw archive, per-field ranges, ingredient
audits, Atwater checks, dispersion, and evidence limitations are in
`docs/superpowers/stage2-macro-benchmark.md`. The approved USDA rows and provenance are in
`scripts/fixtures/macro-oracle.json` and
`docs/superpowers/plans/2026-08-07-usda-macro-oracle.md`.

⚠️ **This section is the historical record up to the pinned baseline. Work has continued past
it.** For current status go to the master roadmap's `🎯 CURRENT PHASE` block, which carries the
full takeover briefing. What follows below in this file is still live and correct: the **paid-run
procedure** (mirror check, archiving, hand audit, what to report), which every iteration reuses.

**What happened after the pinned baseline (2026-08-08), in one table:**

| Commit | What | Deployed? |
|---|---|---|
| `a4ebf0f` | Oracle re-frozen under **one** printed-weight rule; $0 re-score of the archived draws | — |
| `1768a1d` | **B1** — required per-ingredient `grams` | ❌ branch only |
| `ff1b553` | iter-b1-001 measured ($0.023) | — |
| `1ce5139` | **B10** — per-ingredient macros, item totals summed in code, calories by Atwater | ❌ branch only |
| `fda94e9` | iter-b10-001 measured ($0.036) | — |

Failed field/draws (of 36), under the PASTEL beans tolerance: baseline-002r **6** →
iter-b1-001 **13** → iter-b10-001 **7**. **Neither iteration has beaten the baseline, so neither
is deployed.** Six of iter-b10-001's seven failures are a single identified defect — the model
over-states carbohydrate for vegetables and sauces by 2.7–3.7×. **Next action is B11**, a prompt
sentence targeting exactly that; see the log's B11 entry.

**Standing rules for any iteration that reuses this file's Task 5 procedure:**
- **Skip the mirror call** unless the change under test has been deployed. Comparing a changed
  harness against an unchanged edge function proves nothing and costs a call.
- **Check the harness still measures the real path.** `scripts/bench-macros.ts` parses the model
  response itself, so any change to how `enrich.ts` derives item macros must be mirrored there.
  This was missed once and caught before spending (lesson 23) — `modelValues` now imports and
  applies the real `sumIngredientMacros`.
- **Never quote a single draw.** Report the range, and count failed field/draws, not just tallies.

ℹ️ **The suite's one failing test is noise.** `304 passed | 1 failed` with only
`scripts/tile-cut_test.ts` red is a CLEAN run. Santiago has ruled it unimportant: it tests the
image tile cutter, Stage 2 is text-only and never sees a photo, and it guards code that cannot
execute under the current pipeline. Do not spend time on it. **Any other failure is yours.**

## Before you start (zero-context setup)

You need nothing from any previous conversation. Everything below is verified working as of
2026-08-07.

```bash
# 1. Get on the branch. All of this phase's work is here, NOT on main.
git fetch origin
git checkout worktree-stage2-macro-benchmark

# 2. Secrets. Both files are gitignored, so a fresh clone will NOT have them.
#    .env.local holds the project's ONLY working OPENAI_API_KEY - the repo's .env
#    has the literal placeholder string "PENDING" for that key. Ask Santiago, or
#    copy them from the primary checkout at ~/Desktop/CODING/menu-scan-app/.
#    Needed: OPENAI_API_KEY (.env.local), EXPO_PUBLIC_SUPABASE_* (.env).

# 3. Dependencies. This phase is Deno; pnpm is only needed so one pre-existing
#    Node-based test can run at all.
pnpm install --prefer-offline

# 4. Baseline. Confirm you start clean.
deno test --allow-all --quiet scripts/ supabase/
```

**Expected baseline: `304 passed | 1 failed`** (was 298 before B1/B10 added tests). The one
failure is `scripts/tile-cut_test.ts` — unimportant, ruled so by Santiago, and unable to affect
macros. It is not yours. **Any other failure is.**

Do NOT run `deno test` over the repo root: `src/` holds React Native tests whose `@/*` path
alias Deno cannot resolve, and they will fail for reasons unrelated to this work.

**Read before touching anything:** the spec (linked above), then this phase's log
`docs/superpowers/stage2-macro-benchmark.md` — its Runs table is the only record of what has
actually been measured, and its Backlog explains why several obvious-looking ideas are
deliberately not being done yet.

## Global Constraints

- **Working directory:** branch `worktree-stage2-macro-benchmark`, branched from `origin/main`
  at `04e77ab`. On this machine it is checked out as a worktree at
  `.claude/worktrees/stage2-macro-benchmark/` (gitignored); on any other machine, just check the
  branch out normally in the repo root. Nothing in the plan depends on the worktree path.
- **The Bash tool's working directory resets between calls.** Use absolute paths or `git -C`.
  (Lesson 15 — this has caused a commit on the wrong branch in this repo before.)
- **Never `git add` a directory.** Name every file you edited:
  `git add path/a.ts path/b.ts`. A directory add cannot distinguish your work from whatever
  else is sitting there. (Lesson 15, which recurred.)
- **Never run `deno fmt` over a glob that can include `scripts/fixtures/`.** It has silently
  reformatted oracle files before.
- **No new API calls beyond those named in Task 5.** No OCR, no extraction, no photo upload.
  Stage 2 is text-only.
- **Model parameters are fixed and must match production exactly:** model
  `gpt-4o-2024-08-06`,
  `temperature: 0`, `seed: 17`, `response_format` strict `json_schema`. Do not "improve" them.
- **Tolerance bands (user-approved, do not change without a ruling):** `estimated_calories`
  ±20%; `protein_g`, `carb_g`, `fat_g` ±30% each. An item passes a draw only if all four pass.
- **Never report a single run as quality.** Always report the range across draws.
- **Environment:** `OPENAI_API_KEY` is in the worktree's gitignored `.env.local` (the repo's
  `.env` has the literal placeholder `PENDING` — do not use it). Scripts read it via
  `Deno.env.get`, house style.
- **Baseline as of 2026-08-08:** `deno test --allow-all scripts/ supabase/` = **304 passed /
  1 failed** (298 at plan start; B1 and B10 added six tests). The single failure is
  `scripts/tile-cut_test.ts` — noise, see the handoff note above. Any *other* failure is yours.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `supabase/functions/analyze-menu/enrich.ts` | modify | Gains `ENRICH_PROMPT` + `ENRICH_SCHEMA_OPENAI` so scripts can import the real prompt. Already the pure, importable module. |
| `supabase/functions/analyze-menu/index.ts` | modify | Loses those two constants; imports them instead. No logic change. |
| `supabase/functions/analyze-menu/enrich_test.ts` | modify | Gains the schema field-order guard. |
| `scripts/fixtures/macro-oracle.json` | create | The three items + Santiago's manual numbers. Data he owns. |
| `scripts/macro-score.ts` | create | Pure scoring: oracle vs model → per-field verdicts. No I/O, no network. |
| `scripts/macro-score_test.ts` | create | Unit tests for scoring, including the zero-division guard. |
| `scripts/bench-macros.ts` | create | The runner: reads oracle, calls GPT-4o N times, archives raw, prints the table. |
| `scripts/bench-macros_test.ts` | create | Tests the runner's pure parts against a canned response — $0, no network. |
| `docs/superpowers/stage2-macro-benchmark.md` | create | The single append-only log: Backlog / Runs / Rulings. |

Scoring is split from the runner deliberately: scoring is pure and must be unit-testable
without spending money or touching the network.

---

### Task 1: Make the real prompt and schema importable

The harness must run **the production prompt object**, not a copy. Copying it into the script
is forbidden: lesson 23 records four separate occasions in this repo where a probe
re-implemented the real logic and produced a confident wrong number every time.

`index.ts` calls `serve()` at module scope, so it cannot be imported by a script. `enrich.ts`
is already the pure, side-effect-free module that exists for exactly this reason.

**Files:**
- Modify: `supabase/functions/analyze-menu/index.ts:23-88` (remove the two constants, import them)
- Modify: `supabase/functions/analyze-menu/enrich.ts` (add the two constants)
- Test: `supabase/functions/analyze-menu/enrich_test.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `ENRICH_PROMPT: string` and `ENRICH_SCHEMA_OPENAI: object`, both exported from
  `./enrich.ts`. Task 4 imports both.

- [ ] **Step 1: Write the failing test**

Add to `supabase/functions/analyze-menu/enrich_test.ts`. This is not a trivia test — it pins
the property that makes the chain-of-thought work. OpenAI's own schema-generation guidance
states *"field order matters. any form of 'thinking' or 'explanation' should come before the
conclusion."* If someone reorders the schema so `ingredients` lands after the macros, the model
stops reasoning before it answers and the failure is silent. This guard goes red on that.

```typescript
import {
  ENRICH_PROMPT,
  ENRICH_SCHEMA_OPENAI,
} from "./enrich.ts";

Deno.test("enrich schema generates ingredients BEFORE the macro numbers", () => {
  // OpenAI strict mode emits properties in schema declaration order, so this
  // ordering is what makes ingredients[] act as chain-of-thought rather than a
  // post-hoc label. Reordering it silently disables the reasoning step.
  const schema = ENRICH_SCHEMA_OPENAI as {
    properties: {
      items: { items: { properties: Record<string, unknown> } };
    };
  };
  const keys = Object.keys(schema.properties.items.items.properties);

  const ingredientsAt = keys.indexOf("ingredients");
  const proteinAt = keys.indexOf("protein_g");
  const caloriesAt = keys.indexOf("estimated_calories");

  assertEquals(ingredientsAt >= 0, true, "ingredients must exist in the schema");
  assertEquals(
    ingredientsAt < proteinAt,
    true,
    `ingredients (${ingredientsAt}) must precede protein_g (${proteinAt})`,
  );
  assertEquals(
    ingredientsAt < caloriesAt,
    true,
    `ingredients (${ingredientsAt}) must precede estimated_calories (${caloriesAt})`,
  );
});

Deno.test("enrich prompt still instructs the two-step ingredient-then-estimate method", () => {
  assertEquals(ENRICH_PROMPT.includes("List the most likely ingredients"), true);
  assertEquals(ENRICH_PROMPT.includes("prefer printed weights over guesses"), true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
deno test --allow-all supabase/functions/analyze-menu/enrich_test.ts
```

Expected: FAIL — `enrich.ts` does not export `ENRICH_PROMPT` or `ENRICH_SCHEMA_OPENAI` yet.

- [ ] **Step 3: Move the constants into `enrich.ts`**

Cut `ENRICH_PROMPT`, `ENRICH_INGREDIENT_PROPS` and `ENRICH_SCHEMA_OPENAI` from `index.ts`
(currently lines 23–88) and paste them into `enrich.ts`, **byte-identical**, exporting the two
that are needed. Do not retype them — copy them, so no wording changes.

At the top of `enrich.ts`, after the existing interfaces:

```typescript
// ── Stage 2 prompt + schema ─────────────────────────────────────────────────
// Exported so offline harnesses run the REAL prompt rather than a copy.
// Copying instead of importing is what lesson 23 is about.

export const ENRICH_PROMPT =
  `You estimate the nutrition profile of restaurant menu items. For each item, work step by step:
1. List the most likely ingredients. If the description names them, use them; otherwise infer from the name and category. Tag each ingredient: protein | carb | fat | veg | other.
2. From those ingredients and the likely preparation (e.g. grilled vs fried), estimate per typical single restaurant serving: protein_g, carb_g, fat_g, estimated_calories. If the item's name or description contains explicit weight or portion info — e.g. (280gr), chicken (80gr), 2 chicken breasts sliced — use it as the primary basis for gram estimates rather than a typical portion; prefer printed weights over guesses.
3. Set "confidence" to "low" only when the name and description are evocative or promotional rather than descriptive, leaving you with little ingredient information to go on.
List "allergens" you can infer from the ingredients (e.g. dairy, nuts, gluten, shellfish, egg, soy). Use an empty allergens array when none are inferred; do not include "none". Preserve each item's name, description, price, and category exactly as given. Do NOT sort the items. Return one object per input item, in the same order.`;

const ENRICH_INGREDIENT_PROPS = {
  name: { type: "string" },
  category: {
    type: "string",
    enum: ["protein", "carb", "fat", "veg", "other"],
  },
};

// Property ORDER is load-bearing: OpenAI strict mode emits fields in schema
// order, so ingredients[] must stay above the macro fields to act as
// chain-of-thought. Pinned by a test in enrich_test.ts.
export const ENRICH_SCHEMA_OPENAI = { /* …paste the existing object verbatim… */ };
```

In `index.ts`, extend the existing import from `./enrich.ts`:

```typescript
import {
  chunk,
  ENRICH_PROMPT,
  ENRICH_SCHEMA_OPENAI,
  type EnrichedItem,
  type ExtractedItem,
  reassembleEnriched,
} from "./enrich.ts";
```

- [ ] **Step 4: Run the tests to verify they pass and nothing regressed**

```bash
deno test --allow-all supabase/functions/analyze-menu/enrich_test.ts
deno test --allow-all scripts/ supabase/
```

Expected: the two new tests PASS. Full run: **268 passed / 1 failed** (the one failure is still
only `scripts/tile-cut_test.ts`). If any other test fails, you changed behaviour — revert and
re-copy the constants byte-identically.

- [ ] **Step 5: Verify the guard actually goes RED**

A guard nobody has watched fail is not a guard (lesson 24). Temporarily move the `ingredients`
property below `estimated_calories` in `ENRICH_SCHEMA_OPENAI`, re-run
`deno test --allow-all supabase/functions/analyze-menu/enrich_test.ts`, and confirm the
order test FAILS. **Then put it back** and confirm it passes again.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/analyze-menu/enrich.ts supabase/functions/analyze-menu/index.ts supabase/functions/analyze-menu/enrich_test.ts
git commit -m "refactor: export ENRICH_PROMPT and schema from enrich.ts so harnesses import the real prompt"
```

---

### Task 2: Photo-verify the three items and create the oracle file

**Files:**
- Create: `scripts/fixtures/macro-oracle.json`
- Read only: `scripts/fixtures/photos/AndaluzMenu.jpg`, `CasaNostraMenu.png`, `ElMarcosMenu.png`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `scripts/fixtures/macro-oracle.json` — an array of objects with the production
  `ExtractedItem` fields plus `printed_weight: string` and
  `oracle: { calories, protein_g, carb_g, fat_g, assumed } | null`. Tasks 3–5 read this.

- [ ] **Step 1: Verify each item's printed text against its photo**

Use the Read tool on each photo — it renders images. For each of the three items, confirm the
name, the description's ingredient list, the price, and the printed weight match what the menu
actually prints. **Adjudicate from the photo, never from the archived JSON** (lesson 4).

| Item | Photo | Expect to see |
|---|---|---|
| `CESAR (200 g)` | `AndaluzMenu.jpg` | price 275; lettuce, grated parmesan, croutons, grilled chicken, house caesar dressing |
| `Salmone toscano` | `CasaNostraMenu.png` | price 330; baked salmon, white tuscan cream, garlic, spinach, artichoke, sun-dried tomato, capers, with baguette; `200g` printed |
| `PASTEL AZTECA (300gr.)` | `ElMarcosMenu.png` | price 94; chicken, tomato sauce, green chile, onion, corn, cheese blend, served with beans |

**ABORT CONDITION (predeclared, per lesson 13):** if any item's printed text differs from the
archived text below in a way that changes its ingredients, weight or price, **stop and report
to Santiago before writing the oracle.** Do not silently correct it and do not substitute a
different item — a mismatch means extraction misread the menu, which is a finding in its own
right and is his call to adjudicate.

- [ ] **Step 2: Write the oracle file**

Create `scripts/fixtures/macro-oracle.json`. The item fields are the production `ExtractedItem`
shape and are sent to the model unchanged. `grams` is deliberately omitted — Task 4 fills it by
running the real `parseItemGrams`, so the harness cannot disagree with production about it.

`oracle` is `null` for now: **Santiago fills these by hand.** The runner refuses to score a
`null` oracle (Task 4), so an unfilled entry cannot silently produce a fake number.

```json
[
  {
    "menu": "andaluz",
    "name": "CESAR (200 g)",
    "description": "Lechuga, queso parmesano rallado, croutones,\npollo a la plancha y aderezo cesar de la casa.",
    "price": 275,
    "category": "food",
    "section_title": "ensaladas",
    "options": [],
    "printed_weight": "200 g",
    "oracle": null
  },
  {
    "menu": "casa-nostra",
    "name": "Salmone toscano",
    "description": "Salmon al horno bañado en crema toscana blanca con ajo, espinaca, alcachofa, tomate deshidratado y alcaparra, acompañado con baguette. 200g",
    "price": 330,
    "category": "food",
    "section_title": "Frutti di mare",
    "options": [],
    "printed_weight": "200g",
    "oracle": null
  },
  {
    "menu": "el-marcos",
    "name": "PASTEL AZTECA (300gr.)",
    "description": "Con pollo, salsa de tomate, chile verde, cebolla, elote y mezcla de quesos, servido con frijoles.",
    "price": 94,
    "category": "food",
    "section_title": "MEXICANOS",
    "options": [],
    "printed_weight": "300gr."
  }
]
```

Note the third entry above is missing its `oracle` key entirely — **that is a typo to fix**: add
`"oracle": null` to it so all three are uniform. (Called out rather than left silent, because a
missing key and a `null` key behave differently in Task 4's validation.)

When Santiago fills one in, it looks like:

```json
"oracle": {
  "calories": 430,
  "protein_g": 38,
  "carb_g": 14,
  "fat_g": 25,
  "assumed": "USDA FDC lookups: 150g grilled chicken breast, 60g romaine, 30g parmesan, 25g croutons, 40g full-fat caesar dressing; chicken grilled not breaded"
}
```

**The numbers must come from database lookups, not judgment** (research 2026-08-07, and
spec §4). This is measured, not stylistic: unaided nutritionists scored **42.45%** on
NutriBench's human study — *below* GPT-4o + CoT's 60.56% on the same queries — and only reached
parity (59.72%) once given database access. An unaided oracle would be a weaker instrument than
the model it grades, and every disagreement would be unattributable.

Use **USDA FoodData Central** (free public REST API, ingredient-level per-100 g composition and
standard portion gram weights) or an equivalent table, and **name the source in the `assumed`
line**, as above. For the Mexican dish (`PASTEL AZTECA`), USDA coverage is weak — SMAE or the
INSP/Zubirán Mexican composition tables are the better source, and which one was used matters
enough to record.

- [ ] **Step 3: Verify the JSON parses and the text round-trips**

```bash
deno eval 'const o = JSON.parse(Deno.readTextFileSync("scripts/fixtures/macro-oracle.json")); console.log(o.length, o.map((i)=>i.name)); console.log(o.every((i)=>"oracle" in i));'
```

Expected: `3`, the three names, and `true`.

- [ ] **Step 4: Commit**

```bash
git add scripts/fixtures/macro-oracle.json
git commit -m "test: add the macro benchmark oracle with three photo-verified items"
```

---

### Task 3: The scoring function

Pure, no network, no file I/O — so it can be tested for free and exhaustively.

**Files:**
- Create: `scripts/macro-score.ts`
- Test: `scripts/macro-score_test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type MacroValues = { calories: number; protein_g: number; carb_g: number; fat_g: number }`
  - `type FieldVerdict = { field: string; oracle: number; model: number; deltaPct: number | null; band: string; pass: boolean }`
  - `scoreItem(oracle: MacroValues, model: MacroValues): { fields: FieldVerdict[]; pass: boolean }`

  Task 4 imports `scoreItem` and `MacroValues`.

- [ ] **Step 1: Write the failing tests**

`scripts/macro-score_test.ts`:

```typescript
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { type MacroValues, scoreItem } from "./macro-score.ts";

const oracle: MacroValues = {
  calories: 530,
  protein_g: 38,
  carb_g: 45,
  fat_g: 22,
};

Deno.test("all four inside band => item passes", () => {
  const got = scoreItem(oracle, {
    calories: 505,
    protein_g: 34,
    carb_g: 52,
    fat_g: 19,
  });
  assertEquals(got.pass, true);
  assertEquals(got.fields.every((f) => f.pass), true);
});

Deno.test("calories outside 20% fails the item even when macros pass", () => {
  const got = scoreItem(oracle, {
    calories: 310,
    protein_g: 38,
    carb_g: 45,
    fat_g: 22,
  });
  assertEquals(got.pass, false);
  assertEquals(got.fields.find((f) => f.field === "calories")?.pass, false);
  assertEquals(got.fields.find((f) => f.field === "protein_g")?.pass, true);
});

Deno.test("calories band is 20% and macro band is 30% - boundary cases", () => {
  // Exactly on the boundary counts as a pass.
  const onEdge = scoreItem(oracle, {
    calories: 530 * 1.2,
    protein_g: 38 * 1.3,
    carb_g: 45 * 0.7,
    fat_g: 22 * 0.7,
  });
  assertEquals(onEdge.pass, true);

  // A hair outside the calorie band fails; the macro bands are untouched.
  const justOver = scoreItem(oracle, {
    calories: 530 * 1.21,
    protein_g: 38,
    carb_g: 45,
    fat_g: 22,
  });
  assertEquals(justOver.pass, false);

  // 25% off a macro is inside its 30% band but would be outside a calorie band -
  // proves the two bands are genuinely different, not both 20%.
  const macroSlack = scoreItem(oracle, {
    calories: 530,
    protein_g: 38 * 1.25,
    carb_g: 45,
    fat_g: 22,
  });
  assertEquals(macroSlack.pass, true);
});

Deno.test("zero oracle value uses the absolute 3g guard, not a percentage", () => {
  const zeroCarb: MacroValues = {
    calories: 400,
    protein_g: 40,
    carb_g: 0,
    fat_g: 20,
  };

  const within = scoreItem(zeroCarb, {
    calories: 400,
    protein_g: 40,
    carb_g: 3,
    fat_g: 20,
  });
  assertEquals(within.pass, true);
  assertEquals(within.fields.find((f) => f.field === "carb_g")?.deltaPct, null);

  const beyond = scoreItem(zeroCarb, {
    calories: 400,
    protein_g: 40,
    carb_g: 4,
    fat_g: 20,
  });
  assertEquals(beyond.pass, false);
});

Deno.test("verdicts report every field, in a stable order", () => {
  const got = scoreItem(oracle, oracle);
  assertEquals(got.fields.map((f) => f.field), [
    "calories",
    "protein_g",
    "carb_g",
    "fat_g",
  ]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
deno test --allow-all scripts/macro-score_test.ts
```

Expected: FAIL — `./macro-score.ts` does not exist.

- [ ] **Step 3: Write the implementation**

`scripts/macro-score.ts`:

```typescript
// Pure scoring for the Stage-2 macro benchmark. No I/O, no network - so the
// scoring rule can be tested exhaustively for $0.
//
// Bands are user-approved (2026-08-07): calories +/-20%, each macro +/-30%.
// An item passes a draw only if ALL FOUR fields pass.

export interface MacroValues {
  calories: number;
  protein_g: number;
  carb_g: number;
  fat_g: number;
}

export interface FieldVerdict {
  field: string;
  oracle: number;
  model: number;
  /** Signed % difference from the oracle; null when the oracle value is 0. */
  deltaPct: number | null;
  band: string;
  pass: boolean;
}

const CALORIE_TOLERANCE = 0.20;
const MACRO_TOLERANCE = 0.30;

// A dish can legitimately have 0g of a macro (pure-protein plates), which makes
// a percentage band undefined. Fall back to an absolute allowance.
const ZERO_ORACLE_ABS_ALLOWANCE_G = 3;

const FIELDS: { key: keyof MacroValues; tolerance: number }[] = [
  { key: "calories", tolerance: CALORIE_TOLERANCE },
  { key: "protein_g", tolerance: MACRO_TOLERANCE },
  { key: "carb_g", tolerance: MACRO_TOLERANCE },
  { key: "fat_g", tolerance: MACRO_TOLERANCE },
];

function scoreField(
  field: keyof MacroValues,
  oracleValue: number,
  modelValue: number,
  tolerance: number,
): FieldVerdict {
  if (oracleValue === 0) {
    return {
      field,
      oracle: oracleValue,
      model: modelValue,
      deltaPct: null,
      band: `<=${ZERO_ORACLE_ABS_ALLOWANCE_G}g absolute`,
      pass: Math.abs(modelValue) <= ZERO_ORACLE_ABS_ALLOWANCE_G,
    };
  }

  const deltaPct = (modelValue - oracleValue) / oracleValue;
  // Rounded before comparing so a value placed exactly on the boundary by
  // floating-point multiplication is not rejected by a 1e-16 overshoot.
  const withinBand = Math.abs(deltaPct) <= tolerance + 1e-9;

  return {
    field,
    oracle: oracleValue,
    model: modelValue,
    deltaPct,
    band: `+/-${Math.round(tolerance * 100)}%`,
    pass: withinBand,
  };
}

/** Scores one item for one draw. Passes only when every field passes. */
export function scoreItem(
  oracle: MacroValues,
  model: MacroValues,
): { fields: FieldVerdict[]; pass: boolean } {
  const fields = FIELDS.map(({ key, tolerance }) =>
    scoreField(key, oracle[key], model[key], tolerance)
  );
  return { fields, pass: fields.every((f) => f.pass) };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
deno test --allow-all scripts/macro-score_test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/macro-score.ts scripts/macro-score_test.ts
git commit -m "feat: add pure macro scoring with approved tolerance bands and zero guard"
```

---

### Task 4: The benchmark runner

**Files:**
- Create: `scripts/bench-macros.ts`
- Test: `scripts/bench-macros_test.ts`

**Interfaces:**
- Consumes: `scoreItem`, `MacroValues` from `./macro-score.ts` (Task 3); `ENRICH_PROMPT`,
  `ENRICH_SCHEMA_OPENAI` from `../supabase/functions/analyze-menu/enrich.ts` (Task 1);
  `parseItemGrams` from `../supabase/functions/analyze-menu/postprocess.ts`;
  `scripts/fixtures/macro-oracle.json` (Task 2).
- Produces:
  - `type OracleEntry` — one parsed row of the oracle file.
  - `loadOracle(path: string): OracleEntry[]` — reads and validates; throws on a `null` oracle.
  - `toExtractedItems(entries: OracleEntry[]): ExtractedMenuItem[]` — production item shape
    with `grams` filled by the real `parseItemGrams`.
  - `renderTable(results): string` — the printed report.

- [ ] **Step 1: Write the failing tests**

These cover everything except the network call, so they run for $0.

`scripts/bench-macros_test.ts`:

```typescript
import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  loadOracle,
  type OracleEntry,
  renderTable,
  toExtractedItems,
} from "./bench-macros.ts";

const ORACLE_PATH = "scripts/fixtures/macro-oracle.json";

Deno.test("the shipped oracle file has three items with the expected names", () => {
  const raw = JSON.parse(Deno.readTextFileSync(ORACLE_PATH)) as OracleEntry[];
  assertEquals(raw.length, 3);
  assertEquals(raw.map((e) => e.name), [
    "CESAR (200 g)",
    "Salmone toscano",
    "PASTEL AZTECA (300gr.)",
  ]);
});

Deno.test("loadOracle refuses to proceed while any oracle is unfilled", () => {
  const tmp = Deno.makeTempFileSync({ suffix: ".json" });
  Deno.writeTextFileSync(
    tmp,
    JSON.stringify([{
      menu: "m",
      name: "N",
      description: "",
      price: null,
      category: "food",
      section_title: null,
      options: [],
      printed_weight: "",
      oracle: null,
    }]),
  );

  assertThrows(
    () => loadOracle(tmp),
    Error,
    "oracle not filled",
  );
  Deno.removeSync(tmp);
});

Deno.test("grams comes from the real parseItemGrams, matching production", () => {
  const entries = JSON.parse(
    Deno.readTextFileSync(ORACLE_PATH),
  ) as OracleEntry[];
  const items = toExtractedItems(entries);

  // CESAR prints "(200 g)" in the NAME - space before the unit.
  assertEquals(items[0].grams, 200);
  // Salmone toscano prints "200g" at the END OF THE DESCRIPTION, not the name.
  assertEquals(items[1].grams, 200);
  // PASTEL AZTECA prints "(300gr.)" in the name - abbreviated unit with a period.
  assertEquals(items[2].grams, 300);
});

Deno.test("items sent to the model carry the full production shape", () => {
  const entries = JSON.parse(
    Deno.readTextFileSync(ORACLE_PATH),
  ) as OracleEntry[];
  const items = toExtractedItems(entries);

  // The bench-only fields must NOT leak into what the model sees, and every
  // production field must be present - otherwise this is not a mirror.
  const keys = Object.keys(items[0]).sort();
  assertEquals(keys, [
    "category",
    "description",
    "grams",
    "name",
    "options",
    "price",
    "section_title",
  ]);
});

Deno.test("renderTable reports per-draw tallies, never a single number", () => {
  const out = renderTable([{
    name: "CESAR (200 g)",
    draws: [
      { pass: true, fields: [] },
      { pass: false, fields: [] },
      { pass: true, fields: [] },
    ],
  }]);

  assertEquals(out.includes("2/3"), true);
  assertEquals(out.includes("CESAR (200 g)"), true);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
deno test --allow-all scripts/bench-macros_test.ts
```

Expected: FAIL — `./bench-macros.ts` does not exist.

- [ ] **Step 3: Write the runner**

`scripts/bench-macros.ts`. Key requirements, each of which a test above pins:

1. `loadOracle` throws `"oracle not filled"` if any entry's `oracle` is `null`/absent — an
   unfilled oracle must never silently score.
2. `toExtractedItems` strips the bench-only keys (`menu`, `printed_weight`, `oracle`) and runs
   the **real** `parseItemGrams` to fill `grams`. Import the real helper; do not re-derive the
   weight regex (lesson 23).
3. The model call uses exactly `gpt-4o`, `temperature: 0`, `seed: 17`, and
   `response_format: { type: "json_schema", json_schema: { name: "menu_items", strict: true, schema: ENRICH_SCHEMA_OPENAI } }` — identical to `enrichBatch` in `index.ts:152`.
4. The user message is `` `${ENRICH_PROMPT}\n\nMenu items (JSON):\n${JSON.stringify(items)}` `` —
   identical to `buildEnrichContent` in `index.ts:147`.
5. **Every draw's raw response is archived before anything is scored**, passing draws included
   (lesson 26), to `scripts/fixtures/caches/macro-bench.<runId>-d<N>.raw.json` where `<N>` is
   the draw index. The draw index in the filename is mandatory — an earlier probe in this repo
   wrote two pages to one path and silently analysed half its data.
6. `renderTable` prints, per item, the per-field oracle/model/delta/verdict for each draw plus
   an `N/M` tally. Never emit a lone summary number.

Run configuration via env, house style: `BENCH_DRAWS` (default `3`), `BENCH_RUN_ID`
(default an ISO timestamp).

Usage header comment, matching `scripts/eval-027-live.ts`:

```typescript
// Run: OPENAI_API_KEY=... deno run --allow-read --allow-write --allow-env --allow-net \
//        scripts/bench-macros.ts
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
deno test --allow-all scripts/bench-macros_test.ts
deno test --allow-all scripts/ supabase/
```

Expected: the new tests PASS. Full run: **273 passed / 1 failed** (only `tile-cut_test.ts`).

- [ ] **Step 5: Commit**

```bash
git add scripts/bench-macros.ts scripts/bench-macros_test.ts
git commit -m "feat: add the Stage-2 macro benchmark runner with raw-response archiving"
```

---

### Task 5: Mirror verification, the first baseline run, and the log

**This is the only task that spends money. Do not start it until Santiago has filled in all
three `oracle` blocks in `scripts/fixtures/macro-oracle.json`** — Task 4's `loadOracle` will
refuse anyway, but do not try to work around it.

**Files:**
- Modify: `docs/superpowers/stage2-macro-benchmark.md` — **already exists** (created 2026-08-07
  with the Backlog, current-behaviour and Rulings sections). Append the Runs entry; do not
  rewrite the file or reorder its sections.
- Read only: everything from Tasks 1–4

**Interfaces:**
- Consumes: the full harness from Tasks 1–4.
- Produces: the first Runs entry in the existing log.

- [ ] **Step 1: Confirm the oracle is filled and get cost approval**

```bash
deno eval 'const o=JSON.parse(Deno.readTextFileSync("scripts/fixtures/macro-oracle.json")); console.log(o.map((e)=>[e.name, e.oracle ? "FILLED" : "EMPTY"]));'
```

All three must read `FILLED`. Then tell Santiago the dollar estimate and **wait for explicit
approval before any paid call** — his standing rule. Estimate: **under $0.05** (4 GPT-4o
text-only calls: 3 draws + 1 mirror check).

- [ ] **Step 2: Run the mirror verification**

Send the same three items to the **deployed** edge function and compare against one local
harness draw. This proves the harness path is a true mirror before any number from it is
believed (lesson 20 — a rebuilt path must be shown to be a no-op first).

```bash
curl -s -X POST "https://uonuiadueykynbetxxrw.supabase.co/functions/v1/analyze-menu" \
  -H "Authorization: Bearer $EXPO_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d @scripts/fixtures/caches/macro-bench.mirror-request.json \
  > scripts/fixtures/caches/macro-bench.mirror-response.json
```

(Write the request body from `toExtractedItems` output wrapped as
`{"items": [...], "provider": "gpt-4o", "stage": "enrich"}`.)

**Expected:** the same item names, in the same order, with macro values that agree within
sampling noise. **These will not be byte-identical** — that is expected and is not a failure:
`temperature: 0` plus a fixed seed is not determinism in this codebase (lesson 1). What must
match is the shape: 3 items, in input order, all required fields present, `ingredients[]`
non-empty. If the shape differs, the harness is not a mirror — stop and diagnose before
running the baseline.

- [ ] **Step 3: Run the baseline**

```bash
OPENAI_API_KEY=$(grep '^OPENAI_API_KEY=' .env.local | cut -d= -f2-) \
BENCH_DRAWS=3 BENCH_RUN_ID=baseline-001 \
deno run --allow-read --allow-write --allow-env --allow-net scripts/bench-macros.ts \
  2>&1 | tee /tmp/macro-baseline-001.log
```

Do **not** pipe the run through `grep`/`head` — a filtered live log destroyed another run's
diagnostics in this repo (lesson 8). `tee` keeps the raw log intact.

- [ ] **Step 4: Hand-audit the raw dumps**

A numeric pass is never a gate by itself (Santiago's standing rule). Open each archived
`macro-bench.baseline-001-d*.raw.json` and read the model's `ingredients[]` for each item. Check
whether the ingredients it listed actually match the printed description — a right number
reached from a wrong ingredient list is luck, not accuracy, and will not survive to the next
menu.

Specifically check the printed-weight ambiguity flagged in the spec: for `Salmone toscano`, did
the model treat `200g` as the whole plated dish or as the salmon alone? Its ingredient list plus
the calorie total will show which.

- [ ] **Step 5: Append the run to the log**

`docs/superpowers/stage2-macro-benchmark.md` already exists and already carries its Backlog
(B1–B5), current-behaviour and Rulings sections. **Append only** — add a row to the Runs table
and a notes subsection beneath it. Do not rewrite or reorder the file.

Add to the Runs table:

```markdown
| baseline-001 | 2026-08-07 | nothing — pipeline as shipped | <per-item tallies, e.g. CESAR 3/3 · Salmone 1/3 · Pastel 0/3> | <pass / fail, and what it blocks> |
```

Then a notes subsection directly below the table:

```markdown
### baseline-001 — notes

**Per-item, per-field results:** <the table the runner printed>

**Failure list:** <every field that missed, on which item, in which draws, by how much.
This is the deliverable the backlog items get justified against — not the score.>

**Hand audit (raw dumps):** <did the model's ingredients[] match the printed description?
For Salmone toscano, did it read 200g as the whole dish or as the salmon alone?>

**Self-consistency check ($0, from the archived responses):** <do the reported macros imply
the reported calories under Atwater factors — 4 kcal/g protein, 4 kcal/g carb, 9 kcal/g fat?
Relevant to backlog B5.>

**Dispersion across draws ($0, backlog B8):** <coefficient of variation of estimated_calories
per item across the three draws. Research shows the model's own confidence label is a
near-chance failure predictor (AUROC ~0.5-0.65), while sampling dispersion is better supported -
so record whether high dispersion lines up with the items that fell outside tolerance. Three
draws is a small sample; report it as an observation, not a calibration.>

**Confidence label vs reality ($0):** <what confidence did the model self-report for each item,
and did it correspond to whether the item passed? Expect it not to - recording it either way
gives us our own evidence rather than only the literature's.>

**Archived raw responses:** `scripts/fixtures/caches/macro-bench.baseline-001-d{0,1,2}.raw.json`
```

**Every angle-bracket placeholder above must be replaced with real content before you commit.**
A log entry with a placeholder left in it is worse than no entry — the next session will read
it as fact.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/stage2-macro-benchmark.md scripts/fixtures/caches/macro-bench.baseline-001-d0.raw.json scripts/fixtures/caches/macro-bench.baseline-001-d1.raw.json scripts/fixtures/caches/macro-bench.baseline-001-d2.raw.json
git commit -m "test: record the Stage-2 macro benchmark baseline with archived raw responses"
```

- [ ] **Step 7: Report to Santiago**

Lead with a table, plain language, the range across draws — never a single run. State the
failure list explicitly: which fields on which items missed, and by how much. If a fix suggests
itself, say so as a hypothesis with the assertions it would flip named, or write "unknown"
(lesson 16).

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §2 pipeline facts (prompt/schema importable) | Task 1 |
| §3 three items + photo verification + abort condition | Task 2 |
| §4 oracle format incl. `assumed` | Task 2 |
| §5 harness, real prompt import, archiving, mirror check | Tasks 1, 4, 5 |
| §6 scoring, bands, range reporting, zero guard | Task 3, Task 4 step 1 |
| §7 vague descriptions | Deferred by the spec itself — no task, correctly |
| §8 backlog B1/B2/B3 | Task 5 step 5 (seeded into the log) |
| §9 three artifacts | Tasks 2, 4, 5 create exactly those three |
| §10 method | Task 5 steps 4, 7 |
| §11 cost | Task 5 step 1 |
| §12 definition of done | Task 5 steps 1–6 |

**Placeholder scan:** the only intentional blanks are (a) `oracle: null` in the oracle file,
which is human input Santiago supplies and which `loadOracle` refuses to score, and (b) the
*fill in* cells in the log template, which Task 5 step 5 explicitly requires replacing before
commit. Both are called out at their use site. Task 1 step 3 shows the schema object as a
`/* paste verbatim */` comment **deliberately** — retyping it risks a silent wording change,
and copying is the instruction.

**Type consistency:** `MacroValues`, `FieldVerdict` and `scoreItem` are defined in Task 3 and
used with those exact names in Task 4. `ENRICH_PROMPT` / `ENRICH_SCHEMA_OPENAI` are exported in
Task 1 and imported in Task 4. `OracleEntry`, `loadOracle`, `toExtractedItems`, `renderTable`
are declared in Task 4's Interfaces block and tested by those names in its step 1.
`ExtractedMenuItem` is the existing type from `supabase/functions/analyze-menu/extract.ts:170`.
