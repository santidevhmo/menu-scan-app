# Oracle widening, round 2 — 21 → 65 dishes

**Date:** 2026-08-22 · **Status:** APPROVED by Santiago, not yet executed · **API cost: $0**

Round 1 (evals 166–167) took the unweighted answer key from 9 dishes to 21. This is round 2:
21 → 65, using dishes whose model answers are **already bought** and sitting in the cache files.

Nothing is deployed. No prompt, schema or model pin is touched. Production stays edge fn
`analyze-menu` v32.

---

## 1. The decision this answers

Ship `NOBOOST` or not.

`NOBOOST` is the shipped `dual` pipeline with **one clause deleted** — the push half of pass 2's
addendum, the half that tells the model a body component is served in *"considerably greater
quantity"* than a standalone serving. Deleting it makes every gram answer smaller.

It currently scores **+14.5 / 252** over the shipped pipeline and the benchmark **cannot tell
whether that is real**. This widening is the only free way to find out.

---

## 2. What exists today — two answer keys, not one

This was a genuine point of confusion and is recorded so it is not re-litigated.

| file | what it holds | dishes |
|---|---|---|
| `scripts/fixtures/caches/*.raw.json` | **the model's answers.** What GPT guessed. Free to re-grade. | **68** |
| `scripts/fixtures/unweighted-oracle.json` | **the right answers**, hand-ruled against USDA. The unweighted /252 score. | **21** |
| `scripts/fixtures/macro-oracle.json` | the right answers for dishes whose menu **prints a weight**. The separate /96 score. | **8** |
| `scripts/fixtures/*.expected.json` | **Stage 1 only** — did we read the right item names off the photo. No macros. | n/a |

**29 dishes in the whole project have hand-checked macros.** The 47 extra dishes in the caches have
the model's guesses and no marking scheme, which is exactly what round 2 supplies.

The oracle stores **per-dish bands only** — `mass_band_g`, a `band` for each of the 4 macros, and a
prose `assumed` field carrying the reasoning and the FDC citations. There is no per-ingredient array
in the oracle; per-ingredient decomposition lives in the rulings doc.

---

## 3. The three findings that motivate this (all $0, all re-derived 2026-08-22)

### 3.1 More model calls cannot resolve NOBOOST. Only more dishes can.

`sim-arm-significance.ts` bootstraps **dishes**, so its CI width is driven by dish-to-dish
disagreement, not by how many times each dish is asked. Measured by running it on each run alone and
on the pair:

| draws per dish | 95% CI on the /252 scale | half-width |
|---|---|---|
| 3 (`dual` vs `NOBOOST`) | −13.0 to +34.0 | 23.5 |
| 3 (`dual@r2` vs `NOBOOST@r2`) | −3.0 to +47.0 | 25.0 |
| **6 (both runs pooled)** | **−5.5 to +38.0** | **21.75** |

Doubling the draws shrank the half-width by **10%**. A pure-noise model predicts **29%**. Fitting the
split gives ≈39% draw noise, ≈61% real between-dish heterogeneity, so:

- a 3rd paid run → half-width ≈ 20.9
- **infinitely many runs → half-width ≈ 18.9, still larger than the +14.5 effect**

**Buying repeat runs at 21 dishes buys nothing.** This retires the "or a paid run at the current 21"
half of eval 167's next action. ⚠️ Two data points, so the 39/61 split is approximate — but the
all-noise case is directly falsified by the observed 10%.

### 3.2 The dishes are already paid for

The unweighted harness sends each oracle dish's **whole batch of 10 menu items** (`select()` in
`bench-unweighted.ts`), so the archives hold the neighbours too.

- **68 items appear in all 12 `dual`/`dual@r2`/`NOBOOST`/`NOBOOST@r2` archives.** 21 ruled, 47 not.
- All eight current-generation arms — `dual`, `NOBOOST`, `NOPUSH`, `ROLE`, `MASSCALL`, `ORDER`,
  `ORDER-nopush`, `PIECE` — cover **exactly the same 68**, so the whole arm history re-scores for $0.
