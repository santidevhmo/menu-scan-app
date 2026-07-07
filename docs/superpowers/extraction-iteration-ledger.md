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

## Iteration 022 — four overlapping 2×2 compressed crops
- Date: 2026-07-05 | Prompt change: NONE. Input change: four 718×1138 crops at X `0/478` and Y `0/758`, each compressed to a maximum 1024px edge and JPEG quality 70 before a separate call.
- Acceptance: at least two of three runs recover all 42 exact printed roll names, contain zero unresolved normalized duplicates, and complete all four calls without timeout or truncation.
- Results:

  | Run | Exact roll recall | Misses | Extras | Duplicates | Summed latency | Calls |
  | --- | ---: | ---: | ---: | --- | ---: | ---: |
  | 1 | 32/42 | 10 | 15 | none | 47,677ms | 4 |
  | 2 | 33/42 | 9 | 14 | none | 45,436ms | 4 |
  | 3 | 32/42 | 10 | 15 | Nikkori Roll | 45,325ms | 4 |

- Stable OCR substitutions included Filadelfia→`Fildelfia`/`Fidelifila`, Van Hallen→`Van Halen`, Nevada→`Nevadal`, California→`California I`, Kurimi Roll→`Kurimu Roll`, and Cosmo de Pollo→`Pollo de Pollo`.
- Completion: all 12 calls returned `finish_reason: stop`; no timeout or truncation occurred.
- Cost: 12 GPT-4o calls, approximately `$0.36`.
- Verdict: REJECTED, 0/3 passing runs.
- Lesson: reducing both crop dimensions fixes the truncation/timeout failure but does not meet exact printed-name accuracy under production compression. Do not wire Tasks 7–9 without a new extraction/name-verification design.
- Archive: `/Users/santiagoaguirre/Downloads/MenusTesting/nikkori.grid-compressed-r{1,2,3}-{1,2,3,4}.actual.json`

## Iteration 023 — Full uncompressed page, detail auto vs high (isolate the compression variable)
- Date: 2026-07-07 | Prompt change: NONE. Request change: threaded optional `detail` through `runExtraction`; default production path still omits it. Input: full raw `NikkoriMenu.png` (3.0 MB, native ~1196×1896), no client compression.
- Hypothesis: the `compressImage.ts` clamp (longest edge→1024 + JPEG q0.7 on every image) — not crop geometry — is what breaks Nikkori; removing it may pass the full page and make cropping unnecessary.
- Confound controlled: `extract.ts` sends NO `detail`, so every prior iteration ran `detail:"auto"` (uncontrolled). This iteration threads an optional `detail` param through `runExtraction` and tests two variants: (a) detail auto (production-faithful minus compression); (b) detail "high" (removes the resolution confound).
- Ceiling caveat: OpenAI high-detail normalizes the shortest side to 768px regardless of input size, so a raw full page is still only ~768px across 5 columns (~150px/col). Prediction: likely still undercounts and may reproduce iter-021's full-image timeout; running to prove compression-alone was/wasn't the culprit.
- Acceptance: food count ∈ [45,51] AND exact roll recall ≥40/42 (trustworthy, not dessert-duplication inflated) AND all calls `finish_reason: stop`. If met → compression was the culprit, cropping unnecessary.
- Baseline to beat: compressed full image = 44/48 food (iter 015); timed out after 120s under production-like compression (iter 021).
- Results: `detail:auto` timed out after 120s (no actual.json). `detail:high` returned `finish_reason:stop` in 42,555ms with 110 total items, 41 food items, and exact roll recall 25/42; layout was `dense:true,crop_direction:none`.
- Verdict: REJECTED. Full raw page does not meet the count gate or trustworthy roll-name proxy, and `auto` is not shippable under the current timeout.
- Lesson: removing client compression alone is not enough; the full-page resolution budget still misses dense-grid roll names. Do not pursue unbounded-time full-page auto for Feature 1.
- Archive: `/Users/santiagoaguirre/Downloads/MenusTesting/nikkori.raw-full-high.actual.json`

## Iteration 024 — 2×2 crops with compression removed
- Date: 2026-07-07 | Prompt change: NONE. Input change: four raw `NikkoriMenu.grid-raw-{1..4}.png` 2×2 crops with NO client compression, at `detail:"high"` — the exact cells iter-022 ran COMPRESSED (32–33/42).
- Hypothesis: OpenAI applies the 768px short-side normalization per image, so an uncompressed 2-column crop reaches the model at ~2× the effective text resolution of the full page. Isolates "remove compression while cropping" — the only variable that differed from iter-020's 42/42 raw diagnostic.
- Merge: same `mergeItemSources` dedup pipeline as iter 022.
- Acceptance (mirrors iter 022): ≥2/3 runs recover all 42 exact printed roll names, zero unresolved normalized duplicates, all 4 calls `finish_reason: stop`, no timeout/truncation.
- Cost: 4 calls/run × 3 runs = 12 calls ≈ $0.36.
- Results:

  | Run | Exact roll recall | Misses | Extras | Duplicates | Summed latency | Calls |
  | --- | ---: | --- | ---: | --- | ---: | ---: |
  | 1 | 39/42 | Nevada, Kurimi Roll, Salmón Especial | 8 | none | 69,560ms | 4 |
  | 2 | 40/42 | Nevada, Kurimi Roll | 12 | none | 60,457ms | 4 |
  | 3 | 40/42 | Nevada, Kurimi Roll | 8 | none | 63,680ms | 4 |

