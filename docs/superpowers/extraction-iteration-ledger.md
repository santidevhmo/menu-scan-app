# Extraction Iteration Ledger

Working memory for the prompt-iteration loop. READ TOP TO BOTTOM BEFORE EVERY ITERATION.
Rules:
- One entry per iteration, newest LAST. Max ~15 lines per entry.
- Never re-try a hypothesis whose Verdict is REVERTED — the Lesson line says why.
- Full historical detail (iterations 001–011) lives in extraction-eval-log.md; do not append there.
- Fixtures frozen at commit 99b396b (be2611f + JSON comma syntax fix). Scorer/fixture changes require user approval and get their own entry with Verdict ORACLE-CHANGE.

## Do-not-repeat summary (iterations 001–011)

- 001 (`dd9d450`) — single strict structured-output baseline. Strongest overall; options dimension failed (missed targets + false positives), everything else mostly passed.
- 002 (`40f7f09`) — option definition + variant folding. REVERTED: variant folding inflated item counts (El Marcos 46, Nikkori 125) and produced up to 19 option false positives on Nikkori. Do not re-add variant-folding language.
- 003 (`f90991f`) — numbered-item/column completeness rules. REVERTED: did not fix Casa Nostra count, introduced section-header items on El Marcos.
- 004 (`cf741a0`) — nearest-subheading-over-parent-heading rule. REVERTED: Nikkori dropped to 107/120 items and option false positives grew.
- 005 — offline re-baseline + fixture forensics (no paid run). Found Casa Nostra ground truth was wrong (23 was correct, not 33). Iteration 001 outputs re-scored best under corrected fixtures.
- 006 — prompt diet (strip folding sentences). REVERTED: El Marcos lost a section, Nikkori fell to 106/120.
- 007 — nullable `item_number` diagnostics field. REVERTED: El Marcos collapsed to 40/45 items.
- 008 — no entry found in old log (numbering gap; treat as unused).
- 009 — two-pass indexed options extraction. REVERTED: option false positives exploded (El Marcos 14, every menu ≥2).
- 010 — priced-children sections + concept-based two-pass options. REVERTED: Nikkori 99/120 items, section_context worse; two-pass approach abandoned.
- 011 — single-pass 001 baseline + nutrition-material option rule. REVERTED: Brasero Two 18/25 items, El Marcos 4 missed option targets.
- Cross-cutting lessons: (a) variant-folding and two-pass options both trade item accuracy for option coverage and always net-lose; (b) Nikkori item count is highly sensitive to any prompt addition (99–125 range observed); (c) fixtures were edited alongside prompts through 011, so historical rankings are not apples-to-apples — Task 4 offline re-score supersedes them.

## Re-baseline — offline re-score of all archives against frozen oracle
- Date: 2026-07-04 | Prompt change: none (offline re-score only)
- Per-menu passes under frozen fixtures (max 25 for 5-menu archives, 30 for 6-menu):
  001=19/25, 002=18/25, 003=17/25, 003-attempt-1=16/20, 004=17/25, 006=18/25, 007=17/25, 009=18/25, 010=22/30, 011=20/30
- On the shared 5-menu subset: 010=18/25, 011=18/25 → **iteration 001 (`dd9d450`) is best-known** (19/25).
- Skips: brasero-two actual.json missing from all archives except 010/011; iter-003-attempt-1 also missing nikkori; no archives exist for 005/008. Recorded honestly.
- Current EXTRACT_PROMPT verified byte-identical to dd9d450 — no restore needed.
- Verdict: ORACLE-CHANGE (this ranking supersedes all rankings in extraction-eval-log.md)
- Lesson: iter-001's remaining failures under frozen oracle: el-marcos section_context, nikkori section_context, options everywhere except mochomos.

## Noise floor — 3 unchanged live runs of best-known prompt (iter-001)
- Date: 2026-07-04 | Prompt change: none (3 identical runs, temperature 0)
- Results: noise-1 = 20/30, noise-2 = 22/30, noise-3 = 21/30 per-menu passes
- **Noise floor = 2** (max spread between runs). A future iteration must improve total per-menu passes by MORE than 2 to be ACCEPTED.
- Stable failures (all 3 runs): brasero-two items+section_context+options; el-marcos section_context+options; nikkori section_context+options; casa-nostra options. Wobbly: el-marcos items, nikkori items (pass in some runs).
- Verdict: NOISE (baseline measurement, prompt kept)
- Archive: /Users/santiagoaguirre/Downloads/MenusTesting/noise-{1,2,3}/

## Entry template

## Iteration NNN — <one-line hypothesis>
- Date: YYYY-MM-DD | Prompt change: <1–2 line diff summary of EXTRACT_PROMPT>
- Result: items X/6, categories X/6, section_context X/6, options X/6, image_quality X/6 | option recall: <found>/<expected> total
- Failures: <menu: dimension — one-line cause>
- Verdict: ACCEPTED | REVERTED | ORACLE-CHANGE | NOISE (within noise floor, kept baseline)
- Lesson: <one line the next iteration must know>
- Archive: /Users/santiagoaguirre/Downloads/MenusTesting/iter-NNN/

## Iteration 012 — orientation + subheading cues + priced-line-is-item (bundled "A")
- Date: 2026-07-04 | Prompt change: 3 bundled edits — (1) subheading has no price/weight, may be laid out as columns/grids, governs its own block; (2) each separately priced line is its own item named by its printed text, never fold, never name after subheading; (3) an ingredient list joined by "y"/"and" is not options.
- Result: items 3/6, categories 6/6, section_context 3/6, options 2/6, image_quality 6/6 | **20/30 per-menu passes** | option recall 7/21 (brasero 5/5, casa-nostra 2/3, el-marcos 0/11, brasero-two 0/2)
- Failures: brasero-two items 37/25 (CERDO/RES/POLLO/ATÚN meat grid dropped entirely; other rows over-split); el-marcos 44/45 + 1 leaked section-header item, 0 options, section_context missing Pa' los Bukis/spurious Norteños; nikkori 113/120 + section_context worse (6 wrong maps, spurious ROLLOS/POSTRES)
- Verdict: REVERTED (20/30 sits at the bottom of the iter-001 noise band 20–22; did NOT clear the +2 floor — needed ≥23)
- Lesson: abstract orientation/anti-fold/subheading prose is net-neutral — it cannot flip icon-grid parsing (grid went from folded-into-4 to dropped-to-0) or subheading-named items (Revueltos/Fritos still named by subheading, 0 options). Bundling 3 hypotheses masked which helped (Churrasquería split) vs hurt (grid dropped). Next: ONE hypothesis — a few-shot worked grid example, not more prose.
- Archive: live run in scratchpad/iter012-eval.log; ~/Downloads/MenusTesting/{el-marcos,brasero-two}.current-prompt.actual.json
