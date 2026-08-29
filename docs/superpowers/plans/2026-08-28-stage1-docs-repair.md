# Stage 1 — `menu-scan-app` docs repair — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `menu-scan-app` one front door, one archive, and zero documents that assert a project status or a benchmark score.

**Architecture:** Additive-then-subtractive. Create `docs/archive/` and move every historical document into it with `git mv` (so history follows the file), rebuild the two files that had rotted beyond surgical repair (`README.md`, `START-HERE.md`), and delete status *assertions* from the files that survive — replacing each with a pointer to Linear. Nothing is deleted; every byte that leaves an active file lands in the archive.

**Tech Stack:** git, coreutils, markdown. No build, no tests, no runtime. Verification is `grep` and byte-comparison.

**Spec:** `docs/superpowers/specs/2026-08-28-kb-and-linear-design.md`

## Global Constraints

- **Repository:** work in the worktree `/Users/santiagoaguirre/Desktop/CODING/menu-scan-app/.claude/worktrees/stage2-macro-benchmark`, branch `feat/dual-pass-enrichment`. Do **not** `cd` to the main checkout.
- **Never use bare `git stash` / `git stash pop`.** The stash stack is shared with other worktrees. Use a WIP commit instead.
- **Nothing is deleted.** Every move is `git mv`. If a step seems to require `rm`, stop and ask.
- **Do not touch** `src/`, `supabase/`, `scripts/`, `assets/`, `device-scans/`, or any `*.json` fixture.
- **Files matching `docs/superpowers/plans/2026-08-28-*` and `docs/superpowers/specs/2026-08-28-*` are ACTIVE WORK.** They must never be moved into `docs/archive/`. They are this plan and its spec.
- **Linear workspace URL** (exists today, safe to link): `https://linear.app/menu-scan-app`
- **After this stage, no file outside `docs/archive/` may assert a benchmark score or a phase status.** That is the acceptance test for the whole stage.
- Commit after every task. Commit messages end with:
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  ```

---

### Task 1: Baseline — prove the tree is clean and record the starting SHA

**Files:**
- Create: none
- Modify: none

**Interfaces:**
- Consumes: nothing
- Produces: `$BASE_SHA`, the commit every later verification compares against. Tasks 6 and 8 use it via `git show $BASE_SHA:<path>`.

- [ ] **Step 1: Confirm you are in the right worktree on the right branch**

```bash
pwd
git rev-parse --abbrev-ref HEAD
```

Expected: path ends `.claude/worktrees/stage2-macro-benchmark`, branch is `feat/dual-pass-enrichment`. If either differs, **stop** — every path in this plan is relative to that worktree.

- [ ] **Step 2: Confirm no uncommitted work would be swept into this stage's commits**

```bash
git status --short
```

Expected: the only untracked entries are `.agents/`, `.claude/`, `skills-lock.json`, and the two `2026-08-28-*` files this plan ships with. If tracked files are modified, **stop and ask** — do not commit someone else's work-in-progress.

- [ ] **Step 3: Record the baseline SHA**

```bash
git rev-parse HEAD | tee /tmp/menuscan-stage1-base-sha
```

Write the value into your notes. Every "nothing was lost" check in this plan resolves against it.

- [ ] **Step 4: Commit the spec and the three plan files**

```bash
git add docs/superpowers/specs/2026-08-28-kb-and-linear-design.md docs/superpowers/plans/2026-08-28-*.md
git commit -m "docs: spec and plans for the KB migration and Linear population

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Write a real `README.md`

**Files:**
- Modify: `README.md` (currently 57 lines of unmodified `create-expo-app` boilerplate — replace entirely)

**Interfaces:**
- Consumes: nothing
- Produces: the repo's front door. Stage 2 Task 9 adds a link from here to `menu-scan-kb`; do not add that link yet — the repo does not exist until Stage 2.

- [ ] **Step 1: Confirm the current file really is boilerplate before overwriting it**

```bash
grep -c "Menu Scan\|Sunny Lemon\|macro" README.md
```

