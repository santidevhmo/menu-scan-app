# B5 — Preparation-anchored composition, plus an oracle re-freeze

**Status:** approved by Santiago 2026-08-08. Not yet implemented, not yet run.
**Phase:** Stage-2 macro-enrichment accuracy benchmark (critical path #5).
**Branch:** `worktree-stage2-macro-benchmark`. Fallback: tag `stage2-b4-checkpoint` → `22a1ac5`.
**Cost:** $0 for Parts 1 and 2. ~$0.05 per run for Part 3; budget **4 runs ≈ $0.20**, each needing
Santiago's explicit approval.

---

## 1. Why — what the USDA evidence actually showed

B4's residual error decomposes cleanly. From the 12 archived B4 draws, swapping the oracle's grams in
(keeping the model's composition) and then the reverse, mean signed error:

| dish | arm | carbs | fat |
|---|---|---:|---:|
| CESAR | as it ran | +27.3% | −28.1% |
| | oracle **grams** | **+6.3%** | −29.7% |
| | oracle **composition** | +18.2% | **+2.6%** |
| Salmone | as it ran | +22.4% | −16.3% |
| | oracle **grams** | **+4.1%** | −17.1% |
| | oracle **composition** | +17.4% | **−2.6%** |
| PASTEL | as it ran | −2.7% | −28.3% |
| | oracle **grams** | +3.1% | −11.3% |
| | oracle **composition** | −4.7% | −16.5% |

**Carbs read high because of portions; fat reads low because of composition.** They are two problems,
not one. This spec addresses the fat half.

That ablation cannot say *who is right* — swapping the oracle's numbers in makes the result match the
oracle by construction. So the disputed fats were checked against USDA FDC directly ($0, free API,
via `scripts/usda-oracle.ts`). The verdict is **mixed**, which is why "the model runs lean" was the
wrong story:

| ingredient | model | oracle | what USDA offers | right |
|---|---:|---:|---|---|
| Caesar dressing | 40 | **57.8** | ~40 full-fat entries, median **36.7**, mean 37.7 | **model** |
| Mexican cheese | 30 | 28.8 | "Cheese, Mexican blend" 29.3–32.1 | **model** |
| Heavy cream | 30 | 35.6 | only 33.3 or 40.0 exist — nothing lower | **oracle** |
| Baked salmon | 13 | **18.4** | raw 11.2 · steamed 14.1 · **baked/broiled 18.4** · fried 20.7 | **oracle** |
| Croutons | 10 | 18.3 | plain 6.6; branded cluster 14.3–21.4 | **oracle** |
| Grilled chicken | 3.6 | 5.45 | 3.2 / 3.4 / 4.9 / 5.0 / **5.5** / 5.8 | either |
| Grated parmesan | 25.8 | 28.8 | 25.0 / 27.8 / **28.8** / 30.0 | either |

**The pattern in the two the oracle wins hardest:** *"Salmon al horno"* — the menu says **baked**, and
the model answered 13, between raw and steamed. *"Pollo a la plancha"* — griddled, and the model
answered the plain skinless figure. **The model is not using the preparation the menu states.** The
two the model wins are exactly those where the menu states no method and the oracle reached for the
richest available entry.

## 2. Part 1 — Re-freeze the oracle's Caesar dressing ($0)

**Santiago's ruling, 2026-08-08:** re-pick it to a mid-cluster entry now.

**New entry: FDC `2290157` — "CAESAR DRESSING", per 100 g: 367 kcal, protein 3.3 g, carb 6.7 g,
fat 36.7 g.** Replaces FDC `2710199` (542 kcal / 2.2 / 3.3 / **57.8**) in `scripts/fixtures/macro-oracle.json`,
CESAR's fifth ingredient, at its existing 30 g. `basis` stays `"prepared"`.

**Why this entry:** 36.7 is the exact median of ~40 full-fat Caesar entries, and **three separate
branded entries agree on 367 / 3.3 / 6.7 / 36.7**, so it is a consensus rather than one product. It
keeps a real `fdc_id`, as every oracle ingredient must.

**Recorded caveat:** branded FDC entries are back-computed from serving sizes, which is why they land
on multiples of 3.3. The only SR Legacy "regular" Caesar entries are the 57.8/57.9 pair — there is no
mid-cluster canonical entry, so this trades a little provenance polish for representativeness. That
trade was Santiago's explicit choice.

**Estimated effect on CESAR's oracle** — the implementation recomputes with `usda-oracle.ts` rather
than trusting this arithmetic:

| | old | new (est.) | B4 model | old error | new error |
|---|---:|---:|---:|---:|---:|
| Calories | 462 | ~410 | 427 | −8.2% | +4.3% |
| Protein g | 30.08 | ~30.4 | 38 | +26.3% | +25.0% |
| Carbs g | 17.38 | ~18.4 | 22 | +26.6% | +19.6% |
| Fat g | 29.45 | ~23.1 | 21 | −28.7% | **−9.1%** |

CESAR fat was the tightest passing field in the benchmark at 1.3 points of margin; this takes it to
roughly 21.

## 3. Part 2 — A re-score mode for the harness ($0)

The oracle has now changed twice and will likely change again. Each time, every archived run must be
re-scored so history stays comparable — and there is no way to do that today. `a4ebf0f` did it with
an ad-hoc script that no longer exists.

Add `BENCH_RESCORE=1` to `scripts/bench-macros.ts`: when set, read
`scripts/fixtures/caches/macro-bench.<runId>-d<n>.raw.json` instead of calling OpenAI, and score
exactly as a live run does. Everything downstream is unchanged, so a re-score is guaranteed to use the
same scoring path as the run it replaces.

This is the smallest change that removes a recurring manual step; it is not speculative.

**Re-score all ten archived runs** after Part 1: `baseline-002`, `iter-b1-001`, `iter-b10-001`,
`iter-b11-001`, `iter-b12-001`, `iter-b13-001`, and `iter-b4-001` through `-004`. Record the corrected
figures in the log.

`baseline-001` is deliberately excluded: it ran against a floating model alias, which is what made it
historical rather than reproducible (see the log's baseline-002 notes). Re-scoring it would imply a
comparability it never had.

**Expect the comparison to shift in both directions.** The re-freeze lowers CESAR's oracle fat, and
baseline-002r's worst field was CESAR fat at −32.1% — so **the baseline improves too**. The honest
framing after Part 1 is a re-scored table where every row moved, not "B4 got better". Whether B4 still
beats baseline is a question the re-score answers; it must not be assumed.

**The checkpoint tag needs care.** `stage2-b4-checkpoint` is annotated with numbers computed under the
**old** oracle, and tags are immutable by ruling. Write the re-scored figures into the log's Rulings
section next to the tag, and state plainly that the tag message predates the re-freeze. Leaving that
undocumented would turn the checkpoint into a trap.

## 4. Part 3 — B5: a per-ingredient `preparation` field

**Schema.** Add `preparation: { type: "string" }` to `ENRICH_INGREDIENT_PROPS`, required. The full
property order becomes, exactly:

```
name → category → preparation → within_printed_weight → typical_serving_g
     → protein_per_100g → carb_per_100g → fat_per_100g
```

`preparation` sits with `name` and `category` because it is part of identifying *what the food is*,
and it must precede the composition fields because it is what anchors them — the same
commit-before-you-answer ordering that made `within_printed_weight` work. No existing key moves
relative to any other.

**Free text, not an enum.** An enum would be an English-centric list of cooking verbs, and this prompt
ships to menus in every language. Free text also makes the model's reading auditable.

**Prompt.** One clause added to step 1, naming no food, dish or cuisine — the existing guard test
still applies:

> For each ingredient give `preparation`: how it is cooked or prepared, taken from the item's own
> wording where the menu says so and inferred from the dish otherwise. Give the composition for that
> preparation.

**Nothing else changes.** Servings, the printed-weight scope tag, and per-100 g composition all stay
exactly as B4 shipped them, so `iter-b5-001` is a clean A/B against the re-scored checkpoint.

**Tests to add:**
- Schema: `preparation` is required, its index precedes `within_printed_weight`, and it precedes all
  three `*_per_100g` fields.
- The existing food-name guard on step 2 still passes against the new step-1 clause.
- `resolveGrams` and `sumIngredientMacros` are untouched — their existing tests must still pass
  unmodified, which is the proof that this change is composition-only.

## 5. How Part 3 is judged

**Primary:** failed field/draws against the **re-scored** checkpoint, over 4 runs × 3 draws. The bar is
whatever the checkpoint scores *after* Part 1 — not the old 0–1, and not the baseline's old 6. Both of
those numbers were computed against an oracle that no longer exists.

**Secondary:** the per-ingredient fat values for salmon and chicken, read from the archived raws.

**Also reported:** displacement per dish (portions must not move), the hand audit against the menu
photos, and cost from the archived `usage` blocks.

## 6. Predictions, stated before the run

| # | prediction | what it falsifies if wrong |
|---|---|---|
| 1 | Salmon fat rises from 13 toward 18.4 | a field is no better than wording; composition is simply fixed and this whole line of attack is closed |
| 2 | Chicken fat rises from 3.6 toward 5.5 | same as 1 |
| 3 | Dressing and cheese barely move — the menu states no method for them | if they move a lot, the field is a general richness nudge rather than a preparation fix: a weaker and less trustworthy claim |
| 4 | Carbs are unaffected — they are a portion problem | the change is not isolated; the run is confounded |
| 5 | Displacement is unchanged from B4 | the field is disturbing portions, which it has no business touching |
| 6 | Failed field/draws stay at or below the re-scored checkpoint's range | worse → do not adopt; fall back to `stage2-b4-checkpoint` |

**Prediction 1 is the one that matters.** If a required schema field cannot move composition when
wording twice failed, then composition is not reachable by prompt or schema at all, and the next move
is a different model or a different pipeline stage — not another iteration of this kind.

## 7. What this is NOT

- **Not a deployment.** Nothing in this phase has ever been deployed and this changes nothing about
  that. The live edge function still runs the original pre-B1 prompt.
- **Not a fix for the carb lean.** That is a portion problem (§1) and is explicitly out of scope.
- **Not a fix for the cheese-serving instability** — PASTEL's cheese dropping 50 g → 30 g in 2 of 12
  draws remains the known open defect.
- **Not an oracle overhaul.** Exactly one ingredient changes, on Santiago's explicit ruling. PASTEL's
  tortilla exclusion stays as he ruled on 2026-08-08; the other six disputed fats stay untouched.
- **Not menu-specific.** The prompt clause names no food, dish or cuisine, and the guard test enforces
  it. Every cuisine has words for grilled, fried, baked and roasted.

## 8. Approaches considered and rejected

**Reword step 2 again to demand richer values.** Rejected on measured evidence: B11 and B13 both did
exactly this and moved **zero** composition values. B13 even named the raw reference figure as wrong.
Prompt prose does not move a number the model has already decided.

**A code-side preparation multiplier** — scale fat up for ingredients tagged as fried or sauced.
Rejected: an unprincipled fudge factor tuned to three fixtures, which would not generalise and would
fit the oracle rather than reality.

**Make cooking fat its own ingredient line.** Plausible and still open, but the USDA evidence says the
measured gaps are entry-choice on already-composite foods (dressing, cream, cheese), not missing pan
oil. Worth revisiting only if prediction 1 holds and a residual gap remains.

## 9. Open, unresolved, not blocking

Six of the seven disputed fats were left as they are. Two of those — croutons at 10 vs 18.3 and heavy
cream at 30 vs 35.6, where **USDA has no heavy cream below 33.3** — are cases where the model is
measurably wrong and the preparation field is unlikely to help, since neither dish states a method for
them. If B5 lands and those remain, they are the next honest target.
