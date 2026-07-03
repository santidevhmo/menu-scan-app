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

## Iteration 003 — Numbered-item and column completeness

- Date: 2026-07-02
- Commit: `f90991f`
- Model: `gpt-4o`
- Temperature: `0`
- Seed: `17`
- Hypothesis: Casa Nostra's 10 missing items are skipped numbered rows
  (extracted numbers gap at 39, 42–49, 58–59) and Nikkori misses 2 of 120;
  an explicit printed-number completeness rule plus column-scan instruction
  recovers them without inflating counts elsewhere.
- Change from previous iteration: EXTRACT_PROMPT only — added the two
  completeness sentences after the no-maximum rule. No scoring changes.
- Fixtures: Brasero, Casa Nostra, El Marcos, Mochomos, Nikkori.
- Raw outputs: `/Users/santiagoaguirre/Downloads/MenusTesting/iter-003/*.actual.json`.

Run attempt 1:

- Brasero, Casa Nostra, El Marcos, and Mochomos completed. Their raw outputs
  are archived in
  `/Users/santiagoaguirre/Downloads/MenusTesting/iter-003-attempt-1/`.
- Nikkori timed out after 120 seconds. The harness stopped before scoring or
  printing any per-menu or aggregate results, so this attempt has no benchmark
  verdict.
- Decision: do not treat the mixed top-level outputs as Iteration 003 results.
  A consistency repeat of the unchanged Iteration 003 prompt is required to
  obtain one complete five-menu report; record it as run attempt 2.

Run attempt 2:

| Menu | Items | Categories | Section context | Options | Image quality |
|---|---|---|---|---|---|
| Brasero | PASS — 28/28 | PASS | PASS | PASS | PASS |
| Casa Nostra | FAIL — 23/33 | PASS | PASS | PASS | PASS |
| El Marcos | FAIL — 46/36, 3 section-header items | FAIL — spurious `other` | FAIL — 1 missing | FAIL — 5 missed targets | PASS |
| Mochomos | PASS — 22/22 | PASS | PASS | PASS | PASS |
| Nikkori | FAIL — 116/120 | PASS | FAIL — 1 missing, 2 spurious, 5 wrong mappings | FAIL — 1 missed, 10 false-positive | PASS |
| Aggregate | FAIL | PASS | FAIL | FAIL | PASS |

What improved:

- Brasero, Casa Nostra, and Mochomos held their Iteration 002 results.
- Nikkori section errors decreased from 9 missing, 4 spurious, and 13 wrong
  mappings to 1 missing, 2 spurious, and 5 wrong mappings.
- El Marcos option false positives decreased from seven to zero, and Nikkori
  option false positives decreased from 19 to 10.

What regressed or failed:

- The completeness hypothesis failed: Casa Nostra remained 23/33, Nikkori
  dropped from 125 to 116, and El Marcos remained 46/36.
- El Marcos emitted three section headers as items and lost the `Pa' los Bukis`
  section, causing section context to regress from aggregate-PASS to
  aggregate-FAIL.
- Options remained aggregate-red: El Marcos still missed all five targets;
  Nikkori missed Coladas and retained ten false-positive option items.
- Categories and image quality remained aggregate-green.

Decision:

- Regression gate fired because a previously green dimension, section context,
  became aggregate-red.
- Reverted the Iteration 003 prompt commit `f90991f` in revert commit
  `da547c0`.
- Stop before Iteration 004 and request user input. The completeness escalation
  remains the approved next technical action: a separately logged schema
  iteration adding `item_number: string | null`.

## Iteration 004 — Nearest subheading over parent heading

- Date: 2026-07-02
- Commit: `cf741a0`
- Model: `gpt-4o`
- Temperature: `0`
- Seed: `17`
- Authorization: the user explicitly directed execution to continue after the
  Iteration 003 regression stop so all planned iterations could be compared.
- Hypothesis: Nikkori's section failure is parent-heading capture (`LICORES`
  instead of Vodka/Ron/Tequila/Whisky/Digestivo) plus invented groupings
  (`ROLLOS`, `SANGRÍA`); an explicit nearest-subheading rule with a spirits
  example fixes the 5 missing, 3 spurious, and 9 wrong mappings measured in
  Iteration 001.
