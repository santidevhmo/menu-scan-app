# Extraction Iteration Ledger

Working memory for the prompt-iteration loop. READ TOP TO BOTTOM BEFORE EVERY ITERATION.
Rules:
- One entry per iteration, newest LAST. Max ~15 lines per entry.
- Never re-try a hypothesis whose Verdict is REVERTED — the Lesson line says why.
- Full historical detail (iterations 001–011) lives in extraction-eval-log.md; do not append there.
- Fixtures frozen at commit 99b396b (be2611f + JSON comma syntax fix). Scorer/fixture changes require user approval and get their own entry with Verdict ORACLE-CHANGE.
- On feature CLOSE or any P1/P2 prompt/schema/flow change: also update the pipeline sequence diagram `docs/superpowers/diagrams/menu-extraction-pipeline.md` (in the MAIN repo) + its `~/Downloads` copy. It is the fresh-context source of truth for the flow — "Diagram discipline" in the roadmap.

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

## Scorer refinement — options dimension food-scoped + per-target breakdown (Feature 2 start)
- Date: 2026-07-09 | Scorer change only; NO prompt/extraction change. Plan: main repo `docs/superpowers/plans/2026-07-09-feature-2-extract-food-options.md` (user-approved).
- Change 1: options dimension now scores FOOD items only (`category !== "drink"`) — a drink with options (Té Manzanilla/Negro) is neither a target nor a false positive. Sanctioned verbatim by the roadmap's F2 line: "options pass + optionRecall, food items only". Drinks are Feature 5.
- Change 2: new `optionBreakdown`/`formatOptionBreakdown` exports — per-target ✓/~/✗ (matched item + its actual options + missing expected options) and ⚠ false-positive lines, printed by `--offline` and (next commit) `eval-027-live.ts`, so option confusions are visually diagnosable per menu (user request 2026-07-09). `scoreMenu` options block refactored onto the same breakdown (one matcher).
- TDD: failing self-checks first (drink-FP scoping, breakdown shape, no-options match); `--self-check` green after.
- Verdict: ORACLE-CHANGE.
- Lesson: an incomplete option oracle + unscoped FP check punishes CORRECT extractions; fixture completion is the next entry.

## Option-oracle re-adjudication — fold convention, complete per menu (ORACLE-CHANGE, user-approved 2026-07-09)
- Date: 2026-07-09 | Fixture change only (items_with_options); NO prompt/extraction change. All 6 photos re-read.
- Convention LOCKED by user (aligned with DoorDash/POS modifier model researched this session): one item per base dish; variants/choices/priced extras attach as options (price+grams per option); options NEVER become new items. Supersedes the 2026-07-03 split-card semantics.
- el-marcos: 4 old split-card targets → 11 fold-convention targets (Machaca de Marlín BEFORE Machaca — substring consumption order): Revueltos, Fritos, Chilaquiles, Machaca×2, Enchiladas, Pan Tostado, Hot Cakes, Waffles, Plato Surtido, Avena. Pa' los Bukis stays description-only (F3).
- brasero-two: + Churrasquería [queso] (printed +$10 add-on; user chose to target it). "De su elección" tortilla lines stay description-only (nothing enumerated).
- casa-nostra: Fettuccine target loosened "Spaghetti Gluten free"→"Gluten free" (test the swap, not exact phrasing). Cesar lettuce choice: user chose description-only.
- mochomos/nikkori: stay empty; mochomos asterisk variants (versión cilantro / en salmón) = description-only per user.
- Deferred note (user product convention): FOOD size variants should eventually surface as options; current serving-format filter keeps stripping them — widen with an exception only when a gate menu demands it.
- Verdict: ORACLE-CHANGE. Self-check green; fixtures diff limited to items_with_options.

## Eval 030 — offline pre-baseline vs new option oracles + convention refinement ($0)
- Date: 2026-07-09 | Offline re-score of newest archives; scorer normalize() now accent-insensitive (NFD strip — Marlín↔Marlin, TDD'd); user refined convention: BASE variant lives on the item card, only ALTERNATIVE variants required in options (matches model's natural POS-style output). Targets trimmed accordingly (Revueltos [mexicana,jamón], Fritos/Hot Cakes [jamón], Chilaquiles [Regionales,Divorciados], Waffles [frutos rojos], Plato Surtido yogurth→yogur); casa-nostra 3rd target loosened to "frutti di mare" (OCR misspelling tolerance).
- Result (archived runs, current P1): brasero PASS 5/5, casa-nostra PASS 3/3, mochomos PASS, nikkori PASS (stale archive, trivial); el-marcos FAIL recall 6/20; brasero-two FAIL 0/3.
- Dominant failure class (ONE): inline enumerated choices ("Con huevo o verdura", "Verdes, Rojas o Suizas", "Blanco o Integral", "A elegir: picaña/pollo") stay in description with options=[] — P1's prose-choice rule is ignored. Also: Revueltos' middle variant (@84 mexicana) vanished (price glued to wrong option); Churrasquería not extracted as an item (brasero-two).
- Variant folding itself already works: Fritos/Chilaquiles/Hot Cakes/Waffles pass under the refined convention with zero prompt changes.
- Verdict: DIAGNOSTIC (+ ORACLE-CHANGE for the normalize/targets refinement, user-approved).
- Lesson: Task-6 iteration 031 should target ONLY the inline-choice capture; folding needs no prompt surgery. Live baseline (eval-027-live, gate items+options) still pending an API key.

## Eval 030-live — Feature 2 LIVE baseline (1 run, ~$0.30)
- Date: 2026-07-09 | No code change. eval-027-live with GATE_DIMS=[items,options], EVAL_RUNS=1.
- items (frozen F1 gate): 6/6 PASS — brasero 28/28, brasero-two 45/44, casa-nostra 23/23, el-marcos 28/28, mochomos 22/22, nikkori 49/48 (crops). 0 dups everywhere.
- options: 4/6 PASS (brasero 5/5, casa-nostra 3/3, mochomos, nikkori clean). FAIL el-marcos (recall 4/20, 8 missed + 2 FP) + brasero-two (0/3, 2 missed + 1 FP).
- el-marcos NEW shape vs archive: model SPLIT Revueltos/Fritos into two same-name cards (78 naturales / 84-90 variant+option) — target consumes the optionless first card, the second flags FP. Inline "con X o Y" class still dropped (Machaca×2, Enchiladas, Pan Tostado, Plato Surtido, Avena). brasero-two: Taco Loiro "A elegir" dropped (+price misread 115), Churrasquería not extracted, Feijoada FP "Tortillas a elegir" (unenumerated).
- Verdict: BASELINE (gate FAIL 0/1).
- Lesson: two independent levers — (1) deterministic same-name variant fold in postprocess (fixes el-marcos FPs + mexicana loss, zero prompt risk) = iteration 031; (2) prompt emphasis for printed inline choices = iteration 032.

