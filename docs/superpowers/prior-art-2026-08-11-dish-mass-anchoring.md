# Prior-Art Research: Anchoring Per-Dish Served Mass for Menu-Text Nutrition Estimation

## TL;DR
- **Your per-DISH served-mass gap is real and largely unsolved by any single shippable dataset.** No public database gives "typical total served mass by dish type" worldwide; portion data is either per-ingredient (USDA FNDDS, Mexico SMAE, Japan food-balance guide, UK Food Portion Sizes) or per-menu-item and US-chain-only (MenuStat, Nutritionix). The strongest defensible move is to distil a small, shippable dish-type → typical-mass table from USDA FNDDS/FoodData Central composite-dish portion weights (public domain) plus Japan/EU references, and use it to calibrate and clamp an LLM dish-level mass output — not to look up every dish.
- **The literature strongly backs decoupling mass from composition.** Nutrition5k found predicting calories-per-gram (portion-independent) gave 9.5% MAE vs 26.1% for direct calorie prediction; two-step "decompose-then-compute" LLM prompting beats one-step direct queries; database-grounding (DietAI24) cut weight-estimation MAE 63%. But **no paper implements your exact "estimate one dish-level total mass, then rescale the ingredient breakdown to it" mechanism** — it appears novel, not a known dead end.
- **Commercial apps do not solve this cleanly either:** they lean on crowd-sourced/verified per-item entries with a fixed "1 serving" unit and force the user to edit the portion. The evidence-based UX is a point estimate shown as an **editable default** (numeric ranges do not significantly reduce trust; verbal hedges do), plus a piece count so a diner can log part of an order.

## Key Findings

