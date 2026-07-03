# Extraction Prompt Iterations 002–004 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run three focused, logged prompt iterations that turn the item-completeness and option-detection dimensions green on the five-menu benchmark without regressing categories, section context, or image quality.

**Architecture:** Each iteration edits only `EXTRACT_PROMPT` in the shared extraction module (plus two one-time ground-truth fixture corrections), appends a pre-run entry to the append-only eval log, runs the local Deno harness against the five real menus, and records results and a decision before the next iteration starts.

**Tech Stack:** Deno, TypeScript, OpenAI GPT-4o Vision (temperature 0, seed 17), existing harness `scripts/eval-extraction.ts`.

**Approved spec:** `docs/superpowers/specs/2026-07-02-extraction-prompt-iterations-design.md`

## Global Constraints

- Work in worktree `/private/tmp/menu-scan-app-extraction-eval-harness`, branch `feat/extraction-eval-harness`. All relative paths below are from the worktree root.
- Model settings are frozen: `gpt-4o`, `temperature: 0`, `seed: 17`. Do not change them.
- `docs/superpowers/extraction-eval-log.md` is append-only. Write the iteration entry BEFORE the paid run; append results and a decision AFTER. Never edit or delete earlier entries.
- One prompt hypothesis per paid run. Fixture corrections in Task 1 are scoring changes and are logged as such inside the Iteration 002 entry.
- `.env.local` in the worktree root holds `OPENAI_API_KEY`. Never print, echo, or commit its contents.
- Archive each run's raw outputs before the next run overwrites them (steps below do this explicitly).
- Regression gate: if a dimension that was aggregate-PASS in the previous iteration becomes aggregate-FAIL, revert that iteration's prompt commit (`git revert`), record the revert and reasoning in the log, and stop for user input.
- The photo directory `/Users/santiagoaguirre/Downloads/MenusTesting/` is outside the repo; nothing there is committed.

---

### Task 1: Ground-truth fixture corrections (scoring change for Iteration 002)

**Files:**
- Modify: `scripts/fixtures/nikkori.expected.json`
- Modify: `scripts/fixtures/casa-nostra.expected.json`

**Interfaces:**
- Produces: corrected fixtures consumed by `scripts/eval-extraction.ts` (scoring semantics: an options target is matched by normalized `name_contains` substring; each listed option name must appear as a substring of some extracted option; any options-bearing item not matching a target is a false positive).

- [ ] **Step 1: Add Coladas as a Nikkori options target**

In `scripts/fixtures/nikkori.expected.json`, replace:

```json
  "items_with_options": [],
```

with:

```json
  "items_with_options": [
    {
      "name_contains": "Coladas",
      "options": ["Piña", "Fresa", "Limón", "Mango"]
    }
  ],
```

Rationale (confirmed option definition): colada flavors are a composition choice, so `Coladas` is a legitimate options item. Wine copa/botella formats and bottle-only listings remain non-options and will count as false positives.

- [ ] **Step 2: Make the Casa Nostra options target robust to 1-char OCR wobble**

In `scripts/fixtures/casa-nostra.expected.json`, replace:

```json
    {
      "name_contains": "Spaghetti ai frutti di mare ubriaca",
      "options": []
    }
```

with:

```json
    { "name_contains": "frutti di mare", "options": [] }
```

`"frutti di mare"` matches only the Spaghetti item among extracted names (the section name is not an item), and survives the observed `ubricca`/`ubriaca` transcription wobble.

- [ ] **Step 3: Verify fixtures parse and harness self-check passes**

Run from the worktree root:

```bash
deno run --allow-read scripts/eval-extraction.ts --self-check
```

Expected: exit 0, five-dimension self-check report. Also confirm both files are valid JSON:

```bash
jq . scripts/fixtures/nikkori.expected.json scripts/fixtures/casa-nostra.expected.json > /dev/null && echo OK
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add scripts/fixtures/nikkori.expected.json scripts/fixtures/casa-nostra.expected.json
git commit -m "test: correct nikkori and casa-nostra options ground truth"
```

---

### Task 2: Iteration 002 prompt edit — option definition, variant folding, prose choices

**Files:**
- Modify: `supabase/functions/analyze-menu/extract.ts:21-22` (the two option sentences inside `EXTRACT_PROMPT`)

