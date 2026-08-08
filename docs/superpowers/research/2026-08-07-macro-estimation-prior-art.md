# Estimating Gram Portions and Macros for Restaurant Dishes from Text Alone: What the Literature Actually Says

## Bottom line up front

1. **The single most impactful change is to force the model to record an explicit gram weight for each ingredient before totalling** — this is exactly the per-item decomposition that NutriBench's best configuration (GPT-4o + Chain-of-Thought) uses to reach its top score of 66.82% within ±7.5 g on carbohydrates (mean absolute error 8.61 g), and it directly fixes the requester's known weakness that portion assumptions are currently invisible (NutriBench, ICLR 2025, arXiv:2407.12843).
2. **The accuracy ceiling is genuinely low and is set by the world, not the model.** The large restaurant study (Urban et al., *JAMA* 2011;306(3):287–293, n=269 items from 42 restaurants) found stated calories "accurate overall" *at the mean* but with large per-item variance (19% of items ≥100 kcal over stated); a separate reduced-energy study (Urban et al., *J Am Diet Assoc* 2010;110(1):116–123, n=29) found measured calories averaged **18% above** stated. A ±20% calorie / ±30% macro tolerance band is therefore defensible and consistent with the FDA's own 20% labelling-compliance rule — do not tighten it.
3. **Retrieval-Augmented Generation (RAG) against a food-composition database did NOT reliably beat plain Chain-of-Thought in the one benchmark that tested it head-to-head; for GPT it sometimes made results worse** — so do not build a RAG pipeline expecting a free accuracy gain; inject authoritative portion tables (FDA RACC, USDA FNDDS) as prompt scaffolding instead.
4. **LLM verbalized high/medium/low confidence is known to be poorly calibrated and overconfident** (ECE ≈ 0.1 even for ≥70B models; AUROC of verbalized confidence often near 0.5–0.65) — a self-reported label is a weak error predictor; sampling-agreement across multiple draws is a better-supported signal.
5. **Spanish/Mexican dishes are a real, documented risk zone:** LLM nutrition error rises on higher-carb, non-US cuisines (GPT-4o CoT mean absolute error ranged from 2.20 g on Nigerian meals to 15.12 g on Sri Lankan meals in NutriBench), and Western food databases under-represent dishes like chilaquiles — plan to ground these against Mexican-specific tables (SMAE, INSP/Zubirán) and keep dish names in Spanish.

---

## Answers by sub-question

### A. Portion-size reference data

**A1 — Authoritative reference datasets for standard portions, queryable?**
Yes, several exist and are usable as grounding scaffolds.

- **FDA RACC (Reference Amounts Customarily Consumed), 21 CFR 101.12(b).** A regulatory table of ~150+ food-category reference amounts in grams per eating occasion, derived from national food-consumption surveys. Codified (queryable via eCFR / Cornell LII) and downloadable as an FDA guidance PDF ("Reference Amounts Customarily Consumed: List of Products for Each Product Category"). Nuance: RACC amounts are based only on the *edible portion* (not bone, seed, shell) and reflect the amount *customarily consumed*, not necessarily what a restaurant plates. Best used as a sanity-check prior for component amounts (e.g., cooked-vegetable RACC = 85 g; cookie = 30 g).
- **USDA FoodData Central (FDC).** USDA's composition system with a public REST API (data.gov key) and full CSV/JSON downloads. Foundation Foods and SR Legacy contain a **food portion file** with gram weights per household measure; FNDDS (Food and Nutrient Database for Dietary Studies) carries portion weights for as-consumed foods and is the nutrient backbone for What We Eat in America / NHANES. All free, public domain. This is the strongest single grounding source for ingredient-level per-100 g composition and standard portions.
- **NHANES / WWEIA / FPED** feed FNDDS; NutriBench itself was built from WWEIA + FNDDS, so these are proven usable for exactly this task.
- **Non-US:** **SMAE (Sistema Mexicano de Alimentos Equivalentes)** defines Mexican "equivalent" portions with average macros per group (e.g., one cereal equivalent ≈ 15 g carbohydrate / ~70 kcal); it draws many values from USDA and the Instituto Nacional de Ciencias Médicas y Nutrición Salvador Zubirán tables. INSP/Zubirán publish Mexican food-composition tables. UK CoFID and EFSA/EUROFIR databases are the European equivalents. SMAE's own documentation states equivalents are approximate group averages, "not exact."

