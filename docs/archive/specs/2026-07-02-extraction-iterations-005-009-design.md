# Extraction Iterations 005–009 — Design

Date: 2026-07-02
Branch: `feat/extraction-eval-harness`
Worktree: `/private/tmp/menu-scan-app-extraction-eval-harness`
Status: approved by user in brainstorming session (2026-07-02)

## Execution correction — 2026-07-03

Casa Nostra photo forensics disproved the original completeness premise. The
photo contains 23 visible items: Pasta 30–38, Insalate 40–41, Pizze 50–57,
and Frutti di mare 60–63. Numbers 39, 42–49, and 58–59 are not printed in
the supplied image; they are not missed or illegible dishes. The user
confirmed this count.

Approved corrections:

1. Change Casa Nostra ground truth from 33 to 23 visible items.
2. Re-score archived Iterations 001–004 offline with the corrected Casa
   Nostra and El Marcos fixtures. Do not repeat their paid model calls because
   the fixture errors affected scoring, not the archived OCR output.
3. Keep Iteration 006 unchanged: removing the rejected variant-folding prompt
   remains an independent, measured options/completeness hypothesis.
4. Redesign Iteration 007 as diagnostic-only:
   - retain nullable `item_number` extraction;
   - detect gaps only within one `section_title`, never across section
     boundaries;
   - report gaps in the harness but make no follow-up model call.
5. Iteration 008 does not trigger from detector output alone. A human must
   first verify that every reported number corresponds to a real printed item.
   Any gap-fill call then requires a separate follow-up design before
   implementation.

This correction supersedes later sections wherever they describe Casa Nostra
as missing ten dishes, globally contiguous number detection, or automatic
gap-fill after any detected gap.

## Context and required reading

This design continues the iteration protocol established for extraction
contract v2. Read these before executing anything:

- `CLAUDE.md` and `AGENTS.md` (repo root) — project behavioral and
  engineering rules; follow strictly.
- `docs/superpowers/extraction-eval-log.md` — append-only results log for
  Iterations 001–004; the regression-gate protocol lives here.
- `docs/superpowers/specs/2026-07-02-extraction-prompt-iterations-design.md` —
  prior design (Iterations 002–004), including the original option definition
  and escalation path.
- `docs/superpowers/specs/2026-07-02-menu-section-context-design.md` — section
  context scoring design.
- `docs/superpowers/plans/2026-07-02-extraction-prompt-iterations.md` — the
  executed plan for Iterations 002–004.
- `/Users/santiagoaguirre/.claude/plans/okay-so-this-is-mutable-wilkinson.md` —
  session plan file from the prior execution session.
- `supabase/functions/analyze-menu/extract.ts` — active EXTRACT_PROMPT
  (commit `cf741a0`: Iteration 002 option rules + Iteration 004
  nearest-subheading rule; Iteration 003 completeness rules reverted by
  `da547c0`) and EXTRACT_SCHEMA.
- `scripts/eval-extraction.ts` — the benchmark harness.
- `scripts/fixtures/*.expected.json` — ground-truth fixtures for Brasero,
  Casa Nostra, El Marcos, Mochomos, Nikkori.
- Archived raw outputs (do not overwrite):
  `/Users/santiagoaguirre/Downloads/MenusTesting/iter-001/` through
  `.../iter-004/` (plus `iter-003-attempt-1/` timeout partials). Top-level
  `*.actual.json` files are Iteration 004 outputs and are overwritten by the
  next harness run.
- Frozen model settings: `gpt-4o`, temperature `0`, seed `17`.

## What changed since Iteration 004

Two user decisions on 2026-07-02 redefine ground truth and scoring:

1. **Variants are separate items, not folded options.** "Taco de Asada / de
   Pastor / de Chorizo" (and repeated pastas, etc.) must remain individual
   menu items. The Iteration 002 variant-folding rule now instructs the
   *wrong* behavior. An option is strictly a choice **inside one printed
   dish**: protein/filling choices ("con camarón o pollo"), paid add-ons,
   dietary swaps, flavor choices. Serving formats (copa/botella,
   glass/bottle, sizes) and lists of distinct products are never options.
   Consequence: El Marcos's "over-count" and its five "missed option targets"
   were fixture errors, not model errors.
2. **Item-count tolerance.** A menu's item count PASSes when within ±3 of the
   expected count. Under this rule Nikkori's Iteration 001 baseline
   (118/120) was a PASS, and the rules added in Iterations 002–004 dragged
   it to 107 — evidence the prompt is past its instruction budget.

Priorities confirmed by the user:

- Casa Nostra's 10 missing dishes (23/33 in all four runs, always the same
  printed numbers: 39, 42–49, 58–59) must be **fixed**, not accepted.
- Printed list numbers are internal plumbing only: stripped from displayed
  names, never surfaced in the UI, used solely for gap detection.
- Cost-increasing approaches run **after** cost-neutral ones. The two-pass
  options approach is locked in as the final iteration. Testing budget is
  not a constraint; the ordering is for attribution, not cost.

## Iteration 005 — offline rework (no paid run)

All items below are validated against archived outputs and fixtures only.
Logged in the eval log as Iteration 005 with a re-scored baseline table.