**Interfaces:**
- Produces: updated `EXTRACT_PROMPT` consumed by both the Edge Function and `scripts/eval-extraction.ts` via `runExtraction`. Schema, types, and function signatures are unchanged.

- [ ] **Step 1: Replace the option sentences in `EXTRACT_PROMPT`**

In `supabase/functions/analyze-menu/extract.ts`, replace this text inside the template literal:

```
Capture each printed choice or paid add-on in options. Include its printed price and
weight in grams when present; otherwise use null. Do not move options into the description.
```

with:

```
An option is a printed choice about one item's composition: a protein or filling
choice, a paid add-on, a dietary swap, or a flavor choice. Capture each option with
its printed price and weight in grams when present; otherwise use null.
Serving formats and sizes (glass vs bottle, copa vs botella, small vs large) are
NOT options. Distinct products listed under a shared heading are separate items,
not options.
When the same base dish is printed several times with different fillings, proteins,
or preparations, return ONE item named after the base dish and put each printed
variant in options. Never return duplicate item names for variants of one dish.
A choice printed inside a description ("con X o Y", "choice of X or Y") is an
options list; capture each choice in options. Do not move options into the description.
```

All other prompt lines stay byte-identical.

- [ ] **Step 2: Static checks**

```bash
deno check supabase/functions/analyze-menu/extract.ts supabase/functions/analyze-menu/index.ts
deno test supabase/functions/analyze-menu/
```

