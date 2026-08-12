# Design — the portion anchor for dishes whose menu prints no weight

**Date:** 2026-08-11 · **Branch:** `feat/unweighted-portion-anchor` (off `origin/main` @ `1cc732d`)
**Status:** approved by Santiago 2026-08-11 · **implemented 2026-08-11, UNMEASURED** — no paid run has
been made, so nothing here has a number behind it yet. Plan:
`docs/superpowers/plans/2026-08-11-unweighted-dish-portion-anchor.md`. Prior art:
`docs/superpowers/prior-art-2026-08-11-dish-mass-anchoring.md`.
**Phase:** Stage-2 macro enrichment (critical path #5), inside Phase 9 of the product roadmap

---

## 1. The problem, measured

Stage 2 sizes a dish in one of two ways, and only one of them has ever been measured.

| Menu prints a weight? | How the dish gets its grams | Fixtures covering it |
|---|---|---|
| Yes — `200g`, `300gr.` | The model lists ingredients with a standard reference serving each; `resolveGrams` **rescales them to fit the printed number**. The menu sets the size | **8 of 8** |
| No | **Nothing is rescaled.** The dish's mass is whatever the independent per-ingredient reference servings happen to add up to | **0 of 8** |

Every benchmark fixture was *selected* for carrying a printed weight (`find-weighted-dishes.ts`), because
that is what B4's mechanism keys off. The consequence is that the branch serving the majority of real
menus is the branch with no oracle behind it.

**Diagnostic run, 2026-08-11** (`scripts/probe-unweighted-portions.ts`, 48 items from
`device-scans/nikkori.device-r1.dump.json` — the real-camera device scan — through `callGptEnrich`,
the deployed path):

- **48 of 48 items print no weight.** Plate mass came out **260 g min / 375 g median / 520 g max**
  across 42 rolls. Against 10–12 pieces per order that is 31–38 g per piece, which is a normal
  specialty-roll piece. **There is no gross over- or under-estimation on this menu**, and this design
  is not a response to one.
- **The defect is that plate mass tracks the length of the ingredient list:**

  | ingredients listed | rolls | median plate |
  |---|---|---|
  | 5 | 7 | 320 g |
  | 6 | 9 | 350 g |
  | 7 | 13 | 388 g |
  | 8 | 6 | 400 g |
  | 9 | 5 | 425 g |
  | 10 | 2 | 454 g |

  Monotonic, **r = 0.74, ≈ 32 g of plate per additional ingredient**. A roll whose menu blurb names
  sriracha, cebollín and ajonjolí weighs 1.8× the same roll described in five words. Sushi rice was
  pinned at exactly 150 g in 42 of 42 rolls, so the base is stable — the garnish stack inflates.
- **Product consequence:** the goal ranking is partly a ranking of menu-copy verbosity. Ko Ebi Roll
  leads on protein with 10 listed ingredients; Spicy Tuna Roll sits 4th with 5.
- **`serving_pieces` was null on 46 of 48 items**, so the per-piece stepper is dead on this menu.
- Corroboration from history: **B20** stripped printed weights from the fixtures and measured
  **16/96 at 18.8%** against the anchored **11–13/96 at 14.1–14.9%**. The unanchored path is the
  weaker one, already, on our own oracle.

**Root cause, one sentence:** nothing in the pipeline represents *how big one order of this dish is*,
so mass is an accident of addition rather than a property of the dish.

## 2. What this is NOT

- **Not** a claim that Nikkori's numbers are badly wrong — they are plausible. It is a claim that they
  are right by luck, and that the same mechanism will not be lucky on a pizza or a salad.
- **Not** a change to any dish whose menu prints a weight. The anchor fires only when
  `printed_total_g` is null; all 8 fixtures are byte-for-byte unchanged.
- **Not** a food, dish or cuisine list anywhere in the prompt — that remains banned and unit-tested.
- **Not** a change to the oracle, the fixtures, the model pin, or the tolerance bands.
- **Not** drinks or alcohol, which stay out until post-launch.

## 3. Design

### 3.1 A — the dish-level anchor

One new schema field, asked immediately after `printed_total_g` and before the ingredient list, so the
model commits to the dish's size before it portions anything into it — the same ordering argument that
made B4 and B15 work.

```
typical_total_g: number | null
```

*The total weight, in grams, of one order of this dish as a restaurant customarily serves it.*

`resolveGrams` then fits to `printed_total_g ?? typical_total_g` instead of `printed_total_g` alone.
Everything downstream — per-100 g composition, the multiplication, the Atwater sum — is untouched.

**Why this shape and not another:** it is the "ask for knowledge the model has but was never asked
for" move, which is 2-for-2 in this phase (B15, B21), and it takes arithmetic *away* from the model
rather than adding any, which is 4-for-6 (B10, B12, B4). It is explicitly **not** a wording change to
an existing question, which is 0-for-4 (B11, B13, B23, and the `serving_pieces` attempt).

**Independently corroborated by prior art** (`docs/superpowers/prior-art-2026-08-11-dish-mass-anchoring.md`,
researched 2026-08-11):

- **The exact mechanism is unpublished** — no paper tests "LLM dish-level mass vs the sum of
  ingredient reference weights" head-to-head. Not a known dead end; an untested one. Our own ablation
  is therefore the only evidence that will exist.
- **Factorising mass out is the highest-evidence adjacent result.** Nutrition5k (CVPR 2021): predicting
  calories *per gram* rather than calories directly cut MAE from 26.1% to 9.5%. Mass is the dominant
  error term, and accumulating it is the worst way to get it.
- **Ask for the mass BEFORE the ingredient list**, so the total cannot be inflated by the enumeration.
  The research recommends this independently; §3.1's field order already does it, for B4's reason.
- **The failure direction we should expect is UNDER-estimation, not over.** ChatGPT-4 under-estimated
  meal weight on 76.3% of 114 photographed meals, with bias slopes of −0.23 to −0.50 that grow with
  portion size. So the anchor may well *shrink* Nikkori's plates from today's 375 g median. That is a
  prediction to test, not a bug to pre-empt.
- **Ceiling to expect:** general-LLM weight MAPE is ~36% (ChatGPT), ~37% (Claude). If our anchor cannot
  beat that, the direct ask is not adding value — see §5's abandon threshold.

**Known counter-evidence to weigh, not to ignore:** B18 measured that the model's *dish-level* recall
loses to its ingredient sum on 6 of 8 dishes. That was dish-level **composition** (macros per 100 g of
a whole dish); this asks for dish-level **mass**, which is a different quantity — a person can know a
plate of pasta weighs ~350 g without knowing its fat content. If §5's test 1 fails, that distinction
was wrong and the design dies there, before any prompt ships.

### 3.2 A — the guardrail

An anchor outside **20–2000 g** or non-finite is discarded and the dish falls back to today's exact
behaviour. This is deliberately wide: it exists to survive a model returning `5` or `50000`, not to
express an opinion about portion sizes. It is a `ponytail:`-marked ceiling — if measurement shows the
band is doing real work, that is a finding, not a tuning opportunity.

### 3.3 The single-target rule — what the code-review graph found

`resolveGrams` has **three** callers, not one:

| caller | file | today |
|---|---|---|
| `sumIngredientMacros` | `supabase/functions/analyze-menu/enrich.ts` | production |
| `modelGrams` | `scripts/score-portions.ts:109` | portion scorer |
| (via `sumIngredientMacros`) `toMacroValues` | `scripts/macro-measure.ts:113` | **the** measurement path |

If the anchor is added as a third parameter and any of these keeps passing `printed_total_g` alone,
**the benchmark scores a pipeline production does not run** — lesson 28 verbatim, and the same class
as the `temperature: 0` break the pipeline-integrity arm caught.

So the anchor is **not** a new parameter. A single exported helper owns the choice:

```ts
/** The weight the ingredient list is fitted to: what the menu printed, else what the dish
 *  customarily weighs. The ONLY place this choice is made. */
export function portionTarget(item): number | null
```

Every one of the three call sites passes `portionTarget(item)` where it currently passes
`item.printed_total_g`. `enrich_test.ts` gains a guard that fails the build if any call site passes a
raw `printed_total_g` into `resolveGrams` or `sumIngredientMacros` — matching the existing
`macro-measure_test.ts` guards, which are proven to fire.

**Archived runs stay valid for free:** every archived response predates `typical_total_g`, so
`portionTarget` returns the printed weight or nothing, exactly as today, and `rescore-history.ts`
remains era-safe with no change.

### 3.4 B — the piece count

⚠️ **The obvious version of B is already falsified.** The benchmark log records that asking the model
for a conventional count when the menu prints none returned `null` — twice, on two different wordings,
with the pizza case (the one that motivated the feature) failing both times. **Prompt wording is 0
for 4.** Today's diagnostic agrees: 2 of 48 items volunteered a count, i.e. 4%, which is noise rather
than a feature.

The design therefore changes the **mechanism**, not the wording: `serving_pieces` becomes a
**required, non-nullable integer ≥ 1**, where `1` means "eaten as a single plate". The model can no
longer decline to answer; it must classify. Schema-level force is the same lever as B4 (required
`typical_serving_g`) and B12 (composition per 100 g), which is the 4-for-6 column.

**Falsification, stated in advance:** if the model returns `1` for the Nikkori rolls, the mechanism
failed too, and the fallback is Santiago's code-side default — a constant piece count applied to items
the anchor already identifies, decided only if we get there. No third prompt wording will be tried.

### 3.5 B — the stepper (Santiago, 2026-08-11)

A plain piece counter with **no ceiling**, opening at the full order.

| today | after |
|---|---|
| `⊖ 6/10 ⊕`, tops out at `all` | `⊖ 10 ⊕`, opens at 10, walks freely up or down |
| below one item: `3/8` | `3` |
| above one item: `x1.6` | `16` |
| item with no piece count | unchanged — `x1` / `1/2` |

**This is a label-only change** in `src/lib/portions.ts`: the stepper already has no upper bound, and
already opens at the whole item. The underlying portion fraction, and therefore every macro
calculation, is untouched. `MenuItemRow.tsx:44` and `src/types/scan.ts:48` already carry the field —
**no other UI work exists.** Minimum stays one piece.

Open, non-blocking: a bare `10` sits where `x1` used to, so it could read as ten *orders*. `10 pcs`
would remove the ambiguity for one word. Building the bare number as specified.

## 4. Blast radius

From `get_impact_radius` on `enrich.ts` + `portions.ts`: 17 nodes directly changed, 347 within two
hops, 100 files, risk **high** — dominated by archived fixtures and tests rather than by live paths.
The live paths are: `callGptEnrich` → `enrichBatch` → `sumIngredientMacros` (production), and
`portionSteps` → `MenuItemRow` (display). Tests exist for both (`enrich_test.ts`, `portions` suite of
5), and `bench-pipeline.ts` covers batching integrity.

## 5. How we will know — four falsifiable tests

| # | Test | Passes if | Cost |
|---|---|---|---|
| 1 | **Blind the 8 fixtures.** Strip the printed weight from the payload; compare the model's `typical_total_g` to the number the menu actually printed | median absolute error ≤ 25% | ~$0.05 |
| 2 | **No regression.** The 8 fixtures with their weights present | stays inside `macro-best-v8`'s 0–3/96 | ~$0.20 |
| 3 | **Slope collapses.** Re-run the 48 Nikkori items | r ≤ 0.3 **and** ≤ 10 g per ingredient (from 32) | ~$0.15 |
| 4 | **Counts appear.** Nikkori rolls under the required-field schema | ≥ 80% non-`1`, maki landing 8–12 | shares run 3 |
| 5 | **Outside ground truth.** Ask for `typical_total_g` on five dishes USDA has actually weighed | within 30% of the FNDDS figure on ≥ 3 of 5 | ~$0.02 |

Test 1 is the load-bearing one, and it is cheap because **menus that print weights are free ground
truth for an anchor that never sees them.** No new fixtures, no new USDA recipes, no approvals.

**Test 5 comes from the prior-art research and costs almost nothing.** USDA has measured dishes our
fixtures do not contain, which gives the anchor a second, independent yardstick:

| dish | USDA / FDC figure |
|---|---|
| California roll, 1 piece | **30 g** (FDC 2344446) — × 8 pieces = 240 g an order |
| Pizza slice, 1/8 of a 14" | **117 g** Papa John's cheese; whole pie **938 g** |
| Pizza slice, 14" thin crust | **79 g** Domino's; whole **563 g** |
| Hard taco, beef | **69 g** (FDC 170332) |
| Chicken wing segment, cooked | **30–34 g** edible |

These are **checks, not constants.** Nothing here is shipped, hardcoded, or put in the prompt — the
ban on food names in the nutrition step stands.

**Two thresholds that end the design rather than tune it**, both from the research:

- **Anchor MAPE > 35% on test 1** — that is the published general-LLM ceiling for weight estimation
  (36.3% ChatGPT, 37.3% Claude). Beating nothing means the direct ask adds nothing, and the fallback
  is a small shipped dish-type → mass table distilled from FNDDS/FDC composite-dish portion weights,
  keyed by a model-supplied dish type. Public domain, shippable, and the same move that cut weight
  MAE 63% in DietAI24. **Not built now** — it is the documented upgrade path, not speculative work.
- **Ingredient-count correlation still > 0.4 after anchoring** — the model's own mass estimate is
  itself contaminated by the enumeration, and the fix is field order, which §3.1 has already applied.
  If it persists with the field ordered first, the mechanism has failed.

Reproduction standard is unchanged: 4 runs × 3 draws before any figure is quoted as a range, every raw
dump hand-audited against the photo, and `rescore-history.ts` as the source of truth. Estimated total
**~$1.00**, to be approved before any paid run.

## 6. Risks

| risk | mitigation |
|---|---|
| The anchor is well-calibrated on fixtures and wrong on the cuisines we cannot test | Test 3 runs on a real foreign-language menu the fixtures never covered; the generalisation-probe route stays open |
| The anchor overwrites unweighted dishes that were already right | Test 3 measures the slope, not just the level; a flat slope with a shifted level is still a pass only if test 1 held |
| A model that answers `typical_total_g` badly on one dish now moves every ingredient in it | The 20–2000 g band catches catastrophe; confidence already drops to `low` for black-boxed items |
| Adding two fields lengthens an already long prompt and risks batch truncation | `bench-pipeline.ts` re-run as part of test 2 — it exists for exactly this |

## 7. Out of scope, recorded so it is not silently absorbed

- **Desserts collapsing.** All five Nikkori cakes returned exactly 130 g / 2 ingredients, and *Pastel
  de zanahoria* and *Red velvet* returned **identical macros** (62 C / 29 F / 527 kcal). The black-box
  guard missed them twice: the share is 100/130 = 77%, under the 0.8 threshold, and `isBlackBoxIngredient`
  compares a Spanish item name against an English ingredient name, so the name test cannot fire across
  a translation. A real, separate defect — logged, not fixed here.
- The printed-weight **scope** ruling (what a printed number covers) — still open, still Santiago's.
- Drinks and alcohol — post-launch.
