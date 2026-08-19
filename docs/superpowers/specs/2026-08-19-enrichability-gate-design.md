# The enrichability gate — design

**Date:** 2026-08-19 · **Status:** awaiting Santiago's review · **Spend so far:** $0

---

## 1. What this is

The app will stop presenting a macro estimate as if every menu item deserved one. An item whose
menu text does not say what is in it goes to a **Weak** tab and is kept out of the ranking.

**What this is NOT** — spell this out before approving anything:

| it is not | because |
|---|---|
| a claim that Ranked items are accurate | the gate reads the menu's WORDS, not our answer's quality |
| an accuracy filter | 62% of implausible estimates come from **well-described** items; the gate cannot see them |
| a fix for any known macro defect | the accompaniment and under-decomposition defects are untouched |
| a use of the model's `confidence` field | measured redundant — see §4 |
| the user-description feature | deliberately deferred to after release (Santiago, 2026-08-19) |

---

## 2. Why — the measured problem

Across **343 unique food/side/dessert items on 10 real menus**:

| what the menu gives the model | share |
|---|---|
| a real ingredient list — *"Pepperoni, jamón, tocino y chistorra."* | **60%** |
| a description naming no ingredients — `BISQUETS C/ FRUTOS ROJOS` → *"(Orden de dos)"* | **~15%** |
| nothing but a title — `CAMARONES EMPANIZADOS`, `BUTTERED LUMP CRAB` | **25%** |

So **~40% of items give the model no usable evidence**, and it answers anyway. Measured over 5,779
enriched food rows: items the menu describes come back with **5.34 ingredients**, items it does not
with **2.37**.

The harm is not imprecision, it is **inversion**. An under-decomposed dish looks *lean*, so it rises
in exactly the ranking a user trusts. `COLIFLOR ROKA` — battered and deep-fried — reports **69 kcal**
and ranks near the top of a low-calorie goal.

---

## 3. The definition (Santiago's, 2026-08-19)

> **An item is enrichable when its title, or its title plus description, states what the item
> contains — its ingredients, and where it matters its size. Not whether our estimate was right:
> whether we had enough to work from.**

| verdict | item | why |
|---|---|---|
| **enrichable** | *Tuna poke bowl* — "rice, edamame, soy sauce, tuna, chipotle mayo dressing" | names its components |
| **weak** | `COLIFLOR ROKA` | cauliflower — but not how it is cooked, what is on it, or how big |
| **weak** | `Cool Burger` | a burger — but not the patty, the size, or whether it comes with sides |
| **weak** | `BISQUETS C/ FRUTOS ROJOS` — "(Orden de dos)" | a description carrying no ingredient evidence |

🔑 **This is deliberately NOT "does the description field exist".** The third row has a description
and is still weak. An earlier version of this rule used field-presence and would have ranked it.

---

## 4. Rules considered and rejected, with the measurement

Scored over 5,779 enriched food rows. `implausible` = under 1.2 kcal/g, a yardstick that needs no
oracle so it runs on every menu.

| rule | → Weak | catches implausible | wrongly demotes |
|---|---|---|---|
| the model's `confidence` is not `high` | 43% | 56% | **41%** |
| the model's `confidence` is `low` | 1% | 6% | 0% |
| no description field **AND** `confidence` low | **1%** | **6%** | 0% |
| no description field (alone) | 10% | 38% | 7% |

**`confidence` is rejected on evidence.** As an AND it empties the tab (1% of items). As an OR it
changes nothing, because `confidence: low` is almost a **subset** of "no description". And on its own
it costs 41% of good items to catch 56%.

⚠️ **The `implausible` column above is scaffolding for THIS comparison only and must not be carried
into the product's justification** (Santiago, 2026-08-19): it exists only because we hand-built an
oracle for these ten menus. Deployment cannot check any user's scan against a verified source, so the
shipped rule is justified by **evidence sufficiency alone**.

---

## 5. Mechanism

**The model classifies the menu TEXT**, via a required schema field.

The distinction that makes this work, and it is the design's core idea:

| | question asked | reliability |
|---|---|---|
| existing `confidence` | *"how sure are you about your own answer?"* | self-assessment — lands on `medium` for 42% of items |
| **the new field** | *"does this text name the item's ingredients?"* | a property of an input string — objective, checkable by a human holding the menu |

It also **does not overlap `confidence`**, which matters: this project has measured a required field
whose meaning overlaps an existing one coming back as a verbatim copy in **364 of 364** ingredients.