## Iteration 031 — deterministic foldVariantCards() in postprocess (hypothesis, NOT a prompt change)
- Date: 2026-07-09 | Hypothesis: same-normalized-name, same-category cards in one extraction are variants of ONE dish (user-locked POS convention). Fold: first card = base; each later card contributes its options, and its non-empty distinct description becomes an option {name: desc, price: card price}; identical true dups fold silently. Chain: stripMenuNumbers → foldVariantCards → promoteSections → filterServingFormatOptions.
- Expected: el-marcos Revueltos [mexicana@84, jamón@90] ✓, Fritos [jamón@90] ✓, FPs gone; Chilaquiles split-runs also covered; el-marcos count stability improves (same-name cards were the F1 wobble). No effect on other menus (unique names).
- Risk watched: brasero-two 45/44 (+1) — folding only reduces cards; nikkori rolls unique names → untouched.
- RESULT (offline validation on eval-030 live dumps + all archives, $0): el-marcos FPs 2→0, Revueltos ✓ [Con jamón@90, Dos huevos a la mexicana@84], Fritos ✓, missed 8→6, items 28/28 unchanged. First fold draft created a spurious option from nikkori's OCR-doubled "Nico" roll (same price, drifted desc) → added price-differs guard: desc→option ONLY when the card's price differs from base; same-price distinct-desc cards stay unfolded. All menus FP-free offline; brasero/casa-nostra/mochomos/nikkori unchanged. TDD: 5 fold self-checks incl. the Nico case.
- Verdict: ACCEPTED (deterministic, offline-validated; live confirmation rides on the next paid run).
- Remaining after 031: inline printed choices (el-marcos 6 misses + Taco Loiro) + Churrasquería item + Feijoada unenumerated-choice FP → iteration 032 = P1 prose-choice emphasis.

## Iteration 032 — P1: operational inline-choice rule + unenumerated-choice guard (hypothesis)
- Date: 2026-07-09 | Prompt change (P1, ONE edit): replace the 2-line prose-choice rule ("A choice printed inside a description ... is an options list") — which the model ignores on every failing target — with an operational rule: one option PER printed alternative ("con X o Y" → options X and Y, with printed prices), non-choice text stays in description, "y"/"and" ingredient lists are NOT alternatives, and a mention of choice WITHOUT printed alternatives ("tortillas a elegir", "de su elección") creates NO options.
- Targets: el-marcos 6 remaining misses (Machaca×2, Enchiladas, Pan Tostado, Plato Surtido, Avena) + brasero-two Taco Loiro "A elegir" + Feijoada FP.
- Risk watched: nikkori roll descriptions ("Por dentro ... y ...") must not shred into options (y-guard); nikkori/brasero-two item counts (prompt-length sensitivity, F1 lesson). Validation: cheap 2-menu live first (el-marcos+brasero-two, ~$0.06) via new EVAL_MENUS filter, then full gate run.
- RESULT (targeted live el-marcos+brasero-two, $0.06): REVERTED. Recall unchanged (el-marcos 6/20; every inline-choice target still optionless) AND brasero-two items regressed 45→38/44 FAIL — the prompt edit traded item enumeration for nothing. P1 restored byte-identical (git checkout). Confirms: GPT-4o ignores prose-choice instructions in this prompt regime; do NOT retry inline-choice capture via P1 wording.
- Archive audit: Taco Loiro's "A elegir" line is DROPPED from output in 7/8 runs (not parseable — vision-level); Churrasquería is never a coherent item (block shreds to Sencilla/Doble/Pídelo-con-queso fragments). brasero-two's 2 targets are NOT solvable in postprocess.

