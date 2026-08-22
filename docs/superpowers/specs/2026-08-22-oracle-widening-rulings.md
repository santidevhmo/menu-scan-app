# Oracle widening — Santiago's rulings, as given

Working record for the widening described in `2026-08-22-oracle-widening-design.md`.

⚠️ **NOT AN ORACLE FILE.** Deliberately markdown in `specs/`, not JSON in
`scripts/fixtures/`, so no harness can read it as scoring data. Nothing here reaches a
score until every FDC record is re-verified and the entries are written into
`scripts/fixtures/unweighted-oracle.json`.

⚠️ **Composition figures are FDC values fetched 2026-08-22.** Two API facts worth
recording, both cost time to discover:
- The FDC **search endpoint 400s/404s on any form of the `dataType` parameter** (tested:
  raw parens, `%28%29`, `+` for space, parameter reordering). Plain search works — filter
  for `Survey (FNDDS)` client-side off each hit's own `dataType`.
- **FDC 2710796**, the onion record the existing OMELETTE CUBANA entry cites, returns 404.
  An id copied out of a doc is not a reliable handle. Needs re-resolving.

---

## 1. OMELETTE TOMASA — el-marcos, $94  ✅ RULED

*"Dos huevos con cebolla, cebollín, cilantro, champiñones y queso."*

Santiago pinned the shares: eggs 67%, cheese ~23%, which scaled the fillings up 21% from
the first proposal.

| ingredient | grams | % cal | record |
|---|---|---|---|
| egg, whole, fried with oil | 110 | 67.1% | FDC 2707158 — 2 × 55 g, *"Dos huevos"* is the only stated quantity |
| cheese | 18 | 23.4% | FDC 2705709 cheddar |
| mushrooms | 49 | 4.4% | needs record |
| onion | 30 | 3.5% | needs record (2710796 is 404) |
| chives | 11 | 1.3% | needs record |
| cilantro | 4 | 0.4% | needs record |

**222 g · 315 kcal · 18.7 P · 6.5 C · 23.8 F**
bands **252–378 kcal / 15–23 P / 5–8 C / 19–29 F**, mass **190–255 g**

Note: 222 g sits above FNDDS's largest published omelette portion (170 g). CUBANA is
203 g, also above it. All three of our omelettes are at or past the top of the published
range — the systematic tendency the external review flagged.

## 2. OMELETTE LAMERA — el-marcos, $94  ✅ RULED (as proposed)

*"Dos huevos con cebolla, champiñones, tocino y chile verde."*

| ingredient | grams | % cal | record |
|---|---|---|---|
| egg, whole, fried with oil | 110 | 77% | FDC 2707158 |
| bacon | 8 | 15.5% | FDC 2705885 |
| mushrooms | 30 | 3.1% | needs record |
| onion | 20 | 2.4% | needs record |
| chile verde | 15 | 1.6% | needs its own record, NOT bell pepper |

**183 g · 274 kcal · 16.7 P · 4.8 C · 20.9 F**
bands **220–330 kcal / 14–20 P / 4–6 C / 17–25 F**, mass **155–210 g**

⚠️ **Open inconsistency, flagged and left as ruled:** LAMERA keeps mushrooms 30 g / onion
20 g while TOMASA's adjustment raised the same two vegetables to 49 g / 30 g. Same
restaurant, same menu section. Neither is above 4% of LAMERA's calories, so neither can
flip a macro — but the oracle is internally inconsistent on this pair until Santiago
aligns them or rules that they differ.

## 3. FETUCCINI ALFREDO — bistro, $235  ✅ RULED

*"Salsa Alfredo a base de queso parmesano"*

Santiago pinned the total at ~817 kcal and the shares at 44.2 / 29.4 / 12.9 / 13.6.

| ingredient | grams | % cal | kcal | record |
|---|---|---|---|---|
| pasta, cooked | 235 | 44.3% | 362 | FDC 2708357 · 154 kcal/100 g |
| cream, heavy | 70 | 29.4% | 240 | FDC 2705597 · 343 |
| butter, stick | 15 | 13.7% | 111 | FDC 2710155 · 743 |
| cheese, Parmesan, dry grated | 25 | 12.6% | 103 | FDC 2705728 · 412 |

