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

## Iteration 013 — few-shot: swap abstract fold rule for a worked grid example
- Date: 2026-07-04 | Prompt change: replaced the "same base dish printed several times → ONE item + options" fold rule (baseline lines 32-34) with a concrete example — under a "STEAKS" subheading, "Ribeye 25"/"Sirloin 20" → two items named by line text, section_title=subheading, not folded.
- Result: items 3/6, categories 5/6, section_context 3/6, options 2/6, image_quality 6/6 | **19/30 per-menu passes** | option recall 7/21
- Failures: brasero-two items 44/25 (over-split — but section_context now has Cerdo/Res/Pollo/Atún, "missing: none"); nikkori items 108/120 + section_context far worse (13 wrong maps) + **14 option false-positives** (spirit lists Vodka/Ron/Tequila shredded); el-marcos categories now FAIL (spurious "other").
- Verdict: REVERTED (19/30 < baseline noise band 20–22; worse than iter-012's 20)
- Lesson: **the few-shot achieved its target (brasero-two grid sections appeared) but generalized to ALL subheading+priced-line layouts, detonating Nikkori's spirit/beverage lists.** The meat-cut grid and Nikkori spirit lists are VISUALLY IDENTICAL but need OPPOSITE treatment (split vs fold); the disambiguating signal is not in the image. **The meat grid is NOT prompt-solvable without breaking Nikkori — it is an oracle-level conflict.** Stop trying to fix the grid via prompt; the lever now is fixture/oracle decisions + the pending options rebuilds.
- Archive: live run in scratchpad/iter013-eval.log

## Iteration 014 — deterministic promoteSections() in postprocess (NOT a prompt change)
- Date: 2026-07-04 | Prompt change: NONE. Code-only: added promoteSections() to postprocess.ts. A price===null item whose options have NO serving-format token (copa/botella/mxn/ml…) is a folded section → un-fold: each option becomes an item under section_title=folded name; drop placeholder. Format-priced items (wines) left intact. Runs stripMenuNumbers → promoteSections → filterServingFormatOptions. Self-check in import.meta.main.
- Result: items 3/6, categories 5/6, section_context 3/6, options 3/6, image_quality 6/6 | **19/30 per-menu passes** | option recall 7/21 (brasero 5/5, casa-nostra 2/3, rest 0)
- Failures: brasero-two items 43/25 + section_context spurious ENTRADAS/ESPECIALIDADES/Churrasquería/ENSALADAS/CALDOS (ALL page-1 content — fixture only covers page 2); el-marcos items 39/45 (model under-extracted this run; promote did NOT fire there — REVUELTOS/FRITOS kept options=priced) + categories spurious "other" ($94 POR NIÑO) + options; nikkori items 116/120 + section_context spurious ROLLOS/POSTRES + 13 option FP (baseline spirit-folding, unchanged by promote)
- Verdict: BLOCKED-ON-ORACLE (code kept, not reverted). The rule provably WORKED and was harmless: brasero-two grid folded by model this run → promote created Cerdo/Res/Pollo/Atún as sections (verified in actual.json, null-price+options remaining=[]); Nikkori wines NOT promoted (guard held, items stayed in noise band, 0 leaked section-header items vs iter-013's 1); brasero+mochomos still 5/5; el-marcos untouched by promote. Score can't rise because brasero-two's section_context is scored against a page-2-only oracle — a fixture defect, not a rule defect.
- Lesson: the folded-section fix belongs in postprocess, not the prompt — it fixes the grid with ZERO Nikkori collateral (unlike prompt iters 012/013). But it is UNSCORABLE until the brasero-two oracle is expanded to cover page 1 (user already approved this direction). Also: promote only fires when the MODEL folds the grid into null-price+options; run-to-run the model sometimes over-splits instead — a postprocess rule can't recover a grid the model didn't fold. NEXT: brasero-two oracle expansion (ORACLE-CHANGE), then re-score with promote in place.
- Archive: live run in scratchpad/iter014-eval.log

## Iteration 015 — Feature 1 food/drink oracle correction
- Date: 2026-07-04 | Prompt change: NONE.
- Oracle: user/photo adjudication set food/drink totals to brasero 28/0, brasero-two 44/0, casa-nostra 23/0, el-marcos 34/8, mochomos 22/0, nikkori 48/66.
- Scorer: `items` now counts food only (`category !== "drink"`); drink section-header pseudo-items no longer fail the food gate.
- Baseline: brasero 28/28 PASS; brasero-two 43/44 PASS; casa-nostra 23/23 PASS; el-marcos fresh run 36/34 PASS; mochomos 22/22 PASS; nikkori fresh run 44/48 FAIL.
- Failure: Nikkori dense roll grid omitted/misread enough dishes to undercount food by 4; all other menus pass.
- Verdict: ORACLE-CHANGE.
- Lesson: Feature 1 has one real failure—Nikkori food completeness. Drink extraction errors are deferred to Feature 5.

## Iteration 016 — force high-detail vision for dense menu text
- Date: 2026-07-04 | Prompt change: NONE. Request change: set every `image_url.detail` to `"high"`.
- Hypothesis: explicit high-resolution image processing recovers Nikkori's dense roll rows without changing extraction semantics or regressing the five passing menus.
- Pre-run gate: items 5/6; only Nikkori fails at 44/48.
- Result: Nikkori emitted 181 total entries: 45 food and 136 drinks. The food count landed within tolerance but duplicated all six desserts and still omitted/misread rolls.
- Verdict: REVERTED. Explicit high detail caused severe over-extraction and a false-positive count gate.
- Lesson: do not retry `detail: "high"`; count tolerance alone cannot prove every food item appears exactly once.

## Iteration 017 — food-only extraction pass
- Date: 2026-07-04 | Prompt change: extract food, sides, and desserts only; explicitly skip beverages.
- Hypothesis: removing Nikkori's 66 expected drinks from the response lets GPT-4o complete the dense 48-item food grid without changing image processing.
- Pre-run gate: items 5/6; only Nikkori fails at 44/48.
- Result: Nikkori fell to 37/48 food items. Desserts were complete, but the roll grid dropped 11 items and still duplicated `Nico`.
- Verdict: REVERTED.
- Lesson: do not retry a food-only instruction on the full dense image; reducing requested scope did not improve visual enumeration.

## Iteration 018 — two overlapping vertical crops in one call
- Date: 2026-07-04 | Prompt change: provided photos may overlap; extract duplicate printed items only once.
- Input change: replace Nikkori's 1196×1896 full-page image with two 1196×1050 crops overlapping by 204 px.
- Hypothesis: larger effective text recovers the dense food grid while overlap protects items crossing the split; both crops remain one model call.
- Pre-run gate: items 5/6; only Nikkori fails at 44/48.
- Result: `finish_reason: length`; the response truncated at 65,192 JSON characters and could not be parsed.
- Verdict: REVERTED.
- Lesson: overlapping crops cannot share one full-menu GPT-4o response; duplicated visual coverage exhausts the output budget. Any crop strategy needs separate calls and deterministic merging.

## Iteration 019 — top food crop only
- Date: 2026-07-04 | Prompt change: NONE. Input: Nikkori's 1196×1050 top crop only.
- Hypothesis: if larger effective text is the missing lever, the isolated crop should recover all 42 printed rolls in one normal-size response.
- Acceptance for this diagnostic: 42 food rolls, no duplicates; desserts are outside this crop and intentionally ignored.
- Result: 37/42 rolls. It improved several names (`Ipanema Roll`, `Nikkori Maki`, `Van Halen`, `Roiz`, `Amazonas Top`, `Maíz Roll`, `Tricolor`) but omitted Roca Roll, Nevada, California, Orange Roll, Kurimi Roll, and Cosmo de Pollo, while duplicating Dinamita.
- Verdict: REVERTED.
- Lesson: top/bottom cropping improves text recognition but does not solve five-column enumeration. The next credible approach is separate calls for overlapping vertical column crops, which changes cost and merge architecture.

## Iteration 020 — separate left/right food-column calls
- Date: 2026-07-04 | Prompt change: NONE. Input: two 698×1050 crops with 200 px horizontal overlap, sent in separate calls.
- Hypothesis: each call sees at most three menu columns, recovering all 42 rolls; the overlap permits deterministic deduplication of the center column.
- Acceptance for this diagnostic: merged outputs contain all 42 printed rolls exactly once after deduplication.
- Cost: two GPT-4o calls for this Nikkori-only experiment.
- Result: left call returned 27 rolls plus 3 cropped section headers; right returned 17 rolls. After excluding headers and merging overlap duplicates (`Lomo Salteado`, `Mangudo` as `Mangud`/`Manguo`), the union contains all 42/42 printed rolls.
- OCR names improved materially: Ipanema Roll, Nikkori Maki, Ko Ebi Roll, Van Hallen, Orange Roll, Cosmo de Pollo, Maíz Roll, Tricolor, and Marco Roll were recovered.
- Remaining name errors: Nevada→`Nevadal`, Roiz→`Poli`, Mangudo→`Mangud`/`Manguo`, Unagui Masago→`Unagi Masago`.
- Verdict: ACCEPTED as a diagnostic only; no production architecture or cost change approved yet.
- Lesson: dense five-column menus require separate region calls. One full-page call, high detail, food-only prompting, and multi-crop single calls all failed.

## Iteration 021 — production compression and crop-count benchmark
- Date: 2026-07-05 | Prompt change: NONE. Input change: production-like 1024px/JPEG 70 full image and full-height left/right crops.
- Matrix:

  | Variant | Exact roll recall | Misses | Extras | Duplicates | Latency | Calls |
  | --- | ---: | ---: | ---: | --- | ---: | ---: |
  | Full compressed | incomplete | — | — | — | timed out after 120s | 1 |
  | Two raw | 38/42 | 4 | 10 | California | 45,256ms | 2 |
  | Three raw | incomplete | — | — | — | middle crop truncated | 3 |
  | Two compressed run 1 | 11/42 | 31 | 24 | none | 38,020ms | 2 |
  | Two compressed run 2 | 11/42 | 31 | 25 | none | 35,280ms | 2 |
  | Two compressed run 3 | 10/42 | 32 | 31 | Camarón, Pollo | 46,886ms | 2 |
  | Three compressed run 1 | incomplete | — | — | — | middle crop timed out after 120s | 3 |
  | Three compressed run 2 | incomplete | — | — | — | middle crop truncated | 3 |
  | Three compressed run 3 | incomplete | — | — | — | middle crop timed out after 120s | 3 |

- Crop-count decision: keep `DENSE_CROP_COUNT = 2`. Three crops fail the mandatory no-truncation condition in all three compressed runs and therefore cannot justify the extra `$0.03` call.
- Cost: 21 GPT-4o calls, approximately `$0.63` at the current `$0.03` assumption.
- Verdict: BLOCKED. Neither production-compressed strategy is viable; the selected two-crop default recovers only 10–11/42 exact roll names.
- Lesson: full-height left/right crops preserve the original 1896px height, so resizing the longest edge to 1024px does not enlarge the food text like Iteration 020's 1050px-high diagnostic crop. Revise crop geometry/compression before wiring automatic retries.
- Archive: `/Users/santiagoaguirre/Downloads/MenusTesting/nikkori.{two-raw-*,two-compressed-*,three-raw-*,three-*compressed-*}.actual.json`