**A2 — What does a printed gram weight on a menu conventionally refer to (whole dish vs main protein)? Any regulation?**
**No evidence found for a menu-specific regulation that resolves this ambiguity.** Restaurant menu items are "non-prepacked food"; under EU Regulation 1169/2011 only allergen information is mandatory for non-prepacked food, and net-quantity/weight declaration rules apply to *pre-packed* products, not restaurant plates. There is therefore no legal definition of whether "Salmon … 200 g" means the salmon or the plate. The closest analogous conventions come from pre-packed law: EU 1169/2011 (and WELMEC 6.8 guidance) requires *drained net weight* for foods in a liquid medium, and RACC (US) is based on edible portion. The practical, defensible convention — supported by butchery/portion-control practice and by the drained-weight logic — is that **a printed weight next to a dish most commonly denotes the principal named component (the protein/main), not the fully plated dish including sides, sauces and bread.** This is a convention, not a rule; treat printed weight as the main-component weight, estimate accompaniments separately, and flag the assumption in output.

**A3 — Raw vs cooked weight; yield and retention factors; how much do they move the estimate?**
Printed menu weights are conventionally **raw/as-purchased** for meat (butchery portioning is done raw), but this is not standardized. USDA publishes the actual factors:

- **USDA Table of Cooking Yields for Meat and Poultry (Release 2)** — gram-weight change from raw to cooked from moisture/fat loss.
- **USDA Table of Nutrient Retention Factors (Release 6, 2007)** — per-nutrient percent retained by cooking method (4-digit retention codes, e.g., "chicken, broiled").
- FNDDS documentation describes applying moisture-change (yield) at the recipe level and retention factors at the ingredient level.

Magnitude in practice: cooking yields for meats commonly fall in the ~65–80% range (100 g raw → ~70 g cooked), so **treating a raw weight as cooked, or vice versa, can misstate the portion by 20–35%** — comparable to or larger than the entire macro tolerance band. This is a first-order error source: decide whether the estimate is on a raw or cooked basis and apply an explicit yield factor. Protein is largely retained; fat can be lost in grilling; water-soluble vitamins are most affected but are out of scope here.

### B. Prior work on LLM nutrition estimation from text

**B4 — Published benchmarks; best error rates and metric.**
Yes — **NutriBench (Hua, Dhaliwal, Pullela, Burke, Qin; UC Santa Barbara; ICLR 2025; arXiv:2407.12843)** is the primary, directly-relevant prior art and largely answers "has anyone seriously experimented with this." It is 11,857 human-verified natural-language meal descriptions built from WWEIA/FNDDS and FAO/WHO GIFT across 11 countries (including Mexico, 181 meals; Peru, 93; Argentina, 70; Italy, 141), labelled with carbs, protein, fat, calories.

- Headline metric is **Acc@7.5** (% of carbohydrate predictions within ±7.5 g of truth) plus **Answer Rate**.
- **Best result: GPT-4o with CoT = 66.82% Acc@7.5, answer rate 99.16%, mean absolute error 8.61 g** (carbohydrates).
- Averaged over all 12 models, CoT beat standard prompting by **+4.22 percentage points** (43.24% → 47.46%).
- Caveat: the public leaderboard evaluates **carbohydrate** estimation as the primary task; protein/fat/calorie labels exist in the dataset but the headline is carbs. Expect fat (most preparation-sensitive) to be worse.

A newer related line, **NutriMLLM / DiningBench (2026)**, extends to micronutrients and multimodal but reports high error on the NutriBench text task (SMAPE-adjusted ~47% on energy for the best non-proprietary model), reinforcing that text-only macro estimation is hard.

