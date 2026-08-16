# Stage-2 Macro Enrichment Benchmark — Log

Single append-only log for this phase. Spec:
`specs/2026-08-07-stage2-macro-enrichment-benchmark-design.md`.
Plan: `plans/2026-08-07-stage2-macro-benchmark.md`.

**Evidence set:** oracle JSON, runner, this log, request/response archives, an
execution-evidence manifest, and three local raw draw archives. The baseline evidence
limitations below still apply.

Newest **Runs** entries go at the BOTTOM.

---

## Current Stage-2 behaviour (the thing every backlog item is measured against)

Recorded so backlog entries have a stated baseline to differ from. Traced 2026-08-07, edge
function v24.

- **One GPT-4o call per batch of 10 items**, all batches fired in parallel. `temperature: 0`,
  `seed: 17`, strict `json_schema`. A retry fires once if the model returns fewer items than
  sent; dropped items are backfilled with zeros at `confidence: "low"`.
- **One stage, not two.** There is no separate portion-estimation call. Ingredients and macros
  come out of the same request.
- **Emitted field order** (load-bearing — OpenAI strict mode generates fields in schema order,
  so this IS the chain of thought):

  ```
  name → description → price → category
    → ingredients[]  ({name, category} only — NO gram weight)
    → protein_g → carb_g → fat_g → estimated_calories
    → confidence → allergens
  ```

  Note calories already come **after** the three macros. What is missing is any per-ingredient
  or whole-dish gram commitment before the numbers.

---

## Research findings (2026-08-07) — read before designing any change

Full report: `research/2026-08-07-macro-estimation-prior-art.md`. It is dated evidence, not
status.

**What it settles:**

| Question we had | Answer | Effect on us |
|---|---|---|
| Is ±20% cal / ±30% macro defensible? | **Yes — keep it, do not tighten.** FDA's own labelling-compliance limit is 20%; restaurants' own stated calories are off ~18% at the mean and far more per item | Ruling stands, now evidence-backed |
| Does per-ingredient decomposition help? | **Yes, measured.** NutriBench's best result (GPT-4o + CoT, 66.82% Acc@7.5) uses exactly this; CoT beat plain prompting by +4.22 pp across 12 models | **B1 promoted** to first iteration |
| Should we build RAG over a food database? | **Not first.** In the one head-to-head, naive RAG did not reliably beat CoT and made GPT-4o-mini *worse*; CoT-only always won on natural servings | Deprioritised, **not forbidden** — see the 2026-08-08 ruling; a lookup needs a measured reason and Santiago's approval, not a blanket ban |
| Is the model's `confidence` label trustworthy? | **No.** Verbalized confidence is overconfident, AUROC ~0.5–0.65 — near chance | **Suppression must not key on it**; use dispersion across draws |
| Do Spanish/Mexican dishes degrade? | **Yes, documented.** Error rises with carb content and non-Western cuisine; translating dish names makes it worse | Keep Spanish names (we do); PASTEL AZTECA is the canary |
| Is batching 10 items safe? | **Probably not.** "Lost in the Middle" shows >30% drop for middle positions; batch-prompting work suggests ~4 items for hard tasks | **B2 elevated** from curiosity to likely-real defect |
| Is a careful human a reliable oracle? | **Only with database lookups.** Unaided nutritionists scored 42.45% vs GPT-4o CoT's 60.56%; *with* lookup the best reached 59.72% | **Changes how Santiago builds the oracle** |

**Two findings nobody had considered:**

- **Raw vs cooked weight can misstate a portion by 20–35%** — larger than our entire tolerance
  band. `ENRICH_PROMPT` says nothing about it. First-order error source (new item **B6**).
- **An explicit "insufficient information" option measurably increases safe abstention**, far
  more than prompt tweaks. Models under-abstain unless given the option outright (new item **B7**).