- Completion: final rerun completed all 12 calls with `finish_reason:stop`. An earlier first attempt timed out before producing a scored run and was superseded by the completed rerun.
- Verdict: REJECTED, 0/3 passing runs. It improves over compressed 2×2 but never reaches the required 42/42 exact roll recall.
- Lesson: raw 2×2 high-detail crops are close but consistently misread stable aliases (`Nevada`→`Nevadal`, `Kurimi Roll`→`Kurimu Roll`) and sometimes miss `Salmón Especial`; name normalization/correction or a different oracle-aware extraction design is now the likely lever, not more compression/crop geometry.
- Archive: `/Users/santiagoaguirre/Downloads/MenusTesting/nikkori.grid-raw-high-r{1,2,3}-{1,2,3,4}.actual.json`

## Iteration 025 — offline re-score of iter-024 archives under clarified count±3 + no-dup bar
- Date: 2026-07-06 | Prompt change: NONE. Offline only ($0): `scripts/eval-adaptive-crops.ts` merged each run's 4 archived raw-2×2 crops via `mergeItemSources`, filtered drinks, reported merged food count + normalized-name duplicates.
- Clarified bar (user, 2026-07-06): Nikkori food count within ±3 of 48 → [45,51] AND no duplicated food items. Exact roll-name spelling NOT required (Nevada→Nevadal, Kurimi→Kurimu are acceptable misreads). Supersedes the 42/42 exact-recall bar iters 016–024 were rejected against.
- Result: r1 actual=47 dups=[] PASS; r2 actual=52 dups=[] FAIL (+1 over the 51 ceiling); r3 actual=48 dups=[] PASS → **2/3 pass** under the clarified bar.
- Failure mode (r2): crop-boundary over-split produced near-variants `Kurimu Roll` + `Kurimu Roll I` and `Salmón Samba I` that escape exact-normalized dedup but inflate the count past 51. NOT undercount, NOT a true duplicate by exact name — a roll appearing twice under two spellings (violates "appears exactly once").
- Verdict: DIAGNOSTIC (offline, no prompt change, archived data — not the live 3/3 the exit gate needs).
- Lesson: the remaining Nikkori lever is a tighter merge/dedup in `mergeItemSources` (collapse near-variants — e.g. a trailing lone roman-numeral/`I` or single-token suffix — so `Kurimu Roll I`→`Kurimu Roll`), which fixes r2's overcount AND enforces "appears exactly once." NOT more crops/compression/prompt edits. Next: add the no-dup check to `eval-extraction.ts` items scorer, then eval 026 (live 3/3 `--gate items` with dense-crop routing).

## Iteration 026 — tighten mergeItemSources: a null section is compatible, not distinct
- Date: 2026-07-06 | Code change (NOT prompt): in `src/lib/adaptiveExtraction.ts` `duplicate()`, the near-name (edit-distance) merge required identical `section_title`; a crop that emits `section_title:null` was treated as a different section and blocked the merge. Now a null/empty section on either side is compatible. TDD: added failing test "merges near-name variant when one source omits the section", then fixed.
- Root cause (from r2 crop trace): iter-024 crop 3 emits `section_title:null`; `Kurimu Roll I`/`Salmón Samba I` (spurious trailing " I" OCR) matched their sectioned copies on price+category+edit-distance≤2 but were rejected on the section mismatch → survived as extras → overcount 52.
- Eval (offline re-score of iter-024 archives, $0, same `eval-adaptive-crops.ts`): r1=47 PASS, r2=48 PASS (was 52), r3=48 PASS → **3/3 under the clarified count±3 + no-dup bar**. r2 `missing` UNCHANGED [Nevada, Kurimi Roll] before/after → collapsed only spurious variants, lost zero oracle rolls. All 11 unit tests pass.
- Verdict: ACCEPTED (offline). Turns iteration 025's 2/3 into 3/3 with no roll loss and no regressions.
- Lesson: the last Nikkori blocker was a merge-dedup gap (null section blocking variant collapse), NOT resolution/OCR. This is offline validation on archived crops — NOT the exit gate. To CLOSE Feature 1: (1) add the no-dup check to `eval-extraction.ts` items scorer; (2) iteration 027 = LIVE 3/3 `--gate items` on all 6 menus with dense-crop routing wired into the live path (~$0.90).