**345 g · 817 kcal · 22.5 P · 76.9 C · 46.6 F**
bands **654–980 kcal / 18–27 P / 62–92 C / 37–56 F**, mass **295–395 g**

Parmesan reads 12.6% against the ruled 12.9% because 12.9% needs 25.6 g and 26 g would
put the total at 819. Round gram kept over exact percentage; open to reversal.

## 4. ALFREDO PORTOBELLO — bistro, $262  ✅ RULED (as proposed)

*"Base de crema, laminas de portobello y pollo marinado."*

| ingredient | grams | % cal | record |
|---|---|---|---|
| pasta, cooked | 200 | 43.6% | FDC 2708357 · 154 |
| cream, heavy | 60 | 29.1% | FDC 2705597 · 343 |
| chicken breast, grilled, skin not eaten | 90 | 21.3% | FDC 2705968 · 168 |
| mushrooms, portobello, cooked with oil | 60 | 6.0% | FDC 2709941 · 70 |

**410 g · 707 kcal · 41.5 P · 66.6 C · 30.5 F**
bands **566–848 kcal / 33–50 P / 53–80 C / 24–37 F**, mass **350–470 g**

⚠️ **The largest open divergence in the whole batch.** Decomposed protein is **41.5 g**;
the FNDDS composite cell (2708870, cream sauce + poultry + vegetables, restaurant) carries
5.81 g protein per 100 g, implying roughly **50 g of chicken** on a 350 g plate against the
ruled 90 g. One of those is wrong by a factor of two on the dish's headline macro.

## 5. PASTA ESPECIAL — bistro, $235  ✅ RULED (as proposed)

*"Salsa de tomate de la casa, campiñones, chistorra y queso de cabra."*

| ingredient | grams | % cal | record |
|---|---|---|---|
| pasta, cooked | 220 | 53.6% | FDC 2708357 · 154 |
| chistorra | 40 | 21.5% | FDC 2706179 chorizo · 341 — **no chistorra record exists in FNDDS** |
| cheese, goat | 20 | 11.2% | FDC 2705716 · 355 |
| spaghetti sauce | 100 | 8.1% | FDC 2709745 · 51 — plain cell, not "added vegetables", because the mushrooms are counted separately |
| mushrooms, cooked with oil | 50 | 5.6% | FDC 2709941 · 70 |

**430 g · 633 kcal · 27.9 P · 79.1 C · 22.7 F**
bands **506–759 kcal / 22–33 P / 63–95 C / 18–27 F**, mass **365–495 g**

---

## Cross-cutting decisions still open

1. **Decomposition vs composite.** These pastas are decomposed per Santiago's instruction
   to use the omelette format. CARBONARA and CAPRICCIOSA remain the only composite-derived
   entries. Per 100 g the two methods disagree in **both directions** — Alfredo 238
   decomposed vs 203 composite; Especial 147 vs 174 — so the choice of method is not a
   uniform offset. Open: re-derive CARBONARA by decomposition for consistency, or keep both.
2. **Mass-band width.** Decomposition gives recipe ±15%. CARBONARA's composite gave
   [250, 450] — published portion to plate estimate, far wider. These pastas are therefore
   judged on tighter mass than CARBONARA is.
3. **Menu correlation.** 6 of the 12 new dishes are from bistro (3 pastas, 3 salads), and
   the pastas share a composition family. Correlated dishes add less statistical power than
   their count implies; the dish-level bootstrap treats them as independent. Argues for
   stage 2 drawing from mochomos / polloteria / casa-nostra / guest-house.

---

# 🔑 FOUND WHILE RULING: THE MENU SECTION IS A SIZE SIGNAL AND WE THROW IT AWAY

Santiago asked whether the bistro salads are starters or standalone dishes. Answering it from
the photo turned up a bigger finding and a hypothesis for a future eval. **Move this block to
the ledger when it is acted on.**

## The finding: "28 CM" is printed on the menu and never reaches the pipeline

`BistroMenu.png` section header reads **"PIZZAS BISTRO — 28 CM"**. The size is printed on the
SECTION, not the item.

**Zero of 26 bistro items carry "28" or "cm" anywhere** — not in `description`, not in
`section_title` (which arrives as bare `"PIZZAS BISTRO"`). Verified 2026-08-22 against
`bistro.eval117-r1.raw.json`.

