# B4 — Portioning by conventional serving, scaled in code

**Status:** approved by Santiago 2026-08-08. Not yet implemented, not yet run.
**Phase:** Stage-2 macro-enrichment accuracy benchmark (critical path #5).
**Branch:** `worktree-stage2-macro-benchmark`.
**Cost:** ~$0.04 for one 3-draw run. Needs Santiago's explicit approval before spending.

---

## 1. Why this, and why now

Two $0 measurements taken on 2026-08-08, both from archived responses, both reproducible for free.

**The ablation.** Take iter-b13-001's three archived responses. Keep the model's own per-100 g
composition. Swap in the oracle's gram weights. Re-score.

| what the model supplies | failed field/draws (of 36) |
|---|---:|
| everything — the real iter-b13-001 run | 6 |
| its own composition, **the oracle's grams** | **0** |
| its own grams, the oracle's composition | 3 |

**With correct portions the model's own nutrition knowledge scores a perfect 36/36.** Portioning is
not the largest remaining problem; it is the only one.

**The portion scorer** (`scripts/score-portions.ts`, commit `55f924d`). Its headline metric is
**displacement** — the share of a dish's mass sitting on the wrong ingredient:

```
displacement = Σ |model_gramsᵢ − oracle_gramsᵢ| ÷ Σ oracle_gramsᵢ
```

Chosen over a mean of per-ingredient percentage errors, which would let a 1.7 g garlic outvote a
140 g salmon fillet. Run across every archived run that carries grams:

| run | CESAR | Salmone | PASTEL | mean |
|---|---|---|---|---:|
| iter-b1-001 | **20.0 / 20.0 / 20.0** | 16.3 ×3 | 24.4 ×3 | 20.2% |
| iter-b10-001 | **20.0 / 20.0 / 20.0** | 21.8 / 16.3 / 17.7 | 24.4 ×3 | 21.0% |
| iter-b11-001 | **20.0 / 20.0 / 20.0** | 16.3 ×3 | 24.4 ×3 | 20.2% |
| iter-b12-001 | **20.0 / 20.0 / 20.0** | 21.8 / 34.0 / 34.0 | 29.4 / 24.4 / 24.4 | 25.3% |
| iter-b13-001 | **20.0 / 20.0 / 20.0** | 24.5 ×3 | 24.4 ×3 | 23.0% |

**CESAR's displacement is 20.0% in all fifteen draws of all five runs.** Five paid iterations changed
composition and not one moved a single gram. Roughly one gram in five has been on the wrong
ingredient since the first run.

A metric that returns the same value fifteen times running has essentially no noise floor, which is
why it becomes B4's primary gate. It removes the ambiguity that made iter-b13-001 hard to read.

## 2. The mechanism

The model must currently pick five numbers that sum to 200. Every gram it has ever emitted is a
multiple of 5 and the sum lands exactly on the printed weight. It is solving a **constrained
arithmetic problem** and solving it by rounding.

B4 removes the constraint. Per ingredient the model states a **conventional serving** — what a
portion of that ingredient in that role normally is — and code fits the set to the printed weight.

**But it must not fit all of them.** All three fixtures print a weight, and on two of them that
weight covers only part of what is eaten: Salmone prints `200g` for the plate while its baguette is
an accompaniment sitting outside it, and the oracle's total is 245 g. Scaling every ingredient to
200 g would pull the baguette inside and *destroy* a judgment the model currently gets right — it
produced plate 195 g + baguette 50 g in every draw of iter-b13-001.

So the model also tags each ingredient with `within_printed_weight`, and code scales only those:

```
scale     = printed_total_g ÷ Σ typical_serving_g   over ingredients inside the printed weight
grams[i]  = typical_serving_g[i] × scale            if within_printed_weight
          = typical_serving_g[i]                    otherwise — accompaniments pass through
```

When `printed_total_g` is null, or when the inside-sum is 0, nothing is scaled and the model's own
servings stand.

This tag earns its place twice over. It is required for the scaling to be correct at all, and it
makes the inside-or-outside judgment **visible and gradeable for the first time** — today it is
invisible, inferable only by adding up grams after the fact. It is also exactly where PASTEL's whole
portion error lives: the model puts the beans *inside* the printed 300 g while the oracle puts them
outside at 380 g, and until now that disagreement has never been recorded as data.

This is the same move as the only two changes that have ever worked in this phase: B10 took the
addition away, B12 took the multiplication away. B4 takes the fitting away. The model supplies food
knowledge; the arithmetic is ours.

## 3. Implementation

Mostly `supabase/functions/analyze-menu/enrich.ts` and its test, plus one change to
`scripts/score-portions.ts` so the primary gate stays computable.

**Schema.** In `ENRICH_INGREDIENT_PROPS`, replace `grams` with two fields, both **required** (strict
mode only emits required fields) and both in `grams`' old position, since strict-mode output is
emitted in schema order and that order is load-bearing chain-of-thought:

- `within_printed_weight: boolean` — first, so the model decides what the printed weight covers
  before it sizes anything.
- `typical_serving_g: number` — the conventional serving.

**Type.** `EnrichedItem["ingredients"][n].grams` becomes `typical_serving_g` plus
`within_printed_weight`, and the item gains `printed_total_g`. The client's `EnrichedIngredient` in
`src/types/scan.ts` is only `{name, category}`, so there is no client blast radius.

**Where the printed total comes from.** `sumIngredientMacros` needs the dish's printed weight and has
no way to know it — production never parses one, the model reads it off the menu text itself. Two
options were considered:

- **Parse it in code with a regex.** Rejected. The three fixtures alone print `200 g`, `200g` and
  `300gr.`, and this prompt ships worldwide; a regex here is a generality risk of exactly the kind
  already ruled against.
- **Ask the model for it.** Chosen. Add an **item-level** `printed_total_g: number | null` — the
  weight printed on the menu, or null when none is printed. Reading text is the model's job; scaling
  is ours. It is also a useful auditable intermediate: it makes the model's reading of the printed
  weight visible for the first time, separately from its portioning.

Place `printed_total_g` **before** `ingredients` in the item schema, so the model commits to the
dish's total before it portions anything. Required, with `["number", "null"]` — strict mode omits
non-required fields, and null is how "no printed weight" is expressed.

**Summation.** `sumIngredientMacros` takes the printed total as an optional second argument,
defaulting to null. With a total, it scales the ingredients tagged `within_printed_weight` and passes
the rest through; without one, everything passes through and the model's own totals stand. The
zero-guard matters: if the inside-sum is 0 the scale factor is undefined, so fall through to unscaled
rather than divide by zero — the retry path backfills empty ingredient lists and must not produce
`NaN`.

**The portion scorer needs updating too.** `scripts/score-portions.ts` currently reads `grams`
straight off the archived response. After B4 the response carries `typical_serving_g`, and the
displacement metric must be computed from the **scaled** grams — the numbers the code actually
produces — not the raw servings. Without this the primary gate cannot be computed at all. Teach it to
apply the same scaling when it sees `typical_serving_g`, and to keep reading `grams` on older archived
runs so the five historical rows stay reproducible.

**Prompt.** One replacement sentence in step 1. It names no food, dish or cuisine; the guard test in
`enrich_test.ts` still applies:

> Give `printed_total_g`: the weight printed on the menu for this item, or null if none is printed.
> For each ingredient give `typical_serving_g` — what a normal restaurant serving of that ingredient
> is when it appears in this role, whether as the centrepiece, as a sauce or dressing, or as a
> garnish. Give the conventional serving for the ingredient itself; these are rescaled to the item's
> printed weight afterwards, so they do not need to add up to anything. Set `within_printed_weight`
> to false for anything the menu presents as served alongside the item rather than as part of it,
> since a printed weight normally describes the item itself and not what accompanies it.

**Nothing else moves.** Per-100 g composition stays exactly as B12 shipped it, so the run reads as a
clean A/B against iter-b13-001.

**Tests to add:**
- Scaling: servings summing to 250 with a printed total of 200 come back scaled by 0.8, and the
  scaled grams sum to 200 exactly.
- **Accompaniments are excluded from the scaling and pass through at their stated serving** — the
  Salmone case. Only the inside-sum is scaled to the printed total, so the item's overall weight
  exceeds the printed weight by exactly the accompaniment. Without this the baguette is pulled inside
  and the dish's total collapses from 245 g to 200 g.
- No printed weight (`null`): everything passes through unscaled.
- Zero inside-sum: no `NaN`, no divide-by-zero — falls through to the existing all-zeros result.
- Schema: `printed_total_g` is required, typed `["number", "null"]`, and ordered before `ingredients`;
  `within_printed_weight` precedes `typical_serving_g`.
- Negative schema assertion — `grams` is no longer askable at ingredient level, matching the existing
  B12 assertion for `protein_g`/`carb_g`/`fat_g`.
- The existing food-name guard on step 2 still passes against the new step-1 sentence.
- Scorer: displacement computed from scaled grams on a `typical_serving_g` response equals the
  displacement of the equivalent `grams` response — so the five historical rows stay comparable.

## 4. How the run is judged

**Primary gate: displacement on CESAR**, which has been 20.0% fifteen times running. Any movement is
signal.

**Secondary: the 36 field/draw tally** under the PASTEL beans tolerance, expected at 6 or better.

**Also reported:** the per-ingredient gram table, the hand audit against the menu photos for invented
or unprinted items, and the token cost from the archived `usage` blocks.

**PASTEL is reported but not optimised against.** Its oracle excludes tortilla — the dish's structural
ingredient, which this menu does not print — so holding the printed 300 g fixed inflates every
remaining ingredient, cheese to 20.5% of plate weight. Santiago ruled on 2026-08-08 to leave it as-is
rather than have the model infer unprinted ingredients (see §6). Its per-ingredient grams are
therefore not a trustworthy portion target. Salmone's sub-60 g split (cream 20.4 g, garlic 1.7 g …)
comes from scaling a recipe to fill a gap, so it is likewise indicative only. **CESAR is the only
fully trustworthy allocation case.**

## 5. Predictions, stated before the run

| # | prediction | what it falsifies if wrong |
|---|---|---|
| 1 | **CESAR displacement leaves 20.0%** | the mechanism is inert — same verdict as B11 and B13 |
| 2 | Dressing rises from 20 g toward the oracle's 30 g | "conventional serving" is not knowledge the model has |
| 3 | Composition is untouched — corn stays 19, parmesan 35.8 / 3.2 / 25.8 | the change is not isolated; the run is confounded |
| 4 | CESAR's total stays exactly 200 g, and `printed_total_g` reads **200 / 200 / 300** — all three fixtures print a weight, so none should be null | the code scaling is broken, or the model misreads printed weights — distinguishable for the first time |
| 5 | Salmone keeps its baguette outside: total stays ≈245 g, not 200 g | the `within_printed_weight` tag is not being honoured, and B4 has broken a judgment the model already had right |
| 6 | PASTEL displacement barely moves, and it tags the beans `within_printed_weight: true` — matching what it does today, and disagreeing with the oracle | if it flips them to false, PASTEL's total jumps toward the oracle's 380 g and its long-standing 24.4% displacement should fall sharply |

**Prediction 1 is the falsifier that matters.** If displacement is still 20.0%, portioning is a fixed
prior that prompting cannot reach, and the next move is structural rather than another prompt or
schema edit — the rejected approach C below, or a portion stage with its own input.

## 6. What this is NOT

- **Not a production deployment.** Nothing in this phase has beaten the baseline's 6 failed
  field/draws, and nothing is deployed. B4 does not change that by default.
- **Not an oracle or fixture change.** Those are Santiago's alone. The tortilla question was raised
  on 2026-08-08 and he ruled: leave PASTEL as-is, do not have the model infer unprinted ingredients.
  His reasoning — inferring risks fixing some dishes while breaking others. Two further reasons to
  keep it out of scope: the ablation shows nothing is left to win on this benchmark, since correct
  portions already score 36/36; and our three fixtures contain no dish where inference would be
  *wrong*, so testing it here would produce a falsely reassuring result. Filed as its own backlog
  item requiring its own fixtures.
- **Not a second model call.** See §7.
- **Not menu-specific.** The prompt sentence names no food, dish or cuisine, and the scaling rule is
  arithmetic. Both apply to any menu on earth.

## 7. Approaches considered and rejected

**B — shares normalised in code.** Ask each ingredient's percent-of-dish; multiply by the total.
Removes the summing constraint like A does, but still asks for a *relative* judgment, and there is no
evidence the model is better at relative shares than at grams. A asks for something the model
plausibly knows outright — a conventional serving is a fact about food.

**C — a second dedicated call** (the original backlog framing of B4). Doubles cost and latency and
does not address the round-number mechanism: the second call would make the same judgment with more
room. Held in reserve as the structural fallback if prediction 1 fails.

**D — household measures plus a density table.** Ask for cups or tablespoons and convert in code.
A real portioning technique, but it needs a density lookup, and a runtime lookup is dispreferred
(ruling, 2026-08-08). Not now.

## 8. Open question, unresolved, flagged not blocking

On all six fats measured, the oracle picks the richer as-prepared FDC entry and the model picks a
leaner real one — both defensible foods. If the oracle is meant to represent a *typical* restaurant
plate rather than the richest available entry, part of what is scored as model error is an oracle
choice. Raised in the iter-b13-001 notes, Finding 5. Santiago's call; no change proposed. B4 does not
depend on the answer, because the ablation shows correct portions pass every field under the oracle
exactly as it stands today.