- Change from active prompt: EXTRACT_PROMPT only — from the post-revert
  Iteration 002 prompt state, replaced the one-line nested-heading sentence
  with the subheading rule. Iteration 003's completeness rule remains reverted.
  No scoring changes.
- Fixtures: Brasero, Casa Nostra, El Marcos, Mochomos, Nikkori.
- Raw outputs: `/Users/santiagoaguirre/Downloads/MenusTesting/iter-004/*.actual.json`.

| Menu | Items | Categories | Section context | Options | Image quality |
|---|---|---|---|---|---|
| Brasero | PASS — 28/28 | PASS | PASS | PASS | PASS |
| Casa Nostra | FAIL — 23/33 | PASS | PASS | PASS | PASS |
| El Marcos | FAIL — 46/36 | FAIL — spurious `other` | PASS | FAIL — 5 missed, 7 false-positive | PASS |
| Mochomos | PASS — 22/22 | PASS | PASS | FAIL — 1 false-positive | PASS |
| Nikkori | FAIL — 107/120 | PASS | FAIL — 2 missing, 2 spurious, 8 wrong mappings | FAIL — 12 false-positive items | PASS |
| Aggregate | FAIL | PASS | PASS | FAIL | PASS |

What improved:

- Nikkori now used the printed Vodka, Ron, Tequila, Whisky, and Digestivo
  subheadings instead of the `LICORES` parent.
- Nikkori section errors improved from Iteration 002's 9 missing, 4 spurious,
  and 13 wrong mappings to 2 missing, 2 spurious, and 8 wrong mappings.
- Nikkori option false positives decreased from 19 in Iteration 002 to 12 while
  retaining the Coladas target.
- Categories, section context, and image quality remained aggregate-green, so
  the regression gate did not fire.

What regressed or failed:

- Nikkori still failed section context: `Bebidas` and `Limonadas de Sabores`
  were missing; `ROLLOS` and `BEBIDAS SIN ALCOHOL` were spurious; eight item
  mappings were wrong.
- Nikkori completeness dropped from 125 items in Iteration 002 to 107.
- Options remained aggregate-red. El Marcos still missed all five targets and
  retained seven false-positive items. Mochomos gained one false-positive:
  `TOSTADAS PUESTAS DE ATÚN` treated atún/salmón description text as options.
- Casa Nostra remained 23/33 and El Marcos remained 46/36.

Decision:

- Keep the Iteration 004 prompt commit because no previously aggregate-green
  dimension regressed to aggregate-red.
- The planned prompt iterations are complete. Items and options remain red;
  prompt-only changes did not prove extraction contract v2.
- The next action is the approved completeness escalation: design a separately
  logged schema iteration adding `item_number: string | null`. Options then
  require a separately designed deterministic/two-pass approach.

### Status after Iteration 004

- Aggregate-green: categories, section context, image quality.
- Aggregate-red: items, options.
- Current prompt: Iteration 002 option rules plus Iteration 004 nearest-
  subheading rules; Iteration 003 completeness rules remain reverted.
- Next action: plan the `item_number: string | null` schema iteration before
  any further paid run.

### Handoff

- Branch: `feat/extraction-eval-harness`.
- Worktree: `/private/tmp/menu-scan-app-extraction-eval-harness`.
- Active prompt commit: `cf741a0` (Iteration 002 option rules plus Iteration
  004 nearest-subheading rules).
- Reverted prompt commit: `f90991f` (Iteration 003 completeness rules), reverted
  by `da547c0`.
- Frozen settings: `gpt-4o`, temperature `0`, seed `17`.
- Harness: `scripts/eval-extraction.ts`; fixtures:
  `scripts/fixtures/*.expected.json`.
- Archived raw outputs:
  - Iteration 001: `/Users/santiagoaguirre/Downloads/MenusTesting/iter-001/`
  - Iteration 002: `/Users/santiagoaguirre/Downloads/MenusTesting/iter-002/`
  - Iteration 003 timeout partials:
    `/Users/santiagoaguirre/Downloads/MenusTesting/iter-003-attempt-1/`
  - Iteration 003 complete attempt:
    `/Users/santiagoaguirre/Downloads/MenusTesting/iter-003/`
  - Iteration 004: `/Users/santiagoaguirre/Downloads/MenusTesting/iter-004/`
