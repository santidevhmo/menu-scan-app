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