1. **There is no worldwide "served mass by dish type" table you can license and ship.** Candidates split into (a) per-ingredient reference systems (USDA FNDDS portions, Mexico SMAE, Japan's food-balance guide, UK CoFID/Food Portion Sizes) and (b) per-menu-item nutrition (MenuStat, Nutritionix, Edamam, FatSecret), which are overwhelmingly US/Western and frequently omit gram weights.
2. **USDA FoodData Central / FNDDS is your best primary source of composite-dish portion weights and is public domain.** FNDDS 2021–2023 contains 5,432 food/beverage items (4,827 foods, 605 beverages), each with 65 nutrients per 100 g edible portion; the Food Weights file holds 35,000+ named-portion gram weights ("1 slice," "1 piece"). Many codes are composite "as consumed" dishes. It ships offline or via the FDC REST API. Non-US cuisine coverage is thin.
3. **The mechanism you propose is not published in that exact form**, but every adjacent result supports the direction: mass/portion is the dominant error term, and factorizing it out beats accumulating it.
4. **LLMs show a documented systematic bias** — underestimating large portions — that is the mirror image of your "more ingredients → more mass" inflation, so your anchor targets a real, measured failure mode.
5. **For uncertainty display, editable defaults win.** Numeric ranges around a point estimate do not significantly reduce user trust; verbal hedges reduce it more. The behavior that matters is whether users adjust the default, so anchor + one-tap edit is the evidence-based choice.

## Details

### A) Table of candidate sources

| Source | What it actually is | Coverage / non-US | Licence | Runtime vs ship | Solves your per-DISH mass gap? |
|---|---|---|---|---|---|
| **USDA FNDDS Portions & Weights + FoodData Central** | Application DB behind NHANES/WWEIA. FNDDS 2021–2023 = 5,432 food/beverage items (4,827 foods, 605 beverages), 65 nutrients per 100 g; Food Weights file has 35,000+ portion weights in grams, each tied to a 5-digit portion code and a text description ("1 slice", "1 piece"). Many codes are composite "as consumed" mixed dishes. | US food supply; some ethnic dishes as consumed in the US; not built for non-US cuisine. | Public domain (US Gov). Bulk ASCII/Excel download permitted; FDC also has a REST API. | **Both** — ship the flat files, or query FDC API at runtime. | **Best available.** Named-portion gram weights for many composite restaurant-style dishes. Gap: not exhaustive, US-centric. |
| **WWEIA / NHANES 24-hr recall gram weights** | Individual-level recall records with consumed gram amounts per FNDDS food code; enables empirical percentile distributions of grams consumed per dish. | US population only. | Public domain. | Ship (large; better as calibration input than runtime). | Partially — real consumed-mass distributions per food code, ideal for calibrating a prompt/table, not a runtime service. |
| **MenuStat (NYC DOHMH)** | Restaurant-chain menu nutrition, 66+ top US chains, coded by food category, linked over years; free Excel/CSV (Harvard Dataverse). | US national chains only. | "No license information provided"; public/non-federal terms; free download. | Ship. | Weakly — has calories/macros but documented gaps in serving weights; US-chain only. |
| **Nutritionix** | Commercial DB: ~1.9M items, 600+ restaurant chains monitored, natural-language endpoint; 250M+ queries/month. | US-centric; limited non-US; partial Chinese names. | Commercial API; free tier 200 calls/day w/ attribution; paid tiers to ~$1,850+/mo enterprise. Caching/offline restricted by ToS. | Runtime API (can't ship the DB). | For US chains yes (per-item), but violates your "no large proprietary DB / must generalize worldwide" constraint. |
| **Edamam** | NLP recipe/nutrition analysis, 900k+ foods, natural-language parsing. | US-focused. | Commercial; free tier restrictive; up to ~$999/mo. | Runtime API. | No — recipe/ingredient nutrition, not dish served mass. |
| **FatSecret** | Commercial platform API, barcode + branded/restaurant data. | Multi-region but Western-weighted. | Commercial API; caching restricted. | Runtime API. | No per-dish mass anchor beyond per-item entries. |
| **Open Food Facts** | Crowd-sourced packaged-product DB, 4.6M+ products; per-100g + per-serving. | Global on packaged goods; **almost no restaurant menus or composite dishes.** | ODbL (attribution + share-alike); full bulk export encouraged; API for 1 call = 1 real scan. | **Ship** (bulk export) or API. | No — packaged goods only; explicitly not restaurant/recipe data. |
| **Mexico SMAE (INSP / FNS)** | "Equivalent portion" system: per-food serving sizes in grams by group (animal protein = 7 g protein/equiv; fat = 5 g lipid/equiv; fruit = 15 g carbohydrate/equiv). | Mexican foods; per-ingredient/equivalent, not per-dish. | Proprietary book (FNS), purchasable; not open bulk data. | Ship a small derived table only. | No — per-ingredient equivalents, same layer as RACC. Useful only for Mexican ingredient portions. |
| **Japan food-balance guide (食事バランスガイド, MAFF/MHLW)** | "SV (serving)" unit system: 1 SV staple = 40 g carbohydrate (rice small bowl 100 g, bread 1 slice); side dish = 70 g net; main dish fish = 2 SV, meat = 3 SV per serving. | Japanese cuisine; dish region defined by main-ingredient weight. | Government, freely published (MAFF PDFs). | Ship small table. | Partially — dish-level SV counts and gram anchors for Japanese dishes; conceptually the closest non-US "per-dish" reference. |
| **EFSA Comprehensive European Food Consumption DB + FoodEx2** | Consumption data (g/day) from 21+ EU countries' national surveys, classified in FoodEx2 hierarchy (levels 1–7, e.g., "cakes" → "cheese cream sponge cake"), 1,500+ food types. | 21+ EU countries; strong European coverage. | Free download (CSV); EFSA terms. | Ship or dashboard. | Partially — consumption amounts (not restaurant-serving mass), usable to derive per-dish distributions for EU foods. |
| **UK CoFID + "Food Portion Sizes" (FSA/MAFF handbook, 3rd ed.)** | CoFID = 3,423 foods composition (open gov data). "Food Portion Sizes" = companion book of typical served portions incl. composite dishes. | UK. | CoFID Open Government Licence; portion-sizes book is a purchasable FSA publication (not open bulk data). | Ship CoFID; portion book must be transcribed to a small table. | Partially — the FSA portion book is one of few explicit "typical served portion" references for composite dishes, but not openly licensed for bulk shipping. |
| **National food composition tables (MEXT Japan Standard Tables, etc.)** | Composition per 100 g. | Japan; other national tables similar. | Government-published. | Ship. | No — composition per 100 g, not served mass. |

**Interpretation:** The only sources that directly give a per-DISH served mass are (i) USDA FNDDS/FDC composite-dish portion weights (public domain, shippable — your best bet), (ii) the Japan food-balance-guide SV anchors and the UK "Food Portion Sizes" book (small, region-specific, partly non-open), and (iii) restaurant-chain PDFs (US-only, per-item). None generalizes worldwide alone. The realistic architecture: **ship a small, curated dish-type → typical-mass table distilled from FNDDS/FDC + Japan SV + EU FoodEx2 distributions, and use it to calibrate/validate/clamp the LLM's dish-level mass output.**

### B) Concrete portion numbers (each with source)

**Sushi (maki / uramaki):**
- **USDA FNDDS lists 1 piece of a California (uramaki) roll = 30 g** (FoodData Central, "Sushi Roll California," FDC ID 2344446) — the primary, government-measured per-piece figure.
- Uramaki are almost universally cut into **8 pieces per roll** in US restaurants; traditional maki is **6 or 8**. Elaborate full rolls ≈ 160–200 g; hosomaki (thin) ≈ 60–90 g (secondary culinary sources, used only to bracket the FNDDS number).
- Per-piece range across secondary sources: **30–50 g/piece** by roll thickness.

**Pizza:**
- **USDA defines the standard portion as "1 slice = 1/8 of a 14-inch pizza"** (FoodData Central data dictionary).
- **Papa John's 14" cheese, original crust: 1 slice = 117 g; whole pie = 938 g** (FoodData Central, USDA Standard Release source).
- **Domino's 14" pepperoni, crunchy thin crust: 1 slice = 79 g; whole = 563 g** (FoodData Central).
- Regional variation: chain "large" = 14" (Domino's/Pizza Hut/Papa John's), but NY-pizzeria and Costco "large" = 18". Area scales with diameter², so an 18" slice ≈ 1.65× a 14" slice; a Costco 18" slice ≈ 310–370 g (secondary).

**Taco:**
- **Taco Bell Original hard taco (beef, cheese, lettuce) = 69 g** (FoodData Central, FDC ID 170332; 158 cal, 6.1 g protein, 8.8 g fat) — government-measured.

**Chicken wings:**
- **USDA: an average uncooked whole chicken wing ≈ 102 g** (3 segments: drumette + flat + tip).
- Peer-reviewed segment weights: **bone-in drumette ≈ 39.9 g, bone-in flat/winglet ≈ 30.7 g** (poultry-science measurement) — the relevant unit since restaurant wings are served split.
- Standard restaurant orders: **6, 10, 15, 20, 30 count** (Buffalo Wild Wings published nutrition; 6-count traditional bone-in = 430 cal, 53 g protein).
- A cooked wing loses ~25% weight; edible portion per served segment ≈ 30–34 g.

**Burrito:**
- **Measured whole Chipotle burrito ≈ 566 g** (independent physical weighing, Cockeyed weight project).
- A complete assembled Chipotle chicken burrito ≈ **1,065–1,085 cal, ~52–61 g protein, ~87–123 g carbs, ~34 g fat** (community calculators built on Chipotle's official nutrition PDF; flour tortilla alone ≈ 320 cal). Chipotle measures fillings by gram weight per scoop, so its official PDF is a good primary source for per-ingredient grams.

**Salad:**
- Restaurant entrée salads are **not published in grams** by chains; Panera reports by assembled "1 Salad"/"½ Salad" unit (e.g., Asian Sesame Chicken whole = 530 cal, 29 g protein). Estimate a full entrée salad ≈ 200–350+ g. **Flag: no clean government primary source for total salad mass.**

**Restaurant entrée context (measured):**
- A cafeteria pasta entrée was **248.4 ± 0.4 g (standard, ~422 kcal) vs 376.6 ± 0.6 g (large, ~633 kcal)** in a controlled restaurant experiment; the larger portion increased entrée energy intake by 43% / 172 kcal (Diliberti et al., *Obesity Research* 2004;12(3):562–568).
- FDA reference amounts: entrée without sauce = 85 g, entrée with sauce = 140 g (regulatory reference, not served mass).
- Across 245+ chains / 30,923 menu items: entrées averaged 674 cal, appetizers 813, sides 260, salads 496, desserts 429 (*AJPH* 2014).

### C) What we would steal (decision-oriented)

**1. Portion-independent factorization (Nutrition5k) — highest-evidence idea.**
Nutrition5k (Thames et al./Google, CVPR 2021, arXiv 2103.03375) reports verbatim: *"Predicting direct calories compared to calories per gram increases the MAE nearly 3x from 9.5% to 26.1%. This demonstrates the substantial increase in complexity of the challenge when portion estimation is required."* Their volume-assisted mass model reached 13.7% mass error and 16.5% end-to-end calorie MAE. **Steal:** treat dish mass as a single quantity estimated in its own right (your dish-level anchor), then apply per-gram composition — the opposite of summing independent ingredient masses. **Cost:** one extra LLM field + the rescale step you already have. **Evidence caveat:** the 3× gain was calories-per-gram vs direct-calories, not "single mass vs summed masses," so validate on your own data.

**2. Two-step decompose-then-compute prompting (Khlaisamniang et al., CVPR 2025 Workshop; IEEE Xplore doc 11147941).**
A nutritionist-inspired two-step MLLM prompt (step 1: list ingredients + portions + cooking; step 2: compute totals) **beat one-step direct queries** on a Nutrition5k subset and real app data. **Steal:** keep decomposition and totals as separate reasoning stages; add your dish-mass anchor as a top-down constraint on step 1. **Cost:** prompt engineering only. **Evidence:** qualitatively established (two-step > one-step); the paper's exact MAE cells were not extractable — pull their Table 2/3 before quoting numbers.

**3. Database-anchoring (DietAI24, Yan et al., *Nature Communications Medicine* 2025;5:458, doi 10.1038/s43856-025-01159-0).**
Grounding the MLLM in FNDDS via retrieval (rather than trusting internal numbers) achieved verbatim *"a 63% reduction in MAE for food weight estimation... when tested on real-world mixed dishes (p < 0.05)"*, with per-dish MAE of **47.7 kcal (calories) and 49.4 g (mass)**, cutting errors 76–83% for calories vs baselines. **Steal:** use your small shipped FNDDS/FDC-derived table to sanity-check or clamp implausible LLM dish-mass outputs. **Cost:** ship a small table + a validation/clamp step. **Evidence:** anchoring to an authoritative reference is the single most effective error reducer reported.

**Uncertainty display (HCI literature):** Show a point estimate as an editable default, optionally with a numeric range. In a 5,780-person PNAS 2020 study (van der Bles, van der Linden, Freeman & Spiegelhalter, PNAS 2020;117(14):7672–7683), communicating uncertainty produced only *"a small decrease in trust in numbers and trustworthiness of the source, and mostly for verbal uncertainty communication"* — i.e., numeric ranges are nearly trust-neutral while verbal hedges ("about," "some uncertainty") cost more trust; narrow ranges are received better than wide ones (Royal Society Open Science 2023). Behaviorally, the lever that matters is whether users adjust the default, so make the anchor a one-tap-editable default and expose a piece count (maki pieces, pizza slices, wings) so a diner can log part of an order.

### D) Is the dish-level anchor a known dead end?

**No — and the evidence leans the other way, though it is thin on your exact mechanism.**

- **The exact mechanism (estimate one dish-level total served mass, then rescale/constrain the ingredient decomposition to it) appears unpublished.** No paper tests "LLM total dish weight vs sum of ingredient reference weights" head-to-head. This is a genuine prior-art gap — a plausible novelty, not a documented failure.
- **All adjacent evidence supports the direction:** portion/mass is repeatedly the dominant error term (multiple VLM studies), factorizing mass out beats accumulating it (Nutrition5k 9.5% vs 26.1%), decompose-then-compute beats one-step (CVPR 2025), and DB-anchoring cut weight MAE 63% (DietAI24).
- **Your specific failure mode is documented and your anchor targets it.** LLMs show systematic underestimation that grows with portion size: in O'Hara et al. (*Nutrients* 2025, 114 meal photos), *"ChatGPT-4 underestimated the weight for 87 out of 114 meals (76.3%)"* — mean estimated vs actual was 425.8 g vs 580.5 g (medium) and 529.5 g vs 798.1 g (large), p < 0.001. In Rodríguez-Jiménez et al. (*Journal of Nutrition*/ScienceDirect, PMC12513282, 2025): *"ChatGPT and Claude demonstrated similar accuracy with MAPE values of 36.3% and 37.3% for weight estimation, and 35.8% for energy estimation. Gemini showed substantially higher errors across all nutrients (MAPE 64.2%–109.9%)... All models exhibited systematic underestimation that increased with portion size, with bias slopes ranging from −0.23 to −0.50."* ChatGPT-4 on 150 foods had ~16.8% MAE, best on simple foods and **worst on mixed dishes** — precisely where your ingredient-count inflation bites.
- **One caution (a soft negative):** naive LLM summation is unreliable even when given the ingredient list and quantities — a text-only 24-hr-recall study found a non-fine-tuned LLM "did not produce accurate predictions" for energy/macros until fine-tuned. Implication: the dish-mass anchor helps, but the *composition* step still needs database grounding or calibration; the anchor alone won't fix macro errors.

**Net:** proceed with the dish-level anchor + piece count. It is theoretically well-supported, targets a measured bias, and is novel enough that you should run your own ablation (summed-ingredient mass vs LLM dish-mass anchor vs FNDDS-clamped anchor) and publish the r-value improvement — because no one has.

## Recommendations

1. **Immediately: add a dish-level "typical total served weight" field to the LLM output and rescale ingredients to it.** Keep your existing per-ingredient composition. Benchmark against your current pipeline on the 48-item sushi menu: the success threshold is driving the ingredient-count correlation (currently r = 0.74, +32 g/ingredient) toward zero. If r stays > 0.4 after anchoring, the LLM's own mass estimate is ingredient-count-contaminated — then go to step 2. To pre-empt that, **prompt for the dish mass BEFORE the ingredient list** so the total can't be inflated by the enumeration.
2. **Ship a small (~few-hundred-row) dish-type → typical-mass table distilled from USDA FNDDS/FoodData Central composite-dish portion weights, plus Japan food-balance-guide SV anchors and EU FoodEx2 distributions for non-US coverage.** Use it to clamp implausible LLM totals (DietAI24-style), not to look up every dish. All three are public/government and legally shippable; avoid Nutritionix/Edamam/FatSecret (commercial, US-centric, non-shippable).
3. **Add a conventional piece count** (maki pieces, pizza slices, wings, taco count) as a separate field so diners log partial orders. Seed conventions from FNDDS ("1 slice = 1/8 of a 14-inch pizza") and chain norms (uramaki = 8 pieces; wings in 6/10/15/20).
4. **Display the anchor as an editable default with an optional numeric range; avoid verbal hedges.** One-tap edit is what users act on.
5. **Run and publish an ablation** (summed vs anchored vs clamped) with MAE/MAPE and the r-value — this is an open question and would be genuinely novel.

**Thresholds that change the plan:** If LLM dish-mass MAPE on your held-out weighed set exceeds ~35% (the general-LLM baseline from Rodríguez-Jiménez et al.), the direct-ask isn't adding value — fall back to FNDDS-table lookup keyed by an LLM dish-type classifier. If ingredient-count correlation persists after anchoring, force the mass estimate to be produced before the ingredient list in the prompt.

## Caveats
- Many per-piece/per-slice figures in circulation are blog estimates; I anchored on USDA FoodData Central/FNDDS and peer-reviewed sources where possible and flagged where only secondary sources exist (salad total mass, some sushi/pizza brackets).
- USDA portion weights are built for US dietary surveillance and may not reflect non-US restaurant servings; treat them as a starting calibration, not worldwide ground truth.
- The two-step CVPR 2025 paper's exact MAE numbers could not be extracted; only the qualitative result (two-step > one-step) is confirmed.
- Commercial-app accuracy claims (e.g., SnapCalorie ~15% mean caloric error, grounded in the published Nutrition5k dataset; Cronometer ±3.5% via manual search) are largely self-reported or from review sites, not independently peer-reviewed.
- Your mechanism being unpublished cuts both ways: no evidence it fails, but also no external validation — your own ablation is essential.