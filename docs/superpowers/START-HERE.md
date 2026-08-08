# START HERE

Entry point for any new session on Menu Scan. This file keeps only a compact handoff pointer;
the detailed, time-sensitive macro status lives in its executable plan and run ledger.

**Repository root:** `/Users/santiagoaguirre/Desktop/CODING/menu-scan-app`. App code, edge
function, scripts, fixtures, oracles, docs and ledgers all live here. Macro-enrichment work is
currently on linked-worktree branch `worktree-stage2-macro-benchmark`; confirm the active branch
before editing. Older docs reference a `.worktrees/extraction-eval-harness` folder; **it no
longer exists** (merged into `main`, eval 138). Read any such path as "this repo".

---

## 1. What am I supposed to be working on?

There are **two roadmaps, nested** — the product one, and an extraction sub-roadmap inside it.
Read them in this order and the ambiguity disappears:

**① `docs/sunny-lemon-development-plan.md` — THE PRODUCT ROADMAP.** 16 phases, bootstrap →
launch. Its §0 convention: find the lowest-numbered unchecked sub-phase and **confirm with
Santiago before starting**. Its statuses were reconciled against the real codebase on 2026-08-06
— read its PROVENANCE header first, because the file predates this repo and its original commit
hashes belong to an archived project.

**② `docs/superpowers/plans/2026-07-04-ocr-extraction-master-roadmap.md` → the `🎯 CURRENT PHASE`
block.** This is **extraction quality only** — one workstream, sitting inside Phase 9 of ①. It is
the single source of truth for what is active *within extraction*, and the only place that is
written down.

Which one applies: **product/UI/feature work → ①. Extraction accuracy, prompts, evals, oracles,
the edge function → ②.** If a phase or priority is asserted anywhere other than these two blocks,
it is stale — fix it or ignore it, never believe it. The active Stage-2 macro handoff below is
the explicit exception: it is the bounded Phase-9 workstream record, not a competing roadmap.

**Stage-2 macro-enrichment handoff (2026-08-08) — THIS IS THE ACTIVE WORK.** The benchmark is
built and frozen; two prompt/schema iterations have been measured against it; **one defect
remains**. Production is untouched — the deployed edge function still runs the original pre-B1
prompt, pinned to `gpt-4o-2024-08-06`. Phase spend to date: **$0.059**.

Read **② the roadmap's `🎯 CURRENT PHASE` block first** — it now carries the full takeover
briefing: every commit and whether it is deployed, the three runs side by side, what each proved,
the explicit next action (**B11**), and the list of things not to do without a new ruling. Then
read `docs/superpowers/stage2-macro-benchmark.md`, which is the living document (Backlog B1–B11,
Runs, Rulings). `docs/superpowers/plans/2026-08-07-stage2-macro-benchmark.md` holds the paid-run
procedure; its Tasks 1–5 are COMPLETE. The USDA plan is the frozen oracle/provenance reference:
`docs/superpowers/plans/2026-08-07-usda-macro-oracle.md`.

**One-line state:** the model portions well and, once given per-ingredient macros, totals them
correctly — the only systematic error left is that it over-states carbohydrate for vegetables and
sauces by 2.7–3.7×. B11 is a prompt sentence targeting exactly that.

ℹ️ **The suite's `1 failed` is noise.** `304 passed | 1 failed` with only `scripts/tile-cut_test.ts`
red is a CLEAN run — Santiago has ruled it unimportant and it cannot affect macros (it tests the
image tile cutter; Stage 2 never sees a photo). Any *other* failure is yours. Details in ②.

Then read:

1. ②'s **"Release scope decision"** — the numbered critical path and the POST-RELEASE list of
   things deliberately *not* to work on.
2. ②'s **"Lessons learned"** — lessons 1–27 are mistakes previous LLMs actually made in this
   codebase. Lessons 11–27 are the expensive ones. Read them before designing any rule or
   predicting any score.
3. **`docs/superpowers/extraction-iteration-ledger.md`**, newest entries LAST — every experiment
   and what was measured. Read the last few for current state; do not re-run anything REJECTED.
4. **`AGENTS.md`** and **`CLAUDE.md`** — product scope, stack, and behavioural rules. Both govern.

⚠️ **Known contradiction, unresolved:** ① specifies Supabase auth; `AGENTS.md` says "Use Clerk.
Do not build custom auth." Neither is installed. Ask Santiago before any auth work.

## 2. Santiago's standing rules

These outlive any phase.

- **He personally decides** all fixture/oracle changes, extraction-convention rulings, photo
  adjudications, and **every live-run cost approval**. Present options with a recommendation and
  WAIT. State the dollar estimate before asking.
- **Use the `superpowers:systematic-debugging` skill for ANY debugging**, and
  `superpowers:brainstorming` for ANY brainstorming of new evaluations, iterations or solutions.
- **End-of-task reports must be SIMPLE and VISUAL.** Lead with tables, plain language, and gloss
  project jargon on first use. His approval depends on understanding — and a term that implies
  something *false* is worse than a verbose one. Before asking him to authorise anything, spell
  out what it is NOT.
- **Never quote a single run as quality — report the RANGE across runs.** The model returns a
  different but equally valid item list each call.
- **A numeric scorer pass is never a gate by itself.** Every live run's raw dump must also pass a
  by-hand audit against the menu photo for invented or unprinted items.
- **A frequency claim needs a denominator.** "Reproduces reliably" / "it's rare" are claims about
  a COUNT — record the count and the machine it ran on, or write neither. (This cost two sessions:
  eval 139 called a crash "reliable" from one occurrence, eval 140 called it "rare" from two runs
  whose machine was never established. Both were wrong.)
- **Ledger every experiment** in the iteration ledger before your session ends, and commit + push
  on `main` after every commit.

## 3. Closed — do not re-enter

These phases are finished. Their folders stay in place because the ledger references their paths,
but they are history, not work:

| Area | Where | State |
|---|---|---|
| Extraction Features 1–4 | roadmap "Feature Sequence" | CLOSED — frozen as regression gates |
| Per-page multi-photo wiring | critical path #1 | CLOSED |
| Dense-menu auto-cutter | critical path #2 | CLOSED |
| Client compression fidelity | critical path #3 | CLOSED |
| Horizontal/landscape menus + rotation | `docs/superpowers/horizontal-menus/` | CLOSED |
| TestFlight photo crash | `plans/2026-08-05-testflight-photo-crash-handoff.md` | SOLVED |

## 4. Before you build anything on a device

`plans/2026-08-05-testflight-photo-crash-handoff.md` has the environment traps — iCloud
`FinderInfo` breaking `codesign`, Metro's compiled-in port, verifying a shipped bundle actually
carries its env vars. **Each of those cost a session.** Read that file's trap section before any
local iOS build or EAS build.

## 5. Non-extraction work

The master roadmap covers **extraction only** — it says so in its own scope line. App design, UI
and product behaviour are governed by `AGENTS.md` (features, stack, architecture, UI rules) and
`DESIGN.md` (the design system, which is the source of truth for typography and styling).