Expected: check passes; both existing tests pass (they pin the schema and transport, not the prompt text).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/analyze-menu/extract.ts
git commit -m "feat: iteration 002 prompt - option definition and variant folding"
```

---

### Task 3: Iteration 002 run and record

**Files:**
- Modify: `docs/superpowers/extraction-eval-log.md` (append only)

**Interfaces:**
- Consumes: Task 1 fixtures, Task 2 prompt, `runExtraction` via `scripts/eval-extraction.ts`.
- Produces: Iteration 002 log entry with per-menu scores and a decision that gates Task 4.

- [ ] **Step 1: Archive the Iteration 001 raw outputs (they are otherwise overwritten)**

```bash
mkdir -p /Users/santiagoaguirre/Downloads/MenusTesting/iter-001
cp /Users/santiagoaguirre/Downloads/MenusTesting/*.actual.json /Users/santiagoaguirre/Downloads/MenusTesting/iter-001/
```

- [ ] **Step 2: Append the pre-run Iteration 002 entry to the log**

Append to `docs/superpowers/extraction-eval-log.md` (fill the commit hash from `git rev-parse --short HEAD`):

```markdown
## Iteration 002 — Option definition and variant folding

- Date: <today>
- Commit: `<short hash of the Task 2 commit>`
- Model: `gpt-4o`
- Temperature: `0`
- Seed: `17`
- Hypothesis: the baseline's option failures share three prompt gaps — no
  composition-based option definition (Nikkori false positives), no variant
  folding (El Marcos duplicate items with empty options), and no prose-choice
  rule (Brasero's "Camarón o Pollo"). Encoding those three rules turns options
  green and removes El Marcos's variant-driven over-count without regressing
  green dimensions.
- Change from previous iteration: EXTRACT_PROMPT only — replaced the two
  option sentences with an option definition (composition choices; serving
  formats and product lists excluded), a variant-folding rule, and a
  prose-choice rule. Scoring change shipped alongside (recorded here, distinct
  from the prompt hypothesis): nikkori fixture gains the Coladas options
  target per the confirmed option definition; casa-nostra options target
  substring shortened to "frutti di mare" to survive a 1-char OCR wobble.
- Fixtures: Brasero, Casa Nostra, El Marcos, Mochomos, Nikkori.
- Raw outputs: `/Users/santiagoaguirre/Downloads/MenusTesting/iter-002/*.actual.json`
  (Iteration 001 outputs archived in `.../iter-001/`).
```

- [ ] **Step 3: Run the harness (paid run)**

```bash
OPENAI_API_KEY=$(sed -n 's/^OPENAI_API_KEY=//p' .env.local) \
deno run --allow-read --allow-write=/Users/santiagoaguirre/Downloads/MenusTesting \
  --allow-env=OPENAI_API_KEY --allow-net=api.openai.com \
  scripts/eval-extraction.ts
```

Expected: per-menu + aggregate five-dimension report printed. Then archive:

```bash
mkdir -p /Users/santiagoaguirre/Downloads/MenusTesting/iter-002
cp /Users/santiagoaguirre/Downloads/MenusTesting/*.actual.json /Users/santiagoaguirre/Downloads/MenusTesting/iter-002/
```

- [ ] **Step 4: Append results, analysis, and decision to the log entry**

Record the full per-menu and aggregate table (same format as Iteration 001), what improved, what regressed, and the decision. Analysis notes specific to this iteration:

- El Marcos: expect items to drop from 45 toward 36 and the five options
  targets (Fritos, De la Sierra, Waffles, Plato Surtido, Revueltos) to carry
  options. Known ambiguity: if the model also folds CHILAQUILES (×3) or HOT
  CAKES (×2) into single options-bearing items, those score as false-positive
  options because ground truth does not list them as options items — and the
  folded count may land below 36. Do NOT patch the prompt for this. Record it
  and ask the user to adjudicate against the photo (are these one dish with
  variants, or separately printed dishes?); the fixture, not the prompt, is
  corrected if the user says they are variants.
- Nikkori: expect exactly one options item (Coladas); every copa/botella or
  bottle-only wine option must be gone.
- Brasero: expect Pasta Alfredo AND Pasta Parmesano options targets to pass.
- Regression gate (Global Constraints) applies: items/categories/sections/
  image-quality dimensions that were green in 001 must not go aggregate-red.

- [ ] **Step 5: Commit the log entry**

```bash
git add docs/superpowers/extraction-eval-log.md
git commit -m "docs: record extraction iteration 002 results"
```

If the regression gate fired: `git revert` the Task 2 commit, append the revert decision to the log, commit, and stop for user input.

---

### Task 4: Iteration 003 — completeness on numbered/dense menus

Gated on: Task 3 decision says proceed.

**Files:**
- Modify: `supabase/functions/analyze-menu/extract.ts` (`EXTRACT_PROMPT` only)
- Modify: `docs/superpowers/extraction-eval-log.md` (append only)

**Interfaces:**
- Consumes: Iteration 002 prompt as committed.
- Produces: Iteration 003 log entry and decision gating Task 5.

- [ ] **Step 1: Add completeness rules to `EXTRACT_PROMPT`**

In `supabase/functions/analyze-menu/extract.ts`, replace:

```
There is no maximum number of items; keep going until every readable item is returned.
```

with:

```
There is no maximum number of items; keep going until every readable item is returned.
If the menu numbers its items, every printed number must appear exactly once; a gap
in the number sequence means a missed item — go back and extract it.
Read every column of every photo top to bottom; finish each column before moving on.
```

- [ ] **Step 2: Static checks**

```bash
deno check supabase/functions/analyze-menu/extract.ts supabase/functions/analyze-menu/index.ts
deno test supabase/functions/analyze-menu/
```

Expected: pass.

- [ ] **Step 3: Commit the prompt edit**

```bash
git add supabase/functions/analyze-menu/extract.ts
git commit -m "feat: iteration 003 prompt - numbered-item and column completeness"
```

- [ ] **Step 4: Append the pre-run Iteration 003 log entry**

Same template as Task 3 Step 2, with:

- Hypothesis: Casa Nostra's 10 missing items are skipped numbered rows
  (extracted numbers gap at 39, 42–49, 58–59) and Nikkori misses 2 of 120;
  an explicit printed-number completeness rule plus column-scan instruction
  recovers them without inflating counts elsewhere.
- Change from previous iteration: EXTRACT_PROMPT only — added the two
  completeness sentences after the no-maximum rule. No scoring changes.
- Raw outputs: `.../iter-003/*.actual.json`.

- [ ] **Step 5: Run the harness and archive**

Same run command as Task 3 Step 3, then:

```bash
mkdir -p /Users/santiagoaguirre/Downloads/MenusTesting/iter-003
cp /Users/santiagoaguirre/Downloads/MenusTesting/*.actual.json /Users/santiagoaguirre/Downloads/MenusTesting/iter-003/
```

- [ ] **Step 6: Append results and decision; commit**

Targets: Casa Nostra 33/33, Nikkori 120/120, El Marcos stays at its
post-folding count, options stays green. Regression gate applies. If Casa
Nostra completeness still fails, the logged decision is the spec's measured
escalation: a follow-up iteration adding `item_number: string | null` to
`EXTRACT_SCHEMA` (own iteration, own log entry — not part of this plan's
tasks). Commit:

```bash
git add docs/superpowers/extraction-eval-log.md
git commit -m "docs: record extraction iteration 003 results"
```

---

### Task 5: Iteration 004 — nearest subheading, never the parent

Gated on: Task 4 decision says proceed.

**Files:**
- Modify: `supabase/functions/analyze-menu/extract.ts` (`EXTRACT_PROMPT` only)
- Modify: `docs/superpowers/extraction-eval-log.md` (append only)

**Interfaces:**
- Consumes: Iteration 003 prompt as committed.
- Produces: Iteration 004 log entry and final aggregate verdict for Task 6.

- [ ] **Step 1: Sharpen the nested-heading rule in `EXTRACT_PROMPT`**

In `supabase/functions/analyze-menu/extract.ts`, replace:

```
Use only the closest heading when headings are nested. Set section_title to null
```

with:

```
When a heading contains smaller subheadings, each item belongs to its nearest
subheading, never the parent (a spirits list under a parent heading with per-spirit
subheadings uses the spirit subheading). Use only printed headings; never invent
a grouping that is not printed on the menu. Set section_title to null
```

- [ ] **Step 2: Static checks**

```bash
deno check supabase/functions/analyze-menu/extract.ts supabase/functions/analyze-menu/index.ts
deno test supabase/functions/analyze-menu/
```

Expected: pass.

- [ ] **Step 3: Commit the prompt edit**

```bash
git add supabase/functions/analyze-menu/extract.ts
git commit -m "feat: iteration 004 prompt - nearest subheading over parent heading"
```

- [ ] **Step 4: Append the pre-run Iteration 004 log entry**

Same template, with:

- Hypothesis: Nikkori's section failure is parent-heading capture (LICORES
  instead of Vodka/Ron/Tequila/Whisky/Digestivo) plus invented groupings
  (ROLLOS, SANGRÍA); an explicit nearest-subheading rule with a spirits
  example fixes the 5 missing + 3 spurious sections and the 9 wrong mappings.
- Change from previous iteration: EXTRACT_PROMPT only — replaced the
  one-line nested-heading sentence with the subheading rule. No scoring
  changes.
- Raw outputs: `.../iter-004/*.actual.json`.

- [ ] **Step 5: Run the harness and archive**

Same run command, then:

```bash
mkdir -p /Users/santiagoaguirre/Downloads/MenusTesting/iter-004
cp /Users/santiagoaguirre/Downloads/MenusTesting/*.actual.json /Users/santiagoaguirre/Downloads/MenusTesting/iter-004/
```

Note: Brasero is the other nested-heading menu (`A las brasas` parent over
Carne/Mariscos/Pollo y Puerco) and passed in 001 — watch it for regression
from this rule specifically.

- [ ] **Step 6: Append results and decision; commit**

Target: Nikkori section dimension PASS; all other dimensions hold. Regression
gate applies (Brasero sections especially). Commit:

```bash
git add docs/superpowers/extraction-eval-log.md
git commit -m "docs: record extraction iteration 004 results"
```

---

### Task 6: Wrap-up — aggregate verdict and handoff state

**Files:**
- Modify: `docs/superpowers/extraction-eval-log.md` (append only, short status note)

- [ ] **Step 1: Append a status note to the log**

After Iteration 004's entry, append a short `### Status after Iteration 004`
note: which of the five dimensions are aggregate-green, which (if any)
remain red, and the single next action (either "extraction contract v2
proven on the benchmark; ready to plan Edge Function/Stage 2 integration"
or the specific escalation named in the failing iteration's decision).

- [ ] **Step 2: Verify branch is clean and all work is committed**

```bash
git status --short   # expect: empty
git log --oneline -12
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/extraction-eval-log.md
git commit -m "docs: extraction benchmark status after iteration 004"
```