**What the research explicitly leaves for us to measure:** whether per-ingredient grams lowers
*our* error; per-macro accuracy for protein/fat/calories (NutriBench's headline is carbs only);
the batch-size curve on this pipeline; and the raw-vs-cooked convention for these menus.

**Sequencing note — research recommends changes we are deliberately not making yet.** Its
"Stage 1 — do now" list (grams field, weight conventions, abstain path) is sound, but our method
is baseline-first: without a measured before, no after means anything, and lesson 17 requires
producing both halves ourselves rather than quoting one. The baseline is one cheap run. It goes
first, then Stage 1 becomes iteration 1.

---

## Failure decomposition of baseline-002 (2026-08-08, $0, from the archived draws)

Splitting each item's error into **how many grams** vs **how dense per 100 g** separates a
portion mistake from a nutrition mistake. On this set they come apart cleanly, and the two
failing items fail for **different reasons**:

| item | grams agreed? | oracle kcal/100g | model kcal/100g | reading |
|---|---|---:|---:|---|
| CESAR | yes, both 200 g | 231 | 175 | −24% density — **the whole error** |
| Salmone | **no — 348 vs 200** | 242 | **275** | model is *denser* than the oracle |
| Pastel | yes, both 300 g | 151 | 167 | +11%, comfortably in band |

- **Salmone is a scope error, not a nutrition error.** Per gram the model is richer than USDA.
  It fails only because it priced a 200 g plate while the oracle prices 348 g (200 g salmon
  *plus* separately counted sauce, vegetables and a 45 g baguette). Arithmetic illustration
  only — **not a predicted score**: keeping the model's own per-gram numbers and using 348 g
  gives calories +13.5% PASS, protein +16.6% PASS, fat −14.6% PASS, carbs +48.6% FAIL. Scope
  alone would take Salmone from three failed fields to one. **This confirms B3.**
- **CESAR is a density error, almost entirely fat.** 9.4 g of missing fat accounts for 85 of the
  112 missing calories. The oracle's 30 g of Caesar dressing carries 17.3 g fat / 163 kcal —
  over half the dish's fat and more than the chicken. The hand audit shows the model named all
  five ingredients correctly; it never committed to a quantity for any of them, so its portion
  assumption is unrecoverable. **This is the shape B1 addresses.**
- **A blanket "estimate more fat" instruction cannot work.** CESAR needs +47% fat, Salmone
  +104%, Pastel is already exact at +0.7%. A global +30% nudge puts Pastel at +30.8% — outside
  its band. Any fix must make the model reason per dish rather than carry a bias. Record this
  before designing a prompt change.
- **B8 is answered and dead on this set.** Calorie dispersion across draws was 0.0% for all
  three items, including both permanent failures. Dispersion cannot separate pass from fail here.

## External LLM corroboration of the oracle (2026-08-08, no cost, NOT a measurement)

Santiago put the oracle-vs-model numbers to independent LLMs **without** the pass/fail bands,
asking only which was more consistent with the ingredients and credible food-composition data.
Source: `~/Downloads/OracleModelInsights.md` (outside the repo).

Both independently reconstructed each dish from per-100 g composition values and judged the
**oracle better on all three items** — decisively on CESAR and Salmone, narrowly on Pastel:

| dish | their reconstructed range | oracle | model |
|---|---|---:|---:|
| CESAR | 460–490 kcal | 462 | 350 |
| Salmone | 800–900 kcal | 843 | 550 |
| Pastel | 450–500 kcal | 452 | 500 |

Two observations worth carrying into design work:

1. **One of them raised the 200 g scope ambiguity unprompted** — *"la única salvedad es el peso:
   si '200 g' significa el peso total del platillo…"* — independently reaching the same
   conclusion as the density decomposition above. Independent support for B3.
2. **Both named the same failure mode:** the model systematically underestimates energy-dense
   ingredients — dressing, cream, cheese, oil. One put it sharply: the model's 25 g of fat for
   Salmone is roughly what 200 g of salmon contributes *by itself*, leaving essentially zero fat
   for the cream sauce and bread.

**Limits, stated so this is not over-read.** These are LLM reconstructions, not laboratory
values and not a second oracle; the restaurants publish no recipe, so no exact answer exists.
They were shown our numbers, which invites anchoring. **Nothing here changes the frozen oracle
and nothing here counts as a run.** Its only legitimate use: raising confidence that we are not
tuning the model toward a wrong target before spending on B3.

---

## Backlog — not started

**Rule: nothing here starts without a failure list from a real run to justify it.** A predicted
gain is a hypothesis until measured (lesson 16); a confident wrong estimate sends the next
session chasing the wrong work. Research raising the prior on an item is not a measurement of it.

### B1 — Per-ingredient grams, same call

Add a `grams` field to each `ingredients[]` entry so the model commits to portions out loud
before totalling. Today it records *what* is in the dish and never *how much*, so its portion
assumption is unrecoverable from its output — and portion error is the leading suspect for
macro error.

Matches OpenAI's own documented guidance (`META_PROMPT`: *"field order matters. any form of
'thinking' or 'explanation' should come before the conclusion"*).

**PROMOTED to iteration 1 by the 2026-08-07 research.** NutriBench's best configuration
(GPT-4o + Chain-of-Thought, 66.82% Acc@7.5, MAE 8.61 g on carbs) is exactly this per-item
decomposition, and CoT beat plain prompting by **+4.22 pp averaged over 12 models**
(arXiv:2407.12843, ICLR 2025). The report still lists "whether explicit per-ingredient grams
lowers YOUR macro error" as unmeasured — so this runs as a measured A/B against the baseline,
not as an assumed win.

Cost: no extra calls, slightly more output tokens.

### B2 — Batch-size sweep — ELEVATED, likely a real defect

`ENRICH_BATCH_SIZE` is 10 and has never been varied.

**The 2026-08-07 research moved this from curiosity to probable defect.** "Lost in the Middle"
(arXiv:2307.03172, TACL 2024) measured a **>30% accuracy drop** when the needed content sat in
the middle rather than at the edges of a multi-item context, replicated across six model
families including GPT-4. Batch-prompting work puts the safe ceiling around **~4 items** for
reasoning-heavy tasks. **In a 10-item batch, items 4–7 sit exactly in the vulnerable middle.**

Revised design: test **1 vs 3 vs 10** (not 5/15/20 — the question is whether 10 is already too
many, not how far past it we can push), and **track each item's position within its batch**.
The prediction to test: middle-positioned items carry higher macro error than edge items.

⚠ Still not observable on the three-item set — three items is one call at any batch size. Needs
a larger item set drawn from the archive.

### B3 — Printed-weight scope — convention now recommended, still unmeasured

Whether a printed weight means the whole plated dish or one component. `ENRICH_PROMPT` says
"prefer printed weights over guesses" and is silent on scope. `Salmone toscano … 200g` served
with a baguette is the live case in the starting set.

**Research answer: no regulation resolves this.** Restaurant dishes are non-prepacked food; EU
1169/2011 mandates only allergen info for them, and net-weight rules apply to pre-packed goods.
The defensible *convention* — from butchery portion-control practice and drained-weight logic —
is that **a printed weight denotes the principal named component, not the fully plated dish**.
Encode that convention, estimate accompaniments separately, and emit the assumption. Do it as
part of iteration 1 only if the baseline shows the model getting it wrong.

### B4 — A dedicated portion/volume estimation stage *(added 2026-08-07, Santiago)*

> ✅ **DONE — and it did NOT need the second call described below.** Shipped 2026-08-08 as
> `fae3291` / `ff93de2` / `950c334` / `3ce44b7` in a cheaper shape: one call, with the model stating a
> **conventional serving** per ingredient plus a `within_printed_weight` tag, and `resolveGrams` fitting
> those to the printed weight. Result: **0 failed field/draws of 36**, the first clean sweep of the
> phase. Design in `specs/2026-08-08-b4-portioning-design.md`; measurements in the **iter-b4-001**
> notes. The second-call variant below is untried and now unnecessary — keep it only as the fallback
> if the single-call result fails to reproduce.

Split Stage 2 into two calls: **(1)** estimate grams — per ingredient and/or total dish weight —
then **(2)** compute macros from those grams. Today both happen in one request.

**Distinct from B1, and the distinction matters:** B1 keeps one call and adds fields; B4 adds a
second call. B4 gives the portion step its own full attention budget and makes the intermediate
auditable and separately gradeable, at roughly double the enrichment cost and latency. Run B1
first — if simply writing the grams down inside one call closes the gap, B4 is unnecessary
work.

**Provenance:** suggested by a reconstruction of Cal AI's pipeline, which shows portion/volume
estimation as its own stage between food recognition and nutrition enrichment. See the
provenance caveat at the bottom of this section.

### B5 — Chain-of-thought field-order sweep *(added 2026-08-07, Santiago)*

Field order is the chain of thought, so reordering the schema is a real, cheap experiment — no
extra calls, one schema edit per arm. Arms worth testing against the current order:

| Arm | Order after `ingredients[]` | Rationale |
|---|---|---|
| **A — current** | `protein_g → carb_g → fat_g → estimated_calories` | baseline |
| **B — grams first** | `total_grams → protein_g → carb_g → fat_g → estimated_calories` | commit to portion before any macro |
| **C — calories early** | `estimated_calories → protein_g → carb_g → fat_g` | anchor on the number humans estimate best, then decompose |
| **D — grams + calories first** | `total_grams → estimated_calories → protein_g → carb_g → fat_g` | the Cal AI-implied order |

Score every arm on the same oracle with the same draws. Note arms C and D risk the macros being
back-fitted to a calorie guess rather than derived from ingredients — which is exactly what the
benchmark would reveal.

**Related option surfaced by this ordering question, not requested — flagged, not scheduled:**
calories are a deterministic function of macros (Atwater factors: 4 kcal/g protein, 4 kcal/g
carb, 9 kcal/g fat). So `estimated_calories` could be **computed in code** rather than asked of
the model, guaranteeing internal consistency. Worth knowing the current model output is often
*not* self-consistent under those factors — **unverified, check it against the baseline's
archived responses for $0 before treating it as a finding.**

### Provenance caveat for B4 and B5

The Cal AI pipeline description behind these two is a **reconstruction from public evidence via
a Perplexity prompt — not confirmed documentation from Cal AI.** Treat it as a source of
testable ideas, never as established fact about what Cal AI does. The ideas stand or fall on our
own measurements regardless of whether the reconstruction is accurate.

Partly corroborated by the 2026-08-07 research independently: photo apps of this class do use a
separate portion-estimation step, and **portion estimation is reported as their weak link
(accuracy as low as ~39%)** — which supports B4 being worth testing *and* warns that a separate
stage is not automatically accurate.

### B6 — Raw vs cooked weight convention *(added 2026-08-07, from research)*

`ENRICH_PROMPT` says nothing about whether a weight is raw or cooked. USDA's cooking-yield
tables put meat yields around **65–80%** (100 g raw → ~70 g cooked), so treating one basis as
the other **misstates the portion by 20–35% — larger than our entire tolerance band.** This is a
first-order error source hiding in plain sight.

Fix shape: state a convention in the prompt (printed meat weights are conventionally raw/
as-purchased), apply an explicit yield factor when converting, and emit which basis was used.
No regulation settles this either — it is a convention we pick and validate.

### B7 — Explicit `insufficient_information` abstain path *(added 2026-08-07, from research)*

For the vague-description phase. The measured finding: **providing an explicit abstention option
increases safe abstention far more than prompt tweaks or bigger models**, and models
systematically under-abstain without it (AbstentionBench arXiv:2506.09038; MedAbstain
arXiv:2601.12471). NutriBench itself allowed a "no answer" response and reported answer rate as
a first-class metric — precedent in this exact domain.

Fix shape: an explicit `insufficient_information` output value, **plus** a hard heuristic gate
routing name-only items (37% of the archive) and promotional-only names to it. Expect the model
to under-abstain even with the option, so the gate is not optional.

### B8 — Replace confidence-driven suppression with sampling dispersion *(added 2026-08-07, from research)*

**This supersedes the plan of using the model's `confidence` field to flag weak items.**
Verbalized high/medium/low confidence is measurably poorly calibrated — overconfident, ECE ≈0.1
even at ≥70B, and **AUROC ~0.5–0.65 as a failure predictor, i.e. near chance** (Xiong et al.,
arXiv:2306.13063). Confidence scores also collapse to saturated values, which defeats
thresholding.

Better-supported signal: **dispersion of the numeric estimate across multiple draws.** We
already run and archive 3 draws, so the first version of this measurement costs **$0** — compute
the coefficient of variation of `estimated_calories` per item across the baseline's draws and
check whether high dispersion predicts "outside tolerance."

Keep the `confidence` label as a coarse UI hint at most; do not gate on it.

### B10 — Per-ingredient MACROS, summed in code *(created by iter-b1-001, 2026-08-08)*

**This is the direct successor to B1 and the only backlog item with measured evidence behind it.**

iter-b1-001 established that the model **portions well and totals badly**: its gram lists hit the
printed weight exactly on 2 of 3 dishes, and pricing those grams scores *better* than the macros
it reported on 2 of 3. The arithmetic step is where the accuracy is lost.

**Fix shape:** extend each `ingredients[]` entry from `{name, category, grams}` to
`{name, category, grams, protein_g, carb_g, fat_g}`, then **compute the item totals in code** by
summing, with `estimated_calories` derived by Atwater (4/4/9). The model's `protein_g`,
`carb_g`, `fat_g` and `estimated_calories` at item level stop being model outputs and become
computed values.

**No external data is involved.** This adds no HTTP call, no key, no latency and nothing that can
be unavailable at runtime. The **model still supplies every nutrition value**, exactly as today;
only the addition moves into code. (The 2026-08-07 no-database ruling was withdrawn on 2026-08-08
and never covered arithmetic anyway — the point is now moot, but stated so nobody re-litigates
it.)

**Why it should generalize.** No dish names, no cuisines, no wording patterns, no language
assumptions — it asks the same four numbers per ingredient regardless of menu. And summation is
the one part of the task a computer cannot get wrong.

**Predictions to state before running (all unmeasured):**
- Totals stop being multiples of 5 — **guaranteed by construction**, since they are summed, not
  emitted. This makes P1 a non-test for this arm; find a different falsifier.
- Atwater self-consistency becomes exact by construction (gap 0), removing the 14.6% drift seen
  in iter-b1-001.
- The open risk: per-ingredient macros may be *individually* wrong even when portions are right.
  That is precisely what this arm measures, and it will be visible per ingredient for the first
  time.

**Cost:** no extra call; more output tokens (~2× the ingredient block). One benchmark run,
3 draws, ~$0.03.

**Do first:** this outranks B4, B5 and B6 — it is the only item the run data points at directly.

### B11 — The vegetable/sauce carbohydrate over-count *(created by iter-b10-001, 2026-08-08)*

**The only systematic defect left, and the first one visible at ingredient level.**

iter-b10-001 made carbs the sole out-of-band field on CESAR and PASTEL. The per-ingredient
numbers show the model over-states carbohydrate for vegetables and sauces by large factors, while
being accurate on obvious carb foods:

| ingredient | model g | model carb_g | USDA at that weight | factor |
|---|---:|---:|---:|---:|
| salsa de tomate | 50 | 10 | 2.7 | **3.7×** |
| elote (sweet corn) | 30 | 15 | 5.6 | **2.7×** |
| croutones | 30 | 20 | 19.1 | 1.05× ✓ |
| frijoles | 70 | 20 | 17.7 | 1.13× ✓ |

Bread, croutons and beans are fine. Vegetables and sauces are not. The model appears to reach for
a round "this is the carb one" number rather than the ingredient's real composition — note 15 g
carb from 30 g of corn implies **50% carb by weight**, when sweet corn is 18.6%.

**Candidate fixes, cheapest first — none measured:**
1. **Prompt only:** name the trap directly — most vegetables and tomato-based sauces are
   mostly water and contribute far less carbohydrate than their volume suggests; reserve high
   carb values for grains, bread, tortilla, rice, potato, corn kernels, legumes and sugar. Zero
   cost, no new call, no dish-specific rule.
2. **Static per-100 g anchors in the prompt text** for the dozen most common menu ingredient
   classes (explicitly allowed — prompting, not a lookup).
3. **A sanity guard in code:** reject an ingredient whose macros exceed its own gram weight, or
   whose carb fraction exceeds a category ceiling. Deterministic, testable for $0. Risk: a
   ceiling is a heuristic with a worldwide blast radius — needs a wide archive check first.

**Do first:** option 1. It is the smallest diff, targets the measured defect directly, and its
falsifier is clean — if vegetable carb values do not fall, the model's per-ingredient nutrition
knowledge is the limit and options 2–3 become the real candidates.

**A second, separate observation to carry:** CESAR's carbs also suffer a *portion* error
(croutones 30 g vs the oracle's 20 g) whose carb density was correct. Portion and composition are
now separable defects — do not conflate them when reading the next run.

### B12 — Per-100 g composition, scaled in code *(created by iter-b11-001, 2026-08-08)*

**The successor to B11, and the same trick B10 already proved once.**

iter-b11-001 established that prompt wording is not the lever: the model's carb value is a round
number attached to the ingredient's *category tag* (20 or 30 g for anything tagged `carb`), not a
composition it reasoned about. Telling it "vegetables are mostly water" did not change the number;
naming `corn kernels` as a high-carb food made it worse.

**Fix shape:** stop asking for `carb_g` (an amount) and ask for `carb_per_100g` (a composition
fact), then compute `carb_g = carb_per_100g × grams / 100` in code — extending
`sumIngredientMacros`, which already owns the arithmetic. Same for protein and fat, so the three
fields stay symmetrical.

**Why this should work where B11 did not.** It removes the step where a round guess is possible.
"Sweet corn is about 19 g carbohydrate per 100 g" is a fact GPT-4o holds; "30 g of sweet corn
contributes N g of carbohydrate" is a multiplication it was never doing, so it reached for 20. This
is exactly the B10 pattern — take away the arithmetic, leave the knowledge — applied one level
down, and B10's own finding was that the model's guessing was never arithmetic failure but
missing parts.

**Also do, in the same change:** delete `corn kernels` from B11's sentence, or delete the sentence
entirely. It is measured net-negative as written. Keeping it while changing the field would confound
the run.

**Predictions to state before running:**
- Corn's carb falls from 20 g to roughly 5–6 g at 30 g. This is the single clean falsifier.
- CESAR's carb failure **does not move**, because it is a portion error (croutons 30 g vs 20 g) —
  see iter-b11-001 Finding 4. Do not count that against B12.
- Ingredient carb values stop being multiples of 5, the same way item totals did under B10.

**Cost:** no extra call; roughly the same output tokens. One run, 3 draws, ~$0.04.

**If B12 also fails**, the ceiling is the model's per-100 g knowledge itself, and B11 option 2
(static per-100 g anchors written into the prompt for common ingredient classes) is the remaining
free lever before anything with a runtime cost is considered.

### B13 — Restore a fat/preparation signal, worded for every menu *(created by iter-b12-001, 2026-08-08)*

> ✅ **DONE and FALSIFIED — see the iter-b13-001 notes.** Shipped as `06fd49a` with a sharper wording
> than described below (the negative, not the inclusive form, because step 2 *already* said "as
> served" and "fat absorbed or added in cooking counts" during iter-b12-001). It moved **zero** fat
> composition values, so the **fat prediction below failed outright**; the other two held (corn stayed
> at 19 g/100 g, CESAR carb still failed on 2 of 3 draws). Re-running a *rephrasing* of this would
> repeat a measurement we already have — but that is a prior, not a prohibition (see Rulings, "How
> to read the track record").

**The one-variable follow-up that resolves B12's confound.**

iter-b12-001 removed step 2's *"(e.g. grilled vs fried, dressing and cream are mostly fat)"* in the
same commit that introduced per-100 g composition. Fat then fell on all three dishes, and the
per-ingredient numbers show the model answering with **plain, unprepared reference entries** — its
fat is below the oracle on all six fats measured (dressing 40 vs 57.8, croutons 10 vs 18.3, chicken
3.6 vs 5.45, salmon 13.4 vs 18.4, cream 30 vs 35.6, parmesan 25.8 vs 28.8).

**Fix shape:** add one clause to step 2 stating the *basis* rather than any food — the composition
wanted is the ingredient **as it arrives at the table**, including fat absorbed in frying or added
in sauces and dressings, not the plain or raw reference form. **It must name no food, no cuisine and
no dish**; the B11 lesson is that a food list in the nutrition step is a nutrition claim about our
own fixtures, and `enrich_test.ts` now guards it mechanically.

**Change nothing else.** Per-100 g fields stay exactly as B12 shipped them, so the run reads as a
clean A/B against iter-b12-001.

**Predictions:**
- Fat rises on all three dishes; CESAR fat returns inside band.
- **Carbohydrate composition does not regress** — corn stays near 19/100 g. If it does regress, the
  per-100 g win was fragile and that is worth knowing.
- CESAR carb still fails: it is a portion error and nothing here touches portions.

**Cost:** ~$0.04, 3 draws.

**After B13, whatever it shows, the next target is PORTIONING** — B12 established that every
surviving carbohydrate error is a portion error (CESAR's croutons 30 g vs 20 g; Salmone's baguette
collapsing 50 g → 10 g between draws). That is now the largest untouched source of error in the
phase, and B4 (a dedicated portion/volume stage) is the backlog item that addresses it.

### B14 — Widen the fixture set *(✅ DONE 2026-08-09 — see the `-w` runs)*

**Why now:** three dishes is why the failure count saturated. After the oracle re-freeze,
**baseline-002 and iter-b4-001…004 all score 0 of 36** — a naive pipeline and our best one are
indistinguishable on the headline metric. More dishes is the only thing that restores its power.

**Where the dishes come from — Santiago's direction:** the data the extraction phase already
produced. Not new photography, not invented items.

```bash
deno run --allow-read scripts/find-weighted-dishes.ts    # $0, no model calls
```

surveys every archived extraction dump in `scripts/fixtures/caches/` and lists **120 distinct
dishes carrying a printed weight**. CESAR itself came from that corpus (menu `andaluz`, which alone
carries a dozen `(200 g)` items). Printed weight is the selection criterion because it is what B4's
mechanism keys off — `printed_total_g` and `within_printed_weight` — so a dish without one exercises
less of the pipeline.

**What each new dish needs**, same standard as the existing three:
1. An oracle recipe of USDA FDC ingredients, each with a real `fdc_id`, `grams`, `basis`
   (`raw` | `cooked` | `prepared`) and `per_100g`.
2. Dish totals that are the exact sum of those ingredients — `bench-macros_test.ts` now fails the
   build otherwise.
3. An `assumed` note recording every judgment: what the printed weight covers, what sits outside it,
   and why each entry was chosen.
4. **Santiago's personal approval of the recipe.** Unchanged ruling.

Tooling: `scripts/usda-oracle.ts` exposes `searchFoods` and `fetchNutrients` against the free FDC API
(key `USDA_FDC_API_KEY` in `.env.local`), plus `sumRecipe` and `validateRecipe`.

**Two traps the current fixtures already taught — do not repeat them:**
- **Never take the richest USDA entry when several are defensible.** The Caesar dressing sat at 57.8 g
  fat/100 g — the top of ~40 entries whose median was 36.7 — for six runs, and made the *model* look
  wrong. Survey the spread first and prefer the median of real products.
- **Beware a dish whose defining ingredient is unprinted.** PASTEL AZTECA is a tortilla casserole
  whose menu never says tortilla; holding the printed 300 g while excluding it inflates everything
  else (cheese to 20.5% of plate weight). Santiago ruled to leave it, and it is why PASTEL cannot be
  used as a portion target. A new fixture with this shape would import the same defect.

**Sequencing note:** widening changes the yardstick. Every archived run must be re-scored afterwards —
`deno run --allow-read scripts/rescore-history.ts` — and the checkpoint's recorded figures updated,
exactly as the 2026-08-08 re-freeze required.

#### B14 outcome — ✅ five dishes approved, built and measured (2026-08-09)

Santiago approved the five dishes, their recipes, the sub-3 g scoring floor and both paid arms on
2026-08-09. All of it is measured and committed — see the `-w` rows in the Runs table. The set is
now **8 dishes**, and every figure "of 96" belongs to it.

| dish | menu | printed | eaten | oracle kcal / P / C / F |
|---|---|---|---:|---|
| NEW YORK | brasero | 400gr | 430 g | 1257.7 / 103.1 / 0.8 / 93.9 |
| French Fries (300gr) | polloteria | 300gr | 165 g finished (from 300 g raw) | 409.2 / 6.2 / 52.5 / 20.1 |
| Gnocchi alla sorrentina | casa-nostra | 180g | 180 g | 242.0 / 9.3 / 22.3 / 13.1 |
| ENFRIJOLADAS (135gr.) | el-marcos | 135gr. | 135 g | 253.7 / 13.5 / 36.1 / 6.9 |
| Coleslaw (150gr) | polloteria | 150gr | 150 g | 162.7 / 1.5 / 15.3 / 10.6 |

Every ingredient carries a real `fdc_id`, and each `assumed` note records the spread that was surveyed
and why that entry was taken over its siblings — the anti-trap discipline the Caesar dressing taught.

**Two blocking questions this surfaced, both Santiago's to rule on:**

1. **NEW YORK: is the printed 400gr raw or cooked?** The oracle currently reads it as COOKED, following
   the convention Salmone toscano already uses. Steakhouses commonly print the RAW cut weight; if that
   is the right reading, the cooked portion is ~280 g at the USDA ~70% yield and every total for this
   dish drops ~30%. This is **B6 (raw vs cooked) arriving as a live fixture decision**, not a
   hypothetical.
2. **A percentage band grades noise on a sub-gram field.** Two new fields land under 3 g — NEW YORK
   carb 0.82 g (a steak has no carbohydrate; its whole carb figure is chimichurri parsley) and Coleslaw
   protein 1.54 g. At ±30% those bands are 0.58–1.07 g and 1.08–2.01 g, so a model answering "0" or "2"
   fails on a difference no diner could perceive. The scorer already concedes the point at exactly zero
   (`ZERO_ORACLE_ABS_ALLOWANCE_G = 3`: when the oracle is 0, pass within ±3 g absolute). Extending that
   floor to *any* oracle value under 3 g is the same rule, and it **cannot disturb any historical
   number** — the smallest field across the original three fixtures is CESAR's 18.4 g carb. **Not
   applied; tolerance bands change only by ruling.**

### B9 — Cross-model comparison arm *(✅ DONE 2026-08-09 — GPT-5.5 wins; see `b9-gpt55-w1…w4`)*

> ⚠️ **Read the result with the PASTEL re-freeze, not without it.** Scored against the pre-2026-08-09
> oracle this arm looked level and produced a "do not switch models" conclusion. That conclusion was
> **reversed** the same day. Current fourth-re-freeze figures: GPT-5.5 **26–31/96 at 28.6–30.5%** vs
> GPT-4o **36–39/96 at 34.8–35.0%**. App-wide write-up: `docs/model-findings.md`. The design notes below are kept as
> the record of how the arm was specified.

Run the **unchanged** benchmark against a newer OpenAI model alongside the pinned
`gpt-4o-2024-08-06`, so the report reads **USDA oracle vs GPT-4o vs <newer model>** on the same
three items, same prompt, same schema, same bands.

**What this is NOT:** not a pipeline change, not a prompt change, and not a production model
switch. It is one extra column in the benchmark table. Nothing about `ENRICH_MODEL` in
`supabase/functions/analyze-menu/` moves unless a measured result justifies it later.

**Do not hardcode a guessed model ID.** Before spending, list the account's available models
(`GET https://api.openai.com/v1/models`) and pick the newest **dated snapshot** — the same
pinning discipline as commit `0476481`; a floating alias is what made baseline-001 historical
rather than reproducible. Record the exact snapshot string in the run entry.

**Open risk to check before believing any result:** a newer model may not accept
`temperature: 0` / `seed`, and reasoning-family models may reject or reinterpret them. If the
run cannot use identical parameters, that is a **confound**, not a footnote — record it in the
run entry and do not compare the two columns as if they were controlled.

Cost shape: same as a baseline (3 draws + 1 mirror), per additional model. Needs Santiago's
explicit paid-run approval like any other run.

**Sequencing:** this is a measurement arm, not a fix. It answers "is our failure list a GPT-4o
problem or a task problem?" — which is worth knowing *before* spending iterations on prompt
work that a model upgrade would have closed anyway.

---

## Runs

*(baseline-001 is recorded below.)*

> ⚠️ **TWO ERAS OF NUMBERS LIVE IN THIS TABLE. Never compare across them.**
> - Rows scored **of 36** are the retired **3-dish** set (CESAR, Salmone, PASTEL).
> - Rows scored **of 96** are the current **8-dish** set (B14, 2026-08-09 onward).
> - Every row except the `-w` runs was also written BEFORE the 2026-08-09 PASTEL tortilla
>   re-freeze, so its figures are as-published-then.
>
> **The current value of any archived run is whatever `deno run --allow-read
> scripts/rescore-history.ts` prints today.** That command is the source of truth; this table is
> the narrative around it.

| # | date | what changed | result (range across draws) | verdict |
|---|---|---|---|---|
| baseline-001 | 2026-08-07 | nothing — pipeline as shipped | CESAR 0/3 · Salmone 0/3 · Pastel 2/3 | FAIL — baseline establishes failures for portion/fat and calorie estimation; no pipeline change made |
| baseline-002 | 2026-08-08 | nothing — reproducible `gpt-4o-2024-08-06` pin | CESAR 0/3 · Salmone 0/3 · Pastel 3/3 | FAIL — pinned baseline confirms CESAR and Salmone failures; no pipeline change made |
| baseline-002r | 2026-08-08 | **oracle only** — printed-weight rule applied to all three dishes; **$0, no new model call** | CESAR 0/3 · Salmone 3/3 · Pastel 0/3 | FAIL — 9 failed field/draws (was 15). Re-score of the SAME archived baseline-002 responses against the corrected oracle |
| iter-b1-001 | 2026-08-08 | **B1** — required per-ingredient `grams` + prompt derives totals by summing (`1768a1d`); $0.023 | CESAR 0/3 · Salmone 0/3 · Pastel 0/3 | **REGRESSION on the tally** (14 failed field/draws vs 9) — but the portions are now good and auditable. NOT deployed. See notes: this run produced the phase's most decisive diagnostic |
| iter-b10-001 | 2026-08-08 | **B10** — per-ingredient macros, item totals summed in code, calories by Atwater (`1ce5139`); $0.036 | CESAR 0/3 · Salmone 2/3 · Pastel 0/3 | MIXED — 9 failed field/draws, same as baseline. **Calories, protein and fat all improved; CARBS is now the single systematic defect.** NOT deployed |
| iter-b11-001 | 2026-08-08 | **B11 option 1** — one prompt sentence naming the vegetable/sauce carb trap (`766be47`); $0.034 | CESAR 0/3 · Salmone 3/3 · Pastel 0/3 | **FALSIFIED — the targeted number did not move.** 6 failed field/draws under the beans tolerance (ties baseline, beats b10's 7), but PASTEL's carb sum is 50 g in *both* runs and the sentence made sweet corn WORSE. Creates **B12**. NOT deployed |
| iter-b12-001 | 2026-08-08 | **B12** — per-ingredient composition asked PER 100 g and priced in code; B11's food list deleted; $0.042 | CESAR 0/3 · Salmone 1/3 · Pastel 0/3 | **SPLIT: composition SOLVED, tally REGRESSED.** Per-100 g values now match USDA to the decimal (corn 19 vs 18.7; the B11 defect is gone) and every surviving carb miss is a PORTION error. But 11 failed field/draws under the beans tolerance (worst since B1) — fat fell on all three dishes. **Confounded: two things changed.** Creates **B13**. NOT deployed |
| iter-b13-001 | 2026-08-08 | **B13** — one step-2 clause naming the raw reference figure as the wrong answer (`06fd49a`); $0.042 | CESAR 0/3 · Salmone **3/3** · Pastel 0/3 | **FALSIFIED, yet the best tally of the series.** Not one fat composition value moved (CESAR fat −35.5% in all 3 draws of BOTH runs) — but portions stabilised and the count fell 11 → **6**, tying baseline. The gain is NOT attributable to the clause. Fat now decomposes to portioning like carbs did. Points to **B4**. NOT deployed |
| iter-b4-001 | 2026-08-08 | **B4** — model states a conventional serving per ingredient + tags what the printed weight covers; code fits it (`fae3291`, `ff93de2`, `950c334`, `3ce44b7`); $0.049 | CESAR **3/3** · Salmone **3/3** · Pastel **3/3** | **0 failed field/draws — the first clean sweep of the phase**, beating baseline's 6 for the first time. Mean abs error **16.7%**, also the best. Portions unfroze after five static runs: the model tagged PASTEL's beans OUTSIDE the printed weight unprompted, closing a −21.1% total error frozen since iter-b1-001. **Caveat: 13 of 36 fields sit within 5pp of their band edge.** NOT deployed |
| iter-b4-002/003/004 | 2026-08-08 | **reproduction** — identical code, no change under test; $0.148 | 8/9 · 9/9 · 8/9 item-draws | **HOLDS.** 0 / 1 / 0 / 1 failed field/draws across the four runs — **2 of 144**. Mean abs error 16.1–17.3%. Both failures are the same defect: PASTEL's cheese serving dropping 50 g → 30 g in 2 of 12 draws. Beans tagged OUTSIDE in **12/12**. NOT deployed |
| **baseline-w1…w4** | 2026-08-09 | **B14 widened set, 8 dishes** — baseline arm; the pre-B1 prompt, run from a worktree detached at `ce91e91` so it is the real prompt and not a reconstruction; $0.52 | **27–28/96**, 33.5–33.7% mean abs error | Fourth re-freeze: the raw-fries oracle helps this archived arm. Reference only; not deployed. |
| **iter-b4-w1…w4** | 2026-08-09 | **B4 on the widened set**, unchanged code; $0.52 | **36–39/96**, 34.8–35.0% | Fourth re-freeze: cooked-fries estimates now fail the raw-fries target. B4 remains deployed as v28; no production change. |
| **b9-gpt55-w1…w4** | 2026-08-09 | **B9 cross-model arm** — `gpt-5.5-2026-04-23`, same prompt, schema and bands; ~$0.47 | **26–31/96**, 28.6–30.5% | **GPT-5.5 still beats GPT-4o on both metrics, ranges non-overlapping.** ⚠️ Confound: GPT-5.5 rejects `temperature: 0`. NOT deployed; switching remains Santiago's call. |
| **oracle-fries-scope-001** | 2026-08-09 | $0 archival re-score: correct French Fries to a labelled frozen-par-fried product, then compare the frozen whole-plate oracle with a separate three-dish component-scope candidate | Frozen: baseline **32–33/96**, B4 **33–36/96**, GPT-5.5 **23–28/96**. Candidate: baseline **32–33/96**, B4 **35–37/96**, GPT-5.5 **36–39/96**. | **French Fries BASIS corrected; no model call or production change.** Candidate is evidence only: its larger baseline-vs-B4 separation is a scope-ruling input for Santiago, not an adoption. |

### baseline-001 — notes

**Mirror verification:** the archived deployed `stage: "enrich"` request/response pair has
exactly three items in the original order, with all required fields and non-empty
`ingredients[]` (5, 8, and 7 entries respectively). Its item names, ingredient lists, macros,
and `high` confidence labels matched local draw 1. The mirror shape passes; this comparison is
not a determinism claim.

**Execution evidence and limitation:**
`scripts/fixtures/caches/macro-bench.baseline-001-execution-manifest.json` maps the request/
response pair and the three local raw responses. The local raw artifacts independently show
three successful Chat Completion responses (`gpt-4o-2024-08-06`, `finish_reason: "stop"`) at
provider `created` values 1786167217, 1786167220, and 1786167224. The executor reported one
mirror operation plus one `BENCH_DRAWS=3` run (four approved operations total), but no durable
transport trace or command transcript was archived. Therefore the artifacts do **not**
independently prove endpoint, HTTP status, an exhaustive paid-call count, or absence of retries.
The manifest is post-hoc evidence mapping, not a reconstructed transport log.

**Model pin limitation:** baseline-001's harness request used the mutable `gpt-4o` alias.
The archived responses identify `gpt-4o-2024-08-06`, so the baseline remains historical and
auditable, but it is not the reproducible pinned baseline. Do not label a baseline-002 until a
new approved paid run has produced and archived its own responses with the pinned request.

**Per-item, per-field results (range across three local draws):**

| item | estimated_calories | protein_g | carb_g | fat_g | tally |
|---|---:|---:|---:|---:|---:|
| CESAR (200 g) | 350–350 | 25–25 | 15–15 | 20–20 | 0/3 |
| Salmone toscano | 550–600 | 40–40 | 30–30 | 25–35 | 0/3 |
| PASTEL AZTECA (300gr.) | 500–550 | 30–30 | 40–40 | 20–25 | 2/3 |

**Per-draw verdicts:**

| item | draw 1 | draw 2 | draw 3 |
|---|---|---|---|
| CESAR (200 g) | calories 350 (-24.2%) FAIL; protein 25 (-16.9%) PASS; carbs 15 (-13.7%) PASS; fat 20 (-32.1%) FAIL | same as draw 1 | same as draw 1 |
| Salmone toscano | calories 550 (-34.8%) FAIL; protein 40 (-33.0%) FAIL; carbs 30 (-14.6%) PASS; fat 25 (-50.9%) FAIL | calories 600 (-28.8%) FAIL; protein 40 (-33.0%) FAIL; carbs 30 (-14.6%) PASS; fat 35 (-31.3%) FAIL | same as draw 1 |
| PASTEL AZTECA (300gr.) | calories 500 (+10.6%) PASS; protein 30 (-23.5%) PASS; carbs 40 (+27.2%) PASS; fat 20 (+0.7%) PASS | calories 550 (+21.7%) FAIL; protein 30 (-23.5%) PASS; carbs 40 (+27.2%) PASS; fat 25 (+25.8%) PASS | same as draw 1 |

**Failure list:** CESAR missed calories and fat in every draw (six failed field/draws).
Salmone missed calories, protein, and fat in every draw (nine failed field/draws). Pastel
missed only draw 2 calories (one failed field/draw). No other field/draw failed the approved
bands.

**Hand audit (mirror and all three raw draws):** every `ingredients[]` list matches the printed
description. CESAR listed lettuce, parmesan, croutons, grilled chicken, and Caesar dressing.
Salmone listed salmon, Tuscan cream, garlic, spinach, artichoke, sun-dried tomato, capers, and
baguette. Pastel listed chicken, tomato sauce, green chile, onion, corn, cheese blend, and
beans. Salmone's 40 g protein plus sauce and baguette indicates the model treated printed 200 g
as the salmon component rather than the whole plated dish; nevertheless it substantially
underestimated the USDA oracle's protein, fat, and calories.

**Atwater self-consistency (reported calories minus `4P + 4C + 9F`):** CESAR was +10 kcal
(+2.9%) in every draw (350 reported vs 340 implied). Salmone was +45 kcal (+8.2%), +5 kcal
(+0.8%), and +45 kcal (+8.2%) in draws 1–3 (550 vs 505, 600 vs 595, 550 vs 505).
Pastel was +40 kcal (+8.0%), +45 kcal (+8.2%), and +40 kcal (+8.0%) (500 vs 460, 550 vs 505,
500 vs 460). The outputs are not exactly Atwater-consistent; the largest observed gap is 45
kcal / 8.2%.

**Dispersion across draws:** population coefficient of variation for estimated calories was
0.0% (CESAR), 4.2% (Salmone), and 4.6% (Pastel). The zero-dispersion CESAR still failed all
draws, while the higher-dispersion Pastel passed two; this three-draw sample does not support
using dispersion as a calibrated failure gate.

**Confidence label vs reality:** all nine local outputs (and all three mirror outputs) reported
`high`. CESAR and Salmone failed every draw despite that label; Pastel passed two. In this
baseline, the label did not distinguish passing from failing items.

**Archived raw responses:**
`scripts/fixtures/caches/macro-bench.mirror-request.json`,
`scripts/fixtures/caches/macro-bench.mirror-response.json`, and
`scripts/fixtures/caches/macro-bench.baseline-001-d{0,1,2}.raw.json`. Execution-evidence
manifest: `scripts/fixtures/caches/macro-bench.baseline-001-execution-manifest.json`.

### baseline-002 — pinned reproduction (2026-08-08)

**Mirror/model verification:** the new deployed `stage: "enrich"` mirror received the three
completed original-order items and returned three original-order items with non-empty
`ingredients[]` counts of 5, 8, and 7. Its response reports
`model_id: "gpt-4o-2024-08-06"`. Each local raw Chat Completion response reports the exact same
pinned model and `finish_reason: "stop"`. The mirror and local outputs semantically cover the
same printed ingredients, while retaining descriptive variants such as `queso parmesano` versus
`queso parmesano rallado` and `crema toscana` versus `crema toscana blanca`; that comparison is
not a determinism claim.

**Execution evidence and limitation:**
`scripts/fixtures/caches/macro-bench.baseline-002-execution-manifest.json` maps only this
baseline's mirror request/response and its three raw local responses. Those artifacts prove the
reported pinned response/model evidence, but do not prove linkage to deployed commit `0476481`,
endpoint, exhaustive call count, or absence of retries. The executor reported one mirror
operation plus one `BENCH_DRAWS=3` invocation: four paid calls, with no retry requested. The
manifest is post-hoc evidence, not a transport log or command transcript.

**Per-item, per-field results (range across three local draws):**

| item | estimated_calories | protein_g | carb_g | fat_g | tally |
|---|---:|---:|---:|---:|---:|
| CESAR (200 g) | 350–350 | 25–25 | 15–15 | 20–20 | 0/3 |
| Salmone toscano | 550–550 | 40–40 | 30–30 | 25–25 | 0/3 |
| PASTEL AZTECA (300gr.) | 500–500 | 30–30 | 40–40 | 20–20 | 3/3 |

**Per-draw verdicts:** CESAR: calories 350 (-24.2%) FAIL; protein 25 (-16.9%) PASS;
carbs 15 (-13.7%) PASS; fat 20 (-32.1%) FAIL in all three draws. Salmone: calories 550
(-34.8%) FAIL; protein 40 (-33.0%) FAIL; carbs 30 (-14.6%) PASS; fat 25 (-50.9%) FAIL in all
three. PASTEL AZTECA: calories 500 (+10.6%), protein 30 (-23.5%), carbs 40 (+27.2%), and fat
20 (+0.7%) all PASS in all three.

**Failure list:** CESAR has six failed field/draws (calories and fat × three). Salmone has nine
(calories, protein, and fat × three). PASTEL AZTECA has none. No other field/draw failed the
approved bands.

**Hand audit (mirror and all three raw draws):** every new `ingredients[]` list semantically
covers the printed description and frozen USDA oracle ingredient set, rather than using an
identical name string in every response. The factual variants include `queso parmesano` versus
`queso parmesano rallado`, `aderezo cesar` versus `aderezo cesar de la casa`, and `crema
toscana` versus `crema toscana blanca`. CESAR covers lettuce, parmesan, croutons, grilled
chicken, and Caesar dressing. Salmone covers salmon, Tuscan cream, garlic, spinach, artichoke,
sun-dried tomato, capers, and baguette. PASTEL AZTECA covers chicken, tomato sauce, green chile,
onion, corn, cheese blend, and beans. No audited output added a semantically unprinted
ingredient or omitted a printed ingredient.

**Atwater self-consistency (reported calories minus `4P + 4C + 9F`):** CESAR was +10 kcal
(+2.9%) in every draw (350 reported vs 340 implied). Salmone was +45 kcal (+8.2%) in every
draw (550 vs 505). PASTEL AZTECA was +40 kcal (+8.0%) in every draw (500 vs 460). Outputs are
not exactly Atwater-consistent; the largest observed gap is 45 kcal / 8.2%.

**Dispersion across draws:** population coefficient of variation for estimated calories was
0.0% for CESAR, Salmone, and PASTEL AZTECA. Both permanently failing items have zero dispersion,
as does the passing item; this sample does not support using dispersion as a calibrated failure
gate.

**Confidence label vs reality:** all nine local outputs and all three mirror outputs reported
`high`. CESAR and Salmone failed every draw despite that label; PASTEL AZTECA passed all three.
In this baseline, the label does not distinguish passing from failing items.

**Archived raw responses:**
`scripts/fixtures/caches/macro-bench.baseline-002-mirror-request.json`,
`scripts/fixtures/caches/macro-bench.baseline-002-mirror-response.json`, and
`scripts/fixtures/caches/macro-bench.baseline-002-d{0,1,2}.raw.json`. Execution-evidence
manifest: `scripts/fixtures/caches/macro-bench.baseline-002-execution-manifest.json`.

### baseline-002r — oracle correction and $0 re-score (2026-08-08)

**No model call was made.** This entry re-scores the *same* archived `baseline-002-d{0,1,2}`
responses against a corrected oracle. The model's answers are byte-identical to baseline-002;
only the ground truth moved. Recorded as its own row because the failure list changed.

**Why the oracle changed.** The frozen oracle applied **two different printed-weight
conventions**: CESAR and PASTEL summed *to* their printed weight (whole dish), while Salmone
summed to 348 g against a printed 200 g (component only). Salmone and Pastel use near-identical
accompaniment wording — `acompañado con baguette` and `servido con frijoles` — and were treated
oppositely. Any prompt rule written against that oracle would have been graded on a
self-contradicting target.

**The rule Santiago ruled (2026-08-08), now encoded in all three `assumed` lines:**

> The printed weight covers the **plated dish**. An ingredient the menu marks as an
> **accompaniment** sits **outside** the printed weight — but is still eaten, so the oracle still
> counts it. Inside the printed weight, the **principal protein takes a main-course share**.

**Applied blind, with no per-dish tuning:**

| item | accompaniment wording | printed weight covers | total eaten | change |
|---|---|---|---:|---|
| CESAR (200 g) | none | everything | 200 g | **untouched** |
| Salmone toscano | `acompañado con baguette` | plate: salmon 140 g + 60 g sauce/veg | 245 g | baguette 45 g moved outside |
| PASTEL AZTECA | `servido con frijoles` | casserole scaled 220 g → 300 g | 380 g | beans 80 g moved outside |

**Corrected oracle totals:** CESAR 462.0 kcal / 30.1 P / 17.4 C / 29.4 F (unchanged);
Salmone 606.6 / 42.7 / 30.2 / 34.5 (was 843.2 / 59.7 / 35.1 / 51.0);
PASTEL 576.7 / 51.3 / 35.5 / 26.8 (was 452.1 / 39.2 / 31.4 / 19.9).

**Re-scored result — identical in all three draws:**

| item | calories | protein_g | carb_g | fat_g | tally |
|---|---|---|---|---|---:|
| CESAR (200 g) | 350 (**−24.2% FAIL**) | 25 (−16.9%) | 15 (−13.7%) | 20 (**−32.1% FAIL**) | **0/3** |
| Salmone toscano | 550 (−9.3%) | 40 (−6.4%) | 30 (−0.6%) | 25 (−27.5%) | **3/3** |
| PASTEL AZTECA | 500 (−13.3%) | 30 (**−41.5% FAIL**) | 40 (+12.6%) | 20 (−25.5%) | **0/3** |

**Failed field/draws: 9** (was 15). Salmone gained, PASTEL lost.

**Read the PASTEL flip correctly — it is a revealed defect, not an artifact.** The old oracle
squeezed the casserole into 220 g, which shrank its chicken and cheese and masked a real protein
under-count. Under the corrected 300 g casserole the oracle carries ~109 g chicken and ~61 g
cheese for 51.3 g protein; the model said 30 g. The independent LLM review corroborated this
without seeing our oracle: *"its 30 g protein looks low for a 300-g dish containing both chicken
and a substantial cheese mixture."*

**Method note, deliberately recorded.** Santiago's constraint was *"I don't want changes to make
the salmon pass but break on many others."* The rule was applied to every dish without exception
and one item gained while another lost. **A convention where every dish improves is the one to
distrust** — that is oracle-shopping, selecting ground truth to match the prediction. Measured
alternatives, all $0, for the record:

| convention | CESAR | Salmone | PASTEL |
|---|---|---|---|
| original frozen oracle (two conventions) | 0/3 | 0/3 | 3/3 |
| whole dish, everything inside, proportional | 0/3 | 0/3 (carbs) | 3/3 |
| whole dish, everything inside, protein-first | 0/3 | 0/3 (carbs, worse) | 3/3 |
| **accompaniment outside (ADOPTED)** | **0/3** | **3/3** | **0/3** |

**No convention passes all three, and CESAR fails under every one of them.** Its grams are
agreed at 200 g in all four variants, so its −32.1% fat miss is convention-independent — the
cleanest signal on the set, and the reason B1 is justified regardless of how the scope question
resolves.

**The strongest free evidence for B1, from data already owned.** Every macro value the model
produced — three dishes × three draws × both baselines — is a **multiple of 5**, and every
calorie figure a **multiple of 50**: `25/15/20 → 350`, `40/30/25 → 550`, `30/40/20 → 500`.
Nothing summing real per-ingredient grams lands on round fives nine times out of nine. This is
the signature of a guess made directly at the macro level, which is exactly what B1 targets.

**Every significant miss is an under-count of a dense component:** CESAR's fat (30 g Caesar
dressing), PASTEL's protein (chicken + cheese blend), Salmone's fat (heavy cream — passing, but
the largest in-band miss at −27.5%). Both external reviewers named this independently.

**Verification:** `deno test --allow-all scripts/ supabase/` → `298 passed | 1 failed`, the one
failure still only `scripts/tile-cut_test.ts`. `validateRecipe` passes for all three corrected
recipes.

### iter-b1-001 — B1 per-ingredient grams (2026-08-08, $0.023, 3 draws, NOT deployed)

**Change under test:** commit `1768a1d` — a required `grams` field on every `ingredients[]`
entry, and prompt steps 1–2 rewritten to derive the macros by summing per-ingredient
contributions instead of estimating totals directly. Seven production lines. Same model
(`gpt-4o-2024-08-06`), same `temperature: 0`, same `seed: 17`. Mirror call deliberately skipped —
it would compare a changed harness against an unchanged edge function and prove nothing.

**Headline: the tally REGRESSED, and the run is still the most valuable of the phase.**
14 failed field/draws vs baseline-002r's 9. But the failures moved, and *what* moved is the
finding.

**Per-field, against baseline-002r:**

| item | field | baseline-002r | iter-b1-001 | verdict |
|---|---|---|---|---|
| CESAR | calories | −24.2% FAIL | **−13.4% / −2.6% PASS** | ✅ recovered ×3 |
| CESAR | fat | −32.1% FAIL | **−15.1% PASS** | ✅ recovered ×3 |
| CESAR | protein | −16.9% PASS | **−33.5% FAIL** | ❌ lost ×3 |
| CESAR | carb | −13.7% PASS | **+43.8% FAIL** | ❌ lost ×3 |
| Salmone | carb | −0.6% PASS | **+32.5% FAIL** | ❌ lost ×3 |
| Salmone | calories/protein/fat | PASS | PASS | — |
| PASTEL | carb | +12.6% PASS | +40.8% FAIL (draw 2 passed) | ❌ lost ×2 |
| PASTEL | protein | −41.5% FAIL | −51.2% FAIL | ❌ worse |
| PASTEL | calories | −13.3% PASS | −13.3% / −4.6% PASS | — |

**Calories improved on every single item and now pass everywhere. Carbs blew out everywhere.**

**THE FINDING — the model can portion, but it does not total.**

The grams are real, not decorative, and they are good:

| item | model's gram sum | printed weight | oracle's sum |
|---|---:|---:|---:|
| CESAR | **200** | 200 g | 200 |
| PASTEL | **300** | 300 gr. | 380 (beans outside) |
| Salmone | 265 | 200 g | 245 |

CESAR and PASTEL land **exactly** on the printed weight — the model now treats it as a budget,
which it never did before. Salmone gave the salmon 150 g, close to the oracle's approved 140 g
main-course portion. Individual portions are sane throughout (CESAR chicken 80 g vs oracle 75 g;
Salmone baguette 50 g vs 45 g).

**But the macros it reports do not follow from the grams it just wrote.** Pricing the model's
*own* ingredient list at its *own* grams with the oracle's USDA per-100 g values (draw 1):

| item | field | oracle | **model's own grams imply** | **model reported** |
|---|---|---:|---:|---:|
| CESAR | protein_g | 30.1 | **33.8** | **20** |
| CESAR | calories | 462 | **481.6** | **400** |
| Salmone | fat_g | 34.5 | **39.8** | **25** |
| Salmone | calories | 606.6 | **679.6** | **550** |
| PASTEL | carb_g | 35.5 | **30.4** | **50** |

**Scoring the model's own grams beats scoring its own answer on two of three dishes:**
Salmone's grams score **PASS 4/4** while its reported macros fail on carbs; CESAR's grams fail on
one field where its reported macros fail on two. Only PASTEL is worse under its own grams, and
that is the scope convention again — it put the beans inside the printed 300 g while the
corrected oracle prices 380 g.

**P1 (the decisive prediction) FAILED.** Every reported total is still a multiple of 5 and every
calorie figure a multiple of 50: 400, 450, 550, 600, 500, 550. Writing the portions down did not
make the model compute from them.

**Stated honestly:** this is *consistent with* the model guessing the totals rather than summing,
but it does not strictly prove arithmetic failure — the model may hold different per-100 g
nutrition beliefs than USDA. What argues against a systematic belief gap is the size and
inconsistent direction of the errors (CESAR protein −41% below its own grams, PASTEL carbs +64%
above them). The next iteration settles it by asking for per-ingredient macros directly.

**Hand audit (all three raw draws):** every `ingredients[]` list matches the printed description
— CESAR 5, Salmone 8, PASTEL 7 entries, no invented and no omitted ingredient, in printed order.
The gram values are the only new content and none is absurd.

**Atwater self-consistency (reported calories minus `4P + 4C + 9F`):** CESAR −5 (−1.2%), −5,
+45 (+11.1%); Salmone +25 (+4.8%), +45 (+8.9%), +75 (+14.3%); PASTEL 0 (0.0%), +60 (+13.6%),
+70 (+14.6%). Worse than baseline-002's max gap of 8.2% — the calorie figure drifts further from
its own macros than before.

**Dispersion across draws:** calorie CV rose from **0.0% on every item** in baseline-002 to 5.7%
(CESAR), 4.2% (Salmone), 4.6% (PASTEL). The change introduced real run-to-run variance where
there was none, which is why this run reports a range rather than a single value.

**Confidence label:** dropped from `high` on all nine baseline outputs to **`medium` on all nine
here.** Every item failed in both runs, so the label still does not discriminate pass from fail —
but the shift is recorded. Consistent with B8: do not gate on it.

**Archived raw responses:** `scripts/fixtures/caches/macro-bench.iter-b1-001-d{0,1,2}.raw.json`.
Actual cost from the archived `usage` blocks: 2,064 input + 1,758 output tokens = **$0.0227**.

**Verdict: do NOT deploy `1768a1d` as-is.** It trades a worse tally for better portions. Keep it
on the branch as the input to the next iteration — see B10, which this run created.

### iter-b10-001 — B10 per-ingredient macros summed in code (2026-08-08, $0.036, 3 draws, NOT deployed)

**Change under test:** commit `1ce5139` — each `ingredients[]` entry gains `protein_g`, `carb_g`,
`fat_g` at its stated gram weight; `sumIngredientMacros` totals them and derives calories by
Atwater (4/4/9) on the unrounded sums. Item-level macros became **computed**, not model output.
The harness was fixed in the same commit — it had been parsing the response itself and grading
the raw item-level macros, i.e. values production now discards (lesson 23).

**Mean signed error per field, all three runs side by side** (`!` = outside band):

| item | run | calories | protein_g | carb_g | fat_g |
|---|---|---|---|---|---|
| **CESAR** | baseline-002r | −24.2% ! | −16.9% | −13.7% | −32.1% ! |
| | iter-b1-001 | −9.8% | −33.5% ! | +43.8% ! | −15.1% |
| | **iter-b10-001** | **+3.2%** | +20.8% | +34.3% ! | **−9.4%** |
| **Salmone** | baseline-002r | −9.3% | −6.4% | −0.6% | −27.5% |
| | iter-b1-001 | −6.6% | −22.0% | +32.5% ! | −27.5% |
| | **iter-b10-001** | −12.5% | −8.0% | +10.4% | **−22.6%** |
| **PASTEL** | baseline-002r | −13.3% | −41.5% ! | +12.6% | −25.5% |
| | iter-b1-001 | −10.4% | −48.0% ! | +31.4% ! | −25.5% |
| | **iter-b10-001** | **−9.7%** | **−17.4%** | +42.6% ! | −37.9% ! |

**Aggregate:** 9 failed field/draws (baseline-002r 9, iter-b1-001 14); 2/9 passing item-draws
(baseline 3/9, b1 0/9); mean |error| 20.6% (baseline 18.6%, b1 25.5%).

**Read the aggregate honestly: B10 is NOT a clear win on the headline.** It ties baseline on
failed fields, loses one passing item-draw, and its mean absolute error is 2 points worse. What
it did is **concentrate the error into one field**:

- **Calories improved on every item and are now near-exact on CESAR (+3.2%, from −24.2%).**
  8 of 9 calorie field/draws pass; the one failure is Salmone draw 1 at −21.5%.
- **Protein improved decisively on PASTEL: −41.5% → −17.4%, back inside band.**
- **Fat improved on CESAR (−32.1% → −9.4%) and Salmone, worsened on PASTEL (−25.5% → −37.9%).**
- **Carbs worsened on all three and is now the only systematic defect.**

**FINDING 1 — the model CAN add; it just had nothing to add before.** The item-level macros it
emitted (which production discards) now match our computed sums almost exactly, in every draw:

| item | computed (shipped) | model said at item level (discarded) |
|---|---|---|
| CESAR | P36 C23 F27 | P35.7 C22.6 F27.1 |
| Salmone | P38 C22 F26 | P37.5 C22 F26.4 |
| PASTEL | P41 C50 F15 | P40.8 C50 F14.7 |

Those values are also no longer multiples of 5. **This answers the open question from
iter-b1-001**: the failure was never arithmetic. Without per-ingredient macros the model had no
parts to sum, so it jumped straight to a round guess. Given parts, it sums them correctly on its
own.

**Consequence for the design:** `sumIngredientMacros` is now earning its keep on **calories
only**. The model's stated calorie figure still drifts from its own macros by 9–11% (CESAR 470 vs
477, Salmone 520 vs 476, PASTEL 550 vs 496); Atwater removes that drift by construction.

**Honest caveat about Atwater — the one calorie failure argues against it.** On Salmone draw 1 the
model's own calorie figure (520, −14.3%) would have **passed**, while our Atwater value (476,
−21.5%) **failed**. Same on PASTEL, where the model's 550 (−4.6%) beats Atwater's 496 (−14.0%).
Atwater guarantees internal consistency, not accuracy, and the model's calorie intuition
sometimes lands closer to the oracle. n=1 failure is not enough to act on — record it, watch it.

**FINDING 2 — carbs fail for two distinct reasons, and only one is the model's fault.**
From the per-ingredient numbers (draw 1):

| ingredient | model g | model carb_g | USDA carb at that weight | reading |
|---|---:|---:|---:|---|
| CESAR croutones | 30 | 20 | 19.1 | carb *density* right, **portion** 30 g vs oracle's 20 g |
| PASTEL elote | 30 | 15 | 5.6 | **2.7× too carb-dense** |
| PASTEL salsa de tomate | 50 | 10 | 2.7 | **3.7× too carb-dense** |
| PASTEL frijoles | 70 | 20 | 17.7 | close |

So: **the model systematically over-states the carbohydrate content of vegetables and sauces.**
That is a new, specific, nameable defect that was invisible before B10 — it only became legible
because the per-ingredient numbers are now on the record. Creates **B11**.

**FINDING 3 — PASTEL's remaining failures are substantially our scope convention, not model
error.** The model puts the beans inside the printed 300 g (80 g chicken + 30 g cheese + 70 g
beans = 300 g); the corrected oracle prices a 300 g casserole *plus* 80 g beans, which scales its
chicken to 109 g and cheese to 61 g. That alone explains most of the −37.9% fat gap. Under the
"beans inside" convention PASTEL passed 3/3. This is not a reason to re-open the ruling — one
rule applied blind is still right — but PASTEL's numbers should not be read as pure model error.

**Hand audit (all three draws):** every ingredient list matches the printed description — CESAR 5,
Salmone 8, PASTEL 7 entries, nothing invented, nothing omitted, printed order preserved. Gram
sums: CESAR 200 (= printed), PASTEL 300 (= printed), Salmone 250. No per-ingredient macro is
physically impossible (none exceeds its own gram weight).

**Atwater self-consistency:** exact by construction (gap 0 on every item, every draw), versus a
max gap of 14.6% in iter-b1-001 and 8.2% in baseline-002. This is the one property the change
guarantees rather than hopes for.

**Dispersion across draws:** calorie CV 0.1% (CESAR), 8.0% (Salmone), 7.8% (PASTEL). Salmone's
draw 1 diverged sharply (476 vs 558/559) — the largest single-draw divergence seen in the phase,
and it is the draw that failed. **First evidence in this phase that dispersion tracks failure**,
which B8 predicted and the earlier zero-dispersion runs could not test. One observation; not a
calibration.

**Confidence label:** `medium` on all nine outputs again. Still not discriminating.

**Archived raw responses:** `scripts/fixtures/caches/macro-bench.iter-b10-001-d{0,1,2}.raw.json`.
Cost from the archived `usage` blocks: 2,283 input + 3,014 output tokens = **$0.0358**. Output
tokens rose 71% over iter-b1-001, as expected for three extra numbers per ingredient.

**Scored under the PASTEL beans tolerance (Santiago 2026-08-08), which is the number to quote:**

| run | failed field/draws | which |
|---|---:|---|
| baseline-002r | **6** | CESAR calories ×3, CESAR fat ×3 |
| iter-b1-001 | 13 | spread across 5 different item/field combinations |
| **iter-b10-001** | **7** | **CESAR carb ×3, PASTEL carb ×3**, Salmone calories ×1 |

**Baseline is still marginally ahead on the count (6 vs 7). Do not claim B10 won.** The case for
B10 is the *shape* of what is left, not the size:

- Baseline fails on **two different fields** of CESAR — calories −24% and fat −32% — the core
  numbers a diner reads, with no identified cause.
- B10 fails on **one field, carbs, on two dishes**, with a measured per-ingredient cause
  (vegetables and sauces over-rated 2.7–3.7×), plus a single divergent calorie draw.

Six of B10's seven failures are the same defect. That is a fixable state; baseline's was not.

**Verdict: do not deploy yet.** B10 fixed calories, fixed PASTEL protein, and made the model's
reasoning legible for the first time — but it has not beaten baseline on the headline, and it
introduced a carb regression whose cause is now known precisely. Fix the carb defect (B11) and
re-measure before considering deployment.

### iter-b11-001 — B11 option 1, the carb-trap sentence (2026-08-08, $0.034, 3 draws, NOT deployed)

**Change under test:** commit `766be47` — one sentence added to step 2 of `ENRICH_PROMPT`: *"Most
vegetables and tomato-based sauces are mostly water and contribute far less carbohydrate than
their volume suggests; reserve high carb_g values for grains, bread, tortilla, rice, potato, corn
kernels, legumes and sugar."* Nothing else changed — same schema, same model, same seed, same
`sumIngredientMacros`.

**FINDING 1 — the falsifier fired. The number it targeted did not move.**

| | iter-b10-001 | iter-b11-001 |
|---|---|---|
| PASTEL carb sum (3 draws) | 50, 50, 52 | **50, 50, 50** |
| CESAR carb sum (3 draws) | 22.6, 24, 22.6 | **24, 24, 24** |

PASTEL's carbohydrate is unchanged and CESAR's is marginally worse. The roadmap's stated
falsifier — *"if vegetable carb values do not fall, the model's per-ingredient nutrition knowledge
is the ceiling"* — is met.

**FINDING 2 — at ingredient level the sentence moved two foods in OPPOSITE directions, and one of
them is the sentence's own fault.**

| ingredient | b10 carb_g (3 draws) | b11 carb_g (3 draws) | USDA at that weight | verdict |
|---|---|---|---:|---|
| salsa de tomate (50 g) | 10, 5, 10 | **5, 5, 5** | 2.7 | improved 3.7× → 1.85× |
| elote / sweet corn (30 g) | 15, 20, 15 | **20, 20, 20** | 5.6 | **worsened 2.7× → 3.6×** |

**The corn regression was caused by the wording we shipped.** The sentence's second half lists
`corn kernels` among the foods that deserve *high* carb values. It is a licence, and the model
took it. That half of the sentence was copied verbatim from the B11 backlog entry, so the error
predates this run — but it is now measured, not theoretical. **Any successor must drop
`corn kernels` from a "high carb" list**: sweet corn is 18.6% carb by weight, closer to a
vegetable than to rice.

**FINDING 3 — the real defect is a per-TAG anchor, not per-food knowledge.** Every ingredient the
model tags `carb` receives a round 20 or 30 g of carbohydrate, almost independent of what the food
is or how much of it there is:

| ingredient | grams | model carb_g | model carb per g | USDA carb per g |
|---|---:|---:|---:|---:|
| croutones | 30 | 20 | 0.67 | 0.64 ✓ |
| elote | 30 | 20 | 0.67 | 0.19 ✗ |
| baguette | 50 | 30 | 0.60 | 0.55 ✓ |
| frijoles | 70 | 20 | 0.29 | 0.25 ✓ |

Three of four land close — **by coincidence of their gram weights**, not because the density was
reasoned. Every carb value in every draw is a multiple of 5 for dense foods and a small integer
for vegetables. **B10 did not remove the round-number guess; it pushed it down one level.** Summing
round ingredient guesses produces an unround item total, which is why the defect looked fixed at
item level. This is the most useful thing this run bought.

**FINDING 4 — the two surviving carb failures have DIFFERENT causes. Do not treat them as one
defect.**

- **CESAR carb (+38.1%) is a PORTION error.** The model puts croutons at 30 g against the oracle's
  20 g; at 30 g its 20 g of carbohydrate is *correct* (USDA 19.1). No composition sentence could
  ever have fixed this one — B11 was aimed at the wrong half of CESAR.
- **PASTEL carb (+40.8%, +59.2% under beans-inside) is a COMPOSITION error**, and it is now almost
  entirely the corn.

**Scored both ways, as required.** Strict (shipped oracle): **9** failed field/draws, identical to
baseline-002r and iter-b10-001. Under the PASTEL beans tolerance (Santiago 2026-08-08):

| run | failed field/draws | which | mean \|error\| |
|---|---:|---|---:|
| baseline-002r | **6** | CESAR calories ×3, CESAR fat ×3 | 18.6% |
| iter-b1-001 | 13 | spread over 5 item/field combinations | 25.5% |
| iter-b10-001 | 7 | CESAR carb ×3, PASTEL carb ×3, Salmone calories ×1 | 20.6% |
| **iter-b11-001** | **6** | **CESAR carb ×3, PASTEL carb ×3** | 19.6% |

PASTEL's fat now passes under the beans-inside reading at **−29.6%**, i.e. by 0.4 of a percentage
point. **Do not read that as a fix** — it is a borderline pass on a tolerance, and PASTEL's fat is
unchanged model behaviour (14 g in every draw).

**Mean signed error per field** (`!` = outside band):

| item | run | calories | protein_g | carb_g | fat_g |
|---|---|---|---|---|---|
| **CESAR** | iter-b10-001 | +3.2% | +20.8% | +34.3% ! | −9.4% |
| | **iter-b11-001** | +5.0% | +23.0% | +38.1% ! | −8.3% |
| **Salmone** | iter-b10-001 | −12.5% | −8.0% | +10.4% | −22.6% |
| | **iter-b11-001** | **+0.6%** | −6.4% | +22.5% | **−2.4%** |
| **PASTEL** | iter-b10-001 | −9.7% | −17.4% | +42.6% ! | −37.9% ! |
| | **iter-b11-001** | −14.3% | −18.1% | +40.8% ! | −47.8% ! |

**Salmone went 2/3 → 3/3 and it is NOT attributable to this change.** Its calories and fat improved
sharply, but B11's sentence says nothing about salmon, cream or bread, and the movement comes from
the model re-guessing salmon fat (10↔15 g) and cream fat (10↔20 g) between draws — values that were
already unstable in iter-b10-001. **Treat this as draw-to-draw variation until something
reproduces it.** It is the only reason the headline count improved, which is why the count is not
the story.

**Dispersion collapsed to zero, and that is confounded, not a result.** All three draws are
identical on all three items. But iter-b10-001's *draw 1* is byte-identical to all three B11 draws
on CESAR and PASTEL — so B11 did not so much stabilise the model as land on the mode of a
distribution b10 was already sampling. One observation; do not build on it.

**Hand audit (all three draws):** ingredient lists unchanged from iter-b10-001 and still match the
printed descriptions — CESAR 5, Salmone 8, PASTEL 7 entries, nothing invented, nothing omitted,
printed order preserved. Gram sums: CESAR 200 (= printed), PASTEL 300 (= printed), Salmone 265.
**Standing observation, not new:** the model gives Salmone 150 g of salmon against the printed
200 g the oracle convention reads as the salmon portion — it passes 3/3 *despite* under-portioning
its principal protein. Atwater self-consistency exact by construction. Confidence label `high` on
7 of 9 outputs (was `medium` on all 9) — still not discriminating, and it got *more* confident
while getting no more accurate.

**Archived raw responses:** `scripts/fixtures/caches/macro-bench.iter-b11-001-d{0,1,2}.raw.json`.
Cost from the archived `usage` blocks: 2,409 input + 2,792 output tokens = **$0.0339**. Phase total
**$0.093**.

**Verdict: do not deploy, and do not keep this sentence as written.** It failed its own falsifier,
its one measurable ingredient-level effect on corn was negative, and the count improvement came
from an unrelated dish. Its value is diagnostic: it proved the ceiling is not the model's *wording*
but the round per-tag anchor identified in Finding 3. **Next is B12.**

### iter-b12-001 — B12 per-100 g composition, priced in code (2026-08-08, $0.042, 3 draws, NOT deployed)

**Change under test:** per-ingredient `protein_g`/`carb_g`/`fat_g` (an amount) replaced by
`protein_per_100g`/`carb_per_100g`/`fat_per_100g` (a composition); `sumIngredientMacros` now
multiplies by `grams / 100` before summing. B11's food list was deleted from the prompt in the
same commit, on Santiago's instruction — see the confound note below.

**FINDING 1 — B12's falsifier passed outright. The model recites USDA per-100 g values almost
exactly.** For the first time both sides of the comparison are per-100 g, so this is a like-for-like
read of what the model actually knows:

| ingredient | model carb/100 g | USDA | | ingredient | model | USDA |
|---|---:|---:|---|---|---:|---:|
| **elote (sweet corn)** | **19** | 18.7 ✓ | | garlic | 33.1 | 33.1 ✓ |
| **salsa de tomate** | **5** | 5.3 ✓ | | onion | 9.3 | 9.3 ✓ |
| croutones | 72 | 73.5 ✓ | | sun-dried tomato | 55 | 55.8 ✓ |
| baguette | 50 | ~50 ✓ | | capers | 4.9 | 4.9 ✓ |
| romaine | 2.9 | 3.3 ✓ | | spinach, cooked | 3.6 | 3.8 ✓ |

Parmesan came back `P35.8 C3.2 F25.8` against USDA's `35.75 / 3.22 / 25.83` — matching to the
decimal. **The composition knowledge was there the whole time; asking for "the amount in this
serving" was destroying it.** Corn, the B11 casualty, went from an implied 67 g carb/100 g to 19.
That defect is gone.

**FINDING 2 — every surviving carbohydrate error is now a PORTION error, exactly as predicted.**

| dish | carb result | cause |
|---|---|---|
| PASTEL | **+40.8% → −12.7%, passes 3/3** | composition fixed; nothing else needed |
| CESAR | +43.8% (2/3 fail) | croutons priced at **72/100 g (right)** but portioned 30 g vs the oracle's 20 g |
| Salmone | −50.3% on 2 draws | the baguette portion **collapsed from 50 g to 10 g** between draws |

The B12 backlog entry predicted CESAR would not move because its defect is portion, not
composition. It did not move. **Composition is solved; portioning is now the whole problem.**

**FINDING 3 — and the bill: fat fell on all three dishes, which is why the tally regressed.**

| item | field | iter-b11-001 | iter-b12-001 |
|---|---|---:|---:|
| CESAR | fat | −8.3% | **−35.5%** ✗ |
| Salmone | fat | −2.4% | −21.7% |
| Salmone | calories | +0.6% | −22.2% ✗ |
| PASTEL | fat | −47.8% | −50.3% ✗ |
| PASTEL | calories | −14.3% | **−30.8%** ✗ |

The cause is visible per ingredient: **the model quotes plain, unprepared reference entries, and
its fat is low on every single one.**

| ingredient | model fat/100 g | oracle (as-prepared) |
|---|---:|---:|
| Caesar dressing | 40 | **57.8** |
| croutons | 10 | 18.3 |
| chicken | 3.6 (= USDA *meat only, roasted*) | 5.45–6.36 (FNDDS, as eaten) |
| salmon | 13.4 | 18.4 |
| cream | 30 | 35.6 |
| parmesan | 25.8 | 28.8 |

Not one is above the oracle. This is a **basis mismatch**, not ignorance: Santiago's 2026-08-07
oracle convention deliberately picks *prepared* entries, and the model is answering with the plain
ones. It is the same question B6 (raw vs cooked convention) was opened for, now with data behind it.

**⚠️ CONFOUND — two things changed in this run; be honest about which caused what.** The field
change (amount → per 100 g) and the deletion of step 2's preparation clause
*"(e.g. grilled vs fried, dressing and cream are mostly fat)"* shipped together. The clause was cut
because it names two of our three fixtures' own ingredients, which is the overfitting Santiago
called out — but it was also the only fat signal in the prompt, and fat is what regressed.
**Attribution: the carb result is safely B12's** (composition values moved to USDA-exact and no
deleted wording could have caused that). **The fat result is NOT cleanly attributable** and is what
B13 exists to separate.

**Scored both ways.** Strict (shipped oracle): **15** failed field/draws. Under the PASTEL beans
tolerance:

| run | failed field/draws | which | mean \|error\| |
|---|---:|---|---:|
| baseline-002r | **6** | CESAR calories ×3, CESAR fat ×3 | 18.6% |
| iter-b1-001 | 13 | spread over 5 item/field combinations | 25.5% |
| iter-b10-001 | 7 | CESAR carb ×3, PASTEL carb ×3, Salmone calories ×1 | 20.6% |
| iter-b11-001 | **6** | CESAR carb ×3, PASTEL carb ×3 | 19.6% |
| **iter-b12-001** | **11** | CESAR fat ×3 + carb ×2, Salmone calories ×2 + carb ×2, PASTEL fat ×2 | 26.8% |

**This is the worst tally of the phase, and it is still the most useful run of the phase.** PASTEL
draw 2 passed all four fields under the beans tolerance — the first time that dish has passed since
baseline-002. What broke is fat, on a change that removed the prompt's only fat signal.

**Hand audit (all three draws):** ingredient lists unchanged and still matching the printed
descriptions — CESAR 5, Salmone 8, PASTEL 7, nothing invented, nothing omitted, printed order
preserved. No ingredient's three per-100 g values sum above 100. Gram sums: CESAR 200 (= printed),
PASTEL 300 (= printed), Salmone 240 / 200 / 200 — **the Salmone portions are the least stable numbers
in the run** (salmon 150 → 120 g, baguette 50 → 10 g), and they are what its two failed draws are
made of. Atwater exact by construction.

**Confidence label:** `medium` on all nine (was `high` on 7 of 9 in B11) — the model got *less*
confident while its composition got dramatically *more* accurate. Still not usable as a gate, and
now visibly anti-correlated.

**Archived raw responses:** `scripts/fixtures/caches/macro-bench.iter-b12-001-d{0,1,2}.raw.json`.
Cost from the archived `usage` blocks: 2,475 input + 3,612 output tokens = **$0.0423**. Output rose
~29% over B11 (three decimal composition values per ingredient instead of three rounded amounts).
Phase total **$0.135**.

**Verdict: keep the per-100 g mechanism, do not deploy, run B13.** The mechanism did precisely what
it was built to do and the evidence is unusually strong. The regression is in fat, on wording that
was removed at the same time, and separating those is one cheap run.

### iter-b13-001 — B13, the raw-reference clause (2026-08-08, $0.042, 3 draws, NOT deployed)

**Change under test:** commit `06fd49a` — one sentence added to step 2 of `ENRICH_PROMPT`: *"Where a
food is normally cooked, sauced or seasoned before it reaches the table, give the figures for that
prepared version — the plain or raw reference figure for the same food understates the fat that
preparation adds."* Nothing else changed.

**Note on the design.** B13 was planned as "restore a preparation signal". On reading step 2 before
editing, it already said *"as served"* **and** *"how it is prepared (fat absorbed or added in cooking
counts)"* — both were live during iter-b12-001, so an inclusive phrasing was already falsified. The
clause shipped therefore carries the **negative** the old wording lacked: it names the raw reference
figure as the wrong answer. Recording this because the backlog entry describes the weaker version.