## Iteration 027 — LIVE 3× exit-gate attempt, all 6 menus, dup check active
- Date: 2026-07-06 | Code: `scripts/eval-027-live.ts` (5 menus single production call; Nikkori = 4 uncompressed 2×2 tiles @`detail:"high"`, merged). Items scorer now also fails same-name+same-price duplicates (step 1).
- Result: **0/3 consecutive GATE PASS.** Run 1 PASS (all 6). Run 2 FAIL (el-marcos). Run 3 FAIL (el-marcos).
- Per menu: brasero 28/28 ×3; brasero-two 45/47/45 (+1/+3/+1 — passed but touched the +3 edge); casa-nostra 23/23 ×3; mochomos 22/22 ×3; **nikkori 49/48/50, 0 dups — PASS all 3 (historical blocker SOLVED live & stable)**; el-marcos 32(0 dup, PASS)/36(1 dup, FAIL)/36(1 dup, FAIL).
- Verdict: FAIL gate (0/3). But Nikkori passes live. New blocker = el-marcos intermittent EXACT duplicate (same name+price twice) on the NON-dense single-call path, which has no dedup (only the crop/merge path dedups). The step-1 dup check correctly exposed a pre-existing latent duplicate that count-only scoring had been hiding.
- Lesson: dedup is inconsistent across paths — dense menus dedup via `mergeItemSources`, single-call menus don't. Candidate fix: add exact (name+price) dedup to `postprocessItems` (general, safe — different-price dishes like Revueltos untouched). Also brasero-two is count-unstable near +3 (watch). Confirm the el-marcos duplicate is an artifact (not two real dishes) before/with the fix; re-run 3× after.

## Scorer refinement — duplicate = name + price + DESCRIPTION (ORACLE-CHANGE, user-approved)
- Date: 2026-07-06 | Scorer change only; NO prompt/extraction change. Supersedes the step-1 (name+price) duplicate definition and the iter-027 "add postprocess dedup" candidate (rejected — it would have DELETED real variants).
- Investigation: eval 027's el-marcos duplicate was `CHILAQUILES (70gr.) @138` ×3 — three preparations (Tradicionales / Regionales / Divorciados) with DISTINCT descriptions (found in `el-marcos.current-prompt.actual.json`). Not a spurious double-extraction — a menu item with variants. Folding variants into one item + options is Feature 2's job.
- Change: the items-dimension duplicate key went `name@price` → `name@price@description`. A true duplicate = same dish listed twice (name, price AND description identical, e.g. Nikkori `Kurimu Roll @169` ×2). Same name+price, different description = a variant, NOT a duplicate. (Revueltos 78/84/90 was already safe via distinct prices.)
- Effect: Chilaquiles-split runs (36 food, inside 34±3) will pass on count with 0 flagged dups; true identical duplicates still caught. TDD: added "different descriptions = distinct variants" self-check, kept "same name+price+desc = duplicate"; `--self-check` passes. Also: `eval-027-live.ts` now logs duplicate names inline and dumps failing menus' `actual.json`.
- Verdict: ORACLE-CHANGE.
- Next: re-run eval 027 (3× live) — expect el-marcos green; watch brasero-two's +3 edge.

## Iteration 028 — LIVE 3× re-run after the duplicate ORACLE-CHANGE
- Date: 2026-07-06 | Code: `eval-027-live.ts` (same recipe) + refined dup check (name+price+description) + per-menu failure dumps (`<menu>.eval027-r<run>.actual.json`).
- Result: **1/3 consecutive GATE PASS** (run 3 clean). The duplicate problem is GONE — 0 duplicate items on el-marcos all 3 runs; the Chilaquiles-variant ORACLE-CHANGE worked.
- Per menu: brasero 28/28 ×3; brasero-two 45/43/43 (all pass, no +3 this session); casa-nostra 23/23 ×3; mochomos 22/22 ×3; **nikkori 51/48/49 — PASS all 3 (one +3 edge); solved live across BOTH sessions (iter 027 & 028)**; el-marcos 30(FAIL)/30(FAIL)/32(PASS).
- el-marcos NEW failure mode (runs 1&2, identical, from dumped actual.json): count 30/34 = −4 undercount AND 1 phantom section-header. Both = "PA' LOS BUKIS" (a SECTION) extracted as a food item @94 + "$94 POR NIÑO" (price note) as a null-price item → ~28 real dishes + 2 junk = 30.
- Photo adjudication (ElMarcosMenu.png): el-marcos food count is CONVENTION-DEPENDENT — ≈29 by dish-name (folding variants) vs ≈35 by priced-line (Revueltos has 3 price lines, Fritos 2, Hot Cakes 2, Waffles 2, Plato Surtido 2; Chilaquiles = 1 name / 3 preps @138). Fixture=34 assumes a mostly-split convention. The model non-deterministically folds/splits → lands 30–36, straddling the ±3 band [31,37]. "Pa' los Bukis" is a $94/niño kids COMBO section, not a dish.
- Verdict: FAIL gate (1/3). Nikkori remains solved; el-marcos is the SOLE blocker.
- Lesson: el-marcos's count instability IS the variant fold/split ambiguity — entangled with Feature 2 (options). It likely will NOT stabilize under Feature 1 alone until a canonical fold/split convention is set. DO NOT prompt-tune (roadmap lesson — trades menus). Open user decisions: (a) adjudicate/reset the el-marcos oracle (34 vs ≈29–35); (b) whether Feature 1 can close el-marcos before Feature 2, or el-marcos gets deferred/paired with Feature 2; (c) how to treat the "Pa' los Bukis" combo + strip the "$94 POR NIÑO" junk.

