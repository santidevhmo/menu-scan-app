# Oracle widening round 2 — rulings

⚠️ **NOT AN ORACLE FILE.** Markdown in `specs/`, not JSON in `scripts/fixtures/`, so no harness can
read it as scoring data. Nothing here reaches a score until it is a `Draft` in
`scripts/unweighted-oracle-build.ts`.

⚠️ **FDC API, learned in round 1 and still true:** the search endpoint 400s/404s on any form of the
`dataType` parameter — search plain and filter for `Survey (FNDDS)` client-side off each hit's own
`dataType`. And a single 404 on a detail id is NOT evidence the record is gone: round 1 confirmed
transient 404s resolving on retry for ~20 of 51 valid ids. **Retry before concluding a citation is
broken.**

## Status — 44 dishes

| # | dish | menu | pile | ruled? |
|---|---|---|---|---|
| 1 | 4 STAGIONI | bistro | pizza-group | ☐ |
| 2 | 5 FORMAGGI | bistro | pizza-group | ☐ |
| 3 | CAPRESE | bistro | pizza-group | ☐ |
| 4 | HAWAIANA | bistro | pizza-group | ☐ |
| 5 | ITALIANA | bistro | pizza-group | ☐ |
| 6 | JAMÓN CON CHAMPIÑONES | bistro | pizza-group | ☐ |
| 7 | MARGARITA | bistro | pizza-group | ☐ |
| 8 | MEXICANA | bistro | pizza-group | ☐ |
| 9 | PEPPERONI | bistro | pizza-group | ☐ |
| 10 | VEGETARIANA | bistro | pizza-group | ☐ |
| 11 | FLAMENKUCHEN | bistro | pizza-exception | ☐ |
| 12 | OSTRICA | bistro | pizza-exception | ☐ |
| 13 | QUESO AZUL | bistro | pizza-exception | ☐ |
| 14 | Avocado | nikkori | roll-group | ☐ |
| 15 | Duplex | nikkori | roll-group | ☐ |
| 16 | Fildeflex | nikkori | roll-group | ☐ |
| 17 | Ipanema Roll | nikkori | roll-group | ☐ |
| 18 | Salmón Samba | nikkori | roll-group | ☐ |
| 19 | Spicy Tuna Roll | nikkori | roll-group | ☐ |
| 20 | Tuna Especial | nikkori | roll-group | ☐ |
| 21 | CHAMPIÑONES AL AJILLO | andaluz | one-off (name-only) | ☐ |
| 22 | CROQUETAS DE ABUELA (8 pints.) | andaluz | one-off | ☐ |
| 23 | MEDITERRÁNEA | andaluz | one-off | ☐ |
| 24 | PAPAS BRAVAS | andaluz | one-off (name-only) | ☐ |
| 25 | PARRILLADA VERDURAS | andaluz | one-off (name-only) | ☐ |
| 26 | QUESABONELESS | andaluz | one-off | ☐ |
| 27 | FRADIAVIOLA | bistro | one-off | ☐ |
| 28 | LINGUINNI PARISIENNE | bistro | one-off | ☐ |
| 29 | CEBOLLAS CAMBRAY | brasero-two | one-off (name-only) | ☐ |
| 30 | CHILE RELLENO | brasero-two | one-off (name-only) | ☐ |
| 31 | ORDEN DE TORTILLAS | brasero-two | one-off (name-only) | ☐ |
| 32 | PAPAS CAMBRAY | brasero-two | one-off (name-only) | ☐ |
| 33 | ROLLOS DE CREPA | brasero-two | one-off | ☐ |
| 34 | TACO BRASERO | brasero-two | one-off | ☐ |
| 35 | TACO TRADICIONAL | brasero-two | one-off | ☐ |
| 36 | TOSTA ATUM | brasero-two | one-off | ☐ |
| 37 | TOSTA BRASIL (picaña) | brasero-two | one-off | ☐ |
| 38 | BISQUETS C/ FRUTOS ROJOS | el-marcos | one-off | ☐ |
| 39 | BISQUETS DEL CENTRO | el-marcos | one-off | ☐ |
| 40 | Cazuela de Marlín | el-marcos | one-off (name-only) | ☐ |
| 41 | DE INDIO | el-marcos | one-off | ☐ |
| 42 | Doblada de Camarón y Marlín | el-marcos | one-off (name-only) | ☐ |
| 43 | Machaca de Marlín c/huevo o verdura | el-marcos | one-off (name-only) | ☐ |
| 44 | Omelette de Camarón y Marlín | el-marcos | one-off (name-only) | ☐ |

**This table is the resume point.** A session picking this up cold reads it first.

---

## Class rulings

### PIZZA class rule — 28 cm thin-crust Bistro pizza, APPROVED (Santiago, 2026-08-22)

**Mass band:** 400–450 g for every dish on this list, carried unchanged from CAPRICCIOSA's ruling
(Santiago 2026-08-13). 28 cm comes from the section header *"PIZZAS BISTRO — 28 CM"*, which Stage 1
drops — it is menu text, not an assumption.