1. **El Marcos fixture rework.** Rewrite
   `scripts/fixtures/el-marcos.expected.json` to separate-variant ground
   truth: expected count moves from 36 to the true unfolded count (recounted
   from the menu photo and archived outputs; **user confirms the number
   before the fixture is frozen**). Remove the five folding-based option
   targets. Remove the CHILAQUILES/HOT CAKES fold adjudication.
2. **Harness tolerance.** `scripts/eval-extraction.ts`: item count PASSes
   when `abs(actual - expected) <= 3`.
3. **Number-stripper module.** Deterministic post-processing in
   `supabase/functions/analyze-menu/` (shared by production and harness):
   when a menu-wide leading-number pattern exists (≥50% of item names match
   `^\d+[.)]?\s+`), strip the leading number from names.
   One-off names like "360 Burger" never match a menu-wide pattern and are
   untouched. Deno unit tests follow the existing test pattern.
4. **Option false-positive filter prototype.** Deterministic filter for
   serving-format options (copa/botella, glass/bottle, size words).
   Validate offline against all archived outputs: it must remove the
   Nikkori serving-format false positives without removing any true target
   (Nikkori Coladas, Brasero pastas, Casa Nostra targets). Ships only if
   that holds.
5. **Casa Nostra photo forensics.** Inspect the image region containing
   dishes 39, 42–49, 58–59 at the resolution the model receives (client
   compresses to ≤1024px JPEG q=0.7). If the miss is a legibility problem,
   record findings and reshape Iteration 007 accordingly before running it.
6. **Re-score Iteration 004 archived outputs** under the corrected fixture,
   tolerance, and post-processors. This re-scored table is the new baseline
   for Iterations 006+.

## Iteration 006 — prompt diet (paid run)

- Change: EXTRACT_PROMPT only. Remove the variant-folding sentences ("same
  base dish printed several times … ONE item named after base dish …" and
  "Never return duplicate item names variants one dish"). Keep the narrowed
  option definition, prose-choice rule, serving-format exclusion,
  distinct-products rule, and the Iteration 004 nearest-subheading rule.
- Hypothesis: removing the folding rules recovers Nikkori completeness
  toward its 118 baseline and reduces El Marcos option false positives,
  without regressing any aggregate-green dimension.
- One hypothesis per paid run; log and regression-gate as usual.

## Iteration 007 — item_number schema (paid run)

- Change: add `item_number: { type: ["string", "null"] }` to EXTRACT_SCHEMA
  items (required, nullable) and one prompt sentence: copy the printed list
  number when one is printed beside the item; keep it out of `name`; null
  when absent.
- Gap detection (deterministic, cost-free): when ≥50% of a menu's items
  carry numbers, parse them and report holes in the sequence.
  Harness reports detected gaps alongside item scores.
- Hypothesis: numbering forces row-by-row grounding and recovers some or
  all of Casa Nostra's 10 missing dishes; independent of recovery, gaps
  become machine-detectable.
- Watch item: per-item output grows on Nikkori (120 items), which already
  hit the 120s timeout once (Iteration 003 attempt 1). If a run times out,
  repeat once unchanged and record both attempts, per the Iteration 003
  precedent.
- The number-stripper from Iteration 005 remains as backstop regardless.

## Iteration 008 — conditional gap-fill (paid run; only if 007 leaves gaps)

- Trigger: gap detection still reports missing numbered dishes after 007.
- Change: one targeted follow-up call per gapped scan — "extract only the
  dishes numbered X–Y from this photo" — merged into the result by number,
  deduplicated against existing items.
- Production cost shape: clean scans cost nothing extra; only gapped scans
  pay for one extra call.

## Iteration 009 — two-pass options (paid run; last resort, runs last)

- Trigger: options still aggregate-red after Iteration 006 plus the
  deterministic filters.
- Change: split extraction into two calls. Pass 1 extracts items with a
  minimal prompt (no option rules). Pass 2 detects options only. Doubles
  per-scan extraction cost; that is why it is ordered last even though the
  testing budget is unconstrained.
- Design details (prompt split, whether pass 2 sees the photo or pass-1
  text, merging) are specified in a follow-up design if the trigger fires.

## Cross-cutting protocol (unchanged)

- Frozen settings: `gpt-4o`, temperature `0`, seed `17`.
- Every iteration (including offline 005) appended to
  `docs/superpowers/extraction-eval-log.md` with hypothesis, exact change,
  per-menu and aggregate scores, and decision.
- One hypothesis per paid run. Regression gate: if a previously
  aggregate-green dimension goes aggregate-red, revert the change and stop
  for user input.
- Archive each iteration's raw outputs under
  `/Users/santiagoaguirre/Downloads/MenusTesting/iter-NNN/`.
- Never expose or commit `.env.local`.

## Success criteria

- Items aggregate-green under the ±3 tolerance across all five menus, with
  Casa Nostra recovered (or its residual gap both detected and filled by
  Iteration 008).
- Options aggregate-green under the narrowed definition: true within-dish
  choices captured; serving-format and description-text false positives
  eliminated (deterministically or via prompt).
- No regression in categories, section context, or image quality.
- Displayed item names carry no leading menu numbers.