Riders this design must respect, all previously measured and recorded in `AGENTS.md`:

- **field ORDER is load-bearing** — strict mode emits in schema order, so the field must sit **before**
  anything it is meant to constrain.
- **no food, dish or cuisine name in the prompt** — `enrich_test.ts` fails the build otherwise.
- prefer a **closed enum or boolean** over free text; free text invites merging.

### 5.1 ⚠️ THE ONE OPEN DECISION — which stage owns the field

| | Stage 2 (`ENRICH_SCHEMA_OPENAI`) | **Stage 1b (`EXTRACT_SCHEMA`)** |
|---|---|---|
| weighted guarantee | 🔴 **BROKEN** — pass 1's request is no longer byte-identical (5491 bytes), and the whole weighted result rests on that | ✅ **intact** — enrichment untouched |
| re-baseline owed | the weighted benchmark, ~$0.40–0.50 | the extraction eval gates |
| can weak items skip enrichment? | no — the verdict arrives with the macros | ✅ **yes** — known before Stage 2 runs, so it **saves** money per scan |
| risk | a schema change to the stage carrying every macro result | extraction is frozen as a regression gate and would be reopened |

**Recommendation: Stage 1b.** It is the only placement that preserves the byte-identical pass-1
guarantee, and it turns the gate from a cost into a saving. Extraction being "frozen" is a reason to
re-run its gates, not a reason to damage the enrichment baseline.

---

## 6. What the user sees

Three tabs (Santiago's shape, 2026-08-19):

| tab | holds | macros shown? |
|---|---|---|
| **Ranked** | enrichable items, sorted by goal alignment | yes |
| **Weak** | items whose menu text does not say what they contain | **no number** — a plain reason: *"This menu doesn't say what's in this dish."* |
| **Excluded** | allergen filters and other user-set exclusions | n/a |

Two rules carried from this conversation:

1. **A weak item is never hidden.** The user is holding the physical menu and can order it regardless;
   hiding removes our input from the one decision where they have least information.
2. **A weak item never shows a precise number.** A labelled-but-wrong figure still anchors. If we later
   want to say something, it must be something we can stand behind from the name alone (e.g. a cooking
   method), and that is a separate design.

The mandatory allergen disclaimer is unaffected and stays exactly as it is.

---

## 7. How we will know it is right

The ground truth for a definitional rule is **Santiago's judgement**, not a database.

1. Sample real items across all ten archived menus, weighted toward boundary cases (short
   descriptions, descriptions with no ingredients, bare titles with a well-known dish name).
2. Run the classifier over the sample.
3. **Santiago adjudicates every disagreement**, and the labelled sample becomes a committed fixture.
4. A test pins the classifier against that fixture, so the definition cannot drift silently.

**Success criterion, to be agreed before the run:** the classifier matches Santiago's label on the
sample, with every disagreement either fixed or recorded as an accepted edge case.

---

## 8. Cost

| item | estimate |
|---|---|
| building the classifier + fixture | $0 |
| the adjudication sample | ~$0.05–0.10 |
| re-baselining whichever stage owns the field | ~$0.40–0.50 |
| **total** | **~$0.50–0.60** |

Nothing is spent without Santiago's approval, per the standing rule.

---

## 9. Open questions

1. **§5.1 — which stage owns the field.** Recommendation is Stage 1b; needs Santiago's ruling.
2. **Does `side`/`dessert` use the same bar as `food`?** Re-derived over the ten archived menus:
   **sides 32 of 37 undescribed (86%), desserts 18 of 20 (90%)**. A strict reading sends nearly every
   side and dessert to Weak. Possibly correct, possibly useless — needs a ruling.
   ⚠️ START-HERE's prose says "sides 85%, desserts 100%"; the 100% does not reproduce.
3. **Drinks are out of scope** for macros already; confirm they do not appear in Weak.
4. **What happens when Weak is most of a menu?** Two of ten archived menus would send ~45% of items
   there. There may need to be a menu-level message.

---

## 10. Provenance

Everything here traces to eval 155 (`docs/superpowers/extraction-iteration-ledger.md`) and two
committed $0 simulators, `scripts/sim-accompaniment-ceiling.ts` and
`scripts/sim-decomposition-ceiling.ts`. Figures in this document are snapshots — re-derive with the
commands in `docs/superpowers/START-HERE.md`.