**Venue and crust:** every composition below is FDC FNDDS **"…, from restaurant or fast food, thin
crust"** — matching CAPRICCIOSA's already-ruled venue/crust exactly. Frozen pizza carries 46% more
fat (CAPRICCIOSA's own re-sourcing note), so venue is never substituted.

**Five topping classes, one FDC id each, all fetched and verified 2026-08-22:**

| class | FDC id | full description | kcal | protein | carb | fat | (per 100 g) |
|---|---|---|---|---|---|---|---|
| cheese | 2708615 | Pizza, cheese, from restaurant or fast food, thin crust | 266 | 11.39 | 33.33 | 9.69 |
| meat | 2708650 | Pizza with meat other than pepperoni, from restaurant or fast food, thin crust | 280 | 11.5 | 30.6 | 12.4 |
| pepperoni | 2708639 | Pizza with pepperoni, from restaurant or fast food, thin crust | 282 | 11.74 | 31.98 | 11.91 |
| meat + vegetable | 2708663 | Pizza with meat and vegetables, from restaurant or fast food, thin crust — CAPRICCIOSA's already-ruled id | 241 | 11.55 | 26.62 | 9.87 |
| vegetable | 2708626 | Pizza, cheese, with vegetables, from restaurant or fast food, thin crust | 234 | 9.96 | 29.9 | 8.37 |

**Per-dish class assignment, approved as proposed:**

| dish | menu text | class | reasoning |
|---|---|---|---|
| 5 FORMAGGI | Queso mozzarella, chihuahua, azul, feta y cabra | cheese | five cheeses, no meat or vegetable |
| MARGARITA | Rebanadas de tomate fresco y albahaca deshidratada | cheese | tomato/basil is a garnish on a plain base, not a bulk vegetable topping |
| 4 STAGIONI | Pepperoni, jamón, tocino y chistorra | meat | four meats, no vegetable |
| MEXICANA | Cebolla morada, pimiento verde y chistorra | meat + vegetable | onion + pepper alongside the sausage |
| ITALIANA | Pepperoni, cebolla morada, pimiento verde, aceituna negra y champiñones | meat + vegetable | four vegetable/fruit-adjacent ingredients alongside pepperoni |
| VEGETARIANA | Espinaca, calabaza, champiñón, cebolla morada, pimiento verde y aceituna negra | vegetable | no meat |
| PEPPERONI | *(name only)* | pepperoni | the dedicated FNDDS pepperoni record exists and is definitionally correct — the generic "meat" record is literally titled "meat OTHER THAN pepperoni" |
| HAWAIANA | Jamón y piña | meat | no thin-crust "meat and fruit" FNDDS record cleanly fits Bistro's venue/crust combination; ham is the dominant named ingredient and pineapple's macro contribution at this scale does not move the class |
| CAPRESE | Espinacas, jamón serrano y tomate deshidratado | meat + vegetable | two of three named ingredients (spinach, tomato) are vegetables |
| JAMÓN CON CHAMPIÑONES | *(name only)* | meat + vegetable | mushroom is a vegetable; ham+mushroom is not a plain-meat topping |

`JAMÓN CON CHAMPIÑONES` and `PEPPERONI` are name-only dishes ruled here, not in the answerability
task (Task 5) — the class rule supplies the portion (28 cm is on the section header) and the dish
name states the topping, so both are answerable by construction.

**Three pizza exceptions** (`FLAMENKUCHEN`, `OSTRICA`, `QUESO AZUL`) are explicitly **not** covered by
this class rule — their compositions leave the class (cream base, or an ingredient with no FNDDS
pizza-topping analog) and are ruled individually in Task 4.

### ROLL class rule — rice + nori base, APPROVED (Santiago, 2026-08-22)

**Base, carried from the three already-ruled rolls** (Salmón Roll, Vegan Roll, Nikkori Maki): rice
FDC 2710788 ("Rice, white, cooked, as ingredient") and nori FDC 2709988 ("Seaweed, dried"), at the
same per-roll gram ranges those three established (rice ~140–150 g, nori ~3 g, scaled by whether a
roll is filled-only or filled-and-topped — filled-and-topped rolls sit at the top of the 250–400 g
band the three precedents span, filled-only rolls sit lower).

**Naming: use "Fildeflex"**, the name in the extraction archives and pipeline caches, not "Fildelfia"
as printed on the physical menu (a likely misprint for "Filadelfia" / Philadelphia roll). The oracle
must match the name the pipeline actually emits, or the harness reports the dish as uncovered.

**Per-roll fillings, from the menu's own *por dentro / por fuera* text** (read directly off
`scripts/fixtures/photos/NikkoriMenu.png`, cross-checked against Nikkori Maki's already-ruled
`assumed` field, which matches this same photo word-for-word):

| dish | por dentro | por fuera | topped? |
|---|---|---|---|
| Duplex | Tampico, aguacate, queso crema y pepino | Camarón y salmón | filled + topped |
| Ipanema Roll | Atún spicy | Camarón y aguacate, bañado en salsa anguila | filled + topped |
| Fildeflex | Salmón, queso crema y pepino | Ajonjolí | filled only (sesame is a coating, not a mass-bearing topping) |
| Avocado | Camarón, queso crema y pepino | Aguacate | filled + topped |
| Tuna Especial | Queso crema y aguacate | Atún con topping de masago y mayonesa | filled + topped |
| Spicy Tuna Roll | Tampico | Atún picado con salsa spicy y masago | filled + topped |
| Salmón Samba | Atún spicy y aguacate | Salmón bañado con salsa spicy ponzu | filled + topped |

Per-roll compositions (specific FDC ids for tuna, salmon, masago, mayonnaise, and the "Tampico"-style
filling) are built out fully in Task 3, reusing existing citations (cream cheese FDC 2705760, avocado
FDC 2709223, surimi FDC 2706568, shrimp FDC 2706449) where the same ingredient recurs.

---

## Retired — unanswerable

*(populated in Task 5)*