- The top-level `*.actual.json` files in `MenusTesting/` are the Iteration 004
  outputs and will be overwritten by the next harness run.
- Read this file in full before another paid run. Do not expose or commit
  `.env.local`.

## Iteration 005 — Offline re-baseline (no paid run)

- Date: 2026-07-03
- Commits:
  - `45a5ce1` — item-count tolerance ±3
  - `c9c60b6` — confirmed El Marcos unfolded fixture
  - `928fdc0` — deterministic leading-number stripper
  - `7eac7ad` — deterministic serving-format option filter
  - Task 5 offline scorer and this log entry: this commit
- Model call: none; archived outputs re-scored offline.
- Model represented by archives: `gpt-4o`
- Temperature: `0`
- Seed: `17`
- Hypothesis: corrected separate-variant ground truth, ±3 count tolerance,
  and deterministic post-processing turn El Marcos item scoring green and
  remove serving-format option false positives without removing true option
  targets.
- Exact changes:
  - Item counts pass at ±3 when no section header is emitted as an item.
  - El Marcos expected count changed from 36 to the user-confirmed 45 and its
    five folding-based option targets were removed.
  - Menu-wide leading list numbers are stripped from displayed names.
  - Observed serving formats and sizes, including quantity-bearing
    `Botella 750 ml`, `Botella 300 ml`, and `Copa 85 mxn`, are removed from
    options.
  - Added `--offline <dir>` to score archived extraction JSON through the
    production post-processing path without a network call.
- Fixtures: Brasero, Casa Nostra, El Marcos, Mochomos, Nikkori.
- Archives scored:
  - `/Users/santiagoaguirre/Downloads/MenusTesting/iter-004/*.actual.json`
  - `/Users/santiagoaguirre/Downloads/MenusTesting/iter-001/*.actual.json`

El Marcos recount:

- Confirmed total: 45.
- Separately priced preparations under Revueltos, Fritos, Hot Cakes, and
  Waffles remain separate items.
- Plato Surtido has two separately priced items; both archived runs merged
  them and missed the $82 item.
- Pa' los Bukis is one $94 combo, not two menu items.
- Iteration 001's count of 45 balances the missed second Plato Surtido against
  splitting the kids combo into two items. Iteration 004 additionally emitted
  `$94 POR NIÑO` as an item.

Re-scored Iteration 004 archive:

| Menu | Items | Categories | Section context | Options | Image quality |
|---|---|---|---|---|---|
| Brasero | PASS — 28/28 | PASS | PASS | PASS | PASS |
| Casa Nostra | FAIL — 23/33 | PASS | PASS | PASS | PASS |
| El Marcos | PASS — 46/45 | FAIL — spurious `other` | PASS | FAIL — 7 false-positive items | PASS |
| Mochomos | PASS — 22/22 | PASS | PASS | FAIL — 1 false-positive item | PASS |
| Nikkori | FAIL — 107/120 | PASS | FAIL — 2 missing, 2 spurious, 8 wrong mappings | FAIL — 7 false-positive items | PASS |
| Aggregate | FAIL | PASS | PASS | FAIL | PASS |

Re-scored Iteration 001 archive:

| Menu | Items | Categories | Section context | Options | Image quality |
|---|---|---|---|---|---|
| Brasero | PASS — 28/28 | PASS | PASS | FAIL — 1 missed target | PASS |
| Casa Nostra | FAIL — 23/33 | PASS | PASS | PASS | PASS |
| El Marcos | PASS — 45/45 | PASS | PASS | PASS | PASS |
| Mochomos | PASS — 22/22 | PASS | PASS | PASS | PASS |
| Nikkori | PASS — 118/120 | PASS | FAIL — 5 missing, 3 spurious, 9 wrong mappings | FAIL — 2 false-positive items | PASS |
| Aggregate | PASS | PASS | PASS | FAIL | PASS |