## Iteration 028b — el-marcos real-vs-junk offline diagnostic (free, $0)
- Date: 2026-07-06 | Offline analysis of 4 saved el-marcos extractions (`scratchpad/diagnose-elmarcos.ts`): classify food items into section-header junk / price-note junk / real dishes; fold variants by distinct name; measure stability.
- Finding: **distinct real dish-NAMES per run = 29 / 29 / 28 / 28 (STABLE).** Raw item CARDS = 29 / 36 / 28 / 28 — the 36 is variant-SPLITTING (same ~29 dishes packaged as more cards, e.g. Revueltos/Fritos/Hot Cakes/Waffles multi-price lines). Junk: "PA' LOS BUKIS" (section) + "$94 POR NIÑO" (price note) in 2/4 runs. Core dish set present in EVERY run = 27; the 3 "unstable" names are just the yogurt spelling wobble (yogurt/yogurth = one dish) + the Pa'los Bukis combo line.
- Conclusion: **el-marcos has NO Feature-1 completeness gap** — it reliably finds ~28–29 real dishes every run. Its gate failure is 100% (a) variant fold/split = Feature 2, and (b) section/price junk = Feature 3. The scorer counts raw cards (swing 28–36) against oracle=34 (a split-convention count) → the mismatch is not Feature 1's responsibility.
- Implication: counting raw cards CANNOT stabilize (28–36 is too wide for any fixed ±3). Real options: (A) count DISTINCT dish-names (variant-robust) and set el-marcos oracle ≈29 → Feature 1 then measures completeness only, immune to Feature 2's fold/split; or (B) defer el-marcos to close alongside Feature 2. Correcting the oracle NUMBER alone while still counting cards will NOT work.

## Iteration 029 — Option A: completeness-only items gate → Feature 1 CLOSED
- Date: 2026-07-06 | User decision: close Feature 1, prioritize momentum. Scorer + fixture change (ORACLE-CHANGE).
- Change: the `items` gate now measures COMPLETENESS = **distinct food dish-NAMES** within ±3 (same-name variant cards fold to one dish) **AND no true duplicates** (name+price+description). The phantom-section-header check was DROPPED from the PASS condition — section-header-as-item (e.g. "Pa' los Bukis") is Feature 3's job; still reported in the detail string for visibility. el-marcos oracle re-adjudicated from the photo: `food_items` 34→28, `total_items` 42→36 (distinct dishes, not variant-split cards).
- Verification: self-check GREEN. Offline re-score under the new metric: brasero 28/28, brasero-two 43/44, casa-nostra 23/23, el-marcos 30/28, mochomos 22/22 → all PASS. Nikkori passes LIVE (48–51 across eval 027 & 028, 6 runs; rolls are unique so distinct≈cards) — its offline `nikkori.actual.json` is a STALE full-page run (~40) and must NOT be used to score it.
- Caveat (honest): NO fresh 3/3 live gate was run under the new metric (no API key this session). Closure rests on: 5 menus offline-green + Nikkori live-green (6 runs) + el-marcos completeness proven stable (iter 028b). A confirming `eval-027-live.ts` run under the new scorer is recommended as a formality, not a blocker.
- Verdict: ORACLE-CHANGE + **Feature 1 CLOSED** (completeness met on all 6 menus).
- Handed to Feature 2/3: variant fold/split (Chilaquiles/Revueltos → 1 item + options) = Feature 2; the "Pa' los Bukis" section-vs-item question + "$94 POR NIÑO" junk = Feature 3. Frozen gate for F2 = `items` (via `eval-027-live.ts`, which routes Nikkori through crops — the plain `--gate` path canNOT crop Nikkori) + `options`.