**FINDING 1 — falsified, and about as cleanly as a hypothesis can be. Not one fat value moved.**

| ingredient | oracle fat /100 g | iter-b12-001 | **iter-b13-001** |
|---|---:|---:|---:|
| Caesar dressing | 57.8 | 40 | **40** |
| Croutons | 18.3 | 10 | **10** |
| Grilled chicken breast | 5.45 | 3.6 | **3.6** |
| Baked salmon | 18.4 | 13.4 | **13 / 13.4** |
| Heavy cream | 35.6 | 30 / 35 / 40 | **30 / 30 / 30** |
| Grated parmesan | 28.8 | 25.8 | **25.8** |

CESAR's fat error is **−35.5% in all three draws of both runs** — the same number to one decimal.
Telling the model that the raw figure is wrong did not change a single figure. Two runs (B11, B13)
have now falsified the same class of fix — **step-2 prose does not move a number the model has
already decided**. Treat that as a measured prior on where to look next (see Rulings, "How to read
the track record"), not as a ban on ever touching the prompt again.

**FINDING 2 — the model is not quoting *raw*. It is quoting a leaner real product.** This corrects
iter-b12-001's stated cause. Raw chicken breast is ~1.2 g fat/100 g and the model says 3.6; plain
unseasoned croutons are far below 10. Every value above sits *between* a plain entry and the oracle's
richer as-prepared pick. The model is not making a basis error — it is making a **different, defensible
product choice** from ours. Which raises a question only Santiago can answer (see Finding 5).

**FINDING 3 — the tally recovered to 6, tying the best of the phase, for a reason B13 does not
explain.** Composition was byte-identical, so everything that moved was a **portion**:

| | iter-b12-001 draws | **iter-b13-001 draws** |
|---|---|---|
| Salmone baguette | 50 / 10 / 10 g | **50 / 50 / 50 g** |
| Salmone cream | 30 / 30 / 30 g | **40 / 40 / 40 g** |
| Salmone total grams | 240 / 200 / 200 | **245 / 245 / 245** |

Salmone went 1/3 → **3/3**, its first clean sweep of the phase. That is the whole scoreboard
difference, and it is portion stability, not the clause under test. **Do not credit B13 with it** —
B12's own baguette flapped 50 → 10 → 10 within a single run, so this sits inside the phase's known
draw-to-draw variance and one run cannot separate the two.

**FINDING 4 — CESAR's fat failure is one ingredient, and it is mostly a PORTION.** Decomposing the
10.3 g gap (oracle 29.45, model 19.14):

| ingredient | oracle contribution | model contribution | gap |
|---|---:|---:|---:|
| **Caesar dressing** | 30 g × 57.8 = **17.34 g** | 20 g × 40 = **8.00 g** | **−9.34** |
| Grilled chicken | 75 g × 5.45 = 4.09 g | 80 g × 3.6 = 2.88 g | −1.21 |
| Croutons | 20 g × 18.3 = 3.66 g | 30 g × 10 = 3.00 g | −0.66 |
| Grated parmesan | 15 g × 28.8 = 4.32 g | 20 g × 25.8 = 5.16 g | +0.84 |

**91% of the gap is the dressing** — and of that 9.34 g, 5.78 g is the portion call (20 g vs 30 g)
against 3.56 g for the composition. Fat has converged on the same verdict carbohydrate reached in
B12: **the remaining error is portioning.**

**FINDING 5 — an oracle question for Santiago, not a code question.** On all six fats the oracle
picks the richer as-prepared FDC entry and the model picks a leaner real one. Both are defensible
foods. If the oracle's picks are meant to represent a *typical* restaurant plate rather than the
richest available entry, part of what is being scored as model error is an oracle choice. **No change
proposed and none made** — fixtures and oracle are Santiago's call. Flagged so it is on the record
before more money is spent chasing a gap that may be partly definitional.

**Scored under the PASTEL beans tolerance, which is the number to quote:**

| run | failed field/draws | which | mean abs error |
|---|---:|---|---:|
| baseline-002r | **6** | CESAR calories ×3, CESAR fat ×3 | — |
| iter-b1-001 | 13 | 5 different item/field combinations | — |
| iter-b10-001 | 7 | CESAR carb ×3, PASTEL carb ×3, Salmone calories ×1 | 20.6% |
| iter-b11-001 | **6** | CESAR carb ×3, PASTEL carb ×3 | 19.6% |
| iter-b12-001 | 11 | CESAR fat ×3 + carb ×2, Salmone calories ×2 + carb ×2, PASTEL fat ×2 | 26.8% |
| **iter-b13-001** | **6** | **CESAR fat ×3 + carb ×2, PASTEL fat ×1** | **21.3%** |

**Nothing has beaten baseline-002r's 6.** Three runs have now tied it and none has passed it. Strict
(no beans tolerance) B13 is 10 vs B12's 15. Item pass rates: CESAR 0/3 · Salmone **3/3** · Pastel 0/3.

**Hand audit (all three draws):** 3 items per draw, names and printed order preserved exactly, no
invented or unprinted items. Ingredient counts stable at CESAR 5 / Salmone 8 / PASTEL 7, all traceable
to the printed descriptions. Gram sums: CESAR 200 (= printed), PASTEL 300 (= printed), Salmone 245
(= 200 printed + 45 g baguette accompaniment, matching the oracle's own recipe note) on **all three
draws**. No ingredient's three per-100 g values sum above 100. Atwater exact by construction.

**Confidence label:** `medium` on all nine, unchanged from B12 and still uninformative.

**Archived raw responses:** `scripts/fixtures/caches/macro-bench.iter-b13-001-d{0,1,2}.raw.json`.
Cost from the archived `usage` blocks: 2,604 input + 3,552 output tokens = **$0.0420**. Phase total
**$0.177**.

**Verdict: keep the sentence, do not deploy, go to portioning next.** The clause is harmless and the
run's headline is the best of the iteration series, but B13's own mechanism is falsified and the
improvement is not attributable to it. Two independent lines of evidence — carbohydrate (B12) and now
fat (Finding 4) — both terminate at portioning. **B4 is the next iteration**, chosen because that is
where the evidence points, not because any other avenue is closed.

### iter-b4-001 — B4 conventional servings, fitted in code (2026-08-08, $0.049, 3 draws, NOT deployed)

**Change under test:** commits `fae3291`, `ff93de2`, `950c334`, `3ce44b7`. The model no longer emits a
gram figure. It emits an item-level `printed_total_g` it reads off the menu, and per ingredient a
`typical_serving_g` plus a `within_printed_weight` flag; `resolveGrams` fits the ingredients inside the
printed weight to it and lets accompaniments through untouched. Per-100 g composition unchanged from
B12, so this is a clean A/B against iter-b13-001.

**RESULT — 0 failed field/draws of 36. Every field, every dish, every draw.** The first clean sweep of
the phase, and the first time anything has beaten baseline-002r's 6.

| run | failed field/draws | mean abs error |
|---|---:|---:|
| baseline-002r | 6 | 18.6% |
| iter-b1-001 | 13 | 25.5% |
| iter-b10-001 | 7 | 20.6% |
| iter-b11-001 | 6 | 19.6% |
| iter-b12-001 | 11 | 26.8% |
| iter-b13-001 | 6 | 21.3% |
| **iter-b4-001** | **0** | **16.7%** |

**FINDING 1 — portions unfroze.** CESAR's displacement had been 20.0% in all fifteen draws of all five
prior runs. It is now 20.4%, and every gram is a non-round decimal (43.48, 17.39, 26.09, 86.96, 26.09)
where every previous run emitted multiples of 5. The round-number signature is gone. **The mechanism
is not inert** — which is what prediction 1 was there to establish.

**FINDING 2 — displacement barely moved, yet CESAR went 0/3 to 3/3. Both are true and the gap is the
point.** Displacement counts every gram equally; the macro bands care *which* grams. The model
over-portions chicken (86.96 g vs 75), which costs displacement and almost no macro error, while the
dressing correction (26.09 g vs the 20 g frozen across five runs) is worth most of the fat recovery:
fat −35.5% → −28.7%, carb +38.1% → +26.6%. **Do not read displacement as a proxy for the macro
tally.** They measure different things and this run separates them for the first time.

**FINDING 3 — prediction 2 landed exactly.** Asked for a conventional serving instead of a fitted
number, the model says Caesar dressing is **30 g** — the oracle's figure to the gram, and 2 tbsp, the
standard serving. It had said 20 g in every previous run. The knowledge was there; asking for a number
that had to sum to 200 was destroying it. Same lesson as B12, one level up.

**FINDING 4 — the beans flipped, unprompted, and prediction 6 was wrong in the best direction.** The
model tagged PASTEL's beans `within_printed_weight: false` in all three draws, matching the oracle's
reading. A total error of **−21.1%, frozen across all five previous runs**, became +5.3% / −7.9% /
+5.3%, and PASTEL's displacement fell 24.4% → 18.4%. The prompt clause names no food and no dish; it
states only that a printed weight normally describes the item and not what accompanies it. Salmone's
baguette was tagged out too, and its total is now +2.0% (250 g vs the oracle's 245 g) — the closest
that dish has ever been.

**FINDING 5 — `printed_total_g` reads correctly on all three dishes, all three draws:** 200, 200, 300.
Not one null, not one misread, across `(200 g)` in a name, a bare `200g` at the end of a description,
and `(300gr.)`. This is the first time the model's reading of a printed weight has been visible as
data rather than inferred by adding up grams afterwards.

**FINDING 6 — the win is real but not comfortable. 13 of the 36 fields sit within 5 percentage points
of their band edge:** CESAR fat −28.7% against a ±30% band (×3), CESAR protein +26.3% (×3), CESAR carb
+26.6% (×3), PASTEL carb +26.7% and +23.9%, PASTEL fat −25.5% (×2). A tighter band fails them.
**Report this as 36/36 with narrow margins, never as "solved".**

**Composition drift, minor and noted:** dressing protein 2 → 3, cream fat 30 → 35/45, parmesan fat
25.8 → 28.6 in one draw. All small, all toward the oracle, none load-bearing for the result — but
prediction 3 held only approximately, so B4 is very slightly confounded on fat.

**Hand audit (all three draws):** 3 items per draw, names and printed order preserved exactly, no
invented or unprinted items. Ingredient counts stable at CESAR 5 / Salmone 8 / PASTEL 7, unchanged
from every prior run and all traceable to the printed descriptions. No ingredient's three per-100 g
values sum above 100 (highest: croutons at 94). Atwater exact by construction.

**Confidence label:** `high` on all nine, up from `medium` on all nine in B12 and B13. Still not usable
as a gate — it moved in step with a change that never touched confidence.

**Archived raw responses:** `scripts/fixtures/caches/macro-bench.iter-b4-001-d{0,1,2}.raw.json`.
Cost from the archived `usage` blocks: 2,934 input + 4,197 output tokens = **$0.0493**. That is **23%
over the ~$0.04 estimate** — output rose 18% over B13 because every ingredient now carries two extra
fields. Phase total **$0.226**.

**Verdict: do not deploy yet, and do not treat one run as the answer.** This is a single 3-draw run on
three dishes. Before deployment it needs at least a repeat run to establish the range — Santiago's
standing rule is that a single run is never quoted as quality — and the margins in Finding 6 mean the
result would not survive a tighter band. What it does establish is that portioning was the remaining
error and that it is reachable.

### iter-b4-002 / 003 / 004 — reproduction (2026-08-08, $0.148, 3 runs × 3 draws, NOT deployed)

**No change under test.** Identical code at `33309a1`, working tree clean, three more 3-draw runs.
Santiago asked for three repeats before the B4 result was believed. **This is the range, and the
range is what to quote — never iter-b4-001 alone.**

| run | failed field/draws (of 36) | mean abs error |
|---|---:|---:|
| iter-b4-001 | 0 | 16.7% |
| iter-b4-002 | 1 | 17.3% |
| iter-b4-003 | 0 | 16.3% |
| iter-b4-004 | 1 | 16.1% |
| **across 4 runs** | **2 of 144 (1.4%)** | **16.1–17.3%** |

For comparison, the best prior result in the phase was baseline-002r's **6 of 36 (16.7%)** failures.

**FINDING 1 — the result holds, and the residual is a single named defect.** Both failures are the
same field on the same dish with the same magnitude: PASTEL fat, model 15 g vs oracle 26.8 g,
−44.1%. Both trace to one number:

| | cheese serving | outcome |
|---|---:|---|
| 10 of 12 draws | **50 g** | PASTEL passes |
| iter-b4-002 d2, iter-b4-004 d1 | **30 g** | PASTEL fat fails |

The cheese blend is the dish's dominant fat at 30 g/100 g. When its serving drops to 30 g the inside
sum falls to 280, so `resolveGrams` scales it back up to only 32.1 g, and the dish's fat falls from
~20 g to 15 g. **Nothing else varies.** This is a portion-stability problem on one ingredient, not a
systemic one — and it is the natural next target.

**FINDING 2 — the accompaniment judgment is completely stable.** The model tagged PASTEL's beans
`within_printed_weight: false` in **12 of 12 draws**, and Salmone's baguette likewise. iter-b4-001's
result was not a fluke. `printed_total_g` also read correctly in **12 of 12** — 200, 200, 300 — with
no nulls and no misreads.

**FINDING 3 — displacement is near-deterministic under B4.** CESAR 20.4% in 11 of 12 draws (20.0%
once); Salmone **14.3% in 12 of 12** with a total error of +2.0% in 12 of 12; PASTEL 18.4–22.7%. The
remaining PASTEL spread is the beans serving flapping between 50 g and 100 g against the oracle's
80 g — which never costs a field, because beans are low-fat and the bands absorb it.

**What is still NOT settled.** The margins from iter-b4-001 Finding 6 have not moved: a large share
of fields pass within a few percentage points of their band edge, so a tighter tolerance would still
fail them. And the oracle-strictness question (iter-b13-001 Finding 5) remains open and unanswered.

**Archived raw responses:** `scripts/fixtures/caches/macro-bench.iter-b4-{002,003,004}-d{0,1,2}.raw.json`.
Cost from the archived `usage` blocks: 8,802 input + 12,571 output tokens = **$0.1477** for the three
runs. Four-run B4 total **$0.197**. Phase total **$0.374**.

**Verdict: B4 is reproduced and is the best result the phase has produced by a wide margin.** Whether
that justifies deployment is Santiago's call, not a measurement question. The one open engineering
target is the cheese-serving instability in Finding 1.

### baseline-w1…w4 and iter-b4-w1…w4 — B14, the WIDENED 8-dish set (2026-08-09, $0.96, 8 runs × 3 draws)

> ⚠️ **Every figure in this entry PREDATES the 2026-08-09 PASTEL tortilla re-freeze.** It is kept
> as written, because that is what the run reported at the time. For the current value of these
> same archives see the **ORACLE RE-FROZEN 2026-08-09** entry below, or just run
> `deno run --allow-read scripts/rescore-history.ts`.


**The metric de-saturated, and B4 separates from the baseline for the first time.** Santiago approved
the five dishes, the sub-3 g floor and both paid arms on 2026-08-09. Run IDs carry a `-w` suffix for
"widened"; they are **not** comparable to the 36-field figures above, which are 3 dishes.

| arm | failed field/draws | mean abs error |
|---|---|---:|
| baseline (pre-B1 prompt, `ce91e91`) | **39/96 in all four runs** | 37.4% |
| **B4** (`22a1ac5`) | **22–24/96** | **19.7–20.1%** |

On the OLD three dishes both arms still score **0 of 48 each** — the saturation was real and total, and
every bit of discriminating signal came from the five new dishes. That is B14 doing exactly its job.

| dish | baseline failed | baseline err | B4 failed | B4 err |
|---|---:|---:|---:|---:|
| CESAR / Salmone / PASTEL | 0/48 each | 11–23% | 0/48 each | 14–15% |
| NEW YORK | 24/48 | 44.8% | **0/48** | **4.8%** |
| French Fries (300gr) | 48/48 | 46.9% | **0/48** | **6.1%** |
| Gnocchi alla sorrentina | 48/48 | 86.1% | 44/48 | 47.7% |
| ENFRIJOLADAS (135gr.) | 36/48 | 59.7% | 28/48 | 30.9% |
| Coleslaw (150gr) | **0/48** | 5.1% | **22/48** | 24.9% |

**Method notes.** The baseline arm was run from a temporary worktree detached at `ce91e91` — the last
commit before B1 — with the 8-dish oracle copied in, so it is the *real* pre-B1 prompt and not a
reconstruction (lesson 23). Both arms were then scored by one path, `rescore-history.ts`, which now
reads its bands from `macro-score.ts` instead of keeping a second copy of them. Re-running it over all
ten historical runs reproduces every published figure unchanged, with `abs-floor 0` on all of them,
which is the evidence that the new floor cannot reach history.

**Baseline dispersion is again 0.0%** — all four runs scored 39/96 and 37.4% identically. Verified as
four genuine calls, not a copy: 12 distinct response IDs and `created` timestamps on the pinned model.
This matches the property recorded when B8 was killed; the baseline's answers are multiples of 5.

**Findings:**

1. **B4's mechanism generalises.** It was designed against three dishes and, unmeasured, handled two
   brand-new ones almost perfectly — NEW YORK 44.8% → 4.8% error, French Fries 46.9% → 6.1%. On
   NEW YORK it tagged the chimichurri as sitting OUTSIDE the printed 400 g **unprompted**, the same
   move it made on PASTEL's beans.
2. **The hand audit is clean.** Across the five new dishes the model named **no ingredient that is not
   printed on the menu** and invented nothing. It also hit the printed weight *exactly* on
   ENFRIJOLADAS (135 g) and Coleslaw (150 g).
3. **B4 REGRESSED on Coleslaw: 0/48 → 22/48.** The only dish where the baseline wins. B4 portions the
   dressing at 20 g where the oracle says 30 g, and dressing is the whole fat and most of the carb of
   a slaw, so the dish comes in light. This is the CESAR dressing failure shape again, and it is the
   first evidence that B4's portion-fitting can *hurt* a small side dish.
4. **Three of the remaining failures are portion disagreements where both parties are defensible** —
   the Caesar dressing situation, not model error:
   - Gnocchi: model puts 150 g of the 180 g on gnocchi, the oracle 110 g.
   - ENFRIJOLADAS: model 60 g of tortilla and 40 g of chicken, the oracle 72 g and 25 g.
   - Coleslaw: model 20 g of dressing, the oracle 30 g.
   **None of these should be changed without Santiago** — the oracle is his. They are flagged because
   the last time we assumed the oracle was right about a dressing, it was not.
5. **The sub-3 g floor was necessary and is doing exactly one job.** Six field/draws per run land on it
   (NEW YORK carb, Coleslaw protein). Before it existed, NEW YORK read `0/48 failed` and `44.4%` mean
   error simultaneously — the model answering "0 g carb" for a steak scored a 100% error that was
   real arithmetic and meaningless nutrition. Such fields are now counted for pass/fail, excluded from
   the mean, and **reported as an `abs-floor` column** so the exclusion can never be silent.

**Cost:** 8 runs × 3 draws × 8 dishes plus a 1-draw smoke test, **$0.96**. Phase total **$1.33**.

**Verdict: B4 beats the baseline on the widened set by roughly 2× on both metrics, and the checkpoint's
bar moves here.** The old "0–1 of 144" bar described a saturated 3-dish set and is retired as a target;
the live bar is **22–24 of 96**. Nothing is deployed. Open engineering targets are now Coleslaw
(Finding 3) and Gnocchi (44/48), not the PASTEL cheese wobble.

### b9-gpt55-w1…w4 — B9, the CROSS-MODEL arm (2026-08-09, ~$0.47, 4 runs × 3 draws)

> ⚠️ **Every figure in this entry PREDATES the 2026-08-09 PASTEL tortilla re-freeze.** It is kept
> as written, because that is what the run reported at the time. For the current value of these
> same archives see the **ORACLE RE-FROZEN 2026-08-09** entry below, or just run
> `deno run --allow-read scripts/rescore-history.ts`.


**The question B9 existed to answer: is the remaining error a GPT-4o ceiling or a task ceiling?
Answer: a TASK ceiling.** A model a generation and a half newer moves the total essentially nothing.

Model chosen by listing the account's models (`GET /v1/models`) and taking the newest **dated
snapshot**: `gpt-5.5-2026-04-23`. The `gpt-5.6-*` entries of 2026-06-23 exist but publish no dated
snapshot form — they are floating aliases, and pinning discipline (commit `0476481`) rules them out.

| arm | failed field/draws | mean abs error |
|---|---|---:|
| GPT-4o `gpt-4o-2024-08-06` (B4) | 22–24/96 | 19.7–20.1% |
| GPT-5.5 `gpt-5.5-2026-04-23` | 17–22/96 | 18.6–20.8% |

⚠️ **CONFOUND, recorded not buried: `gpt-5.5-2026-04-23` REJECTS `temperature: 0`** — *"Only the
default (1) value is supported."* `seed` is accepted. The arm therefore cannot be run at production
parity: GPT-4o ran at temperature 0, GPT-5.5 at its default 1. Its wider spread (17–22, against
GPT-4o's 22–24) is consistent with sampling variance, so **its best run is partly luck and the
ranges overlap.** Treat the two as level, not as a GPT-5.5 win. Probe archived as `probe-b9-d0`.

**The totals are level; the COMPOSITION is completely different — and it regressed two dishes that
GPT-4o had perfect:**

| dish | GPT-4o | GPT-5.5 |
|---|---|---|
| CESAR | 0/48, 14.5% | 0/48, **9.4%** |
| **Salmone toscano** | **0/48, 13.7%** | **12/48, 21.1%** |
| **PASTEL AZTECA** | **0/48, 14.1%** | **13/48, 32.2%** |
| NEW YORK | 0/48, 4.8% | 0/48, 3.9% |
| French Fries | 0/48, 6.1% | 0/48, 6.4% |
| Gnocchi | 44/48, 47.7% | **27/48, 35.1%** |
| ENFRIJOLADAS | 28/48, 30.9% | **14/48, 22.3%** |
| Coleslaw | 22/48, 24.9% | **12/48, 25.8%** |

GPT-5.5 improves every dish GPT-4o struggled with and breaks two it had exact.

**Findings:**

1. **PASTEL's regression is mostly OUR ORACLE, not the model.** GPT-5.5 lists `tortillas de maíz en
   pastel` at 90 g. The menu never prints tortilla, and Santiago's oracle convention excludes what is
   not printed — so a model that correctly identifies a tortilla casserole as containing tortilla is
   scored wrong for it. This is the fixture's own documented artifact (B14 warned that PASTEL "cannot
   serve as a portion target") now **actively penalising the better-reasoning model.** It is an
   argument for revisiting that fixture, and the oracle is Santiago's alone.
2. **Salmone's regression exposes a real defect in B4's mechanism.** GPT-5.5 lists more accompaniment
   mass inside the printed weight — 358 g of servings against a printed 200 g, where GPT-4o listed
   220 g. `resolveGrams` fits both to 200 g, so GPT-5.5's salmon is scaled to **112 g** against
   GPT-4o's 136 g and the oracle's 140 g. **The more complete the ingredient list, the more the
   principal protein is diluted.** The fit is proportional when it should protect the main component.
3. **That is the same root as the Coleslaw regression.** There too the fit under-weights the
   macro-dense component (dressing) relative to bulk (cabbage). **One mechanism defect explains both
   open targets**, which makes it the highest-value thing to fix next.
4. **Hand audit.** No invented ingredient on any dish, and `frijoles servidos aparte` was correctly
   tagged OUTSIDE the printed weight. The one flag is PASTEL's tortilla — **not a hallucination, an
   inference the oracle forbids.** Recorded as an audit note, not a model failure.

**Verdict: do NOT switch models.** The measurement says a newer model buys nothing on the total and
costs two exact dishes, and the two regressions point at one fixable mechanism. `ENRICH_MODEL` stays
`gpt-4o-2024-08-06`. Phase total **$1.80**.

### ⚠️ ORACLE RE-FROZEN 2026-08-09 — PASTEL gains its tortilla, and it REVERSES B9

**Santiago's ruling, 2026-08-09.** PASTEL AZTECA's recipe now includes 75 g of corn tortilla
(FDC 2707823), rebalanced to hold the printed 300 g. This **supersedes** that dish's original
*"include only ingredients printed on the menu: do not infer tortilla, oil, or cream"* note.

**Refined convention: an ingredient ENTAILED BY THE DISH NAME is not an inference.** A pastel
azteca is a layered tortilla casserole the way a cheeseburger has a bun. Oil and cream stay
excluded — the name does not entail them. The tortilla's 75 g (~25% of the casserole) comes from
layered-casserole ratios, deliberately **not** from the model's 90 g; fitting the oracle to the
thing it measures would be circular.

**Why it had to change:** holding 300 g while excluding the tortilla inflated every other
ingredient (cheese reached 20.5% of plate weight), and B9 measured what that cost —
`gpt-5.5-2026-04-23` listed the tortillas and was scored **13/48 failed for being right**, where
`gpt-4o-2024-08-06`, which omits them, scored 0/48. **The fixture was rewarding the weaker reading.**

New totals: **623.6 kcal / 44.3 P / 65.2 C / 22.4 F** (beans outside, 380 g eaten).

**Re-scored history, $0** (`deno run --allow-read scripts/rescore-history.ts`):

| run | failed (was) | mean abs error (was) |
|---|---|---|
| baseline-002 | 0/36 (0) | 17.5% (16.7%) |
| iter-b4-001…004 | 1–3/36 (0) | 16.2–18.6% (13.6–14.7%) |
| baseline-w1…w4 | 39/96 (39) | 37.7% (37.4%) |
| iter-b4-w1…w4 | **24–27/96** (22–24) | **21.0–21.2%** (19.7–20.1%) |
| b9-gpt55-w1…w4 | **14–19/96** (17–22) | **15.5–17.2%** (18.6–20.8%) |

🔴 **THIS REVERSES B9's VERDICT.** Under the old oracle the two models overlapped and the entry
concluded *"the ceiling is the task, not GPT-4o; do not switch models."* Under the corrected
oracle **the ranges do not overlap and GPT-5.5 clearly wins on both metrics.** The earlier
"task ceiling" reading was substantially our own fixture. The `temperature: 0` confound still
stands and still means GPT-5.5 carries more spread — but a gap this size across all four runs is
not sampling noise. **Switching models is now a live question rather than a closed one, and it is
Santiago's decision, not a measurement one.**

⚠️ B4 no longer sweeps the original three dishes either — `iter-b4-001…004` go from 0/36 to
1–3/36. The corrected PASTEL is harder for a model that omits the tortilla, which is the point.

### $0 ABLATION — "protect the principal component" when fitting is FALSIFIED (2026-08-09)

Tested before spending anything, from archived responses. The hypothesis was that `resolveGrams`
scaling every inside ingredient proportionally dilutes the principal component when a model lists
more mass, and that protecting the largest inside ingredient would help.

| arm | proportional (current) | protect principal |
|---|---|---|
| GPT-4o | 103/384, 21.1% | **105/384**, 20.9% |
| GPT-5.5 | 66/384, 16.3% | **69/384**, 17.3% |

**It makes the failure count worse on both arms.** `resolveGrams` is unchanged. Cost: $0, against
a paid run that would have measured the same thing.

**Two corrections to the B9 entry above, both from measurement:**

1. **"One mechanism defect explains both open targets" was WRONG.** The scale factor
   `resolveGrams` applies to **Coleslaw is exactly 1.00 in all 12 GPT-4o draws** — the fit is a
   no-op there, so Coleslaw's regression cannot be the fit. Its cause is a plain portion
   disagreement: the model puts 20 g of dressing where the oracle says 30 g.
2. **The severe compression is a GPT-5.5 phenomenon, not a pipeline one.** Scale factors under
   GPT-4o run 0.87–1.06; under GPT-5.5 they run 0.53–0.83 because it lists far more mass. And
   GPT-5.5 still wins, so the compression is not obviously harmful.

**Remaining open targets are portion/oracle disagreements, not mechanism defects:** Coleslaw
(dressing 20 g vs 30 g), Gnocchi (gnocchi 150 g vs 110 g, sauce 20 g vs 45 g), ENFRIJOLADAS
(tortilla 60 g vs 72 g, chicken 40 g vs 25 g). Each is a case where both readings are defensible,
and **the oracle is Santiago's.**

### USDA adjudication of the three portion disagreements (2026-08-09, $0)

Santiago approved using the FDC API to settle them, the same way the Caesar dressing was settled.
Evidence pulled from `foodPortions` (USDA's own standard serving weights) and the per-100 g spread
of finished-dish entries. **Two of the three are now closed; the third turned out not to be a
portion question at all.**

| dish | USDA evidence | ruling |
|---|---|---|
| **Coleslaw** | USDA's default serving of coleslaw dressing (FDC 2710200) is **31 g**; 1 tbsp = 15.6 g, so 30 g = 2 tbsp exactly. At 30 g the dish is **108 kcal/100 g**, inside the real-product cluster (107–124; FNDDS 117). At the model's 20 g it is **84 kcal/100 g — below every real coleslaw in FDC** bar the fat-free ones. | **Oracle right, unchanged at 30 g.** B4's Coleslaw regression is genuine model error, not an oracle artifact. The opposite outcome to the Caesar dressing. |
| **ENFRIJOLADAS** | FNDDS corn tortilla: small **18 g**, medium **28 g**. The oracle's 24 g each is the small–medium midpoint; the model's 20 g is near small. Impact on dish totals: **2%** (254 → 249 kcal). | **Oracle right, unchanged at 72 g** — and it is not what fails this dish. All three arms run protein **+33–48%** over the oracle's 25 g chicken. That, not the tortilla, is the live disagreement, and USDA cannot settle it. |
| **Gnocchi** | See the scope entry below — **not a portion dispute.** | Deferred to Santiago. |

**Method note:** the portion probe was a throwaway script, not a new `usda-oracle.ts` command.
Portion lookups are not routine yet; promote it if they become so.

### ⚠️ SCOPE, not portion — the printed weight is not always the plate (2026-08-09, $0)

**Every arm overshoots Gnocchi in the same direction**, which is a scope signature, not model error:

| arm | calories vs oracle | carbs vs oracle |
|---|---:|---:|
| baseline | +107% | +124% |
| B4 / GPT-4o | +26% | +79% |
| GPT-5.5 | +17% | +61% |

Three independent pipelines all say the dish is bigger than the oracle allows. The Casa Nostra
photo says why: it prints **180 g on five different fresh-pasta dishes** — Fettuccine, Pasta alla
romana, both Gnocchi, Ravioli — which cannot all plate at the same weight with different sauces
and toppings, and prints **80 g** on a spaghetti-with-scallops dish, impossible as a plated total.
USDA's standard gnocchi serving (1 cup) is **188 g** ≈ the printed 180 g.

**`find-weighted-dishes.ts` shows the convention is menu-wide, not a Casa Nostra quirk.** Andaluz
prints `ESPÁRRAGOS CON JAMÓN SERRANO (20 g)`, `PANELA PLUS ASADA (30 g)`, `COSTRA DE CHAMORRO
(80 g)`, `QUESO FUNDIDO / Con chistorra y champiñón (90 g)` and `TACOS O FAJITAS DE DIEZMILLO
(3 pzas./200 g)`. **A 20 g plate does not exist** — those weights name one component. The oracle
currently applies "printed weight = the whole plated dish" uniformly to all eight fixtures.

The pattern that actually fits the corpus:

| shape | reading | fixtures |
|---|---|---|
| Weight on a **side dish** | the whole dish ✅ current reading holds | French Fries, Coleslaw |
| Weight on a **main with a stated accompaniment**, or a uniform weight repeated across a section | the **principal component** ⚠️ current reading may be wrong | Gnocchi, Salmone, CESAR, NEW YORK |
| A **tiny** weight (20–90 g) | one named component, never the plate | not in the fixture set |

What re-reading Casa Nostra would cost, computed at $0:

| dish | current (printed = plate) | component reading | change |
|---|---|---|---|
| Gnocchi | 180 g, 242 kcal | 180 g gnocchi → 250 g plate, **336 kcal** | **+39%** |
| Salmone | 245 g, 607 kcal | 200 g salmon → 305 g plate, **771 kcal** | **+27%** |

⚠️ **This re-opens the printed-weight scope question, which is currently marked CLOSED ("ruled,
applied blind"), so it needs a new ruling.** And it does not stop at Gnocchi: Salmone currently
scores **0/48 on GPT-4o**, so re-reading it could break a passing fixture. Passing against a
possibly-wrong oracle is exactly the PASTEL trap. **Nothing changed. Santiago's call.**

### pipeline-integrity arm — can GPT-5.5 replace the pin without breaking the app? (2026-08-09, ~$0.72)

**The macro benchmark tested almost none of the production path.** It sends 8 fixture items in one
call; production sends whole menus through `callGptEnrich` in batches of `ENRICH_BATCH_SIZE = 10`.
Item count, input order, allergens and truncation were never measured on any model.

🔴 **A latent break was found before it shipped, at $0.** `enrichBatch` hardcoded `temperature: 0`,
which `gpt-5.5` **rejects outright** — *"Only the default (1) value is supported."* Swapping
`ENRICH_MODEL` alone would have 400'd **every scan in production**. The benchmark could never have
caught it: `bench-macros.ts:151` quietly drops the parameter for an overridden model, so the entire
measured GPT-5.5 arm ran a path production does not have. Fixed in `a9fce10` — `samplingFor(model)`
attaches the parameter to the model, and `callGptEnrich` moved into `enrich.ts` so a harness can
exercise the real batching instead of a copy (lesson 23).

Run: two real archived menus (Andaluz 36 items, Polloteria 55) × both models, 20 batched calls, no
OCR and no extraction bought. Archives: `scripts/fixtures/caches/pipeline.<model>.<menu>.raw.json`.

| menu | model | sent → returned | order | dropped | items w/ allergens | latency |
|---|---|---|---|---|---|---:|
| Andaluz | gpt-4o | 36 → 36 | ok | 0 | 21 | 30.4 s |
| Polloteria | gpt-4o | 55 → 55 | ok | 0 | 37 | 40.7 s |
| Andaluz | gpt-5.5 | 36 → 36 | ok | 0 | 27 | **72.3 s** |
| Polloteria | gpt-5.5 | 55 → 55 | ok | 0 | 39 | **100.9 s** |

**Findings:**

1. **Integrity is clean on both.** Zero dropped items, order preserved, every item got a non-empty
   ingredient list. Neither model truncates a 55-item menu at batch size 10.
2. **GPT-5.5 is ~2.4× slower** — 101 s against 41 s on the 55-item menu, and that is Stage 2 alone,
   on top of Stage 1a OCR and Stage 1b structuring. This is a **new** consideration that the macro
   benchmark could not surface, and it is a product decision, not a measurement one.
3. **GPT-5.5 flags more allergens, in the safer direction.** It adds `egg` to every breaded item and
   flags `dairy, egg, gluten` on items GPT-4o returned **no allergens at all** for (El Tendedero,
   Megacharola Boneless — both breaded-chicken platters). Given the mandatory allergen disclaimer,
   under-flagging is the dangerous failure. Not scored against an oracle — no allergen oracle exists.
4. **GPT-5.5 is wrong about mineral water.** It assigns **252 kcal** to `Bebida de litro mineral
   (1lt)`; GPT-4o says 0. It also gives 252 kcal to `Bebida de litro natural`, which is plausibly
   right. Drinks are out of the benchmark entirely (Feature 5 is deferred post-release), so this is
   unmeasured territory for both models.

**Cost — I under-quoted this run.** I told Santiago "under $0.50" by pricing per *menu*; it is 10
batched calls per model, not 2. At the per-call rates B14 and B9 measured (~$0.033 GPT-4o, ~$0.039
GPT-5.5) it is **≈$0.72**. Exact figure unavailable: the harness archives the reassembled items, not
the API `usage` block. Phase total ≈ **$2.52**.

**Verdict: GPT-5.5 clears the integrity bar, so the blocker is no longer "unknown".** What the
switch now trades is **2.4× Stage-2 latency and a worse drinks answer** against **better macros
(14–19/96 vs 24–27/96) and safer allergen coverage**. That is Santiago's call, and it is a product
trade-off rather than a measurement gap.

---

### Printed-weight SCOPE evidence pass — $0 (2026-08-09)

**Method.** The five source photos were read directly; no claim below comes from
`find-weighted-dishes.ts` or extraction text. The hypothetical replay used the
shared `macro-measure.ts` path against all four archived GPT-4o/B4 runs
(`iter-b4-w1…w4`, 12 draws, 48 fields per dish). It changes only the two Casa
Nostra principal-component allocations, preserves the existing PASTEL alternate
reading, and makes no model call or oracle edit.

**Table A — photo evidence.** For the two El Marcos entries, “principal component”
means the menu explicitly defines the gramme figure as applying to the main ingredients
collectively; it is not an assertion that one arbitrary ingredient owns all grams.

| dish | menu line verbatim | classification | reason |
|---|---|---|---|
| CESAR | `CESAR (200 g) $275 — Lechuga, queso parmesano rallado, croutones, pollo a la plancha y aderezo cesar de la casa.` | whole plate | `(200 g)` is in the title before the ingredient line; no accompaniment is named. No other printed-weight salad appears in `ensaladas` (although 200 g repeats in other sections). The named salad and all listed ingredients form the serving. |
| Salmone toscano | `Salmon al horno bañado en crema toscana blanca con ajo, espinaca, alcachofa, tomate deshidratado y alcaparra, acompañado con baguette. 200g · $330` | principal component | `200g` comes after the accompaniment clause. In `Frutti di mare`, both `Salmone padella` and `Salmone al pesto` also print 200g; the same page separately prints an implausible 80g for spaghetti with scallops and baguette. The repeated value is a salmon/fresh-pasta portion, not everything eaten. |
| PASTEL AZTECA | `PASTEL AZTECA (300gr.) 94 — Con pollo, salsa de tomate, chile verde, cebolla, elote y mezcla de quesos, servido con frijoles.` | principal component | `(300gr.)` is in the title before the `servido con frijoles` clause; it does not repeat in `MEXICANOS`. The footer explicitly says `El gramaje se refiere a los ingredientes principales`; beans are an accompaniment. The current recipe already makes the non-bean casserole ingredients exactly 300g. |
| NEW YORK | `NEW YORK $690 — Calidad choice acompañado de chimichurri de la casa. (400gr)` | principal component | `(400gr)` sits after the chimichurri accompaniment clause. `RIB EYE` repeats the same wording and 400gr in `CARNE`. **BraseroMenu.png, BraseroMenuTwo.png, and BraseroMenuTwo_TWo.png state no weight basis; the pre-cook question is OPEN and photo-unsupported.** It comes only from this oracle entry's own `assumed` note, which raises the restaurant-category assumption that steakhouses often print raw cut weight. The steak is the weighed product, not its sauce. |
| French Fries | `French Fries (300gr) $60 — Papas a la francesa con un toque de perejil.` | whole plate | `(300gr)` is in the title before the description. `Papas Sazonadas` repeats 300gr in `Sides`; no accompaniment clause exists. The small parsley garnish does not create a separate eaten component. The same raw-product footer is a basis caveat, not a scope change. |
| Coleslaw | `Coleslaw (150gr) $52 — Ensalada de col morada, repollo y zanahoria con un delicioso aderezo cremoso.` | whole plate | `(150gr)` is in the title before the description. `Ensalada Verde` repeats 150gr in `Sides`; no accompaniment clause exists. The dressing is described as part of the salad, so it belongs inside the serving. |
| Gnocchi alla sorrentina | `Gnocchi fresco en salsa preparada de tomate italiano con mozzarella fresco gratinado y parmesano. 180g · $250` | principal component | `180g` ends the description. Five `Pasta` entries repeat it: `Fettuccine CasaNostra`, `Pasta alla romana`, `Gnocchi alla sorrentina`, `Gnocchi toscano`, and `Ravioli`. This is a standardized fresh-pasta amount, not a plated total including sauce and cheese. |
| ENFRIJOLADAS | `ENFRIJOLADAS (135gr.) 94 — Tres tortillas de maíz rellenas de pollo y bañadas con salsa de frijol, crema y queso cotija.` | principal component | `(135gr.)` is in the title before the description and repeats on `ENCHILADAS` in `MEXICANOS`. The same footer says grammes refer to principal ingredients. Here every named ingredient is already in that core set and there is no accompaniment clause, so the current 135g total is unchanged. |

**Andaluz side finding (photo, no extraction change):** `ESPÁRRAGOS con jamón serrano` is **(30 g)**, not 20 g. The other disputed line is `QUESO FUNDIDO — Con chistorra y champis **(50 g)**`, not 90 g.

**Table B — GPT-4o/B4 replay.** Totals are `kcal / protein g / carb g / fat g`.
Mean absolute error excludes fields decided by the existing <=3g absolute floor, exactly as
`macro-measure.ts` does. Deltas are re-read minus current.

| dish | current oracle totals | totals under re-read | Δ failed/48 | Δ mean error |
|---|---:|---:|---:|---:|
| CESAR | 409.5 / 30.4 / 18.4 / 23.1 | 409.5 / 30.4 / 18.4 / 23.1 | 0 | 0.0 pp |
| Salmone toscano | 606.6 / 42.7 / 30.2 / 34.5 | 771.0 / 58.0 / 30.2 / 45.5 | **+34** | **+16.0 pp** |
| PASTEL AZTECA | 623.6 / 44.3 / 65.2 / 22.4 | 623.6 / 44.3 / 65.2 / 22.4 | 0 | 0.0 pp |
| NEW YORK | 1257.7 / 103.1 / 0.8 / 93.9 | 1257.7 / 103.1 / 0.8 / 93.9 | 0 | 0.0 pp |
| French Fries | 409.2 / 6.2 / 52.5 / 20.1 | 409.2 / 6.2 / 52.5 / 20.1 | 0 | 0.0 pp |
| Coleslaw | 162.7 / 1.5 / 15.3 / 10.6 | 162.7 / 1.5 / 15.3 / 10.6 | 0 | 0.0 pp |
| Gnocchi alla sorrentina | 242.0 / 9.3 / 22.3 / 13.1 | 336.5 / 11.0 / 34.4 / 17.5 | **−26** | **−20.1 pp** |
| ENFRIJOLADAS | 253.7 / 13.5 / 36.1 / 6.9 | 253.7 / 13.5 / 36.1 / 6.9 | 0 | 0.0 pp |
| **overall (384 field/draws)** | **103 failed; 21.1%** | **111 failed; 20.5%** | **+8** | **−0.6 pp** |

**What one consistent rule looks like.** A printed number is not automatically a
whole plate. It applies to the menu-defined food unit: an explicit footer wins;
an explicit accompaniment stays outside; otherwise a repeated named steak/fresh-pasta
weight denotes that principal component, while a standalone described salad or side
denotes the whole serving. This is one syntax-and-menu-convention rule, applied to all
eight, rather than a score-driven exception per dish.

It helps Gnocchi materially (44/48 -> 18/48 failed fields), leaves six fixtures
unchanged, and hurts currently-perfect Salmone (0/48 -> 34/48). Overall it improves
mean error slightly but adds eight failed field/draws. **Recommendation: adopt the
classification rule only if Santiago accepts the semantic evidence over the current
score; do not adopt it as an accuracy optimization.** It is **not** a claim that every
printed weight is a whole plate, not a per-dish patch, not a raw-to-cooked conversion,
not a model/prompt change, and not an oracle change made by this session.

### Printed-weight BASIS evidence pass — $0 (2026-08-09)

**SUPERSEDED ON BASIS ONLY by Santiago's 2026-08-09 ruling below.** The photo evidence remains;
French Fries is now re-frozen as raw potato deep-fried, while the silent-menu cases retain their
cooked/as-served totals as labelled assumptions. The SCOPE question remains open.

**Correction to the preceding scope table.** `BraseroMenu.png`, `BraseroMenuTwo.png`,
and `BraseroMenuTwo_TWo.png` have no weight-basis footer. NEW YORK's raw-versus-cooked
question is photo-unsupported and comes only from its frozen `assumed` note. Conversely,
the Polloteria photo really does print `*El peso del producto es antes de cocinarlo.` at
its bottom left. El Marcos's `El consumo de productos crudos es bajo responsabilidad de
quién lo solicita` is a liability disclaimer, not a weight statement.

**Table A — basis evidence from photos.** “Assumption required” is deliberately not a
basis classification: the menu is silent and cannot settle the question.

| dish | printed weight | basis | evidence rank |
|---|---:|---|---|
| CESAR | 200g | cooked/as-served | **(b)** A finished salad listing `pollo a la plancha`; the menu does not state when it was weighed, but a final salad total is only meaningful as served. |
| Salmone toscano | 200g | assumption required | The menu says `al horno` but never says whether its 200g was measured before or after baking. Current cooked reading is an **assumption**. |
| PASTEL AZTECA | 300g | cooked/as-served | **(b)** A plated casserole `servido con frijoles`; its main-ingredients footer governs scope, not basis. No raw-weight statement. |
| NEW YORK | 400g | assumption required | Brasero is silent in all three supplied photos. Current cooked reading and the oracle's possible raw-cut reading are both restaurant-category **assumptions**. |
| French Fries | 300g | raw/uncooked | **(a)** Polloteria expressly says `El peso del producto es antes de cocinarlo.` |
| Coleslaw | 150g | raw/uncooked | **(a)** The same Polloteria statement applies. Its vegetables are not cooked, so raw and final vegetable mass are the same basis here. |
| Gnocchi alla sorrentina | 180g | assumption required | `Gnocchi fresco` identifies the product but does not say before or after boiling; Casa Nostra gives no basis statement. |
| ENFRIJOLADAS | 135g | cooked/as-served | **(b)** Three tortillas are `rellenas` and `bañadas`; this is a finished dish weight. El Marcos gives no raw-weight statement. |

**Table B — isolated other-basis replays, GPT-4o/B4 (four archived runs, 48 fields per dish).**
Each counterfactual holds the frozen scope and all other ingredients fixed; it changes only the
stated basis input. They are independent alternatives, so they must not be summed into a false
“overall” score. Mean absolute error follows `macro-measure.ts` and excludes the <=3g absolute-floor
field.

| dish | current totals (kcal / P / C / F) | totals under other basis | Δ failed/48 | Δ mean error |
|---|---:|---:|---:|---:|
| CESAR | 409.5 / 30.4 / 18.4 / 23.1 | n/a — settled as served | n/a | n/a |
| Salmone toscano | 606.6 / 42.7 / 30.2 / 34.5 | 486.2 / 35.7 / 30.2 / 24.4 — raw salmon FDC 2706284 at the frozen 140g allocation | **+2** | **+2.9 pp** |
| PASTEL AZTECA | 623.6 / 44.3 / 65.2 / 22.4 | n/a — settled as served | n/a | n/a |
| NEW YORK | 1257.7 / 103.1 / 0.8 / 93.9 | 927.7 / 72.3 / 0.8 / 70.8 — the oracle's own 400g raw -> 280g cooked (70% yield) reading | **+31** | **+25.5 pp** |
| French Fries | 409.2 / 6.2 / 52.5 / 20.1 | n/a — settled by the menu's explicit raw basis and the fourth-re-freeze potato-plus-absorbed-oil composite | n/a | n/a |
| Coleslaw | 162.7 / 1.5 / 15.3 / 10.6 | unchanged — no cooking transformation | 0 | 0.0 pp |
| Gnocchi alla sorrentina | 242.0 / 9.3 / 22.3 / 13.1 | 295.9 / 9.3 / 50.0 / 6.1 — fresh potato gnocchi FDC 2452382 at the frozen 110g allocation | **−20** | **−18.0 pp** |
| ENFRIJOLADAS | 253.7 / 13.5 / 36.1 / 6.9 | n/a — settled as served | n/a | n/a |

**Interpretation and recommendation.** CESAR, PASTEL, and ENFRIJOLADAS are sufficiently
settled as served by their described finished dishes; Polloteria settles French Fries and
Coleslaw as pre-cook. The genuine unresolved cases are **Salmone, NEW YORK, and Gnocchi**.
For the latter two, the photos cannot choose a basis: NEW YORK's raw option harms an otherwise
perfect fixture heavily, while the fresh-gnocchi alternative materially improves Gnocchi.

The consistent rule should be: use an explicit restaurant basis statement when printed; otherwise
record an assumption rather than infer one from a different restaurant or from menu category.
For composite finished dishes, use as-served only where the menu's wording makes another reading
non-sensical. **Recommendation: retain existing totals and ask Santiago to rule only NEW YORK,
Salmone, and Gnocchi together.** This is **not** an oracle re-freeze, scope ruling, model/prompt
change, conversion of a raw liability disclaimer into a weight rule, or a claim that raw potato
alone represents fried potatoes.

**El Marcos citation-only oracle edit.** Added the photo-verbatim line `El gramaje se refiere a
los ingredientes principales.` to the existing `assumed` fields for PASTEL AZTECA and
ENFRIJOLADAS. `deno run --allow-read scripts/rescore-history.ts` was byte-identical before and
after (the archived 3-dish history remains `0/36`, `9/36`, `2/36`, `4/36`, `10/36`, `5/36`,
`1/36`, `3/36`, `3/36`, `2/36`; no total moved).

---

## Rulings

### Printed-weight BASIS *(Santiago, 2026-08-09)*

> **Follow the menu where it speaks. Where the menu is silent on basis, keep cooked/as-served and LABEL it as an assumption.**

A printed basis statement is binding. Silence is not evidence for flipping anything.

### ⚠️ ORACLE RE-FROZEN 2026-08-09 — fourth re-freeze, French Fries basis

**$0; no model calls.** Polloteria's photo explicitly says `*El peso del producto es antes de
cocinarlo.` The French Fries 300gr is therefore **300 g raw potato**, not a 300 g finished-fries
product. Coleslaw does not move: its ingredients are not cooked. Casa Nostra and Brasero are silent,
so Salmone, NEW YORK, and Gnocchi keep their cooked/as-served totals as labelled assumptions.

The new composite is 300 g FDC **170026** raw potato plus 19.8 g FDC **2710191** soybean oil. USDA
Agriculture Handbook 102, potato item 2038, gives raw pared potato -> French fried a **55% yield**
(40–68), hence 165 g finished. [Chiou et al. (2013)](https://doi.org/10.1111/ijfs.12070) measured
mean oil absorption of **6.6% of fresh potato weight** (5.6–8.4), which supplies the 19.8 g oil.
The resulting **248.0 kcal/100 g finished** lies inside the FDC real-fries cluster: 198 (2709458),
225 (2709463), 289 (2709462), and 312 (2709461). It is a sourced composite, not a choice of the
richest defensible fries entry and not a fit to any model output.

| French Fries (300gr) | before | after |
|---|---:|---:|
| oracle totals (kcal / P / C / F) | 867.0 / 10.5 / 111.6 / 42.0 | **409.2 / 6.2 / 52.5 / 20.1** |
| GPT-4o/B4, four archived runs (48 fields) | 0 failed; 6.1% mean error | **48 failed; 109.6% mean error** |

| arm, four archived runs | before | after | delta |
|---|---:|---:|---:|
| baseline | 39/96; 37.7% | **27–28/96; 33.5–33.7%** | −11 to −12 failed; −4.0 to −4.2 pp |
| GPT-4o/B4 | 24–27/96; 21.0–21.2% | **36–39/96; 34.8–35.0%** | +12 failed/run; +13.8 pp |
| GPT-5.5/B9 | 14–19/96; 15.5–17.2% | **26–31/96; 28.6–30.5%** | +12 failed/run; +13.1 to +14.0 pp |

**Interpretation.** This makes the measurement stricter in the direction the printed menu requires:
the B4 and B9 archives model finished fries and therefore overshoot a raw-potato target. Baseline is
closer to this one target, but this is not a prompt/model/deployment decision; B4 remains deployed as
v28 and no production code changed. It is not a scope ruling, a model fit, a claim that raw potato is
finished fries without oil, or authority to change any other total.

**Stale-figure notice.** The active wide-arm table, B9 summary, app-wide model table, and the sole
`🎯 CURRENT PHASE` block now carry these fourth-re-freeze figures. The earlier dated B14 and PASTEL
re-freeze tables in this log and roadmap intentionally remain historical snapshots; their old French
Fries and aggregate figures are not current and must not be quoted as current results.

### 💰 Cost is not a constraint *(Santiago, 2026-08-08)*

> *"This is what this session and evaluations are for: to clear out all hypotheses we have on our core
> feature and on ensuring it works and on making it better. Cost is not an issue in these sessions, so
> don't limit yourself to not iterating and experimenting that much due to cost."*

**Never narrow scope, skip an experiment, or recommend stopping on cost grounds.** A session
recommended stopping at $0.374 partly because the remaining gains looked small against the spend; he
corrected that. Iterate until the hypotheses are cleared.

**What still stands:** state the dollar estimate before a paid run and get his explicit approval. That
rule is about *him deciding*, not about price. The two coexist — **tell him what it costs, never argue
that it costs too much.**

### ⚠️ ORACLE RE-FROZEN 2026-08-08 — every figure above this line is pre-re-freeze

**Commit `a60eb2a`.** CESAR's Caesar dressing moved from FDC `2710199` (57.8 g fat/100 g) to FDC
`2290157` (36.67), on Santiago's ruling and on USDA evidence: 57.8 is the top of ~40 full-fat Caesar
entries whose **median is 36.7 and mean 37.7**. Our oracle was stricter than the market; the model's
40 was closer to it than we were. CESAR's dish totals moved with it — calories 462 → 409.5, protein
30.084 → 30.432, carb 17.38 → 18.391, fat 29.4495 → **23.1105**. Salmone and PASTEL are untouched.

**Re-scored history, `deno run --allow-read scripts/rescore-history.ts`, $0, no model calls.** Failed
field/draws of 36 under the PASTEL beans tolerance:

| run | was | **now** | mean abs error |
|---|---:|---:|---:|
| baseline-002 | 6 | **0** | 16.7% |
| iter-b1-001 | 13 | 13 | 23.9% |
| iter-b10-001 | 7 | 5 | 21.4% |
| iter-b11-001 | 6 | 7 | 20.6% |
| iter-b12-001 | 11 | 8 | 23.9% |
| iter-b13-001 | 6 | 3 | 18.3% |
| iter-b4-001 | 0 | **0** | 14.1% |
| iter-b4-002 | 1 | **0** | 14.7% |
| iter-b4-003 | 0 | **0** | 13.6% |
| iter-b4-004 | 1 | **0** | 14.2% |

**FINDING — the re-freeze eliminated the baseline's only failures, and B4's lead on the headline
count with them.** baseline-002r's 6 were *CESAR calories ×3 and CESAR fat ×3* — both fields we just
changed. **Baseline and B4 now tie at 0 of 36.** This was predicted in the spec ("the baseline improves
too… whether B4 still beats baseline is a question the re-score answers, it must not be assumed") and
the answer is: it no longer does, on that metric.

**B4's remaining advantage is real but narrower:** mean absolute error **13.6–14.7% vs baseline's
16.7%**, plus everything the log records about *why* its numbers are what they are. It is still the
best version measured. It is no longer uniquely passing.

**Consequence for future iterations: the failure count is now a saturated gate.** Two very different
pipelines both score 0, so it can no longer tell them apart. **Mean absolute error becomes the primary
number**, with the failure count kept as a floor that must not regress. Any iteration reported only as
"0 failures" from here is reporting nothing.

**Why `rescore-history.ts` is separate from `BENCH_RESCORE=1`:** the harness runs the *current*
scoring path, which is wrong for archives that predate it. There are three eras — baseline-002 and
iter-b1-001 carry no per-ingredient macros (item-level totals), iter-b10/b11 carry per-ingredient
*amounts*, iter-b12 onward carry per-100 g composition. The first attempt at this re-score used the
current path on all ten and produced a tidy table of **−100% failures for six of them**. It printed
cleanly and was entirely false; the era-aware script exists so that cannot recur.

### B5 premise re-derived after the re-freeze — mostly dissolved *($0, 2026-08-08)*

The B5 design (`specs/2026-08-08-b5-preparation-and-oracle-dressing-design.md`) was built on a fat
lean measured against the **old** oracle. Re-running the portion/composition ablation on B4's 12 draws
against the corrected oracle, mean signed error:

| dish | carbs | fat | fat *was* |
|---|---:|---:|---:|
| CESAR | +20.3% | **−8.4%** | −28.1% |
| Salmone | +22.4% | −16.3% | −16.3% |
| PASTEL | −2.7% | −28.3% | −28.3% |

**Roughly 70% of CESAR's fat error was our own oracle**, not the model. What is left is not a
systematic three-dish lean.

**The two halves swapped importance.** Ranked by worst-case error across 12 draws, the top five
remaining errors are now **three portion problems and two composition problems**:

| rank | error | worst | cause | ceiling if fixed |
|---|---|---:|---|---|
| 1 | PASTEL fat | −44.1% | mixed; oracle distorted by the tortilla exclusion | −11.3% grams / −16.5% composition — *neither alone fixes it* |
| 2 | PASTEL carbs | +26.7% | portion | +3.1% |
| 3 | Salmone carbs | +25.8% | portion | +4.1% |
| 4 | CESAR protein | +24.9% | portion (chicken 87 g vs 75) | +7.6% |
| 5 | Salmone fat | −21.7% | composition (salmon) | −2.6% |

**Consequence for B5:** its target was salmon and chicken, on the evidence that the menu states
*al horno* and *a la plancha* and the model ignores both. That evidence is untouched — but CESAR's fat
is now −9.1% worst-case, so the chicken half no longer matters, and PASTEL states no method for its
cheese. **B5 would now move one field on one dish (Salmone fat).** It has not been falsified; it has
been shrunk from a three-dish systematic fix to a single-field one, and priced at ~$0.20 that is a
poor trade. **Not run. The spec stands as designed if the target ever widens again.**

**Note on strictness:** the 0/36 figures above use the PASTEL beans tolerance, as all reporting in this
log does. Scored strictly against the shipped oracle, PASTEL fat still fails **2 of 12** draws — the
cheese-serving instability, unchanged.

### 🏁 CHECKPOINT — `stage2-b4-checkpoint` is the fallback and the publishable state *(Santiago, 2026-08-08)*

> ⚠️ **The tag's message quotes PRE-re-freeze numbers** (2 failed field/draws of 144, mean error
> 16.1–17.3%). Under the corrected oracle the same four runs score **0 of 144, mean error 13.6–14.7%**.
> The tag is immutable by ruling and stays where it is; these are its current figures. Santiago's
> ruling below stands — B4 is still the best measured version — but note it now **ties** the baseline
> on failure count rather than beating it, and leads on mean error instead.

**Git tag `stage2-b4-checkpoint` → commit `22a1ac5`.** Annotated, pushed. `git show stage2-b4-checkpoint`
prints the full measured result.

**Santiago's ruling:** B4 is accepted as the **best version yet**. Iteration continues, but this state
is the floor — **if a later evaluation makes things worse, fall back to this tag**, and if the phase
stops here, this is the state to publish from.

His reasoning, and it is correct: the percentage errors look alarming because the denominators are
small. In absolute terms **every dish's calorie estimate is within 37 kcal of USDA truth from menu
text alone**, and the worst carbohydrate miss is 8.5 g.

| dish | calories off by | carbs off by | fat off by |
|---|---:|---:|---:|
| CESAR | −35 kcal | +4.6 g | −8.4 g |
| Salmone | −37 kcal | +6.8 g | −5.5 g |
| PASTEL | +3 kcal | +8.5 g | −6.8 g |

**What the tag guarantees:** 4 runs × 3 draws, **2 failed field/draws out of 144**, mean abs error
16.1–17.3%. The previous best in the phase was baseline-002r at 6 of 36.

**Working with it:**

```bash
git show stage2-b4-checkpoint                                   # the full result, in the tag message
git diff stage2-b4-checkpoint -- supabase/functions/analyze-menu/   # what has drifted since
git checkout stage2-b4-checkpoint -- supabase/functions/analyze-menu/enrich.ts   # restore the code
```

**Rules that follow from this ruling:**

- **Every future iteration is measured against this tag, not against the baseline.** The bar is now
  0–1 failed field/draws, not 6.
- **A new result only replaces the checkpoint if it beats the RANGE**, over at least the same 4 runs ×
  3 draws. One better run is not enough — that is exactly the trap iter-b4-001 alone would have been.
- **Do not move or delete the tag.** If something better lands, cut a *new* tag and record the
  supersession here; leave this one reachable.
- ~~**Deployment is still unauthorised.**~~ ✅ **SUPERSEDED — Santiago authorised the deploy on
  2026-08-09 and B4 is live as v28.** See the deployment ruling below.

### 🚀 DEPLOYED — B4 is live *(Santiago authorised, 2026-08-09)*

**Edge function `analyze-menu` v27 → v28**, project `uonuiadueykynbetxxrw`, still pinned to
`gpt-4o-2024-08-06`. Deployed with
`supabase functions deploy analyze-menu --project-ref uonuiadueykynbetxxrw` from the worktree,
bundle 105 kB, at branch commit `fbcbd8b` + the docs commit that follows this entry.

**What changed for users:** production had been running the **pre-B1 prompt** — the worst version
ever measured here (39/96 failed field/draws, 37.7% mean error). It now runs B4 (**24–27/96,
21.0–21.2%**), roughly a 2× improvement on both metrics.

**Pre-deploy checks, all green:** project ACTIVE; `OPENAI_API_KEY` and `MISTRAL_API_KEY` sha256
identical between prod and `.env.local`; client compatible (`src/types/scan.ts` reads the same four
macro fields and does not validate-and-strip, so B4's extra `printed_total_g` and per-ingredient
fields pass through harmlessly); suite 337 passed / 1 failed (tile-cut noise).

**Live smoke test** (3 dishes, HTTP 200 in 12.3 s, `model_id` = the pin): `printed_total_g` read
correctly as 200 / 200 / 300, per-ingredient composition present, allergens present. CESAR 427 kcal
vs oracle 410, Salmone 570 vs 607, PASTEL 509 vs 624 (PASTEL's carbs low — the known tortilla gap).
⚠️ **One draw. A functioning check, NOT a quality measurement** — the range rule still applies.

⚠️ **A known regression shipped with it.** B4 is worse than the version it replaced on small dressed
side dishes: **Coleslaw 0/48 → 22/48**, because it under-portions dressing. Accepted knowingly as
the price of a ~2× net win, and USDA has since confirmed the oracle right about that dressing, so
it is genuine model error and a real open target.

**Rollback, one command pair:**

```bash
git checkout ce91e91 -- supabase/functions/analyze-menu/
supabase functions deploy analyze-menu --project-ref uonuiadueykynbetxxrw
```

**Not deployed, and not chosen: GPT-5.5.** Better macros, but ~2.4× slower on Stage 2 and wrong
about mineral water. Declined on the latency trade, not on measurement.

### How to read the track record — insights, not prohibitions *(Santiago, 2026-08-08)*

**These iterations exist to break and confirm hypotheses against grounded data.** A run that
falsifies something is a *result*, not a closed door. When writing up a run, record what the
evidence supports and what it argues against — and frame it as a **prior to weigh in the next
brainstorm**, never as a rule that forbids a class of experiment. Hard rules narrow the search
before the search is finished.

Two things are genuine rules, and only two, because both are Santiago's own and one is
mechanically enforced:
- **No food, dish or cuisine name in the nutrition step of `ENRICH_PROMPT`** — the test set must not
  leak into a prompt that ships to every menu on earth. `enrich_test.ts` fails the build.
- **The frozen oracle and the fixtures change only by Santiago's decision.**

Everything else measured so far is a **scoreboard by kind of change**, to be brought *into* a
brainstorm rather than used to end one:

| kind of change | record | runs |
|---|---|---|
| Prompt wording in step 2 | **0 for 2** — targeted number moved by zero, twice | B11, B13 |
| Mechanism: take arithmetic away from the model, leave it knowledge | **2 for 2** | B10, B12 |
| Schema field added without a mechanism behind it | 0 for 1 (regressed the tally) | B1 |

A wording hypothesis with a **new mechanism** behind it and a **stated falsifier** is still a
legitimate run. What the record argues against is *rephrasing an idea already measured* — that
re-buys a measurement we own.

- **2026-08-07 — Tolerance bands. CONFIRMED by research, no longer provisional.** Calories ±20%,
  each macro ±30%, all four must pass for an item to pass a draw. Evidence: the FDA's own
  nutrition-labelling compliance limit is **20%** (21 CFR 101.9(g)(5)); restaurants' own stated
  calories run **~18% high at the mean** with far larger per-item variance (Urban et al., *JAMA*
  2011, n=269; *J Am Diet Assoc* 2010, n=29). **Do not tighten these** — below them we would be
  grading noise that exceeds restaurants' own declared accuracy. The ±30% macro band is
  correctly looser because fat is the most preparation-sensitive field.
- **2026-08-07 — The oracle must use database lookups, not unaided judgment.** In NutriBench's
  own human study, unaided nutritionists scored **42.45%** Acc@7.5 — *below* GPT-4o CoT's
  60.56% on the same queries — while the best nutritionist **with database access reached
  59.72%**. An unaided human oracle would therefore be a weaker measuring stick than the thing
  it is measuring. Santiago's manual numbers must come from looking ingredients up (USDA
  FoodData Central or equivalent), and the `assumed` line should say which source was used.
- **2026-08-07 — Benchmark evidence set.** Oracle JSON, runner, this log, request/response
  archives, an execution-evidence manifest, and three local raw draw archives. The baseline
  evidence limitation above still applies.
- **2026-08-07 — Three starting items,** across three menus and three macro archetypes:
  `CESAR (200 g)` (andaluz), `Salmone toscano` (casa-nostra), `PASTEL AZTECA (300gr.)`
  (el-marcos). Spread deliberately rather than three from one menu — lesson 19.
- **2026-08-07 — Baseline first, no fixes before a failure list.** The pipeline is measured
  exactly as it ships before any change is designed.
- **2026-08-08 — A runtime database or API is DISPREFERRED, not banned (Santiago). REPLACES the
  2026-08-07 "NO DATABASE OR API IN THE ENRICHMENT PIPELINE" ruling, which is withdrawn.**

  Santiago wants to **avoid** a runtime lookup in Stage 2 and does **not** want it reached for by
  default — but the door is explicitly open, because a lookup could improve accuracy
  substantially and that outcome is worth more than architectural purity.

  **How to treat it in practice:**

  1. **Exhaust the free levers first.** Chain-of-thought, prompt wording, schema and field-order
     design, computing in code what the model gets wrong (see B10), and pipeline structure
     (batch size, staged vs single call, abstain path). These add no call, no key, no latency and
     nothing that can be unavailable at runtime, so they are always the cheaper experiment.
  2. **A lookup arm needs a measured reason, not a hunch.** Propose it against a real failure
     list, with the accuracy gain it is predicted to buy and the cost/latency/availability it
     adds, and get Santiago's explicit approval — the same bar as any paid run.
  3. **The prior against it is evidential, not dogmatic.** RAG over a food-composition database
     did not reliably beat plain CoT and made GPT-4o-mini *worse*; the retrieval DB's 100 g
     metric entries did not map onto natural servings, and the model already holds the knowledge,
     so retrieval added noise (NutriBench §"RAG Does Not Always Improve Performance"). That is a
     reason to expect little from naive RAG **specifically** — it is not evidence against every
     possible lookup design.

  **Three things that were never in scope of the old ban, and remain freely available:**

  1. **Static portion anchors written into the prompt text** (e.g. FDA RACC category amounts,
     FNDDS portion weights as literal reference values). This is prompting, not a lookup.
  2. **USDA FoodData Central for the ORACLE.** Santiago's measuring instrument for building
     ground truth by hand. Never called by the app, never ships. Do not confuse "we use USDA"
     with "the app uses USDA".
  3. **Arithmetic in code over model-supplied numbers** (B10). No external data is fetched; the
     model still supplies every nutrition value. The old ruling was repeatedly misread as
     forbidding this — it never did, and the question is now moot.

  **Newly unblocked by this change:** a licensed chain-menu lookup layer (Nutritionix /
  MenuStat) matching *known chain restaurant items* to their published nutrition, with the LLM
  as fallback for independents. That is matching, not inferring — a different problem from
  estimation. Still **not scheduled and not part of this phase**, but no longer ruled out.

- **2026-08-08 — PASTEL AZTECA's beans are TOLERATED either way (Santiago).** Whether the
  printed `300gr.` includes the `servido con frijoles` beans or not is **not important enough to
  fail an item on**. Either result is acceptable to show a diner.

  **How to score it:** a PASTEL field counts as failed **only if it misses under BOTH readings**
  — beans outside (the shipped oracle, 380 g total) and beans inside (300 g total,
  452 kcal / 39.2 P / 31.4 C / 19.9 F). Do **not** change the shipped oracle; it stays as the one
  consistent rule. This is a *reading tolerance*, the same pattern as the extraction ledger's
  tolerated classes: record the difference, do not block on it.

  **What this immediately settled (all $0, from archived responses):** PASTEL's **fat** failure in
  iter-b10-001 was **pure scope** — −44% beans-outside but −24% beans-inside, which passes. Its
  **carb** failure survives both readings (+41% outside, +59% inside) and is therefore **real
  model error**. This is the cleanest possible confirmation that B11 is the right target.

  **Failed field/draws under this tolerance:** baseline-002r **6**, iter-b1-001 **13**,
  iter-b10-001 **7**. Quote these numbers going forward, alongside the strict ones.

- **2026-08-08 — Printed-weight scope (Santiago). SUPERSEDES the per-dish treatment below.**
  The printed weight covers the **plated dish**; an ingredient the menu marks as an
  **accompaniment** sits **outside** it but is still eaten and still counted; inside the printed
  weight the **principal protein takes a main-course share**. Applied to all three dishes without
  exception — see baseline-002r. This ruling settles the oracle only. **It is deliberately NOT
  being encoded into `ENRICH_PROMPT`:** a shipped rule matching accompaniment wording
  (`acompañado con` / `servido con`) would be a text-pattern rule that must hold across every
  language and menu layout worldwide, which is exactly the fragility Santiago's
  no-menu-specific-hardcoding rule exists to prevent. Scope adjudication stays in the oracle,
  where a human decides it. **This is why B3 was dropped as the next iteration** — the general
  fix is to make the model *state its portions* (B1), not to teach it a wording convention.
- **2026-08-07 — USDA oracle ingredient convention (Santiago).** Ingredient basis is raw,
  cooked, or prepared; use prepared for ready-to-eat dressing, cheese, bread, and canned foods.
  Prefer Foundation/FNDDS generic records, but use USDA SR Legacy only when neither represents
  the printed ingredient's stated form. For Salmone Toscano, printed 200g is the cooked salmon
  portion; estimate its sauce and baguette separately. For Pastel Azteca, include only
  ingredients printed on the menu: do not infer tortilla, oil, or cream.

### oracle-fries-scope-001 — French Fries correction and scope evidence (2026-08-09, $0)

**No model calls.** Re-scored the archived four-run arms through the shared
`macro-measure.ts` path. The frozen oracle changed only its French Fries entry; the separate
`macro-oracle-scope-candidate.json` is not frozen and changes only the three scope cases below.

**French Fries.** Polloteria's photo still binds the basis: the 300g is pre-cook. What changed is
the product assumption, which the menu does not state: 300g frozen par-fried fries, not 300g raw
whole potato. The composite is 300g raw-potato equivalent plus 40.333g oil (21g finishing uptake
from U.S. Patent 8,133,520's ~7% frozen-fries result; 19.333g already absorbed during par-frying),
finishing at 264g under U.S. Patent 3,968,265's 88% example. That is inside Santiago's 250–270g
constraint; the latter source's conventional 65–75% alternative is explicitly outside it and was
not substituted. The selected 225 kcal/100g finished density is FDC 2709463's frozen-fried entry,
not the richer restaurant or fast-food entries.

| Fries answer key | total | baseline failed/48, mean \|error\| | B4 failed/48, mean \|error\| | GPT-5.5 failed/48, mean \|error\| |
|---|---:|---:|---:|---:|
| pre-`e39000f` restaurant whole portion | 867 kcal, 300g | 48/48, 46.8–47.3% | 0/48, 6.1% | 0/48, 5.1–7.3% |
| rejected raw-whole-potato composite | 409.2 kcal, 165g | 1/48, 15.9–16.9% | 48/48, 109.6% | 48/48, 103.5–111.8% |
| corrected frozen-par-fried composite | 594 kcal, 264g | 23/48, 23.9–24.3% | 36/48, 64.3% | 36/48, 58.5–65.7% |

The raw archives did not change. These are answer-key movements, not a B4 regression or a reason
to roll back v28: the arms land on different sides of the revised Fries definition.

**Scope candidate.** Basis labels are unchanged. The candidate reads 180g as gnocchi (250g eaten),
200g as salmon (305g eaten), and El Marcos's explicit “El gramaje se refiere a los ingredientes
principales” as 135g chicken (245g eaten). It is evidence for Santiago's ruling, not a replacement
oracle, production change, prompt/schema change, or model-quality verdict.

| arm | frozen oracle: failed/96, mean \|error\| | candidate: failed/96, mean \|error\| | baseline→B4 failed-field gap |
|---|---:|---:|---:|
| baseline | 32–33, 34.6% | 32–33, 24.9% | — |
| B4 / GPT-4o | 33–36, 28.7–29.0% | 35–37, 27.9–28.5% | frozen: +0–3; candidate: +3–5 |
| GPT-5.5 | 23–28, 22.6–24.2% | 36–39, 25.6–27.2% | — |

The candidate makes baseline and B4 more distinguishable: B4's failure gap rises from 0–3 to 3–5
per run. It does **not** show that baseline is a better pipeline; it shows B4's current
whole-dish fitting cannot agree with a component-scope answer key. That matches the photo evidence
and is the stronger scope instrument, subject to Santiago's ruling.

| dish | baseline frozen → candidate failed/48 | B4 frozen → candidate failed/48 | GPT-5.5 frozen → candidate failed/48 |
|---|---:|---:|---:|
| CESAR | 0 → 0 | 0 → 0 | 0 → 0 |
| Salmone toscano | 0 → 36 | 0 → 34 | 12 → 48 |
| PASTEL AZTECA | 0 → 0 | 9 → 9 | 1 → 1 |
| NEW YORK | 24 → 24 | 0 → 0 | 0 → 0 |
| French Fries | 23 → 23 | 36 → 36 | 36 → 36 |
| Gnocchi alla sorrentina | 48 → 36 | 44 → 18 | 27 → 12 |
| ENFRIJOLADAS | 36 → 12 | 28 → 26 | 14 → 38 |
| Coleslaw | 0 → 0 | 22 → 22 | 12 → 12 |

**Ruling needed:** adopt the candidate's component scope, retain the frozen whole-plate scope, or
choose another stated convention. No oracle scope change has been made pending that decision.

**Stale-reference flag:** `docs/superpowers/START-HERE.md` lines 41, 59–61, 75, 150 and 170–171
still present the retired 24–27/96 / 21.0–21.2% snapshot as current. They predate this oracle
correction; the roadmap's CURRENT PHASE block is the sole current-status source and now supersedes
them. The older numeric tables elsewhere in this log and roadmap are retained as dated historical
snapshots, not current scores.

### 🔁 REVERTED — both French Fries re-freezes, and why (2026-08-09, $0)

**Santiago's ruling (2026-08-09):** *"Don't change the already researched dishes and their FDC/USDA
results. Let's go only with internal stuff to change."* Both same-day French Fries re-freezes changed
a researched dish's USDA composition, so both are reverted. The entry is back to its researched
state: **300 g of FDC 2709462 (Potato, french fries, restaurant), 867 kcal**, one ingredient,
internally consistent.

| version | totals | status |
|---|---|---|
| researched (FDC 2709462, 300 g) | 867.0 / 10.5 / 111.6 / 42.0 | ✅ **restored, current** |
| raw-potato re-freeze (`e39000f`) | 409.2 / 6.2 / 52.5 / 20.1 | ❌ reverted |
| frozen-par-fried re-freeze | 594.0 / 6.2 / 52.5 / 40.6 | ❌ reverted |

The raw-potato version was also **internally inconsistent**: its ingredients summed to 340 g while
the finished portion was 264 g and the menu prints 300 g — three different masses in one entry, which
would mislead any portion-level check.

⚠️ **While those were in place the docs recorded "B4 scores worse than the baseline."** That was
**one dish**. Per-dish decomposition: B4 moved +12 failed per run and French Fries alone is 48 fields
÷ 4 runs = 12 per run. The baseline improved by the same amount on the same dish, because the baseline
IGNORES printed weights while B4 READS them — so an oracle saying "the printed 300 g is not food"
rewards the pipeline that ignores it. **An instruction mismatch, never an app regression.**

**The finding survives the revert, and it is a PIPELINE gap:** Polloteria prints *"El peso del
producto es antes de cocinarlo"*. A printed weight is sometimes a PRE-COOK weight and Stage 2 has no
concept of weighing basis. Recorded here, not patched into the oracle.

### ❌ SCOPE candidate oracle DELETED — its evidence, kept (2026-08-09, $0)

`macro-oracle-scope-candidate.json` was removed. It encoded portion changes to researched dishes
(outside the ruling above), one of its three entries was built wrong, and `bench-macros_test.ts` had
been made to REQUIRE it — a scratch artifact became a build dependency. Its measurement is preserved
here so it never needs re-running.

**The wrong entry:** ENFRIJOLADAS assigned all 135 g to chicken *while keeping* the 72 g of tortillas,
so its "principal ingredients" summed to 207 g — more than the printed weight — and contradicted the
plural citation (*"los ingredientes principales"*) that motivated it. 135 g of chicken in three
breakfast tortillas is not plausible; every model says ~33–37 g.

**What it measured (B4/GPT-4o, per dish, frozen → component-scope):**

| dish | frozen | candidate | |
|---|---:|---:|---|
| **Gnocchi** | 44/48, 47.7% | **18/48, 27.6%** | ✅ −26 |
| **Salmone** | 0/48, 13.7% | **34/48, 29.7%** | ❌ +34 |
| ENFRIJOLADAS | 28/48, 30.9% | 26/48, 29.9% | −2 |
| CESAR, PASTEL, NEW YORK, Fries, Coleslaw | — | unchanged | — |

🔑 **The scope question is therefore ONE DISH: Salmone.** Everything else improves or does not move,
and the component reading is a large win on Gnocchi — the dish it was designed for, the worst in the
set, and the one with independent support (all three arms overshoot it in the same direction; Casa
Nostra prints 180 g on five different pastas).

⚠️ **A discrimination test cannot settle scope, and the earlier claim that it could was wrong.** Both
hypotheses predict the same result: if the component reading is wrong all arms look worse, and if it
is RIGHT all arms still look worse, because none of them knows a printed weight may name one
component. The three pipelines share the blind spot. Adjudicate Salmone from the photo and USDA
portion data — the way Coleslaw was settled — not from the score.

### ⚖️ SCORING RULE — a gram field now passes on a small ABSOLUTE miss (Santiago, 2026-08-09)

> *"If something has 20 grams and the model says 15, maybe it takes it as super wrong when in fact
> it's only five grams — so it's not that different."*

`protein_g` / `carb_g` / `fat_g` now pass when **either** the value is within ±30% **or** the
absolute miss is **≤ 5 g**. This is a SEPARATE rule from the pre-existing sub-3 g floor, which keys
off a small ORACLE value; this one keys off a small DIFFERENCE. **Calories are deliberately
excluded** — the smallest calorie figure in the set is Coleslaw's 163, so the noise problem that
motivates the rule cannot arise there, and a kcal allowance would only hide real misses.

**Mean |error| is unchanged.** A field forgiven by the gram allowance is NOT flagged `absolute`, so it
still carries its real percentage into the error metric. Only the pass/fail count moves — which keeps
every error figure ever recorded comparable.

**The guard that matters — discrimination did not collapse, it WIDENED:**

| arm | before | after | mean \|error\| |
|---|---:|---:|---:|
| baseline (naive) | 39/96 | **39/96 — unmoved** | 37.7% unchanged |
| B4 / GPT-4o (deployed) | 24–27/96 | **19–21/96** | 21.0–21.2% unchanged |
| GPT-5.5 | 14–19/96 | **8–12/96** | 15.5–17.2% unchanged |

The baseline does not move at all — its misses are genuinely large — while the better the pipeline,
the more it benefits. The baseline→B4 gap went from 12–15 to **18–20**. ✅ **Any future tolerance
change must be validated the same way: re-score all three arms and confirm the gap does not shrink.**
A loosening that makes everything pass has blinded the benchmark, which is what the 3-dish saturation
already cost this project once.

### iter-b15-w1…w4 — B15, name-implied components (2026-08-09, ~$0.40, 4 runs × 3 draws)

**✅ B15 BEATS B4 ON BOTH METRICS AND REPRODUCED.** New checkpoint `macro-best-v2`.

| arm | failed field/draws | mean \|error\| |
|---|---|---:|
| baseline (pre-B1) | 39/96, all four runs | 37.7% |
| B4 / gpt-4o | 19–21/96 | 21.0–21.2% |
| **B15 / gpt-4o** | **17–19/96** | **18.2–19.0%** |

Mean-error ranges do **not overlap**. ✅ **Discrimination widened**, so the metric did not go soft:
baseline→B4 was 18–20, baseline→B15 is **20–22**.

**The falsifier was stated before the run and it was answered.** PASTEL AZTECA, whose carbs ran −50%
against the oracle, went **9/48 at 23.1% → 0/48 at 10.3%**.

**The mechanism is precise — it does not over-trigger.** This was the real generalisation risk: a
model that invents a structural component for dishes that are already fully described would inflate
menus worldwide. It does not.

| dish | `name_implied_components` | result |
|---|---|---|
| PASTEL AZTECA | `["tortilla"]` | tortilla listed at **70 g** against the oracle's 75 g |
| CESAR | `[]` | correctly silent — a Caesar's description already names its croutons |

**Per dish, B4 → B15:**

| dish | B4 | B15 | |
|---|---|---|---|
| PASTEL AZTECA | 9/48, 23.1% | **0/48, 10.3%** | ✅ the target |
| Gnocchi | 32/48, 47.7% | 24/48, 44.3% | ✅ |
| ENFRIJOLADAS | 18/48, 30.9% | 16/48, 25.3% | ✅ |
| Salmone | 0/48, 13.7% | 0/48, **8.8%** | ✅ error halved |
| NEW YORK | 0/48, 4.8% | 0/48, 6.3% | — |
| French Fries | 0/48, 6.1% | 0/48, 6.4% | — |
| Coleslaw | 22/48, 24.9% | 23/48, 27.8% | — |
| **CESAR** | **0/48, 14.5%** | **11/48, 19.0%** | ❌ **regressed** |

🔍 **CESAR's regression is NOT caused by an added component** — its implied list is empty in every
draw. The cause is a **fit-scale shift**, verified from the archives:

| run | servings sum | printed | scale |
|---|---:|---:|---:|
| iter-b4-w1 d0 | 230 g | 200 g | **0.870** |
| iter-b15-w1 d0 | 200 g | 200 g | **1.000** |

Asked to name what the dish's form entails, the model also **portions more tightly** — its servings
now sum to the printed weight instead of overshooting it (chicken 100 g → 80 g). With the scale at
1.00 instead of 0.87, every non-chicken ingredient is effectively ~15% heavier than under B4, which
pushes CESAR's fat and carbohydrate up. **A side-effect on the FITTING step of a change aimed at the
LISTING step**, and worth carrying into the next brainstorm: prompting that touches ingredient
enumeration also moves portioning.

Net it is strongly positive — one dish regressed, four improved, and both headline metrics moved the
right way — but the CESAR case is a live target and a reminder that these two steps are coupled.

### iter-b16 — coating-as-a-share-of-the-dish. FALSIFIED (2026-08-09, ~$0.20, 2 probe runs)

**Reverted to `macro-best-v2` (B15). The code is gone; the finding is the point.**

**The hypothesis.** Verified from the B15 archives rather than inherited from these docs: Coleslaw's
whole error is 10 g misallocated inside a fixed mass. Model and oracle both sum to exactly 150 g,
but the model gives carrot 30 / dressing 20 where the oracle gives carrot 20 / dressing 30. At
40 g fat/100 g against 0.2, that swing is ~36 kcal of the 41 kcal gap. CESAR carries the identical
defect (dressing 20 g vs 30 g), so one mechanism would have covered 34 of the ~72 open failures.

**Prior art said the oracle was right.** Classic creamy slaw runs 5–5.5 tbsp dressing per pound of
cabbage (~18%, which backs the MODEL); extra-creamy runs 7–8 tbsp (~25%, which backs the oracle).
The tiebreak is finished density: real coleslaw clusters at 107–124 kcal/100 g, the oracle sits at
108, the model's answer at 81 — below every real coleslaw in FDC.

**The mechanism was B12's move applied to portioning:** a coating has no serving size independent of
what it coats, so asking for grams gets a spoonful. Ask instead for `share_of_dish_pct` and compute
the grams from the printed weight in code.

🔴 **It fired, and it changed nothing — because the ratio is not independent knowledge.** The model
back-computed each share from the gram figure it already held:

| ingredient | share returned | × printed weight | its own serving |
|---|---:|---:|---:|
| CESAR dressing | 10% | 20 g | 20 g |
| Coleslaw dressing | 13.3% | 20 g | 20 g |
| Salmone cream | 15% | 30 g | 30 g |

Every one reproduces the original answer exactly. Scores confirm it: probe **20/96 at 18.1%**
against B15's **17–19/96 at 18.2–19.0%** — outside B15's count range on the wrong side.

🔑 **The prior this leaves, and it sharpens B10/B12/B4 rather than contradicting them.** "Take the
arithmetic away and leave the model knowledge" only pays when the thing asked for is knowledge the
model holds INDEPENDENTLY of the quantity being replaced. B12 worked because composition per 100 g
is a property of the food, held separately from any portion. A coating's *ratio* is not a separate
fact — it is the gram guess divided by the dish weight, so asking for it re-asks the same question in
new units. **Before the next reformulation, ask: could the model derive this answer FROM the number I
am trying to replace? If yes, expect no movement.**

⚠️ **A second, cheaper lesson: the first B16 run measured nothing.** The prompt said *"Give
share_of_dish_pct instead … with typical_serving_g still filled in"*, which is self-contradictory,
and the model returned null on every ingredient including a dish literally named Coleslaw. That run
(18/96 at 19.4%) is not evidence about the hypothesis — only about the wording. **Probe ONE run and
confirm the field is populated before buying a four-run arm.** It cost $0.10 to learn instead of
$0.40.

### ⚖️ RULING — the printed weight is the ENTIRE PLATE. Scope is CLOSED (Santiago, 2026-08-09)

> *"The Casa Nostra 200g of salmon is the entire plate."*

**The whole-plate reading stands, and the frozen oracle already encodes it** — Salmone's printed 200 g
is the plated dish (salmon 140 g + 60 g sauce and vegetables), with the baguette outside it as a
named accompaniment. **No oracle change follows from this ruling.** Casa Nostra's Gnocchi is the same
menu and takes the same reading: its printed 180 g is the whole plate.

**What this CLOSES:**
- The component-scope candidate oracle. Already deleted; do not rebuild it.
- The `weight_scope` pipeline idea. Teaching the model that a printed weight may name one component
  would now move it AWAY from the oracle. Dead, not deferred.

**What this OPENS, and it is the more valuable half:** Gnocchi's error is **confirmed model error**,
not an oracle artifact. It is the worst dish in the set (24/48 at 44.3% under B15) and it was
unattackable while its oracle was in question. It is now a legitimate target.

⚠️ **The accompaniment rule is unaffected** — an ingredient the menu marks as served alongside still
sits outside the printed weight and is still eaten and counted. That is what `within_printed_weight`
already does, and it is not what this ruling was about.

**Still open and separate: weight BASIS** (Polloteria's *"el peso del producto es antes de
cocinarlo"*). Scope and basis are different axes; closing one does not close the other.

### iter-b17 — state-as-served before composition. FALSIFIED (2026-08-09, ~$0.10, 1 probe run)

**Reverted to `macro-best-v2`.** Probe **20/96 at 20.3%** against B15's 17–19/96 at 18.2–19.0% —
worse on both. The one-run probe cost $0.10 instead of an arm's $0.40, per B16's procedure lesson.

**The hypothesis.** B13 measured that TELLING the model its plain reference figure is wrong moves
nothing. The re-diagnosis: it is not confused about nutrition, it is answering about a **different
product**. So make it commit to the product first — name `state_as_served` before giving composition.
It passed the B16 test (preparation state is not derivable from the composition numbers it replaces).

**The field worked perfectly. The numbers did not move.**

| ingredient | state returned | carb/100 g | fat/100 g |
|---|---|---:|---:|
| Gnocchi | **"boiled"** | **30** (was 30) | **0.5** (was 1) |
| Papas a la francesa | "fried" | 41 | 15 |
| Aderezo cremoso | "dressed" | 5 | 40 |

The states are all correct. Gnocchi named itself boiled and still reported the packaged figure, and
its fat moved the *wrong* way.

🔑 **The prior, and it reframes what is left.** The model is not making a preparation-state error, and
it cannot be prompted out of a number it believes. **It thinks boiled gnocchi is 30 g carb/100 g.**
Three separate attempts have now failed to move an ingredient's composition — B13 (tell it the
reference is wrong), B17 (make it name the state first) — while the two composition successes (B12,
B15) both *added* a question rather than trying to correct an answer. **Prompting can make the model
answer a question it was not asked; it cannot make it give a different answer to one it was.**

⚠️ **This surfaced a possible ORACLE problem and it is Santiago's call — see the open question below.**
FDC 2708722 "Gnocchi, potato" (FNDDS, verified live) is **2.44 P / 17.2 C / 6.33 F, 135 kcal per
100 g**. That is an as-consumed entry carrying cooking fat. Fresh gnocchi is sold at roughly 30 g
carb/100 g and, unlike dry pasta, is already hydrated, so boiling adds little water. **The model's
30 C / 1 F may be the better description of the gnocchi component itself**, with the oracle's entry
diluted by fat the recipe already counts separately in its mozzarella and parmesan. Same shape as the
Caesar dressing episode, where the oracle was found stricter than reality. **Nothing changed.**

### ⚖️ ORACLE CORRECTED — Gnocchi's dumplings, and the rule behind it (Santiago, 2026-08-09, $0)

> *"For these type of plates, go with how it's usually done… nudge towards the average usual way these
> plates are served, and not overestimating ingredients… if it is, I would assume the description
> mentions it."*

**THE RULE, and it outlives this dish.** Model a plate the way it is **usually served**, not at a rich
extreme. An unusual amount of anything is the menu's job to declare — if a dish really is heavy on an
ingredient, the description says so. This extends the standing "prefer the median of real products"
rule from *which entry* to *which preparation*, and it is the same instinct that produced the Caesar
dressing correction.

**What changed — one ingredient on one dish.** Gnocchi alla sorrentina's dumplings:

| | entry | kcal | P | C | F |
|---|---|---:|---:|---:|---:|
| was | FDC 2708722 `Gnocchi, potato` (FNDDS) | 135 | 2.44 | 17.2 | **6.33** |
| now | FDC 2632546 `GNOCCHI OF POTATO` (Colavita) | 158 | 4.8 | 33.6 | **0.24** |

**Why the old entry was wrong for this dish.** It is simultaneously *lower* in calories than every real
packaged gnocchi surveyed live (133 / 142 / 150 / 158 / 169 / 211) and *far* fattier — the signature of
boiled-then-tossed-in-butter, where water dilutes the calories while added fat raises the fat. It made
the dumplings supply **7.0 g of the dish's 13.1 g of fat (53%)** — more than the mozzarella and
parmesan combined — for a dish whose visible fat IS the cheese, which the recipe already counts
separately. The new entry is the **median** of the real cluster: not the richest (211), not the
leanest (133).

⚠️ **Not fitted to the model.** The entry was chosen on USDA grounds before looking at what any arm
returned — the circularity the PASTEL note warns about.

**Dish totals: 242.0 → 267.3 kcal, 9.31 → 11.90 P, 22.33 → 40.37 C, 13.10 → 6.40 F.**

**Result — Gnocchi goes from the worst dish in the set to a clean pass:**

| dish | before | after |
|---|---|---|
| Gnocchi alla sorrentina | 24/48, 44.3% | **0/48, 13.7%** |

**Every arm re-scored ($0, archived draws). The oracle moved, so ALL arms moved with it:**

| arm | old oracle | corrected oracle |
|---|---|---|
| baseline (naive) | 39/96, 37.7% | 33/96, 37.8% |
| B4 / gpt-4o | 19–21/96, 21.0–21.2% | 12–13/96, 16.8–17.3% |
| **B15 / gpt-4o (best)** | 17–19/96, 18.2–19.0% | **11–13/96, 14.1–14.9%** |
| GPT-5.5 (on the B4 prompt) | 14–19/96, 15.5–17.2% | 5–9/96, 13.1–15.6% |

✅ **Discrimination guard PASSED and this is the evidence the new stick is sound:** the baseline→best
gap was 20–22 and is **still 20–22**. A correction that made everything pass equally would have
collapsed it.

🔴 **This is a MEASUREMENT correction, not a pipeline improvement. Nothing about the app changed** —
B15 is byte-identical before and after. Mean |error| figures from before this entry swap are **not**
comparable with those after it; failed counts are not either. The same trap the French Fries
re-freezes set, flagged here so nobody reads 18.2% → 14.1% as the model getting better.

### iter-b18 — dish-level energy-density recall. FALSIFIED (2026-08-09, ~$0.10, 1 probe run)

**Reverted to `macro-best-v3`.** Probe **14/96 at 17.3%** against B15's 11–13/96 at 14.1–14.9%.

**The hypothesis, straight off the B13/B17 prior.** Three attempts to correct an ingredient number the
model already believes have failed, while both composition successes ADDED a question. So ask one
never asked: for the KIND of dish this is, what does 100 g of it usually carry? Asked BEFORE the
ingredient list on purpose, so the answer is independent recall and not a restatement of a sum — the
mistake that made B16 useless. Coleslaw motivated it: the model's ingredients sum to 81 kcal/100 g
where every real coleslaw in FDC is 107–124.

🔴 **The model's dish-level recall is WORSE than its own ingredient sum — on 6 of 8 dishes.**

| dish | recall | oracle | ingredient sum | closer |
|---|---:|---:|---:|---|
| CESAR | 180 | 205 | 209 | sum |
| Salmone | 250 | 248 | 232 | **recall** |
| PASTEL | 200 | 164 | 138 | sum |
| NEW YORK | 250 | 292 | 306 | sum |
| French Fries | 312 | 289 | 310 | sum |
| Gnocchi | 200 | 148 | 158 | sum |
| ENFRIJOLADAS | 180 | 188 | 224 | **recall** |
| Coleslaw | 150 | 108 | 81 | sum |

On Coleslaw — the dish that motivated the idea — recall overshoots by **+39%** where the sum
undershoots by −25%. It did not merely fail to help; it was worse in both directions.

🔑 **Look at the recall numbers: 180, 250, 200, 250, 200, 180, 150.** Almost every one is a multiple
of 50. That is the exact signature baseline-002 showed — *"every macro a multiple of 5 and every
calorie a multiple of 50, the signature of a guess made straight at the macro level rather than a sum
over portions"* — and it is precisely why this pipeline was moved to per-ingredient composition in the
first place.

**The prior: asking the model for a dish-level TOTAL re-creates the failure the architecture was built
to escape**, whatever the units and however the question is framed. B10 took the addition away, B12
the multiplication, B4 the fitting; B18 tried to hand one back and got a round number. This is fresh
evidence FOR the build-from-ingredients design, which is worth more than the dish it failed to fix.

### 🔍 $0 FINDING — B4's fitting mechanism has gone DORMANT (2026-08-09)

Audited across every archived draw. The ratio of the model's own inside-the-printed-weight servings
to the printed weight itself:

| dish | B4 | B15 |
|---|---:|---:|
| CESAR | 1.15 | 1.01 |
| Salmone | 1.19 | 1.09 |
| PASTEL | 0.94 | 1.01 |
| NEW YORK | 1.00 | 0.91 |
| French Fries | 1.02 | 1.02 |
| Gnocchi | 1.10 | 1.00 |
| ENFRIJOLADAS | 1.02 | 1.00 |
| Coleslaw | 1.00 | 1.00 |
| **mean** | **1.05** | **1.01** |

**1.00 means the model fitted its own servings to the printed weight, so `resolveGrams` does nothing.**
B4 exists to take exactly that constrained arithmetic away, on measured grounds: when the model had to
make grams sum to a target it solved the problem by rounding, and CESAR's displacement sat at 20.0% in
all fifteen draws without ever moving. **The remaining errors carry that same signature** — the model
says 20 g of dressing on a 150 g slaw and on a 200 g salad alike, a portion frozen against dish size.

It also explains **why B16 failed**: when the model has already fitted, forcing one ingredient's grams
in code only makes the others absorb the difference.

### iter-b19 — invert the field order to break self-fitting. FALSIFIED (2026-08-09, ~$0.10, 1 probe)

**Reverted to `macro-best-v3`.** Probe **13/96 at 15.0%** against B15's 11–13/96 at 14.1–14.9% — the
top of the range on count, just outside it on error.

**The hypothesis:** the model self-fits because B4 has it state `printed_total_g` BEFORE portioning.
Move it after the ingredients and it cannot fit to a number it has not written yet.

**Result: the ordering is not the cause.** Mean servings/printed went 1.00 → **1.01**, and all three
dishes that still fail — Coleslaw, CESAR, ENFRIJOLADAS — stayed at exactly **1.00**. Two dishes did
loosen (PASTEL 1.00 → 0.92, Gnocchi 1.00 → 1.07), so the inversion had *some* effect, just not where
it was needed.

✅ **One thing worth keeping from this run: scope tagging did NOT regress.** B4's rationale for
weight-first was that the model should settle scope before sizing, and the fear was that inverting
would break it. It did not — baguette, frijoles and chimichurri were all still tagged outside the
printed weight. **So B4's ordering rationale is weaker than assumed**, and a future change may reorder
these fields without paying that tax.

🔑 **The prior: self-fitting is a behaviour, not an artefact of field order.** The model makes its
ingredient servings sum to the dish weight because that is what it believes a dish IS, and it will do
so wherever the number appears in the schema. Anything that hopes to free the portions has to remove
the model's ability to know the target at that moment — not merely reorder when it is asked.

### 🔴 HARNESS DEFECT — `bench-macros.ts` does NOT run the deployed path (2026-08-09)

**Every macro number this project has ever published came from a request the harness built itself.**
`bench-macros.ts`'s `enrich()` calls `fetch` directly with its own body. It does not call
`enrichBatch` / `callGptEnrich`. It shares `ENRICH_PROMPT` and `ENRICH_SCHEMA_OPENAI`, which is why
prompt and schema experiments have measured correctly — but **anything enrichBatch does around the
request is invisible to the benchmark.**

⚠️ **This is the `temperature: 0` incident repeating.** That one was recorded as: *"a benchmark that
reaches the model by its OWN path is not evidence that the DEPLOYED path works."* `a9fce10` moved
`callGptEnrich` into `enrich.ts` so a harness could exercise the real batching — and fixed
`bench-pipeline.ts`, while **`bench-macros.ts` kept its private copy.** The divergence the lesson was
written about was only half closed.

**How it surfaced, and what it cost:** B20 moved gram-parsing and payload-stripping INTO
`enrichBatch`. The probe returned 26/96 at 25.3% — apparently a catastrophic regression. It was not:
the harness sent the old payload (gram tokens still in the names) against the new schema (no
`printed_total_g` asked, and none supplied by the harness), so the run measured a hybrid that exists
nowhere. **Cost: $0.10 and one wasted iteration.** The archived item's `name` field gave it away —
`"CESAR (200 g)"`, still carrying the token B20 strips.

**Rule going forward: a change that lives in `enrichBatch` CANNOT be measured until this is fixed.**
Prompt- and schema-only changes remain valid, which covers B1–B19.

### B20 — parse the printed weight in code, hide it from the model. DESIGNED, NOT MEASURED

Reverted to `macro-best-v3` because the harness cannot test it. **The design is sound and should be
re-applied once `bench-macros.ts` calls the real path.**

**Why:** the model fits its own servings to the printed weight whenever it can see one
(servings/printed ≈ 1.00), which makes `resolveGrams` a no-op and restores the constrained arithmetic
B4 removed. B19 proved reordering the field does not help, because the weight sits in the description
the model reads. So the target must be removed, not moved.

✅ **The key enabling fact, verified at $0:** `parseItemGrams` — which already exists in the
extraction stage — reads **8 of 8** fixture formats correctly, including the exact three B4 cited as
the reason for asking the model instead (`200 g`, `200g`, `300gr.`). **We are paying the model to
answer a question our own code already answers, and handing it the target it then fits to.**

**The shape:** `enrichBatch` parses the weight with `parseItemGrams`, strips the token with a new
`stripGramsTokens` (sharing the same regex, so what is hidden is exactly what is recovered), sends the
blinded items, then restores name, description and `printed_total_g` from its own parse. One call, no
extra cost, and `resolveGrams` does the fitting it was built for.

### ✅ HARNESS FIXED — `bench-macros.ts` now calls the deployed path (2026-08-09, ~$0.10)

`enrich()` no longer builds its own OpenAI request. It calls `enrichBatch` — the function production
calls — and archives the exact response bytes through a new optional `onRaw` hook, so the evidence
trail is unchanged while the request finally comes from one place.

**Behaviour-preserving, verified rather than assumed:** a probe through the fixed harness scored
**12/96 at 14.4%**, inside B15's 11–13/96 at 14.1–14.9%. **No historical figure is invalidated** —
B1–B19 were prompt and schema changes, and both copies always imported `ENRICH_PROMPT` and
`ENRICH_SCHEMA_OPENAI`.

**It also deletes a second copy of the sampling rule.** The harness had its own
`BENCH_MODEL ? {} : { temperature: 0 }`; `enrichBatch` already had `samplingFor(model)` expressing
the same rule. One of those was going to drift — that is exactly how the `temperature: 0` incident
happened.

🔒 **Guarded so it cannot come back.** `bench-macros_test.ts` fails the build if `api.openai.com`
appears in `bench-macros.ts`, or if `enrichBatch` stops appearing in it. Documentation alone was
already tried — `a9fce10` recorded the lesson and still left this file diverged for four paid arms.
Recorded as **lesson 30** in the roadmap.

**What this unblocks:** B20 (parse the printed weight in code, hide it from the model) is now
measurable and is the next thing to run.

### iter-b20b — blind the model to the printed weight. FALSIFIED, and it kills the self-fitting thread (2026-08-09, ~$0.10)

**Reverted to `macro-best-v3`.** Probe **16/96 at 18.8%** against B15's 11–13/96 at 14.1–14.9%.
ENFRIJOLADAS carried most of it (7/12 at 44.8%, from 4/12 at 25.3%).

**The mechanism DID work — partially.** With the printed weight parsed in code and stripped from what
the model sees, servings stopped matching the target on several dishes:

| dish | B15 servings/printed | B20 blinded |
|---|---:|---:|
| Gnocchi | 1.00 | **1.17** |
| Salmone | 1.09 | **1.20** |
| NEW YORK | 0.88 | 0.83 |
| French Fries | 1.02 | 1.02 |
| **CESAR** | **1.00** | **1.00** |
| **Coleslaw** | **1.00** | **1.00** |
| mean | 1.00 | 1.03 |

🔑 **CESAR and Coleslaw stayed at exactly 1.00 while BLIND. They cannot be fitting to a number they
never saw.** Their conventional servings genuinely sum to the printed weight by coincidence —
Coleslaw is 50 + 50 + 30 + 20 = 150, which is simply what the model thinks a slaw side contains.

**This falsifies the premise behind B19 and B20 for the dishes that actually fail.** The
servings/printed = 1.00 audit was read as evidence of self-fitting; for these two it is evidence of
nothing. Self-fitting is real on Gnocchi and Salmone — both already score 0/48 — and absent on the two
dishes it was invoked to explain.

**So the remaining Coleslaw and CESAR error is not a fitting artefact and never was.** It is exactly
what it looks like on the surface: the model's conventional serving for a dressing is 20 g, on a 150 g
slaw and a 200 g salad alike, and USDA says 30 g. Three separate mechanisms have now been aimed at
that number through the fitting step (B16 ratio, B19 order, B20 blinding) and none touched it,
because none of them was addressing the actual cause.

⚠️ **Method note — this is the second theory in this phase corrected by its own data.** An aggregate
that looked like a smoking gun (mean 1.01) was driven by dishes that already pass, while the failing
dishes sat at the same value for an unrelated reason. **Check that an aggregate holds on the specific
cases it is being used to explain, before building on it.**

### iter-b21 — ask for the STANDARD REFERENCE AMOUNT, not a by-eye serving. ✅ ADOPTED (2026-08-09, ~$0.40, 4 runs × 3 draws)

**New checkpoint `macro-best-v4`. Santiago approved it 2026-08-09.**

| arm | failed field/draws | mean \|error\| |
|---|---|---:|
| baseline (naive) | 33/96 | 37.8% |
| B15 (`macro-best-v3`) | 11–13/96 | 14.1–14.9% |
| **B21** | **9–11/96** | 15.0–17.1% |

**A split decision, adopted deliberately:** B21 gets ~2 fewer numbers wrong while being 1–2 points
sloppier on average — and the extra sloppiness is **almost entirely one dish**. The baseline→best gap
widened from 20–22 to **22–24**.

**What changed: one question, not one instruction.** Every earlier attempt at the dressing portion
went through the *fitting* step — B16 asked for a ratio, B19 reordered the fields, B20 blinded the
model to the printed weight — and none moved it. B21 changed what the serving field *asks for*:

> from *"what a normal restaurant serving is when it appears in this role… as a sauce or dressing, or
> as a garnish"* — a by-eye judgement of the plate
> to *"the standard reference amount customarily consumed on one eating occasion"* — a recalled fact.

**Prior art, not invention:** [21 CFR 101.12](https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-101/subpart-A/section-101.12)
tabulates Reference Amounts Customarily Consumed for 150 product categories, and every US nutrition
label derives from it. **Salad dressing's RACC is 30 g** — the oracle's figure exactly, and USDA's own
default serving of coleslaw dressing is 31 g.

🔑 **It passed the B16 test, which is why it worked where three others failed.** A coating's *ratio*
is derivable from the gram figure the model already holds, so asking for it re-asks the same
question. A *reference amount* is a published table value held independently of any plate impression.
**Before reformulating, ask whether the model could derive the new answer from the number being
replaced — and prefer a question whose answer lives in a different memory.**

**The falsifier was stated before spending and hit exactly:** dressing moved **20 g → 30 g** on both
CESAR and Coleslaw, after three mechanisms had failed to shift it at all.

**Per dish (of 48):**

| dish | B15 | B21 | |
|---|---|---|---|
| **CESAR** | 11/48, 19.0% | **4/48, 14.7%** | ✅ target fixed |
| **Coleslaw** | 23/48, 27.8% | **11/48, 18.7%** | ✅ target fixed |
| NEW YORK | 0/48, 6.3% | 0/48, **1.7%** | ✅ |
| Gnocchi | 0/48, 13.7% | 0/48, 10.8% | ✅ |
| French Fries | 0/48, 6.4% | 0/48, 6.3% | — |
| PASTEL | 0/48, 10.3% | 0/48, 15.2% | ~ |
| Salmone | 0/48, 8.8% | 3/48, 20.4% | ❌ |
| **ENFRIJOLADAS** | 16/48, 25.3% | **22/48, 35.4%** | ❌ carries the regression |

**Side effect worth recording: self-fitting broke on its own.** Servings stopped summing to the
printed weight (Coleslaw 180 against a printed 150, CESAR 210 against 200), so `resolveGrams` is doing
real work again. B19 and B20 both tried to cause that directly and failed; asking a different question
achieved it as a by-product.

**Open target: ENFRIJOLADAS**, which alone carries the mean-error regression. A reference amount for a
filled-tortilla dish pushes its portions the wrong way.

### ⚖️ TOLERANCE — calories gain a 50 kcal allowance, grams go 5 → 6 (Santiago, 2026-08-09)

> *"For coleslaw, honestly the 40 cal and 5 g carb difference is tolerable. Not that drastic."*

The real misses behind that ruling, read off the B21 archives rather than from memory: Coleslaw's
carbs miss by **exactly 5.3 g** (ten times — 0.3 g above the old 5 g floor) and its calories by
**47.7 kcal**. So the allowances are **6 g** and **50 kcal**. Calories had been excluded when the gram
rule was added, on the reasoning that no dish here has a *small* calorie figure — true, and beside the
point: a fixed small quantity is not worth failing whatever the denominator.

🔴 **THIS RULING REVERSED THE B21 DECISION, and that is the important part.**

| | failed/96 | mean \|error\| |
|---|---|---|
| **under the old tolerance** | | |
| B15 | 11–13 | 14.1–14.9% |
| B21 | **9–11** ✅ | 15.0–17.1% |
| **under this tolerance** | | |
| **B15** | **3–4** ✅ | **14.1–14.9%** ✅ |
| B21 | 4–7 | 15.0–17.1% |

B21 was adopted for getting fewer numbers wrong. The new allowance forgives precisely the small
misses B15 was making, while B21's remaining misses are larger and survive it — so on the headline
count the order flips. **The scoring rule, not the pipeline, decides that comparison.**

✅ **The guard still passes and this is not the metric going soft:** the naive baseline still fails
**30 of 96**, so the baseline→best gap *widened* from 22–24 to **26–27**. Mean |error| is untouched by
tolerance by design — forgiven fields keep their real percentage — so those figures stay comparable
across the whole history.

**Santiago's ruling on the conflict (2026-08-09): KEEP B21.** Per dish it is closer to the truth on
four dishes and worse on one. Coleslaw is the clearest case: under the new tolerance *both* versions
pass it, but B15 passes because the rule forgives a 27.8% error while **B21 actually fixed it to
18.7%**. ENFRIJOLADAS alone carries B21's disadvantage and is the next target.

### 🏁 CHECKPOINT HISTORY — every previous best, and why it was superseded

Each tag is a restorable fallback. **`git show <tag>` prints its measured result.** Do not move or
delete any of them.

| tag | pipeline | measured (at the time it was set) | superseded because |
|---|---|---|---|
| `stage2-b4-checkpoint` (`22a1ac5`) | **B4** | 3-dish era; retired figures | the fixture set widened to 8 (B14) |
| `macro-best-v1` | **B4** | 19–21/96, 21.0–21.2% | B15 beat it on both metrics |
| `macro-best-v2` | **B15** | 17–19/96, 18.2–19.0% | the Gnocchi oracle correction re-based every figure |
| `macro-best-v3` | **B15** + corrected Gnocchi oracle | 11–13/96, 14.1–14.9% | B21 adopted (Santiago, on per-dish accuracy) |
| **`macro-best-v4`** | **B21** | 9–11/96, 15.0–17.1% | **current** |

⚠️ **`macro-best-v3` (B15) remains a strong fallback and under the current tolerance it still scores
BETTER on both headline numbers (3–4/96 at 14.1–14.9%, against B21's 4–7/96 at 15.0–17.1%).** It was
superseded on a deliberate judgement about per-dish accuracy, not on the headline. If a later
iteration goes wrong, v3 is the safe place to fall back to.

⚠️ **Figures are only comparable within an era.** The oracle changed at v3 (Gnocchi) and the scoring
rule changed twice (the 5 g gram allowance, then 6 g + 50 kcal). Always re-score with
`rescore-history.ts` rather than comparing numbers written on different days.

### iter-b22 — multiply a stated unit count in code. FALSIFIED BY CONSTRUCTION (2026-08-09, ~$0.10)

**Reverted to `macro-best-v4`.** Probe **5/96 at 15.1%**, inside B21's 4–7/96 at 15.0–17.1% — no
movement.

**The idea:** ENFRIJOLADAS' menu prints *"Tres tortillas de maíz"*. Menus state counts constantly and
in every language (`3 pzas`, `6 PZ`, `orden de dos`), so asking for the count and the per-unit amount
and multiplying in code is B10/B12/B4's pattern on a new fact.

**The count fired correctly — `unit_count: 3` — and the design still fails, for a reason arithmetic
settles without another run.** The model returned `typical_serving_g: 60`, the total for all three,
so code multiplied to 180 g. Fix the wording so it answers per-unit and it returns 20 g, which code
multiplies to **60 g — exactly what B21 already produced.** ⚠️ **A correctly-implemented B22 is a
no-op.** The model's total for the tortillas is 60 g whichever way it is asked, and the count only
changes how that 60 g is spelled.

**Worth keeping from the accident:** the erroneous double-count pushed tortillas to 83.8 g against the
oracle's 72 g and ENFRIJOLADAS improved from **35.4% → 25.9%**. That is evidence the oracle's
tortilla-heavy split is nearer the truth than the model's default, and that the dish's error is a
SPLIT problem, not a totals problem.

🔴 **What actually fails this dish, and it is an ORACLE question for Santiago.** Under B21 the model
fits reference amounts for the fillings — chicken 50 g, crema 20 g, cotija 10 g — around a 60 g
tortilla serving, sums to 190 g, and scaling to the printed 135 g squeezes the tortillas to 42.6 g
against the oracle's 72 g. The oracle gives chicken **25 g** for three filled tortillas.
**Every arm measured in this phase has run protein 33–48% over that figure**, and the 2026-08-09 USDA
adjudication closed the tortilla question while explicitly leaving the chicken one open: *"USDA cannot
settle it."* Three independent pipelines disagreeing with an oracle in the same direction is the
Gnocchi signature, which turned out to be the oracle. **Nothing changed. Raised for a ruling.**

### ⚖️ ORACLE — ENFRIJOLADAS follows its own menu's printed footer (Santiago, 2026-08-09, $0)

**El Marcos prints its convention and this entry was overriding it:**
*"El gramaje se refiere a los ingredientes principales."*

The printed 135 gr. is now the **principal ingredients** — tortillas 72 g + chicken 28 g + bean sauce
35 g — with crema and cotija as garnish OUTSIDE it, still eaten and counted, exactly as NEW YORK's
chimichurri already is. Total eaten **160 g**. The bean sauce is *inside* because the dish is
*"bañadas con salsa de frijol"*: a sauce a dish is bathed in and named for is principal; a sprinkle on
top is not.

⚠️ **NOT a re-opening of the Casa Nostra scope ruling.** That menu prints nothing about what its
weights mean, and the whole-plate reading stands there. This menu prints its rule explicitly.

**Totals: 253.7 → 298.9 kcal, 13.5 → 16.2 P, 36.1 → 38.0 C, 6.9 → 10.0 F.**

**Three readings were computed at $0 and the middle one chosen:**

| reading | inside the 135 g | kcal | protein | plate | kcal/100 g |
|---|---|---:|---:|---:|---:|
| A — the old whole-plate reading | everything | 254 | 13.5 | 135 g | 188 |
| B — tortilla + chicken only | solids | 392 | 27.6 | 235 g | 167 |
| **C — ADOPTED** | **+ the bean sauce** | **299** | **16.2** | **160 g** | **187** |
| | *every measured arm says* | *305* | *19.1* | | |
| | *published reference* | | | | **175** |

🔴 **B was applied first and REVERTED — the error is recorded so it is not repeated.** Its 63 g of
chicken came from scaling one source's 120 g : 120 g chicken-to-tortilla ratio without noticing that
recipe is a **632 g** dish, nearly five times this one. It swung the oracle from 20–48% BELOW every
arm to 22–31% ABOVE, and made our answer key richer than every published source. **A ratio does not
transfer between portions of different size.**

**What was actually wrong was the PLATE SIZE, not the composition.** Our per-100 g density read 188
against the reference's 175 before this change and 187 after — it was never the problem. A published
reference puts one enfrijolada at **110 g**, so three are ~330 g; the old reading made three of them
135 g, less than half a real portion, which is why every arm ever measured ran protein 33–48% over it.

**Result — ENFRIJOLADAS goes from the worst dish to a clean pass, and it resolves the B15/B21 split:**

| arm | before | after |
|---|---|---|
| baseline (naive) | 30/96, 37.8% | 24/96, 34.2% |
| B15 (`macro-best-v3`) | 3–4/96, 14.1–14.9% | 2–3/96, 12.0–12.6% |
| **B21 (`macro-best-v4`)** | 4–7/96, 15.0–17.1% | **0–3/96, 12.1–14.1%** |

**B21 now leads on BOTH metrics.** The earlier conflict — where the tolerance ruling made B15 look
better on the headline — is dissolved: it was an artefact of a wrong answer key on one dish, and
Santiago's per-dish judgement to keep B21 is vindicated by the corrected measurement.

✅ **Guard PASSED:** the naive baseline still fails **24 of 96 at 34.2%**, so the baseline→best gap is
**21–24** — held, not collapsed. A correction that made everything pass equally would have destroyed
it.

🔴 **MEASUREMENT correction, NOT a pipeline improvement.** B21 is byte-identical before and after.
Figures either side of this change are not comparable.

### 🌍 GENERALISATION PROBE — B21 on 16 dishes no fixture covers (2026-08-09, ~$0.10)

**The point of the phase is a pipeline that works on ANY menu, and eight fixtures cannot show that.**
This runs the DEPLOYED path over dishes chosen to look nothing like them — other cuisines, other
languages, a dish with no printed weight, a drink — and audits STRUCTURE rather than macros, since
these have no oracle and building one needs Santiago's approval per recipe.

✅ **`name_implied_components` (B15) generalises, and stays precise.** It fired on forms it was never
designed against and stayed silent where the description was already complete:

| dish | implied |
|---|---|
| BACON CHEESE BURGER | `burger patty, burger bun` |
| Nigiri de salmón (2 pzas) | `sushi rice` |
| Club Sandwich | `bread` |
| PASTA ALFREDO | `pasta` |
| Margherita | `pizza crust` |
| Ensalada Griega, PURÉ DE PAPA, RIB EYE, Tarta de queso, Pad Thai, Tikka Masala | `[]` — correctly |

✅ **Scope tagging generalises.** `chimichurri` outside RIB EYE's 400 gr and `french fries` outside
the Club Sandwich — both marked *acompañado* on menus the fixture set never used.

✅ **RACC servings (B21) hold across cuisines.** Sauces and dressings land at 30 g repeatedly —
garlic sauce 30, berry coulis 30, tamarind sauce 30 — the behaviour B21 was adopted for, on foods it
was never tuned against.

✅ **No printed weight is handled correctly.** Six dishes had none, returned `printed_total_g: null`,
and the fitting step did not fire.

✅ **Tiny printed weights do not produce absurdities.** `ESPÁRRAGOS CON JAMÓN SERRANO (20 g)` → 18 kcal,
`COSTRA DE CHAMORRO (80 g)` → 176 kcal.

✅ **The drink is right, and this is the one GPT-5.5 got wrong.** `Bebida de litro mineral (1lt)` → **0
kcal**, one ingredient, sparkling water. The pipeline-integrity arm recorded GPT-5.5 assigning it
**252 kcal**. Drinks remain out of the benchmark, but the pinned model handles this one correctly.

🔴 **ONE REAL DEFECT — the BLACK-BOX INGREDIENT, and it is a general failure, not a fixture quirk.**
`Chicken Tikka Masala with basmati rice` decomposed to exactly two ingredients:

```
chicken tikka masala   200 g   (C5 per 100 g)
basmati rice           150 g   (C75 per 100 g)
```

**The dish named itself as its own ingredient.** No chicken, cream, tomato or spice — one opaque 200 g
block whose per-100 g composition is a dish-level guess. Pad Thai, by contrast, decomposed properly
into noodles, egg, sprouts, peanuts and sauce.

**Why it matters more than one dish:** this is B18's failure leaking back in through the ingredient
list. B18 measured that the model's dish-level recall is WORSE than its ingredient sum on 6 of 8
dishes, which is the whole reason this pipeline builds from parts. When a menu item's name is itself a
well-known composite dish, the model can satisfy the schema without decomposing anything — and every
guard we have is downstream of the ingredient list, so nothing catches it. **The risk is highest
exactly where the app is least tested: named dishes from cuisines whose components a Western menu
never spells out.**

**Not fixed, and deliberately not rushed:** it needs a run to measure and the eight fixtures cannot
detect it — none of them is a named composite dish. Logged as the top generalisation target.

### B23 → B24 — the black-box ingredient: prompting failed, detection shipped (2026-08-09, ~$0.07)

**B23 (prompt) FALSIFIED. B24 (code detection) adopted.**

**B23** added a structural requirement to the prompt: *"Every entry must be a SINGLE food, never a
composed dish… if the item's name is itself the name of a prepared dish, that name is not an
ingredient."* No food names, so the shipped-prompt guard passes. **The model returned `chicken tikka
masala 200 g` again, unchanged.**

📊 **Prompt wording is now 0 for 3** (B11, B13, B23), against mechanism changes at 4 for 6. The
pattern is consistent and specific: **prompting can make the model answer a question it was not
asked (B15, B21 both worked that way); it cannot make it stop giving an answer it already gives.**

**B24 detects it in code instead.** `isBlackBoxIngredient(itemName, ingredientName)` fires when the
item's name BEGINS with the ingredient's name. Where it fires, the item's `confidence` drops to
`"low"` — the macros stand, because nothing here can decompose what the model did not, but the app
already surfaces confidence, so the uncertainty reaches the diner instead of being silent.

⚠️ **The first rule was wrong and the test caught it before it shipped.** Containment was tried first
— and *"Chicken Tikka Masala with basmati rice"* **contains** *"basmati rice"*, a perfectly real
ingredient. That would have downgraded correct answers. Menus name dishes **"X with Y" / "X con Y"**,
where X is the dish and Y a component it lists, so a restated dish sits at the HEAD of the name and a
genuine ingredient does not. `startsWith` is both simpler and correct.

**No food list, no language assumption** — accent- and case-normalised only, which matters because a
shipped food list is forbidden here and was measured harmful (B11).

**Verified against the real probe data**, including every false-positive case it must not fire on:

| item | ingredient | fires? |
|---|---|---|
| Chicken Tikka Masala with basmati rice | `chicken tikka masala` | ✅ yes |
| Chicken Tikka Masala with basmati rice | `basmati rice` | no |
| Margherita | `pizza crust` | no |
| BACON CHEESE BURGER | `burger bun` | no |
| PASTA ALFREDO | `pasta` | no (one word = a food) |
| PASTEL AZTECA (300gr.) | `pastel azteca` | ✅ yes |

**No effect on the eight fixtures** (0–3/96 at 12.1–14.1%, unchanged) — none of them is a named
composite dish, which is exactly why only a generalisation probe could find this.

### 🌍 WIDE GENERALISATION PROBE — 36 dishes, 5 languages, 0 fixtures (2026-08-09, ~$0.05)

Deliberately built to break the pipeline in ways the eight fixtures **structurally cannot**: named
composite dishes, French/German/Italian/Vietnamese/Portuguese, weight formats no fixture uses,
promotional names, and items that are not really food. All 36 sent, **36 returned, none dropped**.

✅ **Weight parsing generalises far past the fixture formats — every conversion correct:**

| printed | parsed |
|---|---|
| `1.2 kg` | 1200 g |
| `12 oz` | **340 g** |
| `1/2 lb` | **227 g** |
| `350 ml` | 350 g |
| `500 grs` | 500 g |
| `3 pzas / 240 g` | 240 g |

Ounces and pounds appear in no fixture and are converted correctly.

✅ **Named composite dishes DECOMPOSE — the black-box is rarer than feared.** Beef Wellington (4
ingredients), Coq au Vin (4), Moussaka (4), Bibimbap (5), Ramen Tonkotsu (5), Paella (6), Chiles en
Nogada (4), Feijoada (6), Wiener Schnitzel, Bún chả, Coquilles Saint-Jacques — all broken into
component foods across five languages. **1 of 36 restated itself**: `Tomahawk Steak 1.2 kg` →
`tomahawk steak` 1200 g.

✅ **B24 caught that one, end to end.** It was the only item to trip the detector and its confidence
dropped to `low` automatically. The guard works on data it was never built against.

✅ **Promotional names behave.** `El Capricho del Chef` and `Explosión de Sabores` both returned
`confidence: low`, which is exactly what step 3 asks for.

🔴 **DEFECT 1 — an unknown dish reports 0 kcal, and that is worse than reporting nothing.**
`El Capricho del Chef` and `Explosión de Sabores` returned **zero ingredients**, and because item
totals are summed from ingredients (B10), the item shows **0 calories**. Confidence is `low`, but a
diner reading a calorie-sorted list sees a **0** — a confident, wrong, and *appealing* number that
sorts to the top of a "lowest calorie" ranking. **This is a product decision, not a measurement one:
should an item with no ingredients show nothing rather than zero?** Raised for Santiago; nothing
changed. It affects any menu with evocative dish names, which is common in the exact restaurants this
app targets.

🔴 **DEFECT 2 — alcohol is invisible to the calorie calculation, structurally.**
`Copa de vino tinto (150 ml)` → **18 kcal**. A 150 ml glass of red wine is ~125 kcal. The model's
ingredient figures are right (`red wine`, P0 C3 F0); the gap is that calories are computed by Atwater
from protein, carbohydrate and fat, and **ethanol contributes 7 kcal/g while appearing in none of
those three**. Every alcoholic drink will be understated by roughly the same mechanism — beer, wine,
spirits, cocktails. Drinks are formally out of this phase's scope (Feature 5, deferred post-release)
and the benchmark contains none, so this has never been measurable here. **Logged as a known
structural limitation for whoever picks drinks up.**

**Neither defect is a model error and neither is fixable by prompting** — one is a display decision,
the other is a missing term in our own arithmetic.

### ✅ B25 — ethanol reaches the calorie total (2026-08-09, ~$0.08)

**Fixes DEFECT 2 from the wide probe. Not a model error — a missing term in OUR arithmetic.**

Calories are Atwater over protein, carbohydrate and fat. **Ethanol is none of the three and carries
7 kcal/g**, so alcohol was structurally invisible: a 150 ml glass of red wine scored **18 kcal**
against a real ~125, while the model's own figures (`red wine`, P0 C3 F0) were correct.

**The fix is B12's pattern once more:** one more per-100 g property the model already knows,
`alcohol_per_100g`, priced in code at 7 kcal/g. No drink or food is named in the prompt — only the
nutrient — so the shipped-prompt guard is untouched.

| | before | after |
|---|---:|---:|
| Copa de vino tinto (150 ml) | 18 kcal | **144 kcal** (real ~125) |
| **Coq au Vin** | 512 | **618** |
| Espresso doble | 0 | 0 ✅ |
| Agua mineral 500 ml | 0 | 0 ✅ |

🔑 **It caught alcohol in FOOD, which was the part worth having.** Coq au Vin's red wine was flagged at
12 g/100 g unprompted. Beer batter, wine sauces and flamed dishes all carry the same hidden calories,
and none of them is a drink — so this was never only a Feature-5 problem.

**Alcohol is deliberately NOT reported as a macro.** Protein, carb and fat are what a diner filters
on, and adding a fourth would change every consumer of this shape. It only has to reach the calorie
figure, which is where its absence was measurable.

**Fixture check — the term is provably inert on the eight dishes:** every `alcohol_per_100g` across
8 dishes × 3 draws came back **0**, so the arithmetic cannot have moved them. The probe read 5/96 at
13.5% against B21's 0–3/96 at 12.1–14.1%; the failures sit on CESAR and Salmone, the same two dishes
already at the noise floor, and are run-to-run spread from the extra schema field rather than a
regression. Mean |error| stays inside range.

⚠️ **A legacy archive has no alcohol field at all**, so `?? 0` keeps every $0 re-score of a pre-B25 run
byte-identical. Pinned by a test.

### ⬅️ B25 REVERTED — drinks and alcohol are POST-LAUNCH (Santiago, 2026-08-09)

> *"Drinks are not being handled right now and not included in the nutritional enrichment schema.
> Drinks and alcohol is going to be handled post-launch."*

B25 added `alcohol_per_100g` to every item's schema for a category deliberately out of scope, so it
is out. Verified: **zero references to alcohol or ethanol remain** anywhere in `src/`, `supabase/` or
`scripts/`.

**The finding is kept for whoever picks drinks up.** Calories are Atwater over protein, carbohydrate
and fat; ethanol is none of the three and carries 7 kcal/g, so a 150 ml glass of wine reads **18 kcal
against a real ~125**. ⚠️ **It reaches FOOD too** — Coq au Vin measured 512 → 618 kcal — so it is not
purely a drinks problem when that work starts.

### ✅ An item with no ingredients now shows "—", not 0 (Santiago, 2026-08-09)

The wide probe's DEFECT 1. Item macros are summed from ingredients (B10), so an item the model could
not decompose sums to **0** — which renders as a confident `0 Cal` and **sorts to the top of a
"lowest calorie" ranking.** A dash says *we don't know*; a zero says something false and appealing.

`MenuItemRow` renders `—` for every macro when `ingredients` is empty. One condition, at the render
layer — the macros themselves are untouched, so nothing downstream of enrichment changes.

**We already had the detector, and it fired correctly.** `confidence` is set by the model (step 3:
*low* when a name is "evocative or promotional rather than descriptive"), forced to `low` by B24 on a
black-box ingredient, and surfaced by `results.tsx` as a banner when **≥75%** of items are low.
`El Capricho del Chef` and `Explosión de Sabores` both came back `low` with zero ingredients. **The
gap was never detection — it was that the banner is menu-level, so a handful of undescribed dishes on
an otherwise good menu triggered nothing while still displaying 0.**

**Still open, deliberately deferred:** whether such items should also be excluded from goal SORTING
rather than merely displaying a dash. Santiago: *"we'll later decide how to handle them."*

### ⚠️ PROVENANCE — the wide probe's 36 dishes were SYNTHETIC, and one claim must not be reused

The 36 items were **written for the probe**, not taken from a real menu. That was not stated when the
run was reported and it changes what the results support:

| finding | still valid |
|---|---|
| `12 oz` → 340 g, `1/2 lb` → 227 g, `1.2 kg` → 1200 g | ✅ tests OUR parser; the input's origin is irrelevant |
| wine at 18 kcal | ✅ an arithmetic gap in our own code |
| the 0-kcal display defect | ✅ reproduces from any item with no ingredients |
| composite dishes decompose | ⚠️ weaker — the dishes were chosen as ones the model likely knows |
| **"1 of 36 black-boxed"** | 🔴 **NOT a real rate. The denominator is a designed set — never quote it as a frequency** (standing rule: a frequency claim needs a denominator, and this one is not a sample of anything) |

**For an honest rate, sample the nine real archived menus in `scripts/fixtures/caches/` instead.**

### 📊 REAL-MENU PROBE — 72 items, 9 menus, honest rates at last (2026-08-09, ~$0.26)

Replaces the synthetic wide probe's unquotable figures. Items taken from the **latest extraction
archive of each of the nine real menus**, food and sides only, sampled by a deterministic even spread
fixed BEFORE any result was seen — so the set is not chosen to flatter or to break anything. Run
through **`callGptEnrich`**, the full production entry point: batches of 10, retry, reassembly.

⚠️ **A 72-item single call TIMED OUT at 120 s** on the first attempt. Production batches at 10 for
exactly this reason; the probe now takes the same path a real scan takes, which makes it more
faithful, not merely workable.

| | count | rate |
|---|---:|---:|
| black-box ingredient (name test alone) | 2 | 2.8% |
| **black-box after the mass-share guard** | **1** | **1.4%** |
| no ingredients at all | 2 | 2.8% |
| 0 kcal | 2 | 2.8% |
| confidence | high 8 · medium 55 · **low 9** | |

**Ingredient counts are healthy** — 4, 5 and 6 ingredients are the commonest (14, 13 and 11 items).
Only 2 of 72 returned nothing, and 7 returned a single ingredient, which is correct for a one-food
side like `Parmesano`.

🔴 **B24 HAD A FALSE POSITIVE, and only a real menu could show it.**
`BLACK TRUFFLE BUTTER` (guest-house) decomposed **correctly** — butter 14 g + black truffle 5 g — and
was flagged and downgraded to `low` purely because the item name starts with an ingredient name. **One
false positive against one true positive: the name test alone was right about half the time.**

**B24b adds the distinguishing fact, which is MASS SHARE rather than the name.** A restated dish IS
the dish, so it carries essentially all of it — `hot cakes` was 100% of HOT CAKES. A genuine component
shares the plate — truffle is 26% of the butter. The threshold is **80%**, sitting far from both
observed cases rather than tuned to either.

| item | name test | mass share | flagged now |
|---|---|---:|---|
| `HOT CAKES (3 piezas) Naturales` → `hot cakes` | matches | **100%** | ✅ yes |
| `BLACK TRUFFLE BUTTER` → `black truffle` | matches | 26% | **no** ✅ fixed |

**The two empty-ingredient items are both real and both correct:** `Spicy Garlic` and `Parmesano`
(polloteria) are sauce/seasoning names with no description — the model rightly had nothing to work
with, and they now render as a dash rather than 0 kcal.

**Honest rates to quote from here on: black-box ~1.4%, undecomposable ~2.8%, both on 72 real items
across 9 menus.** Small, but real, and each now has a guard behind it.

### 🍕 FEATURE — `serving_pieces`, so the portion stepper moves by PIECE (2026-08-09, ~$0.07)

**Santiago's edge case: a pizza is one menu item with one set of macros, and a diner eats three of
eight slices.** The stepper moved in halves, so 3/8 could not be expressed at all — the nearest was
x0.5, which is half a pizza. This is product work rather than macro accuracy, and it was previously
half-built: the front-end stepper existed, the back end had no concept of pieces.

**Shape:** the model returns `serving_pieces` (a new required schema field, step 3, no food named);
`src/lib/portions.ts` turns it into a step size and a label; `MenuItemRow` uses them. An item with a
count steps by **one piece** and reads `3/8`; everything else keeps the half-item behaviour, because
"half a steak" is how people talk and "1/17 of a steak" is not.

**Measured on real menu lines:**

| item | pieces |
|---|---|
| `Alitas 6 PZ` | **6** ✅ |
| `HOT CAKES (3 piezas) Naturales` | **3** ✅ |
| `Nigiri de salmón (2 pzas)` | **2** ✅ |
| `TACOS O FAJITAS DE DIEZMILLO (3 pzas./200 g)` | **3** ✅ |
| `ENFRIJOLADAS (135gr.)` — *"Tres tortillas"* in the description | **3** ✅ |
| CESAR / NEW YORK / Coleslaw | `null` ✅ correctly |
| **`Margherita`** | **`null`** ❌ |

✅ **Every STATED count is read correctly, including one stated in prose rather than digits**
("Tres tortillas"), and every single-plate dish correctly returns null. **5 for 5 and 4 for 4.**

🔴 **The pizza case — the one that motivated the feature — does NOT work.** A menu that does not print
a count gets `null`, so a pizza still steps in halves. A second, more explicit wording ("routinely cut,
folded or assembled into countable pieces… a form served whole for one person to divide is still
served in pieces") returned **exactly the same nulls**, so the extra text was reverted rather than
shipped dead. **Prompt wording is now 0 for 4.**

**Why it is shipped anyway:** stated counts are common on real menus — `3 pzas`, `6 PZ`, `(3 piezas)`,
`orden de dos` all appear in the archived corpus — so the feature is real for those, and the fallback
is exactly today's behaviour. Nothing regresses.

**For conventional counts, the options are a product decision, not a prompt one:** let the diner set
the piece count on the item, or hold a small conventional-count table in code. A table means naming
foods, which is banned in the shipped prompt for good reason — but a lookup in CODE is a different
thing from a food list in the prompt, and it was never covered by that ruling.

**`portions.ts` is guarded by 5 tests** covering piece labelling, floating-point accumulation
(1/3 + 1/3 + 1/3 must read "all", never "2.9999/3"), the half-item fallback, and every implausible
count a model could return (0, 1.5, −3, 51, NaN, Infinity).

### 🚀 FORCED `serving_pieces` — measured, shipped as v30 (2026-08-11, ~$2.35 for the day)

`serving_pieces` stops being nullable. Prompt wording was 0 for 4 at getting a conventional count;
schema force worked where wording could not, and **it also improved the macros**, which nobody
predicted.

| arm | failed/96 | mean abs error |
|---|---|---|
| `macro-best-v8` (was v29) | 2–3 | 14.3–14.5% |
| **forced pieces (v30)** | **0–3** | **12.0–12.5%** |

Two of four runs scored a perfect 0/96 and the error ranges do not overlap. **Why** it helps macros is
NOT established — B15's mechanism (state the served form before listing ingredients) is a hypothesis.

**Santiago's two pre-ship conditions, measured over 213 real items from five menus:**
printed weight kept on **63/63** items that print one (and 96/96 fixture item-draws), median calorie
change on those items **2.2%**; no drops, reorders, renames or empty ingredient lists; median change
across all 213 items **3.3%**. Of the 19 items that moved >25% and >50 kcal, sixteen gained a missing
preparation ingredient (batter on boneless chicken, oil on grilled vegetables, twice the cheese on a
whole pizza) and three were drinks — **ruled out of the app by Santiago, so not a blocker**.

🔴 **COVERAGE IS HALF THE STORY — the pizza case STILL FAILS.**

| kind | count returned |
|---|---|
| stated on the menu (`3 pzas`, `Tres tortillas`) | ✅ honoured, 3 of 4 |
| sushi rolls | 🟡 **32 of 42** got 8; ten got 1 |
| **pizzas (Bistro)** | 🔴 **0 of 26** — every one returned 1 |
| single-plate dishes, desserts | ✅ 1, correctly |

So the feature shipped for its MACRO gain, which is measured, and not for its stepper gain, which is
partial. A pizza still steps in halves. **Sushi counts also come back 8 where Santiago's own
photographs of Nikkori show 10–12**, so the default is low for that restaurant — which is precisely
what the editable stepper is for.

### 🎛️ THE PORTION CONTROL — shipped client-side, needs build 7 (2026-08-11, $0)

The stepper stops guessing what a dish is. Every item now carries **two** client-side numbers:
`portion` (the share of one order, default 1) and `piecesPerOrder` (what the order is cut into,
seeded from the model's `serving_pieces` and guarded to 1 for anything that is not an integer 1–50).
A row with no pieces reads `1` and steps in halves; a row with pieces reads `8 / 8` and steps by one
piece. Tapping the value opens one editor with both fields — `I'll have` and `comes in` — so the
diner can cut a Margherita the model called whole into 8, or correct a Nikkori roll from 8 to 12.

**What did NOT change: the edge function, the schema, the prompt, the model, and the macro maths.**
This is UI and one pure module. Spec: `specs/2026-08-11-portion-control-design.md`. Plan:
`plans/2026-08-11-portion-control.md`.

🔑 **The invariant that makes the pizza defect survivable.** Macros are always `itemMacros × portion`
— `piecesPerOrder` is arithmetically absent, so it can only format. Changing `comes in` therefore
**cannot move a single calorie**, and that is enforced by a test, not by care. A wrong piece count
costs the diner granularity (a steak shown as `3 / 3` steps in thirds) and never accuracy, which
downgrades the 0-of-26 pizza result from a data defect to an ergonomics one.

Changing the divisor **preserves the share, not the count**: `8/8` → 12 gives `12/12`, `4/8` → 12
gives `6/12`. Justified by Santiago's ruling (2026-08-11) that the app is used **before** ordering,
so nobody is reconciling against slices they have already eaten.

**One spec conflict resolved during implementation.** The spec said the numerator shows to one
decimal, and also that a typed `0.25` is accepted. Both cannot hold: `0.25` would display as `0.3`
beside calories computed from `0.25`, which the diner can catch. Typed input is now rounded to **two**
decimals and displayed at two, so the number shown is always the number the macros used.

**11 tests guard `portions.ts`** — the divisor guard against every shape a model can return, the step
for 1/3/8/12, floating-point accumulation (`1/3 + 1/3 + 1/3` must read `3 / 3`), no ceiling in either
form (`16 / 8` is two pizzas), the input parsers, and the invariant itself.

⚠️ **Not visible until TestFlight build 7.** Build 6 carries the old label and renders `3` / `8`.
This is the app binary half of the 2026-08-11 split: v30 (the prompt) deployed in minutes, this waits
for a build.

**Device testing the same evening changed four things** (see §10b of the spec for the
side-by-side). The `TextInput` crashed on open — `nativewind@5.0.0-preview.4` ships a
`nativeStyleMapping` of `{ textAlign: true }` against code that calls `path.split(".")`, so
`text-center` was fatal; `textAlign` now goes through `style`. The editor's quantity field
was counting **orders** while the row counted **pieces**, so typing `18` on a 12-roll plate
meant eighteen plates — it now counts the dish's own unit, and `unitCount` /
`portionFromUnitCount` own that conversion under a round-trip test. The editor gained a live
`each piece about N cal` line, because §6's guarantee otherwise makes the divisor look inert.
Both fields now sanitise non-numeric input. **15 tests.**

📊 **A question worth keeping: does the model's mass estimate track its own piece count?**
Measured on the 213-item forced-pieces run, over the 144 items with no printed weight:
1 piece → 231 g (n=102), 2 → 203 g, 3 → 230 g, 4 → 230 g, 6 → 213 g, 8 → 392 g (n=35).
**Flat from 1 to 6.** A 6-piece dish weighs what a 1-piece dish weighs, so the count is a claim
about how an order is CUT, not how much food it holds — which is what makes §6's invariant
correct rather than merely convenient. The 8-piece group is heavier because those 35 items are
almost all sushi rolls, a heavier dish; that confound is the whole of the r=0.535 correlation.
Corollary for Nikkori: a 397 g Salmón Roll plate is 50 g per piece at the model's 8 and 33 g at
Santiago's observed 12 — **33 g is a normal sushi piece, so the plate mass looks right and only
the count is low.**

### 🚧 BLOCKER — the pipeline responds to printed grams and to NO other size signal (2026-08-11, ~$0.20)

Found without an oracle, which is why it is worth more than the six-dish oracle it was meant to
support. The same dish was sent at two sizes, one item per call so variants could not anchor each
other, three draws each. **Calories** is the metric: a printed-grams control moved the ingredient
sum only 1.10× but calories 2.17×, because `resolveGrams` fits the model's servings to the printed
weight IN CODE — the ingredient list sits upstream of the thing that responds.

| signal | calorie ratio, 3 draws | expected | verdict |
|---|---|---|---|
| **printed grams 200 → 400 g** (control) | **2.14–2.37** | 2 | ✅ responds |
| diameter 28 → 40 cm | 1.06–1.36 | 2.04 | ❌ flat |
| "individual" → "para compartir, 2 personas" | **0.62**–1.22 | 2 | ❌ flat, sometimes inverted |
| "6 pz" → "12 pz" | 1.03–1.17 | 2 | ❌ flat |
| "chica" → "grande" | 1.02–1.32 | 1.5 | ❌ flat |

🔴 **This kills arm B as designed.** B was "capture the `28 CM` and carry it to enrichment". The
probe ran a stronger version than B could ever be — the size sat in the item's NAME, the most
prominent position available — and the model ignored it. Passing size as TEXT achieves nothing.
A captured size only helps if **code** converts it to grams, because grams is the only channel that
works.

**It is not a pizza problem.** Wings, pasta and salad are equally flat. The dish is irrelevant; the
channel is everything.

🔑 **A food-agnostic fix is visible in the table.** "2 personas" and "12 pz" are pure **multipliers**
— 2× one portion whatever the dish, needing no food list, no dish names, and no effect on items that
state nothing. Only `28 cm` needs a density, and a density is dish-specific.

⚠️ **Interacts with what shipped the same day.** `serving_pieces` is treated as a **divisor** — 8
slices divide one pizza. But "12 pz" of wings is twice the food, not the same food cut smaller.
Both the model and the portion control currently treat every count as division. Those are two
different meanings of a count and only one is implemented.

**What this does NOT establish:** that estimates are uniformly low. They are not — Coliflor Roka
(85 g), Carbonara (315 g) and Salmón Roll (397 g) all look plausible. The defect is that estimates
sit near a ~231 g prior and **do not move when the menu says the dish is bigger**. Dishes whose true
size happens to sit near that prior come out fine; dishes far from it — a 28 cm pizza, a platter for
two, a 12-piece order — come out badly wrong.

Probe: `scripts/probe-size-sensitivity.ts`. Archive:
`scripts/fixtures/caches/probe-size-sensitivity.raw.json`.

### 🔑 THE KNOWLEDGE IS THERE — the pipeline never asks for the plate (2026-08-11, ~$0.05)

Follow-up to the size-channel blocker, and the finding that turns it into a buildable fix. The same
model, same version, same sampling, asked **outside** the enrichment prompt: *how many grams does
this dish weigh as served?* Three draws.

| dish | asked plainly | the pipeline | factor | best view of truth |
|---|---|---|---|---|
| **CAPRICCIOSA 28 cm** | **750 g** | 250 g | **3.00×** | ~500–700 g |
| **Alitas 12 pz** | **360–480 g** | 130 g | **3.23×** | ~400–500 g |
| CARBONARA | 450 g | 315 g | 1.43× | ~250–400 g |
| Coliflor Roka | 150 g | 85 g | 1.76× | 80–160 g |
| Salmón Roll | 350 g | 397 g | 0.88× | 300–400 g |
| CESAR (200 g) — CONTROL | 200 g | 200 g | 1.00× | 200 g, stated |

**The mechanism, stated plainly.** The model is asked for ingredients and a typical serving of each;
the plate mass is whatever those happen to SUM to. No step ever asks whether 250 g is a believable
28 cm pizza, because no step looks at the plate. That is why the ~231 g mean exists — it is the sum
of per-ingredient reference servings, not anyone's estimate — and why no stated size moves it.
`resolveGrams` is the only place in the pipeline where the plate exists as a concept, which is
exactly why printed grams are the only channel that works.

**The signature is the good one:** the direct answer is ~3× higher precisely where the pipeline is
badly wrong, and agrees where the pipeline is already right (Salmón Roll 0.88×). A fix built on this
should move what is broken and leave alone what is not.

⚠️ **The direct answers run HOT** — 750 g against a 500–700 g reconstruction, carbonara 450 g against
~400, cauliflower at the top of its band. Adopting them wholesale will likely overshoot. Overshooting
10% is a different problem from being 3× low, but it must be measured, not assumed.

🎯 **What three prior findings jointly direct** (Santiago's rule: old evals are directions, not
prohibitions):

| prior finding | direction |
|---|---|
| the `typical_total_g` anchor regressed printed-weight dishes — ONE prompt served every item | do NOT repeat single-prompt delivery; DO repeat the idea with a **split batch** so weighted items keep today's prompt byte-identically |
| wording 0-for-4, schema/mechanism force 5-for-7 | make it a **required field plus code routing**, not an instruction |
| printed grams move the answer 2.14–2.37× via `resolveGrams` | route the plate total through **that same code path** |

**A bonus the probe settled for free:** asking for the PLATE total absorbs the count problem.
"An order of 12 chicken wings" returned 360–480 g unprompted, so a quantity-type count needs no
separate multiplier — it is simply a fact about the plate. The divisor-vs-multiplier distinction
survives only in the UI portion control, not in the mass path.

Probe: `scripts/probe-plate-knowledge.ts`. Archive:
`scripts/fixtures/caches/probe-plate-knowledge.raw.json`.

### ⚗️ ARMS A AND C MEASURED — A wins, and is NOT ready to ship (2026-08-11, ~$0.80)

Spec: `specs/2026-08-11-plate-total-arms-design.md`. Probe: `scripts/probe-plate-arms.ts`.
Neither arm touched `enrich.ts` or the deployed function.

**A** splits the batch: items that print a weight keep today's request byte-identically, the rest get
a required `typical_total_g` **placed immediately after `printed_total_g`, before `ingredients`** —
the same B4 ordering logic, so the model commits to the plate before portioning into it. **C** leaves
`ENRICH_PROMPT` untouched and asks a separate parallel call for the plate weight.

| signal, 3 draws | baseline | **A** | C | expected |
|---|---|---|---|---|
| printed grams (control) | 2.01–2.10 | **2.14–2.31** ✅ | 2.02–2.17 ✅ | 2 |
| diameter 28→40 cm | 1.00–1.31 ❌ | **1.74–1.76** ✅ | 1.39–1.41 ❌ | 2.04 |
| piece count 6→12 pz | 1.00–1.00 ❌ | **1.66–2.48** ✅ | 1.20–1.40 ❌ | 2 |
| portions for 2 | 1.00–1.28 ❌ | 1.24–1.33 ❌ | 1.42 ❌ | 2 |

🔴 **My prediction about C was wrong.** I expected batching to dilute it; each call here carried a
single item, so batching was never the cause. C is weaker because it asks **cold**, while A asks
inside the enrichment prompt where the model is already decomposing the dish. Context helped rather
than hurt — the opposite of what the design predicted.

**Guard dishes, 3 draws, unweighted only** (the 8-dish fixture CANNOT detect an A regression: all
eight print a weight, so all eight take the byte-identical path and never exercise the new code):

| dish | plausible | baseline | A | C |
|---|---|---|---|---|
| Coliflor Roka | 80–160 g | 160–165 kcal | **150 g ✅** | 250 g ❌ |
| CARBONARA | 250–400 g | **502–987 kcal** | **350–400 g ✅** | 350 g |
| CAPRICCIOSA | 500–700 g | ~250 g ❌ | 400 g — improved, still below | 350 g |
| Salmón Roll | 300–400 g | 397 g ✅ | **250 g ❌ below** | 250 g ❌ |

⚠️ **A single guard run said Coliflor Roka went to 250 g and I called it a regression. Three draws
say 150 g, inside the band.** The claim was wrong; the re-run caught it. This is the never-quote-a-
single-run rule earning its place again.

📊 **An unpredicted benefit: A cuts variance.** Baseline Carbonara swings **502–987 kcal** across
three draws on identical input; A gives 786–825. Stability on unweighted dishes was not a metric in
the spec and probably should have been.

**Verdict: A wins between the two and does NOT ship yet.** It fixes the defect it was built for,
provably cannot touch printed-weight items, and is steadier — but it moved one already-correct dish
out of band, the pizza is still under its reconstruction, and four guard dishes without an oracle is
too thin to justify changing every scan. Directions this leaves: understand the Salmón Roll drop;
more guard dishes; and the unweighted oracle, which this experiment deliberately did not need but
which is what would settle it.

### ✅ ARM A-CONDITIONAL — ask always, anchor only on a stated size (2026-08-11, ~$0.40)

The synthesis of everything measured today. The `typical_total_g` field is **always requested**,
because asking for the plate demonstrably improves how the model portions ingredients; the value is
**applied as an anchor only when the menu states a size or quantity**, detected by a deterministic,
food-agnostic parse (`\d+ cm|pulgadas`, `\d+ pz|piezas`, `\d+ personas`, `chica|grande|individual|
compartir`, `dos|tres|seis|doce`) — units and quantifiers, never a food name, the `parseItemGrams`
discipline.

| metric, 3 draws | baseline | A | **A-conditional** |
|---|---|---|---|
| printed grams (control) | 2.09–2.22 ✅ | 2.15–2.26 ✅ | 2.09–2.16 ✅ |
| diameter 28→40 cm | 1.06–1.34 ❌ | 1.68–1.81 ✅ | **1.77–1.95** ✅ |
| piece count 6→12 pz | 1.00 ❌ | 1.66–1.95 ✅ | **1.81–1.97** ✅ |
| portions for 2 people | 0.62–1.21 ❌ | 1.33 ❌ | 1.33 ❌ **still unfixed** |
| Salmón Roll, no size stated | 482–492 ✅ | **362–385 ❌** | **482–496 ✅** |
| Capricciosa, no size stated | 570–785 | 815–849 | **856 — best** |
| Carbonara spread | 609–**987** | 745–867 | **701–745 — tightest** |
| Coliflor Roka | 165–196 kcal | 122–220 | **59–91** (its mass band implies 42–83) |

🔑 **The mechanism, now separated into two levers.** Asking for the plate total improves the
INGREDIENT LIST — the Capricciosa reaches its best figure (856 kcal) under A-conditional while never
being anchored at all. Applying the total is a SECOND, independent lever that only pays off when the
menu actually said something about size; with nothing stated it overrides a reasoned ingredient list
with a guess, which is what broke the Salmón Roll under plain A. The field is a reasoning device in
the same family as `name_implied_components`; the anchor is arithmetic.

⚠️ **What this does NOT establish.** Four guard dishes and three draws is thin. There is still no
unweighted-dish oracle, so every verdict above is "inside/outside a defensible band", not a score.
The **96-point weighted benchmark cannot validate any of this** — all eight fixtures print a weight,
so all eight take the byte-identical path and never exercise the changed code. "Portions for N
people" remains flat in every arm, and the Capricciosa at 856 kcal is still under its 1,100–2,000
reconstruction.

Probe: `scripts/probe-plate-arms.ts` (`statesSize` is the detector). Archives:
`probe-plate-arms.raw.json`, `probe-plate-arms-guard.raw.json`.

### 🛑 THE WIDER SET OVERTURNS A-CONDITIONAL (2026-08-11, ~$0.25) — do not ship it

Fifteen real unweighted dishes with real descriptions, 60–510 g, four menus, run **batched** the way
production runs them. Set frozen at `scripts/fixtures/unweighted-guard-set.json`.

| direction | dishes | change vs baseline |
|---|---|---|
| up | Tiras de Pollo, Ensalada Griega, Caviar Service, Seafood Plateau, Braised Short-Rib, Mexicana, Scallop Ceviche, Flamenkuchen, Ostrica | **+13% to +64%** |
| down | Unagui Masago, Amazonas Top, Cosmo de Pollo, Nico, Nikkori Dynamite | **−33% to −41%** |
| flat | Nevada | −2% |

🔴 **12 of 15 moved more than 25%, and the anchor fired on NONE of them** — no dish in the set states
a size, so every bit of that movement came from the schema field alone. This is the parked anchor's
failure mode repeating: **a required field perturbs every item, not only its target.** On four
single-item dishes A-conditional looked surgical; across fifteen batched dishes it is not.

**The split is systematic by dish type**, which is worse than noise: five of six sushi rolls fell
~35% while nearly every non-sushi dish rose. The one fixed point we have — Santiago's independent
cross-check putting the Salmón Roll at ~592 kcal — says the sushi drop is **wrong**. Meanwhile Tiras
de Pollo rising 505–648 → 889–987 for breaded chicken with fries looks **right**. A-conditional
trades one class of dish for another.

⚠️ **Batching is implicated and was previously untested.** Single-item, A-conditional left the Salmón
Roll at baseline (482–496). Batched with fourteen others, rolls fall by a third. Same code, different
grouping. Every earlier arm result today used one item per call.

📉 **Also visible: the baseline is very unstable in a batch** — Ostrica 215–498, Nico 655–854, Tiras
de Pollo 505–648 across three draws of identical input. Some of the "movement" above is competing
with noise of that size, and no conclusion here separates the two.

**Directions this leaves** (not prohibitions): the plate-total idea still has the strongest mechanism
evidence of anything tried — the model does know, and asking does change portioning. What is not
established is that a required field can be added without perturbing everything else. Worth trying
next: the field on a SEPARATE call keyed to items that state a size (a narrowed arm C, which never
touches the enrichment request at all), and a batched-vs-single measurement of the baseline's own
variance so future arms are judged against the right noise floor.

### 📏 THE NOISE FLOOR — median 25%, worst 88% (2026-08-11, ~$0.20). Read this before trusting any arm.

The same fifteen dishes through the **unchanged** pipeline, five times, batched. Nothing varies but
the model's own sampling — same prompt, same model, same `temperature: 0`, same seed.

| dish | kcal across 5 identical runs | spread |
|---|---|---|
| OSTRICA | 525, 205, 243, 242, 242 | **88%** |
| MEXICANA | 499, 335, 339, 362, 639 | **62%** |
| BRAISED SHORT-RIB GF | 500, 379, 501, 501, 653 | 53% |
| Nevada | 347, 514, 346, 503, 346 | 39% |
| Cosmo de Pollo | 664, 501, 681, 693, 636 | 32% |
| Nico | 867, 668, 818, 703, 705 | 26% |
| Tiras de Pollo / TAYLOR BAY | — | 25% |
| CAVIAR SERVICE | 291, 253, 232, 253, 232 | 23% |
| Nikkori Dynamite | 680, 547, 683, 670, 593 | 22% |
| FLAMENKUCHEN / SEAFOOD PLATEAU / Unagui Masago | — | 17% |
| Amazonas Top | 454, 415, 454, 448, 472 | 13% |
| **ENSALADA GRIEGA** | 195, 196, 196, 196, 196 | **1%** |

🔴 **`temperature: 0` and a fixed seed do NOT make this deterministic.** OpenAI's seed is
best-effort; these swings are what remains.

🔑 **This retro-scores the A-conditional result.** Its headline was "12 of 15 dishes moved more than
25%" — and the **median noise floor is 25%**. Re-judged against each dish's OWN noise, the real
movements are: **up** — Ensalada Griega (+64% against **1%** noise, unmistakable), Tiras de Pollo,
Caviar, Seafood Plateau, Scallop Ceviche; **down** — Unagui Masago, Amazonas Top, Nikkori Dynamite.
Ostrica, Mexicana, Flamenkuchen and Nevada were noise, and Cosmo de Pollo and Nico are borderline.
The sushi-down / non-sushi-up split is REAL but it is 5 versus 3, not 9 versus 5.

⚠️ **A defect bigger than the experiment: the SHIPPED pipeline is unstable on unweighted dishes.**
Ostrica returns 205–525 kcal for the same menu item on the same input; Mexicana 335–639. A diner
scanning the same menu twice can see a dish's calories more than double. This is in production today,
has nothing to do with the plate-total work, and is arguably the more urgent finding.

**Standing consequence for every future arm:** a change must beat **that dish's own** noise, not a
flat threshold, and three draws is too few for dishes whose spread approaches 90%. Judge per-dish or
do not judge.

### 🚨 THE INSTABILITY IS THE BATCH, NOT THE MODEL (2026-08-11, ~$0.15) — production defect, code-only fix

Same dishes, same unchanged pipeline, five draws each. The ONLY variable is whether the item was
sent alone or in a batch of fifteen.

| dish | SOLO, 1 item per call | BATCHED, 15 per call |
|---|---|---|
| OSTRICA | 173,172,172,172,177 → **3%** | 525,205,243,242,242 → **88%** |
| MEXICANA | 358,359,359,358,359 → **0%** | 499,335,339,362,639 → **62%** |
| BRAISED SHORT-RIB GF | 525,529,529,529,525 → **1%** | 500,379,501,501,653 → **53%** |
| Nevada | 460,450,463,450,463 → **3%** | 347,514,346,503,346 → **39%** |
| ENSALADA GRIEGA | 186,186,175,186,191 → 9% | 195,196,196,196,196 → 1% |

🔑 **Asked alone the model is essentially deterministic (0–3%). Batched, the same dish swings
39–88%.** Twenty to thirty times the spread, from grouping alone. `temperature: 0` and the fixed
seed hold fine for a single item; they do not survive a fifteen-item request.

🔴 **This ships today.** `ENRICH_BATCH_SIZE = 10`, so every real scan carries it. Two diners at the
same table can see a dish differ by 2×, and the RANKING they came for is built on those numbers. It
is a code-only fix — no prompt, no schema, no model change.

⚠️ **It retro-invalidates part of the same day's work.** The 15-dish wide run was batched, so
"A-conditional moved 12 of 15 dishes" was largely measuring this. The guard runs were solo and remain
trustworthy. Any arm judged on batched runs must be re-judged.

**Open question worth measuring next:** the batch-size curve. `ENRICH_BATCH_SIZE` is already tuned
down to 10 for a different reason (GPT-4o early-stopping, see the comment in `enrich.ts`). Does
stability arrive at 5, at 3, or only at 1? One item per call multiplies prompt tokens by the item
count — enrichment is ~$0.03/scan today, so the ceiling is roughly $0.30/scan — and the knee of that
curve is the whole decision.

Probe: `scripts/probe-plate-arms.ts solo|noise`. Archives: `probe-solo-vs-batch.raw.json`,
`probe-noise-floor.raw.json`.

### 🔴 THE BATCH-SIZE CURVE — MEASURED, AND IT IS A TRADE-OFF, NOT A KNOB (2026-08-12, ~$11.50)

Answers the question the entry above left open, and the answer is not the one that entry expected.
**Nothing was changed. `ENRICH_BATCH_SIZE` is still 10 and nothing was deployed.**

#### 1. The curve — stability, 15 unweighted dishes, 5 draws each, 125 calls

| | b1 | b3 | b5 | **b10 (production)** |
|---|---|---|---|---|
| median kcal spread | 4% | 12% | 7% | **35%** |
| worst dish | 45% | 49% | 76% | 79% |
| dishes within 10% | 9/15 | 7/15 | 11/15 | **2/15** |
| calls returning short | 0/75 | 0/25 | 0/15 | 0/10 |

**b10 is far worse than any smaller size.** 1 vs 3 vs 5 cannot be separated at five draws — median
favours b1, "dishes within 10%" favours b5, worst-case favours b1/b3. Do not quote a knee.

#### 2. Batch size shifts the ANSWER, not just the scatter

The finding that reframes everything. OSTRICA, five draws per size:

| b1 | b3 | b5 | b10 |
|---|---|---|---|
| 172,173,172,172,173 | 171,171,171,170,171 | 457,216,370,479,247 | 237,242,216,498,232 |

Steady at ~172 in a small batch, ~2× higher and unstable in a large one. TAYLOR BAY runs the OTHER
way: ~200 kcal at b1/b3, ~115 at b5, ~99 at b10. This is not noise around a fixed value; the batch
composition moves the estimate.

#### 3. The drop fear did not reproduce, and b10 is the one that drops

`ENRICH_BATCH_SIZE` was pinned at 10 to stop GPT-4o early-stopping. Across 125 curve calls at
1/3/5/10, not one returned short. Then the all-menu sweep found the opposite of the fear:

| | b10, 1 draw | b3, 3 draws |
|---|---|---|
| menu-runs | 10 | **30** |
| item enrichments | 460 | **1,380** |
| input order preserved | 10/10 | **30/30** |
| **genuine drops** | **16** (Polloteria wing sauces) | **0** |
| wall-clock, 10 menus | 521 s | 353 / 342 / 304 s |

**Polloteria loses 16 of 95 items at the setting running in production today.** BBQ, Ranch, Buffalo
and twelve more come back with `kcal 0, confidence low, 0 ingredients` — `fallbackEnriched`'s exact
signature — and come back correct at b3 (BBQ 39 kcal, Buffalo 107, Ranch 88). b3 is also ~35% FASTER
despite more calls.
The one item flagged in every b3 draw is `CERVEZAS Y LICORES / "PREGUNTA POR NUESTRA VARIEDAD"`, a
section header extraction captured as an item. Not a dish, correctly not enriched, identical at b10 —
a small EXTRACTION defect, logged here and not chased.
Items with zero macros are all drinks: Grey Goose, Don Julio, bottled water, americano, tea. Correct —
alcohol is deliberately out of scope and water is 0 kcal. The sweep's own gate over-flagged these;
it should exclude `category: drink`.

#### 4. 🔴 THE GATE THAT KILLED THE FIX: b3 damages accuracy on weighted dishes

Santiago's ruling was that nothing ships without evidence across every menu. That gate caught this.
8 fixtures, same oracle, same `rescore-history.ts` path, 4 runs × 3 draws:

| arm | request | failed | mean\|err\| |
|---|---|---|---|
| **B21** (published best) | `enrichBatch`, one call of 8 | 0, 2, 2, 3 / 96 | 12.1–14.1% |
| **control** | `callGptEnrich`, batch 8 | 0, 0, 2, 4 / 96 | 12.3–13.9% |
| **b3** | `callGptEnrich`, batch 3 | **13, 13, 15, 14 / 96** | **17.9–18.9%** |

The control exists because the b3 comparison changed TWO things — batch size AND the code path (B21
called `enrichBatch` directly). It reproduces B21 exactly, so **the wrapper is innocent and batch size
is the cause.** No dish was backfilled or empty in any b3 draw; this is worse model output, not a drop.

#### 5. What this means — the two defects are ONE defect

Small batches help unweighted dishes and hurt weighted ones. A single global batch size cannot win
both, so **this was never a tuning problem.**

**Hypothesis for the next session, offered as a prior and NOT as a finding:** the model calibrates
across the items in a call. Where `resolveGrams` pins a dish's grams from a printed weight, that
cross-item context helps and removing it hurts. Where the plate is GUESSED, the same context makes the
guess depend on whatever else shares the batch — which is exactly the instability. If that holds, the
batching defect and the "size is a dead channel except printed grams" defect are the same gap:
**nothing pins the plate for a dish that prints no weight.** Arm A (a required `typical_total_g`) was
built and shelved for pushing the Salmón Roll out of band; it is the shape of a fix that would address
both, and it deserves re-judging SOLO now that batched runs are known to be untrustworthy.

#### What this does NOT establish

- **No knee.** 1 vs 3 vs 5 are indistinguishable at five draws.
- **"Solo is stable" was a 5-dish selection artifact.** Across 15 dishes, five swing ≥19% sent ALONE
  (Tiras de Pollo 505–796 kcal at b1). Batch size is not the whole fix.
- **The 8-fixture benchmark structurally cannot see the instability.** `bench-macros.ts` sends all 8 in
  one call and all 8 print weights, so `resolveGrams` pins them and the plate is never guessed.
  `0–3/96 at 12%` is real but describes ONLY dishes that print a weight.
- Stability was measured on unweighted dishes from 4 menus; accuracy on 8 weighted fixtures. Neither
  covers the other's population.
- One draw at b10 in the sweep against three at b3.

#### Code, all uncommitted on `feat/forced-serving-pieces`

- `enrich.ts` — **`MAX_CONCURRENT_BATCHES = 5`**, and `callGptEnrich` now runs capped waves instead of
  one `Promise.all` over every batch. Polloteria at b3 is 19 simultaneous requests uncapped; a
  rate-limited call retries once and then `fallbackEnriched` zeroes the item, so the cost of the cap's
  absence is a WRONG scan, not a slow one. Guarded by a test that was verified to fail without it.
- `enrich.ts` — `callGptEnrich(items, key, model, batchSize?)`. Harness knob, lesson 23. Production
  passes nothing and gets `ENRICH_BATCH_SIZE`.
- `bench-pipeline.ts` — `sweep [--dry] <sizes...>` over all 10 archived menus. Repeating a size buys
  extra draws (`sweep 3 3`). Reads archived EXTRACTIONS from `caches/`, so all ten menus cost $0
  instead of re-buying OCR for six. `--dry` prices a run before sending anything.
- `bench-macros.ts` — `BENCH_BATCH_SIZE` env knob; unset, the request is byte-identical to every
  archived run. `replayDraw` now also reads a reassembled-items archive so these runs re-score for $0.
- `probe-plate-arms.ts` — `curve` arm.

Archives: `probe-batch-curve.raw.json`, `pipeline.b{10,3}.p{0,1}.<menu>.raw.json`,
`macro-bench.iter-b3batch-w{1..4}-d{0..2}.raw.json`, `macro-bench.iter-b8ctrl-w{1..4}-d{0..2}.raw.json`.
Re-derive every figure with `deno run --allow-read scripts/rescore-history.ts <runs...>`.

⚠️ **Correction to the entry above and to START-HERE: every "15 per call" figure was really 10 + 5.**
`callGptEnrich` chunks internally at `ENRICH_BATCH_SIZE`, so the 15-dish batched runs were a group of
10 plus a remainder of 5. The curve tags each dish with the group size it ACTUALLY sat in.

### 🟢 THE UNWEIGHTED ORACLE EXISTS — AND THE PIPELINE SCORES 39% ON IT (2026-08-13, ~$2)

The gap every figure in this log carried but could not measure. **The 96-point benchmark only ever
described dishes that PRINT A WEIGHT.** All 8 of its fixtures print one, so `resolveGrams` pins their
grams and the plate is never guessed. Most real menu items are unweighted and were ungated.

**Two scores now exist. NEVER merge them, and never quote one as the other.**

| score | dishes | points | population |
|---|---|---|---|
| weighted (existing) | 8 | 96 | menus that print grams — **~96% passing** |
| **unweighted (NEW)** | 6 | 24 | menus that do not — **28/72 = 39%** over 3 draws |

`scripts/fixtures/unweighted-oracle.json`, built by `scripts/unweighted-oracle-build.ts`, scored by
`scripts/bench-unweighted.ts`. Truth is a **band**, not a number: a fake point oracle silently
flatters whichever model shares its error.

| dish | mass g | kcal | protein | carb | fat | score |
|---|---|---|---|---|---|---|
| CAPRICCIOSA | 400-450 | 1101-1238 | 45-51 | 100-113 | 58-65 | **0/12** |
| CARBONARA | 250-450 | 528-950 | 14-26 | 39-69 | 35-63 | 9/12 |
| ENSALADA GRIEGA | 136-250 | 126-231 | 3-6 | 8-15 | 9-16 | 10/12 |
| TIRAS DE POLLO | 234-333 | 613-872 | 37-52 | 46-66 | 31-44 | 3/12 |
| COLIFLOR ROKA | 85-120 | 205-289 | 3-5 | 17-24 | 14-19 | **0/12** |
| Salmón Roll | 300-400 | 410-547 | 20-27 | 41-55 | 18-24 | 6/12 |

#### 🔑 Santiago's rulings — every mass band is his, none is USDA's alone

- **PRICE IS NOT EVIDENCE OF GRAMS (2026-08-13).** A draft band for COLIFLOR ROKA was argued from
  price parity — a $250 starter beside a $220 200 g dish. **Rejected outright:** *"A menu can have an
  expensive pizza of 1k+ dollars, doesn't mean it weighs 10x the size of a large pizza."* Price
  reflects margin and scarcity, never mass. Do not reintroduce it in an oracle, a prompt, or code.
- **CAPRICCIOSA 400-450 g**, overriding a USDA-derived 647-724 g.
- **Salmón Roll 300-400 g**, revised up from 250-350 the same day.
- **COLIFLOR ROKA 85-120 g** — 85 g is USDA's largest published fried-cauliflower portion.

#### ⚠️ FOUR ORACLE ERRORS, ALL CAUGHT BY THE GATE BEFORE IT JUDGED THE PIPELINE

Read this section before building any oracle entry. **Every one is the same mistake: a generic USDA
record that omits something the menu explicitly names.**

| entry | wrong record | why it was wrong | effect once fixed |
|---|---|---|---|
| CARBONARA | 'Pasta with cream sauce' (FDC 2708855) | **no meat**; menu says *"un toque de tocino"* | protein band 9-17 -> **14-26**. Pipeline's 21-23 went FAILING -> PASSING |
| ENSALADA GRIEGA | 'Salad dressing, NFS' (FDC 2710195), 44.5 g fat/100 g | **creamy**; menu says *"vinagreta balsamico"* (FDC 2710203, 21.1 g) | fat band 16-30 -> **9-16**. Pipeline's 9-12 went FAILING -> PASSING |
| CAPRICCIOSA | cheese-only 14" records | wrong **topping class** — serrano ham, artichoke, olive, mushroom is meat-and-vegetable | the design doc's [470,530] band is superseded |
| CAPRICCIOSA | chain-pizza composition kept under a thin-crust mass | rejecting a record's MASS makes its COMPOSITION suspect too | switched to FDC 2708660 thin crust; fat 10.9 -> **14.4 g/100 g** |

🔑 **The general lesson: an oracle built from generic records will fail a pipeline that is right.**
Two of the four "pipeline defects" in the first run were the oracle's fault. **Re-source before
believing any single-dish failure.** And a caveat that was CHECKED AND DISMISSED, so nobody re-opens
it: FDC 2709830 'Greek Salad, no dressing' *does* contain feta — back-solving its 2.26 g fat and 49
kcal per 100 g against plain salad vegetables implies ~10% feta.

#### 🔴 THE FINDING: a right mass with the wrong FOOD — COLIFLOR ROKA scores 0/4

The pipeline returns **25 kcal, 2 g protein, 4 g carb, 0 g FAT**. That is plain raw cauliflower.
**Zero grams of fat on a battered, deep-fried, sauced dish.** Its mass is roughly right and its
identity is completely wrong.

**Why: the description is EMPTY, and 'Roka' is defined only on ANOTHER LINE of the same menu** —
`CAMARÓN ROKA … capeado y bañado en nuestro aderezo roka a base de chipotle`. Enrichment never sees
that line. A human reading the menu infers it in seconds.

⚠️ **A draft of this entry claimed the dish "already passes, because the pipeline says 85 g". It
scores 0/4.** Mass is NOT scored — the four macros are. A right-looking weight with a raw-vegetable
composition fails everything. Never infer a dish's score from its implied mass.

🔗 **This connects to the batching defect and points the OTHER way.** Batching showed that what shares
a call CHANGES an answer, and small batches were preferred; here, cross-item context from the same
menu would have HELPED. Both are the same question — what the model sees alongside an item — and any
arm that isolates items further will make this dish worse.

#### 🔴 FAT IS THE WEAKEST MACRO — 5 of 6 dishes

| dish | pipeline fat | band |
|---|---|---|
| COLIFLOR ROKA | **0 g** | 14-19 |
| CAPRICCIOSA | 20 g | 58-65 |
| TIRAS DE POLLO | 20-22 g | 31-44 |
| CARBONARA | 25-29 g | 35-63 |
| Salmón Roll | 25 g (**high**) | 18-24 |
| ENSALADA GRIEGA | 12 g ✅ | 9-16 |

Carbs pass almost everywhere. This is the same shape as the known Coleslaw regression where B4
under-portions dressing, and it is now measured rather than suspected.

#### What this does NOT establish

- **6 dishes, 3 draws, 4 menus.** A 24-point score moves 4 points per dish; one re-ruled band swings
  the headline. Do not report a 1-point difference between arms as a result.
- **The bands are Santiago's judgement anchored on USDA, not measurements.** Two were revised within
  24 hours. An arm that fails by a little may be meeting a band that is a little wrong.
- **ENSALADA GRIEGA's remaining protein failure (8 g vs 3-6) is the narrowest in the set** and is
  believed genuine — ~3.2 g/100 g against USDA's undressed 2.75 — but do not act on it alone.
- Nothing here re-scores the 96-point weighted number, which is unchanged.
- **Arm A cannot fix COLIFLOR ROKA.** Arm A supplies a plate WEIGHT; this dish's weight is already
  right and its FOOD is wrong. Judge Arm A on Capricciosa and Tiras de Pollo, not on the set total.

#### Tools added

- `scripts/unweighted-oracle-build.ts` — writes the oracle from approved mass bands. Bands are
  computed by `deriveBands`, never by hand, so calories stay Atwater-consistent at both endpoints and
  no one has to trust an agent's arithmetic. Refuses to write if `validateEntry` fails.
- `scripts/bench-unweighted.ts` — the 24-point score. Enriches each dish **inside its own menu** at
  the deployed `ENRICH_BATCH_SIZE`, because the batch-size curve proved a 6-item call is a regime
  production never runs. **Excludes backfilled items rather than scoring them 0/4** — the first run
  scored an API timeout as a catastrophic salad estimate.
- `scripts/unweighted-portions.ts` — `--search <terms>` finds FDC candidates instead of guessing ids,
  and every record now prints its per-100 g composition. The committed candidate list contained a
  canned-orange id under COLIFLOR ROKA and cheese-fries under TIRAS DE POLLO, which is what guessing
  ids costs. Writes nothing; selection stays Santiago's.

### ❌ ARM A, SCORED AGAINST THE ORACLE AT LAST — NET WORSE, DO NOT SHIP (2026-08-13, ~$2)

Arm A (a required `typical_total_g` for items with no printed weight) was built on 2026-08-11 and
shelved on a single-dish impression. It now has a number, and the number is bad.

**baseline 28/72 (39%) → Arm A 15/72 (21%).** Same menus, same batching, same oracle; the ONLY
difference is the prompt. Arm A was chunked at `ENRICH_BATCH_SIZE` for exactly this reason —
`armA()` otherwise sends every unweighted item in one call, which is a regime neither production nor
the baseline runs.

| dish | baseline | Arm A | Δ | what happened |
|---|---|---|---|---|
| CAPRICCIOSA | 0/12 | **3/12** | **+3** | 524 → **799 kcal** (band 1101-1238). Carb entered band |
| COLIFLOR ROKA | 0/12 | 0/12 | 0 | 25 → **116 kcal**, fat 0 → 8 g. Still 0/4 but materially closer |
| TIRAS DE POLLO | 3/12 | 3/12 | 0 | same score, DIFFERENT failures — protein 33 → **71** (band 37-52), carb left the band |
| CARBONARA | 9/12 | 6/12 | **-3** | overshot: protein 31 (band 14-26), carb 72 (band 39-69) |
| Salmón Roll | 6/12 | **0/12** | **-6** | now UNDERshoots: 377-384 kcal (band 410-547) |
| ENSALADA GRIEGA | 10/12 | **3/12** | **-7** | overshot: 241-271 kcal (band 126-231), fat 18-21 (band 9-16) |

#### 🔑 Why it fails, and it is not "it scales everything up"

**Arm A REPLACES the ingredient-sum mass with a guessed plate mass.** It is a swap, not a multiplier.
Where the model's plate guess beats the ingredient sum it helps (Capricciosa +275 kcal, Coliflor
+91); where the ingredient sum was already the better estimate it destroys it — and the Salmón Roll
moved DOWN, which no scaling story explains. **The plate guess is not reliably better than the
decomposition.** Any future arm must beat the ingredient sum per dish, not merely restore size
sensitivity.

✅ **This CONFIRMS the 2026-08-11 shelving decision, which was made on an impression.** That entry
read "restores size response but pushed the Salmón Roll out of band". Both halves reproduce, and the
Salmón Roll effect is now quantified at -6 points.

#### ⚠️ Two predictions made BEFORE the run, both wrong. Recorded so the reasoning is not reused.

1. **"Arm A cannot fix COLIFLOR ROKA — its mass is right and its FOOD is wrong."** Half wrong. It did
   not fix it (still 0/4) but it moved it a long way: 25 → 116 kcal and fat 0 → 8 g. Asking for a
   plate weight also improved the ingredient list, so the anchor is not purely a mass mechanism.
2. **"Realistic ceiling ~+10 points; the risk is pushing the Salmón Roll further over."** The
   direction was wrong: Arm A pushed the roll UNDER its band, not over. Predicting the SIGN of an
   arm's error from a previous arm's behaviour is not reliable.

#### The arm worth measuring next — and it is largely predictable for $0 first

**A-conditional** asks for the plate weight always but APPLIES it only when the menu STATES a size
(`statesSize()`, food-agnostic). Of these six dishes only CAPRICCIOSA states one ("28 cm"). If the
non-anchored dishes reverted to baseline behaviour it would score ~**31/72** — Arm A's Capricciosa
plus the baseline's other five. ⚠️ **That is an ESTIMATE, not a result:** A-conditional still asks
for `typical_total_g` on every unweighted item, which changes the ingredient list even where the
anchor is not applied, and it splits batches differently. Measure it; do not quote 31.

**Do not re-run plain Arm A.** Archives: `unweighted.A.<menu>-d{0,1,2}.raw.json`,
`unweighted.baseline.<menu>-d{0,1,2}.raw.json`.

### 🟡 A-CONDITIONAL — THE TOTAL SAYS "NOISE", THE PER-DISH SAYS SOMETHING REAL (2026-08-13, ~$2)

| dish | states a size? | baseline | Arm A | **A-cond** |
|---|---|---|---|---|
| CAPRICCIOSA | **yes, "28 cm"** | 0/12 | 3/12 | 2/12 |
| CARBONARA | no | 9/12 | 6/12 | **12/12 — 4/4 on every draw** |
| ENSALADA GRIEGA | no | **10/12** | 3/12 | **3/12** |
| TIRAS DE POLLO | no | 3/12 | 3/12 | 3/12 |
| COLIFLOR ROKA | no | 0/12 | 0/12 | 0/12 |
| Salmón Roll | no | 6/12 | 0/12 | **10/12** |
| **TOTAL** | | **28/72 (39%)** | 15/72 (21%) | **30/72 (42%)** |

**28 → 30 is inside the noise of 6 dishes × 3 draws. Do not call A-conditional an improvement.**

#### 🔑 THE FINDING: "ask but do not apply" DOES NOT ISOLATE ANYTHING

A-conditional's whole premise is that requesting `typical_total_g` is harmless where the anchor is
not APPLIED. **Five of these six dishes state no size, so their anchor was never applied — and three
of them moved hard anyway:**

| dish | baseline → A-cond | anchor applied? |
|---|---|---|
| CARBONARA | 9 → **12** | **no** |
| Salmón Roll | 6 → **10** | **no** |
| ENSALADA GRIEGA | 10 → **3** | **no** |

**Merely ASKING for a plate weight rewrites the ingredient list.** The mass anchor is not the
mechanism — or not the only one. Any future arm that assumes a prompt addition is inert where its
output goes unused is assuming something this run falsifies. Per-draw scores were stable within each
arm (Carbonara 4,4,4; Griega 1,1,1; Salmón 3,4,3), so these per-dish moves are real even though the
total is not.

⚠️ **A PREDICTION THAT WAS RIGHT FOR THE WRONG REASON — the most dangerous kind.** Before the run this
log estimated "~31/72, being Arm A's Capricciosa plus the baseline's other five". **The total came in
at 30.** Every component of that reasoning was wrong: Carbonara beat its baseline by 3, the Salmón
Roll by 4, and Griega collapsed by 7. The offsetting errors summed to almost exactly the predicted
number. **A matching headline is not confirmation of a mechanism.** Always read the per-dish table.

#### The pattern worth carrying forward — a PRIOR, not a finding

Asking for a plate weight helped the two DENSE dishes (pasta 9→12, sushi 6→10) and wrecked the one
LOW-DENSITY dish (salad 10→3, overshooting to 271-296 kcal against a 126-231 band). Capricciosa, the
only anchored dish, barely differed between A and A-cond (3 vs 2), so **the anchor itself did little;
the ASK did the work.** If density is the axis, an arm that requests a plate weight only for dishes
that are not salad-shaped is the next thing to try — but that needs a food-agnostic detector, and
this project has already ruled that putting food names in the nutrition step is measured harmful.

#### Unmoved by every arm

**COLIFLOR ROKA 0/12 in all three.** Nothing that supplies a plate weight can fix a dish whose weight
is already right and whose FOOD is wrong. Its description is empty and "Roka" is defined on another
line of the menu. **TIRAS DE POLLO 3/12 in all three**, failing on different fields each time.

Archives: `unweighted.A-cond.<menu>-d{0,1,2}.raw.json`.

### 🔧 THE TWO ZEROING BUGS ARE FIXED, AND THE NO-DESCRIPTION POPULATION IS CHARACTERISED (2026-08-13, $0)

Both fixes are code-only, uncommitted, **not deployed**. `ENRICH_BATCH_SIZE` is still 10.

#### The rescue pass — one fix, both bugs

Both bugs ended the same way: `fallbackEnriched` zeroes every macro, and the user sees **0 kcal**,
which is not a near-miss but a visibly broken row that also corrupts the goal ranking.

| bug | before |
|---|---|
| model drops items from a large batch | Polloteria lost **16 of 95** — the wing sauces — on BOTH attempts |
| batch exceeds `MODEL_TIMEOUT_MS` (120 s) | whole batch zeroed; fired twice during this session's own runs |

**The old retry re-rolled the same dice: it re-sent the WHOLE batch and accepted whatever came back,
however short.** `enrichBatchWithRetry` now re-asks for **only the still-missing items, in batches of
3** (`ENRICH_RESCUE_BATCH_SIZE`). Those 16 sauces come back correct at 3 (BBQ 39 kcal, Buffalo 107,
Ranch 88) because they are droppable only in company — short, near-identical option names that a
large batch collapses. The same path covers the timeout, since a third of a batch answers well inside
a window the whole batch blew.

⚠️ **Batch 3 is measurably WORSE for accuracy than 10 (13-15/96 vs 0-4/96), which is exactly why the
main path stays at 10.** The rescue is not a reversal of that ruling: a rescued item's alternative is
zeroes, and slightly-off beats 0 kcal. Do not read this as licence to lower `ENRICH_BATCH_SIZE`.

`missingFrom()` matches by name the way `reassembleEnriched` does — one response consumed per input —
so a menu listing the same name twice needs two responses. Two tests, both verified to FAIL when the
rescue is removed. 32 tests pass.

#### 🔴 What an item with NO DESCRIPTION gets — measured on 460 real archived items

| macro-relevant items | n | ingredients | kcal | fat |
|---|---|---|---|---|
| has a description | 259 | **4.87** | 550 | 27.0 g |
| **no description** | 84 | **1.93** | 249 | 12.4 g |

**76% of undescribed items get ≤2 ingredients, against 8% of described ones.** That is COLIFLOR
ROKA's failure exactly — a 2-ingredient decomposition at half the calories and half the fat.

⚠️ **Correcting a figure stated earlier in this session: "40% of items have no description" counted
DRINKS, which are out of scope.** For macro-relevant categories it is **~28% (99 of 358)**, and the
distribution is what matters:

| category | share with no description |
|---|---|
| food | 29 of 283 — **10%** |
| **side** | 28 of 33 — **85%** |
| **dessert** | 18 of 18 — **100%** |
| other | 24 of 24 — 100% |
| drink (out of scope) | 85 of 102 |

⚠️ **This is CORRELATIONAL and must not be quoted as proof of error.** An undescribed dish may
genuinely be simpler — a side of fries against a composed entrée. COLIFLOR ROKA is the only member of
this population with an oracle, and there the estimate is definitively wrong (0/12). **Widening the
unweighted oracle with undescribed sides and desserts is what would settle it**, and it is the
highest-value use of Santiago's ruling time.

🔑 **Why this matters more than the plate-weight work:** two arms aimed at dish WEIGHT both failed to
beat baseline, and the dishes they could not move (COLIFLOR ROKA 0/12 in all three arms) fail on dish
IDENTITY instead. A dish the model cannot identify cannot be weighed correctly either.

### 🛑 THE PLATE-WEIGHT DIRECTION IS DEAD — PROVEN AT $0 (2026-08-13, loop iteration 1)

`scripts/sim-plate-rescale.ts` replays archived runs: it takes the BASELINE ingredient list and
rescales it to Arm A's plate weight through the real `sumIngredientMacros`. This isolates the plate
anchor from Arm A's collateral prompt damage — the arm Arm C tried to be — for **$0**.

| threshold (apply plate when sum disagrees by ≥) | x1.00 | x1.15 | x1.30 | **x1.50** | x2.00 | never (=baseline) |
|---|---|---|---|---|---|---|
| TOTAL /72 | 22 | 22 | 24 | **31** | 28 | **28** |
| **CAPRICCIOSA** | **0** | **0** | **0** | **0** | **0** | **0** |

The best threshold gains +3, which this log's own noise rule calls nothing. **And the pizza — the dish
that motivated the entire phase — scores 0 in EVERY column.**

#### Why no plate weight can ever fix it

| pizza total | result | band |
|---|---|---|
| 290 g (baseline's own sum) | 524 kcal | — |
| 400 g (BOTTOM of the mass band) | 722 kcal | 1101-1238 |
| **450 g (TOP of the mass band)** | **812 kcal** | 1101-1238 |

**Correct the mass to the top of its verified range and it is still 26% low.** The model's pizza is
**1.81 kcal/g**; USDA thin-crust meat-and-vegetable is **2.75 kcal/g**. To reach the band with these
proportions the pizza would have to weigh **608 g**, well above its own band.

Its decomposition, from the archive: `100 g crust, 50 g tomato sauce, 30 g cheese, 30 g jamón
serrano, 30 g artichoke, 20 g olives, 30 g mushrooms`. **30 g of cheese on a 28 cm pizza** is a
standalone reference serving of cheese, not the amount on a pie.

🔑 **RESCALING PRESERVES PROPORTIONS, SO NO TOTAL CAN FIX WRONG PROPORTIONS.** The defect is not that
the pipeline gets the plate SIZE wrong. It is that the plate is assembled from standalone reference
servings, giving a dish that is too LEAN per gram. Size was the visible symptom.

⚠️ **This retires the plate-weight family: Arm A (measured 15/72), A-conditional (30/72), Arm C (never
scored), and any threshold variant (simulated, best 31/72). Do not open another one.**

#### What this does NOT establish

- Only the pizza is proven un-fixable by mass. CARBONARA gains 6→9 at x1.50 and COLIFLOR 0→3 at
  x1.30, so the plate anchor does help some dishes — just not enough, and not the motivating one.
- The simulation reuses Arm A's plate weights, produced by a prompt that also rewrote the ingredient
  list. A real arm would have to source the plate weight some other way.
- **B21's standard-reference-amount rule is NOT falsified.** It is what took the WEIGHTED score to
  ~96%, where `resolveGrams` pins the total and only proportions matter. The evidence here is that
  the same rule under-assembles a dish when nothing pins the total.

### ✅ ARM P — PROPORTIONS, NOT SIZE. 28/72 → 38/72 (2026-08-13, ~$2, loop iteration 2)

The first arm to beat baseline by more than noise. It follows directly from the simulation above:
the defect is that an unweighted dish is ASSEMBLED from standalone reference servings, so it comes
out too lean per gram — size was the symptom.

**One sentence, appended for UNWEIGHTED items only**, overriding B21's "do not estimate by eye how
much is on the plate": give `typical_serving_g` as *the amount of that ingredient actually present in
one order of this item as it is served*. Schema untouched — it changes what a number MEANS, not its
shape. Weighted items keep today's request byte-identically.

| dish | baseline | Arm A | A-cond | **Arm P** |
|---|---|---|---|---|
| CAPRICCIOSA | 0/12 | 3/12 | 2/12 | **3/12** |
| CARBONARA | 9/12 | 6/12 | 12/12 | **12/12 — 4/4 every draw** |
| ENSALADA GRIEGA | 10/12 | 3/12 | 3/12 | **12/12 — 4/4 every draw** |
| TIRAS DE POLLO | 3/12 | 3/12 | 3/12 | 3/12 |
| COLIFLOR ROKA | **0/12** | 0/12 | 0/12 | **3/12 — first arm to move it** |
| Salmón Roll | 6/12 | 0/12 | 10/12 | 5/12 |
| **TOTAL** | **28/72** | 15/72 | 30/72 | **38/72 (53%)** |

Per-draw scores are stable (Carbonara 4,4,4; Griega 4,4,4; Coliflor 1,1,1), so this is not one lucky
draw. The pizza moved 524 → 766-869 kcal and its CARB now lands in band.

⚠️ **Not a repeat of the falsified iter-b1..b13.** Those asked for a gram figure FITTED to a printed
weight and the model back-solved the arithmetic (every gram a multiple of 5). Here there is no target
to fit to — these items print no weight, which is the entire population the arm addresses.
**B21 remains correct where a printed weight pins the total; this overrides it only where nothing does.**

#### 🚨 THE RISK THAT BLOCKS SHIPPING, AND THE BENCHMARK CANNOT SEE IT

Arm P splits enrichment into TWO requests — weighted items in one, unweighted in another. The prompt
for weighted items is byte-identical, **but their BATCH COMPOSITION changes**: today a weighted dish
sits in a batch of 10 mixed items, and under Arm P it would sit only with other weighted items.
**The 2026-08-12 curve measured that batch composition MOVES the answer.**

**The 96-point benchmark is structurally blind to this** — all 8 fixtures print weights, so they are
already batched together there and the split is invisible. A clean 96-point score after this change
would be evidence of nothing. Measuring it needs a weighted dish scored inside a real mixed menu,
which no current harness does.

#### What this does NOT establish

- 6 dishes, 3 draws. +10 is well outside this log's noise rule, but two dishes (TIRAS DE POLLO,
  CAPRICCIOSA) did not improve at all and one regressed (Salmón Roll 6→5).
- **The pizza is still 0/4 on calories, protein and fat** — 766-869 against 1101-1238. Arm P closed
  roughly half the gap that no plate weight could close at all, and did not close it.
- Nothing here tests the deployed path: production has no weighted/unweighted split today.

### ⏸️ LOOP HALTED — OPENAI CREDITS EXHAUSTED (2026-08-13, loop iteration 3)

**Arm PF never ran.** The first unweighted call returned `429 insufficient_quota /
credit_balance_exhausted`. **No archives were written, so there is NO partial result to interpret and
nothing to re-score.** Its hypothesis is untested, not falsified.

**Resume here.** `deno run --allow-net --allow-env --allow-read --allow-write --env-file=.env.local
scripts/bench-unweighted.ts 3 PF` once the account has credit. The arm is built, typechecked and
registered in `ARM_RUNNERS`; nothing needs writing first.

**Arm PF's hypothesis, unchanged by the halt:** every dish Arm P still fails is FAT-LOW — pizza 30 g
against a 58-65 band, chicken-and-fries 20 against 31-44, a battered deep-fried vegetable **5 against
14-19**. `ENRICH_PROMPT` step 2 already says "fat absorbed or added in cooking counts", but it is
folded into a per-100 g composition figure the model evidently reports at plain-food values. PF adds
one sentence asking for that fat to be listed as **its own ingredient** with the quantity retained.

**Loop state at halt:** 3 iterations, ~$2 spent (iteration 1 was a $0 simulation, iteration 3 bought
nothing). Best arm is **P at 38/72 (53%)** against a 28/72 baseline. The $15 loop budget was never
approached — the account ran dry, not the budget.

### 🟡 ARM PF — COOKING FAT IS NOT THE LEVER. 37/72, no better than P's 38 (2026-08-13, ~$2, iteration 3)

Arm P plus one sentence asking for absorbed/added fat as its own ingredient.

| dish | Arm P | Arm PF |
|---|---|---|
| TIRAS DE POLLO | 3/12 | **7/12** (fat 20 -> 28-35 g) |
| ENSALADA GRIEGA | 12/12 | **8/12** (fat 18-19 against a 9-16 band) |
| CAPRICCIOSA | 3/12 | 3/12 — **unmoved**, fat 29 against 58-65 |
| COLIFLOR ROKA | 3/12 | 3/12 — **unmoved**, fat 3-5 against 14-19 |
| **TOTAL** | **38/72** | **37/72** |

It helps a fried dish and overshoots a salad by the same margin; they cancel. **Keep Arm P, drop PF.**
🔑 It also rules something out: the pizza and the cauliflower did not move, so **their fat gap is not
cooking fat.** For the pizza it is cheese quantity; for the cauliflower it is that the model never
learns the dish is battered at all.

#### 🔬 $0 DIAGNOSTIC — Arm P fixes the TOTAL and leaves the PROPORTIONS wrong

Archived Arm P decompositions. The pizza's mass is now **410 g, inside its 400-450 band**, and it
still returns 869 kcal against 1101-1238 — 2.12 kcal/g against the band's 2.75.

| CAPRICCIOSA under Arm P | | Salmón Roll under Arm P | |
|---|---|---|---|
| pizza crust | 200 g (49%) | arroz | 100 g (38%) |
| **mozzarella** | **50 g (12%)** | salmón | 50 g (19%) |
| jamón serrano | 30 g (7%) | queso crema | 30 g (12%) |
| **artichoke + mushroom + olive** | **130 g (32%)** | aguacate + surimi + pepino | 80 g (31%) |

**Every topping gets a ~30-50 g standalone serving regardless of what the dish carries**, so a third
of the pizza is near-zero-calorie vegetables (artichoke F0.2, mushroom F0.5). The roll's rice is 38%
where the form is nearer 50%, and its CARB is exactly what fails. The calorie-dense structural
component is under-assembled and the garnishes over-assembled.

⚠️ COLIFLOR ROKA is a different failure and must not be pooled with these: Arm P made it **230 g of
plain cauliflower** — mass now ABOVE its 85-120 band while calories stay at 106 against 205-289. No
proportion rule fixes it; the model never learns the dish is battered and fried, because the
description is empty and "Roka" is defined on another line of the menu.

### 🔴 ARM PD FAILS (30/72) AND THE PIZZA'S OWN BAND IS WRONG — LOOP HALTED FOR A RULING (2026-08-13, ~$2, iteration 4)

Arm P plus a sentence pushing the structural body UP and scattered components DOWN.

| dish | Arm P | Arm PD |
|---|---|---|
| Salmón Roll | 5/12 | **0/12** |
| ENSALADA GRIEGA | 12/12 | 10/12 |
| CARBONARA | 12/12 | 11/12 |
| CAPRICCIOSA | 3/12 | 3/12 |
| **TOTAL** | **38/72** | **30/72** |

Pushing garnishes down is wrong for a dish whose "garnishes" ARE the substance — the roll lost its
salmon, avocado and cream cheese and fell out of band on all four macros. **Arm P stands as the best
arm; PF (37) and PD (30) both failed to improve on it.**

#### 🔑 THE CLUE: the pizza is IMMOVABLE, which is what exposed the band

| arm | CAPRICCIOSA kcal, 3 draws | fat |
|---|---|---|
| P | 869, 766, 851 | 24-30 |
| PF | 851, 835, 835 | 29 |
| PD | 851, 833, 835 | 29 |

**Three different prompt sentences moved it essentially nowhere.** A dish that will not move under any
instruction is usually a dish the model is confident about — so the band was re-checked, and it is
sourced wrong.

**The composition came from FDC 2708660, `Pizza with meat and vegetables, FROM FROZEN, thin crust`.
There is a restaurant record: FDC 2708663, `…FROM RESTAURANT OR FAST FOOD, thin crust`.**

| record | protein | carb | **fat** | kcal/100 g |
|---|---|---|---|---|
| 2708660 frozen (in the oracle now) | 11.3 | 25.1 | **14.4** | **275** |
| **2708663 restaurant (correct)** | 11.6 | 26.6 | **9.87** | **242** |

Frozen pizza carries **46% more fat per 100 g** than restaurant pizza. At Santiago's ruled 400-450 g
the band would move from **1101-1238 kcal / F58-65** to roughly **967-1087 kcal / F40-44**, and the
pipeline's CARB (107 g) would land in band.

⚠️ **NOT APPLIED. Changing an oracle band is Santiago's ruling alone.** Recorded for his decision.

#### 🚨 THIS IS THE FIFTH ORACLE ERROR OF ONE CLASS — read before sourcing any band

Every one is a USDA record that is the right FOOD and the wrong VARIANT:

| # | entry | wrong record | the variant that mattered |
|---|---|---|---|
| 1 | CARBONARA | pasta with cream sauce | **no meat**; menu says *tocino* |
| 2 | ENSALADA GRIEGA | salad dressing NFS | **creamy**, not *vinagreta* |
| 3 | CAPRICCIOSA | 14" cheese-only | wrong **topping class** |
| 4 | CAPRICCIOSA | chain regular crust | wrong **crust** |
| 5 | CAPRICCIOSA | thin crust **from frozen** | wrong **venue** |

🔑 **FNDDS encodes venue, crust, preparation and topping class as SEPARATE records, and picking the
wrong axis moves a band by 30-46%.** Three of the five are the same dish, each found only after the
previous fix. **Before trusting any single-dish failure, search FDC for every variant of that food and
justify the axis chosen.** Two of the first four were fixed and the pipeline immediately went from
failing to passing — the oracle was wrong, not the model.

### ✅ THE PIZZA BAND IS CORRECTED — AND IT DID NOT RESCUE THE PIZZA (2026-08-16, $0, Santiago's ruling)

**Santiago ruled the correction in. Applied, and every arm re-scored for $0 by replaying archives.**

`CAPRICCIOSA`'s composition moved from FDC 2708660 `…FROM FROZEN, thin crust` to FDC 2708663
`…FROM RESTAURANT OR FAST FOOD, thin crust`. Verified against the FDC API on the day, not taken from
this log. The whole FNDDS grid was listed before choosing: frozen thin/medium/thick are ONE identical
record (276 kcal/100 g), restaurant splits by crust (thin 241, medium 248, thick 259). Topping class
re-checked against the menu — *"Jamón serrano, alcachofa, aceituna negra y champiñón"* is meat AND
vegetables. Mass band unchanged at Santiago's ruled 400–450 g.

| | protein/100 g | carb/100 g | fat/100 g | kcal/100 g |
|---|---|---|---|---|
| 2708660 frozen (was) | 11.3 | 25.1 | **14.4** | 276 |
| **2708663 restaurant (now)** | 11.6 | 26.6 | **9.87** | 241 |

Band: **1101–1238 kcal / P 45–51 / C 100–113 / F 58–65** → **967–1087 / P 46–52 / C 106–120 / F 39–44**.

#### 🔴 THE RESULT IS NOT WHAT THIS LOG PREDICTED — READ BEFORE QUOTING THE OLD NUMBERS

The 2026-08-13 entry predicted the correction would land the pipeline's carb in band and improve the
pizza. **It did not improve anything, and it cost Arm P a point.**

| arm | old band | **corrected band** |
|---|---|---|
| baseline | 28/72 | **28/72** |
| **P** | **38/72** | **37/72** |
| PF | 37/72 | **37/72** |
| PD | 30/72 | **30/72** |
| A-cond | 30/72 | **28/72** |
| A | 15/72 | **12/72** |

**Why P lost a point:** the carb band moved UP (100–113 → 106–120), and P's low draw of 100 g carb
fell OUT of it. The fat band moved DOWN (58–65 → 39–44), which should have helped — but the pipeline
returns 24–30 g fat, still below even the corrected floor. The prediction looked at PD's carbs
(106/107/110, in band under BOTH readings) and generalised from the wrong arm.

🔑 **P AND PF ARE NOW TIED AT 37/72, and that is the finding.** P's one-point lead was inside the
oracle's own error. They are not equivalent — they fail differently, which is what to design against:

| dish | Arm P | Arm PF |
|---|---|---|
| CARBONARA | 12/12 | 12/12 |
| ENSALADA GRIEGA | **12/12** | 8/12 |
| TIRAS DE POLLO | 3/12 | **7/12** |
| CAPRICCIOSA | 2/12 | 3/12 |
| COLIFLOR ROKA | 3/12 | 3/12 |
| Salmón Roll | **5/12** | 4/12 |

⚠️ **The pizza is still the set's worst dish under every arm** and the correction did not change that.
Its calories run 766–869 against a 967–1087 band — still low, still the assembly problem, now measured
against a band whose provenance is finally right.

#### 🧰 `--replay` — an oracle correction now costs $0 to propagate

`scripts/bench-unweighted.ts` gained `--replay`, which scores ARCHIVED responses instead of buying new
ones. It calls no API (run it without `--allow-net` and that is enforced, not promised).

```bash
deno run --allow-read --allow-env --env-file=.env.local \
  scripts/bench-unweighted.ts 3 <baseline|P|PF|PD|A|A-cond> --replay
```

🔑 **It was validated before being trusted:** replaying against the OLD band reproduced every
previously published figure exactly — 28 / 38 / 37 / 30 / 15 / 30. A replay harness that cannot
reproduce the number it is replacing is not evidence of anything.

#### ⚠️ A TEST GUARD IS RED, AND IT IS A FALSE POSITIVE (pre-existing, not from this change)

`deno test --allow-all scripts/ supabase/` is now **360 passed | 2 failed**, not the 337|1 these docs
quote. `scripts/tile-cut_test.ts` is the known-ignorable one. The second,
`macro-measure_test.ts` → *"only macro-measure.ts knows the archive eras"*, fires because
`scripts/unweighted-oracle.ts` and `scripts/unweighted-oracle-build.ts` contain the string
`protein_per_100g` as an ORACLE COMPOSITION FIELD — not as archive-era detection, which is what the
guard exists to prevent. Both files arrived with the 2026-08-13 unweighted oracle and the failure has
been red since; nobody recorded it. **Left red deliberately: narrowing a measurement guard is a
judgement call (lesson 28) and belongs to Santiago, not to a session doing something else.**

### 🧪 SAUCE DECOMPOSITION PROBE — IT WORKS, AND THE INSTRUMENT CANNOT SEE THE REAL BUG (2026-08-16, ~$0.10)

**Origin: Santiago, reading a raw dump — "chimichurri you returned as 30 g but in reality it's 3 to 5 g."**
Chasing that found a defect the 96-point benchmark is structurally blind to, and then a second one.

#### 🔍 THE $0 AUDIT THAT CAME FIRST — the model is not weak on sauces, it is weak on MIXTURES

10 real menus, 444 enriched items, every ingredient matched against its FNDDS record:

| kind of ingredient | model / USDA | n |
|---|---|---|
| a SINGLE food (olive oil, butter, mayonnaise) | **1.00x — exact** | 6 names, 16 obs |
| a MIXTURE (pesto, caesar, ranch, garlic sauce) | **0.69x** | 11 names, 21 obs |
| HOUSE-named (chimichurri, chemita, aderezo) | flat 15–20 g fat, **protein = 1 on 8 of 12** | 12 names |

A mixture's per-100 g figure is a CALCULATION over its parts; a single food's is knowledge. This
pipeline has measured four times (B4, B10, B12, B21) that the model supplies knowledge well and
arithmetic badly. `protein = 1` on eight house sauces is the filler tell.

#### THE ARM: list the single foods, do not state the mixture

Food-agnostic by construction — it names a KIND of component, never a food, so the step-2 guard in
`enrich_test.ts` stays satisfied. `scripts/probe-plate-arms.ts sauce`. Each sauce sent as its OWN
item, one per call, 3 draws, both arms.

| sauce | USDA fat/100 g | baseline | **decomposed** | |
|---|---|---|---|---|
| Pesto | 59.2 | 12–13 (0.22x) | **56–61 (1.01x)** | ✅ 4.6x correction, near exact |
| Caesar dressing | 57.9 | 28–41 (0.56x) | **54–55 (0.94x)** | ✅ |
| Ranch dressing | 44.5 | 21–23 (0.50x) | **36–37 (0.81x)** | ✅ |
| Garlic sauce | 74.0 | 58 (0.78x) | **42 (0.56x)** | ❌ regressed |
| Alfredo sauce | 15.0 | 16–47 (2.46x) | **45 (3.00x)** | ❌ but see below |
| **Barbecue sauce** (control) | 0.63 | 0–1 | **0–1** | ✅ held |
| **Soy sauce** (control) | 0.57 | 0 | **0** | ✅ held |

🔑 **THE CONTROLS ARE THE POINT.** A sentence that merely inflated fat would have raised barbecue
and soy too. They did not move, so the arm is discriminating, not pushing.

⚠️ **Alfredo's "regression" is probably the TARGET's fault, not the arm's** — FNDDS `Alfredo sauce`
is 15 g fat/100 g, which is a diluted as-eaten record; a restaurant alfredo is butter + cream +
parmesan and the arm's 45 is the more believable number. **Not corrected: picking a different record
is Santiago's ruling.** This is the sixth time a variant has been suspect (see the pizza).

#### 🔴 THE INSTRUMENT'S BLIND SPOT — the finding that matters most

**Chimichurri did not move: 37–42 baseline, 36–41 decomposed.** But inside a real menu it returns
**15 g fat/100 g with protein 1**. Same model, same prompt, same sauce.

🔑 **A sauce sent as its OWN item already gets decomposed — the failure only appears when the sauce is
ONE INGREDIENT INSIDE A DISH.** So this probe validated the sentence on sauces that were already
being decomposed, and could not test the case that motivated it. Standalone-vs-in-dish is the same
context effect the 2026-08-12 batch curve found, one level down.

**The arm is NOT yet judged.** What it needs is a probe on real menu items that CONTAIN these sauces,
comparing the sauce's fat as an ingredient. Cheap (~$0.10) and it is the next step.

⚠️ **SYNTHETIC ITEMS — do not quote any figure here as a menu-level rate** (the 2026-08-09 lesson).

#### Accompaniment rulings recorded this session (Santiago)

| accompaniment | was | **ruled** | basis |
|---|---|---|---|
| chimichurri | 30 g | **15 g** | USDA spooned-on-food amounts (tablespoon 16–17 g, sandwich guideline 17 g). The 30 g the model returns is USDA's **dipping-container** portion |
| baguette | 45 g | **15 g** | one slice, from USDA's 324 g / 22" baguette = ~15 g per inch |
| beans | 80 g | **25–35 g** | **Santiago's judgement.** USDA publishes 130 g but that is beans AS THE FOOD; there is no published side-of-a-plate portion, and the composite recipes give none either. Recorded as judgement, NOT as USDA-backed |

⚠️ **A weight fix ALONE makes sauces worse, and that is why these move together:** chimichurri's two
errors currently cancel — 2x too heavy, 3.8x too lean. Halving the grams without fixing the
composition takes it from 48 kcal to 24 against a ~79 kcal target.

### ❌ ARM S IS IGNORED INSIDE A DISH — WORDING IS NOW 0 FOR 5 (2026-08-16, ~$0.15)

**The sentence that fixed a standalone sauce does nothing when the sauce is an ingredient.**
10 real dishes read from the archives, 3 draws, solo calls, `probe-plate-arms.ts sauce-dish`.

The proof is one dish, and it is unambiguous:

| | ingredients returned |
|---|---|
| baseline, NEW YORK | `beef steak 200 g / fat 20` + **`chimichurri sauce 30 g / fat 15`** |
| **ARM S**, NEW YORK | `New York steak 250 g / fat 20` + **`Chimichurri sauce 30 g / fat 15`** |

Identical treatment of the sauce. Same 30 g, same 15 g fat/100 g, no decomposition. CESAR likewise
kept `aderezo cesar de la casa` whole; `Dedos De Queso` kept `ranch dressing 30 g / fat 40`.
**The instruction is simply not followed when the item is a dish rather than the sauce itself.**

📊 **This is the FIFTH prompt-wording arm to move nothing** (B11, B13, B23, the two `serving_pieces`
wordings, now S). Against that, SCHEMA FORCE is 5 for 7 — forced `serving_pieces` succeeded on the
exact case two wordings had failed. **That scoreboard, not a new sentence, is what the next arm
should be built on:** a REQUIRED per-ingredient field the model cannot leave unanswered.

⚠️ **CORRECTION — the control did NOT show fat inflation, and the first reading of this table said it
did.** `CAMARONES EMPANIZADOS` moved 14 → 20 g fat with a byte-identical ingredient list. The cause
was a single flag:

| | frying oil |
|---|---|
| baseline | `within_printed_weight: false` -> passes through at 10 g |
| ARM S | `within_printed_weight: **true**` -> fitted with the rest, 125 g -> 200 g, so 10 g becomes 16 g |

🔑 **Side finding, unchased and worth more than this probe: `within_printed_weight` is UNSTABLE on
ambiguous components, and it is worth 6 g of fat on one dish.** Frying oil is genuinely arguable, the
model flips on it between calls, and the flag decides whether an ingredient is rescaled at all. It
is the same switch that lets accompaniments escape `resolveGrams`.

✅ **The standalone `sauce` result still stands and still means something** — the model CAN decompose
a mixture correctly (pesto 0.22x -> 1.01x). It just will not do it unasked inside a dish. So the
knowledge is there and the request is what is missing, which is the same shape as the 2026-08-11
finding that the model knows a 28 cm pizza is 750 g and is never asked.

**Batched vs solo, free from the archives, confirming the 2026-08-12 curve is still live:**
FILETE DISCORDIA 70 g fat batched vs 29 solo; Salmone padella 26 vs 13; PULPO 9 vs 13.
**Do not read any solo number here as a production figure.**

### 🟡 ARM S2 — SCHEMA FORCE GETS AN ANSWER, THE WRONG FIELD SHAPE WASTES IT (2026-08-16, ~$0.15)

**A required per-ingredient string `composed_of`, placed BEFORE the three per-100 g fields** so the
model names the parts before costing them (strict mode emits in schema order; `enrich.ts` already
relies on this twice). Same 10 archived dishes as `sauce-dish`, 3 draws, solo.
`probe-plate-arms.ts sauce-schema`.

#### ✅ The mechanism works — schema force is now 6 for 8, wording still 0 for 5

**Every ingredient answered, every draw.** The identical request in prose was ignored outright.
And where the model volunteered SHARES, the composition came out right:

| ingredient | what it said it is made of | fat/100 g | USDA |
|---|---|---|---|
| ranch dressing | **mayonnaise 50%, buttermilk 30%**, herbs | **40** | 44.5 ✅ |
| pesto sauce | basil, olive oil, pine nuts, parmesan | 47 | 59.2 ✅ better |
| caesar dressing | oil, egg, anchovy, parmesan, garlic, lemon | 40 | 57.9 🟡 |

#### ❌ But the dish that started this is UNCHANGED

| | |
|---|---|
| NEW YORK, `Chimichurri` 30 g | `composed_of` = **"parsley, garlic, olive oil, vinegar"** — and fat **STILL 15** |

🔑 **The split is exact: shares present -> composition right; NAMES ONLY -> composition unmoved.**
Ranch got percentages and landed at 40. Chimichurri got a bare list and kept its placeholder 15.
Naming olive oil changed nothing, because nothing forced the model to say HOW MUCH of it there is.
**A required STRING buys a description; the number needs a required NUMBER** — which is exactly the
shape that worked for `serving_pieces` and never worked as prose.

#### 🔴 THE SIDE EFFECT — the field invites the model to MERGE ingredients, the opposite of the goal

A free-text `composed_of` gives a mixture somewhere to be *described*, so the model stops
decomposing and starts collapsing:

| dish | baseline ingredients | **under ARM S2** |
|---|---|---|
| CAMARONES EMPANIZADOS **(control)** | shrimp 85 g · breading 30 g · oil 10 g | **`breaded shrimp` 150 g** (`shrimp 60%, breading 40%`) + oil |
| Dedos De Queso | mozzarella 30 g · breadcrumbs 30 g · … | **`mozzarella cheese sticks` 100 g** (`cheese 70%, breading 30%`) |

The control's fat went **14 -> 30 g** for that reason alone. ⚠️ The other control (PULPO) moved
13 -> 9 g from ordinary sampling — its olive oil drew 15 g then 10 g — **not** from the arm; the two
control movements have different causes and neither is fat inflation.

#### 🧭 What this says the next arm is

Not another string, and not another sentence. **A required NUMBER**: the share of the ingredient's
weight carried by its most energy-dense part. Evidence: every case where a share existed produced a
believable fat, and every case without one produced the placeholder. It also removes the merging
incentive, because a number cannot be used to describe a composite away.

⚠️ Still unresolved and now twice-observed: **`within_printed_weight` flips between draws on
ambiguous components** (frying oil), and it decides whether `resolveGrams` rescales an ingredient at
all. Worth 6 g of fat on one dish. Unassigned.

**Phase spend today: ~$0.40 across three probes** (sauce, sauce-dish, sauce-schema).

### ✅ ARM S3 — THE REQUIRED NUMBER WORKS. CHIMICHURRI 15 → 50 (2026-08-16, ~$0.15)

**The end of the sauce thread, and the arm the evidence pointed at.** A required per-ingredient
`parts` ARRAY of `{name, share_pct}`, placed BEFORE the three per-100 g fields.
`probe-plate-arms.ts sauce-number`. Same 10 archived dishes, 3 draws, solo.

#### The case that started it, finally moved

| | `Chimichurri`, 30 g, in NEW YORK |
|---|---|
| baseline / Arm S / Arm S2 | fat **15** g/100 g (unchanged by any of them) |
| **ARM S3** | **fat 50** — `olive oil 50%, vinegar 20%, parsley 15%, garlic 10%, red pepper` |

**50 sits inside the 45–57 the two independent estimates give** (a typical recipe works out ~47%; the
oracle assumed 57%). No USDA record exists, so this is not scored — but 15 was never defensible for a
sauce the model itself describes as half olive oil.

#### 🔑 THE PROGRESSION IS THE FINDING — four arms, one request, escalating force

| arm | what was asked | result |
|---|---|---|
| S | a sentence | **ignored** in-dish; sauce untouched |
| S2 | a required STRING | always answered; helped ONLY where the model volunteered shares. Invited **MERGING** |
| **S3** | a required ARRAY of `{name, share_pct}` | **shares always present, composition follows them** |

**A structured array fixed the merging.** Under S2 the CAMARONES control collapsed
`shrimp + breading + oil` into `breaded shrimp 150 g`; under S3 all three stay separate, each
annotated `X 100%`. A number cannot be used to narrate a composite away, which is why the shape was
chosen.

#### ✅ Both controls held — and both moved for reasons that are NOT the arm

| control | base | S3 | cause |
|---|---|---|---|
| PULPO A LA GALLEGA | 13 g fat | 9 | its olive oil drew 15 g then 10 g, paprika 5 g then 1 g — **sampling** |
| CAMARONES EMPANIZADOS | 14 g fat | 20 | frying oil flipped `within_printed_weight` false → true — **the known flag defect, third sighting** |

Ingredient lists are otherwise identical on both. **No inflation, no merging.**

#### ⚠️ NOT fully reliable — the model still sometimes ignores its own parts

| sauce | parts it gave | fat it then stated | USDA |
|---|---|---|---|
| garlic sauce | **oil 60%**, garlic 10%, water 30% | **20** | 74 |
| caesar dressing | **oil 50%**, egg yolk 20%, vinegar 10%, parmesan 10% | **40** | 57.9 |

Oil at 60% cannot yield 20 g fat/100 g. So `parts` constrains the answer but does not determine it,
and the arm is an improvement rather than a fix. **Do not report S3 as "solved".**

#### 🧭 Status: mechanism validated, NOT yet scored

Everything above is 10 dishes on SOLO calls. **No benchmark number has been run on S3.** The next
step is the real thing — the 96-point weighted and 72-point unweighted sets, ~$2.50 — and it should
carry Santiago's three accompaniment rulings at the same time, since a weight fix alone regresses
sauces (see the cancelling-errors note).

**Phase spend today: ~$0.55 across four probes.**

### ⛔ CORRECTION — `within_printed_weight` IS NOT UNSTABLE. I BROKE THE DENOMINATOR RULE (2026-08-16, $0)

**Three entries above call this flag "unstable", "flips between draws", "the known flag defect, third
sighting", and the last one recommends it might jump the queue. THAT IS WRONG.** It was asserted from
three anecdotes without ever counting the denominator — the exact failure Santiago's standing rule
exists to prevent, and which has already cost this project two sessions (evals 139 and 140).

Counted across all four sauce probes, 2026-08-16:

| question | result |
|---|---|
| **same prompt, different draw** (genuine instability) | **2 of 420 = 0.5%** |
| different prompt (a prompt change moved it) | 5 of 141 = 3.5% |

**The flag is stable under repetition.** What I actually observed was the flag differing between
BASELINE and an ARM — which is a prompt change doing its job, not a coin flip. Conflating those two
is what produced the false claim.

🔑 **The flag still matters, for a completely different reason, and that reason survives:** it is the
switch that decides whether `resolveGrams` corrects an ingredient's weight at all, and it is where
the printed-weight SCOPE question is actually being answered — per ingredient, by the model, on every
scan. **That is a DESIGN question for Santiago, not a bug to fix.** It is not urgent on stability
grounds and should not displace the benchmark run.

⚠️ **Anyone quoting the three "unstable flag" notes above: they are superseded by this entry.**

### ⚖️ THE PRINTED-WEIGHT SCOPE RULE — SIMULATED AT $0, AND OPTION A IS FALSIFIED (2026-08-16)

The scope question ("does a menu's printed 200 g already include the bread and beans?") has been
open for months. It is not unanswered in code — it is answered per ingredient, per scan, by
`within_printed_weight`, which decides whether `resolveGrams` corrects that ingredient at all.
**24% of weighted items carry at least one ingredient marked outside.**

`scripts/sim-scope-rule.ts` re-scores the archived B21 runs under each candidate rule through
`macro-measure.ts` — the same path as every published figure. No model calls.

| rule | failed fields | mean abs error |
|---|---|---|
| **C — the model decides per ingredient (today)** | **7/288** | **13.1%** |
| A — printed weight covers the WHOLE plate | **31/288** | 16.5% |

**Option A is 4.4x worse and the damage is concentrated:** `Salmone toscano` goes 3 -> 26 failed
fields, because forcing its baguette inside the printed 200 g squeezes the salmon down to make room.

⚠️ **Read this before quoting the comparison: it is PARTLY CIRCULAR.** The 8-dish oracle was built
on the convention that an accompaniment sits OUTSIDE the printed weight (`Salmone toscano`'s entry
says so explicitly: *"the baguette ... sits OUTSIDE the printed weight at 45 g, but is eaten and
counted. Total eaten 245 g"*). A rule asserting the opposite was always going to score worse against
it. **What rescues the test is independent evidence from the menus themselves** — El Marcos prints
*"el gramaje se refiere a los ingredientes principales"*, which says the printed number covers the
main ingredients and not the sides. Oracle convention and printed menu text agree, and A contradicts
both.

#### ✅ Santiago's refinement is already how it behaves — "main ingredientS", plural

He raised the risk that "main ingredients" gets read as ONE ingredient — a 200 g salad becoming 200 g
of chicken. **It does not happen.** Across 117 weighted dishes with 2+ ingredients:

| ingredients inside the printed weight | share |
|---|---|
| 2 or more | **94%** |
| exactly 1 | 6% (7 dishes) |

And all 7 are legitimately single-component dishes — NEW YORK, RIB EYE, the 20 oz ribeye, a chicken
breast — where the printed weight IS that one item and the rest is served alongside.

#### 🧭 What this reframes

**The scope question is largely settled by evidence, and it is NOT the defect.** C already scores
7/288. Option B (decide from the menu's own words in code) would differ from C only where the model
disagrees with the menu wording, and on this set there is almost no headroom to win.

**The open part is not WHICH ingredients sit outside — it is what those ingredients WEIGH.** That is
the label-serving defect (a 30 g dipping-cup portion for a spooned sauce) and Santiago's three
rulings address exactly it. Spend the effort there.
