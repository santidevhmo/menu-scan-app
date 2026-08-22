# Widening the unweighted oracle: 9 dishes → 21, at $0 in model calls

**Status:** approved by Santiago 2026-08-22. Rulings in progress.
**Supersedes nothing.** The existing 9 dishes are unchanged by this work.

## Why

Eval 164 measured that the benchmark **cannot detect an improvement**. The scoring unit is
9 dishes, not 108 points — 4 macros within a dish share one mass error, and 3 draws are
repeated measures of the same thing. A dish-level paired bootstrap puts the noise band at
roughly **±17 points on the /108 scale**.

The consequence is asymmetric, and the asymmetry is why this work is worth doing:

| | |
|---|---|
| every arm this phase REJECTED | outside the noise band — those verdicts stand |
| every arm this phase called a WIN | inside it |

`NOBOOST`'s +5.5 has a 95% CI of −9.0 to +24.5, and **removing one dish (TACO PORCO)
reverses its sign.** Eval 165 then showed a continuous metric is 1.8× more sensitive on the
same dishes, which cut the required oracle from ~84 dishes to ~27 but did not make 9 enough.

Meanwhile the prize is bounded. `sim-mass-ceiling.ts`: if every dish's mass landed anywhere
inside its true range with composition unchanged, the score would be **80/108** against
today's 67. **The entire size lever is worth about +13 points, and our detection floor is
+10.** A mechanism capturing 60% of its ceiling — a real improvement — is currently
invisible. That is the gap this spec closes.

Second reason, from Santiago's statement of the product goal: the intended mechanism infers
portion from *"that item's average size (pizza, for ex)"* — a prior keyed on the **kind of
dish**. A per-form mechanism cannot be validated with one dish per form. Pizza at n=1 says
nothing about a pizza prior.

## The discovery that shapes the design

**12 of the shortlisted candidates are already inside every archive we have paid for** —
`dual` (2 runs), `NOBOOST` (2 runs), `ROLE`, `MASSCALL`, `NOPUSH`, all 7 archive sets.

Ruling those 12 dishes therefore **re-scores the entire phase's arm history on them for $0**.
No model calls. That is what makes stage 1 pure upside.

## Scope

| stage | dishes | cost | detection floor (log-ratio) |
|---|---|---|---|
| today | 9 | — | +10 |
| **stage 1 — this spec** | **21** | **12 rulings, $0 in calls** | **~+6.5** |
| stage 2 — decide later, with data | 27 | 6 rulings + ~$2.80 in re-runs | ~+6 |

Stage 2 is deliberately deferred. Those dishes are not in existing batches, so they require
re-running every arm; the decision to spend that is better made once stage 1 has shown what
a wider set actually does.

### Form coverage after stage 1

| form | now | after | why not more |
|---|---|---|---|
| salad | 1 | **4** | |
| pasta | 1 | **4** | |
| omelette | 1 | **3** | only 2 more exist |
| sushi roll | 1 | **3** | |
| taco | 1 | 2 | |
| tostada / ceviche | 0 | 1 | |
| pizza | 1 | 1 | **no described pizza candidates exist** |
| side | 1 | 1 | **menus do not describe sides** |
| dessert | 1 | 1 | **menus do not describe desserts** |
| fried protein | 1 | 1 | only `Alitas`, not archived |

Five forms gain real depth. The three that do not are blocked by Santiago's own standing
criterion that a candidate must be **described** — and menus systematically do not describe
sides, desserts or plain pizzas. That is a known blind spot, recorded here rather than
solved: undescribed items are a large share of every real menu and no oracle can currently
cover them. COLIFLOR ROKA was exactly that case, scored 0/12, and was replaced.

## The 12 dishes

| # | menu | dish | menu line |
|---|---|---|---|
| 1 | el-marcos | OMELETTE TOMASA | Dos huevos con cebolla, cebollín, cilantro, champiñones y queso. |
| 2 | el-marcos | OMELETTE LAMERA | Dos huevos con cebolla, champiñones, tocino y chile verde. |
| 3 | nikkori | Vegan Roll | Tofu, aguacate, pepino y zanahoria, cubierto de arroz. |
| 4 | nikkori | Nikkori Maki | Por dentro: Queso crema, aguacate, pepino y camarón. Por fuera: Surimi. |
| 5 | andaluz | DE CAMARÓN ROKA | Por dentro camarón capeado, pepino, aguacate y alga, y por fuera nuestro camarón roka con cebollín y ajonjolí. |
| 6 | bistro | FETUCCINI ALFREDO | Salsa Alfredo a base de queso parmesano |
| 7 | bistro | ALFREDO PORTOBELLO | Base de crema, laminas de portobello y pollo marinado. |
| 8 | bistro | PASTA ESPECIAL | Salsa de tomate de la casa, campiñones, chistorra y queso de cabra. |
| 9 | bistro | ENSALADA BALI | Espinaca, mandarina, arándanos, tomate cherry, coco rallado, cacahuate y vinagreta de la casa. |
| 10 | bistro | ENSALADA BISTRO | Tomate, campiñones, pimiento verde, cebolla morada, pera, manzana, calabaza, queso brie y chistorra. |
| 11 | bistro | ENSALADA DE LA SEMANA | Combinación de lechuga y espinaca, arándanos, tomate cherry, campiñón, calabaza, pera, manzana, almendras y queso de cabra. |
| 12 | brasero-two | TACO EL CAPRICHO | Taco de arrachera en base de lechuga fresca y costra de queso. |

