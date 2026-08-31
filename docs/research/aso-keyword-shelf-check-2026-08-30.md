# ASO shelf & keyword check — 2026-08-30

**What this is.** The `aso` skill run *backwards*. Menu Scan has no listing, so there is nothing to
audit. Instead this tests one claim in `.agents/product-marketing.md` against the competitors'
listings and against App Store search itself.

**The claim under test** (`product-marketing.md`, "Product category (the shelf)"):

> **Health & Fitness**, sub-shelf *nutrition / eating out*. […] Forq ships the closest feature list
> in the market and sits in **Food & Drink**, where nobody with nutrition intent is searching, and
> has **1 rating in 3 months**. Same product, wrong shelf.

**Nothing here says anything about Menu Scan's own performance.** It has no listing, no downloads,
no ratings, and none are claimed.

---

## Verdict

| Part of the claim | Verdict |
|---|---|
| "List in Health & Fitness" (the *decision*) | ✅ **Supported** — but by different evidence than the doc cites |
| "Food & Drink is where nobody with nutrition intent is searching" (the *mechanism*) | ❌ **Contradicted** |
| "Forq's 1 rating is explained by the wrong shelf" (the *inference*) | ❌ **Unsupported** — Forq is findable and still has 1 rating |

**In one line:** keep Health & Fitness, delete the reasoning. The shelf is right for a reason the
doc does not state, and the Forq sentence is a false inference that will mislead every downstream
skill that reads it.

---

## Q1 — Which shelf are they actually on, and does the shelf explain traction?

### The six, from primary source

`primaryGenreName` read from the iTunes lookup JSON already in this repo
(`docs/research/competitor-profiles/raw/<slug>/2026-08-30/itunes-*.json`), re-verified today.

| App | Primary | Secondary | Ratings (US) | Age |
|---|---|---|---:|---|
| Cal AI | Health & Fitness | Food & Drink | 359,755 | 2y 5m |
| Carb Manager | Health & Fitness | Lifestyle | 734,055 | 15y 8m |
| MenuFit | Health & Fitness | Food & Drink | 54,084 | 1y 0m |
| FoodieFit | Health & Fitness | *(none)* | 725 | 4m |
| Menu Order AI | Health & Fitness | Food & Drink | 69 | 9m |
| **Forq** | **Food & Drink** | Travel | 1 | 2m |

The doc's five-of-six category read is **confirmed**. Note the pattern it misses: four of the five
H&F apps carry **Food & Drink as their *secondary* genre**. The market's answer is not "H&F instead
of F&D" — it is "H&F primary, F&D secondary." That is a free slot the doc never mentions and should
be taken.

### Does the shelf predict traction? A real denominator

The six is too small a sample to answer this, so I widened it. 40 queries × 3 storefronts against
the iTunes Search API returned **795 unique apps**, of which **172 have "menu"/"menú" in the title**
and **64 of those are nutrition- or scan-intent** (title contains scan/calor/macro/nutri/diet/
healthy/protein/keto/fit or their Spanish equivalents). Sorted by rating count:

| Rating band | n | Health & Fitness | Food & Drink |
|---|---:|---:|---:|
| 0 ratings | 48 | 14 (29%) | 28 (58%) |
| 1–9 | 8 | 4 (50%) | 4 (50%) |
| **≥10** | **8** | **6 (75%)** | **2 (25%)** |

H&F share rises monotonically with traction: 29% → 50% → 75%. That is the doc's conclusion, now
with a denominator instead of one anecdote.

**But read the top band honestly — n=8, and two of the eight contradict the story:**

| Ratings | Category | App |
|---:|---|---|
| 54,084 | H&F | MenuFit - Healthy Eating Out |
| **117** | **F&D** | **MacroMenu - Eat Out, Stay Fit** |
| 98 | H&F | MenuPal - Healthy Eating Out |
| 40 | H&F | Menue AI - Calorie Tracker |
| 20 | H&F | Menu AI - Restaurant Calories |
| 16 | H&F | MenuScore: Eat Out Healthy |
| **15** | **F&D** | **SeEat: AI Menu Scanner** |
| 12 | H&F | Nellie - AI Menu Scanner |

