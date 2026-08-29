# Design — the plate-total fix, measured as two arms

**Date:** 2026-08-11 · **Status:** approved in brainstorm, not implemented
**Depends on:** the size-channel blocker and the plate-knowledge probe, both in
`docs/superpowers/stage2-macro-benchmark.md` (2026-08-11).

---

## 1. The problem, in one paragraph

Nothing in the pipeline estimates the plate. The model is asked for ingredients and a typical
serving of each; the dish mass is whatever those happen to sum to, which is why unweighted items
average ~231 g regardless of dish and why **no stated size moves the answer** — 28→40 cm shifts
calories 1.06–1.36× where area implies 2.04×, while a printed-grams control shifts 2.14–2.37×.
Asked plainly, outside the enrichment prompt, the same model says a 28 cm Capricciosa is **750 g**
against the pipeline's **250 g**. The knowledge exists; nobody asks for it.

`resolveGrams(ingredients, printedTotalG)` computes `scale = printedTotalG / inside` and does not
care where the total came from. **That is the whole fix on the code side** — the open question is
only where the total comes from, and that is what this experiment settles.

## 2. What this is NOT

- **Not** a deployment. Both arms are probe scripts; `enrich.ts` and the deployed function are
  untouched until data says which arm wins, and that ships under its own spec.
- **Not** a food list, a dish name, or a size→mass table. Neither arm names a food anywhere.
- **Not** a change to items that print a weight. Preserving those is a measured guard, not a hope.
- **Not** a claim about absolute accuracy. There is still no unweighted-dish oracle. Every metric
  here is either a *relative* response or a *guard against regression*.

## 3. The arms

**Baseline** — deployed v30, unchanged. Already measured: 28→40 cm 1.06–1.36×; weighted 0–3/96 at
12.0–12.5%; Capricciosa 250 g / 517 kcal.

**Arm A — split batch.** Items are partitioned by whether `grams` is set.

| batch | prompt | schema |
|---|---|---|
| items that print a weight | today's `ENRICH_PROMPT`, **byte-identical** | today's |
| items that do not | today's plus one sentence | plus required `typical_total_g` |

The added sentence, in full, and containing no food, dish or cuisine name:

> Give "typical_total_g": the total edible weight in grams of one order of this item as it is served.

Code: `resolveGrams(ings, printed ?? plausibleTotal(typical_total_g))`, where `plausibleTotal`
returns the value when it is a finite number in **20–2000 g** and `null` otherwise.

**Arm C — parallel plate call.** `ENRICH_PROMPT` is not changed by one character.

1. Enrichment runs exactly as today.
2. A second call, in parallel, receives the items with no printed weight and returns one
   `total_grams` per item.
3. Code rescales those items through the same `resolveGrams` and the same 20–2000 g clamp.

The second call is **batched**, not one item per call. This is production-realistic and it is a
named risk: the 750 g evidence came from single-item calls, and batching may dilute it. If batched C
underperforms, single-item C is the follow-up, and the difference between them is itself a finding.

## 4. What is measured

No oracle is required for any of it. Three draws each; report RANGES, never a single run.

| metric | instrument | baseline | pass |
|---|---|---|---|
| does a stated size register | `probe-size-sensitivity.ts`, 28→40 cm | 1.06–1.36× | **≥1.5×** |
| printed grams still register | same probe's control | 2.14–2.37× | unchanged |
| the 96-point weighted score | `macro-measure.ts`, 8 fixtures | 0–3/96 at 12.0–12.5% | **must not worsen** |
| the reported dish | Capricciosa through each arm | 250 g / 517 kcal | near 500–700 g |

The weighted-score row is the one that decides safety. Arm A **can** regress it — that is precisely
what killed the parked `typical_total_g` anchor. Arm C **cannot**, by construction; if the
measurement disagrees, the understanding of the code is wrong and that is worth learning too.

## 5. What each outcome licenses

| result | what it means |
|---|---|
| both fix size, neither breaks the 96 | ship the simpler one — A, since it is one call |
| C works, A regresses the 96 | the parked anchor's failure repeating; C is the answer |
| A works, C does not | batching diluted the plate question; retry C single-item |
| neither moves size | the knowledge does not survive contact with the pipeline. Grams must come from code or from a human. A genuinely important dead end. |

The design is written to accept the last row. It is the outcome that would most change the roadmap.

## 6. Cost

**~$0.75** for both arms — roughly 66 calls across the size probe (10 variants × 3 draws × 2 arms)
and the fixture runs (8 dishes × 3 draws × 2 arms). Approved 2026-08-11. Archive every raw response,
including passing ones.

## 7. Why these two and not a third

A single-prompt required field — one prompt for every item, the field used only when unweighted —
is deliberately excluded. It is the closest relative of the parked anchor, which regressed items
that were already correct, and this project's record is **wording 0-for-4, mechanism 5-for-7**. Both
arms here are mechanism changes; neither asks the model to try harder.

## 8. Out of scope

- Deploying the winner. Its own spec, after the data.
- The unweighted-dish oracle (`2026-08-11-unweighted-dish-oracle-design.md`), which remains
  half-built and blocked on per-recipe rulings. This experiment deliberately needs none of it.
- The `cm → grams` conversion, which needs a dish-specific density and stays unsolved.
- The divisor-versus-multiplier distinction in the UI portion control. The plate total absorbs
  quantity-type counts on the mass path — "an order of 12 chicken wings" returned 360–480 g
  unprompted — so this experiment does not touch it.