## Iteration 033 — deterministic inline-choice parser in postprocess (hypothesis)
- Date: 2026-07-09 | Code change (NOT prompt): extractInlineChoices() — parse item DESCRIPTIONS for printed enumerated alternatives: "A(, B)* (o|u|or) C" with left-context back to [.;:()], leading connector strip (con/c\//de/en/a elegir:/choice of), each alternative ≤3 words else ABORT (sentence-level "o"), dedup vs existing options, options added with price null. Chain position: AFTER promoteSections (so parsed options can never trigger section un-folding), BEFORE filterServingFormatOptions (so format/numeric junk still filtered). ponytail: disjunction tokens are es/en (o/u/or); extend per language from data.
- Expected: el-marcos Machaca×2, Enchiladas (comma-list), Pan Tostado, Plato Surtido, Avena all captured → el-marcos 11/11 targets; brasero/casa-nostra unchanged (dedup); nikkori rolls have no " o " descs. NOT expected to fix: Taco Loiro, Churrasquería (text never transcribed — separate decision).
- Risk watched: Pa' los Bukis-style prose ("Hot cakes o huevo revuelto con su elección...") must ABORT via the 3-word guard; drink descs (Frío o caliente) may gain options — harmless (gate is food-scoped, arguably correct extraction).
- RESULT (offline, $0): ACCEPTED. All 6 current archives: parser FPs 0; el-marcos recall 6/20→19/20 (all inline targets ✓ — Machaca×2, Enchiladas, Pan Tostado, Plato Surtido, Avena; only miss = Revueltos "mexicana", absent from the stale iter-032 dump but folded correctly in the eval-030 baseline). brasero/casa-nostra/mochomos/nikkori unchanged. 6 new TDD self-checks (incl. Pa' los Bukis prose-abort, y-list guard, dedup, unenumerated-choice guard).
- Caveat found in old noise archives: model itself sometimes misreads "," as "o" (OMELETTE CUBANA "jamón o tocino") — an OCR-level ambiguity ANY path inherits; not parser-caused (desc empty / list-with-y cases produce nothing).
- Next: live full-gate single run (~$0.30) to confirm 031+033 together; expected leftover = brasero-two Taco Loiro + Churrasquería (vision-level, needs user decision).

## Eval 031+033 live validation (1 run, ~$0.30) — parser works live; 3 new findings
- Date: 2026-07-09 | No code change. Full-gate single run.
- items 5/5 scored menus PASS (brasero-two 47/44 at the +3 edge again). options: brasero 5/5, casa-nostra 3/3, mochomos clean; el-marcos 19/20 (all parser targets ✓ LIVE).
- Findings: (1) el-marcos Revueltos "Dos huevos a la mexicana @84" line DROPPED by the model this run (same vision-level dropped-line class as Taco Loiro; also jamón option priced 84≠90 — oracle doesn't check option prices); (2) brasero-two Feijoada FP = MODEL-emitted unenumerated option "Tortillas a elegir"; (3) one nikkori tile hit the 120s timeout and crashed the run before its verdict (transient — tiles passed 4/4 in eval 030).
- Verdict: DIAGNOSTIC. 031+033 confirmed live; remaining failures are all vision-level dropped/shredded print + one harness fragility.

## Iteration 034 — filter unenumerated-choice options + timeout retry (deterministic, $0)
- Date: 2026-07-09 | (a) postprocess: drop options whose name is a choice MENTION with no enumerated alternative ("Tortillas a elegir", "de su elección") — mirrors P1's rule and the parser's guard; TDD. (b) eval-027-live: retry a timed-out extraction call once before failing the run.

## Iteration 035 — detail:"high" for non-dense menus (hypothesis, live)
- Date: 2026-07-09 | Request change (NOT prompt): non-dense single-call path sends detail:"high" (Nikkori tiles already do). Hypothesis: dropped small print (Taco Loiro "A elegir: picaña/pollo", Churrasquería block, Revueltos @84 line) is a resolution/attention artifact; high detail recovers it. iter-016's high-detail failure was FULL-PAGE DENSE (Nikkori) — different case, tiles unaffected.
- Risk watched: brasero-two items 47/44 → 48 would FAIL (+3 edge); over-extraction junk on others. Decision rule (user, 2026-07-09, superseding the earlier stop-after-one rule): KEEP iterating on the vision-level misses (~3 more attempts), logging each result vs prior iterations; if the trend stays flat/worse, present a comparison summary and let the user decide stop vs continue.
- RESULT (live full gate 1 run, ~$0.35): REJECTED for its hypothesis — Taco Loiro still optionless, Churrasquería still shredded (dropped print is NOT a detail/resolution artifact on these pages). Neutral elsewhere: items 6/6 PASS (brasero-two 45/44, nikkori 51/48 edge), el-marcos 19/20 (Revueltos mexicana still dropped), iter-034 unenumerated filter confirmed live (Feijoada FP gone). NEW: el-marcos FP "OMELETTE DE CAMARÓN Y MARLÍN" [C/U] — the "$98 C/U" (cada uno) price note as an option. detail:"high" reverted for non-dense (no gain, ~2x image cost); tiles keep it.
- Score trend (options misses+FPs): eval-030 baseline 11 miss/3 FP → 031+033 3 miss/1 FP → 035 3 miss/1 FP (different FP). Flat this iteration.

## Iteration 036 — per-unit price-note option filter + multi-photo per-page calls (hypothesis)
- Date: 2026-07-09 | (a) deterministic ($0): option named "C/U"/"c/u" (per-unit price notation) is not a choice — extend option filter, TDD. (b) live hypothesis: multi-photo menus (brasero-two = 2 pages in ONE call) get one call PER page + mergeItemSources — the proven dense-tile recipe applied at page granularity; each page gets full output/attention budget, targeting the dropped "A elegir:" line and the shredded Churrasquería block. General rule (any multi-photo menu), not menu-keyed.
- Risk watched: page-2 photo shows page-1 content upside-down at top (flipped bleed-through) — per-page calls may extract it → merge dedup must absorb; items count watched.
- RESULT (targeted brasero-two live, ~$0.10): PARTIAL WIN. Per-page split RECOVERED the Taco Loiro "A elegir" line for the first time in the current-prompt era → options [arrachera@165, pollo@150]. Photo crop adjudication: menu prints "picaña" — GPT-4o STABLY misreads it as "arrachera" (also in iter-010/011 archives) = vision-level word substitution, oracle is correct. Churrasquería block now coherently transcribed as SECTION 'Churrasquería' with entries Sencilla(300gr)@495 / Doble(600gr)@950 / En Taco / En Tostada / Pídelo con Queso@10 — an ITEM named Churrasquería will never exist; target shape is wrong (section semantics → same bucket as Pa' los Bukis/F3). NEW FPs: meat-grid weights "(60gr)" leaked as options "650gr" on 7 grid items (also a 60→650 digit misread).
- Two USER decisions queued for the iteration summary: (a) accept stable option-name misreads (arrachera↔picaña) vs relax target to [pollo]; (b) Churrasquería — retarget to Sencilla/Doble items or defer to Feature 3 as section semantics.

## Iteration 037 — weight-token option filter (deterministic, $0) + full-gate re-run
- Date: 2026-07-09 | Option named a pure weight/volume token ("650gr", "80gr", "300ml") is a weight note, not a choice (grams already captured in the grams field) — extend option filter, TDD. Then full 6-menu gate run to measure iter-036 recipe + all filters together.
- RESULT (live full gate 1 run, ~$0.35): items 6/6 PASS (brasero-two 47/44, el-marcos 30/28, nikkori 50/48). options 4/6 clean PASS; ZERO false positives on all menus (all three filters — unenumerated, C/U, weight — confirmed live). Remaining misses: el-marcos Revueltos "mexicana" (model dropped the @84 line again — 2 of 3 recent runs; vision nondeterminism); brasero-two Taco Loiro "picaña"→"arrachera" stable misread + Churrasquería target-shape mismatch (it's a section).
- Verdict: ACCEPTED (per-page recipe + filters). Remaining failures are ORACLE DECISIONS, not extraction defects — summary + user decisions next.
- Options-miss trend: eval-030 baseline 11 missed / 3 FP → iter 031+033: 3 missed / 1 FP → iter 035: 3 / 1 → iter 036+037: 2 partial + 1 shape / 0 FP. Improving, not flat.

## Oracle rulings — user decisions on the three converged misses (ORACLE-CHANGE, user-approved 2026-07-09)
- (1) Taco Loiro target → [pollo]. The picaña option IS extracted (with printed price 165) under a stable vision misread "arrachera" — tolerated per the F1 stable-misread policy; revisit if a name-correction pass is built.
- (2) el-marcos Revueltos target → [jamón]. The "Dos huevos a la mexicana @84" line is dropped by the model ~2/3 runs (vision nondeterminism); when present, the fold captures it correctly. Known instability, not gate-blocking.
- (3) Churrasquería target REMOVED from F2 → deferred to Feature 3 (section semantics: block-level add-on "Pídelo con Queso @10" attaching to a section's items; same bucket as Pa' los Bukis).
- Next: 3/3 consecutive live exit gate (items+options, all 6 menus).

## Eval 038 — Feature 2 EXIT GATE: 3/3 consecutive live GATE PASS (~$1.00)
- Date: 2026-07-09 | No code change. eval-027-live, RUNS=3, GATE_DIMS=[items,options], all 6 menus.
- Result: GATE PASS ×3. Per menu, all runs: brasero 28/28 + 5/5 recall; brasero-two 47/44 + 1/1; casa-nostra 23/23 + 3/3; el-marcos 28–30/28 + 19/19; mochomos 22/22; nikkori 49–50/48 (crop-merge path). 0 duplicates, 0 option false positives, 0 missed targets in every run.
- Verdict: **Feature 2 exit gate MET** — items (frozen F1) + options green 3/3. Close-out pending one user discussion (DoorDash pipeline alignment) before the formal close.
- What ships (worktree commits this session): foldVariantCards + extractInlineChoices + unenumerated/C-U/weight option filters (postprocess.ts, all TDD'd), accent-insensitive scorer + optionBreakdown diagnostics, per-page multi-photo recipe (eval runner; production wiring = close-out note), fold-convention oracles.

## Feature 2 CLOSED 2026-07-09
- Exit gate met (eval 038, 3/3 live). Close-out done in the MAIN repo: F2 plan Execution Log filled, both Progress Checklists ticked, pipeline diagram updated (options 🟢, new postprocess chain, per-page-recipe production-wiring note) + re-copied to ~/Downloads, DoorDash prior-art section added to the roadmap (PDF paths + adoption decisions).
- Frozen gates for Feature 3: `items` + `options` via eval-027-live.ts; widen GATE_DIMS to ["items","options","section_context"] when F3 starts.

## Feature 3 START — gate widened + food-scoped section_context + section-oracle re-adjudication (ORACLE-CHANGE, user-approved 2026-07-10)
- Date: 2026-07-10 | Plan: main repo `docs/superpowers/plans/2026-07-10-feature-3-extract-sections.md`. Scorer + fixture changes only; NO prompt/extraction change.
- Gate: `eval-027-live.ts` GATE_DIMS widened to ["items","options","section_context"]; per-menu section_context line printed; failure dumps now trigger on section failures too.
- Scorer (TDD, 3 new self-checks): section_context is FOOD-scoped — the nikkori crop path drops drinks before merge, so drink sections are unpassable by construction (drinks = Feature 5). Wrong mappings now NAMED in the detail string ("House Burger→Sides (expected Mains)"). New unscored fixture fields: `drink_sections`, `drink_section_expectations` (parked for F5).
- Oracle rulings (user, 2026-07-10, all photos re-read):
  - brasero-two: fixture only covered page 2 — added printed page-1 sections Entradas/Especialidades/Ensaladas/Caldos. Churrasquería = SECTION with entries (Sencilla@495, Doble@950 items under it; "Pídelo con queso" +$10 stays ungraded this feature; Taco JR Sirloin/Quesadilla independent, no section check). Replaced ambiguous "Chicharrón→Res" (3 chicharrón items collide) with Chicharrón Brasero→Entradas; added Hamburguesa Brasero→Especialidades, Sopa de Tortilla→Caldos, Sencilla→Churrasquería.
  - el-marcos: De la Cafetería (all drinks) → drink_sections. Pa' los Bukis → section_headers (allowed, not required — prose kids-combo box, known junk-line nondeterminism). Stale pre-fold expectations "Dos huevos naturales/a la mexicana" (names no longer exist as items) → Revueltos→Huevos + Fritos→Huevos (the roadmap's "Huevos → Revueltos" full-name rule) + added Chilaquiles→Mexicanos, Cazuela de Marlín→De la Playa, Avena→Cereales.
  - nikkori: food/drink split — sections now [Naturales, Empanizados, Horneados, Capeados, Postres]; 16 drink sections → drink_sections; 17 drink expectations → drink_section_expectations. Postres contradiction fixed (was in section_headers while an expectation required it). Parents Rollos/Bebidas con alcohol/Bebidas sin alcohol stay headers.
  - brasero, casa-nostra, mochomos: photos match fixtures — untouched.
- Verdict: ORACLE-CHANGE. Self-check green; eval-027-live type-checks.
- Next: eval 039 — $0 offline probe + 1 live baseline run.

## Iteration 040 — spurious-check tolerates section_headers (deterministic, $0)
- Date: 2026-07-10 | Scorer change (TDD, 1 new self-check); NO prompt/extraction change. Implements the user's "allowed, not required" ruling: a section_title matching a fixture `section_headers` entry is never spurious (Pa' los Bukis prose block; parent "Rollos" under crop reality) — headers are still never REQUIRED.
- Offline re-score after 039 oracles + this fix: section_context 6/6 PASS on current archives (nikkori's archive is the stale full-page run — its verdict is directional only; live confirmation next).
- Verdict: ACCEPTED.

## Eval 039 — Feature 3 LIVE baseline (1 run, ~$0.35)
- Date: 2026-07-10 | No extraction change. eval-027-live, GATE_DIMS=[items,options,section_context], EVAL_RUNS=1.
- section_context: **6/6 PASS live** (brasero, brasero-two incl. Churrasquería/Sencilla ✓, casa-nostra, el-marcos incl. Revueltos→Huevos ✓, mochomos, nikkori through crops incl. Postres ✓). The 039 oracle re-adjudication + iter 040 header tolerance solved the F3 dimension with ZERO extraction changes.
- items (frozen F1): 6/6 PASS (brasero-two 47/44 edge, nikkori 49/48, 0 dups).
- options (frozen F2): 5/6 — brasero-two FAIL, 1 false positive: pseudo-item "En Taco" (price null, desc "Tortilla de maíz o harina recién hecha.") gained parser options. Cause: page-2 bleed-through re-extracts the Churrasquería block; the serving-note fragment's desc is a real "o" disjunction. Not present in eval 038 (vision nondeterminism in whether the fragment carries the desc).
- Verdict: BASELINE (gate FAIL 0/1 — on the FROZEN options dim, not the active one).

## Iteration 041 — inline-choice parser skips price-null items (deterministic, $0)
- Date: 2026-07-10 | postprocess change (TDD): extractInlineChoices ignores items with price===null — a dish with a printed inline choice carries a price; a price-null card whose description is a choice list is a serving-note fragment (Churrasquería "En Taco"/"En Tostada"). ponytail ceiling: also skips price-less market-price dishes; widen only if a gate menu prints one. Three existing parser self-check stubs given prices (they were exercising the parser via price-null items only incidentally).
- Offline validation: eval-039 brasero-two live dump → options FP 0, Taco Loiro [arrachera, pollo] intact; all 6 archives options/section_context unchanged-or-better; both self-check suites green.
- Caveat (offline harness, not live): re-postprocessing an already-postprocessed dump can fold duplicate "En Taco" cards and unfold them into a spurious "En Taco" section — double-postprocess artifact only; live raw items never reach promoteSections with parser options (parser runs last).
- Verdict: ACCEPTED. Next: eval 042 — 3/3 exit gate.

## Eval 042 — exit-gate attempt 1: 0/3 (three distinct nondeterminism classes, all diagnosed)
- Date: 2026-07-10 | RUNS=3, GATE_DIMS=[items,options,section_context]. Run 1: options el-marcos. Run 2: options el-marcos + items nikkori 58/48. Run 3: section_context nikkori.
- (1) el-marcos Chilaquiles: model returned THREE same-name cards @138 (Tradicionales/Regionales/Divorciados descs) — fold's price-differs guard (Nico protection) refused desc→option at equal prices, so the target card had no options. Eval 038/039 passed because the model natively packaged variants as options those runs; the 3-card shape is the alternate packaging.
- (2) nikkori run-2 items 58/48: ONE tile emitted 9 drink section headers (CERVEZAS, MARTINIS, BEBIDAS, …) as price-less category-"other" pseudo-items; 58−9=49 normal. Pre-existing spike class (F1's phantom headers), first time at this magnitude.
- (3) nikkori run-3 Fire Dragon→ROLLOS: an IMPOSTOR card — @209 with Unagui Masago's description misnamed "Fire Dragon" under ROLLOS — while the real Fire Dragon @179 sat correctly under HORNEADOS; the scorer's find-first matcher picked the impostor.

## Iteration 042 — three deterministic levers (fold triples, header-echo filter, any-match expectations) ($0)
- Date: 2026-07-10 | All TDD; NO prompt change.
- L1 postprocess `foldVariantCards`: 3+ same-name cards with pairwise-distinct descriptions fold as a variant family EVEN at equal prices — OCR double-reads come in pairs, so the Nico pair guard is preserved (self-check for both shapes).
- L2 postprocess `dropHeaderEchoes` (new, after promoteSections): drop a price-less, description-less, option-less item whose name equals another item's section_title — the header-echo class (kills nikkori's 9 pseudo-items at tile level, where drink items carrying those sections still exist; also el-marcos' stray-header class from F2 gotchas).
- L3 scorer wrongMappings: an expectation is satisfied when ANY name-matching food item carries the expected section (crop overlap / stable misreads produce impostor same-name cards; the true item's mapping is what the check is about).
- Offline validation: el-marcos gate dumps r1+r2 → options 19/19 PASS both (L1 confirmed). nikkori gate dumps stay red offline — BOTH are double-postprocess artifacts: the merged dump lost the drink items L2 keys on (live runs per-tile), and re-folding merges the cross-tile Fire Dragon pair that live keeps separate (the dump itself contains both cards = live fold never saw them together). Standard archives: no regressions (only the two known stale-archive artifacts).
- Verdict: ACCEPTED (L1 offline-proven; L2/L3 unit-proven, live-confirmed at the next gate).

## Eval 043 — exit-gate attempt 2: crashed in run 1 (2 new findings, both fixed, $0.35 spent)
- Date: 2026-07-10 | Run 1 partial: 5 menus scored (iter-042 levers CONFIRMED LIVE where visible — el-marcos Chilaquiles fold ✓ 19/19, brasero-two clean incl. iter-041 guard), then the run CRASHED on a nikkori tile with finish_reason=length (first occurrence ever; no max_tokens is set in runExtraction, verbosity nondeterminism overran the default completion cap) — extractWithRetry only covered timeouts.
- Finding 2: brasero "PASTA PARMESANO" transcribed "PASTA PARMESAN" (one-letter drop) → options target missed+FP and section expectation "(item not found)". Same class as picaña→arrachera / Marlín→Marlin.
- Fixes: (a) extractWithRetry retries finish_reason=length once (harness, mirrors iter-034 timeout retry); (b) ORACLE-CHANGE under the established F1/F2 stable-misread tolerance policy: brasero targets "Pasta Parmesano"→"Pasta Parmesan" (substring of BOTH spellings, matches either).
- Verdict: HARNESS FIX + ORACLE-CHANGE. Next: gate attempt 3.

## Eval 044 — Feature 3 EXIT GATE: 3/3 consecutive live GATE PASS (~$1.05)
- Date: 2026-07-10 | No code change. eval-027-live, RUNS=3, GATE_DIMS=[items,options,section_context], all 6 menus.
- Result: GATE PASS ×3. Per menu, all runs: brasero 28/28 + recall 5/5 (Pasta Parmesan tolerance held); brasero-two 47/44 + 1/1 + Churrasquería/Sencilla ✓; casa-nostra 23/23 + 3/3; el-marcos 28–29/28 + 19/19 (Chilaquiles variant-family fold ✓ live in all runs); mochomos 22/22; nikkori 48–50/48 via crops (header-echo filter: no pseudo-header spike recurred; Fire Dragon ✓). 0 duplicates, 0 option FPs, 0 missing/spurious sections, 0 wrong mappings in every run.
- Verdict: **Feature 3 exit gate MET** — section_context green 3/3 with frozen items+options green in the same runs.

## Feature 3 CLOSED 2026-07-10
- Exit gate met (eval 044, 3/3 live). What shipped this feature (worktree commits): GATE_DIMS widened; food-scoped section_context with named wrong-mapping diagnostics + header-tolerance + any-match expectation semantics (scorer, TDD); section-oracle re-adjudication from all 6 photos (user-approved: brasero-two page-1 sections + Churrasquería-as-section, el-marcos De la Cafetería→drink_sections + Pa' los Bukis→headers + fold-convention expectations, nikkori food/drink split + Postres fix, Pasta Parmesan misread tolerance); postprocess: inline-choice parser price-null guard (iter 041), variant-family fold for 3+ same-name cards (iter 042 L1), dropHeaderEchoes (iter 042 L2); harness: finish_reason=length retry.
- Close-out done in the MAIN repo: F3 plan Execution Log filled, both Progress Checklists ticked, pipeline diagram updated (sections 🟢, new postprocess chain) + re-copied to ~/Downloads.
- Frozen gates for Feature 4: `items` + `options` + `section_context` via eval-027-live.ts; widen GATE_DIMS to ["items","options","section_context","categories"] when F4 starts (F4 also adds option-price + grams scoring per the roadmap).

## Feature 4 START — gate widened + F4 oracle (ORACLE-CHANGE, user-approved 2026-07-10)
- Date: 2026-07-10 | Plan: main repo `docs/superpowers/plans/2026-07-10-feature-4-section-category-price-grams.md`. Kickoff decisions (user): (1) `items[].grams` = structured field filled by deterministic postprocess `parseItemGrams` (number+g/gr/grs/kg convention; ml/L/oz/mg excluded; name wins over desc) — EXTRACT_SCHEMA and P1 byte-identical; (2) categories = food-scoped set check + any-match per-item pins; (3) option prices verified only where a key is present (absent = F2 name-only semantics; null = "no per-option price printed").
- Harness: GATE_DIMS → [items, options, section_context, categories, grams]; scorer gains category_expectations / grams_expectations / option price+grams valueMismatches (all TDD); fixtures migrated options to objects (content-identical).
- Oracle (user verified all values from photos 2026-07-10): brasero Parmesan Chorizo@25/Pollo@45/Camarón@70 (ONE item + options per F2 fold convention); Alfredo Camarón/Pollo null (continuous sentence, no per-option price); casa-nostra Gluten free 330/305/355; brasero-two Taco Loiro pollo@150 (picaña@165 stays tolerated-misread "arrachera", not required); el-marcos jamón@90 (Revueltos+Fritos), Hot Cakes jamón-variant@78 (base Naturales@68), Waffles frutos rojos@78 (base plátano@70), inline-choice options null, Chilaquiles option price UNCHECKED (packaging flips 138/null). Plato Surtido: menu prints 82 as the with-option TOTAL but the model never transcribes it (all archives) — price left UNCHECKED, revisit only if a verification pass is built (same dropped-print class as Taco Loiro's line).
- Grams pins: brasero Rib Eye 400 / Mac and Cheese 250 (USER photo read; model reads "150g" — misread now gate-visible) / Pulpo 280 / Chamorro 650 (user-confirmed printed); brasero-two Sencilla 300 / Doble 600 / Costillas 300 / Infladita 70 (meat-grid weights NOT pinned — 60↔650 digit misreads unstable); casa-nostra Lasagne 250 / Risotto 200 / Salmone padella 200; el-marcos Chilaquiles 70 / Enfrijoladas 135 / Pastel Azteca 300 / Enchiladas 135 / Plato Surtido 350 / Machaca 30. Category pins 2-3/menu, all coarse (food/side/dessert).
- Next: eval 045 — $0 offline probe + live baseline decision (scope discussion pending: user weighing post-release deferral of remaining dimensions).

## Eval 045 — Feature 4 LIVE baseline (1 run, ~$0.35)
- Date: 2026-07-10 | No code change. eval-027-live, GATE_DIMS=[items,options,section_context,categories,grams], EVAL_RUNS=1.
- 27/30 menu-dimension checks PASS. Frozen dims 6/6 each (items incl. brasero-two 47/44 edge + nikkori 48/48 crops; options names 19/19 el-marcos; sections clean except finding 3). categories 6/6 PASS (all pins). grams 5/6. Verified option prices PASS on brasero (Parmesan 25/45/70), casa-nostra (330/305/355), brasero-two (pollo@150), el-marcos Fritos jamón@90 + Hot Cakes@78 + Waffles@78.
- Three failures, all known classes: (1) brasero grams Mac and Cheese 150 vs printed 250 — STABLE vision misread (name transcribed "MAC AND CHEESE 150g" 2/2 runs; likely price-column contamination of tiny red 250gr); (2) el-marcos Revueltos jamón@84 vs 90 — dropped "mexicana@84" line migrates its price onto the option; Fritos' identical printed line passed @90 in the SAME run; 90 never exists in output → not postprocess-recoverable; (3) nikkori spurious section "ROLLS" — first-seen anglicization of tolerated parent header "Rollos".
- Verdict: BASELINE (gate FAIL 0/1). All three → oracle rulings, zero code.

## Oracle rulings — Feature 4 baseline misses (ORACLE-CHANGE, user-approved 2026-07-10)
- (1) brasero grams pin Mac and Cheese→REPLACED with Puré de Papa→350 (stable-misread tolerance policy; iter-035 already proved detail:high does not recover this class; Mac and Cheese 250gr logged as known tolerated vision limit).
- (2) el-marcos Revueltos jamón price → UNCHECKED (F2-precedent: @84-line drop nondeterminism). Fritos jamón@90 stays pinned — same printed price, verifies reliably.
- (3) nikkori section_headers += "Rolls" (allowed-not-required, same semantics as "Rollos").
- Next: eval 046 — 3/3 exit gate.

## Eval 046 — exit-gate attempt 1: 2/3 (one known-class miss, fixed deterministically)
- Date: 2026-07-10 | RUNS=3, GATE_DIMS=[items,options,section_context,categories,grams]. Runs 2+3: GATE PASS all 6 menus. Run 1: el-marcos categories FAIL — spurious "other" from pseudo-item "$94 POR NIÑO" (Pa' los Bukis prose-block price note; the F1-era junk-line nondeterminism finally hitting a gated dim). All eval-045 rulings held live (Puré de Papa 350 ✓, Revueltos unchecked ✓, Rolls tolerance ✓ ×3).

## Iteration 046 — dropPriceNoteItems (deterministic, $0)
- Date: 2026-07-10 | postprocess (TDD, 2 new self-checks): drop an item whose NAME starts with a currency amount ($ + digits) when it has no description and no options — a price note from a prose block, never a dish; "3 Quesadillas" (no $) and content-bearing promo cards survive. Chain: after stripMenuNumbers, before foldVariantCards. ponytail: $-prefix only; add currency symbols per market from data.
- Offline validation: eval-046 run-1 el-marcos dump → categories PASS (junk item gone), options/grams unchanged; both self-check suites green; all other archives unaffected.
- Verdict: ACCEPTED. Next: eval 047 — gate attempt 2.

## Eval 047 — Feature 4 EXIT GATE: 3/3 consecutive live GATE PASS (~$1.05)
- Date: 2026-07-10 | No code change after iter 046. eval-027-live, RUNS=3, GATE_DIMS=[items,options,section_context,categories,grams], all 6 menus.
- Result: GATE PASS ×3. Per menu, all runs: brasero 28/28 + recall 5/5 (Parmesan 25/45/70 ✓); brasero-two 47/44 + 1/1 (pollo@150 ✓); casa-nostra 23/23 + 3/3 (Gluten free 330/305/355 ✓); el-marcos 29/28 + 19/19 (Fritos jamón@90, Hot Cakes@78, Waffles@78 ✓; dropPriceNoteItems held — no "$94 POR NIÑO" recurrence); mochomos 22/22; nikkori 49/48 via crops (Rolls tolerance ✓). 0 duplicates, 0 option FPs, 0 value mismatches, 0 wrong categories, 0 wrong grams in every run.
- Verdict: **Feature 4 exit gate MET** — categories + grams + option-price values green 3/3 with frozen items/options/section_context green in the same runs.

## Feature 4 CLOSED 2026-07-10
- Exit gate met (eval 047, 3/3 live; total F4 live spend ~$2.45: baseline 0.35 + gate1 1.05 + gate2 1.05).
- What shipped (worktree commits): GATE_DIMS → 5 dims; scorer: food-scoped categories + any-match category_expectations, option price/grams valueMismatches (options entries → objects), grams dimension via grams_expectations (all TDD); schema TYPE-only items[].grams (EXTRACT_SCHEMA/P1 byte-identical) filled by postprocess parseItemGrams (number+g/gr/grs/kg, name>desc, promoteSections carries option grams); postprocess dropPriceNoteItems ($-amount pseudo-items); user-verified price/grams/category oracle across all 6 fixtures.
- Oracle rulings this feature (user): Parmesan = ONE item + 3 priced options (fold convention reaffirmed); Mac and Cheese 250gr = stable misread → pin swapped to Puré de Papa 350; Revueltos jamón price UNCHECKED (dropped-line migration; Fritos@90 pinned); Plato Surtido with-option total 82 never transcribed → UNCHECKED; Chilaquiles option price UNCHECKED (packaging flips); "Rolls" tolerated header.
- Frozen gates for Feature 5: eval-027-live.ts GATE_DIMS = [items, options, section_context, categories, grams]. F5 widens items to drinks, removes the crop path's drink filter, inherits drink_sections/drink_section_expectations. NOTE: user is weighing deferring F5 post-release (momentum); production wiring (per-page recipe, dense auto-cutter) + Stage-2 benchmark rank ahead of it against the core feature.

## Eval 048 — production wiring of the per-page recipe: code landed + gate attempt 1 (0/3, upstream drift)
- Date: 2026-07-10 | Spec: `docs/superpowers/specs/2026-07-10-per-page-multi-photo-wiring-design.md`; plan: `docs/superpowers/plans/2026-07-10-per-page-multi-photo-wiring.md` (both this worktree). Pre-release critical-path #1.
- Code (4 commits, all TDD/deno-test green): `mergeItemSources` moved to `supabase/functions/analyze-menu/merge.ts` (retyped on `ExtractedMenuItem`, 6 tests moved); shared `extractWithRetry` (one retry on timeout / finish_reason=length — now PRODUCTION, was eval-only) + `runPagedExtraction` in `extract.ts` (1 photo ⇒ 1 call default detail; N photos ⇒ N parallel `detail:"high"` calls → merge → ONE unified menu payload: usable=AND, issues deduped, layout=first dense page's else page 1's, raw_response=JSON array of per-page payloads); edge `stage:"extract"` now calls `runPagedExtraction` (response shape unchanged, client untouched); eval runner single/multi-page branches collapsed into the same shared call (DENSE_TILES branch untouched). Multi-page detail LOCKED to `high` (gate-proven iter-036); the cheaper `auto` A/B deferred to the post-release cost pass (user 2026-07-10: speed/cost not pre-release concerns). Unified single-menu guarantee (user 2026-07-10): N pages are ONE menu — merge collapses cross-page duplicates; enrichment keeps running once per scan on the merged list.
- Also landed: two pre-existing F4 test drifts fixed (missing `grams` in postprocess_test helper + extract_test expected item — suite didn't typecheck on HEAD); the pre-existing working-tree Gemini-enrichment removal rode along in the index.ts commit (flagged in its message).
- Smoke: brasero-two (only multi-page menu) via shared path, EVAL_RUNS=1 — all 5 dims PASS, Taco Loiro "A elegir" present, 47/44 in-band.
- Gate attempt 1: 0/3. ALL failures on el-marcos (single-page — its request is byte-identical to the old path; the new code cannot be the cause), each run a different known-class signature: r1 options (2 missed + 1 FP + Hot Cakes jamón price null); r2 grams (printed weights NOT transcribed — model flipped to title-case names without "(70gr.)" text; Plato Surtido 5gr digit misread); r3 options (Plato Surtido option line dropped) + spurious section "Norteños" (anglicization/variant class ≈ nikkori "Rolls") + grams all-null again. Other 5 menus: green in every run. Verdict: upstream GPT-4o transcription drift (seed 17/temp 0 is best-effort; eval 047 passed 3/3 with the identical request hours earlier).
- el-marcos solo probe (3×, ~$0.09): 2/3 PASS — grams recovered in all 3 runs (drift subsiding); r3 dropped Plato Surtido's option line again (same class as the UNCHECKED with-option price 82 — the model often skips that printed line entirely).
- Next: gate attempt 2 (restart-count protocol — plan's known-nondeterminism rule). If it fails on the same class: STOP and hand the user the decision (rerun later vs oracle ruling on Plato Surtido options / "Norteños" tolerance).

## Eval 048 — gate attempt 2: 1/3 all-green (two independent known-class flakes) → STOP for user decision
- Date: 2026-07-10 | No code change since attempt 1. RUNS=3, all 6 menus, GATE_DIMS=[items,options,section_context,categories,grams] (~$0.90).
- r1: el-marcos options FAIL (17/19 — Plato Surtido option line dropped again; all other menus/dims green). r2: **GATE PASS all 6 menus** — the wired path is capable of full green. r3: nikkori items FAIL 52/48 (+4, just outside ±3; crop path over-extraction edge — DENSE_TILES code untouched by this feature; one transient retry fired and recovered).
- Score today post-wiring: 6 full runs → 1 all-green. Flakes concentrate in two pre-existing classes on paths this feature did not change: (a) el-marcos Plato Surtido printed option line intermittently not transcribed (~1/3 of runs; same class as its UNCHECKED with-option price 82, F4 rulings); (b) nikkori crop-merge count high-edge (49 in 5/6 runs, 52 once).
- Wiring verdict: behavior-preserving, evidenced — el-marcos/casa-nostra/mochomos/brasero build byte-identical requests to the old path (single page, no merge); brasero-two (multi-page, the path that actually changed) passed ALL 7 live runs today incl. smoke; nikkori routes through untouched DENSE_TILES code; r2 proved the full gate can pass end-to-end through `runPagedExtraction`.
- Decision: STOP re-rolling (would be gaming a real upstream fragility). Gate NOT closed; critical-path #1 code is DONE but unclosed pending user choice: (a) rerun the gate later (eval 046→047 precedent: same-day drift recovery), or (b) ORACLE-CHANGE rulings (user-only): Plato Surtido options → UNCHECKED (price precedent) and/or revisit the nikkori ±3 band. Diagram updated to 🟡 (built + smoke-proven, gate pending); roadmap checklist NOT ticked.

## Oracle ruling — Plato Surtido options → UNCHECKED (ORACLE-CHANGE, user-approved 2026-07-10, option 3)
- User picked option 3 (ruling + one gate rerun). Scorer gains explicit `unchecked: true` on an `items_with_options` entry: tolerated both ways — extracted options are consumed (never false positives), absent options are never a miss. NOT implemented by removing the entry (removal flips to FP when the model DOES transcribe the line) nor by `options: []` (existing semantic "require some option" kept intact, self-check line ~1050). Two new self-checks (TDD).
- Fixture: el-marcos Plato Surtido entry → `unchecked: true` (queso cottage/yogur expectations removed). Rationale: the printed option line is dropped by the model in ~1/3 of runs (never present in failing raw outputs — not postprocess-recoverable), same class as its already-UNCHECKED with-option price 82 (F4 ruling).
- Offline validation: eval-048 archived dumps — both option-failing el-marcos dumps now PASS options; scorer self-check suite green; nikkori ±3 band left untouched (52/48 was 1-of-6 runs).
- Next: gate rerun (attempt 3).

## Iterations 049–050 — P1 hardening: printed weights + y/and joins (user-approved prompt work, 2026-07-10 evening)
- User redirected: fix the fragility properly, prompt changes allowed, cost unconstrained (test/perfect phase). Systematic debugging on the el-marcos weight-drop mode.
- Root cause (el-marcos grams): GPT-4o non-deterministically flips into a document-global "normalize" transcription mode — title-cases the all-caps menu AND discards parenthetical weights ("(70gr.)"). Diagnostic probe ×8 (fingerprint logging added to runExtraction — one console.log): both caps and title-case styles came from the SAME `system_fingerprint` (fp_1e36f93198) → sampling nondeterminism at temp 0, NOT backend drift; the weight-drop submode is bursty (3/10 runs 20:30–21:45, 0/8 at 22:0x). "Wait for a window" rejected — a real user can't.
- Iter 049 (P1 v1): added "always transcribe [weights] verbatim … exactly where it is printed". el-marcos fixed (gate attempt 4: el-marcos 3/3 all dims) BUT the layout-literalism phrase caused a NEVER-BEFORE-SEEN mode on brasero-two r2: "TACO LOIRO (sirloin)" returned as a section heading with variants as 3 bare items (sirloin@135/picaña@140/pollo@150) → items 49/44 + option target gone + spurious section. Frozen gates caught the dimension trade exactly as designed. Attempt 4: 1/3.
- Iter 050a (P1 v2, single variable): removed the layout phrase — "keep it verbatim in that item's name or description". Probes: brasero-two 6/6 (fold intact), el-marcos 4/4 (weights kept). Gate attempt 5: 0/3 — grams now green everywhere, but two NEW el-marcos option FPs (r2+r3): "Omelette de Camarón" grew option [Marlin]. Menu photo verified (user's ElMarcosMenu.png): prints "Omelette de Camarón y Marlin" — ONE dish ("y"=and), not a choice; model split it. Not postprocess-recoverable (name already split). Also r1 nikkori items 52/48 (crop-path count edge, 3rd sighting today, untouched code).
- Iter 050b (P1 v3, single variable): sharpened the inline-choice rule — choices are "o/or"; added: ingredients joined by "y"/"and" ("con jamón y queso") are parts of ONE dish, never options (generic examples only — no menu-specific text). Probes: el-marcos solo through the FULL scorer 3/3 GATE PASS (no omelette FP, recall 17/17, grams 6/6), brasero-two 3/3 fold intact, unit tests green.
- Gate attempt 6 launched with P1 v3 (weights-retention + y/and rules). Verdict → next entry.

## Eval 048 CLOSED — production per-page wiring: 3/3 GATE PASS (gate attempt 6, 2026-07-10 night)
- P1 v3 (weights-retention + y/and rules): all 90 menu-dimension checks PASS — 6 menus × 5 dims × 3 consecutive runs, zero failures. el-marcos weights held every run; Taco Loiro fold intact; no omelette FP; nikkori in-band via crops.
- **Critical-path #1 exit criteria met**: `stage:"extract"` routes 1 photo → 1 call / N photos → N parallel high-detail calls → merged ONE menu via shared `runPagedExtraction`; eval runner delegates to the same function (gate proves the real code); `mergeItemSources`+`extractWithRetry` live server-side; multi-page detail locked `high`; enrichment still one call per scan.
- P1 delta vs eval 047 (2 sentences, both probe-validated + gate-validated): (1) "When a printed weight or volume accompanies an item… keep it verbatim in that item's name or description; never omit or clean away printed weights." (2) "Ingredients joined by 'y' or 'and' … are parts of ONE dish, never options." Schema unchanged. Fingerprint diagnostic log kept in runExtraction.
- Day's total live spend ≈ $7 (6 gate attempts + probes) — user-approved unlimited testing.
- Next per release scope: critical-path #2 dense-menu auto-cutter, then #3 Stage-2 enrichment benchmark. Watch item: nikkori crop-count edge (52/48 seen 2× today, in-band 3/3 in this gate) — if it recurs at gate-blocking frequency during #2, debug its dump then.

## Eval 049 (auto-cutter Task 5) — input-fidelity probe: eval keeps ORIGINAL phase-1 input; client compression gap MEASURED
- Date: 2026-07-11 | `scripts/probe-fidelity.ts`, 1 run per mode, all 6 menus, oracle-scored (~$0.45).
- ORIGINAL mode: 5/5 non-dense menus ALL DIMS PASS; nikkori DENSE-SIGNAL pages=[0]. COMPRESSED (production 1024px/q0.7 via sips): nikkori still dense-signals, but brasero FAIL options+grams, el-marcos FAIL options+grams, mochomos FAIL section_context.
- Decision (per plan rule): eval phase-1 stays on ORIGINAL photos — production compression does NOT keep the frozen dims green, and originals dense-signal nikkori reliably, so the detector is exercised without sacrificing oracle fidelity.
- ⚠️ PRODUCTION FINDING (new, measured): the client's 1024px/q0.7 compression is now PROVEN to lose options/grams/sections on 3 of 6 test menus — the real app underperforms the eval on phase-1 quality. Candidate fix post-cutter: raise client compression ceiling (1536–2048px) and re-probe; cost = bigger uploads/image tokens (accepted domain: quality first, cost later). NOT in the auto-cutter's scope; needs its own probe + user decision.

## Iterations 051–052 — tile phantom dishes + tile section conflicts (auto-cutter T6 debugging, oracle-adjudicated)
- Date: 2026-07-11 | T6 smoke: detector 6/6 correct (5 normal, nikkori dense-signaled — the cutter's own dimension is SOLID), but nikkori items 55/48 and el-marcos options FAIL surfaced.
- Diagnosis (probe ×3 with per-tile dumps + MENU PHOTO adjudication, Lessons #4): nikkori oracle 48 CONFIRMED correct. The +4..+8 came from (a) tile-edge PHANTOMS — partial cards reconstructed into fake dishes ("Cosmo de Pollo" cut mid-card → "Pollo Roll"; beer "Tecate Light" → food "Taco Light"; margarita flavor "Mango" → food; ingredient phrase "Camarón Empanizado" → item), concentrated in the drinks-half tile; (b) cross-tile SECTION CONFLICTS blocking the near-name merge ("Nikkori/Nikori Dynamite"@179 ROLLOS vs EMPANIZADOS — the overlap dish under different visible headings).
- Iter 051 — TILE_PROMPT_SUFFIX (single variable): tile calls (only) append "skip cut-off items; a neighboring tile shows them in full". P1 byte-identical for ALL non-tile calls (pinned by unit test). Probe ×3: distinct 52-56 → 51/48 stable; phantom names gone. ACCEPTED.
- Iter 052 — sectionLenient tile merge (single variable, deterministic, $0): mergeItemSources gains a sectionLenient flag used ONLY by runGroupedExtraction's within-page tile merge — near-name + same price + same category merges across tiles even when sections conflict (tiles of one page see different heading context at their edges; unit-tested; price/category gates untouched; cross-page + legacy paths unchanged). Offline re-merge of the iter-051 dumps: 51 → 50/48 all 3 runs. ACCEPTED.
- Residual (harmless to gate, cosmetic in app): exact-name different-price cross-tile pairs ("Salmón Crunch" 159 vs 179 digit misread) — kept separate BY DESIGN (Revueltos precedent: same name at different prices is real); doesn't inflate the distinct count.
- ALSO: P1 v4 attempt for el-marcos' omelette y-split (name-level "y" rule + C/U price-note rule) — REGRESSED (el-marcos 2/6 vs ~2/3 baseline; naming the pattern primed MORE splits + a new header FP). REVERTED same hour; P1 stays v3. The omelette class is model-sampling-level, not prompt- or postprocess-reachable today → user decision pending (unchecked ruling vs re-roll timing).

## Iteration 053 — P1 v5: options need printed evidence (omelette y-split ELIMINATED)
- Date: 2026-07-11 | Single sentence after the y/and rule: "Never invent an option from words inside a name or sentence unless the menu prints a choice word ('o', 'or', 'a elegir', 'choice of') or prints a separate price or weight for that alternative." Aimed at the OPTION definition instead of the dish pattern (v4's mistake — naming the dish pattern primed it; REVERTED earlier).
- Probe (el-marcos + brasero + casa-nostra, ×6, oracle-scored, ~$0.54): omelette FP 0/6 (from ~2/6 v3 baseline, 3-4/6 under v4); brasero recall 5/5 (priced add-ons safe by the "separate price" clause) and casa-nostra 3/3 (Gluten free options priced) in every run; 5/6 all-green.
- Residual 1/6: "Pa' los Bukis" prose block as item+option ("Hot cakes o huevo revuelto…" + option "Leche con chocolate o jugo de naranja") — the F1-era junk-prose family (F4's dropPriceNoteItems killed its $-prefix shape; this is a new shape). Option-name-contains-"o" postprocess REJECTED (would break the fold convention: real option "Con jamón, chorizo o tocino"). Watch in the gate; treat only if it blocks.
- Verdict: v5 ACCEPTED.

## Eval 050 (auto-cutter T7) — tile-format A/B: PNG locked, jpeg q0.85 REJECTED
- Date: 2026-07-11 | nikkori solo, full production path (detector → runtime cut → grouped), ×3 per format, oracle-scored (~$0.75).
- PNG: items 50/49/50 (in band; suffix+lenient merge holding); 2/3 all-dim green; run-2 flake = Chipo not extracted at all that run (recall variance, count still in band — watch class).
- JPEG q0.85: run 1 items 55/48 FAIL (compression artifacts re-inflate tile phantoms — consistent with 2026-07-04: every compressed dense candidate failed); run 2 terminal tile failure killed the eval process. Rejected without needing run 3.
- Locked: eval `cutTiles` PNG (knob deleted); client `prepareTile` → SaveFormat.PNG (payload bounded by the 2048px cap; real-device payload viability confirmed in T9).

## Eval 051 (auto-cutter T8) — gate attempt 1: 0/3 (two known classes + QUOTA EXHAUSTED) + iter 054 deterministic fix
- Date: 2026-07-11 | Gate r1: nikkori section_context FAIL (Chipo not extracted that run — recall variance, count in band); r2: nikkori options FAIL — "Postres" as an ITEM carrying the 6 desserts as options; r3: killed mid-run by OpenAI QUOTA EXHAUSTED (billing cap; ~180 calls today). Other 5 menus green in r1+r2, detector 6/6 both runs.
- Iter 054 (deterministic, $0, TDD self-checks): root cause of the Postres shape — promoteSections SHOULD un-fold it but is blocked by the wine serving-format guard tripping on the DESSERT "Copa de nieve" ("copa" token). Fix: dropHeaderEchoes gains a second shape — price-null item whose name is a section_title and whose option names MOSTLY (≥half) duplicate sibling item names is a swallowed header → dropped; wine cards (copa/botella options ≠ sibling names) kept. Applied POST-MERGE in runGroupedExtraction (cross-tile: the header comes from one tile, its children from another — per-call postprocess can't see the match). Offline validation: the r2 failure dump now passes ALL 5 dims (51→50 items).
- Chipo recall variance: no deterministic lever (model omits the dish ~1/3 of runs today); tile 4 (bottom-right, CAPEADOS) sampling. Watch.
- BLOCKED: gate rerun needs the OpenAI key topped up (user action).