MacroMenu — Food & Drink, subtitle *"Macro-Friendly Meals Anywhere"*, description opening *"Know
exactly what to order at every restaurant… for YOUR fitness goals — whether you are bulking,
cutting, or maintaining"* — is unambiguous nutrition intent on the F&D shelf, and it has **117× Forq's
ratings**. The shelf did not stop it.

### The mechanism in the doc is wrong

The doc says F&D is "where nobody with nutrition intent is searching." Measured across all 40
queries and 1,549 returned result slots:

| | Top-10 slots | All slots |
|---|---:|---:|
| Health & Fitness | 164 (45%) | 611 (39%) |
| **Food & Drink** | **129 (36%)** | **546 (35%)** |

Food & Drink apps take **more than a third of the top-10 positions on nutrition-intent queries.**
`Menu AI: Calorías & Macros` (F&D, ≤3 ratings) ranks **3rd of 37 in MX and 3rd of 38 in ES** for
`calorías menú restaurante`. Category is not a search filter and does not gate visibility on these
queries. Any H&F→traction link must run through **browse, charts and editorial**, not search — and
none of those are measurable with free tools.

### Forq's failure is not a shelf failure

Forq is on Food & Drink and is **findable anyway** — every appearance across the 40 queries:

| Storefront | Query | Position |
|---|---|---|
| MX | `calorias menu restaurante` | **2 of 22** |
| MX | `escaner de menu` | **4 of 48** |
| MX | `calorías menú restaurante` | 4 of 37 |
| MX | `traductor de menus` | 5 of 47 |
| MX | `menu calorias` | 9 of 46 |
| MX | `menú calorías` | 12 of 45 |
| MX | `escanear menú` | 18 of 48 |
| ES | `alérgenos menú` | 13 of 30 |
| ES | `traductor de menús` | 26 of 44 |
| ES | `escáner de menú` | 45 of 46 |
| US | `menu scanner` | 42 of 50 |

An app that ranks 2nd and 4th on its home storefront's core query and still has **1 rating in 3
months** does not have a discovery problem attributable to its category. The remaining candidate
explanations — solo developer (Aleksei Artemev), no marketing site beyond a Vercel subdomain, 2
months old at measurement, and a **subtitle that sells a different job** (*"Your paper menu,
beautifully digital"* — visual menu, not nutrition) — are not separable with free tools, but the
category one is now ruled *out*, not in.

**Recommended replacement wording for the doc** (the main session decides; this file does not edit it):
list Health & Fitness primary / Food & Drink secondary, because 6 of the 8 traction-band
menu-nutrition apps sit there and because MenuFit, Cal AI and Menu Order AI all use exactly that
pair — **not** because Forq's category cost it users.

---

## Q2 — What is this category actually competing on?

### Finding A: the category is a keyword land grab, and it is already crowded

Of the **172 menu-named apps** surfaced, **141 have fewer than 5 ratings**. The names are not brands,
they are keyword strings: `Menu Scanner: Calorie Counter`, `LeanMenu: Menu Calorie Scan`,
`MenuLens - AI Calorie Counter`, `Snackly: Menu Calorie Scanner`, `ProteinMenuScanner`,
`CalorieMenuScanner`, `MenuWise: AI Menu Scanner`, `Gusta / Gustia / Magic Menu / TasteScan /
MenuMuse / DishLens / TasteLens`. Token frequency across those 172 titles:

| token | n | token | n |
|---|---:|---|---:|
| menu | 99 | traductor | 12 |
| menú | 36 | ia | 11 |
| ai | 34 | menús | 11 |
| scanner | 29 | qr | 9 |
| translator | 19 | scan | 8 |

**Consequence for the name "Menu Scan":** it is contested. Already shipping: `Menu Scanner: Eat
Healthy` (H&F), `Menu Scanner: Calorie Counter` (F&D), `Menu Reader - MenuScan` (F&D), and — on the
Mexican storefront — **`Menú Scan: Contador Calorías`** (H&F). Apple will not reject a similar name,
but the brand is not ownable as a search term.

### Finding B: the positioning is already on the shelf, verbatim

`Menu Calories: Dining Tracker` — Health & Fitness, US, too few ratings to display — subtitle
`Menu Scanner: Eat Out Healthy`, description opening (fetched today):

> *"Point your camera at any menu — local spots, any country, any language. **No restaurant
> database, no made-up dishes, honest estimates.**"*

That is `product-marketing.md` differentiators #1 (reads the menu, not a database), #3 (any
language) and the honesty-over-precision stance, in one sentence, already published. Its Spanish
twin `Menú Scan: Contador Calorías` opens with *"…sin adivinar, **sin buscar en base de datos** uno
por uno."*