⚠️ **CAPRICCIOSA's oracle band was ruled from "28 cm stated on the menu" — a number the
pipeline is never shown.** That dish has failed in every arm of this phase: 3/12 shipped
`dual`, 0/12 `MASSCALL`, 5/12 `ROLE`, and it is the dish the 2026-08-13 simulation proved no
plate total can fix. **We have been grading it against information Stage 1 discards.**

This is a STAGE 1 fix, not a Stage 2 arm. It plausibly outranks any prompt or schema change
tried in this phase, because it supplies real information rather than redistributing a guess.

## Two more Stage-1 gaps and one mis-section, same photo

- **ENSALADA BISTRO is "*Al horno"** — a BAKED salad. The note is dropped from the extracted
  description. Its ruling below used RAW vegetable records and needs re-ruling.
- **CARBONARA's "*Extracto de huevo"** is likewise dropped.
- **ALFREDO PORTOBELLO arrives with `section_title: "PIZZAS BISTRO"`** — a pasta under the
  pizza heading. Any mechanism keyed on the section must tolerate a wrong section.

## The hypothesis for a future eval (Santiago's, 2026-08-22)

*"If the menu item is an entrée, its portions are much lower; if it's a main dish, its
portions are more individual."*

**`section_title` ALREADY REACHES THE STAGE 2 REQUEST.** Verified: the keys sent to
`enrichBatch` are `name, description, price, category, section_title, options, grams`. The
model sees `"ENSALADAS"`, `"PASTAS"`, `"PIZZAS BISTRO"` on every call. **Nothing in
`ENRICH_PROMPT` mentions it and nothing in `ENRICH_SCHEMA_OPENAI` asks the model to commit to
anything about it.** Given this phase's scoreboard — prompt wording 0 for 6, a required schema
field 6 for 9 — a required field keyed on the section is the natural shape.

### The denominator, because a frequency claim needs one

Across all 10 archived menus, 2102 items:

| | share |
|---|---|
| under a heading that says something about **PORTION** (ENTRADAS 115, SIDES 64, STARTERS 32) | **211 = 10%** |
| under a heading that says only the **DISH TYPE** (PASTAS, PIZZAS, ENSALADAS, POSTRES, TACOS, ROLLOS…) | ~90% |

⚠️ 10% is a FLOOR, not exact — the regex missed `ACOMPAÑAMIENTOS` (28 items) and any
`PARA COMPARTIR` phrasing.

🔑 **So a starter-vs-main mechanism reaches only ~10% of items, while the dish-TYPE heading
reaches ~90%.** The section is a better lever as a *dish-form* prior — which is exactly the
"that item's average size (pizza, for ex)" mechanism Santiago described — than as a
starter/main flag.

### ☠️ THE TRAP THAT WOULD INVALIDATE THIS EVAL

Our corpus contains **"ENTREES" (64 items)** AND **"entradas / ENTRADAS / Entradas" (115
items)**. In English a menu **entrée is the MAIN course**; in Spanish an **entrada is the
STARTER**. Opposite meanings, same root, both present in our own fixtures. **A mechanism
keyed on the word gets one language backwards, and the eval would read as noise.**

### What is NOT known, and must not be invented

**No multiplier for starter-vs-main portion size.** Starters are generally smaller, but there
is no measured figure for this corpus and the oracle currently contains almost no starters.
The honest way to obtain it is to rule several *entradas* dishes and measure — an argument for
stage 2 drawing from the entradas sections rather than more bistro items.

### Priority order this suggests

1. **Stop discarding printed size at Stage 1** (the 28 CM case). Real information, not a
   redistributed guess. Cheapest and highest value.
2. **A dish-form portion prior**, reaching ~90% of items, delivered as a required schema field
   ahead of the gram field.
3. **A starter/main flag**, reaching ~10% of items, and only with the entrée/entrada
   ambiguity resolved by language rather than by word.

---

# 🔑 SECOND FUTURE-EVAL HYPOTHESIS: ASK IN RECIPE UNITS, NOT GRAMS

