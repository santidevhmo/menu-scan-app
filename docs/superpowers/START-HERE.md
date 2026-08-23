# START HERE

Entry point for any new session on Menu Scan. This file keeps only a compact handoff pointer;
the detailed, time-sensitive macro status lives in its executable plan and run ledger.

**Repository root:** `/Users/santiagoaguirre/Desktop/CODING/menu-scan-app`. App code, edge
function, scripts, fixtures, oracles, docs and ledgers all live here. Macro-enrichment work is
currently on linked-worktree branch `worktree-stage2-macro-benchmark`; confirm the active branch
before editing. Older docs reference a `.worktrees/extraction-eval-harness` folder; **it no
longer exists** (merged into `main`, eval 138). Read any such path as "this repo".

---

## 0. THE MAP — read this first if any of the words below are unfamiliar

**What the product does.** The user photographs a restaurant menu. The app reads the items off the
photo (**Stage 1**), then for each dish asks a model to list its ingredients, and for each ingredient
two things: **how many grams** are in one serving, and **what it is per 100 g** (protein/carb/fat).
**Our code does all the arithmetic** — grams × per-100 g, summed. The model never reports a total.
That split is deliberate: the model is good at knowing what food is, and bad at addition.

### The vocabulary, in plain terms

| word | what it means |
|---|---|
| **Stage 1 / Stage 2** | Stage 1 reads the menu photo into a list of items. **Stage 2 is the macro estimate.** All the work in this phase is Stage 2. |
| **oracle** | The **answer key**. A hand-built, USDA-sourced record of what each test dish really contains. It lives in `scripts/fixtures/unweighted-oracle.json` (+ a weighted one). **It never runs in the app** — it exists only to grade us. It stores **bands only** — `mass_band_g`, four macro `band`s and a prose `assumed` — with **no per-ingredient array**; the decomposition lives in the rulings docs. |

🪤 **FOUR FILES GET CONFUSED FOR EACH OTHER. THEY ARE NOT THE SAME THING** (eval 168):

| file | what it holds | dishes |
|---|---|---|
| `scripts/fixtures/caches/*.raw.json` | **the model's ANSWERS.** What GPT guessed. Free to re-grade. | **68** |
| `scripts/fixtures/unweighted-oracle.json` | **the RIGHT answers**, hand-ruled. The unweighted **/684**. | **57** |
| `scripts/fixtures/macro-oracle.json` | the right answers for **printed-weight** dishes. The separate **/96**. | **8** |
| `scripts/fixtures/*.expected.json` | **STAGE 1 ONLY** — did we read the right item NAMES off the photo. **No macros at all.** | n/a |

**65 dishes in the whole project have hand-checked macros.** 68 dishes have the model's guesses, and
after round 2 all but a handful are ruled — the 8 unruled were **retired as unanswerable** (their menu
line is only a name), not left as a to-do.

⚠️ **`unweighted-oracle.json` is GENERATED — never hand-edit it.** Add a `Draft` to
`scripts/unweighted-oracle-build.ts` and re-run it; `deriveBands()` does the arithmetic. **Put the
derivation in the `assumed` STRING, not a code comment** — comments never reach the JSON, which is
what a future session re-derives from.
| **band** | The pass window for one number. Not a single value — a range. A macro **passes** if the app's answer lands inside the band. Currently **the average dish ±20%**, plus a small-miss allowance (6 g for a macro, 50 kcal). |
| **draw** | One repeat of the exact same question. The model is not deterministic, so every dish is asked **3 times** and all 3 are scored. |
| **harness** | The script that runs a benchmark and prints a score. `bench-unweighted.ts` (no-weight dishes), `bench-mixed-menu.ts` and `bench-macros.ts` (printed-weight dishes). |
| **arm** | **A variant of the pipeline being tested** — one changed thing (a prompt sentence, a schema field, a different batching) run through the harness so its score can be compared. Think "experimental condition". Arms are named: `baseline`, `dual`, `P`, `A`, `S3`… |
| **replay** | Re-scoring **saved** model answers instead of buying new ones. Costs **$0** and calls no API. This is why a corrected oracle re-grades all of history for free. |
| **ledger** | `docs/superpowers/extraction-iteration-ledger.md` — **the logbook**. One numbered entry ("eval 158") per experiment, newest last, recording what was tried, what it scored, and what it cost. **It is the memory of this project.** Currently at eval 158. |

### The three arms that matter right now

| arm | what it actually is | score |
|---|---|---|
| **`baseline`** | The pipeline **before** the dual pass — one call per batch of 10 mixed items. The "do nothing" control. | **60/108** |
| **`dual`** | **What is deployed today (v32).** Stage 2 runs *twice*: pass 1 sends the whole menu (its answers used for dishes that print a weight); pass 2 re-sends only the no-weight dishes, in their own batches, with one extra sentence. | **67/108** ← best |
| **`Arm A`** | Asks the model for the dish's **total grams** (`typical_total_g`, a required schema field), then rescales every ingredient to that total. | **36/108** ☠️ rejected twice |
| **`ORDER` / `ORDER-nopush` / `PIECE`** | Change what the per-ingredient GRAM FIELD asks for: `typical_serving_g` (a label serving) → grams **in one order as sold**, or grams **per piece x `serving_pieces`**. No total asked, nothing rescaled. | **61 / 65 / 60** ☠️ all rejected, eval 159 — **and they SIZED BETTER than the winner** |
| **`NOPUSH`** | Deletes pass 2's whole addendum — **both** the restraint half AND the push half. Shipped gram ask, shipped schema. | **57/108** ☠️ rejected, eval 160 — **and it does NOT test what its name says.** Re-measured on the widened 21-dish oracle (eval 167): **145/252**, same rank, still rejected. |
| **`NOBOOST`** | Deletes **only the push half** of pass 2's addendum; keeps the restraint. Shipped gram ask, shipped schema, shipped key. One clause of diff. | **70–72/108** vs the control's **64–67** on 9 dishes; **149–150/252** vs **131–139** on 21 (eval 167). On 57 dishes: **386/684** against `dual`'s 352, +41.5, CI **−1.5 to +87.5**, ahead in 97.1% of resamples. The small-plate pattern replicated out-of-sample (+0.97/dish <250g, −0.21/dish ≥250g, n=22/35). ⚠️ **eval 169 marked this REJECTED via a "pre-committed deploy rule" that was NEVER SANTIAGO'S — that rule is VOID (eval 171), so the rejection is WITHDRAWN and the honest status is UNRESOLVED (the CI includes zero).** It is nevertheless superseded on arithmetic: `HYBRID(300)` reads 415 to its 396. Do not ship it; do not cite it as "rejected" either. |
| 🟢 **`HYBRID(T)`** | **Not a prompt or schema change — a ROUTER.** Per dish: use `NOBOOST`'s answer when `NOBOOST`'s OWN plate mass is under T g, else keep `dual`. Reads only the model's output, never the oracle, so it can ship. 🟢 **PAID AND CONFIRMED AT THE 4-RUN BAR (eval 173): 394/408/410/419 vs `dual`'s 352/357 — DISJOINT RANGES, worst run +37 over `dual`'s best**, mean 407.8 vs 354.5. Eval 172's single run: +56.0, CI +7.0 to +113.0, excludes zero; +63.0 pizzas-dropped. The $0 replay that predicted it read 415 and +50 with T chosen leave-one-menu-out, so batch composition did NOT eat the gain. **Deploy-eligible on the repo's own rule; deploying is Santiago's call.** evals 171–173 |
| **`ROLE`** | `NOBOOST` + ONE required enum per ingredient (`body│filling│topping│garnish`) inserted immediately BEFORE the gram field. Schema only — no sentence explains it, nothing reads it. | **58/108** ☠️ rejected, eval 163 — **the enum FIRED (labels varied, body's median gram 3.3× filling's) and lost anyway.** Re-measured on 21 dishes (eval 167): **137/252**, still rejected. |
| **`MASSCALL`** | `NOBOOST`'s recipe rescaled to a plate total from a SECOND call that sees only name + description. Reuses Arm C's plate prompt verbatim. | **50/108** ☠️ rejected, eval 163 — **the bare mass question is a WORSE mass estimator than the ingredient list.** Re-measured on 21 dishes (eval 167): **118/252**, still last place. |

### ⚖️ THE TWO SCORES — NEVER MERGE THEM

The benchmark is split because the product is split.

| | what it covers | how common | denominator | where we are |
|---|---|---|---|---|
| **weighted** | dishes whose menu **prints a gram weight** ("Ribeye 300gr") | ~33% of real items | **/96** | **6–9 failed ≈ 82–94%** — genuinely good |
| **unweighted** | dishes printing **no weight** at all | **~67% of real items** | **/684** (widened 108→252 eval 167, then 252→684 eval 169, 2026-08-22) | **`dual` 352/684 ≈ 51%** — the unfinished half. A "/108" or "/252" figure predates the eval-169 widening. |

**The unweighted half is the whole problem.** It is most of a real menu and it is the weaker number.

### Where we are, in one line

**Production is edge function `analyze-menu` v32, deployed 2026-08-19.** Everything since has been
measurement and failed experiments. **Nothing DEPLOYED has beaten v32.**

🟢 **EVAL 173: `HYBRID(300)` HAS CLEARED THE 4-RUN BAR — 394/408/410/419 against `dual`'s 352/357.
THE RANGES DO NOT OVERLAP; its WORST run is +37 over `dual`'s BEST.** Route each dish to `NOBOOST`'s
sizing when `NOBOOST`'s OWN plate mass is under 300 g, else re-ask the shipped question. Mean 407.8
(sd 10.3) vs 354.5, i.e. **+53**. Eval 172's single run also passed the repo's significance script
(+56.0, 95% CI +7.0 to +113.0, excludes zero; **+63.0 with the 14 pizzas dropped**, so it does not
ride the correlated cluster) — but **the disjoint ranges are the stronger claim**, since that CI came
within 7 points of zero. **The first arm this phase that is better than what ships.**
⚠️ `dual` has only 2 runs; overlapping would need a `dual` run of 395+, i.e. +38 over its own best
against the 5-point spread its two runs show. Arm is `HYBRID` in `bench-unweighted.ts`; 60 archives
exist (`--run r2/r3/r4`), so every figure re-derives at $0.
⚠️ **38 of 57 dishes do not score identically run to run, so a user rescanning one menu can get a
different answer.** True of `dual` too and unaddressed by every arm so far — its own open problem.

🔴 **BUT READ ③ OF EVAL 172 BEFORE BUILDING ON IT: THE MODEL IS NOT DETERMINISTIC, AND A GRAM
THRESHOLD IS THE WEAKEST POSSIBLE HINGE.** Two runs of an IDENTICAL arm differ on **45% (`dual`) to
57% (`NOBOOST`) of dish-draws**, mean mass drift 9–20 g, max 110 g, ingredient COUNT changing on 56
of 171 — despite `temperature: 0` and `seed: 17` (`enrich.ts:258` calls that "run-to-run stability";
it is optimistic). 37% of NOBOOST answers sit within 50 g of the 300 g line, so for a third of the menu the routing
decision is settled by noise — ⚠️ but ~~this makes those dishes the unstable ones~~ is **FALSIFIED by
eval 173 ②**: near-threshold dishes swing 1.32 pts against 1.54 for the rest, r = −0.147. The churn is
GENERAL DRIFT, not the hinge. **Do not argue for dish-form work on stability grounds.**
🟢 **THE BAR IS NOW MET (eval 173): `HYBRID` ran 4 × 3 draws at 394/408/410/419 against `dual`'s
352/357 — the ranges DO NOT OVERLAP, worst `HYBRID` run +37 over best `dual` run.** It is the first
arm this phase that is better than what ships. Deploying is Santiago's call, not an automatic rule.
🪤 **A diff between two paid archives CANNOT distinguish a mechanism from drift** — an after-the-fact
archive diff made `HYBRID` look badly broken when it was not. Log a router's decision during the run.

⚠️ **There is still NO numeric deployment bar anywhere in this repo** — "good enough to ship" has
never been written down as a number. 60% is the phase's biggest jump, not a finish line.

☠️ **THE "DEPLOY RULE" THAT KILLED `NOBOOST` WAS NEVER SANTIAGO'S — IT IS VOID (eval 171).** Eval 168
wrote it, eval 169 applied it "as agreed in advance", eval 170 called it closed; **no block carries
any attribution**, and asked directly Santiago said *"Don't remember saying that. Ignore it and
proceed as if it was never there."* 🪤 **A constraint with no named author is not a constraint —
grep for the user's sentence before letting a rule block work.** Consequences: `NOBOOST` reverts to
**unresolved** (+41.5, CI −1.5 to +87.5, includes zero), *not* rejected — though `HYBRID`'s 415 beats
its 396, so it is superseded on arithmetic anyway; and nothing blocks `HYBRID(300)`.

🎯 **THE NEXT LEVER, AND IT IS SANTIAGO'S OWN (2026-08-22): CLASSIFY THE DISH FORM, THEN SIZE IT FROM
THAT FORM'S AVERAGE.** ☠️ ~~A form is stable where a gram threshold is not~~ — **FALSIFIED, eval
173 ②: the wobble is general model drift, not the threshold (near-line dishes swing 1.32 pts vs 1.54
for the rest, r = −0.147). Argue this on the CEILING, never on stability.** $0 evidence over the 57 ruled
dishes: a form→average table puts mass in band on **40/57 (70%)** — **26/43 (60%)** excluding the
circular 14-pizza row — against the shipped model's **18/57 (32%)**. And mass is the big prize:
`sim-mass-ceiling.ts` reads **449/684 clamped into band, 516/684 at band midpoint** vs today's 352,
so mass alone is worth **+97 to +164**, two to three times `HYBRID`'s measured **+53** (4-run mean). ⚠️ That table was built
FROM the oracle — it proves form predicts mass, not that the table can be built without the answer
key (FNDDS is the real source, and real work). ☠️ `taco` scores 1/4, so the form must be finer than
the word; the 3/11 catch-all makes a fallback mandatory. 🔑 **This is NOT `MASSCALL`/`Arm A` again —
those asked the model for a GRAM NUMBER (50/108 and 36/108). This asks for a CATEGORY and supplies
the grams ourselves**, which is the distinction the scoreboard already rewards.

See evals 171–172 for every derivation.

### 🔑 THE 2026-08-21 FINDINGS THAT CHANGE WHAT TO TRY NEXT (evals 159 + 160)

**MASS AND COMPOSITION ARE NOT SEPARABLE LEVERS IN ONE MODEL CALL.** Three arms changed only what the
per-ingredient gram field ASKS for. All three **sized the plates better than the shipped pipeline**
(mass in band 21/27, 20/27, 18/27 against dual's 14/27 — TACO PORCO 218 g → 137 g against a 100–140
band) and **all three scored WORSE**, because the model silently re-reasoned each dish's per-100 g
composition too.

`scripts/sim-mass-composition-split.ts` ($0) prices each arm's MASS at each arm's COMPOSITION. Rows =
whose mass, columns = whose composition:

| | dual | ORDER | ORDER-nopush | PIECE |
|---|---|---|---|---|
| **dual** | **67** | 54 | 53 | 57 |
| **ORDER** | **73** | 61 | 63 | 68 |
| **ORDER-nopush** | **74** | 68 | 65 | 67 |
| **PIECE** | **72** | 65 | 65 | 60 |

🔑 **Every arm's sizing beats dual's (72–74 vs 67). Every arm's recipe loses to dual's (53–57 vs 67).**
The best cell — **dual's recipe at ORDER-nopush's sizing, 74/108, +7** — is the same size as dual's
entire gain over baseline. **That is an argument for asking size and recipe SEPARATELY, not for asking
the size question better.**
⚠️ **74 is a CEILING, not an arm** — it reads two archives bought separately, exactly like the
perfect-mass rows. Nobody has shown one call can hold its recipe steady while re-sizing.

🔴 **THIS RETIRES "PERFECT MASS = 98/108" AS A TARGET.** `sim-mass-ceiling.ts` rescales mass while
HOLDING COMPOSITION FIXED, which no arm can do. The ceiling is real; it is not aimable at.

🟢 **THE PUSH SENTENCE WAS THE LEAD, AND EVAL 160 CASHED IT — `NOBOOST` 70/108, THE FIRST ARM EVER TO
BEAT THE SHIPPED PIPELINE.** Read the next block before touching that sentence.

⚠️ **THE MODEL ROUNDS EITHER WAY, so none of this cleanly tests "reference serving vs plate share".**
20/30/50/100 accounts for **71%** of dual's gram answers and **71 / 68 / 64%** of the three arms'.
Only the numbers it snaps TO got smaller. Re-derive with `sim-gram-distribution.ts`.

### 🟢 EVAL 160: THE PASS-2 SENTENCE IS TWO OPPOSED HALVES, AND WE HAD BEEN DELETING BOTH

`ENRICH_PROMPT_UNWEIGHTED`'s addendum (`enrich.ts:106-107`) is **ONE sentence holding TWO OPPOSED
HALVES, split by a colon**:

| half | text | direction |
|---|---|---|
| **A — restraint** | *"...the amount actually present in one order of this item as it is served, **rather than the amount that ingredient is served in on its own**"* | holds ingredients **DOWN** |
| **B — the push** | *": a component that forms the body ... **considerably greater quantity** than a standalone serving ... understates the item."* | pushes ingredients **UP** |