This does **not** falsify the wedge — both have zero traction, which is consistent with the doc's own
"positioning alone does not buy traction" finding about Menu Order AI. It does falsify any copy that
implies we are the only ones saying it.

### Finding C: "scan" is a poisoned token; "menu scanner" is not

The bare verb collides with QR readers. `us|scan menu`: positions 1, 2 and 6 are
`QR Code Reader & Code Scanner` (45,913r), `Scan App +` (7,050r), `Scan Menu AI`. Menu Order AI is
**47th of 49**. Same in Spanish — `mx|escanear menu` returns QR scanners and QR-menu *builders* at
1–3 and **none of the six competitors at all**; `mx|escanear menú` puts `Creador de Menú QR Digital`
and `QR Scanner Pro` in the top 3.

The two-word phrase behaves completely differently. `us|menu scanner` returns
`Menu Scanner - Eat Healthy` (1), `SeEat: AI Menu Scanner` (2), `Scan Menu AI` (3) — QR readers do
not appear until 6. **Use the noun phrase, never the bare verb.**

### Finding D: the queries worth targeting, ranked by what they actually return

| Query | n | Who is there | Read |
|---|---:|---|---|
| `menu nutrition` | 43 | MenuFit **1**, Menu Order AI 3, FoodieFit 15 | Cleanest intent match in English. Uncontested by giants. |
| `menu calories` | 44 | *Menu Calories: Dining Tracker* 1, MenuFit 2, Cal AI 3 | Highest-value. Note position 1 is a 0-rating exact-name match — Apple weights the title hard. |
| `restaurant calories` | 39 | MenuFit **1**, FoodieFit 3, Cal AI 22 | Incumbent-owned. |
| `eating out calories` | 48 | MenuFit **1**, FoodieFit 2, Cal AI 15 | The category's own phrase. |
| `healthy eating out` | 46 | MenuFit **1**, FoodieFit 15 | MenuFit's literal subtitle. Hard to take. |
| `high protein restaurant` | 48 | MenuFit **1**, Menu Order AI 39 | Goal-sort intent, thin field. |
| `glp-1 restaurant` | 44 | Menu Order AI **1** | Owned outright by a 69-rating app. Cheap to enter, small. |
| `menu scanner` | 50 | Forq 42; top 5 are all sub-15-rating apps | **Wide open at the top.** No incumbent. |
| `allergens menu` | 45 | **none of the six** | Whitespace. Top result `Gustia: Allergen Menu Scanner`, 0 ratings. |
| `what to order` | 48 | **none of the six** | Dead. Owned by Taco Bell, Sonic, Panera, Grab — delivery/chain intent, not nutrition. **Do not target.** |
| `menu translator` | 47 | **none of the six** | A different job (Google Translate 2nd). Forq's real shelf. Not ours. |

**"What to order" is the doc's own JTBD phrasing and it is the worst possible keyword.** The App
Store reads it as fast-food ordering. Keep it as copy; never as a keyword.

---

## Q3 — Spanish-language search

### The accent is a hard boundary

Accented and unaccented forms of the same Spanish query return **different result sets and different
result counts**:

| Query pair (MX) | n | Competitor hits |
|---|---:|---|
| `escanear menu` | 48 | *none* |
| `escanear menú` | 48 | Forq 18 |
| `calorias menu restaurante` | **22** | Forq **2** |
| `calorías menú restaurante` | **37** | MenuFit **1**, Forq 4, Menu Order AI 8 |

The API does not fold accents. Whether consumer App Store search does is **not measurable here** —
see the paid-tools list. Practical consequence: a Spanish keyword field probably has to carry both
forms, and accented characters cost **2 bytes each** in the 100-byte field.

### The territory is *not* open — and the app holding it is English-only