Expected: `0`. If it returns anything above zero, someone has edited it since this plan was written — **stop and read it** before replacing.

- [ ] **Step 2: Replace `README.md` with this exact content**

```markdown
# Menu Scan

Point your phone at a restaurant menu. Get the same menu back, sorted by how well each dish
matches your nutritional goals.

An Expo / React Native app. Photos of a menu go to a Supabase edge function, which reads the
items off the page, estimates each dish's macros, and returns them ranked against the goals you
picked.

## Status

**Status lives in Linear, not in this repo:** <https://linear.app/menu-scan-app>

Documents here describe how things work and why they were decided that way. They deliberately do
not claim what is done or what is next — that claim rotted in five places at once, which is the
reason this rule exists.

## Where things are

| What | Where |
|---|---|
| Product roadmap — 16 phases, bootstrap to launch | `docs/sunny-lemon-development-plan.md` |
| Engineering contract — stack, rules, model decisions | `AGENTS.md` |
| Design system | `DESIGN.md` |
| Session entry point for agents | `docs/superpowers/START-HERE.md` |
| Durable product and pipeline knowledge | the `menu-scan-kb` repo — type `/menuscan-product` |
| Closed phases, dead handoffs, historical plans and specs | `docs/archive/` |

## The pipeline, in one line

Menu photo → Mistral OCR → GPT-4.1 structuring → GPT-4o macro enrichment → a form-label call whose
grams **we** supply from a lookup table → goal-ranked results. It runs as the Supabase edge
function `analyze-menu`.

**Never quote a benchmark number out of a document.** Re-derive it through the harness in
`scripts/`. Figures written in prose are snapshots of the day they were written.

## Running it

```sh
pnpm install
./node_modules/.bin/expo start
```

Package installs go through `pnpm` and `./node_modules/.bin/expo install` — never `npm`, never a
bare `expo`. See `AGENTS.md` for why.

## Allergens

When any allergen filter is active the results screen must show, prominently and at all times:
*"AI-estimated. Confirm allergens with restaurant staff before ordering."* This is not optional
and it is not removable.
```

- [ ] **Step 3: Verify it no longer looks like boilerplate**

```bash
grep -c "create-expo-app\|npx expo start\|reset-project" README.md
grep -c "linear.app/menu-scan-app" README.md
```

Expected: `0` then `1`.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: replace Expo boilerplate README with a real front door

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Stop `AGENTS.md` asserting a score and a status

**Files:**
- Modify: `AGENTS.md` — the "Status / Pending Blockers" section beginning at or near line 526, and the stale figure at or near line 538

**Interfaces:**
- Consumes: nothing
- Produces: an `AGENTS.md` that asserts no score. Stage 2 Task 8 edits a *different* part of this file (the session-end Working Rule); the two edits must not collide.

**Why this is a deletion and not a correction.** `AGENTS.md:538` currently asserts **434–453/684 (65%)**, which is the retired ruler. The master roadmap asserts **408–435/684 (62%)**. Copying the newer figure over the older one would leave two documents asserting a live score, which is the defect. The figure's one home is the KB's `pipeline/closed-phases.md`, written in Stage 2, where it is recorded as a *closed-phase exit number with its derivation named* rather than a live claim.

- [ ] **Step 1: Locate the exact lines before editing**

```bash
grep -n '434\|453\|65%' AGENTS.md
sed -n '520,560p' AGENTS.md
```

Expected: exactly one hit for the figure, around line 538, inside the Status section. Read the surrounding 40 lines so you replace the whole assertion and not a fragment of a sentence.

- [ ] **Step 2: Replace the body of the "Status / Pending Blockers" section with this exact content**

Keep the section's existing heading. Replace everything from that heading up to the next `##`-level heading with:

```markdown
**Status is not written down here.** It lives in Linear: <https://linear.app/menu-scan-app>

This file holds the engineering contract — the stack, the rules, the model decisions, the things
that do not change when a phase closes. It deliberately asserts no phase, no score and no
"currently blocked on". Those rotted across five documents simultaneously and the fix was to give
them exactly one home.

- **Benchmark scores** — re-derive through the harness in `scripts/`. Never read one out of a
  document. The closed Phase-5 exit numbers, with the eval that produced them, are recorded once
  in the `menu-scan-kb` repo at `docs/pipeline/closed-phases.md`.
- **What is done and what is next** — Linear.
- **Which sub-phase is active** — Linear, cross-checked against
  `docs/sunny-lemon-development-plan.md` §0 (lowest unchecked sub-phase, confirm with Santiago
  before starting).
```

- [ ] **Step 3: Verify no score survives outside the archive**

```bash
grep -n '434\|453\|/684\|/96' AGENTS.md
```

Expected: **no output.** If a hit remains inside the "OCR / Extraction Model Decision" section, read it — a figure used to *explain a mechanism* ("a required schema field was 6-for-8") is knowledge and stays; a figure asserting *where the project currently scores* goes. When in doubt, ask.

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md
git commit -m "docs: AGENTS.md stops asserting status and score, points at Linear

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Create `docs/archive/` and move the historical set

**Files:**
- Create: `docs/archive/README.md`
- Move: `docs/superpowers/plans/*` (except `2026-08-28-*`), `docs/superpowers/specs/*` (except `2026-08-28-*`), `docs/superpowers/horizontal-menus/`, `docs/superpowers/extraction-eval-log.md`, `docs/superpowers/extraction-options-handoff.md`, `docs/superpowers/multi-goal-ranking-debug-handoff.md`, `docs/superpowers/macro-loop-budget.md`, `docs/superpowers/stage2-macro-benchmark.md`, `docs/superpowers/eval-038-exit-gate-3x.log`

**Interfaces:**
- Consumes: `$BASE_SHA` from Task 1
- Produces: `docs/archive/` and its index. Stage 2 Task 6 rewrites the ledger's references to point into this directory, so **the paths you create here are load-bearing** — do not restructure them later.

**What does NOT move.** These stay active: `docs/sunny-lemon-development-plan.md`, `docs/model-findings.md`, `docs/pipeline-walkthrough.html`, `docs/pipeline-walkthrough.template.html`, `docs/superpowers/START-HERE.md`, `docs/superpowers/extraction-iteration-ledger.md` (Stage 2 moves it to the KB), `docs/superpowers/competitor-analysis-2026-08-23.md`, `docs/superpowers/how-testing-works.html`, `docs/superpowers/diagrams/`, `docs/superpowers/research/`, and everything matching `2026-08-28-*`.

- [ ] **Step 1: Count what exists now, so you can prove nothing vanished**

```bash
find docs -type f | wc -l
find docs -type f | sort > /tmp/menuscan-docs-before.txt
```

Record the count.

- [ ] **Step 2: Create the archive directory and move the plans and specs, excluding active work**

```bash
mkdir -p docs/archive/plans docs/archive/specs
git mv $(git ls-files 'docs/superpowers/plans/*' | grep -v '2026-08-28-') docs/archive/plans/
git mv $(git ls-files 'docs/superpowers/specs/*' | grep -v '2026-08-28-') docs/archive/specs/
```

- [ ] **Step 3: Verify the active plan and spec did NOT move**

```bash
ls docs/superpowers/plans/ docs/superpowers/specs/
```

Expected: each directory contains **only** its `2026-08-28-*` files. If either is empty, you moved the active work — `git checkout` the move and redo Step 2 with the exclusion.

- [ ] **Step 4: Move the closed archive and the dead handoffs**

```bash
git mv docs/superpowers/horizontal-menus docs/archive/horizontal-menus
git mv docs/superpowers/extraction-eval-log.md docs/archive/
git mv docs/superpowers/extraction-options-handoff.md docs/archive/
git mv docs/superpowers/multi-goal-ranking-debug-handoff.md docs/archive/
git mv docs/superpowers/macro-loop-budget.md docs/archive/
git mv docs/superpowers/stage2-macro-benchmark.md docs/archive/
git mv docs/superpowers/eval-038-exit-gate-3x.log docs/archive/
```

