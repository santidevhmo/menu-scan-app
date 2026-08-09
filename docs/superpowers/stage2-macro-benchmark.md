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