| Storefront | Query | 1st | Note |
|---|---|---|---|
| MX | `calorías menú restaurante` | **MenuFit** (1 of 37) | MenuFit ships **one language: English** |
| ES | `calorías menú restaurante` | **MenuFit** (1 of 38) | same |
| MX | `proteina restaurante` | **MenuFit** (1 of 40) | same |
| MX | `menú calorías` | MyFitnessPal (1 of 45) | Cal AI 2, MenuFit 9 |
| ES | `menú calorías` | MyRealFood-adjacent field; Cal AI 4, MenuFit 16 | |

**An English-only, single-localization app ranks first for the core Spanish nutrition query on both
Spanish-language storefronts.** This is the single most important Spanish finding, and it cuts
against the doc's segment table ("the only app that reads the menu in its own language"): Spanish
*search* is already served by an app that cannot read a Spanish menu. The opening is in the
**product**, not the search results — which is a harder pitch and a different marketing job.

### Where Spanish search really is empty

| Storefront | Query | n | Finding |
|---|---|---:|---|
| MX / ES | `comer fuera saludable` | **0** | Zero results on both. True void — but zero results is also evidence nobody optimizes for it, which usually means nobody searches it. |
| ES | `qué pedir restaurante` | **3** | iFood, Just Eat, then `WellMenu: Elige mejor al comer` (0r). Near-empty and delivery-poisoned, exactly like the English `what to order`. |
| ES | `escanear menú` | 48 | **None of the six appear.** Top: MyRealFood (22,013r), `Hungenie \| AI Qué Comer & Menú` (0r). |
| MX/ES | `alergenos menu` / `alérgenos menú` | 29 / 30 | Only Forq (ES, 13). Field is QR-menu builders and school-menu apps. Genuine gap. |

### Localized store names: the tactic, and how it is going

Forq localizes to `Forq: Traductor de Menús IA` in MX/ES and ranks **5 of 47** MX for
`traductor de menus`, **26 of 44** ES for `traductor de menús`. The tactic works for reach — and it
put Forq on the *translator* keyword instead of the *calorie* keyword. It bought traffic for a job
Forq monetizes worse.

Menu Order AI does the opposite and worse: its MX store name is **`GLP-1 Friendly Diet Food Meals`**
— an *English* string on the Mexican storefront, with the brand name deleted. It ranks 8 of 37 MX
for `calorías menú restaurante`. Localizing the name to a non-local language is the anti-pattern.

**Verdict on the tactic:** localize the store name, but localize it to the *nutrition* query, not
the *translation* query.

---

## Q4 — Draft title / subtitle / keyword field

Apple's real limits: **title 30 chars · subtitle 30 chars · keyword field 100 bytes** (commas, no
spaces). Apple indexes each word **once** across all three, and auto-combines words into phrases —
so never repeat a word, and never spend characters on a phrase Apple will assemble for you.

### English (US storefront)

| Field | Candidate | Count |
|---|---|---:|
| **Title** | `Menu Scan: Calories & Macros` | 28/30 |
| **Subtitle** | `Nutrition for eating out` | 24/30 |
| **Keywords** | `restaurant,order,allergen,protein,keto,carb,diet,dish,healthy,fit,counter,glp1,fitness` | 86/100 B |

Covers, by Apple's phrase assembly: *menu scan · menu scanner · menu calories · menu nutrition ·
restaurant calories · restaurant menu · eating out calories · healthy eating out · menu allergen ·
high protein restaurant · keto menu · glp1 menu*. Every one of those is a query measured above.

Alternative title if the brand is negotiable — **`Menu Scanner: Eat Out Healthy`** (29) — takes the
uncontested `menu scanner` head term and the incumbent's phrase directly, at the cost of the
"Scan" brand and of `calories`, which then has to move to the subtitle.

### Spanish (MX + ES storefronts — same metadata, both stores)

| Field | Candidate | Count |
|---|---|---:|
| **Title** | `Menú Scan: Calorías y Macros` | 28/30 chars |
| **Subtitle** | `Nutrición en el restaurante` | 27/30 |
| **Keywords** | `restaurante,carta,platillo,alergenos,dieta,proteina,comida,pedir,foto,escanear,keto,fit` | 87/100 B |

⚠️ **The Spanish title collides with a shipping app.** `Menú Scan: Contador Calorías` (H&F, MX)
already exists. Not a blocker — Apple permits it — but the brand will not be a distinguishing search
term on the Spanish storefronts. If that matters, `Escanea el Menú: Calorías` (25) is the
alternative that trades brand for the head query.