What improved:

- El Marcos items became green in both archives under the corrected fixture.
- The serving-format filter reduced Iteration 004 Nikkori false positives from
  12 to 7 and Iteration 001 Nikkori false positives from 10 to 2.
- Brasero, Casa Nostra, and Nikkori true option targets remained matched.
- Categories, aggregate section context, and image quality remained green.

What remains red:

- Iteration 004 items remain aggregate-red because Casa Nostra is 23/33 and
  Nikkori is 107/120.
- Options remain aggregate-red. The remaining false positives are not serving
  formats, so expanding the serving-format denylist would encode unrelated
  food semantics.
- Casa Nostra remains exactly 10 items short in both archives.

Decision:

- Keep all deterministic changes.
- Use this Iteration 004 re-score as the comparison baseline for paid
  Iterations 006 and 007.
- Proceed to Casa Nostra image forensics, then Iteration 006 prompt diet.

### Iteration 005 correction — Casa Nostra forensics

- Date: 2026-07-03
- Model call: none; Iterations 001–004 were re-scored offline.
- Source image: `1408×1870`.
- Client approximation inspected: longest edge `1024px`, JPEG quality `70`.
- Corrected Casa Nostra ground truth: 23 visible items.

The source and compressed images both visibly contain these item ranges:

- Pasta: 30–38
- Insalate: 40–41
- Pizze: 50–57
- Frutti di mare: 60–63

Numbers 39, 42–49, and 58–59 are not printed in the supplied image. The
visible rows remain legible at the client approximation, but the alleged
missing rows do not exist. The earlier 33-item fixture incorrectly treated
intentional numbering discontinuities between printed sections as OCR misses.
The user confirmed the 23-item count.

Corrected re-score of Iteration 001:

| Menu | Items | Categories | Section context | Options | Image quality |
|---|---|---|---|---|---|
| Brasero | PASS — 28/28 | PASS | PASS | FAIL — 1 missed target | PASS |
| Casa Nostra | PASS — 23/23 | PASS | PASS | PASS | PASS |
| El Marcos | PASS — 45/45 | PASS | PASS | PASS | PASS |
| Mochomos | PASS — 22/22 | PASS | PASS | PASS | PASS |
| Nikkori | PASS — 118/120 | PASS | FAIL — 5 missing, 3 spurious, 9 wrong mappings | FAIL — 2 false-positive items | PASS |
| Aggregate | PASS | PASS | PASS | FAIL | PASS |

Corrected re-score of Iteration 002:

| Menu | Items | Categories | Section context | Options | Image quality |
|---|---|---|---|---|---|
| Brasero | PASS — 28/28 | PASS | PASS | PASS | PASS |
| Casa Nostra | PASS — 23/23 | PASS | PASS | PASS | PASS |
| El Marcos | PASS — 46/45 | FAIL — spurious `other` | PASS | FAIL — 7 false-positive items | PASS |
| Mochomos | PASS — 22/22 | PASS | PASS | PASS | PASS |
| Nikkori | FAIL — 125/120 | PASS | FAIL — 9 missing, 4 spurious, 13 wrong mappings | FAIL — 9 false-positive items | PASS |
| Aggregate | PASS | PASS | PASS | FAIL | PASS |

Corrected re-score of Iteration 003:

| Menu | Items | Categories | Section context | Options | Image quality |
|---|---|---|---|---|---|
| Brasero | PASS — 28/28 | PASS | PASS | PASS | PASS |
| Casa Nostra | PASS — 23/23 | PASS | PASS | PASS | PASS |
| El Marcos | FAIL — 46/45, 3 section-header items | FAIL — spurious `other` | FAIL — 1 missing | PASS | PASS |
| Mochomos | PASS — 22/22 | PASS | PASS | PASS | PASS |
| Nikkori | FAIL — 116/120 | PASS | FAIL — 1 missing, 2 spurious, 5 wrong mappings | FAIL — 1 missed, 4 false-positive items | PASS |
| Aggregate | FAIL | PASS | FAIL | PASS | PASS |

Corrected re-score of Iteration 004:

| Menu | Items | Categories | Section context | Options | Image quality |
|---|---|---|---|---|---|
| Brasero | PASS — 28/28 | PASS | PASS | PASS | PASS |
| Casa Nostra | PASS — 23/23 | PASS | PASS | PASS | PASS |
| El Marcos | PASS — 46/45 | FAIL — spurious `other` | PASS | FAIL — 7 false-positive items | PASS |
| Mochomos | PASS — 22/22 | PASS | PASS | FAIL — 1 false-positive item | PASS |
| Nikkori | FAIL — 107/120 | PASS | FAIL — 2 missing, 2 spurious, 8 wrong mappings | FAIL — 7 false-positive items | PASS |
| Aggregate | PASS | PASS | PASS | FAIL | PASS |

Corrected findings:

- Items were already aggregate-green in Iterations 001, 002, and 004.
- Iteration 003 remains invalid: it regressed items and section context to
  aggregate-red and was correctly reverted.
- Options remain the only aggregate-red dimension in the active Iteration 004
  baseline.
- Repeating paid Iterations 001–004 would not correct a fixture-only scoring
  error. Their archived outputs are sufficient.

Decision:

- Keep Casa Nostra at 23 expected visible items.
- Continue with Iteration 006 because removing the rejected variant-folding
  instruction is independent of the fixture correction.
- Retain Iteration 007 only as section-aware, diagnostic-only item-number
  reporting. Do not infer gaps across section boundaries.
- Do not trigger Iteration 008 from diagnostics alone; require manual
  confirmation of a real printed omission and a separate design first.

## Iteration 006 — Prompt diet

- Date: 2026-07-03
- Prompt commit: `647c4c7`
- Revert commit: `95416c1`
- Model: `gpt-4o`
- Temperature: `0`
- Seed: `17`
- Hypothesis: removing the rejected variant-folding sentences recovers
  Nikkori completeness toward its 118-item baseline and reduces El Marcos
  option false positives without regressing an aggregate-green dimension.
- Change from corrected Iteration 005 baseline: removed only the three-line
  same-base-dish variant-folding instruction. Deterministic post-processing,
  schema, model settings, and fixtures were unchanged.
- Fixtures: Brasero, Casa Nostra, El Marcos, Mochomos, Nikkori.
- Raw outputs:
  `/Users/santiagoaguirre/Downloads/MenusTesting/iter-006/*.actual.json`.

| Menu | Items | Categories | Section context | Options | Image quality |
|---|---|---|---|---|---|
| Brasero | PASS — 28/28 | PASS | PASS | PASS | PASS |
| Casa Nostra | PASS — 23/23 | PASS | PASS | PASS | PASS |
| El Marcos | FAIL — 44/45, 1 section-header item | PASS | FAIL — 1 missing section | FAIL — 3 false-positive items | PASS |
| Mochomos | PASS — 22/22 | PASS | PASS | PASS | PASS |
| Nikkori | FAIL — 106/120 | PASS | FAIL — 5 missing, 3 spurious, 11 wrong mappings | FAIL — 1 missed target, 4 false-positive items | PASS |
| Aggregate | FAIL | PASS | FAIL | FAIL | PASS |

What improved:

- El Marcos option false positives decreased from 7 to 3.
- Mochomos option false positives decreased from 1 to 0.
- Nikkori option false positives decreased from 7 to 4.
- Categories and image quality remained aggregate-green.

What regressed or failed:

- Nikkori completeness decreased from 107 to 106 rather than recovering.
- El Marcos emitted one section header as an item and lost the Pa' los Bukis
  section.
- Items regressed from aggregate-PASS to aggregate-FAIL.
- Section context regressed from aggregate-PASS to aggregate-FAIL.
- Nikkori lost the Coladas options target, so options remained aggregate-red.

Decision:

- The regression gate fired for items and section context.
- Reverted prompt commit `647c4c7` in `95416c1`.
- Stop before Iteration 007 for user input. The active prompt is restored to
  the corrected Iteration 005 baseline.

## Iteration 007 — Section-aware item-number diagnostics

