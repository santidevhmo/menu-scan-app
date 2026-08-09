# Macro loop — budget ledger

**Authorised by Santiago, 2026-08-09: $8.64 total OpenAI spend.** This is the balance actually
available on his billing, not an estimate. When the running total reaches it, the loop **STOPS**,
notifies him, and reports what was done, where things stand, and what is next.

**This file is the only record of spend across loop iterations.** Each iteration starts with no
memory of the last, so an unrecorded run is an invisible one. Append a row the moment a paid run
finishes — before analysing it, before writing anything up.

## Reference prices (measured, 2026-08-09)

| unit | cost |
|---|---|
| one enrichment call, gpt-4o-2024-08-06 | ~$0.033 |
| one enrichment call, gpt-5.5-2026-04-23 | ~$0.039 |
| a full arm: 4 runs × 3 draws (12 calls) | ~$0.12–0.47 |
| pipeline-integrity arm (2 menus × both models, 20 batched calls) | ~$0.72 |

Estimate before running, and record the ACTUAL where it can be recovered. A previous session
under-quoted a run by pricing per *menu* instead of per *call* — check which unit you are counting.

## Spend

| # | date | what | model | calls | est. | actual | running total |
|---|---|---|---|---|---|---|---|
| — | 2026-08-09 | opening balance | — | — | — | — | **$0.00 of $8.64** |
| 1 | 2026-08-09 | B15 `name_implied_components`, run w1 of 4 | gpt-4o-2024-08-06 | 3 | $0.10 | ~$0.099 | **$0.10 of $8.64** |
| 2 | 2026-08-09 | B15 runs w2, w3, w4 (arm complete) | gpt-4o-2024-08-06 | 9 | $0.30 | ~$0.297 | **~$0.40 of $8.64** |

**Remaining: ~$8.24**

## Stop conditions

The loop halts and reports on ANY of these:

1. **Budget reached** — running total ≥ $8.64.
2. **A decision only Santiago can make** — any change to a researched dish's USDA composition, the
   fixture roster, or a deploy. Park it, keep working on whatever does not depend on it, and raise it
   in the report.
3. **The benchmark stops discriminating** — the baseline→B4 gap (currently 18–20 failed field/draws)
   shrinks materially. That means the measuring stick broke, and every result after it is worthless.
4. **A regression that cannot be explained** — fall back to the newest `macro-best-v*` tag rather than
   iterating on a broken base.