- `baseline-f` and `A-f` cover 86; the older 3-menu arms (`P`, `S3`, `A`, `PD`, `PF`) cover 3 menus
  only and already miss 6 of the 21. That gap is pre-existing and unchanged by this work.

### 3.3 🔑 NOBOOST is a small-plate mechanism, and that is why it wins today

Sorting the 21 dishes by ruled plate mass against NOBOOST's per-dish advantage:

| slice | plates <250 g | plates ≥250 g |
|---|---|---|
| all 21 dishes | n=9, **+0.74**/dish | n=12, **−0.15**/dish |
| drop both tacos | n=7, **+0.29** | n=12, **−0.15** |
| drop CAPRICCIOSA | n=9, **+0.74** | n=11, **−0.08** |
| drop the 4 most influential dishes | n=7, **+0.29** | n=10, **0.00** |

Pearson r between plate size and NOBOOST's advantage is **−0.67** over 21 dishes, falling to −0.25
under the harshest trim. So *"size predicts the gain"* is **suggestive, not established** — but
**"big plates never gain" survives every trim.**

Worked through one dish of each kind:

| | TACO PORCO | CAPRICCIOSA (28 cm pizza) |
|---|---|---|
| ruled mass | ~120 g | ~425 g |
| the shipped pipeline | oversizes it | already undersizes it |
| NOBOOST shrinks every answer, so | too much → in band ✅ | too little → further out ❌ |
| per-draw points | **+2.67 of 4** | **−1.00 of 4** |

This is **the phase's own screening test firing** (earned across evals 160–163): a one-directional
mechanism helps the dishes on one side of the size error and hurts the other, because eval 162
measured size error
running 0.65–1.30 in **both** directions. NOBOOST scores +14.5 only because the current 21 lean
small — both tacos sit at ~120 g, where the gain is largest.

---

## 4. The dish list — 44 new dishes, fixed before any scoring

| | count |
|---|---|
| free dishes in the caches | 47 |
| − `bistro / Pollo.` and `bistro / Camarón` | −2 |
| − `andaluz / COLIFLOR ROKA` | −1 |
| **new dishes to rule** | **44** |
| existing | 21 |
| **final answer key** | **65 dishes = 780 points** *(52 if every name-only dish is retired — see below)* |

**Why the three exclusions.** `Pollo.` and `Camarón` carry `category: "other"`, no price and no
description; `bistro.expected.json` lists them under `tolerated_option_names` and the menu's section
header is *"Agrega a tu pasta o ensalada"* — they are add-ons, not dishes. `COLIFLOR ROKA` was
retired as unanswerable at eval 156 and nothing since has changed that.

**Effect on the instrument:** smallest detectable difference falls from **±8.6% of the scale to
±4.9%** (±5.5% in the worst case). NOBOOST's effect is 5.75% of the scale, so a verdict becomes
possible either way.