Santiago's, 2026-08-22: *"recipe-decomposing could work too. If we have a salad, we could ask
the model about the average recipe of this menu item, and it could return useful stuff such as
'olive oil is usually 1 tablespoon, cheese is usually 1/2 a cup, lettuce is usually 1 cup'."*

## Prior art: NOT tried. Every previous decomposition arm asked in grams or percent

| arm | what it asked for | outcome |
|---|---|---|
| Arm S | a sentence asking the model to decompose | ignored |
| Arm S3 | required `parts` array `{name, share_pct}` | won its probe, lost its benchmark, 26/72 |
| Arm S4 | a SECOND required gram field | identical to `typical_serving_g` in **364 of 364** ingredients |
| B16 | an ingredient's share of the dish | back-computed from grams already written |
| B21 | the standard reference amount (RACC) | shipped; it is what the field means today |

**None asked for a HOUSEHOLD or VOLUMETRIC measure.** Every tablespoon in this ledger is *us*
using USDA household equivalents to adjudicate the ORACLE — the Caesar dressing ruling, the
Coleslaw ruling at 1 tbsp = 15.6 g — never the model answering in them.

## 🟢 THE $0 EVIDENCE THAT MAKES THIS A STRONG CANDIDATE

If the model's gram answers were household measures converted to grams, asking in recipe units
would add nothing. Tested over **561 ingredient gram answers** from `dual` and `NOBOOST`:

| | share |
|---|---|
| **metric-round only** (20, 50, 100, 10, 150, 200, 60…) | **59%** |
| household-measure only (15, 28, 85, 113, 140, 170, 227, 240…) | **6%** |
| ambiguous — 5 g = 1 tsp, 30 g = 1 oz | 28% |
| neither | 5% |

And the vocabulary is tiny: **16 distinct values across 561 answers**, with five of them —
30, 20, 50, 100, 10 — covering **79%**.

🔑 **The model is not converting from a recipe it knows in cups and spoons. It is snapping to a
16-value metric grid.** So asking in the units recipes are actually written in is a NEW
mechanism, not a relabelling of the existing one. It also fits the architecture exactly: the
model states "1 tbsp olive oil", **our code** does the conversion — the same B10/B12 split that
already works, and the same reason `MASSCALL` failed when it tried to route around
decomposition.

## Why it is plausible on this phase's own scoreboard

- Round-number anchoring is the documented root cause of the size error, and the external
  review found prompt-level mitigations "largely ineffective" — matching our 0-for-6 on wording.
  A UNIT CHANGE is not a wording mitigation; it moves the question into a different number space.
- Recipe text is overwhelmingly written in household measures, so this asks for knowledge in
  the form it was learned in.
- It supplies a per-ingredient quantity the model is not already producing, which is the exact
  criterion S4 and B16 failed.

## Design cautions

1. **Our code must own the conversion table**, not the model. A model-supplied gram conversion
   re-introduces the arithmetic we deliberately removed.
2. **A volume→mass conversion needs a DENSITY per food**, and that is where this can quietly
   fail: 1 cup of lettuce is ~55 g, 1 cup of grated cheese ~113 g, 1 cup of oil ~218 g. A
   single cups→grams constant would be worse than the metric grid it replaces. FNDDS publishes
   `foodPortions` with gram weights per household measure, so the table is retrievable — this
   is the same retrieved-anchor idea, entering through the unit rather than the number.
3. **Schema shape matters more than the prompt** (6 for 9 vs 0 for 6): the amount and the unit
   want to be two required fields, unit as an ENUM, both emitted BEFORE any gram field.
4. **The B4 ordering rule applies** — a unit chosen after a number has already been written is
   post-hoc.
5. Combining this with the section-title dish-form prior above would be TWO variables. Run
   them separately.

---

## 6. ENSALADA BALI — bistro, $185  ✅ RULED (Santiago revised the fruit upward, approved 2026-08-22)

*"Espinaca, mandarina, arándanos, tomate cherry, coco rallado, cacahuate y vinagreta de la casa."*

Santiago kept the five figures he called most defensible and raised the two he judged
visually underestimated — mandarina 50 → 80 g, tomate cherry 40 → 70 g.

