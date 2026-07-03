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

## Iteration 002 — Option definition and variant folding

- Date: 2026-07-02
- Commit: `40f7f09`
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

| Menu | Items | Categories | Section context | Options | Image quality |
|---|---|---|---|---|---|
| Brasero | PASS — 28/28 | PASS | PASS | PASS | PASS |
| Casa Nostra | FAIL — 23/33 | PASS | PASS | PASS | PASS |
| El Marcos | FAIL — 46/36 | FAIL — spurious `other` | PASS | FAIL — 5 missed, 7 false-positive | PASS |
| Mochomos | PASS — 22/22 | PASS | PASS | PASS | PASS |
| Nikkori | FAIL — 125/120 | PASS | FAIL — 9 missing, 4 spurious, 13 wrong mappings | FAIL — 19 false-positive items | PASS |
| Aggregate | FAIL | PASS | PASS | FAIL | PASS |

What improved:

- Brasero captured both Pasta Alfredo and Pasta Parmesano options.
- Casa Nostra's three option targets matched after the fixture correction.
- Nikkori captured the new Coladas target.
- Categories, section context, and image quality remained aggregate-green, so
  the regression gate did not fire.

What regressed or failed:

- Options remained aggregate-red. El Marcos still missed all five targets and
  put description ingredients or preparations into options on seven unrelated
  items; it did not fold the repeated target variants.
- Nikkori still treated serving sizes, wine products, and copa/botella formats
  as options on 19 non-target items.
- El Marcos increased from 45 to 46 items and gained a spurious `other`
  category. Nikkori increased from 118 to 125 items.
- Nikkori section extraction worsened from 5 missing, 3 spurious, and 9 wrong
  mappings to 9 missing, 4 spurious, and 13 wrong mappings, but section context
  remained aggregate-green.
- The CHILAQUILES/HOT CAKES adjudication gate did not apply: the model did not
  fold them into single option-bearing items.

Decision:

- Keep the prompt commit because no previously aggregate-green dimension
  regressed to aggregate-red.
- Proceed to Iteration 003's independent numbered-menu completeness hypothesis.
- If options remain red after the planned prompt iterations, the next action is
  a separately designed deterministic/two-pass options approach; do not add
  another unplanned prompt patch.