| # | menu | dish | pile | menu text |
|---|---|---|---|---|
| 1 | `bistro` | **4 STAGIONI** | pizza-group | Pepperoni, jamón, tocino y chistorra. |
| 2 | `bistro` | **5 FORMAGGI** | pizza-group | Queso mozzarella, chihuahua, azul, feta y cabra. |
| 3 | `bistro` | **CAPRESE** | pizza-group | Espinacas, jamón serrano y tomate deshidratado. |
| 4 | `bistro` | **HAWAIANA** | pizza-group | Jamón y piña. |
| 5 | `bistro` | **ITALIANA** | pizza-group | Pepperoni, cebolla morada, pimiento verde, aceituna negra y campiñones. |
| 6 | `bistro` | **JAMÓN CON CHAMPIÑONES** | pizza-group | — *(name only)* |
| 7 | `bistro` | **MARGARITA** | pizza-group | Rebanadas de tomate fresco y albahaca deshidratada. |
| 8 | `bistro` | **MEXICANA** | pizza-group | Cebolla morada, pimiento verde y chistorra. |
| 9 | `bistro` | **PEPPERONI** | pizza-group | — *(name only)* |
| 10 | `bistro` | **VEGETARIANA** | pizza-group | Espinaca, calabaza, campiñón, cebolla morada, pimiento verde y aceituna negra. |
| 11 | `bistro` | **FLAMENKUCHEN** | pizza-exception | Base de crema, tocino y cebolla caramelizada. |
| 12 | `bistro` | **OSTRICA** | pizza-exception | Ostión ahumado, tocino y mostaza dijón. |
| 13 | `bistro` | **QUESO AZUL** | pizza-exception | Base de crema, queso azul, espinaca, jamón serrano y laminas de manzana verde. |
| 14 | `nikkori` | **Avocado** | roll-group | Por dentro: Camarón, queso crema y pepino. Por fuera: Aguacate. |
| 15 | `nikkori` | **Duplex** | roll-group | Por dentro: Tampico, aguacate, queso crema y pepino. Por fuera: Camarón y salmón. |
| 16 | `nikkori` | **Fildeflex** | roll-group | Por dentro: Salmón, queso crema y pepino. Por fuera: Ajonjoli. |
| 17 | `nikkori` | **Ipanema Roll** | roll-group | Por dentro: Atún spicy. Por fuera: Camarón y aguacate, bañado en salsa anguila. |
| 18 | `nikkori` | **Salmón Samba** | roll-group | Por dentro: Atún spicy y aguacate. Por fuera: Salmón bañado con salsa spicy ponzu. |
| 19 | `nikkori` | **Spicy Tuna Roll** | roll-group | Por dentro: Tampico. Por fuera: Atún picado con salsa spicy y masago. |
| 20 | `nikkori` | **Tuna Especial** | roll-group | Por dentro: Queso crema y aguacate. Por fuera: Atún con topping de masago y mayonesa. |
| 21 | `andaluz` | **CHAMPIÑONES AL AJILLO** | one-off | — *(name only)* |
| 22 | `andaluz` | **CROQUETAS DE ABUELA (8 pints.)** | one-off | Empanizadas y rellenas de jamón serrano, pollo y queso, en crema bechamel. |
| 23 | `andaluz` | **MEDITERRÁNEA** | one-off | Lechuga, pepino, elate, queso panela, aceitunas, tomate cherry, aguacate, champis, espárragos, almendras, aderezada con aceite oliva y balsámico. |
| 24 | `andaluz` | **PAPAS BRAVAS** | one-off | — *(name only)* |
| 25 | `andaluz` | **PARRILLADA VERDURAS** | one-off | — *(name only)* |
| 26 | `andaluz` | **QUESABONELESS** | one-off | Dos tortillas de harina, manchego, boneless con salsa al gusto |
| 27 | `bistro` | **FRADIAVIOLA** | one-off | Crema de tomate con un toque de chile de árbol, espinacas y queso feta. |
| 28 | `bistro` | **LINGUINNI PARISIENNE** | one-off | Pimientos, campiñones, jamón en salsa cremosa a base de quesos. |
| 29 | `brasero-two` | **CEBOLLAS CAMBRAY** | one-off | — *(name only)* |
| 30 | `brasero-two` | **CHILE RELLENO** | one-off | — *(name only)* |
| 31 | `brasero-two` | **ORDEN DE TORTILLAS** | one-off | — *(name only)* |
| 32 | `brasero-two` | **PAPAS CAMBRAY** | one-off | — *(name only)* |
| 33 | `brasero-two` | **ROLLOS DE CREPA** | one-off | Crepa crujiente y azucarada acompañada de dulce de leche, chocolate y helado de vainilla. |
| 34 | `brasero-two` | **TACO BRASERO** | one-off | Taco de carne asada de diezmillo en tortilla de su elección. |
| 35 | `brasero-two` | **TACO TRADICIONAL** | one-off | Taco de arrachera en tortilla de su elección. |
| 36 | `brasero-two` | **TOSTA ATUM** | one-off | Tostada de atún sellado con rub de chiles, portobello y elote asado, pepino, jicama, salseado con ponzu y ajonjolí. |
| 37 | `brasero-two` | **TOSTA BRASIL (picaña)** | one-off | Tostada de picaña en una cama de feijoada y mix de pimiento encima. |
| 38 | `el-marcos` | **BISQUETS C/ FRUTOS ROJOS** | one-off | (Orden de dos) |
| 39 | `el-marcos` | **BISQUETS DEL CENTRO** | one-off | (Orden de dos) |
| 40 | `el-marcos` | **Cazuela de Marlín** | one-off | — *(name only)* |
| 41 | `el-marcos` | **DE INDIO** | one-off | Dos huevos fritos montados sobre un huarache de maíz con frijoles refritos y bañados con salsa verde, crema, cebolla y cilantro. |
| 42 | `el-marcos` | **Doblada de Camarón y Marlín** | one-off | — *(name only)* |
| 43 | `el-marcos` | **Machaca de Marlín c/huevo o verdura** | one-off | — *(name only)* |
| 44 | `el-marcos` | **Omelette de Camarón y Marlín** | one-off | — *(name only)* |

