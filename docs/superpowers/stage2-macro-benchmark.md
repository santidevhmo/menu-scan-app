# Stage-2 Macro Enrichment Benchmark — Log

Single append-only log for this phase. Spec:
`specs/2026-08-07-stage2-macro-enrichment-benchmark-design.md`.
Plan: `plans/2026-08-07-stage2-macro-benchmark.md`.

**Three artifacts only** in this phase — `scripts/fixtures/macro-oracle.json` (Santiago's
numbers), `scripts/bench-macros.ts` (the runner), and this log. Deliberately smaller than the
OCR phase's six, which drifted.

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
status, so it does not count against the three-artifact rule and cannot rot.

**What it settles:**

| Question we had | Answer | Effect on us |
|---|---|---|
| Is ±20% cal / ±30% macro defensible? | **Yes — keep it, do not tighten.** FDA's own labelling-compliance limit is 20%; restaurants' own stated calories are off ~18% at the mean and far more per item | Ruling stands, now evidence-backed |
| Does per-ingredient decomposition help? | **Yes, measured.** NutriBench's best result (GPT-4o + CoT, 66.82% Acc@7.5) uses exactly this; CoT beat plain prompting by +4.22 pp across 12 models | **B1 promoted** to first iteration |
| Should we build RAG over a food database? | **No.** In the one head-to-head, RAG did not reliably beat CoT and made GPT-4o-mini *worse*; CoT-only always won on natural servings | A whole workstream avoided |
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

---

## Runs

*(baseline-001 is recorded below.)*

| # | date | what changed | result (range across draws) | verdict |
|---|---|---|---|---|
| baseline-001 | 2026-08-07 | nothing — pipeline as shipped | CESAR 0/3 · Salmone 0/3 · Pastel 2/3 | FAIL — baseline establishes failures for portion/fat and calorie estimation; no pipeline change made |
| baseline-002 | 2026-08-08 | nothing — reproducible `gpt-4o-2024-08-06` pin | CESAR 0/3 · Salmone 0/3 · Pastel 3/3 | FAIL — pinned baseline confirms CESAR and Salmone failures; no pipeline change made |

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
baseline's mirror request/response and its three raw local responses. The executor reported one
mirror operation plus one `BENCH_DRAWS=3` invocation: four paid calls, with no retry requested.
The manifest is post-hoc evidence, not a transport log or command transcript; it does not
independently establish endpoint, HTTP status, exhaustive call count, or absence of retries.

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
- **2026-08-07 — NO DATABASE OR API IN THE ENRICHMENT PIPELINE (Santiago).** Stage 2 stays a
  pure LLM step. Accuracy is pursued through **chain-of-thought, prompt wording, schema and
  field-order design, and pipeline structure** (batch size, staged vs single call, abstain
  path) — never a runtime lookup. Evidence: RAG against a food-composition database did not
  reliably beat plain CoT and made GPT-4o-mini *worse*; the retrieval DB's 100 g metric entries
  did not map onto natural servings, and the model already holds the knowledge, so retrieval
  added noise (NutriBench §"RAG Does Not Always Improve Performance").

  **Three things this ruling does NOT forbid — read before assuming otherwise:**

  1. **Static portion anchors written into the prompt text** (e.g. FDA RACC category amounts,
     FNDDS portion weights as literal reference values). This is prompting, not a lookup: no
     call, no key, no latency, nothing to be unavailable at runtime. It is the research's
     recommended alternative *to* RAG, and it stays available.
  2. **USDA FoodData Central for the ORACLE.** That is Santiago's measuring instrument for
     building ground truth by hand. It is never called by the app and never ships. Do not
     confuse "we use USDA" with "the app uses USDA".
  3. **A licensed chain-menu lookup layer** (Nutritionix / MenuStat) for matching *known chain
     restaurant items* to their published nutrition, with the LLM as fallback for independents.
     That is a different problem from estimation — matching, not inferring. **Parked as a
     post-release option, not scheduled, not part of this phase.**

- **2026-08-07 — USDA oracle ingredient convention (Santiago).** Ingredient basis is raw,
  cooked, or prepared; use prepared for ready-to-eat dressing, cheese, bread, and canned foods.
  Prefer Foundation/FNDDS generic records, but use USDA SR Legacy only when neither represents
  the printed ingredient's stated form. For Salmone Toscano, printed 200g is the cooked salmon
  portion; estimate its sauce and baguette separately. For Pastel Azteca, include only
  ingredients printed on the menu: do not infer tortilla, oil, or cream.