- [ ] **Step 5: Prove nothing was lost**

```bash
find docs -type f | wc -l
find docs -type f | sort > /tmp/menuscan-docs-after.txt
diff <(sed 's|.*/||' /tmp/menuscan-docs-before.txt | sort) \
     <(sed 's|.*/||' /tmp/menuscan-docs-after.txt | sort)
```

Expected: the count is unchanged except for the files this plan added, and the `diff` of **basenames** is empty. A non-empty diff means a file was dropped, not moved — `git checkout` and start the task over.

- [ ] **Step 6: Write the archive index**

Create `docs/archive/README.md`:

```markdown
# Archive

Closed work. Nothing here is a task list, a status, or a current number. It is kept because the
ledger cites it constantly and because a future pipeline change will want to know what was already
tried and why it failed.

**Nothing here is an entry point.** Start at `docs/superpowers/START-HERE.md`.

| Path | What | Closed |
|---|---|---|
| `plans/` | Every execution plan from 2026-05-25 to 2026-08-25. One per feature or eval arm. | — |
| `specs/` | The design doc paired 1:1 with each plan above. | — |
| `plans/2026-07-04-ocr-extraction-master-roadmap.md` | The extraction sub-roadmap. Holds the Phase-5 closure block and its exit numbers. | 2026-08-28 |
| `horizontal-menus/` | Landscape and rotated menu handling. Shipped as edge fn v22. | 2026-08-04 |
| `stage2-macro-benchmark.md` | The Stage-2 phase log, 5,473 lines. Never a status file — it said so itself. | — |
| `extraction-eval-log.md` | Iterations 001–011 in full detail. Superseded by the ledger; do not append. | — |
| `extraction-options-handoff.md` | Options-extraction handoff. | 2026-07-03 |
| `multi-goal-ranking-debug-handoff.md` | Multi-goal ranking debug handoff. | — |
| `macro-loop-budget.md` | An $8.64 spend cap from 2026-08-09. Long spent. | 2026-08-09 |
| `eval-038-exit-gate-3x.log` | Raw run log. | — |

## Why `horizontal-menus/` used to be fenced off

It carried "⛔ CLOSED PHASE — NOT AN ENTRY POINT" banners and both `CLAUDE.md` and `AGENTS.md`
named it as forbidden, because sessions kept mistaking it for live work. Now that everything
closed lives under `docs/archive/`, the whole directory carries that meaning and the special case
is gone.
```

- [ ] **Step 7: Verify every moved file has an index row**

```bash
for f in docs/archive/*.md docs/archive/*/; do
  b=$(basename "$f")
  [ "$b" = "README.md" ] && continue
  grep -q "$b" docs/archive/README.md || echo "MISSING INDEX ROW: $b"
done
```

Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add -A docs/
git commit -m "docs: move closed plans, specs and handoffs to docs/archive/

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Update the `horizontal-menus` guards in both files

**Files:**
- Modify: `CLAUDE.md` (top banner)
- Modify: `AGENTS.md` (wherever `horizontal-menus` appears)

**Interfaces:**
- Consumes: the archive paths created in Task 4
- Produces: guards that name a path that exists. A guard naming a moved path silently stops guarding — that is the whole point of this task.

- [ ] **Step 1: Find every guard**

```bash
grep -rn "horizontal-menus" CLAUDE.md AGENTS.md docs/ --include='*.md' | grep -v '^docs/archive/'
```

Expected: hits in `CLAUDE.md` and `AGENTS.md`, possibly in `START-HERE.md` (Task 6 rebuilds that file, so ignore hits there).

- [ ] **Step 2: Rewrite the `CLAUDE.md` banner**

Replace the sentence forbidding `docs/superpowers/horizontal-menus/` with:

```markdown
> Closed work lives in `docs/archive/` — historical plans, specs and finished phases. It is
> reference, never an entry point and never a task list.
```