| ingredient | grams | % cal | record |
|---|---|---|---|
| vinagreta | 30 | 29.1% | FDC 2710195 · 430 |
| cacahuate, dry roasted | 20 | 28.4% | FDC 2707517 · 629 |
| arándanos, dried | 15 | 11.6% | FDC 2709202 · 342 — read as dried cranberries |
| mandarina | 80 | 10.7% | FDC 2709175 · 59 |
| coco rallado | 10 | 10.7% | FDC 2707501 "Coconut, packaged" · 472 |
| espinaca | 100 | 6.0% | FDC 2709614 · 27 |
| tomate cherry | 70 | 3.5% | FDC 2709719 · 22 |

**325 g · 443 kcal · 9.7 P · 39.5 C · 27.3 F**
bands **354–532 kcal / 8–12 P / 32–47 C / 22–33 F**, mass **275–375 g**

All five of Santiago's predicted ranges are hit: 400–460 kcal (443), 8–11 P (9.7), 35–45 C
(39.5), 24–30 F (27.3), 300–390 g (325).

Two notes recorded so the entry reads as decisions rather than drift:
- **The centre moved 419 → 443 by arithmetic**, not by choice. The extra 30 g of mandarina and
  30 g of tomate add 25 kcal. Santiago asked to keep 419 AND raise the fruit; those pull
  against each other, and 443 is inside his own 400–460 prediction.
- **His requested 350–500 band IS the standard rule**, not a widening: recipe ±20% on 419 gives
  335–503. On the new 443 it gives 354–532. The derived band is kept so BALI is not the only
  dish in the oracle with a hand-set band.
- Concentration is **68%** for vinagreta + cacahuate + coco, not the 72% Santiago computed —
  that figure was true of the pre-revision recipe; the added fruit dilutes it.
- ⚠️ **The vinaigrette is the dish's largest single uncertainty** at 29% of calories, on
  FDC 2710195 "Salad dressing, NFS, for salads" (430 kcal/100 g), a full-fat generic. A house
  balsamic could be materially leaner. Not enumerated.

⚠️ **A search trap caught here, worth remembering:** the top FNDDS hit for "coconut, dried,
sweetened, shredded" is **Coconut WATER at 37 kcal/100 g**. Taking the top hit would have put a
drink in place of a solid and understated this ingredient by **13×**. Never accept a top hit
without reading its description.

## 7. ENSALADA BISTRO — bistro, $225  ✅ RULED (as proposed)

*"Tomate, campiñones, pimiento verde, cebolla morada, pera, manzana, calabaza, queso brie y chistorra."*

| ingredient | grams | % cal | record |
|---|---|---|---|
| chistorra | 40 | 40.7% | FDC 2706179 chorizo · 341 |
| queso brie | 30 | 30.0% | FDC 2705708 · 334 |
| pera | 40 | 7.7% | FDC 2709254 · 64 |
| manzana | 40 | 7.3% | FDC 2709215 · 61 |
| campiñones | 40 | 3.7% | FDC 2709793 · 31 |
| tomate | 50 | 3.3% | FDC 2709719 · 22 |
| calabaza, cooked | 40 | 3.0% | FDC 2710804 · 25 |
| cebolla morada | 20 | 2.3% | FDC 2709795 · 38 |
| pimiento verde | 30 | 2.1% | FDC 2709800 · 23 |

**330 g · 334 kcal · 16.6 P · 21.6 C · 20.2 F**
bands **268–401 kcal / 13–20 P / 17–26 C / 16–24 F**, mass **280–380 g**

⚠️ **The menu says "*Al horno" — this is a BAKED salad — and the extraction drops that note.
Santiago's ruling 2026-08-22: ignore it, keep the raw records.** Recorded because the entry
would otherwise look like an oversight rather than a decision.

⚠️ The menu line **names no greens at all**. Taken literally: no lettuce, no spinach.

## 8. ENSALADA DE LA SEMANA — bistro, $185  ✅ RULED (dressing added on Santiago's ruling)

*"Combinación de lechuga y espinaca, arándanos, tomate cherry, campiñón, calabaza, pera, manzana, almendras y queso de cabra."*

The menu names **no dressing**. Santiago ruled 2026-08-22 to include an average one. 30 g is
externally anchored, not a guess: it is the RACC for salad dressing, it matches USDA's own
default coleslaw-dressing serving (31 g), and it equals the vinagreta already ruled for BALI.

