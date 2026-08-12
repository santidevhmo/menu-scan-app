# Design — the unweighted-dish oracle, and settling B vs A with it

**Date:** 2026-08-11 · **Status:** approved in brainstorm, not implemented
**Extends:** `docs/superpowers/specs/2026-08-07-usda-macro-oracle-design.md` — every rule in that
document still holds. This adds one thing it never had: a dish whose **mass** is unknown.

---

## 1. The problem

A diner scanned Bistro and read **517 kcal** for a whole 28 cm Capricciosa. USDA says a 28 cm
pizza with meat-and-vegetable topping is **1,250–1,490 kcal**. The estimate is low by about 2.5×,
and every macro is low with it — fat worst, by 3.4×.

| | app | USDA-derived |
|---|---|---|
| mass | 250 g | 470–530 g |
| calories | 517 | 1,250–1,490 |
| protein | 26 g | ~57 g |
| carbs | 57 g | ~126 g |
| fat | 21 g | ~72 g |

Sources: whole-pizza weights FDC 173292 (853 g, 14") and FDC 172047 (758 g, 14"), scaled by area —
28 cm is 62% of a 14". Composition FDC 170715, 276 kcal/100 g, corroborated by FNDDS 2708661.

**This is not a pizza problem.** 144 of the 213 items in the 2026-08-11 generalisation run print no
weight at all, across all five menus. The model's estimates for them are not flat — they range from
19 g to 520 g — but their **mean sits at ~231 g regardless of what the dish is**, and the mean by
piece count barely moves (231 g at 1 piece, 203 g at 2, 230 g at 3, 213 g at 6). Pizza is simply
where the error is visible, because everyone knows what a pizza weighs.

**We cannot currently tell whether any fix helps.** All 96 points of the existing benchmark come
from dishes that print a weight. Every previous attempt at the unweighted case could report that
numbers moved and nothing more — which is how the `typical_total_g` anchor came to be parked on
`feat/unweighted-portion-anchor` after regressing dishes that were already right.

## 2. What this is NOT

- **Not** a runtime lookup. The oracle never ships and the app never calls USDA.
- **Not** a prompt or model change. Building the oracle changes no production behaviour at all.
- **Not** a replacement for the 8 weighted dishes. It is a **separate set with a separate score**;
  the two are never averaged, because averaging would hide precisely the defect being chased.
- **Not** a claim to know a restaurant's exact recipe. See §3.

## 3. Truth is a band

For the existing 8 dishes the mass is a fact — the menu prints `200 g` and the oracle only
allocates ingredients within it. For a 28 cm Capricciosa **nobody printed a mass**, so the oracle
must source the mass too, and the sources disagree: two USDA whole-pizza references differ by 12%,
and area-scaling adds more slack.

So each unweighted entry stores a **low and a high**, and an estimate **passes when it lands inside
the band**.

```json
{
  "name": "CAPRICCIOSA",
  "menu": "bistro",
  "unweighted": true,
  "mass_band_g": [470, 530],
  "band": {
    "calories": [1250, 1490],
    "protein_g": [50, 64],
    "carb_g": [112, 140],
    "fat_g": [63, 80]
  },
  "assumed": "28 cm stated on the menu. Mass from FDC 173292 (853 g / 14\") and FDC 172047 (758 g / 14\") scaled by area, 28 cm = 62% of 14\". Composition FDC 170715 meat-and-vegetable topping, regular crust.",
  "source": "USDA FoodData Central",
  "retrieved_at": "2026-08-11",
  "ingredients": [ "... per the 2026-08-07 oracle schema, with fdc_id, grams, basis, per_100g" ]
}
```

A band is not laxity. The Capricciosa's 517 kcal misses the bottom of its band by 2.4×, and no
defensible widening rescues it. What a band prevents is **inventing precision we do not have** — a
fake point oracle silently flatters whichever model happens to share its error, which this project
has already been bitten by once.

## 4. The six dishes

Real items from archived menus, so the production pipeline can be run on them unmodified. Chosen to
span the failure space in **both** directions, so a fix that merely scales every mass upward fails.