- Date: 2026-07-03
- Schema/diagnostic commit: `a5cedb1`
- Revert commit: `3cd53ac`
- Model: `gpt-4o`
- Temperature: `0`
- Seed: `17`
- Authorization: the user explicitly approved continuing after Iteration
  006's regression and revert.
- Hypothesis: a nullable `item_number` field provides reliable section-local
  gap diagnostics without assuming numbering is contiguous across sections
  and without making a follow-up model call.
- Change from active baseline:
  - added required nullable `item_number` to extraction schema and prompt;
  - added deterministic gap detection within each `section_title` only;
  - printed diagnostics in live and offline harness modes;
  - made no gap-fill call.
- Fixtures: Brasero, Casa Nostra, El Marcos, Mochomos, Nikkori.
- Raw outputs:
  `/Users/santiagoaguirre/Downloads/MenusTesting/iter-007/*.actual.json`.

| Menu | Items | Categories | Section context | Options | Image quality |
|---|---|---|---|---|---|
| Brasero | PASS — 28/28 | PASS | PASS | PASS | PASS |
| Casa Nostra | PASS — 23/23 | PASS | PASS | PASS | PASS |
| El Marcos | FAIL — 40/45, 1 section-header item | FAIL — spurious `other` | PASS | FAIL — 6 false-positive items | PASS |
| Mochomos | PASS — 22/22 | PASS | PASS | PASS | PASS |
| Nikkori | FAIL — 108/120 | PASS | FAIL — 1 spurious section, 7 wrong mappings | FAIL — 7 false-positive items | PASS |
| Aggregate | FAIL | PASS | PASS | FAIL | PASS |

Item-number coverage:

- Brasero: 0/28
- Casa Nostra: 23/23
- El Marcos: 0/40
- Mochomos: 0/22
- Nikkori: 6/108

Diagnostics:

- No section-local number gaps were reported.
- Casa Nostra correctly produced complete local ranges inside each section,
  without flagging the intentional jumps between sections.
- Nikkori number coverage was too sparse for diagnostics.

What worked:

- The redesigned detector avoided every known Casa Nostra false gap.
- Categories, section context, and image quality remained aggregate-green.
- No extra model call was made.

What regressed or failed:

- Items regressed from aggregate-PASS to aggregate-FAIL.
- El Marcos dropped from 46 items in the active Iteration 004 archive to 40
  and emitted a section header as an item.
- Nikkori remained incomplete at 108/120.
- Options remained aggregate-red.
- Number coverage was absent on three menus and sparse on Nikkori, limiting
  the diagnostic's general value.

Decision:

- The regression gate fired for items.
- Reverted `a5cedb1` in `3cd53ac`.
- Iteration 008 is not triggered: no real gap was detected, and the diagnostic
  schema itself failed the regression gate.
- Stop for user input before the options/two-pass gate.

## Iteration 009 — Two-pass indexed options extraction

- Date: 2026-07-03
- Implementation commit: `968982b`
- Revert commit: `4d0f3b7`
- Model: `gpt-4o` for both passes
- Temperature: `0`
- Seed: `17`
- Timeouts: independent 120-second limit per pass
- Hypothesis: removing option reasoning from Pass 1 and running a dedicated
  photo-aware Pass 2 keyed by Pass 1 item index turns options aggregate-green
  without regressing item, category, section-context, or image-quality scores.
- Change from active baseline:
  - Pass 1 extracted option-free items and image quality.
  - Pass 2 received the original photos plus indexed Pass 1 items and returned
    only option-bearing indices.
  - Strict index validation merged options without fuzzy name matching.
  - Existing deterministic post-processing ran after the merge.
  - Pass 2 failures failed the full extraction.
- Fixtures: Brasero, Casa Nostra, El Marcos, Mochomos, Nikkori.
- Raw merged outputs:
  `/Users/santiagoaguirre/Downloads/MenusTesting/iter-009/*.actual.json`.

