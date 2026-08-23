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
| 1 | 4 STAGIONI | bistro | pizza-group | ✅ |
| 2 | 5 FORMAGGI | bistro | pizza-group | ✅ |
| 3 | CAPRESE | bistro | pizza-group | ✅ |
| 4 | HAWAIANA | bistro | pizza-group | ✅ |
| 5 | ITALIANA | bistro | pizza-group | ✅ |
| 6 | JAMÓN CON CHAMPIÑONES | bistro | pizza-group | ✅ |
| 7 | MARGARITA | bistro | pizza-group | ✅ |
| 8 | MEXICANA | bistro | pizza-group | ✅ |
| 9 | PEPPERONI | bistro | pizza-group | ✅ |
| 10 | VEGETARIANA | bistro | pizza-group | ✅ |
| 11 | FLAMENKUCHEN | bistro | pizza-exception | ✅ |
| 12 | OSTRICA | bistro | pizza-exception | ✅ |
| 13 | QUESO AZUL | bistro | pizza-exception | ✅ |
| 14 | Avocado | nikkori | roll-group | ✅ |
| 15 | Duplex | nikkori | roll-group | ✅ |
| 16 | Fildeflex | nikkori | roll-group | ✅ |
| 17 | Ipanema Roll | nikkori | roll-group | ✅ |
| 18 | Salmón Samba | nikkori | roll-group | ✅ |
| 19 | Spicy Tuna Roll | nikkori | roll-group | ✅ |
| 20 | Tuna Especial | nikkori | roll-group | ✅ |
| 21 | CHAMPIÑONES AL AJILLO | andaluz | one-off (name-only) | ☠️ retired |
| 22 | CROQUETAS DE ABUELA (8 pints.) | andaluz | one-off | ✅ |
| 23 | MEDITERRÁNEA | andaluz | one-off | ✅ |
| 24 | PAPAS BRAVAS | andaluz | one-off (name-only) | ☠️ retired |
| 25 | PARRILLADA VERDURAS | andaluz | one-off (name-only) | ☠️ retired |
| 26 | QUESABONELESS | andaluz | one-off | ✅ |
| 27 | FRADIAVIOLA | bistro | one-off | ✅ |
| 28 | LINGUINNI PARISIENNE | bistro | one-off | ✅ |
| 29 | CEBOLLAS CAMBRAY | brasero-two | one-off (name-only) | ☠️ retired |
| 30 | CHILE RELLENO | brasero-two | one-off (name-only) | ☐ |
| 31 | ORDEN DE TORTILLAS | brasero-two | one-off (name-only) | ☐ |
| 32 | PAPAS CAMBRAY | brasero-two | one-off (name-only) | ☠️ retired |
| 33 | ROLLOS DE CREPA | brasero-two | one-off | ☐ |
| 34 | TACO BRASERO | brasero-two | one-off | ☐ |
| 35 | TACO TRADICIONAL | brasero-two | one-off | ☐ |
| 36 | TOSTA ATUM | brasero-two | one-off | ☐ |
| 37 | TOSTA BRASIL (picaña) | brasero-two | one-off | ☐ |
| 38 | BISQUETS C/ FRUTOS ROJOS | el-marcos | one-off | ☐ |
| 39 | BISQUETS DEL CENTRO | el-marcos | one-off | ☐ |
| 40 | Cazuela de Marlín | el-marcos | one-off (name-only) | ☠️ retired |
| 41 | DE INDIO | el-marcos | one-off | ☐ |
| 42 | Doblada de Camarón y Marlín | el-marcos | one-off (name-only) | ☠️ retired |
| 43 | Machaca de Marlín c/huevo o verdura | el-marcos | one-off (name-only) | ☠️ retired |
| 44 | Omelette de Camarón y Marlín | el-marcos | one-off (name-only, answerable) | ☐ |

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

## Task 3 — the 10 pizzas and 7 rolls, ruled and written

Both tables approved 2026-08-22, all 17 written as `Draft`s in `scripts/unweighted-oracle-build.ts`
and verified: `wrote 38 dishes … (21 before, 26 drafts applied)`, then
`over 38 of 38 ruled dishes` on the `dual` replay guard rail. No dish uncovered.

