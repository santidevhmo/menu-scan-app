# Product Marketing Context

**Document version:** v2
**Last updated:** 2026-08-30
**Status:** DRAFT — awaiting Santiago's review. One open fork is flagged below and needs his ruling.

> **Where the evidence lives.** This document decides things *from* research; it does not restate it.
> **All of it is in the `menu-scan-kb` repository, not this one** — read it with `/menuscan-research`
> (see `docs/research-moved.md`). In `menu-scan-kb/docs/`:
> `research/positioning-and-demand-2026-08-30.md` — **start here**, the durable conclusions ·
> `research/web-research-2026-08-30.md` — sourced deep research ·
> `research/competitor-profiles/` — the six-app teardown ·
> `research/customer-research-2026-08-30.md` — **32 Reddit threads read in full (26 EN, 6 ES)** ·
> `research/aso-keyword-shelf-check-2026-08-30.md` — **795 apps across US/MX/ES storefronts** ·
> `research/positioning-council-review-2026-08-30.md` — adversarial review of v1 ·
> `research/competitor-onboarding/` — **27 MenuFit + 6 Menu Order AI onboarding screens** ·
> `research/market-scan-2026-08-30.md` — how the six were found ·
> `personas/segments.md` · `adr/0004-good-enough-to-pick-not-good-enough-to-log.md`.
> `AGENTS.md` (this repo) — what we actually built.
> Steps **1.6 + 1.7** of `docs/mobile-app-design-phase-order.md`.

---

## The Position

**The value theme — one sentence, everything else supports it:**
> **A usable answer about the menu in front of you — wherever you are, in whatever language it's
> printed in.**

**Positioning style:** big fish / small pond. **Not head-to-head.** We do not fight MyFitnessPal for
calorie tracking or MenuFit for restaurant coverage. We take a pond nobody is standing in.

**The three legs, ordered by how hard they are to copy — not by how obvious they are:**