- [ ] **Step 3: Apply the same replacement in `AGENTS.md`**

Same wording. If `AGENTS.md` phrases its guard differently, keep its phrasing and change only the path.

- [ ] **Step 4: Verify no guard points at a path that no longer exists**

```bash
grep -rn "superpowers/horizontal-menus" CLAUDE.md AGENTS.md
ls docs/archive/horizontal-menus >/dev/null && echo "archive path OK"
```

Expected: no output from the `grep`, then `archive path OK`.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md AGENTS.md
git commit -m "docs: point the closed-phase guards at docs/archive/

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Rebuild `START-HERE.md`

**Files:**
- Create: `docs/archive/start-here-handoffs-2026.md` (the current file, verbatim)
- Modify: `docs/superpowers/START-HERE.md` (2,366 lines → ~150)

**Interfaces:**
- Consumes: `$BASE_SHA` from Task 1
- Produces: the session entry point every future agent reads first. Stage 2 Task 9 adds the KB pointer to it.

**Why rebuild rather than cut.** The file calls itself "a compact handoff pointer" and is 2,366 lines of stacked superseded handoffs. Its "where we are" block (lines ~100–152) asserts the **retired** 434–453 ruler and claims the work is "not yet merged to `main`". A surgical cut would have to judge staleness line by line across 2,366 lines. Archiving the whole file and writing a fresh one is smaller, and it is verifiable by byte-comparison.

**What survives, and where it comes from.** Three sections of the current file are durable and get carried across:

| Section | Current lines | Change on the way across |
|---|---|---|
| `## 0. THE MAP` — the glossary and the four-files trap table | 14–52 | ledger path now points at the KB; drop "Currently at eval 180" |
| `### ⚖️ THE TWO SCORES — NEVER MERGE THEM` | 89–99 | drop the "where we are" **column** — it asserts a score |
| `## 1. What am I supposed to be working on?` | 741–775 | drop the `1d` auth contradiction (commit `e64ead8` settled it: Clerk); point status at Linear |

- [ ] **Step 1: Archive the current file verbatim**

```bash
git mv docs/superpowers/START-HERE.md docs/archive/start-here-handoffs-2026.md
```

- [ ] **Step 2: Prove the archive is byte-identical to what was there**

```bash
git show $(cat /tmp/menuscan-stage1-base-sha):docs/superpowers/START-HERE.md \
  | diff - docs/archive/start-here-handoffs-2026.md && echo "IDENTICAL"
```

Expected: `IDENTICAL`. If the diff is non-empty, **stop** — you have lost content and must restore before continuing.

- [ ] **Step 3: Extract the three surviving sections into a scratch file to work from**

```bash
S=docs/archive/start-here-handoffs-2026.md
{ sed -n '14,52p' $S; echo; sed -n '89,99p' $S; echo; sed -n '741,775p' $S; } \
  > /tmp/menuscan-start-here-keep.md
wc -l /tmp/menuscan-start-here-keep.md
```

Expected: roughly 85 lines. Read it. If the line ranges have drifted (someone edited the file since this plan was written), locate the three headings by text — `## 0. THE MAP`, `### ⚖️ THE TWO SCORES`, `## 1. What am I supposed to be working on?` — and use those boundaries instead of the numbers.

- [ ] **Step 4: Write the new `docs/superpowers/START-HERE.md`**

Structure it exactly as below. Where it says *paste*, paste the corresponding block from `/tmp/menuscan-start-here-keep.md` **verbatim except for the edits named in the table above**.

