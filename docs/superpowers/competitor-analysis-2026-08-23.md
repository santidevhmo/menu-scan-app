# Competitor analysis + the published portion-mass literature — 2026-08-23

**What this file is.** A head-to-head measurement against a shipped competitor on two of our own
fixture menus, plus the outside research that changes what we should build next. Written because
both things arrived the same day and they say the same thing from two directions.

**What this file is NOT.** It is not an answer key. **A competitor's macro number is another
model's estimate.** Where they agree with us that is *not* evidence either of us is right — see §2,
where two independently built products produce the same error to two decimal places.

Source data: 19 screenshots Santiago captured on a 3-day trial, 2026-08-23, 3:05–3:42 pm. Only
legible values are recorded; a cut-off number is absent, never inferred. Scripts that produced
every table below are in the session scratchpad (`competitor.py`, `competitor2.py`,
`probe_hard_cases.py`, `pizza_pilot.py`, `pizza_rescore.py`).

---

## 0. Who they are

| | **Thomas AI: Eat Smart & Healthy** | **MacrosMap / MacrosMenu** |
|---|---|---|
| maker | **rockethen** — the consumer brand of **Steelkiwi Inc.**, a Ukrainian agency (100+ staff, acquired by Globaldev 2022) | **Sawyer Billings**, solo indie dev |
| released | 31 Jul 2025 | Aug 2025 |
| price | free + **$9.99/mo, $29.99/yr** | free + $1.99/wk, $8.99/mo, $24.99/yr, $39.99 lifetime |
| stack | Flutter/Dart (public GitHub); "cloud-based AI services" per privacy policy; **model/OCR not publicly determinable** | LLM ("AI estimates"); phone auth, Firebase-leaning (inferred); **model not publicly determinable** |

⚠️ **Do not plan around any inferred stack detail as if it were confirmed.** Model provider, OCR
engine, backend vendor, call counts and latency are **not publicly determinable** for either app.

---

## 1. Head to head on our own fixtures

Santiago ran **Nikkori** (sushi) and **Bistro** (pizza) — both are oracle menus, so three-way
comparison is possible.

### 1a. Sushi — we win on the two comparable dishes

| dish | THOMAS | ours (v33) | oracle band | in band |
|---|---|---|---|---|
| Salmón Roll | 340 kcal | 468 | 383–574 | them LOW, **us ✅** |
| Duplex | 350 | 450 | 509–763 | them LOW, us LOW |
| Ipanema Roll | 360 | 407 | 283–425 | **both ✅** |

### 1b. Pizza — we win decisively

| dish | THOMAS | ours (v33) | oracle band |
|---|---|---|---|
| 5 FORMAGGI | 620 | 1229 ✅ | 905–1357 |
| ALFREDO PORTOBELLO | 700 ✅ | 1036 | 566–848 |
| CAPRICCIOSA | 640 | 983 ✅ | 822–1232 |
| MEXICANA | 630 | 1106 ✅ | 821–1232 |
| FLAMENKUCHEN | 670 | 1230 ✅ | 919–1379 |

**Calorie band hits: ours 4/5, theirs 1/5.** Their spread across five very different pizzas is
**1.13×** where the oracle spans 1.63× — they return nearly the same number for a five-cheese and a
bacon-cream pizza.

---

## 2. 🔑 THE PIZZA MASS LADDER — the most important result in this file

CAPRICCIOSA is the one pizza with a full macro capture (P25 / C58 / F30). Running those through
**the oracle's own per-100 g for that dish**, protein and carbs independently agree on the plate:

| source | implied 28 cm pizza | vs USDA |
|---|---|---|
| **Thomas AI** — no structural correction | **217 g** | **0.35×** |
| **our v33** = `FORM_G['pizza_whole_thin']` = oracle midpoint | **425 g** | 0.69× |
| **USDA FNDDS 2708663** (thin crust, restaurant, meat & veg) | **620 g** | 1.00× |

🔑 **Every LLM-derived number sits below the published anchor, and the one with NO correction sits
furthest below.** The low-mass prior is therefore **not a quirk of our prompt, our model pin, or our
schema** — a different team, different stack, different prompts lands at 0.35×.

**Two conclusions, and they point opposite ways:**

- 🟢 **`FORM` is validated as an ARCHITECTURE, not just as a score.** Supplying the grams ourselves
  moved us ~2× closer to the anchor than an unconstrained pipeline gets. This is the strongest
  evidence yet for "ask the model for a CATEGORY, never for grams."