**Ruling order: the two omelettes first.** OMELETTE CUBANA has scored exactly 3/12 in five
arms and every run ever measured. If TOMASA and LAMERA behave the same way, that is an
omelette-**form** failure rather than one stubborn dish, which is the single most informative
thing stage 1 can tell us and it comes at $0.

## The ruling format

Santiago's instruction, 2026-08-22: **every ingredient listed, each pre-filled with my
estimate and its share of the dish's calories, so he approves or modifies rather than
inventing numbers.**

```
OMELETTE TOMASA   el-marcos   $94
"Dos huevos con cebolla, cebollín, cilantro, champiñones y queso."

  ingredient          mine    % cal    source / reasoning
  eggs, fried         110 g    58%     FDC 2707158, 2 x 55 g ("dos huevos")
  cheese              20 g     22%     RACC standalone 30 g
  mushrooms           30 g      2%     —
  onion               20 g      2%     —
  butter / oil         5 g     14%     cooking fat, retained
  chives / cilantro     3 g     0%     —

  -> derived band   computed from the approved grams, not proposed alongside them
  -> mass band      likewise
```

The bands are **derived after approval**, never offered as something to approve. They follow
mechanically from the ruled grams under the existing rule (average dish ±20%, plus the 6 g /
50 kcal allowance), so presenting them as a choice would invite ruling the same thing twice.

The `% cal` column exists so the cheap decisions are visibly cheap: an ingredient at 1% of
calories cannot flip a macro, because the band already carries a 50 kcal allowance.

⚠️ **The pre-fill contains my judgement, not only published facts.** "FDC 2707158, 2 × 55 g"
is a published record; "20 g of cheese in this omelette" is my inference. The `source` column
must distinguish the two on every row so an approval is never mistaken for an external
citation.

⚠️ **Every gram in a composite dish is a judgement.** The existing OMELETTE CUBANA entry
carries that warning and these will too.

## Bias mitigation

The research review named the circularity plainly: ground truth built from the same photo the
model sees, by the same person, is a shared-method bias. It bites already — the FNDDS check
in eval 162 found the ruled OMELETTE CUBANA at 203 g sitting **above FNDDS's largest
published portion** for that composite (170 g).

Three mitigations, all cheap:

1. **Pre-fill from an external figure wherever one exists** (FNDDS composite portions, RACC),
   so the starting point is not authored by the person reading the photo.
2. **Anchor a subset to FNDDS explicitly** and record the comparison, so systematic drift
   between this oracle and published portions stays detectable rather than invisible.
3. **Ground truth stays a RANGE, never a point** — which the band rule already does.

Not mitigated: there is one adjudicator. Multiple independent raters with inter-rater
agreement is the field's answer and is out of scope here.

## The metric

| | |
|---|---|
| **band score** | stays the headline. It is the product-quality number and what the user experiences. |
| **log-ratio error** | decides whether an arm worked. Mean \|ln(model / band midpoint)\| over the 4 macros. |

Both already implemented and validated in `scripts/sim-arm-significance.ts`. Nothing in this
spec changes the harness.

## Verification — how we know the widening worked

All three checks are $0.

1. **The existing 9 dishes score identically before and after.** If they move, the harness
   changed and not just the oracle. This is the guard against the class of bug this project
   has hit twice: a hardcoded list that did not grow with the oracle.
2. **The noise band is re-measured, not assumed.** `sim-arm-significance.ts` on 21 dishes must
   report a narrower CI than on 9. The projection says ~+6.5; the measurement rules.
3. **Every past arm is re-judged on 21 dishes.** If `NOBOOST`'s "the whole effect is one dish"
   result survives, we trust it. If it flips, we learn the 9-dish set was misleading us — and
   that is itself a finding worth the 12 rulings.

## Risks

- **New bands may be systematically wider or narrower than the old ones**, because the old 9
  were ruled without the `% cal` column in front of the adjudicator. Checked before scoring:
  compare band width as a fraction of midpoint, old 9 vs new 12.
- **Salads and pasta will be 8 of 21 dishes.** Better than 1 each, but the set leans toward
  composed plates. Per-form reporting keeps that visible rather than hidden in an average.
- **21 dishes still does not clear the detection floor for a +13 effect** — 0.89 where 1.0 is
  the threshold. Stage 1 improves our position; it does not finish the job.
- **Ten of the 12 come from three menus** (bistro 6, el-marcos 2, nikkori 2). Menu-level
  correlation is not something the dish-level bootstrap models. Worth revisiting if stage 2
  happens: prefer candidates from menus not already represented.

## Out of scope

- The retrieved-portion-anchor arm. Designed but unbuilt, and deliberately sequenced after
  this work so its result is believable.
- Stage 2 (dishes 22–27).
- External datasets. **MenuStat was verified and eliminated on 2026-08-22: it carries item
  names only, no ingredient description.** Every arm in this phase acts on the per-ingredient
  breakdown, which comes from the description, so a name-only corpus would measure a
  different task. Nutrition5k remains a possible future instrument for the mechanism alone.
- Undescribed menu items. Named as a blind spot above; not addressed.