```markdown
# START HERE

Entry point for any new session on Menu Scan. This file holds the **vocabulary** and the
**routing** — what the words mean, and which document answers which question.

It asserts **no status, no score, and no next action.** Those live in Linear:
<https://linear.app/menu-scan-app>. Every previous version of this file tried to hold them too,
and every one of them went stale while still being read as current.

**Repository root:** `/Users/santiagoaguirre/Desktop/CODING/menu-scan-app`. App code, edge
function, scripts, fixtures and oracles all live here. Confirm your active branch before editing.

**Durable knowledge is in a separate repo** — `menu-scan-kb`. Type `/menuscan-product` to load it.
The eval ledger, the lessons, the oracle rulings and the closed-phase numbers all moved there.

---

## 0. THE MAP — read this first if any of the words below are unfamiliar

<paste lines 14–52, with these two edits:
  - the `ledger` row now reads: the logbook, one numbered entry per experiment, newest last.
    It lives in the `menu-scan-kb` repo at `docs/pipeline/ledger.md`. It is the memory of this
    project. Do NOT state which eval number it is currently at — that is status.
  - remove any other "currently at" / "where we are" clause.>

---

## ⚖️ THE TWO SCORES — NEVER MERGE THEM

<paste lines 89–99, deleting the final "where we are" column from the table. Keep the
denominators, the coverage percentages and the explanation — those are vocabulary. Delete the
numbers that say how we are currently doing.>

**Where the score currently is:** re-derive it. Never read it out of a document, including this
one. The closed Phase-5 exit numbers and the eval that produced them are recorded once, in
`menu-scan-kb` at `docs/pipeline/closed-phases.md`.

---

## 1. What am I supposed to be working on?

**Linear is the answer:** <https://linear.app/menu-scan-app>. Open it before reading further.

<paste lines 741–775, with these edits:
  - keep the two-nested-roadmaps explanation and the "which one applies" rule — that is durable
    routing.
  - the extraction sub-roadmap has moved: its path is now
    `docs/archive/plans/2026-07-04-ocr-extraction-master-roadmap.md` and it is CLOSED. It is
    history, not a source of active work.
  - DELETE the sentence saying `1d` carries an unresolved Supabase-vs-Clerk contradiction. It was
    settled on 2026-08-28 in commit `e64ead8`: **Clerk**. `AGENTS.md` is the authority.
  - DELETE "Everything below in this file is now REFERENCE" and the historical-entry-point
    pointer — there is nothing below any more.>

---

## Where everything lives

| Question | Answer |
|---|---|
| What is done, what is next | Linear — <https://linear.app/menu-scan-app> |
| The product roadmap, 16 phases | `docs/sunny-lemon-development-plan.md` |
| The engineering contract | `AGENTS.md` |
| The design system | `DESIGN.md` |
| Why a model / prompt / oracle decision was made | `/menuscan-pipeline` |
| What was already tried and failed | the ledger — `/menuscan-pipeline` |
| Competitors, prior art | `/menuscan-research` |
| Closed phases, old plans and specs | `docs/archive/` — reference only |
| Every handoff this file used to carry | `docs/archive/start-here-handoffs-2026.md` |
```

- [ ] **Step 5: Verify the rebuilt file is short and asserts nothing**

```bash
wc -l docs/superpowers/START-HERE.md
grep -n '/684\|/96\|434\|453\|352\|SUPERSEDED\|CURRENT PHASE' docs/superpowers/START-HERE.md
```

Expected: between 120 and 170 lines, and **no output** from the grep. A hit means a status assertion survived the rebuild.

- [ ] **Step 6: Verify the glossary actually made it across**

```bash
grep -c "oracle\|band\|draw\|harness\|arm\|replay\|ledger" docs/superpowers/START-HERE.md
```

Expected: `7` or more. A zero here means you dropped THE MAP, which is the most valuable thing in the file.

- [ ] **Step 7: Commit**