Half A is the **only** restraint in the shipped prompt — the shipped gram ask is for a nutrition-LABEL
serving. Delete A and every ingredient reverts to a standalone portion.

| arm | deletes | score | mass in band /27 |
|---|---|---|---|
| `dual` (shipped v32) | — | **67** | 14 |
| `NOPUSH` | **A and B** | **57** ☠️ −10 | 14 (12 OVER: TACO PORCO 348 g, Salmón Roll 477 g) |
| `NOBOOST` | **B only** | **70** 🟢 **+3** | **17 — best of any arm** (TACO PORCO 225 g → 135 g, in band) |

🔑 **THIS RECONCILES `ORDER-nopush` +4 WITH `NOPUSH` −10 — the same deletion, opposite signs.**
`ORDER_ASK` carries its own restraint, so there the deletion dropped only *redundant* push. Restraint
nowhere else → **−10**. Restraint also in the gram ask → **+4**. Half B was written when dishes read
too SMALL; on today's ruler 12 of 27 dish-draws come back OVER.

🎯 **THE BEST CELL IN THE PROJECT IS NOW 74–77/108** — `NOBOOST`'s sizing at `dual`'s recipe, over its
two runs, beating eval 159's 74. Re-derive:
`deno run --allow-read scripts/sim-mass-composition-split.ts dual NOPUSH NOBOOST NOBOOST@r2`.
⚠️ Still a CEILING, not an arm.

✅ **REPEATED (eval 161): the range is 70, 72 — BOTH runs above the shipped 67.** `--run <label>` is
now ported to `bench-unweighted.ts`, so a repeat no longer overwrites its predecessor, and both `$0`
sims accept **`ARM@label`** (`NOBOOST@r2`). Two effects are stable across both runs and are the whole
gain: **TACO PORCO 0 → 6/11** (its plate lands in the 100–140 band once the push is gone) and
**CAPRICCIOSA 8 → 3/5** (the only genuinely large plate in the set, band 400–450 — the one dish the
push was helping). Per-dish swings of ±5 between runs are normal; the total is not.
✅ **THE CONTROL'S RANGE ARRIVED (eval 162): `dual --run r2` = 64, so the control is 64–67 and
`NOBOOST` is 70–72. THE RANGES ARE DISJOINT** — the worst `NOBOOST` run beats the best `dual` run by 3,
mean +5.5. First change since the dual pass to clear its control on a range rather than a point.
🔴 **OPEN DECISION FOR SANTIAGO: deploy it?** One clause, and `ENRICH_PROMPT_UNWEIGHTED` is used ONLY
in pass 2 — pass 1 stays byte-identical, so the weighted 82–94% cannot move.

✅ **OMELETTE CUBANA IS DIAGNOSED AND IT IS NOT A SIZING BUG.** Frozen at exactly 3/12 in all four
eval-159 arms because each prices the **four named fillings** at a flat 20–30 g — chorizo/ham/bacon/
cheese = **100–120 g against a ruled 53 g** — while getting eggs (110) and onion/pepper (20/20) right.
Keep the model's OWN per-100 g recipe and swap in only the oracle's ruled grams: **OMELETTE 1/4 → 4/4
PASS and TACO PORCO 0/4 → 4/4 PASS**, under both `dual` and `ORDER`. **Composition is entirely correct;
100% of the loss is per-ingredient gram sizing.** The needed correction (30 → 8–15 g) is BELOW the
model's granularity for a named meat or cheese: across 140 answers `15 g` appears **once**, `8 g`
**never**. That is Santiago's ruling #1 (*virutas* = shavings = 5 g) broken four times in one dish.

### 🔴 EVAL 162: THE FILLING FRAMING IS THE WRONG TARGET — IT IS WHOLE-PLATE SIZE, IN BOTH DIRECTIONS

Split each dish's error into **SIZE** (model mass / ruled mass) and **MIX** (model density / ruled
density), 3-draw averages, `dual`:

| dish | size × | mix × | | dish | size × | mix × |
|---|---|---|---|---|---|---|
| Salmón Roll | **0.65** | 1.20 | | PAPAS FRITAS | 0.97 | 1.04 |
| CARBONARA | **0.80** | 1.10 | | BROWNIE | 1.20 | 0.92 |
| TIRAS DE POLLO | 0.88 | 0.90 | | ENSALADA GRIEGA | 1.28 | 0.99 |
| CAPRICCIOSA | 0.89 | 0.88 | | **OMELETTE CUBANA** | **1.28** | 1.14 |

🔑 **MIX error never exceeds ±20%. SIZE error runs 0.65–1.30, in BOTH directions.** A mechanism that
shrinks non-body ingredients helps OMELETTE and ENSALADA while pushing CARBONARA and Salmón Roll —
already 20–35% UNDER — further under. `sim-mass-ceiling.ts` settles it: a **uniform** rescale to the band
midpoint takes **OMELETTE 3/12 → 12/12** and TACO PORCO 0 → 12. **The dish that motivated the filling
hypothesis is fixed by plate mass alone.** Mass-lever value is **~74–80** ("anywhere in band" = 80);
98 needs band midpoints and stays retired.

✅ **THE OMELETTE ORACLE RE-CHECK IS DONE (eval 158 flagged it, eval 162 closed it). NO CHANGE
WARRANTED — the oracle is corroborated, the model is the error.** FNDDS's largest published portion for
a cheese-and-meat omelette is **170 g, exactly the bottom of our 170–230 band**; a single fried egg is
55 g, confirming the ruled 2×55; and all three per-100 g rows (FNDDS composite, our recipe, the model)
agree within ~10%, so composition was never in dispute. **The model's 280 g is 1.65× FNDDS's largest
portion.** ⚠️ The price ladder on that menu was deliberately NOT used — price is not evidence of grams.

### ❓ "Why haven't we deployed anything?"

**Because nothing has been good enough to deploy.** Deployment is not blocked, gated, or waiting on
approval — **there is simply no improvement to ship.** v32 was the last thing that beat what preceded
it. Every arm tried since has scored **worse than what already runs**:

| tried since v32 | result |
|---|---|
| accompaniment weight correction | falsified at $0 — makes it worse |
| lift lean dishes via fat | falsified at $0 — makes it worse |
| Arm A (plate total), re-run 2026-08-21 | **36/108 vs the shipped 67/108** |
| ORDER / ORDER-nopush / PIECE (what the gram field asks) | **61 / 65 / 60 vs 67** — better mass, worse recipe |
| NOPUSH (delete pass 2's whole addendum) | **57/108 vs 67** — rejected |
| **NOBOOST (delete only the addendum's PUSH half)** | **70–72 vs 64–67** on 9 dishes; **149–150 vs 131–139 /252** on 21 (eval 167). Eval 164's *"all of it is TACO PORCO"* is **RETRACTED**. Eval 168: it is a **SMALL-PLATE mechanism** — +0.74/dish under 250 g, −0.15/dish at or above. CI still includes zero |
| ROLE (an inert role enum before the gram field) | **58 vs NOBOOST's 70–72** — rejected, eval 163 |
| MASSCALL (plate total from its own separate call) | **50 vs NOBOOST's 70–72** — rejected, eval 163 |
| global calibration — invert the mass compression with one fitted line (eval 171) | **223/684 leave-one-MENU-out vs 352** ☠️ the slope does not transfer between cuisines |
| piecewise shrink keyed on the model's own mass (eval 171) | **314–352 LOMO** ☠️ never beats doing nothing |
| 🟢 **HYBRID(T) — route each dish between `dual` and `NOBOOST` on the model's OWN plate mass** (eval 171) | **415/684 vs 355**, +60.0, CI **+23.5 to +102.5 (excludes zero)**, 100% of resamples, stable across runs, survives dropping the 14 pizzas, LOMO-chosen T still +50. **The first candidate, awaiting a paid confirmation** |

Every arm above the HYBRID row would make the app **less** accurate. **HYBRID is the first exception
since v32** — and it is a replay, not a purchase, so it is a candidate rather than a result.

### 🎯 Where this sits in the actual product

This is **one workstream inside Phase 9** of `docs/sunny-lemon-development-plan.md` (16 phases,
bootstrap → launch). Phases 10–16 — paywall, onboarding, analytics, security audit, screenshots,
launch — are **all downstream of it**. So macro accuracy is the thing standing between the app and the
launch runway.

⚠️ **Santiago's standing fallback, kept open deliberately:** if the unweighted half stalls for weeks,
**ship the weighted half honestly** — it is genuinely good — and say plainly in the UI that no-weight
items are rough estimates. That is a real option, not a failure.

### 🔴 WHY THE 2026-08-21 SESSION KEPT BEING WRONG — read this before you repeat it

Four wrong things surfaced in one day. **They were not four separate mistakes; they were two habits.**
Full write-ups are **lessons 31–34** in ②'s "Lessons learned".

**Habit 1 — describing an artifact without opening it (lesson 31).** Three wrong claims, each one
file-read from being right:

| the claim | the reality | what it nearly cost |
|---|---|---|
| "Arm A was just a prompt ask, so schema-forcing size is untried" | Arm A is **already** prompt + a required `typical_total_g` field | designing a **duplicate of a twice-rejected arm** |
| TACO PORCO "is garnish inflation", with a gram breakdown | those grams came from the **`baseline`** archive, not the shipped `dual`; in `dual` the peanuts are *under*-sized and the error is uniform | an arm aimed at **a mechanism that does not exist** |
| "blast radius is one menu of ten" | checked one harness's archive map; the other uses a **different** family | conclusion held **by luck** |

**Habit 2 — trusting a measurement without checking what it measured (lessons 32–34).** A loader that
read 1 of 2 archive parts, three sims hardcoding 3 of 5 menus, and a guard that *printed* its invariant
instead of enforcing it. Each silently reported a **smaller, wrong number that looked fine**, and one
of them had parked the single largest available lever in a "DO NOT RE-OPEN" table.

🔑 **THE ONE-LINE ANTIDOTE: before writing a number or a claim, open the thing it came from — and ask
what the measurement EXCLUDED, not just what it reported.** A partial measurement never announces
itself.

✅ **What went right, and it is the reusable part:** Santiago demanded a **$0.55 control run** instead
of accepting the argument for why a rejected arm would work now. **The control falsified the plan
before a line of it was built.** When a past failure is claimed to no longer apply, re-run it.

---

## 1. What am I supposed to be working on?

There are **two roadmaps, nested** — the product one, and an extraction sub-roadmap inside it.
Read them in this order and the ambiguity disappears:

**① `docs/sunny-lemon-development-plan.md` — THE PRODUCT ROADMAP.** 16 phases, bootstrap →
launch. Its §0 convention: find the lowest-numbered unchecked sub-phase and **confirm with
Santiago before starting**. Its statuses were reconciled against the real codebase on 2026-08-06
— read its PROVENANCE header first, because the file predates this repo and its original commit
hashes belong to an archived project.

**② `docs/superpowers/plans/2026-07-04-ocr-extraction-master-roadmap.md` → the `🎯 CURRENT PHASE`
block.** This is **extraction quality only** — one workstream, sitting inside Phase 9 of ①. It is
the single source of truth for what is active *within extraction*, and the only place that is
written down.

Which one applies: **product/UI/feature work → ①. Extraction accuracy, prompts, evals, oracles,
the edge function → ②.** If a phase or priority is asserted anywhere other than these two blocks,
it is stale — fix it or ignore it, never believe it. The active Stage-2 macro handoff below is
the explicit exception: it is the bounded Phase-9 workstream record, not a competing roadmap.

**Stage-2 macro enrichment IS THE ACTIVE WORK. → Start at the `🆕 2026-08-20 HANDOFF` block
below; it is written so a zero-context session can take over from it alone.** Everything between here
and that block is older context that it supersedes where they disagree. Phase spend to date:
**~$38.5** (~$2.52 to 2026-08-09, ~$19 on 2026-08-12, ~$6 on 2026-08-13, ~$5.5 on 2026-08-16,
~$5.2 on 2026-08-19; **~$2.8 on 2026-08-20/21**, evals 157–158).
ℹ️ Pre-existing and left alone: the itemised figures sum to ~$41, not the running total. The running
total is the number that has been carried forward; treat both as approximate.

📄 **Prefer a page to a wall of markdown? `docs/superpowers/how-testing-works.html`** explains the
whole measurement setup in plain language, with a glossary of every term this phase uses.

🔴 **BEFORE YOU COMPARE ANY UNWEIGHTED NUMBER: the scoring rule and the dish count BOTH changed on
2026-08-20.** Bands are now the average dish ±20% (they used to inherit the mass range's width,
±6% to ±29%, unchosen), a miss under 6 g / 50 kcal also passes, and the set is **9 dishes, not 6**.
**A score from before that date is not comparable to one after it** — re-score both arms first.

🚀 **LIVE NOW: edge function `analyze-menu` v32, deployed 2026-08-19 (Santiago authorised).**
**v32 = v31 + the DUAL PASS + pass 2's SYSTEM envelope.** Unweighted dishes went **25 → 35–36/72**;
weighted dishes are unchanged (**14–17/96** vs a fresh **15/96** control) because pass 1's request body
is byte-identical (5491 bytes, verified). Stage 2 is **1.56–1.92× slower**, ~$0.03 → ~$0.05 per scan.
Full detail: the 2026-08-19 handoff block, now superseded by the 2026-08-20 one. **Rollback to v31:**
```bash
git checkout dbf3f79 -- supabase/functions/analyze-menu/ && \
  supabase functions deploy analyze-menu --project-ref uonuiadueykynbetxxrw
```
✅ **`main` now contains it** — PRs #18 → #17 → `main` merged 2026-08-19, and `main`'s
`supabase/functions/analyze-menu/` byte-matches what is deployed.

History — **v31, deployed 2026-08-16**, superseded by the above.
**v31 = v30 + the two ZEROING BUG FIXES, and nothing else.** Verified before shipping: the delta
against v30 is `enrich.ts` + its tests only — `ENRICH_PROMPT`, `ENRICH_SCHEMA_OPENAI`, the model pin
and `ENRICH_BATCH_SIZE = 10` are all byte-identical, so **macro accuracy is unchanged by design**
and no re-baseline is owed. 212 edge-function tests pass, 0 failed.
What it fixes: a dropped batch item and a 120 s timeout both used to reach `fallbackEnriched` and
show the user **0 kcal** (Polloteria lost 16 of 95 items). `enrichBatchWithRetry` now re-asks for
only the missing items in batches of 3, plus `MAX_CONCURRENT_BATCHES = 5`.
**Rollback = `git checkout abe5e12 -- supabase/functions/analyze-menu/ && supabase functions deploy
analyze-menu --project-ref uonuiadueykynbetxxrw`.**

History — **v30, deployed 2026-08-11**, superseded by the above. It is
`macro-best-v8` **plus the forced `serving_pieces` field** (this branch). Measured before shipping:
**0–3/96 at 12.0–12.5%** against v29's **2–3/96 at 14.3–14.5%**, 4 runs × 3 draws, two runs perfect.
Model pin unchanged. Smoke-tested live: printed weights read, stated counts honoured, allergens
present. **Rollback (HISTORICAL — v30 is two versions behind; the live rollback is the v32 one above):**
```bash
git checkout ce91e91 -- supabase/functions/analyze-menu/ && \
  supabase functions deploy analyze-menu --project-ref uonuiadueykynbetxxrw
```
⚠️ This used to read *"deploy from `origin/main`"*, which is not an executable instruction: **`supabase
functions deploy` uploads the WORKING DIRECTORY**, so the pinned code has to be checked out first.
Every rollback line in these docs takes the `git checkout <sha> -- <path> && deploy` form for that
reason.

⚠️ **The piece count only HALF works.** Sushi rolls get 8 (32 of 42), stated counts are honoured, and
every single-plate dish correctly gets 1 — but **all 26 Bistro pizzas got 1**, so the pizza case that
motivated the feature still fails. The MACRO gain is what justified the deploy; the stepper gain is
partial.

⚠️ **The app has NOT shipped the matching label.** `portions.ts` draws a count as a plain number
(`10`) on this branch, but that is app code: until TestFlight **build 7**, build 6 draws a counted
item as `3/8` / `all`. Working, not the intended form.

---

## 🆕 2026-08-20 HANDOFF — A ZERO-CONTEXT SESSION CAN TAKE OVER FROM THIS BLOCK ALONE

📄 **Read this first if you want the whole measurement setup in plain language:**
`docs/superpowers/how-testing-works.html` — what the app does, why there are two scores, how an oracle
dish is built, how a pass is decided, and a glossary of every term used in this phase. Written for
Santiago and for a cold session. Open it in a browser.

### ✅ THAT RUN IS DONE (2026-08-20, eval 157, ~$2.2). THE 9-DISH SCORE EXISTS.

**`dual` (shipped, v32) 67/108 = 62%. `baseline` (pre-dual) 60/108 = 56%. Gap +7.**
Both arms, all 9 dishes, 3 draws, same ruler, same day. Re-derive with
`scripts/bench-unweighted.ts 3 <dual|baseline> --replay`.

🔑 **READ THE GAP'S DECOMPOSITION, NOT THE HEADLINE — THE BAR HAS NOT GONE SOFT.** On the seven dishes
that existed before that day the gap is **+11**, matching the +11/+12 measured earlier the same day.
The headline fell to +7 because the two NEW dishes contribute **−4**, all of it BROWNIE (baseline 12,
dual 8). **That is dual genuinely losing a dessert, not a ruler that stopped discriminating.**

### ✅ ROUND-1 WIDENING, eval 167 — 9 → 21 DISHES. ⚠️ SUPERSEDED: THE ORACLE IS NOW **57** (eval 169)

**All four $0 steps from the 2026-08-22 rulings are complete.** Full detail, the two decisions
Santiago ruled, and the FDC-verification findings are in eval 167 of
`docs/superpowers/extraction-iteration-ledger.md`. The rulings themselves are still in
`docs/superpowers/specs/2026-08-22-oracle-widening-rulings.md` for the per-ingredient grams and FDC
citations; `scripts/fixtures/unweighted-oracle.json` now holds all 21 dishes as scoring data.

**The gate passed on all 7 archives** — the pre-existing 9 dishes score IDENTICALLY on the widened
oracle as they did before it (`dual` 67, `dual@r2` 64, `NOBOOST` 70, `NOBOOST@r2` 72, `ROLE` 58,
`MASSCALL` 50, `NOPUSH` 57 — all exact matches). The harness derives its dish/menu list from the
oracle itself, so this was a real test.

🔑 **THE QUESTION THIS PHASE WAS STUCK ON HAS AN ANSWER: NOBOOST's advantage is broader than one
dish, but still not statistically resolved.** On the widened 21-dish oracle (/252): `dual` 139/131,
`NOBOOST` 149/150 — observed gap **+14.5** (was +5.5 on 9 dishes). 95% CI **−5.5 to +37.5** (still
includes zero) but NOBOOST now leads in **90.5%** of resamples (was 69.7%), and — the part that
reverses eval 164 — **leave-one-dish-out no longer flips the sign**: remove TACO PORCO and the
effect is still **+6.5**, not −2.5. The gain is now spread across TACO EL CAPRICHO, OMELETTE LAMERA
and ALFREDO PORTOBELLO rather than riding on TACO PORCO alone. **Not yet a confirmed improvement —
the CI still includes zero — but "it's all one dish" is retracted.**

### 🔴 EVAL 169: NOBOOST IS REJECTED. THE ORACLE IS NOW 57 DISHES (2026-08-22, $0)

The round-2 spec is fully executed and the pre-registered analysis is run. Full detail in eval 169
of the ledger; per-dish rulings in `docs/superpowers/specs/2026-08-22-oracle-widening-round-2-rulings.md`.
**No API spend. Production still v32.**

**Dish count: 21 → 57** (44 proposed, 8 retired as unanswerable, 36 written — not the 65/52
originally projected; the answerability test split individually, not as a block).

🔑 **① THE PRE-REGISTERED PREDICTION WAS WRONG.** Eval 168 predicted "+14.5 shrinks toward zero" on
the wider oracle. It did not: **+14.5/252 (5.75% of scale) → +41.5/684 (6.07% of scale)** — the gap
held essentially flat. Confidence tightened (NOBOOST ahead in 90.8% → **97.1%** of resamples) even
though the raw 95% CI still straddles zero (−1.5 to +87.5) and is technically unresolved at 57
dishes. Leave-one-out is robust — no single new dish drives it.

🔑 **② THE SMALL-PLATE PATTERN REPLICATED OUT-OF-SAMPLE.** The 250 g line was fixed in eval 168
*before* these 36 dishes existed. On the new, independent split: **+0.970/dish on 22 plates <250 g,
−0.214/dish on 35 plates ≥250 g** — matching eval 168's 9-vs-12-dish pattern (+0.74/−0.15) almost
exactly, now on a 57-dish set. This is no longer a pattern that might be noise.

🟢 **③ DROPPING THE 14 CORRELATED PIZZA DISHES MAKES ① RESOLVABLE (+61.5/516, CI +25.5 to +102.0,
excludes zero) — this corroborates ②, it does not overturn the deploy rule.** The 14 pizzas are all
≥250 g; removing them removes real "big plate, NOBOOST loses" signal at the same time it removes
correlated-cluster noise. Both are true at once.

🟢 **④ FREE SECONDARY: `dual` vs `baseline` no longer disagrees across metrics.** At 21 dishes band
and log-ratio pointed opposite directions; at 53 dishes (`baseline`'s archive is missing 4 of the
newest dishes) both agree `dual` wins, both resolvably (CI excludes zero on each). Independent
confirmation of the already-shipped choice, unrelated to the NOBOOST question.

🔴 ~~**DEPLOY RULE FIRED, AS AGREED IN ADVANCE:** NOBOOST is positive overall (①) **and** negative on
plates ≥250 g (②) → **it does NOT ship.** Confirmed with an out-of-sample replication, not a
projection — this is not "maybe with more dishes," it is closed.~~
☠️ **STRUCK OUT 2026-08-22 (eval 171): the rule was NEVER SANTIAGO'S.** No block in eval 168 or 169
attributes it to him, and asked directly he said *"Don't remember saying that. Ignore it and proceed
as if it was never there."* **`NOBOOST` is therefore UNRESOLVED, not rejected** (+41.5, CI −1.5 to
+87.5). The measurements ① and ② above are sound and stand; only the VERDICT drawn from them is
withdrawn. 🪤 **A constraint with no named author is not a constraint.**

⛔ **NEXT ACTION: this line of investigation is closed.** `NOBOOST`, `NOPUSH`, `ROLE` and `MASSCALL`
are ALL now rejected on re-measurement — do not re-open any of them without new evidence. The
Stage-2 benchmark's open question (is there ANY prompt/schema change that beats `dual`) is still
open. Two untested hypotheses and two Stage-1 (not Stage-2) fixes are on record below this block —
none is designed yet. **Use `superpowers:brainstorming` before designing the next arm.**

### ✅ EVAL 170: THE ORACLE WAS AUDITED AND HOLDS. THE VERDICT ABOVE IS UNCHANGED (2026-08-22, $0)

Santiago asked for an audit of the four entries that move the NOBOOST comparison most
(`TACO BRASERO`, `TACO TRADICIONAL`, `TOSTA ATUM`, `TOSTA BRASIL`). **All four are sound.** Every
composition reconciles exactly from real FDC records at the stated grams, and the MASSES are sourced
too — which was the real question, since NOBOOST is a sizing mechanism:

- **55 g meat** is the figure Santiago already approved on `TACO EL CAPRICHO`; **28 g corn tortilla
  is a PUBLISHED FNDDS portion**. Both tacos are `83 g` **by necessity** — EL CAPRICHO is 128 g =
  that same 83 g + 25 g Monterey + 20 g lettuce, and neither new taco names cheese or lettuce, so
  the assumed-ingredient rule removes exactly that 45 g.
- **13 g tostada shell** vs `167525`'s published **12.3 g/piece**; both tostada totals sit inside the
  **122–420 g** range `2708508` publishes for a loaded tostada.

**22 `assumed` fields were backfilled** so the oracle self-documents again (round 1 cited an FDC id
in 21/21 entries; round 2 was 14/36, now **36/36** — the derivations had been written as
build-script COMMENTS, which never reach `unweighted-oracle.json`). Proven documentation-only, not
asserted: the regenerated diff touches `assumed` on exactly 22 entries and **no `band`,
`mass_band_g` or `composition` anywhere**; `dual` **352/684**, `NOBOOST` **386/684**, the **+41.5**
gap and the size split (r **−0.640**) are all unmoved.

⚖️ **`TOSTA ATUM`'s tuna variant was ruled BY THE AGENT, not by Santiago**, who declined the ruling
and delegated it explicitly. Raw (`2706308`) is kept, so no band moved.

🪤 **TWO NEW FDC TRAPS — both cost real time, both now in the round-2 rulings doc header:**
1. **A detail-endpoint 404 means NOTHING until `foods/search` has also failed.** `2705827` "Beef,
   steak, flank" 404'd **four times** while search returns it instantly. Without the fallback the
   audit would have reported a broken citation on `TACO EL CAPRICHO`, an entry Santiago approved in
   round 1. (Eval 167's "retry" rule is necessary but **not sufficient**.)
2. ☠️ **`Fish, tuna, NFS` is BYTE-IDENTICAL to `Fish, tuna, canned`** — FNDDS's "not further
   specified" defaults to the tin. **NFS is not a safe neutral middle option**; check any NFS cell
   against its canned/prepared siblings first.

⚠️ **A PROCESS LESSON, PAID FOR TWICE THIS SESSION: THE BRANCH CAN MOVE UNDER YOU.** Commit
`62d1f65` landed **16 minutes after** `6dcb258` and fixed both a real MEDITERRÁNEA arithmetic error
(11 ingredients sum to 380 g not 400 g; band `[340,460]` → `[325,435]`) and an eval-169 wording
defect — while a reviewer was mid-audit reporting that same defect off a stale `git log`.
**Re-check `HEAD` before reporting a fault in someone else's work.**

### 🔑 FOUND WHILE RULING: THE MENU PRINTS SIZES WE DISCARD. ⚠️ BOTH CASES ARE NOW RESOLVED — eval 171

🔍 **CASE 1 — the `28 CM`. ROOT CAUSE FOUND, AND THE FIX IS IN STAGE 1, NOT STAGE 2.** Traced
boundary by boundary: the Mistral OCR captures it (`# PIZZAS BISTRO\n\n28 CM`), the Mistral
extraction keeps it (`"section_title": "Pizzas Bistro (28 cm)"`), and the harness/plumbing pass
whatever they are given (`bench-pipeline.ts:67`, `enrich.ts:337`). **The loss is inside GPT-4o
extraction:** in `bistro.eval117-r1.raw.json` — the archive every eval reads — all 17 pizza items
carry `'PIZZAS BISTRO'` and the string `28` appears **nowhere in the response**. The cause is
`extract.ts:30` doing exactly what it says (*"copy the nearest printed **heading**"*, and
`extract.ts:37-39` requires a heading to *"group menu items beneath it"*) — `28 CM` groups nothing —
plus a six-field item schema with **nowhere to put a section-level portion note**.
⚠️ **This CORRECTS the note below and the eval-170 lead:** `section_title` does reach Stage 2, but
with the size already stripped, so a Stage-2 ask would buy nothing.
📉 **AND IT IS WORTH +12, NOT THE PHASE.** Clamping all 14 pizzas to perfect mass reads **352 → 364
/684**; they are already at 0.93× mean size, are the best-scoring class (65%), and fail on
COMPOSITION. Denominator: **1 of 9 archived menus and 1 of 58 sections** prints a size on a heading —
but that menu is 14 of 57 oracle dishes. 🔑 **The benchmark CANNOT see this fix's real value by
construction — all 14 pizza bands were ruled FROM the 28 cm the pipeline never receives.** Do it for
GENERALIZATION (a 30 cm and a 45 cm pizza are currently sized identically), not for points.
🟢 The Mistral path already captures it, so ruling 29's migration may close this for free.

☠️ **CASE 2 — the sibling weight is DISCARDED BY SANTIAGO (2026-08-22), not parked.** *"The goal is
precise macro enrichment of the plates no matter the siblings. This sibling strategy may worsen
things rather than improve because not all sibling menu items will be equal or of the same type."*
A sibling establishes a CATEGORY, not a PORTION — the same principle as the assumed-ingredient rule.
**Do not re-open.**

The original two cases, verified 2026-08-22, kept for the evidence:

| case | evidence |
|---|---|
| **"PIZZAS BISTRO — 28 CM"** | the size is on the SECTION header. **Zero of 26 bistro items carry "28" or "cm" anywhere** — not in `description`, not in `section_title`. **CAPRICCIOSA's oracle band was ruled from that 28 cm**, and it fails in every arm of this phase |
| **`CAMARÓN ROKA (200 g)`** | a printed weight on a SIBLING dish that establishes both the preparation and the portion for `DE CAMARÓN ROKA`, which prints nothing |

**Stage 2 sizes each item from its own text alone.** These are Stage 1 fixes and they supply
REAL information rather than redistributing a guess — unlike every prompt and schema arm tried
so far. Use `superpowers:systematic-debugging` first: "the size is dropped" is a symptom, and
it is not yet known whether the cause is the OCR, the Stage-1b prompt, or a schema with nowhere
to put a section-level note.

Two further Stage-1 gaps found in the same photo: **"*Al horno" dropped from ENSALADA BISTRO**
(a BAKED salad) and **"*Extracto de huevo" dropped from CARBONARA**. And `ALFREDO PORTOBELLO`
arrives tagged `section_title: "PIZZAS BISTRO"` — a pasta under the pizza heading, so the
section signal is not clean.

### 💡 TWO FUTURE-EVAL HYPOTHESES, PRIOR ART ALREADY CHECKED (2026-08-22)

Both are Santiago's, both recorded in full at the end of the rulings doc. Neither is designed.

1. **The menu SECTION as a portion prior.** `section_title` ALREADY reaches the Stage 2 request
   and neither the prompt nor the schema asks the model to use it. Denominator: only **211 of
   2102 items (10%)** sit under a heading that says anything about PORTION; ~90% carry DISH TYPE
   only — so it is a better dish-FORM prior than a starter/main flag. ☠️ **Trap:** our corpus
   holds both `ENTREES` (64 items, English = MAIN) and `entradas` (115, Spanish = STARTER).
   Opposite meanings, same root. A mechanism keyed on the word gets one language backwards.
2. **Ask in RECIPE UNITS, not grams** — "1 tbsp olive oil, 1/2 cup cheese". Untried: S asked in
   a sentence, S3 in `share_pct`, S4 in a second gram field, B16 in a share, B21 for the
   reference amount. 🟢 **$0 evidence it is a real mechanism:** over 561 ingredient answers,
   **59% are metric-round against 6% household-measure**, from a vocabulary of just **16
   distinct numbers** where five cover 79%. The model is snapping to a metric grid, not
   converting from a recipe. ⚠️ It needs a per-food DENSITY table (1 cup lettuce ~55 g, grated
   cheese ~113 g, oil ~218 g) — a single cups-to-grams constant would be worse than the grid it
   replaces. FNDDS publishes gram weights per household measure.

### 🛑 STILL TRUE AND STILL LOAD-BEARING — the measurement behind all of the above (eval 164)

⚠️ Only the NEXT ACTION in this block was superseded on 2026-08-22 (the rulings are now done).
**Every finding in it stands** as a description of the original 9-dish measurement. ⚠️ **Its
characterization of `NOBOOST` as merely "not yet confirmed" is ITSELF superseded — eval 169
(2026-08-22, 57 dishes) rejects it outright** via the pre-committed deploy rule. See the
🔴 EVAL 169 block above.

🛑 **THIS BENCHMARK CAN DETECT A DISASTER AND CANNOT DETECT AN IMPROVEMENT.** Measured, not
argued: `scripts/sim-arm-significance.ts` bootstraps the 9 DISHES (the real unit — 4 macros share one
mass error, 3 draws are repeated measures) and puts the noise band at roughly **±17 points on the /108
scale**. Every arm this phase rejected is outside it and those verdicts stand. Every arm it called a
win is inside it.

⚠️ **`NOBOOST` IS NOT A CONFIRMED IMPROVEMENT.** Its +5.5 has a 95% CI of −9 to +25, it leads in
only 69.7% of resamples, and **leave-one-dish-out reverses the sign: remove TACO PORCO and it is −2.5
over the remaining 8 dishes.** What it is measured to do is fix ONE dish (TACO PORCO 0 → 6) at a small
cost elsewhere. Deploying it is defensible only stated that way. Do not repeat "first arm to beat v32
on disjoint ranges" — that summary is retracted.

**So: no arm should be paid for until the dish set can resolve the effect it is looking for.** Going
from 9 dishes to ~30 would roughly halve the noise band; the external review puts "hundreds" as the
requirement for a 3-point effect. Widening needs Santiago's rulings, not model calls, and is mostly $0.
Build it with the safeguards the review named: ground truth from a source the model never sees, a RANGE
rather than a point, and a subset anchored to FNDDS so drift between our oracle and the world is
detectable.

**The strongest arm design waiting behind that blocker** is a RETRIEVED portion anchor (FNDDS / RACC /
SMAE) injected as a schema field immediately BEFORE the gram field. It is the one candidate that
carries information the model is not already producing — eval 164 measured the model deviating from
the RACC table in BOTH directions (pasta 180 vs 140, vegetables 30 vs 85 over 100 observations), so a
retrieved figure is new input, unlike S4's second gram field or B16's share question which were both
back-computed. It needs `superpowers:brainstorming` and Santiago's approval first.

**Retired at $0 by eval 164:** median-of-3 aggregation (+5, −1, +5, +4 across four arms — not
consistent in sign, all inside the noise, and 3× the calls in production).

🔑 **THE SCREENING TEST, EARNED THE HARD WAY (evals 160–163). Before designing any arm, ask which
DIRECTION it pushes.** A one-directional mechanism has now netted out negative three times:

| mechanism | direction | cost |
|---|---|---|
| pass 2's push half | up | −5.5 (`NOBOOST` removing it gains that back) |
| `NOPUSH` (deleting both restraints) | up, harder | −10 |
| `ROLE` (shrink everything not "body") | down | −12 |

The reason is eval 162's $0 SIZE/MIX split: **mix error never exceeds ±20%, but size error runs
0.65–1.30 in BOTH directions.** Any uniform push helps the dishes on one side and hurts the other.
Run `deno run --allow-read scripts/sim-mass-composition-split.ts dual NOBOOST` and look at which
dishes are already over and under BEFORE writing a prompt or a schema.

The still-open cheap candidate: **widen the oracle with more ASSEMBLED dishes** — the structural
finding below rests on 5 dishes against 4. Pizzas, pastas, sushi and tacos all exist across the
archived menus. Mostly $0, and it needs Santiago's rulings, not model calls.

### ☠️ ARM A WAS RE-MEASURED ON 2026-08-21 AND REJECTED AGAIN — 36/108

**Arm A 36/108 (33%) against the shipped `dual` 67/108 and `baseline` 60/108.** Far worse than doing
nothing; it damages 7 of 9 dishes. **Why:** it asks for `typical_total_g` then RESCALES every
ingredient to it, so a model that already oversizes gets a second chance to oversize and the rescale
MULTIPLIES the error — TIRAS DE POLLO returns **71 g protein** (band 36–53), BROWNIE **669 kcal**
(band 386–579).

⚠️ **ARM A IS NOT "just a prompt sentence" — a claim made and corrected the same day.** It is
`ENRICH_PROMPT` + a sentence **AND** a required numeric `typical_total_g` placed right after
`printed_total_g` (the B4 ordering rule). **That is already the strongest form the scoreboard
recommends, and it loses by 31 points.**

🔑 **The hypothesis that justified re-running it — "Arm A failed against a 1.81 kcal/g assembly and
today's richer dual pass makes the premise expire" — is FALSIFIED.** It was a control run demanded
before design work, and it is the only reason no arm was built on top of it.

🔴 **Overshoot is the failure direction on the hardest dishes.** The standing story is that unweighted
dishes come out far too SMALL. **TACO PORCO is 0/12 in every arm at 460–632 kcal against a 174–261
band; OMELETTE CUBANA is 3/12 in every arm at 621–695 against 320–480.** Both ~2× high.

⚠️ **A TRANSIENT JSON CRASH CAN KILL A PAID RUN.** One Arm A run died on
`SyntaxError: Bad Unicode escape in JSON at position 25033` after buying calls and writing nothing;
the identical rerun succeeded, so it is **transient despite `temperature: 0` and `seed: 17`**.
`callOpenAI` now saves the raw bytes before rethrowing. ⚠️ **Production shares the unguarded parse at
`enrich.ts:382` — CONTAINED, not safe:** `enrichBatchWithRetry` retries then falls back to zeroed
macros, so a user sees **0 kcal for that batch**. Untouched; a real open item.

🔑 **TACO PORCO IS A PURE SIZE ERROR.** ⚠️ An earlier version of this block called it garnish
inflation and quoted a 290 g breakdown — that was the `baseline` archive misattributed to the shipped
path. **Corrected:** in `dual` the taco is **225 g against a 100–140 g band**, overshooting almost
UNIFORMLY — tortilla 50 g (ruled 28), bandiola 100 (55), betabel 30 (15), piña 30 (15), and cacahuate
**10 (15) — under**. **Its composition is RIGHT: 2.07 kcal/g against the oracle's 1.81, off by 1.14×,
while size is off 1.88×. Resize the model's OWN recipe to 120 g and it scores a PASS at 249 kcal.**

✅ **The count is settled by the menu, not by the model** (Santiago, 2026-08-21): all ten tacos read
singular *"TACO X / Taco de…"*, and the same menu says **"ORDEN DE TORTILLAS"** when it means an order.
The oracle's 100–140 g band stands and needs no re-check.

### 🔬 THE STRUCTURAL FINDING: ASSEMBLED DISHES ARE THE BROKEN CLASS (2026-08-21)

Santiago's hypothesis, then measured: the pipeline copes with a PLATE of separable things and breaks on
a SINGLE UNIT whose ingredients are mixed together.

| class | dishes | typical size miss | worst | score |
|---|---|---|---|---|
| **assembled** — pizza, sushi roll, taco, omelette, pasta | 5 | **1.38×** | 1.82× | **29/60** |
| **separable** — salad, fries, brownie+scoop, strips+dip | 4 | **1.16×** | 1.30× | **38/48** |

⚠️ **5 dishes against 4 — directionally confirmed, not precisely quantified.**

🔑 **A size fix helps BOTH classes and hurts NEITHER.** Clamping each dish into its mass band:
assembled **29 → 38/60**, separable **38 → 42/48**. Per dish, five are unchanged and four improve
(TACO PORCO +5, BROWNIE +4, Salmón Roll +3, CAPRICCIOSA +1). **Only CARBONARA is ever damaged, and
only by the aggressive force-to-midpoint mode (9 → 7), never by clamping.**

### 🔴 THE MOST IMPORTANT THING ON THIS PAGE: THE RULER CHANGED ON 2026-08-20

**Any unweighted score from before 2026-08-20 is NOT comparable to one after it.** Two scoring rules
and the dish count all changed the same day. Re-score both arms before quoting any gain.

| | before | now |
|---|---|---|
| how wide a band is | whatever the dish's MASS range happened to be — **±6% to ±29%, unchosen** | **the average dish ±20%, the same for every dish** |
| a small miss in grams | failed if outside the band | **passes: 6 g for a macro, 50 kcal** |
| dishes in the set | 6 | **9** |
| the denominator | a hardcoded 72 | **`dishes × 4 × draws`** — printed by the build script |

✅ **THAT PARTIAL-COVERAGE PROBLEM IS CLOSED — both arms now cover all 9 dishes** (eval 157):
**`dual` 67/108, `baseline` 60/108.** The older partial figures — `dual` 41/60 and `baseline` 32/60 on
five shared dishes, gap 9; and the 52/72-over-6 replay — are **superseded**, and their archives were
overwritten by the eval-157 runs.

🐛 **WHY THEY WERE EVER PARTIAL, and it was NOT the model.** `brasero-two` is a DENSE menu: it is
extracted in two calls (base photo, then 2x2 crop tiles archived as `.p1.raw.json`), the parts are
**disjoint** (16 + 25 = 41 items, zero overlap), and production enriches the MERGED list — but the
harness's loader read one file. brasero-two was silently truncated to 16 items and TACO PORCO and
BROWNIE lived in the half never opened, so both arms reported them `ABSENT` on every draw. **Fixed at
the shared loader** — `itemsFromArchiveFile()` in `bench-pipeline.ts` merges the parts, and all five
call sites route through it. **brasero-two is the only archive of either menu map with a `.p1.` part,
and it is not in the mixed-menu map, so NO weighted number moved.**
⚠️ **The pre-swap pair "44/72 vs 35/72" is retired.** It was measured with COLIFLOR ROKA in the set and
PAPAS FRITAS out, so it cannot be reproduced; do not quote it.

### ⚖️ WHY THE BAR MOVED, AND WHY IT IS NOT RIGGING

Bands used to be `mass range × one fixed composition`, so CAPRICCIOSA — pinned to 400–450 g — had to
hit its fat within **±6%**, a bar no kitchen meets twice, while CARBONARA's 250–450 g bought it
**±29%**. **The widest-band dish scored 12/12 and the narrowest 3/12**: the benchmark was partly
measuring how tightly each dish had been written down.

🔑 **The anti-rigging guard is the GAP, and it is what makes a loosened bar defensible.**
`scripts/sim-tolerance-sweep.ts` scores the shipped pipeline AND the pre-dual baseline at every
candidate bar. If the gap between them shrinks, the bar has stopped telling good from bad.
**±25% both discriminated better AND flattered the headline 36 → 48. Santiago took ±20% precisely
because it does not flatter it.**
⚠️ **The gap narrowed 11 → 9 when the gram allowance landed.** It survives the check, but a narrowing
gap is the early sign of a bar gone soft — **re-check it as dishes are added.**
⚠️ The sweep script is now **HISTORICAL**: `deriveBands` emits the new bands, so its "today's bands"
row reads the NEW ones and the original comparison cannot be reproduced. Do not quote its numbers.

### 🍟 THE SET IS 9 DISHES, AND WHY THESE NINE

Chosen by **which dish FORM had never been measured**, not by description quality. **10 more salads and
16 more sushi rolls were available and deliberately skipped** — they grow the number and teach nothing.
`scripts/find-unweighted-candidates.ts` does the shortlisting for $0.

Points below are the 2026-08-20 eval-157 runs, `dual` vs `baseline`, 3 draws each.

| dish | menu | form | dual | baseline |
|---|---|---|---|---|
| ENSALADA GRIEGA | bistro | salad | 11/12 | **12/12** |
| PAPAS FRITAS | andaluz | side (replaced COLIFLOR) | 11/12 | **12/12** |
| CARBONARA | bistro | pasta | **9/12** | 7/12 |
| Salmón Roll | nikkori | sushi | 9/12 | **12/12** |
| CAPRICCIOSA | bistro | pizza | **8/12** | 0/12 |
| TIRAS DE POLLO | andaluz | fried chicken | **8/12** | 2/12 |
| **BROWNIE** | brasero-two | **dessert — new** | 8/12 | **12/12** |
| **OMELETTE CUBANA** | el-marcos | **eggs — new** | 3/12 | 3/12 |
| **TACO PORCO** | brasero-two | **taco — new** | **0/12** | **0/12** |
| **TOTAL** | | | **67/108** | **60/108** |

⚠️ **BROWNIE's baseline 12/12 is partly LUCK and is not evidence of good sizing.** That arm put
**144 g of strawberries** on it against a ruled 30 g — a ~5× error — and still passed every band,
because strawberries are ~32 kcal/100 g. **A pass hides a large gram error whenever the mis-sized
component is calorie-poor.**

🔑 **PAPAS FRITAS came free at 11/12** — it was already a neighbour in andaluz's archived batches, so
the shipped pipeline had been answering it all along. It is now the best dish in the set. **The five
survivors are unchanged**, which is what proves the oracle edit moved nothing it should not have.

☠️ **COLIFLOR ROKA IS RETIRED — do not add it back.** Its menu line is only its name; the real dish
(the restaurant's own photos) is battered cauliflower on lettuce under a chipotle mayo, none of which
is knowable from the text the pipeline receives. Santiago: an item this thin *"shouldn't even be
considered"* — **unanswerable rather than badly answered**, so failing it measured the menu's silence.
Four arms were partly judged on it.
⚠️ **Its removal costs something: it guarded the BOTTOM of the set** — the dish that would catch an arm
scaling everything downward. **Nothing guards the bottom now.** Weigh that against any arm that shrinks
a plate.

### 🔑 TWO STANDING RULINGS ON BUILDING A RECIPE (Santiago, 2026-08-20)

Both were corrections to a draft of mine, and both are now in `AGENTS.md`.

1. **A TOPPING IS PRICED AS A TOPPING.** I read *"virutas de bacon"* and charged **15 g of rashers**
   (P 16 / F 31 against the ruled P 10 / F 27). *Virutas* means **shavings** → 5 g. This is the same
   error class as the 30 g dipping container, and it **inflates protein hardest**, because cured meat
   and hard cheese are the most protein-dense things on a menu.
2. **WHERE FNDDS HAS NO COMPOSITE RECORD, DECOMPOSE INTO INDIVIDUAL INGREDIENTS.** Both of my
   single-record drafts were wrong. FNDDS carries the omelette's cheese+meat+**vegetables** axis only
   for egg WHITE and egg SUBSTITUTE, never whole egg, so onion and pepper had no representation. And
   **every FNDDS pork-taco record carries CHEESE that this taco does not have — worth HALF its fat**
   (276 kcal / 16 g → 218 / 8). That is the variant error that has bitten this oracle six times; caught
   before it shipped this time.

### ☠️ FALSIFIED AT $0 — DO NOT RE-OPEN ANY OF THESE

All three looked obviously correct beforehand. **Every one was killed for nothing**, by replaying
archived answers with the fix applied. That is the cheapest thing this phase does; use it first.

| idea | measured | script |
|---|---|---|
| correct the SIDE-DISH weights to Santiago's own ruled grams | 46 → **66 failed** | `sim-accompaniment-ceiling.ts` |
| lift lean dishes to normal calorie density via FAT | 46 → **80 failed** | `sim-decomposition-ceiling.ts` |
| ~~give every dish a PERFECT MASS | 36 → **35 points**~~ | 🔴 **REVERSED — see below** |

🔴 **THE MASS ROW IS RETRACTED (2026-08-21). PERFECT MASS IS NOW THE ONLY LEVER WITH A CEILING.**
It was measured at the OLD uneven bands over 6 dishes. Re-derived at the ±20% ruler over all 9, with
every control row reproducing the harness's published **67/108** exactly:

| lever | control | best row | gain |
|---|---|---|---|
| **MASS → clamped into band** | 67/108 | **80/108** | **+13** |
| **MASS → perfect (band midpoint)** | 67/108 | **98/108** | **+31** |
| accompaniment weight, Santiago's ruled g | 67/108 | 67/108 | **0** |
| decomposition / lift lean via fat | 67/108 | 67/108 | **0** |

**TACO PORCO 0 → 12 and OMELETTE CUBANA 3 → 12 on mass alone** — they have no composition problem,
which is exactly why every composition-side lever reads zero.
⚠️ **Both mass rows are CEILINGS, not arms** — they read the answer from the oracle. They prove
headroom exists; they are not a mechanism the model can execute.
⚠️ **This also retires the 2026-08-16 headline "SIZE WAS THE SYMPTOM, ASSEMBLY IS THE DISEASE."** It
was true of a 1.81 kcal/g assembly. Today's dual pass runs richer and size is the dominant error.

🐛 **WHY THIS WENT UNNOTICED FOR A DAY, and it is the same defect class as the loader bug.** All three
sims hardcoded `["andaluz", "bistro", "nikkori"]` and never grew when el-marcos and brasero-two joined,
so each silently reported a ceiling over **6 of 9 dishes** — excluding the two worst overshooters. And
`sim-mass-ceiling.ts` *printed* "the control row MUST read 36/72" while printing 56/72: a guard nobody
could act on, because nothing checked it. **All three now DERIVE their menus from the oracle, and the
mass sim THROWS if it has not scored every oracle dish.**

🔑 **The two transferable lessons.** (a) **The oversized side is LOAD-BEARING** — 6 of 8 weighted dishes
are already too LOW, so shrinking a side only removes calories a dish needed. On Salmone toscano the
ruled 15 g baguette fixes carbs (173% → 19% off) and **breaks calories** (4% → 26%), because the bread
was propping up a salmon that is 32% short on fat. (b) **A missing INGREDIENT cannot be fixed by
scaling a MACRO** — COLIFLOR ROKA is *capeado*, and batter is flour AND oil, so pouring in fat
overshoots fat and never touches carbs. **That is also why Arm PF ("add cooking fat", 37/72) could
never have won**, and Arm A ("ask for the plate total", 12/72) stays rejected — now re-derived at
today's oracle rather than quoted from an old note.

### 🪤 TWO SCORER TRAPS, AND THE RULE THAT CATCHES THEM

Both are lesson 28 in miniature and both happened this session.

- A hand-rolled scorer read **33 where the harness reads 36.** The harness scores each item's
  **ARCHIVED totals**, not a recomputation from its ingredients, and the two diverge on ENSALADA
  GRIEGA.
- Forcing every dish to its band **midpoint** is not a mass correction: it **breaks CARBONARA**, which
  already sits in-band at 281 g scoring a perfect 12/12.

🔑 **THE RULE: every simulator must reproduce the published score in its control row, or none of its
other rows is believed.** All four sims now do. This is why corrections keep surfacing as noise —
silent agreement would be the dangerous outcome.

### 🧭 PARKED AS SCOPE CREEP — the enrichability gate (Santiago's call, 2026-08-20)

The spec is written and committed at `docs/superpowers/specs/2026-08-19-enrichability-gate-design.md`
and **it is NOT the next action.** Santiago named it scope creep: it makes no macro more accurate. Its
measured content is still true and worth keeping for when it is picked up:

- **~40% of real menu items give the model no usable ingredient evidence** — 25% bare titles plus ~15%
  descriptions naming no ingredients, counted **once per unique item** across 343 items on 10 menus.
- The model's `confidence` field is a **poor gate**: as an AND with the description rule it sends **1%**
  of items to Weak; on its own it wrongly demotes **41%** of good items.
- Santiago's chosen shape: **Ranked / Weak / Excluded** tabs, and the *user-supplied description*
  feature (let the user add detail so the model can retry) deferred to **after release**.
- ⚠️ Its §5.1 open decision still stands: putting the field in `ENRICH_SCHEMA_OPENAI` **breaks pass 1's
  byte-identical request** and the weighted guarantee resting on it. Stage 1b is the recommended home.

### 🚧 STILL OPEN, AND HONESTLY STATED

- **Burgers and soups cannot be added to the benchmark.** Neither has a single described, no-weight
  instance across all ten archived menus. Filling those forms needs a new menu photo.
- **The unweighted path is the product's unfinished half** — measured, **67% of real menu items print no
  weight**, and 4 of 10 menus print none at all. Every cheap lever on it is now dead; the next move is
  genuinely expensive.
- **Santiago's fallback, kept open deliberately:** if this stalls for weeks, **ship the weighted half
  honestly** — printed-weight dishes are at ~84% and genuinely good — and say plainly in the UI that
  no-weight items are rough.
- **The accompaniment defect is closed as unfixable-by-weight, not solved.** See the $0 table above.

### ✅ WHAT IS TRUE ABOUT PRODUCTION (verify, never trust this line)

**Production is edge fn `analyze-menu` v32 and NOTHING in this session changed it.** No prompt, no
schema, no model pin, no deploy. Verify against the server with
`mcp__supabase__list_edge_functions`, never against a doc. `main` byte-matches it. TestFlight build 7
is submitted.

---
## ⚠️ SUPERSEDED WHERE IT DISAGREES — the 2026-08-19 handoff

### ⛔ THE NEXT ACTION, IN ONE LINE

**Go after the ACCOMPANIMENT defect** — sides and sauces are sized from a nutrition-LABEL serving
rather than what is served: **24% of weighted items, 12–20% of those dishes' calories.** It is the
largest known weighted defect and the only substantial one left. ⚠️ **A weight fix ALONE makes sauces
WORSE**: chimichurri is 2× too heavy AND ~3× too lean, and the errors currently cancel. Prose (Arm S)
and a duplicate schema field (S4) have both failed at it.

✅ **Everything else in this phase is CLOSED**: v32 deployed and verified against the server, PRs #17
and #18 merged, `main` byte-matching production, TestFlight build 7 submitted. **Nothing is unmerged,
undeployed, unbuilt, or owed a run.** Before starting the accompaniment work, invoke
`superpowers:brainstorming` — it is a new solution design, and Santiago's standing rule requires it.

### ✅ WHAT WAS BUILT AND MEASURED (2026-08-19, evals 151–152, ~$5.2)

🚀 **DEPLOYED 2026-08-19, Santiago authorised: edge fn `analyze-menu` v32.** Verified against the
server (`mcp__supabase__list_edge_functions`), not against this file. **v32 = v31 + the dual pass +
pass 2's system envelope, and nothing else** — `ENRICH_PROMPT`, `ENRICH_SCHEMA_OPENAI`, the model pin
and `ENRICH_BATCH_SIZE = 10` are all untouched, and pass 1's request body is byte-identical (5491
bytes, verified).

**ROLLBACK TO v31, one command:**
```bash
git checkout dbf3f79 -- supabase/functions/analyze-menu/ && \
  supabase functions deploy analyze-menu --project-ref uonuiadueykynbetxxrw
```

### 🔀 MERGE STATE — read before touching the PRs

✅ **BOTH PRs ARE MERGED (2026-08-19).** #18 → `feat/forced-serving-pieces`, then #17 → `main`, 87
commits. **`main`'s `supabase/functions/analyze-menu/` now byte-matches what is deployed** — verified
with `git diff origin/main HEAD -- supabase/functions/analyze-menu/`, which is empty.

⚠️ **HISTORICAL, and worth knowing because it lasted weeks:** `main` was behind production from v30
until this merge. v30/v31 both ran unmerged branch code, ~533 lines adrift, so **anyone deploying from
`main` would have silently rolled back two versions of macro work.** Closed now; re-check with that
same `git diff` before trusting it again.
🔑 **DEPLOYING AND MERGING ARE INDEPENDENT.** Deploying uploads the working directory to Supabase;
merging moves code into `main`. Neither triggers the other, and merging ships nothing to users.
### 📱 THE APP BINARY — build 7

**TestFlight build 6 is commit `ccd3b04` (2026-08-09) and predates the ENTIRE portion control.** The
12 app commits since it include the editor, the per-piece line, the input sanitisers, the
"18 means 18 rolls" unit fix, the nativewind `textAlign` crash fix, and the zero-portion parser fix.

✅ **BUILD 7 IS BUILT, VERIFIED AND SUBMITTED (2026-08-19)** — id
`cf7b5088-9280-4bac-a2e8-a97744e217fd`, commit `9745c39`, version 1.0.0 / build 7 (EAS
`autoIncrement` + `appVersionSource: "remote"` — the number is NOT in `app.json`). Santiago ran
`eas submit --platform ios --latest`; App Store Connect accepted the upload.
**TestFlight:** https://appstoreconnect.apple.com/apps/6798478137/testflight/ios

🔑 **THE TWO HALVES SHIP ON DIFFERENT CLOCKS, and confusing them wastes a session.** The macro
improvement is **server-side (edge fn v32) and already reaches EVERY user, including build 6** — no
app update needed. **Build 7 adds only the portion-editor UI.** So "did the dual pass work?" is
answerable from any build; "does the portion control work?" needs build 7.

🔬 **VERIFIED BY UNPACKING THE `.ipa`, not by trusting the build status** — the same three-row check
that diagnosed the build-3 crash, run against `Payload/menuscanapp.app/main.jsbundle`:

| string | build 3 (crashed) | build 7 |
|---|---|---|
| project ref `uonuiadueykynbetxxrw` | 0 | **1** ✅ |
| anon key prefix `eyJhbGciOi` | 0 | **1** ✅ |
| `"Missing Supabase env vars"` | 1 | **0** ✅ |

The feature is in the binary too: `"Close portion editor"`, `"comes in"`, `"Whole order"` all present.
⚠️ **Use `grep -a`** — `main.jsbundle` is Hermes BYTECODE, so plain `grep` reports "binary file
matches" and a bare `-c` returns 0 for strings that ARE there. Multi-part template literals are split
across the string pool, so search for a SINGLE literal, never a concatenated sentence.

🔍 **"Why is Hermes involved at all?" — a fair question, and the answer is: nobody opted in.** Hermes
is the **default React Native JS engine** since RN 0.70 / Expo SDK 48, so an Expo SDK 56 build uses it
unless `app.json` sets `"jsEngine": "jsc"`. It does not. Nothing in `src/` references Hermes; it is
what the iOS build compiles the JS *into*. **Verified, not assumed** — the bundle's first 8 bytes are
`c6 1f bc 03 c1 03 19 1f` (the Hermes bytecode magic `0x1F1903C103BC1FC6`), it contains
`HermesInternalBytecode.js`, and `hermes-compiler` is in `pnpm-lock.yaml`. Check the header with
`xxd -l 8` before believing any claim about this file's format, including this one.

✅ **The env-var trap that broke build 3 is CLOSED.** `eas env:list --environment production` carries
both `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` against project ref
`uonuiadueykynbetxxrw`. Build 3 shipped with them undefined; the minifier constant-folded the guard so
the ONLY surviving string was `"Missing Supabase env vars"`. **Verify a shipped bundle carries the
project ref before trusting a build** — see `plans/2026-08-05-testflight-photo-crash-handoff.md`.
ℹ️ Its traps 1–3 (iCloud `xattr`, Metro's compiled-in port, device reachability) are **LOCAL-build
only** and do not apply to an EAS cloud build.

| measure | today | dual pass + system envelope |
|---|---|---|
| **weighted** | **15/96** (fresh same-day control) | **14, 15, 17 /96** — no detectable cost |
| **unweighted** | **25/72** (35%) | **35, 36 /72** (49–50%) — two runs |
| **latency** | 1× | **1.56–1.92×** — below the 2.4× that declined GPT-5.5 |
| **cost per scan** | ~$0.03 | ~$0.05 |

✅ **Pass 1's request body is BYTE-IDENTICAL — 5491 bytes before and after** the envelope parameter
existed. The weighted guarantee is verified, not merely argued.
⚠️ **Pass 2 now sends a request shape PRODUCTION HAS NEVER SENT** (the `system` envelope) — the shape
every arm in this phase was measured through, and covered by tests, but a harness is not a deployment.
⚠️ **The accompaniment defect is untouched** (24% of weighted items, 12–20% of their calories).

⚠️ **The "16–18/96" baseline on record could NOT be fully re-derived.** Only one focused `mixed`
archive survives and it replays to 18/96 — the "16" was lost to the overwrite hazard `--run` fixes.
**Quote the 15/96 fresh control.**

### 🔴 THE ENVELOPE FINDING — the most important thing on this page

**The plan claimed the unweighted gain transferred BY CONSTRUCTION. It does not.**

| | how the request is actually built |
|---|---|
| `callOpenAI` — **every ARM this phase** | **two** messages: prompt as **`system`**, items as `user`, `{"items":[…]}` |
| `enrichBatch` — **production, and pass 2** | **one** `user` message with the items appended |

Same prompt (md5-verified), same batching, envelope the only difference: **38/72 → 31/72**, and
**CAPRICCIOSA — the 28 cm pizza that motivated the entire plate-weight thread — goes 6 → 0.**

✅ **FIXED AND CONFIRMED (eval 152): pass 2 now sends the `system` envelope, and it recovered most of
the gap — 31 → 35, 36/72 over two runs.** The ladder, all same-oracle: user+shipped **25** →
user+sentence **31** → **system+sentence 35–36** → `callOpenAI`+sentence 38 (one run). **The envelope
alone is worth 4–5 points of 72.** `enrichBatch` takes a defaulted `envelope` option and **pass 2 is
its only caller** — pass 1's bytes are unchanged and verified.

🔑 **This retro-taints every arm scored through `callOpenAI` against a `callGptEnrich` baseline** —
Arm P (37), P-inline (29), SplitOnly (21). Some rejections may have been rejections of an ENVELOPE
rather than an idea. **A prior for the next brainstorm, NOT a to-do list** — re-running rejected arms
is expensive and none of them are shipping candidates.

⚠️ **The +6 is NOT "the sentence alone"**: `baseline` selects mixed batches, `dual` unweighted-only,
so it bundles sentence WITH batching. Correct as a shipping number, unsound as a mechanism claim.
⚠️ **One run per cell** — 31 vs 38 is one run each. Direction is corroborated (pass 2 moved unweighted
calories by a median 0.99× across 45 neighbours); the SIZE of the gap is not.

**The next experiment:** `enrichBatch` gains a defaulted envelope option, pass 2 sends the `system`
shape, pass 1 keeps today's **exactly** — touching the shared path destroys the byte-identical
guarantee the whole weighted result rests on. ~$1. Lands ~38 → ship the full gain; ~31 → falsified.

### The 60-second version

The app estimates macros for menu items. It breaks each dish into ingredients, asks the model what
each ingredient IS (composition per 100 g), and **the code does all the arithmetic**. It is good at
dishes that print a weight and bad at dishes that do not, and the second group is most of a real menu.

| score | dishes | points | current | harness |
|---|---|---|---|---|
| weighted, sent ALONE together | 8 | 96 | 6–9 failed | `scripts/bench-macros.ts` |
| **weighted, INSIDE ITS REAL MENU** | 8 | 96 | **16–18 failed (2 runs)** | `scripts/bench-mixed-menu.ts` |
| **unweighted (no grams)** | 6 | 24 | **25–28/72 (2 runs)**; best arm **38/72** | `scripts/bench-unweighted.ts` |

**Never merge these numbers.**

🔴 **THE MOST IMPORTANT THING TO GET RIGHT, AND THE EASIEST TO GET WRONG: THERE IS NO "93% WEIGHTED
PIPELINE".** That figure is `bench-macros.ts` sending the 8 fixtures **alone, together** — a grouping
production never builds. In real menus weighted scores **16–18/96 ≈ 82%**.

| what a weighted dish travels with | score |
|---|---|
| the other 7 fixtures (the old benchmark) | 6–9/96 ≈ **93%** ← *not a real situation* |
| a mixed group of 10 real items — **production today** | **16–18/96 ≈ 82%** |
| a group of 10 other WEIGHTED dishes (Arm P-10) | 21–25/96 ≈ 76% |

**Splitting the menu does not recover 93% — it moves away from it.** Santiago asked this directly on
2026-08-18; it is the single likeliest thing for a new session to get wrong.

⚠️ **The weighted figure has moved TWICE and BOTH times because the ORACLE got stricter, never because
the pipeline got worse: 0–3/96 → 4–6/96 (accompaniment weights) → 6–9/96 (PASTEL's bean composition).**
Santiago approved carrying each.

🚀 ~~**PRODUCTION: edge fn `analyze-menu` v31 (2026-08-16).** Everything since is unshipped and
COMMITTED on `feat/forced-serving-pieces`, not pushed (PR #17 open, Santiago ruled it the LAST thing
to work on).~~ ⚠️ **STALE — all three clauses. Production is v32 (2026-08-19), PRs #17 and #18 are
MERGED, and `main` byte-matches the deployed function.** `ENRICH_BATCH_SIZE = 10` is still true.

### 📋 WHAT THE PLAN BUILDS, AND WHY IT IS THE ONLY SHAPE LEFT

| pass | sends | answers used for |
|---|---|---|
| **1** | the whole menu — **today's call, byte-identical** | weighted items |
| **2** | unweighted items only, with the Arm P sentence | unweighted items |

**Both of its numbers already exist**: weighted **16–18/96 by construction** (pass 1 is unchanged),
unweighted **38/72** (measured as Arm P-10's pass 2). The cost is **money and latency, not accuracy** —
~$0.03 → ~$0.05 per scan, Stage 2 ~1.5–2× slower.

🔑 **WHY UNWEIGHTED ITEMS ARE SENT TWICE** — the question a new session will ask. Not to retry them.
**Their PRESENCE in pass 1 is what holds the weighted items' batches at today's composition.** Remove
them and the weighted score moves: that is exactly Arm P-10, measured at 21–25/96 over three runs.

⚠️ **Latency can still sink this.** GPT-5.5 was declined for production on a 2.4× Stage-2 latency
alone. The plan's Task 5 measures the ratio and treats it as a decision input.

### ☠️ ALREADY TRIED AND REJECTED — DO NOT RE-RUN ANY OF THESE

Every row was paid for. A session that "discovers" one of these is repeating spend.

| arm | what it was | weighted (real menus) | unweighted | verdict |
|---|---|---|---|---|
| **P** | split each batch of 10, sentence on the unweighted half | 27/96 | 37/72 | ❌ costs weighted |
| **P-10** | partition FIRST, then chunk each side at 10 | **21–25/96** (3 runs) | **38/72** | ❌ real trade, Santiago declined this shape |
| **P-inline** | the sentence as a per-item condition, NO split | 15/96 | **29/72** | ❌ no gain |
| **SplitOnly** | the split with the prompt UNCHANGED | — | **21/72** | ❌ worse than baseline |
| **S, S2, S3, S4** | the sauce-decomposition thread | 5–13/96 | 26/72 | ❌ all rejected |
| **A, A-conditional, C, thresholds** | plate-weight family | — | 12–31/72 | ☠️ retired |

🔑 **THE 2×2 THAT EXPLAINS ALL OF IT — Arm P is an INTERACTION, not a lever:**

| | shipped prompt | + Arm P's sentence |
|---|---|---|
| **mixed batch** | 25–28 baseline | **29** (P-inline) |
| **split batch** | **21** (SplitOnly — *worse than nothing*) | **37–38** (P / P-10) |

**Neither half works alone.** The sentence opens *"The items in this request print no weight"* — true
of the WHOLE request only when the batch is homogeneous. **The model honours an unconditional fact
about the request far better than a per-item condition inside it.** The split is not valuable in
itself; it is what makes the instruction statable as a fact.

⚠️ **A claim that "batch composition is the lever, not the words" was MY hypothesis and the $0.50
control FALSIFIED it.** Third arm in this phase to die between a plausible story and a measurement
(after A-conditional and S3). **A hypothesis that explains every prior result is not thereby true.**

### 📊 THE SCOREBOARD THAT PREDICTS ARMS — read before designing one

**Prompt wording is 0 for 6. Schema force is 6 for 8.** Full detail and riders in `AGENTS.md`.

| approach | record | cases |
|---|---|---|
| a sentence in `ENRICH_PROMPT` | **0 for 6** | B11, B13, B23, two `serving_pieces` wordings, Arm S, P-inline |
| a required field in the schema | **6 for 8** | B4, B15, forced `serving_pieces`, B24b, S2, S3 |

Riders: ask for a **number**, not a string; **free text invites merging**; **field ORDER is
load-bearing**; a field that **overlaps** an existing one returns a copy; and **a per-item condition in
prose is applied indiscriminately**.

### 💸 RUNS ARE ~$0.40–0.50 PER ARM NOW, NOT ~$2

The bill is almost entirely **OUTPUT** tokens (~1,265 tokens of prompt+schema per call), so **the lever
is how many items you ENRICH, never how you word the prompt.** `callGptEnrich` fires each batch as its
**own request**, so a scored dish is influenced only by the ≤9 items sharing its call — both harnesses
therefore send only the batches their fixtures land in. **Do not add `--full-menu` to "be thorough":
4.5× the cost, no change to the score.** Santiago reloads in $10 increments and asked for this
explicitly (2026-08-18). ⚠️ **Cut arithmetic that changes nothing; NEVER cut a menu, a dish, a draw or
a real neighbour.**

### 🧾 EVERY RUN IS LOGGED AND RE-SCORABLE FOR $0 — KEEP IT THAT WAY

- **`docs/superpowers/extraction-iteration-ledger.md`** — one entry per eval, newest last, with scores
  and cost. **Currently at eval 150.** Add one before your session ends.
- **`docs/superpowers/stage2-macro-benchmark.md`** — the full evidence for each run.
- **Raw responses are COMMITTED** (`scripts/fixtures/caches/`, 204 files), so any oracle correction
  re-scores history for **$0**: `--replay` on either harness, and `scripts/rescore-history.ts` for the
  weighted archive (it DISCOVERS its runs — do not reintroduce a hand-maintained list).
- **Use `--run <label>`** on a repeat run or it overwrites its predecessor and the range is lost.

### 🚧 STILL OPEN, AND NOT ADDRESSED BY THE PLAN

### 🎯 THE ACCOMPANIMENT DEFECT — the next piece of work, briefed for a cold start

**In one line: when a dish comes with a sauce or a side, the app sizes it like a NUTRITION LABEL
rather than like a PLATE.**

**The mechanism, exactly.** An ingredient the model marks `within_printed_weight: false` is the one
class `resolveGrams` **never rescales**, so whatever number arrives reaches the user untouched. B21
asks for the *standard reference amount* — for a spooned sauce that is USDA's **30 g dipping
container**, not the ~15 g actually served.

| | |
|---|---|
| weighted items carrying at least one accompaniment | **32 of 133 = 24%** |
| the accompaniment's share of those dishes' calories | **12–20%** |
| ingredients the model gave **exactly 30 g** | **21 of 48** (and 46 of 48 were multiples of 5) |

🔴 **THE TRAP — THE OBVIOUS FIX MAKES THE APP WORSE, AND THIS IS THE MOST IMPORTANT LINE HERE.**
Chimichurri's two errors currently **cancel**: it is **2× too heavy** and **3.8× too lean**.

| | kcal |
|---|---|
| what the app reports today | **48** |
| target | **~79** |
| **after "just halve the grams"** | **24** — twice as wrong, in the same direction |

**Any fix must move WEIGHT and COMPOSITION together, or it must not move either.**

☠️ **FOUR ARMS HAVE ALREADY DIED ON THIS. Do not re-run them.**

| arm | what it was | outcome |
|---|---|---|
| **S** | a sentence in the prompt | **ignored** inside a dish; the sauce never moved |
| **S2** | a required STRING field | always answered, but invited **MERGING** of ingredients |
| **S3** | a required ARRAY of `{name, share_pct}` | 🔑 **the PROBE worked** — chimichurri fat 15 → 50 — **and the BENCHMARK rejected it**: 5–13/96 weighted vs a 4–6 baseline, and **26/72 unweighted vs 28** |
| **S4** | S3 + a duplicate `amount_as_served_g` | 7–10/96, rejected |

🔑 **THE LESSON S3 BOUGHT, AND IT IS THE ONE TO CARRY INTO THE BRAINSTORM: a probe measures the
MECHANISM, the benchmark measures the DISH.** S3 provably made the model answer correctly about
chimichurri and still made the app worse overall. **A convincing probe is not a shippable arm.**

📊 **The prior to weigh:** prompt wording is **0 for 6**; a required schema field is **6 for 8** — but
S3 and S4 are two of that scoreboard's failures, so schema force is not a guarantee *here*.

**Where the evidence is:** search `stage2-macro-benchmark.md` for `ARM S3`, `ARMS S3 AND S4 ARE
REJECTED`, and `SAUCE DECOMPOSITION PROBE`.

---

## ⚠️ EVERYTHING BELOW THIS LINE IS THE SUPERSEDED 2026-08-16 HANDOFF

It is kept because parts of it are still the only record of an oracle ruling or a falsified
direction. **Where it disagrees with the 2026-08-19 block above, the block above wins.** Three things
in here are now STALE and are corrected at their own headings: its prompt-wording scoreboard says
"0 for 5" (it is **0 for 6**), its "Suggested next steps" predates the P-10 result, and **every
unweighted arm figure it quotes was measured through `callOpenAI`'s envelope, not production's** —
see THE ENVELOPE FINDING above before trusting any of them.
**Do not take a next action from below this line.**

### The one insight that matters most — SIZE WAS THE SYMPTOM, ASSEMBLY IS THE DISEASE

Unweighted dishes come out far too small — a 28 cm pizza at ~520 kcal. The obvious fix is to estimate
the plate weight. **That was tried four ways and it does not work.** Proven at $0 by
`scripts/sim-plate-rescale.ts`: set the pizza to **450 g, the TOP of its verified band, and it still
returns 812 kcal against its band**, because its decomposition is 1.81 kcal/g where real pizza is
~2.4–2.75. **Rescaling preserves proportions, so no total can fix wrong proportions.**

☠️ **RETIRED — do not open another plate-weight arm:** Arm A (12/72), A-conditional (28/72), Arm C
(never scored), every threshold variant (simulated, best 31/72).

✅ **AND IT NOW HOLDS UNDER THE CURRENT RULER TOO (eval 163).** Everything above was measured on 6
dishes /72. `MASSCALL` re-ran the idea on 9 dishes /108 with the mass sourced from its OWN call, which
is the gap this note itself flagged — **50/108 against `NOBOOST`'s 70–72**. Its isolated mass call
returned the IDENTICAL number in all three draws off a four-value grid (150/200/280/300), and was
worse than simply summing the ingredient list on 6 of 9 dishes. 🔑 The ingredient list is not
contamination, it is where the model's mass knowledge lives.

### What actually worked: ARM P — still the best, still unshipped

One sentence appended **for unweighted items only**: give `typical_serving_g` as *the amount of that
ingredient actually present in one order as it is served*, not the standalone reference serving.
Weighted items keep a byte-identical request, so B21 is not falsified. `armP` in
`scripts/probe-plate-arms.ts`.

| dish | baseline | **Arm P** | Arm PF | Arm PD | S3 |
|---|---|---|---|---|---|
| CARBONARA | 9/12 | **12/12** | 12/12 | 11/12 | 6/12 |
| ENSALADA GRIEGA | 10/12 | **12/12** | 8/12 | 10/12 | 5/12 |
| Salmón Roll | 6/12 | 5/12 | 4/12 | 0/12 | 8/12 |
| CAPRICCIOSA | 0/12 | 2/12 | 3/12 | 3/12 | 0/12 |
| COLIFLOR ROKA | 0/12 | 3/12 | 3/12 | 3/12 | 0/12 |
| TIRAS DE POLLO | 3/12 | 3/12 | **7/12** | 3/12 | 7/12 |
| **TOTAL** | **28/72** | **37/72** | **37/72** | 30/72 | **26/72** |

**P and PF are TIED.** P's old one-point lead lived inside an oracle error that was corrected on
2026-08-16. They fail differently — P wins the salad, PF wins the chicken strips — so there is a real
choice there, not a winner.

### ✅ THAT BLOCKER IS CLEARED — ARM P WAS JUDGED AND REJECTED (2026-08-18)

This section used to read "Arm P is not safely shippable, for a reason the benchmark cannot see —
building that harness is the highest-value next step in the phase." **The harness was built, it ran,
and the fear was correct: Arm P costs weighted dishes 16/96 → 27/96.** See the block at the top.
**Nothing here is waiting on Santiago any more; the next step is the P-10 arm.**

### ❌ FALSIFIED 2026-08-16 — do not re-run these

The whole "fix the sauces" thread. It is closed, and each step closed a direction:

| arm | what it was | result |
|---|---|---|
| **S** | a SENTENCE asking to decompose prepared mixtures | **ignored inside a dish.** NEW YORK returned `chimichurri 30 g / fat 15` under both arms, identical |
| **S2** | a required STRING `composed_of` | always answered, but helped only where the model volunteered shares. **Invited MERGING** — `shrimp + breading + oil` collapsed into `breaded shrimp 150 g` |
| **S3** | a required ARRAY `parts` of {name, share_pct} | chimichurri fat **15 → 50** in a probe, controls held. **But 5–13/96 weighted and 26/72 unweighted — below baseline on both** |
| **S4** | S3 + required `amount_as_served_g` | **7–10/96, and it never actually ran**: the model returned the new field IDENTICAL to `typical_serving_g` in **364 of 364** ingredients, including all 36 accompaniments |

🔑 **TWO LESSONS THAT SHOULD SHAPE THE NEXT ARM:**

1. **A required field whose meaning OVERLAPS an existing field returns a COPY.** Schema force compels
   an ANSWER, not a DIFFERENT answer. Before adding a field, ask what question it answers that no
   existing field can.
2. **A probe measures the mechanism; the benchmark measures the dish.** S3's probe result was REAL
   (chimichurri 15 → 50) and still lost, because the composition fix helps where a mixture dominates
   and hurts where it does not — CESAR went 11% → 25% of fields failed while Salmone improved
   49% → 34% error. **This is the SECOND arm to die between probe and benchmark** (A-conditional was
   the first). Budget the benchmark before believing a probe.

### 📊 ⚠️ STALE SCOREBOARD — superseded, wording is now 0 for 6 (P-inline, 2026-08-18)

**Prompt wording is ~~0 for 5~~ 0 for 6. Schema force is 6 for 8.** Full detail and the riders are in `AGENTS.md`.

| approach | record | cases |
|---|---|---|
| a sentence in `ENRICH_PROMPT` | **0 for 6** | B11, B13, B23, two `serving_pieces` wordings, Arm S, **P-inline** |
| a required field in the schema | **6 for 8** | B4, B15, forced `serving_pieces`, B24b, S2, S3 |

Riders: ask for a **number**, not a string; a **free-text** field invites merging; **field ORDER is
load-bearing** (strict mode emits in schema order, so a field must precede what it constrains); and a
field that **overlaps** an existing one returns a copy.

### 🚧 THE DEFECT THAT IS STILL REAL AND STILL UNFIXED

**Accompaniments are sized from a nutrition-LABEL serving instead of what is served.** An ingredient
marked `within_printed_weight: false` is the ONE class `resolveGrams` never rescales, so its number
reaches the plate untouched — and B21 asks for the standard reference amount, which for a spooned
sauce is USDA's **30 g dipping container** rather than the ~15 g actually served.

| | |
|---|---|
| weighted items carrying at least one accompaniment | **32 of 133 = 24%** |
| the accompaniment's share of those dishes' calories | **12–20%** |
| ingredients the model gave exactly 30 g | **21 of 48**, and 46 of 48 were multiples of 5 |

**Two mechanisms have now failed to move it: prose (Arm S) and a duplicate field (Arm S4).**

⚠️ **A weight fix ALONE makes sauces WORSE, and this is why the rulings and an arm must land
together.** Chimichurri's two errors currently cancel: it is 2× too heavy and ~3× too lean. Halving
the grams without fixing the composition takes it from 48 kcal to 24 against a ~70 kcal target.

### ⚖️ SETTLED 2026-08-16 — do not reopen these

- ✅ **The printed-weight SCOPE question** (months open). Simulated at $0 by
  `scripts/sim-scope-rule.ts`: today's rule — the model decides per ingredient — scores **7/288**,
  while "the printed weight covers the whole plate" scores **31/288**, 4.4× worse. **Option A is
  falsified.** Independent support: El Marcos prints *"el gramaje se refiere a los ingredientes
  principales"*. ⚠️ The test is partly circular (the oracle encodes the convention), which is why the
  menu text matters. **"Main ingredients" is already plural in practice** — 94% of weighted dishes
  put 2+ ingredients inside, and all 7 that put exactly one are steaks or a chicken breast.
- ✅ **`within_printed_weight` is NOT unstable.** It differs across draws of the same prompt in
  **2 of 420 = 0.5%**. An earlier claim in this file that it "flips at random" was asserted from three
  anecdotes with no denominator and is **retracted**.
- ✅ **The "real-restaurant field test" is CLOSED as a FALSE PREMISE** (Santiago, 2026-08-16). These
  docs claimed for weeks that "every scan is a photo of a screen"; the fixture menus are **real phone
  photos of real paper menus**. Do not reintroduce it or gate anything behind it.
- ✅ **The pizza's oracle band** was re-sourced from the FROZEN USDA record to the RESTAURANT one
  (FDC 2708660 → 2708663), verified against the API. It did NOT rescue the pizza.

### ⚠️ THE ORACLE HAS BEEN WRONG SIX TIMES, ALWAYS THE SAME WAY

Every one is the right FOOD and the wrong **variant**. FNDDS encodes venue, crust, preparation and
topping class as SEPARATE records, and the wrong axis moves a band 30–46%.

| entry | wrong record | wrong axis | outcome |
|---|---|---|---|
| CARBONARA | pasta with cream sauce | **no meat** (menu says *tocino*) | fixed → FAILING→PASSING |
| ENSALADA GRIEGA | salad dressing NFS | **creamy** not *vinagreta* | fixed → FAILING→PASSING |
| CAPRICCIOSA | 14" cheese-only | topping class | fixed |
| CAPRICCIOSA | chain regular crust | crust | fixed |
| CAPRICCIOSA | thin crust FROM FROZEN | **venue** | fixed 2026-08-16 |
| PASTEL AZTECA | canned pinto, no added fat | **venue** — a restaurant serves *refried* | 🔴 **OPEN, needs a ruling** |

🔑 **Two of the four "pipeline defects" in the first unweighted run were the ORACLE's fault.
Re-source before believing any single-dish failure**, and search FDC for every variant
(`scripts/unweighted-portions.ts --search <terms>`) before choosing one.

✅ **THAT LAST OPEN RULING IS CLOSED (2026-08-17).** PASTEL AZTECA's beans moved to **FDC 2707397
`Refried beans, from fast food / restaurant`** (177 kcal/100 g, fat 9.48) from `Pinto beans, from
canned, no added fat` (137, 0.93). Santiago's ruling; the 30 g weight he set on 2026-08-16 is
unchanged. It cost 3 points on the weighted set, all of them that dish (2/36 → 9/36).
⚠️ Recorded tension worth knowing before the next sourcing decision: 2707397 IS the richest of the
FNDDS refried family (90 / 99 / 89 / 119 / 177), which the standing "prefer the median, never the
richest" rule would reject. It is taken because it is the **only entry at this dish's venue** — the
newer, more specific rule wins over the older one. **Not propagated to ENFRIJOLADAS**, whose *salsa de
frijol* is a sauce the dish is bathed in, a genuinely thinner food than a scoop beside a plate.

### 📌 Santiago's accompaniment rulings, APPLIED 2026-08-16

| accompaniment | was | ruled | basis |
|---|---|---|---|
| chimichurri | 30 g | **15 g** | USDA spooned-on-food amounts (1 tbsp 16–17 g). The 30 g the model returns is USDA's **dipping-container** portion |
| baguette | 45 g | **15 g** | one slice, from USDA's 324 g / 22" baguette ≈ 15 g per inch |
| beans | 80 g | **30 g** | **his judgement**, midpoint of a ruled 25–35 g. ⚠️ NOT USDA-backed: USDA publishes 130 g but that is beans **as the food**, and there is no published side-of-a-plate portion |

Applied by `scripts/apply-accompaniment-rulings.ts`, which **refuses to write** unless it first
reproduces every stored oracle total from the shipped file.

### 📊 Two dishes no arm has fixed, and they fail for DIFFERENT reasons

- **COLIFLOR ROKA (0–3/12)** — its mass is fine; its **identity** is wrong. The pipeline returns
  25–110 kcal and near-zero fat for a **battered, deep-fried, sauced** dish, because its description
  is EMPTY and *"Roka"* is defined only on another line of the menu (`CAMARÓN ROKA … capeado y
  bañado`). **No prompt sentence fixes this** — four arms have tried. It needs cross-item menu
  context. Measured: undescribed macro-relevant items get **1.93 ingredients vs 4.87**; ~28% of
  macro-relevant items are undescribed (food 10%, **sides 85%, desserts 100%**).
- **TIRAS DE POLLO (3/12)** — only Arm PF moved it (to 7/12) by adding cooking fat, and PF regressed
  the salad by the same amount.

### 🧭 ⚠️ SUPERSEDED — do not take a next action from here

This section used to rank the next experiments. **All of it has been run.** Arm P, Arm P-10,
P-inline and the split-only control are measured and rejected; the accompaniment-weight defect is the
only item that survives, and it is recorded under "STILL OPEN" in the 2026-08-18 block at the top.

**→ The current next action is the first line of the 2026-08-18 handoff: execute
`docs/superpowers/plans/2026-08-18-dual-pass-enrichment.md`.**

---

## 2026-08-13 — the unweighted oracle, detail

**The 96-point benchmark only ever described dishes that PRINT A WEIGHT.** All 8 fixtures print one,
so `resolveGrams` pins their grams and the plate is never guessed. There are now **TWO scores, and
they must never be merged or quoted for each other:**

| score | dishes | points | result |
|---|---|---|---|
| weighted (existing) | 8 | 96 | **~96% passing** |
| **unweighted (NEW)** | 6 | 24 | **28/72 = 39%** over 3 draws ← this is the BASELINE. Arm P later reached **37/72** on the corrected band; see the 2026-08-16 handoff at the top |

That gap is the real state of macro enrichment. Build: `scripts/unweighted-oracle-build.ts` →
`scripts/fixtures/unweighted-oracle.json`. Score: `scripts/bench-unweighted.ts`.

🔑 **PRICE IS NOT EVIDENCE OF GRAMS** (Santiago, 2026-08-13, rejecting a band argued from price
parity): *"A menu can have an expensive pizza of 1k+ dollars, doesn't mean it weighs 10x the size of
a large pizza."* Never use price in an oracle, a prompt, or code.

⚠️ **An oracle built from GENERIC USDA records will fail a pipeline that is right.** Two of the first
run's four "pipeline defects" were the oracle's own fault — a cream-sauce pasta record with no meat
where the menu says *tocino*, a creamy dressing where the menu says *vinagreta*. **Re-source before
believing any single-dish failure.** Four such errors are tabulated in the ledger.

🔴 **The headline finding — a right mass with the wrong FOOD.** COLIFLOR ROKA scores 0/4: the
pipeline returns 25 kcal and **0 g fat for a battered, deep-fried, sauced dish**. Its description is
empty, and *"Roka"* is defined only on ANOTHER LINE of the same menu (`CAMARÓN ROKA … capeado y
bañado`). Enrichment never sees it. **This points the opposite way from the batching defect** —
there, isolating items helped; here, cross-item context would have. Any arm that isolates items
further makes this dish worse.

🔴 **Fat is the weakest macro — wrong on 5 of 6 dishes** (0 g vs 14–19, 20 vs 58–65, 20–22 vs 31–44,
25–29 vs 35–63; high on the Salmón Roll). Carbs pass almost everywhere.

⚠️ **Arm A cannot fix COLIFLOR ROKA** — it supplies a plate WEIGHT, and that dish's weight is already
right. Judge Arm A on Capricciosa and Tiras de Pollo, never on the set total.

---

## 2026-08-12 SESSION — the batch-size curve. Still valid.

Spend: **~$11.50**. **Nothing was changed in production. `ENRICH_BATCH_SIZE` is still 10, nothing
was deployed, and the code below is uncommitted on `feat/forced-serving-pieces`.**

**The batch-size curve was measured and it killed its own fix.** Small batches fix the instability
AND fix a real drop bug — and cost 4× the accuracy on dishes that print a weight:

| | b10 (production) | b3 |
|---|---|---|
| macro spread, unweighted dishes (median) | 35% | 7–12% |
| genuine item drops, all 10 menus | **16** (Polloteria) | **0** in 30 runs |
| **accuracy, 8 weighted fixtures** | **0–4/96 at 12.3–13.9%** | **13–15/96 at 17.9–18.9%** |
| wall-clock, 10 menus | 521 s | 304–353 s |

**So a single global batch size cannot win both, and this was never a tuning problem.** A control run
(batch 8 through `callGptEnrich`) reproduced B21 exactly, so the code path is innocent and batch size
is genuinely the cause. Full numbers, the OSTRICA/TAYLOR BAY worked examples, and the
"what this does NOT establish" list are the last entry in
`docs/superpowers/stage2-macro-benchmark.md`.

🔑 **Read this before designing the next arm: the two open defects are probably ONE defect.** Offered
as a prior, not a finding — the model appears to calibrate across the items sharing a call. Where a
printed weight pins the grams, that context HELPS; where the plate is guessed, it makes the guess
depend on batch-mates, which is the instability. If so, both defects reduce to **nothing pins the
plate for a dish that prints no weight**, and Arm A (required `typical_total_g`) is the shape of a fix
for both — re-judge it SOLO, since batched runs are now known to be untrustworthy.

🔴 **A REAL PRODUCTION BUG WAS FOUND AND IS STILL LIVE: Polloteria loses 16 of its 95 items at
`ENRICH_BATCH_SIZE = 10`.** The wing sauces (BBQ, Ranch, Buffalo, +13) come back with zeroed macros —
`fallbackEnriched`'s signature — and come back correct at b3. Lowering the batch size is not the way to
fix it, because of the accuracy cost above. **Unfixed and unassigned.**

⚠️ **`ENRICH_BATCH_SIZE` was pinned at 10 to stop early-stopping. That fear did not reproduce**: zero
short returns across 125 calls at sizes 1/3/5/10. The comment in `enrich.ts` is stale as a
justification.

✅ **Shipped in code (not deployed): `MAX_CONCURRENT_BATCHES = 5`.** `callGptEnrich` used to fire every
batch at once; Polloteria at batch 3 is 19 simultaneous requests, and a rate-limited call that fails
twice gets its item ZEROED rather than merely delayed. Capped in waves, with a test verified to fail
without the cap. 30 tests pass.

⚠️ **Correction, applies to every figure below: "15 per call" was really 10 + 5.** `callGptEnrich`
chunks internally at `ENRICH_BATCH_SIZE`, so the 15-dish batched runs were a group of 10 plus a
remainder of 5.

⚠️ **`0–3/96 at 12%` describes ONLY dishes that print a weight.** `bench-macros.ts` sends all 8
fixtures in one call and all 8 print weights, so `resolveGrams` pins their grams and the plate is never
guessed. The benchmark is structurally blind to the instability defect. Most real menu items are
unweighted, and they are ungated.

⚠️ **"Solo is stable" was a 5-dish selection artifact.** Across 15 dishes, five swing ≥19% sent ALONE
(Tiras de Pollo 505–796 kcal at batch 1). Batch size is not the whole fix.

---

## 2026-08-11 SESSION — still valid except where the block above corrects it

Two defects were found that change the priority order, and one product feature was built. Total
spend for the day: **~$2.05** across seven probes. Everything below this block predates it.

### 🚨 #1 PRIORITY — batching makes macros unstable IN PRODUCTION. ⚠️ "Code-only fix" is now KNOWN WRONG — see the 2026-08-12 block.

**What "batch" means here:** one user, one photo, one scan produces ~40 menu items. The edge
function chunks them into groups of `ENRICH_BATCH_SIZE = 10` and makes ~4 model calls. A "batch" is
one such group — it is INTERNAL to a single scan, nothing to do with multiple users or scans.

Same dish, same unchanged pipeline, five draws each. The only variable is grouping:

| dish | SOLO (1 item/call) | BATCHED (15/call) |
|---|---|---|
| OSTRICA | 173,172,172,172,177 → **3%** | 525,205,243,242,242 → **88%** |
| MEXICANA | 358,359,359,358,359 → **0%** | 499,335,339,362,639 → **62%** |
| BRAISED SHORT-RIB GF | 525,529,529,529,525 → **1%** | 500,379,501,501,653 → **53%** |

Alone the model is essentially deterministic; batched, the same dish swings 39–88%. Two diners
scanning the same menu get different calories, and the goal RANKING is sorted on those numbers.
Probe: `scripts/probe-plate-arms.ts solo|noise|curve`.
✅ **The curve was MEASURED on 2026-08-12 — see the top block. Do not re-run it.** Its verdict: small
batches fix this and cost 4× the accuracy on weighted dishes, so a batch-size change is NOT the fix.
⚠️ Both figures in the table above are "15 items submitted", which `callGptEnrich` ran as 10 + 5.

### 🚧 #2 — every statement of size EXCEPT printed grams is ignored

3 draws, calories as the metric: printed grams 200→400 g moves the answer **2.14–2.37×**, while
**28→40 cm moves 1.06–1.36×**, "6 pz"→"12 pz" **1.00×**, "for 2 people" **0.62–1.22×**, "chica"→
"grande" **1.02–1.32×**. Not dish-specific — pizza, wings, pasta and salad are equally flat.

**Why:** nothing in the pipeline estimates the PLATE. The model gives ingredients and a typical
serving of each; the dish mass is whatever they SUM to (~231 g mean regardless of dish).
`resolveGrams` is the only place the plate exists as a concept, which is why printed grams are the
only channel that works. Asked plainly OUTSIDE the prompt, the same model says a 28 cm pizza is
**750 g** where the pipeline says 250 g — **the knowledge is there and nobody asks for it.**

### ❌ Measured and NOT shipped — do not re-run these

| arm | what it was | outcome |
|---|---|---|
| **A** — split batch, required `typical_total_g` | weighted items keep today's request byte-identically | restores size response (1.68–1.81×) but pushed the Salmón Roll out of band |
| **C** — separate parallel plate call | `ENRICH_PROMPT` untouched | worse than A everywhere; it asks COLD, A asks with decomposition context |
| **A-conditional** — ask always, anchor only when the menu states a size | `statesSize()` detector, food-agnostic | looked best on 4 solo dishes; **the 15-dish BATCHED run then measured mostly batch noise** — re-judge on solo before believing it |

⚠️ **The noise floor is median 25% / worst 88%** (batched). Any arm must beat **that dish's own**
noise, not a flat threshold. Three draws is too few where spread approaches 90%.

### ✅ Shipped this session (client only, no pipeline change)

**The portion control** — every item carries `portion` (share of one order) and `piecesPerOrder`
(what it is cut into). A row reads `1` or `8 / 12`; tapping opens an editor with `I'll have` and
`comes in`. **Macros are always `itemMacros × portion` — the divisor never enters the arithmetic**,
so correcting a wrong piece count cannot move a calorie. 15 tests in `src/lib/portions_test.ts`.
~~Branch `feat/forced-serving-pieces`, PR #17 open with an unread CodeRabbit review — Santiago's
ruling: PR #17 is the LAST thing to work on.~~ ✅ **DONE 2026-08-19: the CodeRabbit review was worked
(one real bug — `parsePortionInput("0.001")` returned 0, not null, which prices a row at 0 kcal), and
PR #17 is MERGED to `main`.** 🏗️ **TestFlight build 7 is building**; build 6 shows the old label.

⚠️ One workaround worth knowing: the quantity `TextInput` sets `textAlign` via `style`, never
`className` — `nativewind@5.0.0-preview.4` ships a `TextInput` whose `nativeStyleMapping` is
`{ textAlign: true }` against code calling `path.split(".")`, so any text-align class crashes the
render.

### 📌 Rulings made this session

- **The ingredient rule** — now in `AGENTS.md`: the DESCRIPTION is the source of truth above all
  else; the NAME implies only what the dish form requires (a roll's rice, a burger's bun); nothing
  else is ever invented. Settled by the Salmón Roll, whose 150 g of unlisted rice is 42 of its 54 g
  of carbs and whose result an independent cross-check put at ~592 kcal.
- **"Portions for 2 people" is not a model problem** — the user reduces it with the stepper.
- **The unweighted-dish oracle is PARKED**, half-built (`scripts/macro-band-score.ts`,
  `scripts/unweighted-oracle.ts`, `scripts/unweighted-candidates.ts`, 14 tests). It needs six
  per-recipe rulings from Santiago and is NOT blocking. Its spec honestly records that official
  databases publish ingredients and generic composites, **never restaurant plate weights** — so any
  such oracle is a labelled *reconstruction*, good for catching gross errors, not fine grading.

---

🔍 **Never trust a doc for what is deployed — check the live function.** These docs claimed "v28 / B4
/ not deployed" for two days while v29 served every scan; that was found on 2026-08-11 by comparing
the live bundle against this repo's `ENRICH_PROMPT`, which is the only fingerprint that cannot lie.
`mcp__supabase__list_edge_functions` gives version and `updated_at`. **When you deploy, edit these
lines in the SAME commit** — the 35-minute gap is exactly how it happened.

History, both superseded: **`macro-best-v8` as v29** (2026-08-09 15:46 MST) and **B4 as v28**
(2026-08-09). Production before those ran the original pre-B1 prompt — the
worst version measured (39/96 failed, 37.7% error); B4 measured (**24–27/96, 21.0–21.2%**).
Verified live: `printed_total_g` read correctly on all three smoke-test dishes, allergens present,
`model_id` = the pin. **Rollback = redeploy from `ce91e91`**:
`git checkout ce91e91 -- supabase/functions/analyze-menu/ && supabase functions deploy analyze-menu --project-ref uonuiadueykynbetxxrw`.
⚠️ **A known regression shipped with it:** B4 is WORSE than the old version on small dressed side
dishes (Coleslaw 0/48 → 22/48) — it under-portions dressing. Accepted as the price of a ~2× net win.
**GPT-5.5 is NOT deployed and was NOT chosen** — see the model block below.

Read **② the roadmap's `🎯 CURRENT PHASE` block first** — it carries the full takeover briefing:
every commit and whether it is deployed, the runs side by side, and what each proved. Then read
`docs/superpowers/stage2-macro-benchmark.md`, the living document (Backlog, Runs, Rulings).
`docs/superpowers/plans/2026-08-07-stage2-macro-benchmark.md` holds the paid-run procedure; its
Tasks 1–5 are COMPLETE. The USDA plan is the oracle/provenance reference:
`docs/superpowers/plans/2026-08-07-usda-macro-oracle.md`.

**One-line state (⚠️ SUPERSEDED — current numbers are in the 2026-08-16 handoff block at the top; production is v32 (dual pass) and the weighted score is 6–9/96 isolated, 14–17/96 in real menus):** **`macro-best-v8` + forced `serving_pieces` is the best measured version at 0–3/96 and 12.0–12.5%, and it IS live as edge function v30 (2026-08-11).** On the 8-dish set, 4 runs x 3 draws: **baseline 24/96 at 34.2%, B21 0–3/96 at 12.1–14.1%**, with one perfect run and six of eight dishes at 0/48. Verified beyond the fixtures on **72 real items from all nine archived menus**: black-box ingredient 1.4%, undecomposable 2.8%. Drinks and alcohol are deliberately OUT (post-launch). ~~The biggest remaining unknown is the real-restaurant field test — every scan to date is a photo of a screen.~~ **FALSE, corrected by Santiago 2026-08-16: the fixture photos ARE real phone photos of real paper menus.** Always re-derive numbers with `deno run --allow-read scripts/rescore-history.ts`; figures written in prose are snapshots.

🏁 **Fallback checkpoint: git tag `stage2-b4-checkpoint` → commit `22a1ac5`.** Restore from it if an
evaluation regresses. `git show stage2-b4-checkpoint` prints the result;
`git diff stage2-b4-checkpoint -- supabase/functions/analyze-menu/` shows what has drifted.
⚠️ **That tag message quotes PRE-re-freeze numbers** — the current ones are in the log's Rulings. Do
not move or delete the tag. ✅ **B4 was deployed on 2026-08-09** (see above) — the "publishable is not
permission to deploy" caveat that used to sit here is spent. **The rollback target is `ce91e91`,
the pre-B1 state**, not this tag.

✅ **The saturated gate is FIXED — the fixture set is now 8 dishes.** It used to be that
baseline-002 and B4 both scored 0 of 36 and were indistinguishable. B14 (2026-08-09) added five
dishes and the metric separates them again: **B4 24–27/96 vs baseline 39/96**. On the original three
dishes both arms still score 0 of 48 each, so **never quote a 36-field figure as current** — those
belong to the retired 3-dish set. Report both numbers: failed field/draws AND mean absolute error.

💰 **Cost is NOT a constraint (Santiago, 2026-08-08).** These sessions exist to clear hypotheses about
the core feature. **Never narrow scope, skip an experiment, or recommend stopping on cost grounds.**
State the dollar estimate and get his approval before a paid run — but price is never an argument
against running one.

### ✅ ALREADY DONE — do not redo, do not re-run, do not re-litigate

Every line here was executed and measured. A new session that "discovers" one of these is
repeating paid work. Full detail in the log's Runs table and Rulings.

| Thing | Outcome |
|---|---|
| Benchmark harness, USDA oracle, scoring | Built, frozen |
| B1, B10, B11, B12, B13 | Measured. B11 and B13 **falsified** (prompt wording moved nothing) |
| **B4** — conventional serving + printed-weight tag, fitted in code | **The current best pipeline.** Tag `stage2-b4-checkpoint` |
| **B14** — widen the fixture set | **DONE.** 3 dishes → **8** |
| **B9** — cross-model arm | **DONE.** GPT-5.5 beats GPT-4o |
| Oracle re-freezes ×3 | printed weights (`a4ebf0f`), Caesar dressing (`a60eb2a`), **PASTEL tortilla (2026-08-09)** |
| Sub-3 g absolute scoring floor | Approved and applied |
| **`resolveGrams` "protect the principal"** | **FALSIFIED at $0** — made failures worse on both arms. Not shipped |
| Measurement-code duplication (4 divergences) | Fixed; `macro-measure.ts` is the single path, guarded by tests |
| **Deploying B4** | ✅ **DONE 2026-08-09 — edge fn v28.** Rollback target `ce91e91` |
| **Pipeline-integrity arm** (real menus, batches of 10, both models) | **DONE.** Both models clean: no drops, order kept, no truncation. Found a latent production break — see below |
| **USDA adjudication of Coleslaw + ENFRIJOLADAS portions** | **DONE, oracle UNCHANGED on both.** USDA backs the oracle. Coleslaw's regression is genuine model error |
| **GPT-5.5 as the production model** | **CONSIDERED AND DECLINED** — better macros, ~2.4× slower. Not a measurement gap; a product call already made |

**Deliberately NOT done, and each needs a ruling before anyone starts:** deploying anything
FURTHER (B4 was authorised and deployed 2026-08-09 as v28; nothing else is); switching production
to GPT-5.5 (considered and declined — 2.4× slower); changing the oracle; re-running a baseline;
putting any food/dish/cuisine name in the prompt's nutrition step (measured harmful, unit-tested).

### 🎯 WHAT IS ACTUALLY LEFT (everything else on this page is history)

⛔ **THIS SECTION IS SUPERSEDED — read the 2026-08-12 block at the top first.** It said the
benchmark work was finished; two open defects (batching instability, and size being a dead channel)
mean it is not. The two items below are still real and still need Santiago. **The batch-size curve is
now MEASURED and closed as a fix** — it is no longer the next action.

**The benchmark work was believed finished as of 2026-08-09.** Two items remained, and neither is a
measurement question — both need Santiago, not another run:

1. 🔴 **The printed-weight SCOPE ruling — the one open technical finding.** Our oracle assumes "the
   printed weight = the whole plated dish" for all eight fixtures. The menus contradict that. Gnocchi
   is not a portion dispute: **all three arms overshoot it in the same direction** (baseline +107%
   calories, GPT-4o +26%, GPT-5.5 +17%), Casa Nostra prints the same **180 g on five different pasta
   dishes**, and Andaluz prints weights as small as **30 g** (`ESPÁRRAGOS con jamón serrano`) and
   **50 g** — which are ingredients, not plates. On that menu the number sits right after the
   accompaniment clause. Re-reading Casa Nostra's weights as the principal component moves **Gnocchi
   +39%** and **Salmone +27%** — and Salmone currently scores **0/48**, so it could break a passing
   fixture. ⚠️ **This re-opens a question the docs mark CLOSED ("ruled, applied blind"), so it needs a
   NEW ruling. Nothing has been changed.** Suggested first step, $0: classify all eight fixtures'
   printed weights against the menu photos before touching any one dish — a per-dish patch would
   recreate the inconsistency the PASTEL re-freeze just fixed.
2. 📱 ~~The real-restaurant field test — never done, and now the highest-value unknown.~~
   ✅ **CLOSED 2026-08-16 (Santiago): its premise was false.** The fixture menus are real phone
   photos of real paper menus, so paper, lighting, angle and glare are already measured.

**Also open, lower value:** Coleslaw-type small dressed side dishes regressed under B4 (0/48 → 22/48)
and USDA has confirmed the oracle right about that dressing — so it is a genuine model error and a
legitimate engineering target. ENFRIJOLADAS' real gap is its **chicken** portion (all three arms run
protein +33–48% over the oracle's 25 g), not its tortilla.

**Side finding, not chased:** extraction misread two Andaluz printed weights (30 g → 20 g, 50 g →
90 g). Found because a claim sourced from `find-weighted-dishes.ts` — which parses archived
*extraction* text — did not survive checking the photo. **Adjudicate from the photo, never from a
script's output** (lesson 4).

### 📚 History — these were the "next actions" and are all DONE

1. ✅ **Widen the fixture set — DONE 2026-08-09.** The set is **8 dishes**: the original three plus
   NEW YORK (brasero), French Fries and Coleslaw (polloteria), Gnocchi alla sorrentina (casa-nostra)
   and ENFRIJOLADAS (el-marcos). Adding more dishes later follows the same route:
   `scripts/find-weighted-dishes.ts` lists 120 printed-weight candidates, each needs a USDA recipe
   with real `fdc_id`s, and **Santiago approves every recipe personally.**
2. ✅ **B9 — the cross-model arm — DONE 2026-08-09.** `gpt-5.5-2026-04-23`, 4 runs × 3 draws, ~$0.47.
   **GPT-5.5 14–19/96 at 15.5–17.2% vs GPT-4o 24–27/96 at 21.0–21.2%.** Ranges non-overlapping —
   GPT-5.5 wins on macros. ⚠️ The first reading said "level, do not switch" and was **reversed** the
   same day by the PASTEL re-freeze. **It was nevertheless DECLINED for production on latency.**
3. ✅ **Pipeline-integrity arm — DONE 2026-08-09 (~$0.72).** 🔑 **It caught a latent production break
   that ten paid runs had missed:** `enrichBatch` hardcoded `temperature: 0`, which gpt-5.x rejects
   outright, so **switching `ENRICH_MODEL` alone would have 400'd every scan.** The benchmark could
   never have caught it — `bench-macros.ts:151` quietly drops the parameter for an overridden model,
   so the whole measured GPT-5.5 arm ran a request shape production cannot send. Fixed in `a9fce10`.
   **General lesson: a benchmark that reaches the model by its OWN path is not evidence that the
   DEPLOYED path works.** Re-runnable at any time: `deno run --allow-read --allow-write --allow-env
   --allow-net scripts/bench-pipeline.ts [model …]`.

🔴 **B9's VERDICT WAS REVERSED by the 2026-08-09 PASTEL fix — read this before quoting it.**
PASTEL AZTECA's oracle now includes its tortilla (Santiago's ruling; a pastel azteca is a tortilla
casserole the way a cheeseburger has a bun). Under the old, tortilla-free oracle GPT-4o and GPT-5.5
overlapped and the session concluded "task ceiling, do not switch models". Under the corrected
oracle the ranges **do not overlap**:

| model | failed/96 | mean abs error |
|---|---|---|
| `gpt-4o-2024-08-06` | 24–27 | 21.0–21.2% |
| `gpt-5.5-2026-04-23` | **14–19** | **15.5–17.2%** |

⛔ **RESOLVED — the model question is CLOSED, do not re-open it as a measurement task.** Santiago
considered the switch on 2026-08-09 and **declined it**. GPT-5.5 wins on macros but the
pipeline-integrity arm showed it is **~2.4× slower** on Stage 2 (101 s vs 41 s on a 55-item menu) and
it says mineral water has 252 kcal. `ENRICH_MODEL` stays `gpt-4o-2024-08-06`. Confound that still
stands and is now moot: GPT-5.5 rejects `temperature: 0`, so it ran at its default 1 and carries more
spread. App-wide write-up, kept outside this phase: **`docs/model-findings.md`**.

✅ **The "fix resolveGrams" idea is FALSIFIED, $0.** Protecting the principal component when fitting
made the failure count WORSE on both arms (GPT-4o 103→105, GPT-5.5 66→69 of 384). Production
`resolveGrams` is unchanged. Two claims from the previous session were corrected by measurement:
Coleslaw's scale factor is **exactly 1.00** in all 12 GPT-4o draws, so the fit is a no-op there and
cannot be its cause; and the severe compression is a GPT-5.5 phenomenon (scales 0.53–0.83) not a
pipeline one (GPT-4o 0.87–1.06).

✅ **The three portion disagreements were ADJUDICATED against USDA on 2026-08-09 ($0). Two are
closed and the oracle was NOT changed; the third turned out to be a different question entirely.**

| dish | USDA evidence | outcome |
|---|---|---|
| **Coleslaw** (dressing 20 g vs 30 g) | USDA's own default serving of coleslaw dressing is **31 g** (1 tbsp = 15.6 g). At 30 g the dish is 108 kcal/100 g, inside the real-product cluster (107–124). At 20 g it is 84 — **below every real coleslaw in FDC** bar the fat-free ones | **CLOSED. Oracle right at 30 g.** So B4's Coleslaw regression is **genuine model error** and a real target — the opposite outcome to the Caesar dressing episode |
| **ENFRIJOLADAS** (tortilla 60 g vs 72 g) | FNDDS corn tortilla: small **18 g**, medium **28 g** → 24 g each is the midpoint | **CLOSED. Oracle right at 72 g**, and worth only 2%. The dish's real gap is its **chicken** — all three arms run protein +33–48% over the oracle's 25 g |
| **Gnocchi** (150 g vs 110 g) | — | **NOT a portion dispute.** It is the printed-weight **scope** question — see "What is actually left" above |

**B5 is designed but shelved**, not falsified — see
`specs/2026-08-08-b5-preparation-and-oracle-dressing-design.md` and the log's "B5 premise re-derived"
entry. The re-freeze shrank its target from three dishes to one field on one dish.

⚠️ **Never put a food, dish or cuisine name into the nutrition step of `ENRICH_PROMPT`.** B11 did
(its "high carb" list was a roll-call of our own three fixtures) and it measurably made sweet corn
worse. `enrich_test.ts` now fails the build if one reappears.

📊 **Measured insight, not a rule — prompt wording has a poor track record here.** B11 and B13 each
spent a paid run on step-2 wording and each moved its targeted number by **zero**; the two changes
that did work (B10, B12) both took arithmetic *away* from the model and left it knowledge. That is
**two data points against wording and two for mechanism**, which is a prior to weigh in the next
brainstorm — not a closed door. If a hypothesis says wording is the lever *for a different reason*,
say what would falsify it and run it.

🧭 **The commands that tell you the truth, all $0:**

```bash
# Expect EXACTLY 2 failures, both named below. Do NOT pin the pass count - it grows
# whenever a test is added, and a pinned number here would be the very thing this
# block exists to prevent (it read "389" for a week while the suite passed 395).
# 2 failures = clean. 3+ = one is yours.
deno test --allow-all scripts/ supabase/
deno run --allow-read scripts/rescore-history.ts  # CURRENT score of every archived run
deno run --allow-read scripts/rescore-history.ts <run-id>… --by-dish   # specific runs, per dish
deno run --allow-read scripts/sim-scope-rule.ts   # $0: the printed-weight scope rule, A vs C

# $0. Did an arm change the MECHANISM, or just the number? Gram-answer distribution
# plus each dish's total mass against its ruled band, for any archived arm.
deno run --allow-read scripts/sim-gram-distribution.ts dual NOBOOST NOBOOST@r2 ROLE MASSCALL NOPUSH ORDER ORDER-nopush PIECE

# $0. Are MASS and COMPOSITION separable? Crosses each arm's mass with each arm's
# per-100 g recipe. THROWS if the control row misses its published score by >3 -
# a hand-rolled version of this read 88/108 for a control the harness reads 67.
deno run --allow-read scripts/sim-mass-composition-split.ts dual dual@r2 NOBOOST NOBOOST@r2 ROLE MASSCALL NOPUSH ORDER ORDER-nopush PIECE

# IS A DIFFERENCE REAL? Dish-level paired bootstrap + leave-one-dish-out. Run this
# BEFORE writing up any arm as a win - eval 164 retracted one for want of it.
deno run --allow-read scripts/sim-arm-significance.ts dual+dual@r2 NOBOOST+NOBOOST@r2

# Does aggregating the 3 draws help? (No - retired eval 164, kept so it stays answered.)
deno run --allow-read scripts/sim-median-of-draws.ts dual NOBOOST ROLE MASSCALL

# $0 CEILINGS - "if we fixed X perfectly, how many points would it be worth?"
# Run these BEFORE designing any arm: they have killed four ideas for nothing.
# Each derives its menus from the oracle and prints a CONTROL row that must equal
# the harness's published score; sim-mass-ceiling THROWS if it has not scored
# every oracle dish. A ceiling is not an arm - it reads the oracle's own answer.
deno run --allow-read scripts/sim-mass-ceiling.ts           # size
deno run --allow-read scripts/sim-accompaniment-ceiling.ts  # sides and sauces
deno run --allow-read scripts/sim-decomposition-ceiling.ts  # missing ingredients

# $0 replay - score ARCHIVED responses of any unweighted arm against the CURRENT oracle.
# This is what makes an oracle correction free; it calls no API.
# `dual` is the SHIPPED path (v32). --allow-env --env-file are REQUIRED even for a
# replay: probe-plate-arms.ts reads OPENAI_API_KEY at import time and throws
# without it, even though a replay calls no API.
deno run --allow-read --allow-env --env-file=.env.local \
  scripts/bench-unweighted.ts 3 <baseline|dual|NOBOOST|ROLE|MASSCALL|NOPUSH|ORDER|ORDER-nopush|PIECE|P|P10|PF|PD|A|A-cond|S3|SplitOnly> --replay

# $0. A LABELLED repeat run (--run r2) lives in its own archives. Replay it, and
# feed it to either sim as ARM@label. ALWAYS pass --run on a repeat or it
# overwrites its predecessor and the range is gone.
  scripts/bench-unweighted.ts 3 NOBOOST --replay --run r2

# PAID. Weighted set, one run of 3 draws. BENCH_ARM is optional (S3 | S4). ~$0.05.
BENCH_RUN_ID=iter-<name>-w1 [BENCH_ARM=S3] deno run --allow-read --allow-write \
  --allow-env --allow-net --env-file=.env.local scripts/bench-macros.ts

# PAID, ~$0.40 per arm. The MIXED-MENU harness: the same 8 weighted dishes scored
# INSIDE their own real menus, which is the regime production runs and the one
# bench-macros.ts is structurally blind to. Arms: mixed (today) | P.
# It sends ONLY the batches the fixtures land in - equivalent by construction,
# 77% cheaper. DO NOT add --full-menu to "be thorough": it costs 4.5x and buys
# nothing for the score (see the cost entry in the benchmark log).
deno run --allow-read --allow-write --allow-env --allow-net \
  --env-file=.env.local scripts/bench-mixed-menu.ts 3 <mixed|dual|P|P10|Pinline>

# $0 replay of the above. Add --full-menu to replay the 2026-08-17 whole-menu run.
deno run --allow-read scripts/bench-mixed-menu.ts 3 <mixed|dual|P|P10|Pinline> --replay
```

`rescore-history.ts` is the **source of truth for every number in these docs.** Any figure written
in prose is a snapshot of when it was written; that command is what is true now. All measurement
logic lives in `scripts/macro-measure.ts` and **must never be re-implemented anywhere** — see
lesson 28, and `scripts/macro-measure_test.ts` fails the build if it is.

ℹ️ **The suite's `2 failed` is noise — BOTH are known and neither is yours.** `N passed | 2 failed`
is a CLEAN run:

| red test | why it is noise |
|---|---|
| `scripts/tile-cut_test.ts` | Santiago ruled it unimportant; it tests the image tile cutter and Stage 2 never sees a photo |
| `scripts/macro-measure_test.ts` → *"only macro-measure.ts knows the archive eras"* | **a false positive.** The guard forbids the string `protein_per_100g` outside `macro-measure.ts`; `unweighted-oracle.ts` and `unweighted-oracle-build.ts` use it as an ORACLE COMPOSITION FIELD, not as archive-era detection. Red since 2026-08-13. **Left red deliberately — narrowing a measurement guard is Santiago's call** |

Any *other* failure is yours. Details in ②.

Then read:

1. ②'s **"Release scope decision"** — the numbered critical path and the POST-RELEASE list of
   things deliberately *not* to work on.
2. ②'s **"Lessons learned"** — lessons 1–28 are mistakes previous LLMs actually made in this
   codebase. Lessons 11–28 are the expensive ones. **Lesson 28 is the one to read first if you are
   about to touch anything that produces a number** — bad measurement code is worse than bad feature
   code, because it silently redirects every future iteration. Read them before designing any rule or
   predicting any score.
3. **`docs/superpowers/extraction-iteration-ledger.md`**, newest entries LAST — every experiment
   and what was measured. Read the last few for current state; do not re-run anything REJECTED.
4. **`AGENTS.md`** and **`CLAUDE.md`** — product scope, stack, and behavioural rules. Both govern.

⚠️ **Known contradiction, unresolved:** ① specifies Supabase auth; `AGENTS.md` says "Use Clerk.
Do not build custom auth." Neither is installed. Ask Santiago before any auth work.

## 2. Santiago's standing rules

These outlive any phase.

- **He personally decides** all fixture/oracle changes, extraction-convention rulings, photo
  adjudications, and **every live-run cost approval**. Present options with a recommendation and
  WAIT. State the dollar estimate before asking.
- **Use the `superpowers:systematic-debugging` skill for ANY debugging**, and
  `superpowers:brainstorming` for ANY brainstorming of new evaluations, iterations or solutions.
- **End-of-task reports must be SIMPLE and VISUAL.** Lead with tables, plain language, and gloss
  project jargon on first use. His approval depends on understanding — and a term that implies
  something *false* is worse than a verbose one. Before asking him to authorise anything, spell
  out what it is NOT.
- **Never quote a single run as quality — report the RANGE across runs.** The model returns a
  different but equally valid item list each call.
- **A numeric scorer pass is never a gate by itself.** Every live run's raw dump must also pass a
  by-hand audit against the menu photo for invented or unprinted items.
- **A frequency claim needs a denominator.** "Reproduces reliably" / "it's rare" are claims about
  a COUNT — record the count and the machine it ran on, or write neither. (This cost two sessions:
  eval 139 called a crash "reliable" from one occurrence, eval 140 called it "rare" from two runs
  whose machine was never established. Both were wrong.)
- **Ledger every experiment** in the iteration ledger before your session ends, and commit + push
  on `main` after every commit.

## 3. Closed — do not re-enter

These phases are finished. Their folders stay in place because the ledger references their paths,
but they are history, not work:

| Area | Where | State |
|---|---|---|
| Extraction Features 1–4 | roadmap "Feature Sequence" | CLOSED — frozen as regression gates |
| Per-page multi-photo wiring | critical path #1 | CLOSED |
| Dense-menu auto-cutter | critical path #2 | CLOSED |
| Client compression fidelity | critical path #3 | CLOSED |
| Horizontal/landscape menus + rotation | `docs/superpowers/horizontal-menus/` | CLOSED |
| TestFlight photo crash | `plans/2026-08-05-testflight-photo-crash-handoff.md` | SOLVED |

## 4. Before you build anything on a device

`plans/2026-08-05-testflight-photo-crash-handoff.md` has the environment traps — iCloud
`FinderInfo` breaking `codesign`, Metro's compiled-in port, verifying a shipped bundle actually
carries its env vars. **Each of those cost a session.** Read that file's trap section before any
local iOS build or EAS build.

## 5. Non-extraction work

The master roadmap covers **extraction only** — it says so in its own scope line. App design, UI
and product behaviour are governed by `AGENTS.md` (features, stack, architecture, UI rules) and
`DESIGN.md` (the design system, which is the source of truth for typography and styling).
