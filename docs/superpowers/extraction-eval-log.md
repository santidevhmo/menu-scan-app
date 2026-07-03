# Menu Extraction Evaluation Log

This file is append-only. Record every prompt, schema, preprocessing, model,
scoring, or fixture iteration before another paid benchmark run. Never overwrite
an earlier result, including failed experiments.

Each iteration must include:

- date, iteration number, commit, model, temperature, and seed;
- hypothesis and exact change from the previous iteration;
- fixture set and raw output locations;
- full per-menu and aggregate scores;
- what improved or worked;
- what regressed or failed;
- decision and next action.

Do not repeat an identical iteration unless the log states why the repeat is
needed.

## Iteration 001 — Contract v2 baseline

- Date: 2026-07-02
- Commit: `dd9d450`
- Model: `gpt-4o`
- Temperature: `0`
- Seed: `17`
- Hypothesis: one strict structured-output prompt can extract all items, broad
  categories, nearest printed sections, sparse selectable options, and overall
  image quality from five representative menus.
- Change: first real run of extraction contract v2; no prior measured iteration.
- Fixtures: Brasero, Casa Nostra, El Marcos, Mochomos, Nikkori.
- Raw outputs:
  - `/Users/santiagoaguirre/Downloads/MenusTesting/brasero.actual.json`
  - `/Users/santiagoaguirre/Downloads/MenusTesting/casa-nostra.actual.json`
  - `/Users/santiagoaguirre/Downloads/MenusTesting/el-marcos.actual.json`
  - `/Users/santiagoaguirre/Downloads/MenusTesting/mochomos.actual.json`
  - `/Users/santiagoaguirre/Downloads/MenusTesting/nikkori.actual.json`

| Menu | Items | Categories | Section context | Options | Image quality |
|---|---|---|---|---|---|
| Brasero | PASS — 28/28 | PASS | PASS | FAIL — 1 missed target | PASS |
| Casa Nostra | FAIL — 23/33 | PASS | PASS | FAIL — 1 missed, 1 false-positive | PASS |
| El Marcos | FAIL — 45/36 | PASS | PASS | FAIL — 5 missed targets | PASS |
| Mochomos | PASS — 22/22 | PASS | PASS | PASS | PASS |
| Nikkori | FAIL — 118/120 | PASS | FAIL — 5 missing, 3 spurious, 9 wrong mappings | FAIL — 10 false-positive items | PASS |
| Aggregate | FAIL | PASS | PASS | FAIL | PASS |

What worked:

- Brasero and Mochomos item counts were exact.
- Every menu passed broad category classification.
- Four of five menus passed nearest-section scoring, making section context
  aggregate-green.
- Every good image was correctly marked usable with no issue.
- Mochomos produced no false-positive options.

What failed:

- Item completeness/count failed for Casa Nostra, El Marcos, and Nikkori.
- Option extraction failed on every options-bearing menu.
- Nikkori treated parent/non-section text as nearest sections and produced ten
  false-positive option-bearing items.
- El Marcos over-counted by nine; Casa Nostra under-counted by ten.

Decision:

- Preserve this baseline unchanged.
- Inspect all five raw outputs before proposing Iteration 002.
- Separate item-count, section-context, and option failures into focused
  hypotheses; do not bundle speculative prompt changes into one rerun.
