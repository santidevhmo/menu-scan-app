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

### B9 — Cross-model comparison arm *(added 2026-08-08, Santiago)*

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

| # | date | what changed | result (range across draws) | verdict |
|---|---|---|---|---|
| baseline-001 | 2026-08-07 | nothing — pipeline as shipped | CESAR 0/3 · Salmone 0/3 · Pastel 2/3 | FAIL — baseline establishes failures for portion/fat and calorie estimation; no pipeline change made |
| baseline-002 | 2026-08-08 | nothing — reproducible `gpt-4o-2024-08-06` pin | CESAR 0/3 · Salmone 0/3 · Pastel 3/3 | FAIL — pinned baseline confirms CESAR and Salmone failures; no pipeline change made |
| baseline-002r | 2026-08-08 | **oracle only** — printed-weight rule applied to all three dishes; **$0, no new model call** | CESAR 0/3 · Salmone 3/3 · Pastel 0/3 | FAIL — 9 failed field/draws (was 15). Re-score of the SAME archived baseline-002 responses against the corrected oracle |
| iter-b1-001 | 2026-08-08 | **B1** — required per-ingredient `grams` + prompt derives totals by summing (`1768a1d`); $0.023 | CESAR 0/3 · Salmone 0/3 · Pastel 0/3 | **REGRESSION on the tally** (14 failed field/draws vs 9) — but the portions are now good and auditable. NOT deployed. See notes: this run produced the phase's most decisive diagnostic |
| iter-b10-001 | 2026-08-08 | **B10** — per-ingredient macros, item totals summed in code, calories by Atwater (`1ce5139`); $0.036 | CESAR 0/3 · Salmone 2/3 · Pastel 0/3 | MIXED — 9 failed field/draws, same as baseline. **Calories, protein and fat all improved; CARBS is now the single systematic defect.** NOT deployed |
| iter-b11-001 | 2026-08-08 | **B11 option 1** — one prompt sentence naming the vegetable/sauce carb trap (`766be47`); $0.034 | CESAR 0/3 · Salmone 3/3 · Pastel 0/3 | **FALSIFIED — the targeted number did not move.** 6 failed field/draws under the beans tolerance (ties baseline, beats b10's 7), but PASTEL's carb sum is 50 g in *both* runs and the sentence made sweet corn WORSE. Creates **B12**. NOT deployed |

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

---

## Rulings

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