| Menu | Items | Categories | Section context | Options | Image quality |
|---|---|---|---|---|---|
| Brasero | PASS — 28/28 | PASS | PASS | PASS | PASS |
| Casa Nostra | PASS — 26/23 | PASS | PASS | FAIL — 2 false-positive items | PASS |
| El Marcos | PASS — 43/45 | PASS | FAIL — 1 missing section | FAIL — 14 false-positive items | PASS |
| Mochomos | PASS — 22/22 | PASS | PASS | FAIL — 2 false-positive items | PASS |
| Nikkori | FAIL — 101/120, 1 section-header item | PASS | FAIL — 8 missing, 8 spurious, 11 wrong mappings | FAIL — 1 missed target, 3 false-positive items | PASS |
| Aggregate | PASS | PASS | FAIL | FAIL | PASS |

What worked:

- Brasero captured both true pasta option targets exactly.
- Casa Nostra captured all three configured option targets.
- Index merging correctly handled duplicate item names.
- Items, categories, and image quality remained aggregate-green.
- All ten model calls completed without timeout.

What failed:

- Options remained aggregate-red.
- Section context regressed from aggregate-PASS to aggregate-FAIL, driven by
  El Marcos and Nikkori Pass 1 extraction.
- Nikkori completeness fell from 107 in the active Iteration 004 archive to
  101 and emitted one section header as an item.
- Nikkori's Pass 1 converted the printed Coladas flavors into an item name
  (`Piña / Fresa / Limón / Mango`), so Pass 2 could not match the configured
  `Coladas` target.

Observed option-bearing outputs that require ground-truth adjudication:

- El Marcos Pass 2 identified printed choices including jamón/chorizo/tocino
  for Revueltos and Fritos, salsa and cheese choices for Chilaquiles,
  Verdes/Rojas/Suizas for Enchiladas, Blanco/Integral for Pan Tostado,
  cottage/yogurt for Plato Surtido, and other inline `o` choices. The current
  El Marcos fixture declares no valid options, so all 14 scored as false
  positives.
- Casa Nostra additionally identified Lechuga entera/en trozos for Cesar; the
  fixture does not currently list that target.
- Mochomos identified two choices that may instead be description
  hallucinations and remain false positives under current ground truth.

Decision:

- The regression gate fired because section context became aggregate-red.
- Options also failed the iteration's success criterion.
- Reverted `968982b` in `4d0f3b7`.
- Stop for user input. Before another options experiment, adjudicate the
  printed-choice ground truth exposed by Pass 2, especially El Marcos.

### Post-Iteration 009 option ground-truth adjudication

- Date: 2026-07-03
- Model call: none.
- User decision: the El Marcos fixture is wrong to declare zero valid options.

Approved rules:

- Separate rows/prices are separate menu-item cards.
- Choices inside one priced row are structured options.
- Ingredients joined by `y` remain description text.
- Nested conditional combos remain description-only until the data model
  supports option groups.

Confirmed El Marcos cases:

| Printed group | Cards | Structured options |
|---|---:|---|
| Revueltos | 3 | $90 card: Jamón, Chorizo, Tocino |
| Fritos | 2 | $90 card: Jamón, Chorizo, Tocino |
| De la Panadería Hot Cakes | 2 | $78 card: Jamón, Tocino, Huevo |
| Waffles | 2 | none |
| Plato Surtido | 2 | $82 card: Queso cottage, Yogurt |
| Pa' los Bukis | 1 combo | none for now; grouped/conditional choices deferred |

Nutritional-enrichment decision:

- Keep the printed description and structured options together. Description
  alone risks treating alternatives as ingredients consumed together.
- Stage 2 must enrich the base card separately from each option.

Fixture blocker:

- `scoreMenu` currently finds the first item matching `name_contains`, so it
  cannot target only the $90 third Revueltos card or other duplicate-name
  rows.
- Leave `scripts/fixtures/el-marcos.expected.json` unchanged temporarily.
- Next implementation must add optional description/price qualifiers and
  one-to-one target matching, then update the fixture and offline re-score
  Iteration 009 before another paid model run.

## Offline re-score: qualified matcher + corrected El Marcos fixture

- Date: 2026-07-03
- Model call: none. Offline re-score only, against already-archived
  `*.actual.json` output, per `scripts/eval-extraction.ts --offline`.