| ingredient | grams | % cal | record |
|---|---|---|---|
| dressing (average, not named on the menu) | 30 | 25.9% | FDC 2710195 · 430 |
| almendras | 20 | 25.1% | FDC 2707486 · 626 |
| queso de cabra | 25 | 17.9% | FDC 2705716 · 355 |
| arándanos, dried | 15 | 10.3% | FDC 2709202 · 342 |
| pera | 40 | 5.1% | FDC 2709254 · 64 |
| manzana | 40 | 4.9% | FDC 2709215 · 61 |
| espinaca | 50 | 2.7% | FDC 2709614 · 27 |
| lechuga | 60 | 2.3% | FDC 2709789 · 19 |
| calabaza, cooked | 40 | 2.0% | FDC 2710804 · 25 |
| campiñón | 30 | 1.9% | FDC 2709793 · 31 |
| tomate cherry | 40 | 1.8% | FDC 2709719 · 22 |

**390 g · 497 kcal · 14.0 P · 38.1 C · 32.1 F**
bands **398–597 kcal / 11–17 P / 31–46 C / 26–38 F**, mass **330–450 g**

🔑 **The unnamed dressing is the dish's single largest calorie source at 26%**, ahead of the
almonds. A salad's macros are decided mostly by ingredients the menu does not quantify and
sometimes does not mention.

---

## 🔑 WHAT THE THREE SALADS SHOW, AND WHY IT MATTERS TO THE PHASE

In every one, two or three small dense items carry most of the calories, and the greens carry
almost none:

| salad | top two by calories | their share | greens' share |
|---|---|---|---|
| BALI | vinagreta + cacahuate | **61%** | 6% |
| BISTRO | chistorra + brie | **71%** | none named |
| DE LA SEMANA | dressing + almendras | **51%** | 5% |

**A salad's macros are decided almost entirely by the garnish-like items** — exactly the
quantity `ROLE` got wrong when it shrank everything not labelled "body", and exactly the class
the RACC comparison found the model placing FAR BELOW its reference amount (vegetables 30 g
against 85 g, nuts 10 g against 30 g).

⚠️ These three are also **much larger than ENSALADA GRIEGA**, the salad already in the oracle:
its bands are 136–250 g and 143–214 kcal against 265–390 g and 334–497 kcal here. Part is real
— GRIEGA is lettuce, tomato, olives and feta while these carry sausage, cheese, nuts and fruit.
But a 2× calorie gap between salads on comparable menus is worth a look, because **if GRIEGA is
ruled too light then it, not these, is the outlier.** Not resolved.


## 9. Vegan Roll — nikkori, $129  ✅ RULED (as proposed)

*"Tofu, aguacate, pepino y zanahoria, cubierto de arroz."* Filled only, no topping.

| ingredient | grams | % cal | record |
|---|---|---|---|
| arroz | 150 | 52.7% | FDC 2710788 "Rice, white, cooked, as ingredient" · 129 |
| tofu, firme | 50 | 21.6% | FDC 172475 · 159 — **SR Legacy; FNDDS has no plain tofu cell** |
| aguacate | 40 | 18.9% | FDC 2709223 · 174 |
| alga nori | 3 | 3.0% | FDC 2709988 · 373 |
| zanahoria | 20 | 2.4% | FDC 2709660 · 44 |
| pepino | 30 | 1.3% | FDC 2709784 · 16 |

**293 g · 368 kcal · 14.6 P · 52.7 C · 11.0 F**
bands **294–442 kcal / 12–17 P / 42–63 C / 9–13 F**, mass **250–335 g**

Santiago's suggested ranges (293 g, 365–380 kcal, 14–16 P, 50–55 C, 10–12 F) all contain the
computed recipe. ⚠️ **Sushi rice is seasoned with sugar and vinegar; FDC 2710788 is plain
cooked rice, so this is a slight UNDERestimate** of the largest component.

## 10. Nikkori Maki — nikkori, $159  ✅ RULED (as proposed)

*"Por dentro: Queso crema, aguacate, pepino y camarón. Por fuera: Surimi."* Filled AND topped —
the same class as the existing Salmón Roll.