**B5 — Which techniques measurably improved accuracy (measured vs recommended)?**
Measured in NutriBench:
- **(a) Per-ingredient decomposition with explicit amounts before totalling (CoT):** MEASURED improvement, +4.22 pp averaged across models; GPT-4o's best result used it. Maps directly onto the requester's proposed fix. **Measured, positive.**
- **(b) RAG against a food-composition database:** MEASURED but mixed/negative for GPT — see B6. Not a reliable win.
- **(c) Self-consistency / multiple samples:** NOT tested in NutriBench for nutrition. In the broader literature (Wang et al., "Self-Consistency Improves Chain of Thought Reasoning," arXiv:2203.11171, ICLR 2023) it gave absolute gains of **+17.9% on GSM8K, +11.0% SVAMP, +12.2% AQuA, +6.4% StrategyQA, +3.9% ARC-challenge** — but those are majority-vote over *discrete* answers on large models (PaLM-540B/GPT-3). For a numeric estimate the analogue is taking the median across draws, which is a reasonable recommendation, not a nutrition-measured result. **Extrapolated, not measured on this task.**
- **(d) Fine-tuning on FDC data:** MEASURED, large. Fine-tuning Gemma2-27B (qLoRA) on ~600K FDC-derived descriptions raised Acc@7.5 from 45.61% (base) to **61.71%** (+16.10 pp), MAE 13.33 → 9.57 g, answer rate to 100% — though still below GPT-4o CoT. **Measured, strongly positive.** (Informational, given the closed GPT-4o decision: it shows that grounding in FDC-style data helps a lot.)

**B6 — Does RAG beat a pure LLM estimate; is the complexity justified?**
**Largely no, on the one head-to-head test.** NutriBench's relevant section is titled "RAG Does Not Always Improve Performance." Findings: for metric-serving queries RAG/RAG+CoT helped Llama 3.1 (the best open configuration, Llama3.1-405B RAG+CoT, reached 59.89% Acc@7.5 / 96.05% answer rate), but **for GPT-4o-mini, RAG showed only minor improvement over base and RAG+CoT performed *worse* than CoT.** On natural-serving queries, **CoT-only always beat RAG+CoT.** Stated cause: the retrieval DB held standardized 100 g metric entries that models couldn't map to natural servings, and GPT already contains this knowledge, so retrieval added noise. **Conclusion: the added complexity of RAG is not justified by a reliable measured gain for a GPT model; alignment between the retrieval DB's units and the query matters more than retrieval itself.** Prefer injecting authoritative portion anchors (RACC/FNDDS) directly into the prompt over building a vector-DB RAG. (Contrast: DietGlance, arXiv:2502.01317, reports RAG helped for hidden ingredients in culturally-specific diets — see Contradictions.)

**B7 — Non-English / regional dishes: do estimates degrade, and is there mitigation?**
**Yes, degradation is documented.** NutriBench §5.2 reports GPT-4o CoT mean absolute error varying by country from a low of **2.20 g (Nigeria)** to a high of **15.12 g (Sri Lanka)**, with error rising with the meal's carbohydrate content — i.e., higher-carb, non-Western cuisines are harder. DiningBench (2026) found fine-grained dish classification "dropped universally" when indigenous dish names were translated to English, describing a "semantic gap" for dish names not seen in pretraining. Mitigations with evidence: (i) ground against **Mexican-specific composition tables (SMAE, INSP/Zubirán)** rather than USDA alone; (ii) keep the dish name in its **original language** (Spanish) in the prompt rather than translating. For the requester's fixture set (pastel azteca, chilaquiles, aguachile) this is a live risk and the largest single source of avoidable error after portion size.

### C. What accuracy is achievable — the noise floor

**C8 — How accurate are restaurants' own published calorie counts?**
Poor at the item level, and this defines the ceiling.
- **Urban et al., *JAMA* 2011;306(3):287–293** (DOI 10.1001/jama.2011.993): 269 food items from 42 quick-serve and sit-down restaurants in MA, AR, IN, measured by bomb calorimetry. Stated calories were "accurate overall" *at the mean*, **but 108 items (40%) were ≥10 kcal above stated, 141 (52%) ≥10 kcal below, and 19% of foods contained >100 kcal/portion more than stated.**
- **Urban et al., *J Am Diet Assoc* 2010;110(1):116–123** (reduced-energy foods): 29 restaurant foods averaged **18% more** calories than stated; some individual items reached **200% of stated**; **free side dishes increased provided energy to an average of 245% of stated values for the entrées they accompanied** (side avg 471 kcal vs entrée 443 kcal).
- **Fast-food/fast-casual analysis** (152 samples, 13 chains, PMC7259066): **15% of items were ≥20% above declared calories** (26% for sodium); highest overage 31%.
- Pattern: **low-calorie/"healthy" items are the most under-declared** (health-halo), and independent/ethnic restaurants deviate most.