- 🔴 **We are still 31% short of the anchor**, because `FORM_G`'s pizza row was fitted to the
  oracle's own guess. See §3.

---

## 3. The pizza pilot — the benchmark was blind to a 46% mass error

Re-scored the 15 bistro pizzas three ways. `deriveBands` uses **only the mass band's MIDPOINT**,
±20%, calories by Atwater — verified by reproducing CAPRICCIOSA's shipped band `[822,1232]` exactly
from mid 425 × FDC 2708663.

| | pizzas' score, `FORM` |
|---|---|
| **A.** current band | **73.6%** |
| **B.** USDA-anchored band, `FORM_G` left at 425 | **30.4%** |
| **C.** USDA-anchored band **and** `FORM_G` anchored | **74.9%** |

🪤 **A ≈ C. The score is the SAME whether a 28 cm pizza is 425 g or 620 g** — because the answer key
and the production constant were both derived from the same guess. **Column B is the proof:** the
moment they disagree the score craters. **The benchmark was measuring agreement-with-itself, not
correctness, on 26% of its dishes.** If USDA is right, production ships pizza macros ~31% low while
the benchmark reports 74% correct.

**USDA 28 cm anchors** (interpolating g/in² across the published diameter bins — conservative; the
flat "medium 11–12 inch" row is higher):

| topping class | FDC | 28 cm |
|---|---|---|
| cheese | 2708615 | 473 g |
| pepperoni | 2708639 | 498 g |
| cheese w/ vegetables | 2708626 | 551 g |
| meat & vegetables | 2708663 | **620 g** |

**CAPRICCIOSA's own `assumed` note cites FDC 2708663 — the record that publishes 620 g.**

⚠️ 3 of 15 pizzas matched no record pulled (ALFREDO PORTOBELLO, FLAMENKUCHEN, QUESO AZUL — cream /
crème fraîche / blue cheese bases). Their shift is untrustworthy pending their own records.
⚠️ FNDDS is US survey data; local portions may be smaller. That is an answerable **venue** question,
not an unanswerable "what does a pizza weigh". **Santiago's decision, still open.**
⚠️ **If the band moves, `FORM_G`'s row MUST move with it** or you get column B.

---

## 4. Sushi — the disagreement is PIECE COUNT, not grams

FNDDS publishes **three** different per-piece weights. Production uses one row for all of them:

| roll class | FDC | g/piece | default order |
|---|---|---|---|
| vegetable | 2708966 | **22 g** | 132 g |
| filled — California / salmon / tuna / shrimp / eel | 2708960–65 | **30 g** | 180 g |
| **topped** — `Sushi, topped with salmon/tuna/crab/shrimp` | 2708967–71 | **35 g** | 210 g |

The oracle's per-piece figures are **22–31 g** — inside that spread. **So per-piece mass was never
in dispute.** What differs is pieces per order:

| | pieces |
|---|---|
| our oracle | **11** (Santiago's stated 10–12) |
| our model | **8**, on 10 of 10 rolls |
| Thomas AI (implied) | ~8 |
| USDA default order | 6 |

🟢 **8 × 35 g = 280 g = exactly `FORM_G['sushi_roll_order']`.** Unlike the pizza row, **that row is
independently corroborated** for a topped 8-piece roll.
🔴 **Neither our production nor theirs distinguishes filled from topped — a 17% mass difference
USDA publishes.** Splitting the one sushi row into veg / filled / topped × piece count is
USDA-sourced work of exactly the kind §7 calls for.

**If Nikkori serves 10–12, both apps are ~30% low and the oracle is right. If it serves 8, `FORM_G`
is right and the oracle is 25% high.** One observable fact settles it.

---

## 5. Four defects of theirs, measured

### 5a. Their calorie number contradicts their own macros — 4 for 4

Every macro is displayed as a whole number, so each carries ±0.5 g. The widest Atwater total those
rounded macros can reach:

| dish | shown | Atwater | reachable range | gap |
|---|---|---|---|---|
| Salmón Roll | 340 | 326 | 318–334 | **+14** |
| Ipanema scan 1 | 360 | 345 | 336–354 | **+15** |
| Ipanema scan 2 | 330 | 351 | 342–360 | **−21** |
| CAPRICCIOSA | 640 | 602 | 594–610 | **+38** |

Never consistent, and **the sign flips** — so it is not a fiber or alcohol adjustment, it is two
independent generations that are never reconciled. A user adding their macros by hand gets a
different total than the app shows, every time.

🟢 **Our architecture makes this impossible: our code does the arithmetic and the model never
reports a total** (START-HERE §0). Keep it. It is a real, defensible edge.

### 5b. Their ingredient list is decorative — proven twice

| dish | list they show | carbs they report | what is missing |
|---|---|---|---|
| Salmón Roll | Salmon, Cream cheese, Cucumber, Avocado, **Salmon (dup)**, Surimi | 34 g | **rice** |
| CAPRICCIOSA | Ham, Artichoke, Olives, Oyster mushroom | 58 g | **dough, cheese, tomato** |

The list is a parse of the menu's description text; the macros come from somewhere else.
**Consequence: a user cannot check their number against their own displayed reasoning.** Ours are
connected, which is the asset any verification feature has to be built on.

Also: no dedupe (a hero ingredient is prepended, so "Salmon" appears twice); "champiñón" rendered
as "Oyster mushroom"; unmatched ingredients fall back to a generic cloche icon (observed on
"Surimi" and "Artichoke"), implying a finite curated icon dictionary.

### 5c. They drift on rescan too

Same photo, 37 minutes apart:

| dish | scan 1 | scan 2 | drift |
|---|---|---|---|
| Salmón Roll | 340 | 340 | 0% |
| Duplex | 350 | 320 | **−8.6%** |
| Ipanema Roll | 360 | 330 | **−8.3%** |

Ipanema's ingredient list was **identical** both times while carbs moved 30→36 and protein held at
18 — **the same stable-label / unstable-composition split we have.** Our 38-of-57 rescan problem is
therefore **not a defect unique to us**; nobody shipping has solved it. That lowers its urgency
relative to mass and makes solving it a differentiator rather than catching up.

Restaurant name is hallucinated and unstable for the same photo: **"Sushi Bar"** then **"Sushi
Haven"** (it is Nikkori).

### 5d. Stage 1 — they collapse on dense menus

| menu | real | they extracted |
|---|---|---|
| bistro | 26 items (24 food), one section | **23** — effectively a tie |
| nikkori | 114 items (48 food), `dense: true` | **12 / 36 / 19** across three scans |

Small single-section menus are fine for them. **Dense multi-section menus are where our extraction
wins**, and it is the kind of failure that shows up in reviews.

---

## 6. What the outside research adds

Full report: `~/Downloads/compass_artifact_wf-73925184-babb-5ab8-b439-6dd1235b2bea_text_markdown.md`.

### 6a. 🔑 Nobody is good at this by eye — including professionals

**Nutrition5k** (Thames et al., Google, CVPR 2021, arxiv.org/abs/2103.03375) measured humans on
visual portion estimation: **non-nutritionists 53% error, NUTRITIONISTS 41%.** Best model 16.5%
calorie MAE; depth data cut mass error 18.7% → 13.7%.

**Our band is ±20%.** So *"I am not a nutritionist so I cannot tell whether this is right"* has an
answer: **a credentialed professional eyeballing portions is worse than our band width.** The
oracle is not weak for want of a credential — it is weak exactly where it has **no published
source**. Looking a number up beats any expert's estimate. This is why the FNDDS direction matters
more than hiring a nutritionist would.

### 6b. The low-mass prior is peer-reviewed

**Fridolfsson et al. 2025** (Current Developments in Nutrition, PMC12513282): GPT-4o, Claude 3.5 and
Gemini 1.5 on weighed food photos **all systematically UNDERESTIMATE large portions.**

That is now **four independent confirmations**: eval 175's 300 g pizza, our own 0.65× on Salmón
Roll, Thomas AI's 0.35× on a pizza, and this paper. ☠️ **Stop looking for a prompt that fixes it.**

### 6c. Identify-then-look-up is the published answer

**Menu-Match** (Beijbom et al., Microsoft Research, WACV 2015): restaurant plates are nutritionally
consistent across servings, so **identify-then-look-up beats volume estimation** (32 ± 7.2 kcal
absolute error). Peer-reviewed support for the FORM architecture.

**DietAI24** (Nature Comms Medicine 2025, s43856-025-01159-0): MLLM + **RAG grounded in FNDDS** — a
published architecture for making the gram table a **lookup** instead of a hardcode.

**Two-step MLLM prompting** (Khlaisamniang et al., CVPR-W 2025): decompose into ingredients +
portions + cooking method, *then* compute. Beats one-step. Validates our Stage-2 split.

### 6d. FNDDS ships as flat files

**~30,000 portion weights over ~5,624 food codes, CC0 public domain**, downloadable from the Food
Surveys Research Group. **Portion anchoring needs no per-scan API call.**

### 6e. Two competitive facts worth knowing

- ☠️ **MacrosMap already ships sort-by-protein / calories / carbs / fat.** Our goal-sorting is
  **table stakes, not a moat.** What is left as a differentiator is the **anchored gram weight**
  (no competitor shows mass) and non-English menus.
- 🟢 **Neither app cites any nutrition database.** No USDA/FNDDS/Nutritionix attribution anywhere.
  MacrosMap's founder on the record: their portion mechanism *"does factor in average restaurant
  portion sizes"* — i.e. **a prompt assumption with no physical anchor**, exactly what we measured.
- MacrosMap's top negative review is **about missing portion sizes**. That is the lane.

⚠️ **Treat as marketing, not evidence:** PlateLens's "±1.2% MAPE" and SnapCalorie's ~15% claim.
±1.2% is not physically plausible when Nutrition5k reaches 16.5% under controlled conditions **with
depth data**.

---

## 7. 🎯 What this changes about `FORM_G`

**Santiago's objection, 2026-08-23:** a hardcoded table limits precision to hardcoded categories.
What about a cup of raw seafood, a soup, a plate of corn + meat + mashed potatoes, chilaquiles?

**HE IS RIGHT, AND THE NUMBER IS 33%.** `FORM_G` sizes **33% of candidate dishes on menus it was not
built from**, against 82% on the five it was. A miss returns `other` → null → the dish keeps the
dual-pass answer, so **nothing regresses — but ~2 of 3 dishes on a new menu gain nothing.**

**THE FIX IS NOT MORE ROWS.** Probed FNDDS live for his exact cases. Every one exists:

| his case | FNDDS record | published portion |
|---|---|---|
| **chilaquiles** | FDC 2708505 | **170 g / cup** |
| raw seafood cup — ceviche | 2706463 | 250 g / cup |
| raw seafood cup — aguachile-like | 2706449 shrimp cocktail | 250 g / cup |
| soup — tortilla | 2709162 | 525 g / can |
| soup — pozole | 2707129 | 245 g / cup |
| mashed potato **from restaurant** | 2709500 | 250 g / cup |
| enchiladas | 2708566 | 170 g / cup |
| hot cakes **restaurant** | 2708299 | 150 g |

So `FORM_G` wants to be a **LOOKUP into FNDDS**, not a hardcoded enum — same architecture (we supply
the grams, the model never guesses mass), thousands of forms instead of eighteen, every gram citable.

🪤 **THE REAL OPEN PROBLEM IS RETRIEVAL, NOT COVERAGE.** Naive text queries mismatch badly and this
has now bitten four times:

| query | what FNDDS returned |
|---|---|
| `"vegetables grilled"` | **"Scallops, grilled"** |
| `"corn on the cob"` | "Corn, canned, cooked with oil" |
| `"beef with potatoes and vegetables"` | "Beef shish kabob with vegetables, **excluding potatoes**" |
| `"taco beef soft"` (earlier session) | **broccoli** |

Matching a menu line to the right food code **is** the work. DietAI24 (§6c) is a published
architecture for it.

**THE GENUINELY UNSOLVED CASE IS THE COMPOSITE PLATE.** FNDDS has each *component's* portion weight
but no record for an arbitrary combination. This is where **Santiago's original recipe-ratio idea is
correct**: split the plate into components, look up each component's published portion, sum. Same
instinct as his 60/40 steak-and-fries split, except each side's grams are **sourced** rather than
guessed.

⚠️ **Design direction, NOT a measured result.** Run `superpowers:brainstorming` before designing the
eval. Cheapest first test: measure FNDDS match quality over the 5 archived menus that have no
oracle — coverage is measurable there even though score is not.

---

## 8. Product decisions this settles for free

| decision | evidence |
|---|---|
| **Show the assumed grams.** No competitor does; MacrosMap's top negative review is about its absence | §6e |
| **Ship a hedge, and copy the wording.** Thomas AI's (i): *"Values are estimates. May vary depending on recipe and portion size."* Footer: *"Always double-check ingridients with the restaurant, recipes may vary."* (their typo). MacrosMap: *"a lighthouse not a source of truth"* | screenshots + report |
| **Keep code-does-the-arithmetic.** Their kcal contradicts their own macros 4/4; ours cannot | §5a |
| **Keep the ingredient list connected to the macros.** Theirs is decorative, so their output cannot be verified by a user or a checker | §5b |
| **A "refine portion" tap (small/regular/large) is worth prototyping.** MacrosMap converts the same weakness into a user-assisted correction | report §1 |
| **Goal-sorting is not a moat** — MacrosMap ships it | §6e |