### What the limits force you to drop

| Dropped | Why it had to go |
|---|---|
| **"any language" / "bilingual"** | The strongest differentiator in the doc and it does not fit. Nobody searches "bilingual menu app" — this is **description and screenshot copy**, not indexed metadata. |
| **"goals" / "ranked" / "priority"** | Differentiator #2, "the output is a re-ordered menu" — the thing **nobody else has**. There is no measured query for it. It is a *conversion* asset (screenshot 1, first description line), not a discovery one. |
| **"price sort" and "saved profiles"** | Zero search demand evidence. Description only. |
| **Both accent forms of every Spanish keyword** | Accented chars cost 2 bytes; carrying `calorías`+`calorias`, `menú`+`menu`, `alérgenos`+`alergenos` would eat ~35 of 100 bytes on duplicates. The drafts pick **unaccented** in the keyword field on the assumption Apple folds — an assumption this method **cannot verify**. |
| **`what to order` / `qué pedir`** | Measured as delivery-app intent, not nutrition. Would burn characters on traffic that does not convert. |
| **"AI"** | 34 of 172 menu titles already use it. Zero differentiation, and `product-marketing.md` bans it as a headline anyway. |

### Two ASO moves that cost nothing and are not in the doc

1. **Take Food & Drink as the secondary category.** MenuFit, Cal AI and Menu Order AI all do. The
   doc frames H&F and F&D as either/or; Apple lets you have both.
2. **Screenshot captions have been indexed since June 2025.** That is where "any language" and
   "ranked by your goals" can carry search weight without spending title characters. A Spanish
   screenshot set is a separate indexed keyword surface per storefront.

---

## 🔴 What could not be measured — and would need a paid tool

**Prominently, because the strongest-sounding claims in this file are the ones I could not make.**

| Not measured | Why | What it would take |
|---|---|---|
| **Search volume for any term** | The iTunes Search API returns results, never demand. **Nothing in this file says a query is popular.** `menu scanner` having no incumbent may mean it is open or may mean nobody searches it — indistinguishable here. | AppTweak / Sensor Tower / Apple Search Ads keyword planner |
| **Actual App Store search ranking** | `itunes.apple.com/search` is the public Search API. Apple does not document it as the consumer search ranking, and it is not personalized, localized by device, or influenced by installs. Every position in this file is a **reproducible relevance proxy, not a rank.** | A rank tracker on real devices |
| **Whether consumer search folds Spanish accents** | The API demonstrably does not. The consumer store may. This changes the Spanish keyword field materially. | Rank tracking on the MX/ES storefronts |
| **Category chart position / browse traffic** | The one mechanism that could still justify the H&F decision is invisible to this method. | Sensor Tower, Appfigures |
| **Downloads, revenue, retention** | Never in any free API. | Sensor Tower / data.ai |
| **Competitors' actual keyword fields** | Hidden by Apple. Inferred here only from title, subtitle and observed rankings. | AppTweak keyword-field estimation |
| **Google Play** | No free search API. Whole platform unmeasured. | Manual sampling or a paid tool |

**DataForSEO is explicitly the wrong tool for all of the above** — it measures Google *web* SEO.
These are mobile apps competing in App Store search. Standing decision, unchanged by this run.

---

## Method & reproducibility

- **Script:** `docs/research/rank_sweep.py` — free iTunes Search API, no key, no cost, no signup.
  40 queries (15 US · 15 MX · 10 ES) × `entity=software` × `limit=50`.
- **Raw output:** `docs/research/raw/aso-2026-08-30/rank-results.json` (every result, with ordinal
  position, category and rating count) and `rank-summary.json`.
- **Listing fetches:** `docs/research/raw/aso-2026-08-30/listing-fetches.md` — 5 App Store pages,
  verbatim title/subtitle/category/description-opening.
- **Categories for the six:** re-read from the existing
  `docs/research/competitor-profiles/raw/<slug>/2026-08-30/itunes-*.json`.
- **Run date:** 2026-08-30. Everything above is a snapshot of that day.
- Fetched listing copy and descriptions are treated as untrusted third-party data.