**Implication:** the ground truth the app chases is itself uncertain — roughly ±18% at the mean for reduced-energy items and much more per item. A model matching a careful human to ±20% is at the practical ceiling.

**C9 — How much do dietitians disagree with each other?**
Directly on the requester's task (macros from a *text description* only), **direct evidence is limited** — itself a finding. Adjacent quantified evidence:
- In NutriBench's own study, three professional nutritionists (no app/web access) scored an aggregate **42.45% Acc@7.5** on a 72-query subset — *below* GPT-4o CoT's 60.56% on the same subset; when allowed database look-up, the best nutritionist reached 59.72%, comparable to GPT-4o. Nutritionists took ~43 minutes total for 72 queries vs ~2 minutes for an LLM.
- Portion-size estimation from images: inter-rater ICC between two dietitians was 0.771 (volume served), 0.629 (left), 0.590 (intake) — moderate agreement even among trained raters (Cambridge *Public Health Nutrition*, PubMed 29428006, 17 foods).
- Image-based dietary assessment underestimated energy by −13.3% and −4.5% (two methods) with wide 95% limits (roughly ±40%; PMC7975321, n=80).

**Implication:** a single careful human oracle doing lookups is itself noisy — inter-dietitian agreement is moderate at best, and unaided experts were *beaten* by GPT-4o CoT. The oracle should use database lookups (that closed the gap in NutriBench) and should not be treated as ground truth to ±10%.

**C10 — What tolerance band is defensible? Is ±20% cal / ±30% macro reasonable?**
**±20% calories is well-justified and should not be tightened; ±30% per macro is reasonable and arguably appropriate because fat/component macros are noisier than the calorie sum.** Anchors:
- **FDA nutrient-labelling compliance:** per the FDA "Guide for Developing and Using Data Bases for Nutrition Labeling" (implementing 21 CFR 101.9(g)(5)), for "Third Group" nutrients (calories, fat, carbs, sugars, sodium) **"the label is considered to be out of compliance if the nutrient content of a composite of the product is greater than 20% above the value declared."** Note this is an **asymmetric, one-sided** tolerance (guards against under-declaring), not a symmetric ±20% window; Class I/II beneficial nutrients must be ≥100%/≥80% of declared. Still, 20% is the accepted regulatory magnitude and directly supports a ±20% calorie band for a two-sided estimation tolerance.
- **EU 1169/2011 tolerance guidance** uses a tiered system with tolerances that widen for low absolute values (reaching roughly ±20–40% for some nutrients/ranges).
- NutriBench's own ±7.5 g carb tolerance is an *absolute* (not %) clinical threshold from insulin dosing — different rationale, but shows the field accepts fixed tolerance bands.

**Verdict: keep ±20% calories (matches FDA) and ±30% per macro (accounts for fat/preparation variance and correctly loosens the noisier component fields). Tightening below these chases noise that exceeds restaurants' own declared accuracy.**

### D. Operational questions

**D11 — Does batching 10 items per request degrade per-item quality?**
**Evidence says likely yes beyond a modest batch size, though no nutrition-specific measurement exists.**
- A batch-prompting study (arXiv:2605.28268) found accuracy "remains stable or declines only marginally" for small batches (e.g., <16 items for a simple classification task, <8 for GSM8K math), then "drastically degrades" as batch size grows and the concatenated prompt exceeds the model's effective attention span; smaller models degrade first.
- A synthesis of batch-prompting research (Cheng et al., 2023) suggests a ceiling of roughly **~4 unrelated items** before quality erodes for harder tasks.
- **"Lost in the Middle" (Liu, Lin, Hewitt, Paranjape, Bevilacqua, Petroni, Liang; arXiv:2307.03172; TACL 2024):** U-shaped accuracy, **>30% drop** on multi-document QA when the answer moved from position 1 to position 10 in a 20-document context, replicated across six model families (GPT-3.5-Turbo, GPT-4, Claude 1.3, LongChat-13B, MPT-30B, Cohere Command). In a 10-item batch, items 4–7 are exactly the vulnerable middle.

