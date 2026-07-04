# Extraction Iteration Ledger

Working memory for the prompt-iteration loop. READ TOP TO BOTTOM BEFORE EVERY ITERATION.
Rules:
- One entry per iteration, newest LAST. Max ~15 lines per entry.
- Never re-try a hypothesis whose Verdict is REVERTED — the Lesson line says why.
- Full historical detail (iterations 001–011) lives in extraction-eval-log.md; do not append there.
- Fixtures frozen at commit be2611f. Scorer/fixture changes require user approval and get their own entry with Verdict ORACLE-CHANGE.

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

## Entry template

## Iteration NNN — <one-line hypothesis>
- Date: YYYY-MM-DD | Prompt change: <1–2 line diff summary of EXTRACT_PROMPT>
- Result: items X/6, categories X/6, section_context X/6, options X/6, image_quality X/6 | option recall: <found>/<expected> total
- Failures: <menu: dimension — one-line cause>
- Verdict: ACCEPTED | REVERTED | ORACLE-CHANGE | NOISE (within noise floor, kept baseline)
- Lesson: <one line the next iteration must know>
- Archive: /Users/santiagoaguirre/Downloads/MenusTesting/iter-NNN/