| ingredient | grams | % cal | record |
|---|---|---|---|
| arroz | 140 | 39.0% | FDC 2710788 · 129 |
| queso crema | 30 | 22.1% | FDC 2705760 · 343 — the record Salmón Roll already cites |
| aguacate | 40 | 15.0% | FDC 2709223 · 174 |
| surimi | 60 | 12.2% | FDC 2706568 · 95 — the outside layer |
| camarón | 40 | 8.2% | FDC 2706449 · 96 |
| alga nori | 3 | 2.4% | FDC 2709988 · 373 |
| pepino | 30 | 1.0% | FDC 2709784 · 16 |

**343 g · 465 kcal · 17.1 P · 60.0 C · 17.4 F**
bands **372–558 kcal / 14–21 P / 48–72 C / 14–21 F**, mass **290–395 g**

Santiago's suggested ranges (340–350 g, 450–500 kcal, 16–19 P, 57–64 C, 16–19 F) all contain
the computed recipe. He flagged two sensitivities not applied: if the surimi exterior carries a
creamy sauce the upper end is nearer 500–560 kcal; if the cream cheese is 20 g and the surimi a
thin layer, nearer 425–450.

## 11. DE CAMARÓN ROKA — andaluz, $275  ✅ RULED — rice REMOVED, sauce KEPT

*"Por dentro camarón capeado, pepino, aguacate y alga, y por fuera nuestro camarón roka con
cebollín y ajonjolí."*

**Santiago's ruling: remove the rice — the menu never names it, and 341 g was only reachable by
assuming 140 g of it.** Keep the sauce, on evidence from the same menu.

🔑 **THE SAUCE QUESTION IS SETTLED BY THE MENU ITSELF, not by assumption.** Andaluz carries
`CAMARÓN ROKA (200 g)`: *"Camarón capeado y bañado en nuestro **aderezo roka a base de
chipotle**."* So "roka" is an *aderezo* — a chipotle-based creamy dressing — and `COLIFLOR ROKA`
applies the same word to cauliflower, so it is a sauce and not a shrimp technique. The
standalone version also **prints 200 g**, an external anchor for the preparation.

| ingredient | grams | % cal | record |
|---|---|---|---|
| aderezo roka (mayo base) | 20 | 33.1% | FDC 2710204 · 680 — **not named on the menu; included on the evidence above** |
| camarón capeado | 60 | 31.4% | FDC 2706364 "Shrimp, fried" · 215 |
| aguacate | 40 | 16.9% | FDC 2709223 · 174 |
| camarón (roka topping) | 40 | 9.3% | FDC 2706449 · 96 |
| ajonjolí | 3 | 5.0% | FDC 2707586 · 680 |
| alga | 3 | 2.7% | FDC 2709988 · 373 |
| pepino | 30 | 1.2% | FDC 2709784 · 16 |
| cebollín | 5 | 0.5% | standard |

**201 g · 411 kcal · 15.6 P · 17.2 C · 31.1 F**
bands **329–493 kcal / 12–19 P / 14–21 C / 25–37 F**, mass **170–230 g**

Santiago's strict no-rice-no-sauce baseline was 181 g / ~275 kcal — arithmetically identical to
this recipe minus the sauce. His practical range with sauce (200–230 g, 400–500 kcal) contains
the ruled 201 g / 411 kcal.

⚠️ **This dish sets a precedent: an ingredient the menu ASSUMES rather than states is included
when other text on the same menu establishes it, and excluded otherwise.** Rice was excluded
(nothing establishes it); the roka dressing was included (the standalone dish spells it out).
The same question is open for ENSALADA DE LA SEMANA's dressing, which was included on
Santiago's ruling with no menu evidence — those two decisions are not made on the same basis.

## 🎯 A NOTE ON BAND WIDTH — Santiago's ranges vs the derived rule

For dishes 9–11 Santiago supplied ranges far tighter than the oracle's rule: Vegan Roll
365–380 kcal is ±2% where the derivation is recipe ±20%.

**Ruling 2026-08-22: adapt the suggested range to the oracle's band rule.** The derived band is
used, because the computed recipe falls inside every range he gave, every other dish in the
oracle derives its band mechanically, and a band four times tighter than its neighbours would
make these three disproportionately hard and break comparability with the existing nine.