### Pizza table — final

| dish | class | FDC id | kcal at 425g midpoint |
|---|---|---|---|
| 5 FORMAGGI | cheese | 2708615 | 1131 |
| MARGARITA | cheese | 2708615 | 1131 |
| PEPPERONI | pepperoni | 2708639 | 1199 |
| 4 STAGIONI | meat | 2708650 | 1190 |
| HAWAIANA | meat | 2708650 | 1190 |
| ITALIANA | meat+vegetable | 2708663 | 1024 |
| MEXICANA | meat+vegetable | 2708663 | 1024 |
| CAPRESE | meat+vegetable | 2708663 | 1024 |
| JAMÓN CON CHAMPIÑONES | meat+vegetable | 2708663 | 1024 |
| VEGETARIANA | vegetable | 2708626 | 995 |

### Roll table — final, with the Tampico ruling

**Tampico is a sauce** (Santiago, 2026-08-22) — treated the same way the oracle already treats
"vinagreta de la casa" (ENSALADA BALI): one generic FNDDS record standing in for an unnamed sauce,
no invented protein folded into it. Chosen record: **FDC 2710176 "Fry sauce"** (535 kcal, P0.98,
C7.28, F56.16 per 100g) — a creamy, mayo/ketchup-style condiment, the closest FNDDS analog to a
Mexican-fusion "Tampico" sauce, and Survey (FNDDS) sourced like every other record in this oracle.

| dish | mass band | total mass | total kcal | P/C/F (total) |
|---|---|---|---|---|
| Ipanema Roll | [240,325] | 283g | 354 | 24 / 49 / 7 |
| Fildeflex | [235,320] | 278g | 508 | 23 / 48 / 25 |
| Avocado | [250,335] | 293g | 415 | 13 / 52 / 18 |
| Tuna Especial | [235,320] | 279g | 478 | 21 / 47 / 23 |
| Salmón Samba | [240,325] | 283g | 441 | 29 / 46 / 16 |
| Duplex | [290,395] | 343g | 638 | 24 / 52 / 37 |
| Spicy Tuna Roll | [210,285] | 246g | 476 | 20 / 45 / 24 |