### ⚠️ 13 of the 44 are name-only, and the precedent is against them

**All 21 currently-ruled dishes carry a menu description. Not one is name-only** — verified against
the archives, not assumed. The only name-only dish ever considered, `COLIFLOR ROKA`, was **retired at
eval 156** with this reasoning: the real dish is battered cauliflower on lettuce under chipotle mayo,
*"none of that is knowable from the text the pipeline receives"*, and Santiago's ruling was that an
item this thin **"shouldn't even be considered"** — it is *unanswerable rather than badly answered*.

The 13 name-only dishes here are therefore **provisional**, each subject to a per-dish answerability
test against that precedent before it enters the oracle:

> Does the **name alone** pin both what is on the plate and how much of it? `CHILE RELLENO` and
> `ORDEN DE TORTILLAS` plausibly do — the name *is* the recipe. `PAPAS BRAVAS`, `CAZUELA DE MARLÍN`
> and `PARRILLADA VERDURAS` plausibly do not.

The 13: `JAMÓN CON CHAMPIÑONES`, `PEPPERONI`, `CHAMPIÑONES AL AJILLO`, `PAPAS BRAVAS`,
`PARRILLADA VERDURAS`, `CEBOLLAS CAMBRAY`, `CHILE RELLENO`, `ORDEN DE TORTILLAS`, `PAPAS CAMBRAY`,
`Cazuela de Marlín`, `Doblada de Camarón y Marlín`, `Machaca de Marlín c/huevo o verdura`,
`Omelette de Camarón y Marlín`. *(The two `BISQUETS` are counted as described — "(Orden de dos)"
pins the count, and a bisquet is definitional.)*

**Both outcomes still resolve the question**, which is why this does not block the work:

| if the name-only dishes… | oracle | smallest detectable effect | vs NOBOOST's 5.75% |
|---|---|---|---|
| all survive | 65 dishes | ±4.9% | resolves comfortably |
| all are retired | 52 dishes | ±5.5% | resolves, but barely |

⚠️ Two of the 13 (`JAMÓN CON CHAMPIÑONES`, `PEPPERONI`) are pizzas, where the **class ruling supplies
the portion** — 28 cm is on the section header, not the item line — so the answerability test is much
easier to pass for those two than for a bare side dish.

**A retirement is not an early stop.** It removes a dish that cannot be ruled, never one whose score
we dislike; each retirement is recorded with its reason at the moment it is made, before that dish is
scored.

---

## 5. How the ruling is done

| pile | count | method | Santiago's review |
|---|---|---|---|
| pizza-group | 10 | one class ruling, applied per topping type | one 10-row table |
| pizza-exception | 3 | individually — cream base (×2), smoked oyster | 3 individual rulings |
| roll-group | 7 | one class ruling, filling swapped per roll | one 7-row table |
| one-off | 24 | individually, as the 12 on 2026-08-22 were | 24 individual rulings |

**The pizza class ruling** — one sentence to approve: *a 28 cm Bistro pizza weighs 400–450 g and its
per-100 g values come from the FNDDS thin-crust **restaurant** record matching its topping class.*
Both halves are already established on CAPRICCIOSA: the 400–450 g band is Santiago's 2026-08-13
ruling, and FDC 2708663 (*thin crust, from restaurant or fast food*) is the venue cell chosen in the
**2026-08-16 re-sourcing**, after the frozen cell was found to carry 46% more fat. Only the topping
class varies. ⚠️ CAPRICCIOSA's `assumed` field records that entry as having been corrected **five
times** — more than any other dish. Treat the class ruling as the most error-prone in this batch.