**Implication:** 10 items per call is plausibly past the safe zone for a reasoning-heavy per-item task. Untested for this pipeline and high-value to measure — A/B batch=10 vs 3 vs 1, comparing per-item macro error and expecting the biggest degradation on middle-positioned items.

**D12 — Can the LLM self-report calibrated confidence?**
**No, not reliably; verbalized high/medium/low is a weak signal.**
- Verbalized confidence is systematically **overconfident**; for ≥70B models ECE is around **0.1** (confidence off by ~10 points), and smaller/older models far worse (average ECE >0.377 for GPT-3/3.5/Vicuna; Xiong et al., arXiv:2306.13063).
- As a *failure predictor*, verbalized-confidence AUROC is often close to chance (that study reported GPT-4 average AUROC ~62.7%, "close to the 50% random guess").
- Confidence scores tend to collapse to coarse saturated values (0.9/1.0), limiting thresholding.

**Better-supported alternatives:** (i) **sampling agreement across multiple draws** — the spread/variance of the numeric estimate across samples is a more empirically grounded uncertainty signal than a verbalized label; (ii) **explicit abstention option** — an explicit "insufficient information" choice measurably increases safe abstention (see D14); (iii) token-logprob-based confidence sometimes beats verbalized, though it is awkward for a structured-JSON multi-field output. **Recommendation: keep the high/medium/low label only as a coarse UI hint, but drive suppression off sampling disagreement (run 3–5 samples, flag items where the calorie estimate's coefficient of variation is high).**

**D13 — How do consumer products handle restaurant dishes with no published data?**
They overwhelmingly **license/crowdsource a database and/or estimate from image+portion, not from name alone**:
- **MyFitnessPal / Cronometer / Lose It!** rely on large food databases (USDA public-domain data underpins many; MFP is heavily crowdsourced user entries; its API is closed to new developers).
- **Database providers** used by apps: **Nutritionix** (Syndigo LLC) advertises **"over 1.9 million unique food items, including 991,000+ grocery foods and 202,000 restaurant menu items,"** monitoring 600+ restaurant chains, with an NLP endpoint and enterprise pricing quoted around **$1,850/month** (a lower ~$299/mo starter tier exists); **Edamam** (~900K foods incl. restaurant items, NL nutrition-analysis API); **Spoonacular**, **FatSecret**, **MenuStat** (restaurant-menu nutrition, research-oriented); plus free **USDA FDC** and **Open Food Facts**.
- **Photo apps (Cal AI, Foodvisor, etc.):** vision model identifies foods then a nutrition DB supplies macros. Independent write-ups put realistic accuracy at **~80% first-pass, 90–95% after a user correction**; **portion estimation is the weak link (as low as ~39%)** and hidden fats/oils/sauces are a known systematic miss; final calorie estimates typically **within 15–30%** for simple meals, worse for mixed/regional dishes.

**Implication:** no major consumer product estimates macros from *dish name + description text alone* as its primary method; they match to a licensed restaurant-item database (Nutritionix/MenuStat) or use an image plus a user correction. The requester's text-only approach is genuinely on the frontier — which is why NutriBench (also text-only) is the closest prior art. Consider licensing Nutritionix/Edamam/MenuStat coverage as a lookup layer for chain items, falling back to the LLM only for un-matched independent-restaurant dishes.

**D14 — Prior art on deciding a description is too vague to estimate ("abstain")?**
**Yes, as a general ML/LLM capability (selective prediction / abstention), but no nutrition-specific classifier was found.**
- **Selective prediction / "learning with abstention"** is a mature framework: a model returns a prediction only when a selection function clears a confidence threshold, trading coverage for accuracy (reject option).
- **AbstentionBench (2025, arXiv:2506.09038)** and related work find abstention is "an unsolved problem" where scaling helps little, and reasoning fine-tuning can *degrade* abstention — models tend to answer even when they shouldn't.
- Most actionable finding: **providing an explicit abstention option consistently increases safe abstention far more than prompt perturbations or scaling** (MedAbstain, arXiv:2601.12471; and multimodal VQA "doesnotapply" work, arXiv:2310.00647). NutriBench itself allowed a "-1 / no answer" response and reported answer rate as a first-class metric — precedent for an abstain path in exactly this domain.

**Implication:** implement an explicit `insufficient_information` output value and instruct the model to use it for promotional-only names (e.g., "POWER NOODLES — you'll burn your mouth off") or bare names with no description. Expect it to under-abstain; combine the explicit option with a hard heuristic gate (the 37% of items with no description are the obvious first filter). Do not rely on the model to volunteer abstention without both the explicit option and the gate.

---

## Datasets / APIs table

| Resource | Coverage | Licence | Access | Non-US cuisines? |
|---|---|---|---|---|
| USDA FoodData Central (Foundation, SR Legacy, FNDDS) | Composition + portion/measure gram weights for foods & ingredients | Public domain | REST API (data.gov key) + CSV/JSON download | Weak; US-centric, generic ingredients |
| FDA RACC (21 CFR 101.12(b)) | ~150+ food-category reference amounts (g) per eating occasion | Public domain (US CFR) | eCFR / Cornell LII; FDA guidance PDF | No (US regulatory) |
| USDA Cooking Yields (Meat/Poultry, Rel. 2) + Nutrient Retention Factors (Rel. 6) | Raw→cooked yield %, per-nutrient retention by method | Public domain | USDA ARS PDF/data files | Generic (method-based) |
| NHANES / WWEIA + FNDDS | Real US intake portions; nutrient labels | Public domain | CDC/USDA download | US only |
| NutriBench | 11,857 meal descriptions, 11 countries, macro labels | CC BY-NC-SA 4.0 | GitHub / HuggingFace | Yes — incl. Mexico, Peru, Argentina, Italy |
| SMAE (Sistema Mexicano de Alimentos Equivalentes) | Mexican food equivalents, avg macros/group | Proprietary (book; digital tools exist) | Book + third-party digital tables | Yes — Mexican |
| INSP / INCMNSZ (Zubirán) Mexican composition tables | Mexican food composition | Government/academic | Publications | Yes — Mexican |
| Nutritionix (Syndigo) | ~1.9 M foods; ~202K restaurant items; NLP endpoint | Commercial (~$299/mo starter → ~$1,850/mo enterprise) | REST API | Some; US-chain heavy |
| Edamam | ~900K foods incl. restaurant items; NL nutrition analysis | Commercial (free tier → paid) | REST / GraphQL API | Some |
| MenuStat | US restaurant-chain menu nutrition | Research/public | Download | US chains |
| Open Food Facts | ~2.5–3 M packaged products, 180+ countries | ODbL (open) | API / download | Yes — packaged, not dishes |
| UK CoFID / EFSA–EUROFIR composition DBs | UK / EU food composition | Government | Download | Yes — European |

---

## What is still unknown (you will have to measure it)

1. **The batch-size effect on THIS pipeline.** No nutrition-specific batch-degradation curve exists. Measure batch=1 vs 3 vs 10 on per-item macro error, tracking item position (middle items are the predicted weak spot).
2. **Protein/fat/calorie accuracy specifically.** NutriBench's headline 66.82% is carbohydrates only. Fat (most preparation-sensitive) and calories from text alone are not separately benchmarked at scale — measure your own per-macro error against a lookup oracle.
3. **Whether explicit per-ingredient grams actually lowers YOUR macro error.** The mechanism is well-motivated and CoT helps in NutriBench, but the specific gain from forcing a `grams` field in your schema is unmeasured — run it as an A/B (current schema vs schema with a mandatory `grams` per ingredient).
4. **The raw-vs-cooked and whole-dish-vs-protein conventions for your specific menus.** No regulation resolves these (A2/A3); pick a convention, encode it, and validate against a sample of dishes where you can obtain true weights.
5. **Calibration of any confidence signal on this task.** ECE/AUROC of verbalized confidence and of sampling-variance have not been measured for restaurant-macro estimation; measure AUROC of your chosen signal as a predictor of "outside tolerance."
6. **Regional degradation magnitude for Mexican dishes at the dish (not meal) level**, and whether SMAE grounding closes it — untested.

---

## Contradictions

- **Are restaurant calorie counts accurate?** Urban et al. 2011's *aggregate* finding was "accurate overall" (mean difference small), and Consumer Reports (2013) found most of 17 dishes truthful — **but** the same Urban 2011 data show 19% of items off by ≥100 kcal, the 2010 reduced-energy subset averaged +18% (some items 200%, sides 245%), and a UK NRI test found half of 20 meals outside the 20% margin with some at double the stated calories. Reconciliation: **means are close; per-item variance is large and skewed for low-calorie/independent/ethnic items.** For a per-dish app, per-item variance is what matters, so treat declared counts as weak evidence.
- **Do LLMs beat dietitians?** NutriBench says unaided nutritionists (42.45% Acc@7.5) were beaten by GPT-4o CoT (60.56%) on its 72-query subset — **but** with database look-up the best nutritionist matched the model (59.72%), and on simple traditional meals nutritionists won. Reconciliation: LLMs win on speed and on complex/branded items; careful humans with lookups win on familiar simple dishes. A single-human-with-lookups oracle is a reasonable but not infallible ground truth.
- **Does RAG help?** DietGlance (arXiv:2502.01317) reports RAG improved nutrition analysis, especially for hidden ingredients in culturally-specific (Chinese) diets — **but** NutriBench's controlled head-to-head found RAG did not reliably beat CoT and hurt GPT-4o-mini. Reconciliation: RAG helps only when the retrieved units/entries match the query's serving representation; poorly-aligned retrieval adds noise.

---

## Recommendations (staged)

**Stage 1 — Do now (low cost, high expected value):**
1. **Add a mandatory `grams` field per ingredient in the JSON schema**, generated before macros, and have the model sum component macros into the totals. This operationalizes the CoT decomposition that produced NutriBench's best result and makes portion assumptions auditable. *Benchmark to change decision:* if per-item calorie error on a held-out set (vs a lookup oracle) does not improve, check whether the model is actually respecting the grams field.
2. **Encode explicit conventions** in the prompt: printed weight = main named component (raw basis unless stated), estimate sides/sauce/bread separately, apply a cooking-yield factor (~0.7 for grilled meats) when converting raw↔cooked. Emit the assumption in the output.
3. **Add an explicit `insufficient_information` path** plus a hard gate that routes name-only / no-description items (≈37% of the archive) and promotional names to it rather than guessing.
4. **Keep tolerance at ±20% calories / ±30% macro.** Matches FDA's 20% magnitude and the restaurants' own noise floor.

**Stage 2 — Measure (the unknowns above):**
5. **A/B the batch size** (1 vs 3 vs 10) with item-position tracking. If middle-item error exceeds edge-item error meaningfully, cut batch size to ≤3–4.
6. **Replace verbalized-confidence-driven suppression with sampling-agreement:** draw 3–5 samples per item (temperature > 0), take the median macro, flag high-dispersion items, and measure AUROC of dispersion vs "outside tolerance."

**Stage 3 — Grounding & regional (higher cost):**
7. **Inject authoritative portion anchors** (FDA RACC category amounts, FNDDS portion weights) into the prompt as reference values, rather than building a vector-RAG system (RAG did not reliably beat CoT for GPT).
8. **For Spanish/Mexican dishes:** keep the original-language name, and ground against SMAE / INSP–Zubirán equivalents. Consider a licensed lookup layer (Nutritionix/Edamam/MenuStat) for chain items, falling back to the LLM only for unmatched independent dishes.

---

## Caveats

- NutriBench's headline accuracy is **carbohydrate-only** and uses an **absolute ±7.5 g** clinical tolerance, not the app's ±20%/±30% — its numbers are directional, not a promise for your fat/calorie fields.
- Several precise NutriBench sub-numbers (exact GPT-4o *base* Acc@7.5; per-model RAG numbers; per-country Acc@7.5) exist only in the paper's figures, not extractable text; the per-country evidence is reported as **MAE, not Acc@7.5** (Nigeria 2.20 g best, Sri Lanka 15.12 g worst).
- The FDA 20% figure is an **asymmetric one-sided** compliance limit for under-declaration, adapted here as a two-sided estimation tolerance; the underlying magnitude, not the directionality, is what supports the ±20% choice.
- Restaurant-accuracy studies are US/UK/Canada with modest samples (Urban 2011 n=269 items/42 restaurants; the 2010 reduced-energy study n=29 restaurant foods) — treat single-study effect sizes as indicative, not settled.
- The model-choice constraint (GPT-4o) is respected throughout; fine-tuning and RAG findings are reported for completeness and context, not as a recommendation to switch models.