| # | Leg | Role | Time to copy |
|---|---|---|---|
| 1 | **Bilingual menu parsing** (ES + EN, the menu's own words) | **the moat** | A data and eval program. Nobody has one. |
| 2 | **Reads the menu, not a database** | **the mechanism** | A prompt change for Cal AI. Weeks. |
| 3 | **Output is a re-ordered menu, not a number** | **the output form** | A sprint. |

*v1 listed these in the reverse order and led with the most copyable one. Corrected after the
council review.*

**One-liner (revised — see the note on the clock below):**
> Photograph any menu, in any language, and get it back in your order of priority.

⚠️ **v1's one-liner ended "before the server comes back." That is falsified.** Across 32 threads,
**zero** described being rushed by a server, and **4 explicitly plan the meal at home before leaving**:
*"I look at the menu in advance… I don't look at the menu when I am at the restaurant."* The anxiety
is real; the clock is not. **Product consequence:** camera-only input locks out the most disciplined
half of the target user. Photo-library import, already in `AGENTS.md`, is not a convenience — it is
a primary entry point.

---

## Product Overview

**What it does:**
You pick your nutritional goals and rank them. You photograph the restaurant's menu — or import a
photo you took at home. Menu Scan reads the menu itself, not a database of restaurants, estimates
macros and allergens per dish, and returns that same menu sorted by fit. Filters (ingredient
exclusions, calorie range, price) narrow it; results re-rank instantly with no second scan.

**Product category (the shelf):** **Health & Fitness primary, Food & Drink secondary.**

| The v1 claim | Verdict from 795 apps across 3 storefronts |
|---|---|
| List in Health & Fitness | ✅ **Supported** — H&F share rises with traction: 29% at 0 ratings → **75% in the ≥10-ratings band** |
| "Food & Drink is where nobody with nutrition intent searches" | ❌ **Contradicted** — F&D holds **129 of 359 top-10 slots (36%)** on nutrition-intent queries |
| "Forq's 1 rating is the wrong shelf" | ❌ **Unsupported** — Forq ranks **2nd of 22** for its core query on its home storefront and still has 1 rating. **MacroMenu sits in F&D with 117 ratings.** |

**Both, not either.** MenuFit, Cal AI and Menu Order AI all run H&F primary + F&D secondary. v1
framed this as a choice; it is a free slot.

**What we are NOT, and must never be marketed as:**

| Not this | Because |
|---|---|
| A calorie **logger** | We work before you eat. Logging is MyFitnessPal's job and a fight we lose. |
| A restaurant **database** | Coverage claims are exactly what breaks MenuFit. |
| A **plate**-photo app | Cal AI photographs food already ordered. Different job, different moment. |
| A **medical** or allergy-safety tool | Everything is an estimate. The disclaimer is mandatory and non-removable (`AGENTS.md`). |
| A **diet** app | No weight-loss promise, no meal plans, no coaching. |
| **Precise** | See the accuracy rule. Precision is the claim that gets us publicly disproved. |

**Product type:** Consumer mobile app (iOS + Android, Expo/React Native).

**Business model:** MVP ships **free, no paywall** (`AGENTS.md`). The price expectation we launch
into is set by Menu Order AI removing its paywall in June 2026 (unlimited free scans). Monetization
is a phase-4/5 decision owned by `pricing` / `paywalls`, informed by the 22 captured MenuFit
onboarding screens — not by this document.

---

## Target Audience

**Segments — revised against 32 threads. v1's four were inferred from competitor reviews; these
are inferred from people talking to each other.**

| Segment | Verdict vs v1 | Who | The value we promise |
|---|---|---|---|
| **Restriction-driven diner** — IBS, SIBO, celiac, GI | ⬆️ **Promoted to primary** | A wrong dish means being sick tonight, not a missed macro | Rule dishes out across the whole menu at once |
| **Goal-tracker who eats out** | ✅ Confirmed, **moment re-scoped** | Loudest voice by far — but the pain lands *after* the meal, and the committed ones pre-plan at home | The best-fitting dish on this menu, at the table or on the sofa |
| **Unfamiliar-menu diner** — travel, foreign language, unfamiliar cuisine | 🆕 **New, hypothesis** | *"Golden Thread Fat Cow."* A vegetarian served prawn broth at a Michelin restaurant | Tells you what the dish actually is, then how it fits |
| **Spanish-speaking diner** | ⚠️ **Downgraded** — see below | Menus genuinely never print calories | A language advantage inside the other segments |
| ~~GLP-1 user~~ | 🔀 **Merged** into restriction-driven | Identical language, identical behaviour | A symptom cluster, not a fourth audience |

⚠️ **On the restriction-driven promotion:** v1 said "allergies, keto, paleo." That was wrong. The
acute, emotional, genuinely *pre-order* population is **GI conditions**, and they are already
performing this product by hand.

⚠️ **On the Spanish downgrade — read this before acting on it.** Three findings pull in different
directions and they have not been reconciled by evidence:

| Finding | Source |
|---|---|
| Menus genuinely never print calories; **Chile has a live Jan 2026 bill** to require them | customer research (a dated proof point v1 lacked) |
| Spanish complaint volume is a fraction of English; vocabulary is *health* not *macros*; counting meets open hostility (*"el colmo de la flojera"*) | 6 Spanish threads |
| **MenuFit ranks 1st for `calorías menú restaurante` on both MX and ES — shipping English only** | ASO sweep |

**The synthesis: the Spanish opening is in the product, not in the search results, and not yet
proven in demand.** Bilingual stays the **moat** (hardest to copy) but is **not** established as the
**beachhead** (where demand is proven).

🔴 **Honest caveat, kept deliberately:** Reddit is a weak instrument for Spanish-speaking markets —
country subs are general-interest and fitness discussion is thin. *"Little Spanish complaint on
Reddit"* is evidence about **Reddit**, not proof the market is small. Closing this properly needs
Spanish App Store reviews of Fitia / MyRealFood / YAZIO on MX/ES/AR, or Spanish TikTok comments.

**Jobs to be done:**
- *"Tell me which of these dishes won't make me sick."*
- *"Tell me what this dish even is."* — **outdraws the macro job ~4×** (540 and 138 upvotes vs 1–25)
- *"Tell me which one fits what I'm doing."*

⚠️ **`what to order` is dead as a keyword** — 48 results, none of the six competitors, owned by Taco
Bell, Sonic and Panera. It is v1's own JTBD phrasing. Fine as an internal job; never as metadata.

---

## Problems & Pain Points

**Core problem:** the moment you need to know is the one moment nobody gives you an answer. Menus
mostly do not print calories, and outside US chains essentially never. Everything built so far works
either before you leave home (search a database) or after the plate arrives (photograph it).

⚠️ **v1 named the enemy as "guessing." That is wrong, and copy built on it will bounce.**
The status quo is competent, free, and takes about thirty seconds:

| The real status quo | Evidence |
|---|---|
| **The chain-swap** — log the independent's dish as its nearest chain equivalent | **8 of 32 threads**, top-voted answer in 4, stable 2017 → 2026: *"Went for a reuben at that new sandwich place? Log it as a denny's reuben."* |
| **Photograph the menu into ChatGPT** — free, works, and already the product | **6 of 32 threads**, accelerating: *"So I took a photo of the menu and asked chatgpt to tell me which option I could eat and I was quite surprised at how effective it was."* |
| **Deliberately over-estimate** | **7 of 32 threads** as a stated rule: *"take what it says… and double it"* · *"times it by 1.5"* |

**What it costs them:** for the goal-tracker, a meal that silently blows the day, repeatedly. For
the restriction-driven diner, **being ill tonight**. The second is the one people act on.

**Emotional tension:** not time pressure — that was v1's invention. It is **the cost of being wrong,
carried alone, in public, at a table with other people.**

---

## Competitive Landscape

**Indirect — and this is competitor #1, absent from v1 entirely:**
- **ChatGPT / Gemini, used manually.** Photograph the menu, ask which option fits. Free, already
  working, in **6 of 32 threads** and accelerating from 2023 → 2026. The objection is asked by name:
  Cal AI is *"mostly a fancy wrapper around the same underlying tech."* **We must have an answer to
  this on day one.** Ours: goals persist, filters persist, history persists, the ranking is
  reproducible, and the arithmetic is ours rather than the model's (`AGENTS.md`).
- **The chain-swap**, above. Free and competent.

**Direct (same mechanic):** FoodieFit (725 ratings, best framing, English-only) · Menu Order AI
(sharpest copy in the market, free unlimited scans, **0 Reddit results sitewide, ever**) · Forq
(closest feature list, 11 languages, 1 rating, findable and still ignored).

**Direct (the incumbent, different mechanic):** **MenuFit** — database lookup, English-only, hard
paywall before value, ~54k ratings from a **creator-led short-form video engine**, not the product.

**Secondary:** Cal AI (now MyFitnessPal), Carb Manager, YAZIO / Lifesum / Foodvisor — all log what
you already have.

**Two standing findings, neither to be re-derived:**
1. **Menu-photo OCR is genuine whitespace.** No app with traction is scan-first. This was wrong
   twice before landing; both errors came from auto-generated directory blurbs.
2. **Four of the six competitors have zero word-of-mouth.** Menu Order AI has *no Reddit results at
   all.* Sharp positioning did not buy them traction, and it will not buy us any either.

---

## Differentiation

**How we do it differently:** we read the menu rather than looking up a restaurant, and **the model
supplies knowledge while our code does the arithmetic** (`AGENTS.md`). That is a *mechanism*
statement and it makes no numeric claim — it is permitted in copy. *(v1 banned it. The ban on the
number and the ban on the mechanism had been wrongly merged.)*

**Supporting attributes** — these support the value theme; none of them is the position:

| Attribute | Who else has it | Public demand signal |
|---|---|---|
| Bilingual, keeps the menu's own words | Only Forq | Unmeasured — see the Spanish caveat |
| Reads the menu, not a database | The three tiny scan apps | Strong |
| Re-ordered menu, multi-goal, drag-to-prioritize | **Nobody** | **No measured search query.** Moves to screenshot captions, indexed since June 2025 |
| Ingredient exclusions across the whole menu | Only Forq | Strongest of any attribute — the GI segment |
| Saved profiles + searchable history | Nobody in the set | Unmeasured; the answer to "why not ChatGPT" |
| Price sorting | Only Forq | ⚠️ **2 upvotes. Total. In all of Reddit.** Keep it; never lead with it. |

⚠️ **We are not the only ones saying this.** `Menu Calories: Dining Tracker` (0 ratings, ranks 1st of
44 for `menu calories`) already publishes: *"Point your camera at any menu — local spots, any
country, any language. No restaurant database, no made-up dishes, honest estimates."* That is legs
1–2 plus the honesty stance, shipped. It does not falsify the wedge — they have no traction. It does
kill any copy claiming the ground is ours alone.

### 🔴 The accuracy rule — binding on every downstream skill

**Do not market an accuracy percentage. Not ours, not a comparison, not "more accurate than X."**
A community-run benchmark with **2,500 upvotes** exists and its conclusion is quotable against any
app in this category: *"This stuff doesn't work… The models always know what the food is. They just
can't tell how much is on the plate."* Any number we publish gets tested with a kitchen scale and
posted.

**But the stance is no longer "we're honest about estimates."** That has no *so*. The community
licensed a better one, and it is a reason to buy rather than a reason to forgive:

> **Good enough to pick. Not good enough to log.**
> *"If a ballpark number is all you need, or for meal suggestions like you're doing, then AI can work."*

**Why it holds:** we sell an **order**, not a number. A ranking survives a ~30% error that would
destroy an absolute value. Three independent sources reached this from three directions — the
council (*"you accepted the competitor's framing that the job is producing a number, then
apologised for the number"*), the literature, and the users themselves.

**Two product consequences, not marketing ones:**
1. **Ship a range biased high, not a point estimate.** 7 of 32 threads already do this by hand.
   **Nobody in 32 threads asked for more precision.**
2. **Still solicit the ingredient description** — it roughly halves the error (Chen et al. 2025),
   and it is what makes the ranking trustworthy even when we never show the number.

### ☠️ The failure mode that no confidence indicator protects against

MenuFit's one substantive Reddit thread is not about a wrong *number*. It is about a wrong
*recommendation* — the app suggested *"double cheeseburger and 6 piece McNugget. WTF?"* — and it
ran in a snark subreddit. **Our entire output is a recommendation.** That is precisely how this
product gets publicly ridiculed, and a confidence badge on a number does nothing about it.
Whatever guardrail answers this is a product decision that has not been made.

---

## Objections

| Objection | Response |
|---|---|
| **"Why not just ask ChatGPT?"** *(the #1 objection, missing from v1)* | You can, and it works once. It doesn't remember your goals, your exclusions or last month's scan, it re-asks you everything each time, and its arithmetic is a guess where ours is computed. |
| **"I already log it as the chain equivalent."** | That works when a chain equivalent exists. It doesn't at the independent, abroad, or on a menu in another language — which is most of the times you actually eat out. |
| *"How do I know the numbers are right?"* | You don't, and neither does any app here. **We're good enough to pick, not good enough to log** — and picking is what we do. A ranking tolerates an error that a calorie total can't. |
| *"Is it safe for my allergy?"* | No. It's an AI estimate and the app says so on every result screen with a filter active. Confirm with the restaurant. |
| *"Will it work on this menu?"* | Photograph as many pages as you need; there's no frame to line up. A menu in another language is the case we were built for. |
| *"Menu Order AI is free."* | It is, and it's English-only. MVP is free too; when we charge you'll have already seen it work. |

**Anti-personas:** people who want a food **diary** · anyone needing clinically reliable numbers
(severe allergy, insulin dosing, medical diets) · **restaurants** (B2B menu digitization — different
buyer, different product).
*v1 also listed "people who rarely eat out." Dropped — that's a non-user, not an anti-persona.*

---

## Switching Dynamics

| Force | What it is here |
|---|---|
| **Push** | The database has no menu for tonight's restaurant, or the wrong one. The paywall arrived before anything worked. Their language isn't supported. |
| **Pull** | It works on the menu in front of you, in your language, and hands back the menu itself, reordered. |
| **Habit** | ⚠️ **The chain-swap and ChatGPT — not "guessing."** Both are free, competent, and already habitual. This is the strongest force in the table and v1 misidentified it. |
| **Anxiety** | "Will it be nonsense?" · "Will it read *this* menu?" · "Will a free trial quietly charge me?" — quantified, including a Spanish-language billing complaint on the Mexican store. |

**The design consequence:** the habit is free and instant, so the first scan must be too. Anything
gating before the first working result fights the strongest force with the weakest hand — MenuFit's
most-reported complaint, now visible in all 22 captured onboarding screens.

---

## Customer Language

**Verbatim, from 32 threads read in full:**
- *"So I took a photo of the menu and asked chatgpt to tell me which option I could eat and I was quite surprised at how effective it was"*
- *"Went for a reuben at that new sandwich place? Log it as a denny's reuben."*
- *"take what it says or what I think it is and double it"*
- *"They just can't tell how much is on the plate."*
- *"I look at the menu in advance… I don't look at the menu when I am at the restaurant."*
- *"comer afuera sin que se me tape una arteria"* — the Spanish register is **health**, not macros
- *"double cheeseburger and 6 piece McNugget. WTF?"* — how a ranking gets ridiculed

**Words to use:** the menu in front of you · in your order of priority · good enough to pick ·
what's actually in it · any menu, any language · won't make me sick.

**Words to avoid:**

| Avoid | Why |
|---|---|
| Any accuracy % | A 2,500-upvote benchmark exists to disprove it |
| "guessing" as the enemy | The status quo is the chain-swap, and it works |
| "before the server comes back" | **Zero of 32 threads.** Half plan at home. |
| "precise", "exact" | Invites the one test we lose |
| "every restaurant in the world" | The incumbent's claim; publicly disproved |
| "calorie counter", "food diary", "log" | Puts us on MyFitnessPal's shelf |
| "safe for allergies" | Contradicts the mandatory disclaimer |
| "AI-powered" as a headline | Table stakes; every competitor says it |
| `what to order` in metadata | Dead query — owned by Taco Bell and Panera |

---

## Distinctive Assets

*New section — the council's finding was that we had none, and that in a winner-take-most category
built on short-form video, that is a bigger hole than any wording.*

| Asset | Status |
|---|---|
| **The re-sort motion** — the menu visibly reordering itself | **Nominated.** The one moment that is ours, filmable, and instantly legible with the sound off. |
| Verbal: *"Good enough to pick. Not good enough to log."* | Nominated |
| Colour / mark / mascot | None. Owed by `brandkit`. |

**The channel test is not "sayable in one line" — it is "showable in a repeatable format."**
MenuFit's engine was fast-food swaps repeated to exhaustion, not a tagline. ⚠️ **The tension to
solve:** our most differentiated leg (ranking) is the least filmable; our most filmable (scanning)
is the least differentiated. The re-sort motion is the proposed bridge.

---

## Proof Points

⚠️ **We have none. This section exists to stop a downstream skill inventing some.**
No users, downloads, ratings, testimonials, revenue or press.

| Available | Usable in marketing? |
|---|---|
| Internal extraction benchmark scores | ❌ **Never.** Internal, run-to-run variable, scored against our own oracle. |
| Category accuracy literature | ⚠️ As *category* context only, never as a claim about us |
| The 2,500-upvote community benchmark | ⚠️ Supports "good enough to pick"; never quoted as our result |
| Competitor weaknesses from public reviews | ✅ Quoted and attributed |
| Shipped feature facts (bilingual, exclusions, price, ranking) | ✅ Not performance claims |
| **Chile's Jan 2026 menu-labelling bill** | ✅ Dated, external, verifiable market context |

---

## Goals

**Business goal:** validate that scan-first, goal-ranked, bilingual menu reading pulls users the
database incumbent structurally cannot serve — before MyFitnessPal ships menu scanning into Cal AI.

**Key conversion action (pre-paywall):** **first completed scan with a goal set.**
**Secondary:** second scan within 7 days; a saved profile (the answer to "why not ChatGPT").

**Current metrics:** none. Pre-launch.

**Store metadata (drafts, from the ASO sweep — Apple's real limits):**
- **EN** — title `Menu Scan: Calories & Macros` (28/30) · subtitle `Nutrition for eating out` (24/30)
- **ES** — subtitle `Nutrición en el restaurante` (27/30) · ⚠️ the obvious ES title **collides with a
  shipping Mexican app**
- `menu scanner` retrieves menu apps; **`scan menu` retrieves QR readers.** Word order decides it.
- Spanish accents **do not fold** — `calorias` and `calorías` return different result sets.

---

## 🔀 THE OPEN FORK — Santiago's ruling needed

Everything above is settled by evidence. **This is not**, and the three reviews disagree:

| | **Option A — Bilingual beachhead** | **Option B — Restriction-driven beachhead** |
|---|---|---|
| **Argument** | It is the **hardest leg to copy**. A data and eval program, not a sprint. The council's explicit recommendation. | It is where demand is **proven and acute** — most emotional, genuinely pre-order, already doing this by hand. |
| **Against it** | Demand is **unmeasured**. MenuFit already ranks 1st in MX and ES search while shipping English only. Spanish complaint volume is thin. | It is the **easiest leg to copy** — an ingredient filter is a sprint for anyone. No moat. |
| **What it costs if wrong** | We localize into a market that wasn't asking | We win a niche someone larger takes |

**My recommendation: B to enter, A to defend.** Lead with the restriction-driven diner where the
pain is sharpest and the language is already written for us, and build the bilingual moat
underneath it — because the moat is what stops a competitor following us in. This is the one
reading where all three reviews are satisfied at once.

**Do not let a downstream skill resolve this by guessing.**

---

## Open Questions

| Question | Owner | Status |
|---|---|---|
| Is Spanish-market demand real, or a Reddit blind spot? | Spanish App Store reviews of Fitia/MyRealFood/YAZIO on MX/ES/AR; Spanish TikTok | **Open — gates the fork** |
| Search **volume** for any query | ⚠️ **Not measurable without a paid App Store keyword tool.** `menu scanner` having no incumbent may mean it's open or that nobody searches it — indistinguishable today. DataForSEO remains the **wrong** tool (Google web SEO). | Open, costed decision |
| What stops a bad recommendation becoming a snark-sub screenshot? | Product decision | **Open, unassigned** |
| Free-scan quota and paywall placement | `pricing` / `paywalls` | Post-MVP; 27 MenuFit screens now captured |
| Distinctive visual assets | `brandkit` | Not started |

---

## Changelog
*Newest first. One line per revision: what changed and why.*
- v2 (2026-08-30) — **Substantive repositioning after three parallel reviews** (32 Reddit threads,
  795-app ASO sweep, adversarial council). Added ChatGPT and the chain-swap as the real status quo,
  which v1 missed entirely; replaced "honest about estimates" with **"good enough to pick, not good
  enough to log"**; killed "before the server comes back" (0 of 32 threads); reordered the three legs
  by defensibility; merged GLP-1 into a promoted restriction-driven segment and downgraded Spanish
  from beachhead to moat; fixed the Health & Fitness reasoning (the conclusion held, the mechanism
  was false) and added F&D as a free secondary; added Distinctive Assets. Left one fork open for
  Santiago.
- v1 (2026-08-30) — Initial context. Positioning derived from the phase-1 market scan, six-app
  teardown, and sourced deep research: scan-first + goal-ranked + bilingual as the wedge, Health &
  Fitness as the shelf, and honesty-over-precision as the accuracy stance. Records a binding rule
  against marketing any accuracy number.