| dish | menu | model says | why it is in |
|---|---|---|---|
| CAPRICCIOSA (28 cm pizza) | bistro | 250 g | the reported defect, and the only dish in the corpus that can measure **B** — the sole printed size we have |
| ENSALADA GRIEGA | bistro | 250 g | a salad: high volume, low density, the opposite direction of error |
| CARBONARA | bistro | 315 g | pasta in a cream sauce, where fat is easy to under-count |
| Salmón Roll | nikkori | 397 g | **a guard.** At 397 g the model looks roughly right here — 33 g per piece across a 12-piece plate is a normal sushi piece. A fix that breaks this one is not a fix. |
| Tiras de Pollo | andaluz | 235 g | chicken strips with fries — the "plate of food" shape, the commonest thing on real menus |
| Coliflor Roka | andaluz | 85 g | **a second guard.** A small side, where 230 g would be too HIGH. |

No soup exists anywhere in the archived corpus; `Coliflor Roka` takes that slot as the small-dish
case.

**Santiago approves each entry** — the FDC records, the edible grams, the raw/cooked/prepared
basis, and the band endpoints — before it is written, exactly as §Workflow of the 2026-08-07 design
requires. An agent may list candidates and may not select silently.

## 5. Mass provenance

Mass follows the same discipline as composition, and its derivation is written into `assumed`:

1. Prefer a USDA `foodPortions` gram weight for the dish or a close analogue.
2. Where the menu states a dimension, scale a USDA reference by **area** (πr²), not by diameter.
3. Where two references disagree, both endpoints go in the band — do not average them away.
4. Where no USDA portion exists for the dish shape, build the mass from the ingredient recipe and
   record that the band is recipe-derived rather than portion-derived.

The four macro bands are **derived from the mass band**, not chosen independently: each endpoint is
that mass endpoint times the reviewed composition. A macro band is therefore never wider than the
mass band that produced it, and the four bands stay mutually consistent under Atwater.

## 6. Scoring

A dish scores **4 points**, one per macro, and a macro passes when the estimate is inside its band.
Six dishes therefore give a **24-point** unweighted score, reported alongside — never merged into —
the existing 96-point weighted score.

Per this project's standing rule, **never quote a single run**: three draws per arm, reported as a
range.

## 7. Settling B vs A

With §6 in place the open question stops being an argument:

| arm | what it is |
|---|---|
| **baseline** | today's deployed v30, unchanged |
| **B** | printed non-gram sizes captured in extraction and carried to enrichment (`28 CM`) |
| **A** | enrichment split by whether an item prints a weight — weighted items keep today's prompt **byte-identically**, so they cannot regress; only unweighted items receive an anchor prompt |

Both arms run over the same six dishes, three draws each, scored against the same bands.

The design is built to accept an unwelcome answer. Plausible outcomes include *B helps one dish and
nothing else* (it is the only menu in 732 archived artefacts that prints a diameter), *A helps five
and regresses the salad*, or *neither clears the band*, which would mean the mass problem is not
solvable at the prompt layer at all. Any of those is worth knowing before code is written.

**Cost: ~$0.30** for all nine enrichment calls. Approval is requested before running, per standing
rule; archive every raw response including passing ones.

## 8. Validation and tests

Inherits every rule from the 2026-08-07 design, plus:

- Reject a band whose low exceeds its high, or whose endpoints are non-positive.
- Reject an entry marked `unweighted` that carries a `printed_total_g`.
- Band scoring is a pure function and unit-tested at the edges: exactly on the low endpoint, exactly
  on the high, and one unit outside each.
- No test touches the network or the API key.

## 9. Success criteria

Six unweighted dishes carry USDA-traceable bands with reviewed provenance, the runner reports a
24-point unweighted score separately from the 96-point weighted one, and the baseline run tells us —
with a number rather than an argument — how far today's pipeline is from the truth on dishes that
print no weight.

## 10. Out of scope

- Implementing B or A. This spec makes them measurable; each gets its own spec if the data supports it.
- The parked `typical_total_g` anchor on `feat/unweighted-portion-anchor`.
- Drinks, which are out of the app for now.
- Any runtime USDA lookup.