```bash
git add -A docs/
git commit -m "docs: rebuild START-HERE as a 150-line router, archive the handoff strata

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Sweep the remaining active docs for status assertions

**Files:**
- Modify: `docs/sunny-lemon-development-plan.md` (header only — its per-phase `[x]`/`[~]`/`[ ]` markers STAY)
- Modify: `docs/model-findings.md` (header only, if it asserts a phase)

**Interfaces:**
- Consumes: nothing
- Produces: the state that Stage 3 depends on — Linear is the only live status, so the roadmap's checkboxes must be labelled as the *seed* Linear was built from, not a competing tracker.

**The judgement call in this task.** Sunny Lemon's checkboxes are the source Stage 3 reads to create issues. They cannot be deleted. But once Linear exists they become a **snapshot**, and a snapshot that looks like a tracker is exactly the defect this stage exists to remove. The fix is a header, not a deletion.

- [ ] **Step 1: Add this header to `docs/sunny-lemon-development-plan.md`**

Insert immediately after the existing provenance warning (around line 17), before §0:

```markdown
> ⚠️ **The checkboxes below are a SNAPSHOT, not a tracker.** They were the seed Linear was built
> from on 2026-08-28. Live status is Linear: <https://linear.app/menu-scan-app>. When the two
> disagree, **Linear wins** — update Linear, and leave these boxes as the historical record of
> what was true at seeding time. The phase *descriptions*, acceptance criteria and §2 locked
> decisions remain authoritative; only the status markers are frozen.
```

- [ ] **Step 2: Find any other active doc asserting a phase or score**

```bash
grep -rln 'CURRENT PHASE\|Phase 5 is\|currently at eval\|/684\|/96' docs/ \
  --include='*.md' | grep -v '^docs/archive/'
```

Expected: only `docs/sunny-lemon-development-plan.md` (its phase headings) and possibly `docs/model-findings.md`. For each hit, read it and decide: a number **explaining a mechanism** stays; a number **asserting where we currently stand** gets replaced by the Linear link. If you cannot tell which it is, **ask** — guessing here re-creates the defect.

- [ ] **Step 3: Commit**

```bash
git add -A docs/
git commit -m "docs: label the roadmap checkboxes as a seeding snapshot, Linear is live status

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Stage acceptance — prove the four defects are gone

**Files:**
- Create: none
- Modify: none

**Interfaces:**
- Consumes: everything above
- Produces: a green light for Stage 2. **Do not start Stage 2 until every check here passes.**

- [ ] **Step 1: Defect 1 — the front door describes the product**

```bash
grep -c "create-expo-app" README.md
grep -c "Menu Scan" README.md
```

Expected: `0` then `1` or more.

- [ ] **Step 2: Defect 2 — no active document asserts a score**

```bash
grep -rn '434\|453\|/684\|/96' --include='*.md' . \
  | grep -v '^./docs/archive/' \
  | grep -v '^./docs/superpowers/extraction-iteration-ledger.md' \
  | grep -v '^./docs/superpowers/plans/2026-08-28-' \
  | grep -v '^./docs/superpowers/specs/2026-08-28-' \
  | grep -v node_modules
```

Expected: **no output.** The ledger is excluded because Stage 2 moves it to the KB; the plan and spec are excluded because they quote the defect in order to describe it.

- [ ] **Step 3: Defect 3 — `START-HERE.md` is a pointer again**

```bash
wc -l < docs/superpowers/START-HERE.md
```

Expected: a number between 120 and 170. It was 2,366.

- [ ] **Step 4: Defect 4 — status has exactly one home**

```bash
grep -rln 'linear.app/menu-scan-app' --include='*.md' . | grep -v node_modules | sort
```

Expected: `README.md`, `AGENTS.md`, `docs/superpowers/START-HERE.md`, `docs/sunny-lemon-development-plan.md`, and the plan/spec files. Every document that used to assert status now points at the one that owns it.

- [ ] **Step 5: Nothing was lost**

```bash
git diff --stat $(cat /tmp/menuscan-stage1-base-sha) HEAD -- docs/ | tail -1
git log --oneline $(cat /tmp/menuscan-stage1-base-sha)..HEAD
```

Read the rename list. Every `docs/superpowers/... => docs/archive/...` line should be a pure rename (no content change) except `START-HERE.md`, which is a rename plus a new file.

- [ ] **Step 6: Report and stop**

Report to Santiago: the line count `START-HERE.md` went from and to, how many files moved to `docs/archive/`, and the output of Step 2 (which should be empty). **Then stop.** Stage 2 is a separate plan and a separate review gate.