**The roll class ruling** — the rice-and-nori base carries over from the three rolls already ruled
(`Salmón Roll`, `Vegan Roll`, `Nikkori Maki`); the *por dentro / por fuera* fillings are swapped per
roll from the menu text.

Each table row shows dish · topping-or-filling class · resulting kcal, so an assignment error is
visible without reading the citations.

---

## 6. The analysis — pre-registered, written before any of the 44 is scored

- **Prediction, on the record: the +14.5 gap shrinks toward zero.** 13 of the 44 new dishes are
  28 cm pizzas — CAPRICCIOSA's class, ~425 g — every one in the bucket where NOBOOST has never
  gained. A crude projection anchoring them at CAPRICCIOSA's −1.00 and the rest at the current mean
  lands the gap at roughly **0**.
- **Primary verdict:** `sim-arm-significance.ts dual+dual@r2 NOBOOST+NOBOOST@r2` on the full 65
  dishes. Whatever it reads, it stands.
- **No early stop.** All 44 are ruled before the verdict counts. The running number may be looked at
  freely; the run may not be stopped because of what it shows.
- **The plate-size split is an out-of-sample test.** The 250 g line was chosen *after* seeing the
  current 21. Fixing it now, before the 44 arrive, converts it from a story into a prediction.
- **Sensitivity row:** the same comparison with the 14 pizzas dropped, because 14 dishes sharing one
  class ruling are not 14 independent dishes and the bootstrap would otherwise overstate confidence.
  Smallest change that does it — a "drop these names" flag on the existing sim, not a clustered
  bootstrap.

### Deploy rule, agreed in advance

> If `NOBOOST` comes out positive overall **but still negative on plates ≥250 g, it does not ship.**
> It becomes the evidence for an arm that pushes small plates down *and* big plates up — which is
> what eval 162's both-directions finding says any working mechanism must do.

---

## 7. Guard rail

After widening, re-score all eight archived arms. **The 21 pre-existing dishes must score exactly
what they score now** — `dual` 67, `dual@r2` 64, `NOBOOST` 70, `NOBOOST@r2` 72, `ROLE` 58,
`MASSCALL` 50, `NOPUSH` 57. The harness derives its dish and menu list from the oracle itself, so
this is a real test of the widening rather than a formality. It passed in round 1.

---

## 8. Cost and scope

**$0 in API.** Every dish is already enriched in the caches; scoring is replay only. The cost is
Santiago's ruling time: 2 class rulings + up to 27 individual rulings + 2 table reviews, minus
whatever the name-only answerability test retires.

**Out of scope, deliberately:**

- Deploying anything. Production stays v32 whatever this finds.
- The Stage-1 dropped-size defect (*"PIZZAS BISTRO — 28 CM"* on a section header,
  `CAMARÓN ROKA (200 g)` on a sibling). Real and possibly larger than any arm, but a different fix.
- The two future-eval hypotheses (menu section as a portion prior; asking in recipe units).
- The kcal-recompute audit flagged at eval 167 (Atwater 4/4/9 vs FNDDS published `Energy`; 2–25% per
  ingredient, never enough to cross a ±20% band).

---

## 9. Re-derive everything here, $0

```bash
deno run --allow-read scripts/sim-arm-significance.ts dual+dual@r2 NOBOOST+NOBOOST@r2
deno run --allow-read scripts/sim-arm-significance.ts dual NOBOOST          # §3.1, run 1 alone
deno run --allow-read scripts/sim-arm-significance.ts dual@r2 NOBOOST@r2    # §3.1, run 2 alone
deno run --allow-read scripts/sim-mass-composition-split.ts dual dual@r2 NOBOOST NOBOOST@r2
deno run --allow-read --allow-env --env-file=.env.local \
  scripts/bench-unweighted.ts 3 NOBOOST --replay        # the /252 score itself
```

§3.2 and §3.3 were derived with throwaway scripts, not committed tooling. Their inputs are the
per-dish table printed by `sim-arm-significance.ts` and the `mass_band_g` fields in
`unweighted-oracle.json`; both are re-derivable from the commands above.