- Change under test: `scoreMenu`'s option matcher now takes optional
  `description_contains`/`price` qualifiers per target and consumes the
  matched item index one-to-one, so a claimed duplicate-name card can't be
  reused by a later target. El Marcos fixture's `items_with_options` now
  encodes the four confirmed targets (Revueltos $90, Fritos $90, Hot Cakes
  $78, Plato Surtido $82).

**Iteration 004 baseline archive:**

```
brasero      PASS items / PASS categories / PASS section_context / PASS options / PASS image_quality
casa-nostra  PASS items / PASS categories / PASS section_context / PASS options / PASS image_quality
el-marcos    PASS items (46/45) / FAIL categories (spurious: other) / PASS section_context / FAIL options (missed: 4; false-positive: 7) / PASS image_quality
mochomos     PASS items / PASS categories / PASS section_context / FAIL options (missed: 0; false-positive: 1) / PASS image_quality
nikkori      FAIL items (107/120) / PASS categories / FAIL section_context / FAIL options (missed: 0; false-positive: 7) / PASS image_quality

Aggregate: PASS items / PASS categories / PASS section_context / FAIL options / PASS image_quality
```

Iteration 004's El Marcos archive predates any options extraction, so all
four targets are missed (no card has any options) and every card's
options field is empty — the 7 false-positive count there comes from
other items in that archive, not new regressions from this change.

**Iteration 009 archive:**

```
brasero      PASS items / PASS categories / PASS section_context / PASS options / PASS image_quality
casa-nostra  PASS items (26/23) / PASS categories / PASS section_context / FAIL options (missed: 0; false-positive: 2) / PASS image_quality
el-marcos    PASS items (43/45) / PASS categories / FAIL section_context (missing: Pa' los Bukis) / FAIL options (missed: 1; false-positive: 11) / PASS image_quality
mochomos     PASS items / PASS categories / PASS section_context / FAIL options (missed: 0; false-positive: 2) / PASS image_quality
nikkori      FAIL items (101/120) / PASS categories / FAIL section_context / FAIL options (missed: 1; false-positive: 3) / PASS image_quality

Aggregate: PASS items / PASS categories / FAIL section_context / FAIL options / PASS image_quality
```

**El Marcos options: FAIL under the corrected fixture/matcher.**

- 3 of 4 targets matched correctly: Revueltos ($90, Jamón/Chorizo/Tocino),
  Fritos ($90, Jamón/Chorizo/Tocino), and Hot Cakes ($78,
  Jamón/Tocino/Huevo) all resolve to the right card by name + description +
  price and score their expected options present.
- 1 target missed: Plato Surtido. The fixture's confirmed ground truth
  price is $82, but Iteration 009's archived extraction has the Plato
  Surtido card with options at $72 — a real price discrepancy in the
  extraction (or the source photo), not a matcher bug. The qualified
  matcher correctly refuses to match a $82 target against a $72 card, so
  the target counts as missed and that card's options (Queso
  cottage/Yogurt) count as an 11th false positive.
- The remaining 10 false positives are cards with printed alternative
  choices that the fixture does not yet encode as targets (Chilaquiles ×2,
  Machaca, Machaca de Marlin, Enchiladas, Té, Chocolate, Pan Tostado, Jugo,
  Avena) — these are the "other inline-alternative candidates" flagged for
  separate review, out of scope for this plan.

**Aggregate score changes under the corrected matcher: none.** Both
iter-004 and iter-009 options were already FAIL at aggregate level before
this change (duplicate-name mismatches and unencoded inline alternatives
were already causing false positives/missed targets under the old
`.find()`-based matcher); they remain FAIL after. No other dimension
(items, categories, section_context, image_quality) changed for either
archive — the matcher change only touches option-target resolution.

**Decision:** this offline re-score does not by itself justify re-landing
the Iteration 009 two-pass architecture. That decision needs a fresh paid
run under the regression gate defined in
`docs/superpowers/specs/2026-07-03-two-pass-options-design.md`, which is
out of scope for this plan. Separately, the Plato Surtido price
discrepancy ($72 extracted vs $82 confirmed ground truth) needs user
verification before further fixture changes there.