**Naming:** oracle entry uses **"Fildeflex"** (the pipeline's own extraction name), not
**"Fildelfia"** (the physical menu's printed text, likely a misprint for "Filadelfia"). The oracle
must match what the harness actually emits, or the coverage guard rail reports the dish as
uncovered.

### The per-piece sanity check that resolved the whole-order-vs-per-100g confusion

Santiago flagged that 20-29g of total protein per dish "sounded high" against a reference of
"10-20g typical, 20+ unusual" for a whole roll order. Two things resolved it, both worth keeping on
record since the same confusion will recur the next time someone reads these totals cold:

1. **The 10-20g reference and the 4.5-9g/100g reference are the same fact in two units** — a
   ~280g roll × 4.5-9g/100g protein = 12.6-25.2g whole-order, which is what "10-20g typical" was
   already describing.
2. **FDC's own portion data anchors piece count directly**: `FDC 2708963 "Sushi roll, salmon"` publishes
   `1 piece = 30g`. Santiago independently confirmed the same count from the menu
   ("its average sushi roll count is 10-12 rolls") and supplied a photo of one cut Nikkori Maki
   piece showing a couple of small shrimp slices, a cube of avocado, and a smear of cream cheese —
   consistent with a few grams of protein per piece, not dozens.

Cross-checked at 11 pieces (the midpoint of Santiago's stated 10-12):

| dish | status | g/piece | P/piece |
|---|---|---|---|
| Nikkori Maki | approved (round 1) | 31.2g | 1.55g |
| Ipanema Roll | approved (round 2) | 25.7g | 2.18g |
| Fildeflex | approved (round 2) | 25.3g | 2.09g |
| Avocado | approved (round 2) | 26.6g | 1.18g |
| Tuna Especial | approved (round 2) | 25.4g | 1.91g |
| Salmón Samba | approved (round 2) | 25.7g | 2.64g |
| Duplex | approved (round 2) | 31.2g | 2.18g |
| Spicy Tuna Roll | approved (round 2) | 22.4g | 1.82g |

Nikkori Maki's own already-approved composition, divided by its own piece count, lands at 31.2g/piece
— matching FDC's published 30g/piece almost exactly. Every new roll runs 1.2-2.6g protein per piece,
consistent with what the reference photo shows. **The whole-dish totals in the table above are the
originally-proposed figures, unchanged** — the per-piece view was a unit-of-measure clarification,
not a composition revision.

---

## Task 4 — the three pizza exceptions, ruled and written

Approved 2026-08-22, all three written as `Draft`s. `wrote 41 dishes … (38 before, 29 drafts
applied)`, guard rail confirms `over 41 of 41 ruled dishes`.

| dish | why it leaves the class | composition |
|---|---|---|
| FLAMENKUCHEN | cream base, not tomato | FDC 2708682 "White pizza, cheese, with meat and vegetables, thin crust" (P12.07/C21.06/F15.31) |
| QUESO AZUL | cream base + a fruit component | same FDC 2708682; apple slices unweighed (same treatment as HAWAIANA's pineapple) |
| OSTRICA | smoked oyster + dijon — no FNDDS pizza-with-seafood record exists at any venue/crust | 85% FDC 2708650 (plain MEAT class) blended with 15% FDC 2706355 "Oysters, canned" (P10.93/C26.65/F10.94), same blend technique as Salmón Roll |

All three keep the [400,450]g mass band carried from CAPRICCIOSA — nothing on the menu suggests a
different size for any of the three.

---

## Retired — unanswerable

**The test** (from the design spec): does the **name alone** pin both what is on the plate and how
much of it? Retiring a dish is not an early stop — it removes a dish that cannot be ruled, never
one whose score would be disliked, and every retirement below was recorded **before** any of the
13 name-only dishes was scored. Follows the same precedent as `COLIFLOR ROKA` (retired at eval 156:
*"shouldn't even be considered"* — unanswerable rather than badly answered).

Two of the 13 name-only dishes (`JAMÓN CON CHAMPIÑONES`, `PEPPERONI`) were ruled answerable in
Task 3 — the class ruling supplies their portion, so the answerability test doesn't apply the same
way. Of the remaining 11, applied 2026-08-22:

| dish | menu | reason | verdict |
|---|---|---|---|
| CHAMPIÑONES AL AJILLO | andaluz | "garlic mushrooms" names a recognizable prep, but no count/weight/portion convention anywhere | ☠️ retired |
| PAPAS BRAVAS | andaluz | design spec itself flags this as "plausibly does not" pin what+how much; real prep variance across restaurants (cube vs. wedge cut, sauce type), no size stated | ☠️ retired |
| PARRILLADA VERDURAS | andaluz | the plan's own worked example — "grilled vegetables" names neither which vegetables nor how many | ☠️ retired |
| CEBOLLAS CAMBRAY | brasero-two | "cambray onions" (grilled spring onions) — no count/weight stated | ☠️ retired |
| PAPAS CAMBRAY | brasero-two | "cambray potatoes" (small roasted new potatoes) — same gap as CEBOLLAS CAMBRAY, no count/weight | ☠️ retired |
| Cazuela de Marlín | el-marcos | design spec flags this as "plausibly does not" — "cazuela" names a cooking vessel/style, not a bounded recipe or portion | ☠️ retired |
| Doblada de Camarón y Marlín | el-marcos | "doblada" is a regional folded-dish name without a universally fixed size/filling ratio; not self-contained the way ORDEN DE TORTILLAS is | ☠️ retired |
| Machaca de Marlín c/huevo o verdura | el-marcos | the name itself contains an unresolved branch — "huevo **o** verdura" (egg **or** vegetable) — it can't pin down a single WHAT, let alone how much | ☠️ retired |

Two ruled **answerable** and kept: `CHILE RELLENO` and `ORDEN DE TORTILLAS` — the plan's own worked
examples, "the name *is* the recipe." Ruled in Task 7.

**One edge case, ruled by Santiago:** `Omelette de Camarón y Marlín` has no description at all — its
2-egg base is only inferable by analogy to its 3 sibling omelettes on the same menu section (TOMASA,
LAMERA, CUBANA all state *"Dos huevos"* in their own text; this one states nothing). That's different
from ORDEN DE TORTILLAS, which is self-contained, and closer to relying on a sibling dish — the
reasoning the assumed-ingredient rule forbids for ingredients. Santiago ruled **answerable** anyway:
the 2-egg base is a menu-wide portioning convention (every omelette on this specific menu = 2 eggs),
not an assumed ingredient, and the fillings (shrimp + marlin) are named even without proportions.
Ruled in Task 7.

**Final dish count impact:** 8 of 44 retired. Round-2 ceiling drops from 65 to **57** dishes if
every other pending ruling lands (44 - 8 = 36 new + 21 existing).

---

## Task 6 — bistro pastas and andaluz one-offs, ruled and written

Approved 2026-08-22 (all 5, one round of clarification on CROQUETAS DE ABUELA's piece size —
see below). `wrote 46 dishes … (41 before, 34 drafts applied)`, guard rail confirms
`over 46 of 46 ruled dishes`.

⚠️ **Naming trap, caught by the guard rail exactly as designed:** `docs/superpowers/specs/
2026-08-22-oracle-widening-round-2-design.md`'s §4 dish list transcribes 4 of these 5 names
DIFFERENTLY from what the pipeline actually extracts and what the scoring archive
(`scripts/fixtures/caches/unweighted.dual-f.<menu>-dN.raw.json`) actually contains:

| design spec's §4 name | what the SCORING ARCHIVE actually contains | which one is correct |
|---|---|---|
| FRADIAVIOLA | FRADIAVIOLA | ✅ matches (spec was right here) |
| Mediterránea *(implied Title Case by convention)* | MEDITERRÁNEA (all-caps) | archive wins |
| Quesaboneless *(implied Title Case)* | QUESABONELESS (all-caps) | archive wins |
| Croquetas de Abuela (8 pints.) *(implied Title Case, "(8 pints.)" as a label)* | CROQUETAS DE ABUELA (8 pints.) — all-caps, AND "(8 pints.)" IS part of the literal extracted name | archive wins |

**The trap:** `scripts/fixtures/drafts/*.draft.json` is NOT the ground truth the scoring harness
replays against — it briefly misled this session into "fixing" FRADIAVIOLA to FRADIAVOLA (a
regression) based on that file. The only authoritative source for a dish's exact name is
**`scripts/fixtures/caches/unweighted.<arm>-f.<menu>-dN.raw.json`** — the actual cached model
output the harness scores against. Confirmed by re-running the guard rail: the wrong names
produced `over 42 of 46 ruled dishes` with a `PARTIAL SCORE` warning naming all 4 dishes as
unscored; reverting to the archive's own names fixed it to `over 46 of 46`.

**Recovery note:** regenerating twice with different names for the same dishes leaves BOTH
versions in the JSON (merge-by-name treats "FRADIAVOLA" and "FRADIAVIOLA" as different dishes,
correctly preserving both since neither shadows the other). Fixed by `git checkout --` on the
oracle JSON back to the last clean commit, then a single clean regenerate. No corrupted state
was committed.

### Final compositions

| dish | mass band | total mass | P/C/F (total) |
|---|---|---|---|
| FRADIAVIOLA | [340,460] | 398g | 20.8 / 78.6 / 13.9 |
| LINGUINNI PARISIENNE | [380,510] | 445g | 23.7 / 82.1 / 16.9 |
| MEDITERRÁNEA | [340,460] | 400g | 13.7 / 26.2 / 27.5 |
| QUESABONELESS | [180,240] | 210g | 36.4 / 47.2 / 29.5 |
| CROQUETAS DE ABUELA (8 pints.) | [190,260] | 224g | 43.4 / 4.7 / 40.1 |

**CROQUETAS DE ABUELA's piece size** needed Santiago's ruling: FDC's own published portion for
the closest composite record (FDC 2706508 "Ham croquette") is "1 croquette = 62g" — sized for an
American diner-style croquette. Santiago ruled a smaller Spanish-tapa size instead (~28g/piece
× 8 pieces = 224g), since "de Abuela" implies the smaller regional style, not FDC's own default
portion.