Recorded for the record: the pass rule adds a 50 kcal allowance measured from the band
MIDPOINT, so even a 365–380 band would pass anything in 322–422 — an effective ±13%, not ±2%.


## 12. TACO EL CAPRICHO — brasero-two, $100  ⏳ proposed, awaiting Santiago

*"Taco de arrachera en base de lechuga fresca y costra de queso."*

| ingredient | grams | % cal | record |
|---|---|---|---|
| arrachera | 55 | 44.7% | FDC 2705827 "Beef, steak, flank" · 243 — arrachera IS flank/skirt steak, an exact cell. 55 g matches TACO PORCO's ruled meat |
| costra de queso | 25 | 32.7% | FDC 2705720 Monterey · 392 — the US analogue for a Mexican melting cheese |
| tortilla, maíz | 28 | 21.2% | FDC 2707823 · 227 — **a published FNDDS portion**, the same sourced weight TACO PORCO uses |
| lechuga fresca | 20 | 1.3% | FDC 2709789 · 19 |

**128 g · 299 kcal · 23.5 P · 13.7 C · 16.7 F**
bands **239–359 kcal / 19–28 P / 11–16 C / 13–20 F**, mass **110–145 g**

✅ **Two consistency checks, both pass.**
1. **Mass lands inside TACO PORCO's ruled band** — 128 g against [100, 140]. Two tacos from the
   same menu in the same range.
2. 🔑 **The composite record AGREES here, and that validates why PORCO rejected its own.**
   PORCO was decomposed because every FNDDS pork-taco cell forces cheese the dish lacked, and
   that phantom cheese was half its fat. **This taco HAS cheese**, so the composite should
   apply — FDC 2708515 "Taco, corn tortilla, beef, cheese" at 249 kcal/100 g gives **319 kcal**
   at 128 g against the decomposed **299**, a **7%** gap. Compare the pastas, where the two
   methods diverged in BOTH directions by up to 18%.

Notably richer than TACO PORCO — 299 kcal against its ~218 midpoint, fat 16.7 g against ~8.5 —
because the *costra* is a third of the calories where PORCO has no cheese.


## Remaining to rule

All 12 proposed. **11 ruled, TACO EL CAPRICHO (#12) awaiting Santiago.**

## 🔎 DE CAMARÓN ROKA — Santiago's Instagram check, 2026-08-22

Santiago checked the restaurant's Instagram: the dish is **a plate with a lettuce base and
fried shrimp, not a roll**, and he ruled to keep the rice out and use only the named ingredients
— which is what the entry above already does. He also directed that the mass be that of **an
individual dish for one person, not a shareable plate**.

✅ **The ruled 201 g already satisfies that, and the menu corroborates it independently:**
andaluz's plated `CAMARÓN ROKA` under *del mar* **prints 200 g** — within a gram of the ruled
mass, reached from ingredients without ever consulting that printed figure.

⏳ **Open:** the lettuce base is visible on Instagram but absent from the menu text for this
item, so it is NOT in the ruling. Low-calorie, but it would raise the mass. Awaiting a decision,
and it is the same "ingredient the menu assumes rather than states" question as the rice and the
roka dressing.

## ⚠️ EXISTING ORACLE DISHES THIS BATCH CAST DOUBT ON

Not part of the widening, but surfaced by it. None resolved.

| dish | why | severity |
|---|---|---|
| **CAPRICCIOSA** | graded against a "28 CM" printed on the menu that Stage 1 never passes to the pipeline | **high** — it fails in every arm of the phase |
| **ENSALADA GRIEGA** | bands 136–250 g / 143–214 kcal against the three new salads at 275–450 g / 354–597 kcal. It may be the outlier rather than they | medium |
| **Salmón Roll** | its own entry warns that revising [250,350] → [300,400] left the set with **no dish guarding against an arm that scales everything upward**. Worth re-checking now that 11 dishes are being added — one of them may restore that guard | medium |
| **OMELETTE CUBANA** | 203 g sits above FNDDS's largest published omelette portion (170 g), and both new omelettes land there too (222 g, 183 g) | low — eval 162 closed this as "the oracle is the generous end, the model is the error" |
