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

## Remaining to rule

| # | menu | dish |
|---|---|---|
| 6 | bistro | ENSALADA BALI |
| 7 | bistro | ENSALADA BISTRO |
| 8 | bistro | ENSALADA DE LA SEMANA |
| 9 | nikkori | Vegan Roll |
| 10 | nikkori | Nikkori Maki |
| 11 | andaluz | DE CAMARÓN ROKA |
| 12 | brasero-two | TACO EL CAPRICHO |
